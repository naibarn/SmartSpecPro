import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { extname, join } from "node:path";

import { eq } from "drizzle-orm";

import {
  storyboardPreviewMatchCaptureAttempts,
  storyboardPreviewMatchCaptureJobs,
  type StoryboardPreviewMatchCaptureJob,
} from "../../drizzle/schema";
import {
  previewMatchCompositionPayloadSchema,
  type StoryboardPreviewMatchCaptureFailureCode,
  type StoryboardPreviewMatchCaptureStage,
  type StoryboardPreviewMatchCaptureStatus,
} from "../../shared/storyboardPreviewMatchCapture";
import { getDb } from "../db";
import { assertR2StorageActive, storageCopyToPath, storagePutFromPath } from "../storage";
import { createLibraryItem } from "../services/libraryService";
import {
  createPreviewMatchCaptureAttempt,
} from "../services/storyboardPreviewMatchCaptureService";
import { verifyPreviewMatchCaptureArtifacts } from "../services/storyboardPreviewMatchVerificationService";
import { signStoryboardFinalCaptureToken } from "../routes/storyboardFinalCapture";

type Db = Awaited<ReturnType<typeof getDb>>;

const ACTIVE_STATUSES = new Set([
  "queued",
  "preparing_assets",
  "browser_ready",
  "capturing",
  "encoding",
  "verifying",
  "publishing",
]);

function sha256Hash(buffer: Buffer): string {
  return `spmc_${createHash("sha256").update(buffer).digest("hex").slice(0, 48)}`;
}

function resolveBinary(binaryName: "ffmpeg" | "ffprobe", explicit?: string): string {
  const candidates = [
    explicit,
    binaryName === "ffmpeg" ? process.env.FFMPEG_PATH : process.env.FFPROBE_PATH,
    `/usr/bin/${binaryName}`,
    `/usr/local/bin/${binaryName}`,
    join(homedir(), `.local/bin/${binaryName}`),
  ].filter((value): value is string => Boolean(value && value.trim()));
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return binaryName;
}

