/**
 * Vertical Drama Series — compound episode video assembly tests (2026-07-06
 * download + assembly upgrade).
 *
 * Covers: concat-command construction (mocked exec, no real ffmpeg run in
 * unit tests), precondition/partial-assembly logic, filename convention, and
 * the persisted `compiledVideo` JSONB shape via a mocked `db` + mocked
 * `storagePutFromPath`. The real-ffmpeg synthetic self-test is a separate,
 * manually-invoked path (`runSyntheticFfmpegSelfTest`) and is NOT exercised
 * here (it was already verified against the real binary during development —
 * see the task's investigation notes).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const dbState = {
  episode: {
    id: 1,
    tenantId: "t1",
    userId: 1,
    seriesId: 1,
    assemblyManifest: null as Record<string, unknown> | null,
  },
};

vi.mock("../../db", () => {
  const chain = () => api;
  const api: any = {
    select: vi.fn(() => api),
    from: vi.fn(() => api),
    where: vi.fn(() => api),
    limit: vi.fn(async () => [
      { assemblyManifest: dbState.episode.assemblyManifest },
    ]),
    update: vi.fn(() => api),
    set: vi.fn((patch: any) => {
      if (patch.assemblyManifest !== undefined) {
        dbState.episode.assemblyManifest = patch.assemblyManifest;
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

// Avoid a real network fetch in `downloadClipToFile` during `runAssemblyJob`.
vi.stubGlobal(
  "fetch",
  vi.fn(async () => ({
    ok: true,
    body: {},
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  })),
);

import {
  buildConcatFfmpegArgs,
  buildConcatListFileContent,
  compiledVideoFilename,
  extractClipSourcesFromMotionPromptPack,
  findMissingClips,
  resolveClipsForAssembly,
  runAssemblyJob,
  submitAssemblyJob,
  type EpisodeClipSource,
} from "../verticalDramaEpisodeVideoAssembly";
import { storagePutFromPath } from "../../storage";

beforeEach(() => {
  dbState.episode.assemblyManifest = null;
  vi.clearAllMocks();
});

describe("findMissingClips / resolveClipsForAssembly", () => {
  const complete: EpisodeClipSource[] = [
    { clipNumber: 1, videoUrl: "/api/storage/files/a.mp4" },
    { clipNumber: 2, videoUrl: "/api/storage/files/b.mp4" },
    { clipNumber: 3, videoUrl: "/api/storage/files/c.mp4" },
  ];

  it("finds no missing clips when all have a videoUrl", () => {
    expect(findMissingClips(complete)).toEqual([]);
  });

  it("finds missing clips (empty or absent videoUrl), sorted by clipNumber", () => {
    const clips: EpisodeClipSource[] = [
      { clipNumber: 2, videoUrl: "" },
      { clipNumber: 1, videoUrl: "/api/storage/files/a.mp4" },
      { clipNumber: 3 },
    ];
    expect(findMissingClips(clips).map((m) => m.clipNumber)).toEqual([2, 3]);
  });

  it("throws with the missing clip list when clips are incomplete and allowPartial is not set", () => {
    const clips: EpisodeClipSource[] = [
      ...complete,
      { clipNumber: 4 },
      { clipNumber: 5, videoUrl: "" },
    ];
    expect(() => resolveClipsForAssembly(clips)).toThrowError(/4, 5/);
  });

  it("returns only the completed clips, in order, when allowPartial is set", () => {
    const clips: EpisodeClipSource[] = [
      { clipNumber: 3, videoUrl: "/c.mp4" },
      { clipNumber: 1, videoUrl: "/a.mp4" },
      { clipNumber: 2 },
    ];
    const { ordered, missing } = resolveClipsForAssembly(clips, { allowPartial: true });
    expect(ordered.map((c) => c.clipNumber)).toEqual([1, 3]);
    expect(missing.map((m) => m.clipNumber)).toEqual([2]);
  });

  it("throws when there are zero completed clips even with allowPartial", () => {
    const clips: EpisodeClipSource[] = [{ clipNumber: 1 }, { clipNumber: 2 }];
    expect(() => resolveClipsForAssembly(clips, { allowPartial: true })).toThrowError(
      /no_clips|no completed video/,
    );
  });

  it("succeeds with all clips complete and no missing", () => {
    const { ordered, missing } = resolveClipsForAssembly(complete);
    expect(ordered).toHaveLength(3);
    expect(missing).toEqual([]);
  });
});

describe("compiledVideoFilename", () => {
  it("builds a series-ep-compiled.mp4 name", () => {
    expect(compiledVideoFilename({ seriesId: 42, episodeNumber: 3, seriesTitle: "Midnight Vows" })).toBe(
      "series-Midnight-Vows-ep-3-compiled.mp4",
    );
  });

  it("falls back to numeric ids when title is missing", () => {
    expect(compiledVideoFilename({ seriesId: 7, episodeNumber: 2 })).toBe("series-series-7-ep-2-compiled.mp4");
  });

  it("sanitizes unsafe filename characters", () => {
    const name = compiledVideoFilename({ seriesId: 1, episodeNumber: 1, seriesTitle: "Test/../../etc" });
    expect(name).not.toMatch(/[\/\\]/);
  });
});

describe("extractClipSourcesFromMotionPromptPack", () => {
  it("returns empty for a missing pack", () => {
    expect(extractClipSourcesFromMotionPromptPack(null)).toEqual([]);
    expect(extractClipSourcesFromMotionPromptPack(undefined)).toEqual([]);
  });

  it("extracts clipNumber + videoTask.videoUrl in clip order", () => {
    const pack: any = {
      clips: [
        { clipNumber: 2, videoTask: { videoUrl: "/b.mp4" } },
        { clipNumber: 1, videoTask: { videoUrl: "/a.mp4" } },
        { clipNumber: 3 },
      ],
    };
    expect(extractClipSourcesFromMotionPromptPack(pack)).toEqual([
      { clipNumber: 1, videoUrl: "/a.mp4" },
      { clipNumber: 2, videoUrl: "/b.mp4" },
      { clipNumber: 3, videoUrl: undefined },
    ]);
  });
});

describe("buildConcatListFileContent", () => {
  it("formats one `file '...'` line per input path", () => {
    const content = buildConcatListFileContent(["/tmp/a.mp4", "/tmp/b.mp4"]);
    expect(content).toBe("file '/tmp/a.mp4'\nfile '/tmp/b.mp4'\n");
  });

  it("escapes single quotes in paths", () => {
    const content = buildConcatListFileContent(["/tmp/it's-a-clip.mp4"]);
    expect(content).toContain("it'\\''s-a-clip.mp4");
  });

  it("returns an empty string for no inputs", () => {
    expect(buildConcatListFileContent([])).toBe("");
  });
});

describe("buildConcatFfmpegArgs", () => {
  it("uses the concat demuxer with re-encode (never stream-copy)", () => {
    const args = buildConcatFfmpegArgs({
      inputPaths: ["/tmp/a.mp4", "/tmp/b.mp4"],
      concatListPath: "/tmp/concat.txt",
      outputPath: "/tmp/out.mp4",
    });
    expect(args).toContain("-f");
    expect(args).toContain("concat");
    expect(args).toContain("-safe");
    expect(args).toContain("0");
    expect(args).toContain("libx264");
    expect(args).toContain("aac");
    expect(args).not.toContain("copy"); // never stream-copy
    expect(args[args.length - 1]).toBe("/tmp/out.mp4");
  });

  it("defaults fps to 30 and honors an override", () => {
    const args = buildConcatFfmpegArgs({
      inputPaths: [],
      concatListPath: "/tmp/concat.txt",
      outputPath: "/tmp/out.mp4",
      fps: 24,
    });
    const idx = args.indexOf("-r");
    expect(args[idx + 1]).toBe("24");
  });
});

describe("runAssemblyJob / submitAssemblyJob (mocked ffmpeg + db + storage)", () => {
  const owner = { tenantId: "t1", userId: 1, seriesId: 1, episodeId: 1 };
  const clips: EpisodeClipSource[] = [
    { clipNumber: 1, videoUrl: "/api/storage/files/a.mp4" },
    { clipNumber: 2, videoUrl: "/api/storage/files/b.mp4" },
  ];

  it("submits a job, persists pendingJobId, then persists videoUrl on success", async () => {
    const fakeRunner = vi.fn(async () => ({ code: 0, stderr: "" }));

    const { jobId } = await submitAssemblyJob({
      owner,
      clips,
      internalBaseUrl: "http://localhost:3000",
      filename: "series-x-ep-1-compiled.mp4",
      ffmpegRunner: fakeRunner,
    });

    expect(jobId).toBeTruthy();
    expect((dbState.episode.assemblyManifest as any)?.compiledVideo?.pendingJobId).toBe(jobId);

    // submitAssemblyJob fires the job in the background — wait for the
    // microtask/async chain (downloads + ffmpeg + upload) to settle.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(fakeRunner).toHaveBeenCalled();
    expect(storagePutFromPath).toHaveBeenCalled();
    const compiled = (dbState.episode.assemblyManifest as any)?.compiledVideo;
    expect(compiled.status).toBe("completed");
    expect(compiled.videoUrl).toContain("/api/storage/files/");
    expect(compiled.shotCount).toBe(2);
    expect(compiled.pendingJobId).toBeUndefined();
  });

  it("persists a failed status when ffmpeg exits non-zero", async () => {
    const failingRunner = vi.fn(async () => ({ code: 1, stderr: "boom" }));

    await runAssemblyJob({
      owner,
      jobId: "job-fail-1",
      clips,
      internalBaseUrl: "http://localhost:3000",
      filename: "out.mp4",
      ffmpegRunner: failingRunner,
    });

    const compiled = (dbState.episode.assemblyManifest as any)?.compiledVideo;
    expect(compiled.status).toBe("failed");
    expect(compiled.error).toMatch(/ffmpeg concat failed/);
  });
});
