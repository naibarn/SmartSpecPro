import { describe, it, expect } from "vitest";
import {
  computeModelPriority,
  selectBestLlmModel,
  describeRequirementsMatch,
  type ModelPriorityInput,
  type CapabilityRequirements,
} from "./intelligentModelSelector";
import type { EnabledLlmModelRow } from "./enabledLlmModels";

const DAY = 86400; // seconds

describe("computeModelPriority", () => {
  it("returns lower number for newer model (recency wins)", () => {
    const now = Date.now() / 1000;
    const modelA: ModelPriorityInput = { createdAt: now - 7 * DAY }; // 7 days old
    const modelB: ModelPriorityInput = { createdAt: now - 800 * DAY }; // 2+ years old
    expect(computeModelPriority(modelA)).toBeLessThan(
      computeModelPriority(modelB),
    );
  });

  it("returns lower number for free model over paid", () => {
    const modelA: ModelPriorityInput = { isFree: true };
    const modelB: ModelPriorityInput = {
      isFree: false,
      pricingInput: "5",
      pricingOutput: "5",
    };
    expect(computeModelPriority(modelA)).toBeLessThan(
      computeModelPriority(modelB),
    );
  });

  it("returns lower number for model with more capabilities", () => {
    const modelA: ModelPriorityInput = {
      supportsFunctionTools: true,
      supportsStructuredOutputs: true,
      supportsWebSearch: true,
      supportsCodeExecution: true,
      supportsComputerUse: true,
      supportsBackground: true,
      supportsResponses: true,
      supportsVision: true,
    };
    const modelB: ModelPriorityInput = {};
    expect(computeModelPriority(modelA)).toBeLessThan(
      computeModelPriority(modelB),
    );
  });

  it("never returns 0 or negative", () => {
    // Worst case: old model, expensive, no capabilities
    const model: ModelPriorityInput = {
      createdAt: Date.now() / 1000 - 1000 * DAY,
      pricingInput: "50",
      pricingOutput: "50",
    };
    const priority = computeModelPriority(model);
    expect(priority).toBeGreaterThanOrEqual(1);
  });

  it("never returns more than 100", () => {
    // Best case: brand new, free, all capabilities
    const model: ModelPriorityInput = {
      createdAt: Date.now() / 1000,
      isFree: true,
      supportsFunctionTools: true,
      supportsStructuredOutputs: true,
      supportsWebSearch: true,
      supportsThinking: true,
      supportsCodeExecution: true,
      supportsComputerUse: true,
      supportsBackground: true,
      supportsResponses: true,
      supportsVision: true,
    };
    const priority = computeModelPriority(model);
    expect(priority).toBeLessThanOrEqual(100);
    // Should actually be 1 (the minimum)
    expect(priority).toBe(1);
  });

  it("returns mid-range value for unknown createdAt", () => {
    const now = Date.now() / 1000;
    const unknown: ModelPriorityInput = { createdAt: undefined };
    const recent: ModelPriorityInput = { createdAt: now - 15 * DAY }; // 40 pts
    const old: ModelPriorityInput = { createdAt: now - 500 * DAY }; // 10 pts
    // Unknown gets 15 pts recency, so priority should be between recent and old
    const unknownPriority = computeModelPriority(unknown);
    const recentPriority = computeModelPriority(recent);
    const oldPriority = computeModelPriority(old);
    expect(unknownPriority).toBeGreaterThan(recentPriority);
    expect(unknownPriority).toBeLessThan(oldPriority);
  });

  it("returns mid-range value for unknown pricing", () => {
    const cheap: ModelPriorityInput = { pricingInput: "0.1", pricingOutput: "0.1" };
    const expensive: ModelPriorityInput = { pricingInput: "20", pricingOutput: "20" };
    const unknown: ModelPriorityInput = { pricingInput: null, pricingOutput: null };
    const cheapPriority = computeModelPriority(cheap);
    const expensivePriority = computeModelPriority(expensive);
    const unknownPriority = computeModelPriority(unknown);
    expect(unknownPriority).toBeGreaterThan(cheapPriority);
    expect(unknownPriority).toBeLessThan(expensivePriority);
  });

  it("uses the valid field when only one pricing field is present", () => {
    const partialPrice: ModelPriorityInput = {
      pricingInput: null,
      pricingOutput: "0.30",
    };
    const priority = computeModelPriority(partialPrice);
    // 0.30 avg → cost tier < $0.50 → 25 pts
    const fullCheap: ModelPriorityInput = {
      pricingInput: "0.30",
      pricingOutput: "0.30",
    };
    expect(priority).toBe(computeModelPriority(fullCheap));
  });

  it("treats isFree=null the same as isFree=false", () => {
    const nullFree: ModelPriorityInput = {
      isFree: null,
      pricingInput: "3",
      pricingOutput: "3",
    };
    const explicitFalse: ModelPriorityInput = {
      isFree: false,
      pricingInput: "3",
      pricingOutput: "3",
    };
    expect(computeModelPriority(nullFree)).toBe(
      computeModelPriority(explicitFalse),
    );
  });

  it("handles epoch createdAt (0) as very old model", () => {
    const model: ModelPriorityInput = { createdAt: 0 };
    const oldModel: ModelPriorityInput = {
      createdAt: Date.now() / 1000 - 500 * DAY,
    };
    // Both should get 10 recency points (> 365 days old)
    expect(computeModelPriority(model)).toBe(computeModelPriority(oldModel));
  });

  it("is deterministic — same input always returns same output", () => {
    const model: ModelPriorityInput = {
      createdAt: Date.now() / 1000 - 60 * DAY,
      pricingInput: "3",
      pricingOutput: "6",
      supportsFunctionTools: true,
      supportsVision: true,
    };
    const a = computeModelPriority(model);
    const b = computeModelPriority(model);
    expect(a).toBe(b);
  });
});

