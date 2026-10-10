import { z } from "zod";

export const ErrorCode = {
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  PLAN_LIMIT_EXCEEDED: "PLAN_LIMIT_EXCEEDED",
  PAYMENT_REQUIRED: "PAYMENT_REQUIRED",
  STRIPE_ERROR: "STRIPE_ERROR",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

export const AccountStatus = {
  ACTIVE: "ACTIVE",
  DISABLED: "DISABLED",
} as const;
export type AccountStatusType =
  (typeof AccountStatus)[keyof typeof AccountStatus];

export const MembershipRole = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
} as const;
export type MembershipRoleType =
  (typeof MembershipRole)[keyof typeof MembershipRole];

export const MembershipStatus = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
} as const;
export type MembershipStatusType =
  (typeof MembershipStatus)[keyof typeof MembershipStatus];

export const ProjectStatus = {
  ACTIVE: "ACTIVE",
  ARCHIVED: "ARCHIVED",
} as const;
export type ProjectStatusType =
  (typeof ProjectStatus)[keyof typeof ProjectStatus];

export const TaskStatus = {
  TODO: "TODO",
  IN_PROGRESS: "IN_PROGRESS",
  IN_REVIEW: "IN_REVIEW",
  DONE: "DONE",
} as const;
export type TaskStatusType = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TaskPriority = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  URGENT: "URGENT",
} as const;
export type TaskPriorityType = (typeof TaskPriority)[keyof typeof TaskPriority];

export const SubscriptionPlan = {
  FREE: "FREE",
  PRO: "PRO",
} as const;
export type SubscriptionPlanType =
  (typeof SubscriptionPlan)[keyof typeof SubscriptionPlan];

export const SubscriptionStatus = {
  INCOMPLETE: "INCOMPLETE",
  INCOMPLETE_EXPIRED: "INCOMPLETE_EXPIRED",
  TRIALING: "TRIALING",
  ACTIVE: "ACTIVE",
  PAST_DUE: "PAST_DUE",
  CANCELED: "CANCELED",
  UNPAID: "UNPAID",
} as const;
export type SubscriptionStatusType =
  (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export interface ResponseMeta {
  requestId: string;
  timestamp: string;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta: ResponseMeta;
}

export interface ApiErrorDetail {
  code: ErrorCodeType | string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetail;
  meta: ResponseMeta;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// -----------------------------------------------------------------------------
// Health & Readiness Schemas
// -----------------------------------------------------------------------------
export const HealthDataSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  version: z.string(),
  uptime: z.number(),
  timestamp: z.string(),
});
export type HealthData = z.infer<typeof HealthDataSchema>;

export const ReadinessComponentStatusSchema = z.object({
  status: z.enum(["connected", "disconnected", "degraded"]),
  latencyMs: z.number().optional(),
  message: z.string().optional(),
});

export const ReadinessDataSchema = z.object({
  status: z.enum(["ready", "not_ready"]),
  service: z.string(),
  version: z.string(),
  checks: z.object({
    database: ReadinessComponentStatusSchema,
    redis: ReadinessComponentStatusSchema.optional(),
  }),
  timestamp: z.string(),
});
export type ReadinessComponentStatus = z.infer<
  typeof ReadinessComponentStatusSchema
>;
export type ReadinessData = z.infer<typeof ReadinessDataSchema>;

// -----------------------------------------------------------------------------
// Authentication Schemas
// -----------------------------------------------------------------------------
export const RegisterInputSchema = z.object({
  email: z
    .string()
    .email("Invalid email address")
    .max(255)
    .transform((val) => val.trim().toLowerCase()),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password must not exceed 100 characters"),
  displayName: z
    .string()
    .min(1, "Display name is required")
    .max(100, "Display name must not exceed 100 characters")
    .trim(),
});
export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export const LoginInputSchema = z.object({
  email: z
    .string()
    .email("Invalid email address")
    .max(255)
    .transform((val) => val.trim().toLowerCase()),
  password: z.string().min(1, "Password is required").max(100),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const UserProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  status: z.enum(["ACTIVE", "DISABLED"]),
  createdAt: z.string(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

// -----------------------------------------------------------------------------
// Organization Schemas
// -----------------------------------------------------------------------------
export const CreateOrganizationInputSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name cannot exceed 100 characters")
    .trim(),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(50, "Slug cannot exceed 50 characters")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must contain only lowercase alphanumeric characters and hyphens",
    )
    .optional(),
});
export type CreateOrganizationInput = z.infer<
  typeof CreateOrganizationInputSchema
