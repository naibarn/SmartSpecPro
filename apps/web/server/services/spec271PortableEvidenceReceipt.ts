import { createHash } from "node:crypto";

import { digestSpec224EvidenceManifest } from "./spec224VerificationProvenance";
import type {
  Spec271AcceptanceEvidence,
  Spec271AcceptanceScope,
} from "./spec271IndependentAcceptance";

const SHA256 = /^[a-f0-9]{64}$/;
const SOURCE_SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

export type Spec271ReceiptScope = Spec271AcceptanceScope & Readonly<{
  uatRunId: string;
  attemptId: string;
  scenarioId: string;
  scenarioRevision: string;
  schemaRevision: string;
  environmentFingerprint: string;
  runStartedAt: string;
}>;

export type Spec271EvidenceArtifactRef = Readonly<{
  artifactId: string;
  /** Optional caller expectation. The adapter always hashes resolved bytes. */
  contentSha256?: string;
}>;

export type Spec271ResolvedEvidenceArtifact = Readonly<{
  artifactId: string;
  tenantId: string;
  projectId: string;
  uatRunId: string;
  attemptId: string;
  sourceSha: string;
  createdAt: string;
  /** Metadata written by the artifact authority; checked against the bytes. */
  recordedSha256: string;
  bytes: Uint8Array;
}>;

export type Spec271PortableEvidenceReceipt = Readonly<{
  contractVersion: "spec271.portable-evidence-receipt.v1";
  receiptId: string;
  receiptDigest: string;
  evidenceStatus: "VALIDATED_UNPERSISTED";
  requirementId: string;
  sourceSha: string;
  uatRunId: string;
  attemptId: string;
  tenantId: string;
  projectId: string;
  scenarioId: string;
  scenarioRevision: string;
  schemaRevision: string;
  environmentFingerprint: string;
  oracleId: string;
  oracleEvidenceDigest: string;
  testOutcome: "PASS" | "FAIL" | "NOT_RUN";
  oracleOutcome: "PASS" | "FAIL" | "NOT_RUN";
  acceptanceOutcome: "ACCEPTED" | "REJECTED" | "BLOCKED";
  evidenceArtifacts: readonly Readonly<{
    artifactId: string;
    contentSha256: string;
    createdAt: string;
  }>[];
  verifiedAt: string;
  provenance: Readonly<{
    producer: "spec271.portable-evidence-adapter";
    sourceSha: string;
    evidenceManifestDigest: string;
    attestation: "NOT_PROVIDED" | "VERIFIED";
    attestationRef?: string;
  }>;
}>;

export class Spec271PortableReceiptError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "Spec271PortableReceiptError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function receiptLogicalIdentity(receipt: Spec271PortableEvidenceReceipt): string {
  return digestSpec224EvidenceManifest({
    requirementId: receipt.requirementId,
    sourceSha: receipt.sourceSha,
    uatRunId: receipt.uatRunId,
    attemptId: receipt.attemptId,
    tenantId: receipt.tenantId,
    projectId: receipt.projectId,
    scenarioId: receipt.scenarioId,
    scenarioRevision: receipt.scenarioRevision,
    schemaRevision: receipt.schemaRevision,
  });
}

