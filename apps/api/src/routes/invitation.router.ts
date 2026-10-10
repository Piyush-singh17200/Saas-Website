import { Router, type Request, type Response, type NextFunction } from "express";
import {
  CreateInvitationInputSchema,
  createSuccessResponse,
  ErrorCode,
} from "@workspace/contracts";
import { invitationService } from "../services/invitation.service.js";
import {
  requireActiveMembership,
  canManageMembers,
} from "../middleware/organization.middleware.js";
import { AppError } from "../middleware/error-handler.js";

export const invitationRouter: Router = Router({ mergeParams: true });

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || "";
  return param || "";
}

/**
 * GET /api/v1/organizations/:organizationId/invitations
 * Lists active pending invitations for the organization.
 */
invitationRouter.get(
  "/",
  requireActiveMembership,
  canManageMembers,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getParam(req.params.organizationId);
      const invitations = await invitationService.listPendingInvitations(orgId);
      res.status(200).json(createSuccessResponse({ invitations }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/organizations/:organizationId/invitations
 * Creates a new invitation. Admins can only invite MEMBERs; Owners can invite ADMIN or MEMBER.
 */
invitationRouter.post(
  "/",
  requireActiveMembership,
  canManageMembers,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = CreateInvitationInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid invitation payload",
          400,
          ErrorCode.VALIDATION_ERROR,
          parsed.error.format(),
        );
      }

      // Check role assignment permission: Only OWNER can invite another ADMIN
      if (parsed.data.role === "ADMIN" && req.membership!.role !== "OWNER") {
        throw new AppError(
          "Only organization owners can invite administrators",
          403,
          ErrorCode.FORBIDDEN,
        );
      }

      const orgId = getParam(req.params.organizationId);
      const invitation = await invitationService.createInvitation(
        orgId,
        req.user!.id,
        parsed.data,
        req.id,
      );

      res.status(201).json(createSuccessResponse({ invitation }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/organizations/:organizationId/invitations/:invitationId/revoke
 * Revokes a pending invitation.
 */
invitationRouter.post(
  "/:invitationId/revoke",
  requireActiveMembership,
  canManageMembers,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getParam(req.params.organizationId);
      const invitationId = getParam(req.params.invitationId);

      const result = await invitationService.revokeInvitation(
        orgId,
        invitationId,
        req.user!.id,
        req.id,
      );

      res.status(200).json(createSuccessResponse(result, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/organizations/:organizationId/invitations/:invitationId/resend
 * Resends a pending invitation with refreshed expiration.
 */
invitationRouter.post(
  "/:invitationId/resend",
  requireActiveMembership,
  canManageMembers,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getParam(req.params.organizationId);
      const invitationId = getParam(req.params.invitationId);

      const invitation = await invitationService.resendInvitation(
        orgId,
        invitationId,
        req.user!.id,
        req.id,
      );

      res.status(200).json(createSuccessResponse({ invitation }, req.id));
    } catch (err) {
      next(err);
    }
  },
);
