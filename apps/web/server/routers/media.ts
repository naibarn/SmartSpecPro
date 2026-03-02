/**
 * Media Generation tRPC Router
 * Handles image, video, and audio generation via Python backend
 */

import crypto from "crypto";
import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  mediaGenerationService,
  MEDIA_MODELS,
  DEFAULT_MODELS,
  type MediaType,
  type AudioModel,
  type TaskStatus,
} from "../services/mediaGenerationService";
import { deductCredits, hasEnoughCredits, refundCredits } from "../services/creditService";
import { calculateCreditCost, type UserSelections } from "../services/pricingCalculator";
import { signBearerToken } from "../_core/tokens";
import { mediaGenerationLimiter } from "../services/rateLimiter";
import { auditLogger } from "../services/auditLogger";
import { addMediaTaskToLibrary } from "../services/mediaLibraryService";
import { isLibraryEnabledForTenant } from "../services/libraryFeatureFlags";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import { getDb } from "../db";
import { mediaModels } from "../../drizzle/schema";
import { eq, asc, and } from "drizzle-orm";
import { shouldUseSandbox, dispatchToSandbox } from "../services/sandbox/dispatchService";
import { checkAbuseGuard, hashPrompt } from "../services/abuseGuard";

// Helper to create secure token for Python backend (fallback)
function createMediaToken(userId: number): string {
  return signBearerToken({
    sub: String(userId),
    type: "access", // Required by Python backend for token validation
    scopes: ["media:generate"],
    jti: `media_${Date.now()}_${crypto.randomBytes(12).toString("hex")}`,
  }, "15m"); // Short-lived token for single request
}

// Get user token - prefer session token from context, fallback to creating new one
function getUserToken(ctx: { userToken: string | null; user: { id: number } }): string {
  return ctx.userToken || createMediaToken(ctx.user.id);
}

async function resolveLibraryTenantIdForMedia(
  ctx: { tenantId: unknown; user: { id: number; currentTenantId?: unknown } },
): Promise<string | null> {
  return resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
}

function isLibraryUrlValidationError(error: unknown): boolean {
  return error instanceof Error && error.name === "LibraryUrlValidationError";
}

const mediaModelLookupCounters = {
  pricingDbMissFallback: 0,
  metadataDbMissFallback: 0,
  unknownModelRejected: 0,
  defaultFromDb: 0,
  defaultFallbackStatic: 0,
};

export function getMediaModelLookupCounters(): Readonly<typeof mediaModelLookupCounters> {
  return { ...mediaModelLookupCounters };
}

export function resetMediaModelLookupCounters(): void {
  mediaModelLookupCounters.pricingDbMissFallback = 0;
  mediaModelLookupCounters.metadataDbMissFallback = 0;
  mediaModelLookupCounters.unknownModelRejected = 0;
  mediaModelLookupCounters.defaultFromDb = 0;
  mediaModelLookupCounters.defaultFallbackStatic = 0;
}

/**
 * Look up a media model from the DB to get its configJson (pricingTiers).
 * Falls back to static metadata only when DB is unavailable or missing the model.
 */
async function getModelWithPricing(modelId: string): Promise<{
  creditCost: number;
  configJson: Record<string, any> | null;
}> {
  try {
    const db = await getDb();
    if (db) {
      const [dbModel] = await db
        .select({ creditCost: mediaModels.creditCost, configJson: mediaModels.configJson })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, modelId))
        .limit(1);
      if (dbModel) {
        return { creditCost: dbModel.creditCost, configJson: dbModel.configJson as Record<string, any> | null };
      }
    }
  } catch (error) {
    console.warn("[MediaModelLookup] Pricing DB lookup failed, fallback to static/default", {
      modelId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  mediaModelLookupCounters.pricingDbMissFallback += 1;
  const hardcoded = MEDIA_MODELS[modelId];
  if (!hardcoded) {
    console.warn("[MediaModelLookup] Pricing fallback used default credit cost", { modelId });
  }
  return { creditCost: hardcoded?.creditCost ?? 10, configJson: null };
}

async function getModelName(modelId: string): Promise<string> {
  try {
    const db = await getDb();
    if (db) {
      const [dbModel] = await db
        .select({ name: mediaModels.name })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, modelId))
        .limit(1);
      if (dbModel?.name) {
        return dbModel.name;
      }
    }
  } catch {
    // Fall through to hardcoded metadata.
  }
  mediaModelLookupCounters.metadataDbMissFallback += 1;
  return MEDIA_MODELS[modelId]?.name ?? modelId;
}

