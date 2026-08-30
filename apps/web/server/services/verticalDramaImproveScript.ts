/**
 * Vertical Drama Series — "ปรับปรุงบทละครให้มีความสมบูรณ์" (added 2026-07-10;
 * upgraded to a per-episode pass on 2026-07-10, then REALIGNED back to the
 * skill's original WHOLE-BLOCK intent later the same day — see
 * `/home/dev/.claude/plans/polished-toasting-gadget.md` for the full incident
 * history and the validation that justified this second rewrite).
 *
 * CURRENT DESIGN (whole-block primary -> bounded per-episode straggler
 * redo): runs the `drama-script-evaluate-improve` skill ONCE for the WHOLE
 * drafted season (every drafted episode's script sent as a single
 * `original_script`, exactly like the skill's own §17 continuation design
 * expects), with a bounded continuation loop for long output. The result is
 * split back into per-episode blocks and verified with the same hardened
 * parser (`parseStoryScriptEpisodeBlock`/`splitStoryScriptTextIntoEpisodeBlocks`)
 * built during the per-episode era. Any episode that fails verification (bad
 * shot count, missing block, or duplicated header) is a STRAGGLER — only
 * stragglers get a bounded, per-episode-scoped redo pass (reusing the
 * per-episode machinery kept below), so an episode that already came back
 * clean from the whole-block pass is never re-generated. A lone leftover
 * continuation marker trailing an otherwise-valid block is deliberately NOT
 * treated as disqualifying (confirmed via real-data re-validation that the
 * model sometimes emits it as a natural episode-transition cue even when
 * that episode's own content is complete). Graceful degradation is unchanged: episodes that never
 * verify (whole-block nor straggler redo) end up in
 * `partialFailureEpisodeNumbers`/`perEpisodeWarnings`, and `needsReview` is
 * `true` only when literally nothing succeeded.
 *
 * Why whole-block (not per-episode) is the PRIMARY pass again: sending the
 * whole season as one `original_script` is what the skill is actually
 * designed around, and — critically — it was PROVEN on real series-6 data
 * (via a throwaway `tsx` probe, since deleted) that whole-block + a quality
 * "thinking"-capable model + minimal (non-suppressive) steering produces
 * rich, scene-setting `เรื่องย่อ` paragraphs in a SINGLE LLM round, while a
 * conservative "preserve structure exactly" steering line and/or a weak
 * non-thinking model produced shallow one-line summaries even when scoped
 * per episode. The per-episode-only era's OWN incident (a truly weak
 * whole-season call spreading a shared token budget too thin) is avoided
 * here by (a) a much larger per-round token budget (16k, was 8k) and (b) a
 * quality/thinking-capable model selection — not by permanently abandoning
 * whole-block.
 *
 * New sibling file to `verticalDramaStoryBible.ts` (already 7000+ lines) —
 * mirrors how `verticalDramaQualityLedgerReconcile.ts` is already split out
 * as its own file rather than appended there.
 *
 * IMPORTANT — this file owns its own DB load + precondition guard (step a
 * below), unlike this codebase's usual "service stays DB/TRPCError-free,
 * the router owns persistence + error mapping" convention (see
 * `verticalDramaStoryBible.ts`, which never imports `db` or `TRPCError`).
 * This is a deliberate, explicitly-requested exception for this feature: the
 * async job executor (`runVerticalDramaStoryJobExecutor` in
 * `routers/verticalDramaSeries.ts`) calls `runImproveScriptJob` directly with
 * NO router-owned wrapper function in between (unlike `deep_generate`/the
 * removed `critique`/`apply_critique`, which had `run*Job` wrapper functions
 * living in the router file). `runImproveScriptJob` NEVER writes to `bible`
 * or the database itself — the DB access here is READ-ONLY (loading the
 * series + its active breakdown); persistence happens only in the router's
 * `confirmImproveScript` procedure, once the user explicitly confirms.
 */

import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { SkillDefinition } from "@smartspec/skills";
import { db } from "../db";
import {
  verticalDramaSeries,
  verticalDramaCharacters,
  type VerticalDramaCharacterRow,
} from "../../drizzle/schema";
import {
  buildStoryScriptText,
  parseStoryScriptEpisodeBlock,
  splitStoryScriptTextIntoEpisodeBlocks,
  stripWrappingMarkdownEmphasis,
  STORY_SCRIPT_TEXT_CHAR_LIMIT,
  type StoryScriptEpisodeInput,
  type StoryScriptLang,
} from "@shared/verticalDramaSeries/storyScriptText";
import {
  getActiveBreakdown,
  readItemShotDrafts,
  readItemCliffhangerLine,
  enforceEpisodeShotDraftSpeakability,
  computeDraftCompleteness,
  VD_DEEP_DRAFT_SHOTS_PER_EPISODE,
  resolveStoryBibleModel,
  type StoredEpisodeBreakdownItem,
  type VdDeepDraftShotDraft,
  type VdDeepDraftWarning,
} from "./verticalDramaStoryBible";
import { getSkillByIdAsync } from "./skillRegistry";
import { resolveSkillExecutionPolicy, type SkillExecutionPolicyResult } from "./skillExecutionPolicy";
import { executeSkillLlmWithFallback, type SkillLlmResult } from "./skillModelFallback";
import { loadEnabledLlmModelRows, type EnabledLlmModelRow } from "./enabledLlmModels";
import { isAvailable } from "./providerHealth";
import { deductCreditsForModel } from "./creditService";
import type { VerticalDramaStoryJobProgress } from "./verticalDramaStoryJobs";
import { resolveVerticalDramaSeriesModel } from "./verticalDramaLlmModelPolicy";
// `planning/vertical-drama-character-variants/plan.md` Phase B — season-wide
// character variant/twin planning, wired as this job's final, best-effort
// phase (see step (g) near the bottom of `runImproveScriptJob`). Circular
// import (safe — see `verticalDramaCharacterVariantPlanner.ts`'s doc comment):
// that file imports `resolveQualityLargeContextModelId` FROM this file, only
// ever inside a function body, same already-established pattern as
// `verticalDramaStoryBible.ts` <-> `verticalDramaPresetSynthesis.ts`.
import {
  generateCharacterVariantPlan,
  reconcileCharacterVariantPlan,
  extractCharacterRosterDescription,
  logCharacterVariantPlanningFailure,
  type CharacterVariantReconciliationSummary,
  type CharacterVariantPlannerCharacterInput,
} from "./verticalDramaCharacterVariantPlanner";

/** The skill this whole feature is built around — already shipped, previously unused. */
export const VD_IMPROVE_SCRIPT_SKILL_ID = "drama-script-evaluate-improve";

/**
 * Bounded continuation loop for the WHOLE-BLOCK PRIMARY pass (restored to a
 * per-JOB cap on 2026-07-10 — raised from the per-episode era's `2` back up
 * to `8`, since one loop now has to cover the entire season's output, not
 * just one episode's). Validated on real series-6 data: 6 episodes' worth of
 * rich output completed in a SINGLE round (~6k output tokens,
 * `finish_reason: "stop"`) — 8 rounds gives generous headroom beyond that.
 */
export const VD_IMPROVE_SCRIPT_MAX_CONTINUATION_ROUNDS = 8;
/**
 * Per-round token budget (raised from 8_000 to 16_000 on 2026-07-10 for the
 * whole-block restoration) — keeps each round's own output bounded so the
 * continuation loop makes real progress instead of one giant (and more
 * truncation-prone) call, while still being large enough for a whole
 * season's worth of rich per-shot content per round.
 */
export const VD_IMPROVE_SCRIPT_PER_ROUND_MAX_TOKENS = 16_000;

/**
 * Bounded retry-until-pass attempt budget for the STRAGGLER REDO path ONLY
 * (2026-07-10 whole-block restoration — this constant used to gate the
 * PRIMARY per-episode loop; now `runImproveScriptEpisodePass`/
 * `runImproveScriptEpisodeWithRetries` below are exclusively the bounded
 * per-episode fallback for whichever episodes the whole-block pass didn't
 * verify cleanly). Kept intentionally smaller (2, was 3) than the old
 * per-episode primary budget — a straggler is already the rare case (most
 * episodes verify straight out of the whole-block pass), so this only needs
 * to cover residual formatting drift, not carry the feature's whole quality
 * bar on its own.
 */
export const VD_IMPROVE_SCRIPT_STRAGGLER_MAX_ATTEMPTS = 2;
/**
 * Per-round continuation cap for a SINGLE straggler episode's own pass
 * (2026-07-10) — deliberately much smaller than the whole-block primary
 * pass's `VD_IMPROVE_SCRIPT_MAX_CONTINUATION_ROUNDS` (8): one episode's 9
 * shots need far less headroom than a whole season, and keeping this small
 * bounds the worst-case cost of redoing several stragglers in the same job.
 * Passed explicitly as `runImproveScriptEpisodePass`'s `maxRounds` param
 * (chosen over a default-value approach since that function now has exactly
 * one caller — the straggler path — so an explicit, always-passed value is
 * clearer than an implicit default that would only ever be overridden).
 */
export const VD_IMPROVE_SCRIPT_STRAGGLER_MAX_ROUNDS = 3;

/** `modelSource` values that represent an EXPLICIT skill-level model pin — `resolveSkillExecutionPolicy`'s other sources (`system_default`/`requirements_match`/`conversation`) are treated as "generic default fallback" and eligible for the large-context upgrade below. */
const EXPLICIT_PIN_MODEL_SOURCES = new Set<SkillExecutionPolicyResult["modelSource"]>([
  "skill_llmModelId",
  "skill_defaultModel",
  "skill_fixedModel",
]);

/** Documented in the skill itself (`skill.md` §3/§17) — two distinct spellings for "more content follows". */
const CONTINUATION_MARKER_PATTERN =
  /---\s*ต่อจากนี้เป็นเนื้อหาตอนถัดไป\s*---|\[ต่อในส่วนถัดไป\]/;
/** Same two markers, anchored to (near) the END of a chunk — this is the "truncated, more to come" signal; a marker appearing mid-text (caught by the non-anchored pattern above at the verification-gate step) indicates something went wrong. */
const TAIL_CONTINUATION_MARKER_PATTERN =
  /(?:---\s*ต่อจากนี้เป็นเนื้อหาตอนถัดไป\s*---|\[ต่อในส่วนถัดไป\])\s*$/;

