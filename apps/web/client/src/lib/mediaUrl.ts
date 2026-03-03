const ABSOLUTE_MEDIA_URL_PATTERN = /^(?:https?:\/\/|data:|blob:|\/)/i;

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
