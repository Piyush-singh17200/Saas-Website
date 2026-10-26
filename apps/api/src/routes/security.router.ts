import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import {
  createSuccessResponse,
  ErrorCode,
  MfaEnableInputSchema,
  MfaDisableInputSchema,
  MfaRegenerateRecoveryCodesInputSchema,
  MfaChallengeVerifyInputSchema,
  MfaChallengeRecoveryInputSchema,
  UpdateOrganizationSecurityPolicyInputSchema,
  AuditLogListQuerySchema,
  type UserProfile,
} from "@workspace/contracts";
import { requireAuthenticatedUser } from "../middleware/auth.middleware.js";
import {
  requireActiveMembership,
  canManageOrganization,
} from "../middleware/organization.middleware.js";
import { authRateLimiter } from "../middleware/rate-limit.middleware.js";
import { AppError } from "../middleware/error-handler.js";
import { env } from "../config/env.js";
import {
  getUserSessions,
  revokeSessionById,
  revokeAllOtherSessions,
  createSession,
  getSessionCookieOptions,
} from "../services/session.service.js";
import {
  initiateMfaSetup,
  confirmMfaEnrollment,
  disableMfa,
  regenerateRecoveryCodes,
  verifyMfaChallenge,
  verifyMfaRecoveryChallenge,
} from "../services/mfa.service.js";
import {
  getOrganizationSecurityPolicy,
  updateOrganizationSecurityPolicy,
} from "../services/security-policy.service.js";
import {
  getOrganizationAuditLogs,
  recordAuditLog,
  SecurityAuditAction,
} from "../services/audit.service.js";

export const securityRouter: Router = Router();

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

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || "";
  return param || "";
}

// =============================================================================
// Active Session Management Endpoints
// =============================================================================

/**
 * GET /api/v1/auth/sessions
 * Lists all active, unrevoked sessions for the authenticated user.
 */
