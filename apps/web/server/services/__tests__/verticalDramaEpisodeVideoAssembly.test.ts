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
import fsp from "fs/promises";
import path from "path";
import { Readable } from "stream";

const storageStreamFileMock = vi.hoisted(() => vi.fn());

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
  assertR2StorageActive: vi.fn(),
  storagePutFromPath: vi.fn(async (key: string) => ({
    key,
    url: `/api/storage/files/${key}`,
  })),
  storageStreamFile: storageStreamFileMock,
}));

// Avoid a real network fetch in `downloadClipToFile` during `runAssemblyJob`.
vi.stubGlobal(
  "fetch",
  vi.fn(async () => ({
    ok: true,
    body: {},
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  }))
);

import {
  buildConcatFfmpegArgs,
  buildConcatListFileContent,
  compiledVideoFilename,
  extractClipSourcesFromMotionPromptPack,
  extractVerticalDramaManagedStorageKey,
  buildVerticalDramaStorageProxyUrl,
  downloadClipToFile,
  repairVerticalDramaVideoAssetUrls,
  normalizeVerticalDramaStoredAssetUrl,
  findMissingClips,
  mergeVideoTaskIntoMotionPromptPack,
  getJobStatus,
  resolveClipsForAssembly,
  resolveEpisodeDialogueAudioAndSubtitlesRunInputs,
  resolveEpisodeTextOverlayAnchoredEvents,
  resolveEpisodeTextOverlayRunInputs,
  runAssemblyJob,
  submitAssemblyJob,
  submitSequentialAssemblyJobs,
  type EpisodeClipSource,
} from "../verticalDramaEpisodeVideoAssembly";
import { storagePutFromPath } from "../../storage";
import type { VerticalDramaDialogueAudioPlan } from "@shared/verticalDramaSeries/audio";
import type { VdDialogueTimelineClip } from "@shared/verticalDramaSeries/dialogueAudioTimeline";

beforeEach(() => {
  dbState.episode.assemblyManifest = null;
  vi.clearAllMocks();
  storageStreamFileMock.mockResolvedValue(null);
});

/**
 * Poll-until-settled helper (task #25 flake fix — see the "flake fix" note on
 * the fire-and-forget test below for the root cause this replaces). Waits for
 * `predicate` to become true, checking every `intervalMs`, up to a generous
 * `timeoutMs` ceiling — deterministic-by-design (waits exactly as long as
 * needed) instead of gambling on a fixed sleep duration.
 */
async function waitForCondition(
  predicate: () => boolean,
  opts: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 2000;
  const intervalMs = opts.intervalMs ?? 5;
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(
        `waitForCondition: condition not met within ${timeoutMs}ms`
      );
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

/** Manually-resolvable promise — used by the `submitSequentialAssemblyJobs`
 *  tests below to prove episode N+1's ffmpeg call is never made until
 *  episode N's call has settled. */
function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

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
    expect(findMissingClips(clips).map(m => m.clipNumber)).toEqual([2, 3]);
  });

  it("uses clip-derived canonical fallback for legacy split clips", () => {
    const result = resolveClipsForAssembly([
        {
          clipNumber: 301,
          parentShotNumber: 3,
          subShotNumber: 1,
          sourceShotNumbers: [3],
        },
        {
          clipNumber: 302,
          parentShotNumber: 3,
          subShotNumber: 2,
          sourceShotNumbers: [3],
          videoUrl: "/302.mp4",
        },
      ]);

    expect(result.ordered.map(clip => clip.clipNumber)).toEqual([302]);
    expect(result.missing).toEqual([]);
  });

  it("treats a completed legacy sibling as canonical-shot readiness", () => {
    const { ordered, missing } = resolveClipsForAssembly(
      [
        { clipNumber: 1, sourceShotNumbers: [1], videoUrl: "/1.mp4" },
        {
          clipNumber: 301,
          parentShotNumber: 3,
          subShotNumber: 1,
          sourceShotNumbers: [3],
        },
        {
          clipNumber: 302,
          parentShotNumber: 3,
          subShotNumber: 2,
          sourceShotNumbers: [3],
          videoUrl: "/302.mp4",
        },
        { clipNumber: 4, sourceShotNumbers: [4], videoUrl: "/4.mp4" },
      ],
      { storyboardShotNumbers: [1, 3, 4] },
    );

    expect(ordered.map(clip => clip.clipNumber)).toEqual([1, 302, 4]);
    expect(missing).toEqual([]);
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
    const { ordered, missing } = resolveClipsForAssembly(clips, {
      allowPartial: true,
    });
    expect(ordered.map(c => c.clipNumber)).toEqual([1, 3]);
    expect(missing.map(m => m.clipNumber)).toEqual([2]);
  });

  it("uses canonical partial assembly with clip-derived fallback", () => {
    const { ordered, missing } = resolveClipsForAssembly(
      [
        { clipNumber: 1, sourceShotNumbers: [1], videoUrl: "/1.mp4" },
        {
          clipNumber: 301,
          parentShotNumber: 3,
          subShotNumber: 1,
          sourceShotNumbers: [3],
        },
        { clipNumber: 4, sourceShotNumbers: [4], videoUrl: "/4.mp4" },
      ],
      { allowPartial: true },
    );

    expect(ordered.map(clip => clip.clipNumber)).toEqual([1, 4]);
    expect(missing.map(item => item.clipNumber)).toEqual([3]);
  });

  it("throws when there are zero completed clips even with allowPartial", () => {
    const clips: EpisodeClipSource[] = [{ clipNumber: 1 }, { clipNumber: 2 }];
    expect(() =>
      resolveClipsForAssembly(clips, { allowPartial: true })
    ).toThrowError(/no_clips|no completed video/);
  });

  it("succeeds with all clips complete and no missing", () => {
    const { ordered, missing } = resolveClipsForAssembly(complete);
    expect(ordered).toHaveLength(3);
    expect(missing).toEqual([]);
  });
});

describe("mergeVideoTaskIntoMotionPromptPack", () => {
  it("merges sibling clip completions without dropping the first task", () => {
    const pack: any = {
      clips: [
        {
          clipNumber: 301,
          sourceShotNumbers: [3],
          parentShotNumber: 3,
          subShotNumber: 1,
        },
        {
          clipNumber: 302,
          sourceShotNumbers: [3],
          parentShotNumber: 3,
          subShotNumber: 2,
        },
      ],
      warnings: [],
    };

    const withFirstCompletion = mergeVideoTaskIntoMotionPromptPack(
      pack,
      301,
      { videoUrl: "/301.mp4", mediaTaskId: "task-301" }
    );
    const withBothCompletions = mergeVideoTaskIntoMotionPromptPack(
      withFirstCompletion,
      302,
      { videoUrl: "/302.mp4", mediaTaskId: "task-302" }
    );

    expect(
      withBothCompletions?.clips.map(clip => clip.videoTask?.videoUrl)
    ).toEqual(["/301.mp4", "/302.mp4"]);
  });

  it("persists worker-artifact clips through the durable storage proxy", () => {
    const pack: any = { clips: [{ clipNumber: 3 }], warnings: [] };
    const merged = mergeVideoTaskIntoMotionPromptPack(pack, 3, {
      videoUrl:
        "https://r2.example.test/smartspec/worker-artifacts/tenant/job/clip.mp4?X-Amz-Signature=secret",
    });
    expect(merged?.clips[0].videoTask?.videoUrl).toBe(
      "/api/storage/files/worker-artifacts/tenant/job/clip.mp4"
    );
  });

  it("does not create a phantom clip when a late failed poll clears an unknown id", () => {
    const pack: any = { clips: [{ clipNumber: 1 }], warnings: [] };
    expect(mergeVideoTaskIntoMotionPromptPack(pack, 301, null)).toBe(pack);
  });
});

