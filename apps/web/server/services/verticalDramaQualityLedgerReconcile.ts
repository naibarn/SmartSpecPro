/**
 * Vertical Drama Series — deterministic quality-ledger reconciliation
 * (Feature 132 §5.4, F132B; plan
 * `sections/section-03-ledgers-and-story-state.md`).
 *
 * Pure, DB/LLM-free functions — mirrors `verticalDramaArcReplan.ts`'s shape
 * exactly (no imports outside plain data + this file's own tolerant readers
 * imported from `verticalDramaStoryBible.ts`). Kept in its own file rather
 * than appended to the already-huge `verticalDramaStoryBible.ts`, per this
 * section's own file list.
 *
 * `reconcileLedgers` is the single entry point Sections 06/07/09 call after
 * their own mutation (draft/critique/loop/replan) finishes — it NEVER
 * removes a ledger row (append/update only, matching this codebase's
 * "append-only, never destructive" convention for breakdown versions), is
 * fully idempotent (running it twice on the same input is a no-op), and
 * never calls out to an LLM or the network (plain-data in, plain-data out).
 *
 * Text-matching heuristic: like `analyzeSeasonDramaturgy`'s own
 * `countOccurrences`, clue/rule/decision/thread "was this mentioned again"
 * checks use plain substring matching against a shot's `summary` +
 * `dialogue_lines[].line` text — a documented, deterministic-but-approximate
 * limitation (no NER), left for Section 04/07 to improve per the plan's own
 * "Open questions" note.
 *
 * The seven per-ledger deterministic CHECK functions (§5.4) all read the
 * ALREADY-RECONCILED ledger arrays (the caller runs `reconcileLedgers` first)
 * and return `VdDramaturgyFinding[]` — the exact same shape
 * `analyzeSeasonDramaturgy` returns, imported (not redefined) from
 * `verticalDramaStoryBible.ts` — so Section 06 can merge them into
 * `critiqueSeasonDrafts`'s own finding list with a one-line array concat.
 * Finding `kind` strings are the exact §8.1 strings pinned by
 * `VD_QUALITY_LEDGER_KINDS` in `qualityLedgers.ts`.
 *
 * Type note: `VdDramaturgyFinding.kind` is typed as `VdSeasonCritiqueFindingKind`
 * (`VD_SEASON_CRITIQUE_FINDING_KINDS`'s own closed union), which this section
 * deliberately does NOT extend (that union stays Section 06's to widen, per
 * this section's own plan — "`analyzeSeasonDramaturgy`/`VD_SEASON_CRITIQUE_
 * FINDING_KINDS` — not modified by this section"). The five new §8.1 kind
 * strings this file emits (`evidence_orphaned`/`evidence_no_resistance`/
 * `evidence_no_payoff`/`threat_not_escalating`/`antagonist_idle`/
 * `decision_without_consequence`/`thread_stalled`) are therefore constructed
 * via the local `ledgerFinding()` helper below, which centralizes a single,
 * clearly-commented forward-compatible cast — once Section 06 widens
 * `VD_SEASON_CRITIQUE_FINDING_KINDS` to include them, the cast becomes a
 * no-op (a literal already inside the union casts to itself) and can be
 * deleted at that section's discretion; it is not required to change
 * anything in THIS file.
 */

import {
  readItemShotDrafts,
  readItemCharacterDecisions,
  readItemAntagonistTactics,
  type StoredEpisodeBreakdownItem,
  type VdDramaturgyFinding,
  type VdSeasonCritiqueFindingKind,
  type VdDramaturgyRosterCharacter,
} from "./verticalDramaStoryBible";
import {
  type VerticalDramaQualityLedgers,
  type VerticalDramaEvidenceLedgerRow,
  type VerticalDramaCharacterActivationLedgerRow,
  type VerticalDramaThreatLadderRow,
  type VerticalDramaConsequenceLedgerRow,
  type VerticalDramaThreadLedgerRow,
  type VerticalDramaWorldRuleLedgerRow,
} from "@shared/verticalDramaSeries/qualityLedgers";

