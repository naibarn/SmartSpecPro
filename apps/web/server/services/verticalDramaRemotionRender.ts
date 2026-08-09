/**
 * Vertical Drama Series — OPT-IN Remotion render path for the "วิดีโอรวม
 * Sub-episode" assembly button (`planning/vd-remotion-render-option/plan.md`,
 * wave 1).
 *
 * Adapter only: takes the EXACT SAME already-resolved `renderFeed` shape the
 * ffmpeg path (`runAssemblyJob` in `verticalDramaEpisodeVideoAssembly.ts`)
 * already consumes — clips, ad banners, dialogue audio, subtitles (captions
 * + Text Overlay Suite events), and the series watermark image — and
 * re-expresses it as a `RemotionRenderVideoWorkerInput` submitted through the
 * existing `remotion_render_video` worker queue (same pattern as
 * `marketplaceAutoReviewStagedRemotionRender.ts`: `queueRemotionRenderVideoJob`
 * only — see below).
 *
 * Every text/timing value burned into the video comes from the SAME config
 * the ffmpeg path already built (facts, human/tenant-configured) — this
 * module never calls an LLM and never invents/paraphrases copy (skill-first
 * rule, `memory/feedback_skill_first_authoring.md`).
 *
 * Default remains the ffmpeg path (`renderEngine` absent/"ffmpeg" is
 * byte-identical to today) — this module is ONLY reached when the caller
 * (`assembleEpisodeVideo` mutation) explicitly opts in with
 * `renderEngine: "remotion_queue"`, and the caller MUST treat any throw from
 * `submitVdRemotionAssembly` as "fall back to the ffmpeg path", never as a
 * stuck render.
 *
 * Lane A in-process dispatch (`dispatchLaneARemotionRenderJob`) is
 * DELIBERATELY NOT fired here (`planning/worker-app-remotion-render-video/plan.md`
 * §P3, user policy 2026-07-30: Remotion/Chromium must never render inside
 * `smartspec-web`'s cgroup — guaranteed OOM, see
 * `verticalDramaAssemblyCgroupThrottle` memory note). The queued job sits in
 * `workerJobs` awaiting a Lane B (worker-app) claim; `reconcileVdRemotionAssembly`
 * falls back on a queued-TTL timeout (no reconstructible `renderFeed` to
 * re-queue against ffmpeg, so the fallback marks `compiledVideo` failed with
 * a Thai message asking the user to re-run assembly without the Remotion
 * toggle — see that function's doc comment).
 */
import { createHash } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { verticalDramaEpisodes } from "../../drizzle/schema";
import {
  downloadClipToFile,
  inferDownloadExtension,
  probeDurationSeconds,
  persistCompiledVideoState,
  type AssembleEpisodeVideoOwner,
  type EpisodeClipSource,
  type RunAssemblyJobArgs,
  type RunAssemblyJobBannerInput,
  type RunAssemblyJobDialogueAudioInput,
  type RunAssemblyJobSubtitlesInput,
  type RunAssemblyJobTextOverlayEventInput,
  type RunAssemblyJobWatermarkImageInput,
} from "./verticalDramaEpisodeVideoAssembly";
import type { AssSubtitleLine } from "./verticalDramaFinalRenderGraph";
import { fallbackAssetSourceHash } from "./videoProjectAssetResolver";
import {
  queueRemotionRenderVideoJob,
  type QueueRemotionRenderVideoJobInput,
} from "./workerSchedulerService";
import {
  getAdBannerPlacementPreset,
  resolvePlacementBox,
} from "@shared/verticalDramaSeries/adBannerPresets";
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
import {
  workerArtifacts,
  workerJobs,
  type WorkerJob,
} from "../../drizzle/schema";
import type { HyperframesFinalCompositeSubtitlePresetSchema } from "@shared/hyperframes/runtimeApiSchemas";
import type { z } from "zod";

type VdRemotionCaptionPresetId = z.infer<
  typeof HyperframesFinalCompositeSubtitlePresetSchema
>;

export class VdRemotionRenderError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "VdRemotionRenderError";
    this.code = code;
  }
}

/** `RemotionTemplateConfigSchema`'s frozen `MAX_LAYERS` cap
 *  (`shared/remotion/layerTemplateSchemas.ts`). A typical fallback-profile
 *  sub-episode (9 clips) plus every overlay toggle can plausibly exceed
 *  this — see this module's own header + the plan's "40-layer math" note
 *  in the task report. */
const MAX_VD_REMOTION_LAYERS = 40;

/** Artifact type the render sidecar publishes the finished mp4 under
 *  (`packages/remotion-render/src/renderVideoJob.ts`). */
const REMOTION_RENDER_MP4_ARTIFACT_TYPE = "remotion_render_mp4";

const FRAME_WIDTH = 1080;
const FRAME_HEIGHT = 1920;
const DEFAULT_FPS = 30;

/* -------------------------------------------------------------------------- */
/* Caption lines (subtitle plan -> Remotion `captionLines`)                   */
/* -------------------------------------------------------------------------- */

export interface VdRemotionCaptionLine {
  startSec: number;
  endSec: number;
  text: string;
}

/**
 * Converts the VD subtitle plan's `AssSubtitleLine[]` (already an ABSOLUTE
 * render-timeline — see that type's own doc comment) into the Remotion
 * worker's `captionLines` shape verbatim. `line.speakerName` is intentionally
 * NOT rendered here: rendered captions show only the spoken dialogue text
 * (the speaker-name chip was a deliberate product feature that was removed —
 * see `buildAssDialogueEvent` in `verticalDramaFinalRenderGraph.ts` for the
 * ffmpeg/ASS side of the same removal, kept byte-consistent with this path).
 * `speakerName` still exists on the input line for non-rendering purposes
 * (TTS voice selection, narration detection) — do not reintroduce it here.
 */
export function buildVdCaptionLines(
  subtitles: RunAssemblyJobSubtitlesInput | null | undefined
): VdRemotionCaptionLine[] {
  if (!subtitles || subtitles.lines.length === 0) return [];
  return subtitles.lines
    .map(line => ({
      startSec: line.startSec,
      endSec: line.endSec,
      text: line.text.slice(0, 2000),
    }))
    .filter(line => line.text.trim().length > 0 && line.endSec > line.startSec);
}

/**
 * VD `CaptionPresetId` <-> Remotion `captionPresetId` mapping table.
 *
 * VD's own `subtitlePreset` mutation input already reuses
 * `HyperframesFinalCompositeSubtitlePresetSchema` verbatim (see
 * `verticalDramaFinalRenderGraph.ts`'s `CaptionPresetId` type + doc comment,
 * and `assembleEpisodeVideo`'s input union `[..., "none"]`), and the
 * Remotion worker's `captionPresetId` field reuses the SAME shared schema
 * (`shared/workerRuntime.ts`). There is therefore no real "preset A -> preset
 * B" table to build — this function is an IDENTITY map, documented here (not
 * skipped) because the plan explicitly asked for the mapping decision to be
 * recorded: `"none"` (VD mutation-input-only sentinel, never reaches
 * `RunAssemblyJobSubtitlesInput.preset`) and `"no_subtitle_style"` (the
 * shared schema's own "skip burn-in" sentinel) both mean "no captions" and
 * are mapped to `undefined` (omit `captionLines`/`captionPresetId`
 * entirely) — every other one of the 10 ids passes through unchanged.
 */
