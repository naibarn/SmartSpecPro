/**
 * Vertical Drama Series — real episode-script generation for the
 * `plan_episode_script` pipeline stage (spec feature 131 §11.5).
 *
 * Invokes the already-installed `vertical-drama-script-builder` skill
 * (`apps/web/skills/vertical-drama-script-builder/`) via a direct
 * `executeWithFallback` LLM call — mirrors
 * `verticalDramaStoryboardGeneration.ts`'s check-credits -> resolve-model ->
 * call -> validate -> deduct-credits convention exactly (same skill-loading
 * helper shape, same error classes reused from `verticalDramaStoryBible.ts`).
 *
 * Before this file existed, `plan_episode_script` had NO real-generation path
 * at all — `buildStagePayload`'s placeholder ("Dry-run hook" / camelCase
 * `episodeTitle`/`sceneDialogueSummary`/etc., not even matching the skill's
 * real snake_case output shape) was returned unconditionally for every
 * runner mode. `verticalDramaEpisodePipeline.ts`'s `runStage` is the only
 * caller, and only invokes this for non-dry-run/non-plan-only modes.
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import { parseSkillFile } from "@smartspec/skills";
import {
  resolveSkillDirCandidates,
  resolveSkillManifestPath,
} from "./skillFiles";
import {
  hasEnoughCredits,
  deductCredits,
  calculateCreditsForLLM,
} from "./creditService";
import { mediaGenerationLimiter } from "./rateLimiter";
import {
  verticalDramaLocaleEnglishName,
  type VerticalDramaSeriesLocale,
} from "@shared/verticalDramaSeries";
import {
  resolveStoryBibleModel,
  executeJsonPlanningCallWithRetry,
  InsufficientCreditsError,
  VdSchemaValidationError,
  VD_COMPACT_JSON_INSTRUCTION,
} from "./verticalDramaStoryBible";

export { InsufficientCreditsError, VdSchemaValidationError };

const SKILL_FOLDER_PATH = path.join("skills", "vertical-drama-script-builder");

let cachedSystemPrompt: string | null = null;

/** Mirrors `verticalDramaStoryboardGeneration.ts`'s `loadSkillSystemPrompt`. */
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
    `Could not locate skill.md for "vertical-drama-script-builder" under any known skills directory`
  );
}

/* -------------------------------------------------------------------------- */
/* Output schema — mirrors schemas/output.schema.json's REQUIRED fields        */
/* -------------------------------------------------------------------------- */

/**
 * Optional narrative-quality superset (Phase 3B) — a beat MAY carry a
 * `power_shift` (who has the advantage before/after, and how it changed),
 * an `is_reversal` marker, and an `intensity` 1-10 rating for the escalation
 * curve. All optional so scripts generated before this rule existed (and any
 * fixture/test payload that omits them) still validate unchanged.
 */
const scriptBeatPowerShiftSchema = z
  .object({
    holder_before: z.string().optional(),
    holder_after: z.string().optional(),
    how: z.string().optional(),
  })
  .passthrough();

const scriptBeatSchema = z
  .object({
    beat: z.number().optional(),
    summary: z.string().optional(),
    power_shift: scriptBeatPowerShiftSchema.optional(),
    is_reversal: z.boolean().optional(),
    intensity: z.number().int().min(1).max(10).optional(),
  })
  .passthrough();

const scriptStructureSchema = z
  .object({
    mode: z.string().optional(),
    acts: z.array(z.object({}).passthrough()).optional(),
    beats: z.array(scriptBeatSchema).optional(),
  })
  .passthrough();

/** Optional per-character emotional arc (Phase 3B narrative-quality superset). */
const characterEmotionalArcSchema = z
  .object({
    character_id: z.string().optional(),
    start_emotion: z.string().optional(),
    turning_beat: z.number().optional(),
    end_emotion: z.string().optional(),
  })
  .passthrough();

