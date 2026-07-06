/**
 * Vertical Drama Series — `listProductImages` query coverage (2026-07-06
 * product-reference picker upgrade).
 *
 * Same "mock the whole module graph, test the exported procedure handler
 * directly" convention as `verticalDramaSeries.listSeriesLinkedImageUrls.test.ts`.
 * Covers:
 *  - Ownership guard: NOT_FOUND for a series that doesn't belong to the
 *    caller's tenant/user.
 *  - BAD_REQUEST for a non-numeric seriesId before any query runs.
 *  - Happy path: unions the full Marketplace Capture image set with the
 *    series' direct `productImageUrl`, capture images first.
 *  - Graceful [] when there's no tie-in config / no capture / no direct URL.
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

const listAvailableProductReferenceImagesMock = vi.fn();
vi.mock("../../services/verticalDramaProductTieIn", () => ({
  listAvailableProductReferenceImages: (...args: unknown[]) =>
    listAvailableProductReferenceImagesMock(...args),
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

function seriesRow(productTieIn: Record<string, unknown> | null) {
  return {
    id: 10,
    tenantId: "tenant-1",
    userId: 42,
    title: "Corporate Betrayal",
    status: "active",
    productTieIn,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listProductImages — input/ownership guards", () => {
  it("throws BAD_REQUEST for a non-numeric seriesId before any query runs", async () => {
    await expect(
      router.listProductImages({
        ctx: ctx(),
        input: { seriesId: "not-a-number" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the series does not belong to the caller's tenant/user", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // loadOwnedSeries lookup — empty

    await expect(
      router.listProductImages({
        ctx: ctx(),
        input: { seriesId: "999" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(listAvailableProductReferenceImagesMock).not.toHaveBeenCalled();
  });
});

describe("listProductImages — happy path", () => {
  it("returns the union list from listAvailableProductReferenceImages, passing through productImageUrl + marketplaceCaptureId + tenant/user scope", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([
        seriesRow({
          enabled: true,
          productImageUrl: "https://cdn.example.test/direct.png",
          marketplaceCaptureId: "capture-1",
        }),
      ]),
    );
    listAvailableProductReferenceImagesMock.mockResolvedValue([
      { url: "https://cdn.example.test/capture-1.png", source: "capture", label: "hero" },
      { url: "https://cdn.example.test/capture-2.png", source: "capture" },
      { url: "https://cdn.example.test/direct.png", source: "direct" },
    ]);

    const result = await router.listProductImages({
      ctx: ctx(),
      input: { seriesId: "10" },
    });

    expect(result.images).toEqual([
      { url: "https://cdn.example.test/capture-1.png", source: "capture", label: "hero" },
      { url: "https://cdn.example.test/capture-2.png", source: "capture" },
      { url: "https://cdn.example.test/direct.png", source: "direct" },
    ]);
    expect(listAvailableProductReferenceImagesMock).toHaveBeenCalledWith({
      productImageUrl: "https://cdn.example.test/direct.png",
      marketplaceCaptureId: "capture-1",
      auth: { userId: 42, tenantId: "tenant-1" },
    });
  });

  it("returns [] gracefully when the series has no productTieIn config at all", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow(null)]));
    listAvailableProductReferenceImagesMock.mockResolvedValue([]);

    const result = await router.listProductImages({
      ctx: ctx(),
      input: { seriesId: "10" },
    });

    expect(result.images).toEqual([]);
    expect(listAvailableProductReferenceImagesMock).toHaveBeenCalledWith({
      productImageUrl: undefined,
      marketplaceCaptureId: undefined,
      auth: { userId: 42, tenantId: "tenant-1" },
    });
  });

  it("never leaks a cross-tenant series' images — ownership is enforced before listAvailableProductReferenceImages runs", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // loadOwnedSeries — not found for this caller

    await expect(
      router.listProductImages({
        ctx: ctx({ tenantId: "tenant-b" }),
        input: { seriesId: "10" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(listAvailableProductReferenceImagesMock).not.toHaveBeenCalled();
  });
});
