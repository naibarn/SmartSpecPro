/**
 * Maps a validated `HyperframesFinalCompositeConfig` into the frame-based
 * props consumed by the Remotion composition
 * (`server/remotion/MarketplaceAutoReviewComposition.tsx`), and enforces
 * that only the schema-default preset combination is used.
 *
 * See planning/remotion-migration/plan.md Phase 2. This is intentionally
 * narrow in scope: only the following schema defaults are supported this
 * phase, everything else throws `UnsupportedPresetError` so the Remotion
 * engine flag stays safe to enable without silently mis-rendering presets
 * that have not been ported yet:
 *   - global subtitlePreset === "classic_box"
 *   - shot.animationPreset === "smooth_reveal"
 *   - shot.transition === "fade" | "none" (both are trivially supported —
 *     "none" simply means no transition-in for that shot)
 *   - shot.textMotionPreset === "stagger_rise" (the actual Zod default for
 *     `HyperframesFinalCompositeShotInputSchema.textMotionPreset` — NOTE
 *     this differs from the *global* `config.textMotionPreset` default of
 *     "slide_right_to_left"; see remark in this module's tests / the
 *     adapter report for why only the shot-level field matters here)
 *
 * `overlayPreset` (22 variants) is explicitly out of scope for this phase's
 * visual output — only on-screen text lines + subtitle burn-in are ported,
 * not the overlay card/badge presets.
 */
import type { HyperframesFinalCompositeConfig } from "../../shared/hyperframes/runtimeApiSchemas";

export class UnsupportedPresetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedPresetError";
  }
}

const SUPPORTED_SUBTITLE_PRESET = "classic_box" as const;
const SUPPORTED_ANIMATION_PRESET = "smooth_reveal" as const;
const SUPPORTED_SHOT_TEXT_MOTION_PRESET = "stagger_rise" as const;
const SUPPORTED_TRANSITIONS = new Set(["fade", "none"]);

/**
 * Throws `UnsupportedPresetError` if `config` (or any of its shots) selects
 * a preset combination outside the schema-default set this phase supports.
 */
export function assertRemotionPresetSupport(
  config: HyperframesFinalCompositeConfig
): void {
  if (config.subtitlePreset !== SUPPORTED_SUBTITLE_PRESET) {
    throw new UnsupportedPresetError(
      `Remotion renderer (phase 2) only supports subtitlePreset="${SUPPORTED_SUBTITLE_PRESET}", got "${config.subtitlePreset}".`
    );
  }

  for (const shot of config.shots) {
    if (shot.animationPreset !== SUPPORTED_ANIMATION_PRESET) {
      throw new UnsupportedPresetError(
        `Remotion renderer (phase 2) only supports animationPreset="${SUPPORTED_ANIMATION_PRESET}", shot "${shot.id}" requested "${shot.animationPreset}".`
      );
    }
    if (!SUPPORTED_TRANSITIONS.has(shot.transition)) {
      throw new UnsupportedPresetError(
        `Remotion renderer (phase 2) only supports transition="fade" or "none", shot "${shot.id}" requested "${shot.transition}".`
      );
    }
    if (shot.textMotionPreset !== SUPPORTED_SHOT_TEXT_MOTION_PRESET) {
      throw new UnsupportedPresetError(
        `Remotion renderer (phase 2) only supports shot textMotionPreset="${SUPPORTED_SHOT_TEXT_MOTION_PRESET}", shot "${shot.id}" requested "${shot.textMotionPreset}".`
      );
    }
  }
}

export interface RemotionSubtitleCueProps {
  startFrame: number;
  endFrame: number;
  text: string;
}

export interface RemotionShotProps {
  id: string;
  src: string;
  startFrame: number;
  durationFrames: number;
  trimBeforeFrames: number;
  trimAfterFrames: number;
  transitionIn: "fade" | "none";
  onScreenText: string[];
}

export interface RemotionInputProps {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  fontFamily: string;
  /**
   * URL of a staged Thai-capable font file served by the render workspace's
   * local asset server (see `remotionRuntimeAdapter.ts`'s
   * `resolveAndStageRenderFont`/`startLocalAssetServer`), to be registered
   * via a CSS `@font-face` rule as `fontFamily` inside the composition.
   * `null` when no Thai font could be resolved for this render (soft
   * degrade — the composition falls back to the browser default font).
   */
  fontFaceUrl: string | null;
  subtitleFontSizePx: number;
  subtitlePlacement: "bottom" | "lower_third";
  burnInSubtitles: boolean;
  preserveNativeAudio: boolean;
  shots: RemotionShotProps[];
  subtitleCues: RemotionSubtitleCueProps[];
  // Remotion's `Composition`/`CalculateMetadataFunction` generics require
  // Props to satisfy `Record<string, unknown>`; this index signature exists
  // only to satisfy that constraint (see `server/remotion/Root.tsx`), all
  // real fields above remain concretely typed for consumers.
  [key: string]: unknown;
}

function toFrames(seconds: number, fps: number): number {
  return Math.max(0, Math.round(seconds * fps));
}

/**
 * Maps a validated `HyperframesFinalCompositeConfig` (with `shots[].sourceVideoUrl`
 * already resolved to a locally-staged file path or a directly renderable
 * remote URL — see `remotionRuntimeAdapter.ts`'s asset-staging step) into the
 * Remotion composition's frame-based `inputProps`.
 *
 * Does NOT itself validate preset support — call `assertRemotionPresetSupport`
 * first.
 *
 * @param fontFaceUrl URL of the staged Thai-capable font served by the
 *   render workspace's local asset server, or `null` if none could be
 *   resolved for this render (see `remotionRuntimeAdapter.ts`'s
 *   `resolveAndStageRenderFont`). Defaults to `null` for callers (e.g.
 *   existing tests) that don't care about font staging.
 */
export function buildRemotionInputProps(
  config: HyperframesFinalCompositeConfig,
  fontFaceUrl: string | null = null
): RemotionInputProps {
  const fps = config.fps;
  const durationInFrames = toFrames(config.finalVideoLengthSec, fps);

  const shots: RemotionShotProps[] = config.shots.map(shot => {
    const trimBeforeFrames = toFrames(shot.mediaStartSec, fps);
    const durationFrames = Math.max(1, toFrames(shot.durationSec, fps));
    return {
      id: shot.id,
      src: shot.sourceVideoUrl,
      startFrame: toFrames(shot.startSec, fps),
      durationFrames,
      trimBeforeFrames,
      trimAfterFrames: trimBeforeFrames + durationFrames,
      transitionIn: shot.transition === "fade" ? "fade" : "none",
      onScreenText: shot.onScreenText,
    };
  });

  const subtitleCues: RemotionSubtitleCueProps[] = config.burnInSubtitles
    ? config.shots.flatMap(shot =>
        shot.subtitleCues.map(cue => ({
          startFrame: toFrames(cue.startSec, fps),
          endFrame: toFrames(cue.endSec, fps),
          text: cue.text,
        }))
      )
    : [];

  return {
    width: config.width,
    height: config.height,
    fps,
    durationInFrames,
    fontFamily: config.fontFamily,
    fontFaceUrl,
    subtitleFontSizePx: config.subtitleFontSizePx,
    subtitlePlacement: config.subtitlePlacement,
    burnInSubtitles: config.burnInSubtitles,
    preserveNativeAudio: config.preserveNativeAudio,
    shots,
    subtitleCues,
  };
}
