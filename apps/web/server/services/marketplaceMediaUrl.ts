import { normalizeManagedMediaKey } from "./managedMediaAccessService";

/**
 * Marketplace media is persisted with both a storage key and a historical URL.
 * The key is authoritative: storage URLs can be stale, provider-specific, or
 * point at an R2 endpoint that is not intended for browser playback.
 */
export function marketplaceMediaUrl(
  storageKey: unknown,
  fallbackUrl: unknown,
): string {
  const key = typeof storageKey === "string"
    ? normalizeManagedMediaKey(storageKey)
    : null;
  if (key) return `/api/storage/files/${encodeURI(key)}`;

  const fallback = typeof fallbackUrl === "string" ? fallbackUrl.trim() : "";
  return fallback;
}

export function marketplaceAssetMediaUrl(asset: {
  storageKey?: unknown;
  url?: unknown;
} | null | undefined): string {
  return marketplaceMediaUrl(asset?.storageKey, asset?.url);
}
