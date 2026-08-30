/**
 * Vertical Drama Series — Season Carry-Over Planner (Stage 2.2,
 * `planning/vd-series-memory-and-lineage/plan.md`).
 *
 * AI proposes what to do with a parent series' cast/relationships/threads
 * for a new season ("ภาค 2"); the user reviews/edits the draft before it is
 * ever persisted. Structurally identical to
 * `synthesizeVerticalDramaPreset`/`buildUserPrompt`
 * (`./verticalDramaPresetSynthesis.ts`) — the proven "LLM call -> transient
 * draft -> caller decides whether to apply" shape already used by THIS SAME
 * wizard (`synthesizeGenrePreset` -> `CreateSeriesWizard.tsx`'s
 * `applyPresetDraft`). No database writes happen here; the router's
 * `proposeSeasonCarryOver` procedure returns the draft directly, and
 * `create` is the only place a user-approved/edited version is ever
 * persisted (into `series.lineage.carryOver`).
 *
 * Skill-first split (project rule, `feedback_skill_first_authoring`): this
 * service computes and feeds ONLY facts — the parent's roster + its
 * `series.memory` projection (`compactSummary` + `currentState`, NEVER the
 * parent's full episode-by-episode content: a series may have 20-100
 * sub-episodes, and bounding this input is Part 1's entire reason to
 * exist). `carriedRelationships`/`carriedThreads` on the RETURNED draft are
 * a deterministic TS COPY of `lineageContext.currentState.relationships`/
 * `.openThreads` — the LLM never invents or edits them, it only reads them
 * as context; the skill's judgment is scoped to `characters[]`
 * availability decisions, `newCharacterSuggestions`,
 * `newConflictDirections`, and `antagonistStrategy`. All CRAFT judgment
 * (earning a villain's release, writing out vs. flashback for a dead
 * character, what counts as a genuinely new conflict vs. a re-run, how
 * relationships must have moved since the finale) lives in
 * `skills/vertical-drama-season-carry-over-planner/skill.md` — nothing
 * here hardcodes those rules.
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import { parseSkillFile } from "@smartspec/skills";
import {
  hasEnoughCredits,
  deductCredits,
  calculateCreditsForLLM,
} from "./creditService";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "./skillFiles";
import {
  executeJsonPlanningCallWithRetry,
  InsufficientCreditsError,
  resolveStoryBibleModel,
  VD_COMPACT_JSON_INSTRUCTION,
} from "./verticalDramaStoryBible";
import { renderCriteriaVersionMarker } from "./verticalDramaQualityCriteria";
import type { VerticalDramaLineageContext } from "./verticalDramaSeriesLineage";
import {
  VERTICAL_DRAMA_CARRY_OVER_AVAILABILITIES,
  type VerticalDramaSeasonCarryOverDraft,
} from "@shared/verticalDramaSeries/lineage";
import type { VerticalDramaSeriesLocale } from "@shared/verticalDramaSeries";

const SKILL_FOLDER_PATH = path.join(
  "skills",
  "vertical-drama-season-carry-over-planner"
);

let cachedSystemPrompt: string | null = null;

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
    `Could not locate skill.md for "vertical-drama-season-carry-over-planner" under any known skills directory`
  );
}

/* -------------------------------------------------------------------------- */
/* LLM output — ONLY the fields the skill exercises judgment on.              */
/* `carriedRelationships`/`carriedThreads` are NOT part of this schema — they */
/* are copied deterministically from `VerticalDramaLineageContext.currentState`*/
/* by `synthesizeSeasonCarryOver` below, never produced by the model.        */
/* -------------------------------------------------------------------------- */

const optionalCharacterProseSchema = z.preprocess(
  value => {
    if (value === null || value === undefined) return undefined;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  },
  z.string().min(1).optional(),
);

const carryOverCharacterSchema = z
  .object({
    characterKey: z.string().min(1),
    name: z.string().min(1),
    postFinaleStatus: z.string().min(1),
    availability: z.enum(VERTICAL_DRAMA_CARRY_OVER_AVAILABILITIES),
    returnJustification: optionalCharacterProseSchema,
    suggestedStateUpdate: optionalCharacterProseSchema,
  })
  .superRefine((character, ctx) => {
    if (
      character.availability === "returns_with_explanation" &&
      !character.returnJustification
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["returnJustification"],
        message:
          "returnJustification is required when availability is returns_with_explanation",
      });
    }
  });

const seasonCarryOverLlmDraftSchema = z.object({
  contract_version: z.literal(1),
  characters: z.array(carryOverCharacterSchema).min(1),
  newCharacterSuggestions: z.array(z.string().min(1)).default([]),
  newConflictDirections: z.array(z.string().min(1)).min(1),
  antagonistStrategy: z.string().min(1),
});

export type SeasonCarryOverLlmDraft = z.infer<
  typeof seasonCarryOverLlmDraftSchema
>;

export interface SynthesizeSeasonCarryOverParams {
  userId: number;
  tenantId?: string;
  locale: VerticalDramaSeriesLocale;
  /** Free-form "โจทย์เรื่องภาคใหม่ที่อยากได้", same top-level convention as `createSeriesInput.userPremise`. */
  premise?: string;
  lineageContext: VerticalDramaLineageContext;
}

