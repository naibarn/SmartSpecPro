import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  buildStoryboardConfirmationFingerprint,
  normalizeStoryboardGlobalInput,
  storyboardStoryTypeSchema,
} from "../services/storyboardSkillFrameworkContracts";
import {
  getStoryboardSkillSchema,
  listCompatibleStoryboardSkills,
} from "../services/storyboardSkillRegistry";
import {
  addStoryboardCharacterLook,
  archiveStoryboardSkillProject,
  bindStoryboardProjectCharacter,
  cancelStoryboardSkillRun,
  confirmStoryboardSkillRun,
  createStoryboardCharacter,
  createStoryboardSkillDraft,
  createStoryboardSkillRunFromProject,
  getStoryboardSkillProject,
  getStoryboardSkillRun,
  importDramaCharacterToStoryboardLibrary,
  listDramaCharacterSources,
  listStoryboardCharacters,
  listStoryboardSkillRuns,
  rebuildStoryboardSkillReviewProjection,
  retryStoryboardSkillShots,
  pauseStoryboardSkillRun,
  resumeStoryboardSkillRun,
  saveStoryboardShotAsCharacter,
  unbindStoryboardProjectCharacter,
  updateStoryboardSkillDraft,
  updateStoryboardCharacterName,
} from "../services/storyboardSkillFrameworkService";
import { expandStoryboardIdea } from "../services/storyboardIdeaExpansionService";

const tenant = (value: string | null, userTenant: string | null): string => {
  const result = value ?? userTenant;
  if (!result)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Tenant context is required",
    });
  return result;
};

