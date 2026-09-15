import { asc, desc, eq, sql } from "drizzle-orm";

import { db, getDb } from "../db";
import { workerJobOutbox, workerJobs } from "../../drizzle/schema";
import { createJobControlPlane } from "../services/jobControlPlane";
import { defaultJobExecutorRegistry, type JobExecutorRegistry } from "../services/jobExecutorRegistry";
import { executeCanonicalJobEnvelope } from "./unifiedJobConsumer";
import { POSTGRES_NODE_JOB_TYPES } from "./feature186JobTypes";
import { refreshAppRuntimeConfigCache } from "../services/appRuntimeConfig";

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_POLL_INTERVAL_MS = 1_000;

export function isPostgresNodeJobWorkerEnabled(): boolean {
  return process.env.FEATURE_186_HARD_CUTOVER === "true";
}

export type PostgresNodeJobWorkerOptions = {
  runnerId?: string;
  batchSize?: number;
  pollIntervalMs?: number;
  executorRegistry?: JobExecutorRegistry;
};

let executorModulesLoaded = false;

async function loadNodeExecutorModules(): Promise<void> {
  if (executorModulesLoaded) return;
  // The node worker is a separate process from the web origin. Load the
  // database-backed public URL before storyboard/media executors resolve
  // tenant-owned /uploads/ references for external providers. Falling back to
  // process defaults here can turn a valid managed reference into a
  // pre-provider failure while leaving the canonical job recoverable.
  await refreshAppRuntimeConfigCache();
  // These modules register the business handlers on the shared server-owned
  // registry. Their legacy BullMQ workers are not initialized in this process.
  await import("../services/webhookDispatchQueue");
  await import("../services/webhookDeliveryService");
  await import("../services/embeddingQueue");
  executorModulesLoaded = true;
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value as number))) : fallback;
}

/**
 * Pull a bounded batch of canonical Node jobs whose publication is already
 * durable. Selecting candidates is intentionally not a lease: claim() below
 * is the only authority, so multiple worker processes converge safely.
 */
async function findReadyNodeEnvelopes(limit: number): Promise<unknown[]> {
  getDb();
  const rows = await db
    .select({
      jobId: workerJobs.id,
      priority: workerJobs.priority,
      jobCreatedAt: workerJobs.createdAt,
      outboxCreatedAt: workerJobOutbox.createdAt,
      envelope: workerJobOutbox.envelopeJson,
    })
    .from(workerJobs)
    .innerJoin(workerJobOutbox, eq(workerJobOutbox.workerJobId, workerJobs.id))
    .where(sql`${workerJobs.jobType} IN (${sql.join([...POSTGRES_NODE_JOB_TYPES].map(type => sql`${type}`), sql`, `)})
      AND ${workerJobs.status} = 'queued'
      AND ${workerJobs.operatorReviewRequired} = false
      AND ${workerJobOutbox.publishedAt} IS NOT NULL
      AND ${workerJobOutbox.cancelledAt} IS NULL
      AND ${workerJobOutbox.quarantinedAt} IS NULL
      AND EXISTS (
        SELECT 1
        FROM "worker_job_dispatches" dispatch
        WHERE dispatch."workerJobId" = ${workerJobs.id}
          AND dispatch."adapter" = 'postgres-pull'
          AND dispatch."dedupeKey" = ${workerJobOutbox.dedupeKey}
          AND dispatch."consumedAt" IS NULL
      )`)
    .orderBy(desc(workerJobs.priority), asc(workerJobs.createdAt), asc(workerJobs.id), desc(workerJobOutbox.createdAt))
    .limit(Math.min(500, Math.max(limit, limit * 4)));

  const latestByJob = new Map<string, typeof rows[number]>();
  for (const row of rows) {
    if (!latestByJob.has(row.jobId)) latestByJob.set(row.jobId, row);
    if (latestByJob.size >= limit) break;
  }
  return [...latestByJob.values()].map(row => {
    const envelope = row.envelope;
    if (!envelope || typeof envelope !== "object") {
      throw new Error(`INVALID_PUBLISHED_JOB_ENVELOPE:${row.jobId}`);
    }
    return envelope;
  });
}

export async function runPostgresNodeJobWorkerOnce(
  options: PostgresNodeJobWorkerOptions = {},
): Promise<Array<{ jobId: string; state: string }>> {
  if (!isPostgresNodeJobWorkerEnabled()) return [];

  const batchSize = boundedInteger(options.batchSize, DEFAULT_BATCH_SIZE, 1, 100);
  const runnerId = options.runnerId ?? `node-postgres:${process.pid}`;
  const controlPlane = createJobControlPlane();
  const executorRegistry = options.executorRegistry ?? defaultJobExecutorRegistry;
  await loadNodeExecutorModules();
  const envelopes = await findReadyNodeEnvelopes(batchSize);
  const outcomes: Array<{ jobId: string; state: string }> = [];

  for (const envelope of envelopes) {
    const jobId = typeof envelope === "object" && envelope !== null && "jobId" in envelope
      ? String((envelope as { jobId: unknown }).jobId)
      : "unknown";
    try {
      const outcome = await executeCanonicalJobEnvelope(envelope, {
        controlPlane,
        executorRegistry,
        runnerId,
        adapter: "postgres-pull",
      });
      outcomes.push({ jobId, state: outcome.state });
    } catch (error) {
      // executeCanonicalJobEnvelope records the guarded failure/retry before
      // propagating. Continue the bounded batch so one poison execution cannot
      // starve unrelated tenants.
      console.error("[Feature186] postgres Node job execution failed", {
        jobId,
        error: error instanceof Error ? error.message.slice(0, 500) : "unknown_error",
      });
      outcomes.push({ jobId, state: "error" });
    }
  }
  return outcomes;
}

export async function runPostgresNodeJobWorkerForever(
  options: PostgresNodeJobWorkerOptions = {},
): Promise<void> {
  const pollIntervalMs = boundedInteger(options.pollIntervalMs, DEFAULT_POLL_INTERVAL_MS, 100, 60_000);
  const runnerId = options.runnerId ?? `node-postgres:${process.pid}`;
  if (!isPostgresNodeJobWorkerEnabled()) {
    console.info("[Feature186] PostgreSQL Node job worker disabled", {
      reason: "FEATURE_186_HARD_CUTOVER is not true",
    });
    // Keep a supervised service quiet instead of exiting into a Docker
    // restart loop. A flag change still requires the normal service restart.
    while (true) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
  }
  console.info("[Feature186] PostgreSQL Node job worker started", { runnerId, pollIntervalMs });
  while (true) {
    try {
      const outcomes = await runPostgresNodeJobWorkerOnce({ ...options, runnerId });
      if (outcomes.length > 0) continue;
    } catch (error) {
      console.error("[Feature186] PostgreSQL Node job worker poll failed", {
        error: error instanceof Error ? error.message.slice(0, 500) : "unknown_error",
      });
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runPostgresNodeJobWorkerForever({
    batchSize: Number(process.env.FEATURE_186_NODE_WORKER_BATCH_SIZE ?? DEFAULT_BATCH_SIZE),
    pollIntervalMs: Number(process.env.FEATURE_186_NODE_WORKER_POLL_MS ?? DEFAULT_POLL_INTERVAL_MS),
  });
}
