import { randomBytes, createHash } from "node:crypto";
import type { CookieOptions } from "express";
import { prisma, type Session, type User } from "@workspace/database";
import { env } from "../config/env.js";

/**
 * Derives a SHA-256 hash of the bearer token for storage and lookup.
 * Raw tokens are never stored in the database.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Generates a high-entropy cryptographically random session token.
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Returns Express cookie options for session management.
 */
export function getSessionCookieOptions(): CookieOptions {
  const isProd = env.NODE_ENV === "production";
  const isSecure = env.COOKIE_SECURE !== undefined ? env.COOKIE_SECURE : isProd;

  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

/**
 * Creates a new active session for a user and returns the raw bearer token.
 */
export async function createSession(
  userId: string,
  metadata?: { userAgent?: string; ipAddress?: string },
): Promise<{ session: Session; rawToken: string }> {
  const rawToken = generateSessionToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(
    Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      userAgent: metadata?.userAgent
        ? metadata.userAgent.slice(0, 500)
        : undefined,
      ipAddress: metadata?.ipAddress
        ? metadata.ipAddress.slice(0, 45)
        : undefined,
    },
  });

  return { session, rawToken };
}

/**
 * Validates a raw bearer token against active, unrevoked database sessions.
 */
export async function validateSession(
  rawToken: string,
): Promise<{ session: Session; user: User } | null> {
  if (!rawToken || typeof rawToken !== "string") {
    return null;
  }

  const tokenHash = hashToken(rawToken);

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session) {
    return null;
  }

  // Check revocation
  if (session.revokedAt !== null) {
    return null;
  }

  // Check expiration
  if (session.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  // Check user account status
  if (session.user.status === "DISABLED") {
    return null;
  }

  // Update lastUsedAt lazily without blocking
  void prisma.session
    .update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {});

  return { session, user: session.user };
}

/**
 * Immediately revokes an active session by raw token.
 */
export async function revokeSession(rawToken: string): Promise<boolean> {
  if (!rawToken) return false;
  const tokenHash = hashToken(rawToken);

  try {
    const updated = await prisma.session.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
    return updated.count > 0;
  } catch {
    return false;
  }
}

/**
 * Retrieves all active, unrevoked sessions for a given user.
 */
export async function getUserSessions(
  userId: string,
  currentSessionId?: string,
) {
  const sessions = await prisma.session.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
      userAgent: true,
      ipAddress: true,
    },
  });

  return sessions.map((s) => ({
    id: s.id,
    createdAt: s.createdAt.toISOString(),
    lastUsedAt: s.lastUsedAt ? s.lastUsedAt.toISOString() : null,
    expiresAt: s.expiresAt.toISOString(),
    userAgent: s.userAgent,
    ipAddress: s.ipAddress,
    isCurrent: Boolean(currentSessionId && s.id === currentSessionId),
  }));
}

/**
 * Revokes a specific session belonging to the user.
 * Prevents revoking sessions belonging to other users.
 */
export async function revokeSessionById(
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const result = await prisma.session.updateMany({
    where: {
      id: sessionId,
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  return result.count > 0;
}

/**
 * Revokes all other sessions for the user except the current active session.
 */
export async function revokeAllOtherSessions(
  userId: string,
  currentSessionId: string,
): Promise<number> {
  const result = await prisma.session.updateMany({
    where: {
      userId,
      id: { not: currentSessionId },
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  return result.count;
}

/**
 * Revokes all active sessions for a user unconditionally (e.g. on password reset or account deletion).
 */
export async function revokeAllUserSessions(userId: string): Promise<number> {
  const result = await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  return result.count;
}
