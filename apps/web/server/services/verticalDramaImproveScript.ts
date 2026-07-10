/**
 * Vertical Drama Series — "ปรับปรุงบทละครให้มีความสมบูรณ์" (added 2026-07-10;
 * upgraded to a per-episode pass on 2026-07-10 — see the incident doc comment
 * on `runImproveScriptEpisodePass` below).
 *
 * Runs the already-built-but-unused `drama-script-evaluate-improve` skill
 * ONCE PER DRAFTED EPISODE (not once for the whole season — see the incident
 * note below), sharing one compact season/character "bible" block across
 * every episode's own call: each call sends that ONE episode's drafted
 * script (same per-episode text the "คัดลอกเนื้อเรื่อง" copy feature's
 * formatter builds — see `@shared/verticalDramaSeries/storyScriptText`) plus
 * the shared season reference block plus the user's free-text "what to
 * improve" request, gets back one markdown blob (short score/summary + that
 * one episode's revised script), parses it back into structured fields, and
 * verifies it — now scoped per episode with graceful degradation (one
 * episode's failure never discards another episode's good result).
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
 * series + its active breakdown, plus its full character roster for the
 * season reference block); persistence happens only in the router's
 * `confirmImproveScript` procedure, once the user explicitly confirms.
 */

import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { SkillDefinition } from "@smartspec/skills";
import { db } from "../db";
import { verticalDramaSeries, verticalDramaCharacters } from "../../drizzle/schema";
import {
  buildStoryScriptText,
  parseStoryScriptEpisodeBlock,
  STORY_SCRIPT_TEXT_CHAR_LIMIT,
  type StoryScriptEpisodeInput,
  type StoryScriptLang,
} from "@shared/verticalDramaSeries/storyScriptText";
import {
  buildCharacterIdentityMapBlock,
  type VerticalDramaCharacterDescriptorSource,
} from "@shared/verticalDramaSeries/characterIdentityMap";
import {
  getActiveBreakdown,
  readItemShotDrafts,
  readItemCliffhangerLine,
  enforceEpisodeShotDraftSpeakability,
  computeDraftCompleteness,
  VD_DEEP_DRAFT_SHOTS_PER_EPISODE,
  type StoredEpisodeBreakdownItem,
  type VdDeepDraftShotDraft,
  type VdDeepDraftWarning,
} from "./verticalDramaStoryBible";
import { getSkillByIdAsync } from "./skillRegistry";
import { resolveSkillExecutionPolicy, type SkillExecutionPolicyResult } from "./skillExecutionPolicy";
import { executeSkillLlmWithFallback, type SkillLlmResult } from "./skillModelFallback";
import { loadEnabledLlmModelRows } from "./enabledLlmModels";
import { deductCreditsForModel } from "./creditService";
import type { VerticalDramaStoryJobProgress } from "./verticalDramaStoryJobs";

/** The skill this whole feature is built around — already shipped, previously unused. */
export const VD_IMPROVE_SCRIPT_SKILL_ID = "drama-script-evaluate-improve";

/**
 * Bounded continuation loop — mirrors the removed quality-loop's own
 * round-cap convention. IMPORTANT: this is now a PER-EPISODE cap (reduced
 * from `6` to `2` on 2026-07-10), not a per-job cap — each drafted episode
 * gets its own fresh `1..N` round budget. Incident context: sending the
 * WHOLE season (54 shots across 6 episodes) as one request forced the model
 * to spread a shared ~48k-token budget across everything at once, producing
 * only ~165 tokens/shot on average (one shot's `dialogue_lines` came back
 * byte-identical to the original). Scoping generation to one episode at a
 * time gives each episode's 9 shots a genuinely generous budget in round 1
 * alone, so a 2nd round is only needed as truncation safety margin.
 */
