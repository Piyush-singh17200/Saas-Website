import dotenv from "dotenv";

dotenv.config();

console.log("[Worker] WorkSpace Background Worker initialized.");
console.log(`[Worker] Environment: ${process.env.NODE_ENV || "development"}`);
console.log(
  "[Worker] Worker runtime is running and listening for future job queues...",
);

let isRunning = true;

// Emulate a lightweight periodic heartbeat
const interval = setInterval(() => {
  if (isRunning) {
    // Keep alive log for diagnostic observability
  }
}, 30000);

async function handleShutdown(signal: string): Promise<void> {
  console.log(
    `[Worker] Received ${signal}. Shutting down worker gracefully...`,
  );
  isRunning = false;
  clearInterval(interval);
  console.log("[Worker] Worker terminated cleanly.");
  process.exit(0);
}

process.on("SIGTERM", () => void handleShutdown("SIGTERM"));
process.on("SIGINT", () => void handleShutdown("SIGINT"));
