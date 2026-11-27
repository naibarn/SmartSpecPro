import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

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
  resolveUnstartedPhotoPublicationStatus,
  startMarketplaceAutoReviewPhotoPost,
  executeMarketplaceAutoReviewPhotoPostPublish,
  confirmMarketplaceAutoReviewPhotoPostAbsent,
  canConfirmMarketplaceAutoReviewPhotoPostAbsent,
} from "../marketplaceAutoReviewPhotoPostService";

const { getDb, listPublishingPages, storageStreamFile, createControlPlaneJob, decrypt, publishFacebookPagePhoto, readFacebookPagePhoto } = vi.hoisted(() => ({
  getDb: vi.fn(),
  listPublishingPages: vi.fn(),
  storageStreamFile: vi.fn(),
  createControlPlaneJob: vi.fn(),
  decrypt: vi.fn(),
  publishFacebookPagePhoto: vi.fn(),
  readFacebookPagePhoto: vi.fn(),
}));
vi.mock("../../db", async importOriginal => ({ ...await importOriginal<typeof import("../../db")>(), getDb }));
vi.mock("../../storage", async importOriginal => ({ ...await importOriginal<typeof import("../../storage")>(), storageStreamFile }));
vi.mock("../crypto", async importOriginal => ({ ...await importOriginal<typeof import("../crypto")>(), decrypt }));
vi.mock("../facebookPhotoPublishGateway", async importOriginal => ({
  ...await importOriginal<typeof import("../facebookPhotoPublishGateway")>(),
  publishFacebookPagePhoto,
  readFacebookPagePhoto,
}));
vi.mock("../jobControlPlaneGateway", async importOriginal => ({ ...await importOriginal<typeof import("../jobControlPlaneGateway")>(), createControlPlaneJob }));
vi.mock("../socialPublishingService", async importOriginal => ({
  ...await importOriginal<typeof import("../socialPublishingService")>(),
  listPublishingPages,
}));

const TENANT_ID = "tenant-1";
const RUN_ID = "mar_run-1";
const IMAGE_HASH = "a".repeat(64);
const IMAGE_KEY = `marketplace-auto-review/${TENANT_ID}/${RUN_ID}/media/image/social-post-batch-1-caption_source-${IMAGE_HASH}.png`;

