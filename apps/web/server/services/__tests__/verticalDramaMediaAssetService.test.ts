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
  reconcileVerticalDramaMediaAsset,
  ensureVerticalDramaTaskResultDurable,
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
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
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
    mocks.storageExists.mockResolvedValue(true);

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

  it("marks an existing ready asset expired when its object is gone", async () => {
    const db = makeDb([
      {
        id: 2052,
        storageKey: "media-jobs/assets/legacy/missing.png",
        mimeType: "image/png",
        status: "ready",
      },
    ]);
    mocks.getDb.mockReturnValue(db);
    mocks.storageExists.mockResolvedValue(false);

    const result = await ensureVerticalDramaManagedMediaAsset({
      tenantId: "tenant-1",
      userId: 7,
      sourceUrl: "/api/storage/files/media-jobs/assets/legacy/missing.png",
      mediaType: "image",
    });

    expect(result).toBeNull();
    expect(db.update).toHaveBeenCalled();
    expect(db.set).toHaveBeenCalledWith(expect.objectContaining({ status: "expired" }));
  });

  it("repairs a pending asset when its managed object is still present", async () => {
    const db = makeDb([
      {
        id: 2053,
        storageKey: "vertical-drama/21/image/start_frame/shot-1.png",
        mimeType: "image/png",
        status: "pending",
        originalUrl:
          "https://provider.example/temporary/shot-1.png?expires=1&sig=old",
      },
    ]);
    mocks.getDb.mockReturnValue(db);
    mocks.storageExists.mockResolvedValue(true);

    const result = await reconcileVerticalDramaMediaAsset({
      tenantId: "tenant-1",
      userId: 7,
      mediaAssetId: 2053,
      storageKey: "vertical-drama/21/image/start_frame/shot-1.png",
      mediaType: "image",
      mimeType: "image/png",
      status: "pending",
      originalUrl:
        "https://provider.example/temporary/shot-1.png?expires=1&sig=old",
    });

    expect(result).toEqual({
      mediaAssetId: 2053,
      storageKey: "vertical-drama/21/image/start_frame/shot-1.png",
      url: "/api/storage/files/vertical-drama/21/image/start_frame/shot-1.png",
      mimeType: "image/png",
      status: "ready",
    });
    expect(db.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ready",
        originalUrl:
          "/api/storage/files/vertical-drama/21/image/start_frame/shot-1.png",
      }),
    );
  });

  it("registers the durable asset in the shared media history ledger", async () => {
    const db = makeDb([
      {
        id: 1559,
        storageKey: "vertical-drama/16/image/episode_cover/cover.png",
        mimeType: "image/png",
      },
    ]);
    mocks.getDb.mockReturnValue(db);
    mocks.storageExists.mockResolvedValue(true);

    const task = {
      id: "vd-cover-task-1",
      status: "completed",
      mediaType: "image",
      model: "test-model",
      prompt: "episode cover",
      resultUrl:
        "/api/storage/files/vertical-drama/16/image/episode_cover/cover.png",
      resultData: {},
      parameters: {
        extra_params: {
          __vd_series_id: "16",
          __vd_purpose: "episode_cover",
        },
      },
      createdAt: new Date(0).toISOString(),
    } as any;

    const result = await ensureVerticalDramaTaskResultDurable({
      tenantId: "tenant-1",
      userId: 7,
      task,
    });

    expect(result).toMatchObject({
      mediaAssetId: 1559,
      storageKey: "vertical-drama/16/image/episode_cover/cover.png",
      durableUrl:
        "/api/storage/files/vertical-drama/16/image/episode_cover/cover.png",
    });
    expect(db.insert).toHaveBeenCalled();
    expect(db.update).toHaveBeenCalled();
    expect(result?.task.resultUrl).toBe(
      "/api/storage/files/vertical-drama/16/image/episode_cover/cover.png",
    );
  });
});
