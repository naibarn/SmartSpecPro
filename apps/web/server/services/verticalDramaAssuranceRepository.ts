import { randomUUID } from "node:crypto";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import {
  VerticalDramaAssuranceStateSchema,
  type VerticalDramaAssuranceState,
} from "@shared/verticalDramaSeries/assurance";
import { getDb } from "../db";
import {
  verticalDramaAssuranceAttempts,
  verticalDramaAssuranceEvents,
  verticalDramaStoryGenerationRuns,
  type VerticalDramaAssuranceAttemptRow,
  type VerticalDramaAssuranceEventRow,
  type VerticalDramaStoryGenerationRunRow,
} from "../../drizzle/schema";

export type VerticalDramaAssuranceAdmission = {
  executionId?: string;
  attemptId?: string;
  tenantId: string;
  userId: number;
  surface: string;
  domainTaskKind: string;
  domainOwnerType: string;
  domainOwnerId: string;
  sourceFingerprint: string;
  contextFingerprint: string;
  contractHash: string;
  policyHash: string;
  idempotencyKey: string;
  sourceRevision?: string;
  contextSnapshotId?: string | null;
  contextSnapshotRevision?: number | null;
  runtimeTaskKind?: string | null;
  budget?: Record<string, unknown> | null;
  sideEffectPolicy?: "none" | "candidate_only" | "provider_ready";
};

export type VerticalDramaAssuranceExecution = {
  executionId: string;
  tenantId: string;
  userId: number;
  surface: string;
  domainTaskKind: string;
  domainOwnerType: string;
  domainOwnerId: string;
  sourceFingerprint: string;
  contextFingerprint: string;
  contractHash: string;
  policyHash: string;
  idempotencyKey: string;
  activeAttemptId: string;
  acceptedAttemptId: string | null;
  eventCursor: number;
  fenceToken: number;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  heartbeatAt: Date | null;
  state: VerticalDramaAssuranceState;
  disposition: "verified" | "recovered_needs_repair" | "blocked" | "retryable";
  readiness: "draft" | "verified" | "provider_ready" | "production_ready";
  nextAction: string;
  finalizationKey: string | null;
};

export type VerticalDramaAssuranceAttempt = {
  attemptId: string;
  parentAttemptId: string | null;
  ordinal: number;
  sourceFingerprint: string;
  contextFingerprint: string;
  contractHash: string;
  policyHash: string;
  budget: Record<string, unknown> | null;
  state: VerticalDramaAssuranceState;
  disposition: VerticalDramaAssuranceExecution["disposition"];
  readiness: VerticalDramaAssuranceExecution["readiness"];
  nextAction: string;
  acceptedDomainRef: string | null;
  recoveredDomainRef: string | null;
  reconciliationState: string | null;
};

export type VerticalDramaAssuranceEvent = {
  executionId: string;
  attemptId: string;
  sequence: number;
  eventIdempotencyKey: string;
  previousState: VerticalDramaAssuranceState | null;
  nextState: VerticalDramaAssuranceState;
  reasonCode: string;
  actorClass: string;
  metadata: Record<string, unknown>;
};

const transitions: Record<
  VerticalDramaAssuranceState,
  readonly VerticalDramaAssuranceState[]
> = {
  queued: ["running", "cancelled", "stale", "fatal_failed"],
  running: [
    "succeeded",
    "recovered",
    "awaiting_action",
    "retryable_failed",
    "fatal_failed",
    "cancelled",
    "stale",
    "reconciliation_required",
  ],
  awaiting_action: [],
  succeeded: [],
  recovered: [],
  retryable_failed: [],
  fatal_failed: [],
  cancelled: [],
  stale: [],
  reconciliation_required: [],
};
const childAllowed = new Set<VerticalDramaAssuranceState>([
  "recovered",
  "awaiting_action",
  "retryable_failed",
  "stale",
  "reconciliation_required",
  "succeeded",
]);

function failClosedIdentity(
  input: Pick<
    VerticalDramaAssuranceAdmission,
    "tenantId" | "domainOwnerType" | "domainOwnerId"
  >
): void {
  if (!input.tenantId || !input.domainOwnerType || !input.domainOwnerId)
    throw new Error("VD_ASSURANCE_OWNER_REQUIRED");
}

function admissionKey(input: VerticalDramaAssuranceAdmission): string {
  return [
    input.tenantId,
    input.surface,
    input.domainTaskKind,
    input.sourceFingerprint,
    input.idempotencyKey,
  ].join("|");
}

function projectionFor(
  state: VerticalDramaAssuranceState
): Pick<
  VerticalDramaAssuranceAttempt,
  "disposition" | "readiness" | "nextAction"
> {
  if (state === "succeeded")
    return {
      disposition: "verified",
      readiness: "verified",
      nextAction: "continue",
    };
  if (state === "recovered")
    return {
      disposition: "recovered_needs_repair",
      readiness: "draft",
      nextAction: "repair",
    };
  if (state === "reconciliation_required")
    return {
      disposition: "blocked",
      readiness: "draft",
      nextAction: "await_provider_credit_reconciliation",
    };
  if (state === "fatal_failed" || state === "cancelled")
    return {
      disposition: "blocked",
      readiness: "draft",
      nextAction: "inspect",
    };
  return {
    disposition: "retryable",
    readiness: "draft",
    nextAction: state === "running" ? "inspect_progress" : "retry",
  };
}

