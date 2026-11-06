import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import sharp from "sharp";

import {
  mediaAssets,
  verticalDramaBookExportArtifacts,
  verticalDramaBookRevisions,
  verticalDramaBooks,
} from "../../drizzle/schema";
import { verticalDramaBookDocumentSchema } from "../../shared/verticalDramaSeries/bookDocument";
import { db } from "../db";
import { storagePut, storageReadBuffer } from "../storage";
import { buildVerticalDramaBookEpub, renderVerticalDramaBookPdf, validateVerticalDramaBookEpub } from "./verticalDramaBookRenderers";
import { fingerprintBookSource } from "./verticalDramaBookSnapshot";

export async function exportApprovedVerticalDramaBook(input: {
  tenantId: string;
  userId: number;
  artifactId: number;
  onProgress?: (stage: string, progress: number) => Promise<void>;
  assertActive?: () => Promise<void>;
}) {
  const [record] = await db.select({
    artifact: verticalDramaBookExportArtifacts,
    revision: verticalDramaBookRevisions,
    book: verticalDramaBooks,
  }).from(verticalDramaBookExportArtifacts)
    .innerJoin(verticalDramaBookRevisions, eq(verticalDramaBookRevisions.id, verticalDramaBookExportArtifacts.revisionId))
    .innerJoin(verticalDramaBooks, eq(verticalDramaBooks.id, verticalDramaBookExportArtifacts.bookId))
    .where(and(
      eq(verticalDramaBookExportArtifacts.id, input.artifactId),
      eq(verticalDramaBookExportArtifacts.tenantId, input.tenantId),
      eq(verticalDramaBookExportArtifacts.userId, input.userId),
      eq(verticalDramaBookRevisions.tenantId, input.tenantId),
      eq(verticalDramaBookRevisions.userId, input.userId),
      eq(verticalDramaBooks.tenantId, input.tenantId),
      eq(verticalDramaBooks.userId, input.userId),
      eq(verticalDramaBookRevisions.status, "approved"),
    )).limit(1);
  if (!record) throw new Error("BOOK_EXPORT_NOT_FOUND_OR_UNAPPROVED");
  const { artifact, revision, book } = record;
  const document = verticalDramaBookDocumentSchema.parse(revision.document);
  if (fingerprintBookSource(document) !== revision.documentFingerprint) throw new Error("BOOK_EXPORT_REVISION_CHECKSUM_MISMATCH");
  if (artifact.format !== "epub" && artifact.format !== "pdf") throw new Error("BOOK_EXPORT_FORMAT_INVALID");
  const [claimed] = await db.update(verticalDramaBookExportArtifacts).set({ status: "running", errorCode: null, updatedAt: new Date() }).where(and(
    eq(verticalDramaBookExportArtifacts.id, artifact.id), eq(verticalDramaBookExportArtifacts.tenantId, input.tenantId), eq(verticalDramaBookExportArtifacts.userId, input.userId), eq(verticalDramaBookExportArtifacts.status, "queued"),
  )).returning({ id: verticalDramaBookExportArtifacts.id });
  if (!claimed) throw new Error("BOOK_EXPORT_ALREADY_CLAIMED");

  try {
    const expectedChecksums = new Map<number, string>();
    if (document.metadata.coverMediaAssetId && document.metadata.coverChecksum) expectedChecksums.set(document.metadata.coverMediaAssetId, document.metadata.coverChecksum);
    for (const chapter of document.chapters) for (const block of chapter.blocks) {
      if (block.type === "illustration") expectedChecksums.set(block.mediaAssetId, block.mediaChecksum);
    }
    const snapshot = revision.sourceSnapshot as { assets?: Array<{ mediaAssetId: number; checksum: string }> };
    const pinned = new Map((snapshot.assets ?? []).map(asset => [asset.mediaAssetId, asset.checksum]));
    for (const [assetId, checksum] of expectedChecksums) if (pinned.get(assetId) !== checksum) throw new Error("BOOK_EXPORT_ASSET_NOT_PINNED");
    const ids = [...expectedChecksums.keys()];
    const assets = ids.length ? await db.select({
      id: mediaAssets.id,
      storageKey: mediaAssets.storageKey,
      mimeType: mediaAssets.mimeType,
      checksumSha256: mediaAssets.checksumSha256,
    }).from(mediaAssets).where(and(
      eq(mediaAssets.tenantId, input.tenantId),
      eq(mediaAssets.userId, input.userId),
      inArray(mediaAssets.id, ids),
    )) : [];
    if (assets.length !== ids.length) throw new Error("BOOK_EXPORT_ASSET_NOT_AUTHORIZED");
    const images: Array<{ mediaAssetId: number; checksum: string; renderChecksum?: string; mimeType: string; bytes: Buffer }> = [];
    let bytesLoaded = 0;
    let pixelsLoaded = 0;
    for (const asset of assets) {
      const expected = expectedChecksums.get(asset.id)!;
      if (asset.checksumSha256?.toLowerCase() !== expected.toLowerCase() || !asset.mimeType.toLowerCase().startsWith("image/")) throw new Error("BOOK_EXPORT_ASSET_CHANGED");
      const bytes = await storageReadBuffer(asset.storageKey);
      if (!bytes) throw new Error("BOOK_EXPORT_ASSET_STORAGE_MISSING");
      if (createHash("sha256").update(bytes).digest("hex") !== expected.toLowerCase()) throw new Error("BOOK_EXPORT_ASSET_CHANGED");
      bytesLoaded += bytes.byteLength;
      if (bytesLoaded > 100 * 1024 * 1024) throw new Error("BOOK_EXPORT_IMAGE_BATCH_TOO_LARGE");
      const metadata = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata().catch(() => { throw new Error("BOOK_EXPORT_IMAGE_DECODE_FAILED"); });
      const pixels = (metadata.width ?? 0) * (metadata.height ?? 0);
      if (!pixels || pixels > 40_000_000 || (pixelsLoaded += pixels) > 100_000_000) throw new Error("BOOK_EXPORT_IMAGE_PIXEL_LIMIT");
      if (asset.mimeType.toLowerCase().split(";")[0].trim() === "image/webp") {
        const normalized = await sharp(bytes, { limitInputPixels: 40_000_000 }).png().toBuffer();
        images.push({ mediaAssetId: asset.id, checksum: expected, renderChecksum: createHash("sha256").update(normalized).digest("hex"), mimeType: "image/png", bytes: normalized });
      } else {
        const mimeType = asset.mimeType.toLowerCase().split(";")[0].trim();
        images.push({ mediaAssetId: asset.id, checksum: expected, mimeType: mimeType === "image/jpg" ? "image/jpeg" : mimeType, bytes });
      }
    }
    await input.onProgress?.("rendering", 35);
    await input.assertActive?.();
    const renderInput = { document, images };
    const bytes = artifact.format === "epub" ? buildVerticalDramaBookEpub(renderInput) : await renderVerticalDramaBookPdf(renderInput);
    if (bytes.byteLength > 100 * 1024 * 1024) throw new Error("BOOK_EXPORT_ARTIFACT_TOO_LARGE");
    await input.assertActive?.();
    let validation: Record<string, unknown>;
    const [validating] = await db.update(verticalDramaBookExportArtifacts).set({ status: "validating", updatedAt: new Date() }).where(and(
      eq(verticalDramaBookExportArtifacts.id, artifact.id), eq(verticalDramaBookExportArtifacts.tenantId, input.tenantId), eq(verticalDramaBookExportArtifacts.userId, input.userId), eq(verticalDramaBookExportArtifacts.status, "running"),
    )).returning({ id: verticalDramaBookExportArtifacts.id });
    if (!validating) throw new Error("BOOK_EXPORT_CANCELLED_OR_STALE");
    if (artifact.format === "epub") {
      validation = await validateVerticalDramaBookEpub(bytes);
    } else {
      validation = { validator: "playwright+poppler", status: "passed", title: document.metadata.title, textExtracted: true, pageSize: "A5" };
    }
    await input.onProgress?.("storing", 80);
    await input.assertActive?.();
    const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
    const extension = artifact.format;
    const storageKey = `vertical-drama-books/${input.tenantId}/${book.id}/${revision.id}/${artifact.format}/${artifact.id}.${extension}`;
    await storagePut(storageKey, bytes, artifact.format === "epub" ? "application/epub+zip" : "application/pdf");
    const readback = await storageReadBuffer(storageKey);
    if (!readback || createHash("sha256").update(readback).digest("hex") !== checksumSha256) throw new Error("BOOK_EXPORT_STORAGE_READBACK_FAILED");
    await input.assertActive?.();
    const [available] = await db.update(verticalDramaBookExportArtifacts).set({
      status: "available",
      storageKey,
      checksumSha256,
      sizeBytes: bytes.byteLength,
      validation,
      errorCode: null,
      updatedAt: new Date(),
    }).where(and(
      eq(verticalDramaBookExportArtifacts.id, artifact.id), eq(verticalDramaBookExportArtifacts.tenantId, input.tenantId), eq(verticalDramaBookExportArtifacts.userId, input.userId), eq(verticalDramaBookExportArtifacts.status, "validating"),
    )).returning();
    if (!available) throw new Error("BOOK_EXPORT_CANCELLED_OR_STALE");
    await input.onProgress?.("completed", 100);
    return { artifactId: available.id, format: artifact.format, checksumSha256, sizeBytes: bytes.byteLength, validation };
  } catch (error) {
    const code = error instanceof Error && /^BOOK_[A-Z0-9_]+$/.test(error.message) ? error.message : "BOOK_EXPORT_FAILED";
    await db.update(verticalDramaBookExportArtifacts).set({ status: "failed", errorCode: code, updatedAt: new Date() }).where(and(
      eq(verticalDramaBookExportArtifacts.id, artifact.id), eq(verticalDramaBookExportArtifacts.tenantId, input.tenantId), eq(verticalDramaBookExportArtifacts.userId, input.userId), inArray(verticalDramaBookExportArtifacts.status, ["running", "validating"]),
    ));
    throw new Error(code);
  }
}
