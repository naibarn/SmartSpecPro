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
      | "asset_wrong_role",
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
    await this.loadOwnedRow(owner, assetLinkId);
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
   */
  async getPrimaryReferenceUrl(
    owner: VerticalDramaLocationStockOwner,
    locationId: number,
  ): Promise<string | undefined> {
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
   * `VerticalDramaCharacterStockService.getPrimaryPortraitAssetId`.
   */
  async getPrimaryReferenceAssetId(
    owner: VerticalDramaLocationStockOwner,
    locationId: number,
  ): Promise<number | undefined> {
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
   * `primaryReferenceUrl` when (and only when) an APPROVED
   * `establishing_plate` asset exists for it. Deliberately stricter than
   * `getPrimaryReferenceUrl`'s render-time fallback-to-any-state behavior: a
   * roster/listing view should never surface a not-yet-reviewed image as
   * "the" reference thumbnail for a location. There is no character-stock
   * equivalent of this method to mirror directly — the character system's
   * own `listRows` lists ASSET rows, not roster rows (its roster listing
   * lives in the character ROUTER, composed separately from the asset
   * manifest); this method intentionally folds both concerns into one
   * service-layer query since the location system has no router yet.
   */
  async listRows(
    owner: VerticalDramaLocationStockOwner,
  ): Promise<Array<VerticalDramaLocationRow & { primaryReferenceUrl?: string }>> {
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

    const bestByLocationId = new Map<number, { url: string; updatedAt: Date }>();
    for (const candidate of approvedCandidates) {
      if (candidate.locationId == null || !candidate.url) continue;
      const existing = bestByLocationId.get(candidate.locationId);
      if (!existing || new Date(candidate.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
        bestByLocationId.set(candidate.locationId, { url: candidate.url, updatedAt: candidate.updatedAt });
      }
    }

    return rosterRows.map((row) => ({
      ...row,
      primaryReferenceUrl: bestByLocationId.get(row.id)?.url,
    }));
  }
}

/** Shared singleton. */
export const verticalDramaLocationStockService = new VerticalDramaLocationStockService();
