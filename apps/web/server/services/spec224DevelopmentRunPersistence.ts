import { createHash } from "node:crypto";

import { and, asc, eq, like, or, sql } from "drizzle-orm";

import { workerJobEvents, workerJobs } from "../../drizzle/schema";
import { db, getDb } from "../db";
import {
  appendJobEvent,
  createCanonicalJobInTransaction,
  createJobControlPlane,
  type JobControlPlane,
} from "./jobControlPlane";
import type { JobDefinition, JobRef } from "./jobControlPlaneTypes";
import type { LeaseContext } from "./jobControlPlaneTypes";
import { createControlPlaneJob } from "./jobControlPlaneGateway";
import type { JobExecutorRegistry } from "./jobExecutorRegistry";
import { buildSpec224FullVerificationJobDefinition } from "./spec224VerificationJob";
import { getDevelopmentLifecyclePredicate } from "./developmentLifecyclePredicateRegistry";
import {
  recordCanonicalCheckpoint as applyCanonicalCheckpoint,
  applyDevelopmentDependencyEvidence,
  completeDevelopmentWorkUnit,
  repairMissingDevelopmentDependencyWatchers,
  registerDevelopmentDependencyWaits as applyDependencyWaits,
  type CanonicalCheckpointInput,
  type DevelopmentDependencyContract,
  type DevelopmentDependencyEvidence,
} from "./developmentLifecycleContracts";
import {
  assertFinalVerifyReady,
  assertRequirementClosureEvidenceBoundToRun,
  Spec224ClosureError,
  validateRequirementClosureGraph,
  type RequirementClosureGraph,
} from "./spec224RequirementClosureContracts";
import {
  Spec224VerificationProvenanceError,
  validateSpec224VerificationProvenance,
  type Spec224VerificationProvenance,
} from "./spec224VerificationProvenance";
import {
  bindWorkerJob,
  buildDevelopmentHarnessJob,
  recordDevelopmentEvent,
  transitionDevelopmentRun,
  workspaceLifecycleEvidenceErrorCode,
  type DevelopmentEvent,
  type DevelopmentEventType,
  type DevelopmentRun,
  type DevelopmentRunState,
} from "./spec224DevelopmentRunContracts";
import type { AgentTaskPolicyBinding } from "./agentControlPlaneContracts";

export type DevelopmentRunScope = {
  tenantId: string;
  actorId: number;
};

export type DevelopmentRunStoreRecord = {
  run: DevelopmentRun;
  revision: number;
  events: DevelopmentEvent[];
};

export type CanonicalDevelopmentJobSnapshot = {
  status: string;
  output?: Record<string, unknown> | null;
  resultRef?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  attempt?: number;
  operatorReviewRequired?: boolean;
};

export type DevelopmentRunPersistenceTx = {
  load(
    runId: string,
    scope: DevelopmentRunScope
  ): Promise<DevelopmentRunStoreRecord | null>;
  findEvent(
    runId: string,
    idempotencyKey: string,
    scope: DevelopmentRunScope
  ): Promise<DevelopmentEvent | null>;
  save(
    next: DevelopmentRunStoreRecord,
    expectedRevision: number,
    scope: DevelopmentRunScope
  ): Promise<void>;
  appendEvent(
    event: DevelopmentEvent,
    scope: DevelopmentRunScope
  ): Promise<DevelopmentEvent>;
  getCanonicalJob(
    run: DevelopmentRun,
    scope: DevelopmentRunScope
  ): Promise<CanonicalDevelopmentJobSnapshot | null>;
  createCanonicalJob?(definition: JobDefinition): Promise<JobRef>;
};

export type DevelopmentRunPersistenceAdapter = {
  transaction<T>(
    work: (tx: DevelopmentRunPersistenceTx) => Promise<T>
  ): Promise<T>;
};

export type DevelopmentRunCommand = {
  runId: string;
  tenantId: string;
  actorId: number;
  expectedRevision: number;
  expectedFencingVersion?: number;
  idempotencyKey: string;
  command: {
    kind: "transition";
    nextState: DevelopmentRunState;
    eventType: DevelopmentEventType;
    payload: Record<string, unknown>;
    evidenceRefs?: string[];
  };
};

export type DevelopmentRunCommandResult = {
  accepted: boolean;
  run: DevelopmentRun;
  event: DevelopmentEvent | null;
  revision: number;
};

export type DevelopmentRunReconcileResult = {
  action: "WAIT" | "CONTINUE" | "RECOVER" | "STOP";
  run: DevelopmentRun;
  revision: number;
  reason: string;
};

const PHASE_SUCCESSORS: Partial<
  Record<DevelopmentRunState, DevelopmentRunState>
> = {
  DISCOVERY: "PLANNING",
  PLANNING: "PLAN_VERIFY",
  PLAN_VERIFY: "IMPLEMENT",
  IMPLEMENT: "BUILD",
  BUILD: "TEST",
  TEST: "REVIEW",
  REVIEW: "VERIFY",
  VERIFY: "REGRESSION",
  REGRESSION: "FINAL_VERIFY",
};

const TERMINAL_JOB_STATES = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "expired",
]);

function hasReconciledWorkerJob(
  run: DevelopmentRun,
  workerJobId: string
): boolean {
  return run.events.some(
    event =>
      [
        "PHASE_COMPLETED",
        "PHASE_FAILED",
        "RUN_CANCELLED",
        "DECISION_REQUIRED",
        "RUN_COMPLETED",
      ].includes(event.type) && event.payload.workerJobId === workerJobId
  );
}

const CLOSURE_METADATA_KEY = "spec224RequirementClosure";
const FINAL_VERIFY_PROVENANCE_STALE = "FINAL_VERIFY_PROVENANCE_STALE";
const FINAL_VERIFY_PROVENANCE_INVALID = "FINAL_VERIFY_PROVENANCE_INVALID";

function persistedClosureGraph(run: DevelopmentRun): RequirementClosureGraph {
  const value = run.metadata?.[CLOSURE_METADATA_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CLOSURE_GRAPH_NOT_FOUND");
  }
  const projection = value as {
    projectionVersion?: unknown;
    graph?: unknown;
    graphDigest?: unknown;
  };
  if (
    projection.projectionVersion !== "spec-224-closure-projection-v2" ||
    !projection.graph ||
    typeof projection.graph !== "object" ||
    Array.isArray(projection.graph) ||
    typeof projection.graphDigest !== "string"
  ) {
    throw new Error("CLOSURE_GRAPH_INVALID");
  }
  const graph = validateRequirementClosureGraph(
    projection.graph as RequirementClosureGraph
  );
  if (graph.blockers.some(blocker => blocker.runId !== run.runId)) {
    throw new Error("CLOSURE_GRAPH_INVALID");
  }
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, canonicalize(child)])
      );
    }
    return value;
  };
  const actualDigest = createHash("sha256")
    .update(JSON.stringify(canonicalize(graph)), "utf8")
    .digest("hex");
  if (actualDigest !== projection.graphDigest) {
    throw new Error("CLOSURE_GRAPH_DIGEST_MISMATCH");
  }
  return graph;
}

function finalVerifyProvenanceErrorCode(
  run: DevelopmentRun,
  output: Record<string, unknown> | null | undefined
): string | null {
  if (
    !output ||
    !Object.prototype.hasOwnProperty.call(output, "verificationProvenance")
  ) {
    return null;
  }
  try {
    const graph = persistedClosureGraph(run);
    validateSpec224VerificationProvenance({
      provenance:
        output.verificationProvenance as Spec224VerificationProvenance,
      expectedSpecDigest: graph.baseline.digest,
    });
    return null;
  } catch (error) {
    if (!(error instanceof Spec224VerificationProvenanceError)) throw error;
    return error.code === "SPEC_DIGEST_MISMATCH"
      ? FINAL_VERIFY_PROVENANCE_STALE
      : FINAL_VERIFY_PROVENANCE_INVALID;
  }
}

