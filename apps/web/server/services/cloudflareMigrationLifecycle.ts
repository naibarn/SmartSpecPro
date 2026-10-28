import { createHash } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DrizzleDB } from "../db";
import { systemSettings, workerJobs } from "../../drizzle/schema";
import { readProductionDatabaseReadbackObservation } from "./cloudflareProductionDatabaseReconciliation";
import { HTTP_RUNTIME_JOB, HTTP_RUNTIME_CONTRACT, httpRuntimeJobSchema } from "./cloudflareHttpRuntimeContract";
import { readCompensatedHttpApplicationAcceptance, readCompensatedHttpRuntime } from "./cloudflareHttpRuntimeContinuation";
import { verifyM3ParityEvidence, type M3ParityOperation } from "./cloudflareM3AcceptanceEvidence";
import { M3_PARITY_CONTRACT, M3_PARITY_JOB } from "./cloudflareM3ParityJobContract";
import { CLOUDFLARE_PRODUCTION_DEPLOYMENT_CONTRACT } from "./cloudflareProductionDeploymentContract";

const modes = ["FIRST_MIGRATION", "STEADY_STATE_DEPLOYMENT"] as const;
export const migrationContinuationSchema = z.object({
  migrationMode: z.enum(modes),
  architecture: z.literal("HYBRID_INGRESS"),
  agentCapacity: z.enum(["AVAILABLE", "WAITING_AGENT_CAPACITY"]),
  engineeringCheckpoint: z.enum(["ENGINEERING", "READY_FOR_EXECUTION", "REPAIR_REQUIRED", "WAITING_EXTERNAL_AUTHORITY"]),
  handoffRef: z.literal("orchestra/tasks/cloudflare-delegated-staging-20261017/origin-completion/production-cutover/implementation/HANDOFF.md"),
}).strict();
export type MigrationContinuation = z.infer<typeof migrationContinuationSchema>;
type Scope = { tenantId: string; projectId: string };
type Job = {
  id: string; tenantId: string; status: string; jobType: string; contractVersion: string;
  inputJson: Record<string, unknown>; outputJson: Record<string, unknown> | null;
  errorCode: string | null; leaseExpiresAt?: Date | null; requestedByUserId?: number | null;
  finishedAt?: Date | null;
};

type VerifiedMigrationEvidence = {
  applicationJobIds?: readonly string[];
  runtimeJobIds?: readonly string[];
  parityJobIds?: Partial<Record<M3ParityOperation, readonly string[]>>;
};

export function migrationMissionId(scope: Scope) {
  return `cf-migration:${createHash("sha256").update(`${scope.tenantId}|${scope.projectId}|production|smartspec-cloudflare-runtime`).digest("hex").slice(0, 32)}`;
}

/** Read model, never an approval or a second job/receipt registry. Successful
 * checkpoints survive later failures, grant expiry, and agent replacement. */
