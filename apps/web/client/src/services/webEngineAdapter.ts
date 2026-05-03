import type { IEngineAdapter } from "./mediaJobClient";
import type {
  MediaJobSpec,
  MediaJobProgress,
} from "@shared/types/mediaJob";

export class MediaJobRateLimitError extends Error {
  retryAfterMs: number;

  constructor(retryAfterMs: number = 5_000) {
    super("Get status rate limited");
    this.name = "MediaJobRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export class WebEngineAdapter implements IEngineAdapter {
  private baseUrl: string;

  constructor(baseUrl: string = "") {
    this.baseUrl = baseUrl;
  }

  async submitJob(spec: MediaJobSpec): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/media-jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(spec),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || err.message || `Submit failed: ${res.status}`);
    }

    const data = await res.json();
    return data.jobId;
  }

  async getStatus(jobId: string): Promise<MediaJobProgress> {
    const res = await fetch(
      `${this.baseUrl}/api/media-jobs/${encodeURIComponent(jobId)}`,
      { credentials: "include" },
    );

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`Job not found: ${jobId}`);
      }
      if (res.status === 429) {
        const retryAfterSeconds = Number(res.headers?.get?.("Retry-After") || "");
        throw new MediaJobRateLimitError(
          Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
            ? retryAfterSeconds * 1000
            : 5_000,
        );
      }
      throw new Error(`Get status failed: ${res.status}`);
    }

    return res.json();
  }

  async cancelJob(jobId: string): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/api/media-jobs/${encodeURIComponent(jobId)}`,
      { method: "DELETE", credentials: "include" },
    );

    if (!res.ok) {
      throw new Error(`Cancel failed: ${res.status}`);
    }
  }

  onProgress(
    jobId: string,
    callback: (progress: MediaJobProgress) => void,
  ): () => void {
    const url = `${this.baseUrl}/api/media-jobs/${encodeURIComponent(jobId)}/events`;
    const eventSource = new EventSource(url, { withCredentials: true });

    eventSource.addEventListener("progress", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as MediaJobProgress;
        callback(data);
      } catch {
        // Ignore parse errors on SSE data
      }
    });

    eventSource.addEventListener("done", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as MediaJobProgress;
        callback(data);
      } catch {
        // Ignore
      }
      eventSource.close();
    });

    eventSource.addEventListener("error", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as MediaJobProgress;
        callback(data);
      } catch {
        // Ignore
      }
      eventSource.close();
    });

    return () => {
      eventSource.close();
    };
  }
}
