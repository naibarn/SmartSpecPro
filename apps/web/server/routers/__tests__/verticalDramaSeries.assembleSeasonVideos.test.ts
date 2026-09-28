/**
 * Vertical Drama Series — season batch render (task #21 / W12.5 "Final
 * Render Suite" phase B, added 2026-07-09): `assembleSeasonVideos`.
 *
 * Same "mock the whole module graph, test the exported procedure handler
 * directly" convention as `verticalDramaSeries.adBanner.test.ts` (its own
 * doc comment explains why a minimal `verticalDramaStoryBible` mock is
 * enough — every symbol from that module is referenced ONLY inside OTHER
 * procedures' handler bodies, never at this router file's top level, so an
 * `undefined` binding for an unused export never crashes module load).
 *
 * `../../services/verticalDramaEpisodeVideoAssembly` is mocked as a black
 * box here (same as `verticalDramaEpisodes.voiceChain.test.ts`/
 * `verticalDramaEpisodes.adBannerPlan.test.ts` do for the SAME module) —
 * its own real behavior (`resolveClipsForAssembly`,
 * `resolveEpisodeDialogueAudioAndSubtitlesRunInputs`,
 * `submitSequentialAssemblyJobs`'s sequential/continue-on-failure chain) is
 * covered directly in `verticalDramaEpisodeVideoAssembly.test.ts`. This file
 * covers the ROUTER's OWN logic: per-episode precondition/skip-reason
 * building, ownership scoping, shared-option threading, and response shape
 * — including that `assembleSeasonVideos` calls the LAZILY-imported
 * `../services/verticalDramaEpisodeVideoAssembly` (`vi.mock` intercepts a
 * dynamic `await import(...)` exactly like a static import).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
    instance: {},
  },
}));
vi.mock("../../db", () => ({ db: mockDb }));

vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      use: () => proc,
      input: () => proc,
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
    };
    return proc;
  };
  return {
    router: (routes: Record<string, unknown>) => routes,
    protectedProcedure: createProcedure(),
  };
});

vi.mock("../../middleware/requireFeatureFlag", () => ({
  requireFeatureFlag: () => (x: unknown) => x,
}));

vi.mock("../../services/verticalDramaStoryBible", () => ({
  generateStoryBible: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));

vi.mock("../../_core/logger", () => ({
  debugError: vi.fn(),
  debugLog: vi.fn(),
}));

const { mockGetTenantFeatureFlags } = vi.hoisted(() => ({
  mockGetTenantFeatureFlags: vi.fn(),
}));
vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));

vi.mock("../../services/appRuntimeConfig", () => ({
  getCachedAppRuntimeConfig: vi.fn(() => ({
    internalNodeUrl: "http://localhost:3000",
  })),
}));

vi.mock("../../services/verticalDramaEpisodeVideoAssembly", () => ({
  extractClipSourcesFromMotionPromptPack: vi.fn(() => []),
  resolveClipsForAssembly: vi.fn(() => ({ ordered: [], missing: [] })),
  compiledVideoFilename: vi.fn(
    (args: { episodeNumber?: number | string }) => `ep-${args.episodeNumber}-compiled.mp4`
  ),
  resolveEpisodeDialogueAudioAndSubtitlesRunInputs: vi.fn(() => ({
    dialogueAudioSegmentsIncluded: 0,
    subtitleLinesIncluded: 0,
  })),
  // no longer the primary path — see queueVerticalDramaFfmpegAssemblyJob
  submitSequentialAssemblyJobs: vi.fn(async (specs: Array<{ owner: { episodeId: number } }>) =>
    specs.map(spec => ({ episodeId: spec.owner.episodeId, jobId: `job-${spec.owner.episodeId}` }))
  ),
  // Vertical Drama Render Queue plan §4.2 Wave 3 — `assembleSeasonVideos`
  // persists `assemblyManifest.compiledVideo = {status:"pending", pendingJobId}`
  // per episode right after enqueueing, same shape convention
  // `submitSequentialAssemblyJobs` itself always used.
  persistCompiledVideoState: vi.fn(async () => undefined),
}));

// Vertical Drama Render Queue plan §4.2 Wave 3 — enqueue-only entry point
// for the `vertical_drama_ffmpeg_assembly` worker job type; replaces the
// in-process `submitSequentialAssemblyJobs` ffmpeg chain inside
// `assembleSeasonVideos`.
const { mockQueueVerticalDramaFfmpegAssemblyJob } = vi.hoisted(() => ({
  mockQueueVerticalDramaFfmpegAssemblyJob: vi.fn(),
}));
vi.mock("../../services/workerSchedulerService", () => ({
  queueVerticalDramaFfmpegAssemblyJob: mockQueueVerticalDramaFfmpegAssemblyJob,
}));

import { verticalDramaSeriesRouter } from "../verticalDramaSeries";
import * as episodeVideoAssembly from "../../services/verticalDramaEpisodeVideoAssembly";

const router = verticalDramaSeriesRouter as unknown as Record<string, Function>;

function ctx(overrides: Partial<{ tenantId: string | null; user: { id: number } }> = {}) {
  return { tenantId: "tenant-1", user: { id: 42 }, userToken: null, publicUrl: undefined, ...overrides };
}

/** Thenable select-chain stub — resolves at ANY point in the chain (mirrors
 *  this router's sibling test files' own helper). `orderBy`/`limit` both
 *  resolve to the SAME `rows` so this works for both `loadOwnedSeries`
 *  (`.limit(1)`) and the episode list query (`.orderBy(...)`). */
function selectChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => Promise.resolve(rows)),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

function seriesRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    tenantId: "tenant-1",
    userId: 42,
    title: "Midnight Vows",
    trailer: null,
    ...overrides,
  };
}

function episodeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    episodeNumber: 1,
    motionPromptPack: { clips: [{ clipNumber: 1, sourceShotNumbers: [1], durationSeconds: 8 }] },
    dialogueAudioPlan: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesVoiceChain: false });
  vi.mocked(episodeVideoAssembly.extractClipSourcesFromMotionPromptPack).mockImplementation(
    (pack: any) => (pack?.clips?.length ? pack.clips.map((c: any) => ({ clipNumber: c.clipNumber, videoUrl: `/clip-${c.clipNumber}.mp4` })) : [])
  );
  vi.mocked(episodeVideoAssembly.resolveClipsForAssembly).mockImplementation((clips: any) => ({
    ordered: clips,
    missing: [],
  }));
  vi.mocked(episodeVideoAssembly.compiledVideoFilename).mockImplementation(
    (args: any) => `ep-${args.episodeNumber}-compiled.mp4`
  );
  vi.mocked(episodeVideoAssembly.resolveEpisodeDialogueAudioAndSubtitlesRunInputs).mockReturnValue({
    dialogueAudioSegmentsIncluded: 0,
    subtitleLinesIncluded: 0,
  });
  vi.mocked(episodeVideoAssembly.submitSequentialAssemblyJobs).mockImplementation(
    async (specs: any) =>
      specs.map((spec: any) => ({ episodeId: spec.owner.episodeId, jobId: `job-${spec.owner.episodeId}` }))
  );
  // Fake worker-job id derived from the enqueued renderFeed's owner.episodeId
  // — mirrors the OLD `submitSequentialAssemblyJobs` mock's own
  // `job-${episodeId}` naming above, so tests asserting on `jobId` shapes
  // stay readable/unchanged.
  mockQueueVerticalDramaFfmpegAssemblyJob.mockImplementation(
    async (input: { renderFeed: { owner: { episodeId: number } } }) => ({
      created: true,
      job: { id: `job-${input.renderFeed.owner.episodeId}` },
    })
  );
});

describe("assembleSeasonVideos — ownership + preconditions", () => {
  it("throws BAD_REQUEST for a non-numeric seriesId", async () => {
    await expect(
      router.assembleSeasonVideos({ ctx: ctx(), input: { seriesId: "not-a-number" } })
    ).rejects.toThrow(/Invalid series id/);
  });

  it("throws NOT_FOUND (via loadOwnedSeries) for a series the caller does not own", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // loadOwnedSeries — no row
    await expect(
      router.assembleSeasonVideos({ ctx: ctx(), input: { seriesId: "10" } })
    ).rejects.toThrow(/Series not found/);
  });

  it("throws PRECONDITION_FAILED when the series has zero episodes", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow()])) // loadOwnedSeries
      .mockReturnValueOnce(selectChain([])); // episode list — empty
    await expect(
      router.assembleSeasonVideos({ ctx: ctx(), input: { seriesId: "10" } })
    ).rejects.toThrow(/no Sub-episodes yet/);
  });
});

