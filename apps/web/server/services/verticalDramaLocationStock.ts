/**
 * Vertical Drama Series — durable location-stock service
 * (`planning/polished-toasting-gadget.md` Phase 2).
 *
 * Location-side companion to `verticalDramaCharacterStock.ts`: owns the
 * durable per-series location reference stock (the asset manifest, the
 * approval/QC lifecycle, and the state machine that drives it). Every asset
 * link points at a canonical `media_assets` row (never a provider URL) and is
 * scoped to `(tenantId, userId, seriesId)` so a user can never attach, read,
 * or approve another tenant's or user's asset.
 *
 * Deliberately simpler than its character counterpart — no
 * `containsHumanFace` field (a location's whole point is to be people-free;
 * see the skill's own "No people — MANDATORY" section), no multi-role
 * "second reference" picking (`pickBestCharacterSheetAsset`'s equivalent),
 * no face-source/variant resolution. Independently declared throughout
 * (own error class, own owner/param types, own row<->contract mapper) rather
 * than sharing code with `verticalDramaCharacterStock.ts`, matching the
 * broader decoupling convention this feature uses everywhere else (see e.g.
 * the location router's own `resolveMediaAssetForImport`, deliberately
 * duplicated rather than shared with the character router).
 *
 * Cross-tenant / deleted media assets are rejected at attach time — the
 * linked `media_assets` row must exist under the same tenant + user and must
 * not be in a `deleted` / `failed` / `purged` state.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  verticalDramaLocations,
  verticalDramaLocationAssets,
  mediaAssets,
  type VerticalDramaLocationRow,
  type VerticalDramaLocationAssetRow,
} from "../../drizzle/schema";
import {
  canTransitionLocationAssetState,
  transitionLocationAssetState,
  VERTICAL_DRAMA_LOCATION_ASSET_STATES,
  type VerticalDramaLocationAsset,
  type VerticalDramaLocationAssetState,
  type VerticalDramaLocationAssetSource,
} from "@shared/verticalDramaSeries";

/* -------------------------------------------------------------------------- */
/* Ownership / param types                                                    */
/* -------------------------------------------------------------------------- */

export interface VerticalDramaLocationStockOwner {
  tenantId: string;
  userId: number;
  seriesId: number;
}

/** Media-asset states that must never be attachable as a durable reference. */
export const VERTICAL_DRAMA_UNATTACHABLE_MEDIA_ASSET_STATUSES: readonly string[] = [
  "deleted",
  "failed",
  "purged",
] as const;

export type AttachLocationMediaAssetRejectionReason =
  | "media_asset_not_found"
  | "media_asset_cross_tenant"
  | "media_asset_cross_user"
  | "media_asset_deleted";

export class VerticalDramaLocationStockError extends Error {
  constructor(
    public readonly reason:
      | AttachLocationMediaAssetRejectionReason
      | "illegal_state_transition"
      | "asset_not_found"
      | "asset_wrong_role"
      // Distinct from `asset_wrong_role` — the asset IS an establishing_plate
      // reference, it just hasn't cleared review yet, so `setPrimaryAsset`
      // (below) can never mark a not-yet-approved candidate as primary.
      | "asset_not_approved",
    message: string,
  ) {
    super(message);
    this.name = "VerticalDramaLocationStockError";
  }
}

