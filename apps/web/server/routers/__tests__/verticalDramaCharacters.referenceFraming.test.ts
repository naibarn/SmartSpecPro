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

const {
  mockGetPrimaryPortraitUrl,
  mockGetReferenceImageByAssetLinkId,
  mockSetPrimaryPortraitAsset,
  mockSelectPortraitCandidate,
} = vi.hoisted(() => ({
  mockGetPrimaryPortraitUrl: vi.fn(),
  mockGetReferenceImageByAssetLinkId: vi.fn(),
  mockSetPrimaryPortraitAsset: vi.fn(),
  mockSelectPortraitCandidate: vi.fn(),
}));
/** Mirrors the real `VerticalDramaCharacterStockError`'s `reason` discriminator
 *  — the router branches on it to decide whether an asset needs the
 *  DNA-locking candidate path. */
const { MockStockError } = vi.hoisted(() => ({
  MockStockError: class extends Error {
    constructor(
      public readonly reason: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock("../../services/verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: {
    getPrimaryPortraitUrl: mockGetPrimaryPortraitUrl,
    getReferenceImageByAssetLinkId: mockGetReferenceImageByAssetLinkId,
    setPrimaryPortraitAsset: mockSetPrimaryPortraitAsset,
    selectPortraitCandidate: mockSelectPortraitCandidate,
    createPortraitCandidateDraftBatch: vi.fn(),
    getPortraitCandidateTaskInfo: vi.fn(),
    attachGeneratedPortraitCandidate: vi.fn(),
    getPortraitCandidateBatchCount: vi.fn(),
    claimPortraitCandidateBatch: vi.fn(),
    recordPortraitCandidateTask: vi.fn(),
    markPortraitCandidateSubmissionFailed: vi.fn(),
  },
  VerticalDramaCharacterStockError: MockStockError,
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

import {
  pickCharacterRenderModelId,
  verticalDramaCharactersRouter,
} from "../verticalDramaCharacters";

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
  mockGetReferenceImageByAssetLinkId.mockResolvedValue({ url: null, characterId: null });
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
    // The pinned link belongs to the look itself (character 2) — its own
    // established likeness, wardrobe included.
    mockGetReferenceImageByAssetLinkId.mockResolvedValue({
      url: "https://cdn.example.test/picked.jpg",
      characterId: 2,
    });

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

  /* `planning/vd-look-image-not-replace-primary/plan.md` §3 — the per-look
     re-render dialog lets a look pin its PARENT's primary portrait as the
     reference. That image is a borrowed likeness: it must anchor the face
     without claiming the parent's wardrobe is this look's own, or the skill's
     "keep outfit/clothing/accessories/shoes IDENTICAL to the reference" rule
     fires on the one flow whose whole purpose is a different outfit. */
  it("is false for an explicit reference that belongs to ANOTHER character row (a look pinning its parent's primary)", async () => {
    queueRenderSelects(LOOK_CHARACTER_ROW);
    mockGetReferenceImageByAssetLinkId.mockResolvedValue({
      url: PARENT_PORTRAIT_URL,
      characterId: 1, // the parent, not the look (character 2)
    });

    await router.generateCharacterImage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        characterId: "2",
        referenceAssetLinkId: "77",
        selectedImageModelId: "kie-gpt-image-2",
      },
    });

    expect(mockGenerateCharacterVisualPrompts).toHaveBeenCalledWith(
      expect.objectContaining({ hasOwnReferenceImage: false }),
    );
    // Still attached — the face anchor is the entire point of the choice.
    expect(mockGenerateImageAsync.mock.calls[0][0].referenceImageUrls).toEqual([
      PARENT_PORTRAIT_URL,
    ]);
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

/* -------------------------------------------------------------------------- */
/* Text-to-image vs image-to-image model split                                */
/* -------------------------------------------------------------------------- */

/**
 * `planning/vd-character-image-edit-model/plan.md`. A character render is two
 * different provider jobs — text-to-image with no reference, image-to-image
 * (`gpt-image-2-image-to-image` / `operation: "image.edit"`) with one — and the
 * strongest model for each is a different model. Only the server knows which
 * job a given call is, so the client sends both picks and
 * `pickCharacterRenderModelId` decides.
 */
describe("pickCharacterRenderModelId", () => {
  it("uses the edit model when a reference is attached", () => {
    expect(
      pickCharacterRenderModelId({
        hasReferenceImage: true,
        selectedImageModelId: "kie-gpt-image-2",
        selectedEditImageModelId: "seedream-5-pro",
      }),
    ).toBe("seedream-5-pro");
  });

  it("uses the text-to-image model when no reference is attached", () => {
    expect(
      pickCharacterRenderModelId({
        hasReferenceImage: false,
        selectedImageModelId: "kie-gpt-image-2",
        selectedEditImageModelId: "seedream-5-pro",
      }),
    ).toBe("kie-gpt-image-2");
  });

  it("falls back to the single model when no edit model was chosen (previous behavior)", () => {
    expect(
      pickCharacterRenderModelId({
        hasReferenceImage: true,
        selectedImageModelId: "kie-gpt-image-2",
      }),
    ).toBe("kie-gpt-image-2");
    expect(
      pickCharacterRenderModelId({
        hasReferenceImage: true,
        selectedImageModelId: "kie-gpt-image-2",
        selectedEditImageModelId: "   ",
      }),
    ).toBe("kie-gpt-image-2");
  });
});

describe("generateCharacterImage — image-to-image model split", () => {
  it("renders a look through the EDIT model, because a reference is attached", async () => {
    queueRenderSelects(LOOK_CHARACTER_ROW);
    mockGetPrimaryPortraitUrl
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(PARENT_PORTRAIT_URL);

    await router.generateCharacterImage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        characterId: "2",
        selectedImageModelId: "kie-gpt-image-2",
        selectedEditImageModelId: "seedream-5-pro",
      },
    });

    expect(mockGenerateImageAsync.mock.calls[0][0].model).toBe("seedream-5-pro");
  });

  it("renders a first portrait through the TEXT-TO-IMAGE model, because there is no reference", async () => {
    queueRenderSelects(BASE_CHARACTER_ROW);
    mockGetPrimaryPortraitUrl.mockResolvedValue(null);

    await router.generateCharacterImage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        characterId: "1",
        selectedImageModelId: "kie-gpt-image-2",
        selectedEditImageModelId: "seedream-5-pro",
      },
    });

    expect(mockGenerateImageAsync.mock.calls[0][0].model).toBe("kie-gpt-image-2");
  });

  it("keeps the single-model behavior when the caller sends no edit model", async () => {
    queueRenderSelects(BASE_CHARACTER_ROW);
    mockGetPrimaryPortraitUrl.mockResolvedValue(OWN_PORTRAIT_URL);

    await router.generateCharacterImage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        characterId: "1",
        selectedImageModelId: "kie-gpt-image-2",
      },
    });

    expect(mockGenerateImageAsync.mock.calls[0][0].model).toBe("kie-gpt-image-2");
  });
});

