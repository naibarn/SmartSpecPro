import { describe, expect, it } from "vitest";

import {
  getVerticalDramaLlmReasoningEfforts,
  resolveVerticalDramaImageQualityExtraParams,
} from "../verticalDramaEpisodeGenerationSettings";

describe("Vertical Drama episode generation settings runtime", () => {
  it("emits quality only for the selected image model", () => {
    const model = {
      modelId: "wavespeed/gpt-image-2.5",
      configJson: {
        inputFields: [
          {
            key: "quality",
            options: [{ value: "low" }, { value: "high" }],
          },
        ],
      },
    };
    expect(
      resolveVerticalDramaImageQualityExtraParams({
        settings: {
          image: { quality: "high", modelId: model.modelId },
        },
        modelId: model.modelId,
        model,
      })
    ).toEqual({ quality: "high" });
    expect(
      resolveVerticalDramaImageQualityExtraParams({
        settings: {
          image: { quality: "high", modelId: "another-model" },
        },
        modelId: model.modelId,
        model,
      })
    ).toEqual({});
  });

  it("offers reasoning efforts only to thinking-capable OpenRouter models", () => {
    expect(
      getVerticalDramaLlmReasoningEfforts({
        providerName: "openrouter",
        supportsThinking: true,
      })
    ).toEqual(["minimal", "low", "medium", "high", "xhigh", "max"]);
    expect(
      getVerticalDramaLlmReasoningEfforts({
        providerName: "kie_ai",
        supportsThinking: true,
      })
    ).toEqual([]);
  });
});
