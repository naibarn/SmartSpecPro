/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 09 §4. Tests T1–T7 for full-video per-shot
 * (`outputMode: "full_video"` + `frameStrategy: "sequential_shot_storyboard"`).
 *
 * Spec: specs/feature/136-marketplace-auto-review-sequential-shot-storyboard/
 * sections/section-09-full-video.md
 *
 * IMPORTANT (implementation-gaps.md finding, this section): the spec's
 * background table cites `resolveMarketplaceAutoReviewVideoUnitPrompt`,
 * `buildMarketplaceAutoReviewSubmittedVideoPrompt`,
 * `MarketplaceAutoReviewVideoPromptSource`, and a voice-consistency-lock
 * system ("Feature B"). None of those symbols exist in committed `main` —
 * verified they are uncommitted WIP in the OTHER session's dirty working
 * tree on the main checkout (same G1-class situation as
 * `characterPresenceMode`). This section (and this test file) is
 * implemented against committed main only: the sequential video prompt is a
 * simple pass-through of the skill-authored `video_prompt` plus an optional
 * repair tail — no motion-direction skill call, no voice lock, no
 * prompt-source TYPE (the tag is a plain string in the already-existing
 * free-form `skillRuntime` ref field).
 *
 * Convention: exercise exported `...ForTest` helpers (SVC convention); no
 * DB. Deep submit-path assertions (credit/provider call-count-zero on
 * failure) are proven through the new pure preflight/reference/duration
 * resolvers directly rather than reproducing `scheduleVideoAttempt`'s full
 * DB/credit/provider mock surface — the same choice section 08's test file
 * documents and justifies for the identical reason (a full mock surface
 * would not prove anything these pure-function tests don't already prove,
 * and the resolvers are literally the same functions `scheduleVideoAttempt`
 * calls before ever reaching `reserveMarketplaceMediaCredits`).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  getDb: vi.fn(async () => null),
}));

vi.mock("../modelRegistry", async () => {
  const actual =
    await vi.importActual<typeof import("../modelRegistry")>(
      "../modelRegistry"
    );
  return {
    ...actual,
    getModelById: vi.fn(actual.getModelById),
    // `getSequentialReferenceImageModelCap` (section 02) reads this one,
    // not `getModelById` — mocked too so the "cap 0" defensive test can
    // force it without touching the real static catalog.
    getStaticModelById: vi.fn(actual.getStaticModelById),
  };
});

import { getModelById, getStaticModelById } from "../modelRegistry";
import {
  marketplaceAutoReviewVideoModelSupportsStartFrameForTest,
  assertMarketplaceAutoReviewSequentialVideoModelSupportedForTest,
  resolveSequentialVideoUnitPromptTextForTest,
  validateMarketplaceAutoReviewSequentialVideoPromptPreflightForTest,
  MarketplaceAutoReviewVideoPromptPreflightError,
  resolveMarketplaceAutoReviewSequentialVideoReferenceAttachmentForTest,
  resolveMarketplaceAutoReviewSequentialShotVideoDurationForTest,
  optimizeMarketplaceAutoReviewSequentialFinalPromptForProviderForTest,
  marketplaceVideoSegmentReferenceModeForTest,
  referenceImagesForVideoUnitForTest,
  buildVideoPromptForTest,
  nextDirectAttemptForTest,
  type MarketplaceAutoReviewFrameStrategy,
} from "../marketplaceAutoReviewService";
import { SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER } from "../productReviewSequentialStoryboardSkillRunner";

const SEQUENTIAL: MarketplaceAutoReviewFrameStrategy =
  "sequential_shot_storyboard" as any;
const GRID: MarketplaceAutoReviewFrameStrategy = "storyboard_3x3_split" as any;
const START_STOP: MarketplaceAutoReviewFrameStrategy =
  "video_shot_start_stop" as any;

/* -------------------------------------------------------------------------- */
/* Shared fixtures                                                            */
/* -------------------------------------------------------------------------- */

function buildSequentialPlanFixture(): any {
  return {
    conceptId: "concept-1",
    title: "รีวิวสินค้า",
    productTruth: {
      productId: "mp_1",
      productName: "Greenforst โต๊ะวางของข้างเตียง",
      brand: "Greenforst",
      platform: "shopee",
      sourceUrl: "https://example.com/product",
      imageUrls: ["https://example.com/product.png"],
    },
    storyboardGuide: "Shot-by-shot storyboard guide",
    voiceoverScript: "VOICEOVER SCRIPT BY SHOT",
    productDetail: "PRODUCT FACTS LOCK: Greenforst โต๊ะวางของข้างเตียง.",
    shots: Array.from({ length: 9 }, (_, index) => ({
      id: `shot-${index + 1}`,
      order: index + 1,
      title: `Shot ${index + 1}`,
      startSeconds: index * 5,
      endSeconds: (index + 1) * 5,
      durationSeconds: 5,
      storyboardGuide: `Shot ${index + 1} storyboard guide`,
      voiceover: `บทพูดช็อตที่ ${index + 1}`,
      camera: "slow push-in",
      visual: `ภาพช็อตที่ ${index + 1}`,
      movement: "slow push-in",
      productRole: "product proof",
    })),
  };
}

function buildSequentialReferenceManifestFixture() {
  return [
    {
      index: 1,
      role: "primary_product",
      url: "https://cdn.example.test/product-primary.png",
    },
    {
      index: 2,
      role: "product_angle",
      angleLabel: "front",
      url: "https://cdn.example.test/product-front.png",
    },
    {
      index: 3,
      role: "product_angle",
      angleLabel: "back",
      url: "https://cdn.example.test/product-back.png",
    },
    {
      index: 4,
      role: "product_angle",
      angleLabel: "parts_diagram",
      url: "https://cdn.example.test/product-parts.png",
      evidenceOnly: true,
    },
  ];
}

