import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    update: vi.fn(),
    set: vi.fn(),
  },
  ensureVerticalDramaManagedMediaAsset: vi.fn(),
  ingestVerticalDramaMediaAsset: vi.fn(),
  reconcileVerticalDramaMediaAsset: vi.fn(),
  resolveRemotionOutputRef: vi.fn(),
}));

vi.mock("../../db", () => ({ db: mocks.db }));
vi.mock("../verticalDramaMediaAssetService", () => ({
  ensureVerticalDramaManagedMediaAsset:
    mocks.ensureVerticalDramaManagedMediaAsset,
  ingestVerticalDramaMediaAsset: mocks.ingestVerticalDramaMediaAsset,
  reconcileVerticalDramaMediaAsset: mocks.reconcileVerticalDramaMediaAsset,
  extractVerticalDramaManagedMediaKey: (value: string | null | undefined) =>
    value?.startsWith("/api/storage/files/")
      ? value.slice("/api/storage/files/".length)
      : null,
}));
vi.mock("../verticalDramaRemotionRender", () => ({
  VD_REMOTION_QUEUED_TTL_MS: 60 * 60 * 1000,
  resolveRemotionOutputRef: mocks.resolveRemotionOutputRef,
}));

import {
  reconcileEpisodePreview,
  resetEpisodePreviewStateOnCancel,
} from "../verticalDramaEpisodePreview";

