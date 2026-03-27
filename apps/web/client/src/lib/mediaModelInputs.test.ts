import { describe, expect, it } from "vitest";
import {
  applyModelSyncTargets,
  getModelGenerationModeLabel,
  getMissingRequiredModelFields,
  getModelReferenceInputSupport,
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
});
