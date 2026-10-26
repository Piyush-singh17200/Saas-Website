import crypto from "node:crypto";
import { prisma } from "@workspace/database";
import { ErrorCode } from "@workspace/contracts";
import { hashPassword } from "./password.service.js";
import { emailService } from "./email.service.js";
import { revokeAllUserSessions } from "./session.service.js";
import { recordAuditLog, SecurityAuditAction } from "./audit.service.js";
import { AppError } from "../middleware/error-handler.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

/**
 * Computes SHA-256 hash string for raw token storage.
 */
export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export interface PasswordResetAuditContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

/**
 * Initiates secure password reset request without disclosing email existence.
 */
export async function requestPasswordReset(
  email: string,
  context: PasswordResetAuditContext = {},
): Promise<{ success: boolean; message: string }> {
  const normalizedEmail = email.trim().toLowerCase();

  // Find user by normalized email
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, status: true },
  });

  // Always proceed with consistent timing to prevent user enumeration
  if (user && user.status === "ACTIVE") {
    // Invalidate any previously pending unused tokens for this user
    await prisma.passwordResetToken.deleteMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
    });

    // Generate 32 bytes cryptographically secure random token (256-bit entropy)
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    const appUrl = (env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
    const resetLink = `${appUrl}/reset-password?token=${rawToken}`;

    await emailService.sendPasswordResetEmail(user.email, resetLink);

    await recordAuditLog({
      actorId: user.id,
      action: SecurityAuditAction.AUTH_PASSWORD_RESET_REQUESTED,
      targetType: "user",
      targetId: user.id,
      outcome: "SUCCESS",
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      requestId: context.requestId,
    });
  } else {
    // Synthetic delay buffer to maintain uniform response timing
    await new Promise((resolve) => setTimeout(resolve, 50));
    logger.info("Password reset requested for non-existent or inactive email", {
      domain: normalizedEmail.split("@")[1],
    });
  }

  // Non-disclosing confirmation message
  return {
    success: true,
    message:
      "If an account exists with that email address, you will receive password reset instructions shortly.",
  };
}

/**
 * Confirms password reset using single-use cryptographic token.
 */
export async function confirmPasswordReset(
  rawToken: string,
  newPassword: string,
  context: PasswordResetAuditContext = {},
): Promise<{ success: boolean; message: string }> {
  if (
    !rawToken ||
    typeof rawToken !== "string" ||
    rawToken.trim().length === 0
  ) {
    throw new AppError(
      "Invalid or expired password reset token",
      400,
      ErrorCode.BAD_REQUEST,
    );
  }

  const tokenHash = hashToken(rawToken.trim());
  const now = new Date();

  // Atomically find valid, unexpired, unused reset token
  const resetTokenRecord = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          status: true,
        },
      },
    },
  });

  if (
    !resetTokenRecord ||
    resetTokenRecord.usedAt !== null ||
    resetTokenRecord.expiresAt < now
  ) {
    throw new AppError(
      "Invalid or expired password reset token. Please request a new link.",
      400,
      ErrorCode.BAD_REQUEST,
    );
  }

  if (resetTokenRecord.user.status === "DISABLED") {
    throw new AppError(
      "Account is suspended or disabled",
      403,
      ErrorCode.FORBIDDEN,
    );
  }

  const newPasswordHash = await hashPassword(newPassword);

  // Execute password update and token consumption atomically
  await prisma.$transaction(async (tx) => {
    // Mark token as consumed immediately to prevent replay
    await tx.passwordResetToken.update({
      where: { id: resetTokenRecord.id },
      data: { usedAt: now },
    });

    // Update user password hash
    await tx.user.update({
      where: { id: resetTokenRecord.userId },
      data: {
        passwordHash: newPasswordHash,
        updatedAt: now,
      },
    });

    // Invalidate all existing tokens for this user
    await tx.passwordResetToken.deleteMany({
      where: {
        userId: resetTokenRecord.userId,
        id: { not: resetTokenRecord.id },
      },
    });
  });

  // SECURITY: Revoke all existing sessions across all devices for this user
  await revokeAllUserSessions(resetTokenRecord.userId);

  await recordAuditLog({
    actorId: resetTokenRecord.userId,
    action: SecurityAuditAction.AUTH_PASSWORD_RESET_COMPLETED,
    targetType: "user",
    targetId: resetTokenRecord.userId,
    outcome: "SUCCESS",
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    requestId: context.requestId,
  });

  return {
    success: true,
    message:
      "Your password has been successfully reset. Please log in with your new password.",
  };
}
