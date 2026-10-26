import crypto from "node:crypto";
import { prisma, withAdminBypassTransaction } from "@workspace/database";
import {
  type CreateApiKeyInput,
  type CreateApiKeyResult,
  type ApiKeyResponse,
  type ApiKeyListQuery,
  ApiKeyScope,
  ErrorCode,
} from "@workspace/contracts";
import { AppError } from "../middleware/error-handler.js";
import { logger } from "../lib/logger.js";

const KEY_PREFIX_CONSTANT = "wsp_live_";

/**
 * Validates whether granted scopes satisfy the requested scope.
 * Scope wildcard '*' grants all operations.
 * Writing permissions also grant read permissions for the same resource.
 */
export function hasScope(
  grantedScopes: string[],
  requiredScope: string,
): boolean {
  if (grantedScopes.includes(ApiKeyScope.ALL)) {
    return true;
  }
  if (grantedScopes.includes(requiredScope)) {
    return true;
  }

  // Write permissions imply read permissions for that domain
  if (
    requiredScope === ApiKeyScope.PROJECTS_READ &&
    grantedScopes.includes(ApiKeyScope.PROJECTS_WRITE)
  ) {
    return true;
  }
  if (
    requiredScope === ApiKeyScope.TASKS_READ &&
    grantedScopes.includes(ApiKeyScope.TASKS_WRITE)
  ) {
    return true;
  }
  if (
    requiredScope === ApiKeyScope.WEBHOOKS_READ &&
    grantedScopes.includes(ApiKeyScope.WEBHOOKS_WRITE)
  ) {
    return true;
  }

  return false;
}

/**
 * Computes a SHA-256 hash string for an API key secret.
 */
export function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Creates a new organization-scoped API key.
 * Stores only the SHA-256 hash at rest.
 * Plaintext secret is returned strictly ONCE in the returned result.
 */
export async function createApiKey(
  organizationId: string,
  userId: string,
  input: CreateApiKeyInput,
): Promise<CreateApiKeyResult> {
  // 1. Generate unpredictable components
  const prefix = crypto.randomBytes(8).toString("hex"); // 16 hex chars
  const secret = crypto.randomBytes(16).toString("hex"); // 32 hex chars
  const fullKey = `${KEY_PREFIX_CONSTANT}${prefix}_${secret}`;
  const keyHash = hashApiKey(fullKey);

  // 2. Calculate optional expiration
  let expiresAt: Date | null = null;
  if (input.expiresInDays && input.expiresInDays > 0) {
    expiresAt = new Date(
      Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000,
    );
  }

  // 3. Create database record
  const record = await prisma.apiKey.create({
    data: {
      organizationId,
      createdById: userId,
      name: input.name,
      keyPrefix: prefix,
      keyHash,
      scopes: input.scopes,
      expiresAt,
    },
    include: {
      createdBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
    },
  });

  logger.info("API key created", {
    organizationId,
    apiKeyId: record.id,
    keyPrefix: prefix,
    scopes: record.scopes,
  });

  return {
    apiKey: {
      id: record.id,
      organizationId: record.organizationId,
      name: record.name,
      keyPrefix: record.keyPrefix,
      scopes: record.scopes,
      expiresAt: record.expiresAt?.toISOString() ?? null,
      lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
      revokedAt: record.revokedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      createdBy: record.createdBy,
    },
    secret: fullKey, // Revealed strictly once
  };
}

export interface ValidatedApiKey {
  id: string;
  organizationId: string;
  createdById: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
}

/**
 * Authenticates and verifies an incoming API key.
 * Uses constant-time comparison to prevent timing side-channel attacks.
 */
