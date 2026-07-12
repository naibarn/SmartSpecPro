/**
 * Vertical Drama Series — the `ledger_plan` job phase (Feature 132 §5, F132B
 * — ledgers-and-story-state; plan
 * `sections/section-03-ledgers-and-story-state.md`).
 *
 * A thin wrapper invoking the `vertical-drama-ledger-planner` skill
 * (`apps/web/skills/vertical-drama-ledger-planner/`) via a direct
 * `executeJsonPlanningCallWithRetry` LLM call — mirrors
 * `verticalDramaSeriesMemoryPlanning.ts`'s (itself mirroring
 * `verticalDramaStoryBible.ts`'s) check-credits -> resolve-model -> call ->
 * validate -> deduct-credits convention exactly, including the "deduct
 * failure never discards an already-generated, already-paid-for result"
 * behavior.
 *
 * Deterministic post-parse validation (never throws): the skill's raw LLM
 * response is only loosely schema-checked by `executeJsonPlanningCallWithRetry`
 * (so a truncated/malformed JSON payload still gets ONE schema-retry, per
 * that shared helper's own convention) — this module's OWN job is the
 * stricter, per-ROW validation against `verticalDramaQualityLedgersSchema`
 * (`shared/verticalDramaSeries/qualityLedgers.ts`): any ledger row that fails
 * its own row schema is DROPPED, never rejected wholesale, mirroring
 * `analyzeSeasonDramaturgy`'s "never throw" convention. The function always
 * returns a fully-valid `VerticalDramaQualityLedgers` (worst case:
 * `emptyQualityLedgers()`), never partially-typed data.
 *
 * Wiring note (this section's own scope boundary): this file does NOT call
 * itself from `generateStoryBibleDeep`/the `deep_generate` job — that
 * orchestration lives inside `verticalDramaStoryBible.ts`, which this
 * section's task brief explicitly excludes from this pass. `onProgress` is
 * accepted so a FUTURE caller inside that pipeline can report
 * `{ phase: "ledger" }` before moving on to per-episode drafting (see
 * `VerticalDramaStoryJobProgressPhase` in `verticalDramaStoryJobs.ts`, which
 * already carries the `"ledger"` phase this call site is meant to report).
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
  type StoredEpisodeBreakdownItem,
} from "./verticalDramaStoryBible";
import { resolveQualityLargeContextModelId } from "./verticalDramaImproveScript";
import { resolveVerticalDramaSeriesModel } from "./verticalDramaLlmModelPolicy";
import { debugError } from "../_core/logger";
import {
  verticalDramaLocaleEnglishName,
  type VerticalDramaSeriesLocale,
} from "@shared/verticalDramaSeries";
import {
  causalChainMapEntrySchema,
  characterActivationLedgerRowSchema,
  consequenceLedgerRowSchema,
  emptyQualityLedgers,
  evidenceLedgerRowSchema,
  threadLedgerRowSchema,
  threatLadderRowSchema,
  worldRuleLedgerRowSchema,
  type VerticalDramaQualityLedgers,
} from "@shared/verticalDramaSeries/qualityLedgers";

// Re-exported so callers only need to import from this one module.
export { InsufficientCreditsError, VdSchemaValidationError };

/**
 * Thrown when the per-user `mediaGenerationLimiter` rejects a ledger-planning
 * call — mirrors the sibling generation services' `RateLimitExceededError`.
 */
export class RateLimitExceededError extends Error {
  code = "VD_RATE_LIMIT_EXCEEDED" as const;
  constructor(retryAfterMs: number) {
    super(
      `Rate limit exceeded for ledger planning. Try again in ${Math.ceil(retryAfterMs / 1000)} seconds.`
    );
    this.name = "RateLimitExceededError";
  }
}

const SKILL_FOLDER_PATH = path.join("skills", "vertical-drama-ledger-planner");

let cachedSystemPrompt: string | null = null;
let cachedSystemPromptTime = 0;
const SYSTEM_PROMPT_CACHE_TTL_MS = 60000; // 1 minute cache, mirrors skillRegistry.ts's CACHE_TTL_MS

/** Mirrors `verticalDramaSeriesMemoryPlanning.ts`'s `loadSkillSystemPrompt`. */
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
    `Could not locate skill.md for "vertical-drama-ledger-planner" under any known skills directory`
  );
}

