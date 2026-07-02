import { z } from "zod";
import {
  buildMarketplaceCapabilitySummary,
  discoverMarketplaceFieldCoverage,
  type MarketplaceProbeItem,
  type MarketplaceProbeResult,
} from "./marketplaceMcpProbeFixture";

const unknownRecordSchema = z.record(z.string(), z.unknown());

export const openAiHostedShopeeSourceMetadataSchema = z.object({
  executionHost: z.literal("openai_chatgpt").default("openai_chatgpt"),
  upstreamAppId: z.string().trim().max(160).optional(),
  upstreamToolName: z.string().trim().max(160).optional(),
  hostConversationId: z.string().trim().max(160).optional(),
  hostSessionHash: z.string().trim().max(160).optional(),
  requestId: z.string().trim().max(160).optional(),
  sourceUrl: z.string().trim().max(1024).optional(),
  sourceFreshness: z.string().trim().max(80).optional(),
  country: z.string().trim().max(10).optional(),
});

export const openAiHostedShopeeWritebackItemSchema = z.object({
  rank: z.coerce.number().int().positive().optional(),
  position: z.coerce.number().int().positive().optional(),
  title: z.string().trim().max(600).optional(),
  name: z.string().trim().max(600).optional(),
  productName: z.string().trim().max(600).optional(),
  image: z.string().trim().max(1024).nullable().optional(),
  imageUrl: z.string().trim().max(1024).nullable().optional(),
  images: z.array(z.string().trim().max(1024)).optional(),
  itemid: z.union([z.string(), z.number()]).optional(),
  itemId: z.union([z.string(), z.number()]).optional(),
  shopid: z.union([z.string(), z.number()]).optional(),
  shopId: z.union([z.string(), z.number()]).optional(),
  catid: z.union([z.string(), z.number()]).optional(),
  price: z.union([z.string(), z.number()]).optional(),
  priceCurrent: z.union([z.string(), z.number()]).optional(),
  originalPrice: z.union([z.string(), z.number()]).nullable().optional(),
  original_price: z.union([z.string(), z.number()]).nullable().optional(),
  strikethrough_price: z.union([z.string(), z.number()]).nullable().optional(),
  discount: z.union([z.string(), z.number()]).nullable().optional(),
  historicalSoldCount: z.union([z.string(), z.number()]).nullable().optional(),
  historical_sold_count: z.union([z.string(), z.number()]).nullable().optional(),
  monthlySoldCount: z.union([z.string(), z.number()]).nullable().optional(),
  monthly_sold_count: z.union([z.string(), z.number()]).nullable().optional(),
  soldText: z.string().trim().max(160).nullable().optional(),
  rating: z.union([z.string(), z.number()]).nullable().optional(),
  ratingScore: z.union([z.string(), z.number()]).nullable().optional(),
  rating_star: z.union([z.string(), z.number()]).nullable().optional(),
  reviewCount: z.union([z.string(), z.number()]).nullable().optional(),
  rating_count: z.union([z.string(), z.number(), z.array(z.unknown())]).nullable().optional(),
  sellerName: z.string().trim().max(240).nullable().optional(),
  shopName: z.string().trim().max(240).nullable().optional(),
  brand: z.string().trim().max(180).nullable().optional(),
  brandName: z.string().trim().max(180).nullable().optional(),
  shopeeVerified: z.boolean().optional(),
  shopee_verified: z.boolean().optional(),
  estimatedDeliveryTimeText: z.string().trim().max(160).nullable().optional(),
  estimated_delivery_time_text: z.string().trim().max(160).nullable().optional(),
  sourceUrl: z.string().trim().max(1024).nullable().optional(),
  raw: unknownRecordSchema.optional(),
}).passthrough();

export const openAiHostedShopeeWritebackSchema = z.object({
  platform: z.literal("shopee").default("shopee"),
  sourceProvider: z.literal("openai_hosted_shopee_mcp"),
  keyword: z.string().trim().min(1).max(120),
  region: z.string().trim().min(2).max(10).default("TH"),
  locale: z.string().trim().min(2).max(20).default("th-TH"),
  capturedAt: z.string().datetime().optional(),
  sourceCapturedAt: z.string().datetime().optional(),
  sourceMetadata: openAiHostedShopeeSourceMetadataSchema.default({ executionHost: "openai_chatgpt" }),
  items: z.array(openAiHostedShopeeWritebackItemSchema).min(1).max(100),
  rawPayload: unknownRecordSchema.optional(),
  idempotencyKey: z.string().trim().max(160).optional(),
});

export type OpenAiHostedShopeeWriteback = z.infer<typeof openAiHostedShopeeWritebackSchema>;

