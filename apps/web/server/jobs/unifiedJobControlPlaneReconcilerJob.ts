import { runJobReconciler } from "../services/jobReconciler";
import { createFeature186RuntimeAdapter } from "../services/feature186RuntimeAdapter";
import { isPostgresNodeJobType } from "./feature186JobTypes";
import { createPostgresProviderSchedulerRepository } from "../services/postgresProviderSchedulerRepository";
import { runProviderPollerOnce } from "../services/providerPollerService";
import { createPythonProviderPollClient } from "../services/pythonProviderPollClient";
import { assertGoogleRuntimeDisabled, isFeature186HardCutoverEnabled } from "../services/cloudflareRuntimeTarget";

const INTERVAL_MS = 2 * 60 * 1000;
let intervalId: ReturnType<typeof setInterval> | null = null;

export async function runUnifiedJobControlPlaneReconcilerOnce(now = new Date()) {
  const activeAdapter = createFeature186RuntimeAdapter();
  const postgresPythonPullEnabled = isFeature186HardCutoverEnabled()
    && process.env.FEATURE_186_POSTGRES_PYTHON_WORKER === "true";
  if (isFeature186HardCutoverEnabled()) assertGoogleRuntimeDisabled();
  const result = await runJobReconciler({
    now,
    limit: 100,
    adapters: new Map([
      ["node_job_worker", activeAdapter],
      ["cloudflare", activeAdapter],
      ...(postgresPythonPullEnabled ? [["python_job_worker", activeAdapter] as const] : []),
    ]),
    resolveAdapter: row => {
      if (isPostgresNodeJobType(row.jobType) || row.runtimeType === "node_job_worker") return activeAdapter;
      if (postgresPythonPullEnabled && row.runtimeType === "python_job_worker") return activeAdapter;
      // The web runtime's live outbox runner owns compatibility adapters. A
      // reconciler pass must leave those rows recoverable instead of
      // quarantining them merely because this process has no broker binding.
      return undefined;
    },
  });
  if (
    result.waitingCancelled > 0 ||
    result.waitingResumed > 0 ||
    result.waitingFailedForReview > 0 ||
    result.reconciliationErrors > 0
  ) {
    console.info("[Feature186] self-healing reconciliation decisions", {
      scanned: result.waitingDecisionsScanned,
      cancelled: result.waitingCancelled,
      resumed: result.waitingResumed,
      failedForReview: result.waitingFailedForReview,
      held: result.waitingHeld,
      pending: result.waitingPending,
      errors: result.reconciliationErrors,
      decisions: result.decisions.slice(0, 20),
    });
  }
  if (process.env.FEATURE_186_PROVIDER_POLLER === "true") {
    const providerRepository = createPostgresProviderSchedulerRepository();
    const providerPoller = await runProviderPollerOnce({
      repository: providerRepository,
      clients: new Map([
        ["kie_ai", createPythonProviderPollClient("kie_ai")],
        ["wavespeed_ai", createPythonProviderPollClient("wavespeed_ai")],
      ]),
      now,
      limit: 100,
    });
    return { ...result, providerPoller };
  }
  return result;
}
export async function initializeUnifiedJobControlPlaneReconcilerJob() {
  const enabled = process.env.FEATURE_186_HARD_CUTOVER === "true"
    || process.env.FEATURE_186_RECONCILER === "true";
  if (!enabled || intervalId) return;
  await runUnifiedJobControlPlaneReconcilerOnce().catch(error => {
    console.error("[Feature186] initial reconciler run failed:", error);
  });
  intervalId = setInterval(() => {
    runUnifiedJobControlPlaneReconcilerOnce().catch(error => {
      console.error("[Feature186] periodic reconciler run failed:", error);
    });
  }, INTERVAL_MS);
}

export function shutdownUnifiedJobControlPlaneReconcilerJob() {
  if (!intervalId) return;
  clearInterval(intervalId);
  intervalId = null;
}
