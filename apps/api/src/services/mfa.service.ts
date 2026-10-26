import { randomBytes, createHash } from "node:crypto";
import { prisma, type User } from "@workspace/database";
import { AppError } from "../middleware/error-handler.js";
import { ErrorCode } from "@workspace/contracts";
import {
  generateTotpSecret,
  encryptSecret,
  decryptSecret,
  verifyTotp,
  generateOtpAuthUri,
  generateRecoveryCodes,
  hashRecoveryCode,
} from "../lib/crypto.js";
import { verifyPassword } from "./password.service.js";
import { recordAuditLog, SecurityAuditAction } from "./audit.service.js";

/**
 * Initiates MFA enrollment for an authenticated user.
 * Generates an encrypted secret and single-use recovery codes.
 * Returns the unencrypted secret and QR code URI strictly once during setup.
 */
export async function initiateMfaSetup(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, mfaEnabled: true },
  });

  if (!user) {
    throw new AppError("User not found", 404, ErrorCode.NOT_FOUND);
  }

  const plainSecret = generateTotpSecret();
  const encryptedSecret = encryptSecret(plainSecret);
  const rawRecoveryCodes = generateRecoveryCodes(10);

  // Clean up any unactivated recovery codes and prepare new ones in a transaction
  await prisma.$transaction(async (tx) => {
    // Delete any unconfirmed recovery codes
    await tx.mfaRecoveryCode.deleteMany({
      where: { userId },
    });

    // Save pending encrypted secret
    await tx.user.update({
      where: { id: userId },
      data: {
        mfaSecretEncrypted: encryptedSecret,
        mfaEnabled: false, // Remains disabled until verified
      },
    });

    // Store hashed recovery codes
    await tx.mfaRecoveryCode.createMany({
      data: rawRecoveryCodes.map((code) => ({
        userId,
        codeHash: hashRecoveryCode(code),
      })),
    });
  });

  const qrCodeUri = generateOtpAuthUri(
    user.email,
    "WorkSpace SaaS",
    plainSecret,
  );

  await recordAuditLog({
    actorId: userId,
    action: SecurityAuditAction.AUTH_MFA_SETUP_INITIATED,
    targetType: "user",
    targetId: userId,
    outcome: "SUCCESS",
  });

  return {
    secret: plainSecret,
    manualKey: plainSecret,
    qrCodeUri,
    recoveryCodes: rawRecoveryCodes,
  };
}

/**
 * Confirms and activates MFA after verifying a valid TOTP code.
 */
export async function confirmMfaEnrollment(userId: string, code: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || !user.mfaSecretEncrypted) {
    throw new AppError(
      "MFA setup has not been initiated",
      400,
      ErrorCode.BAD_REQUEST,
    );
  }

  if (user.mfaEnabled) {
    throw new AppError(
      "MFA is already enabled on this account",
      409,
      ErrorCode.CONFLICT,
    );
  }

  let plainSecret: string;
  try {
    plainSecret = decryptSecret(user.mfaSecretEncrypted);
  } catch {
    throw new AppError(
      "Failed to decrypt MFA secret configuration",
      500,
      ErrorCode.INTERNAL_ERROR,
    );
  }

  const verification = verifyTotp(plainSecret, code);
  if (!verification.valid) {
    await recordAuditLog({
      actorId: userId,
      action: SecurityAuditAction.AUTH_MFA_ENABLED,
      targetType: "user",
      targetId: userId,
      outcome: "FAILURE",
      metadata: { reason: "invalid_totp_code" },
    });
    throw new AppError(
      "Invalid verification code. Please check your authenticator clock and try again.",
      400,
      ErrorCode.VALIDATION_ERROR,
    );
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      mfaEnabled: true,
      mfaEnrolledAt: new Date(),
      mfaLastUsedCode: code,
      mfaLastUsedAt: new Date(),
    },
  });

  await recordAuditLog({
    actorId: userId,
    action: SecurityAuditAction.AUTH_MFA_ENABLED,
    targetType: "user",
    targetId: userId,
    outcome: "SUCCESS",
  });

  return { success: true };
}

/**
 * Disables MFA after verifying the user's password.
 */
