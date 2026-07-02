import type { MarketplaceProbeSource } from "./marketplaceIntelligence";

export type MarketplaceFieldUse =
  | "product_identity"
  | "pricing"
  | "sales"
  | "rating_review"
  | "seller_shop"
  | "brand_category"
  | "ranking_search"
  | "logistics"
  | "diagnostics";

export type MarketplaceUsefulField = {
  path: string;
  group: string;
  use: MarketplaceFieldUse;
  label: string;
  analysisValue: string;
  keep: "normalized" | "derived" | "raw_diagnostic";
};

export type MarketplaceFieldCoverage = MarketplaceUsefulField & {
  type: string;
  covered: number;
  total: number;
  percent: number;
  sample: string | number | boolean | null;
};

export type MarketplaceProbeItem = {
  rank: number;
  title: string;
  sellerName: string;
  brand: string | null;
  price: number;
  originalPrice: number | null;
  discount: number | null;
  monthlySoldCount: number | null;
  historicalSoldCount: number | null;
  rating: number | null;
  reviewCount: number | null;
  shopeeVerified: boolean;
  estimatedDeliveryTimeText: string | null;
  image: string | null;
  itemId: number;
  shopId: number;
  raw: Record<string, unknown>;
};

export type MarketplaceCapabilitySummary = {
  product: number;
  pricing: number;
  sales: number;
  ratingReview: number;
  sellerShop: number;
  brandCategory: number;
  rankingSearch: number;
  logistics: number;
  diagnostics: number;
};

export type MarketplaceProbeResult = {
  provider: "shopee";
  source: MarketplaceProbeSource;
  keyword: string;
  locale: string;
  region: string;
  capturedAt: string;
  sourceCapturedAt: string;
  capabilityVersion: string;
  itemCount: number;
  latencyMs: number;
  items: MarketplaceProbeItem[];
  fieldCoverage: MarketplaceFieldCoverage[];
  capabilitySummary: MarketplaceCapabilitySummary;
  notes: string[];
};

