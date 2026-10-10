import {
  prisma,
  withTenantTransaction,
  type Prisma,
} from "@workspace/database";
import {
  ErrorCode,
  NotificationType,
  type CreateTaskInput,
  type UpdateTaskInput,
  type MoveTaskInput,
  type AssignTaskInput,
  type TaskResponse,
  type PaginatedResult,
  type TaskQuery,
} from "@workspace/contracts";
import { AppError } from "../middleware/error-handler.js";
import { recordActivity } from "./activity.service.js";
import { notificationService } from "./notification.service.js";

/**
 * Validates that an assignee belongs to the target organization as an ACTIVE member.
 */
async function validateAssigneeInOrg(
  organizationId: string,
  assigneeId: string,
): Promise<void> {
  const membership = await prisma.membership.findFirst({
    where: {
      organizationId,
      userId: assigneeId,
      status: "ACTIVE",
    },
  });

  if (!membership) {
    throw new AppError(
      "Assignee must be an active member of this organization",
      400,
      ErrorCode.BAD_REQUEST,
    );
  }
}

/**
 * Validates project exists in organization and is active.
 */
async function validateProjectActive(
  organizationId: string,
  projectId: string,
): Promise<void> {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId,
    },
  });

  if (!project) {
    throw new AppError("Project not found", 404, ErrorCode.NOT_FOUND);
  }

  if (project.status === "ARCHIVED") {
    throw new AppError(
      "Cannot create or modify tasks in an archived project. Restore the project first.",
      400,
      ErrorCode.BAD_REQUEST,
    );
  }
}

/**
 * Maps database task entity to public TaskResponse envelope.
 */
function mapTaskResponse(t: {
  id: string;
  organizationId: string;
  projectId: string;
  title: string;
  description: string | null;
  status: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  assigneeId: string | null;
  createdById: string;
  dueDate: Date | null;
  position: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  assignee?: { id: string; email: string; displayName: string } | null;
  createdBy?: { id: string; email: string; displayName: string };
  _count?: { comments: number };
}): TaskResponse {
  return {
    id: t.id,
    organizationId: t.organizationId,
    projectId: t.projectId,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    assigneeId: t.assigneeId,
    createdById: t.createdById,
    dueDate: t.dueDate?.toISOString() || null,
    position: t.position,
    version: t.version,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    completedAt: t.completedAt?.toISOString() || null,
    assignee: t.assignee
      ? {
          id: t.assignee.id,
          email: t.assignee.email,
          displayName: t.assignee.displayName,
        }
      : null,
    createdBy: t.createdBy
      ? {
          id: t.createdBy.id,
          email: t.createdBy.email,
          displayName: t.createdBy.displayName,
        }
      : undefined,
    commentCount: t._count?.comments,
  };
}

/**
 * Creates a new task in a project.
 */
