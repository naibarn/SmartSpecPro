/**
 * Vertical Drama Series — Special Edition Planner (Stage 2.5,
 * `planning/vd-series-memory-and-lineage/plan.md`).
 *
 * AI proposes the STORY SHAPE of a short (1-2 sub-episode) "ภาคพิเศษ" special
 * edition — which characters are used and why, per-episode briefs sized
 * proportionately (never season-finale-shaped), and the continuity facts the
 * draft must respect. Structurally IDENTICAL to
 * `synthesizeSeasonCarryOver`/`verticalDramaSeasonCarryOver.ts` (Stage
 * 2.2) — same "LLM call -> transient draft -> caller/user decides" shape, no
 * database writes here. The router's `proposeSpecialEditionBrief` procedure
 * returns the draft directly; nothing is persisted until the user reviews/
 * edits it and `create` runs.
 *
 * Skill-first split (project rule, `feedback_skill_first_authoring`): this
 * service computes and feeds ONLY facts — the parent's `series.memory`
 * projection (`compactSummary` + `currentState`, NEVER the parent's full
 * episode-by-episode content — a parent may have 20-100 sub-episodes, and
 * bounding this input is the entire reason Part 1 of this feature exists),
 * the roster, the chosen story-function ("review" vs "tie_in_solution"), the
 * source facts (marketplace product or uploaded-image summary), and the
 * requested episode count. ALL craft judgment — what makes a special feel
 * "เนียน", how a character's want earns the product/place its screen time,
 * how to size `protagonistStake`/`pricePaid` down from season-finale scale,
 * never re-opening the season's plot, staying consistent with `disclosure`/
 * `characterKnowledge` — lives ENTIRELY in
 * `skills/vertical-drama-special-edition-planner/skill.md`. Nothing here
 * hardcodes any of that.
 *
 * `composeSpecialEditionUserPremise` below is the hand-off to the ONE
 * existing generic channel that already reaches the (untouched)
 * `vertical-drama-full-story-architect` skill: `bible.userPremise`, which
 * `buildDeepDraftPrompts` (`verticalDramaStoryBible.ts`) ALWAYS renders as a
 * "USER PREMISE (PRIMARY)" block whenever a non-empty string is present —
 * see that function's own doc comment. `create` already merges
 * `createSeriesInput.userPremise` into `bible.userPremise`
 * UNCONDITIONALLY (no additional wiring needed there) — so the wizard's
 * flow is: call `proposeSpecialEditionBrief` -> show `suggestedUserPremise`
 * in an editable field -> user edits freely ("custom ได้จริง" is a hard
 * owner requirement) -> send the FINAL text back as `createSeriesInput.
 * userPremise` on `create`. `composeSpecialEditionUserPremise` is pure
 * TS FORMATTING of already-LLM-decided fields (premise/episodeBriefs/
 * continuityNotes) into one string — it does not invent any story content,
 * matching this file's own "TS computes facts, never judgment" rule.
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
// TYPE-ONLY import (erased at compile time, no runtime module access) — a
// VALUE import of `VD_SPECIAL_EDITION_STORY_FUNCTION_CHOICES` from
// `verticalDramaProductTieIn.ts` was tried first and reverted: this module
// is statically imported by `verticalDramaSeries.ts` (the router), so a
// runtime dependency here would make `verticalDramaProductTieIn.ts` load
// eagerly for EVERY router test, breaking existing tests
// (`verticalDramaSeries.listProductImages.test.ts`) that `vi.mock` it
// partially (that module was previously only ever reached via `await
// import(...)`, never a static top-of-file import). The literal tuple is
// therefore duplicated below — see that constant's own doc comment for the
// values; kept in sync by `verticalDramaSpecialEditionPlanner.skillContent
// .test.ts` + `verticalDramaProductTieIn.test.ts` both asserting the same
// 2 values.
import type { VerticalDramaSpecialEditionStoryFunctionChoice } from "./verticalDramaProductTieIn";
import type { VerticalDramaSeriesLocale } from "@shared/verticalDramaSeries";

/** Mirrors `VD_SPECIAL_EDITION_STORY_FUNCTION_CHOICES` (`verticalDramaProductTieIn.ts`) exactly — see the import block's doc comment above for why this is a literal duplicate rather than a value import. */
const SPECIAL_EDITION_STORY_FUNCTION_CHOICES = [
  "review",
  "tie_in_solution",
] as const;