/* -------------------------------------------------------------------------- */
/* Shared per-episode text/signal index (built once per `reconcileLedgers`)   */
/* -------------------------------------------------------------------------- */

interface EpisodeSignalEntry {
  episodeNumber: number;
  /** Speakers this episode's shot drafts give a `dialogue_lines[].speaker` credit to. */
  speakers: Set<string>;
  /** `summary` + every `dialogue_lines[].line`, concatenated — the substring-match haystack. */
  text: string;
  /** `character_decisions[]` recorded for this episode (W11.5 dramaturgy critic field). */
  decisions: ReturnType<typeof readItemCharacterDecisions>;
  /** `antagonist_tactics[]` recorded for this episode. */
  antagonistTactics: string[];
}

/**
 * Builds the per-episode signal index this module's reconcile/check
 * functions all share — an episode with no `shotDrafts` yet (not drafted)
 * is silently skipped, mirroring `analyzeSeasonDramaturgy`'s own convention
 * (nothing to reconcile against a not-yet-drafted episode).
 */
function buildEpisodeSignalIndex(
  items: StoredEpisodeBreakdownItem[]
): EpisodeSignalEntry[] {
  return [...items]
    .filter(item => readItemShotDrafts(item) !== null)
    .sort((a, b) => a.episodeNumber - b.episodeNumber)
    .map(item => {
      const shotDrafts = readItemShotDrafts(item) ?? [];
      const speakers = new Set<string>();
      const textParts: string[] = [];
      for (const shot of shotDrafts) {
        textParts.push(shot.summary);
        for (const line of shot.dialogue_lines) {
          speakers.add(line.speaker);
          textParts.push(line.line);
        }
      }
      return {
        episodeNumber: item.episodeNumber,
        speakers,
        text: textParts.join(" \n "),
        decisions: readItemCharacterDecisions(item),
        antagonistTactics: readItemAntagonistTactics(item),
      };
    });
}

function maxEpisodeNumber(episodes: EpisodeSignalEntry[]): number {
  return episodes.reduce((max, ep) => Math.max(max, ep.episodeNumber), 0);
}

/**
 * Constructs a `VdDramaturgyFinding` from one of this section's own §8.1
 * kind strings — see this file's top doc comment for why the cast exists
 * (Section 06 owns widening `VD_SEASON_CRITIQUE_FINDING_KINDS`, not this
 * section).
 */
function ledgerFinding(
  kind: string,
  evidenceEpisodes: number[],
  detail: string
): VdDramaturgyFinding {
  return { kind: kind as VdSeasonCritiqueFindingKind, evidenceEpisodes, detail };
}

/* -------------------------------------------------------------------------- */
/* Evidence ledger                                                           */
/* -------------------------------------------------------------------------- */

function reconcileEvidenceLedger(
  rows: VerticalDramaEvidenceLedgerRow[],
  episodes: EpisodeSignalEntry[]
): VerticalDramaEvidenceLedgerRow[] {
  const latestDrafted = maxEpisodeNumber(episodes);

  return rows.map(row => {
    const usedEpisodes = new Set(row.usedEpisodes);
    const changesDecisionEpisodes = new Set(row.changesDecisionEpisodes);

    for (const ep of episodes) {
      // Strictly AFTER the introduction episode — merely naming the clue in
      // the very shot that plants it is not a "use", it's the introduction.
      if (ep.episodeNumber <= row.introducedEpisode) continue;
      if (!ep.text.includes(row.label)) continue;
      usedEpisodes.add(ep.episodeNumber);
      // A "decision-changing" use — this episode ALSO recorded at least one
      // character decision, our deterministic proxy for "this clue mattered"
      // (no NER/semantic link between the clue and the specific decision —
      // documented limitation, see this file's own doc comment).
      if (ep.decisions.length > 0) {
        changesDecisionEpisodes.add(ep.episodeNumber);
      }
    }

    const sortedUsed = [...usedEpisodes].sort((a, b) => a - b);
    const sortedChanges = [...changesDecisionEpisodes].sort((a, b) => a - b);

    const payoffEpisode =
      row.payoffEpisode ??
      (sortedChanges.length > 0 ? sortedChanges[sortedChanges.length - 1] : undefined);

    const introducedHasPassed = latestDrafted > row.introducedEpisode;

    let status: VerticalDramaEvidenceLedgerRow["status"] = row.status;
    if (payoffEpisode !== undefined) {
      status = "payoff_confirmed";
    } else if (introducedHasPassed && sortedUsed.length === 0) {
      status = "orphaned";
    } else if (sortedUsed.length > 0 && sortedChanges.length === 0) {
      status = "convenience";
    } else if (sortedUsed.length > 0) {
      status = "open";
    }

    return {
      ...row,
      usedEpisodes: sortedUsed,
      changesDecisionEpisodes: sortedChanges,
      payoffEpisode,
      status,
    };
  });
}

