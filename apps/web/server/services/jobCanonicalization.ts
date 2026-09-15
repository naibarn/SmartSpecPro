import { createHash } from "node:crypto";

import {
  JobControlPlaneError,
  type JobDefinition,
  type JobDefinitionHash,
} from "./jobControlPlaneTypes";

const MAX_INPUT_DEPTH = 12;
const MAX_INPUT_KEYS = 500;
const MAX_STRING_LENGTH = 24_000;
const MAX_SERIALIZED_PAYLOAD_BYTES = 1_048_576;
const SECRET_KEY = /(authorization|api[_-]?key|credential|password|secret|token|private[_-]?key|signed[_-]?url)/i;
const EXECUTION_CLASSES = new Set(["short", "long", "external", "cpu", "gpu", "scheduled"]);

function assertSafeValue(value: unknown, depth: number, seenKeys: { count: number }, ancestors = new WeakSet<object>()): void {
  if (depth > MAX_INPUT_DEPTH) {
    throw new JobControlPlaneError("JOB_DEFINITION_INVALID", "Job definition nesting is too deep");
  }
  if (typeof value === "string") {
    if (value.length > MAX_STRING_LENGTH) {
      throw new JobControlPlaneError("JOB_DEFINITION_INVALID", "Job definition contains an oversized string");
    }
    return;
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") return;
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new JobControlPlaneError("JOB_DEFINITION_INVALID", "Job definition contains a circular value");
    }
    ancestors.add(value);
    value.forEach(item => assertSafeValue(item, depth + 1, seenKeys, ancestors));
    ancestors.delete(value);
    return;
  }
  if (typeof value !== "object") {
    throw new JobControlPlaneError("JOB_DEFINITION_INVALID", "Job definition contains an unsupported value");
  }
  const objectValue = value as object;
  if (ancestors.has(objectValue)) {
    throw new JobControlPlaneError("JOB_DEFINITION_INVALID", "Job definition contains a circular value");
  }
  ancestors.add(objectValue);
  try {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      seenKeys.count += 1;
      if (seenKeys.count > MAX_INPUT_KEYS) {
        throw new JobControlPlaneError("JOB_DEFINITION_INVALID", "Job definition contains too many keys");
      }
      assertSafeValue(key, depth + 1, seenKeys, ancestors);
      assertSafeValue(child, depth + 1, seenKeys, ancestors);
    }
  } finally {
    ancestors.delete(objectValue);
  }
}

function normalizeForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForHash);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, child]) => [key.normalize("NFC"), child] as const)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, child]) => [key, normalizeForHash(child)]),
    );
  }
  if (typeof value === "string") return value.normalize("NFC");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new JobControlPlaneError("JOB_DEFINITION_INVALID", "Job definition contains a non-finite number");
    }
    return Object.is(value, -0) ? 0 : value;
  }
  return value;
}

function hashInput(definition: JobDefinition): Record<string, unknown> {
  return {
    tenantId: definition.tenantId,
    contractVersion: definition.contractVersion,
    jobType: definition.jobType,
    executionClass: definition.executionClass,
    priority: definition.priority ?? 0,
    input: definition.input,
    schedule: definition.schedule ?? null,
    retryPolicy: definition.retryPolicy,
    timeoutPolicy: definition.timeoutPolicy,
    requiredCapabilities: definition.requiredCapabilities ?? {},
  };
}

