import { Queue, Worker } from "bullmq";
import { getRealtimeClient } from "../services/redisClients";
import {
  createCapacityAssessmentRun,
  runCapacityAssessment,
} from "../services/capacityAssessmentService";

const QUEUE_NAME = "capacity-assessment";
const JOB_NAME = "daily-capacity-assessment";

let queue: Queue | null = null;
let worker: Worker | null = null;

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
  requestedByUserId: number;
  tenantId: string;
}) {
  const run = await createCapacityAssessmentRun({
    trigger: "manual",
    requestedByUserId: input.requestedByUserId,
    tenantId: input.tenantId,
  });
  if (run.phase !== "requested") return run;
  await ensureQueue().add("manual-capacity-assessment", {
    assessmentId: run.id,
    requestedByUserId: input.requestedByUserId,
    tenantId: input.tenantId,
    trigger: "manual",
  } satisfies CapacityAssessmentJobData);
  return run;
}

export async function initializeCapacityAssessmentJob(): Promise<void> {
  if (queue) return;
  const redis = getRealtimeClient();
  const capacityQueue = ensureQueue();
  await capacityQueue.upsertJobScheduler(
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
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
}
