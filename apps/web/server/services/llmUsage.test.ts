import { describe, expect, it } from "vitest";

import { normalizeLlmUsage } from "./llmUsage";

describe("normalizeLlmUsage", () => {
  it("normalizes Anthropic/messages usage", () => {
    expect(
      normalizeLlmUsage(
        {
          usage: {
            input_tokens: 14,
            output_tokens: 9,
            cost: 0.012,
          },
        },
        "messages",
      ),
    ).toEqual({
      inputTokens: 14,
      outputTokens: 9,
      totalTokens: 23,
      providerReportedCostUsd: 0.012,
    });
  });

  it("normalizes responses usage with credits_consumed metadata", () => {
    expect(
      normalizeLlmUsage(
        {
          usage: {
            input_tokens: 20,
            output_tokens: 5,
            total_tokens: 25,
            cost: 0.045,
          },
          credits_consumed: 45,
        },
        "responses",
      ),
    ).toEqual({
      inputTokens: 20,
      outputTokens: 5,
      totalTokens: 25,
      providerReportedCostUsd: 0.045,
      providerReportedCreditsConsumed: 45,
    });
  });

  it("falls back between prompt/completion and input/output token shapes", () => {
    expect(
      normalizeLlmUsage(
        {
          usage: {
            prompt_tokens: 7,
            completion_tokens: 3,
          },
        },
        "responses",
      ),
    ).toEqual({
      inputTokens: 7,
      outputTokens: 3,
      totalTokens: 10,
      providerReportedCostUsd: undefined,
      providerReportedCreditsConsumed: undefined,
    });
  });

  it("reads nested response.usage for responses-style providers", () => {
    expect(
      normalizeLlmUsage(
        {
          response: {
            usage: {
              input_tokens: 18,
              output_tokens: 6,
              total_tokens: 24,
              cost: 0.031,
            },
          },
          credits_consumed: 31,
        },
        "responses",
      ),
    ).toEqual({
      inputTokens: 18,
      outputTokens: 6,
      totalTokens: 24,
      providerReportedCostUsd: 0.031,
      providerReportedCreditsConsumed: 31,
    });
  });
});
