/**
 * Vertical Drama Series — location-stock router
 * (`planning/polished-toasting-gadget.md` Phase 2, dispatch 3/3) unit
 * coverage.
 *
 * Same "mock the whole module graph, invoke the exported procedure handler
 * directly" convention as `verticalDramaCharacters.customInstruction.test.ts`.
 *
 * Covers:
 *  - `list` returns the roster with reference URLs (delegates to
 *    `verticalDramaLocationStockService.listRows`).
 *  - `previewLocationPrompt` never performs a SEPARATE/duplicate credit
 *    charge of its own (delegates entirely to `generateLocationVisualPrompts`,
 *    which is the ONE credit-gated call — mirrors
 *    `previewCharacterPrompt`'s real, verified-by-reading shape) and never
 *    touches `mediaGenerationService`/spends the image-render credit.
 *  - `generateLocationImage` with `approvedPrompt` skips regeneration
 *    (never calls `generateLocationVisualPrompts`).
 *  - SECURITY: every `VerticalDramaLocationStockError` maps to a generic
 *    NOT_FOUND, never a leaked reason string (`linkAsset`/`approveAsset`/
 *    `transitionAsset`/`deleteAsset`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    instance: {},
  },
}));
vi.mock("../../db", () => ({ db: mockDb }));

vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      use: () => proc,
      input: () => proc,
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
    };
    return proc;
  };
  return {
    router: (routes: Record<string, unknown>) => routes,
    protectedProcedure: createProcedure(),
  };
});

vi.mock("../../middleware/requireFeatureFlag", () => ({
  requireFeatureFlag: () => (x: unknown) => x,
}));

const {
  mockListRows,
  mockGetPrimaryReferenceUrl,
  mockGetPrimaryReferenceAssetId,
  mockLinkAsset,
  mockTransition,
  mockMarkStale,
  mockDeleteAsset,
  mockListLocationAssets,
  mockSetPrimaryAsset,
  MockVerticalDramaLocationStockError,
} = vi.hoisted(() => {
  class MockVerticalDramaLocationStockError extends Error {
    constructor(
      public readonly reason: string,
      message: string,
    ) {
      super(message);
      this.name = "VerticalDramaLocationStockError";
    }
  }
  return {
    mockListRows: vi.fn(),
    mockGetPrimaryReferenceUrl: vi.fn(),
    mockGetPrimaryReferenceAssetId: vi.fn(),
    mockLinkAsset: vi.fn(),
    mockTransition: vi.fn(),
    mockMarkStale: vi.fn(),
    mockDeleteAsset: vi.fn(),
    mockListLocationAssets: vi.fn(),
    mockSetPrimaryAsset: vi.fn(),
    MockVerticalDramaLocationStockError,
  };
});
vi.mock("../../services/verticalDramaLocationStock", () => ({
  verticalDramaLocationStockService: {
    listRows: mockListRows,
    getPrimaryReferenceUrl: mockGetPrimaryReferenceUrl,
    getPrimaryReferenceAssetId: mockGetPrimaryReferenceAssetId,
    linkAsset: mockLinkAsset,
    transition: mockTransition,
    markStale: mockMarkStale,
    deleteAsset: mockDeleteAsset,
    listLocationAssets: mockListLocationAssets,
    setPrimaryAsset: mockSetPrimaryAsset,
  },
  VerticalDramaLocationStockError: MockVerticalDramaLocationStockError,
}));

const { mockGenerateImageAsync } = vi.hoisted(() => ({
  mockGenerateImageAsync: vi.fn(),
}));
vi.mock("../../services/mediaGenerationService", () => ({
  mediaGenerationService: { generateImageAsync: mockGenerateImageAsync },
  DEFAULT_MODELS: { image: "google-nano-banana-pro" },
}));

const { mockCalculateCreditCost } = vi.hoisted(() => ({
  mockCalculateCreditCost: vi.fn(() => 5),
}));
vi.mock("../../services/pricingCalculator", () => ({
  calculateCreditCost: mockCalculateCreditCost,
}));

const { mockHasEnoughCredits, mockDeductCredits, mockRefundCredits } = vi.hoisted(() => ({
  mockHasEnoughCredits: vi.fn(),
  mockDeductCredits: vi.fn(),
  mockRefundCredits: vi.fn(),
}));
vi.mock("../../services/creditService", () => ({
  hasEnoughCredits: mockHasEnoughCredits,
  deductCredits: mockDeductCredits,
  refundCredits: mockRefundCredits,
}));

vi.mock("../../_core/tokens", () => ({
  signBearerToken: vi.fn(() => "token"),
}));

const {
  mockGenerateLocationVisualPrompts,
  MockInsufficientCreditsError,
  MockVdSchemaValidationError,
} = vi.hoisted(() => {
  class MockInsufficientCreditsError extends Error {}
  class MockVdSchemaValidationError extends Error {}
  return {
    mockGenerateLocationVisualPrompts: vi.fn(),
    MockInsufficientCreditsError,
    MockVdSchemaValidationError,
  };
});
vi.mock("../../services/verticalDramaLocationImageGeneration", () => ({
  generateLocationVisualPrompts: mockGenerateLocationVisualPrompts,
  InsufficientCreditsError: MockInsufficientCreditsError,
  VdSchemaValidationError: MockVdSchemaValidationError,
}));

// Generic, non-character-specific bible reader — see this router's own
// top-of-file doc comment for why this is imported (not duplicated) from the
// character image-generation module. Mocked wholesale here (same "avoid the
// adminProcedure transitive chain" reasoning documented pervasively across
// this codebase's other Vertical Drama test files) since the REAL module
// transitively imports `verticalDramaImproveScript.ts` ->
// `verticalDramaStoryBible.ts` -> `enabledLlmModels.ts` -> `adminProcedure`.
// Also provides the (unused-by-this-router, no-op) names
// `verticalDramaCharacters.ts` itself imports from this same module — see
// the model-picker mocks block below for why that router file is now in this
// test's module graph too.
const { mockReadPresetVisualIdentityFromBible } = vi.hoisted(() => ({
  mockReadPresetVisualIdentityFromBible: vi.fn(() => undefined),
}));
vi.mock("../../services/verticalDramaCharacterImageGeneration", () => ({
  readPresetVisualIdentityFromBible: mockReadPresetVisualIdentityFromBible,
  generateCharacterVisualPrompts: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
  resolveFaceSourceReferenceForCharacter: vi.fn(),
}));

vi.mock("../../services/rateLimiter", () => ({
  mediaGenerationLimiter: { isAllowed: vi.fn(() => true), getResetTime: vi.fn(() => 0) },
}));

const { mockCreateAssetFromAttachment } = vi.hoisted(() => ({
  mockCreateAssetFromAttachment: vi.fn(),
}));
vi.mock("../../services/mediaAssetService", () => ({
  createAssetFromAttachment: mockCreateAssetFromAttachment,
}));

const { mockGetTenantFeatureFlags } = vi.hoisted(() => ({
  mockGetTenantFeatureFlags: vi.fn(),
}));
vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));

/* -------------------------------------------------------------------------- */
/* Image-model picker (model-picker parity plan) — `generateLocationImage`   */
/* now imports `resolveCharacterImageModelId`/                                */
/* `resolveVdCharacterMcpTransportMetadata` directly from                     */
/* `../verticalDramaCharacters` (reused, not duplicated — see that router's   */
/* own doc comment), which pulls that ENTIRE router file's module graph into  */
/* this test too. These two mocks are the same ones                          */
/* `verticalDramaCharacters.modelSelection.test.ts` uses to import that exact */
/* file safely — mirrored here verbatim (that test file's own doc comment:    */
/* "everything is mocked to a minimal no-op shape purely so the module can be */
/* imported"). `verticalDramaCharacterStock` is mocked for the same reason    */
/* even though this router never calls it directly.                          */
/* -------------------------------------------------------------------------- */
const { mockGetModelsByTypeAsync } = vi.hoisted(() => ({
  mockGetModelsByTypeAsync: vi.fn(),
}));
vi.mock("../../services/modelRegistry", () => ({
  getModelsByTypeAsync: mockGetModelsByTypeAsync,
}));

