import { describe, expect, it } from "vitest";

import { compareResponsesReplaySnapshots } from "../agentRuntime/responsesRuntimeOrchestrator";

describe("compareResponsesReplaySnapshots", () => {
  it("detects schema validity drift", () => {
    const result = compareResponsesReplaySnapshots(
      {
        selectedSkillSlug: "structured-summary",
        schemaValid: true,
        status: "completed",
        selectedModelId: "openai/gpt-4.1-mini",
        selectedProviderName: "openrouter",
      },
      {
        selectedSkillSlug: "structured-summary",
        schemaValid: false,
        status: "completed",
        selectedModelId: "openai/gpt-4.1-mini",
        selectedProviderName: "openrouter",
      },
    );

    expect(result).toEqual({
      matches: false,
      mismatchCodes: ["schema_validity_drift"],
    });
  });

  it("detects selected skill drift", () => {
    const result = compareResponsesReplaySnapshots(
      {
        selectedSkillSlug: "structured-summary",
        schemaValid: true,
        status: "completed",
        selectedModelId: "openai/gpt-4.1-mini",
        selectedProviderName: "openrouter",
      },
      {
        selectedSkillSlug: "freeform-fallback",
        schemaValid: true,
        status: "completed",
        selectedModelId: "openai/gpt-4.1-mini",
        selectedProviderName: "openrouter",
      },
    );

    expect(result).toEqual({
      matches: false,
      mismatchCodes: ["selected_skill_drift"],
    });
  });
});
