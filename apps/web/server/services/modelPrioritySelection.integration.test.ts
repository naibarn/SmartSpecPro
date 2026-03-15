/**
 * Integration test: priority scoring → model selection → fallback ordering
 *
 * Tests that computeModelPriority scores directly affect which models
 * selectBestLlmModel and selectLlmModelCandidates pick, and in what order.
 * No mocks — uses the real pure functions from intelligentModelSelector.
 */
import { describe, expect, it } from "vitest";
import {
  computeModelPriority,
  selectBestLlmModel,
  selectLlmModelCandidates,
  describeRequirementsMatch,
} from "./intelligentModelSelector";
import type { EnabledLlmModelRow } from "./enabledLlmModels";

const DAY = 86400;
const now = Math.floor(Date.now() / 1000);

function makeRow(
  modelId: string,
  overrides: Partial<EnabledLlmModelRow> = {},
): EnabledLlmModelRow {
  return {
    modelId,
    providerName: "test",
    providerModelId: modelId,
    defaultModel: modelId,
    priority: 50,
    priorityLocked: false,
    contextLength: 128000,
    supportsVision: false,
    supportsFunctionTools: false,
    supportsStructuredOutputs: false,
    supportsWebSearch: false,
    supportsCodeExecution: false,
    supportsComputerUse: false,
    supportsBackground: false,
    supportsResponses: false,
    ...overrides,
  } as EnabledLlmModelRow;
}

