/**
 * Vertical Drama CHARACTER tab — W12-A "voice chain" wave coverage:
 *  - `setCharacterVoiceConfig` — set/clear a character's locked voice casting.
 *  - `listVoiceCatalog` — flattened voice catalog, reusing the trailer's
 *    voice-picker machinery via a mocked `mediaRouter` caller.
 *  - `previewCharacterVoice` — paid, credit-gated voice preview submission.
 *  - `listCharacters`/`updateCharacter` — flags-off byte-identical `voiceConfig`
 *    payload inclusion.
 *
 * Same "mock the whole module graph, test the exported procedure handler
 * directly" convention as `verticalDramaCharacters.modelSelection.test.ts`
 * and `verticalDramaSeries.setSeriesTargetAudienceRegion.test.ts`.
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

vi.mock("../../services/verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: {
    getPrimaryPortraitUrl: vi.fn(),
    getManifest: vi.fn(async () => ({ approved: 0, pending: 0, stale: 0, assets: [] })),
  },
  VerticalDramaCharacterStockError: class extends Error {},
}));

const { mockGenerateAudioAsync, mockGenerateImageAsync } = vi.hoisted(() => ({
  mockGenerateAudioAsync: vi.fn(),
  mockGenerateImageAsync: vi.fn(),
}));
vi.mock("../../services/mediaGenerationService", () => ({
  mediaGenerationService: {
    generateImageAsync: mockGenerateImageAsync,
    generateAudioAsync: mockGenerateAudioAsync,
  },
  DEFAULT_MODELS: { image: "google-nano-banana-pro", audio: "uvoice/tts-premium" },
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

const { mockListModelFieldOptions } = vi.hoisted(() => ({
  mockListModelFieldOptions: vi.fn(),
}));
vi.mock("../media", () => ({
  mediaRouter: {
    createCaller: () => ({ listModelFieldOptions: mockListModelFieldOptions }),
  },
}));

vi.mock("../../_core/logger", () => ({
  debugError: vi.fn(),
  debugLog: vi.fn(),
}));

import { verticalDramaCharactersRouter } from "../verticalDramaCharacters";

const router = verticalDramaCharactersRouter as unknown as Record<string, Function>;

function ctx(overrides: Partial<{ tenantId: string | null; user: { id: number } }> = {}) {
  return { tenantId: "tenant-1", user: { id: 42 }, userToken: null, publicUrl: undefined, ...overrides };
}

/** Thenable select-chain stub — resolves at ANY point in the chain (`.where()`,
 *  `.limit()`, or awaited directly), same convention as
 *  `verticalDramaSeries.setSeriesTargetAudienceRegion.test.ts`. */
function selectChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

function updateChain(rows: unknown[]) {
  const chain: any = {
    set: vi.fn(() => chain),
    where: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(rows)),
  };
  return chain;
}

const SERIES_ROW = { id: 10 };

const CHARACTER_ROW_UNCAST = {
  id: 1,
  tenantId: "tenant-1",
  userId: 42,
  seriesId: 10,
  characterKey: "aria",
  name: "Aria",
  role: "protagonist",
  data: null,
  voiceConfig: null,
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-01T00:00:00.000Z"),
};

const CHARACTER_ROW_CAST = {
  ...CHARACTER_ROW_UNCAST,
  voiceConfig: {
    voiceProvider: "uvoice",
    voiceModelId: "uvoice/tts-premium",
    voiceId: "th-porche",
    voiceLabel: "th - ปอร์เช่ (Adult)",
    lockedAt: "2026-07-01T00:00:00.000Z",
    lockedByUserId: 42,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesVoiceChain: true });
  mockDb.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
  mockHasEnoughCredits.mockResolvedValue(true);
  mockDeductCredits.mockResolvedValue({ id: 1 });
  mockRefundCredits.mockResolvedValue({ id: 2 });
  mockCalculateCreditCost.mockReturnValue(5);
});

/* -------------------------------------------------------------------------- */
/* setCharacterVoiceConfig                                                    */
/* -------------------------------------------------------------------------- */

