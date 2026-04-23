import { describe, expect, it } from "vitest";

import { selectResponsesRuntimeSelection } from "../../services/agentRuntime/responsesRuntimeOrchestrator";

describe("responses runtime eligibility", () => {
  it("stays legacy when the master flag is disabled", () => {
    const result = selectResponsesRuntimeSelection({
      openAiAgentsRuntimeEnabled: false,
    });

    expect(result.mode).toBe("legacy");
  });
});
