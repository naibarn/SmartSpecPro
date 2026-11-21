import { describe, expect, it } from "vitest";
import { applyStagedReferenceManifestUpdate } from "../marketplaceAutoReviewStagedCheckpointRouterService";

const original = {
  index: 1,
  role: "product_anchor",
  url: "https://example.com/silver.png",
  active: true,
};
const replacement = {
  index: 2,
  role: "product_angle",
  url: "https://example.com/black.png",
  active: false,
};
const character = {
  index: 3,
  role: "character",
  url: "https://example.com/presenter.png",
  active: true,
};

function fixture() {
  const shots = [1, 2].map(shotId => ({
    shotId,
    imagePrompt: "Existing prompt with the silver cap",
    imagePromptHash: "original",
    imageArtifactUrl: "https://example.com/start-frame.png",
    imageArtifactHash: "frame",
    videoPrompt: "Existing video prompt",
    castInShot: ["cast-1"],
  }));
  const reviewCheckpoints = [
    { shotId: 1, kind: "image_prompt", state: "approved" },
    { shotId: 1, kind: "image_result", state: "approved" },
    { shotId: 1, kind: "video_prompt", state: "approved" },
    { shotId: 2, kind: "image_prompt", state: "approved" },
  ];
  return {
    customReferenceManifest: [original, replacement, character],
    stagedPipeline: {
      plan: {
        product: { productName: "Serum" },
        shots: [
          { shotId: 1, productInShot: true },
          { shotId: 2, productInShot: false },
        ],
      },
    },
    stagedSequentialStoryboard: { shots, reviewCheckpoints },
  };
}

describe("staged product reference changes", () => {
  it("invalidates the old image prompt only for shots that use the product", () => {
    const previous = fixture();
    const selected = [
      { ...original, active: false },
      { ...replacement, active: true },
      character,
    ];
    const updated = applyStagedReferenceManifestUpdate(previous, previous as any, selected);

    expect(updated.customReferenceManifest).toEqual(selected);
    const { shots, reviewCheckpoints } = updated.stagedSequentialStoryboard;
    expect(shots[0]).toEqual({
      ...previous.stagedSequentialStoryboard.shots[0],
      imagePrompt: null,
      imagePromptHash: null,
    });
    expect(shots[1]).toEqual(previous.stagedSequentialStoryboard.shots[1]);
    expect(reviewCheckpoints[0]).toMatchObject({
      state: "superseded",
      rejectionReasonCode: "staged_product_reference_changed",
    });
    expect(reviewCheckpoints.slice(1)).toEqual(
      previous.stagedSequentialStoryboard.reviewCheckpoints.slice(1)
    );
  });

  it("preserves prompts when an unused reference changes", () => {
    const previous = fixture();
    const updated = applyStagedReferenceManifestUpdate(previous, previous as any, [
      original,
      { ...replacement, url: "https://example.com/another-unused.png" },
      character,
    ]);
    expect(updated.stagedSequentialStoryboard).toEqual(previous.stagedSequentialStoryboard);
  });
});