export interface VerticalDramaAssuranceMemoryRepository {
  admit(
    input: VerticalDramaAssuranceAdmission
  ): Promise<{
    execution: VerticalDramaAssuranceExecution;
    attempt: VerticalDramaAssuranceAttempt;
    deduped: boolean;
  }>;
  createChildAttempt(input: {
    tenantId: string;
    executionId: string;
    parentAttemptId: string;
    attemptId?: string;
  }): Promise<VerticalDramaAssuranceAttempt>;
  getExecution(
    tenantId: string,
    executionId: string,
    domainOwnerType: string,
    domainOwnerId: string
  ): Promise<VerticalDramaAssuranceExecution | null>;
  events(
    tenantId: string,
    executionId: string
  ): Promise<VerticalDramaAssuranceEvent[]>;
  append(input: {
    tenantId: string;
    executionId: string;
    attemptId: string;
    expectedFenceToken: number;
    eventIdempotencyKey: string;
    nextState: VerticalDramaAssuranceState;
    reasonCode: string;
    actorClass?: string;
    metadata?: Record<string, unknown>;
  }): Promise<VerticalDramaAssuranceEvent>;
  claimLease(input: {
    tenantId: string;
    executionId: string;
    workerId: string;
    now?: Date;
    leaseMs?: number;
  }): Promise<
    | { ok: true; fenceToken: number; leaseExpiresAt: Date }
    | { ok: false; reason: "lease_held" | "not_found" }
  >;
  renewLease(input: {
    tenantId: string;
    executionId: string;
    attemptId: string;
    workerId: string;
    expectedFenceToken: number;
    now?: Date;
    leaseMs?: number;
  }): Promise<boolean>;
  finalize(input: {
    tenantId: string;
    executionId: string;
    attemptId: string;
    expectedFenceToken: number;
    finalizationKey: string;
    activate: () => Promise<
      | { kind: "accepted"; domainRef: string }
      | { kind: "stale"; reasonCode: string }
    >;
  }): Promise<{
    state: VerticalDramaAssuranceState;
    acceptedDomainRef: string | null;
  }>;
}

/**
 * Deterministic transaction model used by focused tests and by callers that
 * need to prove protocol behavior without a provider, Redis, or credit call.
 * The SQL schema is the production durability contract; Sections 03/04 wire
 * this protocol to the existing transaction/domain adapters.
 */