export const MARKETPLACE_USEFUL_FIELD_DICTIONARY: MarketplaceUsefulField[] = [
  { path: "item_card_displayed_asset.name", group: "Product", use: "product_identity", label: "Product name", analysisValue: "Hero SKU, title SEO, product matching", keep: "normalized" },
  { path: "item_card_displayed_asset.image", group: "Product", use: "product_identity", label: "Primary image", analysisValue: "Creative audit, content/card preview", keep: "normalized" },
  { path: "item_card_displayed_asset.images", group: "Product", use: "product_identity", label: "Image gallery", analysisValue: "Creative depth and image count signal", keep: "raw_diagnostic" },
  { path: "item_data.itemid", group: "Product", use: "product_identity", label: "Item ID", analysisValue: "Deduplication, SKU lifecycle tracking", keep: "normalized" },
  { path: "item_data.shopid", group: "Product", use: "product_identity", label: "Shop ID", analysisValue: "Seller identity and cross-keyword tracking", keep: "normalized" },
  { path: "item_data.catid", group: "Product", use: "brand_category", label: "Category ID", analysisValue: "Category segmentation", keep: "normalized" },
  { path: "item_data.item_card_display_price.price", group: "Price", use: "pricing", label: "Current price", analysisValue: "Price band, median, undercut detection", keep: "normalized" },
  { path: "item_data.item_card_display_price.original_price", group: "Price", use: "pricing", label: "Original price", analysisValue: "Discount depth and promo baseline", keep: "normalized" },
  { path: "item_data.item_card_display_price.strikethrough_price", group: "Price", use: "pricing", label: "Strikethrough price", analysisValue: "Promotion display strategy", keep: "normalized" },
  { path: "item_data.item_card_display_price.discount", group: "Price", use: "pricing", label: "Discount percent", analysisValue: "Promo intensity and price-war alerts", keep: "derived" },
  { path: "item_data.item_card_display_price.promotion_id", group: "Price", use: "pricing", label: "Promotion ID", analysisValue: "Campaign continuity tracking", keep: "raw_diagnostic" },
  { path: "item_data.item_card_display_price.promotion_type", group: "Price", use: "pricing", label: "Promotion type", analysisValue: "Campaign type classification", keep: "raw_diagnostic" },
  { path: "item_data.item_card_display_sold_count.historical_sold_count", group: "Sales", use: "sales", label: "Historical sold", analysisValue: "Long-term demand signal", keep: "normalized" },
  { path: "item_data.item_card_display_sold_count.monthly_sold_count", group: "Sales", use: "sales", label: "Monthly sold", analysisValue: "Recent demand and hero SKU scoring", keep: "normalized" },
  { path: "item_card_displayed_asset.sold_count.text", group: "Sales", use: "sales", label: "Sold text", analysisValue: "Human-readable sales badge", keep: "raw_diagnostic" },
  { path: "item_data.item_rating.rating_star", group: "Rating/review", use: "rating_review", label: "Rating star", analysisValue: "Trust score and quality gap", keep: "normalized" },
  { path: "item_data.item_rating.rating_count", group: "Rating/review", use: "rating_review", label: "Rating count", analysisValue: "Review volume and social proof", keep: "normalized" },
  { path: "item_card_displayed_asset.rating.rating_text", group: "Rating/review", use: "rating_review", label: "Rating text", analysisValue: "Display-level rating verification", keep: "raw_diagnostic" },
  { path: "item_data.shop_data.shop_name", group: "Seller/shop", use: "seller_shop", label: "Shop name", analysisValue: "Seller visibility and competitor watch", keep: "normalized" },
  { path: "item_data.shopee_verified", group: "Seller/shop", use: "seller_shop", label: "Verified shop", analysisValue: "Official-like trust signal", keep: "normalized" },
  { path: "item_card_displayed_asset.shop_location", group: "Seller/shop", use: "seller_shop", label: "Shop location", analysisValue: "Local/import seller segmentation", keep: "raw_diagnostic" },
  { path: "item_data.global_brand.display_name", group: "Brand/category", use: "brand_category", label: "Brand name", analysisValue: "Brand share of shelf", keep: "normalized" },
  { path: "item_data.global_cat.catid", group: "Brand/category", use: "brand_category", label: "Global category path", analysisValue: "Category hierarchy mapping", keep: "raw_diagnostic" },
  { path: "search_item_tracking.merge_rank", group: "Ranking/search", use: "ranking_search", label: "Merge rank", analysisValue: "Search visibility and rank volatility", keep: "derived" },
  { path: "search_item_tracking.matched_keywords", group: "Ranking/search", use: "ranking_search", label: "Matched keywords", analysisValue: "SEO matching and keyword fit", keep: "raw_diagnostic" },
  { path: "search_item_tracking.relevance_level", group: "Ranking/search", use: "ranking_search", label: "Relevance level", analysisValue: "Marketplace relevance scoring", keep: "derived" },
  { path: "search_item_tracking.item_type_str", group: "Ranking/search", use: "ranking_search", label: "Item type", analysisValue: "Organic/ad/surface classification", keep: "derived" },
  { path: "item_card_displayed_asset.estimated_delivery_time.estimated_delivery_time_text", group: "Logistics", use: "logistics", label: "Estimated delivery", analysisValue: "Delivery competitiveness", keep: "normalized" },
  { path: "item_data.label_ids", group: "Diagnostics/raw", use: "diagnostics", label: "Label IDs", analysisValue: "Badge/campaign diagnostics", keep: "raw_diagnostic" },
  { path: "bff_meta", group: "Diagnostics/raw", use: "diagnostics", label: "BFF metadata", analysisValue: "Connector locale/country/runtime evidence", keep: "raw_diagnostic" },
];

const bffMeta = {
  country: "TH",
  env: "live",
  language: "th",
  locale: "TH",
  user_agent: "marketplace-connector/1.0.0",
};