const EPISODE_HEADER_LINE_PATTERN = /^(?:ตอนที่|Episode)\s+(\d+):/;
/** Same header-detection role as `EPISODE_HEADER_LINE_PATTERN`, but for a SHOT line (`ช็อต N: ...` / `Shot N: ...`) — used only by the resume-nudge boundary finder below. */
const SHOT_HEADER_LINE_PATTERN = /^(?:ช็อต|Shot)\s+(\d+):/;

/* -------------------------------------------------------------------------- */
/* Step (b) — server-side adapter onto the shared script-text formatter       */
/* -------------------------------------------------------------------------- */

export interface BuildStoryScriptTextFromBibleResult {
  text: string;
  /** Episode numbers actually included in `text` (after any char-limit truncation) — the set the verification gate must see come back, exactly. */
  expectedEpisodeNumbers: number[];
  truncated: boolean;
  omittedEpisodeNumbers: number[];
}

/**
 * Maps `getActiveBreakdown(bible)` items directly into `StoryScriptEpisodeInput[]`
 * — simpler than `VerticalDramaSeriesDetailPage.tsx`'s dual-source client
 * merge (episode plan + `deepDraftItem`) since each `StoredEpisodeBreakdownItem`
 * already carries title/logline/keyBeats/shotDrafts/cliffhanger together.
 * Only DRAFTED episodes (`shotDrafts !== null`) are included — an
 * un-drafted episode has nothing for the skill to improve.
 *
 * `params.episodeNumber` (added 2026-07-10, per-episode generation fix; kept
 * for the straggler-redo path in the 2026-07-10 whole-block restoration):
 * when set, scopes the built text to just that ONE drafted episode —
 * `fromEpisode`/`toEpisode` both become `episodeNumber`. When omitted (the
 * WHOLE-BLOCK primary pass' own usage), behavior covers every drafted
 * episode, exactly as today.
 */
export function buildStoryScriptTextFromBible(
  bible: Record<string, unknown> | null | undefined,
  params: {
    lang: StoryScriptLang;
    title?: string | null;
    genre?: string | null;
    tone?: string | null;
    seasonArc?: string | null;
    episodeNumber?: number;
  },
): BuildStoryScriptTextFromBibleResult {
  const items = getActiveBreakdown(bible);
  const draftedItems = items
    .filter((item) => readItemShotDrafts(item) !== null)
    .filter((item) => params.episodeNumber === undefined || item.episodeNumber === params.episodeNumber);

  const episodes: StoryScriptEpisodeInput[] = draftedItems.map((item) => ({
    episodeNumber: item.episodeNumber,
    workingTitle: item.workingTitle,
    logline: item.logline,
    keyBeats: item.keyBeats,
    shotDrafts: readItemShotDrafts(item),
    cliffhangerLine: readItemCliffhangerLine(item),
  }));

  const episodeNumbers = episodes.map((episode) => episode.episodeNumber);
  const fromEpisode = episodeNumbers.length > 0 ? Math.min(...episodeNumbers) : 1;
  const toEpisode = episodeNumbers.length > 0 ? Math.max(...episodeNumbers) : 0;

  const built = buildStoryScriptText({
    lang: params.lang,
    title: params.title,
    genre: params.genre,
    tone: params.tone,
    seasonArc: params.seasonArc,
    episodes,
    fromEpisode,
    toEpisode,
    maxChars: STORY_SCRIPT_TEXT_CHAR_LIMIT,
  });

  return {
    text: built.text,
    expectedEpisodeNumbers: built.copiedEpisodeNumbers,
    truncated: built.truncated,
    omittedEpisodeNumbers: built.omittedEpisodeNumbers,
  };
}

/* -------------------------------------------------------------------------- */
/* Step (c) — model resolution: honor an explicit skill pin, else upgrade to  */
/* the CHEAPEST eligible large-context THINKING-CAPABLE enabled model         */
/* (2026-07-10 whole-block restoration — see doc comment below for why       */
/* "thinking-capable" was added on top of the earlier price-awareness fix).   */
/* -------------------------------------------------------------------------- */

/** Preserves the existing, user-confirmed context-window floor for this feature. */
const IMPROVE_SCRIPT_MIN_CONTEXT_LENGTH = 1_000_000;

/**
 * Filters `rows` down to the models that (a) meet the
 * `IMPROVE_SCRIPT_MIN_CONTEXT_LENGTH` floor, (b) are not free-tier, and (c)
 * `supportsThinking === true`, sorted CHEAPEST-first (by summed
 * input+output price per 1M tokens). Extracted out of
 * `resolveQualityLargeContextModelId` (2026-07-11, manual LLM model override
 * feature — see `/home/dev/.claude/plans/polished-toasting-gadget.md`) so
 * this exact filter/sort definition is shared by every caller that needs the
 * "quality large-context" eligibility bar — `resolveQualityLargeContextModelId`
 * itself (below), the scoped `resolveStartFramePlanModel`/
 * `resolveStoryboardModel` resolvers (which validate a manual override
 * against this same list), and `verticalDramaSeries.ts`'s
 * `listQualityPlanningModels` query (which lists this same eligible set for
 * the override dropdown) — they must never drift apart. Callers are expected
 * to have already applied this codebase's own "safe to auto-pick"
 * catalog-eligibility filter (`loadEnabledLlmModelRows({ autoSelectionOnly:
 * true })`) before calling this — this function does not re-check
 * `catalogEligibility` itself.
 */
export function selectQualityLargeContextEligibleModels(
  rows: EnabledLlmModelRow[],
): EnabledLlmModelRow[] {
  const eligible = rows.filter(
    (row) =>
      (row.contextLength ?? 0) >= IMPROVE_SCRIPT_MIN_CONTEXT_LENGTH &&
      !row.isFree &&
      row.supportsThinking === true,
  );
  return [...eligible].sort(
    (a, b) =>
      Number(a.pricingInput ?? 0) + Number(a.pricingOutput ?? 0) -
      (Number(b.pricingInput ?? 0) + Number(b.pricingOutput ?? 0)),
  );
}

/**
 * Picks the automatic model for every VD stage that resolves through this
 * function (directly or via `resolveVerticalDramaSeriesModel(seriesId,
 * resolveQualityLargeContextModelId)` — the series' "อัตโนมัติ" default).
 *
 * 2026-07-31 (owner override, explicitly superseding the earlier "do not
 * change auto-selection cost policy" instruction for THIS resolver only —
 * "ถึงเลือกอัตโนมัติ ก็ควรได้ model หนึ่งในชุดนี้"): automatic selection must
 * now draw from the admin-curated recommended set
 * (`selectRecommendedQualityLargeContextEligibleModels`,
 * `modelProviderMap.isRecommended`) — the same quality bar the manual
 * picker (`listQualityPlanningModels`) already enforces — instead of the
 * raw cheapest-first eligible set. This is what stops "อัตโนมัติ" from
 * resolving to a model like `google/gemini-3.1-flash-lite`, the exact model
 * behind the 2026-07-18 character-portrait lead-beauty-gate incident (see
 * `selectPremiumLargeContextEligibleModels`'s doc comment above) — that
 * incident was fixed for ONE stage (character visual bible) by switching to
 * the most-expensive eligible model; this fixes the underlying quality gap
 * for every OTHER stage still on this resolver, admin-curated-quality-first
 * rather than price-first.
 *
 * ORDERING within the recommended set: admin `priority` ASC ("lower =
 * higher priority" — `modelProviderMap.priority`), NOT cheapest-first. This
 * intentionally makes automatic resolve to the exact model
 * `listQualityPlanningModels` shows FIRST in the picker dropdown — a user
 * who leaves the field on "อัตโนมัติ" gets precisely the top entry of the
 * list they'd otherwise pick from manually, which is the coherent story
 * between the two surfaces. (Cheapest-first-within-recommended was
 * considered and rejected: it would let two admin-recommended models of
 * similar quality resolve differently between "what's shown first" and
 * "what auto-select actually uses," undermining the one lesson this
 * function exists to encode — that the admin's curation, not raw price,
 * should drive automatic selection.)
 *
 * FALLBACK (unchanged from pre-2026-07-31 behavior, deliberately NOT using
 * `selectRecommendedQualityLargeContextEligibleModels`'s own
 * priority-ordered fallback): when nothing in the eligible set is currently
 * recommended, this falls back to the exact pre-existing behavior — cheapest
 * among the FULL eligible set (`selectQualityLargeContextEligibleModels`)
 * — so automatic selection is never left with nothing to resolve to, and an
 * admin who hasn't curated any recommendations yet sees no regression from
 * before this change. (The picker's OWN empty-recommended fallback sorts by
 * priority instead, for its own, separate reason — coherence with the
 * picker's non-fallback ordering above; the two fallbacks are allowed to
 * differ because they're answering different questions: "what's the best
 * single automatic pick" vs "what's a sensible full list to browse.")
 *
 * Was `resolveCheapestEligibleLargeContextModelId` /
 * "byte-identical cheapest-first" through 2026-07-11 — see git history for
 * that earlier contract; this is the first behavior change since then.
 */
export async function resolveQualityLargeContextModelId(): Promise<string | null> {
  try {
    const rows = await loadEnabledLlmModelRows({ autoSelectionOnly: true });
    const eligible = selectQualityLargeContextEligibleModels(
      rows.filter((row) => isAvailable(row.providerId)),
    );
    const recommended = eligible.filter((row) => row.isRecommended === true);
    if (recommended.length > 0) {
      const ranked = [...recommended].sort((a, b) => a.priority - b.priority);
      return ranked[0]?.modelId ?? null;
    }
    // Never select a model outside the admin-recommended set for an
    // automatic quality-critical Vertical Drama stage. A missing curated
    // model is an admission error, not permission to silently bill/use an
    // unrelated model.
    return null;
  } catch {
    return null;
  }
}

