import type { JobExecutor } from "./jobExecutor";
import * as runEngine from "./runEngine";
import { sweepPendingAutoTeamRuns } from "./autoTeamRecoveryService";
import {
  fingerprintAutoTeamRecoveryState,
  parseAutoTeamRecoveryEvaluationInput,
} from "./autoTeamRecoveryEvaluationJob";

/** Leased worker entry point; all execution/recovery decisions stay in runEngine. */
export const executeAutoTeamRecoveryEvaluation: JobExecutor = async ({
  context,
  lease,
  reporter,
}) => {
  const input = parseAutoTeamRecoveryEvaluationInput(context.input);
  if (!input) {
    throw Object.assign(new Error("AUTO_TEAM_RECOVERY_ENVELOPE_INVALID"), {
      class: "permanent",
    });
  }

  await reporter.assertActive(lease);
  await reporter.progress(lease, {
    progress: 10,
    stage: "evaluating",
    message: "Checking the latest task state and recovery eligibility.",
  });

  const run = await runEngine.getRun(input.runId, context.tenantId).catch(() => null);
  if (!run) {
    return { output: { outcome: "stale_run", runId: input.runId } };
  }
  if (fingerprintAutoTeamRecoveryState(run) !== input.stateFingerprint) {
    return { output: { outcome: "stale_evaluation", runId: input.runId } };
  }

  await reporter.assertActive(lease);
  let active = true;
  const heartbeat = setInterval(() => {
    if (!active) return;
    void reporter.heartbeat(lease).catch(error => {
      console.warn("[auto-team-recovery] evaluation heartbeat failed", {
        jobId: lease.jobId,
        error: error instanceof Error ? error.message.slice(0, 300) : "unknown_error",
      });
    });
  }, 15_000);
  heartbeat.unref?.();
  let resumed: number;
  try {
    resumed = await sweepPendingAutoTeamRuns({
      onlyRunId: input.runId,
      expectedStateFingerprint: input.stateFingerprint,
    });
  } finally {
    active = false;
    clearInterval(heartbeat);
  }
  await reporter.assertActive(lease);

  const afterRun = resumed > 0
    ? await runEngine.getRun(input.runId, context.tenantId).catch(() => null)
    : run;
  const recoveryVerified = Boolean(
    resumed > 0 &&
    afterRun &&
    fingerprintAutoTeamRecoveryState(afterRun) !== input.stateFingerprint,
  );

  const waitReason = run.status === "paused"
    ? run.stopReason === "awaiting_async_media_pipeline"
      ? "provider_job"
      : ["awaiting_human_choice", "awaiting_final_approval"].includes(run.stopReason ?? "")
        ? "approval_or_user_input"
        : ["auto_team_final_evidence_unresolved", "auto_team_media_final_evidence_unresolved"].includes(run.stopReason ?? "")
          ? "dependency_evidence"
          : null
    : null;
  await reporter.progress(lease, {
    progress: recoveryVerified ? 100 : 90,
    stage: recoveryVerified ? "continuing" : resumed > 0 ? "recovery_pending" : waitReason ? "waiting" : "no_action",
    message: recoveryVerified
      ? "The task made progress after recovery."
      : resumed > 0
        ? "A recovery action was dispatched; its outcome is not confirmed yet."
      : waitReason
        ? "The task remains waiting on its current dependency."
        : "No authorized recovery action was ready.",
    measured: { actionsDispatched: resumed, recoveryVerified },
  });

  return {
    output: {
      outcome: recoveryVerified
        ? "recovery_verified"
        : resumed > 0
          ? "recovery_dispatched_unverified"
          : waitReason ?? "no_action",
      runId: input.runId,
      actionsDispatched: resumed,
      recoveryVerified,
    },
  };
};
