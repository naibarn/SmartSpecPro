/**
 * Vertical Drama Series — assembly / export / run-artifact router (feature 131,
 * section 09).
 *
 * Protected, feature-flag-gated (`verticalDramaSeries`, fail-closed), and scoped
 * to the caller's tenant + user on every read and mutation. The conductor wires
 * this router into `server/routers.ts` — do NOT edit that file here.
 *
 * Procedures:
 *  - `importClips`           — ingest Storyboard Review clip outputs (media asset
 *                              IDs + provider job IDs + stable statuses).
 *  - `buildAssemblyManifest` — build + persist the final assembly manifest,
 *                              assign `assemblyManifestId`, link it back to the
 *                              Storyboard Review task.
 *  - `markAssemblyReady`     — mark a run `assembly_ready` when render is deferred
 *                              (pending memory checkpoint, no auto-mutation).
 *  - `getRunDetail`          — read-only ledger for any past run + per-clip
 *                              provider statuses (run selector via `listRuns`).
 *  - `listRuns`              — run summaries for the run selector.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { requireFeatureFlag } from "../middleware/requireFeatureFlag";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
import {
  verticalDramaAssemblyService,
  type AssemblyOwner,
  type ClipImportInput,
} from "../services/verticalDramaAssembly";

/* -------------------------------------------------------------------------- */
/* Base procedure + ownership helpers                                         */
/* -------------------------------------------------------------------------- */

const verticalDramaProcedure = protectedProcedure.use(
  requireFeatureFlag("verticalDramaSeries"),
);

function requireTenantId(tenantId: string | null): string {
  if (!tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Vertical Drama Series is not available (no tenant context)",
    });
  }
  return tenantId;
}

function parseId(raw: string, label: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid ${label}` });
  }
  return n;
}

function ownerFrom(
  ctx: { tenantId: string | null; user: { id: number } },
  seriesId: string,
  episodeId: string,
): AssemblyOwner {
  return {
    tenantId: requireTenantId(ctx.tenantId),
    userId: ctx.user.id,
    seriesId: parseId(seriesId, "series id"),
    episodeId: parseId(episodeId, "episode id"),
  };
}

/** NOT_FOUND for the domain "not found" errors thrown by the service. */
function mapServiceError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("_not_found")) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });
  }
  throw err;
}

/* -------------------------------------------------------------------------- */
/* Input schemas                                                              */
/* -------------------------------------------------------------------------- */

const idempotencyKey = z.string().trim().min(1).max(128).optional();

const clipInput = z.object({
  clipNumber: z.number().int().positive(),
  sourceShotNumbers: z.array(z.number().int().positive()).optional(),
  durationSeconds: z.number().positive().max(60),
  mediaAssetId: z.string().min(1).optional(),
  providerJobId: z.string().min(1).optional(),
  providerStatus: z.string().min(1).max(64).optional(),
  parentShotNumber: z.number().int().positive().max(9).optional(),
  subShotNumber: z.number().int().positive().max(5).nullable().optional(),
  status: z.enum(["planned", "rendering", "ready", "failed", "skipped"]).optional(),
  trimStartSeconds: z.number().min(0).optional(),
  trimEndSeconds: z.number().min(0).optional(),
});

const subtitleCueInput = z.object({
  subtitleCueId: z.string().min(1),
  startSeconds: z.number().min(0),
  endSeconds: z.number().min(0),
  text: z.string(),
  safeArea: z.enum(["bottom_safe", "middle_safe", "top_safe"]),
});

const audioTrackInput = z.object({
  trackType: z.enum(["dialogue", "voiceover", "bgm", "ambience"]),
  mediaAssetId: z.string().min(1).optional(),
  startSeconds: z.number().min(0),
  endSeconds: z.number().min(0),
  volumeDb: z.number().optional(),
});

const exportSettingsInput = z
  .object({
    resolution: z.string().min(1).optional(),
    fps: z.number().int().positive().optional(),
  })
  .optional();

/* -------------------------------------------------------------------------- */
/* Router                                                                     */
/* -------------------------------------------------------------------------- */

export const verticalDramaAssemblyRouter = router({
  /** Ingest Storyboard Review clip outputs into episode run state. */
  importClips: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        mode: z.string().optional(),
        clips: z.array(clipInput).min(1),
        idempotencyKey,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const owner = ownerFrom(ctx, input.seriesId, input.episodeId);
      try {
        return await verticalDramaAssemblyService.importClips(owner, {
          mode: input.mode,
          clips: input.clips as ClipImportInput[],
        });
      } catch (err) {
        mapServiceError(err);
      }
    }),

  /** Build + persist the final assembly manifest and link it back to review. */
  buildAssemblyManifest: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        mode: z.string().optional(),
        clips: z.array(clipInput).min(1),
        subtitlePlan: z.array(subtitleCueInput).optional(),
        audioBgmPlan: z.array(audioTrackInput).optional(),
        exportSettings: exportSettingsInput,
        idempotencyKey,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const owner = ownerFrom(ctx, input.seriesId, input.episodeId);
      // Sub-shot assembly is flag-gated (fail-closed): only flatten sub-shots
      // when the tenant flag is on.
      const flags = await getTenantFeatureFlags(owner.tenantId);
      const subShotsEnabled = flags.verticalDramaSeriesSubShots === true;
      try {
        return await verticalDramaAssemblyService.buildAndPersistAssemblyManifest(owner, {
          mode: input.mode,
          clips: input.clips as ClipImportInput[],
          subtitlePlan: input.subtitlePlan,
          audioBgmPlan: input.audioBgmPlan,
          exportSettings: input.exportSettings,
          subShotsEnabled,
        });
      } catch (err) {
        mapServiceError(err);
      }
    }),

  /** Mark a run `assembly_ready` when final render is deferred. */
  markAssemblyReady: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        runId: z.string().min(1),
        reason: z.string().max(2000).optional(),
        idempotencyKey,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const owner = ownerFrom(ctx, input.seriesId, input.episodeId);
      try {
        return await verticalDramaAssemblyService.markAssemblyReady(owner, {
          runId: parseId(input.runId, "run id"),
          reason: input.reason,
        });
      } catch (err) {
        mapServiceError(err);
      }
    }),

  /** Run summaries for an episode's run selector (read-only). */
  listRuns: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        limit: z.number().int().positive().max(500).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const owner = ownerFrom(ctx, input.seriesId, input.episodeId);
      try {
        const runs = await verticalDramaAssemblyService.listRunsForEpisode(owner, input.limit ?? 200);
        return { runs };
      } catch (err) {
        mapServiceError(err);
      }
    }),

  /**
   * Read-only full artifact ledger for any past run of an episode + per-clip
   * provider job IDs and stable statuses. Always available (immutable, durable
   * artifacts) — including for archived series and completed episodes.
   */
  getRunDetail: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        runId: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const owner = ownerFrom(ctx, input.seriesId, input.episodeId);
      try {
        return await verticalDramaAssemblyService.getRunDetail(owner, parseId(input.runId, "run id"));
      } catch (err) {
        mapServiceError(err);
      }
    }),
});

export type VerticalDramaAssemblyRouter = typeof verticalDramaAssemblyRouter;
