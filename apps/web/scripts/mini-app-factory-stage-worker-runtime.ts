import postgres from "postgres";
import { and, eq, isNotNull, isNull } from "drizzle-orm";

import { closeDb, db, getDb } from "../server/db";
import { workerJobDispatches, workerJobOutbox, workerJobs } from "../drizzle/schema";
import { runPostgresNodeJobWorkerOnce } from "../server/jobs/postgresNodeJobWorker";
import { publishJobOutboxRow } from "../server/services/jobOutboxPublisher";
import { PostgresPullJobTransportAdapter } from "../server/services/jobTransportAdapters";
import { createJobControlPlane } from "../server/services/jobControlPlane";
import { defaultJobExecutorRegistry } from "../server/services/jobExecutorRegistry";
import { createDevelopmentWorkUnit } from "../server/services/developmentLifecycleContracts";
import { createMiniAppFactoryDurableState, MINI_APP_FACTORY_STATE_KEY, parseMiniAppFactoryDurableState } from "../server/services/miniAppFactoryDurableState";
import { configureMiniAppFactoryStageWorkerRuntime, enqueueNextMiniAppFactoryStage } from "../server/services/miniAppFactoryStageWorker";
import type { MiniAppFactoryPipeline } from "../server/services/miniAppFactoryPipeline";
import { bindWorkerJob, buildDevelopmentRun } from "../server/services/spec224DevelopmentRunContracts";
import { createDevelopmentRunService, defaultDevelopmentRunPersistenceAdapter } from "../server/services/spec224DevelopmentRunPersistence";

