import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDb,
  mockRunAssemblyJob,
  mockDefaultFfmpegRunner,
  mockProbeDurationSeconds,
  mockPersistCompiledVideoState,
  mockRunProductionEpisodeGroupJob,
  mockRenderSubEpisodeWithOptions,
  mockRunTrailerJob,
} = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), update: vi.fn() },
  mockRunAssemblyJob: vi.fn(),
  mockDefaultFfmpegRunner: vi.fn(),
  mockProbeDurationSeconds: vi.fn(),
  mockPersistCompiledVideoState: vi.fn(),
  mockRunProductionEpisodeGroupJob: vi.fn(),
  mockRenderSubEpisodeWithOptions: vi.fn(),
  mockRunTrailerJob: vi.fn(),
}));

vi.mock("../../db", () => ({
  db: mockDb,
}));

vi.mock("../verticalDramaEpisodeVideoAssembly", () => ({
  runAssemblyJob: mockRunAssemblyJob,
  defaultFfmpegRunner: mockDefaultFfmpegRunner,
  probeDurationSeconds: mockProbeDurationSeconds,
  persistCompiledVideoState: mockPersistCompiledVideoState,
}));

vi.mock("../verticalDramaProductionEpisodeAssembly", () => ({
  runProductionEpisodeGroupJob: mockRunProductionEpisodeGroupJob,
  renderSubEpisodeWithOptions: mockRenderSubEpisodeWithOptions,
}));

vi.mock("../verticalDramaSeriesTrailerAssembly", () => ({
  runTrailerJob: mockRunTrailerJob,
}));

import {
  resetVerticalDramaFfmpegAssemblyStateOnCancel,
  runVerticalDramaFfmpegAssemblyJob,
} from "../verticalDramaFfmpegAssemblyRunner";
import type { VerticalDramaFfmpegAssemblyJobContract } from "../../../shared/workerRuntime";

function selectResolvedTo(row: Record<string, unknown> | undefined) {
  mockDb.select.mockReturnValue({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(row ? [row] : []),
  } as any);
}

function baseContract(
  overrides: Partial<VerticalDramaFfmpegAssemblyJobContract> = {},
): VerticalDramaFfmpegAssemblyJobContract {
  return {
    kind: "sub_episode",
    owner: { tenantId: "tenant-1", userId: "1", seriesId: "1", episodeId: "1" },
    renderFeed: {},
    contractVersion: 1,
    ...overrides,
  } as VerticalDramaFfmpegAssemblyJobContract;
}

