import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  groupMembers,
  marketplaceCaptureAssets,
  marketplaceCaptureSessions,
  marketplaceCaptureInsights,
  marketplaceProductGroupShares,
  marketplaceProductImages,
  marketplaceProductPriceSnapshots,
  marketplaceProducts,
  systemSettings,
  marketplaceUserShareSettings,
  userGroups,
} from "../../drizzle/schema";
import { marketplaceConfirmProductSchema, parseReviewCount, parseSoldCount, productReferenceCategorySchema, type LocalInsightType, type MarketplacePlatform } from "@shared/marketplaceCapture";
import { createMarketplaceId, getMarketplaceCaptureForUser } from "./marketplaceCaptureService";
import { searchImages, searchImagesByBuffer } from "./vectorize-search";
import { indexImage } from "./vectorize-indexing";
import { getAppRuntimeConfig } from "./appRuntimeConfig";

type MarketplaceProductEditableFields = {
  productName: string;
  descriptionText?: string | null;
  priceCurrent?: string | number | null;
  commissionRatePercent?: string | number | null;
  productPageUrl?: string | null;
  soldCountText?: string | null;
  capturedCategoryText?: string | null;
  shopName?: string | null;
  productCategory?: string | null;
  ratingScore?: string | number | null;
  reviewCountText?: string | null;
};

type ManualMarketplaceProductInput = MarketplaceProductEditableFields & {
  platform: MarketplacePlatform;
  sourceUrl?: string | null;
  affiliateUrl?: string | null;
};

type MarketplaceProductRow = typeof marketplaceProducts.$inferSelect;
type MarketplaceProductImageRow = typeof marketplaceProductImages.$inferSelect;

type MarketplaceProductImageWithAccess = {
  image: MarketplaceProductImageRow;
  product: MarketplaceProductRow;
  accessType: "owner" | "group";
  sharedByUserId: number | null;
  groupId: number | null;
  permission?: string | null;
};

function money(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : null;
}

function percent(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value.toFixed(2) : null;
}

function positivePercent(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 100 ? value.toFixed(2) : null;
}

function decimalText(value: string | number | null | undefined, options: { min?: number; max?: number } = {}): string | null {
  if (value === null || value === undefined || value === "") return null;
  const normalized = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(normalized)) return null;
  if (options.min !== undefined && normalized < options.min) return null;
  if (options.max !== undefined && normalized > options.max) return null;
  return normalized.toFixed(2);
}

function optionalText(value: unknown, max = 4096): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, max) : null;
}

function manualProductSourceUrl(productId: string, productPageUrl: string | null, sourceUrl?: string | null) {
  return normalizeOptionalHttpUrl(sourceUrl) ?? productPageUrl ?? `${(process.env.PUBLIC_URL || "https://smartaihub.app").replace(/\/$/, "")}/marketplace-capture/products/${productId}`;
}

function excludeSyntheticStoryboardProductsWhere() {
  return sql`NOT (
    ${marketplaceProducts.id} LIKE 'manual_storyboard_product_%'
    OR COALESCE(${marketplaceProducts.sourceUrl}, '') LIKE 'manual-storyboard://%'
    OR COALESCE(${marketplaceProducts.platformRawJson}->>'manualStoryboardReview', 'false') = 'true'
    OR COALESCE(${marketplaceProducts.platformRawJson}->>'sourceSurface', '') = 'storyboard_review'
  )`;
}

function countText(value: number | null | undefined, fallback: string | null | undefined): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
  }
  return fallback ?? null;
}

function normalizeOptionalHttpUrl(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function isTikTokShowcaseListUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return /(^|\.)shop\.tiktok\.com$/i.test(url.hostname)
      && /\/streamer\/showcase\/product\/list\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function tiktokProductPageUrlFromId(productId: unknown): string | null {
  const id = typeof productId === "string" ? productId.trim() : "";
  return /^\d{8,}$/.test(id) ? `https://shop.tiktok.com/th/pdp/${id}` : null;
}

function resolveProductPageUrl(input: {
  platform: MarketplacePlatform;
  externalProductId: string | null;
  sourceUrl: string | null;
  productRaw: Record<string, unknown>;
  captureRaw: Record<string, unknown>;
  captureNormalized: Record<string, unknown>;
}): string | null {
  const normalizedPlatformRaw = input.captureNormalized.platformRawJson && typeof input.captureNormalized.platformRawJson === "object" && !Array.isArray(input.captureNormalized.platformRawJson)
    ? input.captureNormalized.platformRawJson as Record<string, unknown>
    : {};
  const explicitUrl = normalizeOptionalHttpUrl(firstString(
    input.productRaw.productPageUrl,
    input.productRaw.productUrl,
    input.productRaw.latestProductPageUrl,
    input.productRaw.latestProductUrl,
    input.productRaw.canonicalSourceUrl,
    input.productRaw.sourceUrl,
    input.captureRaw.productPageUrl,
    input.captureRaw.productUrl,
    input.captureRaw.canonicalSourceUrl,
    input.captureNormalized.productPageUrl,
    input.captureNormalized.productUrl,
    input.captureNormalized.canonicalSourceUrl,
    normalizedPlatformRaw.productPageUrl,
    normalizedPlatformRaw.productUrl,
    normalizedPlatformRaw.canonicalSourceUrl,
    input.sourceUrl,
  ));
  if (explicitUrl && !(input.platform === "tiktok_shop" && isTikTokShowcaseListUrl(explicitUrl))) {
    return explicitUrl;
  }
  return input.platform === "tiktok_shop" ? tiktokProductPageUrlFromId(input.externalProductId) : explicitUrl;
}

function normalizeProductCategory(value: unknown): string | null {
  const parsed = productReferenceCategorySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstStringArray(...values: unknown[]): string[] | undefined {
  for (const value of values) {
    if (!Array.isArray(value)) continue;
    const items = value
      .map(item => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .slice(0, 8);
    if (items.length > 0) return items;
  }
  return undefined;
}

function resolveProductCategory(input: {
  productCategory?: unknown;
  productRaw?: Record<string, unknown>;
  captureRaw?: Record<string, unknown>;
  captureNormalized?: Record<string, unknown>;
}): string | null {
  return normalizeProductCategory(input.productCategory)
    ?? normalizeProductCategory(input.productRaw?.productCategory)
    ?? normalizeProductCategory(input.captureRaw?.productCategory)
    ?? normalizeProductCategory(input.captureNormalized?.productCategory)
    ?? null;
}

function normalizeAttachableMediaUrl(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

const productionSupportingInsightTypes: LocalInsightType[] = [
  "product_brief",
  "review_insight",
  "tiktok_shop_trend",
  "combined_opportunity",
  "storytelling_handoff",
];

function compactInsightObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => {
      if (item == null || item === "") return false;
      if (Array.isArray(item)) return item.length > 0;
      if (typeof item === "object") return Object.keys(item as Record<string, unknown>).length > 0;
      return true;
    }),
  ) as T;
}

function compactInsightArray(value: unknown, limit = 8): unknown[] {
  return Array.isArray(value) ? value.filter((item) => item != null && item !== "").slice(0, limit) : [];
}

function buildMarketplaceSupportingInsights(rows: Array<{
  id: string;
  insightType: string;
  provider: string;
  schemaVersion: string;
  storytellingReadiness: string | null;
  createdAt: Date;
  payloadJson: Record<string, unknown>;
}>) {
  if (rows.length === 0) return null;
  const latestByType = new Map<string, typeof rows[number]>();
  for (const row of rows) {
    if (!productionSupportingInsightTypes.includes(row.insightType as LocalInsightType)) continue;
    if (!latestByType.has(row.insightType)) latestByType.set(row.insightType, row);
  }
  const productBrief = latestByType.get("product_brief")?.payloadJson;
  const reviewInsight = latestByType.get("review_insight")?.payloadJson;
  const tiktokTrend = latestByType.get("tiktok_shop_trend")?.payloadJson;
  const opportunity = latestByType.get("combined_opportunity")?.payloadJson;
  const storytelling = latestByType.get("storytelling_handoff")?.payloadJson;

  return compactInsightObject({
    source: "marketplace_capture_local_or_server_ai",
    usagePolicy: {
      mode: "optional_supporting_context",
      note: "Use as creative assistance from the original marketplace page only. Do not treat it as mandatory direction and do not override product truth, evidence, user instructions, or safety/claim gates.",
    },
    insightIds: rows.map((row) => row.id).slice(0, 12),
    availableTypes: Array.from(latestByType.keys()),
    summary: productBrief ? compactInsightObject({
      productName: productBrief.productName,
      shortSummary: productBrief.shortSummary,
      sellingPoints: compactInsightArray(productBrief.keySellingPoints),
      hooks: compactInsightArray(productBrief.suggestedHooks),
      audiences: compactInsightArray(productBrief.targetAudiences),
      painPoints: compactInsightArray(productBrief.buyerPainPoints),
      objections: compactInsightArray(productBrief.buyerObjections),
      trustSignals: compactInsightArray(productBrief.trustSignals),
      contentAngles: compactInsightArray(productBrief.contentAngles),
      ctas: compactInsightArray(productBrief.suggestedCTAs),
      confidence: productBrief.confidence,
    }) : undefined,
    reviewSignals: reviewInsight ? compactInsightObject({
      positiveThemes: compactInsightArray(reviewInsight.positiveThemes),
      negativeThemes: compactInsightArray(reviewInsight.negativeThemes),
      buyerQuestions: compactInsightArray(reviewInsight.commonBuyerQuestions),
      objectionsToAddress: compactInsightArray(reviewInsight.objectionsToAddress),
      contentRecommendations: compactInsightArray(reviewInsight.contentRecommendations),
      confidence: reviewInsight.confidence,
    }) : undefined,
    trendSignals: tiktokTrend ? compactInsightObject({
      contentType: tiktokTrend.contentType,
      hookPattern: tiktokTrend.hookPattern,
      structure: compactInsightArray(tiktokTrend.structure),
      audience: compactInsightArray(tiktokTrend.audience),
      engagementDrivers: compactInsightArray(tiktokTrend.engagementDrivers),
      replicableIdeas: compactInsightArray(tiktokTrend.replicableIdeas),
      risks: compactInsightArray(tiktokTrend.risks),
      confidence: tiktokTrend.confidence,
    }) : undefined,
    opportunity: opportunity ? compactInsightObject({
      summary: opportunity.opportunitySummary,
      fitScore: opportunity.productTrendFitScore,
      recommendedContentFormat: opportunity.recommendedContentFormat,
      positioning: opportunity.suggestedPositioning,
      risks: compactInsightArray(opportunity.risks),
      nextActions: compactInsightArray(opportunity.nextActions),
    }) : undefined,
    storytelling: storytelling ? compactInsightObject({
      readiness: storytelling.readiness,
      storyFormat: storytelling.storyFormat,
      blockers: compactInsightArray(storytelling.blockers),
      customerJourneyStages: compactInsightArray(storytelling.customerJourneyStages, 20),
      storyOptions: compactInsightArray(storytelling.storyOptions, 12),
      claims: compactInsightArray(storytelling.claims, 20),
      confidence: storytelling.confidence,
    }) : undefined,
  });
}

async function supportingInsightsForProducts(
  products: Array<{ id: string; captureId?: string | null; sourceUrl?: string | null }>,
  auth: { userId: number; tenantId?: string },
) {
  const uniqueIds = Array.from(new Set(products.map((product) => product.id).filter(Boolean)));
  const captureIds = Array.from(new Set(products.map((product) => product.captureId).filter(Boolean))) as string[];
  const sourceUrls = Array.from(new Set(products.map((product) => product.sourceUrl).filter(Boolean))) as string[];
  if (uniqueIds.length === 0 && captureIds.length === 0 && sourceUrls.length === 0) {
    return new Map<string, ReturnType<typeof buildMarketplaceSupportingInsights>>();
  }
  const db = getDb();
  const visibilityWhere = auth.tenantId
    ? eq(marketplaceCaptureInsights.tenantId, auth.tenantId)
    : eq(marketplaceCaptureInsights.userId, auth.userId);
  const rows = await db.select({
    id: marketplaceCaptureInsights.id,
    productId: marketplaceCaptureInsights.productId,
    captureId: marketplaceCaptureInsights.captureId,
    sourceUrl: marketplaceCaptureInsights.sourceUrl,
    insightType: marketplaceCaptureInsights.insightType,
    provider: marketplaceCaptureInsights.provider,
    schemaVersion: marketplaceCaptureInsights.schemaVersion,
    storytellingReadiness: marketplaceCaptureInsights.storytellingReadiness,
    createdAt: marketplaceCaptureInsights.createdAt,
    payloadJson: marketplaceCaptureInsights.payloadJson,
  }).from(marketplaceCaptureInsights)
    .where(and(
      or(
        uniqueIds.length ? inArray(marketplaceCaptureInsights.productId, uniqueIds) : undefined,
        captureIds.length ? inArray(marketplaceCaptureInsights.captureId, captureIds) : undefined,
        sourceUrls.length ? inArray(marketplaceCaptureInsights.sourceUrl, sourceUrls) : undefined,
      ),
      inArray(marketplaceCaptureInsights.insightType, productionSupportingInsightTypes),
      visibilityWhere,
    ))
    .orderBy(desc(marketplaceCaptureInsights.createdAt));
  const grouped = new Map<string, typeof rows>();
  for (const product of products) {
    const matching = rows.filter((row) =>
      row.productId === product.id
      || (Boolean(product.captureId) && row.captureId === product.captureId)
      || (Boolean(product.sourceUrl) && row.sourceUrl === product.sourceUrl)
    );
    if (matching.length) grouped.set(product.id, matching);
  }
  return new Map(Array.from(grouped.entries()).map(([productId, insightRows]) => [
    productId,
    buildMarketplaceSupportingInsights(insightRows),
  ]));
}

function daysBetween(a: Date, b: Date) {
  return Math.max(0, Math.floor((a.getTime() - b.getTime()) / 86_400_000));
}

function buildProductHealth(product: any, snapshots: any[]) {
  const ordered = [...snapshots].sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());
  const latest = ordered[0];
  const previous = ordered.find((snapshot) => snapshot.id !== latest?.id);
  const oldest = ordered[ordered.length - 1];
  const lastCheckedAt = latest?.capturedAt ?? product.updatedAt ?? product.createdAt;
  const daysSinceUpdate = lastCheckedAt ? daysBetween(new Date(), new Date(lastCheckedAt)) : null;
  const warnings: Array<{ code: string; severity: "info" | "warning" | "critical"; message: string }> = [];

  if (daysSinceUpdate != null && daysSinceUpdate >= 30) {
    warnings.push({
      code: "stale_update",
      severity: daysSinceUpdate >= 60 ? "critical" : "warning",
      message: `ไม่ได้ตรวจสอบข้อมูลสินค้า ${daysSinceUpdate} วัน`,
    });
  }

  const rating = latest?.ratingScore ?? product.ratingScore;
  const ratingNumber = rating == null ? null : Number(rating);
  if (ratingNumber != null && Number.isFinite(ratingNumber) && ratingNumber < 3.8) {
    warnings.push({
      code: "low_rating",
      severity: ratingNumber < 3.5 ? "critical" : "warning",
      message: `rating ต่ำกว่าปกติ (${ratingNumber.toFixed(2)})`,
    });
  }

  if (latest && previous) {
    const latestSold = latest.soldCountNormalized ?? product.soldCountNormalized;
    const previousSold = previous.soldCountNormalized;
    const latestRating = latest.ratingScore == null ? null : Number(latest.ratingScore);
    const previousRating = previous.ratingScore == null ? null : Number(previous.ratingScore);
    const latestDate = new Date(latest.capturedAt);
    const previousDate = new Date(previous.capturedAt);
    const days = daysBetween(latestDate, previousDate);
    if (latestSold != null && previousSold != null && days >= 7 && latestSold <= previousSold) {
      warnings.push({
        code: "sold_not_growing",
        severity: days >= 21 ? "warning" : "info",
        message: `ยอดขายไม่เพิ่มจาก snapshot ก่อนหน้า ${days} วัน`,
      });
    }
    if (latestRating != null && previousRating != null && previousRating - latestRating >= 0.3) {
      warnings.push({
        code: "rating_drop",
        severity: previousRating - latestRating >= 0.6 ? "critical" : "warning",
        message: `rating ลดลง ${(previousRating - latestRating).toFixed(2)} จากครั้งก่อน`,
      });
    }
  }

  if (latest && oldest && ordered.length >= 3) {
    const latestSold = latest.soldCountNormalized ?? product.soldCountNormalized;
    const oldestSold = oldest.soldCountNormalized;
    const days = daysBetween(new Date(latest.capturedAt), new Date(oldest.capturedAt));
    if (latestSold != null && oldestSold != null && days >= 14 && latestSold - oldestSold <= Math.max(2, oldestSold * 0.01)) {
      warnings.push({
        code: "low_sold_velocity",
        severity: "warning",
        message: `ยอดขายแทบไม่เปลี่ยนในช่วง ${days} วัน`,
      });
    }
  }

  return {
    status: warnings.some((w) => w.severity === "critical") ? "critical" : warnings.some((w) => w.severity === "warning") ? "warning" : "ok",
    warnings,
    lastCheckedAt,
    snapshotCount: ordered.length,
  };
}

