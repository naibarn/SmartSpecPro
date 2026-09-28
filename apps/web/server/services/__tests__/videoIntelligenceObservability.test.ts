/**
 * Feature 142 — section-08 §5.6. Injected `logAudit` double + fake timers;
 * zero module mocks beyond the audit seam. The module is a process-lifetime
 * singleton, so every test resets its internal state via the test-only
 * `__resetVideoIntelligenceObservabilityStateForTests` helper.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VI_OBSERVABILITY_EVENTS,
  VI_REGISTRATION_CHECK_DELAY_MS,
  markVideoIntelligenceQueueRegistered,
  armVideoIntelligenceRegistrationCheck,
  clearVideoIntelligenceRegistrationCheck,
  reportVideoIntelligenceSweepFindings,
  reportVideoIntelligenceSchemaFailure,
  recordVideoIntelligenceStageRun,
  getVideoIntelligenceObservabilityState,
  __resetVideoIntelligenceObservabilityStateForTests,
} from "../videoIntelligenceObservability";

function eventsOf(mock: ReturnType<typeof vi.fn>): string[] {
  return mock.mock.calls.map(call => (call[0] as any).metadata?.event);
}

beforeEach(() => {
  __resetVideoIntelligenceObservabilityStateForTests();
});

afterEach(() => {
  __resetVideoIntelligenceObservabilityStateForTests();
  vi.useRealTimers();
});

describe("queue registration signal", () => {
  it("emits queue_registered when registration is marked", () => {
    const logAudit = vi.fn();
    markVideoIntelligenceQueueRegistered({ workerConcurrency: 3 }, { logAudit });

    expect(eventsOf(logAudit)).toContain(VI_OBSERVABILITY_EVENTS.queueRegistered);
    expect(getVideoIntelligenceObservabilityState().queueRegistered).toBe(true);
  });

  it("emits queue_registration_missing when the self-check fires unmarked", () => {
    vi.useFakeTimers();
    const logAudit = vi.fn();
    armVideoIntelligenceRegistrationCheck({ logAudit });

    vi.advanceTimersByTime(VI_REGISTRATION_CHECK_DELAY_MS);

    expect(eventsOf(logAudit)).toContain(VI_OBSERVABILITY_EVENTS.queueRegistrationMissing);
    expect(getVideoIntelligenceObservabilityState().registrationCheckFired).toBe(true);
  });

  it("emits NOTHING when registration is marked before the self-check delay", () => {
    vi.useFakeTimers();
    const logAudit = vi.fn();
    armVideoIntelligenceRegistrationCheck({ logAudit });
    markVideoIntelligenceQueueRegistered(undefined, { logAudit });
    logAudit.mockClear();

    vi.advanceTimersByTime(VI_REGISTRATION_CHECK_DELAY_MS);

    expect(logAudit).not.toHaveBeenCalled();
  });

  it("unrefs the self-check timer so it never holds the process open", () => {
    const unrefSpy = vi.fn();
    const originalSetTimeout = global.setTimeout;
    const setTimeoutSpy = vi
      .spyOn(global, "setTimeout")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation((fn: any, ms?: any) => {
        const timer = originalSetTimeout(fn, ms) as unknown as { unref: () => void };
        timer.unref = unrefSpy;
        return timer as unknown as ReturnType<typeof setTimeout>;
      });

    armVideoIntelligenceRegistrationCheck();
    expect(unrefSpy).toHaveBeenCalledTimes(1);

    clearVideoIntelligenceRegistrationCheck();
    setTimeoutSpy.mockRestore();
  });

  it("clearVideoIntelligenceRegistrationCheck disarms it", () => {
    vi.useFakeTimers();
    const logAudit = vi.fn();
    armVideoIntelligenceRegistrationCheck({ logAudit });
    clearVideoIntelligenceRegistrationCheck();

    vi.advanceTimersByTime(VI_REGISTRATION_CHECK_DELAY_MS + 1000);

    expect(logAudit).not.toHaveBeenCalled();
    expect(getVideoIntelligenceObservabilityState().registrationCheckFired).toBe(false);
  });
});

describe("sweep findings", () => {
  it("emits stage_job_stuck_queued with the job ids when stuckQueued is non-empty", () => {
    const logAudit = vi.fn();
    reportVideoIntelligenceSweepFindings(
      { requeued: [], failed: [], stuckQueued: ["job-1", "job-2"] },
      { logAudit },
    );

    expect(eventsOf(logAudit)).toContain(VI_OBSERVABILITY_EVENTS.stageJobStuckQueued);
    const call = logAudit.mock.calls.find(
      c => (c[0] as any).metadata?.event === VI_OBSERVABILITY_EVENTS.stageJobStuckQueued,
    )!;
    expect((call[0] as any).metadata.jobIds).toEqual(["job-1", "job-2"]);
    expect(getVideoIntelligenceObservabilityState().stuckQueuedJobIds).toEqual(["job-1", "job-2"]);
  });

  it("emits NOTHING for a clean sweep", () => {
    const logAudit = vi.fn();
    reportVideoIntelligenceSweepFindings({ requeued: [], failed: [], stuckQueued: [] }, { logAudit });

    expect(logAudit).not.toHaveBeenCalled();
    expect(getVideoIntelligenceObservabilityState().stuckQueuedJobIds).toEqual([]);
  });

  it("caps the reported job-id list so a mass outage cannot bloat the audit row", () => {
    const logAudit = vi.fn();
    const massIds = Array.from({ length: 500 }, (_, i) => `job-${i}`);
    reportVideoIntelligenceSweepFindings({ requeued: [], failed: [], stuckQueued: massIds }, { logAudit });

    const call = logAudit.mock.calls[0]![0] as any;
    expect(call.metadata.jobIds.length).toBeLessThan(500);
    expect(call.metadata.totalStuck).toBe(500);
    expect(getVideoIntelligenceObservabilityState().stuckQueuedJobIds.length).toBeLessThan(500);
  });
});

describe("schema failure signal", () => {
  it("emits structured_output_violation for EVERY reported contract failure", () => {
    const logAudit = vi.fn();
    reportVideoIntelligenceSchemaFailure(
      { stage: "scene_plan", modelId: "model-a", traceId: "trace-1", issuePathCount: 2 },
      { logAudit },
    );
    reportVideoIntelligenceSchemaFailure(
      { stage: "scene_plan", modelId: "model-a", traceId: "trace-2", issuePathCount: 1 },
      { logAudit },
    );

    expect(eventsOf(logAudit).filter(e => e === VI_OBSERVABILITY_EVENTS.structuredOutputViolation)).toHaveLength(2);
  });

  it("counts toward schemaFailuresLast15Min", () => {
    let nowMs = 0;
    const now = () => nowMs;
    reportVideoIntelligenceSchemaFailure(
      { stage: "scene_plan", modelId: "model-a", traceId: "trace-1", issuePathCount: 1 },
      { logAudit: vi.fn(), now },
    );

    expect(getVideoIntelligenceObservabilityState({ now }).schemaFailuresLast15Min).toBe(1);
  });

  it("counts stage runs as the rate denominator", () => {
    let nowMs = 0;
    const now = () => nowMs;
    recordVideoIntelligenceStageRun("scene_plan", { now });
    recordVideoIntelligenceStageRun("quality_review", { now });

    expect(getVideoIntelligenceObservabilityState({ now }).stageRunsLast15Min).toBe(2);
  });

  it("ages entries out of the 15-minute window", () => {
    let nowMs = 0;
    const now = () => nowMs;
    reportVideoIntelligenceSchemaFailure(
      { stage: "scene_plan", modelId: "model-a", traceId: "trace-1", issuePathCount: 1 },
      { logAudit: vi.fn(), now },
    );
    recordVideoIntelligenceStageRun("scene_plan", { now });

    expect(getVideoIntelligenceObservabilityState({ now }).schemaFailuresLast15Min).toBe(1);
    expect(getVideoIntelligenceObservabilityState({ now }).stageRunsLast15Min).toBe(1);

    nowMs = 16 * 60 * 1000; // 16 minutes later — outside the 15-minute window

    expect(getVideoIntelligenceObservabilityState({ now }).schemaFailuresLast15Min).toBe(0);
    expect(getVideoIntelligenceObservabilityState({ now }).stageRunsLast15Min).toBe(0);
  });
});

describe("never breaks a stage", () => {
  it("swallows a throwing audit logger in markVideoIntelligenceQueueRegistered", () => {
    const logAudit = vi.fn(() => {
      throw new Error("audit logger boom");
    });
    expect(() => markVideoIntelligenceQueueRegistered(undefined, { logAudit })).not.toThrow();
  });

  it("swallows a throwing audit logger in reportVideoIntelligenceSweepFindings", () => {
    const logAudit = vi.fn(() => {
      throw new Error("audit logger boom");
    });
    expect(() =>
      reportVideoIntelligenceSweepFindings({ requeued: [], failed: [], stuckQueued: ["job-1"] }, { logAudit }),
    ).not.toThrow();
  });

  it("swallows a throwing audit logger in reportVideoIntelligenceSchemaFailure", () => {
    const logAudit = vi.fn(() => {
      throw new Error("audit logger boom");
    });
    expect(() =>
      reportVideoIntelligenceSchemaFailure(
        { stage: "scene_plan", modelId: "model-a", traceId: "trace-1", issuePathCount: 1 },
        { logAudit },
      ),
    ).not.toThrow();
  });

  it("swallows a throwing audit logger inside the self-check timer callback", () => {
    vi.useFakeTimers();
    const logAudit = vi.fn(() => {
      throw new Error("audit logger boom");
    });
    armVideoIntelligenceRegistrationCheck({ logAudit });

    expect(() => vi.advanceTimersByTime(VI_REGISTRATION_CHECK_DELAY_MS)).not.toThrow();
  });

  it("never throws from recordVideoIntelligenceStageRun or getVideoIntelligenceObservabilityState", () => {
    expect(() => recordVideoIntelligenceStageRun("scene_plan")).not.toThrow();
    expect(() => getVideoIntelligenceObservabilityState()).not.toThrow();
  });

  it("emits no secret-shaped value — model names, ids and numbers only", () => {
    const logAudit = vi.fn();
    reportVideoIntelligenceSchemaFailure(
      { stage: "scene_plan", modelId: "openai/gpt-5", traceId: "trace-1", issuePathCount: 1 },
      { logAudit },
    );
    reportVideoIntelligenceSweepFindings(
      { requeued: [], failed: [], stuckQueued: ["job-1"] },
      { logAudit },
    );
    markVideoIntelligenceQueueRegistered({ workerConcurrency: 3 }, { logAudit });

    const serialized = JSON.stringify(logAudit.mock.calls.map(c => c[0]));
    expect(serialized).not.toMatch(/sk-[a-zA-Z0-9]/);
    expect(serialized).not.toMatch(/Bearer /);
    expect(serialized).not.toMatch(/password/i);
  });
});
