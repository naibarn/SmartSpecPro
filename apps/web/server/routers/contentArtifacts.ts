/**
 * Content Artifacts tRPC Router — Spec 038 Section 09
 *
 * CRUD + staleness endpoints for CMS content artifacts.
 */

import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import {
  saveArtifact,
  getArtifactById,
  listArtifacts,
  getStaleArtifacts,
  refreshArtifact,
  archiveArtifact,
} from "../services/contentArtifactStore";
import { TRPCError } from "@trpc/server";

export const contentArtifactsRouter = router({
  save: protectedProcedure
    .input(
      z.object({
        skillSlug: z.string(),
        outputFormat: z.string(),
        contentJson: z.unknown(),
        qualityScore: z.object({
          citation_coverage: z.number(),
          claims_total: z.number(),
          claims_with_evidence: z.number(),
          claims_unverified: z.number(),
          quality_gate_passed: z.boolean(),
          seo_complete: z.boolean(),
          errors: z.array(z.string()),
          warnings: z.array(z.string()),
        }),
        refreshCadenceDays: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return saveArtifact({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        skillSlug: input.skillSlug,
        outputFormat: input.outputFormat,
        contentJson: input.contentJson,
        qualityScore: input.qualityScore,
        refreshCadenceDays: input.refreshCadenceDays,
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const artifact = await getArtifactById(input.id);
      if (!artifact) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artifact not found" });
      }
      return artifact;
    }),

  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(["active", "stale", "archived"]).optional(),
        skillSlug: z.string().optional(),
        limit: z.number().min(1).max(100).optional(),
        offset: z.number().min(0).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return listArtifacts({
        tenantId: ctx.tenantId,
        status: input.status,
        skillSlug: input.skillSlug,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  getStale: protectedProcedure.query(async ({ ctx }) => {
    return getStaleArtifacts(ctx.tenantId);
  }),

  refresh: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const artifact = await refreshArtifact(input.id);
      if (!artifact) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artifact not found" });
      }
      return artifact;
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const artifact = await archiveArtifact(input.id);
      if (!artifact) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Artifact not found" });
      }
      return artifact;
    }),
});