export interface LinkLocationAssetParams extends VerticalDramaLocationStockOwner {
  locationId?: number | null;
  /** Canonical media_assets id to attach. Must be owned + not deleted. */
  mediaAssetId?: number | null;
  assetType: "location_reference" | string;
  /** "establishing_plate" in Phase 2 — no other role authored yet. */
  role?: string | null;
  source: VerticalDramaLocationAssetSource;
  checksumSha256?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface TransitionLocationAssetParams extends VerticalDramaLocationStockOwner {
  assetLinkId: number;
  to: VerticalDramaLocationAssetState;
  rejectionReason?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Pure row <-> contract mapping                                              */
/* -------------------------------------------------------------------------- */

function isLocationAssetState(v: string): v is VerticalDramaLocationAssetState {
  return (VERTICAL_DRAMA_LOCATION_ASSET_STATES as readonly string[]).includes(v);
}

/** Derive the coarse lifecycle state from the durable row's flags. */
export function deriveLocationAssetState(
  row: Pick<VerticalDramaLocationAssetRow, "approved" | "qcStatus" | "metadata">,
): VerticalDramaLocationAssetState {
  const meta = (row.metadata as { state?: string } | null) ?? null;
  if (meta?.state && isLocationAssetState(meta.state)) return meta.state;
  if (row.approved) return "approved";
  if (row.qcStatus === "failed" || row.qcStatus === "needs_repair") return "rejected";
  return "draft";
}

export function locationAssetRowToContract(
  row: VerticalDramaLocationAssetRow,
  thumbnailUrl?: string | null,
): VerticalDramaLocationAsset {
  const meta = (row.metadata as Record<string, unknown> | null) ?? {};
  const state = deriveLocationAssetState(row);
  return {
    assetLinkId: String(row.id),
    seriesId: String(row.seriesId),
    locationId: row.locationId != null ? String(row.locationId) : "",
    locationKey: typeof meta.locationKey === "string" ? meta.locationKey : undefined,
    mediaAssetId: row.mediaAssetId != null ? String(row.mediaAssetId) : undefined,
    assetType: row.assetType,
    role: row.role ?? undefined,
    state,
    approved: row.approved,
    qcStatus: (row.qcStatus as VerticalDramaLocationAsset["qcStatus"]) ?? "pending",
    checksumSha256: row.checksumSha256 ?? undefined,
    source: typeof meta.source === "string" ? (meta.source as VerticalDramaLocationAssetSource) : "imported",
    rejectionReason: typeof meta.rejectionReason === "string" ? meta.rejectionReason : undefined,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    thumbnailUrl: thumbnailUrl ?? undefined,
  };
}

function toIso(v: Date | string): string {
  return (v instanceof Date ? v : new Date(v)).toISOString();
}

/**
 * Extract the explicit "user picked this candidate as primary" marker
 * (`data.primaryAssetLinkId`) from a `verticalDramaLocations` row's raw
 * `data` jsonb column. Malformed/legacy `data` (missing key, wrong type,
 * non-positive number) is treated identically to "no marker set" — every
 * caller of this function falls back to the newest-approved
 * `establishing_plate` asset in that case, so a location whose `data`
 * predates this feature (or was hand-edited) behaves byte-identically to
 * before this marker existed. Exported for direct unit testing.
 */
export function extractPrimaryAssetLinkIdMarker(data: unknown): number | undefined {
  if (!data || typeof data !== "object") return undefined;
  const raw = (data as Record<string, unknown>).primaryAssetLinkId;
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : undefined;
}

/* -------------------------------------------------------------------------- */
/* Service (DB-backed)                                                         */
/* -------------------------------------------------------------------------- */

export class VerticalDramaLocationStockService {
  /**
   * Validate that `mediaAssetId` is attachable: it must exist, belong to the
   * caller's tenant AND user, and not be in a deleted/failed/purged state.
   * Throws a `VerticalDramaLocationStockError` with a machine-readable reason
   * otherwise. Byte-identical logic to
   * `VerticalDramaCharacterStockService.assertMediaAssetAttachable`,
   * duplicated rather than shared (see this file's doc comment).
   */
  async assertMediaAssetAttachable(
    owner: VerticalDramaLocationStockOwner,
    mediaAssetId: number,
  ): Promise<void> {
    const [row] = await db
      .select({
        id: mediaAssets.id,
        tenantId: mediaAssets.tenantId,
        userId: mediaAssets.userId,
        status: mediaAssets.status,
      })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, mediaAssetId))
      .limit(1);
    if (!row) {
      throw new VerticalDramaLocationStockError(
        "media_asset_not_found",
        "Referenced media asset does not exist",
      );
    }
    if (row.tenantId !== owner.tenantId) {
      // NOT-FOUND semantics preferred at the router boundary; the service uses a
      // precise reason so callers never disclose cross-tenant existence.
      throw new VerticalDramaLocationStockError(
        "media_asset_cross_tenant",
        "Referenced media asset belongs to another tenant",
      );
    }
    if (row.userId !== owner.userId) {
      throw new VerticalDramaLocationStockError(
        "media_asset_cross_user",
        "Referenced media asset belongs to another user",
      );
    }
    if (row.status && VERTICAL_DRAMA_UNATTACHABLE_MEDIA_ASSET_STATUSES.includes(row.status)) {
      throw new VerticalDramaLocationStockError(
        "media_asset_deleted",
        `Referenced media asset is not attachable (status=${row.status})`,
      );
    }
  }

