/**
 * Vertical Drama Series — real start-frame render-plan generation for the
 * `start_frame_render_plan` pipeline stage (spec feature 131 §11.5).
 *
 * Invokes the already-installed `vertical-drama-shot-start-frame-render`
 * skill (`apps/web/skills/vertical-drama-shot-start-frame-render/`) via a
 * direct `executeWithFallback` LLM call — mirrors
 * `verticalDramaStoryboardGeneration.ts`'s (itself mirroring
 * `verticalDramaStoryBible.ts`'s) check-credits -> resolve-model -> call ->
 * validate -> deduct-credits convention exactly.
 *
 * This is a credit-gated LLM *planning* call only — it produces render
 * requests, not rendered images. The actual paid image render stays behind
 * `render_or_import_start_frames` / `verticalDramaProviderRouting.ts`,
 * untouched by this file.
 *
 * `verticalDramaEpisodePipeline.ts`'s `runStage` is the only caller, and only
 * invokes this for non-dry-run/non-plan-only runner modes.
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import { parseSkillFile } from "@smartspec/skills";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "./skillFiles";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "./creditService";
import { mediaGenerationLimiter } from "./rateLimiter";
import { debugError } from "../_core/logger";
import { loadEnabledLlmModelRows } from "./enabledLlmModels";
import { selectBestLlmModel } from "./intelligentModelSelector";
import {
  executeJsonPlanningCallWithRetry,
  executeVisionAwareJsonCallWithRetry,
  type VisionAwareImageInput,
  InsufficientCreditsError,
  VdSchemaValidationError,
  VD_COMPACT_JSON_INSTRUCTION,
} from "./verticalDramaStoryBible";
import { resolveStartFramePlanModel } from "./verticalDramaImproveScript";
import { renderCriteriaVersionMarker } from "./verticalDramaQualityCriteria";
import {
  buildTargetAudienceRegionInstruction,
  type VerticalDramaTargetAudienceRegion,
} from "@shared/verticalDramaSeries/targetAudienceRegion";
import {
  VD_CHARACTER_LOCK_INSTRUCTION,
  CHILD_SAFETY_DIRECTIVE_MARKER,
} from "@shared/verticalDramaSeries/characterLock";
import {
  buildCharacterIdentityMapBlock,
  findCharacterImageIndexMappingMismatches,
  type CharacterImageIndexMappingMismatch,
  type VerticalDramaCharacterDescriptorSource,
} from "@shared/verticalDramaSeries/characterIdentityMap";
// Cinematic image-prompt language directive. The caller resolves the
// independent `startFramePlan.imagePromptLanguage` setting (with the legacy
// fallback documented in `contracts.ts`) before entering this service.
// Mirrors the video generator's exact "resolve default
// -> look up English display name -> append a MANDATORY directive line to
// the user prompt" convention; no skill.md changes.
import {
  VD_IMAGE_PROMPT_MAX,
  type VerticalDramaPromptLanguage,
  VERTICAL_DRAMA_PROMPT_LANGUAGE_ENGLISH_NAMES,
  // Gap-5 fix (recorded, 2026-07-22) — the canonical PERSISTED per-frame
  // shape, used ONLY to type `projectStartFramePlan`'s new
  // `previousFramesByShotNumber` carry-over param (see
  // `VerticalDramaStartFramePlanFrame` below) — the caller passes REAL
  // persisted frames (which can carry any of that type's fields), not just
  // this file's own narrower `StartFrameRenderPlanProjection` shape.
  type VerticalDramaStartFramePlan,
} from "@shared/verticalDramaSeries/contracts";
// Preset visual identity flow-through (spec §8.2.2 flow-through rule,
// section-15 change D, Wave-4A completing the "start frames" leg of the
// rule — character refs were already wired by
// `verticalDramaCharacterImageGeneration.ts`). Type-only import here (pure/
// shared) — the two fragment-merge functions below are pure and take the
// identity object directly, so this file never needs the router's bible-
// reading logic.
import type { VerticalDramaPresetVisualIdentity } from "@shared/verticalDramaSeries/presetVisualIdentity";
// Two-mode start-frame image prompt switch
// (`planning/vd-start-frame-prompt-modes/plan.md`) — pure/shared family
// resolver + skill-folder map + persisted stamp type, mirroring how
// `videoPromptModelFamily.ts` is consumed by the video-prompt-pack sibling
// generator.
import {
  type ImagePromptModelFamily,
  type VdImagePromptMode,
  type VdImagePromptModeStamp,
  VD_IMAGE_PROMPT_MODE_SKILL_FOLDERS,
} from "@shared/verticalDramaSeries/imagePromptModelFamily";

// Re-exported so callers only need to import from this one module.
export { InsufficientCreditsError, VdSchemaValidationError };

/**
 * Thrown when the per-user `mediaGenerationLimiter` rejects a start-frame
 * render-plan generation call. `verticalDramaEpisodePipeline.ts`'s
 * `mapStartFrameGenerationError` does not special-case this (by design — we
 * do not touch that file here); it falls through to that mapper's generic
 * `VD_START_FRAME_PLAN_GENERATION_FAILED` / `repairable: true` branch, which
 * is an accurate, safe classification for a transient rate-limit condition
 * (the caller can simply retry the stage later).
 */
export class RateLimitExceededError extends Error {
  code = "VD_RATE_LIMIT_EXCEEDED" as const;
  constructor(retryAfterMs: number) {
    super(
      `Rate limit exceeded for start-frame render plan generation. Try again in ${Math.ceil(retryAfterMs / 1000)} seconds.`,
    );
    this.name = "RateLimitExceededError";
  }
}

/**
 * Thrown by `generateStartFrameShotPrompt` (`planning/
 * vd-start-frame-reference-mapping/plan.md` Phase 2, 2026-07-16) when the
 * skill's authored prompt still contains an EXPLICIT "Image N ↔ character
 * name" claim that contradicts `characterReferenceManifest` after one
 * deterministic corrective retry — see `findCharacterImageIndexMappingMismatches`'s
 * doc comment for exactly what counts as a contradiction. Mirrors
 * `VdSchemaValidationError`'s style (a `code`, plus the raw mismatches for
 * callers/logs that want the detail). The router's `generateShotStartFramePrompt`
 * catches this and maps it to a `PRECONDITION_FAILED` with a Thai
 * instruction to regenerate the shot's prompt — a contradictory prompt is
 * NEVER persisted onto `startFramePlan.frames[]`.
 */
export class VdReferenceMappingError extends Error {
  code = "VD_REFERENCE_MAPPING_MISMATCH" as const;
  constructor(
    message: string,
    public mismatches: CharacterImageIndexMappingMismatch[],
  ) {
    super(message);
    this.name = "VdReferenceMappingError";
  }
}

/** `Image N = name` formatting for one reference, sorted by index — used to state the REQUIRED mapping in a corrective retry instruction. */
function formatReferenceMappingLine(
  references: readonly { imageIndex: number; characterName: string }[],
): string {
  return references
    .slice()
    .sort((a, b) => a.imageIndex - b.imageIndex)
    .map((r) => `Image ${r.imageIndex} = ${r.characterName}`)
    .join("; ");
}

/** Human-readable summary of detected contradictions, for a corrective retry instruction. */
function formatMappingMismatchSummary(
  mismatches: readonly CharacterImageIndexMappingMismatch[],
): string {
  return mismatches
    .map(
      (m) =>
        `"${m.characterName}" was claimed at Image ${m.claimedImageIndex} but must be Image ${m.expectedImageIndex}`,
    )
    .join("; ");
}

/**
 * Deterministic corrective addition appended to a single-shot user prompt on
 * a reference-mapping retry — states the REQUIRED mapping and exactly what
 * was wrong, so the retry is a targeted fix rather than a blind
 * regeneration.
 */
function buildReferenceMappingCorrectiveInstruction(
  references: readonly { imageIndex: number; characterName: string }[],
  mismatches: readonly CharacterImageIndexMappingMismatch[],
): string {
  return [
    `REFERENCE MAPPING CORRECTION (MANDATORY): the previous attempt stated a wrong character-to-image mapping (${formatMappingMismatchSummary(mismatches)}).`,
    `The REQUIRED mapping is: ${formatReferenceMappingLine(references)}.`,
    `State this mapping ONCE, exactly as given, and do not restate a different mapping anywhere else in the prompt.`,
  ].join("\n");
}

const SKILL_FOLDER_PATH = path.join("skills", "vertical-drama-shot-start-frame-render");

let cachedSystemPrompt: string | null = null;

/**
 * Read the `vertical-drama-shot-start-frame-render` skill's markdown body
 * (everything after the YAML frontmatter) verbatim, to use as the LLM system
 * prompt. Resolves the skill folder the same way `skillRegistry.ts` does.
 */
function loadSkillSystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;

  for (const dir of resolveSkillDirCandidates(SKILL_FOLDER_PATH)) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (manifestPath && fs.existsSync(manifestPath)) {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      const { content } = parseSkillFile(raw);
      if (content && content.trim().length > 0) {
        cachedSystemPrompt = content;
        return cachedSystemPrompt;
      }
    }
  }

  throw new Error(
    `Could not locate skill.md for "vertical-drama-shot-start-frame-render" under any known skills directory`,
  );
}

/* -------------------------------------------------------------------------- */
/* Output schema — validates + narrows to the `VerticalDramaStartFramePlan`    */
/* shape expected by the pipeline's `start_frame_render_plan` stage payload    */
/* (`@shared/verticalDramaSeries` `contracts.ts`).                             */
/* -------------------------------------------------------------------------- */

/**
 * Preserve upstream snake_case fields exactly (no camelCase translation) —
 * the skill's own instructions require this. `.passthrough()` everywhere so
 * optional upstream fields survive even though only the required subset is
 * strictly validated here.
 */
const startFrameRequestSchema = z
  .object({
    shot_number: z.number().int(),
    prompt: z.string().min(1),
    negative_prompt: z.string().optional().default(""),
    reference_assets: z
      .array(
        z
          .object({
            character_id: z.string().optional(),
            asset_id: z.string().optional(),
          })
          .passthrough(),
      )
      .optional()
      .default([]),
  })
  .passthrough();

export const startFrameRenderPlanOutputSchema = z
  .object({
    contract_version: z.literal(1).optional(),
    render_plan_summary: z.object({}).passthrough(),
    start_frame_requests: z.array(startFrameRequestSchema).length(9),
    plain_text_render_plan: z.string().min(1),
    downstream_video_input_manifest: z.object({}).passthrough(),
    quality_control: z.object({}).passthrough().optional(),
  })
  .passthrough();

export type StartFrameRenderPlanOutput = z.infer<typeof startFrameRenderPlanOutputSchema>;

/**
 * The canonical PERSISTED per-frame shape (`VerticalDramaStartFramePlan
 * .frames[number]` from `@shared/verticalDramaSeries/contracts`) — exported
 * here purely so `projectStartFramePlan`'s `previousFramesByShotNumber`
 * param (gap-5 fix, recorded 2026-07-22) has a name callers can import
 * without reaching into `contracts.ts`'s array-indexing directly.
 */
export type VerticalDramaStartFramePlanFrame = VerticalDramaStartFramePlan["frames"][number];

/**
 * Typed projection matching `VerticalDramaStartFramePlan` from
 * `@shared/verticalDramaSeries` — this is the shape persisted into
 * `verticalDramaEpisodes.startFramePlan` and used as the stage payload.
 */
export interface StartFrameRenderPlanProjection {
  mode: "single_frame_per_shot" | "contact_sheet_3x3_batch";
  selectedImageModelId: string;
  imagePromptLanguage?: VerticalDramaPromptLanguage;
  frames: Array<{
    shotNumber: number;
    imagePrompt: string;
    negativePrompt: string;
    requiredCharacterRefs: string[];
    productReferenceAssetIds: string[];
    canonicalShotSummary?: string;
    /** See `VerticalDramaStartFramePlan.frames[].productRefsCustomized` in `@shared/verticalDramaSeries`. */
    productRefsCustomized?: boolean;
    /**
     * Gap-5 fix (recorded, 2026-07-22) — these four fields were never
     * settable by this projection before this fix (this type simply didn't
     * declare them), so every plan regeneration silently wiped them even
     * though they are pure per-frame user/durable state this projection has
     * no way to re-derive from the raw skill output on its own. Now
     * settable ONLY via `projectStartFramePlan`'s new
     * `previousFramesByShotNumber` carry-over param — see that function's
     * own doc comment for the full merge contract. Mirror
     * `VerticalDramaStartFramePlan.frames[]`'s identically-named fields in
     * `@shared/verticalDramaSeries/contracts` exactly (same shape) — see
     * those fields' own doc comments for what each one means/how it's set.
     */
    approvedMediaAssetId?: string;
    locationKey?: string;
    angleGrid?: {
      pendingTaskId?: string;
      imageUrl?: string;
      mediaTaskId?: string;
      dismissedIndexes?: number[];
    };
    angleGridAssetIds?: number[];
  }>;
}