export async function disableMfa(
  userId: string,
  passwordConfirmation: string,
  code?: string,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new AppError("User not found", 404, ErrorCode.NOT_FOUND);
  }

  if (!user.mfaEnabled) {
    throw new AppError(
      "MFA is not enabled on this account",
      400,
      ErrorCode.BAD_REQUEST,
    );
  }

  // Mandatory password reauthentication
  const isPasswordValid = await verifyPassword(
    passwordConfirmation,
    user.passwordHash,
  );
  if (!isPasswordValid) {
    await recordAuditLog({
      actorId: userId,
      action: SecurityAuditAction.AUTH_MFA_DISABLED,
      targetType: "user",
      targetId: userId,
      outcome: "FAILURE",
      metadata: { reason: "invalid_password_reauthentication" },
    });
    throw new AppError(
      "Current password is required to disable MFA",
      401,
      ErrorCode.UNAUTHORIZED,
    );
  }

  // If code was also provided, verify it
  if (code && user.mfaSecretEncrypted) {
    try {
      const plainSecret = decryptSecret(user.mfaSecretEncrypted);
      const verification = verifyTotp(plainSecret, code, {
        lastUsedCode: user.mfaLastUsedCode,
      });
      if (!verification.valid) {
        throw new AppError(
          "Invalid verification code",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        "Could not verify code",
        400,
        ErrorCode.VALIDATION_ERROR,
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecretEncrypted: null,
        mfaEnrolledAt: null,
        mfaLastUsedCode: null,
        mfaLastUsedAt: null,
      },
    });

    await tx.mfaRecoveryCode.deleteMany({
      where: { userId },
    });

    await tx.mfaChallenge.deleteMany({
      where: { userId },
    });
  });

  await recordAuditLog({
    actorId: userId,
    action: SecurityAuditAction.AUTH_MFA_DISABLED,
    targetType: "user",
    targetId: userId,
    outcome: "SUCCESS",
  });

  return { success: true };
}

/**
 * Regenerates a fresh set of single-use recovery codes after password reauthentication.
 */
export async function regenerateRecoveryCodes(
  userId: string,
  passwordConfirmation: string,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || !user.mfaEnabled) {
    throw new AppError(
      "MFA must be active to regenerate recovery codes",
      400,
      ErrorCode.BAD_REQUEST,
    );
  }

  const isPasswordValid = await verifyPassword(
    passwordConfirmation,
    user.passwordHash,
  );
  if (!isPasswordValid) {
    await recordAuditLog({
      actorId: userId,
      action: SecurityAuditAction.AUTH_MFA_RECOVERY_CODES_REGENERATED,
      targetType: "user",
      targetId: userId,
      outcome: "FAILURE",
      metadata: { reason: "invalid_password_reauthentication" },
    });
    throw new AppError(
      "Current password is required to regenerate recovery codes",
      401,
      ErrorCode.UNAUTHORIZED,
    );
  }

  const rawCodes = generateRecoveryCodes(10);

  await prisma.$transaction(async (tx) => {
    await tx.mfaRecoveryCode.deleteMany({
      where: { userId },
    });

    await tx.mfaRecoveryCode.createMany({
      data: rawCodes.map((code) => ({
        userId,
        codeHash: hashRecoveryCode(code),
      })),
    });
  });

  await recordAuditLog({
    actorId: userId,
    action: SecurityAuditAction.AUTH_MFA_RECOVERY_CODES_REGENERATED,
    targetType: "user",
    targetId: userId,
    outcome: "SUCCESS",
  });

  return { recoveryCodes: rawCodes };
}

/**
 * Issues a 5-minute restricted MFA challenge token for a user who successfully passed password verification.
 */
export async function createMfaChallenge(userId: string): Promise<string> {
  const rawChallengeToken = randomBytes(32).toString("base64url");
  const challengeHash = createHash("sha256")
    .update(rawChallengeToken)
    .digest("hex");
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes TTL

  await prisma.mfaChallenge.create({
    data: {
      userId,
      challengeHash,
      expiresAt,
    },
  });

  return rawChallengeToken;
}

/**
 * Verifies an MFA challenge using a TOTP code.
 * Ensures the challenge is single-use, non-expired, and the TOTP code has not been replayed.
 */
