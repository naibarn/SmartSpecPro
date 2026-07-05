/**
 * Vertical Drama Series — base series router (spec feature 131, section 03).
 *
 * Series CRUD used by the feature-flagged Dashboard workspace. Every procedure
 * is protected (auth required), gated on the `verticalDramaSeries` tenant
 * feature flag (fail-closed), and scoped to the caller's tenant + user so a
 * user can never read or mutate another tenant's or user's series.
 *
 * The conductor wires this router into `server/routers.ts` — do NOT edit that
 * file here.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { requireFeatureFlag } from "../middleware/requireFeatureFlag";
import { db } from "../db";
import {
  verticalDramaSeries,
  verticalDramaEpisodes,
  verticalDramaApprovalCheckpoints,
  verticalDramaGenrePresets,
  verticalDramaCharacters,
  verticalDramaCharacterAssets,
  verticalDramaRunArtifacts,
  verticalDramaShotReferences,
  verticalDramaEpisodeRuns,
  verticalDramaMemoryEvents,
  verticalDramaMemorySnapshots,
  verticalDramaQcReports,
  type VerticalDramaSeriesRow,
  type VerticalDramaGenrePresetRow,
} from "../../drizzle/schema";
import {
  generateStoryBible,
  InsufficientCreditsError,
  VdSchemaValidationError,
} from "../services/verticalDramaStoryBible";
import { debugError } from "../_core/logger";

/** Per-series episode aggregate row shape (typed projection; `db.select` erases to `any`). */
type EpisodeAggRow = { seriesId: number; maxEpisodeNumber: number; episodeCount: number };
/** Per-series pending-approval aggregate row shape. */
type ApprovalAggRow = { seriesId: number; pendingCount: number };
/** Light episode projection returned by the Series detail query. */
type EpisodeListProjection = {
  id: number;
  episodeNumber: number;
  title: string | null;
  status: string;
  targetDurationSeconds: number;
  updatedAt: Date;
};
/** Character asset projection (joined to character name) for the Assets tab. */
type CharacterAssetProjection = {
  id: number;
  characterId: number | null;
  characterName: string | null;
  mediaAssetId: number | null;
  assetType: string;
  role: string | null;
  approved: boolean;
  qcStatus: string;
  createdAt: Date;
};
/** Run artifact projection for the Assets tab. */
type RunArtifactProjection = {
  id: number;
  episodeId: number;
  stage: string;
  storageKey: string | null;
  mediaAssetIds: unknown;
  createdAt: Date;
};

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Base procedure for the vertical drama series surface: authenticated AND gated
 * on the canonical `verticalDramaSeries` feature flag (fail-closed).
 */
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

/** Ownership predicate reused by every query: tenant + user + id. */
function seriesOwnershipWhere(tenantId: string, userId: number, seriesId: number) {
  return and(
    eq(verticalDramaSeries.id, seriesId),
    eq(verticalDramaSeries.tenantId, tenantId),
    eq(verticalDramaSeries.userId, userId),
  );
}

/**
 * Load a series row the caller owns, or throw NOT_FOUND. NOT_FOUND (not
 * FORBIDDEN) is deliberate so we never disclose the existence of another
 * tenant's/user's series.
 */
async function loadOwnedSeries(tenantId: string, userId: number, seriesId: number) {
  const [row] = await db
    .select()
    .from(verticalDramaSeries)
    .where(seriesOwnershipWhere(tenantId, userId, seriesId))
    .limit(1);
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Series not found" });
  }
  return row;
}

/**
 * Best-effort parse of the wizard's freeform "characters" textarea (one line
 * per character) back into `{ name, role, description }[]` for "Save as
 * preset". `CreateSeriesWizard.tsx`'s `applyPreset` writes this exact
 * `name — role: description` shape when a preset is applied, so
 * preset -> series -> re-saved-as-preset round-trips losslessly; any line
 * that doesn't match becomes `{ name: line, role: "", description: "" }`.
 */
