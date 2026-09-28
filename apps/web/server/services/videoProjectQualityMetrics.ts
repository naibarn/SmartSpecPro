/**
 * Pure deterministic metric helpers + the QA-loop credit-cost helper
 * (Feature 133, section-06 §5.2). Every helper is `input -> output`: no I/O,
 * no LLM calls, no randomness. These facts are fed INTO the
 * `video-project-quality-review` skill's review — they never replace LLM
 * judgment (skill-first rule, memory `feedback_skill_first_authoring`).
 */
import type { PlatformPreset, Scene, VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";
import type { RenderCostEstimate } from "@shared/videoIntelligence/cost";

import type { ClaimValidationResult } from "./validateProjectClaims";
import type { TemplateBuildContext } from "./videoProjectCompiler";
import { MOTION_TEMPLATE_REGISTRY, type MotionTemplate } from "../remotion/templates";
import { MAX_RENDERABLE_LAYERS } from "./videoProjectScenePlanner";

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

    // Once TTS exists, its measured duration is the authoritative sync
    // target. Character-rate estimation remains the fallback for a draft that
    // has not produced audio yet.
    const expectedNarrationMs = scene.narrationAudioDurationMs
      ?? Math.round((narrationCharCount / NARRATION_CHARS_PER_SECOND) * 1000);
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
 *  input). Exported (Feature 142, section-06) so the repair applier's
 *  captions handler reuses this EXACT threshold rather than re-deriving it —
 *  see section-06 §6.1. */
export const CAPTION_MAX_COMFORTABLE_CPS = 17;

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
  /** Sum of `perScene` — hand-authored `scene.layers[]` ONLY (excluding
   *  `hidden` ones, which the compiler never emits — Feature 143 §4.8/§4.13).
   *  Feeds per-scene clutter awareness (`MOTION_CLUTTER_LAYER_THRESHOLD` in
   *  the repair applier). **NOT the render-budget number** — see
   *  `compiledTotal` below (spec 143 §4.6: this field alone is "wrong by
   *  construction" for a 40-layer budget check, since it excludes template,
   *  caption and audio layers). */
  total: number;
  maxLayersPerScene: number;
  /** Feature 143 §4.6 — the AUTHORITATIVE count for the 40-layer render
   *  budget: hand-authored (non-hidden) scene layers + template-emitted
   *  layers + one caption text-layer per cue (when burn-in is off) + one
   *  audio layer per referenced audio asset/event — mirroring EXACTLY what
   *  `videoProjectCompiler.ts`'s `compileVideoProject` sums against its own
   *  `MAX_LAYERS_PER_CONFIG` (§3.5/§4.6 of the spec: "there are four
   *  different layer counts in the codebase today and only one is
   *  correct"). Any caller comparing against the 40-layer budget (the
   *  repair applier's `MAX_TOTAL_LAYERS` check, the layer-budget meter, the
   *  stage-estimate forecast) MUST use this field, never `total`. Template
   *  layer counts are a best-effort dry-build estimate (mirrors
   *  `videoProjectScenePlanner.ts`'s `estimateSceneLayerCount`): an
   *  unknown/invalid template on an existing scene contributes 0 rather than
   *  throwing, since this must stay a non-throwing fact path (§4.6's "the
   *  meter must not depend on a throwing call" — brand locks throw inside a
   *  real compile, this function never calls the real compiler). */
  compiledTotal: number;
}

/** Placeholder URL fed to a template's `build()` only to COUNT the layers it
 *  would emit — never resolved, never sent anywhere. Mirrors
 *  `videoProjectScenePlanner.ts`'s `DRY_COMPILE_PLACEHOLDER_URL` convention;
 *  duplicated as a literal (not imported) to keep this module's dependency
 *  surface limited to read-only template metadata, not the planner's own
 *  types. */
const DRY_LAYER_COUNT_PLACEHOLDER_URL = "https://dry-layer-count.invalid/placeholder";

function makeDryTemplateBuildContextForCounting(
  format: VideoProjectDocument["format"],
): TemplateBuildContext {
  return {
    format,
    brandKit: null,
    assetResolver: {
      url: () => DRY_LAYER_COUNT_PLACEHOLDER_URL,
      sha256: () => undefined,
    },
  };
}

