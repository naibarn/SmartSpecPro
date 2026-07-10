/**
 * Vertical Drama Series — Feature 132 §4 (F132A, user-premise-preset-mix)
 * router wiring coverage. Same "mock the whole module graph, test the
 * exported procedure handler directly" convention as
 * `verticalDramaSeries.createPresetStamp.test.ts` /
 * `verticalDramaSeries.synthesizeGenrePresetV2.test.ts`.
 *
 * Covers:
 *  - `create`: `userPremise` merges into `bible.userPremise` (both when
 *    `input.bible` is absent and when it already carries other keys);
 *    absent when `userPremise` is omitted (byte-identical).
 *  - `synthesizeGenrePreset` (v1 and v2 branches): `userPremise` forwarded
 *    ONLY when the tenant's `verticalDramaUserPremise` flag is on; forced to
 *    `undefined` regardless of what the client sent when off.
 *  - `seedCharactersFromDraft`: `presetCharacterProfiles` merges
 *    `speechProfile`/`personality` onto the matching (by normalized name)
 *    parsed draft row; falls back to text-only when omitted/no match.
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

import { verticalDramaSeriesRouter, seedCharactersFromDraft } from "../verticalDramaSeries";

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

function insertChain(returned: unknown[]) {
  const chain: any = {
    values: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(returned)),
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

const INSERTED_ROW = {
  id: 10,
  tenantId: "tenant-1",
  userId: 42,
  title: "My Series",
  locale: "th",
  aspectRatio: "9:16",
  status: "draft",
  targetEpisodeCount: 10,
  defaultEpisodeDurationSeconds: 60,
  genre: null,
  tone: null,
  targetAudience: null,
  agePolicyId: null,
  bible: null,
  memory: null,
  productTieIn: null,
  policy: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

/* -------------------------------------------------------------------------- */
/* create — userPremise -> bible.userPremise merge                           */
/* -------------------------------------------------------------------------- */

