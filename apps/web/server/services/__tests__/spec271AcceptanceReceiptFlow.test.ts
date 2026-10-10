import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  evaluateSpec271Acceptance,
  type Spec271OracleBinding,
} from "../spec271IndependentAcceptance";
import {
  createSpec271PortableEvidenceReceipt,
  type Spec271PortableReceiptDependencies,
  type Spec271ReceiptScope,
  type Spec271ResolvedEvidenceArtifact,
} from "../spec271PortableEvidenceReceipt";
import {
  createSpec271DurableEvidenceReceiptStore,
  type Spec271DurableReceiptStoreDependencies,
  type Spec271ReceiptObjectStorage,
} from "../spec271DurableEvidenceReceiptStore";

const scope: Spec271ReceiptScope = {
  requirementId: "REQ-962CDCE30AEF",
  sourceSha: "a".repeat(40),
  tenantId: "tenant-r4",
  projectId: "project-r4",
  uatRunId: "uat-r4-1",
  attemptId: "attempt-r4-1",
  scenarioId: "scenario-app-isolation",
  scenarioRevision: "scenario-v1",
  schemaRevision: "schema-v1",
  environmentFingerprint: "b".repeat(64),
  runStartedAt: "2026-10-10T08:00:00.000Z",
};

const artifactBytes = Buffer.from("synthetic scoped acceptance observation");
const artifactHash = createHash("sha256").update(artifactBytes).digest("hex");
const artifact: Spec271ResolvedEvidenceArtifact = {
  artifactId: "artifact-r4-1",
  tenantId: scope.tenantId,
  projectId: scope.projectId,
  uatRunId: scope.uatRunId,
  attemptId: scope.attemptId,
  sourceSha: scope.sourceSha,
  scenarioId: scope.scenarioId,
  scenarioRevision: scope.scenarioRevision,
  schemaRevision: scope.schemaRevision,
  environmentFingerprint: scope.environmentFingerprint,
  createdAt: "2026-10-10T08:10:00.000Z",
  recordedSha256: artifactHash,
  bytes: artifactBytes,
};

function memoryObjectStorage(): Spec271ReceiptObjectStorage & { objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    async putIfAbsent(key, bytes) {
      const prior = objects.get(key);
      if (prior && !Buffer.from(prior).equals(Buffer.from(bytes))) {
        throw new Error("STORAGE_OBJECT_CONTENT_CONFLICT");
      }
      if (!prior) objects.set(key, Buffer.from(bytes));
      return { key, created: !prior };
    },
    async readBuffer(key) {
      const bytes = objects.get(key);
      return bytes ? Buffer.from(bytes) : null;
    },
  };
}

function oracleBinding(): Spec271OracleBinding {
  return {
    requirementId: scope.requirementId,
    sourceSha: scope.sourceSha,
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    oracleId: "oracle-r4-app-isolation-v1",
    kind: "deterministic",
    approved: true,
    producerId: "synthetic-runtime-test",
    evaluatorId: "independent-acceptance-test",
    dependsOnRequirementIds: [],
    expectedValue: { isolated: true },
    expectationRef: "expectation:app-isolation-v1",
  };
}

async function makeAcceptance() {
  return evaluateSpec271Acceptance({
    scope,
    testOutcome: "PASS",
    actualValue: { isolated: true },
    testEvidenceRef: "test:r4-app-isolation",
    observationRef: "observation:r4-app-isolation",
    now: "2026-10-10T08:20:00.000Z",
  }, {
    listApprovedBindings: async () => [oracleBinding()],
  });
}

async function makePortableReceipt(
  overrides: Partial<Spec271PortableReceiptDependencies> = {},
) {
  const decision = await makeAcceptance();
  return createSpec271PortableEvidenceReceipt({
    scope,
    artifactRefs: [{ artifactId: artifact.artifactId }],
    verifiedAt: "2026-10-10T08:30:00.000Z",
  }, {
    authorizeScope: async () => true,
    resolveArtifact: async () => artifact,
    resolveAcceptance: async () => ({
      decision,
      uatRunId: scope.uatRunId,
      attemptId: scope.attemptId,
      scenarioId: scope.scenarioId,
      scenarioRevision: scope.scenarioRevision,
      schemaRevision: scope.schemaRevision,
      environmentFingerprint: scope.environmentFingerprint,
    }),
    maxEvidenceAgeMs: 60 * 60 * 1000,
    ...overrides,
  });
}

