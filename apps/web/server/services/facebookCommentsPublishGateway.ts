import { getAppRuntimeConfig, getPreferredInternalToken } from "./appRuntimeConfig";
import { fetchWithResilience } from "../_core/fetchWithResilience";

export async function publishFacebookPageComment(input: {
  pageId: string;
  objectId: string;
  accessToken: string;
  message: string;
}): Promise<{ providerCommentId: string | null }> {
  if (!/^\d+$/.test(input.pageId) || !/^\d+(?:_\d+)?$/.test(input.objectId) || !input.message.trim() || input.message.length > 2000) {
    throw new Error("FACEBOOK_COMMENT_INPUT_INVALID");
  }
  const runtime = await getAppRuntimeConfig();
  const internalToken = await getPreferredInternalToken();
  const response = await fetchWithResilience(`${runtime.pythonBackendUrl}/api/internal/meta/comments/publish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(internalToken ? { "x-internal-token": internalToken } : {}),
    },
    body: JSON.stringify({
      page_id: input.pageId,
      object_id: input.objectId,
      page_access_token: input.accessToken,
      message: input.message,
    }),
    timeoutMs: 30_000,
    retryPolicy: "off",
    label: "social:facebook-comment:publish",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload && typeof payload === "object" ? (payload as Record<string, unknown>).detail : null;
    if (detail === "META_TOKEN_INVALID" || detail === "META_PERMISSION_MISSING") throw new Error(detail);
    throw new Error("FACEBOOK_COMMENT_OUTCOME_UNCERTAIN");
  }
  const providerCommentId = payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).provider_comment_id === "string"
    ? String((payload as Record<string, unknown>).provider_comment_id)
    : null;
  return { providerCommentId };
}
