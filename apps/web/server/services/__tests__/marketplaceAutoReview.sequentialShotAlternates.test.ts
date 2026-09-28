/**
 * Marketplace spare-image repair (CMD-2 backend).
 *
 * Every non-selected `imageAttemptReviews[]` wave still holds already-
 * generated, already-paid-for frames per shot — `bestImageAttemptReview`
 * only ever promotes ONE whole wave into the live `storyboardFrameUrls`.
 * This suite covers:
 *
 *  - `buildSequentialShotAlternatesForTest` — the pure read projection
 *    (per-shot alternates from non-selected waves).
 *  - Wiring into `serializeRun` via `serializeMarketplaceAutoReviewRunForTest`
 *    — proves the projection is attached to the EXACT payload
 *    `marketplaceCapture.getAutoReviewRun` already returns, and that the
 *    common one-wave case is byte-identical to today (zero risk).
 *  - `reapplyManualShotAlternateSelectionsForTest` +
 *    `selectMarketplaceAutoReviewBestImageAttemptForTest` — a manual
 *    per-shot override survives a later automatic whole-wave reselection.
 *  - `selectMarketplaceAutoReviewSequentialShotAlternate` — the mutation
 *    (DB-backed): happy path, validation, and reuse of the exact same
 *    ownership/tenant-flag/run-status guard the neighbouring regenerate/save
 *    procedures already use.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../db", () => ({ getDb: vi.fn() }));

import { getDb } from "../../db";
import {
  marketplaceAutoReviewRuns,
  marketplaceAutoReviewStages,
  tenants,
} from "../../../drizzle/schema";
import {
  buildSequentialShotAlternatesForTest,
  reapplyManualShotAlternateSelectionsForTest,
  selectMarketplaceAutoReviewBestImageAttemptForTest,
  selectMarketplaceAutoReviewSequentialShotAlternate,
  serializeMarketplaceAutoReviewRunForTest,
} from "../marketplaceAutoReviewService";

const mockGetDb = vi.mocked(getDb);

beforeEach(() => {
  vi.clearAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Fixtures (copied locally, not shared with sibling test files — matches     */
/* this service's own section-08 test convention)                            */
/* -------------------------------------------------------------------------- */

function review(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    reviewId: `image-attempt-review:mar_1:${overrides.attempt ?? 1}`,
    runId: "mar_1",
    attempt: 1,
    status: "passed",
    storyboardFrameUrls: [],
    startFrameUrls: [],
    stopFrameUrls: [],
    qualityScore: 80,
    negativeScore: 0,
    ...overrides,
  };
}

function buildPlanFixture(shotCount = 3): any {
  return {
    conceptId: "concept-1",
    title: "Test concept",
    productTruth: {
      productId: "mp_1",
      productName: "Test Product",
      brand: "TestBrand",
      platform: "shopee",
      externalProductId: "ext_1",
      externalShopId: "shop_1",
      productCategory: "furniture",
      categoryText: "",
      categoryPath: [],
      sourceUrl: "https://example.com/product",
      affiliateUrl: null,
      shopName: null,
      price: null,
      rating: null,
      sold: null,
      reviews: null,
      description: "",
      specs: {},
      imageUrls: [],
    },
    storyboardGuide: "",
    voiceoverScript: "",
    productDetail: "",
    shots: Array.from({ length: shotCount }, (_, i) => ({
      id: `shot-${i + 1}`,
      order: i + 1,
      title: `Shot ${i + 1}`,
      startSeconds: i * 5,
      endSeconds: i * 5 + 5,
      durationSeconds: 5,
      storyboardGuide: "",
      voiceover: "",
      camera: "",
      visual: "",
      movement: "",
      productRole: "",
    })),
  };
}

