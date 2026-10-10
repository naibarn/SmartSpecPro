import { beforeEach, describe, expect, it, vi } from "vitest";

const { startSchedule, stopSchedule, minuteOccurrence } = vi.hoisted(() => ({
  startSchedule: vi.fn(),
  stopSchedule: vi.fn(),
  minuteOccurrence: vi.fn((now: Date, bucket: number) =>
    `${now.toISOString()}:${bucket}`,
  ),
}));

vi.mock("./feature186SystemScheduler", () => ({
  startFeature186SystemSchedule: startSchedule,
  stopFeature186SystemSchedule: stopSchedule,
  utcMinuteOccurrence: minuteOccurrence,
}));

import {
  AUTO_TEAM_RECOVERY_SCAN_JOB_TYPE,
  AUTO_TEAM_RECOVERY_SCAN_SCHEDULE_ID,
  initializeAutoTeamRecoveryScanJob,
  shutdownAutoTeamRecoveryScanJob,
} from "./autoTeamRecoveryScanJob";

describe("AutoTeam recovery scan schedule", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a coalesced five-minute canonical scan occurrence", () => {
    initializeAutoTeamRecoveryScanJob();
    const schedule = startSchedule.mock.calls[0]?.[0];

    expect(schedule).toMatchObject({
      scheduleId: AUTO_TEAM_RECOVERY_SCAN_SCHEDULE_ID,
      jobType: AUTO_TEAM_RECOVERY_SCAN_JOB_TYPE,
      executionClass: "short",
      scheduleVersion: "1",
      timezone: "UTC",
      missedOccurrencePolicy: "coalesce",
      intervalMs: 60_000,
    });
    expect(schedule.occurrenceKey(new Date("2026-10-10T08:02:00.000Z")))
      .toBe("2026-10-10T08:02:00.000Z:5");
    expect(minuteOccurrence).toHaveBeenCalledWith(
      new Date("2026-10-10T08:02:00.000Z"),
      5,
    );
  });

  it("stops the canonical schedule during shutdown", () => {
    shutdownAutoTeamRecoveryScanJob();
    expect(stopSchedule).toHaveBeenCalledWith(AUTO_TEAM_RECOVERY_SCAN_SCHEDULE_ID);
  });
});
