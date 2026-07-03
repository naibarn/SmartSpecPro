/**
 * Vertical Drama Series — durable character-stock service (spec feature 131, section-05, §7.1/§7.3).
 *
 * Owns the durable per-series character reference stock: the asset manifest,
 * the approval / QC lifecycle, and the state machine that drives it. Every
 * asset link points at a canonical `media_assets` row (never a provider URL)
 * and is scoped to `(tenantId, userId, seriesId)` so a user can never attach,
 * read, or approve another tenant's or user's asset.
 *
 * Cross-tenant / deleted media assets are rejected at attach time — the linked
 * `media_assets` row must exist under the same tenant + user and must not be in
 * a `deleted` / `failed` state.
 *
 * Pure helpers (manifest projection, staleness fan-out) live at module scope so
 * they are unit-testable without a database; the DB-backed persistence lives on
 * `VerticalDramaCharacterStockService`.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  verticalDramaCharacterAssets,
  mediaAssets,
  type VerticalDramaCharacterAssetRow,
} from "../../drizzle/schema";
import {
  canTransitionCharacterAssetState,
  transitionCharacterAssetState,
  stagesInvalidatedByCharacterRefChange,
  type VerticalDramaCharacterAsset,
  type VerticalDramaCharacterAssetManifest,
  type VerticalDramaCharacterAssetState,
  type VerticalDramaCharacterAssetSource,
  type VerticalDramaCharacterRefStaleTarget,
} from "@shared/verticalDramaSeries";
import type { VerticalDramaPipelineStage } from "@shared/verticalDramaSeries";

/* -------------------------------------------------------------------------- */
/* Ownership / param types                                                    */
/* -------------------------------------------------------------------------- */

