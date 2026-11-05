import { describe, expect, it } from "vitest";

import { buildProductionDirectorReferenceImages, buildStoryboardReviewClipView } from "./marketplaceCapture";

describe("Storyboard Review extension projection", () => {
  it("exposes independent image and video prompts when both are present", () => {
    const clip = buildStoryboardReviewClipView({
      id: "shot-1",
      type: "image",
      index: 0,
      prompt: "Create exactly one single vertical 9:16 image.",
      videoPrompt: "Animate the start frame with a gentle hand movement.",
    }, 0);

    expect(clip.imagePrompt).toBe("Create exactly one single vertical 9:16 image.");
    expect(clip.videoPrompt).toBe("Animate the start frame with a gentle hand movement.");
  });

  it("does not expose an image prompt as a video prompt when the video prompt is missing", () => {
    const clip = buildStoryboardReviewClipView({
      id: "shot-1",
      type: "image",
      index: 0,
      prompt: "Create exactly one single vertical 9:16 image.",
    }, 0);

    expect(clip.imagePrompt).toBe("Create exactly one single vertical 9:16 image.");
    expect(clip.videoPrompt).toBe("");
  });

  it("supports explicit image prompt fields without changing video prompt resolution", () => {
    const clip = buildStoryboardReviewClipView({
      id: "shot-1",
      type: "video",
      index: 0,
      imagePrompt: "Use the approved start frame as the image reference.",
      videoPrompt: "Animate the approved start frame.",
    }, 0);

    expect(clip.imagePrompt).toBe("Use the approved start frame as the image reference.");
    expect(clip.videoPrompt).toBe("Animate the approved start frame.");
  });

  it("exposes a storyboard image task as the clip image", () => {
    const clip = buildStoryboardReviewClipView({
      id: "shot-1",
      type: "image",
      index: 0,
      url: "/api/storage/files/storyboard/shot-1.png",
      prompt: "Create the first storyboard shot",
    }, 0);

    expect(clip.imageUrl).toBe("/api/storage/files/storyboard/shot-1.png");
    expect(clip.referenceImageUrl).toBe("/api/storage/files/storyboard/shot-1.png");
    expect(clip.videoUrl).toBe("/api/storage/files/storyboard/shot-1.png");
  });

  it("does not mistake an explicit video task URL for a storyboard image", () => {
    const clip = buildStoryboardReviewClipView({
      id: "shot-1-video",
      type: "video",
      index: 0,
      url: "/api/storage/files/storyboard/shot-1.mp4",
    }, 0);

    expect(clip.imageUrl).toBeUndefined();
  });
});

describe("Production Director extension reference projection", () => {
  it("includes product evidence images alongside existing context references", () => {
    const references = buildProductionDirectorReferenceImages({
      productEvidenceManifest: {
        manifestId: "manifest-1",
        status: "ready",
        requiredClaimIds: [],
        warnings: [],
        products: [{ id: "product-1", productId: "catalog-1", title: "Reference product", imageUrl: "/product.png", role: "hero", claimEvidence: [] }],
      },
      contextAssets: [{ id: "scene-1", title: "Scene reference", url: "/scene.png", kind: "reference_image" }],
    } as any);

    expect(references).toEqual([
      expect.objectContaining({ id: "scene-1", title: "Scene reference", url: "/scene.png", kind: "reference_image" }),
      expect.objectContaining({ id: "product-1", title: "Reference product", url: "/product.png", kind: "product_image", role: "hero" }),
    ]);
  });

  it("keeps the product reference as the display and drag source when URLs overlap", () => {
    const references = buildProductionDirectorReferenceImages({
      productEvidenceManifest: {
        manifestId: "manifest-1",
        status: "ready",
        requiredClaimIds: [],
        warnings: [],
        products: [{ id: "product-1", productId: "catalog-1", title: "Reference product", imageUrl: "/shared.png", claimEvidence: [] }],
      },
      contextAssets: [{ id: "context-1", title: "Other reference", url: "/shared.png", kind: "reference_image" }],
    } as any);

    expect(references).toHaveLength(1);
    expect(references[0]).toEqual(expect.objectContaining({ id: "product-1", kind: "product_image", url: "/shared.png" }));
  });
});