function parseCharactersDraft(draft: string): Array<{ name: string; role: string; description: string }> {
  return draft
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.+?)\s+—\s+(.+?):\s*(.*)$/);
      if (match) {
        return { name: match[1].trim(), role: match[2].trim(), description: match[3].trim() };
      }
      return { name: line, role: "", description: "" };
    });
}

/**
 * Slugify a character name into a `characterKey` candidate (lowercase,
 * non-alphanumeric collapsed to `-`, trimmed). Falls back to `"character"`
 * for names that are entirely non-alphanumeric (e.g. emoji-only input) so we
 * never produce an empty `characterKey`.
 */
function slugifyCharacterName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "character";
}

/**
 * Seed the durable `vertical_drama_characters` roster from the wizard's
 * freeform `bible.charactersDraft` text (already parsed by
 * `parseCharactersDraft`). Best-effort only: the series shell must never fail
 * to be created because of a character-seeding problem, so callers must wrap
 * this in a try/catch (see `create` below) — this function itself does not
 * swallow errors so callers can log them.
 *
 * `characterKey` is derived from the character name and de-duplicated within
 * this batch (`-2`, `-3`, ...) to satisfy the `(seriesId, characterKey)`
 * unique constraint; blank/whitespace-only names are skipped.
 */
async function seedCharactersFromDraft(
  tenantId: string,
  userId: number,
  seriesId: number,
  charactersDraft: string,
): Promise<void> {
  const parsed = parseCharactersDraft(charactersDraft).filter((c) => c.name.trim().length > 0);
  if (parsed.length === 0) return;

  const usedKeys = new Set<string>();
  const rows = parsed.map((character) => {
    const base = slugifyCharacterName(character.name);
    let key = base;
    let suffix = 2;
    while (usedKeys.has(key)) {
      key = `${base}-${suffix}`;
      suffix += 1;
    }
    usedKeys.add(key);

    return {
      tenantId,
      userId,
      seriesId,
      characterKey: key,
      name: character.name,
      role: character.role || null,
      data: character.description ? { description: character.description } : null,
    } as typeof verticalDramaCharacters.$inferInsert;
  });

  await db.insert(verticalDramaCharacters).values(rows);
}

/* -------------------------------------------------------------------------- */
/* Input schemas                                                              */
/* -------------------------------------------------------------------------- */

const SERIES_STATUSES = [
  "draft",
  "planning",
  "active",
  "paused",
  "completed",
  "archived",
] as const;

const createSeriesInput = z.object({
  title: z.string().trim().min(1).max(255),
  locale: z.enum(["th", "en"]).optional(),
  aspectRatio: z.literal("9:16").optional(),
  targetEpisodeCount: z.number().int().positive().max(1000).optional(),
  defaultEpisodeDurationSeconds: z.number().int().positive().max(3600).optional(),
  genre: z.string().trim().max(100).optional(),
  tone: z.string().trim().max(100).optional(),
  targetAudience: z.string().trim().max(100).optional(),
  agePolicyId: z.string().trim().max(64).optional(),
  // Wizard shell payloads — stored losslessly, validated by their own contracts.
  bible: z.record(z.string(), z.unknown()).optional(),
  memory: z.record(z.string(), z.unknown()).optional(),
  productTieIn: z.record(z.string(), z.unknown()).optional(),
  policy: z.record(z.string(), z.unknown()).optional(),
});

const listSeriesInput = z
  .object({
    search: z.string().trim().max(255).optional(),
    status: z.enum(SERIES_STATUSES).optional(),
    /** When false (default) archived series are excluded from the list. */
    includeArchived: z.boolean().optional(),
    limit: z.number().int().positive().max(200).optional(),
  })
  .optional();

/**
 * Edit an owned series' metadata. Every field is optional so callers can patch
 * just what changed; ownership is re-checked so a cross-tenant/user id can never
 * be mutated (surfaced as NOT_FOUND, never FORBIDDEN). Like `create`, this is a
 * metadata-only write and MUST NOT trigger any paid generation.
 */
