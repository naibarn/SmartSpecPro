const PY_TIMEOUT_MS = 30_000;

export interface SocialPublishGatewayRequest {
  provider: string;
  pageId: string;
  accessToken: string;
  message?: string | null;
  link?: string | null;
  mediaUrls?: string[] | null;
  title?: string | null;
  description?: string | null;
  tags?: string[] | null;
  privacyStatus?: string | null;
  scheduledPublishTime?: number | null;
  publishAt?: string | null;
  videoMetadata?: {
    width?: number | null;
    height?: number | null;
    durationSeconds?: number | null;
  } | null;
}

function getPythonBackendUrl(): string {
  return (process.env.PYTHON_BACKEND_URL || "http://localhost:8000").replace(/\/+$/, "");
}

function getInternalToken(): string {
  return process.env.SMARTSPEC_WEB_GATEWAY_TOKEN || process.env.SMARTSPEC_PROXY_TOKEN || "";
}

export async function publishSocialContentViaPythonBackend(
  payload: SocialPublishGatewayRequest,
  timeoutMs: number = PY_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(`${getPythonBackendUrl()}/api/internal/social/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(getInternalToken() ? { "x-internal-token": getInternalToken() } : {}),
      },
      body: JSON.stringify({
        provider: payload.provider,
        page_id: payload.pageId,
        access_token: payload.accessToken,
        message: payload.message ?? undefined,
        link: payload.link ?? undefined,
        media_urls: payload.mediaUrls ?? [],
        title: payload.title ?? undefined,
        description: payload.description ?? undefined,
        tags: payload.tags ?? [],
        privacy_status: payload.privacyStatus ?? undefined,
        scheduled_publish_time: payload.scheduledPublishTime ?? undefined,
        publish_at: payload.publishAt ?? undefined,
        video_metadata: payload.videoMetadata ?? undefined,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function readPythonBackendError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") return data.detail;
    if (typeof data?.message === "string") return data.message;
    return JSON.stringify(data);
  } catch {
    return res.statusText || "Python backend request failed";
  }
}
