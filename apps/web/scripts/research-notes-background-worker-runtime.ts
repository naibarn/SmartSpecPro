import { and, eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";

import { closeDb, db, getDb } from "../server/db";
import { workerJobEvents, workerJobOutbox, workerJobSettlements, workerJobs } from "../drizzle/schema";
import { runPostgresNodeJobWorkerOnce } from "../server/jobs/postgresNodeJobWorker";
import { createJobExecutorRegistry } from "../server/services/jobExecutorRegistry";
import { createJobControlPlane } from "../server/services/jobControlPlane";
import { createResearchNotesSummaryExecutor } from "../server/services/researchNotesSummaryExecutor";
import { publishJobOutboxRow } from "../server/services/jobOutboxPublisher";
import { PostgresPullJobTransportAdapter } from "../server/services/jobTransportAdapters";
import {
  createResearchNote,
  getResearchNoteSummaryJob,
  loadResearchNoteForSummary,
  requestResearchNoteSummary,
  saveResearchNoteSummary,
} from "../server/services/researchNotesService";

const tenantId = "miniapp-runtime-tenant";
const userId = 1;
const appId = "app_research_notes";
const projectId = "miniapp-runtime-project";
const principalId = `user:${userId}`;

try {
  getDb();
  const scope = { tenantId, principalId, appId };
  const fullRuntimeRequestFile = process.env.FULL_APP_SUMMARY_REQUEST_FILE;
  const fullRuntimeRequest = fullRuntimeRequestFile
    ? JSON.parse(await readFile(fullRuntimeRequestFile, "utf8")) as { jobId: string; noteId: string }
    : undefined;
  if (fullRuntimeRequest && (typeof fullRuntimeRequest.jobId !== "string" || typeof fullRuntimeRequest.noteId !== "string")) {
    throw new Error("FULL_APP_SUMMARY_REQUEST_INVALID");
  }
  if (fullRuntimeRequest) {
    const duplicate = await requestResearchNoteSummary({ ...scope, userId, projectId, noteId: fullRuntimeRequest.noteId });
    if (duplicate.jobId !== fullRuntimeRequest.jobId || duplicate.created) {
      throw new Error("FULL_APP_SUMMARY_ACTION_JOB_NOT_FOUND_OR_NOT_IDEMPOTENT");
    }
  }
  const note = await createResearchNote({
    ...scope,
    projectId,
    title: "Worker runtime acceptance",
    content: "A synthetic note used to exercise the PostgreSQL worker path.",
  });
  const requested = await requestResearchNoteSummary({ ...scope, userId, projectId, noteId: note.noteId });
  const duplicate = await requestResearchNoteSummary({ ...scope, userId, projectId, noteId: note.noteId });
  if (duplicate.jobId !== requested.jobId || duplicate.created) {
    throw new Error("RESEARCH_NOTES_SUMMARY_ADMISSION_NOT_IDEMPOTENT");
  }

  const [outbox] = await db.select().from(workerJobOutbox)
    .where(eq(workerJobOutbox.workerJobId, requested.jobId)).limit(1);
  if (!outbox) throw new Error("RESEARCH_NOTES_SUMMARY_OUTBOX_MISSING");
  const publication = await publishJobOutboxRow(outbox.id, new PostgresPullJobTransportAdapter());
  if (publication.state !== "published") throw new Error(`RESEARCH_NOTES_SUMMARY_PUBLICATION_${publication.state}`);

  if (fullRuntimeRequest) {
    const [fullRuntimeOutbox] = await db.select().from(workerJobOutbox)
      .where(eq(workerJobOutbox.workerJobId, fullRuntimeRequest.jobId)).limit(1);
    if (!fullRuntimeOutbox) throw new Error("FULL_APP_SUMMARY_ACTION_OUTBOX_MISSING");
    if (!fullRuntimeOutbox.publishedAt) {
      const fullRuntimePublication = await publishJobOutboxRow(
        fullRuntimeOutbox.id,
        new PostgresPullJobTransportAdapter(),
      );
      if (fullRuntimePublication.state !== "published") {
        throw new Error(`FULL_APP_SUMMARY_ACTION_PUBLICATION_${fullRuntimePublication.state}`);
      }
    }
  }

  const executorRegistry = createJobExecutorRegistry([{
    jobType: "research_notes.summarize",
    executionClass: "long",
    contractVersions: new Set(["mini-app-research-v1"]),
    executor: createResearchNotesSummaryExecutor({
      loadNote: loadResearchNoteForSummary,
      saveSummary: saveResearchNoteSummary,
      summarize: async input => `Synthetic background summary for ${input.title}.`,
    }),
  }]);
  const execution = await runPostgresNodeJobWorkerOnce({
    runnerId: "mini-app-research-worker-runtime-test",
    batchSize: 10,
    initialDispatchCount: 10,
    executorRegistry,
  });
  if (!execution.some(item => item.jobId === requested.jobId && item.state === "succeeded")) {
    throw new Error("RESEARCH_NOTES_SUMMARY_WORKER_EXECUTION_FAILED");
  }
  if (fullRuntimeRequest && !execution.some(item => item.jobId === fullRuntimeRequest.jobId && item.state === "succeeded")) {
    throw new Error("FULL_APP_SUMMARY_ACTION_WORKER_EXECUTION_FAILED");
  }

  if (fullRuntimeRequest) {
    const [fullRuntimeJob] = await db.select().from(workerJobs)
      .where(eq(workerJobs.id, fullRuntimeRequest.jobId)).limit(1);
    const [fullRuntimeSettlement] = await db.select().from(workerJobSettlements)
      .where(and(eq(workerJobSettlements.workerJobId, fullRuntimeRequest.jobId), eq(workerJobSettlements.settlementType, "result")))
      .limit(1);
    const fullRuntimeSummary = await getResearchNoteSummaryJob({
      ...scope, projectId, noteId: fullRuntimeRequest.noteId, jobId: fullRuntimeRequest.jobId,
    });
    if (fullRuntimeJob?.status !== "succeeded" || !fullRuntimeSettlement || fullRuntimeSummary?.status !== "succeeded") {
      throw new Error("FULL_APP_SUMMARY_ACTION_SETTLEMENT_MISSING");
    }
    console.log("FULL_APP_BACKGROUND_ACTION_SETTLEMENT_PASS");
  }

  const [job] = await db.select().from(workerJobs).where(eq(workerJobs.id, requested.jobId)).limit(1);
  const [settlement] = await db.select().from(workerJobSettlements)
    .where(and(eq(workerJobSettlements.workerJobId, requested.jobId), eq(workerJobSettlements.settlementType, "result")))
    .limit(1);
  const saved = await getResearchNoteSummaryJob({ ...scope, projectId, noteId: note.noteId, jobId: requested.jobId });
  if (job?.status !== "succeeded" || !settlement || saved?.status !== "succeeded") {
    throw new Error("RESEARCH_NOTES_SUMMARY_SETTLEMENT_EVIDENCE_MISSING");
  }

  const duplicateExecution = await runPostgresNodeJobWorkerOnce({
    runnerId: "mini-app-research-worker-runtime-test",
    batchSize: 10,
    initialDispatchCount: 10,
    executorRegistry,
  });
  if (duplicateExecution.some(item => item.jobId === requested.jobId || item.jobId === fullRuntimeRequest?.jobId)) {
    throw new Error("RESEARCH_NOTES_SUMMARY_REDISPATCHED_AFTER_SETTLEMENT");
  }

  const retryNote = await createResearchNote({
    ...scope,
    projectId,
    title: "Worker retry acceptance",
    content: "A synthetic note used to exercise transient worker recovery.",
  });
  const retryRequest = await requestResearchNoteSummary({ ...scope, userId, projectId, noteId: retryNote.noteId });
  const [retryJobBefore] = await db.select().from(workerJobs).where(eq(workerJobs.id, retryRequest.jobId)).limit(1);
  if (!retryJobBefore) throw new Error("RESEARCH_NOTES_RETRY_JOB_MISSING");
  await db.update(workerJobs).set({
    retryPolicyJson: { ...(retryJobBefore.retryPolicyJson ?? {}), baseDelayMs: 0, maxDelayMs: 0, jitter: "none" },
  }).where(eq(workerJobs.id, retryRequest.jobId));
  let retryExecutionCount = 0;
  const [initialRetryOutbox] = await db.select().from(workerJobOutbox)
    .where(eq(workerJobOutbox.workerJobId, retryRequest.jobId)).limit(1);
  if (!initialRetryOutbox) throw new Error("RESEARCH_NOTES_RETRY_OUTBOX_MISSING");
  const initialRetryPublication = await publishJobOutboxRow(initialRetryOutbox.id, new PostgresPullJobTransportAdapter());
  if (initialRetryPublication.state !== "published") throw new Error(`RESEARCH_NOTES_RETRY_PUBLICATION_${initialRetryPublication.state}`);
  const retryRegistry = createJobExecutorRegistry([{
    jobType: "research_notes.summarize",
    executionClass: "long",
    contractVersions: new Set(["mini-app-research-v1"]),
    executor: createResearchNotesSummaryExecutor({
      loadNote: loadResearchNoteForSummary,
      saveSummary: saveResearchNoteSummary,
      summarize: async input => {
        retryExecutionCount += 1;
        if (retryExecutionCount === 1) {
          const error = new Error("Synthetic transient failure before provider execution") as Error & { class: "retryable"; diagnosticCode: string };
          error.class = "retryable";
          error.diagnosticCode = "RESEARCH_NOTES_SYNTHETIC_RETRY";
          throw error;
        }
        return `Recovered synthetic summary for ${input.title}.`;
      },
    }),
  }]);
  const firstRetryPoll = await runPostgresNodeJobWorkerOnce({
    runnerId: "mini-app-research-worker-runtime-test",
    batchSize: 10,
    initialDispatchCount: 10,
    executorRegistry: retryRegistry,
  });
  const [retryScheduled] = await db.select().from(workerJobs).where(eq(workerJobs.id, retryRequest.jobId)).limit(1);
  if (retryScheduled?.status !== "retry_scheduled" || !firstRetryPoll.some(item => item.jobId === retryRequest.jobId && item.state === "error")) {
    throw new Error("RESEARCH_NOTES_TRANSIENT_FAILURE_NOT_RETRY_SCHEDULED");
  }
  const controlPlane = createJobControlPlane();
  let ownershipDenied = false;
  try {
    await controlPlane.makeRetryDue(retryRequest.jobId, undefined, undefined, "test_wrong_tenant", { tenantId: "other-tenant" });
  } catch {
    ownershipDenied = true;
  }
  if (!ownershipDenied) throw new Error("RESEARCH_NOTES_RETRY_CROSS_TENANT_OWNERSHIP_NOT_ENFORCED");
  const recovered = await controlPlane.makeRetryDue(retryRequest.jobId, undefined, undefined, "test_retry_recovery", { tenantId });
  if (!recovered) throw new Error("RESEARCH_NOTES_RETRY_RECOVERY_NOT_ACCEPTED");
  const retryOutbox = await db.select().from(workerJobOutbox).where(eq(workerJobOutbox.workerJobId, retryRequest.jobId));
  if (!retryOutbox.some(item => item.publishedAt === null && item.cancelledAt === null)) {
    throw new Error("RESEARCH_NOTES_RETRY_OUTBOX_INTENT_MISSING");
  }
  await publishJobOutboxRow(retryOutbox.find(item => item.publishedAt === null && item.cancelledAt === null)!.id, new PostgresPullJobTransportAdapter());
  const recoveryPoll = await runPostgresNodeJobWorkerOnce({
    runnerId: "mini-app-research-worker-runtime-test",
    batchSize: 10,
    initialDispatchCount: 10,
    executorRegistry: retryRegistry,
  });
  const [recoveredJob] = await db.select().from(workerJobs).where(eq(workerJobs.id, retryRequest.jobId)).limit(1);
  const recoveredSummary = await getResearchNoteSummaryJob({ ...scope, projectId, noteId: retryNote.noteId, jobId: retryRequest.jobId });
  if (retryExecutionCount !== 2 || recoveredJob?.status !== "succeeded" || recoveredJob.attempt !== 2 || recoveredSummary?.status !== "succeeded" || !recoveryPoll.some(item => item.jobId === retryRequest.jobId && item.state === "succeeded")) {
    throw new Error("RESEARCH_NOTES_RETRY_RECOVERY_EXECUTION_FAILED");
  }
  const failureNote = await createResearchNote({
    ...scope,
    projectId,
    title: "Worker terminal failure acceptance",
    content: "A synthetic note used to exercise terminal job failure.",
  });
  const failureRequest = await requestResearchNoteSummary({ ...scope, userId, projectId, noteId: failureNote.noteId });
  const [failureOutbox] = await db.select().from(workerJobOutbox)
    .where(eq(workerJobOutbox.workerJobId, failureRequest.jobId)).limit(1);
  if (!failureOutbox) throw new Error("RESEARCH_NOTES_FAILURE_OUTBOX_MISSING");
  const failurePublication = await publishJobOutboxRow(failureOutbox.id, new PostgresPullJobTransportAdapter());
  if (failurePublication.state !== "published") throw new Error(`RESEARCH_NOTES_FAILURE_PUBLICATION_${failurePublication.state}`);
  const permanentFailureRegistry = createJobExecutorRegistry([{
    jobType: "research_notes.summarize",
    executionClass: "long",
    contractVersions: new Set(["mini-app-research-v1"]),
    executor: createResearchNotesSummaryExecutor({
      loadNote: loadResearchNoteForSummary,
      saveSummary: saveResearchNoteSummary,
      summarize: async () => {
        const error = new Error("Synthetic permanent input failure") as Error & { class: "permanent"; diagnosticCode: string };
        error.class = "permanent";
        error.diagnosticCode = "RESEARCH_NOTES_SYNTHETIC_PERMANENT";
        throw error;
      },
    }),
  }]);
  const failurePoll = await runPostgresNodeJobWorkerOnce({
    runnerId: "mini-app-research-worker-runtime-test",
    batchSize: 10,
    initialDispatchCount: 10,
    executorRegistry: permanentFailureRegistry,
  });
  const [failedJob] = await db.select().from(workerJobs).where(eq(workerJobs.id, failureRequest.jobId)).limit(1);
  const failureEvents = await db.select().from(workerJobEvents)
    .where(eq(workerJobEvents.workerJobId, failureRequest.jobId));
  if (failedJob?.status !== "failed" || !failurePoll.some(item => item.jobId === failureRequest.jobId && item.state === "error") || !failureEvents.some(item => item.eventType === "FAILED")) {
    throw new Error(`RESEARCH_NOTES_PERMANENT_FAILURE_NOT_SETTLED:${JSON.stringify({ status: failedJob?.status, poll: failurePoll.find(item => item.jobId === failureRequest.jobId), events: failureEvents.map(item => item.eventType) })}`);
  }

  console.log(JSON.stringify({
    result: "RESEARCH_NOTES_BACKGROUND_WORKER_PASS",
    jobId: requested.jobId,
    outboxPublication: publication.state,
    workerExecution: execution.find(item => item.jobId === requested.jobId)?.state,
    finalStatus: job.status,
    settlementRecorded: true,
    duplicateAdmissionReusedJob: true,
    duplicateExecutionIgnored: true,
    transientFailureScheduledRetry: retryScheduled.status === "retry_scheduled",
    crossTenantRetryDenied: ownershipDenied,
    dueRetryRecovered: recoveredJob.status === "succeeded" && recoveredJob.attempt === 2,
    retryOutboxPublished: true,
    permanentFailureSettled: failedJob.status === "failed" && failureEvents.some(item => item.eventType === "FAILED"),
    provider: "synthetic_cost_free_executor_dependency",
  }));
} finally {
  await closeDb();
}
