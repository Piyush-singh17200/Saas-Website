import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { isSuccessResponse } from "@workspace/test-utils";

describe("GET /api/v1/health", () => {
  const app = createApp();

  it("returns 200 OK with valid health metadata and request ID", async () => {
    const res = await request(app).get("/api/v1/health");

    expect(res.status).toBe(200);
    expect(res.headers["x-request-id"]).toBeDefined();

    expect(isSuccessResponse(res.body)).toBe(true);
    expect(res.body.data.status).toBe("ok");
    expect(res.body.data.service).toBe("workspace-api");
    expect(res.body.data.version).toBe("0.1.0");
    expect(typeof res.body.data.uptime).toBe("number");
    expect(res.body.meta.requestId).toBe(res.headers["x-request-id"]);
  });

  it("preserves incoming x-request-id header when provided", async () => {
    const customId = "test-req-custom-12345";
    const res = await request(app)
      .get("/api/v1/health")
      .set("x-request-id", customId);

    expect(res.status).toBe(200);
    expect(res.headers["x-request-id"]).toBe(customId);
    expect(res.body.meta.requestId).toBe(customId);
  });
});
