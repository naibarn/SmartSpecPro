/**
 * Vertical Drama Series — "อนุมัติและปรับเรื่องตามคำแนะนำ" (approve quality-review
 * suggestions and auto-apply them) support: groups an episode quality
 * review's `issues[]` by the pipeline stage each issue actually targets, and
 * composes ONE combined repair instruction per affected stage.
 *
 * Pure, DB-free functions so they're cheaply unit-testable. The router
 * (`applyQualityReviewSuggestions`) calls the 2-argument (no-`tieInEnabled`)
 * shape and is responsible for actually invoking
 * `verticalDramaEpisodePipeline.repairStage(...)` per grouped stage (script
 * first, then storyboard, matching pipeline order). `verticalDramaQualityLoop.ts`'s
 * bounded auto-improve loop (spec §16.1 / section-14) is the caller of the
 * wider 4-group shape.
 *
 * v2 (spec §16.1, added 2026-07-07) extends the original 2-group
 * classification with two more canonical repair groups, in this exact fixed
 * order (spec §16.1 rule 2): `plan_episode_script` -> `storyboard_shotgrid`
 * -> `dialogue_audio_plan` -> `tie_in`.
 *
 * `dialogue_audio_plan` classification is UNCONDITIONAL (no flag) —
 * dialogue-flavored issue locations always route there now, exactly like
 * `beat N` has always routed to `plan_episode_script`. `tie_in`
 * classification is GATED behind an explicit `tieInEnabled` option (spec
 * §13.1: the fourth group is "only meaningful when tie-in QC is enabled") —
 * when omitted/false, a tie-in-flavored location falls through to the same
 * "unrecognized -> storyboard" v1 default every other unrecognized location
 * has always used. This is what keeps every existing (zero-argument) call
 * site byte-identical to v1: no fixture that predates this section ever
 * mentions dialogue/tie-in wording, so no existing behavior changes, and
 * `tie_in` never appears without an explicit, opt-in ask.
 *
 * Type note: `"tie_in"` is deliberately NOT a `VerticalDramaPipelineStage`
 * member (see `@shared/verticalDramaSeries`'s `contracts.ts`) — the tie-in
 * repair group is a cross-cutting rewrite scoped to tie-in-carrying
 * beats/lines/shots (spec §13.1), not a pipeline execution stage (the
 * top-level QC/repair typed schema, spec §16, separately already calls this
 * same concept `product_tie_in`). Consequently `groupQualityReviewIssuesByStage`
 * and `classifyQualityReviewIssueLocation` are OVERLOADED so the existing
 * router call site (`groupQualityReviewIssuesByStage(issues)`, no options —
 * see `server/routers/verticalDramaEpisodes.ts`) keeps its narrow, 3-member
 * `QualityReviewApplicableStage` return type — a subset of
 * `VerticalDramaPipelineStage`, so the router's own
 * `const stagesRepaired: VerticalDramaPipelineStage[]` keeps type-checking
 * unmodified. Only a caller that explicitly passes `{ tieInEnabled: true }`
 * gets the widened, `"tie_in"`-inclusive return type.
 * `groupQualityReviewIssuesByStageWithFlag` is a non-overloaded twin for
 * callers (the loop orchestrator) that hold `tieInEnabled` as a plain
 * runtime `boolean` rather than a literal `true`/`false` — TS overload
 * resolution requires literal argument types, which a `boolean`-typed
 * variable can never satisfy.
 */

import type { VerticalDramaPipelineStage } from "@shared/verticalDramaSeries";

/** One issue from `episodeQualityReviewOutputSchema`'s `issues[]` array. */
export interface QualityReviewIssueLike {
  location: string;
  problem: string;
  suggested_fix: string;
}

/**
 * The v1 canonical 2 groups plus v2's unconditional third group
 * (`dialogue_audio_plan`). All three are real `VerticalDramaPipelineStage`
 * members — this is what lets the unmodified router keep assigning `.stage`
 * values into a `VerticalDramaPipelineStage[]`.
 */
export type QualityReviewApplicableStage =
  | "plan_episode_script"
  | "storyboard_shotgrid"
  | "dialogue_audio_plan";

