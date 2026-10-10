import type { Request, Response, NextFunction } from "express";
import { AppError } from "./error-handler.js";
import { ErrorCode } from "@workspace/contracts";
import { env } from "../config/env.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Validates Origin and Referer headers on state-changing requests when session cookies are used.
 */
export function csrfProtection(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // If request has no session cookie, CSRF does not apply (e.g. initial login/registration or token-only)
  const hasSessionCookie = Boolean(req.cookies?.[env.SESSION_COOKIE_NAME]);
  if (!hasSessionCookie) {
    return next();
  }

  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const host = req.headers.host;

  // In test environment, skip strict origin header requirement if missing
  if (env.NODE_ENV === "test" && !origin && !referer) {
    return next();
  }

  if (origin) {
    try {
      const parsedOrigin = new URL(origin);
      if (parsedOrigin.host === host || origin === env.CORS_ORIGIN) {
        return next();
      }
    } catch {
      // Invalid URL format
    }
  }

  if (referer) {
    try {
      const parsedReferer = new URL(referer);
      if (
        parsedReferer.host === host ||
        parsedReferer.origin === env.CORS_ORIGIN
      ) {
        return next();
      }
    } catch {
      // Invalid URL format
    }
  }

  next(
    new AppError(
      "Cross-Site Request Forgery validation failed",
      403,
      ErrorCode.FORBIDDEN,
    ),
  );
}
