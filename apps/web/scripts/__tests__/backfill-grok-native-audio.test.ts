import { describe, expect, it } from "vitest";
import { planGrokNativeAudioBackfill } from "../backfill-grok-native-audio";

describe("planGrokNativeAudioBackfill", () => {
  it("repairs every provider's Grok video row while preserving unrelated config", () => {
    const repairs = planGrokNativeAudioBackfill([
      { modelId: "higgsfield/grok_video", modelType: "video", configJson: { transport: "mcp" } },
      { modelId: "kie/grok-video", modelType: "video", configJson: { hasAudio: false } },
      { modelId: "magnific/video", modelType: "video", configJson: { providerModelId: "grok_video_next" } },
    ]);

    expect(repairs.map(repair => repair.modelId)).toEqual([
      "higgsfield/grok_video",
      "kie/grok-video",
      "magnific/video",
    ]);
    expect(repairs[0]?.after).toEqual({ transport: "mcp", hasAudio: true, nativeAudio: true });
  });

  it("is idempotent and excludes Grok image/non-Grok video rows", () => {
    expect(
      planGrokNativeAudioBackfill([
        {
          modelId: "higgsfield/grok_video",
          modelType: "video",
          configJson: { hasAudio: true, nativeAudio: true },
        },
        { modelId: "higgsfield/grok_image", modelType: "image", configJson: {} },
        { modelId: "higgsfield/veo", modelType: "video", configJson: {} },
      ]),
    ).toEqual([]);
  });
});
