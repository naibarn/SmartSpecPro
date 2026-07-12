/**
 * Vertical Drama Series — series memory planning for the
 * `summarize_episode_to_series_memory` pipeline stage (spec feature 131
 * §7.6 / §11.5).
 *
 * Invokes the previously-orphaned `vertical-drama-series-memory-planner`
 * skill (`apps/web/skills/vertical-drama-series-memory-planner/`) via a
 * direct `executeWithFallback` LLM call — mirrors
 * `verticalDramaEpisodeQualityReview.ts`'s (itself mirroring
 * `verticalDramaStoryBible.ts`'s) check-credits -> resolve-model -> call ->
 * validate -> deduct-credits convention exactly, including the "deduct
 * failure never discards an already-generated, already-paid-for result"
 * behavior.
 *
 * Before this file existed, the `summarize_episode_to_series_memory` stage's
 * only output was a deterministic placeholder string
 * (`buildStagePayload`'s `"Episode N summary (pending approval — not yet
 * applied)"`), and only ONE memory event kind (`episode_summary`) was ever
 * written on approval — the other six kinds (`hook_opened`, `hook_resolved`,
 * `character_delta`, `relationship_delta`, `continuity_warning`,
 * `product_tie_in_usage`) were never produced by anything. This service
 * produces the full planner output (canonical facts, hooks opened/resolved,
 * character/relationship deltas, continuity risks, product tie-in history,
 * episode recap) so the pipeline can append ALL of those event kinds on
 * approval — see `verticalDramaEpisodePipeline.ts`'s `summarize_episode_to
 * _series_memory` override and `verticalDramaEpisodes.ts`'s
 * `approveCheckpoint` mutation.
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
  executeJsonPlanningCallWithRetry,
  InsufficientCreditsError,
  VdSchemaValidationError,
  VD_COMPACT_JSON_INSTRUCTION,
} from "./verticalDramaStoryBible";
import { resolveQualityLargeContextModelId } from "./verticalDramaImproveScript";
import { resolveVerticalDramaSeriesModel } from "./verticalDramaLlmModelPolicy";
import { debugError } from "../_core/logger";
import {
  verticalDramaLocaleEnglishName,
  type VerticalDramaSeriesLocale,
} from "@shared/verticalDramaSeries";

// Re-exported so callers only need to import from this one module.
export { InsufficientCreditsError, VdSchemaValidationError };

/**
 * Thrown when the per-user `mediaGenerationLimiter` rejects a memory-planning
 * call — mirrors the sibling generation services' `RateLimitExceededError`.
 */
export class RateLimitExceededError extends Error {
  code = "VD_RATE_LIMIT_EXCEEDED" as const;
  constructor(retryAfterMs: number) {
    super(
      `Rate limit exceeded for series memory planning. Try again in ${Math.ceil(retryAfterMs / 1000)} seconds.`
    );
    this.name = "RateLimitExceededError";
  }
}

const SKILL_FOLDER_PATH = path.join(
  "skills",
  "vertical-drama-series-memory-planner"
);

let cachedSystemPrompt: string | null = null;
let cachedSystemPromptTime = 0;
const SYSTEM_PROMPT_CACHE_TTL_MS = 60000; // 1 minute cache, mirrors skillRegistry.ts's CACHE_TTL_MS

/** Mirrors `verticalDramaScriptGeneration.ts`'s `loadSkillSystemPrompt`. */
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
    `Could not locate skill.md for "vertical-drama-series-memory-planner" under any known skills directory`
  );
}

/* -------------------------------------------------------------------------- */
/* Output schema — mirrors schemas/output.schema.json's REQUIRED fields        */
/* -------------------------------------------------------------------------- */

export const seriesMemoryPlannerOutputSchema = z
  .object({
    contract_version: z.literal(1),
    canonical_facts: z.array(z.object({}).passthrough()),
    prior_episode_summaries: z.array(z.object({}).passthrough()),
    unresolved_hooks: z.array(z.object({}).passthrough()),
    resolved_hooks: z.array(z.object({}).passthrough()),
    relationship_state_changes: z.array(z.object({}).passthrough()),
    character_emotional_state: z.array(z.object({}).passthrough()),
    product_tie_in_history: z.array(z.object({}).passthrough()),
    continuity_risks: z.array(z.object({}).passthrough()),
    episode_recap: z.string(),
    memory_compaction_summary: z.string(),
    /**
     * Feature 132 §5.3 (F132B, ledgers-and-story-state) — optional
     * "story-state aware compaction" output (spec §14.1), requested from the
     * `vertical-drama-series-memory-planner` skill only when the
     * `verticalDramaQualityLedgers` tenant flag is on. `.passthrough()`
     * tolerant object (not the full `verticalDramaStoryStateSchema` shape) so
     * a pre-upgrade skill version that omits this key, or one that emits a
     * partially-shaped object, never breaks this schema's tolerant parse —
     * `summarizeEpisodeToMemory` only forwards it into a `story_state`
     * memory event when present.
     */
    story_state: z.object({}).passthrough().optional(),
  })
  .passthrough();

