import { describe, expect, it } from "vitest";

import { evaluateSpec224WorkspaceSourceAdmission } from "./spec224WorkspaceSourceAdmission";

const source = {
  gitHead: "a".repeat(40),
  contentFingerprint: "b".repeat(64),
  snapshotRevision: "runner-snapshot-1",
  dirty: true,
  dirtyPaths: ["python-backend/app/api/approvals.py", "orchestra/tasks/cloudflare/HANDOFF.md"],
};

describe("SPEC-224 source-scoped workspace admission", () => {
  it("allows a finite write set disjoint from existing dirty paths", () => {
    expect(evaluateSpec224WorkspaceSourceAdmission({ ...source, allowedWriteSet: ["apps/web/server/services/spec224/**"] })).toMatchObject({
      status: "SAFE_DISJOINT_DIRTY",
      code: "SAFE_DISJOINT_DIRTY",
      sourceSha: source.gitHead,
      snapshotRevision: source.snapshotRevision,
    });
  });

  it("blocks a write set that overlaps a pre-existing dirty file", () => {
    expect(evaluateSpec224WorkspaceSourceAdmission({ ...source, allowedWriteSet: ["python-backend/app/api/*.py"] })).toMatchObject({
      status: "BLOCKED",
      code: "SCOPE_CONFLICT",
      conflictingPaths: ["python-backend/app/api/approvals.py"],
    });
  });

  it("fails closed for missing path evidence, broad prompt scopes, and stale fingerprints", () => {
    expect(evaluateSpec224WorkspaceSourceAdmission({ ...source, dirtyPaths: null, allowedWriteSet: ["apps/web/**"] }).code).toBe("DIRTY_PATHS_UNKNOWN");
    expect(evaluateSpec224WorkspaceSourceAdmission({ ...source, allowedWriteSet: ["**"] }).code).toBe("WRITE_SCOPE_UNBOUNDED");
    expect(evaluateSpec224WorkspaceSourceAdmission({ ...source, expectedFingerprint: "c".repeat(64), allowedWriteSet: ["apps/web/**"] }).code).toBe("SOURCE_CHANGED");
  });

  it("rejects malformed repository paths and unknown dirty state", () => {
    expect(evaluateSpec224WorkspaceSourceAdmission({ ...source, dirtyPaths: ["../secret"], allowedWriteSet: ["apps/web/**"] }).code).toBe("DIRTY_PATHS_UNKNOWN");
    expect(evaluateSpec224WorkspaceSourceAdmission({ ...source, dirty: null, allowedWriteSet: ["apps/web/**"] }).code).toBe("SOURCE_FACTS_UNKNOWN");
  });
});
