/**
 * Vertical Drama Series — "generate next episodes" continuation (spec feature
 * 131 addendum). Mirrors `verticalDramaStoryBible.ts`'s
 * check-credits -> resolve-model -> call -> validate -> deduct convention for
 * the LLM-continuation half of the feature.
 *
 * This file only covers the LLM call (Mode B). Mode A ("materialize from
 * plan" — taking unused `bible.episodeBreakdown` entries with no LLM call) is
 * plain data selection and lives in `verticalDramaEpisodes.ts`'s
 * `generateNextEpisodes` procedure directly, since it needs no service-layer
 * credit/LLM plumbing.
 */

import { z } from "zod";
import {
  episodeBreakdownItemSchema,
  executeJsonPlanningCallWithRetry,
  InsufficientCreditsError,
  VdSchemaValidationError,
  VD_COMPACT_JSON_INSTRUCTION,
} from "./verticalDramaStoryBible";
import { resolveQualityLargeContextModelId } from "./verticalDramaImproveScript";
import { resolveVerticalDramaSeriesModel } from "./verticalDramaLlmModelPolicy";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "./creditService";
import {
  verticalDramaLocaleEnglishName,
  type VerticalDramaSeriesLocale,
} from "@shared/verticalDramaSeries";
import { renderCriteriaVersionMarker } from "./verticalDramaQualityCriteria";

// Re-exported so callers only need to import from this one module.
export { InsufficientCreditsError, VdSchemaValidationError };

export type EpisodeBreakdownItem = z.infer<typeof episodeBreakdownItemSchema>;

/** Light continuity projection of an already-existing episode (real row or planned breakdown entry). */
export interface ExistingEpisodeContext {
  episodeNumber: number;
  title: string | null;
  logline?: string;
  keyBeats?: string[];
}

interface GenerateNextEpisodesViaLlmParams {
  userId: number;
  tenantId?: string;
  seriesId: number;
  title: string;
  locale: VerticalDramaSeriesLocale;
  genre?: string | null;
  tone?: string | null;
  /** The series' `bible` jsonb (raw wizard fields and/or expanded fields — whichever exist). */
  bible: Record<string, unknown>;
  /** Every episode written so far (real rows + already-materialized plan entries), oldest first. */
  existingEpisodes: ExistingEpisodeContext[];
  /** The first NEW episode number this call must produce. */
  nextEpisodeNumber: number;
  /** How many new episodes to generate (already capped at 5 by the router's Zod input). */
  count: number;
}

interface GenerateNextEpisodesViaLlmResult {
  generated: EpisodeBreakdownItem[];
  previousEpisodeBridge: {
    episodeNumber: number;
    logline?: string;
    keyBeats?: string[];
  } | null;
  creditsUsed: number;
  model: string;
}

const continuationResponseSchema = z.object({
  episodes: z.array(episodeBreakdownItemSchema).min(1),
  previousEpisodeBridge: z
    .object({
      episodeNumber: z.number().int().positive(),
      logline: z.string().min(1).optional(),
      keyBeats: z.array(z.string().min(1)).min(1).optional(),
    })
    .optional(),
});

