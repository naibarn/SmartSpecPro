import { describe, expect, it, vi } from "vitest";
import {
  assessAgentProgress,
  runOptionalQualityEvaluation,
  type AgentProgressInput,
} from "../progressIntelligence";

const baseInput: AgentProgressInput = {
  tenantId: "tenant-a",
  executionStatus: "running",
  recoveryStatus: "none",
  taskProfile: "interactive",
  nowMs: 1_000_000,
  lastHeartbeatAtMs: 999_000,
  lastMeaningfulProgressAtMs: 999_000,
  stallWindowMsByTaskProfile: {
    interactive: 60_000,
    standard: 300_000,
    long_running: 1_800_000,
    provider_job: 900_000,
  },
  loopDetectionMinRepeats: 3,
  previousPeakProgress: 0,
  requiredCriteria: [
    { criterionId: "answer", required: true, weight: 1, status: "pending", evidenceRefs: [] },
  ],
  evidence: [],
  previousVerifiedEvidenceRefs: [],
  invalidatedEvidenceRefs: [],
  toolCalls: [],
};

function verifiedAnswer(overrides: Partial<AgentProgressInput> = {}): AgentProgressInput {
  return {
    ...baseInput,
    requiredCriteria: [
      { criterionId: "answer", required: true, weight: 1, status: "verified", evidenceRefs: ["receipt:answer"] },
    ],
    evidence: [
      { tenantId: "tenant-a", evidenceRef: "receipt:answer", kind: "accepted_receipt", status: "verified" },
    ],
    ...overrides,
  };
}

