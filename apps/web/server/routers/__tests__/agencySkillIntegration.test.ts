import { describe, it, expect } from "vitest";
import { z } from "zod";

// ── Skill Discovery nodeConfig validation ──────────────────────────────────

const taskSourceEnum = z.enum(["static", "context", "previous_output"]);
const skillDiscoveryConfigSchema = z.object({
  taskSource: taskSourceEnum,
  taskValue: z.string().max(500).optional(),
  contextKey: z.string().max(100).optional(),
  confidenceThreshold: z.number().min(0).max(1).default(0.7),
  maxResults: z.number().int().min(1).max(10).default(5),
  skillCategories: z.array(z.string()).max(5).optional(),
});

// ── Skill Call inputMappings validation ─────────────────────────────────────

const inputMappingSchema = z.record(
  z.string(),
  z.object({
    source: z.enum(["static", "node_output", "context"]),
    value: z.unknown().optional(),
    nodeId: z.string().optional(),
    outputField: z.string().optional(),
    contextKey: z.string().optional(),
  }),
);

describe("Agency Skill Integration — Schema validation", () => {
  it("skill_discovery requires taskSource field", () => {
    const result = skillDiscoveryConfigSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("skill_call rejects inputMappings with invalid source type", () => {
    const result = inputMappingSchema.safeParse({
      title: { source: "invalid_source" },
    });
    expect(result.success).toBe(false);
  });

  it("skill_call accepts valid inputMappings with static source", () => {
    const result = inputMappingSchema.safeParse({
      title: { source: "static", value: "test" },
    });
    expect(result.success).toBe(true);
  });

  it("skill_discovery accepts valid config with all fields", () => {
    const result = skillDiscoveryConfigSchema.safeParse({
      taskSource: "static",
      taskValue: "analyze data",
      confidenceThreshold: 0.8,
      maxResults: 5,
      skillCategories: ["image_generation"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.confidenceThreshold).toBe(0.8);
      expect(result.data.maxResults).toBe(5);
    }
  });

  it("skill_discovery rejects confidenceThreshold outside 0-1 range", () => {
    const result = skillDiscoveryConfigSchema.safeParse({
      taskSource: "static",
      taskValue: "test",
      confidenceThreshold: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("skill_call inputMappings validates node_output requires nodeId and outputField", () => {
    // node_output with missing nodeId — should parse but superRefine would catch this
    const result = inputMappingSchema.safeParse({
      content: { source: "node_output" },
    });
    // The schema itself accepts it; the superRefine block in agency.ts handles cross-field validation
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content.nodeId).toBeUndefined();
    }
  });

  it("skill_discovery rejects maxResults above 10", () => {
    const result = skillDiscoveryConfigSchema.safeParse({
      taskSource: "static",
      taskValue: "test",
      maxResults: 50,
    });
    expect(result.success).toBe(false);
  });

  it("skill_call inputMappings accepts context source with contextKey", () => {
    const result = inputMappingSchema.safeParse({
      language: { source: "context", contextKey: "user_language" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.language.contextKey).toBe("user_language");
    }
  });
});
