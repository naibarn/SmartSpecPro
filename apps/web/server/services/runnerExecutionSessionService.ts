import { and, desc, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getDb } from "../db";
import {
  runnerExecutionSessionEvents,
  runnerExecutionSessions,
  workerJobs,
} from "../../drizzle/schema";
import {
  canTransitionExecutionSession,
  validateExecutionSessionEventPayload,
  validateExecutionSessionProjection,
  validateRunnerSessionInventory,
  validateRunnerExecutionSessionBinding,
  RUNNER_EXECUTION_SESSION_CONTRACT,
  type ExecutionSessionProjectionInput,
  type ExecutionSessionState,
  type RunnerExecutionSessionBinding,
  type RunnerSessionInventoryCandidate,
} from "./runnerExecutionSessionContracts";

export interface ExecutionSessionEventInput {
  idempotencyKey: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export type SafeTaskControlSessionProjection = {
  contractVersion: typeof RUNNER_EXECUTION_SESSION_CONTRACT;
  sessionId: string;
  generation: number;
  state: "unknown";
  continuityClass: string;
  enforcementLevel: string;
  driverId: string;
  observedAt: string | null;
};

const terminalJobStates = new Set([
  "completed",
  "succeeded",
  "failed",
  "canceled",
  "cancelled",
  "expired",
]);
const terminalProjectionByJobStatus: Record<string, ExecutionSessionState> = {
  completed: "completed",
  succeeded: "completed",
  failed: "failed",
  canceled: "cancelled",
  cancelled: "cancelled",
  expired: "failed",
};

export function matchingTerminalExecutionSessionState(
  jobStatus: string
): ExecutionSessionState | null {
  return terminalProjectionByJobStatus[jobStatus] ?? null;
}

function projectionEnabled(): boolean {
  return process.env.SMARTAIHUB_SPEC278_SESSION_PROJECTION === "true";
}

/** Return only a tenant/user-owned session summary. Persisted projections do
 * not prove current process liveness, so Task Control must report `unknown`.
 */
export async function getSafeTaskControlSessionProjection(input: {
  tenantId: string;
  userId: number;
  workerJobId: string;
}): Promise<SafeTaskControlSessionProjection | null> {
  if (!projectionEnabled()) return null;
  const db = getDb();
  const [row] = await db
    .select({
      sessionId: runnerExecutionSessions.sessionId,
      generation: runnerExecutionSessions.generation,
      continuityClass: runnerExecutionSessions.continuityClass,
      enforcementLevel: runnerExecutionSessions.enforcementLevel,
      driverId: runnerExecutionSessions.driverId,
      observedAt: runnerExecutionSessions.observedAt,
    })
    .from(runnerExecutionSessions)
    .innerJoin(
      workerJobs,
      and(
        eq(workerJobs.id, runnerExecutionSessions.workerJobId),
        eq(workerJobs.tenantId, runnerExecutionSessions.tenantId),
        eq(workerJobs.requestedByUserId, input.userId)
      )
    )
    .where(
      and(
        eq(runnerExecutionSessions.workerJobId, input.workerJobId),
        eq(runnerExecutionSessions.tenantId, input.tenantId)
      )
    )
    .orderBy(desc(runnerExecutionSessions.generation))
    .limit(1);
  if (!row) return null;
  return {
    contractVersion: RUNNER_EXECUTION_SESSION_CONTRACT,
    ...row,
    state: "unknown",
    observedAt: row.observedAt?.toISOString() ?? null,
  };
}

function validateEvent(event: ExecutionSessionEventInput): string | null {
  if (
    !event.idempotencyKey.trim() ||
    event.idempotencyKey.length > 200 ||
    !event.eventType.trim() ||
    event.eventType.length > 100
  ) {
    return "RUNNER_SESSION_EVENT_IDENTITY_INVALID";
  }
  return validateExecutionSessionEventPayload(event.payload);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right)
    );
    return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * Persist the M0 shadow projection and its first event. The flag is deliberately
 * off by default and this method never creates or changes a worker job.
 */
