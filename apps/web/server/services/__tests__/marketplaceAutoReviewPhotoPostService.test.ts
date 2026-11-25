import { describe, expect, it } from "vitest";

import { defaultJobExecutorRegistry } from "../jobExecutorRegistry";
import {
  composeFacebookPhotoPostCaption,
  assertFacebookPhotoPostCaptionLength,
  hashFacebookPhotoPostIntent,
  hasMarketplaceAutoReviewPhotoPostExternalAttempt,
  assertMarketplaceAutoReviewPhotoRunOwnership,
  inspectMarketplaceAutoReviewPhotoImage,
  marketplaceAutoReviewPhotoPostWorkerInputSchema,
  resolveMarketplaceAutoReviewPhotoVariant,
} from "../marketplaceAutoReviewPhotoPostService";

const TENANT_ID = "tenant-1";
const RUN_ID = "mar_run-1";
const IMAGE_HASH = "a".repeat(64);
const IMAGE_KEY = `marketplace-auto-review/${TENANT_ID}/${RUN_ID}/media/image/social-post-batch-1-caption_source-${IMAGE_HASH}.png`;

function runMetadata(overrides: Record<string, unknown> = {}) {
  return {
    stagedPipeline: {
      socialCaption: {
        postImages: {
          variants: {
            caption_source: {
              status: "completed",
              imageStorageKey: IMAGE_KEY,
              sourceLabel: "ภาพจากต้นฉบับ",
            },
            character_reference: { status: "pending" },
            product_reference: { status: "failed" },
          },
        },
      },
    },
    ...overrides,
  };
}

