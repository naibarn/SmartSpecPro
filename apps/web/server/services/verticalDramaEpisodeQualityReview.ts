/**
 * Vertical Drama Series — episode quality-review scorecard (Phase 3B,
 * `planning/vertical-drama-storyboard-complete/plan.md` §3B.5).
 *
 * Invokes the `vertical-drama-episode-quality-review` skill
 * (`apps/web/skills/vertical-drama-episode-quality-review/`) via a direct
 * `executeWithFallback` LLM call — mirrors `verticalDramaScriptGeneration.ts`'s
 * (itself mirroring `verticalDramaStoryBible.ts`'s) check-credits ->
 * resolve-model -> call -> validate -> deduct-credits convention exactly.
 *
 * This is a cheap, LLM-only text review (script + storyboard + optional
 * dialogue plan in, a scorecard + issues list out) meant to run BEFORE the
 * user spends credits on image/video generation. It never blocks: even a
 * maximally flat episode gets a full, valid scorecard back — the caller
 * decides what to do with it.
 *
 * NOT wired into any router yet — this file only exports the generation
 * function + its output schema, per the Phase 3B task scope. A later wave
 * adds the tRPC procedure + pipeline/UI wiring.
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
  resolveStoryBibleModel,
  executeJsonPlanningCallWithRetry,
  InsufficientCreditsError,
  VdSchemaValidationError,
  VD_COMPACT_JSON_INSTRUCTION,
} from "./verticalDramaStoryBible";
import { debugError } from "../_core/logger";
import {
  verticalDramaLocaleEnglishName,
  type VerticalDramaSeriesLocale,
} from "@shared/verticalDramaSeries";

// Re-exported so callers only need to import from this one module.
export { InsufficientCreditsError, VdSchemaValidationError };

/**
 * Thrown when the per-user `mediaGenerationLimiter` rejects a quality-review
 * call. There is no pipeline stage mapper for this skill yet (it is not
 * wired into `verticalDramaEpisodePipeline.ts`), so callers should handle
 * this the same way the other Vertical Drama generation services' sibling
 * `RateLimitExceededError` classes are handled — surface a retryable error.
 */
export class RateLimitExceededError extends Error {
  code = "VD_RATE_LIMIT_EXCEEDED" as const;
  constructor(retryAfterMs: number) {
    super(
      `Rate limit exceeded for episode quality review. Try again in ${Math.ceil(retryAfterMs / 1000)} seconds.`
    );
    this.name = "RateLimitExceededError";
  }
}

const SKILL_FOLDER_PATH = path.join(
  "skills",
  "vertical-drama-episode-quality-review"
);

let cachedSystemPrompt: string | null = null;

/** Mirrors `verticalDramaScriptGeneration.ts`'s `loadSkillSystemPrompt`. */
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
    `Could not locate skill.md for "vertical-drama-episode-quality-review" under any known skills directory`
  );
}

/* -------------------------------------------------------------------------- */
/* Output schema — mirrors schemas/output.schema.json's REQUIRED fields        */
/* -------------------------------------------------------------------------- */

const qualityReviewScorecardSchema = z
  .object({
    reversal_count: z.number().int().min(0),
    reversal_sharpness: z.number().int().min(1).max(5),
    emotion_variety: z.number().int().min(1).max(5),
    dialogue_naturalness: z.number().int().min(1).max(5).nullable(),
    pacing: z.number().int().min(1).max(5),
    overall: z.number().int().min(1).max(5),
  })
  .passthrough();

const qualityReviewIssueSchema = z
  .object({
    location: z.string().min(1),
    problem: z.string().min(1),
    suggested_fix: z.string().min(1),
  })
  .passthrough();

export const episodeQualityReviewOutputSchema = z
  .object({
    contract_version: z.literal(1).optional(),
    episode_title: z.string().min(1),
    scorecard: qualityReviewScorecardSchema,
    summary: z.string().min(1),
    issues: z.array(qualityReviewIssueSchema),
    warnings: z.array(z.object({}).passthrough()),
    repair_queue: z.array(z.object({}).passthrough()),
  })
  .passthrough();

export type EpisodeQualityReviewOutput = z.infer<
  typeof episodeQualityReviewOutputSchema
>;

/* -------------------------------------------------------------------------- */
/* Prompt building                                                            */
/* -------------------------------------------------------------------------- */

export interface RunEpisodeQualityReviewParams {
  userId: number;
  tenantId?: string;
  seriesId: number;
  episodeId: number;
  episodeTitle: string;
  locale: VerticalDramaSeriesLocale;
  /** Raw (or relevant-subset) output of `vertical-drama-script-builder`. */
  script: Record<string, unknown>;
  /** Raw (or relevant-subset) output of `vertical-drama-storyboard-shotgrid`. */
  storyboard: Record<string, unknown>;
  /** Optional raw (or relevant-subset) output of `vertical-drama-dialogue-audio-planner`. */
  dialoguePlan?: Record<string, unknown> | null;
  /**
   * When set together with `previousIssues`, instructs the LLM to propose
   * substantively DIFFERENT alternative issues/suggested fixes than the
   * previous review — the "ตรวจใหม่ แนะนำแนวทางอื่น" ("re-review, suggest a
   * different approach") loop the storyboard quality-review UI offers after
   * the user has already seen one set of suggestions and wants alternatives
   * instead of applying them. Ignored (no effect on the prompt) if
   * `previousIssues` is empty/absent.
   */
  avoidPrevious?: boolean;
  /** The previous review's `issues[]` — only consulted when `avoidPrevious` is set. */
  previousIssues?: Array<{ location: string; problem: string; suggested_fix: string }>;
  /** Forwarded to `deductCredits` so a retried request doesn't double-charge. */
  idempotencyKey?: string;
}

