/**
 * Owner-checked asset resolution + compiled-config asset-manifest walker
 * (Feature 133, section-07 §3). The compiler
 * (`server/services/videoProjectCompiler.ts`) is pure/no-I/O, so the router
 * must resolve every asset id a `VideoProjectDocument` references into a
 * storage-proxy URL *before* compiling (`resolveProjectAssets`), then walk
 * the *compiled* config to build the worker `assetManifest` *after*
 * compiling (`buildAssetManifest`).
 *
 * See `specs/feature/133-content-video-intelligence-platform/sections/section-07-router-async-queue-harness.md`
 * §3.
 */
import { createHash } from "node:crypto";
import { URL } from "node:url";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "../db";
import { mediaAssets, libraryItems } from "../../drizzle/schema";
import { storageResolveUrl } from "../storage";
import { getCachedInternalNodeUrl } from "./appRuntimeConfig";
import type { RemotionTemplateConfig } from "../../shared/remotion/layerTemplateSchemas";
import type { VideoProjectDocument } from "../../shared/videoIntelligence/projectSchemas";
import {
  VideoProjectCompileError,
  type AssetResolver,
} from "./videoProjectCompiler";

export type ProjectAssetAuthScope = { tenantId: string; userId: number };

/**
 * Superset of section-01's `AssetResolver` (`{ url(assetId), sha256(assetId) }`)
 * — still structurally assignable everywhere an `AssetResolver` is expected
 * (`compileVideoProject`'s `ctx.assetResolver`). `sha256ByUrl` is an
 * additional, section-07-only lookup: once `compileVideoProject` runs, every
 * layer's `src` field already holds the *resolved* URL (the compiler calls
 * `ctx.assetResolver.url(assetId)` itself while building layers), so
 * `buildAssetManifest` — which walks the *compiled* output, not the
 * document — has no asset id left to call `sha256(assetId)` with. This
 * reverse (url -> sha256) map bridges that gap without changing section-01's
 * frozen `AssetResolver` shape.
 */
export interface ResolvedAssetResolver extends AssetResolver {
  sha256ByUrl(url: string): string | undefined;
}

export type AssetManifestSourceRole = "video" | "image" | "audio" | "font";

export interface AssetManifestSource {
  role: AssetManifestSourceRole;
  url: string;
  /** Best-effort — `undefined` when the backing row carries no stored checksum. */
  sha256: string | undefined;
}

/** Matches the `assetManifest` shape nested inside
 *  `remotionRenderVideoWorkerInputSchema` (section-03, `shared/workerRuntime.ts`). */
export interface AssetManifest {
  sources: AssetManifestSource[];
}

/* -------------------------------------------------------------------------- */
/* resolveProjectAssets                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Collects every asset id referenced by the document (section-07 §3):
 *  - `scene.narrationAudioAssetId`
 *  - `audioTracks[*].assetRefs` (narration/music) and `sfx.events[*].assetRef`
 *  - Deviation (documented): the frozen `RemotionLayerSchema.src` field is
 *    `.url()`-validated (never a bare numeric id — see section-01), so no
 *    layer `src` in `scene.layers` can ever be a numeric id reference in
 *    practice; this function does not scan layer `src` for ids. Motion
 *    Template `visual.params` are free-form per-template
 *    (`Record<string, unknown>`) and MAY embed an asset id a template
 *    builder resolves at compile time (e.g. `luxury_end_card`'s
 *    `logoAssetId` param) — those must be pre-fetched too (the compiler is
 *    synchronous and `AssetResolver.url()` is synchronous), so this function
 *    best-effort-scans every `visual.params` value tree for a positive
 *    integer under a key matching /assetid/i.
 */