export async function createExecutionSessionProjection(
  input: ExecutionSessionProjectionInput,
  event: ExecutionSessionEventInput
) {
  if (!projectionEnabled()) return null;
  const invalidProjection = validateExecutionSessionProjection(input);
  if (invalidProjection) throw new Error(invalidProjection);
  const invalidEvent = validateEvent(event);
  if (invalidEvent) throw new Error(invalidEvent);

  const db = getDb();
  return db.transaction(async tx => {
    const [job] = await tx
      .select({
        id: workerJobs.id,
        status: workerJobs.status,
        attempt: workerJobs.attempt,
        fencingVersion: workerJobs.fencingVersion,
      })
      .from(workerJobs)
      .where(
        and(
          eq(workerJobs.id, input.workerJobId),
          eq(workerJobs.tenantId, input.tenantId)
        )
      )
      .limit(1)
      .for("update");
    if (!job) throw new Error("RUNNER_SESSION_JOB_NOT_FOUND");
    if (terminalJobStates.has(job.status)) {
      if (matchingTerminalExecutionSessionState(job.status) !== input.state)
        throw new Error("RUNNER_SESSION_JOB_TERMINAL");
    }
    if (
      job.attempt !== input.workerJobAttempt ||
      job.fencingVersion !== input.leaseFencingVersion
    ) {
      throw new Error("RUNNER_SESSION_CANONICAL_JOB_FENCE_MISMATCH");
    }

    const [existing] = await tx
      .select()
      .from(runnerExecutionSessions)
      .where(eq(runnerExecutionSessions.sessionId, input.sessionId))
      .limit(1)
      .for("update");
    if (existing) {
      const sameIdentity =
        existing.tenantId === input.tenantId &&
        existing.workerJobId === input.workerJobId &&
        existing.generation === input.generation;
      if (!sameIdentity) throw new Error("RUNNER_SESSION_ID_CONFLICT");
      const [priorEvent] = await tx
        .select()
        .from(runnerExecutionSessionEvents)
        .where(
          and(
            eq(runnerExecutionSessionEvents.sessionId, input.sessionId),
            eq(
              runnerExecutionSessionEvents.idempotencyKey,
              event.idempotencyKey
            )
          )
        )
        .limit(1);
      if (
        !priorEvent ||
        priorEvent.eventType !== event.eventType ||
        stableJson(priorEvent.payloadJson) !== stableJson(event.payload)
      ) {
        throw new Error("RUNNER_SESSION_CREATE_REPLAY_CONFLICT");
      }
      return existing;
    }

    const [created] = await tx
      .insert(runnerExecutionSessions)
      .values({
        sessionId: input.sessionId,
        tenantId: input.tenantId,
        workerJobId: input.workerJobId,
        workerJobAttempt: input.workerJobAttempt,
        leaseFencingVersion: input.leaseFencingVersion,
        runnerId: input.runnerId ?? null,
        generation: input.generation,
        authorityEpoch: input.authorityEpoch ?? 0,
        placementEpoch: input.placementEpoch ?? 0,
        jobControlRevision: input.jobControlRevision,
        state: input.state,
        desiredState: input.desiredState,
        continuityClass: input.continuityClass,
        enforcementLevel: input.enforcementLevel,
        driverId: input.driverId,
        driverVersion: input.driverVersion ?? null,
      })
      .returning();
    await tx.insert(runnerExecutionSessionEvents).values({
      sessionId: input.sessionId,
      tenantId: input.tenantId,
      sequence: 1,
      idempotencyKey: event.idempotencyKey,
      eventType: event.eventType,
      payloadJson: event.payload,
    });
    return created;
  });
}

/** Project an already durable canonical Runner receipt into the observational
 * session row. Canonical job receipt persistence always happens first; a
 * projection failure must never change its acknowledgement or job authority.
 */
