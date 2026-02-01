// Storage helpers with local fallback
// Uses Forge storage when configured, otherwise falls back to local file storage

import { ENV } from './_core/env';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Local uploads directory (relative to server folder)
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

type StorageConfig = { baseUrl: string; apiKey: string } | null;

function getStorageConfig(): StorageConfig {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;

  if (!baseUrl || !apiKey) {
    // Return null to indicate local storage should be used
    return null;
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

/**
 * Check if local storage should be used
 */
export function useLocalStorage(): boolean {
  return getStorageConfig() === null;
}

/**
 * Ensure uploads directory exists
 */
function ensureUploadsDir(subPath?: string): string {
  const dir = subPath ? path.join(UPLOADS_DIR, subPath) : UPLOADS_DIR;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Save file locally and return URL
 */
async function localStoragePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const filePath = path.join(UPLOADS_DIR, key);
  const dir = path.dirname(filePath);

  // Ensure directory exists
  ensureUploadsDir(path.dirname(key));

  // Write file
  const buffer = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
  fs.writeFileSync(filePath, buffer);

  // Return URL that will be served by Express static middleware
  const url = `/uploads/${key}`;

  return { key, url };
}

/**
 * Get file URL from local storage
 */
async function localStorageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return {
    key,
    url: `/uploads/${key}`,
  };
}

function buildUploadUrl(baseUrl: string, relKey: string): URL {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}

async function buildDownloadUrl(
  baseUrl: string,
  relKey: string,
  apiKey: string
): Promise<string> {
  const downloadApiUrl = new URL(
    "v1/storage/downloadUrl",
    ensureTrailingSlash(baseUrl)
  );
  downloadApiUrl.searchParams.set("path", normalizeKey(relKey));
  const response = await fetch(downloadApiUrl, {
    method: "GET",
    headers: buildAuthHeaders(apiKey),
  });
  return (await response.json()).url;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeKey(relKey: string): string {
  // Decode URL encoding to catch encoded traversal attempts
  let decoded: string;
  try {
    decoded = decodeURIComponent(relKey);
  } catch {
    throw new Error("Invalid storage key: malformed encoding");
  }
  // Block null bytes
  if (decoded.includes('\0')) {
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

function toFormData(
  data: Buffer | Uint8Array | string,
  contentType: string,
  fileName: string
): FormData {
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}

function buildAuthHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const config = getStorageConfig();

  // Use local storage if Forge is not configured
  if (!config) {
    return localStoragePut(relKey, data, contentType);
  }

  const { baseUrl, apiKey } = config;
  const key = normalizeKey(relKey);
  const uploadUrl = buildUploadUrl(baseUrl, key);
  const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: buildAuthHeaders(apiKey),
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Storage upload failed (${response.status} ${response.statusText}): ${message}`
    );
  }
  const url = (await response.json()).url;
  return { key, url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string; }> {
  const config = getStorageConfig();

  // Use local storage if Forge is not configured
  if (!config) {
    return localStorageGet(relKey);
  }

  const { baseUrl, apiKey } = config;
  const key = normalizeKey(relKey);
  return {
    key,
    url: await buildDownloadUrl(baseUrl, key, apiKey),
  };
}

/**
 * Get the uploads directory path (for static serving)
 */
export function getUploadsDir(): string {
  ensureUploadsDir();
  return UPLOADS_DIR;
}
