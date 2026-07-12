/**
 * Vertical Drama Series — `detectLocationsNow` (whole-series Location Visual
 * Bible detection) router coverage. Location-side companion to
 * `verticalDramaCharacters.ts`'s `detectCharacterVariantsNow`; same "mock
 * the whole module graph, invoke the exported procedure handler directly"
 * convention as `verticalDramaLocations.test.ts`.
 *
 * `detectLocationsNow` loads `../../services/verticalDramaStoryBible` and
 * `../../services/verticalDramaLocationDetector` via a DYNAMIC `import()`
 * inside the procedure body (never a static top-level import — see that
 * procedure's own doc comment) — `vi.mock` intercepts module resolution
 * identically for dynamic and static imports, so both are mocked below the
 * same way every other module this router statically imports already is.
 *
 * Covers:
 *  - happy path (existing roster, drafted episodes present).
 *  - `PRECONDITION_FAILED` when there are zero drafted episodes.
 *  - `NOT_FOUND` when the caller doesn't own the series.
 *  - DELIBERATE DIVERGENCE from `detectCharacterVariantsNow`: an EMPTY
 *    existing location roster must NOT throw.
 *  - `InsufficientCreditsError`/`VdSchemaValidationError` mapping, and the
 *    rate-limit guard, mirroring every other paid-generation procedure on
 *    this router.
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

vi.mock("../../services/verticalDramaLocationStock", () => ({
  verticalDramaLocationStockService: {
    listRows: vi.fn(),
    getPrimaryReferenceUrl: vi.fn(),
    getPrimaryReferenceAssetId: vi.fn(),
    linkAsset: vi.fn(),
    transition: vi.fn(),
    markStale: vi.fn(),
    deleteAsset: vi.fn(),
  },
  VerticalDramaLocationStockError: class extends Error {
    constructor(
      public readonly reason: string,
      message: string,
    ) {
      super(message);
      this.name = "VerticalDramaLocationStockError";
    }
  },
}));

vi.mock("../../services/mediaGenerationService", () => ({
  mediaGenerationService: { generateImageAsync: vi.fn() },
  DEFAULT_MODELS: { image: "google-nano-banana-pro" },
}));

vi.mock("../../services/pricingCalculator", () => ({
  calculateCreditCost: vi.fn(() => 5),
}));

vi.mock("../../services/creditService", () => ({
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  refundCredits: vi.fn(),
}));

vi.mock("../../_core/tokens", () => ({
  signBearerToken: vi.fn(() => "token"),
}));

vi.mock("../../services/verticalDramaLocationImageGeneration", () => ({
  generateLocationVisualPrompts: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));

vi.mock("../../services/verticalDramaCharacterImageGeneration", () => ({
  readPresetVisualIdentityFromBible: vi.fn(() => undefined),
}));

const { mockIsAllowed, mockGetResetTime } = vi.hoisted(() => ({
  mockIsAllowed: vi.fn(() => true),
  mockGetResetTime: vi.fn(() => 0),
}));
vi.mock("../../services/rateLimiter", () => ({
  mediaGenerationLimiter: { isAllowed: mockIsAllowed, getResetTime: mockGetResetTime },
}));

vi.mock("../../services/mediaAssetService", () => ({
  createAssetFromAttachment: vi.fn(),
}));

vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: vi.fn(async () => ({ verticalDramaSeriesPresetMixV2: false })),
}));

/* -------------------------------------------------------------------------- */
/* detectLocationsNow's own dynamically-imported collaborators               */
/* -------------------------------------------------------------------------- */

const { mockGetActiveBreakdown, mockReadItemShotDrafts, mockReadItemCliffhangerLine } = vi.hoisted(() => ({
  mockGetActiveBreakdown: vi.fn(),
  mockReadItemShotDrafts: vi.fn(),
  mockReadItemCliffhangerLine: vi.fn(),
}));
vi.mock("../../services/verticalDramaStoryBible", () => ({
  getActiveBreakdown: mockGetActiveBreakdown,
  readItemShotDrafts: mockReadItemShotDrafts,
  readItemCliffhangerLine: mockReadItemCliffhangerLine,
}));

const {
  mockGenerateLocationDetectionPlan,
  mockReconcileLocationDetectionPlan,
  MockInsufficientCreditsError,
  MockVdSchemaValidationError,
} = vi.hoisted(() => {
  class MockInsufficientCreditsError extends Error {}
  class MockVdSchemaValidationError extends Error {}
  return {
    mockGenerateLocationDetectionPlan: vi.fn(),
    mockReconcileLocationDetectionPlan: vi.fn(),
    MockInsufficientCreditsError,
    MockVdSchemaValidationError,
  };
});
vi.mock("../../services/verticalDramaLocationDetector", () => ({
  generateLocationDetectionPlan: mockGenerateLocationDetectionPlan,
  reconcileLocationDetectionPlan: mockReconcileLocationDetectionPlan,
  InsufficientCreditsError: MockInsufficientCreditsError,
  VdSchemaValidationError: MockVdSchemaValidationError,
}));

