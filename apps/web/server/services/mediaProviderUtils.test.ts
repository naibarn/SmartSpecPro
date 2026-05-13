import { describe, expect, it } from "vitest";

import { calculateCreditCost } from "./pricingCalculator";
import { getStaticModelById } from "./modelRegistry";
import {
  buildElevenLabsModelConfigJson,
  buildElevenLabsModelSeeds,
  buildMagnificModelConfigJson,
  buildMagnificModelSeeds,
  buildWaveSpeedModelConfigJson,
  buildWaveSpeedModelSeeds,
  assertRelativeUploadMediaReferencePath,
  getMagnificProviderAvailableModels,
  getElevenLabsProviderAvailableModels,
  buildWaveSpeedLaunchModelConfigJson,
  buildWaveSpeedLaunchModelSeed,
  getWaveSpeedProviderAvailableModels,
  isReferenceImageRequiredFromConfig,
  normalizeMediaProviderName,
  normalizeMagnificBaseUrl,
  normalizePersistedMediaProviderBaseUrl,
  normalizeRelativeMediaEndpointPath,
  normalizeWaveSpeedBaseUrl,
  sanitizeMediaModelConfigJson,
  ELEVENLABS_PROVIDER,
  ELEVENLABS_TEXT_TO_SPEECH_MODEL_ID,
  ELEVENLABS_SPEECH_TO_TEXT_MODEL_ID,
  ELEVENLABS_SOUND_EFFECTS_MODEL_ID,
  ELEVENLABS_VOICE_CHANGER_MODEL_ID,
  ELEVENLABS_VOICE_ISOLATOR_MODEL_ID,
  WAVESPEED_ELEVENLABS_ELEVEN_V3_MODEL_ID,
  WAVESPEED_GEMINI_25_FLASH_TTS_MODEL_ID,
  WAVESPEED_ELEVENLABS_VOICE_CHANGER_MODEL_ID,
  WAVESPEED_LAUNCH_MODEL_ID,
  WAVESPEED_LYRIA_3_PRO_MUSIC_MODEL_ID,
  WAVESPEED_SEEDANCE_2_FAST_IMAGE_TO_VIDEO_MODEL_ID,
  WAVESPEED_SEEDANCE_2_TEXT_TO_VIDEO_MODEL_ID,
} from "./mediaProviderUtils";

