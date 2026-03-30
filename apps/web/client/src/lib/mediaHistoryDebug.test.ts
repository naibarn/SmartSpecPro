import { describe, expect, it } from "vitest";
import { extractReferenceImageConfig, extractReferenceMediaAssets } from "./mediaHistoryDebug";

describe("extractReferenceImageConfig", () => {
  it("prefers request payload api_config when present", () => {
    const config = extractReferenceImageConfig(
      {
        parameters: {
          api_config: {
            reference_image_input_key: "image_urls",
            reference_image_input_label: "Reference Images",
            reference_image_input_type: "array",
          },
        },
      },
      {
        requestPayload: {
          api_config: {
            reference_image_input_key: "image_urls",
            reference_image_input_label: "Reference Images",
            reference_image_input_type: "array",
          },
        },
      },
    );

    expect(config).toEqual({
      key: "image_urls",
      label: "Reference Images",
      type: "array",
      source: "request_payload",
    });
  });

  it("falls back to task parameters when request payload is missing", () => {
    const config = extractReferenceImageConfig(
      {
        parameters: {
          apiConfig: {
            reference_image_input_key: "reference_image",
            reference_image_input_label: "Reference Images",
            reference_image_input_type: "url",
          },
        },
      },
      null,
    );

    expect(config).toEqual({
      key: "reference_image",
      label: "Reference Images",
      type: "url",
      source: "task_parameters",
    });
  });

  it("extracts image and video reference media assets", () => {
    const assets = extractReferenceMediaAssets(
      {
        parameters: {
          api_config: {
            reference_image_urls: ["https://cdn.example.com/ref-1.jpg"],
            reference_video_url: "https://cdn.example.com/ref-video.mp4",
          },
        },
      },
      {
        requestPayload: {
          api_config: {
            image_urls: ["https://cdn.example.com/ref-2.jpg"],
            video_urls: ["https://cdn.example.com/ref-video-2.mp4"],
          },
        },
      },
    );

    expect(assets).toEqual([
      { url: "https://cdn.example.com/ref-2.jpg", kind: "image" },
      { url: "https://cdn.example.com/ref-video-2.mp4", kind: "video" },
      { url: "https://cdn.example.com/ref-1.jpg", kind: "image" },
      { url: "https://cdn.example.com/ref-video.mp4", kind: "video" },
    ]);
  });
});
