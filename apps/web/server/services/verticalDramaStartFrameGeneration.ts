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
import {
  resolveStoryBibleModel,
  executeJsonPlanningCallWithRetry,
  InsufficientCreditsError,
  VdSchemaValidationError,
  VD_COMPACT_JSON_INSTRUCTION,
} from "./verticalDramaStoryBible";
import {
  buildTargetAudienceRegionInstruction,
  type VerticalDramaTargetAudienceRegion,
} from "@shared/verticalDramaSeries/targetAudienceRegion";
import { VD_CHARACTER_LOCK_INSTRUCTION } from "@shared/verticalDramaSeries/characterLock";
import {
  buildCharacterIdentityMapBlock,
  type VerticalDramaCharacterDescriptorSource,
} from "@shared/verticalDramaSeries/characterIdentityMap";
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
}

function buildUserPrompt(params: GenerateStartFrameRenderPlanParams): string {
  const shotLines = params.storyboardShots
    .map(
      (s) =>
        `- Shot ${s.shotNumber} (${s.durationSeconds}s): ${s.description} | camera: ${s.cameraSetup} | characters: ${
          s.characterIds.length ? s.characterIds.join(", ") : "(none)"
        }`,
    )
    .join("\n");

  const allRequiredCharacterKeys = params.storyboardShots.flatMap((s) => s.characterIds);
  const characterIdentityMapBlock = buildCharacterIdentityMapBlock(
    allRequiredCharacterKeys,
    params.characters ?? [],
  );

  return [
    `Episode title: ${params.episodeTitle}`,
    `Episode duration: ${params.durationSeconds} seconds`,
    params.selectedImageModelId
      ? `Preferred image model: ${params.selectedImageModelId}`
      : null,
    `Storyboard shots (build exactly one start-frame render request per shot, 9 total):\n${shotLines}`,
    characterIdentityMapBlock,
    params.storyboardShots.some((s) => s.characterIds.length > 0) ? VD_CHARACTER_LOCK_INSTRUCTION : null,
    buildTargetAudienceRegionInstruction(params.targetAudienceRegion),
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

  const model = await resolveStoryBibleModel();
  const systemPrompt = loadSkillSystemPrompt();
  const userPrompt = buildUserPrompt(params);

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
