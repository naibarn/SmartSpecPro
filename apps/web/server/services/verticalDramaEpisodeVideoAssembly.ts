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
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { verticalDramaEpisodes } from "../../drizzle/schema";
import { storagePutFromPath, storageStreamFile } from "../storage";
import type { VerticalDramaMotionPromptPack } from "@shared/verticalDramaSeries";
import { resolveCanonicalShotAssembly } from "@shared/verticalDramaSeries/assemblyReadiness";
import type { VdAdBannerPlacementId } from "@shared/verticalDramaSeries/adBannerPresets";
// W12-A voice chain wave — imported by DIRECT PATH (not the shared barrel),
// same convention `audio.ts`'s own doc comment documents for itself (also
// followed by `verticalDramaEpisodes.ts` for the identical type) — its
// `VerticalDramaDialogueAudioPlan` would otherwise collide with the compact,
// unrelated recommendation type of the same name re-exported from
// `@shared/verticalDramaSeries/contracts` through the barrel.
import type {
  VerticalDramaDialogueAudioPlan,
  VerticalDramaDialogueLine,
} from "@shared/verticalDramaSeries/audio";
import {
  resolveDialogueLineAbsoluteTimings,
  type VdDialogueTimelineClip,
} from "@shared/verticalDramaSeries/dialogueAudioTimeline";
import { estimateVerticalDramaSpeechSeconds } from "@shared/verticalDramaSeries/dialogueQuality";
// Task #34 — pure Text Overlay Suite constants/helpers. Safe as a normal
// static import (unlike `verticalDramaStoryBible.ts`, this shared module has
// no transitive `adminProcedure`/router dependency — see
// `server/services/verticalDramaTextOverlayResolution.ts`'s own doc comment
// for the ONE module in this feature that DOES need a dynamic import).
import {
  type VdSeriesWatermarkSlotId,
  type VdWatermarkPosition,
  VD_CHARACTER_INTRO_DURATION_SECONDS,
  VD_END_CARD_FOLLOW_LINE_TH,
  VD_OPENER_RECAP_HEADER_TH,
  resolveOpeningSequenceWindows,
} from "@shared/verticalDramaSeries/textOverlay";
// Phase A render-options quick win — the age-rating badge's label text. Safe
// static import (zero transitive deps — see that module's own header doc
// comment); same convention as the Text Overlay Suite import above.
import {
  AUDIENCE_AGE_RATING_BADGE_LABEL,
  DEFAULT_AUDIENCE_AGE_RATING,
  type AudienceAgeRating,
} from "@shared/verticalDramaSeries/audienceAgeRating";
import {
  buildAssSubtitleFile,
  buildFinalRenderFfmpegArgs,
  type AssSubtitleLine,
  type CaptionPresetId,
  type DialogueAudioSegment,
  type ResolvedBanner,
  type ResolvedWatermarkImage,
  type SubtitleFontSizeId,
  type VdTextOverlayAssEvent,
  type VdTextOverlayAssKind,
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
  /**
   * Speaker-aware sub-shots task (Package 4, assembly-ordering fix) — present
   * only on sub-shot clips (`clipNumber = parentShotNumber * 100 +
   * subShotNumber`, e.g. shot 3 -> 301/302/303). See
   * `compareClipSourceOrder`'s doc comment for why raw `clipNumber` ascending
   * order is no longer safe to assume encodes playback order once any shot
   * uses this scheme.
   */
  parentShotNumber?: number;
  /** Speaker-aware sub-shots task — 1-based order WITHIN `parentShotNumber` (see `compareClipSourceOrder`). */
  subShotNumber?: number;
  /** Speaker-aware sub-shots task — fallback source for the shot-order sort key when `parentShotNumber` is absent (single, unsplit clips still carry this). */
  sourceShotNumbers?: number[];
}

/**
 * Playback-order comparator for `EpisodeClipSource[]` (Package 4, speaker-
 * aware sub-shots task — REQUIRED correctness fix, not optional). Sorting by
 * raw ascending `clipNumber` was only ever safe because `clipNumber ===
 * shotNumber` 1:1 for every clip before this feature. Once a shot splits
 * into sub-shots (`clipNumber = parentShotNumber * 100 + subShotNumber`,
 * e.g. shot 3 -> 301/302/303), a LATER un-split shot's bare `clipNumber`
 * (e.g. shot 4 -> `4`) would sort BEFORE those sub-shot clips under raw
 * numeric order, corrupting concat order. Sorting instead by the tuple
 * `(parentShotNumber ?? sourceShotNumbers[0] ?? clipNumber, subShotNumber ?? 0)`
 * recovers the correct shot-then-sub-shot order for BOTH split and unsplit
 * clips, and is BYTE-IDENTICAL to plain `clipNumber` ascending for any pack
 * that contains no split shots (every clip's `parentShotNumber` is then
 * either absent — falls back to `sourceShotNumbers[0]`, which already equals
 * `clipNumber` for a 1:1 pack — or, when present, still equals `clipNumber`
 * itself since unsplit clips are never sub-numbered).
 */
export function compareClipSourceOrder(
  a: EpisodeClipSource,
  b: EpisodeClipSource
): number {
  const aShot = a.parentShotNumber ?? a.sourceShotNumbers?.[0] ?? a.clipNumber;
  const bShot = b.parentShotNumber ?? b.sourceShotNumbers?.[0] ?? b.clipNumber;
  if (aShot !== bShot) return aShot - bShot;
  return (a.subShotNumber ?? 0) - (b.subShotNumber ?? 0);
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
  /**
   * Additive (`planning/vd-remotion-render-option/plan.md`, wave 1) — which
   * render engine produced/owns this `compiledVideo` state. Omitted means
   * `"ffmpeg"` (byte-identical to every render before this option existed).
   * `"remotion_queue"` tells `reconcileVdRemotionAssembly` (not this file —
   * see `verticalDramaRemotionRender.ts`) which worker-job queue to poll
   * while `status === "pending"`.
   */
  renderEngine?: "ffmpeg" | "remotion_queue";
  /**
   * `Date.now()` when `submitVdRemotionAssembly` submitted `pendingJobId` to
   * the `remotion_render_video` worker queue — the only clock
   * `reconcileVdRemotionAssembly`'s queued-TTL fallback has, since
   * `workerJobs` itself has no "submitted for Lane B" timestamp separate
   * from `createdAt` (`planning/worker-app-remotion-render-video/plan.md`
   * §P3). Absent for `renderEngine === "ffmpeg"` states.
   */
  renderSubmittedAt?: number;
}

