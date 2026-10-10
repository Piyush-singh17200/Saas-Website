import { prisma, withTenantTransaction } from "@workspace/database";
import {
  ErrorCode,
  type CreateProjectInput,
  type UpdateProjectInput,
  type ProjectResponse,
  type PaginatedResult,
  type ProjectQuery,
} from "@workspace/contracts";
import { AppError } from "../middleware/error-handler.js";
import { recordActivity } from "./activity.service.js";
import { assertCanCreateActiveProject } from "./entitlement.service.js";

/**
 * Normalizes a name string into an alphanumeric hyphenated slug.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Creates a project within an organization.
 * Enforces organization-scoped slug uniqueness and records PROJECT_CREATED activity.
 */
export async function createProject(
  organizationId: string,
  input: CreateProjectInput,
  userId: string,
): Promise<ProjectResponse> {
  const slug = input.slug ? slugify(input.slug) : slugify(input.name);

  if (!slug) {
    throw new AppError(
      "Project name must contain valid alphanumeric characters for slug generation",
      400,
      ErrorCode.VALIDATION_ERROR,
    );
  }

  // Check slug uniqueness within this organization
  const existing = await prisma.project.findUnique({
    where: {
      org_project_slug_unique: {
        organizationId,
        slug,
      },
    },
  });

  if (existing) {
    throw new AppError(
      `Project with identifier '${slug}' already exists in this organization`,
      409,
      ErrorCode.CONFLICT,
    );
  }

  return withTenantTransaction(organizationId, async (tx) => {
    // Atomically enforce plan limits on active projects
    await assertCanCreateActiveProject(organizationId, tx);

    const project = await tx.project.create({
      data: {
        organizationId,
        name: input.name.trim(),
        slug,
        description: input.description?.trim() || null,
        status: "ACTIVE",
        createdById: userId,
      },
    });

    await recordActivity(tx, {
      organizationId,
      actorId: userId,
      eventType: "PROJECT_CREATED",
      entityType: "PROJECT",
      entityId: project.id,
      metadata: {
        name: project.name,
        slug: project.slug,
      },
    });

    return {
      id: project.id,
      organizationId: project.organizationId,
      name: project.name,
      slug: project.slug,
      description: project.description,
      status: project.status,
      createdById: project.createdById,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      archivedAt: project.archivedAt?.toISOString() || null,
      taskCount: 0,
    };
  });
}

/**
 * Lists projects belonging to the specified organization with pagination and filtering.
 */
export async function listProjects(
  organizationId: string,
  query: ProjectQuery,
): Promise<PaginatedResult<ProjectResponse>> {
  const page = Math.max(1, query.page || 1);
  const limit = Math.min(100, Math.max(1, query.limit || 20));
  const skip = (page - 1) * limit;

  const where = {
    organizationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" as const } },
            { slug: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, projects] = await Promise.all([
    prisma.project.count({ where }),
    prisma.project.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        _count: {
          select: { tasks: true },
        },
      },
    }),
  ]);

  return {
    items: projects.map((p) => ({
      id: p.id,
      organizationId: p.organizationId,
      name: p.name,
      slug: p.slug,
      description: p.description,
      status: p.status,
      createdById: p.createdById,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      archivedAt: p.archivedAt?.toISOString() || null,
      taskCount: p._count.tasks,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

/**
 * Retrieves a single project by ID within the organization.
 */
export async function getProjectById(
  organizationId: string,
  projectId: string,
): Promise<ProjectResponse> {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId,
    },
    include: {
      _count: {
        select: { tasks: true },
      },
    },
  });

  if (!project) {
    throw new AppError("Project not found", 404, ErrorCode.NOT_FOUND);
  }

  return {
    id: project.id,
    organizationId: project.organizationId,
    name: project.name,
    slug: project.slug,
    description: project.description,
    status: project.status,
    createdById: project.createdById,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    archivedAt: project.archivedAt?.toISOString() || null,
    taskCount: project._count.tasks,
  };
}

/**
 * Updates project details (name, description).
 */
export async function updateProject(
  organizationId: string,
  projectId: string,
  input: UpdateProjectInput,
  userId: string,
): Promise<ProjectResponse> {
  const existing = await prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId,
    },
  });

  if (!existing) {
    throw new AppError("Project not found", 404, ErrorCode.NOT_FOUND);
  }

  if (existing.status === "ARCHIVED") {
    throw new AppError(
      "Cannot modify an archived project. Restore it first.",
      400,
      ErrorCode.BAD_REQUEST,
    );
  }

  return withTenantTransaction(organizationId, async (tx) => {
    const updated = await tx.project.update({
      where: { id: projectId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() || null }
          : {}),
      },
      include: {
        _count: {
          select: { tasks: true },
        },
      },
    });

    await recordActivity(tx, {
      organizationId,
      actorId: userId,
      eventType: "PROJECT_UPDATED",
      entityType: "PROJECT",
      entityId: projectId,
      metadata: {
        name: updated.name,
      },
    });

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      name: updated.name,
      slug: updated.slug,
      description: updated.description,
      status: updated.status,
      createdById: updated.createdById,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      archivedAt: updated.archivedAt?.toISOString() || null,
      taskCount: updated._count.tasks,
    };
  });
}

