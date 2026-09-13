import { beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import sharp from "sharp";

const mocks = vi.hoisted(() => ({
  getLibraryItemById: vi.fn(),
  getMcpMediaTask: vi.fn(),
  getHermesMediaTask: vi.fn(),
  canReadManagedStorageKey: vi.fn(),
  storageStreamFile: vi.fn(),
  grants: new Map<string, string>(),
}));

vi.mock("../libraryService", () => ({
  getLibraryItemById: mocks.getLibraryItemById,
}));
vi.mock("../mcpMediaAdapter", () => ({
  getMcpMediaTask: mocks.getMcpMediaTask,
}));
vi.mock("../hermesMediaAdapter", () => ({
  getHermesMediaTask: mocks.getHermesMediaTask,
}));
vi.mock("../managedStorageAuthorizationService", () => ({
  canReadManagedStorageKey: mocks.canReadManagedStorageKey,
}));
vi.mock("../../storage", () => ({
  storageStreamFile: mocks.storageStreamFile,
}));
vi.mock("../../_core/tokens", async () => {
  const actual = await vi.importActual<typeof import("../../_core/tokens")>("../../_core/tokens");
  return {
    ...actual,
    signBearerToken: vi.fn((claims: { resourceType: string; resourceId: string; jti: string }, ttl: string) => {
      const token = `download-${claims.resourceType}-${claims.resourceId}-${claims.jti}`;
      (mocks as any).lastClaims = claims;
      (mocks as any).lastTtl = ttl;
      (mocks as any).tokens = (mocks as any).tokens ?? new Map();
      (mocks as any).tokens.set(token, claims);
      return token;
    }),
    verifyBearerToken: vi.fn(async (token: string) => {
      if (token.startsWith("mcp_provider_")) throw new Error("not a JWT");
      return {
      ...(mocks as any).tokens?.get(token),
      sub: "24",
      tenantId: "tenant-1",
      aud: "smartspec-mcp-download",
      tokenUse: "mcp_download",
      type: "access",
      };
    }),
    createInternalTokenFromAuth: vi.fn(() => "internal-media-token"),
  };
});
vi.mock("../redisClients", () => ({
  getCacheClient: () => ({
    get: vi.fn(async (key: string) => mocks.grants.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      mocks.grants.set(key, value);
      return "OK";
    }),
  }),
}));

import {
  createLibraryDownloadRef,
  createManagedStorageDownloadRef,
  createProviderManagedStorageDownloadRef,
  createMediaTaskDownloadRef,
  resolveMcpDownloadRef,
} from "../mcpDownloadBrokerService";

const owner = { tenantId: "tenant-1", userId: 24, role: "user" } as const;
const otherUser = { tenantId: "tenant-1", userId: 99, role: "user" } as const;

beforeEach(() => {
  mocks.grants.clear();
  (mocks as any).tokens = new Map();
  (mocks as any).lastTtl = undefined;
  vi.clearAllMocks();
  mocks.storageStreamFile.mockResolvedValue({
    stream: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); } }),
    contentType: "application/octet-stream",
    contentLength: 3,
    totalLength: 3,
    isPartial: false,
  });
});