/** Best-effort count of the layers `scene.visual`'s template would emit at
 *  compile time. 0 for a `"layers"`-kind scene (no template), an unknown
 *  templateId, or params that fail that template's own schema — this is a
 *  non-throwing estimate, not the authoritative dry-compile gate (that stays
 *  `videoProjectScenePlanner.ts`'s `assertLayerBudgetOrThrow`, a full
 *  `compileVideoProject` call). */
function estimateTemplateLayerCount(scene: Scene, document: VideoProjectDocument): number {
  if (scene.visual.kind !== "template") return 0;
  const template = (MOTION_TEMPLATE_REGISTRY as Record<string, MotionTemplate>)[scene.visual.templateId];
  if (!template) return 0;
  try {
    const params = template.paramsSchema.parse(scene.visual.params) as Record<string, unknown>;
    return template.build(params, makeDryTemplateBuildContextForCounting(document.format)).length;
  } catch {
    return 0;
  }
}

/** One layer per referenced audio asset (`narration`/`music`) or per `sfx`
 *  event — mirrors `videoProjectCompiler.ts`'s `buildAudioTrackLayers` and
 *  `videoProjectScenePlanner.ts`'s `countAudioTrackLayers`. */
function estimateAudioTrackLayerCount(document: VideoProjectDocument): number {
  let count = 0;
  for (const track of document.audioTracks) {
    count += track.kind === "sfx" ? track.events.length : track.assetRefs.length;
  }
  return count;
}

/** See `LayerCountMetric.compiledTotal`'s doc comment — this is the
 *  authoritative 40-layer-budget number. */
function computeCompiledLayerTotal(document: VideoProjectDocument): number {
  let total = 0;
  for (const scene of document.scenes) {
    total += scene.layers.filter(layer => !layer.hidden).length;
    total += estimateTemplateLayerCount(scene, document);
    if (!document.captions.burnIn) {
      total += scene.captionCues.length;
    }
  }
  total += estimateAudioTrackLayerCount(document);
  return total;
}

/** Layer counts per scene + total (feeds render-clutter + 40-layer awareness).
 *  `perScene`/`total` exclude `hidden` layers (Feature 143 §4.8: a hidden
 *  layer never reaches the compiled output, so it must never count here
 *  either). See `compiledTotal` for the number a 40-layer budget check must
 *  actually use. */
export function computeLayerCounts(document: VideoProjectDocument): LayerCountMetric {
  const perScene = document.scenes.map((scene) => ({
    sceneId: scene.sceneId,
    layerCount: scene.layers.filter(layer => !layer.hidden).length,
  }));
  const total = perScene.reduce((sum, entry) => sum + entry.layerCount, 0);
  const maxLayersPerScene = perScene.reduce((max, entry) => Math.max(max, entry.layerCount), 0);
  return { perScene, total, maxLayersPerScene, compiledTotal: computeCompiledLayerTotal(document) };
}

/* -------------------------------------------------------------------------- */
/* Layer budget breakdown by source (§4.6, spec 143)                         */
/* -------------------------------------------------------------------------- */

export interface LayerBudgetBreakdown {
  /** Hand-authored, non-`hidden` `scene.layers[]` entries — same number as
   *  `LayerCountMetric.total`. */
  handAuthoredLayers: number;
  /** Best-effort dry-build estimate of layers each scene's `visual.kind ===
   *  "template"` would emit — same non-throwing estimate `compiledTotal`
   *  uses (0 for an unknown/invalid template rather than throwing). */
  templateLayers: number;
  /** One layer per caption cue, only counted when `captions.burnIn` is off
   *  (burnt-in captions are baked into the template/video layer, not a
   *  separate layer). */
  captionLayers: number;
  /** One layer per referenced audio asset/event across `audioTracks`. */
  audioLayers: number;
  /** `hidden` `scene.layers[]` entries — informational only; NEVER counted
   *  toward `compiledTotal` (Feature 143 §4.8: a hidden layer never reaches
   *  the compiled output). */
  hiddenLayers: number;
  /** `handAuthoredLayers + templateLayers + captionLayers + audioLayers` —
   *  identical to `LayerCountMetric.compiledTotal`; the authoritative
   *  40-layer render-budget number. */
  compiledTotal: number;
  /** 40 — `videoProjectScenePlanner.ts`'s `MAX_RENDERABLE_LAYERS`. */
  max: number;
}

