/**
 * Vertical Drama Series — compound episode video assembly (feature 131
 * "download + compound video" upgrade, 2026-07-06).
 *
 * Concatenates every completed shot clip (`motionPromptPack.clips[].videoTask.videoUrl`,
 * in shot order) into a SINGLE mp4 for the whole episode.
 *
 * Architecture decision (see investigation notes in the task packet):
 *  - `apps/web/server/services/verticalDramaAssembly.ts` (`assemble_episode_manifest`
 *    stage) only ever produced a PLAN (concat.txt text + an `ffmpeg_command.sh`
 *    string) — no real render ever executes server-side for that stage.
 *  - The Python backend's `media_job_worker.py` runs a full video-EDITOR timeline
 *    compositor (filter_complex crossfades, subtitle burn-in, BGM ducking) driven
 *    by a `VideoStudio`-shaped project spec — a much heavier and differently-shaped
 *    contract than "concat N already-rendered clips in order." Adapting this
 *    feature to that spec would mean inventing a fake VideoStudio project for every
 *    call, which is MORE new machinery, not less.
 *  - `ffmpeg` (with libx264/aac) is installed directly on this host (see `which
 *    ffmpeg` in the investigation), so a Node-side ffmpeg child-process concat
 *    service, run as a simple non-blocking in-process job (least new machinery,
 *    survives a restart via persisted `assemblyManifest.compiledVideo` status —
 *    same convention as `videoTask.pendingTaskId`/`angleGrid.pendingTaskId`), is
 *    the correct choice here.
 *
 * Because source clips may come from different providers/models (different
 * codecs/fps/resolutions), concatenation uses ffmpeg's `concat` DEMUXER combined
 * with a full re-encode (`-c:v libx264 -c:a aac`, normalized fps/aspect), never
 * the stream-copy path — safe regardless of whether sources happen to share
 * identical codec parameters.
 *
 * Task #21 (W12.5 "Final Render Suite") phase A extends this job — same
 * in-process Node ffmpeg architecture, no new machinery — to OPTIONALLY also
 * mix in dialogue audio, burn in subtitles/speaker names, and composite ad
 * banner overlays. All three new inputs are additive/optional: the big pure
 * filter-graph construction lives in the sibling module
 * `verticalDramaFinalRenderGraph.ts` (kept separate on purpose, see that
 * file's own header doc comment), and when none of the three are supplied
 * this file's ffmpeg invocation is BYTE-IDENTICAL to before this wave.
 */

import { randomUUID } from "crypto";
import { spawn } from "child_process";
import fs from "fs";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { verticalDramaEpisodes } from "../../drizzle/schema";
import { storagePutFromPath } from "../storage";
import type { VerticalDramaMotionPromptPack } from "@shared/verticalDramaSeries";
import type { VdAdBannerPlacementId } from "@shared/verticalDramaSeries/adBannerPresets";
// W12-A voice chain wave — imported by DIRECT PATH (not the shared barrel),
// same convention `audio.ts`'s own doc comment documents for itself (also
// followed by `verticalDramaEpisodes.ts` for the identical type) — its
// `VerticalDramaDialogueAudioPlan` would otherwise collide with the compact,
// unrelated recommendation type of the same name re-exported from
// `@shared/verticalDramaSeries/contracts` through the barrel.
import type { VerticalDramaDialogueAudioPlan } from "@shared/verticalDramaSeries/audio";
import {
  resolveDialogueLineAbsoluteTimings,
  type VdDialogueTimelineClip,
} from "@shared/verticalDramaSeries/dialogueAudioTimeline";
import {
  buildAssSubtitleFile,
  buildFinalRenderFfmpegArgs,
  type AssSubtitleLine,
  type CaptionPresetId,
  type DialogueAudioSegment,
  type ResolvedBanner,
} from "./verticalDramaFinalRenderGraph";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface AssembleEpisodeVideoOwner {
  tenantId: string;
  userId: number;
  seriesId: number;
  episodeId: number;
}

export interface EpisodeClipSource {
  clipNumber: number;
  /** `videoTask.videoUrl` — may be a same-origin `/api/storage/...` path or an
   *  absolute external provider URL. */
  videoUrl?: string;
}

export type CompiledVideoStatus = "pending" | "completed" | "failed";

export interface CompiledVideoState {
  pendingJobId?: string;
  videoUrl?: string;
  durationSeconds?: number;
  shotCount?: number;
  assembledAt?: string;
  status?: CompiledVideoStatus;
  error?: string;
}

export interface MissingClip {
  clipNumber: number;
  sourceShotNumbers?: number[];
}

/* -------------------------------------------------------------------------- */
/* Pure helpers — precondition / partial-assembly logic (unit-testable)       */
/* -------------------------------------------------------------------------- */

/**
 * Shots in clip order (ascending `clipNumber`) that are missing a completed
 * `videoTask.videoUrl`. Empty when every clip has a URL.
 */
export function findMissingClips(clips: EpisodeClipSource[]): MissingClip[] {
  return clips
    .slice()
    .sort((a, b) => a.clipNumber - b.clipNumber)
    .filter(c => !c.videoUrl || !c.videoUrl.trim())
    .map(c => ({ clipNumber: c.clipNumber }));
}

/**
 * Resolve which clips actually go into the concat, honoring `allowPartial`.
 * Throws a plain `Error` with a human-readable, user-facing message (mapped to
 * `PRECONDITION_FAILED` at the router) when clips are missing and partial
 * assembly was not explicitly requested.
 */
