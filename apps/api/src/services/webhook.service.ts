import crypto from "node:crypto";
import { prisma, withDetachedTenantTransaction } from "@workspace/database";
import {
  type CreateWebhookSubscriptionInput,
  type CreateWebhookSubscriptionResult,
  type UpdateWebhookSubscriptionInput,
  type WebhookSubscriptionResponse,
  type RotateWebhookSecretResult,
  type WebhookDeliveryResponse,
  type WebhookDeliveryListQuery,
  type WebhookEventEnvelope,
  WebhookEventType,
  ErrorCode,
} from "@workspace/contracts";
import { AppError } from "../middleware/error-handler.js";
import { validateWebhookDestination } from "../lib/ssrf.js";
import { queueManager } from "../queues/queue.service.js";
import { logger } from "../lib/logger.js";

const SIGNING_SECRET_PREFIX = "whsec_";

/**
 * Generates an HMAC signing secret for a webhook subscription.
 */
function generateSigningSecret(): string {
  return `${SIGNING_SECRET_PREFIX}${crypto.randomBytes(24).toString("hex")}`;
}

/**
 * Computes HMAC-SHA256 signature for a webhook payload envelope.
 */
export function computeWebhookSignature(
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

/**
 * Helper to verify an incoming webhook signature using constant-time comparison.
 * Useful for consumers and verification testing.
 */
export function verifyWebhookSignature(
  rawPayload: string,
  headerValue: string,
  secret: string,
  toleranceSeconds = 300,
): boolean {
  try {
    const parts = headerValue.split(",").reduce(
      (acc, curr) => {
        const [k, v] = curr.split("=");
        if (k && v) acc[k.trim()] = v.trim();
        return acc;
      },
      {} as Record<string, string>,
    );

    const timestampStr = parts["t"];
    const candidateSig = parts["v1"];

    if (!timestampStr || !candidateSig) {
      return false;
    }

    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) {
      return false;
    }

    // Check timestamp tolerance
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
      return false;
    }

    const expectedSig = computeWebhookSignature(rawPayload, secret, timestamp);

    const candidateBuf = Buffer.from(candidateSig, "utf8");
    const expectedBuf = Buffer.from(expectedSig, "utf8");

    if (candidateBuf.length !== expectedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(candidateBuf, expectedBuf);
  } catch {
    return false;
  }
}

/**
 * Creates a new webhook subscription.
 * Validates destination URL against SSRF before creating.
 * Signing secret is returned ONCE.
 */
export async function createWebhookSubscription(
  organizationId: string,
  userId: string,
  input: CreateWebhookSubscriptionInput,
): Promise<CreateWebhookSubscriptionResult> {
  // 1. SSRF validation on destination URL
  await validateWebhookDestination(input.url);

  // 2. Generate signing secret
  const secret = generateSigningSecret();

  // 3. Persist record
  const record = await prisma.webhookSubscription.create({
    data: {
      organizationId,
      createdById: userId,
      url: input.url,
      description: input.description,
      secret,
      eventTypes: input.eventTypes,
    },
    include: {
      createdBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
    },
  });

  logger.info("Webhook subscription created", {
    organizationId,
    subscriptionId: record.id,
    url: record.url,
    eventTypes: record.eventTypes,
  });

  return {
    subscription: {
      id: record.id,
      organizationId: record.organizationId,
      url: record.url,
      description: record.description,
      eventTypes: record.eventTypes,
      isActive: record.isActive,
      consecutiveFailures: record.consecutiveFailures,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      createdBy: record.createdBy,
    },
    secret, // Returned strictly once
  };
}

/**
 * Lists webhook subscriptions for an organization.
 * Never includes secrets.
 */
export async function listWebhookSubscriptions(
  organizationId: string,
): Promise<WebhookSubscriptionResponse[]> {
  const records = await prisma.webhookSubscription.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
    },
  });

  return records.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    url: r.url,
    description: r.description,
    eventTypes: r.eventTypes,
    isActive: r.isActive,
    consecutiveFailures: r.consecutiveFailures,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy,
  }));
}

/**
 * Updates a webhook subscription.
 */
