import { describe, expect, it } from "vitest";

import { selectResponsesRuntimeSelection } from "../../services/agentRuntime/responsesRuntimeOrchestrator";

describe("responses runtime shadow routing", () => {
  it("selects shadow mode when the responses shadow flag is enabled", () => {
    const result = selectResponsesRuntimeSelection({
      openAiAgentsRuntimeEnabled: true,
      openAiAgentsRuntimeResponsesShadow: true,
    });

    expect(result.engine).toBe("openai_agents");
    expect(result.mode).toBe("shadow");
  });
});
