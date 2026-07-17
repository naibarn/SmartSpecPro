/**
 * Vertical Drama CHARACTER tab — per-character ethnicity/region override
 * (`planning/vd-per-character-ethnicity/plan.md`, 2026-07-17).
 *
 * Covers the SERVER-side wiring only (UI is a separate later task):
 *  - `createCharacter`/`updateCharacter` — persist `region`/`ethnicityText`
 *    into `character.data` without clobbering other `data` keys, and stay
 *    byte-identical (`data: null`) when neither field is touched.
 *  - `previewCharacterPrompt` (both the single-prompt and portrait-candidate
 *    branches), `generateCharacterImage`, and `generateCharacterSheet` — each
 *    resolves `resolvedCharacterRegion` from the character's own `data` and
 *    threads it into `generateCharacterVisualPrompts`/
 *    `generateCharacterPortraitCandidates`, OVERRIDING the series-level
 *    default at these exact 3 read-sites the plan names.
 *
 * Same "mock the whole module graph, invoke the exported procedure handler
 * directly" convention as `verticalDramaCharacters.customInstruction.test.ts`
 * (this file's mocking setup is a direct copy of that one's, since both
 * exercise the identical previewCharacterPrompt/generateCharacterImage/
 * generateCharacterSheet call paths for an analogous "one extra optional
 * fact flows through to the planner" scenario) and
 * `verticalDramaCharacters.voiceChain.test.ts` (createCharacter/
 * updateCharacter persistence tests).
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

const { mockGetPrimaryPortraitUrl, mockCreatePortraitCandidateDraftBatch } = vi.hoisted(() => ({
  mockGetPrimaryPortraitUrl: vi.fn(),
  mockCreatePortraitCandidateDraftBatch: vi.fn(),
}));
vi.mock("../../services/verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: {
    getPrimaryPortraitUrl: mockGetPrimaryPortraitUrl,
    getReferenceImageUrlByAssetLinkId: vi.fn(),
    createPortraitCandidateDraftBatch: mockCreatePortraitCandidateDraftBatch,
  },
  VerticalDramaCharacterStockError: class extends Error {
    constructor(
      public readonly reason: string,
      message: string,
    ) {
      super(message);
    }
  },
  VD_PORTRAIT_CANDIDATE_POLICY_REJECTED_MESSAGE: "policy-rejected",
}));

const { mockGenerateImageAsync } = vi.hoisted(() => ({
  mockGenerateImageAsync: vi.fn(),
}));
vi.mock("../../services/mediaGenerationService", () => ({
  mediaGenerationService: { generateImageAsync: mockGenerateImageAsync },
  DEFAULT_MODELS: { image: "google-nano-banana-pro" },
}));

vi.mock("../../services/pricingCalculator", () => ({
  calculateCreditCost: vi.fn(() => 5),
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
  mockGenerateCharacterVisualPrompts,
  mockGenerateCharacterPortraitCandidates,
  mockResolveFaceSourceReferenceForCharacter,
} = vi.hoisted(() => ({
  mockGenerateCharacterVisualPrompts: vi.fn(),
  mockGenerateCharacterPortraitCandidates: vi.fn(),
  mockResolveFaceSourceReferenceForCharacter: vi.fn(async () => null),
}));
vi.mock("../../services/verticalDramaCharacterImageGeneration", () => ({
  generateCharacterVisualPrompts: mockGenerateCharacterVisualPrompts,
  generateCharacterPortraitCandidates: mockGenerateCharacterPortraitCandidates,
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
  readPresetVisualIdentityFromBible: vi.fn(() => undefined),
  resolveFaceSourceReferenceForCharacter: mockResolveFaceSourceReferenceForCharacter,
}));

const { mockLoadCharacterDesignContext, mockPersistCharacterVisualBible } = vi.hoisted(() => ({
  mockLoadCharacterDesignContext: vi.fn(async () => ({
    seriesDna: {},
    currentCast: [],
    recentLeadArchive: [],
  })),
  mockPersistCharacterVisualBible: vi.fn(async () => undefined),
}));
vi.mock("../../services/verticalDramaCharacterDesignContext", () => ({
  loadCharacterDesignContext: mockLoadCharacterDesignContext,
}));

vi.mock("../../services/verticalDramaCharacterDnaPersistence", () => ({
  persistCharacterVisualBible: mockPersistCharacterVisualBible,
}));

vi.mock("../../services/rateLimiter", () => ({
  mediaGenerationLimiter: { isAllowed: vi.fn(() => true), getResetTime: vi.fn(() => 0) },
}));

vi.mock("../../services/mediaAssetService", () => ({
  createAssetFromAttachment: vi.fn(),
}));

vi.mock("../../services/modelRegistry", () => ({
  getModelsByTypeAsync: vi.fn(async () => []),
  isDbModelCatalogLoaded: vi.fn(() => false),
}));

vi.mock("../../services/mediaTransportResolver", () => ({
  resolveMediaTransport: vi.fn(),
}));

vi.mock("../media", () => ({
  reconcileTaskCredits: vi.fn(),
}));

import { verticalDramaCharactersRouter } from "../verticalDramaCharacters";

const router = verticalDramaCharactersRouter as unknown as Record<string, Function>;

function ctx(overrides: Partial<{ tenantId: string | null; user: { id: number } }> = {}) {
  return { tenantId: "tenant-1", user: { id: 42 }, userToken: "session-token", publicUrl: undefined, ...overrides };
}

/** Thenable select-chain stub — resolves at ANY point in the chain (`.where()`,
 *  `.limit()`, or awaited directly), same convention as this directory's
 *  other `verticalDramaCharacters.*.test.ts` files. */
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

