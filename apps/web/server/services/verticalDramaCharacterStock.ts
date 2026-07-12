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

import { and, desc, eq, getTableColumns, inArray } from "drizzle-orm";
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
    public readonly reason:
      | AttachMediaAssetRejectionReason
      | "illegal_state_transition"
      | "asset_not_found"
      | "asset_wrong_role",
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
  thumbnailUrl?: string | null,
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
    thumbnailUrl: thumbnailUrl ?? undefined,
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

/**
 * The two character-sheet asset `role`s considered as a SECOND reference
 * image (F131Z). Deliberately does NOT include `"character_design_bible"`
 * (vertical-drama-character-sheet-consolidation plan) — several of that
 * role's 11 sheet formats (e.g. `color_palette`, `material_fabric`) carry no
 * face at all, so they must never be picked as an identity-lock reference for
 * storyboard/shot generation.
 */
const CHARACTER_SHEET_ROLES = [
  "character_sheet_turnaround",
  "character_sheet_full",
];

/** Shape `pickBestCharacterSheetAsset` needs from a candidate row — deliberately minimal/duck-typed. */
export interface CharacterSheetAssetCandidate {
  url: string;
  role: string | null;
  approved: boolean;
  updatedAt: Date | string;
}

/** Raw row shape of `getCharacterReferenceUrls`'s sheet-asset query, before the non-null `url` filter. */
interface CharacterSheetAssetRow {
  url: string | null;
  role: string | null;
  approved: boolean;
  updatedAt: Date;
}

/**
 * Pick the single best `character_sheet_*` asset to send as the SECOND
 * identity-lock reference image (F131Z `verticalDramaSeriesCharacterRefV2`,
 * option A from `planning/vertical-drama-character-consistency/
 * research-2026-07-09.md` — "send ref #2/character (turnaround sheet already
 * stored)"). Preference order:
 *   1. approved beats unapproved, outright (regardless of role/recency).
 *   2. when approved status TIES, `character_sheet_turnaround` beats
 *      `character_sheet_full` — a turnaround shows more angles of the face
 *      per reference slot, so it carries more identity signal.
 *   3. any remaining tie breaks on newest `updatedAt`.
 * Pure/DB-free (same "pure helpers at module scope, unit-testable without a
 * database" convention as `buildCharacterAssetManifest` above) — the
 * DB-backed `getCharacterReferenceUrls` below fetches the candidate rows
 * (role IN character_sheet_turnaround/character_sheet_full, scoped by
 * owner+characterId) and hands them to this function rather than expressing
 * the 3-key tie-break as a SQL ORDER BY. Returns `null` for an empty
 * candidate list — the caller falls back to portrait-only, which is
 * documented risk (not a bug): older characters may predate the sheet flow.
 */
export function pickBestCharacterSheetAsset<T extends CharacterSheetAssetCandidate>(
  candidates: readonly T[],
): T | null {
  if (candidates.length === 0) return null;
  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    if (compareCharacterSheetCandidates(candidates[i], best) < 0) {
      best = candidates[i];
    }
  }
  return best;
}