export async function projectRunnerReceiptToExecutionSession(input: {
  tenantId: string;
  runnerId: string;
  receipt: {
    jobId: string;
    commandId: string;
    eventId: string;
    eventType: string;
    sequence: number;
    payload?: Record<string, unknown>;
  };
}) {
  if (!projectionEnabled()) return null;
  const rawBinding = input.receipt.payload?.executionSession;
  if (rawBinding === undefined) return null;
  const payload = input.receipt.payload ?? {};
  const binding = rawBinding as RunnerExecutionSessionBinding;
  const invalid = validateRunnerExecutionSessionBinding(rawBinding, {
    executionKind: "external_agent_task",
    jobId: input.receipt.jobId,
    attempt: payload.attempt as number,
    fencingToken: payload.fenceVersion as number,
    tenantId: input.tenantId,
    runnerId: input.runnerId,
  });
  if (invalid) throw new Error(invalid);

  const nextState: Partial<Record<string, ExecutionSessionState>> = {
    EXECUTION_STARTED: "running",
    EXECUTION_COMPLETED: "completed",
    EXECUTION_FAILED: "failed",
    CANCEL_ACKNOWLEDGED: "cancelled",
    UNKNOWN_OUTCOME: "unknown",
    COMMAND_REJECTED: "failed",
  };
  const state = nextState[input.receipt.eventType];
  if (!state) return null;

  const db = getDb();
  const [session] = await db
    .select({
      workerJobId: runnerExecutionSessions.workerJobId,
      workerJobAttempt: runnerExecutionSessions.workerJobAttempt,
      leaseFencingVersion: runnerExecutionSessions.leaseFencingVersion,
      runnerId: runnerExecutionSessions.runnerId,
      jobControlRevision: runnerExecutionSessions.jobControlRevision,
    })
    .from(runnerExecutionSessions)
    .where(
      and(
        eq(runnerExecutionSessions.sessionId, binding.sessionId),
        eq(runnerExecutionSessions.tenantId, input.tenantId)
      )
    )
    .limit(1);
  if (
    !session ||
    session.workerJobId !== input.receipt.jobId ||
    session.workerJobAttempt !== binding.workerJobAttempt ||
    session.leaseFencingVersion !== binding.leaseFencingVersion ||
    session.runnerId !== input.runnerId
  ) {
    throw new Error("RUNNER_SESSION_RECEIPT_BINDING_MISMATCH");
  }

  const receiptKey = createHash("sha256")
    .update(`${input.receipt.commandId}\0${input.receipt.eventId}`)
    .digest("hex");
  return transitionExecutionSessionProjection({
    sessionId: binding.sessionId,
    tenantId: input.tenantId,
    expectedRevision: session.jobControlRevision,
    nextState: state,
    event: {
      idempotencyKey: `spec278:runner_receipt:${receiptKey}`,
      eventType: `runner_receipt_${input.receipt.eventType.toLowerCase()}`,
      payload: {
        commandId: input.receipt.commandId,
        eventId: input.receipt.eventId,
        sequence: input.receipt.sequence,
      },
    },
  });
}