/**
 * Picker-specific view of the quality large-context eligible set (2026-07-31,
 * "โมเดล LLM offers weak models" complaint — the manual model override
 * dropdown in `listQualityPlanningModels` was surfacing
 * `selectQualityLargeContextEligibleModels`'s cheapest-first order, which
 * puts the WEAKEST model that clears the capability floor at the top of the
 * list). Further restricts the eligible set to the admin-curated quality
 * flag (`row.isRecommended === true` — `modelProviderMap.isRecommended`,
 * the SAME column `intelligentModelSelector.ts`'s `recommendedOnly`
 * capability requirement already filters on for skill-driven selection), so
 * the picker only offers models a human has vetted as genuinely strong —
 * not just anything that meets the bare context/thinking/non-free floor.
 *
 * Falls back to the FULL eligible set (unfiltered by `isRecommended`) when
 * no eligible model is currently recommended, so this NEVER narrows the
 * picker to an empty list over a non-empty eligible set — an admin who
 * hasn't curated any recommendations yet (or whose whole recommended set
 * just got disabled) still gets a working dropdown, just without the
 * quality-vetted ordering.
 *
 * Sorted by the SAME admin-curated `priority` column already used to rank
 * models within a provider (`modelProviderMap.priority`, "lower = higher
 * priority" — see `loadEnabledLlmModelRows`'s own `ORDER BY priority` and
 * `intelligentModelSelector.ts`'s `selectLlmModelCandidates`, which sorts its
 * `recommendedOnly` candidates by this exact column) rather than
 * cheapest-first — cheapest-first is exactly the ordering that surfaced the
 * weakest model first in the original complaint, and `priority` is existing
 * admin-authored metadata, not a new hardcoded ranking.
 *
 * SCOPE: primarily the picker (`listQualityPlanningModels`).
 * `selectQualityLargeContextEligibleModels` itself, and
 * `selectPremiumLargeContextEligibleModels`'s reversal for the
 * character-visual-bible stage, keep their exact pre-existing cheapest-
 * first / most-expensive-first cost policy untouched — this function never
 * replaces or is called by either of them.
 *
 * 2026-07-31 update: `resolveQualityLargeContextModelId` (the "อัตโนมัติ"
 * default used by `resolveStartFramePlanModel`, `resolveStoryboardModel`,
 * the improve-script upgrade path, and every other VD stage that resolves
 * through it — see that function's own doc comment) now applies this SAME
 * membership-and-ordering rule (recommended-first, priority ASC) — but does
 * NOT literally call this function, because its empty-recommended fallback
 * must stay cheapest-first (the pre-2026-07-31 behavior) rather than this
 * function's priority-ordered fallback. The two fallbacks intentionally
 * differ; the recommended-and-non-empty case is intentionally identical.
 */
export function selectRecommendedQualityLargeContextEligibleModels(
  rows: EnabledLlmModelRow[],
): EnabledLlmModelRow[] {
  const eligible = selectQualityLargeContextEligibleModels(rows);
  const recommended = eligible.filter((row) => row.isRecommended === true);
  const ranked = recommended.length > 0 ? recommended : eligible;
  return [...ranked].sort((a, b) => a.priority - b.priority);
}

/**
 * The mirror image of `selectQualityLargeContextEligibleModels` — SAME
 * eligibility bar (context-length floor, non-free, `supportsThinking ===
 * true`), sorted MOST-EXPENSIVE-first instead of cheapest-first.
 *
 * WHY (2026-07-18, character-portrait lead-beauty-gate incident — see
 * `resolveCharacterVisualBibleModel` in
 * `verticalDramaCharacterImageGeneration.ts` for the only caller, and the
 * debugger report / audit log `audit-2026-07-18.jsonl` 00:30-00:31 UTC for
 * the evidence trail): the character visual-bible stage was defaulting to
 * `resolveQualityLargeContextModelId`'s CHEAPEST eligible model
 * (`google/gemini-3.1-flash-lite`), which reliably wrote lead portrait prose
 * too plain to pass the pre-existing `findLeadPromptQualityIssues` gate,
 * hard-failing character creation for `lead_female`/`lead_male` characters
 * on every retry. The user explicitly accepted higher per-generation cost
 * for THIS stage only ("ปรับใช้ Model แรงขึ้นเฉพาะขั้น Character visual
 * bible") in exchange for reliably higher-quality portraits.
 *
 * There is no admin-curated "premium/flagship" capability tier column on
 * `model_provider_map` today, so summed input+output price-per-1M-tokens is
 * used as this codebase's existing capability PROXY (frontier/flagship
 * models are reliably the most expensive tier on every provider catalog
 * currently onboarded) — reversing the SAME eligible list
 * `selectQualityLargeContextEligibleModels` already computes (rather than
 * re-deriving the filter here) guarantees the two selectors can never
 * silently drift apart on what counts as "eligible" for this quality
 * class of call.
 *
 * SCOPE — do not widen: this must stay the character-visual-bible stage's
 * OWN resolver, never the new default for `resolveQualityLargeContextModelId`
 * itself. Every other stage that depends on `resolveQualityLargeContextModelId`
 * (`resolveStartFramePlanModel`, `resolveStoryboardModel`, the improve-script
 * upgrade path) keeps its existing cheapest-first cost policy untouched.
 */
export function selectPremiumLargeContextEligibleModels(
  rows: EnabledLlmModelRow[],
): EnabledLlmModelRow[] {
  return [...selectQualityLargeContextEligibleModels(rows)].reverse();
}

/**
 * Best-effort, NEVER throws — same convention as `resolveQualityLargeContextModelId`
 * and every other resolver in this codebase. Used ONLY as the auto-fallback
 * for `resolveCharacterVisualBibleModel`; a per-series
 * `llmModelPolicy.defaultModelId` override still wins ahead of this
 * unchanged, via `resolveVerticalDramaSeriesModel`'s existing precedence
 * contract (it accepts any `autoFallback` callback interchangeably).
 */
export async function resolvePremiumLargeContextModelId(): Promise<string | null> {
  try {
    const rows = await loadEnabledLlmModelRows({ autoSelectionOnly: true });
    return selectPremiumLargeContextEligibleModels(rows)[0]?.modelId ?? null;
  } catch {
    return null;
  }
}

/**
 * Scoped resolvers for the `start_frame_render_plan`/`storyboard_shotgrid`
 * stages. Originally (2026-07-11) each had its own inline `llmModelPolicy`
 * field-reading logic; now (`planning/vertical-drama-centralized-model-policy/
 * plan.md`, Phase 1) both just delegate to the single series-wide resolver,
 * `resolveVerticalDramaSeriesModel` in `./verticalDramaLlmModelPolicy` — see
 * that file's doc comment for the full override contract. Signatures are
 * UNCHANGED from the first cut so existing callers
 * (`verticalDramaStartFrameGeneration.ts`/`verticalDramaStoryboardGeneration.ts`)
 * keep working without modification. Both stages use
 * `resolveQualityLargeContextModelId` as their auto-fallback (their pre-
 * existing tier), same as before this refactor.
 */
export async function resolveStartFramePlanModel(seriesId: number): Promise<string> {
  return resolveVerticalDramaSeriesModel(seriesId, resolveQualityLargeContextModelId);
}

export async function resolveStoryboardModel(seriesId: number): Promise<string> {
  return resolveVerticalDramaSeriesModel(seriesId, resolveQualityLargeContextModelId);
}

async function resolveImproveScriptExecutionPolicy(skill: SkillDefinition): Promise<SkillExecutionPolicyResult> {
  const policy = await resolveSkillExecutionPolicy({ skill });
  if (EXPLICIT_PIN_MODEL_SOURCES.has(policy.modelSource)) {
    return policy;
  }
  const upgradedModelId = await resolveQualityLargeContextModelId();
  if (!upgradedModelId) {
    return policy;
  }
  return { ...policy, modelId: upgradedModelId };
}

/* -------------------------------------------------------------------------- */
/* Step (g) — per-round credit charging, mirrors `presentationArticleGenerator */
/* .ts`'s `chargePresentationSkillLlmUsage` (`deductCreditsForModel`-based).  */
/* -------------------------------------------------------------------------- */

async function chargeImproveScriptLlmUsage(params: {
  userId: number;
  tenantId?: string;
  seriesId: number;
  /**
   * `0` is the WHOLE-SEASON PASS sentinel (2026-07-10 whole-block
   * restoration) — the primary pass isn't scoped to one episode, so there is
   * no real episode number to charge against. Any other value is a real
   * straggler-redo episode number.
   */
  episodeNumber: number;
  round: number;
  /** 2026-07-10 retry-until-pass — which attempt (of `attemptCount`) this charge belongs to, echoed into the ledger description/metadata for clarity. `1/1` for the whole-season pass (no retry concept there — see `VD_IMPROVE_SCRIPT_MAX_CONTINUATION_ROUNDS` instead). */
  attemptIndex: number;
  attemptCount: number;
  result: SkillLlmResult;
}): Promise<number> {
  const model = String(params.result.modelId ?? "").trim();
  if (!model) return 0;

  const isWholeSeasonPass = params.episodeNumber === 0;
  const description = isWholeSeasonPass
    ? `Improve script usage (whole-season pass, round ${params.round})`
    : `Improve script usage (episode ${params.episodeNumber}, attempt ${params.attemptIndex}/${params.attemptCount}, round ${params.round})`;

  const usage = params.result.rawData?.usage as { cost?: number } | undefined;
  const { creditsUsed } = await deductCreditsForModel({
    userId: params.userId,
    tenantId: params.tenantId,
    model,
    provider: params.result.provider?.providerName ?? undefined,
    inputTokens: params.result.inputTokens ?? 0,
    outputTokens: params.result.outputTokens ?? 0,
    costUsd: usage?.cost,
    idempotencyKey: `vd-improve:${params.seriesId}:${params.episodeNumber}:${params.round}:${params.attemptIndex}`,
    skillRunId: `vd-improve:${params.seriesId}:${params.episodeNumber}:${params.round}:${params.attemptIndex}`,
    contextRef: {
      contextType: "series",
      sourceType: "vertical_drama_series",
      sourceId: params.seriesId,
      stageLabel: "improve_script",
      attemptKey: `vd-improve:${params.seriesId}:${params.episodeNumber}:${params.round}:${params.attemptIndex}`,
    },
    skillSlug: VD_IMPROVE_SCRIPT_SKILL_ID,
    sourceType: "skill",
    description,
    metadata: {
      seriesId: params.seriesId,
      episodeNumber: params.episodeNumber,
      round: params.round,
      attemptIndex: params.attemptIndex,
      attemptCount: params.attemptCount,
      operation: "vertical_drama_improve_script",
    },
  });
  return creditsUsed;
}

/* -------------------------------------------------------------------------- */
/* Step (d)/(e) — steering prompt + continuation loop                        */
/* -------------------------------------------------------------------------- */

