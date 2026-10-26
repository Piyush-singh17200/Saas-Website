import dotenv from "dotenv";
import { Worker, type Job } from "bullmq";
import { QueueName } from "@workspace/contracts";
import { prisma } from "@workspace/database";
import { getWorkerRedisClient, closeWorkerRedis } from "./lib/redis.js";
import { logger } from "./lib/logger.js";
import { processNotificationJob } from "./processors/notification.processor.js";
import { processInvitationExpiryJob } from "./processors/invitation-expiry.processor.js";
import { processBillingReconciliationJob } from "./processors/billing-reconciliation.processor.js";
import { processCleanupJob } from "./processors/cleanup.processor.js";
import { processWebhookDeliveryJob } from "./processors/webhook.processor.js";

dotenv.config();

logger.info("Initializing WorkSpace Background Worker process...");

const redisClient = getWorkerRedisClient();

let isShuttingDown = false;
let processedJobsCount = 0;
let failedJobsCount = 0;
const startTime = Date.now();

// -----------------------------------------------------------------------------
// BullMQ Worker Instances
// -----------------------------------------------------------------------------
const workers: Worker[] = [];

function registerWorker<T>(
  name: string,
  processor: (job: Job<T>) => Promise<Record<string, unknown>>,
  concurrency = 3,
): Worker {
  const worker = new Worker(name, processor, {
    connection: redisClient as any,
    concurrency,
    limiter: {
      max: 50,
      duration: 1000,
    },
  });

  worker.on("completed", (job: Job) => {
    processedJobsCount += 1;
    logger.info(`Job completed: ${name}/${job.id}`, {
      queueName: name,
      jobId: job.id,
      jobType: job.name,
      durationMs:
        job.finishedOn && job.processedOn
          ? job.finishedOn - job.processedOn
          : undefined,
    });
  });

  worker.on("failed", (job: Job | undefined, err: Error) => {
    failedJobsCount += 1;
    logger.error(
      `Job failed: ${name}/${job?.id}`,
      {
        queueName: name,
        jobId: job?.id,
        jobType: job?.name,
        attemptsMade: job?.attemptsMade,
      },
      err,
    );
  });

  worker.on("error", (err: Error) => {
    logger.error(`Worker error on queue ${name}`, {}, err);
  });

  workers.push(worker);
  return worker;
}

// Instantiate queue workers
export const notificationWorker = registerWorker(
  QueueName.NOTIFICATIONS,
  processNotificationJob,
  5,
);
export const invitationWorker = registerWorker(
  QueueName.INVITATION_EXPIRY,
  processInvitationExpiryJob,
  2,
);
export const billingWorker = registerWorker(
  QueueName.BILLING_RECONCILIATION,
  processBillingReconciliationJob,
  2,
);
export const maintenanceWorker = registerWorker(
  QueueName.MAINTENANCE,
  processCleanupJob,
  1,
);
export const webhookWorker = registerWorker(
  QueueName.WEBHOOKS,
  processWebhookDeliveryJob,
  5,
);

logger.info("All background workers registered and listening for queue tasks", {
  activeQueues: [
    QueueName.NOTIFICATIONS,
    QueueName.INVITATION_EXPIRY,
    QueueName.BILLING_RECONCILIATION,
    QueueName.MAINTENANCE,
    QueueName.WEBHOOKS,
  ],
});

// -----------------------------------------------------------------------------
// Periodic Maintenance Scheduler (Runs within worker process)
// -----------------------------------------------------------------------------
let schedulerTimer: NodeJS.Timeout | null = null;

function startPeriodicTasks(): void {
  // Run periodic sweeps every 2 minutes
  schedulerTimer = setInterval(async () => {
    if (isShuttingDown) return;
    try {
      // Periodic invitation expiry sweep
      await processInvitationExpiryJob({
        id: "scheduled-invitation-sweep",
        data: { sweepOnly: true },
      } as any);
      // Periodic maintenance cleanup
      await processCleanupJob({
        id: "scheduled-maintenance",
        data: { retentionDays: 30, scope: "all" },
      } as any);
    } catch (err) {
      logger.error("Error during scheduled maintenance run", {}, err);
    }
  }, 120000);
}

startPeriodicTasks();

// -----------------------------------------------------------------------------
// Graceful Shutdown
// -----------------------------------------------------------------------------
export async function shutdownWorker(signal = "SIGTERM"): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(
    `Received ${signal}. Starting graceful shutdown of background workers...`,
    {
      processedJobsCount,
      failedJobsCount,
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    },
  );

  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }

  // Set bounded shutdown deadline
  const shutdownTimeout = setTimeout(() => {
    logger.error(
      "Worker shutdown deadline reached (10s). Forcing termination.",
    );
    process.exit(1);
  }, 10000).unref();

  try {
    // Stop workers from picking up new jobs and wait for in-flight jobs
    await Promise.all(workers.map((w) => w.close()));
    logger.info("All BullMQ worker queues closed cleanly.");

    // Close Redis connection
    await closeWorkerRedis();
    logger.info("Worker Redis connection closed.");

    // Disconnect Prisma
    await prisma.$disconnect();
    logger.info("Worker database connection disconnected.");

    clearTimeout(shutdownTimeout);
    logger.info("Worker shutdown completed successfully.");
    process.exit(0);
  } catch (err) {
    logger.error("Error during worker graceful shutdown", {}, err);
    process.exit(1);
  }
}

process.on("SIGTERM", () => void shutdownWorker("SIGTERM"));
process.on("SIGINT", () => void shutdownWorker("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection in worker process", {}, reason);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception in worker process", {}, error);
  void shutdownWorker("UNCAUGHT_EXCEPTION");
});

export { workers, processedJobsCount, failedJobsCount };