/** Transition a shadow projection with an expected revision and atomic event. */
export async function transitionExecutionSessionProjection(input: {
  sessionId: string;
  tenantId: string;
  expectedRevision: number;
  nextState: ExecutionSessionState;
  event: ExecutionSessionEventInput;
}) {
  if (!projectionEnabled()) return null;
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 1
  ) {
    throw new Error("RUNNER_SESSION_REVISION_INVALID");
  }
  const invalidEvent = validateEvent(input.event);
  if (invalidEvent) throw new Error(invalidEvent);

  const db = getDb();
  return db.transaction(async tx => {
    const [sessionSnapshot] = await tx
      .select()
      .from(runnerExecutionSessions)
      .where(
        and(
          eq(runnerExecutionSessions.sessionId, input.sessionId),
          eq(runnerExecutionSessions.tenantId, input.tenantId)
        )
      )
      .limit(1);
    if (!sessionSnapshot) throw new Error("RUNNER_SESSION_NOT_FOUND");

    // Keep lock order consistent with projection creation: canonical job, then session.
    const [job] = await tx
      .select({
        status: workerJobs.status,
        attempt: workerJobs.attempt,
        fencingVersion: workerJobs.fencingVersion,
        leaseExpiresAt: workerJobs.leaseExpiresAt,
      })
      .from(workerJobs)
      .where(
        and(
          eq(workerJobs.id, sessionSnapshot.workerJobId),
          eq(workerJobs.tenantId, input.tenantId)
        )
      )
      .limit(1)
      .for("update");
    if (!job) throw new Error("RUNNER_SESSION_JOB_NOT_FOUND");

    const [session] = await tx
      .select()
      .from(runnerExecutionSessions)
      .where(
        and(
          eq(runnerExecutionSessions.sessionId, input.sessionId),
          eq(runnerExecutionSessions.tenantId, input.tenantId)
        )
      )
      .limit(1)
      .for("update");
    if (!session || session.workerJobId !== sessionSnapshot.workerJobId) {
      throw new Error("RUNNER_SESSION_NOT_FOUND");
    }

    const [priorEvent] = await tx
      .select()
      .from(runnerExecutionSessionEvents)
      .where(
        and(
          eq(runnerExecutionSessionEvents.sessionId, input.sessionId),
          eq(
            runnerExecutionSessionEvents.idempotencyKey,
            input.event.idempotencyKey
          )
        )
      )
      .limit(1);
    if (priorEvent) {
      if (
        priorEvent.eventType !== input.event.eventType ||
        stableJson(priorEvent.payloadJson) !== stableJson(input.event.payload)
      ) {
        throw new Error("RUNNER_SESSION_EVENT_IDEMPOTENCY_CONFLICT");
      }
      return session;
    }

    if (session.jobControlRevision !== input.expectedRevision) {
      throw new Error("RUNNER_SESSION_STALE_CONTROL_REVISION");
    }
    if (
      !canTransitionExecutionSession(
        session.state as ExecutionSessionState,
        input.nextState
      )
    ) {
      throw new Error("RUNNER_SESSION_TRANSITION_INVALID");
    }
    if (!Number.isSafeInteger(input.expectedRevision + 1)) {
      throw new Error("RUNNER_SESSION_REVISION_EXHAUSTED");
    }

    if (
      terminalJobStates.has(job.status) &&
      matchingTerminalExecutionSessionState(job.status) !== input.nextState
    )
      throw new Error("RUNNER_SESSION_JOB_TERMINAL");
    if (
      job.attempt !== session.workerJobAttempt ||
      job.fencingVersion !== session.leaseFencingVersion
    ) {
      throw new Error("RUNNER_SESSION_CANONICAL_JOB_FENCE_MISMATCH");
    }
    if (
      input.nextState === "running" &&
      (!job.leaseExpiresAt || job.leaseExpiresAt.getTime() <= Date.now())
    ) {
      throw new Error("RUNNER_SESSION_JOB_LEASE_EXPIRED");
    }

    const [latestEvent] = await tx
      .select({ sequence: runnerExecutionSessionEvents.sequence })
      .from(runnerExecutionSessionEvents)
      .where(eq(runnerExecutionSessionEvents.sessionId, input.sessionId))
      .orderBy(desc(runnerExecutionSessionEvents.sequence))
      .limit(1);
    const nextRevision = input.expectedRevision + 1;
    const [updated] = await tx
      .update(runnerExecutionSessions)
      .set({
        state: input.nextState,
        jobControlRevision: nextRevision,
        observedAt: new Date(),
        terminalAt: ["completed", "failed", "cancelled"].includes(
          input.nextState
        )
          ? new Date()
          : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(runnerExecutionSessions.sessionId, input.sessionId),
          eq(runnerExecutionSessions.tenantId, input.tenantId),
          eq(runnerExecutionSessions.jobControlRevision, input.expectedRevision)
        )
      )
      .returning();
    if (!updated) throw new Error("RUNNER_SESSION_STALE_CONTROL_REVISION");

    await tx.insert(runnerExecutionSessionEvents).values({
      sessionId: input.sessionId,
      tenantId: input.tenantId,
      sequence: (latestEvent?.sequence ?? 0) + 1,
      idempotencyKey: input.event.idempotencyKey,
      eventType: input.event.eventType,
      payloadJson: input.event.payload,
    });
    return updated;
  });
}

