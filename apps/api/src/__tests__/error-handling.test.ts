import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { isErrorResponse } from "@workspace/test-utils";

describe("Error Handling Middleware", () => {
  const app = createApp();

  it("returns 404 with structured error response on unknown route", async () => {
    const res = await request(app).get("/api/v1/non-existent-route");

    expect(res.status).toBe(404);
    expect(isErrorResponse(res.body)).toBe(true);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.message).toContain("Resource not found");
    expect(res.body.meta.requestId).toBeDefined();
  });

  it("does not leak internal stack trace in error response", async () => {
    const res = await request(app).get("/api/v1/non-existent-route");

    expect(res.body.stack).toBeUndefined();
    expect(res.body.error.stack).toBeUndefined();
  });
});
