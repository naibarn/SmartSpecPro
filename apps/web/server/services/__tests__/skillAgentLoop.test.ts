import { describe, it, expect, vi, beforeEach } from "vitest";

let mockSkillDef: any = { id: "test-skill", name: "Test", type: "core-text" };
let mockExecResults: any[] = [];
let mockExecCallIdx = 0;
let mockQualityResults: any[] = [];
let mockQualityCallIdx = 0;
let mockExecNeverSettles = false;

vi.mock("../skillRegistry", async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    getSkillByIdAsync: vi.fn(async () => mockSkillDef),
  };
});

vi.mock("../skillExecutor", () => ({
  executeSkill: vi.fn(async (_skill, params) => {
    if (mockExecNeverSettles) {
      return new Promise(() => {});
    }
    const result = mockExecResults[mockExecCallIdx] ?? mockExecResults[0];
    mockExecCallIdx += 1;
    return {
      skillId: "test-skill",
      type: "text",
      message: params.prompt,
      creditsUsed: 1,
      ...result,
    };
  }),
}));

vi.mock("../skillQualityGate", () => ({
  validateQuality: vi.fn(async () => {
    const result = mockQualityResults[mockQualityCallIdx] ?? mockQualityResults[0];
    mockQualityCallIdx += 1;
    return result;
  }),
}));

vi.mock("../orchestrationAuditHelpers", () => ({
  logAgentLoopSummaryEvent: vi.fn(),
  logAgentStepEvent: vi.fn(),
}));

import { runAgentLoop } from "../skillAgentLoop";
import { executeSkill } from "../skillExecutor";
import { logAgentLoopSummaryEvent } from "../orchestrationAuditHelpers";

const baseOptions = {
  userId: 1,
  tenantId: "t1",
  userToken: "token",
  traceId: "trace-1",
};

