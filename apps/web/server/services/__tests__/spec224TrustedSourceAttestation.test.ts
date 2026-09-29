import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

import {
  assertSpec224AttestationMatches,
  Spec224AttestationError,
  type Spec224TrustedSourceAttestation,
} from "../spec224TrustedSourceAttestation";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}

const attestationCore = {
  schemaVersion: "spec224.trusted-source-attestation.v1",
  trustClass: "LOCAL_NONPRODUCTION_INTEGRITY_ONLY",
  tenantId: "tenant-1",
  runId: "run-1",
  workerJobId: "job-1",
  workPackageId: "WP-RECOVERY-04",
  attemptId: "attempt-1",
  attempt: 2,
  projectionRevision: 7,
  decisionEpoch: 3,
  developmentRunFencingVersion: 11,
  workerJobFencingVersion: 19,
  developmentRepositoryRef: "repo:owner/project",
  developmentBaseRevision: "b".repeat(40),
  sourceCommit: "c".repeat(40),
  sourceTree: "d".repeat(40),
  sourceManifestDigest: "e".repeat(64),
  sourceSha256: "8".repeat(64),
  specDigest: "f".repeat(64),
  profileId: "spec224-recovery-registered-runner-nonprod",
  profileVersion: 6,
  profileDigest: "1".repeat(64),
  bundleDigest: "2".repeat(64),
  artifactEvidenceDigest: "3".repeat(64),
  objectRef: "local-nonprod-bundle:sha256:" + "2".repeat(64),
  issuer: "spec224-local-source-verifier.v1",
  issuedAt: "2026-09-29T00:00:00.000Z",
  status: "ACTIVE",
};
const { issuedAt: _issuedAt, ...stableAttestationCore } = attestationCore;
const attestation: Spec224TrustedSourceAttestation = {
  ...attestationCore,
  attestationId: createHash("sha256")
    .update(JSON.stringify(canonicalize(stableAttestationCore)))
    .digest("hex"),
};

const matchingBinding = {
  tenantId: attestation.tenantId,
  runId: attestation.runId,
  workerJobId: attestation.workerJobId,
  workPackageId: attestation.workPackageId,
  attemptId: attestation.attemptId,
  attempt: attestation.attempt,
  projectionRevision: attestation.projectionRevision,
  decisionEpoch: attestation.decisionEpoch,
  developmentRunFencingVersion: attestation.developmentRunFencingVersion,
  workerJobFencingVersion: attestation.workerJobFencingVersion,
  sourceCommit: attestation.sourceCommit,
  sourceTree: attestation.sourceTree,
  profileDigest: attestation.profileDigest,
  bundleDigest: attestation.bundleDigest,
};

describe("Spec 224 trusted source attestation binding", () => {
  it("accepts only an exact current run, job, package, source, and fence binding", () => {
    expect(() =>
      assertSpec224AttestationMatches({
        attestation,
        ...matchingBinding,
      })
    ).not.toThrow();
  });

  it.each([
    ["tenantId", "tenant-other"],
    ["runId", "run-other"],
    ["workerJobId", "job-other"],
    ["workPackageId", "WP-OTHER"],
    ["attemptId", "attempt-other"],
    ["attempt", 3],
    ["projectionRevision", 8],
    ["decisionEpoch", 4],
    ["developmentRunFencingVersion", 12],
    ["workerJobFencingVersion", 20],
    ["sourceCommit", "4".repeat(40)],
    ["sourceTree", "5".repeat(40)],
    ["profileDigest", "6".repeat(64)],
    ["bundleDigest", "7".repeat(64)],
  ])("rejects a mismatched %s", (field, value) => {
    expect(() =>
      assertSpec224AttestationMatches({
        attestation,
        ...matchingBinding,
        [field]: value,
      } as Parameters<typeof assertSpec224AttestationMatches>[0])
    ).toThrowError(
      new Spec224AttestationError(`ATTESTATION_BINDING_MISMATCH:${field}`)
    );
  });

  it("rejects tampered trust and lifecycle fields before they can reach admission", () => {
    expect(() =>
      assertSpec224AttestationMatches({
        attestation: { ...attestation, status: "INVALIDATED" } as any,
        ...matchingBinding,
      })
    ).toThrowError("ATTESTATION_IDENTITY_INVALID");
    expect(() =>
      assertSpec224AttestationMatches({
        attestation: {
          ...attestation,
          trustClass: "TRUSTED_OBJECT_STORE",
        } as any,
        ...matchingBinding,
      })
    ).toThrowError("ATTESTATION_IDENTITY_INVALID");
  });
});
