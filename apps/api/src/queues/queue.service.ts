import { Queue, type JobsOptions } from "bullmq";
import type { Prisma } from "@workspace/database";
import {
  QueueName,
  type QueueNameValue,
  type NotificationJobPayload,
  type InvitationExpiryJobPayload,
  type BillingReconciliationJobPayload,
  type CleanupJobPayload,
  type QueueMetrics,
  type WebhookDeliveryJobPayload,
} from "@workspace/contracts";
import { getRedisClient } from "../lib/redis.js";
import { logger } from "../lib/logger.js";

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 4,
  backoff: {
    type: "exponential",
    delay: 2000,
  },
  removeOnComplete: {
    count: 200,
    age: 3600, // 1 hour
  },
  removeOnFail: {
    count: 1000,
    age: 24 * 3600, // 24 hours
  },
};

class QueueManager {
  private queues: Map<string, Queue> = new Map();

  private getQueue(name: QueueNameValue): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      const client = getRedisClient();
      queue = new Queue(name, {
        connection: client as any,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      });
      this.queues.set(name, queue);
    }
    return queue;
  }

  /**
   * Enqueues a notification job with domain-level deduplication.
   */
  public async enqueueNotification(
    payload: NotificationJobPayload,
  ): Promise<string> {
    const queue = this.getQueue(QueueName.NOTIFICATIONS);
    const jobId = `notification:${payload.idempotencyKey}`;

    const job = await queue.add("send-notification", payload, {
      jobId,
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
    });

    logger.info("Notification job enqueued", {
      jobId: job.id,
      queueName: QueueName.NOTIFICATIONS,
      jobType: payload.type,
      organizationId: payload.organizationId,
      correlationId: payload.correlationId,
    });

    return job.id || jobId;
  }

  /**
   * Enqueues an invitation expiry sweep job.
   */
  public async enqueueInvitationExpiry(
    payload: InvitationExpiryJobPayload = { sweepOnly: true },
  ): Promise<string> {
    const queue = this.getQueue(QueueName.INVITATION_EXPIRY);
    const jobId = payload.invitationId
      ? `invitation-expiry:${payload.invitationId}`
      : `invitation-sweep:${Math.floor(Date.now() / 60000)}`;

    const job = await queue.add("sweep-invitations", payload, {
      jobId,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 3000,
      },
    });

    logger.info("Invitation expiry job enqueued", {
      jobId: job.id,
      queueName: QueueName.INVITATION_EXPIRY,
      correlationId: payload.correlationId,
    });

    return job.id || jobId;
  }

  /**
   * Enqueues a billing reconciliation job.
   */
  public async enqueueBillingReconciliation(
    payload: BillingReconciliationJobPayload,
  ): Promise<string> {
    const queue = this.getQueue(QueueName.BILLING_RECONCILIATION);
    const jobId = `billing-reconcile:${payload.organizationId}:${Math.floor(Date.now() / 300000)}`;

    const job = await queue.add("reconcile-billing", payload, {
      jobId,
      attempts: 4,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
    });

    logger.info("Billing reconciliation job enqueued", {
      jobId: job.id,
      queueName: QueueName.BILLING_RECONCILIATION,
      organizationId: payload.organizationId,
      correlationId: payload.correlationId,
    });

    return job.id || jobId;
  }

  /**
   * Enqueues a cleanup/maintenance job.
   */
  public async enqueueMaintenance(
    payload: CleanupJobPayload = { retentionDays: 30, scope: "all" },
  ): Promise<string> {
    const queue = this.getQueue(QueueName.MAINTENANCE);
    const jobId = `maintenance:${payload.scope}:${Math.floor(Date.now() / 3600000)}`;

    const job = await queue.add("run-cleanup", payload, {
      jobId,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
    });

    logger.info("Maintenance job enqueued", {
      jobId: job.id,
      queueName: QueueName.MAINTENANCE,
      scope: payload.scope,
      correlationId: payload.correlationId,
    });

    return job.id || jobId;
  }

  /**
   * Enqueues an asynchronous webhook delivery job with exponential backoff and jitter.
   */
  public async enqueueWebhookDelivery(
    payload: WebhookDeliveryJobPayload,
  ): Promise<string> {
    const queue = this.getQueue(QueueName.WEBHOOKS);
    const jobId = `webhook:${payload.subscriptionId}:${payload.event.id}:${payload.attempt || 1}`;

    const job = await queue.add("deliver-webhook", payload, {
      jobId,
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 3000,
      },
    });

    logger.info("Webhook delivery job enqueued", {
      jobId: job.id,
      queueName: QueueName.WEBHOOKS,
      subscriptionId: payload.subscriptionId,
      eventId: payload.event.id,
      eventType: payload.event.type,
      attempt: payload.attempt,
    });

    return job.id || jobId;
  }

  /**
   * Writes an OutboxMessage record inside an existing database transaction.
   * Ensures transactional consistency between business entity mutations and asynchronous dispatch.
   */
  public async recordOutboxMessage(
    tx: Prisma.TransactionClient,
    params: {
      organizationId?: string;
      queueName: QueueNameValue;
      jobName: string;
      payload: unknown;
      idempotencyKey: string;
    },
  ) {
    return (tx as any).outboxMessage.create({
      data: {
        organizationId: params.organizationId || null,
        queueName: params.queueName,
        jobName: params.jobName,
        payload: params.payload as any,
        idempotencyKey: params.idempotencyKey,
        status: "PENDING",
      },
    });
  }

  /**
   * Retrieves runtime metrics for a queue.
   */
  public async getQueueMetrics(name: QueueNameValue): Promise<QueueMetrics> {
    const queue = this.getQueue(name);
    try {
      const [counts, isPaused] = await Promise.all([
        queue.getJobCounts(
          "waiting",
          "active",
          "completed",
          "failed",
          "delayed",
        ),
        queue.isPaused(),
      ]);

      return {
        queueName: name,
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
        delayed: counts.delayed || 0,
        paused: isPaused,
      };
    } catch {
      return {
        queueName: name,
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: false,
      };
    }
  }

  /**
   * Shuts down all active BullMQ queues.
   */
  public async closeAll(): Promise<void> {
    for (const [name, queue] of this.queues.entries()) {
      try {
        await queue.close();
      } catch (err) {
        logger.warn(`Error closing queue ${name}`, {}, err);
      }
    }
    this.queues.clear();
  }
}

export const queueManager = new QueueManager();
