import {
  startFeature186SystemSchedule,
  stopFeature186SystemSchedule,
  utcMinuteOccurrence,
} from "./feature186SystemScheduler";

const SCHEDULE_ID = "spec231-inference-settlement-recovery";
const JOB_TYPE = "llm.inference_settlement_sweep";

export async function initializeInferenceSettlementRecoveryJob(): Promise<void> {
  startFeature186SystemSchedule({
    scheduleId: SCHEDULE_ID,
    jobType: JOB_TYPE,
    executionClass: "short",
    priority: 80,
    scheduleVersion: "1",
    timezone: "UTC",
    missedOccurrencePolicy: "coalesce",
    isDue: now => now.getUTCMinutes() % 5 === 0,
    occurrenceKey: now => utcMinuteOccurrence(now, 5),
    intervalMs: 60_000,
  });
}

export function shutdownInferenceSettlementRecoveryJob(): void {
  stopFeature186SystemSchedule(SCHEDULE_ID);
}
