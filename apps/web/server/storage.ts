// Unified storage layer: resolves active provider from DB (storage_settings)
// Priority: 1) FORGE_API_URL env (legacy) → 2) DB active config (R2/S3/local) → 3) local fallback

import { ENV } from "./_core/env";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { eq } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Local uploads directory (relative to server folder)
const UPLOADS_DIR = path.join(__dirname, "..", "uploads");

// ─── Types ───────────────────────────────────────────────────────────────────

type ForgeConfig = { provider: "forge"; baseUrl: string; apiKey: string };
type S3Config = {
  provider: "s3";
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

async function getActiveStorageConfig(): Promise<ResolvedConfig> {
  // Priority 1: Legacy Forge ENV vars (backward compatibility)
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;
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
    const { db } = await import("./db");
    const { storageSettings } = await import("../drizzle/schema");
    const { decrypt } = await import("./services/crypto");

    const [setting] = await db
      .select()
      .from(storageSettings)
      .where(eq(storageSettings.isActive, true))
      .limit(1);

    if (!setting || setting.providerType === "local") {
      const config: LocalConfig = { provider: "local" };
      _configCache = { config, fetchedAt: Date.now() };
      return config;
    }

    // R2 or S3 — build S3Client
    if (!setting.endpoint || !setting.accessKeyIdEncrypted || !setting.secretAccessKeyEncrypted) {
      console.warn("[Storage] Active config missing endpoint or credentials, falling back to local");
      const config: LocalConfig = { provider: "local" };
      _configCache = { config, fetchedAt: Date.now() };
      return config;
    }

    const accessKeyId = decrypt(setting.accessKeyIdEncrypted);
    const secretAccessKey = decrypt(setting.secretAccessKeyEncrypted);

    if (!accessKeyId || !secretAccessKey) {
      console.warn("[Storage] Failed to decrypt credentials, falling back to local");
      const config: LocalConfig = { provider: "local" };
      _configCache = { config, fetchedAt: Date.now() };
      return config;
    }

    const client = new S3Client({
      endpoint: setting.endpoint,
      region: setting.region || "auto",
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: (setting.configJson as any)?.forcePathStyle ?? false,
    });

    const config: S3Config = {
      provider: "s3",
      client,
      bucket: setting.bucket || "",
      publicUrlPrefix: setting.publicUrlPrefix || null,
    };

    _configCache = { config, fetchedAt: Date.now() };
    return config;
  } catch (error: any) {
    console.warn("[Storage] Failed to load storage settings from DB:", error.message);
    // Use stale cache if available
    if (_configCache) return _configCache.config;
    return { provider: "local" };
  }
}

/**
 * Clear the cached storage config. Call after admin mutations on storage_settings.
 */
export function invalidateStorageCache(): void {
  _configCache = null;
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

  const url = config.publicUrlPrefix
    ? `${config.publicUrlPrefix.replace(/\/$/, "")}/${key}`
    : await getSignedUrl(
        config.client,
        new GetObjectCommand({ Bucket: config.bucket, Key: key }),
        { expiresIn: 3600 },
      );

  return { key, url };
}

async function s3StorageGet(
  config: S3Config,
  relKey: string,
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);

  const url = config.publicUrlPrefix
    ? `${config.publicUrlPrefix.replace(/\/$/, "")}/${key}`
    : await getSignedUrl(
        config.client,
        new GetObjectCommand({ Bucket: config.bucket, Key: key }),
        { expiresIn: 3600 },
      );

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
