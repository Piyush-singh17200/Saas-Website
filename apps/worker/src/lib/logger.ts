export type LogSeverity = "debug" | "info" | "warn" | "error";

export interface LogContext {
  correlationId?: string;
  requestId?: string;
  jobId?: string;
  jobType?: string;
  queueName?: string;
  organizationId?: string;
  userId?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  [key: string]: unknown;
}

const SENSITIVE_KEYS = new Set([
  "password",
  "newpassword",
  "oldpassword",
  "token",
  "accesstoken",
  "refreshtoken",
  "session",
  "cookie",
  "authorization",
  "secret",
  "stripesecretkey",
  "stripewebhooksecret",
  "webhooksecret",
  "apikey",
  "creditcard",
  "cardnumber",
  "cvv",
  "cvc",
  "ssn",
]);

/**
 * Recursively redacts sensitive keys and values from an arbitrary object or array.
 */
export function redactSensitiveData(data: unknown, depth = 0, seen = new WeakSet()): unknown {
  if (depth > 8) return "[MAX_DEPTH_REACHED]";
  if (data === null || data === undefined) return data;

  if (typeof data === "string") {
    if (/bearer\s+[a-zA-Z0-9._-]+/i.test(data)) {
      return "Bearer [REDACTED]";
    }
    return data;
  }

  if (typeof data !== "object") {
    return data;
  }

  if (seen.has(data)) {
    return "[CIRCULAR]";
  }
  seen.add(data);

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item, depth + 1, seen));
  }

  if (data instanceof Error) {
    return {
      name: data.name,
      message: data.message,
      stack: data.stack,
    };
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes("password") || lowerKey.includes("secret") || lowerKey.includes("token");

    if (typeof value === "object" && value !== null) {
      result[key] = redactSensitiveData(value, depth + 1, seen);
    } else if (isSensitive) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = value;
    }
  }

  return result;
}

export class StructuredLogger {
  private serviceName: string;
  private environment: string;

  constructor(serviceName = "workspace-worker") {
    this.serviceName = serviceName;
    this.environment = process.env.NODE_ENV || "development";
  }

  private log(severity: LogSeverity, message: string, context?: LogContext, error?: unknown): void {
    const isTest = this.environment === "test";
    if (isTest && severity !== "error" && !process.env.DEBUG_LOGS) {
      return;
    }

    const correlationId = context?.correlationId || context?.requestId;
    const sanitizedContext = context ? (redactSensitiveData(context) as Record<string, unknown>) : undefined;
    const sanitizedError = error ? redactSensitiveData(error) : undefined;

    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      severity,
      service: this.serviceName,
      environment: this.environment,
      message,
    };

    if (correlationId) {
      entry.correlationId = correlationId;
    }

    if (sanitizedContext) {
      if (sanitizedContext.jobId) entry.jobId = sanitizedContext.jobId;
      if (sanitizedContext.jobType) entry.jobType = sanitizedContext.jobType;
      if (sanitizedContext.queueName) entry.queueName = sanitizedContext.queueName;
      if (sanitizedContext.route) entry.route = sanitizedContext.route;
      if (sanitizedContext.durationMs !== undefined) entry.durationMs = sanitizedContext.durationMs;

      entry.context = sanitizedContext;
    }

    if (sanitizedError) {
      entry.error = sanitizedError;
    }

    const jsonString = JSON.stringify(entry);

    if (severity === "error") {
      console.error(jsonString);
    } else if (severity === "warn") {
      console.warn(jsonString);
    } else {
      console.log(jsonString);
    }
  }

  public debug(message: string, context?: LogContext): void {
    this.log("debug", message, context);
  }

  public info(message: string, context?: LogContext): void {
    this.log("info", message, context);
  }

  public warn(message: string, context?: LogContext, error?: unknown): void {
    this.log("warn", message, context, error);
  }

  public error(message: string, context?: LogContext, error?: unknown): void {
    this.log("error", message, context, error);
  }
}

export const logger = new StructuredLogger("workspace-worker");
