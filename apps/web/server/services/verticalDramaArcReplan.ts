/**
 * Vertical Drama Series — cross-episode arc drift detection + re-plan
 * proposal construction (spec §7.7.3, section-13, added 2026-07-07).
 *
 * Pure, DB-free functions — mirrors `verticalDramaQualityReviewApply.ts`'s
 * shape exactly: no LLM calls (drift detection is deterministic, spec
 * §7.7.3 hard rule 5), no DB imports. The caller (router/pipeline wiring, a
 * later wave, gated behind the `verticalDramaSeriesArcReplan` feature flag)
 * is responsible for:
 *  - loading `activeBreakdown` (via `verticalDramaStoryBible.ts`'s
 *    `getActiveBreakdown`) and `priorMemoryHooks` (from the series memory
 *    event log) before calling `detectArcDrift`;
 *  - persisting the bible returned by `applyApprovedArcReplan` and
 *    appending the `arc_replan_applied` memory event (spec §7.6 pins the
 *    memory-kind shape in section-02; this module has no dependency on it
 *    and does not construct memory events itself);
 *  - implementing `rejectArcReplanProposal` (a simple status flip + a
 *    standing continuity warning — no breakdown-version mutation, so it is
 *    a router/memory-service concern, out of scope for this file per its
 *    task brief, which lists exactly the 3 functions below).
 */

import { randomUUID } from "crypto";
import {
  type VerticalDramaArcDriftReasonCode,
  type VerticalDramaArcReplanProposal,
  type VerticalDramaConflictLevel,
  type VerticalDramaEpisodeBreakdownItem,
} from "@shared/verticalDramaSeries/contentBudget";
import {
  appendBreakdownVersion,
  getActiveBreakdown,
  type StoredEpisodeBreakdownItem,
} from "./verticalDramaStoryBible";

/* -------------------------------------------------------------------------- */
/* Deterministic text-overlap heuristic (shared by 2 of the 5 trigger codes)   */
/* -------------------------------------------------------------------------- */

/**
 * Minimum token length counted as a "significant word" for the overlap
 * heuristic below — filters trivial short tokens (articles, single Thai
 * particles) without needing a full stopword list.
 */
const SIGNIFICANT_WORD_MIN_LENGTH = 3;

/**
 * Fraction of a reference phrase's significant words that must reappear in
 * the realized text for the phrase to count as "matched" by the overlap
 * heuristic below (spec §7.7.3: "beats consumed early via keyBeats overlap
 * heuristic", "hook resolved early/unplanned from script continuity notes +
 * hooks"). Deliberately approximate (word-SET overlap, not semantic
 * similarity) — this is a DETERMINISTIC, LLM-free proxy for "this planned
 * beat/hook appears to have already happened", not a claim of true
 * language understanding. False negatives are the safe failure mode (just
 * skip a drift signal), so the threshold is set high enough to avoid
 * trivial/coincidental matches; false positives are avoided by requiring a
 * MAJORITY of the reference phrase's own significant words to reappear.
 *
 * Tokenization (`significantWords` below) splits on any run of characters
 * that are NOT a Unicode letter/number, lowercases, and drops tokens
 * shorter than `SIGNIFICANT_WORD_MIN_LENGTH`. This is Thai-aware only in
 * the sense that Thai characters count as letters (`\p{L}`); it does NOT
 * segment Thai text into individual words (Thai has no mandatory
 * inter-word spacing), so a contiguous Thai clause with no internal
 * spacing/punctuation becomes ONE token. This is an accepted, documented
 * limitation of the heuristic — Thai prose that uses spaces at clause
 * boundaries (a common Thai typographic convention) still tokenizes
 * reasonably; a single unbroken run of Thai script does not.
 */
const TEXT_OVERLAP_MATCH_THRESHOLD = 0.6;

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(word => word.length >= SIGNIFICANT_WORD_MIN_LENGTH),
  );
}

/**
 * Fraction of `reference`'s significant words that are also present in
 * `haystack`'s significant-word set. Returns `0` when `reference` has no
 * significant words at all, so an empty/trivial reference never
 * spuriously "matches" everything.
 */
function overlapRatio(reference: string, haystack: string): number {
  const referenceWords = significantWords(reference);
  if (referenceWords.size === 0) return 0;
  const haystackWords = significantWords(haystack);
  let matched = 0;
  for (const word of referenceWords) {
    if (haystackWords.has(word)) matched++;
  }
  return matched / referenceWords.size;
}