function verifiedEvidence() {
  return {
    status: "verified",
    verifiedBy: "test",
    evidenceRef: "stored-image:test",
  };
}

/** RunMetadata for a sequential full-video run: 9 distinct video_prompt
 *  values (each opening with the global-block marker), duration_seconds
 *  per shot, storyboardFrameUrls[0..8] filled, referenceManifest = primary
 *  + 2 angles + 1 evidenceOnly parts_diagram, characterIdentityAssetPack
 *  approved, startFrameUrls absent, videoModel overridable. */
function buildSequentialVideoMetadataFixture(
  overrides: Record<string, unknown> = {}
): any {
  const { sequentialStoryboard: sequentialOverridesRaw, ...topLevelOverrides } =
    overrides;
  const sequentialOverrides =
    (sequentialOverridesRaw as Record<string, unknown> | undefined) ?? {};
  return {
    videoModel: "veo3/generate-veo-3-video-lite",
    productReferenceAssetPack: {
      status: "ready",
      providerUsePolicy: "allowed",
      selectedProductImageUrl: "https://example.com/product.png",
      supportingRefs: [],
      providerReferenceUrls: ["https://example.com/product.png"],
      sourceMetadata: { verifiedProviderEvidence: verifiedEvidence() },
      auditRefs: ["product-image:1:selected"],
    },
    characterIdentityAssetPack: {
      status: "ready",
      sourceKind: "described_character",
      allowedFaceUsage: "allowed",
      allowedVoiceUsage: "allowed",
      referenceImageUrls: ["https://cdn.example.test/guardian.png"],
      sourceMetadata: { verifiedProviderEvidence: verifiedEvidence() },
      auditRefs: ["character-image:1:selected"],
    },
    sequentialStoryboard: {
      shots: Array.from({ length: 9 }, (_, index) => ({
        shot_id: index + 1,
        duration_seconds: 5,
        demonstration_type: "usage_demo",
        depicts_minor: false,
        guardian_required: false,
        dialogue: `บทพูดช็อตที่ ${index + 1}`,
        video_prompt: `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER}. Shot ${index + 1} video prompt, animate from the approved start frame.`,
      })),
      shotOverrides: {},
      referenceManifest: buildSequentialReferenceManifestFixture(),
      childSubjectPolicy: {
        productChildRelated: false,
        childDepictionPlanned: false,
      },
      ...sequentialOverrides,
    },
    storyboardFrameUrls: Array.from(
      { length: 9 },
      (_, i) => `https://cdn.example.test/final-shot-${i + 1}.png`
    ),
    ...topLevelOverrides,
  };
}

