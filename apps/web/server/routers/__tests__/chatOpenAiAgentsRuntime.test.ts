import { describe, expect, it } from "vitest";

import { selectAgentRuntime } from "../../services/agentRuntime/runtimeSelection";

describe("chat OpenAI Agents runtime routing", () => {
  it("selects active mode when the chat active flag is enabled", () => {
    const result = selectAgentRuntime({
      surface: "chat",
      featureFlags: {
        openAiAgentsRuntimeEnabled: true,
        openAiAgentsRuntimeChatActive: true,
      },
    });

    expect(result.engine).toBe("openai_agents");
    expect(result.mode).toBe("active");
  });
});
