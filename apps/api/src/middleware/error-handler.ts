import type { Request, Response, NextFunction } from "express";
import {
  ErrorCode,
  type ErrorCodeType,
  createErrorResponse,
} from "@workspace/contracts";
import { env } from "../config/env.js";

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCodeType | string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode = 500,
    code: ErrorCodeType | string = ErrorCode.INTERNAL_ERROR,
    details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function errorHandlerMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.id || "unknown";
  const isProduction = env.NODE_ENV === "production";

  if (err instanceof AppError) {
    const errorPayload = {
      code: err.code,
      message: err.message,
      ...(err.details && !isProduction ? { details: err.details } : {}),
    };

    res
      .status(err.statusCode)
      .json(createErrorResponse(errorPayload, requestId));
    return;
  }

  // Handle unexpected or internal errors
  const safeMessage = isProduction
    ? "Internal server error"
    : err.message || "An unexpected error occurred";

  // Log server errors internally without exposing secrets
  console.error(`[Error][${requestId}]`, err.message);

  res.status(500).json(
    createErrorResponse(
      {
        code: ErrorCode.INTERNAL_ERROR,
        message: safeMessage,
      },
      requestId,
    ),
  );
}
