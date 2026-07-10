/**
 * Vertical Drama Series — Feature 132 multi-pass season QC foundations.
 *
 * Pure dispatch/check layer for the six-pass critique runner. The runtime
 * fan-out can call these functions before each focused LLM pass; keeping the
 * deterministic checks here avoids scattering Section 06 continuity logic
 * through the already-large story-bible service.
 */

import type {
  VerticalDramaCausalChainMapEntry,
  VerticalDramaQualityLedgers,
  VerticalDramaStoryState,
} from "@shared/verticalDramaSeries/qualityLedgers";
import {
  meetsPremiumDraftContractFloor,
  type VdDramaturgyFinding,
  type VdSeasonCritiqueFindingKind,
  type VdDeepDraftShotDraft,
} from "./verticalDramaStoryBible";

export const VD_SEASON_QC_PASSES = [
  "structure",
  "character",
  "evidence",
  "threat",
  "dialogue",
  "continuity",
] as const;

export type VdSeasonQcPassName = (typeof VD_SEASON_QC_PASSES)[number];

export type VdSeasonQcSeverity = "minor" | "moderate" | "major" | "structural";

export type VdSeasonQcFinding = VdDramaturgyFinding & {
  severity?: VdSeasonQcSeverity;
};

type FindingKind = VdSeasonCritiqueFindingKind | string;

function finding(
  kind: FindingKind,
  evidenceEpisodes: number[],
  detail: string,
  severity: VdSeasonQcSeverity = "moderate",
): VdSeasonQcFinding {
  return {
    kind: kind as VdSeasonCritiqueFindingKind,
    evidenceEpisodes,
    detail,
    severity,
  };
}