export async function verifyApiKey(
  rawKey: string,
): Promise<ValidatedApiKey | null> {
  if (!rawKey || !rawKey.startsWith(KEY_PREFIX_CONSTANT)) {
    return null;
  }

  const remainder = rawKey.slice(KEY_PREFIX_CONSTANT.length);
  const parts = remainder.split("_");
  if (parts.length !== 2) {
    return null;
  }

  const [keyPrefix] = parts;
  if (!keyPrefix || keyPrefix.length !== 16) {
    return null;
  }

  // Lookup is a trusted cross-tenant operation: the key prefix is a random
  // identifier and the presented secret is verified below. This is one of the
  // few paths that intentionally uses the administrative RLS bypass.
  return withAdminBypassTransaction(async (tx) => {
    const record = await tx.apiKey.findFirst({
      where: {
        keyPrefix,
        revokedAt: null,
      },
    });

    if (!record) {
      return null;
    }

    // Check expiration
    if (record.expiresAt && record.expiresAt < new Date()) {
      return null;
    }

    // Constant-time hash verification
    const candidateHash = hashApiKey(rawKey);
    const candidateBuffer = Buffer.from(candidateHash, "utf8");
    const storedBuffer = Buffer.from(record.keyHash, "utf8");

    if (
      candidateBuffer.length !== storedBuffer.length ||
      !crypto.timingSafeEqual(candidateBuffer, storedBuffer)
    ) {
      return null;
    }

    // Touch lastUsedAt without allowing a bookkeeping failure to reject auth.
    try {
      await tx.apiKey.update({
        where: { id: record.id },
        data: { lastUsedAt: new Date() },
      });
    } catch (err) {
      logger.warn(
        "Failed to update API key lastUsedAt",
        { id: record.id },
        err,
      );
    }

    return {
      id: record.id,
      organizationId: record.organizationId,
      createdById: record.createdById,
      name: record.name,
      keyPrefix: record.keyPrefix,
      scopes: record.scopes,
    };
  });
}

/**
 * Lists API keys for an organization.
 * Never returns plaintext secrets or secret hashes.
 */
export async function listApiKeys(
  organizationId: string,
  query: ApiKeyListQuery,
): Promise<{
  keys: ApiKeyResponse[];
  total: number;
  page: number;
  limit: number;
}> {
  const where: any = { organizationId };

  if (query.status === "active") {
    where.revokedAt = null;
    where.OR = [{ expiresAt: null }, { expiresAt: { gt: new Date() } }];
  } else if (query.status === "revoked") {
    where.OR = [
      { revokedAt: { not: null } },
      { expiresAt: { lte: new Date() } },
    ];
  }

  const skip = (query.page - 1) * query.limit;

  const [total, records] = await Promise.all([
    prisma.apiKey.count({ where }),
    prisma.apiKey.findMany({
      where,
      skip,
      take: query.limit,
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
    }),
  ]);

  const keys: ApiKeyResponse[] = records.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    name: r.name,
    keyPrefix: r.keyPrefix,
    scopes: r.scopes,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    revokedAt: r.revokedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    createdBy: r.createdBy,
  }));

  return {
    keys,
    total,
    page: query.page,
    limit: query.limit,
  };
}

/**
 * Revokes an API key immediately.
 */
export async function revokeApiKey(
  organizationId: string,
  keyId: string,
): Promise<ApiKeyResponse> {
  const existing = await prisma.apiKey.findFirst({
    where: {
      id: keyId,
      organizationId,
    },
    include: {
      createdBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
    },
  });

  if (!existing) {
    throw new AppError("API key not found", 404, ErrorCode.NOT_FOUND);
  }

  if (existing.revokedAt) {
    return {
      id: existing.id,
      organizationId: existing.organizationId,
      name: existing.name,
      keyPrefix: existing.keyPrefix,
      scopes: existing.scopes,
      expiresAt: existing.expiresAt?.toISOString() ?? null,
      lastUsedAt: existing.lastUsedAt?.toISOString() ?? null,
      revokedAt: existing.revokedAt.toISOString(),
      createdAt: existing.createdAt.toISOString(),
      createdBy: existing.createdBy,
    };
  }

  const updated = await prisma.apiKey.update({
    where: { id: keyId },
    data: { revokedAt: new Date() },
    include: {
      createdBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
    },
  });

  logger.info("API key revoked", {
    organizationId,
    apiKeyId: updated.id,
    keyPrefix: updated.keyPrefix,
  });

  return {
    id: updated.id,
    organizationId: updated.organizationId,
    name: updated.name,
    keyPrefix: updated.keyPrefix,
    scopes: updated.scopes,
    expiresAt: updated.expiresAt?.toISOString() ?? null,
    lastUsedAt: updated.lastUsedAt?.toISOString() ?? null,
    revokedAt: updated.revokedAt?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
    createdBy: updated.createdBy,
  };
}
