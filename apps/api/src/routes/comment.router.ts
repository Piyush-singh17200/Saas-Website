import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import {
  CreateCommentInputSchema,
  UpdateCommentInputSchema,
  createSuccessResponse,
  ErrorCode,
} from "@workspace/contracts";
import {
  createComment,
  listComments,
  updateComment,
  deleteComment,
} from "../services/comment.service.js";
import { requireActiveMembership } from "../middleware/organization.middleware.js";
import { AppError } from "../middleware/error-handler.js";

export const commentRouter: Router = Router({ mergeParams: true });

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || "";
  return param || "";
}

/**
 * POST /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/comments
 */
commentRouter.post(
  "/",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = CreateCommentInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid comment input",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      const orgId = getParam(req.params.organizationId);
      const projectId = getParam(req.params.projectId);
      const taskId = getParam(req.params.taskId);
      const comment = await createComment(
        orgId,
        projectId,
        taskId,
        parsed.data,
        req.user!.id,
      );

      res.status(201).json(createSuccessResponse({ comment }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/comments
 */
commentRouter.get(
  "/",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit
        ? parseInt(req.query.limit as string, 10)
        : 50;

      const orgId = getParam(req.params.organizationId);
      const projectId = getParam(req.params.projectId);
      const taskId = getParam(req.params.taskId);
      const result = await listComments(orgId, projectId, taskId, page, limit);

      res.status(200).json(createSuccessResponse(result, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/comments/:commentId
 */
commentRouter.patch(
  "/:commentId",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = UpdateCommentInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid comment update data",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      const orgId = getParam(req.params.organizationId);
      const projectId = getParam(req.params.projectId);
      const taskId = getParam(req.params.taskId);
      const commentId = getParam(req.params.commentId);
      const comment = await updateComment(
        orgId,
        projectId,
        taskId,
        commentId,
        parsed.data,
        req.user!.id,
      );

      res.status(200).json(createSuccessResponse({ comment }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/comments/:commentId
 */
commentRouter.delete(
  "/:commentId",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getParam(req.params.organizationId);
      const projectId = getParam(req.params.projectId);
      const taskId = getParam(req.params.taskId);
      const commentId = getParam(req.params.commentId);
      await deleteComment(
        orgId,
        projectId,
        taskId,
        commentId,
        req.user!.id,
        req.membership!.role,
      );

      res
        .status(200)
        .json(
          createSuccessResponse(
            { message: "Comment deleted successfully" },
            req.id,
          ),
        );
    } catch (err) {
      next(err);
    }
  },
);
