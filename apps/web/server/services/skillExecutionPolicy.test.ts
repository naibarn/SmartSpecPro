import { describe, expect, it, vi, beforeEach } from "vitest";

import type { SkillDefinition } from "@smartspec/skills";
import { resolveSkillExecutionPolicy } from "./skillExecutionPolicy";

// Mock enabledLlmModels to avoid DB dependency
vi.mock("./enabledLlmModels", () => ({
  loadEnabledLlmModelRows: vi.fn(),
  resolveEnabledLlmModelIdFromRows: vi.fn(),
}));

import {
  loadEnabledLlmModelRows,
  resolveEnabledLlmModelIdFromRows,
} from "./enabledLlmModels";

const mockLoadRows = vi.mocked(loadEnabledLlmModelRows);
const mockResolveFromRows = vi.mocked(resolveEnabledLlmModelIdFromRows);

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

const fakeRows: any[] = [{ providerName: "openai", modelId: "gpt-4o", providerModelId: "gpt-4o", defaultModel: "gpt-4o" }];

describe("resolveSkillExecutionPolicy", () => {
  beforeEach(() => {
    mockLoadRows.mockReset();
    mockResolveFromRows.mockReset();
    mockLoadRows.mockResolvedValue(fakeRows);
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
