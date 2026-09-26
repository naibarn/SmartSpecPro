import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { asc, desc, eq, sql } from "drizzle-orm";

import { db, getDb } from "../db";
import { workerJobOutbox, workerJobs } from "../../drizzle/schema";
import { createJobControlPlane } from "../services/jobControlPlane";
import { defaultJobExecutorRegistry, type JobExecutorRegistry } from "../services/jobExecutorRegistry";
import { executeCanonicalJobEnvelope } from "./unifiedJobConsumer";
import { POSTGRES_NODE_JOB_TYPES } from "./feature186JobTypes";
import { refreshAppRuntimeConfigCache } from "../services/appRuntimeConfig";
import {
  configureExternalAgentTaskDispatcher,
} from "../services/externalAgentTaskExecutor";
import { createExternalAgentTaskDispatcher } from "../services/externalAgentRunnerDispatcher";
import {
  decideNodeWorkerRecovery,
  type NodeWorkerHealthSnapshot,
} from "./nodeWorkerRecoveryPolicy";
import {
  DEFAULT_NODE_WORKER_FAIRNESS_WAIT_MS,
  DEFAULT_NODE_WORKER_INITIAL_DISPATCH_COUNT,
  selectFairNodeWorkerTask,
  shouldDispatchNextNodeWorkerTask,
} from "./nodeWorkerScheduling";
import {
  waitForNodeWorkerExecutions,
} from "./nodeWorkerShutdown";

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_BATCH_SIZE = 50;
const NODE_WORKER_HEARTBEAT_INTERVAL_MS = 10_000;
const DEFAULT_HEARTBEAT_FILE = "/home/dev/projects/SmartSpecPro/logs/smartspec-node-worker.heartbeat";

export function isPostgresNodeJobWorkerEnabled(): boolean {
  return process.env.FEATURE_186_HARD_CUTOVER === "true";
}

export type PostgresNodeJobWorkerOptions = {
  runnerId?: string;
  batchSize?: number;
  pollIntervalMs?: number;
  initialDispatchCount?: number;
  fairnessWaitMs?: number;
  executorRegistry?: JobExecutorRegistry;
};

let executorModulesLoaded = false;
const externalAgentTaskDispatcher = createExternalAgentTaskDispatcher();

function heartbeatFilePath(): string {
  return process.env.FEATURE_186_NODE_WORKER_HEARTBEAT_FILE ?? DEFAULT_HEARTBEAT_FILE;
}

