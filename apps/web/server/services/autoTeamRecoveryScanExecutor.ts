import type { JobExecutor } from "./jobExecutor";
import { dispatchPendingAutoTeamEvaluations } from "./autoTeamRecoveryService";

/** Scan only enqueues per-run evaluations; runEngine remains the recovery authority. */
export const executeAutoTeamRecoveryScan: JobExecutor = async ({
  lease,
  reporter,
}) => {
  await reporter.assertActive(lease);
  await reporter.progress(lease, {
    progress: 10,
    stage: "scanning",
    message: "Checking tasks that may need recovery.",
  });

  const evaluationsQueued = await dispatchPendingAutoTeamEvaluations();

  await reporter.assertActive(lease);
  await reporter.progress(lease, {
    progress: 100,
    stage: "scanned",
    message: evaluationsQueued > 0
      ? `Queued recovery checks for ${evaluationsQueued} tasks.`
      : "No tasks need a recovery check right now.",
    measured: { evaluationsQueued },
  });
  return { output: { evaluationsQueued } };
};
