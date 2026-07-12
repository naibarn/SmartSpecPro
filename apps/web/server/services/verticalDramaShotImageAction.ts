/**
 * Vertical Drama Series — on-demand, single-shot image-prompt authoring
 * (`vertical-drama-skill-first-architecture` plan, Phase 1 items 1-3).
 *
 * Invokes the `vertical-drama-shot-image-action` skill
 * (`apps/web/skills/vertical-drama-shot-image-action/`) via a direct
 * `executeWithFallback` LLM call (through `executeJsonPlanningCallWithRetry`,
 * the same shared retry/validation helper every other Vertical Drama planning
 * stage uses) to author the final image-generation prompt for exactly ONE
 * on-demand, single-shot image action:
 *
 *  - `"multi_angle_grid"` — the 3x3 camera-angle-grid render triggered by
 *    `generateStartFrameAngleVariations` in `verticalDramaEpisodes.ts`.
 *  - `"repair"` — the user-instructed image-to-image edit triggered by
 *    `repairShotImage` in the same router.
 *  - `"soften"` — a content-policy-risk soften pass with no repair
 *    instruction and no grid layout, triggered by `generateStartFrameImage`
 *    ONLY when `effectiveSoftenLevel > 0` (an explicit client retry after a
 *    provider content-policy rejection) — never on the level-0/first-attempt
 *    path, to avoid adding LLM latency/cost to the common render case.
 *
 * Every action also accepts `softenLevel` (0/1/2, Phase 1.3): the skill
 * itself authors more conservative wording at higher levels — this file no
 * longer runs the old regex "soften ladder"
 * (`shared/verticalDramaSeries/characterLock.ts`'s deleted
 * `softenCharacterLockPrompt`/`softenCharacterLockNegativePrompt`) on the
 * skill's output. The ONE piece of deterministic post-generation logic that
 * remains, by design (see the plan's Phase 1.3 item — "keep the child-safety
 * guard as a hard post-generation assertion, that one hard rule is
 * legitimate deterministic policy, not content authorship"): if
 * `shared/verticalDramaSeries/characterLock.ts`'s
 * `CHILD_SAFETY_DIRECTIVE_MARKER` matches the INPUT `shot.currentPrompt` but
 * not the skill's returned `prompt`, this function does NOT try to patch the
 * skill's output — it falls back to returning the original, unsoftened
 * `shot.currentPrompt`/`shot.currentNegativePrompt` for that one call and
 * logs a warning. See `generateShotImageAction`'s doc comment below.
 *
 * Replaces the hardcoded array+join prompt builders and the regex soften
 * ladder that previously lived directly in the router/`characterLock.ts`
 * (see `planning/vertical-drama-skill-first-architecture/plan.md`, Tier 1
 * findings #1/#2/#3) — this file's `buildShotImageActionUserPrompt` ONLY
 * assembles structured ground-truth facts (current prompt, character
 * reference index/name mapping, region default, product-lock facts, soften
 * level) as skill INPUT; it never authors instructional/creative prompt
 * prose itself. The skill is the sole author of the returned
 * `prompt`/`negativePrompt`.
 *
 * Mirrors `verticalDramaStartFrameGeneration.ts`'s
 * loadSkillSystemPrompt -> buildUserPrompt -> check-credits -> resolve-model
 * -> call (with retry) -> validate -> deduct-credits convention exactly.
 * Credit-gated (throws `InsufficientCreditsError` before calling out) and
 * schema-validated (throws `VdSchemaValidationError` on a malformed LLM
 * response). Deliberately does NOT rate-limit internally — the router's
 * `generateStartFrameImage`/`generateStartFrameAngleVariations`/
 * `repairShotImage` mutations already gate the whole mutation via
 * `mediaGenerationLimiter` before calling this function; a second internal
 * check would double-count one user action against their per-user rate
 * limit.
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import { parseSkillFile } from "@smartspec/skills";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "./skillFiles";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "./creditService";
import { debugError } from "../_core/logger";
import { CHILD_SAFETY_DIRECTIVE_MARKER } from "@shared/verticalDramaSeries/characterLock";
import {
  executeJsonPlanningCallWithRetry,
  InsufficientCreditsError,
  VdSchemaValidationError,
  VD_COMPACT_JSON_INSTRUCTION,
} from "./verticalDramaStoryBible";
import { resolveQualityLargeContextModelId } from "./verticalDramaImproveScript";
import { resolveVerticalDramaSeriesModel } from "./verticalDramaLlmModelPolicy";

// Re-exported so callers only need to import from this one module.
export { InsufficientCreditsError, VdSchemaValidationError };

const SKILL_FOLDER_PATH = path.join("skills", "vertical-drama-shot-image-action");

let cachedSystemPrompt: string | null = null;
let cachedSystemPromptTime = 0;
const SYSTEM_PROMPT_CACHE_TTL_MS = 60000; // 1 minute cache, mirrors skillRegistry.ts's CACHE_TTL_MS

/**
 * Read the `vertical-drama-shot-image-action` skill's markdown body
 * (everything after the YAML frontmatter) verbatim, to use as the LLM system
 * prompt. Resolves the skill folder the same way `skillRegistry.ts` does —
 * mirrors `verticalDramaStartFrameGeneration.ts`'s `loadSkillSystemPrompt`.
 */
