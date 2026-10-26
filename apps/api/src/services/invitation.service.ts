import { randomBytes, createHash } from "node:crypto";
import {
  prisma,
  withAdminBypassTransaction,
  withTenantTransaction,
} from "@workspace/database";
import {
  type InvitationResponse,
  type CreateInvitationInput,
  type PublicInvitationDetails,
  type AcceptInvitationResult,
  NotificationType,
  ErrorCode,
} from "@workspace/contracts";
import { AppError } from "../middleware/error-handler.js";
import { assertCanAddMember } from "./entitlement.service.js";
import { recordAuditLog } from "./audit.service.js";
import { notificationService } from "./notification.service.js";

import { logger } from "../lib/logger.js";

export class InvitationService {
  /**
   * Lists active, pending invitations for an organization.
   * Excludes expired, accepted, and revoked invitations.
   */
  public async listPendingInvitations(
    organizationId: string,
  ): Promise<InvitationResponse[]> {
    const now = new Date();
    const invites = await prisma.invitation.findMany({
      where: {
        organizationId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
      include: {
        inviter: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
    });

    return invites.map((inv) => ({
      id: inv.id,
      organizationId: inv.organizationId,
      email: inv.email,
      role: inv.role,
      expiresAt: inv.expiresAt.toISOString(),
      createdAt: inv.createdAt.toISOString(),
      acceptedAt: inv.acceptedAt ? inv.acceptedAt.toISOString() : null,
      revokedAt: inv.revokedAt ? inv.revokedAt.toISOString() : null,
      inviter: inv.inviter,
    }));
  }

  /**
   * Creates an invitation for an email address.
   * Atomically verifies seat limits, checks for existing memberships/invites,
   * generates a secure token hash, and optionally notifies existing user accounts.
   */
  public async createInvitation(
    organizationId: string,
    inviterId: string,
    input: CreateInvitationInput,
    requestId?: string,
  ): Promise<InvitationResponse> {
    const normalizedEmail = input.email.trim().toLowerCase();

    return withTenantTransaction(organizationId, async (tx) => {
      // 1. Atomically enforce member seat entitlement limits
      await assertCanAddMember(organizationId, tx);

      // 2. Check if user with this email is already a member
      const existingMember = await tx.membership.findFirst({
        where: {
          organizationId,
          user: { email: normalizedEmail },
        },
      });

      if (existingMember) {
        throw new AppError(
          "User is already a member of this organization",
          409,
          ErrorCode.CONFLICT,
        );
      }

      // 3. Check if active pending invitation already exists
      const existingInvite = await tx.invitation.findFirst({
        where: {
          organizationId,
          email: normalizedEmail,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });

      if (existingInvite) {
        throw new AppError(
          "An active pending invitation already exists for this email address",
          409,
          ErrorCode.CONFLICT,
        );
      }

      // 4. Generate cryptographically random token
      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      // 5. Insert invitation record
      const invitation = await tx.invitation.create({
        data: {
          organizationId,
          email: normalizedEmail,
          role: input.role,
          tokenHash,
          inviterId,
          expiresAt,
        },
        include: {
          inviter: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      });

      // 6. Record security audit log
      await recordAuditLog({
        tx,
        organizationId,
        actorId: inviterId,
        action: "INVITATION_CREATED",
        targetType: "Invitation",
        targetId: invitation.id,
        requestId,
        metadata: {
          email: normalizedEmail,
          role: input.role,
          expiresAt: expiresAt.toISOString(),
        },
      });

      // 7. If invited user already exists in the system, enqueue an in-app notification
      const existingUser = await tx.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (existingUser) {
        await notificationService.queueNotification(tx, {
          type: NotificationType.ORG_INVITATION,
          organizationId,
          recipientUserId: existingUser.id,
          actorUserId: inviterId,
          title: "Organization Invitation",
          body: `You have been invited to join the organization as ${input.role}.`,
          idempotencyKey: `invite:${invitation.id}:${existingUser.id}`,
          correlationId: requestId,
        });
      }

      logger.info("Organization invitation created", {
        organizationId,
        invitationId: invitation.id,
        email: normalizedEmail,
        role: input.role,
        inviterId,
      });

      return {
        id: invitation.id,
        organizationId: invitation.organizationId,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt.toISOString(),
        createdAt: invitation.createdAt.toISOString(),
        acceptedAt: null,
        revokedAt: null,
        inviter: invitation.inviter,
        token: rawToken,
      };
    });
  }

  /**
   * Revokes an existing pending invitation.
   */
  public async revokeInvitation(
    organizationId: string,
    invitationId: string,
    actorId: string,
    requestId?: string,
  ): Promise<{ message: string }> {
    return withTenantTransaction(organizationId, async (tx) => {
      const invite = await tx.invitation.findFirst({
        where: {
          id: invitationId,
          organizationId,
        },
      });

      if (!invite) {
        throw new AppError("Invitation not found", 404, ErrorCode.NOT_FOUND);
      }

      if (invite.acceptedAt || invite.revokedAt) {
        throw new AppError(
          "Invitation is no longer pending",
          400,
          ErrorCode.BAD_REQUEST,
        );
      }

      await tx.invitation.update({
        where: { id: invitationId },
        data: { revokedAt: new Date() },
      });

      await recordAuditLog({
        tx,
        organizationId,
        actorId,
        action: "INVITATION_REVOKED",
        targetType: "Invitation",
        targetId: invitationId,
        requestId,
        metadata: {
          email: invite.email,
        },
      });

      logger.info("Organization invitation revoked", {
        organizationId,
        invitationId,
        actorId,
      });

      return { message: "Invitation revoked successfully" };
    });
  }

  /**
   * Resends an existing pending invitation with a renewed expiry date.
   */
  public async resendInvitation(
    organizationId: string,
    invitationId: string,
    actorId: string,
    requestId?: string,
  ): Promise<InvitationResponse> {
    return withTenantTransaction(organizationId, async (tx) => {
      const invite = await tx.invitation.findFirst({
        where: {
          id: invitationId,
          organizationId,
        },
        include: {
          inviter: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      });

      if (!invite) {
        throw new AppError("Invitation not found", 404, ErrorCode.NOT_FOUND);
      }

      if (invite.acceptedAt || invite.revokedAt) {
        throw new AppError(
          "Cannot resend an invitation that has already been resolved or revoked",
          400,
          ErrorCode.BAD_REQUEST,
        );
      }

      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const updated = await tx.invitation.update({
        where: { id: invitationId },
        data: {
          tokenHash,
          expiresAt,
        },
        include: {
          inviter: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      });

      await recordAuditLog({
        tx,
        organizationId,
        actorId,
        action: "INVITATION_RESENT",
        targetType: "Invitation",
        targetId: invitationId,
        requestId,
        metadata: {
          email: invite.email,
          newExpiresAt: expiresAt.toISOString(),
        },
      });

      // Re-notify user if account exists
      const existingUser = await tx.user.findUnique({
        where: { email: invite.email },
      });

      if (existingUser) {
        await notificationService.queueNotification(tx, {
          type: NotificationType.ORG_INVITATION,
          organizationId,
          recipientUserId: existingUser.id,
          actorUserId: actorId,
          title: "Organization Invitation Resent",
          body: `Your invitation to join the organization as ${invite.role} has been refreshed.`,
          idempotencyKey: `invite-resent:${invitationId}:${Date.now()}`,
          correlationId: requestId,
        });
      }

      logger.info("Organization invitation resent", {
        organizationId,
        invitationId,
        actorId,
      });

      return {
        id: updated.id,
        organizationId: updated.organizationId,
        email: updated.email,
        role: updated.role,
        expiresAt: updated.expiresAt.toISOString(),
        createdAt: updated.createdAt.toISOString(),
        acceptedAt: null,
        revokedAt: null,
        inviter: updated.inviter,
        token: rawToken,
      };
    });
  }

  /**
   * Retrieves public details of an invitation by its raw token.
   * Does not require authentication, but validates token and expiration.
   */
  public async getInvitationByToken(
    rawToken: string,
  ): Promise<PublicInvitationDetails> {
    if (
      !rawToken ||
      typeof rawToken !== "string" ||
      rawToken.trim().length < 16
    ) {
      throw new AppError("Invalid invitation token", 404, ErrorCode.NOT_FOUND);
    }
    const tokenHash = createHash("sha256")
      .update(rawToken.trim())
      .digest("hex");
    // Invitation tokens are bearer secrets and are intentionally resolved
    // across tenants using the administrative bypass. The token hash is the
    // only lookup key; no caller-supplied organization ID is trusted here.
    const invite = await withAdminBypassTransaction((tx) =>
      tx.invitation.findUnique({
        where: { tokenHash },
        include: {
          organization: {
            select: { id: true, name: true, slug: true },
          },
          inviter: {
            select: { displayName: true },
          },
        },
      }),
    );

    if (!invite) {
      throw new AppError("Invitation not found", 404, ErrorCode.NOT_FOUND);
    }

    if (invite.revokedAt) {
      throw new AppError(
        "This invitation has been revoked",
        400,
        ErrorCode.BAD_REQUEST,
      );
    }

    if (invite.acceptedAt) {
      throw new AppError(
        "This invitation has already been accepted",
        400,
        ErrorCode.BAD_REQUEST,
      );
    }

    const isExpired = invite.expiresAt.getTime() <= Date.now();
    if (isExpired) {
      throw new AppError(
        "This invitation has expired",
        400,
        ErrorCode.BAD_REQUEST,
      );
    }

    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
      isExpired,
      organization: invite.organization,
      inviter: {
        displayName: invite.inviter.displayName,
      },
    };
  }

  /**
   * Accepts an invitation using a raw token.
   * Requires an authenticated user whose email matches the invitation recipient.
   * Enforces seat limits and tenant isolation atomically.
   */
  public async acceptInvitation(
    rawToken: string,
    user: { id: string; email: string; displayName: string },
    requestId?: string,
  ): Promise<AcceptInvitationResult> {
    if (
      !rawToken ||
      typeof rawToken !== "string" ||
      rawToken.trim().length < 16
    ) {
      throw new AppError("Invalid invitation token", 404, ErrorCode.NOT_FOUND);
    }
    const tokenHash = createHash("sha256")
      .update(rawToken.trim())
      .digest("hex");

    return withAdminBypassTransaction(async (tx) => {
      const invite = await tx.invitation.findUnique({
        where: { tokenHash },
        include: {
          organization: {
            select: { id: true, name: true, slug: true },
          },
        },
      });

      if (!invite) {
        throw new AppError("Invitation not found", 404, ErrorCode.NOT_FOUND);
      }

      if (invite.revokedAt) {
        throw new AppError(
          "This invitation has been revoked",
          400,
          ErrorCode.BAD_REQUEST,
        );
      }

      if (invite.acceptedAt) {
        throw new AppError(
          "This invitation has already been accepted",
          400,
          ErrorCode.BAD_REQUEST,
        );
      }

      if (invite.expiresAt.getTime() <= Date.now()) {
        throw new AppError(
          "This invitation has expired",
          400,
          ErrorCode.BAD_REQUEST,
        );
      }

      // Verify authenticated user's email matches the invited email
      if (
        user.email.trim().toLowerCase() !== invite.email.trim().toLowerCase()
      ) {
        throw new AppError(
          `This invitation was sent to ${invite.email}. You are currently signed in as ${user.email}. Please switch accounts to accept this invitation.`,
          403,
          ErrorCode.FORBIDDEN,
        );
      }

      // Check if user is already a member
      const existingMember = await tx.membership.findFirst({
        where: {
          organizationId: invite.organizationId,
          userId: user.id,
        },
      });

      if (existingMember) {
        // Mark invitation accepted to resolve pending state
        await tx.invitation.update({
          where: { id: invite.id },
          data: { acceptedAt: new Date() },
        });

        return {
          organizationId: invite.organizationId,
          organizationName: invite.organization.name,
          organizationSlug: invite.organization.slug,
          role: existingMember.role,
          message: "You are already a member of this organization",
        };
      }

      // Enforce seat entitlement limits
      await assertCanAddMember(invite.organizationId, tx);

      // Create active membership
      await tx.membership.create({
        data: {
          organizationId: invite.organizationId,
          userId: user.id,
          role: invite.role,
          status: "ACTIVE",
          joinedAt: new Date(),
        },
      });

      // Mark invitation accepted
      await tx.invitation.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });

      // Record audit log
      await recordAuditLog({
        tx,
        organizationId: invite.organizationId,
        actorId: user.id,
        action: "INVITATION_ACCEPTED",
        targetType: "Invitation",
        targetId: invite.id,
        requestId,
        metadata: {
          email: invite.email,
          role: invite.role,
          userId: user.id,
        },
      });

      logger.info("Organization invitation accepted", {
        organizationId: invite.organizationId,
        invitationId: invite.id,
        userId: user.id,
        role: invite.role,
      });

      return {
        organizationId: invite.organizationId,
        organizationName: invite.organization.name,
        organizationSlug: invite.organization.slug,
        role: invite.role,
        message: "Invitation accepted successfully",
      };
    });
  }
}

export const invitationService = new InvitationService();