async function getDefaultModelId(type: MediaType): Promise<string> {
  try {
    const db = await getDb();
    if (db) {
      const [dbModel] = await db
        .select({ modelId: mediaModels.modelId })
        .from(mediaModels)
        .where(and(eq(mediaModels.modelType, type), eq(mediaModels.isEnabled, true)))
        .orderBy(asc(mediaModels.sortOrder), asc(mediaModels.priority), asc(mediaModels.id))
        .limit(1);
      if (dbModel?.modelId) {
        mediaModelLookupCounters.defaultFromDb += 1;
        return dbModel.modelId;
      }
    }
  } catch (error) {
    console.warn("[MediaModelLookup] Default model DB lookup failed, using static default", {
      type,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  mediaModelLookupCounters.defaultFallbackStatic += 1;
  return DEFAULT_MODELS[type];
}

async function resolveModelMeta(
  modelId: string,
  expectedType: MediaType,
): Promise<{ provider: string; type: MediaType }> {
  const db = await getDb();
  if (db) {
    try {
      const [dbModel] = await db
        .select({
          modelType: mediaModels.modelType,
          provider: mediaModels.provider,
          isEnabled: mediaModels.isEnabled,
        })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, modelId))
        .limit(1);

      if (!dbModel) {
        mediaModelLookupCounters.unknownModelRejected += 1;
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid model: ${modelId}`,
        });
      }

      if (!dbModel.isEnabled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Model "${modelId}" is disabled`,
        });
      }

      if (dbModel.modelType !== expectedType) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Model "${modelId}" is not a ${expectedType} model`,
        });
      }

      return { provider: dbModel.provider, type: dbModel.modelType as MediaType };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      console.warn("[MediaModelLookup] Metadata DB lookup failed, trying static fallback", {
        modelId,
        expectedType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const hardcodedModel = MEDIA_MODELS[modelId];
  if (hardcodedModel) {
    mediaModelLookupCounters.metadataDbMissFallback += 1;
    console.warn("[MediaModelLookup] Model metadata fallback hit", { modelId, expectedType });
    if (hardcodedModel.type !== expectedType) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Model "${modelId}" is not a ${expectedType} model`,
      });
    }
    return { provider: hardcodedModel.provider, type: hardcodedModel.type };
  }

  mediaModelLookupCounters.unknownModelRejected += 1;
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `Invalid model: ${modelId}`,
  });
}

// ==================== Zod Schemas ====================

const mediaTypeSchema = z.enum(["image", "video", "audio"]);
const taskStatusSchema = z.enum(["pending", "processing", "completed", "failed", "cancelled"]);
const mediaModelIdSchema = z.string().min(1).max(120);
const flexibleAspectRatioSchema = z.string().min(2).max(20);
const referenceMediaUrlSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine((value) => value.startsWith("/") || /^https?:\/\//i.test(value), {
    message: "Reference URL must be a relative path or http(s) URL",
  });

const audioModelSchema = mediaModelIdSchema;

// ==================== Router ====================