/** Evidence introduced, never used again by the time a later episode has been drafted — kind `evidence_orphaned` (maps to `evidenceLedger`, see `VD_QUALITY_LEDGER_KINDS`). */
export function checkEvidenceOrphaned(
  evidenceLedger: VerticalDramaEvidenceLedgerRow[]
): VdDramaturgyFinding[] {
  return evidenceLedger
    .filter(row => row.status === "orphaned")
    .map(row =>
      ledgerFinding(
        "evidence_orphaned",
        [row.introducedEpisode],
        `เบาะแส "${row.label}" ถูกปูตั้งแต่ตอนที่ ${row.introducedEpisode} แต่ไม่ถูกใช้อีกเลยตลอดซีซั่นที่ร่างแล้ว`
      )
    );
}

/** Evidence used but never once changed a character's decision — "convenience" clue — kind `evidence_no_resistance`. */
export function checkEvidenceNoResistance(
  evidenceLedger: VerticalDramaEvidenceLedgerRow[]
): VdDramaturgyFinding[] {
  return evidenceLedger
    .filter(row => row.status === "convenience")
    .map(row =>
      ledgerFinding(
        "evidence_no_resistance",
        row.usedEpisodes,
        `เบาะแส "${row.label}" ถูกใช้ในตอน ${row.usedEpisodes.join(", ")} แต่ไม่เคยเปลี่ยนการตัดสินใจของตัวละครเลย (ใช้ง่ายเกินไป)`
      )
    );
}

/** Evidence past its required payoff episode with no payoff ever recorded — kind `evidence_no_payoff`. */
export function checkEvidenceOverduePayoff(
  evidenceLedger: VerticalDramaEvidenceLedgerRow[],
  maxDraftedEpisode: number
): VdDramaturgyFinding[] {
  return evidenceLedger
    .filter(
      row =>
        row.mustPayoffByEpisode !== undefined &&
        maxDraftedEpisode >= row.mustPayoffByEpisode &&
        row.payoffEpisode === undefined
    )
    .map(row =>
      ledgerFinding(
        "evidence_no_payoff",
        [row.mustPayoffByEpisode!],
        `เบาะแส "${row.label}" ควรถูกจ่ายคืน (payoff) ภายในตอนที่ ${row.mustPayoffByEpisode} แต่ยังไม่มีการจ่ายคืนจนถึงตอนที่ร่างล่าสุด (ตอนที่ ${maxDraftedEpisode})`
      )
    );
}

/* -------------------------------------------------------------------------- */
/* Character activation ledger                                              */
/* -------------------------------------------------------------------------- */