function updateChain(returned: unknown[]) {
  const chain: any = {
    set: vi.fn(() => chain),
    where: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(returned)),
  };
  return chain;
}

const SERIES_ROW = { id: 10 };
const SERIES_CONTEXT_ROW = {
  id: 10,
  title: "Sisters of the Silk Market",
  genre: "family drama",
  tone: "warm",
  bible: null, // no series-level targetAudienceRegion set -> normalizes to "thai"
  updatedAt: new Date("2026-07-13T00:00:00.000Z"),
};

function characterRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    tenantId: "tenant-1",
    userId: 42,
    seriesId: 10,
    characterKey: "kirin",
    name: "คิริน",
    role: "lead",
    data: null,
    voiceConfig: null,
    parentCharacterId: null,
    variantLabel: null,
    variantType: null,
    sharesFaceWithCharacterId: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    ...overrides,
  };
}

function visualPromptResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    portraitPrompt: "a portrait prompt",
    negativePrompt: "a negative prompt",
    turnaroundPrompt: "a turnaround prompt",
    fullBodyPrompt: "a full body prompt",
    expressionSheetPrompt: "an expression sheet prompt",
    outfitSheetPrompt: "an outfit sheet prompt",
    raw: { visual_bible_summary: {} },
    creditsUsed: 4,
    model: "gpt-4o-mini",
    visualBibleSnapshot: {
      version: 1,
      createdAt: "2026-07-13T00:00:00.000Z",
      model: "gpt-4o-mini",
      visualIdentitySummary: "story-grounded lead",
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTenantFeatureFlags.mockResolvedValue({
    verticalDramaSeriesPresetMixV2: false,
    verticalDramaSeriesVoiceChain: false,
  });
  mockResolveFaceSourceReferenceForCharacter.mockResolvedValue(null);
  mockGetPrimaryPortraitUrl.mockResolvedValue(null);
  mockHasEnoughCredits.mockResolvedValue(true);
  mockDeductCredits.mockResolvedValue(undefined);
  mockGenerateImageAsync.mockResolvedValue({ id: "task-1" });
  mockGenerateCharacterVisualPrompts.mockResolvedValue(visualPromptResult());
  mockGenerateCharacterPortraitCandidates.mockResolvedValue({
    sharedVisualLanguage: "premium vertical drama",
    model: "gpt-4o-mini",
    creditsUsed: 8,
    raw: {},
    candidates: [
      {
        candidateId: "candidate-1",
        portraitPrompt: "portrait one",
        negativePrompt: "catalog model",
        visualIdentitySummary: "identity one",
        visualBibleSnapshot: { version: 1 },
      },
      {
        candidateId: "candidate-2",
        portraitPrompt: "portrait two",
        negativePrompt: "catalog model",
        visualIdentitySummary: "identity two",
        visualBibleSnapshot: { version: 1 },
      },
    ],
  });
  mockCreatePortraitCandidateDraftBatch.mockResolvedValue({
    batchId: "6cc9da31-8a44-4742-b9c9-0dc6558db621",
    candidates: [
      { assetLinkId: 71, candidateId: "candidate-1", index: 0 },
      { assetLinkId: 72, candidateId: "candidate-2", index: 1 },
    ],
  });
  mockLoadCharacterDesignContext.mockResolvedValue({
    seriesDna: {},
    currentCast: [],
    recentLeadArchive: [],
  });
  mockPersistCharacterVisualBible.mockResolvedValue(undefined);
});

