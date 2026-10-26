import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import {
  ProjectQuerySchema,
  CreateProjectInputSchema,
  UpdateProjectInputSchema,
  TaskQuerySchema,
  CreateTaskInputSchema,
  UpdateTaskInputSchema,
  createSuccessResponse,
  ApiKeyScope,
  ErrorCode,
} from "@workspace/contracts";
import {
  requireDeveloperOrSessionAuth,
  requireScope,
} from "../middleware/developer-auth.middleware.js";
import { developerRateLimiter } from "../middleware/rate-limit.middleware.js";
import {
  listProjects,
  createProject,
  getProjectById,
  updateProject,
  archiveProject,
} from "../services/project.service.js";
import {
  listTasks,
  createTask,
  getTaskById,
  updateTask,
  deleteTask,
} from "../services/task.service.js";
import { prisma } from "@workspace/database";
import { AppError } from "../middleware/error-handler.js";

export const v1DeveloperRouter: Router = Router();

// Apply authentication and developer rate limiting across versioned developer endpoints
v1DeveloperRouter.use(
  ["/organization", "/projects", "/tasks"],
  developerRateLimiter,
  requireDeveloperOrSessionAuth,
);

function getParam(param: string | string[] | undefined): string {
  return Array.isArray(param) ? (param[0] ?? "") : (param ?? "");
}

/**
 * Resolves the authenticated organization ID for the request.
 */
function getCallerOrgId(req: Request): string {
  if (req.apiKey) {
    return req.apiKey.organizationId;
  }
  if (req.membership) {
    return req.membership.organizationId;
  }
  const orgId = getParam(req.params.organizationId);
  if (orgId) return orgId;
  throw new AppError(
    "No organization context found",
    400,
    ErrorCode.BAD_REQUEST,
  );
}

/**
 * Resolves the effective actor user ID for audit/ownership tracking.
 */
function getCallerUserId(req: Request): string {
  if (req.user) {
    return req.user.id;
  }
  if (req.apiKey) {
    return req.apiKey.createdById;
  }
  throw new AppError(
    "No authenticated user context found",
    401,
    ErrorCode.UNAUTHORIZED,
  );
}

// -----------------------------------------------------------------------------
// Organization Endpoint
// -----------------------------------------------------------------------------

/**
 * GET /api/v1/organization
 * Returns organization metadata for the authenticated API key / user.
 */
