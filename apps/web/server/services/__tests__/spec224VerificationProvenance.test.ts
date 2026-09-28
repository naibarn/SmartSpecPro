import { describe, expect, it } from "vitest";

import {
  Spec224VerificationProvenanceError,
  validateSpec224VerificationProvenance,
} from "../spec224VerificationProvenance";

const provenance = {
  candidateSha: "a".repeat(64),
  verifiedBaseSha: "b".repeat(64),
  specDigest: "c".repeat(64),
  policySnapshotDigest: "d".repeat(64),
  verificationProfileVersion: "profile:spec224-v1",
  evidenceBundleDigest: "e".repeat(64),
};

describe("Spec 224 deterministic verification provenance", () => {
  it("accepts a complete tuple only when it is bound to the persisted spec digest", () => {
    const result = validateSpec224VerificationProvenance({
      provenance,
      expectedSpecDigest: provenance.specDigest,
    });

    expect(result).toEqual({
      provenance,
      liveArtifactCheckRequired: true,
      providerExecutionProofRequired: true,
    });
  });

  it("rejects a stale spec digest before any final-verify mutation", () => {
    expect(() =>
      validateSpec224VerificationProvenance({
        provenance,
        expectedSpecDigest: "f".repeat(64),
      })
    ).toThrowError(
      expect.objectContaining<Spec224VerificationProvenanceError>({
        code: "SPEC_DIGEST_MISMATCH",
      })
    );
  });

  it("rejects malformed source, policy, or evidence digests", () => {
    expect(() =>
      validateSpec224VerificationProvenance({
        provenance: { ...provenance, candidateSha: "not-a-sha" },
        expectedSpecDigest: provenance.specDigest,
      })
    ).toThrow("CANDIDATE_SHA_INVALID");

    expect(() =>
      validateSpec224VerificationProvenance({
        provenance: { ...provenance, policySnapshotDigest: "" },
        expectedSpecDigest: provenance.specDigest,
      })
    ).toThrow("POLICY_SNAPSHOT_DIGEST_INVALID");

    expect(() =>
      validateSpec224VerificationProvenance({
        provenance: { ...provenance, evidenceBundleDigest: "wrong" },
        expectedSpecDigest: provenance.specDigest,
      })
    ).toThrow("EVIDENCE_BUNDLE_DIGEST_INVALID");
  });
});
