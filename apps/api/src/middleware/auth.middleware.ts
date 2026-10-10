import type { Request, Response, NextFunction } from "express";
import { validateSession } from "../services/session.service.js";
import { env } from "../config/env.js";
import { AppError } from "./error-handler.js";
import { ErrorCode } from "@workspace/contracts";
import type { User, Session, Membership } from "@workspace/database";

declare global {
  namespace Express {
    interface Request {
      user?: User;
      session?: Session;
      membership?: Membership;
    }
  }
}

/**
 * Ensures the incoming request carries a valid, non-expired, non-revoked session cookie.
 */
export async function requireAuthenticatedUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token =
    req.cookies?.[env.SESSION_COOKIE_NAME] ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined);

  if (!token) {
    next(new AppError("Authentication required", 401, ErrorCode.UNAUTHORIZED));
    return;
  }

  try {
    const auth = await validateSession(token);

    if (!auth) {
      next(
        new AppError("Invalid or expired session", 401, ErrorCode.UNAUTHORIZED),
      );
      return;
    }

    req.user = auth.user;
    req.session = auth.session;
    next();
  } catch (err) {
    next(err);
  }
}