  private async loadOwnedRow(
    owner: VerticalDramaLocationStockOwner,
    assetLinkId: number,
  ): Promise<VerticalDramaLocationAssetRow> {
    const [row] = await db
      .select()
      .from(verticalDramaLocationAssets)
      .where(
        and(
          eq(verticalDramaLocationAssets.id, assetLinkId),
          eq(verticalDramaLocationAssets.tenantId, owner.tenantId),
          eq(verticalDramaLocationAssets.userId, owner.userId),
          eq(verticalDramaLocationAssets.seriesId, owner.seriesId),
        ),
      )
      .limit(1);
    if (!row) {
      throw new VerticalDramaLocationStockError("asset_not_found", "Location asset not found");
    }
    return row;
  }

  /**
   * Link a new location reference asset into the durable stock. The
   * `media_assets` row (when provided) is validated for tenant+user ownership
   * and non-deleted status before insert (cross-tenant/deleted are rejected).
   *
   * Auto-approved on entry — mirrors
   * `VerticalDramaCharacterStockService.linkAsset`'s exact documented
   * behavior (confirmed by reading it: "Auto-approved on entry ... every new
   * link ... starts directly in `approved`"), including its exact
   * IDEMPOTENCY guard: an existing link for the same
   * `(seriesId, locationId, mediaAssetId)` tuple is UPDATEd in place (new
   * role/source/state/metadata applied on top of it) instead of inserting a
   * sibling row, so re-linking the same media asset to the same location
   * never produces duplicate tiles for the same image.
   */
  async linkAsset(params: LinkLocationAssetParams): Promise<VerticalDramaLocationAsset> {
    if (params.mediaAssetId != null) {
      await this.assertMediaAssetAttachable(params, params.mediaAssetId);
    }

    if (params.locationId != null && params.mediaAssetId != null) {
      const [existing] = await db
        .select()
        .from(verticalDramaLocationAssets)
        .where(
          and(
            eq(verticalDramaLocationAssets.tenantId, params.tenantId),
            eq(verticalDramaLocationAssets.userId, params.userId),
            eq(verticalDramaLocationAssets.seriesId, params.seriesId),
            eq(verticalDramaLocationAssets.locationId, params.locationId),
            eq(verticalDramaLocationAssets.mediaAssetId, params.mediaAssetId),
          ),
        )
        .limit(1);
      if (existing) {
        const meta: Record<string, unknown> = {
          ...((existing.metadata as Record<string, unknown> | null) ?? {}),
          ...(params.metadata ?? {}),
          state: "approved" satisfies VerticalDramaLocationAssetState,
          source: params.source,
        };
        const [updated] = await db
          .update(verticalDramaLocationAssets)
          .set({
            assetType: params.assetType,
            role: params.role ?? existing.role,
            approved: true,
            checksumSha256: params.checksumSha256 ?? existing.checksumSha256,
            metadata: meta,
            updatedAt: new Date(),
          })
          .where(eq(verticalDramaLocationAssets.id, existing.id))
          .returning();
        return locationAssetRowToContract(updated as VerticalDramaLocationAssetRow);
      }
    }

    const [row] = await db
      .insert(verticalDramaLocationAssets)
      .values({
        tenantId: params.tenantId,
        userId: params.userId,
        seriesId: params.seriesId,
        locationId: params.locationId ?? null,
        mediaAssetId: params.mediaAssetId ?? null,
        assetType: params.assetType,
        role: params.role ?? null,
        approved: true,
        qcStatus: "pending",
        checksumSha256: params.checksumSha256 ?? null,
        metadata: {
          ...(params.metadata ?? {}),
          state: "approved" satisfies VerticalDramaLocationAssetState,
          source: params.source,
        },
      } as typeof verticalDramaLocationAssets.$inferInsert)
      .returning();
    return locationAssetRowToContract(row as VerticalDramaLocationAssetRow);
  }