describe("runVerticalDramaFfmpegAssemblyJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("sub_episode / season_sub_episode", () => {
    const feed = {
      owner: { tenantId: "tenant-1", userId: 1, seriesId: 1, episodeId: 1 },
      clips: [],
      internalBaseUrl: "http://localhost:3000",
      filename: "episode.mp4",
    };

    it("returns ok:true with the compiled videoUrl on success", async () => {
      mockRunAssemblyJob.mockResolvedValue(undefined);
      selectResolvedTo({
        assemblyManifest: {
          compiledVideo: { status: "completed", videoUrl: "https://cdn/x.mp4" },
        },
      });

      const outcome = await runVerticalDramaFfmpegAssemblyJob(
        baseContract({ kind: "sub_episode", renderFeed: feed }),
        "job-1",
      );

      expect(outcome).toEqual({ ok: true, videoUrl: "https://cdn/x.mp4" });
      expect(mockRunAssemblyJob).toHaveBeenCalledWith(
        expect.objectContaining({ ...feed, jobId: "job-1" }),
      );
    });

    it("also dispatches season_sub_episode through runAssemblyJob", async () => {
      mockRunAssemblyJob.mockResolvedValue(undefined);
      selectResolvedTo({
        assemblyManifest: {
          compiledVideo: { status: "completed", videoUrl: "https://cdn/season.mp4" },
        },
      });

      const outcome = await runVerticalDramaFfmpegAssemblyJob(
        baseContract({ kind: "season_sub_episode", renderFeed: feed }),
        "job-2",
      );

      expect(outcome).toEqual({ ok: true, videoUrl: "https://cdn/season.mp4" });
    });

    it("returns ok:false with the persisted error when compiledVideo failed", async () => {
      mockRunAssemblyJob.mockResolvedValue(undefined);
      selectResolvedTo({
        assemblyManifest: {
          compiledVideo: { status: "failed", error: "ffmpeg exploded" },
        },
      });

      const outcome = await runVerticalDramaFfmpegAssemblyJob(
        baseContract({ kind: "sub_episode", renderFeed: feed }),
        "job-3",
      );

      expect(outcome).toEqual({ ok: false, error: "ffmpeg exploded" });
    });

    it("returns ok:false when renderFeed has no owner", async () => {
      const outcome = await runVerticalDramaFfmpegAssemblyJob(
        baseContract({ kind: "sub_episode", renderFeed: {} }),
        "job-4",
      );

      expect(outcome.ok).toBe(false);
      expect(outcome.error).toContain("missing_owner");
      expect(mockRunAssemblyJob).not.toHaveBeenCalled();
    });

    it("never throws — catches an unexpected error from runAssemblyJob", async () => {
      mockRunAssemblyJob.mockRejectedValue(new Error("unexpected crash"));

      const outcome = await runVerticalDramaFfmpegAssemblyJob(
        baseContract({ kind: "sub_episode", renderFeed: feed }),
        "job-5",
      );

      expect(outcome).toEqual({ ok: false, error: "unexpected crash" });
    });
  });

  describe("production_episode_group", () => {
    const feed = {
      owner: { tenantId: "tenant-1", userId: 1, seriesId: 1 },
      groupIndex: 0,
      members: [],
      internalBaseUrl: "http://localhost:3000",
      filename: "group.mp4",
      voiceChainEnabled: false,
    };

    it("returns ok:true with the group's videoUrl on success", async () => {
      mockRunProductionEpisodeGroupJob.mockResolvedValue(undefined);
      selectResolvedTo({
        productionEpisodesManifest: {
          episodes: [{ index: 0, status: "completed", videoUrl: "https://cdn/group0.mp4" }],
        },
      });

      const outcome = await runVerticalDramaFfmpegAssemblyJob(
        baseContract({ kind: "production_episode_group", renderFeed: feed }),
        "job-6",
      );

      expect(outcome).toEqual({ ok: true, videoUrl: "https://cdn/group0.mp4" });
      expect(mockRunProductionEpisodeGroupJob).toHaveBeenCalledWith(
        expect.objectContaining({
          ...feed,
          ffmpegRunner: mockDefaultFfmpegRunner,
          probeDurationSecondsFn: mockProbeDurationSeconds,
          renderSubEpisodeWithOptionsFn: mockRenderSubEpisodeWithOptions,
        }),
      );
    });

    it("returns ok:false with the group's persisted error on failure", async () => {
      mockRunProductionEpisodeGroupJob.mockResolvedValue(undefined);
      selectResolvedTo({
        productionEpisodesManifest: {
          episodes: [{ index: 0, status: "failed", error: "group concat failed" }],
        },
      });

      const outcome = await runVerticalDramaFfmpegAssemblyJob(
        baseContract({ kind: "production_episode_group", renderFeed: feed }),
        "job-7",
      );

      expect(outcome).toEqual({ ok: false, error: "group concat failed" });
    });

    it("returns ok:false when renderFeed is missing groupIndex", async () => {
      const { groupIndex, ...rest } = feed;
      const outcome = await runVerticalDramaFfmpegAssemblyJob(
        baseContract({ kind: "production_episode_group", renderFeed: rest }),
        "job-8",
      );

      expect(outcome.ok).toBe(false);
      expect(outcome.error).toContain("missing_group_fields");
      expect(mockRunProductionEpisodeGroupJob).not.toHaveBeenCalled();
    });
  });

  describe("trailer", () => {
    const feed = {
      owner: { tenantId: "tenant-1", userId: 1, seriesId: 1 },
      audioUrls: ["https://cdn/a.mp3"],
      imageUrls: [],
      videoClipUrls: [],
      internalBaseUrl: "http://localhost:3000",
    };

    it("returns ok:true with the trailer's videoUrl on success", async () => {
      mockRunTrailerJob.mockResolvedValue(undefined);
      selectResolvedTo({
        trailer: { status: "completed", videoUrl: "https://cdn/trailer.mp4" },
      });

      const outcome = await runVerticalDramaFfmpegAssemblyJob(
        baseContract({ kind: "trailer", renderFeed: feed }),
        "job-9",
      );

      expect(outcome).toEqual({ ok: true, videoUrl: "https://cdn/trailer.mp4" });
      expect(mockRunTrailerJob).toHaveBeenCalledWith(
        expect.objectContaining({ ...feed, jobId: "job-9", ffmpegRunner: mockDefaultFfmpegRunner }),
      );
    });

    it("returns ok:false with the trailer's persisted error on failure", async () => {
      mockRunTrailerJob.mockResolvedValue(undefined);
      selectResolvedTo({
        trailer: { status: "failed", error: "trailer mux failed" },
      });

      const outcome = await runVerticalDramaFfmpegAssemblyJob(
        baseContract({ kind: "trailer", renderFeed: feed }),
        "job-10",
      );

      expect(outcome).toEqual({ ok: false, error: "trailer mux failed" });
    });

    it("returns ok:false with a fallback error when no row is found", async () => {
      mockRunTrailerJob.mockResolvedValue(undefined);
      selectResolvedTo(undefined);

      const outcome = await runVerticalDramaFfmpegAssemblyJob(
        baseContract({ kind: "trailer", renderFeed: feed }),
        "job-11",
      );

      expect(outcome.ok).toBe(false);
      expect(outcome.error).toContain("trailer_not_completed");
    });
  });

  describe("resetVerticalDramaFfmpegAssemblyStateOnCancel", () => {
    function mockUpdateCapturing() {
      const setSpy = vi.fn().mockReturnThis();
      const whereSpy = vi.fn().mockResolvedValue(undefined);
      mockDb.update.mockReturnValue({ set: setSpy, where: whereSpy } as any);
      return { setSpy, whereSpy };
    }

    it("sub_episode: resets compiledVideo to failed/canceled via persistCompiledVideoState", async () => {
      mockPersistCompiledVideoState.mockResolvedValue(undefined);
      const owner = { tenantId: "tenant-1", userId: 1, seriesId: 1, episodeId: 1 };

      await resetVerticalDramaFfmpegAssemblyStateOnCancel(
        baseContract({ kind: "sub_episode", renderFeed: { owner } }),
      );

      expect(mockPersistCompiledVideoState).toHaveBeenCalledWith(owner, {
        status: "failed",
        error: "canceled",
        pendingJobId: undefined,
      });
    });

    it("season_sub_episode: also resets via persistCompiledVideoState", async () => {
      mockPersistCompiledVideoState.mockResolvedValue(undefined);
      const owner = { tenantId: "tenant-1", userId: 1, seriesId: 1, episodeId: 2 };

      await resetVerticalDramaFfmpegAssemblyStateOnCancel(
        baseContract({ kind: "season_sub_episode", renderFeed: { owner } }),
      );

      expect(mockPersistCompiledVideoState).toHaveBeenCalledWith(
        owner,
        expect.objectContaining({ status: "failed", error: "canceled" }),
      );
    });

    it("sub_episode: no-ops when renderFeed has no owner", async () => {
      await resetVerticalDramaFfmpegAssemblyStateOnCancel(
        baseContract({ kind: "sub_episode", renderFeed: {} }),
      );

      expect(mockPersistCompiledVideoState).not.toHaveBeenCalled();
    });

    it("production_episode_group: patches only the matching group entry to failed/canceled", async () => {
      const owner = { tenantId: "tenant-1", userId: 1, seriesId: 1 };
      selectResolvedTo({
        productionEpisodesManifest: {
          groupSize: 5,
          episodes: [
            { index: 0, status: "pending" },
            { index: 1, status: "completed", videoUrl: "https://cdn/g1.mp4" },
          ],
        },
      });
      const { setSpy } = mockUpdateCapturing();

      await resetVerticalDramaFfmpegAssemblyStateOnCancel(
        baseContract({
          kind: "production_episode_group",
          display: { groupIndex: 0 },
          renderFeed: { owner, groupIndex: 0 },
        }),
      );

      expect(setSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          productionEpisodesManifest: expect.objectContaining({
            episodes: [
              expect.objectContaining({ index: 0, status: "failed", error: "canceled" }),
              expect.objectContaining({ index: 1, status: "completed" }),
            ],
          }),
        }),
      );
    });

    it("production_episode_group: skips when display.groupIndex is absent", async () => {
      const owner = { tenantId: "tenant-1", userId: 1, seriesId: 1 };

      await resetVerticalDramaFfmpegAssemblyStateOnCancel(
        baseContract({
          kind: "production_episode_group",
          renderFeed: { owner, groupIndex: 0 },
        }),
      );

      expect(mockDb.select).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it("production_episode_group: skips when no series row is found", async () => {
      const owner = { tenantId: "tenant-1", userId: 1, seriesId: 1 };
      selectResolvedTo(undefined);

      await resetVerticalDramaFfmpegAssemblyStateOnCancel(
        baseContract({
          kind: "production_episode_group",
          display: { groupIndex: 0 },
          renderFeed: { owner, groupIndex: 0 },
        }),
      );

      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it("trailer: patches series.trailer to failed/canceled, preserving other fields", async () => {
      const owner = { tenantId: "tenant-1", userId: 1, seriesId: 1 };
      selectResolvedTo({
        trailer: { status: "processing", jobId: "job-trailer-1" },
      });
      const { setSpy } = mockUpdateCapturing();

      await resetVerticalDramaFfmpegAssemblyStateOnCancel(
        baseContract({ kind: "trailer", renderFeed: { owner } }),
      );

      expect(setSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          trailer: expect.objectContaining({
            status: "failed",
            error: "canceled",
            jobId: "job-trailer-1",
          }),
        }),
      );
    });

    it("trailer: skips when no series row is found", async () => {
      const owner = { tenantId: "tenant-1", userId: 1, seriesId: 1 };
      selectResolvedTo(undefined);

      await resetVerticalDramaFfmpegAssemblyStateOnCancel(
        baseContract({ kind: "trailer", renderFeed: { owner } }),
      );

      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it("never throws — swallows an unexpected error from the reset itself", async () => {
      mockPersistCompiledVideoState.mockRejectedValueOnce(new Error("db exploded"));
      const owner = { tenantId: "tenant-1", userId: 1, seriesId: 1, episodeId: 1 };

      await expect(
        resetVerticalDramaFfmpegAssemblyStateOnCancel(
          baseContract({ kind: "sub_episode", renderFeed: { owner } }),
        ),
      ).resolves.toBeUndefined();
    });
  });
});
