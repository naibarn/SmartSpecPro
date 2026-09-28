import { describe, expect, it } from "vitest";
import { getGalleryMediaUrl, isGalleryImageSource } from "./galleryMedia";

describe("gallery media URLs", () => {
  it("prefers the public gallery route when a durable key exists", () => {
    expect(
      getGalleryMediaUrl(
        { id: 15, fileKey: "gallery/images/15.jpg", fileUrl: "/expired-url" },
        "file"
      )
    ).toBe("/api/gallery/media/15/file");
  });

  it("uses thumbnail keys before the main file key", () => {
    expect(
      getGalleryMediaUrl(
        {
          id: 16,
          fileKey: "gallery/videos/16.mp4",
          thumbnailKey: "gallery/images/16.jpg",
        },
        "thumbnail"
      )
    ).toBe("/api/gallery/media/16/thumbnail");
  });

  it("normalizes legacy URL-only items", () => {
    expect(
      getGalleryMediaUrl(
        { id: 17, fileUrl: "https://cdn.example.com/17.jpg" },
        "file"
      )
    ).toBe("https://cdn.example.com/17.jpg");
  });

  it("uses the public route for legacy managed URL-only items", () => {
    expect(
      getGalleryMediaUrl(
        {
          id: 18,
          fileUrl: "/api/storage/files/gallery/images/18.jpg",
        },
        "file"
      )
    ).toBe("/api/gallery/media/18/file");
  });

  it("marks file URLs as downloads without affecting playback URLs", () => {
    expect(
      getGalleryMediaUrl(
        { id: 19, fileKey: "gallery/videos/19.mp4" },
        "file",
        { download: true },
      ),
    ).toBe("/api/gallery/media/19/file?download=1");
    expect(
      getGalleryMediaUrl(
        { id: 19, fileKey: "gallery/videos/19.mp4" },
        "file",
      ),
    ).toBe("/api/gallery/media/19/file");
  });

  it("classifies image thumbnails without confusing storage API routes", () => {
    expect(isGalleryImageSource("gallery/images/17.jpg")).toBe(true);
    expect(isGalleryImageSource("/api/gallery/media/17/thumbnail")).toBe(false);
    expect(isGalleryImageSource("gallery/videos/17.mp4")).toBe(false);
  });
});
