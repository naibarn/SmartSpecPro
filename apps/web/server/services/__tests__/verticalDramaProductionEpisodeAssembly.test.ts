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
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const dbState = {
  episodes: [] as Array<{ episodeNumber: number; assemblyManifest: unknown }>,
  productionEpisodesManifest: null as unknown,
};

vi.mock("../../db", () => {
  const api: any = {
    select: vi.fn(() => api),
    from: vi.fn(() => api),
    where: vi.fn(() => api),
    // Only the Sub-Episodes query (`verticalDramaEpisodes`) ends in
    // `.orderBy(...)` in this service — safe to resolve unconditionally.
    orderBy: vi.fn(async () => dbState.episodes),
    // Only the series `productionEpisodesManifest` load ends in `.limit(1)`.
    limit: vi.fn(async () => [
      { productionEpisodesManifest: dbState.productionEpisodesManifest },
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
  type ProductionEpisodeSourceSubEpisode,
} from "../verticalDramaProductionEpisodeAssembly";
import { storagePutFromPath } from "../../storage";
import type { VerticalDramaProductionEpisodesManifest } from "@shared/verticalDramaSeries/assembly";

beforeEach(() => {
  dbState.episodes = [];
  dbState.productionEpisodesManifest = null;
  vi.clearAllMocks();
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

function completedManifest(): VerticalDramaProductionEpisodesManifest | null {
  return dbState.productionEpisodesManifest as VerticalDramaProductionEpisodesManifest | null;
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
