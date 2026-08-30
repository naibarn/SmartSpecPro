/**
 * Vertical Drama Series — genre proposal service (Stage 1.5 follow-up,
 * `planning/vd-series-memory-and-lineage/plan.md`, task #7).
 *
 * Real dev-DB data proved `vertical_drama_series.genre` holds a logline or an
 * alternate title for effectively every existing series (see
 * `@shared/verticalDramaSeries/genrePollutionGuard`'s header doc comment).
 * The product owner's explicit instruction for repairing this data is
 * "AI เสนอแนวเรื่อง + ผมอนุมัติ" (the AI proposes a genre, the owner
 * approves) — this service is the "AI proposes" half. It NEVER writes to the
 * database itself; `scripts/repair-vertical-drama-genre-pollution.ts` is the
 * only caller, and even that script only ever applies a mutation from a
 * human-reviewed/approved file (see that script's header doc comment).
 *
 * Invokes the `vertical-drama-genre-normalizer` skill
 * (`apps/web/skills/vertical-drama-genre-normalizer/`) via a direct LLM call
 * — mirrors `verticalDramaSeriesMemoryPlanning.ts`'s (itself mirroring
 * `verticalDramaStoryBible.ts`'s) check-credits -> resolve-model -> call ->
 * validate -> deduct-credits convention exactly, including the "deduct
 * failure never discards an already-generated, already-paid-for result"
 * behavior, and the same `resolveQualityLargeContextModelId` model-tier
 * choice as its nearest siblings (`verticalDramaEpisodeQualityReview.ts`,
 * `verticalDramaSeriesMemoryPlanning.ts`) — this is a judgment call over
 * story content, not a large-context generation task, but this codebase's
 * cost policy is "never change model selection to fix a problem", so this
 * file does not invent a new/cheaper resolver either; it reuses the
 * established judgment-call resolver unchanged.
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
  GENRE_PRESET_CATEGORY_LABELS,
  type VerticalDramaSeriesLocale,
} from "@shared/verticalDramaSeries";

// Re-exported so callers only need to import from this one module.
export { InsufficientCreditsError, VdSchemaValidationError };

/** Mirrors the sibling generation services' `RateLimitExceededError`. */
export class RateLimitExceededError extends Error {
  code = "VD_RATE_LIMIT_EXCEEDED" as const;
  constructor(retryAfterMs: number) {
    super(
      `Rate limit exceeded for genre proposal. Try again in ${Math.ceil(retryAfterMs / 1000)} seconds.`
    );
    this.name = "RateLimitExceededError";
  }
}

const SKILL_FOLDER_PATH = path.join(
  "skills",
  "vertical-drama-genre-normalizer"
);

let cachedSystemPrompt: string | null = null;

/** Mirrors `verticalDramaSeriesMemoryPlanning.ts`'s `loadSkillSystemPrompt`. */
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
    `Could not locate skill.md for "vertical-drama-genre-normalizer" under any known skills directory`
  );
}

/* -------------------------------------------------------------------------- */
/* Facts — pure, no I/O                                                       */
/* -------------------------------------------------------------------------- */

/** Bounded reference vocabulary the skill is told to align proposals to (see `skill.md`). Computed once. */
const GENRE_REFERENCE_VOCABULARY: string[] = Array.from(
  new Set(Object.values(GENRE_PRESET_CATEGORY_LABELS).map(label => label.th))
);

const BIBLE_FIELD_MAX_CHARS = 500;
const EPISODE_LOGLINE_MAX_CHARS = 200;
const EPISODE_SAMPLE_MAX = 5;
const EPISODE_KEY_BEATS_MAX = 4;

export interface GenreProposalEpisodeSample {
  episodeNumber: number;
  workingTitle?: string;
  logline?: string;
  keyBeats?: string[];
}

export interface GenreProposalFacts {
  title: string;
  currentGenre: string | null;
  logline?: string;
  mainPlot?: string;
  seasonArc?: string;
  episodeSamples: GenreProposalEpisodeSample[];
  genreVocabulary: string[];
}

