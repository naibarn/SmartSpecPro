/**
 * recommendedOnly selection tests — the admin-curated quality set
 * (model_provider_map.isRecommended) that quality-critical skills opt into
 * via execution_policy.requirements.recommendedOnly (2026-07-24).
 */
import { describe, expect, it } from "vitest";
import { selectLlmModelCandidates } from "../intelligentModelSelector";

describe("recommendedOnly (admin-curated quality set)", () => {
  const baseRow = {
    providerId: 1,
    providerName: "openrouter",
    modelId: "",
    providerModelId: null,
    legacyModelAliases: null,
    defaultModel: null,
    apiStyle: "chat-completions",
    supportsVision: true,
    supportsThinking: true,
    supportsFunctionTools: null,
    supportsStructuredOutputs: null,
    supportsJsonMode: null,
    supportsStrictToolSchema: null,
    supportsWebSearch: null,
    supportsCodeExecution: null,
    supportsComputerUse: null,
    supportsBackground: null,
    supportsResponses: null,
    contextLength: 1_050_000,
    priority: 0,
    priorityLocked: null,
    isFree: false,
  } as any;

  it("filters to isRecommended rows only, still ranked by priority", () => {
    const rows = [
      { ...baseRow, modelId: "cheap-not-vetted", priority: 0, isRecommended: false },
      { ...baseRow, modelId: "vetted-second", priority: 5, isRecommended: true },
      { ...baseRow, modelId: "vetted-first", priority: 1, isRecommended: true },
    ];
    const picks = selectLlmModelCandidates(
      { supportsVision: true, contextLength: 1_000_000, recommendedOnly: true } as any,
      rows,
      5
    );
    expect(picks).toEqual(["vetted-first", "vetted-second"]);
  });

  it("returns empty (fail-closed upstream) when nothing is recommended", () => {
    const rows = [
      { ...baseRow, modelId: "a", isRecommended: false },
      { ...baseRow, modelId: "b", isRecommended: null },
    ];
    expect(
      selectLlmModelCandidates({ recommendedOnly: true } as any, rows, 5)
    ).toEqual([]);
  });

  it("absent recommendedOnly keeps today's behavior (flag ignored)", () => {
    const rows = [
      { ...baseRow, modelId: "not-vetted", priority: 0, isRecommended: false },
      { ...baseRow, modelId: "vetted", priority: 1, isRecommended: true },
    ];
    expect(selectLlmModelCandidates({} as any, rows, 5)).toEqual([
      "not-vetted",
      "vetted",
    ]);
  });
});