export interface MissingClip {
  clipNumber: number;
  parentShotNumber?: number;
  sourceShotNumbers?: number[];
}

/**
 * Durable video-task patch written by the episode page after a render/upload.
 * Kept separate from the whole motion-prompt-pack shape so concurrent clip
 * completions can merge one task without replacing sibling clips.
 */
export type VerticalDramaVideoTaskPatch = NonNullable<
  VerticalDramaMotionPromptPack["clips"][number]["videoTask"]
>;

/**
 * Merge one clip's task state into the FRESH motion-prompt-pack snapshot.
 *
 * The caller must obtain the fresh snapshot while holding the episode row lock
 * before calling this helper. The previous client path built a whole-pack
 * update from React query state, so two clips completing together could each
 * overwrite the other clip's `videoTask`. This helper is intentionally pure so
 * the merge contract is testable independently from the transaction.
 */
export function mergeVideoTaskIntoMotionPromptPack(
  pack: VerticalDramaMotionPromptPack | null | undefined,
  clipNumber: number,
  videoTask: VerticalDramaVideoTaskPatch | null,
  sourceShotNumber?: number,
  durationSeconds = 8,
  selectedVideoModelId = ""
): VerticalDramaMotionPromptPack | null {
  const persistedVideoTask =
    videoTask && typeof videoTask.videoUrl === "string"
      ? {
          ...videoTask,
          videoUrl: normalizeVerticalDramaStoredAssetUrl(videoTask.videoUrl),
        }
      : videoTask;

  if (!pack) {
    if (!persistedVideoTask || sourceShotNumber == null) return null;
    return {
      selectedVideoModelId,
      durationProfileId: "vertical_drama_60s_9_frames_8_clips",
      motionMode: "first_frame_to_video",
      clips: [
        {
          clipNumber,
          sourceShotNumbers: [sourceShotNumber],
          prompt: "",
          durationSeconds,
          videoTask: persistedVideoTask,
        },
      ],
      warnings: [],
    };
  }

  const existingIndex = pack.clips.findIndex(
    clip => clip.clipNumber === clipNumber
  );
  if (existingIndex !== -1) {
    const clips = pack.clips.slice();
    if (persistedVideoTask) {
      clips[existingIndex] = { ...clips[existingIndex], videoTask: persistedVideoTask };
    } else {
      const { videoTask: _dropped, ...withoutVideoTask } = clips[existingIndex];
      clips[existingIndex] = withoutVideoTask;
    }
    return { ...pack, clips };
  }

  // Clearing a task for a clip that does not exist is a no-op. This prevents a
  // late failed poll from creating a phantom clip in the pack.
  if (!videoTask || sourceShotNumber == null) return pack;

  return {
    ...pack,
    clips: [
      ...pack.clips,
      {
        clipNumber,
        sourceShotNumbers: [sourceShotNumber],
        prompt: "",
        durationSeconds,
        videoTask,
      },
    ],
  };
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
    .sort(compareClipSourceOrder)
    .filter(c => !c.videoUrl || !c.videoUrl.trim())
    .map(c => ({
      clipNumber: c.clipNumber,
      parentShotNumber: c.parentShotNumber,
      sourceShotNumbers: c.sourceShotNumbers,
    }));
}

/**
 * Collapse a list of missing CLIP numbers down to their human-readable
 * PARENT SHOT numbers, for the `resolveClipsForAssembly` error message below.
 * A split sub-shot carries `parentShotNumber`/`sourceShotNumbers`, so those
 * explicit fields are preferred. The numeric `parentShotNumber * 100 +
 * subShotNumber` convention remains only a legacy fallback for old rows that
 * lack the metadata. Multiple missing sub-shots of the same parent shot
 * collapse to ONE entry (`Set`-deduplicated); the result is sorted ascending
 * so the message always reads shot numbers in story order, regardless of the
 * input clip-number order.
 */
export function deriveMissingShotNumbers(missing: MissingClip[]): number[] {
  const shotNumbers = new Set<number>(
    missing.map(
      m =>
        m.parentShotNumber ??
        m.sourceShotNumbers?.[0] ??
        (m.clipNumber >= 100
          ? Math.floor(m.clipNumber / 100)
          : m.clipNumber)
    )
  );
  return Array.from(shotNumbers).sort((a, b) => a - b);
}

/**
 * Resolve exactly one completed clip per canonical shot for the concat,
 * honoring `allowPartial`. Expected shots come from storyboard, then start
 * frames, then clip-derived identities for historical episodes.
 * Throws a plain `Error` with a human-readable, user-facing message (mapped to
 * `PRECONDITION_FAILED` at the router) when clips are missing and partial
 * assembly was not explicitly requested. The message reports canonical shot
 * numbers, not raw `clipNumber`s — a raw sub-shot `clipNumber` like `301` is
 * meaningless to a user who thinks in terms of shots, not clips.
 */
