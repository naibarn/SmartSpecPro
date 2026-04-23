import { describe, expect, it } from "vitest";
import { selectResponsesRuntimeSelection } from "../agentRuntime/responsesRuntimeOrchestrator";

describe("selectResponsesRuntimeSelection", () => {
  it("honors the shared runtime selection flags for responses", () => {
    const legacy = selectResponsesRuntimeSelection({
      openAiAgentsRuntimeEnabled: false,
    });
    expect(legacy.mode).toBe("legacy");

    const active = selectResponsesRuntimeSelection({
      openAiAgentsRuntimeEnabled: true,
      openAiAgentsRuntimeResponsesActive: true,
    });
    expect(active.mode).toBe("active");
    expect(active.engine).toBe("openai_agents");
  });
});

