import { getAppRuntimeConfig, getPreferredInternalToken } from "./appRuntimeConfig";
import { fetchWithResilience } from "../_core/fetchWithResilience";

const PHOTO_API = "/api/internal/social/photos";
const PHOTO_TIMEOUT_MS = 90_000;

async function decodeResponse(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body && typeof body === "object" ? (body as Record<string, unknown>).detail : null;
    if (detail === "META_TOKEN_INVALID" || detail === "META_PERMISSION_MISSING") throw new Error(detail);
    throw new Error("FACEBOOK_PHOTO_OPERATION_UNCONFIRMED");
  }
  return body && typeof body === "object" ? body as Record<string, unknown> : {};
}

export async function publishFacebookPagePhoto(input: {
  pageId: string;
  accessToken: string;
  caption: string;
  filename: string;
  contentType: "image/png";
  fileSize: number;
  body: Uint8Array;
}): Promise<Record<string, unknown>> {
  if (!/^\d+$/.test(input.pageId) || input.body.byteLength !== input.fileSize || input.fileSize <= 0 || input.fileSize > 10 * 1024 * 1024) {
    throw new Error("FACEBOOK_PHOTO_UPLOAD_RANGE_INVALID");
  }
  const runtime = await getAppRuntimeConfig();
  const internalToken = await getPreferredInternalToken();
  const response = await fetchWithResilience(
    `${runtime.pythonBackendUrl}${PHOTO_API}/publish`,
    {
      method: "POST",
      headers: {
        "Content-Type": input.contentType,
        "Content-Length": String(input.fileSize),
        "x-meta-access-token": input.accessToken,
        "x-meta-page-id": input.pageId,
        "x-meta-file-name": input.filename,
        "x-meta-content-type": input.contentType,
        "x-meta-file-size": String(input.fileSize),
        "x-meta-caption-base64": Buffer.from(input.caption, "utf8").toString("base64"),
        ...(internalToken ? { "x-internal-token": internalToken } : {}),
      },
      body: input.body as BodyInit,
      redirect: "error",
      timeoutMs: PHOTO_TIMEOUT_MS,
      retryPolicy: "off",
      label: "social:facebook-photo:publish",
    },
  );
  return decodeResponse(response);
}

export async function readFacebookPagePhoto(input: {
  pageId: string;
  photoId: string;
  accessToken: string;
}): Promise<Record<string, unknown>> {
  if (!/^\d+$/.test(input.pageId) || !/^\d+$/.test(input.photoId)) throw new Error("FACEBOOK_PHOTO_ID_INVALID");
  const runtime = await getAppRuntimeConfig();
  const internalToken = await getPreferredInternalToken();
  const response = await fetchWithResilience(
    `${runtime.pythonBackendUrl}${PHOTO_API}/status`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(internalToken ? { "x-internal-token": internalToken } : {}),
      },
      body: JSON.stringify({ page_id: input.pageId, photo_id: input.photoId, access_token: input.accessToken }),
      timeoutMs: 30_000,
      retryPolicy: "off",
      label: "social:facebook-photo:status",
    },
  );
  return decodeResponse(response);
}