function ffmpegSupportsEncoder(encoder: string): boolean {
  try {
    const output = execFileSync(
      resolveBinary("ffmpeg"),
      ["-hide_banner", "-encoders"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return output.includes(encoder);
  } catch {
    return false;
  }
}

function resolveVideoEncoderArgs(quality: "standard" | "high"): string[] {
  const requested = String(process.env.STORYBOARD_PREVIEW_MATCH_CAPTURE_VIDEO_ENCODER ?? "libx264")
    .trim()
    .toLowerCase();
  if ((requested === "nvenc" || requested === "h264_nvenc") && ffmpegSupportsEncoder("h264_nvenc")) {
    return [
      "-c:v",
      "h264_nvenc",
      "-preset",
      quality === "high" ? "p5" : "p3",
      "-cq",
      quality === "high" ? "18" : "23",
      "-b:v",
      "0",
    ];
  }
  if ((requested === "qsv" || requested === "h264_qsv") && ffmpegSupportsEncoder("h264_qsv")) {
    return [
      "-c:v",
      "h264_qsv",
      "-global_quality",
      quality === "high" ? "18" : "23",
    ];
  }
  if ((requested === "videotoolbox" || requested === "h264_videotoolbox") && ffmpegSupportsEncoder("h264_videotoolbox")) {
    return [
      "-c:v",
      "h264_videotoolbox",
      "-b:v",
      quality === "high" ? "10M" : "6M",
    ];
  }
  const crf = quality === "high" ? "18" : "23";
  const preset = quality === "high" ? "medium" : "veryfast";
  return [
    "-c:v",
    "libx264",
    "-preset",
    preset,
    "-crf",
    crf,
  ];
}

function resolveInternalBaseUrl(): string {
  return (
    process.env.STORYBOARD_PREVIEW_MATCH_CAPTURE_INTERNAL_BASE_URL ||
    process.env.INTERNAL_WEB_BASE_URL ||
    `http://127.0.0.1:${process.env.PORT || "3000"}`
  ).replace(/\/+$/, "");
}

function workDirFor(captureJobId: string): string {
  const safeId = captureJobId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(tmpdir(), "smartspec-storyboard-preview-match", safeId);
}

async function updateJob(
  db: Db,
  captureJobId: string,
  values: Partial<typeof storyboardPreviewMatchCaptureJobs.$inferInsert>,
): Promise<StoryboardPreviewMatchCaptureJob | null> {
  if (!db) throw new Error("Database not available");
  const [row] = await db
    .update(storyboardPreviewMatchCaptureJobs)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(storyboardPreviewMatchCaptureJobs.id, captureJobId))
    .returning();
  return row ?? null;
}

async function loadJob(db: Db, captureJobId: string): Promise<StoryboardPreviewMatchCaptureJob | null> {
  if (!db) throw new Error("Database not available");
  const [row] = await db
    .select()
    .from(storyboardPreviewMatchCaptureJobs)
    .where(eq(storyboardPreviewMatchCaptureJobs.id, captureJobId))
    .limit(1);
  return row ?? null;
}

async function ensureJobStillActive(db: Db, captureJobId: string): Promise<StoryboardPreviewMatchCaptureJob> {
  const job = await loadJob(db, captureJobId);
  if (!job) throw new Error("Capture job not found");
  if (!ACTIVE_STATUSES.has(String(job.status))) {
    throw new Error(`Capture job is no longer active: ${job.status}`);
  }
  return job;
}

function parseFrameRate(value: string | undefined): number | null {
  if (!value) return null;
  const [num, den] = value.split("/").map(Number);
  if (!Number.isFinite(num)) return null;
  if (!Number.isFinite(den) || den === 0) return Math.round(num * 1000) / 1000;
  return Math.round((num / den) * 1000) / 1000;
}

function probeMp4(path: string): {
  width: number | null;
  height: number | null;
  fps: number | null;
  durationSeconds: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
} {
  const output = execFileSync(
    resolveBinary("ffprobe"),
    [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,width,height,avg_frame_rate",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      path,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const parsed = JSON.parse(output) as {
    streams?: Array<{ codec_type?: string; width?: number; height?: number; avg_frame_rate?: string }>;
    format?: { duration?: string };
  };
  const videoStream = parsed.streams?.find(stream => stream.codec_type === "video");
  const hasAudio = Boolean(parsed.streams?.some(stream => stream.codec_type === "audio"));
  const durationSeconds = Number(parsed.format?.duration ?? NaN);
  return {
    width: Number.isFinite(Number(videoStream?.width)) ? Number(videoStream?.width) : null,
    height: Number.isFinite(Number(videoStream?.height)) ? Number(videoStream?.height) : null,
    fps: parseFrameRate(videoStream?.avg_frame_rate),
    durationSeconds: Number.isFinite(durationSeconds)
      ? Math.round(durationSeconds * 1000) / 1000
      : null,
    hasVideo: Boolean(videoStream),
    hasAudio,
  };
}

function inspectMp4FramePixels(input: {
  path: string;
  durationSeconds: number;
}): {
  passed: boolean;
  sampledAtSeconds: number;
  meanLuma: number;
  nonBlackRatio: number;
} {
  const sampledAtSeconds = Math.max(0.2, Math.min(input.durationSeconds / 2, input.durationSeconds - 0.2));
  const raw = execFileSync(
    resolveBinary("ffmpeg"),
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(sampledAtSeconds),
      "-i",
      input.path,
      "-frames:v",
      "1",
      "-vf",
      "scale=160:284:force_original_aspect_ratio=decrease,pad=160:284:(ow-iw)/2:(oh-ih)/2",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ],
    { encoding: "buffer", stdio: ["ignore", "pipe", "pipe"] },
  ) as Buffer;
  const pixelCount = Math.floor(raw.length / 3);
  if (pixelCount <= 0) {
    return { passed: false, sampledAtSeconds, meanLuma: 0, nonBlackRatio: 0 };
  }
  let lumaSum = 0;
  let nonBlack = 0;
  for (let index = 0; index < raw.length; index += 3) {
    const r = raw[index] ?? 0;
    const g = raw[index + 1] ?? 0;
    const b = raw[index + 2] ?? 0;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumaSum += luma;
    if (luma > 18) nonBlack += 1;
  }
  const meanLuma = Math.round((lumaSum / pixelCount) * 100) / 100;
  const nonBlackRatio = Math.round((nonBlack / pixelCount) * 10000) / 10000;
  return {
    passed: meanLuma >= 8 && nonBlackRatio >= 0.015,
    sampledAtSeconds,
    meanLuma,
    nonBlackRatio,
  };
}

function encodeWebmToMp4(input: {
  webmPath: string;
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  quality: "standard" | "high";
  readyOffsetSeconds?: number;
}): void {
  const readyOffsetSeconds = Math.max(0, Number(input.readyOffsetSeconds ?? 0));
  const encoderArgs = resolveVideoEncoderArgs(input.quality);
  execFileSync(
    resolveBinary("ffmpeg"),
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "warning",
      ...(readyOffsetSeconds > 0 ? ["-ss", readyOffsetSeconds.toFixed(3)] : []),
      "-i",
      input.webmPath,
      "-t",
      String(input.durationSeconds),
      "-vf",
      `scale=${input.width}:${input.height}:force_original_aspect_ratio=decrease,pad=${input.width}:${input.height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
      "-r",
      String(input.fps),
      ...encoderArgs,
      "-movflags",
      "+faststart",
      "-an",
      input.outputPath,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
}

function shouldPreserveNativeAudio(payload: { audio?: Record<string, unknown> }): boolean {
  return payload.audio?.preserveNativeAudio === true;
}

function shouldIncludeAudioEvents(payload: { audio?: Record<string, unknown> }): boolean {
  return payload.audio?.includeAudioEventsInCapture === true;
}

function shouldAllowSyntheticAudioFallback(payload: { audio?: Record<string, unknown> }): boolean {
  const validation =
    payload.audio?.audioAssetValidation &&
    typeof payload.audio.audioAssetValidation === "object" &&
    !Array.isArray(payload.audio.audioAssetValidation)
      ? payload.audio.audioAssetValidation as Record<string, unknown>
      : {};
  return payload.audio?.syntheticAudioFallback !== false && validation.allowSyntheticFallback !== false;
}

function storageKeyFromMediaRef(ref: string): string | null {
  const clean = ref.trim();
  if (!clean) return null;
  if (/^https?:\/\//i.test(clean)) {
    try {
      return storageKeyFromMediaRef(new URL(clean).pathname);
    } catch {
      return null;
    }
  }
  for (const prefix of ["/api/storage/files/", "/uploads/", "storage://"]) {
    if (!clean.startsWith(prefix)) continue;
    const key = clean.slice(prefix.length);
    try {
      return decodeURIComponent(key).replace(/^\/+/, "");
    } catch {
      return key.replace(/^\/+/, "");
    }
  }
  return null;
}

function safeAudioExtension(ref: string): string {
  const extension = extname(ref.split(/[?#]/)[0] ?? "").toLowerCase();
  return /^\.m(?:p3|4a)$|^\.aac$|^\.wav$|^\.ogg$|^\.flac$/.test(extension) ? extension : ".wav";
}

function safeMediaExtension(ref: string): string {
  const extension = extname(ref.split(/[?#]/)[0] ?? "").toLowerCase();
  return /^\.m(?:p4|ov|4v)$|^\.webm$|^\.mkv$/.test(extension) ? extension : ".mp4";
}

type PreviewMatchAudioEvent = {
  id: string;
  role: string;
  presetId: string;
  assetRef: string;
  startSec: number;
  durationSec: number;
  volume: number;
};

function normalizeAudioEvents(payload: {
  audio?: Record<string, unknown>;
  output: { durationSeconds: number };
}): PreviewMatchAudioEvent[] {
  const rawEvents = Array.isArray(payload.audio?.audioEvents) ? payload.audio.audioEvents : [];
  const finalDuration = Math.max(0, Number(payload.output.durationSeconds || 0));
  return rawEvents
    .map((event, index) => {
      const record = event && typeof event === "object" && !Array.isArray(event)
        ? event as Record<string, unknown>
        : {};
      const startSec = Math.max(0, Number(record.startSec ?? 0));
      const durationSec = Math.max(0.05, Math.min(finalDuration || 600, Number(record.durationSec ?? 0.25) || 0.25));
      return {
        id: String(record.id ?? `audio-event-${index + 1}`),
        role: String(record.role ?? "sfx"),
        presetId: String(record.presetId ?? ""),
        assetRef: String(record.assetRef ?? ""),
        startSec,
        durationSec,
        volume: Math.max(0, Math.min(1, Number(record.volume ?? 0.25) || 0.25)),
      };
    })
    .filter(event => event.startSec < finalDuration && event.durationSec > 0);
}

async function stageSourceMedia(input: {
  ref: string;
  index: number;
  workDir: string;
}): Promise<string> {
  const storageKey = storageKeyFromMediaRef(input.ref);
  if (storageKey) {
    const targetPath = join(
      input.workDir,
      `source-audio-${String(input.index + 1).padStart(2, "0")}${safeMediaExtension(input.ref)}`,
    );
    await storageCopyToPath(storageKey, targetPath);
    return targetPath;
  }
  if (/^https?:\/\//i.test(input.ref) || existsSync(input.ref)) return input.ref;
  throw new Error(`Unsupported source media reference for audio mix: shot ${input.index + 1}`);
}

async function stageAudioEventAsset(input: {
  ref: string;
  index: number;
  workDir: string;
}): Promise<string | null> {
  const ref = input.ref.trim();
  if (!ref) return null;
  const storageKey = storageKeyFromMediaRef(ref);
  if (storageKey) {
    const targetPath = join(
      input.workDir,
      `audio-event-source-${String(input.index + 1).padStart(2, "0")}${safeAudioExtension(ref)}`,
    );
    await storageCopyToPath(storageKey, targetPath);
    return targetPath;
  }
  if (/^https?:\/\//i.test(ref) || existsSync(ref)) return ref;
  return null;
}

function mediaHasAudio(inputPath: string): boolean {
  try {
    const output = execFileSync(
      resolveBinary("ffprobe"),
      [
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=codec_type",
        "-of",
        "json",
        inputPath,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const parsed = JSON.parse(output) as { streams?: Array<{ codec_type?: string }> };
    return Boolean(parsed.streams?.some(stream => stream.codec_type === "audio"));
  } catch {
    return false;
  }
}

function encodeSilentAudioSegment(input: {
  outputPath: string;
  durationSeconds: number;
}): void {
  execFileSync(
    resolveBinary("ffmpeg"),
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "warning",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-t",
      String(input.durationSeconds),
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      input.outputPath,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
}

function encodeNativeAudioSegment(input: {
  sourcePath: string;
  outputPath: string;
  mediaStartSec: number;
  durationSeconds: number;
}): void {
  execFileSync(
    resolveBinary("ffmpeg"),
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "warning",
      "-ss",
      String(Math.max(0, input.mediaStartSec)),
      "-i",
      input.sourcePath,
      "-t",
      String(input.durationSeconds),
      "-vn",
      "-ac",
      "2",
      "-ar",
      "48000",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      input.outputPath,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
}

function syntheticFrequencyForAudioEvent(event: PreviewMatchAudioEvent): number {
  const key = `${event.role} ${event.presetId}`.toLowerCase();
  if (key.includes("cash") || key.includes("sales")) return 960;
  if (key.includes("riser") || key.includes("reveal")) return 420;
  if (key.includes("music")) return 220;
  if (key.includes("error") || key.includes("buzz")) return 160;
  if (key.includes("completion") || key.includes("chime")) return 740;
  return 520;
}

function encodeSyntheticAudioEventSegment(input: {
  event: PreviewMatchAudioEvent;
  outputPath: string;
}): void {
  const duration = Math.max(0.05, input.event.durationSec);
  execFileSync(
    resolveBinary("ffmpeg"),
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "warning",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=${syntheticFrequencyForAudioEvent(input.event)}:sample_rate=48000:duration=${duration}`,
      "-af",
      `afade=t=in:st=0:d=0.02,afade=t=out:st=${Math.max(0, duration - 0.06)}:d=0.06`,
      "-ac",
      "2",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      input.outputPath,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
}

function encodeAudioEventAssetSegment(input: {
  sourcePath: string;
  outputPath: string;
  durationSeconds: number;
}): void {
  execFileSync(
    resolveBinary("ffmpeg"),
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "warning",
      "-stream_loop",
      "-1",
      "-i",
      input.sourcePath,
      "-t",
      String(input.durationSeconds),
      "-vn",
      "-ac",
      "2",
      "-ar",
      "48000",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      input.outputPath,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
}

function concatAudioSegments(input: {
  segmentPaths: string[];
  outputPath: string;
  workDir: string;
}): void {
  const listPath = join(input.workDir, "audio-segments.txt");
  const listText = input.segmentPaths
    .map(path => `file '${path.replace(/'/g, "'\\''")}'`)
    .join("\n");
  writeFileSync(listPath, `${listText}\n`, "utf8");
  execFileSync(
    resolveBinary("ffmpeg"),
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "warning",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      input.outputPath,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
}

async function buildNativeTimelineAudio(input: {
  payload: {
    audio?: Record<string, unknown>;
    output?: { durationSeconds?: number };
    shots: Array<{
      sourceVideoRef: string | null;
      mediaStartSec: number;
      durationSeconds: number;
    }>;
  };
  workDir: string;
}): Promise<{ audioPath: string | null; warnings: string[]; nativeSegments: number; silentSegments: number }> {
  if (!shouldPreserveNativeAudio(input.payload)) {
    return { audioPath: null, warnings: [], nativeSegments: 0, silentSegments: 0 };
  }
  const warnings: string[] = [];
  const segmentPaths: string[] = [];
  let nativeSegments = 0;
  let silentSegments = 0;
  for (const [index, shot] of input.payload.shots.entries()) {
    const durationSeconds = Math.max(0, Number(shot.durationSeconds || 0));
    if (durationSeconds <= 0) continue;
    const segmentPath = join(input.workDir, `audio-segment-${String(index + 1).padStart(2, "0")}.m4a`);
    const ref = typeof shot.sourceVideoRef === "string" ? shot.sourceVideoRef.trim() : "";
    try {
      if (!ref) throw new Error("missing sourceVideoRef");
      const sourcePath = await stageSourceMedia({ ref, index, workDir: input.workDir });
      if (!mediaHasAudio(sourcePath)) throw new Error("source has no audio stream");
      encodeNativeAudioSegment({
        sourcePath,
        outputPath: segmentPath,
        mediaStartSec: Number(shot.mediaStartSec || 0),
        durationSeconds,
      });
      nativeSegments += 1;
    } catch (error) {
      warnings.push(
        `Audio segment ${index + 1} used silence: ${
          error instanceof Error ? error.message.slice(0, 120) : "unknown source audio issue"
        }`,
      );
      encodeSilentAudioSegment({ outputPath: segmentPath, durationSeconds });
      silentSegments += 1;
    }
    segmentPaths.push(segmentPath);
  }
  if (segmentPaths.length === 0) {
    return { audioPath: null, warnings: ["No timeline audio segments were available."], nativeSegments, silentSegments };
  }
  const audioPath = join(input.workDir, "timeline-audio.m4a");
  concatAudioSegments({ segmentPaths, outputPath: audioPath, workDir: input.workDir });
  return { audioPath, warnings, nativeSegments, silentSegments };
}

async function buildFinalTimelineAudio(input: {
  payload: {
    audio?: Record<string, unknown>;
    output: { durationSeconds: number };
    shots: Array<{
      sourceVideoRef: string | null;
      mediaStartSec: number;
      durationSeconds: number;
    }>;
  };
  workDir: string;
}): Promise<{
  audioPath: string | null;
  warnings: string[];
  nativeSegments: number;
  silentSegments: number;
  audioEventSegments: number;
  syntheticEventSegments: number;
  skippedEventSegments: number;
}> {
  const nativeMix = await buildNativeTimelineAudio(input);
  if (!shouldIncludeAudioEvents(input.payload)) {
    return {
      ...nativeMix,
      audioEventSegments: 0,
      syntheticEventSegments: 0,
      skippedEventSegments: 0,
    };
  }

  const finalDuration = Math.max(0.1, Number(input.payload.output.durationSeconds || 0));
  const events = normalizeAudioEvents(input.payload);
  if (events.length === 0) {
    return {
      ...nativeMix,
      audioEventSegments: 0,
      syntheticEventSegments: 0,
      skippedEventSegments: 0,
    };
  }

  const warnings = [...nativeMix.warnings];
  const allowSyntheticFallback = shouldAllowSyntheticAudioFallback(input.payload);
  const baseAudioPath = nativeMix.audioPath ?? join(input.workDir, "timeline-audio-silence.m4a");
  if (!nativeMix.audioPath) {
    encodeSilentAudioSegment({ outputPath: baseAudioPath, durationSeconds: finalDuration });
  }

  const eventInputs: Array<{ path: string; event: PreviewMatchAudioEvent }> = [];
  let syntheticEventSegments = 0;
  let skippedEventSegments = 0;
  for (const [index, event] of events.entries()) {
    const segmentPath = join(input.workDir, `audio-event-${String(index + 1).padStart(2, "0")}.m4a`);
    try {
      const assetPath = await stageAudioEventAsset({ ref: event.assetRef, index, workDir: input.workDir });
      if (assetPath) {
        encodeAudioEventAssetSegment({
          sourcePath: assetPath,
          outputPath: segmentPath,
          durationSeconds: event.durationSec,
        });
      } else if (allowSyntheticFallback) {
        encodeSyntheticAudioEventSegment({ event, outputPath: segmentPath });
        syntheticEventSegments += 1;
      } else {
        skippedEventSegments += 1;
        warnings.push(`Audio event ${event.id} skipped because its asset was not staged.`);
        continue;
      }
      eventInputs.push({ path: segmentPath, event });
    } catch (error) {
      if (!allowSyntheticFallback) {
        skippedEventSegments += 1;
        warnings.push(
          `Audio event ${event.id} skipped: ${
            error instanceof Error ? error.message.slice(0, 120) : "unknown asset issue"
          }`,
        );
        continue;
      }
      encodeSyntheticAudioEventSegment({ event, outputPath: segmentPath });
      syntheticEventSegments += 1;
      eventInputs.push({ path: segmentPath, event });
    }
  }

  if (eventInputs.length === 0) {
    return {
      audioPath: nativeMix.audioPath,
      warnings,
      nativeSegments: nativeMix.nativeSegments,
      silentSegments: nativeMix.silentSegments,
      audioEventSegments: 0,
      syntheticEventSegments,
      skippedEventSegments,
    };
  }

  const mixedAudioPath = join(input.workDir, "timeline-audio-mixed.m4a");
  const inputArgs = ["-i", baseAudioPath, ...eventInputs.flatMap(event => ["-i", event.path])];
  const filterParts = [
    "[0:a]aresample=48000,volume=1[a0]",
    ...eventInputs.map(({ event }, index) => {
      const inputIndex = index + 1;
      const delayMs = Math.max(0, Math.round(event.startSec * 1000));
      return `[${inputIndex}:a]aresample=48000,adelay=${delayMs}|${delayMs},volume=${event.volume}[a${inputIndex}]`;
    }),
  ];
  const mixInputs = Array.from({ length: eventInputs.length + 1 }, (_value, index) => `[a${index}]`).join("");
  filterParts.push(
    `${mixInputs}amix=inputs=${eventInputs.length + 1}:duration=longest:dropout_transition=0,atrim=start=0:duration=${finalDuration},asetpts=N/SR/TB[aout]`,
  );
  execFileSync(
    resolveBinary("ffmpeg"),
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "warning",
      ...inputArgs,
      "-filter_complex",
      filterParts.join(";"),
      "-map",
      "[aout]",
      "-ac",
      "2",
      "-ar",
      "48000",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-t",
      String(finalDuration),
      mixedAudioPath,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  return {
    audioPath: mixedAudioPath,
    warnings,
    nativeSegments: nativeMix.nativeSegments,
    silentSegments: nativeMix.silentSegments,
    audioEventSegments: eventInputs.length,
    syntheticEventSegments,
    skippedEventSegments,
  };
}

function muxAudioIntoMp4(input: {
  videoPath: string;
  audioPath: string;
  outputPath: string;
  durationSeconds: number;
}): void {
  execFileSync(
    resolveBinary("ffmpeg"),
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "warning",
      "-i",
      input.videoPath,
      "-i",
      input.audioPath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-t",
      String(input.durationSeconds),
      "-movflags",
      "+faststart",
      input.outputPath,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
}

async function recordBrowserCapture(input: {
  captureJobId: string;
  attemptId: string;
  token: string;
  width: number;
  height: number;
  durationSeconds: number;
  workDir: string;
}): Promise<{ webmPath: string; readyOffsetSeconds: number; captureState: unknown }> {
  let chromium: typeof import("@playwright/test").chromium;
  try {
    chromium = (await import("@playwright/test")).chromium;
  } catch {
    throw new Error("Playwright is not installed for the Node capture worker.");
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-gpu", "--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: input.width, height: input.height },
    recordVideo: {
      dir: input.workDir,
      size: { width: input.width, height: input.height },
    },
  });
  const recordingStartedAt = Date.now();
  const page = await context.newPage();
  try {
    await page.setExtraHTTPHeaders({ "X-Internal-Token": input.token });
    await page.goto(
      `${resolveInternalBaseUrl()}/internal/storyboard-final-capture/${encodeURIComponent(input.captureJobId)}`,
      { waitUntil: "domcontentloaded", timeout: 30_000 },
    );
    await page.waitForFunction(() => Boolean((window as any).__storyboardCaptureReady), null, {
      timeout: 45_000,
    });
    const readyAt = Date.now();
    const captureState = await page.evaluate(() => (window as any).__storyboardCaptureState ?? null).catch(() => null);
    await page.waitForTimeout(Math.ceil(input.durationSeconds * 1000) + 500);
    const video = page.video();
    await context.close();
    await browser.close();
    const videoPath = await video?.path();
    if (!videoPath || !existsSync(videoPath)) {
      throw new Error("Browser recording did not produce a WebM file.");
    }
    return {
      webmPath: videoPath,
      readyOffsetSeconds: Math.max(0, (readyAt - recordingStartedAt) / 1000),
      captureState,
    };
  } catch (error) {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    throw error;
  }
}

async function failJob(input: {
  db: Db;
  captureJobId: string;
  status: StoryboardPreviewMatchCaptureStatus;
  failureCode: StoryboardPreviewMatchCaptureFailureCode;
  safeMessage: string;
  safeDiagnostics: string[];
  attemptId?: string | null;
}): Promise<void> {
  const now = new Date();
  await updateJob(input.db, input.captureJobId, {
    status: input.status,
    stage: null,
    failureCode: input.failureCode,
    safeMessage: input.safeMessage,
    safeDiagnosticsJson: input.safeDiagnostics,
    completedAt: now,
  });
  if (input.attemptId && input.db) {
    await input.db
      .update(storyboardPreviewMatchCaptureAttempts)
      .set({
        status: "failed",
        failureCode: input.failureCode,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(storyboardPreviewMatchCaptureAttempts.id, input.attemptId));
  }
}

export async function runStoryboardPreviewMatchCaptureJob(input: {
  captureJobId: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const captureJobId = input.captureJobId;
  const workDir = workDirFor(captureJobId);
  mkdirSync(workDir, { recursive: true });
  let attemptId: string | null = null;

  try {
    const initialJob = await ensureJobStillActive(db, captureJobId);
    const payload = previewMatchCompositionPayloadSchema.parse(initialJob.payloadJson);
    const attempt = await createPreviewMatchCaptureAttempt({ captureJobId });
    attemptId = attempt.id;
    const routeToken = signStoryboardFinalCaptureToken({
      captureJobId,
      attemptId,
      tenantId: initialJob.tenantId,
      userId: initialJob.userId,
      previewCompositionHash: initialJob.previewCompositionHash,
      timelineHash: initialJob.timelineHash,
    });

    await updateJob(db, captureJobId, {
      status: "browser_ready",
      stage: "browser_ready",
      progressPercent: 25,
      safeMessage: "Preview runtime พร้อม กำลังเริ่มบันทึกวิดีโอ",
      safeDiagnosticsJson: ["Internal capture route token issued for this attempt."],
    });

    await ensureJobStillActive(db, captureJobId);
    await updateJob(db, captureJobId, {
      status: "capturing",
      stage: "capture_browser",
      progressPercent: 45,
      safeMessage: "กำลังบันทึกวิดีโอจาก preview runtime",
    });
    const browserCapture = await recordBrowserCapture({
      captureJobId,
      attemptId,
      token: routeToken,
      width: payload.output.width,
      height: payload.output.height,
      durationSeconds: payload.output.durationSeconds,
      workDir,
    });

    await ensureJobStillActive(db, captureJobId);
    await updateJob(db, captureJobId, {
      status: "encoding",
      stage: "encode_mp4",
      progressPercent: 70,
      safeMessage: "กำลังแปลงวิดีโอเป็น MP4 และตัดช่วงเตรียม browser ออก",
    });
    const visualMp4Path = join(workDir, "visual.mp4");
    encodeWebmToMp4({
      webmPath: browserCapture.webmPath,
      outputPath: visualMp4Path,
      width: payload.output.width,
      height: payload.output.height,
      fps: payload.output.fps,
      durationSeconds: payload.output.durationSeconds,
      quality: initialJob.quality === "high" ? "high" : "standard",
      readyOffsetSeconds: browserCapture.readyOffsetSeconds,
    });
    const audioMix = await buildFinalTimelineAudio({
      payload,
      workDir,
    });
    const mp4Path = join(workDir, "final.mp4");
    if (audioMix.audioPath) {
      muxAudioIntoMp4({
        videoPath: visualMp4Path,
        audioPath: audioMix.audioPath,
        outputPath: mp4Path,
        durationSeconds: payload.output.durationSeconds,
      });
    } else {
      execFileSync(
        resolveBinary("ffmpeg"),
        [
          "-y",
          "-hide_banner",
          "-loglevel",
          "warning",
          "-i",
          visualMp4Path,
          "-c",
          "copy",
          mp4Path,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
    }
    const probe = probeMp4(mp4Path);
    if (!probe.hasVideo) {
      throw new Error("Encoded MP4 does not contain a video stream.");
    }
    const framePixels = inspectMp4FramePixels({
      path: mp4Path,
      durationSeconds: probe.durationSeconds ?? payload.output.durationSeconds,
    });
    if (!framePixels.passed) {
      await failJob({
        db,
        captureJobId,
        attemptId,
        status: "verification_failed",
        failureCode: "verification_failed",
        safeMessage: "ไฟล์ Capture ไม่ผ่านการตรวจสอบ เพราะภาพที่บันทึกมืดหรือไม่มีเนื้อหาวิดีโอ",
        safeDiagnostics: [
          `Pixel QA failed: meanLuma=${framePixels.meanLuma}, nonBlackRatio=${framePixels.nonBlackRatio}`,
        ],
      });
      return;
    }
    const fileBuffer = readFileSync(mp4Path);
    const storageKey = [
      "storyboard-preview-match",
      initialJob.tenantId,
      captureJobId,
      attemptId,
      "final.mp4",
    ].join("/");
    await assertR2StorageActive();
    const stored = await storagePutFromPath(storageKey, mp4Path, "video/mp4");
    const artifact = {
      id: `${captureJobId}_${attemptId}_final`,
      url: stored.url,
      storageKey: stored.key,
      contentHash: sha256Hash(fileBuffer),
      mimeType: "video/mp4",
      sizeBytes: statSync(mp4Path).size,
      durationSeconds: probe.durationSeconds,
      width: probe.width,
      height: probe.height,
      fps: probe.fps,
      hasAudio: probe.hasAudio,
    };

    await ensureJobStillActive(db, captureJobId);
    await updateJob(db, captureJobId, {
      status: "verifying",
      stage: "verify_output",
      progressPercent: 85,
      safeMessage: "กำลังตรวจสอบไฟล์ Capture ก่อนเปิดใช้งาน",
    });
    const verification = verifyPreviewMatchCaptureArtifacts({
      captureJobId,
      quality: initialJob.quality === "high" ? "high" : "standard",
      expected: {
        width: payload.output.width,
        height: payload.output.height,
        fps: payload.output.fps,
        durationSeconds: payload.output.durationSeconds,
        previewCompositionHash: initialJob.previewCompositionHash,
        timelineHash: initialJob.timelineHash,
        requireAudioTrack: shouldPreserveNativeAudio(payload) || shouldIncludeAudioEvents(payload),
      },
      artifact,
      evidence: {
        renderer: "playwright_record_video",
        route: "internal_storyboard_final_capture",
        attemptId,
        readyOffsetSeconds: browserCapture.readyOffsetSeconds,
        captureState: browserCapture.captureState,
        audioMix,
        framePixels,
      },
    });
    if (!verification.ok) {
      await failJob({
        db,
        captureJobId,
        attemptId,
        status: "verification_failed",
        failureCode: verification.failureCode ?? "verification_failed",
        safeMessage: "ไฟล์ Capture ไม่ผ่านการตรวจสอบ จึงยังไม่บันทึกเข้า Library",
        safeDiagnostics: verification.safeDiagnostics,
      });
      return;
    }

    await ensureJobStillActive(db, captureJobId);
    await updateJob(db, captureJobId, {
      status: "publishing",
      stage: "publish_library",
      progressPercent: 95,
      safeMessage: "กำลังบันทึกไฟล์ที่ตรวจสอบแล้วเข้า Library",
    });
    const created = await createLibraryItem(
      {
        itemType: "video",
        source: "storyboard_preview_match_capture",
        title: `Storyboard Preview Match ${initialJob.runId}`,
        description: "Captured final composite from Storyboard preview runtime",
        status: "ready",
        visibility: "private",
        metadata: {
          source_type: "storyboard_preview_match_capture",
          capture_job_id: captureJobId,
          attempt_id: attemptId,
          product_id: initialJob.productId,
          run_id: initialJob.runId,
          storyboard_review_id: initialJob.storyboardReviewId,
          preview_composition_hash: initialJob.previewCompositionHash,
          timeline_hash: initialJob.timelineHash,
          final_composite_config_hash: initialJob.finalCompositeConfigHash,
          evidence_ref: verification.evidenceRef,
        },
        sourceUrl: stored.url,
        thumbnailUrl: null,
        sourceLink: {
          linkType: "storyboard_preview_match_capture",
          linkId: captureJobId,
          providerTaskId: attemptId,
        },
      },
      { userId: initialJob.userId, tenantId: initialJob.tenantId },
      db,
    );

    const now = new Date();
    await updateJob(db, captureJobId, {
      status: "saved_to_library",
      stage: null,
      progressPercent: 100,
      failureCode: null,
      safeMessage: "Capture ตาม Preview เสร็จและบันทึกเข้า Library แล้ว",
      safeDiagnosticsJson: [
        "Browser capture verified and saved to Library.",
        ...audioMix.warnings.slice(0, 5),
      ],
      outputJson: {
        url: stored.url,
        storageKey: stored.key,
        artifact,
        libraryItemId: created.item.id,
      },
      evidenceJson: {
        evidenceRef: verification.evidenceRef,
        verification: verification.evidence,
      },
      completedAt: now,
    });
    await db
      .update(storyboardPreviewMatchCaptureAttempts)
      .set({
        status: "completed",
        stage: "publish_library",
        outputJson: { url: stored.url, storageKey: stored.key, artifact },
        evidenceJson: { evidenceRef: verification.evidenceRef },
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(storyboardPreviewMatchCaptureAttempts.id, attemptId));
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 240) : "Unknown capture worker failure";
    if (!/no longer active/i.test(message)) {
      await failJob({
        db,
        captureJobId,
        attemptId,
        status: "failed_transient",
        failureCode: message.includes("Playwright")
          ? "browser_launch_failed"
          : message.includes("recording")
            ? "browser_recording_unavailable"
            : message.includes("ffmpeg") || message.includes("MP4")
              ? "encode_failed"
              : "capture_ready_timeout",
        safeMessage: "Capture ตาม Preview ไม่สำเร็จ งานถูกหยุดพร้อมบันทึกสถานะแล้ว",
        safeDiagnostics: [message],
      });
    }
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup only.
    }
  }
}