function langInstruction(locale: VerticalDramaSeriesLocale): string {
  return locale === "th"
    ? "Write ALL user-facing string values in natural Thai."
    : "Write all user-facing string values in English.";
}

function buildUserPrompt(params: SynthesizeSeasonCarryOverParams): string {
  const ctx = params.lineageContext;
  const rosterPayload = ctx.roster.map(character => ({
    characterKey: character.characterKey,
    name: character.name,
    role: character.role,
    narrativeRole: character.narrativeRole,
    currentState:
      character.data && typeof character.data === "object"
        ? (character.data as Record<string, unknown>).currentState
        : undefined,
  }));

  const payload = {
    language: params.locale,
    parentTitle: ctx.parentTitle,
    parentGenre: ctx.parentGenre,
    parentTone: ctx.parentTone,
    premise: params.premise?.trim() || undefined,
    hasRecordedMemory: ctx.hasMemory,
    memoryCoverage: {
      episodesRecorded: ctx.memoryEpisodesRecorded,
      parentEpisodeCount: ctx.parentEpisodeCount,
    },
    seriesMemorySummary: ctx.compactSummary || "(no recorded memory yet)",
    relationships: ctx.currentState.relationships,
    openThreads: ctx.currentState.openThreads,
    canonicalFacts: ctx.currentState.canonicalFacts,
    roster: rosterPayload,
    rules: [
      "Decide EVERY roster character's availability for the new season: returns | returns_with_explanation | write_out | cameo_only.",
      `"availability" MUST be exactly one of: ${VERTICAL_DRAMA_CARRY_OVER_AVAILABILITIES.join(", ")}.`,
      "returnJustification is REQUIRED when availability is returns_with_explanation.",
      "For every other availability, omit returnJustification or return null — never return an empty string.",
      "suggestedStateUpdate is optional; omit it or return null when there is no meaningful update — never return an empty string.",
      "characterKey values MUST be copied verbatim from the roster payload — never invent a new one.",
      "Use compact JSON only.",
    ],
  };

  return [
    renderCriteriaVersionMarker(),
    langInstruction(params.locale),
    "Plan the next season's cast carry-over from this parent series payload:",
    JSON.stringify(payload),
    "Return exactly this JSON shape:",
    '{"contract_version":1,"characters":[{"characterKey":string,"name":string,"postFinaleStatus":string,"availability":string,"returnJustification":string|null,"suggestedStateUpdate":string|null}],"newCharacterSuggestions":[string],"newConflictDirections":[string],"antagonistStrategy":string}',
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n");
}

export class SeasonCarryOverInputError extends Error {
  code = "SEASON_CARRY_OVER_INPUT_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "SeasonCarryOverInputError";
  }
}

/**
 * Proposes a season carry-over draft for a parent series already loaded by
 * the caller (`loadOwnedSeries` + `loadLineageContext` — see this module's
 * header doc comment on why this file never checks ownership itself). No
 * DB writes. `carriedRelationships`/`carriedThreads` on the returned draft
 * are copied verbatim from `params.lineageContext.currentState` — never
 * produced by the model.
 */
export async function synthesizeSeasonCarryOver(
  params: SynthesizeSeasonCarryOverParams
): Promise<{
  draft: VerticalDramaSeasonCarryOverDraft;
  creditsUsed: number;
  model: string;
}> {
  if (params.lineageContext.roster.length === 0) {
    throw new SeasonCarryOverInputError(
      "The selected parent series has no character roster to carry over"
    );
  }

  const hasCredits = await hasEnoughCredits(params.userId, 1);
  if (!hasCredits) {
    throw new InsufficientCreditsError();
  }

  const model = await resolveStoryBibleModel();
  const systemPrompt = loadSkillSystemPrompt();
  const userPrompt = buildUserPrompt(params);

  const { data: llmDraft, response } = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.7,
    userId: params.userId,
    maxTokens: 3500,
    schema: seasonCarryOverLlmDraftSchema,
    label: "Season carry-over planning",
  });

  const draft: VerticalDramaSeasonCarryOverDraft = {
    contractVersion: 1,
    characters: llmDraft.characters,
    newCharacterSuggestions: llmDraft.newCharacterSuggestions,
    newConflictDirections: llmDraft.newConflictDirections,
    antagonistStrategy: llmDraft.antagonistStrategy,
    // Deterministic TS copy — see header doc comment; never LLM-produced.
    carriedRelationships: params.lineageContext.currentState.relationships,
    carriedThreads: params.lineageContext.currentState.openThreads,
  };

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
    contextRef: params.tenantId ? { contextType: "series", sourceType: "vertical_drama_series", sourceId: String(params.lineageContext.parentSeriesId) } : undefined,
    description: "Vertical Drama — season carry-over planning",
    skillSlug: "vertical-drama-season-carry-over-planner",
    sourceType: "skill",
    metadata: {
      model,
      llmModel: model,
      feature: "vertical_drama_season_carry_over",
      parentSeriesId: params.lineageContext.parentSeriesId,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  });

  return { draft, creditsUsed, model };
}
