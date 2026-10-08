import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  createSpec271DurableEvidenceReceiptStore,
  Spec271DurableReceiptError,
  type Spec271DurableReceiptStoreDependencies,
  type Spec271ReceiptObjectStorage,
} from "../spec271DurableEvidenceReceiptStore";
import {
  createSpec271PortableEvidenceReceipt,
  type Spec271PortableReceiptDependencies,
  type Spec271ReceiptScope,
  type Spec271ResolvedEvidenceArtifact,
} from "../spec271PortableEvidenceReceipt";
import type { Spec271AcceptanceEvidence } from "../spec271IndependentAcceptance";

const scope: Spec271ReceiptScope = {
  requirementId: "REQ-962CDCE30AEF",
  sourceSha: "a".repeat(40),
  tenantId: "tenant-a",
  projectId: "project-a",
  uatRunId: "uat-run-1",
  attemptId: "attempt-1",
  scenarioId: "scenario-checkout",
  scenarioRevision: "scenario-r3",
  schemaRevision: "schema-r2",
  environmentFingerprint: "b".repeat(64),
  runStartedAt: "2026-10-08T11:00:00.000Z",
};
const verifiedAt = "2026-10-08T11:30:00.000Z";
const bytes = Buffer.from("verified observation\n");
const hash = createHash("sha256").update(bytes).digest("hex");
const artifact: Spec271ResolvedEvidenceArtifact = {
  artifactId: "artifact-1",
  tenantId: scope.tenantId,
  projectId: scope.projectId,
  uatRunId: scope.uatRunId,
  attemptId: scope.attemptId,
  sourceSha: scope.sourceSha,
  scenarioId: scope.scenarioId,
  scenarioRevision: scope.scenarioRevision,
  schemaRevision: scope.schemaRevision,
  environmentFingerprint: scope.environmentFingerprint,
  createdAt: "2026-10-08T11:20:00.000Z",
  recordedSha256: hash,
  bytes,
};
const decision: Spec271AcceptanceEvidence = {
  requirementId: scope.requirementId,
  sourceSha: scope.sourceSha,
  tenantId: scope.tenantId,
  projectId: scope.projectId,
  oracleId: "oracle-independent-v1",
  testOutcome: "PASS",
  oracleOutcome: "PASS",
  acceptanceOutcome: "ACCEPTED",
  reasons: [],
  evidenceDigest: "c".repeat(64),
};
const runBoundDecision = {
  decision,
  uatRunId: scope.uatRunId,
  attemptId: scope.attemptId,
  scenarioId: scope.scenarioId,
  scenarioRevision: scope.scenarioRevision,
  schemaRevision: scope.schemaRevision,
  environmentFingerprint: scope.environmentFingerprint,
};

function memoryStorage(): Spec271ReceiptObjectStorage & { objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    async putIfAbsent(key: string, data: Uint8Array, _contentType: string) {
      const bytes = Buffer.from(data);
      const existing = objects.get(key);
      if (existing) {
        if (!Buffer.from(existing).equals(bytes)) throw new Error("STORAGE_OBJECT_CONTENT_CONFLICT");
        return { key, created: false };
      }
      objects.set(key, bytes);
      return { key, created: true };
    },
    async readBuffer(key: string) {
      const value = objects.get(key);
      return value ? Buffer.from(value) : null;
    },
  };
}

function receiptDependencies(overrides: Partial<Spec271PortableReceiptDependencies> = {}): Spec271PortableReceiptDependencies {
  return {
    authorizeScope: async () => true,
    resolveArtifact: async () => artifact,
    resolveAcceptance: async () => runBoundDecision,
    maxEvidenceAgeMs: 60 * 60 * 1000,
    ...overrides,
  };
}

