const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
];

export interface HyperframesSanitizedDiagnostics {
  message: string;
  redacted: boolean;
}

export function sanitizeHyperframesText(
  value: unknown,
  maxLength = 600
): string {
  const text = typeof value === "string" ? value : String(value ?? "");
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, " ")
    .replace(/javascript:/gi, "blocked:")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function redactHyperframesDiagnostics(value: unknown): string {
  return sanitizeHyperframesText(value, 1200)
    .replace(/https?:\/\/[^\s?]+?\?[^\s]+/gi, "[redacted-url]")
    .replace(/(sig|signature|token|key|secret|X-Amz-Signature)=\S+/gi, "$1=[redacted]")
    .replace(/\/(?:home|tmp|var|srv|app)\/[^\s]+/gi, "[redacted-path]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]");
}

export function isHyperframesSafeAssetRef(ref: string): boolean {
  const trimmed = ref.trim();
  if (!trimmed || /[\u0000-\u001F\u007F]/.test(trimmed)) return false;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  try {
    const url = new URL(trimmed);
    if (!["https:", "http:"].includes(url.protocol)) return false;
    if (url.protocol === "http:" && url.hostname !== "localhost") return false;
    if (url.hostname === "localhost") return false;
    return !PRIVATE_HOST_PATTERNS.some(pattern => pattern.test(url.hostname));
  } catch {
    return false;
  }
}

export function sanitizeHyperframesAssetRef(ref: string): string {
  if (!isHyperframesSafeAssetRef(ref)) {
    throw new Error("HyperFrames asset ref failed safety policy");
  }
  if (ref.startsWith("/")) return ref;
  const url = new URL(ref);
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function sanitizeHyperframesRecordText(
  record: Record<string, unknown>,
  maxLength = 600
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      sanitizeHyperframesText(value, maxLength),
    ])
  );
}
