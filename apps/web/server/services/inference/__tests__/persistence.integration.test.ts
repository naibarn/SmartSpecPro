import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { and, eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  llmInferenceAttempts,
  llmInferenceCreditReservations,
  llmInferenceCreditSettlements,
  llmInferencePlans,
  llmInferencePolicyEvents,
  llmInferencePolicyHeads,
  llmInferencePolicySnapshots,
  llmInferenceProfileCandidateHeads,
  llmInferenceProfileCertifications,
  llmInferenceProfileHeads,
  llmInferenceProfileVersions,
  llmInferenceProbeRuns,
  llmInferenceRolloutBundleEvents,
  llmInferenceChatResponseDeliveries,
  creditTransactions,
  conversations,
  workerJobEvents,
} from "../../../../drizzle/schema";
import { getDb } from "../../../db";
import type { InferenceAttemptReceipt, InferencePlanR4 } from "../contracts";
import { inferenceIntentV2Schema, inferencePlanR4Schema } from "../contracts";
import {
  executeInferencePlan,
  reconcileInferenceAttemptSettlement,
} from "../executionCoordinator";
import type { RouteCandidate } from "../policyResolver";
import type { InferenceAuthoritySnapshot } from "../policyResolver";
import {
  completeInferenceAttempt,
  createInferenceAttempt,
  loadInferenceSettlementRecord,
  loadInferenceAttemptStatus,
  listPendingInferenceSettlementAttempts,
  markInferenceAttemptSubmitting,
  persistInferencePlan,
  recordInferenceSettlementOutcome,
} from "../persistence";
import { hashInferenceIntent } from "../planFactory";
import {
  createInferenceRevocation,
  listInferencePolicyHeads,
  listInferencePolicyRevisions,
  listInferenceRevocations,
  rollbackInferencePolicy,
  publishInferencePolicy,
} from "../policyAdministration";
import {
  loadInferenceProfileRegistry,
  publishInferenceProfileVersion,
} from "../profileRegistry";
import { certifyStoredInferenceProfileCandidate } from "../profileCertification";
import {
  closeDurableInferenceCreditReservation,
  createDurableInferenceCreditReservation,
  loadDurableInferenceReservationAuthority,
  settleDurableInferenceCreditReservation,
} from "../durableCreditReservation";
import { planInferenceRouteForRequest } from "../inferencePlanningService";
import { executePolicyRoutedInference } from "../automaticInferenceRequest";
import { DEFAULT_INFERENCE_ROUTER_POLICY } from "../routerPolicy";
import { assessInferenceCapabilityRecheck } from "../capabilityRecheck";
import {
  activateInferenceRolloutBundle,
  publishInferenceRolloutBundle,
} from "../rolloutBundle";
import {
  deliverSettledInferenceChatResponse,
  findInferenceAssistantMessage,
  stageInferenceChatResponseDelivery,
} from "../../chatService";

const enabled = process.env.RUN_INFERENCE_DB_TESTS === "true";
const execFileAsync = promisify(execFile);
const db = getDb;
const planIds: string[] = [];
const workerJobIds: string[] = [];
const workerJobAttemptIds: string[] = [];
const profileDeploymentIds: string[] = [];
const policyScopeKeys: Array<{ scopeType: string; scopeKey: string }> = [];
const durableReservationIds: string[] = [];
const creditTransactionIds: number[] = [];
const conversationIds: number[] = [];

function makePlan(): InferencePlanR4 {
  const deadlineAt = new Date(Date.now() + 60_000).toISOString();
  return {
    planId: `db-test:${randomUUID()}`,
    intentHash: `sha256:${"a".repeat(64)}`,
    policyRevision: "policy:test",
    registryRevision: "registry:test",
    selectedModelProfile: "model:test",
    selectedDeploymentProfile: "deployment:test",
    endpointSurface: "chat_compatible",
    attemptBudget: 1,
    deadlineAt,
    fallbackCandidates: [],
    fallbackPermission: "none",
    cachePolicyId: "cache:test",
    creditReservationId: "reservation:test",
    estimatedCostMicros: 100,
    routePolicyRevision: "route:test",
    specUid: "urn:smartaihub:spec:llm-routing-inference",
    specRevision: "R4",
    rolloutBundleHash: `sha256:${"b".repeat(64)}`,
    logicalCallId: `call:${randomUUID()}`,
    attemptOwnershipEpoch: 1,
    parentCostCeilingMicros: 200,
    overallDeadlineAt: deadlineAt,
    residencyPolicySnapshotRef: "residency:test",
    routerFeatureProvenanceRef: "feature:test",
  };
}

const candidate = {
  modelProfileId: "model:test",
  providerModelId: "native:test",
  deploymentId: "deployment:test",
  providerId: "provider:test",
  credentialOwnerRef: "credential-owner:test",
  endpointSurface: "chat_compatible",
} as RouteCandidate;

afterEach(async () => {
  for (const conversationId of conversationIds.splice(0)) {
    await db().delete(conversations).where(eq(conversations.id, conversationId));
  }
  for (const reservationId of durableReservationIds.splice(0)) {
    await db()
      .delete(llmInferenceCreditSettlements)
      .where(eq(llmInferenceCreditSettlements.reservationId, reservationId));
    await db()
      .delete(llmInferenceCreditReservations)
      .where(eq(llmInferenceCreditReservations.reservationId, reservationId));
  }
  for (const transactionId of creditTransactionIds.splice(0)) {
    await db()
      .delete(creditTransactions)
      .where(eq(creditTransactions.id, transactionId));
  }
  for (const { scopeType, scopeKey } of policyScopeKeys.splice(0)) {
    await db()
      .delete(llmInferencePolicyHeads)
      .where(
        and(
          eq(llmInferencePolicyHeads.scopeType, scopeType),
          eq(llmInferencePolicyHeads.scopeKey, scopeKey)
        )
      );
  }
  for (const deploymentId of profileDeploymentIds.splice(0)) {
    await db()
      .delete(llmInferenceProfileCandidateHeads)
      .where(eq(llmInferenceProfileCandidateHeads.deploymentId, deploymentId));
    await db()
      .delete(llmInferenceProfileHeads)
      .where(eq(llmInferenceProfileHeads.deploymentId, deploymentId));
  }
  for (const planId of planIds.splice(0)) {
    await db()
      .delete(llmInferencePlans)
      .where(eq(llmInferencePlans.planId, planId));
  }
  for (const attemptId of workerJobAttemptIds.splice(0)) {
    await db().execute(
      sql`DELETE FROM "worker_job_attempts" WHERE "id" = ${attemptId}`
    );
  }
  for (const jobId of workerJobIds.splice(0)) {
    await db()
      .delete(workerJobEvents)
      .where(eq(workerJobEvents.workerJobId, jobId));
    await db().execute(sql`DELETE FROM "worker_jobs" WHERE "id" = ${jobId}`);
  }
});

