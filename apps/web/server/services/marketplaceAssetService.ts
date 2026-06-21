import crypto from "crypto";
import dns from "dns/promises";
import net from "net";
import path from "path";
import { and, eq } from "drizzle-orm";
import { storagePut } from "../storage";
import { getDb } from "../db";
import { marketplaceCaptureAssets, marketplaceCaptureSessions } from "../../drizzle/schema";
import { marketplaceAssetKinds, type MarketplaceAssetKind, type ImageCandidate } from "@shared/marketplaceCapture";
import { getMarketplaceCaptureConfig, marketplaceCaptureError } from "./marketplaceCaptureConfig";
import { indexImageBuffer } from "./vectorize-indexing";

function createMarketplaceAssetId() {
  return `asset_${crypto.randomBytes(16).toString("hex")}`;
}

function sanitizePathSegment(value: string | undefined, fallback: string): string {
  return String(value || fallback)
    .replace(/[^\p{L}\p{N}._-]/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || fallback;
}

function extensionForContentType(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/webp") return "webp";
  if (contentType === "text/html") return "html";
  if (contentType === "application/json") return "json";
  return "txt";
}

function assetKindForImageCandidate(kind: string): MarketplaceAssetKind {
  if (kind === "description") return "description_image";
  if (kind === "review") return "review_image";
  return "main_image";
}

function productImageTypeForCandidate(kind: string): string {
  if (kind === "description") return "description";
  if (kind === "review") return "review";
  if (kind === "related") return "related_excluded";
  return "main";
}

function marketplaceImageCandidateFileBaseName(kind: string, index: number): string {
  const imageType = productImageTypeForCandidate(kind);
  return `product_${imageType}_${String(index + 1).padStart(2, "0")}`;
}

export function marketplaceImageCandidateFileBaseNameForTest(kind: string, index: number): string {
  return marketplaceImageCandidateFileBaseName(kind, index);
}

function validateMagicBytes(buffer: Buffer, contentType: string): boolean {
  if (contentType === "image/png") return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  if (contentType === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8;
  if (contentType === "image/webp") return buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP";
  if (contentType === "application/json") {
    const text = buffer.toString("utf8", 0, Math.min(buffer.length, 100)).trim();
    return text.startsWith("{") || text.startsWith("[");
  }
  return contentType === "text/html" || contentType === "text/plain";
}

function isPrivateHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost");
}

function isPrivateIp(address: string): boolean {
  if (net.isIP(address) === 4) {
    const [a, b] = address.split(".").map((part) => Number(part));
    return a === 10
      || a === 127
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 169 && b === 254)
      || a === 0;
  }
  if (net.isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return normalized === "::1"
      || normalized.startsWith("fc")
      || normalized.startsWith("fd")
      || normalized.startsWith("fe80:")
      || normalized === "::";
  }
  return false;
}

function isAllowedMarketplaceImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  const configured = (process.env.MARKETPLACE_CAPTURE_REMOTE_IMAGE_ALLOWLIST || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (configured.length > 0) {
    return configured.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  }
  return [
    "shopee.co.th",
    "shopee.sg",
    "shopee.com.my",
    "img.susercontent.com",
    "byteimg.com",
    "ibyteimg.com",
    "tiktokcdn.com",
    "tiktokcdn-us.com",
    "tiktokv.com",
    "muscdn.com",
  ].some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

async function assertSafeRemoteImageUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw marketplaceCaptureError("invalid_image_url", "Invalid image URL", 400);
  }
  if (url.protocol !== "https:") {
    throw marketplaceCaptureError("invalid_image_url_protocol", "Marketplace image URL must be HTTPS", 400);
  }
  if (url.username || url.password) {
    throw marketplaceCaptureError("invalid_image_url_userinfo", "Marketplace image URL cannot contain credentials", 400);
  }
  if (isPrivateHostname(url.hostname) || !isAllowedMarketplaceImageHost(url.hostname)) {
    throw marketplaceCaptureError("image_host_not_allowed", "Marketplace image host is not allowed", 400);
  }
  const addresses = await dns.lookup(url.hostname, { all: true }).catch(() => []);
  if (addresses.length === 0 || addresses.some((entry) => isPrivateIp(entry.address))) {
    throw marketplaceCaptureError("unsafe_image_host_resolution", "Marketplace image host resolved to an unsafe address", 400);
  }
  return url;
}