function matchesText(reference: string, haystack: string): boolean {
  return overlapRatio(reference, haystack) >= TEXT_OVERLAP_MATCH_THRESHOLD;
}

/* -------------------------------------------------------------------------- */
/* detectArcDrift                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A hook known to be OPEN going into this episode (spec §7.6 `hook_opened`
 * events not yet matched by a `hook_resolved` event) — mirrors
 * `VerticalDramaSeriesMemoryService`'s `unresolvedHooks` free text, plus an
 * OPTIONAL planned-resolution episode number when the season plan implies
 * one, so `VD_ARC_HOOK_RESOLVED_EARLY` has something concrete to compare
 * against ("early" relative to WHAT). A hook with no planned-resolution
 * episode number never triggers that code (no evidence it was early).
 */
export interface ArcDriftOpenHook {
  hookId: string;
  description: string;
  plannedResolutionEpisodeNumber?: number;
}

/**
 * The approved script's realized signals needed for drift detection (spec
 * §7.7.3) — a narrow, purpose-built shape (not the full `ScriptBuilderOutput`
 * from `verticalDramaScriptGeneration.ts`) so this module stays decoupled
 * from the script generator's schema, mirroring
 * `verticalDramaQualityReviewApply.ts`'s own narrow `QualityReviewIssueLike`
 * pattern.
 */
export interface ArcDriftApprovedScript {
  /**
   * Beat-by-beat prose realized by the approved script — scanned (together
   * with `continuityNotes`) against FUTURE `activeBreakdown` entries'
   * `keyBeats[]` for `VD_ARC_BEATS_CONSUMED_EARLY`.
   */
  beatSummaries: string[];
  /**
   * Freeform continuity notes emitted by the approved script (spec §7.7.3:
   * "hook resolved early ... from script continuity notes + hooks") —
   * scanned against `priorMemoryHooks[].description` for
   * `VD_ARC_HOOK_RESOLVED_EARLY`.
   */
  continuityNotes: string[];
  /**
   * Hook descriptions this episode introduced that are NOT already tracked
   * in `priorMemoryHooks` (caller-derived — e.g. diffing
   * `runVerticalDramaSeriesMemoryPlanning`'s structured `unresolved_hooks`
   * output against the PRIOR memory bundle's open-hook list). Scanned
   * against every `activeBreakdown` episode's `arcThreads[]` for
   * `VD_ARC_HOOK_UNPLANNED`. Defaults to `[]` when omitted.
   */
  newHookDescriptions?: string[];
  /** This episode's realized beat count — `VD_ARC_CONTENT_BUDGET_EXCEEDED` input. */
  realizedBeatCount: number;
  /**
   * This episode's realized total estimated speech seconds (see
   * `evaluateScriptSpeechCoverage` in `verticalDramaScriptGeneration.ts`) —
   * `VD_ARC_CONTENT_BUDGET_EXCEEDED` input.
   */
  realizedEstimatedSpeechSeconds: number;
  /**
   * This episode's realized conflict/intensity, PRE-MAPPED by the caller
   * onto the SAME 1-5 scale as `VerticalDramaEpisodeContentBudget
   * .conflictLevel` (e.g. from the script's peak per-beat `intensity`,
   * 1-10) — `VD_ARC_ESCALATION_ORDER_BROKEN` input. Kept pre-computed so
   * this module has no dependency on the script generator's beat schema.
   */
  realizedConflictLevel: VerticalDramaConflictLevel;
}

export interface DetectArcDriftInput {
  approvedScript: ArcDriftApprovedScript;
  activeBreakdown: StoredEpisodeBreakdownItem[];
  episodeNumber: number;
  priorMemoryHooks: ArcDriftOpenHook[];
}

export interface ArcDriftReason {
  code: VerticalDramaArcDriftReasonCode;
  evidence: string;
}

export interface ArcDriftDetectionResult {
  drifted: boolean;
  reasons: ArcDriftReason[];
  /**
   * FUTURE (`episodeNumber` greater than the triggering episode),
   * non-produced episodes only — union across every triggered reason,
   * deduplicated and sorted ascending.
   */
  affectedEpisodeNumbers: number[];
}

