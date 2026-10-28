import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DrizzleDB } from "../db";
import { systemSettings, workerJobs } from "../../drizzle/schema";
import { createControlPlaneJob } from "./jobControlPlaneGateway";
import { assertHttpCandidateOwner } from "./cloudflareHttpCandidatePreparation";
import { readHttpRuntimeIntent } from "./cloudflareHttpRuntimeAdmission";
import { readCompensatedHttpApplicationAcceptance } from "./cloudflareHttpRuntimeContinuation";
import { digestM3ParityPlan } from "./cloudflareM3ParityContract";
import {
  M3_PARITY_CATEGORY,
  M3_PARITY_CONTRACT,
  M3_PARITY_JOB,
} from "./cloudflareM3ParityJobContract";
import {
  CLOUDFLARE_PRODUCTION_QUEUE_DLQ_NAME,
  CLOUDFLARE_PRODUCTION_QUEUE_NAME,
} from "./cloudflareProductionQueueProvision";
import { verifyM3ParityEvidence } from "./cloudflareM3AcceptanceEvidence";
import { probeCloudflareProductionProviderInventory } from "./cloudflareProductionProviderInventory";
import { resolveCloudflareStagingModules } from "./cloudflareStagingArtifactAuthority";
import { verifyM3QueueWorkerReadiness } from "./cloudflareM3QueueWorkerReadiness";

type Scope = {
  tenantId: string;
  projectId: string;
  actorUserId: number;
  candidateJobId: string;
};
const active = [
  "pending",
  "queued",
  "leased",
  "claimed",
  "preparing",
  "running",
  "waiting_external",
  "retry_scheduled",
] as const;
function jobType(
  operation: "credit_billing_acceptance" | "queue_recovery_acceptance"
) {
  return `${M3_PARITY_JOB}.${operation}`;
}

async function reviewedPlan(
  db: DrizzleDB,
  scope: Scope,
  operation: "credit_billing_acceptance" | "queue_recovery_acceptance"
) {
  await assertHttpCandidateOwner(db, scope);
  const acceptance = await readCompensatedHttpApplicationAcceptance(
    db,
    scope,
    scope.candidateJobId
  );
  if (!acceptance?.authenticatedApplicationAccepted)
    throw Error("M3_PARITY_APPLICATION_ACCEPTANCE_REQUIRED");
  const intent = await readHttpRuntimeIntent(db, acceptance.jobId);
  const value = intent?.valueJson as Record<string, any> | undefined;
  const app = value?.plan;
  if (
    intent?.updatedBy !== scope.actorUserId ||
    value?.tenantId !== scope.tenantId ||
    value?.projectId !== scope.projectId ||
    value?.actorUserId !== scope.actorUserId ||
    value?.operation !== "application" ||
    value?.planDigest !== acceptance.planDigest ||
    app?.candidateJobId !== scope.candidateJobId ||
    app?.publication?.verified !== true ||
    !/^sha256:[a-f0-9]{64}$/.test(app.artifactRef ?? "") ||
    !/^[a-f0-9]{40}$/.test(app.workerSourceSha ?? "")
  )
    throw Error("M3_PARITY_APPLICATION_RECEIPT_INVALID");
  const [queueJob] = await db
    .select({ output: workerJobs.outputJson, input: workerJobs.inputJson })
    .from(workerJobs)
    .where(
      and(
        eq(workerJobs.tenantId, scope.tenantId),
        eq(workerJobs.requestedByUserId, scope.actorUserId),
        eq(workerJobs.jobType, "cloudflare.production.queue.provision"),
        eq(
          workerJobs.contractVersion,
          "cloudflare-production-queue-provision-v1"
        ),
        eq(workerJobs.status, "succeeded"),
        sql`${workerJobs.inputJson}->>'projectId'=${scope.projectId}`
      )
    )
    .orderBy(desc(workerJobs.createdAt))
    .limit(1);
  const queueOutput = queueJob?.output as Record<string, unknown> | null;
  const queueInput = queueJob?.input as Record<string, unknown> | null;
  const queueId = queueOutput?.queueId;
  const deadLetterQueueId = queueOutput?.deadLetterQueueId;
  if (
    queueInput?.targetId !== "smartspec-cloudflare-runtime" ||
    queueInput.environment !== "production" ||
    queueOutput?.queueName !== CLOUDFLARE_PRODUCTION_QUEUE_NAME ||
    queueOutput.deadLetterQueueName !== CLOUDFLARE_PRODUCTION_QUEUE_DLQ_NAME ||
    typeof queueId !== "string" ||
    !/^[a-f0-9]{32}$/.test(queueId) ||
    typeof deadLetterQueueId !== "string" ||
    !/^[a-f0-9]{32}$/.test(deadLetterQueueId)
  )
    throw Error("M3_PARITY_PRODUCTION_QUEUE_RECEIPT_REQUIRED");
  const reviewed = digestM3ParityPlan({
    schemaVersion: "cloudflare-m3-parity-plan-v1",
    operation,
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    actorUserId: scope.actorUserId,
    candidateJobId: scope.candidateJobId,
    applicationJobId: acceptance.jobId,
    sourceSha: app.publication.sourceSha,
    artifactRef: app.artifactRef,
    queueId,
    queueName: CLOUDFLARE_PRODUCTION_QUEUE_NAME,
    deadLetterQueueId,
    deadLetterQueueName: CLOUDFLARE_PRODUCTION_QUEUE_DLQ_NAME,
    syntheticOnly: true,
    realCharges: false,
    providerCalls: false,
    trafficMutation: false,
    maxSyntheticCredits: 30,
    maxSyntheticJobs: 4,
    maxDurationSeconds: 600,
    maxContainerStarts: 0,
    compensationRequired: true,
  });
  return reviewed;
}

