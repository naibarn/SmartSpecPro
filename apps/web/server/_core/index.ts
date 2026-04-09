import "dotenv/config";
import { initSentry, Sentry } from "../services/sentry";

// Initialize Sentry BEFORE Express app creation (captures startup errors)
initSentry();

import express from "express";
import { fileURLToPath } from "url";
import path from "path";
import { createServer, request as httpRequest } from "http";
import cookieParser from "cookie-parser";

import { createContext } from "./context";
import { appRouter } from "../routers";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { serveStatic, setupVite } from "./vite";
import { registerLLMRoutes } from "./llmRoutes";
import { registerMCPRoutes } from "./mcpRoutes";
import { registerMcpPublicRoutes } from "./mcpPublicServer";
import { registerMediaJobRoutes } from "../routers/mediaJobs";
import { registerFeedbackUploadRoutes } from "../routers/feedback";
import { registerAgencyStreamRoutes } from "./agencyStreamProxy";
import { registerLiveBrowserStreamRoutes } from "./liveBrowserStreamProxy";
import { registerWorkerRuntimeRoutes } from "../routes/workerRuntime";
import { registerWorkflowNodeTypesRoute } from "../routes/workflowNodeTypes";
import { registerWorkflowWorkerRuntimeRoutes } from "../routes/workflowWorkerRuntime";
import { registerDesktopHostRoutes } from "../routes/desktopHost";
import { registerContentAutomationRoutes } from "../routers/contentAutomationRoutes";
import { registerContentManifestImportRoutes } from "../routers/contentManifestImport";
import { registerAutoDraftToolRoute } from "../routers/autoDraftTool";
import { registerModelSuggestToolRoute } from "../routers/modelSuggestTool";
import { registerFileParseToolRoute } from "../routers/fileParseTool";
import { registerScheduleDraftToolRoute } from "../routers/scheduleDraftTool";
import { registerSkillDiscoveryToolRoute } from "../routers/skillDiscoveryTool";
import { registerInternalSocialToolRoute } from "../routes/internalSocialTool";
import { registerInternalSocialActionsRoute } from "../routes/internalSocialActions";
import { registerInternalMetricsRoute } from "../routes/internalMetrics";

import { createWebhookRouter } from "../routes/webhooks";
import { createWebhookTriggerRouter } from "../routes/webhookTrigger";
import { createTelegramWebhookRouter } from "../routes/telegramWebhook";
import { createChannelWebhookRouter } from "../routes/channelWebhook";
import { createBeamWebhookRouter } from "../routes/beamWebhook";
import { createBeamPaymentMethodSetupRouter } from "../routes/beamPaymentMethodSetup";
import {
  compareCachedInternalToken,
  getAppRuntimeConfig,
  refreshAppRuntimeConfigCache,
} from "../services/appRuntimeConfig";
import { processBeamWebhookEvent } from "../services/billing/paymentProcessing";
import { createVoiceSessionRouter, handleVoiceUpgrade, shutdownVoiceGateway } from "../routes/voiceGateway";
import { createWidgetInitRouter, handleWidgetUpgrade } from "../routes/widgetGateway";
import browserPolicyRouter from "../routes/browserPolicy";
import browserToolRouter from "../routes/browserTool";
import "../services/telegramLinkService"; // Register /start link handler
import "../services/channelAdapters/telegram"; // Register Telegram adapter
import "../services/channelAdapters/whatsapp"; // Register WhatsApp adapter
import "../services/channelAdapters/line"; // Register LINE adapter
import "../services/channelAdapters/slack"; // Register Slack adapter
import "../services/channelAdapters/discord"; // Register Discord adapter
import { adapterRegistry } from "../services/channelAdapters/registry";
import { createSlideRenderRouter } from "../routes/slideRender";
import { createGuardianSSERouter } from "../routes/guardianSSE";
import agencyStreamRouter from "../routes/agencyStream";
import orchestratorStreamRouter from "../routes/orchestratorStream";
import notificationStreamRouter from "../routes/notificationStream";
import contentComposerStreamRouter from "../routes/contentComposerStream";
import internalOrchestratorRouter from "../routes/internalOrchestrator";
import { registerDeviceAuthRoutes } from "./deviceAuthRoutes";
import { registerServicesRoutes } from "../routers/services";
import { registerTenantRoutes } from "../routers/tenant";
import { registerBlogRoutes } from "../routers/blog";
import { registerAdminTenantsRoutes } from "../routers/adminTenants";
import { tenantMiddleware } from "./tenant";
import { ENV } from "./env";
import { debugError } from "./logger";
import { sdk } from "./sdk";
import { signBearerToken } from "./tokens";
import { getUploadsDir, storageStreamFile } from "../storage";
import { initializeSkillRegistry } from "../services/skillRegistry";
import { initAuditLogger, auditLogger } from "../services/auditLogger";
import { auditMiddleware } from "../middleware/auditMiddleware";
import { correlationIdMiddleware } from "../middleware/correlationId";
// BullMQ scheduler/queue init removed — migrated to Cloud Tasks (Section 05)
import { initializeTelegramQueue, shutdownTelegramWorker } from "../services/telegramService";
import { initDeliveryQueue, closeDeliveryQueue } from "../services/deliveryQueue";
import { initWebhookDispatchQueue, closeWebhookDispatchQueue } from "../services/webhookDispatchQueue";
import { initializeTrashPurgeJob, shutdownTrashPurgeWorker } from "../jobs/purgeOldTrashItems";
import { initializeGDriveCleanupJob, shutdownGDriveCleanupWorker } from "../jobs/gdriveSessionCleanup";
import { initializeUploadPostCleanupJob, shutdownUploadPostCleanupWorker } from "../jobs/uploadPostCleanup";
import { initializePendingApprovalAlertJob } from "../jobs/pendingApprovalAlert";
import { initializeNotificationJobs } from "../jobs/notificationJobs";
import { initializeBillingJobs, shutdownBillingJobs } from "../jobs/billingJobs";
import { initializeMemoryMaintenanceJobs, shutdownMemoryMaintenanceJobs } from "../jobs/memoryMaintenanceJobs";
import { initializeContentRefreshJob } from "../jobs/contentRefreshJob";
import { initializeInactiveUserJob } from "../jobs/inactiveUserJob";
import {
  initializeSkillMaintenanceScheduleJob,
  shutdownSkillMaintenanceScheduleJob,
} from "../jobs/skillMaintenanceSchedule";
import { initFromDb, startPeriodicPersistence } from "../services/providerHealth";
import { startHistoryCollection } from "../services/llmQueue";
import { recoverActiveRunsOnStartup } from "../services/runEngine";
import { createTasksRouter } from "../routes/tasks";
import { presentationImportCallbackHandler } from "../routes/presentationImportCallback";
import { PostgresAdapter } from "../services/postgresAdapter";
import { getUploadStaticHeaders } from "../services/uploadContentSafety";
import { ImageProxySafetyError, proxyImageFromUrl } from "../services/imageProxySafety";
import { getDb } from "../db";
import { getRedisClient } from "../services/redis";
import { sql, eq, and } from "drizzle-orm";
import crypto from "crypto";
import { channelGateway } from "../services/channelGateway";
import { channelConnections, creditSourceTypeEnum } from "../../drizzle/schema";
import type { ChatIngressEvent } from "@shared/channelTypes";
import { COOKIE_NAME } from "@shared/const";
import { createPublicSkillsRouter } from "../routes/publicSkillsApi";
import { createPublicAgencyRouter } from "../routes/publicAgencyApi";
import { createPresentationPublicRouter } from "../routes/publicPresentationsApi";
import { createPublicVideoRouter } from "../routes/publicVideoApi";
import { createPublicMediaRouter } from "../routes/publicMediaApi";
import { createPublicJobsRouter } from "../routes/publicJobsApi";
import { createPublicKnowledgeRouter } from "../routes/publicKnowledgeApi";
import { initAutomationJobsQueue, closeAutomationJobsQueue } from "../services/jobAutomationService";
import { createPublicWebhooksRouter } from "../routes/publicWebhooksApi";
import { createPublicEventsRouter } from "../routes/publicEventsApi";
import { initWebhookApiDeliveryQueue, closeWebhookApiDeliveryQueue } from "../services/webhookDeliveryService";
import { closeEmbeddingQueue } from "../services/embeddingQueue";
import { registerPublicDocsRoutes } from "../routes/publicDocsApi";
import { registerPublicSitemapRoutes } from "../routers/publicSitemap";
import { createAgencyToolsApiRouter } from "../routes/agencyToolsApi";
import { apiKeyAuthMiddleware } from "../middleware/apiKeyAuth";
import { assertHmacSecretConfigured } from "../services/apiKeyService";
import { publicApiAuditMiddleware } from "../middleware/publicApiAudit";
import { publicApiCorsMiddleware } from "../middleware/publicApiCors";
import { publicApiFeatureGuard } from "../middleware/publicApiFeatureGuard";
import { publicApiHeadersMiddleware } from "../middleware/publicApiHeaders";
import { rateLimitMiddleware } from "../services/apiKeyRateLimiter";
import { idempotencyMiddleware } from "../middleware/idempotencyMiddleware";
import { quotaMiddleware } from "../middleware/quotaMiddleware";