/** `> 25%` over the planned budget counts as exceeded (spec §7.7.3). */
const CONTENT_BUDGET_EXCEEDED_RATIO = 0.25;

function isFutureEpisode(candidateEpisodeNumber: number, currentEpisodeNumber: number): boolean {
  return candidateEpisodeNumber > currentEpisodeNumber;
}

/**
 * Deterministic (no LLM — spec §7.7.3 hard rule 5) cross-episode arc-drift
 * detector. Evaluates all 5 stable `VD_ARC_*` trigger codes independently;
 * `drifted` is `true` iff at least one fired. Every `affectedEpisodeNumbers`
 * entry (both the per-result union and each internal candidate) is
 * restricted to episodes STRICTLY AFTER `input.episodeNumber` — this module
 * assumes the standard sequential-production model (episodes are
 * scripted/produced in ascending-episode-number order), so "future,
 * non-produced" is exactly "episode number greater than the one just
 * approved".
 */
export function detectArcDrift(input: DetectArcDriftInput): ArcDriftDetectionResult {
  const { approvedScript, activeBreakdown, episodeNumber, priorMemoryHooks } = input;
  const newHookDescriptions = approvedScript.newHookDescriptions ?? [];
  const reasons: ArcDriftReason[] = [];
  const affected = new Set<number>();

  // 1. VD_ARC_BEATS_CONSUMED_EARLY — this episode's realized beats/continuity
  //    overlap a FUTURE episode's planned keyBeats.
  const realizedText = [...approvedScript.beatSummaries, ...approvedScript.continuityNotes].join(
    "\n",
  );
  const beatsConsumedEvidence: string[] = [];
  const beatsConsumedEpisodes = new Set<number>();
  for (const futureItem of activeBreakdown) {
    if (!isFutureEpisode(futureItem.episodeNumber, episodeNumber)) continue;
    for (const keyBeat of futureItem.keyBeats) {
      if (matchesText(keyBeat, realizedText)) {
        beatsConsumedEvidence.push(
          `Episode ${episodeNumber} content overlaps episode ${futureItem.episodeNumber}'s planned beat: "${keyBeat}"`,
        );
        beatsConsumedEpisodes.add(futureItem.episodeNumber);
      }
    }
  }
  if (beatsConsumedEvidence.length > 0) {
    reasons.push({
      code: "VD_ARC_BEATS_CONSUMED_EARLY",
      evidence: beatsConsumedEvidence.join("\n"),
    });
    for (const ep of beatsConsumedEpisodes) affected.add(ep);
  }

  // 2. VD_ARC_HOOK_RESOLVED_EARLY — a known open hook, not yet due to
  //    resolve, appears addressed in this episode's continuity notes.
  const continuityText = approvedScript.continuityNotes.join("\n");
  const hookResolvedEvidence: string[] = [];
  const hookResolvedEpisodes = new Set<number>();
  for (const hook of priorMemoryHooks) {
    if (
      hook.plannedResolutionEpisodeNumber === undefined ||
      !isFutureEpisode(hook.plannedResolutionEpisodeNumber, episodeNumber)
    ) {
      continue; // no evidence this hook was resolved AHEAD of its plan
    }
    if (matchesText(hook.description, continuityText)) {
      hookResolvedEvidence.push(
        `Hook "${hook.description}" (planned to resolve by episode ${hook.plannedResolutionEpisodeNumber}) appears resolved in episode ${episodeNumber}'s continuity notes`,
      );
      hookResolvedEpisodes.add(hook.plannedResolutionEpisodeNumber);
    }
  }
  if (hookResolvedEvidence.length > 0) {
    reasons.push({
      code: "VD_ARC_HOOK_RESOLVED_EARLY",
      evidence: hookResolvedEvidence.join("\n"),
    });
    for (const ep of hookResolvedEpisodes) affected.add(ep);
  }

  // 3. VD_ARC_HOOK_UNPLANNED — a newly-introduced hook this episode does not
  //    match ANY declared season arc thread.
  const allArcThreads = activeBreakdown.flatMap(item => item.contentBudget?.arcThreads ?? []);
  const hookUnplannedEvidence: string[] = [];
  for (const newHook of newHookDescriptions) {
    const matchesAnyThread = allArcThreads.some(
      thread => matchesText(thread, newHook) || matchesText(newHook, thread),
    );
    if (!matchesAnyThread) {
      hookUnplannedEvidence.push(
        `Episode ${episodeNumber} introduces a new hook not declared in any planned arc thread: "${newHook}"`,
      );
    }
  }
  if (hookUnplannedEvidence.length > 0) {
    reasons.push({ code: "VD_ARC_HOOK_UNPLANNED", evidence: hookUnplannedEvidence.join("\n") });
    for (const item of activeBreakdown) {
      if (isFutureEpisode(item.episodeNumber, episodeNumber)) affected.add(item.episodeNumber);
    }
  }

  // 4. VD_ARC_CONTENT_BUDGET_EXCEEDED — realized beats/speech > 25% over the
  //    CURRENT episode's own planned contentBudget.
  const currentItem = activeBreakdown.find(item => item.episodeNumber === episodeNumber);
  const currentBudget = currentItem?.contentBudget;
  if (currentBudget) {
    const speechOverRatio =
      currentBudget.estimatedSpeechSeconds > 0
        ? (approvedScript.realizedEstimatedSpeechSeconds - currentBudget.estimatedSpeechSeconds) /
          currentBudget.estimatedSpeechSeconds
        : 0;
    const beatOverRatio =
      currentBudget.beatCount > 0
        ? (approvedScript.realizedBeatCount - currentBudget.beatCount) / currentBudget.beatCount
        : 0;
    if (
      speechOverRatio > CONTENT_BUDGET_EXCEEDED_RATIO ||
      beatOverRatio > CONTENT_BUDGET_EXCEEDED_RATIO
    ) {
      const overMetric = speechOverRatio > CONTENT_BUDGET_EXCEEDED_RATIO ? "speech" : "beat count";
      reasons.push({
        code: "VD_ARC_CONTENT_BUDGET_EXCEEDED",
        evidence: `Episode ${episodeNumber} realized ${approvedScript.realizedEstimatedSpeechSeconds.toFixed(1)}s speech / ${approvedScript.realizedBeatCount} beats vs. planned ${currentBudget.estimatedSpeechSeconds}s / ${currentBudget.beatCount} beats (>${Math.round(CONTENT_BUDGET_EXCEEDED_RATIO * 100)}% over on ${overMetric}).`,
      });
      for (const item of activeBreakdown) {
        if (isFutureEpisode(item.episodeNumber, episodeNumber)) affected.add(item.episodeNumber);
      }
    }
  }

  // 5. VD_ARC_ESCALATION_ORDER_BROKEN — this episode's realized level already
  //    meets/exceeds what a LATER episode was planned to reach.
  const flattenedFutureEpisodes: number[] = [];
  for (const item of activeBreakdown) {
    if (!isFutureEpisode(item.episodeNumber, episodeNumber)) continue;
    if (item.contentBudget && approvedScript.realizedConflictLevel > item.contentBudget.conflictLevel) {
      flattenedFutureEpisodes.push(item.episodeNumber);
    }
  }
  if (flattenedFutureEpisodes.length > 0) {
    reasons.push({
      code: "VD_ARC_ESCALATION_ORDER_BROKEN",
      evidence: `Episode ${episodeNumber} realized conflictLevel ${approvedScript.realizedConflictLevel} already meets/exceeds the planned curve for future episode(s) ${flattenedFutureEpisodes.join(", ")}.`,
    });
    for (const ep of flattenedFutureEpisodes) affected.add(ep);
  }

  return {
    drifted: reasons.length > 0,
    reasons,
    affectedEpisodeNumbers: Array.from(affected).sort((a, b) => a - b),
  };
}