  /**
   * Apply a lifecycle transition (draft -> generated/imported -> approved /
   * rejected / stale), enforced via `canTransitionLocationAssetState`/
   * `transitionLocationAssetState` (`@shared/verticalDramaSeries/locationAssets.ts`,
   * an independent state machine from the character system's). Illegal
   * transitions throw.
   */
  async transition(params: TransitionLocationAssetParams): Promise<VerticalDramaLocationAsset> {
    const row = await this.loadOwnedRow(params, params.assetLinkId);
    const from = deriveLocationAssetState(row);
    if (!canTransitionLocationAssetState(from, params.to)) {
      throw new VerticalDramaLocationStockError(
        "illegal_state_transition",
        `illegal_location_asset_transition: ${from} -> ${params.to}`,
      );
    }
    const next = transitionLocationAssetState(from, params.to);
    const meta: Record<string, unknown> = {
      ...((row.metadata as Record<string, unknown> | null) ?? {}),
      state: next,
    };
    if (params.rejectionReason != null) meta.rejectionReason = params.rejectionReason;
    const [updated] = await db
      .update(verticalDramaLocationAssets)
      .set({
        approved: next === "approved",
        qcStatus: next === "rejected" ? "failed" : next === "approved" ? "passed" : row.qcStatus,
        metadata: meta,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(verticalDramaLocationAssets.id, params.assetLinkId),
          eq(verticalDramaLocationAssets.tenantId, params.tenantId),
          eq(verticalDramaLocationAssets.userId, params.userId),
        ),
      )
      .returning();
    // Leaving `approved` — e.g. rejected/back-to-draft — clears this asset as
    // the location's explicitly-marked primary (if it was), so resolution
    // cleanly falls back to newest-approved instead of pointing at a
    // no-longer-approved image. No-op when this asset was never the marker.
    if (next !== "approved" && row.locationId != null) {
      await this.clearPrimaryMarkerIfMatches(params, row.locationId, params.assetLinkId);
    }
    return locationAssetRowToContract(updated as VerticalDramaLocationAssetRow);
  }

  /** Mark a set of approved references stale (e.g. after the location's identity changes). */
  async markStale(owner: VerticalDramaLocationStockOwner, assetLinkIds: number[]): Promise<number> {
    if (assetLinkIds.length === 0) return 0;
    const rows = await db
      .select()
      .from(verticalDramaLocationAssets)
      .where(
        and(
          eq(verticalDramaLocationAssets.tenantId, owner.tenantId),
          eq(verticalDramaLocationAssets.userId, owner.userId),
          eq(verticalDramaLocationAssets.seriesId, owner.seriesId),
          inArray(verticalDramaLocationAssets.id, assetLinkIds),
        ),
      );
    let count = 0;
    for (const row of rows) {
      const from = deriveLocationAssetState(row);
      if (!canTransitionLocationAssetState(from, "stale")) continue;
      const meta = { ...((row.metadata as Record<string, unknown> | null) ?? {}), state: "stale" };
      await db
        .update(verticalDramaLocationAssets)
        .set({ metadata: meta, updatedAt: new Date() })
        .where(eq(verticalDramaLocationAssets.id, row.id));
      // Note: marking stale does NOT flip the `approved` DB column (only the
      // derived `metadata.state`) — see `deriveLocationAssetState`'s own
      // precedence. The explicit-marker clear below is therefore the ONLY
      // thing that stops a just-staled asset from continuing to resolve as
      // "the" primary; it must run regardless of that `approved` quirk.
      if (row.locationId != null) {
        await this.clearPrimaryMarkerIfMatches(owner, row.locationId, row.id);
      }
      count += 1;
    }
    return count;
  }

  /**
   * Permanently unlink a reference asset from a location's stock — mirrors
   * `VerticalDramaCharacterStockService.deleteAsset`'s "generate/import = add,
   * unwanted = delete" model. Only removes the `verticalDramaLocationAssets`
   * link row — the underlying `media_assets` row is left untouched.
   */
  async deleteAsset(owner: VerticalDramaLocationStockOwner, assetLinkId: number): Promise<void> {
    const row = await this.loadOwnedRow(owner, assetLinkId);
    await db
      .delete(verticalDramaLocationAssets)
      .where(
        and(
          eq(verticalDramaLocationAssets.id, assetLinkId),
          eq(verticalDramaLocationAssets.tenantId, owner.tenantId),
          eq(verticalDramaLocationAssets.userId, owner.userId),
          eq(verticalDramaLocationAssets.seriesId, owner.seriesId),
        ),
      );
    // Deleting the explicitly-marked primary clears the marker so resolution
    // falls back to newest-approved instead of pointing at a now-deleted
    // asset link. No-op when this asset was never the marker.
    if (row.locationId != null) {
      await this.clearPrimaryMarkerIfMatches(owner, row.locationId, assetLinkId);
    }
  }

