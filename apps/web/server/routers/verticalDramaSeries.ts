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
  mediaAssets,
  type VerticalDramaSeriesRow,
  type VerticalDramaGenrePresetRow,
} from "../../drizzle/schema";
import type {
  VerticalDramaStartFramePlan,
  VerticalDramaMotionPromptPack,
  VerticalDramaSeriesTrailerState,
} from "@shared/verticalDramaSeries";
import {
  VERTICAL_DRAMA_SERIES_LOCALES,
  normalizeVerticalDramaSeriesLocale,
  CREATE_SERIES_FIELD_LIMITS,
} from "@shared/verticalDramaSeries";
import {
  VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS,
  type VerticalDramaTargetAudienceRegion,
} from "@shared/verticalDramaSeries/targetAudienceRegion";
import {
  generateStoryBible,
  InsufficientCreditsError,
  VdSchemaValidationError,
} from "../services/verticalDramaStoryBible";
import {
  PresetSynthesisInputError,
  synthesizeVerticalDramaPreset,
} from "../services/verticalDramaPresetSynthesis";
import { debugError } from "../_core/logger";
import {
  resolveSeriesThumbnailUrls,
  resolveEpisodeThumbnailUrls,
} from "../services/verticalDramaThumbnails";
import { submitTrailerJob, getTrailerJobStatus } from "../services/verticalDramaSeriesTrailerAssembly";
import { getCachedAppRuntimeConfig } from "../services/appRuntimeConfig";

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
type GenrePresetDto = {
  id: string;
  title: string;
  category: string;
  scope: string;
  logline: string;
  mainPlot: string;
  seasonArc: string;
  tone: string;
  cliffhangerStyle: string;
  characters: Array<{ name: string; role: string; description: string }>;
  visualBible: string;
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

function toGenrePresetDto(row: VerticalDramaGenrePresetRow): GenrePresetDto {
  return {
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
  };
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

/**
 * Exported (in addition to being used inline below) so tests can assert this
 * schema's length limits stay in lockstep with `CREATE_SERIES_FIELD_LIMITS`
 * (the shared source of truth also used by preset synthesis clamping and the
 * Create Series wizard) — see createSeriesFieldLimits.agreement.test.ts.
 */
export const createSeriesInput = z.object({
  title: z.string().trim().min(1).max(CREATE_SERIES_FIELD_LIMITS.title),
  locale: z.enum(VERTICAL_DRAMA_SERIES_LOCALES).optional(),
  aspectRatio: z.literal("9:16").optional(),
  targetEpisodeCount: z.number().int().positive().max(1000).optional(),
  defaultEpisodeDurationSeconds: z.number().int().positive().max(3600).optional(),
  genre: z.string().trim().max(CREATE_SERIES_FIELD_LIMITS.genre).optional(),
  tone: z.string().trim().max(CREATE_SERIES_FIELD_LIMITS.tone).optional(),
  targetAudience: z.string().trim().max(CREATE_SERIES_FIELD_LIMITS.targetAudience).optional(),
  agePolicyId: z.string().trim().max(CREATE_SERIES_FIELD_LIMITS.agePolicyId).optional(),
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

const synthesizeGenrePresetInput = z.object({
  locale: z.enum(["th", "en"]).optional(),
  selectedPresetIds: z.array(z.string().min(1)).max(5).optional(),
  selectedCategories: z.array(z.string().trim().min(1).max(80)).max(5).optional(),
  primarySelectionId: z.string().trim().max(100).optional(),
  businessContext: z.string().trim().max(600).optional(),
  productContext: z.string().trim().max(600).optional(),
  targetEpisodeCount: z.number().int().positive().max(1000).optional(),
  toneHint: z.string().trim().max(180).optional(),
});

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

    // Derived thumbnails (no schema change) — episode 1's approved shot image
    // per series, resolved from `startFramePlan.frames[i].approvedMediaAssetId`.
    const thumbnailBySeries = await resolveSeriesThumbnailUrls(db, {
      tenantId,
      userId,
      seriesIds,
    });

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
          thumbnailUrl: thumbnailBySeries.get(row.id) ?? null,
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

      // Derived thumbnails (no schema change) — each episode's own approved
      // shot image, resolved from `startFramePlan.frames[i].approvedMediaAssetId`.
      const thumbnailByEpisode = await resolveEpisodeThumbnailUrls(db, {
        tenantId,
        userId,
        episodeIds: episodes.map((e) => e.id),
      });

      return {
        series: { ...row, id: String(row.id) },
        episodes: episodes.map((e) => ({
          ...e,
          id: String(e.id),
          thumbnailUrl: thumbnailByEpisode.get(e.id) ?? null,
        })),
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
   * Fallback "images linked to this series" source (2026-07-05, project-scoped
   * media panel filter). New generations are tagged with `__vd_series_id` in
   * their media task's `parameters.extra_params` (see `media.listTasks`'s
   * `seriesId` filter), but images generated BEFORE this change carry no such
   * tag — this procedure instead reads the durable link tables that already
   * point at this series' images regardless of when they were generated:
   *  - `verticalDramaCharacterAssets` (character portraits/turnarounds/sheets)
   *  - `verticalDramaShotReferences` (per-shot reference strip)
   *  - every episode's `startFramePlan.frames[].approvedMediaAssetId` /
   *    `.angleGrid.imageUrl` (the start-frame plan JSONB, not a link table)
   *
   * The panel's "โปรเจกต์นี้" (this project) view is the UNION of this result
   * and the tagged `media.listTasks({seriesId})` result, deduped by URL on
   * the client. Returns plain URLs (already resolved via `mediaAssets`'s
   * `originalUrl`) rather than task/asset ids — the panel only needs
   * something to render + drag, not a specific row type.
   */
  listSeriesLinkedImageUrls: verticalDramaProcedure
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

      const [characterAssetUrlRows, shotReferenceUrlRows, episodeRows] = await Promise.all([
        db
          .select({ url: mediaAssets.originalUrl })
          .from(verticalDramaCharacterAssets)
          .innerJoin(mediaAssets, eq(verticalDramaCharacterAssets.mediaAssetId, mediaAssets.id))
          .where(
            and(
              eq(verticalDramaCharacterAssets.tenantId, tenantId),
              eq(verticalDramaCharacterAssets.userId, userId),
              eq(verticalDramaCharacterAssets.seriesId, seriesId),
            ),
          ),
        db
          .select({ url: mediaAssets.originalUrl })
          .from(verticalDramaShotReferences)
          .innerJoin(mediaAssets, eq(verticalDramaShotReferences.mediaAssetId, mediaAssets.id))
          .where(
            and(
              eq(verticalDramaShotReferences.tenantId, tenantId),
              eq(verticalDramaShotReferences.userId, userId),
              eq(verticalDramaShotReferences.seriesId, seriesId),
            ),
          ),
        db
          .select({ startFramePlan: verticalDramaEpisodes.startFramePlan })
          .from(verticalDramaEpisodes)
          .where(
            and(
              eq(verticalDramaEpisodes.tenantId, tenantId),
              eq(verticalDramaEpisodes.userId, userId),
              eq(verticalDramaEpisodes.seriesId, seriesId),
            ),
          ),
      ]);

      const urls = new Set<string>();
      for (const row of characterAssetUrlRows) {
        if (row.url) urls.add(row.url);
      }
      for (const row of shotReferenceUrlRows) {
        if (row.url) urls.add(row.url);
      }

      // startFramePlan-approved / angle-grid assets aren't in a link table —
      // approvedMediaAssetId needs a lookup against mediaAssets; angleGrid
      // already carries a direct imageUrl.
      const approvedAssetIds = new Set<number>();
      const angleGridUrls = new Set<string>();
      for (const row of episodeRows) {
        const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
        for (const frame of plan?.frames ?? []) {
          if (frame.approvedMediaAssetId) {
            const parsed = Number(frame.approvedMediaAssetId);
            if (Number.isFinite(parsed)) approvedAssetIds.add(parsed);
          }
          if (frame.angleGrid?.imageUrl) {
            angleGridUrls.add(frame.angleGrid.imageUrl);
          }
        }
      }
      for (const url of angleGridUrls) {
        urls.add(url);
      }

      if (approvedAssetIds.size > 0) {
        const approvedAssetRows = await db
          .select({ id: mediaAssets.id, url: mediaAssets.originalUrl })
          .from(mediaAssets)
          .where(
            and(
              eq(mediaAssets.tenantId, tenantId),
              eq(mediaAssets.userId, userId),
              inArray(mediaAssets.id, Array.from(approvedAssetIds)),
            ),
          );
        for (const row of approvedAssetRows) {
          if (row.url) urls.add(row.url);
        }
      }

      return { imageUrls: Array.from(urls) };
    }),

  /**
   * List EVERY available product reference image for this series' tie-in
   * config (spec follow-up: "let the user view and change which product
   * image(s) are used as generation references per shot"). The full
   * Marketplace Capture image set (not the generation-time capped-3 subset)
   * plus the series' own `productTieIn.productImageUrl` — this is the
   * storyboard panel's "เปลี่ยนภาพสินค้า" picker's source list. Read-only,
   * ownership-scoped (NOT_FOUND on a cross-tenant/user series id). Never
   * throws over a missing/inaccessible capture — degrades to `[]` /
   * direct-URL-only, matching `resolveMarketplaceCaptureProductImageUrls`'s
   * existing graceful-skip convention.
   */
  listProductImages: verticalDramaProcedure
    .input(z.object({ seriesId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid series id" });
      }

      const row = await loadOwnedSeries(tenantId, userId, seriesId);
      const rawProductTieIn = (row.productTieIn as Record<string, unknown> | null) ?? null;
      const productImageUrl =
        typeof rawProductTieIn?.productImageUrl === "string" && rawProductTieIn.productImageUrl
          ? rawProductTieIn.productImageUrl
          : undefined;
      const marketplaceCaptureId =
        typeof rawProductTieIn?.marketplaceCaptureId === "string" && rawProductTieIn.marketplaceCaptureId
          ? rawProductTieIn.marketplaceCaptureId
          : undefined;

      const { listAvailableProductReferenceImages } = await import(
        "../services/verticalDramaProductTieIn"
      );
      const images = await listAvailableProductReferenceImages({
        productImageUrl,
        marketplaceCaptureId,
        auth: { userId, tenantId },
      });

      return { images };
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
   * Free (no paid generation) setting: the series' default target-audience
   * region/ethnicity look, injected as a DEFAULT into every AI-generated
   * person/character prompt (portraits, turnarounds, character sheets, start
   * frames, angle-grid variations, image repairs) — see
   * `@shared/verticalDramaSeries/targetAudienceRegion.ts` for the value set
   * and the precedence rule (an explicit character `description` always
   * wins over this default).
   *
   * Stored inside the EXISTING `bible` jsonb column (additive-only field,
   * no migration) via a read-modify-write so this mutation never clobbers
   * any other `bible` field a wizard/story-bible call already populated —
   * unlike `updateSeries`, which replaces `bible` wholesale when the caller
   * supplies it.
   */
  setSeriesTargetAudienceRegion: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        targetAudienceRegion: z.enum(VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid series id" });
      }

      const existing = await loadOwnedSeries(tenantId, userId, seriesId);
      const existingBible = (existing.bible as Record<string, unknown> | null) ?? {};
      const nextBible: Record<string, unknown> = {
        ...existingBible,
        targetAudienceRegion: input.targetAudienceRegion satisfies VerticalDramaTargetAudienceRegion,
      };

      const [row] = await db
        .update(verticalDramaSeries)
        .set({ bible: nextBible, updatedAt: new Date() })
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
        presets: rows.map(toGenrePresetDto),
      };
    }),

  /**
   * AI-assisted Mix and Match draft generator for the Create-Series Wizard.
   * The mutation returns a transient editable preset draft only — it never
   * writes a global/private preset row, so users stay in control before apply.
   */
  synthesizeGenrePreset: verticalDramaProcedure
    .input(synthesizeGenrePresetInput)
    .mutation(async ({ ctx, input }) => {
      const locale = input.locale ?? "th";
      const tenantId = ctx.tenantId;
      const userId = ctx.user.id;
      const selectedPresetIds = Array.from(new Set(input.selectedPresetIds ?? []));
      const selectedCategories = Array.from(
        new Set((input.selectedCategories ?? []).map((category) => category.trim()).filter(Boolean)),
      );

      const selectedPresetNumericIds = selectedPresetIds.map((id) => Number(id));
      if (selectedPresetNumericIds.some((id) => !Number.isFinite(id))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid preset id" });
      }

      const visibleRows: VerticalDramaGenrePresetRow[] = await db
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

      const visibleById = new Map(visibleRows.map((row) => [String(row.id), row]));
      const selectedRows = selectedPresetIds
        .map((id) => visibleById.get(id))
        .filter((row): row is VerticalDramaGenrePresetRow => Boolean(row));
      if (selectedRows.length !== selectedPresetIds.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Preset not found" });
      }

      try {
        const result = await synthesizeVerticalDramaPreset({
          userId,
          tenantId: tenantId ?? undefined,
          locale: normalizeVerticalDramaSeriesLocale(locale),
          selectedPresets: selectedRows.map(toGenrePresetDto),
          selectedCategories,
          primarySelectionId: input.primarySelectionId,
          businessContext: input.businessContext,
          productContext: input.productContext,
          targetEpisodeCount: input.targetEpisodeCount,
          toneHint: input.toneHint,
        });
        return result;
      } catch (error) {
        if (error instanceof PresetSynthesisInputError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        if (error instanceof InsufficientCreditsError) {
          throw new TRPCError({ code: "FORBIDDEN", message: error.message });
        }
        if (error instanceof VdSchemaValidationError) {
          throw new TRPCError({ code: "UNPROCESSABLE_CONTENT", message: error.message });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Preset synthesis failed",
        });
      }
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
          locale: normalizeVerticalDramaSeriesLocale(row.locale),
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
          // Genre presets only support th/en (preset browsing follows the UI
          // language, not the series' own content locale) — clamp any of the
          // wider series locales down to the closer of the two.
          locale: row.locale === "th" ? "th" : "en",
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

  /**
   * Submit a series-level narrated trailer compile job (Bible tab "series
   * trailer" feature, 2026-07-07). The client already generated the narration
   * voice-over via `media.generateAudio` (same pattern as Media Studio) and
   * hands us the resulting `audioUrl` (+ duration, if known) here; this
   * procedure gathers the visual sources SERVER-SIDE (never trusts the client
   * to supply media URLs) and kicks off the background ffmpeg assembly job.
   *
   * Idempotent while a job is already in flight: if `series.trailer.status
   * === "processing"` and that job is still tracked in-process, the existing
   * `jobId` is returned instead of double-submitting (protects against
   * double-click / duplicate mutation calls before the first poll observes
   * completion).
   */
  generateTrailer: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        audioUrl: z.string().min(1),
        audioDurationSeconds: z.number().positive().optional(),
        idempotencyKey: z.string().trim().min(1).max(128),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid series id" });
      }

      // Ensure the caller owns it (throws NOT_FOUND otherwise).
      const seriesRow = await loadOwnedSeries(tenantId, userId, seriesId);

      const existingTrailer = seriesRow.trailer as VerticalDramaSeriesTrailerState | null;
      if (existingTrailer?.status === "processing" && existingTrailer.jobId) {
        const liveJob = getTrailerJobStatus(existingTrailer.jobId);
        if (liveJob && liveJob.status === "processing") {
          return { jobId: existingTrailer.jobId, imageCount: 0, videoClipCount: 0, resumed: true };
        }
      }

      const episodeRows = await db
        .select({
          episodeNumber: verticalDramaEpisodes.episodeNumber,
          startFramePlan: verticalDramaEpisodes.startFramePlan,
          motionPromptPack: verticalDramaEpisodes.motionPromptPack,
        })
        .from(verticalDramaEpisodes)
        .where(
          and(
            eq(verticalDramaEpisodes.tenantId, tenantId),
            eq(verticalDramaEpisodes.userId, userId),
            eq(verticalDramaEpisodes.seriesId, seriesId),
          ),
        )
        .orderBy(asc(verticalDramaEpisodes.episodeNumber));

      const isUsableUrl = (url: string | undefined | null): url is string =>
        !!url && (/^https?:\/\//i.test(url) || url.startsWith("/api/storage") || url.startsWith("/uploads"));

      // --- Images: episode 1 first (all of its approved/angle-grid images),
      // then a sample from the other episodes, in episode order. ---
      const approvedAssetIds = new Set<number>();
      const episodeOneImageUrls: string[] = [];
      const otherEpisodeImageUrls: string[] = [];

      for (const row of episodeRows) {
        const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
        for (const frame of plan?.frames ?? []) {
          if (frame.approvedMediaAssetId) {
            const parsed = Number(frame.approvedMediaAssetId);
            if (Number.isFinite(parsed)) approvedAssetIds.add(parsed);
          }
        }
      }

      // Resolve approvedMediaAssetId -> originalUrl in one batched query, then
      // bucket by episode number using a second light per-episode lookup
      // (small dataset — vertical drama series have a handful of episodes).
      const assetUrlById = new Map<number, string>();
      if (approvedAssetIds.size > 0) {
        const assetRows = await db
          .select({ id: mediaAssets.id, url: mediaAssets.originalUrl })
          .from(mediaAssets)
          .where(
            and(
              eq(mediaAssets.tenantId, tenantId),
              eq(mediaAssets.userId, userId),
              inArray(mediaAssets.id, Array.from(approvedAssetIds)),
            ),
          );
        for (const row of assetRows) {
          if (row.url) assetUrlById.set(row.id, row.url);
        }
      }

      for (const row of episodeRows) {
        const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
        const isEpisodeOne = row.episodeNumber === 1;
        const bucket = isEpisodeOne ? episodeOneImageUrls : otherEpisodeImageUrls;
        for (const frame of plan?.frames ?? []) {
          if (frame.approvedMediaAssetId) {
            const parsed = Number(frame.approvedMediaAssetId);
            const url = Number.isFinite(parsed) ? assetUrlById.get(parsed) : undefined;
            if (isUsableUrl(url)) bucket.push(url);
          } else if (frame.angleGrid?.imageUrl && isUsableUrl(frame.angleGrid.imageUrl)) {
            bucket.push(frame.angleGrid.imageUrl);
          }
        }
      }

      // Shuffle the "other episodes" bucket (deterministic-enough Fisher-Yates)
      // so a long series doesn't just show episodes 2/3 repeatedly.
      for (let i = otherEpisodeImageUrls.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [otherEpisodeImageUrls[i], otherEpisodeImageUrls[j]] = [otherEpisodeImageUrls[j], otherEpisodeImageUrls[i]];
      }
      const imageUrls = [...episodeOneImageUrls, ...otherEpisodeImageUrls];

      // --- Video clips: episode 1 first, then others, completed only. ---
      const episodeOneClipUrls: string[] = [];
      const otherEpisodeClipUrls: string[] = [];
      for (const row of episodeRows) {
        const pack = row.motionPromptPack as VerticalDramaMotionPromptPack | null;
        const bucket = row.episodeNumber === 1 ? episodeOneClipUrls : otherEpisodeClipUrls;
        for (const clip of pack?.clips ?? []) {
          const url = clip.videoTask?.videoUrl;
          if (isUsableUrl(url)) bucket.push(url);
        }
      }
      const videoClipUrls = [...episodeOneClipUrls, ...otherEpisodeClipUrls];

      if (imageUrls.length === 0 && videoClipUrls.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "No episode images or video clips are available yet to build a trailer — generate at least one episode's start frames or video clips first.",
        });
      }

      const runtimeConfig = getCachedAppRuntimeConfig();
      const internalBaseUrl = runtimeConfig.internalNodeUrl || ctx.publicUrl || "http://localhost:3000";

      const { jobId } = await submitTrailerJob({
        owner: { tenantId, userId, seriesId },
        audioUrl: input.audioUrl,
        audioDurationSeconds: input.audioDurationSeconds,
        imageUrls,
        videoClipUrls,
        internalBaseUrl,
      });

      return {
        jobId,
        imageCount: imageUrls.length,
        videoClipCount: videoClipUrls.length,
        resumed: false,
      };
    }),

  /**
   * Poll the series trailer job status. Returns `null` when no trailer has
   * ever been generated for this series (client treats `null` as "idle" —
   * show the generate button, not an error state).
   */
  getTrailerStatus: verticalDramaProcedure
    .input(z.object({ seriesId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid series id" });
      }

      const row = await loadOwnedSeries(tenantId, userId, seriesId);
      const trailer = row.trailer as VerticalDramaSeriesTrailerState | null;
      return trailer ?? null;
    }),
});

export type VerticalDramaSeriesRouter = typeof verticalDramaSeriesRouter;
