import { and, eq, inArray } from "drizzle-orm";
import {
  mediaAssets,
  verticalDramaCharacterAssets,
  verticalDramaEpisodes,
  verticalDramaLocationAssets,
  verticalDramaRunArtifacts,
  verticalDramaSeries,
  verticalDramaShotReferences,
} from "../../drizzle/schema";
import { db } from "../db";
import { assertR2StorageActive, storageExists } from "../storage";
import {
  extractVerticalDramaManagedMediaKey,
  ensureVerticalDramaManagedMediaAsset,
  ingestVerticalDramaMediaAsset,
  migrateExistingVerticalDramaMediaAsset,
  type VerticalDramaMediaType,
} from "./verticalDramaMediaAssetService";

type JsonRecord = Record<string, unknown>;

export type VerticalDramaMediaBackfillOptions = {
  tenantId: string;
  userId: number;
  seriesId?: number;
  episodeId?: number;
  apply: boolean;
  limit?: number;
};

export type VerticalDramaMediaBackfillReport = {
  seriesCount: number;
  episodeCount: number;
  referencedAssetCount: number;
  externalAssetCount: number;
  managedAssetCount: number;
  migratedAssetCount: number;
  expiredAssetCount: number;
  rawUrlCount: number;
  migratedRawUrlCount: number;
  errors: Array<{ assetId?: number; url?: string; message: string }>;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function isExternalMediaUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  const trimmed = value.trim();
  if (extractVerticalDramaManagedMediaKey(trimmed)) return false;
  return /^https?:\/\//i.test(trimmed);
}

function isDataMediaUrl(value: unknown): value is string {
  return typeof value === "string" && /^data:(?:image|video)\//i.test(value.trim());
}

function mediaTypeForPath(path: string, mimeType?: string | null): VerticalDramaMediaType {
  const normalizedPath = path.trim().toLowerCase();
  if (normalizedPath.startsWith("data:image/")) return "image";
  if (normalizedPath.startsWith("data:video/")) return "video";
  if (mimeType?.toLowerCase().startsWith("video/")) return "video";
  return /video|movie|trailer|clip|compiled/i.test(normalizedPath) ? "video" : "image";
}

function collectMediaAssetIds(value: unknown, ids: Set<number>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectMediaAssetIds(item, ids);
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  for (const [key, child] of Object.entries(record)) {
    if (/mediaAssetId$/i.test(key)) {
      const id = Number(child);
      if (Number.isInteger(id) && id > 0) ids.add(id);
    } else if (/mediaAssetIds$/i.test(key) && Array.isArray(child)) {
      for (const rawId of child) {
        const id = Number(rawId);
        if (Number.isInteger(id) && id > 0) ids.add(id);
      }
    }
    collectMediaAssetIds(child, ids);
  }
}

function collectRawMediaUrls(
  value: unknown,
  path: string,
  urls: Map<string, { mediaType: VerticalDramaMediaType; path: string }>,
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectRawMediaUrls(item, `${path}[${index}]`, urls));
    return;
  }
  if (typeof value === "string") {
    if (
      (isExternalMediaUrl(value) ||
        Boolean(extractVerticalDramaManagedMediaKey(value))) &&
      /image|video|thumbnail|cover|frame|angle|asset|trailer|clip|compiled|watermark/i.test(path)
    ) {
      urls.set(value.trim(), { mediaType: mediaTypeForPath(path), path });
    }
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  for (const [key, child] of Object.entries(record)) {
    collectRawMediaUrls(child, path ? `${path}.${key}` : key, urls);
  }
}

function replaceMediaUrls(value: unknown, replacements: Map<string, string>): { value: unknown; changed: boolean } {
  if (typeof value === "string") {
    const replacement = replacements.get(value.trim());
    return replacement && replacement !== value
      ? { value: replacement, changed: true }
      : { value, changed: false };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map(item => {
      const result = replaceMediaUrls(item, replacements);
      changed ||= result.changed;
      return result.value;
    });
    return { value: changed ? next : value, changed };
  }
  const record = asRecord(value);
  if (!record) return { value, changed: false };
  let changed = false;
  const next: JsonRecord = { ...record };
  for (const [key, child] of Object.entries(record)) {
    const result = replaceMediaUrls(child, replacements);
    changed ||= result.changed;
    next[key] = result.value;
  }
  return { value: changed ? next : value, changed };
}