import { verticalDramaLocationsRouter } from "../verticalDramaLocations";
import { hasEnoughCredits, deductCredits } from "../../services/creditService";

const router = verticalDramaLocationsRouter as unknown as Record<string, Function>;
const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockDeductCredits = vi.mocked(deductCredits);

function ctx(overrides: Partial<{ tenantId: string | null; user: { id: number } }> = {}) {
  return { tenantId: "tenant-1", user: { id: 42 }, userToken: "session-token", publicUrl: undefined, ...overrides };
}

/** Thenable select-chain stub — resolves at ANY point in the chain, same
 *  convention as `verticalDramaLocations.test.ts`. */
function selectChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

const SERIES_ROW = { id: 10 };
const SERIES_BIBLE_ROW = { locale: "th", bible: {} };
const LOCATION_ROW = {
  id: 5,
  tenantId: "tenant-1",
  userId: 42,
  seriesId: 10,
  locationKey: "home-kitchen",
  name: "ครัวที่บ้าน",
  data: { description: "ครัวเปิดโล่งต่อกับมุมกินข้าว" },
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-01T00:00:00.000Z"),
};

/** A single `getActiveBreakdown()`-shaped item with drafted shot content. */
const DRAFTED_ITEM = {
  episodeNumber: 1,
  workingTitle: "เช้าวันธรรมดา",
  logline: "หนูนาตื่นนอน ช่วยแม่จัดโต๊ะอาหารเช้าที่ครัว",
  keyBeats: ["หนูนาตื่นนอน ลงมาช่วยแม่ที่ครัว"],
};
const SOME_SHOT_DRAFTS = [{ shot_number: 1, summary: "เปิดฉากที่ครัว", dialogue_lines: [] }];

function planSummary(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    createdLocations: [{ locationKey: "home-kitchen", name: "ครัวที่บ้าน" }],
    reusedLocations: [{ locationKey: "school-hallway", name: "ทางเดินโรงเรียน" }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAllowed.mockReturnValue(true);
  mockGetResetTime.mockReturnValue(0);
  mockHasEnoughCredits.mockResolvedValue(true);
  mockDeductCredits.mockResolvedValue(undefined as any);

  mockGetActiveBreakdown.mockReturnValue([DRAFTED_ITEM]);
  mockReadItemShotDrafts.mockReturnValue(SOME_SHOT_DRAFTS);
  mockReadItemCliffhangerLine.mockReturnValue(undefined);

  mockGenerateLocationDetectionPlan.mockResolvedValue({
    plan: { contract_version: 1, locations: [] },
    creditsUsed: 4,
    model: "gpt-4o-mini",
  });
  mockReconcileLocationDetectionPlan.mockResolvedValue(planSummary());
});

/* -------------------------------------------------------------------------- */
/* Happy path                                                                 */
/* -------------------------------------------------------------------------- */

