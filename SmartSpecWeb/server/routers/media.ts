/**
 * Media Generation tRPC Router
 * Handles image, video, and audio generation via Python backend
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  mediaGenerationService,
  MEDIA_MODELS,
  DEFAULT_MODELS,
  type MediaType,
  type ImageModel,
  type VideoModel,
  type AudioModel,
  type TaskStatus,
} from "../services/mediaGenerationService";
import { deductCredits, hasEnoughCredits, refundCredits } from "../services/creditService";
import { signBearerToken } from "../_core/tokens";
import { mediaGenerationLimiter } from "../services/rateLimiter";

// Helper to create secure token for Python backend (fallback)
function createMediaToken(userId: number): string {
  return signBearerToken({
    sub: String(userId),
    type: "access", // Required by Python backend for token validation
    scopes: ["media:generate"],
    jti: `media_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  }, "15m"); // Short-lived token for single request
}

// Get user token - prefer session token from context, fallback to creating new one
function getUserToken(ctx: { userToken: string | null; user: { id: number } }): string {
  return ctx.userToken || createMediaToken(ctx.user.id);
}

// ==================== Zod Schemas ====================

const mediaTypeSchema = z.enum(["image", "video", "audio"]);
const taskStatusSchema = z.enum(["pending", "processing", "completed", "failed", "cancelled"]);

const imageModelSchema = z.enum([
  "google-nano-banana-pro",
  "flux-2.0",
  "z-image",
  "grok-imagine",
]);

const videoModelSchema = z.enum([
  "veo-3-1",
  "sora-2",
  "kling-2.6",
]);

const audioModelSchema = z.enum([
  "elevenlabs-tts",
  "elevenlabs-sfx",
]);

// Aspect ratio validation - prevent injection attacks
const aspectRatioSchema = z.enum([
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
]);

// Image size validation
const imageSizeSchema = z.enum([
  "1024x1024",
  "1024x1792",
  "1792x1024",
]);

// Voice validation for audio
const voiceSchema = z.enum([
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
]);

// ==================== Router ====================

export const mediaRouter = router({
  // Get available models
  getModels: protectedProcedure
    .input(
      z.object({
        type: mediaTypeSchema.optional(),
      }).optional()
    )
    .query(({ input }) => {
      const models = mediaGenerationService.getModels(input?.type);
      return {
        models,
        defaults: DEFAULT_MODELS,
      };
    }),

  // Get single model details
  getModel: protectedProcedure
    .input(z.object({ modelId: z.string() }))
    .query(({ input }) => {
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
        model: imageModelSchema.optional(),
        size: z.string().optional(),
        aspectRatio: aspectRatioSchema.optional(),
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

      const model = input.model || DEFAULT_MODELS.image;
      const modelMeta = MEDIA_MODELS[model];

      if (!modelMeta) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid model: ${model}`,
        });
      }

      // Check credits
      const hasCredits = await hasEnoughCredits(ctx.user.id, modelMeta.creditCost);
      if (!hasCredits) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Insufficient credits. Required: ${modelMeta.creditCost}`,
        });
      }

      try {
        // For now, we'll use a placeholder token - in production,
        // you'd pass the actual user token to the Python backend
        const userToken = getUserToken(ctx);

        const result = await mediaGenerationService.generateImage(
          {
            prompt: input.prompt,
            model: model as ImageModel,
            size: input.size,
            aspectRatio: input.aspectRatio,
            negativePrompt: input.negativePrompt,
            numImages: input.numImages,
            resolution: input.resolution,
            outputFormat: input.outputFormat,
            apiConfig: input.apiConfig,
            extraParams: input.extraParams,
          } as any,
          userToken
        );

        // Deduct credits on success
        await deductCredits({
          userId: ctx.user.id,
          amount: result.creditsUsed || modelMeta.creditCost,
          description: `Image generation: ${model}`,
          metadata: {
            model,
            provider: modelMeta.provider,
            prompt: input.prompt.slice(0, 100),
            endpoint: "generateImage",
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
        model: videoModelSchema.optional(),
        duration: z.number().min(1).max(60).optional(),
        aspectRatio: aspectRatioSchema.optional(),
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

      const model = input.model || DEFAULT_MODELS.video;
      const modelMeta = MEDIA_MODELS[model];

      if (!modelMeta) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid model: ${model}`,
        });
      }

      // Check credits
      const hasCredits = await hasEnoughCredits(ctx.user.id, modelMeta.creditCost);
      if (!hasCredits) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Insufficient credits. Required: ${modelMeta.creditCost}`,
        });
      }

      try {
        const userToken = getUserToken(ctx);

        const result = await mediaGenerationService.generateVideo(
          {
            prompt: input.prompt,
            model: model as VideoModel,
            duration: input.duration,
            aspectRatio: input.aspectRatio,
            fps: input.fps,
          },
          userToken
        );

        // Deduct credits on success
        await deductCredits({
          userId: ctx.user.id,
          amount: result.creditsUsed || modelMeta.creditCost,
          description: `Video generation: ${model}`,
          metadata: {
            model,
            provider: modelMeta.provider,
            prompt: input.prompt.slice(0, 100),
            duration: input.duration,
            endpoint: "generateVideo",
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

      const model = input.model || DEFAULT_MODELS.audio;
      const modelMeta = MEDIA_MODELS[model];

      if (!modelMeta) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid model: ${model}`,
        });
      }

      // Check credits
      const hasCredits = await hasEnoughCredits(ctx.user.id, modelMeta.creditCost);
      if (!hasCredits) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Insufficient credits. Required: ${modelMeta.creditCost}`,
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
          amount: result.creditsUsed || modelMeta.creditCost,
          description: `Audio generation: ${model}`,
          metadata: {
            model,
            provider: modelMeta.provider,
            textLength: input.text.length,
            endpoint: "generateAudio",
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
        model: imageModelSchema.optional(),
        size: z.string().optional(),
        aspectRatio: aspectRatioSchema.optional(),
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

      const model = input.model || DEFAULT_MODELS.image;
      const modelMeta = MEDIA_MODELS[model];

      if (!modelMeta) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid model: ${model}`,
        });
      }

      // Calculate credit cost (multiply by num images)
      const creditCost = modelMeta.creditCost * (input.numImages || 1);

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
        metadata: {
          model,
          provider: modelMeta.provider,
          prompt: input.prompt.slice(0, 100),
          endpoint: "generateImageAsync",
          type: "reservation",
        },
      });

      try {
        const userToken = getUserToken(ctx);

        const task = await mediaGenerationService.generateImageAsync(
          {
            prompt: input.prompt,
            model: model as ImageModel,
            size: input.size,
            aspectRatio: input.aspectRatio,
            negativePrompt: input.negativePrompt,
            numImages: input.numImages,
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
        model: videoModelSchema.optional(),
        duration: z.number().min(1).max(60).optional(),
        aspectRatio: aspectRatioSchema.optional(),
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

      const model = input.model || DEFAULT_MODELS.video;
      const modelMeta = MEDIA_MODELS[model];

      if (!modelMeta) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid model: ${model}`,
        });
      }

      // Calculate credit cost based on duration
      const duration = input.duration || 5;
      const durationMultiplier = Math.ceil(duration / 5);
      const creditCost = modelMeta.creditCost * durationMultiplier;

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
        metadata: {
          model,
          provider: modelMeta.provider,
          prompt: input.prompt.slice(0, 100),
          duration,
          endpoint: "generateVideoAsync",
          type: "reservation",
        },
      });

      try {
        const userToken = getUserToken(ctx);

        const task = await mediaGenerationService.generateVideoAsync(
          {
            prompt: input.prompt,
            model: model as VideoModel,
            duration: input.duration,
            aspectRatio: input.aspectRatio,
            fps: input.fps,
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

  // List user's tasks
  listTasks: protectedProcedure
    .input(
      z.object({
        mediaType: mediaTypeSchema.optional(),
        status: taskStatusSchema.optional(),
        limit: z.number().min(1).max(100).optional(),
        offset: z.number().min(0).optional(),
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
        });
        return result;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to list tasks",
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
          process.env.OAUTH_SERVER_URL ||
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
          process.env.OAUTH_SERVER_URL ||
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
      })
    )
    .query(({ input }) => {
      let modelId: string;

      if (input.model) {
        modelId = input.model;
      } else {
        modelId = DEFAULT_MODELS[input.type];
      }

      const modelMeta = MEDIA_MODELS[modelId];
      if (!modelMeta) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid model: ${modelId}`,
        });
      }

      let estimatedCredits = modelMeta.creditCost;

      // Multiply by number of images
      if (input.type === "image" && input.numImages) {
        estimatedCredits *= input.numImages;
      }

      // Multiply by duration for video
      if (input.type === "video" && input.duration) {
        // Base cost is for 5 seconds, multiply for longer videos
        estimatedCredits = Math.ceil(estimatedCredits * (input.duration / 5));
      }

      return {
        model: modelId,
        modelName: modelMeta.name,
        baseCredits: modelMeta.creditCost,
        estimatedCredits,
        multiplier: input.numImages || Math.ceil((input.duration || 5) / 5),
      };
    }),
});
