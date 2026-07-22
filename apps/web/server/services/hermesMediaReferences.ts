/**
 * Feature 135 — Hermes Grok media worker: reference-set + task-envelope
 * helpers shared by every VD/media.ts Hermes arm (section 09).
 *
 * `buildHermesMediaReferences` converts an ordered, asset-id-backed
 * reference list into the frozen `HermesMediaJobContract["references"]`
 * shape (assetId + 1-based continuous index + role + label + sha256) —
 * NEVER emits a URL field (the contract schema is `.strict()`; section 01's
 * claim-time-minting rule forbids storing a pre-resolved URL at rest).
 *
 * `resolveHermesReferenceAssetIdFromUrl` is the companion best-effort
 * lookup for surfaces that only hold a resolved reference URL today (e.g.
 * VD's character-portrait/location-plate identity-lock references) — it
 * maps our own storage-proxy URL shapes (`/api/storage/files/<key>`,
 * `/uploads/<key>`) back to the owning `media_assets` row. A URL this
 * cannot resolve (foreign host, no owning row) yields `null`, and callers
 * treat that as "drop this optional reference" rather than a hard failure
 * — Hermes references are best-effort identity/environment locks, never a
 * hard precondition for image/location/character surfaces (video's
 * `generateVideoClip` start frame is the one MANDATORY reference and that
 * surface resolves its assetId directly, without going through a URL).
 *
 * `buildHermesMediaTaskEnvelope` wraps a freshly queued job's `taskId` into
 * the same `MediaTask` shape `mediaGenerationService.generateImageAsync`/
 * `generateVideoAsync` already return, so every existing caller (`task.id`,
 * `media.getTask` polling) keeps working unchanged — the fully-populated
 * projection for every SUBSEQUENT poll is `hermesMediaAdapter.ts`'s
 * `getHermesMediaTask` (section 06); this helper only shapes the FIRST,
 * synchronous return value from the submit call.
 *
 * Namespace rule (hard): `hermesMedia*` / `hermes*` only — see
 * `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`.
 */
import { createHash } from "node:crypto";
import { eq, and, inArray, or } from "drizzle-orm";
import { getDb } from "../db";
import { mediaAssets } from "../../drizzle/schema";
import { storageResolveUrl } from "../storage";
import { getCachedInternalNodeUrl } from "./appRuntimeConfig";
import { debugLog } from "../_core/logger";
import type { HermesMediaJobContract } from "../../shared/hermesMedia";
import type { MediaTask } from "./mediaGenerationService";

export type HermesMediaReferenceList = HermesMediaJobContract["references"];

export interface HermesMediaReferenceOrderedRef {
  assetId: string;
  role: string;
  label: string;
}

export interface HermesMediaReferenceAssetRow {
  id: string;
  storageKey: string;
  checksumSha256: string | null;
}

export interface HermesMediaReferenceRepo {
  findAssetById(params: {
    tenantId: string;
    userId: number;
    assetId: string;
  }): Promise<HermesMediaReferenceAssetRow | null>;
  persistChecksum(params: { assetId: string; checksumSha256: string }): Promise<void>;
}

export const defaultHermesMediaReferenceRepo: HermesMediaReferenceRepo = {
  async findAssetById({ tenantId, userId, assetId }) {
    const numericId = Number(assetId);
    if (!Number.isFinite(numericId)) return null;
    const db = getDb();
    const [row] = await db
      .select({
        id: mediaAssets.id,
        storageKey: mediaAssets.storageKey,
        checksumSha256: mediaAssets.checksumSha256,
      })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.id, numericId),
          eq(mediaAssets.tenantId, tenantId),
          eq(mediaAssets.userId, userId),
        ),
      )
      .limit(1);
    return row
      ? { id: String(row.id), storageKey: row.storageKey, checksumSha256: row.checksumSha256 ?? null }
      : null;
  },
  async persistChecksum({ assetId, checksumSha256 }) {
    const numericId = Number(assetId);
    if (!Number.isFinite(numericId)) return;
    const db = getDb();
    await db.update(mediaAssets).set({ checksumSha256 }).where(eq(mediaAssets.id, numericId));
  },
};

