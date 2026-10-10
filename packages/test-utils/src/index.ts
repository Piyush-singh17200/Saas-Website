import type { DatabaseHealthResult } from "@workspace/database";
import type { ApiResponse } from "@workspace/contracts";

/**
 * Creates mock database connectivity responses for testing readiness routes.
 */
export function createMockDatabaseHealth(
  ok: boolean,
  latencyMs = 5,
  error?: string,
): DatabaseHealthResult {
  return {
    ok,
    latencyMs,
    ...(error ? { error } : {}),
  };
}

/**
 * Validates whether an object conforms to the success API response structure.
 */
export function isSuccessResponse<T>(res: ApiResponse<T>): boolean {
  return res.success === true && "data" in res && "meta" in res;
}

/**
 * Validates whether an object conforms to the error API response structure.
 */
export function isErrorResponse<T>(res: ApiResponse<T>): boolean {
  return res.success === false && "error" in res && "meta" in res;
}
