import { describe, expect, it } from "vitest";
import {
  buildProductionContextSnapshot,
  validateProductionContextSnapshotRef,
} from "../verticalDramaAssuranceContext";

function input(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    snapshotId: "ctx-1",
    revision: 1,
    seriesId: 101,
    profile: {
      profileId: "drama_romance",
      version: 1,
      contentKind: "fiction",
      visualGroundingVersion: 1,
      visualGroundingFingerprint: "a".repeat(64),
      factPolicyVersion: 1,
      brollPolicyVersion: 1,
    },
    sourcePackPolicy: "optional",
    sourcePackDecision: "explicit_none",
    sourcePack: null,
    visualSource: {
      snapshotId: "visual-1",
      revision: 1,
      fingerprint: "b".repeat(64),
      visualCanonVersion: 1,
      visualCanonFingerprint: "c".repeat(64),
    },
    claimLedger: null,
    coveragePlan: null,
    references: {
      storyControlRefs: ["story-2", "story-1"],
      characterRefs: ["char-2", "char-1"],
      sceneRefs: ["scene-2", "scene-1"],
      shotRefs: ["shot-2", "shot-1"],
      claimRefs: [],
      coverageRefs: [],
      slotRefs: ["slot-2", "slot-1"],
      assetRefs: ["asset-9", "asset-2"],
      segmentRefs: ["segment-9", "segment-2"],
      mediaBindingRefs: ["binding-2", "binding-1"],
    },
    ...overrides,
  };
}

describe("vertical drama production-context snapshot", () => {
  it("canonicalizes key order and normalizes set-like references without changing the fingerprint", () => {
    const first = buildProductionContextSnapshot(input());
    const second = buildProductionContextSnapshot(
      input({
        references: {
          storyControlRefs: ["story-1", "story-2"],
          characterRefs: ["char-1", "char-2"],
          sceneRefs: ["scene-1", "scene-2"],
          shotRefs: ["shot-1", "shot-2"],
          claimRefs: [],
          coverageRefs: [],
          slotRefs: ["slot-1", "slot-2"],
          assetRefs: ["asset-2", "asset-9"],
          segmentRefs: ["segment-2", "segment-9"],
          mediaBindingRefs: ["binding-2", "binding-1"],
        },
      })
    );

    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.references.assetRefs).toEqual(["asset-2", "asset-9"]);
    expect(first.references.mediaBindingRefs).toEqual(["binding-2", "binding-1"]);
  });

  it.each([
    ["profile", { profileId: "horror_thriller" }],
    ["visual source", { visualSource: { snapshotId: "visual-1", revision: 1, fingerprint: "d".repeat(64), visualCanonVersion: 1, visualCanonFingerprint: "c".repeat(64) } }],
    ["claim ledger", { claimLedger: { version: 1, fingerprint: "e".repeat(64) } }],
    ["coverage", { coveragePlan: { version: 1, fingerprint: "f".repeat(64) } }],
    ["binding", { references: { ...input().references, mediaBindingRefs: ["binding-3", "binding-1"] } }],
  ])("changes the fingerprint when authoritative %s changes", (_label, change) => {
    const base = buildProductionContextSnapshot(input());
    const changed = buildProductionContextSnapshot(
      input({
        ...change,
        profile: { ...input().profile, ...((change as any).profile ?? {}) },
      })
    );
    expect(changed.fingerprint).not.toBe(base.fingerprint);
  });

  it("hashes explicit null source-pack decisions and rejects them for required profiles", () => {
    const snapshot = buildProductionContextSnapshot(input());
    expect(snapshot.sourcePack).toBeNull();
    expect(snapshot.sourcePackDecision).toBe("explicit_none");
    expect(() =>
      buildProductionContextSnapshot(
        input({ sourcePackPolicy: "required", profile: { ...input().profile, contentKind: "documentary" } })
      )
    ).toThrow();
  });

  it("detects stale snapshot identity, revision, and fingerprint with stable codes", () => {
    const snapshot = buildProductionContextSnapshot(input());
    expect(validateProductionContextSnapshotRef(snapshot, { ...snapshot, snapshotId: "ctx-2" }).code).toBe("VD_ASSURANCE_CONTEXT_STALE");
    expect(validateProductionContextSnapshotRef(snapshot, { ...snapshot, revision: 2 }).code).toBe("VD_ASSURANCE_CONTEXT_STALE");
    expect(validateProductionContextSnapshotRef(snapshot, { ...snapshot, fingerprint: "d".repeat(64) }).code).toBe("VD_ASSURANCE_CONTEXT_STALE");
  });

  it("rejects unsupported visual semantic roles and evidence statuses", () => {
    expect(() =>
      buildProductionContextSnapshot(
        input({
          sourcePackDecision: "selected",
          sourcePackPolicy: "optional",
          sourcePack: {
            packId: 1,
            version: 1,
            fingerprint: "d".repeat(64),
            readiness: "production_ready",
            slotKeys: [],
            assetIds: [],
            segmentIds: [],
            semanticRoles: ["not_a_role"],
            evidenceStatuses: ["not_a_status"],
            rightsStatuses: [],
            disclosureStatuses: [],
          },
        })
      )
    ).toThrow();
  });
});