/* -------------------------------------------------------------------------- */
/* Raw LLM output schema — deliberately LOOSE (see file doc comment: this     */
/* module's own stricter per-ROW validation happens in `validateAndCleanLedgers`). */
/* -------------------------------------------------------------------------- */

const rawLedgerPlannerOutputSchema = z
  .object({
    contract_version: z.literal(1).optional(),
    ledgers: z.object({}).passthrough().optional(),
    causal_chain_map: z.array(z.unknown()).optional(),
    /** Reserved, unused stub — see `skill.md`'s own doc comment (Feature 132 §8, F132H). */
    character_profiles: z.array(z.unknown()).optional(),
  })
  .passthrough();

type RawLedgerPlannerOutput = z.infer<typeof rawLedgerPlannerOutputSchema>;

/**
 * Per-row validation, dropping (never throwing on) any row that fails its
 * own schema — the "deterministic post-parse validation" this section's task
 * brief requires. Returns the count of dropped rows alongside the always-
 * valid `VerticalDramaQualityLedgers`.
 */
export function validateAndCleanLedgers(raw: unknown): {
  ledgers: VerticalDramaQualityLedgers;
  droppedRowCount: number;
} {
  const parsed = rawLedgerPlannerOutputSchema.safeParse(raw);
  const empty = emptyQualityLedgers();
  if (!parsed.success) {
    return { ledgers: empty, droppedRowCount: 0 };
  }

  const rawLedgers = (parsed.data.ledgers ?? {}) as Record<string, unknown>;
  let droppedRowCount = 0;

  function cleanArray<T>(
    rawValue: unknown,
    rowSchema: { safeParse: (v: unknown) => { success: boolean; data?: T } }
  ): T[] {
    if (!Array.isArray(rawValue)) return [];
    const cleaned: T[] = [];
    for (const item of rawValue) {
      const result = rowSchema.safeParse(item);
      if (result.success && result.data !== undefined) {
        cleaned.push(result.data);
      } else {
        droppedRowCount++;
      }
    }
    return cleaned;
  }

  const ledgers: VerticalDramaQualityLedgers = {
    evidenceLedger: cleanArray(rawLedgers.evidenceLedger, evidenceLedgerRowSchema),
    characterActivationLedger: cleanArray(
      rawLedgers.characterActivationLedger,
      characterActivationLedgerRowSchema
    ),
    threatLadder: cleanArray(rawLedgers.threatLadder, threatLadderRowSchema),
    consequenceLedger: cleanArray(rawLedgers.consequenceLedger, consequenceLedgerRowSchema),
    threadLedger: cleanArray(rawLedgers.threadLedger, threadLedgerRowSchema),
    worldRuleLedger: cleanArray(rawLedgers.worldRuleLedger, worldRuleLedgerRowSchema),
    causalChainMap: cleanArray(parsed.data.causal_chain_map, causalChainMapEntrySchema),
  };

  return { ledgers, droppedRowCount };
}

/* -------------------------------------------------------------------------- */
/* Prompt building                                                           */
/* -------------------------------------------------------------------------- */

export interface RunVerticalDramaLedgerPlanningParams {
  userId: number;
  tenantId?: string;
  seriesId: number;
  locale: VerticalDramaSeriesLocale;
  title?: string | null;
  genre?: string | null;
  tone?: string | null;
  /** `bible.refinedCharacters` — see `readBibleRefinedCharacters`. */
  refinedCharacters?: unknown;
  /** `bible.world_rules`/`readItemWorldRules` — see `worldRuleSchema`'s own doc comment. */
  worldRules?: unknown;
  /** The season's currently active breakdown (drafted AND not-yet-drafted episodes). */
  activeBreakdown: StoredEpisodeBreakdownItem[];
  totalEpisodeCount?: number;
  /** Forwarded to `deductCredits` so a retried request doesn't double-charge. */
  idempotencyKey?: string;
  /**
   * Fire-and-forget job-progress hook (mirrors
   * `VerticalDramaStoryJobExecutor`'s own `onProgress` convention) — reports
   * `{ phase: "ledger" }` once, BEFORE the LLM call is made. Optional so a
   * direct/standalone caller (e.g. a test) can omit it entirely.
   */
  onProgress?: (progress: { phase: "ledger" }) => void;
}

/**
 * Conservative fixed pre-check estimate (credits) for this skill's LLM call —
 * same role as the sibling planning services' own fixed estimate constants.
 */
