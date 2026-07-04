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
  type VerticalDramaSeriesRow,
  type VerticalDramaGenrePresetRow,
} from "../../drizzle/schema";
import {
  generateStoryBible,
  InsufficientCreditsError,
  VdSchemaValidationError,
} from "../services/verticalDramaStoryBible";

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
});

export type VerticalDramaSeriesRouter = typeof verticalDramaSeriesRouter;
