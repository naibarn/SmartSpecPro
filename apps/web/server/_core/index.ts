import "dotenv/config";
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
import { getUploadsDir, useLocalStorage } from "../storage";
import { initializeSkillRegistry } from "../services/skillRegistry";
import { initAuditLogger, auditLogger } from "../services/auditLogger";
import { auditMiddleware } from "../middleware/auditMiddleware";
import { initializeScheduler } from "../services/scheduler";
import { initializeTelegramQueue, shutdownTelegramWorker } from "../services/telegramService";
import { initFromDb, startPeriodicPersistence } from "../services/providerHealth";
import { initializeQueues } from "../services/llmQueue";
import { PostgresAdapter } from "../services/postgresAdapter";
import { getUploadStaticHeaders } from "../services/uploadContentSafety";
import { ImageProxySafetyError, proxyImageFromUrl } from "../services/imageProxySafety";
import { getDb } from "../db";

/** Shared database adapter (implements @smartspec/db DbAdapter) */
export const dbAdapter = new PostgresAdapter();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable("x-powered-by");

// Trust proxy headers (X-Forwarded-Proto, X-Forwarded-For) from nginx
// This is required for secure cookies to work behind HTTPS proxy
app.set("trust proxy", true);


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
    /^(\d{1,3}\.){3}\d{1,3}$/.test(originHost) ||
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

// JSON body parser — limit to 10MB to prevent DoS
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

// Audit trace context — generates traceId for every request
initAuditLogger();
app.use(auditMiddleware());

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
    req.originalUrl === "/api/v1/media/callback/kie-ai"
  ) {
    return next();
  }

  const origin = req.headers.origin;
  // Allow requests with no Origin header (same-origin, server-to-server, curl)
  if (!origin) return next();

  if (!isAllowedOrigin(origin)) {
    res.status(403).json({ error: { message: "Forbidden: invalid origin" } });
    return;
  }

  next();
};

app.use("/trpc", csrfCheck);
app.use("/api", csrfCheck);

// Serve uploaded files AFTER tenant middleware for access control
if (useLocalStorage()) {
  const uploadsDir = getUploadsDir();
  console.log(`[Storage] Using local storage at: ${uploadsDir}`);
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
}

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

// Global error handler - must be last
app.use((err: any, req: any, res: any, next: any) => {
  debugError("Express", "Unhandled error", err);
  if (!res.headersSent) {
    res.status(500).json({ error: { message: "Internal server error" } });
  }
});

async function main() {
  const server = createServer(app);

  // Initialize skill registry - auto-sync skills from folder to database
  try {
    await initializeSkillRegistry();
  } catch (error) {
    console.error("[Startup] Failed to initialize skill registry:", error);
  }

  // Initialize scheduled messages worker (BullMQ + Redis)
  try {
    initializeScheduler();
  } catch (error) {
    console.error("[Startup] Failed to initialize scheduler:", error);
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

  // Initialize LLM queue system (BullMQ workers for background tasks)
  try {
    await initializeQueues();
  } catch (error) {
    console.error("[Startup] Failed to initialize LLM queues:", error);
  }

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Prefer PORT, else pick a free one
  const preferred = parseInt(process.env.PORT || "3000");
  const port = Number.isFinite(preferred) ? preferred : 3000;

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

// Graceful shutdown: flush audit logs and close queues
process.on("SIGTERM", async () => {
  await shutdownTelegramWorker().catch(() => {});
  await auditLogger.shutdown().catch(() => {});
});
process.on("SIGINT", async () => {
  await shutdownTelegramWorker().catch(() => {});
  await auditLogger.shutdown().catch(() => {});
});

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
