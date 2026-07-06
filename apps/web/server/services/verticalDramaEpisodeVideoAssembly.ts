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
    .filter((c) => !c.videoUrl || !c.videoUrl.trim())
    .map((c) => ({ clipNumber: c.clipNumber }));
}

/**
 * Resolve which clips actually go into the concat, honoring `allowPartial`.
 * Throws a plain `Error` with a human-readable, user-facing message (mapped to
 * `PRECONDITION_FAILED` at the router) when clips are missing and partial
 * assembly was not explicitly requested.
 */
export function resolveClipsForAssembly(
  clips: EpisodeClipSource[],
  opts: { allowPartial?: boolean } = {},
): { ordered: EpisodeClipSource[]; missing: MissingClip[] } {
  const ordered = clips.slice().sort((a, b) => a.clipNumber - b.clipNumber);
  const missing = findMissingClips(ordered);

  if (missing.length > 0 && !opts.allowPartial) {
    const list = missing.map((m) => m.clipNumber).join(", ");
    throw new Error(
      `vertical_drama_assembly_missing_clips: shot(s)/clip(s) ${list} have no completed video yet. ` +
        `Generate those clips first, or pass allowPartial to concatenate only the completed clips in order.`,
    );
  }

  const usable = ordered.filter((c) => c.videoUrl && c.videoUrl.trim());
  if (usable.length === 0) {
    throw new Error("vertical_drama_assembly_no_clips: no completed video clips exist for this episode yet.");
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
  return s
    .normalize("NFKD")
    .replace(/[^\w\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "untitled";
}

/** `series-{seriesSlug}-ep-{episodeNumber}-compiled.mp4` naming convention. */
export function compiledVideoFilename(args: {
  seriesId: number | string;
  episodeNumber?: number | string;
  seriesTitle?: string;
}): string {
  const seriesPart = slugForFilename(args.seriesTitle || `series-${args.seriesId}`);
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
    inputPaths
      .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
      .join("\n") + (inputPaths.length ? "\n" : "")
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

export type FfmpegRunner = (args: string[]) => Promise<{ code: number; stderr: string }>;

/** Default runner: spawns the real `ffmpeg` binary. Not used in unit tests. */
export const defaultFfmpegRunner: FfmpegRunner = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 64_000) stderr = stderr.slice(-64_000); // cap memory
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, stderr }));
  });

/** Probe duration (seconds) of a media file via ffprobe. Best-effort — returns undefined on failure. */
export async function probeDurationSeconds(filePath: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const child = spawn(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    let out = "";
    child.stdout?.on("data", (c) => (out += c.toString()));
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
    new Promise<boolean>((resolve) => {
      const child = spawn(bin, ["-version"], { stdio: "ignore" });
      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
    });
  const [ff, fp] = await Promise.all([check("ffmpeg"), check("ffprobe")]);
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
  internalBaseUrl: string,
): Promise<void> {
  const absoluteUrl = /^https?:\/\//i.test(videoUrl)
    ? videoUrl
    : new URL(videoUrl, internalBaseUrl).toString();
  const res = await fetch(absoluteUrl);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download clip source (${res.status}): ${absoluteUrl}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fsp.writeFile(destPath, buf);
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
  patch: CompiledVideoState,
): Promise<void> {
  const [row] = await db
    .select({ assemblyManifest: verticalDramaEpisodes.assemblyManifest })
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.id, owner.episodeId),
        eq(verticalDramaEpisodes.tenantId, owner.tenantId),
        eq(verticalDramaEpisodes.userId, owner.userId),
        eq(verticalDramaEpisodes.seriesId, owner.seriesId),
      ),
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
    .set({ assemblyManifest: nextManifest as unknown as object, updatedAt: new Date() })
    .where(
      and(
        eq(verticalDramaEpisodes.id, owner.episodeId),
        eq(verticalDramaEpisodes.tenantId, owner.tenantId),
      ),
    );
}

export interface RunAssemblyJobArgs {
  owner: AssembleEpisodeVideoOwner;
  jobId: string;
  clips: EpisodeClipSource[];
  internalBaseUrl: string;
  filename: string;
  storageKeyPrefix?: string;
  ffmpegRunner?: FfmpegRunner;
}

/**
 * Runs the actual concat job: download sources -> build concat list -> ffmpeg
 * re-encode -> upload -> persist. Not awaited by the submitting mutation (fire
 * and forget) — the caller polls `assemblyManifest.compiledVideo` (or
 * `getJobStatus` while this process is alive) for completion.
 */