export async function updateWebhookSubscription(
  organizationId: string,
  subscriptionId: string,
  input: UpdateWebhookSubscriptionInput,
): Promise<WebhookSubscriptionResponse> {
  const existing = await prisma.webhookSubscription.findFirst({
    where: { id: subscriptionId, organizationId },
  });

  if (!existing) {
    throw new AppError(
      "Webhook subscription not found",
      404,
      ErrorCode.NOT_FOUND,
    );
  }

  // If URL is updated, re-validate SSRF
  if (input.url && input.url !== existing.url) {
    await validateWebhookDestination(input.url);
  }

  const updated = await prisma.webhookSubscription.update({
    where: { id: subscriptionId },
    data: {
      url: input.url,
      description: input.description,
      eventTypes: input.eventTypes,
      isActive: input.isActive,
      // If user reactivated subscription, reset consecutive failures
      consecutiveFailures: input.isActive === true ? 0 : undefined,
    },
    include: {
      createdBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
    },
  });

  return {
    id: updated.id,
    organizationId: updated.organizationId,
    url: updated.url,
    description: updated.description,
    eventTypes: updated.eventTypes,
    isActive: updated.isActive,
    consecutiveFailures: updated.consecutiveFailures,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
    createdBy: updated.createdBy,
  };
}

/**
 * Rotates the signing secret for a webhook subscription.
 * Returns the newly generated secret once.
 */
export async function rotateWebhookSecret(
  organizationId: string,
  subscriptionId: string,
): Promise<RotateWebhookSecretResult> {
  const existing = await prisma.webhookSubscription.findFirst({
    where: { id: subscriptionId, organizationId },
    include: {
      createdBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
    },
  });

  if (!existing) {
    throw new AppError(
      "Webhook subscription not found",
      404,
      ErrorCode.NOT_FOUND,
    );
  }

  const newSecret = generateSigningSecret();

  const updated = await prisma.webhookSubscription.update({
    where: { id: subscriptionId },
    data: { secret: newSecret },
    include: {
      createdBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
    },
  });

  logger.info("Webhook secret rotated", {
    organizationId,
    subscriptionId,
  });

  return {
    subscription: {
      id: updated.id,
      organizationId: updated.organizationId,
      url: updated.url,
      description: updated.description,
      eventTypes: updated.eventTypes,
      isActive: updated.isActive,
      consecutiveFailures: updated.consecutiveFailures,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      createdBy: updated.createdBy,
    },
    secret: newSecret,
  };
}

/**
 * Deletes a webhook subscription.
 */
export async function deleteWebhookSubscription(
  organizationId: string,
  subscriptionId: string,
): Promise<void> {
  const existing = await prisma.webhookSubscription.findFirst({
    where: { id: subscriptionId, organizationId },
  });

  if (!existing) {
    throw new AppError(
      "Webhook subscription not found",
      404,
      ErrorCode.NOT_FOUND,
    );
  }

  await prisma.webhookSubscription.delete({
    where: { id: subscriptionId },
  });

  logger.info("Webhook subscription deleted", {
    organizationId,
    subscriptionId,
  });
}

/**
 * Dispatches an event to all matching active webhook subscriptions.
 * Enqueues delivery jobs to BullMQ.
 */
export async function dispatchWebhookEvent(
  organizationId: string,
  eventType: string,
  resourceId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  // This is intentionally invoked without awaiting from request handlers. Use
  // a detached tenant transaction so the dispatch cannot race the request
  // transaction's commit/close while still being constrained by RLS.
  return withDetachedTenantTransaction(organizationId, async () => {
    // Find all active subscriptions for this tenant
    const subscriptions = await prisma.webhookSubscription.findMany({
      where: {
        organizationId,
        isActive: true,
      },
    });

    if (subscriptions.length === 0) {
      return;
    }

    // Filter subscriptions matching the event type (or wildcard)
    const matching = subscriptions.filter(
      (sub) =>
        sub.eventTypes.includes("*") || sub.eventTypes.includes(eventType),
    );

    if (matching.length === 0) {
      return;
    }

    const event: WebhookEventEnvelope = {
      id: crypto.randomUUID(),
      type: eventType,
      version: "2026-10-11",
      createdAt: new Date().toISOString(),
      organizationId,
      resourceId,
      payload,
    };

    // For each matching subscription, record delivery record and enqueue delivery job
    for (const sub of matching) {
      try {
        const delivery = await prisma.webhookDelivery.create({
          data: {
            subscriptionId: sub.id,
            organizationId,
            eventId: event.id,
            eventType: event.type,
            payload: event as any,
            status: "PENDING",
            attemptCount: 1,
          },
        });

        await queueManager.enqueueWebhookDelivery({
          deliveryId: delivery.id,
          subscriptionId: sub.id,
          organizationId,
          event,
          attempt: 1,
        });
      } catch (err) {
        logger.error(
          "Failed to enqueue webhook delivery",
          {
            organizationId,
            subscriptionId: sub.id,
            eventType,
          },
          err,
        );
      }
    }
  });
}

