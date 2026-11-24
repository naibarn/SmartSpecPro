import { describe, expect, it } from "vitest";
import {
  projectStagedSocialPostImagesForTest,
  resolveStagedSocialCaptionContextForTest,
  resolveStagedSocialPostImagesContextForTest,
} from "../marketplaceAutoReviewStagedCheckpointRouterService";

function makeContext() {
  const metadata = {
    customReferenceManifest: [
      {
        index: 10,
        role: "character",
        label: "Mali",
        characterName: "Mali",
        active: true,
        url: "/api/storage/files/character-1.jpg",
        portraitAssetId: "portrait-asset-1",
      },
      {
        index: 20,
        role: "product",
        label: "Daily Cream",
        active: true,
        url: "/api/storage/files/product-1.jpg",
      },
      {
        index: 11,
        role: "character",
        label: "Ani",
        characterName: "Ani",
        active: true,
        url: "/api/storage/files/character-2.jpg",
      },
      {
        index: 21,
        role: "product",
        label: "Daily Cream detail",
        active: true,
        url: "/api/storage/files/product-2.jpg",
      },
    ],
    stagedSequentialStoryboard: {
      shots: [
        {
          shotId: 1,
          imageArtifactUrl: "/api/storage/files/shot-1.jpg",
          imageArtifactHash: "shot-hash-1",
          storySummary: "Mali introduces her daily skin routine.",
          dialogue: "Mali: I use this every morning.",
        },
      ],
    },
    stagedPipeline: {
      plan: {
        product: {
          productName: "Daily Cream",
          description: "A light moisturizer.",
          specs: { size: "30 ml" },
        },
        languagePlan: { summaryLanguage: "th" },
        shots: [
          {
            shotId: 1,
            title: "Morning routine",
            visualSummary: "Mali gets ready by a window.",
          },
        ],
      },
      socialCaption: {
        caption: "ดูแลผิวให้นุ่มชุ่มชื้นในทุกวัน",
        hashtags: ["ดูแลผิว", "มอยส์เจอไรเซอร์"],
        sourceType: "shot",
        shotId: 1,
        sourceHash: "",
        requestIdempotencyKey: "caption-request-1",
      },
    },
  };
  const run = {
    id: "run-social-1",
    userId: 7,
    tenantId: "tenant-1",
    metadataJson: metadata,
  } as any;
  const captionContext = resolveStagedSocialCaptionContextForTest(
    run,
    metadata as any,
    { sourceType: "shot", shotId: 1 }
  );
  metadata.stagedPipeline.socialCaption.sourceHash = captionContext.sourceHash;
  return { run, metadata: metadata as any };
}

