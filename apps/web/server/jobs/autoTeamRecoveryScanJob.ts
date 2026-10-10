import {
  startFeature186SystemSchedule,
  stopFeature186SystemSchedule,
  utcMinuteOccurrence,
} from "./feature186SystemScheduler";

export const AUTO_TEAM_RECOVERY_SCAN_JOB_TYPE = "auto-team.recovery.scan";
export const AUTO_TEAM_RECOVERY_SCAN_SCHEDULE_ID = "auto-team-recovery-scan";

export function initializeAutoTeamRecoveryScanJob(): void {
  startFeature186SystemSchedule({
    scheduleId: AUTO_TEAM_RECOVERY_SCAN_SCHEDULE_ID,
    jobType: AUTO_TEAM_RECOVERY_SCAN_JOB_TYPE,
    executionClass: "short",
    priority: 20,
    scheduleVersion: "1",
    timezone: "UTC",
    missedOccurrencePolicy: "coalesce",
    isDue: () => true,
    occurrenceKey: now => utcMinuteOccurrence(now, 5),
    intervalMs: 60_000,
  });
}

export function shutdownAutoTeamRecoveryScanJob(): void {
  stopFeature186SystemSchedule(AUTO_TEAM_RECOVERY_SCAN_SCHEDULE_ID);
}