async function getActiveGroupIds(auth: { userId: number; tenantId?: string }) {
  const db = getDb();
  const rows = await db.select({ groupId: groupMembers.groupId, tenantId: userGroups.tenantId })
    .from(groupMembers)
    .innerJoin(userGroups, eq(userGroups.id, groupMembers.groupId))
    .where(and(
      eq(groupMembers.userId, auth.userId),
      eq(groupMembers.status, "active"),
      sql`${userGroups.deletedAt} IS NULL`,
    ));
  const tenantRows = auth.tenantId ? rows.filter((row) => row.tenantId === auth.tenantId) : rows;
  return (tenantRows.length > 0 ? tenantRows : rows).map((row) => row.groupId);
}

function productIdentityWhere(capture: { platform: MarketplacePlatform; externalProductId: string | null; externalShopId: string | null; sourceUrl?: string | null }) {
  if (!capture.externalProductId) {
    return capture.sourceUrl
      ? and(eq(marketplaceProducts.platform, capture.platform), eq(marketplaceProducts.sourceUrl, capture.sourceUrl))
      : undefined;
  }
  return capture.externalShopId
    ? and(
      eq(marketplaceProducts.platform, capture.platform),
      eq(marketplaceProducts.externalShopId, capture.externalShopId),
      eq(marketplaceProducts.externalProductId, capture.externalProductId),
    )
    : and(
      eq(marketplaceProducts.platform, capture.platform),
      eq(marketplaceProducts.externalProductId, capture.externalProductId),
    );
}

async function findAccessibleDuplicate(capture: { platform: MarketplacePlatform; externalProductId: string | null; externalShopId: string | null; sourceUrl?: string | null }, auth: { userId: number; tenantId?: string }) {
  const identityWhere = productIdentityWhere(capture);
  if (!identityWhere) return null;
  const db = getDb();
  const [own] = await db.select().from(marketplaceProducts)
    .where(and(eq(marketplaceProducts.userId, auth.userId), identityWhere))
    .limit(1);
  if (own) return { product: own, accessType: "owner" as const };

  const groupIds = await getActiveGroupIds(auth);
  if (!auth.tenantId || groupIds.length === 0) return null;
  const [shared] = await db.select({ product: marketplaceProducts, permission: marketplaceProductGroupShares.permission })
    .from(marketplaceProductGroupShares)
    .innerJoin(marketplaceProducts, eq(marketplaceProducts.id, marketplaceProductGroupShares.productId))
    .where(and(
      eq(marketplaceProductGroupShares.tenantId, auth.tenantId),
      inArray(marketplaceProductGroupShares.groupId, groupIds),
      eq(marketplaceProductGroupShares.permission, "read_update"),
      identityWhere,
    ))
    .limit(1);
  return shared ? { product: shared.product, accessType: "group" as const, permission: shared.permission } : null;
}

async function getMarketplaceProductForUpdate(productId: string, auth: { userId: number; tenantId?: string }) {
  const db = getDb();
  const [own] = await db.select().from(marketplaceProducts)
    .where(and(eq(marketplaceProducts.id, productId), eq(marketplaceProducts.userId, auth.userId)))
    .limit(1);
  if (own) return { product: own, accessType: "owner" as const };

  const groupIds = await getActiveGroupIds(auth);
  if (!auth.tenantId || groupIds.length === 0) return null;
  const [shared] = await db.select({
    product: marketplaceProducts,
    permission: marketplaceProductGroupShares.permission,
  })
    .from(marketplaceProductGroupShares)
    .innerJoin(marketplaceProducts, eq(marketplaceProducts.id, marketplaceProductGroupShares.productId))
    .where(and(
      eq(marketplaceProducts.id, productId),
      eq(marketplaceProductGroupShares.tenantId, auth.tenantId),
      inArray(marketplaceProductGroupShares.groupId, groupIds),
      eq(marketplaceProductGroupShares.permission, "read_update"),
    ))
    .limit(1);
  return shared ? { product: shared.product, accessType: "group" as const, permission: shared.permission } : null;
}