>;

export const UpdateOrganizationInputSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name cannot exceed 100 characters")
    .trim(),
});
export type UpdateOrganizationInput = z.infer<
  typeof UpdateOrganizationInputSchema
>;

export const OrganizationResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  creatorId: z.string().uuid(),
  role: z.enum(["OWNER", "ADMIN", "MEMBER"]).optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});
export type OrganizationResponse = z.infer<typeof OrganizationResponseSchema>;

// -----------------------------------------------------------------------------
// Membership Schemas
// -----------------------------------------------------------------------------
export const UpdateMemberRoleInputSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER"]),
});
export type UpdateMemberRoleInput = z.infer<typeof UpdateMemberRoleInputSchema>;

export const MembershipUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
});

export const MembershipResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(["OWNER", "ADMIN", "MEMBER"]),
  status: z.enum(["ACTIVE", "SUSPENDED"]),
  createdAt: z.string(),
  joinedAt: z.string().nullable().optional(),
  user: MembershipUserSchema.optional(),
});
export type MembershipResponse = z.infer<typeof MembershipResponseSchema>;

// -----------------------------------------------------------------------------
// Invitation Schemas
// -----------------------------------------------------------------------------
export const CreateInvitationInputSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Valid email address is required"),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
});
export type CreateInvitationInput = z.infer<typeof CreateInvitationInputSchema>;

export const InvitationResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["OWNER", "ADMIN", "MEMBER"]),
  expiresAt: z.string(),
  createdAt: z.string(),
  acceptedAt: z.string().nullable().optional(),
  revokedAt: z.string().nullable().optional(),
  inviter: z
    .object({
      id: z.string().uuid(),
      email: z.string().email(),
      displayName: z.string(),
    })
    .optional(),
});
export type InvitationResponse = z.infer<typeof InvitationResponseSchema>;


// -----------------------------------------------------------------------------
// Pagination Envelope
// -----------------------------------------------------------------------------
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// -----------------------------------------------------------------------------
// Project Schemas
// -----------------------------------------------------------------------------
export const CreateProjectInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name cannot exceed 100 characters"),
  slug: z
    .string()
    .trim()
    .min(2, "Slug must be at least 2 characters")
    .max(50, "Slug cannot exceed 50 characters")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must contain only lowercase alphanumeric characters and hyphens",
    )
    .optional(),
  description: z.string().max(1000).optional().nullable(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

export const UpdateProjectInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name cannot exceed 100 characters")
    .optional(),
  description: z.string().max(1000).optional().nullable(),
});
export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>;

export const ProjectResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]),
  createdById: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable().optional(),
  taskCount: z.number().optional(),
});
export type ProjectResponse = z.infer<typeof ProjectResponseSchema>;

export const ProjectQuerySchema = z.object({
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ProjectQuery = z.infer<typeof ProjectQuerySchema>;

// -----------------------------------------------------------------------------
// Task Schemas
// -----------------------------------------------------------------------------
export const UserPreviewSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
});
export type UserPreview = z.infer<typeof UserPreviewSchema>;

export const CreateTaskInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(255, "Title cannot exceed 255 characters"),
  description: z.string().max(10000).optional().nullable(),
  status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]).default("TODO"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  assigneeId: z.string().uuid().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  position: z.number().optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;

export const UpdateTaskInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(255, "Title cannot exceed 255 characters")
    .optional(),
  description: z.string().max(10000).optional().nullable(),
  status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  assigneeId: z.string().uuid().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  position: z.number().optional(),
  version: z
    .number()
    .int()
    .min(1, "Version is required for optimistic concurrency"),
});
export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;

export const MoveTaskInputSchema = z.object({
  status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]),
  position: z.number(),
  version: z
    .number()
    .int()
    .min(1, "Version is required for optimistic concurrency"),
});
export type MoveTaskInput = z.infer<typeof MoveTaskInputSchema>;

export const AssignTaskInputSchema = z.object({
  assigneeId: z.string().uuid().nullable(),
  version: z
    .number()
    .int()
    .min(1, "Version is required for optimistic concurrency"),
});
export type AssignTaskInput = z.infer<typeof AssignTaskInputSchema>;

export const TaskResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable().optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  assigneeId: z.string().uuid().nullable().optional(),
  createdById: z.string().uuid(),
  dueDate: z.string().nullable().optional(),
  position: z.number(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable().optional(),
  assignee: UserPreviewSchema.nullable().optional(),
  createdBy: UserPreviewSchema.optional(),
  commentCount: z.number().optional(),
});
export type TaskResponse = z.infer<typeof TaskResponseSchema>;

