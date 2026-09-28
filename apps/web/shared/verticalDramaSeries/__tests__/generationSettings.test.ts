import { describe, expect, it } from "vitest";

import {
  normalizeVerticalDramaEpisodeGenerationSettings,
  verticalDramaEpisodeGenerationSettingsSchema,
} from "../generationSettings";

describe("vertical drama episode generation settings", () => {
  it("keeps image and LLM controls independent", () => {
    const parsed = verticalDramaEpisodeGenerationSettingsSchema.parse({
      image: { quality: "high", modelId: "wavespeed/gpt-image-2.5" },
      llm: {
        reasoning: {
          mode: "effort",
          effort: "xhigh",
          modelId: "openrouter/model",
        },
      },
    });

    expect(parsed.image?.quality).toBe("high");
    expect(parsed.llm?.reasoning?.effort).toBe("xhigh");
  });

  it("normalizes legacy, null, or malformed JSON to safe auto settings", () => {
    expect(normalizeVerticalDramaEpisodeGenerationSettings(null)).toEqual({});
    const normalized = normalizeVerticalDramaEpisodeGenerationSettings({
      image: { quality: "high", unexpected: true },
    });
    expect(normalized.image?.quality).toBe("high");
    expect(
      (normalized.image as Record<string, unknown>).unexpected
    ).toBeUndefined();
  });
});