export async function runAssemblyJob(args: RunAssemblyJobArgs): Promise<void> {
  const { owner, jobId, clips, internalBaseUrl, filename } = args;
  const runner = args.ffmpegRunner ?? defaultFfmpegRunner;
  jobs.set(jobId, { jobId, owner, status: "pending" });

  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), "vd-assembly-"));
  try {
    const inputPaths: string[] = [];
    for (const clip of clips) {
      const dest = path.join(workDir, `clip-${String(clip.clipNumber).padStart(3, "0")}.mp4`);
      await downloadClipToFile(clip.videoUrl!, dest, internalBaseUrl);
      inputPaths.push(dest);
    }

    const concatListPath = path.join(workDir, "concat.txt");
    await fsp.writeFile(concatListPath, buildConcatListFileContent(inputPaths), "utf8");

    const outputPath = path.join(workDir, "output.mp4");
    const ffArgs = buildConcatFfmpegArgs({ inputPaths, concatListPath, outputPath });
    const result = await runner(ffArgs);
    if (result.code !== 0) {
      throw new Error(`ffmpeg concat failed (exit ${result.code}): ${result.stderr.slice(-2000)}`);
    }

    const durationSeconds = await probeDurationSeconds(outputPath);

    const storageKey = `${args.storageKeyPrefix ?? "vertical-drama/compiled"}/${owner.seriesId}/${owner.episodeId}/${randomUUID()}-${filename}`;
    const { url } = await storagePutFromPath(storageKey, outputPath, "video/mp4");

    jobs.set(jobId, { jobId, owner, status: "completed" });
    await persistCompiledVideoState(owner, {
      pendingJobId: undefined,
      videoUrl: url,
      durationSeconds,
      shotCount: clips.length,
      assembledAt: new Date().toISOString(),
      status: "completed",
    });
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
}): Promise<{ jobId: string }> {
  const jobId = randomUUID();
  await persistCompiledVideoState(args.owner, { pendingJobId: jobId, status: "pending", error: undefined });
  jobs.set(jobId, { jobId, owner: args.owner, status: "pending" });

  // Fire-and-forget — errors are captured inside runAssemblyJob and persisted.
  void runAssemblyJob({
    owner: args.owner,
    jobId,
    clips: args.clips,
    internalBaseUrl: args.internalBaseUrl,
    filename: args.filename,
    ffmpegRunner: args.ffmpegRunner,
  });

  return { jobId };
}

/* -------------------------------------------------------------------------- */
/* Motion-prompt-pack clip extraction helper                                  */
/* -------------------------------------------------------------------------- */

/** Extract `{clipNumber, videoUrl}` sources, in clip order, from a persisted
 *  `motionPromptPack`. Missing pack/clips → empty array. */
export function extractClipSourcesFromMotionPromptPack(
  pack: VerticalDramaMotionPromptPack | null | undefined,
): EpisodeClipSource[] {
  if (!pack?.clips?.length) return [];
  return pack.clips
    .slice()
    .sort((a, b) => a.clipNumber - b.clipNumber)
    .map((c) => ({ clipNumber: c.clipNumber, videoUrl: c.videoTask?.videoUrl }));
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
  runner: FfmpegRunner = defaultFfmpegRunner,
): Promise<{ outputPath: string; workDir: string; durationSeconds?: number }> {
  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), "vd-assembly-selftest-"));
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

  const [genA, genB] = await Promise.all([genClip(clipA, "red"), genClip(clipB, "blue")]);
  if (genA.code !== 0) throw new Error(`self-test clip A generation failed: ${genA.stderr.slice(-1000)}`);
  if (genB.code !== 0) throw new Error(`self-test clip B generation failed: ${genB.stderr.slice(-1000)}`);
  if (!fs.existsSync(clipA) || !fs.existsSync(clipB)) {
    throw new Error("self-test: generated clips missing on disk");
  }

  const concatListPath = path.join(workDir, "concat.txt");
  await fsp.writeFile(concatListPath, buildConcatListFileContent([clipA, clipB]), "utf8");
  const outputPath = path.join(workDir, "output.mp4");
  const args = buildConcatFfmpegArgs({ inputPaths: [clipA, clipB], concatListPath, outputPath });
  const result = await runner(args);
  if (result.code !== 0) {
    throw new Error(`self-test concat failed: ${result.stderr.slice(-2000)}`);
  }
  const durationSeconds = await probeDurationSeconds(outputPath);
  return { outputPath, workDir, durationSeconds };
}