/** Shared database adapter (implements @smartspec/db DbAdapter) */
export const dbAdapter = new PostgresAdapter();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable("x-powered-by");
void refreshAppRuntimeConfigCache().catch(() => {});

// Sentry: expressIntegration() (registered in initSentry) handles request instrumentation automatically in v10+

// Correlation ID middleware — generates or propagates X-Request-ID
app.use(correlationIdMiddleware);

// Trust exactly one proxy hop (Nginx) — prevents X-Forwarded-For spoofing.
// "true" trusts ALL hops which allows IP spoofing to bypass rate limiters.
// "1" means Express uses only the last XFF entry (appended by Nginx). (M-14 fix)
app.set("trust proxy", 1);


// Trusted origin check (shared between CORS and CSRF middleware)
const ALLOWED_SUFFIXES = [
  '.smartaihub.app',
  '.smartspec.pro',
  ...(process.env.NODE_ENV !== 'production' ? ['.smartspec.local', '.localhost'] : []),
];
const ALLOWED_EXACT = ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost'];

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  let originHost = '';
  try { originHost = new URL(origin).hostname; } catch { return false; }
  return (
    ALLOWED_EXACT.includes(origin) ||
    originHost === 'localhost' ||
    // Allow IP addresses only in non-production (development/testing)
    (process.env.NODE_ENV !== 'production' && /^(\d{1,3}\.){3}\d{1,3}$/.test(originHost)) ||
    ALLOWED_SUFFIXES.some(suffix => originHost === suffix.slice(1) || originHost.endsWith(suffix))
  );
}

// CORS for cross-domain access (Docker Status, etc.)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin!);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-private-vault-token');
  }

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

// Baseline security headers (lightweight; no external deps)
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=()");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://static.cloudflareinsights.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' https:; font-src 'self' data: https://fonts.gstatic.com; worker-src 'self' blob:; frame-ancestors 'none';");
  next();
});

// Beam payment webhook ingress must run before the global JSON parser so
// request-local verify can capture the original body bytes for HMAC verification.
app.use("/api/payments", createBeamWebhookRouter({ processEvent: processBeamWebhookEvent }));
app.use("/api/payments", createBeamPaymentMethodSetupRouter());

// Default JSON body limit — 10MB covers all normal API requests.
// Upload routes use raw body or multipart, not JSON, so they're unaffected.
// Media/storage uploads bypass this via Nginx streaming (proxy_request_buffering off).
app.use(express.json({ limit: "10mb" }));
app.use((err: any, req: any, res: any, next: any) => {
  // Catch JSON parse errors (SyntaxError from body-parser)
  if (err instanceof SyntaxError && 'body' in err) {
    debugError("JSON Parse", `Failed to parse JSON body for ${req.url}`, err);
    return res.status(400).json({ error: { message: "Invalid JSON in request body" } });
  }
  next(err);
});
app.use(express.urlencoded({ limit: "100mb", extended: true }));
app.use(cookieParser(ENV.cookieSecret));

// ============================================================================
// HEALTH CHECK ENDPOINTS (before auth/audit middleware for Cloud Run probes)
// ============================================================================

/**
 * GET /healthz - Liveness/startup probe
 * Returns 200 if the process is alive and accepting requests
 * No dependency checks - purely "is the server running?"
 */
app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/virtual-admin/health", async (_req, res) => {
  try {
    const { getGuardianHealthFull } = await import("../services/virtualAdmin/guardianScheduler");
    const health = await getGuardianHealthFull();
    res.json(health);
  } catch {
    res.json({ running: false, error: "Guardian not initialized" });
  }
});

/**
 * GET /readyz - Readiness probe
 * Performs shallow checks of DB and Redis connections
 * Returns 200 if ready to serve traffic, 503 if not ready
 */
app.get("/readyz", async (_req, res) => {
  const checks: Record<string, string> = {};
  let allHealthy = true;

  // Check database connection (2 second timeout)
  try {
    const db = await getDb();
    if (!db) {
      checks.db = "unavailable";
      allHealthy = false;
    } else {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 2000)
      );
      const queryPromise = db.execute(sql`SELECT 1`);
      await Promise.race([queryPromise, timeoutPromise]);
      checks.db = "ok";
    }
  } catch (error: any) {
    checks.db = error?.message === "timeout" ? "timeout" : "error";
    allHealthy = false;
  }

  // Check Redis connection (1 second timeout - aligns with Cloud Run probe timeout)
  try {
    const redis = getRedisClient();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), 1000)
    );
    const pingPromise = redis.ping();
    await Promise.race([pingPromise, timeoutPromise]);
    checks.redis = "ok";
  } catch (error: any) {
    checks.redis = error?.message === "timeout" ? "timeout" : "error";
    allHealthy = false;
  }

  if (allHealthy) {
    res.json({ status: "ready", checks });
  } else {
    res.status(503).json({ status: "not_ready", checks });
  }
});

// Audit trace context — generates traceId for every request
initAuditLogger();
app.use(auditMiddleware());

// Sentry user context — set user_id tag after auth is resolved (v10 isolation scope)
app.use((req: any, _res: any, next: any) => {
  if (req.user?.id) {
    Sentry.getIsolationScope().setTag("user_id", String(req.user.id));
    Sentry.getIsolationScope().setUser({ id: String(req.user.id) });
  }
  next();
});

// Multi-tenant middleware - identifies tenant from domain
app.use(tenantMiddleware);