function getPath(record: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, record);
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/[,\s฿บาท]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toInteger(value: unknown): number | null {
  const number = toNumber(value);
  return number === null ? null : Math.round(number);
}

function normalizeShopeePrice(value: unknown, sourceIsRawMinorUnit: boolean): number | null {
  const number = toNumber(value);
  if (number === null) return null;
  if (sourceIsRawMinorUnit || Math.abs(number) >= 1_000_000) {
    return Math.round((number / 100_000) * 100) / 100;
  }
  return Math.round(number * 100) / 100;
}

function toShopeeMinorUnit(value: unknown): unknown {
  const number = toNumber(value);
  if (number === null) return value;
  return Math.abs(number) >= 1_000_000 ? Math.round(number) : Math.round(number * 100_000);
}

function normalizeReviewCount(value: unknown): number | null {
  if (Array.isArray(value)) return toInteger(value[0]);
  return toInteger(value);
}

function itemRawInput(item: z.infer<typeof openAiHostedShopeeWritebackItemSchema>): Record<string, unknown> {
  return item.raw && typeof item.raw === "object" ? { ...item.raw } : { ...item };
}

function rawShopeeShape(item: z.infer<typeof openAiHostedShopeeWritebackItemSchema>, rank: number): Record<string, unknown> {
  const raw = itemRawInput(item);
  if (getPath(raw, "item_data.itemid") || getPath(raw, "item_basic.itemid")) {
    return raw;
  }

  const itemId = firstDefined(item.itemid, item.itemId, getPath(raw, "itemid"), getPath(raw, "itemId"));
  const shopId = firstDefined(item.shopid, item.shopId, getPath(raw, "shopid"), getPath(raw, "shopId"));
  const title = firstDefined(item.title, item.name, item.productName, getPath(raw, "title"), getPath(raw, "name"));
  const price = firstDefined(item.priceCurrent, item.price, getPath(raw, "price"));
  const originalPrice = firstDefined(item.originalPrice, item.original_price, item.strikethrough_price, getPath(raw, "original_price"));
  const sellerName = firstDefined(item.sellerName, item.shopName, getPath(raw, "shop_name"));
  const brand = firstDefined(item.brandName, item.brand, getPath(raw, "brand"));
  const rating = firstDefined(item.ratingScore, item.rating, item.rating_star, getPath(raw, "rating_star"));
  const ratingCount = firstDefined(item.reviewCount, item.rating_count, getPath(raw, "rating_count"));
  const historicalSold = firstDefined(item.historicalSoldCount, item.historical_sold_count, getPath(raw, "historical_sold_count"));
  const monthlySold = firstDefined(item.monthlySoldCount, item.monthly_sold_count, getPath(raw, "monthly_sold_count"));
  const verified = firstDefined(item.shopeeVerified, item.shopee_verified, getPath(raw, "shopee_verified"));
  const image = firstDefined(item.imageUrl, item.image, getPath(raw, "image"));

  return {
    item_card_displayed_asset: {
      name: title,
      image,
      images: item.images,
      estimated_delivery_time: {
        estimated_delivery_time_text: firstDefined(item.estimatedDeliveryTimeText, item.estimated_delivery_time_text),
      },
      sold_count: { text: item.soldText },
      rating: { rating_text: rating === undefined ? undefined : String(rating) },
    },
    item_data: {
      itemid: toInteger(itemId) ?? rank,
      shopid: toInteger(shopId) ?? 0,
      catid: toInteger(firstDefined(item.catid, getPath(raw, "catid"))) ?? null,
      global_brand: { display_name: brand },
      item_card_display_price: {
        price: toShopeeMinorUnit(price),
        original_price: toShopeeMinorUnit(originalPrice),
        strikethrough_price: toShopeeMinorUnit(item.strikethrough_price),
        discount: firstDefined(item.discount, getPath(raw, "discount")),
      },
      item_card_display_sold_count: {
        historical_sold_count: historicalSold,
        monthly_sold_count: monthlySold,
      },
      item_rating: {
        rating_star: rating,
        rating_count: Array.isArray(ratingCount) ? ratingCount : [ratingCount],
      },
      shop_data: { shop_name: sellerName },
      shopee_verified: Boolean(verified),
    },
    search_item_tracking: {
      merge_rank: rank,
      matched_keywords: [],
      item_type_str: "organic",
    },
    source_url: item.sourceUrl,
    _openai_hosted_writeback_input: raw,
  };
}