export const mediaRouter = router({
  // Get available models (from DB, falls back to hardcoded registry)
  getModels: protectedProcedure
    .input(
      z.object({
        type: mediaTypeSchema.optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (db) {
        const conditions = [eq(mediaModels.isEnabled, true)];
        if (input?.type) {
          conditions.push(eq(mediaModels.modelType, input.type as "image" | "video" | "audio"));
        }
        const rows = await db
          .select({
            id: mediaModels.modelId,
            name: mediaModels.name,
            description: mediaModels.description,
            type: mediaModels.modelType,
            provider: mediaModels.provider,
            creditCost: mediaModels.creditCost,
            supportsAspectRatios: mediaModels.aspectRatios,
            supportsSizes: mediaModels.sizes,
            supportsDurations: mediaModels.durations,
            configJson: mediaModels.configJson,
          })
          .from(mediaModels)
          .where(and(...conditions))
          .orderBy(asc(mediaModels.sortOrder), asc(mediaModels.priority), asc(mediaModels.id));

        // Derive defaults: first model per type in sorted order
        const defaultImage = rows.find(m => m.type === "image")?.id ?? DEFAULT_MODELS.image;
        const defaultVideo = rows.find(m => m.type === "video")?.id ?? DEFAULT_MODELS.video;
        const defaultAudio = rows.find(m => m.type === "audio")?.id ?? DEFAULT_MODELS.audio;

        return {
          models: rows,
          defaults: { image: defaultImage, video: defaultVideo, audio: defaultAudio },
        };
      }
      // Fallback to hardcoded registry if DB unavailable
      const models = mediaGenerationService.getModels(input?.type);
      return { models, defaults: DEFAULT_MODELS };
    }),

  // Get single model details
  getModel: protectedProcedure
    .input(z.object({ modelId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (db) {
        try {
          const [dbModel] = await db
            .select({
              id: mediaModels.modelId,
              type: mediaModels.modelType,
              name: mediaModels.name,
              provider: mediaModels.provider,
              description: mediaModels.description,
              creditCost: mediaModels.creditCost,
              supportsAspectRatios: mediaModels.aspectRatios,
              supportsSizes: mediaModels.sizes,
              supportsDurations: mediaModels.durations,
              supportsVoices: mediaModels.voices,
            })
            .from(mediaModels)
            .where(and(eq(mediaModels.modelId, input.modelId), eq(mediaModels.isEnabled, true)))
            .limit(1);

          if (!dbModel) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Model ${input.modelId} not found`,
            });
          }

          return dbModel;
        } catch (error) {
          if (error instanceof TRPCError) {
            throw error;
          }
          console.warn("[MediaModelLookup] getModel DB lookup failed, fallback to static registry", {
            modelId: input.modelId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const model = mediaGenerationService.getModel(input.modelId);
      if (!model) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Model ${input.modelId} not found`,
        });
      }
      return model;
    }),

  // Generate image (synchronous)
  generateImage: protectedProcedure
    .input(
      z.object({
        prompt: z.string().min(1).max(2000),
        model: mediaModelIdSchema.optional(),
        size: z.string().optional(),
        aspectRatio: flexibleAspectRatioSchema.optional(),
        negativePrompt: z.string().max(1000).optional(),
        numImages: z.number().min(1).max(4).optional(),
        resolution: z.string().optional(),
        outputFormat: z.string().optional(),
        apiConfig: z.record(z.string()).optional(),
        extraParams: z.record(z.any()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Rate limiting
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      // Abuse guard: detect duplicate/burst/loop patterns
      const abuseResult = await checkAbuseGuard({
        userId: ctx.user.id,
        namespace: "media:image",
        promptHash: hashPrompt(input.prompt, input.model),
      });
      if (!abuseResult.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Request blocked: ${abuseResult.reason}. Retry after ${abuseResult.retryAfter}s.`,
        });
      }

      // Check if media should route through sandbox
      if (
        shouldUseSandbox("sandbox-media") &&
        process.env.SANDBOX_REQUIRE_FOR_MEDIA === "true"
      ) {
        const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
        const sandboxResult = await dispatchToSandbox({
          featureType: "media",
          executionMode: "sandbox-media",
          tenantId: tenantId || "",
          userId: ctx.user.id,
          inputFiles: [],
          metadata: {
            model: input.model,
            prompt: input.prompt,
            aspectRatio: input.aspectRatio,
            numImages: input.numImages,
            ...input.extraParams,
          },
        });

        return {
          success: true,
          taskId: sandboxResult.jobId,
          isAsync: true,
          message: "Media generation dispatched to secure sandbox",
          isSandboxJob: true,
        };
      }

      const model = input.model || await getDefaultModelId("image");
      const modelMeta = await resolveModelMeta(model, "image");

      // Calculate credit cost from DB pricingTiers
      const dbModel = await getModelWithPricing(model);
      const creditCost = calculateCreditCost(dbModel, {
        numImages: input.numImages,
        resolution: input.resolution,
      });

      // Check credits
      const hasCredits = await hasEnoughCredits(ctx.user.id, creditCost);
      if (!hasCredits) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Insufficient credits. Required: ${creditCost}`,
        });
      }

      try {
        const userToken = getUserToken(ctx);
        const debugTraceId = crypto.randomUUID();
        const apiConfigWithProvider = {
          ...(input.apiConfig ?? {}),
          provider: modelMeta.provider,
          trace_id: debugTraceId,
        };

        const result = await mediaGenerationService.generateImage(
          {
            prompt: input.prompt,
            model,
            size: input.size,
            aspectRatio: input.aspectRatio,
            negativePrompt: input.negativePrompt,
            numImages: input.numImages,
            resolution: input.resolution,
            outputFormat: input.outputFormat,
            apiConfig: apiConfigWithProvider,
            extraParams: input.extraParams,
            publicUrl: ctx.publicUrl ?? undefined,
          },
          userToken
        );

        // Deduct credits on success — use backend-reported cost if available
        await deductCredits({
          userId: ctx.user.id,
          amount: result.creditsUsed || creditCost,
          description: `Image generation: ${model}`,
          sourceType: "media_image",
          metadata: {
            model,
            provider: modelMeta.provider,
            prompt: input.prompt.slice(0, 100),
            endpoint: "generateImage",
            creditCost,
          },
        });

        return result;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Image generation failed",
        });
      }
    }),

  // Generate video (synchronous)
  generateVideo: protectedProcedure
    .input(
      z.object({
        prompt: z.string().min(1).max(2000),
        model: mediaModelIdSchema.optional(),
        duration: z.number().min(1).max(60).optional(),
        aspectRatio: flexibleAspectRatioSchema.optional(),
        fps: z.number().min(15).max(60).optional(),
        resolution: z.string().optional(),
        apiConfig: z.record(z.string()).optional(),
        extraParams: z.record(z.any()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Rate limiting
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      // Abuse guard: detect duplicate/burst/loop patterns
      const abuseResult = await checkAbuseGuard({
        userId: ctx.user.id,
        namespace: "media:video",
        promptHash: hashPrompt(input.prompt, input.model),
      });
      if (!abuseResult.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Request blocked: ${abuseResult.reason}. Retry after ${abuseResult.retryAfter}s.`,
        });
      }

      const model = input.model || await getDefaultModelId("video");
      const modelMeta = await resolveModelMeta(model, "video");

      // Calculate credit cost from DB pricingTiers
      const dbModel = await getModelWithPricing(model);
      const creditCost = calculateCreditCost(dbModel, {
        duration: input.duration,
        resolution: input.resolution,
      });

      // Check credits
      const hasCredits = await hasEnoughCredits(ctx.user.id, creditCost);
      if (!hasCredits) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Insufficient credits. Required: ${creditCost}`,
        });
      }

      try {
        const userToken = getUserToken(ctx);
        const debugTraceId = crypto.randomUUID();
        const apiConfigWithProvider = {
          ...(input.apiConfig ?? {}),
          provider: modelMeta.provider,
          trace_id: debugTraceId,
        };

        const result = await mediaGenerationService.generateVideo(
          {
            prompt: input.prompt,
            model,
            duration: input.duration,
            aspectRatio: input.aspectRatio,
            fps: input.fps,
            resolution: input.resolution,
            apiConfig: apiConfigWithProvider,
            extraParams: input.extraParams,
            publicUrl: ctx.publicUrl ?? undefined,
          },
          userToken
        );

        // Deduct credits on success
        await deductCredits({
          userId: ctx.user.id,
          amount: result.creditsUsed || creditCost,
          description: `Video generation: ${model}`,
          sourceType: "media_video",
          metadata: {
            model,
            provider: modelMeta.provider,
            prompt: input.prompt.slice(0, 100),
            duration: input.duration,
            endpoint: "generateVideo",
            creditCost,
          },
        });

        return result;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Video generation failed",
        });
      }
    }),

  // Generate audio (synchronous)
  generateAudio: protectedProcedure
    .input(
      z.object({
        text: z.string().min(1).max(5000),
        model: audioModelSchema.optional(),
        voice: z.string().optional(),
        speed: z.number().min(0.5).max(2.0).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Rate limiting
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      // Abuse guard: detect duplicate/burst/loop patterns
      const abuseResult = await checkAbuseGuard({
        userId: ctx.user.id,
        namespace: "media:audio",
        promptHash: hashPrompt(input.text, input.model),
      });
      if (!abuseResult.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Request blocked: ${abuseResult.reason}. Retry after ${abuseResult.retryAfter}s.`,
        });
      }

      const model = input.model || await getDefaultModelId("audio");
      const modelMeta = await resolveModelMeta(model, "audio");

      // Calculate credit cost from DB pricingTiers
      const dbModel = await getModelWithPricing(model);
      const creditCost = calculateCreditCost(dbModel, {});

      // Check credits
      const hasCredits = await hasEnoughCredits(ctx.user.id, creditCost);
      if (!hasCredits) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Insufficient credits. Required: ${creditCost}`,
        });
      }

      try {
        const userToken = getUserToken(ctx);

        const result = await mediaGenerationService.generateAudio(
          {
            text: input.text,
            model: model as AudioModel,
            voice: input.voice,
            speed: input.speed,
          },
          userToken
        );

        // Deduct credits on success
        await deductCredits({
          userId: ctx.user.id,
          amount: result.creditsUsed || creditCost,
          description: `Audio generation: ${model}`,
          sourceType: "media_audio",
          metadata: {
            model,
            provider: modelMeta.provider,
            textLength: input.text.length,
            endpoint: "generateAudio",
            creditCost,
          },
        });

        return result;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Audio generation failed",
        });
      }
    }),

  // Generate image async (returns task ID)
  generateImageAsync: protectedProcedure
    .input(
      z.object({
        prompt: z.string().min(1).max(2000),
        model: mediaModelIdSchema.optional(),
        size: z.string().optional(),
        aspectRatio: flexibleAspectRatioSchema.optional(),
        negativePrompt: z.string().max(1000).optional(),
        numImages: z.number().min(1).max(4).optional(),
        resolution: z.string().optional(),
        outputFormat: z.string().optional(),
        referenceImageUrls: z.array(referenceMediaUrlSchema).max(5).optional(),
        referenceStyleUrl: referenceMediaUrlSchema.optional(),
        apiConfig: z.record(z.string()).optional(),
        extraParams: z.record(z.any()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Rate limiting
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      // Abuse guard: detect duplicate/burst/loop patterns
      const abuseResult = await checkAbuseGuard({
        userId: ctx.user.id,
        namespace: "media:image_async",
        promptHash: hashPrompt(input.prompt, input.model),
      });
      if (!abuseResult.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Request blocked: ${abuseResult.reason}. Retry after ${abuseResult.retryAfter}s.`,
        });
      }

      const model = input.model || await getDefaultModelId("image");
      const modelMeta = await resolveModelMeta(model, "image");

      // Calculate credit cost from DB pricingTiers
      const dbModel = await getModelWithPricing(model);
      const creditCost = calculateCreditCost(dbModel, {
        numImages: input.numImages,
        resolution: input.resolution,
      });

      // Check and deduct credits upfront to prevent race condition
      const hasCredits = await hasEnoughCredits(ctx.user.id, creditCost);
      if (!hasCredits) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Insufficient credits. Required: ${creditCost}`,
        });
      }

      // Deduct credits BEFORE starting the task
      await deductCredits({
        userId: ctx.user.id,
        amount: creditCost,
        description: `Async image generation: ${model} (reserved)`,
        sourceType: "media_image",
        metadata: {
          model,
          provider: modelMeta.provider,
          prompt: input.prompt.slice(0, 100),
          endpoint: "generateImageAsync",
          type: "reservation",
          creditCost,
        },
      });

      try {
        const userToken = getUserToken(ctx);
        const debugTraceId = crypto.randomUUID();
        const apiConfigWithProvider = {
          ...(input.apiConfig ?? {}),
          provider: modelMeta.provider,
          trace_id: debugTraceId,
        };

        const task = await mediaGenerationService.generateImageAsync(
          {
            prompt: input.prompt,
            model,
            size: input.size,
            aspectRatio: input.aspectRatio,
            negativePrompt: input.negativePrompt,
            numImages: input.numImages,
            resolution: input.resolution,
            outputFormat: input.outputFormat,
            referenceImageUrls: input.referenceImageUrls,
            referenceStyleUrl: input.referenceStyleUrl,
            apiConfig: apiConfigWithProvider,
            extraParams: input.extraParams,
            publicUrl: ctx.publicUrl ?? undefined,
          },
          userToken
        );

        return task;
      } catch (error) {
        // Refund credits on failure
        console.error("[Media] Image generation failed, refunding credits:", error);
        try {
          await refundCredits({
            userId: ctx.user.id,
            amount: creditCost,
            description: `Refund: Image generation failed (${model})`,
            sourceType: "media_image",
            metadata: {
              model,
              prompt: input.prompt.slice(0, 100),
              error: error instanceof Error ? error.message : "Unknown error",
            },
          });
        } catch (refundError) {
          console.error("[Media] Failed to refund credits:", refundError);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Async image generation failed",
        });
      }
    }),

  // Generate video async (returns task ID)
  generateVideoAsync: protectedProcedure
    .input(
      z.object({
        prompt: z.string().min(1).max(2000),
        model: mediaModelIdSchema.optional(),
        duration: z.number().min(1).max(60).optional(),
        aspectRatio: flexibleAspectRatioSchema.optional(),
        fps: z.number().min(15).max(60).optional(),
        resolution: z.string().optional(),
        referenceImageUrls: z.array(referenceMediaUrlSchema).max(5).optional(),
        referenceVideoUrl: referenceMediaUrlSchema.optional(),
        apiConfig: z.record(z.string()).optional(),
        extraParams: z.record(z.any()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Rate limiting
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      // Abuse guard: detect duplicate/burst/loop patterns
      const abuseResult = await checkAbuseGuard({
        userId: ctx.user.id,
        namespace: "media:video_async",
        promptHash: hashPrompt(input.prompt, input.model),
      });
      if (!abuseResult.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Request blocked: ${abuseResult.reason}. Retry after ${abuseResult.retryAfter}s.`,
        });
      }

      const model = input.model || await getDefaultModelId("video");
      const modelMeta = await resolveModelMeta(model, "video");

      // Calculate credit cost from DB pricingTiers
      const dbModel = await getModelWithPricing(model);
      const duration = input.duration || 5;
      const creditCost = calculateCreditCost(dbModel, {
        duration,
        resolution: input.resolution,
      });

      // Check and deduct credits upfront to prevent race condition
      const hasCredits = await hasEnoughCredits(ctx.user.id, creditCost);
      if (!hasCredits) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Insufficient credits. Required: ${creditCost} for ${duration}s video`,
        });
      }

      // Deduct credits BEFORE starting the task
      await deductCredits({
        userId: ctx.user.id,
        amount: creditCost,
        description: `Async video generation: ${model} ${duration}s (reserved)`,
        sourceType: "media_video",
        metadata: {
          model,
          provider: modelMeta.provider,
          prompt: input.prompt.slice(0, 100),
          duration,
          endpoint: "generateVideoAsync",
          type: "reservation",
          creditCost,
        },
      });

      try {
        const userToken = getUserToken(ctx);
        const debugTraceId = crypto.randomUUID();
        const apiConfigWithProvider = {
          ...(input.apiConfig ?? {}),
          provider: modelMeta.provider,
          trace_id: debugTraceId,
        };

        const task = await mediaGenerationService.generateVideoAsync(
          {
            prompt: input.prompt,
            model,
            duration: input.duration,
            aspectRatio: input.aspectRatio,
            fps: input.fps,
            resolution: input.resolution,
            referenceImageUrls: input.referenceImageUrls,
            referenceVideoUrl: input.referenceVideoUrl,
            apiConfig: apiConfigWithProvider,
            extraParams: input.extraParams,
            publicUrl: ctx.publicUrl ?? undefined,
          },
          userToken
        );

        return task;
      } catch (error) {
        // Refund credits on failure
        console.error("[Media] Video generation failed, refunding credits:", error);
        try {
          await refundCredits({
            userId: ctx.user.id,
            amount: creditCost,
            description: `Refund: Video generation failed (${model})`,
            sourceType: "media_video",
            metadata: {
              model,
              duration,
              prompt: input.prompt.slice(0, 100),
              error: error instanceof Error ? error.message : "Unknown error",
            },
          });
        } catch (refundError) {
          console.error("[Media] Failed to refund credits:", refundError);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Async video generation failed",
        });
      }
    }),

  // Get task status
  getTask: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .query(async ({ input, ctx }) => {
      try {
        const userToken = getUserToken(ctx);
        const task = await mediaGenerationService.getTask(input.taskId, userToken);
        return task;
      } catch (error) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: error instanceof Error ? error.message : "Task not found",
        });
      }
    }),

  // Add completed media task result into library + enqueue indexing
  addTaskToLibrary: protectedProcedure
    .input(
      z.object({
        taskId: z.string().min(1),
        title: z.string().min(1).max(255).optional(),
        visibility: z.enum(["private", "team", "public"]).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = await resolveLibraryTenantIdForMedia(ctx);
      if (tenantId === null || tenantId === undefined) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant context is required for add-to-library",
        });
      }
      if (!isLibraryEnabledForTenant(tenantId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Library feature is disabled for this tenant",
        });
      }

      try {
        const userToken = getUserToken(ctx);
        const result = await addMediaTaskToLibrary(
          {
            mediaTaskId: input.taskId,
            userToken,
            title: input.title,
            visibility: input.visibility,
          },
          {
            userId: ctx.user.id,
            tenantId: tenantId as any,
            role: ctx.user.role,
          },
        );
        auditLogger.log({
          eventType: "library_mutation",
          userId: ctx.user.id,
          endpoint: "media.addTaskToLibrary",
          requestType: "mutation",
          requestPayload: {
            tenantId,
            taskId: input.taskId,
            visibility: input.visibility ?? "private",
          },
          responsePayload: {
            itemId: result.itemId,
            created: result.created,
            indexJobId: result.indexJob?.jobId ?? null,
          },
        });
        return result;
      } catch (error) {
        const rootCause =
          error instanceof Error && error.cause instanceof Error
            ? error.cause.message
            : null;
        const message = rootCause || (error instanceof Error ? error.message : "Failed to add media task to library");
        if (isLibraryUrlValidationError(error)) {
          throw new TRPCError({ code: "BAD_REQUEST", message });
        }
        if (message.includes("Only completed media tasks")) {
          throw new TRPCError({ code: "BAD_REQUEST", message });
        }
        if (message.includes("not found")) {
          throw new TRPCError({ code: "NOT_FOUND", message });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
      }
    }),

  // List user's tasks
  listTasks: protectedProcedure
    .input(
      z.object({
        mediaType: mediaTypeSchema.optional(),
        status: taskStatusSchema.optional(),
        limit: z.number().min(1).max(100).optional(),
        offset: z.number().min(0).optional(),
        daysAgo: z.number().min(1).max(365).optional(),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      try {
        const userToken = getUserToken(ctx);
        const result = await mediaGenerationService.listTasks(userToken, {
          mediaType: input?.mediaType as MediaType,
          status: input?.status as TaskStatus,
          limit: input?.limit,
          offset: input?.offset,
          daysAgo: input?.daysAgo,
        });
        return result;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to list tasks",
        });
      }
    }),

  // List ALL tasks (admin only)
  listAllTasks: adminProcedure
    .input(
      z.object({
        mediaType: z.enum(["image", "video", "audio"]).optional(),
        status: z.enum(["pending", "processing", "completed", "failed", "cancelled"]).optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      try {
        const userToken = getUserToken(ctx);
        const PYTHON_BACKEND_URL =
          process.env.PYTHON_BACKEND_URL ||
          process.env.BACKEND_URL ||
          "http://localhost:8000";

        const params = new URLSearchParams();
        if (input?.mediaType) params.append("media_type", input.mediaType);
        if (input?.status) params.append("status_filter", input.status);
        if (input?.limit) params.append("limit", input.limit.toString());
        if (input?.offset) params.append("offset", input.offset.toString());

        const url = `${PYTHON_BACKEND_URL}/api/v1/media/tasks/admin${params.toString() ? `?${params}` : ""}`;
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${userToken}`,
          },
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: "Unknown error" }));
          const msg = error.detail || `Admin list tasks failed: ${response.status}`;
          const code = response.status === 401 ? "UNAUTHORIZED"
            : response.status === 403 ? "FORBIDDEN"
            : response.status === 404 ? "NOT_FOUND"
            : "INTERNAL_SERVER_ERROR";
          throw new TRPCError({ code, message: msg });
        }

        return await response.json();
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to list all tasks",
        });
      }
    }),

  // Cancel a task
  cancelTask: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const userToken = getUserToken(ctx);
        const task = await mediaGenerationService.cancelTask(input.taskId, userToken);
        return task;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to cancel task",
        });
      }
    }),

  // Delete a task (removes from history)
  deleteTask: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const userToken = getUserToken(ctx);
        const PYTHON_BACKEND_URL =
          process.env.PYTHON_BACKEND_URL ||
          process.env.BACKEND_URL ||
          "http://localhost:8000";

        const response = await fetch(`${PYTHON_BACKEND_URL}/api/v1/media/tasks/${input.taskId}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${userToken}`,
          },
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: "Unknown error" }));
          throw new Error(error.detail || `Delete task failed: ${response.status}`);
        }

        return { success: true, taskId: input.taskId };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to delete task",
        });
      }
    }),

  // Fetch task result from Kie.ai (useful when callback wasn't received)
  fetchTaskResult: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const userToken = getUserToken(ctx);
        const PYTHON_BACKEND_URL =
          process.env.PYTHON_BACKEND_URL ||
          process.env.BACKEND_URL ||
          "http://localhost:8000";

        const response = await fetch(`${PYTHON_BACKEND_URL}/api/v1/media/tasks/${input.taskId}/fetch-result`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${userToken}`,
          },
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: "Unknown error" }));
          throw new Error(error.detail || `Fetch result failed: ${response.status}`);
        }

        return await response.json();
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch task result",
        });
      }
    }),

  // Estimate credits for generation
  estimateCredits: protectedProcedure
    .input(
      z.object({
        type: mediaTypeSchema,
        model: z.string().optional(),
        numImages: z.number().optional(),
        duration: z.number().optional(),
        resolution: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const modelId = input.model || await getDefaultModelId(input.type);
      await resolveModelMeta(modelId, input.type);
      const modelName = await getModelName(modelId);

      // Calculate from DB pricingTiers
      const dbModel = await getModelWithPricing(modelId);
      const estimatedCredits = calculateCreditCost(dbModel, {
        numImages: input.numImages,
        duration: input.duration,
        resolution: input.resolution,
      });

      return {
        model: modelId,
        modelName,
        baseCredits: dbModel.creditCost,
        estimatedCredits,
        multiplier: input.numImages || 1,
      };
    }),
});
