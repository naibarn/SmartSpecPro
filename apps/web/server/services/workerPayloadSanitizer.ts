const REDACTED_WORKER_KEYS = new Set([
  "authorization",
  "apikey",
  "token",
  "secret",
  "password",
  "cookie",
  "sessiontoken",
  "accesstoken",
  "refreshtoken",
  "clientsecret",
  "privatekey",
  "credentials",
]);

const MAX_SANITIZED_WORKER_STRING_LENGTH = 2_000;
const MAX_SANITIZED_WORKER_COLLECTION_LENGTH = 50;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSensitiveWorkerKey(key: string): string {
  return key.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function shouldRedactWorkerKey(key: string): boolean {
  const normalizedKey = normalizeSensitiveWorkerKey(key);
  if (!normalizedKey) {
    return false;
  }

  return REDACTED_WORKER_KEYS.has(normalizedKey)
    || normalizedKey.endsWith("token")
    || normalizedKey.endsWith("secret")
    || normalizedKey.endsWith("apikey")
    || normalizedKey.endsWith("password")
    || normalizedKey.endsWith("cookie")
    || normalizedKey.endsWith("credentials")
    || normalizedKey.includes("authorization");
}

export function sanitizeWorkerPayload(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    return value.length > MAX_SANITIZED_WORKER_STRING_LENGTH
      ? `${value.slice(0, MAX_SANITIZED_WORKER_STRING_LENGTH)}...[truncated]`
      : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (depth >= 5) {
    return "[truncated]";
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_SANITIZED_WORKER_COLLECTION_LENGTH)
      .map((entry) => sanitizeWorkerPayload(entry, depth + 1));
  }
  if (!isPlainObject(value)) {
    return String(value);
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_SANITIZED_WORKER_COLLECTION_LENGTH)
      .map(([key, entry]) => [
        key,
        shouldRedactWorkerKey(key)
          ? "[REDACTED]"
          : sanitizeWorkerPayload(entry, depth + 1),
      ]),
  );
}

export function sanitizeWorkerWarningFlags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .slice(0, MAX_SANITIZED_WORKER_COLLECTION_LENGTH)
    .map((entry) => entry.trim().slice(0, 255));
}
