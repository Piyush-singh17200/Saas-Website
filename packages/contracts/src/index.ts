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
  mfaEnabled: z.boolean().optional().default(false),
  emailVerified: z.boolean().optional().default(false),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const ForgotPasswordInputSchema = z.object({
  email: z
    .string()
    .email("Invalid email address")
    .max(255)
    .transform((val) => val.trim().toLowerCase()),
});
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordInputSchema>;

export const ResetPasswordInputSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password must not exceed 100 characters"),
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordInputSchema>;

export const VerifyEmailInputSchema = z.object({
  token: z.string().min(1, "Verification token is required"),
});
export type VerifyEmailInput = z.infer<typeof VerifyEmailInputSchema>;

export const ResendVerificationInputSchema = z.object({
  email: z
    .string()
    .email("Invalid email address")
    .max(255)
    .transform((val) => val.trim().toLowerCase()),
});
export type ResendVerificationInput = z.infer<
  typeof ResendVerificationInputSchema
>;

export const DeleteAccountInputSchema = z.object({
  password: z.string().min(1, "Password is required for account deletion"),
  confirmationPhrase: z.string().refine((val) => val === "DELETE MY ACCOUNT", {
    message: 'Confirmation phrase must match "DELETE MY ACCOUNT"',
  }),
});
export type DeleteAccountInput = z.infer<typeof DeleteAccountInputSchema>;

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
  token: z.string().optional(),
});
export type InvitationResponse = z.infer<typeof InvitationResponseSchema>;

export const PublicInvitationDetailsSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["OWNER", "ADMIN", "MEMBER"]),
  expiresAt: z.string(),
  isExpired: z.boolean(),
  organization: z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
  }),
  inviter: z.object({
    displayName: z.string(),
  }),
});
export type PublicInvitationDetails = z.infer<
  typeof PublicInvitationDetailsSchema
>;

export const AcceptInvitationResultSchema = z.object({
  organizationId: z.string().uuid(),
  organizationName: z.string(),
  organizationSlug: z.string(),
  role: z.enum(["OWNER", "ADMIN", "MEMBER"]),
  message: z.string(),
});
export type AcceptInvitationResult = z.infer<
  typeof AcceptInvitationResultSchema
>;

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
// Tag Schemas
// -----------------------------------------------------------------------------
export const TagResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string(),
  color: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});
export type TagResponse = z.infer<typeof TagResponseSchema>;

export const CreateTagInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Tag name is required")
    .max(50, "Tag name cannot exceed 50 characters"),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid 6-character hex code")
    .default("#3B82F6"),
});
export type CreateTagInput = z.infer<typeof CreateTagInputSchema>;

export const UpdateTagInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Tag name is required")
    .max(50, "Tag name cannot exceed 50 characters")
    .optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid 6-character hex code")
    .optional(),
});
export type UpdateTagInput = z.infer<typeof UpdateTagInputSchema>;

export const AssignTagsInputSchema = z.object({
  tagIds: z.array(z.string().uuid()).min(1, "At least one tag ID is required"),
});
export type AssignTagsInput = z.infer<typeof AssignTagsInputSchema>;

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
  tagIds: z.array(z.string().uuid()).optional(),
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
  tagIds: z.array(z.string().uuid()).optional(),
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
  isOverdue: z.boolean().optional(),
  position: z.number(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable().optional(),
  assignee: UserPreviewSchema.nullable().optional(),
  createdBy: UserPreviewSchema.optional(),
  commentCount: z.number().optional(),
  tags: z.array(TagResponseSchema).optional().default([]),
});
export type TaskResponse = z.infer<typeof TaskResponseSchema>;

