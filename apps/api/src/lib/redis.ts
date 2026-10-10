import { Redis } from "ioredis";
import RedisMock from "ioredis-mock";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

let redisClient: Redis | null = null;
let isConnected = false;

export function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  const useMock = env.USE_REDIS_MOCK || (env.NODE_ENV === "test" && !process.env.USE_REAL_REDIS);

  if (useMock) {
    logger.info("Initializing in-memory Redis client mock for testing/development");
    redisClient = new RedisMock() as unknown as Redis;
    isConnected = true;
    return redisClient;
  }

  const redisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy(times: number) {
      if (times > 10) {
        logger.warn("Redis retry attempts exceeded threshold", { attempts: times });
        return null;
      }
      return Math.min(times * 100, 3000);
    },
    reconnectOnError(err: Error) {
      const targetErrors = ["READONLY", "ETIMEDOUT", "ECONNRESET"];
      return targetErrors.some((target) => err.message.includes(target));
    },
  };

  const client = env.REDIS_URL
    ? new Redis(env.REDIS_URL, redisOptions)
    : new Redis({
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD,
        ...redisOptions,
      });

  client.on("connect", () => {
    isConnected = true;
    logger.info("Redis connected successfully");
  });

  client.on("ready", () => {
    isConnected = true;
  });

  client.on("error", (err: Error) => {
    isConnected = false;
    logger.warn("Redis connection error encountered", {}, err);
  });

  client.on("close", () => {
    isConnected = false;
  });

  // Attempt non-blocking initial connect
  client.connect().catch((err) => {
    isConnected = false;
    logger.warn("Initial Redis connection failed; operating with fallback policies", {}, err);
  });

  redisClient = client;
  return redisClient;
}

export function isRedisClientConnected(): boolean {
  return isConnected;
}

export interface RedisHealthResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export async function checkRedisConnection(): Promise<RedisHealthResult> {
  const start = Date.now();
  try {
    const client = getRedisClient();
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
      error: err instanceof Error ? err.message : "Redis connection failed",
    };
  }
}

export async function closeRedis(): Promise<void> {
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