async function getShareSetting(platform: MarketplacePlatform, auth: { userId: number; tenantId?: string }) {
  if (!auth.tenantId) return null;
  const db = getDb();
  const [setting] = await db.select().from(marketplaceUserShareSettings)
    .where(and(
      eq(marketplaceUserShareSettings.userId, auth.userId),
      eq(marketplaceUserShareSettings.tenantId, auth.tenantId),
      eq(marketplaceUserShareSettings.platform, platform),
    ))
    .limit(1);
  return setting ?? null;
}

async function applyConfiguredShares(productId: string, platform: MarketplacePlatform, auth: { userId: number; tenantId?: string }) {
  const setting = await getShareSetting(platform, auth);
  const groupIds = setting?.enabled ? (setting.groupIdsJson ?? []).filter((id) => Number.isInteger(id)) : [];
  if (!auth.tenantId || groupIds.length === 0) return [];
  const activeGroupIds = new Set(await getActiveGroupIds(auth));
  const allowedGroupIds = groupIds.filter((groupId) => activeGroupIds.has(groupId));
  if (allowedGroupIds.length === 0) return [];
  const db = getDb();
  const now = new Date();
  await db.insert(marketplaceProductGroupShares).values(allowedGroupIds.map((groupId) => ({
    id: createMarketplaceId("mpgs"),
    productId,
    tenantId: auth.tenantId!,
    groupId,
    sharedByUserId: auth.userId,
    platform,
    permission: setting?.permission ?? "read_update",
    createdAt: now,
    updatedAt: now,
  }))).onConflictDoUpdate({
    target: [marketplaceProductGroupShares.productId, marketplaceProductGroupShares.groupId],
    set: { permission: setting?.permission ?? "read_update", updatedAt: now },
  });
  return allowedGroupIds;
}

async function syncConfiguredSharesForOwnedProducts(platform: MarketplacePlatform, setting: {
  enabled: boolean;
  groupIdsJson: number[];
  permission: string;
}, auth: { userId: number; tenantId?: string }) {
  if (!auth.tenantId) return { productCount: 0, sharedGroupIds: [] as number[] };
  const db = getDb();
  await db.delete(marketplaceProductGroupShares).where(and(
    eq(marketplaceProductGroupShares.sharedByUserId, auth.userId),
    eq(marketplaceProductGroupShares.tenantId, auth.tenantId),
    eq(marketplaceProductGroupShares.platform, platform),
  ));

  const configuredGroupIds = setting.enabled
    ? (setting.groupIdsJson ?? []).filter((id) => Number.isInteger(id))
    : [];
  if (configuredGroupIds.length === 0) return { productCount: 0, sharedGroupIds: [] as number[] };

  const activeGroupIds = new Set(await getActiveGroupIds(auth));
  const allowedGroupIds = configuredGroupIds.filter((groupId) => activeGroupIds.has(groupId));
  if (allowedGroupIds.length === 0) return { productCount: 0, sharedGroupIds: [] as number[] };

  const products = await db.select({ id: marketplaceProducts.id }).from(marketplaceProducts)
    .where(and(
      eq(marketplaceProducts.userId, auth.userId),
      eq(marketplaceProducts.tenantId, auth.tenantId),
      eq(marketplaceProducts.platform, platform),
      or(eq(marketplaceProducts.status, "active"), sql`${marketplaceProducts.status} IS NULL`),
    ));
  if (products.length === 0) return { productCount: 0, sharedGroupIds: allowedGroupIds };

  const now = new Date();
  await db.insert(marketplaceProductGroupShares).values(products.flatMap((product) =>
    allowedGroupIds.map((groupId) => ({
      id: createMarketplaceId("mpgs"),
      productId: product.id,
      tenantId: auth.tenantId!,
      groupId,
      sharedByUserId: auth.userId,
      platform,
      permission: setting.permission,
      createdAt: now,
      updatedAt: now,
    }))
  )).onConflictDoUpdate({
    target: [marketplaceProductGroupShares.productId, marketplaceProductGroupShares.groupId],
    set: { permission: setting.permission, updatedAt: now },
  });

  return { productCount: products.length, sharedGroupIds: allowedGroupIds };
}

async function insertMetricSnapshot(productId: string, captureId: string, product: any, auth: { userId: number }, options: { commissionRatePercent?: string | null } = {}) {
  const rawSoldCountText = product.rating.soldCountText ?? null;
  const soldCountNormalized = parseSoldCount(rawSoldCountText);
  const soldCountText = countText(soldCountNormalized, rawSoldCountText);
  const rawReviewCountText = product.rating.reviewCountText ?? null;
  const reviewCountNormalized = parseReviewCount(rawReviewCountText);
  const reviewCountText = countText(reviewCountNormalized, rawReviewCountText);
  const db = getDb();
  await db.insert(marketplaceProductPriceSnapshots).values({
    id: createMarketplaceId("mpps"),
    productId,
    captureId,
    capturedByUserId: auth.userId,
    priceCurrent: money(product.price.current),
    priceOriginal: money(product.price.original),
    currency: product.price.currency ?? "THB",
    discountText: product.price.discountText ?? null,
    commissionRatePercent: options.commissionRatePercent ?? percent(product.commissionRatePercent),
    ratingScore: money(product.rating.score),
    reviewCountText,
    reviewCountNormalized,
    soldCountText,
    soldCountNormalized,
    capturedAt: new Date(),
  });
}

async function linkCaptureInsightsToProduct(captureId: string, productId: string, auth: { userId: number; tenantId?: string }) {
  const db = getDb();
  await db.update(marketplaceCaptureInsights)
    .set({ productId, updatedAt: new Date() })
    .where(and(
      eq(marketplaceCaptureInsights.captureId, captureId),
      eq(marketplaceCaptureInsights.userId, auth.userId),
      auth.tenantId ? eq(marketplaceCaptureInsights.tenantId, auth.tenantId) : sql`${marketplaceCaptureInsights.tenantId} IS NULL`,
    ));
}

function selectedCaptureAssetIds(product: any): string[] {
  return [
    ...product.images.main,
    ...product.images.description,
    ...product.images.review,
    ...product.images.relatedExcluded,
  ];
}

function buildProductImageRows(productId: string, product: any, assetById: Map<string, any>) {
  return [
    ...product.images.main.map((assetId: string, index: number) => ({ assetId, type: "main" as const, sortOrder: index })),
    ...product.images.description.map((assetId: string, index: number) => ({ assetId, type: "description" as const, sortOrder: index })),
    ...product.images.review.map((assetId: string, index: number) => ({ assetId, type: "review" as const, sortOrder: index })),
    ...product.images.relatedExcluded.map((assetId: string, index: number) => ({ assetId, type: "related_excluded" as const, sortOrder: index })),
  ].flatMap((item) => {
    const asset = assetById.get(item.assetId);
    if (!asset) return [];
    return {
      id: createMarketplaceId("mpi"),
      productId,
      captureAssetId: asset.id,
      type: item.type,
      url: asset.url,
      storageKey: asset.storageKey,
      originalSourceUrl: asset.sourceUrl ?? null,
      sortOrder: item.sortOrder,
      width: asset.width ?? null,
      height: asset.height ?? null,
      metadataJson: {
        ...(asset.metadataJson ?? {}),
        captureId: asset.captureId,
        selectedAsCover: product.images.coverAssetId === asset.id,
      },
    };
  });
}

async function replaceCaptureProductImages(productId: string, product: any, assetById: Map<string, any>) {
  const db = getDb();
  await db.delete(marketplaceProductImages)
    .where(and(
      eq(marketplaceProductImages.productId, productId),
      sql`${marketplaceProductImages.captureAssetId} IS NOT NULL`,
    ));
  const rows = buildProductImageRows(productId, product, assetById);
  if (rows.length > 0) {
    await db.insert(marketplaceProductImages).values(rows);
  }
  return rows;
}

type MarketplaceImageVectorSource = {
  id: string;
  productId: string;
  captureAssetId: string | null;
  type: string;
  url: string;
  originalSourceUrl?: string | null;
};

const MARKETPLACE_CAPTURE_SETTINGS_CATEGORY = "marketplace_capture";
const MARKETPLACE_IMAGE_INDEX_ALLOWED_HOSTS_KEY = "image_index_allowed_hosts";

function parseMarketplaceImageIndexAllowedHosts(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

async function getMarketplaceImageIndexAllowedHosts(): Promise<string[]> {
  const db = getDb();
  const [row] = await db.select({
    value: systemSettings.value,
    valueJson: systemSettings.valueJson,
  })
    .from(systemSettings)
    .where(and(
      eq(systemSettings.category, MARKETPLACE_CAPTURE_SETTINGS_CATEGORY),
      eq(systemSettings.key, MARKETPLACE_IMAGE_INDEX_ALLOWED_HOSTS_KEY),
    ))
    .limit(1);
  const jsonHosts = parseMarketplaceImageIndexAllowedHosts(row?.valueJson?.hosts);
  return jsonHosts.length > 0 ? jsonHosts : parseMarketplaceImageIndexAllowedHosts(row?.value);
}

async function resolveMarketplaceImageIndexUrl(rawUrl: string): Promise<string> {
  const trimmed = rawUrl.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (!trimmed.startsWith("/")) return trimmed;
  const runtime = await getAppRuntimeConfig();
  const baseUrl = runtime.publicUrl || runtime.appPublicUrl || runtime.appUrl || "https://smartaihub.app";
  return new URL(trimmed, `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

function isSafeMarketplaceImageIndexUrl(rawUrl: string, allowedHosts: string[]): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (allowedHosts.length > 0 && !allowedHosts.some((allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`))) {
      return false;
    }
    if (process.env.NODE_ENV === "production" && allowedHosts.length === 0) return false;
    if (host === "localhost" || host.endsWith(".localhost")) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return false;
    const private172 = host.match(/^172\.(\d{1,3})\./);
    if (private172) {
      const octet = Number(private172[1]);
      if (octet >= 16 && octet <= 31) return false;
    }
    if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return false;
    return true;
  } catch {
    return false;
  }
}

export function isSafeMarketplaceImageIndexUrlForTest(rawUrl: string, allowedHosts: string[] = []): boolean {
  return isSafeMarketplaceImageIndexUrl(rawUrl, allowedHosts);
}

