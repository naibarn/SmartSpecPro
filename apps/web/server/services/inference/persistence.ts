import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../db";
import {
  llmInferenceAttempts,
  llmInferencePlans,
  workerJobs,
  type LlmInferencePlan,
} from "../../../drizzle/schema";
import { appendJobEvent } from "../jobControlPlane";
import {
  inferenceAttemptReceiptSchema,
  inferencePlanR4Schema,
  type InferenceAttemptReceipt,
  type InferencePlanR4,
} from "./contracts";
import type { RouteCandidate } from "./policyResolver";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function hash(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function requiredHash(value: string, name: string): string {
  if (!/^sha256:[a-f0-9]{64}$/i.test(value))
    throw new Error(`${name} must be a SHA-256 reference`);
  return value.toLowerCase();
}

function eventDedupeKey(kind: string, id: string): string {
  return `spec231:${kind}:${hash(id).slice(7)}`;
}

async function appendInferenceJobEvent(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  input: {
    workerJobId: string | null;
    workerJobAttemptId?: string;
    kind: string;
    dedupeId: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  if (!input.workerJobId) return;
  await appendJobEvent(tx, {
    workerJobId: input.workerJobId,
    eventType: input.kind,
    attemptId: input.workerJobAttemptId,
    eventIdempotencyKey: eventDedupeKey(input.kind, input.dedupeId),
    payloadJson: input.payload,
  });
}

async function loadPlanWorkerJobId(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  planId: string,
): Promise<string | null> {
  const [plan] = await tx
    .select({ workerJobId: llmInferencePlans.workerJobId })
    .from(llmInferencePlans)
    .where(eq(llmInferencePlans.planId, planId))
    .limit(1);
  return plan?.workerJobId ?? null;
}

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

/** Check the canonical Feature 186 lease while holding its rows until this transaction commits. */
async function hasCurrentOwnerFence(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  input: {
    attemptId: string;
    attemptOwnershipEpoch: number;
    ownerTokenHash: string;
  }
): Promise<boolean> {
  const linked = await tx.execute(sql`
    SELECT a."workerJobAttemptId", p."workerJobId", p."tenantId"
    FROM "llm_inference_attempts" a
    JOIN "llm_inference_plans" p ON p."planId" = a."planId"
    WHERE a."attemptId" = ${input.attemptId}
      AND a."attemptOwnershipEpoch" = ${input.attemptOwnershipEpoch}
      AND a."ownerTokenHash" = ${input.ownerTokenHash}
  `);
  const row = resultRows<{
    workerJobAttemptId: string | null;
    workerJobId: string | null;
    tenantId: string;
  }>(linked)[0];
  if (!row) return false;
  if (row.workerJobAttemptId === null && row.workerJobId === null) {
    const inlineOwner = await tx.execute(sql`
      SELECT 1 FROM "llm_inference_attempts"
      WHERE "attemptId" = ${input.attemptId}
        AND "attemptOwnershipEpoch" = ${input.attemptOwnershipEpoch}
        AND "ownerTokenHash" = ${input.ownerTokenHash}
      FOR UPDATE
    `);
    return resultRows(inlineOwner).length === 1;
  }
  if (!row.workerJobAttemptId || !row.workerJobId) return false;

  const current = await tx.execute(sql`
    SELECT 1
    FROM "worker_jobs" j
    JOIN "worker_job_attempts" ja
      ON ja."workerJobId" = j."id"
      AND ja."id" = ${row.workerJobAttemptId}
    WHERE j."id" = ${row.workerJobId}
      AND j."tenantId" = ${row.tenantId}
      AND ja."attempt" = j."attempt"
      AND ja."leaseGeneration" = ${input.attemptOwnershipEpoch}
      AND j."fencingVersion" = ${input.attemptOwnershipEpoch}
      AND j."leaseOwnerToken" = ${input.ownerTokenHash}
      AND ja."leaseTokenHash" = ${input.ownerTokenHash}
      AND j."leaseExpiresAt" > clock_timestamp()
      AND ja."leaseExpiresAt" > clock_timestamp()
    FOR UPDATE OF j, ja
  `);
  if (resultRows(current).length !== 1) return false;
  const owner = await tx.execute(sql`
    SELECT 1 FROM "llm_inference_attempts"
    WHERE "attemptId" = ${input.attemptId}
      AND "workerJobAttemptId" = ${row.workerJobAttemptId}
      AND "attemptOwnershipEpoch" = ${input.attemptOwnershipEpoch}
      AND "ownerTokenHash" = ${input.ownerTokenHash}
    FOR UPDATE
  `);
  return resultRows(owner).length === 1;
}

export type PersistInferencePlanInput = {
  tenantId: string;
  principalRef: string;
  idempotencyKey: string;
  workerJobId?: string;
  scoreCalibrationRevision: string;
  plan: InferencePlanR4;
};

/** Hash all immutable identity/ownership bindings, not just the serialized route plan. */
export function inferencePlanPersistenceFingerprint(
  input: PersistInferencePlanInput
): string {
  return hash(
    canonicalJson({
      plan: input.plan,
      tenantId: input.tenantId,
      principalRef: input.principalRef,
      idempotencyKey: input.idempotencyKey,
      workerJobId: input.workerJobId ?? null,
      scoreCalibrationRevision: input.scoreCalibrationRevision,
    })
  );
}

/** Persists the immutable routing decision; it does not create jobs or reserve credits. */
export async function persistInferencePlan(
  input: PersistInferencePlanInput
): Promise<{
  plan: LlmInferencePlan;
  created: boolean;
}> {
  const { plan } = input;
  const parsedPlan = inferencePlanR4Schema.safeParse(plan);
  if (!parsedPlan.success) throw new Error("Invalid immutable inference plan");
  const safePlan = parsedPlan.data;
  if (
    !input.tenantId.trim() ||
    !input.principalRef.trim() ||
    !input.idempotencyKey.trim() ||
    !input.scoreCalibrationRevision.trim()
  )
    throw new Error("Trusted plan scope and revisions are required");
  const planHash = inferencePlanPersistenceFingerprint({
    ...input,
    plan: safePlan,
  });
  const intentHash = requiredHash(safePlan.intentHash, "intentHash");
  const db = getDb();
  return db.transaction(async tx => {
    if (input.workerJobId) {
      const [job] = await tx
        .select({ id: workerJobs.id })
        .from(workerJobs)
        .where(
          and(
            eq(workerJobs.id, input.workerJobId),
            eq(workerJobs.tenantId, input.tenantId)
          )
        )
        .limit(1);
      if (!job)
        throw new Error(
          "Inference plan job is missing or belongs to another tenant"
        );
    }
    const inserted = await tx
      .insert(llmInferencePlans)
      .values({
        planId: safePlan.planId,
        tenantId: input.tenantId,
        principalRef: input.principalRef,
        logicalCallId: safePlan.logicalCallId,
        idempotencyKey: input.idempotencyKey,
        intentHash,
        planHash,
        planJson: safePlan as unknown as Record<string, unknown>,
        workerJobId: input.workerJobId,
        creditReservationId: safePlan.creditReservationId,
        selectedModelProfile: safePlan.selectedModelProfile,
        selectedDeploymentProfile: safePlan.selectedDeploymentProfile,
        endpointSurface: safePlan.endpointSurface,
        policyRevision: safePlan.policyRevision,
        registryRevision: safePlan.registryRevision,
        routePolicyRevision: safePlan.routePolicyRevision,
        scoreCalibrationRevision: input.scoreCalibrationRevision,
        estimatedCostMicros: safePlan.estimatedCostMicros,
        parentCostCeilingMicros: safePlan.parentCostCeilingMicros,
        attemptBudget: safePlan.attemptBudget,
        deadlineAt: new Date(safePlan.deadlineAt),
        overallDeadlineAt: new Date(safePlan.overallDeadlineAt),
        residencyPolicySnapshotRef: safePlan.residencyPolicySnapshotRef,
        routerFeatureProvenanceRef: safePlan.routerFeatureProvenanceRef,
      })
      .onConflictDoNothing()
      .returning();

    const existing =
      inserted[0] ??
      (
        await tx
          .select()
          .from(llmInferencePlans)
          .where(
            and(
              eq(llmInferencePlans.tenantId, input.tenantId),
              eq(llmInferencePlans.logicalCallId, safePlan.logicalCallId)
            )
          )
          .limit(1)
      )[0];
    if (!existing)
      throw new Error(
        "Inference plan idempotency key conflicts with another logical call"
      );
    const exactMatch =
      existing.planId === safePlan.planId &&
      existing.idempotencyKey === input.idempotencyKey &&
      existing.intentHash === intentHash &&
      existing.planHash === planHash &&
      existing.principalRef === input.principalRef &&
      existing.workerJobId === (input.workerJobId ?? null) &&
      existing.scoreCalibrationRevision === input.scoreCalibrationRevision;
    if (!exactMatch)
      throw new Error(
        "Inference plan idempotency conflict: immutable plan differs"
      );
    await appendInferenceJobEvent(tx, {
      workerJobId: existing.workerJobId,
      kind: "INFERENCE_PLAN_PERSISTED",
      dedupeId: safePlan.planId,
      payload: {
        inferencePlanId: safePlan.planId,
        selectedDeploymentId: safePlan.selectedDeploymentProfile,
        policyRevision: safePlan.policyRevision,
        registryRevision: safePlan.registryRevision,
      },
    });
    return { plan: existing, created: inserted.length === 1 };
  });
}

export type CreateInferenceAttemptInput = {
  planId: string;
  attemptId: string;
  attemptOrdinal: number;
  attemptOwnershipEpoch: number;
  ownerToken: string;
  candidate: RouteCandidate;
  workerJobAttemptId?: string;
};

/** Creates attempt evidence before provider submission; only a digest of ownerToken is stored. */
export async function createInferenceAttempt(
  input: CreateInferenceAttemptInput
): Promise<{ created: boolean; status: string; attemptId: string }> {
  if (
    !input.ownerToken ||
    !Number.isInteger(input.attemptOwnershipEpoch) ||
    input.attemptOwnershipEpoch < 1 ||
    !Number.isInteger(input.attemptOrdinal) ||
    input.attemptOrdinal < 1 ||
    input.attemptOrdinal > 16
  ) {
    throw new Error("Invalid inference attempt ownership or ordinal");
  }
  const db = getDb();
  const ownerHash = createHash("sha256").update(input.ownerToken).digest("hex");
  return db.transaction(async tx => {
    const [plan] = await tx
      .select()
      .from(llmInferencePlans)
      .where(eq(llmInferencePlans.planId, input.planId))
      .limit(1);
    if (!plan) throw new Error("Inference plan does not exist");
    if (
      (plan.workerJobId && !input.workerJobAttemptId) ||
      (!plan.workerJobId && input.workerJobAttemptId)
    ) {
      throw new Error("Canonical worker job and attempt linkage is incomplete");
    }
    const inserted = await tx
      .insert(llmInferenceAttempts)
      .values({
        attemptId: input.attemptId,
        planId: input.planId,
        workerJobAttemptId: input.workerJobAttemptId,
        attemptOrdinal: input.attemptOrdinal,
        attemptOwnershipEpoch: input.attemptOwnershipEpoch,
        ownerTokenHash: ownerHash,
        modelProfileId: input.candidate.modelProfileId,
        deploymentId: input.candidate.deploymentId,
        providerId: input.candidate.providerId,
        credentialOwnerRef: input.candidate.credentialOwnerRef,
        endpointSurface: input.candidate.endpointSurface,
      })
      .onConflictDoNothing()
      .returning({ attemptId: llmInferenceAttempts.attemptId });
    if (inserted.length === 0) {
      const [existingOrdinal] = await tx
        .select()
        .from(llmInferenceAttempts)
        .where(
          and(
            eq(llmInferenceAttempts.planId, input.planId),
            eq(llmInferenceAttempts.attemptOrdinal, input.attemptOrdinal),
          ),
        )
        .limit(1);
      if (
        !existingOrdinal ||
        existingOrdinal.workerJobAttemptId !== (input.workerJobAttemptId ?? null) ||
        existingOrdinal.modelProfileId !== input.candidate.modelProfileId ||
        existingOrdinal.deploymentId !== input.candidate.deploymentId ||
        existingOrdinal.providerId !== input.candidate.providerId ||
        existingOrdinal.credentialOwnerRef !== input.candidate.credentialOwnerRef ||
        existingOrdinal.endpointSurface !== input.candidate.endpointSurface
      ) {
        throw new Error("Inference attempt idempotency conflict");
      }
      return {
        created: false,
        status: existingOrdinal.status,
        attemptId: existingOrdinal.attemptId,
      };
    }
    const [existing] = await tx
      .select()
      .from(llmInferenceAttempts)
      .where(eq(llmInferenceAttempts.attemptId, input.attemptId))
      .limit(1);
    if (
      !existing ||
      existing.planId !== input.planId ||
      existing.workerJobAttemptId !== (input.workerJobAttemptId ?? null) ||
      existing.attemptOrdinal !== input.attemptOrdinal ||
      existing.attemptOwnershipEpoch !== input.attemptOwnershipEpoch ||
      existing.ownerTokenHash !== ownerHash ||
      existing.modelProfileId !== input.candidate.modelProfileId ||
      existing.deploymentId !== input.candidate.deploymentId ||
      existing.providerId !== input.candidate.providerId ||
      existing.credentialOwnerRef !== input.candidate.credentialOwnerRef ||
      existing.endpointSurface !== input.candidate.endpointSurface
    ) {
      throw new Error("Inference attempt idempotency conflict");
    }
    if (
      !(await hasCurrentOwnerFence(tx, {
        attemptId: input.attemptId,
        attemptOwnershipEpoch: input.attemptOwnershipEpoch,
        ownerTokenHash: ownerHash,
      }))
    )
      throw new Error("Canonical worker lease is no longer current");
    await appendInferenceJobEvent(tx, {
      workerJobId: plan.workerJobId,
      workerJobAttemptId: input.workerJobAttemptId,
      kind: "INFERENCE_ATTEMPT_PREPARED",
      dedupeId: input.attemptId,
      payload: {
        inferencePlanId: input.planId,
        inferenceAttemptId: input.attemptId,
        attemptOrdinal: input.attemptOrdinal,
        deploymentId: input.candidate.deploymentId,
        providerId: input.candidate.providerId,
        endpointSurface: input.candidate.endpointSurface,
      },
    });
    return {
      created: true,
      status: existing.status,
      attemptId: existing.attemptId,
    };
  });
}

/** Fences submission before network I/O; an unknown submission must never be replayed automatically. */
export async function markInferenceAttemptSubmitting(input: {
  attemptId: string;
  attemptOwnershipEpoch: number;
  ownerToken: string;
}): Promise<boolean> {
  const db = getDb();
  const ownerTokenHash = createHash("sha256")
    .update(input.ownerToken)
    .digest("hex");
  return db.transaction(async tx => {
    if (
      !(await hasCurrentOwnerFence(tx, {
        attemptId: input.attemptId,
        attemptOwnershipEpoch: input.attemptOwnershipEpoch,
        ownerTokenHash,
      }))
    )
      return false;
    const [attemptLink] = await tx
      .select({
        planId: llmInferenceAttempts.planId,
        workerJobAttemptId: llmInferenceAttempts.workerJobAttemptId,
      })
      .from(llmInferenceAttempts)
      .where(eq(llmInferenceAttempts.attemptId, input.attemptId))
      .limit(1);
    if (!attemptLink) return false;
    const updated = await tx
      .update(llmInferenceAttempts)
      .set({
        status: "submitting",
        submissionState: "unknown",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(llmInferenceAttempts.attemptId, input.attemptId),
          eq(
            llmInferenceAttempts.attemptOwnershipEpoch,
            input.attemptOwnershipEpoch
          ),
          eq(llmInferenceAttempts.ownerTokenHash, ownerTokenHash),
          eq(llmInferenceAttempts.status, "prepared")
        )
      )
      .returning({ attemptId: llmInferenceAttempts.attemptId });
    if (updated.length === 1) {
      await appendInferenceJobEvent(tx, {
        workerJobId: await loadPlanWorkerJobId(tx, attemptLink.planId),
        workerJobAttemptId: attemptLink.workerJobAttemptId ?? undefined,
        kind: "INFERENCE_ATTEMPT_SUBMITTING",
        dedupeId: input.attemptId,
        payload: {
          inferencePlanId: attemptLink.planId,
          inferenceAttemptId: input.attemptId,
          attemptOwnershipEpoch: input.attemptOwnershipEpoch,
        },
      });
    }
    return updated.length === 1;
  });
}

/** Appends sanitized provider evidence only while the same attempt owner still holds the fence. */
export async function completeInferenceAttempt(input: {
  receipt: InferenceAttemptReceipt;
  attemptOwnershipEpoch: number;
  ownerToken: string;
}): Promise<boolean> {
  const parsedReceipt = inferenceAttemptReceiptSchema.safeParse(input.receipt);
  if (!parsedReceipt.success)
    throw new Error("Invalid inference attempt receipt");
  const receipt = parsedReceipt.data;
  const db = getDb();
  const ownerTokenHash = createHash("sha256")
    .update(input.ownerToken)
    .digest("hex");
  return db.transaction(async tx => {
    if (
      !(await hasCurrentOwnerFence(tx, {
        attemptId: receipt.attemptId,
        attemptOwnershipEpoch: input.attemptOwnershipEpoch,
        ownerTokenHash,
      }))
    )
      return false;
    const [attemptLink] = await tx
      .select({
        planId: llmInferenceAttempts.planId,
        workerJobAttemptId: llmInferenceAttempts.workerJobAttemptId,
      })
      .from(llmInferenceAttempts)
      .where(eq(llmInferenceAttempts.attemptId, receipt.attemptId))
      .limit(1);
    if (!attemptLink) return false;
    const updated = await tx
      .update(llmInferenceAttempts)
      .set({
        status: "terminal",
        actualModel: receipt.actualModel,
        submissionState: receipt.submissionState,
        outcome: receipt.outcome,
        normalizedFailure: receipt.normalizedFailure,
        streamCommitted: receipt.streamCommitted,
        providerRequestId: receipt.providerRequestId,
        gatewayRequestId: receipt.gatewayRequestId,
        observedProviderId: receipt.observedExecution?.providerId,
        observedCredentialOwnerRef:
          receipt.observedExecution?.credentialOwnerRef,
        observedDeploymentId: receipt.observedExecution?.deploymentId,
        observedEndpointSurface: receipt.observedExecution?.endpointSurface,
        inputTokens: receipt.usage?.input,
        cachedInputTokens: receipt.usage?.cachedInput,
        outputTokens: receipt.usage?.output,
        reasoningTokens: receipt.usage?.reasoning,
        chargedCostMicros: receipt.chargedCostMicros,
        effectReceiptRefsJson: receipt.effectReceiptRefs ?? [],
        updatedAt: new Date(),
        terminalAt: new Date(),
      })
      .where(
        and(
          eq(llmInferenceAttempts.attemptId, receipt.attemptId),
          eq(llmInferenceAttempts.planId, receipt.planId),
          eq(
            llmInferenceAttempts.attemptOwnershipEpoch,
            input.attemptOwnershipEpoch
          ),
          eq(llmInferenceAttempts.ownerTokenHash, ownerTokenHash),
          eq(llmInferenceAttempts.providerId, receipt.providerId),
          eq(llmInferenceAttempts.deploymentId, receipt.deploymentId),
          eq(
            llmInferenceAttempts.credentialOwnerRef,
            receipt.credentialOwnerRef
          ),
          ...(receipt.observedExecution
            ? [
                eq(
                  llmInferenceAttempts.endpointSurface,
                  receipt.observedExecution.endpointSurface
                ),
              ]
            : []),
          eq(llmInferenceAttempts.status, "submitting")
        )
      )
      .returning({ attemptId: llmInferenceAttempts.attemptId });
    if (updated.length === 1) {
      await appendInferenceJobEvent(tx, {
        workerJobId: await loadPlanWorkerJobId(tx, attemptLink.planId),
        workerJobAttemptId: attemptLink.workerJobAttemptId ?? undefined,
        kind: "INFERENCE_ATTEMPT_TERMINAL",
        dedupeId: receipt.attemptId,
        payload: {
          inferencePlanId: receipt.planId,
          inferenceAttemptId: receipt.attemptId,
          outcome: receipt.outcome,
          submissionState: receipt.submissionState,
          normalizedFailure: receipt.normalizedFailure,
          streamCommitted: receipt.streamCommitted,
          observedExecution: receipt.observedExecution,
          usage: receipt.usage,
          chargedCostMicros: receipt.chargedCostMicros,
        },
      });
    }
    return updated.length === 1;
  });
}

export async function loadInferenceSettlementRecord(
  attemptId: string,
  tenantId?: string,
): Promise<{
  reservationId: string;
  receipt: InferenceAttemptReceipt;
} | null> {
  if (!attemptId.trim()) return null;
  const db = getDb();
  const [row] = await db
    .select({
      planId: llmInferenceAttempts.planId,
      reservationId: llmInferencePlans.creditReservationId,
      attemptId: llmInferenceAttempts.attemptId,
      attemptOrdinal: llmInferenceAttempts.attemptOrdinal,
      modelProfileId: llmInferenceAttempts.modelProfileId,
      actualModel: llmInferenceAttempts.actualModel,
      providerId: llmInferenceAttempts.providerId,
      credentialOwnerRef: llmInferenceAttempts.credentialOwnerRef,
      deploymentId: llmInferenceAttempts.deploymentId,
      outcome: llmInferenceAttempts.outcome,
      submissionState: llmInferenceAttempts.submissionState,
      normalizedFailure: llmInferenceAttempts.normalizedFailure,
      streamCommitted: llmInferenceAttempts.streamCommitted,
      providerRequestId: llmInferenceAttempts.providerRequestId,
      gatewayRequestId: llmInferenceAttempts.gatewayRequestId,
      observedProviderId: llmInferenceAttempts.observedProviderId,
      observedCredentialOwnerRef: llmInferenceAttempts.observedCredentialOwnerRef,
      observedDeploymentId: llmInferenceAttempts.observedDeploymentId,
      observedEndpointSurface: llmInferenceAttempts.observedEndpointSurface,
      inputTokens: llmInferenceAttempts.inputTokens,
      cachedInputTokens: llmInferenceAttempts.cachedInputTokens,
      outputTokens: llmInferenceAttempts.outputTokens,
      reasoningTokens: llmInferenceAttempts.reasoningTokens,
      chargedCostMicros: llmInferenceAttempts.chargedCostMicros,
      effectReceiptRefs: llmInferenceAttempts.effectReceiptRefsJson,
      status: llmInferenceAttempts.status,
    })
    .from(llmInferenceAttempts)
    .innerJoin(
      llmInferencePlans,
      eq(llmInferencePlans.planId, llmInferenceAttempts.planId),
    )
    .where(tenantId
      ? and(
          eq(llmInferenceAttempts.attemptId, attemptId),
          eq(llmInferencePlans.tenantId, tenantId),
        )
      : eq(llmInferenceAttempts.attemptId, attemptId))
    .limit(1);
  if (!row || row.status !== "terminal" || row.outcome !== "completed") return null;

  const receipt = inferenceAttemptReceiptSchema.safeParse({
    planId: row.planId,
    attemptId: row.attemptId,
    attemptOrdinal: row.attemptOrdinal,
    actualModel: row.actualModel ?? row.modelProfileId,
    providerId: row.providerId,
    credentialOwnerRef: row.credentialOwnerRef,
    deploymentId: row.deploymentId,
    outcome: row.outcome,
    submissionState: row.submissionState,
    streamCommitted: row.streamCommitted,
    ...(row.normalizedFailure ? { normalizedFailure: row.normalizedFailure } : {}),
    ...(row.providerRequestId ? { providerRequestId: row.providerRequestId } : {}),
    ...(row.gatewayRequestId ? { gatewayRequestId: row.gatewayRequestId } : {}),
    ...(row.inputTokens !== null && row.outputTokens !== null
      ? {
          usage: {
            input: row.inputTokens,
            output: row.outputTokens,
            ...(row.cachedInputTokens !== null
              ? { cachedInput: row.cachedInputTokens }
              : {}),
            ...(row.reasoningTokens !== null
              ? { reasoning: row.reasoningTokens }
              : {}),
          },
        }
      : {}),
    ...(row.chargedCostMicros !== null
      ? { chargedCostMicros: row.chargedCostMicros }
      : {}),
    ...(row.observedProviderId &&
    row.observedCredentialOwnerRef &&
    row.observedDeploymentId &&
    row.observedEndpointSurface
      ? {
          observedExecution: {
            model: row.actualModel ?? row.modelProfileId,
            providerId: row.observedProviderId,
            credentialOwnerRef: row.observedCredentialOwnerRef,
            deploymentId: row.observedDeploymentId,
            endpointSurface: row.observedEndpointSurface,
          },
        }
      : {}),
    ...(row.effectReceiptRefs.length
      ? { effectReceiptRefs: row.effectReceiptRefs }
      : {}),
  });
  if (!receipt.success || receipt.data.outcome !== "completed") return null;
  return { reservationId: row.reservationId, receipt: receipt.data };
}

export type InferenceAttemptStatusLookup =
  | { found: false }
  | {
      found: true;
      attemptId: string;
      status: "in_progress";
      attemptStatus: "prepared" | "submitting" | "submitted";
    }
  | {
      found: true;
      attemptId: string;
      status: "terminal";
      outcome: "completed" | "failed" | "cancelled" | "unknown";
      submissionState: "not_submitted" | "submitted" | "unknown";
      normalizedFailure?: string;
      usage?: { input: number; output: number };
      chargedCostMicros?: number;
      resultAvailable: false;
    };

/** Tenant- and principal-scoped metadata lookup; provider IDs and raw output are withheld. */
export async function loadInferenceAttemptStatus(input: {
  attemptId: string;
  tenantId: string;
  principalRef: string;
}): Promise<InferenceAttemptStatusLookup> {
  if (!input.attemptId.trim() || !input.tenantId.trim() || !input.principalRef.trim()) {
    return { found: false };
  }
  const [row] = await getDb()
    .select({
      attemptId: llmInferenceAttempts.attemptId,
      status: llmInferenceAttempts.status,
      outcome: llmInferenceAttempts.outcome,
      submissionState: llmInferenceAttempts.submissionState,
      normalizedFailure: llmInferenceAttempts.normalizedFailure,
      inputTokens: llmInferenceAttempts.inputTokens,
      outputTokens: llmInferenceAttempts.outputTokens,
      chargedCostMicros: llmInferenceAttempts.chargedCostMicros,
    })
    .from(llmInferenceAttempts)
    .innerJoin(llmInferencePlans, eq(llmInferencePlans.planId, llmInferenceAttempts.planId))
    .where(and(
      eq(llmInferenceAttempts.attemptId, input.attemptId),
      eq(llmInferencePlans.tenantId, input.tenantId),
      eq(llmInferencePlans.principalRef, input.principalRef),
    ))
    .limit(1);
  if (!row) return { found: false };
  if (row.status === "prepared" || row.status === "submitting" || row.status === "submitted") {
    return {
      found: true,
      attemptId: row.attemptId,
      status: "in_progress",
      attemptStatus: row.status,
    };
  }
  if (row.status !== "terminal") return { found: false };
  let outcome: "completed" | "failed" | "cancelled" | "unknown";
  switch (row.outcome) {
    case "completed":
    case "failed":
    case "cancelled":
    case "unknown":
      outcome = row.outcome;
      break;
    default:
      return { found: false };
  }
  let submissionState: "not_submitted" | "submitted" | "unknown";
  switch (row.submissionState) {
    case "not_submitted":
    case "submitted":
    case "unknown":
      submissionState = row.submissionState;
      break;
    default:
      return { found: false };
  }
  return {
    found: true,
    attemptId: row.attemptId,
    status: "terminal",
    outcome,
    submissionState,
    ...(row.normalizedFailure ? { normalizedFailure: row.normalizedFailure } : {}),
    ...(row.inputTokens !== null && row.outputTokens !== null
      ? { usage: { input: row.inputTokens, output: row.outputTokens } }
      : {}),
    ...(row.chargedCostMicros !== null ? { chargedCostMicros: row.chargedCostMicros } : {}),
    resultAvailable: false,
  };
}

/** Finds completed paid attempts whose durable credit owner has no settlement row yet. */
export async function listPendingInferenceSettlementAttempts(
  limit = 50,
): Promise<Array<{ attemptId: string; tenantId: string }>> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) return [];
  const result = await getDb().execute(sql`
    SELECT a."attemptId", p."tenantId"
    FROM "llm_inference_attempts" a
    JOIN "llm_inference_plans" p ON p."planId" = a."planId"
    WHERE a."status" = 'terminal'
      AND a."outcome" = 'completed'
      AND a."chargedCostMicros" IS NOT NULL
      AND (
        NOT EXISTS (
          SELECT 1
          FROM "llm_inference_credit_settlements" s
          WHERE s."reservationId" = p."creditReservationId"
            AND s."settlementKey" = a."attemptId"
        )
        OR (
          p."workerJobId" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM "worker_job_events" e
            WHERE e."workerJobId" = p."workerJobId"
              AND e."eventType" = 'INFERENCE_SETTLEMENT_CONFIRMED'
              AND e."payloadJson"->>'inferenceAttemptId' = a."attemptId"
          )
        )
      )
    ORDER BY a."terminalAt" ASC, a."attemptId" ASC
    LIMIT ${limit}
  `);
  return resultRows<{ attemptId: string; tenantId: string }>(result)
    .filter(row => typeof row.attemptId === "string" && typeof row.tenantId === "string");
}

