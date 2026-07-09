/**
 * Vertical Drama Series — narrated trailer assembly (Bible tab "series
 * trailer" feature, 2026-07-07).
 *
 * Compiles a single 1080x1920 mp4 for a whole SERIES (not an episode): a
 * narration voice-over (already generated client-side via
 * `media.generateAudio`, handed to us as a URL + duration) muxed against a
 * sequence of visual segments built from:
 *  - completed video clip excerpts (`episode.motionPromptPack.clips[].videoTask.videoUrl`),
 *    trimmed to a short lead-in (<= 3s each), preferred first when available;
 *  - start-frame images (`episode.startFramePlan.frames[].approvedMediaAssetId`
 *    resolved against `media_assets.originalUrl`, or `.angleGrid.imageUrl`),
 *    each shown for 3s with an ffmpeg `zoompan` Ken Burns effect that
 *    alternates zoom-in/zoom-out by segment index.
 *
 * Architecture mirrors `verticalDramaEpisodeVideoAssembly.ts` (same repo,
 * feature 131 "download + compound video" upgrade): in-process fire-and-forget
 * job, JSONB-persisted status for resume-after-reload, ffmpeg concat DEMUXER
 * + full re-encode (never stream-copy, since sources differ wildly in
 * codec/fps/resolution/aspect). The two services intentionally do NOT share
 * a job table — this one persists onto `vertical_drama_series.trailer`
 * (a series-level column), not an episode's `assemblyManifest`.
 *
 * Segment normalization (every segment, before concat):
 *  - images: `-loop 1 -t 3 -i <img>` then upscale-first
 *    (`scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840`)
 *    THEN `zoompan` (`d=90` frames at 30fps = 3s) THEN downscale inside the
 *    zoompan's own `s=1080x1920` — upscaling before zoompan avoids the
 *    single-source-pixel jitter zoompan produces when fed a already-1080p
 *    image directly.
 *  - videos: same `scale,pad,setsar` normalization as the episode concat
 *    service, trimmed to <= 3s with `-ss 0 -t 3`, audio stripped (`-an`) since
 *    the final mux replaces all segment audio with the narration track.
 *
 * Final mux: concat all normalized (silent) segments -> trim to target
 * duration (narration length + ~0.75s tail) -> mux the narration audio in
 * (`-map 0:v -map 1:a -c:v copy -c:a aac -shortest`), with a short audio
 * fade-out so the narration doesn't cut off abruptly.
 */

import { randomUUID } from "crypto";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { verticalDramaSeries } from "../../drizzle/schema";
import { storagePutFromPath } from "../storage";
import { debugError } from "../_core/logger";
import {
  buildConcatListFileContent,
  probeDurationSeconds,
  defaultFfmpegRunner,
  type FfmpegRunner,
} from "./verticalDramaEpisodeVideoAssembly";
import type { VerticalDramaSeriesTrailerState } from "@shared/verticalDramaSeries";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface TrailerJobOwner {
  tenantId: string;
  userId: number;
  seriesId: number;
}

export interface SubmitTrailerJobArgs {
  owner: TrailerJobOwner;
  /** Ordered narration parts (the client chunks long scripts by the TTS model's
   *  prompt limit); a single-element array is the common case. Parts are
   *  concatenated into one narration track before muxing. */
  audioUrls: string[];
  audioDurationSeconds?: number;
  imageUrls: string[];
  videoClipUrls: string[];
  internalBaseUrl: string;
  ffmpegRunner?: FfmpegRunner;
}

/** One normalized 3s(-ish) segment to be concatenated, in final order. */
type SegmentPlanItem =
  | { kind: "image"; url: string; zoomDirection: "in" | "out" }
  | { kind: "video"; url: string };

/** Hard cap on total segments — a trailer is short; this just bounds worst-case ffmpeg work. */
const MAX_SEGMENTS = 40;
const IMAGE_SEGMENT_SECONDS = 3;
const VIDEO_SEGMENT_MAX_SECONDS = 3;
/** Extra tail padding appended to narration length for the target video duration. */
const TAIL_PADDING_SECONDS = 0.75;
/** Cap on persisted error text length (avoid runaway JSONB rows on pathological ffmpeg stderr). */
const MAX_ERROR_TEXT_LENGTH = 2000;

/* -------------------------------------------------------------------------- */
/* Pure helpers — segment planning (unit-testable)                            */
/* -------------------------------------------------------------------------- */

