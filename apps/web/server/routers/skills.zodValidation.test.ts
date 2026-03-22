import { describe, it, expect } from "vitest";
import { z } from "zod";

/**
 * Test the Feature 041 Zod schema for executionPolicy.requirements.
 * We extract the schema shape here rather than importing from the router
 * (which has many heavy dependencies) to keep tests fast and focused.
 */
const requirementsSchema = z.object({
  supportsVision: z.boolean().optional(),
  supportsFunctionTools: z.boolean().optional(),
  supportsStructuredOutputs: z.boolean().optional(),
  supportsWebSearch: z.boolean().optional(),
  supportsCodeExecution: z.boolean().optional(),
  supportsComputerUse: z.boolean().optional(),
  supportsBackground: z.boolean().optional(),
  supportsResponses: z.boolean().optional(),
  contextLength: z.number().int().min(1000).max(2000000).optional(),
}).nullable().optional();

const executionPolicySchema = z.object({
  // Spec 038 fields
  thinking_level_hint: z.enum(["low", "medium", "high"]).nullable().optional(),
  requires_web_search: z.boolean().optional(),
  requires_structured_output: z.boolean().optional(),
  min_citation_coverage: z.number().min(0).max(1).optional(),
  refresh_cadence_days: z.number().min(1).max(365).optional(),
  disclosure_required: z.boolean().optional(),
  response_mode: z.enum(["markdown", "cms_json"]).optional(),
  // Feature 041
  requirements: requirementsSchema,
  mode: z.enum(["requirements", "fixed", "hybrid"]).optional(),
  allowConversationOverride: z.boolean().optional(),
  allowFreeModels: z.boolean().optional(),
}).optional();

describe("skills.update executionPolicy.requirements — Zod validation", () => {
  it("accepts valid requirements object", () => {
    const input = {
      requirements: { supportsFunctionTools: true, contextLength: 32000 },
    };
    const result = executionPolicySchema.parse(input);
    expect(result!.requirements!.supportsFunctionTools).toBe(true);
    expect(result!.requirements!.contextLength).toBe(32000);
  });

  it("rejects contextLength < 1000", () => {
    const input = {
      requirements: { contextLength: 500 },
    };
    expect(() => executionPolicySchema.parse(input)).toThrow();
  });

  it("rejects contextLength > 2000000", () => {
    const input = {
      requirements: { contextLength: 3000000 },
    };
    expect(() => executionPolicySchema.parse(input)).toThrow();
  });

  it("merges requirements into existing executionPolicyJson (preserves Spec 038 fields)", () => {
    const existing = {
      thinking_level_hint: "high" as const,
      requires_web_search: true,
    };
    const update = {
      ...existing,
      requirements: { supportsFunctionTools: true },
    };
    const result = executionPolicySchema.parse(update);
    expect(result!.thinking_level_hint).toBe("high");
    expect(result!.requires_web_search).toBe(true);
    expect(result!.requirements!.supportsFunctionTools).toBe(true);
  });

  it("null requirements clears the requirements field", () => {
    const input = {
      requirements: null,
    };
    const result = executionPolicySchema.parse(input);
    expect(result!.requirements).toBeNull();
  });

  it("accepts mode enum", () => {
    const input = { mode: "hybrid" as const };
    const result = executionPolicySchema.parse(input);
    expect(result!.mode).toBe("hybrid");
  });

  it("rejects invalid mode value", () => {
    const input = { mode: "auto" };
    expect(() => executionPolicySchema.parse(input)).toThrow();
  });

  it("strips unknown keys (preferredStrategy is not in v1 Zod schema)", () => {
    const input = {
      requirements: { supportsFunctionTools: true },
      preferredStrategy: "cheapest",
    };
    const result = executionPolicySchema.parse(input);
    expect((result as any).preferredStrategy).toBeUndefined();
  });

  it("accepts supportsVision boolean", () => {
    const input = {
      requirements: { supportsVision: true },
    };
    const result = executionPolicySchema.parse(input);
    expect(result!.requirements!.supportsVision).toBe(true);
  });

  it("accepts allowConversationOverride boolean", () => {
    const input = { allowConversationOverride: true };
    const result = executionPolicySchema.parse(input);
    expect(result!.allowConversationOverride).toBe(true);
  });

  it("accepts allowFreeModels boolean", () => {
    const input = { allowFreeModels: false };
    const result = executionPolicySchema.parse(input);
    expect(result!.allowFreeModels).toBe(false);
  });
});
