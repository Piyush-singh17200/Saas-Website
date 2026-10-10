import { Router, type Request, type Response, type NextFunction } from "express";
import {
  NotificationListQuerySchema,
  createSuccessResponse,
  ErrorCode,
} from "@workspace/contracts";
import { notificationService } from "../services/notification.service.js";
import { requireActiveMembership } from "../middleware/organization.middleware.js";
import { AppError } from "../middleware/error-handler.js";

export const notificationRouter: Router = Router({ mergeParams: true });

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || "";
  return param || "";
}

/**
 * GET /api/v1/organizations/:organizationId/notifications
 */
notificationRouter.get(
  "/",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = NotificationListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid query parameters",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      const orgId = getParam(req.params.organizationId);
      const userId = (req as any).user.id;

      const result = await notificationService.listNotifications(
        orgId,
        userId,
        parsed.data,
      );

      res.status(200).json(createSuccessResponse(result, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/organizations/:organizationId/notifications/unread-count
 */
notificationRouter.get(
  "/unread-count",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getParam(req.params.organizationId);
      const userId = (req as any).user.id;

      const unreadCount = await notificationService.getUnreadCount(orgId, userId);
      res.status(200).json(createSuccessResponse({ unreadCount }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/organizations/:organizationId/notifications/:notificationId/read

 */
notificationRouter.patch(
  "/:notificationId/read",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getParam(req.params.organizationId);
      const notifId = getParam(req.params.notificationId);
      const userId = (req as any).user.id;

      const updated = await notificationService.markAsRead(orgId, userId, notifId);
      if (!updated) {
        throw new AppError("Notification not found", 404, ErrorCode.NOT_FOUND);
      }

      res.status(200).json(createSuccessResponse(updated, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/organizations/:organizationId/notifications/read-all
 */
notificationRouter.post(
  "/read-all",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getParam(req.params.organizationId);
      const userId = (req as any).user.id;

      const result = await notificationService.markAllAsRead(orgId, userId);
      res.status(200).json(createSuccessResponse(result, req.id));
    } catch (err) {
      next(err);
    }
  },
);
