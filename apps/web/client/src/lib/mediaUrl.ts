const ABSOLUTE_MEDIA_URL_PATTERN = /^(?:https?:\/\/|data:|blob:|\/)/i;

function normalizeCloudflareR2ObjectUrl(source: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    return null;
  }

  if (!parsed.hostname.endsWith(".r2.cloudflarestorage.com")) {
    return null;
  }

  const pathParts = parsed.pathname
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  if (pathParts.length < 2) {
    return null;
  }

  // R2 path-style URLs are /bucket/key. The storage proxy expects only key.
  const key = pathParts.slice(1).join("/");
  return key ? `/api/storage/files/${encodeURI(key)}` : null;
}

/**
 * Normalizes stored media sources into browser-renderable URLs.
 * Accepts absolute URLs, data/blob URLs, and root-relative paths as-is.
 * Bare storage keys are converted to the storage proxy route.
 */
export function normalizeMediaSourceUrl(source: string | null | undefined): string {
  const trimmed = String(source ?? "").trim();
  if (!trimmed) {
    return "";
  }
  if (/^https?:\/\//i.test(trimmed)) {
    const proxiedR2Url = normalizeCloudflareR2ObjectUrl(trimmed);
    if (proxiedR2Url) {
      return proxiedR2Url;
    }
  }
  if (ABSOLUTE_MEDIA_URL_PATTERN.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("api/storage/files/")) {
    return `/${trimmed}`;
  }
  if (trimmed.startsWith("uploads/")) {
    return `/${trimmed}`;
  }

  const key = trimmed.replace(/^\/+/, "");
  return `/api/storage/files/${encodeURI(key)}`;
}