export function mapVdSubtitlePresetToRemotion(
  presetId: string | null | undefined
): VdRemotionCaptionPresetId | undefined {
  if (!presetId || presetId === "none" || presetId === "no_subtitle_style") {
    return undefined;
  }
  return presetId as VdRemotionCaptionPresetId;
}

/**
 * Re-times caption lines onto the REAL, ffprobe'd clip timeline.
 *
 * `AssSubtitleLine.startSec/endSec` are computed up front from the motion
 * pack's PLANNED per-clip durations, which are a target rather than a
 * measurement — episode 124 planned 9x8s = 72s while the delivered clips ran
 * 90.35s, so its captions would have ended ~18s before the picture and drifted
 * further with every clip.
 *
 * Placement rule (the only one that stays correct when clips differ in how
 * much they overran): a line in clip N starts at the sum of the REAL durations
 * of clips 1..N-1 — the same cumulative cursor `buildVdRemotionTemplate` uses
 * to lay out the video layers — plus its own fractional position inside clip
 * N, scaled to clip N's real length. Per-clip, so one clip running long never
 * shifts a later clip's captions by the wrong amount.
 *
 * A line without clip attribution (`clipNumber`/fractions absent — e.g. a
 * planned line whose clip could not be resolved, placed by the timing
 * resolver's sequential-estimate fallback) is passed through untouched.
 */
export function retimeSubtitleLinesToProbedClips(
  lines: AssSubtitleLine[],
  clips: Array<{ clipNumber: number; durationSec: number }>
): AssSubtitleLine[] {
  const realWindows = new Map<
    number,
    { offsetSec: number; durationSec: number }
  >();
  let cumulativeSec = 0;
  for (const clip of clips) {
    const durationSec = Math.max(0, clip.durationSec);
    realWindows.set(clip.clipNumber, { offsetSec: cumulativeSec, durationSec });
    cumulativeSec += durationSec;
  }

  return lines.map(line => {
    if (
      line.clipNumber == null ||
      line.clipLocalStartFrac == null ||
      line.clipLocalEndFrac == null
    ) {
      return line;
    }
    const window = realWindows.get(line.clipNumber);
    if (!window || window.durationSec <= 0) return line;

    const startSec =
      window.offsetSec + line.clipLocalStartFrac * window.durationSec;
    const endSec =
      window.offsetSec + line.clipLocalEndFrac * window.durationSec;
    // A degenerate window (both fractions equal) would produce a zero-length
    // caption that never paints — keep the original rather than emit one.
    if (!(endSec > startSec)) return line;
    return { ...line, startSec, endSec };
  });
}

/* -------------------------------------------------------------------------- */
/* Text overlay window resolution (mirrors `runAssemblyJob`'s own resolution) */
/* -------------------------------------------------------------------------- */

/**
 * Re-resolves `entireClip`/`endAnchored` advisory windows to the REAL
 * (ffprobe'd) total video duration — line-for-line the same resolution
 * `runAssemblyJob` performs in `verticalDramaEpisodeVideoAssembly.ts` (see
 * that function's own "Task #34 — re-resolve..." comment) — so both render
 * engines place these events identically regardless of which one a given
 * render used.
 */
export function resolveVdTextOverlayWindow(
  overlay: RunAssemblyJobTextOverlayEventInput,
  videoDurationSeconds: number
): { startSec: number; endSec: number } {
  if (overlay.entireClip) {
    return { startSec: 0, endSec: videoDurationSeconds };
  }
  if (overlay.endAnchored) {
    const dur =
      overlay.durationSecForEndAnchor ??
      Math.max(0.1, overlay.endSec - overlay.startSec);
    return {
      startSec: Math.max(0, videoDurationSeconds - dur),
      endSec: videoDurationSeconds,
    };
  }
  return { startSec: overlay.startSec, endSec: overlay.endSec };
}

/** Rough per-overlay-kind layout heuristic — VD's overlay kinds have no
 *  Remotion-native layout yet (they only ever had ASS style specs), so this
 *  is new LAYOUT only (never new copy/timing — those are threaded through
 *  verbatim from `overlay.text`/the resolved window above). Corner kinds
 *  (`episode_indicator`/`watermark_text`/`age_badge`) honor `overlay.variant`
 *  when it names a corner; everything else centers as a card. */
function layoutForOverlayKind(
  kind: RunAssemblyJobTextOverlayEventInput["kind"],
  variant: RunAssemblyJobTextOverlayEventInput["variant"]
): { x: number; y: number; width: number; height: number; fontSizePx: number } {
  const isCorner =
    variant === "top_left" ||
    variant === "top_right" ||
    variant === "bottom_left" ||
    variant === "bottom_right";
  if (
    isCorner ||
    kind === "episode_indicator" ||
    kind === "watermark_text" ||
    kind === "age_badge"
  ) {
    const corner = isCorner
      ? variant
      : kind === "age_badge"
        ? "top_right"
        : "top_left";
    const left = corner === "top_left" || corner === "bottom_left";
    const top = corner === "top_left" || corner === "top_right";
    return {
      x: left ? 4 : 60,
      y: top ? 3 : 90,
      width: 36,
      height: 6,
      fontSizePx: 32,
    };
  }
  if (kind === "character_intro") {
    return { x: 10, y: 78, width: 80, height: 10, fontSizePx: 44 };
  }
  if (kind === "end_card" && variant === "lower_band") {
    return { x: 8, y: 70, width: 84, height: 14, fontSizePx: 52 };
  }
  // Default: centered card (end_card/opener_recap/title_bumper/time_setting/narrative_hook).
  return { x: 8, y: 38, width: 84, height: 24, fontSizePx: 56 };
}

/* -------------------------------------------------------------------------- */
/* Template assembly                                                          */
/* -------------------------------------------------------------------------- */

export interface VdRemotionResolvedClip {
  clipNumber: number;
  url: string;
  durationSec: number;
}

export interface VdRemotionResolvedBanner extends RunAssemblyJobBannerInput {
  /** Downloaded/staged banner image URL passed through verbatim as the
   *  Remotion `image` layer `src` (already a fetchable absolute/public URL
   *  — see `submitVdRemotionAssembly`'s own resolution of `internalBaseUrl`
   *  vs. public URL, mirroring `RunAssemblyJobBannerInput.imageUrl`'s own
   *  doc comment). */
  resolvedImageUrl: string;
}