/**
 * Build the ordered segment plan for a target duration, interleaving video
 * excerpts (priority) and images (Ken Burns, alternating zoom direction by
 * segment index), cycling through the available sources again if the target
 * isn't reached yet, capped at `MAX_SEGMENTS`.
 */
export function buildTrailerSegmentPlan(args: {
  targetDurationSeconds: number;
  imageUrls: string[];
  videoClipUrls: string[];
}): SegmentPlanItem[] {
  const { targetDurationSeconds, imageUrls, videoClipUrls } = args;
  const segments: SegmentPlanItem[] = [];
  if (imageUrls.length === 0 && videoClipUrls.length === 0) return segments;

  let elapsed = 0;
  let imageCursor = 0;
  let videoCursor = 0;
  let segmentIndex = 0;

  while (elapsed < targetDurationSeconds && segments.length < MAX_SEGMENTS) {
    // Video excerpts are first-priority whenever any exist.
    if (videoClipUrls.length > 0) {
      const url = videoClipUrls[videoCursor % videoClipUrls.length];
      videoCursor += 1;
      segments.push({ kind: "video", url });
      elapsed += VIDEO_SEGMENT_MAX_SECONDS;
    } else if (imageUrls.length > 0) {
      const url = imageUrls[imageCursor % imageUrls.length];
      imageCursor += 1;
      const zoomDirection: "in" | "out" = segmentIndex % 2 === 0 ? "in" : "out";
      segments.push({ kind: "image", url, zoomDirection });
      elapsed += IMAGE_SEGMENT_SECONDS;
    } else {
      break;
    }
    segmentIndex += 1;

    // Once we've used every video clip once, interleave images too (if any
    // exist) so a trailer with both sources doesn't play ALL clips before
    // ANY image — alternate after the first full pass through videos.
    if (
      videoClipUrls.length > 0 &&
      imageUrls.length > 0 &&
      videoCursor % videoClipUrls.length === 0 &&
      segments.length < MAX_SEGMENTS &&
      elapsed < targetDurationSeconds
    ) {
      const url = imageUrls[imageCursor % imageUrls.length];
      imageCursor += 1;
      const zoomDirection: "in" | "out" = segmentIndex % 2 === 0 ? "in" : "out";
      segments.push({ kind: "image", url, zoomDirection });
      elapsed += IMAGE_SEGMENT_SECONDS;
      segmentIndex += 1;
    }
  }

  return segments;
}

/** Truncate persisted error text to a bounded length. */
export function capErrorText(message: string, max = MAX_ERROR_TEXT_LENGTH): string {
  return message.length > max ? message.slice(0, max) : message;
}

/* -------------------------------------------------------------------------- */
/* FFmpeg command construction (pure — no exec; unit-testable)                */
/* -------------------------------------------------------------------------- */

/** Ken Burns zoompan expression for a given direction (2.5s zoom over 90 frames @30fps). */
function zoompanExpr(direction: "in" | "out"): string {
  return direction === "in"
    ? "min(1+0.0025*on,1.25)"
    : "max(1.25-0.0025*on,1.0)";
}

/**
 * Build the ffmpeg argv that normalizes ONE image into a silent 1080x1920,
 * 30fps, h264/yuv420p, `IMAGE_SEGMENT_SECONDS`-long clip with a Ken Burns
 * zoom. Upscale-then-zoompan-then-downscale (all in one `-vf` chain) avoids
 * the jitter zoompan produces when fed a source already at output resolution.
 */
export function buildImageSegmentFfmpegArgs(args: {
  inputPath: string;
  outputPath: string;
  zoomDirection: "in" | "out";
  fps?: number;
  durationSeconds?: number;
}): string[] {
  const fps = args.fps ?? 30;
  const durationSeconds = args.durationSeconds ?? IMAGE_SEGMENT_SECONDS;
  const frames = Math.round(durationSeconds * fps);
  const z = zoompanExpr(args.zoomDirection);
  const vf =
    `scale=2160:3840:force_original_aspect_ratio=increase,` +
    `crop=2160:3840,` +
    `zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=${fps},` +
    `setsar=1`;
  return [
    "-y",
    "-loop",
    "1",
    "-t",
    String(durationSeconds),
    "-i",
    args.inputPath,
    "-r",
    String(fps),
    "-vf",
    vf,
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "medium",
    args.outputPath,
  ];
}