  /**
   * Load a location row's raw `data` jsonb column (tenant/user/series
   * scoped). Returns `undefined` when the location does not exist / is not
   * owned by `owner` (distinct from a `null`/`{}` `data` column, which means
   * "found, but nothing stored yet") — callers use that distinction to no-op
   * cleanly instead of throwing when a location has already been deleted out
   * from under a stale caller.
   */
  private async loadLocationData(
    owner: VerticalDramaLocationStockOwner,
    locationId: number,
  ): Promise<Record<string, unknown> | null | undefined> {
    const [row] = await db
      .select({ data: verticalDramaLocations.data })
      .from(verticalDramaLocations)
      .where(
        and(
          eq(verticalDramaLocations.id, locationId),
          eq(verticalDramaLocations.tenantId, owner.tenantId),
          eq(verticalDramaLocations.userId, owner.userId),
          eq(verticalDramaLocations.seriesId, owner.seriesId),
        ),
      )
      .limit(1);
    if (!row) return undefined;
    return (row.data as Record<string, unknown> | null) ?? null;
  }

  /**
   * Resolve the location's EXPLICITLY-marked primary reference
   * (`data.primaryAssetLinkId`), re-validated against the exact constraints
   * the marker-resolution rule requires: the marked asset must still exist,
   * still be `approved`, still be `role="establishing_plate"`, and still
   * belong to this exact location under this owner scope. Returns
   * `undefined` when there is no marker, or the marker no longer resolves to
   * a valid asset — callers fall back to their own newest-approved query
   * UNCHANGED in that case (see `getPrimaryReferenceUrl`/
   * `getPrimaryReferenceAssetId` below).
   */
  private async resolveExplicitPrimaryReference(
    owner: VerticalDramaLocationStockOwner,
    locationId: number,
  ): Promise<{ mediaAssetId: number; url: string } | undefined> {
    const marker = extractPrimaryAssetLinkIdMarker(await this.loadLocationData(owner, locationId));
    if (marker == null) return undefined;
    const [row] = await db
      .select({ mediaAssetId: mediaAssets.id, url: mediaAssets.originalUrl })
      .from(verticalDramaLocationAssets)
      .innerJoin(mediaAssets, eq(verticalDramaLocationAssets.mediaAssetId, mediaAssets.id))
      .where(
        and(
          eq(verticalDramaLocationAssets.id, marker),
          eq(verticalDramaLocationAssets.tenantId, owner.tenantId),
          eq(verticalDramaLocationAssets.userId, owner.userId),
          eq(verticalDramaLocationAssets.seriesId, owner.seriesId),
          eq(verticalDramaLocationAssets.locationId, locationId),
          eq(verticalDramaLocationAssets.role, "establishing_plate"),
          eq(verticalDramaLocationAssets.approved, true),
        ),
      )
      .limit(1);
    if (!row || !row.url) return undefined;
    return { mediaAssetId: row.mediaAssetId, url: row.url };
  }

  /**
   * If `assetLinkId` is currently the location's explicitly-marked primary
   * (`data.primaryAssetLinkId`), clear that marker so resolution falls back
   * to newest-approved. A pure no-op when it is not the marker (or the
   * location can no longer be loaded) — safe to call unconditionally from
   * `transition`/`markStale`/`deleteAsset` after they change an asset's
   * approval state or remove it outright.
   */
  private async clearPrimaryMarkerIfMatches(
    owner: VerticalDramaLocationStockOwner,
    locationId: number,
    assetLinkId: number,
  ): Promise<void> {
    const data = await this.loadLocationData(owner, locationId);
    if (data === undefined) return;
    if (extractPrimaryAssetLinkIdMarker(data) !== assetLinkId) return;
    const { primaryAssetLinkId: _droppedMarker, ...rest } = (data ?? {}) as Record<string, unknown>;
    await db
      .update(verticalDramaLocations)
      .set({ data: rest, updatedAt: new Date() })
      .where(
        and(
          eq(verticalDramaLocations.id, locationId),
          eq(verticalDramaLocations.tenantId, owner.tenantId),
          eq(verticalDramaLocations.userId, owner.userId),
          eq(verticalDramaLocations.seriesId, owner.seriesId),
        ),
      );
  }