/* -------------------------------------------------------------------------- */
/* buildArcReplanProposal                                                     */
/* -------------------------------------------------------------------------- */

export interface BuildArcReplanProposalInput {
  drift: ArcDriftDetectionResult;
  activeBreakdown: StoredEpisodeBreakdownItem[];
  triggeredByEpisodeNumber: number;
  /**
   * Replacement entries for FUTURE episodes only — a fresh proposal always
   * carries a resolved `contentBudget` per item (the canonical,
   * `contentBudget`-required `VerticalDramaEpisodeBreakdownItem`, unlike
   * the tolerant `StoredEpisodeBreakdownItem` legacy-read shape), matching
   * `VerticalDramaArcReplanProposal.proposedBreakdown`'s own type.
   */
  proposedItems: VerticalDramaEpisodeBreakdownItem[];
  seriesId: string;
  rationale?: string;
  /** Overridable for deterministic tests; defaults to `crypto.randomUUID()`. */
  proposalId?: string;
}

/**
 * Builds a `VerticalDramaArcReplanProposal` from a drift-detection result
 * (spec §7.7.3). Enforces the FUTURE-ONLY invariant (hard rule 4: "Produced
 * episodes are NEVER rewritten") by throwing if any `proposedItems` entry
 * targets an episode at or before `triggeredByEpisodeNumber`, and mirrors
 * `verticalDramaArcReplanProposalSchema`'s own `driftReasons.min(1)`
 * requirement by refusing to build a proposal with zero drift reasons.
 * Does NOT persist anything — the caller applies an approved proposal via
 * `applyApprovedArcReplan`.
 */