export function resolveClipsForAssembly(
  clips: EpisodeClipSource[],
  opts: { allowPartial?: boolean } = {}
): { ordered: EpisodeClipSource[]; missing: MissingClip[] } {
  const ordered = clips.slice().sort((a, b) => a.clipNumber - b.clipNumber);
  const missing = findMissingClips(ordered);

  if (missing.length > 0 && !opts.allowPartial) {
    const list = missing.map(m => m.clipNumber).join(", ");
    throw new Error(
      `vertical_drama_assembly_missing_clips: shot(s)/clip(s) ${list} have no completed video yet. ` +
        `Generate those clips first, or pass allowPartial to concatenate only the completed clips in order.`
    );
  }

  const usable = ordered.filter(c => c.videoUrl && c.videoUrl.trim());
  if (usable.length === 0) {
    throw new Error(
      "vertical_drama_assembly_no_clips: no completed video clips exist for this episode yet."
    );
  }

  return { ordered: usable, missing };
}

/* -------------------------------------------------------------------------- */
/* Filename helpers                                                           */
/* -------------------------------------------------------------------------- */

/** Sanitize a string for safe use inside a filename (no path separators/odd chars). */
function slugForFilename(raw: string | number | undefined | null): string {
  const s = String(raw ?? "").trim();
  if (!s) return "untitled";
  return (
    s
      .normalize("NFKD")
      .replace(/[^\w\-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "untitled"
  );
}

/** `series-{seriesSlug}-ep-{episodeNumber}-compiled.mp4` naming convention. */
export function compiledVideoFilename(args: {
  seriesId: number | string;
  episodeNumber?: number | string;
  seriesTitle?: string;
}): string {
  const seriesPart = slugForFilename(
    args.seriesTitle || `series-${args.seriesId}`
  );
  const epPart = slugForFilename(args.episodeNumber ?? args.seriesId);
  return `series-${seriesPart}-ep-${epPart}-compiled.mp4`;
}

/* -------------------------------------------------------------------------- */
/* FFmpeg command construction (pure — no exec; unit-testable)                */
/* -------------------------------------------------------------------------- */

export interface ConcatCommandSpec {
  /** Absolute paths to each downloaded source clip, in final concat order. */
  inputPaths: string[];
  /** Absolute path to the concat-list (demuxer) file. */
  concatListPath: string;
  /** Absolute output path. */
  outputPath: string;
  fps?: number;
}

/** Build the concat-demuxer list-file CONTENT (ffmpeg `-f concat` format). */
export function buildConcatListFileContent(inputPaths: string[]): string {
  return (
    inputPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join("\n") +
    (inputPaths.length ? "\n" : "")
  );
}

/**
 * Build the ffmpeg argv for a RE-ENCODE concat (never stream-copy — sources
 * may differ in codec/fps/resolution). Returns the argv array (no shell
 * involved — always spawn with `shell: false`).
 */
export function buildConcatFfmpegArgs(spec: ConcatCommandSpec): string[] {
  const fps = spec.fps ?? 30;
  return [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    spec.concatListPath,
    "-r",
    String(fps),
    "-vf",
    "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "medium",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    spec.outputPath,
  ];
}

/* -------------------------------------------------------------------------- */
/* Process execution (thin wrapper — mocked in tests via injected `runFfmpeg`) */
/* -------------------------------------------------------------------------- */

export type FfmpegRunner = (
  args: string[]
) => Promise<{ code: number; stderr: string }>;

/**
 * Resolve the ffmpeg/ffprobe binary to an absolute path. The systemd service
 * PATH does not include `~/.local/bin` (where the static ffmpeg build lives on
 * this host), so a bare `spawn("ffmpeg")` fails with ENOENT in production —
 * same candidate order as `resolveHyperframesFfmpegBinary`.
 */
export function resolveFfBinary(binaryName: "ffmpeg" | "ffprobe"): string {
  const candidates = [
    binaryName === "ffmpeg"
      ? process.env.FFMPEG_PATH
      : process.env.FFPROBE_PATH,
    `/usr/bin/${binaryName}`,
    `/usr/local/bin/${binaryName}`,
    path.join(os.homedir(), ".local/bin", binaryName),
  ].filter((value): value is string => Boolean(value && value.trim()));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return binaryName;
}

/**
 * Resolve a Thai fonts directory for subtitle burn-in (task #21 phase A).
 * `verticalDramaFinalRenderGraph.ts`'s builders deliberately never hardcode an
 * absolute font path (see that module's `SubtitlesInput` doc comment) — this
 * is the one place that resolves an ACTUAL filesystem location, via an env
 * override with filesystem-existence-checked candidates, mirroring
 * `resolveFfBinary`'s exact convention. Returns `undefined` (not a hardcoded
 * fallback path) when nothing resolves — the ffmpeg `subtitles` filter is
 * still valid without `fontsdir` (it falls back to system fontconfig
 * resolution by font family name).
 */
export function resolveVdSubtitleFontsDir(): string | undefined {
  const candidates = [
    process.env.VD_SUBTITLE_FONTS_DIR,
    "/usr/share/fonts/truetype/thai",
    "/usr/share/fonts",
  ].filter((value): value is string => Boolean(value && value.trim()));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

/** Default runner: spawns the real `ffmpeg` binary. Not used in unit tests. */
export const defaultFfmpegRunner: FfmpegRunner = args =>
  new Promise((resolve, reject) => {
    const child = spawn(resolveFfBinary("ffmpeg"), args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", chunk => {
      stderr += chunk.toString();
      if (stderr.length > 64_000) stderr = stderr.slice(-64_000); // cap memory
    });
    child.on("error", reject);
    child.on("close", code => resolve({ code: code ?? -1, stderr }));
  });

/** Probe duration (seconds) of a media file via ffprobe. Best-effort — returns undefined on failure. */
export async function probeDurationSeconds(
  filePath: string
): Promise<number | undefined> {
  return new Promise(resolve => {
    const child = spawn(
      resolveFfBinary("ffprobe"),
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { stdio: ["ignore", "pipe", "ignore"] }
    );
    let out = "";
    child.stdout?.on("data", c => (out += c.toString()));
    child.on("error", () => resolve(undefined));
    child.on("close", () => {
      const n = Number(out.trim());
      resolve(Number.isFinite(n) && n > 0 ? n : undefined);
    });
  });
}

/** Check whether the `ffmpeg`/`ffprobe` binaries are on PATH. Best-effort, cached per call. */
export async function isFfmpegAvailable(): Promise<boolean> {
  const check = (bin: string) =>
    new Promise<boolean>(resolve => {
      const child = spawn(bin, ["-version"], { stdio: "ignore" });
      child.on("error", () => resolve(false));
      child.on("close", code => resolve(code === 0));
    });
  const [ff, fp] = await Promise.all([
    check(resolveFfBinary("ffmpeg")),
    check(resolveFfBinary("ffprobe")),
  ]);
  return ff && fp;
}

/* -------------------------------------------------------------------------- */
/* Source download                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a clip's `videoTask.videoUrl` (possibly a same-origin relative
 * `/api/storage/...` path) to an absolute, fetchable URL and download it to
 * `destPath`. `internalBaseUrl` is the Node server's own origin (needed to
 * fetch same-origin relative paths from server-side code, which has no
 * implicit browser origin).
 */
export async function downloadClipToFile(
  videoUrl: string,
  destPath: string,
  internalBaseUrl: string
): Promise<void> {
  const absoluteUrl = /^https?:\/\//i.test(videoUrl)
    ? videoUrl
    : new URL(videoUrl, internalBaseUrl).toString();
  const res = await fetch(absoluteUrl);
  if (!res.ok || !res.body) {
    throw new Error(
      `Failed to download clip source (${res.status}): ${absoluteUrl}`
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fsp.writeFile(destPath, buf);
}

/** Best-effort file extension for a staged download, sniffed from the URL's
 *  own path (e.g. banner/dialogue-audio asset URLs) — falls back to
 *  `fallback` for a URL with no recognizable extension. Purely cosmetic
 *  (ffmpeg's demuxers probe file CONTENT, not extension, for `-i` inputs —
 *  same reason today's clip staging already uses a fixed `.mp4` regardless of
 *  the source's real container); a real extension just keeps the job temp
 *  dir's contents readable during manual debugging. */
export function inferDownloadExtension(url: string, fallback: string): string {
  try {
    const pathname = new URL(url, "http://internal.invalid").pathname;
    const match = pathname.match(/\.[a-zA-Z0-9]{2,5}$/);
    return match ? match[0] : fallback;
  } catch {
    return fallback;
  }
}

/* -------------------------------------------------------------------------- */
/* In-process job manager (submit → poll)                                     */
/* -------------------------------------------------------------------------- */

interface JobRecord {
  jobId: string;
  owner: AssembleEpisodeVideoOwner;
  status: CompiledVideoStatus;
  error?: string;
}

/** In-memory job table — survives only for the life of this process; durable
 *  recovery across restarts is via `episode.assemblyManifest.compiledVideo`
 *  (persisted at submit + completion), same convention as `videoTask.pendingTaskId`. */
const jobs = new Map<string, JobRecord>();

export function getJobStatus(jobId: string): JobRecord | undefined {
  return jobs.get(jobId);
}

/** Persist `assemblyManifest.compiledVideo` onto the owned episode (JSONB-patch,
 *  same shape convention as `updateEpisodeDraft`'s `assemblyManifest` field). */
async function persistCompiledVideoState(
  owner: AssembleEpisodeVideoOwner,
  patch: CompiledVideoState
): Promise<void> {
  const [row] = await db
    .select({ assemblyManifest: verticalDramaEpisodes.assemblyManifest })
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.id, owner.episodeId),
        eq(verticalDramaEpisodes.tenantId, owner.tenantId),
        eq(verticalDramaEpisodes.userId, owner.userId),
        eq(verticalDramaEpisodes.seriesId, owner.seriesId)
      )
    )
    .limit(1);
  if (!row) throw new Error("vertical_drama_episode_not_found");

  const existing =
    row.assemblyManifest && typeof row.assemblyManifest === "object"
      ? (row.assemblyManifest as Record<string, unknown>)
      : {};
  const existingCompiled =
    existing.compiledVideo && typeof existing.compiledVideo === "object"
      ? (existing.compiledVideo as Record<string, unknown>)
      : {};

  const nextManifest = {
    ...existing,
    compiledVideo: { ...existingCompiled, ...patch },
  };

  await db
    .update(verticalDramaEpisodes)
    .set({
      assemblyManifest: nextManifest as unknown as object,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(verticalDramaEpisodes.id, owner.episodeId),
        eq(verticalDramaEpisodes.tenantId, owner.tenantId)
      )
    );
}

/**
 * Task #21 phase A — additive `assemblyManifest.finalRender` section recording
 * WHAT a render included (counts/presets/flags), not the render inputs
 * themselves (those are transient job-temp-dir staged files, cleaned up after
 * the job finishes). Deliberately a locally-defined type rather than an
 * addition to `VerticalDramaAssemblyManifest`
 * (`@shared/verticalDramaSeries/assembly.ts`) — that file is outside this
 * task's owned/editable file set (read-only: "shared/verticalDramaSeries/**
 * generally"). The value is merged into the SAME `assemblyManifest` jsonb
 * column under a brand-new `finalRender` top-level key using the identical
 * read-modify-write convention `persistCompiledVideoState` already uses for
 * `compiledVideo` — existing readers, which only look for keys they already
 * know about, are unaffected by a new key appearing alongside them. A future
 * wave that wires this into a router/UI should promote this type into
 * `assembly.ts` for full cross-module type safety.
 */
export interface FinalRenderManifestSection {
  bannerCount: number;
  dialogueAudioSegmentCount: number;
  loudnessNormalize: boolean;
  subtitlePreset?: CaptionPresetId;
  subtitleLineCount: number;
  renderedAt: string;
}

/** Best-effort persist of `assemblyManifest.finalRender` — mirrors
 *  `persistCompiledVideoState`'s read-modify-write, but never throws (called
 *  AFTER the main compiled-video persist already succeeded; a failure here
 *  must not flip an otherwise-successful job to "failed"). */
async function persistFinalRenderManifestSection(
  owner: AssembleEpisodeVideoOwner,
  section: FinalRenderManifestSection
): Promise<void> {
  const [row] = await db
    .select({ assemblyManifest: verticalDramaEpisodes.assemblyManifest })
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.id, owner.episodeId),
        eq(verticalDramaEpisodes.tenantId, owner.tenantId),
        eq(verticalDramaEpisodes.userId, owner.userId),
        eq(verticalDramaEpisodes.seriesId, owner.seriesId)
      )
    )
    .limit(1);
  if (!row) return;

  const existing =
    row.assemblyManifest && typeof row.assemblyManifest === "object"
      ? (row.assemblyManifest as Record<string, unknown>)
      : {};
  const nextManifest = { ...existing, finalRender: section };

  await db
    .update(verticalDramaEpisodes)
    .set({
      assemblyManifest: nextManifest as unknown as object,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(verticalDramaEpisodes.id, owner.episodeId),
        eq(verticalDramaEpisodes.tenantId, owner.tenantId)
      )
    );
}

