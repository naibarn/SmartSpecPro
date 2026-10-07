import { and, eq } from "drizzle-orm";

import { closeDb, db, getDb } from "../server/db";
import { workerJobOutbox, workerJobSettlements, workerJobs } from "../drizzle/schema";
import { runPostgresNodeJobWorkerOnce } from "../server/jobs/postgresNodeJobWorker";
import { createJobExecutorRegistry } from "../server/services/jobExecutorRegistry";
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
  if (duplicateExecution.some(item => item.jobId === requested.jobId)) {
    throw new Error("RESEARCH_NOTES_SUMMARY_REDISPATCHED_AFTER_SETTLEMENT");
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
    provider: "synthetic_cost_free_executor_dependency",
  }));
} finally {
  await closeDb();
}
