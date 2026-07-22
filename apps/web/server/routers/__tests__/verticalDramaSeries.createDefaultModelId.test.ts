/**
 * Vertical Drama Series — `create`'s `defaultModelId` field (LLM model
 * pin ATOMICALLY persisted at series-creation time, so the wizard's
 * immediate background `generateStory` mutation resolves the pinned model
 * instead of racing a follow-up `setSeriesLlmModelPolicy` call).
 *
 * Same "mock the whole module graph, test the exported procedure handler
 * directly" convention as `verticalDramaSeries.userPremise.test.ts` /
 * `verticalDramaSeries.llmModelPolicy.test.ts`. The eligibility check reuses
 * the EXACT same helpers `setSeriesLlmModelPolicy` uses
 * (`loadEnabledLlmModelRows` / `selectQualityLargeContextEligibleModels`),
 * mocked as black boxes here per that file's own convention.
 *
 * Covers:
 *  - omitting `defaultModelId` -> `llmModelPolicy.defaultModelId === null`
 *    (automatic), behavior-preserving, no eligibility DB round-trip.
 *  - explicit `null` -> same as omitted.
 *  - a non-eligible `defaultModelId` -> BAD_REQUEST, insert never runs.
 *  - an eligible `defaultModelId` -> persists into
 *    `insertValues.llmModelPolicy.defaultModelId` atomically in the same
 *    insert.
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

vi.mock("../../services/enabledLlmModels", () => ({
  loadEnabledLlmModelRows: vi.fn(),
}));

vi.mock("../../services/verticalDramaImproveScript", () => ({
  selectQualityLargeContextEligibleModels: vi.fn(),
}));

import { verticalDramaSeriesRouter } from "../verticalDramaSeries";
import { loadEnabledLlmModelRows } from "../../services/enabledLlmModels";
import { selectQualityLargeContextEligibleModels } from "../../services/verticalDramaImproveScript";

const router = verticalDramaSeriesRouter as unknown as Record<string, Function>;
const mockLoadEnabledLlmModelRows = vi.mocked(loadEnabledLlmModelRows);
const mockSelectEligible = vi.mocked(selectQualityLargeContextEligibleModels);

function ctx(overrides: Partial<{ tenantId: string | null; user: { id: number; role: string } }> = {}) {
  return {
    tenantId: "tenant-1",
    user: { id: 42, role: "user" },
    userToken: null,
    publicUrl: undefined,
    ...overrides,
  };
}

function insertChain(returned: unknown[]) {
  const chain: any = {
    values: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(returned)),
  };
  return chain;
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
  llmModelPolicy: null,
};

const ELIGIBLE_ROWS = [
  { modelId: "provider-a/model-a", providerName: "provider-a" },
  { modelId: "provider-b/model-b", providerName: "provider-b" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("create — defaultModelId (atomic LLM model pin at creation time)", () => {
  it("omitting defaultModelId persists llmModelPolicy.defaultModelId === null (automatic), with no eligibility DB round-trip", async () => {
    mockDb.insert.mockReturnValueOnce(insertChain([INSERTED_ROW]));

    await router.create({ ctx: ctx(), input: { title: "My Series" } });

    expect(mockLoadEnabledLlmModelRows).not.toHaveBeenCalled();
    expect(mockSelectEligible).not.toHaveBeenCalled();
    const insertedValues = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(insertedValues.llmModelPolicy).toEqual({ defaultModelId: null });
  });

  it("explicit null behaves the same as omitted — no eligibility check, automatic", async () => {
    mockDb.insert.mockReturnValueOnce(insertChain([INSERTED_ROW]));

    await router.create({
      ctx: ctx(),
      input: { title: "My Series", defaultModelId: null },
    });

    expect(mockLoadEnabledLlmModelRows).not.toHaveBeenCalled();
    const insertedValues = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(insertedValues.llmModelPolicy).toEqual({ defaultModelId: null });
  });

  it("rejects a non-eligible defaultModelId with BAD_REQUEST before any insert runs", async () => {
    mockLoadEnabledLlmModelRows.mockResolvedValue([] as never);
    mockSelectEligible.mockReturnValue(ELIGIBLE_ROWS as never);

    await expect(
      router.create({
        ctx: ctx(),
        input: { title: "My Series", defaultModelId: "provider-z/not-eligible" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("persists an eligible defaultModelId into llmModelPolicy.defaultModelId atomically in the same insert", async () => {
    mockLoadEnabledLlmModelRows.mockResolvedValue([] as never);
    mockSelectEligible.mockReturnValue(ELIGIBLE_ROWS as never);
    mockDb.insert.mockReturnValueOnce(
      insertChain([{ ...INSERTED_ROW, llmModelPolicy: { defaultModelId: "provider-a/model-a" } }]),
    );

    await router.create({
      ctx: ctx(),
      input: { title: "My Series", defaultModelId: "provider-a/model-a" },
    });

    const insertedValues = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(insertedValues.llmModelPolicy).toEqual({ defaultModelId: "provider-a/model-a" });
  });
});