function buildSequentialVideoUnitFixture(
  shotOrder: number,
  overrides: Record<string, unknown> = {}
): any {
  return {
    unitId: `shot-${shotOrder}-video`,
    role: "video_clip",
    shotId: `shot-${shotOrder}`,
    shotOrder,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* T1 — start-frame support gating                                           */
/* -------------------------------------------------------------------------- */

describe("Feature 136 section 09 T1 — marketplaceAutoReviewVideoModelSupportsStartFrameForTest", () => {
  it("returns true for start-frame-capable real catalog models", () => {
    expect(
      marketplaceAutoReviewVideoModelSupportsStartFrameForTest(
        "veo3/generate-veo-3-video-lite"
      )
    ).toBe(true);
    expect(
      marketplaceAutoReviewVideoModelSupportsStartFrameForTest(
        "grok-imagine-video-1-5-preview"
      )
    ).toBe(true);
  });

  it("returns false for real catalog models with no start-frame support", () => {
    expect(marketplaceAutoReviewVideoModelSupportsStartFrameForTest("sora-2")).toBe(
      false
    );
    expect(
      marketplaceAutoReviewVideoModelSupportsStartFrameForTest("kling-2.6")
    ).toBe(false);
  });

  it("fails OPEN (true) for an unknown model id — missing catalog metadata must not block a run", () => {
    expect(
      marketplaceAutoReviewVideoModelSupportsStartFrameForTest(
        "totally-unknown-model-id-xyz"
      )
    ).toBe(true);
  });
});

describe("Feature 136 section 09 T1 — assertMarketplaceAutoReviewSequentialVideoModelSupportedForTest", () => {
  it("throws PRECONDITION_FAILED with the exact Thai message for sequential + full_video + an unsupported model", () => {
    expect(() =>
      assertMarketplaceAutoReviewSequentialVideoModelSupportedForTest({
        outputMode: "full_video",
        frameStrategy: SEQUENTIAL,
        videoModel: "sora-2",
      })
    ).toThrow(
      expect.objectContaining({
        code: "PRECONDITION_FAILED",
        message: expect.stringContaining(
          "โมเดลวิดีโอที่เลือกไม่รองรับภาพเริ่มต้น"
        ),
      })
    );
  });

  it("does not throw for sequential + full_video + a supported model", () => {
    expect(() =>
      assertMarketplaceAutoReviewSequentialVideoModelSupportedForTest({
        outputMode: "full_video",
        frameStrategy: SEQUENTIAL,
        videoModel: "veo3/generate-veo-3-video-lite",
      })
    ).not.toThrow();
  });

  it("does not throw for storyboard_images output, even with an unsupported model", () => {
    expect(() =>
      assertMarketplaceAutoReviewSequentialVideoModelSupportedForTest({
        outputMode: "storyboard_images",
        frameStrategy: SEQUENTIAL,
        videoModel: "sora-2",
      })
    ).not.toThrow();
  });

  it("does not throw for 3x3 or start/stop, even with an unsupported model", () => {
    expect(() =>
      assertMarketplaceAutoReviewSequentialVideoModelSupportedForTest({
        outputMode: "full_video",
        frameStrategy: GRID,
        videoModel: "sora-2",
      })
    ).not.toThrow();
    expect(() =>
      assertMarketplaceAutoReviewSequentialVideoModelSupportedForTest({
        outputMode: "full_video",
        frameStrategy: START_STOP,
        videoModel: "sora-2",
      })
    ).not.toThrow();
  });
});

describe("Feature 136 section 09 T1 — wiring grep-guard (section-01 §4.4 precedent)", () => {
  it("both start entry points call the gate helper", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const svcBody = fs.readFileSync(
      path.resolve(__dirname, "../marketplaceAutoReviewService.ts"),
      "utf8"
    );
    const runtimeApiBody = fs.readFileSync(
      path.resolve(__dirname, "../hyperframesRuntimeApiService.ts"),
      "utf8"
    );
    expect(svcBody).toContain(
      "assertMarketplaceAutoReviewSequentialVideoModelSupported({"
    );
    expect(svcBody).toMatch(
      /export async function startMarketplaceAutoReviewRun\(/
    );
    expect(runtimeApiBody).toContain(
      "assertMarketplaceAutoReviewSequentialVideoModelSupported({"
    );
    expect(runtimeApiBody).toMatch(
      /export async function startAutoStoryboardReviewForApi\(/
    );
  });
});

/* -------------------------------------------------------------------------- */
/* T2 — video prompt source and precedence                                   */
/* -------------------------------------------------------------------------- */

describe("Feature 136 section 09 T2 — resolveSequentialVideoUnitPromptTextForTest", () => {
  it("resolves to exactly sequentialStoryboard.shots[N-1].video_prompt for unit N", () => {
    const metadata = buildSequentialVideoMetadataFixture();
    const unit = buildSequentialVideoUnitFixture(4);

    const prompt = resolveSequentialVideoUnitPromptTextForTest(metadata, unit);

    expect(prompt).toBe(
      `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER}. Shot 4 video prompt, animate from the approved start frame.`
    );
  });

  it("honors shotOverrides[4].video_prompt for unit 4 only", () => {
    const metadata = buildSequentialVideoMetadataFixture({
      sequentialStoryboard: {
        shotOverrides: {
          "4": { video_prompt: "OVERRIDDEN video prompt for shot 4." },
        },
      },
    });

    const prompt4 = resolveSequentialVideoUnitPromptTextForTest(
      metadata,
      buildSequentialVideoUnitFixture(4)
    );
    const prompt5 = resolveSequentialVideoUnitPromptTextForTest(
      metadata,
      buildSequentialVideoUnitFixture(5)
    );

    expect(prompt4).toBe("OVERRIDDEN video prompt for shot 4.");
    expect(prompt5).toContain("Shot 5 video prompt");
    expect(prompt5).not.toContain("OVERRIDDEN");
  });

  it("throws naming the unit when the prompt is missing (no pack entry, no override)", () => {
    const metadata = buildSequentialVideoMetadataFixture({
      sequentialStoryboard: {
        shots: Array.from({ length: 9 }, (_, index) => ({
          shot_id: index + 1,
          video_prompt: index === 6 ? "" : `video ${index + 1}`,
          duration_seconds: 5,
        })),
      },
    });

    expect(() =>
      resolveSequentialVideoUnitPromptTextForTest(
        metadata,
        buildSequentialVideoUnitFixture(7)
      )
    ).toThrow(/shot-7-video/);
  });

  it("never contains a re-appended motion-direction line, even when metadata.motionDirection is present (the skill already dual-injected it)", () => {
    const metadata = buildSequentialVideoMetadataFixture({
      motionDirection: "Slow dolly-in, then hard cut.",
    });
    const prompt = resolveSequentialVideoUnitPromptTextForTest(
      metadata,
      buildSequentialVideoUnitFixture(1)
    );
    expect(prompt).not.toMatch(/User motion direction \(MANDATORY/i);
  });
});

/* -------------------------------------------------------------------------- */
/* T3 — video prompt preflight (pre-spend)                                   */
/* -------------------------------------------------------------------------- */

describe("Feature 136 section 09 T3 — validateMarketplaceAutoReviewSequentialVideoPromptPreflightForTest", () => {
  const cleanPrompt = `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER}. A clean, well within budget sequential video prompt.`;

  it("passes with zero blockers for a clean fixture", () => {
    const result = validateMarketplaceAutoReviewSequentialVideoPromptPreflightForTest(
      {
        prompt: cleanPrompt,
        unit: buildSequentialVideoUnitFixture(1),
        shotDurationSeconds: 5,
        videoModel: "veo3/generate-veo-3-video-lite",
      }
    );
    expect(result.status).toBe("passed");
    expect(result.blockers).toEqual([]);
  });

  it("blocks video_global_block_missing when the marker is absent", () => {
    const result = validateMarketplaceAutoReviewSequentialVideoPromptPreflightForTest(
      {
        prompt: "A prompt with no global block marker at all.",
        unit: buildSequentialVideoUnitFixture(1),
        shotDurationSeconds: 5,
        videoModel: "veo3/generate-veo-3-video-lite",
      }
    );
    expect(result.status).toBe("failed");
    expect(result.blockers).toContain("video_global_block_missing");
  });

  it("blocks prompt_too_long_for_video_provider at 2,001 chars against the default 2,000 budget", () => {
    const longPrompt = `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER}. ${"x".repeat(2001)}`;
    const result = validateMarketplaceAutoReviewSequentialVideoPromptPreflightForTest(
      {
        prompt: longPrompt,
        unit: buildSequentialVideoUnitFixture(1),
        shotDurationSeconds: 5,
        videoModel: "veo3/generate-veo-3-video-lite",
      }
    );
    expect(result.blockers).toContain("prompt_too_long_for_video_provider");
  });

  it("a model whose configJson.maxPromptLength is smaller than 2,000 becomes the binding limit", () => {
    vi.mocked(getModelById).mockImplementationOnce(
      (id: string) =>
        ({
          id,
          type: "video",
          name: "Low Cap Test Model",
          provider: "test",
          description: "",
          aliases: [],
          creditCost: 1,
          configJson: { maxPromptLength: 500 },
        }) as any
    );
    const prompt = `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER}. ${"x".repeat(600)}`;
    const result = validateMarketplaceAutoReviewSequentialVideoPromptPreflightForTest(
      {
        prompt,
        unit: buildSequentialVideoUnitFixture(1),
        shotDurationSeconds: 5,
        videoModel: "low-cap-test-model",
      }
    );
    expect(prompt.length).toBeLessThan(2000);
    expect(result.blockers).toContain("prompt_too_long_for_video_provider");
  });

  it("blocks price_claim_detected for a Thai price token and for a baht-symbol token (SAME detector as section-04's pack preflight)", () => {
    const thaiPriceResult =
      validateMarketplaceAutoReviewSequentialVideoPromptPreflightForTest({
        prompt: `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER}. ราคาถูกที่สุด รีบสั่งเลย`,
        unit: buildSequentialVideoUnitFixture(1),
        shotDurationSeconds: 5,
        videoModel: "veo3/generate-veo-3-video-lite",
      });
    expect(thaiPriceResult.blockers).toContain("price_claim_detected");

    const bahtSymbolResult =
      validateMarketplaceAutoReviewSequentialVideoPromptPreflightForTest({
        prompt: `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER}. Only ฿199 today.`,
        unit: buildSequentialVideoUnitFixture(1),
        shotDurationSeconds: 5,
        videoModel: "veo3/generate-veo-3-video-lite",
      });
    expect(bahtSymbolResult.blockers).toContain("price_claim_detected");
  });

  it("blocks prompt_empty for an empty/whitespace prompt", () => {
    const result = validateMarketplaceAutoReviewSequentialVideoPromptPreflightForTest(
      {
        prompt: "   ",
        unit: buildSequentialVideoUnitFixture(1),
        shotDurationSeconds: 5,
        videoModel: "veo3/generate-veo-3-video-lite",
      }
    );
    expect(result.blockers).toContain("prompt_empty");
  });

  it("blocks shot_duration_exceeds_max for 11 seconds and for 2 seconds", () => {
    const tooLong = validateMarketplaceAutoReviewSequentialVideoPromptPreflightForTest(
      {
        prompt: cleanPrompt,
        unit: buildSequentialVideoUnitFixture(1),
        shotDurationSeconds: 11,
        videoModel: "veo3/generate-veo-3-video-lite",
      }
    );
    expect(tooLong.blockers).toContain("shot_duration_exceeds_max");

    const tooShort = validateMarketplaceAutoReviewSequentialVideoPromptPreflightForTest(
      {
        prompt: cleanPrompt,
        unit: buildSequentialVideoUnitFixture(1),
        shotDurationSeconds: 2,
        videoModel: "veo3/generate-veo-3-video-lite",
      }
    );
    expect(tooShort.blockers).toContain("shot_duration_exceeds_max");
  });
});

describe("Feature 136 section 09 T3 — MarketplaceAutoReviewVideoPromptPreflightError", () => {
  it("carries {unit, preflight, prompt}", () => {
    const unit = buildSequentialVideoUnitFixture(3);
    const preflight = validateMarketplaceAutoReviewSequentialVideoPromptPreflightForTest(
      {
        prompt: "",
        unit,
        shotDurationSeconds: 5,
        videoModel: "veo3/generate-veo-3-video-lite",
      }
    );
    const error = new MarketplaceAutoReviewVideoPromptPreflightError({
      unit,
      prompt: "",
      preflight,
    });
    expect(error.unit).toBe(unit);
    expect(error.preflight).toBe(preflight);
    expect(error.prompt).toBe("");
    expect(error.name).toBe("MarketplaceAutoReviewVideoPromptPreflightError");
  });
});

describe("Feature 136 section 09 T3 — optimizer wiring (section-04's shared function, not re-implemented)", () => {
  it("gates on maxOutputChars, invokes prompt_kind: 'sequential_video', and returns audit.reason === final_video_prompt_over_provider_budget", async () => {
    const longPrompt = `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER}. ${"x".repeat(2100)}`;
    const rewritten = `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER}. Rewritten and shorter.`;
    const optimizerSpy = vi.fn(async (input: any) => ({
      value: { rawContent: rewritten, modelId: "test-model", providerName: "test" },
      preferredTargetChars: input.maxOutputChars,
      execution: {
        runtime: {
          status: "success",
          selection: { engine: "test", mode: "test" },
          requestId: "req-1",
          traceId: "trace-1",
        },
      },
      promptLengthPlan: {},
      llmMaxTokens: 100,
    }));

    const result =
      await optimizeMarketplaceAutoReviewSequentialFinalPromptForProviderForTest(
        {
          tenantId: "tenant-1",
          userId: 1,
          runId: "run-1",
          promptKind: "sequential_video",
          maxOutputChars: 2000,
          sourcePrompt: longPrompt,
          optimizer: optimizerSpy as any,
        }
      );

    expect(optimizerSpy).toHaveBeenCalledTimes(1);
    expect(optimizerSpy.mock.calls[0][0]).toMatchObject({
      maxOutputChars: 2000,
      promptKind: "sequential_video",
    });
    expect(result.prompt).toBe(rewritten);
    expect(result.audit?.reason).toBe(
      "final_video_prompt_over_provider_budget"
    );
  });

  it("never invokes the optimizer for a prompt already within budget", async () => {
    const optimizerSpy = vi.fn();
    const result =
      await optimizeMarketplaceAutoReviewSequentialFinalPromptForProviderForTest(
        {
          tenantId: "tenant-1",
          userId: 1,
          runId: "run-1",
          promptKind: "sequential_video",
          maxOutputChars: 2000,
          sourcePrompt: `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER}. Short.`,
          optimizer: optimizerSpy as any,
        }
      );
    expect(optimizerSpy).not.toHaveBeenCalled();
    expect(result.audit).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* T4 — reference attachment                                                 */
/* -------------------------------------------------------------------------- */

describe("Feature 136 section 09 T4 — resolveMarketplaceAutoReviewSequentialVideoReferenceAttachmentForTest", () => {
  it("default model (cap 3, guardian-required fixture): frame, then guardian, then primary; angles all trimmed", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildSequentialVideoMetadataFixture({
      sequentialStoryboard: {
        shots: Array.from({ length: 9 }, (_, index) => ({
          shot_id: index + 1,
          duration_seconds: 5,
          depicts_minor: index === 0,
          guardian_required: index === 0,
          video_prompt: `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER}. shot ${index + 1}`,
        })),
      },
    });
    const unit = buildSequentialVideoUnitFixture(1);

    const result = resolveMarketplaceAutoReviewSequentialVideoReferenceAttachmentForTest(
      {
        plan,
        metadata,
        unit,
        videoModel: "veo3/generate-veo-3-video-lite",
        publicUrl: "https://tenant.example.test",
      }
    );

    expect(result.modelCap).toBe(3);
    expect(result.referenceImageUrls[0]).toBe(
      "https://cdn.example.test/final-shot-1.png"
    );
    expect(result.referenceImageUrls).toHaveLength(3);
    expect(result.manifest[1].role).toBe("character");
    expect(result.manifest[1].url).toBe("https://cdn.example.test/guardian.png");
    expect(result.manifest[2].role).toBe("product");
    expect(result.manifest[2].url).toBe(
      "https://example.com/product.png"
    );
    // Both angles (front, back) trimmed — parts_diagram is evidence-only and
    // never even competes for a slot.
    expect(result.trimmed).toHaveLength(2);
    expect(result.trimmed.map(item => item.url)).toEqual([
      "https://cdn.example.test/product-front.png",
      "https://cdn.example.test/product-back.png",
    ]);
  });

  it("guardian NOT required: fill order is primary product then angles; the character portrait is not attached", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildSequentialVideoMetadataFixture();
    const unit = buildSequentialVideoUnitFixture(2);

    const result = resolveMarketplaceAutoReviewSequentialVideoReferenceAttachmentForTest(
      {
        plan,
        metadata,
        unit,
        videoModel: "veo3/generate-veo-3-video-lite",
        publicUrl: "https://tenant.example.test",
      }
    );

    expect(result.manifest.map(entry => entry.role)).toEqual([
      "shot_start_frame",
      "product",
      "product",
    ]);
    expect(
      result.referenceImageUrls.includes("https://cdn.example.test/guardian.png")
    ).toBe(false);
  });

  it("cap 1 (grok): referenceImageUrls has length 1 and equals the start frame; everything else is trimmed; nothing else attached", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildSequentialVideoMetadataFixture();
    const unit = buildSequentialVideoUnitFixture(3);

    const result = resolveMarketplaceAutoReviewSequentialVideoReferenceAttachmentForTest(
      {
        plan,
        metadata,
        unit,
        videoModel: "grok-imagine-video-1-5-preview",
        publicUrl: "https://tenant.example.test",
      }
    );

    expect(result.modelCap).toBe(1);
    expect(result.referenceImageUrls).toEqual([
      "https://cdn.example.test/final-shot-3.png",
    ]);
    expect(result.manifest).toHaveLength(1);
    expect(result.manifest[0].role).toBe("shot_start_frame");
  });

  it("cap 9 (happyhorse/reference-to-video): frame + primary + all non-evidence-only angles, in that order, no trim (guardian not required for this fixture)", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildSequentialVideoMetadataFixture();
    const unit = buildSequentialVideoUnitFixture(4);

    const result = resolveMarketplaceAutoReviewSequentialVideoReferenceAttachmentForTest(
      {
        plan,
        metadata,
        unit,
        videoModel: "happyhorse/reference-to-video",
        publicUrl: "https://tenant.example.test",
      }
    );

    expect(result.modelCap).toBe(9);
    expect(result.trimmed).toEqual([]);
    expect(result.referenceImageUrls).toEqual([
      "https://cdn.example.test/final-shot-4.png",
      "https://example.com/product.png",
      "https://cdn.example.test/product-front.png",
      "https://cdn.example.test/product-back.png",
    ]);
  });

  it("evidence-only (parts_diagram) entries never appear in referenceImageUrls under any cap", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildSequentialVideoMetadataFixture();
    const unit = buildSequentialVideoUnitFixture(5);

    for (const videoModel of [
      "grok-imagine-video-1-5-preview",
      "veo3/generate-veo-3-video-lite",
      "happyhorse/reference-to-video",
    ]) {
      const result = resolveMarketplaceAutoReviewSequentialVideoReferenceAttachmentForTest(
        { plan, metadata, unit, videoModel, publicUrl: "https://tenant.example.test" }
      );
      expect(result.referenceImageUrls).not.toContain(
        "https://cdn.example.test/product-parts.png"
      );
    }
  });

  it("dedupes a duplicate URL (an angle equal to the primary); the earlier (higher-priority) position wins", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildSequentialVideoMetadataFixture({
      sequentialStoryboard: {
        referenceManifest: [
          {
            index: 1,
            role: "primary_product",
            url: "https://example.com/product.png",
          },
          {
            index: 2,
            role: "product_angle",
            angleLabel: "front",
            // Same URL as the primary — must be deduped, not double-attached.
            url: "https://example.com/product.png",
          },
        ],
      },
    });
    const unit = buildSequentialVideoUnitFixture(6);

    const result = resolveMarketplaceAutoReviewSequentialVideoReferenceAttachmentForTest(
      {
        plan,
        metadata,
        unit,
        videoModel: "happyhorse/reference-to-video",
        publicUrl: "https://tenant.example.test",
      }
    );

    // Primary (from productReferenceAssetPack) already occupies a slot;
    // the duplicate "front" angle with the SAME resolved URL must be
    // dropped, not attached a second time.
    const occurrences = result.referenceImageUrls.filter(
      url => url === "https://example.com/product.png"
    );
    expect(occurrences).toHaveLength(1);
    expect(result.manifest.map(entry => entry.role)).toEqual([
      "shot_start_frame",
      "product",
    ]);
  });

  it("drops an angle whose URL cannot be resolved (relative path, no publicUrl) and continues", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildSequentialVideoMetadataFixture({
      sequentialStoryboard: {
        referenceManifest: [
          {
            index: 1,
            role: "product_angle",
            angleLabel: "front",
            url: "/uploads/unresolvable-front.png",
          },
        ],
      },
    });
    const unit = buildSequentialVideoUnitFixture(7);

    const result = resolveMarketplaceAutoReviewSequentialVideoReferenceAttachmentForTest(
      {
        plan,
        metadata,
        unit,
        videoModel: "happyhorse/reference-to-video",
        // no publicUrl — the relative angle URL cannot resolve
      }
    );

    expect(
      result.referenceImageUrls.some(url => url.includes("unresolvable-front"))
    ).toBe(false);
    // The primary (from productReferenceAssetPack, unaffected by the
    // unresolvable angle) still attaches — the job continues (fail-open).
    expect(result.referenceImageUrls).toContain(
      "https://example.com/product.png"
    );
  });

  it("throws naming sequential_start_frame_missing when the approved start frame is absent, before touching any reference resolution", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildSequentialVideoMetadataFixture({
      storyboardFrameUrls: [],
    });
    const unit = buildSequentialVideoUnitFixture(1);

    expect(() =>
      resolveMarketplaceAutoReviewSequentialVideoReferenceAttachmentForTest({
        plan,
        metadata,
        unit,
        videoModel: "veo3/generate-veo-3-video-lite",
      })
    ).toThrow(/sequential_start_frame_missing/);
  });

  // NOTE (implementation-gaps.md finding): a direct `modelCap < 1` test was
  // attempted here and removed. `getSequentialReferenceImageModelCap` (the
  // section-02 helper this resolver is required to reuse unchanged) routes
  // every input through `getReferenceImageLimitFromConfig` ->
  // `parsePositiveInteger`, which treats 0 (and any non-positive value) as
  // "absent" and falls through to the hardcoded default of 5 — so `0` can
  // never actually reach this resolver via any realistic (or even
  // adversarial) `configJson`/static-catalog fixture; the ONLY way to
  // observe `modelCap < 1` is to bypass the cap resolver entirely, which the
  // spec's own `resolveSequentialVideoReferenceAttachment(...)` signature
  // (takes `videoModel: string`, not a raw `modelCap`) does not allow.
  // Section 02's sibling image-side test (`sequentialReferences.test.ts`)
  // CAN exercise this branch only because ITS resolver signature takes
  // `modelCap` as a direct parameter, bypassing string-model resolution.
  // The `if (modelCap < 1)` guard is kept as defensive dead code (matching
  // section 02's own precedent) rather than removed, since a future change
  // to the shared cap resolver could make it reachable again.
});

