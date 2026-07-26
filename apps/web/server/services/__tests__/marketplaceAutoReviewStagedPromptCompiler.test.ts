import { describe, expect, it } from "vitest";

import {
  buildStagedImagePromptContentHash,
  buildStagedVideoPromptContentHash,
  compileStagedImagePrompt,
  compileStagedVideoPrompt,
} from "../marketplaceAutoReviewStagedPromptCompiler";
import {
  buildStagedStoryArcPlan,
} from "../marketplaceAutoReviewStoryArcPlanner";
import {
  buildStagedShotVideoDirectorPrompt,
  isStagedShotVideoPromptBoundToImage,
} from "../marketplaceAutoReviewShotVideoDirector";

function planFixture() {
  return buildStagedStoryArcPlan({
    runId: "run-141",
    product: {
      productId: "product-1",
      productName: "แก้วน้ำ",
      description: "แก้วน้ำสเตนเลส",
      imageUrls: ["https://example.com/product.png"],
    },
  });
}

describe("Feature 141 staged prompt compiler", () => {
  it("binds image prompt hash to revision, shot, prompt, and reference manifest", () => {
    const plan = planFixture();
    const compiled = compileStagedImagePrompt({ plan, shot: plan.shots[0] });
    expect(compiled.contentHash).toBe(
      buildStagedImagePromptContentHash({
        revision: plan.planRevision,
        shotId: 1,
        prompt: compiled.prompt,
        referenceManifestHash: plan.referenceManifestHash,
      })
    );
    expect(compiled.contentHash).not.toBe(
      buildStagedImagePromptContentHash({
        revision: plan.planRevision + 1,
        shotId: 1,
        prompt: compiled.prompt,
        referenceManifestHash: plan.referenceManifestHash,
      })
    );
  });

  it("makes the video prompt hash depend on the accepted image artifact", () => {
    const plan = planFixture();
    const compiled = compileStagedVideoPrompt({
      plan,
      shot: plan.shots[0],
      imageArtifactHash: "image-hash-a",
    });
    expect(
      isStagedShotVideoPromptBoundToImage({
        revision: plan.planRevision,
        shotId: 1,
        prompt: compiled.prompt,
        acceptedImageArtifactHash: "image-hash-a",
        contentHash: compiled.contentHash,
      })
    ).toBe(true);
    expect(
      isStagedShotVideoPromptBoundToImage({
        revision: plan.planRevision,
        shotId: 1,
        prompt: compiled.prompt,
        acceptedImageArtifactHash: "image-hash-b",
        contentHash: compiled.contentHash,
      })
    ).toBe(false);
  });

  it("exposes a director boundary that keeps the accepted image hash in the compiled evidence", () => {
    const plan = planFixture();
    const result = buildStagedShotVideoDirectorPrompt({
      plan,
      shot: plan.shots[0],
      acceptedImageArtifactHash: "accepted-image",
    });
    expect(result.prompt).toContain("accepted image artifact");
    expect(result.contentHash).toBe(
      buildStagedVideoPromptContentHash({
        revision: plan.planRevision,
        shotId: 1,
        prompt: result.prompt,
        imageArtifactHash: "accepted-image",
      })
    );
  });
});
