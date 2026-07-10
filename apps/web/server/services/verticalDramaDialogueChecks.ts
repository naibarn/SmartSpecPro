/**
 * Vertical Drama Series — standalone deterministic dialogue-quality check
 * functions (spec §7.1/§7.2 dialogue rules v2, F132D; plan
 * `sections/section-05-dialogue-rules-and-speech-profiles.md`).
 *
 * Ownership note (post-review-round-1, Finding 2): `verticalDramaStoryBible.ts`
 * is NOT edited by this section — sole ownership of
 * `VD_SEASON_CRITIQUE_FINDING_KINDS` and of wiring these checks into
 * `analyzeSeasonDramaturgy`/the multi-pass Dialogue Pass belongs to Section
 * 06. This module ships only the pure, standalone check functions (what the
 * check computes and returns); Section 06 decides which pass calls what and
 * owns registering the three NEW finding kinds these checks produce
 * (`clue_overload`, `missing_anchor_line`) plus the deterministic co-signal
 * for the EXISTING `unnatural_dialogue_language` kind
 * (`detectUnnaturalRegisterContribution`).
 *
 * Every finding below is `VdDramaturgyFinding`-shaped (`{ kind,
 * evidenceEpisodes, detail }`, matching `verticalDramaStoryBible.ts`'s own
 * shape) but is typed with a LOCAL kind union here rather than importing
 * `VdSeasonCritiqueFindingKind` — `clue_overload`/`missing_anchor_line` are
 * not registered on `VD_SEASON_CRITIQUE_FINDING_KINDS` yet (that registration
 * is Section 06's), so importing the real union would be a type error for
 * every finding this module produces until Section 06 lands.
 *
 * Pure, code-only, NO LLM call — mirrors `verticalDramaStoryBible.ts`'s own
 * "(5) antagonist-tactic variety"/"(7) on-the-nose dialogue" style
 * (iterate drafted episodes, count via a shared primitive, push a finding
 * above a threshold).
 */

import {
  QUALITY_CRITERIA_CLUE_BUDGET_PER_SHOT,
  QUALITY_CRITERIA_ANCHOR_LINE_MAX_GAP_SHOTS,
} from "@shared/verticalDramaSeries/qualityCriteria";
import { detectWrittenRegisterConnectives } from "@shared/verticalDramaSeries/dialogueRegisterRules";
import type { VerticalDramaSeriesLocale } from "@shared/verticalDramaSeries";

/**
 * Finding kind union this module's checks produce. `unnatural_dialogue_language`
 * is already registered on `VD_SEASON_CRITIQUE_FINDING_KINDS`
 * (`verticalDramaStoryBible.ts`) — this module supplies a deterministic
 * CO-SIGNAL for it, never a replacement for the LLM judgment. `clue_overload`/
 * `missing_anchor_line` are NOT yet registered there; Section 06 registers
 * both when it wires these checks in.
 */
export type VdDialogueCheckFindingKind =
  | "clue_overload"
  | "missing_anchor_line"
  | "unnatural_dialogue_language";

/** `VdDramaturgyFinding`-shaped (see this module's file-level doc comment for why this is a local type, not an import). */
export type VdDialogueCheckFinding = {
  kind: VdDialogueCheckFindingKind;
  evidenceEpisodes: number[];
  detail: string;
};

/** One shot's Section 04 scene-contract fields this module's checks consult — `null`-safe/optional so both checks degrade gracefully when Section 04 has not landed for a given shot/episode. */
export type VdDialogueCheckShotContract = {
  shotNumber: number;
  newClueIds?: string[] | null;
  anchorLine?: boolean | null;
};

/** One episode's shots, for the two contract-driven checks below. */
export type VdDialogueCheckEpisode = {
  episodeNumber: number;
  shots: VdDialogueCheckShotContract[];
};

/**
 * Clue-budget check (spec §7.1): flags every shot whose
 * `contract.newClueIds` exceeds `QUALITY_CRITERIA_CLUE_BUDGET_PER_SHOT`
 * (Section 01's single source of truth for the budget constant — never
 * re-declared here). A shot with no `newClueIds` (or an empty array) never
 * fires. Returns `[]` for an episode list with no shots carrying contract
 * data at all.
 */
export function checkClueOverload(episodes: VdDialogueCheckEpisode[]): VdDialogueCheckFinding[] {
  const findings: VdDialogueCheckFinding[] = [];
  for (const episode of episodes) {
    for (const shot of episode.shots) {
      const clueCount = shot.newClueIds?.length ?? 0;
      if (clueCount > QUALITY_CRITERIA_CLUE_BUDGET_PER_SHOT) {
        findings.push({
          kind: "clue_overload",
          evidenceEpisodes: [episode.episodeNumber],
          detail: `ตอนที่ ${episode.episodeNumber} ช็อตที่ ${shot.shotNumber} มีเบาะแสใหม่ ${clueCount} รายการ เกินงบประมาณ ${QUALITY_CRITERIA_CLUE_BUDGET_PER_SHOT} รายการต่อช็อต`,
        });
      }
    }
  }
  return findings;
}

