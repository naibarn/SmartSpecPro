import { createHash } from "node:crypto";

import {
  assertFinalVerifyReady as assertClosureFinalVerifyReady,
  assertRequirementClosureEvidenceBoundToRun,
  buildBlockerLedgerEntry,
  closeBlocker,
  validateRequirementClosureGraph,
  type BlockerLedgerEntry,
  type BlockerStatus,
  type DeferredTestCategory,
  type DeferredTestObligation,
  type RequirementClosureGraph,
} from "./spec224RequirementClosureContracts";
import {
  recordDevelopmentEvent,
  type DevelopmentEvent,
  type DevelopmentEventType,
  type DevelopmentRun,
} from "./spec224DevelopmentRunContracts";
import type {
  DevelopmentRunPersistenceAdapter,
  DevelopmentRunPersistenceTx,
  DevelopmentRunScope,
  DevelopmentRunStoreRecord,
} from "./spec224DevelopmentRunPersistence";

const CLOSURE_METADATA_KEY = "spec224RequirementClosure";
const CLOSURE_PROJECTION_VERSION = "spec-224-closure-projection-v2" as const;
const MAX_GRAPH_BYTES = 512_000;
const MAX_EVENT_IDS = 50;

type ClosureProjection = {
  projectionVersion: typeof CLOSURE_PROJECTION_VERSION;
  graph: RequirementClosureGraph;
  graphDigest: string;
};

type InvalidatedDeferredTestReference = {
  obligationId: string;
  version: number;
  reason: string;
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

type RecordDeferredTestObligationInput = {
  runId: string;
  tenantId: string;
  actorId: number;
  expectedRevision: number;
  expectedFencingVersion: number;
  idempotencyKey: string;
  obligationId: string;
  requirementId: string;
  workPackageId: string;
  category: DeferredTestCategory;
  testTarget: string;
  reason: string;
  requiredEnvironment: string;
};

type InvalidateDeferredTestObligationInput = {
  runId: string;
  tenantId: string;
  actorId: number;
  expectedRevision: number;
  expectedFencingVersion: number;
  idempotencyKey: string;
  obligationId: string;
  expectedVersion: number;
  reason: string;
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
  graph: RequirementClosureGraph,
  expectedRunId?: string
): RequirementClosureGraph {
  const cloned = validateRequirementClosureGraph(graph);
  if (
    expectedRunId &&
    (cloned.blockers.some(blocker => blocker.runId !== expectedRunId) ||
      cloned.deferredTestObligations?.some(
        obligation => obligation.runId !== expectedRunId
      ))
  ) {
    throw new Error("CLOSURE_RECORD_RUN_MISMATCH");
  }
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
  const graph = validateGraph(
    projection.graph as RequirementClosureGraph,
    run.runId
  );
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
  invalidatedEvidenceRefs?: string[];
}): string {
  return digest({
    ...input,
    invalidatedEvidenceRefs: input.invalidatedEvidenceRefs
      ? boundedIds(input.invalidatedEvidenceRefs)
      : undefined,
  });
}

function persistedClosureOrNull(run: DevelopmentRun): ClosureProjection | null {
  try {
    return projectionFrom(run);
  } catch (error) {
    if (error instanceof Error && error.message === "CLOSURE_GRAPH_NOT_FOUND") {
      return null;
    }
    throw error;
  }
}

function assertEvidenceBoundToRun(
  graph: RequirementClosureGraph,
  run: DevelopmentRun
): void {
  assertRequirementClosureEvidenceBoundToRun(graph, run);
}

