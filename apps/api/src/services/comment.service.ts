import { prisma, withTenantTransaction } from "@workspace/database";
import {
  ErrorCode,
  NotificationType,
  type CreateCommentInput,
  type UpdateCommentInput,
  type CommentResponse,
  type PaginatedResult,
} from "@workspace/contracts";
import { AppError } from "../middleware/error-handler.js";
import { recordActivity } from "./activity.service.js";
import { notificationService } from "./notification.service.js";

/**
 * Creates a comment on a task.
 */
export async function createComment(
  organizationId: string,
  projectId: string,
  taskId: string,
  input: CreateCommentInput,
  userId: string,
): Promise<CommentResponse> {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      projectId,
      organizationId,
    },
  });

  if (!task) {
    throw new AppError("Task not found", 404, ErrorCode.NOT_FOUND);
  }

  return withTenantTransaction(organizationId, async (tx) => {
    const comment = await tx.comment.create({
      data: {
        organizationId,
        taskId,
        authorId: userId,
        body: input.body.trim(),
      },
      include: {
        author: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
    });

    await recordActivity(tx, {
      organizationId,
      actorId: userId,
      eventType: "COMMENT_CREATED",
      entityType: "COMMENT",
      entityId: comment.id,
      metadata: {
        taskId,
        projectId,
      },
    });

    if (task.assigneeId && task.assigneeId !== userId) {
      await notificationService.queueNotification(tx, {
        type: NotificationType.COMMENT_MENTION,
        organizationId,
        recipientUserId: task.assigneeId,
        actorUserId: userId,
        targetEntityId: taskId,
        title: `New comment on task: ${task.title}`,
        body: `${comment.author.displayName} commented on "${task.title}".`,
        idempotencyKey: `comment-task:${comment.id}:${task.assigneeId}`,
      });
    }

    return {
      id: comment.id,
      organizationId: comment.organizationId,
      taskId: comment.taskId,
      authorId: comment.authorId,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      deletedAt: comment.deletedAt?.toISOString() || null,
      author: comment.author,
    };
  });
}

/**
 * Lists active comments on a task with pagination.
 */
export async function listComments(
  organizationId: string,
  projectId: string,
  taskId: string,
  page = 1,
  limit = 50,
): Promise<PaginatedResult<CommentResponse>> {
  // Ensure task exists
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      projectId,
      organizationId,
    },
  });

  if (!task) {
    throw new AppError("Task not found", 404, ErrorCode.NOT_FOUND);
  }

  const p = Math.max(1, page);
  const l = Math.min(100, Math.max(1, limit));
  const skip = (p - 1) * l;

  const where = {
    organizationId,
    taskId,
    deletedAt: null, // Soft deletion filter
  };

  const [total, comments] = await Promise.all([
    prisma.comment.count({ where }),
    prisma.comment.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip,
      take: l,
      include: {
        author: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
    }),
  ]);

  return {
    items: comments.map((c) => ({
      id: c.id,
      organizationId: c.organizationId,
      taskId: c.taskId,
      authorId: c.authorId,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      deletedAt: null,
      author: c.author,
    })),
    total,
    page: p,
    limit: l,
    totalPages: Math.ceil(total / l) || 1,
  };
}

/**
 * Updates a comment.
 * Only the comment author may edit comment text.
 */
export async function updateComment(
  organizationId: string,
  projectId: string,
  taskId: string,
  commentId: string,
  input: UpdateCommentInput,
  userId: string,
): Promise<CommentResponse> {
  const comment = await prisma.comment.findFirst({
    where: {
      id: commentId,
      taskId,
      organizationId,
      deletedAt: null,
    },
    include: {
      task: true,
    },
  });

  if (!comment || comment.task.projectId !== projectId) {
    throw new AppError("Comment not found", 404, ErrorCode.NOT_FOUND);
  }

  if (comment.authorId !== userId) {
    throw new AppError(
      "You are not authorized to edit this comment",
      403,
      ErrorCode.FORBIDDEN,
    );
  }

  return withTenantTransaction(organizationId, async (tx) => {
    const updated = await tx.comment.update({
      where: { id: commentId },
      data: {
        body: input.body.trim(),
      },
      include: {
        author: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
    });

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      taskId: updated.taskId,
      authorId: updated.authorId,
      body: updated.body,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      deletedAt: null,
      author: updated.author,
    };
  });
}

/**
 * Soft-deletes a comment.
 * Permitted by comment author or organization managers (OWNER/ADMIN).
 */
export async function deleteComment(
  organizationId: string,
  projectId: string,
  taskId: string,
  commentId: string,
  userId: string,
  userRole: "OWNER" | "ADMIN" | "MEMBER",
): Promise<void> {
  const comment = await prisma.comment.findFirst({
    where: {
      id: commentId,
      taskId,
      organizationId,
      deletedAt: null,
    },
    include: {
      task: true,
    },
  });

  if (!comment || comment.task.projectId !== projectId) {
    throw new AppError("Comment not found", 404, ErrorCode.NOT_FOUND);
  }

  const isAuthor = comment.authorId === userId;
  const isManager = userRole === "OWNER" || userRole === "ADMIN";

  if (!isAuthor && !isManager) {
    throw new AppError(
      "You are not authorized to delete this comment",
      403,
      ErrorCode.FORBIDDEN,
    );
  }

  await withTenantTransaction(organizationId, async (tx) => {
    await tx.comment.update({
      where: { id: commentId },
      data: {
        deletedAt: new Date(),
      },
    });

    await recordActivity(tx, {
      organizationId,
      actorId: userId,
      eventType: "COMMENT_DELETED",
      entityType: "COMMENT",
      entityId: commentId,
      metadata: {
        taskId,
        projectId,
      },
    });
  });
}