/**
 * Feature 143 §4.6 — layer-budget breakdown by source, for the timeline's
 * layer-budget meter. Deliberately built on the SAME non-throwing,
 * dry-estimate helpers `computeLayerCounts`/`compiledTotal` already use
 * (`estimateTemplateLayerCount`, `estimateAudioTrackLayerCount`) rather than
 * a real `compileVideoProject` call — the meter must keep rendering a
 * number even when brand-lock enforcement would make an actual compile
 * throw `BrandLockViolationError` (§4.6: "the meter must not depend on a
 * throwing call").
 */
export function computeLayerBudgetBreakdown(document: VideoProjectDocument): LayerBudgetBreakdown {
  let handAuthoredLayers = 0;
  let hiddenLayers = 0;
  let templateLayers = 0;
  let captionLayers = 0;

  for (const scene of document.scenes) {
    for (const layer of scene.layers) {
      if (layer.hidden) hiddenLayers += 1;
      else handAuthoredLayers += 1;
    }
    templateLayers += estimateTemplateLayerCount(scene, document);
    if (!document.captions.burnIn) {
      captionLayers += scene.captionCues.length;
    }
  }
  const audioLayers = estimateAudioTrackLayerCount(document);
  const compiledTotal = handAuthoredLayers + templateLayers + captionLayers + audioLayers;

  return {
    handAuthoredLayers,
    templateLayers,
    captionLayers,
    audioLayers,
    hiddenLayers,
    compiledTotal,
    max: MAX_RENDERABLE_LAYERS,
  };
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

/** The safe rectangle (0..100 percent-of-canvas, same units as
 *  `RemotionLayerBaseSchema`'s `x/y/width/height`) a layer's bounding box
 *  should stay within for `platformPreset`. Exported (Feature 142,
 *  section-06 gap-1) so the repair applier's `layout` handler clamps layer
 *  boxes against the EXACT SAME rectangle `computeSafeAreaViolations` checks
 *  them against below — the metric and the fix must agree on one definition
 *  or the QA loop would oscillate (flag -> "fix" -> still flagged). */
export function computeSafeAreaRect(platformPreset: PlatformPreset): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  const insets = PLATFORM_SAFE_AREA_INSETS[platformPreset];
  return {
    left: insets.left,
    top: insets.top,
    right: 100 - insets.right,
    bottom: 100 - insets.bottom,
  };
}

/** True for a layer that spans the whole 0..100 percent canvas on both axes
 *  — a full-bleed background, regardless of whether `role` was set. Feature
 *  143 §4.9.1: template-emitted and hand-authored full-bleed layers alike
 *  must never be flagged, even without the `role` metadata. */
function isFullBleedGeometry(layer: { x: number; y: number; width: number; height: number }): boolean {
  return layer.x === 0 && layer.y === 0 && layer.width === 100 && layer.height === 100;
}

/** Safe-area bounding-box checks: which layers fall outside the
 *  platformPreset safe area (x/y/width/height are 0..100 percent —
 *  section-01 A1). Audio layers are skipped — their box has no visual
 *  render effect (`RemotionAudioLayerSchema`'s doc comment).
 *
 *  Feature 143 §4.9.1 (P0, silent-data-loss fix): a layer with
 *  `role === "background"`, or ANY full-bleed layer (`x0 y0 w100 h100`)
 *  regardless of `role`, is EXEMPT. Without this, a full-bleed background —
 *  which by definition always crosses every platform's safe-area inset — is
 *  *always* flagged, and `applyLayoutHandler` (the repair applier) would
 *  clamp it into an inset box on the very first QA round, deforming the
 *  user's hand-placed background. The exemption is unconditional (not
 *  gated on `hidden`/`locked`) because a background is architecturally
 *  exempt from the safe-area concept, not merely protected from automated
 *  edits. */
export function computeSafeAreaViolations(document: VideoProjectDocument): SafeAreaMetric[] {
  const { left: safeLeft, top: safeTop, right: safeRight, bottom: safeBottom } = computeSafeAreaRect(
    document.content.platformPreset,
  );

  const violations: SafeAreaMetric[] = [];
  for (const scene of document.scenes) {
    for (const layer of scene.layers) {
      if (layer.type === "audio") continue;
      if (layer.role === "background") continue;
      if (isFullBleedGeometry(layer)) continue;

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
