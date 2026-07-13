/**
 * Vertical Drama CHARACTER tab — `customInstruction` flow-through
 * (vertical-drama-character-custom-instruction plan): a free-text framing/
 * pose/crop/mood hint typed by the user (e.g. "half-body shot,
 * front-facing") threads from the tRPC mutation input straight into the
 * `generateCharacterVisualPrompts` service call as a raw fact — no
 * TypeScript prompt-construction logic anywhere in this path (skill-first;
 * see `skills/vertical-drama-character-visual-bible/skill.md`'s "Custom
 * instruction" section, which is the sole author of how the fact is used).
 *
 * Covers both mutations that accept `customInstruction`:
 *  - `previewCharacterPrompt` — the PRIMARY path this field works through,
 *    since the UI always calls preview before confirm.
 *  - `generateCharacterImage` — only consumed on the no-`approvedPrompt`
 *    fallback branch (the normal UI flow always supplies `approvedPrompt`
 *    from the already-edited preview).
 *
 * Same "mock the whole module graph, invoke the exported procedure handler
 * directly" convention as `verticalDramaCharacters.manualVariantTwinCrud.test.ts`
 * / `verticalDramaCharacters.voiceChain.test.ts`.
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

const { mockGetPrimaryPortraitUrl } = vi.hoisted(() => ({
  mockGetPrimaryPortraitUrl: vi.fn(),
}));
vi.mock("../../services/verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: {
    getPrimaryPortraitUrl: mockGetPrimaryPortraitUrl,
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

const { mockGenerateCharacterVisualPrompts, mockResolveFaceSourceReferenceForCharacter } = vi.hoisted(() => ({
  mockGenerateCharacterVisualPrompts: vi.fn(),
  mockResolveFaceSourceReferenceForCharacter: vi.fn(async () => null),
}));
vi.mock("../../services/verticalDramaCharacterImageGeneration", () => ({
  generateCharacterVisualPrompts: mockGenerateCharacterVisualPrompts,
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
}));

vi.mock("../../services/mediaTransportResolver", () => ({
  resolveMediaTransport: vi.fn(),
}));

import { verticalDramaCharactersRouter } from "../verticalDramaCharacters";

const router = verticalDramaCharactersRouter as unknown as Record<string, Function>;

function ctx(overrides: Partial<{ tenantId: string | null; user: { id: number } }> = {}) {
  return { tenantId: "tenant-1", user: { id: 42 }, userToken: "session-token", publicUrl: undefined, ...overrides };
}

/** Thenable select-chain stub — resolves at ANY point in the chain (`.where()`,
 *  `.limit()`, or awaited directly), same convention as
 *  `verticalDramaCharacters.manualVariantTwinCrud.test.ts`. */
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
const SERIES_CONTEXT_ROW = {
  id: 10,
  title: "Sisters of the Silk Market",
  genre: "family drama",
  tone: "warm",
  bible: null,
  updatedAt: new Date("2026-07-13T00:00:00.000Z"),
};
const CHARACTER_ROW = {
  id: 1,
  tenantId: "tenant-1",
  userId: 42,
  seriesId: 10,
  characterKey: "fai",
  name: "ฝ้าย",
  role: "lead",
  data: null,
  voiceConfig: null,
  parentCharacterId: null,
  variantLabel: null,
  variantType: null,
  sharesFaceWithCharacterId: null,
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-01T00:00:00.000Z"),
};

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
  mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesPresetMixV2: false });
  mockResolveFaceSourceReferenceForCharacter.mockResolvedValue(null);
  mockGetPrimaryPortraitUrl.mockResolvedValue(null);
  mockHasEnoughCredits.mockResolvedValue(true);
  mockDeductCredits.mockResolvedValue(undefined);
  mockGenerateImageAsync.mockResolvedValue({ id: "task-1" });
  mockGenerateCharacterVisualPrompts.mockResolvedValue(visualPromptResult());
  mockLoadCharacterDesignContext.mockResolvedValue({
    seriesDna: {},
    currentCast: [],
    recentLeadArchive: [],
  });
  mockPersistCharacterVisualBible.mockResolvedValue(undefined);
});

/* -------------------------------------------------------------------------- */
/* previewCharacterPrompt — the PRIMARY path this field works through          */
/* -------------------------------------------------------------------------- */