const LEDGER_PLANNING_ESTIMATED_CREDIT_COST = 15;

function buildUserPrompt(params: RunVerticalDramaLedgerPlanningParams): string {
  const langInstruction =
    params.locale === "th"
      ? "Write all human-readable string values (labels, rules, decisions, descriptions) in natural Thai."
      : `Write all human-readable string values in ${verticalDramaLocaleEnglishName(params.locale)}.`;

  return [
    `series_id: ${params.seriesId}`,
    langInstruction,
    params.title ? `title: ${params.title}` : undefined,
    params.genre ? `genre: ${params.genre}` : undefined,
    params.tone ? `tone: ${params.tone}` : undefined,
    params.totalEpisodeCount
      ? `total_episode_count: ${params.totalEpisodeCount}`
      : undefined,
    params.refinedCharacters
      ? `refined_characters:\n${JSON.stringify(params.refinedCharacters)}`
      : "refined_characters: (none known yet)",
    params.worldRules
      ? `world_rules:\n${JSON.stringify(params.worldRules)}`
      : "world_rules: (none known yet)",
    `active_breakdown:\n${JSON.stringify(params.activeBreakdown)}`,
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* Generation entry point                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Run the `vertical-drama-ledger-planner` skill via a direct
 * `executeJsonPlanningCallWithRetry` LLM call. Credit-gated (throws
 * `InsufficientCreditsError` before calling out) — mirrors
 * `runVerticalDramaSeriesMemoryPlanning`'s convention exactly, including
 * catching (never bubbling) a post-LLM `deductCredits` failure.
 *
 * Unlike the sibling memory-planning service, a malformed/garbage LLM
 * response does NOT throw `VdSchemaValidationError` here — the raw output
 * schema is deliberately loose, and `validateAndCleanLedgers` drops invalid
 * ROWS rather than failing the whole call (see this file's own doc
 * comment). `VdSchemaValidationError` is still thrown by the underlying
 * `executeJsonPlanningCallWithRetry` when the LLM response isn't even valid
 * JSON and the one schema-retry also fails — that failure mode is outside
 * this module's control, matching every other planning call in this
 * codebase.
 */
export async function runVerticalDramaLedgerPlanning(
  params: RunVerticalDramaLedgerPlanningParams
): Promise<{
  ledgers: VerticalDramaQualityLedgers;
  droppedRowCount: number;
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
    LEDGER_PLANNING_ESTIMATED_CREDIT_COST
  );
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  params.onProgress?.({ phase: "ledger" });

  const model = await resolveVerticalDramaSeriesModel(
    params.seriesId,
    resolveQualityLargeContextModelId
  );
  const systemPrompt = loadSkillSystemPrompt();
  const userPrompt = buildUserPrompt(params);

  const { data: rawData, response } = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.3,
    userId: params.userId,
    maxTokens: 8000,
    schema: rawLedgerPlannerOutputSchema,
    label: "Vertical Drama ledger planning",
  });

  const { ledgers, droppedRowCount } = validateAndCleanLedgers(
    rawData as RawLedgerPlannerOutput
  );

  const usage = response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    model
  );

  // The LLM cost is already sunk by this point — a failure deducting credits
  // must not turn into a 500 that discards an otherwise-valid ledger plan the
  // caller already paid provider cost for. Log for manual reconciliation
  // instead of bubbling the raw error.
  try {
    await deductCredits({
      userId: params.userId,
      tenantId: params.tenantId,
      amount: creditsUsed,
      description: `Vertical Drama — quality ledger planning (series #${params.seriesId})`,
      sourceType: "skill",
      idempotencyKey: params.idempotencyKey,
      metadata: {
        model,
        llmModel: model,
        feature: "vertical_drama_series",
        seriesId: params.seriesId,
        inputTokens: usage?.prompt_tokens ?? 0,
        outputTokens: usage?.completion_tokens ?? 0,
        droppedRowCount,
      },
    });
  } catch (err) {
    debugError(
      "verticalDramaLedgerPlanner",
      `deductCredits failed after a successful ledger-planning call (userId=${params.userId}, seriesId=${params.seriesId}, creditsUsed=${creditsUsed}) — needs manual reconciliation`,
      err
    );
  }

  return { ledgers, droppedRowCount, creditsUsed, model };
}