/**
 * Build the ffmpeg argv that normalizes ONE source video clip into a silent
 * 1080x1920, 30fps, h264/yuv420p clip trimmed to at most
 * `VIDEO_SEGMENT_MAX_SECONDS`.
 */
export function buildVideoSegmentFfmpegArgs(args: {
  inputPath: string;
  outputPath: string;
  fps?: number;
  maxDurationSeconds?: number;
}): string[] {
  const fps = args.fps ?? 30;
  const maxDurationSeconds = args.maxDurationSeconds ?? VIDEO_SEGMENT_MAX_SECONDS;
  return [
    "-y",
    "-ss",
    "0",
    "-t",
    String(maxDurationSeconds),
    "-i",
    args.inputPath,
    "-r",
    String(fps),
    "-vf",
    "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1",
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "medium",
    args.outputPath,
  ];
}

/** Build the ffmpeg argv for the final concat-demuxer join + trim to target duration (silent output). */
export function buildTrailerConcatFfmpegArgs(args: {
  concatListPath: string;
  outputPath: string;
  targetDurationSeconds: number;
  fps?: number;
}): string[] {
  const fps = args.fps ?? 30;
  return [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    args.concatListPath,
    "-r",
    String(fps),
    "-t",
    String(args.targetDurationSeconds),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "medium",
    "-an",
    args.outputPath,
  ];
}

/**
 * Build the ffmpeg argv that concatenates multiple narration audio parts into
 * a single AAC track. Always re-encodes (parts may have differing encoder
 * settings even from the same TTS model) — never stream-copies.
 */
export function buildAudioConcatFfmpegArgs(args: {
  concatListPath: string;
  outputPath: string;
}): string[] {
  return [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    args.concatListPath,
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    args.outputPath,
  ];
}

/** Build the ffmpeg argv that muxes the narration audio onto the (silent) concatenated video. */
export function buildMuxNarrationFfmpegArgs(args: {
  videoPath: string;
  audioPath: string;
  outputPath: string;
  fadeOutStartSeconds?: number;
  fadeOutDurationSeconds?: number;
}): string[] {
  const argv = ["-y", "-i", args.videoPath, "-i", args.audioPath, "-map", "0:v", "-map", "1:a"];
  if (args.fadeOutStartSeconds !== undefined) {
    argv.push(
      "-af",
      `afade=t=out:st=${args.fadeOutStartSeconds}:d=${args.fadeOutDurationSeconds ?? 0.5}`,
    );
  }
  argv.push(
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-shortest",
    "-movflags",
    "+faststart",
    args.outputPath,
  );
  return argv;
}

/* -------------------------------------------------------------------------- */
/* Source download                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a possibly-relative `/api/storage/...` (or `/uploads/...`) URL to an
 * absolute, fetchable URL and download it to `destPath`. Same convention as
 * `verticalDramaEpisodeVideoAssembly.downloadClipToFile`.
 */
async function downloadToFile(url: string, destPath: string, internalBaseUrl: string): Promise<void> {
  const absoluteUrl = /^https?:\/\//i.test(url) ? url : new URL(url, internalBaseUrl).toString();
  const res = await fetch(absoluteUrl);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download trailer source (${res.status}): ${absoluteUrl}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fsp.writeFile(destPath, buf);
}

/* -------------------------------------------------------------------------- */
/* In-process job manager (submit -> poll)                                    */
/* -------------------------------------------------------------------------- */

interface JobRecord {
  jobId: string;
  owner: TrailerJobOwner;
  status: "processing" | "completed" | "failed";
  error?: string;
}

/** In-memory job table — survives only for the life of this process; durable
 *  recovery across restarts is via `series.trailer` (persisted at submit +
 *  completion), same convention as the episode compiled-video feature. */
const jobs = new Map<string, JobRecord>();

export function getTrailerJobStatus(jobId: string): JobRecord | undefined {
  return jobs.get(jobId);
}

