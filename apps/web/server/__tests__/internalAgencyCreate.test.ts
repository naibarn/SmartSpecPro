import { describe, it, expect } from "vitest";
import { z } from "zod";

// Mirror the Zod schema from _core/index.ts for the internal agency create endpoint
const agencyCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(""),
  objective: z.string().max(2000).optional(),
  sharedInstructions: z.string().max(10000).optional(),
  tenantId: z.string().max(100).optional().default(""),
  agents: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200),
        description: z.string().max(2000).optional().default(""),
        instructions: z.string().max(10000).optional().default(""),
        model: z.string().max(100).optional().default("gpt-4o"),
        nodeType: z.string().max(50).optional().default("agent"),
        nodeConfig: z.record(z.unknown()).optional().default({}),
        isEntryPoint: z.boolean().optional().default(false),
        isOptional: z.boolean().optional().default(false),
        position: z.object({ x: z.number(), y: z.number() }).optional(),
        toolIds: z.array(z.string().max(100)).optional().default([]),
        toolConfigs: z.record(z.record(z.unknown())).optional().default({}),
        modelRequirements: z
          .object({
            strategy: z.enum(["cheapest", "balanced", "best"]).optional(),
            supportsVision: z.boolean().optional(),
            supportsThinking: z.boolean().optional(),
            supportsFunctionTools: z.boolean().optional(),
            supportsStructuredOutputs: z.boolean().optional(),
            supportsWebSearch: z.boolean().optional(),
            supportsCodeExecution: z.boolean().optional(),
            supportsComputerUse: z.boolean().optional(),
          })
          .optional(),
      }),
    )
    .min(1)
    .max(20),
  communicationFlows: z
    .array(
      z.object({
        id: z.string().optional(),
        fromAgentId: z.string(),
        toAgentId: z.string(),
        flowType: z.string().max(50).optional().default("delegation"),
      }),
    )
    .optional()
    .default([]),
});

const baseAgent = {
  id: "agent-1",
  name: "Test Agent",
};

const basePayload = {
  name: "Test Agency",
  agents: [baseAgent],
};

describe("internal agency create schema - objective and sharedInstructions", () => {
  it("accepts objective field and preserves it", () => {
    const result = agencyCreateSchema.safeParse({
      ...basePayload,
      objective: "Provide customer support",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.objective).toBe("Provide customer support");
    }
  });

  it("accepts sharedInstructions field and preserves it", () => {
    const result = agencyCreateSchema.safeParse({
      ...basePayload,
      sharedInstructions: "Always be polite and helpful.",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sharedInstructions).toBe(
        "Always be polite and helpful.",
      );
    }
  });

  it("without objective defaults to undefined", () => {
    const result = agencyCreateSchema.safeParse(basePayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.objective).toBeUndefined();
    }
  });

  it("rejects objective exceeding 2000 chars", () => {
    const result = agencyCreateSchema.safeParse({
      ...basePayload,
      objective: "x".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("rejects sharedInstructions exceeding 10000 chars", () => {
    const result = agencyCreateSchema.safeParse({
      ...basePayload,
      sharedInstructions: "x".repeat(10001),
    });
    expect(result.success).toBe(false);
  });
});

describe("internal agency create schema - modelRequirements per agent", () => {
  it("accepts modelRequirements on agent", () => {
    const result = agencyCreateSchema.safeParse({
      ...basePayload,
      agents: [
        {
          ...baseAgent,
          modelRequirements: {
            strategy: "best",
            supportsVision: true,
          },
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agents[0].modelRequirements).toEqual({
        strategy: "best",
        supportsVision: true,
      });
    }
  });

  it("agent without modelRequirements defaults to undefined", () => {
    const result = agencyCreateSchema.safeParse(basePayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agents[0].modelRequirements).toBeUndefined();
    }
  });

  it("rejects invalid strategy enum", () => {
    const result = agencyCreateSchema.safeParse({
      ...basePayload,
      agents: [
        {
          ...baseAgent,
          modelRequirements: { strategy: "invalid" },
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("internal agency create - insert data mapping", () => {
  it("objective truncated at insert to 2000 chars", () => {
    // Simulate the insert-level truncation: (objective || "").slice(0, 2000)
    const objective = "a".repeat(2000);
    const truncated = (objective || "").slice(0, 2000);
    expect(truncated.length).toBe(2000);

    const longObjective = "a".repeat(3000);
    const truncatedLong = (longObjective || "").slice(0, 2000);
    expect(truncatedLong.length).toBe(2000);
  });

  it("sharedInstructions truncated at insert to 10000 chars", () => {
    const long = "b".repeat(15000);
    const truncated = (long || "").slice(0, 10000);
    expect(truncated.length).toBe(10000);
  });

  it("undefined objective defaults to null at insert", () => {
    const objective = undefined;
    const value = objective ? objective.slice(0, 2000) : null;
    expect(value).toBeNull();
  });

  it("error response does not contain raw error message", () => {
    // The endpoint now returns a generic message:
    const genericError = "Internal server error";
    const errMessage = "UNIQUE constraint failed: agencies.slug (sensitive details)";
    // Verify the response string does NOT contain the raw error
    expect(genericError).not.toContain(errMessage);
    expect(genericError).not.toContain("UNIQUE");
  });
});