function collectDocumentAssetIds(document: VideoProjectDocument): Set<number> {
  const ids = new Set<number>();

  const addId = (value: unknown) => {
    if (typeof value === "number" && Number.isInteger(value) && value > 0) {
      ids.add(value);
    }
  };

  const scanParamsForAssetIds = (value: unknown, keyHint: string | null) => {
    if (Array.isArray(value)) {
      for (const item of value) scanParamsForAssetIds(item, keyHint);
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        scanParamsForAssetIds(nested, key);
      }
      return;
    }
    if (keyHint && /assetid/i.test(keyHint)) {
      addId(value);
    }
  };

  for (const scene of document.scenes) {
    addId(scene.narrationAudioAssetId);
    if (scene.visual.kind === "template") {
      scanParamsForAssetIds(scene.visual.params, null);
    }
  }

  for (const track of document.audioTracks) {
    if (track.kind === "narration" || track.kind === "music") {
      for (const assetRef of track.assetRefs) addId(assetRef);
    } else {
      for (const event of track.events) addId(event.assetRef);
    }
  }

  return ids;
}

/**
 * Prefixes a storage-proxy relative path (`/api/storage/files/…` or
 * `/uploads/…`) with this server's own base URL.
 *
 * Deviation from section-07 §3's literal text (documented, verified against
 * real runtime behavior, not guessed): §3 describes `AssetResolver.url()` as
 * returning a bare storage-proxy path. That cannot be literally correct for
 * the value that ends up on a COMPILED layer's `src` field, because:
 *  1. The frozen `RemotionLayerSchema.src` is `.url()`-validated (Zod), which
 *     REJECTS any relative path (`z.string().url().safeParse("/uploads/x")`
 *     is `false` — verified) — a compiled config carrying a bare relative
 *     `src` would fail `RemotionTemplateConfigSchema` re-validation inside
 *     `videoProjectCompiler.ts`'s `buildSingleConfig`, breaking every
 *     document with a real asset reference.
 *  2. `executeGenericTemplateRender` (`remotionRuntimeAdapter.ts`) passes
 *     `remotionTemplate.layers[].src` straight into Remotion's `renderMedia`
 *     as `inputProps` — headless Chromium fetches it directly over the wire
 *     during render (no local re-staging/rewrite step exists for this render
 *     path, unlike the HyperFrames shot-video staging pipeline) — confirmed
 *     by reading that function's body. A relative path is not fetchable by
 *     Chromium.
 * The §17.3 "never a raw external URL" SSRF-safety intent is preserved: the
 * absolute URL is still rooted at THIS server's own base URL
 * (`getCachedInternalNodeUrl()`, e.g. `http://localhost:3000` internally) —
 * never an arbitrary external host — so it is the storage-proxy endpoint,
 * merely made `.url()`-valid and network-fetchable.
 */
function toAbsoluteUrl(relativePath: string): string {
  if (/^https?:\/\//i.test(relativePath)) return relativePath;
  return `${getCachedInternalNodeUrl()}${relativePath}`;
}

/* -------------------------------------------------------------------------- */
/* §17.3 SSRF host allowlist for author-supplied `scene.layers[].src`         */
/* (F133-01 CRITICAL fix — pre-merge security gate)                          */
/* -------------------------------------------------------------------------- */

/**
 * The only two storage-proxy path prefixes this server ever emits for a
 * resolved asset (see `toAbsoluteUrl` above / `storage.ts`'s
 * `storageResolveUrl`) — `image`/`video`/`audio` layer `src` values authored
 * directly into `scene.layers[]` (via `saveDocument`) are NEVER resolved
 * through `resolveProjectAssets`'s owner-checked id lookup (the frozen
 * `RemotionLayerSchema.src` field is `.url()`-validated, so it can never be a
 * bare numeric asset id in the first place — see `collectDocumentAssetIds`'s
 * doc comment). Without a host allowlist here, an attacker-authored layer
 * `src` reaches TWO fetch sites unchecked: (1) this server's own
 * `defaultStageRemotionRenderVideoAssets` asset-manifest verification fetch
 * (`hyperframesRenderWorker.ts` — a blind-SSRF status-code oracle via
 * `failureReason`), and (2) headless Chromium during the actual Remotion
 * render (`renderMedia` fetches `layer.src` directly, no re-staging). Spec
 * §17.3.
 */
const ASSET_URL_ALLOWED_PATH_PREFIXES = ["/api/storage/files/", "/uploads/"];

/**
 * True only when `url` is an `http(s)://` URL whose origin is THIS server's
 * own internal origin (`getCachedInternalNodeUrl()`) AND whose path is one
 * of the storage-proxy routes this server itself emits. Rejects every other
 * scheme/host — `file://`, arbitrary external hosts, and internal
 * IPs/cloud-metadata endpoints reachable via any URL that isn't literally
 * our own storage proxy (e.g. `http://169.254.169.254/...` has a DIFFERENT
 * origin than `getCachedInternalNodeUrl()`, so it is rejected even though it
 * IS an internal-looking address — this is an allowlist, not a
 * private-IP blocklist).
 */
export function isAllowedInternalAssetUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

  let internalOrigin: string;
  try {
    internalOrigin = new URL(getCachedInternalNodeUrl()).origin;
  } catch {
    return false;
  }
  if (parsed.origin !== internalOrigin) return false;

  return ASSET_URL_ALLOWED_PATH_PREFIXES.some(prefix => parsed.pathname.startsWith(prefix));
}

