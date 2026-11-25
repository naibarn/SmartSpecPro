import { describe, expect, it } from "vitest";
import { isRetryableStagedImagePromptErrorForTest } from "../marketplaceAutoReviewStagedPipelineService";

describe("staged image prompt retry classification", () => {
  it("classifies an empty provider response as retryable", () => {
    const error = new Error(
      "MARKETPLACE_SINGLE_SHOT_SKILL_FAILED:All providers failed after 1 attempt(s): attempt 1 openrouter(openai/gpt-5.6-luna): empty_response - Provider returned HTTP 200 with no assistant text"
    );

    expect(isRetryableStagedImagePromptErrorForTest(error)).toBe(true);
  });

  it("does not retry provider configuration failures", () => {
    expect(
      isRetryableStagedImagePromptErrorForTest(
        new Error("MARKETPLACE_SKILL_PROVIDER_NOT_CONFIGURED")
      )
    ).toBe(false);
  });
});
