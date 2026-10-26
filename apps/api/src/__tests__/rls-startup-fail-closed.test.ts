import { describe, expect, it } from "vitest";
import { testDatabaseUrl } from "./test-env.js";

/**
 * The API and worker must refuse to start with a role that bypasses RLS.
 * This file intentionally imports the database package after selecting the
 * owner/migration URL, so the singleton client connects as that role.
 */
process.env.DATABASE_URL = testDatabaseUrl;
process.env.NODE_ENV = "test";

describe("RLS startup fail-closed check", () => {
  it("rejects a role that bypasses row-level security", async () => {
    process.env.ENFORCE_RLS_RUNTIME = "true";
    const { assertRlsRuntimeRole } = await import("@workspace/database");

    await expect(assertRlsRuntimeRole()).rejects.toThrow(
      /bypasses row-level security/i,
    );
  });
});
