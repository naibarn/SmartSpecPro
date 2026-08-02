/**
 * Staged Marketplace Auto Review — final render via the Remotion render
 * queue (`planning/marketplace-staged-remotion-final-render/plan.md`).
 *
 * Replaces the legacy Python `ensureRender` path for `staged_two_skill_v2`
 * runs with `outputMode === "full_video"`: builds a
 * `RemotionRenderVideoWorkerInput` (one full-frame 9:16 video layer per
 * approved shot clip, cumulative `startFrame` from REAL ffprobe'd
 * durations, optional burned-in subtitles derived verbatim from the
 * approved dialogue) and enqueues it via the existing
 * `queueRemotionRenderVideoJob`.
 *
 * Lane A in-process dispatch (`dispatchLaneARemotionRenderJob`) is
 * DELIBERATELY NOT fired here (`planning/worker-app-remotion-render-video/plan.md`
 * §P3, user policy 2026-07-30: Remotion/Chromium must never render inside
 * `smartspec-web`'s cgroup — guaranteed OOM). The queued job sits in
 * `workerJobs` awaiting a Lane B (worker-app) claim; the caller
 * (`reconcileStagedRemotionFinalRender`) falls back to the legacy renderer
 * on a queued-TTL timeout.
 *
 * Every text value burned into the video (subtitle text, dialogue) is a
 * FACT already approved by a human checkpoint upstream — this module never
 * calls an LLM and never rewrites/paraphrases anything (skill-first rule,
 * `memory/feedback_skill_first_authoring.md`: TS computes facts only).
 */
import { createHash } from "crypto";
import { mkdtempSync } from "fs";
import fsp from "fs/promises";
import os from "os";
import path from "path";

import {
  downloadClipToFile,
  inferDownloadExtension,
  probeDurationSeconds,
} from "./verticalDramaEpisodeVideoAssembly";
import { fallbackAssetSourceHash } from "./videoProjectAssetResolver";
import {
  queueRemotionRenderVideoJob,
  type QueueRemotionRenderVideoJobInput,
} from "./workerSchedulerService";
import {
  REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION,
  REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION,
  type RemotionRenderVideoWorkerInput,
} from "../../shared/workerRuntime";
import {
  RemotionTemplateConfigSchema,
  type RemotionLayer,
  type RemotionTemplateConfig,
} from "../../shared/remotion/layerTemplateSchemas";
import type { HyperframesFinalCompositeSubtitlePresetSchema } from "../../shared/hyperframes/runtimeApiSchemas";
import { z } from "zod";

export class StagedRemotionRenderError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "StagedRemotionRenderError";
    this.code = code;
  }
}

/** Frozen `RemotionTemplateConfigSchema` cap (`shared/remotion/layerTemplateSchemas.ts`,
 *  `MAX_LAYERS`). Staged runs cap at 30 shots, so this is a defensive guard,
 *  not a real limit any staged run should ever hit (one video layer per
 *  clip + at most one audio layer). */
const MAX_STAGED_REMOTION_LAYERS = 40;

const MIN_CUE_DURATION_SEC = 0.6;
const MAX_CUE_DURATION_SEC = 3.8;
const DEFAULT_MAX_SUBTITLE_CHARS = 48;

export type StagedSubtitlePresetId = z.infer<
  typeof HyperframesFinalCompositeSubtitlePresetSchema
>;

/* -------------------------------------------------------------------------- */
/* Caption chunking (adapted from shared/hyperframes/subtitleCues.ts)         */
/* -------------------------------------------------------------------------- */

function cleanCueText(value: unknown): string {
  return String(value ?? "")
    .replace(/\[[^\]]*(?:music|เสียง|silence|blank|noise)[^\]]*\]/gi, " ")
    .replace(/[♪♫]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function roundCueSecond(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Splits a single line of dialogue text into readable, chunked subtitle
 *  segments (max ~48 chars each) — same sentence-first, then word-wrap,
 *  then hard-char-wrap fallback strategy as
 *  `splitSubtitleTextIntoReadableChunks` in `subtitleCues.ts` (not exported
 *  there, so mirrored here rather than imported). */
function splitIntoReadableChunks(
  text: string,
  maxChars = DEFAULT_MAX_SUBTITLE_CHARS,
): string[] {
  const clean = cleanCueText(text);
  if (!clean) return [];

  const sentenceParts = clean
    .split(/(?<=[.!?。！？])\s+|\s*[|/]\s*/g)
    .map(part => cleanCueText(part))
    .filter(Boolean);
  const sourceParts = sentenceParts.length > 0 ? sentenceParts : [clean];
  const chunks: string[] = [];

  for (const part of sourceParts) {
    if (Array.from(part).length <= maxChars) {
      chunks.push(part);
      continue;
    }
    const words = part.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      let current = "";
      for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (Array.from(next).length > maxChars && current) {
          chunks.push(current);
          current = word;
        } else {
          current = next;
        }
      }
      if (current) chunks.push(current);
      continue;
    }
    const chars = Array.from(part);
    for (let index = 0; index < chars.length; index += maxChars) {
      chunks.push(chars.slice(index, index + maxChars).join(""));
    }
  }

  return chunks.map(chunk => cleanCueText(chunk)).filter(Boolean);
}