const SKILL_FOLDER_PATH = path.join(
  "skills",
  "vertical-drama-special-edition-planner"
);

let cachedSystemPrompt: string | null = null;

/**
 * Loads `skills/vertical-drama-special-edition-planner/skill.md`'s content
 * — same loader shape (module-level cache, `resolveSkillDirCandidates` +
 * `resolveSkillManifestPath`, `parseSkillFile` for frontmatter/body split)
 * as `verticalDramaSeasonCarryOver.ts`'s `loadSkillSystemPrompt`. This is
 * the fix for the previously-dead-code skill: nothing else in `server/`
 * loads it except this function, and `synthesizeSpecialEditionBrief` below
 * is the only caller.
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
    `Could not locate skill.md for "vertical-drama-special-edition-planner" under any known skills directory`
  );
}

/* -------------------------------------------------------------------------- */
/* LLM output — mirrors skill.md's OUTPUT section exactly.                    */
/* -------------------------------------------------------------------------- */

const specialEditionCharacterUsedSchema = z.object({
  characterKey: z.string().min(1),
  roleInSpecial: z.string().min(1),
});

const specialEditionEpisodeBriefSchema = z.object({
  episodeNumber: z.number().int().min(1),
  logline: z.string().min(1),
  protagonistStake: z.string().min(1),
  pricePaid: z.string().min(1),
});

const specialEditionLlmDraftSchema = z.object({
  contractVersion: z.literal(1),
  storyShape: z.enum(SPECIAL_EDITION_STORY_FUNCTION_CHOICES),
  premise: z.string().min(1),
  charactersUsed: z.array(specialEditionCharacterUsedSchema).min(1),
  episodeBriefs: z.array(specialEditionEpisodeBriefSchema).min(1).max(2),
  continuityNotes: z.string().min(1),
  disclosureApproach: z.string().optional(),
});

export type VerticalDramaSpecialEditionDraft = z.infer<
  typeof specialEditionLlmDraftSchema
>;

export interface SynthesizeSpecialEditionBriefParams {
  userId: number;
  tenantId?: string;
  locale: VerticalDramaSeriesLocale;
  /** 1 or 2 — plan Stage 2.5's hard cap; the router's zod input enforces this range before this service ever sees it. */
  targetEpisodeCount: number;
  storyFunctionChoice: VerticalDramaSpecialEditionStoryFunctionChoice;
  /** Stage 2.5 sources 1/2 — exactly one side should be meaningfully populated; both may be empty (a bare premise-only special), never both required. */
  source: {
    marketplaceProductName?: string;
    marketplaceProductDescription?: string;
    uploadedSummary?: string;
  };
  lineageContext: VerticalDramaLineageContext;
}

function langInstruction(locale: VerticalDramaSeriesLocale): string {
  return locale === "th"
    ? "Write ALL user-facing string values in natural Thai."
    : "Write all user-facing string values in English.";
}

