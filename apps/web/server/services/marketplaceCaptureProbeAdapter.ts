import {
  buildMarketplaceCapabilitySummary,
  discoverMarketplaceFieldCoverage,
  type MarketplaceProbeItem,
  type MarketplaceProbeResult,
} from "../../shared/marketplaceMcpProbeFixture";
import { getLatestMarketplaceCandidateBatchForKeyword } from "./marketplaceCaptureService";

type Actor = {
  tenantId: string;
  userId: number;
};

type CandidateBatchRow = {
  id: string;
  sourceUrl: string;
  categoryName: string | null;
  createdAt: Date | string;
};

type CandidateItemRow = {
  id: string;
  title: string;
  sourceUrl: string;
  externalProductId: string | null;
  externalShopId: string | null;
  priceText: string | null;
  soldCountText: string | null;
  discountText: string | null;
  imageUrl: string | null;
  badgesJson: string[] | null;
  score: number;
  position: number | null;
  rawJson: Record<string, unknown> | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/,/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function dateToIso(value: Date | string | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }
  return new Date().toISOString();
}

function parsePriceText(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/[,฿บาท\s]/g, "");
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePercentText(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function parseCountText(value: string | null | undefined): number | null {
  if (!value) return null;
  const compact = value.replace(/,/g, "").replace(/\s+/g, "");
  const match = compact.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  let parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return null;
  if (/ล้าน|m/i.test(compact)) parsed *= 1_000_000;
  else if (/หมื่น/.test(compact)) parsed *= 10_000;
  else if (/พัน|k/i.test(compact)) parsed *= 1_000;
  return Math.round(parsed);
}

function shopeeImageUrl(value: string | null): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://down-th.img.susercontent.com/file/${value}`;
}

function extractShopName(raw: Record<string, unknown>): string {
  return firstString(raw.sellerName, raw.shopName, raw.shop_name, raw.storeName, raw.mallName) ?? "";
}

function extractBrand(raw: Record<string, unknown>): string | null {
  return firstString(raw.brand, raw.brandName, raw.brand_name);
}

function isOfficialLike(item: CandidateItemRow, raw: Record<string, unknown>) {
  const badgeText = [...(item.badgesJson ?? []), firstString(raw.badge, raw.badges, raw.shopBadge)].join(" ").toLowerCase();
  return /official|mall|verified|preferred|ร้านทางการ|shopee mall/i.test(badgeText);
}

function toCoverageRaw(item: CandidateItemRow, normalized: MarketplaceProbeItem) {
  const raw = item.rawJson ?? {};
  const images = Array.isArray(raw.imageUrls) ? raw.imageUrls : [];
  return {
    item_card_displayed_asset: {
      name: normalized.title,
      image: item.imageUrl,
      images,
      display_price: { price: normalized.price },
      rating: { rating_text: firstString(raw.ratingText, raw.rating_text) },
      sold_count: { text: item.soldCountText },
      shop_location: firstString(raw.shopLocation, raw.shop_location),
    },
    item_data: {
      itemid: normalized.itemId,
      shopid: normalized.shopId,
      global_brand: normalized.brand ? { display_name: normalized.brand } : undefined,
      item_card_display_price: {
        price: normalized.price,
        original_price: normalized.originalPrice,
        discount: normalized.discount,
      },
      item_card_display_sold_count: {
        historical_sold_count: normalized.historicalSoldCount,
        monthly_sold_count: normalized.monthlySoldCount,
      },
      item_rating: {
        rating_star: normalized.rating,
        rating_count: normalized.reviewCount,
      },
      shop_data: { shop_name: normalized.sellerName },
      shopee_verified: normalized.shopeeVerified,
    },
    search_item_tracking: {
      merge_rank: normalized.rank,
      item_type_str: item.score >= 80 ? "high_confidence_extension_candidate" : "extension_candidate",
    },
    extension_capture: {
      candidateItemId: item.id,
      score: item.score,
      scoreReasons: item.rawJson?.scoreReasons,
      sourceUrl: item.sourceUrl,
      raw,
    },
  };
}

