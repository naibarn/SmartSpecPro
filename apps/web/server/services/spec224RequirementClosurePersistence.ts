import { createHash } from "node:crypto";

import {
  assertFinalVerifyReady as assertClosureFinalVerifyReady,
  buildBlockerLedgerEntry,
  closeBlocker,
  compileRequirementClosureGraph,
  type BlockerLedgerEntry,
  type BlockerStatus,
  type RequirementClosureGraph,
} from "./spec224RequirementClosureContracts";
import {
  recordDevelopmentEvent,
  type DevelopmentEvent,
  type DevelopmentRun,
} from "./spec224DevelopmentRunContracts";
import type {
  DevelopmentRunPersistenceAdapter,
  DevelopmentRunPersistenceTx,
  DevelopmentRunScope,
  DevelopmentRunStoreRecord,
} from "./spec224DevelopmentRunPersistence";

const CLOSURE_METADATA_KEY = "spec224RequirementClosure";
const CLOSURE_PROJECTION_VERSION = "spec-224-closure-projection-v1" as const;
const MAX_GRAPH_BYTES = 512_000;
const MAX_EVENT_IDS = 50;

type ClosureProjection = {
  projectionVersion: typeof CLOSURE_PROJECTION_VERSION;
  graph: RequirementClosureGraph;
  graphDigest: string;
};

export type RequirementClosureProjectionResult = {
  accepted: boolean;
  graph: RequirementClosureGraph;
  revision: number;
  event: DevelopmentEvent | null;
};

export type PersistedRequirementClosure = {
  graph: RequirementClosureGraph;
  revision: number;
};

type AttachGraphInput = {
  runId: string;
  tenantId: string;
  actorId: number;
  expectedRevision: number;
  expectedFencingVersion: number;
  idempotencyKey: string;
  graph: RequirementClosureGraph;
};

type UpsertBlockerInput = {
  runId: string;
  tenantId: string;
  actorId: number;
  expectedRevision: number;
  expectedFencingVersion: number;
  idempotencyKey: string;
  blocker: BlockerLedgerEntry;
  verificationRefs?: string[];
};

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

function digest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}

function eventIdFor(runId: string, idempotencyKey: string): string {
  return `event-${digest({ runId, idempotencyKey })}`;
}

function boundedIds(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort().slice(0, MAX_EVENT_IDS);
}

function validateGraph(
  graph: RequirementClosureGraph
): RequirementClosureGraph {
  if (graph.contractVersion !== "spec-224-closure-v1") {
    throw new Error("CLOSURE_GRAPH_INVALID");
  }
  const normalized = compileRequirementClosureGraph({
    baseline: graph.baseline,
    requirements: graph.requirements.map(requirement => ({
      id: requirement.id,
      sourceRef: requirement.sourceRef,
      text: requirement.text,
    })),
    planSections: graph.planSections,
    workPackages: graph.workPackages,
  });
  if (JSON.stringify(normalized.reverse) !== JSON.stringify(graph.reverse)) {
    throw new Error("CLOSURE_GRAPH_INVALID");
  }
  const cloned = structuredClone(graph);
  if (Buffer.byteLength(JSON.stringify(cloned), "utf8") > MAX_GRAPH_BYTES) {
    throw new Error("CLOSURE_GRAPH_OVERSIZED");
  }
  return cloned;
}

function projectionFrom(run: DevelopmentRun): ClosureProjection {
  const value = run.metadata?.[CLOSURE_METADATA_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CLOSURE_GRAPH_NOT_FOUND");
  }
  const projection = value as Partial<ClosureProjection>;
  if (
    projection.projectionVersion !== CLOSURE_PROJECTION_VERSION ||
    !projection.graph ||
    typeof projection.graph !== "object" ||
    typeof projection.graphDigest !== "string" ||
    !/^[a-f0-9]{64}$/.test(projection.graphDigest)
  ) {
    throw new Error("CLOSURE_GRAPH_INVALID");
  }
  const graph = validateGraph(projection.graph as RequirementClosureGraph);
  if (digest(graph) !== projection.graphDigest) {
    throw new Error("CLOSURE_GRAPH_DIGEST_MISMATCH");
  }
  return {
    projectionVersion: CLOSURE_PROJECTION_VERSION,
    graph,
    graphDigest: projection.graphDigest,
  };
}

function runWithProjection(
  run: DevelopmentRun,
  projection: ClosureProjection
): DevelopmentRun {
  return {
    ...run,
    metadata: {
      ...run.metadata,
      [CLOSURE_METADATA_KEY]: structuredClone(projection),
    },
  };
}

function assertScope(
  record: DevelopmentRunStoreRecord,
  scope: DevelopmentRunScope
): void {
  if (
    record.run.tenantId !== scope.tenantId ||
    record.run.actorId !== scope.actorId
  ) {
    throw new Error("RUN_SCOPE_FORBIDDEN");
  }
}