export async function getM3ParityOperation(
  db: DrizzleDB,
  scope: Scope,
  operation: "credit_billing_acceptance" | "queue_recovery_acceptance",
  submissionId?: string
) {
  if (submissionId) {
    const [intent] = await db
      .select()
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.category, M3_PARITY_CATEGORY),
          eq(systemSettings.key, submissionId)
        )
      )
      .limit(1);
    const value = intent?.valueJson as Record<string, any> | undefined;
    if (
      intent &&
      (intent.updatedBy !== scope.actorUserId ||
        value?.tenantId !== scope.tenantId ||
        value.projectId !== scope.projectId ||
        value.actorUserId !== scope.actorUserId ||
        value.operation !== operation ||
        value.candidateJobId !== scope.candidateJobId)
    )
      throw Error("M3_PARITY_SUBMISSION_SCOPE_DENIED");
  }
  const [job] = await db
    .select()
    .from(workerJobs)
    .where(
      and(
        eq(workerJobs.tenantId, scope.tenantId),
        eq(workerJobs.requestedByUserId, scope.actorUserId),
        eq(workerJobs.jobType, jobType(operation)),
        eq(workerJobs.contractVersion, M3_PARITY_CONTRACT),
        sql`${workerJobs.inputJson}->>'projectId'=${scope.projectId}`,
        sql`${workerJobs.inputJson}->>'candidateJobId'=${scope.candidateJobId}`,
        ...(submissionId ? [eq(workerJobs.id, submissionId)] : [])
      )
    )
    .orderBy(desc(workerJobs.createdAt))
    .limit(1);
  if (job) {
    const receipt = job.outputJson as Record<string, any> | null;
    const jobInput = job.inputJson as Record<string, any>;
    const evidence =
      job.status === "succeeded" && job.finishedAt
        ? verifyM3ParityEvidence({
            scope,
            operation,
            job: {
              id: job.id,
              status: job.status,
              tenantId: job.tenantId,
              requestedByUserId: job.requestedByUserId,
              projectId: jobInput?.projectId,
              candidateJobId: jobInput?.candidateJobId,
              operation: jobInput?.operation,
              planDigest: jobInput?.planDigest,
              finishedAt: job.finishedAt.toISOString(),
            },
            receipt,
          })
        : {
            accepted: false as const,
            reason: "M3_PARITY_RECEIPT_NOT_TERMINAL",
          };
    return {
      jobId: job.id,
      status: job.status,
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
      progress: job.progressJson,
      heartbeatAt: job.heartbeatAt,
      leaseExpiresAt: job.leaseExpiresAt,
      errorCode: job.errorCode,
      receipt,
      acceptance: evidence,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
    };
  }
  if (submissionId) {
    const [intent] = await db
      .select()
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.category, M3_PARITY_CATEGORY),
          eq(systemSettings.key, submissionId)
        )
      )
      .limit(1);
    if (intent?.updatedBy === scope.actorUserId)
      return {
        jobId: submissionId,
        status: "admission_unknown",
        attempt: 0,
        maxAttempts: 1,
        progress: null,
        heartbeatAt: null,
        leaseExpiresAt: null,
        errorCode: "CANONICAL_JOB_NOT_READ_BACK",
        receipt: null,
        createdAt: intent.createdAt,
        finishedAt: null,
      };
  }
  return null;
}