/** Every `scene.layers[]` entry whose `type` carries a `src` field (`image`,
 *  `video`, `audio` — `svg`/`motionGraphic`/`text`/`scene3d` never have one)
 *  and whose `src` fails {@link isAllowedInternalAssetUrl}. Deduped. */
function findDisallowedSceneLayerAssetUrls(document: VideoProjectDocument): string[] {
  const offending = new Set<string>();
  for (const scene of document.scenes) {
    for (const layer of scene.layers) {
      if (layer.type === "image" || layer.type === "video" || layer.type === "audio") {
        if (!isAllowedInternalAssetUrl(layer.src)) {
          offending.add(layer.src);
        }
      }
    }
  }
  return [...offending];
}

/**
 * Throws `VideoProjectCompileError(code, …)` when any `scene.layers[]`
 * `image`/`video`/`audio` `src` is not an allowed internal storage-proxy URL
 * (§17.3). Called at BOTH checkpoints, defense-in-depth (F133-01):
 *  - `videoProjects.ts`'s `saveDocument` (code `"VI_DOCUMENT_INVALID"`) —
 *    rejects the malicious document before it is ever persisted.
 *  - `resolveProjectAssets` below (code `"VI_ASSET_UNRESOLVED"`), so a
 *    document that somehow bypassed the save-time check (e.g. seeded
 *    directly, or written before this fix existed) can never reach a
 *    compiled render payload either.
 */
export function assertSceneLayerAssetUrlsAllowed(
  document: VideoProjectDocument,
  code: VideoProjectCompileError["code"],
): void {
  const offending = findDisallowedSceneLayerAssetUrls(document);
  if (offending.length > 0) {
    throw new VideoProjectCompileError(
      code,
      `§17.3 SSRF host allowlist rejected ${offending.length} scene layer src URL(s) not ` +
        `resolving to this server's internal storage-proxy origin: ${offending.join(", ")}`,
    );
  }
}

/**
 * Fetches an asset's bytes and computes its real sha256 — used when the
 * backing DB row carries no stored checksum. This matters because
 * `assetManifest.sources[].url` is now an `http(s)://` URL (`toAbsoluteUrl`
 * above): the worker's own defense-in-depth integrity check
 * (`defaultStageRemotionRenderVideoAssets`, `hyperframesRenderWorker.ts`)
 * fetches every `http(s)://` manifest source and HARD-THROWS
 * `asset_stage_failed` on a checksum mismatch — a hash that doesn't match
 * the real bytes (e.g. a hash of the URL *string*) would make every such
 * render fail. Best-effort: returns `undefined` (never throws) on any fetch
 * failure, so a transient network hiccup during resolution degrades to "no
 * checksum available" rather than blocking the whole compile.
 */