export interface VerticalDramaCharacterStockOwner {
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

export type AttachMediaAssetRejectionReason =
  | "media_asset_not_found"
  | "media_asset_cross_tenant"
  | "media_asset_cross_user"
  | "media_asset_deleted";

export class VerticalDramaCharacterStockError extends Error {
  constructor(
    public readonly reason: AttachMediaAssetRejectionReason | "illegal_state_transition" | "asset_not_found",
    message: string,
  ) {
    super(message);
    this.name = "VerticalDramaCharacterStockError";
  }
}

export interface LinkCharacterAssetParams extends VerticalDramaCharacterStockOwner {
  characterId?: number | null;
  /** Canonical media_assets id to attach. Must be owned + not deleted. */
  mediaAssetId?: number | null;
  assetType: "character_reference" | "product_reference" | string;
  role?: string | null;
  source: VerticalDramaCharacterAssetSource;
  containsHumanFace?: boolean | null;
  checksumSha256?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface TransitionCharacterAssetParams extends VerticalDramaCharacterStockOwner {
  assetLinkId: number;
  to: VerticalDramaCharacterAssetState;
  rejectionReason?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Pure row <-> contract mapping                                              */
/* -------------------------------------------------------------------------- */

/** Derive the coarse lifecycle state from the durable row's flags. */
export function deriveCharacterAssetState(
  row: Pick<VerticalDramaCharacterAssetRow, "approved" | "qcStatus" | "metadata">,
): VerticalDramaCharacterAssetState {
  const meta = (row.metadata as { state?: string } | null) ?? null;
  if (meta?.state && isCharacterAssetState(meta.state)) return meta.state;
  if (row.approved) return "approved";
  if (row.qcStatus === "failed" || row.qcStatus === "needs_repair") return "rejected";
  return "draft";
}

function isCharacterAssetState(v: string): v is VerticalDramaCharacterAssetState {
  return (
    v === "draft" ||
    v === "generated" ||
    v === "imported" ||
    v === "approved" ||
    v === "rejected" ||
    v === "stale"
  );
}

export function characterAssetRowToContract(
  row: VerticalDramaCharacterAssetRow,
): VerticalDramaCharacterAsset {
  const meta = (row.metadata as Record<string, unknown> | null) ?? {};
  const state = deriveCharacterAssetState(row);
  return {
    assetLinkId: String(row.id),
    seriesId: String(row.seriesId),
    characterId: row.characterId != null ? String(row.characterId) : "",
    characterKey: typeof meta.characterKey === "string" ? meta.characterKey : undefined,
    mediaAssetId: row.mediaAssetId != null ? String(row.mediaAssetId) : undefined,
    assetType: row.assetType,
    role: row.role ?? undefined,
    state,
    approved: row.approved,
    containsHumanFace: row.containsHumanFace ?? undefined,
    qcStatus: (row.qcStatus as VerticalDramaCharacterAsset["qcStatus"]) ?? "pending",
    checksumSha256: row.checksumSha256 ?? undefined,
    source: (typeof meta.source === "string"
      ? (meta.source as VerticalDramaCharacterAssetSource)
      : "imported"),
    rejectionReason: typeof meta.rejectionReason === "string" ? meta.rejectionReason : undefined,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toIso(v: Date | string): string {
  return (v instanceof Date ? v : new Date(v)).toISOString();
}

/** Pure manifest projection — testable without a database (section-05 test). */
export function buildCharacterAssetManifest(
  seriesId: number | string,
  assets: VerticalDramaCharacterAsset[],
): VerticalDramaCharacterAssetManifest {
  let approvedCount = 0;
  let pendingCount = 0;
  let staleCount = 0;
  let updatedAt = new Date(0).toISOString();
  for (const a of assets) {
    if (a.state === "approved") approvedCount += 1;
    else if (a.state === "stale") staleCount += 1;
    else if (a.state === "draft" || a.state === "generated" || a.state === "imported") pendingCount += 1;
    if (a.updatedAt > updatedAt) updatedAt = a.updatedAt;
  }
  return {
    seriesId: String(seriesId),
    assets,
    approvedCount,
    pendingCount,
    staleCount,
    updatedAt,
  };
}

/**
 * Downstream stages a character-reference change invalidates. Storyboard,
 * start-frame, and motion-prompt stages always go stale (section-05 test).
 */
export function characterRefChangeStaleTargets(): {
  coarse: VerticalDramaCharacterRefStaleTarget[];
  pipelineStages: VerticalDramaPipelineStage[];
} {
  return stagesInvalidatedByCharacterRefChange();
}

/* -------------------------------------------------------------------------- */
/* Service (DB-backed)                                                         */
/* -------------------------------------------------------------------------- */

export class VerticalDramaCharacterStockService {
  /**
   * Validate that `mediaAssetId` is attachable: it must exist, belong to the
   * caller's tenant AND user, and not be in a deleted/failed state. Throws a
   * `VerticalDramaCharacterStockError` with a machine-readable reason otherwise.
   */
  async assertMediaAssetAttachable(
    owner: VerticalDramaCharacterStockOwner,
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
      throw new VerticalDramaCharacterStockError(
        "media_asset_not_found",
        "Referenced media asset does not exist",
      );
    }
    if (row.tenantId !== owner.tenantId) {
      // NOT-FOUND semantics preferred at the router boundary; the service uses a
      // precise reason so callers never disclose cross-tenant existence.
      throw new VerticalDramaCharacterStockError(
        "media_asset_cross_tenant",
        "Referenced media asset belongs to another tenant",
      );
    }
    if (row.userId !== owner.userId) {
      throw new VerticalDramaCharacterStockError(
        "media_asset_cross_user",
        "Referenced media asset belongs to another user",
      );
    }
    if (row.status && VERTICAL_DRAMA_UNATTACHABLE_MEDIA_ASSET_STATUSES.includes(row.status)) {
      throw new VerticalDramaCharacterStockError(
        "media_asset_deleted",
        `Referenced media asset is not attachable (status=${row.status})`,
      );
    }
  }

  /** Load the durable stock rows for a series (tenant + user scoped). */
  async listRows(owner: VerticalDramaCharacterStockOwner): Promise<VerticalDramaCharacterAssetRow[]> {
    return db
      .select()
      .from(verticalDramaCharacterAssets)
      .where(
        and(
          eq(verticalDramaCharacterAssets.tenantId, owner.tenantId),
          eq(verticalDramaCharacterAssets.userId, owner.userId),
          eq(verticalDramaCharacterAssets.seriesId, owner.seriesId),
        ),
      );
  }

  /** Build the browser-safe per-series character-asset manifest. */
  async getManifest(
    owner: VerticalDramaCharacterStockOwner,
  ): Promise<VerticalDramaCharacterAssetManifest> {
    const rows = await this.listRows(owner);
    return buildCharacterAssetManifest(
      owner.seriesId,
      rows.map(characterAssetRowToContract),
    );
  }

  /**
   * Link a new character/product reference asset into the durable stock. The
   * `media_assets` row (when provided) is validated for tenant+user ownership
   * and non-deleted status before insert (cross-tenant/deleted are rejected).
   * The new link starts in `draft` (generated/imported settle its initial
   * lifecycle via a subsequent transition) — approval is never implicit.
   */
  async linkAsset(params: LinkCharacterAssetParams): Promise<VerticalDramaCharacterAsset> {
    if (params.mediaAssetId != null) {
      await this.assertMediaAssetAttachable(params, params.mediaAssetId);
    }
    const initialState: VerticalDramaCharacterAssetState =
      params.source === "generated" ? "generated" : "imported";
    const [row] = await db
      .insert(verticalDramaCharacterAssets)
      .values({
        tenantId: params.tenantId,
        userId: params.userId,
        seriesId: params.seriesId,
        characterId: params.characterId ?? null,
        mediaAssetId: params.mediaAssetId ?? null,
        assetType: params.assetType,
        role: params.role ?? null,
        approved: false,
        containsHumanFace: params.containsHumanFace ?? null,
        qcStatus: "pending",
        checksumSha256: params.checksumSha256 ?? null,
        metadata: {
          ...(params.metadata ?? {}),
          state: initialState,
          source: params.source,
        },
      } as typeof verticalDramaCharacterAssets.$inferInsert)
      .returning();
    return characterAssetRowToContract(row as VerticalDramaCharacterAssetRow);
  }

  private async loadOwnedRow(
    owner: VerticalDramaCharacterStockOwner,
    assetLinkId: number,
  ): Promise<VerticalDramaCharacterAssetRow> {
    const [row] = await db
      .select()
      .from(verticalDramaCharacterAssets)
      .where(
        and(
          eq(verticalDramaCharacterAssets.id, assetLinkId),
          eq(verticalDramaCharacterAssets.tenantId, owner.tenantId),
          eq(verticalDramaCharacterAssets.userId, owner.userId),
          eq(verticalDramaCharacterAssets.seriesId, owner.seriesId),
        ),
      )
      .limit(1);
    if (!row) {
      throw new VerticalDramaCharacterStockError("asset_not_found", "Character asset not found");
    }
    return row;
  }

  /**
   * Apply a lifecycle transition (draft -> generated/imported -> approved /
   * rejected / stale). Illegal transitions throw. Approval requires an explicit
   * `to: "approved"` call — the state machine forbids skipping review.
   */
  async transition(params: TransitionCharacterAssetParams): Promise<VerticalDramaCharacterAsset> {
    const row = await this.loadOwnedRow(params, params.assetLinkId);
    const from = deriveCharacterAssetState(row);
    if (!canTransitionCharacterAssetState(from, params.to)) {
      throw new VerticalDramaCharacterStockError(
        "illegal_state_transition",
        `illegal_character_asset_transition: ${from} -> ${params.to}`,
      );
    }
    const next = transitionCharacterAssetState(from, params.to);
    const meta: Record<string, unknown> = {
      ...((row.metadata as Record<string, unknown> | null) ?? {}),
      state: next,
    };
    if (params.rejectionReason != null) meta.rejectionReason = params.rejectionReason;
    const [updated] = await db
      .update(verticalDramaCharacterAssets)
      .set({
        approved: next === "approved",
        qcStatus: next === "rejected" ? "failed" : next === "approved" ? "passed" : row.qcStatus,
        metadata: meta,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(verticalDramaCharacterAssets.id, params.assetLinkId),
          eq(verticalDramaCharacterAssets.tenantId, params.tenantId),
          eq(verticalDramaCharacterAssets.userId, params.userId),
        ),
      )
      .returning();
    return characterAssetRowToContract(updated as VerticalDramaCharacterAssetRow);
  }

  /** Mark a set of approved references stale (e.g. after an identity change). */
  async markStale(
    owner: VerticalDramaCharacterStockOwner,
    assetLinkIds: number[],
  ): Promise<number> {
    if (assetLinkIds.length === 0) return 0;
    const rows = await db
      .select()
      .from(verticalDramaCharacterAssets)
      .where(
        and(
          eq(verticalDramaCharacterAssets.tenantId, owner.tenantId),
          eq(verticalDramaCharacterAssets.userId, owner.userId),
          eq(verticalDramaCharacterAssets.seriesId, owner.seriesId),
          inArray(verticalDramaCharacterAssets.id, assetLinkIds),
        ),
      );
    let count = 0;
    for (const row of rows) {
      const from = deriveCharacterAssetState(row);
      if (!canTransitionCharacterAssetState(from, "stale")) continue;
      const meta = { ...((row.metadata as Record<string, unknown> | null) ?? {}), state: "stale" };
      await db
        .update(verticalDramaCharacterAssets)
        .set({ metadata: meta, updatedAt: new Date() })
        .where(eq(verticalDramaCharacterAssets.id, row.id));
      count += 1;
    }
    return count;
  }
}

/** Shared singleton. */
export const verticalDramaCharacterStockService = new VerticalDramaCharacterStockService();
