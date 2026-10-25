import type { JobExecutor } from "../services/jobExecutor";
import {
  startFeature186SystemSchedule,
  stopFeature186SystemSchedule,
  utcMinuteOccurrence,
} from "./feature186SystemScheduler";

export const MINI_APP_FACTORY_RECOVERY_SWEEP_JOB_TYPE = "mini_app_factory.recovery_sweep";
export const MINI_APP_FACTORY_RECOVERY_SWEEP_CONTRACT = "mini-app-factory-recovery-sweep-v1";
const SCHEDULE_ID = "spec224-mini-app-factory-recovery";

export async function initializeMiniAppFactoryRecoveryJob(): Promise<void> {
  startFeature186SystemSchedule({
    scheduleId: SCHEDULE_ID,
    jobType: MINI_APP_FACTORY_RECOVERY_SWEEP_JOB_TYPE,
    executionClass: "short",
    priority: 85,
    scheduleVersion: "1",
    timezone: "UTC",
    missedOccurrencePolicy: "coalesce",
    isDue: () => true,
    occurrenceKey: now => utcMinuteOccurrence(now, 1),
    intervalMs: 60_000,
  });
}

export function shutdownMiniAppFactoryRecoveryJob(): void {
  stopFeature186SystemSchedule(SCHEDULE_ID);
}

export const executeMiniAppFactoryRecoverySweep: JobExecutor = async ({
  context,
  lease,
  reporter,
}) => {
  if (context.contractVersion !== "feature-186-v1" || Object.keys(context.input).length !== 0) {
    throw new Error("MINI_APP_FACTORY_RECOVERY_SWEEP_INPUT_INVALID");
  }
  await reporter.assertActive(lease);
  const factory = await import("../services/miniAppFactoryStageWorker");
  const result = await factory.reconcileMiniAppFactoryStageRuns({ limit: 100 });
  await reporter.assertActive(lease);
  return { output: { ...result, sweepContract: MINI_APP_FACTORY_RECOVERY_CONTRACT } };
};
