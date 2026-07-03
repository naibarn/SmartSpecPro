import { describe, expect, it } from "vitest";

import {
  buildGeneratedAssetSafetyMetadata,
  evaluateGeneratedAssetViewerPolicy,
} from "./generatedAssetSafetyService";

describe("generatedAssetSafetyService", () => {
  it("fails closed for missing or quarantined metadata", () => {
    expect(evaluateGeneratedAssetViewerPolicy({
      viewer: { actorKind: "widget_visitor", audienceBand: "unknown", tenantId: "t1" },
      metadata: null,
      action: "read",
    })).toMatchObject({ allowed: false, code: "asset_safety_metadata_missing" });
    expect(evaluateGeneratedAssetViewerPolicy({
      viewer: { actorKind: "human_user", dateOfBirth: "2000-01-01", countryCode: "US", tenantId: "t1" },
      metadata: buildGeneratedAssetSafetyMetadata({
        creatorBand: "adult",
        policyVersion: "p1",
        policySnapshotHash: "abc",
        reviewState: "quarantined",
      }),
      action: "download",
    })).toMatchObject({ allowed: false, code: "asset_quarantined" });
  });

  it("uses viewer age context for generated assets", () => {
    const metadata = buildGeneratedAssetSafetyMetadata({
      creatorBand: "adult",
      minimumViewerBand: "adult",
      policyVersion: "p1",
      policySnapshotHash: "abc",
    });
    const result = evaluateGeneratedAssetViewerPolicy({
      viewer: { actorKind: "human_user", dateOfBirth: "2010-01-01", countryCode: "US", tenantId: "t1" },
      metadata,
      action: "read",
      flags: { ageSafetyPolicyEnabled: true },
    });
    expect(result.decision.allowed).toBe(false);
  });
});
