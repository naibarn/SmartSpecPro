import express from "express";
import { createServer } from "http";
import { fileURLToPath } from "url";
import path from "path";
import cookieParser from "cookie-parser";

import { createContext } from "./context";
import { appRouter } from "../routers";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { serveStatic, setupVite } from "./vite";
import { registerLLMRoutes } from "./llmRoutes";
import { registerMCPRoutes } from "./mcpRoutes";
import { registerOAuthRoutes } from "./oauth";
import { registerDeviceAuthRoutes } from "./deviceAuthRoutes";
import { registerServicesRoutes } from "../routers/services";
import { registerTenantRoutes } from "../routers/tenant";
import { registerAdminTenantsRoutes } from "../routers/adminTenants";
import { tenantMiddleware } from "./tenant";
import { ENV } from "./env";
import { debugError } from "./logger";
import { getUploadsDir, useLocalStorage } from "../storage";
import { initializeSkillRegistry } from "../services/skillRegistry";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable("x-powered-by");


// CORS for cross-domain access (Docker Status, etc.)
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Allow Docker Status subdomains to access token generation API
  if (origin && (
    origin.includes('docker.smartspec.local') ||
    origin.includes('docker.smartspec.pro') ||
    origin.includes('docker.localhost')
  )) {
    res.setHeader('Access-Control-Allow-Origin', origin);
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
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

// JSON body parser with error logging
app.use(express.json({ limit: "50mb" }));
app.use((err: any, req: any, res: any, next: any) => {
  // Catch JSON parse errors (SyntaxError from body-parser)
  if (err instanceof SyntaxError && 'body' in err) {
    debugError("JSON Parse", `Failed to parse JSON body for ${req.url}`, err);
    return res.status(400).json({ error: { message: "Invalid JSON in request body" } });
  }
  next(err);
});
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser(ENV.cookieSecret));

// Serve uploaded files BEFORE tenant middleware (internal Docker access)
// This allows services like smartspec-backend to access files without tenant validation
if (useLocalStorage()) {
  const uploadsDir = getUploadsDir();
  console.log(`[Storage] Using local storage at: ${uploadsDir}`);
  app.use('/uploads', express.static(uploadsDir, {
    maxAge: '1d',
    etag: true,
  }));
}

// Multi-tenant middleware - identifies tenant from domain
app.use(tenantMiddleware);

// REST/SSE endpoints
registerLLMRoutes(app);
registerMCPRoutes(app);

// OAuth routes
registerOAuthRoutes(app);

// Device auth routes (for desktop app)
registerDeviceAuthRoutes(app);

// Services management routes (admin)
registerServicesRoutes(app);

// Tenant routes
registerTenantRoutes(app);

// Admin tenant management routes
registerAdminTenantsRoutes(app);

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
    // Continue starting server even if skill sync fails
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
    console.log(`SmartSpecWeb listening on http://0.0.0.0:${port}`);
  });
}

// Handle uncaught errors
process.on("uncaughtException", (err) => {
  debugError("Process", "Uncaught Exception", err);
});

process.on("unhandledRejection", (reason, promise) => {
  debugError("Process", "Unhandled Rejection", reason);
});

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