const rawItems = [
  {
    item_card_displayed_asset: {
      name: "Ottai M8 CGM 1 ครบชุด-พรีเซลล์",
      image: "cn-11134207-820l4-mleew8w1itqa76",
      images: ["cn-11134207-820l4-mleew8w1itqa76", "cn-11134207-820l4-mleew29ebpj8e2"],
      display_price: { price: 108000000 },
      estimated_delivery_time: { estimated_delivery_time_text: "3-5 วัน" },
      rating: { rating_text: "4.9" },
      sold_count: { text: "ขายแล้ว 3พัน+ ชิ้น" },
      shop_location: "",
    },
    item_data: {
      itemid: 48756732614,
      shopid: 1418373937,
      catid: 100001,
      global_brand: { display_name: "Ottai" },
      global_cat: { catid: [100001, 100019, 100139] },
      item_card_display_price: { price: 108000000, original_price: 190500000, strikethrough_price: 190500000, discount: 43, promotion_id: 475714281751251, promotion_type: 301 },
      item_card_display_sold_count: { historical_sold_count: 3838, monthly_sold_count: 1362 },
      item_rating: { rating_count: [1086, 5, 3, 6, 50, 1022], rating_star: 4.916206261510129 },
      shop_data: { shop_name: "Ottai Health Global" },
      shopee_verified: false,
      label_ids: [1908622, 1000028, 2058593, 1000110],
    },
    search_item_tracking: { merge_rank: 487, matched_keywords: ["cgm"], relevance_level: 1, item_type_str: "organic" },
    bff_meta: bffMeta,
  },
  {
    item_card_displayed_asset: {
      name: "เครื่องวัดนำ้ตาลแบบต่อเนื่อง CGM [รุ่นใหม่] แบรนด์ Sinocare รุ่น iCan i6 แบบ Realtime ต่อเนื่อง15วัน",
      image: "th-11134207-81zth-mpqvt57oqhohe1",
      images: ["th-11134207-81zth-mpqvt57oqhohe1", "th-11134207-81zte-mmnna7qngrus55"],
      display_price: { price: 167000000 },
      rating: { rating_text: "4.9" },
      sold_count: { text: "ขายแล้ว 963 ชิ้น" },
      shop_location: "",
    },
    item_data: {
      itemid: 49108253795,
      shopid: 1557540752,
      catid: 100001,
      global_brand: { display_name: "Sinocare(ซิโนแคร์)" },
      global_cat: { catid: [100001, 100018, 100121, 100424] },
      item_card_display_price: { price: 167000000, original_price: 259000000, strikethrough_price: 259000000, discount: 36, promotion_id: 886547403423744, promotion_type: 301 },
      item_card_display_sold_count: { historical_sold_count: 963, monthly_sold_count: 423 },
      item_rating: { rating_count: [257, 2, 1, 2, 5, 247], rating_star: 4.9221789883268485 },
      shop_data: { shop_name: "HealthTheory & Co." },
      shopee_verified: true,
      label_ids: [1000028, 1908622, 1001365, 1000110],
    },
    search_item_tracking: { merge_rank: 438, matched_keywords: ["cgm"], relevance_level: 2, item_type_str: "organic" },
    bff_meta: bffMeta,
  },
  {
    item_card_displayed_asset: {
      name: "Sinocare iCan CGM เครื่องวัดระดับน้ําตาลในเลือดแบบต่อเนื่อง ตรวจได้ 15 วัน โดยไม่ต้องเจาะปลายนิ้ว รู้ผลตรวจทุกๆ 3 นาที",
      image: "th-11134207-7ra0t-mdmzqj4zcc1a31",
      images: ["th-11134207-7ra0t-mdmzqj4zcc1a31", "th-11134207-7r992-lwpfbhuummr464"],
      display_price: { price: 161400000 },
      estimated_delivery_time: { estimated_delivery_time_text: "2-3 วัน" },
      rating: { rating_text: "4.8" },
      sold_count: { text: "ขายแล้ว 6พัน+ ชิ้น" },
      shop_location: "",
    },
    item_data: {
      itemid: 24556542593,
      shopid: 791925750,
      catid: 100001,
      global_brand: { display_name: "Sinocare(ซิโนแคร์)" },
      global_cat: { catid: [100001, 100018, 100121, 100424] },
      item_card_display_price: { price: 161400000, original_price: 169900000, strikethrough_price: 169900000, discount: 5, promotion_id: 469532947198355, promotion_type: 502 },
      item_card_display_sold_count: { historical_sold_count: 6467, monthly_sold_count: 276 },
      item_rating: { rating_count: [1631, 41, 15, 15, 79, 1481], rating_star: 4.805282555282555 },
      shop_data: { shop_name: "Sinocare ซิโนแคร์ประเทศไทย" },
      shopee_verified: false,
      label_ids: [844931064601283, 844931086908638, 1428713, 1718087960],
    },
    search_item_tracking: { merge_rank: 439, matched_keywords: ["cgm"], relevance_level: 2, item_type_str: "organic" },
    bff_meta: bffMeta,
  },
  {
    item_card_displayed_asset: {
      name: "Ottai M8 CGM อุปกรณ์เพื่อสุขภาพโรคเบาหวานเซ็นเซอร์กลูโคส",
      image: "cn-11134207-7ras8-mbc5n28zl3uh56",
      images: ["cn-11134207-7ras8-mbc5n28zl3uh56", "cn-11134207-7ras8-m3lphomkhoayb9"],
      display_price: { price: 99000000 },
      estimated_delivery_time: { estimated_delivery_time_text: "3-5 วัน" },
      rating: { rating_text: "4.9" },
      sold_count: { text: "ขายแล้ว 10พัน+ ชิ้น" },
      shop_location: "",
    },
    item_data: {
      itemid: 26919549102,
      shopid: 1418373937,
      catid: 100001,
      global_brand: { display_name: "Ottai" },
      global_cat: { catid: [100001, 100019, 100139] },
      item_card_display_price: { price: 99000000, original_price: 190500000, strikethrough_price: 190500000, discount: 48, promotion_id: 474616909218034, promotion_type: 202 },
      item_card_display_sold_count: { historical_sold_count: 10153, monthly_sold_count: 1376 },
      item_rating: { rating_count: [3388, 30, 10, 20, 157, 3171], rating_star: 4.897519196692262 },
      shop_data: { shop_name: "Ottai Health Global" },
      shopee_verified: false,
      label_ids: [844931064601283, 844931086908638, 1428713, 1718087960],
    },
    search_item_tracking: { merge_rank: 483, matched_keywords: ["cgm"], relevance_level: 2, item_type_str: "organic" },
    bff_meta: bffMeta,
  },
] as const;

function getPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in current) return (current as Record<string, unknown>)[key];
    return undefined;
  }, value);
}

function valueType(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function sampleValue(value: unknown): string | number | boolean | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.length ? `array(${value.length})` : "array(0)";
  if (value && typeof value === "object") return "object";
  return null;
}

export function discoverMarketplaceFieldCoverage(items: readonly Record<string, unknown>[]): MarketplaceFieldCoverage[] {
  return MARKETPLACE_USEFUL_FIELD_DICTIONARY.map((field) => {
    const values = items.map((item) => getPath(item, field.path)).filter((value) => value !== undefined && value !== null && value !== "");
    const firstValue = values[0];
    return {
      ...field,
      type: firstValue === undefined ? "missing" : valueType(firstValue),
      covered: values.length,
      total: items.length,
      percent: items.length ? Math.round((values.length / items.length) * 100) : 0,
      sample: sampleValue(firstValue),
    };
  });
}

export function buildMarketplaceCapabilitySummary(fieldCoverage: MarketplaceFieldCoverage[]): MarketplaceCapabilitySummary {
  const scoreFor = (use: MarketplaceFieldUse) => {
    const rows = fieldCoverage.filter((row) => row.use === use);
    return rows.length ? Math.round(rows.reduce((sum, row) => sum + row.percent, 0) / rows.length) : 0;
  };
  return {
    product: scoreFor("product_identity"),
    pricing: scoreFor("pricing"),
    sales: scoreFor("sales"),
    ratingReview: scoreFor("rating_review"),
    sellerShop: scoreFor("seller_shop"),
    brandCategory: scoreFor("brand_category"),
    rankingSearch: scoreFor("ranking_search"),
    logistics: scoreFor("logistics"),
    diagnostics: scoreFor("diagnostics"),
  };
}