async function writeNodeWorkerHeartbeat(phase: string): Promise<void> {
  const path = heartbeatFilePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${Date.now()}\t${phase}\t${process.pid}\n`, "utf8");
}

function startNodeWorkerHeartbeat(): () => void {
  let lastWriteErrorAt = 0;
  const write = (phase: string) => {
    void writeNodeWorkerHeartbeat(phase).catch(error => {
      const now = Date.now();
      if (now - lastWriteErrorAt < 60_000) return;
      lastWriteErrorAt = now;
      console.error("[Feature186] node worker heartbeat write failed", {
        path: heartbeatFilePath(),
        error: error instanceof Error ? error.message.slice(0, 300) : "unknown_error",
      });
    });
  };
  write("starting");
  const timer = setInterval(() => write("alive"), NODE_WORKER_HEARTBEAT_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}

async function readNodeWorkerQueueHealth(): Promise<Pick<NodeWorkerHealthSnapshot, "queuedUnconsumedCount" | "oldestQueuedUnconsumedAgeMs" | "activeJobCount" | "activeLeaseValidCount">> {
  const database = getDb();
  const rows = await database.execute(sql`
    WITH queued AS (
      SELECT
        count(*)::int AS "queuedCount",
        COALESCE(EXTRACT(EPOCH FROM (now() - min(w."createdAt"))) * 1000, 0)::bigint AS "oldestAgeMs"
      FROM worker_jobs w
      WHERE w."runtimeType" = 'node_job_worker'
        AND w."jobType" IN (${sql.join([...POSTGRES_NODE_JOB_TYPES].map(type => sql`${type}`), sql`, `)})
        AND w.status = 'queued'
        AND w."operatorReviewRequired" = false
        AND EXISTS (
          SELECT 1
          FROM worker_job_outbox o
          INNER JOIN worker_job_dispatches d
            ON d."workerJobId" = o."workerJobId"
           AND d."dedupeKey" = o."dedupeKey"
           AND d.adapter = 'postgres-pull'
           AND d."consumedAt" IS NULL
          WHERE o."workerJobId" = w.id
            AND o."publishedAt" IS NOT NULL
            AND o."cancelledAt" IS NULL
            AND o."quarantinedAt" IS NULL
        )
    ), active AS (
      SELECT
        count(*)::int AS "activeCount",
        count(*) FILTER (WHERE "leaseExpiresAt" > now())::int AS "activeLeaseValidCount"
      FROM worker_jobs
      WHERE "runtimeType" = 'node_job_worker'
        AND "jobType" IN (${sql.join([...POSTGRES_NODE_JOB_TYPES].map(type => sql`${type}`), sql`, `)})
        AND status IN ('leased', 'claimed', 'preparing', 'running', 'uploading')
    )
    SELECT queued."queuedCount", queued."oldestAgeMs", active."activeCount", active."activeLeaseValidCount"
    FROM queued, active
  `) as unknown as Array<{
    queuedCount: number | string | bigint;
    oldestAgeMs: number | string | bigint;
    activeCount: number | string | bigint;
    activeLeaseValidCount: number | string | bigint;
  }>;
  const row = rows[0];
  return {
    queuedUnconsumedCount: Number(row?.queuedCount ?? 0),
    oldestQueuedUnconsumedAgeMs: Number(row?.oldestAgeMs ?? 0) || null,
    activeJobCount: Number(row?.activeCount ?? 0),
    activeLeaseValidCount: Number(row?.activeLeaseValidCount ?? 0),
  };
}

function startNodeWorkerQueueRecovery(): () => void {
  let inFlight = false;
  const check = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const queueHealth = await readNodeWorkerQueueHealth();
      const decision = decideNodeWorkerRecovery({
        serviceActive: true,
        heartbeatAgeMs: 0,
        restartsInWindow: 0,
        ...queueHealth,
      });
      if (decision.action === "restart") {
        console.error("[Feature186] node worker self-recovery restarting process", {
          reason: decision.reason,
          ...queueHealth,
        });
        process.exit(1);
      }
    } catch (error) {
      console.error("[Feature186] node worker self-recovery probe failed", {
        error: error instanceof Error ? error.message.slice(0, 300) : "unknown_error",
      });
    } finally {
      inFlight = false;
    }
  };
  const timer = setInterval(() => void check(), NODE_WORKER_HEARTBEAT_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}

async function loadNodeExecutorModules(): Promise<void> {
  if (executorModulesLoaded) return;
  // The node worker is a separate process from the web origin. Load the
  // database-backed public URL before storyboard/media executors resolve
  // tenant-owned /uploads/ references for external providers. Falling back to
  // process defaults here can turn a valid managed reference into a
  // pre-provider failure while leaving the canonical job recoverable.
  console.info("[Feature186] node worker loading executor modules", { stage: "runtime_config" });
  await refreshAppRuntimeConfigCache();
  // Register the one production dispatcher only in the canonical Feature 195
  // worker process. It still fails closed per-job when Runner policy bindings
  // or the authenticated gateway are absent.
  configureExternalAgentTaskDispatcher(externalAgentTaskDispatcher);
  // These modules register the business handlers on the shared server-owned
  // registry. Their legacy BullMQ workers are not initialized in this process.
  console.info("[Feature186] node worker loading executor modules", { stage: "webhook_dispatch" });
  await import("../services/webhookDispatchQueue");
  console.info("[Feature186] node worker loading executor modules", { stage: "webhook_delivery" });
  await import("../services/webhookDeliveryService");
  console.info("[Feature186] node worker loading executor modules", { stage: "embedding" });
  await import("../services/embeddingQueue");
  executorModulesLoaded = true;
  console.info("[Feature186] node worker executor modules ready");
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value as number))) : fallback;
}

/**
 * Pull a bounded batch of canonical Node jobs whose publication is already
 * durable. Selecting candidates is intentionally not a lease: claim() below
 * is the only authority, so multiple worker processes converge safely.
 */
type ReadyNodeEnvelope = {
  jobId: string;
  userKey: string | null;
  envelope: unknown;
};

async function findReadyNodeEnvelopes(limit: number): Promise<ReadyNodeEnvelope[]> {
  getDb();
  const rows = await db
    .select({
      jobId: workerJobs.id,
      tenantId: workerJobs.tenantId,
      requestedByUserId: workerJobs.requestedByUserId,
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
    return {
      jobId: row.jobId,
      userKey: row.requestedByUserId == null
        ? (row.tenantId ? `tenant:${row.tenantId}` : null)
        : `user:${row.requestedByUserId}`,
      envelope,
    };
  });
}

async function executeReadyNodeEnvelope(
  candidate: ReadyNodeEnvelope,
  dependencies: {
    controlPlane: ReturnType<typeof createJobControlPlane>;
    executorRegistry: JobExecutorRegistry;
    runnerId: string;
  },
): Promise<{ jobId: string; state: string }> {
  await writeNodeWorkerHeartbeat("executing").catch(() => {});
  try {
    const outcome = await executeCanonicalJobEnvelope(candidate.envelope, {
      controlPlane: dependencies.controlPlane,
      executorRegistry: dependencies.executorRegistry,
      runnerId: dependencies.runnerId,
      adapter: "postgres-pull",
    });
    return { jobId: candidate.jobId, state: outcome.state };
  } catch (error) {
    // executeCanonicalJobEnvelope records the guarded failure/retry before
    // propagating. Continue scheduling so one poison execution cannot starve
    // unrelated tenants.
    console.error("[Feature186] postgres Node job execution failed", {
      jobId: candidate.jobId,
      error: error instanceof Error ? error.message.slice(0, 500) : "unknown_error",
    });
    return { jobId: candidate.jobId, state: "error" };
  }
}

export async function runPostgresNodeJobWorkerOnce(
  options: PostgresNodeJobWorkerOptions = {},
): Promise<Array<{ jobId: string; state: string }>> {
  if (!isPostgresNodeJobWorkerEnabled()) return [];

  const batchSize = boundedInteger(options.batchSize, DEFAULT_BATCH_SIZE, 1, 100);
  const initialDispatchCount = boundedInteger(
    options.initialDispatchCount,
    DEFAULT_NODE_WORKER_INITIAL_DISPATCH_COUNT,
    1,
    100,
  );
  const runnerId = options.runnerId ?? `node-postgres:${process.pid}`;
  const controlPlane = createJobControlPlane();
  const executorRegistry = options.executorRegistry ?? defaultJobExecutorRegistry;
  await loadNodeExecutorModules();
  await writeNodeWorkerHeartbeat("polling").catch(() => {});
  const candidates = await findReadyNodeEnvelopes(batchSize);
  const activeUserKeys = new Set<string>();
  const selected: ReadyNodeEnvelope[] = [];
  let remaining = [...candidates];
  while (selected.length < initialDispatchCount && remaining.length > 0) {
    const candidate = selectFairNodeWorkerTask(remaining, activeUserKeys);
    if (!candidate) break;
    selected.push(candidate);
    if (candidate.userKey) activeUserKeys.add(candidate.userKey);
    remaining = remaining.filter(item => item.jobId !== candidate.jobId);
  }
  return Promise.all(selected.map(candidate => executeReadyNodeEnvelope(candidate, {
    controlPlane,
    executorRegistry,
    runnerId,
  })));
}

export async function runPostgresNodeJobWorkerForever(
  options: PostgresNodeJobWorkerOptions = {},
): Promise<void> {
  const pollIntervalMs = boundedInteger(options.pollIntervalMs, DEFAULT_POLL_INTERVAL_MS, 100, 60_000);
  const batchSize = boundedInteger(options.batchSize, DEFAULT_BATCH_SIZE, 1, 100);
  const initialDispatchCount = boundedInteger(
    options.initialDispatchCount,
    Number(process.env.FEATURE_186_NODE_WORKER_INITIAL_DISPATCH_COUNT ?? DEFAULT_NODE_WORKER_INITIAL_DISPATCH_COUNT),
    1,
    100,
  );
  const fairnessWaitMs = boundedInteger(
    options.fairnessWaitMs,
    Number(process.env.FEATURE_186_NODE_WORKER_FAIRNESS_WAIT_MS ?? DEFAULT_NODE_WORKER_FAIRNESS_WAIT_MS),
    0,
    60_000,
  );
  const runnerId = options.runnerId ?? `node-postgres:${process.pid}`;
  const executorRegistry = options.executorRegistry ?? defaultJobExecutorRegistry;
  const activeExecutions = new Map<string, Promise<void>>();
  let stopQueueRecovery: (() => void) | undefined;
  let shutdownRequested = false;
  let resolveShutdownSignal!: () => void;
  const shutdownSignal = new Promise<void>(resolve => {
    resolveShutdownSignal = resolve;
  });
  const drainPromise = shutdownSignal.then(() =>
    waitForNodeWorkerExecutions(activeExecutions.values()),
  );
  const onShutdown = () => {
    if (shutdownRequested) return;
    shutdownRequested = true;
    resolveShutdownSignal();
    console.info("[Feature186] PostgreSQL Node job worker draining", {
      activeJobCount: activeExecutions.size,
    });
  };
  process.on("SIGTERM", onShutdown);
  process.on("SIGINT", onShutdown);
  const stopHeartbeat = startNodeWorkerHeartbeat();
  try {
    if (!isPostgresNodeJobWorkerEnabled()) {
      console.info("[Feature186] PostgreSQL Node job worker disabled", {
        reason: "FEATURE_186_HARD_CUTOVER is not true",
      });
      // Keep a supervised service quiet instead of exiting into a Docker
      // restart loop. A flag change still requires the normal service restart.
      while (!shutdownRequested) {
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }
      await drainPromise;
      return;
    }
    console.info("[Feature186] PostgreSQL Node job worker started", {
      runnerId,
      pollIntervalMs,
      initialDispatchCount,
      fairnessWaitMs,
      concurrencyPolicy: "unbounded_after_fairness_window",
    });
    stopQueueRecovery = startNodeWorkerQueueRecovery();
    await loadNodeExecutorModules();
    const activeUserCounts = new Map<string, number>();
    let lastDispatchAt: number | null = null;
    while (!shutdownRequested) {
      try {
        const candidates = await findReadyNodeEnvelopes(batchSize);
        const activeUserKeys = new Set(activeUserCounts.keys());
        if (shouldDispatchNextNodeWorkerTask({
          activeCount: activeExecutions.size,
          lastDispatchAt,
          now: Date.now(),
          hasQueuedWork: candidates.length > 0,
          initialDispatchCount,
          fairnessWaitMs,
        })) {
          const candidate = selectFairNodeWorkerTask(candidates, activeUserKeys);
          if (candidate && !shutdownRequested && !activeExecutions.has(candidate.jobId)) {
            if (candidate.userKey) activeUserCounts.set(candidate.userKey, (activeUserCounts.get(candidate.userKey) ?? 0) + 1);
            const execution = executeReadyNodeEnvelope(candidate, {
              controlPlane: createJobControlPlane(),
              executorRegistry,
              runnerId,
            });
            const tracked = execution.then(() => undefined).finally(() => {
              activeExecutions.delete(candidate.jobId);
              if (candidate.userKey) {
                const nextCount = (activeUserCounts.get(candidate.userKey) ?? 1) - 1;
                if (nextCount > 0) activeUserCounts.set(candidate.userKey, nextCount);
                else activeUserCounts.delete(candidate.userKey);
              }
            });
            activeExecutions.set(candidate.jobId, tracked);
            lastDispatchAt = Date.now();
            continue;
          }
        }
      } catch (error) {
        console.error("[Feature186] PostgreSQL Node job worker poll failed", {
          error: error instanceof Error ? error.message.slice(0, 500) : "unknown_error",
        });
      }
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
    const drainResult = await drainPromise;
    console.info("[Feature186] PostgreSQL Node job worker drain complete", {
      result: drainResult,
      activeJobCount: activeExecutions.size,
    });
  } finally {
    stopQueueRecovery?.();
    stopHeartbeat();
    process.removeListener("SIGTERM", onShutdown);
    process.removeListener("SIGINT", onShutdown);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runPostgresNodeJobWorkerForever({
    batchSize: Number(process.env.FEATURE_186_NODE_WORKER_BATCH_SIZE ?? DEFAULT_BATCH_SIZE),
    pollIntervalMs: Number(process.env.FEATURE_186_NODE_WORKER_POLL_MS ?? DEFAULT_POLL_INTERVAL_MS),
    initialDispatchCount: Number(process.env.FEATURE_186_NODE_WORKER_INITIAL_DISPATCH_COUNT ?? DEFAULT_NODE_WORKER_INITIAL_DISPATCH_COUNT),
    fairnessWaitMs: Number(process.env.FEATURE_186_NODE_WORKER_FAIRNESS_WAIT_MS ?? DEFAULT_NODE_WORKER_FAIRNESS_WAIT_MS),
  });
}
