import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import {
  RegisterInputSchema,
  LoginInputSchema,
  ForgotPasswordInputSchema,
  ResetPasswordInputSchema,
  VerifyEmailInputSchema,
  ResendVerificationInputSchema,
  DeleteAccountInputSchema,
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
import {
  requestPasswordReset,
  confirmPasswordReset,
} from "../services/password-reset.service.js";
import {
  sendEmailVerification,
  confirmEmailVerification,
  resendVerificationEmail,
} from "../services/email-verification.service.js";
import { deleteUserAccount } from "../services/account-deletion.service.js";
import { createMfaChallenge } from "../services/mfa.service.js";
import {
  recordAuditLog,
  SecurityAuditAction,
} from "../services/audit.service.js";

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
  mfaEnabled?: boolean;
  emailVerified?: boolean;
}): UserProfile {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    mfaEnabled: user.mfaEnabled ?? false,
    emailVerified: user.emailVerified ?? false,
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

      const userAgent = req.headers["user-agent"];
      const ipAddress = req.ip || req.socket.remoteAddress;

      const { rawToken } = await createSession(user.id, {
        userAgent,
        ipAddress,
      });

      // Set session token in secure HttpOnly cookie (never return raw token in JSON)
      res.cookie(env.SESSION_COOKIE_NAME, rawToken, getSessionCookieOptions());

      // Send initial email verification link asynchronously
      void sendEmailVerification(user.id, user.email, {
        ipAddress,
        userAgent,
        requestId: req.id,
      }).catch(() => {});

      await recordAuditLog({
        actorId: user.id,
        action: SecurityAuditAction.AUTH_LOGIN_SUCCESS,
        targetType: "user",
        targetId: user.id,
        outcome: "SUCCESS",
        ipAddress,
        userAgent,
        metadata: { method: "registration" },
      });

      res
        .status(201)
        .json(
          createSuccessResponse(
            { user: toUserProfile(user), mfaRequired: false },
            req.id,
          ),
        );
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
      const userAgent = req.headers["user-agent"];
      const ipAddress = req.ip || req.socket.remoteAddress;

      const user = await prisma.user.findUnique({ where: { email } });

      // Generic authentication failure prevents user enumeration
      if (!user) {
        await recordAuditLog({
          action: SecurityAuditAction.AUTH_LOGIN_FAILURE,
          targetType: "user",
          outcome: "FAILURE",
          ipAddress,
          userAgent,
          metadata: { reason: "user_not_found" },
        });
        throw new AppError(
          "Invalid email or password",
          401,
          ErrorCode.UNAUTHORIZED,
        );
      }

      const isValidPassword = await verifyPassword(password, user.passwordHash);
      if (!isValidPassword) {
        await recordAuditLog({
          actorId: user.id,
          action: SecurityAuditAction.AUTH_LOGIN_FAILURE,
          targetType: "user",
          targetId: user.id,
          outcome: "FAILURE",
          ipAddress,
          userAgent,
          metadata: { reason: "invalid_password" },
        });
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

      // Check if MFA is required for this user
      if (user.mfaEnabled) {
        const challengeToken = await createMfaChallenge(user.id);

        await recordAuditLog({
          actorId: user.id,
          action: SecurityAuditAction.AUTH_LOGIN_SUCCESS,
          targetType: "user",
          targetId: user.id,
          outcome: "SUCCESS",
          ipAddress,
          userAgent,
          metadata: { mfaChallengeIssued: true },
        });

        // Do not set session cookie when MFA second factor challenge is required
        res.status(200).json(
          createSuccessResponse(
            {
              mfaRequired: true,
              challengeToken,
            },
            req.id,
          ),
        );
        return;
      }

      const { rawToken } = await createSession(user.id, {
        userAgent,
        ipAddress,
      });

      // Rotate/set session cookie
      res.cookie(env.SESSION_COOKIE_NAME, rawToken, getSessionCookieOptions());

      await recordAuditLog({
        actorId: user.id,
        action: SecurityAuditAction.AUTH_LOGIN_SUCCESS,
        targetType: "user",
        targetId: user.id,
        outcome: "SUCCESS",
        ipAddress,
        userAgent,
      });

      res
        .status(200)
        .json(
          createSuccessResponse(
            { user: toUserProfile(user), mfaRequired: false },
            req.id,
          ),
        );
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

/**
 * POST /api/v1/auth/forgot-password
 */
authRouter.post(
  "/forgot-password",
  authRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = ForgotPasswordInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid email address",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers["user-agent"];

      const result = await requestPasswordReset(parsed.data.email, {
        ipAddress,
        userAgent,
        requestId: req.id,
      });

      res.status(200).json(createSuccessResponse(result, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/reset-password
 */
authRouter.post(
  "/reset-password",
  authRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = ResetPasswordInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid password reset input",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers["user-agent"];

      const result = await confirmPasswordReset(
        parsed.data.token,
        parsed.data.newPassword,
        {
          ipAddress,
          userAgent,
          requestId: req.id,
        },
      );

      // Clear any session cookie since all sessions were revoked
      res.clearCookie(env.SESSION_COOKIE_NAME, {
        path: "/",
        httpOnly: true,
      });

      res.status(200).json(createSuccessResponse(result, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/verify-email
 */
authRouter.post(
  "/verify-email",
  authRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = VerifyEmailInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Verification token is required",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers["user-agent"];

      const result = await confirmEmailVerification(parsed.data.token, {
        ipAddress,
        userAgent,
        requestId: req.id,
      });

      res.status(200).json(createSuccessResponse(result, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/resend-verification
 */
authRouter.post(
  "/resend-verification",
  authRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = ResendVerificationInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid email address",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers["user-agent"];

      const result = await resendVerificationEmail(parsed.data.email, {
        ipAddress,
        userAgent,
        requestId: req.id,
      });

      res.status(200).json(createSuccessResponse(result, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/auth/account
 */
authRouter.delete(
  "/account",
  requireAuthenticatedUser,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const parsed = DeleteAccountInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid account deletion confirmation",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers["user-agent"];

      const result = await deleteUserAccount({
        userId: user.id,
        password: parsed.data.password,
        confirmationPhrase: parsed.data.confirmationPhrase,
        ipAddress,
        userAgent,
        requestId: req.id,
      });

      // Clear session cookie immediately
      res.clearCookie(env.SESSION_COOKIE_NAME, {
        path: "/",
        httpOnly: true,
      });

      res.status(200).json(createSuccessResponse(result, req.id));
    } catch (err) {
      next(err);
    }
  },
);
