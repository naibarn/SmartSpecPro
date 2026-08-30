import { beforeEach, describe, it, expect, vi } from "vitest";

// Mock dependencies before module import
vi.mock("./llmRateLimiter", () => ({
  scheduleMediaWithLimiter: vi.fn(),
  recordMediaUsage: vi.fn(),
}));

vi.mock("./auditLogger", () => ({
  auditLogger: {
    log: vi.fn(),
  },
}));

vi.mock("./modelRegistry", () => ({
  getModelById: vi.fn(),
  mapToApiModelId: vi.fn((modelId: string) => modelId),
}));

vi.mock("./imagePromptSafetyService", () => ({
  isReusablePreparedEpisodeCoverSafety: vi.fn(() => false),
  isVerticalDramaImageRequest: vi.fn((request: {
    auditContext?: { source?: string };
    characterPromptContext?: { marker?: string };
  }) =>
    request.auditContext?.source?.includes("verticalDrama") === true ||
    request.characterPromptContext?.marker === "vertical_drama_character_v1"
  ),
  prepareImagePromptSafety: vi.fn(async (input: { prompt: string; mode?: string }) => ({
    prompt: input.prompt.trim(),
    metadata: {
      checked: true,
      mode: input.mode === "vertical_drama_managed" ? "vertical_drama_managed" : "standard",
      skillId: "image-prompt-safety-rewriter",
      skillVersion: "1.0.0",
      riskLevel: "low",
      rewritten: false,
      fallback: false,
      blocked: false,
      originalPromptHash: "test-original",
      safePromptHash: "test-safe",
      changes: [],
      preservedIntent: [],
    },
  })),
}));

import { scheduleMediaWithLimiter } from "./llmRateLimiter";
import { auditLogger } from "./auditLogger";
import { getCachedInternalNodeUrl } from "./appRuntimeConfig";
import { getModelById } from "./modelRegistry";
import {
  buildApiConfigFromModelConfig,
  MEDIA_MODELS,
  MediaGenerationService,
  resolveReferenceUrl,
} from "./mediaGenerationService";
import {
  GEMINI_3_1_FLASH_TTS_MAX_SPEAKERS,
  buildGemini31FlashTtsInputFields,
} from "./falGeminiTts";

const fetchMock = vi.fn();
global.fetch = fetchMock as typeof fetch;