function reconcileCharacterActivationLedger(
  rows: VerticalDramaCharacterActivationLedgerRow[],
  episodes: EpisodeSignalEntry[]
): VerticalDramaCharacterActivationLedgerRow[] {
  return rows.map(row => {
    let firstAppearanceEpisode = row.firstAppearanceEpisode;
    let firstActionEpisode = row.firstActionEpisode;

    for (const ep of episodes) {
      const spoke = ep.speakers.has(row.character);
      const decisions = ep.decisions.filter(d => d.character === row.character);
      if ((spoke || decisions.length > 0) && firstAppearanceEpisode === undefined) {
        firstAppearanceEpisode = ep.episodeNumber;
      }
      if (decisions.length > 0 && firstActionEpisode === undefined) {
        firstActionEpisode = ep.episodeNumber;
      }
    }

    let status: VerticalDramaCharacterActivationLedgerRow["status"];
    if (
      firstActionEpisode !== undefined &&
      firstActionEpisode <= row.requiredActivationByEpisode
    ) {
      status = "active";
    } else if (firstAppearanceEpisode !== undefined) {
      status = "weak";
    } else {
      status = "dormant";
    }

    return { ...row, firstAppearanceEpisode, firstActionEpisode, status };
  });
}

/**
 * A roster character not properly activated (no on-time decision — `"weak"`
 * or never even appearing — `"dormant"`) by its required-activation deadline
 * once the season has been drafted at least that far. Feeds the EXISTING
 * `character_agency_zero_decisions` kind (no new activation-specific kind
 * name — see `VD_QUALITY_LEDGER_KINDS`'s own doc comment).
 */
export function checkCharacterActivationOverdue(
  characterActivationLedger: VerticalDramaCharacterActivationLedgerRow[],
  maxDraftedEpisode: number
): VdDramaturgyFinding[] {
  return characterActivationLedger
    .filter(
      row =>
        maxDraftedEpisode >= row.requiredActivationByEpisode &&
        (row.status === "dormant" || row.status === "weak")
    )
    .map(row =>
      ledgerFinding(
        "character_agency_zero_decisions",
        row.firstAppearanceEpisode ? [row.firstAppearanceEpisode] : [],
        row.status === "dormant"
          ? `${row.character} ยังไม่เคยปรากฏตัว/มีบทบาทเลยจนถึงตอนที่ ${maxDraftedEpisode} (ควรเปิดตัวภายในตอนที่ ${row.requiredActivationByEpisode})`
          : `${row.character} ปรากฏตัวแล้วแต่ยังไม่เคยตัดสินใจอะไรด้วยตัวเองภายในตอนที่ ${row.requiredActivationByEpisode}`
      )
    );
}

/* -------------------------------------------------------------------------- */
/* Threat ladder                                                            */
/* -------------------------------------------------------------------------- */

/** Minimum run length (consecutive rows) counted as "stays flat"/"antagonist idle" per the plan's ">2 consecutive episodes" wording. */
const VD_LEDGER_CONSECUTIVE_STREAK_MIN = 3;

function reconcileThreatLadder(
  rows: VerticalDramaThreatLadderRow[],
  episodes: EpisodeSignalEntry[]
): VerticalDramaThreatLadderRow[] {
  const byEpisode = new Map(episodes.map(ep => [ep.episodeNumber, ep]));
  return rows.map(row => {
    if (row.causedByAntagonist !== undefined) return row;
    const ep = byEpisode.get(row.episode);
    if (!ep || ep.antagonistTactics.length === 0) return row;
    return { ...row, causedByAntagonist: true };
  });
}

/** A run of `VD_LEDGER_CONSECUTIVE_STREAK_MIN`+ consecutive (by list order) rows whose `threatLevel` never increases — kind `threat_not_escalating`. */
export function checkThreatLadderNonEscalating(
  threatLadder: VerticalDramaThreatLadderRow[]
): VdDramaturgyFinding[] {
  const sorted = [...threatLadder].sort((a, b) => a.episode - b.episode);
  const findings: VdDramaturgyFinding[] = [];
  let streak: VerticalDramaThreatLadderRow[] = sorted.length > 0 ? [sorted[0]] : [];

  const flushStreak = () => {
    if (streak.length >= VD_LEDGER_CONSECUTIVE_STREAK_MIN) {
      findings.push(
        ledgerFinding(
          "threat_not_escalating",
          streak.map(r => r.episode),
          `ระดับภัยคุกคามคงที่ (${streak[0].threatLevel}) ต่อเนื่อง ${streak.length} ตอน (ตอนที่ ${streak.map(r => r.episode).join(", ")}) โดยไม่ทวีความรุนแรงขึ้น`
        )
      );
    }
  };

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const current = sorted[i];
    if (current.threatLevel <= prev.threatLevel) {
      streak.push(current);
    } else {
      flushStreak();
      streak = [current];
    }
  }
  flushStreak();

  return findings;
}