securityRouter.get(
  "/auth/sessions",
  requireAuthenticatedUser,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const currentSessionId = req.session?.id;
      const sessions = await getUserSessions(user.id, currentSessionId);

      res.status(200).json(createSuccessResponse({ sessions }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/auth/sessions/other
 * Revokes all sessions belonging to the user except their current session.
 */
securityRouter.delete(
  "/auth/sessions/other",
  requireAuthenticatedUser,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const currentSessionId = req.session?.id;

      if (!currentSessionId) {
        throw new AppError(
          "Current session not found",
          400,
          ErrorCode.BAD_REQUEST,
        );
      }

      const revokedCount = await revokeAllOtherSessions(
        user.id,
        currentSessionId,
      );

      await recordAuditLog({
        actorId: user.id,
        action: SecurityAuditAction.AUTH_ALL_SESSIONS_REVOKED,
        targetType: "session",
        targetId: currentSessionId,
        outcome: "SUCCESS",
        metadata: { revokedCount },
      });

      res.status(200).json(
        createSuccessResponse(
          {
            message: `Successfully revoked ${revokedCount} other session(s)`,
            revokedCount,
          },
          req.id,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/auth/sessions/:sessionId
 * Revokes a specific session belonging to the user.
 */
securityRouter.delete(
  "/auth/sessions/:sessionId",
  requireAuthenticatedUser,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const sessionId = getParam(req.params.sessionId);

      if (!sessionId) {
        throw new AppError(
          "Session ID is required",
          400,
          ErrorCode.BAD_REQUEST,
        );
      }

      const revoked = await revokeSessionById(user.id, sessionId);
      if (!revoked) {
        throw new AppError(
          "Session not found or already revoked",
          404,
          ErrorCode.NOT_FOUND,
        );
      }

      // If user revoked their own current session, clear session cookie
      if (req.session?.id === sessionId) {
        res.clearCookie(env.SESSION_COOKIE_NAME, {
          path: "/",
          httpOnly: true,
        });
      }

      await recordAuditLog({
        actorId: user.id,
        action: SecurityAuditAction.AUTH_SESSION_REVOKED,
        targetType: "session",
        targetId: sessionId,
        outcome: "SUCCESS",
      });

      res
        .status(200)
        .json(
          createSuccessResponse(
            { message: "Session revoked successfully" },
            req.id,
          ),
        );
    } catch (err) {
      next(err);
    }
  },
);

// =============================================================================
// User Multi-Factor Authentication Endpoints
// =============================================================================

/**
 * POST /api/v1/auth/mfa/setup
 * Initiates TOTP MFA setup, returning QR code URI, secret, and recovery codes.
 */
securityRouter.post(
  "/auth/mfa/setup",
  requireAuthenticatedUser,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const setup = await initiateMfaSetup(user.id);

      res.status(200).json(createSuccessResponse(setup, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/mfa/enable
 * Verifies the TOTP code and activates MFA on the user's account.
 */
securityRouter.post(
  "/auth/mfa/enable",
  requireAuthenticatedUser,
  authRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const parsed = MfaEnableInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid verification code",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      await confirmMfaEnrollment(user.id, parsed.data.code);

      res
        .status(200)
        .json(
          createSuccessResponse(
            { message: "Multi-factor authentication enabled successfully" },
            req.id,
          ),
        );
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/mfa/disable
 * Requires password reauthentication to disable MFA.
 */
securityRouter.post(
  "/auth/mfa/disable",
  requireAuthenticatedUser,
  authRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const parsed = MfaDisableInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message ||
            "Password is required to disable MFA",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      await disableMfa(user.id, parsed.data.password, parsed.data.code);

      res
        .status(200)
        .json(
          createSuccessResponse(
            { message: "Multi-factor authentication disabled successfully" },
            req.id,
          ),
        );
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/mfa/recovery-codes/regenerate
 * Regenerates recovery codes after password reauthentication.
 */
securityRouter.post(
  "/auth/mfa/recovery-codes/regenerate",
  requireAuthenticatedUser,
  authRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const parsed = MfaRegenerateRecoveryCodesInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Password is required",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      const result = await regenerateRecoveryCodes(
        user.id,
        parsed.data.password,
      );

      res.status(200).json(createSuccessResponse(result, req.id));
    } catch (err) {
      next(err);
    }
  },
);

// =============================================================================
// MFA Login Challenge Resolution Endpoints
// =============================================================================

/**
 * POST /api/v1/auth/mfa/challenge/verify
 * Completes login by verifying the 6-digit TOTP code against the challenge token.
 */
securityRouter.post(
  "/auth/mfa/challenge/verify",
  authRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = MfaChallengeVerifyInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid verification code",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      const { challengeToken, code } = parsed.data;
      const { user } = await verifyMfaChallenge(challengeToken, code);

      const userAgent = req.headers["user-agent"];
      const ipAddress = req.ip || req.socket.remoteAddress;

      const { rawToken } = await createSession(user.id, {
        userAgent,
        ipAddress,
      });

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
 * POST /api/v1/auth/mfa/challenge/recovery
 * Completes login by verifying a single-use backup recovery code against the challenge token.
 */
securityRouter.post(
  "/auth/mfa/challenge/recovery",
  authRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = MfaChallengeRecoveryInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid recovery code",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      const { challengeToken, recoveryCode } = parsed.data;
      const { user } = await verifyMfaRecoveryChallenge(
        challengeToken,
        recoveryCode,
      );

      const userAgent = req.headers["user-agent"];
      const ipAddress = req.ip || req.socket.remoteAddress;

      const { rawToken } = await createSession(user.id, {
        userAgent,
        ipAddress,
      });

      res.cookie(env.SESSION_COOKIE_NAME, rawToken, getSessionCookieOptions());

      res
        .status(200)
        .json(createSuccessResponse({ user: toUserProfile(user) }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

// =============================================================================
// Organization Security Policy Endpoints
// =============================================================================

/**
 * GET /api/v1/organizations/:organizationId/security/policy
 */
securityRouter.get(
  "/organizations/:organizationId/security/policy",
  requireAuthenticatedUser,
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getParam(req.params.organizationId);
      const policy = await getOrganizationSecurityPolicy(organizationId);

      res.status(200).json(createSuccessResponse({ policy }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/organizations/:organizationId/security/policy
 * Restricts policy modification to OWNER or ADMIN roles.
 */
securityRouter.patch(
  "/organizations/:organizationId/security/policy",
  requireAuthenticatedUser,
  requireActiveMembership,
  canManageOrganization,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getParam(req.params.organizationId);
      const user = req.user!;

      const parsed = UpdateOrganizationSecurityPolicyInputSchema.safeParse(
        req.body,
      );
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message ||
            "Invalid security policy configuration",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      const updated = await updateOrganizationSecurityPolicy(
        organizationId,
        user.id,
        parsed.data,
      );

      res.status(200).json(createSuccessResponse({ policy: updated }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

// =============================================================================
// Organization Security Audit Logs Endpoints
// =============================================================================

/**
 * GET /api/v1/organizations/:organizationId/security/audit-logs
 * Restricts audit log viewing to OWNER or ADMIN roles.
 */
securityRouter.get(
  "/organizations/:organizationId/security/audit-logs",
  requireAuthenticatedUser,
  requireActiveMembership,
  canManageOrganization,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = getParam(req.params.organizationId);
      const parsed = AuditLogListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message ||
            "Invalid audit log query parameters",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      const auditLogs = await getOrganizationAuditLogs(
        organizationId,
        parsed.data,
      );

      res.status(200).json(createSuccessResponse(auditLogs, req.id));
    } catch (err) {
      next(err);
    }
  },
);