async function computeContentSha256(absoluteUrl: string): Promise<string | undefined> {
  try {
    const response = await fetch(absoluteUrl);
    if (!response.ok) return undefined;
    const bytes = Buffer.from(await response.arrayBuffer());
    return createHash("sha256").update(bytes).digest("hex");
  } catch {
    return undefined;
  }
}

/**
 * Resolves every asset id the document references to an absolute,
 * same-origin storage-proxy URL (`<internalNodeUrl>/api/storage/files/…` or
 * `<internalNodeUrl>/uploads/…` — never an arbitrary external host, spec
 * §17.3; see `toAbsoluteUrl`'s doc comment for why this must be absolute,
 * not a bare relative path), owner-checked against BOTH `mediaAssets`
 * (bigint id) and `libraryItems` (integer id) — a referenced id may live in
 * either table, so both are queried (batched, one `inArray` select per
 * table — never N+1) and whichever resolves for this owner wins. A
 * referenced id that resolves in neither table for this
 * `{ tenantId, userId }` scope throws
 * `VideoProjectCompileError("VI_ASSET_UNRESOLVED", …)` listing every
 * offending id.
 */
export async function resolveProjectAssets(
  document: VideoProjectDocument,
  auth: ProjectAssetAuthScope,
): Promise<ResolvedAssetResolver> {
  // F133-01 checkpoint 2 (defense-in-depth — checkpoint 1 is `saveDocument`,
  // `videoProjects.ts`): re-validate the §17.3 host allowlist at
  // compile/render time too, so a document that bypassed the save-time
  // check by any means can never reach a compiled render payload.
  assertSceneLayerAssetUrlsAllowed(document, "VI_ASSET_UNRESOLVED");

  const idSet = collectDocumentAssetIds(document);

  const urlById = new Map<number, string>();
  const sha256ById = new Map<number, string | undefined>();
  const sha256ByUrl = new Map<string, string | undefined>();

  if (idSet.size > 0) {
    const idList = [...idSet];

    const [mediaRows, libraryRows] = await Promise.all([
      db
        .select({
          id: mediaAssets.id,
          storageKey: mediaAssets.storageKey,
          checksumSha256: mediaAssets.checksumSha256,
        })
        .from(mediaAssets)
        .where(
          and(
            inArray(mediaAssets.id, idList),
            eq(mediaAssets.tenantId, auth.tenantId),
            eq(mediaAssets.userId, auth.userId),
          ),
        ),
      db
        .select({
          id: libraryItems.id,
          sourceUrl: libraryItems.sourceUrl,
        })
        .from(libraryItems)
        .where(
          and(
            inArray(libraryItems.id, idList),
            eq(libraryItems.tenantId, auth.tenantId),
            eq(libraryItems.ownerUserId, auth.userId),
          ),
        ),
    ]);

    for (const row of mediaRows as Array<{ id: number; storageKey: string; checksumSha256: string | null }>) {
      const relativeUrl = await storageResolveUrl(row.storageKey);
      if (!relativeUrl) continue;
      const url = toAbsoluteUrl(relativeUrl);
      urlById.set(row.id, url);
      const sha = row.checksumSha256 ?? (await computeContentSha256(url));
      sha256ById.set(row.id, sha);
      sha256ByUrl.set(url, sha);
    }

    for (const row of libraryRows as Array<{ id: number; sourceUrl: string | null }>) {
      // §17.3 SSRF allowlist: only accept an already-storage-proxy path
      // (starts with "/") — reject any other host — before making it
      // absolute against OUR OWN base URL.
      if (row.sourceUrl && row.sourceUrl.startsWith("/")) {
        const url = toAbsoluteUrl(row.sourceUrl);
        urlById.set(row.id, url);
        // `libraryItems` has no checksum column — always content-fetched.
        const sha = await computeContentSha256(url);
        sha256ById.set(row.id, sha);
        if (!sha256ByUrl.has(url)) sha256ByUrl.set(url, sha);
      }
    }

    const unresolved = idList.filter(id => !urlById.has(id));
    if (unresolved.length > 0) {
      throw new VideoProjectCompileError(
        "VI_ASSET_UNRESOLVED",
        `Unresolved asset id(s) for this owner: ${unresolved.join(", ")}`,
      );
    }
  }

  return {
    url(assetId: number | string): string {
      const numId = typeof assetId === "string" ? Number(assetId) : assetId;
      const url = urlById.get(numId);
      if (!url) {
        throw new VideoProjectCompileError(
          "VI_ASSET_UNRESOLVED",
          `Unresolved asset "${String(assetId)}"`,
        );
      }
      return url;
    },
    sha256(assetId: number | string): string | undefined {
      const numId = typeof assetId === "string" ? Number(assetId) : assetId;
      return sha256ById.get(numId);
    },
    sha256ByUrl(url: string): string | undefined {
      return sha256ByUrl.get(url);
    },
  };
}