function invalidateStaleEvidence(
  graph: RequirementClosureGraph,
  invalidatedAt: string
): RequirementClosureGraph {
  return {
    ...graph,
    workPackages: graph.workPackages.map(workPackage => {
      const evidence = workPackage.evidence.map(binding => {
        if (binding.invalidatedAt !== null) return binding;
        const baselineStale =
          binding.baselineId !== graph.baseline.baselineId ||
          binding.sourceArtifactDigest !== graph.baseline.sourceArtifactDigest;
        const sourceStale =
          !graph.sourceInventory ||
          binding.implementationDigest !==
            graph.sourceInventory.candidateManifestDigest;
        if (!baselineStale && !sourceStale) return binding;
        return {
          ...binding,
          invalidatedAt,
          invalidationReason: baselineStale
            ? "SPEC_BASELINE_CHANGED"
            : "IMPLEMENTATION_SOURCE_CHANGED",
        };
      });
      const invalidated = evidence.some(binding =>
        workPackage.evidence.some(
          original =>
            original.evidenceRef === binding.evidenceRef &&
            original.invalidatedAt === null &&
            binding.invalidatedAt !== null
        )
      );
      return {
        ...workPackage,
        status:
          invalidated && ["VERIFIED", "COMPLETE"].includes(workPackage.status)
            ? "IMPLEMENTED_UNVERIFIED"
            : workPackage.status,
        evidence,
        evidenceRefs: evidence
          .filter(binding => binding.invalidatedAt === null)
          .map(binding => binding.evidenceRef)
          .sort(),
      };
    }),
    requirements: graph.requirements.map(requirement => {
      const evidence = requirement.evidence.map(binding => {
        if (binding.invalidatedAt !== null) return binding;
        const baselineStale =
          binding.baselineId !== graph.baseline.baselineId ||
          binding.sourceArtifactDigest !== graph.baseline.sourceArtifactDigest;
        const sourceStale =
          !graph.sourceInventory ||
          binding.implementationDigest !==
            graph.sourceInventory.candidateManifestDigest;
        if (!baselineStale && !sourceStale) return binding;
        return {
          ...binding,
          invalidatedAt,
          invalidationReason: baselineStale
            ? "SPEC_BASELINE_CHANGED"
            : "IMPLEMENTATION_SOURCE_CHANGED",
        };
      });
      const evidenceWasInvalidated = evidence.some(
        binding =>
          binding.invalidatedAt !== null &&
          requirement.evidence.some(
            original =>
              original.evidenceRef === binding.evidenceRef &&
              original.invalidatedAt === null
          )
      );
      return {
        ...requirement,
        state:
          evidenceWasInvalidated &&
          [
            "VERIFIED_PASS",
            "WAIVED_BY_AUTHORIZED_DECISION",
            "NOT_APPLICABLE_WITH_EVIDENCE",
          ].includes(requirement.state)
            ? "IMPLEMENTED_UNVERIFIED"
            : requirement.state,
        evidence,
        evidenceRefs: evidence
          .filter(item => item.invalidatedAt === null)
          .map(item => item.evidenceRef)
          .sort(),
      };
    }),
  };
}