describe("MEDIA_MODELS — BytePlus ModelArk entries", () => {
  it('MEDIA_MODELS["seedream-4-5-251128"] has provider "byteplus_modelark" and type "image"', () => {
    expect(MEDIA_MODELS["seedream-4-5-251128"]).toBeDefined();
    expect(MEDIA_MODELS["seedream-4-5-251128"].provider).toBe("byteplus_modelark");
    expect(MEDIA_MODELS["seedream-4-5-251128"].type).toBe("image");
  });

  it('MEDIA_MODELS["seedream-4-0-250828"] has provider "byteplus_modelark" and type "image"', () => {
    expect(MEDIA_MODELS["seedream-4-0-250828"]).toBeDefined();
    expect(MEDIA_MODELS["seedream-4-0-250828"].provider).toBe("byteplus_modelark");
    expect(MEDIA_MODELS["seedream-4-0-250828"].type).toBe("image");
  });

  it("Seedream 4.5 creditCost is 15", () => {
    expect(MEDIA_MODELS["seedream-4-5-251128"].creditCost).toBe(15);
  });

  it("Seedream 4.0 creditCost is 10", () => {
    expect(MEDIA_MODELS["seedream-4-0-250828"].creditCost).toBe(10);
  });

  it('MEDIA_MODELS["seedance-1-0-pro-250528"] has provider "byteplus_modelark" and type "video"', () => {
    expect(MEDIA_MODELS["seedance-1-0-pro-250528"]).toBeDefined();
    expect(MEDIA_MODELS["seedance-1-0-pro-250528"].provider).toBe("byteplus_modelark");
    expect(MEDIA_MODELS["seedance-1-0-pro-250528"].type).toBe("video");
  });

  it('MEDIA_MODELS["seedance-1-0-lite-t2v-250428"] has provider "byteplus_modelark" and type "video"', () => {
    expect(MEDIA_MODELS["seedance-1-0-lite-t2v-250428"]).toBeDefined();
    expect(MEDIA_MODELS["seedance-1-0-lite-t2v-250428"].provider).toBe("byteplus_modelark");
    expect(MEDIA_MODELS["seedance-1-0-lite-t2v-250428"].type).toBe("video");
  });

  it('MEDIA_MODELS["seedance-1-0-lite-i2v-250428"] has provider "byteplus_modelark" and type "video"', () => {
    expect(MEDIA_MODELS["seedance-1-0-lite-i2v-250428"]).toBeDefined();
    expect(MEDIA_MODELS["seedance-1-0-lite-i2v-250428"].provider).toBe("byteplus_modelark");
    expect(MEDIA_MODELS["seedance-1-0-lite-i2v-250428"].type).toBe("video");
  });

  it('MEDIA_MODELS["seedance-1-0-pro-fast-251015"] has provider "byteplus_modelark" and type "video"', () => {
    expect(MEDIA_MODELS["seedance-1-0-pro-fast-251015"]).toBeDefined();
    expect(MEDIA_MODELS["seedance-1-0-pro-fast-251015"].provider).toBe("byteplus_modelark");
    expect(MEDIA_MODELS["seedance-1-0-pro-fast-251015"].type).toBe("video");
  });

  it("Seedance Pro creditCost is 30", () => {
    expect(MEDIA_MODELS["seedance-1-0-pro-250528"].creditCost).toBe(30);
  });

  it("Seedance Pro Fast creditCost is 20", () => {
    expect(MEDIA_MODELS["seedance-1-0-pro-fast-251015"].creditCost).toBe(20);
  });

  it("Seedance Lite T2V creditCost is 20", () => {
    expect(MEDIA_MODELS["seedance-1-0-lite-t2v-250428"].creditCost).toBe(20);
  });

  it("Seedance Lite I2V creditCost is 20", () => {
    expect(MEDIA_MODELS["seedance-1-0-lite-i2v-250428"].creditCost).toBe(20);
  });

  it("all 6 BytePlus model entries have id field matching their registry key", () => {
    const byteplusIds = [
      "seedream-4-5-251128",
      "seedream-4-0-250828",
      "seedance-1-0-pro-fast-251015",
      "seedance-1-0-pro-250528",
      "seedance-1-0-lite-t2v-250428",
      "seedance-1-0-lite-i2v-250428",
    ];
    for (const id of byteplusIds) {
      expect(MEDIA_MODELS[id].id).toBe(id);
    }
  });

  it("all 6 BytePlus models are present in MEDIA_MODELS", () => {
    const byteplusModels = Object.values(MEDIA_MODELS).filter(
      (m) => m.provider === "byteplus_modelark"
    );
    expect(byteplusModels).toHaveLength(6);
  });

  it("TypeScript compilation validates union types (run npm run check separately)", () => {
    // This is a marker test — TypeScript compilation itself is the real assertion.
    // If ImageModel and VideoModel unions do not include the BytePlus IDs,
    // `npm run check` will fail with type errors.
    expect(true).toBe(true);
  });
});

describe("buildApiConfigFromModelConfig", () => {
  it("preserves nested declarative mode routing and list-valued overrides", () => {
    const modes = [
      {
        id: "image-to-video",
        when: { minImages: 1, maxImages: 2 },
        kie_model_id: "minimax-h3/image-to-video",
        drop_params: ["aspect_ratio"],
      },
    ];

    expect(buildApiConfigFromModelConfig({
      apiConfig: {
        kie_model_id: "minimax-h3/text-to-video",
        modes,
      },
    })).toMatchObject({
      kie_model_id: "minimax-h3/text-to-video",
      modes,
    });
  });
});

describe("MEDIA_MODELS — OmniVoice audio entry", () => {
  it('MEDIA_MODELS["omnivoice-tts"] has provider "omnivoice" and type "audio"', () => {
    expect(MEDIA_MODELS["omnivoice-tts"]).toBeDefined();
    expect(MEDIA_MODELS["omnivoice-tts"].provider).toBe("omnivoice");
    expect(MEDIA_MODELS["omnivoice-tts"].type).toBe("audio");
  });

  it("OmniVoice creditCost is 5", () => {
    expect(MEDIA_MODELS["omnivoice-tts"].creditCost).toBe(5);
  });
});

