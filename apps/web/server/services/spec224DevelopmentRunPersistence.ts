import { createHash } from "node:crypto";

import { and, asc, eq, like, or, sql } from "drizzle-orm";

import { workerJobEvents, workerJobs } from "../../drizzle/schema";
import { db, getDb } from "../db";
import { appendJobEvent, type JobControlPlane } from "./jobControlPlane";
import { createControlPlaneJob } from "./jobControlPlaneGateway";
import type { JobExecutorRegistry } from "./jobExecutorRegistry";
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
  adapter: DevelopmentRunPersistenceAdapter
) {
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
  projectionVersion = 0
): Record<string, unknown> {
  return {
    ...projectionRun(run),
    projectionVersion,
  };
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
          const run = {
            ...(projection as DevelopmentRun),
            events,
            eventIdempotencyKeys: events.map(event => event.idempotencyKey),
          } as DevelopmentRun;
          const revision = Number(
            (projection as Record<string, unknown>).projectionVersion ?? 0
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
        spec224Run: projectionFromRun(input.run),
      },
    },
    controlPlane: input.controlPlane,
    executorRegistry: input.executorRegistry,
    createOptions: { runtimeType: "external_runtime" },
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
