import { createControlPlaneJob } from "../services/jobControlPlaneGateway";

type SystemScheduleDefinition = {
  scheduleId: string;
  jobType: string;
  executionClass: "short" | "long";
  priority?: number;
  scheduleVersion: string;
  timezone: "UTC";
  missedOccurrencePolicy: "skip" | "coalesce" | "catch_up";
  isDue(now: Date): boolean;
  occurrenceKey(now: Date): string;
  input?: Record<string, unknown>;
  intervalMs?: number;
};

const SYSTEM_TENANT_ENV = "FEATURE_186_SYSTEM_TENANT_ID";
const DEFAULT_INTERVAL_MS = 60_000;
const startedSchedules = new Set<string>();
const timers = new Map<string, ReturnType<typeof setInterval>>();

function systemTenantId(): string | null {
  const value = String(process.env[SYSTEM_TENANT_ENV] ?? "").trim();
  return value || null;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function utcDateOccurrence(now: Date): string {
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
}

export function utcMinuteOccurrence(now: Date, bucketMinutes: number): string {
  const bucket =
    Math.floor(now.getUTCMinutes() / bucketMinutes) * bucketMinutes;
  return `${utcDateOccurrence(now)}T${pad(now.getUTCHours())}:${pad(bucket)}Z`;
}

export function utcDailyDue(
  hour: number,
  minute: number
): (now: Date) => boolean {
  return (now: Date) => {
    const currentMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
    return currentMinute >= hour * 60 + minute;
  };
}

/**
 * Start a database-deduplicated system schedule. The timer is only a trigger;
 * the canonical occurrence and job are created by PostgreSQL. Multiple web
 * instances may run this function safely because the schedule occurrence
 * uniqueness constraint converges them on one worker_jobs row.
 */
export function startFeature186SystemSchedule(
  definition: SystemScheduleDefinition
): void {
  if (startedSchedules.has(definition.scheduleId)) return;

  const tenantId = systemTenantId();
  if (!tenantId) {
    console.warn(
      `[Feature186] system schedule disabled: ${SYSTEM_TENANT_ENV} is required`,
      {
        scheduleId: definition.scheduleId,
        jobType: definition.jobType,
      }
    );
    return;
  }

  startedSchedules.add(definition.scheduleId);
  const tick = () => {
    const now = new Date();
    if (!definition.isDue(now)) return;
    const occurrenceKey = definition.occurrenceKey(now);
    void createControlPlaneJob({
      context: {
        tenantId,
        actorType: "system",
        authorizationScope: `system:schedule:${definition.scheduleId}`,
        correlationId: `feature-186:${definition.scheduleId}:${occurrenceKey}`,
        idempotencyKey: `feature-186:${definition.scheduleId}:${occurrenceKey}`,
      },
      definition: {
        contractVersion: "feature-186-v1",
        jobType: definition.jobType,
        executionClass: definition.executionClass,
        priority: definition.priority,
        input: definition.input ?? {},
        retryPolicy: {
          maxAttempts: 3,
          baseDelayMs: 5_000,
          maxDelayMs: 15 * 60_000,
          jitter: "bounded",
          deadlineMs: 6 * 60 * 60 * 1000,
          allowedErrorClasses: ["retryable", "timeout", "unavailable"],
        },
        timeoutPolicy: {
          softTimeoutMs: 10 * 60_000,
          hardTimeoutMs: 30 * 60 * 1000,
        },
        schedule: {
          scheduleId: definition.scheduleId,
          occurrenceKey,
          scheduleVersion: definition.scheduleVersion,
          timezone: definition.timezone,
          missedOccurrencePolicy: definition.missedOccurrencePolicy,
        },
      },
    }).catch(error => {
      console.error("[Feature186] system schedule intent failed", {
        scheduleId: definition.scheduleId,
        occurrenceKey,
        error: error instanceof Error ? error.message : "unknown_error",
      });
    });
  };

  const timer = setInterval(tick, definition.intervalMs ?? DEFAULT_INTERVAL_MS);
  timers.set(definition.scheduleId, timer);
  tick();
}

export function stopFeature186SystemSchedule(scheduleId: string): void {
  const timer = timers.get(scheduleId);
  if (timer) clearInterval(timer);
  timers.delete(scheduleId);
  startedSchedules.delete(scheduleId);
}

export function stopAllFeature186SystemSchedules(): void {
  for (const scheduleId of timers.keys())
    stopFeature186SystemSchedule(scheduleId);
}
