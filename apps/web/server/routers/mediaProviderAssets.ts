import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import {
  createGeminiOmniAudioAsset,
  createGeminiOmniCharacterAsset,
  listMediaProviderAssets,
  purgeMediaProviderAsset,
  restoreMediaProviderAsset,
  softDeleteMediaProviderAsset,
  updateMediaProviderAssetDisplay,
  upsertMediaProviderAsset,
} from "../services/mediaProviderAssetService";
import {
  GEMINI_OMNI_AUDIO_CAPABILITY,
  GEMINI_OMNI_CHARACTER_CAPABILITY,
  GEMINI_OMNI_VOICE_PRESETS,
} from "../../shared/geminiOmni";

const providerAssetCapabilitySchema = z.enum([
  GEMINI_OMNI_CHARACTER_CAPABILITY,
  GEMINI_OMNI_AUDIO_CAPABILITY,
]);

const safeProviderAssetIdSchema = z.string().min(1).max(256).regex(/^[A-Za-z0-9._:-]+$/);
const publicUrlSchema = z.string().url().refine((value) => /^https?:\/\//i.test(value), "URL must be http(s)");

export const mediaProviderAssetsRouter = router({
  list: protectedProcedure
    .input(z.object({
      capability: providerAssetCapabilitySchema.optional(),
      includeDeleted: z.boolean().default(false),
      limit: z.number().min(1).max(200).default(50),
    }).optional())
    .query(async ({ ctx, input }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return listMediaProviderAssets({
        tenantId,
        userId: ctx.user.id,
        capability: input?.capability,
        includeDeleted: input?.includeDeleted,
        limit: input?.limit,
      });
    }),

  registerExternal: protectedProcedure
    .input(z.object({
      provider: z.string().min(1).max(64).default("kie.ai"),
      capability: providerAssetCapabilitySchema,
      assetType: z.string().min(1).max(40),
      providerAssetId: safeProviderAssetIdSchema,
      displayName: z.string().min(1).max(256),
      clientRequestId: z.string().min(1).max(128).optional(),
      sourceMediaAssetId: z.number().optional(),
      metadata: z.record(z.any()).optional(),
      assetSnapshot: z.record(z.any()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return upsertMediaProviderAsset({
        tenantId,
        userId: ctx.user.id,
        provider: input.provider,
        capability: input.capability,
        assetType: input.assetType,
        providerAssetId: input.providerAssetId,
        displayName: input.displayName,
        clientRequestId: input.clientRequestId,
        sourceMediaAssetId: input.sourceMediaAssetId,
        metadata: input.metadata,
        assetSnapshot: input.assetSnapshot,
      });
    }),

  createGeminiOmniAudio: protectedProcedure
    .input(z.object({
      audioId: z.enum(GEMINI_OMNI_VOICE_PRESETS.map((preset) => preset.id) as [string, ...string[]]),
      name: z.string().min(1).max(210),
      voiceDescription: z.string().min(12).max(20000),
      exampleDialogue: z.string().min(1).max(4000),
      clientRequestId: z.string().min(1).max(128).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      try {
        return await createGeminiOmniAudioAsset({
          tenantId,
          userId: ctx.user.id,
          audioId: input.audioId,
          name: input.name,
          voiceDescription: input.voiceDescription,
          exampleDialogue: input.exampleDialogue,
          clientRequestId: input.clientRequestId,
        });
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Gemini Omni audio asset creation failed",
        });
      }
    }),

  createGeminiOmniCharacter: protectedProcedure
    .input(z.object({
      characterName: z.string().min(1).max(120),
      description: z.string().min(12).max(1500),
      imageUrl: publicUrlSchema,
      audioIds: z.array(safeProviderAssetIdSchema).max(7).default([]),
      clientRequestId: z.string().min(1).max(128).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      try {
        return await createGeminiOmniCharacterAsset({
          tenantId,
          userId: ctx.user.id,
          characterName: input.characterName,
          description: input.description,
          imageUrls: [input.imageUrl],
          audioIds: input.audioIds,
          clientRequestId: input.clientRequestId,
        });
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Gemini Omni character asset creation failed",
        });
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return softDeleteMediaProviderAsset({
        tenantId,
        userId: ctx.user.id,
        id: input.id,
      });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number().min(1),
      displayName: z.string().min(1).max(256).optional(),
      metadataPatch: z.record(z.any()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      try {
        return await updateMediaProviderAssetDisplay({
          tenantId,
          userId: ctx.user.id,
          id: input.id,
          displayName: input.displayName,
          metadataPatch: input.metadataPatch,
        });
      } catch (error) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: error instanceof Error ? error.message : "Provider asset update failed",
        });
      }
    }),

  restore: protectedProcedure
    .input(z.object({ id: z.number().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return restoreMediaProviderAsset({
        tenantId,
        userId: ctx.user.id,
        id: input.id,
      });
    }),

  purge: protectedProcedure
    .input(z.object({ id: z.number().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return purgeMediaProviderAsset({
        tenantId,
        userId: ctx.user.id,
        id: input.id,
      });
    }),
});
