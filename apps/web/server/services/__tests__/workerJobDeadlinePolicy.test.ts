import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKER_JOB_DEADLINE_SETTINGS,
  applyWorkerJobRetryDeadline,
  getEffectiveWorkerJobDeadlineMs,
  inferJobFamily,
  recommendRetryDeadlineMs,
  validateWorkerJobDeadlineSettings,
  withSafeWorkerJobDeadline,
} from "../workerJobDeadlinePolicy";

describe("worker job deadline policy", () => {
  it("sets bounded starting deadlines for every job family and classifies media", () => {
    expect(DEFAULT_WORKER_JOB_DEADLINE_SETTINGS.families).toEqual({
      python: { retryMinutes: 10, maxMinutes: 10 },
      image: { retryMinutes: 10, maxMinutes: 10 },
      audio: { retryMinutes: 10, maxMinutes: 10 },
      video: { retryMinutes: 60, maxMinutes: 60 },
      general: { retryMinutes: 10, maxMinutes: 10 },
    });
    expect(inferJobFamily({ jobType: "python.legacy_task", runtimeType: "python_job_worker" })).toBe("python");
    expect(inferJobFamily({ jobType: "media.image_generation" })).toBe("image");
    expect(inferJobFamily({ jobType: "media.audio_generation" })).toBe("audio");
    expect(inferJobFamily({ jobType: "media.video_render" })).toBe("video");
    expect(inferJobFamily({ jobType: "notification.digest", runtimeType: "node_job_worker" })).toBe("general");
  });

  it("bounds adaptive recommendations by the administrator maximum", () => {
    const result = recommendRetryDeadlineMs(
      { retryMinutes: 10, maxMinutes: 20 },
      {
        family: "python",
        queued: 300,
        active: 5,
        activeUsers: 20,
        avgQueueWaitMs: 30_000,
        p95QueueWaitMs: 60_000,
        avgExecutionMs: 3 * 60_000,
        p95ExecutionMs: 5 * 60_000,
        avgEndToEndMs: 4 * 60_000,
        p95EndToEndMs: 7 * 60_000,
        completedLastHour: 60,
      },
      true,
    );
    expect(result.deadlineMs).toBe(20 * 60_000);
    expect(result.confidence).toBe("high");
    expect(result.capApplied).toBe(true);
  });

  it("uses the configured base when the history is too small", () => {
    expect(recommendRetryDeadlineMs(
      { retryMinutes: 10, maxMinutes: 30 },
      { family: "image", queued: 4, active: 1, activeUsers: 3, avgQueueWaitMs: null, p95QueueWaitMs: null, avgExecutionMs: 90_000, p95ExecutionMs: 90_000, avgEndToEndMs: null, p95EndToEndMs: null, completedLastHour: 2 },
      true,
    )).toMatchObject({ deadlineMs: 10 * 60_000, confidence: "low", estimatedQueueWaitMs: null });
  });

  it("estimates queue delay from both active concurrency and observed throughput", () => {
    const metric = {
      family: "python" as const,
      queued: 100,
      activeUsers: 100,
      avgQueueWaitMs: 30_000,
      p95QueueWaitMs: 60_000,
      avgExecutionMs: 4 * 60_000,
      p95ExecutionMs: 5 * 60_000,
      avgEndToEndMs: 4 * 60_000,
      p95EndToEndMs: 6 * 60_000,
      completedLastHour: 1000,
    };
    const lowConcurrency = recommendRetryDeadlineMs({ retryMinutes: 10, maxMinutes: 60 }, { ...metric, active: 10 }, true);
    const higherConcurrency = recommendRetryDeadlineMs({ retryMinutes: 10, maxMinutes: 60 }, { ...metric, active: 50 }, true);

    expect(lowConcurrency.deadlineMs).toBeGreaterThan(higherConcurrency.deadlineMs);
    expect(lowConcurrency.estimatedQueueWaitMs).toBe(50 * 60_000);
  });

  it("rejects retry settings above family hard ceilings or max below base", () => {
    expect(() => validateWorkerJobDeadlineSettings({
      adaptive: true,
      families: {
        python: { retryMinutes: 10, maxMinutes: 61 },
        image: { retryMinutes: 10, maxMinutes: 10 },
        audio: { retryMinutes: 10, maxMinutes: 10 },
        video: { retryMinutes: 60, maxMinutes: 60 },
        general: { retryMinutes: 10, maxMinutes: 10 },
      },
    })).toThrow("WORKER_JOB_DEADLINE_SETTINGS_OUT_OF_RANGE");
  });

  it("fills newly added families when reading a previously persisted policy", () => {
    expect(validateWorkerJobDeadlineSettings({
      adaptive: true,
      families: {
        python: { retryMinutes: 10, maxMinutes: 10 },
        image: { retryMinutes: 10, maxMinutes: 10 },
        video: { retryMinutes: 60, maxMinutes: 60 },
      },
    }).families).toMatchObject({
      audio: { retryMinutes: 10, maxMinutes: 10 },
      general: { retryMinutes: 10, maxMinutes: 10 },
    });
  });

  it("shortens legacy 24-hour deadlines at reconciliation without a data backfill", () => {
    expect(getEffectiveWorkerJobDeadlineMs({
      jobType: "python.legacy_task",
      runtimeType: "python_job_worker",
      input: {},
      retryPolicy: { deadlineMs: 24 * 60 * 60 * 1000 },
      timeoutSeconds: 600,
    })).toBe(10 * 60 * 1000);
    expect(getEffectiveWorkerJobDeadlineMs({
      jobType: "media.video_render",
      runtimeType: "node_job_worker",
      input: {},
      retryPolicy: { deadlineMs: 24 * 60 * 60 * 1000, deadlineMode: "fixed" },
    })).toBe(2 * 60 * 60 * 1000);
  });

  const fastLane = {
    jobType: "developer.fast_lane", contractVersion: "developer-fast-lane-v1",
    runtimeType: "node_job_worker", executionClass: "long", tenantId: "tenant-a", requestedByUserId: 42,
    input: { developerWorkUnit: { contractVersion: "developer-fast-lane-v1", tenantId: "tenant-a", actorId: 42 } },
    retryPolicy: { deadlineMs: 7 * 24 * 60 * 60_000, deadlineMode: "fixed" as const },
  };

  it.each([600_000, 7 * 24 * 60 * 60_000, 30 * 24 * 60 * 60_000])(
    "preserves explicit Fast Lane bounds consistently without extending existing deadlines (%s)", async requested => {
      const definition = { ...fastLane, retryPolicy: { ...fastLane.retryPolicy, deadlineMs: requested } };
      const expected = Math.min(requested, fastLane.retryPolicy.deadlineMs);
      expect((await applyWorkerJobRetryDeadline(definition, definition.runtimeType)).retryPolicy.deadlineMs).toBe(expected);
      expect(getEffectiveWorkerJobDeadlineMs(definition)).toBe(expected);
      expect(withSafeWorkerJobDeadline({ ...definition, inputJson: definition.input, retryPolicyJson: definition.retryPolicy }).retryPolicyJson.deadlineMs).toBe(expected);
    },
  );

  it.each([
    { jobType: "developer.other" }, { contractVersion: "feature-186-v1" },
    { runtimeType: "python_job_worker" }, { executionClass: "short" },
    { tenantId: "other-tenant" }, { requestedByUserId: 43 }, { requestedByUserId: undefined },
    { input: {} }, { input: { developerWorkUnit: { contractVersion: "unsupported", tenantId: "tenant-a", actorId: 42 } } },
  ])("keeps generic limits for unsupported or unbound contracts (%j)", async override => {
    const definition = { ...fastLane, ...override };
    expect((await applyWorkerJobRetryDeadline(definition, definition.runtimeType)).retryPolicy.deadlineMs).toBe(600_000);
    const genericHardCap = definition.runtimeType === "python_job_worker" ? 60 * 60_000 : 120 * 60_000;
    expect(getEffectiveWorkerJobDeadlineMs(definition)).toBe(genericHardCap);
    expect(withSafeWorkerJobDeadline({ ...definition, inputJson: definition.input, retryPolicyJson: definition.retryPolicy }).retryPolicyJson.deadlineMs).toBe(genericHardCap);
  });

  it("does not extend legacy or adaptive Fast Lane records without an explicit fixed bound", async () => {
    for (const mode of [undefined, "adaptive"] as const) {
      const definition = { ...fastLane, retryPolicy: { ...fastLane.retryPolicy, deadlineMode: mode } };
      expect((await applyWorkerJobRetryDeadline(definition, definition.runtimeType)).retryPolicy.deadlineMs).toBe(600_000);
      expect(withSafeWorkerJobDeadline({ ...definition, inputJson: definition.input, retryPolicyJson: definition.retryPolicy }).retryPolicyJson.deadlineMs).toBe(600_000);
      if (mode === undefined) expect(getEffectiveWorkerJobDeadlineMs(definition)).toBe(600_000);
    }
  });

  it("normalizes direct worker_jobs inserts that bypass the canonical create API", () => {
    expect(withSafeWorkerJobDeadline({
      jobType: "python.legacy_task",
      runtimeType: "python_job_worker",
      inputJson: {},
      retryPolicyJson: { maxAttempts: 4, deadlineMs: 24 * 60 * 60 * 1000 },
    }).retryPolicyJson).toMatchObject({ deadlineMs: 10 * 60 * 1000, deadlineMode: "adaptive" });
    expect(withSafeWorkerJobDeadline({
      jobType: "video.render",
      runtimeType: "node_job_worker",
      inputJson: {},
      retryPolicyJson: { deadlineMs: 24 * 60 * 60 * 1000, deadlineMode: "fixed" },
    }).retryPolicyJson).toMatchObject({ deadlineMs: 2 * 60 * 60 * 1000, deadlineMode: "fixed" });
    expect(withSafeWorkerJobDeadline({ jobType: "workflow.run", inputJson: {} }).retryPolicyJson)
      .toMatchObject({ deadlineMs: 10 * 60 * 1000, deadlineMode: "adaptive" });
  });
});
