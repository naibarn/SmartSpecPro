import { describe, expect, it } from "vitest";

import {
  buildDevelopmentRun,
  type DevelopmentEvent,
} from "../spec224DevelopmentRunContracts";
import {
  buildBlockerLedgerEntry,
  buildSourceChangeInventory,
  compileRequirementClosureGraph,
  digestSourceManifest,
} from "../spec224RequirementClosureContracts";
import { deriveSpec224RequirementId } from "../spec224SpecBaseline";
import { createRequirementClosurePersistenceService } from "../spec224RequirementClosurePersistence";
import { makeReadyClosureFixture } from "./spec224ClosureReadyFixture";
import type {
  DevelopmentRunPersistenceAdapter,
  DevelopmentRunStoreRecord,
} from "../spec224DevelopmentRunPersistence";

const baseRun = buildDevelopmentRun({
  runId: "run-224-closure",
  tenantId: "tenant-acme",
  actorId: 42,
  goal: "Prove persisted requirement closure",
  repositoryRef: "repo:smartspecpro",
  baseRevision: "git:base123",
  contextPackHash: "a".repeat(64),
  workspaceId: "workspace:run-224-closure",
});
baseRun.evidenceRefs.push("evidence:blocker-closure");

function graphInput() {
  const sourceArtifactDigest = "c".repeat(64);
  const digest = "b".repeat(64);
  const requirementText =
    "Persist the closure graph without a second event store.";
  const requirementId = deriveSpec224RequirementId({
    specId: "224",
    revision: "21",
    sourceArtifactDigest,
    sourceDigest: digest,
    line: 1,
    text: requirementText,
  });
  return {
    baseline: {
      specId: "224",
      revision: "21",
      sourceArtifactDigest,
      digest,
      baselineId: "baseline:224-r21",
      authorityRef: "authority:platform-engineering",
      scopeEnvelopeRef: "scope:224-r21",
    },
    requirements: [
      {
        id: requirementId,
        sourceRef: "spec:224@21#L1",
        text: requirementText,
      },
    ],
    planSections: [{ id: "section:closure", requirementIds: [requirementId] }],
    workPackages: [
      {
        id: "wp:closure",
        planSectionId: "section:closure",
        requirementIds: [requirementId],
        dependsOn: [],
      },
    ],
  };
}

function memoryAdapter(
  initial: DevelopmentRunStoreRecord
): DevelopmentRunPersistenceAdapter & { read(): DevelopmentRunStoreRecord } {
  let record = structuredClone(initial);
  return {
    async transaction(work) {
      return work({
        async load(runId, scope) {
          if (
            record.run.runId !== runId ||
            record.run.tenantId !== scope.tenantId ||
            record.run.actorId !== scope.actorId
          ) {
            return null;
          }
          return structuredClone(record);
        },
        async findEvent(runId, idempotencyKey, scope) {
          const current = await this.load(runId, scope);
          return (
            current?.events.find(
              event => event.idempotencyKey === idempotencyKey
            ) ?? null
          );
        },
        async save(next, expectedRevision, scope) {
          if (
            record.run.tenantId !== scope.tenantId ||
            record.run.actorId !== scope.actorId
          ) {
            throw new Error("RUN_SCOPE_FORBIDDEN");
          }
          if (record.revision !== expectedRevision) {
            throw new Error("RUN_PROJECTION_STALE");
          }
          record = structuredClone(next);
        },
        async appendEvent(event, scope) {
          if (
            record.run.tenantId !== scope.tenantId ||
            record.run.actorId !== scope.actorId
          ) {
            throw new Error("RUN_SCOPE_FORBIDDEN");
          }
          const existing = record.events.find(
            item => item.idempotencyKey === event.idempotencyKey
          );
          if (existing) return existing;
          record.events.push(structuredClone(event));
          return event;
        },
        async getCanonicalJob() {
          return null;
        },
      });
    },
    read() {
      return structuredClone(record);
    },
  };
}

function attachmentInput(overrides: Record<string, unknown> = {}) {
  return {
    runId: baseRun.runId,
    tenantId: baseRun.tenantId,
    actorId: baseRun.actorId,
    expectedRevision: 0,
    expectedFencingVersion: 0,
    idempotencyKey: "closure:attach:v1",
    graph: compileRequirementClosureGraph(graphInput()),
    ...overrides,
  };
}

