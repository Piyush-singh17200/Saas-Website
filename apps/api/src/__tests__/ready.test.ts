import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import * as dbModule from "@workspace/database";
import * as redisModule from "../lib/redis.js";
import { createMockDatabaseHealth } from "@workspace/test-utils";

vi.mock("@workspace/database", async (importOriginal) => {
  const actual = await importOriginal<typeof dbModule>();
  return {
    ...actual,
    checkDatabaseConnection: vi.fn(),
  };
});

vi.mock("../lib/redis.js", async (importOriginal) => {
  const actual = await importOriginal<typeof redisModule>();
  return {
    ...actual,
    checkRedisConnection: vi.fn(),
  };
});

describe("GET /api/v1/ready", () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 OK and ready status when database and redis are connected", async () => {
    vi.mocked(dbModule.checkDatabaseConnection).mockResolvedValueOnce(
      createMockDatabaseHealth(true, 12),
    );
    vi.mocked(redisModule.checkRedisConnection).mockResolvedValueOnce({
      ok: true,
      latencyMs: 5,
    });

    const res = await request(app).get("/api/v1/ready");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("ready");
    expect(res.body.data.checks.database.status).toBe("connected");
    expect(res.body.data.checks.database.latencyMs).toBe(12);
    expect(res.body.data.checks.redis.status).toBe("connected");
  });

  it("returns 503 Service Unavailable and not_ready status when database fails", async () => {
    vi.mocked(dbModule.checkDatabaseConnection).mockResolvedValueOnce(
      createMockDatabaseHealth(false, 35, "Database connection timeout"),
    );
    vi.mocked(redisModule.checkRedisConnection).mockResolvedValueOnce({
      ok: true,
      latencyMs: 5,
    });

    const res = await request(app).get("/api/v1/ready");

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(res.body.error.details.status).toBe("not_ready");
    expect(res.body.error.details.checks.database.status).toBe("disconnected");
    expect(res.body.error.details.checks.database.message).toBe(
      "Database connection timeout",
    );
  });

  it("shields internal error messages when NODE_ENV is production", async () => {
    const { env } = await import("../config/env.js");
    const originalEnv = env.NODE_ENV;
    (env as any).NODE_ENV = "production";

    try {
      vi.mocked(dbModule.checkDatabaseConnection).mockResolvedValueOnce(
        createMockDatabaseHealth(
          false,
          35,
          "Connection refused at 10.0.1.45:5432",
        ),
      );
      vi.mocked(redisModule.checkRedisConnection).mockResolvedValueOnce({
        ok: false,
        latencyMs: 10,
        error: "Redis timeout at 10.0.1.99:6379",
      });

      const res = await request(app).get("/api/v1/ready");

      expect(res.status).toBe(503);
      expect(res.body.error.details.checks.database.message).toBe(
        "Database connectivity check failed",
      );
      expect(res.body.error.details.checks.redis.message).toBe(
        "Redis connectivity check failed",
      );
      expect(JSON.stringify(res.body)).not.toContain("10.0.1.45");
      expect(JSON.stringify(res.body)).not.toContain("10.0.1.99");
    } finally {
      (env as any).NODE_ENV = originalEnv;
    }
  });
});
