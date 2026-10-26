import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import type { Request, Response, NextFunction } from "express";
import { ErrorCode, createErrorResponse } from "@workspace/contracts";
import { getRedisClient, isRedisClientConnected } from "../lib/redis.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

/**
 * Bounded in-memory store for low-risk route fallbacks.
 * Enforces a strict maximum capacity with LRU eviction to prevent memory exhaustion.
 */
export class BoundedLruStore {
  private capacity: number;
  private store: Map<string, { count: number; resetTime: number }>;

  constructor(capacity = 500) {
    this.capacity = capacity;
    this.store = new Map();
  }

  public increment(
    key: string,
    windowMs: number,
  ): { totalHits: number; resetTime: Date } {
    const now = Date.now();
    let entry = this.store.get(key);

    if (!entry || entry.resetTime <= now) {
      // Evict oldest if at capacity
      if (this.store.size >= this.capacity) {
        const oldestKey = this.store.keys().next().value;
        if (oldestKey) this.store.delete(oldestKey);
      }
      entry = { count: 1, resetTime: now + windowMs };
    } else {
      entry.count += 1;
      // Refresh LRU order
      this.store.delete(key);
    }

    this.store.set(key, entry);
    return { totalHits: entry.count, resetTime: new Date(entry.resetTime) };
  }

  public reset(key: string): void {
    this.store.delete(key);
  }

  public clear(): void {
    this.store.clear();
  }
}

export const boundedFallback = new BoundedLruStore(500);

/**
 * Derives client IP according to configured proxy trust.
 * Only trusts X-Forwarded-For if TRUST_PROXY is explicitly enabled.
 */
export function getClientIp(req: Request): string {
  if (env.TRUST_PROXY) {
    return req.ip || req.socket.remoteAddress || "127.0.0.1";
  }
  return req.socket.remoteAddress || "127.0.0.1";
}

/**
 * Generates identity key based on authenticated user or validated client IP.
 */
function getRateLimitKey(req: Request, prefix: string): string {
  // If API key is authenticated on the request, scope by API key ID
  const apiKey = (req as any).apiKey;
  if (apiKey?.id) {
    return `${prefix}:key:${apiKey.id}`;
  }
  // If user is authenticated on the request, scope by user ID
  const userId = (req as any).user?.id;
  if (userId) {
    return `${prefix}:user:${userId}`;
  }
  return `${prefix}:ip:${getClientIp(req)}`;
}

/**
 * Creates standard 429 response payload
 */
function sendRateLimitResponse(
  req: Request,
  res: Response,
  message = "Too many requests. Please try again later.",
): void {
  const requestId = req.id || "unknown";
  res.status(429).json(
    createErrorResponse(
      {
        code: ErrorCode.RATE_LIMITED,
        message,
      },
      requestId,
    ),
  );
}

/**
 * Fails closed with 503 when Redis is unavailable on high-risk operations
 */
function sendServiceUnavailableResponse(req: Request, res: Response): void {
  const requestId = req.id || "unknown";
  res.status(503).json(
    createErrorResponse(
      {
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message:
          "Rate limiting service is unavailable. Sensitive operation rejected for security.",
      },
      requestId,
    ),
  );
}

/**
 * Helper to build Redis store with fallback / fail-closed behavior
 */
function createRateLimitStore(prefix: string) {
  const useMock =
    env.USE_REDIS_MOCK ||
    (env.NODE_ENV === "test" && !process.env.USE_REAL_REDIS);

  if (useMock) {
    return undefined; // Uses express-rate-limit memory store during tests/mock
  }

  const client = getRedisClient();
  return new RedisStore({
    sendCommand: (...args: string[]) =>
      (client as any).call(args[0], ...args.slice(1)),
    prefix: `rl:${prefix}:`,
  });
}

/**
 * Rate Limiter for Authentication and Session endpoints (/auth/login, /auth/register)
 * - Strict limits: 15 requests per 15 minutes (or 2000 during automated test runs)
 * - Fail-closed when Redis is unavailable to prevent brute-force attacks during outages
 */
