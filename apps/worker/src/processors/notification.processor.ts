import { type Job, UnrecoverableError } from "bullmq";
import {
  NotificationJobPayloadSchema,
  type NotificationJobPayload,
} from "@workspace/contracts";
import { withTenantTransaction, prisma } from "@workspace/database";
import { logger } from "../lib/logger.js";
import { emailProvider } from "../services/email.service.js";

export async function processNotificationJob(
  job: Job<NotificationJobPayload>,
): Promise<Record<string, unknown>> {
  const startTime = Date.now();
  logger.info("Processing notification job", {
    jobId: job.id,
    jobType: job.data.type,
    organizationId: job.data.organizationId,
    correlationId: job.data.correlationId,
  });

  // 1. Strict runtime payload validation
  const parseResult = NotificationJobPayloadSchema.safeParse(job.data);
  if (!parseResult.success) {
    logger.error("Permanent failure: Invalid notification job payload", {
      jobId: job.id,
      errors: parseResult.error.format(),
    });
    // Throw UnrecoverableError so BullMQ does not retry invalid payloads indefinitely
    throw new UnrecoverableError(
      `Invalid payload: ${parseResult.error.message}`,
    );
  }

  const payload = parseResult.data;

  // 2. Fetch and verify recipient identity before entering tenant transaction
  const recipient = await prisma.user.findUnique({
    where: { id: payload.recipientUserId },
    select: { id: true, email: true, displayName: true, status: true },
  });

  if (!recipient || recipient.status === "DISABLED") {
    logger.warn("Notification skipped: Recipient not found or disabled", {
      jobId: job.id,
      recipientUserId: payload.recipientUserId,
    });
    return { status: "skipped", reason: "recipient_ineligible" };
  }

  // 3. Strict Tenant Isolation Verification
  // For non-invitation notifications, verify that recipient is an active member of this organization
  if (payload.type !== "ORG_INVITATION") {
    const membership = await prisma.membership.findFirst({
      where: {
        organizationId: payload.organizationId,
        userId: payload.recipientUserId,
        status: "ACTIVE",
      },
    });

    if (!membership) {
      logger.warn(
        "Permanent failure: Recipient is not a member of target organization",
        {
          jobId: job.id,
          organizationId: payload.organizationId,
          recipientUserId: payload.recipientUserId,
        },
      );
      // Do not deliver private tenant data to non-members
      return { status: "rejected", reason: "recipient_not_member" };
    }
  }

  // 4. Scoped transaction under PostgreSQL RLS context
  return withTenantTransaction(payload.organizationId, async (tx) => {
    // Check domain-level idempotency
    const existing = await (tx as any).notification.findFirst({
      where: {
        organizationId: payload.organizationId,
        idempotencyKey: payload.idempotencyKey,
      },
    });

    if (existing) {
      logger.info(
        "Notification job skipped due to existing idempotency record",
        {
          jobId: job.id,
          notificationId: existing.id,
          idempotencyKey: payload.idempotencyKey,
        },
      );
      return { status: "idempotent_skip", notificationId: existing.id };
    }

    // Insert database notification
    const notification = await (tx as any).notification.create({
      data: {
        organizationId: payload.organizationId,
        userId: payload.recipientUserId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        metadata: (payload.metadata as any) || {},
        idempotencyKey: payload.idempotencyKey,
      },
    });

    // Deliver development-safe email notification
    await emailProvider.sendEmail({
      to: recipient.email,
      subject: payload.title,
      text: payload.body,
      metadata: {
        organizationId: payload.organizationId,
        notificationId: notification.id,
      },
    });

    // If there is an associated outbox message, mark it as PROCESSED
    await (tx as any).outboxMessage.updateMany({
      where: {
        organizationId: payload.organizationId,
        idempotencyKey: payload.idempotencyKey,
        status: "PENDING",
      },
      data: {
        status: "PROCESSED",
        processedAt: new Date(),
      },
    });

    const durationMs = Date.now() - startTime;
    logger.info("Notification job completed successfully", {
      jobId: job.id,
      notificationId: notification.id,
      durationMs,
    });

    return {
      status: "success",
      notificationId: notification.id,
      durationMs,
    };
  });
}