/** A threat-ladder row missing its `costToProtagonist` — kind `threat_not_escalating` (no separate kind is pinned for this sub-check; it shares the ladder's kind per `VD_QUALITY_LEDGER_KINDS`). */
export function checkThreatLadderMissingCost(
  threatLadder: VerticalDramaThreatLadderRow[]
): VdDramaturgyFinding[] {
  return threatLadder
    .filter(row => !row.costToProtagonist)
    .map(row =>
      ledgerFinding(
        "threat_not_escalating",
        [row.episode],
        `ตอนที่ ${row.episode} ไม่มีการระบุ "ราคาที่พระเอก/นางเอกต้องจ่าย" (costToProtagonist) สำหรับภัยคุกคามระดับนี้`
      )
    );
}

/** A run of `VD_LEDGER_CONSECUTIVE_STREAK_MIN`+ consecutive rows with no antagonist-caused threat — kind `antagonist_idle`. */
export function checkThreatLadderAntagonistIdle(
  threatLadder: VerticalDramaThreatLadderRow[]
): VdDramaturgyFinding[] {
  const sorted = [...threatLadder].sort((a, b) => a.episode - b.episode);
  const findings: VdDramaturgyFinding[] = [];
  let streak: VerticalDramaThreatLadderRow[] = [];

  const flushStreak = () => {
    if (streak.length >= VD_LEDGER_CONSECUTIVE_STREAK_MIN) {
      findings.push(
        ledgerFinding(
          "antagonist_idle",
          streak.map(r => r.episode),
          `ตัวร้ายไม่มีบทบาทก่อภัยคุกคามต่อเนื่อง ${streak.length} ตอน (ตอนที่ ${streak.map(r => r.episode).join(", ")})`
        )
      );
    }
  };

  for (const row of sorted) {
    if (!row.causedByAntagonist) {
      streak.push(row);
    } else {
      flushStreak();
      streak = [];
    }
  }
  flushStreak();

  return findings;
}

/* -------------------------------------------------------------------------- */
/* Consequence ledger                                                       */
/* -------------------------------------------------------------------------- */

function reconcileConsequenceLedger(
  rows: VerticalDramaConsequenceLedgerRow[],
  episodes: EpisodeSignalEntry[],
  maxDraftedEpisode: number
): VerticalDramaConsequenceLedgerRow[] {
  return rows.map(row => {
    let followedInEpisode = row.followedInEpisode;

    if (followedInEpisode === undefined && row.decision) {
      for (const ep of episodes) {
        if (ep.episodeNumber <= row.decisionEpisode) continue;
        if (!ep.text.includes(row.decision)) continue;
        followedInEpisode = ep.episodeNumber;
        break;
      }
    }

    let status: VerticalDramaConsequenceLedgerRow["status"] = row.status;
    if (followedInEpisode !== undefined) {
      status = "followed";
    } else if (
      row.mustBeFollowedInEpisode !== undefined &&
      maxDraftedEpisode >= row.mustBeFollowedInEpisode
    ) {
      status = "dropped";
    }

    return { ...row, followedInEpisode, status };
  });
}

/** A decision that should have had a consequence by now, but never got one — kind `decision_without_consequence`. */
export function checkConsequenceNotFollowed(
  consequenceLedger: VerticalDramaConsequenceLedgerRow[]
): VdDramaturgyFinding[] {
  return consequenceLedger
    .filter(row => row.status === "dropped")
    .map(row =>
      ledgerFinding(
        "decision_without_consequence",
        [row.decisionEpisode],
        `การตัดสินใจของ ${row.character} ในตอนที่ ${row.decisionEpisode} ควรมีผลตามมาภายในตอนที่ ${row.mustBeFollowedInEpisode} แต่ยังไม่เคยถูกติดตามผล`
      )
    );
}