export function createAuthRateLimiter(
  customLimit?: number,
): RateLimitRequestHandler {
  if (!env.RATE_LIMIT_ENABLED) {
    return ((_req: Request, _res: Response, next: NextFunction) =>
      next()) as RateLimitRequestHandler;
  }

  const store = createRateLimitStore("auth");
  const limit =
    customLimit ??
    (env.NODE_ENV === "test" && !process.env.TEST_RATE_LIMIT ? 2000 : 15);

  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) => getRateLimitKey(req, "auth"),
    store,
    passOnStoreError: false,
    handler: (req, res) => {
      logger.warn("Authentication rate limit exceeded", {
        ip: getClientIp(req),
        route: req.originalUrl,
      });
      sendRateLimitResponse(
        req,
        res,
        "Too many authentication attempts. Please try again later.",
      );
    },
  });
}

/**
 * Rate Limiter for abuse-prone operations (invitations, checkout sessions)
 * - Limit: 30 requests per 15 minutes (or 2000 during automated test runs)
 * - Fail-closed on Redis failure
 */
export function createAbuseRateLimiter(
  customLimit?: number,
): RateLimitRequestHandler {
  if (!env.RATE_LIMIT_ENABLED) {
    return ((_req: Request, _res: Response, next: NextFunction) =>
      next()) as RateLimitRequestHandler;
  }

  const store = createRateLimitStore("abuse");
  const limit =
    customLimit ??
    (env.NODE_ENV === "test" && !process.env.TEST_RATE_LIMIT ? 2000 : 30);

  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) => getRateLimitKey(req, "abuse"),
    store,
    passOnStoreError: false,
    handler: (req, res) => {
      logger.warn("Abuse-prone operation rate limit exceeded", {
        ip: getClientIp(req),
        route: req.originalUrl,
      });
      sendRateLimitResponse(
        req,
        res,
        "Too many requests for this operation. Please try again later.",
      );
    },
  });
}

/**
 * General authenticated API rate limiter
 * - Limit: 600 requests per 15 minutes per user/IP
 * - Bounded fallback when Redis is unavailable
 */
export function createGeneralRateLimiter(
  customLimit?: number,
): RateLimitRequestHandler {
  if (!env.RATE_LIMIT_ENABLED) {
    return ((_req: Request, _res: Response, next: NextFunction) =>
      next()) as RateLimitRequestHandler;
  }

  const store = createRateLimitStore("general");
  const limit =
    customLimit ??
    (env.NODE_ENV === "test" && !process.env.TEST_RATE_LIMIT ? 5000 : 600);

  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) => getRateLimitKey(req, "general"),
    store,
    passOnStoreError: true, // Allow fallback for low-risk traffic
    handler: (req, res) => {
      sendRateLimitResponse(req, res);
    },
  });
}

/**
 * Middleware that guards high-risk routes by verifying Redis health
 * If Redis is disconnected, it immediately rejects the request with 503 (Fail-Closed).
 */
export function failClosedGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!env.RATE_LIMIT_ENABLED) {
    return next();
  }

  if (!isRedisClientConnected()) {
    logger.warn(
      "High-risk route rejected because Redis is unavailable (Fail-Closed policy)",
      {
        route: req.originalUrl,
        ip: getClientIp(req),
      },
    );
    return sendServiceUnavailableResponse(req, res);
  }

  next();
}

export const authRateLimiter = createAuthRateLimiter();
export const abuseRateLimiter = createAbuseRateLimiter();
export const generalRateLimiter = createGeneralRateLimiter();

/**
 * Rate Limiter for Developer API and Webhook endpoints
 * - Standard limit: 1000 requests per 15 minutes per key/IP
 */
export function createDeveloperRateLimiter(
  customLimit?: number,
): RateLimitRequestHandler {
  if (!env.RATE_LIMIT_ENABLED) {
    return ((_req: Request, _res: Response, next: NextFunction) =>
      next()) as RateLimitRequestHandler;
  }

  const store = createRateLimitStore("developer");
  const limit =
    customLimit ??
    (env.NODE_ENV === "test" && !process.env.TEST_RATE_LIMIT ? 5000 : 1000);

  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) => getRateLimitKey(req, "developer"),
    store,
    passOnStoreError: true,
    handler: (req, res) => {
      sendRateLimitResponse(
        req,
        res,
        "Developer API rate limit exceeded. Please try again later.",
      );
    },
  });
}

export const developerRateLimiter = createDeveloperRateLimiter();