export function projectCloudflareMigration(scope: Scope, continuation: MigrationContinuation | null, jobs: Job[], now = new Date(), verifiedDatabaseJobIds: readonly string[] = [], verified: VerifiedMigrationEvidence = {}) {
  const scoped = jobs.filter(job => job.tenantId === scope.tenantId && job.inputJson.projectId === scope.projectId &&
    ((job.inputJson.environment === "production" && job.inputJson.targetId === "smartspec-cloudflare-runtime") ||
      (job.jobType === HTTP_RUNTIME_JOB && job.contractVersion === HTTP_RUNTIME_CONTRACT && httpRuntimeJobSchema.safeParse(job.inputJson).success) ||
      (job.jobType.startsWith(`${M3_PARITY_JOB}.`) && job.contractVersion === M3_PARITY_CONTRACT &&
        job.inputJson.contractVersion === M3_PARITY_CONTRACT && typeof job.inputJson.candidateJobId === "string")));
  const ingress = scoped.filter(job => job.jobType === "cloudflare.production.deploy" &&
    job.contractVersion === "cloudflare-production-ingress-v1");
  const acceptedIngress = ingress.findLast(job => job.status === "succeeded" &&
    job.outputJson?.productionTrafficShifted === true &&
    (job.outputJson.authenticatedAcceptance as { verified?: boolean } | undefined)?.verified === true &&
    typeof job.outputJson.routeId === "string" && typeof job.outputJson.deploymentId === "string" &&
    typeof job.outputJson.versionId === "string");
  // Provider readback by itself never constitutes real SQL acceptance.
  const acceptedDatabase = scoped.findLast(job => job.jobType === "cloudflare.production.database.provision" &&
    ((job.status === "succeeded" && job.outputJson?.databaseConnectionVerified === true && job.outputJson?.tenantIsolationVerified === true) ||
      verifiedDatabaseJobIds.includes(job.id)));
  const acceptedApplication = scoped.findLast(job => job.jobType === HTTP_RUNTIME_JOB && job.inputJson.operation === "application" &&
    job.status === "succeeded" && verified.applicationJobIds?.includes(job.id));
  const acceptedRuntime = scoped.findLast(job => job.jobType === HTTP_RUNTIME_JOB && job.inputJson.operation !== "application" &&
    job.status === "succeeded" && verified.runtimeJobIds?.includes(job.id));
  const workerDeploymentJobs = scoped.filter(job => job.jobType === "cloudflare.production.deploy" &&
    job.contractVersion === CLOUDFLARE_PRODUCTION_DEPLOYMENT_CONTRACT);
  const latestWorkerDeployment = workerDeploymentJobs.at(-1);
  const acceptedWorkerDeployment = latestWorkerDeployment?.status === "succeeded" &&
    latestWorkerDeployment.inputJson.action === "deploy" &&
    (latestWorkerDeployment.inputJson.rolloutStage === "canary" || latestWorkerDeployment.inputJson.rolloutStage === "promote") &&
    /^[a-f0-9-]{36}$/i.test(String(latestWorkerDeployment.outputJson?.deploymentId ?? "")) &&
    /^[a-f0-9-]{36}$/i.test(String(latestWorkerDeployment.outputJson?.candidateVersionId ?? "")) &&
    Array.isArray(latestWorkerDeployment.outputJson.versions) &&
    latestWorkerDeployment.outputJson.versions.some((version: any) => version?.versionId === latestWorkerDeployment.outputJson?.candidateVersionId) &&
    typeof latestWorkerDeployment.outputJson.queueConsumer === "object" && latestWorkerDeployment.outputJson.queueConsumer !== null &&
    (latestWorkerDeployment.outputJson.queueConsumer as Record<string, unknown>).queueName === "smartspec-canonical-job-queue-production" &&
    (latestWorkerDeployment.outputJson.queueConsumer as Record<string, unknown>).scriptName === "smartspec-cloudflare-runtime" &&
    (latestWorkerDeployment.outputJson.queueConsumer as Record<string, unknown>).deadLetterQueueName === "smartspec-canonical-job-queue-production-dlq" &&
    /^[a-f0-9]{32}$/.test(String((latestWorkerDeployment.outputJson.queueConsumer as Record<string, unknown>).queueId ?? ""))
      ? latestWorkerDeployment : undefined;
  const acceptedCreditBilling = scoped.findLast(job => job.jobType === `${M3_PARITY_JOB}.credit_billing_acceptance` &&
    job.contractVersion === M3_PARITY_CONTRACT && job.status === "succeeded" &&
    verified.parityJobIds?.credit_billing_acceptance?.includes(job.id));
  const acceptedQueueRecovery = scoped.findLast(job => job.jobType === `${M3_PARITY_JOB}.queue_recovery_acceptance` &&
    job.contractVersion === M3_PARITY_CONTRACT && job.status === "succeeded" &&
    verified.parityJobIds?.queue_recovery_acceptance?.includes(job.id));
  const active = scoped.findLast(job => ["pending", "queued", "claimed", "leased", "preparing", "running", "waiting_external", "retry_scheduled"].includes(job.status));
  const lastIngress = ingress.at(-1);
  const ingressRolledBack = lastIngress?.status === "succeeded" && lastIngress.inputJson.action === "ingress-rollback";
  // Reconciled SQL/isolation evidence closes the database milestone without
  // rewriting its historical failed provisioning attempt or issuing Attempt 5.
  const acceptedIds = new Set([acceptedDatabase?.id, acceptedApplication?.id, acceptedRuntime?.id,
    acceptedWorkerDeployment?.id, acceptedCreditBilling?.id, acceptedQueueRecovery?.id].filter(Boolean));
  const latestJob = scoped.at(-1);
  const last = latestJob && !acceptedIds.has(latestJob.id) ? latestJob : undefined;
  const databaseFailure = scoped.findLast(job => job.jobType === "cloudflare.production.database.provision" && job.status === "failed");
  let state: string = continuation?.engineeringCheckpoint ?? "ENGINEERING";
  if (active) state = ["pending", "queued", "retry_scheduled"].includes(active.status) ? "AUTHORIZED" : "EXECUTING";
  else if (last && ["failed", "expired", "cancelled"].includes(last.status)) state = "REPAIR_REQUIRED";
  else if (acceptedIngress && !ingressRolledBack && acceptedDatabase && acceptedApplication && acceptedRuntime &&
    acceptedWorkerDeployment && acceptedCreditBilling && acceptedQueueRecovery) state = "M3_ACCEPTED";
  else if (acceptedIngress && !ingressRolledBack && acceptedDatabase) state = "M3_IN_PROGRESS";
  else if (acceptedIngress && ingressRolledBack) state = "M2_ROLLED_BACK";
  else if (acceptedIngress) state = acceptedDatabase ? "M1_ACCEPTED" : "M2_ACCEPTED";
  if (!active && continuation?.agentCapacity === "WAITING_AGENT_CAPACITY") state = "WAITING_AGENT_CAPACITY";
  const staleLease = active?.status === "running" && (!active.leaseExpiresAt || active.leaseExpiresAt <= now);
  if (staleLease) state = "REPAIR_REQUIRED";
  if (last?.errorCode && /COMPENSATION_REQUIRES_REVIEW|ROUTE_SUBMISSION_UNKNOWN|WRITE_UNCERTAIN/.test(last.errorCode)) state = "ROLLBACK_REQUIRED";
  return {
    campaignId: migrationMissionId(scope), migrationMode: continuation?.migrationMode ?? "STEADY_STATE_DEPLOYMENT",
    state, architecture: continuation?.architecture ?? "HYBRID_INGRESS",
    // No mission expiry, operation-budget reset, or inferred delegation.
    missionExpiresAt: null, campaignAuthority: "NOT_AUTHORIZED" as const,
    agentCapacity: continuation?.agentCapacity ?? "AVAILABLE", handoffRef: continuation?.handoffRef ?? null,
    engineeringCheckpoint: continuation?.engineeringCheckpoint ?? "ENGINEERING",
    completedCheckpoints: [acceptedDatabase && "M1_ACCEPTED", acceptedIngress && "M2_ACCEPTED",
      acceptedApplication && "APPLICATION_ACCEPTED", acceptedWorkerDeployment && "WORKER_DEPLOYMENT_VERIFIED",
      acceptedCreditBilling && "CREDIT_BILLING_ACCEPTED", acceptedQueueRecovery && "QUEUE_RECOVERY_ACCEPTED",
      acceptedRuntime && "BOUNDED_RUNTIME_ACCEPTED",
      acceptedDatabase && acceptedIngress && !ingressRolledBack && acceptedApplication && acceptedRuntime &&
        acceptedWorkerDeployment && acceptedCreditBilling && acceptedQueueRecovery && "M3_ACCEPTED"].filter(Boolean),
    milestones: {
      m1: acceptedDatabase ? "ACCEPTED" : "INCOMPLETE",
      m2: acceptedIngress && !ingressRolledBack ? "ACCEPTED" : ingressRolledBack ? "ROLLED_BACK" : "INCOMPLETE",
      application: acceptedApplication ? "ACCEPTED" : "INCOMPLETE",
      workerDeployment: acceptedWorkerDeployment ? "VERIFIED" : "INCOMPLETE",
      creditBilling: acceptedCreditBilling ? "ACCEPTED" : "INCOMPLETE",
      queueRecovery: acceptedQueueRecovery ? "ACCEPTED" : "INCOMPLETE",
      boundedRuntime: acceptedRuntime ? "ACCEPTED" : "INCOMPLETE",
      m3: acceptedDatabase && acceptedIngress && !ingressRolledBack && acceptedApplication && acceptedRuntime &&
        acceptedWorkerDeployment && acceptedCreditBilling && acceptedQueueRecovery ? "ACCEPTED" : "INCOMPLETE",
      nativeActivation: "NOT_VERIFIED",
      finalProductionCutover: "NOT_VERIFIED",
    },
    currentMilestone: !acceptedIngress || ingressRolledBack ? "M2" : !acceptedDatabase ? "M1" :
      !acceptedApplication || !acceptedRuntime || !acceptedWorkerDeployment || !acceptedCreditBilling || !acceptedQueueRecovery ? "M3" : "NATIVE_ACTIVATION",
    nextOperation: staleLease ? "RECONCILE_CANONICAL_LEASE" : active ? "MONITOR_EXISTING_CANONICAL_JOB" :
      acceptedIngress && acceptedDatabase && !ingressRolledBack && acceptedApplication && acceptedRuntime && acceptedWorkerDeployment &&
        acceptedCreditBilling && acceptedQueueRecovery ? "PREPARE_NATIVE_ACTIVATION_PLAN" :
      acceptedIngress && acceptedDatabase && !ingressRolledBack && !acceptedApplication ? "APPLICATION_ACCEPTANCE" :
      acceptedIngress && acceptedDatabase && !ingressRolledBack && !acceptedRuntime ? "BOUNDED_RUNTIME_ACCEPTANCE" :
      acceptedIngress && acceptedDatabase && !ingressRolledBack && !acceptedWorkerDeployment ? "WORKER_DEPLOYMENT_READINESS" :
      acceptedIngress && acceptedDatabase && !ingressRolledBack && !acceptedCreditBilling ? "CREDIT_BILLING_ACCEPTANCE" :
      acceptedIngress && acceptedDatabase && !ingressRolledBack && !acceptedQueueRecovery ? "QUEUE_RECOVERY_ACCEPTANCE" :
      acceptedIngress && acceptedDatabase && !ingressRolledBack ? "M3_REMAINING_PARITY_ACCEPTANCE" :
      acceptedIngress && !ingressRolledBack ? "PRESERVE_INGRESS_REPAIR_DATABASE_AND_RUNTIME" : "REPAIR_PREFLIGHT_THEN_AUTHORIZE_EXACT_OPERATION",
    activeJobId: active?.id ?? null,
    ingressReceipt: acceptedIngress && !ingressRolledBack ? { jobId: acceptedIngress.id, routeId: String(acceptedIngress.outputJson!.routeId),
      deploymentId: String(acceptedIngress.outputJson!.deploymentId), versionId: String(acceptedIngress.outputJson!.versionId) } : null,
    jobHistory: scoped.map(job => ({ jobId: job.id, status: job.status, errorCode: job.errorCode,
      grantRef: typeof job.inputJson.grantRef === "string" ? job.inputJson.grantRef : null,
      artifactRef: typeof job.inputJson.artifactRef === "string" ? job.inputJson.artifactRef : null })),
    blocker: staleLease ? "CANONICAL_LEASE_RECONCILIATION_REQUIRED" : last?.errorCode ?? (!acceptedDatabase ? databaseFailure?.errorCode ?? null : null),
    finalAcceptance: "M2 + real Cloudflare SQL/tenant isolation + native application parity + production/dev separation",
  };
}

