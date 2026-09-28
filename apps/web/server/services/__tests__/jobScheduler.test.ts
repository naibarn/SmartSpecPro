import { describe, expect, it } from "vitest";

import { buildScheduleOccurrenceKey, validateScheduleOccurrence } from "../jobScheduler";

describe("job scheduler contract", () => {
  it("builds the same occurrence identity in the declared timezone", () => {
    const input = { scheduleId: "daily-cleanup", scheduleVersion: "v1", timezone: "Asia/Bangkok", occurrenceAt: "2026-09-13T00:30:00.000Z" };
    expect(buildScheduleOccurrenceKey(input)).toBe("daily-cleanup:v1:2026-09-13T07-30");
    expect(buildScheduleOccurrenceKey(input)).toBe(buildScheduleOccurrenceKey(input));
  });

  it("rejects cross-tenant and out-of-window occurrences", () => {
    expect(() => validateScheduleOccurrence({
      tenantId: "tenant-b",
      expectedTenantId: "tenant-a",
      scheduleId: "schedule-1",
      scheduleVersion: "v1",
      timezone: "UTC",
      missedOccurrencePolicy: "skip",
      occurrenceAt: "2026-09-13T00:00:00.000Z",
    })).toThrowError(expect.objectContaining({ code: "SCHEDULE_TENANT_MISMATCH" }));
    expect(() => validateScheduleOccurrence({
      tenantId: "tenant-a",
      expectedTenantId: "tenant-a",
      scheduleId: "schedule-1",
      scheduleVersion: "v1",
      timezone: "UTC",
      missedOccurrencePolicy: "catch_up",
      occurrenceAt: "2026-09-15T00:00:00.000Z",
      windowEndAt: "2026-09-14T00:00:00.000Z",
    })).toThrowError(expect.objectContaining({ code: "SCHEDULE_OCCURRENCE_INVALID" }));
  });

  it("normalizes an omitted occurrence key without changing schedule policy", () => {
    expect(validateScheduleOccurrence({
      tenantId: "tenant-a",
      expectedTenantId: "tenant-a",
      scheduleId: "billing",
      scheduleVersion: "2026-09",
      timezone: "UTC",
      missedOccurrencePolicy: "coalesce",
      occurrenceAt: "2026-09-13T04:05:00.000Z",
    })).toEqual({
      scheduleId: "billing",
      occurrenceKey: "billing:2026-09:2026-09-13T04-05",
      scheduleVersion: "2026-09",
      timezone: "UTC",
      missedOccurrencePolicy: "coalesce",
    });
  });
});