function loadSkillSystemPrompt(): string {
  const now = Date.now();
  if (cachedSystemPrompt && now - cachedSystemPromptTime < SYSTEM_PROMPT_CACHE_TTL_MS) {
    return cachedSystemPrompt;
  }

  for (const dir of resolveSkillDirCandidates(SKILL_FOLDER_PATH)) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (manifestPath && fs.existsSync(manifestPath)) {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      const { content } = parseSkillFile(raw);
      if (content && content.trim().length > 0) {
        cachedSystemPrompt = content;
        cachedSystemPromptTime = now;
        return cachedSystemPrompt;
      }
    }
  }

  throw new Error(
    `Could not locate skill.md for "vertical-drama-shot-image-action" under any known skills directory`,
  );
}

/* -------------------------------------------------------------------------- */
/* Output schema                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Validates + narrows the LLM response. Deliberately does NOT hard-enforce
 * the 3500-char prompt cap here (unlike `schemas/output.schema.json`'s
 * `maxLength`) — the caller (`generateStartFrameAngleVariations`/
 * `repairShotImage`) already runs the returned prompt through
 * `ensurePromptWithinLimit` (the shared Vertical Drama prompt-QC pass) before
 * using it, so enforcing the cap here too would only risk an unnecessary
 * schema-retry loop for a condition the caller already handles.
 */
const shotImageActionOutputSchema = z
  .object({
    contract_version: z.literal(1).optional(),
    prompt: z.string().min(1),
    negative_prompt: z.string().optional().default(""),
  })
  .passthrough();

export type ShotImageActionOutput = z.infer<typeof shotImageActionOutputSchema>;

/* -------------------------------------------------------------------------- */
/* Input types + prompt building                                             */
/* -------------------------------------------------------------------------- */

export type VerticalDramaShotImageActionKind = "multi_angle_grid" | "repair" | "soften";

export interface VerticalDramaShotImageActionCharacterRefEntry {
  /** 1-based attached-reference-image position, when a per-character image is actually attached (grid). `null` for repair (single combined reference). */
  index: number | null;
  characterId?: string | null;
  name: string;
}

export interface VerticalDramaShotImageActionRegionFact {
  code: string;
  descriptor: string;
}

export interface VerticalDramaShotImageActionProductLockFact {
  active: boolean;
  productName?: string | null;
  productDescription?: string | null;
}

export interface GenerateShotImageActionParams {
  userId: number;
  tenantId?: string;
  seriesId: number;
  locale?: "th" | "en";
  action: VerticalDramaShotImageActionKind;
  shot: {
    shotNumber: number;
    currentPrompt: string;
    currentNegativePrompt: string;
  };
  /** Required (non-empty) only when `action === "repair"`. */
  repairInstruction?: string | null;
  characterReferenceManifest?: VerticalDramaShotImageActionCharacterRefEntry[];
  targetAudienceRegion?: VerticalDramaShotImageActionRegionFact | null;
  productLock?: VerticalDramaShotImageActionProductLockFact | null;
  /** Present only when `action === "multi_angle_grid"`. */
  gridLayout?: { panelCount: 9; layout: "3x3" } | null;
  /**
   * Content-policy-risk reduction level (Phase 1.3) — applicable regardless
   * of `action`. `0`/omitted = full-strength wording (default/first
   * attempt, and the ONLY value `generateStartFrameImage` ever sends without
   * also calling this skill at all — see this file's doc comment). `1`/`2`
   * instruct the skill to progressively soften identity-lock/appearance
   * wording per `skill.md`'s "Soften levels" section. Typed as `number`
   * (not a `0 | 1 | 2` literal union) because callers pass through the
   * router's Zod-validated `softenLevel` input, which TypeScript widens to
   * `number` — the actual `[0, VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL]` bound is
   * enforced by that Zod schema, not by this type.
   */
  softenLevel?: number;
  idempotencyKey?: string;
}

/**
 * Assembles ONLY structured ground-truth facts as labeled plain-text lines —
 * the same "labeled data lines, no authored instruction prose" convention
 * `verticalDramaPromptQc.ts`'s `buildRefinerUserPrompt` already uses. Every
 * instructional/creative sentence (grid-layout phrasing, the "no text"
 * warning, identity-lock wording, repair-preservation framing, region/product
 * phrasing, soften-level wording) is authored by the skill itself — never
 * here.
 */
