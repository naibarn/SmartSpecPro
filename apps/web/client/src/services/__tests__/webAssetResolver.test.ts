import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebAssetResolver } from "../webAssetResolver";

class MockXMLHttpRequest {
  static instances: MockXMLHttpRequest[] = [];

  status = 200;
  statusText = "OK";
  responseText = "";
  upload = { addEventListener: vi.fn() };
  withCredentials = false;
  private handlers = new Map<string, () => void>();

  constructor() {
    MockXMLHttpRequest.instances.push(this);
  }

  open = vi.fn();
  setRequestHeader = vi.fn();

  addEventListener(event: string, handler: () => void) {
    this.handlers.set(event, handler);
  }

  send = vi.fn(() => {
    queueMicrotask(() => this.handlers.get("load")?.());
  });

  abort = vi.fn(() => {
    this.handlers.get("abort")?.();
  });
}

describe("WebAssetResolver", () => {
  let resolver: WebAssetResolver;

  beforeEach(() => {
    vi.resetAllMocks();
    MockXMLHttpRequest.instances = [];
    vi.stubGlobal("XMLHttpRequest", MockXMLHttpRequest);
    resolver = new WebAssetResolver();
  });

  it("uploadAsset sends file to upload endpoint and returns URI", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          method: "presigned",
          assetId: "asset-123",
          key: "media-jobs/assets/asset-123/test.mp4",
          uploadUrl: "https://storage.example/upload",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
        assetId: "asset-123",
        uri: "/api/storage/files/media-jobs/assets/asset-123/test.mp4",
        mediaAssetId: "901",
      }),
      });
    vi.stubGlobal("fetch", mockFetch);

    const file = new File(["video data"], "test.mp4", { type: "video/mp4" });
    const result = await resolver.uploadAsset(file).promise;

    expect(result.assetId).toBe("asset-123");
    expect(result.uri).toBe("/api/storage/files/media-jobs/assets/asset-123/test.mp4");
    expect(result.mediaAssetId).toBe("901");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1]?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({
        assetId: "asset-123",
        key: "media-jobs/assets/asset-123/test.mp4",
        contentType: "video/mp4",
        fileSize: 10,
      }),
    }));
    expect(MockXMLHttpRequest.instances[0]?.open).toHaveBeenCalledWith("PUT", "https://storage.example/upload");
  });

  it("resolveAsset returns cached URI without network call", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          method: "presigned",
          assetId: "a1",
          key: "media-jobs/assets/a1/test.mp4",
          uploadUrl: "https://storage.example/upload",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ assetId: "a1", uri: "/uploads/a1.mp4" }),
      }));

    const file = new File(["data"], "test.mp4", { type: "video/mp4" });
    await resolver.uploadAsset(file).promise;

    // After upload, the URI should be cached
    const uri = resolver.resolveAsset("a1");
    expect(uri).toBe("/uploads/a1.mp4");
  });

  it("uploadAsset validates file size before uploading", async () => {
    // Mock a file exceeding 2GB
    const bigFile = new File(["x"], "huge.mp4", { type: "video/mp4" });
    Object.defineProperty(bigFile, "size", { value: 2.5 * 1024 * 1024 * 1024 });

    expect(() => resolver.uploadAsset(bigFile)).toThrow(/exceeds limit/i);
  });

  it("uploadAsset validates file extension", async () => {
    const exeFile = new File(["data"], "virus.exe", { type: "application/octet-stream" });

    expect(() => resolver.uploadAsset(exeFile)).toThrow(/unsupported file type/i);
  });

  it("importRemoteAsset copies remote media through server storage", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        assetId: "audio-1",
        uri: "/api/storage/files/media-jobs/assets/audio-1/audio.mp3",
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await resolver.importRemoteAsset("https://provider.example/audio.mp3?se=x&sig=y", { mediaType: "audio" });

    expect(result.uri).toBe("/api/storage/files/media-jobs/assets/audio-1/audio.mp3");
    expect(mockFetch).toHaveBeenCalledWith("/api/media-jobs/import-url", expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({
        url: "https://provider.example/audio.mp3?se=x&sig=y",
        mediaType: "audio",
      }),
    }));
  });

  it("clearCache removes cached URIs", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          method: "presigned",
          assetId: "a2",
          key: "media-jobs/assets/a2/test.mp4",
          uploadUrl: "https://storage.example/upload",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ assetId: "a2", uri: "/uploads/a2.mp4" }),
      }));

    const file = new File(["data"], "test.mp4", { type: "video/mp4" });
    await resolver.uploadAsset(file).promise;

    expect(resolver.resolveAsset("a2")).toBe("/uploads/a2.mp4");
    resolver.clearCache();
    expect(resolver.resolveAsset("a2")).toBeUndefined();
  });
});
