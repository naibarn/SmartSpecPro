import { describe, expect, it } from "vitest";

import { evaluateSpec224RuntimeAdmission } from "../spec224RuntimeAdmission";

const current = {
  tenantId: "tenant-1",
  tenantOwnerId: 7,
  workerJobId: "job-1",
  jobStatus: "running",
  jobStatusReason: null,
  actorId: 7,
  attempt: 2,
  currentAttemptId: "attempt-2",
  workerJobFencingVersion: 5,
  leaseValid: true,
  lease: {
    jobId: "job-1",
    attemptId: "attempt-2",
    fencingVersion: 5,
  },
  grantBinding: null,
  runnerBindingValid: false,
  run: {
    runId: "run-1",
    tenantId: "tenant-1",
    workerJobId: "job-1",
    actorId: 7,
    workPackageId: "WP-REQ-01",
    attempt: 2,
    revision: 4,
    developmentRunFencingVersion: 3,
  },
};

const localAttestation = {
  schemaVersion: "spec224.trusted-source-attestation.v1",
  attestationId: "a".repeat(64),
  trustClass: "LOCAL_NONPRODUCTION_INTEGRITY_ONLY",
  status: "ACTIVE",
  actorId: 7,
  tenantId: "tenant-1",
  runId: "run-1",
  workerJobId: "job-1",
  workPackageId: "WP-REQ-01",
  attempt: 2,
  projectionRevision: 4,
  workerJobFencingVersion: 5,
  developmentRunFencingVersion: 3,
};

describe("Spec 224 runtime admission decision", () => {
  it("denies a cancellation request before trust evaluation", () => {
    expect(
      evaluateSpec224RuntimeAdmission({
        ...current,
        jobStatusReason: "cancel_requested:owner request",
        attestation: localAttestation,
      })
    ).toEqual({ decision: "DENY", reason: "DENIED_CANCELLED" });
  });

  it("denies a persisted local-only attestation", () => {
    expect(
      evaluateSpec224RuntimeAdmission({
        ...current,
        attestation: localAttestation,
      })
    ).toEqual({
      decision: "DENY",
      reason: "DENIED_LOCAL_ONLY_ATTESTATION",
    });
  });

  it("denies when no canonical attestation is persisted", () => {
    expect(
      evaluateSpec224RuntimeAdmission({ ...current, attestation: null })
    ).toEqual({ decision: "DENY", reason: "DENIED_NO_ATTESTATION" });
  });

  it("denies an attestation bound to a different tenant or run", () => {
    expect(
      evaluateSpec224RuntimeAdmission({
        ...current,
        attestation: { ...localAttestation, tenantId: "tenant-2" },
      })
    ).toEqual({ decision: "DENY", reason: "DENIED_ATTESTATION_BINDING" });
  });

  it("denies stale attempt, revision, lease, or fence before trust evaluation", () => {
    expect(
      evaluateSpec224RuntimeAdmission({
        ...current,
        lease: { ...current.lease, fencingVersion: 4 },
        attestation: localAttestation,
      })
    ).toEqual({ decision: "DENY", reason: "DENIED_STALE_FENCE" });
  });

  it("ignores a caller-added remote trust field on a v1 local attestation", () => {
    expect(
      evaluateSpec224RuntimeAdmission({
        ...current,
        attestation: {
          ...localAttestation,
          trustLevel: "REMOTE_TEST_TRUSTED",
        },
      })
    ).toEqual({ decision: "DENY", reason: "DENIED_LOCAL_ONLY_ATTESTATION" });
  });

  it("rejects unknown trust levels", () => {
    expect(
      evaluateSpec224RuntimeAdmission({
        ...current,
        attestation: {
          ...localAttestation,
          trustClass: undefined,
          trustLevel: "TRUSTED",
        },
      })
    ).toEqual({ decision: "DENY", reason: "DENIED_ATTESTATION_INVALID" });
  });

  it("keeps positive admission locked even for remote-shaped test evidence", () => {
    expect(
      evaluateSpec224RuntimeAdmission({
        ...current,
        attestation: {
          ...localAttestation,
          schemaVersion: "spec224.trusted-source-attestation.v2",
          attestationVersion: 2,
          trustClass: "REMOTE_TEST_TRUSTED",
          trustLevel: "REMOTE_TEST_TRUSTED",
          storageProvider: "s3-compatible",
          storageObjectReference: "s3://test-only/profile/bundle",
          remoteTrustEvidenceDigest: "d".repeat(64),
        },
      })
    ).toEqual({ decision: "DENY", reason: "DENIED_ADMISSION_NOT_ENABLED" });
  });
});