function eventIdFor(runId: string, idempotencyKey: string): string {
  const digest = createHash("sha256")
    .update(`${runId}:${idempotencyKey}`, "utf8")
    .digest("hex");
  return `event-${digest}`;
}

function developmentDependencyOperationKey(runId: string): string {
  const digest = createHash("sha256").update(runId, "utf8").digest("hex").slice(0, 48);
  return `development-dependency:${digest}`;
}

function durableEventKey(runId: string, idempotencyKey: string): string {
  const raw = `spec224:${runId}:${idempotencyKey}`;
  if (raw.length <= 200) return raw;
  const digest = createHash("sha256").update(raw, "utf8").digest("hex");
  return `spec224:${runId}:sha256:${digest}`.slice(0, 200);
}

function scopeFor(input: {
  tenantId: string;
  actorId: number;
}): DevelopmentRunScope {
  if (
    !input.tenantId.trim() ||
    !Number.isSafeInteger(input.actorId) ||
    input.actorId <= 0
  ) {
    throw new Error("RUN_SCOPE_INVALID");
  }
  return { tenantId: input.tenantId, actorId: input.actorId };
}

function projectionRun(run: DevelopmentRun): DevelopmentRun {
  return {
    ...run,
    events: [],
    eventIdempotencyKeys: [],
  };
}

function mergeEvidence(
  run: DevelopmentRun,
  evidenceRefs: readonly string[] | undefined
): DevelopmentRun {
  if (!evidenceRefs || evidenceRefs.length === 0) return run;
  return {
    ...run,
    evidenceRefs: [...new Set([...run.evidenceRefs, ...evidenceRefs])],
  };
}

function eventFromCommand(
  run: DevelopmentRun,
  input: DevelopmentRunCommand
): {
  run: DevelopmentRun;
  event: DevelopmentEvent;
} {
  const prepared = mergeEvidence(run, input.command.evidenceRefs);
  const transitioned = transitionDevelopmentRun(
    prepared,
    input.command.nextState
  );
  const recorded = recordDevelopmentEvent(transitioned, {
    eventId: eventIdFor(run.runId, input.idempotencyKey),
    idempotencyKey: input.idempotencyKey,
    type: input.command.eventType,
    payload: {
      ...input.command.payload,
      __spec224NextState: input.command.nextState,
    },
  });
  if (!recorded.event) throw new Error("RUN_EVENT_DUPLICATE_UNEXPECTED");
  return { run: recorded.run, event: recorded.event };
}

async function applyTransition(
  tx: DevelopmentRunPersistenceTx,
  record: DevelopmentRunStoreRecord,
  scope: DevelopmentRunScope,
  input: {
    idempotencyKey: string;
    nextState: DevelopmentRunState;
    eventType: DevelopmentEventType;
    payload: Record<string, unknown>;
    evidenceRefs?: string[];
  }
): Promise<DevelopmentRunCommandResult> {
  const existing = await tx.findEvent(
    record.run.runId,
    input.idempotencyKey,
    scope
  );
  if (existing) {
    if (
      existing.type !== input.eventType ||
      existing.payload.__spec224NextState !== input.nextState
    ) {
      throw new Error("RUN_IDEMPOTENCY_CONFLICT");
    }
    return {
      accepted: false,
      run: record.run,
      event: existing,
      revision: record.revision,
    };
  }
  const command = {
    runId: record.run.runId,
    tenantId: scope.tenantId,
    actorId: scope.actorId,
    expectedRevision: record.revision,
    idempotencyKey: input.idempotencyKey,
    command: {
      kind: "transition" as const,
      nextState: input.nextState,
      eventType: input.eventType,
      payload: input.payload,
      ...(input.evidenceRefs ? { evidenceRefs: input.evidenceRefs } : {}),
    },
  } satisfies DevelopmentRunCommand;
  const next = eventFromCommand(record.run, command);
  const nextRecord: DevelopmentRunStoreRecord = {
    run: next.run,
    revision: record.revision + 1,
    events: [...record.events, next.event],
  };
  await tx.save(nextRecord, record.revision, scope);
  await tx.appendEvent(next.event, scope);
  return {
    accepted: true,
    run: next.run,
    event: next.event,
    revision: nextRecord.revision,
  };
}