/* -------------------------------------------------------------------------- */
/* buildAssetManifest                                                         */
/* -------------------------------------------------------------------------- */

/**
 * LAST-RESORT fallback hash (hash of the URL string) for a manifest source
 * whose real content hash is unavailable — the worker's frozen
 * `assetManifest` schema (section-03) requires a well-formed hash string
 * (`workerStableHashSchema`, min 8 chars) on every source, so `undefined` is
 * not representable there.
 *
 * `resolveProjectAssets`'s `computeContentSha256` already fetches+hashes the
 * REAL bytes for every asset lacking a stored `mediaAssets.checksumSha256`
 * (see its doc comment), so this fallback is reached only when that fetch
 * ALSO failed (asset unreachable/network error at resolve time). In that
 * case the worker's own `defaultStageRemotionRenderVideoAssets` staging step
 * will independently attempt the same fetch and fail at the "fetch failed"
 * step for the same underlying reason — a hash-of-the-url-string here does
 * not create a NEW failure mode, it just means the render fails at
 * `asset_stage_failed` either way (fetch-unreachable vs. checksum-mismatch),
 * never silently succeeds with an unverified asset.
 */
export function fallbackAssetSourceHash(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

/**
 * Walks the *compiled* `RemotionTemplateConfig`'s `layers[]` and collects an
 * `AssetManifest` entry per distinct `src` (deduped by url), tagging each
 * with the worker contract's `role` enum. Only `video`/`image`/`audio`
 * layers carry a `src` field in the frozen `RemotionLayerSchema`
 * (`svg`/`motionGraphic`/`text`/`scene3d` do not) — Phase 1 therefore never
 * emits a `role: "font"` entry (no font-asset reference exists anywhere in
 * the frozen layer schema yet); `"font"` stays a valid enum member for a
 * future section to populate.
 */
export function buildAssetManifest(
  config: RemotionTemplateConfig,
  resolver: ResolvedAssetResolver,
): AssetManifest {
  const bySrc = new Map<string, AssetManifestSource>();

  for (const layer of config.layers) {
    let role: AssetManifestSourceRole | null = null;
    if (layer.type === "video") role = "video";
    else if (layer.type === "image") role = "image";
    else if (layer.type === "audio") role = "audio";
    if (!role) continue;

    const src = (layer as { src: string }).src;
    if (bySrc.has(src)) continue;
    bySrc.set(src, { role, url: src, sha256: resolver.sha256ByUrl(src) });
  }

  return { sources: [...bySrc.values()] };
}

/**
 * Merges multiple `AssetManifest`s (one per segmented-compile part) into a
 * single manifest, deduped by url — used by the router when
 * `compileVideoProject` returns `{ kind: "segmented" }`.
 */
export function mergeAssetManifests(manifests: AssetManifest[]): AssetManifest {
  const bySrc = new Map<string, AssetManifestSource>();
  for (const manifest of manifests) {
    for (const source of manifest.sources) {
      if (!bySrc.has(source.url)) bySrc.set(source.url, source);
    }
  }
  return { sources: [...bySrc.values()] };
}
