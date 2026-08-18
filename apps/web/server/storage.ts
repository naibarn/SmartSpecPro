// Unified storage layer: resolves active provider from DB (storage_settings)
// Priority: 1) FORGE_API_URL env (legacy) → 2) cache → 3) DB active config (R2/S3/local)
//           → 4) R2 env vars (Cloud Run) → 5) local fallback

import { ENV } from "./_core/env";
import { getCachedAppRuntimeConfig } from "./services/appRuntimeConfig";
import path from "path";
import fs from "fs";
import { pipeline } from "stream/promises";
import { fileURLToPath } from "url";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { eq } from "drizzle-orm";

// Maximum presigned URL expiry: 24 hours (prevents indefinitely-valid URLs)
const MAX_PRESIGN_EXPIRY_S = 86400;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Local uploads directory (relative to server folder)
const UPLOADS_DIR = path.join(__dirname, "..", "uploads");

// ─── Types ───────────────────────────────────────────────────────────────────

type ForgeConfig = { provider: "forge"; baseUrl: string; apiKey: string };
type S3Config = {
  provider: "s3";
  storageKind: "r2" | "s3";
  client: S3Client;
  bucket: string;
  publicUrlPrefix: string | null;
};
type LocalConfig = { provider: "local" };
type ResolvedConfig = ForgeConfig | S3Config | LocalConfig;

interface ConfigCache {
  config: ResolvedConfig;
  fetchedAt: number;
}

// ─── Config resolution with caching ──────────────────────────────────────────

const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes, matches Python
let _configCache: ConfigCache | null = null;

export async function getActiveStorageConfig(): Promise<ResolvedConfig> {
  // Priority 1: Legacy Forge ENV vars (backward compatibility)
  const runtimeConfig = getCachedAppRuntimeConfig();
  const forgeUrl = runtimeConfig.forgeApiUrl || ENV.forgeApiUrl;
  const forgeKey = runtimeConfig.forgeApiKey || ENV.forgeApiKey;
  if (forgeUrl && forgeKey) {
    return { provider: "forge", baseUrl: forgeUrl.replace(/\/+$/, ""), apiKey: forgeKey };
  }

  // Priority 2: Check cache
  if (_configCache && Date.now() - _configCache.fetchedAt < CONFIG_CACHE_TTL_MS) {
    return _configCache.config;
  }

  // Priority 3: Query DB for active storage_settings
  try {
    // Lazy import to avoid circular dependency and allow startup without DB
    const { getDb } = await import("./db");
    const { storageSettings } = await import("../drizzle/schema");
    const { decrypt } = await import("./services/crypto");

    const db = getDb();
    const [setting] = await db
      .select()
      .from(storageSettings)
      .where(eq(storageSettings.isActive, true))
      .limit(1);

    if (setting && setting.providerType === "local") {
      // Explicit local provider in DB — honor it
      const config: LocalConfig = { provider: "local" };
      _configCache = { config, fetchedAt: Date.now() };
      return config;
    }

    if (setting) {
      // R2 or S3 — build S3Client from DB setting
      if (!setting.endpoint || !setting.accessKeyIdEncrypted || !setting.secretAccessKeyEncrypted) {
        console.warn("[Storage] Active config missing endpoint or credentials, falling back");
        // Fall through to env-var fallback
      } else {
        const accessKeyId = decrypt(setting.accessKeyIdEncrypted);
        const secretAccessKey = decrypt(setting.secretAccessKeyEncrypted);

        if (!accessKeyId || !secretAccessKey) {
          console.warn("[Storage] Failed to decrypt credentials, falling back");
        } else {
          const client = new S3Client({
            endpoint: setting.endpoint,
            region: setting.region || "auto",
            credentials: { accessKeyId, secretAccessKey },
            forcePathStyle: (setting.configJson as any)?.forcePathStyle ?? false,
          });

          const config: S3Config = {
            provider: "s3",
            storageKind: setting.providerType === "r2" ? "r2" : "s3",
            client,
            bucket: setting.bucket || "",
            publicUrlPrefix: setting.publicUrlPrefix || null,
          };

          _configCache = { config, fetchedAt: Date.now() };
          return config;
        }
      }
    }
    // No active DB setting — fall through to env-var fallback (Priority 4)
  } catch (error: any) {
    console.warn("[Storage] Failed to load storage settings from DB:", error.message);
    // Use stale cache if available
    if (_configCache) return _configCache.config;
  }

  // Priority 4: Environment variable fallback (for Cloud Run)
  const r2AccessKey = process.env.R2_ACCESS_KEY;
  const r2SecretKey = process.env.R2_SECRET_KEY;
  const r2AccountId = process.env.R2_ACCOUNT_ID;
  const r2Bucket = process.env.R2_BUCKET_NAME;

  if (r2AccessKey && r2SecretKey && r2AccountId && r2Bucket) {
    const client = new S3Client({
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      region: "auto",
      credentials: { accessKeyId: r2AccessKey, secretAccessKey: r2SecretKey },
    });

    const config: S3Config = {
      provider: "s3",
      storageKind: "r2",
      client,
      bucket: r2Bucket,
      publicUrlPrefix: null,
    };

    _configCache = { config, fetchedAt: Date.now() };
    return config;
  }

  // Priority 5: Local fallback (cached to avoid repeated DB queries)
  const localConfig: LocalConfig = { provider: "local" };
  _configCache = { config: localConfig, fetchedAt: Date.now() };
  return localConfig;
}