describe("MCP download broker ACL and transfer contract", () => {
  it.each(["node", "web"])("converts authorized WebP JPEG aliases with a %s stream", async (kind) => {
    mocks.canReadManagedStorageKey.mockResolvedValue(true);
    const key = "chat/uploads/tenant-1/24/reference.jpg";
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).webp().toBuffer();
    const stream = kind === "node" ? Readable.from([bytes]) : new ReadableStream({
      start(controller) { controller.enqueue(bytes); controller.close(); },
    });
    mocks.storageStreamFile.mockResolvedValueOnce(null).mockResolvedValueOnce({
      stream, contentType: "image/webp", contentLength: bytes.length,
      totalLength: bytes.length, etag: "webp-etag", isPartial: false,
    });
    const ref = await createProviderManagedStorageDownloadRef(key, owner);
    const result = await resolveMcpDownloadRef(ref.downloadRef, "bytes=0-2");
    const chunks = [];
    for await (const chunk of result.stream as Readable) chunks.push(Buffer.from(chunk));
    expect((await sharp(Buffer.concat(chunks)).metadata()).format).toBe("jpeg");
    expect(result.contentType).toBe("image/jpeg");
    expect(result.isPartial).toBe(false);
    expect(result.contentLength).toBeUndefined();
    expect(result).not.toHaveProperty("etag");
    expect(mocks.canReadManagedStorageKey).toHaveBeenCalledWith(key.replace(".jpg", ".webp"), expect.objectContaining({ userId: 24, tenantId: "tenant-1" }));
    expect(mocks.storageStreamFile).toHaveBeenLastCalledWith(key.replace(".jpg", ".webp"));
  });

  it("does not read the WebP fallback when its ACL fails", async () => {
    mocks.canReadManagedStorageKey.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    mocks.storageStreamFile.mockResolvedValue(null);
    const ref = await createProviderManagedStorageDownloadRef("chat/uploads/tenant-1/24/reference.jpg", owner);
    await expect(resolveMcpDownloadRef(ref.downloadRef)).rejects.toThrow("download_file_unavailable");
    expect(mocks.storageStreamFile).toHaveBeenCalledTimes(1);
  });

  it("still rejects a JPEG alias when the original WebP is missing", async () => {
    mocks.canReadManagedStorageKey.mockResolvedValue(true);
    mocks.storageStreamFile.mockResolvedValue(null);
    const ref = await createProviderManagedStorageDownloadRef("chat/uploads/tenant-1/24/missing.jpg", owner);
    await expect(resolveMcpDownloadRef(ref.downloadRef)).rejects.toThrow("download_file_unavailable");
  });

  it("issues and resolves a library file only through the owner-scoped reference", async () => {
    mocks.getLibraryItemById.mockResolvedValue({
      id: 42,
      title: "Scene Reference",
      deletedAt: null,
      sourceUrl: "/api/storage/files/chat/uploads/tenant-1/24/reference.png",
      metadata: { mime_type: "image/png", original_filename: "reference.png" },
    });

    const ref = await createLibraryDownloadRef(42, owner);
    expect(ref.contentType).toBe("image/png");
    expect(ref.fileName).toBe("reference.png");

    const resolved = await resolveMcpDownloadRef(ref.downloadRef, undefined);
    expect(resolved.fileName).toBe("reference.png");
    expect(mocks.storageStreamFile).toHaveBeenCalledWith("chat/uploads/tenant-1/24/reference.png", undefined);
  });

  it("does not issue a library reference for another user", async () => {
    mocks.getLibraryItemById.mockResolvedValue(null);
    await expect(createLibraryDownloadRef(42, otherUser)).rejects.toThrow("library_file_unavailable");
    expect(mocks.storageStreamFile).not.toHaveBeenCalled();
  });

  it("supports completed video and image media-history downloads with media ACL re-checks", async () => {
    mocks.getMcpMediaTask.mockImplementation(async (taskId: string, userId: number, tenantId: string) =>
      taskId === "mcp_video-1" && userId === 24 && tenantId === "tenant-1"
        ? { id: taskId, status: "completed", mediaType: "video", resultUrl: "/api/storage/files/media/video-1.mp4" }
        : null,
    );

    const ref = await createMediaTaskDownloadRef("mcp_video-1", owner);
    expect(ref.contentType).toBe("video/mp4");
    expect(ref.fileName).toBe("mcp_video-1.mp4");
    await expect(resolveMcpDownloadRef(ref.downloadRef, "bytes=0-2")).resolves.toMatchObject({
      fileName: "mcp_video-1.mp4",
    });
    expect(mocks.getMcpMediaTask).toHaveBeenCalledWith("mcp_video-1", 24, "tenant-1");

    await expect(createMediaTaskDownloadRef("mcp_video-1", otherUser)).rejects.toThrow("media_file_unavailable");
  });

  it("re-checks managed R2/storage ACL at stream time and rejects after access is revoked", async () => {
    mocks.canReadManagedStorageKey.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const ref = await createManagedStorageDownloadRef("media/tenant-1/24/video.mp4", owner);
    await expect(resolveMcpDownloadRef(ref.downloadRef, undefined)).rejects.toThrow("download_ref_revoked");
    expect(mocks.storageStreamFile).not.toHaveBeenCalled();
  });

  it("uses a longer provider-only TTL so queued media tasks can fetch references", async () => {
    mocks.canReadManagedStorageKey.mockResolvedValue(true);

    const ref = await createProviderManagedStorageDownloadRef("media/tenant-1/24/reference.png", owner);

    expect(ref.expiresInSeconds).toBe(24 * 60 * 60);
    expect((mocks as any).lastTtl).toBeUndefined();
    expect(mocks.canReadManagedStorageKey).toHaveBeenCalledWith(
      "media/tenant-1/24/reference.png",
      owner,
    );
  });

  it("uses a compact opaque provider reference while preserving ACL resolution", async () => {
    mocks.canReadManagedStorageKey.mockResolvedValue(true);

    const ref = await createProviderManagedStorageDownloadRef(
      "media/tenant-1/24/reference.png",
      owner,
    );

    expect(ref.downloadRef).toMatch(/^mcp_provider_/);
    expect(ref.downloadRef.length).toBeLessThan(100);
    await expect(resolveMcpDownloadRef(ref.downloadRef, undefined)).resolves.toMatchObject({
      fileName: "reference.png",
      contentType: "image/png",
    });
    expect(mocks.canReadManagedStorageKey).toHaveBeenCalledWith(
      "media/tenant-1/24/reference.png",
      owner,
    );
  });

  it("does not allow an absent Redis grant to become a bearer download", async () => {
    mocks.getLibraryItemById.mockResolvedValue({
      id: 42,
      title: "Scene Reference",
      deletedAt: null,
      sourceUrl: "/api/storage/files/chat/uploads/tenant-1/24/reference.png",
      metadata: { mime_type: "image/png" },
    });
    const ref = await createLibraryDownloadRef(42, owner);
    mocks.grants.clear();
    await expect(resolveMcpDownloadRef(ref.downloadRef, undefined)).rejects.toThrow("download_ref_revoked");
  });
});
