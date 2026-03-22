import { describe, it, expect } from "vitest";
import { z } from "zod";

const exitConditionSchema = z.object({
  mode: z.enum(["max_iterations", "rule_based", "llm_evaluate", "context_check"]),
  maxIterations: z.number().int().min(1).max(20),
  rules: z.array(z.object({
    field: z.string(),
    operator: z.enum(["equals", "contains", "regex", "gt", "lt", "gte", "lte", "exists"]),
    value: z.union([z.string(), z.number()]).optional(),
  })).optional(),
  evaluationPrompt: z.string().max(500).optional(),
  contextKey: z.string().max(100).optional(),
});

const loopRetrySchema = z.object({
  loopTargetNodeId: z.string().min(1),
  exitCondition: exitConditionSchema,
  feedbackMode: z.enum(["auto", "custom_prompt"]).default("auto"),
  feedbackPrompt: z.string().max(500).optional(),
  delayBetweenIterationsMs: z.number().int().min(0).max(30000).default(0),
  timeoutMs: z.number().int().min(1000).max(600000).default(300000),
});

const validConfig = {
  loopTargetNodeId: "node-123",
  exitCondition: { mode: "max_iterations" as const, maxIterations: 5 },
};

describe("loop_retry nodeConfig validation", () => {
  it("valid config passes", () => {
    expect(loopRetrySchema.safeParse(validConfig).success).toBe(true);
  });

  it("rejects maxIterations > 20", () => {
    const result = loopRetrySchema.safeParse({
      ...validConfig,
      exitCondition: { mode: "max_iterations", maxIterations: 50 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects timeoutMs > 600000", () => {
    const result = loopRetrySchema.safeParse({
      ...validConfig,
      timeoutMs: 1_000_000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects without loopTargetNodeId", () => {
    const result = loopRetrySchema.safeParse({
      exitCondition: { mode: "max_iterations", maxIterations: 5 },
    });
    expect(result.success).toBe(false);
  });

  it("validates evaluationPrompt max length 500", () => {
    const long = loopRetrySchema.safeParse({
      ...validConfig,
      exitCondition: {
        mode: "llm_evaluate",
        maxIterations: 5,
        evaluationPrompt: "x".repeat(501),
      },
    });
    expect(long.success).toBe(false);

    const ok = loopRetrySchema.safeParse({
      ...validConfig,
      exitCondition: {
        mode: "llm_evaluate",
        maxIterations: 5,
        evaluationPrompt: "x".repeat(500),
      },
    });
    expect(ok.success).toBe(true);
  });

  it("validates feedbackPrompt max length 500", () => {
    const long = loopRetrySchema.safeParse({
      ...validConfig,
      feedbackPrompt: "x".repeat(501),
    });
    expect(long.success).toBe(false);
  });
});