v1DeveloperRouter.get(
  "/organization",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getCallerOrgId(req);
      const organization = await prisma.organization.findUnique({
        where: { id: orgId },
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!organization) {
        throw new AppError("Organization not found", 404, ErrorCode.NOT_FOUND);
      }

      res.status(200).json(
        createSuccessResponse(
          {
            organization: {
              ...organization,
              createdAt: organization.createdAt.toISOString(),
              updatedAt: organization.updatedAt.toISOString(),
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

// -----------------------------------------------------------------------------
// Projects Endpoints
// -----------------------------------------------------------------------------

/**
 * GET /api/v1/projects
 * Lists projects in the authorized organization with pagination and filtering.
 */
v1DeveloperRouter.get(
  "/projects",
  requireScope(ApiKeyScope.PROJECTS_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getCallerOrgId(req);
      const query = ProjectQuerySchema.parse(req.query);

      const result = await listProjects(orgId, query);
      res.status(200).json(createSuccessResponse(result, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/projects
 * Creates a new project in the authorized organization.
 */
v1DeveloperRouter.post(
  "/projects",
  requireScope(ApiKeyScope.PROJECTS_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getCallerOrgId(req);
      const userId = getCallerUserId(req);
      const parsed = CreateProjectInputSchema.safeParse(req.body);

      if (!parsed.success) {
        throw new AppError(
          "Validation failed: " +
            parsed.error.issues.map((i) => i.message).join(", "),
          400,
          ErrorCode.VALIDATION_ERROR,
          parsed.error.format(),
        );
      }

      const result = await createProject(orgId, parsed.data, userId);
      res.status(201).json(createSuccessResponse({ project: result }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/projects/:projectId
 * Retrieves project details ensuring organization tenancy.
 */
v1DeveloperRouter.get(
  "/projects/:projectId",
  requireScope(ApiKeyScope.PROJECTS_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getCallerOrgId(req);
      const projectId = getParam(req.params.projectId);

      const project = await getProjectById(orgId, projectId);
      res.status(200).json(createSuccessResponse({ project }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/projects/:projectId
 * Updates a project in the authorized organization.
 */
v1DeveloperRouter.patch(
  "/projects/:projectId",
  requireScope(ApiKeyScope.PROJECTS_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getCallerOrgId(req);
      const projectId = getParam(req.params.projectId);
      const userId = getCallerUserId(req);
      const parsed = UpdateProjectInputSchema.safeParse(req.body);

      if (!parsed.success) {
        throw new AppError(
          "Validation failed: " +
            parsed.error.issues.map((i) => i.message).join(", "),
          400,
          ErrorCode.VALIDATION_ERROR,
          parsed.error.format(),
        );
      }

      const result = await updateProject(orgId, projectId, parsed.data, userId);
      res.status(200).json(createSuccessResponse({ project: result }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/projects/:projectId
 * Archives a project in the authorized organization.
 */
v1DeveloperRouter.delete(
  "/projects/:projectId",
  requireScope(ApiKeyScope.PROJECTS_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getCallerOrgId(req);
      const projectId = getParam(req.params.projectId);
      const userId = getCallerUserId(req);

      const result = await archiveProject(orgId, projectId, userId);
      res.status(200).json(createSuccessResponse({ project: result }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

// -----------------------------------------------------------------------------
// Tasks Endpoints
// -----------------------------------------------------------------------------

/**
 * GET /api/v1/projects/:projectId/tasks
 * Lists tasks in a project with filtering, search, sorting, and pagination.
 */
v1DeveloperRouter.get(
  "/projects/:projectId/tasks",
  requireScope(ApiKeyScope.TASKS_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getCallerOrgId(req);
      const projectId = getParam(req.params.projectId);
      const query = TaskQuerySchema.parse(req.query);

      const result = await listTasks(orgId, projectId, query);
      res.status(200).json(createSuccessResponse(result, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/projects/:projectId/tasks
 * Creates a task in a project.
 */
v1DeveloperRouter.post(
  "/projects/:projectId/tasks",
  requireScope(ApiKeyScope.TASKS_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getCallerOrgId(req);
      const projectId = getParam(req.params.projectId);
      const userId = getCallerUserId(req);
      const parsed = CreateTaskInputSchema.safeParse(req.body);

      if (!parsed.success) {
        throw new AppError(
          "Validation failed: " +
            parsed.error.issues.map((i) => i.message).join(", "),
          400,
          ErrorCode.VALIDATION_ERROR,
          parsed.error.format(),
        );
      }

      const task = await createTask(orgId, projectId, parsed.data, userId);
      res.status(201).json(createSuccessResponse({ task }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/tasks/:taskId
 * Retrieves task details while verifying tenant isolation.
 */
v1DeveloperRouter.get(
  "/tasks/:taskId",
  requireScope(ApiKeyScope.TASKS_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getCallerOrgId(req);
      const taskId = getParam(req.params.taskId);

      // Verify task belongs to tenant
      const existing = await prisma.task.findFirst({
        where: { id: taskId, organizationId: orgId },
      });

      if (!existing) {
        throw new AppError("Task not found", 404, ErrorCode.NOT_FOUND);
      }

      const task = await getTaskById(orgId, existing.projectId, taskId);
      res.status(200).json(createSuccessResponse({ task }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/tasks/:taskId
 * Updates task fields (title, description, status, priority, dueDate, assigneeId).
 */
v1DeveloperRouter.patch(
  "/tasks/:taskId",
  requireScope(ApiKeyScope.TASKS_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getCallerOrgId(req);
      const taskId = getParam(req.params.taskId);
      const userId = getCallerUserId(req);

      const existing = await prisma.task.findFirst({
        where: { id: taskId, organizationId: orgId },
      });

      if (!existing) {
        throw new AppError("Task not found", 404, ErrorCode.NOT_FOUND);
      }

      const parsed = UpdateTaskInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          "Validation failed: " +
            parsed.error.issues.map((i) => i.message).join(", "),
          400,
          ErrorCode.VALIDATION_ERROR,
          parsed.error.format(),
        );
      }

      const task = await updateTask(
        orgId,
        existing.projectId,
        taskId,
        parsed.data,
        userId,
      );
      res.status(200).json(createSuccessResponse({ task }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/tasks/:taskId
 * Deletes a task within the caller's organization.
 */
v1DeveloperRouter.delete(
  "/tasks/:taskId",
  requireScope(ApiKeyScope.TASKS_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getCallerOrgId(req);
      const taskId = getParam(req.params.taskId);
      const userId = getCallerUserId(req);

      const existing = await prisma.task.findFirst({
        where: { id: taskId, organizationId: orgId },
      });

      if (!existing) {
        throw new AppError("Task not found", 404, ErrorCode.NOT_FOUND);
      }

      await deleteTask(orgId, existing.projectId, taskId, userId);
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