export async function createTask(
  organizationId: string,
  projectId: string,
  input: CreateTaskInput,
  userId: string,
): Promise<TaskResponse> {
  await validateProjectActive(organizationId, projectId);

  if (input.assigneeId) {
    await validateAssigneeInOrg(organizationId, input.assigneeId);
  }

  return withTenantTransaction(organizationId, async (tx) => {
    // Determine position: place at end if position is not specified
    let position = input.position;
    if (position === undefined) {
      const lastTask = await tx.task.findFirst({
        where: { projectId, organizationId },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      position = (lastTask?.position ?? 0) + 1000;
    }

    const completedAt = input.status === "DONE" ? new Date() : null;

    const task = await tx.task.create({
      data: {
        organizationId,
        projectId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        status: input.status,
        priority: input.priority,
        assigneeId: input.assigneeId || null,
        createdById: userId,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        position,
        version: 1,
        completedAt,
      },
      include: {
        assignee: {
          select: { id: true, email: true, displayName: true },
        },
        createdBy: {
          select: { id: true, email: true, displayName: true },
        },
        _count: {
          select: { comments: true },
        },
      },
    });

    await recordActivity(tx, {
      organizationId,
      actorId: userId,
      eventType: "TASK_CREATED",
      entityType: "TASK",
      entityId: task.id,
      metadata: {
        title: task.title,
        status: task.status,
        priority: task.priority,
        projectId,
      },
    });

    if (task.assigneeId && task.assigneeId !== userId) {
      await notificationService.queueNotification(tx, {
        type: NotificationType.TASK_ASSIGNED,
        organizationId,
        recipientUserId: task.assigneeId,
        actorUserId: userId,
        targetEntityId: task.id,
        title: `Task assigned: ${task.title}`,
        body: `You were assigned to task "${task.title}".`,
        idempotencyKey: `task-assigned:${task.id}:${task.assigneeId}`,
      });
    }

    return mapTaskResponse(task);
  });
}

/**
 * Lists tasks in a project with filtering, search, sorting, and pagination.
 */
export async function listTasks(
  organizationId: string,
  projectId: string,
  query: TaskQuery,
): Promise<PaginatedResult<TaskResponse>> {
  const page = Math.max(1, query.page || 1);
  const limit = Math.min(100, Math.max(1, query.limit || 50));
  const skip = (page - 1) * limit;

  const where: Prisma.TaskWhereInput = {
    organizationId,
    projectId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.assigneeId !== undefined
      ? query.assigneeId === "unassigned"
        ? { assigneeId: null }
        : { assigneeId: query.assigneeId }
      : {}),
    ...(query.dueDateFrom || query.dueDateTo
      ? {
          dueDate: {
            ...(query.dueDateFrom ? { gte: new Date(query.dueDateFrom) } : {}),
            ...(query.dueDateTo ? { lte: new Date(query.dueDateTo) } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { title: { contains: query.search, mode: "insensitive" } },
            { description: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const orderBy = {
    [query.sortBy || "position"]: query.sortOrder || "asc",
  };

  const [total, tasks] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      orderBy: [orderBy, { id: "asc" }], // deterministic tie-breaker
      skip,
      take: limit,
      include: {
        assignee: {
          select: { id: true, email: true, displayName: true },
        },
        createdBy: {
          select: { id: true, email: true, displayName: true },
        },
        _count: {
          select: { comments: true },
        },
      },
    }),
  ]);

  return {
    items: tasks.map(mapTaskResponse),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

/**
 * Retrieves a single task by ID.
 */
export async function getTaskById(
  organizationId: string,
  projectId: string,
  taskId: string,
): Promise<TaskResponse> {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      projectId,
      organizationId,
    },
    include: {
      assignee: {
        select: { id: true, email: true, displayName: true },
      },
      createdBy: {
        select: { id: true, email: true, displayName: true },
      },
      _count: {
        select: { comments: true },
      },
    },
  });

  if (!task) {
    throw new AppError("Task not found", 404, ErrorCode.NOT_FOUND);
  }

  return mapTaskResponse(task);
}

/**
 * Updates a task with Optimistic Concurrency Control.
 * If another update incremented the task version, returns HTTP 409 Conflict.
 */
export async function updateTask(
  organizationId: string,
  projectId: string,
  taskId: string,
  input: UpdateTaskInput,
  userId: string,
): Promise<TaskResponse> {
  await validateProjectActive(organizationId, projectId);

  if (input.assigneeId) {
    await validateAssigneeInOrg(organizationId, input.assigneeId);
  }

  return withTenantTransaction(organizationId, async (tx) => {
    // Verify task exists and retrieve current state
    const currentTask = await tx.task.findFirst({
      where: { id: taskId, projectId, organizationId },
    });

    if (!currentTask) {
      throw new AppError("Task not found", 404, ErrorCode.NOT_FOUND);
    }

    // Optimistic concurrency check
    if (currentTask.version !== input.version) {
      throw new AppError(
        "Task was modified by another user. Please reload the latest changes.",
        409,
        ErrorCode.CONFLICT,
        {
          currentVersion: currentTask.version,
          expectedVersion: input.version,
        },
      );
    }

    // Handle status transitions and completion timestamp
    let completedAt = currentTask.completedAt;
    let statusChanged = false;
    if (input.status !== undefined && input.status !== currentTask.status) {
      statusChanged = true;
      if (input.status === "DONE") {
        completedAt = new Date();
      } else if (currentTask.status === "DONE") {
        completedAt = null;
      }
    }

    // Atomic conditional update
    const updateResult = await tx.task.updateMany({
      where: {
        id: taskId,
        projectId,
        organizationId,
        version: input.version, // atomic version guard
      },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() || null }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.assigneeId !== undefined
          ? { assigneeId: input.assigneeId }
          : {}),
        ...(input.dueDate !== undefined
          ? { dueDate: input.dueDate ? new Date(input.dueDate) : null }
          : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
        completedAt,
        version: { increment: 1 },
      },
    });

    if (updateResult.count === 0) {
      throw new AppError(
        "Task was modified by another user. Please reload the latest changes.",
        409,
        ErrorCode.CONFLICT,
      );
    }

    // Fetch updated task with relations
    const updated = await tx.task.findUniqueOrThrow({
      where: { id: taskId },
      include: {
        assignee: {
          select: { id: true, email: true, displayName: true },
        },
        createdBy: {
          select: { id: true, email: true, displayName: true },
        },
        _count: {
          select: { comments: true },
        },
      },
    });

    // Record appropriate business activity
    let eventType = "TASK_UPDATED";
    if (statusChanged) {
      if (updated.status === "DONE") {
        eventType = "TASK_COMPLETED";
      } else if (currentTask.status === "DONE") {
        eventType = "TASK_REOPENED";
      } else {
        eventType = "TASK_STATUS_CHANGED";
      }
    }

    await recordActivity(tx, {
      organizationId,
      actorId: userId,
      eventType,
      entityType: "TASK",
      entityId: taskId,
      metadata: {
        title: updated.title,
        status: updated.status,
        previousStatus: currentTask.status,
        version: updated.version,
      },
    });

    if (
      input.assigneeId &&
      input.assigneeId !== currentTask.assigneeId &&
      input.assigneeId !== userId
    ) {
      await notificationService.queueNotification(tx, {
        type: NotificationType.TASK_REASSIGNED,
        organizationId,
        recipientUserId: input.assigneeId,
        actorUserId: userId,
        targetEntityId: taskId,
        title: `Task reassigned: ${updated.title}`,
        body: `You were assigned to task "${updated.title}".`,
        idempotencyKey: `task-reassigned:${taskId}:${input.assigneeId}:${updated.version}`,
      });
    }

    return mapTaskResponse(updated);
  });
}