async function linkEpisodePreviewMediaAssets(
  value: unknown,
  owner: Pick<VerticalDramaMediaBackfillOptions, "tenantId" | "userId">,
): Promise<{ value: unknown; changed: boolean }> {
  const manifest = asRecord(value);
  const previews = manifest?.episodePreviews;
  if (!Array.isArray(previews)) return { value, changed: false };

  let changed = false;
  const nextPreviews = await Promise.all(
    previews.map(async previewValue => {
      const preview = asRecord(previewValue);
      if (
        !preview ||
        preview.status !== "completed" ||
        typeof preview.videoUrl !== "string"
      ) {
        return previewValue;
      }
      const storageKey = extractVerticalDramaManagedMediaKey(preview.videoUrl);
      if (!storageKey) return previewValue;
      const [asset] = await db
        .select({
          id: mediaAssets.id,
          status: mediaAssets.status,
          storageKey: mediaAssets.storageKey,
        })
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.tenantId, owner.tenantId),
            eq(mediaAssets.userId, owner.userId),
            eq(mediaAssets.storageKey, storageKey),
          ),
        )
        .limit(1);
      if (!asset) return previewValue;
      const next = {
        ...preview,
        mediaAssetId: String(asset.id),
        durabilityStatus: asset.status === "ready" ? "ready" : "expired",
        ...(asset.status === "ready"
          ? { videoUrl: `/api/storage/files/${encodeURI(asset.storageKey)}` }
          : { videoUrl: undefined }),
      };
      if (
        preview.mediaAssetId !== next.mediaAssetId ||
        preview.durabilityStatus !== next.durabilityStatus ||
        preview.videoUrl !== next.videoUrl
      ) {
        changed = true;
      }
      return next;
    }),
  );
  return {
    value: changed ? { ...manifest, episodePreviews: nextPreviews } : value,
    changed,
  };
}

function inferMimeType(mediaType: VerticalDramaMediaType, value: string): string {
  if (mediaType === "video") {
    if (/\.webm(?:\?|$)/i.test(value)) return "video/webm";
    return "video/mp4";
  }
  if (/\.jpe?g(?:\?|$)/i.test(value)) return "image/jpeg";
  if (/\.webp(?:\?|$)/i.test(value)) return "image/webp";
  return "image/png";
}

/**
 * Backfill every Vertical Drama asset reachable from the owner's series,
 * preserving media_assets IDs. Raw URLs embedded in legacy JSONB are also
 * rewritten to the new stable R2 proxy URL.
 */
