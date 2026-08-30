import crypto from "crypto";
import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  marketplaceCandidateBatches,
  marketplaceCandidateItems,
  marketplaceExtensionPairings,
  marketplaceCaptureAssets,
  marketplaceCaptureSessions,
  marketplaceProductImages,
  marketplaceProducts,
} from "../../drizzle/schema";
import {
  categoryCandidatesUploadSchema,
  createMarketplaceCaptureDraftSchema,
  marketplaceConfirmProductSchema,
  normalizeTextSnippet,
  parseShopeeProductUrl,
  parseTikTokShopUrl,
  type CreateMarketplaceCaptureDraftInput,
} from "@shared/marketplaceCapture";
import { marketplaceCaptureError } from "./marketplaceCaptureConfig";
import { mirrorMarketplaceImageCandidates } from "./marketplaceAssetService";
import { marketplaceAssetMediaUrl, marketplaceMediaUrl } from "./marketplaceMediaUrl";
import { marketplaceOwnerTenantScope } from "./marketplaceTenantScope";

function id(prefix: string) {
  return `${prefix}_${crypto.randomBytes(16).toString("hex")}`;
}

export function createMarketplaceId(prefix: string) {
  return id(prefix);
}

function validateMarketplaceSourceUrl(platform: string, sourceUrl: string) {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw marketplaceCaptureError("invalid_source_url", "Invalid source URL", 400);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw marketplaceCaptureError("invalid_source_url_protocol", "Marketplace source URL must be HTTP(S)", 400);
  }
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  const forbidden = /\/(cart|checkout|buyer|user|account|orders?|seller|chat|messages?)(\/|$)/i;
  if (forbidden.test(path)) {
    throw marketplaceCaptureError("forbidden_marketplace_page", "Capture is not allowed on cart, checkout, account, order, seller, chat, or message pages", 400);
  }
  if (platform === "shopee" && !(host === "shopee.co.th" || host.endsWith(".shopee.co.th"))) {
    throw marketplaceCaptureError("platform_host_mismatch", "Shopee captures must come from shopee.co.th", 400);
  }
  if (platform === "tiktok_shop" && !(host === "shop.tiktok.com" || host.endsWith(".tiktokglobalshop.com") || host === "www.tiktok.com")) {
    throw marketplaceCaptureError("platform_host_mismatch", "TikTok Shop captures must come from TikTok Shop hosts", 400);
  }
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

type MarketplaceCaptureSession = typeof marketplaceCaptureSessions.$inferSelect;
type MarketplaceCandidateItem = typeof marketplaceCandidateItems.$inferSelect;

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
    if (text) seen.add(text);
  }
  return Array.from(seen);
}

function normalizeCommissionPercent(value: unknown): number | null {
  const raw = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value.replace("%", "").trim())
      : NaN;
  if (!Number.isFinite(raw) || raw < 0 || raw > 100) return null;
  return raw;
}

function normalizeCommissionText(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : null;
}

function appendEvidence(value: unknown, next: string) {
  const existing = Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
  return Array.from(new Set([...existing, next]));
}

