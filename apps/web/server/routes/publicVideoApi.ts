import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { requireScopes } from "../middleware/requireScopes";
import { sendApiError } from "../middleware/publicApiHeaders";
import { mediaGenerationService } from "../services/mediaGenerationService";
import { deductCredits } from "../services/creditService";
import { createInternalTokenFromAuth } from "../_core/tokens";
import { resolveExportDownloadTarget } from "./exportDownloadTarget";
import {
  buildDelegatedWorkerOriginMetadata,
  DelegatedWorkerPlatformError,
  runWithDelegatedWorkerExecution,
} from "../services/delegatedWorkerPlatformService";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CREDITS_PER_MINUTE = {
  draft: 3,
  standard: 5,
  high: 10,
} as const;

const MAX_SINGLE_JOB_CREDITS = 10_000;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const CreateVideoProjectSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  duration_minutes: z.number().positive(),
  quality: z.enum(["draft", "standard", "high"]).default("standard"),
  prompt: z.string().min(1).max(4000).optional(),
  model: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createPublicVideoRouter(): Router {
  const router = Router();

  // -------------------------------------------------------------------------
  // POST /v1/video-projects
  // -------------------------------------------------------------------------
  router.post("/", requireScopes("video_projects:create"), async (req, res) => {
    const parsed = CreateVideoProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      sendApiError(
        res,
        400,
        "invalid_request",
        parsed.error.issues.map((i) => i.message).join("; "),
      );
      return;
    }

    const { title, description, duration_minutes, quality, prompt, model } = parsed.data;

    const credits = Math.ceil(duration_minutes * CREDITS_PER_MINUTE[quality]);
    if (credits > MAX_SINGLE_JOB_CREDITS) {
      sendApiError(
        res,
        400,
        "credit_overflow",
        `Estimated cost of ${credits} credits exceeds maximum of ${MAX_SINGLE_JOB_CREDITS} per job`,
      );
      return;
    }

    const auth = req.auth!;
    const userId = (auth as any).userId as number;
    const tenantId = (auth as any).tenantId as string;
    const idempotencyKey = req.get("Idempotency-Key") || undefined;

    try {
      const task = await runWithDelegatedWorkerExecution({
        auth,
        actionClass: "media",
        estimatedCredits: credits,
        idempotencyKey,
      }, async () => {
        await deductCredits({
          userId,
          amount: credits,
          sourceType: "api_video_project",
          description: `Video project: ${title.slice(0, 50)}`,
          idempotencyKey,
          metadata: buildDelegatedWorkerOriginMetadata(auth, "video_projects.create", {
            endpoint: "/v1/video-projects",
            title,
            quality,
            durationMinutes: duration_minutes,
            model: model ?? null,
          }),
        } as any);

        const userToken = createInternalTokenFromAuth({ userId, tenantId }, ["media:generate"]);

        return mediaGenerationService.generateVideoAsync(
          {
            prompt: prompt ?? title,
            model,
            duration: duration_minutes * 60,
          },
          userToken,
        );
      });

      res.setHeader("X-Credits-Used", String(credits));
      res.status(201).json({
        id: task.id,
        status: task.status,
        credits_reserved: credits,
        title,
        description: description ?? null,
        quality,
        duration_minutes,
        created_at: task.createdAt,
      });
    } catch (err: any) {
      if (err instanceof DelegatedWorkerPlatformError) {
        sendApiError(res, err.statusCode, err.code, err.message, err.type);
        return;
      }
      console.error("[PublicVideoApi] create error", err);
      if (!res.headersSent) {
        sendApiError(res, 500, "internal_error", "Internal server error");
      }
    }
  });

  // -------------------------------------------------------------------------
  // GET /v1/video-projects/:id
  // -------------------------------------------------------------------------
  router.get("/:id", requireScopes("video_projects:create"), async (req, res) => {
    const { id } = req.params;
    const auth = req.auth!;
    const userId = (auth as any).userId as number;
    const tenantId = (auth as any).tenantId as string;

    try {
      const userToken = createInternalTokenFromAuth({ userId, tenantId }, ["media:generate"]);
      const task = await mediaGenerationService.getTask(id, userToken, {
        userId,
        tenantId,
        source: "public_video_api",
      });

      res.json({
        id: task.id,
        status: task.status,
        media_type: task.mediaType,
        model: task.model,
        result_url: task.resultUrl ?? null,
        progress_pct: task.status === "completed" ? 100 : task.status === "processing" ? 50 : 0,
        credits_used: task.creditsUsed ?? null,
        created_at: task.createdAt,
        completed_at: task.completedAt ?? null,
        error: task.errorMessage ?? null,
      });
    } catch (err: any) {
      console.error("[PublicVideoApi] get error", err);
      if (!res.headersSent) {
        sendApiError(res, 500, "internal_error", "Internal server error");
      }
    }
  });

  // -------------------------------------------------------------------------
  // GET /v1/video-projects/:id/export/download
  // -------------------------------------------------------------------------
  router.get("/:id/export/download", requireScopes("video_projects:create"), async (req, res) => {
    const { id } = req.params;
    const auth = req.auth!;
    const userId = (auth as any).userId as number;
    const tenantId = (auth as any).tenantId as string;

    try {
      const userToken = createInternalTokenFromAuth({ userId, tenantId }, ["media:generate"]);
      const task = await mediaGenerationService.getTask(id, userToken, {
        userId,
        tenantId,
        source: "public_video_api",
      });

      if (task.status !== "completed" || !task.resultUrl) {
        sendApiError(res, 404, "not_found", "Export not ready");
        return;
      }

      const resultUrl = task.resultUrl;
      const downloadTarget = resolveExportDownloadTarget(resultUrl);
      if (!downloadTarget) {
        sendApiError(res, 404, "not_found", "Export file not available");
        return;
      }

      const ext = resultUrl.split(".").pop()?.toLowerCase() ?? "mp4";
      const mimeType = ext === "mp4" ? "video/mp4" : "application/octet-stream";

      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Disposition", `attachment; filename="video-${id}.${ext}"`);

      if (downloadTarget.kind === "file") {
        const fs = await import("node:fs");
        const stream = fs.createReadStream(downloadTarget.path);
        stream.on("error", (error) => {
          console.error("[PublicVideoApi] export file stream error", error);
          if (!res.headersSent) {
            sendApiError(res, 404, "not_found", "Export file not available");
          } else {
            res.destroy(error as Error);
          }
        });
        stream.pipe(res);
        return;
      }

      res.redirect(302, downloadTarget.url);
    } catch (err: any) {
      console.error("[PublicVideoApi] download error", err);
      if (!res.headersSent) {
        sendApiError(res, 500, "internal_error", "Internal server error");
      }
    }
  });

  return router;
}
