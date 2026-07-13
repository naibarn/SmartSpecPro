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
});

/** Poll-until-settled helper — mirrors `verticalDramaEpisodeVideoAssembly.test.ts`'s
 *  own helper for waiting on a fire-and-forget background chain. */
async function waitForCondition(
  predicate: () => boolean,
  opts: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 2000;
  const intervalMs = opts.intervalMs ?? 5;
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`waitForCondition: condition not met within ${timeoutMs}ms`);
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

function completedManifest(): ProductionEpisodesManifestWithBgm | null {
  return dbState.productionEpisodesManifest as ProductionEpisodesManifestWithBgm | null;
}

function allGroupsSettled(): boolean {
  const manifest = completedManifest();
  if (!manifest) return false;
  return manifest.episodes.every(e => e.status === "completed" || e.status === "failed");
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

describe("assembleProductionEpisodesForSeries (mocked ffmpeg + db + storage)", () => {
  const owner = { tenantId: "t1", userId: 1, seriesId: 7 };
  const fakeFfmpegRunner = vi.fn(async () => ({ code: 0, stderr: "" }));
  const fakeProbeDurationSeconds = vi.fn(async () => 42);

  beforeEach(() => {
    fakeFfmpegRunner.mockClear();
    fakeProbeDurationSeconds.mockClear();
  });

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
        ffmpegRunner: fakeFfmpegRunner,
        probeDurationSecondsFn: fakeProbeDurationSeconds,
      })
    ).rejects.toThrowError(/vertical_drama_production_no_subepisodes/);
  });

  it("throws when a sub-episode is missing a compiled video and allowPartial is not set", async () => {
    seedCompiledEpisodes([1, 2]);
    dbState.episodes.push({ episodeNumber: 3, assemblyManifest: null });

    await expect(
      assembleProductionEpisodesForSeries({
        ...owner,
        groupSize: 5,
        internalBaseUrl: "http://localhost:3000",
        ffmpegRunner: fakeFfmpegRunner,
        probeDurationSecondsFn: fakeProbeDurationSeconds,
      })
    ).rejects.toThrowError(/vertical_drama_production_missing_subepisodes.*\b3\b/);

    // No ffmpeg work and no manifest persisted — the precondition check runs
    // before any group is planned or written.
    expect(fakeFfmpegRunner).not.toHaveBeenCalled();
    expect(dbState.productionEpisodesManifest).toBeNull();
  });

  it("chunks + persists a pending manifest synchronously, then completes each group in the background", async () => {
    seedCompiledEpisodes([1, 2, 3, 4, 5, 6, 7]);

    const result = await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      seriesTitle: "Test Series",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
    });

    expect(result.groupsCreated).toBe(2);
    expect(result.groupsSkipped).toBe(0);
    expect(result.manifest.groupSize).toBe(5);
    expect(result.manifest.episodes.map(e => e.subEpisodeNumbers)).toEqual([
      [1, 2, 3, 4, 5],
      [6, 7],
    ]);
    // Persisted synchronously as "pending" before this function returned.
    expect(result.manifest.episodes.every(e => e.status === "pending")).toBe(true);
    expect(dbState.productionEpisodesManifest).toEqual(result.manifest);

    await waitForCondition(allGroupsSettled);

    const finalManifest = completedManifest()!;
    expect(finalManifest.episodes.map(e => e.status)).toEqual(["completed", "completed"]);
    expect(finalManifest.episodes[0].videoUrl).toMatch(/^\/api\/storage\/files\//);
    expect(finalManifest.episodes[0].durationSeconds).toBe(42);
    expect(fakeFfmpegRunner).toHaveBeenCalledTimes(2);
    expect(storagePutFromPath).toHaveBeenCalledTimes(2);
  });

  it("marks a group failed (without throwing) when its ffmpeg concat exits non-zero", async () => {
    seedCompiledEpisodes([1, 2, 3]);
    const failingRunner = vi.fn(async () => ({ code: 1, stderr: "boom" }));

    const result = await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      ffmpegRunner: failingRunner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
    });
    expect(result.groupsCreated).toBe(1);

    await waitForCondition(allGroupsSettled);

    const finalManifest = completedManifest()!;
    expect(finalManifest.episodes[0].status).toBe("failed");
    expect(finalManifest.episodes[0].error).toMatch(/ffmpeg production-episode concat failed/);
  });

  it("skips re-running an already-completed group with unchanged membership on a second call", async () => {
    seedCompiledEpisodes([1, 2, 3, 4, 5, 6]);

    const first = await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
    });
    expect(first.groupsCreated).toBe(2);
    await waitForCondition(allGroupsSettled);
    expect(fakeFfmpegRunner).toHaveBeenCalledTimes(2);

    // A new sub-episode 7 arrives; re-running should only assemble the NEW
    // trailing short group, reusing group 0's completed state untouched.
    fakeFfmpegRunner.mockClear();
    seedCompiledEpisodes([1, 2, 3, 4, 5, 6, 7]);

    const second = await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
    });
    expect(second.groupsCreated).toBe(1);
    expect(second.groupsSkipped).toBe(1);
    expect(second.manifest.episodes[0].status).toBe("completed"); // reused verbatim
    expect(second.manifest.episodes[1].status).toBe("pending"); // freshly (re)computed

    await waitForCondition(allGroupsSettled);
    expect(fakeFfmpegRunner).toHaveBeenCalledTimes(1);
  });
});