export const TaskQuerySchema = z.object({
  status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  assigneeId: z.string().optional(),
  dueDateFrom: z.string().optional(),
  dueDateTo: z.string().optional(),
  search: z.string().optional(),
  sortBy: z
    .enum(["position", "createdAt", "dueDate", "priority"])
    .default("position"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type TaskQuery = z.infer<typeof TaskQuerySchema>;

// -----------------------------------------------------------------------------
// Comment Schemas
// -----------------------------------------------------------------------------
export const CreateCommentInputSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Comment body cannot be empty")
    .max(10000, "Comment cannot exceed 10,000 characters"),
});
export type CreateCommentInput = z.infer<typeof CreateCommentInputSchema>;

export const UpdateCommentInputSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Comment body cannot be empty")
    .max(10000, "Comment cannot exceed 10,000 characters"),
});
export type UpdateCommentInput = z.infer<typeof UpdateCommentInputSchema>;

export const CommentResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  taskId: z.string().uuid(),
  authorId: z.string().uuid(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable().optional(),
  author: UserPreviewSchema.optional(),
});
export type CommentResponse = z.infer<typeof CommentResponseSchema>;

// -----------------------------------------------------------------------------
// ActivityLog Schemas
// -----------------------------------------------------------------------------
export const ActivityLogResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  actorId: z.string().uuid().nullable().optional(),
  eventType: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  metadata: z.record(z.unknown()).nullable().optional(),
  createdAt: z.string(),
  actor: UserPreviewSchema.nullable().optional(),
});
export type ActivityLogResponse = z.infer<typeof ActivityLogResponseSchema>;