describe("runAgentLoop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSkillDef = { id: "test-skill", name: "Test", type: "core-text" };
    mockExecCallIdx = 0;
    mockQualityCallIdx = 0;
    mockExecNeverSettles = false;
    mockExecResults = [
      { success: true, skillId: "test-skill", type: "text", message: "first", creditsUsed: 1 },
      { success: true, skillId: "test-skill", type: "text", message: "second", creditsUsed: 1 },
    ];
    mockQualityResults = [
      { pass: true, score: 0.9, issues: [] },
    ];
  });

  it("executes a skill and stops when the quality gate passes", async () => {
    const result = await runAgentLoop("write this", ["test-skill"], baseOptions);

    expect(result.stopReason).toBe("quality_passed");
    expect(result.iterations).toBe(1);
    expect(result.sections).toHaveLength(1);
    expect(result.totalCreditsUsed).toBe(1);
    expect(result.subAgentPolicy.mode).toBe("inline");
    expect(result.subAgentPolicy.reason).toBe("within_inline_limits");
    expect(result.debugEvidencePolicy.reason).toBe("not_debug_request");
    expect(logAgentLoopSummaryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: "trace-1",
        userId: 1,
        stopReason: "quality_passed",
        iterations: 1,
        totalCreditsUsed: 1,
        sectionCount: 1,
        actionCount: 2,
        subAgentPolicy: expect.objectContaining({ mode: "inline" }),
        debugEvidencePolicy: expect.objectContaining({ reason: "not_debug_request" }),
      }),
    );
  });

  it("stops bug/debug requests before execution when data evidence is missing", async () => {
    const result = await runAgentLoop(
      "fix bug in the workflow UI, it keeps failing",
      ["test-skill"],
      baseOptions,
    );

    expect(result.stopReason).toBe("data_first_debug_required");
    expect(result.debugEvidencePolicy).toEqual({
      requiresDataFirst: true,
      hasEvidenceHint: false,
      reason: "evidence_missing",
      evidenceHints: [],
    });
    expect(result.sections[0].skillId).toBe("debug-evidence-gate");
    expect(result.sections[0].content).toContain("Data-first debug required");
    expect(executeSkill).not.toHaveBeenCalled();
    expect(logAgentLoopSummaryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stopReason: "data_first_debug_required",
        iterations: 0,
        totalCreditsUsed: 0,
        sectionCount: 1,
        debugEvidencePolicy: expect.objectContaining({ reason: "evidence_missing" }),
      }),
    );
  });

  it("allows bug/debug requests to execute when trace or data evidence is present", async () => {
    const result = await runAgentLoop(
      "debug failed runId run_123 from audit log table media_tasks status failed",
      ["test-skill"],
      baseOptions,
    );

    expect(result.stopReason).toBe("quality_passed");
    expect(result.debugEvidencePolicy.requiresDataFirst).toBe(true);
    expect(result.debugEvidencePolicy.reason).toBe("evidence_present");
    expect(result.debugEvidencePolicy.evidenceHints).toEqual(
      expect.arrayContaining(["run_id", "audit_log", "db_table", "status_error"]),
    );
    expect(executeSkill).toHaveBeenCalledTimes(1);
  });

  it("feeds quality gate feedback into the next iteration", async () => {
    mockQualityResults = [
      { pass: false, score: 0.4, issues: ["Missing detail"], suggestion: "Add examples" },
      { pass: true, score: 0.9, issues: [] },
    ];

    const result = await runAgentLoop("write this", ["test-skill"], baseOptions);

    expect(result.stopReason).toBe("quality_passed");
    expect(result.iterations).toBe(2);
    expect(executeSkill).toHaveBeenCalledTimes(2);
    expect((executeSkill as any).mock.calls[1][1].prompt).toContain("Missing detail");
    expect((executeSkill as any).mock.calls[1][1].prompt).toContain("Add examples");
  });

  it("recommends sub-agent routing after repeated repair rounds without spawning one", async () => {
    mockExecResults = [
      { success: true, skillId: "test-skill", type: "text", message: "first", creditsUsed: 1 },
      { success: true, skillId: "test-skill", type: "text", message: "second", creditsUsed: 1 },
      { success: true, skillId: "test-skill", type: "text", message: "third", creditsUsed: 1 },
    ];
    mockQualityResults = [
      { pass: false, score: 0.4, issues: ["Missing detail"], suggestion: "Add examples" },
      { pass: false, score: 0.5, issues: ["Still incomplete"], suggestion: "Tighten output" },
      { pass: true, score: 0.9, issues: [] },
    ];

    const result = await runAgentLoop("write this", ["test-skill"], baseOptions);

    expect(result.stopReason).toBe("quality_passed");
    expect(result.iterations).toBe(3);
    expect(result.subAgentPolicy.mode).toBe("subagent_recommended");
    expect(result.subAgentPolicy.reason).toBe("repeated_quality_repair");
    expect(result.subAgentPolicy.activeSubagents).toBe(0);
  });

  it("recommends sub-agent routing when inline context grows too large", async () => {
    const result = await runAgentLoop("x".repeat(25_000), ["test-skill"], baseOptions);

    expect(result.stopReason).toBe("quality_passed");
    expect(result.subAgentPolicy.mode).toBe("subagent_recommended");
    expect(result.subAgentPolicy.reason).toBe("context_soft_limit");
  });

  it("stops when the budget is reached", async () => {
    mockQualityResults = [
      { pass: false, score: 0.4, issues: ["Incomplete"] },
    ];

    const result = await runAgentLoop(
      "write this",
      ["test-skill"],
      { ...baseOptions, budget: 1 },
    );

    expect(result.stopReason).toBe("budget_exceeded");
    expect(result.iterations).toBe(2);
    expect(executeSkill).toHaveBeenCalledTimes(1);
  });

  it("returns skill_failed when execution fails", async () => {
    mockExecResults = [
      { success: false, skillId: "test-skill", type: "text", error: "boom", creditsUsed: 0 },
    ];

    const result = await runAgentLoop("write this", ["test-skill"], baseOptions);

    expect(result.stopReason).toBe("skill_failed");
    expect(result.sections[0].type).toBe("error");
  });

  it("stops with step_timeout when a skill execution does not settle", async () => {
    vi.useFakeTimers();
    try {
      mockExecNeverSettles = true;

      const pending = runAgentLoop("write this", ["test-skill"], baseOptions);
      await vi.advanceTimersByTimeAsync(45_000);
      const result = await pending;

      expect(result.stopReason).toBe("step_timeout");
      expect(result.sections[0].content).toBe("skill_step_timeout:test-skill");
    } finally {
      vi.useRealTimers();
    }
  });
});
