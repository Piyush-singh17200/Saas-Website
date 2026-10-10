import type { Prisma } from "@workspace/database";
import { withTenantTransaction } from "@workspace/database";
import {
  QueueName,
  type NotificationJobPayload,
  type NotificationListQuery,
  type NotificationResponse,
} from "@workspace/contracts";
import { queueManager } from "../queues/queue.service.js";
import { logger } from "../lib/logger.js";

export class NotificationService {
  /**
   * Retrieves paginated notifications for the current user within an organization.
   * Scoped strictly by PostgreSQL RLS withTenantTransaction.
   */
  public async listNotifications(
    organizationId: string,
    userId: string,
    query: NotificationListQuery,
  ): Promise<{ notifications: NotificationResponse[]; total: number; unreadCount: number }> {
    return withTenantTransaction(organizationId, async (tx) => {
      const where: any = {
        organizationId,
        userId,
        ...(query.unreadOnly ? { readAt: null } : {}),
      };

      const [items, total, unreadCount] = await Promise.all([
        (tx as any).notification.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        (tx as any).notification.count({ where }),
        (tx as any).notification.count({
          where: { organizationId, userId, readAt: null },
        }),
      ]);

      const notifications: NotificationResponse[] = items.map((item: any) => ({
        id: item.id,
        organizationId: item.organizationId,
        userId: item.userId,
        type: item.type,
        title: item.title,
        body: item.body,
        readAt: item.readAt ? item.readAt.toISOString() : null,
        metadata: item.metadata || null,
        createdAt: item.createdAt.toISOString(),
      }));

      return { notifications, total, unreadCount };
    });
  }

  /**
   * Retrieves the unread notification count for the current user.
   */
  public async getUnreadCount(
    organizationId: string,
    userId: string,
  ): Promise<number> {
    return withTenantTransaction(organizationId, async (tx) => {
      return (tx as any).notification.count({
        where: { organizationId, userId, readAt: null },
      });
    });
  }

  /**
   * Marks a specific notification as read.

   */
  public async markAsRead(
    organizationId: string,
    userId: string,
    notificationId: string,
  ): Promise<NotificationResponse | null> {
    return withTenantTransaction(organizationId, async (tx) => {
      const existing = await (tx as any).notification.findFirst({
        where: { id: notificationId, organizationId, userId },
      });

      if (!existing) {
        return null;
      }

      const updated = await (tx as any).notification.update({
        where: { id: notificationId },
        data: { readAt: new Date() },
      });

      return {
        id: updated.id,
        organizationId: updated.organizationId,
        userId: updated.userId,
        type: updated.type,
        title: updated.title,
        body: updated.body,
        readAt: updated.readAt.toISOString(),
        metadata: updated.metadata || null,
        createdAt: updated.createdAt.toISOString(),
      };
    });
  }

  /**
   * Marks all notifications as read for a user in the organization.
   */
  public async markAllAsRead(organizationId: string, userId: string): Promise<{ count: number }> {
    return withTenantTransaction(organizationId, async (tx) => {
      const result = await (tx as any).notification.updateMany({
        where: { organizationId, userId, readAt: null },
        data: { readAt: new Date() },
      });
      return { count: result.count };
    });
  }

  /**
   * Atomically records an outbox message and attempts immediate queue dispatch.
   */
  public async queueNotification(
    tx: Prisma.TransactionClient,
    payload: NotificationJobPayload,
  ): Promise<void> {
    // 1. Transactional Outbox write
    await queueManager.recordOutboxMessage(tx, {
      organizationId: payload.organizationId,
      queueName: QueueName.NOTIFICATIONS,
      jobName: "send-notification",
      payload,
      idempotencyKey: payload.idempotencyKey,
    });

    // 2. Immediate asynchronous queue attempt (non-blocking)
    setImmediate(async () => {
      try {
        await queueManager.enqueueNotification(payload);
      } catch (err) {
        logger.warn(
          "Immediate background queue dispatch failed; Outbox sweeper will retry",
          {
            queueName: QueueName.NOTIFICATIONS,
            idempotencyKey: payload.idempotencyKey,
          },
          err,
        );
      }
    });
  }
}

export const notificationService = new NotificationService();
