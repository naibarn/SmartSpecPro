import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import multer from "multer";
import { z } from "zod";
import { createMarketplaceCaptureDraft, getMarketplaceCaptureForUser, getMarketplaceCandidateBatchForUser, saveMarketplaceCandidateBatch } from "../services/marketplaceCaptureService";
import { uploadMarketplaceCaptureAsset } from "../services/marketplaceAssetService";
import { analyzeMarketplaceCapture } from "../services/marketplaceExtractionService";
import { confirmMarketplaceCapture } from "../services/marketplaceProductService";
import { getMarketplaceCaptureConfig, isAllowedMarketplaceOrigin } from "../services/marketplaceCaptureConfig";
import { requireMarketplaceAuth } from "../services/marketplaceExtensionAuthService";

function sendError(res: Response, error: any) {
  const status = Number(error?.status || (error instanceof z.ZodError ? 400 : 500));
  const code = String(error?.code || (error instanceof z.ZodError ? "invalid_request" : "internal_error"));
  res.status(status).json({
    error: {
      code,
      message: error instanceof z.ZodError ? error.errors[0]?.message ?? "Invalid request" : String(error?.message ?? "Internal server error"),
      retryable: Boolean(error?.retryable),
      requestId: res.locals.requestId ?? undefined,
    },
  });
}

function marketplaceCors(req: Request, res: Response, next: NextFunction) {
  const origin = String(req.headers.origin ?? "");
  if (origin && isAllowedMarketplaceOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Requested-With");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Max-Age", "600");
  }
  if (req.method === "OPTIONS") {
    return res.sendStatus(origin && !isAllowedMarketplaceOrigin(origin) ? 403 : 204);
  }
  next();
}

export function registerMarketplaceCaptureRoutes(app: Express) {
  const router = express.Router();
  const config = getMarketplaceCaptureConfig();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: config.maxUploadBytes,
      files: 1,
      fields: 8,
    },
  });

  router.use(marketplaceCors);

  router.get("/health", (_req, res) => {
    res.json({ ok: true, enabled: getMarketplaceCaptureConfig().enabled });
  });

  router.post("/captures", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:capture");
      const result = await createMarketplaceCaptureDraft(req.body, auth);
      res.status(201).json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/captures/:captureId", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:read");
      res.json(await getMarketplaceCaptureForUser(req.params.captureId, auth));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/captures/:captureId/status", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:read");
      const { capture } = await getMarketplaceCaptureForUser(req.params.captureId, auth);
      res.json({
        captureId: capture.id,
        status: capture.status,
        errorMessage: capture.errorMessage,
        previewUrl: `/marketplace-capture/captures/${capture.id}/preview`,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  const handleUploadAsset = async (req: Request, res: Response) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:capture");
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) throw Object.assign(new Error("Missing file"), { status: 400, code: "asset_file_missing" });
      const metadata = req.body.metadata ? JSON.parse(String(req.body.metadata)) : {};
      const result = await uploadMarketplaceCaptureAsset({
        captureId: String(req.params.captureId),
        userId: auth.userId,
        tenantId: auth.tenantId,
        file,
        kind: String(req.body.kind || ""),
        section: String(req.body.section || "general"),
        sourceUrl: req.body.sourceUrl ? String(req.body.sourceUrl) : null,
        metadata,
      });
      res.status(201).json(result);
    } catch (error) {
      sendError(res, error);
    }
  };

  router.post("/captures/:captureId/assets", upload.single("file") as any, handleUploadAsset);
  router.post("/:captureId/assets", upload.single("file") as any, handleUploadAsset);

  const handleAnalyzeCapture = async (req: Request, res: Response) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:capture");
      res.json(await analyzeMarketplaceCapture(req.params.captureId, req.body, auth));
    } catch (error) {
      sendError(res, error);
    }
  };

  router.post("/captures/:captureId/analyze", handleAnalyzeCapture);
  router.post("/:captureId/analyze", handleAnalyzeCapture);

  router.post("/captures/:captureId/confirm", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:write");
      res.json(await confirmMarketplaceCapture(req.params.captureId, req.body, auth));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/category-candidates", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:capture");
      res.status(201).json(await saveMarketplaceCandidateBatch(req.body, auth));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/category-candidates/:batchId", async (req, res) => {
    try {
      const auth = await requireMarketplaceAuth(req, "marketplace:read");
      res.json(await getMarketplaceCandidateBatchForUser(req.params.batchId, auth));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.use("/api/marketplace-captures", router);
}