function queueMarketplaceProductImageIndexing(
  images: MarketplaceImageVectorSource[],
  auth: { userId: number; tenantId?: string },
  product: {
    productId?: string | null;
    productName?: string | null;
    descriptionText?: string | null;
    platform?: MarketplacePlatform | string | null;
    productCategory?: string | null;
  },
) {
  void indexMarketplaceProductImagesForVisualSearch(images, auth, product).catch((error) => {
    console.warn("[marketplaceCapture] visual image indexing failed", {
      productId: product.productId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

async function indexMarketplaceProductImagesForVisualSearch(
  images: MarketplaceImageVectorSource[],
  auth: { userId: number; tenantId?: string },
  product: {
    productId?: string | null;
    productName?: string | null;
    descriptionText?: string | null;
    platform?: MarketplacePlatform | string | null;
    productCategory?: string | null;
  },
) {
  const tenantId = auth.tenantId ?? `user:${auth.userId}`;
  const allowedHosts = await getMarketplaceImageIndexAllowedHosts();
  const imagesWithResolvedUrls = await Promise.all(images.map(async (image) => ({
    ...image,
    resolvedUrl: image.url ? await resolveMarketplaceImageIndexUrl(image.url) : "",
  })));
  const indexableImages = imagesWithResolvedUrls.filter((image) => image.captureAssetId && image.resolvedUrl && isSafeMarketplaceImageIndexUrl(image.resolvedUrl, allowedHosts));
  if (indexableImages.length === 0) return { attempted: 0, succeeded: 0, failed: 0 };

  const results = await Promise.allSettled(indexableImages.map((image) => indexImage({
    id: `marketplace-${image.captureAssetId}`,
    imageUrl: image.resolvedUrl,
    tenantId,
    filename: `${product.productName ?? "Marketplace product"} ${image.type}`,
    type: "marketplace_image",
    metadata: {
      productId: image.productId,
      imageId: image.id,
      captureAssetId: image.captureAssetId ?? undefined,
      platform: product.platform ?? undefined,
      imageKind: image.type,
      productName: product.productName ?? undefined,
      productDescription: product.descriptionText ?? undefined,
      productCategory: product.productCategory ?? undefined,
      originalSourceUrl: image.originalSourceUrl ?? undefined,
    },
  })));
  const failed = results.filter((result) => result.status === "rejected");
  if (failed.length > 0) {
    console.warn("[marketplaceCapture] visual image indexing partially failed", {
      attempted: indexableImages.length,
      failed: failed.length,
      productId: product.productId,
    });
  }
  return {
    attempted: indexableImages.length,
    succeeded: results.length - failed.length,
    failed: failed.length,
  };
}

export async function confirmMarketplaceCapture(captureId: string, input: unknown, auth: { userId: number; tenantId?: string }) {
  const parsed = marketplaceConfirmProductSchema.parse(input);
  const { capture } = await getMarketplaceCaptureForUser(captureId, auth);
  const db = getDb();
  const productId = createMarketplaceId("mp");
  const product = parsed.product;
  const captureRawPayload = (capture.rawPayloadJson ?? {}) as Record<string, unknown>;
  const captureNormalized = (capture.normalizedResultJson ?? {}) as Record<string, unknown>;
  const productRawJson = product.platformRawJson as Record<string, unknown>;
  const productCategory = resolveProductCategory({
    productCategory: product.productCategory,
    productRaw: productRawJson,
    captureRaw: captureRawPayload,
    captureNormalized,
  });
  const capturedCategoryText = firstString(
    product.description.specs.categoryText,
    productRawJson.categoryText,
    captureRawPayload.categoryText,
    captureNormalized.categoryText,
  );
  const capturedCategoryPath = firstStringArray(
    product.description.specs.categoryPath,
    productRawJson.categoryPath,
    captureRawPayload.categoryPath,
    captureNormalized.categoryPath,
  );
  const affiliateUrl = normalizeOptionalHttpUrl(
    product.affiliateUrl
      ?? capture.affiliateUrl
      ?? captureRawPayload.affiliateUrl
      ?? captureNormalized.affiliateUrl,
  );
  const commissionCheckUrl = normalizeOptionalHttpUrl(
    productRawJson.commissionCheckUrl
      ?? productRawJson.offerUrl
      ?? productRawJson.offerSpecificUrl
      ?? captureRawPayload.commissionCheckUrl
      ?? captureRawPayload.offerUrl
      ?? captureRawPayload.offerSpecificUrl
      ?? captureNormalized.commissionCheckUrl
      ?? (captureNormalized.platformRawJson as Record<string, unknown> | undefined)?.commissionCheckUrl,
  ) ?? (capture.platform === "shopee" && capture.externalProductId
    ? `https://affiliate.shopee.co.th/offer/product_offer/${capture.externalProductId}`
    : null);
  const productPageUrl = resolveProductPageUrl({
    platform: capture.platform,
    externalProductId: capture.externalProductId,
    sourceUrl: capture.sourceUrl,
    productRaw: productRawJson,
    captureRaw: captureRawPayload,
    captureNormalized,
  });
  const rawSoldCountText = product.rating.soldCountText ?? null;
  const soldCountNormalized = parseSoldCount(rawSoldCountText);
  const soldCountText = countText(soldCountNormalized, rawSoldCountText);
  const rawReviewCountText = product.rating.reviewCountText ?? null;
  const reviewCountNormalized = parseReviewCount(rawReviewCountText);
  const reviewCountText = countText(reviewCountNormalized, rawReviewCountText);
  const assetIds = selectedCaptureAssetIds(product);
  const assetRows = assetIds.length > 0
    ? await db.select().from(marketplaceCaptureAssets)
      .where(and(eq(marketplaceCaptureAssets.captureId, captureId), eq(marketplaceCaptureAssets.userId, auth.userId)))
    : [];
  const assetById = new Map(assetRows.map((asset) => [asset.id, asset]));
  const coverImageAssetId = product.images.coverAssetId && assetById.has(product.images.coverAssetId)
    ? product.images.coverAssetId
    : null;

  if (capture.externalProductId || capture.sourceUrl) {
    const duplicate = await findAccessibleDuplicate(capture, auth);
    if (duplicate) {
      const existing = duplicate.product;
      const incomingCommissionRatePercent = positivePercent(product.commissionRatePercent);
      const commissionRatePercent = incomingCommissionRatePercent ?? existing.commissionRatePercent ?? null;
      await db.update(marketplaceProducts)
        .set({
          productName: product.productName,
          brand: product.brand ?? null,
          shopName: product.shopName ?? null,
          isMall: product.isMall ?? null,
          priceCurrent: money(product.price.current),
          priceOriginal: money(product.price.original),
          currency: product.price.currency ?? "THB",
          discountText: product.price.discountText ?? null,
          commissionRatePercent,
          productCategory,
          affiliateUrl,
          sourceUrl: capture.sourceUrl,
          captureId,
          ratingScore: money(product.rating.score),
          reviewCountText,
          soldCountText,
          soldCountNormalized,
          descriptionText: product.description.rawText ?? "",
          descriptionJson: {
            ingredients: product.description.ingredients,
            claims: product.description.claims,
            categoryText: capturedCategoryText,
            categoryPath: capturedCategoryPath,
            productCategory,
          },
          specsJson: product.description.specs,
          platformRawJson: {
            ...(existing.platformRawJson as Record<string, unknown> ?? {}),
            ...(productRawJson ?? {}),
            affiliateUrl,
            commissionCheckUrl,
            productPageUrl,
            productCategory,
            categoryText: capturedCategoryText,
            categoryPath: capturedCategoryPath,
            latestCaptureId: captureId,
            latestCapturedAt: new Date().toISOString(),
            latestCapturedByUserId: auth.userId,
            duplicateAccessType: duplicate.accessType,
            latestAffiliateUrl: affiliateUrl,
            latestCommissionCheckUrl: commissionCheckUrl,
            latestIncomingCommissionRatePercent: incomingCommissionRatePercent,
            preservedCommissionRatePercent: incomingCommissionRatePercent ? null : existing.commissionRatePercent ?? null,
            latestProductPageUrl: productPageUrl,
            latestProductCategory: productCategory,
            latestProductDraft: productRawJson,
          },
          coverImageAssetId,
          updatedAt: new Date(),
        })
        .where(eq(marketplaceProducts.id, existing.id));

      const indexedRows = await replaceCaptureProductImages(existing.id, product, assetById);
      queueMarketplaceProductImageIndexing(indexedRows, auth, {
        productId: existing.id,
        productName: product.productName,
        descriptionText: product.description.rawText ?? "",
        platform: capture.platform,
        productCategory,
      });
      await insertMetricSnapshot(existing.id, captureId, product, auth, { commissionRatePercent });
      await linkCaptureInsightsToProduct(captureId, existing.id, auth);
      await db.update(marketplaceCaptureSessions)
        .set({ status: "confirmed", updatedAt: new Date() })
        .where(eq(marketplaceCaptureSessions.id, captureId));
      return {
        productId: existing.id,
        status: duplicate.accessType === "owner" ? "duplicate_existing_product" : "updated_group_shared_product",
        productUrl: `/marketplace-capture/products/${existing.id}`,
      };
    }
  }

  await db.insert(marketplaceProducts).values({
    id: productId,
    captureId,
    userId: auth.userId,
    tenantId: auth.tenantId ?? capture.tenantId ?? null,
    platform: capture.platform,
    sourceUrl: capture.sourceUrl,
    externalProductId: capture.externalProductId,
    externalShopId: capture.externalShopId,
    productName: product.productName,
    brand: product.brand ?? null,
    shopName: product.shopName ?? null,
    isMall: product.isMall ?? null,
    priceCurrent: money(product.price.current),
    priceOriginal: money(product.price.original),
    currency: product.price.currency ?? "THB",
    discountText: product.price.discountText ?? null,
    commissionRatePercent: percent(product.commissionRatePercent),
    productCategory,
    affiliateUrl,
    ratingScore: money(product.rating.score),
    reviewCountText,
    soldCountText,
    soldCountNormalized,
    descriptionText: product.description.rawText ?? "",
    descriptionJson: {
      ingredients: product.description.ingredients,
      claims: product.description.claims,
      categoryText: capturedCategoryText,
      categoryPath: capturedCategoryPath,
      productCategory,
    },
    specsJson: product.description.specs,
    platformRawJson: {
      ...(productRawJson ?? {}),
      affiliateUrl,
      commissionCheckUrl,
      productPageUrl,
      latestProductPageUrl: productPageUrl,
      productCategory,
      categoryText: capturedCategoryText,
      categoryPath: capturedCategoryPath,
    },
    coverImageAssetId,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const rows = buildProductImageRows(productId, product, assetById);
  if (rows.length > 0) {
    await db.insert(marketplaceProductImages).values(rows);
    queueMarketplaceProductImageIndexing(rows, auth, {
      productId,
      productName: product.productName,
      descriptionText: product.description.rawText ?? "",
      platform: capture.platform,
      productCategory,
    });
  }

  await insertMetricSnapshot(productId, captureId, product, auth);
  await linkCaptureInsightsToProduct(captureId, productId, auth);
  const sharedGroupIds = await applyConfiguredShares(productId, capture.platform, auth);

  await db.update(marketplaceCaptureSessions)
    .set({ status: "confirmed", updatedAt: new Date() })
    .where(eq(marketplaceCaptureSessions.id, captureId));

  return {
    productId,
    status: sharedGroupIds.length > 0 ? "saved_and_shared" : "saved",
    productUrl: `/marketplace-capture/products/${productId}`,
    sharedGroupIds,
  };
}

export async function backfillMarketplaceProductImageVectors(options: {
  tenantId?: string;
  userId?: number;
  platform?: MarketplacePlatform | "all";
  limit?: number;
  offset?: number;
  dryRun?: boolean;
} = {}) {
  const db = getDb();
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 1000);
  const offset = Math.max(options.offset ?? 0, 0);
  const platform = options.platform && options.platform !== "all" ? options.platform : null;
  const rows = await db.select({
    image: marketplaceProductImages,
    product: marketplaceProducts,
  })
    .from(marketplaceProductImages)
    .innerJoin(marketplaceProducts, eq(marketplaceProducts.id, marketplaceProductImages.productId))
    .where(and(
      sql`${marketplaceProductImages.captureAssetId} IS NOT NULL`,
      options.tenantId ? eq(marketplaceProducts.tenantId, options.tenantId) : undefined,
      options.userId ? eq(marketplaceProducts.userId, options.userId) : undefined,
      platform ? eq(marketplaceProducts.platform, platform) : undefined,
      excludeSyntheticStoryboardProductsWhere(),
    ))
    .orderBy(desc(marketplaceProductImages.createdAt), desc(marketplaceProductImages.id))
    .offset(offset)
    .limit(limit);

  if (options.dryRun ?? true) {
    return {
      dryRun: true,
      scanned: rows.length,
      nextOffset: rows.length === limit ? offset + limit : null,
      attempted: 0,
      succeeded: 0,
      failed: 0,
    };
  }

  let attempted = 0;
  let succeeded = 0;
  let failed = 0;
  const rowsByProduct = new Map<string, typeof rows>();
  for (const row of rows) {
    const bucket = rowsByProduct.get(row.product.id) ?? [];
    bucket.push(row);
    rowsByProduct.set(row.product.id, bucket);
  }

  for (const [productId, productRows] of rowsByProduct) {
    const product = productRows[0]?.product;
    if (!product) continue;
    const result = await indexMarketplaceProductImagesForVisualSearch(
      productRows.map((row) => row.image),
      { userId: product.userId, tenantId: product.tenantId ?? undefined },
      {
        productId,
        productName: product.productName,
        descriptionText: product.descriptionText,
        platform: product.platform,
        productCategory: product.productCategory,
      },
    );
    attempted += result.attempted;
    succeeded += result.succeeded;
    failed += result.failed;
  }

  return {
    dryRun: false,
    scanned: rows.length,
    nextOffset: rows.length === limit ? offset + limit : null,
    attempted,
    succeeded,
    failed,
  };
}

export async function getMarketplaceShareSettings(auth: { userId: number; tenantId?: string }) {
  const db = getDb();
  const tenantRows = auth.tenantId
    ? await db.select().from(marketplaceUserShareSettings)
      .where(and(eq(marketplaceUserShareSettings.userId, auth.userId), eq(marketplaceUserShareSettings.tenantId, auth.tenantId)))
    : [];
  const rows = tenantRows.length > 0
    ? tenantRows
    : await db.select().from(marketplaceUserShareSettings)
      .where(eq(marketplaceUserShareSettings.userId, auth.userId))
      .orderBy(desc(marketplaceUserShareSettings.updatedAt));
  return { settings: rows, tenantRequired: false };
}

export async function saveMarketplaceShareSetting(input: {
  platform: MarketplacePlatform;
  enabled: boolean;
  groupIds: number[];
  permission?: "read" | "read_update";
}, auth: { userId: number; tenantId?: string }) {
  const db = getDb();
  const requestedGroupIds = Array.from(new Set(input.groupIds));
  const activeGroupRows = requestedGroupIds.length > 0
    ? await db.select({ groupId: groupMembers.groupId, tenantId: userGroups.tenantId })
      .from(groupMembers)
      .innerJoin(userGroups, eq(userGroups.id, groupMembers.groupId))
      .where(and(
        eq(groupMembers.userId, auth.userId),
        eq(groupMembers.status, "active"),
        inArray(groupMembers.groupId, requestedGroupIds),
        sql`${userGroups.deletedAt} IS NULL`,
      ))
    : [];
  const preferredTenantRows = auth.tenantId ? activeGroupRows.filter((row) => row.tenantId === auth.tenantId) : activeGroupRows;
  const selectedGroupRows = preferredTenantRows.length > 0 ? preferredTenantRows : activeGroupRows;
  const groupIds = selectedGroupRows.map((row) => row.groupId);

  let tenantId: string | null = selectedGroupRows[0]?.tenantId ?? auth.tenantId ?? null;
  if (!tenantId) {
    const [existing] = await db.select({ tenantId: marketplaceUserShareSettings.tenantId })
      .from(marketplaceUserShareSettings)
      .where(and(
        eq(marketplaceUserShareSettings.userId, auth.userId),
        eq(marketplaceUserShareSettings.platform, input.platform),
      ))
      .orderBy(desc(marketplaceUserShareSettings.updatedAt))
      .limit(1);
    tenantId = existing?.tenantId ?? selectedGroupRows[0]?.tenantId ?? null;
  }
  if (!tenantId) throw new Error("Tenant context is required for marketplace sharing settings");
  const now = new Date();
  const row = {
    id: createMarketplaceId("mpss"),
    userId: auth.userId,
    tenantId,
    platform: input.platform,
    enabled: input.enabled,
    groupIdsJson: groupIds,
    permission: input.permission ?? "read_update",
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(marketplaceUserShareSettings).values(row).onConflictDoUpdate({
    target: [marketplaceUserShareSettings.userId, marketplaceUserShareSettings.tenantId, marketplaceUserShareSettings.platform],
    set: {
      enabled: row.enabled,
      groupIdsJson: row.groupIdsJson,
      permission: row.permission,
      updatedAt: now,
    },
  });
  const sync = await syncConfiguredSharesForOwnedProducts(input.platform, row, { ...auth, tenantId });
  return { saved: true, setting: row, sync };
}

async function snapshotsForProductIds(productIds: string[]) {
  if (productIds.length === 0) return new Map<string, any[]>();
  const db = getDb();
  const rows = await db.select().from(marketplaceProductPriceSnapshots)
    .where(inArray(marketplaceProductPriceSnapshots.productId, productIds))
    .orderBy(desc(marketplaceProductPriceSnapshots.capturedAt));
  const grouped = new Map<string, any[]>();
  for (const row of rows) {
    grouped.set(row.productId, [...(grouped.get(row.productId) ?? []), row]);
  }
  return grouped;
}

async function primaryImagesForProducts(products: MarketplaceProductRow[]) {
  if (products.length === 0) return new Map<string, { imageUrl: string; imageUrls: string[] }>();
  const db = getDb();
  const productIds = products.map((product) => product.id);
  const rows = await db.select().from(marketplaceProductImages)
    .where(inArray(marketplaceProductImages.productId, productIds))
    .orderBy(marketplaceProductImages.sortOrder, marketplaceProductImages.createdAt);
  const grouped = new Map<string, typeof marketplaceProductImages.$inferSelect[]>();
  for (const row of rows) {
    grouped.set(row.productId, [...(grouped.get(row.productId) ?? []), row]);
  }
  const output = new Map<string, { imageUrl: string; imageUrls: string[] }>();
  for (const product of products) {
    const productRaw = (product.platformRawJson as Record<string, unknown> | null) ?? {};
    const heroProductImageId = typeof productRaw.heroProductImageId === "string" ? productRaw.heroProductImageId : "";
    const orderedImages = [...(grouped.get(product.id) ?? [])].sort((left, right) => {
      const leftIsCover = (heroProductImageId && left.id === heroProductImageId) || (product.coverImageAssetId && left.captureAssetId === product.coverImageAssetId) ? 0 : 1;
      const rightIsCover = (heroProductImageId && right.id === heroProductImageId) || (product.coverImageAssetId && right.captureAssetId === product.coverImageAssetId) ? 0 : 1;
      return leftIsCover - rightIsCover || (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
    });
    const imageUrls = orderedImages.map((image) => image.url).filter(Boolean);
    if (imageUrls.length > 0) {
      output.set(product.id, { imageUrl: imageUrls[0], imageUrls });
    }
  }
  return output;
}

export async function listMarketplaceProductsWithAccess(
  auth: { userId: number; tenantId?: string },
  options: {
    limit?: number;
    cursor?: string | null;
    ownerOnly?: boolean;
    platform?: MarketplacePlatform | "all";
    query?: string;
    category?: string;
    sortMode?: "recommended" | "sold" | "rating" | "updated";
  } = {},
) {
  const db = getDb();
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);
  const offset = Math.max(Number.parseInt(String(options.cursor ?? "0"), 10) || 0, 0);
  const isCursorRequest = Object.prototype.hasOwnProperty.call(options, "cursor");
  const platform = options.platform && options.platform !== "all" ? options.platform : null;
  const query = options.query?.trim();
  const category = options.category?.trim();
  const platformWhere = platform ? eq(marketplaceProducts.platform, platform) : undefined;
  const searchWhere = query
    ? or(
      ilike(marketplaceProducts.productName, `%${query}%`),
      ilike(marketplaceProducts.sourceUrl, `%${query}%`),
      ilike(marketplaceProducts.affiliateUrl, `%${query}%`),
      ilike(marketplaceProducts.brand, `%${query}%`),
      ilike(marketplaceProducts.shopName, `%${query}%`),
      ilike(marketplaceProducts.productCategory, `%${query}%`),
      ilike(marketplaceProducts.externalProductId, `%${query}%`),
      ilike(marketplaceProducts.externalShopId, `%${query}%`),
    )
    : undefined;
  const categoryWhere = category && category !== "all"
    ? or(
      ilike(marketplaceProducts.productCategory, `%${category}%`),
      sql`${marketplaceProducts.platformRawJson}->>'categoryText' ILIKE ${`%${category}%`}`,
      sql`${marketplaceProducts.platformRawJson}->>'category' ILIKE ${`%${category}%`}`,
    )
    : undefined;
  const orderBy = (() => {
    if (options.sortMode === "sold") return desc(marketplaceProducts.soldCountNormalized);
    if (options.sortMode === "rating") return desc(marketplaceProducts.ratingScore);
    return desc(marketplaceProducts.updatedAt);
  })();
  const ownRows = await db.select().from(marketplaceProducts)
    .where(and(eq(marketplaceProducts.userId, auth.userId), excludeSyntheticStoryboardProductsWhere(), platformWhere, searchWhere, categoryWhere))
    .orderBy(orderBy)
    .limit(limit + offset + 1);
  const results: any[] = ownRows.map((product) => ({ ...product, accessType: "owner", sharedByUserId: product.userId, groupId: null }));

  if (!options.ownerOnly && auth.tenantId) {
    const groupIds = await getActiveGroupIds(auth);
    if (groupIds.length > 0) {
      const sharedRows = await db.select({
        product: marketplaceProducts,
        groupId: marketplaceProductGroupShares.groupId,
        sharedByUserId: marketplaceProductGroupShares.sharedByUserId,
        permission: marketplaceProductGroupShares.permission,
      })
        .from(marketplaceProductGroupShares)
        .innerJoin(marketplaceProducts, eq(marketplaceProducts.id, marketplaceProductGroupShares.productId))
        .where(and(
          eq(marketplaceProductGroupShares.tenantId, auth.tenantId),
          inArray(marketplaceProductGroupShares.groupId, groupIds),
          or(eq(marketplaceProductGroupShares.permission, "read"), eq(marketplaceProductGroupShares.permission, "read_update")),
          excludeSyntheticStoryboardProductsWhere(),
          platformWhere,
          searchWhere,
          categoryWhere,
        ))
        .orderBy(orderBy)
        .limit(limit + offset + 1);
      const seen = new Set(results.map((row) => row.id));
      for (const row of sharedRows) {
        if (seen.has(row.product.id)) continue;
        seen.add(row.product.id);
        results.push({ ...row.product, accessType: "group", sharedByUserId: row.sharedByUserId, groupId: row.groupId, permission: row.permission });
      }
    }
  }

  const sorted = results.sort((a, b) => {
    if (options.sortMode === "sold") return Number(b.soldCountNormalized ?? 0) - Number(a.soldCountNormalized ?? 0);
    if (options.sortMode === "rating") return Number(b.ratingScore ?? 0) - Number(a.ratingScore ?? 0);
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
  const pageRows = isCursorRequest ? sorted.slice(offset, offset + limit + 1) : sorted.slice(0, limit);
  const hasMore = pageRows.length > limit;
  const trimmed = pageRows.slice(0, limit);
  const [snapshots, productImages] = await Promise.all([
    snapshotsForProductIds(trimmed.map((product) => product.id)),
    primaryImagesForProducts(trimmed),
  ]);
  const supportingInsights = await supportingInsightsForProducts(trimmed, auth);
  const items = trimmed.map((product) => ({
    ...product,
    imageUrl: productImages.get(product.id)?.imageUrl ?? null,
    imageUrls: productImages.get(product.id)?.imageUrls ?? [],
    health: buildProductHealth(product, snapshots.get(product.id) ?? []),
    latestSnapshot: snapshots.get(product.id)?.[0] ?? null,
    supportingInsights: supportingInsights.get(product.id) ?? null,
  }));
  if (!isCursorRequest) return items;
  return {
    items,
    nextCursor: hasMore ? String(offset + limit) : null,
  };
}

async function marketplaceImageRowsByCaptureAssetIds(
  auth: { userId: number; tenantId?: string },
  assetIds: string[],
  options: {
    ownerOnly?: boolean;
    platform?: MarketplacePlatform | "all";
  } = {},
): Promise<MarketplaceProductImageWithAccess[]> {
  if (assetIds.length === 0) return [];

  const db = getDb();
  const uniqueAssetIds = Array.from(new Set(assetIds.filter(Boolean)));
  const platform = options.platform && options.platform !== "all" ? options.platform : null;
  const platformWhere = platform ? eq(marketplaceProducts.platform, platform) : undefined;

  const own = await db.select({
    image: marketplaceProductImages,
    product: marketplaceProducts,
  })
    .from(marketplaceProductImages)
    .innerJoin(marketplaceProducts, eq(marketplaceProducts.id, marketplaceProductImages.productId))
    .where(and(
      eq(marketplaceProducts.userId, auth.userId),
      inArray(marketplaceProductImages.captureAssetId, uniqueAssetIds),
      excludeSyntheticStoryboardProductsWhere(),
      platformWhere,
    ));
  const rows: MarketplaceProductImageWithAccess[] = own.map((row) => ({
    ...row,
    accessType: "owner",
    sharedByUserId: row.product.userId,
    groupId: null,
    permission: null,
  }));

  if (!options.ownerOnly && auth.tenantId) {
    const groupIds = await getActiveGroupIds(auth);
    if (groupIds.length > 0) {
      const shared = await db.select({
        image: marketplaceProductImages,
        product: marketplaceProducts,
        groupId: marketplaceProductGroupShares.groupId,
        sharedByUserId: marketplaceProductGroupShares.sharedByUserId,
        permission: marketplaceProductGroupShares.permission,
      })
        .from(marketplaceProductImages)
        .innerJoin(marketplaceProducts, eq(marketplaceProducts.id, marketplaceProductImages.productId))
        .innerJoin(marketplaceProductGroupShares, eq(marketplaceProductGroupShares.productId, marketplaceProducts.id))
        .where(and(
          eq(marketplaceProductGroupShares.tenantId, auth.tenantId),
          inArray(marketplaceProductGroupShares.groupId, groupIds),
          inArray(marketplaceProductImages.captureAssetId, uniqueAssetIds),
          or(eq(marketplaceProductGroupShares.permission, "read"), eq(marketplaceProductGroupShares.permission, "read_update")),
          excludeSyntheticStoryboardProductsWhere(),
          platformWhere,
        ));
      for (const row of shared) {
        rows.push({
          image: row.image,
          product: row.product,
          accessType: "group",
          sharedByUserId: row.sharedByUserId,
          groupId: row.groupId,
          permission: row.permission,
        });
      }
    }
  }

  return rows;
}

export async function searchSimilarMarketplaceProductsByImage(
  auth: { userId: number; tenantId?: string },
  options: {
    imageBuffer: Buffer | Uint8Array;
    limit?: number;
    ownerOnly?: boolean;
    platform?: MarketplacePlatform | "all";
  },
) {
  const limit = Math.min(Math.max(options.limit ?? 24, 1), 50);
  const vectorMatches = await searchImagesByBuffer({
    imageBuffer: options.imageBuffer,
    tenantId: auth.tenantId ?? `user:${auth.userId}`,
    limit: Math.min(limit * 4, 100),
    scope: "marketplace",
  });
  const assetIds = vectorMatches
    .map((match) => match.id.replace(/^marketplace-/, ""))
    .filter(Boolean);
  const vectorByAssetId = new Map(
    vectorMatches.map((match, index) => [
      match.id.replace(/^marketplace-/, ""),
      { ...match, rank: index },
    ]),
  );
  const rows = await marketplaceImageRowsByCaptureAssetIds(auth, assetIds, {
    ownerOnly: options.ownerOnly,
    platform: options.platform,
  });
  const rowsByProduct = new Map<string, MarketplaceProductImageWithAccess & {
    visualMatchScore: number;
    visualMatchRank: number;
    visualMatchImageUrl: string | null;
    visualMatchDescription: string;
  }>();

  for (const row of rows) {
    const assetId = row.image.captureAssetId ?? "";
    const match = vectorByAssetId.get(assetId);
    if (!match) continue;
    const existing = rowsByProduct.get(row.product.id);
    if (existing && existing.visualMatchScore >= match.score) continue;
    rowsByProduct.set(row.product.id, {
      ...row,
      visualMatchScore: match.score,
      visualMatchRank: match.rank,
      visualMatchImageUrl: match.imageUrl || row.image.url || null,
      visualMatchDescription: match.description || "",
    });
  }

  const rankedRows = Array.from(rowsByProduct.values())
    .sort((a, b) => {
      if (b.visualMatchScore !== a.visualMatchScore) return b.visualMatchScore - a.visualMatchScore;
      return a.visualMatchRank - b.visualMatchRank;
    })
    .slice(0, limit);

  const [snapshots, productImages] = await Promise.all([
    snapshotsForProductIds(rankedRows.map((row) => row.product.id)),
    primaryImagesForProducts(rankedRows.map((row) => row.product)),
  ]);
  const supportingInsights = await supportingInsightsForProducts(rankedRows.map((row) => row.product), auth);

  return {
    items: rankedRows.map((row) => ({
      ...row.product,
      accessType: row.accessType,
      sharedByUserId: row.sharedByUserId,
      groupId: row.groupId,
      permission: row.permission ?? null,
      imageUrl: productImages.get(row.product.id)?.imageUrl ?? row.visualMatchImageUrl,
      imageUrls: productImages.get(row.product.id)?.imageUrls ?? [],
      matchedImage: {
        id: row.image.id,
        url: row.image.url,
        type: row.image.type,
        score: row.visualMatchScore,
        description: row.visualMatchDescription,
      },
      visualMatchScore: row.visualMatchScore,
      health: buildProductHealth(row.product, snapshots.get(row.product.id) ?? []),
      latestSnapshot: snapshots.get(row.product.id)?.[0] ?? null,
      supportingInsights: supportingInsights.get(row.product.id) ?? null,
    })),
  };
}

export async function listMarketplaceProductImagesForMediaStudio(
  auth: { userId: number; tenantId?: string },
  options: {
    limit?: number;
    cursor?: string | null;
    ownerOnly?: boolean;
    platform?: MarketplacePlatform | "all";
    query?: string;
    productId?: string | null;
  } = {},
) {
  const db = getDb();
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 30);
  const offset = Math.max(Number.parseInt(String(options.cursor ?? "0"), 10) || 0, 0);
  const platform = options.platform && options.platform !== "all" ? options.platform : null;
  const query = options.query?.trim();
  const searchWhere = query
    ? or(
      ilike(marketplaceProducts.productName, `%${query}%`),
      ilike(marketplaceProducts.externalProductId, `%${query}%`),
      ilike(marketplaceProducts.externalShopId, `%${query}%`),
      ilike(marketplaceProducts.sourceUrl, `%${query}%`),
      ilike(marketplaceProducts.affiliateUrl, `%${query}%`),
      ilike(marketplaceProducts.brand, `%${query}%`),
      ilike(marketplaceProducts.shopName, `%${query}%`),
      ilike(marketplaceProducts.productCategory, `%${query}%`),
    )
    : undefined;
  const platformWhere = platform ? eq(marketplaceProducts.platform, platform) : undefined;
  const productWhere = options.productId ? eq(marketplaceProductImages.productId, options.productId) : undefined;

  type ProductImageRow = {
    image: typeof marketplaceProductImages.$inferSelect;
    product: typeof marketplaceProducts.$inferSelect;
    accessType: "owner" | "group";
    sharedByUserId: number | null;
    groupId: number | null;
    permission?: string | null;
  };

  async function rowsByCaptureAssetIds(assetIds: string[]): Promise<ProductImageRow[]> {
    if (assetIds.length === 0) return [];
    const own = await db.select({
      image: marketplaceProductImages,
      product: marketplaceProducts,
    })
      .from(marketplaceProductImages)
      .innerJoin(marketplaceProducts, eq(marketplaceProducts.id, marketplaceProductImages.productId))
      .where(and(
        eq(marketplaceProducts.userId, auth.userId),
        inArray(marketplaceProductImages.captureAssetId, assetIds),
        platformWhere,
        productWhere,
      ));
    const rows: ProductImageRow[] = own.map((row) => ({
      ...row,
      accessType: "owner",
      sharedByUserId: row.product.userId,
      groupId: null,
      permission: null,
    }));
    if (!options.ownerOnly && auth.tenantId) {
      const groupIds = await getActiveGroupIds(auth);
      if (groupIds.length > 0) {
        const shared = await db.select({
          image: marketplaceProductImages,
          product: marketplaceProducts,
          groupId: marketplaceProductGroupShares.groupId,
          sharedByUserId: marketplaceProductGroupShares.sharedByUserId,
          permission: marketplaceProductGroupShares.permission,
        })
          .from(marketplaceProductImages)
          .innerJoin(marketplaceProducts, eq(marketplaceProducts.id, marketplaceProductImages.productId))
          .innerJoin(marketplaceProductGroupShares, eq(marketplaceProductGroupShares.productId, marketplaceProducts.id))
          .where(and(
            eq(marketplaceProductGroupShares.tenantId, auth.tenantId),
            inArray(marketplaceProductGroupShares.groupId, groupIds),
            inArray(marketplaceProductImages.captureAssetId, assetIds),
            or(eq(marketplaceProductGroupShares.permission, "read"), eq(marketplaceProductGroupShares.permission, "read_update")),
            platformWhere,
            productWhere,
          ));
        for (const row of shared) {
          rows.push({
            image: row.image,
            product: row.product,
            accessType: "group",
            sharedByUserId: row.sharedByUserId,
            groupId: row.groupId,
            permission: row.permission,
          });
        }
      }
    }
    return rows;
  }

  let rows: ProductImageRow[] = [];
  let hasMore = false;
  let orderByVectorRank = false;

  if (query) {
    const vectorMatches = await searchImages({
      query,
      tenantId: auth.tenantId ?? `user:${auth.userId}`,
      limit: Math.min(Math.max(offset + limit + 20, limit), 100),
      scope: "marketplace",
    });
    const assetIds = vectorMatches
      .map((match) => match.id.replace(/^marketplace-/, ""))
      .filter(Boolean);
    const vectorRank = new Map(assetIds.map((id, index) => [id, index]));
    rows = await rowsByCaptureAssetIds(assetIds);
    rows = rows.sort((a, b) => {
      const left = a.image.captureAssetId ? vectorRank.get(a.image.captureAssetId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
      const right = b.image.captureAssetId ? vectorRank.get(b.image.captureAssetId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
      return left - right;
    });
    orderByVectorRank = rows.length > 0;
    if (rows.length === 0 && searchWhere) {
      rows = [];
    }
  }

  if (!query || rows.length === 0) {
    const fetchLimit = offset + limit + 1;
    const ownRows = await db.select({
      image: marketplaceProductImages,
      product: marketplaceProducts,
    })
      .from(marketplaceProductImages)
      .innerJoin(marketplaceProducts, eq(marketplaceProducts.id, marketplaceProductImages.productId))
      .where(and(
        eq(marketplaceProducts.userId, auth.userId),
        platformWhere,
        searchWhere,
        productWhere,
      ))
      .orderBy(desc(marketplaceProductImages.createdAt))
      .limit(fetchLimit);

    rows = ownRows.map((row) => ({
      ...row,
      accessType: "owner",
      sharedByUserId: row.product.userId,
      groupId: null,
      permission: null,
    }));

    if (!options.ownerOnly && auth.tenantId) {
      const groupIds = await getActiveGroupIds(auth);
      if (groupIds.length > 0) {
        const sharedRows = await db.select({
          image: marketplaceProductImages,
          product: marketplaceProducts,
          groupId: marketplaceProductGroupShares.groupId,
          sharedByUserId: marketplaceProductGroupShares.sharedByUserId,
          permission: marketplaceProductGroupShares.permission,
        })
          .from(marketplaceProductImages)
          .innerJoin(marketplaceProducts, eq(marketplaceProducts.id, marketplaceProductImages.productId))
          .innerJoin(marketplaceProductGroupShares, eq(marketplaceProductGroupShares.productId, marketplaceProducts.id))
          .where(and(
            eq(marketplaceProductGroupShares.tenantId, auth.tenantId),
            inArray(marketplaceProductGroupShares.groupId, groupIds),
            or(eq(marketplaceProductGroupShares.permission, "read"), eq(marketplaceProductGroupShares.permission, "read_update")),
            platformWhere,
            searchWhere,
            productWhere,
          ))
          .orderBy(desc(marketplaceProductImages.createdAt))
          .limit(fetchLimit);
        for (const row of sharedRows) {
          rows.push({
            image: row.image,
            product: row.product,
            accessType: "group",
            sharedByUserId: row.sharedByUserId,
            groupId: row.groupId,
            permission: row.permission,
          });
        }
      }
    }
  }

  const seen = new Set<string>();
  const images = rows
    .sort((a, b) => orderByVectorRank ? 0 : new Date(b.image.createdAt).getTime() - new Date(a.image.createdAt).getTime())
    .filter((row) => {
      if (seen.has(row.image.id)) return false;
      seen.add(row.image.id);
      return true;
    })
    .slice(offset, offset + limit + 1);
  hasMore = images.length > limit;
  const supportingInsights = await supportingInsightsForProducts(images.slice(0, limit).map((row) => row.product), auth);
  const page = images
    .slice(0, limit)
    .map((row) => ({
      id: row.image.id,
      productId: row.product.id,
      productName: row.product.productName,
      platform: row.product.platform,
      brand: row.product.brand,
      categoryText: (row.product.descriptionJson as any)?.categoryText ?? (row.product.specsJson as any)?.categoryText ?? null,
      productCategory: row.product.productCategory ?? (row.product.descriptionJson as any)?.productCategory ?? (row.product.specsJson as any)?.productCategory ?? null,
      priceCurrent: row.product.priceCurrent,
      priceOriginal: row.product.priceOriginal,
      currency: row.product.currency,
      discountText: row.product.discountText,
      ratingScore: row.product.ratingScore,
      reviewCountText: row.product.reviewCountText,
      soldCountText: row.product.soldCountText,
      shopName: row.product.shopName,
      externalProductId: row.product.externalProductId,
      externalShopId: row.product.externalShopId,
      sourceUrl: row.product.sourceUrl,
      affiliateUrl: row.product.affiliateUrl,
      imageType: row.image.type,
      url: row.image.url,
      storageKey: row.image.storageKey,
      originalSourceUrl: row.image.originalSourceUrl,
      sortOrder: row.image.sortOrder,
      width: row.image.width,
      height: row.image.height,
      metadataJson: row.image.metadataJson,
      createdAt: row.image.createdAt,
      accessType: row.accessType,
      sharedByUserId: row.sharedByUserId,
      groupId: row.groupId,
      permission: row.permission ?? null,
      supportingInsights: supportingInsights.get(row.product.id) ?? null,
    }));

  return {
    images: page,
    total: offset + page.length + (hasMore ? 1 : 0),
    nextCursor: hasMore ? String(offset + limit) : null,
  };
}

export async function getMarketplaceProductWithAccess(productId: string, auth: { userId: number; tenantId?: string }) {
  const db = getDb();
  let accessType: "owner" | "group" = "owner";
  let groupShare: { groupId: number; sharedByUserId: number; permission: string } | null = null;
  let [product] = await db.select().from(marketplaceProducts)
    .where(and(eq(marketplaceProducts.id, productId), eq(marketplaceProducts.userId, auth.userId)))
    .limit(1);

  if (!product && auth.tenantId) {
    const groupIds = await getActiveGroupIds(auth);
    if (groupIds.length > 0) {
      const [shared] = await db.select({
        product: marketplaceProducts,
        groupId: marketplaceProductGroupShares.groupId,
        sharedByUserId: marketplaceProductGroupShares.sharedByUserId,
        permission: marketplaceProductGroupShares.permission,
      })
        .from(marketplaceProductGroupShares)
        .innerJoin(marketplaceProducts, eq(marketplaceProducts.id, marketplaceProductGroupShares.productId))
        .where(and(
          eq(marketplaceProducts.id, productId),
          eq(marketplaceProductGroupShares.tenantId, auth.tenantId),
          inArray(marketplaceProductGroupShares.groupId, groupIds),
          or(eq(marketplaceProductGroupShares.permission, "read"), eq(marketplaceProductGroupShares.permission, "read_update")),
        ))
        .limit(1);
      if (shared) {
        product = shared.product;
        accessType = "group";
        groupShare = { groupId: shared.groupId, sharedByUserId: shared.sharedByUserId, permission: shared.permission };
      }
    }
  }

  if (!product) throw new Error("Product not found");
  const [images, history, shares] = await Promise.all([
    db.select().from(marketplaceProductImages)
      .where(eq(marketplaceProductImages.productId, productId))
      .orderBy(marketplaceProductImages.sortOrder, marketplaceProductImages.createdAt),
    db.select().from(marketplaceProductPriceSnapshots)
      .where(eq(marketplaceProductPriceSnapshots.productId, productId))
      .orderBy(desc(marketplaceProductPriceSnapshots.capturedAt))
      .limit(100),
    db.select({
      groupId: marketplaceProductGroupShares.groupId,
      sharedByUserId: marketplaceProductGroupShares.sharedByUserId,
      permission: marketplaceProductGroupShares.permission,
      createdAt: marketplaceProductGroupShares.createdAt,
    }).from(marketplaceProductGroupShares)
      .where(eq(marketplaceProductGroupShares.productId, productId)),
  ]);
  const productRaw = (product.platformRawJson as Record<string, unknown> | null) ?? {};
  const heroProductImageId = typeof productRaw.heroProductImageId === "string" ? productRaw.heroProductImageId : "";
  const orderedImages = [...images].sort((left, right) => {
    const leftIsCover = (heroProductImageId && left.id === heroProductImageId) || (product.coverImageAssetId && left.captureAssetId === product.coverImageAssetId) ? 0 : 1;
    const rightIsCover = (heroProductImageId && right.id === heroProductImageId) || (product.coverImageAssetId && right.captureAssetId === product.coverImageAssetId) ? 0 : 1;
    return leftIsCover - rightIsCover || (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
  });
  return {
    product: { ...product, accessType, groupShare },
    images: orderedImages,
    history,
    shares,
    health: buildProductHealth(product, history),
  };
}

function assertMarketplaceProductWriteAccess(bundle: Awaited<ReturnType<typeof getMarketplaceProductWithAccess>>) {
  if (bundle.product.accessType === "group" && bundle.product.groupShare?.permission !== "read_update") {
    throw new Error("Product is shared read-only");
  }
}

function editableProductUpdate(input: MarketplaceProductEditableFields) {
  const category = optionalText(input.capturedCategoryText, 300);
  const productCategory = productReferenceCategorySchema.catch("auto").parse(input.productCategory || "auto");
  const productPageUrl = normalizeOptionalHttpUrl(input.productPageUrl);
  const soldCountText = optionalText(input.soldCountText, 128);
  const reviewCountText = optionalText(input.reviewCountText, 128);
  return {
    productName: optionalText(input.productName, 500) || "Manual marketplace product",
    shopName: optionalText(input.shopName, 300),
    priceCurrent: decimalText(input.priceCurrent, { min: 0 }),
    commissionRatePercent: decimalText(input.commissionRatePercent, { min: 0, max: 100 }),
    soldCountText,
    soldCountNormalized: parseSoldCount(soldCountText),
    ratingScore: decimalText(input.ratingScore, { min: 0, max: 5 }),
    reviewCountText,
    descriptionText: optionalText(input.descriptionText, 80_000) ?? "",
    productCategory,
    category,
    productPageUrl,
  };
}

export async function updateMarketplaceProductDetails(
  productId: string,
  input: MarketplaceProductEditableFields,
  auth: { userId: number; tenantId?: string },
) {
  const db = getDb();
  const bundle = await getMarketplaceProductWithAccess(productId, auth);
  assertMarketplaceProductWriteAccess(bundle);
  const currentDescription = bundle.product.descriptionJson && typeof bundle.product.descriptionJson === "object"
    ? bundle.product.descriptionJson as Record<string, unknown>
    : {};
  const currentPlatformRaw = bundle.product.platformRawJson && typeof bundle.product.platformRawJson === "object"
    ? bundle.product.platformRawJson as Record<string, unknown>
    : {};
  const update = editableProductUpdate(input);
  const updatedAt = new Date();
  const [product] = await db.update(marketplaceProducts)
    .set({
      productName: update.productName,
      shopName: update.shopName,
      priceCurrent: update.priceCurrent,
      commissionRatePercent: update.commissionRatePercent,
      soldCountText: update.soldCountText,
      soldCountNormalized: update.soldCountNormalized,
      ratingScore: update.ratingScore,
      reviewCountText: update.reviewCountText,
      descriptionText: update.descriptionText,
      productCategory: update.productCategory,
      descriptionJson: {
        ...currentDescription,
        categoryText: update.category,
        productCategory: update.productCategory,
      },
      platformRawJson: {
        ...currentPlatformRaw,
        productPageUrl: update.productPageUrl,
        latestProductPageUrl: update.productPageUrl,
        categoryText: update.category,
        productCategory: update.productCategory,
        manualUpdatedAt: updatedAt.toISOString(),
        manualUpdatedByUserId: auth.userId,
      },
      updatedAt,
    })
    .where(eq(marketplaceProducts.id, bundle.product.id))
    .returning();
  return { product, updatedAt };
}

export async function createManualMarketplaceProduct(
  input: ManualMarketplaceProductInput,
  auth: { userId: number; tenantId?: string },
) {
  const db = getDb();
  const productId = createMarketplaceId("mp");
  const update = editableProductUpdate(input);
  const productPageUrl = normalizeOptionalHttpUrl(input.productPageUrl);
  const sourceUrl = manualProductSourceUrl(productId, productPageUrl, input.sourceUrl);
  const now = new Date();
  await db.insert(marketplaceProducts).values({
    id: productId,
    captureId: null,
    userId: auth.userId,
    tenantId: auth.tenantId ?? null,
    platform: input.platform,
    sourceUrl,
    affiliateUrl: normalizeOptionalHttpUrl(input.affiliateUrl),
    productName: update.productName,
    shopName: update.shopName,
    priceCurrent: update.priceCurrent,
    commissionRatePercent: update.commissionRatePercent,
    productCategory: update.productCategory,
    ratingScore: update.ratingScore,
    reviewCountText: update.reviewCountText,
    soldCountText: update.soldCountText,
    soldCountNormalized: update.soldCountNormalized,
    descriptionText: update.descriptionText,
    descriptionJson: {
      categoryText: update.category,
      productCategory: update.productCategory,
      manualEntry: true,
    },
    specsJson: {},
    platformRawJson: {
      productPageUrl,
      latestProductPageUrl: productPageUrl,
      categoryText: update.category,
      productCategory: update.productCategory,
      manualEntry: true,
      manualCreatedAt: now.toISOString(),
      manualCreatedByUserId: auth.userId,
    },
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await applyConfiguredShares(productId, input.platform, auth);
  return { productId, productUrl: `/marketplace-capture/products/${productId}` };
}

export async function addMarketplaceProductImageFromUrl(input: {
  productId: string;
  url: string;
  type?: "main" | "description" | "review" | "related_excluded";
  title?: string | null;
  source?: string | null;
  originalSourceUrl?: string | null;
  metadata?: Record<string, unknown>;
}, auth: { userId: number; tenantId?: string }) {
  const db = getDb();
  const access = await getMarketplaceProductForUpdate(input.productId, auth);
  if (!access) {
    throw new Error("Product not found or cannot be updated by this user");
  }

  const url = normalizeAttachableMediaUrl(input.url);
  if (!url) {
    throw new Error("Only HTTP(S) or internal media URLs can be attached to a product");
  }

  const [existing] = await db.select().from(marketplaceProductImages)
    .where(and(eq(marketplaceProductImages.productId, input.productId), eq(marketplaceProductImages.url, url)))
    .limit(1);
  if (existing) {
    return { productId: input.productId, image: existing, created: false };
  }

  const [sortRow] = await db.select({
    maxSortOrder: sql<number>`coalesce(max(${marketplaceProductImages.sortOrder}), -1)`,
  }).from(marketplaceProductImages)
    .where(eq(marketplaceProductImages.productId, input.productId));

  const image = {
    id: createMarketplaceId("mpi"),
    productId: input.productId,
    captureAssetId: null,
    type: input.type ?? "main",
    url,
    storageKey: null,
    originalSourceUrl: normalizeAttachableMediaUrl(input.originalSourceUrl) ?? url,
    sortOrder: Number(sortRow?.maxSortOrder ?? -1) + 1,
    width: null,
    height: null,
    metadataJson: {
      ...(input.metadata ?? {}),
      source: input.source ?? "manual_media_panel_attach",
      title: input.title ?? null,
      addedByUserId: auth.userId,
      addedAt: new Date().toISOString(),
      accessType: access.accessType,
    },
  };

  const [created] = await db.insert(marketplaceProductImages)
    .values(image)
    .returning();

  await db.update(marketplaceProducts)
    .set({ updatedAt: new Date() })
    .where(eq(marketplaceProducts.id, input.productId));

  return { productId: input.productId, image: created, created: true };
}

export async function setMarketplaceProductHeroImage(input: {
  productId: string;
  imageId: string;
}, auth: { userId: number; tenantId?: string }) {
  const db = getDb();
  const access = await getMarketplaceProductForUpdate(input.productId, auth);
  if (!access) {
    throw new Error("Product not found or cannot be updated by this user");
  }

  const [image] = await db.select().from(marketplaceProductImages)
    .where(and(eq(marketplaceProductImages.id, input.imageId), eq(marketplaceProductImages.productId, input.productId)))
    .limit(1);
  if (!image) {
    throw new Error("Product image not found");
  }

  await db.update(marketplaceProducts)
    .set({
      coverImageAssetId: image.captureAssetId ?? access.product.coverImageAssetId ?? null,
      platformRawJson: {
        ...((access.product.platformRawJson as Record<string, unknown> | null) ?? {}),
        heroProductImageId: image.id,
        heroProductImageUrl: image.url,
        heroCaptureAssetId: image.captureAssetId ?? null,
        heroSelectedByUserId: auth.userId,
        heroSelectedAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    })
    .where(eq(marketplaceProducts.id, input.productId));

  await db.update(marketplaceProductImages)
    .set({
      metadataJson: {
        ...(image.metadataJson ?? {}),
        role: "hero",
        heroSelectedByUserId: auth.userId,
        heroSelectedAt: new Date().toISOString(),
        accessType: access.accessType,
      },
    })
    .where(eq(marketplaceProductImages.id, input.imageId));

  return { productId: input.productId, imageId: input.imageId, coverImageAssetId: image.captureAssetId ?? null };
}

export async function removeMarketplaceProductImage(input: {
  productId: string;
  imageId: string;
}, auth: { userId: number; tenantId?: string }) {
  const db = getDb();
  const [image] = await db.select().from(marketplaceProductImages)
    .where(and(eq(marketplaceProductImages.id, input.imageId), eq(marketplaceProductImages.productId, input.productId)))
    .limit(1);
  if (!image) {
    throw new Error("Product image not found");
  }

  const access = await getMarketplaceProductForUpdate(input.productId, auth);
  if (!access) {
    throw new Error("Product not found or cannot be updated by this user");
  }

  await db.delete(marketplaceProductImages)
    .where(and(eq(marketplaceProductImages.id, input.imageId), eq(marketplaceProductImages.productId, input.productId)));

  await db.update(marketplaceProducts)
    .set({
      coverImageAssetId: access.product.coverImageAssetId === image.captureAssetId ? null : access.product.coverImageAssetId,
      platformRawJson: {
        ...((access.product.platformRawJson as Record<string, unknown> | null) ?? {}),
        ...(String((access.product.platformRawJson as Record<string, unknown> | null)?.heroProductImageId ?? "") === input.imageId
          ? { heroProductImageId: null, heroProductImageUrl: null, heroCaptureAssetId: null }
          : {}),
      },
      updatedAt: new Date(),
    })
    .where(eq(marketplaceProducts.id, input.productId));

  return {
    productId: input.productId,
    imageId: input.imageId,
    deleted: true,
    sourceUrl: image.url,
  };
}

export async function deleteMarketplaceProduct(productId: string, auth: { userId: number }) {
  const db = getDb();
  const [product] = await db.select({
    id: marketplaceProducts.id,
    productName: marketplaceProducts.productName,
    userId: marketplaceProducts.userId,
  }).from(marketplaceProducts)
    .where(and(eq(marketplaceProducts.id, productId), eq(marketplaceProducts.userId, auth.userId)))
    .limit(1);

  if (!product) {
    throw new Error("Product not found or cannot be deleted by this user");
  }

  await db.delete(marketplaceProducts)
    .where(and(eq(marketplaceProducts.id, productId), eq(marketplaceProducts.userId, auth.userId)));

  return {
    productId,
    productName: product.productName,
    deleted: true,
  };
}