export const scriptBuilderOutputSchema = z
  .object({
    contract_version: z.literal(1),
    episode_title: z.string().min(1),
    hook: z.string().min(1),
    structure: scriptStructureSchema,
    scene_dialogue_summary: z.array(z.object({}).passthrough()),
    cliffhanger: z.string(),
    character_state_deltas: z.array(z.object({}).passthrough()),
    product_tie_in_plan: z.object({}).passthrough(),
    continuity_notes: z.array(z.string()),
    warnings: z.array(z.object({}).passthrough()),
    repair_queue: z.array(z.object({}).passthrough()),
    /** Optional narrative-quality superset — see skill.md §Narrative grammar. */
    character_emotional_arcs: z.array(characterEmotionalArcSchema).optional(),
  })
  .passthrough();

export type ScriptBuilderOutput = z.infer<typeof scriptBuilderOutputSchema>;

/* -------------------------------------------------------------------------- */
/* Prompt building                                                            */
/* -------------------------------------------------------------------------- */

export interface GenerateEpisodeScriptParams {
  userId: number;
  tenantId?: string;
  seriesId: number;
  episodeId: number;
  episodeTitle: string;
  episodeNumber: number;
  locale: VerticalDramaSeriesLocale;
  durationSeconds: number;
  storySource: {
    logline?: string;
    keyBeats?: string[];
    mainPlot?: string;
    seasonArc?: string;
    tone?: string;
  };
  characters: Array<{
    characterId: string;
    name: string;
    role: string | null;
  }>;
  /**
   * Series long-memory retrieval bundle (spec §7.6), built by
   * `VerticalDramaSeriesMemoryService.buildEpisodeMemoryBundle`. Optional so
   * callers/tests that predate this field (or a series with no memory yet)
   * still work unchanged — when present, it is rendered into the LLM user
   * payload under the `memory_state` key, matching the key name the
   * `vertical-drama-script-builder` skill's brief ("... prior recap, memory
   * state, character roster ...") expects.
   */
  memoryBundle?: unknown;
  /**
   * Product tie-in policy (spec §13) — when the series has tie-in enabled,
   * this is rendered into the prompt under the `product_tie_in_policy` key
   * (matching the skill's `schemas/input.schema.json`) with an EXPLICIT
   * instruction to emit a structured, shot-numbered placement in
   * `product_tie_in_plan.tie_ins[]` (previously this key was never sent at
   * all, so the LLM had no product to weave in and always emitted the empty
   * `{ tie_ins: [], note: "no product this episode" }` placeholder — see
   * `verticalDramaProductTieIn.ts`'s `extractShotProductPlacements` for the
   * normalized shape this output is parsed into downstream). Absent/disabled
   * tie-in omits the section entirely, unchanged from prior behavior.
   */
  productTieIn?: {
    enabled: boolean;
    productName?: string;
    productDescription?: string;
    allowedStoryFunctions?: string[];
    forbiddenClaims?: string[];
  };
}

