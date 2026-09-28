import { describe, expect, it } from "vitest";
import { projectDramaShotFrameUrlsForExtension } from "./verticalDramaExtensionReadService";

describe("projectDramaShotFrameUrlsForExtension", () => {
  const assets = new Map([
    [
      101,
      {
        originalUrl: "https://cdn.test/start-full.jpg",
        thumbnailUrl: "https://cdn.test/start-thumb.jpg",
      },
    ],
    [
      202,
      {
        originalUrl: "https://cdn.test/stop-full.jpg",
        thumbnailUrl: "https://cdn.test/stop-thumb.jpg",
      },
    ],
    [
      303,
      {
        originalUrl: null,
        thumbnailUrl: "https://cdn.test/stop-only-thumb.jpg",
      },
    ],
  ]);

  it("projects the approved Start and Stop assets for the same shot", () => {
    expect(
      projectDramaShotFrameUrlsForExtension({
        startFrameAssetId: "101",
        stopFrameAssetId: "202",
        assetById: assets,
      })
    ).toEqual({
      mainImageUrl: "https://cdn.test/start-full.jpg",
      mainImageThumbnailUrl: "https://cdn.test/start-thumb.jpg",
      stopFrameUrl: "https://cdn.test/stop-full.jpg",
      stopFrameThumbnailUrl: "https://cdn.test/stop-thumb.jpg",
    });
  });

  it("keeps Stop optional when the shot has no approved Stop asset", () => {
    expect(
      projectDramaShotFrameUrlsForExtension({
        startFrameAssetId: 101,
        stopFrameAssetId: undefined,
        assetById: assets,
      })
    ).toMatchObject({
      mainImageUrl: "https://cdn.test/start-full.jpg",
      stopFrameUrl: null,
      stopFrameThumbnailUrl: null,
    });
  });

  it("uses a thumbnail-only Stop asset without inventing an original URL", () => {
    expect(
      projectDramaShotFrameUrlsForExtension({
        startFrameAssetId: 101,
        stopFrameAssetId: 303,
        assetById: assets,
      })
    ).toMatchObject({
      stopFrameUrl: null,
      stopFrameThumbnailUrl: "https://cdn.test/stop-only-thumb.jpg",
    });
  });
});