function baseRunFixture(overrides: Record<string, unknown> = {}): any {
  return {
    id: "mar_1",
    tenantId: "tenant_1",
    userId: 7,
    productId: "mp_1",
    productionRunId: "prod_1",
    outputMode: "storyboard_images",
    frameStrategy: "sequential_shot_storyboard",
    status: "running",
    currentStage: "image_generation",
    stageIndex: 4,
    stageCount: 6,
    storyboardReviewId: null,
    videoEditorProjectId: null,
    renderJobId: null,
    resultLibraryItemId: null,
    resultJson: {},
    errorMessage: null,
    idempotencyKey: "marketplace-auto-review:test",
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    completedAt: null,
    ...overrides,
  };
}

function buildMutationMetadataFixture(): any {
  return {
    concept: buildPlanFixture(3),
    selectedImageAttempt: 2,
    storyboardFrameUrls: ["u2-s1", "u2-s2", "u2-s3"],
    startFrameUrls: ["u2-s1", "u2-s2", "u2-s3"],
    sequentialStoryboard: {
      shots: [{ shot_id: 1 }, { shot_id: 2 }, { shot_id: 3 }],
    },
    imageAttemptReviews: [
      review({
        attempt: 1,
        qualityScore: 60,
        storyboardFrameUrls: ["u1-s1", "u1-s2", "u1-s3"],
      }),
      review({
        attempt: 2,
        qualityScore: 90,
        storyboardFrameUrls: ["u2-s1", "u2-s2", "u2-s3"],
      }),
    ],
  };
}

/** Mock covering both query shapes `serializeRun`'s callers issue:
 *  `.where().limit()` (runs / tenants lookups) and `.where().orderBy()`
 *  (stages lookup). `update().set()` mutates `params.run` in place so a
 *  later `.select()` in the SAME test (e.g. the mutation's trailing
 *  `getMarketplaceAutoReviewRun` re-fetch) observes the write. */
function buildDbMock(params: {
  run: Record<string, unknown>;
  stages?: Record<string, unknown>[];
  tenantFeatureFlags?: Record<string, boolean>;
  updateSpy?: (setObj: Record<string, unknown>) => void;
}) {
  return {
    select: (_cols?: unknown) => ({
      from: (table: unknown) => ({
        where: (..._args: unknown[]) => ({
          limit: async () => {
            if (table === marketplaceAutoReviewRuns) return [params.run];
            if (table === tenants) {
              return [
                {
                  featureFlags: params.tenantFeatureFlags ?? {
                    marketplaceSequentialStoryboard: true,
                  },
                },
              ];
            }
            return [];
          },
          orderBy: async () => {
            if (table === marketplaceAutoReviewStages)
              return params.stages ?? [];
            return [];
          },
        }),
      }),
    }),
    update: (_table: unknown) => ({
      set: (setObj: Record<string, unknown>) => {
        params.updateSpy?.(setObj);
        params.run = { ...params.run, ...setObj };
        return { where: () => ({ returning: async () => [params.run] }) };
      },
    }),
  } as any;
}

/* -------------------------------------------------------------------------- */
/* buildSequentialShotAlternatesForTest — pure read projection               */
/* -------------------------------------------------------------------------- */