const DATABASE_URL = process.env.DATABASE_URL;
const sourceSha = process.env.MINI_APP_FACTORY_SOURCE_SHA;
if (!DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
if (!sourceSha || !/^[a-f0-9]{40}$/i.test(sourceSha)) throw new Error("CANONICAL_SOURCE_SHA_REQUIRED");

const runId = "mini-app-factory-stage-worker-runtime";
const tenantId = "miniapp-factory-worker-tenant";
const actorId = 1;
const scope = { runId, tenantId, actorId };
const pipeline: MiniAppFactoryPipeline = {
  schemaVersion: "mini-app-factory-pipeline.v1",
  pipelineId: "stage-worker-runtime-acceptance",
  stages: [{ id: "SPEC", dependsOn: [] }, { id: "TEST", dependsOn: ["SPEC"] }],
};
const service = createDevelopmentRunService(defaultDevelopmentRunPersistenceAdapter);
const mode = process.argv[2];

async function publishPendingStageOutbox(): Promise<void> {
  const pending = await db.select().from(workerJobOutbox).where(and(
    isNull(workerJobOutbox.publishedAt),
    isNull(workerJobOutbox.cancelledAt),
    isNull(workerJobOutbox.quarantinedAt),
  ));
  for (const outbox of pending) {
    const result = await publishJobOutboxRow(outbox.id, new PostgresPullJobTransportAdapter());
    if (result.state !== "published" && result.state !== "skipped") throw new Error(`FACTORY_STAGE_OUTBOX_${result.state}`);
  }
}

async function stageJobs() {
  return db.select().from(workerJobs).where(and(
    eq(workerJobs.tenantId, tenantId),
    eq(workerJobs.jobType, "mini_app_factory.stage"),
  ));
}

async function startProgram(): Promise<void> {
  const pg = postgres(DATABASE_URL!, { max: 1 });
  try {
    await pg`INSERT INTO tenants (id, slug, name) VALUES (${tenantId}, 'miniapp-factory-worker', 'Factory Worker Test') ON CONFLICT (id) DO NOTHING`;
    await pg`INSERT INTO users (id, "openId", name, role, "currentTenantId") VALUES (${actorId}, 'miniapp-factory-worker-user', 'Factory Worker Test', 'user', ${tenantId}) ON CONFLICT (id) DO NOTHING`;
    await pg`CREATE TABLE tenant_identity_actions (
      id serial PRIMARY KEY,
      "userId" integer NOT NULL,
      "sourceTenantId" varchar(36) NOT NULL,
      phase varchar(24) NOT NULL
    )`;
    const [anchor] = await pg<{ id: string }[]>`
      INSERT INTO worker_jobs ("tenantId", "requestedByUserId", "runtimeType", "jobType", "inputJson")
      VALUES (${tenantId}, ${actorId}, 'node_job_worker', 'mini_app_factory.stage_fixture', ${pg.json({ spec224Run: { runId } })})
      RETURNING id
    `;
    if (!anchor) throw new Error("FACTORY_STAGE_RUN_ANCHOR_CREATE_FAILED");
    const workUnit = createDevelopmentWorkUnit({
      workId: "work:mini-app-factory-stage-worker-runtime",
      projectId: "project:mini-app-factory-stage-worker-runtime",
      repositoryId: "smartspecpro",
      source: { type: "feature", ref: "program:AUTONOMOUS_MINI_APP_FACTORY_PROGRAM" },
      objective: "Execute dependency-ready Factory stages using worker_jobs/outbox after process restart.",
      ownership: { actor: String(actorId), session: "factory-stage-worker-runtime", harness: "codex" },
      canonicalTarget: { kind: "git", locator: "refs/remotes/origin/main" },
      baseRevision: `git:${sourceSha}`,
    });
    workUnit.progress.remainingScope = pipeline.stages.map(stage => stage.id);
    const run = bindWorkerJob(buildDevelopmentRun({
      runId, tenantId, actorId, goal: "Prove cross-process Factory stage worker execution and retry.",
      repositoryRef: "repo:smartspecpro", baseRevision: `git:${sourceSha}`,
      contextPackHash: "c".repeat(64), workspaceId: "workspace:mini-app-factory-stage-worker-runtime", workUnit,
      metadata: { [MINI_APP_FACTORY_STATE_KEY]: createMiniAppFactoryDurableState({
        programId: "AUTONOMOUS_MINI_APP_FACTORY_PROGRAM", miniAppId: "app_research_notes", sourceSha,
      }) },
    }), anchor.id);
    await service.initialize({ run, eventIdempotencyKey: `run-created:${runId}`, scope: { tenantId, actorId } });
    const first = await enqueueNextMiniAppFactoryStage({ pipeline, service, run: scope, executorRegistry: defaultJobExecutorRegistry });
    if (first.stageId !== "SPEC" || !first.jobId || first.state !== "ENQUEUED") throw new Error("FACTORY_STAGE_NOT_ENQUEUED");
    const duplicate = await enqueueNextMiniAppFactoryStage({ pipeline, service, run: scope, executorRegistry: defaultJobExecutorRegistry });
    if (duplicate.jobId !== first.jobId || duplicate.created) throw new Error("FACTORY_STAGE_ADMISSION_NOT_IDEMPOTENT");
    console.log(JSON.stringify({ process: "producer-exit", sourceSha, runId, stageId: first.stageId, jobId: first.jobId, duplicateAdmissionReused: true }));
  } finally {
    await pg.end();
  }
}

async function runWorkerProcess(): Promise<void> {
  configureMiniAppFactoryStageWorkerRuntime({
    pipeline,
    service,
    executeStage: async (stageId, context) => {
      if (stageId === "TEST" && context.attempt === 1) {
        const error = new Error("Synthetic transient Factory stage failure") as Error & { class: "retryable"; diagnosticCode: string };
        error.class = "retryable";
        error.diagnosticCode = "FACTORY_STAGE_SYNTHETIC_RETRY";
        throw error;
      }
      return { artifacts: [`factory-worker-evidence:${stageId.toLowerCase()}-attempt-${context.attempt}`] };
    },
  });
  await publishPendingStageOutbox();
  const pending = (await stageJobs()).filter(job => ["queued", "retry_scheduled"].includes(job.status));
  if (pending.length !== 1) throw new Error("FACTORY_STAGE_PENDING_JOB_COUNT_INVALID");
  const job = pending[0]!;
  const input = job.inputJson as { runId?: unknown; stageId?: unknown };
  if (input.runId !== runId || typeof input.stageId !== "string") throw new Error("FACTORY_STAGE_PENDING_JOB_INVALID");
  const execution = await runPostgresNodeJobWorkerOnce({ runnerId: `factory-stage-worker-process-${process.pid}`, batchSize: 10, initialDispatchCount: 10 });
  const outcome = execution.find(item => item.jobId === job.id);
  const [settled] = await db.select().from(workerJobs).where(eq(workerJobs.id, job.id)).limit(1);
  if (input.stageId === "SPEC" && settled?.status !== "succeeded") throw new Error("FACTORY_SPEC_STAGE_WORKER_FAILED");
  if (input.stageId === "TEST" && outcome?.state === "error" && settled?.status !== "retry_scheduled") {
    throw new Error("FACTORY_STAGE_RETRY_NOT_SCHEDULED");
  }
  if (input.stageId === "TEST" && outcome?.state === "succeeded" && settled?.status !== "succeeded") throw new Error("FACTORY_STAGE_RETRY_RECOVERY_FAILED");
  console.log(JSON.stringify({ process: "worker-exit", stageId: input.stageId, jobId: job.id, attempt: settled?.attempt, status: settled?.status }));
}

async function makeRetryDue(): Promise<void> {
  const jobs = await stageJobs();
  const retry = jobs.find(job => job.status === "retry_scheduled");
  if (!retry) throw new Error("FACTORY_STAGE_RETRY_JOB_MISSING");
  const accepted = await createJobControlPlane().makeRetryDue(retry.id, undefined, undefined, "factory_stage_retry", { tenantId });
  if (!accepted) throw new Error("FACTORY_STAGE_RETRY_RECOVERY_NOT_ACCEPTED");
  await publishPendingStageOutbox();
  console.log(JSON.stringify({ process: "retry-recovery-exit", jobId: retry.id, outboxPublished: true }));
}

async function verifyProgram(): Promise<void> {
  const final = await service.get(scope);
  const durable = parseMiniAppFactoryDurableState(final.run.metadata?.[MINI_APP_FACTORY_STATE_KEY]);
  const jobs = await stageJobs();
  const testJob = jobs.find(job => (job.inputJson as { stageId?: unknown }).stageId === "TEST");
  const [consumedDispatch] = testJob
    ? await db.select().from(workerJobDispatches).where(and(
      eq(workerJobDispatches.workerJobId, testJob.id), isNotNull(workerJobDispatches.consumedAt),
    )).limit(1)
    : [];
  if (!testJob || testJob.status !== "succeeded" || testJob.attempt !== 2 || !consumedDispatch ||
      final.run.workUnit?.progress.completedScope.join(",") !== "SPEC,TEST" || durable.completedStages.join(",") !== "SPEC,TEST" || durable.nextEligibleStages.length !== 0 ||
      !final.run.workUnit.artifacts.includes("factory-worker-evidence:test-attempt-2")) {
    throw new Error("FACTORY_STAGE_CROSS_PROCESS_FINAL_STATE_INVALID");
  }
  console.log(JSON.stringify({
    result: "MINI_APP_FACTORY_STAGE_WORKER_RUNTIME_PASS", sourceSha, runId,
    stages: final.run.workUnit?.progress.completedScope,
    canonicalJobs: jobs.map(job => ({ id: job.id, stageId: (job.inputJson as { stageId: string }).stageId, status: job.status, attempt: job.attempt })),
    retryRecoveredAcrossWorkerProcesses: true,
    outboxDispatchConsumed: true,
  }));
}

try {
  getDb();
  if (mode === "start") await startProgram();
  else if (mode === "worker") await runWorkerProcess();
  else if (mode === "recover") await makeRetryDue();
  else if (mode === "verify") await verifyProgram();
  else throw new Error("MODE_MUST_BE_START_WORKER_RECOVER_OR_VERIFY");
} finally {
  configureMiniAppFactoryStageWorkerRuntime(null);
  await closeDb();
}