export function buildShotImageActionUserPrompt(
  params: GenerateShotImageActionParams,
): string {
  const manifestLines = (params.characterReferenceManifest ?? [])
    .map((entry) => {
      const parts = [
        `index=${entry.index ?? "null"}`,
        `name=${entry.name}`,
        entry.characterId ? `character_id=${entry.characterId}` : null,
      ].filter(Boolean);
      return `- ${parts.join(" ")}`;
    })
    .join("\n");

  return [
    `contract_version: 1`,
    `action: ${params.action}`,
    `soften_level: ${params.softenLevel ?? 0}`,
    `locale: ${params.locale ?? "th"}`,
    `shot_number: ${params.shot.shotNumber}`,
    `current_prompt: ${params.shot.currentPrompt}`,
    `current_negative_prompt: ${params.shot.currentNegativePrompt || "(none)"}`,
    params.action === "repair"
      ? `repair_instruction: ${params.repairInstruction ?? ""}`
      : null,
    manifestLines
      ? `character_reference_manifest:\n${manifestLines}`
      : `character_reference_manifest: (none)`,
    params.targetAudienceRegion
      ? `target_audience_region: code=${params.targetAudienceRegion.code} descriptor="${params.targetAudienceRegion.descriptor}"`
      : `target_audience_region: (none)`,
    params.productLock
      ? `product_lock: active=${params.productLock.active}${
          params.productLock.active
            ? ` product_name="${params.productLock.productName ?? ""}" product_description="${params.productLock.productDescription ?? ""}"`
            : ""
        }`
      : `product_lock: (none)`,
    params.gridLayout
      ? `grid_layout: panel_count=${params.gridLayout.panelCount} layout=${params.gridLayout.layout}`
      : null,
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

/* -------------------------------------------------------------------------- */
/* Generation entry point                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Author the final `prompt`/`negativePrompt` pair for one on-demand,
 * single-shot image action via the `vertical-drama-shot-image-action` skill.
 * Credit-gated + schema-validated — see this file's doc comment.
 *
 * Child-safety post-generation safety net (Phase 1.3, deterministic — not an
 * LLM decision): if `shared/verticalDramaSeries/characterLock.ts`'s
 * `CHILD_SAFETY_DIRECTIVE_MARKER` matches `params.shot.currentPrompt` (the
 * INPUT) but does NOT match the skill's returned `prompt` (the OUTPUT), this
 * function does not attempt to surgically re-insert the missing clause
 * (risks broken grammar) — it falls back to returning the ORIGINAL,
 * unsoftened `params.shot.currentPrompt`/`currentNegativePrompt` for that one
 * call, and logs a warning via `debugError`. Credits are still deducted for
 * the LLM call that ran (the call itself succeeded and consumed tokens; only
 * the returned prompt is discarded).
 */
export async function generateShotImageAction(
  params: GenerateShotImageActionParams,
): Promise<{
  prompt: string;
  negativePrompt: string;
  creditsUsed: number;
  model: string;
}> {
  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveVerticalDramaSeriesModel(
    params.seriesId,
    resolveQualityLargeContextModelId,
  );
  const systemPrompt = loadSkillSystemPrompt();
  const userPrompt = buildShotImageActionUserPrompt(params);

  const { data: validatedData, response } = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.6,
    userId: params.userId,
    maxTokens: 3000,
    schema: shotImageActionOutputSchema,
    label: `Shot image action (${params.action}, shot ${params.shot.shotNumber})`,
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
    description: `Vertical Drama — shot image action (${params.action}, shot ${params.shot.shotNumber})`,
    sourceType: "skill",
    idempotencyKey: params.idempotencyKey
      ? `${params.idempotencyKey}:shot-image-action`
      : undefined,
    metadata: {
      model,
      llmModel: model,
      feature: "vertical_drama_series",
      action: params.action,
      shotNumber: params.shot.shotNumber,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  });

  // Child-safety post-generation safety net — see this function's doc
  // comment. Only relevant when the input actually carried the directive;
  // otherwise this is a no-op on every call (including softenLevel 0).
  let outputPrompt = validatedData.prompt;
  let outputNegativePrompt = validatedData.negative_prompt ?? "";
  const inputHadChildSafetyDirective = CHILD_SAFETY_DIRECTIVE_MARKER.test(
    params.shot.currentPrompt,
  );
  if (inputHadChildSafetyDirective && !CHILD_SAFETY_DIRECTIVE_MARKER.test(outputPrompt)) {
    debugError(
      "vd_shot_image_action",
      `Shot image action (${params.action}, shot ${params.shot.shotNumber}, softenLevel ${params.softenLevel ?? 0}): ` +
        `skill output dropped the child-safety directive present in the input prompt — falling back to the ` +
        `original unsoftened prompt/negative prompt for this call rather than risk shipping an image render ` +
        `without the age-appropriateness clause.`,
      { shotNumber: params.shot.shotNumber, action: params.action, softenLevel: params.softenLevel ?? 0 },
    );
    outputPrompt = params.shot.currentPrompt;
    outputNegativePrompt = params.shot.currentNegativePrompt;
  }

  return {
    prompt: outputPrompt,
    negativePrompt: outputNegativePrompt,
    creditsUsed,
    model,
  };
}