export function createVerticalDramaAssuranceMemoryRepository(): VerticalDramaAssuranceMemoryRepository {
  const executions = new Map<string, VerticalDramaAssuranceExecution>();
  const attempts = new Map<string, VerticalDramaAssuranceAttempt[]>();
  const eventLists = new Map<string, VerticalDramaAssuranceEvent[]>();
  const keyFor = (tenantId: string, executionId: string) =>
    `${tenantId}|${executionId}`;

  const get = (tenantId: string, executionId: string) =>
    executions.get(keyFor(tenantId, executionId)) ?? null;
  const getAttempt = (
    execution: VerticalDramaAssuranceExecution,
    attemptId: string
  ) =>
    attempts
      .get(keyFor(execution.tenantId, execution.executionId))
      ?.find(attempt => attempt.attemptId === attemptId) ?? null;

  const append = async (
    input: Parameters<VerticalDramaAssuranceMemoryRepository["append"]>[0]
  ): Promise<VerticalDramaAssuranceEvent> => {
    const execution = get(input.tenantId, input.executionId);
    if (!execution || execution.activeAttemptId !== input.attemptId)
      throw new Error("VD_ASSURANCE_SCOPE_NOT_FOUND");
    if (execution.fenceToken !== input.expectedFenceToken)
      throw new Error("VD_ASSURANCE_LEASE_LOST");
    const list =
      eventLists.get(keyFor(input.tenantId, input.executionId)) ?? [];
    const duplicate = list.find(
      event => event.eventIdempotencyKey === input.eventIdempotencyKey
    );
    if (duplicate) return duplicate;
    const attempt = getAttempt(execution, input.attemptId);
    if (!attempt || !transitions[attempt.state].includes(input.nextState))
      throw new Error("VD_ASSURANCE_TRANSITION_INVALID");
    const event: VerticalDramaAssuranceEvent = {
      executionId: execution.executionId,
      attemptId: input.attemptId,
      sequence: execution.eventCursor + 1,
      eventIdempotencyKey: input.eventIdempotencyKey,
      previousState: attempt.state,
      nextState: input.nextState,
      reasonCode: input.reasonCode,
      actorClass: input.actorClass ?? "worker",
      metadata: input.metadata ?? {},
    };
    const projection = projectionFor(input.nextState);
    attempt.state = input.nextState;
    attempt.disposition = projection.disposition;
    attempt.readiness = projection.readiness;
    attempt.nextAction = projection.nextAction;
    execution.state = input.nextState;
    execution.disposition = projection.disposition;
    execution.readiness = projection.readiness;
    execution.nextAction = projection.nextAction;
    execution.eventCursor = event.sequence;
    eventLists.set(keyFor(input.tenantId, input.executionId), [...list, event]);
    return event;
  };

  return {
    async admit(input) {
      failClosedIdentity(input);
      const existing = [...executions.values()].find(
        execution => admissionKey(execution) === admissionKey(input)
      );
      if (existing) {
        if (
          existing.contextFingerprint !== input.contextFingerprint ||
          existing.contractHash !== input.contractHash ||
          existing.policyHash !== input.policyHash ||
          existing.domainOwnerType !== input.domainOwnerType ||
          existing.domainOwnerId !== input.domainOwnerId
        )
          throw new Error("VD_ASSURANCE_IDEMPOTENCY_SCOPE_CONFLICT");
        const attempt = getAttempt(existing, existing.activeAttemptId);
        if (!attempt) throw new Error("VD_ASSURANCE_ATTEMPT_MISSING");
        return { execution: existing, attempt, deduped: true };
      }
      const executionId = input.executionId ?? randomUUID();
      const attemptId = input.attemptId ?? randomUUID();
      const projection = projectionFor("queued");
      const execution: VerticalDramaAssuranceExecution = {
        ...input,
        executionId,
        activeAttemptId: attemptId,
        acceptedAttemptId: null,
        eventCursor: 1,
        fenceToken: 0,
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        state: "queued",
        finalizationKey: null,
        ...projection,
      };
      const attempt: VerticalDramaAssuranceAttempt = {
        attemptId,
        parentAttemptId: null,
        ordinal: 1,
        sourceFingerprint: input.sourceFingerprint,
        contextFingerprint: input.contextFingerprint,
        contractHash: input.contractHash,
        policyHash: input.policyHash,
        budget: input.budget ?? null,
        state: "queued",
        acceptedDomainRef: null,
        recoveredDomainRef: null,
        reconciliationState: null,
        ...projection,
      };
      executions.set(keyFor(input.tenantId, executionId), execution);
      attempts.set(keyFor(input.tenantId, executionId), [attempt]);
      eventLists.set(keyFor(input.tenantId, executionId), [
        {
          executionId,
          attemptId,
          sequence: 1,
          eventIdempotencyKey: `admitted:${input.idempotencyKey}`,
          previousState: null,
          nextState: "queued",
          reasonCode: "admitted",
          actorClass: "admission",
          metadata: {},
        },
      ]);
      return { execution, attempt, deduped: false };
    },
    async createChildAttempt(input) {
      const execution = get(input.tenantId, input.executionId);
      if (!execution) throw new Error("VD_ASSURANCE_SCOPE_NOT_FOUND");
      const parent = getAttempt(execution, input.parentAttemptId);
      if (!parent || !childAllowed.has(parent.state))
        throw new Error("VD_ASSURANCE_CHILD_ADMISSION_INVALID");
      const list = attempts.get(keyFor(input.tenantId, input.executionId))!;
      const attempt: VerticalDramaAssuranceAttempt = {
        ...parent,
        attemptId: input.attemptId ?? randomUUID(),
        parentAttemptId: parent.attemptId,
        ordinal: list.length + 1,
        state: "queued",
        acceptedDomainRef: null,
        recoveredDomainRef: null,
        reconciliationState: null,
        ...projectionFor("queued"),
      };
      list.push(attempt);
      execution.activeAttemptId = attempt.attemptId;
      execution.state = "queued";
      Object.assign(execution, projectionFor("queued"));
      return attempt;
    },
    async getExecution(tenantId, executionId, domainOwnerType, domainOwnerId) {
      const execution = get(tenantId, executionId);
      return execution?.domainOwnerType === domainOwnerType &&
        execution.domainOwnerId === domainOwnerId
        ? execution
        : null;
    },
    async events(tenantId, executionId) {
      return [...(eventLists.get(keyFor(tenantId, executionId)) ?? [])];
    },
    append,
    async claimLease(input) {
      const execution = get(input.tenantId, input.executionId);
      if (!execution)
        return { ok: false as const, reason: "not_found" as const };
      const now = input.now ?? new Date();
      if (
        execution.leaseExpiresAt &&
        execution.leaseExpiresAt.getTime() > now.getTime()
      )
        return { ok: false as const, reason: "lease_held" as const };
      execution.fenceToken += 1;
      execution.leaseOwner = input.workerId;
      execution.heartbeatAt = now;
      execution.leaseExpiresAt = new Date(
        now.getTime() + (input.leaseMs ?? 60_000)
      );
      return {
        ok: true as const,
        fenceToken: execution.fenceToken,
        leaseExpiresAt: execution.leaseExpiresAt,
      };
    },
    async renewLease(input) {
      const execution = get(input.tenantId, input.executionId);
      const now = input.now ?? new Date();
      if (
        !execution ||
        execution.activeAttemptId !== input.attemptId ||
        execution.leaseOwner !== input.workerId ||
        execution.fenceToken !== input.expectedFenceToken ||
        !execution.leaseExpiresAt ||
        execution.leaseExpiresAt <= now
      )
        return false;
      execution.heartbeatAt = now;
      execution.leaseExpiresAt = new Date(
        now.getTime() + (input.leaseMs ?? 60_000)
      );
      return true;
    },
    async finalize(input) {
      const execution = get(input.tenantId, input.executionId);
      if (
        !execution ||
        execution.activeAttemptId !== input.attemptId ||
        execution.fenceToken !== input.expectedFenceToken
      )
        throw new Error("VD_ASSURANCE_LEASE_LOST");
      const attempt = getAttempt(execution, input.attemptId);
      if (!attempt) throw new Error("VD_ASSURANCE_SCOPE_NOT_FOUND");
      if (execution.finalizationKey === input.finalizationKey)
        return {
          state: attempt.state,
          acceptedDomainRef: attempt.acceptedDomainRef,
        };
      const activation = await input.activate();
      execution.finalizationKey = input.finalizationKey;
      if (activation.kind === "stale") {
        await append({
          tenantId: input.tenantId,
          executionId: input.executionId,
          attemptId: input.attemptId,
          expectedFenceToken: input.expectedFenceToken,
          eventIdempotencyKey: `finalize:${input.finalizationKey}`,
          nextState: "stale",
          reasonCode: activation.reasonCode,
          actorClass: "finalizer",
        });
        return { state: "stale", acceptedDomainRef: null };
      }
      await append({
        tenantId: input.tenantId,
        executionId: input.executionId,
        attemptId: input.attemptId,
        expectedFenceToken: input.expectedFenceToken,
        eventIdempotencyKey: `finalize:${input.finalizationKey}`,
        nextState: "succeeded",
        reasonCode: "accepted",
        actorClass: "finalizer",
      });
      attempt.acceptedDomainRef = activation.domainRef;
      execution.acceptedAttemptId = attempt.attemptId;
      return { state: "succeeded", acceptedDomainRef: activation.domainRef };
    },
  };
}