describe("previewCharacterPrompt — customInstruction flow-through", () => {
  it("threads customInstruction into generateCharacterVisualPrompts when supplied", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW])) // loadOwnedSeries
      .mockReturnValueOnce(selectChain([CHARACTER_ROW])) // loadOwnedCharacter
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW])); // series title/genre/tone/bible

    const result = await router.previewCharacterPrompt({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1", customInstruction: "half-body shot, front-facing" },
    });

    expect(mockGenerateCharacterVisualPrompts).toHaveBeenCalledWith(
      expect.objectContaining({
        customInstruction: "half-body shot, front-facing",
        characterDesignContext: expect.any(Object),
      }),
    );
    expect(mockLoadCharacterDesignContext).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42 },
      SERIES_CONTEXT_ROW,
      CHARACTER_ROW,
    );
    expect(result.approvedDesignSnapshot).toMatchObject({
      characterKey: "fai",
      portraitPrompt: "a portrait prompt",
    });
    expect(mockPersistCharacterVisualBible).not.toHaveBeenCalled();
  });

  it("passes customInstruction as undefined when not supplied (legacy tolerant, no crash)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]));

    await router.previewCharacterPrompt({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1" },
    });

    expect(mockGenerateCharacterVisualPrompts).toHaveBeenCalledWith(
      expect.objectContaining({ customInstruction: undefined }),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* generateCharacterImage — fallback path only (no approvedPrompt)            */
/* -------------------------------------------------------------------------- */

describe("generateCharacterImage — customInstruction flow-through (no-approvedPrompt fallback path)", () => {
  it("threads customInstruction into generateCharacterVisualPrompts when supplied and approvedPrompt is absent", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW])) // loadOwnedSeries
      .mockReturnValueOnce(selectChain([CHARACTER_ROW])) // loadOwnedCharacter
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW])) // series title/genre/tone/bible
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }])); // mediaModels pricing row

    await router.generateCharacterImage({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1", customInstruction: "full-body, wider shot" },
    });

    expect(mockGenerateCharacterVisualPrompts).toHaveBeenCalledWith(
      expect.objectContaining({ customInstruction: "full-body, wider shot" }),
    );
  });

  it("passes customInstruction as undefined when not supplied (legacy tolerant, no crash)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));

    await router.generateCharacterImage({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1" },
    });

    expect(mockGenerateCharacterVisualPrompts).toHaveBeenCalledWith(
      expect.objectContaining({ customInstruction: undefined }),
    );
  });

  it("does NOT call generateCharacterVisualPrompts at all when approvedPrompt is supplied (customInstruction is a no-op on this branch)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));

    await router.generateCharacterImage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        characterId: "1",
        approvedPrompt: "already-approved prompt text",
        customInstruction: "this hint is ignored on this branch",
      },
    });

    expect(mockGenerateCharacterVisualPrompts).not.toHaveBeenCalled();
    expect(mockPersistCharacterVisualBible).not.toHaveBeenCalled();
  });

  it("persists generated DNA only after the media task is submitted", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));

    const result = await router.generateCharacterImage({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1" },
    });

    expect(mockPersistCharacterVisualBible).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      1,
      expect.objectContaining({ visualIdentitySummary: "story-grounded lead" }),
    );
    expect(mockGenerateImageAsync.mock.invocationCallOrder[0]).toBeLessThan(
      mockPersistCharacterVisualBible.mock.invocationCallOrder[0],
    );
    expect(result.dnaPersistenceStatus).toBe("persisted");
  });

  it("persists an unedited matching preview snapshot without rerunning the LLM", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));
    const visualBible = { visualIdentitySummary: "previewed design" };

    const result = await router.generateCharacterImage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        characterId: "1",
        approvedPrompt: "approved portrait",
        approvedDesignSnapshot: {
          characterKey: "fai",
          portraitPrompt: "approved portrait",
          visualBible,
        },
      },
    });

    expect(mockGenerateCharacterVisualPrompts).not.toHaveBeenCalled();
    expect(mockPersistCharacterVisualBible).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      1,
      visualBible,
    );
    expect(result.dnaPersistenceStatus).toBe("persisted");
  });

  it("renders an edited approved prompt but does not persist the preview DNA", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));

    const result = await router.generateCharacterImage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        characterId: "1",
        approvedPrompt: "edited portrait",
        approvedDesignSnapshot: {
          characterKey: "fai",
          portraitPrompt: "original portrait",
          visualBible: { visualIdentitySummary: "previewed design" },
        },
      },
    });

    expect(mockGenerateImageAsync).toHaveBeenCalledTimes(1);
    expect(mockPersistCharacterVisualBible).not.toHaveBeenCalled();
    expect(result.dnaPersistenceWarning).toMatch(/edited after preview/i);
  });

  it("rejects a snapshot correlated to another character before media submission", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW]));

    await expect(
      router.generateCharacterImage({
        ctx: ctx(),
        input: {
          seriesId: "10",
          characterId: "1",
          approvedPrompt: "approved portrait",
          approvedDesignSnapshot: {
            characterKey: "another-character",
            portraitPrompt: "approved portrait",
            visualBible: { visualIdentitySummary: "wrong character" },
          },
        },
      }),
    ).rejects.toThrow(/another character/i);

    expect(mockGenerateImageAsync).not.toHaveBeenCalled();
    expect(mockPersistCharacterVisualBible).not.toHaveBeenCalled();
  });

  it("returns a non-fatal warning when persistence fails after task submission", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));
    mockPersistCharacterVisualBible.mockRejectedValueOnce(new Error("database unavailable"));

    const result = await router.generateCharacterImage({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1" },
    });

    expect(result.taskId).toBe("task-1");
    expect(result.dnaPersistenceStatus).toBe("failed");
    expect(result.dnaPersistenceWarning).toMatch(/not resubmitted/i);
    expect(mockGenerateImageAsync).toHaveBeenCalledTimes(1);
  });

  it("does not persist when media submission fails", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));
    mockGenerateImageAsync.mockRejectedValueOnce(new Error("submit failed"));

    await expect(
      router.generateCharacterImage({
        ctx: ctx(),
        input: { seriesId: "10", characterId: "1" },
      }),
    ).rejects.toThrow(/submit failed/i);

    expect(mockPersistCharacterVisualBible).not.toHaveBeenCalled();
  });
});

describe("generateCharacterSheet — Character DNA persistence", () => {
  it("loads design context and persists the just-generated DNA after sheet submission", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));

    const result = await router.generateCharacterSheet({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1", sheetType: "auto" },
    });

    expect(mockGenerateCharacterVisualPrompts).toHaveBeenCalledWith(
      expect.objectContaining({ characterDesignContext: expect.any(Object) }),
    );
    expect(mockPersistCharacterVisualBible).toHaveBeenCalledTimes(1);
    expect(mockGenerateImageAsync.mock.invocationCallOrder[0]).toBeLessThan(
      mockPersistCharacterVisualBible.mock.invocationCallOrder[0],
    );
    expect(result.dnaPersistenceStatus).toBe("persisted");
  });
});
