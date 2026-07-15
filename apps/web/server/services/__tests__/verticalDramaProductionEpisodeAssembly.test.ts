/**
 * Vertical Drama Series — Production Episodes assembly tests (Phase D′-1,
 * `planning/vertical-drama-production-episodes/plan.md`).
 *
 * Covers: chunking sub-episodes into groups, the missing-compiled-video
 * precondition logic, the narrow defensive `assemblyManifest.compiledVideo`
 * read, and the async orchestrator end to end via a mocked `db` + mocked
 * `storagePutFromPath` + a stubbed `fetch` + an injected fake ffmpeg
 * runner/duration prober (mirrors `verticalDramaEpisodeVideoAssembly.test.ts`'s
 * own mocking convention — no real ffmpeg/ffprobe process is spawned).
 *
 * Phase D′-2 (Render-options LEVEL, `renderOptions` on
 * `assembleProductionEpisodesForSeries`) additionally covers the
 * per-Sub-Episode render step via an INJECTED fake
 * `renderSubEpisodeWithOptionsFn` (mirrors `ffmpegRunner`'s own DI
 * convention) — the REAL `renderSubEpisodeWithOptions` (which drives the
 * real `runAssemblyJob`) is intentionally never exercised here, since this
 * file's minimal generic `db` mock below only models the TWO query shapes
 * D′-1 itself needs (`verticalDramaEpisodes` sub-episode rows,
 * `verticalDramaSeries.productionEpisodesManifest`/`bible`) — not the
 * `verticalDramaEpisodes.assemblyManifest` re-read
 * `renderSubEpisodeWithOptions` itself would need. Direct unit coverage of
 * `renderSubEpisodeWithOptions`'s own render-feed construction is already
 * provided by `resolveEpisodeDialogueAudioAndSubtitlesRunInputs`'s own tests
 * (`verticalDramaEpisodeVideoAssembly.test.ts`), which it reuses verbatim.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// Vertical Drama Render Queue plan §4.2 Wave 3 — `assembleProductionEpisodesForSeries`
// now ENQUEUES a `vertical_drama_ffmpeg_assembly` worker job per group
// instead of running `runProductionEpisodeGroupJob` in-process, so its own
// tests below mock the enqueue function rather than waiting on a real
// ffmpeg chain. `runProductionEpisodeGroupJob` itself is UNCHANGED by that
// wave — its own ffmpeg-orchestration behavior (render-options/bgm/credits/
// overlays passes) is covered directly further down this file via direct
// calls to that (still-exported) function.
const { mockQueueVerticalDramaFfmpegAssemblyJob } = vi.hoisted(() => ({
  mockQueueVerticalDramaFfmpegAssemblyJob: vi.fn(),
}));
vi.mock("../workerSchedulerService", () => ({
  queueVerticalDramaFfmpegAssemblyJob: mockQueueVerticalDramaFfmpegAssemblyJob,
}));

const dbState = {
  episodes: [] as Array<{
    episodeNumber: number;
    assemblyManifest: unknown;
    id?: number;
    motionPromptPack?: unknown;
    dialogueAudioPlan?: unknown;
  }>,
  productionEpisodesManifest: null as unknown,
  /** Series `bible` — only ever read by `loadProductionSeriesAudienceAgeRating`
   *  when a test's `renderOptions.showAgeBadge` is `true`. */
  bible: null as unknown,
};

vi.mock("../../db", () => {
  const api: any = {
    select: vi.fn(() => api),
    from: vi.fn(() => api),
    where: vi.fn(() => api),
    // Only the Sub-Episodes query (`verticalDramaEpisodes`) ends in
    // `.orderBy(...)` in this service — safe to resolve unconditionally.
    orderBy: vi.fn(async () => dbState.episodes),
    // The series `productionEpisodesManifest`/`bible` loads both end in
    // `.limit(1)` — a single fixed superset shape serves both query
    // intents (each only ever destructures the ONE key it asked for).
    limit: vi.fn(async () => [
      {
        productionEpisodesManifest: dbState.productionEpisodesManifest,
        bible: dbState.bible,
      },
    ]),
    update: vi.fn(() => api),
    set: vi.fn((patch: any) => {
      if (patch.productionEpisodesManifest !== undefined) {
        dbState.productionEpisodesManifest = patch.productionEpisodesManifest;
      }
      return api;
    }),
  };
  return { db: api };
});

vi.mock("../../storage", () => ({
  storagePutFromPath: vi.fn(async (key: string) => ({
    key,
    url: `/api/storage/files/${key}`,
  })),
}));

// Render-options LEVEL — `resolveProductionVoiceChainFlag` reads this
// SERVICE directly (never a raw `db`/`getDb` call — see that function's own
// doc comment), so it is mocked directly here too, same convention
// `chatMemoryFlagIntegration.test.ts` already establishes for this exact
// function.
vi.mock("../tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: vi.fn(async () => ({ verticalDramaSeriesVoiceChain: false })),
}));

// Avoid a real network fetch in `downloadClipToFile` during the orchestrator tests.
vi.stubGlobal(
  "fetch",
  vi.fn(async () => ({
    ok: true,
    body: {},
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  }))
);

import {
  assembleProductionEpisodesForSeries,
  chunkSubEpisodesIntoGroups,
  extractSubEpisodeCompiledVideoUrl,
  findSubEpisodesMissingCompiledVideo,
  productionEpisodeFilename,
  resolveSubEpisodesForProductionAssembly,
  // Vertical Drama Render Queue plan §4.2 Wave 3 — the ffmpeg-orchestration
  // behavior tests below (render-options/bgm/credits/overlays) now call this
  // directly (it is unchanged by that wave), since
  // `assembleProductionEpisodesForSeries` no longer invokes it in-process.
  runProductionEpisodeGroupJob,
  type ProductionEpisodeBgmOptions,
  type ProductionEpisodeCreditsOptions,
  type ProductionEpisodeRenderOptions,
  type ProductionEpisodeSourceSubEpisode,
  type ProductionEpisodesManifestWithBgm,
  type RenderSubEpisodeWithOptionsArgs,
  type RenderSubEpisodeWithOptionsResult,
} from "../verticalDramaProductionEpisodeAssembly";
// Phase C-2 — `ProductionEpisodeOverlayItem` is the pure builder's own item
// type (`verticalDramaFinalRenderGraph.ts`), reused verbatim by the SERVICE's
// `overlays` field rather than re-declared — imported directly from its own
// source module here, same convention `verticalDramaProductionEpisodeAssembly.ts`
// itself already uses for `CaptionPresetId`/`SubtitleFontSizeId`.
import type { ProductionEpisodeOverlayItem } from "../verticalDramaFinalRenderGraph";
import { storagePutFromPath } from "../../storage";
import { getTenantFeatureFlags } from "../tenantFeatureFlagService";
import { FEATURE_FLAG_DEFAULTS } from "@shared/featureFlags";

