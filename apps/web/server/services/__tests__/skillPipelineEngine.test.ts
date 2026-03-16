/**
 * Tests for Skill Pipeline Engine (Feature 045, Section 06)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock state ─────────────────────────────────────────────────────────────

let mockExecResults: any[] = [];
let mockExecCallIdx = 0;
let mockSkillDef: any = { id: "test", name: "Test", type: "prompt-enhancement" };

vi.mock("../skillExecutor", () => ({
  executeSkill: vi.fn(async () => {
    const result = mockExecResults[mockExecCallIdx] ?? mockExecResults[0];
    mockExecCallIdx++;
    return result;
  }),
}));

vi.mock("../skillRegistry", async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    getSkillByIdAsync: vi.fn(async () => mockSkillDef),
  };
});

vi.mock("../skillParamExtractor", () => ({
  resolvePromptField: vi.fn(() => "prompt"),
}));

// ─── Imports ────────────────────────────────────────────────────────────────

import { executePipeline, resolveInputMapping } from "../skillPipelineEngine";
import { executeSkill } from "../skillExecutor";
import type { PipelineStep } from "@shared/orchestration/types";

const baseOptions = { userId: 1, tenantId: "t1", userToken: "tok", traceId: "trace-1" };

function makeStep(overrides: Partial<PipelineStep> = {}): PipelineStep {
  return {
    id: overrides.id ?? "step1",
    skillId: overrides.skillId ?? "test-skill",
    params: overrides.params ?? { prompt: "test" },
    dependsOn: overrides.dependsOn ?? [],
    inputMapping: overrides.inputMapping ?? {},
    errorStrategy: overrides.errorStrategy ?? "fail-fast",
  };
}

describe("executePipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecCallIdx = 0;
    mockExecResults = [{ success: true, type: "text", message: "result", creditsUsed: 5 }];
    mockSkillDef = { id: "test", name: "Test", type: "prompt-enhancement" };
  });

  it("executes single-step pipeline successfully", async () => {
    const result = await executePipeline([makeStep()], baseOptions);

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].status).toBe("completed");
    expect(result.totalCreditsUsed).toBe(5);
  });

  it("executes 2-step sequential pipeline", async () => {
    mockExecResults = [
      { success: true, type: "text", message: "first", creditsUsed: 3 },
      { success: true, type: "text", message: "second", creditsUsed: 2 },
    ];

    const steps = [
      makeStep({ id: "step1" }),
      makeStep({ id: "step2", dependsOn: ["step1"] }),
    ];

    const result = await executePipeline(steps, baseOptions);

    expect(result.steps).toHaveLength(2);
    expect(result.steps.every((s) => s.status === "completed")).toBe(true);
    expect(result.totalCreditsUsed).toBe(5);
  });

  it("executes 2-step parallel pipeline", async () => {
    mockExecResults = [
      { success: true, type: "text", message: "a", creditsUsed: 2 },
      { success: true, type: "text", message: "b", creditsUsed: 3 },
    ];

    const steps = [
      makeStep({ id: "step1" }),
      makeStep({ id: "step2" }),
    ];

    const result = await executePipeline(steps, baseOptions);

    expect(result.steps).toHaveLength(2);
    expect(result.steps.every((s) => s.status === "completed")).toBe(true);
  });

  it("handles fail-fast error strategy", async () => {
    mockExecResults = [
      { success: false, error: "fail", creditsUsed: 0 },
    ];

    const steps = [
      makeStep({ id: "step1", errorStrategy: "fail-fast" }),
      makeStep({ id: "step2", dependsOn: ["step1"] }),
    ];

    const result = await executePipeline(steps, baseOptions);

    expect(result.steps.find((s) => s.stepId === "step1")!.status).toBe("failed");
    expect(result.steps.find((s) => s.stepId === "step2")!.status).toBe("skipped");
  });

  it("handles continue error strategy", async () => {
    mockExecResults = [
      { success: false, error: "fail", creditsUsed: 0 },
      { success: true, type: "text", message: "ok", creditsUsed: 5 },
    ];

    const steps = [
      makeStep({ id: "step1", errorStrategy: "continue" }),
      makeStep({ id: "step2" }), // No dependency on step1
    ];

    const result = await executePipeline(steps, baseOptions);

    expect(result.steps.find((s) => s.stepId === "step1")!.status).toBe("failed");
    expect(result.steps.find((s) => s.stepId === "step2")!.status).toBe("completed");
  });

  it("handles retry error strategy", async () => {
    mockExecResults = [
      { success: false, error: "temp fail", creditsUsed: 0 },
      { success: true, type: "text", message: "ok", creditsUsed: 5 },
    ];

    const steps = [makeStep({ id: "step1", errorStrategy: "retry" })];

    const result = await executePipeline(steps, baseOptions);

    expect(result.steps[0].status).toBe("completed");
    expect(executeSkill).toHaveBeenCalledTimes(2);
  });

  it("tracks credits per step and total", async () => {
    mockExecResults = [
      { success: true, type: "text", message: "a", creditsUsed: 5 },
      { success: true, type: "text", message: "b", creditsUsed: 3 },
    ];

    const steps = [makeStep({ id: "step1" }), makeStep({ id: "step2" })];

    const result = await executePipeline(steps, baseOptions);

    expect(result.totalCreditsUsed).toBe(8);
  });

  it("handles topological sort with mixed parallel + sequential", async () => {
    mockExecResults = [
      { success: true, type: "text", message: "a", creditsUsed: 1 },
      { success: true, type: "text", message: "b", creditsUsed: 1 },
      { success: true, type: "text", message: "c", creditsUsed: 1 },
    ];

    const steps = [
      makeStep({ id: "step1" }),
      makeStep({ id: "step2" }),
      makeStep({ id: "step3", dependsOn: ["step1", "step2"] }),
    ];

    const result = await executePipeline(steps, baseOptions);

    expect(result.steps.every((s) => s.status === "completed")).toBe(true);
    // step3 should be last
    const step3Idx = result.steps.findIndex((s) => s.stepId === "step3");
    expect(step3Idx).toBe(2);
  });

  it("returns empty result for empty steps", async () => {
    const result = await executePipeline([], baseOptions);

    expect(result.steps).toEqual([]);
    expect(result.totalCreditsUsed).toBe(0);
  });

  it("throws on too many steps", async () => {
    const steps = Array.from({ length: 11 }, (_, i) => makeStep({ id: `s${i}` }));

    await expect(executePipeline(steps, baseOptions)).rejects.toThrow("exceeds maximum");
  });

  it("marks async step as pending_async when no dependents", async () => {
    mockExecResults = [{ success: true, isAsync: true, taskId: "task-123", creditsUsed: 0 }];

    const steps = [makeStep({ id: "step1" })];

    const result = await executePipeline(steps, baseOptions);

    expect(result.steps[0].status).toBe("pending_async");
  });
});

describe("resolveInputMapping", () => {
  it("resolves step content", () => {
    const results = new Map<string, any>();
    results.set("step1", { message: "hello", type: "text" });

    const resolved = resolveInputMapping({ content: "step1.content" }, results);

    expect(resolved.content).toBe("hello");
  });

  it("resolves step urls[0]", () => {
    const results = new Map<string, any>();
    results.set("step1", { resultUrls: ["url1", "url2"] });

    const resolved = resolveInputMapping({ img: "step1.urls[0]" }, results);

    expect(resolved.img).toBe("url1");
  });

  it("returns undefined for invalid path", () => {
    const results = new Map<string, any>();

    const resolved = resolveInputMapping({ x: "nonexistent.field" }, results);

    expect(resolved.x).toBeUndefined();
  });

  it("handles nested metadata access", () => {
    const results = new Map<string, any>();
    results.set("step1", { metadata: { title: "Test" } });

    const resolved = resolveInputMapping({ t: "step1.metadata.title" }, results);

    expect(resolved.t).toBe("Test");
  });

  it("treats non-dotted values as literals", () => {
    const results = new Map<string, any>();

    const resolved = resolveInputMapping({ lang: "en" }, results);

    expect(resolved.lang).toBe("en");
  });
});
