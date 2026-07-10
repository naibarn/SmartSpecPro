/**
 * Vertical Drama Series — Feature 132 targeted revision-plan normalizer.
 *
 * Pure utilities only: no DB, no LLM, no pipeline side effects. Executors use
 * this to choose the narrowest repair scope before calling existing repair
 * mechanisms.
 */

import { VD_QUALITY_LEDGER_KINDS } from "@shared/verticalDramaSeries/qualityLedgers";
import type {
  VerticalDramaRevisionPlanEntry,
  VerticalDramaRevisionScope,
  VerticalDramaRevisionSeverity,
} from "@shared/verticalDramaSeries/revisionPlan";

export type QualityReviewIssueForRevisionPlan = {
  location: string;
  problem: string;
  suggested_fix?: string;
  suggestedFix?: string;
  severity?: VerticalDramaRevisionSeverity;
  kind?: string;
  evidence?: string;
};

export type SeasonCritiqueFindingForRevisionPlan = {
  kind: string;
  evidenceEpisodes: number[];
  problem: string;
  fixInstruction: string;
  severity?: VerticalDramaRevisionSeverity;
  evidence?: string;
  shot?: number;
};

export function extractShotNumbersFromLocation(location: string): number[] {
  const matches = location.matchAll(/\bshots?\s*#?\s*(\d+)\b|ช็อต\s*(?:ที่)?\s*(\d+)/giu);
  return Array.from(
    new Set(
      [...matches]
        .map((match) => Number(match[1] ?? match[2]))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ).sort((a, b) => a - b);
}

function extractLineRef(location: string): string | undefined {
  const match = location.match(/\bline\s*#?\s*(\d+)\b|บรรทัด\s*(?:ที่)?\s*(\d+)/iu);
  const value = match?.[1] ?? match?.[2];
  return value ? `line:${value}` : undefined;
}

function normalizeSeverity(value: unknown): VerticalDramaRevisionSeverity {
  return value === "minor" || value === "major" || value === "structural"
    ? value
    : "moderate";
}

function affectedLedgersForKind(kind: string): string[] {
  const ledger = VD_QUALITY_LEDGER_KINDS[kind];
  return ledger ? [ledger] : [];
}

function scopeForQualityIssue(issue: QualityReviewIssueForRevisionPlan): {
  scope: VerticalDramaRevisionScope;
  shot?: number;
  lineRef?: string;
} {
  const lineRef = extractLineRef(issue.location);
  if (lineRef) return { scope: "line", lineRef };

  const [shot] = extractShotNumbersFromLocation(issue.location);
  if (shot) {
    const text = `${issue.problem} ${issue.suggested_fix ?? issue.suggestedFix ?? ""}`.toLowerCase();
    const fullShotSignals = ["camera", "frame", "visual", "action", "composition", "ภาพ", "กล้อง", "แอ็กชัน"];
    return {
      scope: fullShotSignals.some((signal) => text.includes(signal))
        ? "full_shot"
        : "shot_dialogue",
      shot,
    };
  }

  return { scope: "episode_beat" };
}

export function normalizeQualityReviewIssueToRevisionPlanEntry(
  issue: QualityReviewIssueForRevisionPlan,
  context: { episode: number; index?: number },
): VerticalDramaRevisionPlanEntry {
  const scoped = scopeForQualityIssue(issue);
  const problemKind = issue.kind ?? "quality_review_issue";
  const fixStrategy = issue.suggested_fix ?? issue.suggestedFix ?? "Repair the issue without changing locked story facts.";

  return {
    issueId: `quality:${context.episode}:${context.index ?? 0}`,
    episode: context.episode,
    ...(scoped.shot ? { shot: scoped.shot } : {}),
    ...(scoped.lineRef ? { lineRef: scoped.lineRef } : {}),
    problemKind,
    severity: normalizeSeverity(issue.severity),
    evidenceFromDraft: issue.evidence ?? issue.location,
    whyItWeakens: issue.problem,
    fixStrategy,
    affectedLedgers: affectedLedgersForKind(problemKind),
    needsRegeneration: scoped.scope !== "line",
    scope: scoped.scope,
  };
}

export function normalizeSeasonCritiqueFindingToRevisionPlanEntry(
  finding: SeasonCritiqueFindingForRevisionPlan,
  context: { index?: number },
): VerticalDramaRevisionPlanEntry {
  const episode = finding.evidenceEpisodes[0] ?? 1;
  const scope: VerticalDramaRevisionScope =
    finding.shot !== undefined
      ? "full_shot"
      : finding.evidenceEpisodes.length > 1
        ? "cross_episode"
        : "episode_outline";

  return {
    issueId: `season:${finding.kind}:${context.index ?? 0}`,
    episode,
    ...(finding.shot ? { shot: finding.shot } : {}),
    problemKind: finding.kind,
    severity: normalizeSeverity(finding.severity),
    evidenceFromDraft: finding.evidence ?? finding.problem,
    whyItWeakens: finding.problem,
    fixStrategy: finding.fixInstruction,
    affectedLedgers: affectedLedgersForKind(finding.kind),
    needsRegeneration: true,
    scope,
  };
}

export type RevisionScopeResolution =
  | { requiresApproval: false; scope: VerticalDramaRevisionScope }
  | {
      requiresApproval: true;
      proposedScope: VerticalDramaRevisionScope;
      reason: string;
    };

export function resolveRevisionScope(
  entry: VerticalDramaRevisionPlanEntry,
): RevisionScopeResolution {
  if (entry.severity === "structural") {
    return {
      requiresApproval: true,
      proposedScope: entry.scope,
      reason: "Structural findings require explicit approval before widening or applying scope.",
    };
  }
  return { requiresApproval: false, scope: entry.scope };
}

export type StoryboardWithShots<TShot extends { shot_number: number }> = {
  shots: TShot[];
} & Record<string, unknown>;

export function spliceStoryboardShots<TShot extends { shot_number: number }>(
  currentStoryboard: StoryboardWithShots<TShot>,
  revisedShots: TShot[],
): StoryboardWithShots<TShot> {
  const revisedByNumber = new Map(revisedShots.map((shot) => [shot.shot_number, shot]));
  const originalNumbers = currentStoryboard.shots.map((shot) => shot.shot_number);
  const revisedNumbers = revisedShots.map((shot) => shot.shot_number);

  for (const shotNumber of revisedNumbers) {
    if (!originalNumbers.includes(shotNumber)) {
      throw new Error(`Cannot splice unknown shot_number ${shotNumber}`);
    }
  }

  const shots = currentStoryboard.shots.map(
    (shot) => revisedByNumber.get(shot.shot_number) ?? shot,
  );

  const nextNumbers = shots.map((shot) => shot.shot_number);
  if (
    nextNumbers.length !== originalNumbers.length ||
    [...nextNumbers].sort((a, b) => a - b).join(",") !==
      [...originalNumbers].sort((a, b) => a - b).join(",")
  ) {
    throw new Error("Spliced storyboard must keep the same shot count and shot-number set");
  }

  return { ...currentStoryboard, shots };
}

