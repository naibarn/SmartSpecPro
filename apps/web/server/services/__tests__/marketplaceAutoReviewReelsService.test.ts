import { describe, expect, it, vi } from "vitest";

import { defaultJobExecutorRegistry } from "../jobExecutorRegistry";
import {
  composeFacebookReelsDescription,
  getMarketplaceAutoReviewReelsReadiness,
  hashFacebookReelsContentSnapshot,
  marketplaceAutoReviewReelsWorkerInputSchema,
} from "../marketplaceAutoReviewReelsService";

const { getDb, listPublishingPages } = vi.hoisted(() => ({
  getDb: vi.fn(),
  listPublishingPages: vi.fn(),
}));
vi.mock("../../db", async importOriginal => ({ ...await importOriginal<typeof import("../../db")>(), getDb }));
vi.mock("../socialPublishingService", async importOriginal => ({
  ...await importOriginal<typeof import("../socialPublishingService")>(),
  listPublishingPages,
}));

describe("Auto Review Reel page selection", () => {
  const scope = { tenantId: "tenant-1", userId: 42, runId: "mar_example" };
  const page = { id: 7, provider: "meta", publishingReady: true };

  it.each([
    ["ready_private_library_asset", true],
    ["blocked", false],
  ])("returns connected Pages when the package is %s", async (status, ready) => {
    const run = {
      id: scope.runId, productId: "product-1", outputMode: "full_video",
      status: "completed", resultLibraryItemId: 12, renderJobId: "render-1",
      metadataJson: {
        stagedPipeline: { socialCaption: { caption: "Review" } },
        finalRenderQaEnvelope: { status: "passed" },
        finalMediaQaEnvelope: { status: "passed" },
        renderArtifactProbe: { status: "passed" },
        publishableAssetPackage: { status, libraryItemId: 12, runId: scope.runId, packageId: "package-1", evidenceRefs: ["qa-1"] },
      },
    };
    const results = [
      [run],
      [{ stageKey: "render", status: "completed" }, { stageKey: "library_finalize", status: "completed" }],
      [{ id: "product-1" }],
      [{ affiliateUrl: "https://shop.example/item" }],
      [{ metadata: { source_type: "marketplace_auto_review_render", auto_review_run_id: scope.runId, media_job_id: "render-1" } }],
      [{ id: "render-1" }],
      [{ id: "artifact-1", storageRef: "private/final.mp4", metadataJson: { checksumSha256: "a".repeat(64), sizeBytes: 100 } }],
    ];
    getDb.mockResolvedValue({ select: () => {
      const rows = results.shift();
      return { from: () => ({ where: () => Object.assign(Promise.resolve(rows), {
        limit: () => Promise.resolve(rows),
        orderBy: () => ({ limit: () => Promise.resolve(rows) }),
      }) }) };
    } });
    listPublishingPages.mockResolvedValue([page]);

    await expect(getMarketplaceAutoReviewReelsReadiness(scope)).resolves.toMatchObject({ ready, pages: [page] });
    expect(listPublishingPages).toHaveBeenLastCalledWith(scope.tenantId, scope.userId);
  });
});

describe("Marketplace Auto Review Facebook Reels contract", () => {
  it("registers the publisher in the canonical worker executor registry", () => {
    expect(defaultJobExecutorRegistry.resolve("social.facebook.reels.publish", "feature-186-v1")).toBeDefined();
  });

  it("preserves the complete canonical affiliate URL and edited text in the publish snapshot", () => {
    const affiliateUrl = "https://shop.example/item?aff_id=ab%2Fcd&campaign=x%20y&sub=1";
    const description = composeFacebookReelsDescription({
      caption: "User edited caption",
      hashtags: ["#review", "#dailydeal"],
      commercialDisclosure: "โฆษณา มีลิงก์ Affiliate",
      affiliateUrl,
    });
    expect(description).toContain(affiliateUrl);
    expect(description).toContain("User edited caption");
    expect(description).toContain("#review #dailydeal");
    expect(hashFacebookReelsContentSnapshot({ description })).toMatch(/^[a-f0-9]{64}$/);
    expect(hashFacebookReelsContentSnapshot({ description: `${description} ` })).not.toBe(
      hashFacebookReelsContentSnapshot({ description }),
    );
  });

  it("accepts only reference-based worker inputs and rejects client media URLs", () => {
    expect(marketplaceAutoReviewReelsWorkerInputSchema.safeParse({
      postId: 1,
      runId: "mar_example",
      intentHash: "a".repeat(64),
    }).success).toBe(true);
    expect(marketplaceAutoReviewReelsWorkerInputSchema.safeParse({
      postId: 1,
      runId: "mar_example",
      intentHash: "a".repeat(64),
      mediaUrl: "https://attacker.example/video.mp4",
    }).success).toBe(false);
  });
});
