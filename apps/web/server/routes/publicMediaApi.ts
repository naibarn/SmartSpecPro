import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { requireScopes } from "../middleware/requireScopes";
import { sendApiError } from "../middleware/publicApiHeaders";
import { mediaGenerationService } from "../services/mediaGenerationService";
import { deductCredits } from "../services/creditService";
import { createInternalTokenFromAuth } from "../_core/tokens";
import { validateReferenceUrls, ApiValidationError } from "../services/ssrfValidation";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const ImageGenerateSchema = z.object({
  prompt: z.string().min(1).max(4000),
  model: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  aspect_ratio: z.string().optional(),
  reference_image_urls: z.array(z.string()).max(5).optional(),
});

const VideoGenerateSchema = z.object({
  prompt: z.string().min(1).max(4000),
  model: z.string().optional(),
  duration_seconds: z.number().positive().optional(),
  quality: z.string().optional(),
  aspect_ratio: z.string().optional(),
  reference_image_urls: z.array(z.string()).max(5).optional(),
});

const AudioGenerateSchema = z.object({
  text: z.string().min(1).max(5000),
  voice: z.string().optional(),
  model: z.string().optional(),
  speed: z.number().optional(),
});

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createPublicMediaRouter(): Router {
  const router = Router();

  // -------------------------------------------------------------------------
  // POST /v1/media/images/generate
  // -------------------------------------------------------------------------
  router.post(
    "/images/generate",
    requireScopes("media:generate"),
    async (req, res) => {
      const parsed = ImageGenerateSchema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(
          res,
          400,
          "invalid_request",
          parsed.error.issues.map((i) => i.message).join("; "),
        );
        return;
      }

      const { prompt, model, width, height, aspect_ratio, reference_image_urls } = parsed.data;
      const auth = req.auth!;
      const userId = (auth as any).userId as number;

      // SSRF validation for reference image URLs
      if (reference_image_urls && reference_image_urls.length > 0) {
        try {
          await validateReferenceUrls(reference_image_urls);
        } catch (err: any) {
          if (err instanceof ApiValidationError) {
            sendApiError(res, 400, "invalid_request", err.message);
          } else {
            sendApiError(res, 400, "invalid_request", "Invalid reference image URL");
          }
          return;
        }
      }

      try {
        const userToken = createInternalTokenFromAuth({ userId }, ["media:generate"]);

        const size =
          width && height ? `${width}x${height}` : undefined;

        const task = await mediaGenerationService.generateImageAsync(
          {
            prompt,
            model,
            size,
            aspectRatio: aspect_ratio,
            referenceImageUrls: reference_image_urls,
            auditContext: { userId, source: "public_api" },
          },
          userToken,
        );

        await deductCredits({
          userId,
          amount: 1,
          sourceType: "api_media",
          description: `Image generation: ${prompt.slice(0, 50)}`,
        } as any);

        res.setHeader("X-Credits-Used", "1");
        res.status(202).json({ task_id: task.id, status: task.status });
      } catch (err: any) {
        console.error("[PublicMediaApi] image generate error", err);
        if (!res.headersSent) {
          sendApiError(res, 500, "internal_error", "Internal server error");
        }
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /v1/media/videos/generate
  // -------------------------------------------------------------------------
  router.post(
    "/videos/generate",
    requireScopes("media:generate"),
    async (req, res) => {
      const parsed = VideoGenerateSchema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(
          res,
          400,
          "invalid_request",
          parsed.error.issues.map((i) => i.message).join("; "),
        );
        return;
      }

      const { prompt, model, duration_seconds, quality, aspect_ratio, reference_image_urls } =
        parsed.data;
      const auth = req.auth!;
      const userId = (auth as any).userId as number;

      if (reference_image_urls && reference_image_urls.length > 0) {
        try {
          await validateReferenceUrls(reference_image_urls);
        } catch (err: any) {
          if (err instanceof ApiValidationError) {
            sendApiError(res, 400, "invalid_request", err.message);
          } else {
            sendApiError(res, 400, "invalid_request", "Invalid reference image URL");
          }
          return;
        }
      }

      try {
        const userToken = createInternalTokenFromAuth({ userId }, ["media:generate"]);

        const task = await mediaGenerationService.generateVideoAsync(
          {
            prompt,
            model,
            duration: duration_seconds,
            aspectRatio: aspect_ratio,
            referenceImageUrls: reference_image_urls,
            auditContext: { userId, source: "public_api" },
          },
          userToken,
        );

        await deductCredits({
          userId,
          amount: 2,
          sourceType: "api_media",
          description: `Video generation: ${prompt.slice(0, 50)}`,
        } as any);

        res.setHeader("X-Credits-Used", "2");
        res.status(202).json({ task_id: task.id, status: task.status });
      } catch (err: any) {
        console.error("[PublicMediaApi] video generate error", err);
        if (!res.headersSent) {
          sendApiError(res, 500, "internal_error", "Internal server error");
        }
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /v1/media/audio/generate
  // -------------------------------------------------------------------------
  router.post(
    "/audio/generate",
    requireScopes("media:generate"),
    async (req, res) => {
      const parsed = AudioGenerateSchema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(
          res,
          400,
          "invalid_request",
          parsed.error.issues.map((i) => i.message).join("; "),
        );
        return;
      }

      const { text, voice, model, speed } = parsed.data;
      const auth = req.auth!;
      const userId = (auth as any).userId as number;

      try {
        const userToken = createInternalTokenFromAuth({ userId }, ["media:generate"]);

        const task = await mediaGenerationService.generateAudioAsync(
          {
            text,
            voice,
            model,
            speed,
            auditContext: { userId, source: "public_api" },
          },
          userToken,
        );

        await deductCredits({
          userId,
          amount: 1,
          sourceType: "api_media",
          description: `Audio generation: ${text.slice(0, 50)}`,
        } as any);

        res.setHeader("X-Credits-Used", "1");
        res.status(202).json({ task_id: task.id, status: task.status });
      } catch (err: any) {
        console.error("[PublicMediaApi] audio generate error", err);
        if (!res.headersSent) {
          sendApiError(res, 500, "internal_error", "Internal server error");
        }
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/media/:taskId/status
  // -------------------------------------------------------------------------
  router.get("/:taskId/status", requireScopes("media:generate"), async (req, res) => {
    const { taskId } = req.params;
    const auth = req.auth!;
    const userId = (auth as any).userId as number;

    try {
      const userToken = createInternalTokenFromAuth({ userId }, ["media:generate"]);
      const task = await mediaGenerationService.getTask(taskId, userToken, {
        userId,
        source: "public_api",
      });

      const progressPct =
        task.status === "completed" ? 100 : task.status === "processing" ? 50 : 0;

      res.json({
        task_id: task.id,
        status: task.status,
        media_type: task.mediaType,
        result_url: task.resultUrl ?? null,
        progress_pct: progressPct,
        credits_used: task.creditsUsed ?? null,
        error: task.errorMessage ?? null,
        created_at: task.createdAt,
        completed_at: task.completedAt ?? null,
      });
    } catch (err: any) {
      console.error("[PublicMediaApi] status error", err);
      if (!res.headersSent) {
        sendApiError(res, 500, "internal_error", "Internal server error");
      }
    }
  });

  return router;
}
