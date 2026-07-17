/**
 * Vertical Drama Series — per-shot reference image service (storyboard-complete
 * plan, Phase 2, section-2.2).
 *
 * Each of the 9 storyboard shots in an episode has exactly one primary start
 * frame today (`episodes.startFramePlan.frames[i].approvedMediaAssetId`).
 * This service manages an ADDITIONAL, per-shot set of reference images (from
 * 3x3 grid cuts, generation history, the media library, or direct upload)
 * that are sent as `reference_images` to video generation alongside the
 * approved start frame. It never touches `approvedMediaAssetId` or the
 * episode's JSONB plans — those stay owned by the episode pipeline/router.
 *
 * Every row points at a canonical `media_assets` row (never a provider URL)
 * and is scoped to `(tenantId, userId, seriesId, episodeId)` so a user can
 * never attach, read, or delete another tenant's or user's shot references.
 * Mirrors the ownership-guard and link/delete pattern established by
 * `verticalDramaCharacterStock.ts`.
 */

import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  verticalDramaShotReferences,
  verticalDramaEpisodes,
  mediaAssets,
  type VerticalDramaShotReferenceRow,
} from "../../drizzle/schema";
import { VERTICAL_DRAMA_UNATTACHABLE_MEDIA_ASSET_STATUSES } from "./verticalDramaCharacterStock";

/* -------------------------------------------------------------------------- */
/* Ownership / param types                                                    */
/* -------------------------------------------------------------------------- */

export interface VerticalDramaShotReferenceOwner {
  tenantId: string;
  userId: number;
  seriesId: number;
}

/** Machine-readable role tag — mirrors the DB column's allowed values. */
export type VerticalDramaShotReferenceRole = "start_frame" | "reference";

/** Where the reference image originated from (client-reported, informational).
 *  `"previous_main"` (storyboard-complete plan, main-image-swap-history
 *  upgrade) marks a reference row created by auto-demoting a shot's PREVIOUS
 *  `approvedMediaAssetId` when the user swaps in a different main image —
 *  distinguishes an auto-demoted row from one the user deliberately added
 *  via grid-cut/history/library/upload, purely for display/analytics; it is
 *  never validated differently by this service. Column is `varchar(20)` with
 *  no DB CHECK constraint, so this is purely additive.
 *  `"reference_frame"` (`planning/vd-start-frame-reference-mapping/plan.md`
 *  Phase 6, 2026-07-16) marks a user-controlled supplementary reference
 *  frame — generated via `generateShotReferenceFrameImage`
 *  (`verticalDramaEpisodes.ts`) and linked here by the CLIENT once the user
 *  confirms the render, same link flow as every other source. 16 chars,
 *  fits the existing `varchar(20)` column — no migration needed. */
export type VerticalDramaShotReferenceSource =
  | "generated"
  | "grid_cut"
  | "history"
  | "library"
  | "upload"
  | "previous_main"
  | "reference_frame";

export type ShotReferenceRejectionReason =
  | "episode_not_found"
  | "media_asset_not_found"
  | "media_asset_cross_tenant"
  | "media_asset_cross_user"
  | "media_asset_deleted"
  | "reference_not_found";

export class VerticalDramaShotReferenceError extends Error {
  constructor(
    public readonly reason: ShotReferenceRejectionReason,
    message: string,
  ) {
    super(message);
    this.name = "VerticalDramaShotReferenceError";
  }
}

export interface LinkShotReferenceParams extends VerticalDramaShotReferenceOwner {
  episodeId: number;
  shotNumber: number;
  mediaAssetId: number;
  role?: VerticalDramaShotReferenceRole;
  source: VerticalDramaShotReferenceSource;
  sortOrder?: number;
}

export interface ReorderShotReferencesParams extends VerticalDramaShotReferenceOwner {
  episodeId: number;
  shotNumber: number;
  /** Ordered list of reference row ids — index in the array becomes the new sortOrder. */
  orderedReferenceIds: number[];
}

/** Browser-safe projection of a shot reference row, with a joined thumbnail URL. */
export interface VerticalDramaShotReferenceContract {
  referenceId: string;
  seriesId: string;
  episodeId: string;
  shotNumber: number;
  mediaAssetId: string;
  role: VerticalDramaShotReferenceRole;
  source: VerticalDramaShotReferenceSource;
  sortOrder: number;
  createdAt: string;
  thumbnailUrl?: string;
}

/** Shot references grouped by shot number, in `sortOrder` then `createdAt` order within each shot. */
export type VerticalDramaShotReferenceManifest = Record<number, VerticalDramaShotReferenceContract[]>;

/* -------------------------------------------------------------------------- */
/* Pure row <-> contract mapping                                              */
/* -------------------------------------------------------------------------- */

