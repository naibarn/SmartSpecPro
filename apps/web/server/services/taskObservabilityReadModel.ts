import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, inArray, lte, lt, or, sql } from "drizzle-orm";

import { db, getDb } from "../db";
import {
  runnerNodes,
  runnerExecutionSessions,
  conversations,
  workerJobEvents,
  workerJobAttempts,
  workerJobProviderReservations,
  llmInferenceAttempts,
  llmInferencePlans,
  workerJobs,
  workers,
} from "../../drizzle/schema";
import { aggregateUsageEvidence, taskUsageEvidenceCallSchema } from "../../shared/taskUsageEvidence";
import { goalBaselineSchema, projectGoalProgress } from "../../shared/taskGoalProgress";

const PAGE_SIZE = 25;
const MAX_JOB_DETAIL = 100;
const MAX_AGGREGATE_JOBS = 500;
const MAX_AGGREGATE_CALLS = 10_000;
const CURSOR_TTL_MS = 10 * 60_000;
const CURSOR_SECRET = process.env.JWT_SECRET?.trim() ?? "";

export class TaskObservabilityError extends Error {
  constructor(public readonly code: "TASK_NOT_FOUND" | "SNAPSHOT_EXPIRED" | "SNAPSHOT_INVALID" | "SCOPE_REQUIRED") {
    super(code);
    this.name = "TaskObservabilityError";
  }
}

type Scope = { tenantId: string; userId: number; isAdmin?: boolean };
type CursorPayload = { v: 1; tenantId: string; userId: number; isAdmin: boolean; projectId: string | null; specId: string | null; conversationId: number | null; asOf: string; beforeAt: string; beforeId: string; exp: number };

function assertScope(scope: Scope): void {
  if (!scope.tenantId.trim() || !Number.isSafeInteger(scope.userId) || scope.userId <= 0) {
    throw new TaskObservabilityError("SCOPE_REQUIRED");
  }
}

function sign(value: string): string {
  if (CURSOR_SECRET.length < 32) throw new TaskObservabilityError("SNAPSHOT_INVALID");
  return createHmac("sha256", CURSOR_SECRET).update(value).digest("base64url");
}

function encodeCursor(payload: CursorPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decodeCursor(token: string, scope: Scope, filters: { projectId?: string; specId?: string; conversationId?: number }): CursorPayload {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) throw new TaskObservabilityError("SNAPSHOT_INVALID");
  const expected = sign(body);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new TaskObservabilityError("SNAPSHOT_INVALID");
  let payload: CursorPayload;
  try { payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as CursorPayload; }
  catch { throw new TaskObservabilityError("SNAPSHOT_INVALID"); }
  if (payload.v !== 1 || payload.tenantId !== scope.tenantId || payload.userId !== scope.userId || payload.isAdmin !== Boolean(scope.isAdmin) ||
      payload.projectId !== (filters.projectId ?? null) || payload.specId !== (filters.specId ?? null) || payload.conversationId !== (filters.conversationId ?? null)) {
    throw new TaskObservabilityError("SNAPSHOT_INVALID");
  }
  if (!Number.isSafeInteger(payload.exp) || payload.exp <= Date.now()) throw new TaskObservabilityError("SNAPSHOT_EXPIRED");
  if (!Number.isFinite(Date.parse(payload.asOf)) || !Number.isFinite(Date.parse(payload.beforeAt)) || !payload.beforeId) {
    throw new TaskObservabilityError("SNAPSHOT_INVALID");
  }
  return payload;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function safeText(value: unknown, max = 160): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/(?:\b(?:api[_-]?key|token|secret|password|authorization)\b\s*[:=]\s*\S+|\bbearer\s+\S+|\bsk-[A-Za-z0-9_-]+|\bAKIA[0-9A-Z]{16}\b|\bxox[abprs]-\S+)/gi, "[redacted]")
    .slice(0, max).trim() || null;
}

function asIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function modelCallIdentity(jobId: string, attemptId: string | null, callId: string | null, id: string): string {
  // Retries that replay one provider call keep the call identity. A retry that
  // actually invokes the provider receives a new modelCallId and is counted.
  return callId ? `${jobId}:${callId}` : `${jobId}:${attemptId ?? "attempt-unknown"}:${id}`;
}

