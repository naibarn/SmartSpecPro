export type StoryboardRecoveryRunLike = {
  status: string;
  job?: { status?: string | null } | null;
};

const TERMINAL_STORYBOARD_RUN_STATUSES = new Set(["succeeded", "cancelled"]);

const TERMINAL_STORYBOARD_JOB_STATUSES = new Set([
  "succeeded",
  "cancelled",
  "expired",
]);

/**
 * The recovery panel is an actionable-work projection, not a history list.
 * Canonical job state wins when an older storyboard domain row is stale.
 */
export function isRecoverableStoryboardRun(
  run: StoryboardRecoveryRunLike
): boolean {
  if (TERMINAL_STORYBOARD_RUN_STATUSES.has(run.status)) return false;
  return !TERMINAL_STORYBOARD_JOB_STATUSES.has(run.job?.status ?? "");
}

export function filterRecoverableStoryboardRuns<
  T extends StoryboardRecoveryRunLike,
>(runs: readonly T[]): T[] {
  return runs.filter(isRecoverableStoryboardRun);
}