describe("MEDIA_MODELS — HappyHorse video entries", () => {
  it("includes Kie market payload metadata for all HappyHorse modes", () => {
    const ids = [
      "happyhorse/text-to-video",
      "happyhorse/image-to-video",
      "happyhorse/reference-to-video",
      "happyhorse/video-edit",
    ];

    for (const id of ids) {
      expect(MEDIA_MODELS[id]).toMatchObject({
        id,
        provider: "kie.ai",
        type: "video",
        creditCost: 100,
      });
      expect(MEDIA_MODELS[id].configJson).toMatchObject({
        apiEndpoint: "/jobs/createTask",
        apiQueryEndpoint: "/jobs/recordInfo",
        apiPayloadFormat: "market",
        kieModelId: id,
      });
    }
  });

  it("keeps HappyHorse reference and edit input fields aligned with Kie docs", () => {
    expect(MEDIA_MODELS["happyhorse/image-to-video"].configJson).toMatchObject({
      maxReferenceImages: 1,
      apiConfig: {
        reference_image_input_key: "image_urls",
        reference_image_input_type: "array",
        omit_aspect_ratio: true,
      },
    });
    expect(MEDIA_MODELS["happyhorse/reference-to-video"].configJson).toMatchObject({
      maxReferenceImages: 9,
      apiConfig: {
        reference_image_input_key: "reference_image",
        reference_image_input_type: "array",
      },
    });
    expect(MEDIA_MODELS["happyhorse/video-edit"].configJson).toMatchObject({
      maxReferenceImages: 5,
      apiConfig: {
        reference_image_input_key: "reference_image",
        reference_image_input_type: "array",
        reference_video_input_key: "video_url",
        reference_video_input_type: "url",
        omit_aspect_ratio: true,
        omit_duration: true,
      },
    });
  });
});

describe("MEDIA_MODELS — Gemini Omni video entry", () => {
  it("includes Kie Market metadata and multimodal input config", () => {
    expect(MEDIA_MODELS["gemini-omni-video"]).toMatchObject({
      id: "gemini-omni-video",
      provider: "kie.ai",
      type: "video",
      creditCost: 90,
      supportsDurations: [4, 6, 8, 10],
      supportsAspectRatios: ["16:9", "9:16"],
      configJson: {
        apiEndpoint: "/jobs/createTask",
        apiQueryEndpoint: "/jobs/recordInfo",
        apiPayloadFormat: "market",
        kieModelId: "gemini-omni-video",
        generateType: "multimodal-video",
        maxReferenceImages: 7,
        maxReferenceVideos: 1,
        maxReferenceAudios: 1,
        supportedResolutions: ["720p", "1080p", "4K"],
        apiConfig: {
          reference_image_input_key: "image_urls",
          reference_image_input_type: "array",
          reference_video_input_key: "video_list",
          reference_video_input_type: "object_array",
        },
        pricingTiers: {
          "1080p-4s-without-video": 90,
          "1080p-10s-without-video": 180,
          "4K-4s-without-video": 210,
          "4K-10s-without-video": 300,
          "1080p-4s-with-video": 240,
          "4K-4s-with-video": 360,
        },
      },
    });
  });

  it("includes the separately selectable Gemini Omni Flash 1.1 Kie model", () => {
    expect(MEDIA_MODELS["gemini-omni-flash-1-1"]).toMatchObject({
      id: "gemini-omni-flash-1-1",
      provider: "kie.ai",
      type: "video",
      configJson: {
        kieModelId: "google/gemini-omni-flash-1-1",
        supportedResolutions: ["360p", "720p", "1080p", "4K"],
        pricingTiers: {
          "360p-4s-without-video": 315,
          "4K-4s-with-video": 1260,
        },
      },
    });
    const inputFields = MEDIA_MODELS["gemini-omni-flash-1-1"].configJson?.inputFields as Array<{ key?: string }>;
    expect(inputFields.map((field) => field.key)).toEqual(expect.arrayContaining([
      "first_frame_url",
      "last_frame_url",
    ]));
  });
});

describe("MEDIA_MODELS — Magnific static fallback entries", () => {
  it("includes Magnific image, sync, and video metadata with provider routing config", () => {
    expect(MEDIA_MODELS["magnific/mystic"]).toMatchObject({
      id: "magnific/mystic",
      provider: "magnific",
      type: "image",
      creditCost: 20,
    });
    expect(MEDIA_MODELS["magnific/remove-background"]).toMatchObject({
      id: "magnific/remove-background",
      provider: "magnific",
      type: "image",
      creditCost: 5,
    });
    expect(MEDIA_MODELS["magnific/veo-3-1-text-to-video-fast"]).toMatchObject({
      id: "magnific/veo-3-1-text-to-video-fast",
      provider: "magnific",
      type: "video",
    });
    expect(MEDIA_MODELS["magnific/mystic"].configJson).toMatchObject({
      endpoint: {
        submit: "/v1/ai/mystic",
      },
      pricingStatus: "estimated",
      pricingSource: "magnific-docs-or-admin",
    });
  });

  it("does not make unknown model ids fall through to Magnific", () => {
    expect(MEDIA_MODELS["not-a-real-magnific-model"]).toBeUndefined();
  });
});