/** Serialize competing recovery adopters on the canonical job row. Adoption
 * only records a fenced recovery owner; it never grants mutation authority.
 */
export async function adoptExecutionSessionProjection(input: {
  sessionId: string;
  tenantId: string;
  workerJobId: string;
  runnerId: string;
  expectedRevision: number;
  expectedAuthorityEpoch: number;
  expectedWorkerJobAttempt: number;
  expectedLeaseFencingVersion: number;
  event: ExecutionSessionEventInput;
}) {
  if (!projectionEnabled()) return null;
  for (const value of [
    input.expectedRevision,
    input.expectedAuthorityEpoch,
    input.expectedWorkerJobAttempt,
    input.expectedLeaseFencingVersion,
  ]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error("RUNNER_SESSION_RECOVERY_FENCE_INVALID");
    }
  }
  if (
    input.expectedRevision < 1 ||
    input.expectedWorkerJobAttempt < 1 ||
    !input.runnerId.trim() ||
    input.runnerId.length > 160
  ) {
    throw new Error("RUNNER_SESSION_RECOVERY_IDENTITY_INVALID");
  }
  const invalidEvent = validateEvent(input.event);
  if (invalidEvent) throw new Error(invalidEvent);

  const db = getDb();
  return db.transaction(async tx => {
    const [job] = await tx
      .select({
        id: workerJobs.id,
        status: workerJobs.status,
        attempt: workerJobs.attempt,
        fencingVersion: workerJobs.fencingVersion,
        leaseExpiresAt: workerJobs.leaseExpiresAt,
      })
      .from(workerJobs)
      .where(
        and(
          eq(workerJobs.id, input.workerJobId),
          eq(workerJobs.tenantId, input.tenantId)
        )
      )
      .limit(1)
      .for("update");
    if (!job) throw new Error("RUNNER_SESSION_JOB_NOT_FOUND");
    if (terminalJobStates.has(job.status))
      throw new Error("RUNNER_SESSION_JOB_TERMINAL");
    if (
      job.attempt !== input.expectedWorkerJobAttempt ||
      job.fencingVersion !== input.expectedLeaseFencingVersion ||
      !job.leaseExpiresAt ||
      job.leaseExpiresAt.getTime() <= Date.now()
    ) {
      throw new Error("RUNNER_SESSION_CANONICAL_JOB_FENCE_MISMATCH");
    }

    const [session] = await tx
      .select()
      .from(runnerExecutionSessions)
      .where(
        and(
          eq(runnerExecutionSessions.sessionId, input.sessionId),
          eq(runnerExecutionSessions.tenantId, input.tenantId),
          eq(runnerExecutionSessions.workerJobId, input.workerJobId)
        )
      )
      .limit(1)
      .for("update");
    if (!session) throw new Error("RUNNER_SESSION_NOT_FOUND");

    const [priorEvent] = await tx
      .select()
      .from(runnerExecutionSessionEvents)
      .where(
        and(
          eq(runnerExecutionSessionEvents.sessionId, input.sessionId),
          eq(
            runnerExecutionSessionEvents.idempotencyKey,
            input.event.idempotencyKey
          )
        )
      )
      .limit(1);
    if (priorEvent) {
      if (
        priorEvent.eventType !== input.event.eventType ||
        stableJson(priorEvent.payloadJson) !== stableJson(input.event.payload)
      ) {
        throw new Error("RUNNER_SESSION_EVENT_IDEMPOTENCY_CONFLICT");
      }
      return session;
    }

    if (
      session.jobControlRevision !== input.expectedRevision ||
      session.authorityEpoch !== input.expectedAuthorityEpoch
    ) {
      throw new Error("RUNNER_SESSION_RECOVERY_CAS_LOST");
    }
    if (!["disconnected", "quiesced", "unknown"].includes(session.state)) {
      throw new Error("RUNNER_SESSION_RECOVERY_STATE_INVALID");
    }
    const nextAuthorityEpoch = input.expectedAuthorityEpoch + 1;
    const nextRevision = input.expectedRevision + 1;
    if (
      !Number.isSafeInteger(nextAuthorityEpoch) ||
      !Number.isSafeInteger(nextRevision)
    ) {
      throw new Error("RUNNER_SESSION_REVISION_EXHAUSTED");
    }
    const [latestEvent] = await tx
      .select({ sequence: runnerExecutionSessionEvents.sequence })
      .from(runnerExecutionSessionEvents)
      .where(eq(runnerExecutionSessionEvents.sessionId, input.sessionId))
      .orderBy(desc(runnerExecutionSessionEvents.sequence))
      .limit(1);
    const [updated] = await tx
      .update(runnerExecutionSessions)
      .set({
        runnerId: input.runnerId,
        state: "recovering",
        authorityEpoch: nextAuthorityEpoch,
        jobControlRevision: nextRevision,
        observedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(runnerExecutionSessions.sessionId, input.sessionId),
          eq(runnerExecutionSessions.tenantId, input.tenantId),
          eq(runnerExecutionSessions.workerJobId, input.workerJobId),
          eq(
            runnerExecutionSessions.jobControlRevision,
            input.expectedRevision
          ),
          eq(
            runnerExecutionSessions.authorityEpoch,
            input.expectedAuthorityEpoch
          )
        )
      )
      .returning();
    if (!updated) throw new Error("RUNNER_SESSION_RECOVERY_CAS_LOST");

    await tx.insert(runnerExecutionSessionEvents).values({
      sessionId: input.sessionId,
      tenantId: input.tenantId,
      sequence: (latestEvent?.sequence ?? 0) + 1,
      idempotencyKey: input.event.idempotencyKey,
      eventType: input.event.eventType,
      payloadJson: input.event.payload,
    });
    return updated;
  });
}