// ─── Section 03: selectBestLlmModel + describeRequirementsMatch ───

function makeRow(
  modelId: string,
  overrides: Partial<EnabledLlmModelRow> = {},
): EnabledLlmModelRow {
  return {
    providerName: "test-provider",
    modelId,
    providerModelId: modelId,
    defaultModel: null,
    supportsVision: false,
    supportsFunctionTools: false,
    supportsStructuredOutputs: false,
    supportsWebSearch: false,
    supportsCodeExecution: false,
    supportsComputerUse: false,
    supportsBackground: false,
    supportsResponses: false,
    contextLength: null,
    priority: 50,
    priorityLocked: false,
    isFree: false,
    catalogEligibility: "public-chat",
    ...overrides,
  };
}

describe("selectBestLlmModel", () => {
  it("returns modelId of first qualifying model sorted by priority", () => {
    const rows = [
      makeRow("gpt-4o", { priority: 10, supportsFunctionTools: true }),
      makeRow("claude-3", { priority: 5, supportsFunctionTools: true }),
    ];
    const result = selectBestLlmModel(
      { supportsFunctionTools: true },
      rows,
    );
    expect(result).toBe("claude-3");
  });

  it("filters manual-only rows out before scoring", () => {
    const rows = [
      makeRow("manual-review", {
        priority: 1,
        catalogEligibility: "manual-only",
        supportsFunctionTools: true,
      }),
      makeRow("public-auto", {
        priority: 20,
        catalogEligibility: "public-chat",
        supportsFunctionTools: true,
      }),
    ];

    expect(selectBestLlmModel({ supportsFunctionTools: true }, rows)).toBe("public-auto");
  });

  it("returns null when no row satisfies requirements", () => {
    const rows = [
      makeRow("text-only", { supportsFunctionTools: false }),
    ];
    const result = selectBestLlmModel(
      { supportsFunctionTools: true },
      rows,
    );
    expect(result).toBeNull();
  });

  it("AND logic: excludes models missing any single required capability", () => {
    const rows = [
      makeRow("partial", {
        supportsFunctionTools: true,
        supportsStructuredOutputs: false,
      }),
    ];
    const result = selectBestLlmModel(
      { supportsFunctionTools: true, supportsStructuredOutputs: true },
      rows,
    );
    expect(result).toBeNull();
  });

  it("filters by refined structured-output requirements", () => {
    const rows = [
      makeRow("json-only", {
        supportsStructuredOutputs: true,
        supportsJsonMode: true,
        supportsStrictToolSchema: false,
      }),
      makeRow("strict-tools", {
        supportsStructuredOutputs: true,
        supportsJsonMode: true,
        supportsStrictToolSchema: true,
        priority: 20,
      }),
    ];
    const result = selectBestLlmModel(
      { supportsJsonMode: true, supportsStrictToolSchema: true },
      rows,
    );
    expect(result).toBe("strict-tools");
  });

  it("false requirements do not filter out capable models", () => {
    const rows = [
      makeRow("capable", { supportsFunctionTools: true }),
    ];
    const result = selectBestLlmModel(
      { supportsFunctionTools: false },
      rows,
    );
    expect(result).toBe("capable");
  });

  it("contextLength filter excludes models with insufficient context", () => {
    const rows = [
      makeRow("small", { contextLength: 4096, priority: 1 }),
      makeRow("large", { contextLength: 128000, priority: 2 }),
    ];
    const result = selectBestLlmModel(
      { contextLength: 32000 },
      rows,
    );
    expect(result).toBe("large");
  });

  it("contextLength filter excludes models with null contextLength", () => {
    const rows = [
      makeRow("unknown-ctx", { contextLength: null, priority: 1 }),
      makeRow("known-large", { contextLength: 128000, priority: 2 }),
    ];
    const result = selectBestLlmModel(
      { contextLength: 32000 },
      rows,
    );
    expect(result).toBe("known-large");
  });

  it("returns null for empty rows array", () => {
    const result = selectBestLlmModel(
      { supportsFunctionTools: true },
      [],
    );
    expect(result).toBeNull();
  });

  it("returns first model when requirements object is empty", () => {
    const rows = [
      makeRow("model-a", { priority: 20 }),
      makeRow("model-b", { priority: 10 }),
    ];
    const result = selectBestLlmModel({}, rows);
    expect(result).toBe("model-b");
  });

  it("does not require capabilities not in requirements object", () => {
    const rows = [
      makeRow("tools-only", {
        supportsFunctionTools: true,
        supportsVision: false,
        priority: 5,
      }),
    ];
    const result = selectBestLlmModel(
      { supportsFunctionTools: true },
      rows,
    );
    expect(result).toBe("tools-only");
  });
});

