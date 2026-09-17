import { cleanupWorkerHeartbeatRetention } from "../services/workerHeartbeatRetentionService";
import {
  startFeature186SystemSchedule,
  stopFeature186SystemSchedule,
  utcDailyDue,
} from "./feature186SystemScheduler";

const SCHEDULE_ID = "worker-heartbeat-retention";
const JOB_TYPE = "worker.heartbeat_retention";

export async function executeWorkerHeartbeatRetention() {
  const result = await cleanupWorkerHeartbeatRetention();
  if (result.deletedHeartbeats > 0) {
    console.info("[WorkerHeartbeatRetention] cleanup complete", result);
  }
  return result;
}

export async function initializeWorkerHeartbeatRetentionJob(): Promise<void> {
  if (process.env.FEATURE_186_HARD_CUTOVER !== "true") return;

  startFeature186SystemSchedule({
    scheduleId: SCHEDULE_ID,
    jobType: JOB_TYPE,
    executionClass: "short",
    priority: 100,
    scheduleVersion: "1",
    timezone: "UTC",
    missedOccurrencePolicy: "coalesce",
    isDue: utcDailyDue(1, 30),
    occurrenceKey: now =>
      `${now.toISOString().slice(0, 10)}:heartbeat-retention`,
    intervalMs: 60_000,
  });
}

export async function shutdownWorkerHeartbeatRetentionJob(): Promise<void> {
  stopFeature186SystemSchedule(SCHEDULE_ID);
}