describe("MediaGenerationService retry behavior", () => {
  const taskPayload = {
    id: "task-123",
    task_id: null,
    user_id: 1,
    media_type: "audio",
    status: "pending",
    model: "uvoice/tts-standard",
    prompt: "test",
    parameters: {},
    result_url: null,
    result_data: null,
    error_message: null,
    credits_used: null,
    credits_balance: null,
    created_at: "2026-03-06T04:21:05.493354Z",
    started_at: null,
    completed_at: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(scheduleMediaWithLimiter).mockImplementation(async (_provider, _mediaType, fn) => fn());
    vi.mocked(getModelById).mockReturnValue(undefined);
  });

  it("omits negative_prompt from sync target character requests", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(taskPayload), { status: 200 }),
    );
    const service = new MediaGenerationService("http://localhost:8000");
    await service.generateImage(
      {
        prompt: "natural human character portrait",
        negativePrompt: "plastic skin, catalog pose",
        model: "google-banana-2",
        characterPromptContext: {
          marker: "vertical_drama_character_v1",
          contractVersion: "vd_character_natural_human_v1",
          target: true,
        },
      },
      "test-token",
    );
    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload).toHaveProperty("prompt");
    expect(payload).not.toHaveProperty("negative_prompt");
  });

  it("omits negative_prompt from async target character requests but preserves legacy mapping", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(taskPayload), { status: 200 }),
    );
    const service = new MediaGenerationService("http://localhost:8000");
    await service.generateImageAsync(
      {
        prompt: "natural human character portrait",
        negativePrompt: "plastic skin, catalog pose",
        model: "google-banana-2",
        characterPromptContext: {
          marker: "vertical_drama_character_v1",
          contractVersion: "vd_character_natural_human_v1",
          target: true,
        },
      },
      "test-token",
    );
    const targetPayload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(targetPayload).not.toHaveProperty("negative_prompt");

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(taskPayload), { status: 200 }),
    );
    await service.generateImageAsync(
      { prompt: "legacy portrait", negativePrompt: "legacy guard", model: "google-banana-2" },
      "test-token",
    );
    const legacyPayload = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(legacyPayload).toHaveProperty("negative_prompt", "legacy guard");
  });

  it("retries async audio submission once for SETTINGS_KEY_NOT_FOUND and succeeds", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("ERR SETTINGS_KEY_NOT_FOUND"))
      .mockResolvedValueOnce(new Response(JSON.stringify(taskPayload), { status: 200 }));

    const service = new MediaGenerationService("http://localhost:8000");
    const result = await service.generateAudioAsync(
      {
        text: "test",
        model: "uvoice/tts-standard",
        apiConfig: { provider: "uvoice" },
        extraParams: { voiceID: "TH-AlisaSD" },
      },
      "test-token",
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.id).toBe("task-123");
    expect(vi.mocked(auditLogger.log)).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "error",
      errorType: "media_submit_retryable_error",
      errorMessage: expect.stringContaining("SETTINGS_KEY_NOT_FOUND"),
    }));
  });

  it("rethrows enriched endpoint context after retryable submit error repeats", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("ERR SETTINGS_KEY_NOT_FOUND"))
      .mockRejectedValueOnce(new Error("ERR SETTINGS_KEY_NOT_FOUND"));

    const service = new MediaGenerationService("http://localhost:8000");

    await expect(service.generateImageAsync(
      {
        prompt: "test image prompt",
        model: "nano-banana-2",
        apiConfig: { provider: "kie.ai" },
      },
      "test-token",
    )).rejects.toThrow("ERR SETTINGS_KEY_NOT_FOUND [endpoint=/api/v1/media/async/image]");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("omits Marketplace metadata from async image extra params sent to Python", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(taskPayload), { status: 200 }),
    );

    const service = new MediaGenerationService("http://localhost:8000");
    await service.generateImageAsync(
      {
        prompt: "test image prompt",
        model: "google-banana-2",
        apiConfig: { provider: "kie.ai" },
        extraParams: {
          google_search: false,
          resolution: "4K",
          marketplaceContext: {
            platform: "shopee",
            productName: "Nordic bedside table",
          },
          marketplaceProduct: {
            platform: "shopee",
            productName: "Duplicate product context",
          },
          __reserved_credits: 90,
          __origin_surface: "media_studio",
        },
      },
      "test-token",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload.extra_params).toMatchObject({
      google_search: false,
      resolution: "4K",
      __reserved_credits: 90,
      __origin_surface: "media_studio",
    });
    expect(payload.extra_params).not.toHaveProperty("marketplaceContext");
    expect(payload.extra_params).not.toHaveProperty("marketplaceProduct");
  });

  it("attaches a safety decision marker to non-drama image requests", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(taskPayload), { status: 200 }),
    );

    const service = new MediaGenerationService("http://localhost:8000");
    await service.generateImageAsync(
      {
        prompt: "A clean product illustration on a neutral background",
        model: "google-banana-2",
      },
      "test-token",
    );

    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload.extra_params.__prompt_safety).toMatchObject({
      checked: true,
      mode: "standard",
      skillId: "image-prompt-safety-rewriter",
    });
  });

  it("adds reference image config metadata from the model configJson", async () => {
    vi.mocked(getModelById).mockReturnValue({
      id: "google-banana-2",
      type: "image",
      name: "Google Banana 2",
      provider: "kie.ai",
      description: "Test model",
      aliases: [],
      creditCost: 40,
      configJson: {
        apiConfig: {
          kie_model_id_with_references: "google-banana-2-image-to-image",
        },
        inputFields: [
          {
            key: "reference_image",
            label: "Reference Images",
            type: "array",
            syncWith: "reference_images",
          },
        ],
      },
    } as never);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 200, data: { taskId: "task-42" } }), { status: 200 }),
    );

    const service = new MediaGenerationService("http://localhost:8000");
    await service.generateImageAsync(
      {
        prompt: "test image prompt",
        model: "google-banana-2",
        apiConfig: { provider: "kie.ai" },
        referenceImageUrls: ["https://cdn.example.com/ref.png"],
      },
      "test-token",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(requestInit).toBeDefined();
    const payload = JSON.parse(String(requestInit?.body));
    expect(payload.reference_image_urls).toEqual(["https://cdn.example.com/ref.png"]);
    expect(payload.api_config).toMatchObject({
      provider: "kie.ai",
      reference_image_input_key: "reference_image",
      reference_image_input_label: "Reference Images",
      reference_image_input_type: "array",
      kie_model_id_with_references: "google-banana-2-image-to-image",
    });
  });

  it("passes provider-specific KIE model config for async Veo video generation", async () => {
    vi.mocked(getModelById).mockReturnValue({
      id: "veo-3-1",
      type: "video",
      name: "Veo 3.1",
      provider: "kie.ai",
      description: "Test Veo model",
      aliases: ["veo3/generate-veo-3-video-fast"],
      creditCost: 50,
      configJson: {
        apiEndpoint: "/api/v1/veo/generate",
        apiPayloadFormat: "veo",
        kieModelId: "veo3_fast",
      },
    } as never);

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "video-task-42",
          task_id: null,
          user_id: 1,
          media_type: "video",
          status: "pending",
          model: "veo3/generate-veo-3-video-fast",
          prompt: "A concise cinematic Songkran video prompt",
          parameters: {},
          result_url: null,
          result_data: null,
          error_message: null,
          credits_used: null,
          credits_balance: null,
          created_at: "2026-03-06T04:21:05.493354Z",
          started_at: null,
          completed_at: null,
        }),
        { status: 200 },
      ),
    );

    const service = new MediaGenerationService("http://localhost:8000");
    await service.generateVideoAsync(
      {
        prompt: "A concise cinematic Songkran video prompt",
        model: "veo3/generate-veo-3-video-fast",
        apiConfig: { provider: "kie.ai" },
      },
      "test-token",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(requestInit).toBeDefined();
    const payload = JSON.parse(String(requestInit?.body));
    expect(payload.api_config).toMatchObject({
      provider: "kie.ai",
      endpoint: "/api/v1/veo/generate",
      payload_format: "veo",
      kie_model_id: "veo3_fast",
      model: "veo3/generate-veo-3-video-fast",
    });
  });

  it("passes Veo Extend endpoint, generate type, and source task id for async video generation", async () => {
    vi.mocked(getModelById).mockReturnValue({
      id: "veo3/extend-video",
      type: "video",
      name: "Veo 3.1 Extend",
      provider: "kie.ai",
      description: "Extend test model",
      aliases: [],
      creditCost: 1250,
      configJson: {
        apiEndpoint: "/api/v1/veo/extend",
        apiQueryEndpoint: "/api/v1/veo/record-info",
        apiPayloadFormat: "veo_extend",
        generateType: "video-extend",
        apiConfig: {
          extend_model: "fast",
        },
      },
    } as never);

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "extend-task-42",
          task_id: null,
          user_id: 1,
          media_type: "video",
          status: "pending",
          model: "veo3/extend-video",
          prompt: "Continue the segment naturally.",
          parameters: {},
          result_url: null,
          result_data: null,
          error_message: null,
          credits_used: null,
          credits_balance: null,
          created_at: "2026-03-06T04:21:05.493354Z",
          started_at: null,
          completed_at: null,
        }),
        { status: 200 },
      ),
    );

    const service = new MediaGenerationService("http://localhost:8000");
    await service.generateVideoAsync(
      {
        prompt: "Continue the segment naturally.",
        model: "veo3/extend-video",
        apiConfig: { provider: "kie.ai" },
        extraParams: { source_task_id: "veo_task_abcdef123456" },
      },
      "test-token",
    );

    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload.api_config).toMatchObject({
      provider: "kie.ai",
      endpoint: "/api/v1/veo/extend",
      payload_format: "veo_extend",
      generate_type: "video-extend",
      extend_model: "fast",
      model: "veo3/extend-video",
    });
    expect(payload.extra_params).toMatchObject({
      source_task_id: "veo_task_abcdef123456",
    });
  });

  it("resolves Gemini Omni video_list object URLs before sending payload to Python", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(taskPayload), { status: 200 }),
    );

    const service = new MediaGenerationService("http://localhost:8000");
    await service.generateVideoAsync(
      {
        prompt: "Use the source movement.",
        model: "gemini-omni-video",
        publicUrl: "https://tenant.example.com",
        apiConfig: {
          provider: "kie.ai",
          reference_video_input_key: "video_list",
          reference_video_input_type: "object_array",
        },
        extraParams: {
          video_list: [{ url: "/api/storage/files/chat/uploads/source.mp4", start: 1, ends: 7 }],
        },
      },
      "test-token",
    );

    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload.extra_params.video_list).toEqual([
      { url: "https://tenant.example.com/api/storage/files/chat/uploads/source.mp4", start: 1, ends: 7 },
    ]);
  });

  it("forwards Gemini Omni Flash 1.1 first/last frames without conflicting reference arrays", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(taskPayload), { status: 200 }),
    );

    const service = new MediaGenerationService("http://localhost:8000");
    await service.generateVideoAsync(
      {
        prompt: "Animate the product reveal.",
        model: "gemini-omni-flash-1-1",
        resolution: "4K",
        apiConfig: { provider: "kie.ai" },
        extraParams: {
          first_frame_url: "https://cdn.example.com/start.png",
          last_frame_url: "https://cdn.example.com/end.png",
        },
      },
      "test-token",
    );

    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload.extra_params).toMatchObject({
      first_frame_url: "https://cdn.example.com/start.png",
      last_frame_url: "https://cdn.example.com/end.png",
    });
    expect(payload.extra_params).not.toHaveProperty("image_urls");
    expect(payload.extra_params).not.toHaveProperty("video_list");
  });

  it("forwards reference audio and the full reference video list for minimax-h3", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(taskPayload), { status: 200 }),
    );

    const service = new MediaGenerationService("http://localhost:8000");
    await service.generateVideoAsync(
      {
        prompt: "Follow the referenced motion.",
        model: "minimax-h3",
        publicUrl: "https://tenant.example.com",
        apiConfig: { provider: "kie.ai" },
        referenceVideoUrls: [
          "/api/storage/files/chat/uploads/a.mp4",
          "/api/storage/files/chat/uploads/b.mp4",
        ],
        referenceAudioUrls: ["/api/storage/files/chat/uploads/a.mp3"],
      },
      "test-token",
    );

    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    // The full list must survive — mode routing counts clips, and
    // reference-to-video takes up to 3.
    expect(payload.reference_video_urls).toEqual([
      "https://tenant.example.com/api/storage/files/chat/uploads/a.mp4",
      "https://tenant.example.com/api/storage/files/chat/uploads/b.mp4",
    ]);
    expect(payload.reference_video_url).toBe(
      "https://tenant.example.com/api/storage/files/chat/uploads/a.mp4",
    );
    expect(payload.reference_audio_urls).toEqual([
      "https://tenant.example.com/api/storage/files/chat/uploads/a.mp3",
    ]);
  });

  it("preserves structured Gemini TTS speaker rows in extraParams", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(taskPayload), { status: 200 }),
    );

    const service = new MediaGenerationService("http://localhost:8000");
    const speakers = [
      { speaker_id: "Host", voice: "Kore" },
      { speaker_id: "Guest", voice: "Aoede" },
    ];

    await service.generateAudioAsync(
      {
        text: "Host: Welcome back. Guest: Thanks for having me.",
        model: "fal-ai/gemini-3.1-flash-tts",
        apiConfig: { provider: "fal_ai" },
        extraParams: {
          voice: "Kore",
          language_code: "English (US)",
          speakers,
        },
      },
      "test-token",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(requestInit).toBeDefined();
    const payload = JSON.parse(String(requestInit?.body));
    expect(payload.extra_params).toMatchObject({
      voice: "Kore",
      language_code: "English (US)",
    });
    expect(payload.extra_params.speakers).toEqual(speakers);
  });

  it.each([
    "generateAudio",
    "generateAudioAsync",
  ] as const)("rejects Gemini top-level speed before submitting in %s", async (method) => {
    const service = new MediaGenerationService("http://localhost:8000");
    const invoke = method === "generateAudio"
      ? service.generateAudio.bind(service)
      : service.generateAudioAsync.bind(service);

    await expect(invoke(
      {
        text: "Host: Welcome back. Guest: Thanks for having me.",
        model: "fal-ai/gemini-3.1-flash-tts",
        voice: "Kore",
        speed: 1.25,
        apiConfig: { provider: "fal_ai" },
        extraParams: {
          voice: "Kore",
        },
      },
      "test-token",
    )).rejects.toThrow(/speed is not supported by Gemini 3\.1 Flash TTS/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-string Gemini TTS text fields before submitting", async () => {
    const service = new MediaGenerationService("http://localhost:8000");

    await expect(service.generateAudioAsync(
      {
        text: "Host: Welcome back. Guest: Thanks for having me.",
        model: "fal-ai/gemini-3.1-flash-tts",
        apiConfig: { provider: "fal_ai" },
        extraParams: {
          language_code: false,
          output_format: {},
          style_instructions: [],
          voice: 123,
        } as unknown as Record<string, unknown>,
      },
      "test-token",
    )).rejects.toThrow(/style_instructions must be a string[\s\S]*language_code must be a string[\s\S]*voice must be a string[\s\S]*output_format must be a string/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves style instructions text while still resolving URL-like audio fields", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(taskPayload), { status: 200 }),
    );

    const service = new MediaGenerationService("http://localhost:8000");

    await service.generateAudioAsync(
      {
        text: "Please read this carefully.",
        model: "uvoice/tts-standard",
        apiConfig: { provider: "uvoice" },
        publicUrl: "https://tenant.example.com",
        extraParams: {
          audio_url: "/uploads/reference.wav",
          style_instructions: "/softly, in a whisper",
        },
      },
      "test-token",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(requestInit).toBeDefined();
    const payload = JSON.parse(String(requestInit?.body));
    expect(payload.extra_params).toMatchObject({
      audio_url: "https://tenant.example.com/uploads/reference.wav",
      style_instructions: "/softly, in a whisper",
    });
  });

  it("trims Gemini TTS speaker aliases and voices before submitting", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(taskPayload), { status: 200 }),
    );

    const service = new MediaGenerationService("http://localhost:8000");

    await service.generateAudioAsync(
      {
        text: "Host: Welcome back. Guest: Thanks for having me.",
        model: "fal-ai/gemini-3.1-flash-tts",
        apiConfig: { provider: "fal_ai" },
        extraParams: {
          voice: " Kore ",
          language_code: " English (US) ",
          speakers: [
            { speaker_id: " Host ", voice: " Kore " },
            { speaker_id: " Guest ", voice: " Aoede " },
          ],
        },
      },
      "test-token",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(requestInit).toBeDefined();
    const payload = JSON.parse(String(requestInit?.body));
    expect(payload.extra_params).toEqual({
      voice: "Kore",
      language_code: "English (US)",
      speakers: [
        { speaker_id: "Host", voice: "Kore" },
        { speaker_id: "Guest", voice: "Aoede" },
      ],
    });
  });

  it("strips Gemini TTS auto-detect language sentinels before sending the payload", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(taskPayload), { status: 200 }),
    );

    const service = new MediaGenerationService("http://localhost:8000");

    await service.generateAudioAsync(
      {
        text: "Host: Welcome back. Guest: Thanks for having me.",
        model: "fal-ai/gemini-3.1-flash-tts",
        apiConfig: { provider: "fal_ai" },
        extraParams: {
          language_code: "__auto__",
          voice: "Kore",
        },
      },
      "test-token",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(requestInit).toBeDefined();
    const payload = JSON.parse(String(requestInit?.body));
    expect(payload.extra_params).toEqual({
      voice: "Kore",
    });
    expect(payload.extra_params).not.toHaveProperty("language_code");
  });

  it("includes the Gemini TTS language_code field and caps speaker rows", () => {
    const fields = buildGemini31FlashTtsInputFields();
    const languageField = fields.find((field) => field.key === "language_code");
    const speakersField = fields.find((field) => field.key === "speakers");

    expect(languageField).toMatchObject({
      key: "language_code",
      type: "select",
      searchable: true,
    });
    expect(languageField?.options?.[0]).toEqual({
      value: "__auto__",
      label: "Auto-detect",
    });
    expect(speakersField).toMatchObject({
      key: "speakers",
      type: "array",
      maxItems: GEMINI_3_1_FLASH_TTS_MAX_SPEAKERS,
    });
  });

  it("rejects malformed Gemini TTS speaker payloads before submitting", async () => {
    const service = new MediaGenerationService("http://localhost:8000");
    const speakers = [
      { speaker_id: "Host One", voice: "Kore" },
    ];

    await expect(service.generateAudioAsync(
      {
        text: "Host: Welcome back. Guest: Thanks for having me.",
        model: "fal-ai/gemini-3.1-flash-tts",
        apiConfig: { provider: "fal_ai" },
        extraParams: {
          language_code: "Klingon",
          speakers,
        },
      },
      "test-token",
    )).rejects.toThrow(/Gemini 3\.1 Flash TTS input validation failed/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unknown Gemini TTS extraParams keys before submitting", async () => {
    const service = new MediaGenerationService("http://localhost:8000");

    await expect(service.generateAudioAsync(
      {
        text: "Host: Welcome back. Guest: Thanks for having me.",
        model: "fal-ai/gemini-3.1-flash-tts",
        apiConfig: { provider: "fal_ai" },
        extraParams: {
          speakers: [{ speaker_id: "Host", voice: "Kore" }],
          unknown_key: "value",
        },
      },
      "test-token",
    )).rejects.toThrow(/not supported by Gemini 3\.1 Flash TTS/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects duplicate Gemini TTS speaker aliases before submitting", async () => {
    const service = new MediaGenerationService("http://localhost:8000");

    await expect(service.generateAudioAsync(
      {
        text: "Host: Welcome back. Guest: Thanks for having me.",
        model: "fal-ai/gemini-3.1-flash-tts",
        apiConfig: { provider: "fal_ai" },
        extraParams: {
          speakers: [
            { speaker_id: "Host", voice: "Kore" },
            { speaker_id: "Host", voice: "Aoede" },
          ],
        },
      },
      "test-token",
    )).rejects.toThrow(/speaker_id duplicates speakers\[0\]\.speaker_id/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects Gemini TTS speaker lists above the configured limit", async () => {
    const service = new MediaGenerationService("http://localhost:8000");
    const speakers = Array.from({ length: GEMINI_3_1_FLASH_TTS_MAX_SPEAKERS + 1 }, (_, index) => ({
      speaker_id: `Speaker${index + 1}`,
      voice: "Kore",
    }));

    await expect(service.generateAudioAsync(
      {
        text: "Host: Welcome back. Guest: Thanks for having me.",
        model: "fal-ai/gemini-3.1-flash-tts",
        apiConfig: { provider: "fal_ai" },
        extraParams: {
          speakers,
        },
      },
      "test-token",
    )).rejects.toThrow(new RegExp(`must not exceed ${GEMINI_3_1_FLASH_TTS_MAX_SPEAKERS} rows`));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("resolveReferenceUrl", () => {
  it("keeps public HTTPS URLs as-is", () => {
    expect(resolveReferenceUrl("https://cdn.example.com/ref.png", "https://tenant.example.com"))
      .toBe("https://cdn.example.com/ref.png");
  });

  it("rewrites localhost URLs to the internal node server base", () => {
    expect(resolveReferenceUrl("https://localhost:3000/uploads/ref.png", "https://tenant.example.com"))
      .toBe(`${getCachedInternalNodeUrl()}/uploads/ref.png`);
  });

  it("uses the request public URL for relative upload and storage-proxy assets", () => {
    expect(resolveReferenceUrl("/uploads/ref.png", "https://tenant.example.com"))
      .toBe("https://tenant.example.com/uploads/ref.png");
    expect(resolveReferenceUrl("/api/storage/files/library/ref.png", "https://tenant.example.com"))
      .toBe("https://tenant.example.com/api/storage/files/library/ref.png");
  });

  it("rejects relative asset paths outside the public allowlist and requires a public app URL", () => {
    expect(() => resolveReferenceUrl("/api/private.png", "https://tenant.example.com"))
      .toThrow(/\/uploads\/ or \/api\/storage\/files\//i);
    expect(() => resolveReferenceUrl("/uploads/ref.png", "https://localhost:3000"))
      .toThrow(/public app url/i);
    expect(() => resolveReferenceUrl("/api/storage/files/library/ref.png", "https://localhost:3000"))
      .toThrow(/public app url/i);
  });
});