function reservationEvidence(row: typeof workerJobProviderReservations.$inferSelect, job: typeof workerJobs.$inferSelect, corrections: Map<string, Record<string, unknown>>) {
  const receipt = objectValue(row.usageReceiptJson);
  const selection = objectValue(row.modelSelectionJson);
  const selectionModel = selection ? safeText(selection.requestedModel ?? selection.model, 120) : null;
  const effective = safeText(receipt?.effectiveModel, 120);
  const identity = modelCallIdentity(job.id, row.attemptId, row.modelCallId, row.id);
  const correction = row.modelCallId ? corrections.get(row.modelCallId) : undefined;
  const corrected = objectValue(correction?.correctedUsage);
  const rawInput = corrected?.inputTokens ?? receipt?.inputTokens;
  const rawOutput = corrected?.outputTokens ?? receipt?.outputTokens;
  const rawCached = corrected?.cachedInputTokens ?? receipt?.cachedInputTokens;
  const readCount = (value: unknown): number | null => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
  const inputMetadata = objectValue(job.inputJson);
  const progress = objectValue(job.progressJson);
  const session = safeText(selection?.uiSessionModelAtCall ?? inputMetadata?.uiSessionModelAtCall, 120);
  const helper = safeText(selection?.externalHelperModelAtCall ?? inputMetadata?.externalHelperModelAtCall, 120);
  const scopeName = safeText(inputMetadata?.projectId ?? inputMetadata?.specId ?? inputMetadata?.conversationId, 160) ?? `job:${job.id}`;
  return taskUsageEvidenceCallSchema.parse({
    consumptionId: identity,
    scope: scopeName,
    revision: correction ? 1 : 0,
    asOf: asIso(correction?.correctedAt as string | undefined) ?? asIso(row.updatedAt) ?? asIso(row.createdAt),
    sourceRefs: [
      { kind: "worker_job_provider_reservation", reference: row.id },
      ...(row.modelCallId ? [{ kind: "provider_model_call", reference: row.modelCallId }] : []),
      ...(correction?.correctionEventId ? [{ kind: "canonical_correction_event", reference: String(correction.correctionEventId) }] : []),
    ],
    tokens: {
      mode: "delta",
      inputTokens: readCount(rawInput),
      outputTokens: readCount(rawOutput),
      cachedInputTokens: readCount(rawCached),
    },
    model: {
      uiSession: session,
      requested: safeText(row.requestedModel, 120) ?? selectionModel,
      providerConfirmedEffective: effective,
      helper,
    },
    selection: {
      phase: safeText(row.modelPhase, 40),
      role: safeText(row.modelRole, 64),
      effort: safeText(row.reasoningEffort, 24),
      policyProfile: safeText(selection?.profile, 80),
      rationale: safeText(selection?.rationale ?? selection?.reason ?? selection?.modelSwitchReason, 300),
      selectedAt: asIso(row.createdAt),
    },
    coverage: { relationship: "standalone" },
    reservation: null,
    settlement: null,
  });
}

function inferenceEvidence(row: {
  attemptId: string;
  planId: string;
  modelProfileId: string;
  actualModel: string | null;
  observedProviderId: string | null;
  observedCredentialOwnerRef: string | null;
  observedDeploymentId: string | null;
  observedEndpointSurface: string | null;
  providerId: string;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  chargedCostMicros: number | null;
  updatedAt: Date;
  workerJobAttemptId: string | null;
}, job: typeof workerJobs.$inferSelect, uiSessionModel: string | null, overlapsReservation: boolean) {
  return taskUsageEvidenceCallSchema.parse({
    consumptionId: `inference:${row.attemptId}`,
    scope: `job:${job.id}`,
    revision: 0,
    asOf: row.updatedAt.toISOString(),
    sourceRefs: [
      { kind: "llm_inference_plan", reference: row.planId },
      { kind: "llm_inference_attempt", reference: row.attemptId },
    ],
    tokens: { mode: "delta", inputTokens: row.inputTokens, cachedInputTokens: row.cachedInputTokens, outputTokens: row.outputTokens },
    model: {
      uiSession: uiSessionModel,
      requested: safeText(row.modelProfileId, 256),
      providerConfirmedEffective: row.observedProviderId && row.observedCredentialOwnerRef && row.observedDeploymentId && row.observedEndpointSurface
        ? safeText(row.actualModel, 256) : null,
      helper: null,
    },
    coverage: overlapsReservation ? {
      relationship: "overlap_unknown",
      rationale: "Inference and provider reservation receipts share a canonical worker attempt; call identity is not cross-bound.",
    } : { relationship: "standalone" },
    settlement: row.chargedCostMicros === null ? null : {
      amount: row.chargedCostMicros / 1_000_000,
      currency: "USD",
      funding: "canonical_inference_settlement",
    },
  });
}

