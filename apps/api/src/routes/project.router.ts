import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import {
  CreateProjectInputSchema,
  UpdateProjectInputSchema,
  ProjectQuerySchema,
  createSuccessResponse,
  ErrorCode,
} from "@workspace/contracts";
import {
  createProject,
  listProjects,
  getProjectById,
  updateProject,
  archiveProject,
  restoreProject,
} from "../services/project.service.js";
import {
  requireActiveMembership,
  canManageOrganization,
} from "../middleware/organization.middleware.js";
import { AppError } from "../middleware/error-handler.js";
import { taskRouter } from "./task.router.js";

export const projectRouter: Router = Router({ mergeParams: true });

projectRouter.use("/:projectId/tasks", taskRouter);

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || "";
  return param || "";
}

/**
 * POST /api/v1/organizations/:organizationId/projects
 */
projectRouter.post(
  "/",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = CreateProjectInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid project input",
          400,
          ErrorCode.VALIDATION_ERROR,
          parsed.error.format(),
        );
      }

      const orgId = getParam(req.params.organizationId);
      const project = await createProject(orgId, parsed.data, req.user!.id);

      res.status(201).json(createSuccessResponse({ project }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/organizations/:organizationId/projects
 */
projectRouter.get(
  "/",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = ProjectQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid query parameters",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      const orgId = getParam(req.params.organizationId);
      const result = await listProjects(orgId, parsed.data);

      res.status(200).json(createSuccessResponse(result, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/organizations/:organizationId/projects/:projectId
 */
projectRouter.get(
  "/:projectId",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getParam(req.params.organizationId);
      const projectId = getParam(req.params.projectId);
      const project = await getProjectById(orgId, projectId);

      res.status(200).json(createSuccessResponse({ project }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/organizations/:organizationId/projects/:projectId
 */
projectRouter.patch(
  "/:projectId",
  requireActiveMembership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = UpdateProjectInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          parsed.error.issues[0]?.message || "Invalid project update data",
          400,
          ErrorCode.VALIDATION_ERROR,
        );
      }

      const orgId = getParam(req.params.organizationId);
      const projectId = getParam(req.params.projectId);
      const project = await updateProject(
        orgId,
        projectId,
        parsed.data,
        req.user!.id,
      );

      res.status(200).json(createSuccessResponse({ project }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/organizations/:organizationId/projects/:projectId/archive
 */
projectRouter.post(
  "/:projectId/archive",
  requireActiveMembership,
  canManageOrganization,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getParam(req.params.organizationId);
      const projectId = getParam(req.params.projectId);
      const project = await archiveProject(orgId, projectId, req.user!.id);

      res.status(200).json(createSuccessResponse({ project }, req.id));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/organizations/:organizationId/projects/:projectId/restore
 */
projectRouter.post(
  "/:projectId/restore",
  requireActiveMembership,
  canManageOrganization,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getParam(req.params.organizationId);
      const projectId = getParam(req.params.projectId);
      const project = await restoreProject(orgId, projectId, req.user!.id);

      res.status(200).json(createSuccessResponse({ project }, req.id));
    } catch (err) {
      next(err);
    }
  },
);