/** Persist authenticated, fence-matching host inventory as an observation only.
 * Inventory never changes session state or grants mutation authority.
 */
export async function recordRunnerSessionInventory(input: {
  tenantId: string;
  runnerId: string;
  runnerSessionId: string;
  batchId: string;
  inventory: unknown;
}) {
  if (!projectionEnabled()) return { observed: 0, duplicate: 0, rejected: 0 };
  if (
    !input.tenantId ||
    !input.runnerId.trim() ||
    input.runnerId.length > 160 ||
    !input.runnerSessionId.trim() ||
    input.runnerSessionId.length > 160 ||
    !input.batchId.trim() ||
    input.batchId.length > 200
  ) {
    throw new Error("RUNNER_SESSION_INVENTORY_IDENTITY_INVALID");
  }
  const inventory = validateRunnerSessionInventory(input.inventory);
  if (!inventory) throw new Error("RUNNER_SESSION_INVENTORY_INVALID");
  if (inventory.records.length === 0)
    return { observed: 0, duplicate: 0, rejected: 0 };

  const db = getDb();
  return db.transaction(async tx => {
    let observed = 0;
    let duplicate = 0;
    let rejected = 0;
    for (const candidate of inventory.records) {
      const result = await observeInventoryCandidate(tx, input, candidate);
      if (result === "observed") observed += 1;
      else if (result === "duplicate") duplicate += 1;
      else rejected += 1;
    }
    return { observed, duplicate, rejected };
  });
}

