import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateControlPlaneJob } = vi.hoisted(() => ({
  mockCreateControlPlaneJob: vi.fn(),
}));
const feature186EnvironmentKeys = [
  "FEATURE_186_HARD_CUTOVER",
  "FEATURE_186_SYSTEM_TENANT_ID",
] as const;
const originalFeature186Environment = new Map<string, string | undefined>();

function restoreFeature186Environment(original: ReadonlyMap<string, string | undefined>) {
  for (const key of feature186EnvironmentKeys) {
    const value = original.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

vi.mock("../services/jobControlPlaneGateway", () => ({
  createControlPlaneJob: mockCreateControlPlaneJob,
}));

import {
  startFeature186SystemSchedule,
  stopAllFeature186SystemSchedules,
  stopFeature186SystemSchedule,
} from "./feature186SystemScheduler";

function definition(overrides: Partial<Parameters<typeof startFeature186SystemSchedule>[0]> = {}) {
  return {
    scheduleId: "spec224-test-schedule",
    jobType: "spec224.certification_probe",
    executionClass: "short" as const,
    scheduleVersion: "v1",
    timezone: "UTC" as const,
    missedOccurrencePolicy: "coalesce" as const,
    isDue: () => true,
    occurrenceKey: (now: Date) => now.toISOString(),
    intervalMs: 1_000,
    ...overrides,
  };
}

beforeEach(() => {
  originalFeature186Environment.clear();
  for (const key of feature186EnvironmentKeys) {
    originalFeature186Environment.set(key, process.env[key]);
  }
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-23T02:00:00.000Z"));
  vi.clearAllMocks();
  mockCreateControlPlaneJob.mockResolvedValue({ jobId: "job-test", created: true });
  process.env.FEATURE_186_HARD_CUTOVER = "true";
  process.env.FEATURE_186_SYSTEM_TENANT_ID = "tenant-system-test";
});

afterEach(() => {
  stopAllFeature186SystemSchedules();
  vi.useRealTimers();
  restoreFeature186Environment(originalFeature186Environment);
  originalFeature186Environment.clear();
  vi.restoreAllMocks();
});

describe("Feature 186 system schedule trigger", () => {
  const suiteInitialEnvironment = new Map<string, string | undefined>(
    feature186EnvironmentKeys.map((key) => [key, process.env[key]]),
  );

  beforeAll(() => {
    // Model values inherited from CI/the invoking process before per-test setup.
    process.env.FEATURE_186_HARD_CUTOVER = "inherited-cutover-value";
    process.env.FEATURE_186_SYSTEM_TENANT_ID = "inherited-tenant-value";
  });

  afterAll(() => {
    try {
      expect(process.env.FEATURE_186_HARD_CUTOVER).toBe("inherited-cutover-value");
      expect(process.env.FEATURE_186_SYSTEM_TENANT_ID).toBe("inherited-tenant-value");
    } finally {
      restoreFeature186Environment(suiteInitialEnvironment);
    }
  });

  it("restores inherited and originally unset Feature 186 environment values", () => {
    const original = new Map<string, string | undefined>([
      ["FEATURE_186_HARD_CUTOVER", "inherited-value"],
      ["FEATURE_186_SYSTEM_TENANT_ID", undefined],
    ]);
    process.env.FEATURE_186_HARD_CUTOVER = "test-mutated";
    process.env.FEATURE_186_SYSTEM_TENANT_ID = "test-tenant";

    restoreFeature186Environment(original);

    expect(process.env.FEATURE_186_HARD_CUTOVER).toBe("inherited-value");
    expect(process.env.FEATURE_186_SYSTEM_TENANT_ID).toBeUndefined();
  });

  it("fails closed unless hard cutover and system tenant are configured", () => {
    process.env.FEATURE_186_HARD_CUTOVER = "false";
    startFeature186SystemSchedule(definition());
    expect(mockCreateControlPlaneJob).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    process.env.FEATURE_186_HARD_CUTOVER = "true";
    delete process.env.FEATURE_186_SYSTEM_TENANT_ID;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    startFeature186SystemSchedule(definition({ scheduleId: "missing-tenant" }));
    expect(mockCreateControlPlaneJob).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("admits a due occurrence through the canonical gateway with stable identity", () => {
    startFeature186SystemSchedule(definition({
      scheduleId: "library-trash-purge",
      jobType: "library.trash_purge",
      occurrenceKey: () => "2026-09-23:trash-purge",
    }));

    expect(mockCreateControlPlaneJob).toHaveBeenCalledTimes(1);
    expect(mockCreateControlPlaneJob).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({
        tenantId: "tenant-system-test",
        actorType: "system",
        idempotencyKey: "feature-186:library-trash-purge:2026-09-23:trash-purge",
        correlationId: "feature-186:library-trash-purge:2026-09-23:trash-purge",
      }),
      definition: expect.objectContaining({
        jobType: "library.trash_purge",
        schedule: expect.objectContaining({
          scheduleId: "library-trash-purge",
          occurrenceKey: "2026-09-23:trash-purge",
          scheduleVersion: "v1",
          timezone: "UTC",
          missedOccurrencePolicy: "coalesce",
        }),
      }),
    }));
  });

  it("does not dispatch before the occurrence is due", async () => {
    startFeature186SystemSchedule(definition({ isDue: () => false }));
    await vi.advanceTimersByTimeAsync(2_000);

    expect(mockCreateControlPlaneJob).not.toHaveBeenCalled();
  });

  it("deduplicates local timer registration and stops future triggers", async () => {
    const schedule = definition({ scheduleId: "deduplicated-schedule" });
    startFeature186SystemSchedule(schedule);
    startFeature186SystemSchedule(schedule);
    expect(mockCreateControlPlaneJob).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);

    stopFeature186SystemSchedule("deduplicated-schedule");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(mockCreateControlPlaneJob).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("logs a failed gateway call and retries the same occurrence on the next timer tick", async () => {
    mockCreateControlPlaneJob
      .mockRejectedValueOnce(new Error("temporary gateway failure"))
      .mockResolvedValueOnce({ jobId: "job-test", created: true });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    startFeature186SystemSchedule(definition({
      scheduleId: "retry-schedule",
      occurrenceKey: () => "same-occurrence",
    }));
    await vi.advanceTimersByTimeAsync(1_000);

    expect(errorSpy).toHaveBeenCalledWith(
      "[Feature186] system schedule intent failed",
      expect.objectContaining({ scheduleId: "retry-schedule", occurrenceKey: "same-occurrence" }),
    );
    expect(mockCreateControlPlaneJob).toHaveBeenCalledTimes(2);
    expect(mockCreateControlPlaneJob.mock.calls[0][0].context.idempotencyKey)
      .toBe(mockCreateControlPlaneJob.mock.calls[1][0].context.idempotencyKey);
  });
});