function receiptStoreDependencies(
  storage: Spec271ReceiptObjectStorage,
  receipt: Spec271PortableReceiptDependencies,
  resolveScope: Spec271DurableReceiptStoreDependencies["resolveScope"] = async () => scope,
): Spec271DurableReceiptStoreDependencies {
  return {
    storage,
    receipt,
    resolveScope,
    authorizeScope: async () => true,
    resolveRetention: async () => ({
      policyRef: "retention:synthetic-test-only",
      immutableStorageConfirmed: true,
    }),
  };
}

// Contract composition only: the oracle, artifact, run, authorization, and
// object-storage adapters below are synthetic and do not constitute T-01–T-23 UAT.
describe("SPEC-271 evaluator-to-receipt acceptance flow", () => {
  it("binds accepted oracle evidence and artifact bytes to one tenant/project/run before storing", async () => {
    const decision = await makeAcceptance();
    expect(decision.acceptanceOutcome).toBe("ACCEPTED");

    const portable = await makePortableReceipt();
    const storage = memoryObjectStorage();
    const receiptDependencies = {
      authorizeScope: async () => true,
      resolveArtifact: async () => artifact,
      resolveAcceptance: async () => ({
        decision,
        uatRunId: scope.uatRunId,
        attemptId: scope.attemptId,
        scenarioId: scope.scenarioId,
        scenarioRevision: scope.scenarioRevision,
        schemaRevision: scope.schemaRevision,
        environmentFingerprint: scope.environmentFingerprint,
      }),
      maxEvidenceAgeMs: 60 * 60 * 1000,
    } satisfies Spec271PortableReceiptDependencies;
    const store = createSpec271DurableEvidenceReceiptStore(
      receiptStoreDependencies(storage, receiptDependencies),
    );

    const result = await store.persist(portable);
    expect(result).toMatchObject({
      status: "OBJECT_PERSISTED_REVALIDATED",
      receipt: {
        tenantId: scope.tenantId,
        projectId: scope.projectId,
        sourceSha: scope.sourceSha,
        uatRunId: scope.uatRunId,
        attemptId: scope.attemptId,
        acceptanceOutcome: "ACCEPTED",
      },
      created: true,
    });
    expect(result.receipt.evidenceArtifacts).toEqual([
      { artifactId: artifact.artifactId, contentSha256: artifactHash, createdAt: artifact.createdAt },
    ]);
  });

  it("rejects cross-tenant scope substitution before writing any receipt object", async () => {
    const portable = await makePortableReceipt();
    const storage = memoryObjectStorage();
    const receiptDependencies: Spec271PortableReceiptDependencies = {
      authorizeScope: async () => true,
      resolveArtifact: async () => artifact,
      resolveAcceptance: async () => null,
      maxEvidenceAgeMs: 60 * 60 * 1000,
    };
    const store = createSpec271DurableEvidenceReceiptStore(
      receiptStoreDependencies(
        storage,
        receiptDependencies,
        async () => ({ ...scope, tenantId: "tenant-attacker" }),
      ),
    );

    await expect(store.persist(portable)).rejects.toMatchObject({
      code: "RUN_SCOPE_MISMATCH",
    });
    expect(storage.objects.size).toBe(0);
  });

  it("rejects changed run identity returned by the independent acceptance authority", async () => {
    await expect(makePortableReceipt({
      resolveAcceptance: async () => ({
        decision: await makeAcceptance(),
        uatRunId: "uat-other-tenant-run",
        attemptId: scope.attemptId,
        scenarioId: scope.scenarioId,
        scenarioRevision: scope.scenarioRevision,
        schemaRevision: scope.schemaRevision,
        environmentFingerprint: scope.environmentFingerprint,
      }),
    })).rejects.toMatchObject({ code: "ORACLE_RUN_IDENTITY_MISMATCH" });
  });
});
