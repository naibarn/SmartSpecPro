import { describe, expect, it } from "vitest";

import { selectAgentRuntime } from "../../services/agentRuntime/runtimeSelection";

describe("chat OpenAI Agents runtime shadow routing", () => {
  it("selects shadow mode when the chat shadow flag is enabled", () => {
    const result = selectAgentRuntime({
      surface: "chat",
      featureFlags: {
        openAiAgentsRuntimeEnabled: true,
        openAiAgentsRuntimeChatShadow: true,
      },
    });

    expect(result.engine).toBe("openai_agents");
    expect(result.mode).toBe("shadow");
  });
});
