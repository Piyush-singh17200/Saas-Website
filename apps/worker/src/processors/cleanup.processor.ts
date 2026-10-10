import { type Job, Queue } from "bullmq";
import { CleanupJobPayloadSchema, type CleanupJobPayload } from "@workspace/contracts";
import { withAdminBypassTransaction } from "@workspace/database";
import { getWorkerRedisClient } from "../lib/redis.js";
import { logger } from "../lib/logger.js";

export async function processCleanupJob(job: Job<CleanupJobPayload>): Promise<Record<string, unknown>> {
  const startTime = Date.now();
  const parseResult = CleanupJobPayloadSchema.safeParse(job.data || {});
  const payload: CleanupJobPayload = parseResult.success
    ? parseResult.data
    : { retentionDays: 30, scope: "all" };

  logger.info("Starting maintenance and cleanup job", {
    jobId: job.id,
    scope: payload.scope,
    retentionDays: payload.retentionDays,
    correlationId: payload.correlationId,
  });

  const now = new Date();
  const sessionRetentionDate = new Date(now.getTime() - payload.retentionDays * 24 * 60 * 60 * 1000);
  const outboxProcessedRetentionDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const webhookRetentionDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  let expiredSessionsCount = 0;
  let staleOutboxCount = 0;
  let redispatchedOutboxCount = 0;
  let staleWebhooksCount = 0;

  // Run cleanup operations with administrative bypass
  await withAdminBypassTransaction(async (tx) => {
    // 1. Ephemeral expired sessions beyond retention threshold
    if (payload.scope === "all" || payload.scope === "sessions") {
      const sessionResult = await tx.session.deleteMany({
        where: {
          OR: [
            { expiresAt: { lte: sessionRetentionDate } },
            { revokedAt: { not: null, lte: sessionRetentionDate } },
          ],
        },
      });
      expiredSessionsCount = sessionResult.count;
    }

    // 2. Processed outbox records older than 14 days
    if (payload.scope === "all" || payload.scope === "outbox") {
      const outboxResult = await (tx as any).outboxMessage.deleteMany({
        where: {
          status: "PROCESSED",
          processedAt: { lte: outboxProcessedRetentionDate },
        },
      });
      staleOutboxCount = outboxResult.count;

      // 3. Find stuck PENDING outbox messages (older than 30s) and re-dispatch them
      const stuckMessages = await (tx as any).outboxMessage.findMany({
        where: {
          status: "PENDING",
          createdAt: { lte: new Date(now.getTime() - 30 * 1000) },
          attempts: { lt: 5 },
        },
        take: 50,
      });

      if (stuckMessages.length > 0) {
        const client = getWorkerRedisClient();
        for (const msg of stuckMessages) {
          try {
            const queue = new Queue(msg.queueName, { connection: client as any });
            await queue.add(msg.jobName, msg.payload, {
              jobId: `outbox:${msg.idempotencyKey}`,
              attempts: 4,
            });
            await queue.close();

            await (tx as any).outboxMessage.update({
              where: { id: msg.id },
              data: {
                attempts: { increment: 1 },
                status: "DISPATCHED",
              },
            });
            redispatchedOutboxCount += 1;
          } catch (err) {
            await (tx as any).outboxMessage.update({
              where: { id: msg.id },
              data: {
                attempts: { increment: 1 },
                lastError: err instanceof Error ? err.message : "Outbox dispatch failed",
              },
            });
          }
        }
      }
    }

    // 4. Obsolete webhook records beyond 60 days
    if (payload.scope === "all") {
      const webhookResult = await tx.webhookEvent.deleteMany({
        where: {
          createdAt: { lte: webhookRetentionDate },
        },
      });
      staleWebhooksCount = webhookResult.count;
    }
  });

  const durationMs = Date.now() - startTime;
  logger.info("Maintenance cleanup completed", {
    jobId: job.id,
    expiredSessionsCount,
    staleOutboxCount,
    redispatchedOutboxCount,
    staleWebhooksCount,
    durationMs,
  });

  return {
    status: "completed",
    expiredSessionsCount,
    staleOutboxCount,
    redispatchedOutboxCount,
    staleWebhooksCount,
    durationMs,
  };
}
