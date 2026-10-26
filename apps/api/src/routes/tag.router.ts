import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import {
  CreateTagInputSchema,
  UpdateTagInputSchema,
  AssignTagsInputSchema,
  createSuccessResponse,
  ErrorCode,
} from "@workspace/contracts";
import {
  listTags,
  createTag,
  updateTag,
  deleteTag,
  assignTagsToTask,
  removeTagFromTask,
} from "../services/tag.service.js";
import { requireActiveMembership } from "../middleware/organization.middleware.js";
import { AppError } from "../middleware/error-handler.js";

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || "";
  return param || "";
}

/**
 * Router mounted at /api/v1/organizations/:organizationId/tags
 */
export const orgTagRouter: Router = Router({ mergeParams: true });

orgTagRouter.use(requireActiveMembership);

/**
 * GET /api/v1/organizations/:organizationId/tags
 */
orgTagRouter.get(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getParam(req.params.organizationId);
      const tags = await listTags(orgId);
      res.status(200).json(createSuccessResponse({ tags }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/organizations/:organizationId/tags
 */
orgTagRouter.post(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = CreateTagInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid tag input",
          400,
          ErrorCode.VALIDATION_ERROR,
          parsed.error.format(),
        );
      }

      const orgId = getParam(req.params.organizationId);
      const tag = await createTag(orgId, parsed.data);
      res.status(201).json(createSuccessResponse({ tag }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/organizations/:organizationId/tags/:tagId
 */
orgTagRouter.patch(
  "/:tagId",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = UpdateTagInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid tag update input",
          400,
          ErrorCode.VALIDATION_ERROR,
          parsed.error.format(),
        );
      }

      const orgId = getParam(req.params.organizationId);
      const tagId = getParam(req.params.tagId);
      const tag = await updateTag(orgId, tagId, parsed.data);
      res.status(200).json(createSuccessResponse({ tag }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/organizations/:organizationId/tags/:tagId
 */
orgTagRouter.delete(
  "/:tagId",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getParam(req.params.organizationId);
      const tagId = getParam(req.params.tagId);
      await deleteTag(orgId, tagId);
      res.status(200).json(createSuccessResponse({ deleted: true }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Router mounted at /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/tags
 */
export const taskTagRouter: Router = Router({ mergeParams: true });

taskTagRouter.use(requireActiveMembership);

/**
 * POST /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/tags
 */
taskTagRouter.post(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = AssignTagsInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid assign tags input",
          400,
          ErrorCode.VALIDATION_ERROR,
          parsed.error.format(),
        );
      }

      const orgId = getParam(req.params.organizationId);
      const projectId = getParam(req.params.projectId);
      const taskId = getParam(req.params.taskId);

      const tags = await assignTagsToTask(
        orgId,
        projectId,
        taskId,
        parsed.data.tagIds,
      );

      res.status(200).json(createSuccessResponse({ tags }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/tags/:tagId
 */
taskTagRouter.delete(
  "/:tagId",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getParam(req.params.organizationId);
      const projectId = getParam(req.params.projectId);
      const taskId = getParam(req.params.taskId);
      const tagId = getParam(req.params.tagId);

      await removeTagFromTask(orgId, projectId, taskId, tagId);

      res.status(200).json(createSuccessResponse({ removed: true }, req.id));
    } catch (err) {
      next(err);
    }
  },
);
