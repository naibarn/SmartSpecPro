import { describe, expect, it, vi, beforeEach } from "vitest";

import type { SkillDefinition } from "@smartspec/skills";
import { resolveSkillExecutionPolicy } from "./skillExecutionPolicy";

// Mock enabledLlmModels to avoid DB dependency
vi.mock("./enabledLlmModels", () => ({
  isFreeModelIdentifier: (value: string | null | undefined) => {
    const normalized = String(value ?? "").toLowerCase();
    return normalized.endsWith(":free") || normalized.endsWith("-free");
  },
  loadEnabledLlmModelRows: vi.fn(),
  resolveEnabledLlmModelIdFromRows: vi.fn(),
}));

vi.mock("./intelligentModelSelector", () => ({
  selectBestLlmModel: vi.fn(),
  describeRequirementsMatch: vi.fn(),
}));

import {
  loadEnabledLlmModelRows,
  resolveEnabledLlmModelIdFromRows,
} from "./enabledLlmModels";
import { selectBestLlmModel, describeRequirementsMatch } from "./intelligentModelSelector";

const mockLoadRows = vi.mocked(loadEnabledLlmModelRows);
const mockResolveFromRows = vi.mocked(resolveEnabledLlmModelIdFromRows);
const mockSelectBestLlmModel = vi.mocked(selectBestLlmModel);
const mockDescribeRequirementsMatch = vi.mocked(describeRequirementsMatch);

function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    id: "test-skill",
    name: "Test Skill",
    description: "A test skill",
    icon: "sparkles",
    type: "chat-assistant",
    triggers: [],
    requiresExplicit: false,
    creditMultiplier: 1,
    enabledByDefault: true,
    priority: 50,
    ...overrides,
  };
}

const fakeRows: any[] = [
  { providerName: "openai", modelId: "gpt-4o", providerModelId: "gpt-4o", defaultModel: "gpt-4o" },
];

describe("resolveSkillExecutionPolicy", () => {
  beforeEach(() => {
    mockLoadRows.mockReset();
    mockResolveFromRows.mockReset();
    mockSelectBestLlmModel.mockReset();
    mockDescribeRequirementsMatch.mockReset();
    mockLoadRows.mockResolvedValue(fakeRows);
    mockDescribeRequirementsMatch.mockReturnValue({ matched: [], missing: [] });
  });

  it("uses skill llmModelId first when available and enabled", async () => {
    mockResolveFromRows.mockImplementation(({ preferredModelIds }) => {
      const first = (preferredModelIds ?? [])[0];
      if (first === "skill-model") return "skill-model";
      if ((preferredModelIds ?? []).includes("skill-model")) return "skill-model";
      return null;
    });

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill({ llmModelId: "skill-model" }),
      conversationModel: "conv-model",
    });

    expect(result.modelId).toBe("skill-model");
    expect(result.modelSource).toBe("skill_llmModelId");
  });

  it("falls back to skill defaultModel when llmModelId is not set", async () => {
    mockResolveFromRows.mockImplementation(({ preferredModelIds }) => {
      const first = (preferredModelIds ?? [])[0];
      if (first === "default-model") return "default-model";
      if ((preferredModelIds ?? []).includes("default-model")) return "default-model";
      return null;
    });

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill({ defaultModel: "default-model" }),
      conversationModel: "conv-model",
    });

    expect(result.modelId).toBe("default-model");
    expect(result.modelSource).toBe("skill_defaultModel");
  });

  it("falls back to conversation model when skill has no model configured", async () => {
    mockResolveFromRows.mockImplementation(({ preferredModelIds }) => {
      const first = (preferredModelIds ?? [])[0];
      if (first === "conv-model") return "conv-model";
      if ((preferredModelIds ?? []).includes("conv-model")) return "conv-model";
      return null;
    });

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill(),
      conversationModel: "conv-model",
    });

    expect(result.modelId).toBe("conv-model");
    expect(result.modelSource).toBe("conversation");
  });

  it("falls back to system default when nothing else matches", async () => {
    mockResolveFromRows.mockReturnValue("system-default");

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill(),
      conversationModel: null,
    });

    expect(result.modelId).toBe("system-default");
    expect(result.modelSource).toBe("system_default");
  });

  it("does NOT let conversation model override skill llmModelId", async () => {
    mockResolveFromRows.mockImplementation(({ preferredModelIds }) => {
      for (const id of preferredModelIds ?? []) {
        if (id === "skill-model") return "skill-model";
        if (id === "conv-model") return "conv-model";
      }
      return null;
    });

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill({ llmModelId: "skill-model" }),
      conversationModel: "conv-model",
    });

    expect(result.modelId).toBe("skill-model");
    expect(result.modelSource).toBe("skill_llmModelId");
  });

  it("propagates preferredProviderId from skill", async () => {
    mockResolveFromRows.mockReturnValue("any-model");

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill({ preferredProviderId: 42 }),
    });

    expect(result.preferredProviderId).toBe(42);
  });

  it("propagates strictProviderPin from skill", async () => {
    mockResolveFromRows.mockReturnValue("any-model");

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill({ strictProviderPin: true, preferredProviderId: 5 }),
    });

    expect(result.strictProviderPin).toBe(true);
    expect(result.preferredProviderId).toBe(5);
  });

  it("skips disabled skill model and falls back to conversation", async () => {
    mockResolveFromRows.mockImplementation(({ preferredModelIds }) => {
      for (const id of preferredModelIds ?? []) {
        if (id === "disabled-skill-model") continue;
        if (id === "conv-model") return "conv-model";
      }
      return null;
    });

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill({ llmModelId: "disabled-skill-model" }),
      conversationModel: "conv-model",
    });

    expect(result.modelId).toBe("conv-model");
    expect(result.modelSource).toBe("conversation");
  });

  it("makes only a single DB call via loadEnabledLlmModelRows", async () => {
    mockResolveFromRows.mockReturnValue("gpt-4o");

    await resolveSkillExecutionPolicy({
      skill: makeSkill({ llmModelId: "gpt-4o" }),
      conversationModel: "conv-model",
    });

    expect(mockLoadRows).toHaveBeenCalledTimes(1);
  });
});

