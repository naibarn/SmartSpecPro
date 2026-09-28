/**
 * Marketplace Auto Review — Feature 136 (sequential 9-image storyboard),
 * section 13 §3/§4 — cinematic prompt engines, an OPTIONAL style layer.
 *
 * Pure module — no server/db imports, importable from both client (a future
 * section 11 style selector + engine badge) and server (the section 04
 * runner, `productReviewSequentialStoryboardSkillRunner.ts`).
 *
 * `evidence_product` (default) is Feature 136's own Phase F/G wording,
 * unchanged. `cinematic_auto` routes the image side of the style engine by
 * the run's image model family, reusing the exact two Vertical Drama
 * "engine modes" already shipped for VD's own start-frame prompts
 * (`policy_safe_rewrite` for GPT-family image models, `cinematic_narrative`
 * for every other model).
 *
 * G1 risk (implementation-gaps.md) — RESOLVED: VD's own model-family
 * classifier (`shared/verticalDramaSeries/imagePromptModelFamily.ts`) was
 * uncommitted when this module was first written, so it vendored a minimal,
 * independent copy of the classification rule. VD's module has since landed
 * in committed `main` (merge `e1fdfd30e`), so this module now RE-EXPORTS from
 * it directly — one source of truth for both the family classification and
 * the mode -> skill-folder mapping. This module keeps its own public
 * surface (function/type/constant names below) unchanged so no existing
 * Feature 136 caller has to change.
 */
import {
  resolveImagePromptTargetFamily,
  resolveDefaultImagePromptMode,
  VD_IMAGE_PROMPT_MODES,
  VD_IMAGE_PROMPT_MODE_SKILL_FOLDERS,
  type ImagePromptModelFamily,
  type VdImagePromptMode,
} from "../verticalDramaSeries/imagePromptModelFamily";

/** The two start-frame/video prompt style options (spec §3). */
export const MARKETPLACE_START_FRAME_PROMPT_STYLES = [
  "evidence_product",
  "cinematic_auto",
] as const;

export type MarketplaceStartFramePromptStyle =
  (typeof MARKETPLACE_START_FRAME_PROMPT_STYLES)[number];

/** Default preserves today's behavior — nothing changes unless requested (spec §3). */
export const DEFAULT_MARKETPLACE_START_FRAME_PROMPT_STYLE: MarketplaceStartFramePromptStyle =
  "evidence_product";

const MARKETPLACE_START_FRAME_PROMPT_STYLE_SET: ReadonlySet<string> = new Set(
  MARKETPLACE_START_FRAME_PROMPT_STYLES
);

export function isMarketplaceStartFramePromptStyle(
  value: unknown
): value is MarketplaceStartFramePromptStyle {
  return (
    typeof value === "string" &&
    MARKETPLACE_START_FRAME_PROMPT_STYLE_SET.has(value)
  );
}

/**
 * Vertical Drama's two start-frame image-prompt skill "engine modes" — a
 * direct re-export of VD's own `VD_IMAGE_PROMPT_MODES` / `VdImagePromptMode`
 * (see this module's header comment). Kept under this module's original
 * name/type so no existing Feature 136 caller has to change its import.
 */
export const VERTICAL_DRAMA_IMAGE_PROMPT_MODES = VD_IMAGE_PROMPT_MODES;

export type VerticalDramaImagePromptMode = VdImagePromptMode;

/**
 * Re-export of VD's mode -> skill-folder mapping (spec §4 deliverable 1),
 * so both VD's own service and this module's callers (the section 04
 * runner) read the SAME source of truth for which skill folder a mode loads.
 */
export { VD_IMAGE_PROMPT_MODE_SKILL_FOLDERS };

/**
 * Thin wrapper over VD's own `resolveImagePromptTargetFamily` (spec §5
 * family-routing tests): any model id containing `gpt-image`, `gpt-4o-image`,
 * or `dall-e` (case-insensitive, substring match — tolerates provider
 * prefixes like `openai/dall-e-3`) is the "gpt" family; everything else,
 * including an empty/absent model id, is "other". Deliberately FAILS OPEN to
 * "other" (-> `cinematic_narrative`) rather than to "gpt" (->
 * `policy_safe_rewrite`) for any unrecognized model — never silently apply
 * GPT-only policy-safe rewriting to a model that isn't GPT-family. Accepts a
 * plain model-id string (this module's original signature) and adapts it to
 * VD's richer `{ modelId, name, provider, configJson }` source shape.
 */
export function classifyMarketplaceCinematicImagePromptModelFamily(
  imageModel: string | null | undefined
): ImagePromptModelFamily {
  return resolveImagePromptTargetFamily({ modelId: imageModel });
}

/** `gpt` family -> `policy_safe_rewrite`; everything else (incl. unknown/absent) -> `cinematic_narrative`. */
export function resolveVerticalDramaImagePromptModeForImageModel(
  imageModel: string | null | undefined
): VerticalDramaImagePromptMode {
  return resolveDefaultImagePromptMode(
    classifyMarketplaceCinematicImagePromptModelFamily(imageModel)
  );
}

/**
 * Per-shot engine stamps (spec §4 deliverable 4) — `start_frame_prompt_engine`
 * / `video_prompt_engine` on every sequential-storyboard shot, regardless of
 * which `MarketplaceStartFramePromptStyle` the run used (evidence_product
 * runs stamp `"evidence_product"` too, so the UI badge and section-12
 * mode-comparison metrics never need to special-case an absent stamp).
 */
export const SEQUENTIAL_STORYBOARD_START_FRAME_PROMPT_ENGINES = [
  "evidence_product",
  ...VERTICAL_DRAMA_IMAGE_PROMPT_MODES,
] as const;

export type SequentialStoryboardStartFramePromptEngine =
  (typeof SEQUENTIAL_STORYBOARD_START_FRAME_PROMPT_ENGINES)[number];

export const SEQUENTIAL_STORYBOARD_VIDEO_PROMPT_ENGINES = [
  "evidence_product",
  "vertical_drama_shot_video_prompt",
] as const;

export type SequentialStoryboardVideoPromptEngine =
  (typeof SEQUENTIAL_STORYBOARD_VIDEO_PROMPT_ENGINES)[number];