describe.skipIf(!enabled)("Spec 231 PostgreSQL persistence integration", () => {
  it("recovers a staged Chat answer only after settlement and commits delivery once", async () => {
    const insertedConversation = await db().execute(sql`
      INSERT INTO conversations("userId", "tenantId")
      VALUES (1, 'tenant-1') RETURNING id
    `);
    const conversationRows = Array.isArray(insertedConversation)
      ? insertedConversation
      : (insertedConversation as { rows?: unknown }).rows;
    const conversationId = Number((conversationRows as Array<{ id: number }>)[0]?.id);
    expect(Number.isSafeInteger(conversationId)).toBe(true);
    conversationIds.push(conversationId);

    const reservationKey = `spec231:delivery-reservation:${randomUUID()}`;
    const reservationId = `reservation-${createHash("sha256").update(reservationKey).digest("hex").slice(0, 32)}`;
    const [transaction] = await db()
      .insert(creditTransactions)
      .values({
        userId: 1,
        amount: -5,
        type: "usage",
        description: "Spec 231 response delivery fixture",
        metadata: { reservationId, spec231InferenceReservation: true },
        balanceAfter: 95,
        idempotencyKey: reservationKey,
        sourceType: "chat",
        tenantId: "tenant-1",
      })
      .returning({ id: creditTransactions.id });
    creditTransactionIds.push(transaction.id);
    const reservation = await createDurableInferenceCreditReservation({
      userId: 1,
      tenantId: "tenant-1",
      principalRef: "user:1",
      amount: 5,
      idempotencyKey: reservationKey,
    }, {
      create: async () => ({
        reservationId,
        userId: 1,
        reservedAmount: 5,
        drawnAmount: 0,
        transactionId: transaction.id,
        sourceType: "chat" as const,
        idempotencyKey: reservationKey,
        tenantId: "tenant-1",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      }),
    });
    expect(reservation.ok).toBe(true);
    if (!reservation.ok) return;
    durableReservationIds.push(reservationId);

    const plan = makePlan();
    plan.creditReservationId = reservationId;
    planIds.push(plan.planId);
    await persistInferencePlan({
      tenantId: "tenant-1",
      principalRef: "user:1",
      idempotencyKey: `delivery-plan:${plan.logicalCallId}`,
      scoreCalibrationRevision: "scores:test",
      plan,
    });
    const attemptId = `attempt:${randomUUID()}`;
    const ownerToken = randomUUID();
    await createInferenceAttempt({
      planId: plan.planId,
      attemptId,
      attemptOrdinal: 1,
      attemptOwnershipEpoch: 1,
      ownerToken,
      candidate,
    });
    expect(await markInferenceAttemptSubmitting({
      attemptId,
      attemptOwnershipEpoch: 1,
      ownerToken,
    })).toBe(true);

    const idempotencyKey = `chat-delivery:${randomUUID()}`;
    await expect(stageInferenceChatResponseDelivery({
      attemptId,
      tenantId: "tenant-2",
      userId: 1,
      idempotencyKey,
      message: {
        conversationId,
        role: "assistant",
        content: "cross-tenant should be rejected",
      },
    })).rejects.toThrow("Inference response delivery owner scope is invalid");
    await stageInferenceChatResponseDelivery({
      attemptId,
      tenantId: "tenant-1",
      userId: 1,
      idempotencyKey,
      message: {
        conversationId,
        role: "assistant",
        content: "recoverable answer",
        inputTokens: 12,
        outputTokens: 7,
        creditsUsed: "1.2500",
        modelUsed: "gpt-4o",
      },
    });
    const receipt: InferenceAttemptReceipt = {
      planId: plan.planId,
      attemptId,
      attemptOrdinal: 1,
      actualModel: "native:test",
      providerId: candidate.providerId,
      credentialOwnerRef: candidate.credentialOwnerRef,
      deploymentId: candidate.deploymentId,
      outcome: "completed",
      submissionState: "submitted",
      streamCommitted: false,
      observedExecution: {
        model: "native:test",
        providerId: candidate.providerId,
        credentialOwnerRef: candidate.credentialOwnerRef,
        deploymentId: candidate.deploymentId,
        endpointSurface: candidate.endpointSurface,
      },
      usage: { input: 12, output: 7 },
      chargedCostMicros: 1_250,
    };
    expect(await completeInferenceAttempt({
      receipt,
      attemptOwnershipEpoch: 1,
      ownerToken,
    })).toBe(true);

    expect(await deliverSettledInferenceChatResponse(attemptId)).toBe("not_settled");
    expect(await findInferenceAssistantMessage({
      tenantId: "tenant-1",
      userId: 1,
      idempotencyKey,
    })).toBeNull();

    expect(await settleDurableInferenceCreditReservation({
      reservationId,
      settlementKey: attemptId,
      chargedCostMicros: 1_250,
    })).toBe(true);
    const deliveries = await Promise.all([
      deliverSettledInferenceChatResponse(attemptId),
      deliverSettledInferenceChatResponse(attemptId),
    ]);
    expect(deliveries.sort()).toEqual(["already_delivered", "delivered"]);
    await expect(findInferenceAssistantMessage({
      tenantId: "tenant-1",
      userId: 1,
      idempotencyKey,
    })).resolves.toMatchObject({
      conversationId,
      content: "recoverable answer",
      creditsUsed: "1.2500",
    });
    const [storedDelivery] = await db()
      .select({ status: llmInferenceChatResponseDeliveries.status, content: llmInferenceChatResponseDeliveries.content })
      .from(llmInferenceChatResponseDeliveries)
      .where(eq(llmInferenceChatResponseDeliveries.attemptId, attemptId));
    expect(storedDelivery).toEqual({ status: "delivered", content: null });
  });

  it("keeps reservation authority durable and settles the same attempt once after Redis TTL expiry", async () => {
    const now = new Date("2026-09-27T04:00:00.000Z");
    const idempotencyKey = `spec231:reservation:${randomUUID()}`;
    const reservationId = `reservation-${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32)}`;
    const [transaction] = await db()
      .insert(creditTransactions)
      .values({
        userId: 1,
        amount: -5,
        type: "usage",
        description: "Spec 231 reservation fixture",
        metadata: { reservationId, spec231InferenceReservation: true },
        balanceAfter: 95,
        idempotencyKey,
        sourceType: "chat",
        tenantId: "tenant-1",
      })
      .returning({ id: creditTransactions.id });
    creditTransactionIds.push(transaction.id);
    const reservationSnapshot = {
      reservationId,
      userId: 1,
      reservedAmount: 5,
      drawnAmount: 0,
      transactionId: transaction.id,
      sourceType: "chat" as const,
      idempotencyKey,
      tenantId: "tenant-1",
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
    };
    const created = await createDurableInferenceCreditReservation(
      {
        userId: 1,
        tenantId: "tenant-1",
        principalRef: "user:1",
        amount: 5,
        idempotencyKey,
        now,
      },
      {
        create: async () => reservationSnapshot,
      }
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    durableReservationIds.push(created.reservationId);

    await expect(
      loadDurableInferenceReservationAuthority({
        reservationId,
        tenantId: "tenant-1",
        principalRef: "user:1",
        userId: 1,
        now: new Date(now.getTime() + 11 * 60_000),
      })
    ).resolves.toBeNull();

    const settlement = {
      reservationId,
      settlementKey: `attempt:${randomUUID()}`,
      chargedCostMicros: 1_250,
    };
    const concurrentResults = await Promise.all([
      settleDurableInferenceCreditReservation(settlement),
      settleDurableInferenceCreditReservation(settlement),
    ]);
    expect(concurrentResults).toEqual([true, true]);
    await expect(
      settleDurableInferenceCreditReservation({
        ...settlement,
        chargedCostMicros: 2_000,
      })
    ).resolves.toBe(false);
    await expect(
      settleDurableInferenceCreditReservation({
        reservationId,
        settlementKey: `attempt:${randomUUID()}`,
        chargedCostMicros: 4_000,
      })
    ).resolves.toBe(false);

    const refund = vi.fn(async () => ({ success: true }) as never);
    await expect(
      closeDurableInferenceCreditReservation({ reservationId }, { refund })
    ).resolves.toBe(true);
    await expect(
      closeDurableInferenceCreditReservation({ reservationId }, { refund })
    ).resolves.toBe(true);
    expect(refund).toHaveBeenCalledOnce();
    expect(refund).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 3,
        originalTransactionId: transaction.id,
        idempotencyKey: `reservation:${reservationId}:refund`,
      })
    );
    await expect(
      settleDurableInferenceCreditReservation({
        reservationId,
        settlementKey: `attempt:${randomUUID()}`,
        chargedCostMicros: 500,
      })
    ).resolves.toBe(false);
  });

  it("rebuilds the durable reservation row from its idempotent ledger debit after a crash", async () => {
    const now = new Date("2026-09-27T04:00:00.000Z");
    const idempotencyKey = `spec231:reservation-recovery:${randomUUID()}`;
    const reservationId = `reservation-${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32)}`;
    const [transaction] = await db()
      .insert(creditTransactions)
      .values({
        userId: 1,
        amount: -4,
        type: "usage",
        description: "Spec 231 recovered reservation fixture",
        metadata: { reservationId, spec231InferenceReservation: true },
        balanceAfter: 96,
        idempotencyKey,
        sourceType: "chat",
        tenantId: "tenant-1",
        createdAt: new Date(now.getTime() - 60_000),
      })
      .returning({ id: creditTransactions.id });
    creditTransactionIds.push(transaction.id);

    const recovered = await createDurableInferenceCreditReservation(
      {
        userId: 1,
        tenantId: "tenant-1",
        principalRef: "user:1",
        amount: 4,
        idempotencyKey,
        now,
      },
      {
        create: async () => {
          throw new Error("simulated process restart after ledger debit");
        },
      }
    );

    expect(recovered).toMatchObject({
      ok: true,
      reservationId,
      authority: {
        tenantId: "tenant-1",
        principalRef: "user:1",
        availableBudgetMicros: 4_000,
      },
    });
    if (recovered.ok) durableReservationIds.push(recovered.reservationId);
    await expect(
      loadDurableInferenceReservationAuthority({
        reservationId,
        tenantId: "tenant-1",
        principalRef: "user:1",
        userId: 1,
        now,
      })
    ).resolves.toMatchObject({ availableBudgetMicros: 4_000 });
  });

  it("serializes duplicate reservation settlement across independent Node processes", async () => {
    const now = new Date();
    const idempotencyKey = `spec231:reservation-cross-process:${randomUUID()}`;
    const reservationId = `reservation-${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32)}`;
    const [transaction] = await db()
      .insert(creditTransactions)
      .values({
        userId: 1,
        amount: -1,
        type: "usage",
        description: "Spec 231 cross-process settlement fixture",
        metadata: { reservationId, spec231InferenceReservation: true },
        balanceAfter: 99,
        idempotencyKey,
        sourceType: "chat",
        tenantId: "tenant-1",
      })
      .returning({ id: creditTransactions.id });
    creditTransactionIds.push(transaction.id);
    const reservation = await createDurableInferenceCreditReservation(
      {
        userId: 1,
        tenantId: "tenant-1",
        principalRef: "user:1",
        amount: 1,
        idempotencyKey,
        now,
      },
      {
        create: async () => ({
          reservationId,
          userId: 1,
          reservedAmount: 1,
          drawnAmount: 0,
          transactionId: transaction.id,
          sourceType: "chat",
          idempotencyKey,
          tenantId: "tenant-1",
          createdAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 600_000).toISOString(),
        }),
      }
    );
    expect(reservation.ok).toBe(true);
    if (!reservation.ok) return;
    durableReservationIds.push(reservation.reservationId);

    const helperPath = resolve(
      process.cwd(),
      "scripts/spec231-settle-reservation-process.ts"
    );
    const settlement = {
      reservationId,
      settlementKey: `attempt:${randomUUID()}`,
      chargedCostMicros: 1_000,
    };
    const runSettlement = () =>
      execFileAsync(process.execPath, ["--import", "tsx", helperPath], {
        env: {
          ...process.env,
          SPEC231_SETTLEMENT_INPUT: JSON.stringify(settlement),
        },
        timeout: 30_000,
      });
    const processes = await Promise.all([runSettlement(), runSettlement()]);
    expect(processes.map(({ stdout }) => stdout.trim())).toEqual([
      "true",
      "true",
    ]);

    const [stored] = await db()
      .select({ settledCredits: llmInferenceCreditReservations.settledCredits })
      .from(llmInferenceCreditReservations)
      .where(eq(llmInferenceCreditReservations.reservationId, reservationId))
      .limit(1);
    expect(stored?.settledCredits).toBe(1);
    const [settlementCount] = await db()
      .select({ count: sql<number>`count(*)::int` })
      .from(llmInferenceCreditSettlements)
      .where(eq(llmInferenceCreditSettlements.reservationId, reservationId));
    expect(settlementCount?.count).toBe(1);
  }, 45_000);

  it("mirrors one existing idempotent credit debit into one reservation across processes", async () => {
    const idempotencyKey = `spec231:reservation-create-cross-process:${randomUUID()}`;
    const reservationId = `reservation-${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32)}`;
    const [transaction] = await db()
      .insert(creditTransactions)
      .values({
        userId: 1,
        amount: -3,
        type: "usage",
        description: "Spec 231 concurrent reservation creation fixture",
        metadata: { reservationId, spec231InferenceReservation: true },
        balanceAfter: 97,
        idempotencyKey,
        sourceType: "chat",
        tenantId: "tenant-1",
      })
      .returning({ id: creditTransactions.id });
    creditTransactionIds.push(transaction.id);

    const helperPath = resolve(
      process.cwd(),
      "scripts/spec231-create-reservation-process.ts"
    );
    const input = {
      userId: 1,
      tenantId: "tenant-1",
      principalRef: "user:1",
      amount: 3,
      idempotencyKey,
    };
    const submissions = await Promise.all(
      [1, 2].map(() =>
        execFileAsync(process.execPath, ["--import", "tsx", helperPath], {
          env: {
            ...process.env,
            SPEC231_RESERVATION_INPUT: JSON.stringify(input),
          },
          timeout: 45_000,
        })
      )
    );
    const results = submissions.map(({ stdout }) =>
      JSON.parse(stdout.trim().split(/\r?\n/).at(-1) ?? "{}")
    );
    expect(results).toEqual([
      { ok: true, reservationId },
      { ok: true, reservationId },
    ]);
    durableReservationIds.push(reservationId);

    const [reservationCount] = await db()
      .select({ count: sql<number>`count(*)::int` })
      .from(llmInferenceCreditReservations)
      .where(eq(llmInferenceCreditReservations.idempotencyKey, idempotencyKey));
    const [debitCount] = await db()
      .select({ count: sql<number>`count(*)::int` })
      .from(creditTransactions)
      .where(eq(creditTransactions.idempotencyKey, idempotencyKey));
    expect(reservationCount?.count).toBe(1);
    expect(debitCount?.count).toBe(1);
  }, 60_000);

  it("refuses to refund a reservation while its provider attempt is still active", async () => {
    const idempotencyKey = `spec231:active-attempt:${randomUUID()}`;
    const reservationId = `reservation-${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32)}`;
    const [transaction] = await db()
      .insert(creditTransactions)
      .values({
        userId: 1,
        amount: -3,
        type: "usage",
        description: "Spec 231 active attempt fixture",
        metadata: { reservationId, spec231InferenceReservation: true },
        balanceAfter: 97,
        idempotencyKey,
        sourceType: "chat",
        tenantId: "tenant-1",
      })
      .returning({ id: creditTransactions.id });
    creditTransactionIds.push(transaction.id);
    const snapshot = {
      reservationId,
      userId: 1,
      reservedAmount: 3,
      drawnAmount: 0,
      transactionId: transaction.id,
      sourceType: "chat" as const,
      idempotencyKey,
      tenantId: "tenant-1",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    };
    const created = await createDurableInferenceCreditReservation(
      {
        userId: 1,
        tenantId: "tenant-1",
        principalRef: "user:1",
        amount: 3,
        idempotencyKey,
      },
      { create: async () => snapshot }
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    durableReservationIds.push(reservationId);

    const plan = makePlan();
    plan.creditReservationId = reservationId;
    planIds.push(plan.planId);
    await persistInferencePlan({
      tenantId: "tenant-1",
      principalRef: "user:1",
      idempotencyKey: `idem:${plan.logicalCallId}`,
      scoreCalibrationRevision: "scores:active-attempt-test",
      plan,
    });
    await createInferenceAttempt({
      planId: plan.planId,
      attemptId: `attempt:${randomUUID()}`,
      attemptOrdinal: 1,
      attemptOwnershipEpoch: 1,
      ownerToken: randomUUID(),
      candidate,
    });

    const refund = vi.fn(async () => ({ success: true }) as never);
    await expect(
      closeDurableInferenceCreditReservation({ reservationId }, { refund })
    ).resolves.toBe(false);
    expect(refund).not.toHaveBeenCalled();
  });

  it("lists immutable policy revisions and atomically rolls the current head back with an audit event", async () => {
    const marker = randomUUID();
    const makePolicy = (suffix: string) => ({
      ready: true,
      allowedProviderIds: [`provider:${marker}:${suffix}`],
      allowedRegions: ["TH"],
      allowedCredentialOwnerRefs: [`credential:${marker}`],
      requireZeroDataRetention: true,
      routingPolicy: {
        scoreCalibrationRevision: `scores:${marker}:${suffix}`,
        weights: {
          qualityPpm: 800_000,
          costPpm: 50_000,
          latencyPpm: 50_000,
          reliabilityPpm: 50_000,
          compatibilityPpm: 50_000,
        },
      },
    });
    const first = await publishInferencePolicy({
      policyInput: { scopeType: "platform", policy: makePolicy("first") },
      actorUserId: 1,
    });
    policyScopeKeys.push({ scopeType: "platform", scopeKey: "platform" });
    const second = await publishInferencePolicy({
      policyInput: { scopeType: "platform", policy: makePolicy("second") },
      actorUserId: 1,
    });

    const history = await listInferencePolicyRevisions({
      scopeType: "platform",
      scopeKey: "platform",
      limit: 50,
    });
    expect(history.revisions.map(item => item.revision)).toEqual(
      expect.arrayContaining([first.revision, second.revision])
    );
    expect(history.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "publish",
          fromRevision: first.revision,
          toRevision: second.revision,
          actorUserId: 1,
        }),
      ])
    );

    await expect(
      rollbackInferencePolicy({
        rollbackInput: {
          scopeType: "platform",
          scopeKey: "platform",
          revision: first.revision,
        },
        actorUserId: 1,
      })
    ).resolves.toMatchObject({
      changed: true,
      fromRevision: second.revision,
      revision: first.revision,
    });
    await expect(
      listInferencePolicyHeads({
        scopeType: "platform",
        scopeKey: "platform",
      })
    ).resolves.toMatchObject([{ revision: first.revision }]);

    const afterRollback = await listInferencePolicyRevisions({
      scopeType: "platform",
      scopeKey: "platform",
      limit: 50,
    });
    expect(afterRollback.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "rollback",
          fromRevision: second.revision,
          toRevision: first.revision,
          actorUserId: 1,
        }),
      ])
    );
    await expect(
      db()
        .update(llmInferencePolicySnapshots)
        .set({ policyJson: makePolicy("tampered") })
        .where(eq(llmInferencePolicySnapshots.revision, first.revision))
    ).rejects.toMatchObject({
      cause: expect.objectContaining({
        message: expect.stringContaining(
          "llm inference authority history is append-only"
        ),
      }),
    });
    await expect(
      db()
        .delete(llmInferencePolicyEvents)
        .where(eq(llmInferencePolicyEvents.toRevision, first.revision))
    ).rejects.toMatchObject({
      cause: expect.objectContaining({
        message: expect.stringContaining(
          "llm inference authority history is append-only"
        ),
      }),
    });
    await expect(
      rollbackInferencePolicy({
        rollbackInput: {
          scopeType: "platform",
          scopeKey: "platform",
          revision: `sha256:${"0".repeat(64)}`,
        },
        actorUserId: 1,
      })
    ).rejects.toThrow("Inference policy revision was not found in this scope");
  });

  it("stores audited revocations and lists only the effective tenant/principal scope", async () => {
    const principalRef = `principal:${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const tenantTargetId = `deployment:tenant:${randomUUID()}`;
    const principalTargetId = `model:principal:${randomUUID()}`;
    const otherTenantTargetId = `deployment:other-tenant:${randomUUID()}`;
    const common = {
      targetType: "deployment" as const,
      reasonCode: "operator_action" as const,
      expiresAt,
    };

    const tenantRevocation = await createInferenceRevocation({
      actorUserId: 1,
      revocationInput: {
        ...common,
        scopeType: "tenant",
        tenantId: "tenant-1",
        targetId: tenantTargetId,
      },
    });
    const principalRevocation = await createInferenceRevocation({
      actorUserId: 1,
      revocationInput: {
        ...common,
        scopeType: "principal",
        tenantId: "tenant-1",
        principalRef,
        targetType: "model",
        targetId: principalTargetId,
      },
    });
    await createInferenceRevocation({
      actorUserId: 1,
      revocationInput: {
        ...common,
        scopeType: "tenant",
        tenantId: "tenant-2",
        targetId: otherTenantTargetId,
      },
    });

    expect(tenantRevocation.createdByUserId).toBe(1);
    expect(principalRevocation.createdByUserId).toBe(1);
    const effective = await listInferenceRevocations({
      tenantId: "tenant-1",
      principalRef,
    });
    expect(effective.map(row => row.targetId)).toEqual(
      expect.arrayContaining([tenantTargetId, principalTargetId])
    );
    expect(effective.map(row => row.targetId)).not.toContain(
      otherTenantTargetId
    );
    expect(effective.every(row => row.createdByUserId === 1)).toBe(true);
  });

  it("selects an AUTO route from current PostgreSQL policy and certified profile heads", async () => {
    const now = new Date();
    const nowMs = now.getTime();
    const principalId = `principal:${randomUUID()}`;
    const providerId = "provider:llm-provider:7";
    const credentialOwnerRef = "credential-owner:llm-provider:7";
    const deploymentId = `deployment:db-auto:${randomUUID()}`;
    const modelId = `model:db-auto:${randomUUID()}`;
    const modelRevision = "model-revision:db-auto-1";
    const policy = {
      ready: true,
      allowedProviderIds: [providerId],
      allowedRegions: ["TH"],
      allowedCredentialOwnerRefs: [credentialOwnerRef],
      requireZeroDataRetention: true,
    };
    for (const policyInput of [
      {
        scopeType: "platform" as const,
        policy: {
          ...policy,
          routingPolicy: {
            ...DEFAULT_INFERENCE_ROUTER_POLICY,
            scoreCalibrationRevision: "scores:auto-test-1",
          },
        },
      },
      { scopeType: "tenant" as const, tenantId: "tenant-1", policy },
      {
        scopeType: "principal" as const,
        tenantId: "tenant-1",
        principalRef: principalId,
        policy,
      },
    ]) {
      const published = await publishInferencePolicy({
        policyInput,
        actorUserId: 1,
      });
      policyScopeKeys.push(published);
    }

    const model = {
      logicalModelId: modelId,
      revision: modelRevision,
      providerNativeModelId: "native:auto-test-model",
      lifecycle: "ACTIVE",
      capabilityRefs: ["capability:text"],
      capabilities: {
        inputModalities: ["text"],
        outputModalities: ["text"],
        features: [],
        toolContractRefs: [],
        maxContextTokens: 8_000,
        maxOutputTokens: 1_000,
      },
    };
    const deployment = {
      deploymentId,
      revision: "deployment-revision:auto-1",
      logicalModelId: modelId,
      logicalModelRevision: modelRevision,
      providerId,
      credentialOwnerRef,
      endpointSurface: "responses_compatible",
      executionSurface: "cloud",
      region: "TH",
      allowedRegions: ["TH"],
      allowedPrivacyClasses: ["tenant-confidential"],
      retention: "zero-data-retention",
      status: "ACTIVE",
      health: "healthy",
      healthObservedAtMs: nowMs,
      latencyP95Ms: 100,
      qualityScorePpm: 900_000,
      reliabilityScorePpm: 900_000,
      compatibilityScorePpm: 900_000,
      scoreCalibrationRevision: "scores:auto-test-1",
      resolvedAliasRevision: modelRevision,
      probe: {
        source: "live_probe",
        endpointSurface: "responses_compatible",
        probeSuiteRevision: "certification:auto-test-1",
        evidenceRef: `sha256:${"c".repeat(64)}`,
        observedAtMs: nowMs,
        validUntilMs: nowMs + 24 * 60 * 60 * 1_000,
        probedCapabilityRefs: ["capability:text"],
        checks: {
          basicRequestResponse: true,
          chatResponsesParity: false,
          streamingCancellation: false,
          toolsContinuation: false,
          strictSchema: false,
          reasoningUsage: false,
          multimodal: false,
          contextOutputLimits: true,
          regionRetention: true,
          credentialOwnership: true,
        },
      },
      price: {
        currency: "USD_MICROS",
        inputMicrosPerMillion: 1_000_000,
        outputMicrosPerMillion: 1_000_000,
        snapshotRef: "price:auto-test-1",
        validUntilMs: nowMs + 24 * 60 * 60 * 1_000,
      },
      runtimeBinding: {
        kind: "llm_provider_map",
        providerRecordId: 7,
        modelMappingId: 19,
      },
    };
    profileDeploymentIds.push(deploymentId);
    const [profileVersion] = await db()
      .insert(llmInferenceProfileVersions)
      .values({
        deploymentId,
        deploymentRevision: deployment.revision,
        logicalModelId: modelId,
        modelRevision,
        providerId,
        profileJson: { model, deployment },
        createdByUserId: 1,
      })
      .returning({ id: llmInferenceProfileVersions.id });
    await db().insert(llmInferenceProfileHeads).values({
      deploymentId,
      profileVersionId: profileVersion.id,
    });
    const capabilityProbeRunId = randomUUID();
    const capabilityProbeFinishedAt = new Date(nowMs);
    await db()
      .insert(llmInferenceProbeRuns)
      .values({
        runId: capabilityProbeRunId,
        profileVersionId: profileVersion.id,
        deploymentId,
        deploymentRevision: deployment.revision,
        providerRecordId: 7,
        modelMappingId: 19,
        actorUserId: 1,
        probeKind: "capability_suite",
        probeSuiteRevision: deployment.probe.probeSuiteRevision,
        status: "passed",
        resultJson: {
          qualificationStatus: "passed",
          evidenceRef: deployment.probe.evidenceRef,
          checks: deployment.probe.checks,
          probedCapabilityRefs: deployment.probe.probedCapabilityRefs,
          runtimeBindingHash: `sha256:${"d".repeat(64)}`,
        },
        startedAt: new Date(nowMs - 1_000),
        finishedAt: capabilityProbeFinishedAt,
      });
    await db().insert(llmInferenceProfileCertifications).values({
      profileVersionId: profileVersion.id,
      probeRunId: capabilityProbeRunId,
      certifiedProfileJson: { model, deployment },
      certifiedByUserId: 1,
      certifiedAt: capabilityProbeFinishedAt,
    });

    const request = {
      contract: "SAH-INFERENCE-2",
      requestId: `request:${randomUUID()}`,
      traceId: "untrusted-trace",
      tenantId: "tenant-1",
      principalId,
      consumer: "chat",
      taskClass: "general-chat",
      purpose: "answer",
      inputModalities: ["text"],
      outputModalities: ["text"],
      inputTokenEstimate: 100,
      outputTokenReserve: 100,
      requiredFeatures: [],
      languageHints: ["th"],
      privacyClass: "public",
      residencyAllowlist: ["US", "TH"],
      zdrRequired: false,
      qualityClass: "standard",
      risk: "low",
      latencyDeadlineMs: 5_000,
      maxEstimatedCostMicros: 10_000,
      selection: { mode: "AUTO" },
      policyRevision: "client-controlled-policy",
      budgetScopeRef: "client-controlled-budget",
      idempotencyKey: "client-controlled-idempotency",
    };
    const planningInput = {
      request,
      now,
      owners: {
        budget: {
          tenantId: "tenant-1",
          principalId,
          revision: "budget:auto-test-1",
          observedAtMs: nowMs,
          ready: true,
          availableBudgetMicros: 10_000,
        },
        requestContext: {
          tenantId: "tenant-1",
          principalId,
          traceId: `trusted-trace:${randomUUID()}`,
          budgetScopeRef: "tenant:tenant-1",
          idempotencyKey: `idem:${randomUUID()}`,
          effectivePrivacyClass: "tenant-confidential",
          effectiveRisk: "low",
        },
      },
    };
    const result = await planInferenceRouteForRequest(planningInput);

    expect(result).toMatchObject({
      status: "planned",
      boundIntent: {
        tenantId: "tenant-1",
        principalId,
        traceId: expect.stringMatching(/^trusted-trace:/),
        privacyClass: "tenant-confidential",
        zdrRequired: true,
        selection: { mode: "AUTO" },
      },
      route: {
        status: "selected",
        candidate: {
          deploymentId,
          providerId,
          qualification: "qualified",
        },
      },
    });
    if (result.status !== "planned" || result.route.status !== "selected") {
      throw new Error(
        "Expected a selected AUTO route for the integration fixture"
      );
    }
    const helperPath = resolve(
      process.cwd(),
      "scripts/spec231-plan-route-process.ts"
    );
    const workerResults = await Promise.all(
      [1, 2].map(async () => {
        const subprocess = await execFileAsync(
          process.execPath,
          ["--import", "tsx", helperPath],
          {
            env: {
              ...process.env,
              SPEC231_PLAN_ROUTE_INPUT: JSON.stringify(planningInput),
            },
            timeout: 60_000,
          }
        );
        return JSON.parse(
          subprocess.stdout.trim().split(/\r?\n/).at(-1) ?? "{}"
        );
      })
    );
    expect(workerResults).toEqual([
      { status: "planned", routeStatus: "selected", deploymentId },
      { status: "planned", routeStatus: "selected", deploymentId },
    ]);

    const planId = `db-auto-plan:${randomUUID()}`;
    planIds.push(planId);
    const reservationId = `reservation:${randomUUID()}`;
    const certifiedRegistry = await loadInferenceProfileRegistry();
    const capabilityRecheck = assessInferenceCapabilityRecheck(
      certifiedRegistry,
      Date.now()
    );
    expect(capabilityRecheck).toMatchObject({ ready: true });
    if (!capabilityRecheck.ready) return;
    const rolloutBundle = await publishInferenceRolloutBundle({
      actorUserId: 1,
      bundle: {
        bundleId: `db-auto-bundle:${randomUUID()}`,
        sequence: Math.floor(Math.random() * 2_000_000_000) + 1,
        routerPolicyRevision: result.authority.routerPolicyRevision,
        logicalModelRegistryRevision: result.registryRevision,
        deploymentCredentialBindingRevision: `bindings:${randomUUID()}`,
        surfaceCertificationRevision: `surface:${randomUUID()}`,
        gatewayRouteManifestHashes: [`sha256:${"a".repeat(64)}`],
        billingPricingSnapshotRefs: [`pricing:${randomUUID()}`],
        fxPolicyRevision: "fx:usd-micros-v1",
        guardrailPolicyRevision: `guardrail:${randomUUID()}`,
        rollbackBundleHash: `sha256:${"e".repeat(64)}`,
        providerCapabilityRecheckRef: capabilityRecheck.reference,
        environmentReadinessRef: `readiness:${randomUUID()}`,
      },
    });
    const staleCapabilityBundle = await publishInferenceRolloutBundle({
      actorUserId: 1,
      bundle: {
        bundleId: `db-auto-stale-capability:${randomUUID()}`,
        sequence: Math.floor(Math.random() * 2_000_000_000) + 1,
        routerPolicyRevision: result.authority.routerPolicyRevision,
        logicalModelRegistryRevision: result.registryRevision,
        deploymentCredentialBindingRevision: `bindings:${randomUUID()}`,
        surfaceCertificationRevision: `surface:${randomUUID()}`,
        gatewayRouteManifestHashes: [`sha256:${"b".repeat(64)}`],
        billingPricingSnapshotRefs: [`pricing:${randomUUID()}`],
        fxPolicyRevision: "fx:usd-micros-v1",
        guardrailPolicyRevision: `guardrail:${randomUUID()}`,
        rollbackBundleHash: `sha256:${"e".repeat(64)}`,
        providerCapabilityRecheckRef: `sha256:${"f".repeat(64)}`,
        environmentReadinessRef: `readiness:${randomUUID()}`,
      },
    });
    await expect(
      activateInferenceRolloutBundle({
        bundleHash: staleCapabilityBundle.bundleHash,
        actorUserId: 1,
      })
    ).resolves.toEqual({
      ok: false,
      reason: "PROVIDER_CAPABILITY_RECHECK_UNAVAILABLE",
    });
    await expect(
      activateInferenceRolloutBundle({
        bundleHash: rolloutBundle.bundleHash,
        actorUserId: 1,
      })
    ).resolves.toEqual({
      ok: false,
      reason: "ENVIRONMENT_READINESS_UNAVAILABLE",
    });

    const activation = await activateInferenceRolloutBundle(
      { bundleHash: rolloutBundle.bundleHash, actorUserId: 1 },
      {
        verifyEnvironmentReadiness: async () => true,
      }
    );
    expect(activation).toEqual({
      ok: true,
      bundleHash: rolloutBundle.bundleHash,
      action: "activate",
    });
    const [activationEvent] = await db()
      .select()
      .from(llmInferenceRolloutBundleEvents)
      .where(
        eq(
          llmInferenceRolloutBundleEvents.toBundleHash,
          rolloutBundle.bundleHash
        )
      )
      .limit(1);
    expect(activationEvent).toMatchObject({
      action: "activate",
      actorUserId: 1,
      readinessEvidenceJson: {
        capabilityVerifierPassed: true,
        environmentVerifierPassed: true,
      },
    });
    const context = {
      planId,
      attemptBudget: 1,
      startedAtMs: nowMs,
      overallDeadlineAt: new Date(nowMs + 300_000).toISOString(),
      fallbackPermission: "none" as const,
      preapprovedFallbackDeploymentIds: [],
      cachePolicyId: "cache:no-store-private",
      creditReservationId: reservationId,
      parentCostCeilingMicros: 10_000,
      routePolicyRevision: result.authority.routerPolicyRevision,
      specRevision: "R4",
      rolloutBundleHash: rolloutBundle.bundleHash,
      logicalCallId: `call:${randomUUID()}`,
      attemptOwnershipEpoch: 1,
      residencyPolicySnapshotRef: "residency:auto-test-1",
      routerFeatureProvenanceRef: "feature:auto-test-1",
    };
    const reservation = {
      reservationId,
      tenantId: "tenant-1",
      principalRef: principalId,
      availableBudgetMicros: 10_000,
      expiresAt: new Date(nowMs + 300_000).toISOString(),
      status: "reserved" as const,
    };
    const facadeInput = {
      request: {
        ...request,
        requestId: `request:${randomUUID()}`,
        latencyDeadlineMs: 300_000,
      },
      owners: planningInput.owners,
      context,
      reservation,
      userId: 1,
      messages: [{ role: "user", content: "integration probe" }],
      stream: false,
      attemptOwnershipEpoch: 1,
      ownerToken: `owner:${randomUUID()}`,
      now,
      loadReservationAuthority: async () => reservation,
      settleCompletedAttempt: async () => true,
    };
    let providerExecutions = 0;
    const facadeDependencies = {
      createExecutionBindings: () => ({
        resolveCandidate: async () => ({
          candidate: result.route.candidate,
          authority: result.authority,
        }),
        loadReservationAuthority: async () => reservation,
        settleCompletedAttempt: async () => true,
        providerIdempotencyCertified: () => false,
        executeAttempt: async ({ candidate: selected }) => {
          providerExecutions += 1;
          return {
            observation: {
              outcome: "completed",
              submissionState: "submitted",
              streamCommitted: false,
              chargedCostMicros: 10,
              observedExecution: {
                model: selected.providerModelId ?? "native:auto-test-model",
                providerId: selected.providerId,
                credentialOwnerRef: selected.credentialOwnerRef,
                deploymentId: selected.deploymentId,
                endpointSurface: selected.endpointSurface,
              },
            },
            response: { text: "controlled integration response" },
          };
        },
      }),
    };
    const routed = await executePolicyRoutedInference(
      facadeInput,
      facadeDependencies
    );
    const completedAttemptId =
      routed.status === "executed" && routed.execution.status === "completed"
        ? routed.execution.receipt.attemptId
        : undefined;

    expect(routed).toMatchObject({
      status: "executed",
      planning: {
        status: "plan_persisted",
        selectedDeploymentId: deploymentId,
      },
    });
    if (routed.status === "executed") {
      expect(
        inferencePlanR4Schema.safeParse(routed.planning.plan)
      ).toMatchObject({ success: true });
      const parsedIntent = inferenceIntentV2Schema.safeParse(
        routed.planning.intent
      );
      if (!parsedIntent.success)
        throw new Error(JSON.stringify(parsedIntent.error.issues));
      expect(hashInferenceIntent(routed.planning.intent)).toBe(
        routed.planning.plan.intentHash
      );
      expect(routed.execution).toMatchObject({
        status: "completed",
        response: { text: "controlled integration response" },
      });
    }
    const retryHelperPath = resolve(
      process.cwd(),
      "scripts/spec231-policy-routed-retry-process.ts"
    );
    const retryProcesses = await Promise.all(
      [1, 2].map(() =>
        execFileAsync(process.execPath, ["--import", "tsx", retryHelperPath], {
          env: {
            ...process.env,
            SPEC231_POLICY_ROUTED_INPUT: JSON.stringify(facadeInput),
          },
          timeout: 60_000,
        })
      )
    );
    const retried = retryProcesses.map(({ stdout }) =>
      JSON.parse(stdout.trim().split(/\r?\n/).at(-1) ?? "{}")
    );
    expect(retried).toHaveLength(2);
    for (const retry of retried) {
      expect(retry).toMatchObject({
        status: "executed",
        planId,
        planCreated: false,
        executionStatus: "duplicate_attempt",
        attemptId: completedAttemptId,
        existingStatus: "terminal",
        providerInvoked: false,
      });
    }
    expect(providerExecutions).toBe(1);

    const concurrentPlanId = `db-auto-race-plan:${randomUUID()}`;
    planIds.push(concurrentPlanId);
    const concurrentReservationId = `reservation:${randomUUID()}`;
    const concurrentInput = {
      ...facadeInput,
      request: {
        ...request,
        requestId: `request:${randomUUID()}`,
        latencyDeadlineMs: 300_000,
      },
      owners: {
        ...planningInput.owners,
        requestContext: {
          ...planningInput.owners.requestContext,
          idempotencyKey: `idem:${randomUUID()}`,
        },
      },
      context: {
        ...context,
        planId: concurrentPlanId,
        creditReservationId: concurrentReservationId,
        logicalCallId: `call:${randomUUID()}`,
        overallDeadlineAt: new Date(nowMs + 300_000).toISOString(),
      },
      reservation: {
        ...reservation,
        reservationId: concurrentReservationId,
        expiresAt: new Date(nowMs + 300_000).toISOString(),
      },
      ownerToken: `owner:${randomUUID()}`,
    };
    const concurrentStarts = await Promise.all(
      [1, 2].map(() =>
        execFileAsync(process.execPath, ["--import", "tsx", retryHelperPath], {
          env: {
            ...process.env,
            SPEC231_POLICY_ROUTED_INPUT: JSON.stringify(concurrentInput),
          },
          timeout: 60_000,
        })
      )
    );
    const concurrentResults = concurrentStarts.map(({ stdout }) =>
      JSON.parse(stdout.trim().split(/\r?\n/).at(-1) ?? "{}")
    );
    expect(concurrentResults).toHaveLength(2);
    expect(
      concurrentResults.filter(result => result.providerInvoked)
    ).toHaveLength(1);
    expect(
      concurrentResults.map(result => result.executionStatus).sort()
    ).toEqual(["completed", "duplicate_attempt"]);
    expect(
      new Set(concurrentResults.map(result => result.attemptId))
    ).toHaveLength(1);
    if (
      routed.status === "executed" &&
      routed.execution.status === "completed"
    ) {
      const [storedAttempt] = await db()
        .select({
          status: llmInferenceAttempts.status,
          outcome: llmInferenceAttempts.outcome,
        })
        .from(llmInferenceAttempts)
        .where(
          eq(llmInferenceAttempts.attemptId, routed.execution.receipt.attemptId)
        );
      expect(storedAttempt).toMatchObject({
        status: "terminal",
        outcome: "completed",
      });
    }
  }, 90_000);

  it("persists plans idempotently against the real PostgreSQL schema", async () => {
    const plan = makePlan();
    planIds.push(plan.planId);
    const input = {
      tenantId: "tenant-1",
      principalRef: "principal-db-test",
      idempotencyKey: `idem:${plan.logicalCallId}`,
      scoreCalibrationRevision: "scores:test",
      plan,
    };

    const first = await persistInferencePlan(input);
    const retry = await persistInferencePlan(input);
    expect(first.created).toBe(true);
    expect(retry.created).toBe(false);
    expect(retry.plan.planId).toBe(plan.planId);
  });

  it("persists one canonical plan when concurrent requests share an idempotency key", async () => {
    const plan = makePlan();
    planIds.push(plan.planId);
    const input = {
      tenantId: "tenant-1",
      principalRef: "principal-db-test",
      idempotencyKey: `idem:${plan.logicalCallId}`,
      scoreCalibrationRevision: "scores:test",
      plan,
    };

    const results = await Promise.all(
      Array.from({ length: 8 }, () => persistInferencePlan(input))
    );

    expect(results.filter(result => result.created)).toHaveLength(1);
    expect(new Set(results.map(result => result.plan.planId))).toEqual(
      new Set([plan.planId])
    );
  });

  it("persists one canonical plan across independent Node processes", async () => {
    const plan = makePlan();
    planIds.push(plan.planId);
    const input = {
      tenantId: "tenant-1",
      principalRef: "principal-db-test",
      idempotencyKey: `idem:${plan.logicalCallId}`,
      scoreCalibrationRevision: "scores:test",
      plan,
    };
    const helperPath = resolve(
      process.cwd(),
      "scripts/spec231-persist-plan-process.ts"
    );

    const submissions = await Promise.all(
      Array.from({ length: 4 }, () =>
        execFileAsync(process.execPath, ["--import", "tsx", helperPath], {
          env: {
            ...process.env,
            SPEC231_PERSIST_PLAN_INPUT: JSON.stringify(input),
          },
          timeout: 30_000,
        })
      )
    );
    const results = submissions.map(({ stdout }) =>
      JSON.parse(stdout.trim().split(/\r?\n/).at(-1) ?? "{}")
    );

    expect(results.filter(result => result.created)).toHaveLength(1);
    expect(new Set(results.map(result => result.planId))).toEqual(
      new Set([plan.planId])
    );
  }, 45_000);

  it("certifies only the latest passed probe and atomically moves the candidate into the active registry", async () => {
    const now = new Date();
    const deploymentId = `deployment:certify:${randomUUID()}`;
    profileDeploymentIds.push(deploymentId);
    const modelId = `model:certify:${randomUUID()}`;
    const profile = {
      model: {
        logicalModelId: modelId,
        revision: "model-rev:certify-1",
        providerNativeModelId: "native-certify-model",
        lifecycle: "POLICY_REVIEWED" as const,
        capabilityRefs: ["capability:text-chat"],
        capabilities: {
          inputModalities: ["text" as const],
          outputModalities: ["text" as const],
          features: [],
          toolContractRefs: [],
          maxContextTokens: 8_000,
          maxOutputTokens: 512,
        },
      },
      deployment: {
        deploymentId,
        revision: "deployment-rev:certify-1",
        logicalModelId: modelId,
        logicalModelRevision: "model-rev:certify-1",
        providerId: "provider:llm-provider:7",
        credentialOwnerRef: "credential-owner:llm-provider:7",
        endpointSurface: "responses_compatible" as const,
        executionSurface: "cloud" as const,
        region: "TH",
        allowedRegions: ["TH"],
        allowedPrivacyClasses: ["tenant-confidential"],
        retention: "limited-retention" as const,
        status: "DEGRADED" as const,
        health: "degraded" as const,
        healthObservedAtMs: now.getTime(),
        latencyP95Ms: 100,
        resolvedAliasRevision: "model-rev:certify-1",
        probe: {
          source: "catalog_metadata" as const,
          endpointSurface: "responses_compatible" as const,
          probeSuiteRevision: "catalog:1",
          evidenceRef: "catalog:certify",
          observedAtMs: now.getTime(),
          validUntilMs: now.getTime() + 60_000,
          probedCapabilityRefs: [],
          checks: {
            basicRequestResponse: false,
            chatResponsesParity: false,
            streamingCancellation: false,
            toolsContinuation: false,
            strictSchema: false,
            reasoningUsage: false,
            multimodal: false,
            contextOutputLimits: false,
            regionRetention: false,
            credentialOwnership: false,
          },
        },
        price: {
          currency: "USD_MICROS" as const,
          inputMicrosPerMillion: 1_000,
          outputMicrosPerMillion: 1_000,
          snapshotRef: "price:certify",
          validUntilMs: now.getTime() + 60_000,
        },
        runtimeBinding: {
          kind: "llm_provider_map" as const,
          providerRecordId: 7,
          modelMappingId: 19,
        },
      },
    };
    const published = await publishInferenceProfileVersion({
      profileInput: profile,
      actorUserId: 1,
    });
    expect(published.ok).toBe(true);
    if (!published.ok) return;

    const newerIncompleteRunId = randomUUID();
    const incompleteFinishedAt = new Date(now.getTime() + 250);
    await db()
      .insert(llmInferenceProbeRuns)
      .values({
        runId: newerIncompleteRunId,
        profileVersionId: published.profileVersionId,
        deploymentId,
        deploymentRevision: profile.deployment.revision,
        providerRecordId: 7,
        modelMappingId: 19,
        actorUserId: 1,
        probeKind: "capability_suite",
        probeSuiteRevision: "capability:1",
        status: "incomplete",
        resultJson: {
          qualificationStatus: "incomplete",
          reasonCodes: ["CONTEXT_WINDOW_PROBE_UNAVAILABLE"],
        },
        startedAt: now,
        finishedAt: incompleteFinishedAt,
      });
    await expect(
      certifyStoredInferenceProfileCandidate({
        deploymentId,
        actorUserId: 1,
        now: new Date(now.getTime() + 300),
      })
    ).resolves.toMatchObject({
      ok: false,
      reason: "CAPABILITY_PROBE_NOT_PASSED",
    });

    const runId = randomUUID();
    const finishedAt = new Date(now.getTime() + 500);
    await db()
      .insert(llmInferenceProbeRuns)
      .values({
        runId,
        profileVersionId: published.profileVersionId,
        deploymentId,
        deploymentRevision: profile.deployment.revision,
        providerRecordId: 7,
        modelMappingId: 19,
        actorUserId: 1,
        probeKind: "capability_suite",
        probeSuiteRevision: "capability:1",
        status: "passed",
        resultJson: {
          qualificationStatus: "passed",
          evidenceRef: `sha256:${"c".repeat(64)}`,
          runtimeBindingHash: `sha256:${"d".repeat(64)}`,
          maximumOutputLimitVerified: true,
          probedCapabilityRefs: ["capability:text-chat"],
          checks: {
            basicRequestResponse: true,
            chatResponsesParity: false,
            streamingCancellation: false,
            toolsContinuation: false,
            strictSchema: false,
            reasoningUsage: false,
            multimodal: false,
            contextOutputLimits: true,
            regionRetention: true,
            credentialOwnership: true,
          },
          reasonCodes: [],
        },
        startedAt: now,
        finishedAt,
      });

    const certified = await certifyStoredInferenceProfileCandidate({
      deploymentId,
      actorUserId: 1,
      now: finishedAt,
    });
    expect(certified).toMatchObject({
      ok: true,
      profileVersionId: published.profileVersionId,
      probeRunId: runId,
      action: "certified",
    });
    const activeRegistry = await loadInferenceProfileRegistry(finishedAt);
    expect(activeRegistry).toMatchObject({
      ok: true,
      profiles: [
        {
          model: { logicalModelId: modelId, lifecycle: "ACTIVE" },
          deployment: {
            deploymentId,
            status: "ACTIVE",
            probe: {
              source: "live_probe",
              evidenceRef: `sha256:${"c".repeat(64)}`,
            },
          },
        },
      ],
    });
    const [storedCertification] = await db()
      .select()
      .from(llmInferenceProfileCertifications)
      .where(
        eq(
          llmInferenceProfileCertifications.profileVersionId,
          published.profileVersionId
        )
      );
    expect(storedCertification).toMatchObject({
      probeRunId: runId,
      certifiedByUserId: 1,
    });
    await expect(
      db()
        .update(llmInferenceProfileCertifications)
        .set({ certifiedByUserId: 1 })
        .where(
          eq(
            llmInferenceProfileCertifications.profileVersionId,
            published.profileVersionId
          )
        )
    ).rejects.toThrow();
    await expect(
      certifyStoredInferenceProfileCandidate({
        deploymentId,
        actorUserId: 1,
        now: finishedAt,
      })
    ).resolves.toMatchObject({ ok: true, action: "already_certified" });
  });

  it("stores redacted connectivity probe evidence as immutable profile-version history", async () => {
    const deploymentId = `deployment:probe:${randomUUID()}`;
    profileDeploymentIds.push(deploymentId);
    const profile = {
      model: {
        logicalModelId: `model:probe:${randomUUID()}`,
        revision: "model-rev:probe-1",
        providerNativeModelId: "native-probe-model",
        lifecycle: "METADATA_VALIDATED" as const,
        capabilityRefs: ["capability:chat"],
        capabilities: {
          inputModalities: ["text" as const],
          outputModalities: ["text" as const],
          features: [],
          toolContractRefs: [],
          maxContextTokens: 8_000,
          maxOutputTokens: 512,
        },
      },
      deployment: {
        deploymentId,
        revision: "deployment-rev:probe-1",
        logicalModelId: "placeholder",
        logicalModelRevision: "model-rev:probe-1",
        providerId: "provider:llm-provider:7",
        credentialOwnerRef: "credential-owner:llm-provider:7",
        endpointSurface: "responses_compatible" as const,
        executionSurface: "cloud" as const,
        region: "TH",
        allowedRegions: ["TH"],
        allowedPrivacyClasses: ["tenant-confidential"],
        retention: "unknown" as const,
        status: "DEGRADED" as const,
        health: "degraded" as const,
        healthObservedAtMs: 1,
        latencyP95Ms: 0,
        resolvedAliasRevision: "model-rev:probe-1",
        probe: {
          source: "catalog_metadata" as const,
          endpointSurface: "responses_compatible" as const,
          probeSuiteRevision: "catalog:1",
          evidenceRef: "catalog:probe",
          observedAtMs: 1,
          validUntilMs: 999_999,
          probedCapabilityRefs: [],
          checks: {
            basicRequestResponse: false,
            chatResponsesParity: false,
            streamingCancellation: false,
            toolsContinuation: false,
            strictSchema: false,
            reasoningUsage: false,
            multimodal: false,
            contextOutputLimits: false,
            regionRetention: false,
            credentialOwnership: false,
          },
        },
        price: {
          currency: "USD_MICROS" as const,
          inputMicrosPerMillion: 0,
          outputMicrosPerMillion: 0,
          snapshotRef: "price:probe",
          validUntilMs: 999_999,
        },
        runtimeBinding: {
          kind: "llm_provider_map" as const,
          providerRecordId: 7,
          modelMappingId: 19,
        },
      },
    };
    profile.deployment.logicalModelId = profile.model.logicalModelId;
    const activeDeployment = {
      ...profile.deployment,
      revision: "deployment-rev:active",
      status: "ACTIVE" as const,
      health: "healthy" as const,
    };
    const [activeVersion] = await db()
      .insert(llmInferenceProfileVersions)
      .values({
        deploymentId,
        deploymentRevision: activeDeployment.revision,
        logicalModelId: profile.model.logicalModelId,
        modelRevision: profile.model.revision,
        providerId: activeDeployment.providerId,
        profileJson: { model: profile.model, deployment: activeDeployment },
        createdByUserId: 1,
      })
      .returning({ id: llmInferenceProfileVersions.id });
    await db().insert(llmInferenceProfileHeads).values({
      deploymentId,
      profileVersionId: activeVersion.id,
    });
    const uncertifiedRegistry = await loadInferenceProfileRegistry(new Date());
    expect(uncertifiedRegistry.ok).toBe(true);
    if (uncertifiedRegistry.ok) {
      expect(
        uncertifiedRegistry.profiles.some(
          item => item.deployment.deploymentId === deploymentId
        )
      ).toBe(false);
    }
    const created = await publishInferenceProfileVersion({
      profileInput: profile,
      actorUserId: 1,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const [candidateHead] = await db()
      .select({
        profileVersionId: llmInferenceProfileCandidateHeads.profileVersionId,
      })
      .from(llmInferenceProfileCandidateHeads)
      .where(eq(llmInferenceProfileCandidateHeads.deploymentId, deploymentId));
    const [runtimeHead] = await db()
      .select({ profileVersionId: llmInferenceProfileHeads.profileVersionId })
      .from(llmInferenceProfileHeads)
      .where(eq(llmInferenceProfileHeads.deploymentId, deploymentId));
    expect(candidateHead?.profileVersionId).toBe(created.profileVersionId);
    expect(runtimeHead?.profileVersionId).toBe(activeVersion.id);

    const runId = randomUUID();
    const startedAt = new Date();
    await db()
      .insert(llmInferenceProbeRuns)
      .values({
        runId,
        profileVersionId: created.profileVersionId,
        deploymentId,
        deploymentRevision: profile.deployment.revision,
        providerRecordId: 7,
        modelMappingId: 19,
        actorUserId: 1,
        probeKind: "connectivity",
        probeSuiteRevision: "connectivity:1",
        status: "passed",
        resultJson: {
          checks: { basicRequestResponse: true },
          responseLatencyMs: 250,
          evidenceRef: `sha256:${"c".repeat(64)}`,
        },
        startedAt,
        finishedAt: new Date(startedAt.getTime() + 250),
      });
    const [stored] = await db()
      .select({
        status: llmInferenceProbeRuns.status,
        resultJson: llmInferenceProbeRuns.resultJson,
      })
      .from(llmInferenceProbeRuns)
      .where(eq(llmInferenceProbeRuns.runId, runId));
    expect(stored).toMatchObject({
      status: "passed",
      resultJson: { checks: { basicRequestResponse: true } },
    });
    const capabilityRunId = randomUUID();
    await db()
      .insert(llmInferenceProbeRuns)
      .values({
        runId: capabilityRunId,
        profileVersionId: created.profileVersionId,
        deploymentId,
        deploymentRevision: profile.deployment.revision,
        providerRecordId: 7,
        modelMappingId: 19,
        actorUserId: 1,
        probeKind: "capability_suite",
        probeSuiteRevision: "capability:1",
        status: "incomplete",
        resultJson: {
          qualificationStatus: "incomplete",
          checks: { basicRequestResponse: true, regionRetention: false },
        },
        startedAt,
        finishedAt: new Date(startedAt.getTime() + 1_000),
      });
    const [storedCapabilityRun] = await db()
      .select({
        probeKind: llmInferenceProbeRuns.probeKind,
        resultJson: llmInferenceProbeRuns.resultJson,
      })
      .from(llmInferenceProbeRuns)
      .where(eq(llmInferenceProbeRuns.runId, capabilityRunId));
    expect(storedCapabilityRun).toMatchObject({
      probeKind: "capability_suite",
      resultJson: {
        qualificationStatus: "incomplete",
        checks: { regionRetention: false },
      },
    });
    await expect(
      db()
        .update(llmInferenceProbeRuns)
        .set({ status: "failed" })
        .where(eq(llmInferenceProbeRuns.runId, runId))
    ).rejects.toThrow();
  });

  it("fences a real inline attempt through prepared, submitting and terminal states", async () => {
    const plan = makePlan();
    planIds.push(plan.planId);
    await persistInferencePlan({
      tenantId: "tenant-1",
      principalRef: "principal-db-test",
      idempotencyKey: `idem:${plan.logicalCallId}`,
      scoreCalibrationRevision: "scores:test",
      plan,
    });

    const ownerToken = randomUUID();
    const attemptId = `attempt:${randomUUID()}`;
    const created = await createInferenceAttempt({
      planId: plan.planId,
      attemptId,
      attemptOrdinal: 1,
      attemptOwnershipEpoch: 1,
      ownerToken,
      candidate,
    });
    expect(created).toEqual({ created: true, status: "prepared", attemptId });
    await expect(
      loadInferenceAttemptStatus({
        attemptId,
        tenantId: "tenant-1",
        principalRef: "principal-db-test",
      })
    ).resolves.toEqual({
      found: true,
      attemptId,
      status: "in_progress",
      attemptStatus: "prepared",
    });
    await expect(
      loadInferenceAttemptStatus({
        attemptId,
        tenantId: "tenant-2",
        principalRef: "principal-db-test",
      })
    ).resolves.toEqual({ found: false });
    await expect(
      loadInferenceAttemptStatus({
        attemptId,
        tenantId: "tenant-1",
        principalRef: "different-principal",
      })
    ).resolves.toEqual({ found: false });
    expect(
      await markInferenceAttemptSubmitting({
        attemptId,
        attemptOwnershipEpoch: 1,
        ownerToken,
      })
    ).toBe(true);

    const receipt: InferenceAttemptReceipt = {
      planId: plan.planId,
      attemptId,
      attemptOrdinal: 1,
      actualModel: "native:test",
      providerId: candidate.providerId,
      credentialOwnerRef: candidate.credentialOwnerRef,
      deploymentId: candidate.deploymentId,
      outcome: "completed",
      submissionState: "submitted",
      streamCommitted: false,
      observedExecution: {
        model: "native:test",
        providerId: candidate.providerId,
        credentialOwnerRef: candidate.credentialOwnerRef,
        deploymentId: candidate.deploymentId,
        endpointSurface: candidate.endpointSurface,
      },
      usage: { input: 2, output: 3 },
      chargedCostMicros: 10,
    };
    expect(
      await completeInferenceAttempt({
        receipt,
        attemptOwnershipEpoch: 1,
        ownerToken,
      })
    ).toBe(true);

    const [stored] = await db()
      .select({
        status: llmInferenceAttempts.status,
        outcome: llmInferenceAttempts.outcome,
      })
      .from(llmInferenceAttempts)
      .where(
        and(
          eq(llmInferenceAttempts.attemptId, attemptId),
          eq(llmInferenceAttempts.planId, plan.planId)
        )
      );
    expect(stored).toEqual({ status: "terminal", outcome: "completed" });
    await expect(
      loadInferenceAttemptStatus({
        attemptId,
        tenantId: "tenant-1",
        principalRef: "principal-db-test",
      })
    ).resolves.toMatchObject({
      found: true,
      status: "terminal",
      outcome: "completed",
      submissionState: "submitted",
      chargedCostMicros: 10,
      resultAvailable: false,
    });
    await expect(
      listPendingInferenceSettlementAttempts()
    ).resolves.toContainEqual({
      attemptId,
      tenantId: "tenant-1",
    });
    await expect(
      loadInferenceSettlementRecord(attemptId, "tenant-2")
    ).resolves.toBeNull();
    await expect(
      loadInferenceSettlementRecord(attemptId, "tenant-1")
    ).resolves.toMatchObject({
      receipt: { attemptId },
    });
    expect(
      await markInferenceAttemptSubmitting({
        attemptId,
        attemptOwnershipEpoch: 1,
        ownerToken: "wrong-owner",
      })
    ).toBe(false);
  });

  it("executes a pinned plan through the PostgreSQL attempt store with a controlled provider", async () => {
    const now = Date.now();
    const intent = inferenceIntentV2Schema.parse({
      contract: "SAH-INFERENCE-2",
      requestId: `request:${randomUUID()}`,
      traceId: `trace:${randomUUID()}`,
      tenantId: "tenant-1",
      principalId: "principal-db-test",
      consumer: "chat",
      taskClass: "answer",
      purpose: "respond",
      inputModalities: ["text"],
      outputModalities: ["text"],
      inputTokenEstimate: 100,
      outputTokenReserve: 200,
      requiredFeatures: [],
      languageHints: ["en"],
      privacyClass: "tenant-confidential",
      residencyAllowlist: ["TH"],
      zdrRequired: true,
      qualityClass: "standard",
      risk: "low",
      latencyDeadlineMs: 60_000,
      maxEstimatedCostMicros: 1_000,
      selection: { mode: "AUTO" },
      policyRevision: "policy:db-test",
      budgetScopeRef: "tenant:tenant-1",
      idempotencyKey: `idem:${randomUUID()}`,
    });
    const planId = `plan:${randomUUID()}`;
    const deadlineAt = new Date(now + 60_000).toISOString();
    const plan: InferencePlanR4 = {
      planId,
      intentHash: hashInferenceIntent(intent),
      policyRevision: intent.policyRevision,
      registryRevision: "registry:db-test",
      selectedModelProfile: "model:db-test",
      selectedDeploymentProfile: "deployment:db-test",
      endpointSurface: "responses_compatible",
      attemptBudget: 1,
      deadlineAt,
      fallbackCandidates: [],
      fallbackPermission: "none",
      cachePolicyId: "cache:no-store",
      creditReservationId: `reservation:${randomUUID()}`,
      estimatedCostMicros: 100,
      routePolicyRevision: "router:db-test",
      specUid: "urn:smartaihub:spec:llm-routing-inference",
      specRevision: "R4",
      rolloutBundleHash: `sha256:${"b".repeat(64)}`,
      logicalCallId: `call:${randomUUID()}`,
      attemptOwnershipEpoch: 1,
      parentCostCeilingMicros: 200,
      overallDeadlineAt: deadlineAt,
      residencyPolicySnapshotRef: "residency:db-test",
      routerFeatureProvenanceRef: "router:db-test",
    };
    planIds.push(plan.planId);
    await persistInferencePlan({
      tenantId: intent.tenantId,
      principalRef: intent.principalId,
      idempotencyKey: intent.idempotencyKey,
      scoreCalibrationRevision: "scores:db-test",
      plan,
    });

    const route: RouteCandidate = {
      modelProfileId: plan.selectedModelProfile,
      providerModelId: "native:db-test",
      deploymentId: plan.selectedDeploymentProfile,
      providerId: "provider:db-test",
      credentialOwnerRef: "credential-owner:db-test",
      endpointSurface: plan.endpointSurface,
      executionSurface: "cloud",
      qualification: "qualified",
      health: "healthy",
      credentialStatus: "active",
      region: "TH",
      supportsZeroDataRetention: true,
      allowedPrivacyClasses: [intent.privacyClass],
      inputModalities: ["text"],
      outputModalities: ["text"],
      features: [],
      toolContractRefs: [],
      maxContextTokens: 10_000,
      maxOutputTokens: 1_000,
      priceValidUntilMs: now + 60_000,
      estimatedCostMicros: 100,
      latencyP95Ms: 100,
      qualityScorePpm: 900_000,
      reliabilityScorePpm: 900_000,
      compatibilityScorePpm: 900_000,
      scoreCalibrationRevision: "scores:db-test",
    };
    const authority: InferenceAuthoritySnapshot = {
      tenantId: intent.tenantId,
      principalId: intent.principalId,
      policyRevision: intent.policyRevision,
      platformPolicyReady: true,
      tenantPolicyReady: true,
      emergencyRevocationFresh: true,
      budgetAuthorityReady: true,
      platformAllowedProviderIds: [route.providerId],
      tenantAllowedProviderIds: [route.providerId],
      principalAllowedProviderIds: [route.providerId],
      allowedCredentialOwnerRefs: [route.credentialOwnerRef],
      allowedRegions: ["TH"],
      requireZeroDataRetention: true,
      availableBudgetMicros: 1_000,
      revokedModelProfileIds: [],
      revokedDeploymentIds: [],
      observedAtMs: now,
      registryRevision: plan.registryRevision,
      routerPolicyRevision: plan.routePolicyRevision,
      scoreCalibrationRevision: "scores:db-test",
      routingWeights: {
        qualityPpm: 800_000,
        costPpm: 50_000,
        latencyPpm: 50_000,
        reliabilityPpm: 50_000,
        compatibilityPpm: 50_000,
      },
    };
    const result = await executeInferencePlan({
      plan,
      intent,
      attemptOwnershipEpoch: 1,
      ownerToken: randomUUID(),
      resolveCandidate: async deploymentId =>
        deploymentId === route.deploymentId
          ? { candidate: route, authority }
          : null,
      loadReservationAuthority: async () => ({
        reservationId: plan.creditReservationId,
        tenantId: intent.tenantId,
        principalRef: intent.principalId,
        availableBudgetMicros: plan.parentCostCeilingMicros,
        expiresAt: deadlineAt,
        status: "reserved",
      }),
      providerIdempotencyCertified: () => false,
      executeAttempt: async () => ({
        observation: {
          outcome: "completed",
          submissionState: "submitted",
          streamCommitted: false,
          observedExecution: {
            model: "native:db-test",
            providerId: route.providerId,
            credentialOwnerRef: route.credentialOwnerRef,
            deploymentId: route.deploymentId,
            endpointSurface: route.endpointSurface,
          },
          usage: { input: 2, output: 3 },
          chargedCostMicros: 10,
        },
        response: { text: "controlled provider result" },
      }),
      settleCompletedAttempt: async () => true,
      now: () => now,
    });

    expect(result).toMatchObject({
      status: "completed",
      response: { text: "controlled provider result" },
    });
    if (result.status !== "completed") return;
    const [stored] = await db()
      .select({
        status: llmInferenceAttempts.status,
        outcome: llmInferenceAttempts.outcome,
      })
      .from(llmInferenceAttempts)
      .where(eq(llmInferenceAttempts.attemptId, result.receipt.attemptId));
    expect(stored).toEqual({ status: "terminal", outcome: "completed" });

    const settleCompletedAttempt = vi.fn(async () => true);
    await expect(
      reconcileInferenceAttemptSettlement({
        attemptId: result.receipt.attemptId,
        settleCompletedAttempt,
      })
    ).resolves.toEqual({
      status: "settled",
      attemptId: result.receipt.attemptId,
    });
    expect(settleCompletedAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: plan.creditReservationId,
        settlementKey: result.receipt.attemptId,
        chargedCostMicros: 10,
      })
    );
  }, 30_000);

  it("records settlement recovery through canonical job events without duplicating retries", async () => {
    const plan = makePlan();
    planIds.push(plan.planId);
    const reservationId = `reservation:${randomUUID()}`;
    plan.creditReservationId = reservationId;
    const reservationIdempotencyKey = `spec231:job-settlement:${randomUUID()}`;
    const [creditDebit] = await db()
      .insert(creditTransactions)
      .values({
        userId: 1,
        amount: -1,
        type: "usage",
        description: "Spec 231 job settlement fixture",
        metadata: { reservationId, spec231InferenceReservation: true },
        balanceAfter: 99,
        idempotencyKey: reservationIdempotencyKey,
        sourceType: "chat",
        tenantId: "tenant-1",
      })
      .returning({ id: creditTransactions.id });
    creditTransactionIds.push(creditDebit.id);
    const createdReservation = await createDurableInferenceCreditReservation(
      {
        userId: 1,
        tenantId: "tenant-1",
        principalRef: "principal-db-test",
        amount: 1,
        idempotencyKey: reservationIdempotencyKey,
      },
      {
        create: async () => ({
          reservationId,
          userId: 1,
          reservedAmount: 1,
          drawnAmount: 0,
          transactionId: creditDebit.id,
          sourceType: "chat",
          idempotencyKey: reservationIdempotencyKey,
          tenantId: "tenant-1",
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        }),
      }
    );
    expect(createdReservation.ok).toBe(true);
    if (!createdReservation.ok) return;
    durableReservationIds.push(reservationId);
    const workerJobId = randomUUID();
    const workerJobAttemptId = randomUUID();
    workerJobIds.push(workerJobId);
    workerJobAttemptIds.push(workerJobAttemptId);
    const ownerToken = randomUUID();
    const ownerHash = createHash("sha256").update(ownerToken).digest("hex");
    const leaseExpiresAt = new Date(Date.now() + 60_000).toISOString();
    await db().execute(sql`
      INSERT INTO "worker_jobs"("id", "tenantId", "attempt", "fencingVersion", "leaseOwnerToken", "leaseExpiresAt")
      VALUES (${workerJobId}, 'tenant-1', 1, 1, ${ownerHash}, ${leaseExpiresAt})
    `);
    await db().execute(sql`
      INSERT INTO "worker_job_attempts"("id", "workerJobId", "attempt", "leaseGeneration", "leaseTokenHash", "leaseExpiresAt")
      VALUES (${workerJobAttemptId}, ${workerJobId}, 1, 1, ${ownerHash}, ${leaseExpiresAt})
    `);
    await persistInferencePlan({
      tenantId: "tenant-1",
      principalRef: "principal-db-test",
      idempotencyKey: `idem:${plan.logicalCallId}`,
      workerJobId,
      scoreCalibrationRevision: "scores:test",
      plan,
    });
    const attemptId = `attempt:${randomUUID()}`;
    await createInferenceAttempt({
      planId: plan.planId,
      attemptId,
      attemptOrdinal: 1,
      attemptOwnershipEpoch: 1,
      ownerToken,
      workerJobAttemptId,
      candidate,
    });
    await markInferenceAttemptSubmitting({
      attemptId,
      attemptOwnershipEpoch: 1,
      ownerToken,
    });
    const receipt: InferenceAttemptReceipt = {
      planId: plan.planId,
      attemptId,
      attemptOrdinal: 1,
      actualModel: "native:test",
      providerId: candidate.providerId,
      credentialOwnerRef: candidate.credentialOwnerRef,
      deploymentId: candidate.deploymentId,
      outcome: "completed",
      submissionState: "submitted",
      streamCommitted: false,
      chargedCostMicros: 25,
      observedExecution: {
        model: "native:test",
        providerId: candidate.providerId,
        credentialOwnerRef: candidate.credentialOwnerRef,
        deploymentId: candidate.deploymentId,
        endpointSurface: candidate.endpointSurface,
      },
    };
    expect(
      await completeInferenceAttempt({
        receipt,
        attemptOwnershipEpoch: 1,
        ownerToken,
      })
    ).toBe(true);
    expect(
      await settleDurableInferenceCreditReservation({
        reservationId,
        settlementKey: attemptId,
        chargedCostMicros: 25,
      })
    ).toBe(true);
    await expect(
      listPendingInferenceSettlementAttempts()
    ).resolves.toContainEqual({
      attemptId,
      tenantId: "tenant-1",
    });
    await recordInferenceSettlementOutcome({
      planId: plan.planId,
      attemptId,
      status: "pending",
      reason: "OWNER_REJECTED",
    });
    await recordInferenceSettlementOutcome({
      planId: plan.planId,
      attemptId,
      status: "pending",
      reason: "OWNER_REJECTED",
    });
    await recordInferenceSettlementOutcome({
      planId: plan.planId,
      attemptId,
      status: "settled",
      chargedCostMicros: 25,
    });

    const eventRows = await db()
      .select({
        eventType: workerJobEvents.eventType,
        eventSequence: workerJobEvents.eventSequence,
      })
      .from(workerJobEvents)
      .where(eq(workerJobEvents.workerJobId, workerJobId))
      .orderBy(workerJobEvents.eventSequence);
    expect(eventRows).toEqual([
      { eventType: "INFERENCE_PLAN_PERSISTED", eventSequence: 1 },
      { eventType: "INFERENCE_ATTEMPT_PREPARED", eventSequence: 2 },
      { eventType: "INFERENCE_ATTEMPT_SUBMITTING", eventSequence: 3 },
      { eventType: "INFERENCE_ATTEMPT_TERMINAL", eventSequence: 4 },
      { eventType: "INFERENCE_SETTLEMENT_PENDING", eventSequence: 5 },
      { eventType: "INFERENCE_SETTLEMENT_CONFIRMED", eventSequence: 6 },
    ]);
    await expect(
      listPendingInferenceSettlementAttempts()
    ).resolves.not.toContainEqual({
      attemptId,
      tenantId: "tenant-1",
    });
  });

  it("rejects an old worker lease after a newer fencing generation takes ownership", async () => {
    const plan = makePlan();
    planIds.push(plan.planId);
    const workerJobId = randomUUID();
    const workerJobAttemptId = randomUUID();
    workerJobIds.push(workerJobId);
    workerJobAttemptIds.push(workerJobAttemptId);
    const oldOwnerToken = randomUUID();
    const newOwnerToken = randomUUID();
    const oldOwnerHash = createHash("sha256")
      .update(oldOwnerToken)
      .digest("hex");
    const newOwnerHash = createHash("sha256")
      .update(newOwnerToken)
      .digest("hex");
    const leaseExpiresAt = new Date(Date.now() + 60_000).toISOString();

    await db().execute(sql`
      INSERT INTO "worker_jobs"("id", "tenantId", "attempt", "fencingVersion", "leaseOwnerToken", "leaseExpiresAt")
      VALUES (${workerJobId}, 'tenant-1', 1, 1, ${oldOwnerHash}, ${leaseExpiresAt})
    `);
    await db().execute(sql`
      INSERT INTO "worker_job_attempts"("id", "workerJobId", "attempt", "leaseGeneration", "leaseTokenHash", "leaseExpiresAt")
      VALUES (${workerJobAttemptId}, ${workerJobId}, 1, 1, ${oldOwnerHash}, ${leaseExpiresAt})
    `);
    const persistedPlanInput = {
      tenantId: "tenant-1",
      principalRef: "principal-db-test",
      idempotencyKey: `idem:${plan.logicalCallId}`,
      workerJobId,
      scoreCalibrationRevision: "scores:test",
      plan,
    };
    await persistInferencePlan(persistedPlanInput);
    await persistInferencePlan(persistedPlanInput);

    const attemptId = `attempt:${randomUUID()}`;
    expect(
      await createInferenceAttempt({
        planId: plan.planId,
        attemptId,
        attemptOrdinal: 1,
        attemptOwnershipEpoch: 1,
        ownerToken: oldOwnerToken,
        workerJobAttemptId,
        candidate,
      })
    ).toMatchObject({ created: true, status: "prepared" });
    expect(
      await markInferenceAttemptSubmitting({
        attemptId,
        attemptOwnershipEpoch: 1,
        ownerToken: oldOwnerToken,
      })
    ).toBe(true);

    const oldReceipt: InferenceAttemptReceipt = {
      planId: plan.planId,
      attemptId,
      attemptOrdinal: 1,
      actualModel: "native:test",
      providerId: candidate.providerId,
      credentialOwnerRef: candidate.credentialOwnerRef,
      deploymentId: candidate.deploymentId,
      outcome: "completed",
      submissionState: "submitted",
      streamCommitted: false,
      observedExecution: {
        model: "native:test",
        providerId: candidate.providerId,
        credentialOwnerRef: candidate.credentialOwnerRef,
        deploymentId: candidate.deploymentId,
        endpointSurface: candidate.endpointSurface,
      },
    };
    await db().execute(sql`
      UPDATE "worker_jobs"
      SET "fencingVersion" = 2, "leaseOwnerToken" = ${newOwnerHash}, "leaseExpiresAt" = ${leaseExpiresAt}
      WHERE "id" = ${workerJobId}
    `);
    await db().execute(sql`
      UPDATE "worker_job_attempts"
      SET "leaseGeneration" = 2, "leaseTokenHash" = ${newOwnerHash}, "leaseExpiresAt" = ${leaseExpiresAt}
      WHERE "id" = ${workerJobAttemptId}
    `);
    const helperPath = resolve(
      process.cwd(),
      "scripts/spec231-complete-attempt-process.ts"
    );
    const subprocess = await execFileAsync(
      process.execPath,
      ["--import", "tsx", helperPath],
      {
        env: {
          ...process.env,
          SPEC231_COMPLETE_ATTEMPT_INPUT: JSON.stringify({
            receipt: oldReceipt,
            attemptOwnershipEpoch: 1,
            ownerToken: oldOwnerToken,
          }),
        },
        timeout: 30_000,
      }
    );
    expect(subprocess.stdout.trim().split(/\r?\n/).at(-1)).toBe("false");

    const eventRows = await db()
      .select({
        eventType: workerJobEvents.eventType,
        eventSequence: workerJobEvents.eventSequence,
      })
      .from(workerJobEvents)
      .where(eq(workerJobEvents.workerJobId, workerJobId))
      .orderBy(workerJobEvents.eventSequence);
    expect(eventRows).toEqual([
      { eventType: "INFERENCE_PLAN_PERSISTED", eventSequence: 1 },
      { eventType: "INFERENCE_ATTEMPT_PREPARED", eventSequence: 2 },
      { eventType: "INFERENCE_ATTEMPT_SUBMITTING", eventSequence: 3 },
    ]);

    const [stored] = await db()
      .select({
        status: llmInferenceAttempts.status,
        outcome: llmInferenceAttempts.outcome,
      })
      .from(llmInferenceAttempts)
      .where(eq(llmInferenceAttempts.attemptId, attemptId));
    expect(stored).toEqual({ status: "submitting", outcome: null });
  });
});