describe("compiledVideoFilename", () => {
  it("builds a series-ep-compiled.mp4 name", () => {
    expect(
      compiledVideoFilename({
        seriesId: 42,
        episodeNumber: 3,
        seriesTitle: "Midnight Vows",
      })
    ).toBe("series-Midnight-Vows-ep-3-compiled.mp4");
  });

  it("falls back to numeric ids when title is missing", () => {
    expect(compiledVideoFilename({ seriesId: 7, episodeNumber: 2 })).toBe(
      "series-series-7-ep-2-compiled.mp4"
    );
  });

  it("sanitizes unsafe filename characters", () => {
    const name = compiledVideoFilename({
      seriesId: 1,
      episodeNumber: 1,
      seriesTitle: "Test/../../etc",
    });
    expect(name).not.toMatch(/[\/\\]/);
  });

  it("preserves meaningful Thai series titles in the compiled filename", () => {
    expect(
      compiledVideoFilename({
        seriesId: 42,
        episodeNumber: 29,
        seriesTitle: "คาเฟ่รักในเวทีพิเศษ",
      }),
    ).toBe("series-คาเฟ่รักในเวทีพิเศษ-ep-29-compiled.mp4");
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

  /**
   * Speaker-aware sub-shots task (Package 4) — assembly-ordering regression
   * guard: a shot that split into sub-shots (`clipNumber = parentShotNumber *
   * 100 + subShotNumber`, e.g. shot 3 -> 301/302/303) must still sort
   * BETWEEN shot 2 and shot 4 by SHOT order, not after shot 4 by raw
   * `clipNumber` ascending (301 > 4 numerically, which used to corrupt
   * concat order before `compareClipSourceOrder` was introduced).
   */
  it("sorts a split shot's sub-shot clips into correct shot order alongside unsplit shots (Package 4)", () => {
    const pack: any = {
      clips: [
        { clipNumber: 4, sourceShotNumbers: [4], videoTask: { videoUrl: "/4.mp4" } },
        {
          clipNumber: 303,
          sourceShotNumbers: [3],
          parentShotNumber: 3,
          subShotNumber: 3,
          videoTask: { videoUrl: "/303.mp4" },
        },
        { clipNumber: 1, sourceShotNumbers: [1], videoTask: { videoUrl: "/1.mp4" } },
        {
          clipNumber: 301,
          sourceShotNumbers: [3],
          parentShotNumber: 3,
          subShotNumber: 1,
          videoTask: { videoUrl: "/301.mp4" },
        },
        { clipNumber: 2, sourceShotNumbers: [2], videoTask: { videoUrl: "/2.mp4" } },
        {
          clipNumber: 302,
          sourceShotNumbers: [3],
          parentShotNumber: 3,
          subShotNumber: 2,
          videoTask: { videoUrl: "/302.mp4" },
        },
      ],
    };
    const ordered = extractClipSourcesFromMotionPromptPack(pack);
    expect(ordered.map(c => c.clipNumber)).toEqual([1, 2, 301, 302, 303, 4]);
  });

  it("produces byte-identical order to raw clipNumber ascending for a pack with no split shots", () => {
    const pack: any = {
      clips: [
        { clipNumber: 3, sourceShotNumbers: [3], videoTask: { videoUrl: "/c.mp4" } },
        { clipNumber: 1, sourceShotNumbers: [1], videoTask: { videoUrl: "/a.mp4" } },
        { clipNumber: 2, sourceShotNumbers: [2], videoTask: { videoUrl: "/b.mp4" } },
      ],
    };
    const ordered = extractClipSourcesFromMotionPromptPack(pack);
    const rawSorted = pack.clips
      .slice()
      .sort((a: any, b: any) => a.clipNumber - b.clipNumber)
      .map((c: any) => c.clipNumber);
    expect(ordered.map(c => c.clipNumber)).toEqual(rawSorted);
  });
});

describe("normalizeVerticalDramaStoredAssetUrl", () => {
  it("replaces expiring worker-artifact signatures with the durable storage proxy", () => {
    expect(
      normalizeVerticalDramaStoredAssetUrl(
        "https://r2.example.test/smartspec/worker-artifacts/tenant/job/clip.mp4?X-Amz-Expires=3600&X-Amz-Signature=secret"
      )
    ).toBe("/api/storage/files/worker-artifacts/tenant/job/clip.mp4");
  });

  it("leaves provider URLs unchanged", () => {
    expect(normalizeVerticalDramaStoredAssetUrl("https://provider.example/clip.mp4")).toBe(
      "https://provider.example/clip.mp4"
    );
  });

  it("normalizes an absolute app storage-proxy URL to its durable relative path", () => {
    expect(
      normalizeVerticalDramaStoredAssetUrl(
        "https://smartaihub.app/api/storage/files/worker-artifacts/clip.mp4?download=1"
      )
    ).toBe("/api/storage/files/worker-artifacts/clip.mp4");
  });

  it("extracts only the durable managed key and ignores signed query parameters", () => {
    const url =
      "https://r2.example.test/smartspec/worker-artifacts/tenant/job/clip.mp4?X-Amz-Signature=secret";
    expect(extractVerticalDramaManagedStorageKey(url)).toBe(
      "worker-artifacts/tenant/job/clip.mp4"
    );
    expect(extractVerticalDramaManagedStorageKey(
      "/api/storage/files/worker-artifacts/tenant/job/clip.mp4"
    )).toBe("worker-artifacts/tenant/job/clip.mp4");
    expect(extractVerticalDramaManagedStorageKey("https://provider.example/clip.mp4")).toBeNull();
    expect(buildVerticalDramaStorageProxyUrl("worker-artifacts/tenant/job/clip.mp4")).toBe(
      "/api/storage/files/worker-artifacts/tenant/job/clip.mp4"
    );
  });

  it("repairs legacy clips idempotently without changing unrelated clips", () => {
    const pack = {
      selectedVideoModelId: "grok",
      durationProfileId: "profile",
      motionMode: "image_to_video" as const,
      clips: [
        { clipNumber: 3, sourceShotNumbers: [3], prompt: "a", videoTask: { videoUrl: "https://expired.example/3.mp4" } },
        { clipNumber: 4, sourceShotNumbers: [4], prompt: "b", videoTask: { videoUrl: "/api/storage/files/existing.mp4", mediaAssetId: "22" } },
      ],
      warnings: [],
    };
    const resolutions = {
      3: { mediaAssetId: 1296, url: "/api/storage/files/worker-artifacts/3.mp4" },
    };
    const repaired = repairVerticalDramaVideoAssetUrls(pack, resolutions);
    expect(repaired?.clips[0]?.videoTask).toEqual({
      videoUrl: "/api/storage/files/worker-artifacts/3.mp4",
      mediaAssetId: "1296",
      durabilityStatus: "ready",
    });
    expect(repaired?.clips[1]).toEqual(pack.clips[1]);
    expect(repairVerticalDramaVideoAssetUrls(repaired, resolutions)).toBe(repaired);
  });
});

describe("downloadClipToFile", () => {
  it("reads managed storage through the server storage layer", async () => {
    storageStreamFileMock.mockResolvedValue({
      stream: Readable.from([Buffer.from("managed-clip")]),
      contentType: "video/mp4",
      isPartial: false,
    });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();
    const tempDir = await fsp.mkdtemp("vd-download-");
    const destPath = path.join(tempDir, "clip.mp4");

    try {
      await downloadClipToFile(
        "https://smartaihub.app/api/storage/files/worker-artifacts/clip.mp4?download=1",
        destPath,
        "http://localhost:3000"
      );

      expect(storageStreamFileMock).toHaveBeenCalledWith(
        "worker-artifacts/clip.mp4"
      );
      expect(fetchMock).not.toHaveBeenCalled();
      await expect(fsp.readFile(destPath, "utf8")).resolves.toBe("managed-clip");
    } finally {
      await fsp.rm(tempDir, { recursive: true, force: true });
    }
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
    // Flake fix (task #25) — root cause investigated and confirmed by
    // reproduction: this test was intermittently failing EVEN STANDALONE
    // (not just under a parallel batch), because (1) it awaited the
    // fire-and-forget job via a FIXED 50ms `setTimeout`, racing against
    // (2) an UNMOCKED `probeDurationSeconds(outputPath)` call inside
    // `runAssemblyJob` that spawns a REAL `ffprobe` child process (this host
    // has a real static ffprobe binary resolvable via `resolveFfBinary`) on a
    // fake, non-existent `outputPath` — a real process spawn's OS-level
    // latency is variable and can exceed 50ms under load, independent of any
    // cross-test-file state leakage (module-level state here — `dbState`,
    // the job service's own `jobs` Map — was checked and is NOT shared
    // across test files under this project's default Vitest per-file
    // isolation; `mkdtemp`-based temp dirs are OS-guaranteed-unique, so
    // "shared tmp dir names" was investigated and ruled out too). Fixed two
    // ways: (a) `probeDurationSecondsFn` now injects a fast synchronous fake
    // so no real subprocess is ever spawned in this test, and (b) the fixed
    // sleep is replaced with `waitForCondition`, which is correct by
    // construction regardless of how long the async chain actually takes.
    const fakeRunner = vi.fn(async () => ({ code: 0, stderr: "" }));
    const fakeProbe = vi.fn(async () => undefined);

    const { jobId } = await submitAssemblyJob({
      owner,
      clips,
      internalBaseUrl: "http://localhost:3000",
      filename: "series-x-ep-1-compiled.mp4",
      ffmpegRunner: fakeRunner,
      probeDurationSecondsFn: fakeProbe,
    });

    expect(jobId).toBeTruthy();
    expect(
      (dbState.episode.assemblyManifest as any)?.compiledVideo?.pendingJobId
    ).toBe(jobId);

    // submitAssemblyJob fires the job in the background — poll for the
    // terminal state instead of guessing a fixed sleep duration.
    await waitForCondition(
      () =>
        (dbState.episode.assemblyManifest as any)?.compiledVideo?.status !==
        "pending"
    );

    expect(fakeRunner).toHaveBeenCalled();
    expect(fakeProbe).toHaveBeenCalled();
    expect(storagePutFromPath).toHaveBeenCalled();
    const compiled = (dbState.episode.assemblyManifest as any)?.compiledVideo;
    expect(compiled.status).toBe("completed");
    expect(compiled.videoUrl).toContain("/api/storage/files/");
    expect(compiled.shotCount).toBe(2);
    expect(compiled.pendingJobId).toBeUndefined();
    expect(compiled.error).toBeUndefined();
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

  it("persists a normalized capacity error when ffmpeg cannot write", async () => {
    const failingRunner = vi.fn(async () => ({
      code: 1,
      stderr: "ENOSPC: no space left on device, write",
    }));

    await runAssemblyJob({
      owner,
      jobId: "job-storage-full-1",
      clips,
      internalBaseUrl: "http://localhost:3000",
      filename: "out.mp4",
      ffmpegRunner: failingRunner,
    });

    const compiled = (dbState.episode.assemblyManifest as any)?.compiledVideo;
    expect(compiled.status).toBe("failed");
    expect(compiled.error).toMatch(
      /storage_capacity_exhausted \[mount=\/tmp; kind=/,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Task #21 / W12.5 phase A — final render integration-lite                   */
/* -------------------------------------------------------------------------- */

describe("runAssemblyJob — final render integration-lite (banners/dialogueAudio/subtitles)", () => {
  const owner = { tenantId: "t1", userId: 1, seriesId: 1, episodeId: 1 };
  const clips: EpisodeClipSource[] = [
    { clipNumber: 1, videoUrl: "/api/storage/files/a.mp4" },
    { clipNumber: 2, videoUrl: "/api/storage/files/b.mp4" },
  ];

  it("stages banner + dialogue-audio downloads, generates a subtitle .ass, builds final-render ffmpeg args, and records an additive assemblyManifest.finalRender section", async () => {
    const capturedArgs: string[][] = [];
    const fakeRunner = vi.fn(async (ffArgs: string[]) => {
      capturedArgs.push(ffArgs);
      return { code: 0, stderr: "" };
    });
    const fakeProbe = vi.fn(async () => 12); // 2 clips * 12s = 24s total duration.

    await runAssemblyJob({
      owner,
      jobId: "job-final-render-1",
      clips,
      internalBaseUrl: "http://localhost:3000",
      filename: "series-x-ep-1-compiled.mp4",
      ffmpegRunner: fakeRunner,
      probeDurationSecondsFn: fakeProbe,
      banners: [
        {
          imageUrl: "https://cdn.example.com/banner.png",
          placementId: "bottom_band",
          startSec: 0,
          endSec: 24,
          fadeSec: 0.3,
        },
      ],
      dialogueAudio: {
        segments: [
          { audioUrl: "https://cdn.example.com/line1.mp3", startSec: 1.5 },
        ],
        loudnessNormalize: true,
      },
      subtitles: {
        preset: "classic_box",
        lines: [{ startSec: 0, endSec: 2, text: "สวัสดี" }],
      },
    });

    expect(fakeRunner).toHaveBeenCalledTimes(1);
    const ffArgs = capturedArgs[0]!;

    // Staged banner + dialogue-audio inputs (mirrors clip staging convention).
    expect(ffArgs.some(a => a.endsWith("banner-00.png"))).toBe(true);
    expect(ffArgs.some(a => a.endsWith("dialogue-000.mp3"))).toBe(true);

    // Final-render filter graph, not the legacy concat-only path.
    const fcIndex = ffArgs.indexOf("-filter_complex");
    expect(fcIndex).toBeGreaterThan(-1);
    expect(ffArgs[fcIndex + 1]).toContain("subtitles=filename=");
    expect(ffArgs[fcIndex + 1]).toContain("captions.ass");
    expect(ffArgs[fcIndex + 1]).toContain("loudnorm=I=-16:TP=-1.5:LRA=11");
    expect(ffArgs).toContain("-map");

    // Downloads went through the same `fetch`-based staging path as clips.
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const fetchedUrls = fetchMock.mock.calls.map(call => call[0]);
    expect(fetchedUrls).toContain("https://cdn.example.com/banner.png");
    expect(fetchedUrls).toContain("https://cdn.example.com/line1.mp3");

    // `compiledVideo` behaves exactly as before; `finalRender` is a NEW,
    // additive section alongside it.
    const manifest = dbState.episode.assemblyManifest as any;
    expect(manifest.compiledVideo.status).toBe("completed");
    expect(manifest.finalRender).toEqual({
      bannerCount: 1,
      dialogueAudioSegmentCount: 1,
      loudnessNormalize: true,
      subtitlePreset: "classic_box",
      subtitleLineCount: 1,
      textOverlayEventCount: 0,
      watermarkIncluded: false,
      watermarkCount: 0,
      renderedAt: expect.any(String),
    });
  });

  it("produces the legacy concat-only args (no -filter_complex/-map) and no finalRender section when all three new inputs are absent", async () => {
    const capturedArgs: string[][] = [];
    const fakeRunner = vi.fn(async (ffArgs: string[]) => {
      capturedArgs.push(ffArgs);
      return { code: 0, stderr: "" };
    });

    await runAssemblyJob({
      owner,
      jobId: "job-legacy-path-1",
      clips,
      internalBaseUrl: "http://localhost:3000",
      filename: "out.mp4",
      ffmpegRunner: fakeRunner,
      probeDurationSecondsFn: vi.fn(async () => 12),
    });

    const ffArgs = capturedArgs[0]!;
    expect(ffArgs).not.toContain("-filter_complex");
    expect(ffArgs).not.toContain("-map");
    expect(ffArgs).toContain("-vf");
    const vfIndex = ffArgs.indexOf("-vf");
    expect(ffArgs[vfIndex + 1]).toBe(
      "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1"
    );

    const manifest = dbState.episode.assemblyManifest as any;
    expect(manifest.compiledVideo.status).toBe("completed");
    expect(manifest.finalRender).toBeUndefined();
  });

  it("throws (job persisted as failed) when a banner set fails validation, without ever invoking the ffmpeg runner", async () => {
    const fakeRunner = vi.fn(async () => ({ code: 0, stderr: "" }));

    await runAssemblyJob({
      owner,
      jobId: "job-invalid-banners-1",
      clips,
      internalBaseUrl: "http://localhost:3000",
      filename: "out.mp4",
      ffmpegRunner: fakeRunner,
      probeDurationSecondsFn: vi.fn(async () => 12),
      banners: [
        // endSec (100) far exceeds the probed 24s total duration.
        {
          imageUrl: "https://cdn.example.com/banner.png",
          placementId: "bottom_band",
          startSec: 0,
          endSec: 100,
          fadeSec: 0.3,
        },
      ],
    });

    expect(fakeRunner).not.toHaveBeenCalled();
    const compiled = (dbState.episode.assemblyManifest as any)?.compiledVideo;
    expect(compiled.status).toBe("failed");
    expect(compiled.error).toMatch(
      /vertical_drama_final_render_invalid_banners/
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Task #21 / W12.5 phase B — "entire" banner duration fix                    */
/* -------------------------------------------------------------------------- */

describe('runAssemblyJob — "entire" banner duration resolution (task #21 phase B)', () => {
  const owner = { tenantId: "t1", userId: 1, seriesId: 1, episodeId: 1 };
  const clips: EpisodeClipSource[] = [
    { clipNumber: 1, videoUrl: "/api/storage/files/a.mp4" },
    { clipNumber: 2, videoUrl: "/api/storage/files/b.mp4" },
  ];

  function extractFilterComplex(ffArgs: string[]): string {
    const idx = ffArgs.indexOf("-filter_complex");
    expect(idx).toBeGreaterThan(-1);
    return ffArgs[idx + 1]!;
  }

  it("resolves entire:true to the REAL probed duration when it is SHORTER than the advisory endSec (previously threw VD_FINAL_RENDER_BANNER_OUT_OF_BOUNDS)", async () => {
    const capturedArgs: string[][] = [];
    const fakeRunner = vi.fn(async (ffArgs: string[]) => {
      capturedArgs.push(ffArgs);
      return { code: 0, stderr: "" };
    });
    // 2 clips * 5s = 10s real probed duration — far shorter than the 999s
    // advisory endSec a caller like `resolveEpisodeAdBannerRunInputs` would
    // have supplied pre-probe (using `targetDurationSeconds` as a stand-in).
    const fakeProbe = vi.fn(async () => 5);

    await runAssemblyJob({
      owner,
      jobId: "job-entire-shorter",
      clips,
      internalBaseUrl: "http://localhost:3000",
      filename: "out.mp4",
      ffmpegRunner: fakeRunner,
      probeDurationSecondsFn: fakeProbe,
      banners: [
        {
          imageUrl: "https://cdn.example.com/banner.png",
          placementId: "bottom_band",
          startSec: 0,
          endSec: 999,
          fadeSec: 0.3,
          entire: true,
        },
      ],
    });

    // No throw, no failed job, ffmpeg actually ran.
    expect(fakeRunner).toHaveBeenCalledTimes(1);
    const compiled = (dbState.episode.assemblyManifest as any)?.compiledVideo;
    expect(compiled.status).toBe("completed");

    const filterComplex = extractFilterComplex(capturedArgs[0]!);
    expect(filterComplex).toContain("between(t\\,0\\,10)");
    expect(filterComplex).not.toContain("999");
  });

  it("resolves entire:true to the REAL probed duration when it is LONGER than the advisory endSec (the banner now covers the whole video instead of stopping early)", async () => {
    const capturedArgs: string[][] = [];
    const fakeRunner = vi.fn(async (ffArgs: string[]) => {
      capturedArgs.push(ffArgs);
      return { code: 0, stderr: "" };
    });
    // 2 clips * 20s = 40s real probed duration — longer than the 5s advisory
    // endSec.
    const fakeProbe = vi.fn(async () => 20);

    await runAssemblyJob({
      owner,
      jobId: "job-entire-longer",
      clips,
      internalBaseUrl: "http://localhost:3000",
      filename: "out.mp4",
      ffmpegRunner: fakeRunner,
      probeDurationSecondsFn: fakeProbe,
      banners: [
        {
          imageUrl: "https://cdn.example.com/banner.png",
          placementId: "bottom_band",
          startSec: 0,
          endSec: 5,
          fadeSec: 0.3,
          entire: true,
        },
      ],
    });

    expect(fakeRunner).toHaveBeenCalledTimes(1);
    const compiled = (dbState.episode.assemblyManifest as any)?.compiledVideo;
    expect(compiled.status).toBe("completed");

    const filterComplex = extractFilterComplex(capturedArgs[0]!);
    expect(filterComplex).toContain("between(t\\,0\\,40)");
  });

  it("leaves a banner WITHOUT entire:true untouched (window mode), even in the SAME render as an entire:true banner", async () => {
    const capturedArgs: string[][] = [];
    const fakeRunner = vi.fn(async (ffArgs: string[]) => {
      capturedArgs.push(ffArgs);
      return { code: 0, stderr: "" };
    });
    const fakeProbe = vi.fn(async () => 12); // 2 clips * 12s = 24s total.

    await runAssemblyJob({
      owner,
      jobId: "job-mixed-entire-window",
      clips,
      internalBaseUrl: "http://localhost:3000",
      filename: "out.mp4",
      ffmpegRunner: fakeRunner,
      probeDurationSecondsFn: fakeProbe,
      banners: [
        {
          imageUrl: "https://cdn.example.com/entire-banner.png",
          placementId: "bottom_band",
          startSec: 0,
          endSec: 60,
          fadeSec: 0.3,
          entire: true,
        },
        {
          imageUrl: "https://cdn.example.com/window-banner.png",
          placementId: "side_vertical",
          sideAlign: "left",
          startSec: 2,
          endSec: 6,
          fadeSec: 0.3,
          // no `entire` — must stay exactly [2, 6) regardless of probe.
        },
      ],
    });

    expect(fakeRunner).toHaveBeenCalledTimes(1);
    const filterComplex = extractFilterComplex(capturedArgs[0]!);
    expect(filterComplex).toContain("between(t\\,0\\,24)"); // entire -> probed total
    expect(filterComplex).toContain("between(t\\,2\\,6)"); // window -> unchanged
  });
});

/* -------------------------------------------------------------------------- */
/* Task #34 — Text Overlay Suite render feed                                  */
/* -------------------------------------------------------------------------- */

describe("resolveEpisodeTextOverlayAnchoredEvents", () => {
  const clip1: VdDialogueTimelineClip = {
    clipNumber: 1,
    sourceShotNumbers: [1],
    durationSeconds: 8,
  };
  const clip2: VdDialogueTimelineClip = {
    clipNumber: 2,
    sourceShotNumbers: [2],
    durationSeconds: 8,
  };

  it("returns [] for an empty anchor list", () => {
    expect(resolveEpisodeTextOverlayAnchoredEvents([], [clip1], [1])).toEqual([]);
  });

  it("resolves a shot-anchored card to its clip's absolute offset (reusing resolveDialogueLineAbsoluteTimings)", () => {
    const [event] = resolveEpisodeTextOverlayAnchoredEvents(
      [
        {
          id: "card-1",
          kind: "time_setting",
          text: "ปี 1980",
          shotNumber: 2,
          offsetSec: 1,
          durationSec: 2.5,
        },
      ],
      [clip1, clip2],
      [1, 2]
    );
    // clip1 (8s) offset + 1s local offset = 9s absolute start.
    expect(event).toMatchObject({
      kind: "time_setting",
      text: "ปี 1980",
      startSec: 9,
      endSec: 11.5,
    });
  });

  it("carries secondaryText/variant through unchanged", () => {
    const [event] = resolveEpisodeTextOverlayAnchoredEvents(
      [
        {
          id: "character_intro:char-a",
          kind: "character_intro",
          text: "มาลี",
          secondaryText: "นางเอก",
          shotNumber: 1,
          durationSec: 2.5,
        },
      ],
      [clip1],
      [1]
    );
    expect(event).toMatchObject({ text: "มาลี", secondaryText: "นางเอก" });
  });

  it("resolves multiple anchors independently, zipped back by id", () => {
    const events = resolveEpisodeTextOverlayAnchoredEvents(
      [
        { id: "a", kind: "time_setting", text: "A", shotNumber: 1, durationSec: 2 },
        { id: "b", kind: "narrative_hook", text: "B", shotNumber: 2, durationSec: 2 },
      ],
      [clip1, clip2],
      [1, 2]
    );
    expect(events.find(e => e.text === "A")?.startSec).toBe(0);
    expect(events.find(e => e.text === "B")?.startSec).toBe(8);
  });
});

describe("resolveEpisodeTextOverlayRunInputs", () => {
  const baseParams = { motionClips: [], includedClipNumbers: [] };

  it("returns an empty overlays array when nothing is enabled", () => {
    expect(resolveEpisodeTextOverlayRunInputs(baseParams)).toEqual({
      overlays: [],
      overlayCount: 0,
    });
  });

  it("builds an end_card event as endAnchored with the follow line when showFollowLine is true", () => {
    const result = resolveEpisodeTextOverlayRunInputs({
      ...baseParams,
      endCard: {
        text: "ติดตามตอนต่อไป",
        durationSec: 3,
        showFollowLine: true,
        styleVariant: "center_card",
      },
    });
    expect(result.overlays).toEqual([
      expect.objectContaining({
        kind: "end_card",
        text: "ติดตามตอนต่อไป",
        endAnchored: true,
        durationSecForEndAnchor: 3,
        variant: "center_card",
        secondaryText: expect.any(String),
      }),
    ]);
  });

  it("omits the follow line when showFollowLine is false", () => {
    const result = resolveEpisodeTextOverlayRunInputs({
      ...baseParams,
      endCard: {
        text: "x",
        durationSec: 3,
        showFollowLine: false,
        styleVariant: "center_card",
      },
    });
    expect(result.overlays[0]?.secondaryText).toBeUndefined();
  });

  it("skips a blank end_card text entirely", () => {
    const result = resolveEpisodeTextOverlayRunInputs({
      ...baseParams,
      endCard: { text: "   ", durationSec: 3, showFollowLine: true, styleVariant: "center_card" },
    });
    expect(result.overlays).toEqual([]);
  });

  it("queues title_bumper before opener_recap when both are enabled (auto-queue)", () => {
    const result = resolveEpisodeTextOverlayRunInputs({
      ...baseParams,
      titleBumper: { primary: "ซีรีส์", secondary: "EP 1" },
      openerRecap: { text: "ความเดิม", durationSec: 4 },
    });
    const bumper = result.overlays.find(o => o.kind === "title_bumper");
    const recap = result.overlays.find(o => o.kind === "opener_recap");
    expect(bumper).toMatchObject({ startSec: 0, endSec: 3 });
    expect(recap).toMatchObject({ startSec: 3, endSec: 7, secondaryText: "ความเดิม" });
  });

  it("starts opener_recap at 0 when titleBumper is absent", () => {
    const result = resolveEpisodeTextOverlayRunInputs({
      ...baseParams,
      openerRecap: { text: "ความเดิม", durationSec: 3 },
    });
    expect(result.overlays[0]).toMatchObject({ kind: "opener_recap", startSec: 0, endSec: 3 });
  });

  it("skips a blank opener_recap text", () => {
    const result = resolveEpisodeTextOverlayRunInputs({
      ...baseParams,
      openerRecap: { text: "", durationSec: 3 },
    });
    expect(result.overlays).toEqual([]);
  });

  it("builds episode_indicator as entireClip:true", () => {
    const result = resolveEpisodeTextOverlayRunInputs({
      ...baseParams,
      episodeIndicator: { label: "EP 3/10", position: "top_right" },
    });
    expect(result.overlays).toEqual([
      expect.objectContaining({
        kind: "episode_indicator",
        text: "EP 3/10",
        variant: "top_right",
        entireClip: true,
      }),
    ]);
  });

  it("builds watermark_text as entireClip:true, carrying opacity/marginPx", () => {
    const result = resolveEpisodeTextOverlayRunInputs({
      ...baseParams,
      watermarkTexts: [{ text: "@brand", position: "bottom_right", opacity: 0.5, marginPx: 24 }],
    });
    expect(result.overlays).toEqual([
      expect.objectContaining({
        kind: "watermark_text",
        text: "@brand",
        variant: "bottom_right",
        opacity: 0.5,
        marginPx: 24,
        entireClip: true,
      }),
    ]);
  });

  it("dual watermark: builds TWO independent watermark_text events, one per slot", () => {
    const result = resolveEpisodeTextOverlayRunInputs({
      ...baseParams,
      watermarkTexts: [
        { text: "@series-brand", position: "top_left", opacity: 0.4, marginPx: 20 },
        { text: "@channel-brand", position: "bottom_right", opacity: 0.6, marginPx: 16 },
      ],
    });
    expect(result.overlays).toEqual([
      expect.objectContaining({
        kind: "watermark_text",
        text: "@series-brand",
        variant: "top_left",
        opacity: 0.4,
        marginPx: 20,
        entireClip: true,
      }),
      expect.objectContaining({
        kind: "watermark_text",
        text: "@channel-brand",
        variant: "bottom_right",
        opacity: 0.6,
        marginPx: 16,
        entireClip: true,
      }),
    ]);
  });

  it("resolves character intro cards anchored to their first-appearance shot", () => {
    const clip1: VdDialogueTimelineClip = { clipNumber: 1, sourceShotNumbers: [1], durationSeconds: 6 };
    const result = resolveEpisodeTextOverlayRunInputs({
      motionClips: [clip1],
      includedClipNumbers: [1],
      characterIntroCards: [{ characterKey: "char-a", shotNumber: 1, name: "มาลี", role: "นางเอก" }],
    });
    expect(result.overlays).toEqual([
      expect.objectContaining({
        kind: "character_intro",
        text: "มาลี",
        secondaryText: "นางเอก",
        startSec: 0,
      }),
    ]);
  });

  it("resolves mid-episode cards anchored to their own shot", () => {
    const clip1: VdDialogueTimelineClip = { clipNumber: 1, sourceShotNumbers: [1], durationSeconds: 6 };
    const result = resolveEpisodeTextOverlayRunInputs({
      motionClips: [clip1],
      includedClipNumbers: [1],
      cards: [{ id: "c1", kind: "time_setting", text: "ปี 1980", shotNumber: 1, offsetSec: 2, durationSec: 2.5 }],
    });
    expect(result.overlays).toEqual([
      expect.objectContaining({ kind: "time_setting", text: "ปี 1980", startSec: 2, endSec: 4.5 }),
    ]);
  });

  it("assembles every kind together, counting them all in overlayCount", () => {
    const clip1: VdDialogueTimelineClip = { clipNumber: 1, sourceShotNumbers: [1], durationSeconds: 6 };
    const result = resolveEpisodeTextOverlayRunInputs({
      motionClips: [clip1],
      includedClipNumbers: [1],
      endCard: { text: "จบ", durationSec: 3, showFollowLine: true, styleVariant: "center_card" },
      openerRecap: { text: "ความเดิม", durationSec: 3 },
      titleBumper: { primary: "ซีรีส์", secondary: "EP 1" },
      episodeIndicator: { label: "EP 1/10", position: "top_right" },
      watermarkTexts: [{ text: "@brand", position: "top_left", opacity: 0.4, marginPx: 20 }],
      characterIntroCards: [{ characterKey: "char-a", shotNumber: 1, name: "มาลี" }],
      cards: [{ id: "c1", kind: "narrative_hook", text: "จะเกิดอะไรขึ้น", shotNumber: 1, durationSec: 2 }],
    });
    expect(result.overlayCount).toBe(7);
    expect(result.overlays.map(o => o.kind).sort()).toEqual(
      [
        "character_intro",
        "end_card",
        "episode_indicator",
        "narrative_hook",
        "opener_recap",
        "title_bumper",
        "watermark_text",
      ].sort()
    );
  });
});

describe("runAssemblyJob — Text Overlay Suite integration (task #34)", () => {
  const owner = { tenantId: "t1", userId: 1, seriesId: 1, episodeId: 1 };
  const clips: EpisodeClipSource[] = [
    { clipNumber: 1, videoUrl: "/api/storage/files/a.mp4" },
  ];

  function extractFilterComplex(ffArgs: string[]): string {
    const idx = ffArgs.indexOf("-filter_complex");
    expect(idx).toBeGreaterThan(-1);
    return ffArgs[idx + 1]!;
  }

  it("resolves an entireClip overlay (episode indicator) to [0, real probed duration] post-probe", async () => {
    const capturedArgs: string[][] = [];
    const fakeRunner = vi.fn(async (ffArgs: string[]) => {
      capturedArgs.push(ffArgs);
      return { code: 0, stderr: "" };
    });
    const fakeProbe = vi.fn(async () => 20);

    await runAssemblyJob({
      owner,
      jobId: "job-overlay-entire",
      clips,
      internalBaseUrl: "http://localhost:3000",
      filename: "out.mp4",
      ffmpegRunner: fakeRunner,
      probeDurationSecondsFn: fakeProbe,
      subtitles: {
        preset: "none" as unknown as never,
        lines: [],
        overlays: [
          {
            kind: "episode_indicator",
            text: "EP 3/10",
            variant: "top_right",
            startSec: 0,
            endSec: 0,
            entireClip: true,
          },
        ],
      } as any,
    });

    expect(fakeRunner).toHaveBeenCalledTimes(1);
    const filterComplex = extractFilterComplex(capturedArgs[0]!);
    expect(filterComplex).toContain("subtitles=filename=");
    // The written .ass content isn't directly inspectable from the filter
    // graph string, but the job completing (not throwing) with a subtitles
    // stage present confirms the overlay-only .ass path is taken even
    // though `lines` is empty (preset "none").
    const compiled = (dbState.episode.assemblyManifest as any)?.compiledVideo;
    expect(compiled.status).toBe("completed");
    const finalRender = (dbState.episode.assemblyManifest as any)?.finalRender;
    expect(finalRender.textOverlayEventCount).toBe(1);
  });

  it("resolves an endAnchored overlay (end card) to [duration - fixedLen, duration] post-probe", async () => {
    const writeFileSpy = vi.spyOn(fsp, "writeFile");
    const fakeRunner = vi.fn(async () => ({ code: 0, stderr: "" }));
    const fakeProbe = vi.fn(async () => 30);

    await runAssemblyJob({
      owner,
      jobId: "job-overlay-end-anchored",
      clips,
      internalBaseUrl: "http://localhost:3000",
      filename: "out.mp4",
      ffmpegRunner: fakeRunner,
      probeDurationSecondsFn: fakeProbe,
      subtitles: {
        preset: "none" as unknown as never,
        lines: [],
        overlays: [
          {
            kind: "end_card",
            text: "ติดตามตอนต่อไป",
            startSec: 0,
            endSec: 3,
            endAnchored: true,
            durationSecForEndAnchor: 3,
          },
        ],
      } as any,
    });

    const assCall = writeFileSpy.mock.calls.find(call =>
      String(call[0]).endsWith("captions.ass")
    );
    expect(assCall).toBeDefined();
    const assContent = String(assCall![1]);
    // 30s probed duration - 3s fixed length = starts at 27s.
    expect(assContent).toContain("0:00:27.00,0:00:30.00");
    writeFileSpy.mockRestore();
  });

  it("stages and composites an IMAGE watermark, surviving on top of a fullscreen banner", async () => {
    const capturedArgs: string[][] = [];
    const fakeRunner = vi.fn(async (ffArgs: string[]) => {
      capturedArgs.push(ffArgs);
      return { code: 0, stderr: "" };
    });
    const fakeProbe = vi.fn(async () => 10);

    await runAssemblyJob({
      owner,
      jobId: "job-watermark-image",
      clips,
      internalBaseUrl: "http://localhost:3000",
      filename: "out.mp4",
      ffmpegRunner: fakeRunner,
      probeDurationSecondsFn: fakeProbe,
      banners: [
        {
          imageUrl: "https://cdn.example.com/fullscreen.png",
          placementId: "fullscreen",
          startSec: 0,
          endSec: 3,
          fadeSec: 0.3,
        },
      ],
      watermarkImages: [
        {
          slotId: "primary",
          imageUrl: "https://cdn.example.com/logo.png",
          position: "top_right",
          opacity: 0.45,
          scalePct: 10,
          marginPx: 32,
        },
      ],
    });

    expect(fakeRunner).toHaveBeenCalledTimes(1);
    const ffArgs = capturedArgs[0]!;
    expect(ffArgs.some(a => a.endsWith("watermark-primary.png"))).toBe(true);
    const filterComplex = extractFilterComplex(ffArgs);
    const fullscreenIdx = filterComplex.indexOf("overlay=0:0");
    const watermarkIdx = filterComplex.indexOf("colorchannelmixer=aa=0.45");
    expect(fullscreenIdx).toBeGreaterThan(-1);
    expect(watermarkIdx).toBeGreaterThan(fullscreenIdx);

    const finalRender = (dbState.episode.assemblyManifest as any)?.finalRender;
    expect(finalRender.watermarkIncluded).toBe(true);
    expect(finalRender.watermarkCount).toBe(1);
  });

  it("dual watermark: stages TWO watermark images without a filename collision", async () => {
    const capturedArgs: string[][] = [];
    const fakeRunner = vi.fn(async (ffArgs: string[]) => {
      capturedArgs.push(ffArgs);
      return { code: 0, stderr: "" };
    });
    const fakeProbe = vi.fn(async () => 10);

    await runAssemblyJob({
      owner,
      jobId: "job-dual-watermark-image",
      clips,
      internalBaseUrl: "http://localhost:3000",
      filename: "out.mp4",
      ffmpegRunner: fakeRunner,
      probeDurationSecondsFn: fakeProbe,
      watermarkImages: [
        {
          slotId: "primary",
          imageUrl: "https://cdn.example.com/series-logo.png",
          position: "top_right",
          opacity: 0.45,
          scalePct: 10,
          marginPx: 32,
        },
        {
          slotId: "secondary",
          imageUrl: "https://cdn.example.com/channel-logo.png",
          position: "bottom_left",
          opacity: 0.6,
          scalePct: 8,
          marginPx: 16,
        },
      ],
    });

    expect(fakeRunner).toHaveBeenCalledTimes(1);
    const ffArgs = capturedArgs[0]!;
    // Distinct staged local filenames — no collision between the two slots.
    expect(ffArgs.some(a => a.endsWith("watermark-primary.png"))).toBe(true);
    expect(ffArgs.some(a => a.endsWith("watermark-secondary.png"))).toBe(true);
    const filterComplex = extractFilterComplex(ffArgs);
    // Two independent overlay stages present in the filter graph.
    expect(filterComplex).toContain("[wmimgprimary]");
    expect(filterComplex).toContain("[wmimgsecondary]");

    const finalRender = (dbState.episode.assemblyManifest as any)?.finalRender;
    expect(finalRender.watermarkIncluded).toBe(true);
    expect(finalRender.watermarkCount).toBe(2);
  });

  it("is a complete no-op for the legacy concat path when neither overlays nor watermarkImages is supplied", async () => {
    const capturedArgs: string[][] = [];
    const fakeRunner = vi.fn(async (ffArgs: string[]) => {
      capturedArgs.push(ffArgs);
      return { code: 0, stderr: "" };
    });

    await runAssemblyJob({
      owner,
      jobId: "job-legacy-still-works",
      clips,
      internalBaseUrl: "http://localhost:3000",
      filename: "out.mp4",
      ffmpegRunner: fakeRunner,
    });

    expect(capturedArgs[0]).not.toContain("-filter_complex");
    const finalRender = (dbState.episode.assemblyManifest as any)?.finalRender;
    expect(finalRender).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Task #21 / W12.5 phase B — dialogue audio + subtitles render feed          */
/* -------------------------------------------------------------------------- */

describe("resolveEpisodeDialogueAudioAndSubtitlesRunInputs", () => {
  function dialogueLine(over: Record<string, unknown> = {}) {
    return {
      lineId: "line-1",
      shotNumber: 1,
      clipNumber: 1,
      speakerName: "Aria",
      isNarration: false,
      text: "We are not done here.",
      start: 0,
      end: 2,
      targetDurationSeconds: 2,
      ...over,
    };
  }

  function ttsItem(over: Record<string, unknown> = {}) {
    return {
      lineId: "line-1",
      speakerName: "Aria",
      text: "We are not done here.",
      targetDurationSeconds: 2,
      blocked: false,
      ...over,
    };
  }

  function plan(over: Record<string, unknown> = {}): VerticalDramaDialogueAudioPlan {
    return {
      planId: "dap-1",
      seriesId: "10",
      episodeId: "20",
      mode: "dialogue",
      audioStrategy: "separate_tts_voiceover",
      language: "th",
      dialogueLines: [dialogueLine() as any],
      speakerVoiceMap: { entries: [] },
      nativeAudioPolicy: {
        requested: false,
        modelSupportsNativeAudio: false,
        modelSupportsRequestedLanguage: false,
        userAcceptedRegenerationCost: false,
        allowed: false,
        blockingReasons: [],
      },
      separateTtsPlan: {
        strategy: "separate_tts_voiceover",
        items: [ttsItem() as any],
        injectsIntoVideoPrompts: false,
        blockedLineIds: [],
      },
      nativeAudioSnippets: [],
      subtitleCues: [],
      subtitleSafeArea: { position: "bottom_safe", maxLines: 2, avoidFaceArea: true },
      timing: {
        episodeTargetSeconds: 60,
        totalDialogueSeconds: 2,
        perShot: [],
        overlongLineIds: [],
        timingMismatch: false,
      },
      repairQueue: [],
      warnings: [],
      subShotsEnabled: false,
      createdAt: "2026-07-08T00:00:00.000Z",
      updatedAt: "2026-07-08T00:00:00.000Z",
      ...over,
    } as VerticalDramaDialogueAudioPlan;
  }

  const oneClip: VdDialogueTimelineClip[] = [
    { clipNumber: 1, sourceShotNumbers: [1], durationSeconds: 8 },
  ];

  it("returns a no-op result for a null plan", () => {
    const result = resolveEpisodeDialogueAudioAndSubtitlesRunInputs({
      plan: null,
      motionClips: oneClip,
      includedClipNumbers: [1],
      includeDialogueAudio: true,
      loudnessNormalize: true,
      subtitlePreset: "classic_box",
    });
    expect(result).toEqual({ dialogueAudioSegmentsIncluded: 0, subtitleLinesIncluded: 0 });
  });

  it("returns a no-op result when the plan has zero dialogue lines", () => {
    const result = resolveEpisodeDialogueAudioAndSubtitlesRunInputs({
      plan: plan({ dialogueLines: [] }),
      motionClips: oneClip,
      includedClipNumbers: [1],
      includeDialogueAudio: true,
      subtitlePreset: "classic_box",
      loudnessNormalize: false,
    });
    expect(result).toEqual({ dialogueAudioSegmentsIncluded: 0, subtitleLinesIncluded: 0 });
  });

  /**
   * Field incident 2026-08-01 (series 21 / episode 124): every storyboard shot
   * showed dialogue, but the render burned in ZERO subtitles — captions were
   * sourced only from `dialogueAudioPlan.dialogueLines`, and that episode never
   * ran the dialogue/voice step. Its 20 lines lived on
   * `motionPromptPack.clips[].dialogue` the whole time, on the very clips the
   * render was already being handed.
   */
  describe("clip-authored dialogue fallback", () => {
    const twoClips: VdDialogueTimelineClip[] = [
      { clipNumber: 1, sourceShotNumbers: [1], durationSeconds: 10 },
      { clipNumber: 2, sourceShotNumbers: [2], durationSeconds: 10 },
    ];

    it("builds subtitles from clip dialogue when the plan is absent", () => {
      const result = resolveEpisodeDialogueAudioAndSubtitlesRunInputs({
        plan: null,
        motionClips: twoClips,
        includedClipNumbers: [1, 2],
        clipDialogue: new Map([
          [
            1,
            [
              { text: "จะเอาอะไรอีก ฉันให้ไปเยอะแล้วนะ", speakerName: "ปราง" },
              { text: "มือถือเครื่องเดียว ทำไมต้องตามไม่เลิก", speakerName: "ปราง" },
            ],
          ],
          [2, [{ text: "งั้นฉันจะไม่ปล่อยเธอไปคนเดียวอีก", speakerName: "ภูมิ" }]],
        ]),
        includeDialogueAudio: false,
        loudnessNormalize: false,
        subtitlePreset: "creator_pop",
      });

      expect(result.subtitleLinesIncluded).toBe(3);
      expect(result.subtitles?.preset).toBe("creator_pop");
      const lines = result.subtitles!.lines;
      expect(lines.map(line => line.speakerName)).toEqual(["ปราง", "ปราง", "ภูมิ"]);
      // Clip 1 owns [0,10), clip 2 owns [10,20) — absolute, laid end to end,
      // with clip 1's two lines splitting its window and the last one closing
      // it out exactly.
      expect(lines[0].startSec).toBe(0);
      expect(lines[1].endSec).toBeCloseTo(10, 5);
      expect(lines[2].startSec).toBeCloseTo(10, 5);
      expect(lines[2].endSec).toBeCloseTo(20, 5);
      // Strictly increasing, non-overlapping.
      for (let i = 1; i < lines.length; i += 1) {
        expect(lines[i].startSec).toBeGreaterThanOrEqual(lines[i - 1].endSec);
        expect(lines[i].endSec).toBeGreaterThan(lines[i].startSec);
      }
    });

    it("prefers a real dialogue plan over clip dialogue when both exist", () => {
      const result = resolveEpisodeDialogueAudioAndSubtitlesRunInputs({
        plan: plan(),
        motionClips: twoClips,
        includedClipNumbers: [1, 2],
        clipDialogue: new Map([[1, [{ text: "clip text", speakerName: "X" }]]]),
        includeDialogueAudio: false,
        loudnessNormalize: false,
        subtitlePreset: "classic_box",
      });

      expect(result.subtitleLinesIncluded).toBe(1);
      expect(result.subtitles?.lines[0].text).toBe("We are not done here.");
    });

    it("skips clips that were excluded from this render", () => {
      const result = resolveEpisodeDialogueAudioAndSubtitlesRunInputs({
        plan: null,
        motionClips: twoClips,
        includedClipNumbers: [1],
        clipDialogue: new Map([
          [1, [{ text: "kept", speakerName: "A" }]],
          [2, [{ text: "dropped", speakerName: "B" }]],
        ]),
        includeDialogueAudio: false,
        loudnessNormalize: false,
        subtitlePreset: "classic_box",
      });

      expect(result.subtitleLinesIncluded).toBe(1);
      expect(result.subtitles?.lines[0].text).toBe("kept");
    });

    it("treats a line with no speaker as narration (no speaker chip)", () => {
      const result = resolveEpisodeDialogueAudioAndSubtitlesRunInputs({
        plan: null,
        motionClips: twoClips,
        includedClipNumbers: [1],
        clipDialogue: new Map([[1, [{ text: "เสียงบรรยาย" }]]]),
        includeDialogueAudio: false,
        loudnessNormalize: false,
        subtitlePreset: "classic_box",
      });

      expect(result.subtitles?.lines[0].speakerName).toBeUndefined();
    });

    it("stays a no-op when subtitles are switched off, even with clip dialogue present", () => {
      const result = resolveEpisodeDialogueAudioAndSubtitlesRunInputs({
        plan: null,
        motionClips: twoClips,
        includedClipNumbers: [1],
        clipDialogue: new Map([[1, [{ text: "hi", speakerName: "A" }]]]),
        includeDialogueAudio: false,
        loudnessNormalize: false,
        subtitlePreset: "none",
      });

      expect(result).toEqual({ dialogueAudioSegmentsIncluded: 0, subtitleLinesIncluded: 0 });
    });

    it("is byte-identical to before when no clipDialogue is supplied", () => {
      const result = resolveEpisodeDialogueAudioAndSubtitlesRunInputs({
        plan: null,
        motionClips: twoClips,
        includedClipNumbers: [1, 2],
        includeDialogueAudio: false,
        loudnessNormalize: false,
        subtitlePreset: "classic_box",
      });

      expect(result).toEqual({ dialogueAudioSegmentsIncluded: 0, subtitleLinesIncluded: 0 });
    });
  });

  it("returns a no-op result when neither includeDialogueAudio nor a real subtitlePreset is requested", () => {
    const result = resolveEpisodeDialogueAudioAndSubtitlesRunInputs({
      plan: plan(),
      motionClips: oneClip,
      includedClipNumbers: [1],
      includeDialogueAudio: false,
      subtitlePreset: undefined,
      loudnessNormalize: false,
    });
    expect(result).toEqual({ dialogueAudioSegmentsIncluded: 0, subtitleLinesIncluded: 0 });
  });

  it('treats subtitlePreset "none" the same as omitted — no subtitles fed', () => {
    const result = resolveEpisodeDialogueAudioAndSubtitlesRunInputs({
      plan: plan(),
      motionClips: oneClip,
      includedClipNumbers: [1],
      includeDialogueAudio: false,
      subtitlePreset: "none",
      loudnessNormalize: false,
    });
    expect(result.subtitles).toBeUndefined();
    expect(result.subtitleLinesIncluded).toBe(0);
  });

  it('treats subtitlePreset "no_subtitle_style" the same sentinel as "none"', () => {
    const result = resolveEpisodeDialogueAudioAndSubtitlesRunInputs({
      plan: plan(),
      motionClips: oneClip,
      includedClipNumbers: [1],
      includeDialogueAudio: false,
      subtitlePreset: "no_subtitle_style",
      loudnessNormalize: false,
    });
    expect(result.subtitles).toBeUndefined();
  });

  it("builds subtitles from dialogueLines when a real preset is requested, INDEPENDENT of includeDialogueAudio (subtitles work from script text)", () => {
    const result = resolveEpisodeDialogueAudioAndSubtitlesRunInputs({
      plan: plan(),
      motionClips: oneClip,
      includedClipNumbers: [1],
      includeDialogueAudio: false, // opted out of audio entirely
      subtitlePreset: "classic_box",
      loudnessNormalize: false,
    });
    expect(result.dialogueAudio).toBeUndefined();
    expect(result.dialogueAudioSegmentsIncluded).toBe(0);
    expect(result.subtitles?.preset).toBe("classic_box");
    expect(result.subtitles?.lines).toHaveLength(1);
    expect(result.subtitles?.lines[0]).toMatchObject({
      startSec: 0,
      endSec: 2,
      speakerName: "Aria",
      text: "We are not done here.",
    });
    // Every clip-resolved line also carries its clip attribution, so a renderer
    // that has probed the real clips can re-time it
    // (`retimeSubtitleLinesToProbedClips`).
    expect(result.subtitles?.lines[0]).toMatchObject({
      clipNumber: 1,
      clipLocalStartFrac: 0,
      clipLocalEndFrac: 0.25, // 2s of the clip's planned 8s window
    });
    expect(result.subtitleLinesIncluded).toBe(1);
  });

  it("builds dialogueAudio.segments only for lines with a completed audioTask.audioUrl; a line with no completed audio is excluded from audio but STILL included in subtitles", () => {
    const twoLinePlan = plan({
      dialogueLines: [
        dialogueLine({ lineId: "line-a", start: 0, end: 2, text: "Line A has audio." }),
        dialogueLine({ lineId: "line-b", start: 2, end: 4, text: "Line B has no audio yet." }),
      ],
      separateTtsPlan: {
        strategy: "separate_tts_voiceover",
        items: [
          ttsItem({
            lineId: "line-a",
            audioTask: { pendingTaskId: "t1", audioUrl: "https://cdn.example.com/a.mp3" },
          }),
          ttsItem({ lineId: "line-b", audioTask: { pendingTaskId: "t2" } }), // still pending, no audioUrl
        ],
        injectsIntoVideoPrompts: false,
        blockedLineIds: [],
      },
    });

    const result = resolveEpisodeDialogueAudioAndSubtitlesRunInputs({
      plan: twoLinePlan,
      motionClips: oneClip,
      includedClipNumbers: [1],
      includeDialogueAudio: true,
      subtitlePreset: "classic_box",
      loudnessNormalize: true,
    });

    expect(result.dialogueAudioSegmentsIncluded).toBe(1);
    expect(result.dialogueAudio).toEqual({
      segments: [{ audioUrl: "https://cdn.example.com/a.mp3", startSec: 0 }],
      loudnessNormalize: true,
    });
    // Both lines still show up as subtitles — captions don't require audio.
    expect(result.subtitleLinesIncluded).toBe(2);
    expect(result.subtitles?.lines.map(l => l.text)).toEqual([
      "Line A has audio.",
      "Line B has no audio yet.",
    ]);
  });

  it("omits the dialogueAudio key entirely when includeDialogueAudio is true but zero lines have completed audio (never silently normalizes the base track)", () => {
    const result = resolveEpisodeDialogueAudioAndSubtitlesRunInputs({
      plan: plan({
        separateTtsPlan: {
          strategy: "separate_tts_voiceover",
          items: [ttsItem({ audioTask: { pendingTaskId: "t1" } })], // no audioUrl yet
          injectsIntoVideoPrompts: false,
          blockedLineIds: [],
        },
      }),
      motionClips: oneClip,
      includedClipNumbers: [1],
      includeDialogueAudio: true,
      loudnessNormalize: true,
      subtitlePreset: "none",
    });
    expect(result.dialogueAudio).toBeUndefined();
    expect(result.dialogueAudioSegmentsIncluded).toBe(0);
  });

  it("narration lines omit the speakerName chip; named dialogue lines include it", () => {
    const result = resolveEpisodeDialogueAudioAndSubtitlesRunInputs({
      plan: plan({
        dialogueLines: [
          dialogueLine({ lineId: "narr", isNarration: true, speakerName: "Narrator", text: "Once upon a time." }),
        ],
      }),
      motionClips: oneClip,
      includedClipNumbers: [1],
      includeDialogueAudio: false,
      subtitlePreset: "classic_box",
      loudnessNormalize: false,
    });
    expect(result.subtitles?.lines[0]).toMatchObject({
      startSec: 0,
      endSec: 2,
      text: "Once upon a time.",
    });
    expect(result.subtitles?.lines[0].speakerName).toBeUndefined();
  });

  it("computes absolute startSec for dialogueAudio segments using the clip's planned duration, not shot-local time", () => {
    const twoClips: VdDialogueTimelineClip[] = [
      { clipNumber: 1, sourceShotNumbers: [1], durationSeconds: 8 },
      { clipNumber: 2, sourceShotNumbers: [2], durationSeconds: 8 },
    ];
    const result = resolveEpisodeDialogueAudioAndSubtitlesRunInputs({
      plan: plan({
        dialogueLines: [dialogueLine({ clipNumber: 2, shotNumber: 2, start: 1, end: 3 })],
        separateTtsPlan: {
          strategy: "separate_tts_voiceover",
          items: [
            ttsItem({
              audioTask: { pendingTaskId: "t1", audioUrl: "https://cdn.example.com/l1.mp3" },
            }),
          ],
          injectsIntoVideoPrompts: false,
          blockedLineIds: [],
        },
      }),
      motionClips: twoClips,
      includedClipNumbers: [1, 2],
      includeDialogueAudio: true,
      subtitlePreset: "none",
      loudnessNormalize: false,
    });
    // clip1's 8s duration + the line's own shot-local start (1s) = 9s absolute.
    expect(result.dialogueAudio?.segments[0]?.startSec).toBe(9);
  });
});

/* -------------------------------------------------------------------------- */
/* Task #21 / W12.5 phase B — season batch render sequential job chain        */
/* -------------------------------------------------------------------------- */

describe("submitSequentialAssemblyJobs", () => {
  function spec(episodeId: number, filename: string) {
    return {
      owner: { tenantId: "t1", userId: 1, seriesId: 1, episodeId },
      clips: [{ clipNumber: 1, videoUrl: `/api/storage/files/${filename}` }] as EpisodeClipSource[],
      filename,
    };
  }

  it("mints a distinct jobId per spec, returned in input order, tagged with the right episodeId", async () => {
    const fakeRunner = vi.fn(async () => ({ code: 0, stderr: "" }));
    const fakeProbe = vi.fn(async () => 8);
    const specs = [spec(201, "ep1.mp4"), spec(202, "ep2.mp4")];

    const results = await submitSequentialAssemblyJobs(
      specs,
      "http://localhost:3000",
      fakeRunner,
      fakeProbe
    );

    expect(results).toHaveLength(2);
    expect(results[0]!.episodeId).toBe(201);
    expect(results[1]!.episodeId).toBe(202);
    expect(results[0]!.jobId).not.toBe(results[1]!.jobId);

    await waitForCondition(
      () => getJobStatus(results[1]!.jobId)?.status !== "pending"
    );
    expect(getJobStatus(results[0]!.jobId)?.status).toBe("completed");
    expect(getJobStatus(results[1]!.jobId)?.status).toBe("completed");
  });

  it("chains ffmpeg runs SEQUENTIALLY — episode 2's runner is never called until episode 1's has settled", async () => {
    const firstCall = createDeferred<{ code: number; stderr: string }>();
    const callTimestamps: number[] = [];
    const fakeRunner = vi.fn(async () => {
      callTimestamps.push(fakeRunner.mock.calls.length);
      if (fakeRunner.mock.calls.length === 1) return firstCall.promise;
      return { code: 0, stderr: "" };
    });
    const fakeProbe = vi.fn(async () => 8);
    const specs = [spec(301, "ep1.mp4"), spec(302, "ep2.mp4")];

    const results = await submitSequentialAssemblyJobs(
      specs,
      "http://localhost:3000",
      fakeRunner,
      fakeProbe
    );

    // Both jobs are immediately "queued" (pending), before either ffmpeg run
    // has settled — mirrors `submitAssemblyJob`'s own synchronous-persist
    // contract, now for every episode in the batch at once.
    await waitForCondition(() => fakeRunner.mock.calls.length >= 1);
    expect(getJobStatus(results[0]!.jobId)?.status).toBe("pending");
    expect(getJobStatus(results[1]!.jobId)?.status).toBe("pending");

    // Episode 1's ffmpeg call is in flight — episode 2's must NOT have
    // started yet.
    expect(fakeRunner).toHaveBeenCalledTimes(1);

    firstCall.resolve({ code: 0, stderr: "" });

    await waitForCondition(
      () => getJobStatus(results[1]!.jobId)?.status !== "pending"
    );
    expect(fakeRunner).toHaveBeenCalledTimes(2);
    expect(getJobStatus(results[0]!.jobId)?.status).toBe("completed");
    expect(getJobStatus(results[1]!.jobId)?.status).toBe("completed");
  });

  it("continues the chain after a per-episode failure — the next episode still runs and completes", async () => {
    const fakeRunner = vi.fn(async () => {
      if (fakeRunner.mock.calls.length === 1) {
        return { code: 1, stderr: "boom" }; // episode 1 fails
      }
      return { code: 0, stderr: "" };
    });
    const fakeProbe = vi.fn(async () => 8);
    const specs = [spec(401, "ep1.mp4"), spec(402, "ep2.mp4")];

    const results = await submitSequentialAssemblyJobs(
      specs,
      "http://localhost:3000",
      fakeRunner,
      fakeProbe
    );

    await waitForCondition(
      () => getJobStatus(results[1]!.jobId)?.status !== "pending"
    );

    expect(getJobStatus(results[0]!.jobId)?.status).toBe("failed");
    expect(getJobStatus(results[0]!.jobId)?.error).toMatch(/ffmpeg concat failed/);
    expect(getJobStatus(results[1]!.jobId)?.status).toBe("completed");
    expect(fakeRunner).toHaveBeenCalledTimes(2);
  });
});