export interface BuildVdRemotionTemplateInput {
  clips: VdRemotionResolvedClip[];
  videoDurationSeconds: number;
  banners?: VdRemotionResolvedBanner[];
  overlays?: RunAssemblyJobTextOverlayEventInput[];
  dialogueAudio?:
    | (RunAssemblyJobDialogueAudioInput & { resolvedSegmentUrls: string[] })
    | null;
  /** Dual watermark (`planning/vd-dual-watermark/plan.md`): up to 2 entries,
   *  one per `VdSeriesWatermarkSlotId`, each becoming its own full-timeline
   *  image layer with a distinct id. */
  watermarkImages?: Array<
    RunAssemblyJobWatermarkImageInput & { resolvedImageUrl: string }
  >;
  width?: number;
  height?: number;
  fps?: number;
  templateId?: string;
  /** Optional teaser treatment. The existing full-episode render path leaves
   * this absent, so its layer/timing contract remains unchanged. */
  previewCard?: {
    label: string;
    coverImageUrl: string;
    introDurationSeconds?: number;
    endCardDurationSeconds?: number;
  };
}

export interface BuildVdRemotionTemplateResult {
  template: RemotionTemplateConfig;
  durationInFrames: number;
  layerCount: number;
}

/**
 * Builds the full-frame 9:16 Remotion template for a VD sub-episode: one
 * `video` layer per clip (real ffprobe'd durations via cumulative
 * `startFrame`), an `image` layer per ad banner (positioned via the SAME
 * `VD_AD_BANNER_PLACEMENT_PRESETS`/`resolvePlacementBox` the ffmpeg path
 * uses, `entire` banners re-resolved to `[0, videoDurationSeconds]` exactly
 * like `runAssemblyJob`), an `audio` layer per dialogue-audio segment, a
 * `text` layer per Text Overlay Suite event (outro/recap/title/sub-episode
 * number/character intro/mid-episode cards/age badge/watermark-text — every
 * `VdTextOverlayAssKind`), and an `image` layer for the series' IMAGE
 * watermark. Throws `VdRemotionRenderError("too_many_layers", ...)` when the
 * total exceeds `RemotionTemplateConfigSchema`'s 40-layer cap.
 */
