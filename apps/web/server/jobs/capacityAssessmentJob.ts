import { Queue, Worker } from "bullmq";
import { getRealtimeClient } from "../services/redisClients";
import {
  createCapacityAssessmentRun,
  runCapacityAssessment,
} from "../services/capacityAssessmentService";
import { createControlPlaneJob } from "../services/jobControlPlaneGateway";
import { upsertLegacyBullMqScheduler } from "../services/jobLegacyTransportAdapters";

const QUEUE_NAME = "capacity-assessment";
const JOB_NAME = "daily-capacity-assessment";

let queue: Queue | null = null;
let worker: Worker | null = null;
let scheduleTimer: ReturnType<typeof setInterval> | null = null;
let lastScheduledOccurrence: string | null = null;

type CapacityAssessmentJobData = {
  assessmentId?: number;
  requestedByUserId?: number | null;
  tenantId?: string | null;
  trigger: "manual" | "scheduled";
};

function ensureQueue(): Queue {
  if (queue) return queue;
  const redis = getRealtimeClient();
  queue = new Queue(QUEUE_NAME, {
    connection: redis.duplicate(),
    defaultJobOptions: {
      removeOnComplete: { count: 30 },
      removeOnFail: { count: 30 },
    },
  });
  return queue;
}

export async function enqueueCapacityAssessment(input: {
  requestedByUserId: number | null;
  tenantId: string;
  trigger?: "manual" | "scheduled";
  occurrenceKey?: string;
}) {
  const run = await createCapacityAssessmentRun({
    trigger: input.trigger ?? "manual",
    requestedByUserId: input.requestedByUserId,
    tenantId: input.tenantId,
    scheduledOccurrenceKey: input.occurrenceKey,
  });
  if (run.phase !== "requested") return run;
  if (process.env.FEATURE_186_HARD_CUTOVER === "true") {
    const context = {
      tenantId: input.tenantId,
      actorType: input.requestedByUserId == null ? "system" as const : "user" as const,
      ...(input.requestedByUserId == null ? {} : { actorId: input.requestedByUserId }),
      authorizationScope: "admin:capacity-assessment",
      correlationId: `capacity-assessment:${run.id}`,
      idempotencyKey: input.occurrenceKey
        ? `capacity-assessment:${input.tenantId}:scheduled:${input.occurrenceKey}`
        : `capacity-assessment:${input.tenantId}:${input.trigger ?? "manual"}:${run.id}`,
    };
    await createControlPlaneJob({
      context,
      definition: {
        contractVersion: "feature-186-v1",
        jobType: "capacity.assessment",
        executionClass: "short",
        input: {
          assessmentId: run.id,
          requestedByUserId: input.requestedByUserId,
          tenantId: input.tenantId,
          trigger: input.trigger ?? "manual",
        },
        retryPolicy: { maxAttempts: 2, baseDelayMs: 1000, maxDelayMs: 60000, jitter: "bounded", deadlineMs: 3600000, allowedErrorClasses: ["retryable", "timeout", "unavailable"] },
        timeoutPolicy: { softTimeoutMs: 5 * 60_000, hardTimeoutMs: 10 * 60_000 },
        ...(input.occurrenceKey ? {
          schedule: {
            scheduleId: "daily-capacity-assessment",
            occurrenceKey: input.occurrenceKey,
            scheduleVersion: "1",
            timezone: "UTC",
            missedOccurrencePolicy: "coalesce" as const,
          },
        } : {}),
      },
    });
    return run;
  }
  await ensureQueue().add("manual-capacity-assessment", {
    assessmentId: run.id,
    requestedByUserId: input.requestedByUserId,
    tenantId: input.tenantId,
    trigger: input.trigger ?? "manual",
  } satisfies CapacityAssessmentJobData);
  return run;
}

export async function initializeCapacityAssessmentJob(): Promise<void> {
  if (process.env.FEATURE_186_HARD_CUTOVER === "true") {
    if (scheduleTimer) return;
    const systemTenantId = String(process.env.FEATURE_186_SYSTEM_TENANT_ID ?? "").trim();
    if (!systemTenantId) {
      console.warn(
        "[capacityAssessment] daily schedule disabled; FEATURE_186_SYSTEM_TENANT_ID is required in hard cutover",
      );
      return;
    }
    const scheduleTick = () => {
      const now = new Date();
      const occurrence = now.toISOString().slice(0, 10);
      const dueMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
      if (dueMinute < 3 * 60 + 15 || lastScheduledOccurrence === occurrence) {
        return;
      }
      lastScheduledOccurrence = occurrence;
      void enqueueCapacityAssessment({
        requestedByUserId: null,
        tenantId: systemTenantId,
        trigger: "scheduled",
        occurrenceKey: occurrence,
      }).catch(error => {
        lastScheduledOccurrence = null;
        console.error("[capacityAssessment] scheduled control-plane dispatch failed:", error);
      });
    };
    scheduleTimer = setInterval(scheduleTick, 60_000);
    scheduleTick();
    console.info("[capacityAssessment] BullMQ skipped; durable UTC 03:15/coalesced control-plane schedule active");
    return;
  }
  if (queue) return;
  const redis = getRealtimeClient();
  const capacityQueue = ensureQueue();
  await upsertLegacyBullMqScheduler(capacityQueue,
    JOB_NAME,
    { pattern: "15 3 * * *" },
    { name: JOB_NAME }
  );
  worker = new Worker(
    QUEUE_NAME,
    async job => {
      const data = job.data as CapacityAssessmentJobData;
      await runCapacityAssessment({
        ...data,
        trigger: data.trigger ?? "scheduled",
      });
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );
  console.log(
    "[capacityAssessment] daily assessment scheduled at 03:15 server time"
  );
}

export async function shutdownCapacityAssessmentJob(): Promise<void> {
  if (scheduleTimer) {
    clearInterval(scheduleTimer);
    scheduleTimer = null;
    lastScheduledOccurrence = null;
  }
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
}