export const VD_IMPROVE_SCRIPT_MAX_CONTINUATION_ROUNDS = 2;
/** Per-round token budget — keeps each round's own output bounded so the continuation loop makes real progress instead of one giant (and more truncation-prone) call. */
export const VD_IMPROVE_SCRIPT_PER_ROUND_MAX_TOKENS = 8_000;

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
 * `params.episodeNumber` (added 2026-07-10, per-episode generation fix):
 * when set, scopes the built text to just that ONE drafted episode —
 * `fromEpisode`/`toEpisode` both become `episodeNumber`. When omitted,
 * behavior is byte-identical to before this param existed (every drafted
 * episode, exactly as today). This function has no other call sites in the
 * codebase besides `runImproveScriptJob` below (verified via repo-wide
 * grep), so the additive param is safe.
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
/* Step (a1) — season reference block (2026-07-10 per-episode fix): a compact */
/* season/character "bible" shared across every episode's own call, so       */
/* per-episode generation doesn't lose season-wide continuity. Built ONCE per */
/* job and injected into every episode's SYSTEM message (never the user      */
/* message — the skill's documented contract, skill.md §2, is exactly the    */
/* two fields `original_script`/`user_revision_request`; adding a third      */
/* block to the user message risks the model treating it as required input   */
/* or echoing it into the output).                                           */
/* -------------------------------------------------------------------------- */

/**
 * Loads every character row for a series (2026-07-10 per-episode fix) —
 * replicates the query body of `routers/verticalDramaEpisodes.ts`'s
 * router-private `resolveShotCharacterIdentitySources`, WITHOUT its
 * `characterKeys` filter: this text format's `dialogue_lines[].speaker` is
 * free text, not a linkable `characterKey`, so there is no reliable per-shot
 * key set to filter by — fetching the whole cast once per job is the right
 * scope for the shared season reference block.
 */
async function resolveAllSeriesCharacterIdentitySources(
  tenantId: string,
  seriesId: number,
): Promise<VerticalDramaCharacterDescriptorSource[]> {
  const rows = await db
    .select({
      characterKey: verticalDramaCharacters.characterKey,
      name: verticalDramaCharacters.name,
      role: verticalDramaCharacters.role,
      data: verticalDramaCharacters.data,
    })
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.tenantId, tenantId),
        eq(verticalDramaCharacters.seriesId, seriesId),
      ),
    );
  return rows.map((row: (typeof rows)[number]) => ({
    characterKey: row.characterKey,
    name: row.name,
    role: row.role,
    description:
      typeof (row.data as Record<string, unknown> | null)?.description === "string"
        ? ((row.data as Record<string, unknown>).description as string)
        : undefined,
  }));
}

/**
 * Compact, read-only season/character reference block — title/genre/tone/
 * season-arc (same labels `buildStoryScriptText`'s own header uses) plus a
 * character identity map built via the EXISTING `buildCharacterIdentityMapBlock`
 * (reused as-is, not reimplemented). Wrapped with a clear header marking it
 * read-only/reference-only so the model never confuses it with
 * `original_script` or copies it into the output. Returns `undefined` when
 * there is nothing to include (no header fields and no known characters).
 */
function buildImproveScriptSeasonReferenceBlock(params: {
  lang: StoryScriptLang;
  title?: string | null;
  genre?: string | null;
  tone?: string | null;
  seasonArc?: string | null;
  characters: readonly VerticalDramaCharacterDescriptorSource[];
}): string | undefined {
  const headerLines = [
    params.title ? (params.lang === "th" ? `ซีรีส์: ${params.title}` : `Series: ${params.title}`) : null,
    params.genre ? (params.lang === "th" ? `แนว: ${params.genre}` : `Genre: ${params.genre}`) : null,
    params.tone ? (params.lang === "th" ? `โทน: ${params.tone}` : `Tone: ${params.tone}`) : null,
    params.seasonArc
      ? params.lang === "th"
        ? `เรื่องย่อรวม: ${params.seasonArc}`
        : `Season arc: ${params.seasonArc}`
      : null,
  ].filter((line): line is string => Boolean(line));

  const characterKeys = params.characters.map((character) => character.characterKey);
  const characterBlock = buildCharacterIdentityMapBlock(characterKeys, params.characters);

  const bodyLines = [...headerLines, ...(characterBlock ? [characterBlock] : [])];
  if (bodyLines.length === 0) return undefined;

  const header =
    params.lang === "th"
      ? "season_reference_context (ข้อมูลอ้างอิงพื้นหลังของทั้งซีซัน — ใช้เพื่อความต่อเนื่องเท่านั้น\nห้ามคัดลอกบล็อกนี้ลงใน output ห้ามแก้ไข ไม่ใช่ส่วนหนึ่งของ original_script):"
      : "season_reference_context (season-wide background reference — for continuity only.\nNEVER copy this block into the output, never edit it, not part of original_script):";

  return [header, ...bodyLines].join("\n");
}