function executionFromRow(row: VerticalDramaStoryGenerationRunRow): VerticalDramaAssuranceExecution {
  if (!row.surface || !row.domainOwnerType || !row.domainOwnerId || !row.contextFingerprint || !row.assuranceState || !row.disposition || !row.readiness || !row.nextAction || !row.activeAttemptId) {
    throw new Error("VD_ASSURANCE_DURABLE_ROW_INCOMPLETE");
  }
  return {
    executionId: row.runId,
    tenantId: row.tenantId,
    userId: row.userId,
    surface: row.surface,
    domainTaskKind: row.taskKind,
    domainOwnerType: row.domainOwnerType,
    domainOwnerId: row.domainOwnerId,
    sourceFingerprint: row.sourceFingerprint,
    contextFingerprint: row.contextFingerprint,
    contractHash: row.contractHash,
    policyHash: row.contractJson && typeof row.contractJson === "object" && "policyHash" in row.contractJson
      ? String((row.contractJson as Record<string, unknown>).policyHash)
      : "",
    idempotencyKey: row.idempotencyKey,
    activeAttemptId: row.activeAttemptId,
    acceptedAttemptId: row.acceptedAttemptId,
    eventCursor: row.eventCursor,
    fenceToken: row.fenceToken,
    leaseOwner: row.leaseOwner,
    leaseExpiresAt: row.leaseExpiresAt,
    heartbeatAt: row.heartbeatAt,
    state: parseVerticalDramaAssuranceState(row.assuranceState),
    disposition: row.disposition as VerticalDramaAssuranceExecution["disposition"],
    readiness: row.readiness as VerticalDramaAssuranceExecution["readiness"],
    nextAction: row.nextAction,
    finalizationKey: row.finalizationKey,
  };
}

function attemptFromRow(row: VerticalDramaAssuranceAttemptRow): VerticalDramaAssuranceAttempt {
  return {
    attemptId: row.attemptId,
    parentAttemptId: row.parentAttemptId,
    ordinal: row.ordinal,
    sourceFingerprint: row.sourceFingerprint,
    contextFingerprint: row.contextFingerprint ?? "",
    contractHash: row.contractHash,
    policyHash: row.policyHash,
    budget: (row.budgetJson as Record<string, unknown> | null) ?? null,
    state: parseVerticalDramaAssuranceState(row.state),
    disposition: row.disposition as VerticalDramaAssuranceAttempt["disposition"],
    readiness: row.readiness as VerticalDramaAssuranceAttempt["readiness"],
    nextAction: row.nextAction ?? "inspect",
    acceptedDomainRef: row.acceptedDomainRef,
    recoveredDomainRef: row.recoveredDomainRef,
    reconciliationState: row.reconciliationState,
  };
}

function eventFromRow(row: VerticalDramaAssuranceEventRow): VerticalDramaAssuranceEvent {
  return {
    executionId: row.executionId,
    attemptId: row.attemptId,
    sequence: row.sequence,
    eventIdempotencyKey: row.eventIdempotencyKey,
    previousState: row.previousState ? parseVerticalDramaAssuranceState(row.previousState) : null,
    nextState: parseVerticalDramaAssuranceState(row.nextState),
    reasonCode: row.reasonCode,
    actorClass: row.actorClass,
    metadata: (row.metadataJson as Record<string, unknown>) ?? {},
  };
}

/**
 * Production repository. The memory repository above is intentionally kept for
 * protocol tests; runtime callers must use this adapter so Redis/process loss
 * cannot lose the authoritative attempt, fence, or event cursor.
 */
