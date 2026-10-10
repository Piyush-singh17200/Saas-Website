import { prisma, type Prisma } from "@workspace/database";

export interface AuditLogParams {
  organizationId?: string | null;
  actorId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
  tx?: Prisma.TransactionClient;
}

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
]);

/**
 * Strips secrets, tokens, and passwords from metadata objects recursively.
 */
function sanitizeMetadata(
  meta: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(meta)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
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
 * Records an immutable audit log entry.
 */
export async function recordAuditLog(params: AuditLogParams): Promise<void> {
  const db = params.tx ?? prisma;
  const safeMeta = params.metadata
    ? (sanitizeMetadata(params.metadata) as unknown as Prisma.InputJsonValue)
    : undefined;

  try {
    await db.auditLog.create({
      data: {
        organizationId: params.organizationId ?? undefined,
        actorId: params.actorId ?? undefined,
        action: params.action,
        targetType: params.targetType ?? undefined,
        targetId: params.targetId ?? undefined,
        requestId: params.requestId ?? undefined,
        metadata: safeMeta,
      },
    });
  } catch (err) {
    console.error("[AuditLog] Failed to record audit log:", err);
  }
}