function probeItemFromRaw(raw: Record<string, unknown>, rank: number): MarketplaceProbeItem {
  const itemBasic = getPath(raw, "item_basic");
  const rawMinorUnit = Boolean(getPath(raw, "item_data.item_card_display_price.price"));
  const price = firstDefined(
    getPath(raw, "item_data.item_card_display_price.price"),
    getPath(raw, "item_basic.price"),
    getPath(raw, "price"),
  );
  const originalPrice = firstDefined(
    getPath(raw, "item_data.item_card_display_price.original_price"),
    getPath(raw, "item_basic.price_before_discount"),
    getPath(raw, "original_price"),
  );
  const ratingCount = firstDefined(
    getPath(raw, "item_data.item_rating.rating_count"),
    getPath(raw, "item_basic.rating_count"),
    getPath(raw, "rating_count"),
  );

  return {
    rank,
    title: String(firstDefined(getPath(raw, "item_card_displayed_asset.name"), getPath(raw, "item_basic.name"), getPath(raw, "name")) ?? ""),
    sellerName: String(firstDefined(getPath(raw, "item_data.shop_data.shop_name"), getPath(raw, "item_basic.shop_name"), getPath(raw, "shop_name")) ?? ""),
    brand: String(firstDefined(getPath(raw, "item_data.global_brand.display_name"), getPath(raw, "item_basic.brand"), getPath(raw, "brand")) ?? "") || null,
    price: normalizeShopeePrice(price, rawMinorUnit) ?? 0,
    originalPrice: normalizeShopeePrice(originalPrice, rawMinorUnit),
    discount: toNumber(firstDefined(
      getPath(raw, "item_data.item_card_display_price.discount"),
      getPath(raw, "item_basic.raw_discount"),
      getPath(raw, "discount"),
    )),
    monthlySoldCount: toInteger(firstDefined(
      getPath(raw, "item_data.item_card_display_sold_count.monthly_sold_count"),
      getPath(raw, "monthly_sold_count"),
    )),
    historicalSoldCount: toInteger(firstDefined(
      getPath(raw, "item_data.item_card_display_sold_count.historical_sold_count"),
      getPath(raw, "item_basic.historical_sold"),
      getPath(raw, "historical_sold_count"),
    )),
    rating: toNumber(firstDefined(
      getPath(raw, "item_data.item_rating.rating_star"),
      getPath(raw, "item_basic.rating_star"),
      getPath(raw, "rating_star"),
    )),
    reviewCount: normalizeReviewCount(ratingCount),
    shopeeVerified: Boolean(firstDefined(getPath(raw, "item_data.shopee_verified"), getPath(raw, "item_basic.shopee_verified"), getPath(raw, "shopee_verified"))),
    estimatedDeliveryTimeText: String(getPath(raw, "item_card_displayed_asset.estimated_delivery_time.estimated_delivery_time_text") || "") || null,
    image: String(firstDefined(getPath(raw, "item_card_displayed_asset.image"), getPath(raw, "item_basic.image"), getPath(raw, "image")) ?? "") || null,
    itemId: toInteger(firstDefined(getPath(raw, "item_data.itemid"), getPath(raw, "item_basic.itemid"), getPath(raw, "itemid"))) ?? rank,
    shopId: toInteger(firstDefined(getPath(raw, "item_data.shopid"), getPath(raw, "item_basic.shopid"), getPath(raw, "shopid"))) ?? 0,
    raw: itemBasic && typeof itemBasic === "object" ? { ...raw, _normalized_from_item_basic: itemBasic } : raw,
  };
}

export function createOpenAiHostedShopeeProbe(input: OpenAiHostedShopeeWriteback): MarketplaceProbeResult {
  const capturedAt = new Date().toISOString();
  const rawItems = input.items.map((item, index) => rawShopeeShape(item, item.rank ?? item.position ?? index + 1));
  const fieldCoverage = discoverMarketplaceFieldCoverage(rawItems);

  return {
    provider: "shopee",
    source: "openai_hosted_shopee_mcp",
    keyword: input.keyword,
    locale: input.locale,
    region: input.region,
    capturedAt,
    sourceCapturedAt: input.sourceCapturedAt ?? input.capturedAt ?? capturedAt,
    capabilityVersion: "openai-hosted-shopee-mcp.writeback.v1",
    itemCount: rawItems.length,
    latencyMs: 0,
    items: rawItems.map((raw, index) => probeItemFromRaw(raw, index + 1)),
    fieldCoverage,
    capabilitySummary: buildMarketplaceCapabilitySummary(fieldCoverage),
    notes: [
      "Shopee search result was obtained by the OpenAI-hosted Shopee app and written back to SmartSpecPro.",
      `executionHost=${input.sourceMetadata.executionHost}`,
      input.sourceMetadata.upstreamAppId ? `upstreamAppId=${input.sourceMetadata.upstreamAppId}` : "",
      input.idempotencyKey ? `idempotencyKey=${input.idempotencyKey}` : "",
    ].filter(Boolean),
  };
}