export interface StagedCaptionShotInput {
  shotId: number;
  /** Approved dialogue text, verbatim. Already speaker-prefixed
   *  (`"Name: line"`, newline-separated) for two-person shots when sourced
   *  from `plan.shots[].dialogue` / `finalAssembly.shots[].dialogue`. */
  dialogue: string;
  /** Optional explicit turn breakdown — when present, takes priority over
   *  splitting `dialogue` on newlines (each turn becomes its own
   *  `"speakerName: line"` segment, chunked independently). */
  dialogueTurns?: { speakerName: string; line: string }[];
}

export interface StagedCaptionLine {
  startSec: number;
  endSec: number;
  text: string;
}

/**
 * Converts each shot's approved dialogue into absolute-timeline caption
 * cues, offset by the REAL (ffprobe'd) cumulative clip durations — never
 * scene-relative. Pure and deterministic: same input always produces the
 * same output. Text is the approved dialogue verbatim (facts) — no
 * rewriting, no LLM call.
 */
export function buildStagedCaptionLines(input: {
  shots: StagedCaptionShotInput[];
  clipDurationsSec: number[];
}): StagedCaptionLine[] {
  const lines: StagedCaptionLine[] = [];
  const count = Math.min(input.shots.length, input.clipDurationsSec.length);
  let shotStart = 0;

  for (let shotIndex = 0; shotIndex < count; shotIndex++) {
    const shot = input.shots[shotIndex];
    const durationSec = Math.max(0.1, input.clipDurationsSec[shotIndex]);
    const shotEnd = shotStart + durationSec;

    const segments: string[] =
      shot.dialogueTurns && shot.dialogueTurns.length > 0
        ? shot.dialogueTurns.map(turn => `${turn.speakerName}: ${turn.line}`)
        : String(shot.dialogue ?? "")
            .split(/\n+/)
            .map(part => part.trim())
            .filter(Boolean);
    const nonEmptySegments = segments.length > 0 ? segments : [shot.dialogue ?? ""];

    const chunkedBySegment = nonEmptySegments.map(segment =>
      splitIntoReadableChunks(segment),
    );
    const segmentCharWeights = chunkedBySegment.map(chunks =>
      chunks.reduce((sum, chunk) => sum + Math.max(1, Array.from(chunk).length), 0),
    );
    const totalChars = segmentCharWeights.reduce((sum, weight) => sum + weight, 0) || 1;

    let segmentCursor = shotStart;
    for (let segmentIndex = 0; segmentIndex < chunkedBySegment.length; segmentIndex++) {
      const chunks = chunkedBySegment[segmentIndex];
      if (chunks.length === 0) continue;
      const isLastSegment = segmentIndex === chunkedBySegment.length - 1;
      const segmentDuration = durationSec * (segmentCharWeights[segmentIndex] / totalChars);
      const segmentEnd = isLastSegment
        ? shotEnd
        : Math.min(shotEnd, segmentCursor + segmentDuration);

      const chunkTotalChars = chunks.reduce(
        (sum, chunk) => sum + Math.max(1, Array.from(chunk).length),
        0,
      );
      let chunkCursor = segmentCursor;
      chunks.forEach((chunk, chunkIndex) => {
        const isLastChunk = chunkIndex === chunks.length - 1;
        const weight = Math.max(1, Array.from(chunk).length) / chunkTotalChars;
        const proposedDuration = isLastChunk
          ? segmentEnd - chunkCursor
          : (segmentEnd - segmentCursor) * weight;
        const chunkDuration = Math.min(
          MAX_CUE_DURATION_SEC,
          Math.max(MIN_CUE_DURATION_SEC, proposedDuration),
        );
        const start = roundCueSecond(chunkCursor);
        const end = roundCueSecond(
          Math.min(shotEnd, isLastChunk ? segmentEnd : chunkCursor + chunkDuration),
        );
        if (end > start) {
          lines.push({ startSec: start, endSec: Math.min(end, shotEnd), text: chunk });
        }
        chunkCursor = Math.max(chunkCursor, end);
      });
      segmentCursor = Math.max(segmentCursor, segmentEnd);
    }

    shotStart = shotEnd;
  }

  // Defensive non-overlap pass — clamps any cue that starts before the
  // previous cue ended (should not normally trigger given the per-shot
  // cursor math above, but guarantees the invariant regardless).
  for (let index = 1; index < lines.length; index++) {
    if (lines[index].startSec < lines[index - 1].endSec) {
      lines[index].startSec = lines[index - 1].endSec;
    }
    if (lines[index].endSec <= lines[index].startSec) {
      lines[index].endSec = roundCueSecond(lines[index].startSec + MIN_CUE_DURATION_SEC);
    }
  }

  return lines.filter(line => line.endSec > line.startSec);
}

