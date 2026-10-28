import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb, type DrizzleDB } from "../db";
import { systemSettings, users } from "../../drizzle/schema";
import type { JobExecutor } from "./jobExecutor";
import {
  addCredits,
  createCreditReservation,
  deductCredits,
  drawFromReservation,
  getCreditReservationLifecycle,
  getCreditReservationSnapshot,
  refundCredits,
  refundReservation,
} from "./creditService";
import { assertHttpCandidateOwner } from "./cloudflareHttpCandidatePreparation";
import { readCompensatedHttpApplicationAcceptance } from "./cloudflareHttpRuntimeContinuation";
import { readHttpRuntimeIntent } from "./cloudflareHttpRuntimeAdmission";
import { digestM3ParityPlan } from "./cloudflareM3ParityContract";
import {
  M3_PARITY_CATEGORY,
  M3_PARITY_CONTRACT,
  M3_PARITY_JOB,
  m3ParityJobInputSchema,
} from "./cloudflareM3ParityJobContract";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const creditJobType = `${M3_PARITY_JOB}.credit_billing_acceptance`;
const fail = (code: string): never => {
  throw Object.assign(new Error(code), {
    diagnosticCode: code,
    class: "permanent",
  });
};

type DeliveryEvidence = {
  queueName: string;
  messageId: string;
  workerVersionId: string;
  dispatchId: string;
  dedupeKey: string;
};
type ParityContext = Parameters<JobExecutor>[0]["context"] & {
  cloudflareQueueDelivery?: DeliveryEvidence;
};

async function readBalance(db: DrizzleDB, userId: number, tenantId: string) {
  const [row] = await db
    .select({
      credits: users.credits,
      disabled: users.isDisabled,
      tenantId: users.currentTenantId,
    })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.currentTenantId, tenantId)))
    .limit(1);
  if (!row || row.tenantId !== tenantId) fail("M3_CREDIT_FIXTURE_SCOPE_LOST");
  return { credits: row.credits, disabled: row.disabled };
}

async function createSyntheticUser(
  db: DrizzleDB,
  jobId: string,
  tenantId: string
) {
  const marker = hash(`smartaihub-m3-credit-billing-v1:${jobId}`).slice(0, 40);
  const openId = `m3credit_${marker}`;
  const email = `m3-credit-${marker.slice(0, 24)}@example.invalid`;
  const [existing] = await db
    .select({
      id: users.id,
      currentTenantId: users.currentTenantId,
      email: users.email,
      credits: users.credits,
      isDisabled: users.isDisabled,
    })
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  if (existing) {
    if (
      existing.currentTenantId !== tenantId ||
      existing.email !== email ||
      existing.credits !== 0 ||
      existing.isDisabled
    )
      fail("M3_CREDIT_FIXTURE_IDENTITY_CONFLICT");
    return { userId: existing.id, marker, created: false };
  }
  const rows =
    await db.execute(sql`INSERT INTO users ("openId",email,name,"loginMethod",role,"currentTenantId",credits,"isDisabled")
    VALUES (${openId},${email},'SmartAIHub synthetic M3 credit acceptance','synthetic','user',${tenantId},0,false) RETURNING id`);
  if (rows.length !== 1 || !Number.isSafeInteger(Number(rows[0].id)))
    fail("M3_CREDIT_FIXTURE_CREATE_FAILED");
  return { userId: Number(rows[0].id), marker, created: true };
}

/** Executes only against a deterministic, job-owned synthetic account. No payment
 * provider or customer account is reachable from this executor. The worker job
 * lease and its Cloudflare Queue delivery are both required before any write. */