/**
 * Clear the cached storage config. Call after admin mutations on storage_settings.
 */
export function invalidateStorageCache(): void {
  _configCache = null;
}

/**
 * Vertical Drama generated media must be copied to R2 before it is exposed as
 * a durable result. Keep this assertion here so the feature cannot silently
 * fall back to local disk or a non-R2 S3 bucket when a deployment is
 * misconfigured.
 */
export async function assertR2StorageActive(): Promise<void> {
  const config = await getActiveStorageConfig();
  if (config.provider !== "s3" || config.storageKind !== "r2") {
    throw new Error("Generated media requires an active Cloudflare R2 storage configuration");
  }
}

// ─── Key normalization (security) ────────────────────────────────────────────

function normalizeKey(relKey: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(relKey);
  } catch {
    throw new Error("Invalid storage key: malformed encoding");
  }
  if (decoded.includes("\0")) {
    throw new Error("Invalid storage key: null byte detected");
  }
  const cleaned = decoded.replace(/^\/+/, "");
  if (cleaned.includes("..") || path.isAbsolute(cleaned)) {
    throw new Error("Invalid storage key: path traversal detected");
  }
  const resolved = path.resolve(UPLOADS_DIR, cleaned);
  if (!resolved.startsWith(UPLOADS_DIR + path.sep) && resolved !== UPLOADS_DIR) {
    throw new Error("Invalid storage key: escapes uploads directory");
  }
  return cleaned;
}

// ─── Local storage operations ────────────────────────────────────────────────

function ensureUploadsDir(subPath?: string): string {
  const dir = subPath ? path.join(UPLOADS_DIR, subPath) : UPLOADS_DIR;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

async function localStoragePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string,
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  ensureUploadsDir(path.dirname(key));
  const buffer = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  fs.writeFileSync(path.join(UPLOADS_DIR, key), buffer);
  return { key, url: `/uploads/${key}` };
}

async function localStorageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/uploads/${key}` };
}

async function localStorageDelete(relKey: string): Promise<boolean> {
  const key = normalizeKey(relKey);
  try {
    fs.unlinkSync(path.join(UPLOADS_DIR, key));
    return true;
  } catch (err: any) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
}

async function localStorageExists(relKey: string): Promise<boolean> {
  const key = normalizeKey(relKey);
  return fs.existsSync(path.join(UPLOADS_DIR, key));
}

// ─── S3/R2 storage operations ────────────────────────────────────────────────

async function s3StoragePut(
  config: S3Config,
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string,
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);

  await config.client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  // Always use proxy URL to avoid R2 public URL SSL issues and presigned URL expiration
  const url = `/api/storage/files/${encodeURI(key)}`;
  return { key, url };
}

async function s3StorageGet(
  config: S3Config,
  relKey: string,
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const url = `/api/storage/files/${encodeURI(key)}`;
  return { key, url };
}

async function s3StorageDelete(
  config: S3Config,
  relKey: string,
): Promise<boolean> {
  const key = normalizeKey(relKey);
  try {
    await config.client.send(
      new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    return true;
  } catch (error: any) {
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

async function s3StorageExists(
  config: S3Config,
  relKey: string,
): Promise<boolean> {
  const key = normalizeKey(relKey);
  try {
    await config.client.send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    return true;
  } catch (error: any) {
    if (error.name === "NotFound" || error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

function getLocalStorageContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".jpg" || ext === ".jpeg"
    ? "image/jpeg"
    : ext === ".webp"
      ? "image/webp"
      : ext === ".png"
        ? "image/png"
        : ext === ".mp4"
          ? "video/mp4"
          : "application/octet-stream";
}

// ─── Forge storage operations (legacy) ───────────────────────────────────────

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function buildAuthHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

function toFormData(
  data: Buffer | Uint8Array | string,
  contentType: string,
  fileName: string,
): FormData {
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}

async function forgeStoragePut(
  config: ForgeConfig,
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string,
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const uploadUrl = new URL("v1/storage/upload", ensureTrailingSlash(config.baseUrl));
  uploadUrl.searchParams.set("path", key);

  const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: buildAuthHeaders(config.apiKey),
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Storage upload failed (${response.status} ${response.statusText}): ${message}`);
  }
  const url = (await response.json()).url;
  return { key, url };
}

