import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { requireFeatureFlag } from "../middleware/requireFeatureFlag";
import { db } from "../db";
import {
  verticalDramaAudioAnalyses,
  verticalDramaEmotionPlans,
  verticalDramaEpisodes,
  verticalDramaSeries,
} from "../../drizzle/schema";
import {
  buildVerticalDramaAudioSourceSnapshot,
  cancelVerticalDramaAudioAnalysis,
  approveVerticalDramaEmotionPlan,
  parseAudioPlanRow,
  queueVerticalDramaAudioAnalysis,
  updateVerticalDramaEmotionPlanRights,
  listVerticalDramaMusicTakes,
  listVerticalDramaEmotionPlanRevisions,
  getVerticalDramaRightsManifest,
  getVerticalDramaAudioScoringJob,
  resolveVerticalDramaEmotionPlanCritique,
  VERTICAL_DRAMA_AUDIO_RIGHTS_STATUSES,
} from "../services/verticalDramaAudioScoring";
import {
  getVerticalDramaAudioPipelineStatus,
  queueVerticalDramaScoreMix,
} from "../services/verticalDramaAudioPipelineCoordinator";

const verticalDramaAudioProcedure = protectedProcedure.use(
  requireFeatureFlag("verticalDramaSeries")
);

const idSchema = z.string().trim().min(1).max(64);
const rightsStatusSchema = z.enum(VERTICAL_DRAMA_AUDIO_RIGHTS_STATUSES);

