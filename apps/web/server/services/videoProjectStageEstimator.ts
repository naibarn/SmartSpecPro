/**
 * Feature 142 — section-04: pure token/credit sizing for the Video
 * Intelligence LLM-backed stages (`scene_plan` | `quality_review` |
 * `quality_repair`). No I/O, no `Date.now()`, no `Math.random()` — deriving
 * the CREDIT number is the caller's job (`calculateCreditsForLLMDynamic`
 * against real model pricing, see `routers/videoProjects.ts`'s
 * `buildStageEstimate`); this module only sizes the token counts that feed
 * that pricing call from the document's REAL content, never a hardcoded
 * constant (spec §6.3).
 */
import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";

export type StageEstimateBasis = {
  sceneCount: number;
  narrationChars: number;
  captionChars: number;
  layerCount: number;
  claimCount: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
};

export type VideoIntelligenceStage = "scene_plan" | "quality_review" | "quality_repair";

/** Ceiling call count for ONE loop round when repairs auto-apply (D1):
 *  1 review + up to 3 LLM-backed repair stages (content, narration, claims)
 *  + 1 re-review. */
export const STAGE_CEILING_CALLS_PER_ROUND = 5;

/**
 * Sizing heuristic ONLY — deliberately conservative (Thai-heavy content
 * tokenises worse than Latin) so a ceiling never under-quotes. This is NOT
 * the credit constant (that always comes from real model pricing) — do not
 * confuse the two.
 */
export const STAGE_TOKEN_CHARS_PER_TOKEN = 3;

/** Fixed allowance (tokens) for the skill body + platform framing text that
 *  is sent on every call regardless of document size. */
const SKILL_BODY_AND_FRAMING_TOKEN_ALLOWANCE = 800;
/** Fixed allowance (tokens) for the computed metrics/claim-validation facts
 *  payload (`videoProjectQualityMetrics.ts` / `validateProjectClaims.ts`
 *  output) sent alongside the document summary. */
const METRICS_AND_CLAIM_VALIDATION_TOKEN_ALLOWANCE = 300;
/** Per-scene structural overhead beyond raw narration/caption text — scene
 *  id, visual/motion facts, layer type list. */
const PER_SCENE_STRUCTURAL_TOKEN_ALLOWANCE = 40;
/** Per-claim structural overhead (claim/source/status fields). */
const PER_CLAIM_STRUCTURAL_TOKEN_ALLOWANCE = 30;

/** `quality_review` output: a scorecard + a variable-length issues array —
 *  scales with scene count, never a flat value. */
const QUALITY_REVIEW_OUTPUT_BASE_TOKENS = 200;
const QUALITY_REVIEW_OUTPUT_TOKENS_PER_SCENE = 60;

/** `scene_plan` output: per-scene template params — scales with scene
 *  count, never a flat value. */
const SCENE_PLAN_OUTPUT_BASE_TOKENS = 150;
const SCENE_PLAN_OUTPUT_TOKENS_PER_SCENE = 120;

/** `quality_repair` output: rewritten narration/caption text — scales with
 *  the narration/caption character totals (the repaired text is roughly the
 *  same length as the source, rounded up for safety). */
const QUALITY_REPAIR_OUTPUT_BASE_TOKENS = 150;
const QUALITY_REPAIR_OUTPUT_CHAR_MULTIPLIER = 1.2;

function charsToTokens(chars: number): number {
  return Math.ceil(chars / STAGE_TOKEN_CHARS_PER_TOKEN);
}

/**
 * PURE. Derives token sizing from the document's REAL content — round up
 * everywhere (over-estimating a ceiling is safe; under-quoting a number the
 * user clicks "confirm" on is the failure mode to avoid).
 */
export function estimateStageTokens(
  document: VideoProjectDocument,
  stage: VideoIntelligenceStage,
): StageEstimateBasis {
  const sceneCount = document.scenes.length;
  let narrationChars = 0;
  let captionChars = 0;
  let layerCount = 0;

  for (const scene of document.scenes) {
    narrationChars += (scene.narration ?? "").length;
    for (const cue of scene.captionCues) {
      captionChars += cue.text.length;
    }
    layerCount += scene.layers.length;
  }

  const claimCount = document.claims.length;

  const rawTextTokens = charsToTokens(narrationChars + captionChars);
  const structuralTokens =
    SKILL_BODY_AND_FRAMING_TOKEN_ALLOWANCE +
    METRICS_AND_CLAIM_VALIDATION_TOKEN_ALLOWANCE +
    sceneCount * PER_SCENE_STRUCTURAL_TOKEN_ALLOWANCE +
    claimCount * PER_CLAIM_STRUCTURAL_TOKEN_ALLOWANCE;
  const estimatedInputTokens = rawTextTokens + structuralTokens;

  let estimatedOutputTokens: number;
  switch (stage) {
    case "scene_plan":
      estimatedOutputTokens =
        SCENE_PLAN_OUTPUT_BASE_TOKENS + sceneCount * SCENE_PLAN_OUTPUT_TOKENS_PER_SCENE;
      break;
    case "quality_repair":
      estimatedOutputTokens =
        QUALITY_REPAIR_OUTPUT_BASE_TOKENS +
        charsToTokens(Math.ceil((narrationChars + captionChars) * QUALITY_REPAIR_OUTPUT_CHAR_MULTIPLIER));
      break;
    case "quality_review":
    default:
      estimatedOutputTokens =
        QUALITY_REVIEW_OUTPUT_BASE_TOKENS + sceneCount * QUALITY_REVIEW_OUTPUT_TOKENS_PER_SCENE;
      break;
  }

  return {
    sceneCount,
    narrationChars,
    captionChars,
    layerCount,
    claimCount,
    estimatedInputTokens,
    estimatedOutputTokens,
  };
}
