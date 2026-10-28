import { and, eq } from "drizzle-orm";
import { getDb, type DrizzleDB } from "../db";
import {
  systemSettings,
  workerJobDispatches,
  workerJobEvents,
  workerJobs,
} from "../../drizzle/schema";
import type { JobExecutor } from "./jobExecutor";
import { assertHttpCandidateOwner } from "./cloudflareHttpCandidatePreparation";
import { readCompensatedHttpApplicationAcceptance } from "./cloudflareHttpRuntimeContinuation";
import { readHttpRuntimeIntent } from "./cloudflareHttpRuntimeAdmission";
import { digestM3ParityPlan } from "./cloudflareM3ParityContract";
import { M3_PARITY_REQUIRED_CHECKS } from "./cloudflareM3AcceptanceEvidence";
import {
  M3_PARITY_CATEGORY,
  M3_PARITY_CONTRACT,
  M3_PARITY_JOB,
  m3ParityJobInputSchema,
} from "./cloudflareM3ParityJobContract";

const type = `${M3_PARITY_JOB}.queue_recovery_acceptance`;
const fail = (code: string): never => {
  throw Object.assign(new Error(code), {
    diagnosticCode: code,
    class: "permanent",
  });
};
type Delivery = {
  queueName: string;
  messageId: string;
  workerVersionId: string;
  dispatchId: string;
  dedupeKey: string;
};

export const M3_QUEUE_RECOVERY_LIVE_CHECKS = [
  "canonicalAdmission",
  "outboxDispatch",
  "cloudflareDelivery",
  "workerClaimLease",
  "execution",
  "progressHeartbeat",
  "completion",
] as const;

export function getM3QueueRecoveryMissingLifecycleChecks() {
  const implemented = new Set<string>(M3_QUEUE_RECOVERY_LIVE_CHECKS);
  return M3_PARITY_REQUIRED_CHECKS.queue_recovery_acceptance.filter(
    check => !implemented.has(check)
  );
}

/** Records real execution evidence from the admitted Queue delivery. Lifecycle
 * sub-probes stay false until their own canonical receipts exist, so a live
 * delivery can never be mistaken for full recovery acceptance. */
