/**
 * Vertical Drama CHARACTER tab — reference-source vs `has_own_reference_image`,
 * and the sheet endpoint's `customInstruction` flow-through
 * (`planning/vd-character-full-body-framing/plan.md` RC2 + RC5).
 *
 * The production bug this file pins: a brand-new LOOK (variant) has no portrait
 * of its own, so `resolveReferencePortraitUrl` borrows the PARENT's portrait.
 * The router used to derive `hasOwnReferenceImage: Boolean(url)` from that,
 * telling the Visual Bible Skill that a borrowed image was the look's own
 * definitive likeness — which switches on skill.md's strictest rule ("keep
 * outfit, clothing, accessories, and shoes IDENTICAL to the reference") for the
 * one flow whose entire purpose is a DIFFERENT outfit, and pins the new look to
 * the parent portrait's half-body crop. `faceSourceReference` is the correct
 * channel for a borrowed likeness: it locks the face and deliberately leaves
 * hair/wardrobe free to diverge.
 *
 * Same "mock the whole module graph, invoke the exported procedure handler
 * directly" convention as `verticalDramaCharacters.customInstruction.test.ts`.
 * Deliberately a SEPARATE file from that one: it carries a known-red baseline
 * (13 stale assertions against `loadCharacterDesignContext`'s argument order),
 * and a red file's leaked `mockReturnValueOnce` queues make downstream failures
 * misleading (see memory `project_vitest_once_queue_leak`).
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

const { mockGetPrimaryPortraitUrl, mockGetReferenceImageUrlByAssetLinkId } = vi.hoisted(() => ({
  mockGetPrimaryPortraitUrl: vi.fn(),
  mockGetReferenceImageUrlByAssetLinkId: vi.fn(),
}));
vi.mock("../../services/verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: {
    getPrimaryPortraitUrl: mockGetPrimaryPortraitUrl,
    getReferenceImageUrlByAssetLinkId: mockGetReferenceImageUrlByAssetLinkId,
    createPortraitCandidateDraftBatch: vi.fn(),
    getPortraitCandidateTaskInfo: vi.fn(),
    attachGeneratedPortraitCandidate: vi.fn(),
    getPortraitCandidateBatchCount: vi.fn(),
    claimPortraitCandidateBatch: vi.fn(),
    recordPortraitCandidateTask: vi.fn(),
    markPortraitCandidateSubmissionFailed: vi.fn(),
  },
  VerticalDramaCharacterStockError: class extends Error {
    constructor(
      public readonly reason: string,
      message: string,
    ) {
      super(message);
    }
  },
  VD_PORTRAIT_CANDIDATE_POLICY_REJECTED_MESSAGE: "policy rejected",
}));

const { mockGenerateImageAsync } = vi.hoisted(() => ({
  mockGenerateImageAsync: vi.fn(),
}));
vi.mock("../../services/mediaGenerationService", () => ({
  mediaGenerationService: {
    generateImageAsync: mockGenerateImageAsync,
    getTask: vi.fn(),
  },
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

const { mockGenerateCharacterVisualPrompts, mockResolveFaceSourceReferenceForCharacter } =
  vi.hoisted(() => ({
    mockGenerateCharacterVisualPrompts: vi.fn(),
    mockResolveFaceSourceReferenceForCharacter: vi.fn(),
  }));
vi.mock("../../services/verticalDramaCharacterImageGeneration", () => ({
  generateCharacterVisualPrompts: mockGenerateCharacterVisualPrompts,
  generateCharacterPortraitCandidates: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
  readPresetVisualIdentityFromBible: vi.fn(() => undefined),
  resolveFaceSourceReferenceForCharacter: mockResolveFaceSourceReferenceForCharacter,
}));

const { mockLoadCharacterDesignContext, mockPersistCharacterVisualBible } = vi.hoisted(() => ({
  mockLoadCharacterDesignContext: vi.fn(),
  mockPersistCharacterVisualBible: vi.fn(),
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
  // `resolveCharacterImageModelId` short-circuits to the caller's selection
  // when the DB model catalog has not been loaded — exactly the state a unit
  // test is in, so the caller's `selectedImageModelId` is honored verbatim.
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

function ctx() {
  return {
    tenantId: "tenant-1",
    user: { id: 42 },
    userToken: "session-token",
    publicUrl: undefined,
  };
}

/** Thenable select-chain stub — resolves at ANY point in the chain, same
 *  convention as the sibling character-router suites. */
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
const BASE_CHARACTER_ROW = {
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
/** A LOOK: same person, different outfit, no portrait of its own yet. */
const LOOK_CHARACTER_ROW = {
  ...BASE_CHARACTER_ROW,
  id: 2,
  characterKey: "fai_work",
  variantLabel: "ชุดทำงาน",
  variantType: "outfit",
  parentCharacterId: 1,
};

const PARENT_PORTRAIT_URL = "https://cdn.example.test/parent-portrait.jpg";
const OWN_PORTRAIT_URL = "https://cdn.example.test/own-portrait.jpg";

function visualPromptResult(overrides: Record<string, unknown> = {}) {
  return {
    portraitPrompt: "a portrait prompt",
    negativePrompt: "a negative prompt",
    turnaroundPrompt: "a turnaround prompt",
    fullBodyPrompt: "a full body prompt",
    expressionSheetPrompt: "an expression sheet prompt",
    outfitSheetPrompt: "an outfit sheet prompt",
    sheetPrompt: "a sheet prompt",
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

/** Queues the four `db.select()` chains every render handler consumes, in
 *  order: owned series, owned character, series context, model pricing row. */
function queueRenderSelects(characterRow: Record<string, unknown>) {
  mockDb.select
    .mockReturnValueOnce(selectChain([SERIES_ROW]))
    .mockReturnValueOnce(selectChain([characterRow]))
    .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]))
    .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesPresetMixV2: false });
  mockResolveFaceSourceReferenceForCharacter.mockResolvedValue(null);
  mockGetPrimaryPortraitUrl.mockResolvedValue(null);
  mockGetReferenceImageUrlByAssetLinkId.mockResolvedValue(null);
  mockHasEnoughCredits.mockResolvedValue(true);
  mockDeductCredits.mockResolvedValue(undefined);
  mockRefundCredits.mockResolvedValue(undefined);
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
/* generateCharacterImage — has_own_reference_image is TIER-aware              */
/* -------------------------------------------------------------------------- */

