/**
 * Vertical Drama Series — `synthesizeGenrePreset` v2 router wiring coverage
 * (spec §8.2.2.C, section-15, added 2026-07-07).
 *
 * Same "mock the whole module graph, test the exported procedure handler
 * directly" convention as `verticalDramaSeries.listProductImages.test.ts`.
 * Covers:
 *  - Flag OFF: `getTenantFeatureFlags` is consulted, but the v1 service
 *    (`synthesizeVerticalDramaPreset`) is called and the v2 service
 *    (`synthesizeVerticalDramaPresetV2`) is NEVER called — regardless of
 *    whether `input.selections` is also present (byte-identical v1 path).
 *  - Flag ON: the v2 service is called with the resolved preset rows
 *    (union of legacy `selectedPresetIds` and v2-only `selections` ids).
 *  - Flag ON: NOT_FOUND when a v2-only referenced preset id isn't visible
 *    to the caller (same scope enforcement as the legacy path).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
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

vi.mock("../../services/verticalDramaStoryBible", () => ({
  generateStoryBible: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));

vi.mock("../../_core/logger", () => ({
  debugError: vi.fn(),
  debugLog: vi.fn(),
}));

const { mockSynthesizeV1, mockSynthesizeV2, mockGetTenantFeatureFlags } = vi.hoisted(() => ({
  mockSynthesizeV1: vi.fn(),
  mockSynthesizeV2: vi.fn(),
  mockGetTenantFeatureFlags: vi.fn(),
}));
vi.mock("../../services/verticalDramaPresetSynthesis", () => ({
  PresetSynthesisInputError: class extends Error {},
  synthesizeVerticalDramaPreset: mockSynthesizeV1,
  synthesizeVerticalDramaPresetV2: mockSynthesizeV2,
}));
vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));

import { verticalDramaSeriesRouter } from "../verticalDramaSeries";

const router = verticalDramaSeriesRouter as unknown as Record<string, Function>;

function ctx(overrides: Partial<{ tenantId: string | null; user: { id: number; role: string } }> = {}) {
  return {
    tenantId: "tenant-1",
    user: { id: 42, role: "user" },
    userToken: null,
    publicUrl: undefined,
    ...overrides,
  };
}

function selectChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => Promise.resolve(rows)),
    groupBy: vi.fn(() => Promise.resolve(rows)),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

function presetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 101,
    title: "Neon Jungle Guardian",
    category: "sci_fi_mecha",
    scope: "global",
    tenantId: null,
    userId: null,
    logline: "l",
    mainPlot: "m",
    seasonArc: "s",
    tone: "t",
    cliffhangerStyle: "c",
    charactersJson: [],
    visualBible: "v",
    visualIdentityJson: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("synthesizeGenrePreset — flag OFF (byte-identical v1)", () => {
  it("calls the v1 service and NEVER the v2 service, even when input.selections is also supplied", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesPresetMixV2: false });
    mockDb.select.mockReturnValueOnce(
      selectChain([presetRow({ id: 101 }), presetRow({ id: 202, title: "My Giant Companion" })]),
    );
    mockSynthesizeV1.mockResolvedValue({
      draft: { contract_version: 1, title: "x" },
      creditsUsed: 2,
      model: "gpt-x",
    });

    const result = await router.synthesizeGenrePreset({
      ctx: ctx(),
      input: {
        selectedPresetIds: ["101"],
        selections: [{ presetId: "202", weight: 5 }], // present but MUST be ignored while flag is off
      },
    });

    expect(mockSynthesizeV1).toHaveBeenCalledTimes(1);
    expect(mockSynthesizeV2).not.toHaveBeenCalled();
    const callArgs = mockSynthesizeV1.mock.calls[0][0];
    expect(callArgs).not.toHaveProperty("seriesTitleHint");
    expect(callArgs).not.toHaveProperty("genreHint");
    expect(callArgs).not.toHaveProperty("audienceAgeRating");
    expect(callArgs).not.toHaveProperty("lineageContext");
    expect((result as any).draft.contract_version).toBe(1);
  });

  it("forwards a basics-only request to v1 without requiring a preset", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesPresetMixV2: false,
      verticalDramaUserPremise: true,
    });
    mockDb.select.mockReturnValueOnce(selectChain([]));
    mockSynthesizeV1.mockResolvedValue({
      draft: { contract_version: 1, title: "AI original" },
      creditsUsed: 2,
      model: "gpt-x",
    });

    await router.synthesizeGenrePreset({
      ctx: ctx(),
      input: {
        selectedPresetIds: [],
        selectedCategories: [],
        seriesTitleHint: "ร้านเล็กหัวใจใหญ่",
        genreHint: "ดราม่าชุมชน",
        toneHint: "อบอุ่น",
        audienceAgeRating: "under13",
      },
    });

    expect(mockSynthesizeV1).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedPresets: [],
        selectedCategories: [],
        seriesTitleHint: "ร้านเล็กหัวใจใหญ่",
        genreHint: "ดราม่าชุมชน",
        toneHint: "อบอุ่น",
        audienceAgeRating: "under13",
      }),
    );
  });

  it("forwards sequel lineage to v1 even when a user premise is present", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesPresetMixV2: false,
      verticalDramaUserPremise: true,
    });
    mockDb.select.mockReturnValueOnce(selectChain([]));
    mockSynthesizeV1.mockResolvedValue({
      draft: { contract_version: 1, title: "Season 2" },
      creditsUsed: 2,
      model: "gpt-x",
    });
    const lineageContext = {
      contractVersion: 1 as const,
      parentSeriesId: 16,
      parentTitle: "คาเฟ่ริมนาวเพ้อรัก",
      createMode: "sequel" as const,
      priorSeasonSummary: "พระเอกและนางเอกฝ่าปัญหาครอบครัวมาด้วยกัน",
    };

    await router.synthesizeGenrePreset({
      ctx: ctx(),
      input: {
        selectedPresetIds: [],
        userPremise: "เพิ่มความหวาน ความหึง และให้วิญญาณแม่มาเข้าฝัน",
        lineageContext,
      },
    });

    expect(mockSynthesizeV1).toHaveBeenCalledWith(
      expect.objectContaining({
        userPremise: "เพิ่มความหวาน ความหึง และให้วิญญาณแม่มาเข้าฝัน",
        lineageContext,
      }),
    );
  });
});

describe("synthesizeGenrePreset — flag ON (Preset Mix v2)", () => {
  it("calls the v2 service with the resolved preset rows (union of legacy ids and v2-only selection ids)", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesPresetMixV2: true });
    mockDb.select.mockReturnValueOnce(
      selectChain([presetRow({ id: 101 }), presetRow({ id: 202, title: "My Giant Companion" })]),
    );
    mockSynthesizeV2.mockResolvedValue({
      draft: { contract_version: 2, title: "y", blendReport: { underBlended: [] } },
      creditsUsed: 5,
      model: "gpt-x",
    });

    const result = await router.synthesizeGenrePreset({
      ctx: ctx(),
      input: {
        selectedPresetIds: ["101"],
        selections: [
          { presetId: "101", weight: 3 },
          { presetId: "202", weight: 2 },
        ],
        primarySelectionId: "101",
      },
    });

    expect(mockSynthesizeV1).not.toHaveBeenCalled();
    expect(mockSynthesizeV2).toHaveBeenCalledTimes(1);
    const callArgs = mockSynthesizeV2.mock.calls[0][0];
    expect(callArgs.selectedPresets.map((p: any) => p.id).sort()).toEqual(["101", "202"]);
    expect(callArgs.primarySelectionId).toBe("101");
    expect(callArgs).not.toHaveProperty("seriesTitleHint");
    expect(callArgs).not.toHaveProperty("genreHint");
    expect(callArgs).not.toHaveProperty("audienceAgeRating");
    expect(callArgs).not.toHaveProperty("lineageContext");
    expect((result as any).draft.contract_version).toBe(2);
  });

  it("throws NOT_FOUND when a v2-only selections presetId isn't visible to the caller", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesPresetMixV2: true });
    mockDb.select.mockReturnValueOnce(selectChain([presetRow({ id: 101 })])); // 202 not visible

    await expect(
      router.synthesizeGenrePreset({
        ctx: ctx(),
        input: {
          selections: [
            { presetId: "101", weight: 3 },
            { presetId: "202", weight: 2 },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockSynthesizeV2).not.toHaveBeenCalled();
  });

  it("forwards sequel lineage to v2 even when a user premise is present", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesPresetMixV2: true,
      verticalDramaUserPremise: true,
    });
    mockDb.select.mockReturnValueOnce(selectChain([]));
    mockSynthesizeV2.mockResolvedValue({
      draft: { contract_version: 2, title: "Season 2", blendReport: { underBlended: [] } },
      creditsUsed: 2,
      model: "gpt-x",
    });
    const lineageContext = {
      contractVersion: 1 as const,
      parentSeriesId: 16,
      parentTitle: "คาเฟ่ริมนาวเพ้อรัก",
      createMode: "sequel" as const,
      priorSeasonSummary: "พระเอกและนางเอกฝ่าปัญหาครอบครัวมาด้วยกัน",
    };

    await router.synthesizeGenrePreset({
      ctx: ctx(),
      input: {
        selectedPresetIds: [],
        selections: [],
        userPremise: "เพิ่มความหวาน ความหึง และให้วิญญาณแม่มาเข้าฝัน",
        lineageContext,
      },
    });

    expect(mockSynthesizeV2).toHaveBeenCalledWith(
      expect.objectContaining({
        userPremise: "เพิ่มความหวาน ความหึง และให้วิญญาณแม่มาเข้าฝัน",
        lineageContext,
      }),
    );
  });
});