/* -------------------------------------------------------------------------- */
/* Final render inputs (task #21 phase A) — REMOTE-url shaped; the job stages */
/* them to local files the same way clips already are, before handing        */
/* LOCAL paths to `verticalDramaFinalRenderGraph.ts`'s builders.             */
/* -------------------------------------------------------------------------- */

export interface RunAssemblyJobBannerInput {
  /** Same-origin `/api/storage/...` path or absolute provider/storage URL —
   *  resolved against `internalBaseUrl` exactly like `EpisodeClipSource.videoUrl`. */
  imageUrl: string;
  placementId: VdAdBannerPlacementId;
  sideAlign?: "left" | "right";
  startSec: number;
  endSec: number;
  fadeSec: number;
  /**
   * Task #21 phase B fix for the documented "entire" duration limitation
   * (see `verticalDramaEpisodes.ts`'s `resolveEpisodeAdBannerRunInputs` doc
   * comment for the full investigation). When `true`, `startSec`/`endSec`
   * above are ADVISORY only — a pre-render estimate the caller had to use
   * (e.g. the episode's `targetDurationSeconds`, since the REAL total
   * duration isn't known until source clips are downloaded and probed,
   * deep inside `runAssemblyJob`, well after a caller like
   * `assembleEpisodeVideo` has already returned a `jobId`). `runAssemblyJob`
   * re-resolves this banner's window to `[0, probedTotalDurationSeconds]`
   * AFTER its own duration probe, then hands the RESOLVED value to
   * `buildFinalRenderFfmpegArgs` (which stays strict/pure — it only ever
   * receives already-resolved values, see that module's own doc comment).
   * This makes an "entire video" banner selection correct regardless of
   * whether the real rendered duration ends up SHORTER (previously: made
   * `validateResolvedBanners` reject the banner as out-of-bounds and fail
   * the WHOLE render job, not just skip that banner) or LONGER (previously:
   * the banner silently stopped covering part of the video) than the
   * pre-render advisory estimate. Omitted/`false` (the default) preserves
   * byte-identical behavior for every pre-existing caller that never sets
   * it — `startSec`/`endSec` are used exactly as given, unchanged.
   */
  entire?: boolean;
}

