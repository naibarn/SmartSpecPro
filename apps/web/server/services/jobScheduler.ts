import { JobControlPlaneError, type ScheduleDefinition } from "./jobControlPlaneTypes";

export type ScheduleOccurrenceInput = {
  tenantId: string;
  expectedTenantId: string;
  scheduleId: string;
  scheduleVersion: string;
  timezone: string;
  missedOccurrencePolicy: "skip" | "coalesce" | "catch_up";
  occurrenceAt: string;
  occurrenceKey?: string;
  windowStartAt?: string;
  windowEndAt?: string;
};

function formatParts(date: Date, timezone: string): Record<string, string> {
  try {
    return Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  } catch {
    throw new JobControlPlaneError("SCHEDULE_DEFINITION_INVALID", "Schedule timezone is invalid");
  }
}

/** Build a deterministic occurrence identity using the schedule's timezone. */
export function buildScheduleOccurrenceKey(input: {
  scheduleId: string;
  scheduleVersion: string;
  timezone: string;
  occurrenceAt: string;
}): string {
  const occurrenceAt = new Date(input.occurrenceAt);
  if (Number.isNaN(occurrenceAt.getTime())) throw new JobControlPlaneError("SCHEDULE_OCCURRENCE_INVALID", "Occurrence time is invalid");
  const parts = formatParts(occurrenceAt, input.timezone);
  return `${input.scheduleId}:${input.scheduleVersion}:${parts.year}-${parts.month}-${parts.day}T${parts.hour}-${parts.minute}`;
}

/** Validate scheduler-owned identity before creating a canonical job intent. */
export function validateScheduleOccurrence(input: ScheduleOccurrenceInput): ScheduleDefinition {
  if (!input.tenantId || input.tenantId !== input.expectedTenantId) {
    throw new JobControlPlaneError("SCHEDULE_TENANT_MISMATCH", "Schedule tenant does not match the authenticated tenant");
  }
  if (!input.scheduleId || input.scheduleId.length > 160 || !input.scheduleVersion || input.scheduleVersion.length > 80) {
    throw new JobControlPlaneError("SCHEDULE_DEFINITION_INVALID", "Schedule identity is invalid");
  }
  if (!input.timezone || input.timezone.length > 80 || !input.missedOccurrencePolicy) {
    throw new JobControlPlaneError("SCHEDULE_DEFINITION_INVALID", "Schedule timezone or missed-occurrence policy is invalid");
  }
  const occurrenceAt = new Date(input.occurrenceAt);
  if (Number.isNaN(occurrenceAt.getTime())) throw new JobControlPlaneError("SCHEDULE_OCCURRENCE_INVALID", "Occurrence time is invalid");
  if (input.windowStartAt && occurrenceAt < new Date(input.windowStartAt)) throw new JobControlPlaneError("SCHEDULE_OCCURRENCE_INVALID", "Occurrence is outside the accepted window");
  if (input.windowEndAt && occurrenceAt > new Date(input.windowEndAt)) throw new JobControlPlaneError("SCHEDULE_OCCURRENCE_INVALID", "Occurrence is outside the accepted window");
  const generatedKey = buildScheduleOccurrenceKey({ ...input, occurrenceAt: occurrenceAt.toISOString() });
  const occurrenceKey = (input.occurrenceKey?.trim() || generatedKey);
  if (occurrenceKey.length > 200) throw new JobControlPlaneError("SCHEDULE_OCCURRENCE_INVALID", "Occurrence key is too long");
  return {
    scheduleId: input.scheduleId,
    occurrenceKey,
    scheduleVersion: input.scheduleVersion,
    timezone: input.timezone,
    missedOccurrencePolicy: input.missedOccurrencePolicy,
  };
}
