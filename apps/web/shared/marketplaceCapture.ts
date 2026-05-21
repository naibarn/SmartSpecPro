import { z } from "zod";

export const marketplacePlatforms = ["shopee", "tiktok_shop"] as const;
export const marketplacePageTypes = ["product", "category", "search", "shop", "unknown"] as const;
export const marketplaceCaptureStatuses = [
  "captured",
  "uploading_assets",
  "analyzing",
  "analyzed",
  "confirmed",
  "failed",
  "discarded",
] as const;
export const marketplaceAssetKinds = [
  "screenshot",
  "main_image",
  "description_image",
  "review_image",
  "html_snapshot",
  "raw_payload",
  "category_grid_screenshot",
] as const;
export const marketplaceUrlFormats = [
  "seo_url",
  "product_url",
  "shop_home",
  "category_url",
  "pdp_url",
  "view_product_url",
  "not_found",
] as const;

export const MARKETPLACE_CAPTURE_DEFAULTS = {
  platform: "shopee",
  maxCategoryCards: 60,
  maxRecommendedCards: 20,
  minRecommendedScore: 50,
  maxScreenshots: 6,
  maxMainImages: 12,
  maxDescriptionImages: 20,
  screenshotFormat: "png",
  screenshotQuality: 0.92,
  scrollDelayMs: 800,
  thumbnailClickDelayMs: 500,
  llmLanguage: "th",
} as const;

export const MARKETPLACE_CAPTURE_LIMITS = {
  maxCategoryCards: 100,
  maxScrollSteps: 8,
  maxScreenshots: 8,
  maxImageCandidates: 50,
  maxDomTextChars: 80_000,
  maxHtmlBlockChars: 20_000,
  maxUploadBytes: 10 * 1024 * 1024,
  maxCaptureBytes: 50 * 1024 * 1024,
} as const;

export const domRectLikeSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  top: z.number().optional(),
  left: z.number().optional(),
  right: z.number().optional(),
  bottom: z.number().optional(),
}).passthrough();

export const htmlBlockSchema = z.object({
  name: z.string().min(1).max(100),
  text: z.string().max(MARKETPLACE_CAPTURE_LIMITS.maxHtmlBlockChars).optional().default(""),
  outerHTML: z.string().max(MARKETPLACE_CAPTURE_LIMITS.maxHtmlBlockChars).optional(),
  metadata: z.record(z.unknown()).optional().default({}),
});

