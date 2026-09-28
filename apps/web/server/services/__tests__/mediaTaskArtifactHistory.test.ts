import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureVerticalDramaTaskResultDurable: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("../../db", () => ({ getDb: mocks.getDb }));
vi.mock("../../storage", () => ({
  assertR2StorageActive: vi.fn(),
  storageExists: vi.fn(),
  storagePutFromPath: vi.fn(),
}));
vi.mock("../verticalDramaMediaAssetService", () => ({
  ensureVerticalDramaTaskResultDurable:
    mocks.ensureVerticalDramaTaskResultDurable,
}));

import {
  durabilizeMediaTaskHistory,
  linkMediaTaskArtifactToAsset,
} from "../mediaTaskArtifactService";

function makeDb(row: Record<string, unknown>) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([row]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };
  return chain;
}

const domainTask = {
  id: "vd-cover-task-1",
  status: "completed",
  mediaType: "image",
  model: "test-model",
  prompt: "episode cover",
  resultUrl: "https://provider.example/episode-cover.png",
  resultData: {},
  parameters: {
    extra_params: {
      __vd_series_id: "16",
      __vd_purpose: "episode_cover",
    },
  },
  createdAt: new Date(0).toISOString(),
} as any;

describe("media task artifact history durability", () => {
  it("links a domain asset to the owner-scoped shared artifact row", async () => {
    const db = makeDb({
      id: 7,
      providerOriginalUrl: domainTask.resultUrl,
    });
    mocks.getDb.mockReturnValue(db);

    await linkMediaTaskArtifactToAsset({
      task: domainTask,
      tenantId: "tenant-1",
      userId: 7,
      mediaAssetId: 1559,
      storageKey: "vertical-drama/16/image/episode_cover/cover.png",
    });

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.set).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaAssetId: 1559,
        r2StorageKey: "vertical-drama/16/image/episode_cover/cover.png",
        r2Status: "ready",
        providerStatus: "available",
      })
    );
  });

  it("reconciles completed Vertical Drama tasks when history is opened", async () => {
    const durableTask = {
      ...domainTask,
      resultUrl:
        "/api/storage/files/vertical-drama/16/image/episode_cover/cover.png",
    };
    mocks.ensureVerticalDramaTaskResultDurable.mockResolvedValue({
      mediaAssetId: 1559,
      storageKey: "vertical-drama/16/image/episode_cover/cover.png",
      durableUrl: durableTask.resultUrl,
      task: durableTask,
    });

    const result = await durabilizeMediaTaskHistory({
      tasks: [domainTask],
      tenantId: "tenant-1",
      userId: 7,
    });

    expect(mocks.ensureVerticalDramaTaskResultDurable).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 7,
      task: domainTask,
    });
    expect(result[0].resultUrl).toBe(durableTask.resultUrl);
  });
});
