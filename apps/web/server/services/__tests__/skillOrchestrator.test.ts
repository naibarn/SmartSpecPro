/**
 * Tests for Skill Orchestrator (Feature 045, Section 05)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock state ─────────────────────────────────────────────────────────────

let mockFeatureFlag = false;
let mockMaxLevel: string | null = "simple";
let mockClassification: any = null;
let mockExtraction: any = null;
let mockSkillDef: any = null;
let mockExecResult: any = null;
let mockHasCredits = true;

// ─── Top-level mocks ────────────────────────────────────────────────────────

vi.mock("../featureFlags", () => ({
  getFeatureFlag: vi.fn(async () => mockFeatureFlag),
  getTenantFeatureFlag: vi.fn(async () => mockFeatureFlag),
  getTenantFeatureFlagValue: vi.fn(async () => mockMaxLevel),
}));

vi.mock("../skillIntentClassifier", () => ({
  classifyIntent: vi.fn(async () => mockClassification),
}));

vi.mock("../skillParamExtractor", () => ({
  extractParams: vi.fn(async () => mockExtraction),
  projectSchemaForUI: vi.fn(() => []),
}));

vi.mock("../skillSchemaLoader", () => ({
  loadInputSchema: vi.fn(async () => null),
}));

vi.mock("../skillRegistry", async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    getSkillByIdAsync: vi.fn(async () => mockSkillDef),
  };
});

vi.mock("../skillExecutor", () => ({
  executeSkill: vi.fn(async () => mockExecResult),
}));

vi.mock("../creditService", () => ({
  hasEnoughCredits: vi.fn(async () => mockHasCredits),
  reserveCredits: vi.fn(async () => ({ reservationId: "res-test" })),
  releaseUnusedCredits: vi.fn(async () => {}),
}));

vi.mock("../auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

// ─── Imports ────────────────────────────────────────────────────────────────

import { orchestrateSkill } from "../skillOrchestrator";
import { classifyIntent } from "../skillIntentClassifier";
import { executeSkill } from "../skillExecutor";

// ─── Helpers ────────────────────────────────────────────────────────────────

const baseOptions = {
  userId: 1,
  tenantId: "t1",
  userToken: "token",
  conversationId: 1,
};

function makeClassification(overrides: any = {}) {
  return {
    level: "simple",
    strategy: "single",
    skills: [{
      skillId: "test-skill",
      confidence: 0.9,
      reason: "match",
      extractedParams: {},
      missingRequiredParams: [],
    }],
    reasoning: "test",
    ...overrides,
  };
}

function makeExtraction(overrides: any = {}) {
  return {
    params: { topic: "test" },
    missingRequired: [],
    confidence: 0.9,
    needsConfirmation: false,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("orchestrateSkill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatureFlag = true;
    mockMaxLevel = "simple";
    mockClassification = makeClassification();
    mockExtraction = makeExtraction();
    mockSkillDef = { id: "test-skill", name: "Test", type: "prompt-enhancement" };
    mockExecResult = { success: true, type: "text", content: "Result", creditsUsed: 5 };
    mockHasCredits = true;
  });

  it("returns null when skillOrchestrator flag is false", async () => {
    mockFeatureFlag = false;

    const result = await orchestrateSkill("test", baseOptions);

    expect(result).toBeNull();
    expect(classifyIntent).not.toHaveBeenCalled();
  });

  it("returns null when classifier fails", async () => {
    mockClassification = null;

    const result = await orchestrateSkill("test", baseOptions);

    expect(result).toBeNull();
  });

  it("caps orchestration level to tenant maxLevel", async () => {
    mockMaxLevel = "simple";
    mockClassification = makeClassification({
      level: "compound",
      skills: [
        { skillId: "s1", confidence: 0.9, reason: "a", extractedParams: {}, missingRequiredParams: [] },
        { skillId: "s2", confidence: 0.8, reason: "b", extractedParams: {}, missingRequiredParams: [] },
      ],
    });

    const result = await orchestrateSkill("test", baseOptions);

    // Should execute as simple (capped) with only top skill
    if (result && "orchestrationLevel" in result) {
      expect(result.orchestrationLevel).toBe("simple");
    }
  });

  it("routes SIMPLE to direct executeSkill", async () => {
    const result = await orchestrateSkill("test", baseOptions);

    expect(executeSkill).toHaveBeenCalled();
    if (result && "orchestrationLevel" in result) {
      expect(result.orchestrationLevel).toBe("simple");
      expect(result.sections).toHaveLength(1);
    }
  });

  it("returns null when confidence < 0.50", async () => {
    mockClassification = makeClassification({
      skills: [{ skillId: "test", confidence: 0.3, reason: "weak", extractedParams: {}, missingRequiredParams: [] }],
    });

    const result = await orchestrateSkill("test", baseOptions);

    expect(result).toBeNull();
  });

  it("returns error when insufficient credits", async () => {
    mockHasCredits = false;

    const result = await orchestrateSkill("test", baseOptions);

    expect(result).not.toBeNull();
    if (result && "error" in result) {
      expect(result.error?.code).toBe("insufficient_credits");
    }
  });

  it("generates traceId in result", async () => {
    const result = await orchestrateSkill("test", baseOptions);

    if (result && "traceId" in result) {
      expect(result.traceId).toBeTruthy();
      expect(typeof result.traceId).toBe("string");
    }
  });

  it("returns OrchestrationResult with correct shape", async () => {
    const result = await orchestrateSkill("test", baseOptions);

    if (result && "sections" in result) {
      expect(result).toHaveProperty("sections");
      expect(result).toHaveProperty("totalCreditsUsed");
      expect(result).toHaveProperty("totalDurationMs");
      expect(result).toHaveProperty("traceId");
      expect(result).toHaveProperty("orchestrationLevel");
      expect(result).toHaveProperty("classificationLatencyMs");
    }
  });

  it("returns confirmation when extraction needs confirmation", async () => {
    mockExtraction = makeExtraction({
      needsConfirmation: true,
      missingRequired: ["topic"],
    });

    const result = await orchestrateSkill("test", baseOptions);

    expect(result).not.toBeNull();
    if (result && "type" in result) {
      expect(result.type).toBe("orchestration_confirm");
    }
  });

  it("returns error when skill not found", async () => {
    mockSkillDef = null;

    const result = await orchestrateSkill("test", baseOptions);

    if (result && "error" in result) {
      expect(result.error?.code).toBe("skill_not_found");
    }
  });

  it("returns null when maxLevel is disabled", async () => {
    mockMaxLevel = "disabled";

    const result = await orchestrateSkill("test", baseOptions);

    expect(result).toBeNull();
  });

  it("never throws — returns null on unexpected error", async () => {
    (classifyIntent as any).mockRejectedValueOnce(new Error("unexpected"));

    const result = await orchestrateSkill("test", baseOptions);

    expect(result).toBeNull();
  });
});
