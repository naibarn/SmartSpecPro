import { createHash } from "node:crypto";

const SHA256 = /^[a-f0-9]{64}$/;
const PROFILE_VERSION = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;

export type Spec224VerificationProvenance = Readonly<{
  candidateSha: string;
  verifiedBaseSha: string;
  specDigest: string;
  policySnapshotDigest: string;
  verificationProfileVersion: string;
  evidenceBundleDigest: string;
}>;

export type Spec224DeterministicProvenanceResult = Readonly<{
  provenance: Spec224VerificationProvenance;
  /** This validator does not inspect a checkout, artifact, or evidence store. */
  liveArtifactCheckRequired: true;
  /** This validator does not execute or attest a provider/Runner. */
  providerExecutionProofRequired: true;
}>;

export class Spec224VerificationProvenanceError extends Error {
  constructor(
    public readonly code: string,
    message = code
  ) {
    super(message);
    this.name = "Spec224VerificationProvenanceError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function assertSha(value: unknown, code: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new Spec224VerificationProvenanceError(code);
  }
  return value;
}

function assertProfileVersion(value: unknown): string {
  if (typeof value !== "string" || !PROFILE_VERSION.test(value)) {
    throw new Spec224VerificationProvenanceError(
      "VERIFICATION_PROFILE_VERSION_INVALID"
    );
  }
  return value;
}

/**
 * Validates only the immutable provenance tuple supplied by the caller.
 *
 * This function intentionally does not claim that the candidate/base exists,
 * that a policy snapshot can be loaded, or that a provider actually produced
 * the evidence bundle. Those checks belong to the live execution/control
 * plane, which is not an evidence store owned by this contract.
 */
export function validateSpec224VerificationProvenance(input: {
  provenance: Spec224VerificationProvenance;
  expectedSpecDigest: string;
}): Spec224DeterministicProvenanceResult {
  const expectedSpecDigest = assertSha(
    input.expectedSpecDigest,
    "EXPECTED_SPEC_DIGEST_INVALID"
  );
  const provenance = input.provenance;
  if (!provenance || typeof provenance !== "object") {
    throw new Spec224VerificationProvenanceError(
      "VERIFICATION_PROVENANCE_REQUIRED"
    );
  }
  const normalized: Spec224VerificationProvenance = {
    candidateSha: assertSha(provenance.candidateSha, "CANDIDATE_SHA_INVALID"),
    verifiedBaseSha: assertSha(
      provenance.verifiedBaseSha,
      "VERIFIED_BASE_SHA_INVALID"
    ),
    specDigest: assertSha(provenance.specDigest, "SPEC_DIGEST_INVALID"),
    policySnapshotDigest: assertSha(
      provenance.policySnapshotDigest,
      "POLICY_SNAPSHOT_DIGEST_INVALID"
    ),
    verificationProfileVersion: assertProfileVersion(
      provenance.verificationProfileVersion
    ),
    evidenceBundleDigest: assertSha(
      provenance.evidenceBundleDigest,
      "EVIDENCE_BUNDLE_DIGEST_INVALID"
    ),
  };
  if (normalized.specDigest !== expectedSpecDigest) {
    throw new Spec224VerificationProvenanceError("SPEC_DIGEST_MISMATCH");
  }
  return {
    provenance: normalized,
    liveArtifactCheckRequired: true,
    providerExecutionProofRequired: true,
  };
}

/**
 * Stable digest for a caller-owned evidence manifest. It hashes the manifest
 * value only; it does not resolve refs or assert that referenced artifacts
 * exist.
 */
export function digestSpec224EvidenceManifest(manifest: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(manifest)), "utf8")
    .digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}
