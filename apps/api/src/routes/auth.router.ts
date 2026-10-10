import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import {
  RegisterInputSchema,
  LoginInputSchema,
  createSuccessResponse,
  ErrorCode,
  type UserProfile,
} from "@workspace/contracts";
import { prisma } from "@workspace/database";
import { hashPassword, verifyPassword } from "../services/password.service.js";
import {
  createSession,
  revokeSession,
  getSessionCookieOptions,
} from "../services/session.service.js";
import { requireAuthenticatedUser } from "../middleware/auth.middleware.js";
import { authRateLimiter } from "../middleware/rate-limit.middleware.js";
import { AppError } from "../middleware/error-handler.js";
import { env } from "../config/env.js";

export const authRouter: Router = Router();

/**
 * Helper to map internal User to safe public profile representation.
 */
function toUserProfile(user: {
  id: string;
  email: string;
  displayName: string;
  status: "ACTIVE" | "DISABLED";
  createdAt: Date;
}): UserProfile {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * POST /api/v1/auth/register
 */
authRouter.post(
  "/register",
  authRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = RegisterInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid registration input",
          400,
          ErrorCode.VALIDATION_ERROR,
          parsed.error.format(),
        );
      }

      const { email, password, displayName } = parsed.data;

      // Check duplicate email
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        throw new AppError(
          "Email address is already registered",
          409,
          ErrorCode.CONFLICT,
        );
      }

      const passwordHash = await hashPassword(password);

      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          displayName,
          status: "ACTIVE",
        },
      });

      const { rawToken } = await createSession(user.id);

      // Set session token in secure HttpOnly cookie (never return raw token in JSON)
      res.cookie(env.SESSION_COOKIE_NAME, rawToken, getSessionCookieOptions());

      res
        .status(201)
        .json(createSuccessResponse({ user: toUserProfile(user) }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/login
 */
authRouter.post(
  "/login",
  authRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = LoginInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          "Invalid email or password format",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      const { email, password } = parsed.data;

      const user = await prisma.user.findUnique({ where: { email } });

      // Generic authentication failure prevents user enumeration
      if (!user) {
        throw new AppError(
          "Invalid email or password",
          401,
          ErrorCode.UNAUTHORIZED,
        );
      }

      const isValidPassword = await verifyPassword(password, user.passwordHash);
      if (!isValidPassword) {
        throw new AppError(
          "Invalid email or password",
          401,
          ErrorCode.UNAUTHORIZED,
        );
      }

      if (user.status === "DISABLED") {
        throw new AppError(
          "Account is suspended or disabled",
          403,
          ErrorCode.FORBIDDEN,
        );
      }

      const { rawToken } = await createSession(user.id);

      // Rotate/set session cookie
      res.cookie(env.SESSION_COOKIE_NAME, rawToken, getSessionCookieOptions());

      res
        .status(200)
        .json(createSuccessResponse({ user: toUserProfile(user) }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/logout
 */
authRouter.post(
  "/logout",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token =
        req.cookies?.[env.SESSION_COOKIE_NAME] ||
        (req.headers.authorization?.startsWith("Bearer ")
          ? req.headers.authorization.slice(7)
          : undefined);

      if (token) {
        await revokeSession(token);
      }

      // Clear cookie immediately
      res.clearCookie(env.SESSION_COOKIE_NAME, {
        path: "/",
        httpOnly: true,
      });

      res
        .status(200)
        .json(
          createSuccessResponse({ message: "Logged out successfully" }, req.id),
        );
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/me
 */
authRouter.get(
  "/me",
  requireAuthenticatedUser,
  (req: Request, res: Response): void => {
    // req.user is guaranteed by requireAuthenticatedUser
    const user = req.user!;
    res
      .status(200)
      .json(createSuccessResponse({ user: toUserProfile(user) }, req.id));
  },
);
