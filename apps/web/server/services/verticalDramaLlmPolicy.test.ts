import { describe, expect, it } from "vitest";

import {
  adaptVerticalDramaReasoningForProvider,
  resolveVerticalDramaLlmExtraBodyParams,
  resolveVerticalDramaTaskReasoningEffort,
  VERTICAL_DRAMA_REASONING_POLICY_KEY,
} from "./verticalDramaLlmPolicy";

describe("vertical drama LLM policy", () => {
  it("maps one user-facing profile to task-specific effort", () => {
    expect(resolveVerticalDramaTaskReasoningEffort({
      settings: { llm: { qualityProfile: "high" } },
      taskClass: "story_architecture",
    })).toBe("xhigh");
    expect(resolveVerticalDramaTaskReasoningEffort({
      settings: { llm: { qualityProfile: "balanced" } },
      taskClass: "clip_dialogue",
    })).toBe("low");
  });

  it("migrates legacy effort settings without requiring a UI migration", () => {
    expect(resolveVerticalDramaTaskReasoningEffort({
      settings: { llm: { reasoning: { mode: "effort", effort: "xhigh" } } },
      taskClass: "script_generation",
    })).toBe("max");
  });

  it("does not send provider-specific reasoning until the adapter sees OpenRouter capability", () => {
    const params = resolveVerticalDramaLlmExtraBodyParams({
      settings: { llm: { qualityProfile: "high" } },
      taskClass: "script_generation",
      extraBodyParams: { response_format: { type: "json_object" } },
    });
    expect(params[VERTICAL_DRAMA_REASONING_POLICY_KEY]).toMatchObject({ effort: "xhigh" });

    expect(adaptVerticalDramaReasoningForProvider({
      extraBodyParams: params,
      providerName: "wavespeed_ai",
      supportsThinking: true,
    })).toEqual({ response_format: { type: "json_object" } });

    expect(adaptVerticalDramaReasoningForProvider({
      extraBodyParams: params,
      providerName: "openrouter",
      supportsThinking: false,
    })).toEqual({ response_format: { type: "json_object" } });

    expect(adaptVerticalDramaReasoningForProvider({
      extraBodyParams: params,
      providerName: "openrouter",
      supportsThinking: true,
    })).toEqual({
      response_format: { type: "json_object" },
      reasoning: { effort: "xhigh", exclude: true },
    });
  });
});
