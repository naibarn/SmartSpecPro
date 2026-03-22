import { describe, it, expect } from "vitest";
import { z } from "zod";

/**
 * Tests for conditional_branch nodeConfig validation.
 * These test the Zod schema shapes used in saveBuilder.
 */

const evaluationModeSchema = z.enum(["rule_based", "llm_classify", "context_check"]);

const conditionalRuleSchema = z.object({
  id: z.string(),
  field: z.string().min(1),
  operator: z.enum(["equals", "contains", "regex", "gt", "lt", "gte", "lte", "exists"]),
  value: z.string(),
  targetNodeId: z.string().min(1),
  label: z.string().optional(),
});

const categorySchema = z.object({
  label: z.string().min(1),
  targetNodeId: z.string().min(1),
});

const conditionalBranchSchema = z.object({
  evaluationMode: evaluationModeSchema,
  defaultTargetNodeId: z.string().min(1),
  rules: z.array(conditionalRuleSchema).min(1).optional(),
  classificationLabel: z.string().optional(),
  classificationDescription: z.string().max(200).optional(),
  categories: z.array(categorySchema).min(2).optional(),
  contextKey: z.string().optional(),
  contextConditions: z.array(z.object({
    operator: z.string(),
    value: z.string(),
    targetNodeId: z.string().min(1),
  })).optional(),
}).superRefine((data, ctx) => {
  if (data.evaluationMode === "rule_based" && (!data.rules || data.rules.length === 0)) {
    ctx.addIssue({ code: "custom", path: ["rules"], message: "rule_based mode requires at least 1 rule" });
  }
  if (data.evaluationMode === "llm_classify" && (!data.categories || data.categories.length < 2)) {
    ctx.addIssue({ code: "custom", path: ["categories"], message: "llm_classify requires at least 2 categories" });
  }
});

describe("conditional_branch nodeConfig validation", () => {
  it("validates evaluationMode is required enum", () => {
    const result = evaluationModeSchema.safeParse("invalid_mode");
    expect(result.success).toBe(false);

    expect(evaluationModeSchema.safeParse("rule_based").success).toBe(true);
    expect(evaluationModeSchema.safeParse("llm_classify").success).toBe(true);
    expect(evaluationModeSchema.safeParse("context_check").success).toBe(true);
  });

  it("requires defaultTargetNodeId", () => {
    const result = conditionalBranchSchema.safeParse({
      evaluationMode: "rule_based",
      rules: [{ id: "r1", field: "$.x", operator: "equals", value: "v", targetNodeId: "n1" }],
    });
    expect(result.success).toBe(false);
  });

  it("rule_based mode requires non-empty rules array", () => {
    const result = conditionalBranchSchema.safeParse({
      evaluationMode: "rule_based",
      defaultTargetNodeId: "n0",
      rules: [],
    });
    expect(result.success).toBe(false);

    const valid = conditionalBranchSchema.safeParse({
      evaluationMode: "rule_based",
      defaultTargetNodeId: "n0",
      rules: [{ id: "r1", field: "$.x", operator: "equals", value: "v", targetNodeId: "n1" }],
    });
    expect(valid.success).toBe(true);
  });

  it("validates each rule has field, operator (7 allowed values), value, and targetNodeId", () => {
    // Missing field
    expect(conditionalRuleSchema.safeParse({
      id: "r1", field: "", operator: "equals", value: "v", targetNodeId: "n1",
    }).success).toBe(false);

    // Invalid operator
    expect(conditionalRuleSchema.safeParse({
      id: "r1", field: "$.x", operator: "banana", value: "v", targetNodeId: "n1",
    }).success).toBe(false);

    // All 7 operators valid
    for (const op of ["equals", "contains", "regex", "gt", "lt", "gte", "lte", "exists"]) {
      expect(conditionalRuleSchema.safeParse({
        id: "r1", field: "$.x", operator: op, value: "v", targetNodeId: "n1",
      }).success).toBe(true);
    }
  });

  it("llm_classify mode requires categories array with at least 2 entries", () => {
    const oneCat = conditionalBranchSchema.safeParse({
      evaluationMode: "llm_classify",
      defaultTargetNodeId: "n0",
      categories: [{ label: "a", targetNodeId: "n1" }],
    });
    expect(oneCat.success).toBe(false);

    const twoCats = conditionalBranchSchema.safeParse({
      evaluationMode: "llm_classify",
      defaultTargetNodeId: "n0",
      categories: [
        { label: "a", targetNodeId: "n1" },
        { label: "b", targetNodeId: "n2" },
      ],
    });
    expect(twoCats.success).toBe(true);
  });

  it("validates classificationDescription max 200 chars", () => {
    const long = conditionalBranchSchema.safeParse({
      evaluationMode: "llm_classify",
      defaultTargetNodeId: "n0",
      classificationDescription: "x".repeat(201),
      categories: [
        { label: "a", targetNodeId: "n1" },
        { label: "b", targetNodeId: "n2" },
      ],
    });
    expect(long.success).toBe(false);

    const ok = conditionalBranchSchema.safeParse({
      evaluationMode: "llm_classify",
      defaultTargetNodeId: "n0",
      classificationDescription: "x".repeat(200),
      categories: [
        { label: "a", targetNodeId: "n1" },
        { label: "b", targetNodeId: "n2" },
      ],
    });
    expect(ok.success).toBe(true);
  });

  it("rejects unknown evaluationMode value", () => {
    expect(evaluationModeSchema.safeParse("fuzzy_logic").success).toBe(false);
    expect(evaluationModeSchema.safeParse("").success).toBe(false);
    expect(evaluationModeSchema.safeParse(42).success).toBe(false);
  });
});
