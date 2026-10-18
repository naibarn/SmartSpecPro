import { describe, expect, it } from "vitest";
import { mapObservedLibraryEvidence } from "./libraryRetrievalObservedEvidence";

describe("mapObservedLibraryEvidence", () => {
  const base = {
    result: {
      status: "ready",
      accessSource: "owner" as const,
      metadata: {
        revision: "sha256:current-revision",
        digest: "a".repeat(64),
      },
    },
    evidenceId: "docs/guide.md",
    callerTenantId: "tenant-a",
    expectedTenantId: "tenant-a",
  };

  it("derives authorization from the observed Library result and keeps lifecycle unknown", () => {
    const evidence = mapObservedLibraryEvidence(base);

    expect(evidence).toMatchObject({
      evidenceId: "docs/guide.md",
      tenantId: "tenant-a",
      revision: "sha256:current-revision",
      digest: "a".repeat(64),
      authorized: true,
    });
    expect(evidence).not.toHaveProperty("revoked");
    expect(evidence).not.toHaveProperty("deleted");
  });

  it.each([
    { status: "deleted", accessSource: "owner" as const },
    { status: "ready", accessSource: "shared_group" as const, expectedTenantId: "tenant-b" },
  ])("fails closed when the observed status or tenant scope is invalid", override => {
    const evidence = mapObservedLibraryEvidence({
      ...base,
      ...("expectedTenantId" in override ? { expectedTenantId: override.expectedTenantId } : {}),
      result: { ...base.result, status: override.status, accessSource: override.accessSource },
    });
    expect(evidence.authorized).toBe(false);
  });

  it("preserves unknown revision and omits an invalid digest instead of inventing freshness evidence", () => {
    const evidence = mapObservedLibraryEvidence({
      ...base,
      result: { ...base.result, metadata: { digest: "not-a-digest" } },
    });
    expect(evidence.revision).toBe("unknown");
    expect(evidence).not.toHaveProperty("digest");
  });
});