export interface RunAssemblyJobDialogueAudioSegmentInput {
  audioUrl: string;
  startSec: number;
  gainDb?: number;
}

export interface RunAssemblyJobDialogueAudioInput {
  segments: RunAssemblyJobDialogueAudioSegmentInput[];
  loudnessNormalize?: boolean;
  /** See `DialogueAudioInput.duckClipAudioDb` in `verticalDramaFinalRenderGraph.ts` —
   *  accepted for contract parity with phase B; a documented no-op today. */
  duckClipAudioDb?: number;
}

export interface RunAssemblyJobSubtitlesInput {
  preset: CaptionPresetId;
  lines: AssSubtitleLine[];
  /** Overrides `resolveVdSubtitleFontsDir()`'s auto-resolution when supplied. */
  fontsDir?: string;
}

export interface RunAssemblyJobArgs {
  owner: AssembleEpisodeVideoOwner;
  jobId: string;
  clips: EpisodeClipSource[];
  internalBaseUrl: string;
  filename: string;
  storageKeyPrefix?: string;
  ffmpegRunner?: FfmpegRunner;
  /** Task #21 phase A additive inputs — all optional; omitting all three
   *  produces a BYTE-IDENTICAL ffmpeg invocation to before this wave (see
   *  `verticalDramaFinalRenderGraph.ts`'s regression lock). */
  banners?: RunAssemblyJobBannerInput[];
  dialogueAudio?: RunAssemblyJobDialogueAudioInput;
  subtitles?: RunAssemblyJobSubtitlesInput | null;
  /** Test injection point for the total-source-duration probe the final-render
   *  path needs up front (banner timing/validation) — mirrors `ffmpegRunner`'s
   *  existing injection convention so tests never need a real `ffprobe`
   *  process. Defaults to the real `probeDurationSeconds`. */
  probeDurationSecondsFn?: (filePath: string) => Promise<number | undefined>;
}

/**
 * Runs the actual concat job: download sources -> build concat list -> ffmpeg
 * re-encode -> upload -> persist. Not awaited by the submitting mutation (fire
 * and forget) — the caller polls `assemblyManifest.compiledVideo` (or
 * `getJobStatus` while this process is alive) for completion.
 *
 * Task #21 phase A: when `banners`/`dialogueAudio`/`subtitles` are supplied,
 * this additionally stages those remote assets to `workDir` (mirroring how
 * clips are staged, same `downloadClipToFile` helper, same cleanup via the
 * `finally` block below) and routes the ffmpeg invocation through
 * `buildFinalRenderFfmpegArgs` instead of `buildConcatFfmpegArgs`. When ALL
 * THREE are absent, behavior is 100% unchanged from before this wave.
 */