export function buildVdRemotionTemplate(
  input: BuildVdRemotionTemplateInput
): BuildVdRemotionTemplateResult {
  const width = input.width ?? FRAME_WIDTH;
  const height = input.height ?? FRAME_HEIGHT;
  const fps = input.fps ?? DEFAULT_FPS;

  const layers: RemotionLayer[] = [];

  // 1) Video layers (real durations, cumulative startFrame).
  let cursorFrame = 0;
  for (const clip of input.clips) {
    const durationFrames = Math.max(1, Math.round(clip.durationSec * fps));
    layers.push({
      id: `clip-${clip.clipNumber}`,
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
  const videoOnlyDurationInFrames = Math.max(1, cursorFrame);
  const previewEndCardDurationFrames = input.previewCard
    ? Math.max(
        1,
        Math.round((input.previewCard.endCardDurationSeconds ?? 2.5) * fps)
      )
    : 0;
  const durationInFrames =
    videoOnlyDurationInFrames + previewEndCardDurationFrames;
  const totalDurationSeconds = input.previewCard
    ? input.videoDurationSeconds + previewEndCardDurationFrames / fps
    : input.videoDurationSeconds;

  // Preview label overlay — keep the episode number/title visible without
  // covering the actors or the shot composition. This is intentionally
  // separate from the episode's configurable text-overlay plan.
  if (input.previewCard) {
    layers.push({
      id: "preview-title-band",
      type: "motionGraphic",
      startFrame: 0,
      durationFrames: durationInFrames,
      x: 4,
      y: 2,
      width: 92,
      height: 7,
      rotationDeg: 0,
      opacity: 0.52,
      zIndex: 31,
      shape: "rect",
      color: "#020617",
      loopAnimation: "none",
    });
    layers.push({
      id: "preview-title",
      type: "text",
      startFrame: 0,
      durationFrames: durationInFrames,
      x: 6,
      y: 2,
      width: 88,
      height: 7,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 32,
      content: input.previewCard.label.slice(0, 160),
      fontFamily: "Noto Sans Thai",
      fontSizePx: 32,
      color: "#ffffff",
      textAlign: "left",
      fontWeight: "normal",
    });
    layers.push({
      id: "preview-end-card",
      type: "image",
      startFrame: videoOnlyDurationInFrames,
      durationFrames: previewEndCardDurationFrames,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 30,
      src: input.previewCard.coverImageUrl,
      fit: "cover",
    });
  }

  // 2) Ad banner image layers.
  for (const [index, banner] of (input.banners ?? []).entries()) {
    const preset = getAdBannerPlacementPreset(banner.placementId);
    const box = resolvePlacementBox(preset, banner.sideAlign);
    const window = banner.entire
      ? { startSec: 0, endSec: totalDurationSeconds }
      : { startSec: banner.startSec, endSec: banner.endSec };
    const startFrame = Math.max(0, Math.round(window.startSec * fps));
    const endFrame = Math.max(startFrame + 1, Math.round(window.endSec * fps));
    layers.push({
      id: `banner-${index}`,
      type: "image",
      startFrame,
      durationFrames: endFrame - startFrame,
      x: (box.x / FRAME_WIDTH) * 100,
      y: (box.y / FRAME_HEIGHT) * 100,
      width: (box.w / FRAME_WIDTH) * 100,
      height: (box.h / FRAME_HEIGHT) * 100,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 5,
      src: banner.resolvedImageUrl,
      fit: "cover",
    });
  }

  // 3) Dialogue-audio segment layers (one per segment — no cross-fade/mix
  //    machinery here, each segment is its own independent `audio` layer,
  //    same convention as `RunAssemblyJobDialogueAudioInput.segments`).
  if (input.dialogueAudio) {
    input.dialogueAudio.segments.forEach((segment, index) => {
      const startFrame = Math.max(0, Math.round(segment.startSec * fps));
      const remainingFrames = Math.max(1, durationInFrames - startFrame);
      const gainDb = segment.gainDb ?? 0;
      const volume = Math.min(1, Math.max(0, Math.pow(10, gainDb / 20)));
      layers.push({
        id: `dialogue-audio-${index}`,
        type: "audio",
        startFrame,
        durationFrames: remainingFrames,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotationDeg: 0,
        opacity: 1,
        zIndex: 0,
        src: input.dialogueAudio!.resolvedSegmentUrls[index],
        trimStartSec: 0,
        volume,
        loop: false,
        fadeInMs: 0,
        fadeOutMs: 0,
      });
    });
  }

  // 4) Text Overlay Suite events -> text layers (primary + optional
  //    secondary line, verbatim text/timing — see `resolveVdTextOverlayWindow`).
  for (const [index, overlay] of (input.overlays ?? []).entries()) {
    const window = resolveVdTextOverlayWindow(overlay, totalDurationSeconds);
    const startFrame = Math.max(0, Math.round(window.startSec * fps));
    const endFrame = Math.max(startFrame + 1, Math.round(window.endSec * fps));
    const layout = layoutForOverlayKind(overlay.kind, overlay.variant);
    layers.push({
      id: `overlay-${overlay.kind}-${index}`,
      type: "text",
      startFrame,
      durationFrames: endFrame - startFrame,
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height,
      rotationDeg: 0,
      opacity: overlay.opacity ?? 1,
      zIndex: 10,
      content: overlay.text.slice(0, 2000),
      fontFamily: "Noto Sans Thai",
      fontSizePx: layout.fontSizePx,
      color: "#ffffff",
      textAlign: "center",
      fontWeight: "bold",
    });
    if (overlay.secondaryText?.trim()) {
      layers.push({
        id: `overlay-${overlay.kind}-${index}-secondary`,
        type: "text",
        startFrame,
        durationFrames: endFrame - startFrame,
        x: layout.x,
        y: Math.min(94, layout.y + layout.height),
        width: layout.width,
        height: Math.max(4, layout.height * 0.6),
        rotationDeg: 0,
        opacity: overlay.opacity ?? 1,
        zIndex: 10,
        content: overlay.secondaryText.slice(0, 2000),
        fontFamily: "Noto Sans Thai",
        fontSizePx: Math.round(layout.fontSizePx * 0.6),
        color: "#ffffff",
        textAlign: "center",
        fontWeight: "normal",
      });
    }
  }

  // 5) Series IMAGE watermark(s) — full-timeline corner image(s). Dual
  //    watermark (`planning/vd-dual-watermark/plan.md`): one layer per
  //    slot, each with an id derived from `slotId` so two watermarks never
  //    collide/overwrite one another, and each positioned fully
  //    independently (no shared corner logic across slots).
  for (const wm of input.watermarkImages ?? []) {
    // 3x3 anchor grid — kept byte-for-byte equivalent to the ffmpeg path's
    // `watermarkOverlayPositionExpr`, so switching render engines never moves
    // the watermark.
    const column = wm.position.endsWith("_left")
      ? "left"
      : wm.position.endsWith("_right")
        ? "right"
        : "center";
    const row = wm.position.startsWith("top_")
      ? "top"
      : wm.position.startsWith("bottom_")
        ? "bottom"
        : "middle";
    const marginPct = (wm.marginPx / FRAME_WIDTH) * 100;
    const sizePct = wm.scalePct;
    // `scalePct` is a percentage of the frame WIDTH; the layer's `height` is a
    // percentage of the frame HEIGHT, so a square box needs the aspect ratio
    // applied or a "square" watermark renders stretched on a 9:16 canvas.
    const sizePctY = sizePct * (FRAME_WIDTH / FRAME_HEIGHT);
    layers.push({
      id: `series-watermark-${wm.slotId}`,
      type: "image",
      startFrame: 0,
      // Full timeline. NOTE: must be `durationInFrames` (the total), not the
      // per-clip `durationFrames` loop variable — that one is scoped to the
      // clip loop above and referencing it here was a ReferenceError crash
      // whenever a watermark was configured (gap-audit find, 2026-07-30).
      durationFrames: durationInFrames,
      x:
        column === "left"
          ? marginPct
          : column === "right"
            ? 100 - marginPct - sizePct
            : (100 - sizePct) / 2,
      y:
        row === "top"
          ? marginPct
          : row === "bottom"
            ? 100 - marginPct - sizePctY
            : (100 - sizePctY) / 2,
      width: sizePct,
      height: sizePctY,
      rotationDeg: 0,
      opacity: wm.opacity,
      zIndex: 8,
      src: wm.resolvedImageUrl,
      fit: "contain",
    });
  }

  if (layers.length > MAX_VD_REMOTION_LAYERS) {
    throw new VdRemotionRenderError(
      "too_many_layers",
      `Vertical Drama Remotion render has ${layers.length} layers, exceeding the ` +
        `${MAX_VD_REMOTION_LAYERS}-layer cap (RemotionTemplateConfigSchema) — ` +
        `${input.clips.length} clip(s) + ${input.banners?.length ?? 0} banner(s) + ` +
        `${input.dialogueAudio?.segments.length ?? 0} dialogue-audio segment(s) + ` +
        `${input.overlays?.length ?? 0} overlay event(s) + ` +
        `${input.watermarkImages?.length ?? 0} watermark layer(s). Dialogue-audio segments ` +
        `(one layer per line) are the dominant risk factor — reduce dialogue lines, ` +
        `disable per-line audio, or fall back to the ffmpeg render for this episode.`
    );
  }

  const template = RemotionTemplateConfigSchema.parse({
    id: input.templateId ?? "vd-sub-episode-assembly",
    name: "Vertical Drama Series — Sub-Episode Assembly",
    width,
    height,
    fps,
    durationInFrames,
    layers,
  });

  return { template, durationInFrames, layerCount: layers.length };
}

/* -------------------------------------------------------------------------- */
/* Clip / asset staging (mirrors marketplaceAutoReviewStagedRemotionRender.ts) */
/* -------------------------------------------------------------------------- */

interface StagedAssetProbeResult {
  durationSec?: number;
  sha256: string;
  error?: string;
}

async function defaultStageAsset(
  url: string,
  internalBaseUrl: string,
  wantDuration: boolean
): Promise<StagedAssetProbeResult> {
  const os = await import("os");
  const path = await import("path");
  const fsp = await import("fs/promises");
  const workspace = await fsp.mkdtemp(
    path.join(os.tmpdir(), "smartspec-vd-remotion-")
  );
  try {
    const dest = path.join(
      workspace,
      `asset${inferDownloadExtension(url, ".bin")}`
    );
    try {
      await downloadClipToFile(url, dest, internalBaseUrl);
      const bytes = await fsp.readFile(dest);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (!wantDuration) return { sha256 };
      const durationSec = await probeDurationSeconds(dest);
      return { durationSec: durationSec ?? undefined, sha256 };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.warn(
        `[verticalDramaRemotionRender] failed to download/probe asset ${safeAssetUrlForDiagnostics(url)}: ${errorMessage}`
      );
      return { sha256: fallbackAssetSourceHash(url), error: errorMessage };
    }
  } finally {
    await fsp
      .rm(workspace, { recursive: true, force: true })
      .catch(() => undefined);
  }
}

function safeAssetUrlForDiagnostics(value: string): string {
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return value.split(/[?#]/, 1)[0];
  }
}

/**
 * Absolutises an asset URL for the Remotion worker.
 *
 * Field incident 2026-07-30: every VD Remotion submission was rejected with
 * nine copies of `{"validation":"url","code":"invalid_string","message":
 * "Invalid url","path":["layers",N,"src"]}` and silently fell back to ffmpeg.
 * `RemotionTemplateConfigSchema`'s layer `src` is `z.string().url()`, but VD
 * clip/banner/audio/watermark URLs are stored app-RELATIVE
 * (`/api/storage/files/...`) — the surrounding code only ever resolved them
 * at DOWNLOAD time (`downloadClipToFile(url, dest, internalBaseUrl)`), never
 * for the template itself.
 *
 * The base must also be PUBLICLY reachable: a Lane B worker-app fetches these
 * URLs from another machine, so `internalNodeUrl` (often
 * `http://localhost:3000`) is only a last-resort fallback.
 */
export function absoluteVdAssetUrl(url: string, baseUrl: string): string {
  const value = String(url ?? "").trim();
  if (!value) return value;
  if (/^https?:\/\//i.test(value)) return value;
  const base = String(baseUrl ?? "").trim();
  if (!base) return value;
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
}

/* -------------------------------------------------------------------------- */
/* Orchestrator                                                               */
/* -------------------------------------------------------------------------- */

export interface SubmitVdRemotionAssemblyInput {
  owner: AssembleEpisodeVideoOwner;
  clips: EpisodeClipSource[];
  internalBaseUrl: string;
  /** Publicly reachable origin the WORKER will fetch assets from. Falls back
   *  to `internalBaseUrl` only when absent (single-machine setups). */
  publicBaseUrl?: string | null;
  filename: string;
  banners?: RunAssemblyJobBannerInput[];
  dialogueAudio?: RunAssemblyJobDialogueAudioInput;
  subtitles?: RunAssemblyJobSubtitlesInput | null;
  /** Text Overlay Suite events are a first-class Remotion layer input.
   *  Keep this separate from `subtitles` so the Remotion contract cannot
   *  silently lose configured overlays when caption handling changes. The
   *  nested `subtitles.overlays` form remains accepted for older callers. */
  overlays?: RunAssemblyJobTextOverlayEventInput[];
  /** Dual watermark (`planning/vd-dual-watermark/plan.md`): up to 2 entries. */
  watermarkImages?: RunAssemblyJobWatermarkImageInput[];
  tenantId: string;
  requestedByUserId?: number | null;
  isAdminRequester?: boolean;
  idempotencyKey?: string | null;
}

export interface VdRemotionRenderDeps {
  stageAsset?: (
    url: string,
    internalBaseUrl: string,
    wantDuration: boolean
  ) => Promise<StagedAssetProbeResult>;
  queueJob?: (
    input: QueueRemotionRenderVideoJobInput
  ) => ReturnType<typeof queueRemotionRenderVideoJob>;
}

export interface SubmitVdRemotionAssemblyResult {
  jobId: string;
  created: boolean;
  layerCount: number;
  videoDurationSeconds: number;
}

/**
 * Builds and enqueues the `remotion_render_video` worker job for a VD
 * sub-episode assembly, then persists `pendingJobId`/`status: "pending"`
 * onto `assemblyManifest.compiledVideo` (the SAME field the ffmpeg path
 * writes — `persistCompiledVideoState`), stamped with
 * `renderEngine: "remotion_queue"` so `reconcileVdRemotionAssembly` knows to
 * poll this job. Throws on ANY failure — callers MUST fall back to the
 * ffmpeg render path on any throw (never treat it as a stuck run).
 */
export async function submitVdRemotionAssembly(
  input: SubmitVdRemotionAssemblyInput,
  deps: VdRemotionRenderDeps = {}
): Promise<SubmitVdRemotionAssemblyResult> {
  const stageAsset = deps.stageAsset ?? defaultStageAsset;
  const queueJob = deps.queueJob ?? queueRemotionRenderVideoJob;

  const orderedClips = input.clips.filter(
    clip => (clip.videoUrl ?? "").trim().length > 0
  );
  if (orderedClips.length === 0) {
    throw new VdRemotionRenderError(
      "no_clips",
      "No rendered video clips available for the Vertical Drama Remotion assembly"
    );
  }

  const probedClips = await Promise.all(
    orderedClips.map(clip =>
      stageAsset(clip.videoUrl!, input.internalBaseUrl, true)
    )
  );
  const missingDurationIndex = probedClips.findIndex(
    c => !c.durationSec || c.durationSec <= 0
  );
  if (missingDurationIndex !== -1) {
    const failedClip = orderedClips[missingDurationIndex];
    const probeError = probedClips[missingDurationIndex].error;
    throw new VdRemotionRenderError(
      "duration_probe_failed",
      `Could not determine duration of source clip ${missingDurationIndex + 1}/${orderedClips.length} (clip ${failedClip.clipNumber})${
        probeError
          ? `: ${probeError}`
          : "; source is missing or not a valid video"
      }`
    );
  }

  // NOTE (asset-manifest checksum bug fix): every `stageAsset` call below
  // downloads the asset and returns the REAL bytes-sha256 (falling back to
  // `fallbackAssetSourceHash(url)` internally ONLY if the download/staging
  // itself failed — see `defaultStageAsset`'s catch block). We must capture
  // and reuse these returned hashes when building `assetManifestSources`
  // below instead of recomputing `fallbackAssetSourceHash(url)` from
  // scratch, otherwise the worker's `defaultStageRemotionRenderVideoAssets`
  // bytes-hash verification (`hyperframesRenderWorker.ts`) rejects every
  // real asset with "Asset checksum mismatch".
  const assetBaseUrl =
    String(input.publicBaseUrl ?? "").trim() || input.internalBaseUrl;
  const resolvedClips: VdRemotionResolvedClip[] = orderedClips.map(
    (clip, index) => ({
      clipNumber: clip.clipNumber,
      url: absoluteVdAssetUrl(clip.videoUrl!, assetBaseUrl),
      durationSec: probedClips[index].durationSec!,
    })
  );
  const clipHashes: string[] = probedClips.map(c => c.sha256);
  const videoDurationSeconds = resolvedClips.reduce(
    (sum, c) => sum + c.durationSec,
    0
  );

  const resolvedBanners: VdRemotionResolvedBanner[] = [];
  const bannerHashes: string[] = [];
  for (const banner of input.banners ?? []) {
    const staged = await stageAsset(
      banner.imageUrl,
      input.internalBaseUrl,
      false
    );
    bannerHashes.push(staged.sha256);
    resolvedBanners.push({
      ...banner,
      resolvedImageUrl: absoluteVdAssetUrl(banner.imageUrl, assetBaseUrl),
    });
  }

  let resolvedDialogueAudio:
    | (RunAssemblyJobDialogueAudioInput & { resolvedSegmentUrls: string[] })
    | undefined;
  const dialogueAudioHashes: string[] = [];
  if (input.dialogueAudio?.segments.length) {
    for (const segment of input.dialogueAudio.segments) {
      const staged = await stageAsset(
        segment.audioUrl,
        input.internalBaseUrl,
        false
      );
      dialogueAudioHashes.push(staged.sha256);
    }
    resolvedDialogueAudio = {
      ...input.dialogueAudio,
      resolvedSegmentUrls: input.dialogueAudio.segments.map(segment =>
        absoluteVdAssetUrl(segment.audioUrl, assetBaseUrl)
      ),
    };
  }

  // Dual watermark (`planning/vd-dual-watermark/plan.md`): stage EACH
  // configured slot's image independently — distinct staged asset + hash per
  // slot, mirroring the ffmpeg path's per-slot staging in
  // `verticalDramaEpisodeVideoAssembly.ts`.
  const resolvedWatermarkImages: Array<
    RunAssemblyJobWatermarkImageInput & { resolvedImageUrl: string }
  > = [];
  const watermarkImageHashes: string[] = [];
  for (const watermark of input.watermarkImages ?? []) {
    const staged = await stageAsset(
      watermark.imageUrl,
      input.internalBaseUrl,
      false
    );
    watermarkImageHashes.push(staged.sha256);
    resolvedWatermarkImages.push({
      ...watermark,
      resolvedImageUrl: absoluteVdAssetUrl(watermark.imageUrl, assetBaseUrl),
    });
  }

  const { template, durationInFrames, layerCount } = buildVdRemotionTemplate({
    clips: resolvedClips,
    videoDurationSeconds,
    banners: resolvedBanners.length > 0 ? resolvedBanners : undefined,
    overlays: input.overlays ?? input.subtitles?.overlays,
    dialogueAudio: resolvedDialogueAudio,
    watermarkImages:
      resolvedWatermarkImages.length > 0 ? resolvedWatermarkImages : undefined,
  });

  // Captions are re-timed against the REAL probed clip durations before they
  // are converted for the worker — `resolvedClips` is the same array, in the
  // same order, that `buildVdRemotionTemplate` just laid the video layers out
  // from, so a caption lands on exactly the frames its clip occupies.
  const retimedSubtitles = input.subtitles
    ? {
        ...input.subtitles,
        lines: retimeSubtitleLinesToProbedClips(
          input.subtitles.lines,
          resolvedClips
        ),
      }
    : input.subtitles;

  const captionLines = buildVdCaptionLines(retimedSubtitles);
  const captionPresetId = mapVdSubtitlePresetToRemotion(
    input.subtitles?.preset
  );
  const captionsEnabled = captionLines.length > 0 && Boolean(captionPresetId);
  const loudnessNormalize = input.dialogueAudio?.loudnessNormalize === true;

  const assetManifestSources = [
    ...resolvedClips.map((clip, index) => ({
      role: "video" as const,
      url: clip.url,
      sha256: clipHashes[index] ?? fallbackAssetSourceHash(clip.url),
    })),
    ...resolvedBanners.map((banner, index) => ({
      role: "image" as const,
      url: banner.resolvedImageUrl,
      sha256:
        bannerHashes[index] ?? fallbackAssetSourceHash(banner.resolvedImageUrl),
    })),
    ...(resolvedDialogueAudio?.resolvedSegmentUrls ?? []).map((url, index) => ({
      role: "audio" as const,
      url,
      sha256: dialogueAudioHashes[index] ?? fallbackAssetSourceHash(url),
    })),
    ...resolvedWatermarkImages.map((watermark, index) => ({
      role: "image" as const,
      url: watermark.resolvedImageUrl,
      sha256:
        watermarkImageHashes[index] ??
        fallbackAssetSourceHash(watermark.resolvedImageUrl),
    })),
  ];

  const traceId = `vd-sub-episode-remotion:${input.owner.seriesId}:${input.owner.episodeId}:${Date.now()}`;
  const videoProjectId = `vd-sub-episode:${input.owner.seriesId}:${input.owner.episodeId}`;
  const remotionTemplateHash = createHash("sha256")
    .update(JSON.stringify(template))
    .digest("hex");

  const workerInput: RemotionRenderVideoWorkerInput = {
    kind: "remotion_render_video",
    schemaVersion: 1,
    platformContractVersion: REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION,
    rendererPolicyVersion: REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION,
    videoProjectId,
    projectRevision: 1,
    traceId,
    renderProfile: {
      profile: "final",
      width: template.width,
      height: template.height,
      fps: template.fps,
      codec: "h264",
      loudnessNormalize,
      burnInAssCaptions: captionsEnabled,
    },
    remotionTemplate: template,
    compositionId: "GenericTemplate",
    assetManifest: { sources: assetManifestSources },
    postPasses: [
      ...(loudnessNormalize ? (["loudnorm"] as const) : []),
      ...(captionsEnabled ? (["ass_burn"] as const) : []),
    ],
    segmentPlan: null,
    remotionTemplateHash,
    durationInFrames,
    ...(captionsEnabled ? { captionLines, captionPresetId } : {}),
  };

  const { created, job } = await queueJob({
    ...workerInput,
    tenantId: input.tenantId,
    requestedByUserId: input.requestedByUserId ?? undefined,
    isAdminRequester: input.isAdminRequester ?? false,
    idempotencyKey: input.idempotencyKey ?? undefined,
  });

  // No Lane A in-process dispatch here (see this file's header doc comment)
  // — the job just sits `queued` in `workerJobs` for a Lane B worker-app to
  // claim. `reconcileVdRemotionAssembly` falls back if it isn't claimed
  // within the queued TTL (`VD_REMOTION_QUEUED_TTL_MS`).

  await persistCompiledVideoState(input.owner, {
    pendingJobId: job.id,
    status: "pending",
    error: undefined,
    // Additive on `CompiledVideoState` — the ONLY marker
    // `reconcileVdRemotionAssembly` needs to know which queue to poll.
    renderEngine: "remotion_queue",
    // Stamped so the queued-TTL fallback in `reconcileVdRemotionAssembly`
    // knows how long this job has been waiting for a Lane B claim.
    renderSubmittedAt: Date.now(),
  });

  return { jobId: job.id, created, layerCount, videoDurationSeconds };
}

export interface SubmitVdEpisodePreviewInput {
  owner: AssembleEpisodeVideoOwner;
  slotId: number;
  clips: EpisodeClipSource[];
  coverImageUrl: string;
  episodeLabel: string;
  /** Same resolved caption feed used by final episode assembly. */
  subtitles?: RunAssemblyJobSubtitlesInput | null;
  internalBaseUrl: string;
  publicBaseUrl?: string | null;
  tenantId: string;
  requestedByUserId?: number | null;
  idempotencyKey?: string | null;
}

export interface SubmitVdEpisodePreviewResult {
  jobId: string;
  created: boolean;
  layerCount: number;
  videoDurationSeconds: number;
}

/**
 * Queue a two-shot episode teaser through the same Remotion worker contract as
 * the full assembly. The only preview-specific behavior lives in
 * `previewCard`: the title overlay starts at frame 0 and the episode cover is
 * appended as a short end card after the selected clips.
 */
export async function submitVdEpisodePreview(
  input: SubmitVdEpisodePreviewInput,
  deps: VdRemotionRenderDeps = {}
): Promise<SubmitVdEpisodePreviewResult> {
  const stageAsset = deps.stageAsset ?? defaultStageAsset;
  const queueJob = deps.queueJob ?? queueRemotionRenderVideoJob;
  const orderedClips = input.clips.filter(
    clip => (clip.videoUrl ?? "").trim().length > 0
  );
  if (orderedClips.length === 0) {
    throw new VdRemotionRenderError(
      "no_clips",
      "No rendered video clips available for the episode preview"
    );
  }

  const probedClips = await Promise.all(
    orderedClips.map(clip =>
      stageAsset(clip.videoUrl!, input.internalBaseUrl, true)
    )
  );
  const missingDurationIndex = probedClips.findIndex(
    clip => !clip.durationSec || clip.durationSec <= 0
  );
  if (missingDurationIndex !== -1) {
    const failedClip = orderedClips[missingDurationIndex];
    throw new VdRemotionRenderError(
      "duration_probe_failed",
      `Could not determine duration of preview source clip ${failedClip.clipNumber}`
    );
  }

  const stagedCover = await stageAsset(
    input.coverImageUrl,
    input.internalBaseUrl,
    false
  );
  const assetBaseUrl =
    String(input.publicBaseUrl ?? "").trim() || input.internalBaseUrl;
  const resolvedClips: VdRemotionResolvedClip[] = orderedClips.map(
    (clip, index) => ({
      clipNumber: clip.clipNumber,
      url: absoluteVdAssetUrl(clip.videoUrl!, assetBaseUrl),
      durationSec: probedClips[index].durationSec!,
    })
  );
  const videoDurationSeconds = resolvedClips.reduce(
    (sum, clip) => sum + clip.durationSec,
    0
  );
  const retimedSubtitles = input.subtitles
    ? {
        ...input.subtitles,
        lines: retimeSubtitleLinesToProbedClips(
          input.subtitles.lines,
          resolvedClips
        ),
      }
    : input.subtitles;
  const captionLines = buildVdCaptionLines(retimedSubtitles);
  const captionPresetId = mapVdSubtitlePresetToRemotion(
    input.subtitles?.preset
  );
  const captionsEnabled = captionLines.length > 0 && Boolean(captionPresetId);
  const { template, durationInFrames, layerCount } = buildVdRemotionTemplate({
    clips: resolvedClips,
    videoDurationSeconds,
    previewCard: {
      label: input.episodeLabel,
      coverImageUrl: absoluteVdAssetUrl(input.coverImageUrl, assetBaseUrl),
    },
    templateId: `vd-episode-preview-${input.owner.episodeId}-${input.slotId}`,
  });
  const remotionTemplateHash = createHash("sha256")
    .update(JSON.stringify(template))
    .digest("hex");
  const traceId = `vd-episode-preview:${input.owner.seriesId}:${input.owner.episodeId}:${input.slotId}:${Date.now()}`;
  const workerInput: RemotionRenderVideoWorkerInput = {
    kind: "remotion_render_video",
    schemaVersion: 1,
    platformContractVersion: REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION,
    rendererPolicyVersion: REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION,
    videoProjectId: `vd-episode-preview:${input.owner.seriesId}:${input.owner.episodeId}`,
    projectRevision: input.slotId,
    traceId,
    renderProfile: {
      profile: "preview",
      width: template.width,
      height: template.height,
      fps: template.fps,
      codec: "h264",
      loudnessNormalize: false,
      burnInAssCaptions: captionsEnabled,
    },
    remotionTemplate: template,
    compositionId: "GenericTemplate",
    assetManifest: {
      sources: [
        ...resolvedClips.map((clip, index) => ({
          role: "video" as const,
          url: clip.url,
          sha256:
            probedClips[index].sha256 ?? fallbackAssetSourceHash(clip.url),
        })),
        {
          role: "image" as const,
          url: absoluteVdAssetUrl(input.coverImageUrl, assetBaseUrl),
          sha256:
            stagedCover.sha256 ?? fallbackAssetSourceHash(input.coverImageUrl),
        },
      ],
    },
    postPasses: captionsEnabled ? (["ass_burn"] as const) : [],
    segmentPlan: null,
    remotionTemplateHash,
    durationInFrames,
    ...(captionsEnabled ? { captionLines, captionPresetId } : {}),
  };
  const { created, job } = await queueJob({
    ...workerInput,
    tenantId: input.tenantId,
    requestedByUserId: input.requestedByUserId ?? undefined,
    idempotencyKey: input.idempotencyKey ?? undefined,
  });
  return { jobId: job.id, created, layerCount, videoDurationSeconds };
}

/* -------------------------------------------------------------------------- */
/* Reconciliation (called from the episode-detail read path)                 */
/* -------------------------------------------------------------------------- */

export interface ReconcileVdRemotionAssemblyResult {
  reconciled: boolean;
  status?: "completed" | "failed";
}

/**
 * How long a `remotion_render_video` worker job may sit `status: "queued"`
 * (never claimed by a Lane B worker-app) before `reconcileVdRemotionAssembly`
 * gives up waiting and falls back
 * (`planning/worker-app-remotion-render-video/plan.md` §P3). Exported for
 * tests. Distinct from any Lane-A/legacy render-timeout constant — this one
 * governs "was this ever picked up at all", not "did the render itself hang".
 */
export const VD_REMOTION_QUEUED_TTL_MS = 10 * 60 * 1000;

/**
 * Polls the `worker_jobs` row a `submitVdRemotionAssembly` call created and,
 * on terminal status, writes the SAME `assemblyManifest.compiledVideo` shape
 * the ffmpeg path writes (contract-identical downstream — every existing
 * reader of `compiledVideo` keeps working unmodified). No-op (and reports
 * `reconciled: false`) while the job is still queued (within the TTL) or
 * running. Called from `getEpisodeDetail`'s read path (the workspace's
 * existing "poll while a compile job is pending" convention) whenever
 * `compiledVideo.status === "pending"` and
 * `compiledVideo.renderEngine === "remotion_queue"`.
 *
 * `submittedAt` should be `compiledVideo.renderSubmittedAt` from the SAME
 * read the caller used to decide to poll — when the job is still `queued`
 * past `VD_REMOTION_QUEUED_TTL_MS`, this marks the run `failed` with a Thai
 * message asking the user to re-run assembly on the ffmpeg path instead of
 * silently re-queuing: unlike the marketplace staged-render fallback, the
 * `renderFeed` (clips/banners/dialogue-audio/subtitles/watermark) this
 * function's template was built from is NOT persisted anywhere reachable at
 * reconcile time, so there is nothing to re-submit against the ffmpeg
 * assembly job automatically.
 */
/**
 * Resolves the rendered mp4 reference for a COMPLETED remotion worker job.
 *
 * Field incident 2026-08-01 (job `da73b8ef-9d4e-436f-b6fa-530d3381c438`,
 * `vd-sub-episode-remotion:21:124`): this used to read
 * `job.outputJson.outputUrl` alone, but nothing ever writes that key.
 * `worker_jobs.outputJson` is the worker-protocol ASSIGNMENT bookkeeping record
 * (`assignedAt` / `lastEventType` / `lastEventPayload` / `publishedArtifacts`
 * …) — the render's real `outputUrl` arrives inside the `job.completed` event
 * payload, which is mirrored at `outputJson.lastEventPayload`. So a render that
 * fully succeeded — 93 MB mp4, published as a library item — was reported to
 * the user as "completed but produced no output URL" and its
 * `compiledVideo.status` persisted as `failed`, discarding a finished video.
 *
 * The marketplace staged-render path hit this EXACT failure on 2026-07-30
 * (`resolveStagedRemotionOutputUrl`, `marketplaceAutoReviewService.ts`) and was
 * fixed there; this VD consumer was missed. Ordered the same way — a published
 * `sourceUrl` first, because it is already a fetchable `/api/storage/files/...`
 * path, whereas the remaining sources may be bare storage keys the caller still
 * has to resolve through `storageGet`:
 *   1. `outputJson.publishedArtifacts[].sourceUrl` — already servable
 *   2. `outputJson.outputUrl`            — lane A (in-process) writes a real URL
 *   3. `lastEventPayload.outputUrl`      — lane B (worker-app) completion payload
 *   4. `lastEventPayload.outputArtifactRef.{url,storageRef}`
 *   5. `outputJson.lastArtifactStorageRef` when the last artifact was the mp4
 *   6. the `worker_artifacts` row for `remotion_render_mp4` (last resort — the
 *      artifact protocol always writes this even if the payload mirror is lost)
 */
export async function resolveRemotionOutputRef(
  job: WorkerJob
): Promise<string> {
  const asRecord = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const asRef = (value: unknown): string =>
    typeof value === "string" ? value.trim() : "";

  const output = asRecord(job.outputJson);
  const payload = output ? asRecord(output.lastEventPayload) : null;
  const artifactRef = payload ? asRecord(payload.outputArtifactRef) : null;

  const publishedSourceUrl = Array.isArray(output?.publishedArtifacts)
    ? ((output.publishedArtifacts as unknown[])
        .map(entry => asRef(asRecord(entry)?.sourceUrl))
        .find(ref => ref.length > 0) ?? "")
    : "";

  const direct =
    publishedSourceUrl ||
    asRef(output?.outputUrl) ||
    asRef(payload?.outputUrl) ||
    asRef(artifactRef?.url) ||
    asRef(artifactRef?.storageRef) ||
    (output?.lastArtifactType === REMOTION_RENDER_MP4_ARTIFACT_TYPE
      ? asRef(output?.lastArtifactStorageRef)
      : "");
  if (direct) return direct;

  const [artifact] = await db
    .select({ storageRef: workerArtifacts.storageRef })
    .from(workerArtifacts)
    .where(
      and(
        eq(workerArtifacts.workerJobId, job.id),
        eq(workerArtifacts.artifactType, REMOTION_RENDER_MP4_ARTIFACT_TYPE)
      )
    )
    .limit(1);
  return asRef(artifact?.storageRef);
}

export async function reconcileVdRemotionAssembly(
  owner: AssembleEpisodeVideoOwner,
  jobId: string,
  submittedAt?: number
): Promise<ReconcileVdRemotionAssemblyResult> {
  const [job] = await db
    .select()
    .from(workerJobs)
    .where(eq(workerJobs.id, jobId))
    .limit(1);
  if (!job) return { reconciled: false };
  if (job.status === "running") return { reconciled: false };

  if (job.status === "queued") {
    const submittedMs = Number(submittedAt);
    const timedOut =
      Number.isFinite(submittedMs) &&
      submittedMs > 0 &&
      Date.now() - submittedMs > VD_REMOTION_QUEUED_TTL_MS;
    if (!timedOut) return { reconciled: false };

    await persistCompiledVideoState(owner, {
      pendingJobId: undefined,
      status: "failed",
      error:
        "[vd_remotion_worker_unavailable] ไม่มีเครื่อง Worker ออนไลน์รับงาน Remotion " +
        '— กรุณากดปุ่ม "ประกอบวิดีโอ" อีกครั้งโดยไม่เปิดตัวเลือก Remotion ' +
        "เพื่อใช้ตัวประกอบวิดีโอเดิมแทน",
    });
    return { reconciled: true, status: "failed" };
  }

  if (job.status === "failed") {
    await persistCompiledVideoState(owner, {
      pendingJobId: undefined,
      status: "failed",
      error: job.failureReason || "Remotion render failed",
    });
    return { reconciled: true, status: "failed" };
  }

  if (job.status !== "completed") return { reconciled: false };

  const rawOutputUrl = await resolveRemotionOutputRef(job as WorkerJob);
  if (!rawOutputUrl) {
    await persistCompiledVideoState(owner, {
      pendingJobId: undefined,
      status: "failed",
      error: "Remotion render completed but produced no output URL",
    });
    return { reconciled: true, status: "failed" };
  }

  // Lane A (in-process) reports a real playable URL. Lane B (worker-app)
  // uploads via the worker artifact protocol, whose `worker_artifacts` row
  // stores only a `storageRef` KEY — so it reports that key here. Resolve a
  // key into a URL before persisting it as `videoUrl` (the player consumes
  // this value directly).
  // Absolute URLs and root-relative paths (`publishedArtifacts[].sourceUrl` is
  // already a servable `/api/storage/files/...` path) are playable as-is —
  // only a bare storage KEY needs `storageGet`. Passing a served path to
  // `storageGet` as if it were a key just fails into the catch below.
  const outputUrl = /^(https?:\/\/|\/)/i.test(rawOutputUrl)
    ? rawOutputUrl
    : await (async () => {
        try {
          const { storageGet } = await import("../storage");
          const resolved = await storageGet(rawOutputUrl);
          return String(resolved?.url ?? "").trim() || rawOutputUrl;
        } catch {
          // Never fail the whole reconcile over URL resolution — persist the
          // raw ref so the render isn't lost and the failure is visible.
          return rawOutputUrl;
        }
      })();

  await persistCompiledVideoState(owner, {
    pendingJobId: undefined,
    videoUrl: outputUrl,
    assembledAt: new Date().toISOString(),
    status: "completed",
    error: undefined,
  });
  return { reconciled: true, status: "completed" };
}
