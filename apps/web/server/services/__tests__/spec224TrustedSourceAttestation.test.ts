import { describe, expect, it } from "vitest";

import {
  assertSpec224TrustedAttestationContract,
  loadPersistedSpec224SourceAttestation,
  Spec224AttestationError,
  verifyLocalSpec224SourceBundle,
} from "../spec224TrustedSourceAttestation";

describe("Spec 224 local source attestation environment boundary", () => {
  it("accepts only an explicit local-only v2 attestation without remote evidence", () => {
    expect(() =>
      assertSpec224TrustedAttestationContract({
        schemaVersion: "spec224.trusted-source-attestation.v2",
        attestationVersion: 2,
        trustLevel: "LOCAL_NONPRODUCTION_INTEGRITY_ONLY",
        trustClass: "LOCAL_NONPRODUCTION_INTEGRITY_ONLY",
        issuer: "spec224-local-source-verifier.v2",
        issuerVersion: "2",
        storageProvider: "local",
        storageObjectReference: "local-nonprod-bundle:sha256:" + "a".repeat(64),
        remoteTrustEvidenceDigest: null,
        invalidatedAt: null,
        invalidationReason: null,
        status: "ACTIVE",
      })
    ).not.toThrow();
  });

  it("rejects local attestations that claim remote trust evidence", () => {
    expect(() =>
      assertSpec224TrustedAttestationContract({
        schemaVersion: "spec224.trusted-source-attestation.v2",
        attestationVersion: 2,
        trustLevel: "LOCAL_NONPRODUCTION_INTEGRITY_ONLY",
        trustClass: "LOCAL_NONPRODUCTION_INTEGRITY_ONLY",
        issuer: "spec224-local-source-verifier.v2",
        issuerVersion: "2",
        storageProvider: "local",
        storageObjectReference: "local-nonprod-bundle:sha256:" + "a".repeat(64),
        remoteTrustEvidenceDigest: "b".repeat(64),
        invalidatedAt: null,
        invalidationReason: null,
        status: "ACTIVE",
      })
    ).toThrowError(
      new Spec224AttestationError("LOCAL_ATTESTATION_REMOTE_EVIDENCE_FORBIDDEN")
    );
  });

  it("accepts a typed invalidation state and rejects unknown invalidation reasons", () => {
    const invalidated = {
      schemaVersion: "spec224.trusted-source-attestation.v2",
      attestationVersion: 2,
      trustLevel: "LOCAL_NONPRODUCTION_INTEGRITY_ONLY",
      trustClass: "LOCAL_NONPRODUCTION_INTEGRITY_ONLY",
      issuer: "spec224-local-source-verifier.v2",
      issuerVersion: "2",
      storageProvider: "local",
      storageObjectReference: "local-nonprod-bundle:sha256:" + "a".repeat(64),
      remoteTrustEvidenceDigest: null,
      status: "INVALIDATED",
      invalidatedAt: "2026-09-29T00:00:00.000Z",
      invalidationReason: "OWNER_REVOKED",
    };
    expect(() =>
      assertSpec224TrustedAttestationContract(invalidated)
    ).not.toThrow();
    expect(() =>
      assertSpec224TrustedAttestationContract({
        ...invalidated,
        invalidationReason: "UNREVIEWED_REASON",
      })
    ).toThrowError(
      new Spec224AttestationError("ATTESTATION_INVALIDATION_STATE_INVALID")
    );
  });

  it("fails closed for unsupported production and unknown trust levels", () => {
    const base = {
      schemaVersion: "spec224.trusted-source-attestation.v2",
      attestationVersion: 2,
      trustClass: "LOCAL_NONPRODUCTION_INTEGRITY_ONLY",
      issuer: "spec224-local-source-verifier.v2",
      issuerVersion: "2",
      storageProvider: "local",
      storageObjectReference: "local-nonprod-bundle:sha256:" + "a".repeat(64),
      remoteTrustEvidenceDigest: null,
      invalidatedAt: null,
      invalidationReason: null,
      status: "ACTIVE",
    };
    expect(() =>
      assertSpec224TrustedAttestationContract({
        ...base,
        trustLevel: "PRODUCTION_TRUSTED",
      })
    ).toThrowError(
      new Spec224AttestationError("ATTESTATION_TRUST_LEVEL_UNSUPPORTED")
    );
    expect(() =>
      assertSpec224TrustedAttestationContract({
        ...base,
        trustLevel: "TRUSTED",
      })
    ).toThrowError(
      new Spec224AttestationError("ATTESTATION_TRUST_LEVEL_INVALID")
    );
  });

  it.each([undefined, "", "production", "staging"])(
    "fails closed when NODE_ENV is %s",
    async value => {
      const previous = process.env.NODE_ENV;
      if (value === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = value;
      try {
        const expectedError = new Spec224AttestationError(
          "LOCAL_ATTESTATION_NONPRODUCTION_ENV_REQUIRED"
        );
        await expect(
          verifyLocalSpec224SourceBundle("/does/not/matter")
        ).rejects.toThrowError(expectedError);
        await expect(
          loadPersistedSpec224SourceAttestation({
            attestationId: "a".repeat(64),
            bundlePath: "/does/not/matter",
            tenantId: "tenant",
            runId: "run",
            workerJobId: "job",
            workPackageId: "WP-TEST",
            attemptId: "attempt",
            attempt: 1,
            projectionRevision: 1,
            decisionEpoch: 1,
            developmentRunFencingVersion: 1,
            workerJobFencingVersion: 1,
            sourceCommit: "b".repeat(40),
            sourceTree: "c".repeat(40),
            profileDigest: "d".repeat(64),
            bundleDigest: "e".repeat(64),
          })
        ).rejects.toThrowError(expectedError);
      } finally {
        if (previous === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previous;
      }
    }
  );

  it.each(["test", "development"])(
    "allows only an explicitly local %s environment to continue to bundle checks",
    async value => {
      const previousNodeEnv = process.env.NODE_ENV;
      const previousBundleRoot = process.env.SPEC224_NONPROD_BUNDLE_ROOT;
      process.env.NODE_ENV = value;
      delete process.env.SPEC224_NONPROD_BUNDLE_ROOT;
      try {
        await expect(
          verifyLocalSpec224SourceBundle("/does/not/matter")
        ).rejects.toThrowError(
          new Spec224AttestationError("BUNDLE_ROOT_NOT_CONFIGURED")
        );
      } finally {
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
        if (previousBundleRoot === undefined)
          delete process.env.SPEC224_NONPROD_BUNDLE_ROOT;
        else process.env.SPEC224_NONPROD_BUNDLE_ROOT = previousBundleRoot;
      }
    }
  );
});