const category = "cloudflare_production_ingress_submissions";
async function readSubmissionRows(db: DrizzleDB, scope: Scope) {
  return db.select().from(systemSettings).where(and(eq(systemSettings.category, category),
    sql`${systemSettings.valueJson}->>'tenantId' = ${scope.tenantId}`,
    sql`${systemSettings.valueJson}->>'projectId' = ${scope.projectId}`)).orderBy(asc(systemSettings.id));
}

/** Engineering metadata extends the first existing mission submission. It does
 * not mint grants, impersonate its Owner, or copy provider/job authorities. */
export async function recordMigrationContinuation(db: DrizzleDB, scope: Scope, value: MigrationContinuation) {
  const continuation = migrationContinuationSchema.parse(value);
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${migrationMissionId(scope)}))`);
    const rows = await readSubmissionRows(tx as unknown as DrizzleDB, scope);
    const first = rows[0];
    if (!first || first.isSensitive) throw new Error("MIGRATION_EXISTING_MISSION_REQUIRED");
    await tx.update(systemSettings).set({
      valueJson: { ...first.valueJson, migrationContinuation: continuation }, updatedAt: new Date(),
    }).where(eq(systemSettings.id, first.id));
    return { campaignId: migrationMissionId(scope), authorityChanged: false };
  });
}

export async function getCloudflareMigrationMission(db: DrizzleDB, scope: Scope) {
  // Router input also contains environment; do not extend the exact evidence
  // identity with unrelated request properties at runtime.
  scope = { tenantId: scope.tenantId, projectId: scope.projectId };
  const rows = await readSubmissionRows(db, scope);
  const parsed = migrationContinuationSchema.safeParse((rows[0]?.valueJson as Record<string, unknown> | null)?.migrationContinuation);
  const jobs = await db.select().from(workerJobs).where(and(eq(workerJobs.tenantId, scope.tenantId),
    sql`${workerJobs.inputJson}->>'projectId' = ${scope.projectId}`,
    sql`${workerJobs.jobType} IN ('cloudflare.production.deploy', 'cloudflare.production.database.provision', ${HTTP_RUNTIME_JOB},
      ${`${M3_PARITY_JOB}.credit_billing_acceptance`}, ${`${M3_PARITY_JOB}.queue_recovery_acceptance`})`)).orderBy(asc(workerJobs.createdAt));
  const verifiedDatabaseJobIds: string[] = [];
  const verifiedApplicationJobIds: string[] = [];
  const verifiedRuntimeJobIds: string[] = [];
  for (const job of jobs) {
    if (job.jobType === "cloudflare.production.database.provision" && typeof job.inputJson.planDigest === "string") {
      const evidence = await readProductionDatabaseReadbackObservation(db, {
        ...scope, jobId: job.id, planDigest: job.inputJson.planDigest,
      });
      if (evidence?.acceptance === "M1_ACCEPTED" && evidence.databaseConnectionVerified && evidence.tenantIsolationVerified)
        verifiedDatabaseJobIds.push(job.id);
      continue;
    }
    if (job.jobType !== HTTP_RUNTIME_JOB || job.status !== "succeeded" || !job.requestedByUserId ||
        typeof job.inputJson.candidateJobId !== "string") continue;
    const runtimeScope = { ...scope, actorUserId: job.requestedByUserId };
    try {
      if (job.inputJson.operation === "application") {
        const evidence = await readCompensatedHttpApplicationAcceptance(db, runtimeScope, job.inputJson.candidateJobId, job.id);
        if (evidence?.authenticatedApplicationAccepted === true) verifiedApplicationJobIds.push(job.id);
      } else {
        const evidence = await readCompensatedHttpRuntime(db, runtimeScope, job.inputJson.candidateJobId, job.id);
        if (evidence?.jobId === job.id) verifiedRuntimeJobIds.push(job.id);
      }
    } catch { /* Invalid or incomplete historical records are not acceptance evidence. */ }
  }
  const acceptedApplication = jobs.findLast(job => verifiedApplicationJobIds.includes(job.id));
  const parityJobIds: Partial<Record<M3ParityOperation, string[]>> = {};
  if (acceptedApplication?.requestedByUserId && typeof acceptedApplication.inputJson.candidateJobId === "string") {
    const acceptanceScope = { ...scope, actorUserId: acceptedApplication.requestedByUserId,
      candidateJobId: acceptedApplication.inputJson.candidateJobId };
    for (const operation of ["credit_billing_acceptance", "queue_recovery_acceptance"] as const) {
      for (const job of jobs) {
        const input = job.inputJson as Record<string, unknown>;
        if (job.jobType !== `${M3_PARITY_JOB}.${operation}` || job.contractVersion !== M3_PARITY_CONTRACT ||
            job.status !== "succeeded" || job.requestedByUserId !== acceptanceScope.actorUserId ||
            input.candidateJobId !== acceptanceScope.candidateJobId || !job.finishedAt) continue;
        const evidence = verifyM3ParityEvidence({ scope: acceptanceScope, operation, job: {
          id: job.id, status: job.status, tenantId: job.tenantId, requestedByUserId: job.requestedByUserId,
          projectId: input.projectId, candidateJobId: input.candidateJobId, operation: input.operation,
          planDigest: input.planDigest, finishedAt: job.finishedAt.toISOString(),
        }, receipt: job.outputJson });
        if (evidence.accepted) (parityJobIds[operation] ??= []).push(job.id);
      }
    }
  }
  return projectCloudflareMigration(scope, parsed.success ? parsed.data : null, jobs as Job[], new Date(), verifiedDatabaseJobIds, {
    applicationJobIds: verifiedApplicationJobIds, runtimeJobIds: verifiedRuntimeJobIds, parityJobIds,
  });
}