describe("detectLocationsNow — happy path", () => {
  it("reads drafted episodes + the existing roster, calls generateLocationDetectionPlan then reconcileLocationDetectionPlan, and returns the summary", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW])) // loadOwnedSeries
      .mockReturnValueOnce(selectChain([SERIES_BIBLE_ROW])) // series locale/bible
      .mockReturnValueOnce(selectChain([LOCATION_ROW])); // existing location roster

    const result = await router.detectLocationsNow({ ctx: ctx(), input: { seriesId: "10" } });

    expect(mockGenerateLocationDetectionPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        tenantId: "tenant-1",
        seriesId: 10,
        lang: "th",
        existingLocations: [
          { locationKey: "home-kitchen", name: "ครัวที่บ้าน", description: "ครัวเปิดโล่งต่อกับมุมกินข้าว" },
        ],
        episodes: [
          expect.objectContaining({
            episodeNumber: 1,
            workingTitle: "เช้าวันธรรมดา",
            shotDrafts: SOME_SHOT_DRAFTS,
          }),
        ],
      }),
    );
    expect(mockReconcileLocationDetectionPlan).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      { contract_version: 1, locations: [] },
    );
    expect(result).toEqual({
      locationsCreated: 1,
      locationsReused: 1,
      createdLocations: [{ locationKey: "home-kitchen", name: "ครัวที่บ้าน" }],
      reusedLocations: [{ locationKey: "school-hallway", name: "ทางเดินโรงเรียน" }],
    });
  });

  it("defaults lang to en when the series locale is not th", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([{ locale: "en", bible: {} }]))
      .mockReturnValueOnce(selectChain([LOCATION_ROW]));

    await router.detectLocationsNow({ ctx: ctx(), input: { seriesId: "10" } });

    expect(mockGenerateLocationDetectionPlan).toHaveBeenCalledWith(
      expect.objectContaining({ lang: "en" }),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* PRECONDITION_FAILED — zero drafted episodes                                */
/* -------------------------------------------------------------------------- */

describe("detectLocationsNow — PRECONDITION_FAILED on zero drafted episodes", () => {
  it("throws PRECONDITION_FAILED and never calls generateLocationDetectionPlan when no episode has drafted shot content", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW])) // loadOwnedSeries
      .mockReturnValueOnce(selectChain([SERIES_BIBLE_ROW])); // series locale/bible
    mockReadItemShotDrafts.mockReturnValue(null);

    await expect(
      router.detectLocationsNow({ ctx: ctx(), input: { seriesId: "10" } }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    expect(mockGenerateLocationDetectionPlan).not.toHaveBeenCalled();
    expect(mockReconcileLocationDetectionPlan).not.toHaveBeenCalled();
  });

  it("throws PRECONDITION_FAILED when there are no breakdown items at all", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_BIBLE_ROW]));
    mockGetActiveBreakdown.mockReturnValue([]);

    await expect(
      router.detectLocationsNow({ ctx: ctx(), input: { seriesId: "10" } }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});

/* -------------------------------------------------------------------------- */
/* NOT_FOUND — caller doesn't own the series                                  */
/* -------------------------------------------------------------------------- */

describe("detectLocationsNow — NOT_FOUND when the caller doesn't own the series", () => {
  it("throws NOT_FOUND and never reads breakdown/roster data", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // loadOwnedSeries — no row

    await expect(
      router.detectLocationsNow({ ctx: ctx(), input: { seriesId: "999" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockGetActiveBreakdown).not.toHaveBeenCalled();
    expect(mockGenerateLocationDetectionPlan).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* DELIBERATE DIVERGENCE — empty existing roster must NOT throw               */
/* -------------------------------------------------------------------------- */

describe("detectLocationsNow — deliberate divergence from detectCharacterVariantsNow", () => {
  it("does NOT throw when the existing location roster is completely empty — proposes a fresh roster from nothing", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW])) // loadOwnedSeries
      .mockReturnValueOnce(selectChain([SERIES_BIBLE_ROW])) // series locale/bible
      .mockReturnValueOnce(selectChain([])); // existing location roster — EMPTY

    const result = await router.detectLocationsNow({ ctx: ctx(), input: { seriesId: "10" } });

    expect(mockGenerateLocationDetectionPlan).toHaveBeenCalledWith(
      expect.objectContaining({ existingLocations: [] }),
    );
    expect(result).toEqual({
      locationsCreated: 1,
      locationsReused: 1,
      createdLocations: [{ locationKey: "home-kitchen", name: "ครัวที่บ้าน" }],
      reusedLocations: [{ locationKey: "school-hallway", name: "ทางเดินโรงเรียน" }],
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Error mapping + rate limiting                                              */
/* -------------------------------------------------------------------------- */

describe("detectLocationsNow — error mapping + rate limiting", () => {
  it("throws TOO_MANY_REQUESTS when the rate limiter rejects the call", async () => {
    mockIsAllowed.mockReturnValue(false);
    mockGetResetTime.mockReturnValue(5000);

    await expect(
      router.detectLocationsNow({ ctx: ctx(), input: { seriesId: "10" } }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });

    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("maps InsufficientCreditsError (from generateLocationDetectionPlan) to FORBIDDEN", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_BIBLE_ROW]))
      .mockReturnValueOnce(selectChain([LOCATION_ROW]));
    mockGenerateLocationDetectionPlan.mockRejectedValueOnce(
      new MockInsufficientCreditsError("insufficient credits"),
    );

    await expect(
      router.detectLocationsNow({ ctx: ctx(), input: { seriesId: "10" } }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockReconcileLocationDetectionPlan).not.toHaveBeenCalled();
  });

  it("maps VdSchemaValidationError (from generateLocationDetectionPlan) to INTERNAL_SERVER_ERROR", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_BIBLE_ROW]))
      .mockReturnValueOnce(selectChain([LOCATION_ROW]));
    mockGenerateLocationDetectionPlan.mockRejectedValueOnce(
      new MockVdSchemaValidationError("bad schema"),
    );

    await expect(
      router.detectLocationsNow({ ctx: ctx(), input: { seriesId: "10" } }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});