/** Spec §16.1's full canonical 4-group union — adds the gated `tie_in` group. */
export type QualityReviewApplicableStageWithTieIn =
  | QualityReviewApplicableStage
  | "tie_in";

type AssertExtends<T extends true> = T;
/**
 * Compile-time proof that every `QualityReviewApplicableStage` member really
 * is a `VerticalDramaPipelineStage` member — if `contracts.ts` ever renames
 * one of these stage strings, `pnpm check` fails HERE with a clear message
 * instead of silently breaking the router's
 * `stagesRepaired: VerticalDramaPipelineStage[]` usage. Tuple-wrapped
 * (`[X] extends [Y]`) to force a single non-distributed assignability check
 * instead of TypeScript's default per-union-member distribution (which would
 * otherwise let one failing member hide inside a `never` and never surface).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _AssertApplicableStagesArePipelineStages = AssertExtends<
  [QualityReviewApplicableStage] extends [VerticalDramaPipelineStage] ? true : false
>;

export interface QualityReviewGroupingOptions {
  /**
   * Activates the fourth canonical repair group, `tie_in` (spec §13.1/§16.1)
   * — only meaningful when tie-in QC is enabled for the episode/series.
   * Omitted/false reproduces v1 behavior exactly (tie-in-flavored locations
   * fall through to the `storyboard_shotgrid` default, same as any other
   * unrecognized location always has).
   */
  tieInEnabled?: boolean;
}

const TIE_IN_LOCATION_PATTERN = /tie[\s_-]?in|สินค้า|product|placement/i;
const DIALOGUE_LOCATION_PATTERN = /dialogue|\bline\b|บทพูด|คำพูด/i;

/**
 * Shared classification core (spec §16.1). Priority, checked in this order:
 *  1. `beat N` / `beats N-M` -> `plan_episode_script` (v1, unchanged).
 *  2. dialogue-flavored text (`dialogue`, standalone `line`, `บทพูด`,
 *     `คำพูด`) -> `dialogue_audio_plan` (v2, unconditional). Checked before
 *     the tie-in/shot checks so a real skill example like
 *     `"dialogue_line shot 3 clip 1"` (this skill's own documented
 *     `location` example) classifies as dialogue even though it also
 *     mentions a shot.
 *  3. tie-in-flavored text (`tie-in`/`tie_in`, `สินค้า`, `product`,
 *     `placement`) -> `tie_in`, ONLY when `tieInEnabled`.
 *  4. `shot N` / `shots N-M` -> `storyboard_shotgrid` (v1, unchanged).
 *  5. anything else unrecognized -> `storyboard_shotgrid` (v1 tolerant
 *     default, unchanged).
 */
function classifyIssueLocationInternal(
  location: string,
  tieInEnabled: boolean,
): QualityReviewApplicableStageWithTieIn {
  const normalized = (location ?? "").toLowerCase();
  // Check "beat" before "shot" — a location could theoretically mention both,
  // but beats are the more specific/rarer signal for the script stage.
  if (/\bbeats?\b/.test(normalized)) return "plan_episode_script";
  if (DIALOGUE_LOCATION_PATTERN.test(normalized)) return "dialogue_audio_plan";
  if (tieInEnabled && TIE_IN_LOCATION_PATTERN.test(normalized)) return "tie_in";
  if (/\bshots?\b/.test(normalized)) return "storyboard_shotgrid";
  return "storyboard_shotgrid";
}

/**
 * Classify a single issue's `location` string into the stage/group it
 * targets. Overloaded so a zero-argument (or explicit
 * `{ tieInEnabled: false }`) call keeps the narrow v1-compatible
 * `QualityReviewApplicableStage` return type; only an explicit
 * `{ tieInEnabled: true }` widens the return type to include `"tie_in"`. See
 * `classifyIssueLocationInternal`'s doc comment for the full priority order.
 *
 * Recognized patterns (case-insensitive, tolerant of extra whitespace):
 *  - `"shot 7"`, `"shots 3-5"`, `"shot 3, 5"`, `"shot#7"` -> `storyboard_shotgrid`
 *    (shots are the storyboard's unit; this is also the fallback default).
 *  - `"beat 3"`, `"beats 1-2"` -> `plan_episode_script` (beats are the
 *    script's `structure.beats[]` unit).
 *  - `"dialogue_line shot 3 clip 1"`, `"line 4"`, `"บทพูด shot 2"` ->
 *    `dialogue_audio_plan` (unconditional, v2).
 *  - `"tie-in shot 4"`, `"product placement shot 2"`, `"สินค้า shot 5"` ->
 *    `tie_in`, only when `{ tieInEnabled: true }` is passed.
 *  - Anything else unrecognized (e.g. "cliffhanger", a bare number,
 *    empty-ish text) -> `storyboard_shotgrid` (tolerant default).
 */