const { mockResolveMediaTransport } = vi.hoisted(() => ({
  mockResolveMediaTransport: vi.fn(),
}));
vi.mock("../../services/mediaTransportResolver", () => ({
  resolveMediaTransport: mockResolveMediaTransport,
}));

vi.mock("../../services/verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: {
    getPrimaryPortraitUrl: vi.fn(),
    getReferenceImageUrlByAssetLinkId: vi.fn(),
  },
  VerticalDramaCharacterStockError: class extends Error {
    constructor(
      public readonly reason: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

import { verticalDramaLocationsRouter } from "../verticalDramaLocations";

const router = verticalDramaLocationsRouter as unknown as Record<string, Function>;

function ctx(overrides: Partial<{ tenantId: string | null; user: { id: number } }> = {}) {
  return { tenantId: "tenant-1", user: { id: 42 }, userToken: "session-token", publicUrl: undefined, ...overrides };
}

/** Thenable select-chain stub — resolves at ANY point in the chain, same
 *  convention as `verticalDramaCharacters.customInstruction.test.ts`. */
function selectChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

function updateChain(returned: unknown[]) {
  const chain: any = {
    set: vi.fn(() => chain),
    where: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(returned)),
  };
  return chain;
}

const SERIES_ROW = { id: 10 };
const SERIES_CONTEXT_ROW = { title: "Sisters of the Silk Market", genre: "family drama", tone: "warm", bible: null };
const LOCATION_ROW = {
  id: 5,
  tenantId: "tenant-1",
  userId: 42,
  seriesId: 10,
  locationKey: "loc_convenience_store",
  name: "ร้านสะดวกซื้อ",
  data: { description: "แถวชั้นวางของเด็ก แสงไฟนีออนสีขาวจากเพดาน" },
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-01T00:00:00.000Z"),
};

function visualPromptResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    establishingPlatePrompt: "wide establishing shot, environment only, no people: ...",
    negativePrompt: "no people, no human figures",
    raw: { contract_version: 1 },
    creditsUsed: 2,
    model: "gpt-4o-mini",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesPresetMixV2: false });
  mockGetPrimaryReferenceUrl.mockResolvedValue(undefined);
  mockGetPrimaryReferenceAssetId.mockResolvedValue(undefined);
  mockHasEnoughCredits.mockResolvedValue(true);
  mockDeductCredits.mockResolvedValue(undefined);
  mockGenerateImageAsync.mockResolvedValue({ id: "task-1" });
  mockGenerateLocationVisualPrompts.mockResolvedValue(visualPromptResult());
});

