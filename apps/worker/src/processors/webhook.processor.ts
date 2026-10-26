import crypto from "node:crypto";
import { type Job, UnrecoverableError } from "bullmq";
import {
  WebhookDeliveryJobPayloadSchema,
  type WebhookDeliveryJobPayload,
} from "@workspace/contracts";
import { prisma, withTenantTransaction } from "@workspace/database";
import { logger } from "../lib/logger.js";
import { sendSafeWebhookRequest } from "../lib/ssrf.js";

/**
 * Computes HMAC-SHA256 signature for a webhook payload envelope.
 */
function computeSignature(
  payloadString: string,
  secret: string,
  timestamp: number,
): string {
  const signedContent = `${timestamp}.${payloadString}`;
  return crypto
    .createHmac("sha256", secret)
    .update(signedContent)
    .digest("hex");
}

type WebhookDeliveryOutcome =
  | { status: "skipped"; reason: string }
  | { status: "success"; statusCode?: number; durationMs: number }
  | {
      status: "failed";
      errorMessage: string;
      statusCode?: number;
      durationMs: number;
      unrecoverable: boolean;
    };

export async function processWebhookDeliveryJob(
  job: Job<WebhookDeliveryJobPayload>,
): Promise<Record<string, unknown>> {
  const startTime = Date.now();

  // 1. Strict runtime payload validation
  const parseResult = WebhookDeliveryJobPayloadSchema.safeParse(job.data);
  if (!parseResult.success) {
    logger.error("Permanent failure: Invalid webhook job payload", {
      jobId: job.id,
      errors: parseResult.error.format(),
    });
    throw new UnrecoverableError(
      `Invalid payload: ${parseResult.error.message}`,
    );
  }

  const payload = parseResult.data;

  logger.info("Processing webhook delivery job", {
    jobId: job.id,
    subscriptionId: payload.subscriptionId,
    eventId: payload.event.id,
    eventType: payload.event.type,
    attempt: payload.attempt,
  });

  // 2. Load subscription and delivery record inside the tenant RLS context.
  const outcome = await withTenantTransaction<WebhookDeliveryOutcome>(
    payload.organizationId,
    async () => {
      const subscription = await prisma.webhookSubscription.findUnique({
        where: { id: payload.subscriptionId },
      });

      if (!subscription) {
        logger.warn("Webhook delivery skipped: Subscription not found", {
          subscriptionId: payload.subscriptionId,
          jobId: job.id,
        });
        return { status: "skipped", reason: "subscription_deleted" };
      }

      if (!subscription.isActive) {
        logger.info(
          "Webhook delivery skipped: Subscription is inactive/disabled",
          {
            subscriptionId: payload.subscriptionId,
            jobId: job.id,
          },
        );
        return { status: "skipped", reason: "subscription_inactive" };
      }

      // 3. Prepare payload and compute HMAC signature
      const timestamp = Math.floor(Date.now() / 1000);
      const payloadString = JSON.stringify(payload.event);
      const signature = computeSignature(
        payloadString,
        subscription.secret,
        timestamp,
      );

      const headers: Record<string, string> = {
        "WorkSpace-Signature": `t=${timestamp},v1=${signature}`,
        "WorkSpace-Event-Id": payload.event.id,
        "WorkSpace-Event-Type": payload.event.type,
      };

      // 4. Dispatch request with strict SSRF defense, timeouts, and bounded response parsing
      const dispatchResult = await sendSafeWebhookRequest({
        url: subscription.url,
        headers,
        body: payloadString,
        timeoutMs: 5000,
        maxResponseBytes: 65536,
      });

      const durationMs = Date.now() - startTime;

      // 5. Update delivery record
      if (payload.deliveryId) {
        try {
          await prisma.webhookDelivery.update({
            where: { id: payload.deliveryId },
            data: {
              status: dispatchResult.success ? "SUCCESS" : "FAILED",
              statusCode: dispatchResult.statusCode ?? null,
              durationMs,
              attemptCount: payload.attempt,
              errorMessage: dispatchResult.errorMessage ?? null,
            },
          });
        } catch (err) {
          logger.warn(
            "Failed to update webhook delivery record",
            { deliveryId: payload.deliveryId },
            err,
          );
        }
      }

      // 6. Handle failure vs success on subscription health
      if (dispatchResult.success) {
        // Reset consecutive failure counter on success
        if (subscription.consecutiveFailures > 0) {
          await prisma.webhookSubscription.update({
            where: { id: subscription.id },
            data: { consecutiveFailures: 0 },
          });
        }

        logger.info("Webhook delivered successfully", {
          subscriptionId: subscription.id,
          eventId: payload.event.id,
          durationMs,
          statusCode: dispatchResult.statusCode,
        });

        return {
          status: "success",
          statusCode: dispatchResult.statusCode,
          durationMs,
        };
      }

      // Failure Handling
      const newFailureCount = subscription.consecutiveFailures + 1;
      const shouldAutoDisable = newFailureCount >= 10;

      await prisma.webhookSubscription.update({
        where: { id: subscription.id },
        data: {
          consecutiveFailures: newFailureCount,
          isActive: shouldAutoDisable ? false : subscription.isActive,
        },
      });

      if (shouldAutoDisable) {
        logger.warn(
          "Webhook subscription automatically deactivated after 10 consecutive failures",
          {
            subscriptionId: subscription.id,
            url: subscription.url,
            consecutiveFailures: newFailureCount,
          },
        );
      }

      logger.warn("Webhook delivery failed", {
        subscriptionId: subscription.id,
        eventId: payload.event.id,
        attempt: payload.attempt,
        error: dispatchResult.errorMessage,
        statusCode: dispatchResult.statusCode,
      });

      // If this was an SSRF block or invalid destination error, do not retry.
      const unrecoverable =
        dispatchResult.errorMessage?.includes("Prohibited destination") ===
          true ||
        dispatchResult.errorMessage?.includes("must use HTTPS") === true;

      // Return the failed outcome so the transaction commits the delivery and
      // subscription health updates. The retry/terminal error is thrown only
      // after the transaction has committed; throwing inside would roll back
      // the failure state and cause every retry to start from stale data.
      return {
        status: "failed",
        errorMessage: dispatchResult.errorMessage || "Unknown error",
        statusCode: dispatchResult.statusCode,
        durationMs,
        unrecoverable,
      };
    },
  );

  if (outcome.status === "failed") {
    if (outcome.unrecoverable) {
      throw new UnrecoverableError(
        `Destination blocked for security: ${outcome.errorMessage}`,
      );
    }

    throw new Error(`Webhook dispatch failed: ${outcome.errorMessage}`);
  }

  return outcome;
}
