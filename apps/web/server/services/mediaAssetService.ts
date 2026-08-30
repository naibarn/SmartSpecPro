import crypto from "crypto";
import { eq, and, isNotNull } from "drizzle-orm";
import sharp from "sharp";
import { getDb } from "../db";
import { mediaAssets } from "../../drizzle/schema";
import { storagePresignGet, storageResolveUrl } from "../storage";
import { extractVerticalDramaManagedMediaKey } from "./verticalDramaMediaAssetService";
import { copyMediaBufferToR2, copyMediaSourceToR2 } from "./durableMediaAssetService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AttachmentInput = {
  type: "image" | "file" | "audio" | "video";
  url: string;
  key?: string;
  name?: string;
  size?: number;
  mimeType?: string;
  thumbnail?: string;
  assetId?: number;
};

type AssetContext = {
  userId: number;
  tenantId: string;
  conversationId: number;
  messageId: number;
  projectId: string;
};

type ValidationResult = { valid: boolean; reason?: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// ---------------------------------------------------------------------------
// validateImage
// ---------------------------------------------------------------------------

export function validateImage(mimeType: string | undefined, fileSize: number | undefined): ValidationResult {
  if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
    return {
      valid: false,
      reason: `Unsupported image type: ${mimeType ?? "unknown"}. Allowed: JPEG, PNG, WebP, GIF. SVG and HEIC are not supported.`,
    };
  }
  if (fileSize !== undefined && fileSize > MAX_FILE_SIZE) {
    return { valid: false, reason: `File size ${fileSize} bytes exceeds 20 MB limit.` };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// generateSignedUrl
// ---------------------------------------------------------------------------

export async function generateSignedUrl(storageKey: string | null, expirySeconds = 3600): Promise<string | null> {
  if (!storageKey) return null;
  const presigned = await storagePresignGet(storageKey, expirySeconds);
  if (presigned) return presigned.url;
  // Fallback: proxy URL for local storage
  const resolved = await storageResolveUrl(storageKey);
  return resolved ?? `/api/storage/files/${storageKey}`;
}

// ---------------------------------------------------------------------------
// computePerceptualHash  — dHash (difference hash)
// Compares each pixel to the one to its right in an 9×8 grid → 64-bit hash
// ---------------------------------------------------------------------------

export async function computePerceptualHash(imageBuffer: Buffer): Promise<string | null> {
  try {
    // 9 wide × 8 tall so we can compute 8 horizontal differences per row
    const buffer = await sharp(imageBuffer)
      .resize(9, 8, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer();

    const pixels = Array.from(buffer);
    let bits = "";
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const idx = row * 9 + col;
        bits += pixels[idx] < pixels[idx + 1] ? "1" : "0";
      }
    }
    // Encode 64 bits → 16 hex chars
    let hex = "";
    for (let i = 0; i < bits.length; i += 4) {
      hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    }
    return hex;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// hammingDistance — helper for perceptual hash comparison
// ---------------------------------------------------------------------------

function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    dist += xor.toString(2).split("1").length - 1;
  }
  return dist;
}

// ---------------------------------------------------------------------------
// extractDimensions — optional sharp metadata extraction
// ---------------------------------------------------------------------------

async function extractDimensions(buffer: Buffer): Promise<{ width?: number; height?: number }> {
  try {
    const metadata = await sharp(buffer).metadata();
    return { width: metadata.width, height: metadata.height };
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// createAssetFromAttachment
// ---------------------------------------------------------------------------

export async function createAssetFromAttachment(
  attachment: AttachmentInput,
  context: AssetContext,
): Promise<{ assetId: number }> {
  // 1. Validate
  const validation = validateImage(attachment.mimeType, attachment.size);
  if (!validation.valid) {
    throw new Error(`Image validation failed: ${validation.reason}`);
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 2. External provider attachments are copied to R2 before registration.
  const managedStorageKey = extractVerticalDramaManagedMediaKey(attachment.url);
  const externalProviderUrl = /^https?:\/\//i.test(attachment.url.trim())
    ? attachment.url.trim()
    : null;
  const dataImageMatch = attachment.url.match(
    /^data:(image\/(?:jpeg|png|webp|gif));base64,([a-z0-9+/=\s]+)$/i,
  );
  const dataImageBuffer = dataImageMatch
    ? Buffer.from(dataImageMatch[2].replace(/\s+/g, ""), "base64")
    : null;
  if (dataImageBuffer && dataImageBuffer.byteLength > MAX_FILE_SIZE) {
    throw new Error("Image validation failed: inline image exceeds 20 MB limit.");
  }
  const durableCopy = externalProviderUrl
    ? await copyMediaSourceToR2({
        tenantId: context.tenantId,
        userId: context.userId,
        mediaType: "image",
        sourceType: "chat_attachment",
        sourceUrl: externalProviderUrl,
        originalUrl: externalProviderUrl,
        mimeType: attachment.mimeType,
      })
    : null;
  const durableBufferCopy = dataImageBuffer
    ? await copyMediaBufferToR2(
        {
          tenantId: context.tenantId,
          userId: context.userId,
          mediaType: "image",
          sourceType: "chat_attachment",
          originalUrl: attachment.url,
          mimeType: dataImageMatch?.[1] ?? attachment.mimeType,
        },
        dataImageBuffer,
      )
    : null;
  const durableStorageKey = durableCopy?.storageKey ?? durableBufferCopy?.storageKey ?? managedStorageKey;
  const durableUrl = durableCopy?.url ?? (managedStorageKey
    ? `/api/storage/files/${encodeURI(managedStorageKey)}`
    : durableBufferCopy?.url ?? attachment.url);
  const checksumInput = durableStorageKey ?? attachment.key ?? attachment.url;
  const checksumSha256 = crypto.createHash("sha256").update(checksumInput).digest("hex");

  // 3. Check for duplicate (same checksum + tenant + user)
  const existing = await db
    .select()
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.checksumSha256, checksumSha256),
        eq(mediaAssets.tenantId, context.tenantId),
        eq(mediaAssets.userId, context.userId),
      ),
    );

  if (existing.length > 0) {
    return { assetId: existing[0].id };
  }

  // 4. Extract dimensions via sharp if buffer is available (key present = locally stored file)
  // Dimension extraction is best-effort; failures are non-fatal
  let width: number | undefined;
  let height: number | undefined;
  if (attachment.key) {
    try {
      const dims = await extractDimensions(Buffer.from(attachment.key));
      width = dims.width;
      height = dims.height;
    } catch {
      // ignore — vision pipeline will extract dimensions later
    }
  }

  // 5. Insert new asset row
  const inserted = await db
    .insert(mediaAssets)
    .values({
      tenantId: context.tenantId,
      userId: context.userId,
      conversationId: context.conversationId,
      messageId: context.messageId,
      projectId: context.projectId,
      sourceType: "chat_attachment",
      status: durableCopy || durableBufferCopy ? "ready" : "pending",
      storageKey: durableStorageKey ?? attachment.key ?? attachment.url,
      originalUrl: externalProviderUrl ?? durableBufferCopy?.originalUrl ?? durableUrl,
      mimeType: durableCopy?.mimeType ?? durableBufferCopy?.mimeType ?? attachment.mimeType!,
      fileSize: durableCopy?.fileSize || durableBufferCopy?.fileSize || attachment.size,
      checksumSha256,
      width,
      height,
    })
    .returning({ id: mediaAssets.id });

  return { assetId: inserted[0].id };
}

// ---------------------------------------------------------------------------
// fetchAsset
// ---------------------------------------------------------------------------

export async function fetchAsset(
  assetId: number,
  tenantId: string,
  userId?: number,
): Promise<(typeof mediaAssets.$inferSelect & { signedUrl: string | null }) | null> {
  const ownerUserId = Number.isInteger(userId) && (userId as number) > 0 ? userId as number : null;
  // A tenant is not a sufficient download authority when this helper is used
  // outside a trusted internal workflow. Preserve legacy test/internal calls,
  // but fail closed in production unless the owner is explicit.
  if (process.env.NODE_ENV === "production" && ownerUserId === null) {
    return null;
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [eq(mediaAssets.id, assetId), eq(mediaAssets.tenantId, tenantId)];
  if (ownerUserId !== null) {
    conditions.push(eq(mediaAssets.userId, ownerUserId));
  }
  const rows = await db
    .select()
    .from(mediaAssets)
    .where(and(...conditions));

  if (rows.length === 0) return null;

  const asset = rows[0];
  const signedUrl = await generateSignedUrl(asset.storageKey);
  return { ...asset, signedUrl };
}

// ---------------------------------------------------------------------------
// findSimilarAssets
// ---------------------------------------------------------------------------

export async function findSimilarAssets(
  hash: string,
  tenantId: string,
  threshold = 10,
): Promise<Array<typeof mediaAssets.$inferSelect & { distance: number }>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const candidates = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.tenantId, tenantId), isNotNull(mediaAssets.perceptualHash)));

  return candidates
    .map((asset) => ({ ...asset, distance: hammingDistance(hash, asset.perceptualHash!) }))
    .filter((a) => a.distance <= threshold)
    .sort((a, b) => a.distance - b.distance);
}

// ---------------------------------------------------------------------------
// deleteAsset
// ---------------------------------------------------------------------------

export async function deleteAsset(
  assetId: number,
  userId: number,
  tenantId: string,
): Promise<{ deleted: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Include userId in WHERE to prevent timing oracle — attacker cannot distinguish
  // "asset not found" from "asset belongs to different user in same tenant"
  const rows = await db
    .select()
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.id, assetId),
        eq(mediaAssets.userId, userId),
        eq(mediaAssets.tenantId, tenantId),
      ),
    );

  if (rows.length === 0) {
    throw new Error(`Asset ${assetId} not found or access denied`);
  }

  // FK CASCADE in DB handles: media_asset_analysis, multimodal_memory_items,
  // multimodal_memory_vectors, multimodal_memory_links
  await db.delete(mediaAssets).where(eq(mediaAssets.id, assetId));

  return { deleted: true };
}