export function buildArcReplanProposal(
  input: BuildArcReplanProposalInput,
): VerticalDramaArcReplanProposal {
  if (input.drift.reasons.length === 0) {
    throw new Error(
      "buildArcReplanProposal: drift.reasons must be non-empty — refusing to build a proposal with no drift reason (spec §7.7.3).",
    );
  }

  const invalidItem = input.proposedItems.find(
    item => item.episodeNumber <= input.triggeredByEpisodeNumber,
  );
  if (invalidItem) {
    throw new Error(
      `buildArcReplanProposal: proposedItems must only contain FUTURE episodes (> ${input.triggeredByEpisodeNumber}); got episode ${invalidItem.episodeNumber}, which is already produced/current and must never be rewritten (spec §7.7.3 hard rule 4).`,
    );
  }

  const affectedEpisodeNumbers = Array.from(
    new Set(input.proposedItems.map(item => item.episodeNumber)),
  ).sort((a, b) => a - b);

  const driftReasons = Array.from(
    new Set(input.drift.reasons.map(reason => reason.code)),
  ) as VerticalDramaArcDriftReasonCode[];

  const rationale =
    input.rationale ??
    input.drift.reasons.map(reason => `[${reason.code}] ${reason.evidence}`).join("\n");

  return {
    proposalId: input.proposalId ?? randomUUID(),
    seriesId: input.seriesId,
    triggeredByEpisodeNumber: input.triggeredByEpisodeNumber,
    driftReasons,
    affectedEpisodeNumbers,
    proposedBreakdown: input.proposedItems,
    rationale,
    status: "proposed",
  };
}

/* -------------------------------------------------------------------------- */
/* Tie-in-deferred apply guard (task #31, spec §7.7.3, added 2026-07-09)      */
/* -------------------------------------------------------------------------- */

/** Coded so a caller (router) can `instanceof`-check or read `.code` without string-matching the message. Mirrors `VD_STORY_LOCK_VIOLATION` (`verticalDramaQualityReviewApply.ts`) as a stable, exported identifier. */
export const VD_ARC_TIE_IN_REPLAN_GUARD_VIOLATION = "VD_ARC_TIE_IN_REPLAN_GUARD_VIOLATION" as const;

/** One episode whose `proposedBreakdown` entry failed the tie-in-deferred guard below. */
export interface VerticalDramaArcReplanTieInGuardViolation {
  episodeNumber: number;
  /**
   * Field names (other than `tieIn`, which is always allowed to differ)
   * that differ from the active version's corresponding item, OR the
   * sentinel `"__no_matching_active_item__"` when `proposedBreakdown`
   * names an episode the active version doesn't have at all (a fabricated
   * episode is treated as maximally suspicious, not silently accepted).
   */
  changedFields: string[];
}

/**
 * Thrown by `applyApprovedArcReplan` when a proposal claims
 * `driftReasons` includes `VD_ARC_TIE_IN_DEFERRED` but its
 * `proposedBreakdown` changes something other than `tieIn` (spec §7.7.3,
 * task #31 — guards against a proposal that uses the tie-in-deferred code
 * as a Trojan horse to sneak an unreviewed story-content change past the
 * ArcReplanCard approval flow, which shows a stripped-down "moved product"
 * diff for this proposal type instead of the full old/new breakdown diff a
 * genuine drift-detected proposal gets). Mirrors
 * `verticalDramaQualityReviewApply.ts`'s `VD_STORY_LOCK_VIOLATION` guard
 * pattern (reject + a `.code` a caller can act on) — see this file's
 * `applyApprovedArcReplan` doc comment for why the actual DB-persisted
 * audit artifact (mirroring `writeVerticalDramaStoryLockViolationArtifact`
 * in `server/routers/verticalDramaEpisodes.ts`) is the CALLER's
 * responsibility, not this module's (this module stays pure/DB-free, same
 * as every other function here).
 */