/**
 * User-configurable settings for the Remotion final render.
 *
 * Deliberately stored on `stagedPipeline.finalRenderSettings` — OUTSIDE the
 * `finalAssembly` object — because `finalAssembly` is covered by
 * `buildStagedFinalAssemblyHash` and its checkpoint is auto-approved and then
 * CONSUMED by the advance pass. Once consumed the checkpoint is no longer
 * editable, so folding render settings into it would make them uneditable
 * exactly when the user wants to adjust them (after every clip is done, right
 * before pressing render). Keeping them separate also means changing a
 * subtitle preset can never invalidate an approved assembly hash.
 */
/**
 * The nine screen anchors an overlay can be pinned to. Shared by text and
 * image so the picker reads the same for both.
 */
export const STAGED_OVERLAY_ANCHORS = [
  "top_left",
  "top_center",
  "top_right",
  "middle_left",
  "middle_center",
  "middle_right",
  "bottom_left",
  "bottom_center",
  "bottom_right",
] as const;

export type StagedOverlayAnchor = (typeof STAGED_OVERLAY_ANCHORS)[number];

/**
 * Text overlays originally only offered `top`/`center`/`bottom`. Runs saved
 * under that vocabulary must keep rendering in the same place, so map the old
 * three onto their full-width equivalents instead of silently falling back to
 * the default anchor.
 */
export function normalizeStagedOverlayAnchor(
  value: unknown,
  fallback: StagedOverlayAnchor
): StagedOverlayAnchor {
  const raw = typeof value === "string" ? value.trim() : "";
  if ((STAGED_OVERLAY_ANCHORS as readonly string[]).includes(raw)) {
    return raw as StagedOverlayAnchor;
  }
  if (raw === "top") return "top_center";
  if (raw === "center") return "middle_center";
  if (raw === "bottom") return "bottom_center";
  return fallback;
}

export interface StagedFinalRenderSettings {
  subtitlePresetId: string;
  /**
   * Burn the "this was made with AI" disclosure into the video.
   *
   * DEFAULT OFF, deliberately. `visualWarningPlan.required` is set by
   * `resolvedAudioStrategy === "native_video_audio"` alone — the ad-policy
   * rule pack itself reports `categoryRisk: "low"` with an EMPTY
   * `requiredWarningRefs`, so this is a self-imposed disclosure, not a legal
   * or platform mandate. TikTok/Reels already carry their own AI labels, and
   * a burned-in caption can never be removed from the master afterwards, so
   * the choice belongs to the user rather than to a hardcoded default.
   */
  aiDisclosureEnabled: boolean;
  overlayText: {
    content: string;
    position: StagedOverlayAnchor;
    fontSizePx: number;
    color: string;
    fontWeight: "normal" | "bold";
    opacity: number;
  } | null;
  overlayImage: {
    url: string;
    position: StagedOverlayAnchor;
    widthPercent: number;
    opacity: number;
    /** `contain` letterboxes inside the box (never crops — right for logos);
     *  `cover` fills the box and crops the overflow (right for badges/frames). */
    fit: "contain" | "cover";
  } | null;
}

export const STAGED_FINAL_RENDER_SETTINGS_DEFAULTS: StagedFinalRenderSettings = {
  subtitlePresetId: "classic_box",
  aiDisclosureEnabled: false,
  overlayText: null,
  overlayImage: null,
};

