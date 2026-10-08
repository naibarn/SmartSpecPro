import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  assertSpec271ReceiptReplay,
  createSpec271PortableEvidenceReceipt,
  Spec271PortableReceiptError,
  verifySpec271PortableEvidenceReceipt,
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

function dependencies(overrides: Partial<Spec271PortableReceiptDependencies> = {}): Spec271PortableReceiptDependencies {
  return {
    authorizeScope: async () => true,
    resolveArtifact: async () => artifact,
    resolveAcceptance: async () => runBoundDecision,
    maxEvidenceAgeMs: 60 * 60 * 1000,
    ...overrides,
  };
}

function create(
  deps: Spec271PortableReceiptDependencies = dependencies(),
  input: Partial<Parameters<typeof createSpec271PortableEvidenceReceipt>[0]> = {}
) {
  return createSpec271PortableEvidenceReceipt({
    scope,
    artifactRefs: [{ artifactId: artifact.artifactId }],
    verifiedAt,
    ...input,
  }, deps);
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({
    code,
    name: "Spec271PortableReceiptError",
  } satisfies Partial<Spec271PortableReceiptError>);
}

describe("SPEC-271 portable source-bound evidence receipt WP2A", () => {
  it("constructs a receipt from the independently resolved decision and verified artifact bytes", async () => {
    const receipt = await create();
    expect(receipt).toMatchObject({
      requirementId: scope.requirementId,
      sourceSha: scope.sourceSha,
      uatRunId: scope.uatRunId,
      attemptId: scope.attemptId,
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      oracleId: decision.oracleId,
      testOutcome: "PASS",
      oracleOutcome: "PASS",
      acceptanceOutcome: "ACCEPTED",
      evidenceStatus: "VALIDATED_UNPERSISTED",
      evidenceArtifacts: [{ artifactId: artifact.artifactId, contentSha256: hash, createdAt: artifact.createdAt }],
    });
    expect(verifySpec271PortableEvidenceReceipt(receipt)).toBe(true);
  });

  it("binds the exact source SHA and rejects an artifact from another revision", async () => {
    await expectCode(create(dependencies({ resolveArtifact: async () => ({ ...artifact, sourceSha: "d".repeat(40) }) })), "ARTIFACT_SOURCE_SHA_MISMATCH");
    const receipt = await create();
    expect(receipt.sourceSha).toBe(scope.sourceSha);
    expect(receipt.provenance.sourceSha).toBe(scope.sourceSha);
  });

  it("detects content tampering even when the stored checksum metadata is unchanged", async () => {
    await expectCode(create(dependencies({ resolveArtifact: async () => ({ ...artifact, bytes: Buffer.from("mutated") }) })), "ARTIFACT_CONTENT_HASH_MISMATCH");
  });

  it("rejects missing, unauthorized, stale, run-mismatched, and duplicate artifact evidence", async () => {
    await expectCode(create(dependencies({ resolveArtifact: async () => null })), "ARTIFACT_NOT_FOUND_OR_UNAUTHORIZED");
    await expectCode(create(dependencies({ maxEvidenceAgeMs: 1 })), "ARTIFACT_STALE");
    await expectCode(create(dependencies({ maxEvidenceAgeMs: undefined } as unknown as Partial<Spec271PortableReceiptDependencies>)), "EVIDENCE_AGE_POLICY_INVALID");
    await expectCode(create(dependencies({ resolveArtifact: async () => ({ ...artifact, attemptId: "attempt-old" }) })), "ARTIFACT_RUN_IDENTITY_MISMATCH");
    await expectCode(create(dependencies(), { artifactRefs: [{ artifactId: "artifact-1" }, { artifactId: "artifact-1" }] }), "DUPLICATE_ARTIFACT_REFERENCE");
  });

  it("fails closed when a tenant or project boundary is crossed", async () => {
    await expectCode(create(dependencies({ authorizeScope: async () => false })), "SCOPE_ACCESS_DENIED");
    await expectCode(create(dependencies({ authorizeScope: async () => { throw new Error("policy unavailable"); } })), "SCOPE_AUTHORIZATION_UNAVAILABLE");
    await expectCode(create(dependencies({ resolveArtifact: async () => ({ ...artifact, tenantId: "tenant-b" }) })), "ARTIFACT_SCOPE_MISMATCH");
    await expectCode(create(dependencies({ resolveArtifact: async () => ({ ...artifact, projectId: "project-b" }) })), "ARTIFACT_SCOPE_MISMATCH");
  });

  it("requires oracle and artifact evidence to match the receipt scenario, schema, and environment", async () => {
    await expectCode(create(dependencies({ resolveAcceptance: async () => ({ ...runBoundDecision, scenarioRevision: "scenario-old" }) })), "ORACLE_RUN_IDENTITY_MISMATCH");
    await expectCode(create(dependencies({ resolveArtifact: async () => ({ ...artifact, environmentFingerprint: "d".repeat(64) }) })), "ARTIFACT_SCENARIO_OR_ENVIRONMENT_MISMATCH");
  });

  it("requires an independently resolved oracle decision and keeps test PASS distinct from acceptance", async () => {
    await expectCode(create(dependencies({ resolveAcceptance: async () => null })), "ORACLE_DECISION_MISSING");
    await expectCode(create(dependencies({ resolveAcceptance: async () => ({ ...runBoundDecision, decision: { ...decision, acceptanceOutcome: "BLOCKED" } }) })), "ORACLE_ACCEPTANCE_NOT_PASSED");
    await expectCode(create(dependencies({ resolveAcceptance: async () => ({ ...runBoundDecision, decision: { ...decision, sourceSha: "e".repeat(40) } }) })), "ORACLE_DECISION_SCOPE_MISMATCH");
  });

  it("preserves stable receipt identity for exact replay and rejects conflicting evidence for the same run", async () => {
    const first = await create();
    const replay = await create();
    expect(replay.receiptId).toBe(first.receiptId);
    expect(assertSpec271ReceiptReplay(first, replay)).toBe(first);
    const conflict = await create(dependencies({ resolveArtifact: async () => ({ ...artifact, bytes: Buffer.from("different evidence"), recordedSha256: createHash("sha256").update("different evidence").digest("hex") }) }));
    expect(() => assertSpec271ReceiptReplay(first, conflict)).toThrow("RECEIPT_CONFLICT");
  });

  it("detects receipt-field tampering during independent replay verification", async () => {
    const receipt = await create();
    expect(verifySpec271PortableEvidenceReceipt({ ...receipt, scenarioRevision: "scenario-r4" })).toBe(false);
  });

  it("requires a verified existing attestation when policy says it is mandatory", async () => {
    await expectCode(create(dependencies({ attestationRequired: true })), "ATTESTATION_REQUIRED");
    await expectCode(create(dependencies({ attestationRequired: true, verifyAttestation: async () => false }), { attestationRef: "attestation:untrusted" }), "ATTESTATION_INVALID");
    const receipt = await create(dependencies({ attestationRequired: true, verifyAttestation: async () => true }), { attestationRef: "attestation:approved" });
    expect(receipt.provenance.attestation).toBe("VERIFIED");
  });

  it("retains SPEC-224 digest compatibility without changing its provenance contract", async () => {
    const receipt = await create();
    expect(receipt.provenance.evidenceManifestDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.provenance.producer).toBe("spec271.portable-evidence-adapter");
    expect(receipt.receiptDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not claim persistence or durable process-restart recovery", async () => {
    const receipt = await create();
    expect(receipt.evidenceStatus).toBe("VALIDATED_UNPERSISTED");
    expect(receipt).not.toHaveProperty("persistedAt");
  });
});
