import type { Request, Response, NextFunction } from "express";
import { prisma, type MembershipRole } from "@workspace/database";
import { AppError } from "./error-handler.js";
import { ErrorCode } from "@workspace/contracts";

/**
 * Resolves and verifies that the authenticated user has an active membership
 * in the organization specified by req.params.organizationId.
 *
 * Uses non-disclosing 404 when the membership does not exist so attackers
 * cannot probe whether an arbitrary organizationId exists on the platform.
 */
export async function requireActiveMembership(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const orgParam = req.params.organizationId;
  const organizationId = Array.isArray(orgParam) ? orgParam[0] : orgParam;
  const user = req.user;

  if (!user) {
    return next(
      new AppError("Authentication required", 401, ErrorCode.UNAUTHORIZED),
    );
  }

  if (!organizationId) {
    return next(
      new AppError("Organization ID is required", 400, ErrorCode.BAD_REQUEST),
    );
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: {
        organizationId,
        userId: user.id,
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
      // Non-disclosing 404 to avoid tenant ID discovery
      return next(
        new AppError("Organization not found", 404, ErrorCode.NOT_FOUND),
      );
    }

    req.membership = membership;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Reusable permission check enforcing roles.
 */
export function requireRole(allowedRoles: MembershipRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const membership = req.membership;

    if (!membership) {
      return next(
        new AppError("Membership not verified", 403, ErrorCode.FORBIDDEN),
      );
    }

    if (!allowedRoles.includes(membership.role)) {
      return next(
        new AppError(
          "Insufficient permissions for this operation",
          403,
          ErrorCode.FORBIDDEN,
        ),
      );
    }

    next();
  };
}

/**
 * Enforces organization settings management permission (OWNER or ADMIN).
 */
export const canManageOrganization = requireRole(["OWNER", "ADMIN"]);

/**
 * Enforces membership invite/removal permission (OWNER or ADMIN).
 */
export const canManageMembers = requireRole(["OWNER", "ADMIN"]);

/**
 * Enforces role modification permission (OWNER only).
 */
export const canManageRoles = requireRole(["OWNER"]);