describe("assembleSeasonVideos — per-episode readiness (skip reasons)", () => {
  it("skips an episode with zero video clips, with a descriptive reason, and still submits the ready ones", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow()]))
      .mockReturnValueOnce(
        selectChain([
          episodeRow({ id: 1, motionPromptPack: null }), // no clips at all
          episodeRow({ id: 2 }),
        ])
      );

    const result = await router.assembleSeasonVideos({ ctx: ctx(), input: { seriesId: "10" } });

    expect(result.skipped).toEqual([
      expect.objectContaining({ episodeId: "1", reason: expect.stringMatching(/No video clips/) }),
    ]);
    expect(result.submitted).toEqual([{ episodeId: "2", jobId: "job-2" }]);
  });

  it("skips an episode whose clips fail resolveClipsForAssembly (missing clips, allowPartial not set), preserving the thrown message as the reason", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow()]))
      .mockReturnValueOnce(selectChain([episodeRow({ id: 1 }), episodeRow({ id: 2 })]));

    vi.mocked(episodeVideoAssembly.resolveClipsForAssembly)
      .mockImplementationOnce(() => {
        throw new Error("vertical_drama_assembly_missing_clips: shot(s)/clip(s) 2 have no completed video yet.");
      })
      .mockImplementationOnce((clips: any) => ({ ordered: clips, missing: [] }));

    const result = await router.assembleSeasonVideos({ ctx: ctx(), input: { seriesId: "10" } });

    expect(result.skipped).toEqual([
      expect.objectContaining({
        episodeId: "1",
        reason: expect.stringMatching(/vertical_drama_assembly_missing_clips/),
      }),
    ]);
    expect(result.submitted).toEqual([{ episodeId: "2", jobId: "job-2" }]);
  });

  it("passes options.allowPartial through to resolveClipsForAssembly for every episode", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow()]))
      .mockReturnValueOnce(selectChain([episodeRow({ id: 1 })]));

    await router.assembleSeasonVideos({
      ctx: ctx(),
      input: { seriesId: "10", options: { allowPartial: true } },
    });

    expect(episodeVideoAssembly.resolveClipsForAssembly).toHaveBeenCalledWith(
      expect.any(Array),
      { allowPartial: true }
    );
  });

  it("returns {submitted: [], skipped: [...]} without enqueueing any ffmpeg-assembly job when every episode is skipped", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow()]))
      .mockReturnValueOnce(selectChain([episodeRow({ id: 1, motionPromptPack: null })]));

    const result = await router.assembleSeasonVideos({ ctx: ctx(), input: { seriesId: "10" } });

    expect(result.submitted).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(mockQueueVerticalDramaFfmpegAssemblyJob).not.toHaveBeenCalled();
  });
});

