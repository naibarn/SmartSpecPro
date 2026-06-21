import { describe, expect, it } from "vitest";
import {
  applyModelSyncTargets,
  buildDefaultModelInputArrayItem,
  buildDefaultExtraParamsForModel,
  clampReferenceImagesToModelLimit,
  getModelGenerationModeLabel,
  getMissingRequiredModelFields,
  getModelReferenceInputSupport,
  getModelReferenceImageLimit,
  getModelInputField,
  parseModelInputFields,
  selectHighestImageResolutionInput,
} from "./mediaModelInputs";

describe("mediaModelInputs", () => {
  it("infers reference video sync targets from video url fields", () => {
    const model = {
      id: "test-video-model",
      name: "Test Video Model",
      configJson: {
        inputFields: [
          { key: "video_urls", type: "video_urls" },
          { key: "ref_videos", type: "video_urls", syncWith: "reference_videos" },
        ],
      },
    };

    const fields = parseModelInputFields(model);
    expect(fields.map((field) => `${field.key}:${field.syncWith}`)).toEqual([
      "video_urls:reference_videos",
      "ref_videos:reference_videos",
    ]);
  });

  it("finds a parsed input field by key", () => {
    const model = {
      id: "test-video-model",
      name: "Test Video Model",
      configJson: {
        inputFields: [
          { key: "model", label: "Model", type: "select", affectsPricing: true },
          { key: "duration", label: "Duration", type: "select" },
        ],
      },
    };

    expect(getModelInputField(model, "model")).toMatchObject({
      key: "model",
      label: "Model",
      affectsPricing: true,
    });
    expect(getModelInputField(model, "missing")).toBeUndefined();
  });

  it("selects the highest supported image resolution option", () => {
    const model = {
      id: "image-model",
      name: "Image Model",
      configJson: {
        inputFields: [
          {
            key: "resolution",
            label: "Resolution",
            type: "select",
            default: "1K",
            options: [
              { value: "1K", label: "1K" },
              { value: "2K", label: "2K" },
              { value: "4K", label: "4K" },
            ],
          },
        ],
      },
    };

    expect(selectHighestImageResolutionInput(model)).toMatchObject({
      key: "resolution",
      value: "4K",
      resolution: "4K",
    });
  });

  it("falls back to the highest declared lower image resolution", () => {
    const model = {
      id: "image-model",
      name: "Image Model",
      configJson: {
        inputFields: [
          {
            key: "outputQuality",
            label: "Quality",
            type: "select",
            default: "1K",
            options: [
              { value: "1K", label: "1K" },
              { value: "2K", label: "2K" },
            ],
          },
        ],
      },
    };

    expect(selectHighestImageResolutionInput(model)).toMatchObject({
      key: "outputQuality",
      value: "2K",
      resolution: "2K",
    });
  });

  it("uses config resolutions when no explicit input field exists", () => {
    const model = {
      id: "image-model",
      name: "Image Model",
      configJson: {
        resolutions: ["1K", "2K"],
      },
    };

    expect(selectHighestImageResolutionInput(model)).toMatchObject({
      key: "resolution",
      value: "2K",
      resolution: "2K",
    });
  });

  it("preserves Gemini Omni suite-managed provider asset metadata", () => {
    const model = {
      id: "gemini-omni-video",
      name: "Gemini Omni Video",
      configJson: {
        inputFields: [
          {
            key: "character_ids",
            label: "Character References",
            type: "provider_asset_picker",
            hidden: true,
            advancedOnly: true,
            managedBySuite: true,
            assetType: "provider_asset",
            assetCapability: "gemini_omni_character",
            referenceUnitWeight: 1,
            maxItems: 3,
            providerPayloadKey: "character_ids",
          },
        ],
      },
    };

    expect(parseModelInputFields(model)[0]).toMatchObject({
      key: "character_ids",
      type: "provider_asset_picker",
      hidden: true,
      advancedOnly: true,
      managedBySuite: true,
      assetCapability: "gemini_omni_character",
      referenceUnitWeight: 1,
      maxItems: 3,
      providerPayloadKey: "character_ids",
    });
  });

  it("preserves dynamic option source voice preview metadata", () => {
    const model = {
      id: "elevenlabs-dialogue",
      name: "ElevenLabs Dialogue",
      configJson: {
        inputFields: [
          {
            key: "voice_id_2",
            label: "Speaker 2 Voice",
            type: "select",
            optionsSource: {
              type: "provider_api",
              endpoint: "/v2/voices",
              method: "GET",
              itemsPath: "voices",
              valueField: "voice_id",
              labelField: "name",
              previewField: "preview_url",
              queryParam: "search",
            },
          },
        ],
      },
    };

    expect(parseModelInputFields(model)[0]?.optionsSource).toMatchObject({
      type: "provider_api",
      valueField: "voice_id",
      previewField: "preview_url",
    });
  });

  it("parses nested array itemFields and resolves them by key", () => {
    const model = {
      id: "test-audio-model",
      name: "Test Audio Model",
      configJson: {
        inputFields: [
          {
            key: "speakers",
            label: "Speakers",
            type: "array",
            itemLabel: "Speaker",
            itemFields: [
              { key: "speaker_id", label: "Speaker ID", type: "text", required: true },
              {
                key: "voice",
                label: "Voice",
                type: "select",
                required: true,
                options: [{ value: "Kore", label: "Kore" }],
              },
            ],
          },
        ],
      },
    };

    const fields = parseModelInputFields(model);
    expect(fields[0]?.itemFields?.[0]).toMatchObject({
      key: "speaker_id",
      label: "Speaker ID",
      required: true,
    });
    expect(getModelInputField(model, "speaker_id")).toMatchObject({
      key: "speaker_id",
      label: "Speaker ID",
    });
  });

  it("syncs prompt into array fields using itemTemplate", () => {
    const model = {
      id: "elevenlabs-dialogue",
      name: "ElevenLabs Dialogue",
      configJson: {
        inputFields: [
          { key: "voice", label: "Voice", type: "select", default: "voice-1" },
          {
            key: "dialogue",
            label: "Dialogue",
            type: "array",
            syncWith: "prompt",
            itemTemplate: {
              text: "{{item}}",
              voice: "{{fields.voice}}",
            },
          },
        ],
      },
    };

    const extraParams = applyModelSyncTargets(
      model,
      buildDefaultExtraParamsForModel(model),
      { prompt: "Narration text" },
    );

    expect(extraParams).toMatchObject({
      voice: "voice-1",
      dialogue: [
        {
          text: "Narration text",
          voice: "voice-1",
        },
      ],
    });
  });

  it("syncs speaker-labelled prompt lines into dialogue inputs using model config voice fields", () => {
    const model = {
      id: "elevenlabs-dialogue",
      name: "ElevenLabs Dialogue",
      configJson: {
        inputFields: [
          { key: "voice_id", label: "Speaker 1 Voice", type: "select", default: "voice-1" },
          { key: "voice_id_2", label: "Speaker 2 Voice", type: "select", default: "voice-2" },
          {
            key: "inputs",
            label: "Dialogue Inputs",
            type: "array",
            syncWith: "prompt",
            itemTemplate: {
              text: "{{item}}",
              voice_id: "{{fields.voice_id}}",
            },
            promptSync: {
              strategy: "speaker_lines",
              textKey: "text",
              defaultVoiceField: "voice_id",
              speakerPattern: "^\\s*Speaker\\s*(\\d+)\\s*[:：-]\\s*(.*)$",
              speakerVoiceFields: {
                "1": "voice_id",
                "2": "voice_id_2",
              },
            },
          },
        ],
      },
    };

    const extraParams = applyModelSyncTargets(
      model,
      buildDefaultExtraParamsForModel(model),
      {
        prompt: [
          "Speaker 1: [giggling] Knock knock",
          "Speaker 2: [curious] Who is there?",
        ].join("\n"),
      },
    );

    expect(extraParams).toMatchObject({
      inputs: [
        { text: "[giggling] Knock knock", voice_id: "voice-1" },
        { text: "[curious] Who is there?", voice_id: "voice-2" },
      ],
    });
  });

  it("infers prompt sync for speaker-labelled dialogue arrays even when syncWith is omitted", () => {
    const model = {
      id: "elevenlabs-dialogue",
      name: "ElevenLabs Dialogue",
      configJson: {
        inputFields: [
          { key: "voice_id", label: "Speaker 1 Voice", type: "select", default: "voice-1" },
          { key: "voice_id_2", label: "Speaker 2 Voice", type: "select", default: "voice-2" },
          {
            key: "inputs",
            label: "Dialogue Inputs",
            type: "array",
            itemTemplate: {
              text: "{{item}}",
              voice_id: "{{fields.voice_id}}",
            },
            promptSync: {
              strategy: "speaker_lines",
              textKey: "text",
              defaultVoiceField: "voice_id",
              speakerVoiceFields: {
                "1": "voice_id",
                "2": "voice_id_2",
              },
            },
          },
        ],
      },
    };

    const fields = parseModelInputFields(model);
    expect(fields.find((field) => field.key === "inputs")?.syncWith).toBe("prompt");

    const extraParams = applyModelSyncTargets(
      model,
      {
        voice_id: "current-speaker-1",
        voice_id_2: "current-speaker-2",
        inputs: [
          { text: "stale", voice_id: "stale-old-voice" },
        ],
      },
      {
        prompt: [
          "Speaker 1: Fresh line",
          "Speaker 2: Fresh reply",
        ].join("\n"),
      },
    );

    expect(extraParams?.inputs).toEqual([
      { text: "Fresh line", voice_id: "current-speaker-1" },
      { text: "Fresh reply", voice_id: "current-speaker-2" },
    ]);
  });

  it("preserves maxItems metadata for synchronized image fields", () => {
    const model = {
      id: "wavespeed-video-model",
      name: "WaveSpeed",
      configJson: {
        inputFields: [
          {
            key: "image_urls",
            label: "Reference Images",
            type: "image_urls",
            syncWith: "reference_images",
            maxItems: 4,
          },
        ],
      },
    };

    expect(getModelInputField(model, "image_urls")).toMatchObject({
      key: "image_urls",
      maxItems: 4,
      syncWith: "reference_images",
    });
    expect(getModelReferenceImageLimit(model)).toBe(4);
  });

  it("preserves generic numeric and library metadata for Magnific controls", () => {
    const model = {
      id: "magnific/change-camera",
      name: "Change Camera",
      configJson: {
        inputFields: [
          {
            key: "horizontal_angle",
            label: "Horizontal Angle",
            type: "number",
            min: 0,
            max: 360,
            step: 1,
          },
          {
            key: "image_urls",
            label: "Reference Images",
            type: "image_urls",
            syncWith: "reference_images",
            allowedExtensions: "jpg,jpeg,png,webp",
          },
        ],
      },
    };

    expect(getModelInputField(model, "horizontal_angle")).toMatchObject({
      min: 0,
      max: 360,
      step: 1,
    });
    expect(getModelInputField(model, "image_urls")?.allowedExtensions).toEqual(["jpg", "jpeg", "png", "webp"]);
  });

  it("tracks reference image and video support independently", () => {
    const model = {
      id: "test-video-model",
      name: "Test Video Model",
      configJson: {
        inputFields: [
          { key: "video_urls", type: "video_urls" },
        ],
      },
    };

    expect(getModelReferenceInputSupport(model)).toEqual({
      imageUrls: false,
      videoUrls: true,
      audioUrls: false,
    });
  });

  it("recognizes explicit reference_videos sync fields even when the field type is generic", () => {
    const model = {
      id: "test-video-model",
      name: "Test Video Model",
      configJson: {
        inputFields: [
          { key: "motion_refs", type: "array", syncWith: "reference_videos" },
        ],
      },
    };

    expect(getModelReferenceInputSupport(model)).toEqual({
      imageUrls: false,
      videoUrls: true,
      audioUrls: false,
    });
  });

  it("enables image references for legacy video models without explicit reference inputs", () => {
    const model = {
      id: "legacy-video-model",
      name: "Legacy Video Model",
      configJson: {
        generateType: "video-to-video",
        inputFields: [],
      },
    };

    expect(getModelReferenceInputSupport(model)).toEqual({
      imageUrls: true,
      videoUrls: false,
      audioUrls: false,
    });
  });

  it("enables image references for MCP models from explicit config flags", () => {
    const model = {
      id: "higgsfield/nano_banana_2",
      name: "Nano Banana 2 (Higgsfield MCP)",
      configJson: {
        transport: "mcp",
        supportsReferenceImages: true,
        referenceInputs: { image: true },
        inputFields: [],
      },
    };

    expect(getModelReferenceInputSupport(model)).toEqual({
      imageUrls: true,
      videoUrls: false,
      audioUrls: false,
    });
  });

  it("labels video generation modes from config data", () => {
    expect(getModelGenerationModeLabel({
      id: "generic-video-to-video",
      name: "Generic Video Model",
      configJson: {
        generateType: "video-to-video",
        inputFields: [{ key: "video_urls", type: "video_urls" }],
      },
    })).toBe("Video to Video");

    expect(getModelGenerationModeLabel({
      id: "generic-text-to-video",
      name: "Generic Text Model",
      configJson: {
        generateType: "text-to-video",
      },
    })).toBe("Text to Video");

    expect(getModelGenerationModeLabel({
      id: "generic-text-to-speech",
      name: "Generic Audio Model",
      configJson: {
        generateType: "text-to-speech",
      },
    })).toBe("Text to Speech");
  });

  it("labels image-to-image models as image-to-image instead of image-to-video", () => {
    expect(getModelGenerationModeLabel({
      id: "gpt-image-2-image-to-image",
      name: "GPT Image 2 Image-to-Image",
      configJson: {
        generateType: "image-to-image",
        inputFields: [{ key: "input_urls", type: "image_urls", syncWith: "reference_images" }],
      },
    })).toBe("Image to Image");
  });

  it("builds default rows for structured array fields", () => {
    const item = buildDefaultModelInputArrayItem([
      { key: "speaker_id", label: "Speaker ID", type: "text", required: true },
      {
        key: "voice",
        label: "Voice",
        type: "select",
        required: true,
        options: [{ value: "Kore", label: "Kore" }],
      },
    ]);

    expect(item).toEqual({
      speaker_id: "Speaker1",
      voice: "Kore",
    });
  });

  it("preserves optional Gemini language_code select fields with auto-detect as an unset value", () => {
    const model = {
      id: "test-audio-model",
      name: "Test Audio Model",
      configJson: {
        inputFields: [
          {
            key: "language_code",
            label: "Language Code",
            type: "select",
            searchable: true,
            options: [
              { value: "__auto__", label: "Auto-detect" },
              { value: "English (US)", label: "English (US)" },
            ],
          },
        ],
      },
    };

    const fields = parseModelInputFields(model);
    expect(fields[0]).toMatchObject({
      key: "language_code",
      searchable: true,
    });
    expect(fields[0]?.options?.[0]).toEqual({
      value: "__auto__",
      label: "Auto-detect",
    });
    expect(buildDefaultExtraParamsForModel(model)).toBeUndefined();
  });

  it("applies reference video sync values and validates required fields", () => {
    const model = {
      id: "test-video-model",
      name: "Test Video Model",
      configJson: {
        inputFields: [
          { key: "motion_refs", label: "Motion References", type: "video_urls", syncWith: "reference_videos", required: true },
        ],
      },
    };

    const extraParams = applyModelSyncTargets(model, undefined, {
      referenceVideoUrls: ["https://cdn.example.com/ref-video.mp4"],
    });

    expect(extraParams).toEqual({
      motion_refs: ["https://cdn.example.com/ref-video.mp4"],
    });

    const fields = parseModelInputFields(model);
    expect(
      getMissingRequiredModelFields(fields, {
        extraParams,
        referenceVideoUrls: ["https://cdn.example.com/ref-video.mp4"],
      }),
    ).toEqual([]);
    expect(
      getMissingRequiredModelFields(fields, {
        extraParams: undefined,
        referenceVideoUrls: [],
      }),
    ).toEqual(["Motion References"]);
  });

  it("reports missing required nested array item fields", () => {
    const model = {
      id: "test-audio-model",
      name: "Test Audio Model",
      configJson: {
        inputFields: [
          {
            key: "speakers",
            label: "Speakers",
            type: "array",
            itemLabel: "Speaker",
            itemFields: [
              { key: "speaker_id", label: "Speaker ID", type: "text", required: true },
              {
                key: "voice",
                label: "Voice",
                type: "select",
                required: true,
                options: [{ value: "Kore", label: "Kore" }],
              },
            ],
          },
        ],
      },
    };

    const fields = parseModelInputFields(model);
    const missing = getMissingRequiredModelFields(fields, {
      extraParams: {
        speakers: [{ voice: "Kore" }],
      },
    });

    expect(missing).toEqual(["Speakers 1 Speaker ID"]);
  });

  it("clamps synced reference images to the model-declared maxItems limit", () => {
    const model = {
      id: "wavespeed-video-model",
      name: "WaveSpeed",
      configJson: {
        maxReferenceImages: 4,
        inputFields: [
          {
            key: "image_urls",
            label: "Reference Images",
            type: "image_urls",
            syncWith: "reference_images",
            maxItems: 4,
          },
        ],
      },
    };

    const extraParams = applyModelSyncTargets(model, undefined, {
      referenceImageUrls: [
        "https://cdn.example.com/1.png",
        "https://cdn.example.com/2.png",
        "https://cdn.example.com/3.png",
        "https://cdn.example.com/4.png",
        "https://cdn.example.com/5.png",
      ],
    });

    expect(extraParams).toEqual({
      image_urls: [
        "https://cdn.example.com/1.png",
        "https://cdn.example.com/2.png",
        "https://cdn.example.com/3.png",
        "https://cdn.example.com/4.png",
      ],
    });

    expect(
      clampReferenceImagesToModelLimit(model, [
        { url: "1" },
        { url: "2" },
        { url: "3" },
        { url: "4" },
        { url: "5" },
      ]),
    ).toEqual({
      items: [{ url: "1" }, { url: "2" }, { url: "3" }, { url: "4" }],
      maxItems: 4,
      droppedCount: 1,
    });
  });
});
