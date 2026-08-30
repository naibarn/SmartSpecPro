import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { Readable } from "node:stream";

import { createPublicGalleryMediaRouter } from "../publicGalleryMedia";
import { getGalleryItemById } from "../../db";
import { storageStreamFile } from "../../storage";

vi.mock("../../db", () => ({
  getGalleryItemById: vi.fn(),
}));

vi.mock("../../storage", () => ({
  storageStreamFile: vi.fn(),
}));

const mockGetGalleryItemById = vi.mocked(getGalleryItemById);
const mockStorageStreamFile = vi.mocked(storageStreamFile);

const publishedImage = {
  id: 15,
  tenantId: null,
  isPublished: true,
  fileKey: "gallery/images/item-15.jpg",
  fileUrl: "/api/storage/files/gallery/images/item-15.jpg",
  thumbnailKey: "gallery/images/item-15.jpg",
  thumbnailUrl: "/api/storage/files/gallery/images/item-15.jpg",
};

function makeApp(tenantId?: number) {
  const app = express();
  if (tenantId) {
    app.use((req: any, _res, next) => {
      req.tenantId = tenantId;
      next();
    });
  }
  app.use("/api/gallery/media", createPublicGalleryMediaRouter());
  return app;
}

function mockStream(contentType = "image/jpeg") {
  mockStorageStreamFile.mockResolvedValue({
    stream: Readable.from(Buffer.from("media-bytes")),
    contentType,
    contentLength: 11,
    totalLength: 11,
    etag: '"gallery-item-15"',
    isPartial: false,
  });
}

describe("public gallery media", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("streams a published gallery object from its storage key without user auth", async () => {
    mockGetGalleryItemById.mockResolvedValue(publishedImage as any);
    mockStream();

    const response = await request(makeApp()).get(
      "/api/gallery/media/15/thumbnail"
    );

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("image/jpeg");
    expect(response.headers["cache-control"]).toContain("public");
    expect(response.body.toString()).toBe("media-bytes");
    expect(mockStorageStreamFile).toHaveBeenCalledWith(
      "gallery/images/item-15.jpg",
      undefined
    );
  });

  it("preserves byte ranges for video seeking", async () => {
    mockGetGalleryItemById.mockResolvedValue({
      ...publishedImage,
      id: 16,
      fileKey: "gallery/videos/item-16.mp4",
      thumbnailKey: "gallery/videos/item-16.mp4",
    } as any);
    mockStorageStreamFile.mockResolvedValue({
      stream: Readable.from(Buffer.from("video-part")),
      contentType: "video/mp4",
      contentLength: 10,
      totalLength: 100,
      rangeStart: 0,
      rangeEnd: 9,
      isPartial: true,
    });

    const response = await request(makeApp())
      .get("/api/gallery/media/16/file")
      .set("Range", "bytes=0-9");

    expect(response.status).toBe(206);
    expect(response.headers["accept-ranges"]).toBe("bytes");
    expect(response.headers["content-range"]).toBe("bytes 0-9/100");
    expect(mockStorageStreamFile).toHaveBeenCalledWith(
      "gallery/videos/item-16.mp4",
      "bytes=0-9"
    );
  });

  it("sets a meaningful attachment filename only for explicit downloads", async () => {
    mockGetGalleryItemById.mockResolvedValue({
      ...publishedImage,
      id: 17,
      type: "video",
      title: "Cafe คาเฟ่รัก ตอนที่ 1-2",
      fileKey: "gallery/videos/17.mp4",
      thumbnailKey: "gallery/videos/17.mp4",
    } as any);
    mockStream("video/mp4");

    const downloadResponse = await request(makeApp()).get(
      "/api/gallery/media/17/file?download=1",
    );
    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers["content-disposition"]).toContain(
      "filename*=UTF-8''",
    );
    expect(downloadResponse.headers["content-disposition"]).toContain(
      "Cafe",
    );

    mockStream("video/mp4");
    const playbackResponse = await request(makeApp()).get(
      "/api/gallery/media/17/file",
    );
    expect(playbackResponse.status).toBe(200);
    expect(playbackResponse.headers["content-disposition"]).toBeUndefined();
  });

  it("does not expose unpublished gallery media", async () => {
    mockGetGalleryItemById.mockResolvedValue({
      ...publishedImage,
      isPublished: false,
    } as any);

    const response = await request(makeApp()).get("/api/gallery/media/15/file");

    expect(response.status).toBe(404);
    expect(mockStorageStreamFile).not.toHaveBeenCalled();
  });

  it("does not expose tenant media through another tenant", async () => {
    mockGetGalleryItemById.mockResolvedValue({
      ...publishedImage,
      tenantId: 22,
    } as any);

    const response = await request(makeApp(23)).get(
      "/api/gallery/media/15/file"
    );

    expect(response.status).toBe(404);
    expect(mockStorageStreamFile).not.toHaveBeenCalled();
  });

  it("treats legacy NaN tenant rows as global published media", async () => {
    mockGetGalleryItemById.mockResolvedValue({
      ...publishedImage,
      tenantId: "NaN",
    } as any);
    mockStream();

    const response = await request(makeApp()).get(
      "/api/gallery/media/15/file"
    );

    expect(response.status).toBe(200);
    expect(mockStorageStreamFile).toHaveBeenCalledWith(
      "gallery/images/item-15.jpg",
      undefined
    );
  });
});
