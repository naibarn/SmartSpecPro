import { describe, expect, it } from "vitest";

import { findUrl } from "../VideoStudioAssetDock";

describe("VideoStudioAssetDock result URL extraction", () => {
  it("reads image_url nested in the completed task result", () => {
    expect(
      findUrl({
        status: "completed",
        resultData: {
          image_url: "https://cdn.example.com/generated/image.png",
        },
      })
    ).toBe("https://cdn.example.com/generated/image.png");
  });

  it("reads video_url nested in the completed task result", () => {
    expect(
      findUrl({
        status: "completed",
        resultData: {
          data: {
            video_url: "https://cdn.example.com/generated/video.mp4",
          },
        },
      })
    ).toBe("https://cdn.example.com/generated/video.mp4");
  });

  it("reads the first URL from output_urls", () => {
    expect(
      findUrl({
        result_data: {
          output_urls: ["/api/storage/files/images%2Fgenerated%2Fone.png"],
        },
      })
    ).toBe("/api/storage/files/images%2Fgenerated%2Fone.png");
  });

  it("reads URLs from nested provider payloads and resultJson strings", () => {
    expect(
      findUrl({
        resultData: {
          response: {
            resultJson: JSON.stringify({
              taskResult: {
                image_url: "https://cdn.example.com/generated/nested.png",
              },
            }),
          },
        },
      })
    ).toBe("https://cdn.example.com/generated/nested.png");
  });
});