describe("setCharacterVoiceConfig", () => {
  it("locks a casting and server-stamps lockedAt/lockedByUserId (never trusts client input for those)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW])) // loadOwnedSeries
      .mockReturnValueOnce(selectChain([CHARACTER_ROW_UNCAST])); // loadOwnedCharacter

    const setSpy = vi.fn();
    const chain = updateChain([CHARACTER_ROW_CAST]);
    const originalSet = chain.set;
    chain.set = vi.fn((arg: unknown) => {
      setSpy(arg);
      return originalSet(arg);
    });
    mockDb.update.mockReturnValueOnce(chain);

    const result = await router.setCharacterVoiceConfig({
      ctx: ctx(),
      input: {
        seriesId: "10",
        characterId: "1",
        voiceConfig: {
          voiceProvider: "uvoice",
          voiceModelId: "uvoice/tts-premium",
          voiceId: "th-porche",
          // A malicious/naive client sending lock fields — the input schema
          // itself omits them from the accepted shape, so this can't even
          // reach `.set()`.
          lockedAt: "2000-01-01T00:00:00.000Z",
          lockedByUserId: 999,
        } as any,
      },
    });

    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        voiceConfig: expect.objectContaining({
          voiceModelId: "uvoice/tts-premium",
          voiceId: "th-porche",
          lockedByUserId: 42, // from ctx.user.id, not the spoofed 999
        }),
      }),
    );
    const setArg = setSpy.mock.calls[0][0];
    expect(setArg.voiceConfig.lockedAt).not.toBe("2000-01-01T00:00:00.000Z");
    expect(result.character.voiceConfig).toBeDefined();
  });

  it("clears a casting when voiceConfig is null", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW_CAST]));

    const setSpy = vi.fn();
    const chain = updateChain([CHARACTER_ROW_UNCAST]);
    const originalSet = chain.set;
    chain.set = vi.fn((arg: unknown) => {
      setSpy(arg);
      return originalSet(arg);
    });
    mockDb.update.mockReturnValueOnce(chain);

    await router.setCharacterVoiceConfig({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1", voiceConfig: null },
    });

    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ voiceConfig: null }));
  });

  it("throws NOT_FOUND for a character in another tenant's series (ownership guard)", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // loadOwnedSeries — empty

    await expect(
      router.setCharacterVoiceConfig({
        ctx: ctx({ tenantId: "other-tenant" }),
        input: { seriesId: "10", characterId: "1", voiceConfig: null },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("never throws when the best-effort audit write fails", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW_UNCAST]));
    mockDb.update.mockReturnValueOnce(updateChain([CHARACTER_ROW_CAST]));
    mockDb.insert.mockReturnValue({ values: vi.fn().mockRejectedValue(new Error("audit db down")) });

    await expect(
      router.setCharacterVoiceConfig({
        ctx: ctx(),
        input: {
          seriesId: "10",
          characterId: "1",
          voiceConfig: { voiceModelId: "uvoice/tts-premium", voiceId: "th-porche" },
        },
      }),
    ).resolves.toBeDefined();
  });
});

/* -------------------------------------------------------------------------- */
/* listVoiceCatalog                                                           */
/* -------------------------------------------------------------------------- */