export function classifyQualityReviewIssueLocation(
  location: string,
  options?: { tieInEnabled?: false },
): QualityReviewApplicableStage;
export function classifyQualityReviewIssueLocation(
  location: string,
  options: { tieInEnabled: true },
): QualityReviewApplicableStageWithTieIn;
export function classifyQualityReviewIssueLocation(
  location: string,
  options?: QualityReviewGroupingOptions,
): QualityReviewApplicableStageWithTieIn {
  return classifyIssueLocationInternal(location, options?.tieInEnabled === true);
}

/**
 * Stage-repair order for `applyQualityReviewSuggestions` / the auto-improve
 * loop — the spec §16.1 canonical order: script, then storyboard (generated
 * FROM the script, so it should reflect script-level fixes when
 * regrounded), then dialogue (density issues repaired after the visuals
 * they attach to exist), then tie-in (a narrow rewrite scoped to
 * tie-in-carrying beats/lines/shots, repaired last so it never fights an
 * earlier stage's content change).
 *
 * v1 shipped this as a 2-entry constant; nothing outside this file imports
 * it by name, so widening it to the full v2 canonical 4-entry order here is
 * safe — `groupQualityReviewIssuesByStage` filters out any group with zero
 * classified issues, so a v1-only fixture (script/storyboard issues only,
 * no options) still yields exactly the old 2-entry result.
 */
export const QUALITY_REVIEW_APPLY_STAGE_ORDER: readonly QualityReviewApplicableStageWithTieIn[] =
  ["plan_episode_script", "storyboard_shotgrid", "dialogue_audio_plan", "tie_in"];

export interface GroupedQualityReviewIssues {
  stage: QualityReviewApplicableStage;
  issues: QualityReviewIssueLike[];
}

export interface GroupedQualityReviewIssuesWithTieIn {
  stage: QualityReviewApplicableStageWithTieIn;
  issues: QualityReviewIssueLike[];
}

function groupIssuesByStageInternal(
  issues: QualityReviewIssueLike[],
  tieInEnabled: boolean,
): GroupedQualityReviewIssuesWithTieIn[] {
  const byStage = new Map<QualityReviewApplicableStageWithTieIn, QualityReviewIssueLike[]>();
  for (const issue of issues) {
    const stage = classifyIssueLocationInternal(issue.location, tieInEnabled);
    const bucket = byStage.get(stage);
    if (bucket) bucket.push(issue);
    else byStage.set(stage, [issue]);
  }
  // Always return in canonical order (script, storyboard, dialogue, tie-in),
  // regardless of the Map's insertion order, omitting any group with zero
  // issues — this is also what makes v1 (2-group) and v2 (3- or 4-group)
  // behavior fall out of the SAME implementation with no special-casing: a
  // group that was never classified into simply never appears.
  return QUALITY_REVIEW_APPLY_STAGE_ORDER.filter(stage => byStage.has(stage)).map(stage => ({
    stage,
    issues: byStage.get(stage)!,
  }));
}

/**
 * Group ALL issues by their classified stage, preserving each issue's
 * original order within its group. Stages with zero issues are omitted
 * entirely (nothing to repair for that stage) — the router only invokes
 * `repairStage` for stages present in this result.
 *
 * Overloaded exactly like `classifyQualityReviewIssueLocation` — the
 * existing router call site (`groupQualityReviewIssuesByStage(issues)`, no
 * options) keeps its narrow v1-compatible return type; `{ tieInEnabled: true
 * }` widens it. Use `groupQualityReviewIssuesByStageWithFlag` instead when
 * `tieInEnabled` is a plain runtime `boolean` (e.g. from a resolved policy)
 * rather than a literal.
 */