/* -------------------------------------------------------------------------- */
/* Step (c) — model resolution: honor an explicit skill pin, else upgrade to  */
/* the CHEAPEST eligible large-context enabled model (2026-07-10 price-       */
/* awareness fix — see doc comment on `resolveCheapestEligibleLargeContextModelId`   */
/* below for the incident this replaces). The skill needs to swallow a whole  */
/* episode's drafted script plus the season reference block, so a large       */
/* context window is still the binding floor — but among every model that     */
/* clears that floor, price (not raw context size) now decides the winner.    */
/* -------------------------------------------------------------------------- */

/** Preserves the existing, user-confirmed context-window floor for this feature. */
const IMPROVE_SCRIPT_MIN_CONTEXT_LENGTH = 1_000_000;

/**
 * Picks the CHEAPEST enabled model (by summed input+output price per 1M
 * tokens) among those that (a) meet the `IMPROVE_SCRIPT_MIN_CONTEXT_LENGTH`
 * floor, (b) are not free-tier, and (c) pass this codebase's own "safe to
 * auto-pick" catalog-eligibility filter (`{ autoSelectionOnly: true }`).
 *
 * Replaces the former `resolveLargestContextEnabledModelId`, which sorted
 * ALL enabled models by `contextLength` descending with NO price comparison
 * and NO `autoSelectionOnly` filter — confirmed via direct DB/audit-log
 * investigation (series 6 production run) to have picked `openai/gpt-5.5`
 * ($5.00/$30.00 per 1M tokens) when `openai/gpt-5.6-terra` ($2.50/$15.00,
 * same context window) and cheaper still options were enabled and eligible.
 * Free-tier models are excluded deliberately: they are typically rate-
 * limited/lower-priority in practice, a bad trade for a feature whose whole
 * point is reliable, higher-quality script generation.
 */
export async function resolveCheapestEligibleLargeContextModelId(): Promise<string | null> {
  try {
    const rows = await loadEnabledLlmModelRows({ autoSelectionOnly: true });
    const eligible = rows.filter(
      (row) => (row.contextLength ?? 0) >= IMPROVE_SCRIPT_MIN_CONTEXT_LENGTH && !row.isFree,
    );
    if (eligible.length === 0) return null;
    const sorted = [...eligible].sort(
      (a, b) =>
        Number(a.pricingInput ?? 0) + Number(a.pricingOutput ?? 0) -
        (Number(b.pricingInput ?? 0) + Number(b.pricingOutput ?? 0)),
    );
    return sorted[0]?.modelId ?? null;
  } catch {
    return null;
  }
}

async function resolveImproveScriptExecutionPolicy(skill: SkillDefinition): Promise<SkillExecutionPolicyResult> {
  const policy = await resolveSkillExecutionPolicy({ skill });
  if (EXPLICIT_PIN_MODEL_SOURCES.has(policy.modelSource)) {
    return policy;
  }
  const upgradedModelId = await resolveCheapestEligibleLargeContextModelId();
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
  /** 2026-07-10 per-episode fix — charges are now per-episode-per-round, so the credit ledger needs it for clarity (mirrors why `round` was already here). */
  episodeNumber: number;
  round: number;
  result: SkillLlmResult;
}): Promise<number> {
  const model = String(params.result.modelId ?? "").trim();
  if (!model) return 0;

  const usage = params.result.rawData?.usage as { cost?: number } | undefined;
  const { creditsUsed } = await deductCreditsForModel({
    userId: params.userId,
    tenantId: params.tenantId,
    model,
    provider: params.result.provider?.providerName ?? undefined,
    inputTokens: params.result.inputTokens ?? 0,
    outputTokens: params.result.outputTokens ?? 0,
    costUsd: usage?.cost,
    skillSlug: VD_IMPROVE_SCRIPT_SKILL_ID,
    sourceType: "skill",
    description: `Improve script usage (episode ${params.episodeNumber}, round ${params.round})`,
    metadata: {
      seriesId: params.seriesId,
      episodeNumber: params.episodeNumber,
      round: params.round,
      operation: "vertical_drama_improve_script",
    },
  });
  return creditsUsed;
}

