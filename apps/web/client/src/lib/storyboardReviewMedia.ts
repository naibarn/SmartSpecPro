export type StoryboardReviewMediaKind = "audio" | "video";

const AUDIO_KEYS = [
  "audio_url",
  "audioUrl",
  "audio",
  "audios",
  "audio_urls",
  "audioUrls",
];

const VIDEO_KEYS = [
  "video_url",
  "videoUrl",
  "video",
  "videos",
  "video_urls",
  "videoUrls",
];

const GENERIC_MEDIA_KEYS = [
  "source_url",
  "sourceUrl",
  "resultUrl",
  "result_url",
  "url",
  "output_url",
  "outputUrl",
  "file_url",
  "fileUrl",
  "files",
  "outputs",
  "resultUrls",
  "data",
  "response",
  "taskResult",
  "resultJson",
  "output",
];

function parseJsonString(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export function isUsableStoryboardMediaUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/api/storage/files/") ||
    trimmed.startsWith("/api/v1/media/files/") ||
    trimmed.startsWith("/uploads/") ||
    trimmed.startsWith("data:audio/") ||
    trimmed.startsWith("data:video/") ||
    trimmed.startsWith("blob:")
  );
}

export function normalizeStoryboardMediaUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const origin = typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "http://localhost";
    const parsed = new URL(trimmed, origin);
    const isRelativeInput = !/^https?:\/\//i.test(trimmed);
    if (parsed.hostname.endsWith(".r2.cloudflarestorage.com")) {
      const key = decodeURIComponent(parsed.pathname.replace(/^\/+/, "").split("/").slice(1).join("/"));
      if (key) return `/api/storage/files/${encodeURI(key)}`;
    }
    if (isRelativeInput) {
      const pathname = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
      for (const marker of ["audio/generated/", "videos/generated/"]) {
        const markerIndex = pathname.indexOf(marker);
        if (markerIndex >= 0) {
          return `/api/storage/files/${encodeURI(pathname.slice(markerIndex))}`;
        }
      }
    }
  } catch {
    // Keep the original URL if parsing fails; validation happens before use.
  }
  return trimmed;
}

function shouldSkipKeyForKind(key: string, kind: StoryboardReviewMediaKind): boolean {
  const normalized = key.toLowerCase();
  if (normalized.includes("thumbnail") || normalized.includes("poster")) return true;
  if (kind === "audio") {
    return normalized.includes("image") || normalized.includes("video");
  }
  return normalized.includes("audio") || normalized.includes("image");
}

function findMediaUrl(
  value: unknown,
  kind: StoryboardReviewMediaKind,
  visited = new WeakSet<object>(),
): string | null {
  if (isUsableStoryboardMediaUrl(value)) {
    return normalizeStoryboardMediaUrl(value);
  }
  if (typeof value === "string") {
    const parsed = parseJsonString(value);
    return parsed ? findMediaUrl(parsed, kind, visited) : null;
  }
  if (!value || typeof value !== "object") return null;
  if (visited.has(value)) return null;
  visited.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findMediaUrl(item, kind, visited);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  const preferredKeys = kind === "audio" ? AUDIO_KEYS : VIDEO_KEYS;
  for (const key of [...preferredKeys, ...GENERIC_MEDIA_KEYS]) {
    const found = findMediaUrl(record[key], kind, visited);
    if (found) return found;
  }
  for (const [key, nestedValue] of Object.entries(record)) {
    if (preferredKeys.includes(key) || GENERIC_MEDIA_KEYS.includes(key) || shouldSkipKeyForKind(key, kind)) {
      continue;
    }
    const found = findMediaUrl(nestedValue, kind, visited);
    if (found) return found;
  }
  return null;
}

export function extractStoryboardMediaUrl(
  item: unknown,
  kind: StoryboardReviewMediaKind,
): string | null {
  return findMediaUrl(item, kind);
}