// ─── Section 04: Requirements mode tests ───

describe("resolveSkillExecutionPolicy — requirements mode", () => {
  beforeEach(() => {
    mockLoadRows.mockReset();
    mockResolveFromRows.mockReset();
    mockSelectBestLlmModel.mockReset();
    mockDescribeRequirementsMatch.mockReset();
    mockLoadRows.mockResolvedValue(fakeRows);
    mockDescribeRequirementsMatch.mockReturnValue({ matched: ["supportsFunctionTools"], missing: [] });
  });

  it("uses requirements when skill.executionPolicy.requirements is set", async () => {
    mockSelectBestLlmModel.mockReturnValue("claude-3-sonnet");

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill({
        executionPolicy: {
          requirements: { supportsFunctionTools: true },
        },
      }),
    });

    expect(result.modelId).toBe("claude-3-sonnet");
    expect(result.modelSource).toBe("requirements_match");
  });

  it("passes all enabled rows to selectBestLlmModel", async () => {
    mockSelectBestLlmModel.mockReturnValue("claude-3-sonnet");

    await resolveSkillExecutionPolicy({
      skill: makeSkill({
        executionPolicy: {
          requirements: { supportsFunctionTools: true },
        },
      }),
    });

    expect(mockSelectBestLlmModel).toHaveBeenCalledWith(
      { supportsFunctionTools: true },
      fakeRows,
    );
  });

  it("uses requirements before llmModelId when requirements are configured", async () => {
    mockResolveFromRows.mockImplementation(({ preferredModelIds }) => {
      if ((preferredModelIds ?? []).includes("gpt-4o")) return "gpt-4o";
      return null;
    });
    mockSelectBestLlmModel.mockReturnValue("requirements-model");

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill({
        llmModelId: "gpt-4o",
        executionPolicy: {
          requirements: { supportsFunctionTools: true },
        },
      }),
    });

    expect(result.modelId).toBe("requirements-model");
    expect(result.modelSource).toBe("requirements_match");
    expect(result.requirementsFallback).toBe(false);
    expect(mockSelectBestLlmModel).toHaveBeenCalledWith(
      { supportsFunctionTools: true },
      fakeRows,
    );
  });

  it("falls back to system default when requirements fail and no llmModelId", async () => {
    mockSelectBestLlmModel.mockReturnValue(null);
    mockResolveFromRows.mockReturnValue("system-default");

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill({
        executionPolicy: {
          requirements: { supportsFunctionTools: true },
        },
      }),
    });

    expect(result.modelSource).toBe("system_default");
    expect(result.requirementsFallback).toBe(true);
  });

  it("sets requirementsFallback=true when fallback was used", async () => {
    mockSelectBestLlmModel.mockReturnValue(null);
    mockResolveFromRows.mockReturnValue("fallback-model");

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill({
        executionPolicy: {
          requirements: { supportsFunctionTools: true },
        },
      }),
    });

    expect(result.requirementsFallback).toBe(true);
  });

  it("sets requirementsFallback=false when requirements matched", async () => {
    mockSelectBestLlmModel.mockReturnValue("matched-model");

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill({
        executionPolicy: {
          requirements: { supportsFunctionTools: true },
        },
      }),
    });

    expect(result.requirementsFallback).toBe(false);
  });

  it("sets matchedCapabilities in result when requirements matched", async () => {
    mockSelectBestLlmModel.mockReturnValue("matched-model");
    const matchedRow = { modelId: "matched-model" };
    mockLoadRows.mockResolvedValue([matchedRow] as any);
    mockDescribeRequirementsMatch.mockReturnValue({
      matched: ["supportsVision", "supportsFunctionTools"],
      missing: [],
    });

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill({
        executionPolicy: {
          requirements: { supportsVision: true, supportsFunctionTools: true },
        },
      }),
    });

    expect(result.matchedCapabilities).toContain("supportsVision");
    expect(result.matchedCapabilities).toContain("supportsFunctionTools");
  });

  it("hybrid mode: tries fixedModel first when fixedModel is enabled", async () => {
    mockResolveFromRows.mockImplementation(({ preferredModelIds }) => {
      if ((preferredModelIds ?? []).includes("claude-3-opus")) return "claude-3-opus";
      return null;
    });

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill({
        executionPolicy: {
          mode: "hybrid",
          fixedModel: "claude-3-opus",
          requirements: { supportsFunctionTools: true },
        },
      }),
    });

    expect(result.modelId).toBe("claude-3-opus");
    expect(result.modelSource).toBe("skill_fixedModel");
    expect(mockSelectBestLlmModel).not.toHaveBeenCalled();
  });

  it("hybrid mode: falls through to requirements when fixedModel not enabled", async () => {
    mockResolveFromRows.mockImplementation(({ preferredModelIds }) => {
      if ((preferredModelIds ?? []).includes("disabled-model")) return null;
      return null;
    });
    mockSelectBestLlmModel.mockReturnValue("claude-3-sonnet");

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill({
        executionPolicy: {
          mode: "hybrid",
          fixedModel: "disabled-model",
          requirements: { supportsFunctionTools: true },
        },
      }),
    });

    expect(result.modelSource).toBe("requirements_match");
  });

  it("fixed mode: skips requirements and uses existing cascade", async () => {
    mockResolveFromRows.mockImplementation(({ preferredModelIds }) => {
      if ((preferredModelIds ?? []).includes("gpt-4-turbo")) return "gpt-4-turbo";
      return null;
    });

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill({
        llmModelId: "gpt-4-turbo",
        executionPolicy: {
          mode: "fixed",
          requirements: { supportsFunctionTools: true },
        },
      }),
    });

    expect(mockSelectBestLlmModel).not.toHaveBeenCalled();
    expect(result.modelId).toBe("gpt-4-turbo");
    expect(result.modelSource).toBe("skill_llmModelId");
  });

  it("allowConversationOverride=false: conversationModel ignored when requirements fail", async () => {
    mockSelectBestLlmModel.mockReturnValue(null);
    mockResolveFromRows.mockImplementation(({ preferredModelIds }) => {
      // conv-model should NOT be in the array
      if ((preferredModelIds ?? []).includes("conv-model")) return "conv-model";
      return "system-default";
    });

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill({
        executionPolicy: {
          requirements: { supportsFunctionTools: true },
          allowConversationOverride: false,
        },
      }),
      conversationModel: "conv-model",
    });

    // Should NOT be conv-model since allowConversationOverride is false
    expect(result.modelId).toBe("system-default");
    expect(result.modelSource).toBe("system_default");
  });

  it("allowConversationOverride=true: conversationModel eligible when requirements fail", async () => {
    mockSelectBestLlmModel.mockReturnValue(null);
    mockResolveFromRows.mockImplementation(({ preferredModelIds }) => {
      if ((preferredModelIds ?? []).includes("conv-model")) return "conv-model";
      return null;
    });

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill({
        executionPolicy: {
          requirements: { supportsFunctionTools: true },
          allowConversationOverride: true,
        },
      }),
      conversationModel: "conv-model",
    });

    expect(result.modelId).toBe("conv-model");
    expect(result.modelSource).toBe("conversation");
  });

  it("requirements mode: uses requirements before configured defaultModel", async () => {
    mockResolveFromRows.mockImplementation(({ preferredModelIds }) => {
      if ((preferredModelIds ?? []).includes("default-model")) return "default-model";
      return null;
    });
    mockSelectBestLlmModel.mockReturnValue("requirements-model");

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill({
        defaultModel: "default-model",
        executionPolicy: {
          mode: "requirements",
          requirements: { supportsFunctionTools: true },
        },
      }),
    });

    expect(result.modelId).toBe("requirements-model");
    expect(result.modelSource).toBe("requirements_match");
    expect(result.requirementsFallback).toBe(false);
    expect(mockSelectBestLlmModel).toHaveBeenCalled();
  });

  it("requirements mode with empty requirements still honors configured defaultModel", async () => {
    mockResolveFromRows.mockImplementation(({ preferredModelIds }) => {
      if ((preferredModelIds ?? []).includes("default-model")) return "default-model";
      return null;
    });

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill({
        defaultModel: "default-model",
        executionPolicy: {
          mode: "requirements",
          requirements: {},
        },
      }),
    });

    expect(result.modelId).toBe("default-model");
    expect(result.modelSource).toBe("skill_defaultModel");
    expect(result.requirementsFallback).toBeUndefined();
    expect(mockSelectBestLlmModel).not.toHaveBeenCalled();
  });

  it("auto-detect: requirements take precedence over configured llmModelId", async () => {
    mockResolveFromRows.mockImplementation(({ preferredModelIds }) => {
      if ((preferredModelIds ?? []).includes("gpt-4o")) return "gpt-4o";
      return null;
    });
    mockSelectBestLlmModel.mockReturnValue("requirements-model");

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill({
        llmModelId: "gpt-4o",
        executionPolicy: {
          requirements: { supportsFunctionTools: true },
        },
      }),
    });

    expect(result.modelId).toBe("requirements-model");
    expect(result.modelSource).toBe("requirements_match");
    expect(mockSelectBestLlmModel).toHaveBeenCalled();
  });

  it("fallbackPolicy=error returns no model when requirements have no match", async () => {
    mockSelectBestLlmModel.mockReturnValue(null);
    mockResolveFromRows.mockReturnValue("system-default");

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill({
        executionPolicy: {
          mode: "requirements",
          requirements: { contextLength: 1_000_000, supportsVision: true },
          fallbackPolicy: "error",
        },
      }),
    });

    expect(result.modelId).toBeNull();
    expect(result.requirementsFallback).toBe(true);
    expect(mockResolveFromRows).not.toHaveBeenCalled();
  });

  it("filters free models out of requirements matching by default", async () => {
    mockLoadRows.mockResolvedValue([
      { modelId: "free-model", isFree: true, priority: 1 },
      { modelId: "paid-model", isFree: false, priority: 2 },
    ] as any);
    mockSelectBestLlmModel.mockImplementation((_requirements, rows) => {
      expect(rows.map((row) => row.modelId)).toEqual(["paid-model"]);
      return "paid-model";
    });

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill({
        executionPolicy: {
          requirements: { supportsFunctionTools: true },
        },
      }),
    });

    expect(result.modelId).toBe("paid-model");
    expect(result.allowFreeModels).toBe(false);
  });

  it("allows free models when execution policy enables them", async () => {
    mockLoadRows.mockResolvedValue([
      { modelId: "free-model", isFree: true, priority: 1 },
      { modelId: "paid-model", isFree: false, priority: 2 },
    ] as any);
    mockSelectBestLlmModel.mockImplementation((_requirements, rows) => {
      expect(rows.map((row) => row.modelId)).toEqual(["free-model", "paid-model"]);
      return "free-model";
    });

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill({
        executionPolicy: {
          allowFreeModels: true,
          requirements: { supportsFunctionTools: true },
        },
      }),
    });

    expect(result.modelId).toBe("free-model");
    expect(result.allowFreeModels).toBe(true);
  });

  it("filters free models out of fallback cascade by default", async () => {
    mockSelectBestLlmModel.mockReturnValue(null);
    mockLoadRows.mockResolvedValue([
      { modelId: "free-model", isFree: true, priority: 1 },
      { modelId: "paid-model", isFree: false, priority: 2 },
    ] as any);
    mockResolveFromRows.mockImplementation(({ rows }) => rows[0]?.modelId ?? null);

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill({
        executionPolicy: {
          requirements: { supportsFunctionTools: true },
        },
      }),
    });

    expect(result.modelId).toBe("paid-model");
  });
});