beforeEach(() => {
  dbState.episodes = [];
  dbState.productionEpisodesManifest = null;
  dbState.bible = null;
  vi.clearAllMocks();
  vi.mocked(getTenantFeatureFlags).mockResolvedValue({ ...FEATURE_FLAG_DEFAULTS });
  // Default enqueue stub — a fresh fake job id per call, so callers that
  // assert on `job.id` (e.g. `pendingJobId`) never collide across groups.
  let queueCallCount = 0;
  mockQueueVerticalDramaFfmpegAssemblyJob.mockImplementation(async () => {
    queueCallCount += 1;
    return { created: true, job: { id: `queued-job-${queueCallCount}` } };
  });
});

function completedManifest(): ProductionEpisodesManifestWithBgm | null {
  return dbState.productionEpisodesManifest as ProductionEpisodesManifestWithBgm | null;
}

/** Read one group's CURRENT persisted state by index — used by the
 *  `runProductionEpisodeGroupJob` direct-call tests below (that function is
 *  awaited directly now, no fire-and-forget chain to poll for). */
function groupState(groupIndex: number) {
  return completedManifest()?.episodes.find(e => e.index === groupIndex);
}

/** Seed a single pending group entry at `groupIndex` — mirrors the shape
 *  `assembleProductionEpisodesForSeries` itself persists before enqueueing,
 *  for tests that call `runProductionEpisodeGroupJob` directly (bypassing
 *  the orchestrator entirely). */
function seedGroupManifest(
  groupIndex: number,
  subEpisodeNumbers: number[],
  groupSize: 5 | 10 = 5
): void {
  dbState.productionEpisodesManifest = {
    groupSize,
    episodes: [{ index: groupIndex, groupSize, subEpisodeNumbers, status: "pending" }],
  };
}

/** Build `runProductionEpisodeGroupJob`'s `members` arg directly (bypassing
 *  the `dbState.episodes` query `assembleProductionEpisodesForSeries` itself
 *  uses) — placeholder `motionPromptPack`/`dialogueAudioPlan` values are
 *  only ever read by the INJECTED fake `renderSubEpisodeWithOptionsFn`,
 *  never interpreted directly by this helper's callers below. */
function membersFrom(episodeNumbers: number[]) {
  return episodeNumbers.map(n => ({
    episodeNumber: n,
    videoUrl: `/api/storage/files/sub-ep-${n}.mp4`,
    episodeId: n,
    motionPromptPack: { clips: [{ clipNumber: 1 }] },
    dialogueAudioPlan: null as unknown,
  }));
}

/* -------------------------------------------------------------------------- */

