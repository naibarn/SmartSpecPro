import { describe, expect, it, vi } from "vitest";

import {
  assertMarketplaceAutoReviewGovernanceReadyForTest,
  assertCompleteMarketplaceAutoReviewVideoClips,
  approvedVisualReferenceUrlsForTest,
  buildMarketplaceAutoReviewAudioContinuityEnvelopeForTest,
  buildMarketplaceAutoReviewAutomationSnapshotsForTest,
  buildMarketplaceAutoReviewCancellationEvidenceForTest,
  buildMarketplaceAutoReviewClaimEvidenceMappingForTest,
  buildMarketplaceAutoReview3x3StoryboardPromptForTest,
  buildMarketplaceAutoReviewCreativeConceptSetForTest,
  buildMarketplaceAutoReviewCreativePlannerFallbackConceptSetForTest,
  buildMarketplaceAutoReviewCreativeVariationSeedForTest,
  buildMarketplaceAutoReviewCreativeShotForTest,
  buildMarketplaceAutoReviewDirectMediaSubmitMetadataForTest,
  buildMarketplaceAutoReviewDurableRuntimePlanForTest,
  buildMarketplaceAutoReviewCreativePerformanceMemoryForTest,
  buildMarketplaceAutoReviewMediaArtifactInspectionForTest,
  buildMarketplaceAutoReviewProviderReconciliationSnapshotForTest,
  buildMarketplaceAutoReviewQualityModePolicyForTest,
  buildMarketplaceAutoReviewQaCacheEntryForTest,
  buildMarketplaceAutoReviewRenderLibraryMetadataForTest,
  buildMarketplaceAutoReviewRenderFinalizationMetadataForTest,
  buildMarketplaceAutoReviewShotFrameRepairUnitsForTest,
  buildMarketplaceAutoReviewStoryConceptWizardForTest,
  buildMarketplaceAutoReviewStoryboardReviewLinkForTest,
  buildMarketplaceAutoReviewStoryboardReviewOutputForTest,
  buildMarketplaceAutoReviewStoryboardGridQaRepairUnitForTest,
  buildMarketplaceAutoReviewStoryboardGridRepairUnitForTest,
  buildMarketplaceAutoReviewStoryboardReviewTasksForTest,
  buildMarketplaceAutoReviewVoiceoverSkillProductDetailsForTest,
  buildMarketplaceAutoReviewVisionQaRuntimeUnavailableEnvelopeForTest,
  acceptMarketplaceAutoReviewBestImageAttemptAfterProviderFailureForTest,
  acceptMarketplaceAutoReviewImageQaWithWarningsForTest,
  applyMarketplaceAutoReviewVoiceoverLinesToPlanForTest,
  buildMarketplaceAutoReviewImageAttemptReviewsForTest,
  buildMarketplaceAutoReviewRunIdempotencyKeyForTest,
  buildMarketplaceAutoReviewTargetedRepairPolicyLedgerForTest,
  buildMarketplaceAutoReviewVideoAcceptanceEnvelopeForTest,
  buildMarketplaceAutoReviewVideoEditorProjectForTest,
  buildMarketplaceAutoReviewNativeSpeechText,
  normalizeMarketplaceAutoReviewCreativeShotsForTest,
  normalizeMarketplaceAutoReviewImageModelForTest,
  normalizeMarketplaceAutoReviewStageCompletionEvidenceForTest,
  buildMarketplaceAutoReviewVideoPromptForTest,
  buildFeature117ContractMetadataForTest,
  buildMarketplaceAutoReviewProductTruthScaffoldForTest,
  buildProductReferenceStoryboardSkillInputSnapshotForTest,
  buildProductReferenceStoryboardSkillInputsForTest,
  buildMarketplaceAutoReviewWarningOverlayVerificationForTest,
  collectPaidStageAuthorityFreshnessForTest,
  evaluateMarketplaceAutoReviewInputChangeImpactForTest,
  filterMarketplaceAutoReviewImageRepairUnitsForTest,
  inferProductReferenceStoryboardCategoryForTest,
  isMarketplaceAutoReviewImageRepairBudgetExhaustedForTest,
  prepareMarketplaceAutoReviewImagePromptForTest,
  productReferenceStoryboardReferenceImageGroupsForTest,
  resolveMarketplaceAutoReviewAudioStrategy,
  resolveMarketplaceAutoReviewReferenceAnchorsForTest,
  reusableStoryboardGridPromptAuditForTest,
  selectMarketplaceAutoReviewBestImageAttemptForTest,
  mergeMarketplaceAutoReviewQaCacheEntriesForTest,
  maybeQueueHyperframesPreviewAfterStoryboardReadyForTest,
  serializeMarketplaceAutoReviewRunForTest,
  summarizeMarketplaceAutoReviewCancellationForTest,
  splitMarketplaceAutoReviewVoiceoverSkillOutputForTest,
  storyboardGridFrameStorageKeyForTest,
  splitStoryboardGridRectsForTest,
  validateMarketplaceAutoReviewImagePromptPreflightForTest,
} from "../marketplaceAutoReviewService";
import {
  CreativeConceptSetSchema,
  MarketplaceAutoReviewStageCompletionEvidenceSchema,
} from "../../../shared/marketplaceAutoReview/contracts";
import { getDb } from "../../db";

vi.mock("../../db", () => ({
  getDb: vi.fn(async () => null),
}));

const basePlan = {
  conceptId: "concept-1",
  title: "รีวิวสินค้า",
  productTruth: {
    productId: "mp_1",
    productName: "Greenforst โต๊ะวางของข้างเตียง",
    brand: "Greenforst",
    platform: "shopee",
    externalProductId: "2162",
    externalShopId: "seller-1",
    productCategory: "furniture",
    categoryText: "เฟอร์นิเจอร์",
    categoryPath: ["บ้านและไลฟ์สไตล์", "เฟอร์นิเจอร์"],
    sourceUrl: "https://example.com/product",
    affiliateUrl: null,
    shopName: null,
    price: null,
    rating: null,
    sold: null,
    reviews: null,
    description: "",
    specs: {},
    imageUrls: ["https://example.com/product.png"],
  },
  storyboardGuide: "Shot-by-shot storyboard guide",
  voiceoverScript: "VOICEOVER SCRIPT BY SHOT",
  productDetail:
    "PRODUCT FACTS LOCK: Greenforst โต๊ะวางของข้างเตียง. Do not alter shape, material, or shelf count.",
  shots: [],
};

const baseShot = {
  id: "shot-1",
  order: 1,
  title: "เปิดปัญหา",
  startSeconds: 0,
  endSeconds: 8,
  durationSeconds: 8,
  storyboardGuide: "1. 0-8s เปิดปัญหา / มุมกล้อง: slow push-in",
  voiceover: "สั้นมาก",
  camera: "slow push-in",
  visual: "เห็นมุมข้างเตียงก่อนจัดของ",
  movement: "slow push-in",
  productRole: "context first",
};

function createAutoPreviewUpdateDb() {
  const updates: Array<Record<string, unknown>> = [];
  const db = {
    update: () => ({
      set: (value: Record<string, unknown>) => {
        updates.push(value);
        return {
          where: () => ({
            returning: async () => [{ id: "mar_preview_1", ...value }],
          }),
        };
      },
    }),
  };
  return { db, updates };
}

describe("Marketplace Auto Review Storyboard Review links", () => {
  it("carries HyperFrames render context into Storyboard Review links", () => {
    expect(
      buildMarketplaceAutoReviewStoryboardReviewLinkForTest({
        storyboardReviewId: 42,
        productId: "product_1",
        runId: "mar_1",
        renderJobId: "hf_render_1",
      })
    ).toBe(
      "/storyboard-review/42?hyperframesRenderJobId=hf_render_1&productId=product_1&runId=mar_1"
    );
  });

  it("keeps the normal Storyboard Review link when no HyperFrames render exists", () => {
    expect(
      buildMarketplaceAutoReviewStoryboardReviewLinkForTest({
        storyboardReviewId: "42",
        productId: "product_1",
        runId: "mar_1",
      })
    ).toBe("/storyboard-review/42");
  });

  it("keeps sanitized HyperFrames preview markers in summary metadata", () => {
    const serialized = serializeMarketplaceAutoReviewRunForTest(
      {
        id: "mar_summary_1",
        tenantId: "tenant_1",
        userId: 119,
        productId: "product_1",
        productionRunId: "prod_summary_1",
        outputMode: "storyboard_images",
        frameStrategy: "storyboard_3x3_split",
        status: "running",
        currentStage: "storyboard_review",
        stageIndex: 3,
        stageCount: 3,
        storyboardReviewId: "42",
        videoEditorProjectId: null,
        renderJobId: null,
        resultLibraryItemId: null,
        resultJson: {
          storyboardReviewId: "42",
          frameUrls: [
            "https://cdn.example.test/frame.png",
            "https://cdn.example.test/private/frame.png?X-Amz-Signature=abc",
          ],
          startFrameUrls: [
            "https://cdn.example.test/start.png",
            "https://signed.example.test/private/start.png?Expires=999999",
          ],
          stopFrameUrls: [
            "https://cdn.example.test/stop.png",
            "javascript:alert(1)",
          ],
          hyperframesRenderJobId: "hf_result_summary_1",
          hyperframesAutoPreview: {
            renderJobId: "hf_result_preview_1",
            status: "completed",
            rawHtml: "<html>private-result</html>",
            signedUrl: "https://signed.example.test/private-result",
          },
          render: {
            renderJobId: "hf_result_render_1",
            status: "completed",
            compositionInputHash: "hf_input_hash",
            rawHtml: "<html>private-render</html>",
            signedUrl: "https://signed.example.test/private-render",
            storageKey: "private/storage/key",
            workerLogs: ["private log"],
            outputRefs: [{ url: "https://signed.example.test/private-output" }],
          },
          publishableAssetPackage: {
            privateStorageKey: "private/package/key",
          },
        },
        metadataJson: {
          hyperframesAutoPreview: {
            renderJobId: "hf_summary_1",
            status: "queued",
            queuedAt: "2026-06-05T00:00:00.000Z",
            rawHtml: "<html>private</html>",
            signedUrl: "https://signed.example.test/private",
          },
          storyboardFrameUrls: ["https://cdn.example.test/frame.png"],
        },
        errorMessage: null,
        idempotencyKey: "marketplace-auto-review:legacy",
        createdAt: new Date("2026-06-05T00:00:00.000Z"),
        updatedAt: new Date("2026-06-05T00:00:00.000Z"),
        completedAt: null,
      } as any,
      [],
      { includeHeavyMetadata: false }
    ) as any;

    expect(serialized.metadataJson.hyperframesAutoPreview).toEqual({
      renderJobId: "hf_summary_1",
      status: "queued",
      queuedAt: "2026-06-05T00:00:00.000Z",
    });
    expect(
      JSON.stringify(serialized.metadataJson.hyperframesAutoPreview)
    ).not.toContain("private");
    expect(serialized.resultJson).toEqual({
      storyboardReviewId: "42",
      frameUrls: ["https://cdn.example.test/frame.png"],
      startFrameUrls: ["https://cdn.example.test/start.png"],
      stopFrameUrls: ["https://cdn.example.test/stop.png"],
      hyperframesRenderJobId: "hf_result_summary_1",
      hyperframesAutoPreview: {
        renderJobId: "hf_result_preview_1",
        status: "completed",
      },
      render: {
        renderJobId: "hf_result_render_1",
        status: "completed",
        compositionInputHash: "hf_input_hash",
      },
    });
    expect(JSON.stringify(serialized.resultJson)).not.toContain("private");
    expect(JSON.stringify(serialized.resultJson)).not.toContain("signed");
    expect(JSON.stringify(serialized.resultJson)).not.toContain("workerLogs");
    expect(JSON.stringify(serialized)).not.toContain("private-result");
    expect(JSON.stringify(serialized)).not.toContain("private-render");
    expect(JSON.stringify(serialized)).not.toContain("private/storage/key");
    expect(serialized.links.storyboardReview).toContain(
      "hyperframesRenderJobId=hf_summary_1"
    );
  });
});

describe("Marketplace Auto Review HyperFrames preview queue", () => {
  async function withPreviewAccess(callback: () => Promise<void>) {
    const mockedGetDb = vi.mocked(getDb);
    mockedGetDb.mockResolvedValueOnce({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                featureFlags: {
                  marketplaceHyperframesEnabled: true,
                  marketplaceHyperframesWorkerEnabled: true,
                  marketplaceHyperframesLibrarySaveEnabled: false,
                  marketplaceHyperframesOperatorEnabled: false,
                },
              },
            ],
          }),
        }),
      }),
    } as any);
    mockedGetDb.mockResolvedValue(null);
    try {
      await callback();
    } finally {
      mockedGetDb.mockResolvedValue(null);
    }
  }

  it("queues a HyperFrames preview and stores render metadata after Storyboard Review is ready", async () => {
    await withPreviewAccess(async () => {
      const { db, updates } = createAutoPreviewUpdateDb();
      const metadata = { audioStrategy: "auto" };

      const result =
        await maybeQueueHyperframesPreviewAfterStoryboardReadyForTest({
          db: db as any,
          tenantId: "tenant_1",
          auth: { userId: 119, tenantId: "tenant_1" },
          run: {
            id: "mar_preview_1",
            productId: "product_1",
          } as any,
          plan: basePlan as any,
          metadata: metadata as any,
          storyboardReviewId: "storyboard_1",
          frameUrls: ["https://cdn.example.test/frame-1.png"],
          startFrameUrls: [],
          stopFrameUrls: [],
        });

      expect(result.renderJobId).toMatch(/^hf_/);
      expect(result.metadata.hyperframesAutoPreview).toMatchObject({
        renderJobId: result.renderJobId,
        status: "queued",
      });
      expect(updates).toHaveLength(1);
      expect(updates[0]).toMatchObject({
        renderJobId: result.renderJobId,
      });
      expect(
        (updates[0]?.metadataJson as any)?.hyperframesAutoPreview
      ).toMatchObject({
        renderJobId: result.renderJobId,
        status: "queued",
      });
    });
  });

  it("continues without queueing when Storyboard Review has no frame evidence", async () => {
    await withPreviewAccess(async () => {
      const { db, updates } = createAutoPreviewUpdateDb();
      const metadata = { audioStrategy: "auto" };

      const result =
        await maybeQueueHyperframesPreviewAfterStoryboardReadyForTest({
          db: db as any,
          tenantId: "tenant_1",
          auth: { userId: 119, tenantId: "tenant_1" },
          run: {
            id: "mar_preview_1",
            productId: "product_1",
          } as any,
          plan: basePlan as any,
          metadata: metadata as any,
          storyboardReviewId: "storyboard_1",
          frameUrls: [],
          startFrameUrls: [],
          stopFrameUrls: [],
        });

      expect(result).toEqual({
        renderJobId: null,
        metadata,
      });
      expect(updates).toEqual([]);
    });
  });
});

describe("Marketplace Auto Review product voiceover dialogue rewrite helpers", () => {
  const reviewPlan = {
    ...basePlan,
    conceptId: "concept-review-1",
    title: "เดโมจัดมุมข้างเตียง",
    storyboardGuide:
      "แกนเรื่อง: ปัญหาของรก -> โต๊ะเข้าฉาก -> จัดของ -> ปิดด้วยผลลัพธ์",
    shots: [
      {
        ...baseShot,
        id: "shot-1",
        order: 1,
        startSeconds: 0,
        endSeconds: 5,
        durationSeconds: 5,
        title: "เปิดปัญหาของรก",
        voiceover: "ข้างเตียงรกจนหยิบอะไรก็ไม่เจอ",
      },
      {
        ...baseShot,
        id: "shot-2",
        order: 2,
        startSeconds: 5,
        endSeconds: 10,
        durationSeconds: 5,
        title: "โชว์วิธีจัดของ",
        storyboardGuide: "วางโต๊ะข้างเตียง แล้วจัดของจำเป็นให้เป็นที่",
        visual: "มือจัดโคมไฟ หนังสือ และแก้วน้ำบนโต๊ะ",
        camera: "overhead detail",
        movement: "slow pan",
        productRole: "solution proof",
        voiceover: "โต๊ะตัวนี้ช่วยให้ของจำเป็นมีที่อยู่ชัดเจนขึ้น",
      },
    ],
  };

  it("builds product_details as a storyboard-to-spoken-voiceover request", () => {
    const details = buildMarketplaceAutoReviewVoiceoverSkillProductDetailsForTest(
      {
        plan: reviewPlan,
      }
    );

    expect(details).toContain("Marketplace Capture Auto Review หน้า Product");
    expect(details).toContain("Selected video concept");
    expect(details).toContain("Current spoken intent");
    expect(details).toContain("จำนวน 2 บรรทัด");
    expect(details).toContain("ไม่ใช่คำบรรยายภาพ");
  });

  it("splits skill output into spoken shot lines and drops visual metadata", () => {
    const lines = splitMarketplaceAutoReviewVoiceoverSkillOutputForTest(
      [
        "ภาพ: messy bedside",
        "1. ข้างเตียงรกแบบนี้ หยิบของทีไรก็เสียเวลาใช่ไหม",
        "มุมกล้อง: overhead",
        "2. วางโต๊ะ Greenforst เข้ามา แล้วของจำเป็นก็มีที่อยู่เป็นสัดส่วนขึ้น",
      ].join("\n"),
      2
    );

    expect(lines).toEqual([
      "ข้างเตียงรกแบบนี้ หยิบของทีไรก็เสียเวลาใช่ไหม",
      "วางโต๊ะ Greenforst เข้ามา แล้วของจำเป็นก็มีที่อยู่เป็นสัดส่วนขึ้น",
    ]);
  });

  it("applies rewritten voiceover without changing visual shot contracts", () => {
    const rewritten = applyMarketplaceAutoReviewVoiceoverLinesToPlanForTest({
      plan: reviewPlan,
      lines: [
        "ถ้าข้างเตียงรกจนหยิบอะไรก็ไม่เจอ ลองเริ่มจากจัดมุมนี้ก่อน",
        "โต๊ะ Greenforst ช่วยให้โคมไฟ หนังสือ และแก้วน้ำมีที่วางชัดเจนขึ้น",
      ],
    });

    expect(rewritten.shots[0]?.voiceover).toContain("ลองเริ่มจากจัดมุมนี้ก่อน");
    expect(rewritten.shots[1]?.voiceover).toContain("มีที่วางชัดเจนขึ้น");
    expect(rewritten.shots[1]?.visual).toBe(reviewPlan.shots[1]?.visual);
    expect(rewritten.shots[1]?.camera).toBe(reviewPlan.shots[1]?.camera);
    expect(rewritten.voiceoverScript).toContain("VOICEOVER SCRIPT BY SHOT");
    expect(rewritten.voiceoverScript).toContain("1. 0-5s เปิดปัญหาของรก");
  });
});

describe("Marketplace Auto Review image model selection", () => {
  it("accepts Nano Banana 2 and falls back invalid values to Nano Banana Pro", () => {
    expect(
      normalizeMarketplaceAutoReviewImageModelForTest("google-banana-2")
    ).toBe("google-banana-2");
    expect(
      normalizeMarketplaceAutoReviewImageModelForTest("google-nano-banana-pro")
    ).toBe("google-nano-banana-pro");
    expect(normalizeMarketplaceAutoReviewImageModelForTest("banana")).toBe(
      "google-nano-banana-pro"
    );
  });
});

describe("Marketplace Auto Review run idempotency", () => {
  it("compacts long run inputs below the database varchar limit", () => {
    const key = buildMarketplaceAutoReviewRunIdempotencyKeyForTest({
      tenantId: "tenant-ZCSKEM9s",
      productId: "mp_654f30560af1fa18abd32fda5ce42657",
      outputMode: "storyboard_images",
      frameStrategy: "storyboard_3x3_split",
      audioStrategy: "native_video_audio",
      resolvedAudioStrategy: "native_video_audio",
      requestedShotCount: 9,
      overlayTextMode: "no_text",
      imageModel: "google-nano-banana-pro",
      referenceAnchorHash: "08de7db5a86d",
      runId: "mar_4c54a49b374f95b4c4c58458531bca54",
    });

    expect(key).toMatch(/^mar-run:[a-f0-9]{32,40}$/);
    expect(key.length).toBeLessThanOrEqual(192);
    expect(
      buildMarketplaceAutoReviewRunIdempotencyKeyForTest({
        tenantId: "tenant-ZCSKEM9s",
        productId: "mp_654f30560af1fa18abd32fda5ce42657",
        outputMode: "storyboard_images",
        frameStrategy: "storyboard_3x3_split",
        audioStrategy: "native_video_audio",
        resolvedAudioStrategy: "native_video_audio",
        requestedShotCount: 9,
        overlayTextMode: "no_text",
        imageModel: "google-nano-banana-pro",
        referenceAnchorHash: "08de7db5a86d",
        runId: "mar_4c54a49b374f95b4c4c58458531bca54",
      })
    ).toBe(key);
  });
});

const readyCharacterIdentityAssetPack = {
  status: "ready",
  assetPackId: "character-pack-1",
  sourceKind: "uploaded_reference",
  referenceImageRefs: ["character-reference:abc"],
  referenceImageUrls: ["https://cdn.example.test/person.png"],
  sourceMetadata: {
    role: "character",
    source: "user_upload",
    uploadKey: "anchors/person.png",
    hash: "personhash",
    fileEvidence: { fileName: "person.png", fileType: "image/png" },
    verifiedProviderEvidence: {
      status: "verified",
      verifiedBy: "test",
      evidenceRef: "verified-upload-reference:character:test",
    },
  },
  auditRefs: ["character-reference:abc", "character-image-sha256:person"],
  consentRefs: ["character-consent:mar_1:user_supplied_reference"],
  allowedFaceUsage: "recurring",
  allowedVoiceUsage: "tts",
  continuityDescriptors: ["same approved presenter identity"],
  blockedRefs: [],
};

const readyEnvironmentReferenceAssetPack = {
  status: "ready",
  assetPackId: "environment-pack-1",
  sourceKind: "uploaded_reference",
  referenceImageRefs: ["environment-reference:abc"],
  referenceImageUrls: ["https://cdn.example.test/place.png"],
  sourceMetadata: {
    role: "environment",
    source: "user_upload",
    uploadKey: "anchors/place.png",
    hash: "placehash",
    fileEvidence: { fileName: "place.png", fileType: "image/png" },
    verifiedProviderEvidence: {
      status: "verified",
      verifiedBy: "test",
      evidenceRef: "verified-upload-reference:environment:test",
    },
  },
  auditRefs: ["environment-reference:abc", "environment-image-sha256:place"],
  providerUsePolicy: "style_layout_lighting_anchor",
  continuityDescriptors: ["same approved room lighting"],
  blockedRefs: [],
};

const readyProductReferenceAssetPack = {
  status: "ready",
  providerUsePolicy: "allowed",
  assetPackId: "product-pack-1",
  productId: "mp_1",
  selectedProductImageUrl: "https://example.com/product.png",
  selectedSource: "user_selected",
  primaryRef: "product-image:1:selected",
  supportingRefs: [],
  providerReferenceUrls: ["https://example.com/product.png"],
  sourceMetadata: {
    role: "product",
    source: "marketplace_product_image",
    uploadKey: "products/img_1.png",
    hash: "producthash",
    id: "img_1",
    verifiedProviderEvidence: {
      status: "verified",
      verifiedBy: "test",
      evidenceRef: "stored-product-image:1:test",
    },
  },
  auditRefs: ["product-image:1:selected", "product-image-sha256:product"],
  rejectedRefs: [],
  qaRefs: ["product-reference-qa:main"],
  requiredUserAction: null,
};