describe("assembleProductionEpisodesForSeries — Render-options LEVEL (renderOptions)", () => {
  const owner = { tenantId: "t1", userId: 1, seriesId: 7 };
  const fakeFfmpegRunner = vi.fn(async () => ({ code: 0, stderr: "" }));
  const fakeProbeDurationSeconds = vi.fn(async () => 42);

  beforeEach(() => {
    fakeFfmpegRunner.mockClear();
    fakeProbeDurationSeconds.mockClear();
  });

  /**
   * Seeds sub-episodes with the `id`/`motionPromptPack`/`dialogueAudioPlan`
   * fields a renderOptions-mode render step reads — these placeholder
   * values are never actually interpreted here (the render step itself is
   * always the INJECTED fake `renderSubEpisodeWithOptionsFn` below, never
   * the real `renderSubEpisodeWithOptions`), so their exact shape doesn't
   * matter beyond existing.
   */
  function seedRenderableEpisodes(episodeNumbers: number[]) {
    dbState.episodes = episodeNumbers.map(n => ({
      episodeNumber: n,
      id: n,
      assemblyManifest: {
        compiledVideo: { status: "completed", videoUrl: `/api/storage/files/sub-ep-${n}.mp4` },
      },
      motionPromptPack: { clips: [{ clipNumber: 1 }] },
      dialogueAudioPlan: null,
    }));
  }

  it("does not invoke the per-Sub-Episode render function when renderOptions is omitted (D′-1 default, unchanged)", async () => {
    seedRenderableEpisodes([1, 2, 3]);
    const renderFn = vi.fn(
      async (
        _args: RenderSubEpisodeWithOptionsArgs
      ): Promise<RenderSubEpisodeWithOptionsResult> => ({
        videoUrl: "/api/storage/files/should-not-be-called.mp4",
      })
    );

    await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
      renderSubEpisodeWithOptionsFn: renderFn,
    });

    await waitForCondition(allGroupsSettled);

    expect(renderFn).not.toHaveBeenCalled();
    const finalManifest = completedManifest()!;
    expect(finalManifest.episodes[0].status).toBe("completed");
    expect(finalManifest.episodes[0].renderOptions).toBeUndefined();
  });

  it("renders every Sub-Episode in a group WITH the given renderOptions before concatenating, and records renderOptions on the group state (pending AND completed)", async () => {
    seedRenderableEpisodes([1, 2, 3]);
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

    const result = await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
      renderSubEpisodeWithOptionsFn: renderFn,
      renderOptions,
    });

    // Persisted synchronously onto the "pending" group state, before the
    // background render/concat chain has necessarily run at all.
    expect(result.manifest.episodes[0].renderOptions).toEqual(renderOptions);

    await waitForCondition(allGroupsSettled);

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
    const finalManifest = completedManifest()!;
    expect(finalManifest.episodes[0].status).toBe("completed");
    expect(finalManifest.episodes[0].renderOptions).toEqual(renderOptions);
  });

  it("threads the voice-chain tenant flag and lazily resolves the series audience age rating only when showAgeBadge is requested", async () => {
    seedRenderableEpisodes([1]);
    dbState.bible = { audienceAgeRating: "13plus" };
    vi.mocked(getTenantFeatureFlags).mockResolvedValue({
      ...FEATURE_FLAG_DEFAULTS,
      verticalDramaSeriesVoiceChain: true,
    });
    const calls: RenderSubEpisodeWithOptionsArgs[] = [];
    const renderFn = vi.fn(
      async (
        args: RenderSubEpisodeWithOptionsArgs
      ): Promise<RenderSubEpisodeWithOptionsResult> => {
        calls.push(args);
        return { videoUrl: `/api/storage/files/rendered-${args.owner.episodeId}.mp4` };
      }
    );

    await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
      renderSubEpisodeWithOptionsFn: renderFn,
      renderOptions: { includeDialogueAudio: true, showAgeBadge: true },
    });

    await waitForCondition(allGroupsSettled);

    expect(renderFn).toHaveBeenCalledTimes(1);
    expect(calls[0].voiceChainEnabled).toBe(true);
    expect(calls[0].audienceAgeRating).toBe("13plus");
  });

  it("marks the whole group failed (without concatenating) when a per-Sub-Episode render fails", async () => {
    seedRenderableEpisodes([1, 2]);
    const renderFn = vi.fn(
      async (
        args: RenderSubEpisodeWithOptionsArgs
      ): Promise<RenderSubEpisodeWithOptionsResult> => {
        if (args.owner.episodeId === 2) throw new Error("boom: render failed");
        return { videoUrl: `/api/storage/files/rendered-${args.owner.episodeId}.mp4` };
      }
    );

    await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
      renderSubEpisodeWithOptionsFn: renderFn,
      renderOptions: { subtitlePreset: "none" },
    });

    await waitForCondition(allGroupsSettled);

    expect(fakeFfmpegRunner).not.toHaveBeenCalled();
    const finalManifest = completedManifest()!;
    expect(finalManifest.episodes[0].status).toBe("failed");
    expect(finalManifest.episodes[0].error).toMatch(/boom: render failed/);
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
describe("assembleProductionEpisodesForSeries — Phase B-1 (bgm)", () => {
  const owner = { tenantId: "t1", userId: 1, seriesId: 7 };
  const fakeFfmpegRunner = vi.fn(async () => ({ code: 0, stderr: "" }));
  const fakeProbeDurationSeconds = vi.fn(async () => 42);

  beforeEach(() => {
    fakeFfmpegRunner.mockClear();
    fakeProbeDurationSeconds.mockClear();
  });

  function seedCompiledEpisodes(episodeNumbers: number[]) {
    dbState.episodes = episodeNumbers.map(n => ({
      episodeNumber: n,
      assemblyManifest: {
        compiledVideo: { status: "completed", videoUrl: `/api/storage/files/sub-ep-${n}.mp4` },
      },
    }));
  }

  const bgm: ProductionEpisodeBgmOptions = {
    url: "/api/storage/files/track.mp3",
    volumePercent: 35,
    duckUnderVideoAudio: true,
  };

  it("does not run a second ffmpeg pass, and records no bgm on the group state, when bgm is omitted (default, unchanged)", async () => {
    seedCompiledEpisodes([1, 2, 3]);

    const result = await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
    });
    expect(result.manifest.episodes[0].bgm).toBeUndefined();

    await waitForCondition(allGroupsSettled);

    expect(fakeFfmpegRunner).toHaveBeenCalledTimes(1); // concat only, no bgm pass
    const finalManifest = completedManifest()!;
    expect(finalManifest.episodes[0].status).toBe("completed");
    expect(finalManifest.episodes[0].bgm).toBeUndefined();
  });

  it("runs a second bgm-mix ffmpeg pass after the concat, uploads ONLY its output, and records bgm on the group state (pending AND completed)", async () => {
    seedCompiledEpisodes([1, 2, 3]);

    const result = await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
      bgm,
    });
    // Recorded synchronously onto the "pending" group state, before the
    // background concat/bgm-mix chain has necessarily run at all.
    expect(result.manifest.episodes[0].bgm).toEqual(bgm);

    await waitForCondition(allGroupsSettled);

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

    const finalManifest = completedManifest()!;
    expect(finalManifest.episodes[0].status).toBe("completed");
    expect(finalManifest.episodes[0].videoUrl).toMatch(/^\/api\/storage\/files\//);
    expect(finalManifest.episodes[0].bgm).toEqual(bgm);
  });

  it("marks the group failed (without uploading) when the bgm-mix ffmpeg pass itself exits non-zero", async () => {
    seedCompiledEpisodes([1, 2, 3]);
    let call = 0;
    const runner = vi.fn(async () => {
      call += 1;
      return call === 1 ? { code: 0, stderr: "" } : { code: 1, stderr: "bgm boom" };
    });

    await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      ffmpegRunner: runner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
      bgm,
    });

    await waitForCondition(allGroupsSettled);

    expect(storagePutFromPath).not.toHaveBeenCalled();
    const finalManifest = completedManifest()!;
    expect(finalManifest.episodes[0].status).toBe("failed");
    expect(finalManifest.episodes[0].error).toMatch(/ffmpeg production-episode bgm mix failed/);
  });

  it("marks the group failed (without attempting the bgm pass) when the concat's own duration probe fails", async () => {
    seedCompiledEpisodes([1, 2, 3]);
    const probeFails = vi.fn(async () => undefined);

    await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: probeFails,
      bgm,
    });

    await waitForCondition(allGroupsSettled);

    expect(fakeFfmpegRunner).toHaveBeenCalledTimes(1); // concat only; bgm pass never attempted
    expect(storagePutFromPath).not.toHaveBeenCalled();
    const finalManifest = completedManifest()!;
    expect(finalManifest.episodes[0].status).toBe("failed");
    expect(finalManifest.episodes[0].error).toMatch(
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
describe("assembleProductionEpisodesForSeries — Phase C-1 (credits)", () => {
  const owner = { tenantId: "t1", userId: 1, seriesId: 7 };
  const fakeFfmpegRunner = vi.fn(async () => ({ code: 0, stderr: "" }));
  const fakeProbeDurationSeconds = vi.fn(async () => 42);

  beforeEach(() => {
    fakeFfmpegRunner.mockClear();
    fakeProbeDurationSeconds.mockClear();
  });

  function seedCompiledEpisodes(episodeNumbers: number[]) {
    dbState.episodes = episodeNumbers.map(n => ({
      episodeNumber: n,
      assemblyManifest: {
        compiledVideo: { status: "completed", videoUrl: `/api/storage/files/sub-ep-${n}.mp4` },
      },
    }));
  }

  const credits: ProductionEpisodeCreditsOptions = {
    text: "Jane Doe — Writer\nJohn Smith — Director",
  };

  const bgm: ProductionEpisodeBgmOptions = {
    url: "/api/storage/files/track.mp3",
    volumePercent: 35,
    duckUnderVideoAudio: true,
  };

  it("does not run an extra ffmpeg pass, and records no credits on the group state, when credits is omitted (default, unchanged)", async () => {
    seedCompiledEpisodes([1, 2, 3]);

    const result = await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
    });
    expect(result.manifest.episodes[0].credits).toBeUndefined();

    await waitForCondition(allGroupsSettled);

    expect(fakeFfmpegRunner).toHaveBeenCalledTimes(1); // concat only, no credits pass
    const finalManifest = completedManifest()!;
    expect(finalManifest.episodes[0].status).toBe("completed");
    expect(finalManifest.episodes[0].credits).toBeUndefined();
  });

  it("runs a second credits-burn ffmpeg pass after the concat, uploads ONLY its output, and records credits on the group state (pending AND completed)", async () => {
    seedCompiledEpisodes([1, 2, 3]);

    const result = await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
      credits,
    });
    // Recorded synchronously onto the "pending" group state, before the
    // background concat/credits-burn chain has necessarily run at all.
    expect(result.manifest.episodes[0].credits).toEqual(credits);

    await waitForCondition(allGroupsSettled);

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

    const finalManifest = completedManifest()!;
    expect(finalManifest.episodes[0].status).toBe("completed");
    expect(finalManifest.episodes[0].videoUrl).toMatch(/^\/api\/storage\/files\//);
    expect(finalManifest.episodes[0].credits).toEqual(credits);
  });

  it("burns credits onto the BGM-mixed output (not the raw concat output) when both bgm and credits are supplied — three passes, in order", async () => {
    seedCompiledEpisodes([1, 2, 3]);

    await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
      bgm,
      credits,
    });

    await waitForCondition(allGroupsSettled);

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

    const finalManifest = completedManifest()!;
    expect(finalManifest.episodes[0].status).toBe("completed");
    expect(finalManifest.episodes[0].bgm).toEqual(bgm);
    expect(finalManifest.episodes[0].credits).toEqual(credits);
  });

  it("marks the group failed (without uploading) when the credits-burn ffmpeg pass itself exits non-zero", async () => {
    seedCompiledEpisodes([1, 2, 3]);
    let call = 0;
    const runner = vi.fn(async () => {
      call += 1;
      return call === 1 ? { code: 0, stderr: "" } : { code: 1, stderr: "credits boom" };
    });

    await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      ffmpegRunner: runner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
      credits,
    });

    await waitForCondition(allGroupsSettled);

    expect(storagePutFromPath).not.toHaveBeenCalled();
    const finalManifest = completedManifest()!;
    expect(finalManifest.episodes[0].status).toBe("failed");
    expect(finalManifest.episodes[0].error).toMatch(
      /ffmpeg production-episode credits burn failed/
    );
  });

  it("marks the group failed (without attempting the credits pass) when the concat's own duration probe fails", async () => {
    seedCompiledEpisodes([1, 2, 3]);
    const probeFails = vi.fn(async () => undefined);

    await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: probeFails,
      credits,
    });

    await waitForCondition(allGroupsSettled);

    expect(fakeFfmpegRunner).toHaveBeenCalledTimes(1); // concat only; credits pass never attempted
    expect(storagePutFromPath).not.toHaveBeenCalled();
    const finalManifest = completedManifest()!;
    expect(finalManifest.episodes[0].status).toBe("failed");
    expect(finalManifest.episodes[0].error).toMatch(
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
describe("assembleProductionEpisodesForSeries — Phase C-2 (overlays)", () => {
  const owner = { tenantId: "t1", userId: 1, seriesId: 7 };
  const fakeFfmpegRunner = vi.fn(async () => ({ code: 0, stderr: "" }));
  const fakeProbeDurationSeconds = vi.fn(async () => 42);

  beforeEach(() => {
    fakeFfmpegRunner.mockClear();
    fakeProbeDurationSeconds.mockClear();
  });

  function seedCompiledEpisodes(episodeNumbers: number[]) {
    dbState.episodes = episodeNumbers.map(n => ({
      episodeNumber: n,
      assemblyManifest: {
        compiledVideo: { status: "completed", videoUrl: `/api/storage/files/sub-ep-${n}.mp4` },
      },
    }));
  }

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

  it("does not run an extra ffmpeg pass, and records no overlays on the group state, when overlays is omitted (default, unchanged)", async () => {
    seedCompiledEpisodes([1, 2, 3]);

    const result = await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
    });
    expect(result.manifest.episodes[0].overlays).toBeUndefined();

    await waitForCondition(allGroupsSettled);

    expect(fakeFfmpegRunner).toHaveBeenCalledTimes(1); // concat only, no overlays pass
    const finalManifest = completedManifest()!;
    expect(finalManifest.episodes[0].status).toBe("completed");
    expect(finalManifest.episodes[0].overlays).toBeUndefined();
  });

  it("does not run an extra ffmpeg pass, and records no overlays on the group state, when overlays is an EMPTY array (same as omitted)", async () => {
    seedCompiledEpisodes([1, 2, 3]);

    const result = await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
      overlays: [],
    });
    expect(result.manifest.episodes[0].overlays).toBeUndefined();

    await waitForCondition(allGroupsSettled);

    expect(fakeFfmpegRunner).toHaveBeenCalledTimes(1); // concat only, no overlays pass
    const finalManifest = completedManifest()!;
    expect(finalManifest.episodes[0].status).toBe("completed");
    expect(finalManifest.episodes[0].overlays).toBeUndefined();
  });

  it("runs a second overlays-burn ffmpeg pass after the concat, uploads ONLY its output, and records overlays on the group state (pending AND completed), when overlays is supplied WITHOUT credits", async () => {
    seedCompiledEpisodes([1, 2, 3]);

    const result = await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
      overlays,
    });
    // Recorded synchronously onto the "pending" group state, before the
    // background concat/overlays-burn chain has necessarily run at all.
    expect(result.manifest.episodes[0].overlays).toEqual(overlays);

    await waitForCondition(allGroupsSettled);

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

    const finalManifest = completedManifest()!;
    expect(finalManifest.episodes[0].status).toBe("completed");
    expect(finalManifest.episodes[0].videoUrl).toMatch(/^\/api\/storage\/files\//);
    expect(finalManifest.episodes[0].overlays).toEqual(overlays);
  });

  it("FOLDS overlays + credits into ONE additional ffmpeg pass (not two) when both are supplied for the same call", async () => {
    seedCompiledEpisodes([1, 2, 3]);

    const result = await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
      overlays,
      credits,
    });
    expect(result.manifest.episodes[0].overlays).toEqual(overlays);
    expect(result.manifest.episodes[0].credits).toEqual(credits);

    await waitForCondition(allGroupsSettled);

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

    const finalManifest = completedManifest()!;
    expect(finalManifest.episodes[0].status).toBe("completed");
    expect(finalManifest.episodes[0].overlays).toEqual(overlays);
    expect(finalManifest.episodes[0].credits).toEqual(credits);
  });

  it("still uses the ORIGINAL single-pass credits-only code path (Phase C-1, untouched) when credits is supplied WITHOUT overlays", async () => {
    seedCompiledEpisodes([1, 2, 3]);

    await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
      credits,
    });

    await waitForCondition(allGroupsSettled);

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
    seedCompiledEpisodes([1, 2, 3]);

    await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
      bgm,
      overlays,
      credits,
    });

    await waitForCondition(allGroupsSettled);

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

    const finalManifest = completedManifest()!;
    expect(finalManifest.episodes[0].status).toBe("completed");
    expect(finalManifest.episodes[0].bgm).toEqual(bgm);
    expect(finalManifest.episodes[0].overlays).toEqual(overlays);
    expect(finalManifest.episodes[0].credits).toEqual(credits);
  });

  it("marks the group failed (without uploading) when the overlays-only burn ffmpeg pass exits non-zero", async () => {
    seedCompiledEpisodes([1, 2, 3]);
    let call = 0;
    const runner = vi.fn(async () => {
      call += 1;
      return call === 1 ? { code: 0, stderr: "" } : { code: 1, stderr: "overlays boom" };
    });

    await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      ffmpegRunner: runner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
      overlays,
    });

    await waitForCondition(allGroupsSettled);

    expect(storagePutFromPath).not.toHaveBeenCalled();
    const finalManifest = completedManifest()!;
    expect(finalManifest.episodes[0].status).toBe("failed");
    expect(finalManifest.episodes[0].error).toMatch(
      /ffmpeg production-episode overlays burn failed/
    );
  });

  it("marks the group failed (without uploading) when the COMBINED overlays+credits burn ffmpeg pass exits non-zero", async () => {
    seedCompiledEpisodes([1, 2, 3]);
    let call = 0;
    const runner = vi.fn(async () => {
      call += 1;
      return call === 1 ? { code: 0, stderr: "" } : { code: 1, stderr: "combined boom" };
    });

    await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      ffmpegRunner: runner,
      probeDurationSecondsFn: fakeProbeDurationSeconds,
      overlays,
      credits,
    });

    await waitForCondition(allGroupsSettled);

    expect(storagePutFromPath).not.toHaveBeenCalled();
    const finalManifest = completedManifest()!;
    expect(finalManifest.episodes[0].status).toBe("failed");
    expect(finalManifest.episodes[0].error).toMatch(
      /ffmpeg production-episode overlays\/credits burn failed/
    );
  });

  it("marks the group failed (without attempting the overlays pass) when the concat's own duration probe fails", async () => {
    seedCompiledEpisodes([1, 2, 3]);
    const probeFails = vi.fn(async () => undefined);

    await assembleProductionEpisodesForSeries({
      ...owner,
      groupSize: 5,
      internalBaseUrl: "http://localhost:3000",
      ffmpegRunner: fakeFfmpegRunner,
      probeDurationSecondsFn: probeFails,
      overlays,
    });

    await waitForCondition(allGroupsSettled);

    expect(fakeFfmpegRunner).toHaveBeenCalledTimes(1); // concat only; overlays pass never attempted
    expect(storagePutFromPath).not.toHaveBeenCalled();
    const finalManifest = completedManifest()!;
    expect(finalManifest.episodes[0].status).toBe("failed");
    expect(finalManifest.episodes[0].error).toMatch(
      /vertical_drama_production_overlays_duration_probe_failed/
    );
  });
});