describe("describeRequirementsMatch", () => {
  it("lists matched capabilities correctly", () => {
    const requirements: Partial<CapabilityRequirements> = {
      supportsFunctionTools: true,
      supportsVision: true,
    };
    const row = makeRow("model-a", {
      supportsFunctionTools: true,
      supportsVision: true,
    });
    const result = describeRequirementsMatch(requirements, row);
    expect(result.matched).toContain("supportsFunctionTools");
    expect(result.matched).toContain("supportsVision");
    expect(result.missing).toHaveLength(0);
  });

  it("lists missing capabilities correctly", () => {
    const requirements: Partial<CapabilityRequirements> = {
      supportsFunctionTools: true,
      supportsVision: true,
    };
    const row = makeRow("model-a", {
      supportsFunctionTools: true,
      supportsVision: false,
    });
    const result = describeRequirementsMatch(requirements, row);
    expect(result.matched).toContain("supportsFunctionTools");
    expect(result.missing).toContain("supportsVision");
  });

  it("returns empty arrays when requirements is empty", () => {
    const row = makeRow("model-a", { supportsFunctionTools: true });
    const result = describeRequirementsMatch({}, row);
    expect(result.matched).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
  });

  it("reports contextLength as matched when row meets minimum", () => {
    const row = makeRow("model-a", { contextLength: 128000 });
    const result = describeRequirementsMatch({ contextLength: 32000 }, row);
    expect(result.matched).toContain("contextLength");
    expect(result.missing).toHaveLength(0);
  });

  it("reports contextLength as missing when row has null contextLength", () => {
    const row = makeRow("model-a", { contextLength: null });
    const result = describeRequirementsMatch({ contextLength: 32000 }, row);
    expect(result.missing).toContain("contextLength");
    expect(result.matched).toHaveLength(0);
  });
});