async function forgeStorageGet(
  config: ForgeConfig,
  relKey: string,
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const downloadApiUrl = new URL("v1/storage/downloadUrl", ensureTrailingSlash(config.baseUrl));
  downloadApiUrl.searchParams.set("path", key);
  const response = await fetch(downloadApiUrl, {
    method: "GET",
    headers: buildAuthHeaders(config.apiKey),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Storage download URL failed (${response.status} ${response.statusText}): ${message}`);
  }
  return { key, url: (await response.json()).url };
}

async function forgeStorageDelete(
  config: ForgeConfig,
  relKey: string,
): Promise<boolean> {
  const key = normalizeKey(relKey);
  const deleteUrl = new URL("v1/storage/delete", ensureTrailingSlash(config.baseUrl));
  deleteUrl.searchParams.set("path", key);
  const response = await fetch(deleteUrl, {
    method: "DELETE",
    headers: buildAuthHeaders(config.apiKey),
  });
  if (response.status === 404) return false;
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Storage delete failed (${response.status} ${response.statusText}): ${message}`);
  }
  return true;
}

async function forgeStorageExists(
  config: ForgeConfig,
  relKey: string,
): Promise<boolean> {
  try {
    await forgeStorageGet(config, relKey);
    return true;
  } catch (error: any) {
    if (error?.message && String(error.message).includes("404")) return false;
    throw error;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const config = await getActiveStorageConfig();
  switch (config.provider) {
    case "local":
      return localStoragePut(relKey, data, contentType);
    case "s3":
      return s3StoragePut(config, relKey, data, contentType);
    case "forge":
      return forgeStoragePut(config, relKey, data, contentType);
  }
}

/**
 * Store a file from a filesystem path while avoiding unnecessary memory copies.
 * This is used for large installer uploads.
 */
export async function storagePutFromPath(
  relKey: string,
  sourcePath: string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const config = await getActiveStorageConfig();

  switch (config.provider) {
    case "local": {
      const key = normalizeKey(relKey);
      ensureUploadsDir(path.dirname(key));
      fs.copyFileSync(sourcePath, path.join(UPLOADS_DIR, key));
      return { key, url: `/uploads/${key}` };
    }
    case "s3": {
      const key = normalizeKey(relKey);
      await config.client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: fs.createReadStream(sourcePath),
          ContentType: contentType,
        }),
      );
      return { key, url: `/api/storage/files/${encodeURI(key)}` };
    }
    case "forge": {
      const buffer = fs.readFileSync(sourcePath);
      return storagePut(relKey, buffer, contentType);
    }
  }
}

export async function storageCopyToPath(
  relKey: string,
  targetPath: string,
): Promise<{ key: string }> {
  const config = await getActiveStorageConfig();

  switch (config.provider) {
    case "local": {
      const key = normalizeKey(relKey);
      fs.copyFileSync(path.join(UPLOADS_DIR, key), targetPath);
      return { key };
    }
    case "s3": {
      const key = normalizeKey(relKey);
      const result = await config.client.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: key,
        }),
      );
      const body = result.Body as
        | NodeJS.ReadableStream
        | { transformToByteArray?: () => Promise<Uint8Array> }
        | undefined;
      if (!body) throw new Error(`Storage object body missing for ${key}`);
      if (typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === "function") {
        const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
        fs.writeFileSync(targetPath, Buffer.from(bytes));
      } else {
        await pipeline(body as NodeJS.ReadableStream, fs.createWriteStream(targetPath));
      }
      return { key };
    }
    case "forge": {
      throw new Error("Forge storage copy-to-path is not supported for HyperFrames render staging.");
    }
  }
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const config = await getActiveStorageConfig();
  switch (config.provider) {
    case "local":
      return localStorageGet(relKey);
    case "s3":
      return s3StorageGet(config, relKey);
    case "forge":
      return forgeStorageGet(config, relKey);
  }
}

