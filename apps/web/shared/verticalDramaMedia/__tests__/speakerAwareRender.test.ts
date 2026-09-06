import { describe, expect, it } from "vitest";
import { assertRenderMapParity, compileFfmpegSegmentPlan, compileRemotionTimeline } from "../speakerAwareRender";
import type { ComposedEditMap } from "../speakerAwareContracts";

const checksum = "a".repeat(64);
const map: ComposedEditMap = {
  contractVersion: "feature-179-v1", mapId: "map-1", mapRevision: "rev-1",
  sourceArtifact: { artifactId: "asset-1", revision: "r1", checksum, kind: "video" }, parentArtifactHashes: [checksum],
  ranges: [
    { rangeId: "keep-1", sourceStartMs: 0, sourceEndMs: 1000, outputStartMs: 0, outputEndMs: 1000, decision: "keep", reasons: ["source"] },
    { rangeId: "remove-1", sourceStartMs: 1000, sourceEndMs: 2000, outputStartMs: 1000, outputEndMs: 1000, decision: "remove", reasons: ["dead_air", "manual_cut"] },
    { rangeId: "keep-2", sourceStartMs: 2000, sourceEndMs: 3500, outputStartMs: 1000, outputEndMs: 2500, decision: "keep", reasons: ["condensation"] },
  ], cameraActions: [], activeSpeakers: [], manualRevision: "m1", workflowRevision: "w1", approvalState: "approved", createdAt: "2026-09-06T00:00:00+00:00",
};

describe("speaker-aware render map parity", () => {
  it("drops removed intervals for both renderer plans", () => {
    expect(compileFfmpegSegmentPlan(map)).toHaveLength(2);
    expect(compileRemotionTimeline(map).map((item) => item.sourceStartMs)).toEqual([0, 2000]);
  });
  it("rejects renderer drift", () => {
    expect(assertRenderMapParity(map)).toBe("rev-1");
  });
});