/**
 * MINIMAL, non-suppressive steering (rewritten 2026-07-10, whole-block
 * restoration). Replaces the earlier "รักษาโครงสร้าง...เป๊ะ ๆ" (mandatory,
 * "บังคับ") framing, which duplicated the skill's own §14 but SUPPRESSED its
 * §13 enrichment instruction — confirmed root cause of the shallow-output
 * incident. This version keeps ONLY the parse-safety lines this file's own
 * hardened parser genuinely needs (exact shot count/numbering, no stray
 * markdown bold, single `จุดค้าง:` placement, `ผู้พูด` placeholder
 * clarification, exact Thai section headers) and adds a POSITIVE content
 * requirement reinforcing (never overriding) the skill's own enrichment
 * intent: every episode's `เรื่องย่อ:` must open with a visually concrete
 * scene-setting beat (time of day / specific location / lighting / lead
 * character blocking+wardrobe / visible props) before the plot recap.
 *
 * The quality bullet below uses a GENERIC bracketed-placeholder template
 * (deliberately, NOT the concrete series-6 example the validation probe
 * used) — this steering is shared across every series' improve-script run,
 * so a concrete example from one series' setting (a convenience store /
 * diaper aisle) must never bias unrelated dramas toward that same imagery.
 * Re-validated on real series-6 data after this genericization (see the
 * work report accompanying this change) to confirm loglines are still rich.
 */
export function buildImproveScriptSteeringLine(): string {
  return [
    "ข้อกำหนดรูปแบบผลลัพธ์ (เพื่อให้ระบบอ่านผลลัพธ์อัตโนมัติได้ ไม่ใช่การจำกัดการปรับปรุงเนื้อหา):",
    `- ทุกตอนต้องมีช็อตเรียงลำดับ 1 ถึง ${VD_DEEP_DRAFT_SHOTS_PER_EPISODE} ครบทุกช็อต ห้ามขาดหรือเกิน ห้ามเลขซ้ำ`,
    "- ห้ามเปลี่ยนหมายเลขตอน ห้ามเพิ่มหรือลดจำนวนตอนจากต้นฉบับ",
    "- ห้ามใช้ตัวหนาหรือการเน้นข้อความแบบ markdown (** หรือ __) ที่ส่วนใดของผลลัพธ์ทั้งสิ้น ให้เป็นข้อความธรรมดาทั้งหมด",
    "- \"จุดค้าง:\" ต้องปรากฏเพียงครั้งเดียวต่อหนึ่งตอน หลังช็อตสุดท้ายเท่านั้น ห้ามใส่ท้ายช็อตอื่น",
    "- คำว่า \"ผู้พูด\" ในตัวอย่างรูปแบบเป็นเพียง placeholder ให้แทนที่ด้วยชื่อตัวละครที่พูดจริงเสมอ ห้ามเขียนคำว่า \"ผู้พูด\" ลงในผลลัพธ์ตรง ๆ",
    "- ใช้หัวข้อภาษาไทยตามต้นฉบับ: \"ตอนที่ N: ...\", \"เรื่องย่อ: ...\", \"จุดดำเนินเรื่อง:\", \"บทพูดรายช็อต:\", \"ช็อต N: ...\", \"จุดค้าง: ...\"",
    "- ทุกบรรทัดบทพูดใต้ช็อตต้องขึ้นต้นด้วย \"- \" (ขีดกลางแล้วเว้นวรรค) เสมอ เช่น \"- ชื่อตัวละคร: บทพูด\" หรือ \"- ชื่อตัวละคร: บทพูด (น้ำเสียง)\" ห้ามละขีดนำหน้า",
    "",
    "ข้อกำหนดคุณภาพเนื้อหา (สำคัญมาก ให้ทำจริงทุกตอน):",
    "- บรรทัด \"เรื่องย่อ:\" ของแต่ละตอน ต้องขึ้นต้นด้วยการตั้งฉากที่เห็นภาพได้ทันที 1-2 ประโยค ก่อนจะเล่าเหตุการณ์ โดยระบุให้ครบ: เวลาของวัน + สถานที่เฉพาะเจาะจง + ลักษณะแสง + ตำแหน่งและการวางตัวของตัวละครหลักในฉากเปิด + เครื่องแต่งกาย/ทรงผมของตัวละคร + props หรือองค์ประกอบฉากสำคัญที่มองเห็น จากนั้นจึงต่อด้วยเหตุการณ์/พล็อต",
    "- รูปแบบการเปิด \"เรื่องย่อ:\" ที่ต้องการ (โครงสร้าง ไม่ใช่เนื้อหาตายตัว): \"[ช่วงเวลาของวัน] ที่ [สถานที่เฉพาะ] [ลักษณะแสง] [ตัวละครหลัก] ใน [เครื่องแต่งกาย/ทรงผม] [ตำแหน่ง/ท่าทางในฉากเปิด] ใกล้ [props สำคัญ] จากนั้น [เหตุการณ์เปิดเรื่อง]...\" ให้ปรับให้เข้ากับฉากจริงของแต่ละตอน",
    "- ห้ามให้ \"เรื่องย่อ:\" เป็นเพียงสรุปพล็อต/อารมณ์ล้วน ๆ ที่ไม่มีภาพฉากตั้งต้น ทุกตอนต้องมีฉากเปิดที่เห็นภาพชัดพอนำไปสร้างภาพ/วิดีโอได้",
  ].join("\n");
}

/** Builds the retry-attempt feedback block injected into the NEXT attempt's USER message (see `buildImproveScriptMessages`'s `priorAttemptFeedback` param) — attempt-specific state, same category as `user_revision_request`, never the system message. Straggler-redo only (2026-07-10 whole-block restoration). */
function buildImproveScriptRetryFeedback(reasons: string[]): string {
  return `ความพยายามครั้งก่อนไม่ผ่านเพราะ: ${reasons.join("; ")} — กรุณาแก้ไขในครั้งนี้`;
}

function buildImproveScriptMessages(params: {
  skillSystemContent: string;
  originalScript: string;
  userRevisionRequest: string;
  /** 2026-07-10 retry-until-pass — feedback from the PREVIOUS failed attempt on this same episode, joined into the USER message (attempt-specific state, not static like the system message). Absent on attempt 1 / the whole-season pass. */
  priorAttemptFeedback?: string;
}): Array<{ role: string; content: string }> {
  const systemContent = [params.skillSystemContent, buildImproveScriptSteeringLine()]
    .filter((part): part is string => Boolean(part && part.trim().length > 0))
    .join("\n\n---\n\n");
  const userContent = [
    `original_script:\n${params.originalScript}`,
    `user_revision_request:\n${params.userRevisionRequest}`,
    params.priorAttemptFeedback ? `previous_attempt_feedback:\n${params.priorAttemptFeedback}` : null,
  ]
    .filter((part): part is string => Boolean(part && part.trim().length > 0))
    .join("\n\n");
  return [
    { role: "system", content: systemContent },
    { role: "user", content: userContent },
  ];
}

function readFinishReason(rawData: Record<string, unknown> | undefined): string | undefined {
  const choices = rawData?.choices;
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  const first = choices[0] as { finish_reason?: unknown } | undefined;
  return typeof first?.finish_reason === "string" ? first.finish_reason : undefined;
}

/**
 * Highest "ตอนที่ N" header seen in `accumulated`, and (within THAT episode)
 * the highest "ช็อต M" header seen after it — the exact resume boundary for
 * the strengthened continuation nudge below (2026-07-10 whole-block
 * restoration, Q4). Resets the shot tracker every time a new episode header
 * is seen, so it always reflects "last shot of the LAST episode header
 * encountered", not a global max across episodes.
 */
function findLastEpisodeAndShot(accumulated: string): { episode: number | null; shot: number | null } {
  const lines = accumulated.split("\n");
  let lastEpisode: number | null = null;
  let lastShotInLastEpisode: number | null = null;
  let currentEpisode: number | null = null;

  for (const line of lines) {
    const stripped = stripWrappingMarkdownEmphasis(line);
    const epMatch = stripped.match(EPISODE_HEADER_LINE_PATTERN);
    if (epMatch) {
      currentEpisode = Number(epMatch[1]);
      lastEpisode = currentEpisode;
      lastShotInLastEpisode = null;
      continue;
    }
    const shotMatch = stripped.match(SHOT_HEADER_LINE_PATTERN);
    if (shotMatch && currentEpisode !== null) {
      lastShotInLastEpisode = Number(shotMatch[1]);
    }
  }
  return { episode: lastEpisode, shot: lastShotInLastEpisode };
}

/**
 * Builds the "keep going" continuation nudge injected as the LAST message on
 * a truncated round's replay (2026-07-10 whole-block restoration, Q4) — an
 * explicit resume boundary ("ล่าสุดหยุดที่ ตอนที่ N ช็อต M") when one can be
 * found in `accumulated`, falling back to the older generic nudge otherwise
 * (e.g. truncation happened before any shot header was ever emitted).
 */
function buildImproveScriptResumeNudge(accumulated: string): string {
  const { episode, shot } = findLastEpisodeAndShot(accumulated);
  return episode !== null && shot !== null
    ? `ทำต่อจากที่ค้างไว้พอดี ล่าสุดหยุดที่ ตอนที่ ${episode} ช็อต ${shot} ให้ดำเนินต่อจากจุดนั้น ห้ามซ้ำตอนหรือช็อตที่ส่งไปแล้ว ห้ามสรุปหรือแสดงคะแนนซ้ำ เริ่มต่อจากบรรทัดสุดท้ายทันที`
    : "ทำต่อจากที่ค้างไว้พอดี ห้ามพูดซ้ำเนื้อหาที่ส่งไปแล้ว ห้ามสรุปใหม่ ห้ามแสดงคะแนนหรือหัวข้อผลลัพธ์ซ้ำ ให้เริ่มต่อจากบรรทัดสุดท้ายทันที";
}

/* -------------------------------------------------------------------------- */
/* Step (f) — score/summary split + shared per-episode verification          */
/* -------------------------------------------------------------------------- */