describe("assessAgentProgress", () => {
  it("reports WORKING for a live agent without outcome evidence", () => {
    expect(assessAgentProgress(baseInput).status).toBe("WORKING");
  });

  it("reports PROGRESSING when newly verified evidence advances a required criterion", () => {
    expect(assessAgentProgress(verifiedAnswer()).status).toBe("PROGRESSING");
    expect(assessAgentProgress(verifiedAnswer()).progressDelta).toBe(1);
  });

  it("does not count extra tool calls or tokens as progress evidence", () => {
    const input = {
      ...baseInput,
      toolCalls: Array.from({ length: 8 }, (_, index) => ({
        tenantId: "tenant-a",
        toolName: `search-${index}`,
        argumentDigest: `${index}`.padStart(64, "0"),
        producedVerifiedEvidence: false,
      })),
    };
    expect(assessAgentProgress(input).status).toBe("WORKING");
    expect(assessAgentProgress(input).progress).toBe(0);
  });

  it("does not call a valid idle external operation stalled", () => {
    expect(assessAgentProgress({
      ...baseInput,
      nowMs: 900_000,
      lastHeartbeatAtMs: 700_000,
      lastMeaningfulProgressAtMs: 700_000,
      activeExternalOperation: true,
    }).status).toBe("WORKING");
  });

  it("keeps a long-running task working while its provider job is active", () => {
    expect(assessAgentProgress({
      ...baseInput,
      taskProfile: "long_running",
      nowMs: 10_000_000,
      lastHeartbeatAtMs: 1_000,
      lastMeaningfulProgressAtMs: 1_000,
      activeExternalOperation: true,
    }).status).toBe("WORKING");
  });

  it("reports STALLED only when heartbeat and evidence are stale and no wait/operation is active", () => {
    expect(assessAgentProgress({
      ...baseInput,
      nowMs: 1_100_000,
      lastHeartbeatAtMs: 1_000_000,
      lastMeaningfulProgressAtMs: 1_000_000,
    }).status).toBe("STALLED");
  });

  it("does not call an active heartbeat stalled even after the progress window", () => {
    expect(assessAgentProgress({
      ...baseInput,
      nowMs: 1_100_000,
      lastHeartbeatAtMs: 1_099_000,
      lastMeaningfulProgressAtMs: 1_000_000,
    }).status).toBe("WORKING");
  });

  it("uses the caller's task-class stall window instead of one fixed timeout", () => {
    const stale = {
      ...baseInput,
      nowMs: 1_200_000,
      lastHeartbeatAtMs: 1_000_000,
      lastMeaningfulProgressAtMs: 1_000_000,
      stallWindowMsByTaskProfile: {
        interactive: 60_000,
        standard: 300_000,
        long_running: 1_800_000,
        provider_job: 900_000,
      },
    };
    expect(assessAgentProgress({ ...stale, taskProfile: "interactive" }).status).toBe("STALLED");
    expect(assessAgentProgress({ ...stale, taskProfile: "long_running" }).status).toBe("WORKING");
  });

  it("does not call a valid dependency wait stalled", () => {
    expect(assessAgentProgress({
      ...baseInput,
      nowMs: 1_100_000,
      lastHeartbeatAtMs: 1_000_000,
      lastMeaningfulProgressAtMs: 1_000_000,
      waitingOn: { kind: "approval", dependencyRef: "approval:one" },
    }).status).toBe("BLOCKED");
  });

  it("detects repeated identical no-effect tool calls without storing raw arguments", () => {
    const input = {
      ...baseInput,
      toolCalls: Array.from({ length: 3 }, () => ({
        tenantId: "tenant-a",
        toolName: "search_docs",
        argumentDigest: "a".repeat(64),
        producedVerifiedEvidence: false,
      })),
    };
    const result = assessAgentProgress(input);
    expect(result.status).toBe("LOOPING");
    expect(JSON.stringify(result)).not.toContain("search_docs");
    expect(JSON.stringify(result)).not.toContain("a".repeat(64));
  });

  it("does not call repeated tool use a loop when it produced verified effects", () => {
    const input = {
      ...baseInput,
      toolCalls: Array.from({ length: 4 }, () => ({
        tenantId: "tenant-a",
        toolName: "read_receipt",
        argumentDigest: "b".repeat(64),
        producedVerifiedEvidence: true,
      })),
    };
    expect(assessAgentProgress(input).status).toBe("WORKING");
  });

  it("does not treat malformed dependency metadata as a valid external wait", () => {
    expect(assessAgentProgress({
      ...baseInput,
      nowMs: 1_100_000,
      lastHeartbeatAtMs: 1_000_000,
      lastMeaningfulProgressAtMs: 1_000_000,
      waitingOn: { kind: "approval", dependencyRef: " " },
    }).status).toBe("STALLED");
  });

  it("reports REGRESSING when previously verified evidence is explicitly invalidated", () => {
    expect(assessAgentProgress(verifiedAnswer({
      previousVerifiedEvidenceRefs: [
        { tenantId: "tenant-a", evidenceRef: "receipt:answer" },
      ],
      invalidatedEvidenceRefs: [
        { tenantId: "tenant-a", evidenceRef: "receipt:answer" },
      ],
      previousPeakProgress: 1,
    })).status).toBe("REGRESSING");
  });

  it("reports RECOVERING while the canonical recovery path is active", () => {
    expect(assessAgentProgress({
      ...baseInput,
      recoveryStatus: "in_progress",
    }).status).toBe("RECOVERING");
  });

  it("returns to evidence-based progress after the canonical recovery path succeeds", () => {
    expect(assessAgentProgress(verifiedAnswer({
      recoveryStatus: "none",
      previousProgress: 0,
    })).status).toBe("PROGRESSING");
  });

  it("reports FAILED only after recovery is exhausted", () => {
    expect(assessAgentProgress({
      ...baseInput,
      executionStatus: "failed",
      recoveryStatus: "exhausted",
    }).status).toBe("FAILED");
  });

  it("does not report completion when no outcome evidence is evaluable", () => {
    expect(assessAgentProgress({
      ...baseInput,
      executionStatus: "completed",
    }).status).toBe("PARTIAL");
  });

  it("requires verified refs for every required completion criterion", () => {
    const input = verifiedAnswer({
      requiredCriteria: [
        { criterionId: "answer", required: true, weight: 1, status: "verified", evidenceRefs: ["missing:receipt"] },
      ],
    });
    expect(assessAgentProgress({ ...input, executionStatus: "completed" }).status).toBe("PARTIAL");
  });

  it("completes with verified required evidence without optional environment certification", () => {
    const input = verifiedAnswer({
      executionStatus: "completed",
      requiredCriteria: [
        { criterionId: "answer", required: true, weight: 1, status: "verified", evidenceRefs: ["receipt:answer"] },
        { criterionId: "optional-environment-cert", required: false, weight: 1, status: "pending", evidenceRefs: [] },
      ],
    });
    expect(assessAgentProgress(input).status).toBe("COMPLETED");
  });

  it("ignores foreign-tenant evidence without exposing its reference", () => {
    const result = assessAgentProgress({
      ...baseInput,
      executionStatus: "completed",
      requiredCriteria: [],
      evidence: [
        { tenantId: "tenant-b", evidenceRef: "private:other-tenant", kind: "artifact", status: "verified" },
      ],
    });
    expect(result.status).toBe("PARTIAL");
    expect(JSON.stringify(result)).not.toContain("private:other-tenant");
  });

  it("keeps separate tasks independent and assessment replay deterministic", () => {
    const inputA = verifiedAnswer({ tenantId: "tenant-a", taskId: "task-a" });
    const inputB = { ...baseInput, tenantId: "tenant-b", taskId: "task-b" };
    const first = assessAgentProgress(inputA);
    expect(assessAgentProgress(inputB).progress).toBe(0);
    expect(assessAgentProgress(inputA)).toEqual(first);
  });

  it("does not mutate task state or dispatch tools", () => {
    const input = baseInput;
    const before = structuredClone(input);
    assessAgentProgress(input);
    expect(input).toEqual(before);
  });
});