function goalProjection(job: typeof workerJobs.$inferSelect) {
  const progress = objectValue(job.progressJson);
  const input = objectValue(job.inputJson);
  const baselineResult = goalBaselineSchema.safeParse(input?.goalBaseline);
  // Schema validity and a self-declared digest do not bind the baseline to an
  // authoritative Goal source. No canonical Goal baseline store/dereference
  // contract currently exists, so this read-only surface must stay UNKNOWN.
  if (baselineResult.success) {
    const unknown = projectGoalProgress({ baseline: null, observations: [] });
    return { ...unknown, reason: "goal_baseline_source_unverified" };
  }
  const observability = objectValue(progress?.taskObservability);
  const observations = Array.isArray(observability?.goalObservations) ? observability!.goalObservations : [];
  const safeObservations = observations.flatMap((value) => {
    const row = objectValue(value);
    if (!row) return [];
    return [{
      baselineVersion: safeText(row.baselineVersion, 200) ?? "",
      baselineDigest: safeText(row.baselineDigest, 80) ?? "",
      criterionId: safeText(row.criterionId, 200) ?? "",
      revision: Number(row.revision),
      evidenceRef: safeText(row.evidenceRef, 512),
      verificationStatus: row.verificationStatus,
      implemented: row.implemented,
      workComplete: row.workComplete,
      workUnits: Array.isArray(row.workUnits) ? row.workUnits.flatMap((unitValue) => {
        const unit = objectValue(unitValue);
        if (!unit) return [];
        return [{
          workUnitId: safeText(unit.workUnitId, 200) ?? "",
          implemented: unit.implemented,
          workComplete: unit.workComplete,
          executionProgress: unit.executionProgress === null ? null : Number(unit.executionProgress),
        }];
      }) : undefined,
      executionProgress: row.executionProgress === null ? null : Number(row.executionProgress),
      liveRequired: row.liveRequired,
      liveVerified: row.liveVerified,
      reopened: row.reopened,
      regressed: row.regressed,
      blockers: Array.isArray(row.blockers) ? row.blockers.flatMap((item) => typeof item === "string" ? [item.slice(0, 300)] : []) : [],
      dependencies: Array.isArray(row.dependencies) ? row.dependencies.flatMap((item) => typeof item === "string" ? [item.slice(0, 200)] : []) : [],
      nextAction: safeText(row.nextAction, 300),
    }];
  });
  try {
    return projectGoalProgress({ baseline: null, observations: safeObservations as never[] });
  } catch (error) {
    const unknown = projectGoalProgress({ baseline: null, observations: [] });
    return { ...unknown, status: "EVIDENCE_CONFLICT" as const, reason: error instanceof Error ? safeText(error.message, 80) : "goal_evidence_invalid" };
  }
}