export class VerticalDramaArcReplanGuardViolationError extends Error {
  readonly code = VD_ARC_TIE_IN_REPLAN_GUARD_VIOLATION;
  readonly proposalId: string;
  readonly violations: VerticalDramaArcReplanTieInGuardViolation[];

  constructor(proposalId: string, violations: VerticalDramaArcReplanTieInGuardViolation[]) {
    super(
      `Arc re-plan proposal ${proposalId} claims driftReasons includes "VD_ARC_TIE_IN_DEFERRED" but changes non-tieIn fields on episode(s) ${violations
        .map(v => v.episodeNumber)
        .join(", ")} — a tie-in-deferred proposal may only move the \`tieIn\` placement, never story content. Rejected before touching the season breakdown.`,
    );
    this.name = "VerticalDramaArcReplanGuardViolationError";
    this.proposalId = proposalId;
    this.violations = violations;
  }
}

/**
 * Structural (JSON-value) deep-equal — order-independent for object keys
 * (unlike a `JSON.stringify` comparison), so a harmless key-insertion-order
 * difference between the active version's stored item and a freshly
 * constructed proposed item never registers as a false-positive violation.
 */
function jsonDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, index) => jsonDeepEqual(value, b[index]));
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  const bKeys = Object.keys(bRecord);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(key => jsonDeepEqual(aRecord[key], bRecord[key]));
}

/** Field names (excluding `tieIn`) that differ between two breakdown items, deep-compared, sorted for stable output. */
function fieldByFieldChangedKeys(
  active: Record<string, unknown>,
  proposed: Record<string, unknown>,
): string[] {
  const keys = new Set([...Object.keys(active), ...Object.keys(proposed)]);
  keys.delete("tieIn");
  const changed: string[] = [];
  for (const key of keys) {
    if (!jsonDeepEqual(active[key], proposed[key])) changed.push(key);
  }
  return changed.sort();
}

/**
 * Pure guard (exported for direct unit testing): every item in
 * `proposedBreakdown` must match `currentActive`'s corresponding item
 * (matched by `episodeNumber`) on every field EXCEPT `tieIn`. Returns `[]`
 * when the proposal is clean.
 */
export function findArcReplanTieInGuardViolations(
  currentActive: StoredEpisodeBreakdownItem[],
  proposedBreakdown: VerticalDramaEpisodeBreakdownItem[],
): VerticalDramaArcReplanTieInGuardViolation[] {
  const activeByEpisode = new Map(
    currentActive.map(item => [item.episodeNumber, item as unknown as Record<string, unknown>] as const),
  );
  const violations: VerticalDramaArcReplanTieInGuardViolation[] = [];
  for (const proposedItem of proposedBreakdown) {
    const activeItem = activeByEpisode.get(proposedItem.episodeNumber);
    if (!activeItem) {
      violations.push({
        episodeNumber: proposedItem.episodeNumber,
        changedFields: ["__no_matching_active_item__"],
      });
      continue;
    }
    const changedFields = fieldByFieldChangedKeys(
      activeItem,
      proposedItem as unknown as Record<string, unknown>,
    );
    if (changedFields.length > 0) {
      violations.push({ episodeNumber: proposedItem.episodeNumber, changedFields });
    }
  }
  return violations;
}

/* -------------------------------------------------------------------------- */
/* applyApprovedArcReplan                                                     */
/* -------------------------------------------------------------------------- */

