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
import { registerMediaJobRoutes } from "../routers/mediaJobs";

import { createWebhookRouter } from "../routes/webhooks";
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
import { initializeTrashPurgeJob, shutdownTrashPurgeWorker } from "../jobs/purgeOldTrashItems";
import { initializeGDriveCleanupJob, shutdownGDriveCleanupWorker } from "../jobs/gdriveSessionCleanup";
import { initFromDb, startPeriodicPersistence } from "../services/providerHealth";
import { startHistoryCollection } from "../services/llmQueue";
import { createTasksRouter } from "../routes/tasks";
import { PostgresAdapter } from "../services/postgresAdapter";
import { getUploadStaticHeaders } from "../services/uploadContentSafety";
import { ImageProxySafetyError, proxyImageFromUrl } from "../services/imageProxySafety";
import { getDb } from "../db";
import { getRedisClient } from "../services/redis";
import { sql } from "drizzle-orm";
import { COOKIE_NAME } from "@shared/const";

/** Shared database adapter (implements @smartspec/db DbAdapter) */
export const dbAdapter = new PostgresAdapter();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable("x-powered-by");

// Sentry: expressIntegration() (registered in initSentry) handles request instrumentation automatically in v10+

// Correlation ID middleware — generates or propagates X-Request-ID
app.use(correlationIdMiddleware);

// Trust exactly one proxy hop (Nginx) — prevents X-Forwarded-For spoofing.
// "true" trusts ALL hops which allows IP spoofing to bypass rate limiters.
// "1" means Express uses only the last XFF entry (appended by Nginx). (M-14 fix)
app.set("trust proxy", 1);


// Trusted origin check (shared between CORS and CSRF middleware)
const ALLOWED_SUFFIXES = ['.smartspec.local', '.smartspec.pro', '.localhost', '.smartaihub.app'];
const ALLOWED_EXACT = ['tauri://localhost', 'http://tauri.localhost'];

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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' https:; font-src 'self' data: https://fonts.gstatic.com; worker-src 'self' blob:; frame-ancestors 'none';");
  next();
});

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
app.use(express.urlencoded({ limit: "10mb", extended: true }));
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
    req.originalUrl.startsWith("/api/webhooks/gdrive")
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

// Webhook routes (before CSRF-protected routes, Google Drive sends raw POSTs)
app.use("/api/webhooks", createWebhookRouter());

// Cloud Tasks handler routes (called by Cloud Tasks with OIDC auth)
app.use("/tasks", createTasksRouter());

// REST/SSE endpoints
registerLLMRoutes(app);
registerMCPRoutes(app);
registerMediaJobRoutes(app);

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

// Internal credit billing endpoint (Python backend -> Node.js)
app.post("/api/internal/credits/charge", async (req, res) => {
  // Authenticate via gateway token
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ") || !ENV.webGatewayToken) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  const token = authHeader.slice(7);
  if (token !== ENV.webGatewayToken) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    const { userId, amount, chunkCount, service, idempotencyKey, metadata } = req.body;
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

// Internal Google Drive cleanup endpoint (Python backend -> Node.js)
app.post("/api/internal/google-drive/cleanup", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ") || !ENV.webGatewayToken) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  const token = authHeader.slice(7);
  if (token !== ENV.webGatewayToken) {
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
const PY_BACKEND = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
app.all("/api/v1/*", async (req, res) => {
  const target = new URL(PY_BACKEND);
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

  // Initialize trash auto-purge job (daily at 2 AM)
  try {
    await initializeTrashPurgeJob();
  } catch (error) {
    console.error("[Startup] Failed to initialize trash purge job:", error);
  }

  // Initialize Google Drive edit session cleanup (every 6h)
  try {
    await initializeGDriveCleanupJob();
  } catch (error) {
    console.error("[Startup] Failed to initialize GDrive cleanup job:", error);
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
    console.log(`SmartSpec Web listening on http://0.0.0.0:${port}`);
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
  await shutdownTrashPurgeWorker().catch(() => {});
  await shutdownTelegramWorker().catch(() => {});

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
  await shutdownTrashPurgeWorker().catch(() => {});
  await shutdownTelegramWorker().catch(() => {});

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