export function createM3CreditBillingExecutor(
  deps: {
    db?: DrizzleDB;
    services?: Pick<
      typeof import("./creditService"),
      | "addCredits"
      | "createCreditReservation"
      | "deductCredits"
      | "drawFromReservation"
      | "getCreditReservationLifecycle"
      | "getCreditReservationSnapshot"
      | "refundCredits"
      | "refundReservation"
    >;
    now?: () => Date;
  } = {}
): JobExecutor {
  return async ({ context, lease, reporter }) => {
    const parsed = m3ParityJobInputSchema.safeParse(context.input);
    if (
      !parsed.success ||
      parsed.data.operation !== "credit_billing_acceptance" ||
      context.jobType !== creditJobType ||
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
      actorUserId = context.requestedByUserId;
    const db = deps.db ?? getDb(),
      services = deps.services ?? (await import("./creditService"));
    const delivery = (context as ParityContext).cloudflareQueueDelivery;
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
    const planDigest =
      typeof intent?.planDigest === "string" ? intent.planDigest : "";
    const reviewed = intent?.plan ? digestM3ParityPlan(intent.plan) : null;
    const appAcceptance = await readCompensatedHttpApplicationAcceptance(
      db,
      { tenantId: input.tenantId, projectId: input.projectId, actorUserId },
      input.candidateJobId
    );
    const appIntent = appAcceptance
      ? await readHttpRuntimeIntent(db, appAcceptance.jobId)
      : null;
    if (
      !intent ||
      intentRow?.updatedBy !== actorUserId ||
      intent.tenantId !== input.tenantId ||
      intent.projectId !== input.projectId ||
      intent.actorUserId !== actorUserId ||
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
      !reviewed ||
      reviewed.digest !== planDigest ||
      input.planDigest !== planDigest ||
      !appAcceptance?.authenticatedApplicationAccepted ||
      !appIntent ||
      appIntent.updatedBy !== actorUserId ||
      appAcceptance.jobId !== intent.plan.applicationJobId ||
      appIntent.valueJson?.planDigest !== appAcceptance.planDigest ||
      appIntent.valueJson?.tenantId !== input.tenantId ||
      appIntent.valueJson?.projectId !== input.projectId ||
      appIntent.valueJson?.actorUserId !== actorUserId
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
    const prefix = `m3-parity:${context.jobId}`,
      fixture = await createSyntheticUser(db, context.jobId, input.tenantId);
    const checks: Record<string, boolean> = {};
    const reservationIds: string[] = [];
    let initialBalance = 0,
      finalBalance = 0,
      compensated = false;
    try {
      await assertActive();
      const funding = await services.addCredits({
        userId: fixture.userId,
        amount: 30,
        type: "bonus",
        description: "Synthetic M3 acceptance funding",
        tenantId: input.tenantId,
        idempotencyKey: `${prefix}:funding`,
        metadata: { synthetic: true, jobId: context.jobId },
      });
      initialBalance = funding.newBalance;
      const fundingReplay = await services.addCredits({
        userId: fixture.userId,
        amount: 30,
        type: "bonus",
        description: "Synthetic M3 acceptance funding",
        tenantId: input.tenantId,
        idempotencyKey: `${prefix}:funding`,
        metadata: { synthetic: true, jobId: context.jobId },
      });
      checks.duplicateReplay =
        funding.transactionId === fundingReplay.transactionId &&
        fundingReplay.duplicate === true &&
        funding.newBalance === fundingReplay.newBalance;

      await reporter.progress(lease, {
        progress: 20,
        stage: "CREDIT_SYNTHETIC_FUNDED",
        message: "Synthetic-only ledger test",
      });
      await assertActive();
      const settlement = await services.createCreditReservation(
        fixture.userId,
        12,
        "chat",
        { synthetic: true, jobId: context.jobId },
        `${prefix}:settlement`,
        {
          tenantId: input.tenantId,
          description: "Synthetic M3 settlement reservation",
        }
      );
      reservationIds.push(settlement.reservationId);
      const settlementReplay = await services.createCreditReservation(
        fixture.userId,
        12,
        "chat",
        { synthetic: true, jobId: context.jobId },
        `${prefix}:settlement`,
        {
          tenantId: input.tenantId,
          description: "Synthetic M3 settlement reservation",
        }
      );
      checks.reservation =
        settlement.reservationId === settlementReplay.reservationId &&
        settlement.transactionId === settlementReplay.transactionId &&
        settlement.reservedAmount === 12;
      const settled = await services.drawFromReservation(
        settlement.reservationId,
        8,
        "Synthetic settlement",
        `${prefix}:settlement-call`
      );
      const duplicateSettlement = await services.drawFromReservation(
        settlement.reservationId,
        8,
        "Synthetic settlement replay",
        `${prefix}:settlement-call`
      );
      checks.settlement =
        settled.drawn === 8 &&
        !settled.duplicate &&
        duplicateSettlement.duplicate === true &&
        duplicateSettlement.drawn === 0;
      const unused = await services.refundReservation(settlement.reservationId);
      checks.unusedRelease = unused.refundedAmount === 4;
      const reversed = await services.refundCredits({
        userId: fixture.userId,
        amount: 8,
        description: "Synthetic settlement compensation",
        originalTransactionId: settlement.transactionId,
        reversalOfTransactionId: settlement.transactionId,
        tenantId: input.tenantId,
        idempotencyKey: `${prefix}:settled-refund`,
        metadata: { synthetic: true, jobId: context.jobId },
      });
      const reversalReplay = await services.refundCredits({
        userId: fixture.userId,
        amount: 8,
        description: "Synthetic settlement compensation",
        originalTransactionId: settlement.transactionId,
        reversalOfTransactionId: settlement.transactionId,
        tenantId: input.tenantId,
        idempotencyKey: `${prefix}:settled-refund`,
        metadata: { synthetic: true, jobId: context.jobId },
      });
      checks.refund =
        reversed.transactionId > 0 &&
        reversalReplay.transactionId === reversed.transactionId &&
        reversalReplay.duplicate === true;

      const cancelled = await services.createCreditReservation(
        fixture.userId,
        10,
        "chat",
        { synthetic: true, jobId: context.jobId },
        `${prefix}:cancel`,
        {
          tenantId: input.tenantId,
          description: "Synthetic M3 cancellation reservation",
        }
      );
      reservationIds.push(cancelled.reservationId);
      const cancelledResult = await services.refundReservation(
        cancelled.reservationId
      );
      checks.cancellation =
        cancelledResult.refundedAmount === 10 &&
        (await services.getCreditReservationLifecycle(cancelled.reservationId))
          ?.status === "refunded";

      const beforeWrongTenant = await readBalance(
        db,
        fixture.userId,
        input.tenantId
      );
      let wrongTenantDenied = false;
      try {
        await services.deductCredits({
          userId: fixture.userId,
          amount: 1,
          description: "synthetic wrong-tenant probe",
          tenantId: `${input.tenantId}-wrong`,
          idempotencyKey: `${prefix}:wrong-tenant`,
          skipBudgetCheck: true,
        });
      } catch (error) {
        wrongTenantDenied =
          error instanceof Error &&
          error.message === "Credit tenant scope mismatch";
      }
      const afterWrongTenant = await readBalance(
        db,
        fixture.userId,
        input.tenantId
      );
      checks.crossTenantIsolation =
        wrongTenantDenied &&
        beforeWrongTenant.credits === afterWrongTenant.credits;

      await reporter.progress(lease, {
        progress: 60,
        stage: "CREDIT_CONCURRENCY_AND_CONSERVATION",
      });
      const concurrent = await Promise.allSettled([
        services.createCreditReservation(
          fixture.userId,
          20,
          "chat",
          { synthetic: true, jobId: context.jobId },
          `${prefix}:concurrent-a`,
          { tenantId: input.tenantId }
        ),
        services.createCreditReservation(
          fixture.userId,
          20,
          "chat",
          { synthetic: true, jobId: context.jobId },
          `${prefix}:concurrent-b`,
          { tenantId: input.tenantId }
        ),
      ]);
      const successfulReservations = concurrent.flatMap(result =>
        result.status === "fulfilled" ? [result.value] : []
      );
      reservationIds.push(
        ...successfulReservations.map(item => item.reservationId)
      );
      checks.concurrentReservation =
        successfulReservations.length === 1 &&
        concurrent.filter(result => result.status === "rejected").length === 1;
      if (successfulReservations[0])
        await services.refundReservation(
          successfulReservations[0].reservationId
        );

      const beforeCleanup = await readBalance(
        db,
        fixture.userId,
        input.tenantId
      );
      if (beforeCleanup.credits > 0)
        await services.deductCredits({
          userId: fixture.userId,
          amount: beforeCleanup.credits,
          description: "Synthetic M3 fixture cleanup",
          tenantId: input.tenantId,
          idempotencyKey: `${prefix}:fixture-cleanup`,
          skipBudgetCheck: true,
          metadata: { synthetic: true, cleanup: true, jobId: context.jobId },
        });
      await db
        .update(users)
        .set({ isDisabled: true })
        .where(
          and(
            eq(users.id, fixture.userId),
            eq(users.currentTenantId, input.tenantId),
            eq(users.isDisabled, false)
          )
        );
      const closedReservations = await Promise.all(
        reservationIds.map(id => services.getCreditReservationLifecycle(id))
      );
      finalBalance = (await readBalance(db, fixture.userId, input.tenantId))
        .credits;
      checks.balanceConservation = initialBalance === 30 && finalBalance === 0;
      checks.syntheticCleanup =
        finalBalance === 0 &&
        (await readBalance(db, fixture.userId, input.tenantId)).disabled &&
        closedReservations.every(item => item?.status === "refunded");
      compensated = checks.syntheticCleanup;
      checks.billingTestMode =
        intent.realCharges === false && intent.providerCalls === false;
      checks.syntheticBalance = initialBalance === 30;
      if (Object.values(checks).some(value => value !== true))
        fail("M3_CREDIT_ACCEPTANCE_CHECK_FAILED");
      await reporter.progress(lease, {
        progress: 95,
        stage: "CREDIT_BILLING_COMPENSATED",
      });
      return {
        output: {
          schemaVersion: "cloudflare-m3-parity-acceptance-v1",
          jobId: context.jobId,
          tenantId: input.tenantId,
          projectId: input.projectId,
          candidateJobId: input.candidateJobId,
          actorUserId,
          operation: input.operation,
          planDigest,
          provider: "cloudflare",
          liveExecution: true,
          syntheticOnly: true,
          realCharges: false,
          trafficMutation: false,
          compensated,
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
          syntheticFixture: {
            userId: fixture.userId,
            tenantId: input.tenantId,
            finalBalance,
            disabled: true,
          },
        },
      };
    } catch (error) {
      if (fixture.created) {
        try {
          for (const reservationId of reservationIds) {
            const snapshot =
              await services.getCreditReservationSnapshot(reservationId);
            if (snapshot) {
              await services.refundReservation(reservationId);
              if (snapshot.drawnAmount > 0)
                await services.refundCredits({
                  userId: fixture.userId,
                  amount: snapshot.drawnAmount,
                  description: "Synthetic M3 failure compensation",
                  originalTransactionId: snapshot.transactionId,
                  reversalOfTransactionId: snapshot.transactionId,
                  tenantId: input.tenantId,
                  idempotencyKey: `${prefix}:failure-refund:${hash(reservationId).slice(0, 12)}`,
                });
            }
          }
          const balance = await readBalance(db, fixture.userId, input.tenantId);
          if (balance.credits > 0)
            await services.deductCredits({
              userId: fixture.userId,
              amount: balance.credits,
              description: "Synthetic M3 failure cleanup",
              tenantId: input.tenantId,
              idempotencyKey: `${prefix}:failure-cleanup`,
              skipBudgetCheck: true,
            });
          await db
            .update(users)
            .set({ isDisabled: true })
            .where(
              and(
                eq(users.id, fixture.userId),
                eq(users.currentTenantId, input.tenantId)
              )
            );
          compensated =
            (await readBalance(db, fixture.userId, input.tenantId)).credits ===
            0;
        } catch {
          fail("M3_CREDIT_COMPENSATION_REQUIRED");
        }
      }
      fail(
        error instanceof Error && /^M3_[A-Z0-9_]+$/.test(error.message)
          ? error.message
          : "M3_CREDIT_EXECUTION_FAILED"
      );
    }
  };
}