/** Project the raw skill output onto the pipeline's typed stage-payload shape. */
export function projectStartFramePlan(
  raw: StartFrameRenderPlanOutput,
  /**
   * The model id to persist as `selectedImageModelId` when the caller
   * already knows which model should be used — this is either (a) the
   * episode's own pre-existing `startFramePlan.selectedImageModelId` set by
   * the user via `setEpisodeModelSelection` (Vertical Drama Storyboard
   * Completion Plan, Phase 1.2 — "honor pre-existing user selection"), or
   * (b) a caller-supplied fallback/default when there is no prior
   * selection. Takes priority over the LLM's own `render_plan_summary
   * .image_model` string in both cases: a user's (or the app's) explicit
   * model choice must never be silently clobbered by whatever model name
   * the LLM happens to mention in its summary — that field is free-text and
   * was never meant to be authoritative for which model actually renders.
   * Only when this argument is falsy AND the LLM provided its own
   * `image_model` string do we fall back to the LLM's claim (keeps the
   * dry-run/tests-without-a-caller-supplied-model path unchanged).
   */
  callerImageModelId: string,
  /**
   * Ground-truth character list per shot, from the (already-generated)
   * storyboard — keyed by shot number. When present, this is trusted over
   * the LLM's own `reference_assets[].character_id` values: this is a
   * SEPARATE LLM call from the one that produced the storyboard, so its
   * freeform `character_id` strings are just as prone to drifting from the
   * real `characterKey` values as the storyboard stage's own output was
   * (see the fix in `verticalDramaEpisodePipeline.ts`'s
   * `generateRealStartFramePlan`). Re-deriving from a second unreliable LLM
   * call instead of the one place we already have a correct list would
   * reintroduce the same bug one stage later.
   */
  shotCharacterIdsByShotNumber?: Map<number, string[]>,
  /** Exact active-Overview shot summary used as the skill's canonical visual beat. */
  canonicalShotSummaryByShotNumber?: Map<number, string>,
  /**
   * Gap-5 fix (recorded, 2026-07-22) — the PRIOR persisted frame state,
   * keyed by shot number, so a plan REGENERATION can carry over per-frame
   * user/durable state this projection has no way to re-derive from the raw
   * skill output: `approvedMediaAssetId` (the durable link to the APPROVED
   * rendered image — costs real money to redo), `locationKey` (a manual
   * per-shot location override), `angleGrid`/`angleGridAssetIds` (durable
   * multi-angle picker state), and `productReferenceAssetIds` +
   * `productRefsCustomized` (needed to satisfy the pipeline's OWN
   * documented contract — `verticalDramaEpisodePipeline.ts`'s
   * `resolveFrameProductReferenceAssetIds` call reads `productRefsCustomized`
   * off the projected frame to decide whether auto-resolution may refill
   * `productReferenceAssetIds`; that flag could never survive a regen
   * before this fix, since this function always hardcoded a fresh
   * `productReferenceAssetIds: []` and never set `productRefsCustomized` at
   * all — so a user's explicit "no product images" choice was silently
   * overwritten on every regen).
   *
   * `canonicalShotSummary` is the ONE field where the PROJECTION's own
   * freshly-resolved value (from `canonicalShotSummaryByShotNumber` above)
   * wins over the carried-over one when it supplies one — the projection's
   * source is the CURRENT Overview-page summary, strictly more up to date
   * than whatever a prior regen happened to capture.
   *
   * Deliberately never carries over `imagePrompt`/`negativePrompt`
   * (replacing them is the whole point of regenerating) or `promptMode`
   * (correct by design — the new prompt comes from THIS legacy batch skill,
   * a different engine than the one that may have stamped the prior
   * `promptMode`, so the engine badge must clear AND the render-time
   * preset-identity append — gated on `!frame.promptMode` — must resume for
   * this frame).
   *
   * Pure/no-IO (same purity contract as the rest of this function) —
   * the caller (`verticalDramaEpisodePipeline.ts`'s
   * `generateRealStartFramePlan`) builds this map from the episode's own
   * pre-existing `startFramePlan.frames` before regenerating.
   * `undefined`/omitted (every caller before this fix) preserves today's
   * projection byte-identically — every `previous?.x` access below is then
   * always `undefined`, so every conditional spread is always empty and
   * `productReferenceAssetIds` falls back to `[]`, exactly as before.
   */
  previousFramesByShotNumber?: Map<number, VerticalDramaStartFramePlanFrame>,
  imagePromptLanguage?: VerticalDramaPromptLanguage,
): StartFrameRenderPlanProjection {
  const summary = raw.render_plan_summary as Record<string, unknown>;
  const selectedImageModelId =
    callerImageModelId ||
    (typeof summary?.image_model === "string" ? (summary.image_model as string) : callerImageModelId);

  return {
    mode: "single_frame_per_shot",
    selectedImageModelId,
    ...(imagePromptLanguage ? { imagePromptLanguage } : {}),
    frames: raw.start_frame_requests
      .slice()
      .sort((a, b) => a.shot_number - b.shot_number)
      .map((r) => {
        const groundTruth = shotCharacterIdsByShotNumber?.get(r.shot_number);
        const requiredCharacterRefs =
          groundTruth && groundTruth.length > 0
            ? groundTruth
            : (r.reference_assets ?? [])
                .map((ref) => ref.character_id)
                .filter((id): id is string => typeof id === "string" && id.length > 0);
        // Gap-5 fix — this shot's PRIOR persisted frame, when the caller
        // supplied one; `undefined` for a shot the prior plan never had
        // (e.g. the new plan has more shots than the old one), which
        // correctly leaves every carry-over field below unset for that
        // shot, same as the no-previous-frames-at-all case.
        const previous = previousFramesByShotNumber?.get(r.shot_number);
        const canonicalShotSummary =
          canonicalShotSummaryByShotNumber?.get(r.shot_number) ?? previous?.canonicalShotSummary;
        // `r.prompt` is now the FINAL text as-authored by the
        // `vertical-drama-shot-start-frame-render` skill — no code-side
        // identity-lock append (vertical-drama-skill-first-architecture
        // plan, Phase 3, item 2: the skill's own "Attached Character
        // Reference Image Indexing" instruction now also states the full
        // identity-lock constraint — face shape, skin tone, hairstyle,
        // clothing/outfit, distinguishing features — for every required
        // character in its own prose, so `formatIdentityLockedImagePrompt`'s
        // post-hoc bracket append is no longer needed here).
        return {
          shotNumber: r.shot_number,
          imagePrompt: r.prompt,
          negativePrompt: r.negative_prompt ?? "",
          requiredCharacterRefs,
          productReferenceAssetIds: previous?.productReferenceAssetIds ?? [],
          ...(canonicalShotSummary ? { canonicalShotSummary } : {}),
          ...(previous?.productRefsCustomized !== undefined
            ? { productRefsCustomized: previous.productRefsCustomized }
            : {}),
          ...(previous?.approvedMediaAssetId !== undefined
            ? { approvedMediaAssetId: previous.approvedMediaAssetId }
            : {}),
          ...(previous?.locationKey !== undefined ? { locationKey: previous.locationKey } : {}),
          ...(previous?.angleGrid !== undefined ? { angleGrid: previous.angleGrid } : {}),
          ...(previous?.angleGridAssetIds !== undefined
            ? { angleGridAssetIds: previous.angleGridAssetIds }
            : {}),
          // promptMode is DELIBERATELY never carried over — see this
          // function's own param doc comment above.
        };
      }),
  };
}


/* -------------------------------------------------------------------------- */
/* Prompt building                                                            */
/* -------------------------------------------------------------------------- */

export interface GenerateStartFrameRenderPlanParams {
  userId: number;
  tenantId?: string;
  seriesId: number;
  episodeId: number;
  episodeTitle: string;
  durationSeconds: number;
  selectedImageModelId?: string;
  storyboardShots: Array<{
    shotNumber: number;
    description: string;
    cameraSetup: string;
    characterIds: string[];
    durationSeconds: number;
    /** Active Overview shot summary; the skill must prefer it over stale storyboard prose. */
    canonicalShotSummary?: string;
    /**
     * Phase 1 of `planning/polished-toasting-gadget.md` (location visual
     * bible) — this shot's location/setting fact, resolved by
     * `verticalDramaEpisodePipeline.ts`'s `generateRealStartFramePlan` from
     * the storyboard's own `distinct_locations[]` group. `hasReferenceImage`
     * is hardcoded `false` everywhere in Phase 1 (no location roster/image
     * system exists yet — that's Phase 2). Optional — omitted for any shot
     * with no matching `distinct_locations` group (flag off, or a
     * storyboard generated before this feature existed), in which case
     * `buildStartFrameRenderPlanUserPrompt` renders that shot's line exactly
     * as before this field existed (byte-identical regression guard).
     */
    location?: { name: string; description: string; hasReferenceImage: boolean };
    /**
     * Speaker-order composition fix — this shot's dialogue speakers, in
     * delivery order, deduped to first appearance (e.g. `["ฝ้าย",
     * "ใบข้าว"]`), resolved by the caller from the SAME dialogue source the
     * video path uses (`resolveShotDialogueLines()` in
     * `verticalDramaEpisodes.ts`) — see that router's `generateRealStartFramePlan`
     * doc comment for exactly which source this reads at batch-generation
     * time (the storyboard/start-frame stage runs BEFORE
     * `dialogue_audio_plan`/`video_motion_prompt_pack` exist, so the deep-
     * drafted shot's own `dialogue_lines[]` — the Overview page's canonical
     * source — is the only reliable source available here). Threaded to the
     * skill as a `speaking_order:` fact so it can position the first speaker
     * leftmost (see `vertical-drama-shot-start-frame-render/skill.md`'s new
     * "Speaker order positioning" rule). Optional — omitted for any shot
     * with no resolvable dialogue (silent/solo shot, or dialogue not
     * drafted yet), in which case `buildStartFrameRenderPlanUserPrompt`
     * renders that shot's line exactly as before this field existed
     * (byte-identical regression guard — same convention as `location`
     * immediately above).
     */
    speakingOrder?: string[];
  }>;
  /**
   * Series-level default region/ethnicity look for every rendered person
   * (see `@shared/verticalDramaSeries/targetAudienceRegion.ts`). Optional —
   * omitted/undefined normalizes to the shared default ("thai"). Each
   * character's own visual-bible `description` (already baked into the
   * character reference images these start frames attach) always takes
   * precedence over this series-level default.
   */
  targetAudienceRegion?: VerticalDramaTargetAudienceRegion;
  /**
   * The language the image PROMPT TEXT ITSELF (every shot's `prompt` /
   * `negative_prompt`) must be written in — the SAME episode-level language
   * plan field the video-prompt path already reads
   * (`motionPromptPack.promptLanguage`), shared rather than duplicated. See
   * `VerticalDramaPromptLanguage` in `@shared/verticalDramaSeries/contracts`.
   * Defaults to `"en"` when absent, matching the video path's own
   * `params.promptLanguage ?? "en"` convention exactly.
   */
  promptLanguage?: VerticalDramaPromptLanguage;
  /**
   * Series character rows (2026-07-07 non-human-character-vanishing fix) —
   * used to build a compact "key = name (role): descriptor" map so the
   * planning LLM knows each required character's real identity (including
   * species/age) instead of just a bare `characterKey`. See
   * `@shared/verticalDramaSeries/characterIdentityMap.ts`'s doc comment for
   * the full bug report (เจ้าเกลือ, a cat mascot, silently rendered as a
   * generic human figure because the prompt only ever said
   * `character-8`). Optional — omitted/empty falls back to the prior
   * bare-key behavior.
   */
  characters?: VerticalDramaCharacterDescriptorSource[];
  /**
   * Part B2 (planning/`polished-toasting-gadget.md`) — compact episode
   * scene-setting plan context (ชื่อตอน/เรื่องย่อ/จุดดำเนินเรื่อง/จุดค้าง),
   * built via `formatStoryScriptEpisodePlanContext`. Reference-only: keeps
   * the rendered start-frame prompts consistent with the episode's planned
   * scene/time/lighting/costume/props (esp. the improve-script flow's
   * enriched, scene-setting logline) WITHOUT being copied verbatim into any
   * shot's own `prompt`. Optional — omitted when the series bible has no
   * matching active breakdown item for this episode yet.
   */
  episodePlanContext?: string;
  /**
   * Gap-5 fix (recorded, 2026-07-22) — threaded straight through to
   * `projectStartFramePlan`'s identically-named param; see that function's
   * own doc comment for the full carry-over contract. The caller
   * (`verticalDramaEpisodePipeline.ts`'s `generateRealStartFramePlan`)
   * builds this from the episode's own PRE-regen `startFramePlan.frames`.
   * Optional/omitted (every caller before this fix) preserves today's
   * byte-identical projection.
   */
  previousFramesByShotNumber?: Map<number, VerticalDramaStartFramePlanFrame>;
}

/**
 * Single-subject / isolating shot-size tokens that CANNOT physically frame
 * 2+ people. Matched case-insensitively against a `_`/`-`/space-normalized
 * form of each comma-separated `cameraSetup` token (so
 * `"Extreme Close-Up"`, `"extreme_close_up"`, and `"EXTREME-CLOSE-UP"` all
 * match the same set entry). Keys here are the ALREADY-normalized form
 * (lowercased, `_`/`-`/whitespace stripped) — see `normalizeShotSizeToken`.
 */