export const TaskQuerySchema = z.object({
  status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  assigneeId: z.string().optional(),
  tagIds: z.preprocess((val) => {
    if (!val) return undefined;
    if (Array.isArray(val)) return val;
    if (typeof val === "string") {
      if (val.includes(","))
        return val
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      return [val.trim()];
    }
    return val;
  }, z.array(z.string().uuid()).optional()),
  isOverdue: z.preprocess((val) => {
    if (val === undefined || val === null || val === "") return undefined;
    if (val === "true" || val === true) return true;
    if (val === "false" || val === false) return false;
    return val;
  }, z.boolean().optional()),
  dueDateFrom: z.string().optional(),
  dueDateTo: z.string().optional(),
  search: z.string().optional(),
  sortBy: z
    .enum([
      "position",
      "createdAt",
      "updatedAt",
      "dueDate",
      "priority",
      "title",
    ])
    .default("position"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  projectId: z.string().uuid().optional(),
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
  WEBHOOKS: "webhooks",
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

// -----------------------------------------------------------------------------
// Attachment & Storage Schemas
// -----------------------------------------------------------------------------
export const AttachmentStatus = {
  PENDING: "PENDING",
  READY: "READY",
  FAILED: "FAILED",
} as const;
export type AttachmentStatusType =
  (typeof AttachmentStatus)[keyof typeof AttachmentStatus];

export const AttachmentResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  uploaderId: z.string().uuid(),
  uploader: z
    .object({
      id: z.string().uuid(),
      displayName: z.string(),
      email: z.string().email(),
    })
    .optional(),
  projectId: z.string().uuid().nullable().optional(),
  taskId: z.string().uuid().nullable().optional(),
  fileName: z.string(),
  storageKey: z.string(),
  mimeType: z.string(),
  fileSize: z.number().int(),
  status: z.enum(["PENDING", "READY", "FAILED"]),
  downloadUrl: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AttachmentResponse = z.infer<typeof AttachmentResponseSchema>;

export const PresignUploadInputSchema = z.object({
  fileName: z.string().min(1, "Filename is required").max(255),
  mimeType: z.string().min(1, "MIME type is required"),
  fileSize: z.number().int().positive("File size must be positive"),
  taskId: z.string().uuid("Task ID must be a valid UUID").optional(),
  projectId: z.string().uuid("Project ID must be a valid UUID").optional(),
});
export type PresignUploadInput = z.infer<typeof PresignUploadInputSchema>;

export const PresignUploadResponseSchema = z.object({
  attachment: AttachmentResponseSchema,
  uploadUrl: z.string(),
  storageKey: z.string(),
  fields: z.record(z.string()).optional(),
  expiresInSeconds: z.number(),
});
export type PresignUploadResponse = z.infer<typeof PresignUploadResponseSchema>;

export const ConfirmUploadInputSchema = z.object({
  storageKey: z.string().optional(),
});
export type ConfirmUploadInput = z.infer<typeof ConfirmUploadInputSchema>;

export const AttachmentListQuerySchema = z.object({
  taskId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  status: z.enum(["PENDING", "READY", "FAILED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type AttachmentListQuery = z.infer<typeof AttachmentListQuerySchema>;

// -----------------------------------------------------------------------------
// Developer Platform & Webhook Schemas
// -----------------------------------------------------------------------------

export const ApiKeyScope = {
  ALL: "*",
  PROJECTS_READ: "projects:read",
  PROJECTS_WRITE: "projects:write",
  TASKS_READ: "tasks:read",
  TASKS_WRITE: "tasks:write",
  WEBHOOKS_READ: "webhooks:read",
  WEBHOOKS_WRITE: "webhooks:write",
} as const;
export type ApiKeyScopeType = (typeof ApiKeyScope)[keyof typeof ApiKeyScope];

export const WebhookEventType = {
  TASK_CREATED: "task.created",
  TASK_UPDATED: "task.updated",
  TASK_DELETED: "task.deleted",
  PROJECT_CREATED: "project.created",
  PROJECT_UPDATED: "project.updated",
  PROJECT_DELETED: "project.deleted",
  PING: "ping",
} as const;
export type WebhookEventTypeValue =
  (typeof WebhookEventType)[keyof typeof WebhookEventType];

export const WebhookDeliveryStatus = {
  PENDING: "PENDING",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
} as const;
export type WebhookDeliveryStatusType =
  (typeof WebhookDeliveryStatus)[keyof typeof WebhookDeliveryStatus];

// API Key Schemas
export const CreateApiKeyInputSchema = z.object({
  name: z.string().trim().min(1, "Key name is required").max(100),
  scopes: z
    .array(z.string().trim())
    .min(1, "At least one permission scope is required"),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});
export type CreateApiKeyInput = z.infer<typeof CreateApiKeyInputSchema>;

export const ApiKeyResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string(),
  keyPrefix: z.string(),
  scopes: z.array(z.string()),
  expiresAt: z.string().nullable().optional(),
  lastUsedAt: z.string().nullable().optional(),
  revokedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  createdBy: z
    .object({
      id: z.string().uuid(),
      displayName: z.string(),
      email: z.string(),
    })
    .optional(),
});
export type ApiKeyResponse = z.infer<typeof ApiKeyResponseSchema>;

export const CreateApiKeyResultSchema = z.object({
  apiKey: ApiKeyResponseSchema,
  secret: z.string(),
});
export type CreateApiKeyResult = z.infer<typeof CreateApiKeyResultSchema>;

export const ApiKeyListQuerySchema = z.object({
  status: z.enum(["all", "active", "revoked"]).default("active"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ApiKeyListQuery = z.infer<typeof ApiKeyListQuerySchema>;

// Webhook Subscription Schemas
export const CreateWebhookSubscriptionInputSchema = z.object({
  url: z.string().url("Valid URL is required").max(2048),
  description: z.string().max(255).optional(),
  eventTypes: z
    .array(z.string().trim())
    .min(1, "At least one event type must be selected"),
});
export type CreateWebhookSubscriptionInput = z.infer<
  typeof CreateWebhookSubscriptionInputSchema
>;

export const UpdateWebhookSubscriptionInputSchema = z.object({
  url: z.string().url("Valid URL is required").max(2048).optional(),
  description: z.string().max(255).optional(),
  eventTypes: z.array(z.string().trim()).min(1).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateWebhookSubscriptionInput = z.infer<
  typeof UpdateWebhookSubscriptionInputSchema
>;

export const WebhookSubscriptionResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  url: z.string(),
  description: z.string().nullable().optional(),
  eventTypes: z.array(z.string()),
  isActive: z.boolean(),
  consecutiveFailures: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z
    .object({
      id: z.string().uuid(),
      displayName: z.string(),
      email: z.string(),
    })
    .optional(),
});
export type WebhookSubscriptionResponse = z.infer<
  typeof WebhookSubscriptionResponseSchema
>;

export const CreateWebhookSubscriptionResultSchema = z.object({
  subscription: WebhookSubscriptionResponseSchema,
  secret: z.string(),
});
export type CreateWebhookSubscriptionResult = z.infer<
  typeof CreateWebhookSubscriptionResultSchema
>;

export const RotateWebhookSecretResultSchema = z.object({
  subscription: WebhookSubscriptionResponseSchema,
  secret: z.string(),
});
export type RotateWebhookSecretResult = z.infer<
  typeof RotateWebhookSecretResultSchema
>;

// Webhook Event & Delivery Schemas
export const WebhookEventEnvelopeSchema = z.object({
  id: z.string(),
  type: z.string(),
  version: z.string().default("2026-10-11"),
  createdAt: z.string(),
  organizationId: z.string().uuid(),
  resourceId: z.string(),
  payload: z.record(z.unknown()),
});
export type WebhookEventEnvelope = z.infer<typeof WebhookEventEnvelopeSchema>;

export const WebhookDeliveryResponseSchema = z.object({
  id: z.string().uuid(),
  subscriptionId: z.string().uuid(),
  organizationId: z.string().uuid(),
  eventId: z.string(),
  eventType: z.string(),
  payload: z.record(z.unknown()),
  status: z.enum(["PENDING", "SUCCESS", "FAILED"]),
  statusCode: z.number().nullable().optional(),
  attemptCount: z.number(),
  durationMs: z.number().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type WebhookDeliveryResponse = z.infer<
  typeof WebhookDeliveryResponseSchema
>;

export const WebhookDeliveryListQuerySchema = z.object({
  subscriptionId: z.string().uuid().optional(),
  status: z.enum(["PENDING", "SUCCESS", "FAILED"]).optional(),
  eventType: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type WebhookDeliveryListQuery = z.infer<
  typeof WebhookDeliveryListQuerySchema
>;

export const WebhookDeliveryJobPayloadSchema = z.object({
  deliveryId: z.string().uuid().optional(),
  subscriptionId: z.string().uuid(),
  organizationId: z.string().uuid(),
  event: WebhookEventEnvelopeSchema,
  attempt: z.number().default(1),
  correlationId: z.string().optional(),
});
export type WebhookDeliveryJobPayload = z.infer<
  typeof WebhookDeliveryJobPayloadSchema
>;

// -----------------------------------------------------------------------------
// Enterprise Security, MFA, Session Management & Audit Log Schemas
// -----------------------------------------------------------------------------

// Active User Session Schemas
export const SessionResponseSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable().optional(),
  expiresAt: z.string(),
  userAgent: z.string().nullable().optional(),
  ipAddress: z.string().nullable().optional(),
  isCurrent: z.boolean().default(false),
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

export const SessionListResponseSchema = z.object({
  sessions: z.array(SessionResponseSchema),
});
export type SessionListResponse = z.infer<typeof SessionListResponseSchema>;

// MFA Setup & Configuration Schemas
export const MfaSetupResponseSchema = z.object({
  secret: z.string(),
  qrCodeUri: z.string(),
  manualKey: z.string(),
  recoveryCodes: z.array(z.string()),
});
export type MfaSetupResponse = z.infer<typeof MfaSetupResponseSchema>;

export const MfaEnableInputSchema = z.object({
  code: z
    .string()
    .trim()
    .length(6, "Verification code must be 6 digits")
    .regex(/^\d+$/, "Verification code must be numeric"),
});
export type MfaEnableInput = z.infer<typeof MfaEnableInputSchema>;

export const MfaDisableInputSchema = z.object({
  password: z.string().min(1, "Current password is required to disable MFA"),
  code: z
    .string()
    .trim()
    .length(6, "Verification code must be 6 digits")
    .regex(/^\d+$/, "Verification code must be numeric")
    .optional(),
});
export type MfaDisableInput = z.infer<typeof MfaDisableInputSchema>;

export const MfaRegenerateRecoveryCodesInputSchema = z.object({
  password: z
    .string()
    .min(1, "Current password is required to regenerate recovery codes"),
});
export type MfaRegenerateRecoveryCodesInput = z.infer<
  typeof MfaRegenerateRecoveryCodesInputSchema
>;

export const MfaRegenerateRecoveryCodesResponseSchema = z.object({
  recoveryCodes: z.array(z.string()),
});
export type MfaRegenerateRecoveryCodesResponse = z.infer<
  typeof MfaRegenerateRecoveryCodesResponseSchema
>;

// MFA Login Challenge Schemas
export const LoginResultSchema = z.object({
  mfaRequired: z.boolean(),
  challengeToken: z.string().optional(),
  user: UserProfileSchema.optional(),
});
export type LoginResult = z.infer<typeof LoginResultSchema>;

export const MfaChallengeVerifyInputSchema = z.object({
  challengeToken: z.string().min(1, "MFA challenge token is required"),
  code: z
    .string()
    .trim()
    .length(6, "Verification code must be 6 digits")
    .regex(/^\d+$/, "Verification code must be numeric"),
});
export type MfaChallengeVerifyInput = z.infer<
  typeof MfaChallengeVerifyInputSchema
>;

export const MfaChallengeRecoveryInputSchema = z.object({
  challengeToken: z.string().min(1, "MFA challenge token is required"),
  recoveryCode: z.string().trim().min(8, "Valid recovery code is required"),
});
export type MfaChallengeRecoveryInput = z.infer<
  typeof MfaChallengeRecoveryInputSchema
>;

// Organization Security Policy Schemas
export const OrganizationSecurityPolicyResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  requireMfa: z.boolean(),
  sessionMaxAgeMinutes: z.number().int().min(15).max(43200),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OrganizationSecurityPolicyResponse = z.infer<
  typeof OrganizationSecurityPolicyResponseSchema
>;

export const UpdateOrganizationSecurityPolicyInputSchema = z.object({
  requireMfa: z.boolean().optional(),
  sessionMaxAgeMinutes: z
    .number()
    .int()
    .min(15, "Session max age must be at least 15 minutes")
    .max(43200, "Session max age cannot exceed 30 days (43200 minutes)")
    .optional(),
});
export type UpdateOrganizationSecurityPolicyInput = z.infer<
  typeof UpdateOrganizationSecurityPolicyInputSchema
>;

// Security Audit Log Schemas
export const AuditLogEventItemSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid().nullable().optional(),
  actorId: z.string().uuid().nullable().optional(),
  action: z.string(),
  targetType: z.string().nullable().optional(),
  targetId: z.string().nullable().optional(),
  requestId: z.string().nullable().optional(),
  outcome: z.string(),
  ipAddress: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  createdAt: z.string(),
  actor: z
    .object({
      id: z.string().uuid(),
      displayName: z.string(),
      email: z.string(),
    })
    .nullable()
    .optional(),
});
export type AuditLogEventItem = z.infer<typeof AuditLogEventItemSchema>;

export const AuditLogListQuerySchema = z.object({
  action: z.string().optional(),
  outcome: z.enum(["SUCCESS", "FAILURE"]).optional(),
  actorId: z.string().uuid().optional(),
  targetType: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});
export type AuditLogListQuery = z.infer<typeof AuditLogListQuerySchema>;