describe("generateCharacterSheet — image-to-image model split", () => {
  it("renders through the EDIT model when the identity-lock reference is attached", async () => {
    queueRenderSelects(BASE_CHARACTER_ROW);
    mockGetPrimaryPortraitUrl.mockResolvedValue(OWN_PORTRAIT_URL);

    await router.generateCharacterSheet({
      ctx: ctx(),
      input: {
        seriesId: "10",
        characterId: "1",
        sheetType: "pose_library",
        sheetLanguage: "en",
        selectedImageModelId: "kie-gpt-image-2",
        selectedEditImageModelId: "nano-banana-pro",
      },
    });

    expect(mockGenerateImageAsync.mock.calls[0][0].model).toBe("nano-banana-pro");
  });
});

/* -------------------------------------------------------------------------- */
/* setPrimaryPortrait — the explicit "this is the main image" control          */
/* -------------------------------------------------------------------------- */

/**
 * `planning/vd-character-primary-portrait-control/plan.md`. Every generated
 * portrait and every dropped reference is stored with role
 * `primary_portrait`, so a character accumulates several rows that all claim
 * the title and the winner was decided implicitly by recency — the panel could
 * show four tiles all labelled "primary portrait" with no way to pick one.
 * One mutation now serves both kinds of image: a first-portrait BATCH candidate
 * must go through `selectPortraitCandidate` (it also locks the Character DNA
 * snapshot), everything else through the plain promotion. The caller never has
 * to know which kind it is pointing at.
 */
describe("setPrimaryPortrait", () => {
  it("promotes an ordinary portrait through the direct path", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([BASE_CHARACTER_ROW]));
    mockSetPrimaryPortraitAsset.mockResolvedValue({ assetLinkId: "263" });

    const result = await router.setPrimaryPortrait({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1", assetLinkId: "263" },
    });

    expect(result).toMatchObject({ via: "direct" });
    expect(mockSetPrimaryPortraitAsset).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      characterId: 1,
      assetLinkId: 263,
    });
    expect(mockSelectPortraitCandidate).not.toHaveBeenCalled();
  });

  it("falls through to the DNA-locking path for a first-portrait batch candidate", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([BASE_CHARACTER_ROW]));
    mockSetPrimaryPortraitAsset.mockRejectedValue(
      new MockStockError("asset_wrong_role", "candidate must lock DNA"),
    );
    mockSelectPortraitCandidate.mockResolvedValue({ assetLinkId: "264" });

    const result = await router.setPrimaryPortrait({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1", assetLinkId: "264" },
    });

    expect(result).toMatchObject({ via: "candidate" });
    expect(mockSelectPortraitCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ characterId: 1, assetLinkId: 264 }),
    );
  });

  it("does not swallow an unrelated failure into the candidate path", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([BASE_CHARACTER_ROW]));
    mockSetPrimaryPortraitAsset.mockRejectedValue(
      new MockStockError("asset_not_found", "gone"),
    );

    await expect(
      router.setPrimaryPortrait({
        ctx: ctx(),
        input: { seriesId: "10", characterId: "1", assetLinkId: "999" },
      }),
    ).rejects.toBeTruthy();
    expect(mockSelectPortraitCandidate).not.toHaveBeenCalled();
  });
});
