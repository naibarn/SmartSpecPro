import { createHash } from "node:crypto";

import {
  JobControlPlaneError,
  type JobDefinition,
  type JobDefinitionHash,
} from "./jobControlPlaneTypes";

const MAX_INPUT_DEPTH = 12;
const MAX_INPUT_KEYS = 500;
const MAX_STRING_LENGTH = 24_000;
const SECRET_KEY = /(authorization|api[_-]?key|credential|password|secret|token|private[_-]?key|signed[_-]?url)/i;
const EXECUTION_CLASSES = new Set(["short", "long", "external", "cpu", "gpu", "scheduled"]);

function assertSafeValue(value: unknown, depth: number, seenKeys: { count: number }): void {
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
    value.forEach(item => assertSafeValue(item, depth + 1, seenKeys));
    return;
  }
  if (typeof value !== "object") {
    throw new JobControlPlaneError("JOB_DEFINITION_INVALID", "Job definition contains an unsupported value");
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    seenKeys.count += 1;
    if (seenKeys.count > MAX_INPUT_KEYS) {
      throw new JobControlPlaneError("JOB_DEFINITION_INVALID", "Job definition contains too many keys");
    }
    assertSafeValue(key, depth + 1, seenKeys);
    assertSafeValue(child, depth + 1, seenKeys);
  }
}

function normalizeForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForHash);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, child]) => [key.normalize("NFC"), normalizeForHash(child)]),
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
  const seenKeys = { count: 0 };
  assertSafeValue(hashInput(definition), 0, seenKeys);
  if (definition.idempotencyKey && definition.idempotencyKey.length > 128) {
    throw new JobControlPlaneError("JOB_DEFINITION_INVALID", "idempotencyKey is too long");
  }
}

/** Tenant-scoped idempotency keys use trim + NFC normalization before storage/lookup. */
export function normalizeIdempotencyKey(value: string): string {
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
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      SECRET_KEY.test(key) ? "[REDACTED]" : redactJobPayload(child),
    ]),
  );
}