const SINGLE_SUBJECT_SHOT_SIZE_TOKENS = new Set([
  "extremecloseup",
  "extremecloseupshot",
  "closeup",
  "closeupshot",
  "bigcloseup",
  "tightcloseup",
  "macro",
  "ecu",
  "cu",
  "choker",
]);

function normalizeShotSizeToken(token: string): string {
  return token.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

/**
 * The single widened multi-character framing token for N required
 * characters — the shared decision `remapCameraSetupForRequiredCharacters`
 * (batch render-plan camera-token remap, below) and
 * `buildStartFrameShotPromptUserPrompt`'s `framing_override` fact (per-shot
 * regen path — see that builder's doc comment; it has no `cameraSetup`
 * string to remap, so it emits this same token directly instead) both widen
 * to, kept in one place so neither path can silently drift out of sync with
 * the other. Callers must gate on `requiredCharacterCount >= 2` themselves —
 * this function does not validate that precondition.
 */
function widenedMultiCharacterFramingToken(requiredCharacterCount: number): string {
  return requiredCharacterCount >= 3 ? "medium_group_shot" : "medium_two_shot";
}

/**
 * Multi-character close-up conflict fix (root cause of "2 characters listed
 * but the image renders only one person" — see this file's own doc comment
 * at the top and `requiredCharactersSuffix` below). A close-up/extreme-
 * close-up physically cannot contain 2+ people in frame; previously the raw
 * `cameraSetup` string (e.g. `"extreme_close_up, high_angle, fast_push_in"`)
 * was interpolated verbatim into the planning prompt, leaving the
 * "extreme_close_up + 2 characters" conflict entirely to best-effort LLM
 * prose. This function deterministically widens ONLY the isolating
 * shot-size token — angle/movement tokens and everything else in
 * `cameraSetup` (delimiter/spacing style included) are left untouched.
 *
 * `cameraSetup` is a comma-joined string with the shot-size token first (see
 * `verticalDramaEpisodePipeline.ts:2904-2910`), e.g. for a 2-character shot:
 * `"extreme_close_up, high_angle, fast_push_in"` ->
 * `"medium_two_shot, high_angle, fast_push_in"`.
 *
 * Pure and byte-identical when `requiredCharacterCount < 2` (returns the
 * input unchanged) or when no single-subject token is present (e.g. already
 * `"medium"`/`"wide"` — also returned unchanged).
 */
export function remapCameraSetupForRequiredCharacters(
  cameraSetup: string,
  requiredCharacterCount: number,
): string {
  if (requiredCharacterCount < 2) return cameraSetup;
  const widened = widenedMultiCharacterFramingToken(requiredCharacterCount);
  let replaced = false;
  const remapped = cameraSetup
    .split(",")
    .map((rawToken) => {
      if (replaced) return rawToken;
      if (!SINGLE_SUBJECT_SHOT_SIZE_TOKENS.has(normalizeShotSizeToken(rawToken))) {
        return rawToken;
      }
      replaced = true;
      // Preserve the token's surrounding whitespace so the original
      // delimiter/spacing style (", " vs ",") is untouched.
      const leading = rawToken.match(/^\s*/)?.[0] ?? "";
      const trailing = rawToken.match(/\s*$/)?.[0] ?? "";
      return `${leading}${widened}${trailing}`;
    })
    .join(",");
  return replaced ? remapped : cameraSetup;
}

export function buildStartFrameRenderPlanUserPrompt(params: GenerateStartFrameRenderPlanParams): string {
  const promptLanguage = params.promptLanguage ?? "en";
  const promptLanguageName = VERTICAL_DRAMA_PROMPT_LANGUAGE_ENGLISH_NAMES[promptLanguage];
  const shotLines = params.storyboardShots
    .map((s) => {
      // Phase 1 of `planning/polished-toasting-gadget.md` (location visual
      // bible) — additive; only appended when this shot carries a
      // `location` fact, so a shot with none produces the exact same line
      // as before this field existed (byte-identical regression guard).
      // Mirrors `verticalDramaStoryboardGeneration.ts`'s own
      // `"[has an approved reference image — identity lock applies]"`
      // conditional-suffix convention for the character-identity case.
      const locationSuffix = s.location
        ? ` | location: ${s.location.name} — ${s.location.description}${
            s.location.hasReferenceImage
              ? " [has an approved reference image — environment lock applies]"
              : ""
          }`
        : "";
      const canonicalSource = s.canonicalShotSummary
        ? ` | CANONICAL SHOT SOURCE (must follow): ${s.canonicalShotSummary}`
        : "";
      // Speaker-order composition fix — additive; only appended when this
      // shot carries a resolved `speakingOrder`, so a shot with none
      // produces the exact same line as before this field existed
      // (byte-identical regression guard). Mirrors `locationSuffix`'s own
      // conditional-suffix convention immediately above.
      const speakingOrderSuffix = s.speakingOrder?.length
        ? ` | speaking_order: ${s.speakingOrder.join(" > ")} (first speaker leftmost)`
        : "";
      // Multi-character frame-inclusion fix — additive; only appended when
      // this shot requires 2+ characters, so a solo/no-character shot
      // produces the exact same line as before this field existed
      // (byte-identical regression guard). Mirrors `speakingOrderSuffix`'s
      // own conditional-suffix convention immediately above. TS emits only
      // the factual required-character count — the creative "must include
      // ALL of them, reinterpret a close-up if needed" rule lives in
      // `vertical-drama-shot-start-frame-render/skill.md`'s new "All
      // required characters must be visible in frame" rule.
      const requiredCharactersSuffix =
        s.characterIds.length >= 2
          ? ` | required_characters: ${s.characterIds.length} (frame must include ALL)`
          : "";
      // Deterministic camera remap (multi-character close-up conflict fix) —
      // when this shot requires 2+ characters, widen an isolating
      // close-up-class shot-size token to a group framing BEFORE it ever
      // reaches the LLM prompt, rather than leaving the conflict to
      // best-effort prose. Byte-identical to the raw `s.cameraSetup` for
      // any shot with < 2 required characters. See
      // `remapCameraSetupForRequiredCharacters`'s doc comment for the full
      // root-cause writeup.
      const remappedCameraSetup = remapCameraSetupForRequiredCharacters(
        s.cameraSetup,
        s.characterIds.length,
      );
      return `- Shot ${s.shotNumber} (${s.durationSeconds}s): ${s.description} | camera: ${remappedCameraSetup} | characters: ${
        s.characterIds.length ? s.characterIds.join(", ") : "(none)"
      }${locationSuffix}${canonicalSource}${speakingOrderSuffix}${requiredCharactersSuffix}`;
    })
    .join("\n");

  const allRequiredCharacterKeys = params.storyboardShots.flatMap((s) => s.characterIds);
  const characterIdentityMapBlock = buildCharacterIdentityMapBlock(
    allRequiredCharacterKeys,
    params.characters ?? [],
  );

  // Part B2 — reference-only episode scene-setting context, near the top of
  // the prompt so the planning LLM reads it before the per-shot list.
  // Explicitly labeled "do not copy verbatim" — it's grounding context, not
  // content to paste into any shot's own `prompt`.
  const episodePlanContextBlock = params.episodePlanContext
    ? `บริบทฉากของตอน (อ้างอิงเพื่อความสอดคล้อง ห้ามคัดลอกลง output):\n${params.episodePlanContext}`
    : null;

  return [
    `Episode title: ${params.episodeTitle}`,
    renderCriteriaVersionMarker(),
    `Episode duration: ${params.durationSeconds} seconds`,
    episodePlanContextBlock,
    params.selectedImageModelId
      ? `Preferred image model: ${params.selectedImageModelId}`
      : null,
    `Storyboard shots (build exactly one start-frame render request per shot, 9 total):\n${shotLines}`,
    characterIdentityMapBlock,
    // The skill's own "Attached Character Reference Image Indexing"
    // instruction (`skill.md`, "Encode emotion into every image prompt")
    // already covers annotating character names with their attached image
    // index AND stating the full identity-lock constraint — no separate
    // code-authored instruction sentence needed here (2026-07-11,
    // vertical-drama-skill-first-architecture plan Phase 3, item 1: this
    // used to duplicate a near-verbatim copy of that skill.md instruction).
    buildTargetAudienceRegionInstruction(params.targetAudienceRegion),
    // Independent image-prompt language — same default/wording convention
    // as `verticalDramaVideoMotionPromptGeneration.ts`'s
    // `buildUserPrompt` (the video pack-level sibling of this builder),
    // reworded for the fields THIS skill actually produces (an image
    // prompt/negative prompt per shot, not a video clip). Always appended
    // (even when `promptLanguage` is absent and defaults to English) —
    // matches the video path's own behavior exactly, not a byte-identical-
    // when-omitted convention.
    `PROMPT LANGUAGE (MANDATORY): write every "start_frame_requests[].prompt" and "negative_prompt" entirely in ${promptLanguageName} — every word of each shot's image prompt text must be in ${promptLanguageName}.`,
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n");
}

/* -------------------------------------------------------------------------- */
/* Generation entry point                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Generate the `start_frame_render_plan` stage's real content via the
 * `vertical-drama-shot-start-frame-render` skill, using a direct
 * `executeWithFallback` LLM call. Credit-gated (throws
 * `InsufficientCreditsError` before calling out) and schema-validated
 * (throws `VdSchemaValidationError` on a malformed LLM response) — mirrors
 * `generateStoryboardShotgrid`'s check-credits -> call -> deduct-credits
 * convention.
 */
/**
 * One shot's reference-mapping contradiction, surfaced to the caller as a
 * non-blocking warning (`planning/vd-start-frame-reference-mapping/plan.md`
 * Phase 2, batch path, 2026-07-16) — mirrors
 * `findMissingCharacterIdentityWarnings`'s existing "warn, never fail the
 * whole 9-shot plan for one shot's phrasing" convention exactly, so
 * `verticalDramaEpisodePipeline.ts` can surface both through the same
 * `stageQcWarnings` channel.
 */
export interface VdReferenceMappingWarning {
  shotNumber: number;
  characterName: string;
  claimedImageIndex: number;
  expectedImageIndex: number;
}

/**
 * Per-shot ground-truth references for the batch reference-mapping
 * validator — `imageIndex` = 1-based POSITION in that shot's own
 * `characterIds` list (the same order `projectStartFramePlan` trusts as
 * `requiredCharacterRefs`, and the same order the real paid render later
 * attaches reference images in), `characterName` resolved via `characters`
 * (characterKey → name). A `characterIds` entry with no matching/named
 * character row is skipped entirely (nothing reliable to validate against
 * for that slot) rather than guessed at.
 */
function buildBatchReferenceMappingReferences(
  storyboardShots: GenerateStartFrameRenderPlanParams["storyboardShots"],
  characters: readonly VerticalDramaCharacterDescriptorSource[],
): Map<number, Array<{ imageIndex: number; characterName: string }>> {
  const nameByCharacterKey = new Map<string, string>();
  for (const character of characters) {
    const name = character.name?.trim();
    if (name) nameByCharacterKey.set(character.characterKey, name);
  }

  const referencesByShotNumber = new Map<
    number,
    Array<{ imageIndex: number; characterName: string }>
  >();
  for (const shot of storyboardShots) {
    const references = shot.characterIds
      .map((characterKey, index) => {
        const characterName = nameByCharacterKey.get(characterKey);
        return characterName ? { imageIndex: index + 1, characterName } : null;
      })
      .filter((r): r is { imageIndex: number; characterName: string } => Boolean(r));
    if (references.length > 0) referencesByShotNumber.set(shot.shotNumber, references);
  }
  return referencesByShotNumber;
}

/** Run the shared validator against every shot request that has resolvable ground-truth references. */
function findBatchReferenceMappingIssues(
  requests: readonly { shot_number: number; prompt: string }[],
  referencesByShotNumber: Map<number, Array<{ imageIndex: number; characterName: string }>>,
): VdReferenceMappingWarning[] {
  const issues: VdReferenceMappingWarning[] = [];
  for (const request of requests) {
    const references = referencesByShotNumber.get(request.shot_number);
    if (!references || references.length === 0) continue;
    const mismatches = findCharacterImageIndexMappingMismatches(request.prompt, references);
    for (const mismatch of mismatches) {
      issues.push({ shotNumber: request.shot_number, ...mismatch });
    }
  }
  return issues;
}

/**
 * Deterministic corrective addition appended to the batch user prompt on a
 * reference-mapping retry — lists every offending shot + its required
 * mapping, so the retry is a targeted per-shot fix rather than a blind
 * regeneration of all 9 shots.
 */
function buildBatchReferenceMappingCorrectiveInstruction(
  issues: readonly VdReferenceMappingWarning[],
): string {
  const issuesByShot = new Map<number, VdReferenceMappingWarning[]>();
  for (const issue of issues) {
    const list = issuesByShot.get(issue.shotNumber) ?? [];
    list.push(issue);
    issuesByShot.set(issue.shotNumber, list);
  }
  const lines = Array.from(issuesByShot.entries())
    .sort(([a], [b]) => a - b)
    .map(
      ([shotNumber, shotIssues]) =>
        `- Shot ${shotNumber}: ${formatMappingMismatchSummary(shotIssues)}`,
    );
  return [
    `REFERENCE MAPPING CORRECTION (MANDATORY): the previous attempt stated a wrong ` +
      `character-to-image mapping on these shots — fix ONLY the mapping claim in each, ` +
      `do not otherwise rewrite the shot:`,
    ...lines,
    `Every shot's "Image N ↔ name" claim must exactly match that shot's own reference-` +
      `image attachment order (index = position in that shot's own "characters:" list) ` +
      `and must be stated ONCE, never restated differently elsewhere in that shot's prompt.`,
  ].join("\n");
}

export async function generateStartFrameRenderPlan(
  params: GenerateStartFrameRenderPlanParams,
): Promise<{
  plan: StartFrameRenderPlanProjection;
  raw: StartFrameRenderPlanOutput;
  creditsUsed: number;
  model: string;
  /** Present only when an EXPLICIT reference-mapping contradiction survives the one corrective retry — see `VdReferenceMappingWarning`'s doc comment. */
  referenceMappingWarnings?: VdReferenceMappingWarning[];
}> {
  // Rate limiting — reuses the shared `mediaGenerationLimiter` (this is a
  // paid LLM call, same per-user cap as `media.ts`'s generation mutations).
  // Checked first, before the credit check / LLM call.
  const rateLimitKey = `user:${params.userId}`;
  if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
    throw new RateLimitExceededError(mediaGenerationLimiter.getResetTime(rateLimitKey));
  }

  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveStartFramePlanModel(params.seriesId);
  const systemPrompt = loadSkillSystemPrompt();
  const userPrompt = buildStartFrameRenderPlanUserPrompt(params);

  // 9 enriched per-shot requests (Phase 3B skill upgrades — micro-expressions,
  // mood lighting, power-dynamic composition — made each shot's prompt much
  // longer) previously truncated the old 4000-token ceiling mid-array. Raised
  // to comfortably fit 9 enriched shots, with one automatic same-model retry
  // (stricter instruction + higher ceiling) on truncated/invalid JSON — see
  // `executeJsonPlanningCallWithRetry`'s doc comment.
  const { data: validatedData, response } = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.7,
    userId: params.userId,
    maxTokens: 16000,
    schema: startFrameRenderPlanOutputSchema,
    label: "Start-frame render plan",
  });

  const usage = response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    model,
  );

  await deductCredits({
    userId: params.userId,
    tenantId: params.tenantId,
    amount: creditsUsed,
    description: `Vertical Drama — generate start-frame render plan (episode #${params.episodeId})`,
    sourceType: "skill",
    metadata: {
      model,
      llmModel: model,
      feature: "vertical_drama_series",
      seriesId: params.seriesId,
      episodeId: params.episodeId,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  });

  // Reference Mapping Validator + one corrective retry, batch path
  // (`planning/vd-start-frame-reference-mapping/plan.md` Phase 2, RC3 fix,
  // 2026-07-16) — validate EVERY shot's own EXPLICIT "Image N ↔ name" claims
  // against that shot's real attachment order (`storyboardShots[].characterIds`
  // position). Unlike the per-shot generator, a single mismatched shot must
  // NOT fail the whole 9-shot batch: issue at most one corrective retry of
  // the ENTIRE call (bounded cost — never more than one extra LLM call per
  // batch), then accept whatever comes back and surface any STILL-mismatched
  // shots as non-blocking `referenceMappingWarnings` (same "warn, don't
  // fail" convention as `findMissingCharacterIdentityWarnings`).
  let planData = validatedData;
  const referencesByShotNumber = buildBatchReferenceMappingReferences(
    params.storyboardShots,
    params.characters ?? [],
  );
  let referenceMappingIssues = findBatchReferenceMappingIssues(
    planData.start_frame_requests,
    referencesByShotNumber,
  );
  if (referenceMappingIssues.length > 0) {
    debugError(
      "vd_start_frame_render_plan",
      `Start-frame render plan (episode #${params.episodeId}): ${referenceMappingIssues.length} ` +
        `shot(s) have a character-to-image mapping that contradicts their own attachment ` +
        `order — retrying the whole plan once with a corrective instruction.`,
      { episodeId: params.episodeId, issues: referenceMappingIssues },
    );
    const correctiveUserPrompt = `${userPrompt}\n\n${buildBatchReferenceMappingCorrectiveInstruction(
      referenceMappingIssues,
    )}`;
    const retry = await executeJsonPlanningCallWithRetry({
      model,
      systemPrompt,
      userPrompt: correctiveUserPrompt,
      temperature: 0.7,
      userId: params.userId,
      maxTokens: 16000,
      schema: startFrameRenderPlanOutputSchema,
      label: "Start-frame render plan (reference-mapping retry)",
    });
    const retryUsage = retry.response.usage;
    const retryCreditsUsed = calculateCreditsForLLM(
      retryUsage?.prompt_tokens ?? 0,
      retryUsage?.completion_tokens ?? 0,
      model,
    );
    await deductCredits({
      userId: params.userId,
      tenantId: params.tenantId,
      amount: retryCreditsUsed,
      description: `Vertical Drama — start-frame render plan reference-mapping retry (episode #${params.episodeId})`,
      sourceType: "skill",
      metadata: {
        model,
        llmModel: model,
        feature: "vertical_drama_series",
        seriesId: params.seriesId,
        episodeId: params.episodeId,
        inputTokens: retryUsage?.prompt_tokens ?? 0,
        outputTokens: retryUsage?.completion_tokens ?? 0,
      },
    });
    planData = retry.data;
    referenceMappingIssues = findBatchReferenceMappingIssues(
      planData.start_frame_requests,
      referencesByShotNumber,
    );
  }

  const shotCharacterIdsByShotNumber = new Map(
    params.storyboardShots.map((s) => [s.shotNumber, s.characterIds]),
  );
  const canonicalShotSummaryByShotNumber = new Map(
    params.storyboardShots
      .filter((s) => Boolean(s.canonicalShotSummary?.trim()))
      .map((s) => [s.shotNumber, s.canonicalShotSummary!.trim()]),
  );
  const plan = projectStartFramePlan(
    planData,
    params.selectedImageModelId ?? "dry-run-image-model",
    shotCharacterIdsByShotNumber,
    canonicalShotSummaryByShotNumber,
    params.previousFramesByShotNumber,
    params.promptLanguage,
  );

  return {
    plan,
    raw: planData,
    creditsUsed,
    model,
    ...(referenceMappingIssues.length > 0
      ? { referenceMappingWarnings: referenceMappingIssues }
      : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* Preset visual identity flow-through (spec §8.2.2 flow-through rule,        */
/* section-15 change D, Wave-4A completing the "start frames" leg of the      */
/* rule — character refs were already wired by                               */
/* `verticalDramaCharacterImageGeneration.ts`; motion prompts are the sibling */
/* leg in `verticalDramaVideoMotionPromptGeneration.ts`).                     */
/*                                                                            */
/* Applied at GENERATION TIME (the router's `generateStartFrameImage`, not    */
/* the render-PLAN LLM call above) — the SAME "deterministic append at the    */
/* actual generation call" convention `verticalDramaProductTieIn.ts`'s        */
/* product-lock functions (`mergeProductLockNegativePrompt`,                  */
/* `appendProductPresenceDirective`) already use, so the fragments are        */
/* guaranteed present on every render (including repairs/retries) regardless  */
/* of what the one-time render-plan LLM call happened to produce for a given  */
/* shot's stored `imagePrompt`. Pure — no DB/LLM — and both are no-ops when   */
/* `identity` is absent (flag off, or the series carries no preset identity). */
/*                                                                            */
/* DEFERRED for vertical-drama-skill-first-architecture plan, Phase 3, item   */
/* 3 (2026-07-11) — NOT converted to skill input, intentionally: these two    */
/* functions have 3 call sites in `server/routers/verticalDramaEpisodes.ts`   */
/* — `generateStartFrameImage`'s softenLevel===0 branch (in scope), PLUS      */
/* `generateStartFrameAngleVariations` and `repairShotImage`, both explicitly */
/* off-limits for this phase (Phase 1 of this same plan, already shipped —   */
/* see that phase's own doc comments in the router). Moving this authorship  */
/* into the planning skill and deleting these functions would leave those 2  */
/* off-limits call sites either broken (function gone) or — if migrated      */
/* halfway by only touching the in-scope call site — silently double-        */
/* appending the SAME fragments (planning-time skill prose + this func) on   */
/* every grid/repair render, since neither append is idempotent. Fixing this */
/* properly requires touching `generateStartFrameAngleVariations`/           */
/* `repairShotImage`, which is out of scope here. Recommend a dedicated      */
/* follow-up phase that revisits Phase 1's grid/repair skill call together   */
/* with this conversion.                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Deterministically append the preset's `imagePromptFragments.positive`
 * tokens onto a start-frame image prompt.
 */
export function appendPresetVisualIdentityFragmentsToImagePrompt(
  imagePrompt: string,
  identity: Pick<VerticalDramaPresetVisualIdentity, "imagePromptFragments"> | undefined,
): string {
  const positive = identity?.imagePromptFragments?.positive ?? [];
  if (positive.length === 0) return imagePrompt;
  return `${imagePrompt}, ${positive.join(", ")}`;
}

/**
 * Merge the preset's `imagePromptFragments.negative` tokens into an existing
 * negative prompt string (never replaces it) — same "merge, never overwrite"
 * convention as `mergeProductLockNegativePrompt`.
 */
export function mergePresetVisualIdentityNegativeFragments(
  negativePrompt: string | undefined,
  identity: Pick<VerticalDramaPresetVisualIdentity, "imagePromptFragments"> | undefined,
): string | undefined {
  const negative = identity?.imagePromptFragments?.negative ?? [];
  if (negative.length === 0) return negativePrompt;
  const fragment = negative.join(", ");
  const existing = negativePrompt?.trim();
  return existing ? `${existing}, ${fragment}` : fragment;
}

/* -------------------------------------------------------------------------- */
/* Single-shot start-frame prompt regeneration ("ให้ AI ปรับ" AI-adjust fix,   */
/* planning/`polished-toasting-gadget.md` Fix A) — per-shot sibling of the     */
/* batch `generateStartFrameRenderPlan` above, mirroring exactly how          */
/* `verticalDramaVideoMotionPromptGeneration.ts` hosts its own batch          */
/* (`generateVideoMotionPromptPack`) and single-shot                          */
/* (`generateVerticalDramaShotVideoPrompt`) generators side by side in one    */
/* file, each with its own skill/cache/output-schema. Invoked ONLY by the     */
/* router's dedicated `generateShotStartFramePrompt` procedure — NEVER by     */
/* `repairStage`/`repairStageOutput` (that dispatcher has no real-LLM branch  */
/* for `start_frame_render_plan` and stays completely untouched by this       */
/* addition; the router mutation bypasses it entirely, same shape as          */
/* `generateShotVideoPrompt` already does for `video_motion_prompt_pack`).    */
/* -------------------------------------------------------------------------- */

const SHOT_START_FRAME_PROMPT_SKILL_FOLDER_PATH = path.join(
  "skills",
  "vertical-drama-shot-start-frame-prompt",
);

let cachedShotStartFramePromptSystemPrompt: string | null = null;

/**
 * Read the `vertical-drama-shot-start-frame-prompt` skill's markdown body
 * verbatim — same resolution strategy as `loadSkillSystemPrompt()` above,
 * kept as a separate cache/function because this is a distinct, focused
 * skill (mirrors `verticalDramaVideoMotionPromptGeneration.ts`'s
 * `loadShotVideoPromptSystemPrompt`, the exact precedent this function pair
 * replicates).
 */
function loadShotStartFramePromptSystemPrompt(): string {
  if (cachedShotStartFramePromptSystemPrompt) return cachedShotStartFramePromptSystemPrompt;

  for (const dir of resolveSkillDirCandidates(SHOT_START_FRAME_PROMPT_SKILL_FOLDER_PATH)) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (manifestPath && fs.existsSync(manifestPath)) {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      const { content } = parseSkillFile(raw);
      if (content && content.trim().length > 0) {
        cachedShotStartFramePromptSystemPrompt = content;
        return cachedShotStartFramePromptSystemPrompt;
      }
    }
  }

  throw new Error(
    `Could not locate skill.md for "vertical-drama-shot-start-frame-prompt" under any known skills directory`,
  );
}

/* -------------------------------------------------------------------------- */
/* Two-mode start-frame image prompt switch                                   */
/* (`planning/vd-start-frame-prompt-modes/plan.md`) — two NEW skill loaders,   */
/* next to the legacy one above, each resolving its folder name via the       */
/* single-source-of-truth `VD_IMAGE_PROMPT_MODE_SKILL_FOLDERS` map so the      */
/* loader and the real-file gate test can never silently drift apart. The     */
/* pre-existing `vertical-drama-shot-start-frame-prompt` skill (loaded above)  */
/* remains the legacy engine for every caller that never resolves a mode      */
/* (`generateShotReferenceFramePrompt`'s supplementary reference frames, and   */
/* any pre-existing caller of `generateStartFrameShotPrompt` that predates     */
/* this feature) — see `selectShotStartFramePromptSystemPrompt` below for the  */
/* single dispatch point between all three.                                   */
/* -------------------------------------------------------------------------- */

let cachedPolicySafeRewriteSystemPrompt: string | null = null;

/** Read the `vertical-drama-shot-synopsis-image-prompt` skill's markdown body verbatim (mode `policy_safe_rewrite`). */
function loadPolicySafeRewriteSystemPrompt(): string {
  if (cachedPolicySafeRewriteSystemPrompt) return cachedPolicySafeRewriteSystemPrompt;

  const folder = VD_IMAGE_PROMPT_MODE_SKILL_FOLDERS.policy_safe_rewrite;
  for (const dir of resolveSkillDirCandidates(path.join("skills", folder))) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (manifestPath && fs.existsSync(manifestPath)) {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      const { content } = parseSkillFile(raw);
      if (content && content.trim().length > 0) {
        cachedPolicySafeRewriteSystemPrompt = content;
        return cachedPolicySafeRewriteSystemPrompt;
      }
    }
  }

  throw new Error(`Could not locate skill.md for "${folder}" under any known skills directory`);
}

let cachedCinematicNarrativeSystemPrompt: string | null = null;

/** Read the `vertical-drama-cinematic-narrative-image-prompt` skill's markdown body verbatim (mode `cinematic_narrative`). */
function loadCinematicNarrativeSystemPrompt(): string {
  if (cachedCinematicNarrativeSystemPrompt) return cachedCinematicNarrativeSystemPrompt;

  const folder = VD_IMAGE_PROMPT_MODE_SKILL_FOLDERS.cinematic_narrative;
  for (const dir of resolveSkillDirCandidates(path.join("skills", folder))) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (manifestPath && fs.existsSync(manifestPath)) {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      const { content } = parseSkillFile(raw);
      if (content && content.trim().length > 0) {
        cachedCinematicNarrativeSystemPrompt = content;
        return cachedCinematicNarrativeSystemPrompt;
      }
    }
  }

  throw new Error(`Could not locate skill.md for "${folder}" under any known skills directory`);
}

/**
 * Single dispatch point choosing which skill authors a shot's start-frame
 * prompt: `referenceFrameMode: true` ALWAYS forces the legacy skill
 * regardless of `imagePromptMode` (Phase 6a's supplementary reference frames
 * are an unrelated feature that predates the mode switch and must stay on
 * its established engine); an absent `imagePromptMode` also falls back to
 * the legacy skill (byte-identical behavior for any caller that never
 * resolves a mode). Otherwise loads the mode's own skill.
 */
function selectShotStartFramePromptSystemPrompt(params: {
  imagePromptMode?: VdImagePromptMode;
  referenceFrameMode?: boolean;
}): string {
  if (params.referenceFrameMode || !params.imagePromptMode) {
    return loadShotStartFramePromptSystemPrompt();
  }
  return params.imagePromptMode === "policy_safe_rewrite"
    ? loadPolicySafeRewriteSystemPrompt()
    : loadCinematicNarrativeSystemPrompt();
}

/**
 * Single-frame output schema — deliberately NOT `.length(9)` / no
 * `start_frame_requests[]` array, so this can never be confused with
 * `startFrameRenderPlanOutputSchema` above.
 *
 * The extra fields below (`safety_adjustments`, `analysis_summary`,
 * `continuity_notes`, `video_readiness_notes`, `quality_score`,
 * `quality_flags`) are the two NEW modes' director's-notes output —
 * `policy_safe_rewrite` returns `safety_adjustments` at the top level;
 * `cinematic_narrative` returns the rest, nested under `analysis_summary`
 * for its own `safety_adjustments`. Every extra is display/audit only, NEVER
 * required by the renderer or the reference-mapping validator, and each is
 * wrapped in `.catch(undefined)` (VD weak-model JSON failure class): a
 * malformed shape for ONE extra degrades that one field to "absent" instead
 * of failing the WHOLE response — `prompt`/`negative_prompt` (the fields the
 * renderer and every pre-existing caller depend on) must never be blocked by
 * a model that got a display-only field wrong. Legacy calls (no mode) never
 * populate any of these — absent, matching today's behavior exactly.
 *
 * Every array extra is typed `z.array(z.unknown())` (NOT `z.array(z.string())`)
 * so a SINGLE wrong-typed element (e.g. a model returning `42` inside
 * `safety_adjustments`) never sinks the WHOLE array via `.catch()` — the
 * per-element `typeof === "string"` filter lives downstream in
 * `normalizeImagePromptStringArrayExtra`, which already tolerates this.
 */
const startFrameShotPromptAnalysisSummarySchema = z
  .object({
    story_meaning: z.string().optional(),
    primary_emotion: z.string().optional(),
    secondary_emotion: z.string().optional(),
    relationship_direction: z.string().optional(),
    decisive_moment: z.string().optional(),
    visual_priority: z.string().optional(),
    safety_adjustments: z.array(z.unknown()).optional().catch(undefined),
  })
  .passthrough();

const startFrameShotPromptOutputSchema = z
  .object({
    contract_version: z.literal(1).optional(),
    prompt: z.string().min(1),
    negative_prompt: z.string().optional().default(""),
    safety_adjustments: z.array(z.unknown()).optional().catch(undefined),
    analysis_summary: startFrameShotPromptAnalysisSummarySchema.optional().catch(undefined),
    continuity_notes: z.array(z.unknown()).optional().catch(undefined),
    video_readiness_notes: z.array(z.unknown()).optional().catch(undefined),
    quality_score: z.number().optional().catch(undefined),
    quality_flags: z.array(z.unknown()).optional().catch(undefined),
  })
  .passthrough();

export type StartFrameShotPromptOutput = z.infer<typeof startFrameShotPromptOutputSchema>;

const policySafeSynopsisAdjustmentSchema = z.object({
  original: z.string().min(1),
  rewritten: z.string().min(1),
  reason: z.enum(["adult_or_consent", "threat", "violence", "sexual_content"]),
});

export const policySafeSynopsisOutputSchema = z.object({
  contract_version: z.literal(1).optional(),
  rewritten_synopsis: z.string().min(1),
  safety_adjustments: z.array(policySafeSynopsisAdjustmentSchema).max(12),
});

export type PolicySafeSynopsisOutput = z.infer<typeof policySafeSynopsisOutputSchema>;

/**
 * Proves that the policy skill changed only the exact substrings it declared.
 * Any undeclared addition/deletion, or an ambiguous replacement target, fails
 * closed instead of silently turning synopsis-direct mode into creative mode.
 */
export function validatePolicySafeSynopsisRewrite(
  sourceSynopsis: string,
  output: PolicySafeSynopsisOutput,
): string {
  let reconstructed = sourceSynopsis.trim();
  for (const adjustment of output.safety_adjustments) {
    if (adjustment.original === adjustment.rewritten) {
      throw new VdSchemaValidationError(
        "Policy-safe synopsis adjustment must change the declared text",
        adjustment,
      );
    }
    const occurrences = reconstructed.split(adjustment.original).length - 1;
    if (occurrences !== 1) {
      throw new VdSchemaValidationError(
        `Policy-safe synopsis adjustment target must occur exactly once (found ${occurrences})`,
        adjustment,
      );
    }
    reconstructed = reconstructed.replace(adjustment.original, adjustment.rewritten);
  }
  const rewritten = output.rewritten_synopsis.trim();
  if (reconstructed !== rewritten) {
    throw new VdSchemaValidationError(
      "Policy-safe synopsis contains an undeclared addition, deletion, or rewrite",
      { sourceSynopsis: sourceSynopsis.trim(), reconstructed, rewritten },
    );
  }
  return rewritten;
}

export function buildPolicySafeSynopsisUserPrompt(canonicalShotSummary: string): string {
  return [
    "Rewrite only policy-sensitive wording in the authoritative synopsis below.",
    "Preserve its original language and all non-policy wording exactly.",
    "Allowed reasons only: adult_or_consent, threat, violence, sexual_content.",
    "Do not add or infer blocking, expressions, clothing, lighting, camera, weather, props, or events.",
    "Return only rewritten_synopsis and the exact safety_adjustments replacements.",
    `authoritative_synopsis: ${canonicalShotSummary.trim()}`,
    VD_COMPACT_JSON_INSTRUCTION,
  ].join("\n");
}

export function buildDeterministicPolicySafeImagePrompt(params: {
  rewrittenSynopsis: string;
  characterReferenceManifest: GenerateStartFrameShotPromptCharacterManifestEntry[];
  locationReferenceImage?: { url: string; label: string };
}): string {
  const mappings = params.characterReferenceManifest
    .slice()
    .sort((a, b) => a.index - b.index)
    .map(entry => `Image ${entry.index} = ${entry.name}`);
  if (params.locationReferenceImage) {
    const locationIndex = Math.max(0, ...params.characterReferenceManifest.map(e => e.index)) + 1;
    mappings.push(`Image ${locationIndex} = location: ${params.locationReferenceImage.label}`);
  }
  const synopsis = params.rewrittenSynopsis.trim();
  return mappings.length > 0
    ? `REFERENCE MAPPING: ${mappings.join("; ")}.\n${synopsis}`
    : synopsis;
}

/* -------------------------------------------------------------------------- */
/* Lenient extras normalization — trims/caps whatever the two new modes       */
/* returned into the small display-only subset `startFramePlan.frames[]`      */
/* persists, mirroring `normalizeFrameAnalysis`'s (video-prompt path) exact    */
/* "typeof check -> trim -> slice -> filter" convention.                      */
/* -------------------------------------------------------------------------- */

const VD_IMAGE_PROMPT_EXTRA_ARRAY_MAX = 12;
const VD_IMAGE_PROMPT_EXTRA_STRING_MAX = 300;

/** Trim + cap-length every string entry, drop non-strings/blanks, cap array length. Returns `undefined` for an empty/absent result (never `[]`). */
function normalizeImagePromptStringArrayExtra(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .filter((v): v is string => typeof v === "string")
    .map(v => v.trim().slice(0, VD_IMAGE_PROMPT_EXTRA_STRING_MAX))
    .filter(v => v.length > 0)
    .slice(0, VD_IMAGE_PROMPT_EXTRA_ARRAY_MAX);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeImagePromptStringExtra(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, VD_IMAGE_PROMPT_EXTRA_STRING_MAX);
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * `policy_safe_rewrite` returns `safety_adjustments` at the top level;
 * `cinematic_narrative` nests it under `analysis_summary.safety_adjustments`
 * — the two modes never populate both, so whichever is present wins.
 */
function normalizeStartFrameShotPromptSafetyAdjustments(
  data: StartFrameShotPromptOutput,
): string[] | undefined {
  return (
    normalizeImagePromptStringArrayExtra(data.safety_adjustments) ??
    normalizeImagePromptStringArrayExtra(data.analysis_summary?.safety_adjustments)
  );
}

/** `cinematic_narrative`-only director's-notes subset persisted onto a frame (see `VerticalDramaStartFramePlan.frames[].promptAnalysis`'s doc comment for exactly which fields and why). */
function normalizeStartFrameShotPromptAnalysis(
  data: StartFrameShotPromptOutput,
): { storyMeaning?: string; primaryEmotion?: string; decisiveMoment?: string; qualityScore?: number; qualityFlags?: string[] } | undefined {
  const summary = data.analysis_summary;
  const storyMeaning = normalizeImagePromptStringExtra(summary?.story_meaning);
  const primaryEmotion = normalizeImagePromptStringExtra(summary?.primary_emotion);
  const decisiveMoment = normalizeImagePromptStringExtra(summary?.decisive_moment);
  const qualityScore =
    typeof data.quality_score === "number" && Number.isFinite(data.quality_score)
      ? data.quality_score
      : undefined;
  const qualityFlags = normalizeImagePromptStringArrayExtra(data.quality_flags);

  if (
    !storyMeaning &&
    !primaryEmotion &&
    !decisiveMoment &&
    qualityScore === undefined &&
    !qualityFlags
  ) {
    return undefined;
  }
  return {
    ...(storyMeaning ? { storyMeaning } : {}),
    ...(primaryEmotion ? { primaryEmotion } : {}),
    ...(decisiveMoment ? { decisiveMoment } : {}),
    ...(qualityScore !== undefined ? { qualityScore } : {}),
    ...(qualityFlags ? { qualityFlags } : {}),
  };
}

export interface GenerateStartFrameShotPromptCharacterManifestEntry {
  /**
   * 1-based attached-reference-image position, in the SAME order the actual
   * paid render call will attach reference images later (see the router's
   * `resolveShotCharacterReferenceEntries`) — gives the skill real "Image N"
   * indices for its identity-lock rule, unlike `vertical-drama-shot-image-
   * action`'s "repair" action (which always sends `index: null` because it
   * attaches only ONE combined reference image).
   */
  index: number;
  characterId?: string | null;
  name: string;
}

export interface GenerateStartFrameShotPromptParams {
  userId: number;
  tenantId?: string;
  seriesId: number;
  episodeId: number;
  shotNumber: number;
  /**
   * The user's optional free-text repair/adjustment instruction (trimmed and
   * length-limited by the router) — an ADDITIONAL directive layered on top of
   * full mandatory-rule regeneration, never a scoped-down patch. The latest
   * Overview summary may be supplied instead when the workspace is refreshing
   * a stale materialized prompt. See skill.md's "Repair instruction handling"
   * section.
   */
  instruction?: string;
  /**
   * The shot's existing `startFramePlan.frames[].imagePrompt` (already
   * defensively stripped of any stale identity-lock suffix by the caller,
   * via `stripExistingIdentityLockSuffix`) — informational-only scene
   * grounding, NOT a base template to preserve mostly intact. May be thin or
   * degenerate placeholder text; the skill still regenerates fully.
   */
  currentPrompt: string;
  currentNegativePrompt: string;
  /** Latest Overview shot summary; when present it supersedes stale prompt scene facts. */
  canonicalShotSummary?: string;
  /** Character reference image manifest — see `GenerateStartFrameShotPromptCharacterManifestEntry`. */
  characterReferenceManifest: GenerateStartFrameShotPromptCharacterManifestEntry[];
  /**
   * Species/role/description identity facts for this shot's required
   * characters (2026-07-07 non-human-character-vanishing fix) — fed through
   * `buildCharacterIdentityMapBlock`, same as the batch generator above.
   */
  characters?: VerticalDramaCharacterDescriptorSource[];
  /** This shot's required character keys, in order — the ORDER argument `buildCharacterIdentityMapBlock` iterates (independent of `characters`' own array order). */
  requiredCharacterRefs?: string[];
  targetAudienceRegion?: VerticalDramaTargetAudienceRegion;
  /**
   * The language this shot's image PROMPT TEXT ITSELF (`prompt` /
   * `negative_prompt`) must be written in — the SAME episode-level language
   * plan field the video-prompt path already reads
   * (`motionPromptPack.promptLanguage`), shared rather than duplicated. See
   * `VerticalDramaPromptLanguage` in `@shared/verticalDramaSeries/contracts`.
   * Defaults to `"en"` when absent, matching the video path's own
   * `params.promptLanguage ?? "en"` convention exactly.
   */
  promptLanguage?: VerticalDramaPromptLanguage;
  productLock?: {
    active: boolean;
    productName?: string | null;
    productDescription?: string | null;
  } | null;
  /**
   * Phase 1 of `planning/polished-toasting-gadget.md` (location visual
   * bible) — same shape/rationale as
   * `GenerateStartFrameRenderPlanParams.storyboardShots[].location` above,
   * singular here since this generator handles exactly one shot at a time.
   * Optional — Phase 1 does not wire this generator's caller to resolve a
   * location fact yet (see that plan's Phase 2 "Also wire
   * `generateShotStartFramePrompt`" item), so every call today omits this,
   * producing a byte-identical prompt.
   */
  location?: { name: string; description: string; hasReferenceImage: boolean };
  /**
   * Speaker-order composition fix — same shape/rationale as
   * `GenerateStartFrameRenderPlanParams.storyboardShots[].speakingOrder`
   * above, singular here since this generator handles exactly one shot at a
   * time. Optional — omitted for any shot with no resolvable dialogue,
   * producing a byte-identical prompt.
   */
  speakingOrder?: string[];
  /**
   * User-controlled supplementary reference frames
   * (`planning/vd-start-frame-reference-mapping/plan.md` Phase 6) — set
   * `true` by `generateShotReferenceFramePrompt`
   * (`server/routers/verticalDramaEpisodes.ts`) ONLY; every other caller
   * omits it, producing a byte-identical prompt (same conditional-line
   * convention as `speakingOrder` above). When `true`,
   * `buildStartFrameShotPromptUserPrompt` emits a `reference_frame_mode:
   * true` fact line immediately after `repair_instruction` — the skill's own
   * "Supplementary reference frame mode" section (added to
   * `vertical-drama-shot-start-frame-prompt/skill.md` in Phase 6b) reads that
   * fact + `repair_instruction` (the user's free-text directive) together to
   * let the directive OUTRANK `canonical_shot_summary` for action/pose/camera
   * while every other identity/mapping/continuity rule still applies
   * unchanged. This flag changes ONLY which skill section governs the
   * output's creative content — the mapping validator, one corrective retry,
   * and fail-closed `VdReferenceMappingError` behavior below apply
   * identically in this mode.
   */
  referenceFrameMode?: boolean;
  idempotencyKey?: string;
  /**
   * Whether to attach the shot's existing reference image (`imageUrl`) to the LLM call as a
   * vision input when supported by the model family (`openai` / `anthropic` / `gemini`).
   * Defaults to true when omitted. When false, vision images are not sent.
   */
  attachShotImage?: boolean;
  /**
   * Optional start frame image URL of the current shot to attach when `attachShotImage` is true.
   */
  imageUrl?: string;
  /**
   * Optional additional reference image inputs (e.g., character portraits, user-attached images)
   * to attach when `attachShotImage` is true.
   */
  additionalImageUrls?: VisionAwareImageInput[];
  /**
   * Two-mode start-frame image prompt switch
   * (`planning/vd-start-frame-prompt-modes/plan.md`) — which skill authors
   * this shot's prompt. Absent -> the legacy `vertical-drama-shot-start-
   * frame-prompt` skill, byte-identical to every pre-existing caller
   * (`generateShotReferenceFramePrompt`, and any caller that predates this
   * feature). `referenceFrameMode: true` ALWAYS forces the legacy skill
   * regardless of this field — see `selectShotStartFramePromptSystemPrompt`.
   */
  imagePromptMode?: VdImagePromptMode;
  /**
   * Only meaningful alongside `imagePromptMode` — whether the caller's mode
   * came from an explicit per-sub-episode user choice or the auto-resolved
   * family default, so the returned `frameStamp` can record it without this
   * function re-deriving something only the caller (the router) knows.
   */
  imagePromptModeResolvedFrom?: "user" | "auto";
  /** The family `imageModelId`/`imageModelName` belong to — threaded into the `TARGET IMAGE MODEL` fact line and persisted on `frameStamp`. */
  imageModelFamily?: ImagePromptModelFamily;
  imageModelName?: string;
  imageModelId?: string;
  /**
   * Character portrait references for `cinematic_narrative` mode's vision
   * attachment + `character_reference_manifest` grounding — MUST be in the
   * same order as `characterReferenceManifest` (index N's label is derived
   * from this array's Nth entry, 1-based) so the "Image N" labels the model
   * SEES match the "Image N" indices the prompt TEXT claims. Ignored by
   * every other mode (mode 1 attaches images exactly as it does today — the
   * shot's own current image + `additionalImageUrls` only).
   */
  characterReferenceImages?: { url: string; label: string }[];
  /** Location reference image for `cinematic_narrative` mode's vision attachment. Ignored by every other mode. */
  locationReferenceImage?: { url: string; label: string };
  /**
   * Series preset visual-identity image-prompt fragments (spec §8.2.2 flow-
   * through rule) — for the two NEW modes ONLY, threaded in as a
   * `SERIES VISUAL IDENTITY` fact so the skill weaves them into its own
   * prose (NO CODE-SIDE PROMPT APPENDING — see this file's
   * `appendPresetVisualIdentityFragmentsToImagePrompt` doc comment for the
   * legacy code-append this replaces for stamped frames). Ignored by the
   * legacy skill (mode absent) — that path keeps its existing render-time
   * code append untouched.
   */
  presetVisualIdentityFragments?: { positive: string[]; negative: string[] };
  /**
   * Product tie-in facts (spec §13) — for the two NEW modes ONLY, threaded
   * in as a `PRODUCT TIE-IN` fact (a DIFFERENT, mode-specific fact label
   * from the pre-existing `productLock` above, which every mode — including
   * legacy — still receives unchanged) so the skill authors the placement
   * directive itself instead of a code-side append. Reuses the exact
   * `productName`/`productDescription` wording `productLock` already
   * carries — no new resolution needed.
   */
  productTieIn?: { active: boolean; productName?: string | null; productDescription?: string | null } | null;
}

export function buildStartFrameShotPromptUserPrompt(
  params: GenerateStartFrameShotPromptParams,
): string {
  const promptLanguage = params.promptLanguage ?? "en";
  const promptLanguageName = VERTICAL_DRAMA_PROMPT_LANGUAGE_ENGLISH_NAMES[promptLanguage];
  const characterIdentityMapBlock = buildCharacterIdentityMapBlock(
    params.requiredCharacterRefs ?? [],
    params.characters ?? [],
  );

  const manifestLines = params.characterReferenceManifest
    .map((entry) => {
      const parts = [
        `index=${entry.index}`,
        `name=${entry.name}`,
        entry.characterId ? `character_id=${entry.characterId}` : null,
      ].filter(Boolean);
      return `- ${parts.join(" ")}`;
    })
    .join("\n");

  // Multi-character frame-inclusion fix — `requiredCharacterRefs` (the
  // authoritative "who must appear" list) is preferred when present; falls
  // back to the reference-image manifest's length otherwise. See the
  // `requiredCharacterCount` fact line below.
  const requiredCharacterCount =
    params.requiredCharacterRefs?.length ?? params.characterReferenceManifest.length;

  // Two-mode start-frame image prompt switch
  // (`planning/vd-start-frame-prompt-modes/plan.md`) — `SERIES VISUAL
  // IDENTITY` / `PRODUCT TIE-IN` / `frame_analysis_inputs` are new-mode-only
  // facts (the legacy skill's contract never expects them, and
  // `referenceFrameMode` always forces the legacy skill regardless of
  // `imagePromptMode` — see `selectShotStartFramePromptSystemPrompt`).
  const isNewImagePromptMode = Boolean(params.imagePromptMode) && !params.referenceFrameMode;
  const imageModelLabel = params.imageModelName
    ? `${params.imageModelName} (${params.imageModelId ?? ""})`
    : (params.imageModelId ?? "unknown");
  const presetVisualIdentityFragmentsPresent =
    (params.presetVisualIdentityFragments?.positive?.length ?? 0) > 0 ||
    (params.presetVisualIdentityFragments?.negative?.length ?? 0) > 0;

  return [
    `contract_version: 1`,
    `shot_number: ${params.shotNumber}`,
    `current_prompt: ${params.currentPrompt}`,
    `current_negative_prompt: ${params.currentNegativePrompt || "(none)"}`,
    `repair_instruction: ${params.instruction?.trim() || "(none)"}`,
    // User-controlled supplementary reference frames (Phase 6) — additive;
    // `null` (filtered out entirely, same convention as `speakingOrder`
    // below) when `referenceFrameMode` is absent, so every pre-existing
    // caller produces the exact same prompt as before this field existed
    // (byte-identical regression guard). See `GenerateStartFrameShotPromptParams
    // .referenceFrameMode`'s own doc comment for what this fact means to the
    // skill.
    params.referenceFrameMode ? `reference_frame_mode: true` : null,
    params.canonicalShotSummary?.trim()
      ? `canonical_shot_summary (authoritative Overview source): ${params.canonicalShotSummary.trim()}`
      : null,
    manifestLines
      ? `character_reference_manifest:\n${manifestLines}`
      : `character_reference_manifest: (none)`,
    characterIdentityMapBlock ?? null,
    buildTargetAudienceRegionInstruction(params.targetAudienceRegion),
    // Two-mode start-frame image prompt switch — a purely FACTUAL model
    // announcement (skill-first architecture: neither skill's contract
    // requires this fact by name, but mode 1's own doc explicitly reasons
    // about "the caller's image model", so this is threaded whenever known,
    // for every mode INCLUDING legacy). `null` (filtered out entirely, same
    // convention as every other conditional fact in this builder) when the
    // caller never resolved a model family, so a call without it — every
    // caller that predates this feature — produces the exact same prompt as
    // before this field existed (byte-identical regression guard).
    params.imageModelFamily
      ? `TARGET IMAGE MODEL: family=${params.imageModelFamily} model="${imageModelLabel}"`
      : null,
    params.productLock
      ? `product_lock: active=${params.productLock.active}${
          params.productLock.active
            ? ` product_name="${params.productLock.productName ?? ""}" product_description="${params.productLock.productDescription ?? ""}"`
            : ""
        }`
      : `product_lock: active=false`,
    // Two-mode start-frame image prompt switch — the two NEW skills' own §7
    // / §13 "SERIES VISUAL IDENTITY" sections are the ONLY place these
    // fragments enter the prompt (NO CODE-SIDE PROMPT APPENDING); the legacy
    // skill's contract never expects this fact, so it is gated on
    // `isNewImagePromptMode` in addition to the fragments existing at all.
    isNewImagePromptMode && presetVisualIdentityFragmentsPresent
      ? `SERIES VISUAL IDENTITY (weave into your own prose; nothing downstream appends these): positive=[${(params.presetVisualIdentityFragments?.positive ?? []).join(", ")}] negative=[${(params.presetVisualIdentityFragments?.negative ?? []).join(", ")}]`
      : null,
    // Two-mode start-frame image prompt switch — the two NEW skills' own §7
    // / §14 "PRODUCT TIE-IN" sections author the placement directive
    // themselves from these facts (NO CODE-SIDE PROMPT APPENDING); reuses
    // the exact `productName`/`productDescription` wording `product_lock`
    // above already carries — this is a DIFFERENT, mode-specific fact label
    // the two new skills' contracts look for by name, never emitted for the
    // legacy skill (which already has everything it needs from
    // `product_lock` alone).
    isNewImagePromptMode && params.productTieIn?.active
      ? `PRODUCT TIE-IN: product_name="${params.productTieIn.productName ?? ""}" product_description="${params.productTieIn.productDescription ?? ""}"`
      : null,
    // Phase 1 of `planning/polished-toasting-gadget.md` (location visual
    // bible) — additive; `null` (filtered out entirely, same convention as
    // `characterIdentityMapBlock` above) when `location` is absent, so a
    // call without it produces the exact same prompt as before this field
    // existed (byte-identical regression guard). Mirrors
    // `verticalDramaStoryboardGeneration.ts`'s own
    // `"[has an approved reference image — identity lock applies]"`
    // conditional-suffix convention for the character-identity case.
    params.location
      ? `location: name="${params.location.name}" description="${params.location.description}"${
          params.location.hasReferenceImage
            ? " [has an approved reference image — environment lock applies]"
            : ""
        }`
      : null,
    // Speaker-order composition fix — additive; `null` (filtered out
    // entirely, same convention as `location` immediately above) when
    // `speakingOrder` is absent/empty, so a call without it produces the
    // exact same prompt as before this field existed.
    params.speakingOrder?.length
      ? `speaking_order: ${params.speakingOrder.join(" > ")} (first speaker leftmost)`
      : null,
    // Multi-character frame-inclusion fix — same shape/rationale as the
    // batch builder's `requiredCharactersSuffix` above. `null` (filtered out
    // entirely, same convention as `speakingOrder` immediately above) when
    // the shot has fewer than 2 required characters, so a solo-character
    // call produces the exact same prompt as before this field existed
    // (byte-identical regression guard). Derived from what's already on
    // `params` — no new caller param needed: `requiredCharacterRefs` (the
    // authoritative "who must appear" list) when present, else the length of
    // `characterReferenceManifest`. TS emits only the factual count — the
    // creative "must include ALL of them" rule lives in
    // `vertical-drama-shot-start-frame-prompt/skill.md`'s new "All required
    // characters must be visible in frame" rule.
    requiredCharacterCount >= 2
      ? `required_character_count: ${requiredCharacterCount} (all must appear in frame)`
      : null,
    // Deterministic per-shot camera-framing fix — the per-shot sibling of
    // the batch builder's `remapCameraSetupForRequiredCharacters`
    // (`buildStartFrameRenderPlanUserPrompt` above). Root cause: a 2+
    // required-character shot regenerated via THIS path ("ให้ AI ปรับ")
    // could still come back as an isolating close-up because this builder
    // never receives (and the batch remap never runs against) a
    // `cameraSetup` value at all — the fix there only ever reached the
    // batch render-plan call. Rather than thread a `cameraSetup` string
    // through just to remap it, this emits the same widened-framing
    // decision directly as an authoritative `framing_override` fact
    // (`widenedMultiCharacterFramingToken` — the exact function
    // `remapCameraSetupForRequiredCharacters` uses internally, so neither
    // path's widening decision can drift out of sync with the other).
    // `skill.md`'s "All required characters must be visible in frame" rule
    // treats this fact as authoritative shot-size when present. `null`
    // (filtered out entirely, same convention as `required_character_count`
    // immediately above) for any shot with < 2 required characters — byte-
    // identical regression guard.
    requiredCharacterCount >= 2
      ? `framing_override: ${widenedMultiCharacterFramingToken(requiredCharacterCount)} (${requiredCharacterCount} required characters must ALL be visible — do not isolate one in a close-up)`
      : null,
    // Two-mode start-frame image prompt switch — `cinematic_narrative`-only:
    // a FACT (not an instruction) telling the skill the portraits + location
    // image it needs to interpret are attached below as vision inputs — see
    // `buildStartFrameShotPromptVisionImages`'s mode-2 branch for the actual
    // attachment. `null` (filtered out entirely) for every other mode,
    // including legacy, which never attaches these images at all.
    isNewImagePromptMode && params.imagePromptMode === "cinematic_narrative"
      ? `frame_analysis_inputs: character portraits and the location image are ATTACHED as images below`
      : null,
    // Independent image-prompt language — same default/wording convention
    // as `verticalDramaVideoMotionPromptGeneration.ts`'s
    // `buildShotVideoPromptUserPrompt` (the video single-shot sibling of this
    // builder), reworded for the fields THIS skill actually produces (an
    // image prompt/negative prompt, not a video clip). Always appended (even
    // when `promptLanguage` is absent and defaults to English) — matches the
    // video path's own behavior exactly, not a byte-identical-when-omitted
    // convention.
    `PROMPT LANGUAGE (MANDATORY): write the "prompt" and "negative_prompt" fields entirely in ${promptLanguageName} — every word of the image prompt text must be in ${promptLanguageName}.`,
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

/**
 * Regenerate ONE shot's start-frame image prompt via the
 * `vertical-drama-shot-start-frame-prompt` skill — the per-shot sibling of
 * `generateStartFrameRenderPlan` above, and the fix for the "ให้ AI ปรับ"
 * button next to a shot's start-frame prompt (previously completely
 * non-functional — see `planning/polished-toasting-gadget.md`). Credit-gated
 * + rate-limited + schema-validated, same convention as every other Vertical
 * Drama planning-only LLM call in this file.
 *
 * Child-safety post-generation safety net (ported from
 * `verticalDramaShotImageAction.ts`'s `generateShotImageAction` — see that
 * function's doc comment for the full rationale): if
 * `CHILD_SAFETY_DIRECTIVE_MARKER` matches `params.currentPrompt` (the INPUT)
 * but does NOT match the skill's returned `prompt` (the OUTPUT), this
 * function does not attempt to surgically re-insert the missing clause — it
 * falls back to returning the ORIGINAL `params.currentPrompt`/
 * `currentNegativePrompt` for that one call and logs a warning, rather than
 * risk shipping a start-frame prompt that silently dropped a safety clause.
 * Credits are still deducted (the LLM call itself succeeded and consumed
 * tokens; only the returned prompt is discarded).
 */
async function resolveStartFrameShotPromptModel(
  seriesId: number,
  attachShotImage?: boolean,
  hasImage?: boolean,
): Promise<{ model: string; hasVision: boolean }> {
  const configuredModel = await resolveStartFramePlanModel(seriesId);
  if (attachShotImage === false || !hasImage) {
    return { model: configuredModel, hasVision: false };
  }
  try {
    const rows = await loadEnabledLlmModelRows();
    if (rows.length > 0) {
      const configuredRow = rows.find(r => r.modelId === configuredModel || r.providerModelId === configuredModel || (r.legacyModelAliases && r.legacyModelAliases.includes(configuredModel)));
      if (configuredRow?.supportsVision === true) {
        return { model: configuredModel, hasVision: true };
      }
      const visionModel = selectBestLlmModel(
        { supportsVision: true, supportsStructuredOutputs: true },
        rows,
      );
      if (visionModel) return { model: visionModel, hasVision: true };
    }
  } catch {
    // Fall through to configured model
  }
  return { model: configuredModel, hasVision: false };
}

/**
 * Cap on the AUTOMATIC vision attachments `cinematic_narrative` mode adds
 * (the shot's own current image + character portraits + the location image)
 * — bounds per-call vision cost to a fixed, predictable ceiling regardless
 * of how many characters a shot requires. Caller-supplied
 * `additionalImageUrls` (Phase 6a's user-attached extras) are NOT subject to
 * this cap — they are appended afterward unconditionally, same as before
 * this mode existed.
 */
const VD_START_FRAME_SHOT_PROMPT_MAX_AUTO_ATTACHED_IMAGES = 6;
/** Of that budget, at most this many are character portraits. */
const VD_START_FRAME_SHOT_PROMPT_MAX_PORTRAITS = 4;

/**
 * Build the vision images attached to a start-frame shot-prompt LLM call.
 * Mode 1 (`policy_safe_rewrite`) / legacy (no mode) attach images exactly as
 * before this feature: the shot's own current image (`images[0]`,
 * unlabeled) then the caller's `additionalImageUrls`.
 *
 * `cinematic_narrative` mode ADDITIONALLY inserts the character portraits
 * (in `character_reference_manifest` index order, labeled `"Image N
 * reference: <name>"` — N matches the manifest's own 1-based index, NOT
 * shifted by the shot's own image slot, so the label the model SEES lines
 * up exactly with the "Image N" claim the prompt TEXT makes) and then the
 * location image (labeled `"Location reference: <name>"`), between
 * `images[0]` and `additionalImageUrls` — see
 * `GenerateStartFrameShotPromptParams.characterReferenceImages`'s doc
 * comment. Portraits are capped at `VD_START_FRAME_SHOT_PROMPT_MAX_PORTRAITS`;
 * when a shot's manifest exceeds that, only the first portraits (in
 * manifest order) are attached and a warning is logged — the mapping
 * validator downstream still fail-closes on any "Image N" claim the prompt
 * makes for a portrait that never actually got attached.
 */
export function buildStartFrameShotPromptVisionImages(
  imageUrl?: string,
  additionalImageUrls?: VisionAwareImageInput[],
  cinematicNarrativeVisionInputs?: {
    characterReferenceImages?: readonly { url: string; label: string }[];
    locationReferenceImage?: { url: string; label: string };
  },
): VisionAwareImageInput[] {
  const images: VisionAwareImageInput[] = [];
  if (imageUrl) {
    images.push({ url: imageUrl });
  }
  if (cinematicNarrativeVisionInputs) {
    const portraits = cinematicNarrativeVisionInputs.characterReferenceImages ?? [];
    const portraitsToAttach = portraits.slice(0, VD_START_FRAME_SHOT_PROMPT_MAX_PORTRAITS);
    if (portraits.length > portraitsToAttach.length) {
      console.warn(
        "[vd_shot_start_frame_prompt] cinematic_narrative mode: character portrait count exceeds the vision-attachment cap — attaching only the first portraits in manifest order",
        {
          totalPortraits: portraits.length,
          attached: portraitsToAttach.length,
          cap: VD_START_FRAME_SHOT_PROMPT_MAX_PORTRAITS,
        },
      );
    }
    portraitsToAttach.forEach((portrait, idx) => {
      images.push({ url: portrait.url, label: `Image ${idx + 1} reference: ${portrait.label}` });
    });
    if (cinematicNarrativeVisionInputs.locationReferenceImage) {
      images.push({
        url: cinematicNarrativeVisionInputs.locationReferenceImage.url,
        label: `Location reference: ${cinematicNarrativeVisionInputs.locationReferenceImage.label}`,
      });
    }
  }
  // Final safety clamp on the AUTOMATIC portion only — see this function's
  // doc comment. A no-op for mode 1 / legacy calls (`imageUrl` alone never
  // comes anywhere near this cap).
  const cappedAutoImages = images.slice(0, VD_START_FRAME_SHOT_PROMPT_MAX_AUTO_ATTACHED_IMAGES);
  if (additionalImageUrls && additionalImageUrls.length > 0) {
    cappedAutoImages.push(...additionalImageUrls);
  }
  return cappedAutoImages;
}

export async function generateStartFrameShotPrompt(
  params: GenerateStartFrameShotPromptParams,
): Promise<{
  prompt: string;
  negativePrompt: string;
  creditsUsed: number;
  model: string;
  usedVision: boolean;
  /** Present iff a mode was actually used (absent for a legacy-skill call — mode omitted, or `referenceFrameMode` forced legacy). */
  usedMode?: VdImagePromptMode;
  /** Ready to persist verbatim onto `startFramePlan.frames[].promptMode` — see that field's doc comment. Present iff `usedMode` is present. */
  frameStamp?: VdImagePromptModeStamp;
  /** Normalized `"original → rewritten"` pairs from whichever mode returned them. */
  safetyAdjustments?: string[];
  /** `cinematic_narrative`-only normalized director's-notes subset — see `VerticalDramaStartFramePlan.frames[].promptAnalysis`. */
  promptAnalysis?: {
    storyMeaning?: string;
    primaryEmotion?: string;
    decisiveMoment?: string;
    qualityScore?: number;
    qualityFlags?: string[];
  };
}> {
  const rateLimitKey = `user:${params.userId}`;
  if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
    throw new RateLimitExceededError(mediaGenerationLimiter.getResetTime(rateLimitKey));
  }

  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const isPolicySafeSynopsisMode =
    params.imagePromptMode === "policy_safe_rewrite" && !params.referenceFrameMode;
  const canonicalSynopsis = params.canonicalShotSummary?.trim();
  if (isPolicySafeSynopsisMode && !canonicalSynopsis) {
    throw new VdSchemaValidationError(
      "Policy-safe synopsis mode requires an authoritative canonical shot synopsis",
      { shotNumber: params.shotNumber },
    );
  }

  // Two-mode start-frame image prompt switch — `cinematic_narrative` is
  // explicitly image-grounded (D3, `planning/vd-start-frame-prompt-modes/
  // plan.md`): it wants vision even when the shot has no existing image yet,
  // as long as character portraits/a location image are available to attach.
  // `referenceFrameMode` never combines with a mode in practice (only
  // `generateShotReferenceFramePrompt` sets it, and that caller never sets
  // `imagePromptMode`), but is excluded here too for logical correctness —
  // the legacy skill this mode forces never asks for these vision inputs.
  const isCinematicNarrativeMode =
    params.imagePromptMode === "cinematic_narrative" && !params.referenceFrameMode;
  const hasModeTwoVisionInputs =
    isCinematicNarrativeMode &&
    Boolean(params.characterReferenceImages?.length || params.locationReferenceImage);
  const wantsVision =
    !isPolicySafeSynopsisMode &&
    (Boolean(params.imageUrl) || (hasModeTwoVisionInputs && params.attachShotImage !== false));

  const resolvedModel = await resolveStartFrameShotPromptModel(
    params.seriesId,
    params.attachShotImage,
    wantsVision,
  );
  const model = resolvedModel.model;
  const hasVision = resolvedModel.hasVision;

  if (!hasVision && wantsVision && params.attachShotImage !== false) {
    console.warn(
      "[vd_shot_start_frame_prompt] generated WITHOUT vision (no vision-capable model enabled) — model relied on text prompt proxy only",
      { seriesId: params.seriesId, episodeId: params.episodeId, shotNumber: params.shotNumber },
    );
  }

  const systemPrompt = selectShotStartFramePromptSystemPrompt({
    imagePromptMode: params.imagePromptMode,
    referenceFrameMode: params.referenceFrameMode,
  });
  const userPrompt = isPolicySafeSynopsisMode
    ? buildPolicySafeSynopsisUserPrompt(canonicalSynopsis!)
    : buildStartFrameShotPromptUserPrompt(params);
  const images = buildStartFrameShotPromptVisionImages(
    params.imageUrl,
    params.additionalImageUrls,
    hasModeTwoVisionInputs
      ? {
          characterReferenceImages: params.characterReferenceImages,
          locationReferenceImage: params.locationReferenceImage,
        }
      : undefined,
  );

  if (isPolicySafeSynopsisMode) {
    const executePolicyRewrite = (promptText: string) =>
      executeVisionAwareJsonCallWithRetry<PolicySafeSynopsisOutput>({
        model,
        systemPrompt,
        userPromptText: promptText,
        hasVision: false,
        images: [],
        userId: params.userId,
        schema: policySafeSynopsisOutputSchema,
        firstAttemptMaxTokens: 1400,
        retryMaxTokens: 1800,
      });
    let policyCall = await executePolicyRewrite(userPrompt);
    const policyCalls = [policyCall];
    let rewrittenSynopsis: string;
    try {
      rewrittenSynopsis = validatePolicySafeSynopsisRewrite(canonicalSynopsis!, policyCall.data);
    } catch {
      policyCall = await executePolicyRewrite(
        `${userPrompt}\nCORRECTION: Your previous response changed text outside its declared exact replacements. Return a result reconstructable by applying each safety_adjustments item exactly once, in order, to the authoritative synopsis.`,
      );
      policyCalls.push(policyCall);
      rewrittenSynopsis = validatePolicySafeSynopsisRewrite(canonicalSynopsis!, policyCall.data);
    }

    const outputPrompt = buildDeterministicPolicySafeImagePrompt({
      rewrittenSynopsis,
      characterReferenceManifest: params.characterReferenceManifest,
      locationReferenceImage: params.locationReferenceImage,
    });
    if (outputPrompt.length > VD_IMAGE_PROMPT_MAX) {
      throw new VdSchemaValidationError(
        `Policy-safe synopsis prompt exceeds ${VD_IMAGE_PROMPT_MAX} characters`,
        { length: outputPrompt.length },
      );
    }
    const inputTokens = policyCalls.reduce(
      (total, call) => total + (call.response.usage?.prompt_tokens ?? 0),
      0,
    );
    const outputTokens = policyCalls.reduce(
      (total, call) => total + (call.response.usage?.completion_tokens ?? 0),
      0,
    );
    const creditsUsed = policyCalls.reduce(
      (total, call) => total + calculateCreditsForLLM(
        call.response.usage?.prompt_tokens ?? 0,
        call.response.usage?.completion_tokens ?? 0,
        model,
      ),
      0,
    );
    await deductCredits({
      userId: params.userId,
      tenantId: params.tenantId,
      amount: creditsUsed,
      description: `Vertical Drama — policy-safe synopsis rewrite (episode #${params.episodeId}, shot #${params.shotNumber})`,
      sourceType: "skill",
      idempotencyKey: params.idempotencyKey,
      metadata: {
        model,
        llmModel: model,
        feature: "vertical_drama_series",
        seriesId: params.seriesId,
        episodeId: params.episodeId,
        shotNumber: params.shotNumber,
        inputTokens,
        outputTokens,
        semanticRetryCount: policyCalls.length - 1,
      },
    });
    const safetyAdjustments = policyCall.data.safety_adjustments.map(
      adjustment => `${adjustment.original} → ${adjustment.rewritten}`,
    );
    const frameStamp: VdImagePromptModeStamp = {
      mode: "policy_safe_rewrite",
      resolvedFrom: params.imagePromptModeResolvedFrom ?? "auto",
      imageModelFamily: params.imageModelFamily ?? "other",
      ...(params.imageModelId ? { imageModelId: params.imageModelId } : {}),
      generatedAt: new Date().toISOString(),
    };
    return {
      prompt: outputPrompt,
      negativePrompt: "",
      creditsUsed,
      model,
      usedVision: false,
      usedMode: "policy_safe_rewrite",
      frameStamp,
      ...(safetyAdjustments.length > 0 ? { safetyAdjustments } : {}),
    };
  }

  const { data: validatedData, response } = await executeVisionAwareJsonCallWithRetry<
    z.infer<typeof startFrameShotPromptOutputSchema>
  >({
    model,
    systemPrompt,
    userPromptText: userPrompt,
    hasVision,
    images,
    userId: params.userId,
    schema: startFrameShotPromptOutputSchema,
    firstAttemptMaxTokens: 3000,
    retryMaxTokens: 4000,
  });

  const usage = response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    model,
  );

  await deductCredits({
    userId: params.userId,
    tenantId: params.tenantId,
    amount: creditsUsed,
    description: `Vertical Drama — start-frame shot prompt (episode #${params.episodeId}, shot #${params.shotNumber})`,
    sourceType: "skill",
    idempotencyKey: params.idempotencyKey,
    metadata: {
      model,
      llmModel: model,
      feature: "vertical_drama_series",
      seriesId: params.seriesId,
      episodeId: params.episodeId,
      shotNumber: params.shotNumber,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  });

  // Child-safety post-generation safety net — see this function's doc
  // comment. Only relevant when the input actually carried the directive;
  // otherwise this is a no-op on every call.
  let outputPrompt = validatedData.prompt;
  let outputNegativePrompt = validatedData.negative_prompt ?? "";
  // Two-mode start-frame image prompt switch — tracks whichever raw LLM
  // response actually ended up authoring `outputPrompt`/`outputNegativePrompt`,
  // so the extras normalization below (`safetyAdjustments`/`promptAnalysis`)
  // reflects what was ACTUALLY persisted, not a response the child-safety
  // net discarded in favor of `params.currentPrompt`.
  let finalData: StartFrameShotPromptOutput | undefined = validatedData;
  const inputHadChildSafetyDirective = CHILD_SAFETY_DIRECTIVE_MARKER.test(
    params.currentPrompt,
  );
  if (inputHadChildSafetyDirective && !CHILD_SAFETY_DIRECTIVE_MARKER.test(outputPrompt)) {
    debugError(
      "vd_shot_start_frame_prompt",
      `Start-frame shot prompt (shot ${params.shotNumber}): skill output dropped the ` +
        `child-safety directive present in the input prompt — falling back to the ` +
        `original unmodified prompt/negative prompt for this call rather than risk ` +
        `losing the age-appropriateness clause.`,
      { shotNumber: params.shotNumber },
    );
    outputPrompt = params.currentPrompt;
    outputNegativePrompt = params.currentNegativePrompt;
    finalData = undefined;
  }

  // Reference Mapping Validator + one corrective retry (`planning/
  // vd-start-frame-reference-mapping/plan.md` Phase 2, RC3 fix, 2026-07-16)
  // — validate the authored prompt's own EXPLICIT "Image N ↔ name" claims
  // against `characterReferenceManifest` (the SAME order the real paid
  // render will attach reference images in — see the router's
  // `reorderShotCharacterRefEntriesByKeyOrder` fix). On a mismatch, issue
  // ONE deterministic corrective retry (same "retry once, bill the retry
  // separately" convention `verticalDramaStoryBible.ts`'s deep-draft-chunk
  // missing-episode retry already established) rather than silently
  // persisting a self-contradictory prompt.
  const referenceMappingReferences = params.characterReferenceManifest.map((entry) => ({
    imageIndex: entry.index,
    characterName: entry.name,
  }));
  let referenceMappingMismatches = findCharacterImageIndexMappingMismatches(
    outputPrompt,
    referenceMappingReferences,
  );
  if (referenceMappingMismatches.length > 0) {
    debugError(
      "vd_shot_start_frame_prompt",
      `Start-frame shot prompt (shot ${params.shotNumber}): authored prompt's own ` +
        `"Image N" claims contradict the reference manifest — retrying once with a ` +
        `corrective instruction.`,
      { shotNumber: params.shotNumber, mismatches: referenceMappingMismatches },
    );
    const correctiveUserPrompt = `${userPrompt}\n\n${buildReferenceMappingCorrectiveInstruction(
      referenceMappingReferences,
      referenceMappingMismatches,
    )}`;
    const retry = await executeVisionAwareJsonCallWithRetry<
      z.infer<typeof startFrameShotPromptOutputSchema>
    >({
      model,
      systemPrompt,
      userPromptText: correctiveUserPrompt,
      hasVision,
      images,
      userId: params.userId,
      schema: startFrameShotPromptOutputSchema,
      firstAttemptMaxTokens: 3000,
      retryMaxTokens: 4000,
    });
    const retryUsage = retry.response.usage;
    const retryCreditsUsed = calculateCreditsForLLM(
      retryUsage?.prompt_tokens ?? 0,
      retryUsage?.completion_tokens ?? 0,
      model,
    );
    await deductCredits({
      userId: params.userId,
      tenantId: params.tenantId,
      amount: retryCreditsUsed,
      description: `Vertical Drama — start-frame shot prompt reference-mapping retry (episode #${params.episodeId}, shot #${params.shotNumber})`,
      sourceType: "skill",
      metadata: {
        model,
        llmModel: model,
        feature: "vertical_drama_series",
        seriesId: params.seriesId,
        episodeId: params.episodeId,
        shotNumber: params.shotNumber,
        inputTokens: retryUsage?.prompt_tokens ?? 0,
        outputTokens: retryUsage?.completion_tokens ?? 0,
      },
    });

    outputPrompt = retry.data.prompt;
    outputNegativePrompt = retry.data.negative_prompt ?? "";
    finalData = retry.data;
    if (
      inputHadChildSafetyDirective &&
      !CHILD_SAFETY_DIRECTIVE_MARKER.test(outputPrompt)
    ) {
      outputPrompt = params.currentPrompt;
      outputNegativePrompt = params.currentNegativePrompt;
      finalData = undefined;
    }

    referenceMappingMismatches = findCharacterImageIndexMappingMismatches(
      outputPrompt,
      referenceMappingReferences,
    );
    if (referenceMappingMismatches.length > 0) {
      throw new VdReferenceMappingError(
        `Start-frame shot prompt (shot ${params.shotNumber}): authored prompt's own ` +
          `"Image N" claims still contradict the reference manifest after one ` +
          `corrective retry (${formatMappingMismatchSummary(referenceMappingMismatches)})`,
        referenceMappingMismatches,
      );
    }
  }

  // Two-mode start-frame image prompt switch — `usedMode` mirrors
  // `params.imagePromptMode` UNLESS `referenceFrameMode` forced the legacy
  // skill (see `selectShotStartFramePromptSystemPrompt`), in which case no
  // mode was actually used. `frameStamp` is built here (not by the caller)
  // so the router can persist it verbatim without re-deriving anything.
  const usedMode: VdImagePromptMode | undefined = params.referenceFrameMode
    ? undefined
    : params.imagePromptMode;
  const frameStamp: VdImagePromptModeStamp | undefined = usedMode
    ? {
        mode: usedMode,
        resolvedFrom: params.imagePromptModeResolvedFrom ?? "auto",
        imageModelFamily: params.imageModelFamily ?? "other",
        ...(params.imageModelId ? { imageModelId: params.imageModelId } : {}),
        generatedAt: new Date().toISOString(),
      }
    : undefined;
  const safetyAdjustments = finalData
    ? normalizeStartFrameShotPromptSafetyAdjustments(finalData)
    : undefined;
  const promptAnalysis = finalData
    ? normalizeStartFrameShotPromptAnalysis(finalData)
    : undefined;

  return {
    prompt: outputPrompt,
    negativePrompt: outputNegativePrompt,
    creditsUsed,
    model,
    usedVision: hasVision,
    ...(usedMode ? { usedMode } : {}),
    ...(frameStamp ? { frameStamp } : {}),
    ...(safetyAdjustments ? { safetyAdjustments } : {}),
    ...(promptAnalysis ? { promptAnalysis } : {}),
  };
}