function buildContinuationPrompts(
  params: GenerateNextEpisodesViaLlmParams,
): { systemPrompt: string; userPrompt: string } {
  const langInstruction =
    params.locale === "th"
      ? "Write ALL string values in natural Thai."
      : `Write all string values in ${verticalDramaLocaleEnglishName(params.locale)}.`;

  const systemPrompt = [
    "You are continuing an existing vertical-drama (short-form mobile drama series) story bible.",
    renderCriteriaVersionMarker(),
    "You are given the series' plot/tone/character setup PLUS every episode written so far, and must invent what comes NEXT.",
    langInstruction,
    "Respond with ONLY a single JSON object (no markdown, no commentary) matching exactly this shape:",
    '{"previousEpisodeBridge": {"episodeNumber": number, "logline": string, "keyBeats": string[]}, "episodes": [{"episodeNumber": number, "workingTitle": string, "logline": string, "keyBeats": string[]}]}',
    `"episodes" must contain exactly ${params.count} NEW entries, numbered starting at ${params.nextEpisodeNumber} and increasing by 1, each with 3-5 short keyBeats.`,
    `Also revise the immediately previous episode (${params.nextEpisodeNumber - 1}) just enough to bridge into the new continuation. Put that in "previousEpisodeBridge" with episodeNumber ${params.nextEpisodeNumber - 1}; do not rewrite earlier episodes.`,
    `Continue the story with new episodes numbered starting at ${params.nextEpisodeNumber}, maintaining tone/plot/character consistency with everything above. Do not repeat prior beats.`,
  ].join("\n");

  const bible = params.bible ?? {};
  const seasonArc = (bible.expandedSeasonArc as string) || (bible.seasonArc as string) || "";
  const mainPlot = (bible.mainPlot as string) || "";
  const cliffhangerStyle = (bible.cliffhangerStyle as string) || "";
  const characters = Array.isArray(bible.refinedCharacters)
    ? bible.refinedCharacters
    : (bible.charactersDraft as string) || "";

  const userPrompt = [
    `Series title: ${params.title}`,
    params.genre ? `Genre: ${params.genre}` : null,
    params.tone ? `Tone: ${params.tone}` : null,
    mainPlot ? `Main plot: ${mainPlot}` : null,
    seasonArc ? `Season arc: ${seasonArc}` : null,
    cliffhangerStyle ? `Cliffhanger style: ${cliffhangerStyle}` : null,
    `Characters: ${JSON.stringify(characters)}`,
    `Existing episodes so far (for continuity — do not repeat these beats): ${JSON.stringify(params.existingEpisodes)}`,
    `Generate exactly ${params.count} new episodes starting at episode number ${params.nextEpisodeNumber}.`,
    `If there is an existing episode ${params.nextEpisodeNumber - 1}, revise only its final bridge beat/logline so it naturally leads into episode ${params.nextEpisodeNumber}; keep its core outcome intact.`,
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n");

  return { systemPrompt, userPrompt };
}

/**
 * Generate `count` MORE episode-breakdown entries that continue an existing
 * vertical-drama series, via a real LLM call. Credit-gated (throws
 * `InsufficientCreditsError` before calling out) and schema-validated (throws
 * `VdSchemaValidationError` on a malformed or incomplete LLM response) —
 * mirrors `generateStoryBible`'s check-credits -> call -> deduct-credits
 * convention exactly. All-or-nothing: never returns fewer than `count`
 * entries — a short response is treated as a validation failure so the
 * caller never partially inserts a Mode-B batch.
 */
export async function generateNextEpisodesViaLlm(
  params: GenerateNextEpisodesViaLlmParams,
): Promise<GenerateNextEpisodesViaLlmResult> {
  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveVerticalDramaSeriesModel(
    params.seriesId,
    resolveQualityLargeContextModelId,
  );
  const { systemPrompt, userPrompt } = buildContinuationPrompts(params);

  // Base ceiling raised from 3000 to 6000 — up to 5 new episodes (already
  // capped by the router's Zod input), each with a workingTitle/logline/3-5
  // keyBeats, is large enough to risk the same truncation class already hit
  // in the sibling generators. Shares the same one-retry-on-truncated/
  // invalid-JSON safety net.
  const { data: validatedData, response } = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.8,
    userId: params.userId,
    maxTokens: 6000,
    schema: continuationResponseSchema,
    label: "Episode continuation",
  });

  // All-or-nothing: a batch that comes back short of `count` is a validation
  // failure, never a partial success — the router must not insert some
  // Mode-B episodes and silently drop the rest.
  if (validatedData.episodes.length < params.count) {
    throw new VdSchemaValidationError(
      `Episode continuation response returned ${validatedData.episodes.length} episodes, expected ${params.count}`,
      { episodes: validatedData.episodes },
    );
  }
  const generated = validatedData.episodes.slice(0, params.count);
  const expectedBridgeEpisodeNumber = params.nextEpisodeNumber - 1;
  const previousEpisodeBridge =
    validatedData.previousEpisodeBridge?.episodeNumber === expectedBridgeEpisodeNumber
      ? {
          episodeNumber: validatedData.previousEpisodeBridge.episodeNumber,
          logline: validatedData.previousEpisodeBridge.logline,
          keyBeats: validatedData.previousEpisodeBridge.keyBeats,
        }
      : null;

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
    description: `Vertical Drama — generate next episodes (series #${params.seriesId})`,
    sourceType: "skill",
    metadata: {
      model,
      llmModel: model,
      feature: "vertical_drama_series",
      seriesId: params.seriesId,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  });

  return { generated, previousEpisodeBridge, creditsUsed, model };
}
