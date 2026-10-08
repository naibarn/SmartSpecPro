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
const pg = postgres(DATABASE_URL, { max: 1 });
let testStageAttempts = 0;

async function publish(jobId: string): Promise<void> {
  const [outbox] = await db.select().from(workerJobOutbox).where(and(
    eq(workerJobOutbox.workerJobId, jobId),
    isNull(workerJobOutbox.publishedAt),
    isNull(workerJobOutbox.cancelledAt),
    isNull(workerJobOutbox.quarantinedAt),
  )).limit(1);
  if (!outbox) throw new Error("FACTORY_STAGE_OUTBOX_MISSING");
  const result = await publishJobOutboxRow(outbox.id, new PostgresPullJobTransportAdapter());
  if (result.state !== "published") throw new Error(`FACTORY_STAGE_OUTBOX_${result.state}`);
}

try {
  getDb();
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
    objective: "Execute a dependency-ready Factory stage using worker_jobs and outbox.",
    ownership: { actor: String(actorId), session: "factory-stage-worker-runtime", harness: "vitest" },
    canonicalTarget: { kind: "git", locator: "refs/remotes/origin/main" },
    baseRevision: `git:${sourceSha}`,
  });
  workUnit.progress.remainingScope = pipeline.stages.map(stage => stage.id);
  const run = bindWorkerJob(buildDevelopmentRun({
    runId, tenantId, actorId, goal: "Prove Factory stage worker execution and retry.",
    repositoryRef: "repo:smartspecpro", baseRevision: `git:${sourceSha}`,
    contextPackHash: "c".repeat(64), workspaceId: "workspace:mini-app-factory-stage-worker-runtime", workUnit,
    metadata: { [MINI_APP_FACTORY_STATE_KEY]: createMiniAppFactoryDurableState({
      programId: "AUTONOMOUS_MINI_APP_FACTORY_PROGRAM", miniAppId: "app_research_notes", sourceSha,
    }) },
  }), anchor.id);
  await service.initialize({ run, eventIdempotencyKey: `run-created:${runId}`, scope: { tenantId, actorId } });

  configureMiniAppFactoryStageWorkerRuntime({
    pipeline,
    service,
    executeStage: async stageId => {
      if (stageId === "TEST" && testStageAttempts++ === 0) {
        const error = new Error("Synthetic transient Factory stage failure") as Error & { class: "retryable"; diagnosticCode: string };
        error.class = "retryable";
        error.diagnosticCode = "FACTORY_STAGE_SYNTHETIC_RETRY";
        throw error;
      }
      return { artifacts: [`factory-worker-evidence:${stageId.toLowerCase()}`] };
    },
  });

  const first = await enqueueNextMiniAppFactoryStage({ pipeline, service, run: scope, executorRegistry: defaultJobExecutorRegistry });
  if (first.stageId !== "SPEC" || !first.jobId || first.state !== "ENQUEUED") throw new Error("FACTORY_STAGE_NOT_ENQUEUED");
  const duplicateAdmission = await enqueueNextMiniAppFactoryStage({ pipeline, service, run: scope, executorRegistry: defaultJobExecutorRegistry });
  if (duplicateAdmission.jobId !== first.jobId || duplicateAdmission.created) throw new Error("FACTORY_STAGE_ADMISSION_NOT_IDEMPOTENT");
  await publish(first.jobId);
  const specExecution = await runPostgresNodeJobWorkerOnce({ runnerId: "factory-stage-worker-test", batchSize: 10, initialDispatchCount: 10 });
  if (!specExecution.some(item => item.jobId === first.jobId && item.state === "succeeded")) throw new Error("FACTORY_SPEC_STAGE_WORKER_FAILED");

  const second = await enqueueNextMiniAppFactoryStage({ pipeline, service, run: scope, executorRegistry: defaultJobExecutorRegistry });
  if (second.stageId !== "TEST" || !second.jobId || second.created) throw new Error("FACTORY_NEXT_STAGE_NOT_AUTO_ENQUEUED_IDEMPOTENTLY");
  await db.update(workerJobs).set({ retryPolicyJson: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, jitter: "none", deadlineMs: 86_400_000, allowedErrorClasses: ["retryable", "unknown"] } }).where(eq(workerJobs.id, second.jobId));
  await publish(second.jobId);
  const failed = await runPostgresNodeJobWorkerOnce({ runnerId: "factory-stage-worker-test", batchSize: 10, initialDispatchCount: 10 });
  const [retryScheduled] = await db.select().from(workerJobs).where(eq(workerJobs.id, second.jobId)).limit(1);
  if (retryScheduled?.status !== "retry_scheduled" || !failed.some(item => item.jobId === second.jobId && item.state === "error")) {
    throw new Error("FACTORY_STAGE_RETRY_NOT_SCHEDULED");
  }
  const recovered = await createJobControlPlane().makeRetryDue(second.jobId, undefined, undefined, "factory_stage_retry", { tenantId });
  if (!recovered) throw new Error("FACTORY_STAGE_RETRY_RECOVERY_NOT_ACCEPTED");
  await publish(second.jobId);
  const success = await runPostgresNodeJobWorkerOnce({ runnerId: "factory-stage-worker-test", batchSize: 10, initialDispatchCount: 10 });
  const [completed] = await db.select().from(workerJobs).where(eq(workerJobs.id, second.jobId)).limit(1);
  const final = await service.get(scope);
  const state = parseMiniAppFactoryDurableState(final.run.metadata?.[MINI_APP_FACTORY_STATE_KEY]);
  if (completed?.status !== "succeeded" || !success.some(item => item.jobId === second.jobId && item.state === "succeeded") ||
      final.run.workUnit?.progress.completedScope.join(",") !== "SPEC,TEST" || state.nextEligibleStages.length !== 0 || testStageAttempts !== 2) {
    throw new Error("FACTORY_STAGE_RETRY_COMPLETION_INVALID");
  }

  const [consumedDispatch] = await db.select().from(workerJobDispatches)
    .where(and(eq(workerJobDispatches.workerJobId, second.jobId), isNotNull(workerJobDispatches.consumedAt)))
    .limit(1);
  if (!consumedDispatch) throw new Error("FACTORY_STAGE_OUTBOX_DISPATCH_NOT_CONSUMED");
  console.log(JSON.stringify({
    result: "MINI_APP_FACTORY_STAGE_WORKER_RUNTIME_PASS", sourceSha, runId,
    stages: final.run.workUnit?.progress.completedScope,
    canonicalJobs: [first.jobId, second.jobId],
    retryRecovered: true,
    durableFactoryState: state.completedStages,
    outboxDispatchConsumed: true,
  }));
} finally {
  configureMiniAppFactoryStageWorkerRuntime(null);
  await pg.end();
  await closeDb();
}