function normalizeItem(raw: Record<string, unknown>, rank: number): MarketplaceProbeItem {
  const price = getPath(raw, "item_data.item_card_display_price.price");
  const ratingCount = getPath(raw, "item_data.item_rating.rating_count");
  return {
    rank,
    title: String(getPath(raw, "item_card_displayed_asset.name") || ""),
    sellerName: String(getPath(raw, "item_data.shop_data.shop_name") || ""),
    brand: String(getPath(raw, "item_data.global_brand.display_name") || "") || null,
    price: typeof price === "number" ? price / 100000 : 0,
    originalPrice: typeof getPath(raw, "item_data.item_card_display_price.original_price") === "number"
      ? Number(getPath(raw, "item_data.item_card_display_price.original_price")) / 100000
      : null,
    discount: typeof getPath(raw, "item_data.item_card_display_price.discount") === "number" ? Number(getPath(raw, "item_data.item_card_display_price.discount")) : null,
    monthlySoldCount: typeof getPath(raw, "item_data.item_card_display_sold_count.monthly_sold_count") === "number" ? Number(getPath(raw, "item_data.item_card_display_sold_count.monthly_sold_count")) : null,
    historicalSoldCount: typeof getPath(raw, "item_data.item_card_display_sold_count.historical_sold_count") === "number" ? Number(getPath(raw, "item_data.item_card_display_sold_count.historical_sold_count")) : null,
    rating: typeof getPath(raw, "item_data.item_rating.rating_star") === "number" ? Number(getPath(raw, "item_data.item_rating.rating_star")) : null,
    reviewCount: Array.isArray(ratingCount) ? Number(ratingCount[0] || 0) : null,
    shopeeVerified: Boolean(getPath(raw, "item_data.shopee_verified")),
    estimatedDeliveryTimeText: String(getPath(raw, "item_card_displayed_asset.estimated_delivery_time.estimated_delivery_time_text") || "") || null,
    image: String(getPath(raw, "item_card_displayed_asset.image") || "") || null,
    itemId: Number(getPath(raw, "item_data.itemid") || 0),
    shopId: Number(getPath(raw, "item_data.shopid") || 0),
    raw,
  };
}

export function createRecordedShopeeMcpProbe(params: {
  keyword?: string;
  locale?: string;
  region?: string;
  limit?: number;
  latencyMs?: number;
  capturedAt?: string;
  sourceCapturedAt?: string;
} = {}): MarketplaceProbeResult {
  const limit = Math.max(1, Math.min(params.limit || rawItems.length, rawItems.length));
  const selectedRawItems = rawItems.slice(0, limit).map((item) => ({ ...item }));
  const fieldCoverage = discoverMarketplaceFieldCoverage(selectedRawItems);
  return {
    provider: "shopee",
    source: "recorded_mcp_sample",
    keyword: params.keyword || "CGM",
    locale: params.locale || "th-TH",
    region: params.region || "TH",
    capturedAt: params.capturedAt ?? new Date().toISOString(),
    sourceCapturedAt: params.sourceCapturedAt ?? "2026-07-01T13:57:00.000Z",
    capabilityVersion: "shopee-search.mcp-recorded-sample.2026-07-01",
    itemCount: selectedRawItems.length,
    latencyMs: params.latencyMs ?? 0,
    items: selectedRawItems.map((item, index) => normalizeItem(item, index + 1)),
    fieldCoverage,
    capabilitySummary: buildMarketplaceCapabilitySummary(fieldCoverage),
    notes: [
      "Recorded from an authorized Shopee search probe for CGM in TH.",
      "Use this sample for field discovery, mapping, UI review, and fixture replay until runtime live connector execution is wired.",
    ],
  };
}
