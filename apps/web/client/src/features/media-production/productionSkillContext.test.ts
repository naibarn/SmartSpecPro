import { describe, expect, it } from "vitest";
import {
  buildProductionSkillAttachmentPack,
  estimateProductionSkillContextTokens,
  selectProductionPlanningModelForContext,
} from "./productionSkillContext";

describe("productionSkillContext", () => {
  it("deduplicates product evidence and context assets by URL before skill sends", () => {
    const pack = buildProductionSkillAttachmentPack({
      limit: 10,
      space: {
        productEvidenceManifest: {
          manifestId: "manifest-1",
          products: [{
            id: "product-1",
            productId: "sku-1",
            title: "Bedside table",
            imageUrl: "https://cdn.test/table.png",
            claimEvidence: [],
            approvalState: "needs_review",
          }],
          requiredClaimIds: [],
          status: "ready",
          warnings: [],
        },
        contextAssets: [
          {
            id: "asset-duplicate",
            kind: "marketplace_product",
            title: "Same table from canvas",
            url: "https://cdn.test/table.png",
            source: "canvas",
          },
          {
            id: "asset-scene",
            kind: "reference_image",
            title: "Bedroom scene",
            url: "https://cdn.test/scene.png",
            source: "upload",
          },
        ],
      },
    });

    expect(pack.attachments.map((asset) => asset.url)).toEqual([
      "https://cdn.test/table.png",
      "https://cdn.test/scene.png",
    ]);
    expect(pack.referenceImageUrls).toEqual([
      "https://cdn.test/table.png",
      "https://cdn.test/scene.png",
    ]);
  });

  it("keeps unique image video and audio references in one canonical pack", () => {
    const pack = buildProductionSkillAttachmentPack({
      limit: 10,
      space: { contextAssets: [] },
      referenceImages: [{ url: "https://cdn.test/image.png", name: "Image" }],
      referenceVideos: [{ url: "https://cdn.test/video.mp4", name: "Video" }],
      audioAssets: [{ url: "https://cdn.test/audio.mp3", name: "Audio" }],
    });

    expect(pack.referenceImageUrls).toEqual(["https://cdn.test/image.png"]);
    expect(pack.referenceVideos).toEqual([{ url: "https://cdn.test/video.mp4", name: "Video", role: "source_video", source: "media-studio-reference" }]);
    expect(pack.referenceAudio).toEqual([{ url: "https://cdn.test/audio.mp3", name: "Audio", role: "audio_reference", source: "gemini-omni-audio" }]);
    expect(pack.attachmentKinds).toMatchObject({ reference_image: 1, source_video: 1, audio_asset: 1 });
  });

  it("does not override a manual planning model even when context is large", () => {
    const selection = selectProductionPlanningModelForContext({
      modelMode: "manual",
      manualModelId: "manual-small",
      estimatedContextTokens: 450_000,
      options: [
        { modelId: "manual-small", contextLength: 400_000 },
        { modelId: "auto-large", contextLength: 1_000_000 },
      ],
    });

    expect(selection.modelId).toBe("manual-small");
    expect(selection.reason).toBe("manual_override");
    expect(selection.overflowRisk).toBe(true);
  });

  it("auto-selects a larger enabled model when the default context is too small", () => {
    const selection = selectProductionPlanningModelForContext({
      modelMode: "auto",
      estimatedContextTokens: 420_000,
      options: [
        { modelId: "default-400k", contextLength: 400_000 },
        { modelId: "large-1m", contextLength: 1_000_000 },
      ],
    });

    expect(selection.modelId).toBe("large-1m");
    expect(selection.escalatedFrom).toBe("default-400k");
    expect(selection.reason).toBe("auto_context_escalated");
    expect(selection.overflowRisk).toBe(false);
  });

  it("reports overflow risk when no enabled model can fit the estimated context", () => {
    const selection = selectProductionPlanningModelForContext({
      modelMode: "auto",
      estimatedContextTokens: 900_000,
      options: [
        { modelId: "default-400k", contextLength: 400_000 },
        { modelId: "large-800k", contextLength: 800_000 },
      ],
    });

    expect(selection.modelId).toBe("default-400k");
    expect(selection.reason).toBe("auto_no_sufficient_model");
    expect(selection.overflowRisk).toBe(true);
  });

  it("estimates text plus URL attachment overhead", () => {
    expect(estimateProductionSkillContextTokens({ prompt: "hello", url: "https://cdn.test/image.png" })).toBeGreaterThan(1_200);
  });
});
