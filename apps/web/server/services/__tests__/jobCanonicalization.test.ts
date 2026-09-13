import { describe, expect, it } from "vitest";

import {
  canonicalizeJobDefinition,
  computeJobDefinitionHash,
  redactJobPayload,
  validateJobDefinition,
} from "../jobCanonicalization";

const baseDefinition = {
  contractVersion: "feature-186-v1",
  tenantId: "tenant-a",
  requestedByUserId: 42,
  jobType: "media_render",
  executionClass: "cpu" as const,
  priority: 10,
  input: { z: 2, a: "value" },
  idempotencyKey: "request-1",
  retryPolicy: {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    jitter: "none" as const,
    deadlineMs: 120000,
    allowedErrorClasses: ["timeout", "provider_5xx"],
  },
  timeoutPolicy: { softTimeoutMs: 60000, hardTimeoutMs: 90000 },
  requiredCapabilities: { gpu: false },
};

describe("job canonicalization", () => {
  it("produces the same canonical form and hash for equivalent object ordering", () => {
    const first = canonicalizeJobDefinition(baseDefinition);
    const second = canonicalizeJobDefinition({
      ...baseDefinition,
      input: { a: "value", z: 2 },
      idempotencyKey: "another-retry-key",
    });

    expect(first).toBe(second);
    expect(computeJobDefinitionHash(baseDefinition)).toBe(
      computeJobDefinitionHash({ ...baseDefinition, idempotencyKey: "different" }),
    );
  });

  it("normalizes Unicode object keys before sorting them", () => {
    const composed = "\u00e9";
    const decomposed = "e\u0301";
    expect(canonicalizeJobDefinition({ ...baseDefinition, input: { z: 2, [composed]: 1, a: true } })).toBe(
      canonicalizeJobDefinition({ ...baseDefinition, input: { [decomposed]: 1, a: true, z: 2 } }),
    );
  });

  it("changes the hash for a meaningful definition difference", () => {
    expect(computeJobDefinitionHash(baseDefinition)).not.toBe(
      computeJobDefinitionHash({ ...baseDefinition, jobType: "audio_render" }),
    );
  });

  it("validates bounds and the supported execution class", () => {
    expect(() => validateJobDefinition(baseDefinition)).not.toThrow();
    expect(() => validateJobDefinition({ ...baseDefinition, jobType: "" })).toThrow(
      "Job definition identity is incomplete",
    );
    expect(() => validateJobDefinition({ ...baseDefinition, input: { nested: { value: "x" } } })).not.toThrow();
    expect(() => validateJobDefinition({ ...baseDefinition, input: [] as unknown as Record<string, unknown> })).toThrow("input must be a JSON object");
    expect(() => validateJobDefinition({ ...baseDefinition, schedule: { scheduleId: "daily", occurrenceKey: "2026-09-13" } })).toThrow("complete schedule definition");
    expect(() => validateJobDefinition({ ...baseDefinition, schedule: { scheduleId: "daily", occurrenceKey: "2026-09-13", scheduleVersion: "v1", timezone: "Asia/Bangkok", missedOccurrencePolicy: "coalesce" } })).not.toThrow();
  });

  it("redacts secret-like keys without changing safe values", () => {
    expect(redactJobPayload({ apiKey: "secret", nested: { token: "hidden", ok: true } })).toEqual({
      apiKey: "[REDACTED]",
      nested: { token: "[REDACTED]", ok: true },
    });
    expect(redactJobPayload({ signed: "https://example.test/api/storage/files/tenant/file.png?sig=secret", data: "data:image/png;base64,abc" })).toEqual({
      signed: "https://example.test/[REDACTED_PATH]",
      data: "[REDACTED_DATA_URL]",
    });
  });
});
