/**
 * Vertical Drama CHARACTER tab — W2 manual CRUD (F5,
 * `planning/vertical-drama-twin-variant-completeness/plan.md`): lets a user
 * manually create/delete character variants and twins, and manually trigger
 * AI variant/twin detection, instead of these only ever being created by the
 * `runImproveScriptJob` AI pipeline.
 *
 * Covers:
 *  - `createCharacterVariant` — happy path + `characterKey` dedup collision.
 *  - `createCharacterTwin` — happy path + `characterKey` dedup collision.
 *  - `deleteCharacter` — blocked when a variant or twin dependent exists,
 *    succeeds when there are none.
 *  - `detectCharacterVariantsNow` — happy path (delegates to
 *    `generateCharacterVariantPlan`/`reconcileCharacterVariantPlan` via a
 *    dynamic `import()`) + `PRECONDITION_FAILED` when there is no usable
 *    drafted episode content.
 *
 * Same "mock the whole module graph, test the exported procedure handler
 * directly" convention as `verticalDramaCharacters.voiceChain.test.ts`/
 * `verticalDramaCharacters.modelSelection.test.ts`.
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

const { mockGetTenantFeatureFlags } = vi.hoisted(() => ({
  mockGetTenantFeatureFlags: vi.fn(),
}));
vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));

const { mockLinkAsset } = vi.hoisted(() => ({
  mockLinkAsset: vi.fn(),
}));
vi.mock("../../services/verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: {
    getPrimaryPortraitUrl: vi.fn(),
    getManifest: vi.fn(async () => ({ approved: 0, pending: 0, stale: 0, assets: [] })),
    linkAsset: mockLinkAsset,
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

vi.mock("../../services/mediaGenerationService", () => ({
  mediaGenerationService: { generateImageAsync: vi.fn(), generateAudioAsync: vi.fn() },
  DEFAULT_MODELS: { image: "google-nano-banana-pro", audio: "uvoice/tts-premium" },
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

vi.mock("../../services/verticalDramaCharacterImageGeneration", () => ({
  generateCharacterVisualPrompts: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
  readPresetVisualIdentityFromBible: vi.fn(() => undefined),
}));

vi.mock("../../services/rateLimiter", () => ({
  mediaGenerationLimiter: { isAllowed: vi.fn(() => true), getResetTime: vi.fn(() => 0) },
}));

vi.mock("../../services/mediaAssetService", () => ({
  createAssetFromAttachment: vi.fn(),
}));

vi.mock("../../services/modelRegistry", () => ({
  getModelsByTypeAsync: vi.fn(async () => []),
}));

vi.mock("../../services/mediaTransportResolver", () => ({
  resolveMediaTransport: vi.fn(),
}));

vi.mock("../media", () => ({
  mediaRouter: {
    createCaller: () => ({ listModelFieldOptions: vi.fn() }),
  },
}));

const { mockDebugError } = vi.hoisted(() => ({
  mockDebugError: vi.fn(),
}));
vi.mock("../../_core/logger", () => ({
  debugError: mockDebugError,
  debugLog: vi.fn(),
}));

/* -------------------------------------------------------------------------- */
/* Dynamically-imported modules (`detectCharacterVariantsNow`)                */
/* -------------------------------------------------------------------------- */

const {
  mockGetActiveBreakdown,
  mockReadItemShotDrafts,
  mockReadItemCliffhangerLine,
} = vi.hoisted(() => ({
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
  mockGenerateCharacterVariantPlan,
  mockReconcileCharacterVariantPlan,
  mockExtractCharacterRosterDescription,
} = vi.hoisted(() => ({
  mockGenerateCharacterVariantPlan: vi.fn(),
  mockReconcileCharacterVariantPlan: vi.fn(),
  mockExtractCharacterRosterDescription: vi.fn(() => ""),
}));
vi.mock("../../services/verticalDramaCharacterVariantPlanner", () => ({
  generateCharacterVariantPlan: mockGenerateCharacterVariantPlan,
  reconcileCharacterVariantPlan: mockReconcileCharacterVariantPlan,
  extractCharacterRosterDescription: mockExtractCharacterRosterDescription,
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));

import { verticalDramaCharactersRouter } from "../verticalDramaCharacters";

const router = verticalDramaCharactersRouter as unknown as Record<string, Function>;

function ctx(overrides: Partial<{ tenantId: string | null; user: { id: number } }> = {}) {
  return { tenantId: "tenant-1", user: { id: 42 }, userToken: null, publicUrl: undefined, ...overrides };
}

/** Thenable select-chain stub — resolves at ANY point in the chain (`.where()`,
 *  `.limit()`, or awaited directly), same convention as
 *  `verticalDramaCharacters.voiceChain.test.ts`. */
function selectChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

function insertChain(returned: unknown[]) {
  const chain: any = {
    values: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(returned)),
  };
  return chain;
}

function deleteChain() {
  const chain: any = {
    where: vi.fn(() => Promise.resolve(undefined)),
  };
  return chain;
}

const SERIES_ROW = { id: 10 };

const PARENT_ROW = {
  id: 1,
  tenantId: "tenant-1",
  userId: 42,
  seriesId: 10,
  characterKey: "aria",
  name: "Aria",
  role: "protagonist",
  data: null,
  voiceConfig: null,
  parentCharacterId: null,
  variantLabel: null,
  variantType: null,
  sharesFaceWithCharacterId: null,
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-01T00:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesVoiceChain: false });
  mockLinkAsset.mockResolvedValue({ id: "asset-link-1" });
});