function buildUserPrompt(params: GenerateEpisodeScriptParams): string {
  const langInstruction =
    params.locale === "th"
      ? "Write all human-readable string values (hook, scene summaries, dialogue lines, cliffhanger, continuity_notes) in natural Thai."
      : `Write all human-readable string values in ${verticalDramaLocaleEnglishName(params.locale)}.`;

  const { storySource } = params;
  const characterLines = params.characters.length
    ? params.characters
        .map(c => `- ${c.characterId}: ${c.name}${c.role ? ` (${c.role})` : ""}`)
        .join("\n")
    : "(no characters registered yet — invent minimal placeholder character ids consistent with the story context)";

  const storyBrief = [
    storySource.logline ? `Logline: ${storySource.logline}` : null,
    storySource.mainPlot ? `Main plot: ${storySource.mainPlot}` : null,
    storySource.seasonArc ? `Season arc: ${storySource.seasonArc}` : null,
    storySource.tone ? `Tone: ${storySource.tone}` : null,
    storySource.keyBeats?.length
      ? `Key beats:\n${storySource.keyBeats.map(b => `- ${b}`).join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  // memory_state (spec §7.6 retrieval bundle) — matches the
  // `vertical-drama-script-builder` skill's `schemas/input.schema.json`
  // `memory_state` key exactly. Omitted entirely when no bundle is available
  // (episode 1 of a brand-new series, or a caller/test that predates this
  // field) so the prompt shape is unchanged for those cases.
  const memorySection = params.memoryBundle
    ? `memory_state (series long-memory retrieval bundle — canonical facts, recent episode summaries, open/resolved hooks, continuity warnings, product tie-in fatigue; respect it for continuity and do not repeat resolved hooks or fatigued tie-ins):\n${JSON.stringify(params.memoryBundle)}`
    : null;

  // Product tie-in policy (spec §13) — only sent when the series has tie-in
  // enabled. Requires a STRUCTURED, shot-numbered placement so downstream
  // stages (start-frame image generation, dialogue) can reliably wire the
  // product into concrete shots instead of a vague freeform mention.
  const tieIn = params.productTieIn;
  const tieInSection = tieIn?.enabled
    ? [
        `product_tie_in_policy: ${JSON.stringify({
          enabled: true,
          product_name: tieIn.productName,
          product_description: tieIn.productDescription,
          allowed_story_functions: tieIn.allowedStoryFunctions,
          forbidden_claims: tieIn.forbiddenClaims,
        })}`,
        `PRODUCT TIE-IN (MANDATORY when enabled): weave "${tieIn.productName ?? "the product"}" naturally into this episode like real TV-drama product placement — it must serve an explicit story function (never unrealistically resolve the main conflict), and must NEVER use any forbidden claim listed above.`,
        `Populate "product_tie_in_plan.tie_ins" as an array of 1 or more objects, each with EXACTLY these fields: "shot_numbers" (array of integers 1-9, the specific storyboard shots that carry this placement), "story_function" (one of ${JSON.stringify(tieIn.allowedStoryFunctions ?? ["daily_use"])}, required, never empty), "placement_style" (one of "hero_prop", "background", "in_use_moment" — how the product physically appears in the shot), and "benefit_talking_point" (a short, natural benefit the dialogue in that shot can reference — never hard-sell copy, must fit the scene's emotion).`,
        `If tie-in cannot be placed naturally this episode, return "product_tie_in_plan": { "tie_ins": [], "note": "<reason>" } instead of forcing an unnatural placement.`,
      ].join("\n")
    : null;

  return [
    `story_title: ${params.episodeTitle}`,
    `story_brief:\n${storyBrief || "(no series bible detail available yet — invent a reasonable brief consistent with the episode title)"}`,
    `episode_number: ${params.episodeNumber}`,
    `duration_seconds: ${params.durationSeconds}`,
    langInstruction,
    `characters:\n${characterLines}`,
    memorySection,
    tieInSection,
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* Generation entry point                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Generate the `plan_episode_script` stage's real content via the
 * `vertical-drama-script-builder` skill, using a direct `executeWithFallback`
 * LLM call. Credit-gated and schema-validated — mirrors
 * `generateStoryboardShotgrid`'s convention exactly.
 */
export async function generateEpisodeScript(
  params: GenerateEpisodeScriptParams
): Promise<{
  script: ScriptBuilderOutput;
  creditsUsed: number;
  model: string;
}> {
  const rateLimitKey = `user:${params.userId}`;
  if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
    throw new Error(
      `Rate limit exceeded for script generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`
    );
  }

  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveStoryBibleModel();
  const systemPrompt = loadSkillSystemPrompt();
  const userPrompt = buildUserPrompt(params);

  // Same shared retry wrapper as the start-frame/motion-prompt/storyboard
  // generators. Base ceiling raised from 4000 to 12000 — a single script
  // structure has no fixed shot count, but Phase 3B added per-beat
  // power_shift/is_reversal/intensity plus per-character emotional-arc
  // fields on top of the existing structure/scene_dialogue_summary/
  // character_state_deltas/product_tie_in_plan/continuity_notes payload,
  // which is large enough to risk the same truncation class already seen in
  // the sibling storyboard/start-frame/motion-prompt generators. The retry's
  // own doubling (`Math.max(maxTokens * 2, 16000)`) comfortably covers any
  // remaining outlier.
  const { data: validatedData, response } = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.8,
    userId: params.userId,
    maxTokens: 12000,
    schema: scriptBuilderOutputSchema,
    label: "Episode script",
  });

  const usage = response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    model
  );

  await deductCredits({
    userId: params.userId,
    tenantId: params.tenantId,
    amount: creditsUsed,
    description: `Vertical Drama — generate episode script (episode #${params.episodeId})`,
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

  return { script: validatedData, creditsUsed, model };
}