/** Check integrity of a transported receipt without asserting that it was persisted. */
export function verifySpec271PortableEvidenceReceipt(
  receipt: Spec271PortableEvidenceReceipt
): boolean {
  if (!receipt || receipt.contractVersion !== "spec271.portable-evidence-receipt.v1" ||
      receipt.evidenceStatus !== "VALIDATED_UNPERSISTED" || !SOURCE_SHA.test(receipt.sourceSha) ||
      !SHA256.test(receipt.receiptDigest) || !SHA256.test(receipt.provenance.evidenceManifestDigest) ||
      !SHA256.test(receipt.oracleEvidenceDigest) || !SHA256.test(receipt.environmentFingerprint) ||
      !receipt.oracleId || !Array.isArray(receipt.evidenceArtifacts) || receipt.evidenceArtifacts.length === 0 ||
      receipt.evidenceArtifacts.some(artifact => !artifact.artifactId || !SHA256.test(artifact.contentSha256)) ||
      (receipt.provenance.attestation === "VERIFIED" && !receipt.provenance.attestationRef)) return false;
  const base = {
    contractVersion: receipt.contractVersion,
    requirementId: receipt.requirementId,
    sourceSha: receipt.sourceSha,
    uatRunId: receipt.uatRunId,
    attemptId: receipt.attemptId,
    tenantId: receipt.tenantId,
    projectId: receipt.projectId,
    scenarioId: receipt.scenarioId,
    scenarioRevision: receipt.scenarioRevision,
    schemaRevision: receipt.schemaRevision,
    environmentFingerprint: receipt.environmentFingerprint,
    oracleId: receipt.oracleId,
    oracleEvidenceDigest: receipt.oracleEvidenceDigest,
    testOutcome: receipt.testOutcome,
    oracleOutcome: receipt.oracleOutcome,
    acceptanceOutcome: receipt.acceptanceOutcome,
    evidenceArtifacts: receipt.evidenceArtifacts,
    verifiedAt: receipt.verifiedAt,
  };
  const manifestDigest = digestSpec224EvidenceManifest({
    requirementId: receipt.requirementId,
    sourceSha: receipt.sourceSha,
    uatRunId: receipt.uatRunId,
    attemptId: receipt.attemptId,
    tenantId: receipt.tenantId,
    projectId: receipt.projectId,
    scenarioId: receipt.scenarioId,
    scenarioRevision: receipt.scenarioRevision,
    schemaRevision: receipt.schemaRevision,
    environmentFingerprint: receipt.environmentFingerprint,
    oracleId: receipt.oracleId,
    oracleEvidenceDigest: receipt.oracleEvidenceDigest,
    evidenceArtifacts: receipt.evidenceArtifacts,
    verifiedAt: receipt.verifiedAt,
  });
  const digest = digestSpec224EvidenceManifest({
    ...base,
    evidenceManifestDigest: manifestDigest,
    ...(receipt.provenance.attestationRef ? { attestationRef: receipt.provenance.attestationRef } : {}),
  });
  return manifestDigest === receipt.provenance.evidenceManifestDigest && digest === receipt.receiptDigest &&
    receipt.receiptId === `spec271-receipt:${digest}` && receipt.provenance.sourceSha === receipt.sourceSha;
}

/** Idempotent replay accepts an exact receipt and rejects a conflicting one for the same run identity. */
export function assertSpec271ReceiptReplay(
  existing: Spec271PortableEvidenceReceipt,
  candidate: Spec271PortableEvidenceReceipt
): Spec271PortableEvidenceReceipt {
  if (!verifySpec271PortableEvidenceReceipt(existing) || !verifySpec271PortableEvidenceReceipt(candidate)) {
    fail("RECEIPT_INTEGRITY_INVALID");
  }
  if (receiptLogicalIdentity(existing) !== receiptLogicalIdentity(candidate)) return candidate;
  if (existing.receiptDigest !== candidate.receiptDigest) {
    fail("RECEIPT_CONFLICT");
  }
  return existing;
}

export type Spec271PortableReceiptDependencies = Readonly<{
  /** Must authorize the actor for both tenant and project before returning bytes. */
  resolveArtifact(
    artifactId: string,
    scope: Spec271ReceiptScope
  ): Promise<Spec271ResolvedEvidenceArtifact | null>;
  /** Resolves the decision from the independent SPEC-271 evaluator authority. */
  resolveAcceptance(
    scope: Spec271ReceiptScope
  ): Promise<Spec271AcceptanceEvidence | null>;
  /** Must verify an existing approved attestation; this adapter never signs. */
  verifyAttestation?(input: {
    scope: Spec271ReceiptScope;
    receiptDigest: string;
    attestationRef: string;
  }): Promise<boolean>;
  attestationRequired?: boolean;
  maxEvidenceAgeMs?: number;
}>;

function fail(code: string): never {
  throw new Spec271PortableReceiptError(code);
}

function isIsoTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function validateScope(scope: Spec271ReceiptScope, verifiedAt: string): void {
  if (!/^REQ-[A-F0-9]{12}$/.test(scope.requirementId)) fail("REQUIREMENT_ID_INVALID");
  if (!SOURCE_SHA.test(scope.sourceSha)) fail("SOURCE_SHA_INVALID");
  if (![scope.tenantId, scope.projectId, scope.uatRunId, scope.attemptId, scope.scenarioId,
    scope.scenarioRevision, scope.schemaRevision].every(value => typeof value === "string" && value.trim())) {
    fail("RECEIPT_SCOPE_INCOMPLETE");
  }
  if (!SHA256.test(scope.environmentFingerprint)) fail("ENVIRONMENT_FINGERPRINT_INVALID");
  if (!isIsoTimestamp(scope.runStartedAt) || !isIsoTimestamp(verifiedAt)) fail("TIMESTAMP_INVALID");
  if (Date.parse(scope.runStartedAt) > Date.parse(verifiedAt)) fail("RUN_TIME_AFTER_VERIFICATION");
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Build a portable, source-bound receipt after resolving both the oracle decision
 * and every artifact from their existing authorities. This contract deliberately
 * returns VALIDATED_UNPERSISTED: callers must not treat evaluator PASS as a
 * persisted/verified acceptance receipt.
 */
export async function createSpec271PortableEvidenceReceipt(input: {
  scope: Spec271ReceiptScope;
  artifactRefs: readonly Spec271EvidenceArtifactRef[];
  verifiedAt: string;
  attestationRef?: string;
}, dependencies: Spec271PortableReceiptDependencies): Promise<Spec271PortableEvidenceReceipt> {
  validateScope(input.scope, input.verifiedAt);
  if (!Array.isArray(input.artifactRefs) || input.artifactRefs.length === 0) fail("EVIDENCE_ARTIFACTS_REQUIRED");
  const ids = input.artifactRefs.map(ref => ref.artifactId);
  if (ids.some(id => typeof id !== "string" || !id.trim())) fail("ARTIFACT_ID_INVALID");
  if (new Set(ids).size !== ids.length) fail("DUPLICATE_ARTIFACT_REFERENCE");

  let decision: Spec271AcceptanceEvidence | null;
  try {
    decision = await dependencies.resolveAcceptance(input.scope);
  } catch {
    return fail("ORACLE_DECISION_UNAVAILABLE");
  }
  if (!decision) fail("ORACLE_DECISION_MISSING");
  if (decision.requirementId !== input.scope.requirementId || decision.sourceSha !== input.scope.sourceSha ||
      decision.tenantId !== input.scope.tenantId || decision.projectId !== input.scope.projectId) {
    fail("ORACLE_DECISION_SCOPE_MISMATCH");
  }
  if (!decision.oracleId || !SHA256.test(decision.evidenceDigest)) fail("ORACLE_PROVENANCE_INVALID");
  if (decision.acceptanceOutcome !== "ACCEPTED" || decision.oracleOutcome !== "PASS" || decision.testOutcome !== "PASS") {
    fail("ORACLE_ACCEPTANCE_NOT_PASSED");
  }

  const maxAge = dependencies.maxEvidenceAgeMs;
  if (maxAge !== undefined && (!Number.isFinite(maxAge) || maxAge < 0)) fail("EVIDENCE_AGE_POLICY_INVALID");
  const resolved = await Promise.all(input.artifactRefs.map(async ref => {
    let artifact: Spec271ResolvedEvidenceArtifact | null;
    try {
      artifact = await dependencies.resolveArtifact(ref.artifactId, input.scope);
    } catch {
      fail("ARTIFACT_RESOLUTION_FAILED");
    }
    if (!artifact) fail("ARTIFACT_NOT_FOUND_OR_UNAUTHORIZED");
    if (artifact.artifactId !== ref.artifactId || artifact.tenantId !== input.scope.tenantId ||
        artifact.projectId !== input.scope.projectId) fail("ARTIFACT_SCOPE_MISMATCH");
    if (artifact.uatRunId !== input.scope.uatRunId || artifact.attemptId !== input.scope.attemptId) {
      fail("ARTIFACT_RUN_IDENTITY_MISMATCH");
    }
    if (artifact.sourceSha !== input.scope.sourceSha) fail("ARTIFACT_SOURCE_SHA_MISMATCH");
    if (!isIsoTimestamp(artifact.createdAt) || Date.parse(artifact.createdAt) < Date.parse(input.scope.runStartedAt) ||
        Date.parse(artifact.createdAt) > Date.parse(input.verifiedAt)) fail("ARTIFACT_TIMESTAMP_INVALID");
    if (maxAge !== undefined && Date.parse(input.verifiedAt) - Date.parse(artifact.createdAt) > maxAge) {
      fail("ARTIFACT_STALE");
    }
    const contentSha256 = sha256(artifact.bytes);
    if (!SHA256.test(artifact.recordedSha256) || contentSha256 !== artifact.recordedSha256) {
      fail("ARTIFACT_CONTENT_HASH_MISMATCH");
    }
    if (ref.contentSha256 !== undefined && (!SHA256.test(ref.contentSha256) || contentSha256 !== ref.contentSha256)) {
      fail("CALLER_ARTIFACT_HASH_MISMATCH");
    }
    return { artifactId: artifact.artifactId, contentSha256, createdAt: artifact.createdAt };
  }));

  const base = {
    contractVersion: "spec271.portable-evidence-receipt.v1" as const,
    requirementId: input.scope.requirementId,
    sourceSha: input.scope.sourceSha,
    uatRunId: input.scope.uatRunId,
    attemptId: input.scope.attemptId,
    tenantId: input.scope.tenantId,
    projectId: input.scope.projectId,
    scenarioId: input.scope.scenarioId,
    scenarioRevision: input.scope.scenarioRevision,
    schemaRevision: input.scope.schemaRevision,
    environmentFingerprint: input.scope.environmentFingerprint,
    oracleId: decision.oracleId,
    oracleEvidenceDigest: decision.evidenceDigest,
    testOutcome: decision.testOutcome,
    oracleOutcome: decision.oracleOutcome,
    acceptanceOutcome: decision.acceptanceOutcome,
    evidenceArtifacts: resolved,
    verifiedAt: input.verifiedAt,
  };
  const evidenceManifestDigest = digestSpec224EvidenceManifest({
    requirementId: base.requirementId,
    sourceSha: base.sourceSha,
    uatRunId: base.uatRunId,
    attemptId: base.attemptId,
    tenantId: base.tenantId,
    projectId: base.projectId,
    scenarioId: base.scenarioId,
    scenarioRevision: base.scenarioRevision,
    schemaRevision: base.schemaRevision,
    environmentFingerprint: base.environmentFingerprint,
    oracleId: base.oracleId,
    oracleEvidenceDigest: base.oracleEvidenceDigest,
    evidenceArtifacts: base.evidenceArtifacts,
    verifiedAt: base.verifiedAt,
  });
  const receiptDigest = digestSpec224EvidenceManifest({
    ...base,
    evidenceManifestDigest,
    ...(input.attestationRef ? { attestationRef: input.attestationRef } : {}),
  });
  let attestation: "NOT_PROVIDED" | "VERIFIED" = "NOT_PROVIDED";
  if (input.attestationRef) {
    if (!dependencies.verifyAttestation || !await dependencies.verifyAttestation({
      scope: input.scope, receiptDigest, attestationRef: input.attestationRef,
    })) fail("ATTESTATION_INVALID");
    attestation = "VERIFIED";
  } else if (dependencies.attestationRequired) {
    fail("ATTESTATION_REQUIRED");
  }
  const receiptId = `spec271-receipt:${receiptDigest}`;
  return Object.freeze({
    ...base,
    receiptId,
    receiptDigest,
    evidenceStatus: "VALIDATED_UNPERSISTED",
    evidenceArtifacts: Object.freeze(resolved.map(artifact => Object.freeze(artifact))),
    provenance: Object.freeze({
      producer: "spec271.portable-evidence-adapter",
      sourceSha: input.scope.sourceSha,
      evidenceManifestDigest,
      attestation,
      ...(attestation === "VERIFIED" ? { attestationRef: input.attestationRef } : {}),
    }),
  });
}