export function buildShopeeProbeFromMarketplaceCandidateBatch(input: {
  keyword: string;
  region: string;
  locale: string;
  limit: number;
  batch: CandidateBatchRow;
  items: CandidateItemRow[];
}): MarketplaceProbeResult {
  const selectedItems = input.items.slice(0, Math.max(1, Math.min(input.limit, 25)));
  const normalizedItems: MarketplaceProbeItem[] = selectedItems.map((item, index) => {
    const raw = isRecord(item.rawJson) ? item.rawJson : {};
    const price = firstNumber(raw.priceCurrent, raw.price, raw.priceValue) ?? parsePriceText(item.priceText) ?? 0;
    const originalPrice = firstNumber(raw.originalPrice, raw.originalPriceValue) ?? parsePriceText(firstString(raw.originalPriceText));
    const soldCount = firstNumber(raw.soldCountValue, raw.historicalSoldCount) ?? parseCountText(item.soldCountText);
    const monthlySold = firstNumber(raw.monthlySoldCount, raw.monthlySoldCountNormalized);
    const rating = firstNumber(raw.ratingScore, raw.rating, raw.ratingStar) ?? firstNumber(firstString(raw.ratingText));
    const reviewCount = firstNumber(raw.reviewCount, raw.reviewCountNormalized) ?? parseCountText(firstString(raw.reviewCountText));
    return {
      rank: item.position && item.position > 0 ? item.position : index + 1,
      title: item.title,
      sellerName: extractShopName(raw),
      brand: extractBrand(raw),
      price,
      originalPrice,
      discount: firstNumber(raw.discountPercent, raw.discount) ?? parsePercentText(item.discountText),
      monthlySoldCount: monthlySold,
      historicalSoldCount: soldCount,
      rating,
      reviewCount,
      shopeeVerified: isOfficialLike(item, raw),
      estimatedDeliveryTimeText: firstString(raw.estimatedDeliveryTimeText, raw.deliveryText),
      image: shopeeImageUrl(item.imageUrl ?? firstString(raw.imageUrl, raw.image)),
      itemId: firstNumber(item.externalProductId, raw.itemId, raw.itemid, raw.externalProductId) ?? 0,
      shopId: firstNumber(item.externalShopId, raw.shopId, raw.shopid, raw.externalShopId) ?? 0,
      raw: {
        ...raw,
        candidateItemId: item.id,
        candidateBatchId: input.batch.id,
        sourceUrl: item.sourceUrl,
        priceText: item.priceText,
        soldCountText: item.soldCountText,
        discountText: item.discountText,
        badges: item.badgesJson ?? [],
        score: item.score,
      },
    };
  });
  const coverageRawItems = selectedItems.map((item, index) => toCoverageRaw(item, normalizedItems[index]));
  const fieldCoverage = discoverMarketplaceFieldCoverage(coverageRawItems);
  const sourceCapturedAt = dateToIso(input.batch.createdAt);
  return {
    provider: "shopee",
    source: "extension_capture",
    keyword: input.keyword,
    locale: input.locale,
    region: input.region,
    capturedAt: new Date().toISOString(),
    sourceCapturedAt,
    capabilityVersion: "shopee-search.extension-candidate-batch.v1",
    itemCount: normalizedItems.length,
    latencyMs: 0,
    items: normalizedItems,
    fieldCoverage,
    capabilitySummary: buildMarketplaceCapabilitySummary(fieldCoverage),
    notes: [
      `Loaded from Marketplace Capture candidate batch ${input.batch.id}.`,
      "This is real browser-assisted extension data, not fixture data.",
      "Fields reflect what the extension captured from the visible search/category page.",
    ],
  };
}

export async function findLatestShopeeExtensionCaptureProbe(
  actor: Actor,
  input: { keyword: string; region: string; locale: string; limit: number },
): Promise<MarketplaceProbeResult | null> {
  if (!process.env.DATABASE_URL) return null;
  const batch = await getLatestMarketplaceCandidateBatchForKeyword(
    { platform: "shopee", keyword: input.keyword, limit: input.limit },
    actor,
  );
  if (!batch) return null;
  return buildShopeeProbeFromMarketplaceCandidateBatch({
    ...input,
    batch: batch.batch,
    items: batch.items,
  });
}
