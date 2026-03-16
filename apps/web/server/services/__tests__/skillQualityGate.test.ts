import { describe, it, expect, vi, beforeEach } from "vitest";

let mockLLMResult: any = null;
let mockLLMError: Error | null = null;

vi.mock("../callLLMStructured", () => ({
  callLLMStructured: vi.fn(async () => {
    if (mockLLMError) throw mockLLMError;
    return mockLLMResult;
  }),
}));

vi.mock("../auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

import { validateQuality } from "../skillQualityGate";
import type { OrchestrationResult } from "@shared/orchestration/types";

const mockResult: OrchestrationResult = {
  sections: [{ skillId: "s1", type: "text", content: "Result text", metadata: { creditsUsed: 5, durationMs: 100 } }],
  totalCreditsUsed: 5,
  totalDurationMs: 100,
  traceId: "t1",
  orchestrationLevel: "simple",
  classificationLatencyMs: 50,
};

describe("validateQuality", () => {
  beforeEach(() => {
    mockLLMResult = {
      data: { pass: true, score: 0.9, issues: [], suggestion: null },
      tokensUsed: 40,
      creditsUsed: 1,
    };
    mockLLMError = null;
  });

  it("skips gate when not enabled", async () => {
    const result = await validateQuality(mockResult, "test", { tenantId: "t1", traceId: "tr1" });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it("passes when LLM evaluation passes", async () => {
    const result = await validateQuality(mockResult, "test", {
      tenantId: "t1",
      traceId: "tr1",
      forceQualityGate: true,
    });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(0.9);
  });

  it("fails when LLM returns low score", async () => {
    mockLLMResult = {
      data: { pass: false, score: 0.4, issues: ["Incomplete"], suggestion: "Add more detail" },
      tokensUsed: 40,
      creditsUsed: 1,
    };

    const result = await validateQuality(mockResult, "test", {
      tenantId: "t1",
      traceId: "tr1",
      forceQualityGate: true,
    });
    expect(result.pass).toBe(false);
    expect(result.issues).toContain("Incomplete");
    expect(result.suggestion).toBe("Add more detail");
  });

  it("defaults to pass on LLM failure", async () => {
    mockLLMError = new Error("timeout");

    const result = await validateQuality(mockResult, "test", {
      tenantId: "t1",
      traceId: "tr1",
      forceQualityGate: true,
    });
    expect(result.pass).toBe(true);
  });

  it("runs when maxLevel is complex", async () => {
    const { callLLMStructured } = await import("../callLLMStructured");
    (callLLMStructured as any).mockClear();

    await validateQuality(mockResult, "test", {
      tenantId: "t1",
      traceId: "tr1",
      maxLevel: "complex",
    });

    expect(callLLMStructured).toHaveBeenCalled();
  });
});