async function fetchRemoteMarketplaceImage(input: { url: string; maxBytes: number; redirects?: number }) {
  const url = await assertSafeRemoteImageUrl(input.url);
  const response = await fetch(url, {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
    headers: {
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
      "User-Agent": "SmartSpecProMarketplaceCapture/1.0",
    },
  });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get("location");
    if (!location || (input.redirects ?? 0) >= 3) {
      throw marketplaceCaptureError("image_redirect_not_allowed", "Marketplace image redirect is not allowed", 400);
    }
    const redirected = new URL(location, url).toString();
    return fetchRemoteMarketplaceImage({ ...input, url: redirected, redirects: (input.redirects ?? 0) + 1 });
  }
  if (!response.ok) {
    throw marketplaceCaptureError("image_fetch_failed", `Marketplace image fetch failed (${response.status})`, 400, true);
  }
  const contentType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!["image/png", "image/jpeg", "image/webp"].includes(contentType)) {
    throw marketplaceCaptureError("image_content_type_not_allowed", "Marketplace image content type is not allowed", 415);
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > input.maxBytes) {
    throw marketplaceCaptureError("image_too_large", "Marketplace image is too large", 413);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > input.maxBytes) {
    throw marketplaceCaptureError("image_too_large", "Marketplace image is too large", 413);
  }
  if (!validateMagicBytes(buffer, contentType)) {
    throw marketplaceCaptureError("image_magic_mismatch", "Marketplace image bytes do not match content type", 415);
  }
  return { buffer, contentType, finalUrl: url.toString(), size: buffer.length };
}

export async function uploadMarketplaceCaptureAsset(input: {
  captureId: string;
  userId: number;
  tenantId?: string;
  file: Express.Multer.File;
  kind: string;
  section?: string;
  metadata?: Record<string, unknown>;
  sourceUrl?: string | null;
  storageFileBaseName?: string;
}) {
  const config = getMarketplaceCaptureConfig();
  const kind = marketplaceAssetKinds.includes(input.kind as MarketplaceAssetKind) ? input.kind as MarketplaceAssetKind : null;
  if (!kind) throw marketplaceCaptureError("invalid_asset_kind", "Invalid asset kind", 400);
  if (!input.file?.buffer?.length) throw marketplaceCaptureError("asset_file_missing", "Asset file missing", 400);
  if (input.file.size > config.maxUploadBytes) throw marketplaceCaptureError("asset_too_large", "Asset file is too large", 413);

  const contentType = String(input.file.mimetype || "application/octet-stream").toLowerCase();
  if (!config.allowedAssetMimeTypes.has(contentType)) {
    throw marketplaceCaptureError("asset_content_type_not_allowed", "Asset content type is not allowed", 415);
  }
  if (!validateMagicBytes(input.file.buffer, contentType)) {
    throw marketplaceCaptureError("asset_magic_mismatch", "Asset content does not match declared type", 415);
  }

  const db = getDb();
  const [capture] = await db.select().from(marketplaceCaptureSessions)
    .where(and(eq(marketplaceCaptureSessions.id, input.captureId), eq(marketplaceCaptureSessions.userId, input.userId)))
    .limit(1);
  if (!capture) throw marketplaceCaptureError("capture_not_found", "Capture not found", 404);

  const assetId = createMarketplaceAssetId();
  const section = sanitizePathSegment(input.section, "general");
  const ext = extensionForContentType(contentType);
  const fileBaseName = sanitizePathSegment(input.storageFileBaseName, section);
  const name = `${fileBaseName}_${assetId}.${ext}`;
  const baseDir = kind === "screenshot" || kind === "category_grid_screenshot" ? "screenshots" : kind.includes("image") ? "images" : "raw";
  const storageKey = path.posix.join("marketplace-captures", input.captureId, baseDir, name);
  const stored = await storagePut(storageKey, input.file.buffer, contentType);

  await db.insert(marketplaceCaptureAssets).values({
    id: assetId,
    captureId: input.captureId,
    userId: input.userId,
    tenantId: input.tenantId ?? capture.tenantId ?? null,
    kind,
    section,
    storageKey: stored.key,
    url: stored.url,
    sourceUrl: input.sourceUrl ?? null,
    contentType,
    byteSize: input.file.size,
    sortOrder: Number(input.metadata?.sortOrder ?? 0) || 0,
    metadataJson: input.metadata ?? {},
  });

  await db.update(marketplaceCaptureSessions)
    .set({ status: "uploading_assets", updatedAt: new Date() })
    .where(eq(marketplaceCaptureSessions.id, input.captureId));

  return {
    assetId,
    kind,
    section,
    storageKey: stored.key,
    url: stored.url,
  };
}