export const imageCandidateSchema = z.object({
  url: z.string().min(1).max(4096),
  kind: z.enum(["main", "description", "review", "related", "unknown"]).default("unknown"),
  source: z.enum(["dom", "screenshot", "manual", "remote"]).default("dom"),
  position: z.number().int().min(0).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  selected: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const categoryCandidateSchema = z.object({
  platform: z.enum(marketplacePlatforms),
  sourceUrl: z.string().url(),
  externalProductId: z.string().max(128).nullable().optional(),
  externalShopId: z.string().max(128).nullable().optional(),
  title: z.string().min(1).max(1000),
  url: z.string().url(),
  priceText: z.string().max(128).nullable().optional(),
  originalPriceText: z.string().max(128).nullable().optional(),
  discountText: z.string().max(64).nullable().optional(),
  soldCountText: z.string().max(128).nullable().optional(),
  ratingText: z.string().max(128).nullable().optional(),
  imageUrl: z.string().max(4096).nullable().optional(),
  originalUrl: z.string().max(4096).optional(),
  cleanUrl: z.string().max(4096).optional(),
  canonicalUrl: z.string().max(4096).nullable().optional(),
  urlFormat: z.enum(marketplaceUrlFormats).optional(),
  badges: z.array(z.string().max(80)).default([]),
  position: z.number().int().min(0).default(0),
  boundingBox: domRectLikeSchema.optional(),
  score: z.number().int().min(0).max(100).default(0),
  scoreReasons: z.array(z.string().max(200)).default([]),
});

export const createMarketplaceCaptureDraftSchema = z.object({
  platform: z.enum(marketplacePlatforms),
  sourceUrl: z.string().url(),
  originalSourceUrl: z.string().max(4096).optional(),
  cleanSourceUrl: z.string().max(4096).optional(),
  canonicalSourceUrl: z.string().max(4096).nullable().optional(),
  sourceUrlFormat: z.enum(marketplaceUrlFormats).optional(),
  pageType: z.enum(marketplacePageTypes),
  externalProductId: z.string().max(128).nullable().optional(),
  externalShopId: z.string().max(128).nullable().optional(),
  pageTitle: z.string().max(1000).nullable().optional(),
  domText: z.string().max(MARKETPLACE_CAPTURE_LIMITS.maxDomTextChars).optional().default(""),
  htmlBlocks: z.array(htmlBlockSchema).max(30).optional().default([]),
  imageCandidates: z.array(imageCandidateSchema).max(MARKETPLACE_CAPTURE_LIMITS.maxImageCandidates).optional().default([]),
  rawPayload: z.record(z.unknown()).optional().default({}),
  categoryContext: z.record(z.unknown()).optional(),
});

export const analyzeMarketplaceCaptureSchema = z.object({
  modelPreference: z.string().max(100).optional().default("vision_best_available"),
  forceRerun: z.boolean().optional().default(false),
  language: z.string().max(16).optional().default("th"),
  options: z.object({
    extractIngredients: z.boolean().optional().default(true),
    extractClaims: z.boolean().optional().default(true),
    extractPrice: z.boolean().optional().default(true),
    classifyImages: z.boolean().optional().default(true),
  }).optional().default({}),
});

export const marketplaceConfirmProductSchema = z.object({
  product: z.object({
    productName: z.string().min(1).max(1000),
    brand: z.string().max(300).nullable().optional(),
    shopName: z.string().max(300).nullable().optional(),
    isMall: z.boolean().nullable().optional(),
    price: z.object({
      current: z.number().nullable().optional(),
      original: z.number().nullable().optional(),
      currency: z.string().max(16).optional().default("THB"),
      discountText: z.string().max(64).nullable().optional(),
    }).optional().default({}),
    rating: z.object({
      score: z.number().min(0).max(5).nullable().optional(),
      reviewCountText: z.string().max(128).nullable().optional(),
      soldCountText: z.string().max(128).nullable().optional(),
    }).optional().default({}),
    description: z.object({
      rawText: z.string().optional().default(""),
      ingredients: z.array(z.string()).optional().default([]),
      claims: z.array(z.string()).optional().default([]),
      specs: z.record(z.unknown()).optional().default({}),
    }).optional().default({}),
    images: z.object({
      main: z.array(z.string()).optional().default([]),
      description: z.array(z.string()).optional().default([]),
      review: z.array(z.string()).optional().default([]),
      relatedExcluded: z.array(z.string()).optional().default([]),
      coverAssetId: z.string().nullable().optional(),
    }).optional().default({}),
    platformRawJson: z.record(z.unknown()).optional().default({}),
  }),
});

export const categoryCandidatesUploadSchema = z.object({
  platform: z.enum(marketplacePlatforms),
  sourceUrl: z.string().url(),
  categoryName: z.string().max(500).nullable().optional(),
  sortMode: z.string().max(100).nullable().optional(),
  filters: z.record(z.unknown()).optional().default({}),
  candidates: z.array(categoryCandidateSchema).max(MARKETPLACE_CAPTURE_LIMITS.maxCategoryCards),
});

export type MarketplacePlatform = typeof marketplacePlatforms[number];
export type MarketplacePageType = typeof marketplacePageTypes[number];
export type MarketplaceCaptureStatus = typeof marketplaceCaptureStatuses[number];
export type MarketplaceAssetKind = typeof marketplaceAssetKinds[number];
export type MarketplaceUrlFormat = typeof marketplaceUrlFormats[number];
export type HtmlBlock = z.infer<typeof htmlBlockSchema>;
export type ImageCandidate = z.infer<typeof imageCandidateSchema>;
export type CategoryCandidate = z.infer<typeof categoryCandidateSchema>;
export type CreateMarketplaceCaptureDraftInput = z.infer<typeof createMarketplaceCaptureDraftSchema>;
export type AnalyzeMarketplaceCaptureInput = z.infer<typeof analyzeMarketplaceCaptureSchema>;
export type MarketplaceConfirmProductInput = z.infer<typeof marketplaceConfirmProductSchema>;

export type ShopeeUrlFormat = "seo_url" | "product_url" | "not_found";

export interface ShopeeProductIds {
  shopId: string | null;
  itemId: string | null;
  format: ShopeeUrlFormat;
  originalUrl: string;
  cleanUrl: string;
  canonicalUrl: string | null;
}

export interface TikTokShopUrlParts {
  productId: string | null;
  categorySlug: string | null;
  categoryId: string | null;
  region: string | null;
  format: MarketplaceUrlFormat;
  originalUrl: string;
  cleanUrl: string;
  canonicalUrl: string | null;
}

export function parseThaiPrice(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.replace(/,/g, "").match(/฿\s*(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

export function parseDiscountPercent(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/-(\d+)%/);
  return m ? Number(m[1]) : null;
}

export function parseSoldCount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const text = raw.toLowerCase().replace(/,/g, "").replace(/\s+/g, "");
  const n = text.match(/\d+(?:\.\d+)?/);
  if (!n) return null;
  const value = Number(n[0]);
  if (!Number.isFinite(value)) return null;
  if (/m\+?/.test(text) || /ล้าน/.test(text)) return Math.round(value * 1_000_000);
  if (/k\+?/.test(text) || /พัน/.test(text)) return Math.round(value * 1_000);
  if (/หมื่น/.test(text)) return Math.round(value * 10_000);
  return Math.round(value);
}

export function parseReviewCount(raw: string | null | undefined): number | null {
  return parseSoldCount(raw);
}

export function parseShopeeProductUrl(inputUrl: string): ShopeeProductIds {
  const originalUrl = inputUrl.trim();

  let cleanUrl = originalUrl;
  let hostname = "shopee.co.th";
  let pathname = originalUrl;

  try {
    const parsed = new URL(originalUrl);
    hostname = parsed.hostname;
    pathname = parsed.pathname;
    cleanUrl = `${parsed.origin}${parsed.pathname}`;
  } catch {
    const withoutQuery = originalUrl.split("?")[0] ?? originalUrl;
    const withoutHash = withoutQuery.split("#")[0] ?? withoutQuery;
    pathname = withoutHash;
    cleanUrl = withoutHash;
  }

  const seoMatch = pathname.match(/(?:^|[-/])i\.(\d+)\.(\d+)\/?$/);
  if (seoMatch) {
    const shopId = seoMatch[1];
    const itemId = seoMatch[2];
    return {
      shopId,
      itemId,
      format: "seo_url",
      originalUrl,
      cleanUrl,
      canonicalUrl: `https://${hostname}/product/${shopId}/${itemId}`,
    };
  }

  const productMatch = pathname.match(/\/product\/(\d+)\/(\d+)\/?$/);
  if (productMatch) {
    const shopId = productMatch[1];
    const itemId = productMatch[2];
    return {
      shopId,
      itemId,
      format: "product_url",
      originalUrl,
      cleanUrl,
      canonicalUrl: `https://${hostname}/product/${shopId}/${itemId}`,
    };
  }

  return {
    shopId: null,
    itemId: null,
    format: "not_found",
    originalUrl,
    cleanUrl,
    canonicalUrl: null,
  };
}

export function parseShopeeIds(url: string): { shopId: string | null; itemId: string | null } {
  const parsed = parseShopeeProductUrl(url);
  return { shopId: parsed.shopId, itemId: parsed.itemId };
}

export function parseTikTokShopUrl(inputUrl: string): TikTokShopUrlParts {
  const originalUrl = inputUrl.trim();
  let origin = "https://www.tiktok.com";
  let pathname = originalUrl.split("?")[0]?.split("#")[0] ?? originalUrl;
  let cleanUrl = pathname;

  try {
    const parsed = new URL(originalUrl);
    origin = parsed.origin;
    pathname = parsed.pathname;
    cleanUrl = `${parsed.origin}${parsed.pathname}`;
  } catch {
    if (pathname.startsWith("/")) cleanUrl = `${origin}${pathname}`;
  }

  const pdpMatch = pathname.match(/^\/shop\/([^/]+)\/pdp\/(\d+)\/?$/i);
  if (pdpMatch) {
    const region = pdpMatch[1];
    const productId = pdpMatch[2];
    return {
      productId,
      categorySlug: null,
      categoryId: null,
      region,
      format: "pdp_url",
      originalUrl,
      cleanUrl,
      canonicalUrl: `${origin}/shop/${region}/pdp/${productId}`,
    };
  }

  const viewMatch = pathname.match(/^\/view\/product\/(\d+)\/?$/i);
  if (viewMatch) {
    const productId = viewMatch[1];
    return {
      productId,
      categorySlug: null,
      categoryId: null,
      region: null,
      format: "view_product_url",
      originalUrl,
      cleanUrl,
      canonicalUrl: `${origin}/view/product/${productId}`,
    };
  }

  const categoryMatch = pathname.match(/^\/shop\/([^/]+)\/c\/([^/]+)\/(\d+)\/?$/i);
  if (categoryMatch) {
    const region = categoryMatch[1];
    const categorySlug = categoryMatch[2];
    const categoryId = categoryMatch[3];
    return {
      productId: null,
      categorySlug,
      categoryId,
      region,
      format: "category_url",
      originalUrl,
      cleanUrl,
      canonicalUrl: `${origin}/shop/${region}/c/${categorySlug}/${categoryId}`,
    };
  }

  const shopHomeMatch = pathname.match(/^\/shop\/([^/]+)\/?$/i);
  if (shopHomeMatch) {
    const region = shopHomeMatch[1];
    return {
      productId: null,
      categorySlug: null,
      categoryId: null,
      region,
      format: "shop_home",
      originalUrl,
      cleanUrl,
      canonicalUrl: `${origin}/shop/${region}`,
    };
  }

  return {
    productId: null,
    categorySlug: null,
    categoryId: null,
    region: null,
    format: "not_found",
    originalUrl,
    cleanUrl,
    canonicalUrl: null,
  };
}

export interface CandidateScoreInput {
  soldCountNormalized: number | null;
  priceCurrent: number | null;
  discountPercent: number | null;
  isMall: boolean;
  hasFreeShippingBadge: boolean;
  hasClearImage: boolean;
  rankOnPage: number;
  titleKeywordMatches: number;
}

export function scoreCandidate(input: CandidateScoreInput): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (input.soldCountNormalized != null && input.soldCountNormalized > 0) {
    const soldScore = Math.min(40, Math.log10(input.soldCountNormalized + 1) * 8);
    score += soldScore;
    reasons.push(`ยอดขายสูง: ${input.soldCountNormalized.toLocaleString("th-TH")}`);
  }
  if (input.discountPercent != null && input.discountPercent >= 30) {
    score += Math.min(15, (input.discountPercent / 100) * 15);
    reasons.push(`ส่วนลด ${input.discountPercent}%`);
  }
  if (input.isMall) {
    score += 15;
    reasons.push("Mall / official badge");
  }
  if (input.priceCurrent != null) {
    score += 10;
    reasons.push("ราคาอ่านได้ชัดเจน");
  }
  if (input.hasFreeShippingBadge) {
    score += 5;
    reasons.push("มี free shipping/promotion badge");
  }
  if (input.hasClearImage) {
    score += 5;
    reasons.push("มีรูปสินค้าชัดเจน");
  }
  if (input.titleKeywordMatches > 0) {
    score += Math.min(10, input.titleKeywordMatches * 2);
    reasons.push("ตรง keyword ที่สนใจ");
  }
  if (input.rankOnPage <= 10) {
    score += 5;
    reasons.push("อยู่ในอันดับบนของหน้า");
  }

  return { score: Math.round(Math.min(100, score)), reasons };
}

export function normalizeTextSnippet(value: string | null | undefined, max = 5000): string {
  return String(value ?? "").replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim().slice(0, max);
}
