import {
  prisma,
  getDatabaseContext,
  withAdminBypassTransaction,
  withTenantTransaction,
  withUserTransaction,
  type Prisma,
} from "@workspace/database";
import type { AuditLogListQuery } from "@workspace/contracts";

export interface AuditLogParams {
  organizationId?: string | null;
  actorId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  requestId?: string | null;
  outcome?: "SUCCESS" | "FAILURE";
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
  tx?: Prisma.TransactionClient;
}

export const SecurityAuditAction = {
  AUTH_LOGIN_SUCCESS: "auth.login.success",
  AUTH_LOGIN_FAILURE: "auth.login.failure",
  AUTH_LOGOUT: "auth.logout",
  AUTH_PASSWORD_CHANGE: "auth.password.change",
  AUTH_MFA_SETUP_INITIATED: "auth.mfa.setup.initiated",
  AUTH_MFA_ENABLED: "auth.mfa.enabled",
  AUTH_MFA_DISABLED: "auth.mfa.disabled",
  AUTH_MFA_LOGIN_SUCCESS: "auth.mfa.login.success",
  AUTH_MFA_RECOVERY_LOGIN_SUCCESS: "auth.mfa.recovery.login.success",
  AUTH_MFA_RECOVERY_CODES_REGENERATED: "auth.mfa.recovery_codes.regenerated",
  AUTH_SESSION_REVOKED: "auth.session.revoked",
  AUTH_ALL_SESSIONS_REVOKED: "auth.sessions.all_revoked",
  API_KEY_CREATED: "api_key.created",
  API_KEY_REVOKED: "api_key.revoked",
  WEBHOOK_CREATED: "webhook.created",
  WEBHOOK_SECRET_ROTATED: "webhook.secret_rotated",
  WEBHOOK_DELETED: "webhook.deleted",
  ORG_POLICY_UPDATED: "organization.security_policy.updated",
  MEMBER_INVITED: "member.invited",
  MEMBER_ROLE_UPDATED: "member.role.updated",
  MEMBER_REMOVED: "member.removed",
  AUTH_PASSWORD_RESET_REQUESTED: "auth.password_reset.requested",
  AUTH_PASSWORD_RESET_COMPLETED: "auth.password_reset.completed",
  AUTH_EMAIL_VERIFIED: "auth.email.verified",
  AUTH_ACCOUNT_DELETED: "auth.account.deleted",
} as const;

export type SecurityAuditActionType =
  (typeof SecurityAuditAction)[keyof typeof SecurityAuditAction];

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "password_hash",
  "token",
  "rawtoken",
  "tokenhash",
  "token_hash",
  "authorization",
  "cookie",
  "secret",
  "totp",
  "code",
  "mfacode",
  "mfa_code",
  "recoverycode",
  "recovery_code",
  "recoverycodes",
  "recovery_codes",
  "challenge",
  "challengetoken",
  "challenge_token",
  "secretkey",
  "secret_key",
  "apikey",
  "api_key",
  "webhooksecret",
  "webhook_secret",
]);

/**
 * Strips secrets, tokens, MFA codes, and passwords from metadata objects recursively.
 */
export function sanitizeMetadata(
  meta: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(meta)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase().replace(/[-_]/g, ""))) {
      continue;
    }

    if (val && typeof val === "object" && !Array.isArray(val)) {
      sanitized[key] = sanitizeMetadata(val as Record<string, unknown>);
    } else {
      sanitized[key] = val;
    }
  }

  return sanitized;
}

/**
 * Records an audit log entry with automatic sanitization of sensitive values.
 */
export async function recordAuditLog(params: AuditLogParams): Promise<void> {
  const safeMeta = params.metadata
    ? (sanitizeMetadata(params.metadata) as unknown as Prisma.InputJsonValue)
    : undefined;

  const write = async (
    db: Prisma.TransactionClient | typeof prisma,
  ): Promise<void> => {
    await db.auditLog.create({
      data: {
        organizationId: params.organizationId ?? undefined,
        actorId: params.actorId ?? undefined,
        action: params.action,
        targetType: params.targetType ?? undefined,
        targetId: params.targetId ?? undefined,
        requestId: params.requestId ?? undefined,
        outcome: params.outcome ?? "SUCCESS",
        ipAddress: params.ipAddress ? params.ipAddress.slice(0, 45) : undefined,
        userAgent: params.userAgent
          ? params.userAgent.slice(0, 500)
          : undefined,
        metadata: safeMeta,
      },
    });
  };

  try {
    if (params.tx) {
      await write(params.tx);
      return;
    }

    if (getDatabaseContext()) {
      await write(prisma);
      return;
    }

    if (params.organizationId) {
      await withTenantTransaction(params.organizationId, write);
      return;
    }

    if (params.actorId) {
      // Account-level audit event: visible only to its actor through the
      // app.current_user_id RLS policy.
      await withUserTransaction(params.actorId, write);
      return;
    }

    // Anonymous events (for example a failed login for an unknown email) have
    // no tenant or user scope.
    await withAdminBypassTransaction(write);
  } catch (err) {
    console.error("[AuditLog] Failed to record audit log:", err);
  }
}

/**
 * Retrieves audit logs for an organization with pagination, filtering, and actor resolution.
 * Strictly enforces organization boundary.
 */
export async function getOrganizationAuditLogs(
  organizationId: string,
  query: AuditLogListQuery,
) {
  const page = query.page ?? 1;
  const limit = Math.min(query.limit ?? 50, 100);
  const skip = (page - 1) * limit;

  const where: Prisma.AuditLogWhereInput = {
    organizationId,
  };

  if (query.action) {
    where.action = query.action;
  }

  if (query.outcome) {
    where.outcome = query.outcome;
  }

  if (query.actorId) {
    where.actorId = query.actorId;
  }

  if (query.targetType) {
    where.targetType = query.targetType;
  }

  if (query.startDate || query.endDate) {
    where.createdAt = {};
    if (query.startDate) {
      where.createdAt.gte = new Date(query.startDate);
    }
    if (query.endDate) {
      where.createdAt.lte = new Date(query.endDate);
    }
  }

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        actor: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items: items.map((item) => ({
      id: item.id,
      organizationId: item.organizationId,
      actorId: item.actorId,
      action: item.action,
      targetType: item.targetType,
      targetId: item.targetId,
      requestId: item.requestId,
      outcome: item.outcome,
      ipAddress: item.ipAddress,
      userAgent: item.userAgent,
      metadata: item.metadata as Record<string, unknown> | null,
      createdAt: item.createdAt.toISOString(),
      actor: item.actor
        ? {
            id: item.actor.id,
            displayName: item.actor.displayName,
            email: item.actor.email,
          }
        : null,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