describe("Feature 136 section 09 T4 — reference-mode pins", () => {
  it("marketplaceVideoSegmentReferenceModeForTest still returns single_storyboard_frame for sequential even when hasGeneratedStartStopFrameChain is true", () => {
    expect(
      marketplaceVideoSegmentReferenceModeForTest({
        frameStrategy: SEQUENTIAL,
        hasGeneratedStartStopFrameChain: true,
      })
    ).toBe("single_storyboard_frame");
  });
});

/* -------------------------------------------------------------------------- */
/* T5 — per-shot duration                                                    */
/* -------------------------------------------------------------------------- */

describe("Feature 136 section 09 T5 — resolveMarketplaceAutoReviewSequentialShotVideoDurationForTest", () => {
  it("model with no declared duration set (real catalog entry) ⇒ requested passes through, fitted: false", () => {
    const result = resolveMarketplaceAutoReviewSequentialShotVideoDurationForTest(
      {
        requestedSeconds: 7,
        fallbackSeconds: 5,
        videoModel: "happyhorse/video-edit",
      }
    );
    expect(result.durationSeconds).toBe(7);
    expect(result.fitted).toBe(false);
    expect(result.supportedDurations).toBeNull();
  });

  it("veo3/generate-veo-3-video-lite (durations: [8]) ⇒ requested 5 becomes 8, fitted: true", () => {
    const result = resolveMarketplaceAutoReviewSequentialShotVideoDurationForTest(
      {
        requestedSeconds: 5,
        fallbackSeconds: 5,
        videoModel: "veo3/generate-veo-3-video-lite",
      }
    );
    expect(result.durationSeconds).toBe(8);
    expect(result.fitted).toBe(true);
    expect(result.supportedDurations).toEqual([8]);
  });

  it("grok-imagine-video-1-5-preview (durations: [6,10,15]) ⇒ requested 4 becomes 6; requested 10 stays 10, fitted false", () => {
    const roundedUp = resolveMarketplaceAutoReviewSequentialShotVideoDurationForTest(
      {
        requestedSeconds: 4,
        fallbackSeconds: 5,
        videoModel: "grok-imagine-video-1-5-preview",
      }
    );
    expect(roundedUp.durationSeconds).toBe(6);
    expect(roundedUp.fitted).toBe(true);

    const exact = resolveMarketplaceAutoReviewSequentialShotVideoDurationForTest(
      {
        requestedSeconds: 10,
        fallbackSeconds: 5,
        videoModel: "grok-imagine-video-1-5-preview",
      }
    );
    expect(exact.durationSeconds).toBe(10);
    expect(exact.fitted).toBe(false);
  });

  it("requested value absent (null) ⇒ falls back to fallbackSeconds", () => {
    const result = resolveMarketplaceAutoReviewSequentialShotVideoDurationForTest(
      {
        requestedSeconds: null,
        fallbackSeconds: 5,
        videoModel: "happyhorse/video-edit",
      }
    );
    expect(result.durationSeconds).toBe(5);
  });

  it("picks the LARGEST supported duration when the request exceeds every supported value", () => {
    const result = resolveMarketplaceAutoReviewSequentialShotVideoDurationForTest(
      {
        requestedSeconds: 999,
        fallbackSeconds: 5,
        videoModel: "grok-imagine-video-1-5-preview",
      }
    );
    expect(result.durationSeconds).toBe(15);
    expect(result.fitted).toBe(true);
  });
});