async function findLatestCandidateForCapture(capture: MarketplaceCaptureSession, auth: { userId: number; tenantId?: string }) {
  const db = getDb();
  const raw = asRecord(capture.rawPayloadJson);
  const shopeeUrl = asRecord(raw.shopeeUrl);
  const tiktokUrl = asRecord(raw.tiktokUrl);
  const productIds = uniqueStrings([
    capture.externalProductId,
    raw.externalProductId,
    shopeeUrl.itemId,
    tiktokUrl.productId,
  ]);

  if (productIds.length > 0) {
    const filters = [
      eq(marketplaceCandidateItems.userId, auth.userId),
      eq(marketplaceCandidateItems.platform, capture.platform),
      inArray(marketplaceCandidateItems.externalProductId, productIds),
    ];
    if (capture.externalShopId) {
      filters.push(sql`(${marketplaceCandidateItems.externalShopId} = ${capture.externalShopId} OR ${marketplaceCandidateItems.externalShopId} IS NULL)`);
    }
    const order = capture.externalShopId
      ? [
        sql`CASE WHEN ${marketplaceCandidateItems.externalShopId} = ${capture.externalShopId} THEN 0 ELSE 1 END`,
        sql`CASE WHEN ${marketplaceCandidateItems.affiliateUrl} IS NOT NULL THEN 0 ELSE 1 END`,
        desc(marketplaceCandidateItems.createdAt),
      ]
      : [
        sql`CASE WHEN ${marketplaceCandidateItems.affiliateUrl} IS NOT NULL THEN 0 ELSE 1 END`,
        desc(marketplaceCandidateItems.createdAt),
      ];
    const [candidateRow] = await db.select({ item: marketplaceCandidateItems })
      .from(marketplaceCandidateItems)
      .innerJoin(marketplaceCandidateBatches, eq(marketplaceCandidateBatches.id, marketplaceCandidateItems.batchId))
      .where(and(
        ...filters,
        eq(marketplaceCandidateBatches.userId, auth.userId),
        marketplaceOwnerTenantScope(marketplaceCandidateBatches.tenantId, auth.tenantId),
      ))
      .orderBy(...order)
      .limit(1);
    const candidate = candidateRow?.item;
    if (candidate) return candidate;
  }

  const sourceUrls = uniqueStrings([
    normalizeOptionalHttpUrl(capture.sourceUrl),
    normalizeOptionalHttpUrl(raw.sourceUrl),
    normalizeOptionalHttpUrl(raw.originalSourceUrl),
    normalizeOptionalHttpUrl(raw.cleanSourceUrl),
    normalizeOptionalHttpUrl(raw.canonicalSourceUrl),
  ]);
  if (sourceUrls.length === 0) return null;

  const [candidateRow] = await db.select({ item: marketplaceCandidateItems })
    .from(marketplaceCandidateItems)
    .innerJoin(marketplaceCandidateBatches, eq(marketplaceCandidateBatches.id, marketplaceCandidateItems.batchId))
    .where(and(
      eq(marketplaceCandidateItems.userId, auth.userId),
      eq(marketplaceCandidateItems.platform, capture.platform),
      inArray(marketplaceCandidateItems.sourceUrl, sourceUrls),
      eq(marketplaceCandidateBatches.userId, auth.userId),
      marketplaceOwnerTenantScope(marketplaceCandidateBatches.tenantId, auth.tenantId),
    ))
    .orderBy(
      sql`CASE WHEN ${marketplaceCandidateItems.affiliateUrl} IS NOT NULL THEN 0 ELSE 1 END`,
      desc(marketplaceCandidateItems.createdAt),
    )
    .limit(1);
  return candidateRow?.item ?? null;
}