function splitScoreSummaryFromBody(fullText: string): { scoreSummary: string; body: string } {
  const lines = fullText.split("\n");
  const firstEpisodeLineIndex = lines.findIndex((line) =>
    EPISODE_HEADER_LINE_PATTERN.test(stripWrappingMarkdownEmphasis(line)),
  );
  if (firstEpisodeLineIndex === -1) {
    return { scoreSummary: fullText.trim(), body: "" };
  }
  return {
    scoreSummary: lines.slice(0, firstEpisodeLineIndex).join("\n").trim(),
    body: lines.slice(firstEpisodeLineIndex).join("\n"),
  };
}

/**
 * Counts how many times each episode number's header line appears in `body`
 * (2026-07-10 whole-block restoration, Q4 dedup guard) — a DUPLICATE header
 * means `splitStoryScriptTextIntoEpisodeBlocks`' silent last-wins overwrite
 * would have hidden a real problem (e.g. the model re-emitted an episode
 * after a continuation round, or drifted into repeating itself). Any episode
 * number with a count > 1 must be treated as a straggler, never trusted from
 * the whole-block pass.
 */
function countEpisodeHeaderOccurrences(body: string): Map<number, number> {
  const counts = new Map<number, number>();
  for (const line of body.split("\n")) {
    const match = stripWrappingMarkdownEmphasis(line).match(EPISODE_HEADER_LINE_PATTERN);
    if (!match) continue;
    const episodeNumber = Number(match[1]);
    counts.set(episodeNumber, (counts.get(episodeNumber) ?? 0) + 1);
  }
  return counts;
}

/**
 * Parses + verifies ONE episode's already-isolated text block and, on
 * success, builds the `StoredEpisodeBreakdownItem` to merge back in — the
 * shared verification core used by BOTH the whole-block primary pass (one
 * block per expected episode, isolated via `splitStoryScriptTextIntoEpisodeBlocks`)
 * and the per-episode straggler redo pass below (2026-07-10 whole-block
 * restoration — factored out of the old per-episode-only verification body
 * to avoid duplicating the exact-shot-count/numbering check and the
 * `enforceEpisodeShotDraftSpeakability` repair step in two places).
 */
function verifyAndBuildImprovedEpisodeItem(params: {
  episodeNumber: number;
  lang: StoryScriptLang;
  block: string;
  originalItem: StoredEpisodeBreakdownItem;
}): { improvedItem: StoredEpisodeBreakdownItem | null; reasons: string[] } {
  const { episodeNumber, lang, block, originalItem } = params;
  const reasons: string[] = [];

  const parsed = parseStoryScriptEpisodeBlock(lang, block.trim(), {
    expectedShotCount: VD_DEEP_DRAFT_SHOTS_PER_EPISODE,
  });
  if (!parsed) {
    reasons.push(`ตอนที่ ${episodeNumber}: ไม่สามารถแยกโครงสร้างช็อตจากผลลัพธ์ได้`);
    return { improvedItem: null, reasons };
  }

  const shotNumbers = parsed.shots.map((shot) => shot.shot_number);
  const uniqueShotNumbers = new Set(shotNumbers);
  const validNumbering =
    shotNumbers.length === VD_DEEP_DRAFT_SHOTS_PER_EPISODE &&
    uniqueShotNumbers.size === VD_DEEP_DRAFT_SHOTS_PER_EPISODE &&
    shotNumbers.every((n) => n >= 1 && n <= VD_DEEP_DRAFT_SHOTS_PER_EPISODE);
  if (!validNumbering) {
    reasons.push(
      `ตอนที่ ${episodeNumber}: ต้องมีช็อตครบ ${VD_DEEP_DRAFT_SHOTS_PER_EPISODE} ช็อต เรียงลำดับ 1-${VD_DEEP_DRAFT_SHOTS_PER_EPISODE} โดยไม่ซ้ำ (พบ ${shotNumbers.length} ช็อต)`,
    );
    return { improvedItem: null, reasons };
  }

  const rawShots = parsed.shots.map((shot) => ({
    shot_number: shot.shot_number,
    summary: shot.summary,
    dialogue_lines: shot.dialogue_lines.map((line) => ({
      speaker: line.speaker,
      line: line.line,
      ...(line.delivery ? { delivery: line.delivery } : {}),
    })),
    silence_intent: undefined,
  })) as unknown as VdDeepDraftShotDraft[];

  const speakabilityWarnings: VdDeepDraftWarning[] = [];
  const repairedShots = enforceEpisodeShotDraftSpeakability(episodeNumber, rawShots, speakabilityWarnings);
  const draftCompleteness = computeDraftCompleteness(repairedShots);

  const improvedItem = {
    ...originalItem,
    workingTitle: parsed.workingTitle || originalItem.workingTitle,
    logline: parsed.logline || originalItem.logline,
    keyBeats: parsed.keyBeats.length > 0 ? parsed.keyBeats : originalItem.keyBeats,
    shotDrafts: repairedShots,
    draftCompleteness,
    ...(parsed.cliffhangerLine ? { cliffhanger_line: parsed.cliffhangerLine } : {}),
  } as StoredEpisodeBreakdownItem;

  return { improvedItem, reasons: [] };
}

/* -------------------------------------------------------------------------- */
/* Public entry point                                                         */
/* -------------------------------------------------------------------------- */

export interface RunImproveScriptJobParams {
  tenantId: string;
  userId: number;
  seriesId: number;
  userRevisionRequest: string;
  idempotencyKey?: string;
}

/** One entry per episode that failed its own pass — populated regardless of whether the overall job ends up `needsReview` (i.e. also present for a job that still has other episodes succeed). */
export interface PerEpisodeImproveScriptWarning {
  episodeNumber: number;
  reasons: string[];
}

export interface RunImproveScriptJobResult {
  /** The whole-block primary pass' own short score/summary (trimmed), split off before the first episode header — a single string (2026-07-10 whole-block restoration; no longer a per-episode concatenation). */
  scoreSummary: string;
  expectedEpisodeNumbers: number[];
  inputTruncated: boolean;
  inputOmittedEpisodeNumbers: number[];
  /** `true` ONLY when literally nothing succeeded (`improvedItems.length === 0`) — was: true if even one episode failed, discarding every other episode's good result too (the whole-job fail-closed bug this per-episode rewrite fixes). */
  needsReview: boolean;
  /** Populated ONLY when `needsReview` is `true` — aggregate of every failed episode's own reasons. */
  needsReviewReasons: string[];
  /** No longer nullable — a subset of `expectedEpisodeNumbers` (one entry per episode whose pass succeeded), `[]` when nothing succeeded (never `null`). */
  improvedItems: StoredEpisodeBreakdownItem[];
  /** Episode numbers whose own pass failed (threw, or failed verification) — present whether or not the overall job `needsReview`; the client can render a non-blocking warning for these even when confirm is still allowed. */
  partialFailureEpisodeNumbers: number[];
  /** One entry per episode in `partialFailureEpisodeNumbers`, with that episode's own failure reasons. */
  perEpisodeWarnings: PerEpisodeImproveScriptWarning[];
  /** The whole-block primary pass' accumulated raw text, followed by each straggler episode's own raw text (prefixed `===== ตอนที่ N =====`), so the existing "view raw text" fallback still works for both success and failure. */
  rawText: string;
  /** `true` if the whole-block primary pass OR any straggler redo hit its own round cap. */
  truncatedAtMaxRounds: boolean;
  /** `bible.activeBreakdownVersionId` AS SEEN at the start of this run — `confirmImproveScript`'s staleness guard compares this against the CURRENT value before writing. `null` for a legacy bible with no versioned breakdown yet. */
  activeBreakdownVersionIdAtRun: string | null;
  model: string;
  modelSource: SkillExecutionPolicyResult["modelSource"];
  /** Sum across the whole-block pass' rounds AND every straggler episode's rounds. */
  callsMade: number;
  /** Sum across the whole-block pass AND every straggler episode. */
  creditsUsed: number;
  /**
   * `planning/vertical-drama-character-variants/plan.md` Phase B — outcome of
   * the season-wide character variant/twin planning phase, run ONLY when
   * `improvedItems.length > 0` (best-effort, see step (g) below). `null`
   * means the phase was either skipped (nothing improved, or no standalone
   * characters/episodes to plan against) OR it ran and failed for any reason
   * — a failure here NEVER fails the overall job, so this field alone cannot
   * distinguish "skipped" from "failed"; see the server log
   * (`vd_character_variant_planner`) for failure detail.
   */
  characterVariantSummary: CharacterVariantReconciliationSummary | null;
}

/** Thrown by step (a) when the caller owns no series matching `seriesId` — mirrors the router's own `loadOwnedSeries` "NOT_FOUND, never discloses existence" convention (duplicated here rather than imported, since that helper is private to `routers/verticalDramaSeries.ts`). */
async function loadOwnedVerticalDramaSeriesRow(tenantId: string, userId: number, seriesId: number) {
  const [row] = await db
    .select()
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, seriesId),
        eq(verticalDramaSeries.tenantId, tenantId),
        eq(verticalDramaSeries.userId, userId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Series not found" });
  }
  return row;
}

function resolveScriptLangFromLocale(locale: string | null | undefined): StoryScriptLang {
  return locale === "th" ? "th" : "en";
}

/* -------------------------------------------------------------------------- */
/* Whole-block PRIMARY pass (2026-07-10 whole-block restoration)              */
/* -------------------------------------------------------------------------- */

interface WholeBlockPassOutcome {
  accumulated: string;
  truncatedAtMaxRounds: boolean;
  callsMade: number;
  creditsUsed: number;
  model: string;
}

/**
 * Runs the drama-script-evaluate-improve skill ONCE for the WHOLE drafted
 * season — the bounded continuation loop mechanics (truncation detection via
 * `finish_reason === "length"` OR the tail continuation-marker regex, the
 * constant-size "continue" replay pattern, now with the strengthened
 * episode+shot-aware resume nudge) scoped to the ENTIRE season rather than
 * one episode, capped at `VD_IMPROVE_SCRIPT_MAX_CONTINUATION_ROUNDS` (8)
 * rounds of `VD_IMPROVE_SCRIPT_PER_ROUND_MAX_TOKENS` (16k) each. Does NOT
 * verify/parse the result itself — that is `runImproveScriptJob`'s job,
 * split out because the whole season's text needs
 * `splitStoryScriptTextIntoEpisodeBlocks` + the dedup-header guard first.
 *
 * Throws `ImproveScriptSkillCallError` (via `buildImproveScriptSkillCallError`)
 * on an outright LLM-call failure — the caller does not catch this
 * internally; a total primary-pass failure fails the whole job, matching
 * this file's existing behavior for skill-resolution failures at the top of
 * `runImproveScriptJob`.
 */