describe("Marketplace Auto Review Facebook Photo Post contract", () => {
  it("registers a distinct photo publisher job in the canonical worker registry", () => {
    expect(defaultJobExecutorRegistry.resolve("social.facebook.photo.publish", "feature-187-v1")).toBeDefined();
  });

  it("resolves only a completed image stored under the same tenant and Auto Review run", () => {
    expect(resolveMarketplaceAutoReviewPhotoVariant(runMetadata(), {
      tenantId: TENANT_ID,
      runId: RUN_ID,
      variant: "caption_source",
    })).toEqual({
      variant: "caption_source",
      storageKey: IMAGE_KEY,
      imageUrl: `/api/storage/files/${IMAGE_KEY.split("/").map(encodeURIComponent).join("/")}`,
      sourceLabel: "ภาพจากต้นฉบับ",
    });
    expect(() => resolveMarketplaceAutoReviewPhotoVariant(runMetadata(), {
      tenantId: TENANT_ID,
      runId: RUN_ID,
      variant: "character_reference",
    })).toThrow("PHOTO_VARIANT_NOT_COMPLETED");
    expect(() => resolveMarketplaceAutoReviewPhotoVariant(runMetadata(), {
      tenantId: "tenant-2",
      runId: RUN_ID,
      variant: "caption_source",
    })).toThrow("PHOTO_VARIANT_SCOPE_MISMATCH");
  });

  it("allows a generated photo independently of final video status and enforces run ownership", () => {
    const run = { tenantId: TENANT_ID, userId: 41, status: "waiting_provider", resultLibraryItemId: null };
    expect(assertMarketplaceAutoReviewPhotoRunOwnership(run, { tenantId: TENANT_ID, userId: 41 })).toBe(run);
    expect(resolveMarketplaceAutoReviewPhotoVariant(runMetadata(), { tenantId: TENANT_ID, runId: RUN_ID, variant: "caption_source" }).variant).toBe("caption_source");
    expect(() => assertMarketplaceAutoReviewPhotoRunOwnership(run, { tenantId: "tenant-2", userId: 41 })).toThrow("PHOTO_RUN_SCOPE_MISMATCH");
    expect(() => assertMarketplaceAutoReviewPhotoRunOwnership(run, { tenantId: TENANT_ID, userId: 42 })).toThrow("PHOTO_RUN_SCOPE_MISMATCH");
  });

  it("verifies PNG bytes, dimensions and checksum before upload", async () => {
    const image = await (await import("sharp")).default({
      create: { width: 3, height: 2, channels: 3, background: "white" },
    }).png().toBuffer();
    const result = await inspectMarketplaceAutoReviewPhotoImage(image, "image/png");
    expect(result.contentType).toBe("image/png");
    expect(result.size).toBe(image.length);
    expect(result.width).toBe(3);
    expect(result.height).toBe(2);
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
    await expect(inspectMarketplaceAutoReviewPhotoImage(Buffer.from("not-an-image"), "image/png")).rejects.toThrow("PHOTO_ARTIFACT_INVALID");
    await expect(inspectMarketplaceAutoReviewPhotoImage(Buffer.alloc(10 * 1024 * 1024 + 1), "image/png")).rejects.toThrow("PHOTO_ARTIFACT_TOO_LARGE");
  });

  it("preserves the exact affiliate URL in the composed photo caption", () => {
    const affiliateUrl = "https://shop.example/item?aff_id=ab%2Fcd&campaign=x%20y&sub=1";
    const caption = composeFacebookPhotoPostCaption({
      caption: "Review caption",
      hashtags: ["#review", "#dailydeal"],
      commercialDisclosure: "มีลิงก์ Affiliate",
      affiliateUrl,
    });
    expect(caption).toBe(`Review caption\n\n#review #dailydeal\n\nมีลิงก์ Affiliate\n\n${affiliateUrl}`);
  });

  it("rejects a final caption that exceeds the Meta limit after disclosures and the Affiliate URL are appended", () => {
    expect(assertFacebookPhotoPostCaptionLength("x".repeat(2000))).toHaveLength(2000);
    const oversized = composeFacebookPhotoPostCaption({
      caption: "x".repeat(1990),
      hashtags: ["#review"],
      commercialDisclosure: "Affiliate disclosure",
      affiliateUrl: "https://shop.example/item?aff=1",
    });
    expect(() => assertFacebookPhotoPostCaptionLength(oversized)).toThrow("PHOTO_CAPTION_TOO_LONG");
  });

  it("keeps image variant and media kind in the deduplicated publication intent", () => {
    const reel = hashFacebookPhotoPostIntent({ format: "facebook_reel", imageVariant: null, caption: "same" });
    const photoA = hashFacebookPhotoPostIntent({ format: "facebook_photo_post", imageVariant: "caption_source", caption: "same" });
    const photoB = hashFacebookPhotoPostIntent({ format: "facebook_photo_post", imageVariant: "product_reference", caption: "same" });
    expect(photoA).toMatch(/^[a-f0-9]{64}$/);
    expect(photoA).not.toBe(reel);
    expect(photoA).not.toBe(photoB);
  });

  it("treats any recorded external attempt as a duplicate risk across changed captions or variants", () => {
    expect(hasMarketplaceAutoReviewPhotoPostExternalAttempt({ photoPublishRequestedAt: "2026-11-25T00:00:00.000Z" })).toBe(true);
    expect(hasMarketplaceAutoReviewPhotoPostExternalAttempt({ externalPhotoId: "123" })).toBe(true);
    expect(hasMarketplaceAutoReviewPhotoPostExternalAttempt({ photoPublicationStatus: "published" })).toBe(true);
    expect(hasMarketplaceAutoReviewPhotoPostExternalAttempt({ photoPublicationStatus: "needs_user_action", manualHandoff: { state: "prepared" } })).toBe(false);
  });

  it("accepts worker references but rejects client-provided image URLs", () => {
    const base = { postId: 1, runId: RUN_ID, intentHash: "b".repeat(64) };
    expect(marketplaceAutoReviewPhotoPostWorkerInputSchema.safeParse(base).success).toBe(true);
    expect(marketplaceAutoReviewPhotoPostWorkerInputSchema.safeParse({
      ...base,
      imageUrl: "https://attacker.example/image.png",
    }).success).toBe(false);
  });
});
