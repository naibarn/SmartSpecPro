import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  libraryItems,
  marketplaceCaptureAssets,
  marketplaceAutoReviewRuns,
  marketplaceProductImages,
  marketplaceProducts,
  socialPosts,
  verticalDramaSeries,
  workerArtifacts,
  workerJobs,
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
  renderJobId?: unknown;
  [key: string]: unknown;
};

type PreviewAuth = {
  userId: number;
  tenantId?: string;
};

type LibraryMediaRow = {
  id: number;
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

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
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
    const prefix =
      parsed?.kind === "upload" ? "/uploads/" : "/api/storage/files/";
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
>(
  runs: T[],
  auth: PreviewAuth
): Promise<
  Array<
    T & {
      productThumbnailUrl: string | null;
      videoPreviewUrl: string | null;
      videoPreviewPosterUrl: string | null;
      characterSeriesNames: string[];
      facebookPublishStatus:
        "published" | "scheduled" | "publishing" | "failed" | "not_published";
      facebookScheduledAt: Date | null;
      awaitingAffiliateComment: boolean;
      facebookPublicationProgress: {
        video: string;
        videoScheduledAt: Date | null;
        photos: { variant: string; status: string; scheduledAt: Date | null }[];
        publishedPhotoCount: number;
        allComplete: boolean;
      };
    }
  >
> {
  const result = runs.map(run => ({
    ...run,
    productThumbnailUrl: null,
    videoPreviewUrl: null,
    videoPreviewPosterUrl: null,
    characterSeriesNames: [],
    facebookPublishStatus: "not_published" as const,
    awaitingAffiliateComment: false,
    facebookPublicationProgress: {
      video: "not_published",
      videoScheduledAt: null,
      photos: ["caption_source", "character_reference", "product_reference"].map(variant => ({ variant, status: "not_published", scheduledAt: null })),
      publishedPhotoCount: 0,
      allComplete: false,
    },
  }));
  if (runs.length === 0) return result;

  const db = await getDb();
  if (!db) return result;

  const tenantId = auth.tenantId?.trim();
  if (!tenantId) return result;

  const productIds = Array.from(
    new Set(runs.map(run => String(run.productId ?? "").trim()).filter(Boolean))
  );
  const libraryItemIds = Array.from(
    new Set(
      runs
        .map(run => Number(run.resultLibraryItemId))
        .filter(id => Number.isSafeInteger(id) && id > 0)
    )
  );
  const runIds = Array.from(
    new Set(runs.map(run => String(run.id ?? "").trim()).filter(Boolean))
  );
  const renderJobIds = Array.from(
    new Set(
      runs.map(run => String(run.renderJobId ?? "").trim()).filter(Boolean)
    )
  );
  const facebookPostRows = runIds.length
    ? await db
        .select({
          runId: sql<string>`${socialPosts.metadata}->>'autoReviewRunId'`,
          status: socialPosts.status,
          scheduledAt: socialPosts.scheduledAt,
          providerPostId: socialPosts.providerPostId,
          metadata: socialPosts.metadata,
          createdAt: socialPosts.createdAt,
        })
        .from(socialPosts)
        .where(
          and(
            eq(socialPosts.tenantId, tenantId),
            eq(socialPosts.createdByUserId, auth.userId),
            inArray(sql<string>`${socialPosts.metadata}->>'source'`, [
              "marketplace_auto_review_reels",
              "marketplace_auto_review_photo_post",
            ]),
            inArray(
              sql<string>`${socialPosts.metadata}->>'autoReviewRunId'`,
              runIds
            )
          )
        )
        .orderBy(desc(socialPosts.createdAt))
    : [];
  const facebookPostsByRunId = new Map<string, typeof facebookPostRows>();
  for (const post of facebookPostRows) {
    if (!post.runId) continue;
    facebookPostsByRunId.set(post.runId, [
      ...(facebookPostsByRunId.get(post.runId) ?? []),
      post,
    ]);
  }
  const characterSeriesIdsByRunId = new Map(
    runs.map(run => {
      const ids = record(run.metadataJson).characterSeriesIds;
      const seriesIds = Array.isArray(ids)
        ? ids
            .filter(
              (id): id is string => typeof id === "string" && Boolean(id.trim())
            )
            .map(id => id.trim())
        : [];
      return [String(run.id ?? "").trim(), seriesIds] as const;
    })
  );
  const characterSeriesIds = Array.from(
    new Set(Array.from(characterSeriesIdsByRunId.values()).flat())
  );
  const numericCharacterSeriesIds = characterSeriesIds
    .map(id => Number(id))
    .filter(id => Number.isSafeInteger(id) && id > 0);

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

  const characterSeriesRows = numericCharacterSeriesIds.length
    ? await db
        .select({
          id: verticalDramaSeries.id,
          title: verticalDramaSeries.title,
        })
        .from(verticalDramaSeries)
        .where(
          and(
            inArray(verticalDramaSeries.id, numericCharacterSeriesIds),
            eq(verticalDramaSeries.userId, auth.userId),
            eq(verticalDramaSeries.tenantId, tenantId)
          )
        )
    : [];
  const characterSeriesTitleById = new Map(
    characterSeriesRows.map(series => [String(series.id), series.title.trim()])
  );

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
            marketplaceOwnerTenantScope(
              marketplaceCaptureAssets.tenantId,
              tenantId
            )
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

  // Completed renders can be linked to a run through library metadata before
  // `resultLibraryItemId` is backfilled onto the run row. Resolve those links
  // in one owner/tenant-scoped query so preview availability does not depend
  // on the timing of that backfill.
  const linkedLibraryRows =
    runIds.length > 0
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
              eq(libraryItems.tenantId, tenantId),
              eq(libraryItems.ownerUserId, auth.userId),
              eq(libraryItems.itemType, "video"),
              isNull(libraryItems.deletedAt),
              inArray(
                sql`${libraryItems.metadata}->>'auto_review_run_id'`,
                runIds
              ),
              eq(
                sql`${libraryItems.metadata}->>'source_type'`,
                "marketplace_auto_review_render"
              )
            )
          )
          .orderBy(desc(libraryItems.updatedAt), desc(libraryItems.id))
      : [];
  // Auto Review renders published through the worker pipeline are connected
  // to their run by renderJobId -> worker_artifacts.publishedItemId. These
  // library rows do not necessarily carry auto_review_run_id metadata, so
  // resolve that canonical link under the same tenant and user scope.
  const renderedWorkerLibraryRows =
    renderJobIds.length > 0
      ? await db
          .select({
            renderJobId: workerArtifacts.workerJobId,
            id: libraryItems.id,
            sourceUrl: libraryItems.sourceUrl,
            thumbnailUrl: libraryItems.thumbnailUrl,
            metadata: libraryItems.metadata,
          })
          .from(workerArtifacts)
          .innerJoin(workerJobs, eq(workerJobs.id, workerArtifacts.workerJobId))
          .innerJoin(
            libraryItems,
            eq(libraryItems.id, workerArtifacts.publishedItemId)
          )
          .where(
            and(
              inArray(workerJobs.id, renderJobIds),
              eq(workerJobs.tenantId, tenantId),
              eq(workerJobs.requestedByUserId, auth.userId),
              eq(workerJobs.jobType, "remotion_render_video"),
              eq(workerJobs.status, "completed"),
              eq(workerArtifacts.artifactType, "remotion_render_mp4"),
              eq(libraryItems.tenantId, tenantId),
              eq(libraryItems.ownerUserId, auth.userId),
              eq(libraryItems.itemType, "video"),
              isNull(libraryItems.deletedAt)
            )
          )
          .orderBy(
            desc(workerArtifacts.createdAt),
            desc(libraryItems.updatedAt),
            desc(libraryItems.id)
          )
      : [];
  const libraryById = new Map<number, LibraryMediaRow>();
  for (const item of [...linkedLibraryRows, ...libraryRows]) {
    libraryById.set(item.id, item);
  }
  const libraryByRunId = new Map<string, LibraryMediaRow>();
  for (const item of linkedLibraryRows) {
    const linkedRunId = firstText(record(item.metadata).auto_review_run_id);
    if (linkedRunId && !libraryByRunId.has(linkedRunId)) {
      libraryByRunId.set(linkedRunId, item);
    }
  }
  const libraryByRenderJobId = new Map<string, LibraryMediaRow>();
  for (const item of renderedWorkerLibraryRows) {
    if (!libraryByRenderJobId.has(item.renderJobId)) {
      libraryByRenderJobId.set(item.renderJobId, item);
    }
  }

  return result.map(run => {
    const productId = String(run.productId ?? "").trim();
    const libraryItemId = Number(run.resultLibraryItemId);
    const libraryItem =
      (Number.isSafeInteger(libraryItemId)
        ? libraryById.get(libraryItemId)
        : undefined) ??
      libraryByRunId.get(String(run.id ?? "")) ??
      libraryByRenderJobId.get(String(run.renderJobId ?? "").trim());
    const libraryMetadata = record(libraryItem?.metadata);
    const renderStorage = record(
      libraryMetadata.render_storage_envelope ??
        libraryMetadata.renderStorageEnvelope
    );
    const publishablePackage = record(
      libraryMetadata.publishable_asset_package ??
        libraryMetadata.publishableAssetPackage
    );
    const sourceKey = firstText(
      libraryMetadata.source_key,
      libraryMetadata.sourceKey,
      renderStorage.source_key,
      renderStorage.sourceKey,
      renderStorage.storageKey,
      renderStorage.objectKey,
      publishablePackage.source_key,
      publishablePackage.sourceKey,
      publishablePackage.storageKey
    );
    const posterKey = firstText(
      libraryMetadata.thumbnail_key,
      libraryMetadata.thumbnailKey,
      publishablePackage.thumbnail_key,
      publishablePackage.thumbnailKey
    );
    const mediaMetadata = {
      ...libraryMetadata,
      ...(sourceKey ? { source_key: sourceKey } : {}),
      ...(posterKey ? { thumbnail_key: posterKey } : {}),
    };
    const videoSource = firstText(
      libraryItem?.sourceUrl,
      renderStorage.resultUrl,
      publishablePackage.resultUrl
    );
    const posterSource = firstText(
      libraryItem?.thumbnailUrl,
      publishablePackage.thumbnailUrl
    );
    const facebookPosts = facebookPostsByRunId.get(String(run.id ?? "")) ?? [];
    const videoPosts = facebookPosts.filter(post =>
      record(post.metadata).source === "marketplace_auto_review_reels"
    );
    const videoPost = videoPosts[0];
    const photoVariants = ["caption_source", "character_reference", "product_reference"] as const;
    const videoPostMetadata = record(videoPost?.metadata);
    const hasPublishedVideo = videoPosts.some(post => post.status === "published" && Boolean(post.providerPostId));
    const latestVideoStatus = String(videoPostMetadata.videoPublicationStatus ?? videoPost?.status ?? "not_published");
    const videoStatus = hasPublishedVideo
      ? "published"
      : latestVideoStatus === "published"
        ? "reconciling"
        : latestVideoStatus;
    const photoStatuses = photoVariants.map(variant => {
      const matchingPosts = facebookPosts.filter(post => {
        const metadata = record(post.metadata);
        return metadata.source === "marketplace_auto_review_photo_post" &&
          String(metadata.selectedPhotoVariant ?? record(metadata.snapshot).selectedVariant ?? "") === variant;
      });
      const publishedPost = matchingPosts.find(post => post.status === "published" && Boolean(post.providerPostId));
      const latestPhotoPost = matchingPosts[0];
      const metadata = record(latestPhotoPost?.metadata);
      return {
        variant,
        scheduledAt: latestPhotoPost?.scheduledAt instanceof Date ? latestPhotoPost.scheduledAt : null,
        status: publishedPost
          ? "published"
          : String(metadata.photoPublicationStatus ?? latestPhotoPost?.status ?? "not_published") === "published"
            ? "reconciling"
            : String(metadata.photoPublicationStatus ?? latestPhotoPost?.status ?? "not_published"),
      };
    });
    const publishedPhotoCount = photoStatuses.filter(photo => photo.status === "published").length;
    const facebookPublicationProgress = {
      video: videoStatus,
      videoScheduledAt: videoPost?.scheduledAt instanceof Date ? videoPost.scheduledAt : null,
      photos: photoStatuses,
      publishedPhotoCount,
      allComplete: videoStatus === "published" && publishedPhotoCount === photoVariants.length,
    };
    const hasPublishedFacebookPost = facebookPosts.some(
      post => post.status === "published" && Boolean(post.providerPostId)
    );
    const awaitingAffiliateComment = facebookPosts.some(post => {
      if (post.status !== "published" || !post.providerPostId) return false;
      const metadata = record(post.metadata);
      return [
        "pending_confirmation",
        "pending_first_comment",
        "comment_pending_confirmation",
      ].includes(
        String(
          metadata.affiliateCommentStatus ?? metadata.affiliateLinkStatus ?? ""
        )
      );
    });
    const latestPost = facebookPosts[0];
    const latestMetadata = record(latestPost?.metadata);
    const latestPublicationStatus = String(
      latestMetadata.videoPublicationStatus ??
        latestMetadata.photoPublicationStatus ??
        latestPost?.status ??
        ""
    );
    const facebookPublishStatus:
      "published" | "scheduled" | "publishing" | "failed" | "not_published" =
      hasPublishedFacebookPost
        ? "published"
        : latestPublicationStatus === "scheduled"
          ? "scheduled"
          : [
                "queued",
                "preflight",
                "processing",
                "uploading",
                "ready",
                "upload_complete",
                "token_check",
                "publish_requested",
                "reconciling",
              ].includes(latestPublicationStatus)
            ? "publishing"
            : ["failed", "needs_user_action", "needs_connection"].includes(
                  latestPublicationStatus
                )
              ? "failed"
              : "not_published";
    return {
      ...run,
      facebookPublishStatus,
      facebookPublicationProgress,
      facebookScheduledAt: facebookPublishStatus === "scheduled" && latestPost?.scheduledAt instanceof Date
        ? latestPost.scheduledAt
        : null,
      awaitingAffiliateComment,
      productThumbnailUrl: productById.get(productId) ?? null,
      characterSeriesNames: (
        characterSeriesIdsByRunId.get(String(run.id ?? "").trim()) ?? []
      )
        .map(id => characterSeriesTitleById.get(id))
        .filter((title): title is string => Boolean(title)),
      videoPreviewUrl: libraryItem
        ? libraryMediaUrl(videoSource, mediaMetadata, "source_key")
        : null,
      videoPreviewPosterUrl: libraryItem
        ? libraryMediaUrl(posterSource, mediaMetadata, "thumbnail_key")
        : null,
    };
  });
}