async function runImproveScriptWholeBlockPass(params: {
  skillSystemContent: string;
  originalScript: string;
  userRevisionRequest: string;
  executionPolicy: SkillExecutionPolicyResult;
  userId: number;
  tenantId: string;
  seriesId: number;
  onProgress: (progress: VerticalDramaStoryJobProgress) => void;
}): Promise<WholeBlockPassOutcome> {
  const { skillSystemContent, originalScript, userRevisionRequest, executionPolicy, userId, tenantId, seriesId, onProgress } =
    params;

  const firstMessages = buildImproveScriptMessages({ skillSystemContent, originalScript, userRevisionRequest });
  const systemMessage = firstMessages[0]!;
  const firstUserMessage = firstMessages[1]!;

  let messages = firstMessages;
  let accumulated = "";
  let truncatedAtMaxRounds = false;
  let callsMade = 0;
  let creditsUsed = 0;
  let model = "";

  for (let round = 1; round <= VD_IMPROVE_SCRIPT_MAX_CONTINUATION_ROUNDS; round += 1) {
    // NO episodeIndex/episodeCount/attemptIndex/attemptCount here (unlike the
    // straggler pass below) — this is a whole-job, round-only progress
    // signal so the frontend's round-only progress tier renders correctly.
    onProgress({
      phase: "fix",
      chunkIndex: round,
      chunkCount: VD_IMPROVE_SCRIPT_MAX_CONTINUATION_ROUNDS,
      callsDone: callsMade,
    });

    const result = await executeSkillLlmWithFallback({
      messages,
      skillSlug: VD_IMPROVE_SCRIPT_SKILL_ID,
      userId,
      executionPolicy,
      maxTokens: VD_IMPROVE_SCRIPT_PER_ROUND_MAX_TOKENS,
      temperature: 0.4,
    });
    callsMade += 1;

    if (!result.success || !result.content?.trim()) {
      throw buildImproveScriptSkillCallError(result);
    }
    if (result.modelId) model = result.modelId;
    creditsUsed += await chargeImproveScriptLlmUsage({
      userId,
      tenantId,
      seriesId,
      episodeNumber: 0,
      round,
      attemptIndex: 1,
      attemptCount: 1,
      result,
    });

    const rawContent = result.content;
    const finishReason = readFinishReason(result.rawData);
    const tailMarkerMatch = rawContent.match(TAIL_CONTINUATION_MARKER_PATTERN);
    const isTruncated = finishReason === "length" || Boolean(tailMarkerMatch);

    const cleanedChunk = tailMarkerMatch
      ? rawContent.slice(0, tailMarkerMatch.index).trimEnd()
      : rawContent;
    accumulated = accumulated ? `${accumulated}\n${cleanedChunk}` : cleanedChunk;

    onProgress({
      phase: "fix",
      chunkIndex: round,
      chunkCount: VD_IMPROVE_SCRIPT_MAX_CONTINUATION_ROUNDS,
      callsDone: callsMade,
    });

    if (!isTruncated) {
      break;
    }
    if (round === VD_IMPROVE_SCRIPT_MAX_CONTINUATION_ROUNDS) {
      truncatedAtMaxRounds = true;
      break;
    }

    // Replay ONLY the system prompt + the original first user turn + the
    // assistant's last cleaned chunk + the episode/shot-aware "keep going"
    // nudge — NOT the full growing history — so each round's input stays
    // roughly constant size instead of growing every round.
    messages = [
      systemMessage,
      firstUserMessage,
      { role: "assistant", content: cleanedChunk },
      { role: "user", content: buildImproveScriptResumeNudge(accumulated) },
    ];
  }

  return { accumulated, truncatedAtMaxRounds, callsMade, creditsUsed, model };
}

/* -------------------------------------------------------------------------- */
/* Straggler-redo per-episode pass (2026-07-10 whole-block restoration —      */
/* this used to be the PRIMARY loop; it is now exclusively the bounded        */
/* fallback for whichever episodes the whole-block pass didn't verify)        */
/* -------------------------------------------------------------------------- */

/** One episode's own outcome from `runImproveScriptEpisodePass` — never throws for a VERIFICATION failure (returned via `reasons`); DOES throw (propagated to the caller's own try/catch) for an LLM-call failure, mirroring the original whole-job code's own throw-on-call-failure behavior, just now scoped to one episode. */
interface PerEpisodeImproveScriptOutcome {
  episodeNumber: number;
  rawText: string;
  improvedItem: StoredEpisodeBreakdownItem | null;
  reasons: string[];
  truncatedAtMaxRounds: boolean;
  callsMade: number;
  creditsUsed: number;
  model: string;
}

/**
 * Thrown by `runImproveScriptEpisodePass` when the LLM call itself fails
 * (not a verification failure — those are returned via `reasons`, never
 * thrown). `retryable` distinguishes a failure that MIGHT succeed on a
 * fresh attempt (transient upstream error) from one that would fail
 * identically every time (no model configured at all, or every fallback
 * candidate was rejected for auth reasons) — `runImproveScriptEpisodeWithRetries`
 * uses this to avoid wasting the retry budget on a guaranteed-repeat failure.
 * Also used (undecorated) by the whole-block primary pass above.
 */
class ImproveScriptSkillCallError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}

/**
 * Classifies an `executeSkillLlmWithFallback` failure as retryable or not.
 * `SkillLlmResult.attempts` (`FallbackAttempt[]`, `services/skillModelFallback.ts`)
 * always carries a `statusCode: number | null` per candidate model tried —
 * used here to detect "every single fallback candidate was rejected for an
 * auth reason (401/403)", which would fail identically on a fresh attempt
 * with the same executionPolicy. `"No enabled LLM model available"` (emitted
 * when `buildCandidateList` returns zero candidates, `attempts: []`) is the
 * other confirmed non-retryable case — no model is configured at all.
 */
function buildImproveScriptSkillCallError(result: SkillLlmResult): ImproveScriptSkillCallError {
  const message = result.error || "drama-script-evaluate-improve skill call failed";
  const noModelConfigured = /No enabled LLM model available/i.test(message);
  const allAttemptsAuthFailure =
    (result.attempts?.length ?? 0) > 0 &&
    result.attempts.every((a) => a.statusCode === 401 || a.statusCode === 403);
  const retryable = !noModelConfigured && !allAttemptsAuthFailure;
  return new ImproveScriptSkillCallError(message, retryable);
}

async function runImproveScriptEpisodePass(params: {
  episodeNumber: number;
  episodeIndex: number;
  episodeCount: number;
  lang: StoryScriptLang;
  skillSystemContent: string;
  originalScript: string;
  userRevisionRequest: string;
  executionPolicy: SkillExecutionPolicyResult;
  userId: number;
  tenantId: string;
  seriesId: number;
  originalItem: StoredEpisodeBreakdownItem;
  onProgress: (progress: VerticalDramaStoryJobProgress) => void;
  /** 2026-07-10 retry-until-pass — 1-based index of the current attempt for THIS episode, and the total attempt budget (`VD_IMPROVE_SCRIPT_STRAGGLER_MAX_ATTEMPTS`). Echoed into progress events + credit-charge metadata. */
  attemptIndex: number;
  attemptCount: number;
  /** 2026-07-10 retry-until-pass — the PREVIOUS attempt's own failure reasons (verification `reasons`, or a single-entry array with the thrown error's message), fed into this attempt's prompt as `previous_attempt_feedback`. Absent on attempt 1. */
  priorAttemptFailureReasons?: string[];
  /**
   * Per-round continuation cap for THIS episode's own pass (2026-07-10
   * whole-block restoration) — always `VD_IMPROVE_SCRIPT_STRAGGLER_MAX_ROUNDS`
   * from the one remaining caller (the straggler redo path); an explicit
   * required param rather than an implicit default since this function has
   * exactly one call site now.
   */
  maxRounds: number;
}): Promise<PerEpisodeImproveScriptOutcome> {
  const {
    episodeNumber,
    episodeIndex,
    episodeCount,
    lang,
    skillSystemContent,
    originalScript,
    userRevisionRequest,
    executionPolicy,
    userId,
    tenantId,
    seriesId,
    originalItem,
    onProgress,
    attemptIndex,
    attemptCount,
    priorAttemptFailureReasons,
    maxRounds,
  } = params;

  const firstMessages = buildImproveScriptMessages({
    skillSystemContent,
    originalScript,
    userRevisionRequest,
    priorAttemptFeedback:
      priorAttemptFailureReasons && priorAttemptFailureReasons.length > 0
        ? buildImproveScriptRetryFeedback(priorAttemptFailureReasons)
        : undefined,
  });
  const systemMessage = firstMessages[0]!;
  const firstUserMessage = firstMessages[1]!;

  let messages = firstMessages;
  let accumulated = "";
  let truncatedAtMaxRounds = false;
  let callsMade = 0;
  let creditsUsed = 0;
  let model = "";

  for (let round = 1; round <= maxRounds; round += 1) {
    onProgress({
      phase: "fix",
      episodeIndex,
      episodeCount,
      chunkIndex: round,
      chunkCount: maxRounds,
      callsDone: callsMade,
      attemptIndex,
      attemptCount,
    });

    const result = await executeSkillLlmWithFallback({
      messages,
      skillSlug: VD_IMPROVE_SCRIPT_SKILL_ID,
      userId,
      executionPolicy,
      maxTokens: VD_IMPROVE_SCRIPT_PER_ROUND_MAX_TOKENS,
      temperature: 0.4,
    });
    callsMade += 1;

    if (!result.success || !result.content?.trim()) {
      throw buildImproveScriptSkillCallError(result);
    }
    if (result.modelId) model = result.modelId;
    creditsUsed += await chargeImproveScriptLlmUsage({
      userId,
      tenantId,
      seriesId,
      episodeNumber,
      round,
      attemptIndex,
      attemptCount,
      result,
    });

    const rawContent = result.content;
    const finishReason = readFinishReason(result.rawData);
    const tailMarkerMatch = rawContent.match(TAIL_CONTINUATION_MARKER_PATTERN);
    const isTruncated = finishReason === "length" || Boolean(tailMarkerMatch);

    const cleanedChunk = tailMarkerMatch
      ? rawContent.slice(0, tailMarkerMatch.index).trimEnd()
      : rawContent;
    accumulated = accumulated ? `${accumulated}\n${cleanedChunk}` : cleanedChunk;

    onProgress({
      phase: "fix",
      episodeIndex,
      episodeCount,
      chunkIndex: round,
      chunkCount: maxRounds,
      callsDone: callsMade,
      attemptIndex,
      attemptCount,
    });

    if (!isTruncated) {
      break;
    }
    if (round === maxRounds) {
      truncatedAtMaxRounds = true;
      break;
    }

    messages = [
      systemMessage,
      firstUserMessage,
      { role: "assistant", content: cleanedChunk },
      { role: "user", content: buildImproveScriptResumeNudge(accumulated) },
    ];
  }

  // Split score/summary, parse the body, verify — scoped to this one episode.
  const { body } = splitScoreSummaryFromBody(accumulated);
  const reasons: string[] = [];

  if (CONTINUATION_MARKER_PATTERN.test(accumulated)) {
    reasons.push("พบเครื่องหมายต่อเนื้อหา (continuation marker) หลงเหลืออยู่ในผลลัพธ์ — เนื้อหาอาจไม่สมบูรณ์");
  }
  if (truncatedAtMaxRounds) {
    reasons.push(`สร้างเนื้อหาไม่เสร็จสมบูรณ์ภายใน ${maxRounds} รอบที่กำหนดต่อหนึ่งตอน`);
  }

  const headerNumbers = body
    .split("\n")
    .map((line) => stripWrappingMarkdownEmphasis(line).match(EPISODE_HEADER_LINE_PATTERN))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => Number(m[1]));
  if (new Set(headerNumbers).size !== headerNumbers.length) {
    reasons.push("พบหมายเลขตอนซ้ำในผลลัพธ์");
  }
  const foreignEpisodeNumbers = headerNumbers.filter((n) => n !== episodeNumber);
  if (foreignEpisodeNumbers.length > 0) {
    reasons.push(`พบหมายเลขตอนที่ไม่ตรงกับตอนที่ ${episodeNumber} ในผลลัพธ์ (${foreignEpisodeNumbers.join(", ")})`);
  }

  let improvedItem: StoredEpisodeBreakdownItem | null = null;
  if (reasons.length === 0) {
    const verification = verifyAndBuildImprovedEpisodeItem({ episodeNumber, lang, block: body.trim(), originalItem });
    reasons.push(...verification.reasons);
    improvedItem = verification.improvedItem;
  }

  return {
    episodeNumber,
    rawText: accumulated,
    improvedItem,
    reasons,
    truncatedAtMaxRounds,
    callsMade,
    creditsUsed,
    model,
  };
}