/* -------------------------------------------------------------------------- */
/* Thread ledger                                                            */
/* -------------------------------------------------------------------------- */

function reconcileThreadLedger(
  rows: VerticalDramaThreadLedgerRow[],
  episodes: EpisodeSignalEntry[],
  maxDraftedEpisode: number
): VerticalDramaThreadLedgerRow[] {
  return rows.map(row => {
    // A resolved thread is never resurrected by reconciliation.
    if (row.status === "resolved") return row;

    let lastMovedEpisode = row.lastMovedEpisode;
    for (const ep of episodes) {
      if (lastMovedEpisode !== undefined && ep.episodeNumber <= lastMovedEpisode) continue;
      if (ep.text.includes(row.label)) {
        lastMovedEpisode = ep.episodeNumber;
      }
    }

    let status: VerticalDramaThreadLedgerRow["status"] = row.status;
    if (
      row.mustMoveAgainByEpisode !== undefined &&
      maxDraftedEpisode >= row.mustMoveAgainByEpisode &&
      (lastMovedEpisode === undefined || lastMovedEpisode < row.mustMoveAgainByEpisode)
    ) {
      status = "stalled";
    } else {
      status = "active";
    }

    return { ...row, lastMovedEpisode, status };
  });
}

/** A thread that missed its required next-movement deadline — kind `thread_stalled`. */
export function checkThreadStalled(
  threadLedger: VerticalDramaThreadLedgerRow[]
): VdDramaturgyFinding[] {
  return threadLedger
    .filter(row => row.status === "stalled")
    .map(row =>
      ledgerFinding(
        "thread_stalled",
        row.lastMovedEpisode !== undefined ? [row.lastMovedEpisode] : [],
        `เธรด "${row.label}" ควรมีความคืบหน้าอีกครั้งภายในตอนที่ ${row.mustMoveAgainByEpisode} แต่ยังคงหยุดนิ่งอยู่`
      )
    );
}

/* -------------------------------------------------------------------------- */
/* World rule ledger                                                        */
/* -------------------------------------------------------------------------- */

function reconcileWorldRuleLedger(
  rows: VerticalDramaWorldRuleLedgerRow[],
  episodes: EpisodeSignalEntry[],
  maxDraftedEpisode: number
): VerticalDramaWorldRuleLedgerRow[] {
  return rows.map(row => {
    const usedAgainEpisodes = new Set(row.usedAgainEpisodes);
    for (const ep of episodes) {
      if (ep.episodeNumber <= row.introducedEpisode) continue;
      if (ep.text.includes(row.rule)) usedAgainEpisodes.add(ep.episodeNumber);
    }
    const sortedUsed = [...usedAgainEpisodes].sort((a, b) => a - b);

    const introducedHasPassed = maxDraftedEpisode > row.introducedEpisode;
    let verdict: VerticalDramaWorldRuleLedgerRow["verdict"] = row.verdict;
    if (introducedHasPassed) {
      verdict = sortedUsed.length === 0 || !row.createsChoice ? "revise" : "keep";
    }

    return { ...row, usedAgainEpisodes: sortedUsed, verdict };
  });
}

/** A world rule never reused again, or one that never creates a real choice — kind `world_rules_undefined` (the EXISTING kind — see `VD_QUALITY_LEDGER_KINDS`). */
export function checkWorldRuleNeverReusedOrNoChoice(
  worldRuleLedger: VerticalDramaWorldRuleLedgerRow[]
): VdDramaturgyFinding[] {
  return worldRuleLedger
    .filter(row => row.verdict === "revise")
    .map(row =>
      ledgerFinding(
        "world_rules_undefined",
        [row.introducedEpisode],
        row.usedAgainEpisodes.length === 0
          ? `กฎโลก "${row.rule}" ถูกตั้งขึ้นในตอนที่ ${row.introducedEpisode} แต่ไม่เคยถูกอ้างอิงซ้ำอีกเลย`
          : `กฎโลก "${row.rule}" ไม่เคยสร้างทางเลือกที่แท้จริง (createsChoice: false) ให้ตัวละคร`
      )
    );
}