/* -------------------------------------------------------------------------- */
/* createCharacter / updateCharacter — persistence                            */
/* -------------------------------------------------------------------------- */

describe("createCharacter — region/ethnicityText persistence", () => {
  it("persists region and ethnicityText into data", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([SERIES_ROW])); // loadOwnedSeries
    const valuesSpy = vi.fn();
    const chain = insertChain([characterRow({ data: { region: "western", ethnicityText: "Japanese-Thai mix" } })]);
    const originalValues = chain.values;
    chain.values = vi.fn((arg: unknown) => {
      valuesSpy(arg);
      return originalValues(arg);
    });
    mockDb.insert.mockReturnValueOnce(chain);

    await router.createCharacter({
      ctx: ctx(),
      input: {
        seriesId: "10",
        characterKey: "kirin",
        name: "คิริน",
        region: "western",
        ethnicityText: "Japanese-Thai mix",
      },
    });

    expect(valuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { region: "western", ethnicityText: "Japanese-Thai mix" },
      }),
    );
  });

  it("byte-identical: data stays null when neither region nor ethnicityText nor data is supplied", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([SERIES_ROW]));
    const valuesSpy = vi.fn();
    const chain = insertChain([characterRow()]);
    const originalValues = chain.values;
    chain.values = vi.fn((arg: unknown) => {
      valuesSpy(arg);
      return originalValues(arg);
    });
    mockDb.insert.mockReturnValueOnce(chain);

    await router.createCharacter({
      ctx: ctx(),
      input: { seriesId: "10", characterKey: "kirin", name: "คิริน" },
    });

    expect(valuesSpy).toHaveBeenCalledWith(expect.objectContaining({ data: null }));
  });

  it("merges region/ethnicityText onto a caller-supplied data blob without dropping other keys", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([SERIES_ROW]));
    const valuesSpy = vi.fn();
    const chain = insertChain([characterRow()]);
    const originalValues = chain.values;
    chain.values = vi.fn((arg: unknown) => {
      valuesSpy(arg);
      return originalValues(arg);
    });
    mockDb.insert.mockReturnValueOnce(chain);

    await router.createCharacter({
      ctx: ctx(),
      input: {
        seriesId: "10",
        characterKey: "kirin",
        name: "คิริน",
        data: { description: "A steady, dependable presence." },
        region: "thai",
      },
    });

    expect(valuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { description: "A steady, dependable presence.", region: "thai" },
      }),
    );
  });
});

describe("updateCharacter — region/ethnicityText persistence", () => {
  it("merges region into the EXISTING row's data when no data replacement is supplied", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW])) // loadOwnedSeries
      .mockReturnValueOnce(
        selectChain([characterRow({ data: { description: "Existing description", wardrobeRules: ["suit"] } })]),
      ); // loadOwnedCharacter
    const setSpy = vi.fn();
    const chain = updateChain([characterRow()]);
    const originalSet = chain.set;
    chain.set = vi.fn((arg: unknown) => {
      setSpy(arg);
      return originalSet(arg);
    });
    mockDb.update.mockReturnValueOnce(chain);

    await router.updateCharacter({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1", region: "east_asian" },
    });

    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          description: "Existing description",
          wardrobeRules: ["suit"],
          region: "east_asian",
        },
      }),
    );
  });

  it("clears a previously-set region when region is explicitly null", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([characterRow({ data: { region: "western", description: "x" } })]));
    const setSpy = vi.fn();
    const chain = updateChain([characterRow()]);
    const originalSet = chain.set;
    chain.set = vi.fn((arg: unknown) => {
      setSpy(arg);
      return originalSet(arg);
    });
    mockDb.update.mockReturnValueOnce(chain);

    await router.updateCharacter({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1", region: null },
    });

    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ data: { description: "x" } }));
  });

  it("byte-identical: omits data from the patch entirely when data/region/ethnicityText are all untouched", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([characterRow({ data: { description: "x" } })]));
    const setSpy = vi.fn();
    const chain = updateChain([characterRow()]);
    const originalSet = chain.set;
    chain.set = vi.fn((arg: unknown) => {
      setSpy(arg);
      return originalSet(arg);
    });
    mockDb.update.mockReturnValueOnce(chain);

    await router.updateCharacter({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1", name: "New Name" },
    });

    expect(setSpy).toHaveBeenCalledWith(expect.not.objectContaining({ data: expect.anything() }));
  });

  it("a caller-supplied data replacement + region merges region onto the NEW data, not the old row's", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([characterRow({ data: { description: "old description" } })]));
    const setSpy = vi.fn();
    const chain = updateChain([characterRow()]);
    const originalSet = chain.set;
    chain.set = vi.fn((arg: unknown) => {
      setSpy(arg);
      return originalSet(arg);
    });
    mockDb.update.mockReturnValueOnce(chain);

    await router.updateCharacter({
      ctx: ctx(),
      input: {
        seriesId: "10",
        characterId: "1",
        data: { description: "brand new description" },
        region: "latin",
      },
    });

    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ data: { description: "brand new description", region: "latin" } }),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* previewCharacterPrompt / generateCharacterImage / generateCharacterSheet — */
