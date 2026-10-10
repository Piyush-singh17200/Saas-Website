import { prisma, type Prisma } from "@workspace/database";
import type {
  PaginatedResult,
  ActivityLogResponse,
} from "@workspace/contracts";

export interface RecordActivityParams {
  organizationId: string;
  actorId?: string | null;
  eventType: string;
  entityType: "PROJECT" | "TASK" | "COMMENT" | "MEMBERSHIP";
  entityId: string;
  metadata?: Record<string, unknown> | null;
}

/**
 * Strips sensitive data like passwords, tokens, hashes, and authorization credentials
 * before persisting metadata in activity records.
 */
function sanitizeMetadata(
  meta?: Record<string, unknown> | null,
): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const scrubbed = { ...meta };
  const sensitiveKeys = [
    "password",
    "passwordHash",
    "token",
    "tokenHash",
    "secret",
    "cookie",
    "authorization",
  ];
  for (const key of Object.keys(scrubbed)) {
    if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
      delete scrubbed[key];
    }
  }
  return scrubbed;
}

/**
 * Records a business activity within an active transaction client or prisma client.
 */
export async function recordActivity(
  tx: Prisma.TransactionClient,
  params: RecordActivityParams,
) {
  return tx.activityLog.create({
    data: {
      organizationId: params.organizationId,
      actorId: params.actorId || null,
      eventType: params.eventType,
      entityType: params.entityType,
      entityId: params.entityId,
      metadata:
        (sanitizeMetadata(params.metadata) as Prisma.InputJsonValue) ||
        undefined,
    },
  });
}

export interface ListActivitiesQuery {
  projectId?: string;
  taskId?: string;
  actorId?: string;
  eventType?: string;
  page?: number;
  limit?: number;
}

/**
 * Lists activities scoped to a specific organization with optional filters.
 */
export async function listOrganizationActivities(
  organizationId: string,
  query: ListActivitiesQuery = {},
): Promise<PaginatedResult<ActivityLogResponse>> {
  const page = Math.max(1, query.page || 1);
  const limit = Math.min(100, Math.max(1, query.limit || 30));
  const skip = (page - 1) * limit;

  const where: Prisma.ActivityLogWhereInput = {
    organizationId,
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.eventType ? { eventType: query.eventType } : {}),
    ...(query.taskId
      ? { entityType: "TASK", entityId: query.taskId }
      : query.projectId
        ? { entityType: "PROJECT", entityId: query.projectId }
        : {}),
  };

  const [total, activities] = await Promise.all([
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        actor: {
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
    items: activities.map((a) => ({
      id: a.id,
      organizationId: a.organizationId,
      actorId: a.actorId,
      eventType: a.eventType,
      entityType: a.entityType,
      entityId: a.entityId,
      metadata: (a.metadata as Record<string, unknown>) || null,
      createdAt: a.createdAt.toISOString(),
      actor: a.actor
        ? {
            id: a.actor.id,
            email: a.actor.email,
            displayName: a.actor.displayName,
          }
        : null,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}
