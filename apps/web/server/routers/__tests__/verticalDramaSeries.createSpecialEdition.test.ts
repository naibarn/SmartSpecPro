/**
 * Vertical Drama Series — `create`'s special-edition `productTieIn` handling
 * (Stage 2.5, `planning/vd-series-memory-and-lineage/plan.md`). Same
 * "mock the whole module graph, test the exported procedure handler
 * directly" convention as `verticalDramaSeries.createLineage.test.ts`. Covers:
 *  - `createMode: "sequel"` (and original/no createMode): `productTieIn` is
 *    written through completely UNVALIDATED — the critical regression test,
 *    proving this task's change is special_edition-only.
 *  - `createMode: "special_edition"`: the persisted `productTieIn` satisfies
 *    the full `VerticalDramaProductTieInConfig` contract (disclosurePolicy,
 *    maxEpisodesWithTieInPerTenEpisodes, allowedStoryFunctions,
 *    requireHumanApproval, referenceAssetIds all populated).
 *  - uploaded reference images register as media assets and land in
 *    `referenceAssetIds`.
 *  - a media-asset registration failure never fails series creation
 *    (best-effort).
 *  - `marketplaceCaptureId`/`productImageUrl` pass through verbatim
 *    (untouched sibling keys, not part of the validated contract).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => {
  const db: any = {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
    instance: {},
  };
  // `create` now runs the insert + cast/location clone for any resolved
  // parent (sequel or special edition) inside ONE `db.transaction` — see
  // `verticalDramaSeries.createLineage.test.ts`'s identical fake for the
  // full rationale. The fake `tx` handle IS this same mock `db`, so every
  // `mockDb.insert.mock.results[...]` assertion below still finds its call.
  db.transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(db));
  return { mockDb: db };
});
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

const { mockGetTenantFeatureFlags } = vi.hoisted(() => ({
  mockGetTenantFeatureFlags: vi.fn(),
}));
vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));

vi.mock("../../services/verticalDramaSeriesLineage", () => ({
  loadLineageContext: vi.fn(),
}));

const { mockCloneSeriesCastForLineage } = vi.hoisted(() => ({
  mockCloneSeriesCastForLineage: vi.fn(),
}));
vi.mock("../../services/verticalDramaSeriesClone", () => ({
  cloneSeriesCastForLineage: mockCloneSeriesCastForLineage,
}));

vi.mock("../../services/verticalDramaSeasonCarryOver", () => ({
  synthesizeSeasonCarryOver: vi.fn(),
  SeasonCarryOverInputError: class extends Error {},
}));

vi.mock("../../services/verticalDramaSpecialEdition", () => ({
  synthesizeSpecialEditionBrief: vi.fn(),
  composeSpecialEditionUserPremise: vi.fn(),
  SpecialEditionInputError: class extends Error {},
}));

const { mockCreateAssetFromAttachment } = vi.hoisted(() => ({
  mockCreateAssetFromAttachment: vi.fn(),
}));
vi.mock("../../services/mediaAssetService", () => ({
  createAssetFromAttachment: mockCreateAssetFromAttachment,
}));

import { verticalDramaSeriesRouter } from "../verticalDramaSeries";

const router = verticalDramaSeriesRouter as unknown as Record<string, Function>;

function ctx() {
  return {
    tenantId: "tenant-1",
    user: { id: 42, role: "user" },
    userToken: null,
    publicUrl: undefined,
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

const PARENT_ROW = {
  id: 16,
  tenantId: "tenant-1",
  userId: 42,
  title: "Season 1",
  locale: "th",
  genre: "romance",
  tone: "dramatic",
  bible: {},
  memory: null,
  parentSeriesId: null,
  createMode: null,
  seasonNumber: null,
  lineage: null,
};

const INSERTED_ROW = {
  id: 20,
  tenantId: "tenant-1",
  userId: 42,
  title: "My Special",
  locale: "th",
  aspectRatio: "9:16",
  status: "draft",
  targetEpisodeCount: 2,
  defaultEpisodeDurationSeconds: 60,
  genre: null,
  tone: null,
  targetAudience: null,
  agePolicyId: null,
  bible: null,
  memory: null,
  productTieIn: null,
  policy: null,
  parentSeriesId: 16,
  createMode: "special_edition",
  seasonNumber: null,
  lineage: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

function insertedProductTieIn() {
  return (mockDb.insert.mock.results[0].value as any).values.mock.calls[0][0]
    .productTieIn;
}

describe("create — special-edition productTieIn (Stage 2.5)", () => {
  it("sequel mode: productTieIn is written through completely UNVALIDATED — critical regression test", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesLineage: true });
    mockDb.select.mockReturnValueOnce(selectChain([PARENT_ROW]));
    mockDb.insert.mockReturnValueOnce(insertChain([{ ...INSERTED_ROW, createMode: "sequel" }]));
    mockCloneSeriesCastForLineage.mockResolvedValue({});

    const incompleteConfig = { enabled: true, productName: "whatever" };
    await router.create({
      ctx: ctx(),
      input: {
        title: "My Sequel",
        parentSeriesId: "16",
        createMode: "sequel",
        productTieIn: incompleteConfig,
      },
    });

    expect(insertedProductTieIn()).toEqual(incompleteConfig);
    expect(mockCreateAssetFromAttachment).not.toHaveBeenCalled();
  });

  it("original mode (no createMode): productTieIn is written through completely UNVALIDATED", async () => {
    mockDb.insert.mockReturnValueOnce(insertChain([{ ...INSERTED_ROW, createMode: null, parentSeriesId: null }]));

    const incompleteConfig = { enabled: true };
    await router.create({
      ctx: ctx(),
      input: { title: "My Series", productTieIn: incompleteConfig },
    });

    expect(insertedProductTieIn()).toEqual(incompleteConfig);
  });

  it("special_edition + flag OFF: parentSeriesRow never resolves, productTieIn stays UNVALIDATED (byte-identical original path)", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesLineage: false });
    mockDb.insert.mockReturnValueOnce(insertChain([INSERTED_ROW]));

    const incompleteConfig = { enabled: true };
    await router.create({
      ctx: ctx(),
      input: {
        title: "My Special",
        parentSeriesId: "16",
        createMode: "special_edition",
        productTieIn: incompleteConfig,
      },
    });

    expect(insertedProductTieIn()).toEqual(incompleteConfig);
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("special_edition + flag ON + owned parent: builds a FULLY POPULATED, contract-valid productTieIn", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesLineage: true });
    mockDb.select.mockReturnValueOnce(selectChain([PARENT_ROW]));
    mockDb.insert.mockReturnValueOnce(insertChain([INSERTED_ROW]));
    mockCloneSeriesCastForLineage.mockResolvedValue({});

    await router.create({
      ctx: ctx(),
      input: {
        title: "My Special",
        parentSeriesId: "16",
        createMode: "special_edition",
        targetEpisodeCount: 1,
        productTieIn: {
          storyFunctionChoice: "tie_in_solution",
          marketplaceCaptureId: "cap_123",
          productName: "Riverside Hotel",
          regulatedCategory: "health",
        },
      },
    });

    const persisted = insertedProductTieIn();
    expect(persisted.disclosurePolicy).toBe("caption_disclosure");
    expect(persisted.maxEpisodesWithTieInPerTenEpisodes).toBe(10);
    expect(persisted.allowedStoryFunctions).toEqual([
      "plot_clue",
      "memory_trigger",
      "relationship_token",
    ]);
    expect(persisted.requireHumanApproval).toBe(true); // regulatedCategory: "health"
    expect(persisted.productSource).toBe("marketplace");
    expect(persisted.marketplaceCaptureId).toBe("cap_123"); // passed through verbatim, not part of the strict contract
    expect(Array.isArray(persisted.referenceAssetIds)).toBe(true);
  });

  it("uploaded reference images (source 2) register as media assets and land in referenceAssetIds", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesLineage: true });
    mockDb.select.mockReturnValueOnce(selectChain([PARENT_ROW]));
    mockDb.insert.mockReturnValueOnce(insertChain([INSERTED_ROW]));
    mockCloneSeriesCastForLineage.mockResolvedValue({});
    mockCreateAssetFromAttachment
      .mockResolvedValueOnce({ assetId: 501 })
      .mockResolvedValueOnce({ assetId: 502 });

    await router.create({
      ctx: ctx(),
      input: {
        title: "My Special",
        parentSeriesId: "16",
        createMode: "special_edition",
        productTieIn: {
          storyFunctionChoice: "review",
          uploadedReferences: [
            { url: "https://x/a.jpg", mimeType: "image/jpeg", fileName: "a.jpg" },
            { url: "https://x/b.jpg", mimeType: "image/jpeg", fileName: "b.jpg" },
          ],
        },
      },
    });

    expect(mockCreateAssetFromAttachment).toHaveBeenCalledTimes(2);
    expect(mockCreateAssetFromAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ type: "image", url: "https://x/a.jpg" }),
      expect.objectContaining({ tenantId: "tenant-1", userId: 42 }),
    );
    const persisted = insertedProductTieIn();
    expect(persisted.referenceAssetIds).toEqual(["501", "502"]);
    expect(persisted.productSource).toBe("uploaded_reference");
  });

  it("a media-asset registration failure never fails series creation (best-effort)", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesLineage: true });
    mockDb.select.mockReturnValueOnce(selectChain([PARENT_ROW]));
    mockDb.insert.mockReturnValueOnce(insertChain([INSERTED_ROW]));
    mockCloneSeriesCastForLineage.mockResolvedValue({});
    mockCreateAssetFromAttachment.mockRejectedValue(new Error("upload service down"));

    const result = await router.create({
      ctx: ctx(),
      input: {
        title: "My Special",
        parentSeriesId: "16",
        createMode: "special_edition",
        productTieIn: {
          uploadedReferences: [{ url: "https://x/a.jpg", mimeType: "image/jpeg" }],
        },
      },
    });

    expect(result.series.id).toBe(String(INSERTED_ROW.id));
    const persisted = insertedProductTieIn();
    expect(persisted.referenceAssetIds).toEqual([]);
  });
});