export function readStagedFinalRenderSettings(
  metadata: unknown
): StagedFinalRenderSettings {
  const stored = (metadata as any)?.stagedPipeline?.finalRenderSettings;
  if (!stored || typeof stored !== "object") {
    // Pre-existing runs (and runs that never opened the render panel) fall
    // back to whatever `finalAssembly.subtitlePresetId` already held, so this
    // is additive rather than a behavior change for them.
    const legacyPreset = (metadata as any)?.stagedPipeline?.finalAssembly
      ?.subtitlePresetId;
    return {
      ...STAGED_FINAL_RENDER_SETTINGS_DEFAULTS,
      subtitlePresetId:
        typeof legacyPreset === "string" && legacyPreset
          ? legacyPreset
          : STAGED_FINAL_RENDER_SETTINGS_DEFAULTS.subtitlePresetId,
    };
  }
  return {
    subtitlePresetId:
      typeof stored.subtitlePresetId === "string" && stored.subtitlePresetId
        ? stored.subtitlePresetId
        : STAGED_FINAL_RENDER_SETTINGS_DEFAULTS.subtitlePresetId,
    aiDisclosureEnabled: stored.aiDisclosureEnabled === true,
    overlayText:
      stored.overlayText && typeof stored.overlayText.content === "string"
        ? {
            content: stored.overlayText.content,
            position: normalizeStagedOverlayAnchor(
              stored.overlayText.position,
              "top_center"
            ),
            fontSizePx: Number(stored.overlayText.fontSizePx) || 56,
            color:
              typeof stored.overlayText.color === "string" &&
              stored.overlayText.color.trim()
                ? stored.overlayText.color
                : "#ffffff",
            fontWeight:
              stored.overlayText.fontWeight === "normal" ? "normal" : "bold",
            opacity: Number.isFinite(Number(stored.overlayText.opacity))
              ? Number(stored.overlayText.opacity)
              : 1,
          }
        : null,
    overlayImage:
      stored.overlayImage && typeof stored.overlayImage.url === "string"
        ? {
            url: stored.overlayImage.url,
            position: normalizeStagedOverlayAnchor(
              stored.overlayImage.position,
              "bottom_right"
            ),
            widthPercent: Number(stored.overlayImage.widthPercent) || 22,
            opacity: Number.isFinite(Number(stored.overlayImage.opacity))
              ? Number(stored.overlayImage.opacity)
              : 1,
            fit: stored.overlayImage.fit === "cover" ? "cover" : "contain",
          }
        : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Remotion template assembly                                                 */
/* -------------------------------------------------------------------------- */

export interface StagedRemotionClipInput {
  url: string;
  durationSec: number;
}

/**
 * User-configured overlays burned into the composition by Remotion itself
 * (as real layers), NOT by the `ass_burn` subtitle post-pass — subtitles stay
 * on their own `captionLines` + `captionPresetId` path so the two features
 * can be enabled independently.
 */
export interface StagedRemotionOverlayTextInput {
  content: string;
  position?: StagedOverlayAnchor | "top" | "center" | "bottom";
  fontSizePx?: number;
  color?: string;
  fontWeight?: "normal" | "bold";
  opacity?: number;
}

export interface StagedRemotionOverlayImageInput {
  url: string;
  position?: StagedOverlayAnchor | string;
  /** Width as a percentage of the composition width. */
  widthPercent?: number;
  opacity?: number;
  fit?: "contain" | "cover";
}

/** Safe-area inset (percent) so an overlay never touches the frame edge. */
const STAGED_OVERLAY_MARGIN_PERCENT = 4;
/** Height of the band a text overlay occupies, as a percent of frame height. */
const STAGED_OVERLAY_TEXT_BAND_HEIGHT_PERCENT = 14;
/** Width of the band a text overlay occupies when pinned left or right; a
 *  horizontally-centred text overlay spans the full safe area instead. */
const STAGED_OVERLAY_TEXT_SIDE_WIDTH_PERCENT = 46;

function stagedAnchorRow(
  anchor: StagedOverlayAnchor
): "top" | "middle" | "bottom" {
  if (anchor.startsWith("top")) return "top";
  if (anchor.startsWith("bottom")) return "bottom";
  return "middle";
}

function stagedAnchorColumn(
  anchor: StagedOverlayAnchor
): "left" | "center" | "right" {
  if (anchor.endsWith("left")) return "left";
  if (anchor.endsWith("right")) return "right";
  return "center";
}

/** Places a `widthPercent` x `heightPercent` box at `anchor`, inset by the
 *  safe-area margin. Pure geometry — identical maths for text and image. */
function stagedOverlayBox(
  anchor: StagedOverlayAnchor,
  widthPercent: number,
  heightPercent: number
): { x: number; y: number } {
  const margin = STAGED_OVERLAY_MARGIN_PERCENT;
  const column = stagedAnchorColumn(anchor);
  const row = stagedAnchorRow(anchor);
  const x =
    column === "left"
      ? margin
      : column === "right"
        ? 100 - widthPercent - margin
        : (100 - widthPercent) / 2;
  const y =
    row === "top"
      ? margin
      : row === "bottom"
        ? 100 - heightPercent - margin
        : (100 - heightPercent) / 2;
  return { x: Math.max(0, x), y: Math.max(0, y) };
}

export function buildStagedRemotionTemplate(input: {
  clips: StagedRemotionClipInput[];
  width?: number;
  height?: number;
  fps?: number;
  templateId?: string;
  /** Optional single full-timeline audio track (e.g. the staged pipeline's
   *  separate TTS voiceover artifact) — omitted entirely for
   *  `native_video_audio` runs, where every clip carries its own audio. */
  audio?: { url: string } | null;
  overlayText?: StagedRemotionOverlayTextInput | null;
  overlayImage?: StagedRemotionOverlayImageInput | null;
  /** Verbatim `visualWarningPlan.exactText`; pinned to the bottom safe area
   *  for the whole timeline (the plan's `minDurationSeconds` floor is a
   *  minimum, and a persistent disclosure trivially satisfies it). */
  aiDisclosureText?: string | null;
}): { template: RemotionTemplateConfig; durationInFrames: number } {
  const width = input.width ?? 1080;
  const height = input.height ?? 1920;
  const fps = input.fps ?? 30;
  const overlayText =
    input.overlayText && input.overlayText.content.trim()
      ? input.overlayText
      : null;
  const overlayImage =
    input.overlayImage && input.overlayImage.url.trim() ? input.overlayImage : null;
  // Overlays are real layers, so they consume the SAME budget the audio track
  // already reserves from. Counting them here (rather than after the clip
  // loop) keeps the error message accurate and stops a 9-clip run from
  // failing later inside `RemotionTemplateConfigSchema.parse` with a much
  // less actionable message.
  const aiDisclosureText =
    typeof input.aiDisclosureText === "string" && input.aiDisclosureText.trim()
      ? input.aiDisclosureText.trim()
      : null;
  const reservedLayers =
    (input.audio ? 1 : 0) +
    (overlayText ? 1 : 0) +
    (overlayImage ? 1 : 0) +
    (aiDisclosureText ? 1 : 0);
  const layerBudget = MAX_STAGED_REMOTION_LAYERS - reservedLayers;
  if (input.clips.length > layerBudget) {
    throw new StagedRemotionRenderError(
      "too_many_clips",
      `Staged final render has ${input.clips.length} clips, exceeding the ${layerBudget}-layer budget ` +
        `(RemotionTemplateConfigSchema caps layers at ${MAX_STAGED_REMOTION_LAYERS}${reservedLayers > 0 ? `, minus ${reservedLayers} reserved for audio/overlay layers` : ""})`,
    );
  }

  const layers: RemotionLayer[] = [];
  let cursorFrame = 0;
  for (const clip of input.clips) {
    const durationFrames = Math.max(1, Math.round(clip.durationSec * fps));
    layers.push({
      id: `clip-${layers.length + 1}`,
      type: "video",
      startFrame: cursorFrame,
      durationFrames,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 0,
      src: clip.url,
      trimStartSec: 0,
      volume: 1,
      muted: false,
    });
    cursorFrame += durationFrames;
  }
  const durationInFrames = Math.max(1, cursorFrame);

  if (input.audio) {
    layers.push({
      id: "audio-track",
      type: "audio",
      startFrame: 0,
      durationFrames: durationInFrames,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 0,
      src: input.audio.url,
      trimStartSec: 0,
      volume: 1,
      loop: false,
      fadeInMs: 0,
      fadeOutMs: 0,
    });
  }

  // Overlays sit above every clip for the whole timeline. zIndex 10/11 keeps
  // them clear of the clip layers (all zIndex 0) without depending on array
  // order, and the image goes on top of the text so a logo/badge is never
  // hidden behind a long caption line.
  if (overlayImage) {
    const anchor = normalizeStagedOverlayAnchor(
      overlayImage.position,
      "bottom_right"
    );
    const boxWidth = Math.min(60, Math.max(5, overlayImage.widthPercent ?? 22));
    // Percent units are relative to DIFFERENT axes, so a box that should read
    // as square needs the width:height ratio applied — on a 1080x1920 canvas
    // a 22%-wide box is 22% of 1080px, which is only ~12.4% of 1920px tall.
    const boxHeight = boxWidth * (width / height);
    const box = stagedOverlayBox(anchor, boxWidth, boxHeight);
    layers.push({
      id: "overlay-image",
      type: "image",
      startFrame: 0,
      durationFrames: durationInFrames,
      x: box.x,
      y: box.y,
      width: boxWidth,
      height: boxHeight,
      rotationDeg: 0,
      opacity: Math.min(1, Math.max(0.05, overlayImage.opacity ?? 1)),
      zIndex: 11,
      src: overlayImage.url,
      fit: overlayImage.fit === "cover" ? "cover" : "contain",
    });
  }

  if (overlayText) {
    const anchor = normalizeStagedOverlayAnchor(
      overlayText.position,
      "top_center"
    );
    const column = stagedAnchorColumn(anchor);
    // A left/right-pinned caption gets a half-width band so it actually sits
    // on that side; a centred one spans the full safe area.
    const boxWidth =
      column === "center"
        ? 100 - STAGED_OVERLAY_MARGIN_PERCENT * 2
        : STAGED_OVERLAY_TEXT_SIDE_WIDTH_PERCENT;
    const box = stagedOverlayBox(
      anchor,
      boxWidth,
      STAGED_OVERLAY_TEXT_BAND_HEIGHT_PERCENT
    );
    layers.push({
      id: "overlay-text",
      type: "text",
      startFrame: 0,
      durationFrames: durationInFrames,
      x: box.x,
      y: box.y,
      width: boxWidth,
      height: STAGED_OVERLAY_TEXT_BAND_HEIGHT_PERCENT,
      rotationDeg: 0,
      opacity: Math.min(1, Math.max(0.05, overlayText.opacity ?? 1)),
      zIndex: 10,
      content: overlayText.content.trim().slice(0, 2000),
      fontFamily: "Inter",
      fontSizePx: Math.min(200, Math.max(12, overlayText.fontSizePx ?? 56)),
      color: overlayText.color?.trim() || "#ffffff",
      // Text hugs the side it is pinned to; centred anchors stay centred.
      textAlign: column === "center" ? "center" : column,
      fontWeight: overlayText.fontWeight ?? "bold",
    });
  }

  // Compliance disclosure. Pinned bottom-centre in the safe area, above every
  // other layer (zIndex 12) so a user overlay can never cover it, and sized
  // conservatively so it stays legible without dominating the frame.
  if (aiDisclosureText) {
    const disclosureBand = 8;
    const disclosureWidth = 100 - STAGED_OVERLAY_MARGIN_PERCENT * 2;
    const box = stagedOverlayBox("bottom_center", disclosureWidth, disclosureBand);
    layers.push({
      id: "ai-disclosure",
      type: "text",
      startFrame: 0,
      durationFrames: durationInFrames,
      x: box.x,
      y: box.y,
      width: disclosureWidth,
      height: disclosureBand,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 12,
      content: aiDisclosureText.slice(0, 2000),
      fontFamily: "Inter",
      fontSizePx: 34,
      color: "#ffffff",
      textAlign: "center",
      fontWeight: "bold",
    });
  }

  const template = RemotionTemplateConfigSchema.parse({
    id: input.templateId ?? "staged-marketplace-final-render",
    name: "Staged Marketplace Auto Review — Final Render",
    width,
    height,
    fps,
    durationInFrames,
    layers,
  });

  return { template, durationInFrames };
}

/* -------------------------------------------------------------------------- */
/* Clip staging (download + ffprobe, mirrors verticalDramaEpisodeVideoAssembly) */
/* -------------------------------------------------------------------------- */

export interface StagedClipProbeResult {
  durationSec: number;
  sha256: string;
}

async function defaultStageClip(
  url: string,
  fallbackDurationSeconds: number | undefined,
  publicUrl: string | null | undefined,
): Promise<StagedClipProbeResult> {
  const workspace = mkdtempSync(path.join(os.tmpdir(), "smartspec-staged-remotion-"));
  try {
    const dest = path.join(workspace, `clip${inferDownloadExtension(url, ".mp4")}`);
    try {
      await downloadClipToFile(url, dest, publicUrl ?? "");
      const [durationSec, bytes] = await Promise.all([
        probeDurationSeconds(dest),
        fsp.readFile(dest),
      ]);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (durationSec && Number.isFinite(durationSec) && durationSec > 0) {
        return { durationSec, sha256 };
      }
      console.warn(
        `[marketplaceAutoReviewStagedRemotionRender] ffprobe returned no duration for ${url}; ` +
          "falling back to the shot's planned durationSeconds",
      );
      return {
        durationSec:
          fallbackDurationSeconds && fallbackDurationSeconds > 0 ? fallbackDurationSeconds : 5,
        sha256,
      };
    } catch (error) {
      console.warn(
        `[marketplaceAutoReviewStagedRemotionRender] failed to download/probe clip ${url}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        durationSec:
          fallbackDurationSeconds && fallbackDurationSeconds > 0 ? fallbackDurationSeconds : 5,
        sha256: fallbackAssetSourceHash(url),
      };
    }
  } finally {
    await fsp.rm(workspace, { recursive: true, force: true }).catch(() => undefined);
  }
}

export interface StagedAudioProbeResult {
  sha256: string;
}

/**
 * Stages the run's dialogue-audio mix the SAME way video clips are staged —
 * downloads it and hashes the real bytes — so the asset-manifest checksum
 * the worker's `defaultStageRemotionRenderVideoAssets` verifies matches
 * what it actually fetches. Unlike `defaultStageClip`, this THROWS on any
 * download failure (no silent `fallbackAssetSourceHash(url)` fallback) —
 * callers must treat a throw as "omit the audio layer", never as "ship a
 * manifest entry that will fail worker-side verification".
 */
async function defaultStageAudio(
  url: string,
  publicUrl: string | null | undefined,
): Promise<StagedAudioProbeResult> {
  const workspace = mkdtempSync(path.join(os.tmpdir(), "smartspec-staged-remotion-audio-"));
  try {
    const dest = path.join(workspace, `audio${inferDownloadExtension(url, ".mp3")}`);
    await downloadClipToFile(url, dest, publicUrl ?? "");
    const bytes = await fsp.readFile(dest);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    return { sha256 };
  } finally {
    await fsp.rm(workspace, { recursive: true, force: true }).catch(() => undefined);
  }
}

/* -------------------------------------------------------------------------- */
/* Orchestrator                                                               */
/* -------------------------------------------------------------------------- */

export interface StagedRemotionRenderShotInput {
  shotId: number;
  dialogue: string;
  dialogueTurns?: { speakerName: string; line: string }[];
  durationSeconds?: number;
}

export interface SubmitStagedRemotionFinalRenderInput {
  runId: string;
  tenantId: string;
  planRevision: number;
  requestedByUserId?: number | null;
  isAdminRequester?: boolean;
  /** Ordered 1:1 with `shots` (index `i` is shot `shots[i]`'s approved clip
   *  URL, or empty/undefined if missing). */
  videoClipUrls: (string | null | undefined)[];
  shots: StagedRemotionRenderShotInput[];
  includeAudio: boolean;
  audioUrl?: string | null;
  subtitlePresetId?: StagedSubtitlePresetId | string | null;
  /** User-configured burn-in overlays (see `buildStagedRemotionTemplate`). */
  overlayText?: StagedRemotionOverlayTextInput | null;
  overlayImage?: StagedRemotionOverlayImageInput | null;
  /** Exact disclosure text to burn in, or null to omit it entirely. Never
   *  paraphrased — `visualWarningPlan.exactText` is the compliance artefact. */
  aiDisclosureText?: string | null;
  publicUrl?: string | null;
}

export interface StagedRemotionRenderDeps {
  stageClip?: (
    url: string,
    fallbackDurationSeconds: number | undefined,
    publicUrl: string | null | undefined,
  ) => Promise<StagedClipProbeResult>;
  queueJob?: (
    input: QueueRemotionRenderVideoJobInput,
  ) => ReturnType<typeof queueRemotionRenderVideoJob>;
  stageAudio?: (
    url: string,
    publicUrl: string | null | undefined,
  ) => Promise<StagedAudioProbeResult>;
}

export interface SubmitStagedRemotionFinalRenderResult {
  jobId: string;
  created: boolean;
}

/**
 * Builds and enqueues the staged final-render `remotion_render_video`
 * worker job. Throws `StagedRemotionRenderError` (or any error the queue
 * helper throws, e.g. feature-flag-disabled) on any failure — callers MUST
 * treat every throw as "fall back to the legacy renderer", never as a
 * stuck run.
 */
export async function submitStagedRemotionFinalRender(
  input: SubmitStagedRemotionFinalRenderInput,
  deps: StagedRemotionRenderDeps = {},
): Promise<SubmitStagedRemotionFinalRenderResult> {
  const stageClip = deps.stageClip ?? defaultStageClip;
  const queueJob = deps.queueJob ?? queueRemotionRenderVideoJob;
  const stageAudio = deps.stageAudio ?? defaultStageAudio;

  const orderedClips = input.shots
    .map((shot, index) => ({
      shot,
      url: (input.videoClipUrls[index] ?? "").toString().trim(),
    }))
    .filter(item => item.url.length > 0);

  if (orderedClips.length === 0) {
    throw new StagedRemotionRenderError(
      "no_clips",
      "No approved video clip URLs available for the staged Remotion final render",
    );
  }

  const staged = await Promise.all(
    orderedClips.map(item => stageClip(item.url, item.shot.durationSeconds, input.publicUrl)),
  );

  const subtitlePresetId: StagedSubtitlePresetId =
    (input.subtitlePresetId as StagedSubtitlePresetId) || "classic_box";
  const captionsEnabled = subtitlePresetId !== "no_subtitle_style";

  // Stage the dialogue-audio mix the same way clips are staged (real
  // bytes-sha256, not `fallbackAssetSourceHash(url)`) — see
  // `defaultStageAudio`'s doc comment. On staging failure, the audio layer
  // is omitted entirely rather than shipping a manifest entry the worker's
  // checksum verification is guaranteed to reject.
  let audioSha256: string | null = null;
  if (input.includeAudio && input.audioUrl) {
    try {
      const stagedAudio = await stageAudio(input.audioUrl, input.publicUrl);
      audioSha256 = stagedAudio.sha256;
    } catch (error) {
      console.warn(
        `[marketplaceAutoReviewStagedRemotionRender] failed to stage audio ${input.audioUrl}; ` +
          `omitting audio layer: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  const audioIncluded = Boolean(input.includeAudio && input.audioUrl && audioSha256);

  const { template, durationInFrames } = buildStagedRemotionTemplate({
    clips: orderedClips.map((item, index) => ({
      url: item.url,
      durationSec: staged[index].durationSec,
    })),
    audio: audioIncluded ? { url: input.audioUrl! } : null,
    overlayText: input.overlayText ?? null,
    overlayImage: input.overlayImage ?? null,
    aiDisclosureText: input.aiDisclosureText ?? null,
  });

  const captionLines = captionsEnabled
    ? buildStagedCaptionLines({
        shots: orderedClips.map(item => ({
          shotId: item.shot.shotId,
          dialogue: item.shot.dialogue,
          dialogueTurns: item.shot.dialogueTurns,
        })),
        clipDurationsSec: staged.map(clip => clip.durationSec),
      })
    : undefined;

  const assetManifestSources = [
    ...orderedClips.map((item, index) => ({
      role: "video" as const,
      url: item.url,
      sha256: staged[index].sha256,
    })),
    ...(audioIncluded
      ? [
          {
            role: "audio" as const,
            url: input.audioUrl!,
            sha256: audioSha256!,
          },
        ]
      : []),
  ];

  const traceId = `staged-final-render:${input.runId}:r${input.planRevision}`;
  const videoProjectId = `mar-final:${input.runId}`;
  const remotionTemplateHash = createHash("sha256").update(JSON.stringify(template)).digest("hex");

  const workerInput: RemotionRenderVideoWorkerInput = {
    kind: "remotion_render_video",
    schemaVersion: 1,
    platformContractVersion: REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION,
    rendererPolicyVersion: REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION,
    videoProjectId,
    projectRevision: Math.max(1, input.planRevision),
    traceId,
    renderProfile: {
      profile: "final",
      width: template.width,
      height: template.height,
      fps: template.fps,
      codec: "h264",
      loudnessNormalize: true,
      burnInAssCaptions: captionsEnabled,
    },
    remotionTemplate: template,
    compositionId: "GenericTemplate",
    assetManifest: { sources: assetManifestSources },
    postPasses: captionsEnabled ? ["loudnorm", "ass_burn"] : ["loudnorm"],
    segmentPlan: null,
    remotionTemplateHash,
    durationInFrames,
    ...(captionLines && captionLines.length > 0
      ? { captionLines, captionPresetId: subtitlePresetId }
      : {}),
  };

  const { created, job } = await queueJob({
    ...workerInput,
    tenantId: input.tenantId,
    requestedByUserId: input.requestedByUserId ?? undefined,
    isAdminRequester: input.isAdminRequester ?? false,
  });

  // No Lane A in-process dispatch here (see this file's header doc comment)
  // — the job just sits `queued` in `workerJobs` for a Lane B worker-app to
  // claim. `reconcileStagedRemotionFinalRender` falls back to the legacy
  // renderer if it isn't claimed within the queued TTL.
  return { jobId: job.id, created };
}