function mergeMarketplaceCandidateFallback(capture: MarketplaceCaptureSession, candidate: MarketplaceCandidateItem | null) {
  const raw = asRecord(capture.rawPayloadJson);
  const normalized = asRecord(capture.normalizedResultJson ?? capture.llmResultJson);
  const candidateRaw = asRecord(candidate?.rawJson);
  const candidateAffiliateUrl = normalizeOptionalHttpUrl(candidate?.affiliateUrl ?? candidateRaw.affiliateUrl);
  const candidateCommissionCheckUrl = normalizeOptionalHttpUrl(
    candidateRaw.commissionCheckUrl ?? candidateRaw.offerUrl ?? candidateRaw.offerSpecificUrl,
  );
  const captureAffiliateUrl = normalizeOptionalHttpUrl(capture.affiliateUrl);
  const rawAffiliateUrl = normalizeOptionalHttpUrl(raw.affiliateUrl);
  const normalizedAffiliateUrl = normalizeOptionalHttpUrl(normalized.affiliateUrl);
  const rawCommissionCheckUrl = normalizeOptionalHttpUrl(raw.commissionCheckUrl);
  const normalizedCommissionCheckUrl = normalizeOptionalHttpUrl(normalized.commissionCheckUrl);
  const normalizedPlatformRaw = asRecord(normalized.platformRawJson);
  const normalizedPlatformCommissionCheckUrl = normalizeOptionalHttpUrl(normalizedPlatformRaw.commissionCheckUrl);
  const effectiveAffiliateUrl = captureAffiliateUrl || rawAffiliateUrl || normalizedAffiliateUrl || candidateAffiliateUrl;
  const effectiveCommissionCheckUrl = rawCommissionCheckUrl || normalizedCommissionCheckUrl || normalizedPlatformCommissionCheckUrl || candidateCommissionCheckUrl;

  const rawCommissionPercent = normalizeCommissionPercent(raw.commissionRatePercent);
  const normalizedCommissionPercent = normalizeCommissionPercent(normalized.commissionRatePercent);
  const candidateCommissionPercent = normalizeCommissionPercent(candidateRaw.commissionRatePercent);
  const effectiveCommissionPercent = normalizedCommissionPercent ?? rawCommissionPercent ?? candidateCommissionPercent;
  const effectiveCommissionText = normalizeCommissionText(raw.commissionRateText)
    || normalizeCommissionText(candidateRaw.commissionRateText)
    || (effectiveCommissionPercent != null ? String(effectiveCommissionPercent) : null);

  let changed = false;
  const nextRaw = { ...raw };
  const nextNormalized = { ...normalized };
  const confidence = asRecord(nextNormalized.confidence);
  const evidence = asRecord(nextNormalized.evidence);
  let nextCaptureAffiliateUrl = capture.affiliateUrl;

  if (effectiveAffiliateUrl && !captureAffiliateUrl) {
    nextCaptureAffiliateUrl = effectiveAffiliateUrl;
    changed = true;
  }
  if (effectiveAffiliateUrl && !rawAffiliateUrl) {
    nextRaw.affiliateUrl = effectiveAffiliateUrl;
    changed = true;
  }
  if (effectiveAffiliateUrl && !normalizedAffiliateUrl) {
    nextNormalized.affiliateUrl = effectiveAffiliateUrl;
    confidence.affiliateUrl = 1;
    evidence.affiliateUrl = appendEvidence(evidence.affiliateUrl, "candidate:affiliate_url");
    changed = true;
  }
  if (effectiveCommissionCheckUrl && !rawCommissionCheckUrl) {
    nextRaw.commissionCheckUrl = effectiveCommissionCheckUrl;
    changed = true;
  }
  if (effectiveCommissionCheckUrl && !normalizedCommissionCheckUrl) {
    nextNormalized.commissionCheckUrl = effectiveCommissionCheckUrl;
    nextNormalized.platformRawJson = {
      ...normalizedPlatformRaw,
      commissionCheckUrl: effectiveCommissionCheckUrl,
    };
    confidence.commissionCheckUrl = 1;
    evidence.commissionCheckUrl = appendEvidence(evidence.commissionCheckUrl, "candidate:commission_check_url");
    changed = true;
  }
  if (effectiveCommissionPercent != null && rawCommissionPercent == null) {
    nextRaw.commissionRatePercent = effectiveCommissionPercent;
    if (effectiveCommissionText) nextRaw.commissionRateText = effectiveCommissionText;
    changed = true;
  }
  if (effectiveCommissionPercent != null && normalizedCommissionPercent == null) {
    nextNormalized.commissionRatePercent = effectiveCommissionPercent;
    confidence.commissionRate = 1;
    evidence.commissionRate = appendEvidence(evidence.commissionRate, "candidate:commission_rate");
    changed = true;
  }

  if (!changed) return { capture, changed: false };

  const match = candidate ? {
    candidateItemId: candidate.id,
    candidateBatchId: candidate.batchId,
    basis: candidate.externalProductId ? "externalProductId" : "sourceUrl",
    matchedAt: new Date().toISOString(),
    sourceUrl: candidate.sourceUrl,
    title: candidate.title,
  } : {
    basis: "capture_payload",
    matchedAt: new Date().toISOString(),
  };
  nextRaw.marketplaceCandidateMatch = match;
  nextNormalized.marketplaceCandidateMatch = match;
  nextNormalized.confidence = confidence;
  nextNormalized.evidence = evidence;

  return {
    capture: {
      ...capture,
      affiliateUrl: nextCaptureAffiliateUrl,
      rawPayloadJson: nextRaw,
      normalizedResultJson: nextNormalized,
    },
    changed: true,
  };
}

