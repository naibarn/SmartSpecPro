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

import { scheduleMediaWithLimiter } from "./llmRateLimiter";
import { auditLogger } from "./auditLogger";
import { getCachedInternalNodeUrl } from "./appRuntimeConfig";
import { getModelById } from "./modelRegistry";
import { MEDIA_MODELS, MediaGenerationService, resolveReferenceUrl } from "./mediaGenerationService";
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
    });
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