describe("listVoiceCatalog — reuses the trailer's voice-picker machinery", () => {
  it("flattens dynamic voice options from media.listModelFieldOptions, parsing language/ageTag from the label", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW])) // loadOwnedSeries
      .mockReturnValueOnce(
        selectChain([
          {
            modelId: "uvoice/tts-premium",
            voices: null,
            configJson: { inputFields: [{ key: "voiceID", optionsSource: { valueField: "voice_id" } }] },
          },
        ]),
      ); // audio models query

    mockListModelFieldOptions.mockResolvedValue({
      options: [{ value: "th-porche", label: "th - ปอร์เช่ (Adult)" }],
      source: "dynamic",
    });

    const result = await router.listVoiceCatalog({ ctx: ctx(), input: { seriesId: "10" } });

    expect(result.voices).toEqual([
      {
        voiceModelId: "uvoice/tts-premium",
        voiceId: "th-porche",
        label: "th - ปอร์เช่ (Adult)",
        language: "th",
        ageTag: "Adult",
      },
    ]);
    expect(mockListModelFieldOptions).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: "uvoice/tts-premium", fieldKey: "voiceID" }),
    );
  });

  it("falls back to the model's flat voices column when no voice field is detected", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(
        selectChain([{ modelId: "gemini-tts", voices: ["Kore", "Zephyr"], configJson: null }]),
      );

    const result = await router.listVoiceCatalog({ ctx: ctx(), input: { seriesId: "10" } });

    expect(mockListModelFieldOptions).not.toHaveBeenCalled();
    expect(result.voices).toEqual([
      { voiceModelId: "gemini-tts", voiceId: "Kore", label: "Kore" },
      { voiceModelId: "gemini-tts", voiceId: "Zephyr", label: "Zephyr" },
    ]);
  });

  it("one model's fetch failure does not break the whole catalog (falls through to its voices column)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(
        selectChain([
          {
            modelId: "flaky-model",
            voices: ["Fallback"],
            configJson: { inputFields: [{ key: "voice" }] },
          },
        ]),
      );
    mockListModelFieldOptions.mockRejectedValue(new Error("provider unreachable"));

    const result = await router.listVoiceCatalog({ ctx: ctx(), input: { seriesId: "10" } });

    expect(result.voices).toEqual([{ voiceModelId: "flaky-model", voiceId: "Fallback", label: "Fallback" }]);
  });

  it("throws NOT_FOUND for a series the caller does not own", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));

    await expect(
      router.listVoiceCatalog({ ctx: ctx(), input: { seriesId: "999" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

/* -------------------------------------------------------------------------- */
/* previewCharacterVoice                                                      */
/* -------------------------------------------------------------------------- */

describe("previewCharacterVoice", () => {
  it("previews the already-cast voice with the fixed Thai sample (character name included) when no sampleText is given", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW_CAST]))
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }])); // pricing lookup

    mockGenerateAudioAsync.mockResolvedValue({ id: "task-123" });

    const result = await router.previewCharacterVoice({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1" },
    });

    expect(mockGenerateAudioAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "uvoice/tts-premium",
        voice: "th-porche",
        text: expect.stringContaining("Aria"),
      }),
      expect.any(String),
    );
    expect(result).toEqual({ taskId: "task-123", creditCost: 5 });
  });

  it("sanitizes and caps a caller-supplied sampleText at 120 chars", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW_CAST]))
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));
    mockGenerateAudioAsync.mockResolvedValue({ id: "task-456" });

    const longText = "ก".repeat(200);
    await router.previewCharacterVoice({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1", sampleText: longText },
    });

    const sentText = mockGenerateAudioAsync.mock.calls[0][0].text as string;
    expect(sentText.length).toBeLessThanOrEqual(120);
  });

  it("auditions a caller-supplied candidate voiceConfig without persisting it (setCharacterVoiceConfig is untouched)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW_UNCAST])) // not cast yet
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));
    mockGenerateAudioAsync.mockResolvedValue({ id: "task-789" });

    await router.previewCharacterVoice({
      ctx: ctx(),
      input: {
        seriesId: "10",
        characterId: "1",
        voiceConfig: { voiceModelId: "uvoice/tts-natural", voiceId: "th-nalinee" },
      },
    });

    expect(mockGenerateAudioAsync).toHaveBeenCalledWith(
      expect.objectContaining({ model: "uvoice/tts-natural", voice: "th-nalinee" }),
      expect.any(String),
    );
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("throws PRECONDITION_FAILED when the character has no casting and none was supplied", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW_UNCAST]));

    await expect(
      router.previewCharacterVoice({ ctx: ctx(), input: { seriesId: "10", characterId: "1" } }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    expect(mockGenerateAudioAsync).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN and never submits when credits are insufficient", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW_CAST]))
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));
    mockHasEnoughCredits.mockResolvedValue(false);

    await expect(
      router.previewCharacterVoice({ ctx: ctx(), input: { seriesId: "10", characterId: "1" } }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(mockGenerateAudioAsync).not.toHaveBeenCalled();
  });

  it("refunds the reserved credits when submission fails", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW_CAST]))
      .mockReturnValueOnce(selectChain([{ creditCost: 5, configJson: null }]));
    mockGenerateAudioAsync.mockRejectedValue(new Error("provider down"));

    await expect(
      router.previewCharacterVoice({ ctx: ctx(), input: { seriesId: "10", characterId: "1" } }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });

    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
    expect(mockRefundCredits).toHaveBeenCalledTimes(1);
  });

  it("skips reserve/refund entirely for a zero-cost model", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW_CAST]))
      .mockReturnValueOnce(selectChain([{ creditCost: 0, configJson: null }]));
    mockCalculateCreditCost.mockReturnValue(0);
    mockGenerateAudioAsync.mockResolvedValue({ id: "task-zero" });

    const result = await router.previewCharacterVoice({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1" },
    });

    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(result.creditCost).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Flags-off byte-identical payload inclusion                                 */
/* -------------------------------------------------------------------------- */

describe("listCharacters / updateCharacter — voiceConfig payload inclusion (flags-off byte-identical)", () => {
  it("listCharacters omits voiceConfig entirely when verticalDramaSeriesVoiceChain is off", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesVoiceChain: false });
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW])) // loadOwnedSeries
      .mockReturnValueOnce(selectChain([CHARACTER_ROW_CAST])); // characters query

    const result = await router.listCharacters({ ctx: ctx(), input: { seriesId: "10" } });

    expect("voiceConfig" in result.characters[0]).toBe(false);
  });

  it("listCharacters includes voiceConfig when verticalDramaSeriesVoiceChain is on", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesVoiceChain: true });
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW_CAST]));

    const result = await router.listCharacters({ ctx: ctx(), input: { seriesId: "10" } });

    expect(result.characters[0].voiceConfig).toEqual(CHARACTER_ROW_CAST.voiceConfig);
  });

  it("updateCharacter omits voiceConfig entirely when the flag is off, even for an already-cast character", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesVoiceChain: false });
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([CHARACTER_ROW_CAST])); // loadOwnedCharacter
    mockDb.update.mockReturnValueOnce(updateChain([CHARACTER_ROW_CAST]));

    const result = await router.updateCharacter({
      ctx: ctx(),
      input: { seriesId: "10", characterId: "1", name: "Aria Renamed" },
    });

    expect("voiceConfig" in result.character).toBe(false);
  });
});
