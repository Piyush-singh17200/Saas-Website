import crypto from "node:crypto";
import { prisma } from "@workspace/database";
import { ErrorCode } from "@workspace/contracts";
import { emailService } from "./email.service.js";
import { recordAuditLog, SecurityAuditAction } from "./audit.service.js";
import { AppError } from "../middleware/error-handler.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

const VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export interface EmailVerificationAuditContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

/**
 * Generates and dispatches a single-use email verification link.
 */
export async function sendEmailVerification(
  userId: string,
  email: string,
  context: EmailVerificationAuditContext = {},
): Promise<{ success: boolean; message: string }> {
  // Invalidate any previously pending unused verification tokens
  await prisma.emailVerificationToken.deleteMany({
    where: {
      userId,
      usedAt: null,
    },
  });

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + VERIFICATION_EXPIRY_MS);

  await prisma.emailVerificationToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  const appUrl = (env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const verificationLink = `${appUrl}/verify-email?token=${rawToken}`;

  await emailService.sendVerificationEmail(email, verificationLink);

  logger.info("Email verification link generated and dispatched", {
    userId,
    recipientDomain: email.split("@")[1],
    requestId: context.requestId,
    ipAddress: context.ipAddress,
  });

  return {
    success: true,
    message: "Verification email sent. Please check your inbox.",
  };
}

/**
 * Confirms email verification using a single-use token.
 */
export async function confirmEmailVerification(
  rawToken: string,
  context: EmailVerificationAuditContext = {},
): Promise<{ success: boolean; message: string }> {
  if (
    !rawToken ||
    typeof rawToken !== "string" ||
    rawToken.trim().length === 0
  ) {
    throw new AppError(
      "Invalid or expired verification token",
      400,
      ErrorCode.BAD_REQUEST,
    );
  }

  const tokenHash = hashToken(rawToken.trim());
  const now = new Date();

  const tokenRecord = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          emailVerified: true,
          status: true,
        },
      },
    },
  });

  if (
    !tokenRecord ||
    tokenRecord.usedAt !== null ||
    tokenRecord.expiresAt < now
  ) {
    throw new AppError(
      "Invalid or expired verification token. Please request a new verification email.",
      400,
      ErrorCode.BAD_REQUEST,
    );
  }

  // Atomically mark token as used and set user email as verified
  await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: now },
    });

    await tx.user.update({
      where: { id: tokenRecord.userId },
      data: {
        emailVerified: true,
        emailVerifiedAt: now,
        updatedAt: now,
      },
    });

    // Invalidate remaining verification tokens
    await tx.emailVerificationToken.deleteMany({
      where: {
        userId: tokenRecord.userId,
        id: { not: tokenRecord.id },
      },
    });
  });

  await recordAuditLog({
    actorId: tokenRecord.userId,
    action: SecurityAuditAction.AUTH_EMAIL_VERIFIED,
    targetType: "user",
    targetId: tokenRecord.userId,
    outcome: "SUCCESS",
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    requestId: context.requestId,
  });

  return {
    success: true,
    message: "Your email address has been successfully verified.",
  };
}

/**
 * Resends verification email timing-safely to prevent email enumeration.
 */
export async function resendVerificationEmail(
  email: string,
  context: EmailVerificationAuditContext = {},
): Promise<{ success: boolean; message: string }> {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, emailVerified: true, status: true },
  });

  if (user && user.status === "ACTIVE" && !user.emailVerified) {
    await sendEmailVerification(user.id, user.email, context);
  } else {
    // Artificial timing delay
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return {
    success: true,
    message:
      "If your account is unverified, a new verification link has been sent to your email address.",
  };
}
