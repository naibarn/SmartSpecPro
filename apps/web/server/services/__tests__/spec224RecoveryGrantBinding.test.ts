import { describe, expect, it } from "vitest";

import { sameSpec224RecoveryGrantBinding } from "../spec224RecoveryGrantBinding";

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
  operation: "modify_owned_paths",
  path: "python-backend/app/services/approval_db_service.py",
  boundAt: "2026-09-30T00:00:00.000Z",
};

describe("Spec 224 recovery grant binding idempotency", () => {
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
});