export type SeriesMemoryPlannerOutput = z.infer<
  typeof seriesMemoryPlannerOutputSchema
>;

/* -------------------------------------------------------------------------- */
/* Prompt building                                                            */
/* -------------------------------------------------------------------------- */

export interface RunSeriesMemoryPlanningParams {
  userId: number;
  tenantId?: string;
  seriesId: number;
  episodeId: number;
  episodeNumber: number;
  locale: VerticalDramaSeriesLocale;
  /** Raw (or relevant-subset) output of `vertical-drama-script-builder`. */
  script: Record<string, unknown>;
  /** Raw (or relevant-subset) output of `vertical-drama-storyboard-shotgrid`. */
  storyboard?: Record<string, unknown> | null;
  /** Optional raw (or relevant-subset) output of `vertical-drama-dialogue-audio-planner`. */
  dialoguePlan?: Record<string, unknown> | null;
  /** Prior series memory retrieval bundle (spec §7.6), for continuity grounding. */
  priorMemoryBundle?: unknown;
  /** Forwarded to `deductCredits` so a retried request doesn't double-charge. */
  idempotencyKey?: string;
}

/**
 * Conservative fixed pre-check estimate (credits) for this skill's LLM call —
 * same role as `QUALITY_REVIEW_ESTIMATED_CREDIT_COST` in the sibling quality-
 * review service: reject an obviously-can't-afford-it request BEFORE the LLM
 * call, since there is no token count yet to estimate a real cost from.
 */
const MEMORY_PLANNING_ESTIMATED_CREDIT_COST = 20;

function buildUserPrompt(params: RunSeriesMemoryPlanningParams): string {
  const langInstruction =
    params.locale === "th"
      ? "Write all human-readable string values (summaries, recaps, notes) in natural Thai."
      : `Write all human-readable string values in ${verticalDramaLocaleEnglishName(params.locale)}.`;

  return [
    `episode_number: ${params.episodeNumber}`,
    langInstruction,
    `episode_script:\n${JSON.stringify(params.script)}`,
    params.storyboard
      ? `episode_storyboard:\n${JSON.stringify(params.storyboard)}`
      : "episode_storyboard: (not provided)",
    params.dialoguePlan
      ? `episode_dialogue_plan:\n${JSON.stringify(params.dialoguePlan)}`
      : "episode_dialogue_plan: (not provided)",
    params.priorMemoryBundle
      ? `prior_series_memory (canonical facts, recent episode summaries, open/resolved hooks, continuity warnings, product tie-in fatigue so far):\n${JSON.stringify(params.priorMemoryBundle)}`
      : "prior_series_memory: (none yet — this is treated as the earliest known state)",
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* Generation entry point                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Run the `vertical-drama-series-memory-planner` skill via a direct
 * `executeWithFallback` LLM call. Credit-gated (throws
 * `InsufficientCreditsError` before calling out) and schema-validated
 * (throws `VdSchemaValidationError` on a malformed LLM response) — mirrors
 * `runVerticalDramaEpisodeQualityReview`'s convention exactly, including
 * catching (never bubbling) a post-LLM `deductCredits` failure.
 */
export async function runVerticalDramaSeriesMemoryPlanning(
  params: RunSeriesMemoryPlanningParams
): Promise<{
  planned: SeriesMemoryPlannerOutput;
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
    MEMORY_PLANNING_ESTIMATED_CREDIT_COST
  );
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveVerticalDramaSeriesModel(
    params.seriesId,
    resolveQualityLargeContextModelId
  );
  const systemPrompt = loadSkillSystemPrompt();
  const userPrompt = buildUserPrompt(params);

  // Base ceiling raised from 3000 to 8000 — this skill's output has NINE
  // separate arrays (canonical_facts, prior_episode_summaries,
  // unresolved_hooks, resolved_hooks, relationship_state_changes,
  // character_emotional_state, product_tie_in_history, continuity_risks)
  // plus two prose fields, which grows with series length and is a
  // plausible truncation risk of the same class already hit in the sibling
  // storyboard/start-frame/script generators. Shares the same
  // one-retry-on-truncated/invalid-JSON safety net.
  const { data: validatedData, response } = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.3,
    userId: params.userId,
    maxTokens: 8000,
    schema: seriesMemoryPlannerOutputSchema,
    label: "Series memory planning",
  });

  const usage = response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    model
  );

  // The LLM cost is already sunk by this point — a failure deducting credits
  // must not turn into a 500 that discards an otherwise-valid plan the
  // caller already paid provider cost for. Log for manual reconciliation
  // instead of bubbling the raw error.
  try {
    await deductCredits({
      userId: params.userId,
      tenantId: params.tenantId,
      amount: creditsUsed,
      description: `Vertical Drama — series memory planning (episode #${params.episodeId})`,
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
      "verticalDramaSeriesMemoryPlanning",
      `deductCredits failed after a successful memory-planning call (userId=${params.userId}, episodeId=${params.episodeId}, creditsUsed=${creditsUsed}) — needs manual reconciliation`,
      err
    );
  }

  return { planned: validatedData, creditsUsed, model };
}