function compareCharacterSheetCandidates(
  a: CharacterSheetAssetCandidate,
  b: CharacterSheetAssetCandidate,
): number {
  if (a.approved !== b.approved) return a.approved ? -1 : 1;
  const aTurnaround = a.role === "character_sheet_turnaround" ? 0 : 1;
  const bTurnaround = b.role === "character_sheet_turnaround" ? 0 : 1;
  if (aTurnaround !== bTurnaround) return aTurnaround - bTurnaround;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(); // newest first
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

  /**
   * Load the durable stock rows for a series (tenant + user scoped), left-joined
   * against `media_assets` so callers can surface a read-only thumbnail URL
   * without persisting one on the character-asset row itself (derived at read
   * time from the existing canonical `mediaAssetId` link).
   */
  async listRows(
    owner: VerticalDramaCharacterStockOwner,
  ): Promise<Array<VerticalDramaCharacterAssetRow & { thumbnailUrl: string | null }>> {
    const rows = await db
      .select({
        ...getTableColumns(verticalDramaCharacterAssets),
        thumbnailUrl: mediaAssets.originalUrl,
      })
      .from(verticalDramaCharacterAssets)
      .leftJoin(mediaAssets, eq(verticalDramaCharacterAssets.mediaAssetId, mediaAssets.id))
      .where(
        and(
          eq(verticalDramaCharacterAssets.tenantId, owner.tenantId),
          eq(verticalDramaCharacterAssets.userId, owner.userId),
          eq(verticalDramaCharacterAssets.seriesId, owner.seriesId),
        ),
      );
    return rows as Array<VerticalDramaCharacterAssetRow & { thumbnailUrl: string | null }>;
  }

  /** Build the browser-safe per-series character-asset manifest. */
  async getManifest(
    owner: VerticalDramaCharacterStockOwner,
  ): Promise<VerticalDramaCharacterAssetManifest> {
    const rows = await this.listRows(owner);
    return buildCharacterAssetManifest(
      owner.seriesId,
      rows.map((row) => characterAssetRowToContract(row, row.thumbnailUrl)),
    );
  }

  /**
   * The character's current identity-lock reference — the `primary_portrait`
   * asset to feed back into the model (as `referenceImageUrls`) whenever
   * generating another image of the same character, so the render is
   * conditioned on the actual face/likeness instead of relying on the text
   * prompt's "no identity drift" instruction alone. Prefers the newest
   * `approved` portrait; falls back to the newest portrait of any state (a
   * just-generated one is auto-approved already, but this stays defensive
   * for pre-auto-approve rows or a rejected-then-not-yet-replaced case).
   */
  async getPrimaryPortraitUrl(
    owner: VerticalDramaCharacterStockOwner,
    characterId: number,
  ): Promise<string | null> {
    const [row] = await db
      .select({ url: mediaAssets.originalUrl })
      .from(verticalDramaCharacterAssets)
      .innerJoin(mediaAssets, eq(verticalDramaCharacterAssets.mediaAssetId, mediaAssets.id))
      .where(
        and(
          eq(verticalDramaCharacterAssets.tenantId, owner.tenantId),
          eq(verticalDramaCharacterAssets.userId, owner.userId),
          eq(verticalDramaCharacterAssets.seriesId, owner.seriesId),
          eq(verticalDramaCharacterAssets.characterId, characterId),
          eq(verticalDramaCharacterAssets.role, "primary_portrait"),
        ),
      )
      .orderBy(desc(verticalDramaCharacterAssets.approved), desc(verticalDramaCharacterAssets.updatedAt))
      .limit(1);
    return row?.url ?? null;
  }

  /**
   * Explicit reference-image-picker override (Phase D1,
   * `planning/vertical-drama-reference-picker-outfit-lock/plan.md`): resolve
   * one specific `primary_portrait` asset link by id instead of letting
   * `getPrimaryPortraitUrl` auto-pick the newest approved one. Deliberately
   * scoped to `(tenantId, userId, seriesId)` only — NOT `characterId` — via
   * `loadOwnedRow`, so a variant/twin character can pin its parent's or
   * twin-source's portrait as its own identity-lock reference; tenant/user/
   * series ownership is still fully enforced by `loadOwnedRow`, so a caller
   * can never resolve another tenant's or user's asset this way.
   */
  async getReferenceImageUrlByAssetLinkId(
    owner: VerticalDramaCharacterStockOwner,
    assetLinkId: number,
  ): Promise<string> {
    const row = await this.loadOwnedRow(owner, assetLinkId);
    if (row.role !== "primary_portrait") {
      throw new VerticalDramaCharacterStockError(
        "asset_wrong_role",
        `Character asset ${assetLinkId} is not a primary_portrait (role=${row.role ?? "null"}) and cannot be used as an identity-lock reference image`,
      );
    }
    if (row.mediaAssetId == null) {
      throw new VerticalDramaCharacterStockError("asset_not_found", "Character asset has no attached media");
    }
    const [mediaRow] = await db
      .select({ url: mediaAssets.originalUrl })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, row.mediaAssetId))
      .limit(1);
    if (!mediaRow?.url) {
      throw new VerticalDramaCharacterStockError("asset_not_found", "Character asset has no attached media");
    }
    return mediaRow.url;
  }

  /**
   * Same query/ordering as `getPrimaryPortraitUrl` (identity-lock convention:
   * prefers the newest `approved` portrait, falls back to the newest of any
   * state) but selects the `media_assets` row's own id instead of its URL —
   * speaker-aware sub-shots task: lets a caller resolve a per-sub-shot clip's
   * `startFrameAssetId` (a media asset id) directly, without a second
   * URL->id lookup. No schema change (same tables/columns as
   * `getPrimaryPortraitUrl`).
   */
  async getPrimaryPortraitAssetId(
    owner: VerticalDramaCharacterStockOwner,
    characterId: number,
  ): Promise<number | null> {
    const [row] = await db
      .select({ id: mediaAssets.id })
      .from(verticalDramaCharacterAssets)
      .innerJoin(mediaAssets, eq(verticalDramaCharacterAssets.mediaAssetId, mediaAssets.id))
      .where(
        and(
          eq(verticalDramaCharacterAssets.tenantId, owner.tenantId),
          eq(verticalDramaCharacterAssets.userId, owner.userId),
          eq(verticalDramaCharacterAssets.seriesId, owner.seriesId),
          eq(verticalDramaCharacterAssets.characterId, characterId),
          eq(verticalDramaCharacterAssets.role, "primary_portrait"),
        ),
      )
      .orderBy(desc(verticalDramaCharacterAssets.approved), desc(verticalDramaCharacterAssets.updatedAt))
      .limit(1);
    return row?.id ?? null;
  }

  /**
   * The character's identity-lock reference SET for image generation (F131Z
   * `verticalDramaSeriesCharacterRefV2`, option A —
   * `planning/vertical-drama-character-consistency/research-2026-07-09.md`):
   * the primary portrait (via `getPrimaryPortraitUrl` — reused verbatim, so
   * its ordering/selection semantics are NOT duplicated or reimplemented
   * here) and, when `opts.includeSheet` is true, the best available
   * `character_sheet_turnaround`/`character_sheet_full` asset
   * (`pickBestCharacterSheetAsset`) appended after it — a second,
   * differently-posed reference of the SAME character that gives the image
   * model more identity signal than a single portrait alone (zero provider
   * cost; reuses stock the character-sheet flow already generates/imports).
   *
   * Order is always [portrait, sheet] — never [sheet, portrait] — never more
   * than 2 entries. A caller merging several characters' reference sets
   * relies on this fixed per-character order to re-interleave into
   * "all portraits, then all sheets" (see `resolveShotCharacterReferenceUrls`
   * in `verticalDramaEpisodes.ts`).
   *
   * Falls back to portrait-only when the character has no sheet asset yet
   * (older characters predating the sheet flow, or `opts.includeSheet` is
   * false) — documented risk, not a bug (research doc's option-A risk
   * column). Falls back to an empty array when neither exists.
   */
  async getCharacterReferenceUrls(
    owner: VerticalDramaCharacterStockOwner,
    characterId: number,
    opts: { includeSheet: boolean },
  ): Promise<string[]> {
    const portraitUrl = await this.getPrimaryPortraitUrl(owner, characterId);
    const urls: string[] = portraitUrl ? [portraitUrl] : [];
    if (!opts.includeSheet) return urls;

    const sheetRows: CharacterSheetAssetRow[] = await db
      .select({
        url: mediaAssets.originalUrl,
        role: verticalDramaCharacterAssets.role,
        approved: verticalDramaCharacterAssets.approved,
        updatedAt: verticalDramaCharacterAssets.updatedAt,
      })
      .from(verticalDramaCharacterAssets)
      .innerJoin(mediaAssets, eq(verticalDramaCharacterAssets.mediaAssetId, mediaAssets.id))
      .where(
        and(
          eq(verticalDramaCharacterAssets.tenantId, owner.tenantId),
          eq(verticalDramaCharacterAssets.userId, owner.userId),
          eq(verticalDramaCharacterAssets.seriesId, owner.seriesId),
          eq(verticalDramaCharacterAssets.characterId, characterId),
          inArray(verticalDramaCharacterAssets.role, CHARACTER_SHEET_ROLES),
        ),
      );
    const bestSheet = pickBestCharacterSheetAsset(
      sheetRows.filter(
        (row): row is CharacterSheetAssetRow & { url: string } => Boolean(row.url),
      ),
    );
    if (bestSheet && !urls.includes(bestSheet.url)) urls.push(bestSheet.url);
    return urls;
  }

  /**
   * Link a new character/product reference asset into the durable stock. The
   * `media_assets` row (when provided) is validated for tenant+user ownership
   * and non-deleted status before insert (cross-tenant/deleted are rejected).
   *
   * Auto-approved on entry (product decision, 2026-07-04): a manual
   * approve-before-use step turned out to have no downstream consumer (no
   * other service checked `approved` before this), so every new link — from
   * either the generate or the import/drag-drop path — starts directly in
   * `approved`. `reject` is still available immediately after for
   * corrections, and assets can still cycle back through `stale` ->
   * `approved` later (e.g. after the character's identity anchors change),
   * so the approve action itself is kept in the state machine and UI.
   *
   * IDEMPOTENT on `(seriesId, characterId, mediaAssetId)` (bug repro
   * 2026-07-06, series 4 คุณหญิงเบญจวรรณ): re-linking the same media asset to
   * the same character — e.g. dragging a reference tile the panel already
   * shows onto the character card to "set as portrait" — previously always
   * INSERTed a new row, so the panel ended up showing two tiles for the same
   * image under different `role`/state (one "approved", one
   * "primary_portrait"). There is no DB unique constraint for this (avoided a
   * migration per the incident plan); this query-first-then-branch guard is
   * the service-level substitute: an existing link for the same
   * (seriesId, characterId, mediaAssetId) tuple is UPDATEd in place (new
   * role/source/state/metadata applied on top of it) instead of inserting a
   * sibling row. `characterId`/`mediaAssetId` both null (or either null) never
   * match an existing row via `and(eq(...))`'s null semantics, so this only
   * dedupes real character+asset pairs — never collapses distinct "browse
   * only" or product-reference rows that happen to share nulls.
   */
  async linkAsset(params: LinkCharacterAssetParams): Promise<VerticalDramaCharacterAsset> {
    if (params.mediaAssetId != null) {
      await this.assertMediaAssetAttachable(params, params.mediaAssetId);
    }

    if (params.characterId != null && params.mediaAssetId != null) {
      const [existing] = await db
        .select()
        .from(verticalDramaCharacterAssets)
        .where(
          and(
            eq(verticalDramaCharacterAssets.tenantId, params.tenantId),
            eq(verticalDramaCharacterAssets.userId, params.userId),
            eq(verticalDramaCharacterAssets.seriesId, params.seriesId),
            eq(verticalDramaCharacterAssets.characterId, params.characterId),
            eq(verticalDramaCharacterAssets.mediaAssetId, params.mediaAssetId),
          ),
        )
        .limit(1);
      if (existing) {
        const meta: Record<string, unknown> = {
          ...((existing.metadata as Record<string, unknown> | null) ?? {}),
          ...(params.metadata ?? {}),
          state: "approved" satisfies VerticalDramaCharacterAssetState,
          source: params.source,
        };
        const [updated] = await db
          .update(verticalDramaCharacterAssets)
          .set({
            assetType: params.assetType,
            role: params.role ?? existing.role,
            approved: true,
            containsHumanFace: params.containsHumanFace ?? existing.containsHumanFace,
            checksumSha256: params.checksumSha256 ?? existing.checksumSha256,
            metadata: meta,
            updatedAt: new Date(),
          })
          .where(eq(verticalDramaCharacterAssets.id, existing.id))
          .returning();
        return characterAssetRowToContract(updated as VerticalDramaCharacterAssetRow);
      }
    }

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
        approved: true,
        containsHumanFace: params.containsHumanFace ?? null,
        qcStatus: "pending",
        checksumSha256: params.checksumSha256 ?? null,
        metadata: {
          ...(params.metadata ?? {}),
          state: "approved" satisfies VerticalDramaCharacterAssetState,
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

  /**
   * Permanently unlink a reference asset from a character's stock (product
   * decision, 2026-07-05: character references are a personal library, not
   * narrative content — "generate/import = add, unwanted = delete" is the
   * expected model, replacing the approve/reject/stale QC workflow that
   * carried over from the episode-shot review system but didn't fit here).
   * Only removes the `verticalDramaCharacterAssets` link row — the
   * underlying `media_assets` row is left untouched (it may still be
   * referenced from Media History/Library independent of this character).
   */
  async deleteAsset(
    owner: VerticalDramaCharacterStockOwner,
    assetLinkId: number,
  ): Promise<void> {
    await this.loadOwnedRow(owner, assetLinkId);
    await db
      .delete(verticalDramaCharacterAssets)
      .where(
        and(
          eq(verticalDramaCharacterAssets.id, assetLinkId),
          eq(verticalDramaCharacterAssets.tenantId, owner.tenantId),
          eq(verticalDramaCharacterAssets.userId, owner.userId),
          eq(verticalDramaCharacterAssets.seriesId, owner.seriesId),
        ),
      );
  }
}

/** Shared singleton. */
export const verticalDramaCharacterStockService = new VerticalDramaCharacterStockService();
