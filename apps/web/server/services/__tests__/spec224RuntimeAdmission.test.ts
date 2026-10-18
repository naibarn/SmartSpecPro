import { describe, expect, it } from "vitest";

import { evaluateSpec224RuntimeAdmission, spec224ProfileRunnerTargetMatches } from "../spec224RuntimeAdmission";

const current = {
  tenantId: "tenant-1",
  tenantOwnerId: 7,
  workerJobId: "job-1",
  jobStatus: "running",
  jobStatusReason: null,
  actorId: 7,
  attempt: 2,
  currentAttemptId: "attempt-2",
  attemptLeaseGeneration: 1,
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

  it("requires a verified remote trust root for remote-shaped evidence", () => {
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
    ).toEqual({ decision: "DENY", reason: "DENIED_REMOTE_TRUST_REQUIRED" });
  });
});


describe("Windows profile binding at canonical admission", () => {
  it("uses the canonical manifest policy workspace, rejects wrong target, and preserves legacy admission gates", () => {
    const source = "a".repeat(40);
    const now = Date.parse("2026-10-17T12:00:00Z");
    const capability = {
      platform: { os: "windows", architecture: "x86_64", target: "x86_64-pc-windows-msvc" },
      runnerVersion: "0.2.31", observedAt: "2026-10-17T11:59:00Z", expiresAt: "2026-10-17T12:04:00Z",
      capabilities: ["agent.external_task", "tool.execute.codex"],
      toolInventory: [
        { toolId: "git", adapterId: "git.v1", observedAt: "2026-10-17T11:59:00Z", expiresAt: "2026-10-17T12:04:00Z",
          installState: "installed", configurationState: "configured", healthState: "healthy",
          trustState: "ready", availabilityState: "available" },
        { toolId: "codex", adapterId: "codex.v1", observedAt: "2026-10-17T11:59:00Z", expiresAt: "2026-10-17T12:04:00Z",
          installState: "installed", configurationState: "configured", authState: "authenticated",
          healthState: "healthy", trustState: "ready", availabilityState: "available",
          authorizationEvidenceRef: "TEST_ONLY" },
      ],
      workspaces: [{ workspaceId: "ws-owned", gitHead: source, dirty: false, projectId: "TEST_ONLY", repositoryId: "TEST_ONLY" }],
    };
    const input = { profileId: "spec224-recovery-windows-x64-codex-nonprod", sourceCommit: source,
      canonicalInputJson: { manifest: { provider: "codex", runtime: "local_runner", policyBinding: { workspaceRef: "ws-owned" } } }, capabilitySnapshot: capability, now };
    expect(spec224ProfileRunnerTargetMatches(input)).toBe(true);
    expect(spec224ProfileRunnerTargetMatches({ ...input, canonicalInputJson: { manifest: {
      ...input.canonicalInputJson.manifest, provider: "claude_code" } } })).toBe(false);
    expect(spec224ProfileRunnerTargetMatches({ ...input, canonicalInputJson: { manifest: {
      ...input.canonicalInputJson.manifest, runtime: "remote_worker" } } })).toBe(false);

    expect(spec224ProfileRunnerTargetMatches({ ...input, canonicalInputJson: { workspaceRef: "ws-owned" } })).toBe(false);
    expect(spec224ProfileRunnerTargetMatches({ ...input, sourceCommit: "b".repeat(40) })).toBe(false);
    expect(spec224ProfileRunnerTargetMatches({ ...input, capabilitySnapshot: {
      ...capability, capabilities: [],
    } })).toBe(false);
    expect(spec224ProfileRunnerTargetMatches({ ...input, capabilitySnapshot: {
      ...capability, toolInventory: capability.toolInventory.slice(1),
    } })).toBe(false);
    expect(spec224ProfileRunnerTargetMatches({ ...input, capabilitySnapshot: { ...capability,
      platform: { ...capability.platform, os: "linux" } } })).toBe(false);
    // This predicate adds only a Windows target constraint; it does not replace
    // legacy grant/lease/Runner binding checks with a new platform policy.
    expect(spec224ProfileRunnerTargetMatches({ ...input, profileId: "spec224-recovery-registered-runner-nonprod",
      canonicalInputJson: null, capabilitySnapshot: null })).toBe(true);
  });
});
