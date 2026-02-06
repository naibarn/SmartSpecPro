import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebAssetResolver } from "../webAssetResolver";

describe("WebAssetResolver", () => {
  let resolver: WebAssetResolver;

  beforeEach(() => {
    vi.resetAllMocks();
    resolver = new WebAssetResolver();
  });

  it("uploadAsset sends file to upload endpoint and returns URI", async () => {
    const mockResponse = { assetId: "asset-123", uri: "/uploads/asset-123.mp4" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }));

    const file = new File(["video data"], "test.mp4", { type: "video/mp4" });
    const result = await resolver.uploadAsset(file);

    expect(result.assetId).toBe("asset-123");
    expect(result.uri).toBe("/uploads/asset-123.mp4");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("resolveAsset returns cached URI without network call", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ assetId: "a1", uri: "/uploads/a1.mp4" }),
    }));

    const file = new File(["data"], "test.mp4", { type: "video/mp4" });
    await resolver.uploadAsset(file);

    // After upload, the URI should be cached
    const uri = resolver.resolveAsset("a1");
    expect(uri).toBe("/uploads/a1.mp4");
  });

  it("uploadAsset validates file size before uploading", async () => {
    // Mock a file exceeding 2GB
    const bigFile = new File(["x"], "huge.mp4", { type: "video/mp4" });
    Object.defineProperty(bigFile, "size", { value: 2.5 * 1024 * 1024 * 1024 });

    await expect(resolver.uploadAsset(bigFile)).rejects.toThrow(/exceeds maximum/i);
  });

  it("uploadAsset validates file extension", async () => {
    const exeFile = new File(["data"], "virus.exe", { type: "application/octet-stream" });

    await expect(resolver.uploadAsset(exeFile)).rejects.toThrow(/unsupported file type/i);
  });

  it("clearCache removes cached URIs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ assetId: "a2", uri: "/uploads/a2.mp4" }),
    }));

    const file = new File(["data"], "test.mp4", { type: "video/mp4" });
    await resolver.uploadAsset(file);

    expect(resolver.resolveAsset("a2")).toBe("/uploads/a2.mp4");
    resolver.clearCache();
    expect(resolver.resolveAsset("a2")).toBeUndefined();
  });
});