function truncateString(value: unknown, maxChars: number): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, maxChars)
    : undefined;
}

/**
 * Picks a bounded, evenly-spread sample of episode indices so a 30-episode
 * series costs the same token budget as a 6-episode one: the first 3 and
 * last 2 episodes (covers the opening hook and the current/most-recent
 * beats), or every episode when there are 5 or fewer.
 */
function pickBoundedSampleIndices(length: number, max: number): number[] {
  if (length <= max) {
    return Array.from({ length }, (_, i) => i);
  }
  const headCount = Math.max(1, max - 2);
  const head = Array.from({ length: headCount }, (_, i) => i);
  const tail = Array.from({ length: max - headCount }, (_, i) => length - (max - headCount) + i);
  return Array.from(new Set([...head, ...tail])).sort((a, b) => a - b);
}

/**
 * Pure — builds the bounded, token-safe fact bundle fed to the skill for one
 * series. Never truncates silently past the point of losing genre-relevant
 * signal (title + current genre are never truncated); only the free-text
 * bible fields and episode sample are bounded, since those can grow
 * unbounded with series length (some series have 30 episodes).
 */
export function buildGenreProposalFacts(row: {
  title: string;
  genre: string | null;
  bible: Record<string, unknown> | null | undefined;
}): GenreProposalFacts {
  const bible = row.bible ?? {};
  const episodeBreakdown = Array.isArray((bible as Record<string, unknown>).episodeBreakdown)
    ? ((bible as Record<string, unknown>).episodeBreakdown as unknown[])
    : [];
  const sampleIndices = pickBoundedSampleIndices(episodeBreakdown.length, EPISODE_SAMPLE_MAX);

  const episodeSamples: GenreProposalEpisodeSample[] = sampleIndices.map(index => {
    const episode = (episodeBreakdown[index] ?? {}) as Record<string, unknown>;
    const keyBeats = Array.isArray(episode.keyBeats)
      ? episode.keyBeats
          .filter((beat): beat is string => typeof beat === "string" && beat.trim().length > 0)
          .slice(0, EPISODE_KEY_BEATS_MAX)
      : undefined;
    return {
      episodeNumber:
        typeof episode.episodeNumber === "number" ? episode.episodeNumber : index + 1,
      workingTitle: truncateString(episode.workingTitle, EPISODE_LOGLINE_MAX_CHARS),
      logline: truncateString(episode.logline, EPISODE_LOGLINE_MAX_CHARS),
      keyBeats: keyBeats && keyBeats.length > 0 ? keyBeats : undefined,
    };
  });

  return {
    title: row.title,
    currentGenre: row.genre,
    logline: truncateString((bible as Record<string, unknown>).logline, BIBLE_FIELD_MAX_CHARS),
    mainPlot: truncateString((bible as Record<string, unknown>).mainPlot, BIBLE_FIELD_MAX_CHARS),
    seasonArc: truncateString((bible as Record<string, unknown>).seasonArc, BIBLE_FIELD_MAX_CHARS),
    episodeSamples,
    genreVocabulary: GENRE_REFERENCE_VOCABULARY,
  };
}

/* -------------------------------------------------------------------------- */
/* Output schema                                                              */
/* -------------------------------------------------------------------------- */

export const genreProposalOutputSchema = z
  .object({
    contract_version: z.literal(1),
    decision: z.enum(["keep", "change"]),
    proposed_genre: z.string().trim().min(1).max(150),
    rationale: z.string().trim().min(1),
  })
  .passthrough();

export type GenreProposalOutput = z.infer<typeof genreProposalOutputSchema>;

/* -------------------------------------------------------------------------- */
/* Prompt building                                                            */
/* -------------------------------------------------------------------------- */