// CSRF protection: verify Origin header on state-changing requests
// Registered BEFORE route handlers so it protects both /trpc and /api/* REST endpoints
const csrfCheck = (req: any, res: any, next: any) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();

  // Allow provider webhooks to pass through even when they include third-party Origin.
  // These are server-to-server callbacks and are validated by provider-specific logic.
  if (
    req.path === "/v1/media/callback/kie-ai" ||
    req.originalUrl === "/api/v1/media/callback/kie-ai" ||
    req.path.startsWith("/webhooks/gdrive") ||
    req.originalUrl.startsWith("/api/webhooks/gdrive") ||
    req.path.startsWith("/webhooks/telegram/") ||
    req.originalUrl.startsWith("/webhooks/telegram/") ||
    // Inbound webhook triggers (external services sending events into SmartSpecPro)
    // req.path includes the /api prefix at app-middleware level, so check originalUrl only.
    req.originalUrl.startsWith("/api/webhooks/trigger/") ||
    // Generalized channel webhooks (platform callbacks: WhatsApp, Slack, Discord, etc.)
    /^\/webhooks\/[a-z]+\/[a-z0-9-]+$/.test(req.path) ||
    /^\/webhooks\/[a-z]+\/[a-z0-9-]+$/.test(req.originalUrl)
  ) {
    return next();
  }

  const origin = req.headers.origin;

  // Requests with no Origin header: allow if using Bearer token (server-to-server),
  // reject if using cookie auth (browser CSRF risk in production)
  if (!origin) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ") && authHeader.length > 7) {
      return next();
    }
    // In production, cookie-authenticated POST without Origin is a CSRF risk.
    // In development, allow for easier testing (curl, Postman).
    if (process.env.NODE_ENV === "production" && req.cookies?.[COOKIE_NAME]) {
      res.status(403).json({ error: { message: "Forbidden: missing Origin header" } });
      return;
    }
    return next();
  }

  if (!isAllowedOrigin(origin)) {
    res.status(403).json({ error: { message: "Forbidden: invalid origin" } });
    return;
  }

  next();
};

app.use("/trpc", csrfCheck);
app.use("/api", csrfCheck);

// Always mount local static handler — harmless when S3/R2 is active (no local files to serve)
const uploadsDir = getUploadsDir();
app.use('/uploads', express.static(uploadsDir, {
  maxAge: '1d',
  etag: true,
  setHeaders: (res, filePath) => {
    const extraHeaders = getUploadStaticHeaders(filePath);
    for (const [key, value] of Object.entries(extraHeaders)) {
      res.setHeader(key, value);
    }
  },
}));

// Storage proxy: streams files from R2/S3 through the Node.js server.
// This avoids broken R2 public URLs (SSL issues) and presigned URL expiration.
// Supports HTTP Range requests for video seeking.
app.get("/api/storage/files/*", async (req, res) => {
  try {
    const key = decodeURIComponent((req.params as any)[0] || "");
    if (!key || key.includes("..")) {
      res.status(400).json({ error: "Invalid storage key" });
      return;
    }

    const range = req.headers.range;
    const result = await storageStreamFile(key, range);
    if (!result) {
      res.status(404).json({ error: "File not found or storage not configured" });
      return;
    }

    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (result.isPartial && result.rangeStart !== undefined && result.rangeEnd !== undefined) {
      res.status(206);
      const total = result.totalLength ?? "*";
      res.setHeader("Content-Range", `bytes ${result.rangeStart}-${result.rangeEnd}/${total}`);
      if (result.contentLength) res.setHeader("Content-Length", result.contentLength);
    } else {
      if (result.contentLength) res.setHeader("Content-Length", result.contentLength);
    }

    const nodeStream = result.stream as NodeJS.ReadableStream;
    if (typeof (nodeStream as any).pipe === "function") {
      (nodeStream as any).pipe(res);
    } else {
      const reader = (result.stream as ReadableStream).getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) { res.end(); break; }
        res.write(value);
      }
    }
  } catch (error: any) {
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    debugError("StorageProxy", "Failed to stream file", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to stream file" });
    }
  }
});

// Internal slide render route — localhost-only, JWT-gated, for Playwright screenshots
app.use("/internal", createSlideRenderRouter());

// Webhook routes (before CSRF-protected routes, external services send raw POSTs)
app.use("/api/webhooks", createWebhookRouter());

// Inbound webhook trigger endpoints (external services → SmartSpecPro conversations/agencies/workflows)
// Must be before CSRF middleware — these are server-to-server requests with their own auth
app.use("/api/webhooks/trigger", express.json({ limit: "1mb" }), createWebhookTriggerRouter());

// Generalized channel webhook router (all adapters: WhatsApp, Slack, Discord, LINE, etc.)
// Must be registered BEFORE the legacy Telegram route so /webhooks/:channelType/:connectionId
// is handled by the generalized router.
// The verify callback captures the raw body buffer so adapters can perform HMAC verification.
app.use(
  "/webhooks",
  express.json({
    limit: "1mb",
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }),
  createChannelWebhookRouter(),
);

// Telegram Bot API webhook (legacy route — kept for backward compat with existing bot webhook URLs)
// Tighter body limit than global 10MB — Telegram updates are small JSON payloads
app.use("/webhooks/telegram", express.json({ limit: "1mb" }), createTelegramWebhookRouter());

// Voice gateway: session token + consent endpoints
app.use("/api/voice", createVoiceSessionRouter());

// Widget gateway: init token endpoint
app.use("/api/widget", express.json({ limit: "100kb" }), createWidgetInitRouter());

app.use(express.json({ limit: "1mb" }), browserPolicyRouter);
app.use(browserToolRouter);

// Cloud Tasks handler routes (called by Cloud Tasks with OIDC auth)
// Mounted at /_internal/tasks to avoid conflict with the frontend /tasks SPA route
app.use("/_internal/tasks", createTasksRouter());

// Public API v1 — API key authenticated routes
// All /v1/* routes share: CORS, request ID headers, API key auth, feature guard
app.use(
  "/v1",
  publicApiCorsMiddleware,
  publicApiHeadersMiddleware,
  apiKeyAuthMiddleware,
  publicApiFeatureGuard,
  rateLimitMiddleware(),
  quotaMiddleware(),
  idempotencyMiddleware(),
  publicApiAuditMiddleware,
);
app.use("/v1/skills", createPublicSkillsRouter());
app.use("/v1/agencies", createPublicAgencyRouter());
app.use("/v1/presentations", createPresentationPublicRouter());
app.use("/v1/video-projects", createPublicVideoRouter());
app.use("/v1/media", createPublicMediaRouter());
app.use("/v1/jobs", createPublicJobsRouter());
app.use("/v1/knowledge", createPublicKnowledgeRouter());
app.use("/v1/webhooks", createPublicWebhooksRouter());
app.use("/v1/events", createPublicEventsRouter());
app.use("/v1/agency-tools", createAgencyToolsApiRouter());

// Public API documentation (unauthenticated)
registerPublicSitemapRoutes(app);
registerPublicDocsRoutes(app);

// REST/SSE endpoints
registerLLMRoutes(app);
registerMCPRoutes(app);
registerMcpPublicRoutes(app);
registerMediaJobRoutes(app);
registerFeedbackUploadRoutes(app);
registerAgencyStreamRoutes(app);
registerLiveBrowserStreamRoutes(app);
registerWorkerRuntimeRoutes(app);
registerDesktopHostRoutes(app);
registerWorkflowNodeTypesRoute(app);
registerWorkflowWorkerRuntimeRoutes(app);
registerContentAutomationRoutes(app);
registerContentManifestImportRoutes(app);
registerAutoDraftToolRoute(app);
registerModelSuggestToolRoute(app);
registerFileParseToolRoute(app);
registerScheduleDraftToolRoute(app);
registerSkillDiscoveryToolRoute(app);
registerInternalSocialToolRoute(app);
registerInternalSocialActionsRoute(app);
registerInternalMetricsRoute(app);
app.use("/api/virtual-admin/events", createGuardianSSERouter());
app.use(agencyStreamRouter);
app.use(orchestratorStreamRouter);
app.use(notificationStreamRouter);
app.use(contentComposerStreamRouter);
app.use(internalOrchestratorRouter);

// Proxy remote images through same-origin endpoint so browser canvas operations
// (split/crop preview) work even when source host doesn't expose CORS headers.
app.get("/api/media/image-proxy", async (req, res) => {
  const raw = typeof req.query.url === "string" ? req.query.url.trim() : "";
  try {
    const proxied = await proxyImageFromUrl(raw);
    res.setHeader("Content-Type", proxied.contentType);
    res.setHeader("Cache-Control", "public, max-age=300");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.status(200).send(proxied.bytes);
  } catch (error) {
    if (error instanceof ImageProxySafetyError) {
      return res.status(error.status).json({ error: error.message });
    }

    debugError("ImageProxy", `Failed to proxy ${raw}`, error);
    return res.status(502).json({ error: "Failed to fetch source image" });
  }
});