/* -------------------------------------------------------------------------- */
/* list                                                                       */
/* -------------------------------------------------------------------------- */

describe("list", () => {
  it("returns the roster with primaryReferenceUrl, delegating entirely to listRows", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([SERIES_ROW])); // loadOwnedSeries
    mockListRows.mockResolvedValue([
      { ...LOCATION_ROW, primaryReferenceUrl: "https://cdn.example.com/store-plate.png" },
    ]);

    const result = await router.list({ ctx: ctx(), input: { seriesId: "10" } });

    expect(mockListRows).toHaveBeenCalledWith({ tenantId: "tenant-1", userId: 42, seriesId: 10 });
    expect(result.locations).toHaveLength(1);
    expect(result.locations[0]).toMatchObject({
      locationId: "5",
      seriesId: "10",
      locationKey: "loc_convenience_store",
      name: "ร้านสะดวกซื้อ",
      description: "แถวชั้นวางของเด็ก แสงไฟนีออนสีขาวจากเพดาน",
      primaryReferenceUrl: "https://cdn.example.com/store-plate.png",
    });
  });

  it("omits primaryReferenceUrl when no approved plate exists yet", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([SERIES_ROW]));
    mockListRows.mockResolvedValue([{ ...LOCATION_ROW }]);

    const result = await router.list({ ctx: ctx(), input: { seriesId: "10" } });

    expect(result.locations[0].primaryReferenceUrl).toBeUndefined();
  });

  it("throws NOT_FOUND when the series is not owned by the caller", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // loadOwnedSeries — no row

    await expect(router.list({ ctx: ctx(), input: { seriesId: "10" } })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mockListRows).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* previewLocationPrompt — free-preview shape (mirrors previewCharacterPrompt) */
/* -------------------------------------------------------------------------- */

describe("previewLocationPrompt", () => {
  it("resolves the location + hasOwnReferenceImage + presetVisualIdentity and calls generateLocationVisualPrompts", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW])) // loadOwnedSeries
      .mockReturnValueOnce(selectChain([LOCATION_ROW])) // loadOwnedLocation
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW])); // series title/genre/tone/bible
    mockGetPrimaryReferenceAssetId.mockResolvedValueOnce(900);

    const result = await router.previewLocationPrompt({
      ctx: ctx(),
      input: { seriesId: "10", locationId: "5" },
    });

    expect(mockGenerateLocationVisualPrompts).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        tenantId: "tenant-1",
        seriesId: 10,
        locationKey: "loc_convenience_store",
        locationName: "ร้านสะดวกซื้อ",
        description: "แถวชั้นวางของเด็ก แสงไฟนีออนสีขาวจากเพดาน",
        seriesContext: "Series title: Sisters of the Silk Market | Genre: family drama | Tone: warm",
        hasOwnReferenceImage: true,
      }),
    );
    expect(result).toEqual({
      establishingPlatePrompt: "wide establishing shot, environment only, no people: ...",
      negativePrompt: "no people, no human figures",
      model: "gpt-4o-mini",
    });
  });

  it("does NOT charge credits itself, and does NOT render/submit an image — the only credit-gated call is the one shared generateLocationVisualPrompts call (real 'free preview' shape, verified against previewCharacterPrompt's actual body, not assumed)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([LOCATION_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]));

    await router.previewLocationPrompt({
      ctx: ctx(),
      input: { seriesId: "10", locationId: "5" },
    });

    // The router itself never calls the credit-service functions directly —
    // any credit gating/deduction happens ONLY inside the (separately
    // mocked) `generateLocationVisualPrompts` call, exactly once.
    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(mockGenerateLocationVisualPrompts).toHaveBeenCalledTimes(1);
    // No image render — this is a preview-only, prompt-text-only leg.
    expect(mockGenerateImageAsync).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the location is not owned by the caller (mirrors previewCharacterPrompt's not-found handling)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([])); // loadOwnedLocation — no row

    await expect(
      router.previewLocationPrompt({ ctx: ctx(), input: { seriesId: "10", locationId: "999" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockGenerateLocationVisualPrompts).not.toHaveBeenCalled();
  });

  it("maps InsufficientCreditsError to FORBIDDEN", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([LOCATION_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]));
    mockGenerateLocationVisualPrompts.mockRejectedValueOnce(
      new MockInsufficientCreditsError("insufficient credits"),
    );

    await expect(
      router.previewLocationPrompt({ ctx: ctx(), input: { seriesId: "10", locationId: "5" } }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("maps VdSchemaValidationError to INTERNAL_SERVER_ERROR", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([LOCATION_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]));
    mockGenerateLocationVisualPrompts.mockRejectedValueOnce(new MockVdSchemaValidationError("bad schema"));

    await expect(
      router.previewLocationPrompt({ ctx: ctx(), input: { seriesId: "10", locationId: "5" } }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

/* -------------------------------------------------------------------------- */
/* generateLocationImage                                                     */
/* -------------------------------------------------------------------------- */

describe("generateLocationImage", () => {
  it("with approvedPrompt: skips generateLocationVisualPrompts entirely (no double-charge) and renders with 16:9 aspect ratio", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW])) // loadOwnedSeries
      .mockReturnValueOnce(selectChain([LOCATION_ROW])) // loadOwnedLocation
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }])); // mediaModels pricing row

    const result = await router.generateLocationImage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        locationId: "5",
        approvedPrompt: "already-approved establishing plate prompt",
        approvedNegativePrompt: "no people",
      },
    });

    expect(mockGenerateLocationVisualPrompts).not.toHaveBeenCalled();
    expect(mockGenerateImageAsync).toHaveBeenCalledTimes(1);
    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.prompt).toBe("already-approved establishing plate prompt");
    expect(request.negativePrompt).toBe("no people");
    expect(request.aspectRatio).toBe("16:9");
    expect(result.taskId).toBe("task-1");
    expect(result.creditsUsed).toEqual({ promptGeneration: 0, imageRender: 5 });
  });

  it("without approvedPrompt: calls generateLocationVisualPrompts for real and uses its result", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([LOCATION_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW])) // series title/genre/tone/bible
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }])); // pricing row

    const result = await router.generateLocationImage({
      ctx: ctx(),
      input: { seriesId: "10", locationId: "5" },
    });

    expect(mockGenerateLocationVisualPrompts).toHaveBeenCalledTimes(1);
    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.prompt).toBe("wide establishing shot, environment only, no people: ...");
    expect(result.creditsUsed).toEqual({ promptGeneration: 2, imageRender: 5 });
  });

  it("attaches the location's existing approved reference image as referenceImageUrls when present", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([LOCATION_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));
    mockGetPrimaryReferenceUrl.mockResolvedValueOnce("https://cdn.example.com/store-plate.png");

    await router.generateLocationImage({
      ctx: ctx(),
      input: { seriesId: "10", locationId: "5", approvedPrompt: "approved prompt" },
    });

    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.referenceImageUrls).toEqual(["https://cdn.example.com/store-plate.png"]);
  });

  it("skips the reserve/refund cycle entirely for a zero-cost model", async () => {
    mockCalculateCreditCost.mockReturnValueOnce(0);
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([LOCATION_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 0, configJson: null }]));

    const result = await router.generateLocationImage({
      ctx: ctx(),
      input: { seriesId: "10", locationId: "5", approvedPrompt: "approved prompt" },
    });

    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(result.creditsUsed.imageRender).toBe(0);
  });

  it("refunds the image-render credit reservation when generateImageAsync fails to submit", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([LOCATION_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));
    mockGenerateImageAsync.mockRejectedValueOnce(new Error("provider unavailable"));

    await expect(
      router.generateLocationImage({
        ctx: ctx(),
        input: { seriesId: "10", locationId: "5", approvedPrompt: "approved prompt" },
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });

    expect(mockRefundCredits).toHaveBeenCalledTimes(1);
  });

  it("throws NOT_FOUND when the location is not owned by the caller", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([])); // loadOwnedLocation — no row

    await expect(
      router.generateLocationImage({
        ctx: ctx(),
        input: { seriesId: "10", locationId: "999", approvedPrompt: "x" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

/* -------------------------------------------------------------------------- */
/* generateLocationImage — image-model picker (model-picker parity plan):    */
/* `selectedImageModelId`/`mcpConnectionId` now resolve through the SAME     */
/* `resolveCharacterImageModelId`/`resolveVdCharacterMcpTransportMetadata`   */
/* helpers `generateCharacterImage` uses (imported, not duplicated) — these  */
/* tests cover the resolution order + rejection behavior "the same way the   */
/* character version does" per that helper's own coverage in                 */
/* `verticalDramaCharacters.modelSelection.test.ts`, plus this router's own  */
/* NEW wiring of the result into the `generateImageAsync` render call.       */
/* -------------------------------------------------------------------------- */

describe("generateLocationImage — image-model picker (model-picker parity plan)", () => {
  it("falls back to DEFAULT_MODELS.image when selectedImageModelId is absent (regression — byte-identical to pre-picker behavior)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([LOCATION_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));

    await router.generateLocationImage({
      ctx: ctx(),
      input: { seriesId: "10", locationId: "5", approvedPrompt: "approved prompt" },
    });

    expect(mockGetModelsByTypeAsync).not.toHaveBeenCalled();
    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.model).toBe("google-nano-banana-pro");
  });

  it("honors a valid, enabled selectedImageModelId — prices + renders against it instead of DEFAULT_MODELS.image (the picker's whole point)", async () => {
    mockGetModelsByTypeAsync.mockResolvedValueOnce([
      { id: "google-banana-2-lite", type: "image", isEnabled: true },
    ]);
    // Distinct from the sibling tests' shared `5` so this assertion can only
    // pass if `calculateCreditCost` was actually invoked for THIS test's own
    // pricing-row lookup (proving the picker's selected model, not just
    // `DEFAULT_MODELS.image`, drives the pricing lookup).
    mockCalculateCreditCost.mockReturnValueOnce(8);
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([LOCATION_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 8, configJson: null }]));

    const result = await router.generateLocationImage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        locationId: "5",
        approvedPrompt: "approved prompt",
        selectedImageModelId: "google-banana-2-lite",
      },
    });

    expect(mockGetModelsByTypeAsync).toHaveBeenCalledWith("image");
    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.model).toBe("google-banana-2-lite");
    expect(result.creditsUsed.imageRender).toBe(8);
  });

  it("rejects with BAD_REQUEST for a selectedImageModelId that doesn't exist in the catalog (same as the character version)", async () => {
    mockGetModelsByTypeAsync.mockResolvedValueOnce([
      { id: "google-banana-2-lite", type: "image", isEnabled: true },
    ]);
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([LOCATION_ROW]));

    await expect(
      router.generateLocationImage({
        ctx: ctx(),
        input: {
          seriesId: "10",
          locationId: "5",
          approvedPrompt: "approved prompt",
          selectedImageModelId: "does-not-exist",
        },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockGenerateImageAsync).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("rejects with BAD_REQUEST for a disabled selectedImageModelId — fails closed, does not silently substitute the default (same as the character version)", async () => {
    mockGetModelsByTypeAsync.mockResolvedValueOnce([
      { id: "google-banana-2-lite", type: "image", isEnabled: false },
    ]);
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([LOCATION_ROW]));

    await expect(
      router.generateLocationImage({
        ctx: ctx(),
        input: {
          seriesId: "10",
          locationId: "5",
          approvedPrompt: "approved prompt",
          selectedImageModelId: "google-banana-2-lite",
        },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockGenerateImageAsync).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("threads resolveVdCharacterMcpTransportMetadata's result into the render call as transportMetadata when the resolved model is MCP-transport", async () => {
    mockGetModelsByTypeAsync.mockResolvedValueOnce([
      { id: "higgsfield/nano-banana-pro", type: "image", isEnabled: true },
    ]);
    mockResolveMediaTransport.mockResolvedValueOnce({
      transport: "mcp",
      providerKey: "higgsfield",
      providerModelId: "nano_banana_pro",
      mcpConnectionId: "conn-123",
    });
    mockCalculateCreditCost.mockReturnValueOnce(0);
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([LOCATION_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 0, configJson: null }]));

    await router.generateLocationImage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        locationId: "5",
        approvedPrompt: "approved prompt",
        selectedImageModelId: "higgsfield/nano-banana-pro",
        mcpConnectionId: "conn-123",
      },
    });

    expect(mockResolveMediaTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        actorUserId: 42,
        assetType: "image",
        requestedTransport: "mcp",
        mcpConnectionId: "conn-123",
        providerKey: "higgsfield",
      }),
    );
    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.transportMetadata).toMatchObject({ transport: "mcp", providerKey: "higgsfield" });
  });

  it("rejects with BAD_REQUEST when an MCP-transport model is selected without a connected mcpConnectionId (fails BEFORE reserving credits)", async () => {
    mockGetModelsByTypeAsync.mockResolvedValueOnce([
      { id: "higgsfield/nano-banana-pro", type: "image", isEnabled: true },
    ]);
    mockCalculateCreditCost.mockReturnValueOnce(0);
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([LOCATION_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 0, configJson: null }]));

    await expect(
      router.generateLocationImage({
        ctx: ctx(),
        input: {
          seriesId: "10",
          locationId: "5",
          approvedPrompt: "approved prompt",
          selectedImageModelId: "higgsfield/nano-banana-pro",
          // mcpConnectionId intentionally omitted
        },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockResolveMediaTransport).not.toHaveBeenCalled();
    expect(mockGenerateImageAsync).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* listLocationAssets / setPrimaryLocationAsset — multi-candidate primary    */
/* picker (Location Visual Bible Phase C).                                   */
/* -------------------------------------------------------------------------- */

describe("listLocationAssets", () => {
  it("delegates to the service and maps ids to strings, ISO timestamps", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW])) // loadOwnedSeries
      .mockReturnValueOnce(selectChain([LOCATION_ROW])); // loadOwnedLocation
    mockListLocationAssets.mockResolvedValue([
      {
        assetLinkId: 901,
        mediaAssetId: 501,
        url: "https://cdn.example.com/candidate-a.png",
        approved: true,
        isPrimary: true,
        updatedAt: new Date("2026-07-02T00:00:00.000Z"),
      },
      {
        assetLinkId: 902,
        mediaAssetId: 502,
        url: "https://cdn.example.com/candidate-b.png",
        approved: false,
        isPrimary: false,
        updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    ]);

    const result = await router.listLocationAssets({
      ctx: ctx(),
      input: { seriesId: "10", locationId: "5" },
    });

    expect(mockListLocationAssets).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      5,
    );
    expect(result).toEqual({
      assets: [
        {
          assetLinkId: "901",
          mediaAssetId: "501",
          url: "https://cdn.example.com/candidate-a.png",
          approved: true,
          isPrimary: true,
          updatedAt: "2026-07-02T00:00:00.000Z",
        },
        {
          assetLinkId: "902",
          mediaAssetId: "502",
          url: "https://cdn.example.com/candidate-b.png",
          approved: false,
          isPrimary: false,
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      ],
    });
  });

  it("throws NOT_FOUND when the location is not owned by the caller, never calling the service", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([])); // loadOwnedLocation — no row

    await expect(
      router.listLocationAssets({ ctx: ctx(), input: { seriesId: "10", locationId: "999" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockListLocationAssets).not.toHaveBeenCalled();
  });
});