/** Persist `series.trailer` (JSONB replace — the whole field is owned by this feature). */
async function persistTrailerState(
  owner: TrailerJobOwner,
  patch: Partial<VerticalDramaSeriesTrailerState> & { status: VerticalDramaSeriesTrailerState["status"] },
): Promise<void> {
  const [row] = await db
    .select({ trailer: verticalDramaSeries.trailer })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, owner.seriesId),
        eq(verticalDramaSeries.tenantId, owner.tenantId),
        eq(verticalDramaSeries.userId, owner.userId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("vertical_drama_series_not_found");

  const existing =
    row.trailer && typeof row.trailer === "object"
      ? (row.trailer as Record<string, unknown>)
      : {};

  const next: VerticalDramaSeriesTrailerState = {
    ...(existing as Partial<VerticalDramaSeriesTrailerState>),
    ...patch,
    updatedAt: new Date().toISOString(),
  } as VerticalDramaSeriesTrailerState;

  await db
    .update(verticalDramaSeries)
    .set({ trailer: next as unknown as object, updatedAt: new Date() })
    .where(
      and(
        eq(verticalDramaSeries.id, owner.seriesId),
        eq(verticalDramaSeries.tenantId, owner.tenantId),
      ),
    );
}

/* -------------------------------------------------------------------------- */
/* Job execution                                                              */
/* -------------------------------------------------------------------------- */