const readyAdvertisingRulePack = {
  status: "approved",
  fixtureReplayStatus: "passed",
  rulePackId: "ad-policy-1",
  triggeredRuleIds: ["truthful_advertising"],
  sourceAnchors: [
    {
      label: "Thailand OCPB truth-in-advertising snapshot",
      sourceType: "official",
    },
  ],
  rules: [
    {
      ruleId: "truthful_advertising",
      fixtureRefs: ["fixture:ad-policy:truthful:v1"],
    },
  ],
  fixtureRefs: ["fixture:ad-policy:truthful:v1"],
  policyEvidenceRefs: ["policy-source:th-ocpb-truth-in-advertising:v1"],
};

const readyAdvertisingComplianceProfile = {
  status: "pass",
  profileId: "ad-profile-1",
  triggeredRuleIds: ["truthful_advertising"],
  policyEvidenceRefs: ["policy-source:th-ocpb-truth-in-advertising:v1"],
};

const readyCampaignGovernance = {
  status: "passed",
  gateId: "campaign-1",
  evidenceRefs: ["campaign-dedupe:mar_1", "spend-guardrail:mar_1"],
  dedupeRefs: ["campaign-dedupe:mar_1"],
  spendGuardrailRefs: ["spend-guardrail:mar_1"],
};

const readyHumanReviewGate = {
  status: "passed",
  gateId: "human-review-1",
  approverRole: "system_policy",
  approvalRef: "human-review-waiver:mar_1:auto-safe-policy-v1",
  waiverRef: "human-review-waiver:mar_1:auto-safe-policy-v1",
  evidenceRefs: ["human-review-waiver:mar_1:auto-safe-policy-v1"],
};

const readyOperationalRecoveryEvidence = {
  status: "passed",
  providerCallbackAuthReplay: {
    status: "verified",
    verifiedBy: "test",
    evidenceRef: "provider-callback-auth:mar_1:signed-replay-window",
    evidenceSource: "test-fixture:ops:provider-callback-auth",
    signatureRequired: true,
    replayWindowSeconds: 300,
    idempotencyKeyPolicy: "provider_task_id_plus_attempt",
  },
  dlqBackpressure: {
    status: "verified",
    verifiedBy: "test",
    evidenceRef: "dlq-backpressure:mar_1:direct-media",
    evidenceSource: "test-fixture:ops:dlq-backpressure",
    retryBudget: 2,
    backpressurePolicy: "queue_or_stage_waiting_provider_no_extra_spend",
  },
  leasesHeartbeat: {
    status: "verified",
    verifiedBy: "test",
    evidenceRef: "lease-heartbeat:mar_1:advance-loop",
    evidenceSource: "test-fixture:ops:lease-heartbeat",
    staleTimeoutMs: 43_200_000,
    recoveryAction: "requeue_advance_or_mark_recheck_required",
  },
  migrationBackfillDryRun: {
    status: "verified",
    verifiedBy: "test",
    evidenceRef: "migration-dry-run:mar_1:metadata-compatible",
    evidenceSource: "test-fixture:ops:migration-dry-run",
    dryRunStatus: "metadata_only_no_migration",
  },
  sloAlerts: {
    status: "verified",
    verifiedBy: "test",
    evidenceRef: "slo-alerts:mar_1:feature117",
    evidenceSource: "test-fixture:ops:slo-alerts",
    alertRoutingRefs: ["alert-route:mar_1:marketplace-auto-review"],
    monitoredSignals: ["provider_callback_auth_failure", "dlq_count"],
  },
  operatorRunbook: {
    status: "verified",
    verifiedBy: "test",
    evidenceRef: "operator-runbook:mar_1:recovery-v1",
    evidenceSource: "test-fixture:ops:operator-runbook",
    runbookRef: "operator-runbook:mar_1:recovery-v1",
    actions: ["verify_callback_signature_and_replay_window"],
  },
};

function trustedAnchorInput(overrides: Record<string, unknown> = {}): any {
  return {
    productImageUrl: "https://example.com/product.png",
    productImageSource: "marketplace_product_image",
    productImageId: "img_1",
    productImageStorageKey: "products/img_1.png",
    productImageHash: "producthash",
    characterImageUrl: "https://cdn.example.test/person.png",
    characterImageSource: "user_upload",
    characterImageUploadKey: "anchors/person.png",
    characterImageHash: "personhash",
    characterImageFileName: "person.png",
    characterImageFileType: "image/png",
    characterImageFileSizeBytes: 1234,
    environmentImageUrl: "https://cdn.example.test/place.png",
    environmentImageSource: "user_upload",
    environmentImageUploadKey: "anchors/place.png",
    environmentImageHash: "placehash",
    environmentImageFileName: "place.png",
    environmentImageFileType: "image/png",
    environmentImageFileSizeBytes: 2345,
    sourceRefs: ["capture:capture_1", "upload:person", "upload:place"],
    serverVerifiedProviderEvidence: {
      product: {
        status: "verified",
        verifiedBy: "test",
        evidenceRef: "stored-product-image:1:test",
      },
      character: {
        status: "verified",
        verifiedBy: "test",
        evidenceRef: "verified-upload-reference:character:test",
      },
      environment: {
        status: "verified",
        verifiedBy: "test",
        evidenceRef: "verified-upload-reference:environment:test",
      },
    },
    ...overrides,
  };
}

function productAccessBundle(overrides: Record<string, unknown> = {}) {
  return {
    product: {
      id: "mp_1",
      productName: "Greenforst โต๊ะวางของข้างเตียง",
      brand: "Greenforst",
      platform: "shopee",
      sourceUrl: "https://example.com/product",
      descriptionText: "",
      specsJson: {},
      metadataJson: {},
      accessType: "owner",
      captureId: "capture_1",
      createdAt: "2026-05-31T00:00:00.000Z",
      updatedAt: "2026-05-31T00:00:00.000Z",
      ...overrides,
    },
    images: [{ url: "https://example.com/product.png" }],
    history: [],
    shares: [],
    health: {},
  };
}

function readyFeature117Metadata(bundle = productAccessBundle()) {
  const anchors = resolveMarketplaceAutoReviewReferenceAnchorsForTest({
    productTruth: basePlan.productTruth,
    referenceAnchors: trustedAnchorInput(),
  });
  return buildFeature117ContractMetadataForTest({
    runId: "mar_1",
    tenantId: "tenant_1",
    auth: { userId: 42, tenantId: "tenant_1" } as any,
    bundle: bundle as any,
    insights: [] as any,
    plan: basePlan as any,
    outputMode: "full_video",
    frameStrategy: "video_shot_start_stop",
    audioStrategy: "auto",
    resolvedAudioStrategy: "native_video_audio",
    referenceAnchors: anchors,
    externalOperationalRecoveryEvidence: readyOperationalRecoveryEvidence,
  });
}

function readyRenderGateMetadata(overrides: Record<string, unknown> = {}) {
  return {
    videoClipUrls: ["https://cdn.example.test/shot-1.mp4"],
    videoUnitIds: ["shot-1-video"],
    generatedMediaAcceptanceEnvelope: {
      status: "accepted",
      acceptanceEnvelopeId: "acceptance-video",
    },
    videoContinuityQaSummary: {
      status: "passed",
      qaEnvelopeRefs: ["video-qa-1"],
    },
    audioContinuityQaEnvelope: {
      status: "accepted",
      qaEnvelopeId: "audio-qa-1",
    },
    warningOverlayVerification: {
      status: "not_required",
      verificationId: "warning-1",
    },
    visualWarningPlan: { required: false, warningPlanId: "warning-plan-1" },
    productReferenceAssetPack: {
      ...readyProductReferenceAssetPack,
    },
    characterIdentityAssetPack: readyCharacterIdentityAssetPack,
    environmentReferenceAssetPack: readyEnvironmentReferenceAssetPack,
    evidenceInstructionFirewall: {
      status: "passed",
      firewallId: "firewall-1",
    },
    advertisingRulePack: readyAdvertisingRulePack,
    advertisingComplianceProfile: readyAdvertisingComplianceProfile,
    privacyEnvelope: { status: "passed", envelopeId: "privacy-1" },
    assetRightsEnvelope: { status: "passed", envelopeId: "rights-1" },
    distributionProfile: { status: "passed", profileId: "distribution-1" },
    campaignGovernance: readyCampaignGovernance,
    brandSellerVoicePolicy: { status: "passed", policyId: "brand-1" },
    humanReviewGate: readyHumanReviewGate,
    operationalRecoveryEvidence: readyOperationalRecoveryEvidence,
    inputChangeImpact: {
      status: "no_recheck_required",
      impactId: "input-impact-1",
    },
    publishablePackageRequirements: {
      status: "passed",
      packageGateId: "package-1",
    },
    claimEvidenceMapping: {
      status: "supported",
      blockedClaims: [],
    },
    generatedVideoSampleRefs: {
      "shot-1": ["video-sample:shot-1", "keyframe:shot-1"],
    },
    renderArtifactProbe: {
      status: "passed",
      probeId: "render-probe-1",
      resultUrl: "https://cdn.example.test/final.mp4",
    },
    creditSummary: {
      reservationRefs: ["credit:render-1"],
      transactionRefs: ["credit-tx:101"],
    },
    ...overrides,
  };
}