/* per-character region OVERRIDES the series default at all 3 read-sites      */
/* -------------------------------------------------------------------------- */

describe("previewCharacterPrompt — per-character region override", () => {
  it("threads an explicit dropdown region into generateCharacterVisualPrompts (single-prompt branch)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([characterRow({ data: { region: "western" } })]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]));

    await router.previewCharacterPrompt({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1" },
    });

    expect(mockGenerateCharacterVisualPrompts).toHaveBeenCalledWith(
      expect.objectContaining({
        targetAudienceRegion: "thai", // series default, unchanged
        resolvedCharacterRegion: expect.objectContaining({
          source: "character_region",
          isExplicit: true,
          region: "western",
        }),
      }),
    );
  });

  it("free-text ethnicityText wins over a dropdown region also set on the same character", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(
        selectChain([characterRow({ data: { region: "western", ethnicityText: "Japanese-Thai mix" } })]),
      )
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]));

    await router.previewCharacterPrompt({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1" },
    });

    expect(mockGenerateCharacterVisualPrompts).toHaveBeenCalledWith(
      expect.objectContaining({
        resolvedCharacterRegion: expect.objectContaining({
          source: "character_free_text",
          isExplicit: true,
        }),
      }),
    );
  });

  it("byte-identical: an unset character resolves isExplicit:false, matching the series default", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([characterRow()])) // data: null
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]));

    await router.previewCharacterPrompt({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1" },
    });

    expect(mockGenerateCharacterVisualPrompts).toHaveBeenCalledWith(
      expect.objectContaining({
        resolvedCharacterRegion: expect.objectContaining({ isExplicit: false, source: "series_default" }),
      }),
    );
  });

  it("threads the resolved region into generateCharacterPortraitCandidates (candidate-batch branch)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([characterRow({ data: { region: "south_asian" } })]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]));

    await router.previewCharacterPrompt({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1", portraitCandidateCount: 2 },
    });

    expect(mockGenerateCharacterPortraitCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        resolvedCharacterRegion: expect.objectContaining({ isExplicit: true, region: "south_asian" }),
      }),
    );
  });
});

describe("generateCharacterImage — per-character region override (fallback path)", () => {
  it("threads the resolved region into generateCharacterVisualPrompts", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([characterRow({ data: { region: "middle_eastern" } })]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));

    await router.generateCharacterImage({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1", selectedImageModelId: "google-nano-banana-pro" },
    });

    expect(mockGenerateCharacterVisualPrompts).toHaveBeenCalledWith(
      expect.objectContaining({
        resolvedCharacterRegion: expect.objectContaining({ isExplicit: true, region: "middle_eastern" }),
      }),
    );
  });
});

describe("generateCharacterSheet — per-character region override", () => {
  it("threads the resolved region into generateCharacterVisualPrompts", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([characterRow({ data: { region: "african" } })]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));

    await router.generateCharacterSheet({
      ctx: ctx(),
      input: {
        seriesId: "10",
        characterId: "1",
        sheetType: "auto",
        selectedImageModelId: "google-nano-banana-pro",
      },
    });

    expect(mockGenerateCharacterVisualPrompts).toHaveBeenCalledWith(
      expect.objectContaining({
        resolvedCharacterRegion: expect.objectContaining({ isExplicit: true, region: "african" }),
      }),
    );
  });
});