function runMetadata(overrides: Record<string, unknown> = {}) {
  return {
    stagedPipeline: {
      socialCaption: {
        caption: "Review caption",
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

  it.each([true, false])("admits the selected Meta Page only when publishing readiness is %s", async publishingReady => {
    const image = await (await import("sharp")).default({
      create: { width: 3, height: 2, channels: 3, background: "white" },
    }).png().toBuffer();
    storageStreamFile.mockClear().mockResolvedValue({
      totalLength: image.length, contentType: "image/png", stream: Readable.from([image]),
    });
    listPublishingPages.mockResolvedValue([{ id: 7, provider: "meta", publishingReady }]);
    const results = [
      [{ id: RUN_ID, tenantId: TENANT_ID, userId: 41, productId: "product-1", metadataJson: runMetadata() }],
      [{ id: "product-1" }],
      [{ affiliateUrl: "https://shop.example/item" }],
      [{ id: 12, metadata: { photoPublicationStatus: "queued", publishingWorkerJobId: "worker-1" } }],
      [],
      [],
    ];
    getDb.mockResolvedValue({ select: () => {
      const rows = results.shift();
      return { from: () => ({ where: () => ({
        limit: () => Promise.resolve(rows),
        orderBy: () => ({ limit: () => Promise.resolve(rows) }),
      }) }) };
    } });

    const result = startMarketplaceAutoReviewPhotoPost({
      tenantId: TENANT_ID, userId: 41, runId: RUN_ID, pageId: 7,
      snapshot: {
        variant: "caption_source", caption: "Review caption", hashtags: ["#review"],
        affiliateMode: "description", commercialDisclosure: "",
      },
    });
    if (publishingReady) {
      await expect(result).resolves.toMatchObject({ postId: 12, status: "queued" });
      expect(storageStreamFile).toHaveBeenCalledWith(IMAGE_KEY);
    } else {
      await expect(result).rejects.toThrow("FACEBOOK_PAGE_NOT_READY");
      expect(storageStreamFile).not.toHaveBeenCalled();
    }
    expect(listPublishingPages).toHaveBeenLastCalledWith(TENANT_ID, 41);
  });

  it("persists the canonical worker jobId returned by the control plane", async () => {
    const image = await (await import("sharp")).default({
      create: { width: 3, height: 2, channels: 3, background: "white" },
    }).png().toBuffer();
    storageStreamFile.mockResolvedValue({
      totalLength: image.length, contentType: "image/png", stream: Readable.from([image]),
    });
    listPublishingPages.mockResolvedValue([{ id: 7, provider: "meta", publishingReady: true }]);
    createControlPlaneJob.mockResolvedValue({ jobId: "worker-job-123", created: true });
    const selectedRows = [
      [{ id: RUN_ID, tenantId: TENANT_ID, userId: 41, productId: "product-1", metadataJson: runMetadata() }],
      [{ id: "product-1" }],
      [{ affiliateUrl: "https://shop.example/item" }],
      [],
      [],
      [{ metadata: { source: "marketplace_auto_review_photo_post", autoReviewRunId: RUN_ID } }],
    ];
    const updates: Array<Record<string, unknown>> = [];
    getDb.mockResolvedValue({
      select: () => ({ from: () => ({ where: () => ({
        limit: () => Promise.resolve(selectedRows.shift()),
        orderBy: () => ({ limit: () => Promise.resolve(selectedRows.shift()) }),
      }) }) }),
      insert: () => ({ values: () => ({ returning: () => Promise.resolve([{ id: 12 }]) }) }),
      update: () => ({ set: (values: Record<string, unknown>) => ({ where: async () => { updates.push(values); } }) }),
    });

    const result = await startMarketplaceAutoReviewPhotoPost({
      tenantId: TENANT_ID, userId: 41, runId: RUN_ID, pageId: 7,
      snapshot: {
        variant: "caption_source", caption: "Review caption", hashtags: ["#review"],
        affiliateMode: "description", commercialDisclosure: "",
      },
    });

    expect(result).toMatchObject({ postId: 12, jobId: "worker-job-123", status: "queued" });
    expect(updates).toContainEqual(expect.objectContaining({
      metadata: expect.objectContaining({ publishingWorkerJobId: "worker-job-123" }),
    }));
  });

  it("allows a new Photo Post intent after a different intent expired before starting", async () => {
    const image = await (await import("sharp")).default({
      create: { width: 3, height: 2, channels: 3, background: "white" },
    }).png().toBuffer();
    const replacementKey = `marketplace-auto-review/${TENANT_ID}/${RUN_ID}/media/image/social-post-batch-1-character_reference-${IMAGE_HASH}.png`;
    const metadata = runMetadata();
    (metadata.stagedPipeline as any).socialCaption.postImages.variants.character_reference = {
      status: "completed", imageStorageKey: replacementKey, sourceLabel: "ภาพอ้างอิงตัวละคร",
    };
    storageStreamFile.mockResolvedValue({
      totalLength: image.length, contentType: "image/png", stream: Readable.from([image]),
    });
    listPublishingPages.mockResolvedValue([{ id: 7, provider: "meta", publishingReady: true }]);
    createControlPlaneJob.mockClear();
    createControlPlaneJob.mockResolvedValue({ jobId: "worker-job-retry" });
    const selectedRows = [
      [{ id: RUN_ID, tenantId: TENANT_ID, userId: 41, productId: "product-1", metadataJson: metadata }],
      [{ id: "product-1" }],
      [],
      [],
      [{ id: 12, metadata: {
        source: "marketplace_auto_review_photo_post", autoReviewRunId: RUN_ID,
        intentHash: "c".repeat(64), photoPublicationStatus: "queued", publishingWorkerJobId: "old-job",
      } }],
      [{ id: "old-job", status: "expired", startedAt: null }],
      [{ metadata: { source: "marketplace_auto_review_photo_post", autoReviewRunId: RUN_ID } }],
    ];
    const updates: Array<Record<string, unknown>> = [];
    getDb.mockResolvedValue({
      select: () => ({ from: () => ({ where: () => ({
        limit: () => Promise.resolve(selectedRows.shift()),
        orderBy: () => ({ limit: () => Promise.resolve(selectedRows.shift()) }),
      }) }) }),
      update: () => ({ set: (values: Record<string, unknown>) => ({
        where: () => ({ returning: async () => { updates.push(values); return [{ id: 12 }]; } }),
      }) }),
    });

    const result = await startMarketplaceAutoReviewPhotoPost({
      tenantId: TENANT_ID, userId: 41, runId: RUN_ID, pageId: 7,
      snapshot: {
        variant: "character_reference", caption: "Review caption", hashtags: [],
        affiliateMode: "none", commercialDisclosure: "", allowNoAffiliate: true,
      },
    });

    expect(result).toMatchObject({ postId: 12, jobId: "worker-job-retry", status: "queued" });
    expect(createControlPlaneJob).toHaveBeenCalledOnce();
  });

  it("allows a second Photo Post for a different image after the first image was published", async () => {
    const image = await (await import("sharp")).default({
      create: { width: 3, height: 2, channels: 3, background: "white" },
    }).png().toBuffer();
    const secondImageKey = `marketplace-auto-review/${TENANT_ID}/${RUN_ID}/media/image/social-post-batch-1-character_reference-${"b".repeat(64)}.png`;
    const metadata = runMetadata();
    (metadata.stagedPipeline as any).socialCaption.postImages.variants.character_reference = {
      status: "completed", imageStorageKey: secondImageKey, sourceLabel: "ภาพอ้างอิงตัวละคร",
    };
    storageStreamFile.mockResolvedValue({
      totalLength: image.length, contentType: "image/png", stream: Readable.from([image]),
    });
    listPublishingPages.mockResolvedValue([{ id: 7, provider: "meta", publishingReady: true }]);
    createControlPlaneJob.mockResolvedValue({ jobId: "worker-job-second-photo", created: true });
    const selectedRows = [
      [{ id: RUN_ID, tenantId: TENANT_ID, userId: 41, productId: "product-1", metadataJson: metadata }],
      [{ id: "product-1" }],
      [{ affiliateUrl: "https://shop.example/item" }],
      [],
      [{ id: 12, metadata: {
        source: "marketplace_auto_review_photo_post", autoReviewRunId: RUN_ID,
        intentHash: "c".repeat(64), photoPublicationStatus: "published", selectedPhotoVariant: "caption_source",
        imageStorageKey: IMAGE_KEY, imageChecksum: "a".repeat(64), providerPostId: "facebook-post-1",
      } }],
      [],
    ];
    getDb.mockResolvedValue({
      select: () => ({ from: () => ({ where: () => ({
        limit: () => Promise.resolve(selectedRows.shift()),
        orderBy: () => ({ limit: () => Promise.resolve(selectedRows.shift()) }),
      }) }) }),
      insert: () => ({ values: () => ({ returning: () => Promise.resolve([{ id: 13 }]) }) }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
    });

    await expect(startMarketplaceAutoReviewPhotoPost({
      tenantId: TENANT_ID, userId: 41, runId: RUN_ID, pageId: 7,
      snapshot: {
        variant: "character_reference", caption: "Review caption", hashtags: [],
        affiliateMode: "description", commercialDisclosure: "",
      },
    })).resolves.toMatchObject({ postId: 13, jobId: "worker-job-second-photo", status: "queued" });
  });

  it("blocks a changed Photo Post intent when its exact image was already published", async () => {
    const image = await (await import("sharp")).default({
      create: { width: 3, height: 2, channels: 3, background: "white" },
    }).png().toBuffer();
    storageStreamFile.mockResolvedValue({
      totalLength: image.length, contentType: "image/png", stream: Readable.from([image]),
    });
    listPublishingPages.mockResolvedValue([{ id: 7, provider: "meta", publishingReady: true }]);
    const selectedRows = [
      [{ id: RUN_ID, tenantId: TENANT_ID, userId: 41, productId: "product-1", metadataJson: runMetadata() }],
      [{ id: "product-1" }],
      [{ affiliateUrl: "https://shop.example/item" }],
      [],
      [{ id: 12, metadata: {
        source: "marketplace_auto_review_photo_post", autoReviewRunId: RUN_ID,
        intentHash: "c".repeat(64), photoPublicationStatus: "published", selectedPhotoVariant: "caption_source",
        imageStorageKey: IMAGE_KEY, imageChecksum: "a".repeat(64), providerPostId: "facebook-post-1",
      } }],
    ];
    getDb.mockResolvedValue({ select: () => ({ from: () => ({ where: () => ({
      limit: () => Promise.resolve(selectedRows.shift()),
      orderBy: () => ({ limit: () => Promise.resolve(selectedRows.shift()) }),
    }) }) }) });

    await expect(startMarketplaceAutoReviewPhotoPost({
      tenantId: TENANT_ID, userId: 41, runId: RUN_ID, pageId: 7,
      snapshot: {
        variant: "caption_source", caption: "Edited caption", hashtags: [],
        affiliateMode: "description", commercialDisclosure: "",
      },
    })).rejects.toThrow("PHOTO_POST_PREVIOUS_ATTEMPT_EXISTS");
  });

  it("publishes through the Meta connection provider stored on the connection record", async () => {
    const image = await (await import("sharp")).default({
      create: { width: 3, height: 2, channels: 3, background: "white" },
    }).png().toBuffer();
    const inspected = await inspectMarketplaceAutoReviewPhotoImage(image, "image/png");
    const intentHash = "d".repeat(64);
    const metadata = {
      source: "marketplace_auto_review_photo_post",
      autoReviewRunId: RUN_ID,
      intentHash,
      imageStorageKey: IMAGE_KEY,
      imageChecksum: inspected.checksum,
      imageSizeBytes: inspected.size,
      imageContentType: inspected.contentType,
      photoPublicationStatus: "queued",
      snapshot: { selectedVariant: "caption_source", caption: "Review caption", hashtags: [], affiliateMode: "none", commercialDisclosure: "" },
    };
    const postRow = {
      post: { id: 12, tenantId: TENANT_ID, createdByUserId: 41, status: "draft", providerPostId: null, publishedAt: null, metadata },
      page: {
        id: 7, tenantId: TENANT_ID, providerPageId: "123456789", status: "active", selectedForPublishing: true,
        encryptedPageAccessToken: "encrypted-page-token", tokenExpiresAt: null,
        metadata: { canCreateContent: true },
      },
      connection: {
        tenantId: TENANT_ID, userId: 41, provider: "meta", status: "active", grantedScopes: ["pages_manage_posts", "pages_read_engagement", "pages_show_list"],
        encryptedAccessToken: "encrypted-user-token", metadata: { permissionVerificationStatus: "verified" },
      },
    };
    const selectedRows = [
      [postRow],
      [{ id: RUN_ID, tenantId: TENANT_ID, userId: 41, metadataJson: runMetadata() }],
    ];
    storageStreamFile.mockResolvedValue({ totalLength: image.length, contentType: "image/png", stream: Readable.from([image]) });
    decrypt.mockReturnValue("page-access-token");
    publishFacebookPagePhoto.mockClear().mockResolvedValue({ id: "photo-123", post_id: "story-123", permalink_url: "https://www.facebook.com/story/123" });
    readFacebookPagePhoto.mockResolvedValue({ page_story_id: "story-123", link: "https://www.facebook.com/story/123" });
    getDb.mockResolvedValue({
      select: () => ({ from: () => ({
        innerJoin: () => ({ innerJoin: () => ({ where: () => ({ limit: () => Promise.resolve(selectedRows.shift()) }) }) }),
        where: () => ({ limit: () => Promise.resolve(selectedRows.shift()) }),
      }) }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
    });

    const result = await executeMarketplaceAutoReviewPhotoPostPublish({
      tenantId: TENANT_ID, userId: 41, postId: 12, runId: RUN_ID, intentHash,
    });

    expect(result).toMatchObject({ status: "published", providerPostId: "story-123" });
    expect(publishFacebookPagePhoto).toHaveBeenCalledOnce();
  });

  it("shows a deadline-expired photo job as retryable only if Facebook was never contacted", () => {
    expect(resolveUnstartedPhotoPublicationStatus({
      publicationStatus: "queued",
      jobStatus: "expired",
      jobStartedAt: null,
      hasExternalPhotoAttempt: false,
    })).toBe("failed");
    expect(resolveUnstartedPhotoPublicationStatus({
      publicationStatus: "queued",
      jobStatus: "expired",
      jobStartedAt: new Date(),
      hasExternalPhotoAttempt: false,
    })).toBeNull();
    expect(resolveUnstartedPhotoPublicationStatus({
      publicationStatus: "queued",
      jobStatus: "expired",
      jobStartedAt: null,
      hasExternalPhotoAttempt: true,
    })).toBe("needs_user_action");
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

  it("only unlocks an uncertain Photo Post after an explicit Facebook absence confirmation", async () => {
    const metadata = {
      source: "marketplace_auto_review_photo_post",
      photoPublicationStatus: "needs_user_action",
      photoPublishRequestedAt: "2026-11-26T10:37:05.000Z",
      failureCode: "PHOTO_PUBLISH_OUTCOME_UNCERTAIN",
    };
    const updates: Array<Record<string, unknown>> = [];
    getDb.mockResolvedValue({
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{
        id: 12, tenantId: TENANT_ID, createdByUserId: 41, providerPostId: null, metadata,
      }] }) }) }),
      update: () => ({ set: (values: Record<string, unknown>) => ({ where: async () => { updates.push(values); } }) }),
    });

    await expect(confirmMarketplaceAutoReviewPhotoPostAbsent({ tenantId: TENANT_ID, userId: 41, postId: 12 }))
      .resolves.toEqual({ postId: 12, status: "failed" });
    expect(updates[0]).toMatchObject({
      status: "failed",
      metadata: {
        photoPublishRequestedAt: null,
        photoPublicationStatus: "failed",
        failureCode: "FACEBOOK_POST_ABSENCE_CONFIRMED",
      },
    });
    expect(hasMarketplaceAutoReviewPhotoPostExternalAttempt(updates[0].metadata)).toBe(false);
  });

  it("allows absence confirmation when needs_user_action comes from the saved post status", () => {
    expect(canConfirmMarketplaceAutoReviewPhotoPostAbsent({
      status: "needs_user_action",
      failureCode: "PHOTO_PUBLISH_OUTCOME_UNCERTAIN",
      externalPhotoId: null,
      providerPostId: null,
    })).toBe(true);
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
