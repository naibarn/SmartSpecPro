/**
 * Vertical Drama Series — `create`'s preset visual-identity stamping
 * (spec §8.2.2.A flow-through rule, section-15 change C, added 2026-07-07)
 * plus the underlying pure `stampPresetVisualIdentityIntoBible` helper.
 *
 * Same "mock the whole module graph, test the exported procedure handler
 * directly" convention as `verticalDramaSeries.setSeriesTargetAudienceRegion.test.ts`.
 * Covers:
 *  - `stampPresetVisualIdentityIntoBible` (pure): additive enrichment of
 *    `visualStyle`/`cameraGrammar`, full identity stored under
 *    `bible.presetVisualIdentity`, never mutates the input bible.
 *  - `create`: flag off -> byte-identical (no preset lookup, no second DB
 *    write); flag on + no `appliedPresetId` -> unchanged; flag on +
 *    `appliedPresetId` pointing at a preset WITHOUT `visualIdentityJson` ->
 *    unchanged; flag on + a preset WITH `visualIdentityJson` -> stamps +
 *    returns the updated row; invalid/inaccessible `appliedPresetId` never
 *    fails series creation (best-effort).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stampPresetVisualIdentityIntoBible } from "../verticalDramaSeries";
import type { VerticalDramaPresetVisualIdentity } from "@shared/verticalDramaSeries/presetVisualIdentity";
import { fingerprintDraftQualityQcCandidate } from "@shared/verticalDramaSeries/draftQualityQc";

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
  const adminProcedure = createProcedure();
  return {
    router: (routes: Record<string, unknown>) => routes,
    protectedProcedure: createProcedure(),
    adminProcedure,
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

const { mockGetTenantFeatureFlags } = vi.hoisted(() => ({
  mockGetTenantFeatureFlags: vi.fn(),
}));
vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));

const { mockGetDraftQualityQcStatus } = vi.hoisted(() => ({
  mockGetDraftQualityQcStatus: vi.fn(),
}));
vi.mock("../../services/verticalDramaDraftQualityQcJobs", () => ({
  getVerticalDramaDraftQualityQcStatus: mockGetDraftQualityQcStatus,
  enqueueVerticalDramaDraftQualityQc: vi.fn(),
  cancelVerticalDramaDraftQualityQc: vi.fn(),
}));

import { createSeriesInput, verticalDramaSeriesRouter } from "../verticalDramaSeries";

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
    orderBy: vi.fn(() => chain),
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

function updateChain(returned: unknown[]) {
  const chain: any = {
    set: vi.fn(() => chain),
    where: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(returned)),
  };
  return chain;
}

const IDENTITY: VerticalDramaPresetVisualIdentity = {
  styleName: "Neon Bio-Jungle Tech",
  palette: ["Teal", "Bioluminescent Green", "Deep Jungle Black"],
  lighting: "bioluminescent rim light",
  environmentMotifs: ["glowing orchids"],
  wardrobeGrammar: ["techwear scout suit"],
  signaturePropsAndCompanions: ["cyber tiger companion"],
  cameraGrammar: "low-angle hero portrait, centered 9:16",
  characterArchetypes: [{ role: "นางเอก", look: "techwear scout" }],
  imagePromptFragments: { positive: ["cinematic"], negative: ["blurry"] },
};

describe("stampPresetVisualIdentityIntoBible (pure)", () => {
  it("sets visualStyle/cameraGrammar directly when the bible has neither yet", () => {
    const result = stampPresetVisualIdentityIntoBible({ logline: "x" }, IDENTITY);
    expect(result.visualStyle).toContain("Neon Bio-Jungle Tech");
    expect(result.visualStyle).toContain("Teal, Bioluminescent Green, Deep Jungle Black");
    expect(result.cameraGrammar).toBe("low-angle hero portrait, centered 9:16");
    expect(result.logline).toBe("x"); // other fields carried over untouched
  });

  it("APPENDS to existing visualStyle/cameraGrammar rather than overwriting (additive enrichment)", () => {
    const existing = { visualStyle: "Wizard-authored prose about the look.", cameraGrammar: "handheld, close-up" };
    const result = stampPresetVisualIdentityIntoBible(existing, IDENTITY);
    expect(result.visualStyle).toContain("Wizard-authored prose about the look.");
    expect(result.visualStyle).toContain("Neon Bio-Jungle Tech");
    expect(result.cameraGrammar).toContain("handheld, close-up");
    expect(result.cameraGrammar).toContain("low-angle hero portrait, centered 9:16");
  });

  it("stores the FULL identity object verbatim under bible.presetVisualIdentity", () => {
    const result = stampPresetVisualIdentityIntoBible(null, IDENTITY);
    expect(result.presetVisualIdentity).toEqual(IDENTITY);
  });

  it("never mutates the input bible object", () => {
    const existing = { visualStyle: "original" };
    const frozen = Object.freeze({ ...existing });
    expect(() => stampPresetVisualIdentityIntoBible(frozen, IDENTITY)).not.toThrow();
    expect(frozen.visualStyle).toBe("original");
  });
});

const PRESET_ROW_WITH_IDENTITY = {
  id: 77,
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
  visualIdentityJson: IDENTITY,
};

const PRESET_ROW_NO_IDENTITY = { ...PRESET_ROW_WITH_IDENTITY, id: 88, visualIdentityJson: null };

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

describe("create — preset visual-identity stamping (flag-gated, best-effort)", () => {
  it("persists a selected genre look in the initial insert before create returns", async () => {
    let inserted: any;
    const chain: any = {
      values: vi.fn((value: any) => {
        inserted = value;
        return chain;
      }),
      returning: vi.fn(async () => [{ ...INSERTED_ROW, bible: inserted.bible }]),
    };
    mockDb.insert.mockReturnValueOnce(chain);
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesLookLock: true });

    const result = await router.create({
      ctx: ctx(),
      input: {
        title: "My Series",
        lookLock: { mode: "genre", genreKey: "horror_thriller" },
      },
    });

    expect(inserted.bible).toMatchObject({
      lookLockControl: { mode: "genre", genreKey: "horror_thriller", revision: 1 },
      presetVisualIdentity: { styleName: "Controlled atmospheric thriller" },
    });
    expect((result.series as any).bible.lookLockControl.revision).toBe(1);
  });

  it("validates an AI-mix candidate, drops client reference ids, and records ai_mix", async () => {
    let inserted: any;
    const chain: any = {
      values: vi.fn((value: any) => {
        inserted = value;
        return chain;
      }),
      returning: vi.fn(async () => [{ ...INSERTED_ROW, bible: inserted.bible }]),
    };
    mockDb.insert.mockReturnValueOnce(chain);
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesLookLock: true });

    await router.create({
      ctx: ctx(),
      input: {
        title: "AI Mix Series",
        lookLock: {
          mode: "inherit_source",
          candidateIdentity: { ...IDENTITY, referenceAssetIds: ["untrusted-client-id"] },
        },
      },
    });

    expect(inserted.bible.presetVisualIdentity).toEqual(IDENTITY);
    expect(inserted.bible.presetVisualIdentity).not.toHaveProperty("referenceAssetIds");
    expect(inserted.bible.lookLockControl).toMatchObject({
      mode: "inherit_source",
      inheritedSource: "ai_mix",
      inheritedGovernance: "look_lock",
      revision: 1,
    });
  });

  it("rejects an incomplete creation look choice at the input contract", () => {
    expect(createSeriesInput.safeParse({
      title: "My Series",
      lookLock: { mode: "genre" },
    }).success).toBe(false);
  });

  it("flag OFF: never calls getTenantFeatureFlags's result-consuming preset lookup or a second db.update, even with appliedPresetId set", async () => {
    mockDb.insert.mockReturnValueOnce(insertChain([INSERTED_ROW]));
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesPresetMixV2: false });

    const result = await router.create({
      ctx: ctx(),
      input: { title: "My Series", appliedPresetId: "77" },
    });

    expect(mockDb.update).not.toHaveBeenCalled();
    expect(result.series.id).toBe("10");
    expect((result.series as any).bible).toBeNull();
  });

  it("flag ON but no appliedPresetId: no preset lookup, no stamping", async () => {
    mockDb.insert.mockReturnValueOnce(insertChain([INSERTED_ROW]));

    const result = await router.create({ ctx: ctx(), input: { title: "My Series" } });

    expect(mockGetTenantFeatureFlags).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
    expect((result.series as any).bible).toBeNull();
  });

  it("flag ON + appliedPresetId pointing at a preset WITHOUT visualIdentityJson: never stamps", async () => {
    mockDb.insert.mockReturnValueOnce(insertChain([INSERTED_ROW]));
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesPresetMixV2: true });
    mockDb.select.mockReturnValueOnce(selectChain([PRESET_ROW_NO_IDENTITY]));

    const result = await router.create({
      ctx: ctx(),
      input: { title: "My Series", appliedPresetId: "88" },
    });

    expect(mockDb.update).not.toHaveBeenCalled();
    expect((result.series as any).bible).toBeNull();
  });

  it("flag ON + appliedPresetId pointing at a preset WITH visualIdentityJson: stamps and returns the UPDATED row", async () => {
    mockDb.insert.mockReturnValueOnce(insertChain([INSERTED_ROW]));
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesPresetMixV2: true });
    mockDb.select.mockReturnValueOnce(selectChain([PRESET_ROW_WITH_IDENTITY]));

    const stampedBible = { visualStyle: "Neon Bio-Jungle Tech — ...", presetVisualIdentity: IDENTITY };
    const updatedRow = { ...INSERTED_ROW, bible: stampedBible };
    mockDb.update.mockReturnValueOnce(updateChain([updatedRow]));

    const result = await router.create({
      ctx: ctx(),
      input: { title: "My Series", appliedPresetId: "77" },
    });

    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect((result.series as any).bible.presetVisualIdentity).toEqual(IDENTITY);
    expect(result.series.id).toBe("10");
  });

  it("an invalid/inaccessible appliedPresetId never fails series creation (best-effort) — returns the original row", async () => {
    mockDb.insert.mockReturnValueOnce(insertChain([INSERTED_ROW]));
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesPresetMixV2: true });
    mockDb.select.mockReturnValueOnce(selectChain([])); // no visible preset matches this id

    const result = await router.create({
      ctx: ctx(),
      input: { title: "My Series", appliedPresetId: "999999" },
    });

    expect(mockDb.update).not.toHaveBeenCalled();
    expect(result.series.id).toBe("10");
  });

  it("a getTenantFeatureFlags rejection never fails series creation (best-effort, error swallowed + logged)", async () => {
    mockDb.insert.mockReturnValueOnce(insertChain([INSERTED_ROW]));
    mockGetTenantFeatureFlags.mockRejectedValue(new Error("flag service unavailable"));

    const result = await router.create({
      ctx: ctx(),
      input: { title: "My Series", appliedPresetId: "77" },
    });

    expect(result.series.id).toBe("10");
  });

  it("accepts only the owner-scoped authoritative QC result and persists a sanitized audit", async () => {
    const candidate = {
      title: "Proof of Us",
      logline: "A student must protect her scholarship.",
      mainPlot: "Rivalry becomes collaboration.",
      seasonArc: "Trust becomes love.",
      storyContext: { targetMarket: "United States" },
    };
    const candidateFingerprint = fingerprintDraftQualityQcCandidate(candidate);
    mockGetDraftQualityQcStatus.mockResolvedValueOnce({
      tenantId: "tenant-1",
      userId: 42,
      status: "succeeded",
      result: {
        best: {
          draft: candidate,
          fingerprint: candidateFingerprint,
          round: 1,
          report: {
            overallScore: 9.25,
            status: "passed",
            pass: true,
            criticalFails: [],
            evaluatedAt: "2026-08-12T00:00:00.000Z",
          },
        },
        history: [],
        creditEstimate: { baselineCalls: 1, maxImprovementRounds: 1, maxCalls: 3, estimatedCredits: 3, actualCredits: 2 },
        stopReason: "passed",
        model: "test-model",
      },
    });
    let inserted: any;
    const chain: any = {
      values: vi.fn((value: any) => { inserted = value; return chain; }),
      returning: vi.fn(async () => [{ ...INSERTED_ROW, title: "Custom Title", bible: inserted.bible }]),
    };
    mockDb.insert.mockReturnValueOnce(chain);

    const result = await router.create({
      ctx: ctx(),
      input: {
        title: "Custom Title",
        bible: {
          logline: candidate.logline,
          mainPlot: candidate.mainPlot,
          seasonArc: candidate.seasonArc,
        },
        draftQualityQcReceipt: {
          runId: "00000000-0000-4000-8000-000000000001",
          candidateFingerprint,
        },
        draftQualityQcCandidate: candidate,
      },
    });

    expect(result.series.title).toBe("Custom Title");
    expect(inserted.bible.draftQualityQc).toMatchObject({
      contractVersion: "vd-draft-qc-v1",
      candidateFingerprint,
      overallScore: 9.25,
      pass: true,
      appliedTitle: "Custom Title",
    });
    expect(inserted.bible.draftQualityQc).not.toHaveProperty("best");
  });

  it("allows creation with a completed low-score QC receipt because QC is advisory", async () => {
    const candidate = {
      title: "Draft with warnings",
      logline: "A student faces a difficult choice.",
      mainPlot: "The choice creates new pressure.",
      seasonArc: "The student decides what to do next.",
    };
    const candidateFingerprint = fingerprintDraftQualityQcCandidate(candidate);
    mockGetDraftQualityQcStatus.mockResolvedValueOnce({
      tenantId: "tenant-1",
      userId: 42,
      status: "succeeded",
      result: {
        best: {
          draft: candidate,
          fingerprint: candidateFingerprint,
          round: 1,
          report: {
            overallScore: 5.5,
            status: "needs_work",
            pass: false,
            criticalFails: ["episode window needs review"],
            evaluatedAt: "2026-08-17T00:00:00.000Z",
          },
        },
        history: [],
        creditEstimate: {
          baselineCalls: 1,
          maxImprovementRounds: 0,
          maxCalls: 1,
          estimatedCredits: 1,
          actualCredits: 1,
        },
        stopReason: "max_rounds",
        model: "test-model",
      },
    });
    let inserted: any;
    const chain: any = {
      values: vi.fn((value: any) => {
        inserted = value;
        return chain;
      }),
      returning: vi.fn(async () => [
        { ...INSERTED_ROW, title: candidate.title, bible: inserted.bible },
      ]),
    };
    mockDb.insert.mockReturnValueOnce(chain);

    const result = await router.create({
      ctx: ctx(),
      input: {
        title: candidate.title,
        bible: {
          logline: candidate.logline,
          mainPlot: candidate.mainPlot,
          seasonArc: candidate.seasonArc,
        },
        draftQualityQcReceipt: {
          runId: "00000000-0000-4000-8000-000000000002",
          candidateFingerprint,
        },
        draftQualityQcCandidate: candidate,
      },
    });

    expect(result.series.title).toBe(candidate.title);
    expect(inserted.bible.draftQualityQc).toMatchObject({
      overallScore: 5.5,
      pass: false,
      status: "needs_work",
      explicitOverride: false,
    });
  });

  it("rejects a forged candidate fingerprint before touching the series insert", async () => {
    mockGetDraftQualityQcStatus.mockResolvedValueOnce({
      tenantId: "tenant-1",
      userId: 42,
      status: "succeeded",
      result: { best: { report: { pass: true, criticalFails: [] } } },
    });

    await expect(router.create({
      ctx: ctx(),
      input: {
        title: "Forged",
        draftQualityQcReceipt: {
          runId: "00000000-0000-4000-8000-000000000001",
          candidateFingerprint: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        draftQualityQcCandidate: { title: "Different candidate" },
      },
    })).rejects.toThrow("does not match the approved run");
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});