export function groupQualityReviewIssuesByStage(
  issues: QualityReviewIssueLike[],
  options?: { tieInEnabled?: false },
): GroupedQualityReviewIssues[];
export function groupQualityReviewIssuesByStage(
  issues: QualityReviewIssueLike[],
  options: { tieInEnabled: true },
): GroupedQualityReviewIssuesWithTieIn[];
export function groupQualityReviewIssuesByStage(
  issues: QualityReviewIssueLike[],
  options?: QualityReviewGroupingOptions,
): GroupedQualityReviewIssuesWithTieIn[] {
  return groupIssuesByStageInternal(issues, options?.tieInEnabled === true);
}

/**
 * Non-overloaded twin of `groupQualityReviewIssuesByStage` for callers that
 * hold `tieInEnabled` as a plain runtime `boolean` (TS overload resolution
 * requires a literal `true`/`false` argument type, which a `boolean`-typed
 * variable never satisfies) — used by `verticalDramaQualityLoop.ts`. Exact
 * same implementation as the overloaded function; always returns the
 * widened (`"tie_in"`-inclusive) type since the caller must handle that
 * possibility regardless of the flag's runtime value.
 */
export function groupQualityReviewIssuesByStageWithFlag(
  issues: QualityReviewIssueLike[],
  tieInEnabled: boolean,
): GroupedQualityReviewIssuesWithTieIn[] {
  return groupIssuesByStageInternal(issues, tieInEnabled);
}

/**
 * Compose ONE combined Thai repair instruction from a stage's grouped
 * issues, in the format: "แก้ตามคำแนะนำต่อไปนี้:" followed by one line per
 * issue naming its location/problem/suggested fix, so a single
 * `repairStage` call addresses every issue affecting that stage at once
 * (rather than one repair run per issue).
 *
 * Unchanged shape from v1 — stateless and generic over whatever issues list
 * it is given, so "compose from the CURRENT round's review" (spec §16.1
 * rule 7/known-v1-limitation-fix) is a property of the CALLER (pass each
 * round's freshly grouped issues, not a stale first-round list), not of this
 * function itself. `verticalDramaQualityLoop.ts` re-groups+re-composes from
 * each round's own re-review before calling this.
 *
 * `options.storyLockStage` (W11.6 "Story Lock", added 2026-07-08) is
 * OPTIONAL and purely additive — omitted (every pre-existing call site)
 * reproduces the exact v1/v2 instruction text byte-for-byte. When a caller
 * passes it (only ever when the `verticalDramaSeriesStoryLock` flag is on
 * for the episode's tenant), the matching hard-constraint block from
 * `appendVerticalDramaStoryLockRepairConstraint` is appended for
 * `plan_episode_script`/`storyboard_shotgrid`; every other stage
 * (`dialogue_audio_plan`/`tie_in`) is untouched by story lock (their repairs
 * were never story content in the first place).
 */
export function composeQualityReviewRepairInstruction(
  issues: QualityReviewIssueLike[],
  options?: { storyLockStage?: QualityReviewApplicableStageWithTieIn },
): string {
  const lines = issues.map(
    issue => `- [${issue.location}] ปัญหา: ${issue.problem} -> แก้ไข: ${issue.suggested_fix}`,
  );
  const base = ["แก้ตามคำแนะนำต่อไปนี้:", ...lines].join("\n");
  return options?.storyLockStage
    ? appendVerticalDramaStoryLockRepairConstraint(base, options.storyLockStage)
    : base;
}

/* -------------------------------------------------------------------------- */
/* W11.6 "Story Lock" — execution-only repair prompts (added 2026-07-08)      */
/* -------------------------------------------------------------------------- */

/**
 * Owner principle (spec owner directive, W11.6): the story is finalized on
 * the series Overview. Episode-level improve/repair of the SCRIPT may only
 * ever change execution — wording, emotion, line pacing, and how dialogue is
 * spread across shots — never the events, beat order, reversal count/
 * position, plot threads, or the meaning of the hook/cliffhanger.
 */