/**
 * Sends a test ping event to a webhook subscription.
 */
export async function triggerWebhookPing(
  organizationId: string,
  subscriptionId: string,
): Promise<{ deliveryId: string; eventId: string }> {
  const sub = await prisma.webhookSubscription.findFirst({
    where: { id: subscriptionId, organizationId },
  });

  if (!sub) {
    throw new AppError(
      "Webhook subscription not found",
      404,
      ErrorCode.NOT_FOUND,
    );
  }

  const event: WebhookEventEnvelope = {
    id: crypto.randomUUID(),
    type: WebhookEventType.PING,
    version: "2026-10-11",
    createdAt: new Date().toISOString(),
    organizationId,
    resourceId: sub.id,
    payload: {
      message: "WorkSpace developer platform ping event",
      url: sub.url,
      timestamp: new Date().toISOString(),
    },
  };

  const delivery = await prisma.webhookDelivery.create({
    data: {
      subscriptionId: sub.id,
      organizationId,
      eventId: event.id,
      eventType: event.type,
      payload: event as any,
      status: "PENDING",
      attemptCount: 1,
    },
  });

  await queueManager.enqueueWebhookDelivery({
    deliveryId: delivery.id,
    subscriptionId: sub.id,
    organizationId,
    event,
    attempt: 1,
  });

  return { deliveryId: delivery.id, eventId: event.id };
}

/**
 * Lists webhook deliveries for an organization with filtering and pagination.
 */
export async function listWebhookDeliveries(
  organizationId: string,
  query: WebhookDeliveryListQuery,
): Promise<{
  deliveries: WebhookDeliveryResponse[];
  total: number;
  page: number;
  limit: number;
}> {
  const where: any = { organizationId };

  if (query.subscriptionId) {
    where.subscriptionId = query.subscriptionId;
  }
  if (query.status) {
    where.status = query.status;
  }
  if (query.eventType) {
    where.eventType = query.eventType;
  }

  const skip = (query.page - 1) * query.limit;

  const [total, records] = await Promise.all([
    prisma.webhookDelivery.count({ where }),
    prisma.webhookDelivery.findMany({
      where,
      skip,
      take: query.limit,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const deliveries: WebhookDeliveryResponse[] = records.map((d) => ({
    id: d.id,
    subscriptionId: d.subscriptionId,
    organizationId: d.organizationId,
    eventId: d.eventId,
    eventType: d.eventType,
    payload: d.payload as Record<string, unknown>,
    status: d.status as any,
    statusCode: d.statusCode,
    attemptCount: d.attemptCount,
    durationMs: d.durationMs,
    errorMessage: d.errorMessage,
    createdAt: d.createdAt.toISOString(),
  }));

  return {
    deliveries,
    total,
    page: query.page,
    limit: query.limit,
  };
}

/**
 * Manually retries a webhook delivery.
 */
export async function retryWebhookDelivery(
  organizationId: string,
  subscriptionId: string,
  deliveryId: string,
): Promise<WebhookDeliveryResponse> {
  const delivery = await prisma.webhookDelivery.findFirst({
    where: {
      id: deliveryId,
      subscriptionId,
      organizationId,
    },
  });

  if (!delivery) {
    throw new AppError("Webhook delivery not found", 404, ErrorCode.NOT_FOUND);
  }

  // Update status to PENDING and increment attempt count
  const updated = await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      status: "PENDING",
      attemptCount: delivery.attemptCount + 1,
      errorMessage: null,
    },
  });

  await queueManager.enqueueWebhookDelivery({
    deliveryId: delivery.id,
    subscriptionId,
    organizationId,
    event: delivery.payload as any,
    attempt: updated.attemptCount,
  });

  return {
    id: updated.id,
    subscriptionId: updated.subscriptionId,
    organizationId: updated.organizationId,
    eventId: updated.eventId,
    eventType: updated.eventType,
    payload: updated.payload as Record<string, unknown>,
    status: updated.status as any,
    statusCode: updated.statusCode,
    attemptCount: updated.attemptCount,
    durationMs: updated.durationMs,
    errorMessage: updated.errorMessage,
    createdAt: updated.createdAt.toISOString(),
  };
}
