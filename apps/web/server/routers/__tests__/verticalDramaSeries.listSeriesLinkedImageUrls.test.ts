/**
 * Vertical Drama Series — `listSeriesLinkedImageUrls` query coverage
 * (2026-07-05, project-scoped media panel filter, work item 3b).
 *
 * Same "mock the whole module graph, test the exported procedure handler
 * directly" convention as `verticalDramaSeries.deleteSeries.test.ts`. Covers:
 *  - Ownership guard: NOT_FOUND for a series that doesn't belong to the
 *    caller's tenant/user (never disclosed via FORBIDDEN).
 *  - BAD_REQUEST for a non-numeric seriesId before any query runs.
 *  - Happy path: unions character-asset URLs, shot-reference URLs,
 *    startFramePlan `approvedMediaAssetId` (resolved via a follow-up
 *    `mediaAssets` lookup) and `angleGrid.imageUrl`, deduped.
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
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

const SERIES_ROW = {
  id: 10,
  tenantId: "tenant-1",
  userId: 42,
  title: "Corporate Betrayal",
  status: "active",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listSeriesLinkedImageUrls — input/ownership guards", () => {
  it("throws BAD_REQUEST for a non-numeric seriesId before any query runs", async () => {
    await expect(
      router.listSeriesLinkedImageUrls({
        ctx: ctx(),
        input: { seriesId: "not-a-number" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the series does not belong to the caller's tenant/user", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // loadOwnedSeries lookup — empty

    await expect(
      router.listSeriesLinkedImageUrls({
        ctx: ctx(),
        input: { seriesId: "999" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("listSeriesLinkedImageUrls — happy path", () => {
  it("unions character-asset, shot-reference, approved-frame, and angle-grid URLs, deduped", async () => {
    let selectCall = 0;
    mockDb.select.mockImplementation(() => {
      selectCall += 1;
      // Call order in the router: loadOwnedSeries, characterAssetUrlRows,
      // shotReferenceUrlRows, episodeRows, then (only if approvedAssetIds
      // non-empty) the approvedAssetRows follow-up lookup.
      switch (selectCall) {
        case 1:
          return selectChain([SERIES_ROW]); // loadOwnedSeries
        case 2:
          return selectChain([
            { url: "https://cdn.example/character-portrait.png" },
            { url: "https://cdn.example/shared-duplicate.png" },
          ]); // characterAssetUrlRows
        case 3:
          return selectChain([
            { url: "https://cdn.example/shot-reference.png" },
            { url: "https://cdn.example/shared-duplicate.png" }, // duplicate of a character asset URL
          ]); // shotReferenceUrlRows
        case 4:
          return selectChain([
            {
              startFramePlan: {
                mode: "single_frame_per_shot",
                selectedImageModelId: "model-x",
                frames: [
                  {
                    shotNumber: 1,
                    imagePrompt: "p",
                    negativePrompt: "",
                    requiredCharacterRefs: [],
                    productReferenceAssetIds: [],
                    approvedMediaAssetId: "501",
                  },
                  {
                    shotNumber: 2,
                    imagePrompt: "p2",
                    negativePrompt: "",
                    requiredCharacterRefs: [],
                    productReferenceAssetIds: [],
                    angleGrid: { imageUrl: "https://cdn.example/angle-grid.png" },
                  },
                ],
              },
            },
          ]); // episodeRows
        case 5:
          return selectChain([{ id: 501, url: "https://cdn.example/approved-frame.png" }]); // approvedAssetRows
        default:
          return selectChain([]);
      }
    });

    const result = await router.listSeriesLinkedImageUrls({
      ctx: ctx(),
      input: { seriesId: "10" },
    });

    expect(result.imageUrls).toEqual(
      expect.arrayContaining([
        "https://cdn.example/character-portrait.png",
        "https://cdn.example/shared-duplicate.png",
        "https://cdn.example/shot-reference.png",
        "https://cdn.example/angle-grid.png",
        "https://cdn.example/approved-frame.png",
      ]),
    );
    // Deduped — "shared-duplicate.png" appears in both character-asset and
    // shot-reference sources but only once in the final union.
    expect(result.imageUrls.filter((u: string) => u === "https://cdn.example/shared-duplicate.png")).toHaveLength(1);
    expect(result.imageUrls).toHaveLength(5);
  });

  it("skips the approved-asset follow-up lookup when no frame has an approvedMediaAssetId", async () => {
    let selectCall = 0;
    mockDb.select.mockImplementation(() => {
      selectCall += 1;
      switch (selectCall) {
        case 1:
          return selectChain([SERIES_ROW]);
        case 2:
          return selectChain([]); // characterAssetUrlRows
        case 3:
          return selectChain([]); // shotReferenceUrlRows
        case 4:
          return selectChain([
            {
              startFramePlan: {
                mode: "single_frame_per_shot",
                selectedImageModelId: "model-x",
                frames: [
                  {
                    shotNumber: 1,
                    imagePrompt: "p",
                    negativePrompt: "",
                    requiredCharacterRefs: [],
                    productReferenceAssetIds: [],
                  },
                ],
              },
            },
          ]); // episodeRows — no approvedMediaAssetId, no angleGrid
        default:
          return selectChain([]);
      }
    });

    const result = await router.listSeriesLinkedImageUrls({
      ctx: ctx(),
      input: { seriesId: "10" },
    });

    expect(result.imageUrls).toEqual([]);
    // Only 4 select calls: loadOwnedSeries, characterAssets, shotReferences, episodes
    // — no 5th call for the approved-asset follow-up lookup.
    expect(selectCall).toBe(4);
  });
});