function dependencies(
  storage: ReturnType<typeof memoryStorage> = memoryStorage(),
  overrides: Omit<Partial<Spec271DurableReceiptStoreDependencies>, "storage"> = {},
) {
  return {
    storage,
    receipt: receiptDependencies(),
    resolveScope: async () => scope,
    authorizeScope: async () => true,
    resolveRetention: async (_scope, _key, expectedPolicyRef) => ({
      policyRef: expectedPolicyRef ?? "retention:uat-evidence-v1",
      immutableStorageConfirmed: true,
    }),
    ...overrides,
  } satisfies Spec271DurableReceiptStoreDependencies & { storage: ReturnType<typeof memoryStorage> };
}

async function makeReceipt(receiptVerifiedAt = verifiedAt) {
  return createSpec271PortableEvidenceReceipt({
    scope,
    artifactRefs: [{ artifactId: artifact.artifactId }],
    verifiedAt: receiptVerifiedAt,
  }, receiptDependencies());
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({
    code,
    name: "Spec271DurableReceiptError",
  } satisfies Partial<Spec271DurableReceiptError>);
}

describe("SPEC-271 durable receipt object adapter WP2B", () => {
  it("conditionally persists and reads back exact, source-bound receipt bytes", async () => {
    const deps = dependencies();
    const receipt = await makeReceipt();
    const result = await createSpec271DurableEvidenceReceiptStore(deps).persist(receipt);

    expect(result).toMatchObject({
      status: "PERSISTED_VERIFIED",
      receipt: { receiptId: receipt.receiptId, receiptDigest: receipt.receiptDigest },
      storedContentSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      created: true,
    });
    expect(deps.storage.objects.size).toBe(1);
  });

  it("uses the authoritative scope resolver and denies cross-tenant or project access", async () => {
    const receipt = await makeReceipt();
    await expectCode(createSpec271DurableEvidenceReceiptStore(dependencies(undefined, {
      authorizeScope: async () => false,
    })).persist(receipt), "SCOPE_ACCESS_DENIED");
    await expectCode(createSpec271DurableEvidenceReceiptStore(dependencies(undefined, {
      resolveScope: async () => ({ ...scope, projectId: "project-other" }),
    })).persist(receipt), "RUN_SCOPE_MISMATCH");
  });

  it("rejects missing or unenforced retention authority before writing", async () => {
    const deps = dependencies();
    const receipt = await makeReceipt();
    await expectCode(createSpec271DurableEvidenceReceiptStore(dependencies(deps.storage, {
      resolveRetention: async () => null,
    })).persist(receipt), "RETENTION_POLICY_UNAVAILABLE");
    await expectCode(createSpec271DurableEvidenceReceiptStore(dependencies(deps.storage, {
      resolveRetention: async () => ({ policyRef: "retention:unknown", immutableStorageConfirmed: false }),
    })).persist(receipt), "RETENTION_POLICY_NOT_ENFORCED");
    expect(deps.storage.objects.size).toBe(0);
  });

  it("replays idempotently across adapter instances after a process restart", async () => {
    const deps = dependencies();
    const receipt = await makeReceipt();
    const first = await createSpec271DurableEvidenceReceiptStore(deps).persist(receipt);
    const recovered = await createSpec271DurableEvidenceReceiptStore(deps).load({
      requirementId: scope.requirementId,
      sourceSha: scope.sourceSha,
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      uatRunId: scope.uatRunId,
      attemptId: scope.attemptId,
      scenarioId: scope.scenarioId,
      scenarioRevision: scope.scenarioRevision,
      schemaRevision: scope.schemaRevision,
      environmentFingerprint: scope.environmentFingerprint,
    });

    expect(recovered.receipt.receiptDigest).toBe(first.receipt.receiptDigest);
    const replay = await createSpec271DurableEvidenceReceiptStore(deps).persist(receipt);
    expect(replay.created).toBe(false);
    expect(replay.receipt.receiptId).toBe(first.receipt.receiptId);
  });

  it("detects changed stored bytes and missing objects on read-back", async () => {
    const storage = memoryStorage();
    const deps = dependencies(storage);
    const receipt = await makeReceipt();
    const persisted = await createSpec271DurableEvidenceReceiptStore(deps).persist(receipt);
    storage.objects.set(persisted.storageKey, Buffer.from("tampered"));
    await expectCode(createSpec271DurableEvidenceReceiptStore(deps).load({
      requirementId: scope.requirementId,
      sourceSha: scope.sourceSha,
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      uatRunId: scope.uatRunId,
      attemptId: scope.attemptId,
      scenarioId: scope.scenarioId,
      scenarioRevision: scope.scenarioRevision,
      schemaRevision: scope.schemaRevision,
      environmentFingerprint: scope.environmentFingerprint,
    }), "STORED_RECEIPT_ENCODING_INVALID");

    const empty = dependencies(memoryStorage());
    await expectCode(createSpec271DurableEvidenceReceiptStore(empty).load({
      requirementId: scope.requirementId,
      sourceSha: scope.sourceSha,
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      uatRunId: scope.uatRunId,
      attemptId: scope.attemptId,
      scenarioId: scope.scenarioId,
      scenarioRevision: scope.scenarioRevision,
      schemaRevision: scope.schemaRevision,
      environmentFingerprint: scope.environmentFingerprint,
    }), "STORED_RECEIPT_NOT_FOUND");
  });

  it("rejects conflicting content, changed oracle authority, and revoked artifact authority", async () => {
    const storage = memoryStorage();
    const receipt = await makeReceipt();
    const store = createSpec271DurableEvidenceReceiptStore(dependencies(storage));
    await store.persist(receipt);
    const conflicting = await makeReceipt("2026-10-08T11:31:00.000Z");
    await expectCode(store.persist(conflicting), "RECEIPT_CONFLICT");

    const revoked = dependencies(storage, {
      receipt: receiptDependencies({ resolveAcceptance: async () => null }),
    });
    await expectCode(createSpec271DurableEvidenceReceiptStore(revoked).load({
      requirementId: scope.requirementId,
      sourceSha: scope.sourceSha,
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      uatRunId: scope.uatRunId,
      attemptId: scope.attemptId,
      scenarioId: scope.scenarioId,
      scenarioRevision: scope.scenarioRevision,
      schemaRevision: scope.schemaRevision,
      environmentFingerprint: scope.environmentFingerprint,
    }), "ORACLE_DECISION_MISSING");
  });

  it("fails closed when source identity or referenced artifact bytes change", async () => {
    const receipt = await makeReceipt();
    const mismatch = dependencies(undefined, {
      resolveScope: async () => ({ ...scope, sourceSha: "e".repeat(40) }),
    });
    await expectCode(createSpec271DurableEvidenceReceiptStore(mismatch).persist(receipt), "RUN_SCOPE_MISMATCH");

    const tampered = dependencies(undefined, {
      receipt: receiptDependencies({ resolveArtifact: async () => ({ ...artifact, bytes: Buffer.from("tampered") }) }),
    });
    await expectCode(createSpec271DurableEvidenceReceiptStore(tampered).persist(receipt), "ARTIFACT_CONTENT_HASH_MISMATCH");
  });

  it("records access checks on both write and read boundaries", async () => {
    const accesses: string[] = [];
    const deps = dependencies(undefined, {
      authorizeScope: async (_scope, access) => { accesses.push(access); return true; },
    });
    const receipt = await makeReceipt();
    await createSpec271DurableEvidenceReceiptStore(deps).persist(receipt);
    expect(accesses).toEqual(["WRITE", "READ"]);
  });

  it("uses only deterministic immutable conditional writes", async () => {
    const storage = memoryStorage();
    const putIfAbsent = vi.spyOn(storage, "putIfAbsent");
    const receipt = await makeReceipt();
    await createSpec271DurableEvidenceReceiptStore(dependencies(storage)).persist(receipt);
    expect(putIfAbsent).toHaveBeenCalledTimes(1);
    expect(putIfAbsent.mock.calls[0]?.[2]).toBe("application/json");
  });
});
