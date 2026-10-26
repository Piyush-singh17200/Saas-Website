import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import {
  CreateTaskInputSchema,
  UpdateTaskInputSchema,
  MoveTaskInputSchema,
  AssignTaskInputSchema,
  TaskQuerySchema,
  createSuccessResponse,
  ErrorCode,
} from "@workspace/contracts";
import {
  createTask,
  listTasks,
  getTaskById,
  updateTask,
  moveTask,
  assignTask,
  deleteTask,
} from "../services/task.service.js";
import { requireActiveMembership } from "../middleware/organization.middleware.js";
import { AppError } from "../middleware/error-handler.js";
import { commentRouter } from "./comment.router.js";
import { attachmentRouter } from "./attachment.router.js";
import { taskTagRouter } from "./tag.router.js";

export const taskRouter: Router = Router({ mergeParams: true });

taskRouter.use("/:taskId/comments", commentRouter);
taskRouter.use("/:taskId/attachments", attachmentRouter);
taskRouter.use("/:taskId/tags", taskTagRouter);

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || "";
  return param || "";
}

/**
 * POST /api/v1/organizations/:organizationId/projects/:projectId/tasks
 */
taskRouter.post(
  "/",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = CreateTaskInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid task input",
          400,
          ErrorCode.VALIDATION_ERROR,
          parsed.error.format(),
        );
      }

      const orgId = getParam(req.params.organizationId);
      const projectId = getParam(req.params.projectId);
      const task = await createTask(
        orgId,
        projectId,
        parsed.data,
        req.user!.id,
      );

      res.status(201).json(createSuccessResponse({ task }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/organizations/:organizationId/projects/:projectId/tasks
 */
taskRouter.get(
  "/",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = TaskQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid query parameters",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      const orgId = getParam(req.params.organizationId);
      const projectId = getParam(req.params.projectId);
      const result = await listTasks(orgId, projectId, parsed.data);

      res.status(200).json(createSuccessResponse(result, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId
 */
taskRouter.get(
  "/:taskId",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getParam(req.params.organizationId);
      const projectId = getParam(req.params.projectId);
      const taskId = getParam(req.params.taskId);
      const task = await getTaskById(orgId, projectId, taskId);

      res.status(200).json(createSuccessResponse({ task }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId
 */
taskRouter.patch(
  "/:taskId",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = UpdateTaskInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid task update data",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      const orgId = getParam(req.params.organizationId);
      const projectId = getParam(req.params.projectId);
      const taskId = getParam(req.params.taskId);
      const task = await updateTask(
        orgId,
        projectId,
        taskId,
        parsed.data,
        req.user!.id,
      );

      res.status(200).json(createSuccessResponse({ task }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/assign
 */
taskRouter.post(
  "/:taskId/assign",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = AssignTaskInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid assignment data",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      const orgId = getParam(req.params.organizationId);
      const projectId = getParam(req.params.projectId);
      const taskId = getParam(req.params.taskId);
      const task = await assignTask(
        orgId,
        projectId,
        taskId,
        parsed.data,
        req.user!.id,
      );

      res.status(200).json(createSuccessResponse({ task }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId/move
 */
taskRouter.post(
  "/:taskId/move",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = MoveTaskInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid move data",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      const orgId = getParam(req.params.organizationId);
      const projectId = getParam(req.params.projectId);
      const taskId = getParam(req.params.taskId);
      const task = await moveTask(
        orgId,
        projectId,
        taskId,
        parsed.data,
        req.user!.id,
      );

      res.status(200).json(createSuccessResponse({ task }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/organizations/:organizationId/projects/:projectId/tasks/:taskId
 */
taskRouter.delete(
  "/:taskId",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getParam(req.params.organizationId);
      const projectId = getParam(req.params.projectId);
      const taskId = getParam(req.params.taskId);
      await deleteTask(orgId, projectId, taskId, req.user!.id);

      res
        .status(200)
        .json(
          createSuccessResponse(
            { message: "Task deleted successfully" },
            req.id,
          ),
        );
    } catch (err) {
      next(err);
    }
  },
);
