import { z } from "zod";

export const marketplaceConnectorProviders = ["shopee"] as const;
export const marketplaceConnectorGrantStatuses = [
  "not_connected",
  "pending",
  "active",
  "expired",
  "revoked",
  "scope_missing",
  "provider_unavailable",
] as const;
export const marketplaceProbeSources = [
  "recorded_mcp_sample",
  "live_mcp",
  "openai_hosted_shopee_mcp",
  "fixture",
  "extension_capture",
  "manual_import",
] as const;
export const marketplaceIntelligenceReportTypes = [
  "competitive_landscape",
  "pricing_analysis",
  "seller_visibility",
  "opportunity_finder",
  "content_strategy",
  "keyword_competitive_dashboard",
  "winner_analysis",
  "pricing_intelligence",
  "market_opportunity_finder",
  "executive_image_summary",
  "keyword_product_discovery",
  "multi_day_sku_monitor",
  "shareable_image_summary",
] as const;
export const marketplaceReportAspectRatios = ["1:1", "4:5", "9:16", "16:9"] as const;

export const marketplaceConnectorProviderSchema = z.enum(marketplaceConnectorProviders);
export const marketplaceConnectorGrantStatusSchema = z.enum(marketplaceConnectorGrantStatuses);
export const marketplaceProbeSourceSchema = z.enum(marketplaceProbeSources);
export const marketplaceIntelligenceReportTypeSchema = z.enum(marketplaceIntelligenceReportTypes);
export const marketplaceReportAspectRatioSchema = z.enum(marketplaceReportAspectRatios);

export type MarketplaceConnectorProvider = z.infer<typeof marketplaceConnectorProviderSchema>;
export type MarketplaceConnectorGrantStatus = z.infer<typeof marketplaceConnectorGrantStatusSchema>;
export type MarketplaceProbeSource = z.infer<typeof marketplaceProbeSourceSchema>;
export type MarketplaceIntelligenceReportType = z.infer<typeof marketplaceIntelligenceReportTypeSchema>;
export type MarketplaceReportAspectRatio = z.infer<typeof marketplaceReportAspectRatioSchema>;

export const marketplaceConnectorGrantStatusResponseSchema = z.object({
  provider: marketplaceConnectorProviderSchema,
  status: marketplaceConnectorGrantStatusSchema,
  scopes: z.array(z.string()).default([]),
  providerAccountLabel: z.string().nullable().default(null),
  startedAt: z.string().nullable().default(null),
  expiresAt: z.string().nullable().default(null),
  revokedAt: z.string().nullable().default(null),
  grantHashPrefix: z.string().nullable().default(null),
  authorizationAttemptId: z.string().nullable().default(null),
  message: z.string().nullable().default(null),
});

export type MarketplaceConnectorGrantStatusResponse = z.infer<typeof marketplaceConnectorGrantStatusResponseSchema>;

export const marketplaceIntelligenceSnapshotStatusSchema = z.enum(["ready", "partial", "failed"]);
export const marketplaceIntelligenceHandoffTypeSchema = z.enum(["candidate_batch", "product_enrichment", "report_evidence"]);

export const marketplaceIntelligenceSnapshotItemSchema = z.object({
  rank: z.number().int().positive(),
  title: z.string(),
  sellerName: z.string(),
  brand: z.string().nullable(),
  price: z.number(),
  originalPrice: z.number().nullable(),
  discount: z.number().nullable(),
  monthlySoldCount: z.number().nullable(),
  historicalSoldCount: z.number().nullable(),
  rating: z.number().nullable(),
  reviewCount: z.number().nullable(),
  shopeeVerified: z.boolean(),
  estimatedDeliveryTimeText: z.string().nullable(),
  image: z.string().nullable(),
  itemId: z.number(),
  shopId: z.number(),
});

export const marketplaceIntelligenceSnapshotMetricsSchema = z.object({
  itemCount: z.number().int().nonnegative(),
  officialLikeCount: z.number().int().nonnegative(),
  officialLikeShare: z.number().min(0).max(1),
  averagePrice: z.number().nullable(),
  medianPrice: z.number().nullable(),
  minPrice: z.number().nullable(),
  maxPrice: z.number().nullable(),
  totalMonthlySold: z.number().int().nonnegative(),
  averageRating: z.number().nullable(),
  shareOfShelfByBrand: z.array(z.object({ brand: z.string(), count: z.number().int(), share: z.number() })),
  shareOfShelfBySeller: z.array(z.object({ sellerName: z.string(), count: z.number().int(), share: z.number() })),
});

export const marketplaceIntelligenceSnapshotSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  userId: z.number().int().positive(),
  provider: marketplaceConnectorProviderSchema,
  source: marketplaceProbeSourceSchema,
  keyword: z.string(),
  region: z.string(),
  locale: z.string(),
  capturedAt: z.string(),
  sourceCapturedAt: z.string().nullable(),
  capabilityVersion: z.string(),
  status: marketplaceIntelligenceSnapshotStatusSchema,
  itemCount: z.number().int().nonnegative(),
  fieldCoveragePercent: z.number().min(0).max(100),
  unknownFieldCount: z.number().int().nonnegative(),
  items: z.array(marketplaceIntelligenceSnapshotItemSchema),
  metrics: marketplaceIntelligenceSnapshotMetricsSchema,
});

export type MarketplaceIntelligenceSnapshot = z.infer<typeof marketplaceIntelligenceSnapshotSchema>;
export type MarketplaceIntelligenceSnapshotItem = z.infer<typeof marketplaceIntelligenceSnapshotItemSchema>;
export type MarketplaceIntelligenceSnapshotMetrics = z.infer<typeof marketplaceIntelligenceSnapshotMetricsSchema>;

export type MarketplaceKeywordDiscovery = {
  id: string;
  snapshotId: string;
  keyword: string;
  capturedAt: string;
  productFamilies: Array<{
    label: string;
    count: number;
    representativeTitle: string;
    brands: string[];
    priceBand: { min: number | null; max: number | null; median: number | null };
    useCaseHint: string;
  }>;
  opportunities: Array<{
    type: "price_gap" | "trust_gap" | "hero_sku" | "non_official_visibility" | "content_opportunity";
    title: string;
    evidence: string;
    severity: "low" | "medium" | "high";
  }>;
};

export type MarketplaceIntelligenceReport = {
  id: string;
  snapshotId: string;
  reportType: MarketplaceIntelligenceReportType;
  aspectRatio: MarketplaceReportAspectRatio;
  imageModel: string;
  title: string;
  executiveSummary: string[];
  kpis: Array<{ label: string; value: string; detail: string }>;
  winners: Array<{ label: string; winner: string; evidence: string }>;
  recommendations: string[];
  promptPayload: {
    skillKey: string;
    model: string;
    prompt: string;
    evidence: Record<string, unknown>;
  };
  createdAt: string;
};

export type MarketplaceIntelligenceWatchlist = {
  id: string;
  tenantId: string;
  userId: number;
  keyword: string;
  provider: MarketplaceConnectorProvider;
  region: string;
  cadence: "daily" | "weekly" | "manual";
  alertRules: Array<"rank_change" | "price_change" | "new_competitor" | "hero_sku_change" | "field_drift">;
  createdAt: string;
};