function eventOperationDigest(input: {
  action: string;
  graphDigest: string;
  blockerId?: string;
  requirementIds?: string[];
  verificationRefs?: string[];
}): string {
  return digest(input);
}

function duplicateResult(
  record: DevelopmentRunStoreRecord,
  event: DevelopmentEvent,
  operationDigest: string
): RequirementClosureProjectionResult {
  if (
    event.type !== "EVIDENCE_RECORDED" ||
    event.payload.operationDigest !== operationDigest
  ) {
    throw new Error("RUN_IDEMPOTENCY_CONFLICT");
  }
  return {
    accepted: false,
    graph: projectionFrom(record.run).graph,
    revision: record.revision,
    event,
  };
}

async function persistEvidence(input: {
  tx: DevelopmentRunPersistenceTx;
  record: DevelopmentRunStoreRecord;
  scope: DevelopmentRunScope;
  expectedRevision: number;
  idempotencyKey: string;
  operationDigest: string;
  projection: ClosureProjection;
  action: string;
  blockerId?: string;
  requirementIds: string[];
  verificationRefs?: string[];
  requestedStatus?: BlockerStatus;
}): Promise<RequirementClosureProjectionResult> {
  const { tx, record, scope } = input;
  if (record.revision !== input.expectedRevision) {
    throw new Error("RUN_PROJECTION_STALE");
  }
  const recorded = recordDevelopmentEvent(record.run, {
    eventId: eventIdFor(record.run.runId, input.idempotencyKey),
    idempotencyKey: input.idempotencyKey,
    type: "EVIDENCE_RECORDED",
    payload: {
      action: input.action,
      operationDigest: input.operationDigest,
      graphDigest: input.projection.graphDigest,
      ...(input.blockerId ? { blockerId: input.blockerId } : {}),
      requirementIds: boundedIds(input.requirementIds),
      ...(input.verificationRefs
        ? { verificationDigest: digest(boundedIds(input.verificationRefs)) }
        : {}),
      ...(input.requestedStatus
        ? { requestedStatus: input.requestedStatus }
        : {}),
    },
  });
  if (!recorded.event) throw new Error("RUN_EVENT_DUPLICATE_UNEXPECTED");
  const next: DevelopmentRunStoreRecord = {
    run: runWithProjection(recorded.run, input.projection),
    revision: record.revision + 1,
    events: [...record.events, recorded.event],
  };
  await tx.save(next, record.revision, scope);
  await tx.appendEvent(recorded.event, scope);
  return {
    accepted: true,
    graph: input.projection.graph,
    revision: next.revision,
    event: recorded.event,
  };
}

function validBlockerStatus(value: BlockerStatus): BlockerStatus {
  if (
    !["OPEN", "INVESTIGATING", "REPAIR", "VERIFY", "CLOSED"].includes(value)
  ) {
    throw new Error("BLOCKER_STATUS_INVALID");
  }
  return value;
}

function nextBlocker(
  graph: RequirementClosureGraph,
  input: UpsertBlockerInput
): {
  graph: RequirementClosureGraph;
  action: string;
  blocker: BlockerLedgerEntry;
} {
  if (input.blocker.runId !== input.runId)
    throw new Error("BLOCKER_RUN_MISMATCH");
  const knownRequirementIds = new Set(
    graph.requirements.map(requirement => requirement.id)
  );
  if (
    input.blocker.requirementRefs.some(ref => !knownRequirementIds.has(ref))
  ) {
    throw new Error("BLOCKER_REQUIREMENT_UNKNOWN");
  }
  const requestedStatus = validBlockerStatus(input.blocker.status);
  const base = buildBlockerLedgerEntry({
    blockerId: input.blocker.blockerId,
    runId: input.runId,
    requirementRefs: input.blocker.requirementRefs,
    classification: input.blocker.classification,
    severity: input.blocker.severity,
  });
  const index = graph.blockers.findIndex(
    blocker => blocker.blockerId === base.blockerId
  );
  const existing = index === -1 ? null : graph.blockers[index]!;
  let blocker: BlockerLedgerEntry;
  let action: string;
  if (requestedStatus === "CLOSED") {
    blocker = closeBlocker(
      { ...base, status: "OPEN", reopenCount: existing?.reopenCount ?? 0 },
      input.verificationRefs ?? []
    );
    action =
      existing?.status === "CLOSED" ? "blocker_reverified" : "blocker_closed";
  } else if (existing?.status === "CLOSED") {
    blocker = {
      ...base,
      status: requestedStatus,
      verificationRefs: [],
      reopenCount: existing.reopenCount + 1,
    };
    action = "blocker_reopened";
  } else {
    blocker = {
      ...base,
      status: requestedStatus,
      verificationRefs: [],
      reopenCount: existing?.reopenCount ?? 0,
    };
    action = existing ? "blocker_updated" : "blocker_recorded";
  }
  const blockers = existing
    ? graph.blockers.map(current =>
        current.blockerId === blocker.blockerId ? blocker : current
      )
    : [...graph.blockers, blocker];
  return { graph: { ...graph, blockers }, action, blocker };
}