describe("marketplace auto review audio/video planning", () => {
  it("requires an explicit product anchor when product images are ambiguous", () => {
    expect(() =>
      resolveMarketplaceAutoReviewReferenceAnchorsForTest({
        productTruth: {
          imageUrls: [
            "https://cdn.example.test/product-red.png",
            "https://cdn.example.test/product-blue.png",
          ],
        },
      })
    ).toThrow(/ต้องเลือกรูปสินค้าหลัก/);
  });

  it("binds the user-selected product, character, and environment references", () => {
    const anchors = resolveMarketplaceAutoReviewReferenceAnchorsForTest({
      productTruth: {
        imageUrls: [
          "https://cdn.example.test/product-red.png",
          "https://cdn.example.test/product-blue.png",
        ],
      },
      referenceAnchors: {
        ...trustedAnchorInput({
          productImageUrl: "https://cdn.example.test/product-blue.png",
        }),
      },
    });

    expect(anchors.productImageIndex).toBe(1);
    expect(anchors.productImageRef).toMatch(/^product-image:2:/);
    expect(anchors.characterImageRef).toMatch(/^character-reference:/);
    expect(anchors.environmentImageRef).toMatch(/^environment-reference:/);
  });

  it("preserves rich user-selected anchor metadata in resolved anchors and asset packs", () => {
    const anchors = resolveMarketplaceAutoReviewReferenceAnchorsForTest({
      productTruth: basePlan.productTruth,
      referenceAnchors: {
        schemaVersion: 1,
        creationIntent: "auto_review_video",
        requiredRoles: ["product", "character", "environment"],
        lockPolicy: {
          mode: "strict_reference_anchor_lock",
          auditMetadataRequired: true,
        },
        productImageUrl: "https://example.com/product.png",
        productImageId: "img_123",
        productImageRef: "product-image-sha256:producthash",
        productImageSource: "marketplace_product_image",
        productImageSourceUrl: "https://example.com/source-product.png",
        productImageStorageKey: "products/img_123.png",
        productImageHash: "producthash",
        productImageIndex: 0,
        characterImageUrl: "https://cdn.example.test/person.png",
        characterImageRef: "character-upload:char_123",
        characterImageSource: "user_upload",
        characterImageUploadKey: "anchors/char_123.png",
        characterImageHash: "charhash",
        characterImageFileName: "person.png",
        characterImageFileType: "image/png",
        characterImageFileSizeBytes: 1234,
        environmentImageUrl: "https://cdn.example.test/place.png",
        environmentImageRef: "environment-upload:env_123",
        environmentImageSource: "user_upload",
        environmentImageUploadKey: "anchors/env_123.png",
        environmentImageHash: "envhash",
        environmentImageFileName: "place.png",
        environmentImageFileType: "image/png",
        environmentImageFileSizeBytes: 2345,
        auditMetadata: {
          productDetailSelection: "user_clicked_primary_anchor",
        },
        sourceRefs: ["capture:capture_1", "upload:char_123", "upload:env_123"],
        serverVerifiedProviderEvidence: {
          product: {
            status: "verified",
            verifiedBy: "test",
            evidenceRef: "stored-product-image:1:manual",
          },
          character: {
            status: "verified",
            verifiedBy: "test",
            evidenceRef: "verified-upload-reference:character:manual",
          },
          environment: {
            status: "verified",
            verifiedBy: "test",
            evidenceRef: "verified-upload-reference:environment:manual",
          },
        },
      },
    });

    expect(anchors.creationIntent).toBe("auto_review_video");
    expect(anchors.productImageRef).toBe("product-image-sha256:producthash");
    expect(anchors.characterImageRef).toBe("character-upload:char_123");
    expect(anchors.environmentImageRef).toBe("environment-upload:env_123");
    expect((anchors.sourceMetadata.product as any).uploadKey).toBe(
      "products/img_123.png"
    );
    expect(
      (anchors.sourceMetadata.character as any).fileEvidence
    ).toMatchObject({
      fileName: "person.png",
      fileType: "image/png",
      fileSizeBytes: 1234,
    });
    expect(anchors.auditRefs).toEqual(
      expect.arrayContaining([
        "product-image-sha256:producthash",
        "character-upload:char_123",
        "environment-upload:env_123",
        "capture:capture_1",
      ])
    );

    const metadata = buildFeature117ContractMetadataForTest({
      runId: "mar_1",
      tenantId: "tenant_1",
      auth: { userId: 42, tenantId: "tenant_1" } as any,
      bundle: productAccessBundle() as any,
      insights: [] as any,
      plan: basePlan as any,
      outputMode: "full_video",
      frameStrategy: "video_shot_start_stop",
      audioStrategy: "auto",
      resolvedAudioStrategy: "native_video_audio",
      referenceAnchors: anchors,
      externalOperationalRecoveryEvidence: readyOperationalRecoveryEvidence,
    });

    expect(
      (metadata.referenceAnchors as any).sourceMetadata.character
    ).toMatchObject({
      uploadKey: "anchors/char_123.png",
      hash: "charhash",
    });
    expect((metadata.productReferenceAssetPack as any).primaryRef).toBe(
      "product-image-sha256:producthash"
    );
    expect((metadata.productReferenceAssetPack as any).auditRefs).toContain(
      "product-image-sha256:producthash"
    );
    expect((metadata.characterIdentityAssetPack as any).auditRefs).toContain(
      "character-upload:char_123"
    );
    expect((metadata.environmentReferenceAssetPack as any).auditRefs).toContain(
      "environment-upload:env_123"
    );
  });

  it("requires a character anchor before starting Auto Review", () => {
    expect(() =>
      resolveMarketplaceAutoReviewReferenceAnchorsForTest({
        productTruth: {
          imageUrls: ["https://cdn.example.test/product.png"],
        },
        referenceAnchors: trustedAnchorInput({
          productImageUrl: "https://cdn.example.test/product.png",
          characterImageUrl: null,
        }),
      })
    ).toThrow(/ต้องเลือกรูปอ้างอิงตัวละคร/);
  });

  it("requires an environment anchor before starting Auto Review", () => {
    expect(() =>
      resolveMarketplaceAutoReviewReferenceAnchorsForTest({
        productTruth: {
          imageUrls: ["https://cdn.example.test/product.png"],
        },
        referenceAnchors: trustedAnchorInput({
          productImageUrl: "https://cdn.example.test/product.png",
          environmentImageUrl: null,
        }),
      })
    ).toThrow(/ต้องเลือกรูปอ้างอิงฉาก/);
  });

  it("rejects character and environment anchors that are not provider-ready", () => {
    expect(() =>
      resolveMarketplaceAutoReviewReferenceAnchorsForTest({
        productTruth: {
          imageUrls: ["https://cdn.example.test/product.png"],
        },
        referenceAnchors: trustedAnchorInput({
          productImageUrl: "https://cdn.example.test/product.png",
          characterImageUrl: "blob:person",
        }),
      })
    ).toThrow(/รูปตัวละครอ้างอิงยังไม่พร้อม/);

    expect(() =>
      resolveMarketplaceAutoReviewReferenceAnchorsForTest({
        productTruth: {
          imageUrls: ["https://cdn.example.test/product.png"],
        },
        referenceAnchors: trustedAnchorInput({
          productImageUrl: "https://cdn.example.test/product.png",
          environmentImageUrl: "blob:place",
        }),
      })
    ).toThrow(/รูปฉากอ้างอิงยังไม่พร้อม/);
  });

  it("rejects provider reference anchors that only have a URL without trusted evidence", () => {
    expect(() =>
      resolveMarketplaceAutoReviewReferenceAnchorsForTest({
        productTruth: {
          imageUrls: ["https://cdn.example.test/product.png"],
        },
        referenceAnchors: {
          productImageUrl: "https://cdn.example.test/product.png",
          characterImageUrl: "https://cdn.example.test/person.png",
          environmentImageUrl: "https://cdn.example.test/place.png",
        },
      })
    ).toThrow(/รูปตัวละครอ้างอิงยังไม่พร้อม/);

    expect(() =>
      approvedVisualReferenceUrlsForTest({
        metadata: {
          productReferenceAssetPack: {
            ...readyProductReferenceAssetPack,
            sourceMetadata: {},
            auditRefs: ["product-image:1:selected"],
          },
        },
        plan: basePlan as any,
        max: 5,
      })
    ).toThrow(/trusted provider-ready evidence/i);
  });

  it("rejects metadata-only provider reference anchors and product packs", () => {
    expect(() =>
      resolveMarketplaceAutoReviewReferenceAnchorsForTest({
        productTruth: {
          imageUrls: ["https://cdn.example.test/product.png"],
        },
        referenceAnchors: trustedAnchorInput({
          productImageUrl: "https://cdn.example.test/product.png",
          serverVerifiedProviderEvidence: undefined,
        }),
      })
    ).toThrow(/รูปตัวละครอ้างอิงยังไม่พร้อม/);

    expect(() =>
      approvedVisualReferenceUrlsForTest({
        metadata: {
          productReferenceAssetPack: {
            ...readyProductReferenceAssetPack,
            sourceMetadata: {
              role: "product",
              source: "marketplace_product_image",
              uploadKey: "products/img_1.png",
              hash: "producthash",
              id: "img_1",
            },
            auditRefs: [
              "marketplace-product-image:img_1",
              "product-image-sha256:producthash",
              "product-image-upload:products/img_1.png",
            ],
          },
        },
        plan: basePlan as any,
        max: 5,
      })
    ).toThrow(/trusted provider-ready evidence/i);
  });

  it("accepts runtime-verified anchors after server evidence is attached", () => {
    const anchors = resolveMarketplaceAutoReviewReferenceAnchorsForTest({
      productTruth: { imageUrls: ["https://cdn.example.test/product.png"] },
      referenceAnchors: trustedAnchorInput({
        productImageUrl: "https://cdn.example.test/product.png",
        characterImageUrl: "/uploads/anchors/person.png",
        characterImageSource: "user_upload",
        characterImageUploadKey: "anchors/person.png",
        characterImageFileName: "person.png",
        environmentImageUrl: "/storage/anchors/place.png",
        environmentImageSource: "user_upload",
        environmentImageUploadKey: "anchors/place.png",
        environmentImageFileName: "place.png",
      }),
    });

    expect(anchors.productImageRef).toMatch(/^product-image:/);
    expect(anchors.characterImageUrl).toBe("/uploads/anchors/person.png");
    expect(anchors.environmentImageUrl).toBe("/storage/anchors/place.png");
  });

  it("rejects foreign absolute upload path spoofing without server evidence", () => {
    expect(() =>
      resolveMarketplaceAutoReviewReferenceAnchorsForTest({
        productTruth: { imageUrls: ["https://cdn.example.test/product.png"] },
        referenceAnchors: {
          productImageUrl: "https://cdn.example.test/product.png",
          characterImageUrl: "https://evil.example/uploads/anchors/person.png",
          characterImageSource: "user_upload",
          characterImageUploadKey: "anchors/person.png",
          characterImageFileName: "person.png",
          environmentImageUrl: "https://evil.example/storage/anchors/place.png",
          environmentImageSource: "user_upload",
          environmentImageUploadKey: "anchors/place.png",
          environmentImageFileName: "place.png",
        },
      })
    ).toThrow(/รูปตัวละครอ้างอิงยังไม่พร้อม/);
  });

  it("rejects product anchors that are not attached to the product", () => {
    expect(() =>
      resolveMarketplaceAutoReviewReferenceAnchorsForTest({
        productTruth: {
          imageUrls: ["https://cdn.example.test/product-real.png"],
        },
        referenceAnchors: trustedAnchorInput({
          productImageUrl: "https://cdn.example.test/other-product.png",
        }),
      })
    ).toThrow(/ต้องเป็นรูปที่แนบอยู่กับสินค้านี้/);
  });

  it("uses selected product plus character and environment as approved visual references", () => {
    const productImageUrls = [
      "https://cdn.example.test/product-red.png",
      "https://cdn.example.test/product-blue.png",
    ];
    const plan = {
      ...basePlan,
      productTruth: {
        ...basePlan.productTruth,
        imageUrls: productImageUrls,
      },
    };
    const anchors = resolveMarketplaceAutoReviewReferenceAnchorsForTest({
      productTruth: { imageUrls: productImageUrls },
      referenceAnchors: trustedAnchorInput({
        productImageUrl: productImageUrls[1],
      }),
    });

    const urls = approvedVisualReferenceUrlsForTest({
      metadata: {
        referenceAnchors: anchors,
        productReferenceAssetPack: {
          ...readyProductReferenceAssetPack,
          selectedProductImageUrl: productImageUrls[1],
          status: "ready",
          providerUsePolicy: "allowed",
          primaryRef: anchors.productImageRef,
          supportingRefs: [],
          providerReferenceUrls: [productImageUrls[1]],
          sourceMetadata: (anchors.sourceMetadata as any).product,
          auditRefs: (anchors.sourceMetadata as any).product.auditRefs,
        },
        characterIdentityAssetPack: {
          ...readyCharacterIdentityAssetPack,
          referenceImageRefs: [anchors.characterImageRef],
          referenceImageUrls: [anchors.characterImageUrl],
          sourceMetadata: (anchors.sourceMetadata as any).character,
          auditRefs: (anchors.sourceMetadata as any).character.auditRefs,
        },
        environmentReferenceAssetPack: {
          ...readyEnvironmentReferenceAssetPack,
          referenceImageRefs: [anchors.environmentImageRef],
          referenceImageUrls: [anchors.environmentImageUrl],
          sourceMetadata: (anchors.sourceMetadata as any).environment,
          auditRefs: (anchors.sourceMetadata as any).environment.auditRefs,
        },
      },
      plan: plan as any,
      max: 5,
    });

    expect(urls).toEqual([
      productImageUrls[1],
      "https://cdn.example.test/person.png",
      "https://cdn.example.test/place.png",
    ]);
    expect(urls).not.toContain(productImageUrls[0]);
  });

  it("rejects corrupted product packs that include unselected supporting product references", () => {
    const productImageUrls = [
      "https://cdn.example.test/product-red.png",
      "https://cdn.example.test/product-blue.png",
    ];
    const anchors = resolveMarketplaceAutoReviewReferenceAnchorsForTest({
      productTruth: { imageUrls: productImageUrls },
      referenceAnchors: trustedAnchorInput({
        productImageUrl: productImageUrls[1],
      }),
    });

    expect(() =>
      approvedVisualReferenceUrlsForTest({
        metadata: {
          referenceAnchors: anchors,
          productReferenceAssetPack: {
            ...readyProductReferenceAssetPack,
            selectedProductImageUrl: productImageUrls[1],
            primaryRef: anchors.productImageRef,
            supportingRefs: ["product-image:1:unselected"],
            providerReferenceUrls: [productImageUrls[1]],
            sourceMetadata: (anchors.sourceMetadata as any).product,
            auditRefs: (anchors.sourceMetadata as any).product.auditRefs,
          },
        },
        plan: {
          ...basePlan,
          productTruth: {
            ...basePlan.productTruth,
            imageUrls: productImageUrls,
          },
        } as any,
        max: 5,
      })
    ).toThrow(/supporting product references are not allowed/i);
  });

  it("emits the stricter three-anchor contract metadata", () => {
    const anchors = resolveMarketplaceAutoReviewReferenceAnchorsForTest({
      productTruth: basePlan.productTruth,
      referenceAnchors: trustedAnchorInput(),
    });

    const metadata = buildFeature117ContractMetadataForTest({
      runId: "mar_1",
      tenantId: "tenant_1",
      auth: { userId: "user_1", tenantId: "tenant_1" } as any,
      bundle: {
        product: {
          metadataJson: {},
          accessType: "owner",
          captureId: "capture_1",
          createdAt: "2026-05-31T00:00:00.000Z",
          updatedAt: "2026-05-31T00:00:00.000Z",
        },
      } as any,
      insights: [] as any,
      plan: basePlan as any,
      outputMode: "storyboard_images",
      frameStrategy: "storyboard_3x3_split",
      audioStrategy: "auto",
      resolvedAudioStrategy: "silent",
      referenceAnchors: anchors,
      externalOperationalRecoveryEvidence: readyOperationalRecoveryEvidence,
    });

    expect((metadata.referenceAnchors as any).requiredRoles).toEqual([
      "product",
      "character",
      "environment",
    ]);
    expect((metadata.referenceAnchors as any).optionalRoles).toEqual([]);
    expect((metadata.characterIdentityAssetPack as any).status).toBe("ready");
    expect((metadata.environmentReferenceAssetPack as any).status).toBe(
      "ready"
    );
    expect(
      (metadata.environmentReferenceAssetPack as any).continuityDescriptors
    ).not.toEqual([]);
    expect((metadata.creativeNoveltyMemory as any).status).toBe("ready");
    expect((metadata.operationalRecoveryEvidence as any).status).toBe("passed");
    expect(
      (metadata.publishablePackageRequirements as any).requiredArtifactKinds
    ).toEqual(expect.arrayContaining(["transcript_text", "subtitle_sidecar"]));
  });

  it("blocks creative concept normalization when the planner returns fewer than 3 usable concepts", () => {
    let error: unknown;
    try {
      buildMarketplaceAutoReviewCreativeConceptSetForTest({
        parsed: {
          creativeConceptSet: {
            alternatives: [
              {
                conceptId: "concept-a",
                title: "จัดมุมหัวเตียงให้น่าใช้",
                angle: "problem solution",
              },
            ],
          },
        },
        fallbackPlan: basePlan as any,
        priorFingerprints: ["old-fingerprint"],
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as any).message).toMatch(
      /returned 1 usable concepts, expected at least 3/
    );
    expect((error as any).code).toBe(
      "creative_planner_concept_count_mismatch"
    );
    expect((error as any).actualConceptCount).toBe(1);
    expect((error as any).expectedMinimumConceptCount).toBe(3);
  });

  it("normalizes a 3-5 creative concept set without fallback expansion", () => {
    const set = buildMarketplaceAutoReviewCreativeConceptSetForTest({
      parsed: {
        creativeConceptSet: {
          alternatives: [
            {
              conceptId: "concept-a",
              title: "จัดมุมหัวเตียงให้น่าใช้",
              angle: "problem solution",
            },
            {
              conceptId: "concept-b",
              title: "เทียบพื้นที่หัวเตียง",
              angle: "space fit",
            },
            {
              conceptId: "concept-c",
              title: "พิสูจน์ชั้นวาง",
              angle: "detail proof",
            },
          ],
        },
      },
      fallbackPlan: basePlan as any,
      priorFingerprints: ["old-fingerprint"],
    }) as any;

    expect(set.alternatives.length).toBeGreaterThanOrEqual(3);
    expect(set.alternatives.length).toBeLessThanOrEqual(5);
    expect(set.selectedConceptId).toBe(set.alternatives[0].conceptId);
    expect(set.alternatives[0].noveltyFingerprint).toEqual(expect.any(String));
    expect(set.rejectedRationales.length).toBeGreaterThanOrEqual(2);
    expect(CreativeConceptSetSchema.parse(set).concepts.length).toBe(
      set.alternatives.length
    );
    expect(CreativeConceptSetSchema.parse(set).rejectedConceptIds).toEqual(
      set.alternatives.slice(1).map((item: any) => item.conceptId)
    );
    expect(
      (CreativeConceptSetSchema.parse(set) as any).alternatives.length
    ).toBe(set.alternatives.length);
    expect((set as any).fallbackExpanded).toBe(false);
  });

  it("builds a deterministic creative concept fallback when planner adapter is unavailable", () => {
    const set =
      buildMarketplaceAutoReviewCreativePlannerFallbackConceptSetForTest({
        fallbackPlan: basePlan as any,
        reason: "adapter_request_failed",
        noveltyMemory: { priorRunCount: 1 },
      }) as any;

    expect(set.status).toBe("ready_with_fallback");
    expect(set.fallbackExpanded).toBe(true);
    expect(set.fallbackReason).toBe("adapter_request_failed");
    expect(set.alternatives).toHaveLength(3);
    expect(set.selectedConceptId).toBe(set.alternatives[0].conceptId);
    expect(CreativeConceptSetSchema.parse(set).concepts).toHaveLength(3);
  });

  it("builds a stable per-run creative variation seed with prior angle avoidance", () => {
    const noveltyMemory = {
      priorRunCount: 2,
      priorRuns: [
        {
          selectedConceptId: "concept-old-problem",
          conceptFingerprints: ["fingerprint-a", "fingerprint-b"],
        },
      ],
    };
    const first = buildMarketplaceAutoReviewCreativeVariationSeedForTest({
      runId: "mar_seed_1",
      productId: "mp_1",
      requestedShotCount: 9,
      noveltyMemory,
    }) as any;
    const sameRun = buildMarketplaceAutoReviewCreativeVariationSeedForTest({
      runId: "mar_seed_1",
      productId: "mp_1",
      requestedShotCount: 9,
      noveltyMemory,
    }) as any;
    const nextRun = buildMarketplaceAutoReviewCreativeVariationSeedForTest({
      runId: "mar_seed_2",
      productId: "mp_1",
      requestedShotCount: 9,
      noveltyMemory,
    }) as any;

    expect(first).toMatchObject({
      seedId: expect.stringContaining("creative-seed:mp_1:"),
      journeyTemplateId: expect.any(String),
      hookPattern: expect.any(String),
      proofEmphasis: expect.any(String),
      sceneRhythm: expect.any(String),
      cameraPalette: expect.any(String),
      humanPresencePlan: expect.any(String),
      priorRunCount: 2,
    });
    expect(first.seedHash).toBe(sameRun.seedHash);
    expect(first.seedHash).not.toBe(nextRun.seedHash);
    expect(first.avoidPriorAngles).toEqual(
      expect.arrayContaining([
        "concept-old-problem",
        "fingerprint-a",
        "fingerprint-b",
      ])
    );
    expect(first.variantInstruction).toContain("product truth");
  });

  it("reselects a fresh concept when the first concept duplicates novelty memory", () => {
    const parsed = {
      creativeConceptSet: {
        alternatives: [
          {
            conceptId: "concept-a",
            title: "มุมจัดโต๊ะเดิม",
            angle: "same hook",
          },
          {
            conceptId: "concept-b",
            title: "มุมแก้ปัญหาใหม่",
            angle: "fresh hook",
          },
          {
            conceptId: "concept-c",
            title: "มุมเทียบพื้นที่",
            angle: "space hook",
          },
        ],
      },
    };
    const initial = buildMarketplaceAutoReviewCreativeConceptSetForTest({
      parsed,
      fallbackPlan: basePlan as any,
    }) as any;
    const reselected = buildMarketplaceAutoReviewCreativeConceptSetForTest({
      parsed,
      fallbackPlan: basePlan as any,
      priorFingerprints: [initial.alternatives[0].noveltyFingerprint],
    }) as any;

    expect(reselected.selectedConceptId).toBe("concept-b");
    expect(reselected.alternatives[0].conceptId).toBe("concept-b");
    expect(reselected.alternatives[1].noveltyStatus).toBe(
      "similar_to_prior_run"
    );
  });

  it("blocks creative concept selection when all concepts duplicate novelty memory", () => {
    const parsed = {
      creativeConceptSet: {
        alternatives: [
          {
            conceptId: "concept-a",
            title: "มุมจัดโต๊ะเดิม",
            angle: "same hook",
          },
          {
            conceptId: "concept-b",
            title: "มุมแก้ปัญหาใหม่",
            angle: "fresh hook",
          },
          {
            conceptId: "concept-c",
            title: "มุมเทียบพื้นที่",
            angle: "space hook",
          },
        ],
      },
    };
    const initial = buildMarketplaceAutoReviewCreativeConceptSetForTest({
      parsed,
      fallbackPlan: basePlan as any,
    }) as any;

    expect(() =>
      buildMarketplaceAutoReviewCreativeConceptSetForTest({
        parsed,
        fallbackPlan: basePlan as any,
        priorFingerprints: initial.alternatives.map(
          (item: any) => item.noveltyFingerprint
        ),
      })
    ).toThrow(/all concepts duplicate prior/i);
  });

  it("maps generated product claims to stable evidence refs and blocks unsupported claim categories", () => {
    const mapping = buildMarketplaceAutoReviewClaimEvidenceMappingForTest({
      plan: {
        ...basePlan,
        productTruth: {
          ...basePlan.productTruth,
          specs: { material: "wood", size: "40cm" },
        },
        voiceoverScript: [
          "Greenforst โต๊ะวางของข้างเตียง material: wood ราคาโปรถูกที่สุด",
          "เห็นผลทันทีเหมือนปาฏิหาริย์ ลดน้ำหนักและรักษาอาการปวด ผ่านการรับรองอย่างเป็นทางการ",
        ].join("\n"),
      } as any,
      metadata: {
        productReferenceAssetPack: readyProductReferenceAssetPack,
        productEvidenceLock: {
          evidenceRefs: ["product:mp_1", "insight:ins_1"],
        },
      } as any,
    }) as any;

    expect(mapping.claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimId: "claim:spec:material",
          evidenceRefs: expect.arrayContaining([
            "product:mp_1",
            "spec:material",
          ]),
        }),
      ])
    );
    expect(mapping.blockedClaims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reasonCode: "volatile_or_unsupported_claim_omitted",
          status: "blocked",
        }),
        expect.objectContaining({
          reasonCode: "miracle_absolute_claim_omitted",
          status: "blocked",
        }),
        expect.objectContaining({
          reasonCode: "health_body_result_claim_omitted",
          status: "blocked",
        }),
        expect.objectContaining({
          reasonCode: "certification_official_status_claim_omitted",
          status: "blocked",
        }),
      ])
    );
  });

  it("allows paid stages when unsupported claims were omitted from the script", () => {
    const metadata = readyRenderGateMetadata({
      claimEvidenceMapping: {
        status: "supported_with_omissions",
        blockedClaims: [
          {
            claimId: "blocked-unsupported:1",
            status: "blocked",
            reasonCode: "miracle_absolute_claim_omitted",
          },
        ],
      },
    });

    expect(() =>
      assertMarketplaceAutoReviewGovernanceReadyForTest(
        metadata,
        "visual_spend"
      )
    ).not.toThrow();
  });

  it("fails closed before paid stages when actionable blocked claims are present", () => {
    const metadata = readyRenderGateMetadata({
      claimEvidenceMapping: {
        status: "blocked",
        blockedClaims: [
          {
            claimId: "blocked-unsupported:1",
            status: "blocked",
            reasonCode: "unsupported_claim_still_present",
          },
        ],
      },
    });

    expect(() =>
      assertMarketplaceAutoReviewGovernanceReadyForTest(metadata, "video_spend")
    ).toThrow(/blocked claims/);
    expect(() =>
      assertMarketplaceAutoReviewGovernanceReadyForTest(metadata, "finalize")
    ).toThrow(/blocked claims/);
  });

  it("blocks visual spend when the environment pack is missing or incomplete", () => {
    const baseGovernance = {
      productReferenceAssetPack: {
        ...readyProductReferenceAssetPack,
      },
      characterIdentityAssetPack: readyCharacterIdentityAssetPack,
      evidenceInstructionFirewall: {
        status: "passed",
        firewallId: "firewall-1",
      },
      advertisingRulePack: readyAdvertisingRulePack,
      advertisingComplianceProfile: readyAdvertisingComplianceProfile,
      privacyEnvelope: { status: "passed", envelopeId: "privacy-1" },
      assetRightsEnvelope: { status: "passed", envelopeId: "rights-1" },
      campaignGovernance: readyCampaignGovernance,
      brandSellerVoicePolicy: { status: "passed", policyId: "brand-1" },
      humanReviewGate: readyHumanReviewGate,
      operationalRecoveryEvidence: readyOperationalRecoveryEvidence,
      inputChangeImpact: {
        status: "no_recheck_required",
        impactId: "input-impact-1",
      },
    };

    expect(() =>
      assertMarketplaceAutoReviewGovernanceReadyForTest(
        {
          ...baseGovernance,
          productReferenceAssetPack: {
            ...readyProductReferenceAssetPack,
            supportingRefs: ["product-image:1:unselected"],
          },
          environmentReferenceAssetPack: readyEnvironmentReferenceAssetPack,
        },
        "visual_spend"
      )
    ).toThrow(/unsupported product references/);

    expect(() =>
      assertMarketplaceAutoReviewGovernanceReadyForTest(
        baseGovernance,
        "visual_spend"
      )
    ).toThrow(/environment reference asset pack blocks visual generation/);

    expect(() =>
      assertMarketplaceAutoReviewGovernanceReadyForTest(
        {
          ...baseGovernance,
          environmentReferenceAssetPack: {
            ...readyEnvironmentReferenceAssetPack,
            continuityDescriptors: [],
          },
        },
        "visual_spend"
      )
    ).toThrow(/environment reference asset pack blocks visual generation/);

    expect(() =>
      assertMarketplaceAutoReviewGovernanceReadyForTest(
        {
          ...baseGovernance,
          environmentReferenceAssetPack: readyEnvironmentReferenceAssetPack,
        },
        "visual_spend"
      )
    ).not.toThrow();
  });

  it("fails closed when ready asset packs only have placeholder or missing audit evidence", () => {
    expect(() =>
      approvedVisualReferenceUrlsForTest({
        metadata: {
          productReferenceAssetPack: {
            ...readyProductReferenceAssetPack,
            auditRefs: ["placeholder:product"],
          },
        },
        plan: basePlan as any,
        max: 5,
      })
    ).toThrow(/missing durable audit refs/i);

    expect(() =>
      assertMarketplaceAutoReviewGovernanceReadyForTest(
        readyRenderGateMetadata({
          characterIdentityAssetPack: {
            ...readyCharacterIdentityAssetPack,
            auditRefs: ["synthetic-character-ref"],
          },
        }),
        "visual_spend"
      )
    ).toThrow(/character identity asset pack blocks visual generation/);

    expect(() =>
      assertMarketplaceAutoReviewGovernanceReadyForTest(
        readyRenderGateMetadata({
          environmentReferenceAssetPack: {
            ...readyEnvironmentReferenceAssetPack,
            auditRefs: [],
          },
        }),
        "visual_spend"
      )
    ).toThrow(/environment reference asset pack blocks visual generation/);
  });

  it("fails closed when compliance and governance gates use placeholder-like pass states", () => {
    expect(() =>
      assertMarketplaceAutoReviewGovernanceReadyForTest(
        readyRenderGateMetadata({
          advertisingRulePack: {
            status: "approved",
            fixtureReplayStatus: "passed",
            rulePackId: "ad-policy-1",
          },
        }),
        "visual_spend"
      )
    ).toThrow(/approved advertising rule pack/i);

    expect(() =>
      assertMarketplaceAutoReviewGovernanceReadyForTest(
        readyRenderGateMetadata({
          advertisingComplianceProfile: {
            status: "pass",
            profileId: "ad-profile-1",
          },
        }),
        "visual_spend"
      )
    ).toThrow(/advertising compliance profile/i);

    expect(() =>
      assertMarketplaceAutoReviewGovernanceReadyForTest(
        readyRenderGateMetadata({
          campaignGovernance: {
            status: "not_applicable",
            gateId: "campaign-1",
          },
        }),
        "visual_spend"
      )
    ).toThrow(/campaign governance requires passed status/i);

    expect(() =>
      assertMarketplaceAutoReviewGovernanceReadyForTest(
        readyRenderGateMetadata({
          humanReviewGate: {
            status: "not_required",
            gateId: "human-review-1",
          },
        }),
        "visual_spend"
      )
    ).toThrow(/human review gate requires passed/i);
  });

  it("requires verified operational recovery evidence, not placeholder refs", () => {
    expect(() =>
      assertMarketplaceAutoReviewGovernanceReadyForTest(
        readyRenderGateMetadata({
          operationalRecoveryEvidence: {
            status: "passed",
            providerCallbackAuthReplay: {
              evidenceRef: "provider-callback-auth:placeholder",
            },
            dlqBackpressure: { evidenceRef: "dlq-backpressure:placeholder" },
            leasesHeartbeat: { evidenceRef: "lease-heartbeat:placeholder" },
            migrationBackfillDryRun: {
              evidenceRef: "migration-dry-run:placeholder",
            },
            sloAlerts: { evidenceRef: "slo-alerts:placeholder" },
            operatorRunbook: { evidenceRef: "operator-runbook:placeholder" },
          },
        }),
        "visual_spend"
      )
    ).toThrow(/operational recovery evidence/);

    expect(() =>
      assertMarketplaceAutoReviewGovernanceReadyForTest(
        readyRenderGateMetadata({
          operationalRecoveryEvidence: readyOperationalRecoveryEvidence,
        }),
        "visual_spend"
      )
    ).not.toThrow();
  });

  it("allows initial planning to start before external operational recovery proof is injected", () => {
    const blockedRecoveryEvidence = {
      status: "blocked",
      reasonCodes: ["external_operational_recovery_evidence_required"],
    };

    expect(() =>
      assertMarketplaceAutoReviewGovernanceReadyForTest(
        readyRenderGateMetadata({
          operationalRecoveryEvidence: blockedRecoveryEvidence,
        }),
        "planning"
      )
    ).not.toThrow();
    expect(() =>
      assertMarketplaceAutoReviewGovernanceReadyForTest(
        readyRenderGateMetadata({
          operationalRecoveryEvidence: blockedRecoveryEvidence,
        }),
        "visual_spend"
      )
    ).toThrow(/operational recovery evidence/);
  });

  it("rejects synthetic run-id operational recovery refs without external evidence sources", () => {
    const syntheticRuntimeEvidence = {
      status: "passed",
      providerCallbackAuthReplay: {
        status: "verified",
        verifiedBy: "runtime",
        evidenceRef: "provider-callback-auth:mar_1:signed-replay-window",
        signatureRequired: true,
        replayWindowSeconds: 300,
        idempotencyKeyPolicy: "provider_task_id_plus_attempt",
      },
      dlqBackpressure: {
        status: "verified",
        verifiedBy: "runtime",
        evidenceRef: "dlq-backpressure:mar_1:direct-media",
        retryBudget: 2,
        backpressurePolicy: "queue_or_stage_waiting_provider_no_extra_spend",
      },
      leasesHeartbeat: {
        status: "verified",
        verifiedBy: "runtime",
        evidenceRef: "lease-heartbeat:mar_1:advance-loop",
        staleTimeoutMs: 43_200_000,
        recoveryAction: "requeue_advance_or_mark_recheck_required",
      },
      migrationBackfillDryRun: {
        status: "verified",
        verifiedBy: "runtime",
        evidenceRef: "migration-dry-run:mar_1:metadata-compatible",
        dryRunStatus: "metadata_only_no_migration",
      },
      sloAlerts: {
        status: "verified",
        verifiedBy: "runtime",
        evidenceRef: "slo-alerts:mar_1:feature117",
        alertRoutingRefs: ["alert-route:mar_1:marketplace-auto-review"],
        monitoredSignals: ["provider_callback_auth_failure", "dlq_count"],
      },
      operatorRunbook: {
        status: "verified",
        verifiedBy: "runtime",
        evidenceRef: "operator-runbook:mar_1:recovery-v1",
        runbookRef: "operator-runbook:mar_1:recovery-v1",
        actions: ["verify_callback_signature_and_replay_window"],
      },
    };

    expect(() =>
      assertMarketplaceAutoReviewGovernanceReadyForTest(
        readyRenderGateMetadata({
          operationalRecoveryEvidence: syntheticRuntimeEvidence,
        }),
        "visual_spend"
      )
    ).toThrow(/operational recovery evidence/);
  });

  it("downgrades metadata-created operational recovery evidence to blocked without injected proof", () => {
    const anchors = resolveMarketplaceAutoReviewReferenceAnchorsForTest({
      productTruth: basePlan.productTruth,
      referenceAnchors: trustedAnchorInput(),
    });
    const metadata = buildFeature117ContractMetadataForTest({
      runId: "mar_1",
      tenantId: "tenant_1",
      auth: { userId: "user_1", tenantId: "tenant_1" } as any,
      bundle: {
        product: {
          metadataJson: {},
          accessType: "owner",
          captureId: "capture_1",
          createdAt: "2026-05-31T00:00:00.000Z",
          updatedAt: "2026-05-31T00:00:00.000Z",
        },
      } as any,
      insights: [] as any,
      plan: basePlan as any,
      outputMode: "storyboard_images",
      frameStrategy: "storyboard_3x3_split",
      audioStrategy: "auto",
      resolvedAudioStrategy: "silent",
      referenceAnchors: anchors,
    });

    expect((metadata.operationalRecoveryEvidence as any).status).toBe(
      "blocked"
    );
  });

  it("promotes runtime table-backed lease evidence before paid visual spend", () => {
    const metadata = buildMarketplaceAutoReviewAutomationSnapshotsForTest({
      run: {
        id: "mar_1",
        currentStage: "image_generation",
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
      } as any,
      metadata: readyRenderGateMetadata({
        operationalRecoveryEvidence: {
          status: "blocked",
          reasonCodes: ["external_operational_recovery_evidence_required"],
        },
        automationControlPlane: {
          status: "claimed",
          backpressurePolicy:
            "only lease owner may advance; stale provider waits block before duplicate spend",
          lease: {
            leaseId: "advance-lease:mar_1:abc",
            ownerToken: "owner-token",
            ttlMs: 600_000,
          },
        },
      }) as any,
    });

    expect((metadata.operationalRecoveryEvidence as any).status).toBe("passed");
    expect(() =>
      assertMarketplaceAutoReviewGovernanceReadyForTest(
        metadata,
        "visual_spend"
      )
    ).not.toThrow();
  });

  it("does not block unchanged paid planning because operational recovery proof is not injected yet", () => {
    const bundle = productAccessBundle();
    const plan = buildMarketplaceAutoReviewProductTruthScaffoldForTest(
      bundle as any
    );
    const anchors = resolveMarketplaceAutoReviewReferenceAnchorsForTest({
      productTruth: plan.productTruth,
      referenceAnchors: trustedAnchorInput(),
    });
    const metadata = buildFeature117ContractMetadataForTest({
      runId: "mar_1",
      tenantId: "tenant_1",
      auth: { userId: 42, tenantId: "tenant_1" } as any,
      bundle: bundle as any,
      insights: [] as any,
      plan: plan as any,
      outputMode: "full_video",
      frameStrategy: "video_shot_start_stop",
      audioStrategy: "auto",
      resolvedAudioStrategy: "native_video_audio",
      referenceAnchors: anchors,
    });
    const freshness = collectPaidStageAuthorityFreshnessForTest({
      tenantId: "tenant_1",
      auth: { userId: 42, tenantId: "tenant_1" } as any,
      run: {
        id: "mar_1",
        productId: "mp_1",
        userId: 42,
        tenantId: "tenant_1",
        outputMode: "full_video",
        frameStrategy: "video_shot_start_stop",
        currentStage: "concept_story",
      } as any,
      metadata: metadata as any,
      bundle: bundle as any,
      phase: "planning",
    });

    expect(freshness.inputChangeImpact.status).toBe("no_recheck_required");
    expect(freshness.blockers).not.toContain(
      "input change impact requires recheck before continuing"
    );
    expect(freshness.blockers).not.toContain(
      "operational recovery evidence requires callback auth/replay, DLQ/backpressure, leases/heartbeat, dry-run, SLO alerts, and runbook refs"
    );
  });

  it("blocks audio spend and render when claim evidence contains blocked claims", () => {
    const metadata = readyRenderGateMetadata({
      claimEvidenceMapping: {
        status: "blocked",
        blockedClaims: [
          {
            claim: "miracle result",
            status: "blocked",
            reasonCode: "unsupported_claim_still_present",
          },
        ],
      },
    });

    expect(() =>
      assertMarketplaceAutoReviewGovernanceReadyForTest(metadata, "audio_spend")
    ).toThrow(/blocked claims/i);
    expect(() =>
      assertMarketplaceAutoReviewGovernanceReadyForTest(metadata, "render")
    ).toThrow(/blocked claims/i);
  });

  it("defaults full video on Veo 3.1 Lite to native video audio", () => {
    expect(
      resolveMarketplaceAutoReviewAudioStrategy({
        outputMode: "full_video",
        requested: "auto",
        videoModel: "veo3/generate-veo-3-video-lite",
      })
    ).toBe("native_video_audio");
  });

  it("preserves storyboard-only speech intent for storyboard review planning", () => {
    expect(
      resolveMarketplaceAutoReviewAudioStrategy({
        outputMode: "storyboard_images",
        requested: "native_video_audio",
        videoModel: "veo3/generate-veo-3-video-lite",
      })
    ).toBe("native_video_audio");
    expect(
      resolveMarketplaceAutoReviewAudioStrategy({
        outputMode: "storyboard_images",
        requested: "silent",
        videoModel: "veo3/generate-veo-3-video-lite",
      })
    ).toBe("silent");
  });

  it("keeps native speech as spoken dialogue only without prompt/reference padding", () => {
    const speech = buildMarketplaceAutoReviewNativeSpeechText({
      plan: basePlan,
      shot: baseShot,
      isLastShot: false,
    });

    expect(speech).toBe(baseShot.voiceover);
    expect(speech).not.toContain("โดยดูจากภาพจริง");
    expect(speech).not.toContain(basePlan.productTruth.productName);
    expect(speech).not.toContain("ไม่ปล่อยท้ายช็อตเงียบ");
  });

  it("adds Thai native dialogue pacing to Veo prompts", () => {
    const prompt = buildMarketplaceAutoReviewVideoPromptForTest({
      plan: basePlan as any,
      shot: baseShot as any,
      audioStrategy: "native_video_audio",
      isLastShot: false,
    });

    expect(prompt).toContain("Audio:");
    expect(prompt).toContain("Dialogue pacing");
    expect(prompt).toContain("9.5 วินาที");
    expect(prompt).toContain("พูดเป็นภาษาไทยว่า");
    expect(prompt).toContain("Voice:");
    expect(prompt).toContain("central Thai accent");
    expect(prompt).toMatch(/SFX|ASMR|foley|room tone/i);
    expect(prompt).toContain("No background music");
    expect(prompt).toContain("no copyrighted melody");
    expect(prompt).not.toContain("No audio.");
    expect(prompt).not.toContain("โดยดูจากภาพจริง");
    expect(prompt).not.toContain("ไม่ปล่อยท้ายช็อตเงียบ");
  });

  it("keeps Marketplace Auto Review video prompts focused on scene action camera audio and dialogue", () => {
    const prompt = buildMarketplaceAutoReviewVideoPromptForTest({
      plan: {
        ...basePlan,
        productTruth: {
          ...basePlan.productTruth,
          price: "123 THB",
          rating: "4.60",
          sold: "50,000",
          specs: {
            sellerLocationText: "Bangkok",
            stockText: "พร้อมส่ง",
            registrationNo: "ABC-123",
            shelfLife: "12 months",
            warnings: "Do not place near fire",
          },
        },
        productDetail: [
          "PRODUCT FACTS LOCK: Greenforst bedside shelf.",
          "Marketplace Data: price 123 THB, rating 4.60, sold 50,000.",
          "Reference Contract: strict product lock.",
          "Character Contract: same person.",
          "Environment Contract: same bedroom.",
        ].join(" "),
      } as any,
      shot: baseShot as any,
      audioStrategy: "native_video_audio",
      isLastShot: false,
      referenceMode: "start_stop",
    });

    expect(prompt).toContain("Scene:");
    expect(prompt).toContain("Action:");
    expect(prompt).toContain("Camera:");
    expect(prompt).toContain("Audio:");
    expect(prompt).toContain("Dialogue:");
    expect(prompt).toContain("Use @Image1 as start frame. Use @Image2 as stop frame.");
    for (const forbidden of [
      "PRODUCT FACTS",
      "Marketplace Data",
      "Seller Location",
      "Stock Text",
      "Registration",
      "Warning",
      "Shelf Life",
      "Rating",
      "Sold Count",
      "Reference Contract",
      "Character Contract",
      "Environment Contract",
      "Price signal",
      "Rating signal",
      "Sold signal",
      "sellerLocationText",
      "stockText",
    ]) {
      expect(prompt).not.toContain(forbidden);
    }
  });

  it("keeps native video audio enabled even when the shot voiceover is empty", () => {
    const prompt = buildMarketplaceAutoReviewVideoPromptForTest({
      plan: basePlan as any,
      shot: { ...baseShot, voiceover: "" } as any,
      audioStrategy: "native_video_audio",
      isLastShot: false,
    });

    expect(prompt).toContain("Native audio.");
    expect(prompt).toContain("Voice:");
    expect(prompt).toContain("Dialogue:");
    expect(prompt).toContain("พูดเป็นภาษาไทยว่า");
    expect(prompt).not.toContain("No audio.");
    expect(prompt).not.toContain("No spoken dialogue.");
  });

  it("treats 3x3 split video prompts as one storyboard frame plus product references", () => {
    const prompt = buildMarketplaceAutoReviewVideoPromptForTest({
      plan: basePlan as any,
      shot: baseShot as any,
      audioStrategy: "native_video_audio",
      isLastShot: false,
      referenceMode: "single_storyboard_frame",
    });

    expect(prompt).toContain("Use @Image1 as the storyboard frame.");
    expect(prompt).not.toContain("@Image1 is the single storyboard frame");
    expect(prompt).not.toContain("not a stop/end frame");
    expect(prompt).not.toContain("product references only");
    expect(prompt).not.toContain(
      "Use @Image1 as start frame and @Image2 as stop/end frame."
    );
    expect(prompt).not.toContain("provided start and stop frames");
  });

  it("keeps separate TTS video prompts visual-only", () => {
    const prompt = buildMarketplaceAutoReviewVideoPromptForTest({
      plan: basePlan as any,
      shot: baseShot as any,
      audioStrategy: "separate_tts_voiceover",
      isLastShot: false,
    });

    expect(prompt).toContain("External audio workflow");
    expect(prompt).toContain("No audio.");
    expect(prompt).toContain("No spoken dialogue.");
    expect(prompt).not.toContain("พูดเป็นภาษาไทยว่า");
  });

  it("fails video assembly when any expected shot clip is missing", () => {
    expect(() =>
      assertCompleteMarketplaceAutoReviewVideoClips({
        expectedCount: 3,
        clipUrls: ["/a.mp4", "", "/c.mp4"],
        unitIds: ["shot-1-video", "shot-2-video", "shot-3-video"],
      })
    ).toThrow(/shot-2-video/);
  });

  it("keeps partial image submit refs durable for cancellation and refund reconciliation", () => {
    const metadata = buildMarketplaceAutoReviewDirectMediaSubmitMetadataForTest(
      {
        mediaType: "image",
        attemptId: "direct-image-1",
        metadata: {
          pendingImageRepairUnits: [
            { unitId: "shot-3-start", role: "start_frame" },
          ],
        },
        submittedRefs: [
          {
            unitId: "shot-1-start",
            mediaType: "image",
            stageKey: "image_generation",
            role: "start_frame",
            shotId: "shot-1",
            shotOrder: 1,
            attempt: 1,
            taskId: "img_task_1",
            providerTaskId: "img_provider_1",
            model: "image-model",
            status: "processing",
            creditAmount: 15,
            creditTransactionId: 101,
            creditIdempotencyKey: "img-credit-1",
            submittedAt: "2026-05-31T00:00:00.000Z",
          },
          {
            unitId: "shot-2-start",
            mediaType: "image",
            stageKey: "image_generation",
            role: "start_frame",
            shotId: "shot-2",
            shotOrder: 2,
            attempt: 1,
            taskId: "submit-failed:shot-2-start:1",
            model: "image-model",
            status: "failed",
            creditAmount: 15,
            creditTransactionId: 102,
            creditIdempotencyKey: "img-credit-2",
            refundTransactionId: 202,
            submittedAt: "2026-05-31T00:00:01.000Z",
          },
        ],
      }
    );

    expect(metadata.directImageTasks).toHaveLength(2);
    expect(metadata.imageProviderTaskIds).toContain("img_provider_1");
    expect(metadata.directImageTasks?.[1].refundTransactionId).toBe(202);
    expect(metadata.pendingImageRepairUnits).toHaveLength(1);
  });

  it("keeps 3x3 storyboard repair scoped to the single grid image", () => {
    const pendingRepairUnits = [
      {
        unitId: "shot-1-storyboard-repair",
        role: "storyboard_frame",
        shotId: "shot-1",
        shotOrder: 1,
      },
      {
        unitId: "storyboard-grid-image",
        role: "storyboard_grid",
      },
      {
        unitId: "shot-1-start",
        role: "start_frame",
        shotId: "shot-1",
        shotOrder: 1,
      },
    ] as any[];

    expect(
      filterMarketplaceAutoReviewImageRepairUnitsForTest({
        frameStrategy: "storyboard_3x3_split",
        pendingRepairUnits,
      })
    ).toEqual([{ unitId: "storyboard-grid-image", role: "storyboard_grid" }]);
    expect(
      filterMarketplaceAutoReviewImageRepairUnitsForTest({
        frameStrategy: "video_shot_start_stop",
        pendingRepairUnits,
      })
    ).toHaveLength(3);
  });

  it("creates grid-level repair instructions for missing 3x3 split frames", () => {
    const unit = buildMarketplaceAutoReviewStoryboardGridRepairUnitForTest({
      reasonCodes: ["missing_storyboard_grid_split_frame_url"],
      repairInstruction:
        "Regenerate the complete 3x3 storyboard grid and split it again.",
    });

    expect(unit).toMatchObject({
      unitId: "storyboard-grid-image",
      role: "storyboard_grid",
      repairReasonCodes: ["missing_storyboard_grid_split_frame_url"],
    });
    expect(unit.repairInstruction).toContain("3x3 storyboard grid");
    expect(unit.repairInstruction).toContain("Never output one standalone");
    expect(unit.repairInstruction).toContain("Product reference lock");
    expect(unit.repairInstruction).toContain("exactly 3 equal-width columns");
    expect(unit.repairInstruction).toContain("no collage/masonry layout");
  });

  it("applies the selected overlay text policy to 3x3 image prompts", () => {
    const plan = {
      ...basePlan,
      voiceoverScript:
        "1. 0-5s Hook: เปิดปัญหา\n2. 5-10s Solution: แนะนำสินค้า",
      shots: [baseShot],
    } as any;
    const noTextPrompt = buildMarketplaceAutoReview3x3StoryboardPromptForTest({
      plan,
      overlayTextMode: "no_text",
    });
    const allowTextPrompt =
      buildMarketplaceAutoReview3x3StoryboardPromptForTest({
        plan,
        overlayTextMode: "allow_text",
    });

    expect(noTextPrompt).toContain("No text, captions, labels");
    expect(noTextPrompt).toContain("skill: product-reference-storyboard");
    expect(noTextPrompt).toContain(
      "generation_mode: multi_frame_storyboard"
    );
    expect(noTextPrompt).toContain(
      "storyboard_layout_preset: canvas_9_16_grid_3x3_frame_9_16_exact"
    );
    expect(noTextPrompt).toContain("storyboard_guide:");
    expect(noTextPrompt).toContain("voiceover_script:");
    expect(noTextPrompt).toContain("product_detail:");
    expect(noTextPrompt).toContain("reference_product_images:");
    expect(noTextPrompt).toContain("production_concept_details:");
    expect(noTextPrompt).toContain("SHOT-BY-SHOT STORYBOARD PROMPT");
    expect((noTextPrompt.match(/Frame \d/g) ?? []).length).toBeGreaterThanOrEqual(9);
    expect(noTextPrompt.length).toBeLessThanOrEqual(4900);
    expect(allowTextPrompt.length).toBeLessThanOrEqual(4900);
    expect(noTextPrompt.match(/VISUAL:/g)).toHaveLength(9);
    expect(noTextPrompt.match(/CAMERA\/LIGHT\/DEPTH:/g)).toHaveLength(1);
    expect(noTextPrompt.match(/STORY MATCH:/g)).toHaveLength(9);
    expect(noTextPrompt.match(/PRODUCT VERIFY:/g)).toHaveLength(1);
    expect(noTextPrompt.match(/HUMAN REALISM:/g)).toHaveLength(1);
    expect(noTextPrompt).toContain("exactly 3 equal-width columns");
    expect(noTextPrompt).toContain("exactly 3 equal-height rows");
    expect(noTextPrompt).toContain("no collage/masonry layout");
    expect(noTextPrompt).toContain("no separator lines");
    expect(noTextPrompt).toContain("no visible dividers");
    expect(noTextPrompt).toContain("no white borders");
    expect(noTextPrompt).toContain("no measurement overlays");
    expect(noTextPrompt).toContain("Prohibit marketplace/mobile app screenshots");
    expect(noTextPrompt).toContain("cart/checkout flows");
    expect(noTextPrompt).toContain("no timecodes");
    expect(noTextPrompt).toContain("no black caption bars");
    expect(noTextPrompt).not.toMatch(/\b0-5s\b/);
    expect(noTextPrompt).not.toMatch(/\b5-10s\b/);
    expect(noTextPrompt).not.toContain("VOICEOVER / DIALOGUE CONTRACT");
    expect(allowTextPrompt).toContain("Short Thai overlay text is allowed");
    expect(allowTextPrompt).toContain("exactly 3 equal-width columns");
    expect(allowTextPrompt).toContain("no visible dividers");
    expect(allowTextPrompt).toContain("no collage/masonry layout");
    expect(allowTextPrompt).toContain("Never include video seconds");
    expect(allowTextPrompt).toContain("Prohibit marketplace/mobile app screenshots");
    expect(allowTextPrompt).toContain("Prohibit Shopee");
    expect(allowTextPrompt).not.toMatch(/\b0-5s\b/);
    expect(allowTextPrompt).not.toMatch(/\b5-10s\b/);
  });

  it("sanitizes review/rating beats before building 3x3 image prompts", () => {
    const plan = {
      ...basePlan,
      shots: [
        {
          ...baseShot,
          visual:
            "Digital overlay of stars and reviews floating above a tablet screen",
          camera: "Overlay of review text and stars, scroll UI close-up",
          voiceover:
            "ลูกค้ารีวิวดีมาก แต่ภาพต้องเป็นการใช้งานจริง ไม่ใช่หน้าจอ",
        },
      ],
    } as any;

    const prompt = buildMarketplaceAutoReview3x3StoryboardPromptForTest({
      plan,
      overlayTextMode: "no_text",
    });

    expect(prompt).toContain("PROOF/REVIEW VISUAL LOCK");
    expect(prompt).toContain("show real product use");
    expect(prompt).not.toContain(
      "Digital overlay of stars and reviews floating above a tablet screen"
    );
    expect(prompt).not.toContain(
      "Overlay of review text and stars, scroll UI close-up"
    );
  });

  it("preflights 3x3 prompts before provider submission using the Media Studio skill field contract", () => {
    const plan = {
      ...basePlan,
      shots: [baseShot],
    } as any;
    const unit = {
      unitId: "storyboard-grid-image",
      role: "storyboard_grid",
    } as any;

    const prepared = prepareMarketplaceAutoReviewImagePromptForTest({
      plan,
      unit,
      overlayTextMode: "no_text",
    });

    expect(prepared.preflight).toMatchObject({
      status: "passed",
      ruleSet:
        "marketplace-auto-review:image-prompt-preflight:product-reference-storyboard:v1",
      blockers: [],
    });
    expect(prepared.preflight.score).toBeGreaterThanOrEqual(90);
    expect(prepared.prompt).toContain("skill: product-reference-storyboard");
    expect(prepared.prompt).toContain(
      "storyboard_layout_preset: canvas_9_16_grid_3x3_frame_9_16_exact"
    );
    expect(prepared.prompt).toContain("one single 9:16 image canvas");
    expect(prepared.prompt).toContain("strict 3x3 grid");
    expect(prepared.prompt).toContain("exactly 9 vertical frames");
    expect(prepared.prompt).toContain("storyboard_guide:");
    expect(prepared.prompt).toContain("voiceover_script:");
    expect(prepared.prompt).toContain("product_detail:");
    expect(prepared.prompt).toContain("reference_product_images:");
    expect(prepared.prompt).not.toContain("PROMPT PREFLIGHT REPAIR PATCH");
    expect(prepared.prompt.length).toBeLessThanOrEqual(4900);
  });

  it("builds product-reference-storyboard skill inputs with schema-shaped role image arrays and detected product category", () => {
    const plan = {
      ...basePlan,
      shots: [baseShot],
    } as any;
    const metadata = readyFeature117Metadata();
    const referenceImageGroups =
      productReferenceStoryboardReferenceImageGroupsForTest({
        metadata: metadata as any,
        plan,
        max: 5,
      });

    const inputs = buildProductReferenceStoryboardSkillInputsForTest({
      plan,
      unit: {
        unitId: "storyboard-grid-image",
        role: "storyboard_grid",
      } as any,
      overlayTextMode: "no_text",
      referenceImageGroups,
      promptSkillAttempt: 1,
    });

    expect(inferProductReferenceStoryboardCategoryForTest(plan)).toBe(
      "furniture"
    );
    expect(inputs).toMatchObject({
      generation_mode: "multi_frame_storyboard",
      storyboard_layout_preset: "canvas_9_16_grid_3x3_frame_9_16_exact",
      aspect_ratio: "9:16",
      product_category: "furniture",
      image_text_mode: "no_text",
      cinematic_style: "cinematic_realism",
      marketplace_platform: "shopee",
      product_shop_id: "seller-1",
      product_item_id: "2162",
      product_title: "Greenforst โต๊ะวางของข้างเตียง",
      product_source_url: "https://example.com/product",
    });
    expect(inputs.reference_product_images).toEqual([
      "https://example.com/product.png",
    ]);
    expect(inputs.reference_character_images).toEqual([
      "https://cdn.example.test/person.png",
    ]);
    expect(inputs.reference_environment_images).toEqual([
      "https://cdn.example.test/place.png",
    ]);
    expect(Array.isArray(inputs.reference_product_images)).toBe(true);
    expect(typeof inputs.reference_product_images).not.toBe("string");
    expect(inputs.reference_image_role_counts).toEqual({
      product: 1,
      character: 1,
      environment: 1,
      total: 3,
    });
    expect(String(inputs.storyboard_guide)).toContain("Product drift guard");
    expect(String(inputs.production_concept_details)).toContain(
      "Do not show any alternate bedside table"
    );
    expect(String(inputs.production_concept_details)).toContain(
      "Main storyboard category: furniture"
    );
    expect(String(inputs.production_concept_details)).toContain(
      "Marketplace category path: บ้านและไลฟ์สไตล์ > เฟอร์นิเจอร์"
    );
  });

  it("records comparable skill input snapshots and marks repair attempts as different inputs", () => {
    const plan = {
      ...basePlan,
      shots: [baseShot],
    } as any;
    const metadata = readyFeature117Metadata();
    const referenceImageGroups =
      productReferenceStoryboardReferenceImageGroupsForTest({
        metadata: metadata as any,
        plan,
        max: 5,
      });
    const firstInputs = buildProductReferenceStoryboardSkillInputsForTest({
      plan,
      unit: {
        unitId: "storyboard-grid-image",
        role: "storyboard_grid",
      } as any,
      overlayTextMode: "no_text",
      referenceImageGroups,
      promptSkillAttempt: 1,
    });
    const repairInputs = buildProductReferenceStoryboardSkillInputsForTest({
      plan,
      unit: {
        unitId: "storyboard-grid-image",
        role: "storyboard_grid",
        repairInstruction:
          "Regenerate with stricter product and character reference match.",
        repairReasonCodes: ["productMismatch", "characterConsistencyUnsafe"],
      } as any,
      overlayTextMode: "no_text",
      referenceImageGroups,
      promptSkillAttempt: 1,
    });

    const firstSnapshot =
      buildProductReferenceStoryboardSkillInputSnapshotForTest(firstInputs);
    const repairSnapshot =
      buildProductReferenceStoryboardSkillInputSnapshotForTest(repairInputs);

    expect(firstSnapshot).toMatchObject({
      generationMode: "multi_frame_storyboard",
      layoutPreset: "canvas_9_16_grid_3x3_frame_9_16_exact",
      aspectRatio: "9:16",
      productCategory: "furniture",
      hasRepairInstruction: false,
      referenceImageRoleCounts: {
        product: 1,
        character: 1,
        environment: 1,
        total: 3,
      },
    });
    expect(repairSnapshot).toMatchObject({
      hasRepairInstruction: true,
      referenceImageRoleCounts: {
        product: 1,
        character: 1,
        environment: 1,
        total: 3,
      },
    });
    expect(repairSnapshot.userInputHash).not.toBe(firstSnapshot.userInputHash);
    expect(repairSnapshot.repairInstructionHash).toBeTruthy();
  });

  it("uses captured product category context when resolving the storyboard skill category", () => {
    const plan = {
      ...basePlan,
      productTruth: {
        ...basePlan.productTruth,
        productName: "Greenforst รุ่น F-2122",
        categoryText: "เฟอร์นิเจอร์",
        categoryPath: ["บ้านและไลฟ์สไตล์", "เฟอร์นิเจอร์"],
      },
      productDetail:
        "PRODUCT FACTS LOCK: Greenforst รุ่น F-2122 ชั้นวางของข้างเตียง ขนาดเล็ก วัสดุไม้",
      shots: [baseShot],
    } as any;

    expect(inferProductReferenceStoryboardCategoryForTest(plan)).toBe(
      "furniture"
    );
  });

  it("uses the confirmed main storyboard category before marketplace subcategory keywords", () => {
    const plan = {
      ...basePlan,
      productTruth: {
        ...basePlan.productTruth,
        productName:
          "RK Royal Kludge RK S98 ไฟแมช 98 คีย์โหมด RGB มีสาย บลูทูธ",
        productCategory: "computer_laptop",
        categoryText: "คีย์บอร์ดสำหรับเล่นเกมส์",
        categoryPath: [
          "คอมพิวเตอร์และแล็ปท็อป",
          "อุปกรณ์สำหรับเล่นเกม",
          "คีย์บอร์ดสำหรับเล่นเกมส์",
        ],
      },
      productDetail:
        "PRODUCT FACTS LOCK: RK Royal Kludge RK S98 mechanical keyboard. Gaming accessory evidence is marketplace path only; main storyboard category is computer_laptop.",
      shots: [baseShot],
    } as any;

    const inputs = buildProductReferenceStoryboardSkillInputsForTest({
      plan,
      unit: {
        unitId: "storyboard-grid-image",
        role: "storyboard_grid",
      } as any,
      overlayTextMode: "no_text",
      referenceImageGroups: {
        product: ["https://example.com/keyboard.png"],
        character: [],
        environment: [],
        all: ["https://example.com/keyboard.png"],
      },
      promptSkillAttempt: 1,
    });

    expect(inferProductReferenceStoryboardCategoryForTest(plan)).toBe(
      "computer_laptop"
    );
    expect(inputs.product_category).toBe("computer_laptop");
    expect(String(inputs.production_concept_details)).toContain(
      "Captured marketplace category: คีย์บอร์ดสำหรับเล่นเกมส์"
    );
    expect(String(inputs.production_concept_details)).toContain(
      "Marketplace category path: คอมพิวเตอร์และแล็ปท็อป > อุปกรณ์สำหรับเล่นเกม > คีย์บอร์ดสำหรับเล่นเกมส์"
    );
  });

  it("keeps a full 9-shot product-reference storyboard prompt under the image provider limit without fallback rewriting", () => {
    const longShots = Array.from({ length: 9 }, (_item, index) => ({
      ...baseShot,
      id: `shot-${index + 1}`,
      order: index + 1,
      title: `ช็อตที่ ${index + 1} เล่าเหตุผลและรายละเอียดสินค้าแบบต่อเนื่อง`,
      visual:
        "แสดงโต๊ะข้างเตียงไม้สีอ่อนในห้องนอนจริง มีคนใช้งานหรือมือหยิบของ จัดองค์ประกอบให้เห็นชั้นวาง โครงขา และสัดส่วนสินค้าอย่างชัดเจน",
      camera:
        "กล้องแนวโฆษณาสินค้า แสงธรรมชาติจากหน้าต่าง ระยะภาพสลับ wide medium close-up และมุมพิสูจน์รายละเอียด",
      movement:
        "slow push-in แล้วตัดต่อเหมือนภาพนิ่งจากรีลสินค้า",
      voiceover:
        "เล่าประโยชน์สินค้าโดยไม่ให้ข้อความหรือเวลาไปปรากฏบนภาพ และคุมให้ตรงกับปัญหาของผู้ซื้อ",
      productRole:
        "ต้องเห็นโต๊ะวางของข้างเตียงไม้สีอ่อน 3 ชั้น ขา 4 มุม ไม่มีลิ้นชัก ไม่มีโลโก้ตลาด ไม่มีหน้าจอแอป",
    }));
    const plan = {
      ...basePlan,
      title: "Transform Your Bedside With Exact Product Storytelling",
      storyboardGuide:
        "1. เปิดปัญหาหัวเตียงรก 2. ขยายความไม่สะดวก 3. แนะนำโต๊ะ 4. พิสูจน์ชั้นวาง 5. ใช้งานจริง 6. ผลลัพธ์เป็นระเบียบ 7. ตรวจขนาด 8. ยืนยันความคุ้มค่า 9. CTA",
      voiceoverScript:
        "1. โต๊ะข้างเตียงรกแก้ได้ 2. ของหาง่ายขึ้น 3. ใช้โต๊ะไม้สีอ่อน 4. ชั้นวางช่วยจัดของ 5. วางหนังสือแก้วและโคมไฟ 6. ห้องดูเรียบร้อย 7. ขนาดเหมาะกับเตียง 8. เหมาะกับห้องเล็ก 9. พร้อมสั่งซื้อ",
      productDetail:
        "PRODUCT FACTS LOCK: Greenforst โต๊ะวางของข้างเตียงไม้สีอ่อน 3 ชั้น เปิดโล่ง ขา 4 มุม ขนาดประมาณ 30x30x40 ซม. ห้ามทำเป็นตู้มีลิ้นชัก ห้ามมีหน้าจอ marketplace ห้ามเพิ่มโลโก้หรือราคา Character anchor supplied.",
      shots: longShots,
    } as any;

    const prepared = prepareMarketplaceAutoReviewImagePromptForTest({
      plan,
      unit: {
        unitId: "storyboard-grid-image",
        role: "storyboard_grid",
      } as any,
      overlayTextMode: "no_text",
    });

    expect(prepared.preflight.status).toBe("passed");
    expect(prepared.preflight.blockers).not.toContain(
      "prompt_too_long_for_image_provider"
    );
    expect(prepared.prompt.length).toBeLessThanOrEqual(4900);
    expect(prepared.prompt.match(/VISUAL:/g)).toHaveLength(9);
    expect(prepared.prompt).toContain("exactly 9 vertical frames");
    expect(prepared.prompt).not.toContain("PROMPT PREFLIGHT REPAIR PATCH");
  });

  it("rejects malformed storyboard prompts before credits or provider calls", () => {
    const plan = {
      ...basePlan,
      shots: [baseShot],
    } as any;
    const result = validateMarketplaceAutoReviewImagePromptPreflightForTest({
      plan,
      unit: {
        unitId: "storyboard-grid-image",
        role: "storyboard_grid",
      } as any,
      overlayTextMode: "no_text",
      prompt:
        "Create a beautiful collage of product photos with black separators and a 30x30x40cm dimension label.",
    });

    expect(result.status).toBe("failed");
    expect(result.blockers).toContain("skill_contract_missing");
    expect(result.blockers).toContain("storyboard_guide_field_missing");
    expect(result.blockers).toContain("reference_product_images_field_missing");
    expect(result.blockers).toContain("frame_1_missing");
  });

  it("accepts skill-generated prompts whose field contract is proven by runtime audit", () => {
    const plan = {
      ...basePlan,
      shots: [baseShot],
    } as any;
    const prompt = [
      "SHOT-BY-SHOT STORYBOARD PROMPT:",
      "Create one single 9:16 image as a strict 3x3 grid with exactly 9 frames, exactly 9 vertical frames, exactly 3 equal-width columns, exactly 3 equal-height rows, no collage/masonry layout, no separator lines, no visible dividers, cinematic realism lock, product reference lock, text rendering policy: no text, no dimension text, no timecodes, no marketplace/mobile app screenshots.",
      "CAMERA/LIGHT/DEPTH: cinematic commercial product-film look, 35mm lens feel, warm practical window light, soft shadows, depth separation, grounded wood highlights.",
      "PRODUCT VERIFY: Greenforst 3-tier open bedside shelf; 3 levels; 4 vertical posts; light wood finish; compact bedside scale; no drawers; no doors.",
      ...Array.from(
        { length: 9 },
        (_item, index) =>
          `Frame ${index + 1}: VISUAL: product story beat. STORY MATCH: follows shot ${index + 1}.`
      ),
    ].join("\n");

    const result = validateMarketplaceAutoReviewImagePromptPreflightForTest({
      plan,
      unit: {
        unitId: "storyboard-grid-image",
        role: "storyboard_grid",
      } as any,
      overlayTextMode: "no_text",
      prompt,
      skillRuntime: {
        selectedSkill: "product-reference-storyboard",
        fallbackUsed: false,
        generationMode: "multi_frame_storyboard",
        layoutPreset: "canvas_9_16_grid_3x3_frame_9_16_exact",
        aspectRatio: "9:16",
        productCategory: "furniture",
        marketplacePlatform: "shopee",
        referenceProductImageCount: 1,
        referenceCharacterImageCount: 1,
        referenceEnvironmentImageCount: 1,
        schemaAudit: {
          status: "passed",
        },
        inputKeys: [
          "generation_mode",
          "product_category",
          "storyboard_layout_preset",
          "aspect_ratio",
          "storyboard_guide",
          "voiceover_script",
          "product_detail",
          "reference_product_images",
          "reference_character_images",
          "reference_environment_images",
          "production_concept_details",
          "marketplace_platform",
          "product_item_id",
          "product_source_url",
          "product_title",
        ],
      },
    });

    expect(result.status).toBe("passed");
    expect(result.blockers).not.toContain("skill_contract_missing");
    expect(result.blockers).not.toContain("generation_mode_missing");
    expect(result.blockers).not.toContain("layout_preset_missing");
    expect(result.blockers).not.toContain("storyboard_guide_field_missing");
  });

  it("warns but does not block skill-generated storyboard prompts with incomplete frame coverage", () => {
    const plan = {
      ...basePlan,
      shots: [baseShot],
    } as any;
    const prompt = [
      "SHOT-BY-SHOT STORYBOARD PROMPT:",
      "Create one single 9:16 image as a strict 3x3 grid with exactly 9 frames, exactly 9 vertical frames, exactly 3 equal-width columns, exactly 3 equal-height rows, no collage/masonry layout, no separator lines, no visible dividers, cinematic realism lock, product reference lock, text rendering policy: no text, no dimension text, no timecodes, no marketplace/mobile app screenshots.",
      "CAMERA/LIGHT/DEPTH: cinematic commercial product-film look, warm practical window light, soft shadows.",
      "PRODUCT VERIFY: Product visual lock from @Image1 / first attached product reference image; generated product must match the exact same product; Greenforst 3-tier open bedside shelf; 3 levels; 4 vertical posts.",
      "Frame 1: visual-only product story panel.",
      "Frame 2: visual-only product story panel.",
      "Frame 3: visual-only product story panel.",
      "Frame 4: visual-only product story panel.",
      "Frame 5: visual-only product story panel.",
    ].join("\n");

    const result = validateMarketplaceAutoReviewImagePromptPreflightForTest({
      plan,
      unit: {
        unitId: "storyboard-grid-image",
        role: "storyboard_grid",
      } as any,
      overlayTextMode: "no_text",
      prompt,
      skillRuntime: {
        selectedSkill: "product-reference-storyboard",
        fallbackUsed: false,
        generationMode: "multi_frame_storyboard",
        layoutPreset: "canvas_9_16_grid_3x3_frame_9_16_exact",
        aspectRatio: "9:16",
        productCategory: "furniture",
        referenceProductImageCount: 1,
        schemaAudit: { status: "passed" },
        inputKeys: ["reference_product_images"],
      },
    });

    expect(result.status).toBe("passed");
    expect(result.blockers).not.toContain("frame_6_missing");
    expect(result.warnings).toContain("frame_6_missing");
  });

  it("warns but does not stop repair attempts when a skill prompt omits the exact no-text phrase", () => {
    const plan = {
      ...basePlan,
      shots: [baseShot],
    } as any;
    const prompt = [
      "OUTPUT FORMAT LOCK: Plain prompt text only.",
      "SHOT-BY-SHOT STORYBOARD PROMPT:",
      "Create one single 9:16 image as a strict 3x3 grid with exactly 9 frames, exactly 9 vertical frames, exactly 3 equal-width columns, exactly 3 equal-height rows, no collage/masonry layout, no separator lines, no visible dividers, cinematic realism lock, product reference lock, text rendering policy.",
      "TEXT RENDERING POLICY: Avoid visible captions, labels, dimension text, timecodes, and marketplace/mobile app screenshots.",
      "CAMERA/LIGHT/DEPTH: cinematic commercial product-film look, warm practical window light, soft shadows.",
      "PRODUCT VERIFY: Product visual lock from @Image1 / first attached product reference image; generated product must match the exact same product; Greenforst 3-tier open bedside shelf; 3 levels; 4 vertical posts.",
      ...Array.from(
        { length: 9 },
        (_item, index) => `Frame ${index + 1}: visual-only product story panel.`
      ),
    ].join("\n");

    const result = validateMarketplaceAutoReviewImagePromptPreflightForTest({
      plan,
      unit: {
        unitId: "storyboard-grid-image",
        role: "storyboard_grid",
      } as any,
      overlayTextMode: "no_text",
      prompt,
      skillRuntime: {
        selectedSkill: "product-reference-storyboard",
        fallbackUsed: false,
        generationMode: "multi_frame_storyboard",
        layoutPreset: "canvas_9_16_grid_3x3_frame_9_16_exact",
        aspectRatio: "9:16",
        productCategory: "furniture",
        referenceProductImageCount: 1,
        schemaAudit: { status: "passed" },
        inputKeys: ["reference_product_images"],
      },
    });

    expect(result.status).toBe("passed");
    expect(result.blockers).not.toContain("no_text_policy_missing");
    expect(result.warnings).toContain("no_text_policy_missing");
  });

  it("blocks 3x3 storyboard image prompts that do not explicitly request 9 vertical frames", () => {
    const plan = {
      ...basePlan,
      shots: [baseShot],
    } as any;
    const unit = {
      unitId: "storyboard-grid-image",
      role: "storyboard_grid",
    } as any;
    const prompt = buildMarketplaceAutoReview3x3StoryboardPromptForTest({
      plan,
      overlayTextMode: "no_text",
    }).replace("exactly 9 vertical frames, ", "");

    const result = validateMarketplaceAutoReviewImagePromptPreflightForTest({
      plan,
      unit,
      overlayTextMode: "no_text",
      prompt,
    });

    expect(result.status).toBe("failed");
    expect(result.blockers).toContain("vertical_frame_count_missing");
  });

  it("builds Storyboard Review start/stop clips as a continuous frame chain", () => {
    const plan = {
      ...basePlan,
      shots: [
        { ...baseShot, id: "shot-1", order: 1 },
        { ...baseShot, id: "shot-2", order: 2, title: "ขยายปัญหา" },
        { ...baseShot, id: "shot-3", order: 3, title: "สินค้าเข้ามา" },
      ],
    } as any;
    const output = buildMarketplaceAutoReviewStoryboardReviewOutputForTest({
      run: {
        id: "mar_1",
        productionRunId: "prod_1",
        outputMode: "storyboard_images",
        frameStrategy: "video_shot_start_stop",
      } as any,
      plan,
      metadata: {
        startFrameUrls: [
          "https://cdn.example.test/frame-1.png",
          "https://cdn.example.test/unused-shot-2-start.png",
          "https://cdn.example.test/unused-shot-3-start.png",
        ],
        stopFrameUrls: [
          "https://cdn.example.test/frame-2.png",
          "https://cdn.example.test/frame-3.png",
          "https://cdn.example.test/frame-4.png",
        ],
        resolvedAudioStrategy: "silent",
      } as any,
    });

    expect(output.clips).toMatchObject([
      {
        id: "shot-1",
        status: "completed",
        url: "https://cdn.example.test/frame-1.png",
        startFrameUrl: "https://cdn.example.test/frame-1.png",
        stopFrameUrl: "https://cdn.example.test/frame-2.png",
      },
      {
        id: "shot-2",
        status: "completed",
        url: "https://cdn.example.test/frame-2.png",
        startFrameUrl: "https://cdn.example.test/frame-2.png",
        stopFrameUrl: "https://cdn.example.test/frame-3.png",
      },
      {
        id: "shot-3",
        status: "completed",
        url: "https://cdn.example.test/frame-3.png",
        startFrameUrl: "https://cdn.example.test/frame-3.png",
        stopFrameUrl: "https://cdn.example.test/frame-4.png",
      },
    ]);
    expect(output.clips[1].startFrameUrl).toBe(output.clips[0].stopFrameUrl);
    expect(output.clips[2].startFrameUrl).toBe(output.clips[1].stopFrameUrl);
  });

  it("creates Storyboard Review video placeholders without copying start frames into result URLs", () => {
    const plan = {
      ...basePlan,
      shots: [
        { ...baseShot, id: "shot-1", order: 1 },
        { ...baseShot, id: "shot-2", order: 2, title: "ขยายปัญหา" },
      ],
    } as any;
    const tasks = buildMarketplaceAutoReviewStoryboardReviewTasksForTest({
      run: {
        id: "mar_1",
        productionRunId: "prod_1",
        outputMode: "storyboard_images",
        frameStrategy: "video_shot_start_stop",
      } as any,
      plan,
      metadata: {
        startFrameUrls: [
          "https://cdn.example.test/frame-1.png",
          "https://cdn.example.test/unused-shot-2-start.png",
        ],
        stopFrameUrls: [
          "https://cdn.example.test/frame-2.png",
          "https://cdn.example.test/frame-3.png",
        ],
        resolvedAudioStrategy: "silent",
      } as any,
    });

    expect(tasks[0]).toMatchObject({
      status: "queued",
      type: "video",
      model: "veo3/generate-veo-3-video-lite",
      thumbnailUrl: "https://cdn.example.test/frame-1.png",
      startFrameUrl: "https://cdn.example.test/frame-1.png",
      stopFrameUrl: "https://cdn.example.test/frame-2.png",
      statusDetail: "Waiting for generated video clip",
    });
    expect(tasks[0]).not.toHaveProperty("url");
    expect(tasks[0]?.storyboardContext?.referenceImages).toEqual([
      { url: "https://cdn.example.test/frame-1.png" },
      { url: "https://cdn.example.test/frame-2.png" },
    ]);
    expect(tasks[0]?.storyboardContext?.extraParams?.referenceFrameRoles).toEqual([
      "start",
      "stop",
    ]);
  });

  it("builds 3x3 Storyboard Review clips from adjacent cut frames", () => {
    const plan = {
      ...basePlan,
      shots: [
        { ...baseShot, id: "shot-1", order: 1 },
        { ...baseShot, id: "shot-2", order: 2, title: "ขยายปัญหา" },
        { ...baseShot, id: "shot-3", order: 3, title: "สินค้าเข้ามา" },
      ],
    } as any;
    const output = buildMarketplaceAutoReviewStoryboardReviewOutputForTest({
      run: {
        id: "mar_1",
        productionRunId: "prod_1",
        outputMode: "storyboard_images",
        frameStrategy: "storyboard_3x3_split",
      } as any,
      plan,
      metadata: {
        storyboardFrameUrls: [
          "https://cdn.example.test/grid-1.png",
          "https://cdn.example.test/grid-2.png",
          "https://cdn.example.test/grid-3.png",
        ],
        startFrameUrls: ["https://cdn.example.test/stale-start.png"],
        stopFrameUrls: ["https://cdn.example.test/stale-stop.png"],
        resolvedAudioStrategy: "silent",
      } as any,
    });

    expect(output.clips).toMatchObject([
      {
        id: "shot-1",
        status: "completed",
        startFrameUrl: "https://cdn.example.test/grid-1.png",
        stopFrameUrl: "https://cdn.example.test/grid-2.png",
      },
      {
        id: "shot-2",
        status: "completed",
        startFrameUrl: "https://cdn.example.test/grid-2.png",
        stopFrameUrl: "https://cdn.example.test/grid-3.png",
      },
      {
        id: "shot-3",
        status: "completed",
        startFrameUrl: "https://cdn.example.test/grid-3.png",
        stopFrameUrl: null,
      },
    ]);
    expect(output.clips[0].prompt).toContain(
      "Use @Image1 as start frame. Use @Image2 as stop frame."
    );
    expect(output.clips[0].prompt).not.toContain("Reference contract");
    expect(output.clips[0].metadata.referenceMode).toBe("start_stop");
    expect(output.clips[2].prompt).toContain(
      "Use @Image1 as the storyboard frame."
    );
    expect(output.clips[2].metadata.referenceMode).toBe(
      "single_storyboard_frame"
    );
    expect(output.clips[0].metadata.startStopSource).toBe(
      "storyboard_adjacent_frames"
    );

    const tasks = buildMarketplaceAutoReviewStoryboardReviewTasksForTest({
      run: {
        id: "mar_1",
        productionRunId: "prod_1",
        outputMode: "storyboard_images",
        frameStrategy: "storyboard_3x3_split",
      } as any,
      plan,
      metadata: {
        storyboardFrameUrls: [
          "https://cdn.example.test/grid-1.png",
          "https://cdn.example.test/grid-2.png",
          "https://cdn.example.test/grid-3.png",
        ],
        resolvedAudioStrategy: "silent",
      } as any,
    });
    expect(tasks[0]).toMatchObject({
      status: "queued",
      type: "video",
      thumbnailUrl: "https://cdn.example.test/grid-1.png",
      startFrameUrl: "https://cdn.example.test/grid-1.png",
      stopFrameUrl: "https://cdn.example.test/grid-2.png",
    });
    expect(tasks[0]).not.toHaveProperty("url");
    expect(tasks[0]?.storyboardContext?.referenceImages).toEqual([
      { url: "https://cdn.example.test/grid-1.png" },
      { url: "https://cdn.example.test/grid-2.png" },
    ]);
    expect(tasks[0]?.storyboardContext?.extraParams?.referenceFrameRoles).toEqual([
      "start",
      "stop",
    ]);
    expect(tasks[2]?.storyboardContext?.extraParams?.referenceFrameRoles).toEqual([
      "start",
    ]);
  });

  it("does not fake missing generated start/stop frames from storyboard frames", () => {
    const plan = {
      ...basePlan,
      shots: [
        { ...baseShot, id: "shot-1", order: 1 },
        { ...baseShot, id: "shot-2", order: 2, title: "ขยายปัญหา" },
      ],
    } as any;
    const output = buildMarketplaceAutoReviewStoryboardReviewOutputForTest({
      run: {
        id: "mar_1",
        productionRunId: "prod_1",
        outputMode: "storyboard_images",
        frameStrategy: "video_shot_start_stop",
      } as any,
      plan,
      metadata: {
        startFrameUrls: ["https://cdn.example.test/start-1.png"],
        stopFrameUrls: ["https://cdn.example.test/stop-1.png"],
        storyboardFrameUrls: [
          "https://cdn.example.test/grid-1.png",
          "https://cdn.example.test/grid-2.png",
        ],
        resolvedAudioStrategy: "silent",
      } as any,
    });

    expect(output.clips[0]).toMatchObject({
      status: "completed",
      startFrameUrl: "https://cdn.example.test/grid-1.png",
      stopFrameUrl: null,
    });
    expect(output.clips[0].metadata.referenceMode).toBe(
      "single_storyboard_frame"
    );
    expect(output.clips[0].prompt).toContain(
      "Use @Image1 as the storyboard frame."
    );
    expect(output.clips[0].prompt).not.toContain("stop/end frame");
    expect(output.clips[0].prompt).not.toContain("Reference contract");
  });

  it("includes targeted repair instructions in 3x3 image prompts", () => {
    const prompt = buildMarketplaceAutoReview3x3StoryboardPromptForTest({
      plan: { ...basePlan, shots: [baseShot] } as any,
      overlayTextMode: "no_text",
      repairInstruction:
        "Regenerate without Shopee UI and include the approved presenter face.",
    });

    expect(prompt).toContain("TARGETED GRID REPAIR:");
    expect(prompt).toContain("without Shopee UI");
    expect(prompt).toContain("approved presenter face");
    expect(prompt).toContain("REPAIR SCOPE LOCK:");
    expect(prompt).toContain("never output a single standalone scene");
    expect(prompt).toContain("PRODUCT VISUAL SOURCE LOCK:");
  });

  it("requires clear character-anchored face presence when character anchor exists", () => {
    const plan = {
      ...basePlan,
      shots: [baseShot],
      productDetail:
        "Character anchor character-reference:demo: if a presenter/person appears, preserve the same identity, face structure, hair, body proportions, and styling from the supplied user reference across every shot. Do not morph the face between shots. In this run, include this character's clear face in at least 1, ideally 2-3 active frames as a hard identity anchor.",
    } as any;
    const prompt = buildMarketplaceAutoReview3x3StoryboardPromptForTest({
      plan,
      overlayTextMode: "no_text",
    });

    expect(prompt).toContain("CHARACTER ANCHOR PRESENCE LOCK:");
    expect(prompt).toContain("at least 1 active frame");
    expect(prompt).toContain("ideally 2-3 active frames");
  });

  it("adds an inset crop when splitting 3x3 storyboard grids", () => {
    const rects = splitStoryboardGridRectsForTest({
      sourceWidth: 1203,
      sourceHeight: 1800,
    });

    expect(rects).toHaveLength(9);
    const first = rects[0];
    const second = rects[1];
    const fourth = rects[3];
    expect(first.left).toBeGreaterThan(0);
    expect(first.top).toBeGreaterThan(0);
    expect(second.left).toBeGreaterThan(first.left + first.width);
    expect(fourth.top).toBeGreaterThan(first.top + first.height);
    expect(first.width).toBeLessThan(Math.floor(1203 / 3));
    expect(first.height).toBeLessThan(Math.floor(1800 / 3));
  });

  it("versions split 3x3 frame storage by source grid URL", () => {
    const first = storyboardGridFrameStorageKeyForTest({
      tenantId: "tenant-1",
      runId: "mar_grid",
      sourceUrl: "https://example.com/grid-a.png",
      shotNumber: 1,
    });
    const repaired = storyboardGridFrameStorageKeyForTest({
      tenantId: "tenant-1",
      runId: "mar_grid",
      sourceUrl: "https://example.com/grid-b.png",
      shotNumber: 1,
    });

    expect(first).not.toEqual(repaired);
    expect(first).toContain("/frames/grid-");
    expect(repaired).toContain("/shot-01.png");
  });

  it("converts failed 3x3 storyboard vision QA into a grid repair unit", () => {
    const unit = buildMarketplaceAutoReviewStoryboardGridQaRepairUnitForTest({
      qa: {
        verdict: "repair",
        reasonCodes: ["marketplace_ui_detected", "character_anchor_missing"],
        repairInstruction:
          "Regenerate the complete grid without Shopee UI and include the approved presenter face.",
      },
    });

    expect(unit).toMatchObject({
      unitId: "storyboard-grid-image",
      role: "storyboard_grid",
      repairReasonCodes: [
        "marketplace_ui_detected",
        "character_anchor_missing",
      ],
    });
    expect(unit.repairInstruction).toContain("without Shopee UI");
  });

  it("accepts image QA with warnings after the repair budget is exhausted", () => {
    const repairUnit = buildMarketplaceAutoReviewStoryboardGridQaRepairUnitForTest({
      qa: {
        qaEnvelopeId: "vision-qa:mar_1:shot-1",
        shotId: "shot-1",
        verdict: "repair",
        reasonCodes: ["productMismatch", "continuityIssue"],
        repairInstruction: "Regenerate the grid with stricter product lock.",
      },
    });
    const refs = [1, 2, 3].map(attempt => ({
      unitId: "storyboard-grid-image",
      mediaType: "image",
      stageKey: "image_generation",
      role: "storyboard_grid",
      attempt,
      taskId: `task-${attempt}`,
      status: "completed",
      resultUrl: `https://cdn.example.test/grid-${attempt}.png`,
    }));

    expect(
      isMarketplaceAutoReviewImageRepairBudgetExhaustedForTest({
        repairUnits: [repairUnit],
        refs: refs as any,
      })
    ).toBe(true);

    const metadata = acceptMarketplaceAutoReviewImageQaWithWarningsForTest({
      metadata: {
        pendingImageRepairUnits: [repairUnit],
        generatedMediaAcceptanceEnvelope: {
          acceptanceEnvelopeId: "acceptance:image:old",
          status: "repair_required",
          warningCount: 1,
        },
        shotFrameVisionQaEnvelopes: [
          { qaEnvelopeId: "vision-qa:mar_1:shot-1", verdict: "repair" },
        ],
      },
      repairUnits: [repairUnit],
      refs: refs as any,
    });

    expect(metadata.pendingImageRepairUnits).toEqual([]);
    expect(metadata.generatedMediaAcceptanceEnvelope).toMatchObject({
      status: "accepted_with_warnings",
      userReviewRequired: true,
      overrideReason: "repair_budget_exhausted_storyboard_review_required",
    });
    expect(metadata.imageQaReviewOverride).toMatchObject({
      status: "accepted_with_warnings",
      reason: "repair_budget_exhausted_storyboard_review_required",
      repairUnitIds: ["storyboard-grid-image"],
    });
  });

  it("scores image generation attempts with negative QA and repair penalties", () => {
    const repairUnit = buildMarketplaceAutoReviewStoryboardGridQaRepairUnitForTest({
      qa: {
        qaEnvelopeId: "vision-qa:mar_1:shot-1",
        shotId: "shot-1",
        verdict: "repair",
        score: 88,
        reasonCodes: ["productMismatch"],
        failedFrameRoles: ["storyboard_frame"],
        repairInstruction: "Regenerate with stricter product match.",
      },
    });
    const reviews = buildMarketplaceAutoReviewImageAttemptReviewsForTest({
      metadata: {
        storyboardGridUrl: "https://cdn.example.test/grid-1.png",
        storyboardFrameUrls: [
          "https://cdn.example.test/grid-1-shot-1.png",
          "https://cdn.example.test/grid-1-shot-2.png",
        ],
      },
      refs: [
        {
          unitId: "storyboard-grid-image",
          mediaType: "image",
          stageKey: "image_generation",
          role: "storyboard_grid",
          attempt: 1,
          taskId: "task-1",
          status: "completed",
          resultUrl: "https://cdn.example.test/grid-1.png",
          providerSubmitEvidence: {
            promptAudit: {
              auditId: "prompt-audit-1",
              promptHash: "hash-1",
              promptLengthChars: 1200,
            },
          },
        },
      ] as any,
      qaEnvelopes: [
        {
          qaEnvelopeId: "vision-qa:mar_1:shot-1",
          verdict: "repair",
          score: 88,
          reasonCodes: ["productMismatch"],
          failedFrameRoles: ["storyboard_frame"],
        },
      ],
      repairUnits: [repairUnit],
      status: "repair_required",
    });

    expect(reviews).toHaveLength(1);
    const review = reviews[0] as Record<string, unknown>;
    expect(review).toMatchObject({
      attempt: 1,
      qualityScore: 34,
      negativeScore: 54,
      storyboardGridUrl: "https://cdn.example.test/grid-1.png",
      selectionEligible: true,
    });
    expect(review.scoreBreakdown).toMatchObject({
      baseScore: 88,
      reasonCodePenalty: 6,
      severeReasonPenalty: 24,
      repairPenalty: 12,
      failedFramePenalty: 4,
      statusPenalty: 8,
    });
  });

  it("selects the best scored image attempt instead of the latest attempt", () => {
    const metadata = selectMarketplaceAutoReviewBestImageAttemptForTest({
      metadata: {
        generatedMediaAcceptanceEnvelope: {
          acceptanceEnvelopeId: "acceptance:image:mar_test",
          status: "accepted_with_warnings",
        },
        storyboardGridUrl: "https://cdn.example.test/grid-3.png",
        storyboardFrameUrls: ["https://cdn.example.test/grid-3-shot-1.png"],
        imageAttemptReviews: [
          {
            reviewId: "image-attempt-review:mar_test:1",
            attempt: 1,
            status: "repair_required",
            qualityScore: 72,
            negativeScore: 10,
            resultUrls: ["https://cdn.example.test/grid-1.png"],
            storyboardGridUrl: "https://cdn.example.test/grid-1.png",
            storyboardFrameUrls: [
              "https://cdn.example.test/grid-1-shot-1.png",
            ],
          },
          {
            reviewId: "image-attempt-review:mar_test:3",
            attempt: 3,
            status: "accepted_with_warnings",
            qualityScore: 41,
            negativeScore: 34,
            resultUrls: ["https://cdn.example.test/grid-3.png"],
            storyboardGridUrl: "https://cdn.example.test/grid-3.png",
            storyboardFrameUrls: [
              "https://cdn.example.test/grid-3-shot-1.png",
            ],
          },
        ],
      },
    });

    expect(metadata.selectedImageAttempt).toBe(1);
    expect(metadata.selectedImageAttemptScore).toBe(72);
    expect(metadata.storyboardGridUrl).toBe(
      "https://cdn.example.test/grid-1.png"
    );
    expect(metadata.storyboardFrameUrls).toEqual([
      "https://cdn.example.test/grid-1-shot-1.png",
    ]);
    expect(metadata.generatedMediaAcceptanceEnvelope).toMatchObject({
      selectedImageAttempt: 1,
      selectedImageAttemptScore: 72,
      selectedImageAttemptReviewId: "image-attempt-review:mar_test:1",
    });
  });

  it("accepts the best available image attempt when a later provider repair attempt fails", () => {
    const metadata =
      acceptMarketplaceAutoReviewBestImageAttemptAfterProviderFailureForTest({
        metadata: {
          generatedMediaAcceptanceEnvelope: {
            acceptanceEnvelopeId: "acceptance:image:mar_test",
            status: "repair_required",
          },
          storyboardGridUrl: "https://cdn.example.test/grid-2.png",
          storyboardFrameUrls: ["https://cdn.example.test/grid-2-shot-1.png"],
          pendingImageRepairUnits: [
            {
              unitId: "storyboard-grid-image",
              role: "storyboard_grid",
              repairReasonCodes: ["productMismatch"],
            },
          ],
          imageAttemptReviews: [
            {
              reviewId: "image-attempt-review:mar_test:1",
              attempt: 1,
              status: "repair_required",
              qualityScore: 72,
              negativeScore: 10,
              resultUrls: ["https://cdn.example.test/grid-1.png"],
              storyboardGridUrl: "https://cdn.example.test/grid-1.png",
              storyboardFrameUrls: [
                "https://cdn.example.test/grid-1-shot-1.png",
              ],
            },
            {
              reviewId: "image-attempt-review:mar_test:2",
              attempt: 2,
              status: "repair_required",
              qualityScore: 35,
              negativeScore: 55,
              resultUrls: ["https://cdn.example.test/grid-2.png"],
              storyboardGridUrl: "https://cdn.example.test/grid-2.png",
              storyboardFrameUrls: [
                "https://cdn.example.test/grid-2-shot-1.png",
              ],
            },
          ],
        },
        failedRef: {
          unitId: "storyboard-grid-image",
          mediaType: "image",
          stageKey: "image_generation",
          role: "storyboard_grid",
          attempt: 3,
          taskId: "task-3",
          providerTaskId: "provider-task-3",
          model: "google-banana-2",
          status: "failed",
          errorMessage:
            "No images found in AI response. The image was filtered out because it violated provider policy.",
        } as any,
      });

    expect(metadata).not.toBeNull();
    expect(metadata?.pendingImageRepairUnits).toEqual([]);
    expect(metadata?.selectedImageAttempt).toBe(1);
    expect(metadata?.storyboardGridUrl).toBe(
      "https://cdn.example.test/grid-1.png"
    );
    expect(metadata?.storyboardFrameUrls).toEqual([
      "https://cdn.example.test/grid-1-shot-1.png",
    ]);
    expect(metadata?.generatedMediaAcceptanceEnvelope).toMatchObject({
      status: "accepted_with_warnings",
      userReviewRequired: true,
      overrideReason:
        "provider_repair_attempt_failed_using_best_available_attempt",
      failedAttempt: 3,
      selectedImageAttempt: 1,
    });
    expect(metadata?.imageQaReviewOverride).toMatchObject({
      status: "accepted_with_warnings",
      reason: "provider_repair_attempt_failed_using_best_available_attempt",
      selectedImageAttempt: 1,
      failedAttempt: 3,
    });
  });

  it("keeps the earliest image attempt when failed repair attempts tie on score", () => {
    const metadata = selectMarketplaceAutoReviewBestImageAttemptForTest({
      metadata: {
        generatedMediaAcceptanceEnvelope: {
          acceptanceEnvelopeId: "acceptance:image:mar_test",
          status: "accepted_with_warnings",
        },
        storyboardGridUrl: "https://cdn.example.test/grid-3.png",
        storyboardFrameUrls: ["https://cdn.example.test/grid-3-shot-1.png"],
        imageAttemptReviews: [1, 2, 3].map(attempt => ({
          reviewId: `image-attempt-review:mar_test:${attempt}`,
          attempt,
          status: "repair_required",
          qualityScore: 0,
          negativeScore: 104,
          reasonCodes: ["productMismatch"],
          resultUrls: [`https://cdn.example.test/grid-${attempt}.png`],
          storyboardGridUrl: `https://cdn.example.test/grid-${attempt}.png`,
          storyboardFrameUrls: [
            `https://cdn.example.test/grid-${attempt}-shot-1.png`,
          ],
        })),
      },
    });

    expect(metadata.selectedImageAttempt).toBe(1);
    expect(metadata.storyboardGridUrl).toBe(
      "https://cdn.example.test/grid-1.png"
    );
  });

  it("reuses the first passed storyboard-grid prompt audit for repair attempts", () => {
    const promptAudit = reusableStoryboardGridPromptAuditForTest({
      refs: [
        {
          unitId: "storyboard-grid-image",
          mediaType: "image",
          stageKey: "image_generation",
          role: "storyboard_grid",
          attempt: 1,
          taskId: "task-1",
          model: "google-banana-2",
          status: "completed",
          submittedAt: "2026-06-03T00:00:00.000Z",
          providerSubmitEvidence: {
            promptAudit: {
              attempt: 1,
              prompt: "first stable 3x3 prompt",
              promptHash: "hash-1",
              promptPreflight: { status: "passed" },
            },
          },
        },
        {
          unitId: "storyboard-grid-image",
          mediaType: "image",
          stageKey: "image_generation",
          role: "storyboard_grid",
          attempt: 2,
          taskId: "task-2",
          model: "google-banana-2",
          status: "completed",
          submittedAt: "2026-06-03T00:01:00.000Z",
          providerSubmitEvidence: {
            promptAudit: {
              attempt: 2,
              prompt: "repair drift prompt",
              promptHash: "hash-2",
              promptPreflight: { status: "passed" },
            },
          },
        },
      ] as any,
    });

    expect(promptAudit).toMatchObject({
      attempt: 1,
      prompt: "first stable 3x3 prompt",
      promptHash: "hash-1",
    });
  });

  it("normalizes repairing stage evidence from QA and repair refs in output", () => {
    const evidence =
      normalizeMarketplaceAutoReviewStageCompletionEvidenceForTest({
        runId: "mar_repair",
        stageKey: "image_generation",
        stageStatus: "repairing",
        output: {
          qaVerdictRefs: ["vision-qa:mar_repair:shot-1"],
          repairRefs: ["storyboard-grid-image"],
          statusDetail: {
            reasonCodes: ["vision_qa_repair_required"],
          },
        },
      });

    expect(evidence).toMatchObject({
      status: "repair_required",
      qaVerdictRefs: ["vision-qa:mar_repair:shot-1"],
      missingRefs: [
        "repair:storyboard-grid-image",
        "reason:vision_qa_repair_required",
      ],
    });
    expect(evidence?.requiredRefs).toEqual(
      expect.arrayContaining(["missingRefs", "qaVerdictRefs"])
    );
    expect(
      MarketplaceAutoReviewStageCompletionEvidenceSchema.parse({
        evidenceId: "stage-evidence:mar_repair:image_generation:test",
        runId: "mar_repair",
        stageKey: "image_generation",
        status: evidence?.status,
        requiredRefs: evidence?.requiredRefs ?? [],
        artifactRefs: evidence?.artifactRefs ?? [],
        qaVerdictRefs: evidence?.qaVerdictRefs ?? [],
        creditRefs: evidence?.creditRefs ?? [],
        lineageRefs: evidence?.lineageRefs ?? [],
        policyRefs: evidence?.policyRefs ?? [],
        acceptanceRefs: evidence?.acceptanceRefs ?? [],
        missingRefs: evidence?.missingRefs ?? [],
        warningApprovalRefs: evidence?.warningApprovalRefs ?? [],
        createdAt: "2026-06-02T00:00:00.000Z",
      }).status
    ).toBe("repair_required");
  });

  it("normalizes completed image stage evidence from output buckets", () => {
    const evidence =
      normalizeMarketplaceAutoReviewStageCompletionEvidenceForTest({
        runId: "mar_complete_image",
        stageKey: "image_generation",
        stageStatus: "completed_with_warnings",
        output: {
          frameUrls: ["https://cdn.example.test/frame-1.png"],
          qaVerdictRefs: ["vision-qa:mar_complete_image:shot-1"],
          statusDetail: {
            reasonCodes: [
              "repair_budget_exhausted_storyboard_review_required",
            ],
          },
        },
      });

    expect(evidence).toMatchObject({
      status: "warning_complete",
      missingRefs: [],
    });
    expect(evidence?.artifactRefs).toEqual(["frame:storyboard:1"]);
    expect(evidence?.warningApprovalRefs).toEqual(
      expect.arrayContaining([
        "warning:repair_budget_exhausted_storyboard_review_required",
      ])
    );
    expect(
      MarketplaceAutoReviewStageCompletionEvidenceSchema.parse({
        evidenceId:
          "stage-evidence:mar_complete_image:image_generation:test",
        runId: "mar_complete_image",
        stageKey: "image_generation",
        status: evidence?.status,
        requiredRefs: evidence?.requiredRefs ?? [],
        artifactRefs: evidence?.artifactRefs ?? [],
        qaVerdictRefs: evidence?.qaVerdictRefs ?? [],
        creditRefs: evidence?.creditRefs ?? [],
        lineageRefs: evidence?.lineageRefs ?? [],
        policyRefs: evidence?.policyRefs ?? [],
        acceptanceRefs: evidence?.acceptanceRefs ?? [],
        missingRefs: evidence?.missingRefs ?? [],
        warningApprovalRefs: evidence?.warningApprovalRefs ?? [],
        createdAt: "2026-06-02T00:00:00.000Z",
      }).status
    ).toBe("warning_complete");
  });

  it("builds a reusable Production Director story concept from an auto-review plan", () => {
    const plan = {
      ...basePlan,
      title: "แนวคิดรีวิวโต๊ะข้างเตียง",
      storyboardGuide: "Hook -> proof -> use -> close",
      shots: [
        {
          ...baseShot,
          order: 1,
          title: "Hook",
          startSeconds: 0,
          endSeconds: 5,
          visual: "เห็นห้องรกก่อนจัดโต๊ะ",
          productRole: "จัดของข้างเตียงให้เป็นระเบียบ",
        },
        {
          ...baseShot,
          id: "shot-2",
          order: 2,
          title: "Close",
          startSeconds: 5,
          endSeconds: 10,
          visual: "เห็นโต๊ะอยู่ข้างเตียงพร้อมของใช้",
          productRole: "พื้นที่เก็บของใกล้มือ",
        },
      ],
    } as any;
    const wizard = buildMarketplaceAutoReviewStoryConceptWizardForTest({
      plan,
      metadata: {
        source: "openai_agents_sdk_gateway_creative_planner",
        creativeConceptSet: {
          selectedConceptId: "concept-a",
          selectedRationale: "เล่าแบบแก้ปัญหาห้องรก",
          concepts: [
            {
              conceptId: "concept-a",
              title: "จัดมุมข้างเตียงให้น่าใช้",
              angle: "เริ่มจากของรก แล้วจบที่ใช้ง่าย",
              selected: true,
            },
          ],
        },
      },
    });

    expect(wizard).toMatchObject({
      status: "options_ready",
      selectedId: "concept-a",
      source: "llm_synthesized",
    });
    expect((wizard.options as any[])[0]).toMatchObject({
      id: "concept-a",
      title: "จัดมุมข้างเตียงให้น่าใช้",
      conceptDetails: expect.stringContaining("เล่าแบบแก้ปัญหาห้องรก"),
    });
    expect((wizard.options as any[])[0].voiceoverBeats).toHaveLength(2);
    expect((wizard.options as any[])[0].sceneTimeline).toHaveLength(2);
  });

  it("records provider submit intent evidence before image/video provider refs are finalized", () => {
    const imageMetadata =
      buildMarketplaceAutoReviewDirectMediaSubmitMetadataForTest({
        mediaType: "image",
        attemptId: "direct-image-1",
        submittedRefs: [
          {
            unitId: "shot-1-start",
            mediaType: "image",
            stageKey: "image_generation",
            role: "start_frame",
            shotId: "shot-1",
            shotOrder: 1,
            attempt: 1,
            taskId: "submit-intent:shot-1-start:1",
            model: "image-model",
            status: "submit_intent_recorded",
            creditAmount: 15,
            creditTransactionId: 101,
            creditIdempotencyKey: "img-credit-1",
            submittedAt: "2026-05-31T00:00:00.000Z",
            providerSubmitIntentId:
              "provider-submit-intent:mar_1:image:shot-1-start:1",
            providerSubmitIntentStatus: "recorded_before_provider_submit",
            providerSubmitEvidence: {
              submitIntentId:
                "provider-submit-intent:mar_1:image:shot-1-start:1",
              status: "recorded_before_provider_submit",
              durableBeforeProviderSubmit: true,
            },
          },
        ],
      });
    const videoMetadata =
      buildMarketplaceAutoReviewDirectMediaSubmitMetadataForTest({
        mediaType: "video",
        attemptId: "direct-video-1",
        submittedRefs: [
          {
            unitId: "shot-1-video",
            mediaType: "video",
            stageKey: "video_generation",
            role: "video_clip",
            shotId: "shot-1",
            shotOrder: 1,
            attempt: 1,
            taskId: "vid_task_1",
            providerTaskId: "vid_provider_1",
            model: "video-model",
            status: "processing",
            creditAmount: 45,
            creditTransactionId: 301,
            creditIdempotencyKey: "vid-credit-1",
            submittedAt: "2026-05-31T00:00:01.000Z",
            providerSubmitIntentId:
              "provider-submit-intent:mar_1:video:shot-1-video:1",
            providerSubmitIntentStatus: "submitted_to_provider",
            providerSubmitEvidence: {
              submitIntentId:
                "provider-submit-intent:mar_1:video:shot-1-video:1",
              status: "submitted_to_provider",
              recordedAt: "2026-05-31T00:00:00.000Z",
            },
          },
        ],
      });

    expect((imageMetadata.directImageSubmitEvidence as any[])[0]).toMatchObject(
      {
        submitIntentId: "provider-submit-intent:mar_1:image:shot-1-start:1",
        status: "recorded_before_provider_submit",
      }
    );
    expect((videoMetadata.directVideoSubmitEvidence as any[])[0]).toMatchObject(
      {
        submitIntentId: "provider-submit-intent:mar_1:video:shot-1-video:1",
        status: "submitted_to_provider",
      }
    );
  });

  it("keeps partial video submit refs durable for cancellation and refund reconciliation", () => {
    const metadata = buildMarketplaceAutoReviewDirectMediaSubmitMetadataForTest(
      {
        mediaType: "video",
        attemptId: "direct-video-1",
        metadata: {
          pendingVideoRepairUnits: [
            { unitId: "shot-3-video", role: "video_clip" },
          ],
        },
        submittedRefs: [
          {
            unitId: "shot-1-video",
            mediaType: "video",
            stageKey: "video_generation",
            role: "video_clip",
            shotId: "shot-1",
            shotOrder: 1,
            attempt: 1,
            taskId: "vid_task_1",
            providerTaskId: "vid_provider_1",
            model: "video-model",
            status: "processing",
            creditAmount: 45,
            creditTransactionId: 301,
            creditIdempotencyKey: "vid-credit-1",
            submittedAt: "2026-05-31T00:00:00.000Z",
          },
          {
            unitId: "shot-2-video",
            mediaType: "video",
            stageKey: "video_generation",
            role: "video_clip",
            shotId: "shot-2",
            shotOrder: 2,
            attempt: 1,
            taskId: "submit-failed:shot-2-video:1",
            model: "video-model",
            status: "failed",
            creditAmount: 45,
            creditTransactionId: 302,
            creditIdempotencyKey: "vid-credit-2",
            refundTransactionId: 402,
            submittedAt: "2026-05-31T00:00:01.000Z",
          },
        ],
      }
    );

    expect(metadata.directVideoTasks).toHaveLength(2);
    expect(metadata.videoProviderTaskIds).toContain("vid_provider_1");
    expect(metadata.directVideoTasks?.[1].refundTransactionId).toBe(402);
    expect(metadata.pendingVideoRepairUnits).toHaveLength(1);
  });

  it("maps structured vision QA failed frame roles to exact start/stop repair units", () => {
    const startOnly = buildMarketplaceAutoReviewShotFrameRepairUnitsForTest({
      shot: baseShot as any,
      expectedFrameRoles: ["start_frame", "stop_frame"],
      presentFrameRoles: ["start_frame", "stop_frame"],
      qa: {
        verdict: "repair",
        failedFrameRoles: ["start_frame"],
        reasonCodes: ["character_face_drift"],
        repairInstruction: "Regenerate only the start frame.",
      },
    });
    const stopOnly = buildMarketplaceAutoReviewShotFrameRepairUnitsForTest({
      shot: baseShot as any,
      expectedFrameRoles: ["start_frame", "stop_frame"],
      presentFrameRoles: ["start_frame", "stop_frame"],
      qa: {
        verdict: "repair",
        frameVerdicts: [
          { role: "start_frame", verdict: "pass" },
          {
            role: "stop_frame",
            verdict: "repair",
            repairInstruction: "Regenerate only the stop frame.",
          },
        ],
        reasonCodes: ["product_shape_drift"],
      },
    });
    const both = buildMarketplaceAutoReviewShotFrameRepairUnitsForTest({
      shot: baseShot as any,
      expectedFrameRoles: ["start_frame", "stop_frame"],
      presentFrameRoles: ["start_frame", "stop_frame"],
      qa: {
        verdict: "repair",
        failedFrameRoles: ["start_frame", "stop_frame"],
        reasonCodes: ["start_stop_continuity_mismatch"],
      },
    });

    expect(startOnly.map(unit => unit.role)).toEqual(["start_frame"]);
    expect(startOnly[0].unitId).toBe("shot-1-start");
    expect(stopOnly.map(unit => unit.role)).toEqual(["stop_frame"]);
    expect(stopOnly[0].unitId).toBe("shot-1-stop");
    expect(both.map(unit => unit.role)).toEqual(["start_frame", "stop_frame"]);
  });

  it("keeps completed provider images accepted when vision QA runtime is unavailable", () => {
    const qa =
      buildMarketplaceAutoReviewVisionQaRuntimeUnavailableEnvelopeForTest({
        runId: "mar_1",
        shotId: "shot-1",
        frameRoles: ["storyboard_frame"],
        frameUrls: ["https://cdn.example.test/storyboard-cell-1.png"],
        qaCacheKey: "qa-cache-1",
      });
    const repairUnits = buildMarketplaceAutoReviewShotFrameRepairUnitsForTest({
      shot: baseShot as any,
      expectedFrameRoles: ["storyboard_frame"],
      presentFrameRoles: ["storyboard_frame"],
      qa,
    });

    expect(qa).toMatchObject({
      status: "qa_unavailable_warning",
      verdict: "pass",
      qaUnavailable: true,
      failedFrameRoles: [],
      qaCacheKey: "qa-cache-1",
    });
    expect(qa.reasonCodes).toContain("vision_qa_runtime_unavailable");
    expect(repairUnits).toEqual([]);
  });

  it("places required Thai advertising warning text into the video editor timeline", () => {
    const project = buildMarketplaceAutoReviewVideoEditorProjectForTest({
      plan: { ...basePlan, shots: [baseShot] } as any,
      videoUrls: ["https://cdn.example.test/shot-1.mp4"],
      run: {
        id: "mar_1",
        productionRunId: "prod_1",
        metadataJson: {
          audioStrategy: "auto",
          resolvedAudioStrategy: "native_video_audio",
          visualWarningPlan: {
            required: true,
            exactText: "ภาพและเสียงสร้างด้วย AI ใช้ประกอบการรีวิวสินค้า",
            placement: "bottom_safe_area",
            minDurationSeconds: 3,
          },
          startFrameUrls: ["https://cdn.example.test/shot-1-start.png"],
        },
      } as any,
    });

    const textTrack = project.timeline.tracks.find(
      track => track.id === "track-t1"
    );
    expect(textTrack?.clips).toHaveLength(1);
    expect(textTrack?.clips[0].textConfig?.text).toContain("AI");
    expect((textTrack?.clips[0] as any).outMs).toBe(
      baseShot.durationSeconds * 1000
    );
  });

  it("builds video acceptance from clip QA and repairs only failed shot clips", () => {
    const plan = {
      ...basePlan,
      shots: [
        { ...baseShot, id: "shot-1", order: 1 },
        { ...baseShot, id: "shot-2", order: 2 },
      ],
    };
    const envelope = buildMarketplaceAutoReviewVideoAcceptanceEnvelopeForTest({
      run: { id: "mar_1", metadataJson: {} } as any,
      plan: plan as any,
      refs: [],
      videoClipUrls: [
        "https://cdn.example.test/shot-1.mp4",
        "https://cdn.example.test/shot-2.mp4",
      ],
      metadata: {
        videoClipContinuityQaEnvelopes: [
          {
            qaEnvelopeId: "video-qa-1",
            shotId: "shot-1",
            status: "passed",
            videoUrl: "https://cdn.example.test/shot-1.mp4",
          },
          {
            qaEnvelopeId: "video-qa-2",
            shotId: "shot-2",
            status: "needs_targeted_repair",
            videoUrl: "https://cdn.example.test/shot-2.mp4",
            reasonCodes: ["product_shape_drift"],
            repairInstruction:
              "Regenerate only shot-2 video clip from accepted frames.",
          },
        ],
      },
    });

    expect(envelope.status).toBe("repair_required");
    expect(envelope.qaVerdictRefs).toEqual(["video-qa-1", "video-qa-2"]);
    expect(envelope.pendingRepairUnits).toEqual([
      expect.objectContaining({
        unitId: "shot-2-video",
        shotId: "shot-2",
        role: "video_clip",
      }),
    ]);
  });

  it("verifies warning overlays for exact text, safe area, and minimum duration before render", () => {
    const project = buildMarketplaceAutoReviewVideoEditorProjectForTest({
      plan: {
        ...basePlan,
        shots: [{ ...baseShot, durationSeconds: 5 }],
      } as any,
      videoUrls: ["https://cdn.example.test/shot-1.mp4"],
      run: {
        id: "mar_1",
        productionRunId: "prod_1",
        metadataJson: {
          visualWarningPlan: {
            warningPlanId: "warning-1",
            required: true,
            exactText: "ภาพและเสียงสร้างด้วย AI ใช้ประกอบการรีวิวสินค้า",
            placement: "bottom_safe_area",
            minDurationSeconds: 3,
            contrastTarget: 4.5,
            ocrReadabilityRequired: true,
            productOcclusionRule: "must_not_occlude_product",
          },
        },
      } as any,
    });

    const verification =
      buildMarketplaceAutoReviewWarningOverlayVerificationForTest({
        runId: "mar_1",
        projectData: project,
        metadata: {
          visualWarningPlan: {
            warningPlanId: "warning-1",
            required: true,
            exactText: "ภาพและเสียงสร้างด้วย AI ใช้ประกอบการรีวิวสินค้า",
            placement: "bottom_safe_area",
            minDurationSeconds: 3,
            contrastTarget: 4.5,
            ocrReadabilityRequired: true,
            productOcclusionRule: "must_not_occlude_product",
          },
        },
      });

    expect(verification.status).toBe("passed");
    expect(verification.checks).toContain("exact_warning_text_present");
    expect(verification.ocrReadabilityStatus).toBe(
      "deterministic_compositor_verified"
    );
  });

  it("marks short separate TTS audio as targeted repair instead of silently passing", () => {
    const envelope = buildMarketplaceAutoReviewAudioContinuityEnvelopeForTest({
      runId: "mar_1",
      plan: {
        ...basePlan,
        shots: [{ ...baseShot, durationSeconds: 10 }],
      } as any,
      resolvedAudioStrategy: "separate_tts_voiceover",
      audioUrl: "https://cdn.example.test/voice.mp3",
      actualDurationSeconds: 5,
    });

    expect(envelope.status).toBe("needs_targeted_repair");
    expect(envelope.reasonCodes).toContain("audio_duration_too_short");
    expect(envelope.repairInstruction).toContain(
      "Regenerate only the voiceover audio"
    );
  });

  it("marks separate TTS audio with unknown duration as targeted repair", () => {
    const envelope = buildMarketplaceAutoReviewAudioContinuityEnvelopeForTest({
      runId: "mar_1",
      plan: {
        ...basePlan,
        shots: [{ ...baseShot, durationSeconds: 10 }],
      } as any,
      resolvedAudioStrategy: "separate_tts_voiceover",
      audioUrl: "https://cdn.example.test/voice.mp3",
      actualDurationSeconds: null,
    });

    expect(envelope.status).toBe("needs_targeted_repair");
    expect(envelope.reasonCodes).toContain("audio_duration_metadata_missing");
  });

  it("does not auto-accept native provider audio without generated audio evidence", () => {
    const envelope = buildMarketplaceAutoReviewAudioContinuityEnvelopeForTest({
      runId: "mar_1",
      plan: {
        ...basePlan,
        shots: [{ ...baseShot, durationSeconds: 10 }],
      } as any,
      resolvedAudioStrategy: "native_video_audio",
    });

    expect(envelope.status).toBe("needs_targeted_repair");
    expect(envelope.reasonCodes).toContain("native_audio_evidence_missing");
    expect(envelope.repairInstruction).toContain(
      "Attach generated audio samples"
    );
  });

  it("blocks render finalization when video, audio, warning, or governance gates are missing", () => {
    expect(() =>
      buildMarketplaceAutoReviewRenderFinalizationMetadataForTest({
        run: {
          id: "mar_1",
          productionRunId: "prod_1",
          outputMode: "full_video",
        } as any,
        plan: { ...basePlan, shots: [baseShot] } as any,
        metadata: {
          videoClipUrls: ["https://cdn.example.test/shot-1.mp4"],
          videoUnitIds: ["shot-1-video"],
          generatedMediaAcceptanceEnvelope: {
            status: "accepted",
            acceptanceEnvelopeId: "acceptance-video",
          },
        },
        jobId: "render_1",
        resultUrl: "https://cdn.example.test/final.mp4",
        libraryItemId: 1,
      })
    ).toThrow(/audio continuity QA/i);
  });

  it("blocks render finalization when clip urls are blank or not ordered by shot unit", () => {
    expect(() =>
      buildMarketplaceAutoReviewRenderFinalizationMetadataForTest({
        run: {
          id: "mar_1",
          productionRunId: "prod_1",
          outputMode: "full_video",
        } as any,
        plan: { ...basePlan, shots: [baseShot] } as any,
        metadata: readyRenderGateMetadata({
          videoClipUrls: [""],
          videoUnitIds: ["shot-1-video"],
        }) as any,
        jobId: "render_1",
        resultUrl: "https://cdn.example.test/final.mp4",
        libraryItemId: 1,
      })
    ).toThrow(/shot-1-video/);

    expect(() =>
      buildMarketplaceAutoReviewRenderFinalizationMetadataForTest({
        run: { id: "mar_1", productionRunId: "prod_1" } as any,
        plan: { ...basePlan, shots: [baseShot] } as any,
        metadata: readyRenderGateMetadata({
          videoClipUrls: ["https://cdn.example.test/shot-1.mp4"],
          videoUnitIds: ["shot-99-video"],
        }) as any,
        jobId: "render_1",
        resultUrl: "https://cdn.example.test/final.mp4",
        libraryItemId: 1,
      })
    ).toThrow(/ordered shot video unit ids/i);
  });

  it("allows render finalization only when governance and QA gates are ready", () => {
    const metadata = readyRenderGateMetadata();

    expect(() =>
      assertMarketplaceAutoReviewGovernanceReadyForTest(metadata, "render")
    ).not.toThrow();
    const finalized =
      buildMarketplaceAutoReviewRenderFinalizationMetadataForTest({
        run: {
          id: "mar_1",
          productionRunId: "prod_1",
          outputMode: "full_video",
        } as any,
        plan: { ...basePlan, shots: [baseShot] } as any,
        metadata,
        jobId: "render_1",
        resultUrl: "https://cdn.example.test/final.mp4",
        libraryItemId: 1,
      });

    expect(finalized.finalRenderQaEnvelope.status).toBe("passed");
    expect(finalized.finalRenderQaEnvelope.checks).toContain(
      "video_continuity_qa_passed"
    );
    expect(finalized.publishableAssetPackage.evidenceRefs).toContain(
      "video-qa-1"
    );
    expect(finalized.publishableAssetPackage.creditRefs).toContain(
      "credit:render-1"
    );
    expect(finalized.publishableAssetPackage.transcriptArtifactRef).toMatch(
      /^transcript:/
    );
    expect(finalized.publishableAssetPackage.subtitleArtifactRefs[0]).toMatch(
      /^subtitle:/
    );
    expect(
      finalized.publishableAssetPackage.packageManifestArtifactRef
    ).toMatch(/^package-manifest:/);
    expect(finalized.finalRenderQaEnvelope.renderArtifactProbeRef).toBe(
      "render-probe-1"
    );
    expect(finalized.publishableAssetPackage.evidenceRefs).toEqual(
      expect.arrayContaining(["video-sample:shot-1", "keyframe:shot-1"])
    );
  });

  it("blocks render finalization until the rendered artifact has probe evidence", () => {
    const metadata = readyRenderGateMetadata({
      renderArtifactProbe: undefined,
    });

    expect(() =>
      buildMarketplaceAutoReviewRenderFinalizationMetadataForTest({
        run: { id: "mar_1", productionRunId: "prod_1" } as any,
        plan: { ...basePlan, shots: [baseShot] } as any,
        metadata,
        jobId: "render_1",
        resultUrl: "https://cdn.example.test/final.mp4",
        libraryItemId: 1,
      })
    ).toThrow(/render artifact probe/i);
  });

  it("packs final QA and governance evidence into Library metadata", () => {
    const checksum = "checksum-1";
    const finalized = {
      finalRenderQaEnvelope: {
        qaEnvelopeId: "render-qa-1",
        status: "passed",
        videoContinuityQaRefs: ["video-qa-1"],
        audioContinuityQaRef: "audio-qa-1",
      },
      finalMediaQaEnvelope: {
        qaEnvelopeId: "final-media-qa-1",
        status: "passed",
      },
      publishableAssetPackage: {
        packageId: "package-1",
        status: "ready_private_library_asset",
        libraryItemId: 1,
        libraryItemRef: "libraryItem:1",
        platformProfile: "short_video_9x16",
        transcriptArtifactRef: "transcript:mar_1:checksum-1",
        subtitleArtifactRefs: ["subtitle:mar_1:th-srt:checksum-1"],
        packageManifestArtifactRef: "package-manifest:mar_1:checksum-1",
        qaArtifactManifestRef: "qa-artifact-manifest:mar_1:checksum-1",
        metadataManifestRef: "metadata-manifest:checksum-1",
        checksum,
        evidenceRefs: [
          "render-qa-1",
          "final-media-qa-1",
          "video-qa-1",
          "audio-qa-1",
          "render-probe-1",
          "media-inspection:mar_1:checksum-1",
          "libraryItem:1",
          "transcript:mar_1:checksum-1",
          "subtitle:mar_1:th-srt:checksum-1",
          "package-manifest:mar_1:checksum-1",
          "qa-artifact-manifest:mar_1:checksum-1",
          "metadata-manifest:checksum-1",
          checksum,
          "video-sample:shot-1",
          "keyframe:shot-1",
          "credit:render-1",
          "credit-tx:101",
        ],
        creditRefs: ["credit:render-1", "credit-tx:101"],
      },
      creditSummary: {
        spentCredits: 12,
        reservedCredits: 12,
        reservationRefs: ["credit:render-1"],
        transactionRefs: ["credit-tx:101"],
      },
      renderStorageEnvelope: { envelopeId: "storage-1", status: "passed" },
      renderDistributionProfile: {
        profileId: "distribution-1",
        status: "passed",
      },
      qaArtifactManifest: {
        manifestId: "qa-artifact-manifest:mar_1:checksum-1",
        status: "passed",
      },
      mediaArtifactInspection: {
        inspectionId: "media-inspection:mar_1:checksum-1",
        status: "passed",
      },
      productReferenceAssetPack: { assetPackId: "product-pack-1" },
      characterIdentityAssetPack: { assetPackId: "character-pack-1" },
      advertisingRulePack: { rulePackId: "ad-policy-1" },
      renderArtifactProbe: { probeId: "render-probe-1", status: "passed" },
      generatedVideoSampleRefs: {
        "shot-1": ["video-sample:shot-1", "keyframe:shot-1"],
      },
    };

    const metadata = buildMarketplaceAutoReviewRenderLibraryMetadataForTest({
      run: {
        id: "mar_1",
        productionRunId: "prod_1",
        outputMode: "full_video",
        frameStrategy: "video_shot_start_stop",
        metadataJson: finalized,
      } as any,
      plan: { ...basePlan, shots: [baseShot] } as any,
      jobId: "render_1",
      finalizedMetadata: finalized as any,
    });

    expect(metadata.final_render_qa_envelope).toEqual(
      finalized.finalRenderQaEnvelope
    );
    expect(metadata.publishable_asset_package).toEqual(
      finalized.publishableAssetPackage
    );
    expect(metadata.governance_refs.product_reference_asset_pack_ref).toBe(
      "product-pack-1"
    );
    expect(metadata.render_artifact_probe).toEqual(
      finalized.renderArtifactProbe
    );
    expect(metadata.media_artifact_inspection).toEqual(
      finalized.mediaArtifactInspection
    );
  });

  it("rejects Library promotion when package proof omits rendered samples", () => {
    const finalized =
      buildMarketplaceAutoReviewRenderFinalizationMetadataForTest({
        run: {
          id: "mar_1",
          productionRunId: "prod_1",
          outputMode: "full_video",
        } as any,
        plan: { ...basePlan, shots: [baseShot] } as any,
        metadata: readyRenderGateMetadata({
          generatedVideoSampleRefs: {},
        }) as any,
        jobId: "render_1",
        resultUrl: "https://cdn.example.test/final.mp4",
        libraryItemId: 1,
      });

    expect(() =>
      buildMarketplaceAutoReviewRenderLibraryMetadataForTest({
        run: {
          id: "mar_1",
          productionRunId: "prod_1",
          outputMode: "full_video",
          frameStrategy: "video_shot_start_stop",
          metadataJson: finalized,
        } as any,
        plan: { ...basePlan, shots: [baseShot] } as any,
        jobId: "render_1",
        finalizedMetadata: finalized as any,
      })
    ).toThrow(/render sample\/keyframe proof/i);
  });

  it("rejects Library promotion when package proof omits credit linkage", () => {
    const finalized =
      buildMarketplaceAutoReviewRenderFinalizationMetadataForTest({
        run: {
          id: "mar_1",
          productionRunId: "prod_1",
          outputMode: "full_video",
        } as any,
        plan: { ...basePlan, shots: [baseShot] } as any,
        metadata: readyRenderGateMetadata() as any,
        jobId: "render_1",
        resultUrl: "https://cdn.example.test/final.mp4",
        libraryItemId: 1,
      });
    finalized.publishableAssetPackage = {
      ...finalized.publishableAssetPackage,
      evidenceRefs: finalized.publishableAssetPackage.evidenceRefs.filter(
        (ref: string) => !ref.startsWith("credit:")
      ),
      creditRefs: [],
    };

    expect(() =>
      buildMarketplaceAutoReviewRenderLibraryMetadataForTest({
        run: {
          id: "mar_1",
          productionRunId: "prod_1",
          outputMode: "full_video",
          frameStrategy: "video_shot_start_stop",
          metadataJson: finalized,
        } as any,
        plan: { ...basePlan, shots: [baseShot] } as any,
        jobId: "render_1",
        finalizedMetadata: finalized as any,
      })
    ).toThrow(/credit refs/i);
  });

  it("rejects Library promotion when package proof omits library linkage", () => {
    const finalized =
      buildMarketplaceAutoReviewRenderFinalizationMetadataForTest({
        run: {
          id: "mar_1",
          productionRunId: "prod_1",
          outputMode: "full_video",
        } as any,
        plan: { ...basePlan, shots: [baseShot] } as any,
        metadata: readyRenderGateMetadata() as any,
        jobId: "render_1",
        resultUrl: "https://cdn.example.test/final.mp4",
        libraryItemId: 1,
      });
    finalized.publishableAssetPackage = {
      ...finalized.publishableAssetPackage,
      libraryItemId: null,
      libraryItemRef: null,
      evidenceRefs: finalized.publishableAssetPackage.evidenceRefs.filter(
        (ref: string) => !ref.startsWith("libraryItem:")
      ),
    };

    expect(() =>
      buildMarketplaceAutoReviewRenderLibraryMetadataForTest({
        run: {
          id: "mar_1",
          productionRunId: "prod_1",
          outputMode: "full_video",
          frameStrategy: "video_shot_start_stop",
          metadataJson: finalized,
        } as any,
        plan: { ...basePlan, shots: [baseShot] } as any,
        jobId: "render_1",
        finalizedMetadata: finalized as any,
      })
    ).toThrow(/library linkage/i);
  });

  it("rejects Library promotion when a platform package lacks subtitle/transcript artifacts", () => {
    const finalized = {
      finalRenderQaEnvelope: {
        qaEnvelopeId: "render-qa-1",
        status: "passed",
        videoContinuityQaRefs: ["video-qa-1"],
        audioContinuityQaRef: "audio-qa-1",
      },
      finalMediaQaEnvelope: {
        qaEnvelopeId: "final-media-qa-1",
        status: "passed",
      },
      publishableAssetPackage: {
        packageId: "package-1",
        status: "ready_private_library_asset",
        libraryItemId: 1,
        libraryItemRef: "libraryItem:1",
        platformProfile: "short_video_9x16",
        evidenceRefs: [
          "render-qa-1",
          "video-qa-1",
          "audio-qa-1",
          "render-probe-1",
          "libraryItem:1",
          "credit:render-1",
          "credit-tx:101",
        ],
        creditRefs: ["credit:render-1", "credit-tx:101"],
      },
      creditSummary: {
        reservationRefs: ["credit:render-1"],
        transactionRefs: ["credit-tx:101"],
      },
      renderArtifactProbe: { probeId: "render-probe-1", status: "passed" },
    };

    expect(() =>
      buildMarketplaceAutoReviewRenderLibraryMetadataForTest({
        run: {
          id: "mar_1",
          productionRunId: "prod_1",
          outputMode: "full_video",
          frameStrategy: "video_shot_start_stop",
          metadataJson: finalized,
        } as any,
        plan: { ...basePlan, shots: [baseShot] } as any,
        jobId: "render_1",
        finalizedMetadata: finalized as any,
      })
    ).toThrow(/transcript, subtitle, and package manifest/i);
  });

  it("rejects incomplete Agents creative shots instead of filling them from fallback copy", () => {
    let thrown: unknown;
    try {
      buildMarketplaceAutoReviewCreativeShotForTest(
        {
          title: "เปิดคลิป",
          storyboardGuide: "ภาพสินค้าในห้องจริง",
          voiceover: "เริ่มจากปัญหาที่เจอบ่อย",
        },
        baseShot as any,
        0
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(
      /missing required creative shot fields/i
    );
    expect((thrown as any).code).toBe(
      "creative_planner_shot_contract_mismatch"
    );
    expect((thrown as any).shotNumber).toBe(1);
    expect((thrown as any).missingFields).toEqual([
      "camera",
      "visual",
      "movement",
      "productRole",
    ]);
  });

  it("rejects short Agents creative shot lists instead of appending story-breaking filler", () => {
    const shortPlannerShots = Array.from({ length: 5 }, (_, index) => ({
      title: `Planner shot ${index + 1}`,
      storyboardGuide: `Storyboard beat ${index + 1}`,
      voiceover: `เสียงบรรยาย ${index + 1}`,
      camera: "steady product camera",
      visual: "selected product anchor only",
      movement: "gentle push in",
      productRole: "selected_product_reference",
    }));
    const fallbackPlan = buildMarketplaceAutoReviewProductTruthScaffoldForTest(
      productAccessBundle() as any
    );

    expect(() =>
      normalizeMarketplaceAutoReviewCreativeShotsForTest(
        shortPlannerShots,
        fallbackPlan.shots
      )
    ).toThrow(/returned 5 shots, expected 9/i);
    try {
      normalizeMarketplaceAutoReviewCreativeShotsForTest(
        shortPlannerShots,
        fallbackPlan.shots
      );
    } catch (error) {
      expect((error as any).code).toBe("creative_planner_shot_count_mismatch");
      expect((error as any).actualShotCount).toBe(5);
      expect((error as any).expectedShotCount).toBe(9);
    }
  });

  it("accepts the requested seven-shot contract exactly", () => {
    const fallbackPlan = buildMarketplaceAutoReviewProductTruthScaffoldForTest(
      productAccessBundle() as any,
      7
    );
    const plannerShots = fallbackPlan.shots.map(shot => ({
      title: `Planner ${shot.order}`,
      storyboardGuide: `Beat ${shot.order}`,
      voiceover: `บทพูด ${shot.order}`,
      camera: "steady product camera",
      visual: "selected product anchor only",
      movement: "gentle push in",
      productRole: "selected_product_reference",
    }));

    const shots = normalizeMarketplaceAutoReviewCreativeShotsForTest(
      plannerShots,
      fallbackPlan.shots
    );

    expect(fallbackPlan.shots).toHaveLength(7);
    expect(shots).toHaveLength(7);
    expect(shots[6].order).toBe(7);
  });

  it("keeps the deterministic new-run scaffold product-truth-only", () => {
    const scaffold = buildMarketplaceAutoReviewProductTruthScaffoldForTest(
      productAccessBundle() as any
    );
    const scaffoldText = JSON.stringify({
      title: scaffold.title,
      storyboardGuide: scaffold.storyboardGuide,
      voiceoverScript: scaffold.voiceoverScript,
      shots: scaffold.shots,
    });

    expect(scaffold.conceptId).toContain("truth-scaffold");
    expect(scaffoldText).toContain("PRODUCT TRUTH SCAFFOLD ONLY");
    expect(scaffoldText).not.toMatch(
      /creative|narration|final voiceover|natural Thai spoken|spoken line/i
    );
    expect(
      scaffold.shots.every(
        shot => shot.productRole === "product_truth_anchor_only"
      )
    ).toBe(true);
  });

  it("keeps every attached product image available for anchor validation", () => {
    const imageUrls = Array.from(
      { length: 11 },
      (_, index) => `https://cdn.example.test/product-${index + 1}.png`
    );
    const scaffold = buildMarketplaceAutoReviewProductTruthScaffoldForTest({
      ...productAccessBundle(),
      images: imageUrls.map(url => ({ url })),
    } as any);

    expect(scaffold.productTruth.imageUrls).toEqual(imageUrls);
    expect(() =>
      resolveMarketplaceAutoReviewReferenceAnchorsForTest({
        productTruth: scaffold.productTruth,
        referenceAnchors: trustedAnchorInput({
          productImageUrl: imageUrls[10],
        }),
      })
    ).not.toThrow();
  });

  it("blocks paid authority when current shared access is read-only", () => {
    const metadata = readyFeature117Metadata(
      productAccessBundle({
        accessType: "group",
        groupShare: {
          groupId: 1,
          sharedByUserId: 7,
          permission: "read_update",
        },
      })
    );
    const run = {
      id: "mar_1",
      productId: "mp_1",
      userId: 42,
      tenantId: "tenant_1",
      outputMode: "full_video",
      frameStrategy: "video_shot_start_stop",
      currentStage: "image_generation",
    };

    const freshness = collectPaidStageAuthorityFreshnessForTest({
      tenantId: "tenant_1",
      auth: { userId: 42, tenantId: "tenant_1" },
      run: run as any,
      metadata: metadata as any,
      bundle: productAccessBundle({
        accessType: "group",
        groupShare: { groupId: 1, sharedByUserId: 7, permission: "read" },
      }) as any,
      phase: "visual_spend",
    });

    expect(freshness.blockers).toContain(
      "current product access is not spend-capable"
    );
  });

  it("keeps input-change impact clean when persisted reference anchors are re-evaluated", () => {
    const metadata = readyFeature117Metadata();
    const impact = evaluateMarketplaceAutoReviewInputChangeImpactForTest({
      runId: "mar_1",
      metadata: metadata as any,
      productTruth: basePlan.productTruth as any,
      productUpdatedAt: "2026-05-31T00:00:00.000Z",
      selectedVariantHash: null,
      outputMode: "full_video",
      frameStrategy: "video_shot_start_stop",
      audioStrategy: "auto",
      resolvedAudioStrategy: "native_video_audio",
    });

    expect(impact.status).toBe("no_recheck_required");
    expect(impact.staleRefs).not.toContain("inputChangeImpact.snapshotHash");
  });

  it("recomputes input-change impact and requires recheck when product truth becomes stale", () => {
    const metadata = readyFeature117Metadata();
    const impact = evaluateMarketplaceAutoReviewInputChangeImpactForTest({
      runId: "mar_1",
      metadata: metadata as any,
      productTruth: basePlan.productTruth as any,
      productUpdatedAt: "2026-06-01T00:00:00.000Z",
      selectedVariantHash: null,
      outputMode: "full_video",
      frameStrategy: "video_shot_start_stop",
      audioStrategy: "auto",
      resolvedAudioStrategy: "native_video_audio",
    });

    expect(impact.status).toBe("recheck_required");
    expect(impact.staleRefs).toContain(
      "evidenceFreshnessSnapshot.productUpdatedAt"
    );
    expect(impact.invalidatedRefs).toContain("generatedMedia");
  });

  it("summarizes cancellation reconciliation for active media, audio, render, and refunds", () => {
    const summary = summarizeMarketplaceAutoReviewCancellationForTest({
      directImageTasks: [
        {
          unitId: "shot-1-frame",
          mediaType: "image",
          stageKey: "image_generation",
          role: "storyboard_frame",
          attempt: 1,
          taskId: "img_task_1",
          model: "image-model",
          status: "processing",
          creditAmount: 3,
          creditTransactionId: 101,
          creditIdempotencyKey: "img-credit-1",
          submittedAt: "2026-05-31T00:00:00.000Z",
        },
      ],
      directVideoTasks: [
        {
          unitId: "shot-1-video",
          mediaType: "video",
          stageKey: "video_generation",
          role: "video_clip",
          attempt: 1,
          taskId: "vid_task_done",
          model: "video-model",
          status: "completed",
          creditAmount: 9,
          creditTransactionId: 102,
          creditIdempotencyKey: "vid-credit-1",
          submittedAt: "2026-05-31T00:00:00.000Z",
        },
      ],
      audioMediaTaskId: "aud_task_1",
      audioCreditAmount: 2,
      audioCreditTransactionId: 103,
      audioCreditIdempotencyKey: "aud-credit-1",
      renderJobId: "render_1",
      renderCreditReservation: {
        amount: 10,
        transactionId: 104,
        idempotencyKey: "render-credit-1",
        category: "render",
        renderHash: "hash_1",
        jobId: "render_1",
        reservedAt: "2026-05-31T00:00:00.000Z",
      },
    } as any);

    expect(summary.directMediaCancellationTaskIds).toEqual(["img_task_1"]);
    expect(summary.directMediaRefundTaskIds).toEqual(["img_task_1"]);
    expect(summary.audioCancellationTaskId).toBe("aud_task_1");
    expect(summary.audioRefundRequired).toBe(true);
    expect(summary.renderCancellationJobId).toBe("render_1");
    expect(summary.renderRefundRequired).toBe(true);
  });

  it("records provider reconciliation snapshots and blocks stale provider waits before duplicate spend", () => {
    const snapshot =
      buildMarketplaceAutoReviewProviderReconciliationSnapshotForTest({
        nowMs: Date.parse("2026-06-01T10:00:00.000Z"),
        run: {
          id: "mar_1",
          currentStage: "image_generation",
          outputMode: "full_video",
        } as any,
        metadata: {
          directImageTasks: [
            {
              unitId: "shot-1-start",
              mediaType: "image",
              stageKey: "image_generation",
              role: "start_frame",
              attempt: 1,
              taskId: "img_task_stale",
              providerTaskId: "provider_img_stale",
              model: "image-model",
              status: "processing",
              creditAmount: 3,
              creditTransactionId: 101,
              creditIdempotencyKey: "img-credit-stale",
              submittedAt: "2026-06-01T00:00:00.000Z",
            },
          ],
        } as any,
      });

    expect(snapshot.status).toBe("blocked_stale_provider_wait");
    expect(snapshot.staleRefs).toContain("img_task_stale");
    expect(snapshot.orphanTaskPolicy).toContain("do_not_create_duplicate");
  });

  it("builds a centralized targeted repair policy ledger for frame, clip, and audio repair", () => {
    const ledger = buildMarketplaceAutoReviewTargetedRepairPolicyLedgerForTest({
      run: { id: "mar_1", outputMode: "full_video" } as any,
      metadata: {
        pendingImageRepairUnits: [
          {
            unitId: "shot-1-start",
            role: "start_frame",
            shotId: "shot-1",
            shotOrder: 1,
            repairReasonCodes: ["product_continuity_mismatch"],
          },
        ],
        pendingVideoRepairUnits: [
          {
            unitId: "shot-1-video",
            role: "video_clip",
            shotId: "shot-1",
            shotOrder: 1,
            repairReasonCodes: ["character_face_continuity_drift"],
          },
        ],
        pendingAudioRepair: {
          reasonCodes: ["audio_gap_detected"],
        },
        audioRepairAttempt: 1,
      } as any,
    });

    expect(ledger.status).toBe("retry_targeted");
    expect((ledger.decisions as any[]).map(item => item.repairScope)).toEqual(
      expect.arrayContaining([
        "single_frame_or_storyboard_cell",
        "single_video_clip",
        "single_voiceover_track",
      ])
    );
    expect(ledger.policyRefs).toContain("provider-refusal-no-duplicate-spend");
  });

  it("dedupes QA cache entries by stable key and exposes automation snapshots", () => {
    const first = buildMarketplaceAutoReviewQaCacheEntryForTest({
      kind: "shot_frame_vision_qa",
      cacheKey: "qa-cache:image:1",
      envelope: {
        qaEnvelopeId: "qa-1",
        status: "passed",
        verdict: "pass",
        checkedAt: "2026-06-01T00:00:00.000Z",
      },
    });
    const replacement = buildMarketplaceAutoReviewQaCacheEntryForTest({
      kind: "shot_frame_vision_qa",
      cacheKey: "qa-cache:image:1",
      envelope: {
        qaEnvelopeId: "qa-1b",
        status: "needs_targeted_repair",
        verdict: "repair",
        checkedAt: "2026-06-01T00:01:00.000Z",
      },
    });
    const cacheEntries = mergeMarketplaceAutoReviewQaCacheEntriesForTest({
      metadata: { qaCacheEntries: [first] } as any,
      entries: [replacement],
    });

    expect(cacheEntries).toHaveLength(1);
    expect((cacheEntries[0].envelope as any).qaEnvelopeId).toBe("qa-1b");

    const metadata = buildMarketplaceAutoReviewAutomationSnapshotsForTest({
      run: {
        id: "mar_1",
        currentStage: "image_generation",
        outputMode: "full_video",
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
      } as any,
      metadata: { qaCacheEntries: cacheEntries } as any,
    });

    expect((metadata.parallelismPolicy as any).status).toBe("active_policy");
    expect((metadata.operationalDrillPlan as any).scenarios).toContain(
      "callback_loss"
    );
    expect((metadata.automationMetrics as any).qaCacheEntryCount).toBe(1);
    expect((metadata.durableRuntimePlan as any).tables.leases).toBe(
      "marketplace_auto_review_run_leases"
    );
    expect((metadata.qualityModePolicy as any).mode).toBe("balanced");
    expect((metadata.creativePerformanceMemory as any).status).toBe(
      "pending_concepts"
    );
  });

  it("defines quality modes, durable runtime tables, creative memory, and media artifact inspection", () => {
    const run = {
      id: "mar_1",
      currentStage: "render",
      outputMode: "full_video",
      status: "completed",
      selectedConceptId: "concept_2",
    } as any;
    const quality = buildMarketplaceAutoReviewQualityModePolicyForTest({
      qualityMode: "premium_strict_qa",
    } as any);
    const durableRuntime = buildMarketplaceAutoReviewDurableRuntimePlanForTest({
      run,
      metadata: {
        automationControlPlane: {
          lease: { leaseId: "advance-lease:mar_1:abc" },
        },
        providerReconciliation: {
          reconciliationId: "provider-reconcile:mar_1:abc",
        },
      } as any,
    });
    const creativeMemory =
      buildMarketplaceAutoReviewCreativePerformanceMemoryForTest({
        run,
        metadata: {
          creativeConceptSet: {
            selectedConceptId: "concept_2",
            concepts: [
              {
                conceptId: "concept_1",
                title: "Old hook",
                hookType: "problem_solution",
                noveltyFingerprint: "old-hook",
              },
              {
                conceptId: "concept_2",
                title: "New hook",
                hookType: "unexpected_demo",
                noveltyFingerprint: "new-hook",
              },
            ],
          },
          publishableAssetPackage: { packageId: "package-1" },
          humanReviewGate: { approvalRef: "approval-1" },
        } as any,
      });
    const inspection = buildMarketplaceAutoReviewMediaArtifactInspectionForTest(
      {
        run,
        metadata: readyRenderGateMetadata() as any,
        resultUrl: "https://cdn.example.test/final.mp4",
        expectedDurationSeconds: 5,
      }
    );

    expect(quality.mode).toBe("premium_strict_qa");
    expect(quality.visionQaSampling).toContain("dense_keyframes");
    expect((durableRuntime.tables as any).outboxJobs).toBe(
      "marketplace_auto_review_outbox_jobs"
    );
    expect(durableRuntime.recoveryWorkerPolicy).toContain("recovery outbox");
    expect(creativeMemory.status).toBe("recorded");
    expect(creativeMemory.noveltyFingerprints).toEqual([
      "old-hook",
      "new-hook",
    ]);
    expect(inspection.status).toBe("passed");
    expect(inspection.checks).toEqual(
      expect.arrayContaining([
        "render_probe_passed",
        "sample_keyframes_present",
        "audio_continuity_probe_present",
      ])
    );
  });

  it("links final QA artifact manifests into publishable package and Library metadata", () => {
    const plan = { ...basePlan, shots: [baseShot] };
    const run = {
      id: "mar_1",
      productId: "mp_1",
      productionRunId: "prod_1",
      outputMode: "full_video",
      frameStrategy: "video_shot_start_stop",
    } as any;
    const finalized =
      buildMarketplaceAutoReviewRenderFinalizationMetadataForTest({
        run,
        plan: plan as any,
        metadata: readyRenderGateMetadata() as any,
        jobId: "render_1",
        resultUrl: "https://cdn.example.test/final.mp4",
        libraryItemId: 77,
      });

    expect((finalized.qaArtifactManifest as any).status).toBe("passed");
    expect((finalized.mediaArtifactInspection as any).status).toBe("passed");
    expect(
      (finalized.publishableAssetPackage as any).qaArtifactManifestRef
    ).toBe((finalized.qaArtifactManifest as any).manifestId);

    const libraryMetadata =
      buildMarketplaceAutoReviewRenderLibraryMetadataForTest({
        run,
        plan: plan as any,
        jobId: "render_1",
        finalizedMetadata: finalized,
      }) as any;
    expect(libraryMetadata.qa_artifact_manifest.manifestId).toBe(
      (finalized.qaArtifactManifest as any).manifestId
    );
    expect(libraryMetadata.media_artifact_inspection.inspectionId).toBe(
      (finalized.mediaArtifactInspection as any).inspectionId
    );
  });

  it("persists provider cancellation intent evidence when hard cancel cannot be dispatched", async () => {
    const cancellation =
      await buildMarketplaceAutoReviewCancellationEvidenceForTest({
        runId: "mar_1",
        refs: [
          {
            unitId: "shot-1-frame",
            mediaType: "image",
            stageKey: "image_generation",
            role: "storyboard_frame",
            attempt: 1,
            taskId: "img_task_1",
            providerTaskId: "provider_img_1",
            model: "image-model",
            status: "processing",
            creditAmount: 3,
            creditTransactionId: 101,
            creditIdempotencyKey: "img-credit-1",
            submittedAt: "2026-05-31T00:00:00.000Z",
          },
        ],
      });

    expect(cancellation.refs[0]).toMatchObject({
      status: "cancellation_requested",
      providerCancellationStatus:
        "provider_cancel_intent_persisted_token_unavailable",
      providerCancellationEvidenceId:
        "provider-cancel-intent:mar_1:image:img_task_1",
    });
    expect(cancellation.providerCancellationEvidence[0]).toMatchObject({
      evidenceId: "provider-cancel-intent:mar_1:image:img_task_1",
      status: "provider_cancel_intent_persisted_token_unavailable",
      durableBeforeRefund: true,
    });
  });

  it("dispatches provider hard cancellation when an authenticated media token exists", async () => {
    const calls: Array<{ taskId: string; userToken: string }> = [];
    const cancellation =
      await buildMarketplaceAutoReviewCancellationEvidenceForTest({
        runId: "mar_1",
        userToken: "user-token-1",
        cancelTask: async (taskId, userToken) => {
          calls.push({ taskId, userToken });
          return { id: taskId, taskId, status: "cancelled" } as any;
        },
        refs: [
          {
            unitId: "shot-1-frame",
            mediaType: "image",
            stageKey: "image_generation",
            role: "storyboard_frame",
            attempt: 1,
            taskId: "img_task_1",
            providerTaskId: "provider_img_1",
            model: "image-model",
            status: "processing",
            creditAmount: 3,
            creditTransactionId: 101,
            creditIdempotencyKey: "img-credit-1",
            submittedAt: "2026-05-31T00:00:00.000Z",
          },
        ],
      });

    expect(calls).toEqual([
      { taskId: "img_task_1", userToken: "user-token-1" },
    ]);
    expect(cancellation.refs[0]).toMatchObject({
      status: "cancellation_requested",
      providerCancellationStatus: "provider_cancel_dispatched:cancelled",
      providerCancellationEvidenceId:
        "provider-cancel-intent:mar_1:image:img_task_1",
    });
    expect(cancellation.providerCancellationEvidence[0]).toMatchObject({
      evidenceId: "provider-cancel-intent:mar_1:image:img_task_1",
      status: "provider_cancel_dispatched:cancelled",
      durableBeforeRefund: true,
    });
    expect(cancellation.providerCancellationEvidence[0].dispatchedAt).toEqual(
      expect.any(String)
    );
  });
});
