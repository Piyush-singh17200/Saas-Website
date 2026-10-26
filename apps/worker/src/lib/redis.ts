import { Redis } from "ioredis";
import { logger } from "./logger.js";

let redisClient: Redis | null = null;
let isConnected = false;

export function getWorkerRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  const useMock =
    process.env.USE_REDIS_MOCK === "true" ||
    (process.env.NODE_ENV === "test" && !process.env.USE_REAL_REDIS);

  if (useMock) {
    logger.info(
      "Initializing in-memory Redis client mock for background worker",
    );
    const RedisMock = require("ioredis-mock") as typeof import("ioredis-mock").default;
    redisClient = new RedisMock() as unknown as Redis;
    isConnected = true;
    return redisClient;
  }

  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy(times: number) {
      if (times > 10) {
        logger.warn("Worker Redis retry threshold exceeded", {
          attempts: times,
        });
        return null;
      }
      return Math.min(times * 100, 3000);
    },
  });

  client.on("connect", () => {
    isConnected = true;
    logger.info("Worker Redis connected successfully");
  });

  client.on("ready", () => {
    isConnected = true;
  });

  client.on("error", (err: Error) => {
    isConnected = false;
    logger.warn("Worker Redis error encountered", {}, err);
  });

  client.on("close", () => {
    isConnected = false;
  });

  client.connect().catch((err) => {
    isConnected = false;
    logger.warn("Worker initial Redis connect failed", {}, err);
  });

  redisClient = client;
  return redisClient;
}

export function isWorkerRedisConnected(): boolean {
  return isConnected;
}

export interface WorkerRedisHealthResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export async function checkWorkerRedisConnection(): Promise<WorkerRedisHealthResult> {
  const start = Date.now();
  try {
    const client = getWorkerRedisClient();
    const pong = await client.ping();
    if (pong === "PONG") {
      isConnected = true;
      return {
        ok: true,
        latencyMs: Date.now() - start,
      };
    }
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: `Unexpected ping response: ${pong}`,
    };
  } catch (err) {
    isConnected = false;
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error:
        err instanceof Error ? err.message : "Worker Redis connection failed",
    };
  }
}

export async function closeWorkerRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      redisClient.disconnect();
    } finally {
      redisClient = null;
      isConnected = false;
    }
  }
}