// Valid credit source types — must match creditSourceTypeEnum in schema.ts
const VALID_SOURCE_TYPES = new Set(creditSourceTypeEnum.enumValues);

// Helper: timing-safe Bearer token validation for internal endpoints
function verifyInternalBearerToken(authHeader: string): boolean {
  if (!authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  return compareCachedInternalToken(token);
}

// Helper: derive sourceType from service tag when not explicitly provided
function deriveSourceTypeFromService(service: string): string {
  if (service.startsWith("library.") || service.startsWith("gdrive.index")) return "indexing";
  if (service.startsWith("rag.")) return "rag";
  if (service.startsWith("gdrive.mcp")) return "indexing";
  return "other";
}

// Internal credit billing endpoint (Python backend -> Node.js)
app.post("/api/internal/credits/charge", async (req, res) => {
  // Authenticate via gateway token (timing-safe)
  if (!verifyInternalBearerToken(req.headers.authorization || "")) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    const { userId, amount, chunkCount, service, idempotencyKey, metadata, sourceType } = req.body;
    if (typeof userId !== "number" || !Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ success: false, error: "userId must be a positive number" });
    }
    if (typeof service !== "string" || !service) {
      return res.status(400).json({ success: false, error: "service is required" });
    }
    if (amount != null && (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0)) {
      return res.status(400).json({ success: false, error: "amount must be a positive number" });
    }
    if (chunkCount != null && (typeof chunkCount !== "number" || !Number.isFinite(chunkCount) || chunkCount < 0)) {
      return res.status(400).json({ success: false, error: "chunkCount must be a non-negative number" });
    }

    const { chargeForIndexing, chargeForRagQuery, deductCredits } = await import("../services/creditService");
    type IndexingService = import("../services/creditService").IndexingService;

    if (chunkCount != null) {
      const result = await chargeForIndexing({
        userId,
        chunkCount,
        service: service as IndexingService,
        idempotencyKey,
        metadata,
      });
      return res.json({ success: true, ...result });
    }

    if (amount != null) {
      const result = await deductCredits({
        userId,
        amount,
        description: `Service charge (${service})`,
        idempotencyKey,
        sourceType: (VALID_SOURCE_TYPES.has(sourceType) ? sourceType : null) || deriveSourceTypeFromService(service),
        metadata: { ...metadata, service },
      });
      return res.json({ success: true, creditsUsed: result.creditsUsed, transactionId: result.transactionId });
    }

    return res.status(400).json({ success: false, error: "Either amount or chunkCount is required" });
  } catch (err: any) {
    const status = err.message?.includes("Insufficient credits") ? 402 : 500;
    return res.status(status).json({ success: false, error: err.message });
  }
});

// Internal agency multiplier markup endpoint (Python backend -> Node.js)
app.post("/api/internal/credits/agency-markup", async (req, res) => {
  if (!verifyInternalBearerToken(req.headers.authorization || "")) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    const { userId, agencyId, markupAmount, sourceType } = req.body;

    if (typeof userId !== "number" || !Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ success: false, error: "userId must be a positive number" });
    }
    if (typeof agencyId !== "string" || !agencyId) {
      return res.status(400).json({ success: false, error: "agencyId is required" });
    }
    if (typeof markupAmount !== "number" || !Number.isFinite(markupAmount) || markupAmount <= 0) {
      return res.status(400).json({ success: false, error: "markupAmount must be a positive number" });
    }

    const { deductCredits } = await import("../services/creditService");

    const result = await deductCredits({
      userId,
      amount: markupAmount,
      description: `Agency multiplier markup for agency ${agencyId}`,
      sourceType: "agency",
      metadata: {
        agencyId,
        markupAmount,
        sourceType: sourceType ?? "agency",
        service: "agency.multiplier_markup",
      },
    });

    return res.json({
      success: true,
      markupCharged: markupAmount,
      creditsUsed: result.creditsUsed,
      transactionId: result.transactionId,
    });
  } catch (err: any) {
    const status = err.message?.includes("Insufficient credits") ? 402 : 500;
    return res.status(status).json({ success: false, error: err.message });
  }
});