export async function getM3ParityPreflight(
  db: DrizzleDB,
  scope: Scope,
  operation: "credit_billing_acceptance" | "queue_recovery_acceptance"
) {
  try {
    const reviewed = await reviewedPlan(db, scope, operation);
    const { defaultJobExecutorRegistry } =
      await import("./jobExecutorRegistry");
    const registered = defaultJobExecutorRegistry.has(
      jobType(operation),
      M3_PARITY_CONTRACT
    );
    const queueTransportReady =
      process.env.CLOUDFLARE_WORKFLOW_TRANSPORT?.trim() === "queues" &&
      process.env.CLOUDFLARE_WORKFLOW_TENANT_ID?.trim() === scope.tenantId &&
      Date.parse(process.env.CLOUDFLARE_WORKFLOW_EXPIRES_AT ?? "") >
        Date.now() &&
      Boolean(
        process.env.CLOUDFLARE_WORKFLOW_RUNTIME_URL?.trim() &&
        process.env.CLOUDFLARE_WORKFLOW_RUNTIME_TOKEN?.trim()
      );
    const providerInventory = await probeCloudflareProductionProviderInventory({
      db,
      tenantId: scope.tenantId,
      projectId: scope.projectId,
    });
    const activeVersion =
      "worker" in providerInventory &&
      providerInventory.worker.versions.length === 1
        ? providerInventory.worker.versions[0]
        : null;
    const queueWorker = await verifyM3QueueWorkerReadiness(
      activeVersion,
      resolveCloudflareStagingModules
    );
    const missingLifecycleChecks =
      operation === "queue_recovery_acceptance"
        ? (
            await import("./cloudflareM3QueueRecoveryExecutor")
          ).getM3QueueRecoveryMissingLifecycleChecks()
        : [];
    const existing = await db
      .select({ id: workerJobs.id })
      .from(workerJobs)
      .where(
        and(
          eq(workerJobs.tenantId, scope.tenantId),
          eq(workerJobs.requestedByUserId, scope.actorUserId),
          eq(workerJobs.jobType, jobType(operation)),
          eq(workerJobs.contractVersion, M3_PARITY_CONTRACT),
          sql`${workerJobs.inputJson}->>'projectId'=${scope.projectId}`,
          sql`${workerJobs.inputJson}->>'candidateJobId'=${scope.candidateJobId}`,
          inArray(workerJobs.status, active as any)
        )
      )
      .limit(1);
    const reason = existing.length
      ? "M3_PARITY_EXISTING_JOB_RECONCILE_REQUIRED"
      : !registered
        ? "M3_PARITY_EXECUTOR_NOT_REGISTERED"
        : !queueTransportReady
          ? "M3_PARITY_CLOUDFLARE_QUEUE_TRANSPORT_NOT_ACTIVE"
          : !queueWorker.ready
            ? queueWorker.reason
            : missingLifecycleChecks.length > 0
              ? "M3_QUEUE_RECOVERY_LIFECYCLE_PROBES_REQUIRED"
              : null;
    return {
      ready: reason === null,
      reason,
      plan: reviewed.plan,
      planDigest: reviewed.digest,
      existingJobRequired: existing.length > 0,
      executorRegistered: registered,
      queueTransportReady,
      queueWorker,
      missingLifecycleChecks,
      authorization: "authenticated-owner-bounded-synthetic-operation",
      trafficMutation: false,
      realCharges: false,
    };
  } catch (error) {
    return {
      ready: false,
      missingLifecycleChecks: [],
      reason:
        error instanceof Error && /^[A-Z0-9_]{5,120}$/.test(error.message)
          ? error.message
          : "M3_PARITY_PREFLIGHT_UNAVAILABLE",
    };
  }
}