describe("resolveSkillExecutionPolicy — regression: no requirements", () => {
  beforeEach(() => {
    mockLoadRows.mockReset();
    mockResolveFromRows.mockReset();
    mockSelectBestLlmModel.mockReset();
    mockDescribeRequirementsMatch.mockReset();
    mockLoadRows.mockResolvedValue(fakeRows);
  });

  it("skill without requirements: llmModelId still works", async () => {
    mockResolveFromRows.mockImplementation(({ preferredModelIds }) => {
      if ((preferredModelIds ?? []).includes("gpt-4o")) return "gpt-4o";
      return null;
    });

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill({ llmModelId: "gpt-4o" }),
    });

    expect(result.modelId).toBe("gpt-4o");
    expect(result.modelSource).toBe("skill_llmModelId");
    expect(mockSelectBestLlmModel).not.toHaveBeenCalled();
  });

  it("skill without requirements: defaultModel still works", async () => {
    mockResolveFromRows.mockImplementation(({ preferredModelIds }) => {
      if ((preferredModelIds ?? []).includes("default-model")) return "default-model";
      return null;
    });

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill({ defaultModel: "default-model" }),
    });

    expect(result.modelId).toBe("default-model");
    expect(result.modelSource).toBe("skill_defaultModel");
  });

  it("skill without requirements: conversation model still works", async () => {
    mockResolveFromRows.mockImplementation(({ preferredModelIds }) => {
      if ((preferredModelIds ?? []).includes("conv-model")) return "conv-model";
      return null;
    });

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill(),
      conversationModel: "conv-model",
    });

    expect(result.modelId).toBe("conv-model");
    expect(result.modelSource).toBe("conversation");
  });

  it("skill without requirements: system default still works", async () => {
    mockResolveFromRows.mockReturnValue("system-default");

    const result = await resolveSkillExecutionPolicy({
      skill: makeSkill(),
    });

    expect(result.modelId).toBe("system-default");
    expect(result.modelSource).toBe("system_default");
  });

  it("skill with executionPolicy but empty requirements: treats as no requirements", async () => {
    mockResolveFromRows.mockReturnValue("system-default");

    await resolveSkillExecutionPolicy({
      skill: makeSkill({
        executionPolicy: { mode: undefined, requirements: {} },
      }),
    });

    expect(mockSelectBestLlmModel).not.toHaveBeenCalled();
  });
});