export function createVerticalDramaAssuranceDrizzleRepository(): VerticalDramaAssuranceMemoryRepository {
  const db = getDb();
  const findExecutionRow = async (tenantId: string, executionId: string) => {
    const [row] = await db.select().from(verticalDramaStoryGenerationRuns).where(and(
      eq(verticalDramaStoryGenerationRuns.tenantId, tenantId),
      eq(verticalDramaStoryGenerationRuns.runId, executionId),
    )).limit(1);
    return row ?? null;
  };
  const findAttemptRow = async (executionRowId: number, attemptId: string) => {
    const [row] = await db.select().from(verticalDramaAssuranceAttempts).where(and(
      eq(verticalDramaAssuranceAttempts.executionRowId, executionRowId),
      eq(verticalDramaAssuranceAttempts.attemptId, attemptId),
    )).limit(1);
    return row ?? null;
  };
  const projection = (state: VerticalDramaAssuranceState) => projectionFor(state);

  const appendInTransaction = async (tx: any, input: Parameters<VerticalDramaAssuranceMemoryRepository["append"]>[0]) => {
    const [run] = await tx.select().from(verticalDramaStoryGenerationRuns).where(and(
      eq(verticalDramaStoryGenerationRuns.tenantId, input.tenantId),
      eq(verticalDramaStoryGenerationRuns.runId, input.executionId),
    )).for("update").limit(1);
    if (!run || run.activeAttemptId !== input.attemptId) throw new Error("VD_ASSURANCE_SCOPE_NOT_FOUND");
    if (run.fenceToken !== input.expectedFenceToken) throw new Error("VD_ASSURANCE_LEASE_LOST");
    const [duplicate] = await tx.select().from(verticalDramaAssuranceEvents).where(and(
      eq(verticalDramaAssuranceEvents.tenantId, input.tenantId),
      eq(verticalDramaAssuranceEvents.executionRowId, run.id),
      eq(verticalDramaAssuranceEvents.eventIdempotencyKey, input.eventIdempotencyKey),
    )).limit(1);
    if (duplicate) return eventFromRow(duplicate);
    const [attempt] = await tx.select().from(verticalDramaAssuranceAttempts).where(and(
      eq(verticalDramaAssuranceAttempts.executionRowId, run.id),
      eq(verticalDramaAssuranceAttempts.attemptId, input.attemptId),
    )).for("update").limit(1);
    if (!attempt || !transitions[parseVerticalDramaAssuranceState(attempt.state)].includes(input.nextState)) throw new Error("VD_ASSURANCE_TRANSITION_INVALID");
    const next = projection(input.nextState);
    const sequence = run.eventCursor + 1;
    const [event] = await tx.insert(verticalDramaAssuranceEvents).values({
      tenantId: input.tenantId, executionRowId: run.id, executionId: input.executionId,
      attemptId: input.attemptId, sequence, eventIdempotencyKey: input.eventIdempotencyKey,
      previousState: attempt.state, nextState: input.nextState, reasonCode: input.reasonCode,
      actorClass: input.actorClass ?? "worker", metadataJson: input.metadata ?? {},
    }).returning();
    if (!event) throw new Error("VD_ASSURANCE_EVENT_INSERT_FAILED");
    await tx.update(verticalDramaAssuranceAttempts).set({
      state: input.nextState, disposition: next.disposition, readiness: next.readiness,
      nextAction: next.nextAction, updatedAt: new Date(),
      ...(input.nextState === "succeeded" ? { completedAt: new Date() } : {}),
    }).where(eq(verticalDramaAssuranceAttempts.id, attempt.id));
    await tx.update(verticalDramaStoryGenerationRuns).set({
      assuranceState: input.nextState, disposition: next.disposition, readiness: next.readiness,
      nextAction: next.nextAction, eventCursor: sequence,
      stateVersion: sql`${verticalDramaStoryGenerationRuns.stateVersion} + 1`, updatedAt: new Date(),
      ...(input.nextState === "succeeded" || input.nextState === "recovered" ? { completedAt: new Date() } : {}),
    }).where(eq(verticalDramaStoryGenerationRuns.id, run.id));
    return eventFromRow(event);
  };

  return {
    async admit(input) {
      failClosedIdentity(input);
      const existing = await db.select().from(verticalDramaStoryGenerationRuns).where(and(
        eq(verticalDramaStoryGenerationRuns.tenantId, input.tenantId),
        eq(verticalDramaStoryGenerationRuns.surface, input.surface),
        eq(verticalDramaStoryGenerationRuns.taskKind, input.domainTaskKind),
        eq(verticalDramaStoryGenerationRuns.sourceFingerprint, input.sourceFingerprint),
        eq(verticalDramaStoryGenerationRuns.idempotencyKey, input.idempotencyKey),
      )).limit(1);
      if (existing[0]) {
        const execution = executionFromRow(existing[0]);
        if (execution.contextFingerprint !== input.contextFingerprint || execution.contractHash !== input.contractHash || execution.domainOwnerType !== input.domainOwnerType || execution.domainOwnerId !== input.domainOwnerId) throw new Error("VD_ASSURANCE_IDEMPOTENCY_SCOPE_CONFLICT");
        const attempt = await findAttemptRow(existing[0].id, execution.activeAttemptId);
        if (!attempt) throw new Error("VD_ASSURANCE_ATTEMPT_MISSING");
        return { execution, attempt: attemptFromRow(attempt), deduped: true };
      }
      const executionId = input.executionId ?? randomUUID();
      const attemptId = input.attemptId ?? randomUUID();
      const now = new Date();
      const p = projectionFor("queued");
      try {
        return await db.transaction(async (tx: any) => {
          const [run] = await tx.insert(verticalDramaStoryGenerationRuns).values({
            runId: executionId, tenantId: input.tenantId, userId: input.userId, seriesId: null,
            runKey: executionId, idempotencyKey: input.idempotencyKey, taskKind: input.domainTaskKind,
            status: "queued", stage: "admission", contractVersion: "vd-assurance-v1",
            contractHash: input.contractHash, sourceRevision: input.sourceRevision ?? input.sourceFingerprint,
            sourceFingerprint: input.sourceFingerprint, surface: input.surface,
            domainOwnerType: input.domainOwnerType, domainOwnerId: input.domainOwnerId,
            contextSnapshotId: input.contextSnapshotId ?? null, contextSnapshotRevision: input.contextSnapshotRevision ?? null,
            contextFingerprint: input.contextFingerprint, assuranceState: "queued", disposition: p.disposition,
            readiness: p.readiness, nextAction: p.nextAction, stateVersion: 0, eventCursor: 1,
            activeAttemptId: attemptId, fenceToken: 0, sourceSnapshotJson: { fingerprint: input.sourceFingerprint },
            contractJson: input, updatedAt: now,
          }).returning();
          if (!run) throw new Error("VD_ASSURANCE_RUN_INSERT_FAILED");
          const [attempt] = await tx.insert(verticalDramaAssuranceAttempts).values({
            tenantId: input.tenantId, executionRowId: run.id, executionId, attemptId, ordinal: 1,
            parentAttemptId: null, domainTaskKind: input.domainTaskKind, runtimeTaskKind: input.runtimeTaskKind ?? null,
            sourceRevision: input.sourceRevision ?? null, sourceFingerprint: input.sourceFingerprint,
            contextSnapshotId: input.contextSnapshotId ?? null, contextSnapshotRevision: input.contextSnapshotRevision ?? null,
            contextFingerprint: input.contextFingerprint, contractVersion: "vd-assurance-v1", contractHash: input.contractHash,
            policyHash: input.policyHash, budgetJson: input.budget ?? null, sideEffectPolicy: input.sideEffectPolicy ?? "none",
            state: "queued", disposition: p.disposition, readiness: p.readiness, nextAction: p.nextAction,
          }).returning();
          await tx.insert(verticalDramaAssuranceEvents).values({
            tenantId: input.tenantId, executionRowId: run.id, executionId, attemptId, sequence: 1,
            eventIdempotencyKey: `admitted:${input.idempotencyKey}`, previousState: null, nextState: "queued",
            reasonCode: "admitted", actorClass: "admission", metadataJson: {},
          });
          if (!attempt) throw new Error("VD_ASSURANCE_ATTEMPT_INSERT_FAILED");
          return { execution: executionFromRow(run), attempt: attemptFromRow(attempt), deduped: false };
        });
      } catch (error) {
        const [row] = await db.select().from(verticalDramaStoryGenerationRuns).where(and(eq(verticalDramaStoryGenerationRuns.tenantId, input.tenantId), eq(verticalDramaStoryGenerationRuns.idempotencyKey, input.idempotencyKey))).limit(1);
        if (!row) throw error;
        const execution = executionFromRow(row);
        const attempt = await findAttemptRow(row.id, execution.activeAttemptId);
        if (!attempt) throw new Error("VD_ASSURANCE_ATTEMPT_MISSING");
        return { execution, attempt: attemptFromRow(attempt), deduped: true };
      }
    },
    async createChildAttempt(input) {
      return db.transaction(async (tx: any) => {
        const [run] = await tx.select().from(verticalDramaStoryGenerationRuns).where(and(eq(verticalDramaStoryGenerationRuns.tenantId, input.tenantId), eq(verticalDramaStoryGenerationRuns.runId, input.executionId))).for("update").limit(1);
        if (!run) throw new Error("VD_ASSURANCE_SCOPE_NOT_FOUND");
        const [parent] = await tx.select().from(verticalDramaAssuranceAttempts).where(and(eq(verticalDramaAssuranceAttempts.executionRowId, run.id), eq(verticalDramaAssuranceAttempts.attemptId, input.parentAttemptId))).for("update").limit(1);
        if (!parent || !childAllowed.has(parseVerticalDramaAssuranceState(parent.state))) throw new Error("VD_ASSURANCE_CHILD_ADMISSION_INVALID");
        const [{ count }] = await tx.select({ count: sql<number>`count(*)` }).from(verticalDramaAssuranceAttempts).where(eq(verticalDramaAssuranceAttempts.executionRowId, run.id));
        const childId = input.attemptId ?? randomUUID();
        const [child] = await tx.insert(verticalDramaAssuranceAttempts).values({
          tenantId: input.tenantId, executionRowId: run.id, executionId: input.executionId, attemptId: childId,
          ordinal: Number(count) + 1, parentAttemptId: parent.attemptId, domainTaskKind: parent.domainTaskKind,
          runtimeTaskKind: parent.runtimeTaskKind, sourceRevision: parent.sourceRevision, sourceFingerprint: parent.sourceFingerprint,
          contextSnapshotId: parent.contextSnapshotId, contextSnapshotRevision: parent.contextSnapshotRevision, contextFingerprint: parent.contextFingerprint,
          contractVersion: parent.contractVersion, contractHash: parent.contractHash, outputContractVersion: parent.outputContractVersion,
          rulePackIdsJson: parent.rulePackIdsJson, modelHash: parent.modelHash, policyHash: parent.policyHash,
          compatibilityMode: parent.compatibilityMode, assuranceMode: parent.assuranceMode, budgetJson: parent.budgetJson,
          sideEffectPolicy: parent.sideEffectPolicy, state: "queued", disposition: "retryable", readiness: "draft", nextAction: "retry",
        }).returning();
        if (!child) throw new Error("VD_ASSURANCE_ATTEMPT_INSERT_FAILED");
        await tx.update(verticalDramaStoryGenerationRuns).set({ activeAttemptId: childId, assuranceState: "queued", disposition: "retryable", readiness: "draft", nextAction: "retry", stateVersion: sql`${verticalDramaStoryGenerationRuns.stateVersion} + 1`, updatedAt: new Date() }).where(eq(verticalDramaStoryGenerationRuns.id, run.id));
        return attemptFromRow(child);
      });
    },
    async getExecution(tenantId, executionId, domainOwnerType, domainOwnerId) {
      const row = await findExecutionRow(tenantId, executionId);
      return row && row.domainOwnerType === domainOwnerType && row.domainOwnerId === domainOwnerId ? executionFromRow(row) : null;
    },
    async events(tenantId, executionId) {
      const row = await findExecutionRow(tenantId, executionId);
      if (!row) return [];
      const rows = await db.select().from(verticalDramaAssuranceEvents).where(and(eq(verticalDramaAssuranceEvents.tenantId, tenantId), eq(verticalDramaAssuranceEvents.executionRowId, row.id))).orderBy(verticalDramaAssuranceEvents.sequence);
      return rows.map(eventFromRow);
    },
    async append(input) {
      return db.transaction((tx: any) => appendInTransaction(tx, input));
    },
    async claimLease(input) {
      const now = input.now ?? new Date();
      const [row] = await db.update(verticalDramaStoryGenerationRuns).set({ leaseOwner: input.workerId, leaseExpiresAt: new Date(now.getTime() + (input.leaseMs ?? 60_000)), heartbeatAt: now, fenceToken: sql`${verticalDramaStoryGenerationRuns.fenceToken} + 1`, updatedAt: now }).where(and(eq(verticalDramaStoryGenerationRuns.tenantId, input.tenantId), eq(verticalDramaStoryGenerationRuns.runId, input.executionId), or(isNull(verticalDramaStoryGenerationRuns.leaseExpiresAt), lte(verticalDramaStoryGenerationRuns.leaseExpiresAt, now)))).returning({ fenceToken: verticalDramaStoryGenerationRuns.fenceToken, leaseExpiresAt: verticalDramaStoryGenerationRuns.leaseExpiresAt });
      return row ? { ok: true as const, fenceToken: row.fenceToken, leaseExpiresAt: row.leaseExpiresAt! } : { ok: false as const, reason: "lease_held" as const };
    },
    async renewLease(input) {
      const now = input.now ?? new Date();
      const [row] = await db.update(verticalDramaStoryGenerationRuns).set({ heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + (input.leaseMs ?? 60_000)), updatedAt: now }).where(and(eq(verticalDramaStoryGenerationRuns.tenantId, input.tenantId), eq(verticalDramaStoryGenerationRuns.runId, input.executionId), eq(verticalDramaStoryGenerationRuns.activeAttemptId, input.attemptId), eq(verticalDramaStoryGenerationRuns.leaseOwner, input.workerId), eq(verticalDramaStoryGenerationRuns.fenceToken, input.expectedFenceToken), or(isNull(verticalDramaStoryGenerationRuns.leaseExpiresAt), lte(verticalDramaStoryGenerationRuns.leaseExpiresAt, now)))).returning({ id: verticalDramaStoryGenerationRuns.id });
      return Boolean(row);
    },
    async finalize(input) {
      const row = await findExecutionRow(input.tenantId, input.executionId);
      if (!row || row.activeAttemptId !== input.attemptId || row.fenceToken !== input.expectedFenceToken) throw new Error("VD_ASSURANCE_LEASE_LOST");
      if (row.finalizationKey === input.finalizationKey) return { state: parseVerticalDramaAssuranceState(row.assuranceState), acceptedDomainRef: row.finalArtifactId ? String(row.finalArtifactId) : null };
      const [claimed] = await db.update(verticalDramaStoryGenerationRuns).set({ finalizationKey: input.finalizationKey, updatedAt: new Date() }).where(and(eq(verticalDramaStoryGenerationRuns.id, row.id), isNull(verticalDramaStoryGenerationRuns.finalizationKey), eq(verticalDramaStoryGenerationRuns.fenceToken, input.expectedFenceToken))).returning({ id: verticalDramaStoryGenerationRuns.id });
      if (!claimed) throw new Error("VD_ASSURANCE_FINALIZATION_ALREADY_CLAIMED");
      const activation = await input.activate();
      if (activation.kind === "stale") {
        await db.transaction((tx: any) => appendInTransaction(tx, { tenantId: input.tenantId, executionId: input.executionId, attemptId: input.attemptId, expectedFenceToken: input.expectedFenceToken, eventIdempotencyKey: `finalize:${input.finalizationKey}`, nextState: "stale", reasonCode: activation.reasonCode, actorClass: "finalizer" }));
        return { state: "stale" as const, acceptedDomainRef: null };
      }
      await db.transaction(async (tx: any) => {
        await appendInTransaction(tx, { tenantId: input.tenantId, executionId: input.executionId, attemptId: input.attemptId, expectedFenceToken: input.expectedFenceToken, eventIdempotencyKey: `finalize:${input.finalizationKey}`, nextState: "succeeded", reasonCode: "accepted", actorClass: "finalizer" });
        const [attempt] = await tx.select({ id: verticalDramaAssuranceAttempts.id }).from(verticalDramaAssuranceAttempts).where(and(eq(verticalDramaAssuranceAttempts.executionRowId, row.id), eq(verticalDramaAssuranceAttempts.attemptId, input.attemptId))).limit(1);
        if (attempt) await tx.update(verticalDramaAssuranceAttempts).set({ acceptedDomainRef: activation.domainRef, updatedAt: new Date() }).where(eq(verticalDramaAssuranceAttempts.id, attempt.id));
        await tx.update(verticalDramaStoryGenerationRuns).set({ acceptedAttemptId: input.attemptId, updatedAt: new Date() }).where(eq(verticalDramaStoryGenerationRuns.id, row.id));
      });
      return { state: "succeeded" as const, acceptedDomainRef: activation.domainRef };
    },
  };
}