async function loadJobDetail(scope: Scope, job: typeof workerJobs.$inferSelect, snapshotAt?: Date) {
  const input = objectValue(job.inputJson);
  const conversationId = Number(input?.conversationId);
  const conversation = Number.isSafeInteger(conversationId) && conversationId > 0
    ? (await db.select({ model: conversations.model, skillSettings: conversations.skillSettings, updatedAt: conversations.updatedAt })
      .from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.userId, job.requestedByUserId), eq(conversations.tenantId, scope.tenantId), ...(snapshotAt ? [lte(conversations.updatedAt, snapshotAt)] : []))).limit(1))[0]
    : null;
  const uiSessionModelAtCall = safeText(input?.uiSessionModelAtCall, 120);
  const currentAttempt = (await db.select({ runnerId: workerJobAttempts.runnerId, createdAt: workerJobAttempts.createdAt })
    .from(workerJobAttempts).where(and(eq(workerJobAttempts.workerJobId, job.id), eq(workerJobAttempts.attempt, job.attempt)))
    .orderBy(desc(workerJobAttempts.createdAt)).limit(1))[0];
  const runnerSession = (await db.select({ runnerId: runnerExecutionSessions.runnerId, state: runnerExecutionSessions.state, observedAt: runnerExecutionSessions.observedAt, updatedAt: runnerExecutionSessions.updatedAt })
    .from(runnerExecutionSessions).where(and(eq(runnerExecutionSessions.workerJobId, job.id), eq(runnerExecutionSessions.tenantId, scope.tenantId)))
    .orderBy(desc(runnerExecutionSessions.generation)).limit(1))[0];
  const reservations = await db.select().from(workerJobProviderReservations)
    .where(snapshotAt
      ? and(eq(workerJobProviderReservations.workerJobId, job.id), lte(workerJobProviderReservations.createdAt, snapshotAt), lte(workerJobProviderReservations.updatedAt, snapshotAt))
      : eq(workerJobProviderReservations.workerJobId, job.id))
    .orderBy(workerJobProviderReservations.createdAt).limit(MAX_JOB_DETAIL);
  const timelineRows = await db.select({ id: workerJobEvents.id, eventType: workerJobEvents.eventType, createdAt: workerJobEvents.createdAt, payloadJson: workerJobEvents.payloadJson, attempt: workerJobEvents.workerJobAttempt })
    .from(workerJobEvents).where(and(eq(workerJobEvents.workerJobId, job.id), ...(snapshotAt ? [lte(workerJobEvents.createdAt, snapshotAt)] : [])))
    .orderBy(desc(workerJobEvents.createdAt)).limit(40);
  const callIds = reservations.flatMap((row) => row.modelCallId ? [row.modelCallId] : []);
  const events = callIds.length ? await db.select({ id: workerJobEvents.id, payloadJson: workerJobEvents.payloadJson, createdAt: workerJobEvents.createdAt })
    .from(workerJobEvents)
    .where(and(eq(workerJobEvents.workerJobId, job.id), eq(workerJobEvents.eventType, "CODEX_MODEL_USAGE_CORRECTED"), ...(snapshotAt ? [lte(workerJobEvents.createdAt, snapshotAt)] : [])))
    .orderBy(workerJobEvents.createdAt).limit(MAX_JOB_DETAIL) : [];
  const corrections = new Map<string, Record<string, unknown>>();
  for (const event of events) {
    const payload = objectValue(event.payloadJson);
    const modelCallId = safeText(payload?.modelCallId, 160);
    if (modelCallId && callIds.includes(modelCallId)) corrections.set(modelCallId, { ...payload, correctionEventId: event.id, correctedAt: asIso(event.createdAt) });
  }
  const usageCalls = reservations.filter((row) => row.reservationKind === "model_call")
    .map((row) => reservationEvidence(row, job, corrections));
  const inferenceRows = await db.select({
    attemptId: llmInferenceAttempts.attemptId,
    planId: llmInferenceAttempts.planId,
    modelProfileId: llmInferenceAttempts.modelProfileId,
    actualModel: llmInferenceAttempts.actualModel,
    observedProviderId: llmInferenceAttempts.observedProviderId,
    observedCredentialOwnerRef: llmInferenceAttempts.observedCredentialOwnerRef,
    observedDeploymentId: llmInferenceAttempts.observedDeploymentId,
    observedEndpointSurface: llmInferenceAttempts.observedEndpointSurface,
    providerId: llmInferenceAttempts.providerId,
    inputTokens: llmInferenceAttempts.inputTokens,
    cachedInputTokens: llmInferenceAttempts.cachedInputTokens,
    outputTokens: llmInferenceAttempts.outputTokens,
    chargedCostMicros: llmInferenceAttempts.chargedCostMicros,
    updatedAt: llmInferenceAttempts.updatedAt,
    workerJobAttemptId: llmInferenceAttempts.workerJobAttemptId,
    estimatedCostMicros: llmInferencePlans.estimatedCostMicros,
    parentCostCeilingMicros: llmInferencePlans.parentCostCeilingMicros,
  }).from(llmInferenceAttempts).innerJoin(llmInferencePlans, eq(llmInferenceAttempts.planId, llmInferencePlans.planId))
    .where(and(eq(llmInferencePlans.workerJobId, job.id), eq(llmInferencePlans.tenantId, scope.tenantId), ...(snapshotAt ? [lte(llmInferenceAttempts.createdAt, snapshotAt), lte(llmInferenceAttempts.updatedAt, snapshotAt)] : [])))
    .orderBy(llmInferenceAttempts.createdAt).limit(MAX_JOB_DETAIL);
  const reservationAttemptIds = new Set(reservations.filter((row) => row.reservationKind === "model_call" && row.attemptId).map((row) => row.attemptId!));
  const inferenceCalls = inferenceRows.map((row) => inferenceEvidence(row, job, uiSessionModelAtCall, Boolean(row.workerJobAttemptId && reservationAttemptIds.has(row.workerJobAttemptId))));
  const usage = aggregateUsageEvidence([...usageCalls, ...inferenceCalls]);
  const worker = job.workerId ? (await db.select({ id: workers.id, displayName: workers.displayName, status: workers.status, lastSeenAt: workers.lastSeenAt })
    .from(workers).where(and(eq(workers.id, job.workerId), eq(workers.tenantId, scope.tenantId))).limit(1))[0] : null;
  const runnerId = runnerSession?.runnerId ?? currentAttempt?.runnerId ?? null;
  const runner = runnerId ? (await db.select({ runnerId: runnerNodes.runnerId, displayName: runnerNodes.displayName, status: runnerNodes.status, trustState: runnerNodes.trustState, lastSeenAt: runnerNodes.lastSeenAt, revokedAt: runnerNodes.revokedAt })
    .from(runnerNodes).where(and(eq(runnerNodes.runnerId, runnerId), eq(runnerNodes.tenantId, scope.tenantId), ...(snapshotAt ? [lte(runnerNodes.updatedAt, snapshotAt)] : []))).limit(1))[0] : null;
  const progress = objectValue(job.progressJson);
  const development = objectValue(progress?.spec224);
  const skillSettings = objectValue(conversation?.skillSettings);
  const selection = objectValue(skillSettings?.llmSelection);
  const selectionRationale = selection ? {
    mode: safeText(selection.mode, 40),
    selectedModel: safeText(selection.modelId, 120),
    provider: safeText(selection.providerName ?? selection.lastResolvedProviderName, 80),
    lastResolvedModel: safeText(selection.lastResolvedModelId, 120),
    updatedAt: asIso(conversation?.updatedAt),
  } : null;
  const projectId = safeText(input?.projectId ?? development?.projectId, 160);
  const specId = safeText(input?.specId ?? development?.specId, 64);
  const identityBinding = {
    status: projectId || specId ? "UNVERIFIED" as const : "UNKNOWN" as const,
    source: development?.projectId || development?.specId ? "spec224_run_projection" : projectId || specId ? "worker_job_metadata" : null,
  };
  const updatedAt = new Date(Math.max(job.createdAt.getTime(), runnerSession?.updatedAt.getTime() ?? 0, ...reservations.map((row) => row.updatedAt.getTime())));
  return {
    id: job.id,
    jobType: job.jobType,
    status: job.status,
    stage: safeText(job.progressJson?.phase ?? job.progressJson?.stage ?? job.statusReason, 120),
    attempt: job.attempt,
    maxAttempts: job.maxAttempts,
    heartbeatAt: asIso(job.heartbeatAt ?? runnerSession?.observedAt ?? currentAttempt?.createdAt),
    heartbeatFreshness: job.heartbeatAt ? (Date.now() - job.heartbeatAt.getTime() < 5 * 60_000 ? "fresh" : "stale") : "unknown",
    updatedAt: updatedAt.toISOString(),
    createdAt: job.createdAt.toISOString(),
    projectId,
    specId,
    identityBinding,
    modelSelection: {
      uiSessionModel: safeText(conversation?.model, 120) ?? safeText(input?.uiSessionModel, 120),
      rationale: selectionRationale,
      source: conversation ? "owned_conversation_current_config" : input?.uiSessionModel ? "job_metadata" : "unknown",
      asOf: asIso(conversation?.updatedAt) ?? asIso(job.createdAt),
    },
    owner: { userId: job.requestedByUserId, tenantId: scope.tenantId },
    operatorAttention: job.operatorReviewRequired ? { required: true, reason: safeText(job.operatorReviewReason, 300) } : { required: false, reason: null },
    recovery: { nextRetryAt: asIso(job.nextRetryAt), retryEligible: job.status === "retry_scheduled" && Boolean(job.nextRetryAt), runnerSessionState: runnerSession?.state ?? null },
    timeline: timelineRows.reverse().map((event) => {
      const payload = objectValue(event.payloadJson);
      const readTokens = (value: Record<string, unknown> | null) => {
        const read = (field: string) => Number.isSafeInteger(value?.[field]) && Number(value?.[field]) >= 0 ? Number(value?.[field]) : null;
        return { inputTokens: read("inputTokens"), cachedInputTokens: read("cachedInputTokens"), outputTokens: read("outputTokens") };
      };
      return {
        id: event.id,
        type: event.eventType,
        at: event.createdAt.toISOString(),
        attempt: event.attempt,
        phase: safeText(payload?.phase ?? payload?.stage, 80),
        reasonCode: safeText(payload?.reasonCode ?? payload?.safeErrorCode, 100),
        correction: event.eventType === "CODEX_MODEL_USAGE_CORRECTED" ? {
          modelCallId: safeText(payload?.modelCallId, 160),
          previousUsage: readTokens(objectValue(payload?.previousUsage)),
          correctedUsage: readTokens(objectValue(payload?.correctedUsage)),
          additionalCharge: Number.isSafeInteger(payload?.additionalCharge) && Number(payload?.additionalCharge) >= 0 ? Number(payload?.additionalCharge) : null,
        } : null,
      };
    }),
    worker: worker ? { id: worker.id, displayName: safeText(worker.displayName, 120), status: worker.status, lastSeenAt: asIso(worker.lastSeenAt) } : null,
    runner: runner ? { id: runner.runnerId, displayName: safeText(runner.displayName, 120), status: runner.revokedAt ? "revoked" : runner.status, trustState: runner.trustState, lastSeenAt: asIso(runner.lastSeenAt), freshness: runner.lastSeenAt && Date.now() - runner.lastSeenAt.getTime() < 5 * 60_000 ? "fresh" : "stale" } : { status: "unknown", freshness: "unknown" },
    goal: goalProjection(job),
    usage: { ...usage, reservations: [
      ...reservations.map((row) => ({ kind: row.reservationKind, status: row.reservationStatus, modelCallId: row.modelCallId, estimateTokens: row.reservedTokens, estimatedCostMicros: null, provider: safeText(row.providerName, 64), observedAt: asIso(row.lastObservedAt) })),
      ...inferenceRows.map((row) => ({ kind: "inference_plan", status: "observed", estimateTokens: null, estimatedCostMicros: row.estimatedCostMicros, parentCostCeilingMicros: row.parentCostCeilingMicros, provider: null, observedAt: row.updatedAt.toISOString() })),
    ], coverage: { status: "PARTIAL" as const, observedCallSources: ["worker_job_provider_reservations", "llm_inference_attempts"], missingSources: ["unlinked_external_helper_calls", "unlinked_provider_usage", "provider_quota_observations"], reason: "Only usage linked to this canonical job can be counted; absence from linked sources is not evidence of zero usage." } },
    quotaCoverage: { status: "UNKNOWN", reason: "No model-provider quota observation is linked to this canonical job." },
    coverage: { modelCallCount: usage.counts.unique, capped: reservations.length >= MAX_JOB_DETAIL, asOf: updatedAt.toISOString() },
  };
}

