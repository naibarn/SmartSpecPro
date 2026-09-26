import { createHash } from "node:crypto";

import type { AgentProvider, AgentRuntime } from "./agentControlPlaneContracts";
import type { JobControlPlane } from "./jobControlPlane";
import { createControlPlaneJob } from "./jobControlPlaneGateway";
import type { JobExecutorRegistry } from "./jobExecutorRegistry";
import type { JobRef } from "./jobControlPlaneTypes";
import {
  bindWorkerJob,
  buildDevelopmentHarnessJob,
  decideNextSafeAction,
  recordDevelopmentEvent,
  type DevelopmentEvent,
  type DevelopmentRun,
} from "./spec224DevelopmentRunContracts";
import type {
  DevelopmentRunPersistenceAdapter,
  DevelopmentRunStoreRecord,
} from "./spec224DevelopmentRunPersistence";
import { createDevelopmentRunService } from "./spec224DevelopmentRunPersistence";

const RECONCILED_EVENT_TYPES = new Set([
  "PHASE_COMPLETED",
  "PHASE_FAILED",
  "RUN_CANCELLED",
  "DECISION_REQUIRED",
]);

export class Spec224PhaseControllerError extends Error {
  constructor(
    public readonly code: string,
    public readonly jobId?: string
  ) {
    super(code);
    this.name = "Spec224PhaseControllerError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type CreateAndBindNextPhaseInput = {
  runId: string;
  tenantId: string;
  actorId: number;
  expectedRevision: number;
  expectedFencingVersion: number;
  idempotencyKey: string;
  provider: Extract<AgentProvider, "codex" | "claude_code">;
  runtime: AgentRuntime;
  planId: string;
  planRevision: number;
  skillIds: string[];
  requestedCapabilities: string[];
  authorizationScope: string;
  correlationId?: string;
  persistence: DevelopmentRunPersistenceAdapter;
  controlPlane?: JobControlPlane;
  executorRegistry?: JobExecutorRegistry;
};

export type CreateAndBindNextPhaseResult = {
  accepted: boolean;
  run: DevelopmentRun;
  event: DevelopmentEvent | null;
  revision: number;
  jobRef: JobRef;
};

function scopeFor(input: CreateAndBindNextPhaseInput) {
  if (
    !input.tenantId.trim() ||
    !Number.isSafeInteger(input.actorId) ||
    input.actorId <= 0
  ) {
    throw new Spec224PhaseControllerError("RUN_SCOPE_INVALID");
  }
  return { tenantId: input.tenantId, actorId: input.actorId };
}

function eventIdFor(runId: string, idempotencyKey: string): string {
  const digest = createHash("sha256")
    .update(`${runId}:${idempotencyKey}`, "utf8")
    .digest("hex");
  return `phase-started-${digest}`;
}

function normalizedEventIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) {
    throw new Spec224PhaseControllerError("PHASE_IDEMPOTENCY_INVALID");
  }
  return normalized;
}

function phaseJobIdempotencyKey(input: {
  runId: string;
  phase: string;
  planRevision: number;
}): string {
  if (!Number.isSafeInteger(input.planRevision) || input.planRevision < 1) {
    throw new Spec224PhaseControllerError("PLAN_REVISION_INVALID");
  }
  const key = `spec224:phase:${input.runId}:${input.phase}:plan:${input.planRevision}`;
  if (key.length <= 128) return key;
  return `spec224:phase:sha256:${createHash("sha256")
    .update(key, "utf8")
    .digest("hex")}`;
}

function isCurrentJobReconciled(record: DevelopmentRunStoreRecord): boolean {
  const workerJobId = record.run.workerJobId;
  return Boolean(
    workerJobId &&
    record.events.some(
      event =>
        RECONCILED_EVENT_TYPES.has(event.type) &&
        event.payload.workerJobId === workerJobId
    )
  );
}

function projectionInput(run: DevelopmentRun): Record<string, unknown> {
  return {
    ...run,
    events: [],
    eventIdempotencyKeys: [],
  };
}

function duplicateResult(
  record: DevelopmentRunStoreRecord,
  event: DevelopmentEvent,
  input: CreateAndBindNextPhaseInput
): CreateAndBindNextPhaseResult {
  const workerJobId = event.payload.workerJobId;
  if (
    event.type !== "PHASE_STARTED" ||
    typeof workerJobId !== "string" ||
    event.payload.planRevision !== input.planRevision
  ) {
    throw new Spec224PhaseControllerError("PHASE_IDEMPOTENCY_CONFLICT");
  }
  return {
    accepted: false,
    run: record.run,
    event,
    revision: record.revision,
    jobRef: { jobId: workerJobId, created: false },
  };
}

/**
 * Admits exactly one next-phase canonical job and records its projection bind.
 * The canonical admission and projection storage have separate durable
 * transactions; a post-admission persistence failure is surfaced as a typed
 * uncertainty so reconciliation can locate the admitted job by its phase key.
 */