describe("staged social post image context and projection", () => {
  it("uses the saved shot and every active character/product reference from the job", () => {
    const { run, metadata } = makeContext();
    const context = resolveStagedSocialPostImagesContextForTest({
      run,
      metadata,
      modelId: "image-model-a",
      aspectRatio: "4:5",
    });

    expect(context).toMatchObject({
      caption: "ดูแลผิวให้นุ่มชุ่มชื้นในทุกวัน",
      language: "th",
      sources: {
        caption_source: {
          label: "Shot 1 · ภาพเริ่มต้น",
          imageUrls: ["/api/storage/files/shot-1.jpg"],
          context: expect.stringContaining("Morning routine"),
        },
        character_reference: {
          label: "Mali, Ani",
          imageUrls: [
            "/api/storage/files/character-1.jpg",
            "/api/storage/files/character-2.jpg",
          ],
        },
        product_reference: {
          label: "Daily Cream, Daily Cream detail",
          imageUrls: [
            "/api/storage/files/product-1.jpg",
            "/api/storage/files/product-2.jpg",
          ],
        },
      },
    });
  });

  it("fingerprints caption, selected references, model, and portrait ratio", () => {
    const { run, metadata } = makeContext();
    const getHash = () =>
      resolveStagedSocialPostImagesContextForTest({
        run,
        metadata,
        modelId: "image-model-a",
        aspectRatio: "4:5",
      }).requestHash;
    const original = getHash();
    metadata.stagedPipeline.socialCaption.caption = "Caption ใหม่";
    const updatedCaption = getHash();
    metadata.stagedPipeline.socialCaption.caption =
      "ดูแลผิวให้นุ่มชุ่มชื้นในทุกวัน";
    metadata.customReferenceManifest[0].characterName = "Mali variant";
    const updatedCharacterName = getHash();
    metadata.customReferenceManifest[0].url =
      "/api/storage/files/character-2.jpg";
    const updatedCharacter = getHash();
    metadata.customReferenceManifest[2].url =
      "/api/storage/files/character-3.jpg";
    const updatedSecondCharacter = getHash();
    metadata.customReferenceManifest[1].url =
      "/api/storage/files/product-2.jpg";
    const updatedProduct = getHash();
    metadata.customReferenceManifest[3].url =
      "/api/storage/files/product-3.jpg";
    const updatedSecondProduct = getHash();

    expect(updatedCaption).not.toBe(original);
    expect(updatedCharacterName).not.toBe(original);
    expect(updatedCharacter).not.toBe(updatedCharacterName);
    expect(updatedSecondCharacter).not.toBe(updatedCharacter);
    expect(updatedProduct).not.toBe(updatedSecondCharacter);
    expect(updatedSecondProduct).not.toBe(updatedProduct);
  });

  it("uses the caption source when the job has no character or product references", () => {
    const { run, metadata } = makeContext();
    metadata.customReferenceManifest.forEach(item => {
      item.active = false;
    });

    const context = resolveStagedSocialPostImagesContextForTest({
      run,
      metadata,
      modelId: "image-model-a",
      aspectRatio: "4:5",
    });

    expect(context.sources.character_reference.imageUrls).toEqual([
      "/api/storage/files/shot-1.jpg",
    ]);
    expect(context.sources.product_reference.imageUrls).toEqual([
      "/api/storage/files/shot-1.jpg",
    ]);
  });

  it("does not require a reference manifest when the caption source is a shot", () => {
    const { run, metadata } = makeContext();
    metadata.customReferenceManifest = [];

    const context = resolveStagedSocialPostImagesContextForTest({
      run,
      metadata,
      modelId: "image-model-a",
      aspectRatio: "4:5",
    });

    expect(context.sources.character_reference.imageUrls).toEqual([
      "/api/storage/files/shot-1.jpg",
    ]);
    expect(context.sources.product_reference.imageUrls).toEqual([
      "/api/storage/files/shot-1.jpg",
    ]);
  });

  it("rejects a saved caption whose source fingerprint has changed", () => {
    const { run, metadata } = makeContext();
    metadata.stagedSequentialStoryboard.shots[0].imageArtifactHash =
      "shot-hash-updated";

    expect(() =>
      resolveStagedSocialPostImagesContextForTest({
        run,
        metadata,
        modelId: "image-model-a",
        aspectRatio: "4:5",
      })
    ).toThrow("staged_state_drift");
  });

  it("projects only completed app storage URLs and safe status metadata", () => {
    const projection = projectStagedSocialPostImagesForTest({
      batchId: "batch-1",
      requestHash: "request-hash",
      modelId: "image-model-a",
      aspectRatio: "4:5",
      variants: {
        caption_source: {
          status: "completed",
          imageStorageKey: "marketplace-auto-review/tenant/run/image.png",
          imagePrompt: "private provider prompt",
          providerUrl: "https://provider.example.test/private.png",
          totalCreditsUsed: 42,
        },
        character_reference: {
          status: "failed",
          imageStorageKey: "https://provider.example.test/failed.png",
          errorCode: "PRIVATE_PROVIDER_ERROR",
        },
      },
    });

    expect(projection.variants.caption_source).toMatchObject({
      status: "completed",
      imageUrl:
        "/api/storage/files/marketplace-auto-review/tenant/run/image.png",
    });
    expect(projection.variants.character_reference).toMatchObject({
      status: "failed",
      imageUrl: null,
    });
    expect(projection.variants.caption_source).not.toHaveProperty(
      "imagePrompt"
    );
    expect(projection.variants.caption_source).not.toHaveProperty(
      "providerUrl"
    );
    expect(projection.variants.character_reference).not.toHaveProperty(
      "errorCode"
    );
  });
});
