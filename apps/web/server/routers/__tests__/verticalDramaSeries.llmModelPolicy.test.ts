/**
 * Vertical Drama Series — manual LLM model override coverage
 * (`listQualityPlanningModels` / `setSeriesLlmModelPolicy`, added 2026-07-11,
 * narrowed to a single series-wide `defaultModelId` field the same day per
 * `planning/vertical-drama-centralized-model-policy/plan.md` Phase 1).
 *
 * Same "mock the whole module graph, test the exported procedure handler
 * directly" convention as `verticalDramaSeries.setSeriesTargetAudienceRegion.test.ts`
 * / `verticalDramaSeries.adBanner.test.ts`. The heavy
 * `services/enabledLlmModels` / `services/verticalDramaImproveScript`
 * modules (loaded via the router's own lazy `await import(...)` — see this
 * router file's own "narrow vi.mock safety" doc comments) are mocked as
 * black boxes here — their own filter/sort behavior is covered by
 * `services/__tests__/verticalDramaImproveScript.test.ts`.
 *
 * Covers:
 *  - `listQualityPlanningModels`: joins in a display label
 *    (modelName/providerDisplayName), falls back to providerName/modelId
 *    when no label row is found, and returns `[]` (without ever touching the
 *    DB for labels) when nothing is eligible.
 *  - `setSeriesLlmModelPolicy`: overwrites the whole `llmModelPolicy` column
 *    with `{ defaultModelId }`, rejects a non-eligible model id with
 *    BAD_REQUEST, accepts `null` (always valid, means "automatic") without
 *    any eligibility check, and the ownership guard.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

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

vi.mock("../../services/enabledLlmModels", () => ({
  loadEnabledLlmModelRows: vi.fn(),
}));

vi.mock("../../services/verticalDramaImproveScript", () => ({
  selectQualityLargeContextEligibleModels: vi.fn(),
  selectRecommendedQualityLargeContextEligibleModels: vi.fn(),
}));

import { verticalDramaSeriesRouter } from "../verticalDramaSeries";
import { loadEnabledLlmModelRows } from "../../services/enabledLlmModels";
import {
  selectQualityLargeContextEligibleModels,
  selectRecommendedQualityLargeContextEligibleModels,
} from "../../services/verticalDramaImproveScript";

const router = verticalDramaSeriesRouter as unknown as Record<string, Function>;
const mockLoadEnabledLlmModelRows = vi.mocked(loadEnabledLlmModelRows);
const mockSelectEligible = vi.mocked(selectQualityLargeContextEligibleModels);
const mockSelectRecommended = vi.mocked(selectRecommendedQualityLargeContextEligibleModels);

function ctx(overrides: Partial<{ tenantId: string | null; user: { id: number; role: string } }> = {}) {
  return {
    tenantId: "tenant-1",
    user: { id: 42, role: "user" },
    userToken: null,
    publicUrl: undefined,
    ...overrides,
  };
}

/** Thenable select-chain stub so `await db.select()....where(...).limit(...)` resolves to `rows`. */
function selectChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    groupBy: vi.fn(() => Promise.resolve(rows)),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
  };
  return chain;
}

/** Thenable update-chain stub so `await db.update(...).set(...).where(...).returning()` resolves to `rows`. */
function updateChain(rows: unknown[]) {
  const chain: any = {
    set: vi.fn(() => chain),
    where: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(rows)),
  };
  return chain;
}

const SERIES_ROW_NO_POLICY = {
  id: 10,
  tenantId: "tenant-1",
  userId: 42,
  title: "Corporate Betrayal",
  status: "active",
  llmModelPolicy: null,
};

const SERIES_ROW_WITH_POLICY = {
  id: 10,
  tenantId: "tenant-1",
  userId: 42,
  title: "Corporate Betrayal",
  status: "active",
  llmModelPolicy: {
    defaultModelId: "provider-a/old-model",
  },
};