const updateSeriesInput = z.object({
  seriesId: z.string().min(1),
  title: z.string().trim().min(1).max(255).optional(),
  status: z.enum(SERIES_STATUSES).optional(),
  // Wizard shell payloads — stored losslessly, validated by their own contracts.
  bible: z.record(z.string(), z.unknown()).optional(),
  policy: z.record(z.string(), z.unknown()).optional(),
  productTieIn: z.record(z.string(), z.unknown()).optional(),
});

/* -------------------------------------------------------------------------- */
/* Router                                                                     */
/* -------------------------------------------------------------------------- */

export const verticalDramaSeriesRouter = router({
  /**
   * List series owned by the caller (tenant + user scoped), newest first, with
   * the light per-series aggregates the Series List surface renders: next
   * episode number, episode count, pending-approval count, product tie-in flag.
   */
  list: verticalDramaProcedure.input(listSeriesInput).query(async ({ ctx, input }) => {
    const tenantId = requireTenantId(ctx.tenantId);
    const userId = ctx.user.id;
    const opts = input ?? {};

    const conditions = [
      eq(verticalDramaSeries.tenantId, tenantId),
      eq(verticalDramaSeries.userId, userId),
    ];
    if (opts.status) {
      conditions.push(eq(verticalDramaSeries.status, opts.status));
    } else if (!opts.includeArchived) {
      conditions.push(sql`${verticalDramaSeries.status} <> 'archived'`);
    }
    if (opts.search) {
      conditions.push(sql`${verticalDramaSeries.title} ILIKE ${"%" + opts.search + "%"}`);
    }

    const rows: VerticalDramaSeriesRow[] = await db
      .select()
      .from(verticalDramaSeries)
      .where(and(...conditions))
      .orderBy(desc(verticalDramaSeries.updatedAt))
      .limit(opts.limit ?? 100);

    const seriesIds = rows.map((r) => r.id);

    // Per-series episode aggregates (max episode number + count) in one query.
    const episodeAgg: EpisodeAggRow[] =
      seriesIds.length > 0
        ? await db
            .select({
              seriesId: verticalDramaEpisodes.seriesId,
              maxEpisodeNumber: sql<number>`COALESCE(MAX(${verticalDramaEpisodes.episodeNumber}), 0)`,
              episodeCount: sql<number>`COUNT(*)`,
            })
            .from(verticalDramaEpisodes)
            .where(
              and(
                eq(verticalDramaEpisodes.tenantId, tenantId),
                eq(verticalDramaEpisodes.userId, userId),
                inArray(verticalDramaEpisodes.seriesId, seriesIds),
              ),
            )
            .groupBy(verticalDramaEpisodes.seriesId)
        : [];

    // Pending-approval counts (missing-approval badges) per series.
    const approvalAgg: ApprovalAggRow[] =
      seriesIds.length > 0
        ? await db
            .select({
              seriesId: verticalDramaApprovalCheckpoints.seriesId,
              pendingCount: sql<number>`COUNT(*)`,
            })
            .from(verticalDramaApprovalCheckpoints)
            .where(
              and(
                eq(verticalDramaApprovalCheckpoints.tenantId, tenantId),
                eq(verticalDramaApprovalCheckpoints.userId, userId),
                inArray(verticalDramaApprovalCheckpoints.seriesId, seriesIds),
                eq(verticalDramaApprovalCheckpoints.state, "pending"),
              ),
            )
            .groupBy(verticalDramaApprovalCheckpoints.seriesId)
        : [];

    const maxBySeries = new Map(episodeAgg.map((a) => [a.seriesId, a]));
    const pendingBySeries = new Map(approvalAgg.map((a) => [a.seriesId, Number(a.pendingCount)]));

    return {
      series: rows.map((row) => {
        const agg = maxBySeries.get(row.id);
        const productTieIn = row.productTieIn as { enabled?: boolean } | null;
        return {
          id: String(row.id),
          title: row.title,
          status: row.status,
          locale: row.locale,
          aspectRatio: row.aspectRatio,
          genre: row.genre,
          tone: row.tone,
          targetEpisodeCount: row.targetEpisodeCount,
          episodeCount: Number(agg?.episodeCount ?? 0),
          nextEpisodeNumber: Number(agg?.maxEpisodeNumber ?? 0) + 1,
          pendingApprovalCount: pendingBySeries.get(row.id) ?? 0,
          productTieInEnabled: productTieIn?.enabled === true,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      }),
    };
  }),

  /**
   * Create a series SHELL in dry-run mode. This persists metadata only and
   * MUST NOT trigger any paid generation. Ownership is stamped from the
   * authenticated context (never client-supplied).
   */
  create: verticalDramaProcedure.input(createSeriesInput).mutation(async ({ ctx, input }) => {
    const tenantId = requireTenantId(ctx.tenantId);
    const userId = ctx.user.id;

    const [row] = await db
      .insert(verticalDramaSeries)
      .values({
        tenantId,
        userId,
        title: input.title,
        locale: input.locale ?? "th",
        aspectRatio: input.aspectRatio ?? "9:16",
        status: "draft",
        targetEpisodeCount: input.targetEpisodeCount ?? 10,
        defaultEpisodeDurationSeconds: input.defaultEpisodeDurationSeconds ?? 60,
        genre: input.genre ?? null,
        tone: input.tone ?? null,
        targetAudience: input.targetAudience ?? null,
        agePolicyId: input.agePolicyId ?? null,
        bible: input.bible ?? null,
        memory: input.memory ?? null,
        productTieIn: input.productTieIn ?? null,
        policy: input.policy ?? null,
      })
      .returning();

    // Best-effort: seed the durable character roster (`vertical_drama_characters`,
    // read by the Series Detail Characters tab) from the wizard's freeform
    // `bible.charactersDraft` text. Never allowed to fail series creation.
    const charactersDraft = input.bible?.charactersDraft;
    if (typeof charactersDraft === "string" && charactersDraft.trim().length > 0) {
      try {
        await seedCharactersFromDraft(tenantId, userId, Number(row.id), charactersDraft);
      } catch (error) {
        debugError(
          "verticalDramaSeries.create",
          `Failed to seed characters for series ${row.id} from charactersDraft`,
          error,
        );
      }
    }

    return { series: { ...row, id: String(row.id) } };
  }),

  /**
   * Fetch a single owned series plus its episodes (light projection) for the
   * Series detail workspace. Ownership enforced on both queries.
   */
  get: verticalDramaProcedure
    .input(z.object({ seriesId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid series id" });
      }

      const row = await loadOwnedSeries(tenantId, userId, seriesId);

      const episodes: EpisodeListProjection[] = await db
        .select({
          id: verticalDramaEpisodes.id,
          episodeNumber: verticalDramaEpisodes.episodeNumber,
          title: verticalDramaEpisodes.title,
          status: verticalDramaEpisodes.status,
          targetDurationSeconds: verticalDramaEpisodes.targetDurationSeconds,
          updatedAt: verticalDramaEpisodes.updatedAt,
        })
        .from(verticalDramaEpisodes)
        .where(
          and(
            eq(verticalDramaEpisodes.tenantId, tenantId),
            eq(verticalDramaEpisodes.userId, userId),
            eq(verticalDramaEpisodes.seriesId, seriesId),
          ),
        )
        .orderBy(verticalDramaEpisodes.episodeNumber);

      return {
        series: { ...row, id: String(row.id) },
        episodes: episodes.map((e) => ({ ...e, id: String(e.id) })),
      };
    }),

  /**
   * List the Assets tab's two backing collections for an owned series:
   * character/product reference assets (`vertical_drama_character_assets`,
   * joined to the character name) and durable run artifacts
   * (`vertical_drama_run_artifacts`). Read-only; ownership enforced via
   * `loadOwnedSeries` plus tenant+user+seriesId scoping on both queries.
   */
  listSeriesAssets: verticalDramaProcedure
    .input(z.object({ seriesId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid series id" });
      }

      // Ensure the caller owns it (throws NOT_FOUND otherwise).
      await loadOwnedSeries(tenantId, userId, seriesId);

      const characterAssetRows: CharacterAssetProjection[] = await db
        .select({
          id: verticalDramaCharacterAssets.id,
          characterId: verticalDramaCharacterAssets.characterId,
          characterName: verticalDramaCharacters.name,
          mediaAssetId: verticalDramaCharacterAssets.mediaAssetId,
          assetType: verticalDramaCharacterAssets.assetType,
          role: verticalDramaCharacterAssets.role,
          approved: verticalDramaCharacterAssets.approved,
          qcStatus: verticalDramaCharacterAssets.qcStatus,
          createdAt: verticalDramaCharacterAssets.createdAt,
        })
        .from(verticalDramaCharacterAssets)
        .leftJoin(
          verticalDramaCharacters,
          eq(verticalDramaCharacterAssets.characterId, verticalDramaCharacters.id),
        )
        .where(
          and(
            eq(verticalDramaCharacterAssets.tenantId, tenantId),
            eq(verticalDramaCharacterAssets.userId, userId),
            eq(verticalDramaCharacterAssets.seriesId, seriesId),
          ),
        )
        .orderBy(desc(verticalDramaCharacterAssets.createdAt));

      const runArtifactRows: RunArtifactProjection[] = await db
        .select({
          id: verticalDramaRunArtifacts.id,
          episodeId: verticalDramaRunArtifacts.episodeId,
          stage: verticalDramaRunArtifacts.stage,
          storageKey: verticalDramaRunArtifacts.storageKey,
          mediaAssetIds: verticalDramaRunArtifacts.mediaAssetIds,
          createdAt: verticalDramaRunArtifacts.createdAt,
        })
        .from(verticalDramaRunArtifacts)
        .where(
          and(
            eq(verticalDramaRunArtifacts.tenantId, tenantId),
            eq(verticalDramaRunArtifacts.userId, userId),
            eq(verticalDramaRunArtifacts.seriesId, seriesId),
          ),
        )
        .orderBy(desc(verticalDramaRunArtifacts.createdAt));

      return {
        characterAssets: characterAssetRows.map((row) => ({
          id: String(row.id),
          characterId: row.characterId !== null ? String(row.characterId) : null,
          characterName: row.characterName ?? null,
          mediaAssetId: row.mediaAssetId !== null ? String(row.mediaAssetId) : null,
          assetType: row.assetType,
          role: row.role ?? null,
          approved: row.approved,
          qcStatus: row.qcStatus,
          createdAt: row.createdAt.toISOString(),
        })),
        runArtifacts: runArtifactRows.map((row) => ({
          id: String(row.id),
          episodeId: String(row.episodeId),
          stage: row.stage,
          storageKey: row.storageKey ?? null,
          mediaAssetIds: (row.mediaAssetIds as number[] | null) ?? [],
          createdAt: row.createdAt.toISOString(),
        })),
      };
    }),

  /**
   * Soft-archive a series (status -> "archived"). History surfaces stay
   * readable; nothing is destroyed. Ownership enforced.
   */
  archiveSeries: verticalDramaProcedure
    .input(z.object({ seriesId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid series id" });
      }

      // Ensure the caller owns it (throws NOT_FOUND otherwise).
      await loadOwnedSeries(tenantId, userId, seriesId);

      const [row] = await db
        .update(verticalDramaSeries)
        .set({ status: "archived", updatedAt: new Date() })
        .where(seriesOwnershipWhere(tenantId, userId, seriesId))
        .returning();

      return { series: { ...row, id: String(row.id) } };
    }),

  /**
   * Update an owned series' title / bible / policy / status. Ownership is
   * enforced (NOT_FOUND on a cross-tenant/user id). Metadata-only — never
   * triggers paid generation. Only supplied fields are written.
   */
  updateSeries: verticalDramaProcedure
    .input(updateSeriesInput)
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid series id" });
      }

      // Ensure the caller owns it (throws NOT_FOUND otherwise).
      await loadOwnedSeries(tenantId, userId, seriesId);

      const updates: Partial<typeof verticalDramaSeries.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (input.title !== undefined) updates.title = input.title;
      if (input.status !== undefined) updates.status = input.status;
      if (input.bible !== undefined) updates.bible = input.bible;
      if (input.policy !== undefined) updates.policy = input.policy;
      if (input.productTieIn !== undefined) updates.productTieIn = input.productTieIn;

      const [row] = await db
        .update(verticalDramaSeries)
        .set(updates)
        .where(seriesOwnershipWhere(tenantId, userId, seriesId))
        .returning();

      return { series: { ...row, id: String(row.id) } };
    }),

  /**
   * Genre preset catalog for the Create-Series Wizard's "start from a preset"
   * picker. Returns `scope: "global"` presets (visible to everyone — the
   * seeded catalog plus anything an admin published) plus the caller's own
   * `scope: "private"` presets (their own "Save as preset" saves, invisible
   * to other users). Still gated behind the feature flag like every other
   * procedure on this router.
   */
  listGenrePresets: verticalDramaProcedure
    .input(z.object({ locale: z.enum(["th", "en"]).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const locale = input?.locale ?? "th";
      const tenantId = ctx.tenantId;
      const userId = ctx.user.id;
      const rows: VerticalDramaGenrePresetRow[] = await db
        .select()
        .from(verticalDramaGenrePresets)
        .where(
          and(
            eq(verticalDramaGenrePresets.locale, locale),
            tenantId
              ? or(
                  eq(verticalDramaGenrePresets.scope, "global"),
                  and(
                    eq(verticalDramaGenrePresets.scope, "private"),
                    eq(verticalDramaGenrePresets.tenantId, tenantId),
                    eq(verticalDramaGenrePresets.userId, userId),
                  ),
                )
              : eq(verticalDramaGenrePresets.scope, "global"),
          ),
        )
        .orderBy(asc(verticalDramaGenrePresets.sortOrder));

      return {
        presets: rows.map((row) => ({
          id: String(row.id),
          title: row.title,
          category: row.category,
          scope: row.scope,
          logline: row.logline,
          mainPlot: row.mainPlot,
          seasonArc: row.seasonArc,
          tone: row.tone,
          cliffhangerStyle: row.cliffhangerStyle,
          characters: row.charactersJson as Array<{ name: string; role: string; description: string }>,
          visualBible: row.visualBible,
        })),
      };
    }),

  /**
   * Expand an owned series' wizard-gathered bible into a full season/episode
   * story bible via a real LLM call. Unlike `create`/`updateSeries`, this is
   * a genuinely paid action (credit-gated) — the first real generation step
   * in this feature area. Ownership enforced; writes the result back into
   * the existing `bible` jsonb column (no schema change needed).
   */
  generateStoryBible: verticalDramaProcedure
    .input(z.object({ seriesId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid series id" });
      }

      const row = await loadOwnedSeries(tenantId, userId, seriesId);
      const bible = (row.bible as Record<string, unknown> | null) ?? {};

      let result;
      try {
        result = await generateStoryBible({
          userId,
          tenantId,
          seriesId,
          title: row.title,
          locale: (row.locale as "th" | "en") ?? "th",
          genre: row.genre,
          tone: row.tone,
          targetEpisodeCount: row.targetEpisodeCount,
          bible,
        });
      } catch (error) {
        if (error instanceof InsufficientCreditsError) {
          throw new TRPCError({ code: "FORBIDDEN", message: error.message });
        }
        if (error instanceof VdSchemaValidationError) {
          throw new TRPCError({ code: "UNPROCESSABLE_CONTENT", message: error.message });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Story bible generation failed",
        });
      }

      const updatedBible = {
        ...bible,
        expandedSeasonArc: result.expanded.expandedSeasonArc,
        refinedCharacters: result.expanded.refinedCharacters,
        episodeBreakdown: result.expanded.episodeBreakdown,
        expandedAt: new Date().toISOString(),
      };

      const [updatedRow] = await db
        .update(verticalDramaSeries)
        .set({ bible: updatedBible, updatedAt: new Date() })
        .where(seriesOwnershipWhere(tenantId, userId, seriesId))
        .returning();

      return {
        series: { ...updatedRow, id: String(updatedRow.id) },
        creditsUsed: result.creditsUsed,
        model: result.model,
      };
    }),

  /**
   * Save an owned series (the project the user is already editing) as a
   * reusable genre preset — no separate preset-management screen. Defaults to
   * `scope: "private"` (visible only to the saving user); `publishGlobally`
   * is only honored for callers with the `admin` role, in which case the
   * preset becomes `scope: "global"` (visible to every user, indistinguishable
   * from the seeded catalog).
   */
  saveSeriesAsPreset: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        title: z.string().trim().min(1).max(150),
        publishGlobally: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid series id" });
      }

      const row = await loadOwnedSeries(tenantId, userId, seriesId);
      const bible = (row.bible as Record<string, unknown> | null) ?? {};
      const charactersDraft = typeof bible.charactersDraft === "string" ? bible.charactersDraft : "";

      const isAdmin = ctx.user.role === "admin";
      const publishGlobally = Boolean(input.publishGlobally) && isAdmin;

      const [created] = await db
        .insert(verticalDramaGenrePresets)
        .values({
          title: input.title,
          category: row.genre?.trim() || input.title.toLowerCase().replace(/\s+/g, "-").slice(0, 60),
          locale: (row.locale as "th" | "en") ?? "th",
          logline: (bible.logline as string) ?? "",
          mainPlot: (bible.mainPlot as string) ?? "",
          seasonArc: (bible.seasonArc as string) ?? "",
          tone: row.tone ?? "",
          cliffhangerStyle: (bible.cliffhangerStyle as string) ?? "",
          charactersJson: parseCharactersDraft(charactersDraft),
          visualBible: (bible.visualStyle as string) ?? "",
          sortOrder: 0,
          scope: publishGlobally ? "global" : "private",
          tenantId: publishGlobally ? null : tenantId,
          userId: publishGlobally ? null : userId,
        })
        .returning();

      return {
        preset: { id: String(created.id), title: created.title, scope: created.scope },
      };
    }),

  /**
   * PERMANENTLY delete an owned series and every child row (episodes,
   * storyboard/shot references, character stock + reference links, episode
   * runs/artifacts/checkpoints, memory events/snapshots, QC reports).
   *
   * All ten child tables that reference `vertical_drama_series.id` are
   * declared with `onDelete: "cascade"` in `drizzle/schema.ts`, so deleting
   * the parent row inside a transaction is sufficient for the database to
   * remove every dependent row atomically — there is nothing to manually
   * cascade. This mutation still runs inside `db.transaction` so the
   * pre-delete COUNT aggregates (used for the confirmation toast) and the
   * delete itself observe a single consistent snapshot.
   *
   * `media_assets` rows are NEVER deleted — only the link rows in
   * `vertical_drama_character_assets` / `vertical_drama_shot_references`
   * that reference them are removed by the cascade; the underlying media
   * library assets remain untouched and reusable by other series/features.
   *
   * Defense-in-depth: in addition to the standard ownership guard, the
   * caller must pass `confirmName` matching the series title exactly
   * (case-sensitive, no trimming) or the mutation is rejected before any
   * row is touched. This mirrors the client's "type the series name to
   * confirm" dialog so a scripted/replayed request can't skip that guard.
   */
  deleteSeries: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        confirmName: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid series id" });
      }

      // Ensure the caller owns it (throws NOT_FOUND otherwise — never
      // discloses existence of another tenant's/user's series).
      const row = await loadOwnedSeries(tenantId, userId, seriesId);

      if (input.confirmName !== row.title) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Series name confirmation does not match — deletion aborted",
        });
      }

      const counts = await db.transaction(async (tx) => {
        const [
          [episodesAgg],
          [charactersAgg],
          [characterAssetsAgg],
          [shotReferencesAgg],
          [episodeRunsAgg],
          [runArtifactsAgg],
          [approvalCheckpointsAgg],
          [memoryEventsAgg],
          [memorySnapshotsAgg],
          [qcReportsAgg],
        ] = await Promise.all([
          tx
            .select({ count: sql<number>`COUNT(*)` })
            .from(verticalDramaEpisodes)
            .where(and(eq(verticalDramaEpisodes.tenantId, tenantId), eq(verticalDramaEpisodes.seriesId, seriesId))),
          tx
            .select({ count: sql<number>`COUNT(*)` })
            .from(verticalDramaCharacters)
            .where(and(eq(verticalDramaCharacters.tenantId, tenantId), eq(verticalDramaCharacters.seriesId, seriesId))),
          tx
            .select({ count: sql<number>`COUNT(*)` })
            .from(verticalDramaCharacterAssets)
            .where(and(eq(verticalDramaCharacterAssets.tenantId, tenantId), eq(verticalDramaCharacterAssets.seriesId, seriesId))),
          tx
            .select({ count: sql<number>`COUNT(*)` })
            .from(verticalDramaShotReferences)
            .where(and(eq(verticalDramaShotReferences.tenantId, tenantId), eq(verticalDramaShotReferences.seriesId, seriesId))),
          tx
            .select({ count: sql<number>`COUNT(*)` })
            .from(verticalDramaEpisodeRuns)
            .where(and(eq(verticalDramaEpisodeRuns.tenantId, tenantId), eq(verticalDramaEpisodeRuns.seriesId, seriesId))),
          tx
            .select({ count: sql<number>`COUNT(*)` })
            .from(verticalDramaRunArtifacts)
            .where(and(eq(verticalDramaRunArtifacts.tenantId, tenantId), eq(verticalDramaRunArtifacts.seriesId, seriesId))),
          tx
            .select({ count: sql<number>`COUNT(*)` })
            .from(verticalDramaApprovalCheckpoints)
            .where(and(eq(verticalDramaApprovalCheckpoints.tenantId, tenantId), eq(verticalDramaApprovalCheckpoints.seriesId, seriesId))),
          tx
            .select({ count: sql<number>`COUNT(*)` })
            .from(verticalDramaMemoryEvents)
            .where(and(eq(verticalDramaMemoryEvents.tenantId, tenantId), eq(verticalDramaMemoryEvents.seriesId, seriesId))),
          tx
            .select({ count: sql<number>`COUNT(*)` })
            .from(verticalDramaMemorySnapshots)
            .where(and(eq(verticalDramaMemorySnapshots.tenantId, tenantId), eq(verticalDramaMemorySnapshots.seriesId, seriesId))),
          tx
            .select({ count: sql<number>`COUNT(*)` })
            .from(verticalDramaQcReports)
            .where(and(eq(verticalDramaQcReports.tenantId, tenantId), eq(verticalDramaQcReports.seriesId, seriesId))),
        ]);

        const episodesDeleted = Number(episodesAgg?.count ?? 0);
        const charactersDeleted = Number(charactersAgg?.count ?? 0);
        const characterAssetsDeleted = Number(characterAssetsAgg?.count ?? 0);
        const shotReferencesDeleted = Number(shotReferencesAgg?.count ?? 0);
        const episodeRunsDeleted = Number(episodeRunsAgg?.count ?? 0);
        const runArtifactsDeleted = Number(runArtifactsAgg?.count ?? 0);
        const approvalCheckpointsDeleted = Number(approvalCheckpointsAgg?.count ?? 0);
        const memoryEventsDeleted = Number(memoryEventsAgg?.count ?? 0);
        const memorySnapshotsDeleted = Number(memorySnapshotsAgg?.count ?? 0);
        const qcReportsDeleted = Number(qcReportsAgg?.count ?? 0);

        // Deleting the parent row cascades to every child table above at
        // the database level (all declared `onDelete: "cascade"` on
        // `seriesId`) — `media_assets` rows themselves are never touched.
        await tx
          .delete(verticalDramaSeries)
          .where(seriesOwnershipWhere(tenantId, userId, seriesId));

        return {
          episodesDeleted,
          charactersDeleted,
          characterAssetsDeleted,
          shotReferencesDeleted,
          episodeRunsDeleted,
          runArtifactsDeleted,
          approvalCheckpointsDeleted,
          memoryEventsDeleted,
          memorySnapshotsDeleted,
          qcReportsDeleted,
        };
      });

      return { deleted: true, seriesId: input.seriesId, ...counts };
    }),
});

export type VerticalDramaSeriesRouter = typeof verticalDramaSeriesRouter;