export async function createMarketplaceCaptureDraft(input: CreateMarketplaceCaptureDraftInput, auth: { userId: number; tenantId?: string }) {
  const parsed = createMarketplaceCaptureDraftSchema.parse(input);
  const shopeeUrl = parsed.platform === "shopee" ? parseShopeeProductUrl(parsed.sourceUrl) : null;
  const tiktokUrl = parsed.platform === "tiktok_shop" ? parseTikTokShopUrl(parsed.sourceUrl) : null;
  const sourceUrl = parsed.platform === "shopee" && shopeeUrl?.canonicalUrl
    ? shopeeUrl.canonicalUrl
    : parsed.platform === "tiktok_shop" && tiktokUrl?.canonicalUrl
      ? tiktokUrl.canonicalUrl
      : parsed.sourceUrl;
  validateMarketplaceSourceUrl(parsed.platform, sourceUrl);
  const externalProductId = parsed.externalProductId ?? shopeeUrl?.itemId ?? tiktokUrl?.productId ?? null;
  const externalShopId = parsed.externalShopId ?? shopeeUrl?.shopId ?? null;
  const affiliateUrl = normalizeOptionalHttpUrl(parsed.affiliateUrl ?? (parsed.rawPayload as Record<string, unknown>)?.affiliateUrl);
  const now = new Date();
  const db = getDb();
  const rawPayloadJson = {
    ...(parsed.rawPayload as Record<string, unknown>),
    affiliateUrl,
    originalSourceUrl: parsed.originalSourceUrl ?? shopeeUrl?.originalUrl ?? tiktokUrl?.originalUrl ?? parsed.sourceUrl,
    cleanSourceUrl: parsed.cleanSourceUrl ?? shopeeUrl?.cleanUrl ?? tiktokUrl?.cleanUrl ?? parsed.sourceUrl,
    canonicalSourceUrl: parsed.canonicalSourceUrl ?? shopeeUrl?.canonicalUrl ?? tiktokUrl?.canonicalUrl ?? null,
    productPageUrl: parsed.productPageUrl ?? parsed.canonicalSourceUrl ?? tiktokUrl?.canonicalUrl ?? tiktokUrl?.cleanUrl ?? parsed.sourceUrl,
    sourceUrlFormat: parsed.sourceUrlFormat ?? shopeeUrl?.format ?? tiktokUrl?.format,
    shopeeUrl,
    tiktokUrl,
  };

  let existingCapture: typeof marketplaceCaptureSessions.$inferSelect | null = null;
  if (externalProductId && externalShopId) {
    [existingCapture] = await db.select().from(marketplaceCaptureSessions)
      .where(and(
        eq(marketplaceCaptureSessions.userId, auth.userId),
        marketplaceOwnerTenantScope(marketplaceCaptureSessions.tenantId, auth.tenantId),
        eq(marketplaceCaptureSessions.platform, parsed.platform),
        eq(marketplaceCaptureSessions.externalShopId, externalShopId),
        eq(marketplaceCaptureSessions.externalProductId, externalProductId),
        sql`${marketplaceCaptureSessions.status} NOT IN ('confirmed', 'discarded')`,
      ))
      .limit(1);
  }
  if (!existingCapture && externalProductId) {
    [existingCapture] = await db.select().from(marketplaceCaptureSessions)
      .where(and(
        eq(marketplaceCaptureSessions.userId, auth.userId),
        marketplaceOwnerTenantScope(marketplaceCaptureSessions.tenantId, auth.tenantId),
        eq(marketplaceCaptureSessions.platform, parsed.platform),
        eq(marketplaceCaptureSessions.externalProductId, externalProductId),
        eq(marketplaceCaptureSessions.sourceUrl, sourceUrl),
        sql`${marketplaceCaptureSessions.status} NOT IN ('confirmed', 'discarded')`,
      ))
      .limit(1);
  }
  if (existingCapture && ["confirmed", "discarded"].includes(existingCapture.status)) {
    existingCapture = null;
  }

  const captureId = existingCapture?.id ?? id("cap");
  const baseCaptureValues = {
    tenantId: auth.tenantId ?? null,
    pageType: parsed.pageType,
    sourceUrl,
    affiliateUrl,
    pageTitle: parsed.pageTitle ?? null,
    externalProductId,
    externalShopId,
    status: "captured",
    rawDomText: normalizeTextSnippet(parsed.domText, 80_000),
    rawPayloadJson,
    htmlBlocksJson: parsed.htmlBlocks,
    imageCandidatesJson: parsed.imageCandidates,
    categoryContextJson: parsed.categoryContext ?? null,
    errorMessage: null,
    updatedAt: now,
  } as const;

  if (existingCapture) {
    if (existingCapture.status !== "confirmed") {
      await db.delete(marketplaceCaptureAssets)
        .where(and(
          eq(marketplaceCaptureAssets.captureId, captureId),
          eq(marketplaceCaptureAssets.userId, auth.userId),
          marketplaceOwnerTenantScope(marketplaceCaptureAssets.tenantId, auth.tenantId),
        ));
    }
    await db.update(marketplaceCaptureSessions)
      .set(baseCaptureValues)
      .where(and(
        eq(marketplaceCaptureSessions.id, captureId),
        eq(marketplaceCaptureSessions.userId, auth.userId),
        marketplaceOwnerTenantScope(marketplaceCaptureSessions.tenantId, auth.tenantId),
      ));
  } else {
    await db.insert(marketplaceCaptureSessions).values({
      id: captureId,
      userId: auth.userId,
      platform: parsed.platform,
      createdAt: now,
      ...baseCaptureValues,
    });
  }

  if (parsed.imageCandidates.length > 0) {
    const payload = parsed.rawPayload as Record<string, any>;
    const shopName = typeof payload.shopName === "string"
      ? payload.shopName
      : typeof payload.shopNameText === "string"
        ? payload.shopNameText
        : typeof payload.shop?.name === "string"
          ? payload.shop.name as string
          : null;

    const mirrored = await mirrorMarketplaceImageCandidates({
      captureId,
      userId: auth.userId,
      tenantId: auth.tenantId,
      candidates: parsed.imageCandidates,
      productName: String(payload.productName ?? parsed.pageTitle ?? ""),
      productDescription: String(payload.descriptionText ?? ""),
      platform: parsed.platform,
      sourceUrl,
      externalShopId,
      externalProductId,
      shopName,
    });
    await db.update(marketplaceCaptureSessions)
      .set({
        imageCandidatesJson: mirrored.imageCandidates,
        rawPayloadJson: {
          ...rawPayloadJson,
          marketplaceImageMirror: {
            requested: parsed.imageCandidates.length,
            mirrored: mirrored.imageCandidates.length,
            failed: mirrored.errors.length,
            errors: mirrored.errors.slice(0, 10),
          },
        },
        updatedAt: new Date(),
      })
      .where(and(
        eq(marketplaceCaptureSessions.id, captureId),
        eq(marketplaceCaptureSessions.userId, auth.userId),
        marketplaceOwnerTenantScope(marketplaceCaptureSessions.tenantId, auth.tenantId),
      ));
  }

  return {
    captureId,
    status: "captured",
    uploadUrlMode: "multipart",
    next: {
      uploadAssets: `/api/marketplace-captures/captures/${captureId}/assets`,
      analyze: `/api/marketplace-captures/captures/${captureId}/analyze`,
    },
  };
}

