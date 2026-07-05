/**
 * Vertical Drama Series — durable character-stock router (spec feature 131,
 * section-05, §7.1 / §7.2 / §7.3).
 *
 * Surfaces the durable per-series character roster AND its reference-asset stock
 * (approval / QC lifecycle) over tRPC. Every procedure is protected (auth
 * required), gated on the `verticalDramaSeries` tenant feature flag (fail-closed),
 * and scoped to the caller's tenant + user + series so a user can never read,
 * attach, approve, or transition another tenant's or user's character/asset.
 *
 * Cross-tenant / cross-user rows are reported as NOT_FOUND (never FORBIDDEN) so
 * the surface never discloses the existence of another owner's data. Illegal
 * state-machine transitions surface as PRECONDITION_FAILED.
 *
 * The character roster (`verticalDramaCharacters`) is owned directly here; the
 * reference-asset stock (link / manifest / approve / transition / stale) is
 * delegated to `verticalDramaCharacterStockService`.
 *
 * The conductor wires this router into `server/routers.ts` — do NOT edit that
 * file here.
 */

import crypto from "crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { requireFeatureFlag } from "../middleware/requireFeatureFlag";
import { db } from "../db";
import {
  verticalDramaSeries,
  verticalDramaCharacters,
  mediaAssets,
  mediaModels,
  libraryItems,
  type VerticalDramaCharacterRow,
} from "../../drizzle/schema";
import {
  verticalDramaCharacterStockService,
  VerticalDramaCharacterStockError,
} from "../services/verticalDramaCharacterStock";
import { VERTICAL_DRAMA_CHARACTER_ASSET_STATES } from "@shared/verticalDramaSeries/characterAssets";
import { mediaGenerationService, DEFAULT_MODELS } from "../services/mediaGenerationService";
import { calculateCreditCost } from "../services/pricingCalculator";
import { hasEnoughCredits, deductCredits, refundCredits } from "../services/creditService";
import { signBearerToken } from "../_core/tokens";
import {
  generateCharacterVisualPrompts,
  InsufficientCreditsError,
  VdSchemaValidationError,
} from "../services/verticalDramaCharacterImageGeneration";
import { mediaGenerationLimiter } from "../services/rateLimiter";
import { createAssetFromAttachment } from "../services/mediaAssetService";

/* -------------------------------------------------------------------------- */
/* Base procedure + ownership helpers                                          */
/* -------------------------------------------------------------------------- */

const verticalDramaProcedure = protectedProcedure.use(
  requireFeatureFlag("verticalDramaSeries"),
);

/** Resolve a non-null tenant id or fail closed. */
function requireTenantId(tenantId: string | null): string {
  if (!tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Vertical Drama Series is not available (no tenant context)",
    });
  }
  return tenantId;
}