export async function admitM3ParityOperation(
  db: DrizzleDB,
  input: Scope & {
    operation: "credit_billing_acceptance" | "queue_recovery_acceptance";
    submissionId: string;
    planDigest: string;
    correlationId: string;
  }
) {
  const reviewed = await reviewedPlan(db, input, input.operation);
  if (reviewed.digest !== input.planDigest)
    throw Error("M3_PARITY_REVIEWED_PLAN_CHANGED");
  const { defaultJobExecutorRegistry } = await import("./jobExecutorRegistry");
  if (
    !defaultJobExecutorRegistry.has(
      jobType(input.operation),
      M3_PARITY_CONTRACT
    )
  )
    throw Error("M3_PARITY_EXECUTOR_NOT_REGISTERED");
  if (
    process.env.CLOUDFLARE_WORKFLOW_TRANSPORT?.trim() !== "queues" ||
    process.env.CLOUDFLARE_WORKFLOW_TENANT_ID?.trim() !== input.tenantId ||
    !(
      Date.parse(process.env.CLOUDFLARE_WORKFLOW_EXPIRES_AT ?? "") > Date.now()
    ) ||
    !process.env.CLOUDFLARE_WORKFLOW_RUNTIME_URL?.trim() ||
    !process.env.CLOUDFLARE_WORKFLOW_RUNTIME_TOKEN?.trim()
  )
    throw Error("M3_PARITY_CLOUDFLARE_QUEUE_TRANSPORT_NOT_ACTIVE");
  if (input.operation === "queue_recovery_acceptance") {
    const { getM3QueueRecoveryMissingLifecycleChecks } =
      await import("./cloudflareM3QueueRecoveryExecutor");
    if (getM3QueueRecoveryMissingLifecycleChecks().length > 0)
      throw Error("M3_QUEUE_RECOVERY_LIFECYCLE_PROBES_REQUIRED");
  }
  const type = jobType(input.operation),
    idempotencyKey = `m3-parity:${input.operation}:${input.submissionId}`;
  const intent = await db.transaction(async tx => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`m3-parity:${input.tenantId}:${input.projectId}:${input.operation}`}))`
    );
    const [old] = await tx
      .select()
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.category, M3_PARITY_CATEGORY),
          eq(systemSettings.key, input.submissionId)
        )
      )
      .limit(1);
    if (old) {
      const v = old.valueJson as Record<string, any>;
      if (
        old.updatedBy !== input.actorUserId ||
        v.tenantId !== input.tenantId ||
        v.projectId !== input.projectId ||
        v.actorUserId !== input.actorUserId ||
        v.operation !== input.operation ||
        v.planDigest !== input.planDigest ||
        digestM3ParityPlan(v.plan).digest !== input.planDigest ||
        v.revokedAt !== null ||
        Date.parse(v.expiresAt) <= Date.now()
      )
        throw Error("M3_PARITY_SUBMISSION_SCOPE_DENIED");
      return v;
    }
    const [pending] = await tx
      .select({ id: workerJobs.id })
      .from(workerJobs)
      .where(
        and(
          eq(workerJobs.tenantId, input.tenantId),
          eq(workerJobs.requestedByUserId, input.actorUserId),
          eq(workerJobs.jobType, type),
          eq(workerJobs.contractVersion, M3_PARITY_CONTRACT),
          sql`${workerJobs.inputJson}->>'projectId'=${input.projectId}`,
          sql`${workerJobs.inputJson}->>'candidateJobId'=${input.candidateJobId}`,
          inArray(workerJobs.status, active as any)
        )
      )
      .limit(1);
    if (pending) throw Error("M3_PARITY_EXISTING_JOB_RECONCILE_REQUIRED");
    const value = {
      tenantId: input.tenantId,
      projectId: input.projectId,
      actorUserId: input.actorUserId,
      candidateJobId: input.candidateJobId,
      submissionId: input.submissionId,
      operation: input.operation,
      plan: reviewed.plan,
      planDigest: reviewed.digest,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      revokedAt: null,
      authority: "owner-bounded-synthetic-m3-parity-v1",
      realCharges: false,
      providerCalls: false,
      trafficMutation: false,
    };
    await tx.insert(systemSettings).values({
      category: M3_PARITY_CATEGORY,
      key: input.submissionId,
      valueJson: value,
      updatedBy: input.actorUserId,
      description:
        "Owner reviewed bounded synthetic Cloudflare M3 parity operation",
    });
    return value;
  });
  const [existingJob] = await db
    .select()
    .from(workerJobs)
    .where(eq(workerJobs.id, input.submissionId))
    .limit(1);
  if (existingJob) {
    if (
      existingJob.tenantId !== input.tenantId ||
      existingJob.requestedByUserId !== input.actorUserId ||
      existingJob.jobType !== type ||
      existingJob.contractVersion !== M3_PARITY_CONTRACT ||
      existingJob.inputJson?.planDigest !== input.planDigest
    )
      throw Error("M3_PARITY_CANONICAL_JOB_SCOPE_DENIED");
    return { jobId: existingJob.id, status: existingJob.status };
  }
  if (intent.revokedAt !== null || Date.parse(intent.expiresAt) <= Date.now())
    throw Error("M3_PARITY_AUTHORIZATION_EXPIRED");
  return createControlPlaneJob({
    context: {
      tenantId: input.tenantId,
      actorType: "user",
      actorId: input.actorUserId,
      authorizationScope: `infrastructure.${type}`,
      correlationId: input.correlationId,
      idempotencyKey,
    },
    definition: {
      jobType: type,
      contractVersion: M3_PARITY_CONTRACT,
      executionClass: "short",
      priority: 55,
      input: {
        contractVersion: M3_PARITY_CONTRACT,
        tenantId: input.tenantId,
        projectId: input.projectId,
        operation: input.operation,
        submissionId: input.submissionId,
        planDigest: input.planDigest,
        candidateJobId: input.candidateJobId,
      },
      idempotencyKey,
      activeDedupeKey: `m3-parity:${input.tenantId}:${input.projectId}:${input.operation}`,
      retryPolicy: {
        maxAttempts: 1,
        baseDelayMs: 2000,
        maxDelayMs: 5000,
        jitter: "bounded",
        deadlineMs: 10 * 60_000,
        allowedErrorClasses: [],
      },
      timeoutPolicy: { softTimeoutMs: 8 * 60_000, hardTimeoutMs: 10 * 60_000 },
    },
    createOptions: {
      canonicalJobId: input.submissionId,
      runtimeType: "node_job_worker",
    },
  });
}
