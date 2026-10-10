import type {
  ApiResponse,
  HealthData,
  ReadinessData,
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
}

export const apiClient = new ApiClient();