export async function getTaskObservabilityDetail(input: { scope: Scope; jobId: string }) {
  assertScope(input.scope);
  getDb();
  const [job] = await db.select().from(workerJobs).where(and(
    eq(workerJobs.id, input.jobId),
    eq(workerJobs.tenantId, input.scope.tenantId),
    ...(input.scope.isAdmin ? [] : [eq(workerJobs.requestedByUserId, input.scope.userId)]),
  )).limit(1);
  if (!job) throw new TaskObservabilityError("TASK_NOT_FOUND");
  return loadJobDetail(input.scope, job);
}

export async function listTaskObservability(input: { scope: Scope; cursor?: string | null; projectId?: string; specId?: string; conversationId?: number }) {
  assertScope(input.scope);
  getDb();
  const cursor = input.cursor ? decodeCursor(input.cursor, input.scope, input) : null;
  const asOf = cursor?.asOf ?? new Date().toISOString();
  const predicates = [eq(workerJobs.tenantId, input.scope.tenantId), lte(workerJobs.createdAt, new Date(asOf))];
  if (!input.scope.isAdmin) predicates.push(eq(workerJobs.requestedByUserId, input.scope.userId));
  if (input.projectId) predicates.push(sql`COALESCE(${workerJobs.inputJson}->>'projectId', ${workerJobs.progressJson}->'spec224'->>'projectId') = ${input.projectId}`);
  if (input.specId) predicates.push(sql`COALESCE(${workerJobs.inputJson}->>'specId', ${workerJobs.progressJson}->'spec224'->>'specId') = ${input.specId}`);
  if (input.conversationId) predicates.push(sql`${workerJobs.inputJson}->>'conversationId' = ${String(input.conversationId)}`);
  if (cursor) predicates.push(or(lt(workerJobs.createdAt, new Date(cursor.beforeAt)), and(eq(workerJobs.createdAt, new Date(cursor.beforeAt)), lt(workerJobs.id, cursor.beforeId))!));
  const rows = await db.select({
    id: workerJobs.id,
    requestedByUserId: workerJobs.requestedByUserId,
    jobType: workerJobs.jobType,
    status: workerJobs.status,
    attempt: workerJobs.attempt,
    maxAttempts: workerJobs.maxAttempts,
    heartbeatAt: workerJobs.heartbeatAt,
    createdAt: workerJobs.createdAt,
    workerId: workerJobs.workerId,
    operatorReviewRequired: workerJobs.operatorReviewRequired,
    operatorReviewReason: workerJobs.operatorReviewReason,
    nextRetryAt: workerJobs.nextRetryAt,
    statusReason: workerJobs.statusReason,
    inputJson: workerJobs.inputJson,
    progressJson: workerJobs.progressJson,
  }).from(workerJobs).where(and(...predicates)).orderBy(desc(workerJobs.createdAt), desc(workerJobs.id)).limit(PAGE_SIZE + 1);
  const hasMore = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE);
  const pageIds = page.map((job) => job.id);
  const runnerSessions = pageIds.length ? await db.select({ workerJobId: runnerExecutionSessions.workerJobId, runnerId: runnerExecutionSessions.runnerId, state: runnerExecutionSessions.state, generation: runnerExecutionSessions.generation })
    .from(runnerExecutionSessions).where(and(inArray(runnerExecutionSessions.workerJobId, pageIds), eq(runnerExecutionSessions.tenantId, input.scope.tenantId)))
    .orderBy(desc(runnerExecutionSessions.generation)) : [];
  const runnerByJob = new Map<string, typeof runnerSessions[number]>();
  for (const session of runnerSessions) if (session.workerJobId && !runnerByJob.has(session.workerJobId)) runnerByJob.set(session.workerJobId, session);
  const items = page.map((job) => {
    const progress = objectValue(job.progressJson);
    const inputMetadata = objectValue(job.inputJson);
    const development = objectValue(progress?.spec224);
    const projectId = safeText(inputMetadata?.projectId ?? development?.projectId, 160);
    const specId = safeText(inputMetadata?.specId ?? development?.specId, 64);
    return {
      id: job.id,
      ownerUserId: job.requestedByUserId,
      jobType: job.jobType,
      status: job.status,
      stage: safeText(progress?.phase ?? progress?.stage ?? job.statusReason, 120),
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
      heartbeatAt: asIso(job.heartbeatAt),
      createdAt: job.createdAt.toISOString(),
      workerId: job.workerId,
      runnerId: runnerByJob.get(job.id)?.runnerId ?? null,
      runnerSessionState: runnerByJob.get(job.id)?.state ?? null,
      projectId,
      specId,
      identityBinding: { status: projectId || specId ? "UNVERIFIED" as const : "UNKNOWN" as const, source: development?.projectId || development?.specId ? "spec224_run_projection" : projectId || specId ? "worker_job_metadata" : null },
      operatorAttention: { required: job.operatorReviewRequired, reason: job.operatorReviewRequired ? safeText(job.operatorReviewReason, 300) : null },
      recovery: { nextRetryAt: asIso(job.nextRetryAt), retryEligible: job.status === "retry_scheduled" && Boolean(job.nextRetryAt) },
    };
  });
  const last = page.at(-1);
  return {
    scope: input.scope.isAdmin ? "tenant_fleet" as const : "owner" as const,
    snapshot: { asOf, expiresAt: new Date((cursor?.exp ?? Date.now() + CURSOR_TTL_MS)).toISOString(), consistency: "created_at_watermark" as const },
    items,
    nextCursor: hasMore && last ? encodeCursor({ v: 1, tenantId: input.scope.tenantId, userId: input.scope.userId, isAdmin: Boolean(input.scope.isAdmin), projectId: input.projectId ?? null, specId: input.specId ?? null, conversationId: input.conversationId ?? null, asOf, beforeAt: last.createdAt.toISOString(), beforeId: last.id, exp: cursor?.exp ?? Date.now() + CURSOR_TTL_MS }) : null,
  };
}