  /**
   * The location's current reference — the `establishing_plate` asset to
   * feed back into the model (as a `referenceImageUrls` entry) whenever
   * rendering another shot at the same location, so the render is
   * conditioned on the actual environment instead of relying on the text
   * prompt alone. Mirrors
   * `VerticalDramaCharacterStockService.getPrimaryPortraitUrl`'s exact query
   * shape and preference order: prefers the newest `approved` plate; falls
   * back to the newest plate of any state (a just-generated one is
   * auto-approved already, but this stays defensive for pre-auto-approve
   * rows or a rejected-then-not-yet-replaced case).
   *
   * An explicit `data.primaryAssetLinkId` marker (see
   * `resolveExplicitPrimaryReference`) takes precedence over this
   * newest-first query when it points at a still-valid asset — otherwise
   * this query runs completely UNCHANGED, so a location that has never had a
   * primary explicitly picked behaves byte-identically to before this marker
   * existed.
   */
  async getPrimaryReferenceUrl(
    owner: VerticalDramaLocationStockOwner,
    locationId: number,
  ): Promise<string | undefined> {
    const explicit = await this.resolveExplicitPrimaryReference(owner, locationId);
    if (explicit) return explicit.url;

    const [row] = await db
      .select({ url: mediaAssets.originalUrl })
      .from(verticalDramaLocationAssets)
      .innerJoin(mediaAssets, eq(verticalDramaLocationAssets.mediaAssetId, mediaAssets.id))
      .where(
        and(
          eq(verticalDramaLocationAssets.tenantId, owner.tenantId),
          eq(verticalDramaLocationAssets.userId, owner.userId),
          eq(verticalDramaLocationAssets.seriesId, owner.seriesId),
          eq(verticalDramaLocationAssets.locationId, locationId),
          eq(verticalDramaLocationAssets.role, "establishing_plate"),
        ),
      )
      .orderBy(desc(verticalDramaLocationAssets.approved), desc(verticalDramaLocationAssets.updatedAt))
      .limit(1);
    return row?.url ?? undefined;
  }

  /**
   * Same query/ordering as `getPrimaryReferenceUrl` but selects the
   * `media_assets` row's own id instead of its URL — mirrors
   * `VerticalDramaCharacterStockService.getPrimaryPortraitAssetId`. Same
   * explicit-marker precedence as `getPrimaryReferenceUrl` above.
   */
  async getPrimaryReferenceAssetId(
    owner: VerticalDramaLocationStockOwner,
    locationId: number,
  ): Promise<number | undefined> {
    const explicit = await this.resolveExplicitPrimaryReference(owner, locationId);
    if (explicit) return explicit.mediaAssetId;

    const [row] = await db
      .select({ id: mediaAssets.id })
      .from(verticalDramaLocationAssets)
      .innerJoin(mediaAssets, eq(verticalDramaLocationAssets.mediaAssetId, mediaAssets.id))
      .where(
        and(
          eq(verticalDramaLocationAssets.tenantId, owner.tenantId),
          eq(verticalDramaLocationAssets.userId, owner.userId),
          eq(verticalDramaLocationAssets.seriesId, owner.seriesId),
          eq(verticalDramaLocationAssets.locationId, locationId),
          eq(verticalDramaLocationAssets.role, "establishing_plate"),
        ),
      )
      .orderBy(desc(verticalDramaLocationAssets.approved), desc(verticalDramaLocationAssets.updatedAt))
      .limit(1);
    return row?.id ?? undefined;
  }

