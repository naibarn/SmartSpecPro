import { describe, expect, it } from "vitest";

import { selectResponsesRuntimeSelection } from "../agentRuntime/responsesRuntimeOrchestrator";

describe("responses OpenAI Agents runtime shadow selection", () => {
  it("selects shadow mode when the responses shadow flag is enabled", () => {
    const result = selectResponsesRuntimeSelection({
      openAiAgentsRuntimeEnabled: true,
      openAiAgentsRuntimeResponsesShadow: true,
    });

    expect(result.mode).toBe("shadow");
    expect(result.engine).toBe("openai_agents");
  });
});