describe("buildSequentialShotAlternatesForTest", () => {
  it("a single review wave produces no alternates for any shot (nothing to pick between)", () => {
    const metadata = {
      imageAttemptReviews: [
        review({ attempt: 1, storyboardFrameUrls: ["url-1-a", "url-1-b"] }),
      ],
    } as any;
    expect(buildSequentialShotAlternatesForTest(metadata)).toEqual({});
  });

  it("two waves: a shot with a URL in both becomes selectable, ordered by attempt ascending, isSelected follows the overall selection", () => {
    const metadata = {
      selectedImageAttempt: 2,
      imageAttemptReviews: [
        // intentionally out of order — the projector must sort ascending
        review({
          attempt: 2,
          qualityScore: 90,
          storyboardFrameUrls: ["u1-shot1", "u2-shot2"],
        }),
        review({
          attempt: 1,
          qualityScore: 70,
          storyboardFrameUrls: ["u1-shot1", "u1-shot2"],
        }),
      ],
    } as any;
    const alternates = buildSequentialShotAlternatesForTest(metadata);
    expect(alternates["1"]).toEqual([
      { attempt: 1, qualityScore: 70, imageUrl: "u1-shot1", isSelected: false },
      { attempt: 2, qualityScore: 90, imageUrl: "u1-shot1", isSelected: true },
    ]);
    expect(alternates["2"]).toEqual([
      { attempt: 1, qualityScore: 70, imageUrl: "u1-shot2", isSelected: false },
      { attempt: 2, qualityScore: 90, imageUrl: "u2-shot2", isSelected: true },
    ]);
  });

  it("a shot with a URL in only one wave is omitted entirely (nothing to pick between)", () => {
    const metadata = {
      imageAttemptReviews: [
        review({ attempt: 1, storyboardFrameUrls: ["u1-shot1", "u1-shot2"] }),
        review({ attempt: 2, storyboardFrameUrls: ["u2-shot1"] }), // shot 2 missing
      ],
    } as any;
    const alternates = buildSequentialShotAlternatesForTest(metadata);
    expect(alternates["1"]).toHaveLength(2);
    expect(alternates["2"]).toBeUndefined();
  });

  it("qualityScore is null for a wave that was never scored", () => {
    const metadata = {
      imageAttemptReviews: [
        review({ attempt: 1, qualityScore: undefined, storyboardFrameUrls: ["u1"] }),
        review({ attempt: 2, qualityScore: 55, storyboardFrameUrls: ["u2"] }),
      ],
    } as any;
    const alternates = buildSequentialShotAlternatesForTest(metadata);
    expect(alternates["1"][0]).toMatchObject({
      attempt: 1,
      qualityScore: null,
      imageUrl: "u1",
    });
    expect(alternates["1"][1]).toMatchObject({
      attempt: 2,
      qualityScore: 55,
      imageUrl: "u2",
    });
  });

  it("a manual per-shot override wins over the run's overall selectedImageAttempt", () => {
    const metadata = {
      selectedImageAttempt: 2,
      manualShotAlternateSelections: {
        "1": { attempt: 1, at: "2026-07-20T00:00:00.000Z" },
      },
      imageAttemptReviews: [
        review({ attempt: 1, storyboardFrameUrls: ["u1"] }),
        review({ attempt: 2, storyboardFrameUrls: ["u2"] }),
      ],
    } as any;
    const alternates = buildSequentialShotAlternatesForTest(metadata);
    expect(alternates["1"]).toEqual([
      { attempt: 1, qualityScore: 80, imageUrl: "u1", isSelected: true },
      { attempt: 2, qualityScore: 80, imageUrl: "u2", isSelected: false },
    ]);
  });

  it("falls back to the most recent contributing wave when neither a manual override nor the overall selection applies", () => {
    const metadata = {
      // no selectedImageAttempt at all — e.g. pre-selection-era metadata
      imageAttemptReviews: [
        review({ attempt: 1, storyboardFrameUrls: ["u1"] }),
        review({ attempt: 3, storyboardFrameUrls: ["u3"] }),
      ],
    } as any;
    const alternates = buildSequentialShotAlternatesForTest(metadata);
    expect(alternates["1"].find((e: any) => e.attempt === 3)?.isSelected).toBe(
      true
    );
    expect(alternates["1"].find((e: any) => e.attempt === 1)?.isSelected).toBe(
      false
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Wiring into serializeRun (getAutoReviewRun's exact payload)                */
/* -------------------------------------------------------------------------- */

describe("sequentialShotAlternates wiring into serializeRun", () => {
  it("attaches sequentialShotAlternates to metadataJson in the default (heavy) serialization getAutoReviewRun uses", () => {
    const serialized = serializeMarketplaceAutoReviewRunForTest(
      baseRunFixture({
        metadataJson: {
          selectedImageAttempt: 2,
          storyboardFrameUrls: ["u2-shot1"],
          imageAttemptReviews: [
            review({ attempt: 1, storyboardFrameUrls: ["u1-shot1"] }),
            review({ attempt: 2, storyboardFrameUrls: ["u2-shot1"] }),
          ],
        },
      }),
      []
    ) as any;
    expect(serialized.metadataJson.sequentialShotAlternates["1"]).toEqual([
      { attempt: 1, qualityScore: 80, imageUrl: "u1-shot1", isSelected: false },
      { attempt: 2, qualityScore: 80, imageUrl: "u2-shot1", isSelected: true },
    ]);
    expect(serialized.metadataJson.storyboardFrameUrls).toEqual(["u2-shot1"]);
  });

  it("also attaches sequentialShotAlternates in the trimmed summary metadata branch (listAutoReviewRuns summary:true)", () => {
    const serialized = serializeMarketplaceAutoReviewRunForTest(
      baseRunFixture({
        metadataJson: {
          selectedImageAttempt: 2,
          storyboardFrameUrls: ["u2-shot1"],
          imageAttemptReviews: [
            review({ attempt: 1, storyboardFrameUrls: ["u1-shot1"] }),
            review({ attempt: 2, storyboardFrameUrls: ["u2-shot1"] }),
          ],
        },
      }),
      [],
      { includeHeavyMetadata: false }
    ) as any;
    expect(serialized.metadataJson.sequentialShotAlternates["1"]).toHaveLength(
      2
    );
  });

  it("omits sequentialShotAlternates entirely for a run with only one image-attempt wave — metadataJson is the SAME object reference as today (zero-risk additive change)", () => {
    const metadataJson = {
      storyboardFrameUrls: ["u1-shot1"],
      imageAttemptReviews: [
        review({ attempt: 1, storyboardFrameUrls: ["u1-shot1"] }),
      ],
    };
    const serialized = serializeMarketplaceAutoReviewRunForTest(
      baseRunFixture({ metadataJson }),
      []
    ) as any;
    expect(serialized.metadataJson).toBe(metadataJson);
    expect(serialized.metadataJson.sequentialShotAlternates).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* reapplyManualShotAlternateSelectionsForTest — pure                         */
/* -------------------------------------------------------------------------- */

describe("reapplyManualShotAlternateSelectionsForTest", () => {
  it("returns the input array unchanged (same reference) when there are no manual overrides", () => {
    const frameUrls = ["a", "b", "c"];
    const metadata = {} as any;
    expect(reapplyManualShotAlternateSelectionsForTest(metadata, frameUrls)).toBe(
      frameUrls
    );
  });

  it("patches only the shot index with a manual override, from that override's attempt wave; input not mutated", () => {
    const metadata = {
      manualShotAlternateSelections: { "2": { attempt: 1, at: "t" } },
      imageAttemptReviews: [
        review({ attempt: 1, storyboardFrameUrls: ["u1-s1", "u1-s2", "u1-s3"] }),
        review({ attempt: 2, storyboardFrameUrls: ["u2-s1", "u2-s2", "u2-s3"] }),
      ],
    } as any;
    const frameUrls = ["u2-s1", "u2-s2", "u2-s3"];
    const result = reapplyManualShotAlternateSelectionsForTest(
      metadata,
      frameUrls
    );
    expect(result).toEqual(["u2-s1", "u1-s2", "u2-s3"]);
    expect(frameUrls).toEqual(["u2-s1", "u2-s2", "u2-s3"]);
  });

  it("leaves the index untouched when the override's attempt wave has no URL there", () => {
    const metadata = {
      manualShotAlternateSelections: { "2": { attempt: 1, at: "t" } },
      imageAttemptReviews: [
        review({ attempt: 1, storyboardFrameUrls: ["u1-s1"] }), // no entry at index 1
      ],
    } as any;
    const frameUrls = ["u2-s1", "u2-s2"];
    expect(
      reapplyManualShotAlternateSelectionsForTest(metadata, frameUrls)
    ).toEqual(["u2-s1", "u2-s2"]);
  });

  it("is a no-op when the override's attempt review no longer exists", () => {
    const metadata = {
      manualShotAlternateSelections: { "1": { attempt: 99, at: "t" } },
      imageAttemptReviews: [review({ attempt: 1, storyboardFrameUrls: ["u1-s1"] })],
    } as any;
    const frameUrls = ["u1-s1"];
    expect(
      reapplyManualShotAlternateSelectionsForTest(metadata, frameUrls)
    ).toEqual(["u1-s1"]);
  });
});

/* -------------------------------------------------------------------------- */
/* applyBestImageAttemptSelection — a manual override survives a later       */
/* automatic whole-wave reselection                                          */
/* -------------------------------------------------------------------------- */

describe("selectMarketplaceAutoReviewBestImageAttemptForTest — manual override survives reselection", () => {
  it("a manual per-shot alternate selection survives a later automatic best-wave reselection", () => {
    const metadata = {
      manualShotAlternateSelections: {
        "2": { attempt: 1, at: "2026-07-20T00:00:00.000Z" },
      },
      imageAttemptReviews: [
        review({
          attempt: 1,
          status: "passed",
          qualityScore: 60,
          storyboardFrameUrls: ["u1-s1", "u1-s2", "u1-s3"],
        }),
        review({
          attempt: 2,
          status: "passed",
          qualityScore: 90, // this wave wins the automatic "best" selection
          storyboardFrameUrls: ["u2-s1", "u2-s2", "u2-s3"],
        }),
      ],
    } as any;
    const selected = selectMarketplaceAutoReviewBestImageAttemptForTest({
      metadata,
    });
    expect(selected.selectedImageAttempt).toBe(2);
    expect(selected.storyboardFrameUrls).toEqual([
      "u2-s1", // shot 1: not overridden -> best wave (attempt 2)
      "u1-s2", // shot 2: manual override -> stays on attempt 1's frame
      "u2-s3", // shot 3: not overridden -> best wave (attempt 2)
    ]);
  });

  it("with no manual overrides, behaves exactly as before (best wave wins outright)", () => {
    const metadata = {
      imageAttemptReviews: [
        review({ attempt: 1, qualityScore: 60, storyboardFrameUrls: ["u1-s1"] }),
        review({ attempt: 2, qualityScore: 90, storyboardFrameUrls: ["u2-s1"] }),
      ],
    } as any;
    const selected = selectMarketplaceAutoReviewBestImageAttemptForTest({
      metadata,
    });
    expect(selected.selectedImageAttempt).toBe(2);
    expect(selected.storyboardFrameUrls).toEqual(["u2-s1"]);
  });
});

/* -------------------------------------------------------------------------- */
/* selectMarketplaceAutoReviewSequentialShotAlternate — the mutation          */
/* -------------------------------------------------------------------------- */

describe("selectMarketplaceAutoReviewSequentialShotAlternate", () => {
  it("swaps only the requested shot's frame URL, records the manual override as a single lean metadata-only write, and returns the refreshed run", async () => {
    const metadata = buildMutationMetadataFixture();
    const run = baseRunFixture({ metadataJson: metadata });
    const updateSpy = vi.fn();
    mockGetDb.mockResolvedValue(buildDbMock({ run, updateSpy }));

    const result = await selectMarketplaceAutoReviewSequentialShotAlternate(
      { runId: "mar_1", shotId: 2, attempt: 1 },
      { userId: 7, tenantId: "tenant_1" }
    );

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [setObj] = updateSpy.mock.calls[0] as [Record<string, any>];
    // Zero extra credit cost: exactly one metadata-only column touched
    // (plus updatedAt) — no credit/result fields in the write set.
    expect(Object.keys(setObj).sort()).toEqual(["metadataJson", "updatedAt"]);
    expect(setObj.metadataJson.storyboardFrameUrls).toEqual([
      "u2-s1",
      "u1-s2", // shot 2 (index 1) swapped to attempt 1's frame
      "u2-s3",
    ]);
    expect(setObj.metadataJson.startFrameUrls).toEqual([
      "u2-s1",
      "u1-s2",
      "u2-s3",
    ]);
    expect(setObj.metadataJson.manualShotAlternateSelections["2"]).toMatchObject(
      { attempt: 1 }
    );

    expect((result as any).metadataJson.storyboardFrameUrls[1]).toBe("u1-s2");
    expect(
      (result as any).metadataJson.sequentialShotAlternates["2"].find(
        (entry: any) => entry.attempt === 1
      ).isSelected
    ).toBe(true);
  });

  it("throws NOT_FOUND when the requested attempt wave does not exist; no write happens", async () => {
    const metadata = buildMutationMetadataFixture();
    const run = baseRunFixture({ metadataJson: metadata });
    const updateSpy = vi.fn();
    mockGetDb.mockResolvedValue(buildDbMock({ run, updateSpy }));

    await expect(
      selectMarketplaceAutoReviewSequentialShotAlternate(
        { runId: "mar_1", shotId: 2, attempt: 99 },
        { userId: 7, tenantId: "tenant_1" }
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST when the requested attempt has no frame for that shot; no write happens", async () => {
    const metadata = buildMutationMetadataFixture();
    (metadata.imageAttemptReviews[0] as any).storyboardFrameUrls = ["u1-s1"]; // attempt 1 only covers shot 1
    const run = baseRunFixture({ metadataJson: metadata });
    const updateSpy = vi.fn();
    mockGetDb.mockResolvedValue(buildDbMock({ run, updateSpy }));

    await expect(
      selectMarketplaceAutoReviewSequentialShotAlternate(
        { runId: "mar_1", shotId: 2, attempt: 1 },
        { userId: 7, tenantId: "tenant_1" }
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the run does not belong to this user/tenant", async () => {
    mockGetDb.mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [], orderBy: async () => [] }),
        }),
      }),
      update: () => ({
        set: () => ({ where: () => ({ returning: async () => [] }) }),
      }),
    } as any);

    await expect(
      selectMarketplaceAutoReviewSequentialShotAlternate(
        { runId: "mar_missing", shotId: 1, attempt: 1 },
        { userId: 7, tenantId: "tenant_1" }
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("reuses the shared sequential-only precondition guard: non-sequential frameStrategy -> BAD_REQUEST, no write", async () => {
    const metadata = buildMutationMetadataFixture();
    const run = baseRunFixture({
      metadataJson: metadata,
      frameStrategy: "storyboard_3x3_split",
    });
    const updateSpy = vi.fn();
    mockGetDb.mockResolvedValue(buildDbMock({ run, updateSpy }));

    await expect(
      selectMarketplaceAutoReviewSequentialShotAlternate(
        { runId: "mar_1", shotId: 2, attempt: 1 },
        { userId: 7, tenantId: "tenant_1" }
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("reuses the shared tenant-flag guard: marketplaceSequentialStoryboard off -> FORBIDDEN, no write", async () => {
    const metadata = buildMutationMetadataFixture();
    const run = baseRunFixture({ metadataJson: metadata });
    const updateSpy = vi.fn();
    mockGetDb.mockResolvedValue(
      buildDbMock({
        run,
        updateSpy,
        tenantFeatureFlags: { marketplaceSequentialStoryboard: false },
      })
    );

    await expect(
      selectMarketplaceAutoReviewSequentialShotAlternate(
        { runId: "mar_1", shotId: 2, attempt: 1 },
        { userId: 7, tenantId: "tenant_1" }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
