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
import {
  executeJsonPlanningCallWithRetry,
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
  type VerticalDramaCharacterDescriptorSource,
} from "@shared/verticalDramaSeries/characterIdentityMap";
// Prompt-language directive (shared-field fix — this was previously wired
// ONLY into the video-prompt path, `verticalDramaVideoMotionPromptGeneration.ts`
// — see `VerticalDramaPromptLanguage`'s own doc comment in `contracts.ts` for
// why the SAME `motionPromptPack.promptLanguage` field now also governs
// image/start-frame prompt text). Mirrors that file's exact "resolve default
// -> look up English display name -> append a MANDATORY directive line to
// the user prompt" convention; no skill.md changes.
import {
  type VerticalDramaPromptLanguage,
  VERTICAL_DRAMA_PROMPT_LANGUAGE_ENGLISH_NAMES,
} from "@shared/verticalDramaSeries/contracts";
// Preset visual identity flow-through (spec §8.2.2 flow-through rule,
// section-15 change D, Wave-4A completing the "start frames" leg of the
// rule — character refs were already wired by
// `verticalDramaCharacterImageGeneration.ts`). Type-only import here (pure/
// shared) — the two fragment-merge functions below are pure and take the
// identity object directly, so this file never needs the router's bible-
// reading logic.
import type { VerticalDramaPresetVisualIdentity } from "@shared/verticalDramaSeries/presetVisualIdentity";

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
 * Typed projection matching `VerticalDramaStartFramePlan` from
 * `@shared/verticalDramaSeries` — this is the shape persisted into
 * `verticalDramaEpisodes.startFramePlan` and used as the stage payload.
 */
export interface StartFrameRenderPlanProjection {
  mode: "single_frame_per_shot" | "contact_sheet_3x3_batch";
  selectedImageModelId: string;
  frames: Array<{
    shotNumber: number;
    imagePrompt: string;
    negativePrompt: string;
    requiredCharacterRefs: string[];
    productReferenceAssetIds: string[];
    /** See `VerticalDramaStartFramePlan.frames[].productRefsCustomized` in `@shared/verticalDramaSeries`. */
    productRefsCustomized?: boolean;
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
): StartFrameRenderPlanProjection {
  const summary = raw.render_plan_summary as Record<string, unknown>;
  const selectedImageModelId =
    callerImageModelId ||
    (typeof summary?.image_model === "string" ? (summary.image_model as string) : callerImageModelId);

  return {
    mode: "single_frame_per_shot",
    selectedImageModelId,
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
          productReferenceAssetIds: [],
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
      return `- Shot ${s.shotNumber} (${s.durationSeconds}s): ${s.description} | camera: ${s.cameraSetup} | characters: ${
        s.characterIds.length ? s.characterIds.join(", ") : "(none)"
      }${locationSuffix}`;
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
    // Shared-field prompt-language fix — same field/default/wording
    // convention as `verticalDramaVideoMotionPromptGeneration.ts`'s
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
export async function generateStartFrameRenderPlan(
  params: GenerateStartFrameRenderPlanParams,
): Promise<{
  plan: StartFrameRenderPlanProjection;
  raw: StartFrameRenderPlanOutput;
  creditsUsed: number;
  model: string;
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

  const shotCharacterIdsByShotNumber = new Map(
    params.storyboardShots.map((s) => [s.shotNumber, s.characterIds]),
  );
  const plan = projectStartFramePlan(
    validatedData,
    params.selectedImageModelId ?? "dry-run-image-model",
    shotCharacterIdsByShotNumber,
  );

  return { plan, raw: validatedData, creditsUsed, model };
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

/**
 * Single-frame output schema — deliberately NOT `.length(9)` / no
 * `start_frame_requests[]` array, so this can never be confused with
 * `startFrameRenderPlanOutputSchema` above.
 */
const startFrameShotPromptOutputSchema = z
  .object({
    contract_version: z.literal(1).optional(),
    prompt: z.string().min(1),
    negative_prompt: z.string().optional().default(""),
  })
  .passthrough();

export type StartFrameShotPromptOutput = z.infer<typeof startFrameShotPromptOutputSchema>;

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
   * The user's free-text repair/adjustment instruction (Zod-validated
   * non-empty by the router) — an ADDITIONAL directive layered on top of
   * full mandatory-rule regeneration, never a scoped-down patch. See
   * skill.md's "Repair instruction handling" section.
   */
  instruction: string;
  /**
   * The shot's existing `startFramePlan.frames[].imagePrompt` (already
   * defensively stripped of any stale identity-lock suffix by the caller,
   * via `stripExistingIdentityLockSuffix`) — informational-only scene
   * grounding, NOT a base template to preserve mostly intact. May be thin or
   * degenerate placeholder text; the skill still regenerates fully.
   */
  currentPrompt: string;
  currentNegativePrompt: string;
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
  idempotencyKey?: string;
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

  return [
    `contract_version: 1`,
    `shot_number: ${params.shotNumber}`,
    `current_prompt: ${params.currentPrompt}`,
    `current_negative_prompt: ${params.currentNegativePrompt || "(none)"}`,
    `repair_instruction: ${params.instruction}`,
    manifestLines
      ? `character_reference_manifest:\n${manifestLines}`
      : `character_reference_manifest: (none)`,
    characterIdentityMapBlock ?? null,
    buildTargetAudienceRegionInstruction(params.targetAudienceRegion),
    params.productLock
      ? `product_lock: active=${params.productLock.active}${
          params.productLock.active
            ? ` product_name="${params.productLock.productName ?? ""}" product_description="${params.productLock.productDescription ?? ""}"`
            : ""
        }`
      : `product_lock: active=false`,
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
    // Shared-field prompt-language fix — same field/default/wording
    // convention as `verticalDramaVideoMotionPromptGeneration.ts`'s
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
export async function generateStartFrameShotPrompt(
  params: GenerateStartFrameShotPromptParams,
): Promise<{
  prompt: string;
  negativePrompt: string;
  creditsUsed: number;
  model: string;
}> {
  const rateLimitKey = `user:${params.userId}`;
  if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
    throw new RateLimitExceededError(mediaGenerationLimiter.getResetTime(rateLimitKey));
  }

  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveStartFramePlanModel(params.seriesId);
  const systemPrompt = loadShotStartFramePromptSystemPrompt();
  const userPrompt = buildStartFrameShotPromptUserPrompt(params);

  const { data: validatedData, response } = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.7,
    userId: params.userId,
    maxTokens: 3000,
    schema: startFrameShotPromptOutputSchema,
    label: `Start-frame shot prompt (shot ${params.shotNumber})`,
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
  }

  return {
    prompt: outputPrompt,
    negativePrompt: outputNegativePrompt,
    creditsUsed,
    model,
  };
}