describe("Spec 224 persisted requirement closure projection", () => {
  it("attaches a graph, emits bounded evidence, and reloads it through a fresh service", async () => {
    const adapter = memoryAdapter({ run: baseRun, revision: 0, events: [] });
    const first = createRequirementClosurePersistenceService(adapter);

    const attached = await first.attachGraph(attachmentInput());
    const evidence = adapter.read().events.at(-1) as DevelopmentEvent;
    const reloaded = await createRequirementClosurePersistenceService(
      adapter
    ).get({
      runId: baseRun.runId,
      tenantId: baseRun.tenantId,
      actorId: baseRun.actorId,
    });

    expect(attached.accepted).toBe(true);
    expect(attached.revision).toBe(1);
    expect(evidence.type).toBe("EVIDENCE_RECORDED");
    expect(evidence.payload).toMatchObject({
      action: "closure_graph_attached",
      graphDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      requirementIds: [graphInput().requirements[0]!.id],
    });
    expect(JSON.stringify(evidence.payload)).not.toContain(
      "Persist the closure graph"
    );
    expect(reloaded.graph.baseline.baselineId).toBe("baseline:224-r21");
    expect(reloaded.revision).toBe(1);
  });

  it("invalidates requirement and WorkPackage evidence when the candidate manifest changes", async () => {
    const ready = makeReadyClosureFixture(
      compileRequirementClosureGraph(graphInput()),
      { baseRevision: baseRun.baseRevision, prefix: "closure-invalidation" }
    );
    const previousInventory = ready.graph.sourceInventory!;
    const addedFile = {
      path: "apps/web/new-source.ts",
      digest: "e".repeat(64),
    };
    const candidateFiles = [...previousInventory.candidateFiles, addedFile];
    const nextInventory = buildSourceChangeInventory({
      baseline: ready.graph.baseline,
      baselineRevision: previousInventory.baselineRevision,
      candidateRevision: "git:closure-invalidation-next",
      baselineManifestDigest: previousInventory.baselineManifestDigest,
      candidateManifestDigest: digestSourceManifest(candidateFiles),
      scannerRef: "scanner:spec224-test-fixture",
      manifestEvidenceRef: "evidence:closure-invalidation-next-manifest",
      coverage: {
        ...previousInventory.coverage,
        candidateRevision: "git:closure-invalidation-next",
        attestationEvidenceRef: "evidence:closure-invalidation-next-manifest",
      },
      specArtifactPath: previousInventory.specArtifactPath,
      baselineFiles: previousInventory.baselineFiles,
      candidateFiles,
      scannedAt: "2026-09-26T00:00:00.000Z",
      changes: [
        {
          path: addedFile.path,
          beforeDigest: null,
          afterDigest: addedFile.digest,
          requirementIds: [],
          derivedRequirementIds: [],
          evidenceRef: "evidence:closure-invalidation-new-file",
        },
      ],
      requirementIds: ready.graph.requirements.map(item => item.id),
      derivedRequirements: ready.graph.derivedRequirements,
    });
    const recompiled = compileRequirementClosureGraph({
      baseline: ready.graph.baseline,
      requirements: ready.graph.requirements.map(({ id, sourceRef, text }) => ({
        id,
        sourceRef,
        text,
      })),
      planSections: ready.graph.planSections,
      workPackages: ready.graph.workPackages,
      derivedRequirements: ready.graph.derivedRequirements,
      sourceInventory: nextInventory,
    });
    const changedGraph = {
      ...recompiled,
      requirements: recompiled.requirements.map(requirement => {
        const previous = ready.graph.requirements.find(
          item => item.id === requirement.id
        )!;
        return {
          ...requirement,
          state: previous.state,
          evidenceRefs: previous.evidenceRefs,
          evidence: previous.evidence,
        };
      }),
      workPackages: recompiled.workPackages.map(workPackage => {
        const previous = ready.graph.workPackages.find(
          item => item.id === workPackage.id
        )!;
        return {
          ...workPackage,
          status: previous.status,
          evidenceRefs: previous.evidenceRefs,
          evidence: previous.evidence,
        };
      }),
    };
    const run = {
      ...baseRun,
      evidenceRefs: [
        ...new Set([
          ...baseRun.evidenceRefs,
          ...ready.evidenceRefs,
          "evidence:closure-invalidation-next-manifest",
          "evidence:closure-invalidation-new-file",
        ]),
      ],
    };
    const adapter = memoryAdapter({ run, revision: 0, events: [] });
    const service = createRequirementClosurePersistenceService(adapter);
    const attached = await service.attachGraph(
      attachmentInput({ graph: changedGraph })
    );

    expect(attached.graph.requirements[0]?.state).toBe(
      "IMPLEMENTED_UNVERIFIED"
    );
    expect(attached.graph.workPackages[0]?.status).toBe(
      "IMPLEMENTED_UNVERIFIED"
    );
    expect(attached.event?.payload.invalidatedEvidenceRefs).toEqual(
      expect.arrayContaining([
        ready.graph.requirements[0]!.evidenceRefs[0]!,
        ready.graph.workPackages[0]!.evidenceRefs[0]!,
      ])
    );
  });

  it("enforces scope, revision fencing, and idempotency conflicts", async () => {
    const adapter = memoryAdapter({ run: baseRun, revision: 0, events: [] });
    const service = createRequirementClosurePersistenceService(adapter);
    await service.attachGraph(attachmentInput());

    await expect(
      service.attachGraph(
        attachmentInput({ tenantId: "tenant-other", expectedRevision: 1 })
      )
    ).rejects.toThrow("RUN_NOT_FOUND");
    await expect(
      service.attachGraph(attachmentInput({ actorId: 7, expectedRevision: 1 }))
    ).rejects.toThrow("RUN_NOT_FOUND");
    await expect(
      service.attachGraph(
        attachmentInput({
          expectedRevision: 0,
          idempotencyKey: "closure:stale",
        })
      )
    ).rejects.toThrow("RUN_PROJECTION_STALE");
    await expect(
      service.attachGraph(
        attachmentInput({
          expectedRevision: 1,
          graph: compileRequirementClosureGraph({
            ...graphInput(),
            baseline: { ...graphInput().baseline, revision: "22" },
          }),
        })
      )
    ).rejects.toThrow("RUN_IDEMPOTENCY_CONFLICT");
  });

  it("closes a blocker with verification evidence and reopens it with a new ledger epoch", async () => {
    const adapter = memoryAdapter({ run: baseRun, revision: 0, events: [] });
    const service = createRequirementClosurePersistenceService(adapter);
    await service.attachGraph(attachmentInput());
    const blocker = buildBlockerLedgerEntry({
      blockerId: "blocker:closure",
      runId: baseRun.runId,
      requirementRefs: [graphInput().requirements[0]!.id],
      classification: "IMPLEMENTATION_DEFECT",
      severity: "high",
    });

    const closed = await service.upsertBlocker({
      runId: baseRun.runId,
      tenantId: baseRun.tenantId,
      actorId: baseRun.actorId,
      expectedRevision: 1,
      expectedFencingVersion: 0,
      idempotencyKey: "blocker:closure:closed",
      blocker: { ...blocker, status: "CLOSED" },
      verificationRefs: ["evidence:blocker-closure"],
    });
    const duplicateClose = await service.upsertBlocker({
      runId: baseRun.runId,
      tenantId: baseRun.tenantId,
      actorId: baseRun.actorId,
      expectedRevision: 2,
      expectedFencingVersion: 0,
      idempotencyKey: "blocker:closure:closed",
      blocker: { ...blocker, status: "CLOSED" },
      verificationRefs: ["evidence:blocker-closure"],
    });
    const reopened = await service.upsertBlocker({
      runId: baseRun.runId,
      tenantId: baseRun.tenantId,
      actorId: baseRun.actorId,
      expectedRevision: 2,
      expectedFencingVersion: 0,
      idempotencyKey: "blocker:closure:reopened",
      blocker: { ...blocker, status: "REPAIR" },
    });

    expect(closed.graph.blockers[0]).toMatchObject({
      status: "CLOSED",
      verificationRefs: ["evidence:blocker-closure"],
      reopenCount: 0,
    });
    expect(duplicateClose).toMatchObject({ accepted: false, revision: 2 });
    expect(reopened.graph.blockers[0]).toMatchObject({
      status: "REPAIR",
      verificationRefs: [],
      reopenCount: 1,
    });
  });

  it("keeps Final Verify closed for a persisted open blocker and passes after close", async () => {
    const ready = makeReadyClosureFixture(
      compileRequirementClosureGraph(graphInput()),
      { baseRevision: baseRun.baseRevision, prefix: "closure-persistence" }
    );
    const finalVerifyRun = {
      ...baseRun,
      evidenceRefs: [
        ...new Set([
          ...baseRun.evidenceRefs,
          ...ready.evidenceRefs,
          "evidence:final-blocker",
        ]),
      ],
    };
    const adapter = memoryAdapter({
      run: finalVerifyRun,
      revision: 0,
      events: [],
    });
    const service = createRequirementClosurePersistenceService(adapter);
    await service.attachGraph(attachmentInput({ graph: ready.graph }));
    const blocker = buildBlockerLedgerEntry({
      blockerId: "blocker:final-verify",
      runId: baseRun.runId,
      requirementRefs: [graphInput().requirements[0]!.id],
      classification: "TEST_FAILURE",
      severity: "medium",
    });
    await service.upsertBlocker({
      runId: baseRun.runId,
      tenantId: baseRun.tenantId,
      actorId: baseRun.actorId,
      expectedRevision: 1,
      expectedFencingVersion: 0,
      idempotencyKey: "blocker:final-verify:open",
      blocker,
    });

    await expect(
      service.assertFinalVerifyReady({
        runId: baseRun.runId,
        tenantId: baseRun.tenantId,
        actorId: baseRun.actorId,
      })
    ).rejects.toThrow("BLOCKER_OPEN");

    await service.upsertBlocker({
      runId: baseRun.runId,
      tenantId: baseRun.tenantId,
      actorId: baseRun.actorId,
      expectedRevision: 2,
      expectedFencingVersion: 0,
      idempotencyKey: "blocker:final-verify:closed",
      blocker: { ...blocker, status: "CLOSED" },
      verificationRefs: ["evidence:final-blocker"],
    });

    await expect(
      service.assertFinalVerifyReady({
        runId: baseRun.runId,
        tenantId: baseRun.tenantId,
        actorId: baseRun.actorId,
      })
    ).resolves.toBe(true);
  });
});