function duplicateResult(
  record: DevelopmentRunStoreRecord,
  event: DevelopmentEvent,
  operationDigest: string
): RequirementClosureProjectionResult {
  if (
    ![
      "EVIDENCE_RECORDED",
      "DEFERRED_TEST_OBLIGATION_RECORDED",
      "DEFERRED_TEST_OBLIGATION_INVALIDATED",
    ].includes(event.type) ||
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
  eventType?: DevelopmentEventType;
  blockerId?: string;
  deferredTestObligationId?: string;
  deferredTestObligationVersion?: number;
  invalidatedDeferredTestObligations?: InvalidatedDeferredTestReference[];
  requirementIds: string[];
  verificationRefs?: string[];
  requestedStatus?: BlockerStatus;
  invalidatedEvidenceRefs?: string[];
}): Promise<RequirementClosureProjectionResult> {
  const { tx, record, scope } = input;
  if (record.revision !== input.expectedRevision) {
    throw new Error("RUN_PROJECTION_STALE");
  }
  const recorded = recordDevelopmentEvent(record.run, {
    eventId: eventIdFor(record.run.runId, input.idempotencyKey),
    idempotencyKey: input.idempotencyKey,
    type: input.eventType ?? "EVIDENCE_RECORDED",
    payload: {
      action: input.action,
      operationDigest: input.operationDigest,
      graphDigest: input.projection.graphDigest,
      ...(input.blockerId ? { blockerId: input.blockerId } : {}),
      ...(input.deferredTestObligationId
        ? { deferredTestObligationId: input.deferredTestObligationId }
        : {}),
      ...(input.deferredTestObligationVersion !== undefined
        ? { deferredTestObligationVersion: input.deferredTestObligationVersion }
        : {}),
      ...(input.invalidatedDeferredTestObligations?.length
        ? {
            invalidatedDeferredTestObligations:
              input.invalidatedDeferredTestObligations.slice(0, MAX_EVENT_IDS),
          }
        : {}),
      requirementIds: boundedIds(input.requirementIds),
      ...(input.invalidatedEvidenceRefs?.length
        ? { invalidatedEvidenceRefs: boundedIds(input.invalidatedEvidenceRefs) }
        : {}),
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
    openedBy: `user:${input.actorId}`,
    currentOwner: input.blocker.currentOwner,
    subrunRef: input.blocker.subrunRef,
  });
  const index = graph.blockers.findIndex(
    blocker => blocker.blockerId === base.blockerId
  );
  const existing = index === -1 ? null : graph.blockers[index]!;
  let blocker: BlockerLedgerEntry;
  let action: string;
  if (requestedStatus === "CLOSED") {
    blocker = closeBlocker(
      {
        ...base,
        openedBy: existing?.openedBy ?? base.openedBy,
        openedAt: existing?.openedAt ?? base.openedAt,
        status: "OPEN",
        reopenCount: existing?.reopenCount ?? 0,
      },
      input.verificationRefs ?? []
    );
    blocker.resolution =
      input.blocker.resolution ?? "Verified closure evidence recorded";
    action =
      existing?.status === "CLOSED" ? "blocker_reverified" : "blocker_closed";
  } else if (existing?.status === "CLOSED") {
    blocker = {
      ...base,
      openedBy: existing.openedBy,
      openedAt: existing.openedAt,
      status: requestedStatus,
      resolution: null,
      closedAt: null,
      verificationRefs: [],
      reopenCount: existing.reopenCount + 1,
    };
    action = "blocker_reopened";
  } else {
    blocker = {
      ...base,
      openedBy: existing?.openedBy ?? base.openedBy,
      openedAt: existing?.openedAt ?? base.openedAt,
      status: requestedStatus,
      resolution: null,
      closedAt: null,
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
        // Deferred-test history is server-managed run state. Never admit a
        // caller-supplied projection as its source of truth.
        const { deferredTestObligations: _ignored, ...requestedGraphInput } =
          input.graph;
        void _ignored;
        const requestedGraph = validateGraph(requestedGraphInput, input.runId);
        const operationDigest = eventOperationDigest({
          action: "closure_graph_attached",
          graphDigest: digest(requestedGraph),
          requirementIds: requestedGraph.requirements.map(
            requirement => requirement.id
          ),
        });
        const duplicate = await tx.findEvent(
          input.runId,
          input.idempotencyKey,
          scope
        );
        if (duplicate)
          return duplicateResult(record, duplicate, operationDigest);
        if (record.revision !== input.expectedRevision) {
          throw new Error("RUN_PROJECTION_STALE");
        }

        const previous = persistedClosureOrNull(record.run);
        const invalidationTimestamp = new Date().toISOString();
        const invalidated = invalidateStaleEvidence(
          requestedGraph,
          invalidationTimestamp
        );
        const historicalObligations =
          previous?.graph.deferredTestObligations ?? [];
        const invalidatedDeferredTestObligations: InvalidatedDeferredTestReference[] =
          [];
        const obligations = historicalObligations.map(obligation => {
          if (obligation.invalidatedAt !== null) return obligation;
          const requirement = invalidated.requirements.find(
            item => item.id === obligation.requirementId
          );
          const workPackage = invalidated.workPackages.find(
            item => item.id === obligation.workPackageId
          );
          const baselineChanged =
            obligation.specId !== invalidated.baseline.specId ||
            obligation.specRevision !== invalidated.baseline.revision ||
            obligation.sourceArtifactDigest !==
              invalidated.baseline.sourceArtifactDigest ||
            obligation.specDigest !== invalidated.baseline.digest;
          const ownershipChanged =
            !requirement?.workPackageIds.includes(obligation.workPackageId) ||
            !workPackage?.requirementIds.includes(obligation.requirementId);
          if (!baselineChanged && !ownershipChanged) return obligation;
          const reason = baselineChanged
            ? "SPEC_BASELINE_CHANGED"
            : "REQUIREMENT_PACKAGE_BINDING_CHANGED";
          invalidatedDeferredTestObligations.push({
            obligationId: obligation.obligationId,
            version: obligation.version,
            reason,
          });
          return {
            ...obligation,
            invalidatedAt: invalidationTimestamp,
            invalidationReason: reason,
          };
        });
        const graph = validateGraph(
          {
            ...invalidated,
            ...(previous?.graph.deferredTestObligations !== undefined ||
            obligations.length > 0
              ? { deferredTestObligations: obligations }
              : {}),
          },
          input.runId
        );
        assertEvidenceBoundToRun(graph, record.run);
        const invalidatedEvidenceRefs = [
          ...graph.requirements.flatMap(requirement =>
            requirement.evidence
              .filter(
                evidence => evidence.invalidatedAt === invalidationTimestamp
              )
              .map(evidence => evidence.evidenceRef)
          ),
          ...graph.workPackages.flatMap(workPackage =>
            workPackage.evidence
              .filter(
                evidence => evidence.invalidatedAt === invalidationTimestamp
              )
              .map(evidence => evidence.evidenceRef)
          ),
        ].sort();
        const projection: ClosureProjection = {
          projectionVersion: CLOSURE_PROJECTION_VERSION,
          graph,
          graphDigest: digest(graph),
        };
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
          invalidatedEvidenceRefs,
          invalidatedDeferredTestObligations,
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
        assertEvidenceBoundToRun(next.graph, record.run);
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

    async recordDeferredTestObligation(
      input: RecordDeferredTestObligationInput
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
        const operationDigest = digest({
          command: "deferred_test_obligation_record",
          obligationId: input.obligationId,
          requirementId: input.requirementId,
          workPackageId: input.workPackageId,
          category: input.category,
          testTarget: input.testTarget,
          reason: input.reason,
          requiredEnvironment: input.requiredEnvironment,
        });
        const duplicate = await tx.findEvent(
          input.runId,
          input.idempotencyKey,
          scope
        );
        if (duplicate)
          return duplicateResult(record, duplicate, operationDigest);
        if (record.revision !== input.expectedRevision) {
          throw new Error("RUN_PROJECTION_STALE");
        }
        const existing = current.graph.deferredTestObligations ?? [];
        const versions = existing
          .filter(item => item.obligationId === input.obligationId)
          .sort((left, right) => right.version - left.version);
        if (versions[0]?.invalidatedAt === null) {
          throw new Error("DEFERRED_TEST_OBLIGATION_ALREADY_ACTIVE");
        }
        const obligation: DeferredTestObligation = {
          obligationId: input.obligationId,
          version: (versions[0]?.version ?? 0) + 1,
          runId: input.runId,
          requirementId: input.requirementId,
          workPackageId: input.workPackageId,
          specId: current.graph.baseline.specId,
          specRevision: current.graph.baseline.revision,
          sourceArtifactDigest: current.graph.baseline.sourceArtifactDigest,
          specDigest: current.graph.baseline.digest,
          category: input.category,
          testTarget: input.testTarget,
          reason: input.reason,
          requiredEnvironment: input.requiredEnvironment,
          createdAt: new Date().toISOString(),
          invalidatedAt: null,
          invalidationReason: null,
        };
        const graph = validateGraph(
          {
            ...current.graph,
            deferredTestObligations: [...existing, obligation],
          },
          input.runId
        );
        assertEvidenceBoundToRun(graph, record.run);
        const projection: ClosureProjection = {
          projectionVersion: CLOSURE_PROJECTION_VERSION,
          graph,
          graphDigest: digest(graph),
        };
        return persistEvidence({
          tx,
          record,
          scope,
          expectedRevision: input.expectedRevision,
          idempotencyKey: input.idempotencyKey,
          operationDigest,
          projection,
          action: "deferred_test_obligation_recorded",
          eventType: "DEFERRED_TEST_OBLIGATION_RECORDED",
          deferredTestObligationId: obligation.obligationId,
          deferredTestObligationVersion: obligation.version,
          requirementIds: [obligation.requirementId],
        });
      });
    },

    async invalidateDeferredTestObligation(
      input: InvalidateDeferredTestObligationInput
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
        const operationDigest = digest({
          command: "deferred_test_obligation_invalidate",
          obligationId: input.obligationId,
          expectedVersion: input.expectedVersion,
          reason: input.reason,
        });
        const duplicate = await tx.findEvent(
          input.runId,
          input.idempotencyKey,
          scope
        );
        if (duplicate)
          return duplicateResult(record, duplicate, operationDigest);
        if (record.revision !== input.expectedRevision) {
          throw new Error("RUN_PROJECTION_STALE");
        }
        const existing = current.graph.deferredTestObligations ?? [];
        const obligation = existing.find(
          item =>
            item.obligationId === input.obligationId &&
            item.version === input.expectedVersion &&
            item.invalidatedAt === null
        );
        if (!obligation) {
          throw new Error("DEFERRED_TEST_OBLIGATION_VERSION_STALE");
        }
        const invalidatedAt = new Date().toISOString();
        const graph = validateGraph(
          {
            ...current.graph,
            deferredTestObligations: existing.map(item =>
              item === obligation
                ? {
                    ...item,
                    invalidatedAt,
                    invalidationReason: input.reason,
                  }
                : item
            ),
          },
          input.runId
        );
        const projection: ClosureProjection = {
          projectionVersion: CLOSURE_PROJECTION_VERSION,
          graph,
          graphDigest: digest(graph),
        };
        return persistEvidence({
          tx,
          record,
          scope,
          expectedRevision: input.expectedRevision,
          idempotencyKey: input.idempotencyKey,
          operationDigest,
          projection,
          action: "deferred_test_obligation_invalidated",
          eventType: "DEFERRED_TEST_OBLIGATION_INVALIDATED",
          deferredTestObligationId: obligation.obligationId,
          deferredTestObligationVersion: obligation.version,
          requirementIds: [obligation.requirementId],
        });
      });
    },

    async assertFinalVerifyReady(input: {
      runId: string;
      tenantId: string;
      actorId: number;
    }): Promise<true> {
      const scope = scopeFor(input);
      return adapter.transaction(async tx => {
        const record = await tx.load(input.runId, scope);
        if (!record) throw new Error("RUN_NOT_FOUND");
        assertScope(record, scope);
        const graph = projectionFrom(record.run).graph;
        assertEvidenceBoundToRun(graph, record.run);
        return assertClosureFinalVerifyReady(graph);
      });
    },
  };
}