export function shotReferenceRowToContract(
  row: VerticalDramaShotReferenceRow,
  thumbnailUrl?: string | null,
): VerticalDramaShotReferenceContract {
  return {
    referenceId: String(row.id),
    seriesId: String(row.seriesId),
    episodeId: String(row.episodeId),
    shotNumber: row.shotNumber,
    mediaAssetId: String(row.mediaAssetId),
    role: (row.role as VerticalDramaShotReferenceRole) ?? "reference",
    source: row.source as VerticalDramaShotReferenceSource,
    sortOrder: row.sortOrder,
    createdAt: toIso(row.createdAt),
    thumbnailUrl: thumbnailUrl ?? undefined,
  };
}

function toIso(v: Date | string): string {
  return (v instanceof Date ? v : new Date(v)).toISOString();
}

/** Pure grouping helper — testable without a database. */
export function buildShotReferenceManifest(
  rows: VerticalDramaShotReferenceContract[],
): VerticalDramaShotReferenceManifest {
  const manifest: VerticalDramaShotReferenceManifest = {};
  for (const row of rows) {
    const bucket = manifest[row.shotNumber] ?? (manifest[row.shotNumber] = []);
    bucket.push(row);
  }
  for (const shotNumber of Object.keys(manifest)) {
    manifest[Number(shotNumber)].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.createdAt.localeCompare(b.createdAt);
    });
  }
  return manifest;
}

/* -------------------------------------------------------------------------- */
/* Service (DB-backed)                                                         */
/* -------------------------------------------------------------------------- */

export class VerticalDramaShotReferencesService {
  /**
   * Verify the episode belongs to the caller's tenant + user + series before
   * any read/write. Throws `episode_not_found` otherwise (NOT-FOUND semantics
   * at the router boundary — never disclose cross-tenant/cross-user existence).
   */
  private async assertEpisodeOwned(
    owner: VerticalDramaShotReferenceOwner,
    episodeId: number,
  ): Promise<void> {
    const [row] = await db
      .select({ id: verticalDramaEpisodes.id })
      .from(verticalDramaEpisodes)
      .where(
        and(
          eq(verticalDramaEpisodes.id, episodeId),
          eq(verticalDramaEpisodes.tenantId, owner.tenantId),
          eq(verticalDramaEpisodes.userId, owner.userId),
          eq(verticalDramaEpisodes.seriesId, owner.seriesId),
        ),
      )
      .limit(1);
    if (!row) {
      throw new VerticalDramaShotReferenceError("episode_not_found", "Episode not found");
    }
  }

