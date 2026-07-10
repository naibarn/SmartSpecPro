/**
 * Vertical Drama Series — "ปรับปรุงบทละครให้มีความสมบูรณ์" (added 2026-07-10).
 *
 * Replaces the season-critique/apply-critique/quality-loop flow with ONE
 * whole-script pass through the already-built-but-unused
 * `drama-script-evaluate-improve` skill: send the full drafted script (same
 * text the "คัดลอกเนื้อเรื่อง" copy feature builds — see
 * `@shared/verticalDramaSeries/storyScriptText`) plus a free-text "what to
 * improve" request, get back one markdown blob (short score/summary + the
 * full revised script), parse it back into structured per-episode fields,
 * and verify it fail-closed before returning.
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
import { verticalDramaSeries } from "../../drizzle/schema";
import {
  buildStoryScriptText,
  parseStoryScriptEpisodeBlock,
  splitStoryScriptTextIntoEpisodeBlocks,
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

/** Bounded continuation loop — mirrors the removed quality-loop's own round-cap convention. */
export const VD_IMPROVE_SCRIPT_MAX_CONTINUATION_ROUNDS = 6;
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
 */
export function buildStoryScriptTextFromBible(
  bible: Record<string, unknown> | null | undefined,
  params: {
    lang: StoryScriptLang;
    title?: string | null;
    genre?: string | null;
    tone?: string | null;
    seasonArc?: string | null;
  },
): BuildStoryScriptTextFromBibleResult {
  const items = getActiveBreakdown(bible);
  const draftedItems = items.filter((item) => readItemShotDrafts(item) !== null);

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
/* the largest-context enabled model (the skill needs to swallow a whole      */
/* season script, so context window is the binding constraint here — not the */
/* stricter thinking+structured-outputs bar the removed season-quality picker */
/* enforced).                                                                 */
/* -------------------------------------------------------------------------- */

async function resolveLargestContextEnabledModelId(): Promise<string | null> {
  try {
    const rows = await loadEnabledLlmModelRows();
    if (rows.length === 0) return null;
    const sorted = [...rows].sort((a, b) => (b.contextLength ?? 0) - (a.contextLength ?? 0));
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
  const upgradedModelId = await resolveLargestContextEnabledModelId();
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
    description: `Improve script usage (round ${params.round})`,
    metadata: {
      seriesId: params.seriesId,
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
}): Array<{ role: string; content: string }> {
  const systemContent = [params.skillSystemContent, buildImproveScriptSteeringLine()]
    .filter((part) => part.trim().length > 0)
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

export interface RunImproveScriptJobResult {
  scoreSummary: string;
  expectedEpisodeNumbers: number[];
  inputTruncated: boolean;
  inputOmittedEpisodeNumbers: number[];
  needsReview: boolean;
  needsReviewReasons: string[];
  /** `null` whenever `needsReview` is `true` — fail-closed, no partial apply. */
  improvedItems: StoredEpisodeBreakdownItem[] | null;
  rawText: string;
  truncatedAtMaxRounds: boolean;
  /** `bible.activeBreakdownVersionId` AS SEEN at the start of this run — `confirmImproveScript`'s staleness guard compares this against the CURRENT value before writing. `null` for a legacy bible with no versioned breakdown yet. */
  activeBreakdownVersionIdAtRun: string | null;
  model: string;
  modelSource: SkillExecutionPolicyResult["modelSource"];
  callsMade: number;
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

  // (b) Build the whole-script input.
  const lang = resolveScriptLangFromLocale(row.locale);
  const scriptInput = buildStoryScriptTextFromBible(bible, {
    lang,
    title: row.title,
    genre: row.genre,
    tone: row.tone,
    seasonArc: typeof bible.expandedSeasonArc === "string" ? bible.expandedSeasonArc : null,
  });
  const expectedEpisodeNumbers = scriptInput.expectedEpisodeNumbers;

  // (c) Resolve the skill + its execution policy (upgrade to largest-context
  // enabled model when no explicit pin is configured).
  const skill = await getSkillByIdAsync(VD_IMPROVE_SCRIPT_SKILL_ID);
  if (!skill) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Skill '${VD_IMPROVE_SCRIPT_SKILL_ID}' is not available`,
    });
  }
  const executionPolicy = await resolveImproveScriptExecutionPolicy(skill);

  // (d) Build messages — system = skill content + steering line; user = original_script + user_revision_request.
  const skillSystemContent = skill.systemPrompt || skill.skillContent || "";
  const firstMessages = buildImproveScriptMessages({
    skillSystemContent,
    originalScript: scriptInput.text,
    userRevisionRequest,
  });
  const systemMessage = firstMessages[0]!;
  const firstUserMessage = firstMessages[1]!;

  // (e) Bounded continuation loop.
  let messages = firstMessages;
  let accumulated = "";
  let truncatedAtMaxRounds = false;
  let callsMade = 0;
  let creditsUsed = 0;
  let model = "";
  const modelSource = executionPolicy.modelSource;

  for (let round = 1; round <= VD_IMPROVE_SCRIPT_MAX_CONTINUATION_ROUNDS; round += 1) {
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
      throw new Error(result.error || "drama-script-evaluate-improve skill call failed");
    }
    if (result.modelId) model = result.modelId;
    creditsUsed += await chargeImproveScriptLlmUsage({ userId, tenantId, seriesId, round, result });

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

  // (f) Split score/summary, parse the body, verify — fail-closed.
  const { scoreSummary, body } = splitScoreSummaryFromBody(accumulated);
  const reasons: string[] = [];

  if (CONTINUATION_MARKER_PATTERN.test(accumulated)) {
    reasons.push("พบเครื่องหมายต่อเนื้อหา (continuation marker) หลงเหลืออยู่ในผลลัพธ์ — เนื้อหาอาจไม่สมบูรณ์");
  }
  if (truncatedAtMaxRounds) {
    reasons.push(`สร้างเนื้อหาไม่เสร็จสมบูรณ์ภายใน ${VD_IMPROVE_SCRIPT_MAX_CONTINUATION_ROUNDS} รอบที่กำหนด`);
  }

  const headerNumbers = [...body.matchAll(new RegExp(EPISODE_HEADER_LINE_PATTERN.source, "gm"))].map((match) =>
    Number(match[1]),
  );
  if (new Set(headerNumbers).size !== headerNumbers.length) {
    reasons.push("พบหมายเลขตอนซ้ำในผลลัพธ์");
  }

  const blocks = splitStoryScriptTextIntoEpisodeBlocks(lang, body);
  const parsedEpisodeNumbers = new Set(blocks.keys());
  const expectedSet = new Set(expectedEpisodeNumbers);
  const missingEpisodeNumbers = expectedEpisodeNumbers.filter((n) => !parsedEpisodeNumbers.has(n));
  const extraEpisodeNumbers = [...parsedEpisodeNumbers].filter((n) => !expectedSet.has(n));
  if (missingEpisodeNumbers.length > 0) {
    reasons.push(`ขาดตอนที่ ${missingEpisodeNumbers.join(", ")} ในผลลัพธ์`);
  }
  if (extraEpisodeNumbers.length > 0) {
    reasons.push(`พบตอนที่ ${extraEpisodeNumbers.join(", ")} ซึ่งไม่ได้อยู่ในคำขอ`);
  }

  const activeItemByEpisode = new Map(activeItems.map((item) => [item.episodeNumber, item]));
  const improvedItemsByEpisode = new Map<number, StoredEpisodeBreakdownItem>();

  for (const episodeNumber of expectedEpisodeNumbers) {
    if (!parsedEpisodeNumbers.has(episodeNumber)) continue; // already reported as missing above
    const blockText = blocks.get(episodeNumber) ?? "";
    if (!blockText.trim()) {
      reasons.push(`ตอนที่ ${episodeNumber}: เนื้อหาว่างเปล่า`);
      continue;
    }
    const parsed = parseStoryScriptEpisodeBlock(lang, blockText);
    if (!parsed) {
      reasons.push(`ตอนที่ ${episodeNumber}: ไม่สามารถแยกโครงสร้างช็อตจากผลลัพธ์ได้`);
      continue;
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
      continue;
    }

    const originalItem = activeItemByEpisode.get(episodeNumber);
    if (!originalItem) {
      // Structurally shouldn't happen (episodeNumber came from expectedEpisodeNumbers,
      // itself derived from activeItems) — defensive fail-closed reason instead of a throw.
      reasons.push(`ตอนที่ ${episodeNumber}: ไม่พบข้อมูลตอนเดิมสำหรับรวมผลลัพธ์`);
      continue;
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

    const merged: StoredEpisodeBreakdownItem = {
      ...originalItem,
      workingTitle: parsed.workingTitle || originalItem.workingTitle,
      logline: parsed.logline || originalItem.logline,
      keyBeats: parsed.keyBeats.length > 0 ? parsed.keyBeats : originalItem.keyBeats,
      shotDrafts: repairedShots,
      draftCompleteness,
      ...(parsed.cliffhangerLine ? { cliffhanger_line: parsed.cliffhangerLine } : {}),
    } as StoredEpisodeBreakdownItem;

    improvedItemsByEpisode.set(episodeNumber, merged);
  }

  const needsReview = reasons.length > 0 || improvedItemsByEpisode.size !== expectedEpisodeNumbers.length;

  return {
    scoreSummary,
    expectedEpisodeNumbers,
    inputTruncated: scriptInput.truncated,
    inputOmittedEpisodeNumbers: scriptInput.omittedEpisodeNumbers,
    needsReview,
    needsReviewReasons: reasons,
    improvedItems: needsReview
      ? null
      : expectedEpisodeNumbers.map((episodeNumber) => improvedItemsByEpisode.get(episodeNumber)!),
    rawText: accumulated,
    truncatedAtMaxRounds,
    activeBreakdownVersionIdAtRun,
    model,
    modelSource,
    callsMade,
    creditsUsed,
  };
}