export const VD_STORY_LOCK_SCRIPT_REPAIR_CONSTRAINT =
  "ห้ามเปลี่ยนเหตุการณ์ ลำดับบีต จำนวน/ตำแหน่งจุดพลิก ปมเรื่อง หรือความหมายของ hook/cliffhanger — ปรับได้เฉพาะถ้อยคำ อารมณ์ จังหวะพูด และการเกลี่ยบทระหว่างช็อต";

/**
 * Owner principle (spec owner directive, W11.6): episode-level improve/
 * repair of the STORYBOARD may only ever change how a shot is FILMED — the
 * camera, composition, movement, transitions, and ambient scene dressing —
 * never what actually happens in the shot (that is script/story content).
 */
export const VD_STORY_LOCK_STORYBOARD_REPAIR_CONSTRAINT =
  "โฟกัสเฉพาะกล้อง/องค์ประกอบภาพ/การเคลื่อนไหว/transition/บรรยากาศฉาก — ห้ามเปลี่ยนเนื้อหาเหตุการณ์ของช็อต";

/**
 * Appends the matching hard-constraint block for a repair-target stage —
 * `plan_episode_script` -> `VD_STORY_LOCK_SCRIPT_REPAIR_CONSTRAINT`,
 * `storyboard_shotgrid` -> `VD_STORY_LOCK_STORYBOARD_REPAIR_CONSTRAINT`. Any
 * other stage (`dialogue_audio_plan`/`tie_in`, or a plain
 * `VerticalDramaPipelineStage` string from the manual `repairStageOutput`
 * mutation that isn't one of the two story-carrying stages) is returned
 * UNCHANGED — this is a prompt-level nudge only (the mechanical enforcement
 * is the deterministic post-repair guard below); callers must only invoke
 * this when the `verticalDramaSeriesStoryLock` flag is on for the episode's
 * tenant, so flag-off behavior stays byte-identical by simply never calling
 * it.
 */
export function appendVerticalDramaStoryLockRepairConstraint(
  instruction: string,
  stage: QualityReviewApplicableStageWithTieIn | string,
): string {
  if (stage === "plan_episode_script") {
    return `${instruction}\n\n${VD_STORY_LOCK_SCRIPT_REPAIR_CONSTRAINT}`;
  }
  if (stage === "storyboard_shotgrid") {
    return `${instruction}\n\n${VD_STORY_LOCK_STORYBOARD_REPAIR_CONSTRAINT}`;
  }
  return instruction;
}

/* -------------------------------------------------------------------------- */
/* W11.6 "Story Lock" — deterministic post-repair guard ("the teeth")         */
/* -------------------------------------------------------------------------- */

/**
 * Minimum fraction of the PRIOR hook's/cliffhanger's significant words that
 * must reappear in the REPAIRED hook/cliffhanger for it to still count as
 * "the same story beat, re-worded" rather than a story change. Mirrors
 * `verticalDramaArcReplan.ts`'s `TEXT_OVERLAP_MATCH_THRESHOLD` (same value,
 * same word-SET-overlap heuristic, same false-negative-safe reasoning) —
 * duplicated here (not imported) to keep this module dependency-free of
 * `verticalDramaArcReplan.ts`, which does not export its heuristic. If the
 * heuristic or threshold ever changes, update both call sites.
 */
export const VD_STORY_LOCK_TEXT_OVERLAP_THRESHOLD = 0.6;

const VD_STORY_LOCK_SIGNIFICANT_WORD_MIN_LENGTH = 3;

function storyLockSignificantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(word => word.length >= VD_STORY_LOCK_SIGNIFICANT_WORD_MIN_LENGTH),
  );
}

/** Fraction of `reference`'s significant words also present in `haystack`. `0` for an empty reference. */
function storyLockOverlapRatio(reference: string, haystack: string): number {
  const referenceWords = storyLockSignificantWords(reference);
  if (referenceWords.size === 0) return 0;
  const haystackWords = storyLockSignificantWords(haystack);
  let matched = 0;
  for (const word of referenceWords) {
    if (haystackWords.has(word)) matched++;
  }
  return matched / referenceWords.size;
}

function storyLockAsPlainRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function storyLockAsPlainArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function storyLockAsTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function arraysEqualInOrder(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

/** Result of a story-lock guard evaluation — `violations` are short, human-readable (English, internal/audit-facing) descriptions of what changed. */
export interface VerticalDramaStoryLockGuardResult {
  violated: boolean;
  violations: string[];
}

interface VerticalDramaStoryLockScriptFacts {
  beatCount: number;
  /** 0-based positions within `structure.beats[]` where `is_reversal === true`. */
  reversalBeatIndexes: number[];
  sceneCount: number;
  hook: string;
  cliffhanger: string;
}

function extractStoryLockScriptFacts(
  script: Record<string, unknown> | null | undefined,
): VerticalDramaStoryLockScriptFacts {
  const record = storyLockAsPlainRecord(script);
  const structure = storyLockAsPlainRecord(record?.structure);
  const beats = storyLockAsPlainArray(structure?.beats);
  const reversalBeatIndexes: number[] = [];
  beats.forEach((raw, index) => {
    const beat = storyLockAsPlainRecord(raw);
    if (beat?.is_reversal === true) reversalBeatIndexes.push(index);
  });
  return {
    beatCount: beats.length,
    reversalBeatIndexes,
    sceneCount: storyLockAsPlainArray(record?.scene_dialogue_summary).length,
    hook: storyLockAsTrimmedString(record?.hook),
    cliffhanger: storyLockAsTrimmedString(record?.cliffhanger),
  };
}

/**
 * Deterministic post-repair guard for `plan_episode_script` (spec owner
 * directive, W11.6 "Story Lock" — "the teeth": mechanical enforcement, not
 * prompt-only). Compares the PRIOR (pre-repair) script against the REPAIRED
 * (post-repair) script and flags a violation when ANY of the following
 * story-defining facts changed:
 *  - beat count (`structure.beats.length`);
 *  - scene count (`scene_dialogue_summary.length`);
 *  - is_reversal count AND positions (the exact, order-preserving set of
 *    0-based beat indexes flagged `is_reversal: true`);
 *  - hook similarity — normalized token-overlap of the prior hook's
 *    significant words found in the repaired hook, below
 *    `VD_STORY_LOCK_TEXT_OVERLAP_THRESHOLD`;
 *  - cliffhanger similarity — same overlap check, cliffhanger text.
 *
 * `null`/`undefined` prior or repaired content never violates (nothing to
 * compare against yet — e.g. the very first repair before any snapshot
 * exists); an empty prior hook/cliffhanger skips ONLY that specific overlap
 * check (nothing to compare), every other fact still evaluates normally.
 * Pure, deterministic, no LLM/DB — safe to call from both the auto-improve
 * loop's injected `repairStage` effect and the v1 single-apply path.
 */
export function evaluateVerticalDramaStoryLockScriptGuard(
  priorScript: Record<string, unknown> | null | undefined,
  repairedScript: Record<string, unknown> | null | undefined,
): VerticalDramaStoryLockGuardResult {
  if (!priorScript || !repairedScript) return { violated: false, violations: [] };

  const prior = extractStoryLockScriptFacts(priorScript);
  const repaired = extractStoryLockScriptFacts(repairedScript);
  const violations: string[] = [];

  if (prior.beatCount !== repaired.beatCount) {
    violations.push(`beat count changed: ${prior.beatCount} -> ${repaired.beatCount}`);
  }
  if (prior.sceneCount !== repaired.sceneCount) {
    violations.push(`scene count changed: ${prior.sceneCount} -> ${repaired.sceneCount}`);
  }
  if (!arraysEqualInOrder(prior.reversalBeatIndexes, repaired.reversalBeatIndexes)) {
    violations.push(
      `reversal beat count/positions changed: [${prior.reversalBeatIndexes.join(",")}] -> [${repaired.reversalBeatIndexes.join(",")}]`,
    );
  }
  if (prior.hook) {
    const overlap = storyLockOverlapRatio(prior.hook, repaired.hook);
    if (overlap < VD_STORY_LOCK_TEXT_OVERLAP_THRESHOLD) {
      violations.push(
        `hook meaning changed beyond execution-only wording (overlap ${overlap.toFixed(2)} < ${VD_STORY_LOCK_TEXT_OVERLAP_THRESHOLD})`,
      );
    }
  }
  if (prior.cliffhanger) {
    const overlap = storyLockOverlapRatio(prior.cliffhanger, repaired.cliffhanger);
    if (overlap < VD_STORY_LOCK_TEXT_OVERLAP_THRESHOLD) {
      violations.push(
        `cliffhanger meaning changed beyond execution-only wording (overlap ${overlap.toFixed(2)} < ${VD_STORY_LOCK_TEXT_OVERLAP_THRESHOLD})`,
      );
    }
  }

  return { violated: violations.length > 0, violations };
}

interface VerticalDramaStoryLockStoryboardShotFacts {
  shotNumber: number;
  /** `null` when the shot carries no `source_beat_indexes` field at all (nothing to compare — "when present" per spec). */
  sourceBeatIndexes: number[] | null;
}

function extractStoryLockStoryboardShots(
  storyboard: Record<string, unknown> | null | undefined,
): VerticalDramaStoryLockStoryboardShotFacts[] {
  const shotsRaw = storyLockAsPlainArray(storyLockAsPlainRecord(storyboard)?.shots);
  const shots: VerticalDramaStoryLockStoryboardShotFacts[] = [];
  for (const raw of shotsRaw) {
    const shot = storyLockAsPlainRecord(raw);
    if (!shot) continue;
    const shotNumber = Number(shot.shot_number);
    if (!Number.isFinite(shotNumber)) continue;
    const rawIndexes = shot.source_beat_indexes;
    const sourceBeatIndexes = Array.isArray(rawIndexes)
      ? [...rawIndexes]
          .filter((value): value is number => typeof value === "number")
          .sort((a, b) => a - b)
      : null;
    shots.push({ shotNumber, sourceBeatIndexes });
  }
  return shots;
}

/**
 * Deterministic post-repair guard for `storyboard_shotgrid` (spec owner
 * directive, W11.6 "Story Lock"). Flags a violation when:
 *  - the REPAIRED storyboard does not have exactly 9 shots (the skill's own
 *    schema always requires 9 — this is a defensive, always-on sanity
 *    check, not merely a diff against `priorStoryboard`);
 *  - ANY shot present in both the prior and repaired storyboard (matched by
 *    `shot_number`) has a DIFFERENT `source_beat_indexes` set — only checked
 *    when the field is present (non-`null`) on at least one side; two shots
 *    that both carry no `source_beat_indexes` at all are not compared
 *    (nothing to protect on legacy data with no beat attribution).
 *
 * `null`/`undefined` prior or repaired storyboard never violates (nothing to
 * compare against yet). Pure, deterministic, no LLM/DB.
 */
export function evaluateVerticalDramaStoryLockStoryboardGuard(
  priorStoryboard: Record<string, unknown> | null | undefined,
  repairedStoryboard: Record<string, unknown> | null | undefined,
): VerticalDramaStoryLockGuardResult {
  if (!priorStoryboard || !repairedStoryboard) return { violated: false, violations: [] };

  const repairedShots = extractStoryLockStoryboardShots(repairedStoryboard);
  const violations: string[] = [];

  if (repairedShots.length !== 9) {
    violations.push(`storyboard must keep exactly 9 shots (got ${repairedShots.length})`);
  }

  const priorShots = extractStoryLockStoryboardShots(priorStoryboard);
  const priorByShotNumber = new Map(priorShots.map(shot => [shot.shotNumber, shot]));
  for (const repairedShot of repairedShots) {
    const priorShot = priorByShotNumber.get(repairedShot.shotNumber);
    if (!priorShot) continue;
    if (priorShot.sourceBeatIndexes === null && repairedShot.sourceBeatIndexes === null) continue;
    const priorIndexes = priorShot.sourceBeatIndexes ?? [];
    const repairedIndexes = repairedShot.sourceBeatIndexes ?? [];
    if (!arraysEqualInOrder(priorIndexes, repairedIndexes)) {
      violations.push(
        `shot ${repairedShot.shotNumber} source_beat_indexes changed: [${priorIndexes.join(",")}] -> [${repairedIndexes.join(",")}]`,
      );
    }
  }

  return { violated: violations.length > 0, violations };
}

/** Warning code pushed alongside a rejected round (spec owner directive, W11.6). */
export const VD_STORY_LOCK_VIOLATION = "VD_STORY_LOCK_VIOLATION" as const;