export function resolveClipsForAssembly(
  clips: EpisodeClipSource[],
  opts: {
    allowPartial?: boolean;
    storyboardShotNumbers?: readonly unknown[];
    startFrameShotNumbers?: readonly unknown[];
  } = {}
): { ordered: EpisodeClipSource[]; missing: MissingClip[] } {
  const canonical = resolveCanonicalShotAssembly({
    clips,
    storyboardShotNumbers: opts.storyboardShotNumbers,
    startFrameShotNumbers: opts.startFrameShotNumbers,
  });
  const missing: MissingClip[] = canonical.missingShotNumbers.map(
    shotNumber => ({
      clipNumber: shotNumber,
      parentShotNumber: shotNumber,
      sourceShotNumbers: [shotNumber],
    })
  );

  if (missing.length > 0 && !opts.allowPartial) {
    const shotList = canonical.missingShotNumbers.join(", ");
    throw new Error(
      `vertical_drama_assembly_missing_clips: shot(s) ${shotList} still need a rendered video. ` +
        `Generate those shots first, or assemble only the completed shots.`
    );
  }

  if (canonical.selectedClips.length === 0) {
    throw new Error(
      "vertical_drama_assembly_no_clips: no completed video clips exist for this episode yet."
    );
  }

  return { ordered: canonical.selectedClips, missing };
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
  width?: number;
  height?: number;
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
  const width = spec.width ?? 1080;
  const height = spec.height ?? 1920;
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
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
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

export type FfmpegResult = {
  code: number;
  stderr: string;
  /** When ffmpeg is terminated by the OS, Node reports a null exit code. */
  signal?: NodeJS.Signals | null;
};

export type FfmpegRunner = (args: string[]) => Promise<FfmpegResult>;

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
    child.on("close", (code, signal) =>
      resolve({ code: code ?? -1, signal, stderr }),
    );
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
  const managedStorageKey = extractVerticalDramaManagedStorageKey(videoUrl);
  // Some lightweight consumers mock the storage module without the streaming
  // export; keep the existing HTTP fallback for those environments.
  let readManagedStorage: typeof storageStreamFile | undefined;
  try {
    readManagedStorage = storageStreamFile;
  } catch {
    readManagedStorage = undefined;
  }
  if (
    managedStorageKey &&
    typeof readManagedStorage === "function" &&
    !managedStorageKey.startsWith("auto-team-media/")
  ) {
    // The storage proxy intentionally requires an authenticated browser or
    // service request. Render workers have neither, so read the managed object
    // through the trusted server-side storage layer instead of making an
    // unauthenticated HTTP request that returns 404. Callers validate episode
    // ownership before entering this render path.
    const stored = await readManagedStorage(managedStorageKey);
    if (stored) {
      const output = fs.createWriteStream(destPath);
      const stream = stored.stream as any;
      await pipeline(
        typeof stream?.pipe === "function"
          ? stream
          : Readable.fromWeb(stream),
        output
      );
      return;
    }
  }

  const absoluteUrl = /^https?:\/\//i.test(videoUrl)
    ? videoUrl
    : new URL(videoUrl, internalBaseUrl).toString();
  const res = await fetch(absoluteUrl);
  if (!res.ok || !res.body) {
    throw new Error(
      `Failed to download clip source (${res.status}): ${safeAssetUrlForDiagnostics(absoluteUrl)}`
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fsp.writeFile(destPath, buf);
}

/**
 * Worker artifacts are sometimes persisted as short-lived signed R2 URLs.
 * The object itself is durable, so use the app's storage proxy instead of
 * retaining the expiring query string in the episode JSONB.
 */
export function normalizeVerticalDramaStoredAssetUrl(videoUrl: string | null | undefined): string | undefined {
  const value = String(videoUrl ?? "").trim();
  if (!value) return undefined;
  if (value.startsWith("/api/storage/files/") || value.startsWith("/uploads/")) {
    return value.split(/[?#]/, 1)[0];
  }
  try {
    const parsed = new URL(value);
    if (parsed.pathname.startsWith("/api/storage/files/")) {
      return parsed.pathname;
    }
    const marker = "/worker-artifacts/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex >= 0) {
      const storageKey = parsed.pathname.slice(markerIndex + 1);
      return `/api/storage/files/${storageKey}`;
    }
  } catch {
    // Keep non-URL provider references unchanged; the normal downloader will
    // report a precise error if they are not fetchable.
  }
  return value;
}

/**
 * Extract the durable managed-storage key from a persisted clip URL without
 * trusting any signed query parameters. Returns null for provider URLs,
 * uploads, malformed URLs, and unrelated paths.
 */
export function extractVerticalDramaManagedStorageKey(
  videoUrl: string | null | undefined,
): string | null {
  const value = String(videoUrl ?? "").trim();
  if (!value) return null;
  const proxyPrefix = "/api/storage/files/";
  if (value.startsWith(proxyPrefix)) {
    const key = value.slice(proxyPrefix.length).split(/[?#]/, 1)[0];
    if (!key) return null;
    try {
      return decodeURIComponent(key);
    } catch {
      return null;
    }
  }
  try {
    const parsed = new URL(value);
    const proxyMarker = "/api/storage/files/";
    if (parsed.pathname.startsWith(proxyMarker)) {
      const key = parsed.pathname.slice(proxyMarker.length);
      return key ? decodeURIComponent(key) : null;
    }
    const marker = "/worker-artifacts/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    const key = parsed.pathname.slice(markerIndex + 1);
    return key ? decodeURIComponent(key) : null;
  } catch {
    return null;
  }
}

/** Build the stable application URL for a managed storage object. */
export function buildVerticalDramaStorageProxyUrl(storageKey: string): string {
  return `/api/storage/files/${encodeURI(storageKey.replace(/^\/+/, ""))}`;
}

export type VerticalDramaVideoAssetResolution = Record<
  number,
  { mediaAssetId: number; url: string; status?: "ready" | "expired" }
>;

/** Apply owner-verified canonical delivery data to a motion-prompt pack. */
export function repairVerticalDramaVideoAssetUrls(
  pack: VerticalDramaMotionPromptPack | null,
  resolutions: VerticalDramaVideoAssetResolution,
): VerticalDramaMotionPromptPack | null {
  if (!pack?.clips?.length) return pack;
  let changed = false;
  const clips = pack.clips.map(clip => {
    const resolved = resolutions[clip.clipNumber];
    if (!resolved || !clip.videoTask) return clip;
    const nextVideoTask = {
      ...clip.videoTask,
      ...(resolved.status === "expired"
        ? { durabilityStatus: "expired" as const, videoUrl: undefined }
        : {
            mediaAssetId: String(resolved.mediaAssetId),
            videoUrl: resolved.url,
            durabilityStatus: "ready" as const,
          }),
    };
    if (
      clip.videoTask.mediaAssetId === nextVideoTask.mediaAssetId &&
      clip.videoTask.videoUrl === nextVideoTask.videoUrl &&
      clip.videoTask.durabilityStatus === nextVideoTask.durabilityStatus
    ) {
      return clip;
    }
    changed = true;
    return { ...clip, videoTask: nextVideoTask };
  });
  return changed ? { ...pack, clips } : pack;
}

function safeAssetUrlForDiagnostics(value: string): string {
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return value.split(/[?#]/, 1)[0];
  }
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
 *  same shape convention as `updateEpisodeDraft`'s `assemblyManifest` field).
 *  Exported (Vertical Drama Render Queue plan §4.2, Wave 3) so the router
 *  enqueue sites can mark `compiledVideo.status="pending"` with the new
 *  `worker_jobs` id the SAME way `submitAssemblyJob` always has — the
 *  executor (a separate wave) is the one that later flips it to
 *  `"ready"`/`"failed"`. */
export async function persistCompiledVideoState(
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
  /** Task #34 — how many Text Overlay Suite events were actually burned in
   *  (end card, opener recap, title bumper, episode indicator, character
   *  intro cards, mid-episode cards, and/or the text-variant watermark —
   *  all share this one count). `0` when the flag is off or the episode's
   *  `textOverlayPlan` has nothing enabled. */
  textOverlayEventCount: number;
  /** Task #34 — whether at least one IMAGE watermark was composited into
   *  this render. Dual watermark (`planning/vd-dual-watermark/plan.md`):
   *  `true` when either slot rendered an image; see `watermarkCount` for how
   *  many. */
  watermarkIncluded: boolean;
  /** Dual watermark — how many IMAGE watermark slots were actually
   *  composited into this render (0, 1, or 2). */
  watermarkCount: number;
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

/**
 * One Text Overlay Suite event (task #34) — REMOTE/pre-resolved shaped,
 * mirroring `RunAssemblyJobBannerInput`'s own "advisory window + resolution
 * flag" convention for the two kinds whose true window isn't known until
 * this job has probed the real total video duration.
 */
export interface RunAssemblyJobTextOverlayEventInput {
  kind: VdTextOverlayAssKind;
  text: string;
  /** Optional 3x3 screen anchor (per-episode cards). Applied as an inline ASS
   *  `\an` override; omitted keeps the style's baked-in alignment. */
  position?: VdWatermarkPosition;
  secondaryText?: string;
  variant?: VdTextOverlayAssEvent["variant"];
  opacity?: number;
  marginPx?: number;
  startSec: number;
  endSec: number;
  /** Mirrors `RunAssemblyJobBannerInput.entire` — when `true`, `startSec`/
   *  `endSec` above are ADVISORY only; `runAssemblyJob` re-resolves this
   *  event's window to `[0, probedTotalDurationSeconds]` after its own
   *  duration probe. Used for `episode_indicator`/`watermark_text` (whole-
   *  clip kinds — see `VdTextOverlayAssEvent`'s own doc comment). */
  entireClip?: boolean;
  /** When `true`, this event's `endSec` is resolved to the REAL probed
   *  `videoDurationSeconds` and `startSec` to `videoDurationSeconds -
   *  durationSecForEndAnchor` — i.e. the event keeps a FIXED length, anchored
   *  to the true end of the video (used for `end_card`, plan.md "end-anchored
   *  events resolved post-probe (mirror the banner 'entire' pattern)"). */
  endAnchored?: boolean;
  /** Required (falls back to `endSec - startSec` otherwise) when `endAnchored`
   *  is `true` — the event's fixed duration in seconds. */
  durationSecForEndAnchor?: number;
}

/**
 * ONE series watermark IMAGE slot (task #34, plan.md ลายน้ำ `type: "image"`;
 * dual watermark, `planning/vd-dual-watermark/plan.md`) — REMOTE-url shaped
 * like `RunAssemblyJobBannerInput`; the job downloads `imageUrl` to a local
 * staged PNG the same way clip/banner sources already are. Always spans the
 * whole video (no start/end window — see `ResolvedWatermarkImage`'s own doc
 * comment in `verticalDramaFinalRenderGraph.ts`). A render can carry UP TO
 * TWO of these (one per `VdSeriesWatermarkSlotId`) in `RunAssemblyJobArgs
 * .watermarkImages`.
 */
export interface RunAssemblyJobWatermarkImageInput {
  /** Which configured slot this is (`"primary"` = series/title logo,
   *  `"secondary"` = channel logo) — drives distinct staged filenames and
   *  distinct Remotion layer ids so two watermarks never collide. */
  slotId: VdSeriesWatermarkSlotId;
  imageUrl: string;
  position: VdWatermarkPosition;
  opacity: number;
  scalePct: number;
  marginPx: number;
}

export interface RunAssemblyJobSubtitlesInput {
  preset: CaptionPresetId;
  lines: AssSubtitleLine[];
  /** Overrides `resolveVdSubtitleFontsDir()`'s auto-resolution when supplied. */
  fontsDir?: string;
  /** Task #34 — additive Text Overlay Suite events merged into the SAME
   *  `.ass` file as `lines` (see `buildAssSubtitleFile`'s own doc comment for
   *  why this is safe/independent of `preset`/`lines`). Absent/empty is
   *  BYTE-IDENTICAL to before task #34. */
  overlays?: RunAssemblyJobTextOverlayEventInput[];
  /** Phase A render-options quick win — scale preset for the burned-in
   *  caption text size (see `SUBTITLE_FONT_SIZE_SCALE` in
   *  `verticalDramaFinalRenderGraph.ts`). Omitted/`"medium"` is
   *  BYTE-IDENTICAL to before this option existed. */
  fontSize?: SubtitleFontSizeId;
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
  /** Task #34 — additive; omitted is BYTE-IDENTICAL to before task #34. Dual
   *  watermark: up to 2 entries, one per `VdSeriesWatermarkSlotId`. */
  watermarkImages?: RunAssemblyJobWatermarkImageInput[];
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
      args.subtitles ||
      (args.watermarkImages?.length ?? 0) > 0
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

      // Task #34 — stage the series' IMAGE watermark(s) (additive) BEFORE the
      // duration probe below, same download helper/convention as banners.
      // Dual watermark (`planning/vd-dual-watermark/plan.md`): one file per
      // `slotId` — distinct filenames by construction (there are at most two
      // slots, "primary"/"secondary"), so two watermark images never
      // collide on the same staged local path.
      const resolvedWatermarkImages: ResolvedWatermarkImage[] = [];
      for (const watermark of args.watermarkImages ?? []) {
        const dest = path.join(
          workDir,
          `watermark-${watermark.slotId}${inferDownloadExtension(watermark.imageUrl, ".png")}`
        );
        await downloadClipToFile(watermark.imageUrl, dest, internalBaseUrl);
        resolvedWatermarkImages.push({
          slotId: watermark.slotId,
          localPngPath: dest,
          position: watermark.position,
          opacity: watermark.opacity,
          scalePct: watermark.scalePct,
          marginPx: watermark.marginPx,
        });
      }

      // Total source duration, needed up front for banner timing/validation
      // AND (task #34) end-anchored/entire-clip text-overlay events —
      // summed from the already-downloaded clips (concat never re-times
      // individual clips, so this matches the final output's duration).
      // Moved BEFORE `.ass` generation (task #34; previously this probe ran
      // AFTER subtitle generation, back when subtitle timing never needed
      // the total duration) so `entireClip`/`endAnchored` overlay events can
      // be resolved to real seconds before the `.ass` file is written.
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

      // Task #34 — re-resolve `entireClip`/`endAnchored` overlay events to
      // the REAL probed `videoDurationSeconds`, mirroring banners' own
      // `entire: true` re-resolution immediately below (same "advisory
      // window, real value substituted post-probe" pattern — see
      // `RunAssemblyJobBannerInput.entire`'s doc comment for the full "why").
      const resolvedOverlayEvents: VdTextOverlayAssEvent[] = (
        args.subtitles?.overlays ?? []
      ).map(overlay => {
        if (overlay.entireClip) {
          return { ...overlay, startSec: 0, endSec: videoDurationSeconds };
        }
        if (overlay.endAnchored) {
          const dur =
            overlay.durationSecForEndAnchor ??
            Math.max(0.1, overlay.endSec - overlay.startSec);
          return {
            ...overlay,
            startSec: Math.max(0, videoDurationSeconds - dur),
            endSec: videoDurationSeconds,
          };
        }
        return overlay;
      });

      // Generate the subtitle `.ass` locally — synthesized, not downloaded.
      // Task #34: also triggered by a non-empty `overlays` list, independent
      // of `lines` (a render with `subtitlePreset: "none"` but at least one
      // enabled text-overlay kind still needs an `.ass` file — see
      // `buildAssSubtitleFile`'s own doc comment).
      let subtitlesForGraph: { assPath: string; fontsDir?: string } | undefined;
      if (
        args.subtitles &&
        (args.subtitles.lines.length > 0 || resolvedOverlayEvents.length > 0)
      ) {
        const fontsDir = args.subtitles.fontsDir ?? resolveVdSubtitleFontsDir();
        const assContent = buildAssSubtitleFile(
          args.subtitles.lines,
          args.subtitles.preset,
          {
            fontsDir,
            playResX: 1080,
            playResY: 1920,
            fontSize: args.subtitles.fontSize,
          },
          resolvedOverlayEvents
        );
        const assPath = path.join(workDir, "captions.ass");
        await fsp.writeFile(assPath, assContent, "utf8");
        subtitlesForGraph = { assPath, fontsDir };
      }

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
        watermarkImages:
          resolvedWatermarkImages.length > 0 ? resolvedWatermarkImages : undefined,
      });

      finalRenderSummary = {
        bannerCount: resolvedBanners.length,
        dialogueAudioSegmentCount: resolvedDialogueSegments.length,
        loudnessNormalize: args.dialogueAudio?.loudnessNormalize === true,
        subtitlePreset: args.subtitles?.preset,
        subtitleLineCount: args.subtitles?.lines?.length ?? 0,
        textOverlayEventCount: resolvedOverlayEvents.length,
        watermarkIncluded: resolvedWatermarkImages.length > 0,
        watermarkCount: resolvedWatermarkImages.length,
        renderedAt: new Date().toISOString(),
      };
    }

    const result = await runner(ffArgs);
    if (result.code !== 0) {
      const termination =
        result.code === -1 && result.signal
          ? `signal ${result.signal}`
          : `code ${result.code}`;
      throw new Error(
        `ffmpeg concat failed (exit ${result.code}; ${termination}): ${result.stderr.slice(-2000)}`
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
      error: undefined,
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
  /** Task #34 — additive; omitted is BYTE-IDENTICAL to before task #34. Dual
   *  watermark: up to 2 entries. */
  watermarkImages?: RunAssemblyJobWatermarkImageInput[];
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
    watermarkImages: args.watermarkImages,
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
 * - Phase A render-options quick win (`subtitleFontSize`/`showAgeBadge` on
 *   `assembleEpisodeVideo`'s mutation input) threads through HERE too,
 *   mirroring `subtitlePreset`'s own "input -> this resolver -> render args"
 *   path exactly. `subtitleFontSize` is carried onto the returned
 *   `subtitles.fontSize` untouched (actually APPLIED later, inside
 *   `runAssemblyJob` -> `buildAssSubtitleFile`). `showAgeBadge` builds ONE
 *   whole-clip `age_badge` overlay event (the SAME `entireClip: true`
 *   "advisory window, resolved post-probe" convention
 *   `resolveEpisodeTextOverlayRunInputs` below uses for `episode_indicator`/
 *   `watermark_text`) and merges it into `subtitles.overlays` —
 *   INDEPENDENTLY of whether there is any dialogue-audio/subtitle-preset data
 *   at all, since the badge is a fully separate feature from the dialogue
 *   plan (a `showAgeBadge`-only render still gets a `subtitles` object, with
 *   `preset: "no_subtitle_style"` when no captions were also requested —
 *   mirrors the SAME fallback `verticalDramaEpisodes.ts`'s own
 *   `combinedSubtitles` merge already uses for Text Overlay Suite events).
 *
 * TODO Phase A parity: `assembleSeasonVideos` (`verticalDramaSeries.ts`)
 * already shares `subtitlePreset`/`includeDialogueAudio`/`loudnessNormalize`
 * through this SAME function per episode, but does not yet forward the new
 * `subtitleFontSize`/`showAgeBadge`/`audienceAgeRating` params added here —
 * `verticalDramaSeries.ts` is outside this quick win's edit scope. A
 * follow-up wave should add both fields to that mutation's `options` input
 * (+ resolve each episode's series audience rating) and pass them through
 * here for full parity with `assembleEpisodeVideo`.
 */
export interface VdEpisodeDialogueAudioSubtitlesRunInputs {
  dialogueAudio?: RunAssemblyJobDialogueAudioInput;
  subtitles?: RunAssemblyJobSubtitlesInput;
  dialogueAudioSegmentsIncluded: number;
  subtitleLinesIncluded: number;
}

/**
 * One clip's own dialogue, as authored on `motionPromptPack.clips[].dialogue`
 * and shown on the storyboard shot cards.
 *
 * Field incident 2026-08-01 (series 21 / episode 124): every shot had dialogue
 * on screen, yet the render burned in ZERO subtitles and the UI insisted the
 * episode "has no dialogue". Subtitles were sourced ONLY from
 * `dialogueAudioPlan.dialogueLines`, which is written by the dialogue/voice
 * step — an episode that never ran that step keeps its dialogue solely on the
 * motion prompt pack (20 lines across 8 of 9 clips, in that case). The render
 * was already being handed these very clips; only their `dialogue` was dropped.
 */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export interface VdClipAuthoredDialogueLine {
  text: string;
  /** Display name for the speaker chip; omitted for narration. */
  speakerName?: string;
}

/**
 * Turns per-clip authored dialogue into `VerticalDramaDialogueLine[]` shaped
 * exactly like a real dialogue plan's, so the CLIP-LOCAL `start`/`end` written
 * here flow through the SAME `resolveDialogueLineAbsoluteTimings` conversion
 * every planned line uses (its `clip_timeline` branch) — no second timing model.
 *
 * Within a clip, each line gets a share of the clip window proportional to its
 * estimated speech time (`estimateVerticalDramaSpeechSeconds`, the same
 * estimator the storyboard cards display), laid end to end. That keeps a long
 * line on screen longer than a short one instead of splitting the clip evenly,
 * and it is fully deterministic.
 */
function buildDialogueLinesFromClipDialogue(
  clipDialogue: Map<number, VdClipAuthoredDialogueLine[]> | undefined,
  motionClips: VdDialogueTimelineClip[],
  includedClipNumbers: number[]
): VerticalDramaDialogueLine[] {
  if (!clipDialogue || clipDialogue.size === 0) return [];
  const includedSet = new Set(includedClipNumbers);
  const built: VerticalDramaDialogueLine[] = [];

  for (const clip of [...motionClips].sort((a, b) => a.clipNumber - b.clipNumber)) {
    if (!includedSet.has(clip.clipNumber)) continue;
    const authored = (clipDialogue.get(clip.clipNumber) ?? []).filter(line =>
      line.text.trim()
    );
    if (authored.length === 0) continue;

    const clipDurationSec = Math.max(0, clip.durationSeconds);
    if (clipDurationSec <= 0) continue;

    const weights = authored.map(line =>
      Math.max(0.1, estimateVerticalDramaSpeechSeconds(line.text))
    );
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

    let localCursorSec = 0;
    authored.forEach((line, index) => {
      // Last line closes out the clip exactly, so rounding can never leave a
      // sliver of untitled tail.
      const localEndSec =
        index === authored.length - 1
          ? clipDurationSec
          : Math.min(
              clipDurationSec,
              localCursorSec + (weights[index] / totalWeight) * clipDurationSec
            );
      if (localEndSec > localCursorSec) {
        built.push({
          lineId: `clip-${clip.clipNumber}-line-${index + 1}`,
          shotNumber: clip.sourceShotNumbers[0] ?? clip.clipNumber,
          clipNumber: clip.clipNumber,
          speakerName: line.speakerName?.trim() || "",
          isNarration: !line.speakerName?.trim(),
          text: line.text.trim(),
          start: localCursorSec,
          end: localEndSec,
          targetDurationSeconds: localEndSec - localCursorSec,
        });
      }
      localCursorSec = localEndSec;
    });
  }

  return built;
}

export function resolveEpisodeDialogueAudioAndSubtitlesRunInputs(params: {
  plan: VerticalDramaDialogueAudioPlan | null | undefined;
  motionClips: VdDialogueTimelineClip[];
  /** Per-clip authored dialogue, used as the subtitle source when `plan` has
   *  no lines. Keyed by `clipNumber`. Absent/empty ⇒ behavior is
   *  byte-identical to before this fallback existed. */
  clipDialogue?: Map<number, VdClipAuthoredDialogueLine[]>;
  includedClipNumbers: number[];
  includeDialogueAudio: boolean;
  loudnessNormalize: boolean;
  subtitlePreset: CaptionPresetId | "none" | undefined;
  /** Phase A render-options quick win — see this function's own doc comment. */
  subtitleFontSize?: SubtitleFontSizeId;
  /** Phase A render-options quick win — see this function's own doc comment. */
  showAgeBadge?: boolean;
  /** Only consulted when `showAgeBadge` is true; defaults to the
   *  least-restrictive `"18plus"` tier when omitted (mirrors
   *  `resolveAudienceAgeRating`'s own "no rating? default to 18+" default). */
  audienceAgeRating?: AudienceAgeRating;
}): VdEpisodeDialogueAudioSubtitlesRunInputs {
  const planLines = params.plan?.dialogueLines ?? [];
  const lines =
    planLines.length > 0
      ? planLines
      : buildDialogueLinesFromClipDialogue(
          params.clipDialogue,
          params.motionClips,
          params.includedClipNumbers
        );
  const wantsSubtitles =
    params.subtitlePreset != null &&
    params.subtitlePreset !== "none" &&
    params.subtitlePreset !== "no_subtitle_style";

  // Phase A age-rating badge — resolved up front, independent of the
  // dialogue-plan guard below (see this function's own doc comment).
  const ageBadgeOverlays: RunAssemblyJobTextOverlayEventInput[] = params.showAgeBadge
    ? [
        {
          kind: "age_badge",
          text:
            AUDIENCE_AGE_RATING_BADGE_LABEL[
              params.audienceAgeRating ?? DEFAULT_AUDIENCE_AGE_RATING
            ],
          // Advisory-only — `runAssemblyJob` re-resolves to the real
          // [0, videoDurationSeconds] window post-probe (same convention as
          // `episode_indicator`/`watermark_text` below).
          startSec: 0,
          endSec: 0,
          entireClip: true,
        },
      ]
    : [];

  if (lines.length === 0 || (!params.includeDialogueAudio && !wantsSubtitles)) {
    const badgeOnlySubtitles: RunAssemblyJobSubtitlesInput | undefined =
      ageBadgeOverlays.length > 0
        ? { preset: "no_subtitle_style", lines: [], overlays: ageBadgeOverlays }
        : undefined;
    return {
      dialogueAudioSegmentsIncluded: 0,
      subtitleLinesIncluded: 0,
      ...(badgeOnlySubtitles ? { subtitles: badgeOnlySubtitles } : {}),
    };
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

  // PLANNED per-clip windows, used only to express each caption's position as
  // a fraction OF ITS OWN CLIP. A renderer that has probed the real clips can
  // then re-time the line exactly (`AssSubtitleLine.clipNumber` doc comment);
  // one that has not keeps using the absolute seconds below unchanged.
  const plannedClipWindows = new Map<number, { offsetSec: number; durationSec: number }>();
  {
    const includedSet = new Set(params.includedClipNumbers);
    let cumulativeSec = 0;
    for (const clip of [...params.motionClips].sort(
      (a, b) => a.clipNumber - b.clipNumber
    )) {
      if (!includedSet.has(clip.clipNumber)) continue;
      const durationSec = Math.max(0, clip.durationSeconds);
      plannedClipWindows.set(clip.clipNumber, { offsetSec: cumulativeSec, durationSec });
      cumulativeSec += durationSec;
    }
  }

  for (const timing of timings) {
    if (wantsSubtitles && timing.text.trim()) {
      const window =
        timing.resolvedClipNumber != null
          ? plannedClipWindows.get(timing.resolvedClipNumber)
          : undefined;
      const clipAttribution =
        window && window.durationSec > 0
          ? {
              clipNumber: timing.resolvedClipNumber,
              clipLocalStartFrac: clamp01(
                (timing.absoluteStartSec - window.offsetSec) / window.durationSec
              ),
              clipLocalEndFrac: clamp01(
                (timing.absoluteEndSec - window.offsetSec) / window.durationSec
              ),
            }
          : {};
      subtitleLines.push({
        startSec: timing.absoluteStartSec,
        endSec: timing.absoluteEndSec,
        // Narration lines omit the speaker-name chip (see `buildAssDialogueEvent`
        // in `verticalDramaFinalRenderGraph.ts`) — "speakerName from character
        // name" (task #21 phase B) does not apply to a narrator line, which
        // has no speaking character.
        speakerName: timing.isNarration ? undefined : timing.speakerName,
        text: timing.text,
        ...clipAttribution,
      });
    }
    if (params.includeDialogueAudio) {
      const audioUrl = audioUrlByLineId.get(timing.lineId);
      if (audioUrl) {
        segments.push({ audioUrl, startSec: timing.absoluteStartSec });
      }
    }
  }

  // `hasCaptions` (not just `wantsSubtitles`) gates the caption preset/lines
  // in the returned `subtitles` object below — a real preset with zero
  // resolvable subtitle lines (e.g. every line blank) must NOT emit a
  // caption style with nothing to show it; the age badge (if any) still can.
  const hasCaptions = wantsSubtitles && subtitleLines.length > 0;

  let subtitles: RunAssemblyJobSubtitlesInput | undefined;
  if (hasCaptions || ageBadgeOverlays.length > 0) {
    subtitles = {
      preset: hasCaptions
        ? (params.subtitlePreset as CaptionPresetId)
        : "no_subtitle_style",
      lines: hasCaptions ? subtitleLines : [],
    };
    if (hasCaptions && params.subtitleFontSize) {
      subtitles.fontSize = params.subtitleFontSize;
    }
    if (ageBadgeOverlays.length > 0) {
      subtitles.overlays = ageBadgeOverlays;
    }
  }

  return {
    dialogueAudio:
      params.includeDialogueAudio && segments.length > 0
        ? { segments, loudnessNormalize: params.loudnessNormalize }
        : undefined,
    subtitles,
    dialogueAudioSegmentsIncluded: segments.length,
    subtitleLinesIncluded: subtitleLines.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Text Overlay Suite render feed (task #34)                                  */
/* -------------------------------------------------------------------------- */

/**
 * One SHOT-anchored overlay input (character intro cards + mid-episode
 * `time_setting`/`narrative_hook`/`custom` cards) — shot-local, like a
 * `VerticalDramaDialogueLine`, so it can be resolved to an ABSOLUTE
 * render-timeline position via the SAME `resolveDialogueLineAbsoluteTimings`
 * this file already uses for dialogue lines (plan.md "ตัวแปลงเวลา
 * shot→absolute ที่มีแล้ว (#21-B)... reuse for card anchors").
 */
export interface VdEpisodeTextOverlayAnchorInput {
  id: string;
  kind: VdTextOverlayAssKind;
  text: string;
  secondaryText?: string;
  variant?: VdTextOverlayAssEvent["variant"];
  shotNumber: number;
  offsetSec?: number;
  durationSec: number;
  /** Optional 3x3 screen anchor. Omitted keeps the style's baked-in
   *  alignment, so cards authored before this field render unchanged. */
  position?: VdWatermarkPosition;
}

/**
 * Resolve a list of shot-anchored overlay inputs to absolute render-timeline
 * events by treating each one as a SYNTHETIC, non-narration-free dialogue
 * line (`lineId`/`shotNumber`/`start`/`end` — the exact fields
 * `resolveDialogueLineAbsoluteTimings` needs) and reusing that function
 * whole, unmodified. `speakerName`/`isNarration` are throwaway (never read
 * back out — only `absoluteStartSec`/`absoluteEndSec` and the `lineId` ->
 * anchor zip matter here).
 */
export function resolveEpisodeTextOverlayAnchoredEvents(
  anchors: VdEpisodeTextOverlayAnchorInput[],
  motionClips: VdDialogueTimelineClip[],
  includedClipNumbers: number[]
): RunAssemblyJobTextOverlayEventInput[] {
  if (anchors.length === 0) return [];

  const syntheticLines: VerticalDramaDialogueLine[] = anchors.map(anchor => ({
    lineId: anchor.id,
    shotNumber: anchor.shotNumber,
    speakerName: "",
    isNarration: true,
    text: anchor.text,
    start: anchor.offsetSec ?? 0,
    end: (anchor.offsetSec ?? 0) + anchor.durationSec,
    targetDurationSeconds: anchor.durationSec,
  }));

  const timings = resolveDialogueLineAbsoluteTimings(
    syntheticLines,
    motionClips,
    includedClipNumbers
  );
  const anchorById = new Map(anchors.map(anchor => [anchor.id, anchor]));

  return timings.map(timing => {
    const anchor = anchorById.get(timing.lineId)!;
    return {
      kind: anchor.kind,
      text: anchor.text,
      secondaryText: anchor.secondaryText,
      variant: anchor.variant,
      position: anchor.position,
      startSec: timing.absoluteStartSec,
      endSec: timing.absoluteEndSec,
    };
  });
}

export interface VdEpisodeTextOverlayCharacterIntroInput {
  characterKey: string;
  shotNumber: number;
  name: string;
  role?: string;
}

export interface VdEpisodeTextOverlayCardInput {
  id: string;
  /** Already resolved to its ASS kind (`time_setting`/`narrative_hook` —
   *  `"custom"` cards resolve to `"narrative_hook"`, see
   *  `defaultCardStyleVariantForKind`/`VdTextOverlayCard.styleVariant` in
   *  `@shared/verticalDramaSeries/textOverlay.ts`; the caller performs this
   *  mapping since it owns the plan's own `kind`/`styleVariant` fields). */
  kind: Extract<VdTextOverlayAssKind, "time_setting" | "narrative_hook">;
  text: string;
  shotNumber: number;
  offsetSec?: number;
  durationSec: number;
  /** Optional 3x3 screen anchor — see `VdEpisodeTextOverlayAnchorInput`. */
  position?: VdWatermarkPosition;
}

/**
 * Build the render engine's Text Overlay Suite feed (task #34,
 * `RunAssemblyJobSubtitlesInput["overlays"]`) from an episode's ALREADY-
 * DERIVED text values (the caller — `verticalDramaTextOverlayResolution.ts`
 * plus the episode/series routers — resolves manual-vs-auto priority,
 * cliffhanger/memory-bundle lookups, and character-intro roster joins BEFORE
 * calling this; this function is pure/DB-free, mirroring
 * `resolveEpisodeDialogueAudioAndSubtitlesRunInputs`'s own "everything
 * pre-resolved in" contract). A field being `null`/`undefined`/omitted means
 * "this kind is disabled for this render" — the caller is responsible for
 * that decision (flag gate + per-kind `enabled` + any render-time opt-out).
 */
export interface VdEpisodeTextOverlayRunInputsParams {
  endCard?: {
    text: string;
    durationSec: number;
    showFollowLine: boolean;
    styleVariant: "center_card" | "lower_band";
  } | null;
  openerRecap?: { text: string; durationSec: number } | null;
  titleBumper?: { primary: string; secondary: string } | null;
  episodeIndicator?: { label: string; position: "top_left" | "top_right" } | null;
  characterIntroCards?: VdEpisodeTextOverlayCharacterIntroInput[];
  cards?: VdEpisodeTextOverlayCardInput[];
  /** One entry per enabled TEXT watermark slot (dual watermark,
   *  `planning/vd-dual-watermark/plan.md`) — replaces the old singular
   *  `watermarkText` param; each entry becomes its own `watermark_text`
   *  overlay event, so a series can burn in a text-type primary AND a
   *  text-type secondary watermark simultaneously. */
  watermarkTexts?: Array<{
    text: string;
    position: VdWatermarkPosition;
    opacity: number;
    marginPx: number;
  }>;
  motionClips: VdDialogueTimelineClip[];
  includedClipNumbers: number[];
}

export interface VdEpisodeTextOverlayRunInputsResult {
  overlays: RunAssemblyJobTextOverlayEventInput[];
  overlayCount: number;
}

export function resolveEpisodeTextOverlayRunInputs(
  params: VdEpisodeTextOverlayRunInputsParams
): VdEpisodeTextOverlayRunInputsResult {
  const overlays: RunAssemblyJobTextOverlayEventInput[] = [];

  if (params.endCard?.text?.trim()) {
    overlays.push({
      kind: "end_card",
      text: params.endCard.text,
      secondaryText: params.endCard.showFollowLine
        ? VD_END_CARD_FOLLOW_LINE_TH
        : undefined,
      variant: params.endCard.styleVariant,
      // Advisory-only — `runAssemblyJob` re-resolves to the real
      // [videoDurationSeconds - durationSec, videoDurationSeconds] window
      // post-probe (see `RunAssemblyJobTextOverlayEventInput.endAnchored`).
      startSec: 0,
      endSec: params.endCard.durationSec,
      endAnchored: true,
      durationSecForEndAnchor: params.endCard.durationSec,
    });
  }

  // Opening sequence auto-queue (plan.md "opener+titleBumper ซ้อนต้นคลิป →
  // จัดคิวต่อกันอัตโนมัติ") — both are START-anchored, fully resolvable
  // without a duration probe.
  const opening = resolveOpeningSequenceWindows({
    titleBumper: params.titleBumper ? { enabled: true } : undefined,
    openerRecap: params.openerRecap
      ? { enabled: true, durationSec: params.openerRecap.durationSec }
      : undefined,
  });
  if (params.titleBumper && opening.titleBumper) {
    overlays.push({
      kind: "title_bumper",
      text: params.titleBumper.primary,
      secondaryText: params.titleBumper.secondary,
      startSec: opening.titleBumper.startSec,
      endSec: opening.titleBumper.endSec,
    });
  }
  if (params.openerRecap?.text?.trim() && opening.openerRecap) {
    overlays.push({
      kind: "opener_recap",
      text: VD_OPENER_RECAP_HEADER_TH,
      secondaryText: params.openerRecap.text,
      startSec: opening.openerRecap.startSec,
      endSec: opening.openerRecap.endSec,
    });
  }

  if (params.episodeIndicator) {
    overlays.push({
      kind: "episode_indicator",
      text: params.episodeIndicator.label,
      variant: params.episodeIndicator.position,
      // Advisory-only — re-resolved to [0, videoDurationSeconds] post-probe.
      startSec: 0,
      endSec: 0,
      entireClip: true,
    });
  }

  for (const watermarkText of params.watermarkTexts ?? []) {
    if (!watermarkText.text?.trim()) continue;
    overlays.push({
      kind: "watermark_text",
      text: watermarkText.text,
      variant: watermarkText.position,
      opacity: watermarkText.opacity,
      marginPx: watermarkText.marginPx,
      // Advisory-only — re-resolved to [0, videoDurationSeconds] post-probe.
      startSec: 0,
      endSec: 0,
      entireClip: true,
    });
  }

  const anchoredInputs: VdEpisodeTextOverlayAnchorInput[] = [
    ...(params.characterIntroCards ?? []).map(
      (card): VdEpisodeTextOverlayAnchorInput => ({
        id: `character_intro:${card.characterKey}`,
        kind: "character_intro",
        text: card.name,
        secondaryText: card.role,
        shotNumber: card.shotNumber,
        offsetSec: 0,
        durationSec: VD_CHARACTER_INTRO_DURATION_SECONDS,
      })
    ),
    ...(params.cards ?? []).map(
      (card): VdEpisodeTextOverlayAnchorInput => ({
        id: card.id,
        kind: card.kind,
        text: card.text,
        shotNumber: card.shotNumber,
        offsetSec: card.offsetSec,
        durationSec: card.durationSec,
        position: card.position,
      })
    ),
  ];
  overlays.push(
    ...resolveEpisodeTextOverlayAnchoredEvents(
      anchoredInputs,
      params.motionClips,
      params.includedClipNumbers
    )
  );

  return { overlays, overlayCount: overlays.length };
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
  /** Task #34 — additive; `verticalDramaSeries.ts`'s `assembleSeasonVideos`
   *  populates this per-episode from the SAME series watermark config
   *  (batch-level "ใส่ลายน้ำ" toggle). Dual watermark: up to 2 entries. */
  watermarkImages?: RunAssemblyJobWatermarkImageInput[];
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
          watermarkImages: spec.watermarkImages,
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
    .sort(compareClipSourceOrder)
    .map(c => ({
      clipNumber: c.clipNumber,
      videoUrl: normalizeVerticalDramaStoredAssetUrl(c.videoTask?.videoUrl),
      parentShotNumber: c.parentShotNumber,
      subShotNumber: c.subShotNumber,
      sourceShotNumbers: c.sourceShotNumbers,
    }));
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
