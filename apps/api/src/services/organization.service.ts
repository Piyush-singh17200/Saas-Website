import { randomBytes } from "node:crypto";
import {
  prisma,
  type Organization,
  type Membership,
  type MembershipRole,
} from "@workspace/database";
import { AppError } from "../middleware/error-handler.js";
import { ErrorCode, NotificationType } from "@workspace/contracts";
import { recordAuditLog } from "./audit.service.js";
import { assertCanAddMember } from "./entitlement.service.js";
import { notificationService } from "./notification.service.js";

export function normalizeSlug(nameOrSlug: string): string {
  const base = nameOrSlug
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return base || `org-${randomBytes(4).toString("hex")}`;
}

export interface CreateOrganizationParams {
  name: string;
  slug?: string;
  creatorId: string;
  requestId: string;
}

/**
 * Creates an organization and assigns initial OWNER membership in an atomic transaction.
 */
export async function createOrganization(
  params: CreateOrganizationParams,
): Promise<Organization & { role: MembershipRole }> {
  const chosenSlug = normalizeSlug(params.slug || params.name);

  // Check slug uniqueness beforehand or let DB constraint catch it
  const existing = await prisma.organization.findUnique({
    where: { slug: chosenSlug },
  });

  const finalSlug = existing
    ? `${chosenSlug}-${randomBytes(3).toString("hex")}`
    : chosenSlug;

  const result = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: params.name.trim(),
        slug: finalSlug,
        creatorId: params.creatorId,
      },
    });

    await tx.membership.create({
      data: {
        organizationId: org.id,
        userId: params.creatorId,
        role: "OWNER",
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    });

    await tx.subscription.create({
      data: {
        organizationId: org.id,
        plan: "FREE",
        status: "ACTIVE",
        cancelAtPeriodEnd: false,
      },
    });

    await recordAuditLog({
      tx,
      organizationId: org.id,
      actorId: params.creatorId,
      action: "ORGANIZATION_CREATED",
      targetType: "Organization",
      targetId: org.id,
      requestId: params.requestId,
      metadata: { name: org.name, slug: org.slug },
    });

    return org;
  });

  return { ...result, role: "OWNER" };
}

/**
 * Returns organizations where the current user has an ACTIVE membership.
 */