/**
 * Bounded retry-until-pass wrapper around `runImproveScriptEpisodePass`
 * (added 2026-07-10 — see the parser-fragility incident doc comment on
 * `stripWrappingMarkdownEmphasis` in `@shared/verticalDramaSeries/storyScriptText`).
 * Sits between the straggler-redo loop in `runImproveScriptJob` and
 * `runImproveScriptEpisodePass` itself — `runImproveScriptEpisodePass`'s own
 * inner continuation-round loop is completely untouched by this wrapper.
 *
 * On a FAILED attempt (verification failure — `reasons.length > 0` or no
 * `improvedItem` — OR a retryable thrown `ImproveScriptSkillCallError`), the
 * specific failure reasons feed into the NEXT attempt's prompt via
 * `priorAttemptFailureReasons`. A non-retryable thrown error re-throws
 * immediately (matching today's exact behavior for that case — no attempts
 * wasted). Exhausting `VD_IMPROVE_SCRIPT_STRAGGLER_MAX_ATTEMPTS` attempts
 * returns the LAST attempt's own outcome as-is (including its `reasons`),
 * so `runImproveScriptJob`'s existing graceful-degradation handling
 * (`partialFailureEpisodeNumbers`/`perEpisodeWarnings`) applies completely
 * unchanged — retries sit in FRONT of that degradation, they don't replace it.
 */
async function runImproveScriptEpisodeWithRetries(
  params: Omit<
    Parameters<typeof runImproveScriptEpisodePass>[0],
    "attemptIndex" | "attemptCount" | "priorAttemptFailureReasons"
  >,
): Promise<PerEpisodeImproveScriptOutcome> {
  let totalCallsMade = 0;
  let totalCreditsUsed = 0;
  let latestModel = "";
  let priorAttemptFailureReasons: string[] | undefined;

  for (let attempt = 1; attempt <= VD_IMPROVE_SCRIPT_STRAGGLER_MAX_ATTEMPTS; attempt += 1) {
    let outcome: PerEpisodeImproveScriptOutcome;
    try {
      outcome = await runImproveScriptEpisodePass({
        ...params,
        attemptIndex: attempt,
        attemptCount: VD_IMPROVE_SCRIPT_STRAGGLER_MAX_ATTEMPTS,
        priorAttemptFailureReasons,
      });
    } catch (error) {
      const isLastAttempt = attempt === VD_IMPROVE_SCRIPT_STRAGGLER_MAX_ATTEMPTS;
      const nonRetryable = error instanceof ImproveScriptSkillCallError && !error.retryable;
      if (isLastAttempt || nonRetryable) throw error;
      priorAttemptFailureReasons = [error instanceof Error ? error.message : String(error)];
      continue;
    }

    totalCallsMade += outcome.callsMade;
    totalCreditsUsed += outcome.creditsUsed;
    if (outcome.model) latestModel = outcome.model;

    if (outcome.reasons.length === 0 && outcome.improvedItem) {
      return { ...outcome, callsMade: totalCallsMade, creditsUsed: totalCreditsUsed, model: latestModel };
    }
    if (attempt === VD_IMPROVE_SCRIPT_STRAGGLER_MAX_ATTEMPTS) {
      return { ...outcome, callsMade: totalCallsMade, creditsUsed: totalCreditsUsed, model: latestModel };
    }
    priorAttemptFailureReasons = outcome.reasons;
  }
  throw new Error("unreachable");
}

/* -------------------------------------------------------------------------- */
/* Job entry point                                                            */
/* -------------------------------------------------------------------------- */