export async function getMarketplaceCaptureForUser(captureId: string, auth: { userId: number; tenantId?: string }) {
  const db = getDb();
  const [capture] = await db.select().from(marketplaceCaptureSessions)
    .where(and(
      eq(marketplaceCaptureSessions.id, captureId),
      eq(marketplaceCaptureSessions.userId, auth.userId),
      marketplaceOwnerTenantScope(marketplaceCaptureSessions.tenantId, auth.tenantId),
    ))
    .limit(1);
  if (!capture) throw marketplaceCaptureError("capture_not_found", "Capture not found", 404);
  const candidate = await findLatestCandidateForCapture(capture, auth);
  const enriched = mergeMarketplaceCandidateFallback(capture, candidate);
  if (enriched.changed) {
    await db.update(marketplaceCaptureSessions)
      .set({
        affiliateUrl: enriched.capture.affiliateUrl,
        rawPayloadJson: enriched.capture.rawPayloadJson,
        normalizedResultJson: enriched.capture.normalizedResultJson,
        updatedAt: new Date(),
      })
      .where(and(
        eq(marketplaceCaptureSessions.id, captureId),
        eq(marketplaceCaptureSessions.userId, auth.userId),
        marketplaceOwnerTenantScope(marketplaceCaptureSessions.tenantId, auth.tenantId),
      ));
  }
  const assets = await db.select().from(marketplaceCaptureAssets)
    .where(and(
      eq(marketplaceCaptureAssets.captureId, captureId),
      eq(marketplaceCaptureAssets.userId, auth.userId),
      marketplaceOwnerTenantScope(marketplaceCaptureAssets.tenantId, auth.tenantId),
    ))
    .orderBy(marketplaceCaptureAssets.sortOrder, marketplaceCaptureAssets.createdAt);
  return {
    capture: enriched.capture,
    assets: assets.map((asset) => ({
      ...asset,
      url: marketplaceAssetMediaUrl(asset),
    })),
  };
}

export async function saveMarketplaceCaptureDraftEdits(captureId: string, input: unknown, auth: { userId: number; tenantId?: string }) {
  const parsed = marketplaceConfirmProductSchema.parse(input);
  const { capture } = await getMarketplaceCaptureForUser(captureId, auth);
  const product = parsed.product;
  const affiliateUrl = normalizeOptionalHttpUrl(product.affiliateUrl ?? capture.affiliateUrl ?? (capture.rawPayloadJson as Record<string, unknown> | undefined)?.affiliateUrl);
  const savedDraft = {
    ...(capture.normalizedResultJson ?? {}),
    productName: product.productName,
    brand: product.brand ?? null,
    shop: { name: product.shopName ?? null, isMall: product.isMall ?? null },
    price: product.price,
    affiliateUrl,
    productCategory: product.productCategory ?? (product.platformRawJson as Record<string, unknown> | undefined)?.productCategory ?? (capture.rawPayloadJson as Record<string, unknown> | undefined)?.productCategory ?? null,
    commissionRatePercent: product.commissionRatePercent ?? null,
    rating: product.rating,
    description: {
      rawText: product.description.rawText,
      ingredients: product.description.ingredients,
      claims: product.description.claims,
      specs: product.description.specs,
    },
    images: {
      main: product.images.main,
      description: product.images.description,
      review: product.images.review,
      excludedRelated: product.images.relatedExcluded,
      coverAssetId: product.images.coverAssetId ?? null,
    },
    platformRawJson: {
      ...product.platformRawJson,
      productCategory: product.productCategory ?? (product.platformRawJson as Record<string, unknown> | undefined)?.productCategory ?? null,
    },
    draftSavedAt: new Date().toISOString(),
    userEdited: true,
  };
  const db = getDb();
  await db.update(marketplaceCaptureSessions)
    .set({ affiliateUrl, normalizedResultJson: savedDraft, updatedAt: new Date() })
    .where(and(
      eq(marketplaceCaptureSessions.id, captureId),
      eq(marketplaceCaptureSessions.userId, auth.userId),
      marketplaceOwnerTenantScope(marketplaceCaptureSessions.tenantId, auth.tenantId),
    ));
  return { captureId, status: capture.status, saved: true, savedAt: savedDraft.draftSavedAt };
}