describe("generateCharacterImage — has_own_reference_image reflects the reference TIER", () => {
  it("is false for a brand-new look whose only reference is the parent's borrowed portrait", async () => {
    queueRenderSelects(LOOK_CHARACTER_ROW);
    // Tier 2 (the look's own portrait) misses; tier 3 (parent id 1) hits.
    mockGetPrimaryPortraitUrl
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(PARENT_PORTRAIT_URL);

    await router.generateCharacterImage({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "2", selectedImageModelId: "kie-gpt-image-2" },
    });

    expect(mockGenerateCharacterVisualPrompts).toHaveBeenCalledWith(
      expect.objectContaining({ hasOwnReferenceImage: false }),
    );
    // The borrowed portrait is still ATTACHED — it is the face anchor. Only
    // the "this is your own established look, wardrobe included" claim is
    // withdrawn.
    expect(mockGenerateImageAsync.mock.calls[0][0].referenceImageUrls).toEqual([
      PARENT_PORTRAIT_URL,
    ]);
  });

  it("stays true when the character is regenerating its OWN approved portrait", async () => {
    queueRenderSelects(BASE_CHARACTER_ROW);
    mockGetPrimaryPortraitUrl.mockResolvedValue(OWN_PORTRAIT_URL);

    await router.generateCharacterImage({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1", selectedImageModelId: "kie-gpt-image-2" },
    });

    expect(mockGenerateCharacterVisualPrompts).toHaveBeenCalledWith(
      expect.objectContaining({ hasOwnReferenceImage: true }),
    );
  });

  it("stays true for an explicit reference the user picked for THIS character", async () => {
    queueRenderSelects(LOOK_CHARACTER_ROW);
    mockGetReferenceImageUrlByAssetLinkId.mockResolvedValue(
      "https://cdn.example.test/picked.jpg",
    );

    await router.generateCharacterImage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        characterId: "2",
        referenceAssetLinkId: "77",
        selectedImageModelId: "kie-gpt-image-2",
      },
    });

    expect(mockGetPrimaryPortraitUrl).not.toHaveBeenCalled();
    expect(mockGenerateCharacterVisualPrompts).toHaveBeenCalledWith(
      expect.objectContaining({ hasOwnReferenceImage: true }),
    );
  });

  it("is false when there is no reference at all (a character's very first portrait)", async () => {
    queueRenderSelects(BASE_CHARACTER_ROW);
    mockGetPrimaryPortraitUrl.mockResolvedValue(null);

    await router.generateCharacterImage({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1", selectedImageModelId: "kie-gpt-image-2" },
    });

    expect(mockGenerateCharacterVisualPrompts).toHaveBeenCalledWith(
      expect.objectContaining({ hasOwnReferenceImage: false }),
    );
    expect(mockGenerateImageAsync.mock.calls[0][0].referenceImageUrls).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* generateCharacterSheet — same tier rule + customInstruction flow-through    */
/* -------------------------------------------------------------------------- */

describe("generateCharacterSheet — reference tier + customInstruction", () => {
  it("threads customInstruction into the planner and keeps the borrowed reference un-owned", async () => {
    queueRenderSelects(LOOK_CHARACTER_ROW);
    mockGetPrimaryPortraitUrl
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(PARENT_PORTRAIT_URL);

    const customInstruction = "ภาพเต็มตัว ชุดสูทสีดำ";
    await router.generateCharacterSheet({
      ctx: ctx(),
      input: {
        seriesId: "10",
        characterId: "2",
        sheetType: "pose_library",
        sheetLanguage: "en",
        customInstruction,
        selectedImageModelId: "kie-gpt-image-2",
      },
    });

    expect(mockGenerateCharacterVisualPrompts).toHaveBeenCalledWith(
      expect.objectContaining({
        customInstruction,
        hasOwnReferenceImage: false,
        requestedSheetType: "pose_library",
      }),
    );
  });

  it("passes customInstruction as undefined when the user typed nothing (legacy behavior)", async () => {
    queueRenderSelects(BASE_CHARACTER_ROW);

    await router.generateCharacterSheet({
      ctx: ctx(),
      input: {
        seriesId: "10",
        characterId: "1",
        sheetType: "turnaround",
        sheetLanguage: "en",
        selectedImageModelId: "kie-gpt-image-2",
      },
    });

    expect(mockGenerateCharacterVisualPrompts).toHaveBeenCalledWith(
      expect.objectContaining({ customInstruction: undefined }),
    );
  });
});
