export const EXTENSION_UPDATE_CACHE_KEY = "smartaihubExtensionUpdateCache";
export const EXTENSION_UPDATE_DISMISSED_VERSION_KEY = "smartaihubExtensionUpdateDismissedVersion";
export const EXTENSION_NATIVE_UPDATE_KEY = "smartaihubNativeUpdateAvailable";
export const EXTENSION_UPDATE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const EXTENSION_UPDATE_LATEST_PATH = "/api/desktop-releases/companion-extension/latest";
export const EXTENSION_UPDATE_DOWNLOAD_PATH = "/api/desktop-releases/companion-extension/download";

export interface LatestExtensionRelease {
  version: string;
  downloadUrl: string;
  fileName?: string;
  fileSizeBytes?: number;
  updatedAt?: string;
}

export interface ExtensionUpdateCache {
  checkedAt: number;
  serverOrigin: string;
  release: LatestExtensionRelease | null;
}

export interface NativeExtensionUpdateAvailability {
  version: string;
  detectedAt: number;
}

export interface ExtensionUpdateStorageWriter {
  set(items: Record<string, unknown>): void | Promise<void>;
}

export type ExtensionUpdateNotice =
  | { kind: "dashboard"; currentVersion: string; latestVersion: string; downloadUrl: string }
  | { kind: "native"; currentVersion: string; latestVersion: string }
  | null;

function parseHttpsServerBaseUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

function resolveSameOriginDownloadUrl(value: unknown, serverBaseUrl: string): string | null {
  const base = parseHttpsServerBaseUrl(serverBaseUrl);
  if (!base) return null;
  const fallback = new URL(EXTENSION_UPDATE_DOWNLOAD_PATH, base).toString();
  if (typeof value !== "string" || !value.trim()) return fallback;

  try {
    const resolved = new URL(value.trim(), base);
    if (resolved.protocol !== "https:" || resolved.origin !== base.origin || resolved.username || resolved.password) {
      return fallback;
    }
    return resolved.toString();
  } catch {
    return fallback;
  }
}

export function parseChromeExtensionVersion(value: unknown): number[] | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  const segments = normalized.split(".");
  if (segments.length < 1 || segments.length > 4) return null;

  const parsed: number[] = [];
  for (const segment of segments) {
    if (!/^(?:0|[1-9]\d*)$/.test(segment)) return null;
    const number = Number(segment);
    if (!Number.isSafeInteger(number) || number < 0 || number > 65_535) return null;
    parsed.push(number);
  }
  return parsed;
}

export function compareChromeExtensionVersions(left: unknown, right: unknown): -1 | 0 | 1 | null {
  const leftSegments = parseChromeExtensionVersion(left);
  const rightSegments = parseChromeExtensionVersion(right);
  if (!leftSegments || !rightSegments) return null;

  for (let index = 0; index < Math.max(leftSegments.length, rightSegments.length); index += 1) {
    const leftSegment = leftSegments[index] ?? 0;
    const rightSegment = rightSegments[index] ?? 0;
    if (leftSegment < rightSegment) return -1;
    if (leftSegment > rightSegment) return 1;
  }
  return 0;
}

export function parseLatestExtensionReleaseResponse(payload: unknown, serverBaseUrl: string): { release: LatestExtensionRelease | null } | null {
  if (!parseHttpsServerBaseUrl(serverBaseUrl) || !payload || typeof payload !== "object") return null;
  const release = (payload as { release?: unknown }).release;
  if (release === null) return { release: null };
  if (!release || typeof release !== "object") return null;

  const candidate = release as Record<string, unknown>;
  if (!parseChromeExtensionVersion(candidate.version)) return null;
  const downloadUrl = resolveSameOriginDownloadUrl(candidate.downloadUrl, serverBaseUrl);
  if (!downloadUrl) return null;

  const parsed: LatestExtensionRelease = {
    version: String(candidate.version).trim(),
    downloadUrl,
  };
  if (typeof candidate.fileName === "string" && candidate.fileName.trim()) parsed.fileName = candidate.fileName.trim();
  if (typeof candidate.fileSizeBytes === "number" && Number.isSafeInteger(candidate.fileSizeBytes) && candidate.fileSizeBytes >= 0) {
    parsed.fileSizeBytes = candidate.fileSizeBytes;
  }
  if (typeof candidate.updatedAt === "string" && candidate.updatedAt.trim()) parsed.updatedAt = candidate.updatedAt.trim();
  return { release: parsed };
}

