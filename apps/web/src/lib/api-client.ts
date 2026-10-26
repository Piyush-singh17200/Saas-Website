import type {
  ApiResponse,
  HealthData,
  ReadinessData,
  ProjectResponse,
  ProjectQuery,
  CreateProjectInput,
  UpdateProjectInput,
  TaskResponse,
  TaskQuery,
  CreateTaskInput,
  UpdateTaskInput,
  MoveTaskInput,
  AssignTaskInput,
  CommentResponse,
  CreateCommentInput,
  UpdateCommentInput,
  ActivityLogResponse,
  ActivityQuery,
  PaginatedResult,
  OrganizationResponse,
  MembershipResponse,
  InvitationResponse,
  CreateInvitationInput,
  NotificationResponse,
  NotificationListQuery,
  BillingSummaryResponse,
  CreateCheckoutSessionResponse,
  CreatePortalSessionResponse,
  PublicInvitationDetails,
  AcceptInvitationResult,
  AttachmentResponse,
  PresignUploadInput,
  PresignUploadResponse,
  TagResponse,
  CreateTagInput,
  UpdateTagInput,
  AssignTagsInput,
  ApiKeyResponse,
  CreateApiKeyInput,
  CreateApiKeyResult,
  WebhookSubscriptionResponse,
  CreateWebhookSubscriptionInput,
  CreateWebhookSubscriptionResult,
  UpdateWebhookSubscriptionInput,
  RotateWebhookSecretResult,
  WebhookDeliveryResponse,
  WebhookDeliveryListQuery,
  SessionResponse,
  MfaSetupResponse,
  MfaRegenerateRecoveryCodesResponse,
  OrganizationSecurityPolicyResponse,
  UpdateOrganizationSecurityPolicyInput,
  AuditLogEventItem,
  AuditLogListQuery,
  UserProfile,
} from "@workspace/contracts";

export interface ApiClientConfig {
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
}

