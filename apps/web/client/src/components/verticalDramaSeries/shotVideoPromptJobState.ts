export type ShotVideoPromptJobUiStatus = "queued" | "running";

type ShotVideoPromptJobProjection = {
  shotNumber: number;
  status: "queued" | "running" | "succeeded" | "failed";
};

export function reconcileShotVideoPromptJobUiState(params: {
  jobs: readonly ShotVideoPromptJobProjection[];
  locallyPollingShots: ReadonlySet<number>;
  previousStatusByShot: Readonly<Record<number, ShotVideoPromptJobUiStatus>>;
}): {
  statusByShot: Record<number, ShotVideoPromptJobUiStatus>;
  generatingShots: Set<number>;
} {
  const statusByShot: Record<number, ShotVideoPromptJobUiStatus> = {};
  const generatingShots = new Set<number>();

  for (const job of params.jobs) {
    if (job.status !== "queued" && job.status !== "running") continue;
    statusByShot[job.shotNumber] = job.status;
    generatingShots.add(job.shotNumber);
  }

  // The active-job query can briefly lag immediately after submission. Keep
  // only jobs this browser is still polling; every other stale status is
  // removed when the server no longer reports it as active.
  for (const shotNumber of params.locallyPollingShots) {
    statusByShot[shotNumber] =
      params.previousStatusByShot[shotNumber] ?? "queued";
    generatingShots.add(shotNumber);
  }

  return { statusByShot, generatingShots };
}