/* -------------------------------------------------------------------------- */
/* createCharacterVariant                                                     */
/* -------------------------------------------------------------------------- */

describe("createCharacterVariant", () => {
  it("creates a new outfit variant row with data.description/wardrobeRules populated from customDescription", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW])) // loadOwnedSeries
      .mockReturnValueOnce(selectChain([PARENT_ROW])) // loadOwnedCharacter (parent)
      .mockReturnValueOnce(selectChain([{ characterKey: "aria" }])); // loadSeriesCharacterKeys

    const insertedRow = {
      ...PARENT_ROW,
      id: 2,
      characterKey: "aria-variant",
      parentCharacterId: 1,
      variantLabel: "ชุดนักเรียน",
      variantType: "outfit",
      data: { description: "ใส่ชุดนักเรียน", wardrobeRules: ["ใส่ชุดนักเรียน"] },
    };
    const valuesSpy = vi.fn();
    const chain = insertChain([insertedRow]);
    const originalValues = chain.values;
    chain.values = vi.fn((arg: unknown) => {
      valuesSpy(arg);
      return originalValues(arg);
    });
    mockDb.insert.mockReturnValueOnce(chain);

    const result = await router.createCharacterVariant({
      ctx: ctx(),
      input: {
        seriesId: "10",
        parentCharacterId: "1",
        variantLabel: "ชุดนักเรียน",
        variantType: "outfit",
        customDescription: "ใส่ชุดนักเรียน",
      },
    });

    expect(valuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Aria",
        role: "protagonist",
        parentCharacterId: 1,
        variantLabel: "ชุดนักเรียน",
        variantType: "outfit",
        data: { description: "ใส่ชุดนักเรียน", wardrobeRules: ["ใส่ชุดนักเรียน"] },
      }),
    );
    expect(result.character.parentCharacterId).toBe("1");
    expect(result.character.variantLabel).toBe("ชุดนักเรียน");
    expect(result.character.variantType).toBe("outfit");
    expect(mockLinkAsset).not.toHaveBeenCalled();
  });

  it("does NOT set wardrobeRules for an age_stage variant, and does not 100%-lock the face", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([PARENT_ROW]))
      .mockReturnValueOnce(selectChain([{ characterKey: "aria" }]));

    const valuesSpy = vi.fn();
    const chain = insertChain([{ ...PARENT_ROW, id: 3, characterKey: "aria-variant" }]);
    const originalValues = chain.values;
    chain.values = vi.fn((arg: unknown) => {
      valuesSpy(arg);
      return originalValues(arg);
    });
    mockDb.insert.mockReturnValueOnce(chain);

    await router.createCharacterVariant({
      ctx: ctx(),
      input: {
        seriesId: "10",
        parentCharacterId: "1",
        variantLabel: "วัยผู้ใหญ่",
        variantType: "age_stage",
        customDescription: "อายุ 30 ปี",
      },
    });

    const insertedValues = valuesSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedValues.data).toEqual({ description: "อายุ 30 ปี" });
    expect((insertedValues.data as Record<string, unknown>).wardrobeRules).toBeUndefined();
  });

  it("dedupes the generated characterKey when the base key is already used", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([PARENT_ROW]))
      .mockReturnValueOnce(
        selectChain([{ characterKey: "aria" }, { characterKey: "aria-outfit-a" }]),
      ); // "aria-outfit-a" already taken

    const valuesSpy = vi.fn();
    const chain = insertChain([{ ...PARENT_ROW, id: 4, characterKey: "aria-outfit-a-2" }]);
    const originalValues = chain.values;
    chain.values = vi.fn((arg: unknown) => {
      valuesSpy(arg);
      return originalValues(arg);
    });
    mockDb.insert.mockReturnValueOnce(chain);

    await router.createCharacterVariant({
      ctx: ctx(),
      input: {
        seriesId: "10",
        parentCharacterId: "1",
        variantLabel: "Outfit A",
        variantType: "outfit",
      },
    });

    const insertedValues = valuesSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedValues.characterKey).toBe("aria-outfit-a-2");
    // customDescription omitted -> falls back to the variant label itself,
    // never an empty data.description.
    expect((insertedValues.data as Record<string, unknown>).description).toBe("Outfit A");
  });

  it("best-effort attaches referenceMediaAssetId via linkAsset without blocking on failure", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([PARENT_ROW]))
      .mockReturnValueOnce(selectChain([{ characterKey: "aria" }]));
    mockDb.insert.mockReturnValueOnce(insertChain([{ ...PARENT_ROW, id: 5, characterKey: "aria-variant" }]));
    mockLinkAsset.mockRejectedValueOnce(new Error("asset not owned"));

    const result = await router.createCharacterVariant({
      ctx: ctx(),
      input: {
        seriesId: "10",
        parentCharacterId: "1",
        variantLabel: "Outfit B",
        variantType: "outfit",
        referenceMediaAssetId: "99",
      },
    });

    expect(mockLinkAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        characterId: 5,
        mediaAssetId: 99,
        role: "primary_portrait",
        source: "imported",
      }),
    );
    expect(mockDebugError).toHaveBeenCalled();
    expect(result.character).toBeDefined();
  });

  it("throws NOT_FOUND when the parent character is not owned by the caller", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([])); // loadOwnedCharacter — empty

    await expect(
      router.createCharacterVariant({
        ctx: ctx(),
        input: {
          seriesId: "10",
          parentCharacterId: "999",
          variantLabel: "Outfit A",
          variantType: "outfit",
        },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* createCharacterTwin                                                        */
/* -------------------------------------------------------------------------- */

describe("createCharacterTwin", () => {
  it("creates an independent twin row with sharesFaceWithCharacterId set (never parentCharacterId)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW])) // loadOwnedSeries
      .mockReturnValueOnce(selectChain([PARENT_ROW])) // loadOwnedCharacter (source)
      .mockReturnValueOnce(selectChain([{ characterKey: "aria" }])); // loadSeriesCharacterKeys

    const insertedRow = {
      ...PARENT_ROW,
      id: 6,
      characterKey: "aria-twin",
      name: "Mimi",
      parentCharacterId: null,
      variantLabel: null,
      variantType: null,
      sharesFaceWithCharacterId: 1,
      data: { description: "ผมสั้นกว่า" },
    };
    const valuesSpy = vi.fn();
    const chain = insertChain([insertedRow]);
    const originalValues = chain.values;
    chain.values = vi.fn((arg: unknown) => {
      valuesSpy(arg);
      return originalValues(arg);
    });
    mockDb.insert.mockReturnValueOnce(chain);

    const result = await router.createCharacterTwin({
      ctx: ctx(),
      input: {
        seriesId: "10",
        sharesFaceWithCharacterId: "1",
        name: "Mimi",
        customDescription: "ผมสั้นกว่า",
      },
    });

    expect(valuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        characterKey: "aria-twin",
        name: "Mimi",
        role: "protagonist", // falls back to source.role since input.role omitted
        sharesFaceWithCharacterId: 1,
        data: { description: "ผมสั้นกว่า" },
      }),
    );
    const insertedValues = valuesSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedValues.parentCharacterId).toBeUndefined();
    expect(insertedValues.variantLabel).toBeUndefined();
    expect(result.character.sharesFaceWithCharacterId).toBe("1");
    expect(result.character.parentCharacterId).toBeUndefined();
  });

  it("dedupes the generated characterKey when '<source>-twin' is already used", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([PARENT_ROW]))
      .mockReturnValueOnce(selectChain([{ characterKey: "aria" }, { characterKey: "aria-twin" }]));

    const valuesSpy = vi.fn();
    const chain = insertChain([{ ...PARENT_ROW, id: 7, characterKey: "aria-twin-2" }]);
    const originalValues = chain.values;
    chain.values = vi.fn((arg: unknown) => {
      valuesSpy(arg);
      return originalValues(arg);
    });
    mockDb.insert.mockReturnValueOnce(chain);

    await router.createCharacterTwin({
      ctx: ctx(),
      input: { seriesId: "10", sharesFaceWithCharacterId: "1", name: "Mimi 2" },
    });

    const insertedValues = valuesSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedValues.characterKey).toBe("aria-twin-2");
    expect(insertedValues.data).toBeNull(); // no customDescription given
  });
});