export async function createAndBindNextPhase(
  input: CreateAndBindNextPhaseInput
): Promise<CreateAndBindNextPhaseResult> {
  const scope = scopeFor(input);
  const commandIdempotencyKey = normalizedEventIdempotencyKey(
    input.idempotencyKey
  );
  let admittedJob: JobRef | null = null;
  try {
    return await input.persistence.transaction(async tx => {
      const record = await tx.load(input.runId, scope);
      if (!record) throw new Spec224PhaseControllerError("RUN_NOT_FOUND");

      const duplicate = await tx.findEvent(
        input.runId,
        commandIdempotencyKey,
        scope
      );
      if (duplicate) return duplicateResult(record, duplicate, input);

      if (record.revision !== input.expectedRevision) {
        throw new Spec224PhaseControllerError("RUN_PROJECTION_STALE");
      }
      if (record.run.fencingVersion !== input.expectedFencingVersion) {
        throw new Spec224PhaseControllerError("RUN_FENCE_STALE");
      }
      if (!record.run.workerJobId) {
        throw new Spec224PhaseControllerError("RUN_CURRENT_JOB_UNBOUND");
      }
      if (!isCurrentJobReconciled(record)) {
        throw new Spec224PhaseControllerError("RUN_CURRENT_JOB_UNRECONCILED");
      }
      const nextAction = decideNextSafeAction(record.run);
      if (
        nextAction.command !== "RUN_PHASE" &&
        nextAction.command !== "RECOVER_PHASE"
      ) {
        throw new Spec224PhaseControllerError("RUN_NEXT_PHASE_NOT_AUTHORIZED");
      }

      const temporaryRun = { ...record.run, workerJobId: null };
      const prepared = buildDevelopmentHarnessJob({
        run: temporaryRun,
        provider: input.provider,
        runtime: input.runtime,
        planId: input.planId,
        planRevision: input.planRevision,
        skillIds: input.skillIds,
        requestedCapabilities: input.requestedCapabilities,
      });
      const jobIdempotencyKey = phaseJobIdempotencyKey({
        runId: record.run.runId,
        phase: record.run.state,
        planRevision: input.planRevision,
      });
      admittedJob = await createControlPlaneJob({
        context: {
          tenantId: record.run.tenantId,
          actorType: "user",
          actorId: record.run.actorId,
          authorizationScope: input.authorizationScope,
          correlationId:
            input.correlationId ??
            `development-run:${record.run.runId}:phase:${record.run.state}`,
          idempotencyKey: jobIdempotencyKey,
        },
        definition: {
          ...prepared.definition,
          idempotencyKey: jobIdempotencyKey,
          input: {
            ...prepared.definition.input,
            spec224Run: projectionInput(temporaryRun),
          },
        },
        controlPlane: input.controlPlane,
        executorRegistry: input.executorRegistry,
        createOptions: { runtimeType: "external_runtime" },
      });

      const bound = bindWorkerJob(temporaryRun, admittedJob.jobId);
      const recorded = recordDevelopmentEvent(bound, {
        eventId: eventIdFor(record.run.runId, commandIdempotencyKey),
        idempotencyKey: commandIdempotencyKey,
        type: "PHASE_STARTED",
        payload: {
          workerJobId: admittedJob.jobId,
          phase: record.run.state,
          planRevision: input.planRevision,
        },
      });
      if (!recorded.event) {
        throw new Spec224PhaseControllerError(
          "PHASE_EVENT_DUPLICATE_UNEXPECTED"
        );
      }
      const next: DevelopmentRunStoreRecord = {
        run: recorded.run,
        revision: record.revision + 1,
        events: [...record.events, recorded.event],
      };
      await tx.save(next, record.revision, scope);
      await tx.appendEvent(recorded.event, scope);
      return {
        accepted: true,
        run: recorded.run,
        event: recorded.event,
        revision: next.revision,
        jobRef: admittedJob,
      };
    });
  } catch (error) {
    if (admittedJob?.created) {
      throw new Spec224PhaseControllerError(
        "PHASE_ADMISSION_BIND_UNCERTAIN",
        admittedJob.jobId
      );
    }
    throw error;
  }
}

/**
 * Reconcile a terminal canonical job and immediately admit the next phase.
 * The caller still owns scheduling this operation; this function keeps the
 * continuation decision and next-job admission on one canonical service path.
 */
export async function reconcileAndContinueNextPhase(
  input: CreateAndBindNextPhaseInput
): Promise<{
  reconcile: Awaited<
    ReturnType<ReturnType<typeof createDevelopmentRunService>["reconcile"]>
  >;
  continuation: CreateAndBindNextPhaseResult | null;
}> {
  const reconcile = await createDevelopmentRunService(
    input.persistence
  ).reconcile({
    runId: input.runId,
    tenantId: input.tenantId,
    actorId: input.actorId,
  });
  if (reconcile.action !== "CONTINUE") {
    return { reconcile, continuation: null };
  }
  return {
    reconcile,
    continuation: await createAndBindNextPhase({
      ...input,
      expectedRevision: reconcile.revision,
      expectedFencingVersion: reconcile.run.fencingVersion,
    }),
  };
}