export async function runAssemblyJob(args: RunAssemblyJobArgs): Promise<void> {
  const { owner, jobId, clips, internalBaseUrl, filename } = args;
  const runner = args.ffmpegRunner ?? defaultFfmpegRunner;
  const probeDuration = args.probeDurationSecondsFn ?? probeDurationSeconds;
  jobs.set(jobId, { jobId, owner, status: "pending" });

  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), "vd-assembly-"));
  try {
    const inputPaths: string[] = [];
    for (const clip of clips) {
      const dest = path.join(
        workDir,
        `clip-${String(clip.clipNumber).padStart(3, "0")}.mp4`
      );
      await downloadClipToFile(clip.videoUrl!, dest, internalBaseUrl);
      inputPaths.push(dest);
    }

    const concatListPath = path.join(workDir, "concat.txt");
    await fsp.writeFile(
      concatListPath,
      buildConcatListFileContent(inputPaths),
      "utf8"
    );

    const outputPath = path.join(workDir, "output.mp4");

    const hasFinalRenderInputs = Boolean(
      args.banners?.length ||
      args.dialogueAudio?.segments?.length ||
      args.dialogueAudio?.loudnessNormalize ||
      args.subtitles
    );

    let ffArgs: string[];
    let finalRenderSummary: FinalRenderManifestSection | undefined;

    if (!hasFinalRenderInputs) {
      ffArgs = buildConcatFfmpegArgs({
        inputPaths,
        concatListPath,
        outputPath,
      });
    } else {
      // Stage banner images (additive) — same download helper/convention as clips.
      const resolvedBanners: ResolvedBanner[] = [];
      for (const [index, banner] of (args.banners ?? []).entries()) {
        const dest = path.join(
          workDir,
          `banner-${String(index).padStart(2, "0")}${inferDownloadExtension(banner.imageUrl, ".png")}`
        );
        await downloadClipToFile(banner.imageUrl, dest, internalBaseUrl);
        resolvedBanners.push({
          localPngPath: dest,
          placementId: banner.placementId,
          sideAlign: banner.sideAlign,
          startSec: banner.startSec,
          endSec: banner.endSec,
          fadeSec: banner.fadeSec,
        });
      }

      // Stage dialogue-audio segments (additive) — same download helper/convention as clips.
      const resolvedDialogueSegments: DialogueAudioSegment[] = [];
      for (const [index, segment] of (
        args.dialogueAudio?.segments ?? []
      ).entries()) {
        const dest = path.join(
          workDir,
          `dialogue-${String(index).padStart(3, "0")}${inferDownloadExtension(segment.audioUrl, ".mp3")}`
        );
        await downloadClipToFile(segment.audioUrl, dest, internalBaseUrl);
        resolvedDialogueSegments.push({
          localPath: dest,
          startSec: segment.startSec,
          gainDb: segment.gainDb,
        });
      }

      // Generate the subtitle `.ass` locally — synthesized, not downloaded.
      let subtitlesForGraph: { assPath: string; fontsDir?: string } | undefined;
      if (args.subtitles && args.subtitles.lines.length > 0) {
        const fontsDir = args.subtitles.fontsDir ?? resolveVdSubtitleFontsDir();
        const assContent = buildAssSubtitleFile(
          args.subtitles.lines,
          args.subtitles.preset,
          {
            fontsDir,
            playResX: 1080,
            playResY: 1920,
          }
        );
        const assPath = path.join(workDir, "captions.ass");
        await fsp.writeFile(assPath, assContent, "utf8");
        subtitlesForGraph = { assPath, fontsDir };
      }

      // Total source duration, needed up front for banner timing/validation —
      // summed from the already-downloaded clips (concat never re-times
      // individual clips, so this matches the final output's duration).
      const perClipDurations = await Promise.all(
        inputPaths.map(p => probeDuration(p))
      );
      const missingProbeIndex = perClipDurations.findIndex(d => d == null);
      if (missingProbeIndex !== -1) {
        throw new Error(
          `vertical_drama_final_render_duration_probe_failed: could not determine duration of source clip ${missingProbeIndex + 1}/${inputPaths.length}.`
        );
      }
      const videoDurationSeconds = perClipDurations.reduce(
        (sum: number, d) => sum + (d as number),
        0
      );

      // Task #21 phase B — re-resolve `entire: true` banners to the REAL
      // probed `videoDurationSeconds` (see `RunAssemblyJobBannerInput.entire`'s
      // own doc comment for the full "why"). `resolvedBanners[i]` corresponds
      // 1:1 with `args.banners[i]` (the staging loop above never filters),
      // so a plain index zip is safe. Banners without `entire: true` pass
      // through with their caller-supplied window untouched — backward
      // compatible for every pre-existing caller. The pure graph builder
      // below (`buildFinalRenderFfmpegArgs` -> `validateResolvedBanners`)
      // stays strict and receives only already-resolved values.
      const entireResolvedBanners: ResolvedBanner[] = resolvedBanners.map(
        (banner, index) =>
          args.banners?.[index]?.entire
            ? { ...banner, startSec: 0, endSec: videoDurationSeconds }
            : banner
      );

      ffArgs = buildFinalRenderFfmpegArgs({
        concatListPath,
        output: outputPath,
        videoDurationSeconds,
        banners: entireResolvedBanners.length > 0 ? entireResolvedBanners : undefined,
        dialogueAudio:
          resolvedDialogueSegments.length > 0 ||
          args.dialogueAudio?.loudnessNormalize
            ? {
                segments: resolvedDialogueSegments,
                loudnessNormalize: args.dialogueAudio?.loudnessNormalize,
                duckClipAudioDb: args.dialogueAudio?.duckClipAudioDb,
              }
            : undefined,
        subtitles: subtitlesForGraph ?? null,
      });

      finalRenderSummary = {
        bannerCount: resolvedBanners.length,
        dialogueAudioSegmentCount: resolvedDialogueSegments.length,
        loudnessNormalize: args.dialogueAudio?.loudnessNormalize === true,
        subtitlePreset: args.subtitles?.preset,
        subtitleLineCount: args.subtitles?.lines?.length ?? 0,
        renderedAt: new Date().toISOString(),
      };
    }

    const result = await runner(ffArgs);
    if (result.code !== 0) {
      throw new Error(
        `ffmpeg concat failed (exit ${result.code}): ${result.stderr.slice(-2000)}`
      );
    }

    // Uses the (possibly injected) `probeDuration`, not the raw
    // `probeDurationSeconds` import — see task #25 flake investigation in
    // `verticalDramaEpisodeVideoAssembly.test.ts`: this call previously always
    // spawned a REAL `ffprobe` child process against `outputPath` even in
    // unit tests (mocked `ffmpegRunner` never actually writes that file), and
    // that spawn's variable OS-level latency was the dominant cause of an
    // intermittent test race against a fixed-duration wait for job
    // completion. Production behavior is unchanged (defaults to the real
    // `probeDurationSeconds`); tests now inject a synchronous fake.
    const durationSeconds = await probeDuration(outputPath);

    const storageKey = `${args.storageKeyPrefix ?? "vertical-drama/compiled"}/${owner.seriesId}/${owner.episodeId}/${randomUUID()}-${filename}`;
    const { url } = await storagePutFromPath(
      storageKey,
      outputPath,
      "video/mp4"
    );

    jobs.set(jobId, { jobId, owner, status: "completed" });
    await persistCompiledVideoState(owner, {
      pendingJobId: undefined,
      videoUrl: url,
      durationSeconds,
      shotCount: clips.length,
      assembledAt: new Date().toISOString(),
      status: "completed",
    });

    if (finalRenderSummary) {
      await persistFinalRenderManifestSection(owner, finalRenderSummary).catch(
        () => {
          /* best-effort — the compiled video itself already succeeded and was
           * persisted above; losing this auxiliary summary must never flip an
           * otherwise-successful job to "failed". */
        }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    jobs.set(jobId, { jobId, owner, status: "failed", error: message });
    await persistCompiledVideoState(owner, {
      pendingJobId: undefined,
      status: "failed",
      error: message,
    }).catch(() => {
      /* best-effort — job status is still readable via jobs map while process is alive */
    });
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Submit a new assembly job: persists the `pendingJobId` synchronously (so a
 *  reload/navigation before completion can resume via `assemblyManifest`),
 *  then kicks off `runAssemblyJob` in the background (not awaited). */
export async function submitAssemblyJob(args: {
  owner: AssembleEpisodeVideoOwner;
  clips: EpisodeClipSource[];
  internalBaseUrl: string;
  filename: string;
  ffmpegRunner?: FfmpegRunner;
  banners?: RunAssemblyJobBannerInput[];
  dialogueAudio?: RunAssemblyJobDialogueAudioInput;
  subtitles?: RunAssemblyJobSubtitlesInput | null;
  probeDurationSecondsFn?: (filePath: string) => Promise<number | undefined>;
}): Promise<{ jobId: string }> {
  const jobId = randomUUID();
  await persistCompiledVideoState(args.owner, {
    pendingJobId: jobId,
    status: "pending",
    error: undefined,
  });
  jobs.set(jobId, { jobId, owner: args.owner, status: "pending" });

  // Fire-and-forget — errors are captured inside runAssemblyJob and persisted.
  void runAssemblyJob({
    owner: args.owner,
    jobId,
    clips: args.clips,
    internalBaseUrl: args.internalBaseUrl,
    filename: args.filename,
    ffmpegRunner: args.ffmpegRunner,
    banners: args.banners,
    dialogueAudio: args.dialogueAudio,
    subtitles: args.subtitles,
    probeDurationSecondsFn: args.probeDurationSecondsFn,
  });

  return { jobId };
}

/* -------------------------------------------------------------------------- */
/* Dialogue audio + subtitles render feed (task #21 phase B)                  */
/* -------------------------------------------------------------------------- */

/**
 * Build the render engine's dialogue-audio + subtitles feed
 * (`RunAssemblyJobDialogueAudioInput`/`RunAssemblyJobSubtitlesInput` above —
 * already fully wired end to end through `runAssemblyJob` ->
 * `buildFinalRenderFfmpegArgs` since phase A) from an episode's persisted
 * `dialogueAudioPlan`. Pure, DB-free — lives in THIS service (rather than
 * router-local, unlike the banner-feeding `resolveEpisodeAdBannerRunInputs`
 * in `verticalDramaEpisodes.ts`) specifically so BOTH `verticalDramaEpisodes.ts`
 * (`assembleEpisodeVideo`) and `verticalDramaSeries.ts` (`assembleSeasonVideos`)
 * can call it without either router importing the OTHER router (forbidden —
 * see both routers' own "narrow `vi.mock` sibling test" doc comments).
 *
 * - Subtitles are built from `plan.dialogueLines` whenever `subtitlePreset`
 *   requests real burn-in (any value other than `undefined`/`"none"`/
 *   `"no_subtitle_style"`) — independent of `includeDialogueAudio`, since
 *   subtitle text comes straight from the SCRIPT, not from any TTS output
 *   (task #21 phase B: "subtitles work from script text"). The CALLER is
 *   responsible for deciding whether `includeDialogueAudio` may be true at
 *   all (e.g. gating it on the `verticalDramaSeriesVoiceChain` tenant flag —
 *   this function has no flag/tenant awareness of its own).
 * - Dialogue audio segments are built ONLY for lines whose `separateTtsPlan`
 *   item (matched by `lineId`) carries a completed `audioTask.audioUrl` AND
 *   only when `includeDialogueAudio` is true. A line with no completed audio
 *   is skipped from `dialogueAudio.segments` but is NOT skipped from
 *   `subtitles.lines` — captions render from the script regardless of
 *   whether that line's own audio has finished synthesizing yet.
 * - `loudnessNormalize` is only ever surfaced when at least one audio
 *   segment was actually resolved — a bare `loudnessNormalize: true` with
 *   zero segments (e.g. every line still pending TTS) would silently
 *   normalize the base clip audio track instead of doing nothing, which is
 *   surprising for a toggle labeled "normalize the dialogue audio."
 * - Absolute timing for both outputs comes from
 *   `resolveDialogueLineAbsoluteTimings` (`@shared/verticalDramaSeries/dialogueAudioTimeline`)
 *   — see that module's own doc comment for the shot-local -> absolute
 *   timeline conversion and its deterministic sequential-estimate fallback
 *   for lines with no resolvable clip mapping.
 */
export interface VdEpisodeDialogueAudioSubtitlesRunInputs {
  dialogueAudio?: RunAssemblyJobDialogueAudioInput;
  subtitles?: RunAssemblyJobSubtitlesInput;
  dialogueAudioSegmentsIncluded: number;
  subtitleLinesIncluded: number;
}

export function resolveEpisodeDialogueAudioAndSubtitlesRunInputs(params: {
  plan: VerticalDramaDialogueAudioPlan | null | undefined;
  motionClips: VdDialogueTimelineClip[];
  includedClipNumbers: number[];
  includeDialogueAudio: boolean;
  loudnessNormalize: boolean;
  subtitlePreset: CaptionPresetId | "none" | undefined;
}): VdEpisodeDialogueAudioSubtitlesRunInputs {
  const lines = params.plan?.dialogueLines ?? [];
  const wantsSubtitles =
    params.subtitlePreset != null &&
    params.subtitlePreset !== "none" &&
    params.subtitlePreset !== "no_subtitle_style";

  if (lines.length === 0 || (!params.includeDialogueAudio && !wantsSubtitles)) {
    return { dialogueAudioSegmentsIncluded: 0, subtitleLinesIncluded: 0 };
  }

  const timings = resolveDialogueLineAbsoluteTimings(
    lines,
    params.motionClips,
    params.includedClipNumbers
  );

  const audioUrlByLineId = new Map<string, string>();
  if (params.includeDialogueAudio) {
    for (const item of params.plan?.separateTtsPlan?.items ?? []) {
      const audioUrl = item.audioTask?.audioUrl;
      if (audioUrl && audioUrl.trim()) {
        audioUrlByLineId.set(item.lineId, audioUrl);
      }
    }
  }

  const segments: RunAssemblyJobDialogueAudioSegmentInput[] = [];
  const subtitleLines: AssSubtitleLine[] = [];

  for (const timing of timings) {
    if (wantsSubtitles && timing.text.trim()) {
      subtitleLines.push({
        startSec: timing.absoluteStartSec,
        endSec: timing.absoluteEndSec,
        // Narration lines omit the speaker-name chip (see `buildAssDialogueEvent`
        // in `verticalDramaFinalRenderGraph.ts`) — "speakerName from character
        // name" (task #21 phase B) does not apply to a narrator line, which
        // has no speaking character.
        speakerName: timing.isNarration ? undefined : timing.speakerName,
        text: timing.text,
      });
    }
    if (params.includeDialogueAudio) {
      const audioUrl = audioUrlByLineId.get(timing.lineId);
      if (audioUrl) {
        segments.push({ audioUrl, startSec: timing.absoluteStartSec });
      }
    }
  }

  return {
    dialogueAudio:
      params.includeDialogueAudio && segments.length > 0
        ? { segments, loudnessNormalize: params.loudnessNormalize }
        : undefined,
    subtitles:
      wantsSubtitles && subtitleLines.length > 0
        ? { preset: params.subtitlePreset as CaptionPresetId, lines: subtitleLines }
        : undefined,
    dialogueAudioSegmentsIncluded: segments.length,
    subtitleLinesIncluded: subtitleLines.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Season batch render — sequential job chain (task #21 phase B)              */
/* -------------------------------------------------------------------------- */

export interface SequentialAssemblyJobSpec {
  owner: AssembleEpisodeVideoOwner;
  clips: EpisodeClipSource[];
  filename: string;
  /**
   * Reserved for a future wave — `assembleSeasonVideos`
   * (`verticalDramaSeries.ts`) does not populate this today. Per-episode ad
   * banner feeding (`resolveEpisodeAdBannerRunInputs`) is currently
   * ROUTER-LOCAL to `verticalDramaEpisodes.ts` with a deliberately
   * lazy-loaded, approval-gated dependency chain (see that router's own Ad
   * Banner Overlay import-block doc comment) — relocating it into this
   * shared service so the series router could call it too is a larger,
   * separate refactor, out of this wave's scope. Accepted here so the
   * orchestrator's contract does not need to change again once that
   * follow-up lands.
   */
  banners?: RunAssemblyJobBannerInput[];
  dialogueAudio?: RunAssemblyJobDialogueAudioInput;
  subtitles?: RunAssemblyJobSubtitlesInput | null;
}

export interface SequentialAssemblyJobResult {
  episodeId: number;
  jobId: string;
}

/**
 * Submit N episodes' assembly jobs as ONE in-process SEQUENTIAL chain (task
 * #21 phase B, season batch render — `verticalDramaSeries.ts`'s
 * `assembleSeasonVideos`). Every episode's `jobId` is minted and its
 * `assemblyManifest.compiledVideo.pendingJobId` persisted SYNCHRONOUSLY up
 * front (in parallel across episodes — independent rows, no write conflict)
 * — mirroring `submitAssemblyJob`'s own "persist pending state before
 * returning" contract, so a caller sees every episode as "queued"
 * immediately and each is independently resumable across a reload exactly
 * like a single `submitAssemblyJob` call already is.
 *
 * The underlying ffmpeg RUNS are chained ONE AT A TIME, never N-at-once:
 * episode 2's ffmpeg process is only spawned once episode 1's
 * `runAssemblyJob` call has SETTLED (success or failure) — matching a
 * season-wide render's realistic resource budget on a single host (see this
 * module's header doc comment on why a simple in-process child-process
 * architecture was chosen at all for this feature).
 *
 * The returned promise resolves once every jobId has been minted (fast — no
 * ffmpeg has necessarily run yet for anything past the first episode); the
 * sequential ffmpeg chain itself continues in the background, fire-and-forget
 * from the caller's perspective, exactly like a single `runAssemblyJob` call
 * already is. A per-episode failure is caught and does NOT stop the chain —
 * `runAssemblyJob` already persists a `"failed"` `compiledVideo` state for
 * that one episode internally (never throws), and the next episode in the
 * chain still runs; the `catch` below exists as defense-in-depth only.
 */
export async function submitSequentialAssemblyJobs(
  specs: SequentialAssemblyJobSpec[],
  internalBaseUrl: string,
  ffmpegRunner?: FfmpegRunner,
  probeDurationSecondsFn?: (filePath: string) => Promise<number | undefined>
): Promise<SequentialAssemblyJobResult[]> {
  const results = await Promise.all(
    specs.map(async spec => {
      const jobId = randomUUID();
      await persistCompiledVideoState(spec.owner, {
        pendingJobId: jobId,
        status: "pending",
        error: undefined,
      });
      jobs.set(jobId, { jobId, owner: spec.owner, status: "pending" });
      return { episodeId: spec.owner.episodeId, jobId };
    })
  );

  // Fire the SEQUENTIAL chain in the background (not awaited by the caller)
  // — each `runAssemblyJob` call is awaited before the next one starts.
  void (async () => {
    for (let index = 0; index < specs.length; index += 1) {
      const spec = specs[index]!;
      const jobId = results[index]!.jobId;
      try {
        await runAssemblyJob({
          owner: spec.owner,
          jobId,
          clips: spec.clips,
          internalBaseUrl,
          filename: spec.filename,
          ffmpegRunner,
          banners: spec.banners,
          dialogueAudio: spec.dialogueAudio,
          subtitles: spec.subtitles,
          probeDurationSecondsFn,
        });
      } catch {
        // Defense-in-depth only — see doc comment above. Continue the chain
        // regardless so one bad episode never blocks the rest of the season.
      }
    }
  })();

  return results;
}

/* -------------------------------------------------------------------------- */
/* Motion-prompt-pack clip extraction helper                                  */
/* -------------------------------------------------------------------------- */

/** Extract `{clipNumber, videoUrl}` sources, in clip order, from a persisted
 *  `motionPromptPack`. Missing pack/clips → empty array. */
export function extractClipSourcesFromMotionPromptPack(
  pack: VerticalDramaMotionPromptPack | null | undefined
): EpisodeClipSource[] {
  if (!pack?.clips?.length) return [];
  return pack.clips
    .slice()
    .sort((a, b) => a.clipNumber - b.clipNumber)
    .map(c => ({ clipNumber: c.clipNumber, videoUrl: c.videoTask?.videoUrl }));
}

/* -------------------------------------------------------------------------- */
/* Self-test (synthetic, non-user-data) — verifies the ffmpeg path end to end  */
/* -------------------------------------------------------------------------- */

/**
 * Generates two tiny synthetic 1s color clips with ffmpeg itself (no user
 * data, no network) and runs them through `buildConcatListFileContent` +
 * `buildConcatFfmpegArgs` + the real ffmpeg binary, to prove the concat path
 * works end to end on this host. Returns the output path (caller should clean
 * up) or throws on any failure. Intended for manual verification / smoke
 * tests only — never invoked from the tRPC router.
 */
export async function runSyntheticFfmpegSelfTest(
  runner: FfmpegRunner = defaultFfmpegRunner
): Promise<{ outputPath: string; workDir: string; durationSeconds?: number }> {
  const workDir = await fsp.mkdtemp(
    path.join(os.tmpdir(), "vd-assembly-selftest-")
  );
  const clipA = path.join(workDir, "a.mp4");
  const clipB = path.join(workDir, "b.mp4");

  const genClip = (dest: string, color: string) =>
    runner([
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${color}:s=1080x1920:d=1`,
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=44100:cl=stereo",
      "-t",
      "1",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      dest,
    ]);

  const [genA, genB] = await Promise.all([
    genClip(clipA, "red"),
    genClip(clipB, "blue"),
  ]);
  if (genA.code !== 0)
    throw new Error(
      `self-test clip A generation failed: ${genA.stderr.slice(-1000)}`
    );
  if (genB.code !== 0)
    throw new Error(
      `self-test clip B generation failed: ${genB.stderr.slice(-1000)}`
    );
  if (!fs.existsSync(clipA) || !fs.existsSync(clipB)) {
    throw new Error("self-test: generated clips missing on disk");
  }

  const concatListPath = path.join(workDir, "concat.txt");
  await fsp.writeFile(
    concatListPath,
    buildConcatListFileContent([clipA, clipB]),
    "utf8"
  );
  const outputPath = path.join(workDir, "output.mp4");
  const args = buildConcatFfmpegArgs({
    inputPaths: [clipA, clipB],
    concatListPath,
    outputPath,
  });
  const result = await runner(args);
  if (result.code !== 0) {
    throw new Error(`self-test concat failed: ${result.stderr.slice(-2000)}`);
  }
  const durationSeconds = await probeDurationSeconds(outputPath);
  return { outputPath, workDir, durationSeconds };
}