/* -------------------------------------------------------------------------- */
/* Step (d)/(e) — steering prompt + continuation loop                        */
/* -------------------------------------------------------------------------- */

function buildImproveScriptSteeringLine(): string {
  return [
    "ข้อกำหนดเพิ่มเติมที่ต้องปฏิบัติตามอย่างเคร่งครัด (บังคับ ไม่ใช่ทางเลือก ไม่ใช่ user_revision_request):",
    `- ทุกตอนต้องมีช็อตเรียงลำดับ 1 ถึง ${VD_DEEP_DRAFT_SHOTS_PER_EPISODE} ครบทุกช็อต ห้ามขาดหรือเกิน ห้ามเลขซ้ำ`,
    "- ห้ามเปลี่ยนหมายเลขตอน ห้ามเพิ่มหรือลดจำนวนตอนจากต้นฉบับ",
    "- ต้องรักษาโครงสร้างหัวข้อ/บรรทัดของต้นฉบับทุกประการ ตามรูปแบบนี้เป๊ะ ๆ (ห้ามแปลเป็นภาษาอื่น ห้ามเปลี่ยนคำหัวข้อ):",
    "  ตอนที่ N: ชื่อตอน",
    "  เรื่องย่อ: ...",
    "  จุดดำเนินเรื่อง: (ถ้ามี ตามด้วยบรรทัด \"- ...\" ทีละจุด)",
    "  บทพูดรายช็อต:",
    "  ช็อต 1: สรุปช็อต",
    "  - ผู้พูด: บทพูด",
    "  - ผู้พูด: บทพูด (น้ำเสียง)",
    "  จุดค้าง: ... (ถ้ามี)",
  ].join("\n");
}

