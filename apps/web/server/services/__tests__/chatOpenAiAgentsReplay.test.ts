import { describe, expect, it } from "vitest";

import { compareChatReplaySnapshots } from "../agentRuntime/chatRuntimeOrchestrator";

describe("compareChatReplaySnapshots", () => {
  it("detects selected skill drift", () => {
    const result = compareChatReplaySnapshots(
      {
        selectedSkillSlug: "general-article-writer",
        selectedModelId: "openai/gpt-4.1-mini",
        selectedProviderName: "openrouter",
        traceShape: "events:3|tools:1",
        status: "completed",
      },
      {
        selectedSkillSlug: "brainstorm",
        selectedModelId: "openai/gpt-4.1-mini",
        selectedProviderName: "openrouter",
        traceShape: "events:3|tools:1",
        status: "completed",
      },
    );

    expect(result).toEqual({
      matches: false,
      mismatchCodes: ["selected_skill_drift"],
    });
  });

  it("detects trace shape drift", () => {
    const result = compareChatReplaySnapshots(
      {
        selectedSkillSlug: "general-article-writer",
        selectedModelId: "openai/gpt-4.1-mini",
        selectedProviderName: "openrouter",
        traceShape: "events:3|tools:1",
        status: "completed",
      },
      {
        selectedSkillSlug: "general-article-writer",
        selectedModelId: "openai/gpt-4.1-mini",
        selectedProviderName: "openrouter",
        traceShape: "events:4|tools:2",
        status: "completed",
      },
    );

    expect(result).toEqual({
      matches: false,
      mismatchCodes: ["trace_shape_drift"],
    });
  });
});