export function createM3QueueRecoveryExecutor(
  deps: { db?: DrizzleDB; now?: () => Date } = {}
): JobExecutor {
  return async ({ context, lease, reporter }) => {
    const parsed = m3ParityJobInputSchema.safeParse(context.input);
    if (
      !parsed.success ||
      parsed.data.operation !== "queue_recovery_acceptance" ||
      context.jobType !== type ||
      context.contractVersion !== M3_PARITY_CONTRACT ||
      context.executionClass !== "short" ||
      context.jobId !== parsed.data.submissionId ||
      !context.requestedByUserId ||
      context.tenantId !== parsed.data.tenantId ||
      !lease.attemptId ||
      !lease.leaseToken ||
      lease.fencingVersion < 1
    )
      fail("M3_PARITY_JOB_SCOPE_DENIED");
    const input = parsed.data,
      actorUserId = context.requestedByUserId,
      db = deps.db ?? getDb();
    const delivery = (
      context as typeof context & { cloudflareQueueDelivery?: Delivery }
    ).cloudflareQueueDelivery;
    if (
      !delivery ||
      delivery.queueName !== "smartspec-canonical-job-queue-production" ||
      !delivery.messageId ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(delivery.workerVersionId) ||
      delivery.dispatchId.length > 128 ||
      delivery.dedupeKey !== `job:${context.jobId}:attempt:${context.attempt}`
    )
      fail("M3_PARITY_CLOUDFLARE_QUEUE_DELIVERY_REQUIRED");
    await reporter.assertActive(lease);
    await assertHttpCandidateOwner(db, {
      tenantId: input.tenantId,
      projectId: input.projectId,
      actorUserId,
    });
    const [intentRow] = await db
      .select()
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.category, M3_PARITY_CATEGORY),
          eq(systemSettings.key, input.submissionId)
        )
      )
      .limit(1);
    const intent = intentRow?.valueJson as Record<string, any> | undefined;
    const appAcceptance = await readCompensatedHttpApplicationAcceptance(
      db,
      { tenantId: input.tenantId, projectId: input.projectId, actorUserId },
      input.candidateJobId
    );
    const appIntent = appAcceptance
      ? await readHttpRuntimeIntent(db, appAcceptance.jobId)
      : null;
    let reviewed: ReturnType<typeof digestM3ParityPlan> | null = null;
    try {
      reviewed = intent?.plan ? digestM3ParityPlan(intent.plan) : null;
    } catch {
      /* sanitized below */
    }
    if (
      !intent ||
      intentRow?.updatedBy !== actorUserId ||
      intent.actorUserId !== actorUserId ||
      intent.tenantId !== input.tenantId ||
      intent.projectId !== input.projectId ||
      intent.operation !== input.operation ||
      intent.candidateJobId !== input.candidateJobId ||
      intent.submissionId !== input.submissionId ||
      intent.revokedAt !== null ||
      Date.parse(intent.expiresAt) <= (deps.now?.() ?? new Date()).getTime() ||
      intent.realCharges !== false ||
      intent.providerCalls !== false ||
      intent.trafficMutation !== false ||
      intent.authority !== "owner-bounded-synthetic-m3-parity-v1" ||
      intent.plan?.queueName !== delivery.queueName ||
      !intent.plan?.workerVersions?.some((version: any) => version.versionId === delivery.workerVersionId) ||
      intent.plan?.deadLetterQueueName !==
        "smartspec-canonical-job-queue-production-dlq" ||
      typeof intent.plan?.queueId !== "string" ||
      !/^[a-f0-9]{32}$/.test(intent.plan.queueId) ||
      typeof intent.plan?.deadLetterQueueId !== "string" ||
      !/^[a-f0-9]{32}$/.test(intent.plan.deadLetterQueueId) ||
      reviewed?.digest !== intent.planDigest ||
      input.planDigest !== intent.planDigest ||
      !appAcceptance?.authenticatedApplicationAccepted ||
      appAcceptance.jobId !== intent.plan.applicationJobId ||
      !appIntent ||
      appIntent.updatedBy !== actorUserId ||
      appIntent.valueJson?.planDigest !== appAcceptance.planDigest
    )
      fail("M3_PARITY_AUTHORIZATION_OR_PLAN_INVALID");

    const assertActive = async () => {
      await reporter.assertActive(lease);
      const [current] = await db
        .select()
        .from(systemSettings)
        .where(
          and(
            eq(systemSettings.category, M3_PARITY_CATEGORY),
            eq(systemSettings.key, input.submissionId)
          )
        )
        .limit(1);
      if (
        !current ||
        current.updatedBy !== actorUserId ||
        JSON.stringify(current.valueJson) !== JSON.stringify(intent) ||
        intent.revokedAt !== null ||
        Date.parse(intent.expiresAt) <= (deps.now?.() ?? new Date()).getTime()
      )
        fail("M3_PARITY_AUTHORIZATION_EXPIRED_OR_CHANGED");
    };
    await assertActive();
    const [job] = await db
      .select({
        id: workerJobs.id,
        status: workerJobs.status,
        tenantId: workerJobs.tenantId,
        requestedByUserId: workerJobs.requestedByUserId,
        jobType: workerJobs.jobType,
        contractVersion: workerJobs.contractVersion,
        attempt: workerJobs.attempt,
        fencingVersion: workerJobs.fencingVersion,
        leaseExpiresAt: workerJobs.leaseExpiresAt,
      })
      .from(workerJobs)
      .where(
        and(
          eq(workerJobs.id, context.jobId),
          eq(workerJobs.tenantId, input.tenantId)
        )
      )
      .limit(1);
    const [dispatch] = await db
      .select()
      .from(workerJobDispatches)
      .where(
        and(
          eq(workerJobDispatches.workerJobId, context.jobId),
          eq(workerJobDispatches.id, delivery.dispatchId),
          eq(workerJobDispatches.adapter, "cloudflare-queues"),
          eq(workerJobDispatches.dedupeKey, delivery.dedupeKey)
        )
      )
      .limit(1);
    const events = await db
      .select({ eventType: workerJobEvents.eventType })
      .from(workerJobEvents)
      .where(eq(workerJobEvents.workerJobId, context.jobId));
    const eventTypes = new Set(events.map(event => event.eventType));
    const checks: Record<string, boolean> = {
      canonicalAdmission: Boolean(
        job &&
        job.requestedByUserId === actorUserId &&
        job.jobType === type &&
        job.contractVersion === M3_PARITY_CONTRACT
      ),
      outboxDispatch: Boolean(
        dispatch &&
        dispatch.publicationStatus === "published" &&
        dispatch.publishedAt
      ),
      cloudflareDelivery: Boolean(
        delivery.messageId &&
        delivery.queueName === "smartspec-canonical-job-queue-production"
      ),
      workerClaimLease: Boolean(
        job &&
        job.status === "running" &&
        job.attempt === context.attempt &&
        job.fencingVersion === lease.fencingVersion &&
        job.leaseExpiresAt &&
        job.leaseExpiresAt.getTime() > Date.now()
      ),
      execution: true,
      progressHeartbeat:
        eventTypes.has("HEARTBEAT") || eventTypes.has("PROGRESS"),
      completion: true,
      controlledFailure: false,
      retrySameIdentity: false,
      duplicateDelivery: false,
      idempotency: false,
      cancelBeforeExecution: false,
      cancelDuringExecution: false,
      leaseExpiryReclaim: false,
      interruptionRecovery: false,
      deadLetter: false,
      uncertainDeliveryReconciliation: false,
      compensation: false,
      syntheticCleanup: false,
    };
    await reporter.progress(lease, {
      progress: 25,
      stage: "M3_QUEUE_LIVE_DELIVERY_VERIFIED",
      message:
        "Canonical Queue delivery and lease were read back; lifecycle probes remain pending",
    });
    await assertActive();
    return {
      output: {
        schemaVersion: "cloudflare-m3-parity-acceptance-v1",
        jobId: context.jobId,
        tenantId: input.tenantId,
        projectId: input.projectId,
        candidateJobId: input.candidateJobId,
        actorUserId,
        operation: input.operation,
        planDigest: input.planDigest,
        provider: "cloudflare",
        liveExecution: true,
        syntheticOnly: true,
        realCharges: false,
        trafficMutation: false,
        compensated: false,
        checks,
        providerReceipt: {
          workerDeploymentId: intent.plan.workerDeploymentId,
          workerVersionId: delivery.workerVersionId,
          workerRelease: intent.plan.workerVersions.find((version: any) => version.versionId === delivery.workerVersionId),
          queueConsumerId: intent.plan.queueConsumerId,
          queueName: delivery.queueName,
          queueId: intent.plan.queueId,
          deadLetterQueueName: intent.plan.deadLetterQueueName,
          deadLetterQueueId: intent.plan.deadLetterQueueId,
          workerScript: "smartspec-cloudflare-runtime",
          messageId: delivery.messageId,
          dispatchId: delivery.dispatchId,
          dedupeKey: delivery.dedupeKey,
          receivedAt: (deps.now?.() ?? new Date()).toISOString(),
        },
      },
    };
  };
}