/** Explicit state parser retained for later database adapters. */
export function parseVerticalDramaAssuranceState(
  value: unknown
): VerticalDramaAssuranceState {
  return VerticalDramaAssuranceStateSchema.parse(value);
}

export type VerticalDramaAssuranceReconciliationCandidate = {
  tenantId: string;
  executionId: string;
  attemptId: string;
  fenceToken: number;
  domainOwnerType: string;
  domainOwnerId: string;
  sourceFingerprint: string;
  contextFingerprint: string;
  state: VerticalDramaAssuranceState;
  errorCode: string | null;
};

/** Bounded database scan used by the reconciler; no Redis state is consulted. */
export async function listExpiredVerticalDramaAssuranceAttempts(
  tenantId: string,
  now = new Date(),
  limit = 50,
): Promise<VerticalDramaAssuranceReconciliationCandidate[]> {
  const database = getDb();
  const rows = await database.select({ attempt: verticalDramaAssuranceAttempts, run: verticalDramaStoryGenerationRuns })
    .from(verticalDramaAssuranceAttempts)
    .innerJoin(verticalDramaStoryGenerationRuns, eq(verticalDramaAssuranceAttempts.executionRowId, verticalDramaStoryGenerationRuns.id))
    .where(and(
      eq(verticalDramaAssuranceAttempts.tenantId, tenantId),
      eq(verticalDramaStoryGenerationRuns.tenantId, tenantId),
      sql`${verticalDramaAssuranceAttempts.state} NOT IN ('succeeded', 'recovered', 'fatal_failed', 'cancelled', 'stale')`,
      or(isNull(verticalDramaStoryGenerationRuns.leaseExpiresAt), lte(verticalDramaStoryGenerationRuns.leaseExpiresAt, now)),
    ))
    .limit(Math.max(1, Math.min(limit, 200)));
  return rows.flatMap(({ attempt, run }) => {
    if (!run.domainOwnerType || !run.domainOwnerId || !run.contextFingerprint) return [];
    return [{
      tenantId,
      executionId: run.runId,
      attemptId: attempt.attemptId,
      fenceToken: run.fenceToken,
      domainOwnerType: run.domainOwnerType,
      domainOwnerId: run.domainOwnerId,
      sourceFingerprint: attempt.sourceFingerprint,
      contextFingerprint: run.contextFingerprint,
      state: parseVerticalDramaAssuranceState(attempt.state),
      errorCode: attempt.errorCode,
    }];
  });
}

