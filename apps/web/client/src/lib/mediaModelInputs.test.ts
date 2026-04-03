import { describe, expect, it } from "vitest";
import {
  applyModelSyncTargets,
  clampReferenceImagesToModelLimit,
  getModelGenerationModeLabel,
  getMissingRequiredModelFields,
  getModelReferenceInputSupport,
  getModelReferenceImageLimit,
  getModelInputField,
  parseModelInputFields,
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
