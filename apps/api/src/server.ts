import type { Server } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "@workspace/database";
import { closeRedis } from "./lib/redis.js";
import { queueManager } from "./queues/queue.service.js";
import { logger } from "./lib/logger.js";

const app = createApp();

const server: Server = app.listen(env.PORT, () => {
  logger.info(
    `WorkSpace API server running in ${env.NODE_ENV} mode on port ${env.PORT}`,
    {
      port: env.PORT,
      environment: env.NODE_ENV,
    },
  );
});

let isShuttingDown = false;

async function handleShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Received ${signal}. Initiating graceful shutdown...`);

  // Stop accepting new connections
  server.close(async (err) => {
    if (err) {
      logger.error("Error closing HTTP server", {}, err);
      process.exit(1);
    }

    try {
      logger.info("Closing active queue producers...");
      await queueManager.closeAll();

      logger.info("Closing Redis connection...");
      await closeRedis();

      logger.info("Disconnecting from database...");
      await prisma.$disconnect();

      logger.info("Graceful shutdown completed cleanly.");
      process.exit(0);
    } catch (shutdownErr) {
      logger.error("Error during server shutdown teardown", {}, shutdownErr);
      process.exit(1);
    }
  });

  // Force close after 10 seconds if graceful shutdown hangs
  setTimeout(() => {
    logger.error("Graceful shutdown timed out. Forcing termination.");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGTERM", () => void handleShutdown("SIGTERM"));
process.on("SIGINT", () => void handleShutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Promise Rejection in API process", {}, reason);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception in API process", {}, error);
  process.exit(1);
});