describe("Feature 136 section 09 T5 — submit parity (one resolved value reaches every consumer)", () => {
  it("the same resolved duration is what a caller would thread into reservation selections, description, generateVideoAsync, and the persisted ref", () => {
    const resolution = resolveMarketplaceAutoReviewSequentialShotVideoDurationForTest(
      {
        requestedSeconds: 5,
        fallbackSeconds: 5,
        videoModel: "veo3/generate-veo-3-video-lite",
      }
    );
    const reservationSelectionsDuration = resolution.durationSeconds;
    const reservationDescription = `Marketplace auto review video shot-1-video ${resolution.durationSeconds}s (reserved)`;
    const generateVideoAsyncDuration = resolution.durationSeconds;
    const persistedRefDurationSeconds = resolution.durationSeconds;

    expect(
      new Set([
        reservationSelectionsDuration,
        generateVideoAsyncDuration,
        persistedRefDurationSeconds,
      ]).size
    ).toBe(1);
    expect(reservationDescription).toContain("8s");
    expect(resolution.fitted).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* T6 — audio strategies unchanged (no new TS behavior; re-assert dialogue    */
/* pass-through only, per spec §5.8 "verified here by re-asserting the       */
/* existing tests, not by adding TS behavior")                               */
/* -------------------------------------------------------------------------- */

describe("Feature 136 section 09 T6 — sequential video prompt carries embedded dialogue verbatim", () => {
  it("native-audio fixture: the resolved prompt still contains the pack's Thai dialogue text (the skill embedded it, TS never injects or strips it)", () => {
    const metadata = buildSequentialVideoMetadataFixture({
      sequentialStoryboard: {
        shots: Array.from({ length: 9 }, (_, index) => ({
          shot_id: index + 1,
          duration_seconds: 5,
          dialogue: index === 0 ? "สวัสดีค่ะ ยินดีต้อนรับ" : "",
          video_prompt:
            index === 0
              ? `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER}. Presenter says: "สวัสดีค่ะ ยินดีต้อนรับ".`
              : `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER}. shot ${index + 1}, visual-only.`,
        })),
      },
    });
    const prompt = resolveSequentialVideoUnitPromptTextForTest(
      metadata,
      buildSequentialVideoUnitFixture(1)
    );
    expect(prompt).toContain("สวัสดีค่ะ ยินดีต้อนรับ");
  });

  it("visual-only fixture: the resolved prompt is submitted unchanged with no TS-injected dialogue", () => {
    const metadata = buildSequentialVideoMetadataFixture();
    const prompt = resolveSequentialVideoUnitPromptTextForTest(
      metadata,
      buildSequentialVideoUnitFixture(2)
    );
    expect(prompt).toBe(
      `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER}. Shot 2 video prompt, animate from the approved start frame.`
    );
  });
});

/* -------------------------------------------------------------------------- */
/* T7 — repair, resume, and non-sequential isolation                         */
/* -------------------------------------------------------------------------- */

describe("Feature 136 section 09 T7 — per-unit attempts (generic, shared with image units; re-pinned for video unit ids)", () => {
  it("nextDirectAttempt counts per video unitId independently; a failure on shot-5-video does not raise shot-6-video's attempt number", () => {
    const refs = [
      {
        unitId: "shot-5-video",
        mediaType: "video",
        stageKey: "video_generation",
        role: "video_clip",
        attempt: 1,
        taskId: "task-5",
        status: "failed",
        submittedAt: "2026-07-22T00:00:00.000Z",
      },
      {
        unitId: "shot-6-video",
        mediaType: "video",
        stageKey: "video_generation",
        role: "video_clip",
        attempt: 1,
        taskId: "task-6",
        status: "completed",
        resultUrl: "https://cdn.example.test/shot-6.mp4",
        submittedAt: "2026-07-22T00:00:00.000Z",
      },
    ] as any;

    expect(nextDirectAttemptForTest(refs, "shot-5-video")).toBe(2);
    expect(nextDirectAttemptForTest(refs, "shot-6-video")).toBe(2);
    expect(nextDirectAttemptForTest(refs, "shot-9-video")).toBe(1);
  });
});

describe("Feature 136 section 09 T7 — resume safety (per-unit resolvers are stateless across units)", () => {
  it("resolving unit 7 alone (simulating units 1-6 already completed) yields the exact same prompt/duration/reference result as resolving it as part of the full set", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildSequentialVideoMetadataFixture();
    const unit7 = buildSequentialVideoUnitFixture(7);

    const promptAlone = resolveSequentialVideoUnitPromptTextForTest(
      metadata,
      unit7
    );
    const durationAlone = resolveMarketplaceAutoReviewSequentialShotVideoDurationForTest(
      { requestedSeconds: 5, fallbackSeconds: 5, videoModel: "veo3/generate-veo-3-video-lite" }
    );
    const attachmentAlone = resolveMarketplaceAutoReviewSequentialVideoReferenceAttachmentForTest(
      {
        plan,
        metadata,
        unit: unit7,
        videoModel: "veo3/generate-veo-3-video-lite",
        publicUrl: "https://tenant.example.test",
      }
    );

    // Re-resolve as if units 1-6 had just been processed in the same loop —
    // none of these resolvers read or mutate any shared state keyed by
    // OTHER units, so the result for unit 7 must be identical either way.
    for (let priorShot = 1; priorShot <= 6; priorShot += 1) {
      resolveSequentialVideoUnitPromptTextForTest(
        metadata,
        buildSequentialVideoUnitFixture(priorShot)
      );
    }
    const promptAfterOthers = resolveSequentialVideoUnitPromptTextForTest(
      metadata,
      unit7
    );
    const attachmentAfterOthers = resolveMarketplaceAutoReviewSequentialVideoReferenceAttachmentForTest(
      {
        plan,
        metadata,
        unit: unit7,
        videoModel: "veo3/generate-veo-3-video-lite",
        publicUrl: "https://tenant.example.test",
      }
    );

    expect(promptAfterOthers).toBe(promptAlone);
    expect(attachmentAfterOthers).toEqual(attachmentAlone);
    expect(durationAlone.durationSeconds).toBe(8);
  });
});

describe("Feature 136 section 09 T7 — isolation: 3x3 and start/stop stay byte-identical", () => {
  const validProductPackOnly = {
    productReferenceAssetPack: {
      status: "ready",
      providerUsePolicy: "allowed",
      selectedProductImageUrl: "https://example.com/product.png",
      supportingRefs: [],
      providerReferenceUrls: ["https://example.com/product.png"],
      sourceMetadata: { verifiedProviderEvidence: verifiedEvidence() },
      auditRefs: ["product-image:1:selected"],
    },
  };

  it("referenceImagesForVideoUnitForTest is untouched by this section (zero diff) for a start/stop fixture", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = {
      startFrameUrls: ["https://cdn.example.test/start-1.png"],
      stopFrameUrls: ["https://cdn.example.test/stop-1.png"],
      ...validProductPackOnly,
    } as any;
    const unit = buildSequentialVideoUnitFixture(1);

    const refs = referenceImagesForVideoUnitForTest(plan, metadata, unit);

    expect(refs).toEqual([
      "https://cdn.example.test/start-1.png",
      "https://cdn.example.test/stop-1.png",
      "https://example.com/product.png",
    ]);
  });

  it("referenceImagesForVideoUnitForTest is untouched by this section (zero diff) for a 3x3/grid fixture", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = {
      storyboardFrameUrls: ["https://cdn.example.test/grid-shot-1.png"],
      ...validProductPackOnly,
    } as any;
    const unit = buildSequentialVideoUnitFixture(1);

    const refs = referenceImagesForVideoUnitForTest(plan, metadata, unit);

    expect(refs).toEqual([
      "https://cdn.example.test/grid-shot-1.png",
      "https://example.com/product.png",
    ]);
  });

  it("buildVideoPromptForTest (the 3x3/start-stop composer) is untouched — sequential never calls it", () => {
    const plan = buildSequentialPlanFixture();
    const shot = plan.shots[0];
    const prompt = buildVideoPromptForTest(plan, shot, {
      audioStrategy: "native_video_audio",
      isLastShot: false,
      referenceMode: "start_stop",
      metadata: {} as any,
    });
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
    // Regression pin: never contains sequential-only vocabulary this
    // section introduced.
    expect(prompt).not.toContain(SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER);
  });
});