export async function storageDelete(relKey: string): Promise<boolean> {
  const config = await getActiveStorageConfig();
  switch (config.provider) {
    case "local":
      return localStorageDelete(relKey);
    case "s3":
      return s3StorageDelete(config, relKey);
    case "forge":
      return forgeStorageDelete(config, relKey);
  }
}

export async function storageExists(relKey: string): Promise<boolean> {
  const config = await getActiveStorageConfig();
  switch (config.provider) {
    case "local":
      return localStorageExists(relKey);
    case "s3":
      return s3StorageExists(config, relKey);
    case "forge":
      return forgeStorageExists(config, relKey);
  }
}

/**
 * Check if local storage is the active provider.
 */
export async function useLocalStorage(): Promise<boolean> {
  const config = await getActiveStorageConfig();
  return config.provider === "local";
}

/**
 * Get the local uploads directory path (for static serving).
 */
export function getUploadsDir(): string {
  ensureUploadsDir();
  return UPLOADS_DIR;
}

/**
 * Generate a presigned PUT URL for direct client upload to S3/R2.
 * Returns null if storage is local/forge (not S3-compatible).
 */
export async function storagePresignPut(
  relKey: string,
  contentType: string,
  contentLength: number,
  expiresIn = 3600,
): Promise<{ url: string; key: string } | null> {
  const config = await getActiveStorageConfig();
  if (config.provider !== "s3") return null;

  const key = normalizeKey(relKey);
  const cmd = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  });
  const clampedExpiry = Math.min(Math.max(expiresIn, 60), MAX_PRESIGN_EXPIRY_S);
  const url = await getSignedUrl(config.client, cmd, { expiresIn: clampedExpiry });
  return { url, key };
}

/**
 * Generate a presigned GET URL for direct download from S3/R2.
 * Returns null if storage is local/forge (not S3-compatible).
 *
 * @param relKey - The object key relative to bucket root
 * @param expiresIn - URL validity in seconds (default 3600 = 1 hour; use 86400 for admin)
 * @returns Presigned GET URL and key, or null if not S3
 */
export async function storagePresignGet(
  relKey: string,
  expiresIn = 3600,
): Promise<{ url: string; key: string } | null> {
  const config = await getActiveStorageConfig();
  if (config.provider !== "s3") return null;

  const key = normalizeKey(relKey);
  const cmd = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
  });
  const clampedExpiry = Math.min(Math.max(expiresIn, 60), MAX_PRESIGN_EXPIRY_S);
  const url = await getSignedUrl(config.client, cmd, { expiresIn: clampedExpiry });
  return { url, key };
}

/**
 * Resolve a storage key to its public/accessible URL.
 * For S3/R2: returns a proxy URL through the Node.js server (/api/storage/files/...).
 * For local: returns /uploads/... path.
 */
export async function storageResolveUrl(relKey: string): Promise<string | null> {
  const config = await getActiveStorageConfig();
  const key = normalizeKey(relKey);

  switch (config.provider) {
    case "s3":
      // Use server-side proxy to avoid public URL SSL issues and presigned URL expiration
      return `/api/storage/files/${encodeURI(key)}`;
    case "local":
      return `/uploads/${key}`;
    default:
      return null;
  }
}

export async function storageReadText(relKey: string): Promise<string | null> {
  const config = await getActiveStorageConfig();
  const key = normalizeKey(relKey);

  switch (config.provider) {
    case "local": {
      try {
        return fs.readFileSync(path.join(UPLOADS_DIR, key), "utf8");
      } catch {
        return null;
      }
    }
    case "s3": {
      try {
        const response = await config.client.send(new GetObjectCommand({
          Bucket: config.bucket,
          Key: key,
        }));
        if (!response.Body || typeof (response.Body as any).transformToString !== "function") {
          return null;
        }
        return await (response.Body as any).transformToString("utf8");
      } catch {
        return null;
      }
    }
    case "forge": {
      try {
        const resolved = await forgeStorageGet(config, key);
        const response = await fetch(resolved.url);
        if (!response.ok) {
          return null;
        }
        return await response.text();
      } catch {
        return null;
      }
    }
  }
}

