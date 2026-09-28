import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertR2StorageActive: vi.fn(),
  downloadMediaToTempFile: vi.fn(),
  storagePutFromPath: vi.fn(),
}));

vi.mock("../verticalDramaMediaAssetService", () => ({
  downloadMediaToTempFile: mocks.downloadMediaToTempFile,
}));
vi.mock("../../storage", () => ({
  assertR2StorageActive: mocks.assertR2StorageActive,
  storagePutFromPath: mocks.storagePutFromPath,
}));

import { ensureMarketplaceAutoReviewTaskResultDurable } from "../marketplaceAutoReviewMediaAssetService";

function task(over: Record<string, unknown> = {}) {
  return {
    id: "media-task-1",
    status: "completed",
    mediaType: "video",
    resultUrl: "https://provider.example/result.mp4",
    parameters: {
      extra_params: {
        __auto_review_run_id: "mar-1",
        __unit_id: "shot-1",
      },
    },
    resultData: {},
    ...over,
  } as any;
}

describe("marketplace Auto Review media durability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertR2StorageActive.mockResolvedValue(undefined);
    mocks.downloadMediaToTempFile.mockResolvedValue({
      tempDir: "/tmp/marketplace-auto-review-test",
      tempPath: "/tmp/marketplace-auto-review-test/source.bin",
      mimeType: "video/mp4",
    });
    mocks.storagePutFromPath.mockResolvedValue({
      key: "marketplace-auto-review/personal/mar-1/media/video/shot-1-hash.mp4",
      url: "/api/storage/files/marketplace-auto-review/personal/mar-1/media/video/shot-1-hash.mp4",
    });
  });

  it("keeps managed R2 URLs without downloading them again", async () => {
    const current = task({
      resultUrl: "/api/storage/files/marketplace-auto-review/mar-1.mp4",
    });

    const result = await ensureMarketplaceAutoReviewTaskResultDurable({
      tenantId: "tenant-1",
      userId: 7,
      task: current,
    });

    expect(result?.durableUrl).toBe(current.resultUrl);
    expect(mocks.assertR2StorageActive).not.toHaveBeenCalled();
    expect(mocks.downloadMediaToTempFile).not.toHaveBeenCalled();
  });

  it("copies completed provider videos to R2 before returning the task", async () => {
    const result = await ensureMarketplaceAutoReviewTaskResultDurable({
      tenantId: "tenant-1",
      userId: 7,
      task: task(),
    });

    expect(result?.task.resultUrl).toMatch(/^\/api\/storage\/files\//);
    expect(mocks.assertR2StorageActive).toHaveBeenCalledOnce();
    expect(mocks.downloadMediaToTempFile).toHaveBeenCalledWith(
      "https://provider.example/result.mp4",
      "video",
      "video/mp4"
    );
    expect(mocks.storagePutFromPath).toHaveBeenCalledOnce();
  });

  it("does not touch storage while a provider task is still pending", async () => {
    const result = await ensureMarketplaceAutoReviewTaskResultDurable({
      tenantId: "tenant-1",
      userId: 7,
      task: task({ status: "processing" }),
    });

    expect(result).toBeNull();
    expect(mocks.assertR2StorageActive).not.toHaveBeenCalled();
  });
});
