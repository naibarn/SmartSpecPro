import { and, desc, eq, sql } from "drizzle-orm";

import { workerJobs } from "../../drizzle/schema";
import { db, getDb } from "../db";
import {
  decideNextSafeAction,
  type DevelopmentEvent,
  type DevelopmentEventType,
  type DevelopmentRun,
  type DevelopmentRunState,
} from "./spec224DevelopmentRunContracts";
import type { RequirementClosureGraph } from "./spec224RequirementClosureContracts";
import {
  createDevelopmentRunService,
  defaultDevelopmentRunPersistenceAdapter,
  type DevelopmentRunPersistenceAdapter,
} from "./spec224DevelopmentRunPersistence";
import { createRequirementClosurePersistenceService } from "./spec224RequirementClosurePersistence";

export const SPEC_226_DEVELOPMENT_CONTROL_BRIDGE_VERSION =
  "spec-226-development-control-v3" as const;

export type Spec226DevelopmentRunScope = {
  tenantId: string;
  actorId: number;
};

export type Spec226DevelopmentRunAction = "pause" | "cancel";

export type Spec226DevelopmentRunView = {
  bridgeVersion: typeof SPEC_226_DEVELOPMENT_CONTROL_BRIDGE_VERSION;
  runId: string;
  state: DevelopmentRunState;
  phaseAttempt: number;
  maxPhaseAttempts: number;
  workerJobId: string | null;
  fencingVersion: number;
  revision: number;
  decisionEpoch: number;
  eventSequence: number;
  evidenceRefs: string[];
  closure: RequirementClosureGraph | null;
  nextSafeAction: ReturnType<typeof decideNextSafeAction>;
  actions: {
    pause: boolean;
    cancel: boolean;
  };
};

export type Spec226DevelopmentRunList = {
  list(input: {
    scope: Spec226DevelopmentRunScope;
    limit: number;
  }): Promise<Array<DevelopmentRun & { projectionVersion?: unknown }>>;
};

export type Spec226DevelopmentControlBridge = ReturnType<
  typeof createSpec226DevelopmentControlBridge
>;

function assertScope(scope: Spec226DevelopmentRunScope): void {
  if (
    !scope.tenantId.trim() ||
    !Number.isSafeInteger(scope.actorId) ||
    scope.actorId <= 0
  ) {
    throw new Error("RUN_SCOPE_INVALID");
  }
}

function supportsPause(state: DevelopmentRunState): boolean {
  return state === "PLANNING" || state === "IMPLEMENT";
}

function supportsCancel(state: DevelopmentRunState): boolean {
  return !["COMPLETED", "CANCELLED", "FAILED_TERMINAL"].includes(state);
}

function toView(input: {
  run: DevelopmentRun;
  revision: number;
  closure?: Spec226DevelopmentRunView["closure"];
}): Spec226DevelopmentRunView {
  return {
    bridgeVersion: SPEC_226_DEVELOPMENT_CONTROL_BRIDGE_VERSION,
    runId: input.run.runId,
    state: input.run.state,
    phaseAttempt: input.run.phaseAttempt,
    maxPhaseAttempts: input.run.maxPhaseAttempts,
    workerJobId: input.run.workerJobId,
    fencingVersion: input.run.fencingVersion,
    revision: input.revision,
    decisionEpoch: input.run.decisionEpoch,
    eventSequence: input.run.eventSequence,
    evidenceRefs: [...input.run.evidenceRefs],
    closure: input.closure ?? null,
    nextSafeAction: decideNextSafeAction(input.run),
    actions: {
      pause: supportsPause(input.run.state),
      cancel: supportsCancel(input.run.state),
    },
  };
}