describe("chunkSubEpisodesIntoGroups", () => {
  const bySubEp = (episodeNumbers: number[]): Array<{ episodeNumber: number }> =>
    episodeNumbers.map(episodeNumber => ({ episodeNumber }));

  it("splits an exact multiple of 5 into equal groups", () => {
    const groups = chunkSubEpisodesIntoGroups(bySubEp([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 5);
    expect(groups.map(g => g.map(e => e.episodeNumber))).toEqual([
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9, 10],
    ]);
  });

  it("splits an exact multiple of 10 into equal groups", () => {
    const episodeNumbers = Array.from({ length: 20 }, (_, i) => i + 1);
    const groups = chunkSubEpisodesIntoGroups(bySubEp(episodeNumbers), 10);
    expect(groups).toHaveLength(2);
    expect(groups[0].map(e => e.episodeNumber)).toEqual(episodeNumbers.slice(0, 10));
    expect(groups[1].map(e => e.episodeNumber)).toEqual(episodeNumbers.slice(10, 20));
  });

  it("keeps a short last group when the count doesn't divide evenly (groupSize 5)", () => {
    const groups = chunkSubEpisodesIntoGroups(
      bySubEp([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
      5
    );
    expect(groups.map(g => g.map(e => e.episodeNumber))).toEqual([
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9, 10],
      [11, 12],
    ]);
  });

  it("keeps a short last group when the count doesn't divide evenly (groupSize 10)", () => {
    const episodeNumbers = Array.from({ length: 23 }, (_, i) => i + 1);
    const groups = chunkSubEpisodesIntoGroups(bySubEp(episodeNumbers), 10);
    expect(groups.map(g => g.length)).toEqual([10, 10, 3]);
    expect(groups[2].map(e => e.episodeNumber)).toEqual([21, 22, 23]);
  });

  it("returns exactly one (short) group for a single sub-episode", () => {
    const groups = chunkSubEpisodesIntoGroups(bySubEp([1]), 5);
    expect(groups).toEqual([[{ episodeNumber: 1 }]]);
  });

  it("returns no groups for an empty list", () => {
    expect(chunkSubEpisodesIntoGroups([], 5)).toEqual([]);
    expect(chunkSubEpisodesIntoGroups([], 10)).toEqual([]);
  });

  it("orders sub-episodes by episodeNumber before chunking, regardless of input order", () => {
    const groups = chunkSubEpisodesIntoGroups(bySubEp([3, 1, 5, 2, 4]), 5);
    expect(groups).toEqual([[1, 2, 3, 4, 5].map(episodeNumber => ({ episodeNumber }))]);
  });
});

describe("findSubEpisodesMissingCompiledVideo", () => {
  it("returns empty when every sub-episode has a video", () => {
    const subEpisodes: ProductionEpisodeSourceSubEpisode[] = [
      { episodeNumber: 1, videoUrl: "/api/storage/files/a.mp4" },
      { episodeNumber: 2, videoUrl: "/api/storage/files/b.mp4" },
    ];
    expect(findSubEpisodesMissingCompiledVideo(subEpisodes)).toEqual([]);
  });

  it("returns missing episodeNumbers sorted ascending, regardless of input order", () => {
    const subEpisodes: ProductionEpisodeSourceSubEpisode[] = [
      { episodeNumber: 5, videoUrl: undefined },
      { episodeNumber: 1, videoUrl: "/api/storage/files/a.mp4" },
      { episodeNumber: 3, videoUrl: null },
      { episodeNumber: 2, videoUrl: "/api/storage/files/b.mp4" },
    ];
    expect(findSubEpisodesMissingCompiledVideo(subEpisodes)).toEqual([3, 5]);
  });

  it("treats an empty/whitespace videoUrl as missing", () => {
    const subEpisodes: ProductionEpisodeSourceSubEpisode[] = [
      { episodeNumber: 1, videoUrl: "" },
      { episodeNumber: 2, videoUrl: "   " },
    ];
    expect(findSubEpisodesMissingCompiledVideo(subEpisodes)).toEqual([1, 2]);
  });
});

describe("resolveSubEpisodesForProductionAssembly", () => {
  it("returns every sub-episode, ordered, when none are missing", () => {
    const subEpisodes: ProductionEpisodeSourceSubEpisode[] = [
      { episodeNumber: 2, videoUrl: "/api/storage/files/b.mp4" },
      { episodeNumber: 1, videoUrl: "/api/storage/files/a.mp4" },
    ];
    const { usable, missing } = resolveSubEpisodesForProductionAssembly(subEpisodes);
    expect(usable.map(e => e.episodeNumber)).toEqual([1, 2]);
    expect(missing).toEqual([]);
  });

  it("throws listing missing sub-episode numbers when allowPartial is not set", () => {
    const subEpisodes: ProductionEpisodeSourceSubEpisode[] = [
      { episodeNumber: 1, videoUrl: "/api/storage/files/a.mp4" },
      { episodeNumber: 2, videoUrl: undefined },
      { episodeNumber: 3, videoUrl: undefined },
    ];
    expect(() => resolveSubEpisodesForProductionAssembly(subEpisodes)).toThrowError(
      /vertical_drama_production_missing_subepisodes.*2, 3/
    );
  });

  it("returns only the usable sub-episodes when allowPartial is true, reporting missing separately", () => {
    const subEpisodes: ProductionEpisodeSourceSubEpisode[] = [
      { episodeNumber: 1, videoUrl: "/api/storage/files/a.mp4" },
      { episodeNumber: 2, videoUrl: undefined },
      { episodeNumber: 3, videoUrl: "/api/storage/files/c.mp4" },
    ];
    const { usable, missing } = resolveSubEpisodesForProductionAssembly(subEpisodes, {
      allowPartial: true,
    });
    expect(usable.map(e => e.episodeNumber)).toEqual([1, 3]);
    expect(missing).toEqual([2]);
  });

  it("throws vertical_drama_production_no_compiled_subepisodes when nothing is usable, even with allowPartial", () => {
    const subEpisodes: ProductionEpisodeSourceSubEpisode[] = [
      { episodeNumber: 1, videoUrl: undefined },
      { episodeNumber: 2, videoUrl: undefined },
    ];
    expect(() =>
      resolveSubEpisodesForProductionAssembly(subEpisodes, { allowPartial: true })
    ).toThrowError(/vertical_drama_production_no_compiled_subepisodes/);
  });
});

describe("extractSubEpisodeCompiledVideoUrl", () => {
  it("returns null for a null/non-object manifest", () => {
    expect(extractSubEpisodeCompiledVideoUrl(null)).toBeNull();
    expect(extractSubEpisodeCompiledVideoUrl(undefined)).toBeNull();
    expect(extractSubEpisodeCompiledVideoUrl("not-an-object")).toBeNull();
  });

  it("returns null when compiledVideo is missing or not completed", () => {
    expect(extractSubEpisodeCompiledVideoUrl({})).toBeNull();
    expect(
      extractSubEpisodeCompiledVideoUrl({
        compiledVideo: { status: "pending", videoUrl: "/api/storage/files/a.mp4" },
      })
    ).toBeNull();
    expect(
      extractSubEpisodeCompiledVideoUrl({
        compiledVideo: { status: "failed", videoUrl: "/api/storage/files/a.mp4" },
      })
    ).toBeNull();
  });

  it("returns null when completed but videoUrl is empty", () => {
    expect(
      extractSubEpisodeCompiledVideoUrl({ compiledVideo: { status: "completed", videoUrl: "" } })
    ).toBeNull();
  });

  it("returns the videoUrl when status is completed and videoUrl is non-empty", () => {
    expect(
      extractSubEpisodeCompiledVideoUrl({
        compiledVideo: { status: "completed", videoUrl: "/api/storage/files/a.mp4" },
      })
    ).toBe("/api/storage/files/a.mp4");
  });
});

describe("productionEpisodeFilename", () => {
  it("produces a slugged, 1-based filename", () => {
    expect(
      productionEpisodeFilename({ seriesId: 42, groupIndex: 0, seriesTitle: "My Drama!" })
    ).toBe("series-My-Drama-production-ep-1.mp4");
    expect(productionEpisodeFilename({ seriesId: 42, groupIndex: 2 })).toBe(
      "series-series-42-production-ep-3.mp4"
    );
  });
});

describe("assembleProductionEpisodesForSeries — enqueue (mocked db + workerSchedulerService)", () => {
  const owner = { tenantId: "t1", userId: 1, seriesId: 7 };

  function seedCompiledEpisodes(episodeNumbers: number[]) {
    dbState.episodes = episodeNumbers.map(n => ({
      episodeNumber: n,
      assemblyManifest: {
        compiledVideo: { status: "completed", videoUrl: `/api/storage/files/sub-ep-${n}.mp4` },
      },
    }));
  }

  it("throws when the series has no sub-episodes at all", async () => {
    dbState.episodes = [];
    await expect(
      assembleProductionEpisodesForSeries({
        ...owner,
        groupSize: 5,
        internalBaseUrl: "http://localhost:3000",
      })
    ).rejects.toThrowError(/vertical_drama_production_no_subepisodes/);
    expect(mockQueueVerticalDramaFfmpegAssemblyJob).not.toHaveBeenCalled();
  });

  it("throws when a sub-episode is missing a compiled video and allowPartial is not set", async () => {
    seedCompiledEpisodes([1, 2]);
    dbState.episodes.push({ episodeNumber: 3, assemblyManifest: null });

    await expect(
      assembleProductionEpisodesForSeries({
        ...owner,
        groupSize: 5,
        internalBaseUrl: "http://localhost:3000",
      })
    ).rejects.toThrowError(/vertical_drama_production_missing_subepisodes.*\b3\b/);

    // No enqueue and no manifest persisted — the precondition check runs
    // before any group is planned or written.
    expect(mockQueueVerticalDramaFfmpegAssemblyJob).not.toHaveBeenCalled();
    expect(dbState.productionEpisodesManifest).toBeNull();
  });

  it("chunks + persists a pending manifest synchronously, then enqueues ONE vertical_drama_ffmpeg_assembly job per NEW group", async () => {
    seedCompiledEpisodes([1, 2, 3, 4, 5, 6, 7]);

    const result = await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      seriesTitle: "Test Series",
    });

    expect(result.groupsCreated).toBe(2);
    expect(result.groupsSkipped).toBe(0);
    expect(result.manifest.groupSize).toBe(5);
    expect(result.manifest.episodes.map(e => e.subEpisodeNumbers)).toEqual([
      [1, 2, 3, 4, 5],
      [6, 7],
    ]);
    // Persisted synchronously as "pending" before this function returned —
    // and STAYS "pending" here: the executor (a separate process, exercised
    // by `verticalDramaFfmpegAssemblyRunner.test.ts`/`inlineRenderWorker.test.ts`)
    // is what later flips a group to completed/failed, not this function.
    expect(result.manifest.episodes.every(e => e.status === "pending")).toBe(true);
    expect(dbState.productionEpisodesManifest).toEqual(result.manifest);

    expect(mockQueueVerticalDramaFfmpegAssemblyJob).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = mockQueueVerticalDramaFfmpegAssemblyJob.mock.calls.map(
      c => c[0] as any
    );
    expect(firstCall).toMatchObject({
      tenantId: owner.tenantId,
      requestedByUserId: owner.userId,
      kind: "production_episode_group",
      owner: {
        tenantId: owner.tenantId,
        userId: String(owner.userId),
        seriesId: String(owner.seriesId),
      },
    });
    expect(firstCall.renderFeed).toMatchObject({
      owner: { tenantId: owner.tenantId, userId: owner.userId, seriesId: owner.seriesId },
      groupIndex: 0,
      internalBaseUrl: "http://localhost:3000",
      seriesTitle: "Test Series",
      voiceChainEnabled: false,
    });
    expect(firstCall.renderFeed.members.map((m: any) => m.episodeNumber)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(secondCall.renderFeed.groupIndex).toBe(1);
    expect(secondCall.renderFeed.members.map((m: any) => m.episodeNumber)).toEqual([6, 7]);
    // Enqueue-only — no direct ffmpeg spawn from this function anymore.
  });

  it("resolves the voice-chain tenant flag and lazily loads the audience age rating into the enqueued renderFeed only when showAgeBadge is requested", async () => {
    seedCompiledEpisodes([1, 2, 3]);
    dbState.bible = { audienceAgeRating: "13plus" };
    vi.mocked(getTenantFeatureFlags).mockResolvedValue({
      ...FEATURE_FLAG_DEFAULTS,
      verticalDramaSeriesVoiceChain: true,
    });

    await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      renderOptions: { includeDialogueAudio: true, showAgeBadge: true },
    });

    expect(mockQueueVerticalDramaFfmpegAssemblyJob).toHaveBeenCalledTimes(1);
    const [call] = mockQueueVerticalDramaFfmpegAssemblyJob.mock.calls.map(c => c[0] as any);
    expect(call.renderFeed.voiceChainEnabled).toBe(true);
    expect(call.renderFeed.audienceAgeRating).toBe("13plus");
  });

  it("skips re-running an already-completed group with unchanged membership on a second call", async () => {
    seedCompiledEpisodes([1, 2, 3, 4, 5, 6]);

    const first = await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
    });
    expect(first.groupsCreated).toBe(2);
    expect(mockQueueVerticalDramaFfmpegAssemblyJob).toHaveBeenCalledTimes(2);

    // Simulate the executor completing group 0 in the background before the
    // second call (the real timeline: the executor patches the manifest
    // independently of this function, via `patchProductionEpisodeGroupState`).
    const manifestAfterFirst = dbState.productionEpisodesManifest as ProductionEpisodesManifestWithBgm;
    dbState.productionEpisodesManifest = {
      ...manifestAfterFirst,
      episodes: manifestAfterFirst.episodes.map(e =>
        e.index === 0
          ? { ...e, status: "completed" as const, videoUrl: "/api/storage/files/group-0.mp4" }
          : e
      ),
    };

    // A new sub-episode 7 arrives; re-running should only enqueue the NEW
    // trailing short group, reusing group 0's completed state untouched.
    mockQueueVerticalDramaFfmpegAssemblyJob.mockClear();
    seedCompiledEpisodes([1, 2, 3, 4, 5, 6, 7]);

    const second = await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
    });
    expect(second.groupsCreated).toBe(1);
    expect(second.groupsSkipped).toBe(1);
    expect(second.manifest.episodes[0].status).toBe("completed"); // reused verbatim
    expect(second.manifest.episodes[1].status).toBe("pending"); // freshly (re)computed

    expect(mockQueueVerticalDramaFfmpegAssemblyJob).toHaveBeenCalledTimes(1);
    const [onlyCall] = mockQueueVerticalDramaFfmpegAssemblyJob.mock.calls.map(c => c[0] as any);
    expect(onlyCall.renderFeed.groupIndex).toBe(1);
  });
});