export const ActivityQuerySchema = z.object({
  projectId: z.string().optional(),
  taskId: z.string().optional(),
  actorId: z.string().optional(),
  eventType: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ActivityQuery = z.infer<typeof ActivityQuerySchema>;

// -----------------------------------------------------------------------------
// Billing & Subscription Schemas
// -----------------------------------------------------------------------------
export const SubscriptionResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  plan: z.enum(["FREE", "PRO"]),
  status: z.enum([
    "INCOMPLETE",
    "INCOMPLETE_EXPIRED",
    "TRIALING",
    "ACTIVE",
    "PAST_DUE",
    "CANCELED",
    "UNPAID",
  ]),
  stripeCustomerId: z.string().nullable().optional(),
  stripeSubscriptionId: z.string().nullable().optional(),
  stripePriceId: z.string().nullable().optional(),
  currentPeriodStart: z.string().nullable().optional(),
  currentPeriodEnd: z.string().nullable().optional(),
  cancelAtPeriodEnd: z.boolean(),
  canceledAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SubscriptionResponse = z.infer<typeof SubscriptionResponseSchema>;

export const PlanLimitsSchema = z.object({
  maxActiveProjects: z.number(),
  maxMembers: z.number(),
  premiumFeatures: z.boolean(),
  activityRetentionDays: z.number(),
});
export type PlanLimits = z.infer<typeof PlanLimitsSchema>;

export const PlanUsageSchema = z.object({
  activeProjects: z.number(),
  totalProjects: z.number(),
  members: z.number(),
});
export type PlanUsage = z.infer<typeof PlanUsageSchema>;

export const BillingSummaryResponseSchema = z.object({
  subscription: SubscriptionResponseSchema,
  limits: PlanLimitsSchema,
  usage: PlanUsageSchema,
  isEligibleForPro: z.boolean(),
});
export type BillingSummaryResponse = z.infer<
  typeof BillingSummaryResponseSchema
>;

export const CreateCheckoutSessionResponseSchema = z.object({
  checkoutUrl: z.string().url(),
});
export type CreateCheckoutSessionResponse = z.infer<
  typeof CreateCheckoutSessionResponseSchema
>;

export const CreatePortalSessionResponseSchema = z.object({
  portalUrl: z.string().url(),
});
export type CreatePortalSessionResponse = z.infer<
  typeof CreatePortalSessionResponseSchema
>;

// -----------------------------------------------------------------------------
// Helpers to produce typed API responses
// -----------------------------------------------------------------------------
export function createSuccessResponse<T>(
  data: T,
  requestId: string,
): ApiSuccessResponse<T> {
  return {
    success: true,
    data,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
}

export function createErrorResponse(
  error: ApiErrorDetail,
  requestId: string,
): ApiErrorResponse {
  return {
    success: false,
    error,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
}

// -----------------------------------------------------------------------------
// Notification Schemas
// -----------------------------------------------------------------------------
export const NotificationType = {
  ORG_INVITATION: "ORG_INVITATION",
  TASK_ASSIGNED: "TASK_ASSIGNED",
  TASK_REASSIGNED: "TASK_REASSIGNED",
  COMMENT_MENTION: "COMMENT_MENTION",
  PROJECT_EVENT: "PROJECT_EVENT",
} as const;
export type NotificationTypeValue =
  (typeof NotificationType)[keyof typeof NotificationType];

export const NotificationResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  readAt: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  createdAt: z.string(),
});
export type NotificationResponse = z.infer<typeof NotificationResponseSchema>;

export const NotificationListQuerySchema = z.object({
  unreadOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((val) => val === "true"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type NotificationListQuery = z.infer<typeof NotificationListQuerySchema>;

export const NotificationUnreadCountResponseSchema = z.object({
  unreadCount: z.number().int().nonnegative(),
});
export type NotificationUnreadCountResponse = z.infer<
  typeof NotificationUnreadCountResponseSchema
>;

export const NotificationListResponseSchema = z.object({
  notifications: z.array(NotificationResponseSchema),
  total: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
});
export type NotificationListResponse = z.infer<
  typeof NotificationListResponseSchema
>;


// -----------------------------------------------------------------------------
// Background Jobs & Queue Schemas
// -----------------------------------------------------------------------------
export const QueueName = {
  NOTIFICATIONS: "notifications",
  INVITATION_EXPIRY: "invitation-expiry",
  BILLING_RECONCILIATION: "billing-reconciliation",
  MAINTENANCE: "maintenance",
} as const;
export type QueueNameValue = (typeof QueueName)[keyof typeof QueueName];

export const NotificationJobPayloadSchema = z.object({
  type: z.string(),
  organizationId: z.string().uuid(),
  recipientUserId: z.string().uuid(),
  actorUserId: z.string().uuid().optional(),
  targetEntityId: z.string().optional(),
  title: z.string().min(1),
  body: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
  idempotencyKey: z.string().min(1),
  correlationId: z.string().optional(),
});
export type NotificationJobPayload = z.infer<
  typeof NotificationJobPayloadSchema
>;

export const InvitationExpiryJobPayloadSchema = z.object({
  sweepOnly: z.boolean().default(true),
  invitationId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  correlationId: z.string().optional(),
});
export type InvitationExpiryJobPayload = z.infer<
  typeof InvitationExpiryJobPayloadSchema
>;

export const BillingReconciliationJobPayloadSchema = z.object({
  organizationId: z.string().uuid(),
  stripeCustomerId: z.string().optional(),
  stripeSubscriptionId: z.string().optional(),
  correlationId: z.string().optional(),
});
export type BillingReconciliationJobPayload = z.infer<
  typeof BillingReconciliationJobPayloadSchema
>;

export const CleanupJobPayloadSchema = z.object({
  retentionDays: z.number().int().min(1).default(30),
  scope: z.enum(["all", "sessions", "outbox", "activity"]).default("all"),
  correlationId: z.string().optional(),
});
export type CleanupJobPayload = z.infer<typeof CleanupJobPayloadSchema>;

export const OutboxDispatchJobPayloadSchema = z.object({
  batchSize: z.number().int().min(1).max(100).default(50),
  correlationId: z.string().optional(),
});
export type OutboxDispatchJobPayload = z.infer<
  typeof OutboxDispatchJobPayloadSchema
>;

// -----------------------------------------------------------------------------
// Observability & Metrics Schemas
// -----------------------------------------------------------------------------
export const QueueMetricsSchema = z.object({
  queueName: z.string(),
  waiting: z.number(),
  active: z.number(),
  completed: z.number(),
  failed: z.number(),
  delayed: z.number(),
  paused: z.boolean(),
});
export type QueueMetrics = z.infer<typeof QueueMetricsSchema>;

export const WorkerMetricsResponseSchema = z.object({
  service: z.literal("workspace-worker"),
  status: z.enum(["running", "paused", "shutting_down", "stopped"]),
  uptimeSeconds: z.number(),
  processedJobs: z.number(),
  failedJobs: z.number(),
  queues: z.array(QueueMetricsSchema),
  timestamp: z.string(),
});
export type WorkerMetricsResponse = z.infer<typeof WorkerMetricsResponseSchema>;

