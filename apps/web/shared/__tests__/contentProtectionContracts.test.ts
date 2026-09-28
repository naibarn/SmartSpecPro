import { describe, expect, it } from "vitest";
import {
  canonicalizeCompoundArtifactEnvelope,
  resolveEffectiveWatermarkChoice,
  type CompoundArtifactEnvelope,
} from "@smartspec/shared";

const envelope = (): CompoundArtifactEnvelope => ({
  compoundArtifactId: "compound-1",
  sourceAssetIds: ["asset-b", "asset-a"],
  sourceAssetHashes: ["hash-b", "hash-a"],
  sourceSegments: [
    { sourceAssetId: "asset-b", timelineIndex: 1, trimStartMs: 100, trimEndMs: 900 },
    { sourceAssetId: "asset-a", timelineIndex: 0, trimStartMs: 0, trimEndMs: 500 },
  ],
  revisionId: "revision-1",
  compoundPlanDigest: "plan-1",
  preProtectionSha256: "pre-1",
});

describe("Feature 201 shared contracts", () => {
  it("preserves ordered inputs while canonicalizing object key order", () => {
    const first = canonicalizeCompoundArtifactEnvelope(envelope());
    const second = canonicalizeCompoundArtifactEnvelope({
      ...envelope(),
      sourceSegments: envelope().sourceSegments.map(segment => ({
        trimEndMs: segment.trimEndMs,
        sourceAssetId: segment.sourceAssetId,
        timelineIndex: segment.timelineIndex,
        trimStartMs: segment.trimStartMs,
      })),
    });

    expect(first).toBe(second);
    expect(first.indexOf("asset-b")).toBeLessThan(first.indexOf("asset-a"));
  });

  it("resolves an explicit per-operation choice before the user default", () => {
    expect(resolveEffectiveWatermarkChoice("off", "on")).toEqual({
      choice: "off",
      source: "per_export",
    });
    expect(resolveEffectiveWatermarkChoice(undefined, "off")).toEqual({
      choice: "off",
      source: "user_default",
    });
  });
});
