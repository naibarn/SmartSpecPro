import { describe, expect, it } from "vitest";

import {
  clientMessageRuntimeMetadataInputSchema,
  sanitizeMessageRuntimeMetadata,
} from "../localAiRuntimeMetadata";

describe("sanitizeMessageRuntimeMetadata", () => {
  it("forces unsupported sources back to cloud", () => {
    expect(
      sanitizeMessageRuntimeMetadata({
        source: "local" as never,
      }).source,
    ).toBe("cloud");
  });

  it("preserves known hybrid metadata", () => {
    expect(
      sanitizeMessageRuntimeMetadata({
        source: "hybrid",
        taskClass: "summarization",
        voiceInputMode: "auto",
        tokenSavedEstimate: 42,
      }),
    ).toMatchObject({
      source: "hybrid",
      taskClass: "summarization",
      voiceInputMode: "auto",
      tokenSavedEstimate: 42,
    });
  });

  it("accepts provider/model metadata that the client is allowed to persist", () => {
    expect(
      clientMessageRuntimeMetadataInputSchema.safeParse({
        source: "hybrid",
        provider: "openai_compatible_local",
        model: "HauhauCS/Gemma-4-E2B-Uncensored",
        fallbackReason: "external_local_backend_timeout",
      }).success,
    ).toBe(true);
  });

  it("normalizes oversized or invalid metadata values", () => {
    expect(
      sanitizeMessageRuntimeMetadata({
        fallbackReason: "x".repeat(500),
        tokenSavedEstimate: -10,
      }),
    ).toMatchObject({
      fallbackReason: "x".repeat(160),
      tokenSavedEstimate: null,
    });
  });
});