describe("setPrimaryLocationAsset", () => {
  it("parses ids to numbers, calls setPrimaryAsset, and returns { ok: true }", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW])) // loadOwnedSeries
      .mockReturnValueOnce(selectChain([LOCATION_ROW])); // loadOwnedLocation
    mockSetPrimaryAsset.mockResolvedValue(undefined);

    const result = await router.setPrimaryLocationAsset({
      ctx: ctx(),
      input: { seriesId: "10", locationId: "5", assetLinkId: "901" },
    });

    expect(mockSetPrimaryAsset).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      5,
      901,
    );
    expect(result).toEqual({ ok: true });
  });

  it("throws NOT_FOUND when the location is not owned by the caller, never calling the service", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([])); // loadOwnedLocation — no row

    await expect(
      router.setPrimaryLocationAsset({
        ctx: ctx(),
        input: { seriesId: "10", locationId: "999", assetLinkId: "901" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockSetPrimaryAsset).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* SECURITY — every VerticalDramaLocationStockError maps to a generic        */
/* NOT_FOUND, never a leaked reason string (see verticalDramaLocations.ts's  */
/* own `mapLocationStockError` doc comment).                                */
/* -------------------------------------------------------------------------- */

describe("VerticalDramaLocationStockError -> generic NOT_FOUND mapping (security)", () => {
  const REASONS = [
    "media_asset_not_found",
    "media_asset_cross_tenant",
    "media_asset_cross_user",
    "media_asset_deleted",
    "asset_not_found",
    "asset_wrong_role",
    "asset_not_approved",
    "illegal_state_transition",
  ];

  it.each(REASONS)("linkAsset: reason=%s maps to a generic NOT_FOUND, never leaking the reason string", async reason => {
    mockDb.select.mockReturnValueOnce(selectChain([SERIES_ROW])); // loadOwnedSeries
    mockLinkAsset.mockRejectedValueOnce(
      new MockVerticalDramaLocationStockError(reason, `Referenced media asset belongs to another ${reason}`),
    );

    let caught: any;
    try {
      await router.linkAsset({
        ctx: ctx(),
        input: { seriesId: "10", mediaAssetId: "77", source: "imported" },
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ code: "NOT_FOUND" });
    // The specific machine-readable reason (e.g. "cross_tenant") must NEVER
    // appear in the client-visible message — this is the actual security
    // assertion, not just the error code.
    expect(String(caught.message)).not.toContain(reason);
    expect(String(caught.message).toLowerCase()).not.toContain("tenant");
    expect(String(caught.message).toLowerCase()).not.toContain("cross");
  });

  it.each(REASONS)("approveAsset: reason=%s maps to a generic NOT_FOUND", async reason => {
    mockDb.select.mockReturnValueOnce(selectChain([SERIES_ROW]));
    mockTransition.mockRejectedValueOnce(new MockVerticalDramaLocationStockError(reason, `boom ${reason}`));

    await expect(
      router.approveAsset({ ctx: ctx(), input: { seriesId: "10", assetLinkId: "9" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it.each(REASONS)("transitionAsset: reason=%s maps to a generic NOT_FOUND (not PRECONDITION_FAILED, even for illegal_state_transition)", async reason => {
    mockDb.select.mockReturnValueOnce(selectChain([SERIES_ROW]));
    mockTransition.mockRejectedValueOnce(new MockVerticalDramaLocationStockError(reason, `boom ${reason}`));

    await expect(
      router.transitionAsset({
        ctx: ctx(),
        input: { seriesId: "10", assetLinkId: "9", to: "approved" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it.each(REASONS)("deleteAsset: reason=%s maps to a generic NOT_FOUND", async reason => {
    mockDb.select.mockReturnValueOnce(selectChain([SERIES_ROW]));
    mockDeleteAsset.mockRejectedValueOnce(new MockVerticalDramaLocationStockError(reason, `boom ${reason}`));

    await expect(
      router.deleteAsset({ ctx: ctx(), input: { seriesId: "10", assetLinkId: "9" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it.each(REASONS)(
    "setPrimaryLocationAsset: reason=%s maps to a generic NOT_FOUND, never leaking the reason string",
    async reason => {
      mockDb.select
        .mockReturnValueOnce(selectChain([SERIES_ROW])) // loadOwnedSeries
        .mockReturnValueOnce(selectChain([LOCATION_ROW])); // loadOwnedLocation
      mockSetPrimaryAsset.mockRejectedValueOnce(
        new MockVerticalDramaLocationStockError(reason, `boom ${reason}`),
      );

      let caught: any;
      try {
        await router.setPrimaryLocationAsset({
          ctx: ctx(),
          input: { seriesId: "10", locationId: "5", assetLinkId: "901" },
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toMatchObject({ code: "NOT_FOUND" });
      expect(String(caught.message)).not.toContain(reason);
    },
  );

  it("a non-stock-error (e.g. a genuine programming error) is rethrown unchanged, not masked as NOT_FOUND", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([SERIES_ROW]));
    mockLinkAsset.mockRejectedValueOnce(new Error("unexpected DB connection failure"));

    await expect(
      router.linkAsset({
        ctx: ctx(),
        input: { seriesId: "10", mediaAssetId: "77", source: "imported" },
      }),
    ).rejects.toMatchObject({ message: "unexpected DB connection failure" });
  });
});

/* -------------------------------------------------------------------------- */
/* updateLocation — locationKey is never editable                            */
/* -------------------------------------------------------------------------- */

describe("updateLocation", () => {
  it("updates name/description but the input schema has no locationKey field at all", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([LOCATION_ROW]));
    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((v: any) => {
        capturedSet = v;
        return updateChain([{ ...LOCATION_ROW, name: "ร้านสะดวกซื้อ (ใหม่)" }]);
      }),
    });

    const result = await router.updateLocation({
      ctx: ctx(),
      input: { seriesId: "10", locationId: "5", name: "ร้านสะดวกซื้อ (ใหม่)" },
    });

    expect(capturedSet).not.toHaveProperty("locationKey");
    expect(result.location.name).toBe("ร้านสะดวกซื้อ (ใหม่)");
  });
});
