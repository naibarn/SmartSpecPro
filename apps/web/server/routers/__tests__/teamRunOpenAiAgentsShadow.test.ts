import { describe, expect, it } from "vitest";

import { selectAgentRuntime } from "../../services/agentRuntime/runtimeSelection";

describe("team run OpenAI Agents runtime shadow routing", () => {
  it("selects shadow mode when the team shadow flag is enabled", () => {
    const result = selectAgentRuntime({
      surface: "team",
      featureFlags: {
        openAiAgentsRuntimeEnabled: true,
        openAiAgentsRuntimeTeamShadow: true,
      },
    });

    expect(result.engine).toBe("openai_agents");
    expect(result.mode).toBe("shadow");
  });
});