export async function recordInferenceSettlementOutcome(input: {
  planId: string;
  attemptId: string;
  status: "pending" | "settled";
  reason?: "COST_UNAVAILABLE" | "OWNER_REJECTED" | "AUDIT_WRITE_FAILED";
  chargedCostMicros?: number;
}): Promise<void> {
  const db = getDb();
  await db.transaction(async tx => {
    const [link] = await tx
      .select({
        workerJobId: llmInferencePlans.workerJobId,
        workerJobAttemptId: llmInferenceAttempts.workerJobAttemptId,
      })
      .from(llmInferenceAttempts)
      .innerJoin(
        llmInferencePlans,
        eq(llmInferencePlans.planId, llmInferenceAttempts.planId),
      )
      .where(
        and(
          eq(llmInferenceAttempts.attemptId, input.attemptId),
          eq(llmInferenceAttempts.planId, input.planId),
        ),
      )
      .limit(1);
    if (!link) throw new Error("Inference settlement attempt was not found");
    const settled = input.status === "settled";
    await appendInferenceJobEvent(tx, {
      workerJobId: link.workerJobId,
      workerJobAttemptId: link.workerJobAttemptId ?? undefined,
      kind: settled
        ? "INFERENCE_SETTLEMENT_CONFIRMED"
        : "INFERENCE_SETTLEMENT_PENDING",
      dedupeId: input.attemptId,
      payload: {
        inferencePlanId: input.planId,
        inferenceAttemptId: input.attemptId,
        ...(settled && input.chargedCostMicros !== undefined
          ? { chargedCostMicros: input.chargedCostMicros }
          : {}),
        ...(!settled && input.reason ? { reason: input.reason } : {}),
      },
    });
  });
}