function projectionRevision(
  run: DevelopmentRun & { projectionVersion?: unknown }
): number {
  const revision = Number(run.projectionVersion ?? 0);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

function databaseRunList(): Spec226DevelopmentRunList {
  return {
    async list({ scope, limit }) {
      assertScope(scope);
      getDb();
      const rows = await db
        .select({ progressJson: workerJobs.progressJson })
        .from(workerJobs)
        .where(
          and(
            eq(workerJobs.tenantId, scope.tenantId),
            eq(workerJobs.requestedByUserId, scope.actorId),
            sql`${workerJobs.progressJson}->'spec224' IS NOT NULL`
          )
        )
        .orderBy(desc(workerJobs.createdAt))
        .limit(limit);
      return rows.flatMap(row => {
        const projection = row.progressJson?.spec224;
        if (
          !projection ||
          typeof projection !== "object" ||
          Array.isArray(projection)
        ) {
          return [];
        }
        const run = projection as DevelopmentRun & {
          projectionVersion?: unknown;
        };
        if (
          run.tenantId !== scope.tenantId ||
          run.actorId !== scope.actorId ||
          run.contractVersion !== "spec-224-v1"
        ) {
          return [];
        }
        return [run];
      });
    },
  };
}

function expectedEventType(
  action: Spec226DevelopmentRunAction
): DevelopmentEventType {
  return action === "pause" ? "RUN_PAUSED" : "RUN_CANCELLED";
}

function assertDuplicateAction(
  event: DevelopmentEvent,
  action: Spec226DevelopmentRunAction
): void {
  if (
    event.type !== expectedEventType(action) ||
    event.payload.action !== action ||
    event.payload.source !== "spec226_task_control"
  ) {
    throw new Error("RUN_IDEMPOTENCY_CONFLICT");
  }
}

function transitionForAction(
  action: Spec226DevelopmentRunAction,
  run: DevelopmentRun
): {
  nextState: DevelopmentRunState;
  eventType: DevelopmentEventType;
} {
  if (action === "pause") {
    if (!supportsPause(run.state))
      throw new Error("CONTROL_ACTION_INVALID_STATE");
    return { nextState: "PAUSED_POLICY", eventType: "RUN_PAUSED" };
  }
  if (action === "cancel") {
    if (!supportsCancel(run.state))
      throw new Error("CONTROL_ACTION_INVALID_STATE");
    return { nextState: "CANCELLED", eventType: "RUN_CANCELLED" };
  }
  throw new Error("CONTROL_ACTION_UNSUPPORTED");
}

/**
 * Additive Spec 226 projection and owner-scoped control adapter. It reads and
 * writes exclusively through the canonical Spec 224 persistence service.
 * Approval/decision-resume and phase admission remain unavailable here until
 * a canonical approval binding exists; this avoids granting policy bypasses.
 */
export function createSpec226DevelopmentControlBridge(input: {
  persistence: DevelopmentRunPersistenceAdapter;
  listRuns: Spec226DevelopmentRunList["list"];
}) {
  const runs = createDevelopmentRunService(input.persistence);
  const closures = createRequirementClosurePersistenceService(
    input.persistence
  );

  return {
    async list(params: {
      tenantId: string;
      actorId: number;
      limit: number;
    }): Promise<Spec226DevelopmentRunView[]> {
      const scope = { tenantId: params.tenantId, actorId: params.actorId };
      assertScope(scope);
      const listed = await input.listRuns({ scope, limit: params.limit });
      const ownedRuns = listed.filter(
        run => run.tenantId === scope.tenantId && run.actorId === scope.actorId
      );
      return Promise.all(
        ownedRuns.map(async run => {
          let closure: RequirementClosureGraph | null = null;
          try {
            closure = (
              await closures.get({
                runId: run.runId,
                ...scope,
              })
            ).graph;
          } catch (error) {
            if (
              !(error instanceof Error) ||
              error.message !== "CLOSURE_GRAPH_NOT_FOUND"
            ) {
              throw error;
            }
          }
          return toView({
            run,
            revision: projectionRevision(run),
            closure,
          });
        })
      );
    },

    async get(params: {
      runId: string;
      tenantId: string;
      actorId: number;
    }): Promise<Spec226DevelopmentRunView> {
      const record = await runs.get(params);
      let closure: Spec226DevelopmentRunView["closure"] = null;
      try {
        closure = (await closures.get(params)).graph;
      } catch (error) {
        if (
          !(error instanceof Error) ||
          error.message !== "CLOSURE_GRAPH_NOT_FOUND"
        ) {
          throw error;
        }
      }
      return toView({ ...record, closure });
    },

    async events(params: {
      runId: string;
      tenantId: string;
      actorId: number;
      afterSequence: number;
      limit: number;
    }): Promise<{ events: DevelopmentEvent[]; nextCursor: number }> {
      if (
        !Number.isSafeInteger(params.afterSequence) ||
        params.afterSequence < 0
      ) {
        throw new Error("EVENT_CURSOR_INVALID");
      }
      if (
        !Number.isSafeInteger(params.limit) ||
        params.limit < 1 ||
        params.limit > 100
      ) {
        throw new Error("EVENT_LIMIT_INVALID");
      }
      const record = await runs.get(params);
      const events = record.events
        .filter(event => event.sequence > params.afterSequence)
        .slice(0, params.limit);
      return {
        events,
        nextCursor: events.at(-1)?.sequence ?? params.afterSequence,
      };
    },

    async command(params: {
      runId: string;
      tenantId: string;
      actorId: number;
      expectedRevision: number;
      expectedFencingVersion: number;
      expectedDecisionEpoch: number;
      idempotencyKey: string;
      action: Spec226DevelopmentRunAction;
    }) {
      const record = await runs.get(params);
      if (record.run.decisionEpoch !== params.expectedDecisionEpoch) {
        throw new Error("RUN_DECISION_EPOCH_STALE");
      }
      const duplicate = record.events.find(
        event => event.idempotencyKey === params.idempotencyKey
      );
      if (duplicate) {
        assertDuplicateAction(duplicate, params.action);
        return {
          accepted: false,
          run: record.run,
          event: duplicate,
          revision: record.revision,
        };
      }
      const transition = transitionForAction(params.action, record.run);
      return runs.command({
        runId: params.runId,
        tenantId: params.tenantId,
        actorId: params.actorId,
        expectedRevision: params.expectedRevision,
        expectedFencingVersion: params.expectedFencingVersion,
        idempotencyKey: params.idempotencyKey,
        command: {
          kind: "transition",
          nextState: transition.nextState,
          eventType: transition.eventType,
          payload: {
            source: "spec226_task_control",
            action: params.action,
          },
        },
      });
    },
  };
}

export const defaultSpec226DevelopmentControlBridge =
  createSpec226DevelopmentControlBridge({
    persistence: defaultDevelopmentRunPersistenceAdapter,
    listRuns: databaseRunList().list,
  });