export function createDevelopmentRunService(
  adapter: DevelopmentRunPersistenceAdapter,
  options: {
    fullVerificationRuntimeConfigured?: boolean;
    assessFullVerificationResources?: () => Promise<
      | { state: "ADMITTED"; requiredMemoryMiB: number }
      | { state: "QUEUED_RESOURCE"; reason: string; requiredMemoryMiB: number }
    >;
    releaseDependencyWait?: (input: {
      lease: LeaseContext;
      tenantId: string;
      actorId: number;
      operationKey: string;
      metadata: Record<string, unknown>;
    }) => Promise<void>;
    resumeDependencyWait?: (input: {
      jobId: string;
      tenantId: string;
      actorId: number;
      operationKey: string;
      resumeKey: string;
    }) => Promise<boolean>;
    hasDependencyPredicate?: (predicateId: string) => boolean;
  } = {}
) {
  const hasDependencyPredicate = options.hasDependencyPredicate ?? ((predicateId: string) =>
    getDevelopmentLifecyclePredicate(predicateId) !== null
  );
  const releaseDependencyWait = options.releaseDependencyWait ?? (async input => {
    const controlPlane = createJobControlPlane();
    const snapshot = await controlPlane.getJobSnapshot(input.lease.jobId, {
      tenantId: input.tenantId,
      requestedByUserId: input.actorId,
    });
    const existingWait = (snapshot?.progress as { externalWait?: { operationKey?: unknown } } | undefined)?.externalWait;
    if (snapshot?.status === "waiting_external" && existingWait?.operationKey === input.operationKey) return;
    if (snapshot?.status !== "running") return;
    await controlPlane.waitForExternal(input.lease, {
      operationKey: input.operationKey,
      resumeAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: input.metadata,
    });
  });
  const resumeDependencyWait = options.resumeDependencyWait ?? (async input => {
    const controlPlane = createJobControlPlane();
    const snapshot = await controlPlane.getJobSnapshot(input.jobId, {
      tenantId: input.tenantId,
      requestedByUserId: input.actorId,
    });
    const existingWait = (snapshot?.progress as { externalWait?: { operationKey?: unknown } } | undefined)?.externalWait;
    if (snapshot?.status !== "waiting_external" || existingWait?.operationKey !== input.operationKey) return false;
    return controlPlane.resumeExternal(
      input.jobId,
      "development-lifecycle-reconciler",
      "postgres-pull",
      undefined,
      input.resumeKey,
    );
  });
  return {
    async get(input: {
      runId: string;
      tenantId: string;
      actorId: number;
    }): Promise<DevelopmentRunStoreRecord> {
      const scope = scopeFor(input);
      return adapter.transaction(async tx => {
        const record = await tx.load(input.runId, scope);
        if (!record) throw new Error("RUN_NOT_FOUND");
        return record;
      });
    },

    async initialize(input: {
      run: DevelopmentRun;
      eventIdempotencyKey: string;
      scope: DevelopmentRunScope;
    }): Promise<DevelopmentRunStoreRecord> {
      const scope = scopeFor(input.scope);
      return adapter.transaction(async tx => {
        const existing = await tx.load(input.run.runId, scope);
        if (existing) return existing;
        const created = recordDevelopmentEvent(input.run, {
          eventId: eventIdFor(input.run.runId, input.eventIdempotencyKey),
          idempotencyKey: input.eventIdempotencyKey,
          type: "RUN_CREATED",
          payload: {
            state: input.run.state,
            workerJobId: input.run.workerJobId,
          },
        });
        if (!created.event) throw new Error("RUN_EVENT_DUPLICATE_UNEXPECTED");
        const next: DevelopmentRunStoreRecord = {
          run: created.run,
          revision: 0,
          events: [created.event],
        };
        await tx.save(next, -1, scope);
        await tx.appendEvent(created.event, scope);
        return next;
      });
    },

    /** Append resource/verification facts without advancing the development phase. */
    async recordVerificationEvent(input: {
      runId: string;
      tenantId: string;
      actorId: number;
      idempotencyKey: string;
      type: "VERIFICATION_ADMISSION" | "VERIFICATION_OUTCOME";
      payload: Record<string, unknown>;
      occurredAt?: string;
    }): Promise<DevelopmentRunCommandResult> {
      const scope = scopeFor(input);
      return adapter.transaction(async tx => {
        const record = await tx.load(input.runId, scope);
        if (!record) throw new Error("RUN_NOT_FOUND");
        const duplicate = await tx.findEvent(
          input.runId,
          input.idempotencyKey,
          scope
        );
        if (duplicate) {
          if (
            duplicate.type !== input.type ||
            JSON.stringify(duplicate.payload) !== JSON.stringify(input.payload)
          ) {
            throw new Error("RUN_IDEMPOTENCY_CONFLICT");
          }
          return {
            accepted: false,
            run: record.run,
            event: duplicate,
            revision: record.revision,
          };
        }

        const recorded = recordDevelopmentEvent(record.run, {
          eventId: eventIdFor(input.runId, input.idempotencyKey),
          idempotencyKey: input.idempotencyKey,
          type: input.type,
          payload: input.payload,
          ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
        });
        if (!recorded.event) throw new Error("RUN_EVENT_DUPLICATE_UNEXPECTED");
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
        };
      });
    },

    /** Persist a generic partial/complete source checkpoint on the owning DevelopmentRun. */
    async recordCanonicalCheckpoint(input: {
      runId: string;
      tenantId: string;
      actorId: number;
      expectedRevision: number;
      expectedFencingVersion: number;
      idempotencyKey: string;
      checkpoint: CanonicalCheckpointInput;
      occurredAt?: string;
    }): Promise<DevelopmentRunCommandResult> {
      const scope = scopeFor(input);
      if (!input.idempotencyKey.trim() || input.idempotencyKey.length < 16 || input.idempotencyKey.length > 160) {
        throw new Error("RUN_IDEMPOTENCY_KEY_INVALID");
      }
      return adapter.transaction(async tx => {
        const record = await tx.load(input.runId, scope);
        if (!record) throw new Error("RUN_NOT_FOUND");
        const duplicate = await tx.findEvent(input.runId, input.idempotencyKey, scope);
        if (duplicate) {
          const requestDigest = createHash("sha256").update(JSON.stringify(input.checkpoint), "utf8").digest("hex");
          if (
            duplicate.type !== "CANONICAL_CHECKPOINT_RECORDED" ||
            duplicate.payload.requestDigest !== requestDigest
          ) {
            throw new Error("RUN_IDEMPOTENCY_CONFLICT");
          }
          return { accepted: false, run: record.run, event: duplicate, revision: record.revision };
        }
        if (record.revision !== input.expectedRevision) throw new Error("RUN_PROJECTION_STALE");
        if (record.run.fencingVersion !== input.expectedFencingVersion) throw new Error("RUN_FENCE_STALE");
        if (!record.run.workUnit) throw new Error("DEVELOPMENT_WORK_UNIT_NOT_FOUND");

        const nextWorkUnit = applyCanonicalCheckpoint(
          record.run.workUnit,
          input.checkpoint,
          input.occurredAt,
        );
        const recorded = recordDevelopmentEvent(record.run, {
          eventId: eventIdFor(input.runId, input.idempotencyKey),
          idempotencyKey: input.idempotencyKey,
          type: "CANONICAL_CHECKPOINT_RECORDED",
          payload: {
            workId: nextWorkUnit.workId,
            canonicalTarget: nextWorkUnit.canonicalTarget,
            canonicalRevision: nextWorkUnit.progress.canonicalRevision,
            progressState: nextWorkUnit.progress.state,
            completedScope: nextWorkUnit.progress.completedScope,
            remainingScope: nextWorkUnit.progress.remainingScope,
            pendingValidation: nextWorkUnit.validation.pending,
            handoff: nextWorkUnit.handoff,
            requestDigest: createHash("sha256").update(JSON.stringify(input.checkpoint), "utf8").digest("hex"),
          },
          ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
        });
        if (!recorded.event) throw new Error("RUN_EVENT_DUPLICATE_UNEXPECTED");
        const nextRun: DevelopmentRun = { ...recorded.run, workUnit: nextWorkUnit };
        const next: DevelopmentRunStoreRecord = {
          run: nextRun,
          revision: record.revision + 1,
          events: [...record.events, recorded.event],
        };
        await tx.save(next, record.revision, scope);
        await tx.appendEvent(recorded.event, scope);
        return { accepted: true, run: nextRun, event: recorded.event, revision: next.revision };
      });
    },

    /** Persist a project-neutral dependency wait on the existing DevelopmentRun owner. */
    async registerDependencyWait(input: {
      lease: LeaseContext;
      runId: string;
      tenantId: string;
      actorId: number;
      expectedRevision: number;
      expectedFencingVersion: number;
      idempotencyKey: string;
      dependency: DevelopmentDependencyContract;
      additionalDependencies?: DevelopmentDependencyContract[];
      immediatelyRunnableScope: string[];
      occurredAt?: string;
    }): Promise<DevelopmentRunCommandResult> {
      const scope = scopeFor(input);
      if (!input.idempotencyKey.trim() || input.idempotencyKey.length < 16 || input.idempotencyKey.length > 160) {
        throw new Error("RUN_IDEMPOTENCY_KEY_INVALID");
      }
      for (const dependency of [input.dependency, ...(input.additionalDependencies ?? [])]) {
        if (!hasDependencyPredicate(dependency.satisfaction.predicateId)) {
          throw new Error("DEVELOPMENT_PREDICATE_UNAVAILABLE");
        }
      }
      const requestDigest = createHash("sha256").update(JSON.stringify({
        dependencies: [input.dependency, ...(input.additionalDependencies ?? [])],
        immediatelyRunnableScope: input.immediatelyRunnableScope,
      }), "utf8").digest("hex");
      const result = await adapter.transaction(async tx => {
        const record = await tx.load(input.runId, scope);
        if (!record) throw new Error("RUN_NOT_FOUND");
        const duplicate = await tx.findEvent(input.runId, input.idempotencyKey, scope);
        if (duplicate) {
          if (duplicate.type !== "DEPENDENCY_WAIT_REGISTERED" || duplicate.payload.requestDigest !== requestDigest) {
            throw new Error("RUN_IDEMPOTENCY_CONFLICT");
          }
          return { accepted: false, run: record.run, event: duplicate, revision: record.revision };
        }
        if (record.revision !== input.expectedRevision) throw new Error("RUN_PROJECTION_STALE");
        if (record.run.fencingVersion !== input.expectedFencingVersion) throw new Error("RUN_FENCE_STALE");
        if (!record.run.workUnit) throw new Error("DEVELOPMENT_WORK_UNIT_NOT_FOUND");
        const dependencies = [input.dependency, ...(input.additionalDependencies ?? [])];
        const workUnit = applyDependencyWaits(
          record.run.workUnit,
          dependencies,
          input.immediatelyRunnableScope,
          input.occurredAt,
        );
        const recorded = recordDevelopmentEvent(record.run, {
          eventId: eventIdFor(input.runId, input.idempotencyKey),
          idempotencyKey: input.idempotencyKey,
          type: "DEPENDENCY_WAIT_REGISTERED",
          payload: {
            workId: workUnit.workId,
            dependencyIds: dependencies.map(item => item.dependencyId),
            projectId: input.dependency.projectId,
            requirements: dependencies.map(item => ({ dependencyId: item.dependencyId, requirement: item.requirement, wake: item.wake, blockedScope: item.blockedScope })),
            immediatelyRunnableScope: workUnit.progress.immediatelyRunnableScope,
            requestDigest,
          },
          ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
        });
        if (!recorded.event) throw new Error("RUN_EVENT_DUPLICATE_UNEXPECTED");
        const nextRun: DevelopmentRun = { ...recorded.run, workUnit };
        const next: DevelopmentRunStoreRecord = { run: nextRun, revision: record.revision + 1, events: [...record.events, recorded.event] };
        await tx.save(next, record.revision, scope);
        await tx.appendEvent(recorded.event, scope);
        return { accepted: true, run: nextRun, event: recorded.event, revision: next.revision };
      });
      if (result.run.workUnit?.progress.immediatelyRunnableScope.length === 0) {
        if (!result.run.workerJobId || input.lease.jobId !== result.run.workerJobId) {
          throw new Error("DEPENDENCY_WAIT_JOB_MISMATCH");
        }
        await releaseDependencyWait({
          lease: input.lease,
          tenantId: input.tenantId,
          actorId: input.actorId,
          operationKey: developmentDependencyOperationKey(input.runId),
          metadata: {
            developmentLifecycle: {
              runId: input.runId,
              workId: result.run.workUnit.workId,
              dependencyIds: [input.dependency, ...(input.additionalDependencies ?? [])].map(item => item.dependencyId),
            },
          },
        });
      }
      return result;
    },

    /** Apply durable predicate evidence through CAS/fencing on the existing run and job-event log. */
    async recordDependencyEvidence(input: {
      runId: string;
      tenantId: string;
      actorId: number;
      expectedRevision: number;
      expectedFencingVersion: number;
      idempotencyKey: string;
      dependencyId: string;
      evidence: DevelopmentDependencyEvidence;
      occurredAt?: string;
    }): Promise<DevelopmentRunCommandResult> {
      const scope = scopeFor(input);
      if (!input.idempotencyKey.trim() || input.idempotencyKey.length < 16 || input.idempotencyKey.length > 160) {
        throw new Error("RUN_IDEMPOTENCY_KEY_INVALID");
      }
      const requestDigest = createHash("sha256").update(JSON.stringify({
        dependencyId: input.dependencyId,
        evidence: input.evidence,
      }), "utf8").digest("hex");
      const result = await adapter.transaction(async tx => {
        const record = await tx.load(input.runId, scope);
        if (!record) throw new Error("RUN_NOT_FOUND");
        const duplicate = await tx.findEvent(input.runId, input.idempotencyKey, scope);
        if (duplicate) {
          if (duplicate.type !== "DEPENDENCY_EVIDENCE_APPLIED" || duplicate.payload.requestDigest !== requestDigest) {
            throw new Error("RUN_IDEMPOTENCY_CONFLICT");
          }
          return { accepted: false, run: record.run, event: duplicate, revision: record.revision };
        }
        if (record.revision !== input.expectedRevision) throw new Error("RUN_PROJECTION_STALE");
        if (record.run.fencingVersion !== input.expectedFencingVersion) throw new Error("RUN_FENCE_STALE");
        if (!record.run.workUnit) throw new Error("DEVELOPMENT_WORK_UNIT_NOT_FOUND");
        const workUnit = applyDevelopmentDependencyEvidence(
          record.run.workUnit,
          input.dependencyId,
          input.evidence,
          input.occurredAt,
        );
        const recorded = recordDevelopmentEvent(record.run, {
          eventId: eventIdFor(input.runId, input.idempotencyKey),
          idempotencyKey: input.idempotencyKey,
          type: "DEPENDENCY_EVIDENCE_APPLIED",
          payload: {
            workId: workUnit.workId,
            dependencyId: input.dependencyId,
            evidenceRef: input.evidence.reference,
            progressState: workUnit.progress.state,
            immediatelyRunnableScope: workUnit.progress.immediatelyRunnableScope,
            requestDigest,
          },
          ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
        });
        if (!recorded.event) throw new Error("RUN_EVENT_DUPLICATE_UNEXPECTED");
        const nextRun: DevelopmentRun = { ...recorded.run, workUnit };
        const next: DevelopmentRunStoreRecord = { run: nextRun, revision: record.revision + 1, events: [...record.events, recorded.event] };
        await tx.save(next, record.revision, scope);
        await tx.appendEvent(recorded.event, scope);
        return { accepted: true, run: nextRun, event: recorded.event, revision: next.revision };
      });
      const workUnit = result.run.workUnit;
      if (workUnit && workUnit.progress.immediatelyRunnableScope.length > 0 && result.run.workerJobId) {
        await resumeDependencyWait({
          jobId: result.run.workerJobId,
          tenantId: input.tenantId,
          actorId: input.actorId,
          operationKey: developmentDependencyOperationKey(input.runId),
          resumeKey: `development-dependency:${createHash("sha256").update(`${input.dependencyId}:${input.evidence.reference}`, "utf8").digest("hex")}`,
        });
      }
      return result;
    },

    async repairDependencyWatchers(input: {
      runId: string;
      tenantId: string;
      actorId: number;
      expectedRevision: number;
      expectedFencingVersion: number;
      idempotencyKey: string;
      occurredAt?: string;
    }): Promise<DevelopmentRunCommandResult> {
      const scope = scopeFor(input);
      return adapter.transaction(async tx => {
        const record = await tx.load(input.runId, scope);
        if (!record) throw new Error("RUN_NOT_FOUND");
        const duplicate = await tx.findEvent(input.runId, input.idempotencyKey, scope);
        if (duplicate) {
          if (duplicate.type !== "DEPENDENCY_WATCHERS_REPAIRED") throw new Error("RUN_IDEMPOTENCY_CONFLICT");
          return { accepted: false, run: record.run, event: duplicate, revision: record.revision };
        }
        if (record.revision !== input.expectedRevision) throw new Error("RUN_PROJECTION_STALE");
        if (record.run.fencingVersion !== input.expectedFencingVersion) throw new Error("RUN_FENCE_STALE");
        if (!record.run.workUnit) throw new Error("DEVELOPMENT_WORK_UNIT_NOT_FOUND");
        const workUnit = repairMissingDevelopmentDependencyWatchers(record.run.workUnit, input.occurredAt);
        const repairedDependencyIds = workUnit.dependencies
          .filter((item, index) => record.run.workUnit?.dependencies[index]?.watcher.status === "MISSING" && item.state === "UNSATISFIED")
          .map(item => item.dependencyId);
        if (!repairedDependencyIds.length) return { accepted: false, run: record.run, event: null, revision: record.revision };
        const recorded = recordDevelopmentEvent(record.run, {
          eventId: eventIdFor(input.runId, input.idempotencyKey),
          idempotencyKey: input.idempotencyKey,
          type: "DEPENDENCY_WATCHERS_REPAIRED",
          payload: { workId: workUnit.workId, dependencyIds: repairedDependencyIds },
          ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
        });
        if (!recorded.event) throw new Error("RUN_EVENT_DUPLICATE_UNEXPECTED");
        const nextRun: DevelopmentRun = { ...recorded.run, workUnit };
        const next: DevelopmentRunStoreRecord = { run: nextRun, revision: record.revision + 1, events: [...record.events, recorded.event] };
        await tx.save(next, record.revision, scope);
        await tx.appendEvent(recorded.event, scope);
        return { accepted: true, run: nextRun, event: recorded.event, revision: next.revision };
      });
    },

    /** Record implementation completion independently from validation/release state. */
    async recordImplementationCompletion(input: {
      runId: string;
      tenantId: string;
      actorId: number;
      expectedRevision: number;
      expectedFencingVersion: number;
      idempotencyKey: string;
      completion: {
        canonicalRevision: string;
        completedScope: string[];
        pendingValidation: CanonicalCheckpointInput["pendingValidation"];
        artifacts?: string[];
      };
      occurredAt?: string;
    }): Promise<DevelopmentRunCommandResult> {
      const scope = scopeFor(input);
      if (!input.idempotencyKey.trim() || input.idempotencyKey.length < 16 || input.idempotencyKey.length > 160) {
        throw new Error("RUN_IDEMPOTENCY_KEY_INVALID");
      }
      return adapter.transaction(async tx => {
        const record = await tx.load(input.runId, scope);
        if (!record) throw new Error("RUN_NOT_FOUND");
        const duplicate = await tx.findEvent(input.runId, input.idempotencyKey, scope);
        const requestDigest = createHash("sha256").update(JSON.stringify(input.completion), "utf8").digest("hex");
        if (duplicate) {
          if (
            duplicate.type !== "IMPLEMENTATION_COMPLETE_RECORDED" ||
            duplicate.payload.requestDigest !== requestDigest
          ) throw new Error("RUN_IDEMPOTENCY_CONFLICT");
          return { accepted: false, run: record.run, event: duplicate, revision: record.revision };
        }
        if (record.revision !== input.expectedRevision) throw new Error("RUN_PROJECTION_STALE");
        if (record.run.fencingVersion !== input.expectedFencingVersion) throw new Error("RUN_FENCE_STALE");
        if (!record.run.workUnit) throw new Error("DEVELOPMENT_WORK_UNIT_NOT_FOUND");
        const workUnit = completeDevelopmentWorkUnit(record.run.workUnit, input.completion, input.occurredAt);
        const recorded = recordDevelopmentEvent(record.run, {
          eventId: eventIdFor(input.runId, input.idempotencyKey),
          idempotencyKey: input.idempotencyKey,
          type: "IMPLEMENTATION_COMPLETE_RECORDED",
          payload: {
            workId: workUnit.workId,
            canonicalTarget: workUnit.canonicalTarget,
            canonicalRevision: workUnit.progress.canonicalRevision,
            completedScope: workUnit.progress.completedScope,
            pendingValidation: workUnit.validation.pending,
            requestDigest,
          },
          ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
        });
        if (!recorded.event) throw new Error("RUN_EVENT_DUPLICATE_UNEXPECTED");
        const nextRun: DevelopmentRun = { ...recorded.run, workUnit };
        const next: DevelopmentRunStoreRecord = {
          run: nextRun,
          revision: record.revision + 1,
          events: [...record.events, recorded.event],
        };
        await tx.save(next, record.revision, scope);
        await tx.appendEvent(recorded.event, scope);
        return { accepted: true, run: nextRun, event: recorded.event, revision: next.revision };
      });
    },

    /**
     * Atomically records a phase-neutral full-verification admission and, when
     * the runtime and resource gates are ready, its canonical job/outbox.
     */
    async requestFullVerification(input: {
      runId: string;
      tenantId: string;
      actorId: number;
      expectedRevision: number;
      expectedFencingVersion: number;
      idempotencyKey: string;
    }) {
      const scope = scopeFor(input);
      if (
        !input.idempotencyKey.trim() ||
        input.idempotencyKey.length < 16 ||
        input.idempotencyKey.length > 160 ||
        !Number.isSafeInteger(input.expectedRevision) ||
        input.expectedRevision < 0 ||
        !Number.isSafeInteger(input.expectedFencingVersion) ||
        input.expectedFencingVersion < 0
      ) throw new Error("RUN_IDEMPOTENCY_KEY_INVALID");
      const requestDigest = createHash("sha256")
        .update(JSON.stringify([input.runId, input.idempotencyKey]), "utf8")
        .digest("hex");
      const eventKey = `spec224-full:${requestDigest}`;
      const runtimeConfigured = options.fullVerificationRuntimeConfigured === true;
      const resources = runtimeConfigured && options.assessFullVerificationResources
        ? await options.assessFullVerificationResources()
        : null;

      return adapter.transaction(async tx => {
        const record = await tx.load(input.runId, scope);
        if (!record) throw new Error("RUN_NOT_FOUND");
        const duplicate = await tx.findEvent(input.runId, eventKey, scope);
        if (duplicate) {
          const duplicateState = duplicate.payload.state;
          if (
            duplicate.type !== "VERIFICATION_ADMISSION" ||
            duplicate.payload.profile !== "full" ||
            !["NOT_CONFIGURED", "QUEUED_RESOURCE", "QUEUED"].includes(String(duplicateState))
          ) {
            throw new Error("RUN_IDEMPOTENCY_CONFLICT");
          }
          if (
            duplicate.payload.requestedRevision !== input.expectedRevision ||
            duplicate.payload.requestedFencingVersion !== input.expectedFencingVersion
          ) throw new Error("RUN_IDEMPOTENCY_CONFLICT");
          return {
            state: duplicateState as "NOT_CONFIGURED" | "QUEUED_RESOURCE" | "QUEUED",
            accepted: false,
            run: record.run,
            event: duplicate,
            revision: record.revision,
            jobId: typeof duplicate.payload.jobId === "string" ? duplicate.payload.jobId : null,
          };
        }
        if (record.revision !== input.expectedRevision) throw new Error("RUN_PROJECTION_STALE");
        if (record.run.fencingVersion !== input.expectedFencingVersion) throw new Error("RUN_FENCE_STALE");

        let state: "NOT_CONFIGURED" | "QUEUED_RESOURCE" | "QUEUED";
        let reason: string | undefined;
        let jobRef: JobRef | null = null;
        if (!runtimeConfigured || !resources || !tx.createCanonicalJob) {
          state = "NOT_CONFIGURED";
          reason = "FULL_VERIFICATION_RUNTIME_NOT_CONFIGURED";
        } else if (resources.state === "QUEUED_RESOURCE") {
          state = "QUEUED_RESOURCE";
          reason = resources.reason;
        } else {
          state = "QUEUED";
          const definition = buildSpec224FullVerificationJobDefinition({
            tenantId: input.tenantId,
            actorId: input.actorId,
            runId: input.runId,
            expectedRevision: input.expectedRevision,
            expectedFencingVersion: input.expectedFencingVersion,
            admissionEventKey: eventKey,
          });
          jobRef = await tx.createCanonicalJob(definition);
        }
        const payload = {
          profile: "full",
          state,
          ...(reason ? { reason } : {}),
          ...(jobRef ? { jobId: jobRef.jobId } : {}),
          requestedRevision: input.expectedRevision,
          requestedFencingVersion: input.expectedFencingVersion,
          ...(resources ? { requiredMemoryMiB: resources.requiredMemoryMiB } : {}),
        };
        const recorded = recordDevelopmentEvent(record.run, {
          eventId: eventIdFor(input.runId, eventKey),
          idempotencyKey: eventKey,
          type: "VERIFICATION_ADMISSION",
          payload,
        });
        if (!recorded.event) throw new Error("RUN_EVENT_DUPLICATE_UNEXPECTED");
        const next: DevelopmentRunStoreRecord = {
          run: recorded.run,
          revision: record.revision + 1,
          events: [...record.events, recorded.event],
        };
        await tx.save(next, record.revision, scope);
        await tx.appendEvent(recorded.event, scope);
        return {
          state,
          accepted: true,
          run: recorded.run,
          event: recorded.event,
          revision: next.revision,
          jobId: jobRef?.jobId ?? null,
          jobCreated: jobRef?.created ?? false,
        };
      });
    },

    async command(
      input: DevelopmentRunCommand
    ): Promise<DevelopmentRunCommandResult> {
      const scope = scopeFor(input);
      return adapter.transaction(async tx => {
        const record = await tx.load(input.runId, scope);
        if (!record) throw new Error("RUN_NOT_FOUND");
        const duplicate = await tx.findEvent(
          input.runId,
          input.idempotencyKey,
          scope
        );
        if (duplicate) {
          if (
            duplicate.type !== input.command.eventType ||
            duplicate.payload.__spec224NextState !== input.command.nextState
          ) {
            throw new Error("RUN_IDEMPOTENCY_CONFLICT");
          }
          return {
            accepted: false,
            run: record.run,
            event: duplicate,
            revision: record.revision,
          };
        }
        if (
          input.expectedFencingVersion !== undefined &&
          record.run.fencingVersion !== input.expectedFencingVersion
        ) {
          throw new Error("RUN_FENCE_STALE");
        }
        if (record.revision !== input.expectedRevision)
          throw new Error("RUN_PROJECTION_STALE");
        return applyTransition(tx, record, scope, {
          idempotencyKey: input.idempotencyKey,
          ...input.command,
        });
      });
    },

    async reconcile(input: {
      runId: string;
      tenantId: string;
      actorId: number;
      expectedRevision?: number;
      expectedFencingVersion?: number;
      expectedWorkerJobId?: string;
      expectedAttempt?: number;
    }): Promise<DevelopmentRunReconcileResult> {
      const scope = scopeFor(input);
      return adapter.transaction(async tx => {
        const record = await tx.load(input.runId, scope);
        if (!record) throw new Error("RUN_NOT_FOUND");
        if (!record.run.workerJobId) {
          return {
            action: "WAIT",
            run: record.run,
            revision: record.revision,
            reason: "worker_job_not_bound",
          };
        }
        const job = await tx.getCanonicalJob(record.run, scope);
        if (!job || !TERMINAL_JOB_STATES.has(job.status)) {
          return {
            action: "WAIT",
            run: record.run,
            revision: record.revision,
            reason: "worker_job_not_terminal",
          };
        }
        if (hasReconciledWorkerJob(record.run, record.run.workerJobId)) {
          return {
            action: ["COMPLETED", "CANCELLED", "FAILED_TERMINAL"].includes(
              record.run.state
            )
              ? "STOP"
              : "WAIT",
            run: record.run,
            revision: record.revision,
            reason: "worker_job_already_reconciled",
          };
        }
        if (
          (input.expectedRevision !== undefined &&
            record.revision !== input.expectedRevision) ||
          (input.expectedFencingVersion !== undefined &&
            record.run.fencingVersion !== input.expectedFencingVersion) ||
          (input.expectedWorkerJobId !== undefined &&
            record.run.workerJobId !== input.expectedWorkerJobId)
        ) {
          return {
            action: "WAIT",
            run: record.run,
            revision: record.revision,
            reason: "continuation_binding_stale",
          };
        }
        if (
          input.expectedAttempt !== undefined &&
          job.attempt !== input.expectedAttempt
        ) {
          return {
            action: "WAIT",
            run: record.run,
            revision: record.revision,
            reason: "continuation_attempt_stale",
          };
        }

        if (job.status === "succeeded") {
          if (record.run.state === "FINAL_VERIFY") {
            const evidenceRefs = Array.isArray(job.output?.evidenceRefs)
              ? job.output.evidenceRefs.filter(
                  (value): value is string => typeof value === "string"
                )
              : [];
            if (!evidenceRefs.some(ref => /^evidence:final[-:]/.test(ref))) {
              const paused = await applyTransition(tx, record, scope, {
                idempotencyKey: `reconcile:${record.run.workerJobId}:final-verify:missing-evidence`,
                nextState: "WAITING_HUMAN_DECISION",
                eventType: "DECISION_REQUIRED",
                payload: {
                  reason: "final_verification_evidence_missing",
                  workerJobId: record.run.workerJobId,
                },
              });
              return {
                action: "WAIT",
                run: paused.run,
                revision: paused.revision,
                reason: "final_verification_evidence_missing",
              };
            }
            if (
              !evidenceRefs.some(ref => /^evidence:workspace-convergence:[A-Za-z0-9_./:@#-]{1,181}$/.test(ref)) ||
              !evidenceRefs.some(ref => /^evidence:worktree-retirement:[A-Za-z0-9_./:@#-]{1,181}$/.test(ref))
            ) {
              const paused = await applyTransition(tx, record, scope, {
                idempotencyKey: `reconcile:${record.run.workerJobId}:final-verify:workspace-convergence-pending`,
                nextState: "WAITING_HUMAN_DECISION",
                eventType: "DECISION_REQUIRED",
                payload: {
                  reason: "workspace_convergence_or_retirement_evidence_missing",
                  workerJobId: record.run.workerJobId,
                },
              });
              return {
                action: "WAIT",
                run: paused.run,
                revision: paused.revision,
                reason: "workspace_convergence_or_retirement_evidence_missing",
              };
            }
            const convergenceReceipt = job.output?.workspaceConvergenceReceipt;
            const retirementReceipt = job.output?.worktreeRetirementReceipt;
            const lifecycleEvidenceError =
              typeof convergenceReceipt === "object" && convergenceReceipt !== null &&
              typeof retirementReceipt === "object" && retirementReceipt !== null
                ? workspaceLifecycleEvidenceErrorCode(
                    record.run,
                    convergenceReceipt as Record<string, unknown>,
                    retirementReceipt as Record<string, unknown>,
                    evidenceRefs
                  )
                : "WORKSPACE_LIFECYCLE_RECEIPT_CONTENT_MISSING";
            if (lifecycleEvidenceError) {
              const paused = await applyTransition(tx, record, scope, {
                idempotencyKey: `reconcile:${record.run.workerJobId}:final-verify:workspace-receipt-invalid`,
                nextState: "WAITING_HUMAN_DECISION",
                eventType: "DECISION_REQUIRED",
                payload: {
                  reason: "workspace_lifecycle_receipt_invalid",
                  errorCode: lifecycleEvidenceError,
                  workerJobId: record.run.workerJobId,
                },
              });
              return {
                action: "WAIT",
                run: paused.run,
                revision: paused.revision,
                reason: "workspace_lifecycle_receipt_invalid",
              };
            }
            let closureErrorCode: string | null = null;
            try {
              const provenanceErrorCode = finalVerifyProvenanceErrorCode(
                record.run,
                job.output
              );
              if (provenanceErrorCode) {
                closureErrorCode = provenanceErrorCode;
              } else {
                const graph = persistedClosureGraph(record.run);
                assertRequirementClosureEvidenceBoundToRun(graph, record.run);
                assertFinalVerifyReady(graph);
              }
            } catch (error) {
              if (error instanceof Spec224ClosureError) {
                closureErrorCode = error.code;
              } else if (
                error instanceof Error &&
                [
                  "CLOSURE_GRAPH_NOT_FOUND",
                  "CLOSURE_GRAPH_INVALID",
                  "CLOSURE_GRAPH_DIGEST_MISMATCH",
                ].includes(error.message)
              ) {
                closureErrorCode = error.message;
              } else {
                throw error;
              }
            }
            if (closureErrorCode) {
              const rejected = await applyTransition(tx, record, scope, {
                idempotencyKey: `reconcile:${record.run.workerJobId}:final-verify:rejected`,
                nextState: "DEBUG_REPAIR",
                eventType: "PHASE_FAILED",
                payload: {
                  source: "worker_job",
                  workerJobId: record.run.workerJobId,
                  resultRef: job.resultRef ?? null,
                  closureErrorCode,
                },
                evidenceRefs,
              });
              return {
                action: "RECOVER",
                run: rejected.run,
                revision: rejected.revision,
                reason: "final_verification_rejected",
              };
            }
            const completed = await applyTransition(tx, record, scope, {
              idempotencyKey: `reconcile:${record.run.workerJobId}:final-verify:completed`,
              nextState: "COMPLETED",
              eventType: "RUN_COMPLETED",
              payload: {
                source: "worker_job",
                workerJobId: record.run.workerJobId,
                resultRef: job.resultRef ?? null,
                workspaceConvergenceReceipt: convergenceReceipt,
                worktreeRetirementReceipt: retirementReceipt,
              },
              evidenceRefs,
            });
            return {
              action: "STOP",
              run: completed.run,
              revision: completed.revision,
              reason: "final_verification_passed",
            };
          }
          const nextState = PHASE_SUCCESSORS[record.run.state];
          if (!nextState) {
            return {
              action: "WAIT",
              run: record.run,
              revision: record.revision,
              reason: "no_automatic_successor",
            };
          }
          const continued = await applyTransition(tx, record, scope, {
            idempotencyKey: `reconcile:${record.run.workerJobId}:${job.attempt ?? 0}:${record.run.state}:succeeded`,
            nextState,
            eventType: "PHASE_COMPLETED",
            payload: {
              source: "worker_job",
              workerJobId: record.run.workerJobId,
              resultRef: job.resultRef ?? null,
            },
          });
          return {
            action: "CONTINUE",
            run: continued.run,
            revision: continued.revision,
            reason: "phase_succeeded",
          };
        }

        if (job.status === "cancelled") {
          if (record.run.state === "CANCELLED") {
            return {
              action: "STOP",
              run: record.run,
              revision: record.revision,
              reason: "already_cancelled",
            };
          }
          const cancelled = await applyTransition(tx, record, scope, {
            idempotencyKey: `reconcile:${record.run.workerJobId}:cancelled`,
            nextState: "CANCELLED",
            eventType: "RUN_CANCELLED",
            payload: {
              source: "worker_job",
              workerJobId: record.run.workerJobId,
            },
          });
          return {
            action: "STOP",
            run: cancelled.run,
            revision: cancelled.revision,
            reason: "worker_job_cancelled",
          };
        }

        if (job.operatorReviewRequired || job.errorCode === "UNKNOWN_OUTCOME") {
          const decision = await applyTransition(tx, record, scope, {
            idempotencyKey: `reconcile:${record.run.workerJobId}:${job.attempt ?? 0}:unknown-outcome-review`,
            nextState: "WAITING_HUMAN_DECISION",
            eventType: "DECISION_REQUIRED",
            payload: {
              source: "worker_job",
              reason: "external_outcome_unknown",
              workerJobId: record.run.workerJobId,
              status: job.status,
              errorCode: job.errorCode ?? "UNKNOWN_OUTCOME",
            },
          });
          return {
            action: "WAIT",
            run: decision.run,
            revision: decision.revision,
            reason: "external_outcome_unknown_requires_review",
          };
        }

        const canRepair = [
          "IMPLEMENT",
          "BUILD",
          "TEST",
          "REVIEW",
          "VERIFY",
          "FINAL_VERIFY",
        ].includes(record.run.state);
        const failureState: DevelopmentRunState = canRepair
          ? "DEBUG_REPAIR"
          : "WAITING_HUMAN_DECISION";
        const failed = await applyTransition(tx, record, scope, {
          idempotencyKey: `reconcile:${record.run.workerJobId}:${job.attempt ?? 0}:failed`,
          nextState: failureState,
          eventType: canRepair ? "PHASE_FAILED" : "DECISION_REQUIRED",
          payload: {
            source: "worker_job",
            workerJobId: record.run.workerJobId,
            status: job.status,
            errorCode: job.errorCode ?? null,
            errorMessage: job.errorMessage ?? null,
          },
        });
        return {
          action: canRepair ? "RECOVER" : "WAIT",
          run: failed.run,
          revision: failed.revision,
          reason: canRepair
            ? "phase_failed_repairable"
            : "phase_failed_requires_decision",
        };
      });
    },
  };
}

type WorkerJobRow = {
  id: string;
  tenantId: string;
  requestedByUserId: number | null;
  progressJson: Record<string, unknown>;
  inputJson: Record<string, unknown>;
  status: string;
  outputJson: Record<string, unknown> | null;
  resultRef: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  attempt: number;
};

function projectionFromRun(
  run: DevelopmentRun,
  projectionVersion = 0,
): Record<string, unknown> {
  return {
    ...projectionRun(run),
    projectionVersion,
  };
}

function stableCanonicalJobId(operationKey: string): string {
  return createHash("sha256")
    .update(`spec224-worker-job:${operationKey}`)
    .digest("hex")
    .slice(0, 32);
}

function eventFromRow(row: {
  payloadJson: Record<string, unknown>;
}): DevelopmentEvent | null {
  const payload = row.payloadJson;
  if (
    typeof payload.eventId !== "string" ||
    typeof payload.runId !== "string" ||
    typeof payload.sequence !== "number" ||
    typeof payload.idempotencyKey !== "string" ||
    typeof payload.type !== "string" ||
    typeof payload.occurredAt !== "string" ||
    !payload.payload ||
    typeof payload.payload !== "object" ||
    Array.isArray(payload.payload)
  )
    return null;
  return payload as unknown as DevelopmentEvent;
}

function buildDatabaseAdapter(): DevelopmentRunPersistenceAdapter {
  return {
    async transaction<T>(work) {
      getDb();
      return db.transaction(async query => {
        const findRow = async (
          runId: string,
          scope: DevelopmentRunScope
        ): Promise<WorkerJobRow | null> => {
          const [row] = await query
            .select({
              id: workerJobs.id,
              tenantId: workerJobs.tenantId,
              requestedByUserId: workerJobs.requestedByUserId,
              progressJson: workerJobs.progressJson,
              inputJson: workerJobs.inputJson,
              status: workerJobs.status,
              outputJson: workerJobs.outputJson,
              resultRef: workerJobs.resultRef,
              errorCode: workerJobs.errorCode,
              errorMessage: workerJobs.errorMessage,
              attempt: workerJobs.attempt,
            })
            .from(workerJobs)
            .where(
              and(
                eq(workerJobs.tenantId, scope.tenantId),
                eq(workerJobs.requestedByUserId, scope.actorId),
                or(
                  sql`${workerJobs.inputJson}->'spec224Run'->>'runId' = ${runId}`,
                  sql`${workerJobs.progressJson}->'spec224'->>'runId' = ${runId}`
                )
              )
            )
            .for("update")
            .limit(1);
          return row ?? null;
        };

        const loadEvents = async (
          workerJobId: string
        ): Promise<DevelopmentEvent[]> => {
          const rows = await query
            .select({ payloadJson: workerJobEvents.payloadJson })
            .from(workerJobEvents)
            .where(
              and(
                eq(workerJobEvents.workerJobId, workerJobId),
                like(workerJobEvents.eventType, "SPEC224_%")
              )
            )
            .orderBy(asc(workerJobEvents.eventSequence));
          return rows
            .map(eventFromRow)
            .filter((event): event is DevelopmentEvent => Boolean(event));
        };

        const load = async (
          runId: string,
          scope: DevelopmentRunScope
        ): Promise<DevelopmentRunStoreRecord | null> => {
          const row = await findRow(runId, scope);
          if (!row) return null;
          const projection = row.progressJson.spec224;
          if (
            !projection ||
            typeof projection !== "object" ||
            Array.isArray(projection)
          )
            return null;
          const events = await loadEvents(row.id);
          const genericLifecycle = row.progressJson.developmentLifecycle;
          const genericWorkUnit = genericLifecycle && typeof genericLifecycle === "object" && !Array.isArray(genericLifecycle)
            ? (genericLifecycle as Record<string, unknown>).workUnit
            : undefined;
          const run = {
            ...(projection as DevelopmentRun),
            ...(genericWorkUnit ? { workUnit: genericWorkUnit as DevelopmentRun["workUnit"] } : {}),
            events,
            eventIdempotencyKeys: events.map(event => event.idempotencyKey),
          } as DevelopmentRun;
          const revision = Number(
            (projection as Record<string, unknown>).projectionVersion ??
            (genericLifecycle as Record<string, unknown> | undefined)?.projectionVersion ?? 0
          );
          return {
            run,
            revision: Number.isSafeInteger(revision) ? revision : 0,
            events,
          };
        };

        const tx: DevelopmentRunPersistenceTx = {
          load,
          async findEvent(runId, idempotencyKey, scope) {
            const record = await load(runId, scope);
            return (
              record?.events.find(
                event => event.idempotencyKey === idempotencyKey
              ) ?? null
            );
          },
          async save(next, expectedRevision, scope) {
            const row = await findRow(next.run.runId, scope);
            if (!row) throw new Error("RUN_NOT_FOUND");
            const existing = row.progressJson.spec224;
            const currentRevision =
              existing &&
              typeof existing === "object" &&
              !Array.isArray(existing)
                ? Number(
                    (existing as Record<string, unknown>).projectionVersion ?? 0
                  )
                : -1;
            if (currentRevision !== expectedRevision)
              throw new Error("RUN_PROJECTION_STALE");
            const progress = {
              ...row.progressJson,
              ...(next.run.workUnit ? {
                // Canonical generic WorkUnit plus atomic Spec 224 compatibility projection below.
                developmentLifecycle: {
                  schemaVersion: "development-lifecycle.work-unit.v1",
                  projectionVersion: next.revision,
                  runId: next.run.runId,
                  fencingVersion: next.run.fencingVersion,
                  workUnit: next.run.workUnit,
                },
              } : {}),
              spec224: projectionFromRun(next.run, next.revision),
            };
            await query
              .update(workerJobs)
              .set({ progressJson: progress })
              .where(
                and(
                  eq(workerJobs.id, row.id),
                  eq(workerJobs.tenantId, scope.tenantId),
                  eq(workerJobs.requestedByUserId, scope.actorId)
                )
              );
          },
          async appendEvent(event, scope) {
            const row = await findRow(event.runId, scope);
            if (!row) throw new Error("RUN_NOT_FOUND");
            await appendJobEvent(query, {
              workerJobId: row.id,
              eventType: `SPEC224_${event.type}`,
              eventIdempotencyKey: durableEventKey(
                event.runId,
                event.idempotencyKey
              ),
              payloadJson: event as unknown as Record<string, unknown>,
            });
            return event;
          },
          async getCanonicalJob(run, scope) {
            if (!run.workerJobId) return null;
            const [row] = await query
              .select({
                status: workerJobs.status,
                output: workerJobs.outputJson,
                resultRef: workerJobs.resultRef,
                errorCode: workerJobs.errorCode,
                errorMessage: workerJobs.errorMessage,
                attempt: workerJobs.attempt,
                operatorReviewRequired: workerJobs.operatorReviewRequired,
              })
              .from(workerJobs)
              .where(
                and(
                  eq(workerJobs.id, run.workerJobId),
                  eq(workerJobs.tenantId, scope.tenantId),
                  eq(workerJobs.requestedByUserId, scope.actorId)
                )
              )
              .limit(1);
            return row ?? null;
          },
          async createCanonicalJob(definition) {
            return createCanonicalJobInTransaction({
              query,
              definition,
              options: { runtimeType: "node_job_worker", admissionMode: "durable_queue" },
            });
          },
        };
        return work(tx);
      });
    },
  };
}

export const defaultDevelopmentRunPersistenceAdapter = buildDatabaseAdapter();

export async function createPersistedDevelopmentRun(input: {
  run: DevelopmentRun;
  provider: "codex" | "claude_code";
  runtime: "local_runner" | "cloudflare_container";
  planId: string;
  planRevision: number;
  skillIds: string[];
  requestedCapabilities: string[];
  deferredAdmission?: boolean;
  policyBinding?: AgentTaskPolicyBinding;
  authorizationScope: string;
  correlationId?: string;
  persistence?: DevelopmentRunPersistenceAdapter;
  controlPlane?: JobControlPlane;
  executorRegistry?: JobExecutorRegistry;
}): Promise<{
  run: DevelopmentRun;
  jobRef: { jobId: string; created: boolean };
}> {
  const prepared = buildDevelopmentHarnessJob(input);
  const canonicalJobId = stableCanonicalJobId(`run:${input.run.runId}`);
  const jobRef = await createControlPlaneJob({
    context: {
      tenantId: input.run.tenantId,
      actorType: "user",
      actorId: input.run.actorId,
      authorizationScope: input.authorizationScope,
      correlationId:
        input.correlationId ?? `development-run:${input.run.runId}`,
      idempotencyKey: prepared.definition.idempotencyKey,
    },
    definition: {
      ...prepared.definition,
      input: {
        ...prepared.definition.input,
        spec224Run: projectionFromRun({
          ...input.run,
          workerJobId: canonicalJobId,
        }),
      },
    },
    controlPlane: input.controlPlane,
    executorRegistry: input.executorRegistry,
    createOptions: {
      runtimeType: "external_runtime",
      canonicalJobId,
      ...(input.deferredAdmission ? { deferredAdmission: true } : {}),
    },
  });
  const boundRun = bindWorkerJob(input.run, jobRef.jobId);
  const service = createDevelopmentRunService(
    input.persistence ?? defaultDevelopmentRunPersistenceAdapter
  );
  const record = await service.initialize({
    run: boundRun,
    eventIdempotencyKey: `run-created:${jobRef.jobId}`,
    scope: { tenantId: boundRun.tenantId, actorId: boundRun.actorId },
  });
  return { run: record.run, jobRef };
}