describe("assembleSeasonVideos — shared dialogue audio + subtitle options", () => {
  it("resolves includeDialogueAudio=false to the resolver by default, even with a plan present", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow()]))
      .mockReturnValueOnce(selectChain([episodeRow({ id: 1 })]));

    await router.assembleSeasonVideos({ ctx: ctx(), input: { seriesId: "10" } });

    const call = vi.mocked(episodeVideoAssembly.resolveEpisodeDialogueAudioAndSubtitlesRunInputs).mock
      .calls[0]![0];
    expect(call.includeDialogueAudio).toBe(false);
  });

  it("resolves includeDialogueAudio=true only when BOTH options.includeDialogueAudio is set AND the voice-chain flag is on", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesVoiceChain: true });
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow()]))
      .mockReturnValueOnce(selectChain([episodeRow({ id: 1 })]));

    await router.assembleSeasonVideos({
      ctx: ctx(),
      input: { seriesId: "10", options: { includeDialogueAudio: true } },
    });

    const call = vi.mocked(episodeVideoAssembly.resolveEpisodeDialogueAudioAndSubtitlesRunInputs).mock
      .calls[0]![0];
    expect(call.includeDialogueAudio).toBe(true);
  });

  it("shares the SAME subtitlePreset/loudnessNormalize options across every episode's resolver call", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow()]))
      .mockReturnValueOnce(selectChain([episodeRow({ id: 1 }), episodeRow({ id: 2 })]));

    await router.assembleSeasonVideos({
      ctx: ctx(),
      input: { seriesId: "10", options: { subtitlePreset: "neon_glow", loudnessNormalize: true } },
    });

    const calls = vi.mocked(episodeVideoAssembly.resolveEpisodeDialogueAudioAndSubtitlesRunInputs).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]![0].subtitlePreset).toBe("neon_glow");
    expect(calls[1]![0].subtitlePreset).toBe("neon_glow");
    expect(calls[0]![0].loudnessNormalize).toBe(true);
    expect(calls[1]![0].loudnessNormalize).toBe(true);
  });

  it("uses each episode's OWN dialogueAudioPlan + motionPromptPack.clips for its own resolver call", async () => {
    const planA = { dialogueLines: [{ lineId: "a" }] };
    const planB = { dialogueLines: [{ lineId: "b" }] };
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow()])).mockReturnValueOnce(
      selectChain([
        episodeRow({
          id: 1,
          dialogueAudioPlan: planA,
          motionPromptPack: { clips: [{ clipNumber: 1, sourceShotNumbers: [1], durationSeconds: 8 }] },
        }),
        episodeRow({
          id: 2,
          dialogueAudioPlan: planB,
          motionPromptPack: { clips: [{ clipNumber: 1, sourceShotNumbers: [1], durationSeconds: 6 }] },
        }),
      ])
    );

    await router.assembleSeasonVideos({ ctx: ctx(), input: { seriesId: "10" } });

    const calls = vi.mocked(episodeVideoAssembly.resolveEpisodeDialogueAudioAndSubtitlesRunInputs).mock.calls;
    expect(calls[0]![0].plan).toEqual(planA);
    expect(calls[0]![0].motionClips).toEqual([{ clipNumber: 1, sourceShotNumbers: [1], durationSeconds: 8 }]);
    expect(calls[1]![0].plan).toEqual(planB);
    expect(calls[1]![0].motionClips).toEqual([{ clipNumber: 1, sourceShotNumbers: [1], durationSeconds: 6 }]);
  });

  it("sums dialogueAudioSegmentsIncluded/subtitleLinesIncluded across every submitted episode", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow()]))
      .mockReturnValueOnce(selectChain([episodeRow({ id: 1 }), episodeRow({ id: 2 })]));

    vi.mocked(episodeVideoAssembly.resolveEpisodeDialogueAudioAndSubtitlesRunInputs)
      .mockReturnValueOnce({ dialogueAudioSegmentsIncluded: 3, subtitleLinesIncluded: 5 })
      .mockReturnValueOnce({ dialogueAudioSegmentsIncluded: 2, subtitleLinesIncluded: 4 });

    const result = await router.assembleSeasonVideos({ ctx: ctx(), input: { seriesId: "10" } });

    expect(result.dialogueAudioSegmentsIncluded).toBe(5);
    expect(result.subtitleLinesIncluded).toBe(9);
  });
});

describe("assembleSeasonVideos — submission shape (no ad banners in this wave)", () => {
  it("enqueues one vertical_drama_ffmpeg_assembly job per episode, WITHOUT a banners key in renderFeed (ad banners are out of scope for the season batch mutation)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow()]))
      .mockReturnValueOnce(selectChain([episodeRow({ id: 1 })]));

    await router.assembleSeasonVideos({ ctx: ctx(), input: { seriesId: "10" } });

    expect(mockQueueVerticalDramaFfmpegAssemblyJob).toHaveBeenCalledTimes(1);
    const [call] = mockQueueVerticalDramaFfmpegAssemblyJob.mock.calls.map(c => c[0] as any);
    expect(call.kind).toBe("season_sub_episode");
    expect(call.renderFeed.banners).toBeUndefined();
    expect(call.renderFeed.owner).toEqual({
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      episodeId: 1,
    });
    expect(call.owner).toEqual({
      tenantId: "tenant-1",
      userId: "42",
      seriesId: "10",
      episodeId: "1",
    });
  });

  it("builds each episode's filename via compiledVideoFilename with the series title + that episode's number", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow({ title: "Midnight Vows" })]))
      .mockReturnValueOnce(selectChain([episodeRow({ id: 7, episodeNumber: 3 })]));

    await router.assembleSeasonVideos({ ctx: ctx(), input: { seriesId: "10" } });

    expect(episodeVideoAssembly.compiledVideoFilename).toHaveBeenCalledWith(
      expect.objectContaining({ seriesId: 10, episodeNumber: 3, seriesTitle: "Midnight Vows" })
    );
  });

  it("returns {episodeId, jobId} pairs (as strings) from the enqueued worker jobs", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow()]))
      .mockReturnValueOnce(selectChain([episodeRow({ id: 1 }), episodeRow({ id: 2 })]));

    const result = await router.assembleSeasonVideos({ ctx: ctx(), input: { seriesId: "10" } });

    expect(result.submitted).toEqual([
      { episodeId: "1", jobId: "job-1" },
      { episodeId: "2", jobId: "job-2" },
    ]);
  });
});