// Internal creator fee settlement endpoint (Python backend -> Node.js)
app.post("/api/internal/credits/creator-fee-settle", async (req, res) => {
  if (!verifyInternalBearerToken(req.headers.authorization || "")) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    const { runId, agencyId, userId, creatorId, creatorFeeCredits, platformSharePct, tenantId } = req.body;

    if (typeof runId !== "string" || !runId) {
      return res.status(400).json({ success: false, error: "runId is required" });
    }
    if (typeof agencyId !== "string" || !agencyId) {
      return res.status(400).json({ success: false, error: "agencyId is required" });
    }
    if (typeof userId !== "number" || !Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ success: false, error: "userId must be a positive number" });
    }
    if (typeof creatorId !== "number" || !Number.isFinite(creatorId) || creatorId <= 0) {
      return res.status(400).json({ success: false, error: "creatorId must be a positive number" });
    }
    if (typeof creatorFeeCredits !== "number" || !Number.isFinite(creatorFeeCredits) || creatorFeeCredits < 0) {
      return res.status(400).json({ success: false, error: "creatorFeeCredits must be a non-negative number" });
    }
    if (typeof platformSharePct !== "number" || !Number.isFinite(platformSharePct) || platformSharePct < 0 || platformSharePct > 100) {
      return res.status(400).json({ success: false, error: "platformSharePct must be between 0 and 100" });
    }
    if (typeof tenantId !== "string" || !tenantId) {
      return res.status(400).json({ success: false, error: "tenantId is required" });
    }

    const { settleCreatorFee } = await import("../services/creatorRevenueService");

    const result = await settleCreatorFee({
      runId,
      entityType: "agency",
      entityId: agencyId,
      runnerId: userId,
      creatorId,
      tenantId,
      totalFee: creatorFeeCredits,
      platformSharePct,
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Internal Google Drive cleanup endpoint (Python backend -> Node.js)
app.post("/api/internal/google-drive/cleanup", async (req, res) => {
  if (!verifyInternalBearerToken(req.headers.authorization || "")) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    const { userId, tenantId } = req.body;
    if (typeof userId !== "number" || !Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ success: false, error: "userId must be a positive number" });
    }
    if (typeof tenantId !== "string" || !tenantId) {
      return res.status(400).json({ success: false, error: "tenantId is required" });
    }

    const { removeGoogleDriveData } = await import("../services/libraryService");
    const { googleDriveEditSessions, googleDriveSyncState } = await import("../../drizzle/schema");
    const { eq, and } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ success: false, error: "Database not available" });
    }

    // Delete edit sessions for this user
    await db.delete(googleDriveEditSessions).where(eq(googleDriveEditSessions.userId, userId));

    // Delete sync state for this user + tenant
    await db.delete(googleDriveSyncState).where(
      and(
        eq(googleDriveSyncState.userId, userId),
        eq(googleDriveSyncState.tenantId, tenantId),
      ),
    );

    // Remove library items + cascaded chunks/links
    const result = await removeGoogleDriveData(userId, tenantId);

    return res.json({
      status: "ok",
      itemsDeleted: result.itemsDeleted,
      chunksDeleted: result.chunksDeleted,
      linksDeleted: result.linksDeleted,
    });
  } catch (err: any) {
    debugError("GDriveCleanup", "Internal cleanup failed", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Internal admin broadcast notification (Python backend -> Node.js)
// Creates notifications for all admin users from Python monitoring alerts
const adminBroadcastRateLimit = (() => {
  const window: number[] = [];
  const MAX_RPM = 20;
  return (): boolean => {
    const now = Date.now();
    // Remove entries older than 60s
    while (window.length > 0 && window[0]! < now - 60_000) window.shift();
    if (window.length >= MAX_RPM) return false;
    window.push(now);
    return true;
  };
})();

app.post("/api/internal/notifications/admin-broadcast", async (req, res) => {
  if (!verifyInternalBearerToken(req.headers.authorization || "")) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  // Rate limit: max 20 requests per minute
  if (!adminBroadcastRateLimit()) {
    return res.status(429).json({ success: false, error: "Rate limit exceeded (max 20/min)" });
  }

  try {
    // Validate metadata with Zod schema to prevent arbitrary content injection
    const { z } = await import("zod");
    const metadataSchema = z.object({
      eventId: z.string().max(100).optional(),
      source: z.string().max(200).optional(),
      errorDetails: z.object({
        errorCode: z.string().max(50).optional(),
        errorMessage: z.string().max(500).optional(),
      }).optional(),
      metrics: z.object({
        durationMs: z.number().optional(),
        costUsd: z.number().optional(),
        itemCount: z.number().optional(),
      }).optional(),
      retryInfo: z.object({
        retryCount: z.number().optional(),
        maxRetries: z.number().optional(),
        nextRetryAt: z.string().max(50).optional(),
      }).optional(),
      relatedItems: z.record(z.string().max(200)).optional(),
    }).strict().optional();

    const broadcastBodySchema = z.object({
      type: z.enum(["scheduled_message", "follow_request", "alert", "system", "direct_message", "urgent_message"]).default("alert"),
      title: z.string().min(1).max(255),
      content: z.string().max(2000).default(""),
      priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
      relatedResourceType: z.enum(["media_job", "workflow", "skill", "feedback", "agency", "approval", "team_run", "room", "user", "conversation", "scheduled_message", "system_health", "security", "incident"]).optional(),
      actionUrl: z.string().max(2000).optional(),
      actionLabel: z.string().max(100).optional(),
      groupKey: z.string().max(200).optional(),
      metadata: metadataSchema,
    });

    const bodyResult = broadcastBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid request body",
        details: bodyResult.error.issues.map((i) => i.message),
      });
    }

    const { type, title, content, priority, relatedResourceType, actionUrl, actionLabel, groupKey, metadata } = bodyResult.data;

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ success: false, error: "Database not available" });
    }

    const { users } = await import("../../drizzle/schema");
    const { eq, inArray } = await import("drizzle-orm");

    // Get all admin users
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.role, ["admin", "domain_admin"]));

    if (admins.length === 0) {
      return res.json({ success: true, notified: 0 });
    }

    const { createNotification } = await import("../services/notificationService");
    let notified = 0;

    for (const admin of admins) {
      try {
        await createNotification({
          db,
          userId: admin.id,
          type: type || "alert",
          title: title.slice(0, 255),
          content: (content || "").slice(0, 2000),
          priority: priority || "normal",
          relatedResourceType: relatedResourceType || undefined,
          actionUrl: actionUrl || undefined,
          actionLabel: actionLabel || undefined,
          metadata: metadata || undefined,
          groupKey: typeof groupKey === "string" ? groupKey.slice(0, 200) : undefined,
        });
        notified++;
      } catch (err) {
        debugError("AdminBroadcast", `Failed for admin ${admin.id}`, err);
      }
    }

    const { recordBroadcastRequest } = await import("../services/notificationHealthChecks");
    recordBroadcastRequest(true);
    return res.json({ success: true, notified });
  } catch (err: any) {
    debugError("AdminBroadcast", "Internal broadcast failed", err);
    const { recordBroadcastRequest } = await import("../services/notificationHealthChecks");
    recordBroadcastRequest(false);
    return res.status(500).json({ success: false, error: "Internal broadcast failed" });
  }
});

// Internal presentation import callback (Python backend -> Node.js)
app.post("/api/internal/presentation-import/callback", presentationImportCallbackHandler);

// Internal agency creation endpoint (Python AI Creator task -> Node.js)
// Auth: X-Internal-Token + X-User-Id (service-to-service), or Bearer JWT (legacy)
// ── Internal: Resolve best LLM model from capability requirements ──────────
app.get("/api/internal/models/resolve", async (req, res) => {
  const internalToken = req.headers["x-internal-token"] as string | undefined;
  if (!compareCachedInternalToken(internalToken)) {
    return res.status(401).json({ error: "Invalid token" });
  }

  try {
    const requirementsParam = req.query.requirements as string;
    if (!requirementsParam) {
      return res.status(400).json({ error: "requirements query param required" });
    }
    const requirements = JSON.parse(requirementsParam);
    const { loadEnabledLlmModelRows } = await import("../services/enabledLlmModels");
    const { selectBestLlmModel } = await import("../services/intelligentModelSelector");
    const rows = await loadEnabledLlmModelRows();
    const modelId = selectBestLlmModel(requirements, rows);
    if (!modelId) {
      return res.json({ modelId: null, error: "No matching model found" });
    }
    const matched = rows.find((r) => r.modelId === modelId);
    return res.json({
      modelId,
      modelName: matched?.providerModelId ?? modelId,
      provider: matched?.providerName ?? "unknown",
    });
  } catch (e: any) {
    return res.status(400).json({ error: e.message?.slice(0, 200) ?? "Invalid request" });
  }
});