  /**
   * Load the durable location ROSTER for a series (tenant + user scoped) —
   * every `vertical_drama_locations` row, each annotated with a
   * `primaryReferenceUrl` (and its owning `primaryReferenceAssetLinkId`)
   * when (and only when) an APPROVED `establishing_plate` asset exists for
   * it. Deliberately stricter than `getPrimaryReferenceUrl`'s render-time
   * fallback-to-any-state behavior: a roster/listing view should never
   * surface a not-yet-reviewed image as "the" reference thumbnail for a
   * location. There is no character-stock equivalent of this method to
   * mirror directly — the character system's own `listRows` lists ASSET
   * rows, not roster rows (its roster listing lives in the character
   * ROUTER, composed separately from the asset manifest); this method
   * intentionally folds both concerns into one service-layer query since
   * the location system has no router yet.
   */
  async listRows(
    owner: VerticalDramaLocationStockOwner,
  ): Promise<
    Array<VerticalDramaLocationRow & { primaryReferenceUrl?: string; primaryReferenceAssetLinkId?: number }>
  > {
    const rosterRows: VerticalDramaLocationRow[] = await db
      .select()
      .from(verticalDramaLocations)
      .where(
        and(
          eq(verticalDramaLocations.tenantId, owner.tenantId),
          eq(verticalDramaLocations.userId, owner.userId),
          eq(verticalDramaLocations.seriesId, owner.seriesId),
        ),
      );
    if (rosterRows.length === 0) return [];

    const approvedCandidates = await db
      .select({
        id: verticalDramaLocationAssets.id,
        locationId: verticalDramaLocationAssets.locationId,
        url: mediaAssets.originalUrl,
        updatedAt: verticalDramaLocationAssets.updatedAt,
      })
      .from(verticalDramaLocationAssets)
      .innerJoin(mediaAssets, eq(verticalDramaLocationAssets.mediaAssetId, mediaAssets.id))
      .where(
        and(
          eq(verticalDramaLocationAssets.tenantId, owner.tenantId),
          eq(verticalDramaLocationAssets.userId, owner.userId),
          eq(verticalDramaLocationAssets.seriesId, owner.seriesId),
          eq(verticalDramaLocationAssets.role, "establishing_plate"),
          eq(verticalDramaLocationAssets.approved, true),
        ),
      );

    const bestByLocationId = new Map<number, { url: string; updatedAt: Date; linkId: number }>();
    // Secondary index for O(1) "is THIS candidate a valid explicit marker"
    // lookups below — keyed by the candidate's own assetLinkId (not
    // locationId), since a marker is resolved by id, not recency.
    const approvedById = new Map<number, { url: string; updatedAt: Date; locationId: number }>();
    for (const candidate of approvedCandidates) {
      if (candidate.locationId == null || !candidate.url) continue;
      const existing = bestByLocationId.get(candidate.locationId);
      if (!existing || new Date(candidate.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
        bestByLocationId.set(candidate.locationId, {
          url: candidate.url,
          updatedAt: candidate.updatedAt,
          linkId: candidate.id,
        });
      }
      approvedById.set(candidate.id, {
        url: candidate.url,
        updatedAt: candidate.updatedAt,
        locationId: candidate.locationId,
      });
    }

    return rosterRows.map((row) => {
      // An explicit, still-valid `data.primaryAssetLinkId` marker overrides
      // the newest-approved pick above; an unset/invalid marker leaves
      // `bestByLocationId`'s pick (the pre-existing, unchanged fallback)
      // completely untouched.
      const marker = extractPrimaryAssetLinkIdMarker(row.data);
      const markedCandidate = marker != null ? approvedById.get(marker) : undefined;
      const best =
        markedCandidate && markedCandidate.locationId === row.id
          ? { url: markedCandidate.url, linkId: marker }
          : bestByLocationId.get(row.id);
      return {
        ...row,
        primaryReferenceUrl: best?.url,
        primaryReferenceAssetLinkId: best?.linkId,
      };
    });
  }

  /**
   * ALL `establishing_plate` candidate images for one location (approved and
   * not), newest-updated first, each flagged with `isPrimary` per this
   * file's marker-resolution rule — backs the Location Visual Bible's
   * "multiple candidates, pick one primary" gallery (mirrors, in SPIRIT
   * only, how the character system lets a user keep several images; a
   * location is a flat slot with several candidate images, never a
   * variant/twin graph — see this file's own top-of-file doc comment).
   *
   * Rows with no resolvable `media_assets.originalUrl` (e.g. a link whose
   * media asset was hard-deleted, FK `set null`-ing `mediaAssetId`) are
   * filtered out before ranking/returning — same defensive convention
   * `VerticalDramaCharacterStockService.getCharacterReferenceUrls` uses for
   * its own sheet-asset query.
   */
  async listLocationAssets(
    owner: VerticalDramaLocationStockOwner,
    locationId: number,
  ): Promise<
    Array<{
      assetLinkId: number;
      mediaAssetId: number;
      url: string;
      approved: boolean;
      isPrimary: boolean;
      role: string | null;
      metadata: Record<string, unknown> | null;
      updatedAt: Date;
    }>
  > {
    const marker = extractPrimaryAssetLinkIdMarker(await this.loadLocationData(owner, locationId));

    type CandidateRow = {
      id: number;
      mediaAssetId: number;
      url: string | null;
      approved: boolean;
      role: string | null;
      metadata: Record<string, unknown> | null;
      updatedAt: Date;
    };
    const candidateRows: CandidateRow[] = await db
      .select({
        id: verticalDramaLocationAssets.id,
        mediaAssetId: mediaAssets.id,
        url: mediaAssets.originalUrl,
        approved: verticalDramaLocationAssets.approved,
        role: verticalDramaLocationAssets.role,
        metadata: verticalDramaLocationAssets.metadata,
        updatedAt: verticalDramaLocationAssets.updatedAt,
      })
      .from(verticalDramaLocationAssets)
      .innerJoin(mediaAssets, eq(verticalDramaLocationAssets.mediaAssetId, mediaAssets.id))
      .where(
        and(
          eq(verticalDramaLocationAssets.tenantId, owner.tenantId),
          eq(verticalDramaLocationAssets.userId, owner.userId),
          eq(verticalDramaLocationAssets.seriesId, owner.seriesId),
          eq(verticalDramaLocationAssets.locationId, locationId),
        ),
      )
      .orderBy(desc(verticalDramaLocationAssets.updatedAt));

    const rows = candidateRows.filter(
      (r: CandidateRow): r is CandidateRow & { url: string } => typeof r.url === "string" && r.url.length > 0,
    );

    // Resolve which single row (if any) is "the" primary in THIS result set
    // — explicit marker wins when it points at a still-approved row here;
    // otherwise the newest approved row wins. Byte-identical precedence to
    // `listRows`'s own marker-then-newest-approved fallback, just computed
    // locally against the rows already fetched above instead of a second
    // round-trip.
    let primaryId: number | undefined;
    const roleScopedPrimaryCandidates = rows.filter(r => r.role === "establishing_plate");
    // Older rows and lightweight consumers may not project the additive role
    // field. Preserve the pre-coverage primary selection in that case; once a
    // role is present, only establishing plates can become the default.
    const primaryCandidates = roleScopedPrimaryCandidates.length > 0
      ? roleScopedPrimaryCandidates
      : rows;
    if (marker != null && primaryCandidates.some((r) => r.id === marker && r.approved)) {
      primaryId = marker;
    } else {
      let bestUpdatedAt = -Infinity;
      for (const r of primaryCandidates) {
        if (!r.approved) continue;
        const t = new Date(r.updatedAt).getTime();
        if (t > bestUpdatedAt) {
          bestUpdatedAt = t;
          primaryId = r.id;
        }
      }
    }

    return rows.map((r) => ({
      assetLinkId: r.id,
      mediaAssetId: r.mediaAssetId,
      url: r.url,
      approved: r.approved,
      isPrimary: r.id === primaryId,
      role: r.role,
      metadata: r.metadata,
      updatedAt: r.updatedAt,
    }));
  }

  /**
   * Explicitly pick which candidate `establishing_plate` image is a
   * location's primary reference — writes `data.primaryAssetLinkId` on the
   * `vertical_drama_locations` row (merged into the existing `data`, never
   * clobbering `description`/other keys). Only an already-APPROVED
   * `establishing_plate` asset belonging to this exact location (tenant +
   * user + series scoped) can be marked primary — generating additional
   * candidates therefore never silently changes an explicitly-set primary;
   * it stays pinned until the caller changes it or the marked asset is
   * deleted/un-approved (see `clearPrimaryMarkerIfMatches`, wired into
   * `deleteAsset`/`transition`/`markStale` above).
   */
  async setPrimaryAsset(
    owner: VerticalDramaLocationStockOwner,
    locationId: number,
    assetLinkId: number,
  ): Promise<void> {
    const row = await this.loadOwnedRow(owner, assetLinkId);
    if (row.locationId !== locationId) {
      throw new VerticalDramaLocationStockError("asset_not_found", "Location asset not found");
    }
    if (row.role !== "establishing_plate") {
      throw new VerticalDramaLocationStockError(
        "asset_wrong_role",
        "Only establishing_plate assets can be set as the primary reference",
      );
    }
    if (!row.approved) {
      throw new VerticalDramaLocationStockError(
        "asset_not_approved",
        "Only an approved asset can be set as the primary reference",
      );
    }
    if (row.mediaAssetId == null) {
      throw new VerticalDramaLocationStockError("asset_not_found", "Location asset has no linked media asset");
    }

    const existingData = await this.loadLocationData(owner, locationId);
    if (existingData === undefined) {
      throw new VerticalDramaLocationStockError("asset_not_found", "Location not found");
    }
    await db
      .update(verticalDramaLocations)
      .set({
        data: { ...(existingData ?? {}), primaryAssetLinkId: assetLinkId },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(verticalDramaLocations.id, locationId),
          eq(verticalDramaLocations.tenantId, owner.tenantId),
          eq(verticalDramaLocations.userId, owner.userId),
          eq(verticalDramaLocations.seriesId, owner.seriesId),
        ),
      );
  }
}

/** Shared singleton. */
export const verticalDramaLocationStockService = new VerticalDramaLocationStockService();