/**
 * Archives a project and records PROJECT_ARCHIVED activity.
 */
export async function archiveProject(
  organizationId: string,
  projectId: string,
  userId: string,
): Promise<ProjectResponse> {
  const existing = await prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId,
    },
  });

  if (!existing) {
    throw new AppError("Project not found", 404, ErrorCode.NOT_FOUND);
  }

  if (existing.status === "ARCHIVED") {
    throw new AppError(
      "Project is already archived",
      400,
      ErrorCode.BAD_REQUEST,
    );
  }

  return withTenantTransaction(organizationId, async (tx) => {
    const updated = await tx.project.update({
      where: { id: projectId },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
      },
      include: {
        _count: {
          select: { tasks: true },
        },
      },
    });

    await recordActivity(tx, {
      organizationId,
      actorId: userId,
      eventType: "PROJECT_ARCHIVED",
      entityType: "PROJECT",
      entityId: projectId,
      metadata: {
        name: updated.name,
      },
    });

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      name: updated.name,
      slug: updated.slug,
      description: updated.description,
      status: updated.status,
      createdById: updated.createdById,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      archivedAt: updated.archivedAt?.toISOString() || null,
      taskCount: updated._count.tasks,
    };
  });
}

/**
 * Restores an archived project and records PROJECT_RESTORED activity.
 */
export async function restoreProject(
  organizationId: string,
  projectId: string,
  userId: string,
): Promise<ProjectResponse> {
  const existing = await prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId,
    },
  });

  if (!existing) {
    throw new AppError("Project not found", 404, ErrorCode.NOT_FOUND);
  }

  if (existing.status !== "ARCHIVED") {
    throw new AppError("Project is not archived", 400, ErrorCode.BAD_REQUEST);
  }

  return withTenantTransaction(organizationId, async (tx) => {
    // Atomically enforce plan limits on active projects when restoring
    await assertCanCreateActiveProject(organizationId, tx);

    const updated = await tx.project.update({
      where: { id: projectId },
      data: {
        status: "ACTIVE",
        archivedAt: null,
      },
      include: {
        _count: {
          select: { tasks: true },
        },
      },
    });

    await recordActivity(tx, {
      organizationId,
      actorId: userId,
      eventType: "PROJECT_RESTORED",
      entityType: "PROJECT",
      entityId: projectId,
      metadata: {
        name: updated.name,
      },
    });

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      name: updated.name,
      slug: updated.slug,
      description: updated.description,
      status: updated.status,
      createdById: updated.createdById,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      archivedAt: null,
      taskCount: updated._count.tasks,
    };
  });
}
