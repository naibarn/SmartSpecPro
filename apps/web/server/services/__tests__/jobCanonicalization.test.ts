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
  });

  it("redacts secret-like keys without changing safe values", () => {
    expect(redactJobPayload({ apiKey: "secret", nested: { token: "hidden", ok: true } })).toEqual({
      apiKey: "[REDACTED]",
      nested: { token: "[REDACTED]", ok: true },
    });
  });
});
