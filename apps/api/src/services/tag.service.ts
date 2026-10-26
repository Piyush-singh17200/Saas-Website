import { prisma, withTenantTransaction } from "@workspace/database";
import {
  ErrorCode,
  type CreateTagInput,
  type UpdateTagInput,
  type TagResponse,
} from "@workspace/contracts";
import { AppError } from "../middleware/error-handler.js";

function mapTagResponse(t: {
  id: string;
  organizationId: string;
  name: string;
  color: string;
  createdAt: Date;
  updatedAt?: Date;
}): TagResponse {
  return {
    id: t.id,
    organizationId: t.organizationId,
    name: t.name,
    color: t.color,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt?.toISOString(),
  };
}

/**
 * Lists all tags defined in an organization.
 */
export async function listTags(organizationId: string): Promise<TagResponse[]> {
  const tags = await prisma.tag.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
  });

  return tags.map(mapTagResponse);
}

/**
 * Creates a new tag in the organization with normalized name check.
 */
export async function createTag(
  organizationId: string,
  input: CreateTagInput,
): Promise<TagResponse> {
  const normalizedName = input.name.trim();

  // Prevent duplicate tag names within the same organization (case-insensitive)
  const existing = await prisma.tag.findFirst({
    where: {
      organizationId,
      name: {
        equals: normalizedName,
        mode: "insensitive",
      },
    },
  });

  if (existing) {
    throw new AppError(
      `A tag named "${normalizedName}" already exists in this organization.`,
      409,
      ErrorCode.CONFLICT,
    );
  }

  return withTenantTransaction(organizationId, async (tx) => {
    const tag = await tx.tag.create({
      data: {
        organizationId,
        name: normalizedName,
        color: input.color || "#3B82F6",
      },
    });

    return mapTagResponse(tag);
  });
}

/**
 * Updates a tag (name or color) within the organization.
 */
export async function updateTag(
  organizationId: string,
  tagId: string,
  input: UpdateTagInput,
): Promise<TagResponse> {
  const existing = await prisma.tag.findFirst({
    where: { id: tagId, organizationId },
  });

  if (!existing) {
    throw new AppError("Tag not found", 404, ErrorCode.NOT_FOUND);
  }

  let normalizedName: string | undefined = undefined;
  if (input.name !== undefined) {
    normalizedName = input.name.trim();
    if (normalizedName.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await prisma.tag.findFirst({
        where: {
          organizationId,
          name: {
            equals: normalizedName,
            mode: "insensitive",
          },
          id: { not: tagId },
        },
      });

      if (duplicate) {
        throw new AppError(
          `A tag named "${normalizedName}" already exists in this organization.`,
          409,
          ErrorCode.CONFLICT,
        );
      }
    }
  }

  return withTenantTransaction(organizationId, async (tx) => {
    const updated = await tx.tag.update({
      where: { id: tagId },
      data: {
        ...(normalizedName !== undefined ? { name: normalizedName } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
      },
    });

    return mapTagResponse(updated);
  });
}

/**
 * Deletes a tag from the organization and removes it from any associated tasks.
 */
export async function deleteTag(
  organizationId: string,
  tagId: string,
): Promise<void> {
  const existing = await prisma.tag.findFirst({
    where: { id: tagId, organizationId },
  });

  if (!existing) {
    throw new AppError("Tag not found", 404, ErrorCode.NOT_FOUND);
  }

  await withTenantTransaction(organizationId, async (tx) => {
    // Delete tag (cascade will remove task_tags)
    await tx.tag.delete({
      where: { id: tagId },
    });
  });
}

/**
 * Assigns tags to a task, enforcing organization boundaries.
 */
export async function assignTagsToTask(
  organizationId: string,
  projectId: string,
  taskId: string,
  tagIds: string[],
): Promise<TagResponse[]> {
  // Validate task exists and belongs to the given org and project
  const task = await prisma.task.findFirst({
    where: { id: taskId, projectId, organizationId },
  });

  if (!task) {
    throw new AppError("Task not found", 404, ErrorCode.NOT_FOUND);
  }

  if (tagIds.length === 0) {
    return [];
  }

  // Verify all tags exist and belong to the same organization (prevent cross-tenant association)
  const tags = await prisma.tag.findMany({
    where: {
      id: { in: tagIds },
      organizationId,
    },
  });

  if (tags.length !== tagIds.length) {
    throw new AppError(
      "One or more tags do not exist or belong to a different organization.",
      400,
      ErrorCode.BAD_REQUEST,
    );
  }

  await withTenantTransaction(organizationId, async (tx) => {
    for (const tagId of tagIds) {
      await tx.taskTag.upsert({
        where: {
          task_tag_unique: { taskId, tagId },
        },
        create: {
          organizationId,
          taskId,
          tagId,
        },
        update: {},
      });
    }
  });

  const updatedTaskTags = await prisma.taskTag.findMany({
    where: { taskId },
    include: { tag: true },
  });

  return updatedTaskTags.map((tt) => mapTagResponse(tt.tag));
}

/**
 * Removes a specific tag from a task.
 */
export async function removeTagFromTask(
  organizationId: string,
  projectId: string,
  taskId: string,
  tagId: string,
): Promise<void> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, projectId, organizationId },
  });

  if (!task) {
    throw new AppError("Task not found", 404, ErrorCode.NOT_FOUND);
  }

  await withTenantTransaction(organizationId, async (tx) => {
    await tx.taskTag.deleteMany({
      where: {
        organizationId,
        taskId,
        tagId,
      },
    });
  });
}