describe("runProductionEpisodeGroupJob — Render-options LEVEL (renderOptions)", () => {
  // Vertical Drama Render Queue plan §4.2 Wave 3 — `assembleProductionEpisodesForSeries`
  // no longer calls `runProductionEpisodeGroupJob` in-process (see the
  // "enqueue" describe block above), so this ffmpeg-orchestration behavior
  // is now exercised by calling the (still-exported, unchanged)
  // `runProductionEpisodeGroupJob` directly — mirrors how the executor
  // itself will invoke it for a claimed job.
  const owner = { tenantId: "t1", userId: 1, seriesId: 7 };
  const fakeFfmpegRunner = vi.fn(async () => ({ code: 0, stderr: "" }));
  const fakeProbeDurationSeconds = vi.fn(async () => 42);

  beforeEach(() => {
    fakeFfmpegRunner.mockClear();
    fakeProbeDurationSeconds.mockClear();
  });

  it("does not invoke the per-Sub-Episode render function when renderOptions is omitted (D′-1 default, unchanged)", async () => {
    seedGroupManifest(0, [1, 2, 3]);
    const renderFn = vi.fn(
      async (
        _args: RenderSubEpisodeWithOptionsArgs
      ): Promise<RenderSubEpisodeWithOptionsResult> => ({
        videoUrl: "/api/storage/files/should-not-be-called.mp4",
      })
    );

    await runProductionEpisodeGroupJob({
      owner,
      groupIndex: 0,
      members: membersFrom([1, 2, 3]),
      internalBaseUrl: "http://localhost:3000",
      filename: "prod-ep-1.mp4",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
      voiceChainEnabled: false,
      renderSubEpisodeWithOptionsFn: renderFn,
    });

    expect(renderFn).not.toHaveBeenCalled();
    expect(groupState(0)?.status).toBe("completed");
  });

  it("renders every Sub-Episode in a group WITH the given renderOptions before concatenating", async () => {
    seedGroupManifest(0, [1, 2, 3]);
    const calls: RenderSubEpisodeWithOptionsArgs[] = [];
    const renderFn = vi.fn(
      async (
        args: RenderSubEpisodeWithOptionsArgs
      ): Promise<RenderSubEpisodeWithOptionsResult> => {
        calls.push(args);
        return {
          videoUrl: `/api/storage/files/rendered-${args.owner.episodeId}.mp4`,
          durationSeconds: 30,
        };
      }
    );

    const renderOptions: ProductionEpisodeRenderOptions = {
      subtitlePreset: "classic_box",
      subtitleFontSize: "large",
      showAgeBadge: false,
      includeDialogueAudio: false,
      loudnessNormalize: true,
    };

    await runProductionEpisodeGroupJob({
      owner,
      groupIndex: 0,
      members: membersFrom([1, 2, 3]),
      internalBaseUrl: "http://localhost:3000",
      filename: "prod-ep-1.mp4",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
      voiceChainEnabled: false,
      renderSubEpisodeWithOptionsFn: renderFn,
      renderOptions,
    });

    expect(renderFn).toHaveBeenCalledTimes(3);
    expect(calls.map(c => c.owner.episodeId)).toEqual([1, 2, 3]);
    for (const call of calls) {
      expect(call.renderOptions).toEqual(renderOptions);
      expect(call.voiceChainEnabled).toBe(false);
      expect(call.audienceAgeRating).toBeUndefined();
    }

    // The group's own concat used the RENDERED urls (not the pre-existing
    // ones) — one ffmpeg invocation for the whole group's concat, on top of
    // the 3 per-Sub-Episode render calls above.
    expect(fakeFfmpegRunner).toHaveBeenCalledTimes(1);
    expect(groupState(0)?.status).toBe("completed");
  });

  it("passes the caller-supplied voiceChainEnabled/audienceAgeRating through to every per-Sub-Episode render call", async () => {
    seedGroupManifest(0, [1]);
    const calls: RenderSubEpisodeWithOptionsArgs[] = [];
    const renderFn = vi.fn(
      async (
        args: RenderSubEpisodeWithOptionsArgs
      ): Promise<RenderSubEpisodeWithOptionsResult> => {
        calls.push(args);
        return { videoUrl: `/api/storage/files/rendered-${args.owner.episodeId}.mp4` };
      }
    );

    await runProductionEpisodeGroupJob({
      owner,
      groupIndex: 0,
      members: membersFrom([1]),
      internalBaseUrl: "http://localhost:3000",
      filename: "prod-ep-1.mp4",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
      voiceChainEnabled: true,
      audienceAgeRating: "13plus",
      renderSubEpisodeWithOptionsFn: renderFn,
      renderOptions: { includeDialogueAudio: true, showAgeBadge: true },
    });

    expect(renderFn).toHaveBeenCalledTimes(1);
    expect(calls[0].voiceChainEnabled).toBe(true);
    expect(calls[0].audienceAgeRating).toBe("13plus");
  });

  it("marks the whole group failed (without concatenating) when a per-Sub-Episode render fails", async () => {
    seedGroupManifest(0, [1, 2]);
    const renderFn = vi.fn(
      async (
        args: RenderSubEpisodeWithOptionsArgs
      ): Promise<RenderSubEpisodeWithOptionsResult> => {
        if (args.owner.episodeId === 2) throw new Error("boom: render failed");
        return { videoUrl: `/api/storage/files/rendered-${args.owner.episodeId}.mp4` };
      }
    );

    await runProductionEpisodeGroupJob({
      owner,
      groupIndex: 0,
      members: membersFrom([1, 2]),
      internalBaseUrl: "http://localhost:3000",
      filename: "prod-ep-1.mp4",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
      voiceChainEnabled: false,
      renderSubEpisodeWithOptionsFn: renderFn,
      renderOptions: { subtitlePreset: "none" },
    });

    expect(fakeFfmpegRunner).not.toHaveBeenCalled();
    expect(groupState(0)?.status).toBe("failed");
    expect(groupState(0)?.error).toMatch(/boom: render failed/);
  });
});

