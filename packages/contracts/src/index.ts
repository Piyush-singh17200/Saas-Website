import { z } from "zod";

export const ErrorCode = {
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  VALIDATION_ERROR: "VALIDATION_ERROR",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ResponseMeta {
  requestId: string;
  timestamp: string;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta: ResponseMeta;
}

export interface ApiErrorDetail {
  code: ErrorCodeType | string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetail;
  meta: ResponseMeta;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// Health Endpoint Schemas
export const HealthDataSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  version: z.string(),
  uptime: z.number(),
  timestamp: z.string(),
});

export type HealthData = z.infer<typeof HealthDataSchema>;

// Readiness Endpoint Schemas
export const ReadinessComponentStatusSchema = z.object({
  status: z.enum(["connected", "disconnected", "degraded"]),
  latencyMs: z.number().optional(),
  message: z.string().optional(),
});

export const ReadinessDataSchema = z.object({
  status: z.enum(["ready", "not_ready"]),
  service: z.string(),
  version: z.string(),
  checks: z.object({
    database: ReadinessComponentStatusSchema,
  }),
  timestamp: z.string(),
});

export type ReadinessComponentStatus = z.infer<
  typeof ReadinessComponentStatusSchema
>;
export type ReadinessData = z.infer<typeof ReadinessDataSchema>;

// Helpers to produce typed API responses
export function createSuccessResponse<T>(
  data: T,
  requestId: string,
): ApiSuccessResponse<T> {
  return {
    success: true,
    data,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
}

export function createErrorResponse(
  error: ApiErrorDetail,
  requestId: string,
): ApiErrorResponse {
  return {
    success: false,
    error,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
}
