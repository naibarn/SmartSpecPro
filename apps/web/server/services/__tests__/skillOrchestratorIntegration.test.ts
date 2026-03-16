/**
 * Integration Tests for Skill Orchestrator (Feature 045, Section 12)
 *
 * These tests verify cross-service wiring: classifier -> extractor -> executor -> merger.
 * LLM provider calls and skill execution are mocked at the boundary.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock state ─────────────────────────────────────────────────────────────

let mockFeatureFlag = true;
let mockMaxLevel: string | null = "complex";
let mockClassification: any = null;
let mockExtraction: any = null;
let mockSkillDef: any = null;
let mockExecResult: any = null;
let mockHasCredits = true;

// ─── Boundary mocks ────────────────────────────────────────────────────────

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
}));

const mockAuditLog = vi.fn();
vi.mock("../auditLogger", () => ({
  auditLogger: { log: (...args: any[]) => mockAuditLog(...args) },
}));

vi.mock("../traceContext", () => ({
  runWithTrace: vi.fn((traceId: string, userId: number, fn: Function) => fn()),
  getTraceId: vi.fn(() => "test-trace"),
}));

// ─── Imports ────────────────────────────────────────────────────────────────

import { orchestrateSkill } from "../skillOrchestrator";
import { classifyIntent } from "../skillIntentClassifier";
import { executeSkill } from "../skillExecutor";

const baseOptions = {
  userId: 1,
  tenantId: "test-tenant",
  conversationId: 100,
  userToken: "test-token",
  budget: 50,
};

// ─── Integration Tests ──────────────────────────────────────────────────────

describe("Orchestrator Integration: SIMPLE flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatureFlag = true;
    mockMaxLevel = "complex";
    mockClassification = {
      level: "simple",
      strategy: "single",
      skills: [{
        skillId: "food-grocery-reviewer",
        confidence: 0.92,
        reason: "User wants a food review",
        extractedParams: { topic: "มาม่า" },
        missingRequiredParams: [],
      }],
      reasoning: "Food review request",
    };
    mockExtraction = {
      params: { topic: "มาม่า", review_angle: "taste" },
      missingRequired: [],
      confidence: 0.9,
      needsConfirmation: false,
    };
    mockSkillDef = { id: "food-grocery-reviewer", name: "Food Reviewer", type: "prompt-enhancement" };
    mockExecResult = {
      success: true,
      skillId: "food-grocery-reviewer",
      type: "text",
      message: "รีวิวมาม่ารสต้มยำ...",
      creditsUsed: 2,
    };
    mockHasCredits = true;
  });

  it("routes user message through classifier -> param extraction -> skill execution -> response", async () => {
    const result = await orchestrateSkill("รีวิวมาม่า", baseOptions);

    expect(result).not.toBeNull();
    if (result && "orchestrationLevel" in result) {
      expect(result.orchestrationLevel).toBe("simple");
      expect(result.sections).toHaveLength(1);
      expect(result.sections[0].content).toContain("มาม่า");
      expect(result.traceId).toBeTruthy();
    }

    expect(classifyIntent).toHaveBeenCalledWith(
      "รีวิวมาม่า",
      baseOptions.userId,
      baseOptions.tenantId,
      baseOptions.conversationId,
      expect.any(String),
    );
    expect(executeSkill).toHaveBeenCalled();
  });

  it("returns null when classifier returns null (timeout/error)", async () => {
    mockClassification = null;

    const result = await orchestrateSkill("test", baseOptions);

    expect(result).toBeNull();
  });

  it("returns confirmation when extraction needs confirmation", async () => {
    mockExtraction = {
      params: { topic: "มาม่า" },
      missingRequired: ["review_angle"],
      confidence: 0.6,
      needsConfirmation: true,
    };

    const result = await orchestrateSkill("รีวิวมาม่า", baseOptions);

    expect(result).not.toBeNull();
    if (result && "type" in result) {
      expect(result.type).toBe("orchestration_confirm");
      expect(result.missingFields).toContain("review_angle");
    }
  });
});

describe("Orchestrator Integration: Feature flag toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSkillDef = { id: "test", name: "Test", type: "prompt-enhancement" };
    mockExecResult = { success: true, type: "text", message: "ok", creditsUsed: 1 };
    mockHasCredits = true;
  });

  it("returns null when skillOrchestrator is false", async () => {
    mockFeatureFlag = false;

    const result = await orchestrateSkill("test", baseOptions);

    expect(result).toBeNull();
    expect(classifyIntent).not.toHaveBeenCalled();
  });

  it("caps orchestration level to tenant maxLevel", async () => {
    mockFeatureFlag = true;
    mockMaxLevel = "simple";
    mockClassification = {
      level: "compound",
      strategy: "sequential",
      skills: [
        { skillId: "s1", confidence: 0.9, reason: "a", extractedParams: {}, missingRequiredParams: [] },
        { skillId: "s2", confidence: 0.8, reason: "b", extractedParams: {}, missingRequiredParams: [] },
      ],
      reasoning: "compound",
    };
    mockExtraction = { params: {}, missingRequired: [], confidence: 0.9, needsConfirmation: false };

    const result = await orchestrateSkill("test", baseOptions);

    if (result && "orchestrationLevel" in result) {
      expect(result.orchestrationLevel).toBe("simple");
    }
  });

  it("returns null when maxLevel is disabled", async () => {
    mockFeatureFlag = true;
    mockMaxLevel = "disabled";

    const result = await orchestrateSkill("test", baseOptions);

    expect(result).toBeNull();
  });
});

describe("Orchestrator Integration: Credit checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatureFlag = true;
    mockMaxLevel = "simple";
    mockClassification = {
      level: "simple",
      strategy: "single",
      skills: [{ skillId: "s1", confidence: 0.9, reason: "ok", extractedParams: {}, missingRequiredParams: [] }],
      reasoning: "test",
    };
    mockExtraction = { params: { topic: "test" }, missingRequired: [], confidence: 0.9, needsConfirmation: false };
    mockSkillDef = { id: "s1", name: "Test", type: "prompt-enhancement" };
  });

  it("rejects when insufficient credits", async () => {
    mockHasCredits = false;

    const result = await orchestrateSkill("test", baseOptions);

    expect(result).not.toBeNull();
    if (result && "error" in result) {
      expect(result.error?.code).toBe("insufficient_credits");
    }
    expect(executeSkill).not.toHaveBeenCalled();
  });
});

describe("Orchestrator Integration: Error resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatureFlag = true;
    mockMaxLevel = "simple";
    mockHasCredits = true;
  });

  it("never throws — returns null on unexpected error", async () => {
    (classifyIntent as any).mockRejectedValueOnce(new Error("unexpected"));

    const result = await orchestrateSkill("test", baseOptions);

    expect(result).toBeNull();
  });

  it("returns error when skill not found", async () => {
    mockClassification = {
      level: "simple",
      strategy: "single",
      skills: [{ skillId: "nonexistent", confidence: 0.9, reason: "ok", extractedParams: {}, missingRequiredParams: [] }],
      reasoning: "test",
    };
    mockExtraction = { params: {}, missingRequired: [], confidence: 0.9, needsConfirmation: false };
    mockSkillDef = null;

    const result = await orchestrateSkill("test", baseOptions);

    if (result && "error" in result) {
      expect(result.error?.code).toBe("skill_not_found");
    }
  });
});
