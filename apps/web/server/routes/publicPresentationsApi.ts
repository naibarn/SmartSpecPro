import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { requireScopes } from "../middleware/requireScopes";
import { sendApiError } from "../middleware/publicApiHeaders";
import { generateAIDraft } from "../services/aiPresentationService";
import {
  triggerPresentationExport,
  getPresentationExportStatus,
} from "../services/presentationPlaybackExport";
import {
  getPresentationDeckDetail,
  createPresentationDeckForLibraryItem,
} from "../services/presentationService";
import { createLibraryItem } from "../services/libraryService";
import { resolveAutoDraftParams } from "../services/autoDraftResolver";
import { deductCredits, getCreditBalance } from "../services/creditService";
import { incrementDailyCredits } from "../services/apiKeyRateLimiter";
import { getRedisClient } from "../services/redis";
import { createInternalTokenFromAuth } from "../_core/tokens";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const GenerateBodySchema = z.object({
  topic: z.string().min(3).max(1000),
  style: z.string().optional(),
  slide_count: z.number().int().min(1).max(30).default(5),
});

const ExportBodySchema = z.object({
  format: z.enum(["pptx", "pdf"]),
});

// ---------------------------------------------------------------------------
// Error mapping helper
// ---------------------------------------------------------------------------

function mapServiceError(err: any, res: any): boolean {
  const code = err?.code as string | undefined;
  if (code === "NOT_FOUND" || code === "PERMISSION_DENIED") {
    sendApiError(res, 404, "not_found", "Resource not found");
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createPresentationPublicRouter(): Router {
  const router = Router();

  // -------------------------------------------------------------------------
  // GET /v1/presentations/tasks/:taskId/progress  (MUST be before /decks/:id)
  // -------------------------------------------------------------------------
  router.get(
    "/tasks/:taskId/progress",
    requireScopes("presentations:create"),
    async (req, res) => {
      const { taskId } = req.params;
      const auth = req.auth!;
      const userId = (auth as any).userId as number;

      try {
        const redis = getRedisClient();
        const raw = await redis.get(`ai_draft_progress:${taskId}`);

        if (!raw) {
          sendApiError(res, 404, "not_found", "Task not found");
          return;
        }

        let progress: any;
        try {
          progress = JSON.parse(raw);
        } catch {
          sendApiError(res, 500, "internal_error", "Invalid progress data");
          return;
        }

        // SSE stream
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");

        const event = {
          stage: progress.phaseLabel ?? "processing",
          progress_pct: progress.totalSlides > 0
            ? Math.round((progress.slidesCompleted / progress.totalSlides) * 100)
            : 0,
          message: progress.phaseLabel ?? "Processing",
          completed: !!progress.completed,
          error: progress.error ?? null,
        };

        res.write(`data: ${JSON.stringify(event)}\n\n`);

        if (progress.completed) {
          res.write("data: [DONE]\n\n");
          res.end();
          return;
        }

        // Poll until complete (max 5 min)
        const timeout = setTimeout(() => {
          if (!res.writableEnded) {
            res.write("data: [DONE]\n\n");
            res.end();
          }
        }, 5 * 60 * 1000);

        // 30s heartbeat to keep the connection alive through proxies
        const heartbeat = setInterval(() => {
          if (!res.writableEnded) res.write(": heartbeat\n\n");
        }, 30_000);

        const interval = setInterval(async () => {
          try {
            const raw2 = await redis.get(`ai_draft_progress:${taskId}`);
            if (!raw2 || res.writableEnded) {
              clearInterval(interval);
              clearInterval(heartbeat);
              clearTimeout(timeout);
              if (!res.writableEnded) res.end();
              return;
            }
            const p2 = JSON.parse(raw2);
            const evt = {
              stage: p2.phaseLabel ?? "processing",
              progress_pct: p2.totalSlides > 0
                ? Math.round((p2.slidesCompleted / p2.totalSlides) * 100)
                : 0,
              message: p2.phaseLabel ?? "Processing",
              completed: !!p2.completed,
              error: p2.error ?? null,
            };
            res.write(`data: ${JSON.stringify(evt)}\n\n`);
            if (p2.completed) {
              res.write("data: [DONE]\n\n");
              res.end();
              clearInterval(interval);
              clearInterval(heartbeat);
              clearTimeout(timeout);
            }
          } catch {
            clearInterval(interval);
            clearInterval(heartbeat);
            clearTimeout(timeout);
          }
        }, 2000);

        req.on("close", () => {
          clearInterval(interval);
          clearInterval(heartbeat);
          clearTimeout(timeout);
        });
      } catch (err) {
        console.error("[PresentationsApi] progress error", err);
        if (!res.headersSent) {
          sendApiError(res, 500, "internal_error", "Internal server error");
        }
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/presentations/decks/:deckId/export/download  (BEFORE /decks/:deckId)
  // -------------------------------------------------------------------------
  router.get(
    "/decks/:deckId/export/download",
    requireScopes("presentations:create"),
    async (req, res) => {
      const deckId = parseInt(req.params.deckId, 10);
      const auth = req.auth!;
      const userId = (auth as any).userId as number;
      const tenantId = (auth as any).tenantId as string;

      if (isNaN(deckId)) {
        sendApiError(res, 400, "invalid_request", "Invalid deck ID");
        return;
      }

      try {
        const actor = { userId, tenantId };
        await getPresentationDeckDetail(deckId, actor as any);
      } catch (err: any) {
        if (mapServiceError(err, res)) return;
        sendApiError(res, 500, "internal_error", "Internal server error");
        return;
      }

      try {
        const userToken = createInternalTokenFromAuth({ userId }, [
          "media:generate",
          "presentation:export",
        ]);
        const status = await getPresentationExportStatus(
          String(deckId),
          { userId, tenantId } as any,
          userToken,
        );

        if (!status || (status as any).status !== "done") {
          sendApiError(res, 404, "not_found", "Export not ready");
          return;
        }

        const outputUrl = (status as any).outputUrl ?? (status as any).downloadUrl;
        const format = (status as any).format ?? "pptx";
        const mimeType =
          format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.presentationml.presentation";

        res.setHeader("Content-Type", mimeType);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="presentation-${deckId}.${format}"`,
        );

        if (outputUrl && (outputUrl.startsWith("/") || outputUrl.startsWith("."))) {
          // Local file
          const fs = await import("fs");
          const stream = fs.createReadStream(outputUrl);
          stream.pipe(res);
        } else if (outputUrl) {
          res.redirect(302, outputUrl);
        } else {
          sendApiError(res, 404, "not_found", "Export file not available");
        }
      } catch (err: any) {
        console.error("[PresentationsApi] download error", err);
        if (!res.headersSent) {
          sendApiError(res, 500, "internal_error", "Internal server error");
        }
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /v1/presentations/decks/:deckId/export
  // -------------------------------------------------------------------------
  router.post(
    "/decks/:deckId/export",
    requireScopes("presentations:create"),
    async (req, res) => {
      const deckId = parseInt(req.params.deckId, 10);
      const auth = req.auth!;
      const userId = (auth as any).userId as number;
      const tenantId = (auth as any).tenantId as string;

      if (isNaN(deckId)) {
        sendApiError(res, 400, "invalid_request", "Invalid deck ID");
        return;
      }

      const parsed = ExportBodySchema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(
          res,
          400,
          "invalid_request",
          parsed.error.issues.map((i) => i.message).join("; "),
        );
        return;
      }

      const { format } = parsed.data;
      const actor = { userId, tenantId };

      // Verify deck ownership
      try {
        await getPresentationDeckDetail(deckId, actor as any);
      } catch (err: any) {
        if (mapServiceError(err, res)) return;
        sendApiError(res, 500, "internal_error", "Internal server error");
        return;
      }

      try {
        const userToken = createInternalTokenFromAuth({ userId }, [
          "media:generate",
          "presentation:export",
        ]);
        const idempotencyKey = `${deckId}-${format}-${userId}`;
        const result = await triggerPresentationExport(
          { deckId, format, idempotencyKey } as any,
          actor as any,
          { userToken } as any,
        );

        res.json({
          export_id: (result as any).exportId,
          status: (result as any).status,
        });
      } catch (err: any) {
        console.error("[PresentationsApi] export error", err);
        if (!res.headersSent) {
          sendApiError(res, 500, "internal_error", "Internal server error");
        }
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/presentations/decks/:deckId
  // -------------------------------------------------------------------------
  router.get(
    "/decks/:deckId",
    requireScopes("presentations:create"),
    async (req, res) => {
      const deckId = parseInt(req.params.deckId, 10);
      const auth = req.auth!;
      const userId = (auth as any).userId as number;
      const tenantId = (auth as any).tenantId as string;

      if (isNaN(deckId)) {
        sendApiError(res, 400, "invalid_request", "Invalid deck ID");
        return;
      }

      try {
        const actor = { userId, tenantId };
        const detail = await getPresentationDeckDetail(deckId, actor as any);

        res.json({
          deck_id: detail.deck.id,
          title: detail.deck.title,
          slide_count: detail.slides.length,
          slides: detail.slides.map((s: any, i: number) => ({
            index: i,
            content: s.slideContent ?? {},
            notes: s.notes ?? "",
          })),
          created_at: detail.deck.createdAt?.toISOString() ?? null,
          updated_at: detail.deck.updatedAt?.toISOString() ?? null,
        });
      } catch (err: any) {
        if (mapServiceError(err, res)) return;
        console.error("[PresentationsApi] getDeck error", err);
        sendApiError(res, 500, "internal_error", "Internal server error");
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /v1/presentations/generate
  // -------------------------------------------------------------------------
  router.post(
    "/generate",
    requireScopes("presentations:create"),
    async (req, res) => {
      const parsed = GenerateBodySchema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(
          res,
          400,
          "invalid_request",
          parsed.error.issues.map((i) => i.message).join("; "),
        );
        return;
      }

      const { topic, style, slide_count } = parsed.data;
      const auth = req.auth!;
      const userId = (auth as any).userId as number;
      const tenantId = (auth as any).tenantId as string;
      const taskId = randomUUID();
      const actor = { userId, tenantId };

      try {
        // Resolve auto-draft params
        const draftParams = await resolveAutoDraftParams(topic, {
          userId,
          tenantId,
          traceId: taskId,
        } as any);

        // Create library item
        const { item } = await createLibraryItem(
          {
            itemType: "presentation",
            source: "auto_draft",
            title: topic.slice(0, 200),
          } as any,
          actor as any,
        );

        // Create presentation deck
        const { deck } = await createPresentationDeckForLibraryItem(
          { libraryItemId: item.id, title: topic.slice(0, 200) } as any,
          actor as any,
        );

        // Store initial progress in Redis
        const redis = getRedisClient();
        await redis.set(
          `ai_draft_progress:${taskId}`,
          JSON.stringify({
            phase: 0,
            phaseLabel: "Queued",
            slidesCompleted: 0,
            totalSlides: slide_count,
            completed: false,
            userId,
          }),
          "EX",
          300,
        );

        // Deduct credits
        await deductCredits({
          userId,
          amount: 5,
          sourceType: "api_presentation",
          description: `Presentation generation: ${topic.slice(0, 50)}`,
        } as any);
        res.setHeader("X-Credits-Used", "5");
        if (auth.mode === "api_key") {
          incrementDailyCredits(auth.apiKeyId ?? "", 5).catch(() => {});
        }
        let remaining = 0;
        try {
          const bal = await getCreditBalance(userId);
          remaining = bal?.credits ?? 0;
        } catch { /* non-fatal */ }
        res.setHeader("X-Credits-Remaining", String(remaining));

        // Generate internal token for Python backend calls
        const userToken = createInternalTokenFromAuth({ userId }, [
          "media:generate",
          "presentation:export",
        ]);

        // Fire-and-forget
        generateAIDraft(
          { deckId: deck.id, topic, style, slideCount: slide_count, ...draftParams } as any,
          actor as any,
          userToken,
          taskId,
        ).catch((err) => {
          console.error("[PresentationsApi] generateAIDraft background error", err);
        });

        res.json({ task_id: taskId, deck_id: deck.id, status: "pending" });
      } catch (err: any) {
        console.error("[PresentationsApi] generate error", err);
        if (!res.headersSent) {
          sendApiError(res, 500, "internal_error", "Internal server error");
        }
      }
    },
  );

  return router;
}