/** Claims one reconciliation lease with a new fence; duplicate workers lose the CAS. */
export async function claimVerticalDramaAssuranceReconciliation(input: {
  tenantId: string;
  executionId: string;
  workerId: string;
  now?: Date;
  leaseMs?: number;
}): Promise<{ ok: true; fenceToken: number } | { ok: false }> {
  const database = getDb();
  const now = input.now ?? new Date();
  const [run] = await database.update(verticalDramaStoryGenerationRuns).set({
    leaseOwner: input.workerId,
    leaseExpiresAt: new Date(now.getTime() + (input.leaseMs ?? 60_000)),
    heartbeatAt: now,
    reconciliationState: "claimed",
    fenceToken: sql`${verticalDramaStoryGenerationRuns.fenceToken} + 1`,
    updatedAt: now,
  }).where(and(
    eq(verticalDramaStoryGenerationRuns.tenantId, input.tenantId),
    eq(verticalDramaStoryGenerationRuns.runId, input.executionId),
    or(isNull(verticalDramaStoryGenerationRuns.leaseExpiresAt), lte(verticalDramaStoryGenerationRuns.leaseExpiresAt, now)),
  )).returning({ id: verticalDramaStoryGenerationRuns.id, fenceToken: verticalDramaStoryGenerationRuns.fenceToken });
  if (!run) return { ok: false };
  await database.update(verticalDramaAssuranceAttempts).set({ reconciliationState: "claimed", leaseGenerationObserved: run.fenceToken, updatedAt: now }).where(and(
    eq(verticalDramaAssuranceAttempts.tenantId, input.tenantId),
    eq(verticalDramaAssuranceAttempts.executionRowId, run.id),
  ));
  return { ok: true, fenceToken: run.fenceToken };
}
