import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  assertR2StorageActive: vi.fn(),
  storageExists: vi.fn(),
  storagePutFromPath: vi.fn(),
}));

vi.mock("../../db", () => ({ getDb: mocks.getDb }));
vi.mock("../../storage", () => ({
  assertR2StorageActive: mocks.assertR2StorageActive,
  storageExists: mocks.storageExists,
  storagePutFromPath: mocks.storagePutFromPath,
}));

import {
  ensureVerticalDramaManagedMediaAsset,
  ingestVerticalDramaMediaAsset,
} from "../verticalDramaMediaAssetService";

function makeDb(rows: unknown[]) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  return chain;
}

describe("Vertical Drama media asset durability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertR2StorageActive.mockResolvedValue(undefined);
    mocks.storageExists.mockResolvedValue(false);
  });

  it("resolves a managed URL to its owned media asset ID", async () => {
    const db = makeDb([
      {
        id: 1559,
        storageKey: "vertical-drama/16/image/episode_cover/cover.png",
        mimeType: "image/png",
      },
    ]);
    mocks.getDb.mockReturnValue(db);

    const result = await ingestVerticalDramaMediaAsset({
      tenantId: "tenant-1",
      userId: 7,
      seriesId: 16,
      mediaType: "image",
      sourceUrl:
        "/api/storage/files/vertical-drama/16/image/episode_cover/cover.png",
      purpose: "episode_cover",
    });

    expect(result).toEqual({
      mediaAssetId: 1559,
      storageKey: "vertical-drama/16/image/episode_cover/cover.png",
      url: "/api/storage/files/vertical-drama/16/image/episode_cover/cover.png",
      mimeType: "image/png",
    });
    expect(mocks.assertR2StorageActive).not.toHaveBeenCalled();
    expect(mocks.storagePutFromPath).not.toHaveBeenCalled();
  });

  it("does not allow an unregistered managed URL to become asset ID zero", async () => {
    mocks.getDb.mockReturnValue(makeDb([]));

    await expect(
      ingestVerticalDramaMediaAsset({
        tenantId: "tenant-1",
        userId: 7,
        seriesId: 16,
        mediaType: "image",
        sourceUrl:
          "/api/storage/files/vertical-drama/16/image/episode_cover/missing.png",
        purpose: "episode_cover",
      })
    ).rejects.toThrow("managed media asset is not registered");
  });

  it("re-registers an existing legacy managed upload without copying it", async () => {
    const db = makeDb([
      {
        id: 2051,
        storageKey: "media-jobs/assets/legacy/video.mp4",
        mimeType: "video/mp4",
        status: "ready",
      },
    ]);
    // The first select is empty; the insert returns the newly created row.
    db.limit.mockResolvedValueOnce([]);
    db.returning.mockResolvedValueOnce([
      {
        id: 2051,
        storageKey: "media-jobs/assets/legacy/video.mp4",
        mimeType: "video/mp4",
      },
    ]);
    mocks.getDb.mockReturnValue(db);
    mocks.storageExists.mockResolvedValue(true);

    const result = await ensureVerticalDramaManagedMediaAsset({
      tenantId: "tenant-1",
      userId: 7,
      sourceUrl: "/api/storage/files/media-jobs/assets/legacy/video.mp4",
      mediaType: "video",
    });

    expect(result).toEqual({
      mediaAssetId: 2051,
      storageKey: "media-jobs/assets/legacy/video.mp4",
      url: "/api/storage/files/media-jobs/assets/legacy/video.mp4",
      mimeType: "video/mp4",
    });
    expect(mocks.storageExists).toHaveBeenCalledWith(
      "media-jobs/assets/legacy/video.mp4",
    );
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(mocks.storagePutFromPath).not.toHaveBeenCalled();
  });
});