function parseId(value: string, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid ${label}` });
  }
  return n;
}

/**
 * Load the caller-owned series (tenant + user scoped) or throw NOT_FOUND.
 * NOT_FOUND (not FORBIDDEN) is deliberate — never disclose the existence of
 * another tenant's/user's series.
 */
async function loadOwnedSeries(tenantId: string, userId: number, seriesId: number) {
  const [row] = await db
    .select({ id: verticalDramaSeries.id })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, seriesId),
        eq(verticalDramaSeries.tenantId, tenantId),
        eq(verticalDramaSeries.userId, userId),
      ),
    )
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Series not found" });
  return row;
}

/** Load a caller-owned character (tenant + user + series scoped) or NOT_FOUND. */
async function loadOwnedCharacter(
  tenantId: string,
  userId: number,
  seriesId: number,
  characterId: number,
): Promise<VerticalDramaCharacterRow> {
  const [row] = await db
    .select()
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.id, characterId),
        eq(verticalDramaCharacters.tenantId, tenantId),
        eq(verticalDramaCharacters.userId, userId),
        eq(verticalDramaCharacters.seriesId, seriesId),
      ),
    )
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Character not found" });
  return row;
}

/**
 * Translate a service-level `VerticalDramaCharacterStockError` into the correct
 * tRPC error code. Cross-tenant / cross-user / missing rows become NOT_FOUND so
 * we never disclose another owner's data; illegal transitions surface as
 * PRECONDITION_FAILED.
 */
function mapStockError(err: unknown): never {
  if (err instanceof VerticalDramaCharacterStockError) {
    switch (err.reason) {
      case "media_asset_not_found":
      case "media_asset_cross_tenant":
      case "media_asset_cross_user":
      case "asset_not_found":
        throw new TRPCError({ code: "NOT_FOUND", message: "Referenced asset not found" });
      case "media_asset_deleted":
        throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
      case "illegal_state_transition":
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: err.message });
      default:
        throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
    }
  }
  throw err;
}

/**
 * Short-lived server-to-server bearer token for the Python media-generation
 * backend, mirroring `server/routers/media.ts`'s `createMediaToken`/
 * `getUserToken` convention exactly: prefer the caller's own session token
 * (so usage attributes correctly), fall back to minting a scoped token.
 */
function createCharacterPortraitMediaToken(userId: number): string {
  return signBearerToken(
    {
      sub: String(userId),
      type: "access",
      scopes: ["media:generate"],
      jti: `vd_char_portrait_${Date.now()}_${crypto.randomBytes(12).toString("hex")}`,
    },
    "15m",
  );
}

function getCharacterPortraitUserToken(ctx: { userToken: string | null; user: { id: number } }): string {
  return ctx.userToken || createCharacterPortraitMediaToken(ctx.user.id);
}

/**
 * Best-effort character description drawn from `verticalDramaCharacters.data`
 * (the free-form `VerticalDramaCharacter` payload — description/personality/
 * backstory/identityLock/wardrobeRules). `data.description` is the
 * authoritative source for core physical/demographic traits (age, gender,
 * defining features — e.g. "เด็กชายวัยสิบสองปีที่ฉลาดเกินวัย...") that MUST
 * reach the visual-bible/portrait prompt builder; it is deliberately placed
 * FIRST in the aggregated string so it leads (not trails) personality/
 * backstory prose, since a downstream LLM call can otherwise under-weight or
 * ignore later-listed traits and invent an unconstrained identity (e.g.
 * rendering an adult when the character is a 12-year-old boy).
 * Returns `undefined` when nothing usable is present.
 */
export function extractCharacterDescription(data: Record<string, unknown> | null): string | undefined {
  if (!data) return undefined;
  const parts: string[] = [];
  if (typeof data.description === "string" && data.description.trim()) {
    parts.push(`Description: ${data.description.trim()}`);
  }
  if (typeof data.personality === "string" && data.personality.trim()) {
    parts.push(`Personality: ${data.personality.trim()}`);
  }
  if (typeof data.backstory === "string" && data.backstory.trim()) {
    parts.push(`Backstory: ${data.backstory.trim()}`);
  }
  if (typeof data.identityLock === "string" && data.identityLock.trim()) {
    parts.push(`Identity lock: ${data.identityLock.trim()}`);
  }
  if (Array.isArray(data.wardrobeRules)) {
    const rules = data.wardrobeRules.filter(
      (rule): rule is string => typeof rule === "string" && rule.trim().length > 0,
    );
    if (rules.length > 0) parts.push(`Wardrobe rules: ${rules.join("; ")}`);
  }
  return parts.length > 0 ? parts.join(" | ") : undefined;
}

/** Browser-safe projection of a character roster row (never leaks internal ids as numbers). */
function characterRowToDto(row: VerticalDramaCharacterRow) {
  return {
    characterId: String(row.id),
    seriesId: String(row.seriesId),
    characterKey: row.characterKey,
    name: row.name,
    role: row.role ?? undefined,
    data: (row.data as Record<string, unknown> | null) ?? undefined,
    createdAt: (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)).toISOString(),
    updatedAt: (row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt)).toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Input schemas                                                              */
/* -------------------------------------------------------------------------- */

const seriesScope = z.object({ seriesId: z.string().min(1) });

const assetStateEnum = z.enum(
  VERTICAL_DRAMA_CHARACTER_ASSET_STATES as unknown as [string, ...string[]],
);

/* -------------------------------------------------------------------------- */
/* Router                                                                      */
/* -------------------------------------------------------------------------- */

export const verticalDramaCharactersRouter = router({
  /**
   * List the series' character roster plus the durable reference-asset manifest
   * (approved / pending / stale counts + per-asset links). Read-only.
   */
  listCharacters: verticalDramaProcedure
    .input(seriesScope)
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      const rows = await db
        .select()
        .from(verticalDramaCharacters)
        .where(
          and(
            eq(verticalDramaCharacters.tenantId, tenantId),
            eq(verticalDramaCharacters.userId, userId),
            eq(verticalDramaCharacters.seriesId, seriesId),
          ),
        );

      const manifest = await verticalDramaCharacterStockService.getManifest({
        tenantId,
        userId,
        seriesId,
      });

      return { characters: rows.map(characterRowToDto), manifest };
    }),

  /**
   * Build the browser-safe per-series character-asset manifest (approved /
   * pending / stale reference stock). Read-only.
   */
  getManifest: verticalDramaProcedure
    .input(seriesScope)
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      return verticalDramaCharacterStockService.getManifest({ tenantId, userId, seriesId });
    }),

  /** Create a new character in the series roster (no paid generation). */
  createCharacter: verticalDramaProcedure
    .input(
      seriesScope.extend({
        characterKey: z.string().trim().min(1).max(64),
        name: z.string().trim().min(1).max(255),
        role: z.string().trim().max(100).optional(),
        data: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      const [row] = await db
        .insert(verticalDramaCharacters)
        .values({
          tenantId,
          userId,
          seriesId,
          characterKey: input.characterKey,
          name: input.name,
          role: input.role ?? null,
          data: input.data ?? null,
        } as typeof verticalDramaCharacters.$inferInsert)
        .returning();

      return { character: characterRowToDto(row as VerticalDramaCharacterRow) };
    }),

  /** Update an existing character's editable fields (tenant + user scoped). */
  updateCharacter: verticalDramaProcedure
    .input(
      seriesScope.extend({
        characterId: z.string().min(1),
        name: z.string().trim().min(1).max(255).optional(),
        role: z.string().trim().max(100).nullable().optional(),
        data: z.record(z.string(), z.unknown()).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const characterId = parseId(input.characterId, "character id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      await loadOwnedCharacter(tenantId, userId, seriesId, characterId);

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.role !== undefined) patch.role = input.role;
      if (input.data !== undefined) patch.data = input.data;

      const [row] = await db
        .update(verticalDramaCharacters)
        .set(patch)
        .where(
          and(
            eq(verticalDramaCharacters.id, characterId),
            eq(verticalDramaCharacters.tenantId, tenantId),
            eq(verticalDramaCharacters.userId, userId),
            eq(verticalDramaCharacters.seriesId, seriesId),
          ),
        )
        .returning();

      return { character: characterRowToDto(row as VerticalDramaCharacterRow) };
    }),

  /**
   * Attach an existing canonical `media_assets` row as a durable character /
   * product reference. The media asset is validated for tenant + user ownership
   * and non-deleted status before insert (cross-tenant/deleted are rejected).
   * The new link starts in `generated`/`imported` — approval is never implicit.
   */
  linkAsset: verticalDramaProcedure
    .input(
      seriesScope.extend({
        characterId: z.string().min(1).optional(),
        mediaAssetId: z.string().min(1).optional(),
        assetType: z.string().min(1).max(40).default("character_reference"),
        role: z.string().max(40).optional(),
        source: z.enum(["generated", "imported"]),
        containsHumanFace: z.boolean().optional(),
        checksumSha256: z.string().max(64).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      let characterId: number | null = null;
      if (input.characterId != null) {
        characterId = parseId(input.characterId, "character id");
        await loadOwnedCharacter(tenantId, userId, seriesId, characterId);
      }

      const mediaAssetId =
        input.mediaAssetId != null ? parseId(input.mediaAssetId, "media asset id") : null;

      try {
        const asset = await verticalDramaCharacterStockService.linkAsset({
          tenantId,
          userId,
          seriesId,
          characterId,
          mediaAssetId,
          assetType: input.assetType,
          role: input.role ?? null,
          source: input.source,
          containsHumanFace: input.containsHumanFace ?? null,
          checksumSha256: input.checksumSha256 ?? null,
          metadata: input.metadata ?? null,
        });
        return { asset };
      } catch (err) {
        mapStockError(err);
      }
    }),

  /**
   * Resolve a Library item or an already-hosted URL (Media History result,
   * or a client-uploaded 3x3-cutter tile via `ai.upload`) into a canonical
   * `media_assets` row, so drag-and-drop from those surfaces can call
   * `linkAsset` immediately — no manual "Media asset ID" entry required.
   *
   * Two branches only:
   *  - `"library"`: looks up the `library_items` row scoped to the caller's
   *    own tenant + ownership (NOT_FOUND if missing/not owned — never
   *    discloses another owner's row), derives a mime type from `itemType`,
   *    then registers it via `createAssetFromAttachment` (idempotent —
   *    dedupes by checksum(tenantId+userId), so re-dropping the same item
   *    is safe and returns the same asset id).
   *  - `"url"`: directly registers an already-accessible URL (a Media
   *    History task's `resultUrl`, or the `url` returned by `ai.upload`
   *    after the frontend uploads a cutter tile / data URL itself) via the
   *    SAME `createAssetFromAttachment` call. No server-side re-fetch of
   *    provider task state — the frontend already has the URL.
   *
   * This does real storage-adjacent DB writes, so it shares the same
   * `mediaGenerationLimiter` per-user cap this router already uses for its
   * paid generation mutations.
   */
  resolveMediaAssetForImport: verticalDramaProcedure
    .input(
      z.intersection(
        seriesScope,
        z.discriminatedUnion("source", [
          z.object({
            source: z.literal("library"),
            libraryItemId: z.number().int().positive(),
          }),
          z.object({
            source: z.literal("url"),
            // Not `.url()` — local storage's `ai.upload` returns a relative
            // path (`/uploads/...`), which is a valid `storageKey`/`originalUrl`
            // for `createAssetFromAttachment` below but fails a strict absolute-URL
            // check. Same fix as the gallery's URL validation (see project memory).
            url: z.string().min(1),
            mimeType: z.string().min(1),
            fileName: z.string().optional(),
          }),
        ]),
      ),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      if (input.source === "library") {
        const [item] = await db
          .select({
            id: libraryItems.id,
            tenantId: libraryItems.tenantId,
            ownerUserId: libraryItems.ownerUserId,
            itemType: libraryItems.itemType,
            sourceUrl: libraryItems.sourceUrl,
          })
          .from(libraryItems)
          .where(
            and(
              eq(libraryItems.id, input.libraryItemId),
              eq(libraryItems.tenantId, tenantId),
              eq(libraryItems.ownerUserId, userId),
            ),
          )
          .limit(1);
        if (!item) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Library item not found" });
        }
        if (!item.sourceUrl) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Library item has no source URL to import",
          });
        }

        let mimeType: string;
        if (item.itemType === "image") mimeType = "image/jpeg";
        else if (item.itemType === "video") mimeType = "video/mp4";
        else {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Library item type "${item.itemType}" is not importable as a character reference`,
          });
        }

        // `createAssetFromAttachment`'s context type requires
        // conversationId/messageId/projectId (chat-attachment-shaped), but
        // those columns are nullable in `media_assets` and irrelevant here —
        // this mirrors the `as any` cast `chat.ts` itself uses at its own
        // call site rather than modifying the (out-of-scope) service file.
        const { assetId } = await createAssetFromAttachment(
          { type: "image", url: item.sourceUrl, mimeType } as any,
          { tenantId, userId } as any,
        );
        return { mediaAssetId: String(assetId) };
      }

      // source === "url"
      const { assetId } = await createAssetFromAttachment(
        { type: "image", url: input.url, mimeType: input.mimeType } as any,
        { tenantId, userId } as any,
      );
      return { mediaAssetId: String(assetId) };
    }),

  /**
   * Approve a pending reference asset (explicit review gate — the state machine
   * forbids skipping review). Thin wrapper over `transitionAsset(to: "approved")`.
   */
  approveAsset: verticalDramaProcedure
    .input(seriesScope.extend({ assetLinkId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const assetLinkId = parseId(input.assetLinkId, "asset link id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      try {
        const asset = await verticalDramaCharacterStockService.transition({
          tenantId,
          userId,
          seriesId,
          assetLinkId,
          to: "approved",
        });
        return { asset };
      } catch (err) {
        mapStockError(err);
      }
    }),

  /**
   * Apply an arbitrary lifecycle transition to a reference asset (draft ->
   * generated/imported -> approved / rejected / stale). Illegal transitions
   * surface as PRECONDITION_FAILED. A `rejectionReason` is recorded when
   * transitioning to `rejected`.
   */
  transitionAsset: verticalDramaProcedure
    .input(
      seriesScope.extend({
        assetLinkId: z.string().min(1),
        to: assetStateEnum,
        rejectionReason: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const assetLinkId = parseId(input.assetLinkId, "asset link id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      try {
        const asset = await verticalDramaCharacterStockService.transition({
          tenantId,
          userId,
          seriesId,
          assetLinkId,
          to: input.to as (typeof VERTICAL_DRAMA_CHARACTER_ASSET_STATES)[number],
          rejectionReason: input.rejectionReason ?? null,
        });
        return { asset };
      } catch (err) {
        mapStockError(err);
      }
    }),

  /**
   * Mark a set of approved references stale (e.g. after an identity change).
   * Returns the number of assets actually transitioned to `stale`.
   */
  markStale: verticalDramaProcedure
    .input(
      seriesScope.extend({
        assetLinkIds: z.array(z.string().min(1)).min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      const ids = input.assetLinkIds.map((id) => parseId(id, "asset link id"));
      const staleCount = await verticalDramaCharacterStockService.markStale(
        { tenantId, userId, seriesId },
        ids,
      );
      return { staleCount };
    }),

  /**
   * Permanently remove a reference asset from a character's stock (product
   * decision 2026-07-05: replaces the approve/reject/stale QC workflow for
   * character references with a plain add/delete model). Only unlinks the
   * `verticalDramaCharacterAssets` row — the underlying media asset is left
   * intact in Media History/Library.
   */
  deleteAsset: verticalDramaProcedure
    .input(seriesScope.extend({ assetLinkId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const assetLinkId = parseId(input.assetLinkId, "asset link id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      try {
        await verticalDramaCharacterStockService.deleteAsset(
          { tenantId, userId, seriesId },
          assetLinkId,
        );
        return { deleted: true };
      } catch (err) {
        mapStockError(err);
      }
    }),

  /**
   * Preview-only leg of the character portrait/turnaround flow: runs ONLY the
   * `generateCharacterVisualPrompts` LLM call (the same step-1 credit-gated
   * call `generateCharacterImage`/`generateCharacterTurnaround` perform
   * internally) and returns the resulting prompt text WITHOUT rendering an
   * image. This lets the frontend show the actual prompt for user approval
   * before any image-render credit is spent. Charges exactly the one
   * prompt-generation credit (via `generateCharacterVisualPrompts` itself) —
   * the caller then passes the approved text back as `approvedPrompt` /
   * `approvedNegativePrompt` on `generateCharacterImage` or
   * `generateCharacterTurnaround` so that LLM leg is never re-run (and never
   * double-charged) for the same spend.
   */
  previewCharacterPrompt: verticalDramaProcedure
    .input(seriesScope.extend({ characterId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const characterId = parseId(input.characterId, "character id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      const character = await loadOwnedCharacter(tenantId, userId, seriesId, characterId);

      const [seriesRow] = await db
        .select({
          title: verticalDramaSeries.title,
          genre: verticalDramaSeries.genre,
          tone: verticalDramaSeries.tone,
        })
        .from(verticalDramaSeries)
        .where(and(eq(verticalDramaSeries.id, seriesId), eq(verticalDramaSeries.tenantId, tenantId)))
        .limit(1);

      const description = extractCharacterDescription(
        (character.data as Record<string, unknown> | null) ?? null,
      );

      let promptResult;
      try {
        promptResult = await generateCharacterVisualPrompts({
          userId,
          tenantId,
          seriesId,
          characterId,
          characterKey: character.characterKey,
          name: character.name,
          role: character.role,
          description,
          storyContext: seriesRow
            ? { title: seriesRow.title, genre: seriesRow.genre ?? undefined, tone: seriesRow.tone ?? undefined }
            : undefined,
        });
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          throw new TRPCError({ code: "FORBIDDEN", message: err.message });
        }
        if (err instanceof VdSchemaValidationError) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Character visual prompt generation failed",
        });
      }

      return {
        portraitPrompt: promptResult.portraitPrompt,
        turnaroundPrompt: promptResult.turnaroundPrompt,
        negativePrompt: promptResult.negativePrompt,
        model: promptResult.model,
      };
    }),

  /**
   * Generate a real character reference portrait: (1) run the installed
   * `vertical-drama-character-visual-bible` skill as a direct, credit-gated
   * LLM call to produce a portrait prompt + negative prompt (see
   * `verticalDramaCharacterImageGeneration.ts`), then (2) render that prompt
   * into an actual image via `mediaGenerationService.generateImage` (the
   * SYNCHRONOUS single-prompt-in/single-image-out method — the same one
   * `media.ts`'s `generateImage` mutation calls; chosen over
   * `generateImageAsync` because this is a plain text-prompt portrait with
   * no user-uploaded reference image and no need for job polling). The
   * rendered image is registered as a canonical `media_assets` row (never a
   * bare provider URL, matching this table's own doc comment) and linked
   * into the durable character-asset stock via the existing
   * `verticalDramaCharacterStockService.linkAsset` path — `approved: false`
   * / `qcStatus: "pending"` — so it enters the SAME human-approval queue as
   * imported assets; nothing here bypasses review.
   *
   * Two SEPARATE credit charges occur (never double-counted for the same
   * spend): the prompt-generation LLM call is credited inside
   * `generateCharacterVisualPrompts` itself; the image render is credited
   * here, mirroring `media.ts`'s own check-credits -> call -> deduct-credits
   * convention (`mediaGenerationService.generateImage` does not deduct
   * credits itself — the caller always does, using the backend-reported
   * `creditsUsed` when available).
   *
   * `approvedPrompt` / `approvedNegativePrompt` (optional): when the caller
   * already ran `previewCharacterPrompt` and had the user approve the exact
   * text, pass it here to skip the internal `generateCharacterVisualPrompts`
   * call entirely — the prompt-generation credit was already charged once,
   * at preview time, and must not be charged again here. When absent,
   * behavior is unchanged from before this option existed.
   */
  generateCharacterImage: verticalDramaProcedure
    .input(
      seriesScope.extend({
        characterId: z.string().min(1),
        approvedPrompt: z.string().min(1).optional(),
        approvedNegativePrompt: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Rate limiting — reuses the shared `mediaGenerationLimiter` (this
      // mutation performs a paid LLM prompt-generation call PLUS a paid
      // image render, so it belongs under the same per-user cap as
      // `media.ts`'s own generation mutations). Checked first, before any
      // DB reads/writes or paid calls.
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const characterId = parseId(input.characterId, "character id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      const character = await loadOwnedCharacter(tenantId, userId, seriesId, characterId);

      const [seriesRow] = await db
        .select({
          title: verticalDramaSeries.title,
          genre: verticalDramaSeries.genre,
          tone: verticalDramaSeries.tone,
        })
        .from(verticalDramaSeries)
        .where(and(eq(verticalDramaSeries.id, seriesId), eq(verticalDramaSeries.tenantId, tenantId)))
        .limit(1);

      const description = extractCharacterDescription(
        (character.data as Record<string, unknown> | null) ?? null,
      );

      // 1. Prompt generation — credit-gated + deducted internally. Skipped
      //    entirely when the caller already ran `previewCharacterPrompt` and
      //    supplies the user-approved text via `approvedPrompt` (that credit
      //    was already charged once, at preview time).
      let portraitPrompt: string;
      let negativePrompt: string | undefined;
      let promptModel: string | null = null;
      let visualBibleSummary: Record<string, unknown> | null = null;
      let promptCreditsUsed = 0;

      if (input.approvedPrompt) {
        portraitPrompt = input.approvedPrompt;
        negativePrompt = input.approvedNegativePrompt;
      } else {
        let promptResult;
        try {
          promptResult = await generateCharacterVisualPrompts({
            userId,
            tenantId,
            seriesId,
            characterId,
            characterKey: character.characterKey,
            name: character.name,
            role: character.role,
            description,
            storyContext: seriesRow
              ? { title: seriesRow.title, genre: seriesRow.genre ?? undefined, tone: seriesRow.tone ?? undefined }
              : undefined,
          });
        } catch (err) {
          if (err instanceof InsufficientCreditsError) {
            throw new TRPCError({ code: "FORBIDDEN", message: err.message });
          }
          if (err instanceof VdSchemaValidationError) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: err instanceof Error ? err.message : "Character visual prompt generation failed",
          });
        }
        portraitPrompt = promptResult.portraitPrompt;
        negativePrompt = promptResult.negativePrompt;
        promptModel = promptResult.model;
        visualBibleSummary = promptResult.raw.visual_bible_summary;
        promptCreditsUsed = promptResult.creditsUsed;
      }

      // 2. Pre-flight credit check for the image render — a SEPARATE charge
      //    from the prompt-generation LLM call above.
      const [pricingRow] = await db
        .select({ creditCost: mediaModels.creditCost, configJson: mediaModels.configJson })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, DEFAULT_MODELS.image))
        .limit(1);
      const pricingModel = pricingRow ?? { creditCost: 10, configJson: null };
      const imageCreditCost = calculateCreditCost(pricingModel, { numImages: 1 });

      const hasImageCredits = await hasEnoughCredits(userId, imageCreditCost);
      if (!hasImageCredits) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Insufficient credits for portrait image render. Required: ${imageCreditCost}`,
        });
      }

      // 2.5. Identity-lock reference — attach the character's existing
      //      approved portrait (if any) as a `referenceImageUrls` input so
      //      the render is conditioned on the actual likeness instead of
      //      relying on the text prompt's "no identity drift" instruction
      //      alone. Absent on a character's very first portrait (nothing to
      //      reference yet); present on every regeneration afterward. The
      //      prompt text itself must also call out the attached image, or
      //      several models otherwise ignore a silently-attached reference.
      const referencePortraitUrl = await verticalDramaCharacterStockService.getPrimaryPortraitUrl(
        { tenantId, userId, seriesId },
        characterId,
      );
      const renderPortraitPrompt = referencePortraitUrl
        ? `${portraitPrompt} Use the attached reference image as this character's exact identity — match face shape, skin tone, hairstyle, and distinguishing features precisely; do not alter identity.`
        : portraitPrompt;

      // 3. Submit — async (matches `media.generateImageAsync` + `media.getTask`
      //    convention; shows in Media History; avoids a long-blocking
      //    mutation). Credits are RESERVED now; `media.getTask` reconciles
      //    against actual usage once the task completes/fails, same as
      //    `media.ts`'s own async mutations. The caller polls
      //    `media.getTask({taskId})`, then finalizes by calling
      //    `resolveMediaAssetForImport` + `linkAsset` (both already-built,
      //    already-tested procedures) — no new "finalize" endpoint needed.
      await deductCredits({
        userId,
        tenantId,
        amount: imageCreditCost,
        description: `Vertical Drama — generate character portrait (character #${characterId}, reserved)`,
        sourceType: "media_image",
        metadata: {
          feature: "vertical_drama_character_portrait",
          seriesId,
          characterId,
          type: "reservation",
          creditCost: imageCreditCost,
        },
      });

      const userToken = getCharacterPortraitUserToken(ctx);
      let task;
      try {
        task = await mediaGenerationService.generateImageAsync(
          {
            prompt: renderPortraitPrompt,
            negativePrompt,
            numImages: 1,
            aspectRatio: "9:16",
            ...(referencePortraitUrl ? { referenceImageUrls: [referencePortraitUrl] } : {}),
            publicUrl: ctx.publicUrl ?? undefined,
            auditContext: {
              userId,
              traceId: crypto.randomUUID(),
              source: "trpc.verticalDramaCharacters.generateCharacterImage",
              stage: "submission",
            },
          },
          userToken,
        );
      } catch (err) {
        await refundCredits({
          userId,
          amount: imageCreditCost,
          description: `Refund: character portrait render failed to submit (character #${characterId})`,
          sourceType: "media_image",
          metadata: { feature: "vertical_drama_character_portrait", seriesId, characterId },
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Character portrait image generation failed to submit",
        });
      }

      return {
        taskId: task.id,
        portraitPrompt,
        negativePrompt,
        promptModel,
        visualBibleSummary,
        creditsUsed: { promptGeneration: promptCreditsUsed },
      };
    }),

  /**
   * Generate a multi-angle character-sheet "turnaround" reference image — a
   * 360-degree/multi-angle composition intended to anchor identity across
   * scenes (prevents likeness drift), rendered from the SAME
   * `vertical-drama-character-visual-bible` skill response
   * `generateCharacterImage` already produces, just reading the
   * `turnaround_prompt` field (`promptResult.turnaroundPrompt`) that the
   * portrait flow discards instead of `portraitPrompt`. No new skill / LLM
   * prompt — mirrors `generateCharacterImage` exactly (same rate limit,
   * same two-charge credit-gating: prompt-generation LLM call credited
   * inside `generateCharacterVisualPrompts`, image render credited here),
   * differing only in which prompt field is rendered and the stock `role`
   * used at link time (`"character_sheet_turnaround"` vs
   * `"primary_portrait"` — `role` is a free varchar(40), no enum/migration
   * needed).
   *
   * `approvedPrompt` / `approvedNegativePrompt` (optional): same skip-
   * regeneration contract as `generateCharacterImage` — when present, the
   * user-approved turnaround text (from `previewCharacterPrompt`) is used
   * directly and the internal `generateCharacterVisualPrompts` call (already
   * charged once at preview time) is not repeated.
   */
  generateCharacterTurnaround: verticalDramaProcedure
    .input(
      seriesScope.extend({
        characterId: z.string().min(1),
        approvedPrompt: z.string().min(1).optional(),
        approvedNegativePrompt: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Rate limiting — same shared per-user cap as generateCharacterImage
      // (this mutation also performs a paid LLM prompt-generation call PLUS
      // a paid image render). Checked first, before any DB reads/writes or
      // paid calls.
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const characterId = parseId(input.characterId, "character id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      const character = await loadOwnedCharacter(tenantId, userId, seriesId, characterId);

      const [seriesRow] = await db
        .select({
          title: verticalDramaSeries.title,
          genre: verticalDramaSeries.genre,
          tone: verticalDramaSeries.tone,
        })
        .from(verticalDramaSeries)
        .where(and(eq(verticalDramaSeries.id, seriesId), eq(verticalDramaSeries.tenantId, tenantId)))
        .limit(1);

      const description = extractCharacterDescription(
        (character.data as Record<string, unknown> | null) ?? null,
      );

      // 1. Prompt generation — credit-gated + deducted internally. Same call
      //    generateCharacterImage makes; we just read a different field
      //    (`turnaroundPrompt`) off the same result. Skipped entirely when
      //    the caller already ran `previewCharacterPrompt` and supplies the
      //    user-approved text via `approvedPrompt` (that credit was already
      //    charged once, at preview time).
      let turnaroundPrompt: string;
      let negativePrompt: string | undefined;
      let promptModel: string | null = null;
      let visualBibleSummary: Record<string, unknown> | null = null;
      let promptCreditsUsed = 0;

      if (input.approvedPrompt) {
        turnaroundPrompt = input.approvedPrompt;
        negativePrompt = input.approvedNegativePrompt;
      } else {
        let promptResult;
        try {
          promptResult = await generateCharacterVisualPrompts({
            userId,
            tenantId,
            seriesId,
            characterId,
            characterKey: character.characterKey,
            name: character.name,
            role: character.role,
            description,
            storyContext: seriesRow
              ? { title: seriesRow.title, genre: seriesRow.genre ?? undefined, tone: seriesRow.tone ?? undefined }
              : undefined,
          });
        } catch (err) {
          if (err instanceof InsufficientCreditsError) {
            throw new TRPCError({ code: "FORBIDDEN", message: err.message });
          }
          if (err instanceof VdSchemaValidationError) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: err instanceof Error ? err.message : "Character visual prompt generation failed",
          });
        }
        turnaroundPrompt = promptResult.turnaroundPrompt;
        negativePrompt = promptResult.negativePrompt;
        promptModel = promptResult.model;
        visualBibleSummary = promptResult.raw.visual_bible_summary;
        promptCreditsUsed = promptResult.creditsUsed;
      }

      // 2. Pre-flight credit check for the image render — a SEPARATE charge
      //    from the prompt-generation LLM call above.
      const [pricingRow] = await db
        .select({ creditCost: mediaModels.creditCost, configJson: mediaModels.configJson })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, DEFAULT_MODELS.image))
        .limit(1);
      const pricingModel = pricingRow ?? { creditCost: 10, configJson: null };
      const imageCreditCost = calculateCreditCost(pricingModel, { numImages: 1 });

      const hasImageCredits = await hasEnoughCredits(userId, imageCreditCost);
      if (!hasImageCredits) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Insufficient credits for character sheet turnaround image render. Required: ${imageCreditCost}`,
        });
      }

      // 2.5. Identity-lock reference — same rationale as generateCharacterImage:
      //      attach the character's existing approved portrait as a
      //      `referenceImageUrls` input (this is the exact case the reference
      //      picker exists for — a turnaround generated after the portrait
      //      should depict the same person), and call it out in the prompt
      //      text itself so the model actually attends to the attached image.
      const referencePortraitUrl = await verticalDramaCharacterStockService.getPrimaryPortraitUrl(
        { tenantId, userId, seriesId },
        characterId,
      );
      const renderTurnaroundPrompt = referencePortraitUrl
        ? `${turnaroundPrompt} Use the attached reference image as this character's exact identity — match face, hairstyle, and skin tone precisely across every angle; do not alter identity.`
        : turnaroundPrompt;

      // 3. Submit — async, same convention as `generateCharacterImage` above
      //    (see its doc comment for the full rationale). Credits are
      //    RESERVED now; the caller polls `media.getTask({taskId})`, then
      //    finalizes via `resolveMediaAssetForImport` + `linkAsset`.
      await deductCredits({
        userId,
        tenantId,
        amount: imageCreditCost,
        description: `Vertical Drama — generate character sheet turnaround (character #${characterId}, reserved)`,
        sourceType: "media_image",
        metadata: {
          feature: "vertical_drama_character_turnaround",
          seriesId,
          characterId,
          type: "reservation",
          creditCost: imageCreditCost,
        },
      });

      const userToken = getCharacterPortraitUserToken(ctx);
      let task;
      try {
        task = await mediaGenerationService.generateImageAsync(
          {
            prompt: renderTurnaroundPrompt,
            negativePrompt,
            numImages: 1,
            aspectRatio: "9:16",
            ...(referencePortraitUrl ? { referenceImageUrls: [referencePortraitUrl] } : {}),
            publicUrl: ctx.publicUrl ?? undefined,
            auditContext: {
              userId,
              traceId: crypto.randomUUID(),
              source: "trpc.verticalDramaCharacters.generateCharacterTurnaround",
              stage: "submission",
            },
          },
          userToken,
        );
      } catch (err) {
        await refundCredits({
          userId,
          amount: imageCreditCost,
          description: `Refund: character sheet turnaround render failed to submit (character #${characterId})`,
          sourceType: "media_image",
          metadata: { feature: "vertical_drama_character_turnaround", seriesId, characterId },
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Character sheet turnaround image generation failed to submit",
        });
      }

      return {
        taskId: task.id,
        turnaroundPrompt,
        negativePrompt,
        promptModel,
        visualBibleSummary,
        creditsUsed: { promptGeneration: promptCreditsUsed },
      };
    }),

  /**
   * Full-spec Character Sheet — ONE multi-panel infographic image combining
   * portrait + turnaround (front/side/back) + facial-expression grid + outfit
   * variations + a compact stats sidebar, in the style of a production
   * character reference sheet. Distinct from `generateCharacterTurnaround`
   * (which renders only the simpler multi-angle turnaround prompt) — this is
   * a NEW, separate, additive action; the turnaround button is unchanged.
   *
   * Combines `fullBodyPrompt`/`expressionSheetPrompt`/`outfitSheetPrompt`
   * (computed by the visual-bible skill but previously discarded — see
   * `verticalDramaCharacterImageGeneration.ts`) with `turnaroundPrompt` into
   * one structured layout instruction, the same "instruct one image model
   * call to produce a multi-panel grid" technique already shipped and
   * live-verified for the Storyboard page's 3x3 multi-angle generation.
   *
   * Async submit + poll, same convention as every other real generation in
   * this codebase (shows in Media History, correct credit deduction).
   */
  generateCharacterSheet: verticalDramaProcedure
    .input(
      seriesScope.extend({
        characterId: z.string().min(1),
        approvedPrompt: z.string().min(1).optional(),
        approvedNegativePrompt: z.string().optional(),
        /** Language of the STATS TEXT/labels on the sheet — the character's
         *  own name is never translated, always rendered exactly as given. */
        sheetLanguage: z.enum(["en", "th"]).optional().default("en"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const characterId = parseId(input.characterId, "character id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      const character = await loadOwnedCharacter(tenantId, userId, seriesId, characterId);

      const [seriesRow] = await db
        .select({
          title: verticalDramaSeries.title,
          genre: verticalDramaSeries.genre,
          tone: verticalDramaSeries.tone,
        })
        .from(verticalDramaSeries)
        .where(and(eq(verticalDramaSeries.id, seriesId), eq(verticalDramaSeries.tenantId, tenantId)))
        .limit(1);

      const description = extractCharacterDescription(
        (character.data as Record<string, unknown> | null) ?? null,
      );
      const characterData = (character.data as Record<string, unknown> | null) ?? null;
      const personality = typeof characterData?.personality === "string" ? characterData.personality : undefined;
      const wardrobeRules = Array.isArray(characterData?.wardrobeRules)
        ? (characterData.wardrobeRules as unknown[]).filter((w): w is string => typeof w === "string")
        : [];

      let turnaroundPrompt: string;
      let fullBodyPrompt: string;
      let expressionSheetPrompt: string;
      let outfitSheetPrompt: string;
      let negativePrompt: string | undefined;
      let promptModel: string | null = null;
      let visualBibleSummary: Record<string, unknown> | null = null;
      let promptCreditsUsed = 0;

      if (input.approvedPrompt) {
        // A single pre-approved combined prompt (from a preview step) skips
        // regenerating the individual prompt fields — same skip-regeneration
        // contract `generateCharacterImage`/`generateCharacterTurnaround` use.
        turnaroundPrompt = input.approvedPrompt;
        fullBodyPrompt = "";
        expressionSheetPrompt = "";
        outfitSheetPrompt = "";
        negativePrompt = input.approvedNegativePrompt;
      } else {
        let promptResult;
        try {
          promptResult = await generateCharacterVisualPrompts({
            userId,
            tenantId,
            seriesId,
            characterId,
            characterKey: character.characterKey,
            name: character.name,
            role: character.role,
            description,
            storyContext: seriesRow
              ? { title: seriesRow.title, genre: seriesRow.genre ?? undefined, tone: seriesRow.tone ?? undefined }
              : undefined,
          });
        } catch (err) {
          if (err instanceof InsufficientCreditsError) {
            throw new TRPCError({ code: "FORBIDDEN", message: err.message });
          }
          if (err instanceof VdSchemaValidationError) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: err instanceof Error ? err.message : "Character visual prompt generation failed",
          });
        }
        turnaroundPrompt = promptResult.turnaroundPrompt;
        fullBodyPrompt = promptResult.fullBodyPrompt;
        expressionSheetPrompt = promptResult.expressionSheetPrompt;
        outfitSheetPrompt = promptResult.outfitSheetPrompt;
        negativePrompt = promptResult.negativePrompt;
        promptModel = promptResult.model;
        visualBibleSummary = promptResult.raw.visual_bible_summary;
        promptCreditsUsed = promptResult.creditsUsed;
      }

      // Multi-panel grid render — priced like the Storyboard page's 3x3
      // multi-angle generation (a single, more complex image call), not a
      // single portrait.
      const [pricingRow] = await db
        .select({ creditCost: mediaModels.creditCost, configJson: mediaModels.configJson })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, DEFAULT_MODELS.image))
        .limit(1);
      const pricingModel = pricingRow ?? { creditCost: 10, configJson: null };
      const sheetCreditCost = calculateCreditCost(pricingModel, { numImages: 2 });
      const hasCredits = await hasEnoughCredits(userId, sheetCreditCost);
      if (!hasCredits) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Insufficient credits for character sheet render. Required: ${sheetCreditCost}`,
        });
      }

      const referencePortraitUrl = await verticalDramaCharacterStockService.getPrimaryPortraitUrl(
        { tenantId, userId, seriesId },
        characterId,
      );

      const languageInstruction =
        input.sheetLanguage === "th"
          ? "All stat labels and text on the sheet must be in Thai, EXCEPT keep every UI-style section header readable."
          : "All stat labels and text on the sheet must be in English.";
      const statsBlock = [
        `Role: ${character.role ?? "supporting"}`,
        personality ? `Personality: ${personality}` : null,
        wardrobeRules.length ? `Signature wardrobe: ${wardrobeRules.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join(". ");

      const sheetPrompt = [
        `Design a professional character reference sheet (production "character sheet" infographic layout) for a character named exactly "${character.name}" — do not translate or alter the name, render it exactly as given.`,
        `${languageInstruction} The character's name itself is the one exception — always show it exactly as given, untranslated.`,
        "Layout: a large portrait panel on one side; a 3-pose turnaround row (front view, side view, back view) using this reference: " + turnaroundPrompt + ".",
        "A facial-expression grid (at least 4 small panels) using this reference: " + expressionSheetPrompt + ".",
        "An outfit/full-body panel using this reference: " + outfitSheetPrompt + " and " + fullBodyPrompt + ".",
        statsBlock ? `A compact stats sidebar with these details, formatted as short labeled lines: ${statsBlock}.` : null,
        "Keep the SAME character identity, face, and wardrobe consistent across every panel on the sheet.",
        "Clean, professional infographic background (light neutral), clear panel dividers, small section headers above each panel.",
      ]
        .filter(Boolean)
        .join(" ");

      const renderSheetPrompt = referencePortraitUrl
        ? `${sheetPrompt} Use the attached reference image as this character's exact identity across every panel — match face shape, skin tone, hairstyle precisely; do not alter identity.`
        : sheetPrompt;

      await deductCredits({
        userId,
        tenantId,
        amount: sheetCreditCost,
        description: `Vertical Drama — generate character sheet (character #${characterId}, reserved)`,
        sourceType: "media_image",
        metadata: {
          feature: "vertical_drama_character_sheet",
          seriesId,
          characterId,
          type: "reservation",
          creditCost: sheetCreditCost,
        },
      });

      const userToken = getCharacterPortraitUserToken(ctx);
      let task;
      try {
        task = await mediaGenerationService.generateImageAsync(
          {
            prompt: renderSheetPrompt,
            negativePrompt,
            numImages: 1,
            aspectRatio: "9:16",
            ...(referencePortraitUrl ? { referenceImageUrls: [referencePortraitUrl] } : {}),
            publicUrl: ctx.publicUrl ?? undefined,
            auditContext: {
              userId,
              traceId: crypto.randomUUID(),
              source: "trpc.verticalDramaCharacters.generateCharacterSheet",
              stage: "submission",
            },
          },
          userToken,
        );
      } catch (err) {
        await refundCredits({
          userId,
          amount: sheetCreditCost,
          description: `Refund: character sheet render failed to submit (character #${characterId})`,
          sourceType: "media_image",
          metadata: { feature: "vertical_drama_character_sheet", seriesId, characterId },
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Character sheet image generation failed to submit",
        });
      }

      return {
        taskId: task.id,
        promptModel,
        visualBibleSummary,
        creditsUsed: { promptGeneration: promptCreditsUsed },
      };
    }),
});

export type VerticalDramaCharactersRouter = typeof verticalDramaCharactersRouter;
