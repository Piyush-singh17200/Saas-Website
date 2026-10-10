import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import * as dbModule from "@workspace/database";
import { createMockDatabaseHealth } from "@workspace/test-utils";

vi.mock("@workspace/database", async (importOriginal) => {
  const actual = await importOriginal<typeof dbModule>();
  return {
    ...actual,
    checkDatabaseConnection: vi.fn(),
  };
});

describe("GET /api/v1/ready", () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 OK and ready status when database is connected", async () => {
    vi.mocked(dbModule.checkDatabaseConnection).mockResolvedValueOnce(
      createMockDatabaseHealth(true, 12),
    );

    const res = await request(app).get("/api/v1/ready");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("ready");
    expect(res.body.data.checks.database.status).toBe("connected");
    expect(res.body.data.checks.database.latencyMs).toBe(12);
  });

  it("returns 503 Service Unavailable and not_ready status when database fails", async () => {
    vi.mocked(dbModule.checkDatabaseConnection).mockResolvedValueOnce(
      createMockDatabaseHealth(false, 35, "Database connection timeout"),
    );

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
});
