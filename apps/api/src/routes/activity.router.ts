import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import {
  ActivityQuerySchema,
  createSuccessResponse,
  ErrorCode,
} from "@workspace/contracts";
import { listOrganizationActivities } from "../services/activity.service.js";
import { requireActiveMembership } from "../middleware/organization.middleware.js";
import { AppError } from "../middleware/error-handler.js";

export const activityRouter: Router = Router({ mergeParams: true });

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || "";
  return param || "";
}

/**
 * GET /api/v1/organizations/:organizationId/activity
 */
activityRouter.get(
  "/",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = ActivityQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid query parameters",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      const orgId = getParam(req.params.organizationId);
      const result = await listOrganizationActivities(orgId, parsed.data);

      res.status(200).json(createSuccessResponse(result, req.id));
    } catch (err) {
      next(err);
    }
  },
);