function toAbsoluteStorageUrl(relativePath: string): string {
  if (/^https?:\/\//i.test(relativePath)) return relativePath;
  return `${getCachedInternalNodeUrl()}${relativePath}`;
}

/**
 * Legacy media rows can store a managed URL instead of the underlying object
 * key. Keep hashing and claim-time URL minting on the same canonical key so
 * both operations address the exact bytes the Worker later downloads.
 */
export function normalizeHermesReferenceStorageObjectKey(storageKey: string): string {
  let value = storageKey.trim();
  if (/^https?:\/\//i.test(value)) {
    try {
      value = new URL(value).pathname;
    } catch {
      return storageKey;
    }
  }
  for (const prefix of ["/api/storage/files/", "/uploads/", "storage://"]) {
    if (value.startsWith(prefix)) {
      return value.slice(prefix.length).replace(/^\/+/, "");
    }
  }
  return value;
}

/**
 * Streams the stored object and hashes its current bytes. The cached
 * `media_assets.checksumSha256` is not authoritative because legacy producer
 * paths could persist a hash for bytes that differ from the final stored
 * object. A fetch failure must fail submit rather than queue a contract the
 * Worker will deterministically reject.
 */
export async function defaultHashHermesReferenceObject(params: {
  storageKey: string;
}): Promise<string> {
  const objectKey = normalizeHermesReferenceStorageObjectKey(params.storageKey);
  const relativeUrl = await storageResolveUrl(objectKey);
  if (!relativeUrl) {
    throw new Error(`Cannot resolve storage URL for reference asset (storageKey=${params.storageKey})`);
  }
  const absoluteUrl = toAbsoluteStorageUrl(relativeUrl);
  const response = await fetch(absoluteUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch reference asset bytes for checksum (status ${response.status})`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return createHash("sha256").update(bytes).digest("hex");
}

export interface BuildHermesMediaReferencesDeps {
  repo?: HermesMediaReferenceRepo;
  hashObject?: (params: {
    tenantId: string;
    userId: number;
    assetId: string;
    storageKey: string;
  }) => Promise<string>;
}

export class HermesMediaReferenceAssetNotFoundError extends Error {
  readonly assetId: string;
  constructor(assetId: string) {
    super(`Hermes media reference asset ${assetId} was not found for this owner`);
    this.name = "HermesMediaReferenceAssetNotFoundError";
    this.assetId = assetId;
  }
}

/**
 * Convert an ordered VD reference set (media asset ids + roles + the
 * "Image-N = <name>" labels from `contactSheets.ts`'s convention) into the
 * contract's `references[]`: `{ assetId, index (1-based, continuous), role,
 * label, sha256 }`. `sha256` is computed from the current object bytes on
 * every submit. The database value is only a cache and is repaired when stale
 * (best-effort — a persistence failure does not fail THIS submit, since the
 * freshly computed hash is already in hand for the current contract).
 */
export async function buildHermesMediaReferences(
  params: {
    tenantId: string;
    userId: number;
    orderedRefs: HermesMediaReferenceOrderedRef[];
  },
  deps: BuildHermesMediaReferencesDeps = {},
): Promise<HermesMediaReferenceList> {
  const repo = deps.repo ?? defaultHermesMediaReferenceRepo;
  const hashObject =
    deps.hashObject ?? (({ storageKey }) => defaultHashHermesReferenceObject({ storageKey }));

  const references: HermesMediaReferenceList = [];
  let index = 1;
  for (const ref of params.orderedRefs) {
    const asset = await repo.findAssetById({
      tenantId: params.tenantId,
      userId: params.userId,
      assetId: ref.assetId,
    });
    if (!asset) {
      throw new HermesMediaReferenceAssetNotFoundError(ref.assetId);
    }
    const sha256 = await hashObject({
      tenantId: params.tenantId,
      userId: params.userId,
      assetId: ref.assetId,
      storageKey: asset.storageKey,
    });
    if (asset.checksumSha256 !== sha256) {
      try {
        await repo.persistChecksum({ assetId: ref.assetId, checksumSha256: sha256 });
      } catch {
        // Best-effort cache repair only. The verified hash above remains
        // authoritative for this contract.
      }
    }
    references.push({ assetId: ref.assetId, index, role: ref.role, label: ref.label, sha256 });
    index += 1;
  }
  return references;
}

export interface HermesReferenceStorageLookup {
  storageKey: string;
  storageKeyCandidates: string[];
  originalUrlCandidates: string[];
}

/**
 * Builds every first-party representation currently present in
 * `media_assets`. Newer rows normally store a bare object key, while legacy
 * MCP rows can store the complete `/api/storage/files/...` proxy path in
 * both `storageKey` and `originalUrl`. Keeping both forms here prevents a
 * visible VD reference from being silently dropped before a Hermes job.
 */
export function buildHermesReferenceStorageLookup(
  url: string,
): HermesReferenceStorageLookup | null {
  const withoutQuery = url.split("?")[0]?.split("#")[0] ?? "";
  const proxyMatch = /\/api\/storage\/files\/(.+)$/.exec(withoutQuery);
  const uploadsMatch = /\/uploads\/(.+)$/.exec(withoutQuery);
  const encodedStorageKey = proxyMatch?.[1] ?? uploadsMatch?.[1];
  if (!encodedStorageKey) return null;

  const storageKey = decodeURIComponent(encodedStorageKey);
  const relativePath = proxyMatch
    ? `/api/storage/files/${storageKey}`
    : `/uploads/${storageKey}`;
  return {
    storageKey,
    storageKeyCandidates: Array.from(new Set([storageKey, relativePath])),
    originalUrlCandidates: Array.from(new Set([withoutQuery, relativePath])),
  };
}

export interface HermesReferenceAssetLookupRepo {
  findAssetByStorageKey(params: {
    tenantId: string;
    userId: number;
    storageKey: string;
    storageKeyCandidates?: string[];
    originalUrlCandidates?: string[];
  }): Promise<{ id: string } | null>;
}

export const defaultHermesReferenceAssetLookupRepo: HermesReferenceAssetLookupRepo = {
  async findAssetByStorageKey({
    tenantId,
    userId,
    storageKey,
    storageKeyCandidates,
    originalUrlCandidates,
  }) {
    const db = getDb();
    const storageCandidates = storageKeyCandidates?.length
      ? storageKeyCandidates
      : [storageKey];
    const originalCandidates = originalUrlCandidates ?? [];
    const assetMatch =
      originalCandidates.length > 0
        ? or(
            inArray(mediaAssets.storageKey, storageCandidates),
            inArray(mediaAssets.originalUrl, originalCandidates),
          )
        : inArray(mediaAssets.storageKey, storageCandidates);
    const [row] = await db
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.tenantId, tenantId),
          eq(mediaAssets.userId, userId),
          assetMatch,
        ),
      )
      .limit(1);
    return row ? { id: String(row.id) } : null;
  },
};

/**
 * Best-effort URL -> `media_assets.id` lookup for surfaces that only hold a
 * resolved reference URL (never the asset id itself) today. Returns `null`
 * (never throws) for a URL this cannot map back to an owned asset row — the
 * two proxy shapes `storageResolveUrl` ever emits are
 * `/api/storage/files/<key>` (S3/R2) and `/uploads/<key>` (local); anything
 * else (a foreign host, an already-expired presigned URL, etc.) is treated
 * as unresolvable rather than a hard error.
 */
export async function resolveHermesReferenceAssetIdFromUrl(
  params: { tenantId: string; userId: number; url: string },
  deps: { repo?: HermesReferenceAssetLookupRepo } = {},
): Promise<string | null> {
  const lookup = buildHermesReferenceStorageLookup(params.url);
  if (!lookup) return null;
  const repo = deps.repo ?? defaultHermesReferenceAssetLookupRepo;
  const row = await repo.findAssetByStorageKey({
    tenantId: params.tenantId,
    userId: params.userId,
    ...lookup,
  });
  return row ? row.id : null;
}

export interface ResolveHermesOrderedRefsFromUrlsParams {
  tenantId: string;
  userId: number;
  urls: string[];
  /** For the audit log line only — never sent anywhere else. */
  traceId: string;
  connectionId: string;
  /** Called with the ORIGINAL (pre-drop) loop index — same convention every
   *  VD call site already used inline (`Image-${idx + 1}` numbering never
   *  compacts around a dropped entry). */
  roleFor?: (originalIndex: number) => string;
  labelFor?: (originalIndex: number) => string;
  /**
   * Required-reference surfaces must never silently downgrade from
   * image.edit/reference-to-video to text-only generation.
   */
  requireAll?: boolean;
}

export class HermesMediaReferenceResolutionError extends Error {
  readonly code = "HERMES_REFERENCE_RESOLUTION_FAILED";
  readonly droppedReferenceCount: number;

  constructor(droppedReferenceCount: number) {
    super(
      `แนบภาพอ้างอิงไปยัง Hermes ไม่สำเร็จ ${droppedReferenceCount} ภาพ กรุณาตรวจสอบภาพแล้วลองใหม่ / Could not attach ${droppedReferenceCount} required Hermes reference image(s).`,
    );
    this.name = "HermesMediaReferenceResolutionError";
    this.droppedReferenceCount = droppedReferenceCount;
  }
}

/**
 * Batch wrapper around `resolveHermesReferenceAssetIdFromUrl` for every VD
 * image surface's reference list. A URL that fails to resolve to an owned
 * `media_assets` row is DROPPED from the returned `orderedRefs` (never
 * throws — see that function's own doc comment on why this stays
 * best-effort for image/location/character identity-lock references) —
 * but the drop is no longer SILENT: this feature's whole premise is killing
 * silent quality fallbacks, so every drop is logged with the job's
 * `traceId` + `connectionId` (never the url/asset content itself), and the
 * total drop count is returned so the caller can thread it into
 * `buildHermesMediaTaskEnvelope`'s `droppedReferenceCount` for the client to
 * warn on (a dropped reference silently degrades `image.edit` identity/
 * environment lock, or can silently downgrade the whole call to
 * `image.generate` if it was the only reference).
 */
export async function resolveHermesOrderedRefsFromUrls(
  params: ResolveHermesOrderedRefsFromUrlsParams,
  deps: { repo?: HermesReferenceAssetLookupRepo } = {},
): Promise<{ orderedRefs: HermesMediaReferenceOrderedRef[]; droppedReferenceCount: number }> {
  const orderedRefs: HermesMediaReferenceOrderedRef[] = [];
  let droppedReferenceCount = 0;
  for (let i = 0; i < params.urls.length; i++) {
    const url = params.urls[i];
    const assetId = await resolveHermesReferenceAssetIdFromUrl(
      { tenantId: params.tenantId, userId: params.userId, url },
      { repo: deps.repo },
    );
    if (!assetId) {
      droppedReferenceCount += 1;
      debugLog(
        "hermesMediaReferences",
        "Dropped an unresolvable Hermes reference — not a library-backed asset for this owner; identity/environment lock for this reference is lost",
        { traceId: params.traceId, connectionId: params.connectionId, referenceIndex: i },
      );
      continue;
    }
    orderedRefs.push({
      assetId,
      role: params.roleFor ? params.roleFor(i) : "reference",
      label: params.labelFor ? params.labelFor(i) : `Image-${i + 1}`,
    });
  }
  if (params.requireAll && droppedReferenceCount > 0) {
    throw new HermesMediaReferenceResolutionError(droppedReferenceCount);
  }
  return { orderedRefs, droppedReferenceCount };
}

/**
 * Wraps a freshly queued Hermes job's `taskId` into the same `MediaTask`
 * shape `mediaGenerationService.generateImageAsync`/`generateVideoAsync`
 * return — every existing call site that reads `task.id` (to persist onto a
 * shot/candidate/banner row, or to return `{ taskId: task.id }` to the
 * client) keeps working unchanged. `media.getTask`'s hermes branch (section
 * 06, `hermesMediaAdapter.ts`'s `getHermesMediaTask`) is the fully-populated
 * projection used on every SUBSEQUENT poll — this is only the immediate,
 * synchronous submit response.
 */
export function buildHermesMediaTaskEnvelope(params: {
  taskId: string;
  userId: number;
  mediaType: "image" | "video";
  model: string;
  prompt: string;
  extraParams?: Record<string, unknown>;
  /**
   * How many of this job's candidate reference URLs were silently
   * unresolvable (see `resolveHermesOrderedRefsFromUrls`) and therefore
   * dropped before submit. Surfaced under `resultData` (never silently
   * swallowed) so the client can warn the user that an identity/
   * environment lock reference did not make it into the render.
   */
  droppedReferenceCount?: number;
}): MediaTask {
  return {
    id: params.taskId,
    userId: String(params.userId),
    mediaType: params.mediaType,
    status: "pending",
    model: params.model,
    prompt: params.prompt,
    ...(params.extraParams ? { parameters: { extra_params: params.extraParams } } : {}),
    ...(params.droppedReferenceCount
      ? { resultData: { droppedReferenceCount: params.droppedReferenceCount } }
      : {}),
    creditsUsed: 0,
    createdAt: new Date().toISOString(),
  };
}
