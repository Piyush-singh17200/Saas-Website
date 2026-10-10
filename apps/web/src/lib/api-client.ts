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

  public async getOrganizations(): Promise<{
    organizations: OrganizationResponse[];
  }> {
    return this.request("/api/v1/organizations");
  }

  public async getOrganization(
    organizationId: string,
  ): Promise<OrganizationResponse> {
    return this.request(`/api/v1/organizations/${organizationId}`);
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
    return this.request(
      `/api/v1/organizations/${organizationId}/projects/${projectId}`,
    );
  }

  public async createProject(
    organizationId: string,
    data: CreateProjectInput,
  ): Promise<ProjectResponse> {
    return this.request(`/api/v1/organizations/${organizationId}/projects`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  public async updateProject(
    organizationId: string,
    projectId: string,
    data: UpdateProjectInput,
  ): Promise<ProjectResponse> {
    return this.request(
      `/api/v1/organizations/${organizationId}/projects/${projectId}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      },
    );
  }

  public async archiveProject(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectResponse> {
    return this.request(
      `/api/v1/organizations/${organizationId}/projects/${projectId}/archive`,
      {
        method: "POST",
      },
    );
  }

  public async restoreProject(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectResponse> {
    return this.request(
      `/api/v1/organizations/${organizationId}/projects/${projectId}/restore`,
      {
        method: "POST",
      },
    );
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
    return this.request(
      `/api/v1/organizations/${organizationId}/projects/${projectId}/tasks/${taskId}`,
    );
  }

  public async createTask(
    organizationId: string,
    projectId: string,
    data: CreateTaskInput,
  ): Promise<TaskResponse> {
    return this.request(
      `/api/v1/organizations/${organizationId}/projects/${projectId}/tasks`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    );
  }

  public async updateTask(
    organizationId: string,
    projectId: string,
    taskId: string,
    data: UpdateTaskInput,
  ): Promise<TaskResponse> {
    return this.request(
      `/api/v1/organizations/${organizationId}/projects/${projectId}/tasks/${taskId}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      },
    );
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
    return this.request(
      `/api/v1/organizations/${organizationId}/projects/${projectId}/tasks/${taskId}/move`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    );
  }

  public async assignTask(
    organizationId: string,
    projectId: string,
    taskId: string,
    data: AssignTaskInput,
  ): Promise<TaskResponse> {
    return this.request(
      `/api/v1/organizations/${organizationId}/projects/${projectId}/tasks/${taskId}/assign`,
      {
        method: "POST",
        body: JSON.stringify(data),
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
    return this.request(
      `/api/v1/organizations/${organizationId}/projects/${projectId}/tasks/${taskId}/comments`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    );
  }

  public async updateComment(
    organizationId: string,
    projectId: string,
    taskId: string,
    commentId: string,
    data: UpdateCommentInput,
  ): Promise<CommentResponse> {
    return this.request(
      `/api/v1/organizations/${organizationId}/projects/${projectId}/tasks/${taskId}/comments/${commentId}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      },
    );
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
    return this.request(
      `/api/v1/organizations/${organizationId}/invitations`,
    );
  }

  public async createInvitation(
    organizationId: string,
    data: CreateInvitationInput,
  ): Promise<{ invitation: InvitationResponse }> {
    return this.request(
      `/api/v1/organizations/${organizationId}/invitations`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    );
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
}


export const apiClient = new ApiClient();