function norm(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function lexicalOverlap(a: string, b: string): number {
  const aWords = new Set(norm(a).split(/\s+/).filter((w) => w.length >= 2));
  const bWords = new Set(norm(b).split(/\s+/).filter((w) => w.length >= 2));
  if (aWords.size === 0 || bWords.size === 0) return 0;
  let overlap = 0;
  for (const word of aWords) {
    if (bWords.has(word)) overlap += 1;
  }
  return overlap;
}

type CausalChainWithContinuity = VerticalDramaCausalChainMapEntry & {
  requiredNextOpeningResponse?: unknown;
  causedByPrevious?: unknown;
  consequenceForcingNext?: unknown;
};

export type VdSeasonQcEpisodeOpening = {
  episodeNumber: number;
  openingText: string;
};

export function checkHookAnsweredInOpening(
  causalChainMap: CausalChainWithContinuity[],
  openings: VdSeasonQcEpisodeOpening[],
): VdSeasonQcFinding[] {
  const openingByEpisode = new Map(openings.map((o) => [o.episodeNumber, o.openingText]));
  const findings: VdSeasonQcFinding[] = [];

  for (const row of causalChainMap) {
    const required = typeof row.requiredNextOpeningResponse === "string" ? row.requiredNextOpeningResponse : "";
    if (!required.trim()) continue;
    const lastEpisode = Math.max(...(row.episodes ?? []));
    if (!Number.isFinite(lastEpisode) || lastEpisode <= 0) continue;
    const nextEpisode = lastEpisode + 1;
    const openingText = openingByEpisode.get(nextEpisode) ?? "";
    if (lexicalOverlap(required, openingText) === 0) {
      findings.push(
        finding(
          "hook_not_answered_in_opening",
          [nextEpisode],
          `ตอนที่ ${nextEpisode} เปิดตอนไม่รับไม้จากคำตอบที่ต้องตามมาของตอนที่ ${lastEpisode}: "${required}"`,
          "major",
        ),
      );
    }
  }

  return findings;
}

export function checkEpisodeReplaceable(
  causalChainMap: CausalChainWithContinuity[],
): VdSeasonQcFinding[] {
  return causalChainMap
    .filter((row) => {
      const causedByPrevious = typeof row.causedByPrevious === "string" ? row.causedByPrevious.trim() : "";
      const consequenceForcingNext =
        typeof row.consequenceForcingNext === "string" ? row.consequenceForcingNext.trim() : "";
      return causedByPrevious.length === 0 && consequenceForcingNext.length === 0;
    })
    .map((row) =>
      finding(
        "episode_replaceable",
        row.episodes ?? [],
        `เส้นเหตุผล "${row.description}" ไม่ชี้ว่าตอนนี้เกิดจากตอนก่อนหน้า หรือบังคับตอนถัดไปอย่างไร`,
        "structural",
      ),
    );
}

export function checkKnowledgeContinuityBreak(
  states: VerticalDramaStoryState[],
): VdSeasonQcFinding[] {
  const ordered = [...states].sort((a, b) => a.episode - b.episode);
  const findings: VdSeasonQcFinding[] = [];
  for (let i = 1; i < ordered.length; i += 1) {
    const previousFacts = new Set(ordered[i - 1].knownByProtagonist);
    const currentFacts = new Set(ordered[i].knownByProtagonist);
    const lostFacts = [...previousFacts].filter((fact) => !currentFacts.has(fact));
    if (lostFacts.length > 0) {
      findings.push(
        finding(
          "knowledge_continuity_break",
          [ordered[i].episode],
          `ความรู้ของตัวเอกจากตอนก่อนหน้าหายไปโดยไม่มีเหตุในเรื่อง: ${lostFacts.join(", ")}`,
          "major",
        ),
      );
    }
  }
  return findings;
}

export function checkEmotionalResidueReset(
  states: VerticalDramaStoryState[],
): VdSeasonQcFinding[] {
  const ordered = [...states].sort((a, b) => a.episode - b.episode);
  const findings: VdSeasonQcFinding[] = [];
  for (let i = 1; i < ordered.length; i += 1) {
    const prior = new Set(
      ordered[i - 1].emotionalResidue.map((r) => `${r.character}:${r.residue}`),
    );
    const current = new Set(ordered[i].emotionalResidue.map((r) => `${r.character}:${r.residue}`));
    const reset = [...prior].filter((entry) => !current.has(entry));
    if (reset.length > 0) {
      findings.push(
        finding(
          "emotional_residue_reset",
          [ordered[i].episode],
          `อารมณ์ค้างจากตอนก่อนหน้าถูกรีเซ็ตโดยไม่มีเหตุรองรับ: ${reset.join(", ")}`,
          "moderate",
        ),
      );
    }
  }
  return findings;
}

export function checkWorldRuleConsistency(
  ledgers: Pick<VerticalDramaQualityLedgers, "worldRuleLedger">,
): VdSeasonQcFinding[] {
  return ledgers.worldRuleLedger
    .filter((row) => row.verdict === "revise")
    .map((row) =>
      finding(
        "world_rules_undefined",
        [row.introducedEpisode, ...row.usedAgainEpisodes],
        `กฎโลก "${row.rule}" ต้องปรับ: ถูกใช้ซ้ำ ${row.usedAgainEpisodes.length} ครั้ง และ createsChoice=${row.createsChoice}`,
        "major",
      ),
    );
}

export function checkWantObstacleChoiceCostCoverage(
  episodeNumber: number,
  shotDrafts: VdDeepDraftShotDraft[],
): VdSeasonQcFinding[] {
  return meetsPremiumDraftContractFloor(shotDrafts)
    ? []
    : [
        finding(
          "info_heavy_low_action",
          [episodeNumber],
          "ช็อตของตอนนี้ยังไม่ครอบคลุม want/obstacle/choice/cost ตาม scene contract floor",
          "major",
        ),
      ];
}

export const VD_SEASON_QC_DETERMINISTIC_DISPATCH = {
  structure: ["checkWantObstacleChoiceCostCoverage"],
  character: [
    "character_agency_zero_decisions",
    "voices_too_similar",
    "cast_visually_similar:TODO_SECTION_09",
  ],
  evidence: ["evidence_orphaned", "evidence_no_resistance", "evidence_no_payoff"],
  threat: ["threat_not_escalating", "antagonist_idle"],
  dialogue: ["clue_overload", "missing_anchor_line", "unnatural_dialogue_language"],
  continuity: [
    "checkHookAnsweredInOpening",
    "checkEpisodeReplaceable",
    "checkKnowledgeContinuityBreak",
    "checkEmotionalResidueReset",
    "checkWorldRuleConsistency",
    "decision_without_consequence",
    "thread_stalled",
  ],
} satisfies Record<VdSeasonQcPassName, readonly string[]>;

