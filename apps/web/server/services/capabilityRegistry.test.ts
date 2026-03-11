import { describe, expect, it } from "vitest";

import {
  type ModelCapabilities,
  type SkillExecutionPolicy,
  filterModelsByCapabilities,
  resolveModelsForPolicy,
  DEFAULT_EXECUTION_POLICY,
} from "./capabilityRegistry";

const models: Array<{ modelId: string; capabilities: ModelCapabilities }> = [
  {
    modelId: "gpt-4o",
    capabilities: {
      supportsResponses: true,
      supportsStructuredOutputs: true,
      supportsWebSearch: false,
      supportsFunctionTools: true,
      supportsCodeExecution: false,
      supportsComputerUse: false,
      supportsBackground: false,
      contextLength: 128000,
    },
  },
  {
    modelId: "claude-sonnet-4",
    capabilities: {
      supportsResponses: true,
      supportsStructuredOutputs: true,
      supportsWebSearch: true,
      supportsFunctionTools: true,
      supportsCodeExecution: true,
      supportsComputerUse: true,
      supportsBackground: false,
      contextLength: 200000,
    },
  },
  {
    modelId: "gemini-flash",
    capabilities: {
      supportsResponses: false,
      supportsStructuredOutputs: false,
      supportsWebSearch: true,
      supportsFunctionTools: false,
      supportsCodeExecution: false,
      supportsComputerUse: false,
      supportsBackground: false,
      contextLength: 32000,
    },
  },
];

describe("filterModelsByCapabilities", () => {
  it("returns all models when no requirements specified", () => {
    const result = filterModelsByCapabilities(models, {});
    expect(result.map((m) => m.modelId)).toEqual(["gpt-4o", "claude-sonnet-4", "gemini-flash"]);
  });

  it("filters by single capability requirement", () => {
    const result = filterModelsByCapabilities(models, { supportsComputerUse: true });
    expect(result.map((m) => m.modelId)).toEqual(["claude-sonnet-4"]);
  });

  it("filters by multiple requirements (AND)", () => {
    const result = filterModelsByCapabilities(models, {
      supportsStructuredOutputs: true,
      supportsFunctionTools: true,
    });
    expect(result.map((m) => m.modelId)).toEqual(["gpt-4o", "claude-sonnet-4"]);
  });

  it("filters by minimum context length", () => {
    const result = filterModelsByCapabilities(models, { contextLength: 100000 });
    expect(result.map((m) => m.modelId)).toEqual(["gpt-4o", "claude-sonnet-4"]);
  });

  it("returns empty when no models match", () => {
    const result = filterModelsByCapabilities(models, {
      supportsBackground: true,
      supportsComputerUse: true,
    });
    expect(result).toEqual([]);
  });
});

describe("resolveModelsForPolicy", () => {
  it("returns all enabled models for default requirements policy", () => {
    const result = resolveModelsForPolicy(models, DEFAULT_EXECUTION_POLICY);
    expect(result.length).toBe(3);
  });

  it("resolves requirements-mode policy with capability filter", () => {
    const policy: SkillExecutionPolicy = {
      mode: "requirements",
      requirements: { supportsFunctionTools: true },
    };
    const result = resolveModelsForPolicy(models, policy);
    expect(result.map((m) => m.modelId)).toEqual(["gpt-4o", "claude-sonnet-4"]);
  });

  it("resolves fixed-mode policy to a single model", () => {
    const policy: SkillExecutionPolicy = {
      mode: "fixed",
      fixedModel: "claude-sonnet-4",
    };
    const result = resolveModelsForPolicy(models, policy);
    expect(result.map((m) => m.modelId)).toEqual(["claude-sonnet-4"]);
  });

  it("returns empty for fixed-mode when model not found", () => {
    const policy: SkillExecutionPolicy = {
      mode: "fixed",
      fixedModel: "nonexistent-model",
    };
    const result = resolveModelsForPolicy(models, policy);
    expect(result).toEqual([]);
  });

  it("applies disallowedModels filter", () => {
    const policy: SkillExecutionPolicy = {
      mode: "requirements",
      requirements: {},
      disallowedModels: ["gemini-flash"],
    };
    const result = resolveModelsForPolicy(models, policy);
    expect(result.map((m) => m.modelId)).toEqual(["gpt-4o", "claude-sonnet-4"]);
  });

  it("applies preferredProfiles ordering", () => {
    const policy: SkillExecutionPolicy = {
      mode: "requirements",
      requirements: { supportsStructuredOutputs: true },
      preferredProfiles: ["claude-sonnet-4", "gpt-4o"],
    };
    const result = resolveModelsForPolicy(models, policy);
    // Preferred models come first in order
    expect(result[0].modelId).toBe("claude-sonnet-4");
    expect(result[1].modelId).toBe("gpt-4o");
  });

  it("hybrid mode filters by requirements then prefers fixed", () => {
    const policy: SkillExecutionPolicy = {
      mode: "hybrid",
      fixedModel: "gpt-4o",
      requirements: { supportsStructuredOutputs: true },
    };
    const result = resolveModelsForPolicy(models, policy);
    // Fixed model appears first if it meets requirements
    expect(result[0].modelId).toBe("gpt-4o");
  });

  it("hybrid mode drops fixed model that fails requirements", () => {
    const policy: SkillExecutionPolicy = {
      mode: "hybrid",
      fixedModel: "gemini-flash", // does NOT support structured outputs
      requirements: { supportsStructuredOutputs: true },
    };
    const result = resolveModelsForPolicy(models, policy);
    // gemini-flash should NOT appear since it doesn't meet requirements
    expect(result.map((m) => m.modelId)).toEqual(["gpt-4o", "claude-sonnet-4"]);
  });
});