async function observeInventoryCandidate(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  input: {
    tenantId: string;
    runnerId: string;
    runnerSessionId: string;
    batchId: string;
  },
  candidate: RunnerSessionInventoryCandidate
): Promise<"observed" | "duplicate" | "rejected"> {
  const sessionWhere = and(
    eq(runnerExecutionSessions.sessionId, candidate.sessionId),
    eq(runnerExecutionSessions.tenantId, input.tenantId),
    eq(runnerExecutionSessions.workerJobId, candidate.workerJobId),
    eq(runnerExecutionSessions.generation, candidate.generation)
  );
  const [snapshot] = await tx
    .select({ workerJobId: runnerExecutionSessions.workerJobId })
    .from(runnerExecutionSessions)
    .where(sessionWhere)
    .limit(1);
  if (!snapshot) return "rejected";

  // Global lock order is canonical job, then session. This serializes two
  // reporters for the same job before allocating the next event sequence.
  const [job] = await tx
    .select({
      status: workerJobs.status,
      attempt: workerJobs.attempt,
      fencingVersion: workerJobs.fencingVersion,
      leaseExpiresAt: workerJobs.leaseExpiresAt,
    })
    .from(workerJobs)
    .where(
      and(
        eq(workerJobs.id, candidate.workerJobId),
        eq(workerJobs.tenantId, input.tenantId)
      )
    )
    .limit(1)
    .for("update");
  if (
    !job ||
    terminalJobStates.has(job.status) ||
    job.attempt !== candidate.workerJobAttempt ||
    job.fencingVersion !== candidate.leaseFencingVersion ||
    !job.leaseExpiresAt ||
    job.leaseExpiresAt.getTime() <= Date.now()
  ) {
    return "rejected";
  }

  const [session] = await tx
    .select()
    .from(runnerExecutionSessions)
    .where(sessionWhere)
    .limit(1)
    .for("update");
  if (
    !session ||
    session.runnerId !== input.runnerId ||
    session.workerJobAttempt !== candidate.workerJobAttempt ||
    session.leaseFencingVersion !== candidate.leaseFencingVersion ||
    session.authorityEpoch !== candidate.authorityEpoch ||
    session.placementEpoch !== candidate.placementEpoch ||
    session.jobControlRevision !== candidate.jobControlRevision ||
    ["completed", "failed", "cancelled", "incompatible"].includes(session.state)
  ) {
    return "rejected";
  }

  const eventKey = `inventory:${createHash("sha256")
    .update(`${input.batchId}\0${candidate.sessionId}\0${candidate.generation}`)
    .digest("hex")}`;
  const payload = {
    reporterRunnerId: input.runnerId,
    reporterSessionId: input.runnerSessionId,
    generation: candidate.generation,
    reportedState: candidate.lastState,
    commandSequence: candidate.commandSequence,
    eventSequence: candidate.eventSequence,
    processIdentity: candidate.processIdentity,
    hostIdentity: candidate.hostIdentity,
  };
  const [priorEvent] = await tx
    .select()
    .from(runnerExecutionSessionEvents)
    .where(
      and(
        eq(runnerExecutionSessionEvents.sessionId, candidate.sessionId),
        eq(runnerExecutionSessionEvents.idempotencyKey, eventKey)
      )
    )
    .limit(1);
  if (priorEvent) {
    if (
      priorEvent.eventType !== "recovery_inventory_observed" ||
      stableJson(priorEvent.payloadJson) !== stableJson(payload)
    ) {
      throw new Error("RUNNER_SESSION_INVENTORY_REPLAY_CONFLICT");
    }
    return "duplicate";
  }

  const [latestEvent] = await tx
    .select({ sequence: runnerExecutionSessionEvents.sequence })
    .from(runnerExecutionSessionEvents)
    .where(eq(runnerExecutionSessionEvents.sessionId, candidate.sessionId))
    .orderBy(desc(runnerExecutionSessionEvents.sequence))
    .limit(1);
  const now = new Date();
  const [updated] = await tx
    .update(runnerExecutionSessions)
    .set({ observedAt: now, updatedAt: now })
    .where(
      and(
        eq(runnerExecutionSessions.sessionId, candidate.sessionId),
        eq(runnerExecutionSessions.tenantId, input.tenantId),
        eq(
          runnerExecutionSessions.jobControlRevision,
          candidate.jobControlRevision
        ),
        eq(runnerExecutionSessions.authorityEpoch, candidate.authorityEpoch)
      )
    )
    .returning({ sessionId: runnerExecutionSessions.sessionId });
  if (!updated) throw new Error("RUNNER_SESSION_INVENTORY_CAS_LOST");
  await tx.insert(runnerExecutionSessionEvents).values({
    sessionId: candidate.sessionId,
    tenantId: input.tenantId,
    sequence: (latestEvent?.sequence ?? 0) + 1,
    idempotencyKey: eventKey,
    eventType: "recovery_inventory_observed",
    payloadJson: payload,
  });
  return "observed";
}