export async function runImproveScriptJob(
  params: RunImproveScriptJobParams,
  onProgress: (progress: VerticalDramaStoryJobProgress) => void,
): Promise<RunImproveScriptJobResult> {
  const { tenantId, userId, seriesId, userRevisionRequest } = params;

  // (a) Load series, get active breakdown, collect drafted episodes.
  const row = await loadOwnedVerticalDramaSeriesRow(tenantId, userId, seriesId);
  const bible = (row.bible as Record<string, unknown> | null) ?? {};
  const activeItems = getActiveBreakdown(bible);
  const hasAnyDraftedEpisode = activeItems.some((item) => readItemShotDrafts(item) !== null);
  if (!hasAnyDraftedEpisode) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Generate deep story drafts first before improving this script",
    });
  }
  const activeBreakdownVersionIdAtRun =
    typeof (bible as { activeBreakdownVersionId?: unknown }).activeBreakdownVersionId === "string"
      ? ((bible as { activeBreakdownVersionId?: string }).activeBreakdownVersionId as string)
      : null;

  // (b) Build the whole-season input ONCE — this IS the `original_script`
  // sent to the whole-block primary pass below (2026-07-10 whole-block
  // restoration — no more per-episode-only text here).
  const lang = resolveScriptLangFromLocale(row.locale);
  const seasonArc = typeof bible.expandedSeasonArc === "string" ? bible.expandedSeasonArc : null;
  const wholeSeasonScriptInput = buildStoryScriptTextFromBible(bible, {
    lang,
    title: row.title,
    genre: row.genre,
    tone: row.tone,
    seasonArc,
  });
  const expectedEpisodeNumbers = wholeSeasonScriptInput.expectedEpisodeNumbers;

  // (c) Resolve the skill + its execution policy ONCE — upgrade to the
  // cheapest eligible large-context THINKING-CAPABLE enabled model when no
  // explicit pin is configured.
  const skill = await getSkillByIdAsync(VD_IMPROVE_SCRIPT_SKILL_ID);
  if (!skill) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Skill '${VD_IMPROVE_SCRIPT_SKILL_ID}' is not available`,
    });
  }
  const executionPolicy = await resolveImproveScriptExecutionPolicy(skill);
  const skillSystemContent = skill.systemPrompt || skill.skillContent || "";

  // (d) Whole-block PRIMARY pass — one continuation loop over the whole
  // season. A thrown LLM-call failure here propagates uncaught (matches this
  // file's existing behavior for skill-resolution failures above); the
  // per-episode straggler path below never runs in that case.
  const wholeBlockOutcome = await runImproveScriptWholeBlockPass({
    skillSystemContent,
    originalScript: wholeSeasonScriptInput.text,
    userRevisionRequest,
    executionPolicy,
    userId,
    tenantId,
    seriesId,
    onProgress,
  });

  let callsMade = wholeBlockOutcome.callsMade;
  let creditsUsed = wholeBlockOutcome.creditsUsed;
  let model = wholeBlockOutcome.model;
  let truncatedAtMaxRounds = wholeBlockOutcome.truncatedAtMaxRounds;

  // (e) Split score/summary, split into per-episode blocks, dedup-header
  // guard, then verify each expected episode with the shared verification
  // core. Episodes that fail (missing block, duplicate header, or failed
  // parse/shot-numbering) become stragglers. NOTE: a lone leftover
  // continuation marker trailing an otherwise-complete block is NOT treated
  // as disqualifying here — confirmed via real series-6 re-validation
  // (2026-07-10) that the model sometimes emits this marker as a natural
  // episode-transition cue WITHIN a single generation (not only at a true
  // API-level truncation boundary), even for episodes whose content is
  // otherwise complete and valid. `parseStoryScriptEpisodeBlock` already
  // stops reading once it captures the cliffhanger line, so trailing marker
  // text never leaks into the stored/merged item either way.
  const { scoreSummary, body } = splitScoreSummaryFromBody(wholeBlockOutcome.accumulated);
  const headerCounts = countEpisodeHeaderOccurrences(body);
  const blocks = splitStoryScriptTextIntoEpisodeBlocks(lang, body);

  const activeItemByEpisode = new Map(activeItems.map((item) => [item.episodeNumber, item]));
  const improvedItemsByEpisode = new Map<number, StoredEpisodeBreakdownItem>();
  const partialFailureEpisodeNumbers: number[] = [];
  const perEpisodeWarnings: PerEpisodeImproveScriptWarning[] = [];
  const stragglerEpisodeNumbers: number[] = [];

  for (const episodeNumber of expectedEpisodeNumbers) {
    const originalItem = activeItemByEpisode.get(episodeNumber);
    if (!originalItem) {
      // Structurally shouldn't happen (episodeNumber came from
      // expectedEpisodeNumbers, itself derived from activeItems) — defensive
      // immediate failure, no point redoing this one via straggler path.
      partialFailureEpisodeNumbers.push(episodeNumber);
      perEpisodeWarnings.push({
        episodeNumber,
        reasons: [`ตอนที่ ${episodeNumber}: ไม่พบข้อมูลตอนเดิมสำหรับปรับปรุง`],
      });
      continue;
    }

    const occurrences = headerCounts.get(episodeNumber) ?? 0;
    if (occurrences > 1) {
      stragglerEpisodeNumbers.push(episodeNumber);
      continue;
    }
    const block = blocks.get(episodeNumber);
    if (!block) {
      stragglerEpisodeNumbers.push(episodeNumber);
      continue;
    }

    const { improvedItem, reasons } = verifyAndBuildImprovedEpisodeItem({ episodeNumber, lang, block, originalItem });
    if (improvedItem && reasons.length === 0) {
      improvedItemsByEpisode.set(episodeNumber, improvedItem);
    } else {
      stragglerEpisodeNumbers.push(episodeNumber);
    }
  }

  // (f) Bounded per-episode straggler redo — reuses the per-episode
  // machinery (kept exclusively for this now), scoped counts to the
  // straggler set only. Each straggler is in its own try/catch so one
  // episode's hard failure never discards another's good result (mirrors
  // the former per-episode primary loop's own graceful-degradation design).
  const stragglerCount = stragglerEpisodeNumbers.length;
  const stragglerRawTextParts: string[] = [];

  for (let i = 0; i < stragglerEpisodeNumbers.length; i += 1) {
    const episodeNumber = stragglerEpisodeNumbers[i]!;
    const episodeIndex = i + 1;
    const originalItem = activeItemByEpisode.get(episodeNumber)!;

    const episodeScriptInput = buildStoryScriptTextFromBible(bible, {
      lang,
      title: row.title,
      genre: row.genre,
      tone: row.tone,
      seasonArc,
      episodeNumber,
    });

    try {
      const outcome = await runImproveScriptEpisodeWithRetries({
        episodeNumber,
        episodeIndex,
        episodeCount: stragglerCount,
        lang,
        skillSystemContent,
        originalScript: episodeScriptInput.text,
        userRevisionRequest,
        executionPolicy,
        userId,
        tenantId,
        seriesId,
        originalItem,
        onProgress,
        maxRounds: VD_IMPROVE_SCRIPT_STRAGGLER_MAX_ROUNDS,
      });

      callsMade += outcome.callsMade;
      creditsUsed += outcome.creditsUsed;
      if (outcome.model) model = outcome.model;
      if (outcome.truncatedAtMaxRounds) truncatedAtMaxRounds = true;

      stragglerRawTextParts.push(`===== ตอนที่ ${episodeNumber} (straggler redo) =====\n${outcome.rawText}`);

      if (outcome.reasons.length === 0 && outcome.improvedItem) {
        improvedItemsByEpisode.set(episodeNumber, outcome.improvedItem);
      } else {
        partialFailureEpisodeNumbers.push(episodeNumber);
        perEpisodeWarnings.push({
          episodeNumber,
          reasons: outcome.reasons.length > 0 ? outcome.reasons : [`ตอนที่ ${episodeNumber}: ไม่สามารถปรับปรุงตอนนี้ได้`],
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      partialFailureEpisodeNumbers.push(episodeNumber);
      perEpisodeWarnings.push({
        episodeNumber,
        reasons: [`ตอนที่ ${episodeNumber}: เรียกใช้ LLM ล้มเหลว — ${message}`],
      });
      stragglerRawTextParts.push(`===== ตอนที่ ${episodeNumber} (straggler redo) =====\n`);
    }
  }

  const improvedItems = expectedEpisodeNumbers
    .filter((n) => improvedItemsByEpisode.has(n))
    .map((n) => improvedItemsByEpisode.get(n)!);

  const needsReview = improvedItems.length === 0;
  const needsReviewReasons = needsReview ? perEpisodeWarnings.flatMap((warning) => warning.reasons) : [];

  const rawText = [
    `===== ผลลัพธ์รอบหลัก (whole-season pass) =====\n${wholeBlockOutcome.accumulated}`,
    ...stragglerRawTextParts,
  ].join("\n\n");

  // (g) BEST-EFFORT final phase — season-wide character variant/twin
  // planning (`planning/vertical-drama-character-variants/plan.md` Phase B).
  // Runs ONLY when the improve pass produced at least one usable episode
  // (`improvedItems.length > 0`) — a whole-job failure has nothing improved
  // to plan variants against, so the phase is skipped entirely in that case,
  // same as it's skipped when there are no standalone characters or no
  // episode content to send. This phase can NEVER fail/block the overall
  // job: any error (insufficient credits, a bad LLM response, a DB error) is
  // caught here and logged; `characterVariantSummary` simply stays `null`
  // and the job's otherwise-successful script-improvement result is returned
  // unchanged.
  let characterVariantSummary: CharacterVariantReconciliationSummary | null = null;
  if (improvedItems.length > 0) {
    try {
      // Reuses the existing "fix" phase marker (never a new
      // `VerticalDramaStoryJobProgressPhase` value) — the client's own
      // `VerticalDramaStoryJobProgressLike.phase` union
      // (`VerticalDramaDeepStoryDraftsPanel.tsx`/`VerticalDramaImproveScriptCard.tsx`)
      // is a hand-declared literal type, not derived from this server type,
      // so a genuinely new phase value would break the client build; out of
      // scope for this phase (client/src/ is Phase E's work package).
      onProgress({ phase: "fix", callsDone: callsMade });

      const characterRows: VerticalDramaCharacterRow[] = await db
        .select()
        .from(verticalDramaCharacters)
        .where(
          and(
            eq(verticalDramaCharacters.tenantId, tenantId),
            eq(verticalDramaCharacters.userId, userId),
            eq(verticalDramaCharacters.seriesId, seriesId),
          ),
        );
      // W3 stable-ID reconcile
      // (`planning/vertical-drama-twin-variant-completeness/plan.md` W3):
      // EVERY row (base characters, existing variants, existing twins alike)
      // is sent back into the roster now — a prior run's variant/twin rows
      // are no longer filtered out, they carry `existing*CharacterKey`
      // markers instead (resolved below via `characterKeyById`) so the skill
      // can recognize "this is already known" and echo it back via
      // `existing_character_key` rather than re-describing a duplicate (see
      // `verticalDramaCharacterVariantPlanner.ts`'s
      // `reconcileCharacterVariantPlan` doc comment for the matching side).
      const characterKeyById = new Map<number, string>(
        characterRows.map((row) => [row.id, row.characterKey]),
      );
      const characterInputs: CharacterVariantPlannerCharacterInput[] = characterRows.map((row) => {
        const input: CharacterVariantPlannerCharacterInput = {
          characterKey: row.characterKey,
          name: row.name,
          role: row.role ?? "",
          description: extractCharacterRosterDescription(
            (row.data as Record<string, unknown> | null) ?? null,
          ),
        };
        if (row.parentCharacterId != null) {
          const parentKey = characterKeyById.get(row.parentCharacterId);
          if (parentKey) input.existingParentCharacterKey = parentKey;
          if (row.variantLabel) input.existingVariantLabel = row.variantLabel;
        }
        if (row.sharesFaceWithCharacterId != null) {
          const sourceKey = characterKeyById.get(row.sharesFaceWithCharacterId);
          if (sourceKey) input.existingSharesFaceWithCharacterKey = sourceKey;
        }
        return input;
      });

      // The (now-improved) whole season's content: improved episodes win,
      // any episode the straggler path never fixed falls back to its
      // original content — same "merge improved over original" shape
      // `buildStoryScriptTextFromBible`'s own mapping (step (b) above) uses,
      // just applied to the post-improvement merged set instead of the
      // pre-improvement `activeItems`.
      const mergedEpisodes: StoryScriptEpisodeInput[] = expectedEpisodeNumbers
        .map((n) => improvedItemsByEpisode.get(n) ?? activeItemByEpisode.get(n))
        .filter((item): item is StoredEpisodeBreakdownItem => Boolean(item))
        .map((item) => ({
          episodeNumber: item.episodeNumber,
          workingTitle: item.workingTitle,
          logline: item.logline,
          keyBeats: item.keyBeats,
          shotDrafts: readItemShotDrafts(item),
          cliffhangerLine: readItemCliffhangerLine(item),
        }));

      if (characterInputs.length > 0 && mergedEpisodes.length > 0) {
        const { plan, creditsUsed: variantCreditsUsed } = await generateCharacterVariantPlan({
          userId,
          tenantId,
          seriesId,
          lang,
          characters: characterInputs,
          episodes: mergedEpisodes,
          idempotencyKey: params.idempotencyKey,
        });
        creditsUsed += variantCreditsUsed;
        callsMade += 1;

        characterVariantSummary = await reconcileCharacterVariantPlan(
          { tenantId, userId, seriesId },
          plan,
        );
      }

      onProgress({ phase: "fix", callsDone: callsMade });
    } catch (error) {
      logCharacterVariantPlanningFailure(seriesId, error);
      characterVariantSummary = null;
    }
  }

  return {
    scoreSummary,
    expectedEpisodeNumbers,
    inputTruncated: wholeSeasonScriptInput.truncated,
    inputOmittedEpisodeNumbers: wholeSeasonScriptInput.omittedEpisodeNumbers,
    needsReview,
    needsReviewReasons,
    improvedItems,
    partialFailureEpisodeNumbers,
    perEpisodeWarnings,
    rawText,
    truncatedAtMaxRounds,
    activeBreakdownVersionIdAtRun,
    model,
    modelSource: executionPolicy.modelSource,
    callsMade,
    creditsUsed,
    characterVariantSummary,
  };
}