describe("Vertical Drama episode preview durability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.select.mockReturnValue(mocks.db);
    mocks.db.from.mockReturnValue(mocks.db);
    mocks.db.where.mockReturnValue(mocks.db);
    mocks.db.limit.mockResolvedValue({});
    mocks.db.update.mockReturnValue(mocks.db);
    mocks.db.set.mockReturnValue(mocks.db);
    mocks.resolveRemotionOutputRef.mockResolvedValue(
      "/api/storage/files/worker-artifacts/tenant-1/preview-1.mp4",
    );
    mocks.ensureVerticalDramaManagedMediaAsset.mockResolvedValue({
      mediaAssetId: 501,
      storageKey: "worker-artifacts/tenant-1/preview-1.mp4",
      url: "/api/storage/files/worker-artifacts/tenant-1/preview-1.mp4",
      mimeType: "video/mp4",
    });
    mocks.reconcileVerticalDramaMediaAsset.mockResolvedValue({
      mediaAssetId: 501,
      storageKey: "worker-artifacts/tenant-1/preview-1.mp4",
      url: "/api/storage/files/worker-artifacts/tenant-1/preview-1.mp4",
      mimeType: "video/mp4",
      status: "ready",
    });
  });

  it("registers a completed Remotion output before persisting the preview", async () => {
    mocks.db.limit
      .mockResolvedValueOnce([
        {
        id: "preview-job-1",
        status: "completed",
        outputJson: {},
        },
      ])
      .mockResolvedValueOnce([
        { assemblyManifest: { episodePreviews: [] } },
      ]);

    const result = await reconcileEpisodePreview(
      { tenantId: "tenant-1", userId: 7, seriesId: 21, episodeId: 141 },
      {
        slotId: 1,
        selectedShotNumbers: [1, 2],
        status: "pending",
        pendingJobId: "preview-job-1",
      },
    );

    expect(result).toEqual({ reconciled: true, status: "completed" });
    expect(mocks.ensureVerticalDramaManagedMediaAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        userId: 7,
        sourceUrl:
          "/api/storage/files/worker-artifacts/tenant-1/preview-1.mp4",
        mediaType: "video",
      }),
    );
    expect(mocks.db.set).toHaveBeenCalledWith(
      expect.objectContaining({
        assemblyManifest: {
          episodePreviews: [
            expect.objectContaining({
              slotId: 1,
              status: "completed",
              mediaAssetId: "501",
              videoUrl:
                "/api/storage/files/worker-artifacts/tenant-1/preview-1.mp4",
              durabilityStatus: "ready",
            }),
          ],
        },
      }),
    );
  });

  it.each(["failed", "canceled", "expired"] as const)(
    "releases a preview when the worker job is %s",
    async status => {
      mocks.db.limit
        .mockResolvedValueOnce([{
          id: "preview-job-terminal",
          status,
          failureReason: status === "failed" ? "render_failed" : null,
        }])
        .mockResolvedValueOnce([
          { assemblyManifest: { episodePreviews: [] } },
        ]);

      await expect(reconcileEpisodePreview(
        { tenantId: "tenant-1", userId: 7, seriesId: 21, episodeId: 141 },
        {
          slotId: 1,
          selectedShotNumbers: [1, 2],
          status: "pending",
          pendingJobId: "preview-job-terminal",
        },
      )).resolves.toEqual({ reconciled: true, status: "failed" });

      expect(mocks.db.set).toHaveBeenCalledWith(
        expect.objectContaining({
          assemblyManifest: {
            episodePreviews: [
              expect.objectContaining({
                slotId: 1,
                status: "failed",
                pendingJobId: undefined,
                error: status === "failed"
                  ? "render_failed"
                  : "Remotion preview render failed",
              }),
            ],
          },
        }),
      );
    },
  );

  it("repairs a legacy completed preview on read and persists its asset identity", async () => {
    mocks.db.limit
      .mockResolvedValueOnce([
        {
          id: 501,
          storageKey: "worker-artifacts/tenant-1/preview-1.mp4",
          mimeType: "video/mp4",
          status: "pending",
          originalUrl: "/api/storage/files/worker-artifacts/tenant-1/preview-1.mp4",
        },
      ])
      .mockResolvedValueOnce([
        { assemblyManifest: { episodePreviews: [] } },
      ]);

    const result = await (
      await import("../verticalDramaEpisodePreview")
    ).reconcileCompletedEpisodePreviewMedia(
      { tenantId: "tenant-1", userId: 7, seriesId: 21, episodeId: 141 },
      {
        slotId: 1,
        selectedShotNumbers: [1, 2],
        status: "completed",
        mediaAssetId: "501",
        videoUrl: "/api/storage/files/worker-artifacts/tenant-1/preview-1.mp4",
      },
    );

    expect(result).toMatchObject({
      reconciled: true,
      state: {
        mediaAssetId: "501",
        durabilityStatus: "ready",
        videoUrl: "/api/storage/files/worker-artifacts/tenant-1/preview-1.mp4",
      },
    });
    expect(mocks.reconcileVerticalDramaMediaAsset).toHaveBeenCalledWith(
      expect.objectContaining({ mediaAssetId: 501, tenantId: "tenant-1", userId: 7 }),
    );
  });

  it("releases the matching pending slot when its Remotion job is canceled", async () => {
    const preview = {
      slotId: 2 as const,
      selectedShotNumbers: [3, 4] as [number, number],
      status: "pending" as const,
      pendingJobId: "preview-job-2",
    };
    mocks.db.limit
      .mockResolvedValueOnce([
        { assemblyManifest: { episodePreviews: [preview] } },
      ])
      .mockResolvedValueOnce([
        { assemblyManifest: { episodePreviews: [preview] } },
      ]);

    await expect(resetEpisodePreviewStateOnCancel({
      tenantId: "tenant-1",
      userId: 7,
      jobId: "preview-job-2",
      inputJson: {
        videoProjectId: "vd-episode-preview:21:141",
        projectRevision: 2,
      },
    })).resolves.toBe(true);

    expect(mocks.db.set).toHaveBeenCalledWith(
      expect.objectContaining({
        assemblyManifest: {
          episodePreviews: [
            expect.objectContaining({
              slotId: 2,
              status: "failed",
              pendingJobId: undefined,
              error: "ยกเลิกงาน preview แล้ว — กดสร้างชุดนี้ใหม่ได้",
            }),
          ],
        },
      }),
    );
  });

  it("does not clear a newer retry when an old preview job is canceled", async () => {
    mocks.db.limit.mockResolvedValueOnce([
      {
        assemblyManifest: {
          episodePreviews: [{
            slotId: 2,
            selectedShotNumbers: [3, 4],
            status: "pending",
            pendingJobId: "new-preview-job-2",
          }],
        },
      },
    ]);

    await expect(resetEpisodePreviewStateOnCancel({
      tenantId: "tenant-1",
      userId: 7,
      jobId: "old-preview-job-2",
      inputJson: {
        videoProjectId: "vd-episode-preview:21:141",
        projectRevision: 2,
      },
    })).resolves.toBe(false);

    expect(mocks.db.update).not.toHaveBeenCalled();
  });
});