/**
 * Moves a task to a new status and position with Optimistic Concurrency Control.
 */
export async function moveTask(
  organizationId: string,
  projectId: string,
  taskId: string,
  input: MoveTaskInput,
  userId: string,
): Promise<TaskResponse> {
  return updateTask(
    organizationId,
    projectId,
    taskId,
    {
      status: input.status,
      position: input.position,
      version: input.version,
    },
    userId,
  );
}

/**
 * Assigns or unassigns a task with Optimistic Concurrency Control.
 */
export async function assignTask(
  organizationId: string,
  projectId: string,
  taskId: string,
  input: AssignTaskInput,
  userId: string,
): Promise<TaskResponse> {
  return updateTask(
    organizationId,
    projectId,
    taskId,
    {
      assigneeId: input.assigneeId,
      version: input.version,
    },
    userId,
  );
}

/**
 * Deletes a task and records TASK_DELETED activity.
 */
export async function deleteTask(
  organizationId: string,
  projectId: string,
  taskId: string,
  userId: string,
): Promise<void> {
  const existing = await prisma.task.findFirst({
    where: {
      id: taskId,
      projectId,
      organizationId,
    },
  });

  if (!existing) {
    throw new AppError("Task not found", 404, ErrorCode.NOT_FOUND);
  }

  await withTenantTransaction(organizationId, async (tx) => {
    await tx.task.delete({
      where: { id: taskId },
    });

    await recordActivity(tx, {
      organizationId,
      actorId: userId,
      eventType: "TASK_DELETED",
      entityType: "TASK",
      entityId: taskId,
      metadata: {
        title: existing.title,
        projectId,
      },
    });
  });
}
