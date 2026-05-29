export type MarketplacePlatform = "shopee" | "tiktok_shop";
export type PageType = "product" | "category" | "search" | "shop" | "unknown";
export type MarketplaceUrlFormat =
  | "seo_url"
  | "product_url"
  | "shop_home"
  | "category_url"
  | "pdp_url"
  | "view_product_url"
  | "not_found";

export interface ImageCandidate {
  url: string;
  kind: "main" | "description" | "review" | "related" | "unknown";
  source: "dom" | "screenshot" | "manual" | "remote";
  evidenceId?: string;
  role?: "primary" | "gallery" | "description" | "review" | "related" | "unknown";
  quality?: "high" | "medium" | "low" | "unknown";
  position?: number;
  width?: number;
  height?: number;
  selected?: boolean;
  metadata?: Record<string, unknown>;
}

export interface FieldEvidence {
  text: string;
  source: string;
  confidence: number;
  selector?: string;
  normalized?: unknown;
  warning?: string;
}

export interface CategoryProductCandidate {
  platform: MarketplacePlatform;
  sourceUrl: string;
  externalProductId: string | null;
  externalShopId: string | null;
  title: string;
  url: string;
  priceText: string | null;
  originalPriceText?: string | null;
  discountText?: string | null;
  soldCountText?: string | null;
  soldCountValue?: number | null;
  ratingText?: string | null;
  commissionRatePercent?: number | null;
  commissionRateText?: string | null;
  affiliateUrl?: string | null;
  affiliateLinkAvailable?: boolean | null;
  affiliateCardKey?: string | null;
  imageUrl?: string | null;
  originalUrl?: string;
  cleanUrl?: string;
  canonicalUrl?: string | null;
  urlFormat?: MarketplaceUrlFormat;
  badges: string[];
  position: number;
  boundingBox?: Record<string, number>;
  score: number;
  scoreReasons: string[];
}

export interface ProductCapturePayload {
  platform: MarketplacePlatform;
  sourceUrl: string;
  originalSourceUrl?: string;
  cleanSourceUrl?: string;
  canonicalSourceUrl?: string | null;
  sourceUrlFormat?: MarketplaceUrlFormat;
  affiliateUrl?: string | null;
  affiliateMatch?: {
    candidateKey: string;
    basis: "externalProductId" | "url";
    confidence: number;
    listSourceUrl?: string;
    matchedAt: string;
  } | null;
  pageType: PageType;
  externalProductId: string | null;
  externalShopId: string | null;
  pageTitle: string;
  productName: string | null;
  priceCurrentText: string | null;
  priceCurrentValue?: number | null;
  priceOriginalText: string | null;
  priceOriginalValue?: number | null;
  currency?: string | null;
  discountText: string | null;
  discountPercent?: number | null;
  commissionRatePercent?: number | null;
  commissionRateText?: string | null;
  ratingScoreText: string | null;
  ratingScoreValue?: number | null;
  reviewCountText: string | null;
  reviewCountValue?: number | null;
  soldCountText: string | null;
  soldCountValue?: number | null;
  shopName: string | null;
  isMall: boolean | null;
  categoryText?: string | null;
  categoryPath?: string[];
  brandText?: string | null;
  stockText?: string | null;
  variantsText?: string | null;
  sellerLocationText?: string | null;
  descriptionText: string | null;
  specificationText: string | null;
  imageCandidates: ImageCandidate[];
  fieldEvidence?: Record<string, FieldEvidence>;
  fieldWarnings?: string[];
  rawDomText: string;
  htmlBlocks: Array<{ name: string; text: string; outerHTML?: string; metadata?: Record<string, unknown> }>;
}

export interface PageDetection {
  platform: MarketplacePlatform | null;
  pageType: PageType;
  title: string;
  url: string;
}
