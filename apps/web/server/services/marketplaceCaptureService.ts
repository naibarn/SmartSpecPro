import crypto from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
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
  const now = new Date();
  const db = getDb();
  const rawPayloadJson = {
    ...(parsed.rawPayload as Record<string, unknown>),
    originalSourceUrl: parsed.originalSourceUrl ?? shopeeUrl?.originalUrl ?? tiktokUrl?.originalUrl ?? parsed.sourceUrl,
    cleanSourceUrl: parsed.cleanSourceUrl ?? shopeeUrl?.cleanUrl ?? tiktokUrl?.cleanUrl ?? parsed.sourceUrl,
    canonicalSourceUrl: parsed.canonicalSourceUrl ?? shopeeUrl?.canonicalUrl ?? tiktokUrl?.canonicalUrl ?? null,
    sourceUrlFormat: parsed.sourceUrlFormat ?? shopeeUrl?.format ?? tiktokUrl?.format,
    shopeeUrl,
    tiktokUrl,
  };

  let existingCapture: typeof marketplaceCaptureSessions.$inferSelect | null = null;
  if (externalProductId && externalShopId) {
    [existingCapture] = await db.select().from(marketplaceCaptureSessions)
      .where(and(
        eq(marketplaceCaptureSessions.userId, auth.userId),
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
        .where(and(eq(marketplaceCaptureAssets.captureId, captureId), eq(marketplaceCaptureAssets.userId, auth.userId)));
    }
    await db.update(marketplaceCaptureSessions)
      .set(baseCaptureValues)
      .where(and(eq(marketplaceCaptureSessions.id, captureId), eq(marketplaceCaptureSessions.userId, auth.userId)));
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
      .where(and(eq(marketplaceCaptureSessions.id, captureId), eq(marketplaceCaptureSessions.userId, auth.userId)));
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

export async function getMarketplaceCaptureForUser(captureId: string, auth: { userId: number }) {
  const db = getDb();
  const [capture] = await db.select().from(marketplaceCaptureSessions)
    .where(and(eq(marketplaceCaptureSessions.id, captureId), eq(marketplaceCaptureSessions.userId, auth.userId)))
    .limit(1);
  if (!capture) throw marketplaceCaptureError("capture_not_found", "Capture not found", 404);
  const assets = await db.select().from(marketplaceCaptureAssets)
    .where(eq(marketplaceCaptureAssets.captureId, captureId))
    .orderBy(marketplaceCaptureAssets.sortOrder, marketplaceCaptureAssets.createdAt);
  return { capture, assets };
}

export async function saveMarketplaceCaptureDraftEdits(captureId: string, input: unknown, auth: { userId: number }) {
  const parsed = marketplaceConfirmProductSchema.parse(input);
  const { capture } = await getMarketplaceCaptureForUser(captureId, auth);
  const product = parsed.product;
  const savedDraft = {
    ...(capture.normalizedResultJson ?? {}),
    productName: product.productName,
    brand: product.brand ?? null,
    shop: { name: product.shopName ?? null, isMall: product.isMall ?? null },
    price: product.price,
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
    platformRawJson: product.platformRawJson,
    draftSavedAt: new Date().toISOString(),
    userEdited: true,
  };
  const db = getDb();
  await db.update(marketplaceCaptureSessions)
    .set({ normalizedResultJson: savedDraft, updatedAt: new Date() })
    .where(and(eq(marketplaceCaptureSessions.id, captureId), eq(marketplaceCaptureSessions.userId, auth.userId)));
  return { captureId, status: capture.status, saved: true, savedAt: savedDraft.draftSavedAt };
}

export async function discardMarketplaceCapture(captureId: string, auth: { userId: number }) {
  const { capture } = await getMarketplaceCaptureForUser(captureId, auth);
  if (capture.status === "confirmed") throw marketplaceCaptureError("capture_confirmed", "Confirmed captures cannot be discarded", 409);
  const db = getDb();
  await db.update(marketplaceCaptureSessions)
    .set({ status: "discarded", updatedAt: new Date() })
    .where(and(eq(marketplaceCaptureSessions.id, captureId), eq(marketplaceCaptureSessions.userId, auth.userId)));
  return { captureId, status: "discarded" };
}

export async function listMarketplaceCapturesForUser(auth: { userId: number }, limit = 30) {
  const db = getDb();
  return db.select().from(marketplaceCaptureSessions)
    .where(eq(marketplaceCaptureSessions.userId, auth.userId))
    .orderBy(desc(marketplaceCaptureSessions.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function listMarketplaceProductsForUser(auth: { userId: number }, limit = 30) {
  const db = getDb();
  return db.select().from(marketplaceProducts)
    .where(eq(marketplaceProducts.userId, auth.userId))
    .orderBy(desc(marketplaceProducts.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function getMarketplaceProductForUser(productId: string, auth: { userId: number }) {
  const db = getDb();
  const [product] = await db.select().from(marketplaceProducts)
    .where(and(eq(marketplaceProducts.id, productId), eq(marketplaceProducts.userId, auth.userId)))
    .limit(1);
  if (!product) throw marketplaceCaptureError("product_not_found", "Product not found", 404);
  const images = await db.select().from(marketplaceProductImages)
    .where(eq(marketplaceProductImages.productId, productId))
    .orderBy(marketplaceProductImages.sortOrder, marketplaceProductImages.createdAt);
  return { product, images };
}

export async function listMarketplaceCandidateBatchesForUser(auth: { userId: number }, limit = 30) {
  const db = getDb();
  return db.select().from(marketplaceCandidateBatches)
    .where(eq(marketplaceCandidateBatches.userId, auth.userId))
    .orderBy(desc(marketplaceCandidateBatches.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function getMarketplaceCandidateBatchForUser(batchId: string, auth: { userId: number }) {
  const db = getDb();
  const [batch] = await db.select().from(marketplaceCandidateBatches)
    .where(and(eq(marketplaceCandidateBatches.id, batchId), eq(marketplaceCandidateBatches.userId, auth.userId)))
    .limit(1);
  if (!batch) throw marketplaceCaptureError("candidate_batch_not_found", "Candidate batch not found", 404);
  const items = await db.select().from(marketplaceCandidateItems)
    .where(and(eq(marketplaceCandidateItems.batchId, batchId), eq(marketplaceCandidateItems.userId, auth.userId)))
    .orderBy(desc(marketplaceCandidateItems.score), marketplaceCandidateItems.position);
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