app.post("/api/internal/agency/create", async (req, res) => {
  let user: Awaited<ReturnType<typeof sdk.authenticateRequest>> | null = null;

  // Primary: X-Internal-Token auth (service-to-service from Python/Celery)
  const internalToken = req.headers["x-internal-token"] as string | undefined;
  if (compareCachedInternalToken(internalToken)) {
    const userIdHeader = req.headers["x-user-id"] as string | undefined;
    const userId = userIdHeader ? parseInt(userIdHeader, 10) : 0;
    if (userId > 0) {
      // Create a minimal user-like object for the downstream code
      user = { id: userId, currentTenantId: null, __internalAuth: true } as any;
    }
  }

  // Fallback: Bearer JWT auth (legacy path)
  if (!user) {
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        req.headers.cookie = `app_session_id=${token}`;
        try {
          user = await sdk.authenticateRequest(req);
        } catch { /* still unauthorized */ }
      }
    }
  }
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  // Validate request body schema
  const { z } = await import("zod");
  const agencyCreateSchema = z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional().default(""),
    objective: z.string().max(2000).optional(),
    sharedInstructions: z.string().max(10000).optional(),
    tenantId: z.string().max(100).optional().default(""),
    agents: z.array(z.object({
      id: z.string(),
      name: z.string().min(1).max(200),
      description: z.string().max(2000).optional().default(""),
      instructions: z.string().max(10000).optional().default(""),
      model: z.string().max(100).optional().default("gpt-4o"),
      nodeType: z.string().max(50).optional().default("agent"),
      nodeConfig: z.record(z.unknown()).optional().default({}),
      isEntryPoint: z.boolean().optional().default(false),
      isOptional: z.boolean().optional().default(false),
      position: z.object({ x: z.number(), y: z.number() }).optional(),
      toolIds: z.array(z.string().max(100)).optional().default([]),
      toolConfigs: z.record(z.record(z.unknown())).optional().default({}),
      modelRequirements: z.object({
        strategy: z.enum(["cheapest", "balanced", "best"]).optional(),
        supportsVision: z.boolean().optional(),
        supportsThinking: z.boolean().optional(),
        supportsFunctionTools: z.boolean().optional(),
        supportsStructuredOutputs: z.boolean().optional(),
        supportsJsonMode: z.boolean().optional(),
        supportsStrictToolSchema: z.boolean().optional(),
        supportsWebSearch: z.boolean().optional(),
        supportsCodeExecution: z.boolean().optional(),
        supportsComputerUse: z.boolean().optional(),
      }).optional(),
    })).min(1).max(20),
    communicationFlows: z.array(z.object({
      id: z.string().optional(),
      fromAgentId: z.string(),
      toAgentId: z.string(),
      flowType: z.string().max(50).optional().default("delegation"),
    })).optional().default([]),
  });

  const bodyParse = agencyCreateSchema.safeParse(req.body);
  if (!bodyParse.success) {
    return res.status(400).json({ error: "Invalid request body", details: bodyParse.error.issues.map(i => i.message).join(", ") });
  }
  const validatedBody = bodyParse.data;

  try {
    const {
      agencies: agenciesTable,
      agencyAgents,
      agencyCommunicationFlows,
      agencyAgentTools,
    } = await import("../../drizzle/schema");
    const drizzleDb = await getDb();
    if (!drizzleDb) return res.status(503).json({ error: "Database unavailable" });
    const tenantReq = req as any;
    // Prefer explicit tenantId from request body (passed by Celery task from the user's tRPC context),
    // then fall back to tenant middleware, then user's currentTenantId
    const tenantId: string = validatedBody.tenantId || tenantReq.tenant?.id || String(user.currentTenantId ?? "");
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID is required" });
    }

    // Verify user belongs to the specified tenant (prevents cross-tenant agency creation via internal token)
    if (tenantId && (user as any).__internalAuth) {
      const { sql } = await import("drizzle-orm");
      const rawResult = await drizzleDb.execute(
        sql`SELECT "currentTenantId"::text FROM users WHERE id = ${user.id} LIMIT 1`
      );
      const dbTenantId = (rawResult as any).rows?.[0]?.currentTenantId ?? (rawResult as any)?.[0]?.currentTenantId ?? null;
      if (!dbTenantId || String(dbTenantId) !== String(tenantId)) {
        return res.status(403).json({ error: "User does not belong to the specified tenant" });
      }
    }

    const { name, description, objective, sharedInstructions, agents, communicationFlows } = validatedBody;

    if (!name?.trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    if (!agents.length) {
      return res.status(400).json({ error: "at least 1 agent is required" });
    }

    const agencyId = crypto.randomUUID();
    // Map spec-level agent IDs → new DB UUIDs
    const specIdToDbId: Record<string, string> = {};
    const agentRows = agents.map((a, idx) => {
      const dbId = crypto.randomUUID();
      specIdToDbId[a.id] = dbId;
      return {
        id: dbId,
        agencyId,
        name: String(a.name || "Agent").slice(0, 100),
        description: a.description ? String(a.description).slice(0, 500) : null,
        instructions: a.instructions ? String(a.instructions).slice(0, 50000) : null,
        model: a.model ? String(a.model).slice(0, 100) : null,
        nodeType: (a.nodeType ?? "agent") as any,
        nodeConfig: (a.nodeConfig ?? {}) as any,
        modelRequirements: a.modelRequirements,
        isEntryPoint: Boolean(a.isEntryPoint),
        isOptional: Boolean(a.isOptional),
        position: a.position ?? { x: 400, y: 80 + idx * 200 },
      };
    });

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 100) || `agency-${Date.now()}`;

    await drizzleDb.transaction(async (tx) => {
      await tx.insert(agenciesTable).values({
        id: agencyId,
        tenantId,
        slug,
        name: String(name).slice(0, 255),
        description: description ? String(description).slice(0, 500) : null,
        objective: objective ? objective.slice(0, 2000) : null,
        sharedInstructions: sharedInstructions ? sharedInstructions.slice(0, 10000) : null,
        creditMultiplier: "1",
        maxAgents: 20,
        maxRunTimeSeconds: 600,
        isFallbackSafe: false,
        creatorFeeCredits: 0,
        status: "draft",
        createdBy: user!.id,
      });

      if (agentRows.length > 0) {
        await tx.insert(agencyAgents).values(agentRows);
      }

      const flowRows = communicationFlows
        .map((f) => ({
          id: crypto.randomUUID(),
          agencyId,
          fromAgentId: specIdToDbId[f.fromAgentId] ?? null,
          toAgentId: specIdToDbId[f.toAgentId] ?? null,
          flowType: (f.flowType ?? "delegation") as any,
        }))
        .filter((f) => f.fromAgentId && f.toAgentId);

      if (flowRows.length > 0) {
        await tx.insert(agencyCommunicationFlows).values(flowRows);
      }

      // Insert tool assignments for agents
      const toolRows: Array<{
        id: string;
        agentId: string;
        toolId: string;
        toolConfig: any;
      }> = [];
      for (const agent of agents) {
        const dbAgentId = specIdToDbId[agent.id];
        if (!dbAgentId || !agent.toolIds?.length) continue;
        for (const toolId of agent.toolIds) {
          if (!toolId || typeof toolId !== "string") continue;
          toolRows.push({
            id: crypto.randomUUID(),
            agentId: dbAgentId,
            toolId: String(toolId).slice(0, 100),
            toolConfig: agent.toolConfigs?.[toolId] ?? {},
          });
        }
      }
      if (toolRows.length > 0) {
        await tx.insert(agencyAgentTools).values(toolRows);
      }
    });

    return res.status(201).json({ id: agencyId });
  } catch (err: any) {
    debugError("internal_agency_create", "Agency creation failed", { message: String(err?.message ?? "").slice(0, 200) });
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Device auth routes (for desktop app)
registerDeviceAuthRoutes(app);

// Services management routes (admin)
registerServicesRoutes(app);

// Tenant routes
registerTenantRoutes(app);

// Admin tenant management routes
registerAdminTenantsRoutes(app);

// Blog routes
registerBlogRoutes(app);

// Reverse proxy: forward unhandled /api/v1/ requests to Python backend.
// Express routes registered above (e.g. /api/v1/llm/...) are matched first.
// This catches remaining /api/v1/ paths (media, generation, etc.) so they work
// even when requests bypass nginx and hit Express/Vite directly.
// Auth: validates session cookie → generates short-lived JWT for Python.
app.all("/api/v1/*", async (req, res) => {
  const runtime = await getAppRuntimeConfig();
  const target = new URL(runtime.pythonBackendUrl);
  const headers: Record<string, string> = {};
  for (const key of ["content-type", "accept"]) {
    const val = req.headers[key];
    if (typeof val === "string") headers[key] = val;
  }

  // Forward correlation ID for cross-service tracing
  if (req.requestId) {
    headers["x-request-id"] = req.requestId;
  }

  // If the request already has a Bearer token, forward it as-is.
  // Otherwise, authenticate via session cookie and generate a JWT.
  const existingAuth = req.headers.authorization;
  if (existingAuth && typeof existingAuth === "string") {
    headers["authorization"] = existingAuth;
  } else {
    try {
      const user = await sdk.authenticateRequest(req);
      const token = signBearerToken({
        sub: String(user.id),
        type: "access",
        scopes: ["media:generate"],
      }, "15m");
      headers["authorization"] = `Bearer ${token}`;
    } catch {
      // No valid session — forward without auth (Python will return 401)
    }
  }

  const proxyReq = httpRequest(
    {
      hostname: target.hostname,
      port: target.port,
      path: req.originalUrl,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      const resHeaders: Record<string, string | string[]> = {};
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        if (v && !["transfer-encoding", "connection"].includes(k)) {
          resHeaders[k] = v;
        }
      }
      res.writeHead(proxyRes.statusCode || 502, resHeaders);
      proxyRes.pipe(res, { end: true });
    },
  );

  proxyReq.on("error", () => {
    if (!res.headersSent) {
      res.status(502).json({ error: "Python backend unavailable" });
    }
  });

  // Forward body for POST/PUT/PATCH (already parsed by express.json)
  if (req.body && ["POST", "PUT", "PATCH"].includes(req.method)) {
    const body = JSON.stringify(req.body);
    proxyReq.setHeader("content-length", Buffer.byteLength(body).toString());
    proxyReq.write(body);
  }

  proxyReq.end();
});