function parseId(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid ${label}` });
  }
  return parsed;
}

async function loadOwnedEpisode(input: {
  tenantId: string | null;
  userId: number;
  seriesId: string;
  episodeId: string;
}) {
  if (!input.tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
  }
  const seriesId = parseId(input.seriesId, "series id");
  const episodeId = parseId(input.episodeId, "episode id");
  const [series] = await db.select({ id: verticalDramaSeries.id })
    .from(verticalDramaSeries)
    .where(and(
      eq(verticalDramaSeries.id, seriesId),
      eq(verticalDramaSeries.tenantId, input.tenantId),
      eq(verticalDramaSeries.userId, input.userId),
    )).limit(1);
  if (!series) throw new TRPCError({ code: "NOT_FOUND", message: "Series not found" });
  const [episode] = await db.select().from(verticalDramaEpisodes)
    .where(and(
      eq(verticalDramaEpisodes.id, episodeId),
      eq(verticalDramaEpisodes.seriesId, seriesId),
      eq(verticalDramaEpisodes.tenantId, input.tenantId),
      eq(verticalDramaEpisodes.userId, input.userId),
    )).limit(1);
  if (!episode) throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
  return { tenantId: input.tenantId, seriesId, episodeId, episode };
}

export const verticalDramaAudioScoringRouter = router({
  getSources: verticalDramaAudioProcedure
    .input(z.object({ seriesId: idSchema, episodeId: idSchema }))
    .query(async ({ ctx, input }) => {
      const owner = await loadOwnedEpisode({ tenantId: ctx.tenantId, userId: ctx.user.id, ...input });
      const source = buildVerticalDramaAudioSourceSnapshot(owner.episode);
      return {
        seriesId: String(owner.seriesId),
        episodeId: String(owner.episodeId),
        sourceRevision: source.sourceRevision,
        sourceHash: source.sourceHash,
        sourceKinds: {
          script: Boolean(owner.episode.script),
          storyboard: Boolean(owner.episode.storyboard),
          dialogueAudioPlan: Boolean(owner.episode.dialogueAudioPlan),
          motionPromptPack: Boolean(owner.episode.motionPromptPack),
        },
        targetDurationSeconds: owner.episode.targetDurationSeconds,
        durationProfileId: owner.episode.durationProfileId,
      };
    }),

  getAnalysis: verticalDramaAudioProcedure
    .input(z.object({ seriesId: idSchema, episodeId: idSchema }))
    .query(async ({ ctx, input }) => {
      const owner = await loadOwnedEpisode({ tenantId: ctx.tenantId, userId: ctx.user.id, ...input });
      const [analysis] = await db.select().from(verticalDramaAudioAnalyses)
        .where(and(
          eq(verticalDramaAudioAnalyses.tenantId, owner.tenantId),
          eq(verticalDramaAudioAnalyses.userId, ctx.user.id),
          eq(verticalDramaAudioAnalyses.seriesId, owner.seriesId),
          eq(verticalDramaAudioAnalyses.episodeId, owner.episodeId),
        )).orderBy(desc(verticalDramaAudioAnalyses.createdAt)).limit(1);
      return analysis ?? null;
    }),

  getPlan: verticalDramaAudioProcedure
    .input(z.object({ seriesId: idSchema, episodeId: idSchema }))
    .query(async ({ ctx, input }) => {
      const owner = await loadOwnedEpisode({ tenantId: ctx.tenantId, userId: ctx.user.id, ...input });
      const [plan] = await db.select().from(verticalDramaEmotionPlans)
        .where(and(
          eq(verticalDramaEmotionPlans.tenantId, owner.tenantId),
          eq(verticalDramaEmotionPlans.userId, ctx.user.id),
          eq(verticalDramaEmotionPlans.seriesId, owner.seriesId),
          eq(verticalDramaEmotionPlans.episodeId, owner.episodeId),
      )).limit(1);
      if (!plan) return null;
      const source = buildVerticalDramaAudioSourceSnapshot(owner.episode);
      return {
        ...plan,
        isStale: plan.sourceHash !== source.sourceHash,
        parsedPlan: parseAudioPlanRow(plan),
      };
    }),

  requestAnalysis: verticalDramaAudioProcedure
    .input(z.object({
      seriesId: idSchema,
      episodeId: idSchema,
      idempotencyKey: z.string().trim().min(8).max(128),
    }))
    .mutation(async ({ ctx, input }) => {
      const owner = await loadOwnedEpisode({ tenantId: ctx.tenantId, userId: ctx.user.id, ...input });
      const source = buildVerticalDramaAudioSourceSnapshot(owner.episode);
      return queueVerticalDramaAudioAnalysis({
        tenantId: owner.tenantId,
        userId: ctx.user.id,
        seriesId: owner.seriesId,
        episodeId: owner.episodeId,
        sourceSnapshot: source.snapshot,
        sourceRevision: source.sourceRevision,
        sourceHash: source.sourceHash,
        idempotencyKey: input.idempotencyKey,
      });
    }),

  requestAudioAnalysis: verticalDramaAudioProcedure
    .input(z.object({
      seriesId: idSchema,
      episodeId: idSchema,
      idempotencyKey: z.string().trim().min(8).max(128),
    }))
    .mutation(async ({ ctx, input }) => {
      const owner = await loadOwnedEpisode({ tenantId: ctx.tenantId, userId: ctx.user.id, ...input });
      const source = buildVerticalDramaAudioSourceSnapshot(owner.episode);
      return queueVerticalDramaAudioAnalysis({
        tenantId: owner.tenantId,
        userId: ctx.user.id,
        seriesId: owner.seriesId,
        episodeId: owner.episodeId,
        sourceSnapshot: source.snapshot,
        sourceRevision: source.sourceRevision,
        sourceHash: source.sourceHash,
        idempotencyKey: input.idempotencyKey,
      });
    }),

  approvePlan: verticalDramaAudioProcedure
    .input(z.object({
      planId: z.string().uuid(),
      planHash: z.string().regex(/^[a-f0-9]{64}$/i),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
      return approveVerticalDramaEmotionPlan({ tenantId: ctx.tenantId, userId: ctx.user.id, ...input });
    }),

  resolveCritique: verticalDramaAudioProcedure
    .input(z.object({
      planId: z.string().uuid(),
      planHash: z.string().regex(/^[a-f0-9]{64}$/i),
      resolutionNote: z.string().trim().min(3).max(120),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
      return resolveVerticalDramaEmotionPlanCritique({ tenantId: ctx.tenantId, userId: ctx.user.id, ...input });
    }),

  updateRightsStatus: verticalDramaAudioProcedure
    .input(z.object({
      planId: z.string().uuid(),
      rightsStatus: rightsStatusSchema,
      evidenceRef: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/).optional(),
      scope: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
      return updateVerticalDramaEmotionPlanRights({ tenantId: ctx.tenantId, userId: ctx.user.id, ...input });
    }),

  cancelAnalysis: verticalDramaAudioProcedure
    .input(z.object({ analysisId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
      return cancelVerticalDramaAudioAnalysis({ tenantId: ctx.tenantId, userId: ctx.user.id, ...input });
    }),

  getScoringJob: verticalDramaAudioProcedure
    .input(z.object({ analysisId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
      return getVerticalDramaAudioScoringJob({ tenantId: ctx.tenantId, userId: ctx.user.id, ...input });
    }),

  cancelScoringJob: verticalDramaAudioProcedure
    .input(z.object({ analysisId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
      return cancelVerticalDramaAudioAnalysis({ tenantId: ctx.tenantId, userId: ctx.user.id, ...input });
    }),

  listTakes: verticalDramaAudioProcedure
    .input(z.object({ planId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
      return listVerticalDramaMusicTakes({ tenantId: ctx.tenantId, userId: ctx.user.id, ...input });
    }),

  listPlanRevisions: verticalDramaAudioProcedure
    .input(z.object({ planId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
      return listVerticalDramaEmotionPlanRevisions({ tenantId: ctx.tenantId, userId: ctx.user.id, ...input });
    }),

  getRightsManifest: verticalDramaAudioProcedure
    .input(z.object({ planId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
      return getVerticalDramaRightsManifest({ tenantId: ctx.tenantId, userId: ctx.user.id, ...input });
    }),

  getPipeline: verticalDramaAudioProcedure
    .input(z.object({ seriesId: idSchema, episodeId: idSchema, planId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const owner = await loadOwnedEpisode({ tenantId: ctx.tenantId, userId: ctx.user.id, ...input });
      return getVerticalDramaAudioPipelineStatus({ tenantId: owner.tenantId, userId: ctx.user.id, seriesId: owner.seriesId, episodeId: owner.episodeId, planId: input.planId });
    }),

  queueScoreMix: verticalDramaAudioProcedure
    .input(z.object({ planId: z.string().uuid(), selectedTakeIds: z.array(idSchema).min(1).max(6) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
      return queueVerticalDramaScoreMix({ tenantId: ctx.tenantId, userId: ctx.user.id, ...input });
    }),
});
