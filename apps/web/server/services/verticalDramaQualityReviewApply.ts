/**
 * Vertical Drama Series — "อนุมัติและปรับเรื่องตามคำแนะนำ" (approve quality-review
 * suggestions and auto-apply them) support: groups an episode quality
 * review's `issues[]` by the pipeline stage each issue actually targets, and
 * composes ONE combined repair instruction per affected stage.
 *
 * Pure, DB-free functions so they're cheaply unit-testable — the router
 * (`applyQualityReviewSuggestions`) is the only caller, and is responsible
 * for actually invoking `verticalDramaEpisodePipeline.repairStage(...)` per
 * grouped stage (script first, then storyboard, matching pipeline order —
 * see `VERTICAL_DRAMA_PIPELINE_STAGES`).
 */

import type { VerticalDramaPipelineStage } from "@shared/verticalDramaSeries";

/** One issue from `episodeQualityReviewOutputSchema`'s `issues[]` array. */
export interface QualityReviewIssueLike {
  location: string;
  problem: string;
  suggested_fix: string;
}

/**
 * The two pipeline stages an episode quality-review issue can realistically
 * target. `runVerticalDramaEpisodeQualityReview` only ever reviews the
 * script + storyboard (+ optional dialogue plan, which is not independently
 * repairable via this flow), so issues are grouped into exactly these two
 * buckets — never a third "unknown" stage, since an issue whose location
 * can't be confidently parsed as beat-level defaults to the storyboard (the
 * more concrete, shot-addressable artifact, and the stage most quality
 * issues in practice reference).
 */
export type QualityReviewApplicableStage = Extract<
  VerticalDramaPipelineStage,
  "plan_episode_script" | "storyboard_shotgrid"
>;

/** Stage-repair order for `applyQualityReviewSuggestions` — script before storyboard,
 *  since the storyboard is generated FROM the script and should reflect any
 *  script-level fixes when it's (re)grounded — matches pipeline sequence order. */
export const QUALITY_REVIEW_APPLY_STAGE_ORDER: readonly QualityReviewApplicableStage[] = [
  "plan_episode_script",
  "storyboard_shotgrid",
];

/**
 * Classify a single issue's `location` string into the stage it targets.
 *
 * Recognized patterns (case-insensitive, tolerant of extra whitespace):
 *  - `"shot 7"`, `"shots 3-5"`, `"shot 3, 5"`, `"shot#7"` -> `storyboard_shotgrid`
 *    (shots are the storyboard's unit; this is also the fallback default).
 *  - `"beat 3"`, `"beats 1-2"` -> `plan_episode_script` (beats are the
 *    script's `structure.beats[]` unit).
 *  - Anything else unrecognized (e.g. "cliffhanger", "dialogue", a bare
 *    number, empty-ish text) -> `storyboard_shotgrid` (tolerant default per
 *    task spec: "unknown locations -> default storyboard").
 */
export function classifyQualityReviewIssueLocation(
  location: string,
): QualityReviewApplicableStage {
  const normalized = (location ?? "").toLowerCase();
  // Check "beat" before "shot" — a location could theoretically mention both,
  // but beats are the more specific/rarer signal for the script stage, and no
  // known fixture ever mixes the two in one location string.
  if (/\bbeats?\b/.test(normalized)) return "plan_episode_script";
  if (/\bshots?\b/.test(normalized)) return "storyboard_shotgrid";
  return "storyboard_shotgrid";
}

export interface GroupedQualityReviewIssues {
  stage: QualityReviewApplicableStage;
  issues: QualityReviewIssueLike[];
}

/**
 * Group ALL issues by their classified stage, preserving each issue's
 * original order within its group. Stages with zero issues are omitted
 * entirely (nothing to repair for that stage) — the router only invokes
 * `repairStage` for stages present in this result.
 */
export function groupQualityReviewIssuesByStage(
  issues: QualityReviewIssueLike[],
): GroupedQualityReviewIssues[] {
  const byStage = new Map<QualityReviewApplicableStage, QualityReviewIssueLike[]>();
  for (const issue of issues) {
    const stage = classifyQualityReviewIssueLocation(issue.location);
    const bucket = byStage.get(stage);
    if (bucket) bucket.push(issue);
    else byStage.set(stage, [issue]);
  }
  // Always return in canonical pipeline order (script before storyboard),
  // regardless of the Map's insertion order.
  return QUALITY_REVIEW_APPLY_STAGE_ORDER.filter(stage => byStage.has(stage)).map(stage => ({
    stage,
    issues: byStage.get(stage)!,
  }));
}

/**
 * Compose ONE combined Thai repair instruction from a stage's grouped
 * issues, in the format the task brief specifies: "แก้ตามคำแนะนำต่อไปนี้:"
 * followed by one line per issue naming its location/problem/suggested fix,
 * so a single `repairStage` call addresses every issue affecting that stage
 * at once (rather than one repair run per issue).
 */
export function composeQualityReviewRepairInstruction(
  issues: QualityReviewIssueLike[],
): string {
  const lines = issues.map(
    issue => `- [${issue.location}] ปัญหา: ${issue.problem} -> แก้ไข: ${issue.suggested_fix}`,
  );
  return ["แก้ตามคำแนะนำต่อไปนี้:", ...lines].join("\n");
}
