import "dotenv/config";
import fs from "fs";
import path from "path";
import { and, eq, isNull, isNotNull, like, or } from "drizzle-orm";

import { getDb } from "../server/db";
import {
  libraryItems,
  mediaAssets,
  mediaTaskArtifacts,
  presentationExports,
} from "../drizzle/schema";
import {
  copyMediaBufferToR2,
  copyMediaSourceToR2,
  ensureExternalMediaAssetDurable,
  type DurableMediaSourceType,
} from "../server/services/durableMediaAssetService";
import { ProviderResultError } from "../server/services/mediaTaskArtifactService";
import type { MediaType } from "../server/services/mediaGenerationService";

type MigrationResult =
  | "copied"
  | "already_durable"
  | "skipped"
  | "expired"
  | "failed";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find(value => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function limit(): number {
  const value = Number(arg("limit") ?? 1000);
  return Number.isInteger(value) && value > 0 ? Math.min(value, 5000) : 1000;
}

function isHttp(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function isManaged(value: unknown): value is string {
  return (
    typeof value === "string" && value.trim().startsWith("/api/storage/files/")
  );
}

function parseDataUrl(
  value: unknown
): { buffer: Buffer; mimeType: string } | null {
  if (typeof value !== "string") return null;
  const match = value.match(
    /^data:(image\/(?:jpeg|png|webp|gif));base64,([a-z0-9+/=\s]+)$/i
  );
  if (!match) return null;
  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  return buffer.length > 0
    ? { buffer, mimeType: match[1].toLowerCase() }
    : null;
}

function mediaTypeFromValue(value: unknown): MediaType {
  return value === "video" ? "video" : value === "audio" ? "audio" : "image";
}

function mediaTypeFromMime(value: unknown): MediaType {
  if (typeof value === "string" && value.toLowerCase().startsWith("video/"))
    return "video";
  if (typeof value === "string" && value.toLowerCase().startsWith("audio/"))
    return "audio";
  return "image";
}

function mediaTypeFromFormat(format: unknown): MediaType {
  return format === "mp4" ? "video" : "image";
}

function localRoots(): string[] {
  const roots = [
    process.env.MEDIA_STORAGE_PATH,
    path.resolve(process.cwd(), "media_storage"),
    path.resolve(process.cwd(), "../python-backend/media_storage"),
    path.resolve(process.cwd(), "../../python-backend/media_storage"),
    path.resolve(process.cwd(), "uploads"),
    path.resolve(process.cwd(), "../uploads"),
  ].filter((value): value is string => Boolean(value));
  const worktreesRoot = path.resolve(process.cwd(), "../../.claude/worktrees");
  try {
    for (const entry of fs.readdirSync(worktreesRoot, {
      withFileTypes: true,
    })) {
      if (entry.isDirectory()) {
        roots.push(
          path.join(
            worktreesRoot,
            entry.name,
            "python-backend",
            "media_storage"
          )
        );
      }
    }
  } catch {
    // Worktree artifacts are optional; the main runtime storage roots remain authoritative.
  }
  return roots;
}

function safeLocalPath(url: string): string | null {
  const clean = url.split("?", 1)[0];
  const mediaPrefix = "/api/v1/media/files/";
  const presentationPrefix = "/api/v1/presentations/export/files/";
  const uploadPrefix = "/uploads/";
  let relative: string | null = null;
  if (clean.startsWith(mediaPrefix)) relative = clean.slice(mediaPrefix.length);
  else if (clean.startsWith(presentationPrefix)) {
    const parts = clean.slice(presentationPrefix.length).split("/");
    if (parts.length >= 2)
      relative = path.join("presentation_exports", parts[0], ...parts.slice(1));
  } else if (clean.startsWith(uploadPrefix))
    relative = clean.slice(uploadPrefix.length);
  if (!relative || relative.includes("..")) return null;
  for (const root of localRoots()) {
    const candidate = path.resolve(root, relative);
    const resolvedRoot = path.resolve(root);
    if (!candidate.startsWith(`${resolvedRoot}${path.sep}`)) continue;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function sourceFor(
  values: Array<string | null | undefined>
): { url?: string; localPath?: string } | null {
  for (const value of values) {
    if (!value) continue;
    if (isHttp(value) || isManaged(value)) return { url: value.trim() };
    const localPath = safeLocalPath(value.trim());
    if (localPath) return { localPath };
  }
  return null;
}

function errorKind(error: unknown): "expired" | "failed" {
  return error instanceof ProviderResultError &&
    error.providerStatus === "expired"
    ? "expired"
    : "failed";
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/\S+/gi, "[provider-url]").slice(0, 400);
}

function quarantineKey(prefix: string, id: number | string): string {
  return `quarantine/media-migration/${prefix}/${String(id).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

async function migrateMediaAssets(apply: boolean, max: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(mediaAssets)
    .where(
      or(
        like(mediaAssets.storageKey, "http://%"),
        like(mediaAssets.storageKey, "https://%"),
        like(mediaAssets.storageKey, "/api/v1/%"),
        like(mediaAssets.storageKey, "/uploads/%"),
        like(mediaAssets.storageKey, "data:image/%"),
        like(mediaAssets.originalUrl, "http://%"),
        like(mediaAssets.originalUrl, "https://%")
      )
    )
    .limit(max);
  const report = {
    scanned: rows.length,
    copied: 0,
    expired: 0,
    failed: 0,
    skipped: 0,
  };
  for (const row of rows) {
    const inlineSource =
      parseDataUrl(row.storageKey) ?? parseDataUrl(row.originalUrl);
    if (inlineSource) {
      if (!apply) continue;
      try {
        const copy = await copyMediaBufferToR2(
          {
            tenantId: row.tenantId,
            userId: row.userId,
            mediaType: "image",
            sourceType: "chat_attachment",
            originalUrl: row.originalUrl ?? row.storageKey,
            mimeType: inlineSource.mimeType,
          },
          inlineSource.buffer
        );
        await db
          .update(mediaAssets)
          .set({
            status: "ready",
            storageKey: copy.storageKey,
            originalUrl: row.originalUrl ?? row.storageKey,
            thumbnailUrl: copy.url,
            mimeType: copy.mimeType,
            fileSize: copy.fileSize,
            checksumSha256: copy.checksumSha256,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(mediaAssets.id, row.id),
              eq(mediaAssets.tenantId, row.tenantId),
              eq(mediaAssets.userId, row.userId)
            )
          );
        report.copied += 1;
      } catch (error) {
        report.failed += 1;
        console.warn(
          JSON.stringify({
            scope: "media_asset",
            id: row.id,
            status: "failed",
            error: safeError(error),
          })
        );
      }
      continue;
    }
    if (row.status === "ready" && !/^https?:\/\//i.test(row.storageKey)) {
      report.skipped += 1;
      continue;
    }
    if (row.status === "expired" && !process.argv.includes("--retry-expired")) {
      if (apply && /^https?:\/\//i.test(row.storageKey)) {
        await db
          .update(mediaAssets)
          .set({
            storageKey: quarantineKey("asset", row.id),
            thumbnailUrl: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(mediaAssets.id, row.id),
              eq(mediaAssets.tenantId, row.tenantId),
              eq(mediaAssets.userId, row.userId)
            )
          );
      }
      report.skipped += 1;
      continue;
    }
    const source = sourceFor([row.storageKey, row.originalUrl]);
    if (!source) {
      report.skipped += 1;
      continue;
    }
    if (!apply) continue;
    try {
      const copy = await copyMediaSourceToR2({
        tenantId: row.tenantId,
        userId: row.userId,
        mediaType: mediaTypeFromValue(row.mimeType.split("/", 1)[0]),
        sourceType: (row.sourceType === "vd_character_portrait" ||
        row.sourceType === "vd_character_turnaround"
          ? row.sourceType
          : "library_migrated") as DurableMediaSourceType,
        sourceUrl: source.url,
        sourcePath: source.localPath,
        originalUrl: isManaged(row.originalUrl) ? null : row.originalUrl,
        mimeType: row.mimeType,
      });
      await db
        .update(mediaAssets)
        .set({
          status: "ready",
          storageKey: copy.storageKey,
          originalUrl:
            row.originalUrl && !isManaged(row.originalUrl)
              ? row.originalUrl
              : copy.originalUrl,
          thumbnailUrl: row.mimeType.startsWith("image/")
            ? copy.url
            : row.thumbnailUrl,
          mimeType: copy.mimeType,
          fileSize: copy.fileSize || row.fileSize,
          checksumSha256: copy.checksumSha256,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(mediaAssets.id, row.id),
            eq(mediaAssets.tenantId, row.tenantId),
            eq(mediaAssets.userId, row.userId)
          )
        );
      report.copied += 1;
    } catch (error) {
      const kind = errorKind(error);
      await db
        .update(mediaAssets)
        .set({
          status: kind === "expired" ? "expired" : "pending",
          storageKey: quarantineKey("asset", row.id),
          thumbnailUrl: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(mediaAssets.id, row.id),
            eq(mediaAssets.tenantId, row.tenantId),
            eq(mediaAssets.userId, row.userId)
          )
        );
      if (kind === "expired") report.expired += 1;
      else report.failed += 1;
      console.warn(
        JSON.stringify({
          scope: "media_asset",
          id: row.id,
          status: kind,
          error: safeError(error),
        })
      );
    }
  }
  return report;
}

async function migrateLibraryItems(apply: boolean, max: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(libraryItems)
    .where(
      or(
        like(libraryItems.sourceUrl, "http://%"),
        like(libraryItems.sourceUrl, "https://%"),
        like(libraryItems.sourceUrl, "/api/v1/%"),
        like(libraryItems.sourceUrl, "/uploads/%")
      )
    )
    .limit(max);
  const report = { scanned: rows.length, copied: 0, expired: 0, failed: 0 };
  for (const row of rows) {
    const source = sourceFor([row.sourceUrl]);
    if (!source || !row.sourceUrl) continue;
    const metadata = { ...((row.metadata ?? {}) as Record<string, unknown>) };
    if (!apply) continue;
    try {
      const durable = await ensureExternalMediaAssetDurable({
        tenantId: row.tenantId,
        userId: row.ownerUserId,
        mediaType: mediaTypeFromValue(row.itemType),
        sourceType: "library_migrated",
        sourceUrl: source.url,
        sourcePath: source.localPath,
        originalUrl: row.sourceUrl,
        identity: `library:${row.id}`,
      });
      metadata.provider_original_url = row.sourceUrl;
      metadata.media_asset_id = durable.assetId;
      metadata.source_key = durable.copy.storageKey;
      metadata.media_availability = "r2_ready";
      await db
        .update(libraryItems)
        .set({
          sourceUrl: durable.copy.url,
          thumbnailUrl:
            row.itemType === "image" ? durable.copy.url : row.thumbnailUrl,
          metadata,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(libraryItems.id, row.id),
            eq(libraryItems.tenantId, row.tenantId),
            eq(libraryItems.ownerUserId, row.ownerUserId)
          )
        );
      report.copied += 1;
    } catch (error) {
      const kind = errorKind(error);
      metadata.provider_original_url = row.sourceUrl;
      metadata.media_availability =
        kind === "expired" ? "provider_expired" : "storage_pending";
      metadata.media_migration_error = safeError(error);
      await db
        .update(libraryItems)
        .set({
          sourceUrl: null,
          thumbnailUrl: null,
          status: "failed",
          metadata,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(libraryItems.id, row.id),
            eq(libraryItems.tenantId, row.tenantId),
            eq(libraryItems.ownerUserId, row.ownerUserId)
          )
        );
      if (kind === "expired") report.expired += 1;
      else report.failed += 1;
      console.warn(
        JSON.stringify({
          scope: "library_item",
          id: row.id,
          status: kind,
          error: safeError(error),
        })
      );
    }
  }
  return report;
}

async function migrateMediaTaskArtifacts(apply: boolean, max: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(mediaTaskArtifacts)
    .where(
      and(
        isNotNull(mediaTaskArtifacts.providerOriginalUrl),
        or(
          eq(mediaTaskArtifacts.r2Status, "pending"),
          eq(mediaTaskArtifacts.r2Status, "failed"),
          eq(mediaTaskArtifacts.r2Status, "missing")
        )
      )
    )
    .limit(max);
  const report = { scanned: rows.length, copied: 0, expired: 0, failed: 0 };
  for (const row of rows) {
    const sourceUrl = row.providerOriginalUrl?.trim();
    if (!sourceUrl) continue;
    if (!apply) continue;
    try {
      const durable = await ensureExternalMediaAssetDurable({
        tenantId: row.tenantId,
        userId: row.userId,
        mediaType: mediaTypeFromMime(row.mediaType),
        sourceType: "media_studio_generated",
        sourceUrl,
        originalUrl: sourceUrl,
        identity: `media-task-artifact:${row.id}`,
      });
      await db
        .update(mediaTaskArtifacts)
        .set({
          mediaAssetId: durable.assetId,
          r2StorageKey: durable.copy.storageKey,
          r2Status: "ready",
          r2Error: null,
          providerStatus: "available",
          providerCheckedAt: new Date(),
          providerError: null,
          nextRetryAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(mediaTaskArtifacts.id, row.id),
            eq(mediaTaskArtifacts.tenantId, row.tenantId),
            eq(mediaTaskArtifacts.userId, row.userId)
          )
        );
      report.copied += 1;
    } catch (error) {
      const kind = errorKind(error);
      await db
        .update(mediaTaskArtifacts)
        .set({
          providerStatus: kind === "expired" ? "expired" : "unavailable",
          providerCheckedAt: new Date(),
          providerError:
            kind === "expired"
              ? "Provider result URL expired"
              : safeError(error),
          r2Status: "failed",
          r2Error: safeError(error),
          nextRetryAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(mediaTaskArtifacts.id, row.id),
            eq(mediaTaskArtifacts.tenantId, row.tenantId),
            eq(mediaTaskArtifacts.userId, row.userId)
          )
        );
      if (kind === "expired") report.expired += 1;
      else report.failed += 1;
      console.warn(
        JSON.stringify({
          scope: "media_task_artifact",
          id: row.id,
          status: kind,
          error: safeError(error),
        })
      );
    }
  }
  return report;
}

async function migratePresentationExports(apply: boolean, max: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(presentationExports)
    .where(
      or(
        and(
          eq(presentationExports.status, "done"),
          or(
            like(presentationExports.outputUrl, "http://%"),
            like(presentationExports.outputUrl, "https://%"),
            like(presentationExports.outputUrl, "/api/v1/%")
          )
        ),
        and(
          eq(presentationExports.status, "done"),
          isNull(presentationExports.outputUrl),
          isNotNull(presentationExports.outputOriginalUrl),
          isNull(presentationExports.outputStorageKey)
        )
      )
    )
    .limit(max);
  const report = { scanned: rows.length, copied: 0, expired: 0, failed: 0 };
  for (const row of rows) {
    if (row.outputStorageKey) continue;
    if (!row.outputUrl) {
      if (apply) {
        await db
          .update(presentationExports)
          .set({
            status: "error",
            errorMessage: row.errorMessage ?? "LOCAL_EXPORT_UNAVAILABLE",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(presentationExports.id, row.id),
              eq(presentationExports.tenantId, row.tenantId)
            )
          );
      }
      report.failed += 1;
      continue;
    }
    const source = sourceFor([row.outputUrl]);
    if (!row.outputUrl || row.status !== "done") continue;
    if (!source) {
      if (apply) {
        await db
          .update(presentationExports)
          .set({
            outputUrl: null,
            outputOriginalUrl: row.outputUrl,
            errorMessage: "LOCAL_EXPORT_UNAVAILABLE",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(presentationExports.id, row.id),
              eq(presentationExports.tenantId, row.tenantId)
            )
          );
      }
      report.failed += 1;
      continue;
    }
    if (!apply) continue;
    try {
      const copy = await copyMediaSourceToR2({
        tenantId: row.tenantId,
        userId: row.userId ?? 0,
        mediaType: mediaTypeFromFormat(row.format),
        sourceType: "presentation_export",
        sourceUrl: source.url,
        sourcePath: source.localPath,
        originalUrl: row.outputUrl,
        mimeType: row.format === "mp4" ? "video/mp4" : "application/zip",
        identity: `presentation:${row.id}`,
      });
      await db
        .update(presentationExports)
        .set({
          outputUrl: copy.url,
          outputOriginalUrl: row.outputUrl,
          outputStorageKey: copy.storageKey,
          outputBytes: copy.fileSize || row.outputBytes,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(presentationExports.id, row.id),
            eq(presentationExports.tenantId, row.tenantId)
          )
        );
      report.copied += 1;
    } catch (error) {
      const kind = errorKind(error);
      await db
        .update(presentationExports)
        .set({
          outputUrl: null,
          outputOriginalUrl: row.outputUrl,
          errorMessage:
            kind === "expired"
              ? "PROVIDER_EXPORT_EXPIRED"
              : "R2_EXPORT_MIGRATION_PENDING",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(presentationExports.id, row.id),
            eq(presentationExports.tenantId, row.tenantId)
          )
        );
      if (kind === "expired") report.expired += 1;
      else report.failed += 1;
      console.warn(
        JSON.stringify({
          scope: "presentation_export",
          id: row.id,
          status: kind,
          error: safeError(error),
        })
      );
    }
  }
  return report;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const max = limit();
  const scope = arg("scope") ?? "all";
  if (
    !["all", "assets", "artifacts", "library", "presentations"].includes(scope)
  ) {
    throw new Error(
      "--scope must be all, assets, artifacts, library, or presentations"
    );
  }
  const report = {
    apply,
    scope,
    limit: max,
    mediaAssets: ["library", "artifacts", "presentations"].includes(scope)
      ? null
      : await migrateMediaAssets(apply, max),
    mediaTaskArtifacts: ["assets", "library", "presentations"].includes(scope)
      ? null
      : await migrateMediaTaskArtifacts(apply, max),
    libraryItems: ["assets", "artifacts", "presentations"].includes(scope)
      ? null
      : await migrateLibraryItems(apply, max),
    presentationExports: ["assets", "artifacts", "library"].includes(scope)
      ? null
      : await migratePresentationExports(apply, max),
  };
  console.log(JSON.stringify(report, null, 2));
  if (!apply)
    console.log("Dry run only. Add --apply after reviewing the inventory.");
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
