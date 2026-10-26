import { prisma } from "@workspace/database";
import { ErrorCode, MembershipRole } from "@workspace/contracts";
import { verifyPassword } from "./password.service.js";
import { revokeAllUserSessions } from "./session.service.js";
import { recordAuditLog, SecurityAuditAction } from "./audit.service.js";
import { AppError } from "../middleware/error-handler.js";

export interface AccountDeletionParams {
  userId: string;
  password: string;
  confirmationPhrase: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export interface AccountDeletionResult {
  success: boolean;
  message: string;
  deletedOrganizationsCount: number;
}

/**
 * Permanently deletes user account after strict verification and ownership checks.
 */
export async function deleteUserAccount(
  params: AccountDeletionParams,
): Promise<AccountDeletionResult> {
  const { userId, password, confirmationPhrase, ipAddress, userAgent, requestId } = params;

  if (confirmationPhrase !== "DELETE MY ACCOUNT") {
    throw new AppError(
      'You must confirm deletion by typing "DELETE MY ACCOUNT"',
      400,
      ErrorCode.BAD_REQUEST,
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      memberships: {
        include: {
          organization: {
            include: {
              memberships: {
                select: { userId: true },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new AppError("User not found", 404, ErrorCode.NOT_FOUND);
  }

  // 1. Reauthenticate sensitive operation with password
  const isValidPassword = await verifyPassword(password, user.passwordHash);
  if (!isValidPassword) {
    throw new AppError(
      "Invalid password. Account deletion rejected for security.",
      401,
      ErrorCode.UNAUTHORIZED,
    );
  }

  // 2. Ownership Safeguard:
  // Check if user is the OWNER of an organization that has OTHER active members
  for (const membership of user.memberships) {
    if (membership.role === MembershipRole.OWNER) {
      const otherMembers = membership.organization.memberships.filter(
        (m) => m.userId !== userId,
      );

      if (otherMembers.length > 0) {
        throw new AppError(
          `Cannot delete account: You are the sole owner of organization "${membership.organization.name}" which has other active team members. Please transfer organization ownership or remove the members before deleting your account.`,
          409,
          ErrorCode.CONFLICT,
        );
      }
    }
  }

  // Identify organizations where user is the sole member/creator so they can be cleaned up
  const soloOrgIdsToDelete: string[] = [];
  for (const membership of user.memberships) {
    if (membership.role === MembershipRole.OWNER) {
      const otherMembers = membership.organization.memberships.filter(
        (m) => m.userId !== userId,
      );
      if (otherMembers.length === 0) {
        soloOrgIdsToDelete.push(membership.organizationId);
      }
    }
  }

  // 3. Execute cascading deletion in a safe transaction
  await prisma.$transaction(async (tx) => {
    // Delete solo organizations (cascades projects, tasks, comments, attachments)
    if (soloOrgIdsToDelete.length > 0) {
      await tx.organization.deleteMany({
        where: {
          id: { in: soloOrgIdsToDelete },
        },
      });
    }

    // Delete user memberships in remaining organizations
    await tx.membership.deleteMany({
      where: { userId },
    });

    // Delete all sessions and tokens
    await tx.session.deleteMany({
      where: { userId },
    });

    await tx.passwordResetToken.deleteMany({
      where: { userId },
    });

    await tx.emailVerificationToken.deleteMany({
      where: { userId },
    });

    await tx.mfaChallenge.deleteMany({
      where: { userId },
    });

    await tx.mfaRecoveryCode.deleteMany({
      where: { userId },
    });

    // Nullify or delete user-scoped notifications
    await tx.notification.deleteMany({
      where: { userId },
    });

    // Finally delete the user record
    await tx.user.delete({
      where: { id: userId },
    });
  });

  // 4. Revoke all active sessions immediately
  await revokeAllUserSessions(userId);

  // 5. Record security audit log
  await recordAuditLog({
    actorId: null,
    action: SecurityAuditAction.AUTH_ACCOUNT_DELETED,
    targetType: "user",
    targetId: userId,
    outcome: "SUCCESS",
    ipAddress,
    userAgent,
    requestId,
    metadata: {
      deletedEmail: user.email,
      soloOrganizationsDeleted: soloOrgIdsToDelete.length,
    },
  });

  return {
    success: true,
    message: "Your account and associated solo data have been permanently deleted.",
    deletedOrganizationsCount: soloOrgIdsToDelete.length,
  };
}