/**
 * Phase B-1 (`planning/vertical-drama-production-render/plan.md` Phase B) —
 * BGM bed + ducking, a POST-PASS run after a group's own concat. Covers
 * mutation-input threading (`bgm` flowing from `assembleProductionEpisodesForSeries`
 * into `runProductionEpisodeGroupJob`'s second ffmpeg invocation) and
 * group-state persistence (`bgm` recorded on the group state at "pending"
 * time and carried through unchanged to "completed"/"failed", mirroring the
 * existing `renderOptions` coverage above). The pure ffmpeg-args builder
 * itself (`buildBgmMixFilterComplex`/`buildBgmMixFfmpegArgs` — loop, volume,
 * sidechain-on/off) is covered separately in
 * `verticalDramaFinalRenderGraph.test.ts`; this file only asserts that the
 * SERVICE actually invokes it as a second ffmpeg call and uploads its output.
 */
describe("runProductionEpisodeGroupJob — Phase B-1 (bgm)", () => {
  // Vertical Drama Render Queue plan §4.2 Wave 3 — see the doc comment atop
  // the "Render-options LEVEL" describe block above for why this now calls
  // `runProductionEpisodeGroupJob` directly instead of going through
  // `assembleProductionEpisodesForSeries` (which only enqueues now).
  const owner = { tenantId: "t1", userId: 1, seriesId: 7 };
  const fakeFfmpegRunner = vi.fn(async () => ({ code: 0, stderr: "" }));
  const fakeProbeDurationSeconds = vi.fn(async () => 42);
  const neverCalledRenderFn = vi.fn(
    async (_args: RenderSubEpisodeWithOptionsArgs): Promise<RenderSubEpisodeWithOptionsResult> => {
      throw new Error("renderSubEpisodeWithOptionsFn should not be called");
    }
  );

  beforeEach(() => {
    fakeFfmpegRunner.mockClear();
    fakeProbeDurationSeconds.mockClear();
    neverCalledRenderFn.mockClear();
  });

  const bgm: ProductionEpisodeBgmOptions = {
    url: "/api/storage/files/track.mp3",
    volumePercent: 35,
    duckUnderVideoAudio: true,
  };

  function baseArgs(overrides: Record<string, unknown> = {}) {
    return {
      owner,
      groupIndex: 0,
      members: membersFrom([1, 2, 3]),
      internalBaseUrl: "http://localhost:3000",
      filename: "prod-ep-1.mp4",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
      voiceChainEnabled: false,
      renderSubEpisodeWithOptionsFn: neverCalledRenderFn,
      ...overrides,
    };
  }

  it("does not run a second ffmpeg pass when bgm is omitted (default, unchanged)", async () => {
    seedGroupManifest(0, [1, 2, 3]);

    await runProductionEpisodeGroupJob(baseArgs() as Parameters<typeof runProductionEpisodeGroupJob>[0]);

    expect(fakeFfmpegRunner).toHaveBeenCalledTimes(1); // concat only, no bgm pass
    expect(groupState(0)?.status).toBe("completed");
  });

  it("runs a second bgm-mix ffmpeg pass after the concat and uploads ONLY its output", async () => {
    seedGroupManifest(0, [1, 2, 3]);

    await runProductionEpisodeGroupJob(
      baseArgs({ bgm }) as Parameters<typeof runProductionEpisodeGroupJob>[0]
    );

    expect(fakeFfmpegRunner).toHaveBeenCalledTimes(2); // concat, then bgm mix
    const bgmArgs = fakeFfmpegRunner.mock.calls[1]![0] as string[];
    expect(bgmArgs).toContain("-stream_loop");
    expect(bgmArgs.join(" ")).toContain("sidechaincompress");
    const tIndex = bgmArgs.indexOf("-t");
    expect(bgmArgs[tIndex + 1]).toBe("42"); // the concat's own probed duration

    // The duration probe runs ONCE (against the concat output) — the bgm
    // pass reuses that same value rather than re-probing its own output.
    expect(fakeProbeDurationSeconds).toHaveBeenCalledTimes(1);

    // Only the FINAL (bgm-mixed) file is uploaded — the intermediate
    // concat-only file is never separately uploaded.
    expect(storagePutFromPath).toHaveBeenCalledTimes(1);
    const [, sourcePath] = vi.mocked(storagePutFromPath).mock.calls[0]!;
    expect(sourcePath).toMatch(/output-bgm\.mp4$/);

    expect(groupState(0)?.status).toBe("completed");
    expect(groupState(0)?.videoUrl).toMatch(/^\/api\/storage\/files\//);
  });

  it("marks the group failed (without uploading) when the bgm-mix ffmpeg pass itself exits non-zero", async () => {
    seedGroupManifest(0, [1, 2, 3]);
    let call = 0;
    const runner = vi.fn(async () => {
      call += 1;
      return call === 1 ? { code: 0, stderr: "" } : { code: 1, stderr: "bgm boom" };
    });

    await runProductionEpisodeGroupJob(
      baseArgs({ bgm, ffmpegRunner: runner }) as Parameters<typeof runProductionEpisodeGroupJob>[0]
    );

    expect(storagePutFromPath).not.toHaveBeenCalled();
    expect(groupState(0)?.status).toBe("failed");
    expect(groupState(0)?.error).toMatch(/ffmpeg production-episode bgm mix failed/);
  });

  it("marks the group failed (without attempting the bgm pass) when the concat's own duration probe fails", async () => {
    seedGroupManifest(0, [1, 2, 3]);
    const probeFails = vi.fn(async () => undefined);

    await runProductionEpisodeGroupJob(
      baseArgs({ bgm, probeDurationSecondsFn: probeFails }) as Parameters<
        typeof runProductionEpisodeGroupJob
      >[0]
    );

    expect(fakeFfmpegRunner).toHaveBeenCalledTimes(1); // concat only; bgm pass never attempted
    expect(storagePutFromPath).not.toHaveBeenCalled();
    expect(groupState(0)?.status).toBe("failed");
    expect(groupState(0)?.error).toMatch(
      /vertical_drama_production_bgm_duration_probe_failed/
    );
  });
});

/**
 * Phase C-1 (`planning/vertical-drama-production-render/plan.md` Phase C) —
 * credits roll, a POST-PASS run AFTER the bgm post-pass (if any). Covers
 * mutation-input threading (`credits` flowing from
 * `assembleProductionEpisodesForSeries` into `runProductionEpisodeGroupJob`'s
 * final ffmpeg invocation), group-state persistence (`credits` recorded on
 * the group state at "pending" time and carried through unchanged to
 * "completed"/"failed", mirroring the existing `bgm` coverage above), and the
 * pass ORDERING (credits burns onto the bgm-mixed output when `bgm` was ALSO
 * supplied, not the raw concat output). The pure ffmpeg/`.ass`-args builders
 * themselves (`buildCreditsAssFile`/`buildCreditsBurnFfmpegArgs` — timing,
 * geometry, escaping) are covered separately in
 * `verticalDramaFinalRenderGraph.test.ts`; this file only asserts that the
 * SERVICE actually invokes them as an additional ffmpeg call and uploads its
 * output.
 */
describe("runProductionEpisodeGroupJob — Phase C-1 (credits)", () => {
  // Vertical Drama Render Queue plan §4.2 Wave 3 — see the doc comment atop
  // the "Render-options LEVEL" describe block above.
  const owner = { tenantId: "t1", userId: 1, seriesId: 7 };
  const fakeFfmpegRunner = vi.fn(async () => ({ code: 0, stderr: "" }));
  const fakeProbeDurationSeconds = vi.fn(async () => 42);
  const neverCalledRenderFn = vi.fn(
    async (_args: RenderSubEpisodeWithOptionsArgs): Promise<RenderSubEpisodeWithOptionsResult> => {
      throw new Error("renderSubEpisodeWithOptionsFn should not be called");
    }
  );

  beforeEach(() => {
    fakeFfmpegRunner.mockClear();
    fakeProbeDurationSeconds.mockClear();
    neverCalledRenderFn.mockClear();
  });

  const credits: ProductionEpisodeCreditsOptions = {
    text: "Jane Doe — Writer\nJohn Smith — Director",
  };

  const bgm: ProductionEpisodeBgmOptions = {
    url: "/api/storage/files/track.mp3",
    volumePercent: 35,
    duckUnderVideoAudio: true,
  };

  function baseArgs(overrides: Record<string, unknown> = {}) {
    return {
      owner,
      groupIndex: 0,
      members: membersFrom([1, 2, 3]),
      internalBaseUrl: "http://localhost:3000",
      filename: "prod-ep-1.mp4",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
      voiceChainEnabled: false,
      renderSubEpisodeWithOptionsFn: neverCalledRenderFn,
      ...overrides,
    };
  }

  it("does not run an extra ffmpeg pass when credits is omitted (default, unchanged)", async () => {
    seedGroupManifest(0, [1, 2, 3]);

    await runProductionEpisodeGroupJob(baseArgs() as Parameters<typeof runProductionEpisodeGroupJob>[0]);

    expect(fakeFfmpegRunner).toHaveBeenCalledTimes(1); // concat only, no credits pass
    expect(groupState(0)?.status).toBe("completed");
  });

  it("runs a second credits-burn ffmpeg pass after the concat and uploads ONLY its output", async () => {
    seedGroupManifest(0, [1, 2, 3]);

    await runProductionEpisodeGroupJob(
      baseArgs({ credits }) as Parameters<typeof runProductionEpisodeGroupJob>[0]
    );

    expect(fakeFfmpegRunner).toHaveBeenCalledTimes(2); // concat, then credits burn
    const creditsArgs = fakeFfmpegRunner.mock.calls[1]![0] as string[];
    expect(creditsArgs.join(" ")).toContain("subtitles=");
    expect(creditsArgs.join(" ")).not.toContain("-stream_loop"); // never the bgm pass
    // Burns onto the RAW concat output (no bgm was supplied in this test).
    expect(creditsArgs[2]).toMatch(/\/output\.mp4$/);

    // The duration probe runs ONCE (against the concat output) — the
    // credits pass reuses that same value rather than re-probing.
    expect(fakeProbeDurationSeconds).toHaveBeenCalledTimes(1);

    // Only the FINAL (credits-burned) file is uploaded.
    expect(storagePutFromPath).toHaveBeenCalledTimes(1);
    const [, sourcePath] = vi.mocked(storagePutFromPath).mock.calls[0]!;
    expect(sourcePath).toMatch(/output-credits\.mp4$/);

    expect(groupState(0)?.status).toBe("completed");
    expect(groupState(0)?.videoUrl).toMatch(/^\/api\/storage\/files\//);
  });

  it("burns credits onto the BGM-mixed output (not the raw concat output) when both bgm and credits are supplied — three passes, in order", async () => {
    seedGroupManifest(0, [1, 2, 3]);

    await runProductionEpisodeGroupJob(
      baseArgs({ bgm, credits }) as Parameters<typeof runProductionEpisodeGroupJob>[0]
    );

    expect(fakeFfmpegRunner).toHaveBeenCalledTimes(3); // concat, bgm mix, credits burn
    const bgmArgs = fakeFfmpegRunner.mock.calls[1]![0] as string[];
    expect(bgmArgs.join(" ")).toContain("sidechaincompress");
    const creditsArgs = fakeFfmpegRunner.mock.calls[2]![0] as string[];
    expect(creditsArgs.join(" ")).toContain("subtitles=");
    // The credits pass' OWN input is the bgm pass' OUTPUT, not the plain
    // concat output — i.e. it runs over the "(post-BGM, if any)" video.
    expect(creditsArgs[2]).toMatch(/\/output-bgm\.mp4$/);

    // Only the LAST (credits-burned-on-top-of-bgm) file is uploaded.
    expect(storagePutFromPath).toHaveBeenCalledTimes(1);
    const [, sourcePath] = vi.mocked(storagePutFromPath).mock.calls[0]!;
    expect(sourcePath).toMatch(/output-credits\.mp4$/);

    expect(groupState(0)?.status).toBe("completed");
  });

  it("marks the group failed (without uploading) when the credits-burn ffmpeg pass itself exits non-zero", async () => {
    seedGroupManifest(0, [1, 2, 3]);
    let call = 0;
    const runner = vi.fn(async () => {
      call += 1;
      return call === 1 ? { code: 0, stderr: "" } : { code: 1, stderr: "credits boom" };
    });

    await runProductionEpisodeGroupJob(
      baseArgs({ credits, ffmpegRunner: runner }) as Parameters<
        typeof runProductionEpisodeGroupJob
      >[0]
    );

    expect(storagePutFromPath).not.toHaveBeenCalled();
    expect(groupState(0)?.status).toBe("failed");
    expect(groupState(0)?.error).toMatch(
      /ffmpeg production-episode credits burn failed/
    );
  });

  it("marks the group failed (without attempting the credits pass) when the concat's own duration probe fails", async () => {
    seedGroupManifest(0, [1, 2, 3]);
    const probeFails = vi.fn(async () => undefined);

    await runProductionEpisodeGroupJob(
      baseArgs({ credits, probeDurationSecondsFn: probeFails }) as Parameters<
        typeof runProductionEpisodeGroupJob
      >[0]
    );

    expect(fakeFfmpegRunner).toHaveBeenCalledTimes(1); // concat only; credits pass never attempted
    expect(storagePutFromPath).not.toHaveBeenCalled();
    expect(groupState(0)?.status).toBe("failed");
    expect(groupState(0)?.error).toMatch(
      /vertical_drama_production_credits_duration_probe_failed/
    );
  });
});

/**
 * Phase C-2 (`planning/vertical-drama-production-render/plan.md` Phase C,
 * "overlays generalization") — an UNLIMITED (caller-capped) list of ad-hoc
 * timed text overlays, a POST-PASS run at the SAME point in the chain as the
 * Phase C-1 credits roll (after bgm, if any). Covers mutation-input
 * threading (`overlays` flowing from `assembleProductionEpisodesForSeries`
 * into `runProductionEpisodeGroupJob`'s ffmpeg invocation), group-state
 * persistence (`overlays` recorded on the group state at "pending" time and
 * carried through unchanged to "completed"/"failed", mirroring the existing
 * `bgm`/`credits` coverage above), the FOLDING behavior (overlays + credits
 * become ONE additional ffmpeg pass, not two, when both are supplied for the
 * same call), and that the credits-ONLY code path (Phase C-1, tested above)
 * is completely unaffected by this addition. The pure ffmpeg/`.ass`-args
 * builders themselves (`buildProductionOverlaysAssFile`/`buildAssBurnFfmpegArgs`
 * — timing, positioning, clamping, escaping, N-pass chaining) are covered
 * separately in `verticalDramaFinalRenderGraph.test.ts`; this file only
 * asserts that the SERVICE actually invokes them as an additional ffmpeg call
 * and uploads its output.
 */
describe("runProductionEpisodeGroupJob — Phase C-2 (overlays)", () => {
  // Vertical Drama Render Queue plan §4.2 Wave 3 — see the doc comment atop
  // the "Render-options LEVEL" describe block above.
  const owner = { tenantId: "t1", userId: 1, seriesId: 7 };
  const fakeFfmpegRunner = vi.fn(async () => ({ code: 0, stderr: "" }));
  const fakeProbeDurationSeconds = vi.fn(async () => 42);
  const neverCalledRenderFn = vi.fn(
    async (_args: RenderSubEpisodeWithOptionsArgs): Promise<RenderSubEpisodeWithOptionsResult> => {
      throw new Error("renderSubEpisodeWithOptionsFn should not be called");
    }
  );

  beforeEach(() => {
    fakeFfmpegRunner.mockClear();
    fakeProbeDurationSeconds.mockClear();
    neverCalledRenderFn.mockClear();
  });

  const overlays: ProductionEpisodeOverlayItem[] = [
    { atSeconds: 5, durationSeconds: 3, text: "Follow for more", style: "lower_third" },
    { atSeconds: 20, durationSeconds: 2, text: "Plot twist!", style: "centered" },
  ];

  const credits: ProductionEpisodeCreditsOptions = {
    text: "Jane Doe — Writer\nJohn Smith — Director",
  };

  const bgm: ProductionEpisodeBgmOptions = {
    url: "/api/storage/files/track.mp3",
    volumePercent: 35,
    duckUnderVideoAudio: true,
  };

  function baseArgs(overrides: Record<string, unknown> = {}) {
    return {
      owner,
      groupIndex: 0,
      members: membersFrom([1, 2, 3]),
      internalBaseUrl: "http://localhost:3000",
      filename: "prod-ep-1.mp4",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
      voiceChainEnabled: false,
      renderSubEpisodeWithOptionsFn: neverCalledRenderFn,
      ...overrides,
    };
  }

  it("does not run an extra ffmpeg pass when overlays is omitted (default, unchanged)", async () => {
    seedGroupManifest(0, [1, 2, 3]);

    await runProductionEpisodeGroupJob(baseArgs() as Parameters<typeof runProductionEpisodeGroupJob>[0]);

    expect(fakeFfmpegRunner).toHaveBeenCalledTimes(1); // concat only, no overlays pass
    expect(groupState(0)?.status).toBe("completed");
  });

  it("does not run an extra ffmpeg pass when overlays is an EMPTY array (same as omitted)", async () => {
    seedGroupManifest(0, [1, 2, 3]);

    await runProductionEpisodeGroupJob(
      baseArgs({ overlays: [] }) as Parameters<typeof runProductionEpisodeGroupJob>[0]
    );

    expect(fakeFfmpegRunner).toHaveBeenCalledTimes(1); // concat only, no overlays pass
    expect(groupState(0)?.status).toBe("completed");
  });

  it("runs a second overlays-burn ffmpeg pass after the concat and uploads ONLY its output, when overlays is supplied WITHOUT credits", async () => {
    seedGroupManifest(0, [1, 2, 3]);

    await runProductionEpisodeGroupJob(
      baseArgs({ overlays }) as Parameters<typeof runProductionEpisodeGroupJob>[0]
    );

    expect(fakeFfmpegRunner).toHaveBeenCalledTimes(2); // concat, then overlays burn
    const overlaysArgs = fakeFfmpegRunner.mock.calls[1]![0] as string[];
    expect(overlaysArgs.join(" ")).toContain("subtitles=");
    expect(overlaysArgs.join(" ")).not.toContain("-stream_loop"); // never the bgm pass
    // Exactly ONE subtitles= stage (overlays only, no credits folded in).
    expect(overlaysArgs.join(" ").match(/subtitles=/g)?.length).toBe(1);
    // Burns onto the RAW concat output (no bgm was supplied in this test).
    expect(overlaysArgs[2]).toMatch(/\/output\.mp4$/);

    // The duration probe runs ONCE (against the concat output) — the
    // overlays pass reuses that same value rather than re-probing.
    expect(fakeProbeDurationSeconds).toHaveBeenCalledTimes(1);

    // Only the FINAL (overlays-burned) file is uploaded.
    expect(storagePutFromPath).toHaveBeenCalledTimes(1);
    const [, sourcePath] = vi.mocked(storagePutFromPath).mock.calls[0]!;
    expect(sourcePath).toMatch(/output-overlays\.mp4$/);

    expect(groupState(0)?.status).toBe("completed");
    expect(groupState(0)?.videoUrl).toMatch(/^\/api\/storage\/files\//);
  });

  it("FOLDS overlays + credits into ONE additional ffmpeg pass (not two) when both are supplied for the same call", async () => {
    seedGroupManifest(0, [1, 2, 3]);

    await runProductionEpisodeGroupJob(
      baseArgs({ overlays, credits }) as Parameters<typeof runProductionEpisodeGroupJob>[0]
    );

    // Concat, then ONE combined overlays+credits burn — NOT concat + overlays
    // + credits (three passes) — this is the "one re-encode instead of two"
    // folding behavior.
    expect(fakeFfmpegRunner).toHaveBeenCalledTimes(2);
    const combinedArgs = fakeFfmpegRunner.mock.calls[1]![0] as string[];
    // TWO chained subtitles= stages inside the SAME -vf value.
    expect(combinedArgs.join(" ").match(/subtitles=/g)?.length).toBe(2);
    expect(combinedArgs.filter(a => a === "-i").length).toBe(1);
    expect(combinedArgs.filter(a => a === "-vf").length).toBe(1);
    // Burns onto the RAW concat output (no bgm supplied in this test).
    expect(combinedArgs[2]).toMatch(/\/output\.mp4$/);

    expect(storagePutFromPath).toHaveBeenCalledTimes(1);
    const [, sourcePath] = vi.mocked(storagePutFromPath).mock.calls[0]!;
    expect(sourcePath).toMatch(/output-overlays-credits\.mp4$/);

    expect(groupState(0)?.status).toBe("completed");
  });

  it("still uses the ORIGINAL single-pass credits-only code path (Phase C-1, untouched) when credits is supplied WITHOUT overlays", async () => {
    seedGroupManifest(0, [1, 2, 3]);

    await runProductionEpisodeGroupJob(
      baseArgs({ credits }) as Parameters<typeof runProductionEpisodeGroupJob>[0]
    );

    expect(fakeFfmpegRunner).toHaveBeenCalledTimes(2); // concat, then credits burn only
    const creditsArgs = fakeFfmpegRunner.mock.calls[1]![0] as string[];
    // Exactly ONE subtitles= stage (credits only — the ORIGINAL Phase C-1
    // single-pass call, not the new N-pass buildAssBurnFfmpegArgs).
    expect(creditsArgs.join(" ").match(/subtitles=/g)?.length).toBe(1);
    expect(storagePutFromPath).toHaveBeenCalledTimes(1);
    const [, sourcePath] = vi.mocked(storagePutFromPath).mock.calls[0]!;
    expect(sourcePath).toMatch(/output-credits\.mp4$/);
  });

  it("burns the combined overlays+credits pass onto the BGM-mixed output (not the raw concat output) when bgm is ALSO supplied — three ffmpeg passes total, in order", async () => {
    seedGroupManifest(0, [1, 2, 3]);

    await runProductionEpisodeGroupJob(
      baseArgs({ bgm, overlays, credits }) as Parameters<typeof runProductionEpisodeGroupJob>[0]
    );

    expect(fakeFfmpegRunner).toHaveBeenCalledTimes(3); // concat, bgm mix, combined overlays+credits burn
    const bgmArgs = fakeFfmpegRunner.mock.calls[1]![0] as string[];
    expect(bgmArgs.join(" ")).toContain("sidechaincompress");
    const combinedArgs = fakeFfmpegRunner.mock.calls[2]![0] as string[];
    expect(combinedArgs.join(" ").match(/subtitles=/g)?.length).toBe(2);
    // The combined pass' OWN input is the bgm pass' OUTPUT, not the plain
    // concat output — i.e. it runs over the "(post-BGM, if any)" video.
    expect(combinedArgs[2]).toMatch(/\/output-bgm\.mp4$/);

    expect(storagePutFromPath).toHaveBeenCalledTimes(1);
    const [, sourcePath] = vi.mocked(storagePutFromPath).mock.calls[0]!;
    expect(sourcePath).toMatch(/output-overlays-credits\.mp4$/);

    expect(groupState(0)?.status).toBe("completed");
  });

  it("marks the group failed (without uploading) when the overlays-only burn ffmpeg pass exits non-zero", async () => {
    seedGroupManifest(0, [1, 2, 3]);
    let call = 0;
    const runner = vi.fn(async () => {
      call += 1;
      return call === 1 ? { code: 0, stderr: "" } : { code: 1, stderr: "overlays boom" };
    });

    await runProductionEpisodeGroupJob(
      baseArgs({ overlays, ffmpegRunner: runner }) as Parameters<
        typeof runProductionEpisodeGroupJob
      >[0]
    );

    expect(storagePutFromPath).not.toHaveBeenCalled();
    expect(groupState(0)?.status).toBe("failed");
    expect(groupState(0)?.error).toMatch(
      /ffmpeg production-episode overlays burn failed/
    );
  });

  it("marks the group failed (without uploading) when the COMBINED overlays+credits burn ffmpeg pass exits non-zero", async () => {
    seedGroupManifest(0, [1, 2, 3]);
    let call = 0;
    const runner = vi.fn(async () => {
      call += 1;
      return call === 1 ? { code: 0, stderr: "" } : { code: 1, stderr: "combined boom" };
    });

    await runProductionEpisodeGroupJob(
      baseArgs({ overlays, credits, ffmpegRunner: runner }) as Parameters<
        typeof runProductionEpisodeGroupJob
      >[0]
    );

    expect(storagePutFromPath).not.toHaveBeenCalled();
    expect(groupState(0)?.status).toBe("failed");
    expect(groupState(0)?.error).toMatch(
      /ffmpeg production-episode overlays\/credits burn failed/
    );
  });

  it("marks the group failed (without attempting the overlays pass) when the concat's own duration probe fails", async () => {
    seedGroupManifest(0, [1, 2, 3]);
    const probeFails = vi.fn(async () => undefined);

    await runProductionEpisodeGroupJob(
      baseArgs({ overlays, probeDurationSecondsFn: probeFails }) as Parameters<
        typeof runProductionEpisodeGroupJob
      >[0]
    );

    expect(fakeFfmpegRunner).toHaveBeenCalledTimes(1); // concat only; overlays pass never attempted
    expect(storagePutFromPath).not.toHaveBeenCalled();
    expect(groupState(0)?.status).toBe("failed");
    expect(groupState(0)?.error).toMatch(
      /vertical_drama_production_overlays_duration_probe_failed/
    );
  });
});
