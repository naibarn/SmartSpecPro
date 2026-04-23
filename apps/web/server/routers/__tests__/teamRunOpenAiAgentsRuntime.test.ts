import { describe, expect, it } from "vitest";

import { selectAgentRuntime } from "../../services/agentRuntime/runtimeSelection";

describe("team run OpenAI Agents runtime routing", () => {
  it("selects active mode when the team active flag is enabled", () => {
    const result = selectAgentRuntime({
      surface: "team",
      featureFlags: {
        openAiAgentsRuntimeEnabled: true,
        openAiAgentsRuntimeTeamActive: true,
      },
    });

    expect(result.engine).toBe("openai_agents");
    expect(result.mode).toBe("active");
  });
});