export function createRequirementClosurePersistenceService(
  adapter: DevelopmentRunPersistenceAdapter
) {
  return {
    async get(input: {
      runId: string;
      tenantId: string;
      actorId: number;
    }): Promise<PersistedRequirementClosure> {
      const scope = scopeFor(input);
      return adapter.transaction(async tx => {
        const record = await tx.load(input.runId, scope);
        if (!record) throw new Error("RUN_NOT_FOUND");
        assertScope(record, scope);
        return {
          graph: projectionFrom(record.run).graph,
          revision: record.revision,
        };
      });
    },

    async attachGraph(
      input: AttachGraphInput
    ): Promise<RequirementClosureProjectionResult> {
      const scope = scopeFor(input);
      return adapter.transaction(async tx => {
        const record = await tx.load(input.runId, scope);
        if (!record) throw new Error("RUN_NOT_FOUND");
        assertScope(record, scope);
        if (record.run.fencingVersion !== input.expectedFencingVersion) {
          throw new Error("RUN_FENCE_STALE");
        }
        const graph = validateGraph(input.graph);
        const projection: ClosureProjection = {
          projectionVersion: CLOSURE_PROJECTION_VERSION,
          graph,
          graphDigest: digest(graph),
        };
        const operationDigest = eventOperationDigest({
          action: "closure_graph_attached",
          graphDigest: projection.graphDigest,
          requirementIds: graph.requirements.map(requirement => requirement.id),
        });
        const duplicate = await tx.findEvent(
          input.runId,
          input.idempotencyKey,
          scope
        );
        if (duplicate)
          return duplicateResult(record, duplicate, operationDigest);
        return persistEvidence({
          tx,
          record,
          scope,
          expectedRevision: input.expectedRevision,
          idempotencyKey: input.idempotencyKey,
          operationDigest,
          projection,
          action: "closure_graph_attached",
          requirementIds: graph.requirements.map(requirement => requirement.id),
        });
      });
    },

    async upsertBlocker(
      input: UpsertBlockerInput
    ): Promise<RequirementClosureProjectionResult> {
      const scope = scopeFor(input);
      return adapter.transaction(async tx => {
        const record = await tx.load(input.runId, scope);
        if (!record) throw new Error("RUN_NOT_FOUND");
        assertScope(record, scope);
        if (record.run.fencingVersion !== input.expectedFencingVersion) {
          throw new Error("RUN_FENCE_STALE");
        }
        const current = projectionFrom(record.run);
        const duplicate = await tx.findEvent(
          input.runId,
          input.idempotencyKey,
          scope
        );
        if (duplicate) {
          const sameCommand =
            duplicate.type === "EVIDENCE_RECORDED" &&
            duplicate.payload.blockerId === input.blocker.blockerId &&
            duplicate.payload.requestedStatus === input.blocker.status &&
            JSON.stringify(duplicate.payload.requirementIds) ===
              JSON.stringify(boundedIds(input.blocker.requirementRefs)) &&
            duplicate.payload.verificationDigest ===
              (input.verificationRefs
                ? digest(boundedIds(input.verificationRefs))
                : undefined);
          if (!sameCommand) throw new Error("RUN_IDEMPOTENCY_CONFLICT");
          return {
            accepted: false,
            graph: current.graph,
            revision: record.revision,
            event: duplicate,
          };
        }
        const next = nextBlocker(current.graph, input);
        const projection: ClosureProjection = {
          projectionVersion: CLOSURE_PROJECTION_VERSION,
          graph: next.graph,
          graphDigest: digest(next.graph),
        };
        const operationDigest = digest({
          command: "blocker_upsert",
          blocker: {
            blockerId: input.blocker.blockerId,
            runId: input.blocker.runId,
            requirementRefs: boundedIds(input.blocker.requirementRefs),
            classification: input.blocker.classification,
            severity: input.blocker.severity,
            status: input.blocker.status,
          },
          verificationDigest: input.verificationRefs
            ? digest(boundedIds(input.verificationRefs))
            : null,
        });
        return persistEvidence({
          tx,
          record,
          scope,
          expectedRevision: input.expectedRevision,
          idempotencyKey: input.idempotencyKey,
          operationDigest,
          projection,
          action: next.action,
          blockerId: next.blocker.blockerId,
          requirementIds: next.blocker.requirementRefs,
          verificationRefs: input.verificationRefs,
          requestedStatus: input.blocker.status,
        });
      });
    },

    async assertFinalVerifyReady(input: {
      runId: string;
      tenantId: string;
      actorId: number;
    }): Promise<true> {
      const persisted = await this.get(input);
      return assertClosureFinalVerifyReady(persisted.graph);
    },
  };
}