function buildUserPrompt(
  facts: GenreProposalFacts,
  locale: VerticalDramaSeriesLocale
): string {
  const langInstruction =
    locale === "th"
      ? "Write `rationale` in natural Thai. `proposed_genre` should be in Thai unless the current genre/story is clearly in another language."
      : `Write \`rationale\` in ${verticalDramaLocaleEnglishName(locale)}.`;

  return [
    `title: ${facts.title}`,
    `current_genre: ${facts.currentGenre ?? "(empty)"}`,
    langInstruction,
    facts.logline ? `bible_logline: ${facts.logline}` : "bible_logline: (not available)",
    facts.mainPlot ? `bible_main_plot: ${facts.mainPlot}` : "bible_main_plot: (not available)",
    facts.seasonArc ? `bible_season_arc: ${facts.seasonArc}` : "bible_season_arc: (not available)",
    facts.episodeSamples.length > 0
      ? `episode_samples:\n${JSON.stringify(facts.episodeSamples)}`
      : "episode_samples: (no episodes drafted yet)",
    `reference_genre_vocabulary:\n${JSON.stringify(facts.genreVocabulary)}`,
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* Generation entry point                                                    */
/* -------------------------------------------------------------------------- */

export interface RunVerticalDramaGenreProposalParams {
  userId: number;
  tenantId?: string;
  seriesId: number;
  locale: VerticalDramaSeriesLocale;
  facts: GenreProposalFacts;
  /** Forwarded to `deductCredits` so a retried request doesn't double-charge. */
  idempotencyKey?: string;
}

/**
 * Conservative fixed pre-check estimate (credits) for this skill's LLM call
 * — same role as the sibling services' fixed estimates. Output is much
 * smaller than the memory-planner's (a genre label + a sentence, not nine
 * arrays), so the estimate is correspondingly small.
 */
const GENRE_PROPOSAL_ESTIMATED_CREDIT_COST = 5;

/**
 * Run the `vertical-drama-genre-normalizer` skill via a direct LLM call for
 * ONE series. Credit-gated (throws `InsufficientCreditsError` before calling
 * out) and schema-validated (throws `VdSchemaValidationError` on a malformed
 * LLM response) — mirrors `runVerticalDramaSeriesMemoryPlanning`'s
 * convention exactly, including catching (never bubbling) a post-LLM
 * `deductCredits` failure.
 */
export async function runVerticalDramaGenreProposal(
  params: RunVerticalDramaGenreProposalParams
): Promise<{
  proposed: GenreProposalOutput;
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
    GENRE_PROPOSAL_ESTIMATED_CREDIT_COST
  );
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveVerticalDramaSeriesModel(
    params.seriesId,
    resolveQualityLargeContextModelId
  );
  const systemPrompt = loadSkillSystemPrompt();
  const userPrompt = buildUserPrompt(params.facts, params.locale);

  const { data: validatedData, response } = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.2,
    userId: params.userId,
    maxTokens: 600,
    schema: genreProposalOutputSchema,
    label: "Genre proposal",
  });

  const usage = response.usage;
  const creditsUsed = calculateCreditsForLLM(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    model
  );

  // The LLM cost is already sunk by this point — a failure deducting credits
  // must not turn into a thrown error that discards an otherwise-valid
  // proposal the caller already paid provider cost for. Log for manual
  // reconciliation instead of bubbling the raw error.
  try {
    await deductCredits({
      userId: params.userId,
      tenantId: params.tenantId,
      amount: creditsUsed,
      description: `Vertical Drama — genre proposal (series #${params.seriesId})`,
      skillSlug: "vertical-drama-genre-normalizer",
      sourceType: "skill",
      idempotencyKey: params.idempotencyKey,
      metadata: {
        model,
        llmModel: model,
        feature: "vertical_drama_series",
        seriesId: params.seriesId,
        inputTokens: usage?.prompt_tokens ?? 0,
        outputTokens: usage?.completion_tokens ?? 0,
      },
    });
  } catch (err) {
    debugError(
      "verticalDramaGenreProposal",
      `deductCredits failed after a successful genre-proposal call (userId=${params.userId}, seriesId=${params.seriesId}, creditsUsed=${creditsUsed}) — needs manual reconciliation`,
      err
    );
  }

  return { proposed: validatedData, creditsUsed, model };
}