app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError: ({ error, path }) => {
      debugError("tRPC", `${path}: ${error.message}`, error);
    },
  })
);

// Sentry error handler — captures exceptions before the global error handler (v10 API)
Sentry.setupExpressErrorHandler(app);

// Global error handler - must be last
app.use((err: any, req: any, res: any, next: any) => {
  debugError("Express", "Unhandled error", err);
  if (!res.headersSent) {
    res.status(500).json({ error: { message: "Internal server error" } });
  }
});

// Store server reference for graceful shutdown
let httpServer: ReturnType<typeof createServer> | null = null;

async function main() {
  // ── Pre-flight validation ────────────────────────────────────────────
  // Fail fast on critical issues to prevent silent crash loops.
  const preflightErrors: string[] = [];

  if (!ENV.databaseUrl) preflightErrors.push("DATABASE_URL not set");
  if (!ENV.jwtSecret) preflightErrors.push("JWT_SECRET not set");

  // Database connectivity check (5s timeout)
  try {
    const db = await getDb();
    if (!db) {
      preflightErrors.push("Database connection pool unavailable");
    } else {
      await Promise.race([
        db.execute(sql`SELECT 1`),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
      ]);
    }
  } catch (err: any) {
    preflightErrors.push(`Database check failed: ${err.message}`);
  }

  // Redis connectivity check (3s timeout)
  try {
    const redis = getRedisClient();
    await Promise.race([
      redis.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);
  } catch (err: any) {
    preflightErrors.push(`Redis check failed: ${err.message}`);
  }

  if (preflightErrors.length > 0) {
    console.error("[Startup] FATAL: Pre-flight checks failed:");
    preflightErrors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log("[Startup] Pre-flight checks passed (DB + Redis OK)");
  // ── End pre-flight ───────────────────────────────────────────────────

  const server = createServer(app);
  httpServer = server;

  // WebSocket upgrade routing
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (url.pathname === "/api/voice/stream") {
      handleVoiceUpgrade(req, socket as any, head);
    } else if (url.pathname === "/widget/v1/ws") {
      handleWidgetUpgrade(req, socket as any, head);
    }
  });

  // Initialize skill registry - auto-sync skills from folder to database
  try {
    await initializeSkillRegistry();
  } catch (error) {
    console.error("[Startup] Failed to initialize skill registry:", error);
  }

  // Scheduled messages now use Cloud Tasks (no BullMQ worker needed)
  // History collection for in-memory queue stats (rate limiters, etc.)
  try {
    startHistoryCollection();
  } catch (error) {
    console.error("[Startup] Failed to start history collection:", error);
  }

  // Initialize Telegram notification queue
  try {
    const db = await getDb();
    if (db) {
      await initializeTelegramQueue(db, {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379"),
        password: process.env.REDIS_PASSWORD,
      });
    }
  } catch (error) {
    console.error("[Startup] Failed to initialize Telegram queue:", error);
  }

  // Initialize Chat Bridge delivery queue (BullMQ)
  try {
    await initDeliveryQueue();
  } catch (error) {
    console.error("[Startup] Failed to initialize delivery queue:", error);
  }

  // Initialize Webhook Dispatch queue (BullMQ — retry-safe agency/chat/workflow dispatch)
  try {
    await initWebhookDispatchQueue();
  } catch (error) {
    console.error("[Startup] Failed to initialize webhook dispatch queue:", error);
  }

  // Assert HMAC secret is configured for public API key authentication
  assertHmacSecretConfigured();

  // Initialize Automation Jobs queue (BullMQ — public API job execution)
  try {
    await initAutomationJobsQueue();
  } catch (error) {
    console.error("[Startup] Failed to initialize automation jobs queue:", error);
  }

  // Initialize Webhook API Delivery queue (BullMQ — outbound delivery to external webhook endpoints)
  try {
    await initWebhookApiDeliveryQueue();
  } catch (error) {
    console.error("[Startup] Failed to initialize webhook API delivery queue:", error);
  }

  // Initialize channel adapters (call optional initialize() hook on each)
  try {
    await Promise.all(
      adapterRegistry.getAll()
        .filter((a) => typeof a.initialize === "function")
        .map((a) => a.initialize!()),
    );
  } catch (error) {
    console.error("[Startup] Failed to initialize channel adapters:", error);
  }

  // Wire Discord Gateway ingest callback so inbound Gateway events reach channelGateway.
  // Discord uses WebSocket (not HTTP webhooks) so the adapter self-routes via this callback.
  const discordAdapter = adapterRegistry.get("discord");
  if (discordAdapter && "setIngestCallback" in discordAdapter) {
    (discordAdapter as { setIngestCallback: Function }).setIngestCallback(
      async (guildId: string, externalChannelId: string, text: string) => {
        try {
          const dbConn = await getDb();
          if (!dbConn) return;

          const [connection] = await dbConn
            .select()
            .from(channelConnections)
            .where(
              and(
                eq(channelConnections.channelType, "discord"),
                eq(channelConnections.externalUserId, guildId),
                eq(channelConnections.status, "active"),
              ),
            )
            .limit(1);

          if (!connection || !connection.activeChannelId) return;

          const event: ChatIngressEvent = {
            eventId: crypto.randomUUID(),
            eventType: "user_message",
            tenantId: connection.tenantId,
            userId: connection.userId,
            conversationId: connection.activeChannelId,
            conversationType: "chat",
            channel: {
              type: "discord" as ChatIngressEvent["channel"]["type"],
              connectionId: connection.id,
              externalChatId: externalChannelId,
            },
            message: { text, attachments: [] },
            idempotencyKey: `discord_${guildId}_${externalChannelId}_${Date.now()}`,
          };

          await channelGateway.ingest(event);
        } catch (err) {
          auditLogger.log({
            eventType: "channel_webhook_ingest_error" as any,
            metadata: { channelType: "discord", guildId, error: String(err) },
          });
        }
      },
    );
  }

  // Initialize provider health circuit breaker from DB state
  try {
    await initFromDb();
    startPeriodicPersistence();
  } catch (error) {
    console.error("[Startup] Failed to initialize provider health:", error);
  }

  // LLM queues migrated to in-process + Cloud Tasks (no BullMQ workers needed)
  try {
    console.log("[Startup] LLM queue processing: in-process (credits/usage), Cloud Tasks (skills)");
  } catch (error) {
    console.error("[Startup] Queue info log failed:", error);
  }

  // Rehydrate any in-flight team runs that were active before a process restart.
  try {
    await recoverActiveRunsOnStartup();
  } catch (error) {
    console.error("[Startup] Failed to recover active team runs:", error);
  }

  // Initialize trash auto-purge job (daily at 2 AM)
  try {
    await initializeTrashPurgeJob();
  } catch (error) {
    console.error("[Startup] Failed to initialize trash purge job:", error);
  }

  // Initialize pending approval daily alert (9 AM)
  try {
    await initializePendingApprovalAlertJob();
  } catch (error) {
    console.error("[Startup] Failed to initialize approval alert job:", error);
  }

  // Initialize notification jobs (escalation, future: digest, retention)
  try {
    await initializeNotificationJobs();
  } catch (error) {
    console.error("[Startup] Failed to initialize notification jobs:", error);
  }

  try {
    await initializeBillingJobs();
  } catch (error) {
    console.error("[Startup] Failed to initialize billing jobs:", error);
  }

  // Initialize chat memory maintenance jobs (daily/weekly recurring cleanup)
  try {
    await initializeMemoryMaintenanceJobs();
  } catch (error) {
    console.error("[Startup] Failed to initialize memory maintenance jobs:", error);
  }

  // Initialize Google Drive edit session cleanup (every 6h)
  try {
    await initializeGDriveCleanupJob();
  } catch (error) {
    console.error("[Startup] Failed to initialize GDrive cleanup job:", error);
  }

  // Initialize Upload-Post retention cleanup (every 6h)
  try {
    await initializeUploadPostCleanupJob();
  } catch (error) {
    console.error("[Startup] Failed to initialize Upload-Post cleanup job:", error);
  }

  // Initialize content staleness checker (every 6h) — Spec 038
  try {
    await initializeContentRefreshJob();
  } catch (error) {
    console.error("[Startup] Failed to initialize content refresh job:", error);
  }

  // Initialize inactive user checker (every 24h) — Invite code system
  try {
    await initializeInactiveUserJob();
  } catch (error) {
    console.error("[Startup] Failed to initialize inactive user job:", error);
  }

  // Initialize skill maintenance scheduler (every 15m)
  try {
    await initializeSkillMaintenanceScheduleJob();
  } catch (error) {
    console.error("[Startup] Failed to initialize skill maintenance scheduler:", error);
  }

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Prefer PORT, else pick a free one
  const preferred = parseInt(process.env.PORT || "3000");
  const port = Number.isFinite(preferred) ? preferred : 3000;

  // Server-level timeouts to prevent hung requests and slow attacks
  server.timeout = 120_000;          // 2 min — max time for any request
  server.headersTimeout = 30_000;    // 30s — max time to receive headers
  server.keepAliveTimeout = 65_000;  // 65s — must be > Nginx keepalive_timeout (60s)
  server.requestTimeout = 120_000;   // 2 min — same as timeout, explicit

  server.listen(port, '0.0.0.0', () => {
    console.log(`SmartAIHub Web listening on http://0.0.0.0:${port}`);

    // Start background scheduler to resolve pending media images
    import("../services/aiPresentationService").then(({ startPendingMediaScheduler }) => {
      startPendingMediaScheduler();
    }).catch((err) => {
      console.error("[Startup] Failed to start pending media scheduler:", err);
    });

    // Start queue health monitor
    import("../services/queueHealthMonitor").then(({ startQueueHealthMonitor }) => {
      startQueueHealthMonitor();
    }).catch((err) => {
      console.error("[Startup] Failed to start queue health monitor:", err);
    });

    import("../services/opsAnomalyMonitor").then(({ startOpsAnomalyMonitor }) => {
      startOpsAnomalyMonitor();
    }).catch((err) => {
      console.error("[Startup] Failed to start ops anomaly monitor:", err);
    });

    // Start System Guardian (Virtual Admin Agent)
    import("../services/virtualAdmin/guardianScheduler").then(({ startGuardian }) => {
      startGuardian();
    }).catch((err) => {
      console.error("[Startup] Failed to start System Guardian:", err);
    });
  });
}