describe("mediaProviderUtils", () => {
  it("normalizes WaveSpeed provider aliases without regressing existing providers", () => {
    expect(normalizeMediaProviderName("wavespeed_ai")).toBe("wavespeed_ai");
    expect(normalizeMediaProviderName("wavespeed-ai")).toBe("wavespeed_ai");
    expect(normalizeMediaProviderName("wavespeed ai")).toBe("wavespeed_ai");
    expect(normalizeMediaProviderName("wavespeedai")).toBe("wavespeed_ai");
    expect(normalizeMediaProviderName("elevenlabs")).toBe("elevenlabs");
    expect(normalizeMediaProviderName("eleven_labs")).toBe("elevenlabs");
    expect(normalizeMediaProviderName("elevenlabs_ai")).toBe("elevenlabs");
    expect(normalizeMediaProviderName("kie.ai")).toBe("kie_ai");
  });

  it("normalizes Magnific provider aliases without regressing existing providers", () => {
    expect(normalizeMediaProviderName("magnific")).toBe("magnific");
    expect(normalizeMediaProviderName("magnific_api")).toBe("magnific");
    expect(normalizeMediaProviderName("magnific-ai")).toBe("magnific");
    expect(normalizeMediaProviderName("magnific ai")).toBe("magnific");
    expect(normalizeMediaProviderName("wavespeed-ai")).toBe("wavespeed_ai");
    expect(normalizeMediaProviderName("elevenlabs_ai")).toBe("elevenlabs");
    expect(normalizeMediaProviderName("kie.ai")).toBe("kie_ai");
  });

  it("normalizes both service-root and api-root WaveSpeed base URLs to a single api root", () => {
    expect(normalizeWaveSpeedBaseUrl("https://api.wavespeed.ai")).toBe("https://api.wavespeed.ai/api/v3");
    expect(normalizeWaveSpeedBaseUrl("https://api.wavespeed.ai/api/v3")).toBe("https://api.wavespeed.ai/api/v3");
    expect(normalizeWaveSpeedBaseUrl("https://proxy.example.com/wavespeed")).toBe("https://proxy.example.com/wavespeed/api/v3");
  });

  it("normalizes Magnific base URLs while requiring public HTTPS hosts", () => {
    expect(normalizeMagnificBaseUrl("https://api.magnific.com/")).toBe("https://api.magnific.com");
    expect(normalizePersistedMediaProviderBaseUrl("magnific_api", "https://api.magnific.com/")).toBe("https://api.magnific.com");
    expect(() => normalizeMagnificBaseUrl("http://api.magnific.com")).toThrow(/https/i);
    expect(() => normalizeMagnificBaseUrl("https://127.0.0.1")).toThrow(/public host/i);
    expect(() => normalizePersistedMediaProviderBaseUrl("magnific", "https://metadata.google.internal")).toThrow(/public host/i);
  });

  it("rejects unsafe absolute and traversal endpoint metadata", () => {
    expect(() => normalizeRelativeMediaEndpointPath("https://evil.example.com/submit")).toThrow(/relative/i);
    expect(() => normalizeRelativeMediaEndpointPath("//evil.example.com/submit")).toThrow(/relative/i);
    expect(() => normalizeRelativeMediaEndpointPath("/predictions/../result")).toThrow(/\.\./i);
    expect(() => normalizeRelativeMediaEndpointPath("/predictions/%2e%2e/result")).toThrow(/\.\./i);
    expect(() => normalizeRelativeMediaEndpointPath("%68%74%74%70%73%3A%2F%2Fevil.example.com/submit")).toThrow(/relative/i);
    expect(() => normalizeRelativeMediaEndpointPath("/predictions/{jobId}/result", { allowRequestIdPlaceholder: true })).toThrow(/placeholder/i);
    expect(normalizeRelativeMediaEndpointPath("/v1/ai/mystic/{taskId}", { allowedPlaceholders: ["taskId"] })).toBe("/v1/ai/mystic/{taskId}");
  });

  it("only allows relative media asset paths under the public upload/storage routes", () => {
    expect(() => assertRelativeUploadMediaReferencePath("/uploads/reference.png")).not.toThrow();
    expect(() => assertRelativeUploadMediaReferencePath("/api/storage/files/uploads/reference.png")).not.toThrow();
    expect(() => assertRelativeUploadMediaReferencePath("/api/private.png")).toThrow(/\/uploads\/ or \/api\/storage\/files\//i);
    expect(() => assertRelativeUploadMediaReferencePath("/uploads/%2e%2e/private.png")).toThrow(/\.\./i);
    expect(() => assertRelativeUploadMediaReferencePath("/api/storage/files/%2e%2e/private.png")).toThrow(/\.\./i);
  });

  it("sanitizes persisted model config by keeping endpoints relative-only and canonicalizing provider names", () => {
    const sanitized = sanitizeMediaModelConfigJson({
      apiEndpoint: "wavespeed-ai/cinematic-video-generator",
      apiQueryEndpoint: "/predictions/{requestId}/result",
      apiConfig: {
        provider: "wavespeed-ai",
      },
    });

    expect(sanitized).toEqual({
      apiEndpoint: "/wavespeed-ai/cinematic-video-generator",
      apiQueryEndpoint: "/predictions/{requestId}/result",
      apiConfig: {
        provider: "wavespeed_ai",
      },
    });
  });

  it("builds the shared WaveSpeed launch model config with pricing and input caps", () => {
    const config = buildWaveSpeedLaunchModelConfigJson();

    expect(config).toMatchObject({
      apiPayloadFormat: "wavespeed",
      generateType: "text-to-video",
      providerModelId: WAVESPEED_LAUNCH_MODEL_ID,
      apiEndpoint: "/wavespeed-ai/cinematic-video-generator",
      apiQueryEndpoint: "/predictions/{requestId}/result",
      pricingFormula: "per_duration",
      nativeAudio: true,
      useSyncMode: false,
      maxReferenceImages: 4,
    });
    expect(config.pricingTiers).toEqual({
      "5s": 800,
      "10s": 1600,
      "15s": 2400,
    });
    expect(config.inputFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "image_urls",
          syncWith: "reference_images",
          maxItems: 4,
        }),
      ]),
    );
  });

  it("builds the WaveSpeed launch model seed with the expected DB metadata contract", () => {
    const seedModel = buildWaveSpeedLaunchModelSeed();

    expect(seedModel).toMatchObject({
      modelId: WAVESPEED_LAUNCH_MODEL_ID,
      provider: "wavespeed_ai",
      modelType: "video",
      creditCost: 800,
      durations: [5, 10, 15],
      aspectRatios: ["16:9", "9:16", "4:3", "3:4"],
      priority: 6,
      sortOrder: 60,
      isEnabled: true,
    });
    expect(seedModel.configJson).toMatchObject({
      apiPayloadFormat: "wavespeed",
      generateType: "text-to-video",
      nativeAudio: true,
      useSyncMode: false,
      pricingFormula: "per_duration",
    });
  });

  it("builds additive WaveSpeed Seedance 2.0 configs without changing the cinematic launch contract", () => {
    const standardText = buildWaveSpeedModelConfigJson(WAVESPEED_SEEDANCE_2_TEXT_TO_VIDEO_MODEL_ID);
    const fastImage = buildWaveSpeedModelConfigJson(WAVESPEED_SEEDANCE_2_FAST_IMAGE_TO_VIDEO_MODEL_ID);

    expect(standardText).toMatchObject({
      generateType: "text-to-video",
      providerModelId: WAVESPEED_SEEDANCE_2_TEXT_TO_VIDEO_MODEL_ID,
      apiEndpoint: "/bytedance/seedance-2.0/text-to-video",
      pricingFormula: "per_duration",
      maxReferenceImages: 4,
      requiresReferenceImages: false,
    });
    expect(fastImage).toMatchObject({
      generateType: "image-to-video",
      providerModelId: WAVESPEED_SEEDANCE_2_FAST_IMAGE_TO_VIDEO_MODEL_ID,
      apiEndpoint: "/bytedance/seedance-2.0-fast/image-to-video",
      maxReferenceImages: 4,
      requiresReferenceImages: true,
    });
    expect(isReferenceImageRequiredFromConfig(fastImage)).toBe(true);
    expect(fastImage.inputFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "image_urls",
          required: true,
          maxItems: 4,
        }),
      ]),
    );
  });

  it("exposes all WaveSpeed models for templates and seeds", () => {
    const seeds = buildWaveSpeedModelSeeds();
    const providerModels = getWaveSpeedProviderAvailableModels();

    expect(seeds).toHaveLength(12);
    expect(providerModels).toHaveLength(12);
    expect(seeds.map((seed) => seed.modelId)).toEqual(expect.arrayContaining([
      WAVESPEED_LAUNCH_MODEL_ID,
      WAVESPEED_SEEDANCE_2_TEXT_TO_VIDEO_MODEL_ID,
      WAVESPEED_SEEDANCE_2_FAST_IMAGE_TO_VIDEO_MODEL_ID,
      WAVESPEED_GEMINI_25_FLASH_TTS_MODEL_ID,
      WAVESPEED_LYRIA_3_PRO_MUSIC_MODEL_ID,
      WAVESPEED_ELEVENLABS_ELEVEN_V3_MODEL_ID,
      WAVESPEED_ELEVENLABS_VOICE_CHANGER_MODEL_ID,
    ]));
    expect(providerModels.find((model) => model.id === WAVESPEED_ELEVENLABS_ELEVEN_V3_MODEL_ID)?.type).toBe("audio");
    expect(providerModels.find((model) => model.id === WAVESPEED_GEMINI_25_FLASH_TTS_MODEL_ID)?.type).toBe("audio");
  });

  it("exposes Magnific provider models for admin templates and provider seeds", () => {
    const providerModels = getMagnificProviderAvailableModels();

    expect(providerModels).toHaveLength(34);
    expect(providerModels).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "magnific/mystic", type: "image" }),
      expect.objectContaining({ id: "magnific/remove-background", type: "image" }),
      expect.objectContaining({ id: "magnific/veo-3-1-text-to-video-fast", type: "video" }),
      expect.objectContaining({ id: "magnific/video-upscaler-precision", type: "video" }),
    ]));
  });

  it("builds Magnific model seeds with required endpoint, pricing, readiness, and inventory metadata", () => {
    const seeds = buildMagnificModelSeeds();

    expect(seeds).toHaveLength(34);
    expect(seeds.map((seed) => seed.modelId)).toEqual(getMagnificProviderAvailableModels().map((model) => model.id));
    for (const seed of seeds) {
      expect(seed.provider).toBe("magnific");
      expect(seed.configJson).toMatchObject({
        provider: "magnific",
        providerModelId: seed.modelId,
        modelFamily: seed.modelFamily,
        dispatchMode: expect.any(String),
        resultType: expect.any(String),
        pricingStatus: "estimated",
        pricingSource: "magnific-docs-or-admin",
        pricingLastReviewedAt: "2026-05-06",
        adminVisible: true,
      });
      expect((seed.configJson.endpoint as any).submit).toMatch(/^\//);
      expect(Array.isArray(seed.configJson.outputExtractors)).toBe(true);
      expect(Array.isArray(seed.configJson.inputFields)).toBe(true);
      expect(seed.configJson.validation).toEqual(expect.objectContaining({
        requirePublicHttpsMediaUrls: true,
        rejectWebhookUrl: true,
      }));
      expect(seed.configJson.pricing).toEqual(expect.objectContaining({
        defaultCredits: seed.creditCost,
      }));
    }
  });

  it("keeps all Veo 3.1 Magnific concrete records under one normalized family", () => {
    const veoSeeds = buildMagnificModelSeeds().filter((seed) => seed.modelId.includes("veo-3-1"));

    expect(veoSeeds).toHaveLength(5);
    expect(new Set(veoSeeds.map((seed) => seed.modelFamily))).toEqual(new Set(["magnific/veo-3-1"]));
  });

  it("marks Magnific video and upscaler seeds rollout-safe by default", () => {
    const seeds = buildMagnificModelSeeds();
    const imageSeed = seeds.find((seed) => seed.modelId === "magnific/mystic");
    const videoSeed = seeds.find((seed) => seed.modelId === "magnific/veo-3-1-text-to-video");
    const upscalerSeed = seeds.find((seed) => seed.modelId === "magnific/video-upscaler-precision");

    expect(imageSeed?.isEnabled).toBe(true);
    expect(imageSeed?.configJson.readinessReason).toBe("estimated-pricing");
    expect(videoSeed?.isEnabled).toBe(false);
    expect(videoSeed?.configJson.readinessReason).toBe("estimated-pricing; staging-smoke-required");
    expect(upscalerSeed?.isEnabled).toBe(false);
    expect(upscalerSeed?.configJson.readinessReason).toBe("estimated-pricing; staging-smoke-required; high-cost");
  });

  it("builds Magnific endpoint configs with relative status paths and sync Remove Background metadata", () => {
    const mystic = buildMagnificModelConfigJson("magnific/mystic");
    const removeBackground = buildMagnificModelConfigJson("magnific/remove-background");

    expect(mystic).toMatchObject({
      endpoint: {
        submit: "/v1/ai/mystic",
        status: "/v1/ai/mystic/{taskId}",
      },
      dispatchMode: "async-polling",
      resultType: "image",
    });
    expect(removeBackground).toMatchObject({
      endpoint: {
        submit: "/v1/ai/beta/remove-background",
      },
      dispatchMode: "sync",
      resultType: "image-set",
    });
    expect((removeBackground.endpoint as any).status).toBeUndefined();
  });

  it("adds provider-discovered LoRA selectors only to Magnific Mystic metadata", () => {
    const mystic = buildMagnificModelConfigJson("magnific/mystic");
    const seedream = buildMagnificModelConfigJson("magnific/seedream-v5-lite");
    const mysticFields = mystic.inputFields ?? [];

    expect(mysticFields).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "style_lora_id",
        type: "select",
        optionsSource: expect.objectContaining({
          type: "provider_api",
          endpoint: "/v1/ai/loras",
          itemsPath: "data",
          valueField: "id",
          labelField: "name",
          queryParam: "query",
        }),
      }),
      expect.objectContaining({
        key: "character_lora_id",
        type: "select",
        optionsSource: expect.objectContaining({
          type: "provider_api",
          endpoint: "/v1/ai/loras",
        }),
      }),
    ]));
    expect((seedream.inputFields ?? []).some((field: any) => field.key === "style_lora_id")).toBe(false);
    expect((seedream.inputFields ?? []).some((field: any) => field.key === "character_lora_id")).toBe(false);
  });

  it("builds WaveSpeed audio model configs with per-unit and flat pricing", () => {
    const geminiFlash = buildWaveSpeedModelConfigJson(WAVESPEED_GEMINI_25_FLASH_TTS_MODEL_ID);
    const lyriaPro = buildWaveSpeedModelConfigJson(WAVESPEED_LYRIA_3_PRO_MUSIC_MODEL_ID);
    const elevenV3 = buildWaveSpeedModelConfigJson(WAVESPEED_ELEVENLABS_ELEVEN_V3_MODEL_ID);
    const voiceChanger = buildWaveSpeedModelConfigJson(WAVESPEED_ELEVENLABS_VOICE_CHANGER_MODEL_ID);

    expect(geminiFlash).toMatchObject({
      generateType: "text-to-speech",
      providerModelId: WAVESPEED_GEMINI_25_FLASH_TTS_MODEL_ID,
      apiEndpoint: "/google/gemini-2.5-flash/text-to-speech",
      pricingFormula: "per_unit",
      pricingUnitMetric: "characters",
      pricingUnitField: "text",
      pricingUnitSize: 1000,
      pricingTiers: { default: 40 },
    });
    expect(lyriaPro).toMatchObject({
      generateType: "music",
      providerModelId: WAVESPEED_LYRIA_3_PRO_MUSIC_MODEL_ID,
      apiEndpoint: "/google/lyria-3-pro/music",
      pricingFormula: "flat",
      pricingTiers: { default: 80 },
      textInputKey: "prompt",
    });
    expect(elevenV3).toMatchObject({
      generateType: "text-to-speech",
      providerModelId: WAVESPEED_ELEVENLABS_ELEVEN_V3_MODEL_ID,
      apiEndpoint: "/elevenlabs/eleven-v3",
      pricingFormula: "per_unit",
      pricingUnitMetric: "characters",
      pricingUnitField: "text",
      pricingUnitSize: 1000,
      pricingTiers: { default: 30 },
      maxPromptLength: 1000,
      textInputKey: "text",
    });
    expect(elevenV3.inputFields).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "text",
        syncWith: "prompt",
        maxLength: 1000,
      }),
    ]));
    expect(voiceChanger).toMatchObject({
      generateType: "audio-to-audio",
      providerModelId: WAVESPEED_ELEVENLABS_VOICE_CHANGER_MODEL_ID,
      apiEndpoint: "/elevenlabs/voice-changer",
      pricingFormula: "flat",
      pricingTiers: { default: 50 },
      omitTextInput: true,
    });
    expect(voiceChanger.inputFields).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "audio",
        type: "audio_urls",
        required: true,
        maxItems: 1,
      }),
    ]));
  });

  it("keeps WaveSpeed-prefixed audio model aliases in the static seeds", () => {
    const seeds = buildWaveSpeedModelSeeds();
    const geminiFlash = seeds.find((seed) => seed.modelId === WAVESPEED_GEMINI_25_FLASH_TTS_MODEL_ID);
    const lyriaPro = seeds.find((seed) => seed.modelId === WAVESPEED_LYRIA_3_PRO_MUSIC_MODEL_ID);

    expect(geminiFlash?.aliases).toContain("wavespeed/gemini-2.5-flash/text-to-speech");
    expect(lyriaPro?.aliases).toContain("wavespeed/lyria-3-pro/music");
  });

  it("exposes the launch model through the static registry with tiered fallback pricing", () => {
    const model = getStaticModelById(WAVESPEED_LAUNCH_MODEL_ID);

    expect(model).toBeDefined();
    expect(model?.provider).toBe("wavespeed_ai");
    expect(model?.durations).toEqual([5, 10, 15]);
    expect(model?.aspectRatios).toEqual(["16:9", "9:16", "4:3", "3:4"]);
    expect(model?.configJson?.pricingFormula).toBe("per_duration");
    expect(model?.configJson?.pricingTiers).toEqual({
      "5s": 800,
      "10s": 1600,
      "15s": 2400,
    });
  });

  it("keeps duration-tier pricing aligned during DB-miss fallback calculations", () => {
    const model = getStaticModelById(WAVESPEED_LAUNCH_MODEL_ID);
    expect(model).toBeDefined();

    expect(calculateCreditCost(model!, { duration: 5 })).toBe(800);
    expect(calculateCreditCost(model!, { duration: 10 })).toBe(1600);
    expect(calculateCreditCost(model!, { duration: 15 })).toBe(2400);
  });

  it("adds Seedance 2.0 Image-to-Video to the static registry with its own pricing tier", () => {
    const model = getStaticModelById(WAVESPEED_SEEDANCE_2_FAST_IMAGE_TO_VIDEO_MODEL_ID);
    expect(model).toBeDefined();
    expect(model?.configJson?.generateType).toBe("image-to-video");
    expect(model?.configJson?.apiEndpoint).toBe("/bytedance/seedance-2.0-fast/image-to-video");
    expect(calculateCreditCost(model!, { duration: 5 })).toBe(600);
  });

  it("builds direct ElevenLabs model seeds with endpoint, content type, response type, and pricing metadata", () => {
    const seeds = buildElevenLabsModelSeeds();
    const providerModels = getElevenLabsProviderAvailableModels();

    expect(seeds).toHaveLength(5);
    expect(providerModels).toHaveLength(5);
    expect(seeds.map((seed) => seed.modelId)).toEqual([
      ELEVENLABS_VOICE_CHANGER_MODEL_ID,
      ELEVENLABS_TEXT_TO_SPEECH_MODEL_ID,
      ELEVENLABS_SPEECH_TO_TEXT_MODEL_ID,
      ELEVENLABS_SOUND_EFFECTS_MODEL_ID,
      ELEVENLABS_VOICE_ISOLATOR_MODEL_ID,
    ]);
    expect(seeds.every((seed) => seed.provider === ELEVENLABS_PROVIDER)).toBe(true);

    const tts = buildElevenLabsModelConfigJson(ELEVENLABS_TEXT_TO_SPEECH_MODEL_ID);
    const stt = buildElevenLabsModelConfigJson(ELEVENLABS_SPEECH_TO_TEXT_MODEL_ID);
    const voiceChanger = buildElevenLabsModelConfigJson(ELEVENLABS_VOICE_CHANGER_MODEL_ID);
    const soundEffects = buildElevenLabsModelConfigJson(ELEVENLABS_SOUND_EFFECTS_MODEL_ID);
    const voiceIsolator = buildElevenLabsModelConfigJson(ELEVENLABS_VOICE_ISOLATOR_MODEL_ID);

    expect(tts).toMatchObject({
      apiPayloadFormat: "elevenlabs",
      elevenlabsCapability: "text_to_speech",
      apiEndpoint: "/v1/text-to-speech/{voice_id}",
      requestContentType: "json",
      responseType: "audio",
      pricingFormula: "per_unit",
      pricingUnitMetric: "characters",
      pricingUnitField: "text",
    });
    expect(stt).toMatchObject({
      elevenlabsCapability: "speech_to_text",
      apiEndpoint: "/v1/speech-to-text",
      requestContentType: "multipart",
      responseType: "json",
      pricingUnitMetric: "minutes",
      pricingUnitField: "estimated_duration_minutes",
    });
    expect(voiceChanger).toMatchObject({
      elevenlabsCapability: "voice_changer",
      apiEndpoint: "/v1/speech-to-speech/{voice_id}",
      requestContentType: "multipart",
      responseType: "audio",
    });
    expect(soundEffects).toMatchObject({
      elevenlabsCapability: "sound_effects",
      apiEndpoint: "/v1/sound-generation",
      requestContentType: "json",
      responseType: "audio",
      pricingUnitMetric: "seconds",
      pricingUnitField: "duration_seconds",
    });
    expect(voiceIsolator).toMatchObject({
      elevenlabsCapability: "voice_isolator",
      apiEndpoint: "/v1/audio-isolation",
      requestContentType: "multipart",
      responseType: "audio",
    });
    expect(voiceChanger.inputFields).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "audio", type: "audio_urls", required: true, maxItems: 1 }),
      expect.objectContaining({
        key: "voice_id",
        required: true,
        default: "21m00Tcm4TlvDq8ikWAM",
        options: expect.arrayContaining([
          { value: "21m00Tcm4TlvDq8ikWAM", label: "Rachel" },
          { value: "pNInz6obpgDQGcFmaJgB", label: "Adam" },
        ]),
        optionsSource: expect.objectContaining({
          type: "provider_api",
          endpoint: "/v2/voices?page_size=100&sort=name&sort_direction=asc&include_total_count=false",
          itemsPath: "voices",
          valueField: "voice_id",
          labelField: "name",
          queryParam: "search",
        }),
      }),
    ]));
    expect(tts.inputFields).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "voice_id",
        default: "21m00Tcm4TlvDq8ikWAM",
        optionsSource: expect.objectContaining({
          type: "provider_api",
          endpoint: "/v2/voices?page_size=100&sort=name&sort_direction=asc&include_total_count=false",
        }),
      }),
    ]));
  });

  it("exposes direct ElevenLabs models through the static registry", () => {
    const model = getStaticModelById(ELEVENLABS_TEXT_TO_SPEECH_MODEL_ID);

    expect(model).toBeDefined();
    expect(model?.provider).toBe(ELEVENLABS_PROVIDER);
    expect(model?.type).toBe("audio");
    expect(model?.configJson?.elevenlabsCapability).toBe("text_to_speech");
  });
});
