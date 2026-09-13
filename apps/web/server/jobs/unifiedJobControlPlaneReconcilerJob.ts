import { runJobReconciler } from "../services/jobReconciler";

const INTERVAL_MS = 2 * 60 * 1000;
let intervalId: ReturnType<typeof setInterval> | null = null;

export async function runUnifiedJobControlPlaneReconcilerOnce(now = new Date()) {
  return runJobReconciler({ now, limit: 100 });
}
export async function initializeUnifiedJobControlPlaneReconcilerJob() {
  if (process.env.FEATURE_186_RECONCILER !== "true" || intervalId) return;
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
