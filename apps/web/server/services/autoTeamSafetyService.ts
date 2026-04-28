import crypto from "crypto";
import { assertCanonicalArtifactRef, validateArtifactRef, type AutoTeamArtifactRef } from "../../shared/autoTeamExecution";
import { isInternalUri } from "../../shared/types/mediaJobValidation";

export interface AutoTeamSafetyEvaluation {
  safe: boolean;
  status: "safe" | "needs_review" | "blocked" | "redacted" | "unknown";
  reason: string | null;
  redactedText: string | null;
}

export function redactSensitiveText(input: string): string {
  return input
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/https?:\/\/[^\s)]+/gi, "[redacted-url]")
    .replace(/\bsk-[A-Za-z0-9]{8,}\b/g, "[redacted-key]")
    .replace(/\b(?:token|access_token|api_key|apikey|client_secret|secret)=([^&\s]+)/gi, match => {
      const [key] = match.split("=");
      return `${key}=[redacted]`;
    })
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted-jwt]")
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g, "[redacted-github-token]")
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[redacted-google-key]");
}

const SENSITIVE_MEDIA_URL_PATTERN =
  /https?:\/\/[^\s"'`]+(?:X-Amz-Signature|X-Amz-Credential|X-Goog-Signature|sig=|signature=|token=|expires=)[^\s"'`]*/i;

const SENSITIVE_PROVIDER_KEYS = new Set([
  "auth",
  "authorization",
  "apiKey",
  "api_key",
  "accessToken",
  "access_token",
  "token",
  "userToken",
  "privateUrl",
  "signedUrl",
  "clientSecret",
  "client_secret",
  "secret",
]);

function sanitizeProviderValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeProviderValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const sanitized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_PROVIDER_KEYS.has(key) || SENSITIVE_PROVIDER_KEYS.has(key.toLowerCase())) {
      continue;
    }
    sanitized[key] = sanitizeProviderValue(nestedValue);
  }
  return sanitized;
}

export function sanitizeProviderPayload<T extends Record<string, unknown>>(input: T): T {
  return sanitizeProviderValue(JSON.parse(JSON.stringify(input))) as T;
}

function collectStringValues(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStringValues(item, output);
    return output;
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      collectStringValues(nested, output);
    }
  }
  return output;
}

function validatePublicOutputUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "invalid_media_url";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "unsupported_media_url_scheme";
  }
  if (isInternalUri(trimmed)) {
    return "internal_media_url_detected";
  }
  return null;
}

export function validateAutoTeamMediaOutputSafety(input: {
  routeClass: string;
  artifact?: AutoTeamArtifactRef | null;
  providerResponse?: string | null;
  metadata?: Record<string, unknown> | null;
}): AutoTeamSafetyEvaluation {
  const rawText = [input.providerResponse ?? "", JSON.stringify(input.metadata ?? {})].join(" ");
  const redactedText = redactSensitiveText(rawText);
  for (const value of collectStringValues({
    providerResponse: input.providerResponse ?? null,
    metadata: input.metadata ?? null,
  })) {
    const urlReason = validatePublicOutputUrl(value);
    if (urlReason) {
      return {
        safe: false,
        status: "blocked",
        reason: urlReason,
        redactedText,
      };
    }
  }
  if (
    SENSITIVE_MEDIA_URL_PATTERN.test(rawText) ||
    /\b(privateUrl|signedUrl)\b/i.test(rawText)
  ) {
    return {
      safe: false,
      status: "redacted",
      reason: "sensitive_media_url_detected",
      redactedText,
    };
  }
  if (/malware|exploit|credential|password|secret/i.test(rawText)) {
    return {
      safe: false,
      status: "blocked",
      reason: "unsafe_output_detected",
      redactedText,
    };
  }

  if (input.artifact) {
    if (!validateArtifactRef(input.artifact)) {
      return {
        safe: false,
        status: "blocked",
        reason: "invalid_artifact_ref",
        redactedText,
      };
    }
    try {
      assertCanonicalArtifactRef(input.artifact);
    } catch (error) {
      return {
        safe: false,
        status: "blocked",
        reason: error instanceof Error ? error.message : "artifact_validation_failed",
        redactedText,
      };
    }
  }

  return {
    safe: true,
    status: "safe",
    reason: null,
    redactedText,
  };
}

export function buildSafetyHash(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}