export class ApiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: unknown;
  public readonly requestId?: string;

  constructor(
    message: string,
    status: number,
    code = "API_ERROR",
    details?: unknown,
    requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;

  constructor(config: ApiClientConfig = {}) {
    this.baseUrl = (
      config.baseUrl ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:4000"
    ).replace(/\/$/, "");

    this.defaultHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...config.defaultHeaders,
    };
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const url = `${this.baseUrl}${cleanEndpoint}`;

    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...((options.headers as Record<string, string>) || {}),
    };

    if (typeof FormData !== "undefined" && options.body instanceof FormData) {
      delete headers["Content-Type"];
    }

    const res = await fetch(url, {
      credentials: "include",
      ...options,
      headers,
    });

    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");

    if (!isJson) {
      if (!res.ok) {
        throw new ApiError(
          `Request failed with status ${res.status}: ${res.statusText}`,
          res.status,
        );
      }
      return (await res.text()) as unknown as T;
    }

    const payload = (await res.json()) as ApiResponse<T>;

    if (!res.ok || !payload.success) {
      const errorObj = !payload.success ? payload.error : undefined;
      const meta = payload.meta;
      throw new ApiError(
        errorObj?.message || `HTTP ${res.status} error`,
        res.status,
        errorObj?.code || "UNKNOWN_ERROR",
        errorObj?.details,
        meta?.requestId,
      );
    }

    return payload.data;
  }

  public async getHealth(): Promise<HealthData> {
    return this.request<HealthData>("/api/v1/health");
  }

  public async getReadiness(): Promise<ReadinessData> {
    return this.request<ReadinessData>("/api/v1/ready");
  }

  // Auth & Organizations
  public async getMe(): Promise<{
    user: { id: string; email: string; displayName: string };
  }> {
    return this.request("/api/v1/me");
  }

  public async login(data: { email: string; password: string }): Promise<{
    user: { id: string; email: string; displayName: string };
  }> {
    return this.request("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  public async register(data: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<{
    user: { id: string; email: string; displayName: string };
  }> {
    return this.request("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  public async logout(): Promise<{ message: string }> {
    return this.request("/api/v1/auth/logout", {
      method: "POST",
    });
  }

  public async forgotPassword(data: {
    email: string;
  }): Promise<{ success: boolean; message: string }> {
    return this.request("/api/v1/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  public async resetPassword(data: {
    token: string;
    newPassword: string;
  }): Promise<{ success: boolean; message: string }> {
    return this.request("/api/v1/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  public async verifyEmail(data: {
    token: string;
  }): Promise<{ success: boolean; message: string }> {
    return this.request("/api/v1/auth/verify-email", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  public async resendVerification(data: {
    email: string;
  }): Promise<{ success: boolean; message: string }> {
    return this.request("/api/v1/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  public async deleteAccount(data: {
    password: string;
    confirmationPhrase: string;
  }): Promise<{
    success: boolean;
    message: string;
    deletedOrganizationsCount: number;
  }> {
    return this.request("/api/v1/auth/account", {
      method: "DELETE",
      body: JSON.stringify(data),
    });
  }

  public async getOrganizations(): Promise<{
    organizations: OrganizationResponse[];
  }> {
    return this.request("/api/v1/organizations");
  }

  public async createOrganization(data: {
    name: string;
    slug: string;
  }): Promise<{ organization: OrganizationResponse }> {
    return this.request("/api/v1/organizations", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  public async getOrganization(
    organizationId: string,
  ): Promise<OrganizationResponse> {
    const result = await this.request<{
      organization: OrganizationResponse;
    }>(`/api/v1/organizations/${organizationId}`);
    return result.organization;
  }

  public async getMembers(
    organizationId: string,
  ): Promise<{ members: MembershipResponse[] }> {
    return this.request(`/api/v1/organizations/${organizationId}/members`);
  }

  // Projects
  public async getProjects(
    organizationId: string,
    query?: Partial<ProjectQuery>,
  ): Promise<PaginatedResult<ProjectResponse>> {
    const params = new URLSearchParams();
    if (query?.status) params.append("status", query.status);
    if (query?.search) params.append("search", query.search);
    if (query?.page) params.append("page", String(query.page));
    if (query?.limit) params.append("limit", String(query.limit));
    const qs = params.toString() ? `?${params.toString()}` : "";
    return this.request(
      `/api/v1/organizations/${organizationId}/projects${qs}`,
    );
  }

  public async getProject(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectResponse> {
    const result = await this.request<{ project: ProjectResponse }>(
      `/api/v1/organizations/${organizationId}/projects/${projectId}`,
    );
    return result.project;
  }

  public async createProject(
    organizationId: string,
    data: CreateProjectInput,
  ): Promise<ProjectResponse> {
    const result = await this.request<{ project: ProjectResponse }>(
      `/api/v1/organizations/${organizationId}/projects`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    );
    return result.project;
  }

  public async updateProject(
    organizationId: string,
    projectId: string,
    data: UpdateProjectInput,
  ): Promise<ProjectResponse> {
    const result = await this.request<{ project: ProjectResponse }>(
      `/api/v1/organizations/${organizationId}/projects/${projectId}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      },
    );
    return result.project;
  }

  public async archiveProject(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectResponse> {
    const result = await this.request<{ project: ProjectResponse }>(
      `/api/v1/organizations/${organizationId}/projects/${projectId}/archive`,
      {
        method: "POST",
      },
    );
    return result.project;
  }

  public async restoreProject(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectResponse> {
    const result = await this.request<{ project: ProjectResponse }>(
      `/api/v1/organizations/${organizationId}/projects/${projectId}/restore`,
      {
        method: "POST",
      },
    );
    return result.project;
  }

  // Tasks
  public async getTasks(
    organizationId: string,
    projectId: string,
    query?: Partial<TaskQuery>,
  ): Promise<PaginatedResult<TaskResponse>> {
    const params = new URLSearchParams();
    if (query?.status) params.append("status", query.status);
    if (query?.priority) params.append("priority", query.priority);
    if (query?.assigneeId) params.append("assigneeId", query.assigneeId);
    if (query?.tagIds) {
      if (Array.isArray(query.tagIds)) {
        query.tagIds.forEach((t) => params.append("tagIds", t));
      } else {
        params.append("tagIds", query.tagIds);
      }
    }
    if (query?.isOverdue !== undefined)
      params.append("isOverdue", String(query.isOverdue));
    if (query?.dueDateFrom) params.append("dueDateFrom", query.dueDateFrom);
    if (query?.dueDateTo) params.append("dueDateTo", query.dueDateTo);
    if (query?.search) params.append("search", query.search);
    if (query?.sortBy) params.append("sortBy", query.sortBy);
    if (query?.sortOrder) params.append("sortOrder", query.sortOrder);
    if (query?.page) params.append("page", String(query.page));
    if (query?.limit) params.append("limit", String(query.limit));
    const qs = params.toString() ? `?${params.toString()}` : "";
    return this.request(
      `/api/v1/organizations/${organizationId}/projects/${projectId}/tasks${qs}`,
    );
  }

  public async getTask(
    organizationId: string,
    projectId: string,
    taskId: string,
  ): Promise<TaskResponse> {
    const result = await this.request<{ task: TaskResponse }>(
      `/api/v1/organizations/${organizationId}/projects/${projectId}/tasks/${taskId}`,
    );
    return result.task;
  }

  public async createTask(
    organizationId: string,
    projectId: string,
    data: CreateTaskInput,
  ): Promise<TaskResponse> {
    const result = await this.request<{ task: TaskResponse }>(
      `/api/v1/organizations/${organizationId}/projects/${projectId}/tasks`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    );
    return result.task;
  }

  public async updateTask(
    organizationId: string,
    projectId: string,
    taskId: string,
    data: UpdateTaskInput,
  ): Promise<TaskResponse> {
    const result = await this.request<{ task: TaskResponse }>(
      `/api/v1/organizations/${organizationId}/projects/${projectId}/tasks/${taskId}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      },
    );
    return result.task;
  }

  public async deleteTask(
    organizationId: string,
    projectId: string,
    taskId: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.request(
      `/api/v1/organizations/${organizationId}/projects/${projectId}/tasks/${taskId}`,
      {
        method: "DELETE",
      },
    );
  }

  public async moveTask(
    organizationId: string,
    projectId: string,
    taskId: string,
    data: MoveTaskInput,
  ): Promise<TaskResponse> {
    const result = await this.request<{ task: TaskResponse }>(
      `/api/v1/organizations/${organizationId}/projects/${projectId}/tasks/${taskId}/move`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    );
    return result.task;
  }

  public async assignTask(
    organizationId: string,
    projectId: string,
    taskId: string,
    data: AssignTaskInput,
  ): Promise<TaskResponse> {
    const result = await this.request<{ task: TaskResponse }>(
      `/api/v1/organizations/${organizationId}/projects/${projectId}/tasks/${taskId}/assign`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    );
    return result.task;
  }

  // Tags
  public async getTags(
    organizationId: string,
  ): Promise<{ tags: TagResponse[] }> {
    return this.request(`/api/v1/organizations/${organizationId}/tags`);
  }

  public async createTag(
    organizationId: string,
    data: CreateTagInput,
  ): Promise<{ tag: TagResponse }> {
    return this.request(`/api/v1/organizations/${organizationId}/tags`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  public async updateTag(
    organizationId: string,
    tagId: string,
    data: UpdateTagInput,
  ): Promise<{ tag: TagResponse }> {
    return this.request(
      `/api/v1/organizations/${organizationId}/tags/${tagId}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      },
    );
  }

  public async deleteTag(
    organizationId: string,
    tagId: string,
  ): Promise<{ deleted: boolean }> {
    return this.request(
      `/api/v1/organizations/${organizationId}/tags/${tagId}`,
      {
        method: "DELETE",
      },
    );
  }

  public async assignTagsToTask(
    organizationId: string,
    projectId: string,
    taskId: string,
    data: AssignTagsInput,
  ): Promise<{ tags: TagResponse[] }> {
    return this.request(
      `/api/v1/organizations/${organizationId}/projects/${projectId}/tasks/${taskId}/tags`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    );
  }

  public async removeTagFromTask(
    organizationId: string,
    projectId: string,
    taskId: string,
    tagId: string,
  ): Promise<{ removed: boolean }> {
    return this.request(
      `/api/v1/organizations/${organizationId}/projects/${projectId}/tasks/${taskId}/tags/${tagId}`,
      {
        method: "DELETE",
      },
    );
  }

  // Comments
  public async getComments(
    organizationId: string,
    projectId: string,
    taskId: string,
    page = 1,
    limit = 50,
  ): Promise<PaginatedResult<CommentResponse>> {
    return this.request(
      `/api/v1/organizations/${organizationId}/projects/${projectId}/tasks/${taskId}/comments?page=${page}&limit=${limit}`,
    );
  }

  public async createComment(
    organizationId: string,
    projectId: string,
    taskId: string,
    data: CreateCommentInput,
  ): Promise<CommentResponse> {
    const result = await this.request<{ comment: CommentResponse }>(
      `/api/v1/organizations/${organizationId}/projects/${projectId}/tasks/${taskId}/comments`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    );
    return result.comment;
  }

  public async updateComment(
    organizationId: string,
    projectId: string,
    taskId: string,
    commentId: string,
    data: UpdateCommentInput,
  ): Promise<CommentResponse> {
    const result = await this.request<{ comment: CommentResponse }>(
      `/api/v1/organizations/${organizationId}/projects/${projectId}/tasks/${taskId}/comments/${commentId}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      },
    );
    return result.comment;
  }

  public async deleteComment(
    organizationId: string,
    projectId: string,
    taskId: string,
    commentId: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.request(
      `/api/v1/organizations/${organizationId}/projects/${projectId}/tasks/${taskId}/comments/${commentId}`,
      {
        method: "DELETE",
      },
    );
  }

  // Activity History
  public async getActivity(
    organizationId: string,
    query?: Partial<ActivityQuery>,
  ): Promise<PaginatedResult<ActivityLogResponse>> {
    const params = new URLSearchParams();
    if (query?.projectId) params.append("projectId", query.projectId);
    if (query?.taskId) params.append("taskId", query.taskId);
    if (query?.actorId) params.append("actorId", query.actorId);
    if (query?.eventType) params.append("eventType", query.eventType);
    if (query?.page) params.append("page", String(query.page));
    if (query?.limit) params.append("limit", String(query.limit));
    const qs = params.toString() ? `?${params.toString()}` : "";
    return this.request(
      `/api/v1/organizations/${organizationId}/activity${qs}`,
    );
  }

  // Billing & Subscriptions
  public async getBillingSummary(
    organizationId: string,
  ): Promise<BillingSummaryResponse> {
    return this.request(`/api/v1/organizations/${organizationId}/billing`);
  }

  public async createCheckoutSession(
    organizationId: string,
  ): Promise<CreateCheckoutSessionResponse> {
    return this.request(
      `/api/v1/organizations/${organizationId}/billing/checkout`,
      {
        method: "POST",
      },
    );
  }

  public async createPortalSession(
    organizationId: string,
  ): Promise<CreatePortalSessionResponse> {
    return this.request(
      `/api/v1/organizations/${organizationId}/billing/portal`,
      {
        method: "POST",
      },
    );
  }

  // Member Management & Invitations
  public async addMember(
    organizationId: string,
    data: { email: string; role?: "ADMIN" | "MEMBER" },
  ): Promise<{ member: MembershipResponse }> {
    return this.request(`/api/v1/organizations/${organizationId}/members`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  public async updateMemberRole(
    organizationId: string,
    userId: string,
    role: "ADMIN" | "MEMBER",
  ): Promise<{ member: MembershipResponse }> {
    return this.request(
      `/api/v1/organizations/${organizationId}/members/${userId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ role }),
      },
    );
  }

  public async removeMember(
    organizationId: string,
    userId: string,
  ): Promise<{ message: string }> {
    return this.request(
      `/api/v1/organizations/${organizationId}/members/${userId}`,
      {
        method: "DELETE",
      },
    );
  }

  public async getInvitations(
    organizationId: string,
  ): Promise<{ invitations: InvitationResponse[] }> {
    return this.request(`/api/v1/organizations/${organizationId}/invitations`);
  }

  public async createInvitation(
    organizationId: string,
    data: CreateInvitationInput,
  ): Promise<{ invitation: InvitationResponse }> {
    return this.request(`/api/v1/organizations/${organizationId}/invitations`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  public async revokeInvitation(
    organizationId: string,
    invitationId: string,
  ): Promise<{ message: string }> {
    return this.request(
      `/api/v1/organizations/${organizationId}/invitations/${invitationId}/revoke`,
      {
        method: "POST",
      },
    );
  }

  public async resendInvitation(
    organizationId: string,
    invitationId: string,
  ): Promise<{ invitation: InvitationResponse }> {
    return this.request(
      `/api/v1/organizations/${organizationId}/invitations/${invitationId}/resend`,
      {
        method: "POST",
      },
    );
  }

  public async getInvitationByToken(
    token: string,
  ): Promise<PublicInvitationDetails> {
    return this.request(`/api/v1/invitations/${encodeURIComponent(token)}`);
  }

  public async acceptInvitation(
    token: string,
  ): Promise<AcceptInvitationResult> {
    return this.request(
      `/api/v1/invitations/${encodeURIComponent(token)}/accept`,
      {
        method: "POST",
      },
    );
  }

  // Notifications
  public async getNotifications(
    organizationId: string,
    query?: Partial<NotificationListQuery>,
  ): Promise<{
    notifications: NotificationResponse[];
    total: number;
    unreadCount: number;
  }> {
    const params = new URLSearchParams();
    if (query?.unreadOnly !== undefined) {
      params.append("unreadOnly", String(query.unreadOnly));
    }
    if (query?.page) params.append("page", String(query.page));
    if (query?.limit) params.append("limit", String(query.limit));
    const qs = params.toString() ? `?${params.toString()}` : "";
    return this.request(
      `/api/v1/organizations/${organizationId}/notifications${qs}`,
    );
  }

  public async getUnreadNotificationCount(
    organizationId: string,
  ): Promise<{ unreadCount: number }> {
    return this.request(
      `/api/v1/organizations/${organizationId}/notifications/unread-count`,
    );
  }

  public async markNotificationAsRead(
    organizationId: string,
    notificationId: string,
  ): Promise<NotificationResponse> {
    return this.request(
      `/api/v1/organizations/${organizationId}/notifications/${notificationId}/read`,
      {
        method: "PATCH",
      },
    );
  }

  public async markAllNotificationsAsRead(
    organizationId: string,
  ): Promise<{ count: number }> {
    return this.request(
      `/api/v1/organizations/${organizationId}/notifications/read-all`,
      {
        method: "POST",
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Attachment & File Operations
  // ---------------------------------------------------------------------------
  public async uploadAttachment(
    organizationId: string,
    file: File,
    options?: { taskId?: string; projectId?: string },
  ): Promise<AttachmentResponse> {
    const formData = new FormData();
    formData.append("file", file);
    if (options?.taskId) formData.append("taskId", options.taskId);
    if (options?.projectId) formData.append("projectId", options.projectId);

    return this.request<AttachmentResponse>(
      `/api/v1/organizations/${organizationId}/attachments/upload`,
      {
        method: "POST",
        body: formData,
      },
    );
  }

  public async initiatePresignedUpload(
    organizationId: string,
    input: PresignUploadInput,
  ): Promise<PresignUploadResponse> {
    return this.request<PresignUploadResponse>(
      `/api/v1/organizations/${organizationId}/attachments/presign`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  public async confirmPresignedUpload(
    organizationId: string,
    attachmentId: string,
  ): Promise<{ attachment: AttachmentResponse }> {
    return this.request<{ attachment: AttachmentResponse }>(
      `/api/v1/organizations/${organizationId}/attachments/${attachmentId}/confirm`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );
  }

  public async listAttachments(
    organizationId: string,
    params?: {
      taskId?: string;
      projectId?: string;
      status?: "PENDING" | "READY" | "FAILED";
    },
  ): Promise<{ attachments: AttachmentResponse[] }> {
    const query = new URLSearchParams();
    if (params?.taskId) query.append("taskId", params.taskId);
    if (params?.projectId) query.append("projectId", params.projectId);
    if (params?.status) query.append("status", params.status);
    const qs = query.toString() ? `?${query.toString()}` : "";

    return this.request<{ attachments: AttachmentResponse[] }>(
      `/api/v1/organizations/${organizationId}/attachments${qs}`,
    );
  }

  public async getAttachmentDownloadUrl(
    organizationId: string,
    attachmentId: string,
  ): Promise<{ attachment: AttachmentResponse; downloadUrl: string }> {
    return this.request<{
      attachment: AttachmentResponse;
      downloadUrl: string;
    }>(
      `/api/v1/organizations/${organizationId}/attachments/${attachmentId}/download`,
    );
  }

  public async deleteAttachment(
    organizationId: string,
    attachmentId: string,
  ): Promise<{ message: string }> {
    return this.request<{ message: string }>(
      `/api/v1/organizations/${organizationId}/attachments/${attachmentId}`,
      {
        method: "DELETE",
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Developer Platform & Webhook Methods
  // ---------------------------------------------------------------------------

  public async listApiKeys(
    organizationId: string,
    status?: "all" | "active" | "revoked",
  ): Promise<{
    keys: ApiKeyResponse[];
    total: number;
    page: number;
    limit: number;
  }> {
    const qs = status ? `?status=${status}` : "";
    return this.request<{
      keys: ApiKeyResponse[];
      total: number;
      page: number;
      limit: number;
    }>(`/api/v1/organizations/${organizationId}/developer/api-keys${qs}`);
  }

  public async createApiKey(
    organizationId: string,
    input: CreateApiKeyInput,
  ): Promise<CreateApiKeyResult> {
    return this.request<CreateApiKeyResult>(
      `/api/v1/organizations/${organizationId}/developer/api-keys`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  public async revokeApiKey(
    organizationId: string,
    keyId: string,
  ): Promise<ApiKeyResponse> {
    return this.request<ApiKeyResponse>(
      `/api/v1/organizations/${organizationId}/developer/api-keys/${keyId}`,
      {
        method: "DELETE",
      },
    );
  }

  public async listWebhookSubscriptions(
    organizationId: string,
  ): Promise<{ subscriptions: WebhookSubscriptionResponse[] }> {
    return this.request<{ subscriptions: WebhookSubscriptionResponse[] }>(
      `/api/v1/organizations/${organizationId}/developer/webhooks`,
    );
  }

  public async createWebhookSubscription(
    organizationId: string,
    input: CreateWebhookSubscriptionInput,
  ): Promise<CreateWebhookSubscriptionResult> {
    return this.request<CreateWebhookSubscriptionResult>(
      `/api/v1/organizations/${organizationId}/developer/webhooks`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  public async updateWebhookSubscription(
    organizationId: string,
    subscriptionId: string,
    input: UpdateWebhookSubscriptionInput,
  ): Promise<{ subscription: WebhookSubscriptionResponse }> {
    return this.request<{ subscription: WebhookSubscriptionResponse }>(
      `/api/v1/organizations/${organizationId}/developer/webhooks/${subscriptionId}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
  }

  public async rotateWebhookSecret(
    organizationId: string,
    subscriptionId: string,
  ): Promise<RotateWebhookSecretResult> {
    return this.request<RotateWebhookSecretResult>(
      `/api/v1/organizations/${organizationId}/developer/webhooks/${subscriptionId}/rotate-secret`,
      {
        method: "POST",
      },
    );
  }

  public async deleteWebhookSubscription(
    organizationId: string,
    subscriptionId: string,
  ): Promise<{ message: string }> {
    return this.request<{ message: string }>(
      `/api/v1/organizations/${organizationId}/developer/webhooks/${subscriptionId}`,
      {
        method: "DELETE",
      },
    );
  }

  public async triggerWebhookPing(
    organizationId: string,
    subscriptionId: string,
  ): Promise<{ deliveryId: string; eventId: string }> {
    return this.request<{ deliveryId: string; eventId: string }>(
      `/api/v1/organizations/${organizationId}/developer/webhooks/${subscriptionId}/ping`,
      {
        method: "POST",
      },
    );
  }

  public async listWebhookDeliveries(
    organizationId: string,
    params?: Partial<WebhookDeliveryListQuery>,
  ): Promise<{
    deliveries: WebhookDeliveryResponse[];
    total: number;
    page: number;
    limit: number;
  }> {
    const query = new URLSearchParams();
    if (params?.subscriptionId)
      query.append("subscriptionId", params.subscriptionId);
    if (params?.status) query.append("status", params.status);
    if (params?.eventType) query.append("eventType", params.eventType);
    if (params?.page) query.append("page", params.page.toString());
    if (params?.limit) query.append("limit", params.limit.toString());
    const qs = query.toString() ? `?${query.toString()}` : "";

    return this.request<{
      deliveries: WebhookDeliveryResponse[];
      total: number;
      page: number;
      limit: number;
    }>(
      `/api/v1/organizations/${organizationId}/developer/webhooks/deliveries${qs}`,
    );
  }

  public async retryWebhookDelivery(
    organizationId: string,
    subscriptionId: string,
    deliveryId: string,
  ): Promise<WebhookDeliveryResponse> {
    return this.request<WebhookDeliveryResponse>(
      `/api/v1/organizations/${organizationId}/developer/webhooks/${subscriptionId}/deliveries/${deliveryId}/retry`,
      {
        method: "POST",
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Enterprise Security & Session Management
  // ---------------------------------------------------------------------------

  public async getSessions(): Promise<{ sessions: SessionResponse[] }> {
    return this.request<{ sessions: SessionResponse[] }>(
      "/api/v1/auth/sessions",
    );
  }

  public async revokeSession(sessionId: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(
      `/api/v1/auth/sessions/${sessionId}`,
      {
        method: "DELETE",
      },
    );
  }

  public async revokeOtherSessions(): Promise<{
    message: string;
    revokedCount: number;
  }> {
    return this.request<{ message: string; revokedCount: number }>(
      "/api/v1/auth/sessions/other",
      { method: "DELETE" },
    );
  }

  // ---------------------------------------------------------------------------
  // User MFA Management
  // ---------------------------------------------------------------------------

  public async setupMfa(): Promise<MfaSetupResponse> {
    return this.request<MfaSetupResponse>("/api/v1/auth/mfa/setup", {
      method: "POST",
    });
  }

  public async enableMfa(code: string): Promise<{ message: string }> {
    return this.request<{ message: string }>("/api/v1/auth/mfa/enable", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  }

  public async disableMfa(
    password: string,
    code?: string,
  ): Promise<{ message: string }> {
    return this.request<{ message: string }>("/api/v1/auth/mfa/disable", {
      method: "POST",
      body: JSON.stringify({ password, code }),
    });
  }

  public async regenerateRecoveryCodes(
    password: string,
  ): Promise<MfaRegenerateRecoveryCodesResponse> {
    return this.request<MfaRegenerateRecoveryCodesResponse>(
      "/api/v1/auth/mfa/recovery-codes/regenerate",
      {
        method: "POST",
        body: JSON.stringify({ password }),
      },
    );
  }

  public async verifyMfaChallenge(
    challengeToken: string,
    code: string,
  ): Promise<{ user: UserProfile }> {
    return this.request<{ user: UserProfile }>(
      "/api/v1/auth/mfa/challenge/verify",
      {
        method: "POST",
        body: JSON.stringify({ challengeToken, code }),
      },
    );
  }

  public async verifyMfaRecovery(
    challengeToken: string,
    recoveryCode: string,
  ): Promise<{ user: UserProfile }> {
    return this.request<{ user: UserProfile }>(
      "/api/v1/auth/mfa/challenge/recovery",
      {
        method: "POST",
        body: JSON.stringify({ challengeToken, recoveryCode }),
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Organization Security Policy & Audit Logs
  // ---------------------------------------------------------------------------

  public async getOrganizationSecurityPolicy(
    organizationId: string,
  ): Promise<{ policy: OrganizationSecurityPolicyResponse }> {
    return this.request<{ policy: OrganizationSecurityPolicyResponse }>(
      `/api/v1/organizations/${organizationId}/security/policy`,
    );
  }

  public async updateOrganizationSecurityPolicy(
    organizationId: string,
    data: UpdateOrganizationSecurityPolicyInput,
  ): Promise<{ policy: OrganizationSecurityPolicyResponse }> {
    return this.request<{ policy: OrganizationSecurityPolicyResponse }>(
      `/api/v1/organizations/${organizationId}/security/policy`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      },
    );
  }

  public async getOrganizationAuditLogs(
    organizationId: string,
    params?: Partial<AuditLogListQuery>,
  ): Promise<{
    items: AuditLogEventItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const query = new URLSearchParams();
    if (params?.action) query.append("action", params.action);
    if (params?.outcome) query.append("outcome", params.outcome);
    if (params?.actorId) query.append("actorId", params.actorId);
    if (params?.targetType) query.append("targetType", params.targetType);
    if (params?.page) query.append("page", params.page.toString());
    if (params?.limit) query.append("limit", params.limit.toString());
    if (params?.startDate) query.append("startDate", params.startDate);
    if (params?.endDate) query.append("endDate", params.endDate);
    const qs = query.toString() ? `?${query.toString()}` : "";

    return this.request<{
      items: AuditLogEventItem[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>(`/api/v1/organizations/${organizationId}/security/audit-logs${qs}`);
  }
}

export const apiClient = new ApiClient();
