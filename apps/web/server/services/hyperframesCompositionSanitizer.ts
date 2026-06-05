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
    .replace(/\b(authorization|auth)\s*[:=]\s*(?:bearer|basic)\s+[^\s]+/gi, "$1=[redacted]")
    .replace(/\b(?:bearer|basic)\s+[A-Za-z0-9._~+/-]+=*/gi, "[redacted-auth]")
    .replace(/https?:\/\/[^\s/@:]+:[^\s/@]+@[^\s]+/gi, "[redacted-url]")
    .replace(/https?:\/\/[^\s?]+?\?[^\s]+/gi, "[redacted-url]")
    .replace(
      /\b(awsaccesskeyid|sig|signature|token|key|secret|password|passwd|pwd|session|jwt|policy|authorization|auth|bearer|credential|expires?|access[_-]?(?:key|token)|refresh[_-]?token|id[_-]?token|X-Amz-Signature|X-Amz-Credential)=\S+/gi,
      "$1=[redacted]"
    )
    .replace(/\bmarketplace-auto-review\/[^\s]+/gi, "[redacted-storage-ref]")
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