async function runTrailerJob(args: {
  owner: TrailerJobOwner;
  jobId: string;
  audioUrls: string[];
  audioDurationSeconds?: number;
  imageUrls: string[];
  videoClipUrls: string[];
  internalBaseUrl: string;
  ffmpegRunner: FfmpegRunner;
}): Promise<void> {
  const { owner, jobId, internalBaseUrl } = args;
  const runner = args.ffmpegRunner;
  jobs.set(jobId, { jobId, owner, status: "processing" });

  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), "vd-trailer-"));
  try {
    // 1. Download all narration parts (in order); concat into a single track
    //    when the client chunked a long script; probe the FINAL file for the
    //    authoritative duration (client-supplied duration is only a fallback).
    if (args.audioUrls.length === 0) {
      throw new Error("vertical_drama_trailer_no_audio: no narration audio urls supplied");
    }
    const partPaths: string[] = [];
    for (let i = 0; i < args.audioUrls.length; i += 1) {
      const partPath = path.join(workDir, `narration-part-${String(i).padStart(2, "0")}.audio`);
      await downloadToFile(args.audioUrls[i], partPath, internalBaseUrl);
      partPaths.push(partPath);
    }
    let audioPath: string;
    if (partPaths.length === 1) {
      audioPath = partPaths[0];
    } else {
      const audioConcatListPath = path.join(workDir, "narration-concat.txt");
      await fsp.writeFile(audioConcatListPath, buildConcatListFileContent(partPaths), "utf8");
      audioPath = path.join(workDir, "narration.m4a");
      const audioConcatResult = await runner(
        buildAudioConcatFfmpegArgs({ concatListPath: audioConcatListPath, outputPath: audioPath }),
      );
      if (audioConcatResult.code !== 0) {
        throw new Error(
          `ffmpeg narration concat failed (exit ${audioConcatResult.code}): ${audioConcatResult.stderr.slice(-1500)}`,
        );
      }
    }
    let narrationDurationSeconds = await probeDurationSeconds(audioPath).catch(() => 0);
    if (!narrationDurationSeconds || narrationDurationSeconds <= 0) {
      narrationDurationSeconds = args.audioDurationSeconds ?? 0;
    }
    if (!narrationDurationSeconds || narrationDurationSeconds <= 0) {
      throw new Error("vertical_drama_trailer_no_audio_duration: could not determine narration audio duration");
    }

    const targetDurationSeconds = narrationDurationSeconds + TAIL_PADDING_SECONDS;

    // 2. Plan segments.
    const plan = buildTrailerSegmentPlan({
      targetDurationSeconds,
      imageUrls: args.imageUrls,
      videoClipUrls: args.videoClipUrls,
    });
    if (plan.length === 0) {
      throw new Error("vertical_drama_trailer_no_sources: no images or video clips available to build a trailer");
    }

    // 3. Download + normalize each segment.
    const segmentPaths: string[] = [];
    for (let i = 0; i < plan.length; i += 1) {
      const item = plan[i];
      const sourceExt = item.kind === "image" ? "img" : "mp4";
      const sourcePath = path.join(workDir, `src-${String(i).padStart(3, "0")}.${sourceExt}`);
      await downloadToFile(item.url, sourcePath, internalBaseUrl);

      const segmentPath = path.join(workDir, `seg-${String(i).padStart(3, "0")}.mp4`);
      const ffArgs =
        item.kind === "image"
          ? buildImageSegmentFfmpegArgs({
              inputPath: sourcePath,
              outputPath: segmentPath,
              zoomDirection: item.zoomDirection,
            })
          : buildVideoSegmentFfmpegArgs({ inputPath: sourcePath, outputPath: segmentPath });

      const result = await runner(ffArgs);
      if (result.code !== 0) {
        throw new Error(
          `ffmpeg segment ${i} (${item.kind}) normalization failed (exit ${result.code}): ${result.stderr.slice(-1500)}`,
        );
      }
      segmentPaths.push(segmentPath);
    }

    // 4. Concat all segments, trim to target duration (silent).
    const concatListPath = path.join(workDir, "concat.txt");
    await fsp.writeFile(concatListPath, buildConcatListFileContent(segmentPaths), "utf8");
    const silentVideoPath = path.join(workDir, "silent.mp4");
    const concatArgs = buildTrailerConcatFfmpegArgs({
      concatListPath,
      outputPath: silentVideoPath,
      targetDurationSeconds,
    });
    const concatResult = await runner(concatArgs);
    if (concatResult.code !== 0) {
      throw new Error(`ffmpeg trailer concat failed (exit ${concatResult.code}): ${concatResult.stderr.slice(-2000)}`);
    }

    // 5. Mux narration audio in (with a short fade-out near the end).
    const finalPath = path.join(workDir, "trailer.mp4");
    const fadeOutDurationSeconds = 0.5;
    const fadeOutStartSeconds = Math.max(0, targetDurationSeconds - fadeOutDurationSeconds);
    const muxArgs = buildMuxNarrationFfmpegArgs({
      videoPath: silentVideoPath,
      audioPath: audioPath,
      outputPath: finalPath,
      fadeOutStartSeconds,
      fadeOutDurationSeconds,
    });
    const muxResult = await runner(muxArgs);
    if (muxResult.code !== 0) {
      throw new Error(`ffmpeg narration mux failed (exit ${muxResult.code}): ${muxResult.stderr.slice(-2000)}`);
    }

    // 6. Probe final duration, upload, persist completed state.
    const durationSeconds = await probeDurationSeconds(finalPath);
    const storageKey = `vertical-drama/trailer/${owner.seriesId}/${randomUUID()}-trailer.mp4`;
    const { url } = await storagePutFromPath(storageKey, finalPath, "video/mp4");

    const videoClipCountUsed = plan.filter((p) => p.kind === "video").length;
    const imageCountUsed = plan.filter((p) => p.kind === "image").length;

    jobs.set(jobId, { jobId, owner, status: "completed" });
    await persistTrailerState(owner, {
      status: "completed",
      jobId: undefined,
      narrationAudioUrl: args.audioUrls[0],
      narrationDurationSeconds,
      videoUrl: url,
      durationSeconds,
      sourceCounts: { images: imageCountUsed, videoClips: videoClipCountUsed },
      error: undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    debugError("verticalDramaSeriesTrailerAssembly", `Trailer job ${jobId} failed for series ${owner.seriesId}`, err);
    jobs.set(jobId, { jobId, owner, status: "failed", error: message });
    await persistTrailerState(owner, {
      status: "failed",
      jobId: undefined,
      error: capErrorText(message),
    }).catch(() => {
      /* best-effort — job status is still readable via jobs map while process is alive */
    });
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Submit a new trailer job: persists the `jobId` + `status: "processing"`
 * synchronously (so a reload/navigation before completion can resume via
 * `series.trailer`), then kicks off `runTrailerJob` in the background (not
 * awaited).
 */
export async function submitTrailerJob(args: SubmitTrailerJobArgs): Promise<{ jobId: string }> {
  const jobId = randomUUID();
  await persistTrailerState(args.owner, {
    status: "processing",
    jobId,
    narrationAudioUrl: args.audioUrls[0],
    narrationDurationSeconds: args.audioDurationSeconds,
    error: undefined,
  });
  jobs.set(jobId, { jobId, owner: args.owner, status: "processing" });

  // Fire-and-forget — errors are captured inside runTrailerJob and persisted.
  void runTrailerJob({
    owner: args.owner,
    jobId,
    audioUrls: args.audioUrls,
    audioDurationSeconds: args.audioDurationSeconds,
    imageUrls: args.imageUrls,
    videoClipUrls: args.videoClipUrls,
    internalBaseUrl: args.internalBaseUrl,
    ffmpegRunner: args.ffmpegRunner ?? defaultFfmpegRunner,
  });

  return { jobId };
}