  /**
   * Validate that `mediaAssetId` is attachable: it must exist, belong to the
   * caller's tenant AND user, and not be in a deleted/failed/purged state.
   *
   * The primary lookup is scoped to `(id, tenantId, userId)` directly in the
   * SQL `WHERE` clause — ownership is never decided in application code after
   * an unscoped-by-owner fetch. A second, id-only lookup is only ever issued
   * when the scoped query misses, and ONLY to produce the correct rejection
   * reason (not-found vs cross-tenant vs cross-user vs deleted) for
   * diagnostics/telemetry — it never changes the accept/reject outcome.
   */
  private async assertMediaAssetAttachable(
    owner: VerticalDramaShotReferenceOwner,
    mediaAssetId: number,
  ): Promise<void> {
    const [scopedRow] = await db
      .select({
        id: mediaAssets.id,
        status: mediaAssets.status,
      })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.id, mediaAssetId),
          eq(mediaAssets.tenantId, owner.tenantId),
          eq(mediaAssets.userId, owner.userId),
        ),
      )
      .limit(1);

    if (!scopedRow) {
      // Not owned by this tenant+user — determine why purely for the error
      // reason (never to change the outcome, which is already "reject").
      const [unscopedRow] = await db
        .select({
          id: mediaAssets.id,
          tenantId: mediaAssets.tenantId,
          userId: mediaAssets.userId,
        })
        .from(mediaAssets)
        .where(eq(mediaAssets.id, mediaAssetId))
        .limit(1);

      if (!unscopedRow) {
        throw new VerticalDramaShotReferenceError(
          "media_asset_not_found",
          "Referenced media asset does not exist",
        );
      }
      if (unscopedRow.tenantId !== owner.tenantId) {
        throw new VerticalDramaShotReferenceError(
          "media_asset_cross_tenant",
          "Referenced media asset belongs to another tenant",
        );
      }
      throw new VerticalDramaShotReferenceError(
        "media_asset_cross_user",
        "Referenced media asset belongs to another user",
      );
    }

    if (
      scopedRow.status &&
      VERTICAL_DRAMA_UNATTACHABLE_MEDIA_ASSET_STATUSES.includes(scopedRow.status)
    ) {
      throw new VerticalDramaShotReferenceError(
        "media_asset_deleted",
        `Referenced media asset is not attachable (status=${scopedRow.status})`,
      );
    }
  }

  /**
   * Load every reference row for an episode (tenant + user + series scoped),
   * left-joined against `media_assets` for a read-only thumbnail URL, grouped
   * by shot number and ordered by `sortOrder` then `createdAt` within a shot.
   */
  async listForEpisode(
    owner: VerticalDramaShotReferenceOwner,
    episodeId: number,
  ): Promise<VerticalDramaShotReferenceManifest> {
    await this.assertEpisodeOwned(owner, episodeId);
    const rows = await db
      .select({
        id: verticalDramaShotReferences.id,
        tenantId: verticalDramaShotReferences.tenantId,
        userId: verticalDramaShotReferences.userId,
        seriesId: verticalDramaShotReferences.seriesId,
        episodeId: verticalDramaShotReferences.episodeId,
        shotNumber: verticalDramaShotReferences.shotNumber,
        mediaAssetId: verticalDramaShotReferences.mediaAssetId,
        role: verticalDramaShotReferences.role,
        source: verticalDramaShotReferences.source,
        sortOrder: verticalDramaShotReferences.sortOrder,
        createdAt: verticalDramaShotReferences.createdAt,
        thumbnailUrl: mediaAssets.originalUrl,
      })
      .from(verticalDramaShotReferences)
      .leftJoin(mediaAssets, eq(verticalDramaShotReferences.mediaAssetId, mediaAssets.id))
      .where(
        and(
          eq(verticalDramaShotReferences.tenantId, owner.tenantId),
          eq(verticalDramaShotReferences.userId, owner.userId),
          eq(verticalDramaShotReferences.seriesId, owner.seriesId),
          eq(verticalDramaShotReferences.episodeId, episodeId),
        ),
      )
      .orderBy(asc(verticalDramaShotReferences.shotNumber), asc(verticalDramaShotReferences.sortOrder));

    return buildShotReferenceManifest(
      rows.map((row: typeof rows[number]) =>
        shotReferenceRowToContract(row as VerticalDramaShotReferenceRow, row.thumbnailUrl),
      ),
    );
  }

  /** Load the reference rows for a single shot only (used by video-generation call sites). */
  async listForShot(
    owner: VerticalDramaShotReferenceOwner,
    episodeId: number,
    shotNumber: number,
  ): Promise<VerticalDramaShotReferenceContract[]> {
    const manifest = await this.listForEpisode(owner, episodeId);
    return manifest[shotNumber] ?? [];
  }

  /**
   * Link a new reference image into a shot's reference set. Idempotent on the
   * `(episodeId, shotNumber, mediaAssetId)` unique key — linking the same
   * asset to the same shot twice returns the existing row unchanged rather
   * than throwing, so a retried client call (e.g. after a network blip) is
   * always safe.
   */
  async linkReference(params: LinkShotReferenceParams): Promise<VerticalDramaShotReferenceContract> {
    await this.assertEpisodeOwned(params, params.episodeId);
    await this.assertMediaAssetAttachable(params, params.mediaAssetId);

    const [existing] = await db
      .select()
      .from(verticalDramaShotReferences)
      .where(
        and(
          eq(verticalDramaShotReferences.tenantId, params.tenantId),
          eq(verticalDramaShotReferences.userId, params.userId),
          eq(verticalDramaShotReferences.seriesId, params.seriesId),
          eq(verticalDramaShotReferences.episodeId, params.episodeId),
          eq(verticalDramaShotReferences.shotNumber, params.shotNumber),
          eq(verticalDramaShotReferences.mediaAssetId, params.mediaAssetId),
        ),
      )
      .limit(1);
    if (existing) {
      return shotReferenceRowToContract(existing as VerticalDramaShotReferenceRow);
    }

    const [row] = await db
      .insert(verticalDramaShotReferences)
      .values({
        tenantId: params.tenantId,
        userId: params.userId,
        seriesId: params.seriesId,
        episodeId: params.episodeId,
        shotNumber: params.shotNumber,
        mediaAssetId: params.mediaAssetId,
        role: params.role ?? "reference",
        source: params.source,
        sortOrder: params.sortOrder ?? 0,
      } as typeof verticalDramaShotReferences.$inferInsert)
      .returning();
    return shotReferenceRowToContract(row as VerticalDramaShotReferenceRow);
  }

  /**
   * Remove a shot's reference row for a specific `mediaAssetId`, if one
   * exists — used to de-duplicate the reference strip when that same asset
   * is PROMOTED to be the shot's new main image (main-image-swap-history
   * upgrade): the asset should appear as the main image, not also sit in the
   * reference strip. A no-op (returns `false`) when no such reference row
   * exists, so callers can always call this unconditionally on promotion
   * without checking first.
   */
  async unlinkReferenceByAsset(
    owner: VerticalDramaShotReferenceOwner,
    episodeId: number,
    shotNumber: number,
    mediaAssetId: number,
  ): Promise<boolean> {
    const deleted = await db
      .delete(verticalDramaShotReferences)
      .where(
        and(
          eq(verticalDramaShotReferences.tenantId, owner.tenantId),
          eq(verticalDramaShotReferences.userId, owner.userId),
          eq(verticalDramaShotReferences.seriesId, owner.seriesId),
          eq(verticalDramaShotReferences.episodeId, episodeId),
          eq(verticalDramaShotReferences.shotNumber, shotNumber),
          eq(verticalDramaShotReferences.mediaAssetId, mediaAssetId),
        ),
      )
      .returning({ id: verticalDramaShotReferences.id });
    return deleted.length > 0;
  }

  private async loadOwnedRow(
    owner: VerticalDramaShotReferenceOwner,
    referenceId: number,
  ): Promise<VerticalDramaShotReferenceRow> {
    const [row] = await db
      .select()
      .from(verticalDramaShotReferences)
      .where(
        and(
          eq(verticalDramaShotReferences.id, referenceId),
          eq(verticalDramaShotReferences.tenantId, owner.tenantId),
          eq(verticalDramaShotReferences.userId, owner.userId),
          eq(verticalDramaShotReferences.seriesId, owner.seriesId),
        ),
      )
      .limit(1);
    if (!row) {
      throw new VerticalDramaShotReferenceError("reference_not_found", "Shot reference not found");
    }
    return row as VerticalDramaShotReferenceRow;
  }

  /**
   * Permanently remove a reference image from a shot's reference set. Only
   * removes the `verticalDramaShotReferences` link row — the underlying
   * `media_assets` row is left untouched (it may still be referenced from
   * Media History/Library or as another shot's primary start frame).
   */
  async deleteReference(
    owner: VerticalDramaShotReferenceOwner,
    referenceId: number,
  ): Promise<void> {
    await this.loadOwnedRow(owner, referenceId);
    await db
      .delete(verticalDramaShotReferences)
      .where(
        and(
          eq(verticalDramaShotReferences.id, referenceId),
          eq(verticalDramaShotReferences.tenantId, owner.tenantId),
          eq(verticalDramaShotReferences.userId, owner.userId),
          eq(verticalDramaShotReferences.seriesId, owner.seriesId),
        ),
      );
  }

  /**
   * Re-order the reference strip for a single shot. `orderedReferenceIds`
   * must be the complete, ordered list of reference ids for that shot — its
   * array index becomes the persisted `sortOrder`. Ids not owned by the
   * caller (wrong tenant/user/series/episode/shot) are skipped rather than
   * throwing, so a stale client list can't be used to touch another shot's
   * or another owner's rows.
   */
  async reorder(params: ReorderShotReferencesParams): Promise<VerticalDramaShotReferenceContract[]> {
    await this.assertEpisodeOwned(params, params.episodeId);
    const rows: VerticalDramaShotReferenceRow[] = await db
      .select()
      .from(verticalDramaShotReferences)
      .where(
        and(
          eq(verticalDramaShotReferences.tenantId, params.tenantId),
          eq(verticalDramaShotReferences.userId, params.userId),
          eq(verticalDramaShotReferences.seriesId, params.seriesId),
          eq(verticalDramaShotReferences.episodeId, params.episodeId),
          eq(verticalDramaShotReferences.shotNumber, params.shotNumber),
        ),
      );
    const ownedIds = new Set(rows.map((r: VerticalDramaShotReferenceRow) => r.id));
    const updated: VerticalDramaShotReferenceRow[] = [];
    let nextSortOrder = 0;
    for (const referenceId of params.orderedReferenceIds) {
      if (!ownedIds.has(referenceId)) continue;
      const [row] = await db
        .update(verticalDramaShotReferences)
        .set({ sortOrder: nextSortOrder })
        .where(
          and(
            eq(verticalDramaShotReferences.id, referenceId),
            eq(verticalDramaShotReferences.tenantId, params.tenantId),
            eq(verticalDramaShotReferences.userId, params.userId),
          ),
        )
        .returning();
      if (row) updated.push(row as VerticalDramaShotReferenceRow);
      nextSortOrder += 1;
    }
    return updated
      .map((row) => shotReferenceRowToContract(row))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
}

/** Shared singleton. */
export const verticalDramaShotReferencesService = new VerticalDramaShotReferencesService();