/** Bounded Project/SPEC union over canonical job-linked consumption identities. */
export async function aggregateTaskObservability(input: { scope: Scope; projectId?: string; specId?: string }) {
  assertScope(input.scope);
  if (!input.projectId && !input.specId) throw new TaskObservabilityError("SCOPE_REQUIRED");
  getDb();
  const asOf = new Date();
  const jobPredicates = [eq(workerJobs.tenantId, input.scope.tenantId), lte(workerJobs.createdAt, asOf)];
  if (!input.scope.isAdmin) jobPredicates.push(eq(workerJobs.requestedByUserId, input.scope.userId));
  if (input.projectId) jobPredicates.push(sql`COALESCE(${workerJobs.inputJson}->>'projectId', ${workerJobs.progressJson}->'spec224'->>'projectId') = ${input.projectId}`);
  if (input.specId) jobPredicates.push(sql`COALESCE(${workerJobs.inputJson}->>'specId', ${workerJobs.progressJson}->'spec224'->>'specId') = ${input.specId}`);
  const jobs = await db.select().from(workerJobs).where(and(...jobPredicates))
    .orderBy(desc(workerJobs.createdAt), desc(workerJobs.id)).limit(MAX_AGGREGATE_JOBS + 1);
  const jobsCapped = jobs.length > MAX_AGGREGATE_JOBS;
  const boundedJobs = jobs.slice(0, MAX_AGGREGATE_JOBS);
  const jobIds = boundedJobs.map((job) => job.id);
  const reservations = jobIds.length ? await db.select().from(workerJobProviderReservations)
    .where(and(inArray(workerJobProviderReservations.workerJobId, jobIds), lte(workerJobProviderReservations.createdAt, asOf), lte(workerJobProviderReservations.updatedAt, asOf)))
    .orderBy(workerJobProviderReservations.createdAt).limit(MAX_AGGREGATE_CALLS + 1) : [];
  const reservationsCapped = reservations.length > MAX_AGGREGATE_CALLS;
  const boundedReservations = reservations.slice(0, MAX_AGGREGATE_CALLS);
  const callIds = boundedReservations.flatMap((row) => row.modelCallId ? [row.modelCallId] : []);
  const correctionEvents = jobIds.length ? await db.select({ workerJobId: workerJobEvents.workerJobId, id: workerJobEvents.id, payloadJson: workerJobEvents.payloadJson, createdAt: workerJobEvents.createdAt })
    .from(workerJobEvents).where(and(inArray(workerJobEvents.workerJobId, jobIds), eq(workerJobEvents.eventType, "CODEX_MODEL_USAGE_CORRECTED"), lte(workerJobEvents.createdAt, asOf)))
    .orderBy(workerJobEvents.createdAt).limit(MAX_AGGREGATE_CALLS) : [];
  const jobById = new Map(boundedJobs.map((job) => [job.id, job]));
  const correctionsByJob = new Map<string, Map<string, Record<string, unknown>>>();
  for (const event of correctionEvents) {
    const payload = objectValue(event.payloadJson);
    const modelCallId = safeText(payload?.modelCallId, 160);
    if (!modelCallId || !callIds.includes(modelCallId)) continue;
    const jobCorrections = correctionsByJob.get(event.workerJobId) ?? new Map<string, Record<string, unknown>>();
    jobCorrections.set(modelCallId, { ...payload, correctionEventId: event.id, correctedAt: asIso(event.createdAt) });
    correctionsByJob.set(event.workerJobId, jobCorrections);
  }
  const reservationCalls = boundedReservations.filter((row) => row.reservationKind === "model_call").flatMap((row) => {
    const job = jobById.get(row.workerJobId);
    return job ? [reservationEvidence(row, job, correctionsByJob.get(job.id) ?? new Map())] : [];
  });
  const inferenceRows = jobIds.length ? await db.select({
    attemptId: llmInferenceAttempts.attemptId,
    planId: llmInferenceAttempts.planId,
    modelProfileId: llmInferenceAttempts.modelProfileId,
    actualModel: llmInferenceAttempts.actualModel,
    observedProviderId: llmInferenceAttempts.observedProviderId,
    observedCredentialOwnerRef: llmInferenceAttempts.observedCredentialOwnerRef,
    observedDeploymentId: llmInferenceAttempts.observedDeploymentId,
    observedEndpointSurface: llmInferenceAttempts.observedEndpointSurface,
    providerId: llmInferenceAttempts.providerId,
    inputTokens: llmInferenceAttempts.inputTokens,
    cachedInputTokens: llmInferenceAttempts.cachedInputTokens,
    outputTokens: llmInferenceAttempts.outputTokens,
    chargedCostMicros: llmInferenceAttempts.chargedCostMicros,
    updatedAt: llmInferenceAttempts.updatedAt,
    workerJobAttemptId: llmInferenceAttempts.workerJobAttemptId,
    estimatedCostMicros: llmInferencePlans.estimatedCostMicros,
    parentCostCeilingMicros: llmInferencePlans.parentCostCeilingMicros,
    workerJobId: llmInferencePlans.workerJobId,
  }).from(llmInferenceAttempts).innerJoin(llmInferencePlans, eq(llmInferenceAttempts.planId, llmInferencePlans.planId))
    .where(and(inArray(llmInferencePlans.workerJobId, jobIds), eq(llmInferencePlans.tenantId, input.scope.tenantId), lte(llmInferenceAttempts.createdAt, asOf), lte(llmInferenceAttempts.updatedAt, asOf)))
    .orderBy(llmInferenceAttempts.createdAt).limit(MAX_AGGREGATE_CALLS + 1) : [];
  const inferenceCapped = inferenceRows.length > MAX_AGGREGATE_CALLS;
  const boundedInference = inferenceRows.slice(0, MAX_AGGREGATE_CALLS);
  const reservationAttemptKeys = new Set(boundedReservations.filter((row) => row.reservationKind === "model_call" && row.attemptId).map((row) => `${row.workerJobId}:${row.attemptId}`));
  const inferenceCalls = boundedInference.flatMap((row) => {
    const job = jobById.get(row.workerJobId);
    return job ? [inferenceEvidence(row, job, null, Boolean(row.workerJobAttemptId && reservationAttemptKeys.has(`${job.id}:${row.workerJobAttemptId}`)))] : [];
  });
  const usage = aggregateUsageEvidence([...reservationCalls, ...inferenceCalls]);
  const capped = jobsCapped || reservationsCapped || inferenceCapped || correctionEvents.length >= MAX_AGGREGATE_CALLS;
  const estimateGroups = new Map<string, number | null>();
  const estimateConflicts = new Set<string>();
  for (const row of boundedReservations) {
    const identity = row.reservationKind === "model_call" && row.modelCallId
      ? `${row.workerJobId}:call:${row.modelCallId}`
      : `${row.workerJobId}:reservation:${row.operationKey}`;
    if (!estimateGroups.has(identity)) estimateGroups.set(identity, row.reservedTokens);
    else if (estimateGroups.get(identity) !== row.reservedTokens) estimateConflicts.add(identity);
  }
  const estimateUnknownKeys = new Set([
    ...[...estimateGroups].filter(([, value]) => value === null).map(([key]) => key),
    ...estimateConflicts,
  ]);
  const estimateUnknownCount = estimateUnknownKeys.size;
  const reservedTokenEstimate = estimateGroups.size === 0 || estimateUnknownCount > 0
    ? null
    : [...estimateGroups.values()].reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return {
    scope: input.projectId && input.specId ? "project_spec" as const : input.projectId ? "project" as const : "spec" as const,
    projectId: input.projectId ?? null,
    specId: input.specId ?? null,
    scopeBinding: { status: "UNVERIFIED" as const, reason: "Project/SPEC identity is read from existing job metadata; canonical repository ownership is not dereferenced here." },
    observedJobCount: boundedJobs.length,
    goalCoverage: {
      status: "UNKNOWN" as const,
      baselineCandidateCount: boundedJobs.filter((job) => objectValue(job.inputJson)?.goalBaseline !== undefined).length,
      reason: "No authoritative Goal baseline source is currently linked to canonical jobs; candidate metadata is not treated as a verified baseline.",
    },
    asOf: asOf.toISOString(),
    consistency: "created_at_watermark_live_state" as const,
    usage: {
      ...usage,
      completeTotalTokens: capped ? null : usage.completeTotalTokens,
      coverage: {
        status: capped ? "CAPPED" as const : "PARTIAL" as const,
        reason: capped ? "Aggregation reached a safety bound; complete totals are withheld." : "Aggregate includes only usage linked to canonical jobs and does not imply coverage of unlinked helper/provider calls.",
        sources: ["worker_job_provider_reservations", "llm_inference_attempts"],
        missingSources: ["unlinked_external_helper_calls", "unlinked_provider_usage", "provider_quota_observations"],
      },
    },
    resourceEstimates: {
      observedReservationCount: estimateGroups.size,
      reservedTokenEstimate,
      missingReservationTokenEstimateCount: estimateUnknownCount,
      inferenceCostEstimateMicros: boundedInference.reduce((sum, row) => sum + (row.estimatedCostMicros ?? 0), 0),
      missingInferenceCostEstimateCount: boundedInference.filter((row) => row.estimatedCostMicros === null).length,
      capped,
    },
    quotaCoverage: { status: "UNKNOWN" as const, reason: "No provider quota observation is linked to this aggregate." },
  };
}
