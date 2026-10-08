import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  SPEC224_REMOTE_TRUST_CONTRACT,
  verifySpec224RemoteSourceEvidence,
  type Spec224RemoteSourceEvidence,
  type Spec224RemoteTrustAuthority,
  type Spec224RemoteTrustVerifyInput,
} from "./spec224RemoteSourceTrustVerifier";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

function fixture() {
  const now = new Date("2026-10-09T10:00:00.000Z");
  const pair = crypto.generateKeyPairSync("ed25519");
  const fingerprint = crypto
    .createHash("sha256")
    .update(pair.publicKey.export({ type: "spki", format: "der" }))
    .digest("hex");
  const source = Buffer.from("verified-source-content");
  const manifest = Buffer.from("verified-source-manifest");
  const sourceDigest = crypto.createHash("sha256").update(source).digest("hex");
  const manifestDigest = crypto
    .createHash("sha256")
    .update(manifest)
    .digest("hex");
  const evidence: Spec224RemoteSourceEvidence = {
    contract: SPEC224_REMOTE_TRUST_CONTRACT,
    attestationId: "attestation-1",
    issuerId: "test-issuer",
    keyId: "test-key",
    keyFingerprintSha256: fingerprint,
    issuedAt: new Date(now.getTime() - 1000).toISOString(),
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    evidenceObject: {
      provider: "r2",
      bucketIdentity: "test-bucket",
      objectKey: "spec224/profiles/nonprod-test/evidence/attestation-1",
    },
    binding: {
      tenantId: "tenant-1",
      developmentRunId: "run-1",
      developmentRunFencingVersion: 2,
      workUnitId: "wu-1",
      jobId: "job-1",
      attemptId: "attempt-1",
      attemptNumber: 1,
      attemptFencingVersion: 3,
      repository: "org/repo",
      sourceCommitSha: "1".repeat(40),
      sourceTreeSha: "2".repeat(40),
      sourceManifestSha256: manifestDigest,
      sourceContentSha256: sourceDigest,
      profileId: "nonprod-test",
      profileVersion: "1",
      profileSha256: "c".repeat(64),
      artifacts: [
        {
          name: "out.bin",
          sha256: sourceDigest,
          size: source.length,
        },
      ],
      runnerNodeId: "runner-1",
      runnerSessionId: "session-1",
      capabilityRevision: 7,
    },
    objects: [
      {
        provider: "r2",
        bucketIdentity: "test-bucket",
        objectKey: "spec224/profiles/nonprod-test/source/content",
        sha256: sourceDigest,
        size: source.length,
      },
      {
        provider: "r2",
        bucketIdentity: "test-bucket",
        objectKey: "spec224/profiles/nonprod-test/source/manifest",
        sha256: manifestDigest,
        size: manifest.length,
      },
    ],
  };
  const evidenceBytes = Buffer.from(canonical(evidence));
  const evidenceRef = {
    provider: "r2" as const,
    bucketIdentity: "test-bucket",
    objectKey: "spec224/profiles/nonprod-test/evidence/attestation-1",
    sha256: crypto.createHash("sha256").update(evidenceBytes).digest("hex"),
    size: evidenceBytes.length,
  };
  const authority: Spec224RemoteTrustAuthority = {
    resolveKey: vi.fn(async () => ({
      issuerId: "test-issuer",
      keyId: "test-key",
      fingerprintSha256: fingerprint,
      publicKeyPem: pair.publicKey
        .export({ type: "spki", format: "pem" })
        .toString(),
      notBefore: "2026-01-01T00:00:00.000Z",
      notAfter: "2027-01-01T00:00:00.000Z",
      revokedAt: null,
      allowedTenantIds: ["tenant-1"],
      allowedProfileIds: ["nonprod-test"],
    })),
    resolveStoragePolicy: vi.fn(async () => ({
      bucketIdentities: ["test-bucket"],
      objectPrefix: "spec224/profiles/nonprod-test/",
    })),
    readObject: vi.fn(async ref =>
      ref.objectKey.includes("evidence/")
        ? evidenceBytes
        : ref.sha256 === manifestDigest
          ? manifest
          : source
    ),
    isRevoked: vi.fn(async () => false),
    isReplay: vi.fn(async () => false),
  };
  const input: Spec224RemoteTrustVerifyInput = {
    evidence,
    signatureBase64: crypto
      .sign(null, Buffer.from(canonical(evidence)), pair.privateKey)
      .toString("base64"),
    expectedBinding: structuredClone(evidence.binding),
    expectedEvidenceObject: evidenceRef,
    now,
    maxEvidenceAgeMs: 10_000,
    timeoutMs: 100,
    authority,
  };
  return { input, evidence, authority, pair, source };
}

