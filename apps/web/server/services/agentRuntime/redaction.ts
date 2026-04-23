const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|set-cookie|token|api[-_]?key|secret|signature|credential|password|refresh[_-]?token|session[_-]?token)/i;

const JWT_PATTERN =
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\b/;

const PROVIDER_KEY_PATTERN =
  /\b(?:sk|rk|pk|org)-[A-Za-z0-9_-]{8,}\b/;

const SIGNED_URL_PATTERN =
  /https?:\/\/[^\s"'`]+(?:X-Amz-Signature|X-Goog-Signature|sig=|signature=|token=)[^\s"'`]*/i;

const COOKIE_VALUE_PATTERN =
  /(?:^|;\s*)(?:__Secure-|__Host-|[A-Za-z0-9_.-]+)=/;

const LARGE_DOCUMENT_FRAGMENT_THRESHOLD = 1200;
const LARGE_DOCUMENT_LINE_THRESHOLD = 12;

function redactStringValue(
  value: string,
  key: string | null,
): string {
  if (!value.trim()) return value;

  if (SENSITIVE_KEY_PATTERN.test(key ?? "")) {
    return "[REDACTED]";
  }

  if (SIGNED_URL_PATTERN.test(value)) {
    return "[REDACTED_SIGNED_URL]";
  }

  if (JWT_PATTERN.test(value)) {
    return value.replace(JWT_PATTERN, "[REDACTED_JWT]");
  }

  if (/Bearer\s+\S+/i.test(value)) {
    return value.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
  }

  if (PROVIDER_KEY_PATTERN.test(value)) {
    return value.replace(PROVIDER_KEY_PATTERN, "[REDACTED_KEY]");
  }

  if (/refresh_token\s*[=:]\s*\S+/i.test(value)) {
    return value.replace(/(refresh_token\s*[=:]\s*)\S+/gi, "$1[REDACTED]");
  }

  if (COOKIE_VALUE_PATTERN.test(value) && /cookie/i.test(key ?? "cookie")) {
    return "[REDACTED_COOKIE]";
  }

  const lineCount = value.split(/\r?\n/).length;
  if (
    value.length >= LARGE_DOCUMENT_FRAGMENT_THRESHOLD ||
    lineCount >= LARGE_DOCUMENT_LINE_THRESHOLD
  ) {
    return `[TRUNCATED_DOCUMENT_FRAGMENT length=${value.length}]`;
  }

  return value;
}

function redactRuntimeValue(
  value: unknown,
  key: string | null = null,
): unknown {
  if (Array.isArray(value)) {
    return value.map(item => redactRuntimeValue(item, key));
  }

  if (typeof value === "string") {
    return redactStringValue(value, key);
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [entryKey, nestedValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (SENSITIVE_KEY_PATTERN.test(entryKey)) {
        output[entryKey] = "[REDACTED]";
      } else {
        output[entryKey] = redactRuntimeValue(nestedValue, entryKey);
      }
    }
    return output;
  }

  return value;
}

export function redactRuntimeMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  return redactRuntimeValue(metadata) as Record<string, unknown>;
}
