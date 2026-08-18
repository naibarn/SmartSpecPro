import { and, eq, isNull } from "drizzle-orm";
import { libraryItems } from "../../drizzle/schema";
import { getDb } from "../db";
import { storageExists, storagePut } from "../storage";

const MAX_MEDIA_BYTES = 100 * 1024 * 1024;

type LibraryMediaBackfillOptions = {
  tenantId?: string;
  limit?: number;
  apply: boolean;
};

export type LibraryMediaBackfillReport = {
  scanned: number;
  durable: number;
  migrated: number;
  missing: number;
  errors: Array<{ id: number; url?: string; message: string }>;
};

function isManagedUrl(value: string): boolean {
  return value.startsWith("/api/storage/files/") || value.startsWith("/uploads/");
}

function isExternalUrl(value: string): boolean {
  return /^https:\/\//i.test(value);
}

function storageKeyFromUrl(value: string): string | null {
  if (!isManagedUrl(value)) return null;
  const prefix = value.startsWith("/uploads/") ? "/uploads/" : "/api/storage/files/";
  const encoded = value.slice(prefix.length).split(/[?#]/, 1)[0];
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded).replace(/^\/+/, "");
  } catch {
    return null;
  }
}

function extensionFor(contentType: string, url: string): string {
  const normalized = contentType.split(";", 1)[0].toLowerCase();
  const byMime: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
  };
  if (byMime[normalized]) return byMime[normalized];
  const suffix = url.split("?", 1)[0].match(/\.(jpe?g|png|webp|gif|svg)$/i)?.[1];
  return suffix ? `.${suffix.toLowerCase()}` : ".bin";
}

async function downloadExternalImage(url: string): Promise<{
  bytes: Buffer;
  contentType: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`source responded with HTTP ${response.status}`);
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_MEDIA_BYTES) throw new Error("source image is too large");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new Error("source image is empty");
    if (bytes.length > MAX_MEDIA_BYTES) throw new Error("source image is too large");
    const contentType = response.headers.get("content-type") || "image/jpeg";
    if (!contentType.toLowerCase().startsWith("image/")) {
      throw new Error("source did not return an image");
    }
    return { bytes, contentType };
  } finally {
    clearTimeout(timeout);
  }
}

export async function backfillLibraryMedia(
  options: LibraryMediaBackfillOptions,
): Promise<LibraryMediaBackfillReport> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db
    .select({
      id: libraryItems.id,
      tenantId: libraryItems.tenantId,
      ownerUserId: libraryItems.ownerUserId,
      sourceUrl: libraryItems.sourceUrl,
      thumbnailUrl: libraryItems.thumbnailUrl,
      metadata: libraryItems.metadata,
    })
    .from(libraryItems)
    .where(
      and(
        isNull(libraryItems.deletedAt),
        eq(libraryItems.itemType, "image"),
        ...(options.tenantId ? [eq(libraryItems.tenantId, options.tenantId)] : []),
      ),
    )
    .limit(options.limit && options.limit > 0 ? options.limit : 10000);

  const report: LibraryMediaBackfillReport = {
    scanned: rows.length,
    durable: 0,
    migrated: 0,
    missing: 0,
    errors: [],
  };

  for (const row of rows) {
    const sourceUrl = row.sourceUrl?.trim() || row.thumbnailUrl?.trim() || "";
    if (!sourceUrl) {
      report.missing += 1;
      continue;
    }

    const managedKey = storageKeyFromUrl(sourceUrl);
    if (managedKey) {
      report.durable += 1;
      if (!options.apply) continue;
      const objectExists = await storageExists(managedKey);
      const metadata = {
        ...(row.metadata || {}),
        source_key: managedKey,
        media_availability: objectExists ? "managed" : "missing",
        media_availability_checked_at: new Date().toISOString(),
        ...(objectExists ? {} : { media_availability_error: "Managed media object is missing from storage" }),
      };
      if (!objectExists) report.missing += 1;
      await db
        .update(libraryItems)
        .set({
          sourceUrl: `/api/storage/files/${encodeURI(managedKey)}`,
          thumbnailUrl: `/api/storage/files/${encodeURI(managedKey)}`,
          metadata,
          updatedAt: new Date(),
        })
        .where(eq(libraryItems.id, row.id));
      continue;
    }

    if (!isExternalUrl(sourceUrl)) {
      report.missing += 1;
      continue;
    }

    if (!options.apply) {
      report.migrated += 1;
      continue;
    }

    try {
      const downloaded = await downloadExternalImage(sourceUrl);
      const key = `library/backfill/${row.tenantId}/${row.ownerUserId}/${row.id}${extensionFor(downloaded.contentType, sourceUrl)}`;
      const stored = await storagePut(key, downloaded.bytes, downloaded.contentType);
      const durableUrl = stored.url || `/api/storage/files/${encodeURI(stored.key)}`;
      await db
        .update(libraryItems)
        .set({
          sourceUrl: durableUrl,
          thumbnailUrl: durableUrl,
          metadata: {
            ...(row.metadata || {}),
            media_availability: "durable",
            media_availability_checked_at: new Date().toISOString(),
            original_source_url: sourceUrl,
            source_key: stored.key,
          },
          updatedAt: new Date(),
        })
        .where(eq(libraryItems.id, row.id));
      report.migrated += 1;
    } catch (error) {
      report.missing += 1;
      report.errors.push({
        id: row.id,
        url: sourceUrl,
        message: error instanceof Error ? error.message : "Image migration failed",
      });
      await db
        .update(libraryItems)
        .set({
          metadata: {
            ...(row.metadata || {}),
            media_availability: "missing",
            media_availability_checked_at: new Date().toISOString(),
            media_availability_error: error instanceof Error ? error.message : "Image migration failed",
            original_source_url: sourceUrl,
          },
          updatedAt: new Date(),
        })
        .where(eq(libraryItems.id, row.id));
    }
  }

  return report;
}
