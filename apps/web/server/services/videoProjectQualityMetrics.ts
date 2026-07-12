/**
 * Pure deterministic metric helpers + the QA-loop credit-cost helper
 * (Feature 133, section-06 §5.2). Every helper is `input -> output`: no I/O,
 * no LLM calls, no randomness. These facts are fed INTO the
 * `video-project-quality-review` skill's review — they never replace LLM
 * judgment (skill-first rule, memory `feedback_skill_first_authoring`).
 */
import type { PlatformPreset, VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";
import type { RenderCostEstimate } from "@shared/videoIntelligence/cost";

import type { ClaimValidationResult } from "./validateProjectClaims";

/* -------------------------------------------------------------------------- */
/* Duration vs narration                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Assumed average narration speaking rate, characters per second. A
 * documented Phase-1 constant used only to compute
 * `computeDurationVsNarration`'s expected-duration fact — it is not a
 * creative rule (that stays in the skill), only a duration-fit heuristic so
 * the judge has a concrete "does this scene's timing fit its narration"
 * signal instead of re-deriving it itself every review.
 */
const NARRATION_CHARS_PER_SECOND = 15;

/** A scene is flagged when its actual-to-expected duration ratio falls
 *  outside this band — either too tight (narration doesn't fit) or too
 *  loose (excessive dead air after the narration finishes). */
const NARRATION_DURATION_BAND_MIN_RATIO = 0.6;
const NARRATION_DURATION_BAND_MAX_RATIO = 1.8;

export interface SceneDurationMetric {
  sceneId: string;
  durationMs: number;
  narrationCharCount: number;
  narrationWordCount: number;
  /** `null` when the scene has no narration. */
  expectedNarrationMs: number | null;
  /** `durationMs / expectedNarrationMs`; `null` when there is no narration. */
  actualToExpectedRatio: number | null;
  /** True when the scene's duration is a poor fit for its narration length. */
  flagged: boolean;
}

/** Per-scene: narration char/word length vs scene duration (ms). Flags
 *  scenes where narration is too long/short for the allotted time. */
export function computeDurationVsNarration(document: VideoProjectDocument): SceneDurationMetric[] {
  return document.scenes.map((scene) => {
    const durationMs = Math.max(0, scene.endMs - scene.startMs);
    const narration = (scene.narration ?? "").trim();
    const narrationCharCount = narration.length;
    const narrationWordCount = narration.length === 0 ? 0 : narration.split(/\s+/).filter(Boolean).length;

    if (narrationCharCount === 0) {
      return {
        sceneId: scene.sceneId,
        durationMs,
        narrationCharCount: 0,
        narrationWordCount: 0,
        expectedNarrationMs: null,
        actualToExpectedRatio: null,
        flagged: false,
      };
    }

    const expectedNarrationMs = Math.round((narrationCharCount / NARRATION_CHARS_PER_SECOND) * 1000);
    const actualToExpectedRatio = expectedNarrationMs > 0 ? durationMs / expectedNarrationMs : null;
    const flagged =
      actualToExpectedRatio === null
        ? durationMs === 0
        : actualToExpectedRatio < NARRATION_DURATION_BAND_MIN_RATIO ||
          actualToExpectedRatio > NARRATION_DURATION_BAND_MAX_RATIO;

    return {
      sceneId: scene.sceneId,
      durationMs,
      narrationCharCount,
      narrationWordCount,
      expectedNarrationMs,
      actualToExpectedRatio,
      flagged,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Caption reading speed                                                      */
/* -------------------------------------------------------------------------- */

/** Caption cues reading faster than this (characters/second) are flagged as
 *  uncomfortably fast for a viewer to read (a commonly cited subtitle
 *  guideline band; documented Phase-1 constant, not derived from external
 *  input). */
const CAPTION_MAX_COMFORTABLE_CPS = 17;

export interface CaptionCpsMetric {
  sceneId: string;
  cueCount: number;
  maxCharsPerSecond: number;
  averageCharsPerSecond: number;
  flaggedCueCount: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Per-scene caption reading speed (characters per second) from captionCues. */
export function computeCaptionCps(document: VideoProjectDocument): CaptionCpsMetric[] {
  return document.scenes.map((scene) => {
    const cueCount = scene.captionCues.length;
    if (cueCount === 0) {
      return { sceneId: scene.sceneId, cueCount: 0, maxCharsPerSecond: 0, averageCharsPerSecond: 0, flaggedCueCount: 0 };
    }

    let sum = 0;
    let max = 0;
    let flaggedCueCount = 0;
    for (const cue of scene.captionCues) {
      const durationSec = Math.max(0, cue.endMs - cue.startMs) / 1000;
      // A zero/negative-duration cue with non-empty text (schema guarantees
      // text.length >= 1) is unreadable in any real time slot — use the raw
      // char count as its cps so it always exceeds the comfortable
      // threshold deterministically, instead of dividing by zero.
      const cps = durationSec > 0 ? cue.text.length / durationSec : cue.text.length;
      sum += cps;
      if (cps > max) max = cps;
      if (cps > CAPTION_MAX_COMFORTABLE_CPS) flaggedCueCount++;
    }

    return {
      sceneId: scene.sceneId,
      cueCount,
      maxCharsPerSecond: round2(max),
      averageCharsPerSecond: round2(sum / cueCount),
      flaggedCueCount,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Layer counts                                                               */
/* -------------------------------------------------------------------------- */

export interface LayerCountMetric {
  perScene: Array<{ sceneId: string; layerCount: number }>;
  total: number;
  maxLayersPerScene: number;
}

/** Layer counts per scene + total (feeds render-clutter + 40-layer awareness). */
export function computeLayerCounts(document: VideoProjectDocument): LayerCountMetric {
  const perScene = document.scenes.map((scene) => ({ sceneId: scene.sceneId, layerCount: scene.layers.length }));
  const total = perScene.reduce((sum, entry) => sum + entry.layerCount, 0);
  const maxLayersPerScene = perScene.reduce((max, entry) => Math.max(max, entry.layerCount), 0);
  return { perScene, total, maxLayersPerScene };
}

/* -------------------------------------------------------------------------- */
/* Safe-area violations                                                       */
/* -------------------------------------------------------------------------- */

interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Percent-of-canvas inset from each edge defining the "safe" rectangle a
 *  layer's bounding box should stay within for this platform preset (e.g.
 *  TikTok/Reels reserve extra space at the bottom for the caption/UI
 *  overlay, and on the right for the like/share rail). Documented Phase-1
 *  constants — never derived from external input. */
const PLATFORM_SAFE_AREA_INSETS: Record<PlatformPreset, SafeAreaInsets> = {
  tiktok_9_16: { top: 10, bottom: 20, left: 5, right: 15 },
  reels_9_16: { top: 10, bottom: 20, left: 5, right: 15 },
  youtube_16_9: { top: 5, bottom: 10, left: 5, right: 5 },
  square_1_1: { top: 5, bottom: 5, left: 5, right: 5 },
};

export interface SafeAreaMetric {
  sceneId: string;
  layerId: string;
  edges: Array<"top" | "bottom" | "left" | "right">;
}

/** Safe-area bounding-box checks: which layers fall outside the
 *  platformPreset safe area (x/y/width/height are 0..100 percent —
 *  section-01 A1). Audio layers are skipped — their box has no visual
 *  render effect (`RemotionAudioLayerSchema`'s doc comment). */
export function computeSafeAreaViolations(document: VideoProjectDocument): SafeAreaMetric[] {
  const insets = PLATFORM_SAFE_AREA_INSETS[document.content.platformPreset];
  const safeLeft = insets.left;
  const safeTop = insets.top;
  const safeRight = 100 - insets.right;
  const safeBottom = 100 - insets.bottom;

  const violations: SafeAreaMetric[] = [];
  for (const scene of document.scenes) {
    for (const layer of scene.layers) {
      if (layer.type === "audio") continue;

      const layerLeft = layer.x;
      const layerTop = layer.y;
      const layerRight = layer.x + layer.width;
      const layerBottom = layer.y + layer.height;

      const edges: SafeAreaMetric["edges"] = [];
      if (layerLeft < safeLeft) edges.push("left");
      if (layerTop < safeTop) edges.push("top");
      if (layerRight > safeRight) edges.push("right");
      if (layerBottom > safeBottom) edges.push("bottom");

      if (edges.length > 0) {
        violations.push({ sceneId: scene.sceneId, layerId: layer.id, edges });
      }
    }
  }
  return violations;
}

/* -------------------------------------------------------------------------- */
/* Claim coverage                                                             */
/* -------------------------------------------------------------------------- */

export interface ClaimCoverageMetric {
  coverage: number;
  mappedCount: number;
  unmappedCount: number;
  prohibitedCount: number;
}

/** Claim-source join coverage derived from a ClaimValidationResult (§5.1). */
export function computeClaimCoverage(result: ClaimValidationResult): ClaimCoverageMetric {
  return {
    coverage: result.coverage,
    mappedCount: result.mappedClaims.length,
    unmappedCount: result.unmappedStatements.length,
    prohibitedCount: result.prohibitedClaims.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Aggregate + credit-cost helper                                             */
/* -------------------------------------------------------------------------- */

/** Flat, JSON-serializable record combining every deterministic fact handed
 *  to the `video-project-quality-review` judge — explicitly typed (no
 *  `Record<string, unknown>`) so the judge input contract is a
 *  compile-time fact. */
export interface VideoProjectQualityMetrics {
  sceneDurations: SceneDurationMetric[];
  captionCps: CaptionCpsMetric[];
  layerCounts: LayerCountMetric;
  safeAreaViolations: SafeAreaMetric[];
  claimCoverage: ClaimCoverageMetric;
  /** Carried through from section-01's `estimateRenderCost` — this module
   *  does NOT recompute the cost model. */
  renderCost: RenderCostEstimate;
}

/** Aggregate all deterministic facts into the single object handed to the
 *  judge. `renderCost` is carried through from section-01's
 *  `estimateRenderCost` — this module does NOT recompute the cost model. */
export function computeQualityMetrics(args: {
  document: VideoProjectDocument;
  claimValidation: ClaimValidationResult;
  renderCost: RenderCostEstimate;
}): VideoProjectQualityMetrics {
  return {
    sceneDurations: computeDurationVsNarration(args.document),
    captionCps: computeCaptionCps(args.document),
    layerCounts: computeLayerCounts(args.document),
    safeAreaViolations: computeSafeAreaViolations(args.document),
    claimCoverage: computeClaimCoverage(args.claimValidation),
    renderCost: args.renderCost,
  };
}

/**
 * Pure credit-cost helper for the QA loop (research A10 template — mirrors
 * `estimateVerticalDramaQualityLoopCredits`). `maxRounds` is clamped to
 * `>= 1` (Phase 1 always runs at least one review round — unlike Vertical
 * Drama's bounded loop, there is no "0 rounds = no loop" case here).
 */
export function estimateVideoProjectQualityLoopCredits(perRound: number, maxRounds: number): number {
  const clampedRounds = Math.max(1, Math.trunc(maxRounds));
  return Math.max(0, perRound) * clampedRounds;
}