export async function listMarketplaceAutoReviewRunSeries(auth: PreviewAuth) {
  const tenantId = auth.tenantId?.trim();
  if (!tenantId) return [];

  const db = await getDb();
  if (!db) return [];

  const runs = await db
    .select({ metadataJson: marketplaceAutoReviewRuns.metadataJson })
    .from(marketplaceAutoReviewRuns)
    .where(
      and(
        eq(marketplaceAutoReviewRuns.userId, auth.userId),
        eq(marketplaceAutoReviewRuns.tenantId, tenantId)
      )
    );
  const seriesIds = Array.from(
    new Set(
      runs.flatMap(run => {
        const references = record(run.metadataJson).customReferenceManifest;
        return Array.isArray(references)
          ? references
              .map(reference => record(reference))
              .filter(reference => reference.role === "character")
              .map(reference => reference.vdSeriesId)
              .filter(
                (id): id is string =>
                  typeof id === "string" && Boolean(id.trim())
              )
          : [];
      })
    )
  )
    .map(id => Number(id))
    .filter(id => Number.isSafeInteger(id) && id > 0);
  if (seriesIds.length === 0) return [];

  const series = await db
    .select({ id: verticalDramaSeries.id, title: verticalDramaSeries.title })
    .from(verticalDramaSeries)
    .where(
      and(
        inArray(verticalDramaSeries.id, seriesIds),
        eq(verticalDramaSeries.userId, auth.userId),
        eq(verticalDramaSeries.tenantId, tenantId)
      )
    )
    .orderBy(asc(verticalDramaSeries.title), asc(verticalDramaSeries.id));
  return series.map(item => ({
    seriesId: String(item.id),
    seriesName: item.title.trim(),
  }));
}