export async function listUserOrganizations(
  userId: string,
): Promise<Array<Organization & { role: MembershipRole }>> {
  const memberships = await prisma.membership.findMany({
    where: {
      userId,
      status: "ACTIVE",
      organization: {
        deletedAt: null,
      },
    },
    include: {
      organization: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return memberships.map((m) => ({
    ...m.organization,
    role: m.role,
  }));
}

/**
 * Retrieves a single organization for a user verifying active membership.
 */
export async function getOrganizationForUser(
  organizationId: string,
  userId: string,
): Promise<Organization & { role: MembershipRole }> {
  const membership = await prisma.membership.findFirst({
    where: {
      organizationId,
      userId,
      status: "ACTIVE",
      organization: {
        deletedAt: null,
      },
    },
    include: {
      organization: true,
    },
  });

  if (!membership) {
    throw new AppError("Organization not found", 404, ErrorCode.NOT_FOUND);
  }

  return {
    ...membership.organization,
    role: membership.role,
  };
}

/**
 * Updates organization details.
 */
export async function updateOrganization(
  organizationId: string,
  data: { name?: string },
  actorId: string,
  requestId: string,
): Promise<Organization> {
  const org = await prisma.organization.update({
    where: { id: organizationId },
    data: {
      ...(data.name ? { name: data.name.trim() } : {}),
    },
  });

  await recordAuditLog({
    organizationId,
    actorId,
    action: "ORGANIZATION_UPDATED",
    targetType: "Organization",
    targetId: organizationId,
    requestId,
    metadata: { updatedFields: Object.keys(data) },
  });

  return org;
}

/**
 * Lists all members of an organization.
 */
export async function listOrganizationMembers(organizationId: string): Promise<
  Array<
    Membership & {
      user: { id: string; email: string; displayName: string };
    }
  >
> {
  return prisma.membership.findMany({
    where: { organizationId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Updates a member's role with invariant checks.
 */
export async function updateMemberRole(
  organizationId: string,
  targetUserId: string,
  newRole: "ADMIN" | "MEMBER",
  actorId: string,
  requestId: string,
): Promise<Membership> {
  const targetMembership = await prisma.membership.findUnique({
    where: {
      org_user_membership_unique: {
        organizationId,
        userId: targetUserId,
      },
    },
  });

  if (!targetMembership) {
    throw new AppError("Member not found", 404, ErrorCode.NOT_FOUND);
  }

  // Prevent demoting the last owner
  if (targetMembership.role === "OWNER") {
    const ownerCount = await prisma.membership.count({
      where: {
        organizationId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    if (ownerCount <= 1) {
      throw new AppError(
        "Cannot demote the only organization owner. Transfer ownership first.",
        400,
        ErrorCode.BAD_REQUEST,
      );
    }
  }

  const updated = await prisma.membership.update({
    where: {
      org_user_membership_unique: {
        organizationId,
        userId: targetUserId,
      },
    },
    data: {
      role: newRole,
    },
  });

  await recordAuditLog({
    organizationId,
    actorId,
    action: "MEMBER_ROLE_UPDATED",
    targetType: "Membership",
    targetId: updated.id,
    requestId,
    metadata: {
      targetUserId,
      previousRole: targetMembership.role,
      newRole,
    },
  });

  return updated;
}

/**
 * Removes a member from the organization, validating that the last owner is preserved.
 */
export async function removeMember(
  organizationId: string,
  targetUserId: string,
  actorId: string,
  requestId: string,
): Promise<void> {
  const targetMembership = await prisma.membership.findUnique({
    where: {
      org_user_membership_unique: {
        organizationId,
        userId: targetUserId,
      },
    },
  });

  if (!targetMembership) {
    throw new AppError("Member not found", 404, ErrorCode.NOT_FOUND);
  }

  // If not self-removal, check that actor has appropriate role over target
  if (actorId !== targetUserId) {
    const actorMembership = await prisma.membership.findUnique({
      where: {
        org_user_membership_unique: {
          organizationId,
          userId: actorId,
        },
      },
    });

    if (!actorMembership) {
      throw new AppError(
        "Actor is not a member of this organization",
        403,
        ErrorCode.FORBIDDEN,
      );
    }

    if (actorMembership.role === "ADMIN") {
      if (
        targetMembership.role === "OWNER" ||
        targetMembership.role === "ADMIN"
      ) {
        throw new AppError(
          "Administrators cannot remove organization owners or other administrators",
          403,
          ErrorCode.FORBIDDEN,
        );
      }
    } else if (actorMembership.role !== "OWNER") {
      throw new AppError(
        "Insufficient permissions to remove this member",
        403,
        ErrorCode.FORBIDDEN,
      );
    }
  }

  // If removing an owner, verify there is at least one other active owner
  if (targetMembership.role === "OWNER") {
    const ownerCount = await prisma.membership.count({
      where: {
        organizationId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    if (ownerCount <= 1) {
      throw new AppError(
        "Cannot remove the last owner of the organization.",
        400,
        ErrorCode.BAD_REQUEST,
      );
    }
  }

  await prisma.membership.delete({
    where: {
      org_user_membership_unique: {
        organizationId,
        userId: targetUserId,
      },
    },
  });

  await recordAuditLog({
    organizationId,
    actorId,
    action: "MEMBER_REMOVED",
    targetType: "Membership",
    targetId: targetMembership.id,
    requestId,
    metadata: {
      targetUserId,
      previousRole: targetMembership.role,
    },
  });
}

/**
 * Adds a new active member to the organization, atomically enforcing subscription member limits.
 */
export async function addMemberToOrganization(
  organizationId: string,
  userEmail: string,
  role: "ADMIN" | "MEMBER",
  actorId: string,
  requestId: string,
): Promise<
  Membership & {
    user: { id: string; email: string; displayName: string };
  }
> {
  const targetUser = await prisma.user.findUnique({
    where: { email: userEmail.trim().toLowerCase() },
  });

  if (!targetUser) {
    throw new AppError(
      "User not found with the provided email",
      404,
      ErrorCode.NOT_FOUND,
    );
  }

  return prisma.$transaction(async (tx) => {
    // Atomically enforce member limits
    await assertCanAddMember(organizationId, tx);

    const existing = await tx.membership.findUnique({
      where: {
        org_user_membership_unique: {
          organizationId,
          userId: targetUser.id,
        },
      },
    });

    if (existing) {
      throw new AppError(
        "User is already a member of this organization",
        409,
        ErrorCode.CONFLICT,
      );
    }

    const membership = await tx.membership.create({
      data: {
        organizationId,
        userId: targetUser.id,
        role,
        status: "ACTIVE",
        joinedAt: new Date(),
      },
      include: {
        user: {
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
      action: "MEMBER_ADDED",
      targetType: "Membership",
      targetId: membership.id,
      requestId,
      metadata: {
        targetUserId: targetUser.id,
        role,
      },
    });

    await notificationService.queueNotification(tx, {
      type: NotificationType.ORG_INVITATION,
      organizationId,
      recipientUserId: targetUser.id,
      actorUserId: actorId,
      title: "Added to organization",
      body: `You have been added to the organization as ${role}.`,
      idempotencyKey: `member-added:${membership.id}`,
      correlationId: requestId,
    });

    return membership;
  });
}