export async function mirrorMarketplaceImageCandidates(input: {
  captureId: string;
  userId: number;
  tenantId?: string;
  candidates: ImageCandidate[];
  productName?: string | null;
  productDescription?: string | null;
  platform: string;
  sourceUrl: string;
  externalShopId?: string | null;
  externalProductId?: string | null;
  shopName?: string | null;
}) {
  const config = getMarketplaceCaptureConfig();
  const mirrored: ImageCandidate[] = [];
  const errors: Array<{ url: string; message: string }> = [];
  const description = String(input.productDescription ?? "").slice(0, 1000);

  for (let index = 0; index < input.candidates.length; index++) {
    const candidate = input.candidates[index];
    if (!candidate?.url) continue;
    try {
      const fetched = await fetchRemoteMarketplaceImage({
        url: candidate.url,
        maxBytes: config.maxUploadBytes,
      });
      const kind = assetKindForImageCandidate(candidate.kind);
      const imageType = productImageTypeForCandidate(candidate.kind);
      const fileBaseName = marketplaceImageCandidateFileBaseName(
        candidate.kind,
        index
      );
      const asset = await uploadMarketplaceCaptureAsset({
        captureId: input.captureId,
        userId: input.userId,
        tenantId: input.tenantId,
        file: {
          fieldname: "file",
          originalname: `${fileBaseName}.${extensionForContentType(fetched.contentType)}`,
          encoding: "7bit",
          mimetype: fetched.contentType,
          size: fetched.size,
          buffer: fetched.buffer,
        } as Express.Multer.File,
        kind,
        section: imageType,
        sourceUrl: candidate.url,
        storageFileBaseName: fileBaseName,
        metadata: {
          ...candidate.metadata,
          marketplaceAsset: true,
          productName: input.productName ?? "",
          productDescription: description,
          platform: input.platform,
          sourceProductUrl: input.sourceUrl,
          originalImageUrl: candidate.url,
          finalImageUrl: fetched.finalUrl,
          imageKind: candidate.kind,
          imageType,
          sortOrder: candidate.position ?? index,
          externalShopId: input.externalShopId ?? undefined,
          externalProductId: input.externalProductId ?? undefined,
          shopName: input.shopName ?? undefined,
        },
      });
      const storedUrl = asset.url.startsWith("http")
        ? asset.url
        : `${(process.env.PUBLIC_URL || process.env.APP_BASE_URL || "").replace(/\/$/, "")}${asset.url}`;
      void indexImageBuffer({
        id: `marketplace-${asset.assetId}`,
        imageBuffer: fetched.buffer,
        imageUrl: storedUrl || asset.url,
        tenantId: input.tenantId ?? `user:${input.userId}`,
        filename: fileBaseName,
        type: "marketplace_image",
        metadata: {
          marketplaceOnly: true,
          source: "marketplace_capture",
          captureId: input.captureId,
          assetId: asset.assetId,
          platform: input.platform,
          productName: input.productName ?? "",
          productDescription: description,
          sourceProductUrl: input.sourceUrl,
          originalSourceUrl: candidate.url,
          imageKind: candidate.kind,
          imageType,
          externalShopId: input.externalShopId ?? undefined,
          externalProductId: input.externalProductId ?? undefined,
          shopName: input.shopName ?? undefined,
        },
      }).catch((error) => {
        console.warn("[marketplace-capture] image vector indexing failed", {
          captureId: input.captureId,
          assetId: asset.assetId,
          message: error?.message ?? String(error),
        });
      });
      mirrored.push({
        ...candidate,
        url: asset.assetId,
        source: "remote",
        metadata: {
          ...candidate.metadata,
          captureAssetId: asset.assetId,
          storageKey: asset.storageKey,
          storedUrl: asset.url,
          originalSourceUrl: candidate.url,
          marketplaceAsset: true,
        },
      });
    } catch (error: any) {
      errors.push({ url: candidate.url, message: String(error?.message ?? error).slice(0, 240) });
    }
  }

  return { imageCandidates: mirrored, errors };
}
