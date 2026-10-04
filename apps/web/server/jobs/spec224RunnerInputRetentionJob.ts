import { executeSpec224RunnerInputRetention } from "../services/spec224RunnerInputRetentionService";
import {
  startFeature186SystemSchedule,
  stopFeature186SystemSchedule,
  utcDailyDue,
} from "./feature186SystemScheduler";

const SCHEDULE_ID = "spec224-runner-input-retention";
const JOB_TYPE = "spec224.runner_input_retention";

export async function executeSpec224RunnerInputRetentionJob() {
  const result = await executeSpec224RunnerInputRetention();
  const deleted = result.deletedOrphanSources + result.deletedTerminalSources + result.deletedAttemptInputs;
  if (deleted > 0) console.info("[Spec224InputRetention] cleanup complete", result);
  return result;
}

export async function initializeSpec224RunnerInputRetentionJob(): Promise<void> {
  startFeature186SystemSchedule({
    scheduleId: SCHEDULE_ID,
    jobType: JOB_TYPE,
    executionClass: "short",
    priority: 100,
    scheduleVersion: "1",
    timezone: "UTC",
    missedOccurrencePolicy: "coalesce",
    isDue: utcDailyDue(2, 15),
    occurrenceKey: now => `${now.toISOString().slice(0, 10)}:spec224-runner-input-retention`,
    intervalMs: 60_000,
  });
}

export async function shutdownSpec224RunnerInputRetentionJob(): Promise<void> {
  stopFeature186SystemSchedule(SCHEDULE_ID);
}
