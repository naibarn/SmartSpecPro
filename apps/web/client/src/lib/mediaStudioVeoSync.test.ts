import { describe, expect, it } from "vitest";

import {
  SELECTED_MEDIA_STUDIO_VEO_MODEL,
  buildMediaStudioToVeoSkillSync,
  buildVeoSkillToMediaStudioSync,
  getVeoProviderModelId,
  isVeoProviderModelId,
  normalizeVeoAspectRatioForGenerationType,
  resolveVeoSyncedAspectRatio,
  sanitizeVeoStoryboardSkillInputs,
} from "./mediaStudioVeoSync";

const models = [
  {
    modelId: "veo3/generate-veo-3-video-lite",
    configJson: { kieModelId: "veo3_lite" },
  },
  {
    modelId: "veo3/generate-veo-3-video-fast",
    configJson: { kieModelId: "veo3_fast" },
  },
  {
    modelId: "veo4/generate-video-fast",
    configJson: { kieModelId: "veo4_fast" },
  },
];

describe("mediaStudioVeoSync", () => {
  it("syncs skill Veo options into Media Studio model inputs", () => {
    const sync = buildVeoSkillToMediaStudioSync({
      skillValues: {
        veoModel: "veo3_fast",
        generationType: "REFERENCE_2_VIDEO",
        outputQuality: "1080p",
        enableTranslation: true,
        enableFallback: true,
        watermark: "Brand",
      },
      selectedModel: "veo3/generate-veo-3-video-lite",
      visibleModels: models,
      aspectRatio: "auto",
    });

    expect(sync.selectedModelId).toBe("veo3/generate-veo-3-video-fast");
    expect(sync.modelInputPatch).toMatchObject({
      generationType: "REFERENCE_2_VIDEO",
      resolution: "1080p",
      enableTranslation: true,
      enableFallback: true,
      watermark: "Brand",
      aspect_ratio: "16:9",
    });
    expect(sync.aspectRatio).toBe("16:9");
  });

  it("keeps Media Studio aspect ratio as the source of truth when a seeded skill value is still auto", () => {
    const sync = buildVeoSkillToMediaStudioSync({
      skillValues: {
        veoModel: "veo3_lite",
        generationType: "TEXT_2_VIDEO",
        outputQuality: "720p",
        aspectRatio: "auto",
      },
      selectedModel: "veo3/generate-veo-3-video-lite",
      visibleModels: models,
      aspectRatio: "9:16",
    });

    expect(sync.aspectRatio).toBeUndefined();
    expect(sync.modelInputPatch.aspect_ratio).toBe("9:16");
  });

  it("does not let stale skill aspect ratios override Media Studio controls", () => {
    const sync = buildVeoSkillToMediaStudioSync({
      skillValues: {
        veoModel: "veo3_lite",
        generationType: "TEXT_2_VIDEO",
        outputQuality: "720p",
        aspectRatio: "16:9",
      },
      selectedModel: "veo3/generate-veo-3-video-lite",
      visibleModels: models,
      aspectRatio: "9:16",
    });

    expect(sync.aspectRatio).toBeUndefined();
    expect(sync.modelInputPatch.aspect_ratio).toBe("9:16");
  });

  it("moves reference-to-video to the available Fast Veo model", () => {
    const sync = buildVeoSkillToMediaStudioSync({
      skillValues: {
        veoModel: "veo3_lite",
        generationType: "REFERENCE_2_VIDEO",
        outputQuality: "720p",
      },
      selectedModel: "veo3/generate-veo-3-video-lite",
      visibleModels: models,
      aspectRatio: "16:9",
    });

    expect(sync.selectedModelId).toBe("veo3/generate-veo-3-video-fast");
    expect(sync.resolvedProviderModel).toBe("veo3_fast");
  });

  it("does not produce patches for non-Veo selected models", () => {
    const sync = buildVeoSkillToMediaStudioSync({
      skillValues: {
        veoModel: SELECTED_MEDIA_STUDIO_VEO_MODEL,
        generationType: "TEXT_2_VIDEO",
        outputQuality: "720p",
      },
      selectedModel: "kling-2.6",
      visibleModels: [{ modelId: "kling-2.6", configJson: { kieModelId: "kling-2.6" } }],
      aspectRatio: "16:9",
    });

    expect(sync.selectedModelId).toBeUndefined();
    expect(sync.modelInputPatch).toEqual({});
  });

  it("does not force a non-Veo user selection back to stale Veo skill defaults", () => {
    const sync = buildVeoSkillToMediaStudioSync({
      skillValues: {
        veoModel: "veo3_lite",
        generationType: "TEXT_2_VIDEO",
        outputQuality: "720p",
      },
      selectedModel: "kling-2.6",
      visibleModels: [
        ...models,
        { modelId: "kling-2.6", configJson: { kieModelId: "kling-2.6" } },
      ],
      aspectRatio: "16:9",
    });

    expect(sync.selectedModelId).toBeUndefined();
    expect(sync.modelInputPatch).toEqual({});
  });

  it("keeps future Veo models synced through the selected-model option", () => {
    const patch = buildMediaStudioToVeoSkillSync({
      selectedModelData: models[2],
      modelInputValues: {
        generationType: "TEXT_2_VIDEO",
        resolution: "720p",
        aspect_ratio: "9:16",
        enableFallback: true,
      },
      aspectRatio: "9:16",
    });

    expect(patch).toMatchObject({
      veoModel: SELECTED_MEDIA_STUDIO_VEO_MODEL,
      veoProviderModel: "veo4_fast",
      generationType: "TEXT_2_VIDEO",
      outputQuality: "720p",
      aspectRatio: "9:16",
      enableFallback: true,
    });
  });

  it("does not replace a future selected Veo model with the auto-seeded Lite default", () => {
    const sync = buildVeoSkillToMediaStudioSync({
      skillValues: {
        veoModel: "veo3_lite",
        generationType: "TEXT_2_VIDEO",
        outputQuality: "720p",
      },
      selectedModel: "veo4/generate-video-fast",
      visibleModels: models,
      aspectRatio: "16:9",
    });

    expect(sync.selectedModelId).toBeUndefined();
    expect(sync.resolvedProviderModel).toBe("veo4_fast");
  });

  it("keeps future Veo provider ids instead of coercing them to Veo 3.1", () => {
    expect(getVeoProviderModelId({ modelId: "google-veo-4-fast" })).toBe("google-veo-4-fast");
    expect(isVeoProviderModelId("google-veo-4-fast")).toBe(true);
  });

  it("normalizes reference-to-video auto aspect ratio to a provider-supported explicit ratio", () => {
    expect(normalizeVeoAspectRatioForGenerationType("REFERENCE_2_VIDEO", "auto")).toBe("16:9");
    expect(normalizeVeoAspectRatioForGenerationType("REFERENCE_2_VIDEO", "9:16")).toBe("9:16");
    expect(normalizeVeoAspectRatioForGenerationType("TEXT_2_VIDEO", "auto")).toBe("auto");
  });

  it("resolves generation aspect ratio from Media Studio before stale skill defaults", () => {
    expect(resolveVeoSyncedAspectRatio({
      generationType: "TEXT_2_VIDEO",
      studioAspectRatio: "9:16",
      modelInputValues: { aspect_ratio: "9:16" },
      skillAspectRatio: "auto",
    })).toBe("9:16");
  });

  it("removes news-only defaults outside news narration mode", () => {
    expect(sanitizeVeoStoryboardSkillInputs({
      contentMode: "storyboard",
      userIdea: "A product explainer",
      newsLanguageMode: "auto_detect",
      newsNarrationStyle: "explainer_news",
      newsSpeechPace: "brisk_news",
      audioPersona: "corporate_presentation",
      newsClipDensity: "detailed",
      maxSpokenSecondsPerClip: 6,
      dialogueLanguage: "en",
    })).toEqual({
      contentMode: "storyboard",
      userIdea: "A product explainer",
      audioPersona: "corporate_presentation",
      dialogueLanguage: "en",
    });
  });

  it("syncs news narration dialogue language from Thai source text", () => {
    expect(sanitizeVeoStoryboardSkillInputs({
      contentMode: "news_narration",
      userIdea: "ข่าวเทคโนโลยีวันนี้",
      newsLanguageMode: "auto_detect",
      dialogueLanguage: "en",
    })).toMatchObject({
      dialogueLanguage: "th",
    });
  });
});
