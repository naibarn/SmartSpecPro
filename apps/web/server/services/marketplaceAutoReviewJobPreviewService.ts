import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../db";
import {
  libraryItems,
  marketplaceCaptureAssets,
  marketplaceProductImages,
  marketplaceProducts,
} from "../../drizzle/schema";
import { marketplaceMediaUrl } from "./marketplaceMediaUrl";
import { marketplaceOwnerTenantScope } from "./marketplaceTenantScope";
import {
  normalizeManagedMediaKey,
  parseManagedMediaUrl,
} from "./managedMediaAccessService";

type MarketplaceAutoReviewRunPreviewSource = {
  id?: unknown;
  productId?: unknown;
  resultLibraryItemId?: unknown;
  [key: string]: unknown;
};

type PreviewAuth = {
  userId: number;
  tenantId?: string;
};

type LibraryMediaRow = {
  sourceUrl: string | null;
  thumbnailUrl: string | null;
  metadata: unknown;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function storagePath(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

function libraryMediaUrl(
  value: unknown,
  metadataValue: unknown,
  keyField: "source_key" | "thumbnail_key"
): string | null {
  const metadata = record(metadataValue);
  const metadataKey =
    metadata[keyField] ??
    metadata[keyField === "source_key" ? "sourceKey" : "thumbnailKey"];
  const rawUrl = typeof value === "string" ? value.trim() : "";
  const parsed = parseManagedMediaUrl(rawUrl);
  const key =
    (typeof metadataKey === "string"
      ? normalizeManagedMediaKey(metadataKey)
      : null) ?? parsed?.key;

  if (key) {
    const prefix = parsed?.kind === "upload" ? "/uploads/" : "/api/storage/files/";
    return `${prefix}${storagePath(key)}`;
  }

  // Generated Auto Review videos are normally stored behind the authenticated
  // storage route. Allow a public HTTPS URL only when it contains no bearer or
  // signed query string.
  if (!rawUrl || !/^https:\/\//i.test(rawUrl)) return null;
  try {
    const url = new URL(rawUrl);
    if (url.username || url.password || url.search || url.hash) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Attach only the media needed by job selectors. The input runs have already
 * passed the authenticated run query; product and library lookups are scoped
 * again by the same user and tenant before any media URL is returned.
 */
export async function attachMarketplaceAutoReviewJobPreviews<
  T extends MarketplaceAutoReviewRunPreviewSource,
>(runs: T[], auth: PreviewAuth): Promise<Array<T & {
  productThumbnailUrl: string | null;
  videoPreviewUrl: string | null;
  videoPreviewPosterUrl: string | null;
}>> {
  const result = runs.map(run => ({
    ...run,
    productThumbnailUrl: null,
    videoPreviewUrl: null,
    videoPreviewPosterUrl: null,
  }));
  if (runs.length === 0) return result;

  const db = await getDb();
  if (!db) return result;

  const tenantId = auth.tenantId?.trim();
  if (!tenantId) return result;

  const productIds = Array.from(
    new Set(
      runs
        .map(run => String(run.productId ?? "").trim())
        .filter(Boolean)
    )
  );
  const libraryItemIds = Array.from(
    new Set(
      runs
        .map(run => Number(run.resultLibraryItemId))
        .filter(id => Number.isSafeInteger(id) && id > 0)
    )
  );

  const productRows = productIds.length
    ? await db
        .select({
          productId: marketplaceProducts.id,
          coverImageAssetId: marketplaceProducts.coverImageAssetId,
        })
        .from(marketplaceProducts)
        .where(
          and(
            inArray(marketplaceProducts.id, productIds),
            eq(marketplaceProducts.userId, auth.userId),
            marketplaceOwnerTenantScope(marketplaceProducts.tenantId, tenantId)
          )
        )
    : [];

  const imageRows = productIds.length
    ? await db
        .select({
          productId: marketplaceProductImages.productId,
          captureAssetId: marketplaceProductImages.captureAssetId,
          storageKey: marketplaceProductImages.storageKey,
          url: marketplaceProductImages.url,
        })
        .from(marketplaceProductImages)
        .where(inArray(marketplaceProductImages.productId, productIds))
        .orderBy(
          asc(marketplaceProductImages.productId),
          asc(marketplaceProductImages.sortOrder),
          asc(marketplaceProductImages.createdAt)
        )
    : [];

  const assetIds = Array.from(
    new Set(
      [
        ...productRows.map(row => row.coverImageAssetId),
        ...imageRows.map(row => row.captureAssetId),
      ].filter((id): id is string => Boolean(id))
    )
  );
  const assetRows = assetIds.length
    ? await db
        .select({
          id: marketplaceCaptureAssets.id,
          storageKey: marketplaceCaptureAssets.storageKey,
          url: marketplaceCaptureAssets.url,
        })
        .from(marketplaceCaptureAssets)
        .where(
          and(
            inArray(marketplaceCaptureAssets.id, assetIds),
            eq(marketplaceCaptureAssets.userId, auth.userId),
            marketplaceOwnerTenantScope(marketplaceCaptureAssets.tenantId, tenantId)
          )
        )
    : [];

  const assetById = new Map(assetRows.map(asset => [asset.id, asset] as const));
  const productById = new Map(
    productRows.map(product => {
      const cover = product.coverImageAssetId
        ? assetById.get(product.coverImageAssetId)
        : null;
      const coverUrl = marketplaceMediaUrl(cover?.storageKey, cover?.url);
      const fallbackImage = imageRows.find(
        image => image.productId === product.productId
      );
      const fallbackAsset = fallbackImage?.captureAssetId
        ? assetById.get(fallbackImage.captureAssetId)
        : null;
      const fallbackUrl = fallbackImage
        ? marketplaceMediaUrl(
            fallbackAsset?.storageKey ?? fallbackImage.storageKey,
            fallbackImage.url || fallbackAsset?.url
          )
        : "";
      return [product.productId, coverUrl || fallbackUrl || null] as const;
    })
  );

  const libraryRows =
    libraryItemIds.length > 0
      ? await db
          .select({
            id: libraryItems.id,
            sourceUrl: libraryItems.sourceUrl,
            thumbnailUrl: libraryItems.thumbnailUrl,
            metadata: libraryItems.metadata,
          })
          .from(libraryItems)
          .where(
            and(
              inArray(libraryItems.id, libraryItemIds),
              eq(libraryItems.tenantId, tenantId),
              eq(libraryItems.ownerUserId, auth.userId),
              eq(libraryItems.itemType, "video"),
              isNull(libraryItems.deletedAt)
            )
          )
      : [];
  const libraryById = new Map<number, LibraryMediaRow>(
    libraryRows.map(item => [item.id, item] as const)
  );

  return result.map(run => {
    const productId = String(run.productId ?? "").trim();
    const libraryItemId = Number(run.resultLibraryItemId);
    const libraryItem = Number.isSafeInteger(libraryItemId)
      ? libraryById.get(libraryItemId)
      : undefined;
    return {
      ...run,
      productThumbnailUrl: productById.get(productId) ?? null,
      videoPreviewUrl: libraryItem
        ? libraryMediaUrl(libraryItem.sourceUrl, libraryItem.metadata, "source_key")
        : null,
      videoPreviewPosterUrl: libraryItem
        ? libraryMediaUrl(
            libraryItem.thumbnailUrl,
            libraryItem.metadata,
            "thumbnail_key"
          )
        : null,
    };
  });
}
