/**
 * Shared media serialization constants and helpers for Tiptap media extensions.
 * Single source of truth for whitelisted data-* attributes and URL sanitization.
 */

/** Whitelisted data-* attribute names allowed on media nodes. */
export const MEDIA_DATA_ATTRS = [
  "data-poster",
  "data-caption",
  "data-asset-id",
  "data-alignment",
] as const;

/**
 * Reads a data-* attribute from an HTML element, returning null if missing.
 */
export function parseDataAttr(
  element: HTMLElement,
  attr: string,
): string | null {
  // Strip "data-" prefix for dataset access
  const key = attr.replace(/^data-/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  return element.dataset[key] ?? null;
}

// Protocols explicitly blocked (case-insensitive check)
const BLOCKED_PROTOCOLS = [
  "javascript:",
  "vbscript:",
  "data:text/html",
  "data:application",
  "data:image/svg+xml",
  "blob:",
  "file:",
];

/**
 * Validates a media URL. SECURITY-CRITICAL.
 * Returns empty string for rejected URLs.
 * Allows only: https://, http://, relative paths starting with /
 *
 * Decodes percent-encoded characters before checking the blocklist
 * to prevent bypass via e.g. "java%73cript:alert(1)".
 */
export function sanitizeMediaSrc(src: string): string {
  if (!src || typeof src !== "string") return "";
  const trimmed = src.trim();
  if (!trimmed) return "";

  // Decode percent-encoded characters to catch bypass attempts
  // like "java%73cript:" or "%6Aavascript:". Wrap in try/catch
  // because decodeURIComponent throws on malformed sequences (e.g. "%ZZ").
  let decoded: string;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    // Malformed percent-encoding — reject as suspicious
    return "";
  }

  // Strip null bytes and whitespace that can bypass protocol checks
  const cleaned = decoded.replace(/[\x00-\x1f\x7f]/g, "").trim();
  const lower = cleaned.toLowerCase();

  for (const proto of BLOCKED_PROTOCOLS) {
    if (lower.startsWith(proto)) return "";
  }

  // Allow https://, http://, and relative paths starting with /
  if (
    lower.startsWith("https://") ||
    lower.startsWith("http://") ||
    cleaned.startsWith("/")
  ) {
    return trimmed;
  }

  // Reject anything else (e.g., bare "data:", unknown protocols)
  return "";
}

/**
 * Filters out null/undefined values from an attribute map.
 * Returns only entries that have string values.
 */
export function buildDataAttrs(
  attrs: Record<string, string | null | undefined>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (value != null && value !== "") {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Validates a link href URL. SECURITY-CRITICAL.
 * Uses the same decode-then-check approach as sanitizeMediaSrc
 * but also allows mailto: and tel: for anchor links.
 * Returns true if the URL is safe for use in <a href>.
 */
export function isAllowedLinkUri(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  let decoded: string;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return false;
  }

  const cleaned = decoded.replace(/[\x00-\x1f\x7f]/g, "").trim();
  const lower = cleaned.toLowerCase();

  for (const proto of BLOCKED_PROTOCOLS) {
    if (lower.startsWith(proto)) return false;
  }

  // Allow standard link protocols + relative paths
  if (
    lower.startsWith("https://") ||
    lower.startsWith("http://") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("tel:") ||
    cleaned.startsWith("/") ||
    cleaned.startsWith("#") ||
    cleaned.startsWith("./") ||
    cleaned.startsWith("../")
  ) {
    return true;
  }

  return false;
}

/**
 * Escapes a string for safe use in HTML attribute values.
 * Prevents stored XSS via crafted captions/titles.
 */
export function escapeAttr(val: string): string {
  return val
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