export async function verifyMfaChallenge(
  challengeToken: string,
  code: string,
): Promise<{ user: User }> {
  const challengeHash = createHash("sha256")
    .update(challengeToken)
    .digest("hex");

  const challenge = await prisma.mfaChallenge.findUnique({
    where: { challengeHash },
    include: { user: true },
  });

  if (!challenge || challenge.usedAt !== null) {
    throw new AppError(
      "Invalid or already used MFA challenge token",
      401,
      ErrorCode.UNAUTHORIZED,
    );
  }

  if (challenge.expiresAt.getTime() <= Date.now()) {
    throw new AppError(
      "MFA challenge token has expired. Please log in again.",
      401,
      ErrorCode.UNAUTHORIZED,
    );
  }

  const user = challenge.user;
  if (!user.mfaEnabled || !user.mfaSecretEncrypted) {
    throw new AppError(
      "MFA is not enabled for this account",
      400,
      ErrorCode.BAD_REQUEST,
    );
  }

  let plainSecret: string;
  try {
    plainSecret = decryptSecret(user.mfaSecretEncrypted);
  } catch {
    throw new AppError(
      "Failed to decrypt user MFA configuration",
      500,
      ErrorCode.INTERNAL_ERROR,
    );
  }

  const verification = verifyTotp(plainSecret, code, {
    lastUsedCode: user.mfaLastUsedCode,
  });

  if (!verification.valid) {
    await recordAuditLog({
      actorId: user.id,
      action: SecurityAuditAction.AUTH_MFA_LOGIN_SUCCESS,
      targetType: "user",
      targetId: user.id,
      outcome: "FAILURE",
      metadata: { reason: "invalid_or_replayed_totp_code" },
    });
    throw new AppError(
      "Invalid verification code or code has already been used",
      401,
      ErrorCode.UNAUTHORIZED,
    );
  }

  // Consume challenge and update user replay guard
  await prisma.$transaction([
    prisma.mfaChallenge.update({
      where: { id: challenge.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        mfaLastUsedCode: code,
        mfaLastUsedAt: new Date(),
      },
    }),
  ]);

  await recordAuditLog({
    actorId: user.id,
    action: SecurityAuditAction.AUTH_MFA_LOGIN_SUCCESS,
    targetType: "user",
    targetId: user.id,
    outcome: "SUCCESS",
  });

  return { user };
}

/**
 * Verifies an MFA challenge using a hashed, single-use recovery code.
 */
export async function verifyMfaRecoveryChallenge(
  challengeToken: string,
  recoveryCode: string,
): Promise<{ user: User }> {
  const challengeHash = createHash("sha256")
    .update(challengeToken)
    .digest("hex");

  const challenge = await prisma.mfaChallenge.findUnique({
    where: { challengeHash },
    include: { user: true },
  });

  if (!challenge || challenge.usedAt !== null) {
    throw new AppError(
      "Invalid or already used MFA challenge token",
      401,
      ErrorCode.UNAUTHORIZED,
    );
  }

  if (challenge.expiresAt.getTime() <= Date.now()) {
    throw new AppError(
      "MFA challenge token has expired. Please log in again.",
      401,
      ErrorCode.UNAUTHORIZED,
    );
  }

  const user = challenge.user;
  const targetCodeHash = hashRecoveryCode(recoveryCode);

  const matchingCode = await prisma.mfaRecoveryCode.findFirst({
    where: {
      userId: user.id,
      codeHash: targetCodeHash,
      usedAt: null,
    },
  });

  if (!matchingCode) {
    await recordAuditLog({
      actorId: user.id,
      action: SecurityAuditAction.AUTH_MFA_RECOVERY_LOGIN_SUCCESS,
      targetType: "user",
      targetId: user.id,
      outcome: "FAILURE",
      metadata: { reason: "invalid_or_used_recovery_code" },
    });
    throw new AppError(
      "Invalid or already used recovery code",
      401,
      ErrorCode.UNAUTHORIZED,
    );
  }

  // Consume both recovery code and challenge atomically
  await prisma.$transaction([
    prisma.mfaRecoveryCode.update({
      where: { id: matchingCode.id },
      data: { usedAt: new Date() },
    }),
    prisma.mfaChallenge.update({
      where: { id: challenge.id },
      data: { usedAt: new Date() },
    }),
  ]);

  await recordAuditLog({
    actorId: user.id,
    action: SecurityAuditAction.AUTH_MFA_RECOVERY_LOGIN_SUCCESS,
    targetType: "user",
    targetId: user.id,
    outcome: "SUCCESS",
  });

  return { user };
}