function buildImproveScriptMessages(params: {
  skillSystemContent: string;
  originalScript: string;
  userRevisionRequest: string;
  /** 2026-07-10 per-episode fix — the shared season/character reference block, joined into the SYSTEM message only (never the user message — see this file's header doc comment). */
  seasonReferenceBlock?: string;
}): Array<{ role: string; content: string }> {
  const systemContent = [params.skillSystemContent, buildImproveScriptSteeringLine(), params.seasonReferenceBlock]
    .filter((part): part is string => Boolean(part && part.trim().length > 0))
    .join("\n\n---\n\n");
  const userContent = [
    `original_script:\n${params.originalScript}`,
    `user_revision_request:\n${params.userRevisionRequest}`,
  ].join("\n\n");
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

/* -------------------------------------------------------------------------- */
/* Step (f) — score/summary split + verification gate                         */
/* -------------------------------------------------------------------------- */

function splitScoreSummaryFromBody(fullText: string): { scoreSummary: string; body: string } {
  const lines = fullText.split("\n");
  const firstEpisodeLineIndex = lines.findIndex((line) => EPISODE_HEADER_LINE_PATTERN.test(line.trim()));
  if (firstEpisodeLineIndex === -1) {
    return { scoreSummary: fullText.trim(), body: "" };
  }
  return {
    scoreSummary: lines.slice(0, firstEpisodeLineIndex).join("\n").trim(),
    body: lines.slice(firstEpisodeLineIndex).join("\n"),
  };
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
  /** Concatenation of every SUCCESSFUL episode's own short score/summary, one `ตอนที่ N: <summary>` line each, in episode order. */
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
  /** Concatenation of EVERY episode's raw text (success or failure), each prefixed with `===== ตอนที่ N =====`, so the existing "view raw text" fallback still works per failed episode. */
  rawText: string;
  /** `true` if ANY episode hit its own per-episode round cap. */
  truncatedAtMaxRounds: boolean;
  /** `bible.activeBreakdownVersionId` AS SEEN at the start of this run — `confirmImproveScript`'s staleness guard compares this against the CURRENT value before writing. `null` for a legacy bible with no versioned breakdown yet. */
  activeBreakdownVersionIdAtRun: string | null;
  model: string;
  modelSource: SkillExecutionPolicyResult["modelSource"];
  /** Sum across ALL episodes' rounds. */
  callsMade: number;
  /** Sum across ALL episodes. */
  creditsUsed: number;
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

/** One episode's own outcome from `runImproveScriptEpisodePass` — never throws for a VERIFICATION failure (returned via `reasons`); DOES throw (propagated to the caller's own try/catch) for an LLM-call failure, mirroring the original whole-job code's own throw-on-call-failure behavior, just now scoped to one episode. */
interface PerEpisodeImproveScriptOutcome {
  episodeNumber: number;
  scoreSummary: string;
  rawText: string;
  improvedItem: StoredEpisodeBreakdownItem | null;
  reasons: string[];
  truncatedAtMaxRounds: boolean;
  callsMade: number;
  creditsUsed: number;
  model: string;
}

/**
 * Runs the drama-script-evaluate-improve skill for ONE episode: the same
 * bounded continuation loop mechanics the whole-job version used to run once
 * over the entire season (truncation detection via `finish_reason === "length"`
 * OR the tail continuation-marker regex, the constant-size "continue" replay
 * pattern) — now scoped to a single episode and capped at
 * `VD_IMPROVE_SCRIPT_MAX_CONTINUATION_ROUNDS` (2) rounds instead of the old
 * 6-round whole-season ceiling — followed by this SAME episode's own
 * verification (score/body split, leftover continuation-marker check,
 * duplicate/foreign episode-header check, `parseStoryScriptEpisodeBlock`,
 * exact-9-shots-numbered-1-9 check, `enforceEpisodeShotDraftSpeakability`
 * repair). Reuses every check the former whole-job verification ran — just
 * relocated into a per-episode scope, since there is now exactly one
 * episode's text per call (no more need for
 * `splitStoryScriptTextIntoEpisodeBlocks`/cross-episode header-uniqueness
 * scanning) — though a stray duplicate/wrong-episode header within this
 * single episode's own response is still guarded against below.
 *
 * Incident this scoping fixes (series 6 production run, confirmed via direct
 * audit-log + DB inspection): sending the WHOLE season (54 shots across 6
 * episodes) as one request forced the model to spread a shared ~48k-token
 * budget across everything at once, producing only ~165 tokens/shot on
 * average — one shot's `dialogue_lines` came back byte-identical to the
 * original, with only `summary` gaining a few words. The structural
 * verification gate (right episode/shot counts) passed fine, so this
 * shallow result was silently applied. Scoping generation to one episode at
 * a time gives each episode's 9 shots a genuinely generous token budget.
 */
async function runImproveScriptEpisodePass(params: {
  episodeNumber: number;
  episodeIndex: number;
  episodeCount: number;
  lang: StoryScriptLang;
  skillSystemContent: string;
  seasonReferenceBlock?: string;
  originalScript: string;
  userRevisionRequest: string;
  executionPolicy: SkillExecutionPolicyResult;
  userId: number;
  tenantId: string;
  seriesId: number;
  originalItem: StoredEpisodeBreakdownItem;
  onProgress: (progress: VerticalDramaStoryJobProgress) => void;
}): Promise<PerEpisodeImproveScriptOutcome> {
  const {
    episodeNumber,
    episodeIndex,
    episodeCount,
    lang,
    skillSystemContent,
    seasonReferenceBlock,
    originalScript,
    userRevisionRequest,
    executionPolicy,
    userId,
    tenantId,
    seriesId,
    originalItem,
    onProgress,
  } = params;

  const firstMessages = buildImproveScriptMessages({
    skillSystemContent,
    originalScript,
    userRevisionRequest,
    seasonReferenceBlock,
  });
  const systemMessage = firstMessages[0]!;
  const firstUserMessage = firstMessages[1]!;

  let messages = firstMessages;
  let accumulated = "";
  let truncatedAtMaxRounds = false;
  let callsMade = 0;
  let creditsUsed = 0;
  let model = "";

  for (let round = 1; round <= VD_IMPROVE_SCRIPT_MAX_CONTINUATION_ROUNDS; round += 1) {
    onProgress({
      phase: "fix",
      episodeIndex,
      episodeCount,
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
      throw new Error(result.error || "drama-script-evaluate-improve skill call failed");
    }
    if (result.modelId) model = result.modelId;
    creditsUsed += await chargeImproveScriptLlmUsage({ userId, tenantId, seriesId, episodeNumber, round, result });

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
    // assistant's last cleaned chunk + a short "keep going" nudge — NOT the
    // full growing history — so each round's input stays roughly constant
    // size instead of growing every round.
    messages = [
      systemMessage,
      firstUserMessage,
      { role: "assistant", content: cleanedChunk },
      {
        role: "user",
        content:
          "ทำต่อจากที่ค้างไว้พอดี ห้ามพูดซ้ำเนื้อหาที่ส่งไปแล้ว ห้ามสรุปใหม่ ห้ามแสดงคะแนนหรือหัวข้อผลลัพธ์ซ้ำ ให้เริ่มต่อจากบรรทัดสุดท้ายทันที",
      },
    ];
  }

  // Split score/summary, parse the body, verify — scoped to this one episode.
  const { scoreSummary, body } = splitScoreSummaryFromBody(accumulated);
  const reasons: string[] = [];

  if (CONTINUATION_MARKER_PATTERN.test(accumulated)) {
    reasons.push("พบเครื่องหมายต่อเนื้อหา (continuation marker) หลงเหลืออยู่ในผลลัพธ์ — เนื้อหาอาจไม่สมบูรณ์");
  }
  if (truncatedAtMaxRounds) {
    reasons.push(`สร้างเนื้อหาไม่เสร็จสมบูรณ์ภายใน ${VD_IMPROVE_SCRIPT_MAX_CONTINUATION_ROUNDS} รอบที่กำหนดต่อหนึ่งตอน`);
  }

  const headerNumbers = [...body.matchAll(new RegExp(EPISODE_HEADER_LINE_PATTERN.source, "gm"))].map((match) =>
    Number(match[1]),
  );
  if (new Set(headerNumbers).size !== headerNumbers.length) {
    reasons.push("พบหมายเลขตอนซ้ำในผลลัพธ์");
  }
  const foreignEpisodeNumbers = headerNumbers.filter((n) => n !== episodeNumber);
  if (foreignEpisodeNumbers.length > 0) {
    reasons.push(`พบหมายเลขตอนที่ไม่ตรงกับตอนที่ ${episodeNumber} ในผลลัพธ์ (${foreignEpisodeNumbers.join(", ")})`);
  }

  let improvedItem: StoredEpisodeBreakdownItem | null = null;
  if (reasons.length === 0) {
    const parsed = parseStoryScriptEpisodeBlock(lang, body.trim());
    if (!parsed) {
      reasons.push(`ตอนที่ ${episodeNumber}: ไม่สามารถแยกโครงสร้างช็อตจากผลลัพธ์ได้`);
    } else {
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
      } else {
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

        improvedItem = {
          ...originalItem,
          workingTitle: parsed.workingTitle || originalItem.workingTitle,
          logline: parsed.logline || originalItem.logline,
          keyBeats: parsed.keyBeats.length > 0 ? parsed.keyBeats : originalItem.keyBeats,
          shotDrafts: repairedShots,
          draftCompleteness,
          ...(parsed.cliffhangerLine ? { cliffhanger_line: parsed.cliffhangerLine } : {}),
        } as StoredEpisodeBreakdownItem;
      }
    }
  }

  return {
    episodeNumber,
    scoreSummary,
    rawText: accumulated,
    improvedItem,
    reasons,
    truncatedAtMaxRounds,
    callsMade,
    creditsUsed,
    model,
  };
}

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

  // (b) Build the whole-season input ONCE — preserves the original
  // truncation/omission semantics + `expectedEpisodeNumbers` derivation
  // byte-for-byte. The actual text sent to the LLM per episode is built
  // separately below, scoped to just that one episode.
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

  // (a1) Season reference block — built ONCE per job, shared across every
  // episode's own system message.
  const seriesCharacters = await resolveAllSeriesCharacterIdentitySources(tenantId, seriesId);
  const seasonReferenceBlock = buildImproveScriptSeasonReferenceBlock({
    lang,
    title: row.title,
    genre: row.genre,
    tone: row.tone,
    seasonArc,
    characters: seriesCharacters,
  });

  // (c) Resolve the skill + its execution policy ONCE (shared across every
  // episode's calls) — upgrade to the cheapest eligible large-context
  // enabled model when no explicit pin is configured.
  const skill = await getSkillByIdAsync(VD_IMPROVE_SCRIPT_SKILL_ID);
  if (!skill) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Skill '${VD_IMPROVE_SCRIPT_SKILL_ID}' is not available`,
    });
  }
  const executionPolicy = await resolveImproveScriptExecutionPolicy(skill);
  const skillSystemContent = skill.systemPrompt || skill.skillContent || "";

  // (d)/(e)/(f) — per-episode continuation loop + verification, each in its
  // own try/catch so one episode's hard failure (thrown error OR failed
  // verification) never aborts the rest of the job (2026-07-10 graceful-
  // degradation fix — was: ANY single episode's failure discarded every
  // other episode's good result too).
  const activeItemByEpisode = new Map(activeItems.map((item) => [item.episodeNumber, item]));
  const improvedItemsByEpisode = new Map<number, StoredEpisodeBreakdownItem>();
  const partialFailureEpisodeNumbers: number[] = [];
  const perEpisodeWarnings: PerEpisodeImproveScriptWarning[] = [];
  const scoreSummaryParts: string[] = [];
  const rawTextParts: string[] = [];

  let callsMade = 0;
  let creditsUsed = 0;
  let model = "";
  let truncatedAtMaxRounds = false;
  const episodeCount = expectedEpisodeNumbers.length;

  for (let i = 0; i < expectedEpisodeNumbers.length; i += 1) {
    const episodeNumber = expectedEpisodeNumbers[i]!;
    const episodeIndex = i + 1;
    const originalItem = activeItemByEpisode.get(episodeNumber);

    if (!originalItem) {
      // Structurally shouldn't happen (episodeNumber came from
      // expectedEpisodeNumbers, itself derived from activeItems) — defensive
      // per-episode failure instead of a whole-job throw.
      partialFailureEpisodeNumbers.push(episodeNumber);
      perEpisodeWarnings.push({
        episodeNumber,
        reasons: [`ตอนที่ ${episodeNumber}: ไม่พบข้อมูลตอนเดิมสำหรับปรับปรุง`],
      });
      rawTextParts.push(`===== ตอนที่ ${episodeNumber} =====\n`);
      continue;
    }

    const episodeScriptInput = buildStoryScriptTextFromBible(bible, {
      lang,
      title: row.title,
      genre: row.genre,
      tone: row.tone,
      seasonArc,
      episodeNumber,
    });

    try {
      const outcome = await runImproveScriptEpisodePass({
        episodeNumber,
        episodeIndex,
        episodeCount,
        lang,
        skillSystemContent,
        seasonReferenceBlock,
        originalScript: episodeScriptInput.text,
        userRevisionRequest,
        executionPolicy,
        userId,
        tenantId,
        seriesId,
        originalItem,
        onProgress,
      });

      callsMade += outcome.callsMade;
      creditsUsed += outcome.creditsUsed;
      if (outcome.model) model = outcome.model;
      if (outcome.truncatedAtMaxRounds) truncatedAtMaxRounds = true;

      rawTextParts.push(`===== ตอนที่ ${episodeNumber} =====\n${outcome.rawText}`);

      if (outcome.reasons.length === 0 && outcome.improvedItem) {
        improvedItemsByEpisode.set(episodeNumber, outcome.improvedItem);
        scoreSummaryParts.push(`ตอนที่ ${episodeNumber}: ${outcome.scoreSummary}`);
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
      rawTextParts.push(`===== ตอนที่ ${episodeNumber} =====\n`);
    }
  }

  const improvedItems = expectedEpisodeNumbers
    .filter((n) => improvedItemsByEpisode.has(n))
    .map((n) => improvedItemsByEpisode.get(n)!);

  const needsReview = improvedItems.length === 0;
  const needsReviewReasons = needsReview ? perEpisodeWarnings.flatMap((warning) => warning.reasons) : [];

  return {
    scoreSummary: scoreSummaryParts.join("\n"),
    expectedEpisodeNumbers,
    inputTruncated: wholeSeasonScriptInput.truncated,
    inputOmittedEpisodeNumbers: wholeSeasonScriptInput.omittedEpisodeNumbers,
    needsReview,
    needsReviewReasons,
    improvedItems,
    partialFailureEpisodeNumbers,
    perEpisodeWarnings,
    rawText: rawTextParts.join("\n\n"),
    truncatedAtMaxRounds,
    activeBreakdownVersionIdAtRun,
    model,
    modelSource: executionPolicy.modelSource,
    callsMade,
    creditsUsed,
  };
}
