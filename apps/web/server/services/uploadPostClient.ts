export class UploadPostClientError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
  ) {
    super(message);
    this.name = "UploadPostClientError";
  }
}

export interface UploadPostClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

export interface UploadPostListProfileInput {
  apiKey: string;
  tenantId: string;
  userId: number;
}

export interface UploadPostCreateProfileInput extends UploadPostListProfileInput {
  platform: string;
  platformPageId: string;
  displayName?: string | null;
}

export interface UploadPostJobRequestInput extends UploadPostListProfileInput {
  profileId: number | null;
  platform: string;
  contentText?: string | null;
  contentLink?: string | null;
  mediaRefs?: string[] | null;
  scheduledAt?: string | null;
  queueKey?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface UploadPostClientResponse<T> {
  ok: boolean;
  status: number;
  data: T;
}

async function normalizeBaseUrl(baseUrl?: string): Promise<string> {
  if (baseUrl) return baseUrl.replace(/\/+$/, "");
  const runtime = await getAppRuntimeConfig();
  return runtime.uploadPostApiBaseUrl.replace(/\/+$/, "");
}

function sanitizeUploadPostError(status: number, body: unknown): string {
  if (typeof body === "string" && body.trim()) {
    return body.trim().slice(0, 240);
  }
  if (body && typeof body === "object") {
    const data = body as Record<string, unknown>;
    for (const key of ["detail", "message", "error", "reason"]) {
      const value = data[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim().slice(0, 240);
      }
    }
  }
  return `Upload-Post request failed with status ${status}`;
}

async function safeJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return await response.text().catch(() => "");
  }
  return await response.json().catch(() => ({}));
}

export class UploadPostClient {
  private readonly baseUrl?: string;
  private readonly timeoutMs: number;

  constructor(options: UploadPostClientOptions = {}) {
    this.baseUrl = options.baseUrl;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  private async request<T>(
    path: string,
    apiKey: string,
    init: RequestInit = {},
  ): Promise<UploadPostClientResponse<T>> {
    const resolvedBaseUrl = await normalizeBaseUrl(this.baseUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers = new Headers(init.headers);
      headers.set("Content-Type", "application/json");
      headers.set("Authorization", `Bearer ${apiKey}`);

      const response = await fetch(`${resolvedBaseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers,
      });

      const data = await safeJson(response);
      if (!response.ok) {
        throw new UploadPostClientError(sanitizeUploadPostError(response.status, data), response.status);
      }

      return { ok: true, status: response.status, data: data as T };
    } catch (error) {
      if (error instanceof UploadPostClientError) {
        throw error;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new UploadPostClientError("Upload-Post request timed out", 504);
      }
      throw new UploadPostClientError("Upload-Post request failed", null);
    } finally {
      clearTimeout(timeout);
    }
  }

  async validateConnection(apiKey: string): Promise<Record<string, unknown>> {
    const response = await this.request<Record<string, unknown>>("/api/v1/account", apiKey, {
      method: "GET",
    });
    return response.data;
  }

  async listProfiles(input: UploadPostListProfileInput): Promise<Record<string, unknown>[]> {
    const response = await this.request<{ items?: Record<string, unknown>[]; profiles?: Record<string, unknown>[] }>(
      "/api/v1/profiles",
      input.apiKey,
      {
        method: "GET",
      },
    );
    return response.data.items ?? response.data.profiles ?? [];
  }

  async createProfile(input: UploadPostCreateProfileInput): Promise<Record<string, unknown>> {
    const response = await this.request<Record<string, unknown>>("/api/v1/profiles", input.apiKey, {
      method: "POST",
      body: JSON.stringify({
        tenantId: input.tenantId,
        userId: input.userId,
        platform: input.platform,
        platformPageId: input.platformPageId,
        displayName: input.displayName ?? null,
      }),
    });
    return response.data;
  }

  async deleteProfile(apiKey: string, profileId: number): Promise<Record<string, unknown>> {
    const response = await this.request<Record<string, unknown>>(`/api/v1/profiles/${profileId}`, apiKey, {
      method: "DELETE",
    });
    return response.data;
  }

  async listPlatformPages(apiKey: string, platform?: string): Promise<Record<string, unknown>[]> {
    const query = platform ? `?platform=${encodeURIComponent(platform)}` : "";
    const response = await this.request<{ items?: Record<string, unknown>[]; pages?: Record<string, unknown>[] }>(
      `/api/v1/platform-pages${query}`,
      apiKey,
      { method: "GET" },
    );
    return response.data.items ?? response.data.pages ?? [];
  }

  async getAnalytics(apiKey: string): Promise<Record<string, unknown>> {
    const response = await this.request<Record<string, unknown>>("/api/v1/analytics", apiKey, {
      method: "GET",
    });
    return response.data;
  }

  async createJob(input: UploadPostJobRequestInput): Promise<Record<string, unknown>> {
    const response = await this.request<Record<string, unknown>>("/api/v1/jobs", input.apiKey, {
      method: "POST",
      body: JSON.stringify(input),
    });
    return response.data;
  }

  async updateJob(input: UploadPostJobRequestInput & { jobId: number }): Promise<Record<string, unknown>> {
    const response = await this.request<Record<string, unknown>>(`/api/v1/jobs/${input.jobId}`, input.apiKey, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    return response.data;
  }

  async cancelJob(apiKey: string, jobId: number): Promise<Record<string, unknown>> {
    const response = await this.request<Record<string, unknown>>(`/api/v1/jobs/${jobId}/cancel`, apiKey, {
      method: "POST",
    });
    return response.data;
  }

  async getJobStatus(apiKey: string, jobId: number): Promise<Record<string, unknown>> {
    const response = await this.request<Record<string, unknown>>(`/api/v1/jobs/${jobId}`, apiKey, {
      method: "GET",
    });
    return response.data;
  }

  async listJobs(apiKey: string): Promise<Record<string, unknown>[]> {
    const response = await this.request<{ items?: Record<string, unknown>[]; jobs?: Record<string, unknown>[] }>(
      "/api/v1/jobs",
      apiKey,
      { method: "GET" },
    );
    return response.data.items ?? response.data.jobs ?? [];
  }
}

export function createUploadPostClient(options?: UploadPostClientOptions): UploadPostClient {
  return new UploadPostClient(options);
}
import { getAppRuntimeConfig } from "./appRuntimeConfig";
