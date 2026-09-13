import { describe, expect, it } from "vitest";

import { createScheduledJobIntent, deterministicOccurrenceKey } from "../jobSchedulerAdapter";

describe("scheduler adapter", () => {
  it("creates a deterministic occurrence key without executing business logic", () => {
    expect(deterministicOccurrenceKey("cleanup", new Date("2026-09-13T00:00:00Z"), "UTC"))
      .toBe("cleanup:2026-09-13T00:00:00.000Z:UTC");
  });

  it("deduplicates schedule delivery at the occurrence store", async () => {
    const calls: string[] = [];
    const result = await createScheduledJobIntent({
      tenantId: "tenant-a",
      schedule: { scheduleId: "cleanup", occurrenceKey: "cleanup:2026-09-13", scheduleVersion: "2", timezone: "UTC" },
      definition: {
        contractVersion: "feature-186-v1", tenantId: "tenant-a", jobType: "cleanup", executionClass: "scheduled",
        input: {}, retryPolicy: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1, jitter: "none", deadlineMs: 1000, allowedErrorClasses: [] },
        timeoutPolicy: { softTimeoutMs: 100, hardTimeoutMs: 200 },
      },
    }, {
      createJob: async () => ({ jobId: "job-1", created: true }),
      hashDefinition: () => "hash",
      occurrences: { claim: async input => { calls.push(input.occurrenceKey); return { status: "exists", jobId: "job-1" }; } },
    });
    expect(result).toEqual({ jobId: "job-1", created: false });
    expect(calls).toEqual(["cleanup:2026-09-13"]);
  });

  it("rejects a caller idempotency key that could bypass occurrence dedupe", async () => {
    await expect(createScheduledJobIntent({
      tenantId: "tenant-a",
      schedule: { scheduleId: "cleanup", occurrenceKey: "cleanup:2026-09-13" },
      definition: {
        contractVersion: "feature-186-v1", tenantId: "tenant-a", jobType: "cleanup", executionClass: "scheduled",
        idempotencyKey: "caller-controlled-key",
        input: {}, retryPolicy: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1, jitter: "none", deadlineMs: 1000, allowedErrorClasses: [] },
        timeoutPolicy: { softTimeoutMs: 100, hardTimeoutMs: 200 },
      },
    }, {
      createJob: async () => ({ jobId: "never", created: true }),
      hashDefinition: () => "hash",
      occurrences: { claim: async () => "created" },
    })).rejects.toMatchObject({ code: "SCHEDULE_IDEMPOTENCY_CONFLICT" });
  });
});
