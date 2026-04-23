import { describe, expect, it } from "vitest";

import { selectResponsesRuntimeSelection } from "../../services/agentRuntime/responsesRuntimeOrchestrator";

describe("responses runtime routing", () => {
  it("selects active mode when the responses active flag is enabled", () => {
    const result = selectResponsesRuntimeSelection({
      openAiAgentsRuntimeEnabled: true,
      openAiAgentsRuntimeResponsesActive: true,
    });

    expect(result.engine).toBe("openai_agents");
    expect(result.mode).toBe("active");
  });
});