describe("Priority → Selection Integration", () => {
  // Compute real priorities for realistic models then verify selection uses them
  it("cheaper newer model gets lower priority (preferred) over expensive old model", () => {
    const cheapNew = computeModelPriority({
      createdAt: now - 15 * DAY,
      pricingInput: "0.15",
      pricingOutput: "0.60",
      isFree: false,
      supportsFunctionTools: true,
      supportsVision: true,
    });

    const expensiveOld = computeModelPriority({
      createdAt: now - 400 * DAY,
      pricingInput: "30",
      pricingOutput: "60",
      isFree: false,
      supportsFunctionTools: true,
    });

    expect(cheapNew).toBeLessThan(expensiveOld);
  });

  it("selectBestLlmModel picks highest-priority model matching requirements", () => {
    const rows = [
      makeRow("expensive-vision", {
        priority: 40,
        supportsVision: true,
        supportsFunctionTools: true,
      }),
      makeRow("cheap-vision", {
        priority: 10,
        supportsVision: true,
        supportsFunctionTools: true,
      }),
      makeRow("cheap-no-vision", {
        priority: 5,
        supportsVision: false,
        supportsFunctionTools: true,
      }),
    ];

    // Requires vision → should pick cheap-vision (priority 10), not cheap-no-vision (priority 5)
    const best = selectBestLlmModel(
      { supportsVision: true },
      rows,
    );
    expect(best).toBe("cheap-vision");
  });

  it("selectLlmModelCandidates returns models in priority order for fallback chain", () => {
    const rows = [
      makeRow("model-c", { priority: 30, supportsVision: true }),
      makeRow("model-a", { priority: 10, supportsVision: true }),
      makeRow("model-b", { priority: 20, supportsVision: true }),
      makeRow("model-d", { priority: 5, supportsVision: false }), // no vision
    ];

    const candidates = selectLlmModelCandidates(
      { supportsVision: true },
      rows,
      5,
    );

    // Only vision models, sorted by priority ASC
    expect(candidates).toEqual(["model-a", "model-b", "model-c"]);
    expect(candidates).not.toContain("model-d");
  });

  it("admin priority override (lower number) moves model to front of selection", () => {
    // Simulate admin manually setting priority=1 for a model
    const rows = [
      makeRow("auto-scored", { priority: 25, supportsVision: true }),
      makeRow("admin-pinned", { priority: 1, supportsVision: true, priorityLocked: true }),
      makeRow("expensive", { priority: 60, supportsVision: true }),
    ];

    const best = selectBestLlmModel({ supportsVision: true }, rows);
    expect(best).toBe("admin-pinned");

    const candidates = selectLlmModelCandidates({ supportsVision: true }, rows, 3);
    expect(candidates[0]).toBe("admin-pinned");
    expect(candidates[1]).toBe("auto-scored");
    expect(candidates[2]).toBe("expensive");
  });

  it("contextLength filter excludes models with insufficient context", () => {
    const rows = [
      makeRow("small-ctx", { priority: 1, contextLength: 8000 }),
      makeRow("medium-ctx", { priority: 10, contextLength: 32000 }),
      makeRow("large-ctx", { priority: 20, contextLength: 200000 }),
    ];

    // Requires 100k context
    const best = selectBestLlmModel({ contextLength: 100000 }, rows);
    expect(best).toBe("large-ctx"); // only one with >= 100k

    // Requires 16k context
    const candidates = selectLlmModelCandidates({ contextLength: 16000 }, rows, 5);
    expect(candidates).toEqual(["medium-ctx", "large-ctx"]);
    expect(candidates).not.toContain("small-ctx");
  });

  it("AND logic: model must match ALL required capabilities", () => {
    const rows = [
      makeRow("vision-only", {
        priority: 5,
        supportsVision: true,
        supportsFunctionTools: false,
      }),
      makeRow("tools-only", {
        priority: 10,
        supportsVision: false,
        supportsFunctionTools: true,
      }),
      makeRow("both", {
        priority: 15,
        supportsVision: true,
        supportsFunctionTools: true,
      }),
    ];

    const best = selectBestLlmModel(
      { supportsVision: true, supportsFunctionTools: true },
      rows,
    );
    // Only "both" matches all requirements, even though it has higher priority number
    expect(best).toBe("both");
  });

  it("describeRequirementsMatch accurately reports matched/missing for a model", () => {
    const row = makeRow("partial-match", {
      supportsVision: true,
      supportsFunctionTools: true,
      supportsWebSearch: false,
      contextLength: 64000,
    });

    const result = describeRequirementsMatch(
      {
        supportsVision: true,
        supportsFunctionTools: true,
        supportsWebSearch: true,
        contextLength: 100000,
      },
      row,
    );

    expect(result.matched).toContain("supportsVision");
    expect(result.matched).toContain("supportsFunctionTools");
    expect(result.missing).toContain("supportsWebSearch");
    expect(result.missing).toContain("contextLength");
  });

  it("empty requirements selects the highest-priority model regardless of capabilities", () => {
    const rows = [
      makeRow("cheap-basic", { priority: 5 }),
      makeRow("expensive-full", {
        priority: 30,
        supportsVision: true,
        supportsFunctionTools: true,
      }),
    ];

    const best = selectBestLlmModel({}, rows);
    expect(best).toBe("cheap-basic"); // no requirements → cheapest wins

    const candidates = selectLlmModelCandidates({}, rows, 5);
    expect(candidates[0]).toBe("cheap-basic");
  });

  it("computed priorities create correct fallback ordering: free → cheap → expensive", () => {
    // Use real computeModelPriority to assign priorities
    const models = [
      {
        modelId: "expensive-pro",
        pricingInput: "30",
        pricingOutput: "60",
        isFree: false,
        createdAt: now - 90 * DAY,
      },
      {
        modelId: "free-model",
        pricingInput: "0",
        pricingOutput: "0",
        isFree: true,
        createdAt: now - 20 * DAY,
      },
      {
        modelId: "cheap-model",
        pricingInput: "0.10",
        pricingOutput: "0.40",
        isFree: false,
        createdAt: now - 15 * DAY,
      },
    ];

    const rows = models.map((m) =>
      makeRow(m.modelId, {
        priority: computeModelPriority(m),
      }),
    );

    const candidates = selectLlmModelCandidates({}, rows, 5);

    // Free model should come first (cheapest), then cheap, then expensive
    expect(candidates[0]).toBe("free-model");
    expect(candidates[1]).toBe("cheap-model");
    expect(candidates[2]).toBe("expensive-pro");
  });
});
