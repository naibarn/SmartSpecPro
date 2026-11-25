import { getAppRuntimeConfig, getPreferredInternalToken } from "./appRuntimeConfig";
import { fetchWithResilience } from "../_core/fetchWithResilience";

const PYTHON_TIMEOUT_MS = 60_000;
const REELS_API = "/api/internal/social/reels";

async function callReelsJson(
  operation: "start" | "status" | "finish",
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const runtime = await getAppRuntimeConfig();
  const internalToken = await getPreferredInternalToken();
  const response = await fetchWithResilience(
    `${runtime.pythonBackendUrl}${REELS_API}/${operation}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(internalToken ? { "x-internal-token": internalToken } : {}),
      },
      body: JSON.stringify(payload),
      timeoutMs: PYTHON_TIMEOUT_MS,
      retryPolicy: "off",
      label: `social:facebook-reels:${operation}`,
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body && typeof body === "object" ? (body as Record<string, unknown>).detail : null;
    if (detail === "META_TOKEN_INVALID" || detail === "META_PERMISSION_MISSING") throw new Error(detail);
    throw new Error(`FACEBOOK_REELS_${operation.toUpperCase()}_UNCONFIRMED`);
  }
  return body && typeof body === "object" ? body as Record<string, unknown> : {};
}

export async function startFacebookReelUpload(input: {
  pageId: string;
  accessToken: string;
}) {
  return callReelsJson("start", {
    page_id: input.pageId,
    access_token: input.accessToken,
  });
}

export async function getFacebookReelStatus(input: {
  pageId: string;
  videoId: string;
  accessToken: string;
}) {
  return callReelsJson("status", {
    page_id: input.pageId,
    video_id: input.videoId,
    access_token: input.accessToken,
  });
}

export async function finishFacebookReelUpload(input: {
  pageId: string;
  videoId: string;
  accessToken: string;
  description: string;
  isAiGenerated: boolean;
}) {
  return callReelsJson("finish", {
    page_id: input.pageId,
    video_id: input.videoId,
    access_token: input.accessToken,
    description: input.description,
    is_ai_generated: input.isAiGenerated,
  });
}

export async function uploadFacebookReelBinary(input: {
  videoId: string;
  accessToken: string;
  uploadUrl: string;
  fileSize: number;
  offset: number;
  body: ReadableStream<Uint8Array>;
}) {
  const runtime = await getAppRuntimeConfig();
  const internalToken = await getPreferredInternalToken();
  const contentLength = input.fileSize - input.offset;
  if (
    !Number.isSafeInteger(input.fileSize) || input.fileSize <= 0 ||
    !Number.isSafeInteger(input.offset) || input.offset < 0 || input.offset >= input.fileSize ||
    contentLength <= 0 || contentLength > 1024 * 1024 * 1024
  ) {
    throw new Error("FACEBOOK_REELS_UPLOAD_RANGE_INVALID");
  }
  const response = await fetchWithResilience(
    `${runtime.pythonBackendUrl}${REELS_API}/upload`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(contentLength),
        "x-meta-access-token": input.accessToken,
        "x-meta-video-id": input.videoId,
        "x-meta-upload-url": input.uploadUrl,
        "x-meta-file-size": String(input.fileSize),
        "x-meta-offset": String(input.offset),
        ...(internalToken ? { "x-internal-token": internalToken } : {}),
      },
      body: input.body,
      // Node's fetch requires duplex for a streamed request body.
      duplex: "half",
      redirect: "error",
      timeoutMs: PYTHON_TIMEOUT_MS,
      retryPolicy: "off",
      label: "social:facebook-reels:upload",
    } as RequestInit,
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body && typeof body === "object" ? (body as Record<string, unknown>).detail : null;
    if (detail === "META_TOKEN_INVALID" || detail === "META_PERMISSION_MISSING") throw new Error(detail);
    throw new Error("FACEBOOK_REELS_UPLOAD_UNCONFIRMED");
  }
  return body && typeof body === "object" ? body as Record<string, unknown> : {};
}
