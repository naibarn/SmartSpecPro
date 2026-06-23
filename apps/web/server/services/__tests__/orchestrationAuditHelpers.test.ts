import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLog = vi.fn();
vi.mock("../auditLogger", () => ({
  auditLogger: { log: (...args: any[]) => mockLog(...args) },
}));

vi.mock("../traceContext", () => ({
  getTraceId: vi.fn(() => "auto-trace"),
}));

import {
  logClassifyEvent,
  logPipelineEvent,
  logAgentLoopSummaryEvent,
  logAgentStepEvent,
  logFallbackEvent,
  logQualityGateEvent,
  logParamExtractEvent,
} from "../orchestrationAuditHelpers";

describe("orchestration audit helpers", () => {
  beforeEach(() => mockLog.mockClear());

  it("logClassifyEvent logs correct event type and metadata", () => {
    logClassifyEvent({
      traceId: "t1",
      userId: 1,
      level: "simple",
      skills: [{ skillId: "s1", confidence: 0.9, reason: "match" }],
      strategy: "single",
      classifierModel: "gpt-4o-mini",
      latencyMs: 150,
    });

    expect(mockLog).toHaveBeenCalledOnce();
    const entry = mockLog.mock.calls[0][0];
    expect(entry.eventType).toBe("orchestration_classify");
    expect(entry.metadata.level).toBe("simple");
    expect(entry.metadata.skills[0].skillId).toBe("s1");
    expect(entry.metadata.latencyMs).toBe(150);
    expect(entry.metadata.classifierModel).toBe("gpt-4o-mini");
  });

  it("logPipelineEvent logs step statuses and credits", () => {
    logPipelineEvent({
      traceId: "t1",
      userId: 1,
      steps: [
        { stepId: "s1", skillId: "sk1", status: "completed", creditsUsed: 5, durationMs: 100 },
        { stepId: "s2", skillId: "sk2", status: "failed", creditsUsed: 0, durationMs: 50, error: "err" },
      ],
      totalCreditsUsed: 5,
      totalDurationMs: 150,
    });

    const entry = mockLog.mock.calls[0][0];
    expect(entry.eventType).toBe("orchestration_pipeline");
    expect(entry.metadata.steps).toHaveLength(2);
    expect(entry.metadata.totalCreditsUsed).toBe(5);
  });

  it("logAgentStepEvent logs iteration and action", () => {
    logAgentStepEvent({
      traceId: "t1",
      userId: 1,
      iteration: 2,
      action: "execute_skill",
      skillId: "s1",
      creditsUsed: 3,
      reasoning: "needed data",
      durationMs: 200,
    });

    const entry = mockLog.mock.calls[0][0];
    expect(entry.eventType).toBe("orchestration_agent_step");
    expect(entry.metadata.iteration).toBe(2);
    expect(entry.metadata.action).toBe("execute_skill");
  });

  it("logAgentLoopSummaryEvent logs stop reason and learning signals", () => {
    logAgentLoopSummaryEvent({
      traceId: "t1",
      userId: 1,
      stopReason: "data_first_debug_required",
      iterations: 0,
      totalCreditsUsed: 0,
      totalDurationMs: 25,
      sectionCount: 1,
      actionCount: 1,
      subAgentPolicy: {
        mode: "subagent_recommended",
        reason: "context_soft_limit",
        maxFanout: 2,
        maxConcurrency: 2,
        estimatedContextChars: 25_000,
        failedQualityChecks: 0,
        activeSubagents: 0,
      },
      debugEvidencePolicy: {
        requiresDataFirst: true,
        hasEvidenceHint: false,
        reason: "evidence_missing",
        evidenceHints: [],
      },
    });

    const entry = mockLog.mock.calls[0][0];
    expect(entry.eventType).toBe("orchestration_agent_loop_summary");
    expect(entry.creditsCharged).toBe(0);
    expect(entry.metadata.stopReason).toBe("data_first_debug_required");
    expect(entry.metadata.learningSignals.stoppedByEvidenceGate).toBe(true);
    expect(entry.metadata.learningSignals.subAgentRecommended).toBe(true);
    expect(entry.metadata.learningSignals.contextSoftLimit).toBe(true);
  });

  it("logFallbackEvent logs reason", () => {
    logFallbackEvent({
      traceId: "t1",
      userId: 1,
      reason: "timeout",
      classifierAttempted: true,
    });

    const entry = mockLog.mock.calls[0][0];
    expect(entry.eventType).toBe("orchestration_fallback");
    expect(entry.metadata.reason).toBe("timeout");
    expect(entry.metadata.classifierAttempted).toBe(true);
  });

  it("logQualityGateEvent logs pass/fail and score", () => {
    logQualityGateEvent({
      traceId: "t1",
      userId: 1,
      pass: false,
      score: 0.4,
      issues: ["Incomplete"],
      durationMs: 100,
    });

    const entry = mockLog.mock.calls[0][0];
    expect(entry.eventType).toBe("orchestration_quality_gate");
    expect(entry.metadata.pass).toBe(false);
    expect(entry.metadata.score).toBe(0.4);
    expect(entry.metadata.issues).toEqual(["Incomplete"]);
  });

  it("logParamExtractEvent logs skill and fields", () => {
    logParamExtractEvent({
      traceId: "t1",
      userId: 1,
      skillId: "s1",
      fieldsExtracted: ["topic"],
      fieldsMissing: ["style"],
      confidence: 0.85,
      usedCombinedCall: false,
      durationMs: 50,
    });

    const entry = mockLog.mock.calls[0][0];
    expect(entry.eventType).toBe("orchestration_param_extract");
    expect(entry.metadata.fieldsExtracted).toEqual(["topic"]);
    expect(entry.metadata.fieldsMissing).toEqual(["style"]);
  });

  it("uses getTraceId fallback when traceId not provided", () => {
    logFallbackEvent({ userId: 1, reason: "disabled", classifierAttempted: false });

    const entry = mockLog.mock.calls[0][0];
    expect(entry.traceId).toBe("auto-trace");
  });
});