export async function discardMarketplaceCapture(captureId: string, auth: { userId: number; tenantId?: string }) {
  const { capture } = await getMarketplaceCaptureForUser(captureId, auth);
  if (capture.status === "confirmed") throw marketplaceCaptureError("capture_confirmed", "Confirmed captures cannot be discarded", 409);
  const db = getDb();
  await db.update(marketplaceCaptureSessions)
    .set({ status: "discarded", updatedAt: new Date() })
    .where(and(
      eq(marketplaceCaptureSessions.id, captureId),
      eq(marketplaceCaptureSessions.userId, auth.userId),
      marketplaceOwnerTenantScope(marketplaceCaptureSessions.tenantId, auth.tenantId),
    ));
  return { captureId, status: "discarded" };
}

export async function listMarketplaceCapturesForUser(auth: { userId: number; tenantId?: string }, limit = 30) {
  const db = getDb();
  return db.select().from(marketplaceCaptureSessions)
    .where(and(
      eq(marketplaceCaptureSessions.userId, auth.userId),
      marketplaceOwnerTenantScope(marketplaceCaptureSessions.tenantId, auth.tenantId),
    ))
    .orderBy(desc(marketplaceCaptureSessions.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function listMarketplaceProductsForUser(auth: { userId: number; tenantId?: string }, limit = 30) {
  const db = getDb();
  return db.select().from(marketplaceProducts)
    .where(and(
      eq(marketplaceProducts.userId, auth.userId),
      marketplaceOwnerTenantScope(marketplaceProducts.tenantId, auth.tenantId),
    ))
    .orderBy(desc(marketplaceProducts.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function getMarketplaceProductForUser(productId: string, auth: { userId: number; tenantId?: string }) {
  const db = getDb();
  const [product] = await db.select().from(marketplaceProducts)
    .where(and(
      eq(marketplaceProducts.id, productId),
      eq(marketplaceProducts.userId, auth.userId),
      marketplaceOwnerTenantScope(marketplaceProducts.tenantId, auth.tenantId),
    ))
    .limit(1);
  if (!product) throw marketplaceCaptureError("product_not_found", "Product not found", 404);
  const images = await db.select().from(marketplaceProductImages)
    .where(eq(marketplaceProductImages.productId, productId))
    .orderBy(marketplaceProductImages.sortOrder, marketplaceProductImages.createdAt);
  const captureAssetIds = Array.from(new Set(images.map((image) => image.captureAssetId).filter(Boolean))) as string[];
  const captureAssets = captureAssetIds.length > 0
    ? await db.select().from(marketplaceCaptureAssets).where(and(
      inArray(marketplaceCaptureAssets.id, captureAssetIds),
      eq(marketplaceCaptureAssets.userId, auth.userId),
      marketplaceOwnerTenantScope(marketplaceCaptureAssets.tenantId, auth.tenantId),
    ))
    : [];
  const captureAssetById = new Map(captureAssets.map((asset) => [asset.id, asset]));
  return {
    product,
    images: images.map((image) => ({
      ...image,
      url: marketplaceMediaUrl(
        captureAssetById.get(image.captureAssetId ?? "")?.storageKey ?? image.storageKey,
        image.url || captureAssetById.get(image.captureAssetId ?? "")?.url,
      ),
    })),
  };
}

export async function listMarketplaceCandidateBatchesForUser(auth: { userId: number; tenantId?: string }, limit = 30) {
  const db = getDb();
  return db.select().from(marketplaceCandidateBatches)
    .where(and(
      eq(marketplaceCandidateBatches.userId, auth.userId),
      marketplaceOwnerTenantScope(marketplaceCandidateBatches.tenantId, auth.tenantId),
    ))
    .orderBy(desc(marketplaceCandidateBatches.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function getMarketplaceCandidateBatchForUser(batchId: string, auth: { userId: number; tenantId?: string }) {
  const db = getDb();
  const [batch] = await db.select().from(marketplaceCandidateBatches)
    .where(and(
      eq(marketplaceCandidateBatches.id, batchId),
      eq(marketplaceCandidateBatches.userId, auth.userId),
      marketplaceOwnerTenantScope(marketplaceCandidateBatches.tenantId, auth.tenantId),
    ))
    .limit(1);
  if (!batch) throw marketplaceCaptureError("candidate_batch_not_found", "Candidate batch not found", 404);
  const items = await db.select().from(marketplaceCandidateItems)
    .where(and(eq(marketplaceCandidateItems.batchId, batchId), eq(marketplaceCandidateItems.userId, auth.userId)))
    .orderBy(desc(marketplaceCandidateItems.score), marketplaceCandidateItems.position);
  return { batch, items };
}

export async function getLatestMarketplaceCandidateBatchForKeyword(
  input: { platform: "shopee" | "tiktok_shop"; keyword: string; limit?: number },
  auth: { userId: number; tenantId?: string },
) {
  const keyword = input.keyword.trim();
  if (!keyword) return null;
  const db = getDb();
  const keywordPattern = `%${keyword.replace(/[%_]/g, "\\$&")}%`;
  const [batch] = await db.select().from(marketplaceCandidateBatches)
    .where(and(
      eq(marketplaceCandidateBatches.userId, auth.userId),
      eq(marketplaceCandidateBatches.platform, input.platform),
      auth.tenantId
        ? or(eq(marketplaceCandidateBatches.tenantId, auth.tenantId), isNull(marketplaceCandidateBatches.tenantId))
        : undefined,
      or(
        ilike(marketplaceCandidateBatches.categoryName, keywordPattern),
        ilike(marketplaceCandidateBatches.sourceUrl, keywordPattern),
        sql`${marketplaceCandidateBatches.filtersJson}->>'keyword' ILIKE ${keywordPattern}`,
        sql`${marketplaceCandidateBatches.filtersJson}->>'searchKeyword' ILIKE ${keywordPattern}`,
      ),
    ))
    .orderBy(desc(marketplaceCandidateBatches.createdAt))
    .limit(1);
  if (!batch) return null;
  const items = await db.select().from(marketplaceCandidateItems)
    .where(and(
      eq(marketplaceCandidateItems.batchId, batch.id),
      eq(marketplaceCandidateItems.userId, auth.userId),
    ))
    .orderBy(marketplaceCandidateItems.position, desc(marketplaceCandidateItems.score))
    .limit(Math.min(Math.max(input.limit ?? 10, 1), 25));
  if (!items.length) return null;
  return { batch, items };
}

export async function saveMarketplaceCandidateBatch(input: unknown, auth: { userId: number; tenantId?: string }) {
  const parsed = categoryCandidatesUploadSchema.parse(input);
  validateMarketplaceSourceUrl(parsed.platform, parsed.sourceUrl);
  const db = getDb();
  const batchId = id("mcb");

  await db.insert(marketplaceCandidateBatches).values({
    id: batchId,
    userId: auth.userId,
    tenantId: auth.tenantId ?? null,
    platform: parsed.platform,
    sourceUrl: parsed.sourceUrl,
    categoryName: parsed.categoryName ?? null,
    sortMode: parsed.sortMode ?? null,
    filtersJson: parsed.filters,
    count: parsed.candidates.length,
  });

  if (parsed.candidates.length > 0) {
    await db.insert(marketplaceCandidateItems).values(parsed.candidates.map((candidate) => {
      const shopeeUrl = candidate.platform === "shopee" ? parseShopeeProductUrl(candidate.url) : null;
      const tiktokUrl = candidate.platform === "tiktok_shop" ? parseTikTokShopUrl(candidate.url) : null;
      const sourceUrl = candidate.platform === "shopee" && shopeeUrl?.canonicalUrl
        ? shopeeUrl.canonicalUrl
        : candidate.platform === "tiktok_shop" && tiktokUrl?.canonicalUrl
          ? tiktokUrl.canonicalUrl
          : candidate.url;
      return {
      id: id("mci"),
      batchId,
      userId: auth.userId,
      platform: candidate.platform,
      sourceUrl,
      affiliateUrl: normalizeOptionalHttpUrl(candidate.affiliateUrl),
      externalProductId: candidate.externalProductId ?? shopeeUrl?.itemId ?? tiktokUrl?.productId ?? null,
      externalShopId: candidate.externalShopId ?? shopeeUrl?.shopId ?? null,
      title: candidate.title,
      priceText: candidate.priceText ?? null,
      soldCountText: candidate.soldCountText ?? null,
      discountText: candidate.discountText ?? null,
      imageUrl: candidate.imageUrl ?? null,
      badgesJson: candidate.badges,
      score: candidate.score,
      scoreReasonsJson: candidate.scoreReasons,
      position: candidate.position,
      rawJson: {
        ...candidate,
        originalUrl: candidate.originalUrl ?? shopeeUrl?.originalUrl ?? tiktokUrl?.originalUrl,
        cleanUrl: candidate.cleanUrl ?? shopeeUrl?.cleanUrl ?? tiktokUrl?.cleanUrl,
        canonicalUrl: candidate.canonicalUrl ?? shopeeUrl?.canonicalUrl ?? tiktokUrl?.canonicalUrl,
        urlFormat: candidate.urlFormat ?? shopeeUrl?.format ?? tiktokUrl?.format,
        shopeeUrl,
        tiktokUrl,
      },
    };
    }));
  }

  return {
    candidateBatchId: batchId,
    count: parsed.candidates.length,
    previewUrl: `/marketplace-capture/candidates/${batchId}`,
  };
}

async function tableCount(table: any) {
  const db = getDb();
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(table);
  return Number(row?.count ?? 0);
}

export async function getMarketplaceCaptureAdminOverview() {
  const db = getDb();
  const [
    pairingCount,
    captureCount,
    productCount,
    assetCount,
    candidateBatchCount,
    recentCaptures,
    recentProducts,
    recentPairings,
  ] = await Promise.all([
    tableCount(marketplaceExtensionPairings),
    tableCount(marketplaceCaptureSessions),
    tableCount(marketplaceProducts),
    tableCount(marketplaceCaptureAssets),
    tableCount(marketplaceCandidateBatches),
    db.select({
      id: marketplaceCaptureSessions.id,
      userId: marketplaceCaptureSessions.userId,
      platform: marketplaceCaptureSessions.platform,
      pageType: marketplaceCaptureSessions.pageType,
      status: marketplaceCaptureSessions.status,
      externalShopId: marketplaceCaptureSessions.externalShopId,
      externalProductId: marketplaceCaptureSessions.externalProductId,
      sourceUrl: marketplaceCaptureSessions.sourceUrl,
      createdAt: marketplaceCaptureSessions.createdAt,
      updatedAt: marketplaceCaptureSessions.updatedAt,
    }).from(marketplaceCaptureSessions)
      .orderBy(desc(marketplaceCaptureSessions.createdAt))
      .limit(20),
    db.select({
      id: marketplaceProducts.id,
      userId: marketplaceProducts.userId,
      platform: marketplaceProducts.platform,
      externalShopId: marketplaceProducts.externalShopId,
      externalProductId: marketplaceProducts.externalProductId,
      productName: marketplaceProducts.productName,
      priceCurrent: marketplaceProducts.priceCurrent,
      commissionRatePercent: marketplaceProducts.commissionRatePercent,
      ratingScore: marketplaceProducts.ratingScore,
      reviewCountText: marketplaceProducts.reviewCountText,
      soldCountText: marketplaceProducts.soldCountText,
      sourceUrl: marketplaceProducts.sourceUrl,
      updatedAt: marketplaceProducts.updatedAt,
    }).from(marketplaceProducts)
      .orderBy(desc(marketplaceProducts.updatedAt))
      .limit(20),
    db.select({
      id: marketplaceExtensionPairings.id,
      userId: marketplaceExtensionPairings.userId,
      extensionId: marketplaceExtensionPairings.extensionId,
      origin: marketplaceExtensionPairings.origin,
      status: marketplaceExtensionPairings.status,
      lastUsedAt: marketplaceExtensionPairings.lastUsedAt,
      expiresAt: marketplaceExtensionPairings.expiresAt,
      createdAt: marketplaceExtensionPairings.createdAt,
    }).from(marketplaceExtensionPairings)
      .orderBy(desc(marketplaceExtensionPairings.createdAt))
      .limit(20),
  ]);

  return {
    stats: {
      pairings: pairingCount,
      captures: captureCount,
      products: productCount,
      assets: assetCount,
      candidateBatches: candidateBatchCount,
    },
    recentCaptures,
    recentProducts,
    recentPairings,
  };
}
