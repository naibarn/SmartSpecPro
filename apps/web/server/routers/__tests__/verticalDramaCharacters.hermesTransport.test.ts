/**
 * Feature 135 — Hermes Grok media worker (section 09): mutation-level
 * coverage for `generateCharacterImage`/`generateCharacterSheet`'s Hermes
 * arm — specifically the code-review FIX 1 regression guard: a Hermes
 * generation must never be gated on the caller's SmartSpec credit balance
 * (`hasEnoughCredits`/`deductCredits` must never be called for the hermes
 * path), while an ordinary gateway_api model is unaffected (still gated
 * normally).
 *
 * Same "mock the whole module graph, invoke the exported procedure handler
 * directly" convention as `verticalDramaCharacters.customInstruction.test.ts`
 * — this is a SEPARATE file (not an extension of that one) because that
 * file's fixtures omit `selectedImageModelId` entirely, which is
 * incompatible with `resolveCharacterImageModelId`'s pre-existing (not
 * section-09) fail-closed requirement; every input here supplies an
 * explicit `selectedImageModelId`.
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

vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: vi.fn().mockResolvedValue({ verticalDramaSeriesPresetMixV2: false }),
}));

vi.mock("../../services/verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: {
    getPrimaryPortraitUrl: vi.fn().mockResolvedValue(null),
    getReferenceImageUrlByAssetLinkId: vi.fn(),
  },
  VerticalDramaCharacterStockError: class extends Error {
    constructor(public readonly reason: string, message: string) {
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
  calculateCreditCost: vi.fn(() => 10),
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

const { mockGenerateCharacterVisualPrompts } = vi.hoisted(() => ({
  mockGenerateCharacterVisualPrompts: vi.fn(),
}));
vi.mock("../../services/verticalDramaCharacterImageGeneration", () => ({
  generateCharacterVisualPrompts: mockGenerateCharacterVisualPrompts,
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
  readPresetVisualIdentityFromBible: vi.fn(() => undefined),
  resolveFaceSourceReferenceForCharacter: vi.fn(async () => null),
}));

vi.mock("../../services/verticalDramaCharacterDesignContext", () => ({
  loadCharacterDesignContext: vi.fn(async () => ({ seriesDna: {}, currentCast: [], recentLeadArchive: [] })),
}));

const { mockPersistCharacterVisualBible } = vi.hoisted(() => ({
  mockPersistCharacterVisualBible: vi.fn(async () => undefined),
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

const { mockGetModelsByTypeAsync } = vi.hoisted(() => ({
  mockGetModelsByTypeAsync: vi.fn(),
}));
vi.mock("../../services/modelRegistry", () => ({
  getModelsByTypeAsync: mockGetModelsByTypeAsync,
  isDbModelCatalogLoaded: () => true,
}));

vi.mock("../../services/mediaTransportResolver", () => ({
  resolveMediaTransport: vi.fn(),
}));

const { mockQueueHermesMediaJob } = vi.hoisted(() => ({
  mockQueueHermesMediaJob: vi.fn(),
}));
vi.mock("../../services/hermesMediaScheduler", () => ({
  queueHermesMediaJob: mockQueueHermesMediaJob,
}));

vi.mock("../../services/hermesMediaReferences", () => ({
  buildHermesMediaReferences: vi.fn(async () => []),
  buildHermesMediaTaskEnvelope: (params: {
    taskId: string;
    userId: number;
    mediaType: string;
    model: string;
    prompt: string;
  }) => ({
    id: params.taskId,
    userId: String(params.userId),
    mediaType: params.mediaType,
    status: "pending",
    model: params.model,
    prompt: params.prompt,
    creditsUsed: 0,
    createdAt: new Date().toISOString(),
  }),
  resolveHermesReferenceAssetIdFromUrl: vi.fn(async () => null),
  resolveHermesOrderedRefsFromUrls: vi.fn(async (params: { urls: string[] }) => ({
    orderedRefs: [],
    droppedReferenceCount: params.urls.length,
  })),
}));
vi.mock("../../services/hermesConnectionService", () => ({
  getHermesConnection: vi.fn(async () => ({ capabilities: null })),
  listHermesConnections: vi.fn(async () => []),
}));

import { verticalDramaCharactersRouter } from "../verticalDramaCharacters";

const router = verticalDramaCharactersRouter as unknown as Record<string, Function>;

function ctx(overrides: Partial<{ tenantId: string | null; user: { id: number } }> = {}) {
  return { tenantId: "tenant-1", user: { id: 42 }, userToken: "session-token", publicUrl: undefined, ...overrides };
}

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
  mockHasEnoughCredits.mockResolvedValue(true);
  mockDeductCredits.mockResolvedValue(undefined);
  mockGenerateImageAsync.mockResolvedValue({ id: "task-gateway-1" });
  mockGenerateCharacterVisualPrompts.mockResolvedValue(visualPromptResult());
  mockPersistCharacterVisualBible.mockResolvedValue(undefined);
  mockQueueHermesMediaJob.mockResolvedValue({ created: true, taskId: "hermes_job-1", job: {} });
  mockGetModelsByTypeAsync.mockResolvedValue([
    { id: "google-nano-banana-pro", type: "image", isEnabled: true },
    { id: "hermes-grok/grok-imagine-image", type: "image", isEnabled: true },
  ]);
});

describe("generateCharacterImage — Hermes transport (code-review FIX 1)", () => {
  it("hermes model + zero SmartSpec credit balance: job is queued, hasEnoughCredits/deductCredits are never called", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW])) // loadOwnedSeries
      .mockReturnValueOnce(selectChain([CHARACTER_ROW])) // loadOwnedCharacter
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW])) // series title/genre/tone/bible
      .mockReturnValueOnce(
        selectChain([
          {
            creditCost: 10,
            configJson: { transport: "hermes_worker", hermes: { providerModelId: "grok-imagine-image" } },
          },
        ]),
      ); // mediaModels pricing row (hermes-transport, priced as if non-zero to prove the gate is bypassed structurally, not by accident)
    // The caller's SmartSpec balance is insufficient — if the credit gate
    // ran for this hermes call, this would produce FORBIDDEN.
    mockHasEnoughCredits.mockResolvedValue(false);

    const result = await router.generateCharacterImage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        characterId: "1",
        selectedImageModelId: "hermes-grok/grok-imagine-image",
        hermesConnectionId: "hermes-conn-1",
      },
    });

    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(mockGenerateImageAsync).not.toHaveBeenCalled();
    expect(mockQueueHermesMediaJob).toHaveBeenCalledTimes(1);
    expect(mockQueueHermesMediaJob).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: "hermes-conn-1", tenantId: "tenant-1", requestedByUserId: 42 }),
    );
    expect(result.taskId).toBe("hermes_job-1");
  });

  it("regression — gateway model + zero SmartSpec credit balance: still FORBIDDEN, queueHermesMediaJob never called", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: null }]));
    mockHasEnoughCredits.mockResolvedValue(false);

    await expect(
      router.generateCharacterImage({
        ctx: ctx(),
        input: { seriesId: "10", characterId: "1", selectedImageModelId: "google-nano-banana-pro" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mockHasEnoughCredits).toHaveBeenCalledWith(42, 10);
    expect(mockQueueHermesMediaJob).not.toHaveBeenCalled();
    expect(mockGenerateImageAsync).not.toHaveBeenCalled();
  });
});

describe("generateCharacterSheet — Hermes transport (code-review FIX 1)", () => {
  it("hermes model + zero SmartSpec credit balance: job is queued, hasEnoughCredits/deductCredits are never called", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]))
      .mockReturnValueOnce(
        selectChain([
          {
            creditCost: 10,
            configJson: { transport: "hermes_worker", hermes: { providerModelId: "grok-imagine-image" } },
          },
        ]),
      );
    mockHasEnoughCredits.mockResolvedValue(false);

    const result = await router.generateCharacterSheet({
      ctx: ctx(),
      input: {
        seriesId: "10",
        characterId: "1",
        sheetType: "auto",
        selectedImageModelId: "hermes-grok/grok-imagine-image",
        hermesConnectionId: "hermes-conn-1",
      },
    });

    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(mockGenerateImageAsync).not.toHaveBeenCalled();
    expect(mockQueueHermesMediaJob).toHaveBeenCalledTimes(1);
    expect(result.taskId).toBe("hermes_job-1");
  });

  it("regression — gateway model + zero SmartSpec credit balance: still FORBIDDEN, queueHermesMediaJob never called", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW]))
      .mockReturnValueOnce(selectChain([SERIES_CONTEXT_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: null }]));
    mockHasEnoughCredits.mockResolvedValue(false);

    await expect(
      router.generateCharacterSheet({
        ctx: ctx(),
        input: {
          seriesId: "10",
          characterId: "1",
          sheetType: "auto",
          selectedImageModelId: "google-nano-banana-pro",
        },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mockHasEnoughCredits).toHaveBeenCalledWith(42, 10);
    expect(mockQueueHermesMediaJob).not.toHaveBeenCalled();
    expect(mockGenerateImageAsync).not.toHaveBeenCalled();
  });
});