/**
 * Conservative fixed pre-check estimate (credits) for this skill's LLM call.
 * The real cost (computed from actual token usage after the call returns) is
 * almost always lower than this — it exists only to reject an
 * obviously-can't-afford-it request BEFORE spending the LLM call, the same
 * role the sibling Vertical Drama generation services' `hasEnoughCredits(...,
 * 1)` pre-checks play for them. None of those siblings compute a real
 * pre-call estimate either (there is no token count yet to estimate from —
 * the prompt is built from arbitrary-sized script/storyboard JSON), so a
 * fixed constant sized for this skill's typical worst-case token usage is
 * used instead of the too-permissive `1`.
 */
const QUALITY_REVIEW_ESTIMATED_CREDIT_COST = 20;

function buildUserPrompt(params: RunEpisodeQualityReviewParams): string {
  const langInstruction =
    params.locale === "th"
      ? "Write summary/problem/suggested_fix in natural Thai."
      : `Write summary/problem/suggested_fix in natural ${verticalDramaLocaleEnglishName(params.locale)}.`;

  const avoidPreviousInstruction =
    params.avoidPrevious && params.previousIssues && params.previousIssues.length > 0
      ? [
          "The user already saw the following previous review issues/suggested fixes and",
          "explicitly asked for a DIFFERENT set of alternative improvements — do NOT repeat",
          "these same issues or rephrase the same suggested fixes; propose substantively",
          "different problems and/or different fix approaches (still grounded in the actual",
          "script/storyboard content, still citing real shot/beat numbers):",
          JSON.stringify(params.previousIssues),
        ].join("\n")
      : null;

  return [
    `episode_title: ${params.episodeTitle}`,
    langInstruction,
    `script:\n${JSON.stringify(params.script)}`,
    `storyboard:\n${JSON.stringify(params.storyboard)}`,
    params.dialoguePlan
      ? `dialogue_plan:\n${JSON.stringify(params.dialoguePlan)}`
      : "dialogue_plan: (not provided — score dialogue_naturalness as null)",
    avoidPreviousInstruction,
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* Generation entry point                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Run the `vertical-drama-episode-quality-review` skill via a direct
 * `executeWithFallback` LLM call. Credit-gated (throws
 * `InsufficientCreditsError` before calling out) and schema-validated
 * (throws `VdSchemaValidationError` on a malformed LLM response) — mirrors
 * `generateEpisodeScript`'s check-credits -> call -> deduct-credits
 * convention. NOT registered in any router; callers import this function
 * directly (see the file-level doc comment for scope).
 */
export async function runVerticalDramaEpisodeQualityReview(
  params: RunEpisodeQualityReviewParams
): Promise<{
  review: EpisodeQualityReviewOutput;
  creditsUsed: number;
  model: string;
}> {
  const rateLimitKey = `user:${params.userId}`;
  if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
    throw new RateLimitExceededError(
      mediaGenerationLimiter.getResetTime(rateLimitKey)
    );
  }

  const hasCredits = await hasEnoughCredits(
    params.userId,
    QUALITY_REVIEW_ESTIMATED_CREDIT_COST,
  );
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveStoryBibleModel();
  const systemPrompt = loadSkillSystemPrompt();
  const userPrompt = buildUserPrompt(params);

  // Small, bounded output (a fixed-shape scorecard + a handful of issues) —
  // base ceiling raised only modestly (3000 -> 4000) versus the multi-shot
  // generators, but still gets the same shared one-retry-on-truncated/
  // invalid-JSON safety net for consistency across every Vertical Drama
  // planning call site.
  const { data: validatedData, response } = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.4,
    userId: params.userId,
    maxTokens: 4000,
    schema: episodeQualityReviewOutputSchema,
    label: "Episode quality review",
  });

  const usage = response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    model
  );

  // The LLM cost is already sunk by this point — a failure deducting credits
  // must not turn into a 500 that discards an otherwise-valid review the
  // caller already paid provider cost for. Log for manual reconciliation
  // instead of bubbling the raw error.
  try {
    await deductCredits({
      userId: params.userId,
      tenantId: params.tenantId,
      amount: creditsUsed,
      description: `Vertical Drama — episode quality review (episode #${params.episodeId})`,
      sourceType: "skill",
      idempotencyKey: params.idempotencyKey,
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
  } catch (err) {
    debugError(
      "verticalDramaEpisodeQualityReview",
      `deductCredits failed after a successful review (userId=${params.userId}, episodeId=${params.episodeId}, creditsUsed=${creditsUsed}) — needs manual reconciliation`,
      err,
    );
  }

  return { review: validatedData, creditsUsed, model };
}