export const storyboardSkillFrameworkRouter = router({
  listCompatibleSkills: protectedProcedure.query(() =>
    listCompatibleStoryboardSkills()
  ),
  getSkillSchema: protectedProcedure
    .input(z.object({ skillId: z.string().min(1) }))
    .query(({ input }) => getStoryboardSkillSchema(input.skillId)),
  estimate: protectedProcedure
    .input(z.object({ draft: z.unknown() }))
    .query(({ input }) => {
      const normalized = normalizeStoryboardGlobalInput(input.draft);
      return {
        totalShots: normalized.totalShots,
        shotDurationSec: normalized.shotDurationSec,
        totalDurationSec: normalized.totalShots * normalized.shotDurationSec,
        imageCount: normalized.totalShots,
        videoPromptCount: normalized.totalShots,
        confirmationFingerprint: buildStoryboardConfirmationFingerprint(
          normalized,
          getStoryboardSkillSchema(normalized.selectedSkillId)
        ),
      };
    }),
  expandIdea: protectedProcedure
    .input(
      z.object({
        idempotencyKey: z.string().trim().min(8).max(160),
        roughIdea: z.string().trim().min(1).max(5000),
        language: z.enum(["th", "en"]),
        storyType: storyboardStoryTypeSchema,
        totalShots: z.number().int().min(2).max(12),
        selectedSkillId: z.string().trim().min(1).max(160),
        llmModelId: z.string().trim().min(1).max(200).optional(),
      })
    )
    .mutation(async ({ ctx, input }) =>
      expandStoryboardIdea({
        userId: ctx.user.id,
        tenantId: tenant(ctx.tenantId, ctx.user.currentTenantId),
        ...input,
      })
    ),
  createDraft: protectedProcedure
    .input(
      z.object({
        idempotencyKey: z.string().trim().min(8).max(160),
        draft: z.unknown(),
      })
    )
    .mutation(async ({ ctx, input }) =>
      createStoryboardSkillDraft({
        userId: ctx.user.id,
        tenantId: tenant(ctx.tenantId, ctx.user.currentTenantId),
        idempotencyKey: input.idempotencyKey,
        draft: input.draft,
      })
    ),
  updateDraft: protectedProcedure
    .input(z.object({ projectId: z.string().uuid(), draft: z.unknown() }))
    .mutation(async ({ ctx, input }) =>
      updateStoryboardSkillDraft({
        userId: ctx.user.id,
        tenantId: tenant(ctx.tenantId, ctx.user.currentTenantId),
        projectId: input.projectId,
        draft: input.draft,
      })
    ),
  createRunFromProject: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        idempotencyKey: z.string().trim().min(8).max(160),
        draft: z.unknown().optional(),
      })
    )
    .mutation(async ({ ctx, input }) =>
      createStoryboardSkillRunFromProject({
        userId: ctx.user.id,
        tenantId: tenant(ctx.tenantId, ctx.user.currentTenantId),
        ...input,
      })
    ),
  getProject: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) =>
      getStoryboardSkillProject({
        userId: ctx.user.id,
        tenantId: tenant(ctx.tenantId, ctx.user.currentTenantId),
        projectId: input.projectId,
      })
    ),
  confirmAndStart: protectedProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        confirmationFingerprint: z.string().length(64),
      })
    )
    .mutation(async ({ ctx, input }) =>
      confirmStoryboardSkillRun({
        userId: ctx.user.id,
        tenantId: tenant(ctx.tenantId, ctx.user.currentTenantId),
        ...input,
      })
    ),
  getRun: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ ctx, input }) =>
      getStoryboardSkillRun({
        userId: ctx.user.id,
        tenantId: tenant(ctx.tenantId, ctx.user.currentTenantId),
        runId: input.runId,
      })
    ),
  listRuns: protectedProcedure
    .input(
      z.object({ limit: z.number().int().min(1).max(50).optional() }).optional()
    )
    .query(async ({ ctx, input }) =>
      listStoryboardSkillRuns({
        userId: ctx.user.id,
        tenantId: tenant(ctx.tenantId, ctx.user.currentTenantId),
        limit: input?.limit,
      })
    ),
  cancel: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) =>
      cancelStoryboardSkillRun({
        userId: ctx.user.id,
        tenantId: tenant(ctx.tenantId, ctx.user.currentTenantId),
        runId: input.runId,
      })
    ),
  pause: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) =>
      pauseStoryboardSkillRun({
        userId: ctx.user.id,
        tenantId: tenant(ctx.tenantId, ctx.user.currentTenantId),
        runId: input.runId,
      })
    ),
  resume: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) =>
      resumeStoryboardSkillRun({
        userId: ctx.user.id,
        tenantId: tenant(ctx.tenantId, ctx.user.currentTenantId),
        runId: input.runId,
      })
    ),
  retryShots: protectedProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        shotNumbers: z.array(z.number().int().min(1).max(12)).optional(),
      })
    )
    .mutation(async ({ ctx, input }) =>
      retryStoryboardSkillShots({
        userId: ctx.user.id,
        tenantId: tenant(ctx.tenantId, ctx.user.currentTenantId),
        ...input,
      })
    ),
  rebuildReviewProjection: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) =>
      rebuildStoryboardSkillReviewProjection({
        userId: ctx.user.id,
        tenantId: tenant(ctx.tenantId, ctx.user.currentTenantId),
        runId: input.runId,
      })
    ),
  archiveProject: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) =>
      archiveStoryboardSkillProject({
        userId: ctx.user.id,
        tenantId: tenant(ctx.tenantId, ctx.user.currentTenantId),
        projectId: input.projectId,
      })
    ),
  getProjectCharacters: protectedProcedure
    .input(z.object({ projectId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) =>
      listStoryboardCharacters({
        userId: ctx.user.id,
        tenantId: tenant(ctx.tenantId, ctx.user.currentTenantId),
        projectId: input?.projectId,
      })
    ),
  listDramaCharacterSources: protectedProcedure.query(async ({ ctx }) =>
    listDramaCharacterSources({
      userId: ctx.user.id,
      tenantId: tenant(ctx.tenantId, ctx.user.currentTenantId),
    })
  ),
  importDramaCharacter: protectedProcedure
    .input(
      z.object({
        seriesId: z.string().trim().min(1),
        characterId: z.string().trim().min(1),
      })
    )
    .mutation(async ({ ctx, input }) =>
      importDramaCharacterToStoryboardLibrary({
        userId: ctx.user.id,
        tenantId: tenant(ctx.tenantId, ctx.user.currentTenantId),
        ...input,
      })
    ),
  createCharacter: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().max(160).optional(),
        profile: z.record(z.string(), z.unknown()).optional(),
        skillSnapshot: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) =>
      createStoryboardCharacter({
        userId: ctx.user.id,
        tenantId: tenant(ctx.tenantId, ctx.user.currentTenantId),
        ...input,
      })
    ),
  renameCharacter: protectedProcedure
    .input(
      z.object({
        characterId: z.string().uuid(),
        name: z.string().trim().min(1).max(160),
      })
    )
    .mutation(async ({ ctx, input }) =>
      updateStoryboardCharacterName({
        userId: ctx.user.id,
        tenantId: tenant(ctx.tenantId, ctx.user.currentTenantId),
        ...input,
      })
    ),
  addCharacterLook: protectedProcedure
    .input(
      z.object({
        characterId: z.string().uuid(),
        name: z.string().trim().min(1).max(160),
        look: z.record(z.string(), z.unknown()).default({}),
      })
    )
    .mutation(async ({ ctx, input }) =>
      addStoryboardCharacterLook({
        userId: ctx.user.id,
        tenantId: tenant(ctx.tenantId, ctx.user.currentTenantId),
        ...input,
      })
    ),
  saveShotAsCharacter: protectedProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        shotNumber: z.number().int().min(1).max(50),
        characterId: z.string().uuid().optional(),
        characterName: z.string().trim().max(160).optional(),
        role: z.enum(["portrait", "look"]),
        lookName: z.string().trim().max(160).optional(),
      })
    )
    .mutation(async ({ ctx, input }) =>
      saveStoryboardShotAsCharacter({
        userId: ctx.user.id,
        tenantId: tenant(ctx.tenantId, ctx.user.currentTenantId),
        ...input,
      })
    ),
  bindProjectCharacter: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        characterId: z.string().uuid(),
        lookId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) =>
      bindStoryboardProjectCharacter({
        userId: ctx.user.id,
        tenantId: tenant(ctx.tenantId, ctx.user.currentTenantId),
        ...input,
      })
    ),
  unbindProjectCharacter: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        characterId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) =>
      unbindStoryboardProjectCharacter({
        userId: ctx.user.id,
        tenantId: tenant(ctx.tenantId, ctx.user.currentTenantId),
        ...input,
      })
    ),
});