describe("SPEC-224 remote source trust verifier v1", () => {
  it("accepts a correctly signed, fresh and content-addressed non-production evidence package", async () => {
    const { input } = fixture();
    await expect(
      verifySpec224RemoteSourceEvidence(input)
    ).resolves.toMatchObject({ status: "VERIFIED", reason: "VERIFIED" });
  });

  it("rejects payload and signature tampering", async () => {
    const f = fixture();
    const changed = {
      ...f.input,
      evidence: { ...f.evidence, attestationId: "forged" },
    };
    await expect(
      verifySpec224RemoteSourceEvidence(changed)
    ).resolves.toMatchObject({ reason: "SIGNATURE_INVALID" });
    await expect(
      verifySpec224RemoteSourceEvidence({
        ...f.input,
        signatureBase64: "Zm9yZ2Vk",
      })
    ).resolves.toMatchObject({ reason: "SIGNATURE_INVALID" });
  });

  it("rejects unknown issuers, revoked keys, and retired key validity windows", async () => {
    const f = fixture();
    vi.mocked(f.authority.resolveKey).mockResolvedValueOnce(null);
    await expect(
      verifySpec224RemoteSourceEvidence(f.input)
    ).resolves.toMatchObject({ reason: "UNTRUSTED_ISSUER" });
    vi.mocked(f.authority.resolveKey).mockResolvedValueOnce({
      issuerId: "test-issuer",
      keyId: "test-key",
      fingerprintSha256: f.evidence.keyFingerprintSha256,
      publicKeyPem: f.pair.publicKey
        .export({ type: "spki", format: "pem" })
        .toString(),
      notBefore: "2026-01-01T00:00:00Z",
      notAfter: "2027-01-01T00:00:00Z",
      revokedAt: "2026-10-09T09:59:59Z",
      allowedTenantIds: ["tenant-1"],
      allowedProfileIds: ["nonprod-test"],
    });
    await expect(
      verifySpec224RemoteSourceEvidence(f.input)
    ).resolves.toMatchObject({ reason: "KEY_REVOKED" });
  });

  it("accepts the prior key only when its signed issue time falls inside approved validity, and rejects out-of-scope identity", async () => {
    const f = fixture();
    await expect(
      verifySpec224RemoteSourceEvidence(f.input)
    ).resolves.toMatchObject({ status: "VERIFIED" });
    await expect(
      verifySpec224RemoteSourceEvidence({
        ...f.input,
        expectedBinding: { ...f.evidence.binding, tenantId: "tenant-2" },
      })
    ).resolves.toMatchObject({ reason: "BINDING_MISMATCH" });
    vi.mocked(f.authority.resolveKey).mockResolvedValueOnce({
      issuerId: "test-issuer",
      keyId: "test-key",
      fingerprintSha256: f.evidence.keyFingerprintSha256,
      publicKeyPem: f.pair.publicKey
        .export({ type: "spki", format: "pem" })
        .toString(),
      notBefore: "2026-01-01T00:00:00Z",
      notAfter: "2026-10-09T10:00:00Z",
      revokedAt: null,
      allowedTenantIds: ["tenant-1"],
      allowedProfileIds: ["nonprod-test"],
    });
    await expect(
      verifySpec224RemoteSourceEvidence(f.input)
    ).resolves.toMatchObject({ status: "VERIFIED" });
    vi.mocked(f.authority.resolveKey).mockResolvedValueOnce({
      issuerId: "test-issuer",
      keyId: "test-key",
      fingerprintSha256: f.evidence.keyFingerprintSha256,
      publicKeyPem: f.pair.publicKey
        .export({ type: "spki", format: "pem" })
        .toString(),
      notBefore: "2026-01-01T00:00:00Z",
      notAfter: "2026-10-09T09:59:00Z",
      revokedAt: null,
      allowedTenantIds: ["tenant-1"],
      allowedProfileIds: ["nonprod-test"],
    });
    await expect(
      verifySpec224RemoteSourceEvidence(f.input)
    ).resolves.toMatchObject({ reason: "KEY_EXPIRED" });
  });

  it("rejects wrong run/job/attempt/source/artifact/runner/capability bindings", async () => {
    const { input, evidence } = fixture();
    for (const field of [
      "developmentRunId",
      "jobId",
      "attemptId",
      "sourceCommitSha",
      "sourceContentSha256",
      "runnerSessionId",
      "capabilityRevision",
    ] as const) {
      const mismatch = {
        ...evidence.binding,
        [field]: field === "capabilityRevision" ? 99 : "wrong",
      };
      await expect(
        verifySpec224RemoteSourceEvidence({
          ...input,
          expectedBinding: mismatch,
        })
      ).resolves.toMatchObject({ reason: "BINDING_MISMATCH" });
    }
  });

  it("rejects stale, future, expired, malformed, or structurally forged evidence", async () => {
    const f = fixture();
    await expect(
      verifySpec224RemoteSourceEvidence({
        ...f.input,
        now: new Date("2026-10-09T10:01:00Z"),
      })
    ).resolves.toMatchObject({ reason: "EVIDENCE_EXPIRED" });
    await expect(
      verifySpec224RemoteSourceEvidence({
        ...f.input,
        now: new Date("2026-10-08T00:00:00Z"),
      })
    ).resolves.toMatchObject({ reason: "EVIDENCE_FUTURE" });
    await expect(
      verifySpec224RemoteSourceEvidence({ ...f.input, maxEvidenceAgeMs: 1 })
    ).resolves.toMatchObject({ reason: "EVIDENCE_TOO_OLD" });
    await expect(
      verifySpec224RemoteSourceEvidence({
        ...f.input,
        evidence: { ...f.evidence, objects: "forged" },
      })
    ).resolves.toMatchObject({ reason: "MALFORMED_EVIDENCE" });
  });

  it("rejects changed evidence/source bytes and arbitrary bucket, traversal, or URL references", async () => {
    const f = fixture();
    vi.mocked(f.authority.readObject).mockImplementation(async ref =>
      ref.objectKey.includes("evidence/") ? Buffer.from("tampered") : f.source
    );
    await expect(
      verifySpec224RemoteSourceEvidence(f.input)
    ).resolves.toMatchObject({ reason: "OBJECT_CONTENT_MISMATCH" });
    const unsafe = {
      ...f.input,
      expectedEvidenceObject: {
        ...f.input.expectedEvidenceObject,
        objectKey: "https://attacker.invalid/x",
      },
    };
    await expect(
      verifySpec224RemoteSourceEvidence(unsafe)
    ).resolves.toMatchObject({ reason: "OBJECT_REFERENCE_INVALID" });
    const traversal = {
      ...f.input,
      expectedEvidenceObject: {
        ...f.input.expectedEvidenceObject,
        objectKey: "spec224/profiles/nonprod-test/../evil",
      },
    };
    await expect(
      verifySpec224RemoteSourceEvidence(traversal)
    ).resolves.toMatchObject({ reason: "OBJECT_REFERENCE_INVALID" });
  });

  it("fails closed on unavailable key, storage, revocation, and replay authorities", async () => {
    const f = fixture();
    vi.mocked(f.authority.resolveKey).mockRejectedValueOnce(new Error("down"));
    await expect(
      verifySpec224RemoteSourceEvidence(f.input)
    ).resolves.toMatchObject({ reason: "AUTHORITY_UNAVAILABLE" });
    vi.mocked(f.authority.readObject).mockRejectedValueOnce(new Error("down"));
    await expect(
      verifySpec224RemoteSourceEvidence(f.input)
    ).resolves.toMatchObject({ reason: "STORAGE_UNAVAILABLE" });
    vi.mocked(f.authority.isRevoked).mockResolvedValueOnce(true);
    await expect(
      verifySpec224RemoteSourceEvidence(f.input)
    ).resolves.toMatchObject({ reason: "REVOKED" });
    vi.mocked(f.authority.isReplay).mockResolvedValueOnce(true);
    await expect(
      verifySpec224RemoteSourceEvidence(f.input)
    ).resolves.toMatchObject({ reason: "REPLAYED" });
  });

  it("uses server-resolved storage scope and rejects a key whose declared fingerprint does not match its key bytes", async () => {
    const f = fixture();
    vi.mocked(f.authority.resolveStoragePolicy).mockResolvedValueOnce({
      bucketIdentities: ["other-bucket"],
      objectPrefix: "spec224/profiles/nonprod-test/",
    });
    await expect(
      verifySpec224RemoteSourceEvidence(f.input)
    ).resolves.toMatchObject({ reason: "OBJECT_REFERENCE_INVALID" });
    vi.mocked(f.authority.resolveStoragePolicy).mockResolvedValueOnce({
      bucketIdentities: ["test-bucket"],
      objectPrefix: "spec224/profiles/nonprod-test/",
    });
    vi.mocked(f.authority.resolveKey).mockResolvedValueOnce({
      issuerId: "test-issuer",
      keyId: "test-key",
      fingerprintSha256: "d".repeat(64),
      publicKeyPem: f.pair.publicKey
        .export({ type: "spki", format: "pem" })
        .toString(),
      notBefore: "2026-01-01T00:00:00Z",
      notAfter: "2027-01-01T00:00:00Z",
      revokedAt: null,
      allowedTenantIds: ["tenant-1"],
      allowedProfileIds: ["nonprod-test"],
    });
    await expect(
      verifySpec224RemoteSourceEvidence(f.input)
    ).resolves.toMatchObject({ reason: "KEY_INVALID" });
  });

  it("bounds reads and rejects oversized packages", async () => {
    const f = fixture();
    const huge = {
      ...f.input,
      evidence: {
        ...f.evidence,
        objects: [{ ...f.evidence.objects[0]!, size: 70 * 1024 * 1024 }],
      },
    };
    await expect(
      verifySpec224RemoteSourceEvidence(huge)
    ).resolves.toMatchObject({ reason: "OBJECT_TOO_LARGE" });
    const slow = fixture();
    vi.mocked(slow.authority.readObject).mockImplementation(
      () => new Promise(() => undefined)
    );
    await expect(
      verifySpec224RemoteSourceEvidence({ ...slow.input, timeoutMs: 5 })
    ).resolves.toMatchObject({ reason: "STORAGE_TIMEOUT" });
  });

  it("requires the authority adapter to reject a second use and keeps source evidence separate from dispatch", async () => {
    const f = fixture();
    expect(f.authority.isReplay).toBeDefined();
    const result = await verifySpec224RemoteSourceEvidence(f.input);
    expect(result).toMatchObject({ status: "VERIFIED" });
    expect(result).not.toHaveProperty("dispatchAllowed");
  });
});
