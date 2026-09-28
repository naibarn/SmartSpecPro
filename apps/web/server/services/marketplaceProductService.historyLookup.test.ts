import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("./vectorize-search", () => ({
  searchImages: vi.fn(),
  searchImagesByBuffer: vi.fn(),
}));

vi.mock("./vectorize-indexing", () => ({
  indexImage: vi.fn(),
}));

const { getDb } = await import("../db");
const { lookupMarketplaceProductHistory } = await import("./marketplaceProductService");

/**
 * Each db.select() call takes the next entry from `results`, in the order the
 * selects are created. lookupMarketplaceProductHistory issues:
 *   0 owner duplicate lookup
 *   1 group duplicate lookup (only when the owner lookup came back empty)
 *   2 recent snapshots / 3 oldest snapshot / 4 snapshot count
 */
function createDbMock(results: unknown[][]) {
  let index = 0;
  return {
    select: () => {
      const resultIndex = index++;
      const builder: Record<string, unknown> = {};
      for (const key of ["from", "innerJoin", "where", "orderBy", "limit"]) {
        builder[key] = () => builder;
      }
      builder.then = (
        resolve: (value: unknown) => unknown,
        reject: (reason: unknown) => unknown
      ) => Promise.resolve(results[resultIndex] ?? []).then(resolve, reject);
      return builder;
    },
  };
}

const auth = { userId: 7 };

describe("lookupMarketplaceProductHistory", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReset();
  });

  it("returns not-found without touching the database when there is no usable identity", async () => {
    const result = await lookupMarketplaceProductHistory(
      { platform: "shopee", externalProductId: "   ", sourceUrl: "" },
      auth
    );

    expect(result.found).toBe(false);
    expect(result.product).toBeNull();
    expect(result.history).toEqual([]);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("returns not-found when the listing has never been saved", async () => {
    vi.mocked(getDb).mockReturnValue(createDbMock([[], []]) as any);

    const result = await lookupMarketplaceProductHistory(
      { platform: "shopee", externalProductId: "p-1" },
      auth
    );

    expect(result.found).toBe(false);
    expect(result.latest).toBeNull();
    expect(result.first).toBeNull();
  });

  it("returns the saved product with normalized latest and first snapshots", async () => {
    const existing = {
      id: "mp-1",
      productName: "Cleanser 200ml",
      shopName: "Beauty Shop",
      platform: "shopee",
      createdAt: new Date("2026-05-01T03:00:00.000Z"),
      updatedAt: new Date("2026-07-20T03:00:00.000Z"),
    };
    const latestRow = {
      id: "mpps-3",
      capturedAt: new Date("2026-07-20T03:00:00.000Z"),
      priceCurrent: "199.00",
      priceOriginal: "299.00",
      currency: "THB",
      commissionRatePercent: "12.50",
      ratingScore: "4.80",
      soldCountNormalized: 5200,
      soldCountText: "5.2k",
      reviewCountNormalized: 910,
      reviewCountText: "910",
    };
    const oldestRow = {
      id: "mpps-1",
      capturedAt: new Date("2026-05-01T03:00:00.000Z"),
      priceCurrent: "215.00",
      priceOriginal: null,
      currency: "THB",
      commissionRatePercent: null,
      ratingScore: "4.60",
      soldCountNormalized: 1200,
      soldCountText: "1.2k",
      reviewCountNormalized: 240,
      reviewCountText: "240",
    };
    vi.mocked(getDb).mockReturnValue(
      createDbMock([
        [existing],
        [latestRow, oldestRow],
        [oldestRow],
        [{ value: 3 }],
      ]) as any
    );

    const result = await lookupMarketplaceProductHistory(
      { platform: "shopee", externalProductId: "p-1", externalShopId: "s-1" },
      auth
    );

    expect(result.found).toBe(true);
    expect(result.product).toMatchObject({
      productId: "mp-1",
      productName: "Cleanser 200ml",
      shopName: "Beauty Shop",
      accessType: "owner",
      productUrl: "/marketplace-capture/products/mp-1",
      snapshotCount: 3,
      firstCapturedAt: "2026-05-01T03:00:00.000Z",
      lastCapturedAt: "2026-07-20T03:00:00.000Z",
    });
    expect(result.latest).toMatchObject({
      capturedAt: "2026-07-20T03:00:00.000Z",
      priceCurrent: 199,
      commissionRatePercent: 12.5,
      ratingScore: 4.8,
      soldCount: 5200,
      soldCountText: "5.2k",
      reviewCount: 910,
    });
    expect(result.first).toMatchObject({
      soldCount: 1200,
      reviewCount: 240,
      commissionRatePercent: null,
      priceOriginal: null,
    });
    expect(result.history).toHaveLength(2);
  });

  it("keeps history bounded by the requested limit", async () => {
    const existing = {
      id: "mp-2",
      productName: "Serum",
      shopName: null,
      platform: "tiktok_shop",
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    };
    const snapshot = {
      id: "mpps-9",
      capturedAt: new Date("2026-06-02T00:00:00.000Z"),
      priceCurrent: null,
      priceOriginal: null,
      currency: null,
      commissionRatePercent: null,
      ratingScore: null,
      soldCountNormalized: null,
      soldCountText: null,
      reviewCountNormalized: null,
      reviewCountText: null,
    };
    vi.mocked(getDb).mockReturnValue(
      createDbMock([[existing], [snapshot], [snapshot], [{ value: 1 }]]) as any
    );

    const result = await lookupMarketplaceProductHistory(
      { platform: "tiktok_shop", sourceUrl: "https://shop.example/p/2" },
      auth,
      { historyLimit: 1 }
    );

    expect(result.found).toBe(true);
    expect(result.history).toHaveLength(1);
    expect(result.latest).toMatchObject({
      currency: "THB",
      soldCount: null,
      reviewCount: null,
    });
  });
});