/* -------------------------------------------------------------------------- */
/* reconcileLedgers — the single entry point                                 */
/* -------------------------------------------------------------------------- */

/**
 * Deterministic, pure, code-only ledger reconciliation (spec §5.4). Given
 * the CURRENT ledgers (as read via `readBreakdownVersionLedgers`, or fresh
 * from `emptyQualityLedgers()`) and the season's full active breakdown
 * (`items` — drafted AND not-yet-drafted episodes, same convention as
 * `analyzeSeasonDramaturgy`), returns a BRAND NEW ledgers object with every
 * row's derived fields (`status`/`usedEpisodes`/`firstActionEpisode`/etc.)
 * refreshed against the latest drafted content — never mutates `ledgers` or
 * any row in place, never removes a row, never calls an LLM or the network.
 *
 * `causalChainMap` has no derivable signal in this section's scope (it is
 * populated by the `ledger_plan` LLM step / a later section's causal-chain
 * builder) — carried over unchanged.
 */
export function reconcileLedgers(
  ledgers: VerticalDramaQualityLedgers,
  items: StoredEpisodeBreakdownItem[],
  _opts?: { roster?: VdDramaturgyRosterCharacter[] }
): VerticalDramaQualityLedgers {
  const episodes = buildEpisodeSignalIndex(items);
  const maxDraftedEpisode = maxEpisodeNumber(episodes);

  return {
    ...ledgers,
    evidenceLedger: reconcileEvidenceLedger(ledgers.evidenceLedger, episodes),
    characterActivationLedger: reconcileCharacterActivationLedger(
      ledgers.characterActivationLedger,
      episodes
    ),
    threatLadder: reconcileThreatLadder(ledgers.threatLadder, episodes),
    consequenceLedger: reconcileConsequenceLedger(
      ledgers.consequenceLedger,
      episodes,
      maxDraftedEpisode
    ),
    threadLedger: reconcileThreadLedger(ledgers.threadLedger, episodes, maxDraftedEpisode),
    worldRuleLedger: reconcileWorldRuleLedger(
      ledgers.worldRuleLedger,
      episodes,
      maxDraftedEpisode
    ),
    causalChainMap: ledgers.causalChainMap,
  };
}

/**
 * Convenience aggregator — concatenates every deterministic check function's
 * findings against an ALREADY-RECONCILED `ledgers` object (call
 * `reconcileLedgers` first). Exported so Section 06 can merge this section's
 * findings into `critiqueSeasonDrafts`'s own list with a single array
 * spread, per this section's own interface-contract note; Section 06 owns
 * the actual wiring decision (whether to call this aggregator or the
 * individual checks directly).
 */
export function analyzeLedgerDramaturgy(
  ledgers: VerticalDramaQualityLedgers,
  maxDraftedEpisode: number
): VdDramaturgyFinding[] {
  return [
    ...checkEvidenceOrphaned(ledgers.evidenceLedger),
    ...checkEvidenceNoResistance(ledgers.evidenceLedger),
    ...checkEvidenceOverduePayoff(ledgers.evidenceLedger, maxDraftedEpisode),
    ...checkCharacterActivationOverdue(ledgers.characterActivationLedger, maxDraftedEpisode),
    ...checkThreatLadderNonEscalating(ledgers.threatLadder),
    ...checkThreatLadderMissingCost(ledgers.threatLadder),
    ...checkThreatLadderAntagonistIdle(ledgers.threatLadder),
    ...checkConsequenceNotFollowed(ledgers.consequenceLedger),
    ...checkThreadStalled(ledgers.threadLedger),
    ...checkWorldRuleNeverReusedOrNoChoice(ledgers.worldRuleLedger),
  ];
}
