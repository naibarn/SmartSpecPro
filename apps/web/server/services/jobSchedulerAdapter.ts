import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { workerJobScheduleOccurrences } from "../../drizzle/schema";
import { computeJobDefinitionHash } from "./jobCanonicalization";
import { JobControlPlaneError } from "./jobControlPlaneTypes";
import type { JobDefinition, JobRef, ScheduleDefinition } from "./jobControlPlaneTypes";

export type ScheduleIntent = {
  tenantId: string;
  schedule: Required<Pick<ScheduleDefinition, "scheduleId" | "occurrenceKey">> & ScheduleDefinition;
  definition: JobDefinition;
};

export type ScheduleOccurrenceStore = {
  claim(input: {
    tenantId: string;
    scheduleId: string;
    occurrenceKey: string;
    scheduleVersion: string;
    timezone: string;
    definitionHash: string;
    jobId: string;
  }): Promise<"created" | { status: "exists"; jobId: string } | "conflict">;
};

export type ScheduleIntentDependencies = {
  createJob(definition: JobDefinition): Promise<JobRef>;
  occurrences: ScheduleOccurrenceStore;
  hashDefinition(definition: JobDefinition): string;
};

export function deterministicOccurrenceKey(scheduleId: string, instant: Date, timezone: string): string {
  if (!scheduleId || !timezone || Number.isNaN(instant.getTime())) throw new Error("SCHEDULE_OCCURRENCE_INVALID");
  return `${scheduleId}:${instant.toISOString()}:${timezone}`;
}

export function scheduleDefinitionHash(definition: JobDefinition): string {
  return computeJobDefinitionHash(definition);
}

export const defaultScheduleOccurrenceStore: ScheduleOccurrenceStore = {
  async claim(input) {
    const inserted = await db.insert(workerJobScheduleOccurrences).values(input).onConflictDoNothing().returning({ id: workerJobScheduleOccurrences.id });
    if (inserted.length) return "created";
    const [existing] = await db.select({
      scheduleVersion: workerJobScheduleOccurrences.scheduleVersion,
      timezone: workerJobScheduleOccurrences.timezone,
      definitionHash: workerJobScheduleOccurrences.definitionHash,
      jobId: workerJobScheduleOccurrences.workerJobId,
    }).from(workerJobScheduleOccurrences).where(and(
      eq(workerJobScheduleOccurrences.tenantId, input.tenantId),
      eq(workerJobScheduleOccurrences.scheduleId, input.scheduleId),
      eq(workerJobScheduleOccurrences.occurrenceKey, input.occurrenceKey),
    )).limit(1);
    if (existing && existing.scheduleVersion === input.scheduleVersion && existing.timezone === input.timezone && existing.definitionHash === input.definitionHash) return { status: "exists", jobId: existing.jobId };
    return "conflict";
  },
};

/** Beat/Cron adapter boundary: creates an intent and never runs business work. */
export async function createScheduledJobIntent(
  input: ScheduleIntent,
  dependencies: ScheduleIntentDependencies,
): Promise<JobRef> {
  if (input.definition.tenantId !== input.tenantId) throw new Error("SCHEDULE_TENANT_MISMATCH");
  const scheduleVersion = input.schedule.scheduleVersion ?? "1";
  const timezone = input.schedule.timezone ?? "UTC";
  const scheduleIdempotencyKey = `schedule:${input.tenantId}:${input.schedule.scheduleId}:${input.schedule.occurrenceKey}`;
  if (input.definition.idempotencyKey && input.definition.idempotencyKey !== scheduleIdempotencyKey) throw new JobControlPlaneError("SCHEDULE_IDEMPOTENCY_CONFLICT", "Scheduled jobs must use the deterministic occurrence idempotency key");
  const scheduledDefinition = { ...input.definition, schedule: input.schedule, idempotencyKey: scheduleIdempotencyKey };
  const definitionHash = dependencies.hashDefinition(scheduledDefinition);
  const job = await dependencies.createJob(scheduledDefinition);
  const claimed = await dependencies.occurrences.claim({
    tenantId: input.tenantId,
    scheduleId: input.schedule.scheduleId,
    occurrenceKey: input.schedule.occurrenceKey,
    scheduleVersion,
    timezone,
    definitionHash,
    jobId: job.jobId,
  });
  if (claimed === "conflict") throw new JobControlPlaneError("IDEMPOTENCY_CONFLICT", "Schedule occurrence already exists with a different definition");
  if (claimed !== "created") return { jobId: claimed.jobId, created: false };
  return job;
}
