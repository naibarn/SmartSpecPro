import type { Express, Request, Response, NextFunction } from "express";
import { createContext } from "../_core/context";
import { resolvePersonalMiniAppPreview } from "../services/personalMiniAppPreview";
import { resolveMiniAppForViewer } from "../services/appIdentityRepository";
import {
  buildMiniAppRuntimeDocument,
  createMiniAppRuntimeStorageToken,
  parseMiniAppRuntimeEntries,
  readMiniAppRuntimeValue,
  resolveMiniAppRuntimeStorageScope,
  verifyMiniAppRuntimeReadyMarker,
  writeMiniAppRuntimeValue,
} from "../services/miniAppRuntime";

const APP_ID_PATTERN = /^app_[A-Za-z0-9_-]{1,120}$/;

export function isMiniAppRuntimeStoragePath(path: string): boolean {
  return /^\/_miniapp-runtime\/app_[A-Za-z0-9_-]{1,120}\/storage$/.test(path);
}

export function applyMiniAppRuntimeStorageCors(req: Request, res: Response, next: NextFunction): void {
  if (!isMiniAppRuntimeStoragePath(req.path) || req.headers.origin !== "null") {
    next();
    return;
  }
  res.setHeader("Access-Control-Allow-Origin", "null");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
}

function sendUnavailable(res: Response): void {
  res.status(404).type("text/plain").send("Mini App unavailable");
}

async function serveRuntimeDocument(req: Request, res: Response, appId: string, requestedVersion?: string): Promise<void> {
  if (!APP_ID_PATTERN.test(appId)) {
    sendUnavailable(res);
    return;
  }
  try {
    const context = await createContext({ req, res });
    const userId = Number(context.user?.id);
    const tenantId = context.tenantId;
    if (!context.user || !tenantId || !Number.isSafeInteger(userId) || userId <= 0) {
      sendUnavailable(res);
      return;
    }
    const scope = { appId, tenantId, userId };
    const marker = req.cookies?.miniapp_runtime_ready;
    if (typeof marker !== "string" || !verifyMiniAppRuntimeReadyMarker(marker, scope)) {
      res.redirect(302, `/miniapp/${appId}/status`);
      return;
    }

    const preview = await resolvePersonalMiniAppPreview(scope);
    if (!preview?.app || preview.app.visibility !== "private" || preview.app.ownerUserId !== userId) {
      sendUnavailable(res);
      return;
    }
    if (!preview.html || !preview.artifactDigest || !preview.app.lastKnownGoodArtifactRef) {
      res.redirect(302, `/miniapp/${appId}/status`);
      return;
    }
    if (requestedVersion && (!/^\d{1,10}$/.test(requestedVersion) || Number(requestedVersion) !== preview.app.deploymentVersion)) {
      sendUnavailable(res);
      return;
    }
    if (!context.publicUrl) {
      res.status(503).type("text/plain").send("Mini App runtime is temporarily unavailable");
      return;
    }
    const document = buildMiniAppRuntimeDocument({
      html: preview.html,
      appId,
      statusUrl: `/miniapp/${appId}/status`,
      storageToken: createMiniAppRuntimeStorageToken(scope),
      storageApiOrigin: context.publicUrl,
    });
    res.status(200)
      .set({
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": document.contentSecurityPolicy,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "DENY",
      })
      .send(document.html);
  } catch (error) {
    console.warn("[MiniAppRuntime] document delivery failed", {
      appId,
      code: error instanceof Error ? error.message.slice(0, 100) : "MINI_APP_RUNTIME_DELIVERY_FAILED",
    });
    res.status(503).type("text/plain").send("Mini App runtime is temporarily unavailable");
  }
}

export function registerMiniAppRuntimeRoutes(app: Express): void {
  app.post("/_miniapp-runtime/:appId/storage", async (req, res) => {
    const appId = String(req.params.appId ?? "");
    const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "")?.[1] ?? "";
    const scope = APP_ID_PATTERN.test(appId) ? resolveMiniAppRuntimeStorageScope(token, appId) : null;
    if (!scope) {
      res.status(401).json({ error: "MINI_APP_RUNTIME_UNAUTHORIZED" });
      return;
    }
    const owner = await resolveMiniAppForViewer(scope);
    if (!owner || owner.visibility !== "private" || owner.ownerUserId !== scope.userId || owner.tenantId !== scope.tenantId) {
      res.status(401).json({ error: "MINI_APP_RUNTIME_UNAUTHORIZED" });
      return;
    }
    const body = req.body as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      (body.action !== "GET" && body.action !== "SET") || typeof body.key !== "string") {
      res.status(400).json({ error: "MINI_APP_RUNTIME_REQUEST_INVALID" });
      return;
    }
    try {
      if (body.action === "GET") {
        res.json({ value: await readMiniAppRuntimeValue(scope, body.key) });
        return;
      }
      const [entry] = parseMiniAppRuntimeEntries([{ key: body.key, value: body.value }]);
      await writeMiniAppRuntimeValue(scope, entry!);
      res.json({ value: true });
    } catch (error) {
      const code = error instanceof Error ? error.message : "MINI_APP_RUNTIME_STORAGE_FAILED";
      const status = code.startsWith("MINI_APP_RUNTIME_KEY") || code.startsWith("MINI_APP_RUNTIME_VALUE")
        ? 400
        : 503;
      res.status(status).json({ error: status === 400 ? code : "MINI_APP_RUNTIME_STORAGE_UNAVAILABLE" });
    }
  });

  app.get("/miniapp/:appId", async (req, res, next) => {
    if (typeof req.cookies?.miniapp_runtime_ready !== "string") return next();
    const appId = String(req.params.appId ?? "");
    await serveRuntimeDocument(req, res, appId);
  });

  app.get("/miniapp/:appId/preview/:version", async (req, res) => {
    await serveRuntimeDocument(req, res, String(req.params.appId ?? ""), String(req.params.version ?? ""));
  });
}
