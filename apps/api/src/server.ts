import type { Server } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "@workspace/database";

const app = createApp();

const server: Server = app.listen(env.PORT, () => {
  console.log(
    `[API] WorkSpace API server running in ${env.NODE_ENV} mode on port ${env.PORT}`,
  );
  console.log(
    `[API] Health check available at: http://localhost:${env.PORT}/api/v1/health`,
  );
  console.log(
    `[API] Readiness check available at: http://localhost:${env.PORT}/api/v1/ready`,
  );
});

let isShuttingDown = false;

async function handleShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[API] Received ${signal}. Initiating graceful shutdown...`);

  // Stop accepting new connections
  server.close(async (err) => {
    if (err) {
      console.error("[API] Error closing HTTP server:", err);
      process.exit(1);
    }

    try {
      console.log("[API] Disconnecting from database...");
      await prisma.$disconnect();
      console.log("[API] Graceful shutdown completed cleanly.");
      process.exit(0);
    } catch (dbErr) {
      console.error("[API] Error during database disconnection:", dbErr);
      process.exit(1);
    }
  });

  // Force close after 10 seconds if graceful shutdown hangs
  setTimeout(() => {
    console.error("[API] Graceful shutdown timed out. Forcing termination.");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGTERM", () => void handleShutdown("SIGTERM"));
process.on("SIGINT", () => void handleShutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  console.error("[API] Unhandled Promise Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[API] Uncaught Exception:", error);
  process.exit(1);
});
