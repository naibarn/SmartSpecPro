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
  marketplaceUserShareSettings,
  userGroups,
} from "../../drizzle/schema";
import { marketplaceConfirmProductSchema, parseReviewCount, parseSoldCount, productReferenceCategorySchema, type LocalInsightType, type MarketplacePlatform } from "@shared/marketplaceCapture";
import { createMarketplaceId, getMarketplaceCaptureForUser } from "./marketplaceCaptureService";
import { searchImages } from "./vectorize-search";

function money(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : null;
}

function percent(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value.toFixed(2) : null;
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

function productIdentityWhere(capture: { platform: MarketplacePlatform; externalProductId: string | null; externalShopId: string | null }) {
  if (!capture.externalProductId) return undefined;
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

async function findAccessibleDuplicate(capture: { platform: MarketplacePlatform; externalProductId: string | null; externalShopId: string | null }, auth: { userId: number; tenantId?: string }) {
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

async function insertMetricSnapshot(productId: string, captureId: string, product: any, auth: { userId: number }) {
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
    commissionRatePercent: percent(product.commissionRatePercent),
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
  const rawSoldCountText = product.rating.soldCountText ?? null;
  const soldCountNormalized = parseSoldCount(rawSoldCountText);
  const soldCountText = countText(soldCountNormalized, rawSoldCountText);
  const rawReviewCountText = product.rating.reviewCountText ?? null;
  const reviewCountNormalized = parseReviewCount(rawReviewCountText);
  const reviewCountText = countText(reviewCountNormalized, rawReviewCountText);
  if (capture.externalProductId) {
    const duplicate = await findAccessibleDuplicate(capture, auth);
    if (duplicate) {
      const existing = duplicate.product;
      await db.update(marketplaceProducts)
        .set({
          priceCurrent: money(product.price.current),
          priceOriginal: money(product.price.original),
          currency: product.price.currency ?? existing.currency ?? "THB",
          discountText: product.price.discountText ?? existing.discountText,
          commissionRatePercent: percent(product.commissionRatePercent) ?? existing.commissionRatePercent,
          productCategory: productCategory ?? existing.productCategory,
          affiliateUrl: affiliateUrl ?? existing.affiliateUrl,
          sourceUrl: capture.sourceUrl,
          captureId,
          ratingScore: money(product.rating.score),
          reviewCountText: reviewCountText ?? existing.reviewCountText,
          soldCountText: soldCountText ?? existing.soldCountText,
          soldCountNormalized: soldCountNormalized ?? existing.soldCountNormalized,
          descriptionJson: {
            ...((existing.descriptionJson as Record<string, unknown>) ?? {}),
            ...(capturedCategoryText ? { categoryText: capturedCategoryText } : {}),
            ...(capturedCategoryPath ? { categoryPath: capturedCategoryPath } : {}),
            ...(productCategory ? { productCategory } : {}),
          },
          platformRawJson: {
            ...(existing.platformRawJson as Record<string, unknown> ?? {}),
            latestCaptureId: captureId,
            latestCapturedAt: new Date().toISOString(),
            latestCapturedByUserId: auth.userId,
            duplicateAccessType: duplicate.accessType,
            latestAffiliateUrl: affiliateUrl ?? existing.affiliateUrl ?? null,
            latestProductCategory: productCategory ?? existing.productCategory ?? null,
            latestProductDraft: product.platformRawJson,
          },
          updatedAt: new Date(),
        })
        .where(eq(marketplaceProducts.id, existing.id));

      await insertMetricSnapshot(existing.id, captureId, product, auth);
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
  const assetIds = [...product.images.main, ...product.images.description, ...product.images.review, ...product.images.relatedExcluded];
  const assetRows = assetIds.length > 0
    ? await db.select().from(marketplaceCaptureAssets)
      .where(and(eq(marketplaceCaptureAssets.captureId, captureId), eq(marketplaceCaptureAssets.userId, auth.userId)))
    : [];
  const assetById = new Map(assetRows.map((asset) => [asset.id, asset]));
  const coverImageAssetId = product.images.coverAssetId && assetById.has(product.images.coverAssetId)
    ? product.images.coverAssetId
    : null;

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
      productCategory,
      categoryText: capturedCategoryText,
      categoryPath: capturedCategoryPath,
    },
    coverImageAssetId,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const rows = [
    ...product.images.main.map((assetId, index) => ({ assetId, type: "main" as const, sortOrder: index })),
    ...product.images.description.map((assetId, index) => ({ assetId, type: "description" as const, sortOrder: index })),
    ...product.images.review.map((assetId, index) => ({ assetId, type: "review" as const, sortOrder: index })),
    ...product.images.relatedExcluded.map((assetId, index) => ({ assetId, type: "related_excluded" as const, sortOrder: index })),
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
      metadataJson: asset.metadataJson ?? {},
    };
  });
  if (rows.length > 0) {
    await db.insert(marketplaceProductImages).values(rows);
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
  return { saved: true, setting: row };
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

export async function listMarketplaceProductsWithAccess(
  auth: { userId: number; tenantId?: string },
  options: {
    limit?: number;
    ownerOnly?: boolean;
    platform?: MarketplacePlatform | "all";
    query?: string;
  } = {},
) {
  const db = getDb();
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);
  const platform = options.platform && options.platform !== "all" ? options.platform : null;
  const query = options.query?.trim();
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
  const ownRows = await db.select().from(marketplaceProducts)
    .where(and(eq(marketplaceProducts.userId, auth.userId), platformWhere, searchWhere))
    .orderBy(desc(marketplaceProducts.updatedAt))
    .limit(limit);
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
          platformWhere,
          searchWhere,
        ))
        .orderBy(desc(marketplaceProducts.updatedAt))
        .limit(limit);
      const seen = new Set(results.map((row) => row.id));
      for (const row of sharedRows) {
        if (seen.has(row.product.id)) continue;
        seen.add(row.product.id);
        results.push({ ...row.product, accessType: "group", sharedByUserId: row.sharedByUserId, groupId: row.groupId, permission: row.permission });
      }
    }
  }

  const trimmed = results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, limit);
  const snapshots = await snapshotsForProductIds(trimmed.map((product) => product.id));
  const supportingInsights = await supportingInsightsForProducts(trimmed, auth);
  return trimmed.map((product) => ({
    ...product,
    health: buildProductHealth(product, snapshots.get(product.id) ?? []),
    latestSnapshot: snapshots.get(product.id)?.[0] ?? null,
    supportingInsights: supportingInsights.get(product.id) ?? null,
  }));
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
  return {
    product: { ...product, accessType, groupShare },
    images,
    history,
    shares,
    health: buildProductHealth(product, history),
  };
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
    .set({ updatedAt: new Date() })
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