describe("runOptionalQualityEvaluation", () => {
  it("skips the optional evaluator when its budget is exhausted", async () => {
    const evaluate = vi.fn(async () => ({ value: "pass", tokensUsed: 1 }));
    await expect(runOptionalQualityEvaluation({ budgetMs: 0, maxTokens: 100, evaluate })).resolves.toMatchObject({
      status: "skipped_budget",
    });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("skips the optional evaluator when its token budget is exhausted", async () => {
    const evaluate = vi.fn(async () => ({ value: "pass", tokensUsed: 0 }));
    await expect(runOptionalQualityEvaluation({ budgetMs: 100, maxTokens: 0, evaluate })).resolves.toMatchObject({
      status: "skipped_budget",
    });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("returns a neutral unavailable result when the optional judge fails", async () => {
    await expect(runOptionalQualityEvaluation({
      budgetMs: 100,
      maxTokens: 100,
      evaluate: async () => { throw new Error("judge offline"); },
    })).resolves.toMatchObject({ status: "unavailable" });
  });

  it("also contains a synchronous judge failure", async () => {
    await expect(runOptionalQualityEvaluation({
      budgetMs: 100,
      maxTokens: 100,
      evaluate: () => { throw new Error("judge setup failed"); },
    })).resolves.toMatchObject({ status: "unavailable" });
  });

  it("times out optional evaluation without failing the caller", async () => {
    await expect(runOptionalQualityEvaluation({
      budgetMs: 5,
      maxTokens: 100,
      evaluate: () => new Promise(() => undefined),
    })).resolves.toMatchObject({ status: "timed_out" });
  });

  it("returns advisory output when the optional evaluator finishes within budget", async () => {
    await expect(runOptionalQualityEvaluation({
      budgetMs: 100,
      maxTokens: 100,
      evaluate: async ({ maxTokens }) => ({ value: { score: 0.8 }, tokensUsed: Math.min(12, maxTokens) }),
    })).resolves.toMatchObject({ status: "completed", value: { score: 0.8 } });
  });

  it("discards advisory output that exceeds its token budget", async () => {
    await expect(runOptionalQualityEvaluation({
      budgetMs: 100,
      maxTokens: 4,
      evaluate: async () => ({ value: { score: 1 }, tokensUsed: 5 }),
    })).resolves.toMatchObject({ status: "budget_exceeded" });
  });
});