// Suppress EPIPE on stdout/stderr to prevent crash loops when pipe is broken
process.stdout?.on?.("error", () => {});
process.stderr?.on?.("error", () => {});

// Handle uncaught errors — ignore EPIPE (broken pipe) to prevent crash loops
process.on("uncaughtException", (err) => {
  if ((err as any)?.code === "EPIPE" || String(err).includes("EPIPE")) return;
  debugError("Process", "Uncaught Exception", err);
});

process.on("unhandledRejection", (reason, promise) => {
  if ((reason as any)?.code === "EPIPE" || String(reason).includes("EPIPE")) return;
  debugError("Process", "Unhandled Rejection", reason);
});

// Graceful shutdown: stop accepting new connections, flush logs, close queues and connections
process.on("SIGTERM", async () => {
  console.log("[Shutdown] SIGTERM received, starting graceful shutdown...");

  // 0. Stop background schedulers
  import("../services/aiPresentationService").then(({ stopPendingMediaScheduler }) => {
    stopPendingMediaScheduler();
  }).catch(() => {});
  import("../services/queueHealthMonitor").then(({ stopQueueHealthMonitor }) => {
    stopQueueHealthMonitor();
  }).catch(() => {});
  import("../services/opsAnomalyMonitor").then(({ stopOpsAnomalyMonitor }) => {
    stopOpsAnomalyMonitor();
  }).catch(() => {});
  import("../services/virtualAdmin/guardianScheduler").then(({ stopGuardian }) => {
    stopGuardian();
  }).catch(() => {});

  // 1. Stop accepting new connections
  if (httpServer) {
    httpServer.close(() => {
      console.log("[Shutdown] HTTP server closed");
    });
  }

  // 2. Flush audit logs
  await auditLogger.shutdown().catch(() => {});

  // 3. Shut down background workers
  await shutdownGDriveCleanupWorker().catch(() => {});
  await shutdownUploadPostCleanupWorker().catch(() => {});
  await shutdownTrashPurgeWorker().catch(() => {});
  await shutdownBillingJobs().catch(() => {});
  await shutdownTelegramWorker().catch(() => {});
  await closeDeliveryQueue().catch(() => {});
  await closeWebhookDispatchQueue().catch(() => {});
  await closeAutomationJobsQueue().catch(() => {});
  await closeWebhookApiDeliveryQueue().catch(() => {});
  await shutdownMemoryMaintenanceJobs().catch(() => {});
  await shutdownSkillMaintenanceScheduleJob().catch(() => {});
  await closeEmbeddingQueue().catch(() => {});
  await shutdownVoiceGateway().catch(() => {});

  // 3b. Shut down channel adapters
  await Promise.all(
    adapterRegistry.getAll()
      .filter((a) => typeof a.shutdown === "function")
      .map((a) => a.shutdown!().catch(() => {})),
  );

  // 4. Flush PostHog event batch
  try {
    const { shutdownPostHog } = await import("../services/posthog");
    await shutdownPostHog();
    console.log("[Shutdown] PostHog events flushed");
  } catch (e) {
    console.warn("[Shutdown] PostHog flush failed:", e);
  }

  // 5. Flush Sentry events
  await Sentry.close(2000).catch(() => {});

  // 6. Close Redis connections
  try {
    const redis = getRedisClient();
    await redis.quit();
    console.log("[Shutdown] Redis connection closed");
  } catch {}

  // 7. Close DB connection pool
  // postgres.js automatically closes connections on process exit
  // TODO: If we switch to pg-pool, add pool.end() here

  console.log("[Shutdown] Graceful shutdown complete");
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[Shutdown] SIGINT received, starting graceful shutdown...");

  // Same shutdown sequence as SIGTERM
  if (httpServer) {
    httpServer.close(() => {
      console.log("[Shutdown] HTTP server closed");
    });
  }

  await auditLogger.shutdown().catch(() => {});
  await shutdownGDriveCleanupWorker().catch(() => {});
  await shutdownUploadPostCleanupWorker().catch(() => {});
  await shutdownTrashPurgeWorker().catch(() => {});
  await shutdownBillingJobs().catch(() => {});
  await shutdownTelegramWorker().catch(() => {});
  await closeDeliveryQueue().catch(() => {});
  await closeWebhookDispatchQueue().catch(() => {});
  await closeAutomationJobsQueue().catch(() => {});
  await closeWebhookApiDeliveryQueue().catch(() => {});
  await shutdownMemoryMaintenanceJobs().catch(() => {});
  await shutdownSkillMaintenanceScheduleJob().catch(() => {});
  await closeEmbeddingQueue().catch(() => {});
  await shutdownVoiceGateway().catch(() => {});
  await Promise.all(
    adapterRegistry.getAll()
      .filter((a) => typeof a.shutdown === "function")
      .map((a) => a.shutdown!().catch(() => {})),
  );

  try {
    const redis = getRedisClient();
    await redis.quit();
    console.log("[Shutdown] Redis connection closed");
  } catch {}

  console.log("[Shutdown] Graceful shutdown complete");
  process.exit(0);
});

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