const ELIGIBLE_ROWS = [
  { modelId: "provider-a/model-a", providerName: "provider-a" },
  { modelId: "provider-b/model-b", providerName: "provider-b" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

// The mocked `protectedProcedure.input()` above is a passthrough (does not
// actually re-validate) — so we independently validate the router's real Zod
// schema shape here via a fresh schema mirroring the mutation's declared
// input. Same convention as `verticalDramaSeries.setSeriesTargetAudienceRegion.test.ts`'s
// own region enum schema mirror.
const setLlmModelPolicyInputSchema = z.object({
  seriesId: z.string().min(1),
  defaultModelId: z.string().min(1).nullable(),
});

describe("setSeriesLlmModelPolicy — input validation", () => {
  it("requires defaultModelId to be present (nullable, not optional)", () => {
    expect(() => setLlmModelPolicyInputSchema.parse({ seriesId: "10" })).toThrow();
  });

  it("accepts defaultModelId as null (automatic) or a non-empty string", () => {
    expect(() =>
      setLlmModelPolicyInputSchema.parse({ seriesId: "10", defaultModelId: null }),
    ).not.toThrow();
    expect(() =>
      setLlmModelPolicyInputSchema.parse({ seriesId: "10", defaultModelId: "provider-a/model-a" }),
    ).not.toThrow();
  });

  it("rejects an empty-string defaultModelId", () => {
    expect(() =>
      setLlmModelPolicyInputSchema.parse({ seriesId: "10", defaultModelId: "" }),
    ).toThrow();
  });
});

describe("listQualityPlanningModels", () => {
  it("joins in a display label, falling back to providerName/modelId when no label row is found", async () => {
    mockLoadEnabledLlmModelRows.mockResolvedValue([] as never);
    mockSelectRecommended.mockReturnValue(ELIGIBLE_ROWS as never);
    // Only ONE of the two eligible model ids has a matching label row —
    // the other must fall back to providerName/modelId.
    mockDb.select.mockReturnValueOnce(
      selectChain([
        {
          modelId: "provider-a/model-a",
          modelName: "Model A",
          providerName: "provider-a",
          providerDisplayName: "Provider A",
        },
      ]),
    );

    const result = await router.listQualityPlanningModels({ ctx: ctx(), input: undefined });

    expect(result).toEqual([
      { modelId: "provider-a/model-a", label: "Provider A — Model A" },
      { modelId: "provider-b/model-b", label: "provider-b — provider-b/model-b" },
    ]);
    // Uses the admin-vetted (isRecommended) selector, not the raw full
    // eligible set — proves the quality-picker narrowing is wired in.
    expect(mockSelectRecommended).toHaveBeenCalledWith([]);
  });

  it("returns [] and never queries the DB for labels when nothing is eligible (recommended set AND its fallback both empty)", async () => {
    mockLoadEnabledLlmModelRows.mockResolvedValue([] as never);
    mockSelectRecommended.mockReturnValue([] as never);

    const result = await router.listQualityPlanningModels({ ctx: ctx(), input: undefined });

    expect(result).toEqual([]);
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("grandfathers input.includeModelId into the list when it's outside the recommended set but still in the full eligible set", async () => {
    mockLoadEnabledLlmModelRows.mockResolvedValue([] as never);
    mockSelectRecommended.mockReturnValue([ELIGIBLE_ROWS[0]] as never); // only model-a is recommended
    mockSelectEligible.mockReturnValue(ELIGIBLE_ROWS as never); // model-a AND model-b are eligible
    mockDb.select.mockReturnValueOnce(selectChain([])); // no label rows — fall back to providerName/modelId

    const result = await router.listQualityPlanningModels({
      ctx: ctx(),
      input: { includeModelId: "provider-b/model-b" }, // an existing series' persisted (non-recommended) pin
    });

    expect(result).toEqual([
      { modelId: "provider-a/model-a", label: "provider-a — provider-a/model-a" },
      { modelId: "provider-b/model-b", label: "provider-b — provider-b/model-b" },
    ]);
  });

  it("does NOT grandfather includeModelId when it isn't in the full eligible set at all (e.g. disabled/removed model)", async () => {
    mockLoadEnabledLlmModelRows.mockResolvedValue([] as never);
    mockSelectRecommended.mockReturnValue([ELIGIBLE_ROWS[0]] as never);
    mockSelectEligible.mockReturnValue([ELIGIBLE_ROWS[0]] as never); // model-b isn't even eligible anymore
    mockDb.select.mockReturnValueOnce(selectChain([]));

    const result = await router.listQualityPlanningModels({
      ctx: ctx(),
      input: { includeModelId: "provider-b/model-b" },
    });

    expect(result).toEqual([
      { modelId: "provider-a/model-a", label: "provider-a — provider-a/model-a" },
    ]);
  });

  it("does not duplicate includeModelId when it's already in the recommended set", async () => {
    mockLoadEnabledLlmModelRows.mockResolvedValue([] as never);
    mockSelectRecommended.mockReturnValue(ELIGIBLE_ROWS as never);
    mockDb.select.mockReturnValueOnce(selectChain([]));

    const result = await router.listQualityPlanningModels({
      ctx: ctx(),
      input: { includeModelId: "provider-a/model-a" },
    });

    expect(result.map((row: { modelId: string }) => row.modelId)).toEqual([
      "provider-a/model-a",
      "provider-b/model-b",
    ]);
    // The full-eligible-set selector is never consulted when nothing needs
    // grandfathering.
    expect(mockSelectEligible).not.toHaveBeenCalled();
  });
});

describe("setSeriesLlmModelPolicy — ownership guard", () => {
  it("throws NOT_FOUND when the series does not belong to the caller's tenant/user", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // loadOwnedSeries lookup — empty

    await expect(
      router.setSeriesLlmModelPolicy({
        ctx: ctx(),
        input: { seriesId: "999", defaultModelId: null },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST for a non-numeric seriesId before any query runs", async () => {
    await expect(
      router.setSeriesLlmModelPolicy({
        ctx: ctx(),
        input: { seriesId: "not-a-number", defaultModelId: null },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

describe("setSeriesLlmModelPolicy — eligibility validation", () => {
  it("rejects a model id that is not in the eligible set with BAD_REQUEST", async () => {
    mockLoadEnabledLlmModelRows.mockResolvedValue([] as never);
    mockSelectEligible.mockReturnValue(ELIGIBLE_ROWS as never);

    await expect(
      router.setSeriesLlmModelPolicy({
        ctx: ctx(),
        input: { seriesId: "10", defaultModelId: "provider-z/not-eligible" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("still validates against the FULL eligible set, NOT the isRecommended-narrowed picker set — a model outside the recommended set (2026-07-31 quality-picker narrowing) is still a valid save (no BAD_REQUEST regression)", async () => {
    mockLoadEnabledLlmModelRows.mockResolvedValue([] as never);
    // "provider-b/model-b" is eligible but would NOT appear in
    // selectRecommendedQualityLargeContextEligibleModels's output — proving
    // this validation path never calls the recommended-narrowed selector.
    mockSelectEligible.mockReturnValue(ELIGIBLE_ROWS as never);
    mockDb.select.mockReturnValueOnce(selectChain([SERIES_ROW_WITH_POLICY])); // loadOwnedSeries
    mockDb.update.mockReturnValueOnce(
      updateChain([
        { ...SERIES_ROW_WITH_POLICY, llmModelPolicy: { defaultModelId: "provider-b/model-b" } },
      ]),
    );

    const result = await router.setSeriesLlmModelPolicy({
      ctx: ctx(),
      input: { seriesId: "10", defaultModelId: "provider-b/model-b" },
    });

    expect(mockSelectRecommended).not.toHaveBeenCalled();
    expect((result.series as any).llmModelPolicy.defaultModelId).toBe("provider-b/model-b");
  });

  it("accepts null without ever running the eligibility check", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([SERIES_ROW_WITH_POLICY])); // loadOwnedSeries
    mockDb.update.mockReturnValueOnce(
      updateChain([{ ...SERIES_ROW_WITH_POLICY, llmModelPolicy: { defaultModelId: null } }]),
    );

    const result = await router.setSeriesLlmModelPolicy({
      ctx: ctx(),
      input: { seriesId: "10", defaultModelId: null },
    });

    expect(mockLoadEnabledLlmModelRows).not.toHaveBeenCalled();
    expect(mockSelectEligible).not.toHaveBeenCalled();
    expect((result.series as any).llmModelPolicy.defaultModelId).toBeNull();
  });
});

describe("setSeriesLlmModelPolicy — happy path (whole-column overwrite)", () => {
  it("overwrites the whole llmModelPolicy column with { defaultModelId }, discarding whatever was there before", async () => {
    mockLoadEnabledLlmModelRows.mockResolvedValue([] as never);
    mockSelectEligible.mockReturnValue(ELIGIBLE_ROWS as never);
    mockDb.select.mockReturnValueOnce(selectChain([SERIES_ROW_WITH_POLICY])); // loadOwnedSeries

    const setSpy = vi.fn();
    const chain = updateChain([
      { ...SERIES_ROW_WITH_POLICY, llmModelPolicy: { defaultModelId: "provider-b/model-b" } },
    ]);
    const originalSet = chain.set;
    chain.set = vi.fn((arg: unknown) => {
      setSpy(arg);
      return originalSet(arg);
    });
    mockDb.update.mockReturnValueOnce(chain);

    const result = await router.setSeriesLlmModelPolicy({
      ctx: ctx(),
      input: { seriesId: "10", defaultModelId: "provider-b/model-b" },
    });

    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        llmModelPolicy: { defaultModelId: "provider-b/model-b" },
      }),
    );
    expect((result.series as any).llmModelPolicy.defaultModelId).toBe("provider-b/model-b");
  });

  it("writes a fresh policy object when the series has no policy yet", async () => {
    mockLoadEnabledLlmModelRows.mockResolvedValue([] as never);
    mockSelectEligible.mockReturnValue(ELIGIBLE_ROWS as never);
    mockDb.select.mockReturnValueOnce(selectChain([SERIES_ROW_NO_POLICY])); // loadOwnedSeries

    const setSpy = vi.fn();
    const chain = updateChain([
      { ...SERIES_ROW_NO_POLICY, llmModelPolicy: { defaultModelId: "provider-a/model-a" } },
    ]);
    const originalSet = chain.set;
    chain.set = vi.fn((arg: unknown) => {
      setSpy(arg);
      return originalSet(arg);
    });
    mockDb.update.mockReturnValueOnce(chain);

    const result = await router.setSeriesLlmModelPolicy({
      ctx: ctx(),
      input: { seriesId: "10", defaultModelId: "provider-a/model-a" },
    });

    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        llmModelPolicy: { defaultModelId: "provider-a/model-a" },
      }),
    );
    expect((result.series as any).llmModelPolicy.defaultModelId).toBe("provider-a/model-a");
  });
});
