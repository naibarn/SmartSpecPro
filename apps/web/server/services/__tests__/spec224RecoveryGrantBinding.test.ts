import { describe, expect, it } from "vitest";

import {
  createSpec224RecoveryGrantBindingPayload,
  parseSpec224RecoveryGrantBinding,
  sameSpec224RecoveryGrantBinding,
  spec224RecoveryGrantBindingStateIsCurrent,
} from "../spec224RecoveryGrantBinding";

const persisted = {
  schemaVersion: "spec224.recovery-grant-binding.v1",
  grantId: "f9031247-336f-5f0b-944f-3f6679ea44c9",
  grantVersion: 1,
  scopeDigest: "a".repeat(64),
  tenantId: "tenant-1",
  ownerId: 11,
  runId: "run-1",
  workerJobId: "job-1",
  workPackageId: "WP-RECOVERY-04",
  attestationId: "attestation-1",
  operation: "modify_owned_paths",
  path: "python-backend/app/services/approval_db_service.py",
  boundAt: "2026-09-30T00:00:00.000Z",
};

describe("Spec 224 recovery grant binding idempotency", () => {
  it("emits owner identity in the canonical persisted grant binding", () => {
    const payload = createSpec224RecoveryGrantBindingPayload({
      grantId: persisted.grantId,
      grantVersion: persisted.grantVersion,
      scopeDigest: persisted.scopeDigest,
      canonical: persisted,
      operation: persisted.operation,
      path: persisted.path,
      boundAt: persisted.boundAt,
    });
    expect(parseSpec224RecoveryGrantBinding(payload)?.ownerId).toBe(11);
  });

  it("accepts a persisted binding with its canonical owner identity", () => {
    expect(parseSpec224RecoveryGrantBinding(persisted)?.ownerId).toBe(11);
  });

  it("treats a replay as identical when only its validation timestamp changes", () => {
    expect(
      sameSpec224RecoveryGrantBinding(persisted, {
        ...persisted,
        boundAt: "2026-09-30T00:01:00.000Z",
      })
    ).toBe(true);
  });

  it("rejects a replay that changes the grant or authorized operation", () => {
    expect(
      sameSpec224RecoveryGrantBinding(persisted, {
        ...persisted,
        grantId: "c9031247-336f-5f0b-944f-3f6679ea44c9",
        boundAt: "2026-09-30T00:01:00.000Z",
      })
    ).toBe(false);
    expect(
      sameSpec224RecoveryGrantBinding(persisted, {
        ...persisted,
        operation: "commit_owned_changes",
        boundAt: "2026-09-30T00:01:00.000Z",
      })
    ).toBe(false);
  });

  it("rejects binding if cancellation, attempt completion, or authorization changes during validation", () => {
    const policy = {
      runnerId: "runner-1",
      runnerSessionId: "session-1",
      capabilitySnapshotId: "snapshot-1",
      capabilitySnapshotRevision: "rev-1",
    };
    const current = {
      tenantOwnerId: 11,
      expectedOwnerId: 11,
      jobStatus: "running",
      jobStatusReason: null,
      jobAttempt: 1,
      jobFencingVersion: 4,
      expectedJobFencingVersion: 4,
      expectedAttempt: 1,
      run: {
        actorId: 11,
        runId: "run-1",
        projectionVersion: 2,
        decisionEpoch: 3,
        fencingVersion: 5,
      },
      requestedByUserId: 11,
      expectedRunId: "run-1",
      expectedRevision: 2,
      expectedDecisionEpoch: 3,
      expectedRunFencingVersion: 5,
      authorizationBinding: policy,
      expectedRunnerBinding: policy,
      attemptId: "attempt-1",
      expectedAttemptId: "attempt-1",
      attemptFinishedAt: null,
      runner: {
        ownerUserId: 11,
        status: "online",
        trustState: "trusted",
        activeSessionId: "session-1",
        currentSnapshotRevision: "rev-1",
        revokedAt: null,
      },
      capability: {
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
        snapshotJson: {
          capabilitySnapshotId: "snapshot-1",
          runnerSessionId: "session-1",
        },
      },
      now: new Date("2026-09-30T00:00:00.000Z"),
    };

    expect(spec224RecoveryGrantBindingStateIsCurrent(current)).toBe(true);
    expect(
      spec224RecoveryGrantBindingStateIsCurrent({
        ...current,
        jobStatus: "cancelled",
      })
    ).toBe(false);
    expect(
      spec224RecoveryGrantBindingStateIsCurrent({
        ...current,
        jobStatusReason: "cancel_requested:owner requested cancellation",
      })
    ).toBe(false);
    expect(
      spec224RecoveryGrantBindingStateIsCurrent({
        ...current,
        attemptFinishedAt: new Date("2026-09-30T00:00:01.000Z"),
      })
    ).toBe(false);
    expect(
      spec224RecoveryGrantBindingStateIsCurrent({
        ...current,
        authorizationBinding: { ...policy, runnerSessionId: "stale-session" },
      })
    ).toBe(false);
    expect(
      spec224RecoveryGrantBindingStateIsCurrent({
        ...current,
        capability: {
          ...current.capability,
          snapshotJson: {
            capabilitySnapshotId: "different-snapshot",
            runnerSessionId: "session-1",
          },
        },
      })
    ).toBe(false);
  });
});
