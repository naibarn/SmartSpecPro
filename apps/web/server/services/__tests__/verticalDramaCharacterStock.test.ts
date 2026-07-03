import { describe, it, expect } from "vitest";
import {
  buildCharacterAssetManifest,
  deriveCharacterAssetState,
  characterAssetRowToContract,
  characterRefChangeStaleTargets,
} from "../verticalDramaCharacterStock";
import {
  canTransitionCharacterAssetState,
  transitionCharacterAssetState,
  isCharacterAssetUsable,
  type VerticalDramaCharacterAsset,
} from "@shared/verticalDramaSeries";

function asset(over: Partial<VerticalDramaCharacterAsset>): VerticalDramaCharacterAsset {
  return {
    assetLinkId: "1",
    seriesId: "10",
    characterId: "5",
    mediaAssetId: "100",
    assetType: "character_reference",
    state: "draft",
    approved: false,
    qcStatus: "pending",
    source: "imported",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("character asset state machine", () => {
  it("transitions through draft -> generated/imported -> approved -> stale", () => {
    expect(canTransitionCharacterAssetState("draft", "generated")).toBe(true);
    expect(canTransitionCharacterAssetState("generated", "approved")).toBe(true);
    expect(canTransitionCharacterAssetState("imported", "approved")).toBe(true);
    expect(canTransitionCharacterAssetState("approved", "stale")).toBe(true);
    expect(transitionCharacterAssetState("generated", "approved")).toBe("approved");
  });

  it("forbids skipping review from draft straight to approved", () => {
    expect(canTransitionCharacterAssetState("draft", "approved")).toBe(false);
    expect(() => transitionCharacterAssetState("draft", "approved")).toThrow();
  });

  it("supports rejection and re-work back into the pipeline", () => {
    expect(canTransitionCharacterAssetState("generated", "rejected")).toBe(true);
    expect(canTransitionCharacterAssetState("rejected", "generated")).toBe(true);
  });

  it("only an approved+approved-state asset is usable downstream", () => {
    expect(isCharacterAssetUsable({ state: "approved", approved: true })).toBe(true);
    expect(isCharacterAssetUsable({ state: "generated", approved: false })).toBe(false);
  });
});

describe("buildCharacterAssetManifest", () => {
  it("counts approved / pending / stale and picks latest updatedAt", () => {
    const manifest = buildCharacterAssetManifest(10, [
      asset({ assetLinkId: "1", state: "approved", approved: true, updatedAt: "2026-01-03T00:00:00.000Z" }),
      asset({ assetLinkId: "2", state: "generated", updatedAt: "2026-01-02T00:00:00.000Z" }),
      asset({ assetLinkId: "3", state: "stale", updatedAt: "2026-01-04T00:00:00.000Z" }),
    ]);
    expect(manifest.seriesId).toBe("10");
    expect(manifest.approvedCount).toBe(1);
    expect(manifest.pendingCount).toBe(1);
    expect(manifest.staleCount).toBe(1);
    expect(manifest.updatedAt).toBe("2026-01-04T00:00:00.000Z");
  });
});

describe("deriveCharacterAssetState", () => {
  it("prefers explicit metadata state", () => {
    expect(deriveCharacterAssetState({ approved: false, qcStatus: "pending", metadata: { state: "stale" } })).toBe("stale");
  });
  it("derives approved when approved flag set", () => {
    expect(deriveCharacterAssetState({ approved: true, qcStatus: "passed", metadata: null })).toBe("approved");
  });
  it("derives rejected when qc failed", () => {
    expect(deriveCharacterAssetState({ approved: false, qcStatus: "failed", metadata: null })).toBe("rejected");
  });
});

describe("characterAssetRowToContract", () => {
  it("maps a durable row to a browser-safe contract without provider URLs", () => {
    const contract = characterAssetRowToContract({
      id: 7,
      tenantId: "t1",
      userId: 42,
      seriesId: 10,
      characterId: 5,
      mediaAssetId: 100,
      assetType: "character_reference",
      role: "primary_reference",
      approved: true,
      containsHumanFace: true,
      qcStatus: "passed",
      checksumSha256: "abc",
      metadata: { state: "approved", source: "generated", characterKey: "hero" },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    } as any);
    expect(contract.assetLinkId).toBe("7");
    expect(contract.mediaAssetId).toBe("100");
    expect(contract.state).toBe("approved");
    expect(contract.source).toBe("generated");
    expect(contract.characterKey).toBe("hero");
    // No provider URL leaks through the contract projection.
    expect(JSON.stringify(contract)).not.toMatch(/https?:\/\//);
  });
});

describe("characterRefChangeStaleTargets", () => {
  it("marks storyboard, start-frame, and motion-prompt stages stale", () => {
    const { coarse, pipelineStages } = characterRefChangeStaleTargets();
    expect(coarse).toEqual(["storyboard", "start_frame", "motion_prompt"]);
    expect(pipelineStages).toContain("storyboard_shotgrid");
    expect(pipelineStages).toContain("render_or_import_start_frames");
    expect(pipelineStages).toContain("video_motion_prompt_pack");
  });
});