/* -------------------------------------------------------------------------- */
/* deleteCharacter                                                            */
/* -------------------------------------------------------------------------- */

describe("deleteCharacter", () => {
  it("deletes when there are no dependent variant/twin rows", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW])) // loadOwnedSeries
      .mockReturnValueOnce(selectChain([PARENT_ROW])) // loadOwnedCharacter
      .mockReturnValueOnce(selectChain([])); // dependents query — none
    mockDb.delete.mockReturnValueOnce(deleteChain());

    const result = await router.deleteCharacter({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1" },
    });

    expect(result).toEqual({ success: true });
    expect(mockDb.delete).toHaveBeenCalledTimes(1);
  });

  it("blocks with PRECONDITION_FAILED when a variant row depends on this character", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([PARENT_ROW]))
      .mockReturnValueOnce(selectChain([{ id: 2 }])); // a variant row (parentCharacterId = 1)

    await expect(
      router.deleteCharacter({ ctx: ctx(), input: { seriesId: "10", characterId: "1" } }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it("blocks with PRECONDITION_FAILED when a twin row depends on this character", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([PARENT_ROW]))
      .mockReturnValueOnce(selectChain([{ id: 6 }])); // a twin row (sharesFaceWithCharacterId = 1)

    await expect(
      router.deleteCharacter({ ctx: ctx(), input: { seriesId: "10", characterId: "1" } }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for a character in another tenant's series (ownership guard)", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // loadOwnedSeries — empty

    await expect(
      router.deleteCharacter({
        ctx: ctx({ tenantId: "other-tenant" }),
        input: { seriesId: "10", characterId: "1" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockDb.delete).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* detectCharacterVariantsNow                                                 */
/* -------------------------------------------------------------------------- */

describe("detectCharacterVariantsNow", () => {
  it("runs generateCharacterVariantPlan -> reconcileCharacterVariantPlan and returns created/updated counts", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW])) // loadOwnedSeries
      .mockReturnValueOnce(selectChain([{ locale: "th", bible: { episodeBreakdown: [{ episodeNumber: 1 }] } }])) // series row
      .mockReturnValueOnce(selectChain([PARENT_ROW])); // characterRows

    mockGetActiveBreakdown.mockReturnValue([
      { episodeNumber: 1, workingTitle: "Ep1", logline: "...", keyBeats: [] },
    ]);
    mockReadItemShotDrafts.mockReturnValue([{ shotNumber: 1 }]);
    mockReadItemCliffhangerLine.mockReturnValue("cliff");
    mockGenerateCharacterVariantPlan.mockResolvedValue({
      plan: { character_plans: [], twin_detections: [] },
      creditsUsed: 3,
      model: "some-model",
    });
    mockReconcileCharacterVariantPlan.mockResolvedValue({
      createdCharacters: [
        { name: "Aria", variantLabel: "Outfit A" },
        { name: "Mimi", variantLabel: null },
      ],
      updatedCharacters: [{ name: "Aria", variantLabel: "Old Look" }],
    });

    const result = await router.detectCharacterVariantsNow({
      ctx: ctx(),
      input: { seriesId: "10" },
    });

    expect(mockGenerateCharacterVariantPlan).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 42, tenantId: "tenant-1", seriesId: 10, lang: "th" }),
    );
    expect(mockReconcileCharacterVariantPlan).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      { character_plans: [], twin_detections: [] },
    );
    expect(result.variantsCreated).toBe(1);
    expect(result.twinsCreated).toBe(1);
    expect(result.variantsUpdated).toBe(1);
  });

  it("throws PRECONDITION_FAILED when there is no usable drafted episode content", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW])) // loadOwnedSeries
      .mockReturnValueOnce(selectChain([{ locale: "th", bible: {} }])); // series row

    mockGetActiveBreakdown.mockReturnValue([]); // no drafted episodes at all

    await expect(
      router.detectCharacterVariantsNow({ ctx: ctx(), input: { seriesId: "10" } }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    expect(mockGenerateCharacterVariantPlan).not.toHaveBeenCalled();
    expect(mockReconcileCharacterVariantPlan).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for a series the caller does not own", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));

    await expect(
      router.detectCharacterVariantsNow({ ctx: ctx(), input: { seriesId: "999" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockGenerateCharacterVariantPlan).not.toHaveBeenCalled();
  });
});