function buildUserPrompt(params: SynthesizeSpecialEditionBriefParams): string {
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
    targetEpisodeCount: params.targetEpisodeCount,
    storyFunctionChoice: params.storyFunctionChoice,
    source: {
      marketplaceProductName: params.source.marketplaceProductName?.trim() || undefined,
      marketplaceProductDescription:
        params.source.marketplaceProductDescription?.trim() || undefined,
      uploadedSummary: params.source.uploadedSummary?.trim() || undefined,
    },
    hasRecordedMemory: ctx.hasMemory,
    memoryCoverage: {
      episodesRecorded: ctx.memoryEpisodesRecorded,
      parentEpisodeCount: ctx.parentEpisodeCount,
    },
    seriesMemorySummary: ctx.compactSummary || "(no recorded memory yet)",
    relationships: ctx.currentState.relationships,
    openThreads: ctx.currentState.openThreads,
    canonicalFacts: ctx.currentState.canonicalFacts,
    characterKnowledge: ctx.currentState.characterKnowledge,
    roster: rosterPayload,
    rules: [
      `Plan EXACTLY ${params.targetEpisodeCount} entries in "episodeBriefs" (episodeNumber 1..${params.targetEpisodeCount}).`,
      `"storyShape" MUST be exactly "${params.storyFunctionChoice}" — copy it verbatim, never invent a different value.`,
      "characterKey values in charactersUsed MUST be copied verbatim from the roster payload — never invent a new one.",
      "Size protagonistStake/pricePaid for a short special edition, never season-finale scale, per this skill's own sizing rule.",
      "Use compact JSON only.",
    ],
  };

  return [
    renderCriteriaVersionMarker(),
    langInstruction(params.locale),
    "Plan this special edition from this parent series payload:",
    JSON.stringify(payload),
    "Return exactly this JSON shape:",
    '{"contractVersion":1,"storyShape":string,"premise":string,"charactersUsed":[{"characterKey":string,"roleInSpecial":string}],"episodeBriefs":[{"episodeNumber":number,"logline":string,"protagonistStake":string,"pricePaid":string}],"continuityNotes":string,"disclosureApproach":string}',
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n");
}

export class SpecialEditionInputError extends Error {
  code = "SPECIAL_EDITION_INPUT_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "SpecialEditionInputError";
  }
}

/**
 * Proposes a special-edition brief for a parent series already loaded by the
 * caller (`loadOwnedSeries` + `loadLineageContext` — see this module's
 * header doc comment on why this file never checks ownership itself). No DB
 * writes.
 */
export async function synthesizeSpecialEditionBrief(
  params: SynthesizeSpecialEditionBriefParams
): Promise<{
  draft: VerticalDramaSpecialEditionDraft;
  suggestedUserPremise: string;
  creditsUsed: number;
  model: string;
}> {
  if (params.lineageContext.roster.length === 0) {
    throw new SpecialEditionInputError(
      "The selected parent series has no character roster to build a special edition around"
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
    maxTokens: 3000,
    schema: specialEditionLlmDraftSchema,
    label: "Special edition planning",
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
    description: "Vertical Drama — special edition planning",
    sourceType: "skill",
    metadata: {
      model,
      llmModel: model,
      feature: "vertical_drama_special_edition",
      parentSeriesId: params.lineageContext.parentSeriesId,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  });

  return {
    draft: llmDraft,
    suggestedUserPremise: composeSpecialEditionUserPremise(llmDraft),
    creditsUsed,
    model,
  };
}

/**
 * Pure TS FORMATTER (no LLM, no invented content) — folds the already-judged
 * `premise`/`episodeBriefs`/`continuityNotes` fields into ONE string, exactly
 * shaped to become `createSeriesInput.userPremise` (see this module's header
 * doc comment for the full hand-off chain into `bible.userPremise` ->
 * `buildDeepDraftPrompts`'s "USER PREMISE (PRIMARY)" block). The user may
 * freely edit this text in the wizard before it is ever sent to `create` —
 * this function only supplies the STARTING text.
 */
export function composeSpecialEditionUserPremise(
  draft: VerticalDramaSpecialEditionDraft
): string {
  const episodeLines = draft.episodeBriefs
    .map(
      ep =>
        `Episode ${ep.episodeNumber}: ${ep.logline} (Personal stake: ${ep.protagonistStake}; small cost: ${ep.pricePaid})`
    )
    .join("\n");

  return [
    draft.premise,
    episodeLines,
    `Continuity to respect: ${draft.continuityNotes}`,
    "This is a SHORT special edition (1-2 sub-episodes) — do not reopen or advance the parent season's plot; keep every stake and cost small and personal, never season-finale scale.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
