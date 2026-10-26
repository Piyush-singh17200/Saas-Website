import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import {
  CreateOrganizationInputSchema,
  UpdateOrganizationInputSchema,
  UpdateMemberRoleInputSchema,
  createSuccessResponse,
  ErrorCode,
} from "@workspace/contracts";
import {
  createOrganization,
  listUserOrganizations,
  getOrganizationForUser,
  updateOrganization,
  listOrganizationMembers,
  updateMemberRole,
  removeMember,
  addMemberToOrganization,
} from "../services/organization.service.js";
import { requireAuthenticatedUser } from "../middleware/auth.middleware.js";
import {
  requireActiveMembership,
  canManageOrganization,
  canManageRoles,
} from "../middleware/organization.middleware.js";
import { AppError } from "../middleware/error-handler.js";

import { projectRouter } from "./project.router.js";
import { activityRouter } from "./activity.router.js";
import { billingRouter } from "./billing.router.js";
import { notificationRouter } from "./notification.router.js";
import { invitationRouter } from "./invitation.router.js";
import { attachmentRouter } from "./attachment.router.js";
import { orgTagRouter } from "./tag.router.js";
import { developerRouter } from "./developer.router.js";

export const organizationRouter: Router = Router();

// Helper to normalize Express 5 route params
function getParam(param: string | string[] | undefined): string {
  return Array.isArray(param) ? (param[0] ?? "") : (param ?? "");
}

// All organization endpoints require an authenticated user
organizationRouter.use(requireAuthenticatedUser);

// Mount nested sub-resources
organizationRouter.use("/:organizationId/projects", projectRouter);
organizationRouter.use("/:organizationId/activity", activityRouter);
organizationRouter.use("/:organizationId/billing", billingRouter);
organizationRouter.use("/:organizationId/notifications", notificationRouter);
organizationRouter.use("/:organizationId/invitations", invitationRouter);
organizationRouter.use("/:organizationId/attachments", attachmentRouter);
organizationRouter.use("/:organizationId/tags", orgTagRouter);
organizationRouter.use("/:organizationId/developer", developerRouter);

/**
 * POST /api/v1/organizations
 * Creates a new organization with the current user as the initial OWNER.
 */
organizationRouter.post(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = CreateOrganizationInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid organization data",
          400,
          ErrorCode.VALIDATION_ERROR,
          parsed.error.format(),
        );
      }

      const org = await createOrganization({
        name: parsed.data.name,
        slug: parsed.data.slug,
        creatorId: req.user!.id,
        requestId: req.id,
      });

      res.status(201).json(
        createSuccessResponse(
          {
            organization: {
              id: org.id,
              name: org.name,
              slug: org.slug,
              creatorId: org.creatorId,
              role: org.role,
              createdAt: org.createdAt.toISOString(),
            },
          },
          req.id,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/organizations
 * Lists only organizations where the authenticated user has an active membership.
 */
organizationRouter.get(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgs = await listUserOrganizations(req.user!.id);
      res.status(200).json(
        createSuccessResponse(
          {
            organizations: orgs.map((org) => ({
              id: org.id,
              name: org.name,
              slug: org.slug,
              creatorId: org.creatorId,
              role: org.role,
              createdAt: org.createdAt.toISOString(),
            })),
          },
          req.id,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/organizations/:organizationId
 */
organizationRouter.get(
  "/:organizationId",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getParam(req.params.organizationId);
      const org = await getOrganizationForUser(orgId, req.user!.id);

      res.status(200).json(
        createSuccessResponse(
          {
            organization: {
              id: org.id,
              name: org.name,
              slug: org.slug,
              creatorId: org.creatorId,
              role: org.role,
              createdAt: org.createdAt.toISOString(),
            },
          },
          req.id,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/organizations/:organizationId
 */
organizationRouter.patch(
  "/:organizationId",
  requireActiveMembership,
  canManageOrganization,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = UpdateOrganizationInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid organization update data",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      const orgId = getParam(req.params.organizationId);
      const org = await updateOrganization(
        orgId,
        parsed.data,
        req.user!.id,
        req.id,
      );

      res.status(200).json(
        createSuccessResponse(
          {
            organization: {
              id: org.id,
              name: org.name,
              slug: org.slug,
              creatorId: org.creatorId,
              createdAt: org.createdAt.toISOString(),
            },
          },
          req.id,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/organizations/:organizationId/members
 */
organizationRouter.get(
  "/:organizationId/members",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getParam(req.params.organizationId);
      const members = await listOrganizationMembers(orgId);

      res.status(200).json(
        createSuccessResponse(
          {
            members: members.map((m) => ({
              id: m.id,
              organizationId: m.organizationId,
              userId: m.userId,
              role: m.role,
              status: m.status,
              createdAt: m.createdAt.toISOString(),
              joinedAt: m.joinedAt?.toISOString() || null,
              user: m.user,
            })),
          },
          req.id,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/organizations/:organizationId/members
 * Adds a new member to the organization with server-enforced entitlement member limits.
 */
organizationRouter.post(
  "/:organizationId/members",
  requireActiveMembership,
  canManageOrganization,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const email = req.body?.email;
      const role = req.body?.role || "MEMBER";

      if (!email || typeof email !== "string" || !email.includes("@")) {
        throw new AppError(
          "Valid email is required to add member",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      if (role !== "ADMIN" && role !== "MEMBER") {
        throw new AppError(
          "Role must be ADMIN or MEMBER",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      const orgId = getParam(req.params.organizationId);
      const member = await addMemberToOrganization(
        orgId,
        email,
        role,
        req.user!.id,
        req.id,
      );

      res.status(201).json(
        createSuccessResponse(
          {
            member: {
              id: member.id,
              organizationId: member.organizationId,
              userId: member.userId,
              role: member.role,
              status: member.status,
              createdAt: member.createdAt.toISOString(),
              joinedAt: member.joinedAt?.toISOString() || null,
              user: member.user,
            },
          },
          req.id,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/organizations/:organizationId/members/:userId
 */
organizationRouter.patch(
  "/:organizationId/members/:userId",
  requireActiveMembership,
  canManageRoles,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = UpdateMemberRoleInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid member role update data",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      const orgId = getParam(req.params.organizationId);
      const targetUserId = getParam(req.params.userId);

      const updated = await updateMemberRole(
        orgId,
        targetUserId,
        parsed.data.role,
        req.user!.id,
        req.id,
      );

      res.status(200).json(
        createSuccessResponse(
          {
            member: {
              id: updated.id,
              organizationId: updated.organizationId,
              userId: updated.userId,
              role: updated.role,
              status: updated.status,
              updatedAt: updated.updatedAt.toISOString(),
            },
          },
          req.id,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/organizations/:organizationId/members/:userId
 */
organizationRouter.delete(
  "/:organizationId/members/:userId",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getParam(req.params.organizationId);
      const targetUserId = getParam(req.params.userId);

      const isSelf = req.user!.id === targetUserId;
      const isManager =
        req.membership!.role === "OWNER" || req.membership!.role === "ADMIN";

      if (!isSelf && !isManager) {
        throw new AppError(
          "Insufficient permissions to remove this member",
          403,
          ErrorCode.FORBIDDEN,
        );
      }

      await removeMember(orgId, targetUserId, req.user!.id, req.id);

      res
        .status(200)
        .json(
          createSuccessResponse(
            { message: "Member removed successfully" },
            req.id,
          ),
        );
    } catch (err) {
      next(err);
    }
  },
);