export async function backfillVerticalDramaMedia(
  options: VerticalDramaMediaBackfillOptions,
): Promise<VerticalDramaMediaBackfillReport> {
  if (options.apply) await assertR2StorageActive();
  const seriesWhere = [
    eq(verticalDramaSeries.tenantId, options.tenantId),
    eq(verticalDramaSeries.userId, options.userId),
    ...(options.seriesId ? [eq(verticalDramaSeries.id, options.seriesId)] : []),
  ];
  const seriesRows = await db
    .select()
    .from(verticalDramaSeries)
    .where(and(...seriesWhere));
  const seriesIds = seriesRows.map(
    (row: typeof verticalDramaSeries.$inferSelect) => row.id,
  );
  const episodeRows = seriesIds.length
    ? await db
        .select()
        .from(verticalDramaEpisodes)
        .where(
        and(
            eq(verticalDramaEpisodes.tenantId, options.tenantId),
            eq(verticalDramaEpisodes.userId, options.userId),
            inArray(verticalDramaEpisodes.seriesId, seriesIds),
            ...(options.episodeId
              ? [eq(verticalDramaEpisodes.id, options.episodeId)]
              : []),
          ),
        )
    : [];

  const referencedIds = new Set<number>();
  const rawUrls = new Map<string, { mediaType: VerticalDramaMediaType; path: string }>();
  for (const row of seriesRows) {
    collectMediaAssetIds(row, referencedIds);
    collectRawMediaUrls(row, "series", rawUrls);
  }
  for (const row of episodeRows) {
    collectMediaAssetIds(row, referencedIds);
    collectRawMediaUrls(row, "episode", rawUrls);
  }

  if (seriesIds.length) {
    const [characterLinks, locationLinks, shotReferences, artifacts] = await Promise.all([
      db
        .select({ mediaAssetId: verticalDramaCharacterAssets.mediaAssetId })
        .from(verticalDramaCharacterAssets)
        .where(
          and(
            eq(verticalDramaCharacterAssets.tenantId, options.tenantId),
            eq(verticalDramaCharacterAssets.userId, options.userId),
            inArray(verticalDramaCharacterAssets.seriesId, seriesIds),
          ),
        ),
      db
        .select({ mediaAssetId: verticalDramaLocationAssets.mediaAssetId })
        .from(verticalDramaLocationAssets)
        .where(
          and(
            eq(verticalDramaLocationAssets.tenantId, options.tenantId),
            eq(verticalDramaLocationAssets.userId, options.userId),
            inArray(verticalDramaLocationAssets.seriesId, seriesIds),
          ),
        ),
      db
        .select({ mediaAssetId: verticalDramaShotReferences.mediaAssetId })
        .from(verticalDramaShotReferences)
        .where(
          and(
            eq(verticalDramaShotReferences.tenantId, options.tenantId),
            eq(verticalDramaShotReferences.userId, options.userId),
            inArray(verticalDramaShotReferences.seriesId, seriesIds),
          ),
        ),
      db
        .select({ mediaAssetIds: verticalDramaRunArtifacts.mediaAssetIds })
        .from(verticalDramaRunArtifacts)
        .where(
          and(
            eq(verticalDramaRunArtifacts.tenantId, options.tenantId),
            eq(verticalDramaRunArtifacts.userId, options.userId),
            inArray(verticalDramaRunArtifacts.seriesId, seriesIds),
          ),
        ),
    ]);
    for (const row of [...characterLinks, ...locationLinks, ...shotReferences]) {
      if (row.mediaAssetId) referencedIds.add(row.mediaAssetId);
    }
    for (const row of artifacts) collectMediaAssetIds(row.mediaAssetIds, referencedIds);
  }

  let assetIds = Array.from(referencedIds).sort((a, b) => a - b);
  if (options.limit && options.limit > 0) assetIds = assetIds.slice(0, options.limit);
  const assetRows = assetIds.length
    ? await db
        .select({
          id: mediaAssets.id,
          originalUrl: mediaAssets.originalUrl,
          storageKey: mediaAssets.storageKey,
          mimeType: mediaAssets.mimeType,
          status: mediaAssets.status,
        })
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.tenantId, options.tenantId),
            eq(mediaAssets.userId, options.userId),
            inArray(mediaAssets.id, assetIds),
          ),
        )
    : [];

  const report: VerticalDramaMediaBackfillReport = {
    seriesCount: seriesRows.length,
    episodeCount: episodeRows.length,
    referencedAssetCount: assetRows.length,
    externalAssetCount: 0,
    managedAssetCount: 0,
    migratedAssetCount: 0,
    expiredAssetCount: 0,
    rawUrlCount: rawUrls.size,
    migratedRawUrlCount: 0,
    errors: [],
  };
  const replacements = new Map<string, string>();

  const processAsset = async (row: {
    id: number;
    originalUrl: string | null;
    storageKey: string;
    mimeType: string;
    status: string | null;
  }) => {
    const managedKey = row.originalUrl
      ? extractVerticalDramaManagedMediaKey(row.originalUrl)
      : null;
    if (managedKey) {
      report.managedAssetCount += 1;
      if (!options.apply) return;
      try {
        if (!(await storageExists(managedKey))) {
          report.expiredAssetCount += 1;
          report.errors.push({
            assetId: row.id,
            url: row.originalUrl ?? undefined,
            message: "Managed media object is missing from storage",
          });
          await db
            .update(mediaAssets)
            .set({ status: "expired", updatedAt: new Date() })
            .where(
              and(
                eq(mediaAssets.id, row.id),
                eq(mediaAssets.tenantId, options.tenantId),
                eq(mediaAssets.userId, options.userId),
              ),
            );
          return;
        }

        const durableUrl = `/api/storage/files/${encodeURI(managedKey)}`;
        if (row.originalUrl !== durableUrl || row.status !== "ready") {
          await db
            .update(mediaAssets)
            .set({
              status: "ready",
              storageKey: managedKey,
              originalUrl: durableUrl,
              thumbnailUrl: row.mimeType.startsWith("image/") ? durableUrl : null,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(mediaAssets.id, row.id),
                eq(mediaAssets.tenantId, options.tenantId),
                eq(mediaAssets.userId, options.userId),
              ),
            );
          report.migratedAssetCount += 1;
        }
      } catch (error) {
        report.errors.push({
          assetId: row.id,
          url: row.originalUrl ?? undefined,
          message: error instanceof Error ? error.message : "Managed media validation failed",
        });
      }
      return;
    }
    if (
      !row.originalUrl ||
      (!isExternalMediaUrl(row.originalUrl) && !isDataMediaUrl(row.originalUrl))
    ) {
      report.managedAssetCount += 1;
      return;
    }
    report.externalAssetCount += 1;
    const mediaType = mediaTypeForPath(row.originalUrl, row.mimeType);
    if (!options.apply) return;
    try {
      const migrated = await migrateExistingVerticalDramaMediaAsset({
        assetId: row.id,
        tenantId: options.tenantId,
        userId: options.userId,
        seriesId: seriesIds[0] ?? options.seriesId ?? "unknown",
        mediaType,
        sourceUrl: row.originalUrl,
        mimeType: row.mimeType,
        purpose: "backfill",
      });
      replacements.set(row.originalUrl, migrated.url);
      report.migratedAssetCount += 1;
    } catch (error) {
      report.expiredAssetCount += 1;
      report.errors.push({
        assetId: row.id,
        url: row.originalUrl,
        message: error instanceof Error ? error.message : "Media migration failed",
      });
      await db
        .update(mediaAssets)
        .set({ status: "expired", updatedAt: new Date() })
        .where(
          and(
            eq(mediaAssets.id, row.id),
            eq(mediaAssets.tenantId, options.tenantId),
            eq(mediaAssets.userId, options.userId),
          ),
        );
    }
  };

  const assetConcurrency = 8;
  for (let index = 0; index < assetRows.length; index += assetConcurrency) {
    await Promise.all(
      assetRows
        .slice(index, index + assetConcurrency)
        .map((row: typeof assetRows[number]) => processAsset(row)),
    );
  }

  if (options.apply) {
    const rawEntries = Array.from(rawUrls.entries());
    for (let index = 0; index < rawEntries.length; index += 4) {
      await Promise.all(rawEntries.slice(index, index + 4).map(async ([url, info]) => {
      if (replacements.has(url)) return;
      try {
        const managedKey = extractVerticalDramaManagedMediaKey(url);
        const migrated = managedKey
          ? await ensureVerticalDramaManagedMediaAsset({
              tenantId: options.tenantId,
              userId: options.userId,
              sourceUrl: url,
              mediaType: info.mediaType,
              mimeType: inferMimeType(info.mediaType, url),
            })
          : await ingestVerticalDramaMediaAsset({
              tenantId: options.tenantId,
              userId: options.userId,
              seriesId: seriesIds[0] ?? options.seriesId ?? "unknown",
              mediaType: info.mediaType,
              sourceUrl: url,
              mimeType: inferMimeType(info.mediaType, url),
              identity: `backfill-url:${url}`,
              purpose: "backfill-embedded-url",
            });
        if (!migrated) throw new Error("Managed media object is missing from storage");
        replacements.set(url, migrated.url);
        report.migratedRawUrlCount += 1;
      } catch (error) {
        report.errors.push({
          url,
          message: error instanceof Error ? error.message : "Embedded media migration failed",
        });
      }
      }));
    }

    for (const row of episodeRows) {
      const updates: Record<string, unknown> = {};
      for (const field of [
        "script",
        "storyboard",
        "startFramePlan",
        "dialogueAudioPlan",
        "motionPromptPack",
        "assemblyManifest",
        "adBannerPlan",
        "textOverlayPlan",
        "coverImage",
      ] as const) {
        let result = replaceMediaUrls(row[field], replacements);
        if (field === "assemblyManifest") {
          const linked = await linkEpisodePreviewMediaAssets(
            result.value,
            options,
          );
          if (linked.changed) result = linked;
        }
        if (result.changed) updates[field] = result.value;
      }
      if (Object.keys(updates).length) {
        await db
          .update(verticalDramaEpisodes)
          .set({ ...updates, updatedAt: new Date() })
          .where(
            and(
              eq(verticalDramaEpisodes.id, row.id),
              eq(verticalDramaEpisodes.tenantId, options.tenantId),
              eq(verticalDramaEpisodes.userId, options.userId),
            ),
          );
      }
    }
    for (const row of seriesRows) {
      const updates: Record<string, unknown> = {};
      for (const field of ["bible", "memory", "productTieIn", "policy", "trailer", "watermark", "productionEpisodesManifest"] as const) {
        const result = replaceMediaUrls(row[field], replacements);
        if (result.changed) updates[field] = result.value;
      }
      if (Object.keys(updates).length) {
        await db
          .update(verticalDramaSeries)
          .set({ ...updates, updatedAt: new Date() })
          .where(
            and(
              eq(verticalDramaSeries.id, row.id),
              eq(verticalDramaSeries.tenantId, options.tenantId),
              eq(verticalDramaSeries.userId, options.userId),
            ),
          );
      }
    }
  }

  return report;
}
