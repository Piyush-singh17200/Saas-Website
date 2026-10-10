import type { Request, Response, NextFunction } from "express";
import { ErrorCode } from "@workspace/contracts";
import { AppError } from "./error-handler.js";

export function notFoundHandler(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  next(
    new AppError(
      `Resource not found: ${req.method} ${req.originalUrl}`,
      404,
      ErrorCode.NOT_FOUND,
    ),
  );
}