/**
 * Read a managed storage object inside the trusted server boundary.
 *
 * Callers that need file bytes must not fetch `storageGet(...).url` when the
 * active provider is R2/S3: that URL is intentionally the tenant-protected
 * `/api/storage/files/*` proxy. This helper reads through the storage adapter
 * directly and therefore works for local, R2/S3, and Forge storage.
 */
export async function storageReadBuffer(relKey: string): Promise<Buffer | null> {
  const config = await getActiveStorageConfig();
  if (config.provider === "forge") {
    const resolved = await forgeStorageGet(config, relKey);
    const response = await fetch(resolved.url);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  }

  const result = await storageStreamFile(relKey);
  if (!result) return null;

  const stream = result.stream as any;
  if (typeof stream.transformToByteArray === "function") {
    return Buffer.from(await stream.transformToByteArray());
  }
  if (typeof stream.getReader === "function") {
    const reader = stream.getReader();
    const chunks: Buffer[] = [];
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        chunks.push(Buffer.from(next.value));
      }
    } finally {
      reader.releaseLock?.();
    }
    return Buffer.concat(chunks);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Read object metadata without opening a body stream for conditional requests. */
export async function storageHeadFile(
  relKey: string,
): Promise<{
  contentType?: string;
  contentLength?: number;
  etag?: string;
  lastModified?: Date;
} | null> {
  const config = await getActiveStorageConfig();
  const key = normalizeKey(relKey);

  if (config.provider === "local") {
    const filePath = path.join(getUploadsDir(), key);
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    return {
      contentType: getLocalStorageContentType(filePath),
      contentLength: stat.size,
      etag: `W/"${stat.size}-${Math.trunc(stat.mtimeMs)}"`,
      lastModified: stat.mtime,
    };
  }

  if (config.provider !== "s3") return null;

  try {
    const response = await config.client.send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    return {
      contentType: response.ContentType,
      contentLength: response.ContentLength,
      etag: response.ETag,
      lastModified: response.LastModified,
    };
  } catch (error: any) {
    if (error?.name === "NotFound" || error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Stream a file from S3/R2 storage. Returns null if not using S3 provider.
 * Used by the storage proxy endpoint. Supports range requests for video seeking.
 */
export async function storageStreamFile(
  relKey: string,
  range?: string,
): Promise<{
  stream: ReadableStream | NodeJS.ReadableStream;
  contentType: string;
  contentLength?: number;
  totalLength?: number;
  etag?: string;
  lastModified?: Date;
  rangeStart?: number;
  rangeEnd?: number;
  isPartial: boolean;
} | null> {
  const config = await getActiveStorageConfig();
  const key = normalizeKey(relKey);

  if (config.provider === "local") {
    const filePath = path.join(getUploadsDir(), key);
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    const contentType = getLocalStorageContentType(filePath);
    return {
      stream: fs.createReadStream(filePath),
      contentType,
      contentLength: stat.size,
      totalLength: stat.size,
      etag: `W/"${stat.size}-${Math.trunc(stat.mtimeMs)}"`,
      lastModified: stat.mtime,
      isPartial: false,
    };
  }

  if (config.provider !== "s3") return null;

  const cmd: any = { Bucket: config.bucket, Key: key };
  if (range) {
    cmd.Range = range;
  }

  let response;
  try {
    response = await config.client.send(new GetObjectCommand(cmd));
  } catch (error: any) {
    // Missing key must return null (matching the "local" provider branch
    // above) so callers can fall back — e.g. the /api/storage/files/* route
    // retrying a .jpg miss as .webp. Left uncaught, this NoSuchKey exception
    // instead skipped that fallback and surfaced as a bare 404 even when the
    // .webp original was present the whole time.
    if (error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
  if (!response.Body) return null;

  const isPartial = response.$metadata.httpStatusCode === 206;
  let rangeStart: number | undefined;
  let rangeEnd: number | undefined;
  let totalLength: number | undefined;

  if (isPartial && response.ContentRange) {
    // Parse "bytes 0-999/5000"
    const match = response.ContentRange.match(/bytes (\d+)-(\d+)\/(\d+|\*)/);
    if (match) {
      rangeStart = parseInt(match[1], 10);
      rangeEnd = parseInt(match[2], 10);
      totalLength = match[3] !== "*" ? parseInt(match[3], 10) : undefined;
    }
  }

  return {
    stream: response.Body as NodeJS.ReadableStream,
    contentType: response.ContentType || "application/octet-stream",
    contentLength: response.ContentLength,
    etag: response.ETag,
    lastModified: response.LastModified,
    totalLength,
    rangeStart,
    rangeEnd,
    isPartial,
  };
}
