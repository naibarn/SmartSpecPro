import { describe, expect, it } from "vitest";

import {
  buildHiggsfieldCatalogMediaModels,
  buildMcpMediaModelConfigJson,
} from "../seed-media-models-mcp-providers";

describe("seed-media-models-mcp-providers", () => {
  it("includes Seedream 5.0 Pro as a Higgsfield MCP image model", () => {
    expect(buildHiggsfieldCatalogMediaModels()).toContainEqual(
      expect.objectContaining({
        modelId: "higgsfield/seedream_v5_pro",
        name: "Seedream 5.0 Pro (Higgsfield MCP)",
        modelType: "image",
        provider: "higgsfield",
        providerModelId: "seedream_v5_pro",
        toolName: "generate_image",
        argumentShape: "higgsfield.generate_image",
      })
    );
  });

  it("declares native audio explicitly for every Higgsfield Grok video seed", () => {
    const grokVideos = buildHiggsfieldCatalogMediaModels().filter(
      model => model.modelType === "video" && /grok/i.test(`${model.modelId} ${model.providerModelId}`)
    );
    expect(grokVideos.map(model => model.modelId)).toEqual([
      "higgsfield/grok_video_v15",
      "higgsfield/grok_video",
    ]);
    for (const model of grokVideos) {
      expect(model.nativeAudioDialogue).toBe(true);
      expect(model.supportsNativeAudio).toBe(true);
      expect(buildMcpMediaModelConfigJson(model)).toEqual(
        expect.objectContaining({ hasAudio: true, nativeAudio: true })
      );
    }
  });
});
