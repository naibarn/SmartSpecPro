export const PROTECTED_MEDIA_CACHE_CONTROL =
  "private, max-age=60, must-revalidate";

// The response is intentionally private: the URL is stable for browser cache
// reuse, but authorization still depends on the current session/bearer token.
export const PROTECTED_MEDIA_VARY = "Cookie, Authorization";

export interface ProtectedMediaCacheMetadata {
  etag?: string;
  contentLength?: number;
  totalLength?: number;
  lastModified?: Date;
}

export function getProtectedMediaEtag(
  metadata: ProtectedMediaCacheMetadata
): string {
  const existing = metadata.etag?.trim();
  if (existing) return existing;

  const size = metadata.contentLength ?? metadata.totalLength ?? 0;
  const modifiedAt = metadata.lastModified?.getTime() ?? 0;
  return `W/"${size}-${modifiedAt}"`;
}

/**
 * `If-None-Match` uses weak comparison for GET/HEAD requests. Strip the weak
 * marker before comparing so a storage provider's strong ETag still matches a
 * browser's weak validator (and vice versa).
 */
export function matchesIfNoneMatch(
  header: string | undefined,
  currentEtag: string
): boolean {
  if (!header) return false;
  const normalize = (value: string) => value.trim().replace(/^W\//i, "");
  const normalizedCurrent = normalize(currentEtag);
  return header
    .split(",")
    .some(
      value => value.trim() === "*" || normalize(value) === normalizedCurrent
    );
}
