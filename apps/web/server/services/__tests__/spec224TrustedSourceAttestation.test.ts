import { describe, expect, it } from "vitest";

import {
  loadPersistedSpec224SourceAttestation,
  Spec224AttestationError,
  verifyLocalSpec224SourceBundle,
} from "../spec224TrustedSourceAttestation";

describe("Spec 224 local source attestation environment boundary", () => {
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
