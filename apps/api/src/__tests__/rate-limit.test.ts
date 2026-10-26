import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import {
  BoundedLruStore,
  failClosedGuard,
  getClientIp,
  createAuthRateLimiter,
} from "../middleware/rate-limit.middleware.js";
import * as redisModule from "../lib/redis.js";

describe("Rate Limiting & Resilience Policies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("BoundedLruStore (Memory-Bounded Fallback)", () => {
    it("increments hits and tracks count within the window", () => {
      const store = new BoundedLruStore(10);
      const res1 = store.increment("user:1", 60000);
      expect(res1.totalHits).toBe(1);

      const res2 = store.increment("user:1", 60000);
      expect(res2.totalHits).toBe(2);
    });

    it("evicts the least-recently-used entry when capacity is reached", () => {
      const store = new BoundedLruStore(3);
      store.increment("key:1", 60000);
      store.increment("key:2", 60000);
      store.increment("key:3", 60000);

      // Adding 4th key should evict key:1
      store.increment("key:4", 60000);

      // Re-incrementing key:1 should start fresh with count 1
      const res1Again = store.increment("key:1", 60000);
      expect(res1Again.totalHits).toBe(1);
    });
  });

  describe("Fail-Closed Policy on High-Risk Endpoints", () => {
    it("rejects request with 503 SERVICE_UNAVAILABLE when Redis is disconnected", async () => {
      vi.spyOn(redisModule, "isRedisClientConnected").mockReturnValue(false);

      const app = express();
      app.use(failClosedGuard);
      app.post("/auth/sensitive", (_req, res) => res.json({ ok: true }));

      const res = await request(app).post("/auth/sensitive");

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("SERVICE_UNAVAILABLE");
      expect(res.body.error.message).toContain(
        "Rate limiting service is unavailable",
      );
    });

    it("allows request through when Redis is connected and healthy", async () => {
      vi.spyOn(redisModule, "isRedisClientConnected").mockReturnValue(true);

      const app = express();
      app.use(failClosedGuard);
      app.post("/auth/sensitive", (_req, res) => res.json({ ok: true }));

      const res = await request(app).post("/auth/sensitive");

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe("Client IP and Proxy Verification", () => {
    it("derives client IP safely without blindly trusting headers when proxy is untrusted", () => {
      const mockReq: any = {
        socket: { remoteAddress: "192.168.1.50" },
        headers: { "x-forwarded-for": "10.0.0.1" },
      };

      const ip = getClientIp(mockReq);
      expect(ip).toBe("192.168.1.50");
    });
  });

  describe("Threshold Enforcement", () => {
    it("allows requests below limit and responds with 429 RATE_LIMITED when threshold is exceeded", async () => {
      const testLimiter = createAuthRateLimiter(2); // limit to 2
      const app = express();
      app.use(testLimiter);
      app.post("/test-limit", (_req, res) => res.json({ success: true }));

      const res1 = await request(app).post("/test-limit");
      expect(res1.status).toBe(200);

      const res2 = await request(app).post("/test-limit");
      expect(res2.status).toBe(200);

      // 3rd request should hit the 429 limit
      const res3 = await request(app).post("/test-limit");
      expect(res3.status).toBe(429);
      expect(res3.body.success).toBe(false);
      expect(res3.body.error.code).toBe("RATE_LIMITED");
    });
  });
});