export interface ApplyApprovedArcReplanOptions {
  /**
   * Best-effort audit hook invoked (fire-and-forget — NOT awaited, see
   * below) immediately before `applyApprovedArcReplan` throws a
   * `VerticalDramaArcReplanGuardViolationError`. Defaults to a no-op.
   *
   * This module is pure/DB-free by design (mirrors
   * `verticalDramaQualityReviewApply.ts`'s shape — see this file's header
   * doc comment), so it cannot itself persist a
   * `writeVerticalDramaStoryLockViolationArtifact`-style audit row (that
   * needs `db.insert` on `verticalDramaEpisodeRuns`/`verticalDramaRunArtifacts`,
   * both DB-backed, tenant/user/series/episode-scoped tables this module
   * has no `owner` context for anyway). The proposal's approve/reject
   * mutations live in `server/routers/verticalDramaSeries.ts`, which was
   * OUT OF FILE SCOPE for the wave that added this guard — so this callback
   * is the extensibility point: keeps `applyApprovedArcReplan`'s call
   * signature backward-compatible (existing 3-arg callers, including that
   * very router, are unaffected — this is an ADDITIVE 4th parameter) while
   * letting a caller that DOES have DB/owner context persist a real audit
   * row. Intentionally NOT awaited by this function (which stays
   * synchronous) — a caller needing a guaranteed-persisted write should
   * await its own promise INSIDE the callback before this function returns
   * (the callback fires before the `throw`, synchronously in the same
   * tick), or catch the thrown error and persist afterward instead.
   */
  persistAudit?: (violation: {
    proposalId: string;
    seriesId: string;
    violations: VerticalDramaArcReplanTieInGuardViolation[];
  }) => void | Promise<void>;
}

/**
 * Applies an APPROVED arc-replan proposal to the series bible (spec
 * §7.7.3): replaces only the FUTURE episode entries named in
 * `proposal.proposedBreakdown` on top of the CURRENT active breakdown,
 * leaving every earlier (already-produced) entry byte-identical, then
 * appends the result as a brand-new breakdown version via
 * `appendBreakdownVersion(source: "arc_replan")` (imported from
 * `verticalDramaStoryBible.ts`) — never mutates `bible`, any prior version,
 * or any already-produced episode entry. The caller (router, a later wave)
 * is responsible for having already set `proposal.status === "approved"`
 * and for appending the `arc_replan_applied` memory event once this
 * returned bible is persisted.
 *
 * Task #31 (spec §7.7.3, added 2026-07-09): when `proposal.driftReasons`
 * includes `"VD_ARC_TIE_IN_DEFERRED"`, runs
 * `findArcReplanTieInGuardViolations` first and throws
 * `VerticalDramaArcReplanGuardViolationError` (never mutates/returns
 * anything) on any violation — see that guard's own doc comment. Every
 * other proposal (`driftReasons` without that code) is completely
 * unaffected — same behavior as before this wave, byte-identical.
 */
export function applyApprovedArcReplan(
  bible: Record<string, unknown> | null | undefined,
  proposal: VerticalDramaArcReplanProposal,
  userId: number,
  opts?: ApplyApprovedArcReplanOptions,
): Record<string, unknown> {
  if (proposal.status !== "approved") {
    throw new Error(
      `applyApprovedArcReplan: proposal ${proposal.proposalId} must be status "approved" (got "${proposal.status}") before it can be applied.`,
    );
  }

  const currentActive = getActiveBreakdown(bible);

  if (proposal.driftReasons.includes("VD_ARC_TIE_IN_DEFERRED")) {
    const violations = findArcReplanTieInGuardViolations(currentActive, proposal.proposedBreakdown);
    if (violations.length > 0) {
      void opts?.persistAudit?.({
        proposalId: proposal.proposalId,
        seriesId: proposal.seriesId,
        violations,
      });
      throw new VerticalDramaArcReplanGuardViolationError(proposal.proposalId, violations);
    }
  }

  const proposedByEpisode = new Map(
    proposal.proposedBreakdown.map(item => [item.episodeNumber, item] as const),
  );

  const newItems: StoredEpisodeBreakdownItem[] = currentActive.map(
    item => proposedByEpisode.get(item.episodeNumber) ?? item,
  );
  for (const proposedItem of proposal.proposedBreakdown) {
    if (!newItems.some(item => item.episodeNumber === proposedItem.episodeNumber)) {
      newItems.push(proposedItem);
    }
  }
  newItems.sort((a, b) => a.episodeNumber - b.episodeNumber);

  return appendBreakdownVersion(bible, {
    source: "arc_replan",
    items: newItems,
    createdByUserId: userId,
  });
}