/**
 * Anchor-line cadence check (spec §7.1): flags an episode whose max run of
 * CONSECUTIVE shots (in shot-number order) with no `contract.anchorLine ===
 * true` exceeds `QUALITY_CRITERIA_ANCHOR_LINE_MAX_GAP_SHOTS` (Section 01's
 * single source of truth — never re-declared here). An episode with no
 * shots carrying contract data at all never fires (nothing to measure).
 */
export function checkMissingAnchorLine(
  episodes: VdDialogueCheckEpisode[],
): VdDialogueCheckFinding[] {
  const findings: VdDialogueCheckFinding[] = [];
  for (const episode of episodes) {
    if (episode.shots.length === 0) continue;
    const sorted = [...episode.shots].sort((a, b) => a.shotNumber - b.shotNumber);
    let max = 0;
    let current = 0;
    for (const shot of sorted) {
      if (shot.anchorLine === true) {
        current = 0;
      } else {
        current += 1;
        if (current > max) max = current;
      }
    }
    if (max > QUALITY_CRITERIA_ANCHOR_LINE_MAX_GAP_SHOTS) {
      findings.push({
        kind: "missing_anchor_line",
        evidenceEpisodes: [episode.episodeNumber],
        detail: `ตอนที่ ${episode.episodeNumber} มีช่วงที่ไม่มีบทหลัก (anchor line) ติดต่อกัน ${max} ช็อต เกินเกณฑ์ ${QUALITY_CRITERIA_ANCHOR_LINE_MAX_GAP_SHOTS} ช็อต`,
      });
    }
  }
  return findings;
}

/** One episode's flattened dialogue line texts, for the register-connective density check below. */
export type VdDialogueCheckEpisodeLines = {
  episodeNumber: number;
  lines: string[];
};

/**
 * Density threshold (occurrences per total line) above which an episode's
 * written-register-connective density contributes a deterministic
 * `unnatural_dialogue_language` co-signal (spec §7.1 spoken register) —
 * mirrors `verticalDramaStoryBible.ts`'s own
 * `VD_DRAMATURGY_ABSTRACT_WORD_DENSITY_THRESHOLD` convention (a distinct
 * constant, since this is a different signal: register violations, not
 * abstract-noun density).
 */
export const VD_UNNATURAL_REGISTER_DENSITY_THRESHOLD = 0.08;

/**
 * Deterministic co-signal for the EXISTING `unnatural_dialogue_language`
 * finding kind (spec §7.1 spoken register) — mirrors
 * `verticalDramaStoryBible.ts`'s "(7) on-the-nose dialogue" block's exact
 * style: count total lines and written-register-connective matches (via
 * `dialogueRegisterRules.ts`'s `detectWrittenRegisterConnectives`, never
 * re-declared here) across the given episodes, and push ONE finding when the
 * overall density exceeds `VD_UNNATURAL_REGISTER_DENSITY_THRESHOLD`, naming
 * every episode that contributed a match. This is a raw, independently
 * testable CONTRIBUTION only — Section 06 owns merging this with the LLM
 * critic's own `unnatural_dialogue_language` judgment (dedupe by episode)
 * inside `analyzeSeasonDramaturgy`.
 */
export function detectUnnaturalRegisterContribution(
  episodes: VdDialogueCheckEpisodeLines[],
  locale: VerticalDramaSeriesLocale,
): VdDialogueCheckFinding[] {
  let totalLines = 0;
  let matchedLines = 0;
  const episodesWithMatches = new Set<number>();

  for (const episode of episodes) {
    for (const line of episode.lines) {
      totalLines += 1;
      const matches = detectWrittenRegisterConnectives(line, locale);
      if (matches.length > 0) {
        matchedLines += 1;
        episodesWithMatches.add(episode.episodeNumber);
      }
    }
  }

  if (totalLines === 0) return [];

  const density = matchedLines / totalLines;
  if (density <= VD_UNNATURAL_REGISTER_DENSITY_THRESHOLD) return [];

  const evidenceEpisodes = [...episodesWithMatches].sort((a, b) => a - b);
  return [
    {
      kind: "unnatural_dialogue_language",
      evidenceEpisodes,
      detail: `บทพูดใช้คำเชื่อมแบบภาษาเขียน (เช่น อย่างไรก็ตาม/ดังนั้น/เนื่องจาก) แทนที่จะเป็นภาษาพูดตามธรรมชาติ: พบ ${matchedLines} บรรทัดจาก ${totalLines} บรรทัด (${(density * 100).toFixed(1)}%)`,
    },
  ];
}