export function validateJobDefinition(definition: JobDefinition): void {
  if (!definition || typeof definition !== "object") {
    throw new JobControlPlaneError("JOB_DEFINITION_INVALID", "Job definition is required");
  }
  if (!definition.tenantId || definition.tenantId.length > 36 || !definition.contractVersion || definition.contractVersion.length > 40 || !definition.jobType || definition.jobType.length > 100) {
    throw new JobControlPlaneError("JOB_DEFINITION_INVALID", "Job definition identity is incomplete");
  }
  if (!EXECUTION_CLASSES.has(definition.executionClass)) {
    throw new JobControlPlaneError("JOB_DEFINITION_INVALID", "Unsupported execution class");
  }
  if (!definition.input || typeof definition.input !== "object" || Array.isArray(definition.input)) {
    throw new JobControlPlaneError("JOB_DEFINITION_INVALID", "input must be a JSON object");
  }
  if (definition.requiredCapabilities !== undefined && (!definition.requiredCapabilities || typeof definition.requiredCapabilities !== "object" || Array.isArray(definition.requiredCapabilities))) {
    throw new JobControlPlaneError("JOB_DEFINITION_INVALID", "requiredCapabilities must be a JSON object");
  }
  if (definition.requestedByUserId !== undefined && (!Number.isSafeInteger(definition.requestedByUserId) || definition.requestedByUserId <= 0)) {
    throw new JobControlPlaneError("JOB_DEFINITION_INVALID", "requestedByUserId must be a positive integer");
  }
  if (!Number.isInteger(definition.priority ?? 0)) {
    throw new JobControlPlaneError("JOB_DEFINITION_INVALID", "priority must be an integer");
  }
  const retry = definition.retryPolicy;
  if (!retry || !Number.isSafeInteger(retry.maxAttempts) || retry.maxAttempts < 1 || retry.maxAttempts > 100 || !Number.isFinite(retry.baseDelayMs) || retry.baseDelayMs < 0 || !Number.isFinite(retry.maxDelayMs) || retry.maxDelayMs < retry.baseDelayMs || !Number.isFinite(retry.deadlineMs) || retry.deadlineMs <= 0 || !["none", "bounded", "recorded"].includes(retry.jitter) || !Array.isArray(retry.allowedErrorClasses) || retry.allowedErrorClasses.some(item => typeof item !== "string" || item.length > 100)) {
    throw new JobControlPlaneError("RETRY_POLICY_INVALID", "Retry policy is invalid");
  }
  const timeout = definition.timeoutPolicy;
  if (!timeout || !Number.isFinite(timeout.softTimeoutMs) || timeout.softTimeoutMs < 0 || !Number.isFinite(timeout.hardTimeoutMs) || timeout.hardTimeoutMs <= 0 || timeout.softTimeoutMs > timeout.hardTimeoutMs) {
    throw new JobControlPlaneError("TIMEOUT_POLICY_INVALID", "Timeout policy is invalid");
  }
  if (definition.schedule) {
    const schedule = definition.schedule;
    if (!schedule.scheduleId || schedule.scheduleId.length > 160 || !schedule.occurrenceKey || schedule.occurrenceKey.length > 200 || !schedule.scheduleVersion || schedule.scheduleVersion.length > 80 || !schedule.timezone || schedule.timezone.length > 80 || !schedule.missedOccurrencePolicy) {
      throw new JobControlPlaneError("SCHEDULE_DEFINITION_INVALID", "Scheduled jobs require a complete schedule definition");
    }
    if (!["skip", "coalesce", "catch_up"].includes(schedule.missedOccurrencePolicy)) {
      throw new JobControlPlaneError("SCHEDULE_DEFINITION_INVALID", "Unsupported missed-occurrence policy");
    }
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: schedule.timezone }).format();
    } catch {
      throw new JobControlPlaneError("SCHEDULE_DEFINITION_INVALID", "Schedule timezone is invalid");
    }
  }
  const seenKeys = { count: 0 };
  assertSafeValue(hashInput(definition), 0, seenKeys);
  const serializedDefinition = JSON.stringify(normalizeForHash(hashInput(definition)));
  if (typeof serializedDefinition !== "string" || Buffer.byteLength(serializedDefinition, "utf8") > MAX_SERIALIZED_PAYLOAD_BYTES) {
    throw new JobControlPlaneError("JOB_DEFINITION_INVALID", "Job definition payload is too large");
  }
  if (definition.idempotencyKey !== undefined && (
    typeof definition.idempotencyKey !== "string"
    || !definition.idempotencyKey.trim().normalize("NFC")
    || definition.idempotencyKey.trim().normalize("NFC").length > 128
  )) {
    throw new JobControlPlaneError("JOB_DEFINITION_INVALID", "idempotencyKey is empty or too long");
  }
}

/** Tenant-scoped idempotency keys use trim + NFC normalization before storage/lookup. */
export function normalizeIdempotencyKey(value: string): string {
  if (typeof value !== "string") {
    throw new JobControlPlaneError("JOB_DEFINITION_INVALID", "idempotencyKey must be a string");
  }
  const normalized = value.trim().normalize("NFC");
  if (!normalized || normalized.length > 128) throw new JobControlPlaneError("JOB_DEFINITION_INVALID", "idempotencyKey is empty or too long");
  return normalized;
}

export function canonicalizeJobDefinition(definition: JobDefinition): string {
  validateJobDefinition(definition);
  return JSON.stringify(normalizeForHash(hashInput(definition)));
}

export function validateBoundedPayload(value: unknown, label = "payload"): void {
  const seenKeys = { count: 0 };
  try {
    assertSafeValue(value, 0, seenKeys);
    const serialized = JSON.stringify(value);
    if (typeof serialized !== "string" || Buffer.byteLength(serialized, "utf8") > MAX_SERIALIZED_PAYLOAD_BYTES) {
      throw new JobControlPlaneError("JOB_PAYLOAD_INVALID", `${label}: payload is too large`);
    }
  } catch (error) {
    if (error instanceof JobControlPlaneError) throw new JobControlPlaneError("JOB_PAYLOAD_INVALID", `${label}: ${error.message}`);
    throw error;
  }
}

export function computeJobDefinitionHash(definition: JobDefinition): JobDefinitionHash {
  return createHash("sha256").update(canonicalizeJobDefinition(definition), "utf8").digest("hex");
}

export function redactJobPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactJobPayload);
  if (typeof value === "string") {
    if (/^data:/i.test(value)) return "[REDACTED_DATA_URL]";
    try {
      const url = new URL(value);
      const protectedPath = /\/(?:api\/)?(?:storage\/files|mcp\/downloads|uploads)\//i.test(url.pathname);
      if (url.search || url.hash || protectedPath) {
        return `${url.origin}${protectedPath ? "/[REDACTED_PATH]" : url.pathname}`;
      }
    } catch {
      // Non-URL strings are safe to preserve unless their key is secret-like.
    }
    return value;
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      SECRET_KEY.test(key) ? "[REDACTED]" : redactJobPayload(child),
    ]),
  );
}