describe("create — userPremise merges into bible.userPremise (F132A)", () => {
  it("with input.userPremise set and no input.bible, the inserted row's bible becomes { userPremise }", async () => {
    mockDb.insert.mockReturnValueOnce(insertChain([{ ...INSERTED_ROW, bible: { userPremise: "premise text" } }]));

    await router.create({
      ctx: ctx(),
      input: { title: "My Series", userPremise: "premise text" },
    });

    const insertedValues = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(insertedValues.bible).toEqual({ userPremise: "premise text" });
  });

  it("with both input.userPremise and input.bible.logline set, the inserted row's bible contains both keys merged (no clobber)", async () => {
    mockDb.insert.mockReturnValueOnce(insertChain([INSERTED_ROW]));

    await router.create({
      ctx: ctx(),
      input: {
        title: "My Series",
        userPremise: "premise text",
        bible: { logline: "existing logline" },
      },
    });

    const insertedValues = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(insertedValues.bible).toEqual({ logline: "existing logline", userPremise: "premise text" });
  });

  it("omits userPremise (byte-identical bible: input.bible ?? null) when the field is absent", async () => {
    mockDb.insert.mockReturnValueOnce(insertChain([INSERTED_ROW]));

    await router.create({ ctx: ctx(), input: { title: "My Series" } });

    const insertedValues = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(insertedValues.bible).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* synthesizeGenrePreset — userPremise flag gating (v1 + v2)                  */
/* -------------------------------------------------------------------------- */

describe("synthesizeGenrePreset — userPremise flag gating (F132A)", () => {
  it("v1 branch: flag OFF never forwards userPremise to synthesizeVerticalDramaPreset even if the client sent it", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesPresetMixV2: false,
      verticalDramaUserPremise: false,
    });
    mockDb.select.mockReturnValueOnce(selectChain([presetRow({ id: 101 })]));
    mockSynthesizeV1.mockResolvedValue({ draft: { contract_version: 1 }, creditsUsed: 1, model: "m" });

    await router.synthesizeGenrePreset({
      ctx: ctx(),
      input: { selectedPresetIds: ["101"], userPremise: "a premise" },
    });

    expect(mockSynthesizeV1).toHaveBeenCalledTimes(1);
    expect(mockSynthesizeV1.mock.calls[0][0].userPremise).toBeUndefined();
  });

  it("v1 branch: flag ON forwards userPremise verbatim", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesPresetMixV2: false,
      verticalDramaUserPremise: true,
    });
    mockDb.select.mockReturnValueOnce(selectChain([presetRow({ id: 101 })]));
    mockSynthesizeV1.mockResolvedValue({ draft: { contract_version: 1 }, creditsUsed: 1, model: "m" });

    await router.synthesizeGenrePreset({
      ctx: ctx(),
      input: { selectedPresetIds: ["101"], userPremise: "a premise" },
    });

    expect(mockSynthesizeV1.mock.calls[0][0].userPremise).toBe("a premise");
  });

  it("v2 branch: flag OFF (for userPremise, independent of Preset Mix v2) never forwards userPremise to synthesizeVerticalDramaPresetV2", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesPresetMixV2: true,
      verticalDramaUserPremise: false,
    });
    mockDb.select.mockReturnValueOnce(selectChain([presetRow({ id: 101 })]));
    mockSynthesizeV2.mockResolvedValue({
      draft: { contract_version: 2, blendReport: { underBlended: [] } },
      creditsUsed: 1,
      model: "m",
    });

    await router.synthesizeGenrePreset({
      ctx: ctx(),
      input: { selectedPresetIds: ["101"], userPremise: "a premise" },
    });

    expect(mockSynthesizeV2).toHaveBeenCalledTimes(1);
    expect(mockSynthesizeV2.mock.calls[0][0].userPremise).toBeUndefined();
  });

  it("v2 branch: both flags ON forwards userPremise verbatim to synthesizeVerticalDramaPresetV2", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesPresetMixV2: true,
      verticalDramaUserPremise: true,
    });
    mockDb.select.mockReturnValueOnce(selectChain([presetRow({ id: 101 })]));
    mockSynthesizeV2.mockResolvedValue({
      draft: { contract_version: 2, blendReport: { underBlended: [] } },
      creditsUsed: 1,
      model: "m",
    });

    await router.synthesizeGenrePreset({
      ctx: ctx(),
      input: { selectedPresetIds: ["101"], userPremise: "a premise" },
    });

    expect(mockSynthesizeV2.mock.calls[0][0].userPremise).toBe("a premise");
  });
});

/* -------------------------------------------------------------------------- */
/* seedCharactersFromDraft — presetCharacterProfiles merge (Section 05)      */
/* -------------------------------------------------------------------------- */

describe("seedCharactersFromDraft — presetCharacterProfiles merge", () => {
  it("merges speechProfile/personality onto the matching (normalized-name) draft row", async () => {
    mockDb.insert.mockReturnValueOnce(insertChain([]));

    await seedCharactersFromDraft("tenant-1", 42, 10, "Mai — Detective: the lead detective\nNok — Rival: her rival", [
      { name: "  MAI  ", speechProfile: { register: "formal" }, personality: { trait: "stubborn" } },
    ]);

    const insertedRows = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    const mai = insertedRows.find((r: any) => r.name === "Mai");
    const nok = insertedRows.find((r: any) => r.name === "Nok");
    expect(mai.data.speechProfile).toEqual({ register: "formal" });
    expect(mai.data.personality).toEqual({ trait: "stubborn" });
    expect(nok.data?.speechProfile).toBeUndefined();
  });

  it("falls back to the text-only path when presetCharacterProfiles is omitted", async () => {
    mockDb.insert.mockReturnValueOnce(insertChain([]));

    await seedCharactersFromDraft("tenant-1", 42, 10, "Mai — Detective: the lead detective");

    const insertedRows = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(insertedRows[0].data).toEqual({ description: "the lead detective" });
  });

  it("falls back to the text-only path when no profile matches by normalized name", async () => {
    mockDb.insert.mockReturnValueOnce(insertChain([]));

    await seedCharactersFromDraft("tenant-1", 42, 10, "Mai — Detective: the lead detective", [
      { name: "Someone Else", speechProfile: { register: "formal" } },
    ]);

    const insertedRows = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(insertedRows[0].data.speechProfile).toBeUndefined();
    expect(insertedRows[0].data.description).toBe("the lead detective");
  });
});