export function parseExtensionUpdateCache(value: unknown, serverBaseUrl: string): ExtensionUpdateCache | null {
  const base = parseHttpsServerBaseUrl(serverBaseUrl);
  if (!base || !value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.checkedAt !== "number" || !Number.isFinite(candidate.checkedAt) || candidate.checkedAt < 0) return null;
  if (candidate.serverOrigin !== base.origin) return null;
  const response = parseLatestExtensionReleaseResponse({ release: candidate.release }, serverBaseUrl);
  if (!response) return null;
  return {
    checkedAt: candidate.checkedAt,
    serverOrigin: base.origin,
    release: response.release,
  };
}

export function isFreshExtensionUpdateCache(
  cache: ExtensionUpdateCache | null,
  serverBaseUrl: string,
  now = Date.now(),
  ttlMs = EXTENSION_UPDATE_CACHE_TTL_MS,
): boolean {
  const base = parseHttpsServerBaseUrl(serverBaseUrl);
  if (!cache || !base || cache.serverOrigin !== base.origin) return false;
  if (!Number.isFinite(now) || !Number.isFinite(ttlMs) || ttlMs < 0) return false;
  return cache.checkedAt <= now && now - cache.checkedAt <= ttlMs;
}

export function createNativeExtensionUpdateAvailability(version: unknown, detectedAt = Date.now()): NativeExtensionUpdateAvailability | null {
  if (!parseChromeExtensionVersion(version) || !Number.isFinite(detectedAt) || detectedAt < 0) return null;
  return { version: String(version).trim(), detectedAt };
}

export function parseNativeExtensionUpdateAvailability(value: unknown): NativeExtensionUpdateAvailability | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  return createNativeExtensionUpdateAvailability(candidate.version, candidate.detectedAt as number);
}

export async function persistNativeExtensionUpdateAvailability(
  storage: ExtensionUpdateStorageWriter,
  version: unknown,
  detectedAt = Date.now(),
): Promise<boolean> {
  const availability = createNativeExtensionUpdateAvailability(version, detectedAt);
  if (!availability) return false;
  await storage.set({ [EXTENSION_NATIVE_UPDATE_KEY]: availability });
  return true;
}

export function resolveExtensionUpdateNotice(input: {
  currentVersion: string;
  release: LatestExtensionRelease | null;
  dismissedVersion?: unknown;
  nativeUpdate?: NativeExtensionUpdateAvailability | null;
}): ExtensionUpdateNotice {
  if (!parseChromeExtensionVersion(input.currentVersion)) return null;

  if (input.nativeUpdate) {
    const comparison = compareChromeExtensionVersions(input.nativeUpdate.version, input.currentVersion);
    if (comparison === 1) {
      if (input.dismissedVersion === input.nativeUpdate.version) return null;
      return {
        kind: "native",
        currentVersion: input.currentVersion,
        latestVersion: input.nativeUpdate.version,
      };
    }
  }

  if (!input.release) return null;
  const comparison = compareChromeExtensionVersions(input.release.version, input.currentVersion);
  if (comparison !== 1 || input.dismissedVersion === input.release.version) return null;
  return {
    kind: "dashboard",
    currentVersion: input.currentVersion,
    latestVersion: input.release.version,
    downloadUrl: input.release.downloadUrl,
  };
}
