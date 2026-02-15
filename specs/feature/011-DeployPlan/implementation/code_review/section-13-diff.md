diff --git a/apps/web/client/src/components/ErrorBoundary.tsx b/apps/web/client/src/components/ErrorBoundary.tsx
index af533f2..638bfd3 100644
--- a/apps/web/client/src/components/ErrorBoundary.tsx
+++ b/apps/web/client/src/components/ErrorBoundary.tsx
@@ -1,6 +1,7 @@
+import * as Sentry from "@sentry/react";
 import { cn } from "@/lib/utils";
 import { AlertTriangle, RotateCcw } from "lucide-react";
-import { Component, ReactNode } from "react";
+import { Component, ErrorInfo, ReactNode } from "react";
 
 interface Props {
   children: ReactNode;
@@ -21,6 +22,12 @@ class ErrorBoundary extends Component<Props, State> {
     return { hasError: true, error };
   }
 
+  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
+    Sentry.captureException(error, {
+      contexts: { react: { componentStack: errorInfo.componentStack } },
+    });
+  }
+
   render() {
     if (this.state.hasError) {
       return (
diff --git a/apps/web/client/src/main.tsx b/apps/web/client/src/main.tsx
index 1992cdf..45cc96a 100644
--- a/apps/web/client/src/main.tsx
+++ b/apps/web/client/src/main.tsx
@@ -1,3 +1,4 @@
+import * as Sentry from "@sentry/react";
 import { trpc } from "@/lib/trpc";
 import { UNAUTHED_ERR_MSG } from '@shared/const';
 import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
@@ -9,6 +10,40 @@ import App from "./App";
 import { getLoginUrl } from "./const";
 import "./index.css";
 
+// Initialize Sentry for frontend error tracking (only when DSN is configured)
+if (import.meta.env.VITE_SENTRY_DSN) {
+  Sentry.init({
+    dsn: import.meta.env.VITE_SENTRY_DSN,
+    environment: import.meta.env.MODE || "production",
+    release: import.meta.env.VITE_RELEASE || undefined,
+    tracesSampleRate: 0.05,
+    replaysSessionSampleRate: 0.01,
+    replaysOnErrorSampleRate: 1.0,
+    integrations: [
+      Sentry.browserTracingIntegration(),
+      Sentry.replayIntegration({
+        maskAllInputs: true,
+        maskAllText: false,
+      }),
+    ],
+    beforeSend(event) {
+      // Scrub sensitive fields from breadcrumbs and extra data
+      if (event.breadcrumbs) {
+        for (const crumb of event.breadcrumbs) {
+          if (crumb.data && typeof crumb.data === "object") {
+            for (const key of Object.keys(crumb.data)) {
+              if (/password|token|secret|apiKey/i.test(key)) {
+                crumb.data[key] = "[FILTERED]";
+              }
+            }
+          }
+        }
+      }
+      return event;
+    },
+  });
+}
+
 const queryClient = new QueryClient();
 
 let isRedirectingToLogin = false;
diff --git a/apps/web/package.json b/apps/web/package.json
index 475a896..e084bfa 100644
--- a/apps/web/package.json
+++ b/apps/web/package.json
@@ -20,7 +20,6 @@
   "dependencies": {
     "@aws-sdk/client-s3": "^3.693.0",
     "@aws-sdk/s3-request-presigner": "^3.693.0",
-    "@google-cloud/tasks": "^5.5.0",
     "@codemirror/lang-css": "^6.3.1",
     "@codemirror/lang-html": "^6.4.11",
     "@codemirror/lang-javascript": "^6.2.4",
@@ -31,6 +30,7 @@
     "@codemirror/lang-sql": "^6.10.0",
     "@codemirror/lang-xml": "^6.1.0",
     "@codemirror/lang-yaml": "^6.1.2",
+    "@google-cloud/tasks": "^5.5.0",
     "@hookform/resolvers": "^5.2.2",
     "@radix-ui/react-accordion": "^1.2.12",
     "@radix-ui/react-alert-dialog": "^1.1.15",
@@ -58,6 +58,9 @@
     "@radix-ui/react-toggle": "^1.1.10",
     "@radix-ui/react-toggle-group": "^1.1.11",
     "@radix-ui/react-tooltip": "^1.2.8",
+    "@sentry/node": "^10.38.0",
+    "@sentry/react": "^10.38.0",
+    "@sentry/vite-plugin": "^4.9.1",
     "@smartspec/db": "*",
     "@smartspec/shared": "*",
     "@smartspec/skills": "*",
diff --git a/apps/web/server/__tests__/correlationId.test.ts b/apps/web/server/__tests__/correlationId.test.ts
new file mode 100644
index 0000000..0259b78
--- /dev/null
+++ b/apps/web/server/__tests__/correlationId.test.ts
@@ -0,0 +1,84 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+// Mock @sentry/node
+const mockSetTag = vi.fn();
+vi.mock("@sentry/node", () => ({
+  getCurrentScope: vi.fn(() => ({
+    setTag: mockSetTag,
+  })),
+}));
+
+import { correlationIdMiddleware } from "../middleware/correlationId";
+
+/** UUID v4 regex pattern */
+const UUID_PATTERN =
+  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
+
+function createMockReq(headers: Record<string, string> = {}): any {
+  return {
+    headers: { ...headers },
+    requestId: undefined,
+  };
+}
+
+function createMockRes(): any {
+  const headersMap: Record<string, string> = {};
+  return {
+    setHeader: vi.fn((key: string, value: string) => {
+      headersMap[key] = value;
+    }),
+    getHeader: (key: string) => headersMap[key],
+    _headers: headersMap,
+  };
+}
+
+describe("Correlation ID Middleware", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it("should generate a UUID when no X-Request-ID header is present", () => {
+    const req = createMockReq();
+    const res = createMockRes();
+    const next = vi.fn();
+
+    correlationIdMiddleware(req, res, next);
+
+    expect(req.requestId).toBeDefined();
+    expect(req.requestId).toMatch(UUID_PATTERN);
+    expect(res.setHeader).toHaveBeenCalledWith("X-Request-ID", req.requestId);
+    expect(next).toHaveBeenCalled();
+  });
+
+  it("should use incoming X-Request-ID header when present", () => {
+    const req = createMockReq({ "x-request-id": "test-abc-123" });
+    const res = createMockRes();
+    const next = vi.fn();
+
+    correlationIdMiddleware(req, res, next);
+
+    expect(req.requestId).toBe("test-abc-123");
+    expect(res.setHeader).toHaveBeenCalledWith("X-Request-ID", "test-abc-123");
+    expect(next).toHaveBeenCalled();
+  });
+
+  it("should set X-Request-ID as a Sentry tag", () => {
+    const req = createMockReq({ "x-request-id": "test-xyz-789" });
+    const res = createMockRes();
+    const next = vi.fn();
+
+    correlationIdMiddleware(req, res, next);
+
+    expect(mockSetTag).toHaveBeenCalledWith("request_id", "test-xyz-789");
+  });
+
+  it("should generate UUID when X-Request-ID header is empty string", () => {
+    const req = createMockReq({ "x-request-id": "" });
+    const res = createMockRes();
+    const next = vi.fn();
+
+    correlationIdMiddleware(req, res, next);
+
+    expect(req.requestId).toMatch(UUID_PATTERN);
+  });
+});
diff --git a/apps/web/server/__tests__/sentry.test.ts b/apps/web/server/__tests__/sentry.test.ts
new file mode 100644
index 0000000..1d2553e
--- /dev/null
+++ b/apps/web/server/__tests__/sentry.test.ts
@@ -0,0 +1,113 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+// Mock @sentry/node before importing sentry service
+vi.mock("@sentry/node", () => {
+  const scope = {
+    setTag: vi.fn(),
+    setUser: vi.fn(),
+  };
+  return {
+    init: vi.fn(),
+    captureException: vi.fn(),
+    getCurrentScope: vi.fn(() => scope),
+    expressIntegration: vi.fn(),
+    Handlers: {
+      requestHandler: vi.fn(() => vi.fn()),
+      errorHandler: vi.fn(() => vi.fn()),
+    },
+    close: vi.fn(),
+  };
+});
+
+import { beforeSend } from "../services/sentry";
+import type * as SentryTypes from "@sentry/node";
+
+describe("Sentry Node.js Integration", () => {
+  describe("PII Scrubbing (beforeSend)", () => {
+    it("should scrub authorization and cookie headers", () => {
+      const event = {
+        request: {
+          headers: {
+            authorization: "Bearer secret-token-123",
+            cookie: "session=abc123; user=data",
+            "content-type": "application/json",
+          },
+        },
+      } as unknown as SentryTypes.Event;
+
+      const result = beforeSend(event);
+
+      expect(result).not.toBeNull();
+      expect(result!.request!.headers!["authorization"]).toBe("[FILTERED]");
+      expect(result!.request!.headers!["cookie"]).toBe("[FILTERED]");
+      expect(result!.request!.headers!["content-type"]).toBe("application/json");
+    });
+
+    it("should scrub x-proxy-token header", () => {
+      const event = {
+        request: {
+          headers: {
+            "x-proxy-token": "proxy-secret-value",
+          },
+        },
+      } as unknown as SentryTypes.Event;
+
+      const result = beforeSend(event);
+
+      expect(result).not.toBeNull();
+      expect(result!.request!.headers!["x-proxy-token"]).toBe("[FILTERED]");
+    });
+
+    it("should scrub sensitive body fields (password, token, secret, apiKey)", () => {
+      const body = {
+        username: "john",
+        password: "my-secret-pass",
+        token: "auth-token",
+        secret: "shhh",
+        apiKey: "key-123",
+        normalField: "keep-this",
+      };
+
+      const event = {
+        request: {
+          data: JSON.stringify(body),
+        },
+      } as unknown as SentryTypes.Event;
+
+      const result = beforeSend(event);
+
+      expect(result).not.toBeNull();
+      const parsed = JSON.parse(result!.request!.data as string);
+      expect(parsed.username).toBe("john");
+      expect(parsed.password).toBe("[FILTERED]");
+      expect(parsed.token).toBe("[FILTERED]");
+      expect(parsed.secret).toBe("[FILTERED]");
+      expect(parsed.apiKey).toBe("[FILTERED]");
+      expect(parsed.normalField).toBe("keep-this");
+    });
+
+    it("should handle events without request data", () => {
+      const event = {
+        message: "test error",
+      } as unknown as SentryTypes.Event;
+
+      const result = beforeSend(event);
+
+      expect(result).not.toBeNull();
+      expect(result!.message).toBe("test error");
+    });
+
+    it("should handle non-JSON body data gracefully", () => {
+      const event = {
+        request: {
+          data: "not-json-data",
+        },
+      } as unknown as SentryTypes.Event;
+
+      const result = beforeSend(event);
+
+      expect(result).not.toBeNull();
+      expect(result!.request!.data).toBe("not-json-data");
+    });
+  });
+});
diff --git a/apps/web/server/_core/index.ts b/apps/web/server/_core/index.ts
index 39246d1..1dafbe9 100644
--- a/apps/web/server/_core/index.ts
+++ b/apps/web/server/_core/index.ts
@@ -1,4 +1,9 @@
 import "dotenv/config";
+import { initSentry, Sentry } from "../services/sentry";
+
+// Initialize Sentry BEFORE Express app creation (captures startup errors)
+initSentry();
+
 import express from "express";
 import { fileURLToPath } from "url";
 import path from "path";
@@ -28,6 +33,7 @@ import { getUploadsDir, storageStreamFile } from "../storage";
 import { initializeSkillRegistry } from "../services/skillRegistry";
 import { initAuditLogger, auditLogger } from "../services/auditLogger";
 import { auditMiddleware } from "../middleware/auditMiddleware";
+import { correlationIdMiddleware } from "../middleware/correlationId";
 // BullMQ scheduler/queue init removed — migrated to Cloud Tasks (Section 05)
 import { initializeTelegramQueue, shutdownTelegramWorker } from "../services/telegramService";
 import { initializeTrashPurgeJob, shutdownTrashPurgeWorker } from "../jobs/purgeOldTrashItems";
@@ -51,6 +57,12 @@ const __dirname = path.dirname(__filename);
 const app = express();
 app.disable("x-powered-by");
 
+// Sentry request handler — must be the first middleware
+app.use(Sentry.Handlers.requestHandler());
+
+// Correlation ID middleware — generates or propagates X-Request-ID
+app.use(correlationIdMiddleware);
+
 // Trust proxy headers (X-Forwarded-Proto, X-Forwarded-For) from nginx
 // This is required for secure cookies to work behind HTTPS proxy
 app.set("trust proxy", true);
@@ -180,6 +192,15 @@ app.get("/readyz", async (_req, res) => {
 initAuditLogger();
 app.use(auditMiddleware());
 
+// Sentry user context — set user_id tag after auth is resolved
+app.use((req: any, _res: any, next: any) => {
+  if (req.user?.id) {
+    Sentry.getCurrentScope().setTag("user_id", String(req.user.id));
+    Sentry.getCurrentScope().setUser({ id: String(req.user.id) });
+  }
+  next();
+});
+
 // Multi-tenant middleware - identifies tenant from domain
 app.use(tenantMiddleware);
 
@@ -455,6 +476,11 @@ app.all("/api/v1/*", async (req, res) => {
     if (typeof val === "string") headers[key] = val;
   }
 
+  // Forward correlation ID for cross-service tracing
+  if (req.requestId) {
+    headers["x-request-id"] = req.requestId;
+  }
+
   // If the request already has a Bearer token, forward it as-is.
   // Otherwise, authenticate via session cookie and generate a JWT.
   const existingAuth = req.headers.authorization;
@@ -521,6 +547,9 @@ app.use(
   })
 );
 
+// Sentry error handler — captures exceptions before the global error handler
+app.use(Sentry.Handlers.errorHandler());
+
 // Global error handler - must be last
 app.use((err: any, req: any, res: any, next: any) => {
   debugError("Express", "Unhandled error", err);
@@ -647,9 +676,8 @@ process.on("SIGTERM", async () => {
   // TODO: Add in Section 14 (Observability)
   // await posthog.shutdown();
 
-  // 5. Flush Sentry events (if initialized)
-  // TODO: Add in Section 13 (Error Tracking)
-  // await Sentry.close(2000);
+  // 5. Flush Sentry events
+  await Sentry.close(2000).catch(() => {});
 
   // 6. Close Redis connections
   try {
diff --git a/apps/web/server/middleware/correlationId.ts b/apps/web/server/middleware/correlationId.ts
new file mode 100644
index 0000000..2dcfba9
--- /dev/null
+++ b/apps/web/server/middleware/correlationId.ts
@@ -0,0 +1,45 @@
+/**
+ * Correlation ID Middleware
+ *
+ * Generates or propagates X-Request-ID headers across service boundaries.
+ * Sets the ID as a Sentry tag for cross-service error correlation.
+ */
+import { randomUUID } from "crypto";
+import type { Request, Response, NextFunction } from "express";
+import * as Sentry from "@sentry/node";
+
+declare global {
+  namespace Express {
+    interface Request {
+      requestId?: string;
+    }
+  }
+}
+
+/**
+ * Express middleware that reads or generates a correlation ID.
+ * - Reads X-Request-ID from incoming headers
+ * - Generates a UUID if not present
+ * - Attaches to req.requestId
+ * - Sets X-Request-ID response header
+ * - Sets Sentry tag for correlation
+ */
+export function correlationIdMiddleware(
+  req: Request,
+  res: Response,
+  next: NextFunction,
+): void {
+  const incoming = req.headers["x-request-id"];
+  const requestId =
+    typeof incoming === "string" && incoming.length > 0
+      ? incoming
+      : randomUUID();
+
+  req.requestId = requestId;
+  res.setHeader("X-Request-ID", requestId);
+
+  // Set Sentry scope tags
+  Sentry.getCurrentScope().setTag("request_id", requestId);
+
+  next();
+}
diff --git a/apps/web/server/services/sentry.ts b/apps/web/server/services/sentry.ts
new file mode 100644
index 0000000..2d57bbf
--- /dev/null
+++ b/apps/web/server/services/sentry.ts
@@ -0,0 +1,74 @@
+/**
+ * Sentry Error Tracking - Node.js Backend
+ *
+ * Initializes Sentry for the Express backend with:
+ * - PII scrubbing (headers, body fields)
+ * - Express integration
+ * - Configurable sample rate
+ */
+import * as Sentry from "@sentry/node";
+
+const SENSITIVE_HEADERS = ["authorization", "cookie", "x-proxy-token"];
+const SENSITIVE_BODY_PATTERN = /password|token|secret|apiKey|encr/i;
+
+/**
+ * Scrub PII from Sentry events before sending.
+ * Removes sensitive headers and body fields.
+ */
+export function beforeSend(event: Sentry.Event): Sentry.Event | null {
+  // Scrub sensitive headers
+  if (event.request?.headers) {
+    for (const header of SENSITIVE_HEADERS) {
+      if (header in event.request.headers) {
+        event.request.headers[header] = "[FILTERED]";
+      }
+    }
+  }
+
+  // Scrub sensitive body fields
+  if (event.request?.data && typeof event.request.data === "string") {
+    try {
+      const body = JSON.parse(event.request.data);
+      let modified = false;
+      for (const key of Object.keys(body)) {
+        if (SENSITIVE_BODY_PATTERN.test(key)) {
+          body[key] = "[FILTERED]";
+          modified = true;
+        }
+      }
+      if (modified) {
+        event.request.data = JSON.stringify(body);
+      }
+    } catch {
+      // Not valid JSON, skip body scrubbing
+    }
+  }
+
+  return event;
+}
+
+/**
+ * Initialize Sentry for the Node.js backend.
+ * Only initializes if SENTRY_DSN_NODE is set.
+ */
+export function initSentry(): void {
+  const dsn = process.env.SENTRY_DSN_NODE;
+  if (!dsn) {
+    console.log("[Sentry] No SENTRY_DSN_NODE set, skipping initialization");
+    return;
+  }
+
+  Sentry.init({
+    dsn,
+    environment: process.env.ENVIRONMENT || process.env.NODE_ENV || "development",
+    release: process.env.RELEASE || process.env.GIT_COMMIT_SHA || undefined,
+    tracesSampleRate: 0.05,
+    beforeSend,
+    integrations: [Sentry.expressIntegration()],
+  });
+
+  console.log("[Sentry] Initialized for Node.js backend");
+}
+
+/** Re-export Sentry for use in other modules */
+export { Sentry };
diff --git a/apps/web/vite.config.ts b/apps/web/vite.config.ts
index 04bb2ad..1d11d8d 100644
--- a/apps/web/vite.config.ts
+++ b/apps/web/vite.config.ts
@@ -5,10 +5,25 @@ import fs from "node:fs";
 import path from "path";
 import { defineConfig } from "vite";
 import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
+import { sentryVitePlugin } from "@sentry/vite-plugin";
 
 
 const plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime()];
 
+// Conditionally add Sentry source map upload plugin (CI builds only)
+if (process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG) {
+  plugins.push(
+    sentryVitePlugin({
+      org: process.env.SENTRY_ORG,
+      project: process.env.SENTRY_PROJECT || "smartspecpro-frontend",
+      authToken: process.env.SENTRY_AUTH_TOKEN,
+      release: {
+        name: process.env.VITE_RELEASE || process.env.GIT_COMMIT_SHA,
+      },
+    }),
+  );
+}
+
 export default defineConfig({
   plugins,
   resolve: {
@@ -25,6 +40,7 @@ export default defineConfig({
   build: {
     outDir: path.resolve(import.meta.dirname, "dist/public"),
     emptyOutDir: true,
+    sourcemap: true,
   },
   server: {
     host: true,
diff --git a/package-lock.json b/package-lock.json
index d8a943a..a1f14d6 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -118,6 +118,9 @@
         "@radix-ui/react-toggle": "^1.1.10",
         "@radix-ui/react-toggle-group": "^1.1.11",
         "@radix-ui/react-tooltip": "^1.2.8",
+        "@sentry/node": "^10.38.0",
+        "@sentry/react": "^10.38.0",
+        "@sentry/vite-plugin": "^4.9.1",
         "@smartspec/db": "*",
         "@smartspec/shared": "*",
         "@smartspec/skills": "*",
@@ -1614,22 +1617,6 @@
         "mlly": "^1.8.0"
       }
     },
-    "apps/web/node_modules/@isaacs/cliui": {
-      "version": "8.0.2",
-      "dev": true,
-      "license": "ISC",
-      "dependencies": {
-        "string-width": "^5.1.2",
-        "string-width-cjs": "npm:string-width@^4.2.0",
-        "strip-ansi": "^7.0.1",
-        "strip-ansi-cjs": "npm:strip-ansi@^6.0.1",
-        "wrap-ansi": "^8.1.0",
-        "wrap-ansi-cjs": "npm:wrap-ansi@^7.0.0"
-      },
-      "engines": {
-        "node": ">=12"
-      }
-    },
     "apps/web/node_modules/@istanbuljs/schema": {
       "version": "0.1.3",
       "dev": true,
@@ -1650,15 +1637,6 @@
         "langium": "3.3.1"
       }
     },
-    "apps/web/node_modules/@pkgjs/parseargs": {
-      "version": "0.11.0",
-      "dev": true,
-      "license": "MIT",
-      "optional": true,
-      "engines": {
-        "node": ">=14"
-      }
-    },
     "apps/web/node_modules/@redis/bloom": {
       "version": "1.2.0",
       "license": "MIT",
@@ -2794,16 +2772,6 @@
         "node": ">= 0.6"
       }
     },
-    "apps/web/node_modules/acorn": {
-      "version": "8.15.0",
-      "license": "MIT",
-      "bin": {
-        "acorn": "bin/acorn"
-      },
-      "engines": {
-        "node": ">=0.4.0"
-      }
-    },
     "apps/web/node_modules/add": {
       "version": "2.0.6",
       "dev": true,
@@ -2816,28 +2784,6 @@
         "node": ">=12.0"
       }
     },
-    "apps/web/node_modules/ansi-regex": {
-      "version": "6.2.2",
-      "dev": true,
-      "license": "MIT",
-      "engines": {
-        "node": ">=12"
-      },
-      "funding": {
-        "url": "https://github.com/chalk/ansi-regex?sponsor=1"
-      }
-    },
-    "apps/web/node_modules/ansi-styles": {
-      "version": "6.2.3",
-      "dev": true,
-      "license": "MIT",
-      "engines": {
-        "node": ">=12"
-      },
-      "funding": {
-        "url": "https://github.com/chalk/ansi-styles?sponsor=1"
-      }
-    },
     "apps/web/node_modules/array-flatten": {
       "version": "1.1.1",
       "license": "MIT"
@@ -3691,20 +3637,10 @@
         }
       }
     },
-    "apps/web/node_modules/eastasianwidth": {
-      "version": "0.2.0",
-      "dev": true,
-      "license": "MIT"
-    },
     "apps/web/node_modules/ee-first": {
       "version": "1.1.1",
       "license": "MIT"
     },
-    "apps/web/node_modules/emoji-regex": {
-      "version": "9.2.2",
-      "dev": true,
-      "license": "MIT"
-    },
     "apps/web/node_modules/encodeurl": {
       "version": "2.0.0",
       "license": "MIT",
@@ -4328,21 +4264,6 @@
         }
       }
     },
-    "apps/web/node_modules/foreground-child": {
-      "version": "3.3.1",
-      "dev": true,
-      "license": "ISC",
-      "dependencies": {
-        "cross-spawn": "^7.0.6",
-        "signal-exit": "^4.0.1"
-      },
-      "engines": {
-        "node": ">=14"
-      },
-      "funding": {
-        "url": "https://github.com/sponsors/isaacs"
-      }
-    },
     "apps/web/node_modules/forwarded": {
       "version": "0.2.0",
       "license": "MIT",
@@ -4397,25 +4318,6 @@
         "url": "https://github.com/privatenumber/get-tsconfig?sponsor=1"
       }
     },
-    "apps/web/node_modules/glob": {
-      "version": "10.5.0",
-      "dev": true,
-      "license": "ISC",
-      "dependencies": {
-        "foreground-child": "^3.1.0",
-        "jackspeak": "^3.1.2",
-        "minimatch": "^9.0.4",
-        "minipass": "^7.1.2",
-        "package-json-from-dist": "^1.0.0",
-        "path-scurry": "^1.11.1"
-      },
-      "bin": {
-        "glob": "dist/esm/bin.mjs"
-      },
-      "funding": {
-        "url": "https://github.com/sponsors/isaacs"
-      }
-    },
     "apps/web/node_modules/hachure-fill": {
       "version": "0.5.2",
       "license": "MIT"
@@ -4689,20 +4591,6 @@
         "node": ">=10"
       }
     },
-    "apps/web/node_modules/jackspeak": {
-      "version": "3.4.3",
-      "dev": true,
-      "license": "BlueOak-1.0.0",
-      "dependencies": {
-        "@isaacs/cliui": "^8.0.2"
-      },
-      "funding": {
-        "url": "https://github.com/sponsors/isaacs"
-      },
-      "optionalDependencies": {
-        "@pkgjs/parseargs": "^0.11.0"
-      }
-    },
     "apps/web/node_modules/jose": {
       "version": "6.1.0",
       "license": "MIT",
@@ -5009,14 +4897,6 @@
         "url": "https://github.com/sponsors/isaacs"
       }
     },
-    "apps/web/node_modules/minipass": {
-      "version": "7.1.2",
-      "dev": true,
-      "license": "ISC",
-      "engines": {
-        "node": ">=16 || 14 >=14.17"
-      }
-    },
     "apps/web/node_modules/mitt": {
       "version": "3.0.1",
       "license": "MIT"
@@ -5143,11 +5023,6 @@
         "regex-recursion": "^6.0.2"
       }
     },
-    "apps/web/node_modules/package-json-from-dist": {
-      "version": "1.0.1",
-      "dev": true,
-      "license": "BlueOak-1.0.0"
-    },
     "apps/web/node_modules/package-manager-detector": {
       "version": "1.6.0",
       "license": "MIT"
@@ -5167,26 +5042,6 @@
       "version": "0.1.0",
       "license": "MIT"
     },
-    "apps/web/node_modules/path-scurry": {
-      "version": "1.11.1",
-      "dev": true,
-      "license": "BlueOak-1.0.0",
-      "dependencies": {
-        "lru-cache": "^10.2.0",
-        "minipass": "^5.0.0 || ^6.0.2 || ^7.0.0"
-      },
-      "engines": {
-        "node": ">=16 || 14 >=14.18"
-      },
-      "funding": {
-        "url": "https://github.com/sponsors/isaacs"
-      }
-    },
-    "apps/web/node_modules/path-scurry/node_modules/lru-cache": {
-      "version": "10.4.3",
-      "dev": true,
-      "license": "ISC"
-    },
     "apps/web/node_modules/path-to-regexp": {
       "version": "0.1.12",
       "license": "MIT"
@@ -5272,10 +5127,6 @@
         "node": ">= 0.10"
       }
     },
-    "apps/web/node_modules/proxy-from-env": {
-      "version": "1.1.0",
-      "license": "MIT"
-    },
     "apps/web/node_modules/pump": {
       "version": "3.0.3",
       "license": "MIT",
@@ -5623,17 +5474,6 @@
         "@types/hast": "^3.0.4"
       }
     },
-    "apps/web/node_modules/signal-exit": {
-      "version": "4.1.0",
-      "dev": true,
-      "license": "ISC",
-      "engines": {
-        "node": ">=14"
-      },
-      "funding": {
-        "url": "https://github.com/sponsors/isaacs"
-      }
-    },
     "apps/web/node_modules/source-map": {
       "version": "0.6.1",
       "dev": true,
@@ -5724,94 +5564,6 @@
         "react": "^16.5.1 || ^17.0.0 || ^18.0.0 || ^19.0.0"
       }
     },
-    "apps/web/node_modules/string-width": {
-      "version": "5.1.2",
-      "dev": true,
-      "license": "MIT",
-      "dependencies": {
-        "eastasianwidth": "^0.2.0",
-        "emoji-regex": "^9.2.2",
-        "strip-ansi": "^7.0.1"
-      },
-      "engines": {
-        "node": ">=12"
-      },
-      "funding": {
-        "url": "https://github.com/sponsors/sindresorhus"
-      }
-    },
-    "apps/web/node_modules/string-width-cjs": {
-      "name": "string-width",
-      "version": "4.2.3",
-      "dev": true,
-      "license": "MIT",
-      "dependencies": {
-        "emoji-regex": "^8.0.0",
-        "is-fullwidth-code-point": "^3.0.0",
-        "strip-ansi": "^6.0.1"
-      },
-      "engines": {
-        "node": ">=8"
-      }
-    },
-    "apps/web/node_modules/string-width-cjs/node_modules/ansi-regex": {
-      "version": "5.0.1",
-      "dev": true,
-      "license": "MIT",
-      "engines": {
-        "node": ">=8"
-      }
-    },
-    "apps/web/node_modules/string-width-cjs/node_modules/emoji-regex": {
-      "version": "8.0.0",
-      "dev": true,
-      "license": "MIT"
-    },
-    "apps/web/node_modules/string-width-cjs/node_modules/strip-ansi": {
-      "version": "6.0.1",
-      "dev": true,
-      "license": "MIT",
-      "dependencies": {
-        "ansi-regex": "^5.0.1"
-      },
-      "engines": {
-        "node": ">=8"
-      }
-    },
-    "apps/web/node_modules/strip-ansi": {
-      "version": "7.1.2",
-      "dev": true,
-      "license": "MIT",
-      "dependencies": {
-        "ansi-regex": "^6.0.1"
-      },
-      "engines": {
-        "node": ">=12"
-      },
-      "funding": {
-        "url": "https://github.com/chalk/strip-ansi?sponsor=1"
-      }
-    },
-    "apps/web/node_modules/strip-ansi-cjs": {
-      "name": "strip-ansi",
-      "version": "6.0.1",
-      "dev": true,
-      "license": "MIT",
-      "dependencies": {
-        "ansi-regex": "^5.0.1"
-      },
-      "engines": {
-        "node": ">=8"
-      }
-    },
-    "apps/web/node_modules/strip-ansi-cjs/node_modules/ansi-regex": {
-      "version": "5.0.1",
-      "dev": true,
-      "license": "MIT",
-      "engines": {
-        "node": ">=8"
-      }
-    },
     "apps/web/node_modules/strnum": {
       "version": "2.1.2",
       "funding": [
@@ -7183,104 +6935,37 @@
         "react": ">=16.8.0"
       }
     },
-    "apps/web/node_modules/wrap-ansi": {
-      "version": "8.1.0",
+    "node_modules/@acemir/cssom": {
+      "version": "0.9.31",
+      "resolved": "https://registry.npmjs.org/@acemir/cssom/-/cssom-0.9.31.tgz",
+      "integrity": "sha512-ZnR3GSaH+/vJ0YlHau21FjfLYjMpYVIzTD8M8vIEQvIGxeOXyXdzCI140rrCY862p/C/BbzWsjc1dgnM9mkoTA==",
       "dev": true,
-      "license": "MIT",
+      "license": "MIT"
+    },
+    "node_modules/@adobe/css-tools": {
+      "version": "4.4.4",
+      "resolved": "https://registry.npmjs.org/@adobe/css-tools/-/css-tools-4.4.4.tgz",
+      "integrity": "sha512-Elp+iwUx5rN5+Y8xLt5/GRoG20WGoDCQ/1Fb+1LiGtvwbDavuSk0jhD/eZdckHAuzcDzccnkv+rEjyWfRx18gg==",
+      "dev": true,
+      "license": "MIT"
+    },
+    "node_modules/@apm-js-collab/code-transformer": {
+      "version": "0.8.2",
+      "resolved": "https://registry.npmjs.org/@apm-js-collab/code-transformer/-/code-transformer-0.8.2.tgz",
+      "integrity": "sha512-YRjJjNq5KFSjDUoqu5pFUWrrsvGOxl6c3bu+uMFc9HNNptZ2rNU/TI2nLw4jnhQNtka972Ee2m3uqbvDQtPeCA==",
+      "license": "Apache-2.0"
+    },
+    "node_modules/@apm-js-collab/tracing-hooks": {
+      "version": "0.3.1",
+      "resolved": "https://registry.npmjs.org/@apm-js-collab/tracing-hooks/-/tracing-hooks-0.3.1.tgz",
+      "integrity": "sha512-Vu1CbmPURlN5fTboVuKMoJjbO5qcq9fA5YXpskx3dXe/zTBvjODFoerw+69rVBlRLrJpwPqSDqEuJDEKIrTldw==",
+      "license": "Apache-2.0",
       "dependencies": {
-        "ansi-styles": "^6.1.0",
-        "string-width": "^5.0.1",
-        "strip-ansi": "^7.0.1"
-      },
-      "engines": {
-        "node": ">=12"
-      },
-      "funding": {
-        "url": "https://github.com/chalk/wrap-ansi?sponsor=1"
+        "@apm-js-collab/code-transformer": "^0.8.0",
+        "debug": "^4.4.1",
+        "module-details-from-path": "^1.0.4"
       }
     },
-    "apps/web/node_modules/wrap-ansi-cjs": {
-      "name": "wrap-ansi",
-      "version": "7.0.0",
-      "dev": true,
-      "license": "MIT",
-      "dependencies": {
-        "ansi-styles": "^4.0.0",
-        "string-width": "^4.1.0",
-        "strip-ansi": "^6.0.0"
-      },
-      "engines": {
-        "node": ">=10"
-      },
-      "funding": {
-        "url": "https://github.com/chalk/wrap-ansi?sponsor=1"
-      }
-    },
-    "apps/web/node_modules/wrap-ansi-cjs/node_modules/ansi-regex": {
-      "version": "5.0.1",
-      "dev": true,
-      "license": "MIT",
-      "engines": {
-        "node": ">=8"
-      }
-    },
-    "apps/web/node_modules/wrap-ansi-cjs/node_modules/ansi-styles": {
-      "version": "4.3.0",
-      "dev": true,
-      "license": "MIT",
-      "dependencies": {
-        "color-convert": "^2.0.1"
-      },
-      "engines": {
-        "node": ">=8"
-      },
-      "funding": {
-        "url": "https://github.com/chalk/ansi-styles?sponsor=1"
-      }
-    },
-    "apps/web/node_modules/wrap-ansi-cjs/node_modules/emoji-regex": {
-      "version": "8.0.0",
-      "dev": true,
-      "license": "MIT"
-    },
-    "apps/web/node_modules/wrap-ansi-cjs/node_modules/string-width": {
-      "version": "4.2.3",
-      "dev": true,
-      "license": "MIT",
-      "dependencies": {
-        "emoji-regex": "^8.0.0",
-        "is-fullwidth-code-point": "^3.0.0",
-        "strip-ansi": "^6.0.1"
-      },
-      "engines": {
-        "node": ">=8"
-      }
-    },
-    "apps/web/node_modules/wrap-ansi-cjs/node_modules/strip-ansi": {
-      "version": "6.0.1",
-      "dev": true,
-      "license": "MIT",
-      "dependencies": {
-        "ansi-regex": "^5.0.1"
-      },
-      "engines": {
-        "node": ">=8"
-      }
-    },
-    "node_modules/@acemir/cssom": {
-      "version": "0.9.31",
-      "resolved": "https://registry.npmjs.org/@acemir/cssom/-/cssom-0.9.31.tgz",
-      "integrity": "sha512-ZnR3GSaH+/vJ0YlHau21FjfLYjMpYVIzTD8M8vIEQvIGxeOXyXdzCI140rrCY862p/C/BbzWsjc1dgnM9mkoTA==",
-      "dev": true,
-      "license": "MIT"
-    },
-    "node_modules/@adobe/css-tools": {
-      "version": "4.4.4",
-      "resolved": "https://registry.npmjs.org/@adobe/css-tools/-/css-tools-4.4.4.tgz",
-      "integrity": "sha512-Elp+iwUx5rN5+Y8xLt5/GRoG20WGoDCQ/1Fb+1LiGtvwbDavuSk0jhD/eZdckHAuzcDzccnkv+rEjyWfRx18gg==",
-      "dev": true,
-      "license": "MIT"
-    },
     "node_modules/@asamuzakjp/dom-selector": {
       "version": "6.7.8",
       "resolved": "https://registry.npmjs.org/@asamuzakjp/dom-selector/-/dom-selector-6.7.8.tgz",
@@ -7316,7 +7001,6 @@
       "version": "7.29.0",
       "resolved": "https://registry.npmjs.org/@babel/code-frame/-/code-frame-7.29.0.tgz",
       "integrity": "sha512-9NhCeYjq9+3uxgdtp20LSiJXJvN0FeCtNGpJxuMFZ1Kv3cWUNb6DOhJwUvcVCzKGR66cw4njwM6hrJLqgOwbcw==",
-      "dev": true,
       "license": "MIT",
       "dependencies": {
         "@babel/helper-validator-identifier": "^7.28.5",
@@ -7331,7 +7015,6 @@
       "version": "7.29.0",
       "resolved": "https://registry.npmjs.org/@babel/compat-data/-/compat-data-7.29.0.tgz",
       "integrity": "sha512-T1NCJqT/j9+cn8fvkt7jtwbLBfLC/1y1c7NtCeXFRgzGTsafi68MRv8yzkYSapBnFA6L3U2VSc02ciDzoAJhJg==",
-      "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=6.9.0"
@@ -7341,7 +7024,6 @@
       "version": "7.29.0",
       "resolved": "https://registry.npmjs.org/@babel/core/-/core-7.29.0.tgz",
       "integrity": "sha512-CGOfOJqWjg2qW/Mb6zNsDm+u5vFQ8DxXfbM09z69p5Z6+mE1ikP2jUXw+j42Pf1XTYED2Rni5f95npYeuwMDQA==",
-      "dev": true,
       "license": "MIT",
       "peer": true,
       "dependencies": {
@@ -7373,7 +7055,6 @@
       "version": "7.29.0",
       "resolved": "https://registry.npmjs.org/@babel/generator/-/generator-7.29.0.tgz",
       "integrity": "sha512-vSH118/wwM/pLR38g/Sgk05sNtro6TlTJKuiMXDaZqPUfjTFcudpCOt00IhOfj+1BFAX+UFAlzCU+6WXr3GLFQ==",
-      "dev": true,
       "license": "MIT",
       "dependencies": {
         "@babel/parser": "^7.29.0",
@@ -7390,7 +7071,6 @@
       "version": "7.28.6",
       "resolved": "https://registry.npmjs.org/@babel/helper-compilation-targets/-/helper-compilation-targets-7.28.6.tgz",
       "integrity": "sha512-JYtls3hqi15fcx5GaSNL7SCTJ2MNmjrkHXg4FSpOA/grxK8KwyZ5bubHsCq8FXCkua6xhuaaBit+3b7+VZRfcA==",
-      "dev": true,
       "license": "MIT",
       "dependencies": {
         "@babel/compat-data": "^7.28.6",
@@ -7407,7 +7087,6 @@
       "version": "7.28.0",
       "resolved": "https://registry.npmjs.org/@babel/helper-globals/-/helper-globals-7.28.0.tgz",
       "integrity": "sha512-+W6cISkXFa1jXsDEdYA8HeevQT/FULhxzR99pxphltZcVaugps53THCeiWA8SguxxpSp3gKPiuYfSWopkLQ4hw==",
-      "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=6.9.0"
@@ -7417,7 +7096,6 @@
       "version": "7.28.6",
       "resolved": "https://registry.npmjs.org/@babel/helper-module-imports/-/helper-module-imports-7.28.6.tgz",
       "integrity": "sha512-l5XkZK7r7wa9LucGw9LwZyyCUscb4x37JWTPz7swwFE/0FMQAGpiWUZn8u9DzkSBWEcK25jmvubfpw2dnAMdbw==",
-      "dev": true,
       "license": "MIT",
       "dependencies": {
         "@babel/traverse": "^7.28.6",
@@ -7431,7 +7109,6 @@
       "version": "7.28.6",
       "resolved": "https://registry.npmjs.org/@babel/helper-module-transforms/-/helper-module-transforms-7.28.6.tgz",
       "integrity": "sha512-67oXFAYr2cDLDVGLXTEABjdBJZ6drElUSI7WKp70NrpyISso3plG9SAGEF6y7zbha/wOzUByWWTJvEDVNIUGcA==",
-      "dev": true,
       "license": "MIT",
       "dependencies": {
         "@babel/helper-module-imports": "^7.28.6",
@@ -7459,7 +7136,6 @@
       "version": "7.27.1",
       "resolved": "https://registry.npmjs.org/@babel/helper-string-parser/-/helper-string-parser-7.27.1.tgz",
       "integrity": "sha512-qMlSxKbpRlAridDExk92nSobyDdpPijUq2DW6oDnUqd0iOGxmQjyqhMIihI9+zv4LPyZdRje2cavWPbCbWm3eA==",
-      "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=6.9.0"
@@ -7469,7 +7145,6 @@
       "version": "7.28.5",
       "resolved": "https://registry.npmjs.org/@babel/helper-validator-identifier/-/helper-validator-identifier-7.28.5.tgz",
       "integrity": "sha512-qSs4ifwzKJSV39ucNjsvc6WVHs6b7S03sOh2OcHF9UHfVPqWWALUsNUVzhSBiItjRZoLHx7nIarVjqKVusUZ1Q==",
-      "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=6.9.0"
@@ -7479,7 +7154,6 @@
       "version": "7.27.1",
       "resolved": "https://registry.npmjs.org/@babel/helper-validator-option/-/helper-validator-option-7.27.1.tgz",
       "integrity": "sha512-YvjJow9FxbhFFKDSuFnVCe2WxXk1zWc22fFePVNEaWJEu8IrZVlda6N0uHwzZrUM1il7NC9Mlp4MaJYbYd9JSg==",
-      "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=6.9.0"
@@ -7489,7 +7163,6 @@
       "version": "7.28.6",
       "resolved": "https://registry.npmjs.org/@babel/helpers/-/helpers-7.28.6.tgz",
       "integrity": "sha512-xOBvwq86HHdB7WUDTfKfT/Vuxh7gElQ+Sfti2Cy6yIWNW05P8iUslOVcZ4/sKbE+/jQaukQAdz/gf3724kYdqw==",
-      "dev": true,
       "license": "MIT",
       "dependencies": {
         "@babel/template": "^7.28.6",
@@ -7503,7 +7176,6 @@
       "version": "7.29.0",
       "resolved": "https://registry.npmjs.org/@babel/parser/-/parser-7.29.0.tgz",
       "integrity": "sha512-IyDgFV5GeDUVX4YdF/3CPULtVGSXXMLh1xVIgdCgxApktqnQV0r7/8Nqthg+8YLGaAtdyIlo2qIdZrbCv4+7ww==",
-      "dev": true,
       "license": "MIT",
       "dependencies": {
         "@babel/types": "^7.29.0"
@@ -7561,7 +7233,6 @@
       "version": "7.28.6",
       "resolved": "https://registry.npmjs.org/@babel/template/-/template-7.28.6.tgz",
       "integrity": "sha512-YA6Ma2KsCdGb+WC6UpBVFJGXL58MDA6oyONbjyF/+5sBgxY/dwkhLogbMT2GXXyU84/IhRw/2D1Os1B/giz+BQ==",
-      "dev": true,
       "license": "MIT",
       "dependencies": {
         "@babel/code-frame": "^7.28.6",
@@ -7576,7 +7247,6 @@
       "version": "7.29.0",
       "resolved": "https://registry.npmjs.org/@babel/traverse/-/traverse-7.29.0.tgz",
       "integrity": "sha512-4HPiQr0X7+waHfyXPZpWPfWL/J7dcN1mx9gL6WdQVMbPnF3+ZhSMs8tCxN7oHddJE9fhNE7+lxdnlyemKfJRuA==",
-      "dev": true,
       "license": "MIT",
       "dependencies": {
         "@babel/code-frame": "^7.29.0",
@@ -7595,7 +7265,6 @@
       "version": "7.29.0",
       "resolved": "https://registry.npmjs.org/@babel/types/-/types-7.29.0.tgz",
       "integrity": "sha512-LwdZHpScM4Qz8Xw2iKSzS+cfglZzJGvofQICy7W7v4caru4EaAmyUuO6BGrbyQ2mYV11W0U8j5mBhd14dd3B0A==",
-      "dev": true,
       "license": "MIT",
       "dependencies": {
         "@babel/helper-string-parser": "^7.27.1",
@@ -8444,11 +8113,106 @@
       "integrity": "sha512-eUgLqrMf8nJkZxT24JvVRrQya1vZkQh8BBeYNwGDqa5I0VUi8ACx7uFvAaLxintokpTenkK6DASvo/bvNbBGow==",
       "license": "MIT"
     },
+    "node_modules/@isaacs/cliui": {
+      "version": "8.0.2",
+      "resolved": "https://registry.npmjs.org/@isaacs/cliui/-/cliui-8.0.2.tgz",
+      "integrity": "sha512-O8jcjabXaleOG9DQ0+ARXWZBTfnP4WNAqzuiJK7ll44AmxGKv/J2M4TPjxjY3znBCfvBXFzucm1twdyFybFqEA==",
+      "license": "ISC",
+      "dependencies": {
+        "string-width": "^5.1.2",
+        "string-width-cjs": "npm:string-width@^4.2.0",
+        "strip-ansi": "^7.0.1",
+        "strip-ansi-cjs": "npm:strip-ansi@^6.0.1",
+        "wrap-ansi": "^8.1.0",
+        "wrap-ansi-cjs": "npm:wrap-ansi@^7.0.0"
+      },
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/@isaacs/cliui/node_modules/ansi-regex": {
+      "version": "6.2.2",
+      "resolved": "https://registry.npmjs.org/ansi-regex/-/ansi-regex-6.2.2.tgz",
+      "integrity": "sha512-Bq3SmSpyFHaWjPk8If9yc6svM8c56dB5BAtW4Qbw5jHTwwXXcTLoRMkpDJp6VL0XzlWaCHTXrkFURMYmD0sLqg==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=12"
+      },
+      "funding": {
+        "url": "https://github.com/chalk/ansi-regex?sponsor=1"
+      }
+    },
+    "node_modules/@isaacs/cliui/node_modules/ansi-styles": {
+      "version": "6.2.3",
+      "resolved": "https://registry.npmjs.org/ansi-styles/-/ansi-styles-6.2.3.tgz",
+      "integrity": "sha512-4Dj6M28JB+oAH8kFkTLUo+a2jwOFkuqb3yucU0CANcRRUbxS0cP0nZYCGjcc3BNXwRIsUVmDGgzawme7zvJHvg==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=12"
+      },
+      "funding": {
+        "url": "https://github.com/chalk/ansi-styles?sponsor=1"
+      }
+    },
+    "node_modules/@isaacs/cliui/node_modules/emoji-regex": {
+      "version": "9.2.2",
+      "resolved": "https://registry.npmjs.org/emoji-regex/-/emoji-regex-9.2.2.tgz",
+      "integrity": "sha512-L18DaJsXSUk2+42pv8mLs5jJT2hqFkFE4j21wOmgbUqsZ2hL72NsUU785g9RXgo3s0ZNgVl42TiHp3ZtOv/Vyg==",
+      "license": "MIT"
+    },
+    "node_modules/@isaacs/cliui/node_modules/string-width": {
+      "version": "5.1.2",
+      "resolved": "https://registry.npmjs.org/string-width/-/string-width-5.1.2.tgz",
+      "integrity": "sha512-HnLOCR3vjcY8beoNLtcjZ5/nxn2afmME6lhrDrebokqMap+XbeW8n9TXpPDOqdGK5qcI3oT0GKTW6wC7EMiVqA==",
+      "license": "MIT",
+      "dependencies": {
+        "eastasianwidth": "^0.2.0",
+        "emoji-regex": "^9.2.2",
+        "strip-ansi": "^7.0.1"
+      },
+      "engines": {
+        "node": ">=12"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/sindresorhus"
+      }
+    },
+    "node_modules/@isaacs/cliui/node_modules/strip-ansi": {
+      "version": "7.1.2",
+      "resolved": "https://registry.npmjs.org/strip-ansi/-/strip-ansi-7.1.2.tgz",
+      "integrity": "sha512-gmBGslpoQJtgnMAvOVqGZpEz9dyoKTCzy2nfz/n8aIFhN/jCE/rCmcxabB6jOOHV+0WNnylOxaxBQPSvcWklhA==",
+      "license": "MIT",
+      "dependencies": {
+        "ansi-regex": "^6.0.1"
+      },
+      "engines": {
+        "node": ">=12"
+      },
+      "funding": {
+        "url": "https://github.com/chalk/strip-ansi?sponsor=1"
+      }
+    },
+    "node_modules/@isaacs/cliui/node_modules/wrap-ansi": {
+      "version": "8.1.0",
+      "resolved": "https://registry.npmjs.org/wrap-ansi/-/wrap-ansi-8.1.0.tgz",
+      "integrity": "sha512-si7QWI6zUMq56bESFvagtmzMdGOtoxfR+Sez11Mobfc7tm+VkUckk9bW2UeffTGVUbOksxmSw0AA2gs8g71NCQ==",
+      "license": "MIT",
+      "dependencies": {
+        "ansi-styles": "^6.1.0",
+        "string-width": "^5.0.1",
+        "strip-ansi": "^7.0.1"
+      },
+      "engines": {
+        "node": ">=12"
+      },
+      "funding": {
+        "url": "https://github.com/chalk/wrap-ansi?sponsor=1"
+      }
+    },
     "node_modules/@jridgewell/gen-mapping": {
       "version": "0.3.13",
       "resolved": "https://registry.npmjs.org/@jridgewell/gen-mapping/-/gen-mapping-0.3.13.tgz",
       "integrity": "sha512-2kkt/7niJ6MgEPxF0bYdQ6etZaA+fQvDcLKckhy1yIQOzaoKjBBjSj63/aLVjYE3qhRt5dvM+uUyfCg6UKCBbA==",
-      "dev": true,
       "license": "MIT",
       "dependencies": {
         "@jridgewell/sourcemap-codec": "^1.5.0",
@@ -8459,7 +8223,6 @@
       "version": "2.3.5",
       "resolved": "https://registry.npmjs.org/@jridgewell/remapping/-/remapping-2.3.5.tgz",
       "integrity": "sha512-LI9u/+laYG4Ds1TDKSJW2YPrIlcVYOwi2fUC6xB43lueCjgxV4lffOCZCtYFiH6TNOX+tQKXx97T4IKHbhyHEQ==",
-      "dev": true,
       "license": "MIT",
       "dependencies": {
         "@jridgewell/gen-mapping": "^0.3.5",
@@ -8470,7 +8233,6 @@
       "version": "3.1.2",
       "resolved": "https://registry.npmjs.org/@jridgewell/resolve-uri/-/resolve-uri-3.1.2.tgz",
       "integrity": "sha512-bRISgCIjP20/tbWSPWMEi54QVPRZExkuD9lJL+UIxUKtwVJA8wW1Trb1jMs1RFXo1CBTNZ/5hpC9QvmKWdopKw==",
-      "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=6.0.0"
@@ -8480,14 +8242,12 @@
       "version": "1.5.5",
       "resolved": "https://registry.npmjs.org/@jridgewell/sourcemap-codec/-/sourcemap-codec-1.5.5.tgz",
       "integrity": "sha512-cYQ9310grqxueWbl+WuIUIaiUaDcj7WOq5fVhEljNVgRfOUhY9fy2zTvfoqWsnebh8Sl70VScFbICvJnLKB0Og==",
-      "dev": true,
       "license": "MIT"
     },
     "node_modules/@jridgewell/trace-mapping": {
       "version": "0.3.31",
       "resolved": "https://registry.npmjs.org/@jridgewell/trace-mapping/-/trace-mapping-0.3.31.tgz",
       "integrity": "sha512-zzNR+SdQSDJzc8joaeP8QQoCQr8NuYx2dIIytl1QeBEZHJ9uW6hebsrYgbz8hJwUQao3TWCMtmfV8Nu1twOLAw==",
-      "dev": true,
       "license": "MIT",
       "dependencies": {
         "@jridgewell/resolve-uri": "^3.1.0",
@@ -8610,39 +8370,570 @@
       "integrity": "sha512-CdDwirL0OEaStFue/66ZmFSeppuL6Dwjlk8qk153mSQwiSH/Dlri4GNymrNWnUmPl2Um7QfV1FO9KFUyX3Twww==",
       "license": "MIT",
       "dependencies": {
-        "@lezer/common": "^1.2.0",
-        "@lezer/highlight": "^1.0.0",
-        "@lezer/lr": "^1.0.0"
+        "@lezer/common": "^1.2.0",
+        "@lezer/highlight": "^1.0.0",
+        "@lezer/lr": "^1.0.0"
+      }
+    },
+    "node_modules/@lezer/yaml": {
+      "version": "1.0.4",
+      "resolved": "https://registry.npmjs.org/@lezer/yaml/-/yaml-1.0.4.tgz",
+      "integrity": "sha512-2lrrHqxalACEbxIbsjhqGpSW8kWpUKuY6RHgnSAFZa6qK62wvnPxA8hGOwOoDbwHcOFs5M4o27mjGu+P7TvBmw==",
+      "license": "MIT",
+      "dependencies": {
+        "@lezer/common": "^1.2.0",
+        "@lezer/highlight": "^1.0.0",
+        "@lezer/lr": "^1.4.0"
+      }
+    },
+    "node_modules/@marijn/find-cluster-break": {
+      "version": "1.0.2",
+      "resolved": "https://registry.npmjs.org/@marijn/find-cluster-break/-/find-cluster-break-1.0.2.tgz",
+      "integrity": "sha512-l0h88YhZFyKdXIFNfSWpyjStDjGHwZ/U7iobcK1cQQD8sejsONdQtTVU+1wVN1PBw40PiiHB1vA5S7VTfQiP9g==",
+      "license": "MIT"
+    },
+    "node_modules/@noble/hashes": {
+      "version": "1.8.0",
+      "resolved": "https://registry.npmjs.org/@noble/hashes/-/hashes-1.8.0.tgz",
+      "integrity": "sha512-jCs9ldd7NwzpgXDIf6P3+NrHh9/sD6CQdxHyjQI+h/6rDNo88ypBxxz45UDuZHz9r3tNz7N/VInSVoVdtXEI4A==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": "^14.21.3 || >=16"
+      },
+      "funding": {
+        "url": "https://paulmillr.com/funding/"
+      }
+    },
+    "node_modules/@opentelemetry/api": {
+      "version": "1.9.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/api/-/api-1.9.0.tgz",
+      "integrity": "sha512-3giAOQvZiH5F9bMlMiv8+GSPMeqg0dbaeo58/0SlA9sxSqZhnUtxzX9/2FzyhS9sWQf5S0GJE0AKBrFqjpeYcg==",
+      "license": "Apache-2.0",
+      "peer": true,
+      "engines": {
+        "node": ">=8.0.0"
+      }
+    },
+    "node_modules/@opentelemetry/api-logs": {
+      "version": "0.211.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/api-logs/-/api-logs-0.211.0.tgz",
+      "integrity": "sha512-swFdZq8MCdmdR22jTVGQDhwqDzcI4M10nhjXkLr1EsIzXgZBqm4ZlmmcWsg3TSNf+3mzgOiqveXmBLZuDi2Lgg==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      },
+      "engines": {
+        "node": ">=8.0.0"
+      }
+    },
+    "node_modules/@opentelemetry/context-async-hooks": {
+      "version": "2.5.1",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/context-async-hooks/-/context-async-hooks-2.5.1.tgz",
+      "integrity": "sha512-MHbu8XxCHcBn6RwvCt2Vpn1WnLMNECfNKYB14LI5XypcgH4IE0/DiVifVR9tAkwPMyLXN8dOoPJfya3IryLQVw==",
+      "license": "Apache-2.0",
+      "peer": true,
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": ">=1.0.0 <1.10.0"
+      }
+    },
+    "node_modules/@opentelemetry/core": {
+      "version": "2.5.1",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/core/-/core-2.5.1.tgz",
+      "integrity": "sha512-Dwlc+3HAZqpgTYq0MUyZABjFkcrKTePwuiFVLjahGD8cx3enqihmpAmdgNFO1R4m/sIe5afjJrA25Prqy4NXlA==",
+      "license": "Apache-2.0",
+      "peer": true,
+      "dependencies": {
+        "@opentelemetry/semantic-conventions": "^1.29.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": ">=1.0.0 <1.10.0"
+      }
+    },
+    "node_modules/@opentelemetry/instrumentation": {
+      "version": "0.211.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/instrumentation/-/instrumentation-0.211.0.tgz",
+      "integrity": "sha512-h0nrZEC/zvI994nhg7EgQ8URIHt0uDTwN90r3qQUdZORS455bbx+YebnGeEuFghUT0HlJSrLF4iHw67f+odY+Q==",
+      "license": "Apache-2.0",
+      "peer": true,
+      "dependencies": {
+        "@opentelemetry/api-logs": "0.211.0",
+        "import-in-the-middle": "^2.0.0",
+        "require-in-the-middle": "^8.0.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      }
+    },
+    "node_modules/@opentelemetry/instrumentation-amqplib": {
+      "version": "0.58.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/instrumentation-amqplib/-/instrumentation-amqplib-0.58.0.tgz",
+      "integrity": "sha512-fjpQtH18J6GxzUZ+cwNhWUpb71u+DzT7rFkg5pLssDGaEber91Y2WNGdpVpwGivfEluMlNMZumzjEqfg8DeKXQ==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/core": "^2.0.0",
+        "@opentelemetry/instrumentation": "^0.211.0",
+        "@opentelemetry/semantic-conventions": "^1.33.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      }
+    },
+    "node_modules/@opentelemetry/instrumentation-connect": {
+      "version": "0.54.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/instrumentation-connect/-/instrumentation-connect-0.54.0.tgz",
+      "integrity": "sha512-43RmbhUhqt3uuPnc16cX6NsxEASEtn8z/cYV8Zpt6EP4p2h9s4FNuJ4Q9BbEQ2C0YlCCB/2crO1ruVz/hWt8fA==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/core": "^2.0.0",
+        "@opentelemetry/instrumentation": "^0.211.0",
+        "@opentelemetry/semantic-conventions": "^1.27.0",
+        "@types/connect": "3.4.38"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      }
+    },
+    "node_modules/@opentelemetry/instrumentation-dataloader": {
+      "version": "0.28.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/instrumentation-dataloader/-/instrumentation-dataloader-0.28.0.tgz",
+      "integrity": "sha512-ExXGBp0sUj8yhm6Znhf9jmuOaGDsYfDES3gswZnKr4MCqoBWQdEFn6EoDdt5u+RdbxQER+t43FoUihEfTSqsjA==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/instrumentation": "^0.211.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      }
+    },
+    "node_modules/@opentelemetry/instrumentation-express": {
+      "version": "0.59.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/instrumentation-express/-/instrumentation-express-0.59.0.tgz",
+      "integrity": "sha512-pMKV/qnHiW/Q6pmbKkxt0eIhuNEtvJ7sUAyee192HErlr+a1Jx+FZ3WjfmzhQL1geewyGEiPGkmjjAgNY8TgDA==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/core": "^2.0.0",
+        "@opentelemetry/instrumentation": "^0.211.0",
+        "@opentelemetry/semantic-conventions": "^1.27.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      }
+    },
+    "node_modules/@opentelemetry/instrumentation-fs": {
+      "version": "0.30.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/instrumentation-fs/-/instrumentation-fs-0.30.0.tgz",
+      "integrity": "sha512-n3Cf8YhG7reaj5dncGlRIU7iT40bxPOjsBEA5Bc1a1g6e9Qvb+JFJ7SEiMlPbUw4PBmxE3h40ltE8LZ3zVt6OA==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/core": "^2.0.0",
+        "@opentelemetry/instrumentation": "^0.211.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      }
+    },
+    "node_modules/@opentelemetry/instrumentation-generic-pool": {
+      "version": "0.54.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/instrumentation-generic-pool/-/instrumentation-generic-pool-0.54.0.tgz",
+      "integrity": "sha512-8dXMBzzmEdXfH/wjuRvcJnUFeWzZHUnExkmFJ2uPfa31wmpyBCMxO59yr8f/OXXgSogNgi/uPo9KW9H7LMIZ+g==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/instrumentation": "^0.211.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      }
+    },
+    "node_modules/@opentelemetry/instrumentation-graphql": {
+      "version": "0.58.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/instrumentation-graphql/-/instrumentation-graphql-0.58.0.tgz",
+      "integrity": "sha512-+yWVVY7fxOs3j2RixCbvue8vUuJ1inHxN2q1sduqDB0Wnkr4vOzVKRYl/Zy7B31/dcPS72D9lo/kltdOTBM3bQ==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/instrumentation": "^0.211.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      }
+    },
+    "node_modules/@opentelemetry/instrumentation-hapi": {
+      "version": "0.57.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/instrumentation-hapi/-/instrumentation-hapi-0.57.0.tgz",
+      "integrity": "sha512-Os4THbvls8cTQTVA8ApLfZZztuuqGEeqog0XUnyRW7QVF0d/vOVBEcBCk1pazPFmllXGEdNbbat8e2fYIWdFbw==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/core": "^2.0.0",
+        "@opentelemetry/instrumentation": "^0.211.0",
+        "@opentelemetry/semantic-conventions": "^1.27.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      }
+    },
+    "node_modules/@opentelemetry/instrumentation-http": {
+      "version": "0.211.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/instrumentation-http/-/instrumentation-http-0.211.0.tgz",
+      "integrity": "sha512-n0IaQ6oVll9PP84SjbOCwDjaJasWRHi6BLsbMLiT6tNj7QbVOkuA5sk/EfZczwI0j5uTKl1awQPivO/ldVtsqA==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/core": "2.5.0",
+        "@opentelemetry/instrumentation": "0.211.0",
+        "@opentelemetry/semantic-conventions": "^1.29.0",
+        "forwarded-parse": "2.1.2"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      }
+    },
+    "node_modules/@opentelemetry/instrumentation-http/node_modules/@opentelemetry/core": {
+      "version": "2.5.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/core/-/core-2.5.0.tgz",
+      "integrity": "sha512-ka4H8OM6+DlUhSAZpONu0cPBtPPTQKxbxVzC4CzVx5+K4JnroJVBtDzLAMx4/3CDTJXRvVFhpFjtl4SaiTNoyQ==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/semantic-conventions": "^1.29.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": ">=1.0.0 <1.10.0"
+      }
+    },
+    "node_modules/@opentelemetry/instrumentation-ioredis": {
+      "version": "0.59.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/instrumentation-ioredis/-/instrumentation-ioredis-0.59.0.tgz",
+      "integrity": "sha512-875UxzBHWkW+P4Y45SoFM2AR8f8TzBMD8eO7QXGCyFSCUMP5s9vtt/BS8b/r2kqLyaRPK6mLbdnZznK3XzQWvw==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/instrumentation": "^0.211.0",
+        "@opentelemetry/redis-common": "^0.38.2",
+        "@opentelemetry/semantic-conventions": "^1.33.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      }
+    },
+    "node_modules/@opentelemetry/instrumentation-kafkajs": {
+      "version": "0.20.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/instrumentation-kafkajs/-/instrumentation-kafkajs-0.20.0.tgz",
+      "integrity": "sha512-yJXOuWZROzj7WmYCUiyT27tIfqBrVtl1/TwVbQyWPz7rL0r1Lu7kWjD0PiVeTCIL6CrIZ7M2s8eBxsTAOxbNvw==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/instrumentation": "^0.211.0",
+        "@opentelemetry/semantic-conventions": "^1.30.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      }
+    },
+    "node_modules/@opentelemetry/instrumentation-knex": {
+      "version": "0.55.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/instrumentation-knex/-/instrumentation-knex-0.55.0.tgz",
+      "integrity": "sha512-FtTL5DUx5Ka/8VK6P1VwnlUXPa3nrb7REvm5ddLUIeXXq4tb9pKd+/ThB1xM/IjefkRSN3z8a5t7epYw1JLBJQ==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/instrumentation": "^0.211.0",
+        "@opentelemetry/semantic-conventions": "^1.33.1"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      }
+    },
+    "node_modules/@opentelemetry/instrumentation-koa": {
+      "version": "0.59.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/instrumentation-koa/-/instrumentation-koa-0.59.0.tgz",
+      "integrity": "sha512-K9o2skADV20Skdu5tG2bogPKiSpXh4KxfLjz6FuqIVvDJNibwSdu5UvyyBzRVp1rQMV6UmoIk6d3PyPtJbaGSg==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/core": "^2.0.0",
+        "@opentelemetry/instrumentation": "^0.211.0",
+        "@opentelemetry/semantic-conventions": "^1.36.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.9.0"
+      }
+    },
+    "node_modules/@opentelemetry/instrumentation-lru-memoizer": {
+      "version": "0.55.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/instrumentation-lru-memoizer/-/instrumentation-lru-memoizer-0.55.0.tgz",
+      "integrity": "sha512-FDBfT7yDGcspN0Cxbu/k8A0Pp1Jhv/m7BMTzXGpcb8ENl3tDj/51U65R5lWzUH15GaZA15HQ5A5wtafklxYj7g==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/instrumentation": "^0.211.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      }
+    },
+    "node_modules/@opentelemetry/instrumentation-mongodb": {
+      "version": "0.64.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/instrumentation-mongodb/-/instrumentation-mongodb-0.64.0.tgz",
+      "integrity": "sha512-pFlCJjweTqVp7B220mCvCld1c1eYKZfQt1p3bxSbcReypKLJTwat+wbL2YZoX9jPi5X2O8tTKFEOahO5ehQGsA==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/instrumentation": "^0.211.0",
+        "@opentelemetry/semantic-conventions": "^1.33.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      }
+    },
+    "node_modules/@opentelemetry/instrumentation-mongoose": {
+      "version": "0.57.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/instrumentation-mongoose/-/instrumentation-mongoose-0.57.0.tgz",
+      "integrity": "sha512-MthiekrU/BAJc5JZoZeJmo0OTX6ycJMiP6sMOSRTkvz5BrPMYDqaJos0OgsLPL/HpcgHP7eo5pduETuLguOqcg==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/core": "^2.0.0",
+        "@opentelemetry/instrumentation": "^0.211.0",
+        "@opentelemetry/semantic-conventions": "^1.33.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      }
+    },
+    "node_modules/@opentelemetry/instrumentation-mysql": {
+      "version": "0.57.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/instrumentation-mysql/-/instrumentation-mysql-0.57.0.tgz",
+      "integrity": "sha512-HFS/+FcZ6Q7piM7Il7CzQ4VHhJvGMJWjx7EgCkP5AnTntSN5rb5Xi3TkYJHBKeR27A0QqPlGaCITi93fUDs++Q==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/instrumentation": "^0.211.0",
+        "@opentelemetry/semantic-conventions": "^1.33.0",
+        "@types/mysql": "2.15.27"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      }
+    },
+    "node_modules/@opentelemetry/instrumentation-mysql2": {
+      "version": "0.57.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/instrumentation-mysql2/-/instrumentation-mysql2-0.57.0.tgz",
+      "integrity": "sha512-nHSrYAwF7+aV1E1V9yOOP9TchOodb6fjn4gFvdrdQXiRE7cMuffyLLbCZlZd4wsspBzVwOXX8mpURdRserAhNA==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/instrumentation": "^0.211.0",
+        "@opentelemetry/semantic-conventions": "^1.33.0",
+        "@opentelemetry/sql-common": "^0.41.2"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      }
+    },
+    "node_modules/@opentelemetry/instrumentation-pg": {
+      "version": "0.63.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/instrumentation-pg/-/instrumentation-pg-0.63.0.tgz",
+      "integrity": "sha512-dKm/ODNN3GgIQVlbD6ZPxwRc3kleLf95hrRWXM+l8wYo+vSeXtEpQPT53afEf6VFWDVzJK55VGn8KMLtSve/cg==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/core": "^2.0.0",
+        "@opentelemetry/instrumentation": "^0.211.0",
+        "@opentelemetry/semantic-conventions": "^1.34.0",
+        "@opentelemetry/sql-common": "^0.41.2",
+        "@types/pg": "8.15.6",
+        "@types/pg-pool": "2.0.7"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      }
+    },
+    "node_modules/@opentelemetry/instrumentation-pg/node_modules/@types/pg": {
+      "version": "8.15.6",
+      "resolved": "https://registry.npmjs.org/@types/pg/-/pg-8.15.6.tgz",
+      "integrity": "sha512-NoaMtzhxOrubeL/7UZuNTrejB4MPAJ0RpxZqXQf2qXuVlTPuG6Y8p4u9dKRaue4yjmC7ZhzVO2/Yyyn25znrPQ==",
+      "license": "MIT",
+      "dependencies": {
+        "@types/node": "*",
+        "pg-protocol": "*",
+        "pg-types": "^2.2.0"
+      }
+    },
+    "node_modules/@opentelemetry/instrumentation-redis": {
+      "version": "0.59.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/instrumentation-redis/-/instrumentation-redis-0.59.0.tgz",
+      "integrity": "sha512-JKv1KDDYA2chJ1PC3pLP+Q9ISMQk6h5ey+99mB57/ARk0vQPGZTTEb4h4/JlcEpy7AYT8HIGv7X6l+br03Neeg==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/instrumentation": "^0.211.0",
+        "@opentelemetry/redis-common": "^0.38.2",
+        "@opentelemetry/semantic-conventions": "^1.27.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      }
+    },
+    "node_modules/@opentelemetry/instrumentation-tedious": {
+      "version": "0.30.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/instrumentation-tedious/-/instrumentation-tedious-0.30.0.tgz",
+      "integrity": "sha512-bZy9Q8jFdycKQ2pAsyuHYUHNmCxCOGdG6eg1Mn75RvQDccq832sU5OWOBnc12EFUELI6icJkhR7+EQKMBam2GA==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/instrumentation": "^0.211.0",
+        "@opentelemetry/semantic-conventions": "^1.33.0",
+        "@types/tedious": "^4.0.14"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      }
+    },
+    "node_modules/@opentelemetry/instrumentation-undici": {
+      "version": "0.21.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/instrumentation-undici/-/instrumentation-undici-0.21.0.tgz",
+      "integrity": "sha512-gok0LPUOTz2FQ1YJMZzaHcOzDFyT64XJ8M9rNkugk923/p6lDGms/cRW1cqgqp6N6qcd6K6YdVHwPEhnx9BWbw==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/core": "^2.0.0",
+        "@opentelemetry/instrumentation": "^0.211.0",
+        "@opentelemetry/semantic-conventions": "^1.24.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.7.0"
+      }
+    },
+    "node_modules/@opentelemetry/redis-common": {
+      "version": "0.38.2",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/redis-common/-/redis-common-0.38.2.tgz",
+      "integrity": "sha512-1BCcU93iwSRZvDAgwUxC/DV4T/406SkMfxGqu5ojc3AvNI+I9GhV7v0J1HljsczuuhcnFLYqD5VmwVXfCGHzxA==",
+      "license": "Apache-2.0",
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      }
+    },
+    "node_modules/@opentelemetry/resources": {
+      "version": "2.5.1",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/resources/-/resources-2.5.1.tgz",
+      "integrity": "sha512-BViBCdE/GuXRlp9k7nS1w6wJvY5fnFX5XvuEtWsTAOQFIO89Eru7lGW3WbfbxtCuZ/GbrJfAziXG0w0dpxL7eQ==",
+      "license": "Apache-2.0",
+      "peer": true,
+      "dependencies": {
+        "@opentelemetry/core": "2.5.1",
+        "@opentelemetry/semantic-conventions": "^1.29.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": ">=1.3.0 <1.10.0"
       }
     },
-    "node_modules/@lezer/yaml": {
-      "version": "1.0.4",
-      "resolved": "https://registry.npmjs.org/@lezer/yaml/-/yaml-1.0.4.tgz",
-      "integrity": "sha512-2lrrHqxalACEbxIbsjhqGpSW8kWpUKuY6RHgnSAFZa6qK62wvnPxA8hGOwOoDbwHcOFs5M4o27mjGu+P7TvBmw==",
-      "license": "MIT",
+    "node_modules/@opentelemetry/sdk-trace-base": {
+      "version": "2.5.1",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/sdk-trace-base/-/sdk-trace-base-2.5.1.tgz",
+      "integrity": "sha512-iZH3Gw8cxQn0gjpOjJMmKLd9GIaNh/E3v3ST67vyzLSxHBs14HsG4dy7jMYyC5WXGdBVEcM7U/XTF5hCQxjDMw==",
+      "license": "Apache-2.0",
+      "peer": true,
       "dependencies": {
-        "@lezer/common": "^1.2.0",
-        "@lezer/highlight": "^1.0.0",
-        "@lezer/lr": "^1.4.0"
+        "@opentelemetry/core": "2.5.1",
+        "@opentelemetry/resources": "2.5.1",
+        "@opentelemetry/semantic-conventions": "^1.29.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": ">=1.3.0 <1.10.0"
       }
     },
-    "node_modules/@marijn/find-cluster-break": {
-      "version": "1.0.2",
-      "resolved": "https://registry.npmjs.org/@marijn/find-cluster-break/-/find-cluster-break-1.0.2.tgz",
-      "integrity": "sha512-l0h88YhZFyKdXIFNfSWpyjStDjGHwZ/U7iobcK1cQQD8sejsONdQtTVU+1wVN1PBw40PiiHB1vA5S7VTfQiP9g==",
-      "license": "MIT"
+    "node_modules/@opentelemetry/semantic-conventions": {
+      "version": "1.39.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/semantic-conventions/-/semantic-conventions-1.39.0.tgz",
+      "integrity": "sha512-R5R9tb2AXs2IRLNKLBJDynhkfmx7mX0vi8NkhZb3gUkPWHn6HXk5J8iQ/dql0U3ApfWym4kXXmBDRGO+oeOfjg==",
+      "license": "Apache-2.0",
+      "peer": true,
+      "engines": {
+        "node": ">=14"
+      }
     },
-    "node_modules/@noble/hashes": {
-      "version": "1.8.0",
-      "resolved": "https://registry.npmjs.org/@noble/hashes/-/hashes-1.8.0.tgz",
-      "integrity": "sha512-jCs9ldd7NwzpgXDIf6P3+NrHh9/sD6CQdxHyjQI+h/6rDNo88ypBxxz45UDuZHz9r3tNz7N/VInSVoVdtXEI4A==",
-      "dev": true,
-      "license": "MIT",
+    "node_modules/@opentelemetry/sql-common": {
+      "version": "0.41.2",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/sql-common/-/sql-common-0.41.2.tgz",
+      "integrity": "sha512-4mhWm3Z8z+i508zQJ7r6Xi7y4mmoJpdvH0fZPFRkWrdp5fq7hhZ2HhYokEOLkfqSMgPR4Z9EyB3DBkbKGOqZiQ==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/core": "^2.0.0"
+      },
       "engines": {
-        "node": "^14.21.3 || >=16"
+        "node": "^18.19.0 || >=20.6.0"
       },
-      "funding": {
-        "url": "https://paulmillr.com/funding/"
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.1.0"
       }
     },
     "node_modules/@paralleldrive/cuid2": {
@@ -8664,6 +8955,57 @@
         "node": ">=10"
       }
     },
+    "node_modules/@pkgjs/parseargs": {
+      "version": "0.11.0",
+      "resolved": "https://registry.npmjs.org/@pkgjs/parseargs/-/parseargs-0.11.0.tgz",
+      "integrity": "sha512-+1VkjdD0QBLPodGrJUeqarH8VAIvQODIbwh9XpP5Syisf7YoQgsJKPNFoqqLQlu+VQ/tVSshMR6loPMn8U+dPg==",
+      "license": "MIT",
+      "optional": true,
+      "engines": {
+        "node": ">=14"
+      }
+    },
+    "node_modules/@prisma/instrumentation": {
+      "version": "7.2.0",
+      "resolved": "https://registry.npmjs.org/@prisma/instrumentation/-/instrumentation-7.2.0.tgz",
+      "integrity": "sha512-Rh9Z4x5kEj1OdARd7U18AtVrnL6rmLSI0qYShaB4W7Wx5BKbgzndWF+QnuzMb7GLfVdlT5aYCXoPQVYuYtVu0g==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/instrumentation": "^0.207.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.8"
+      }
+    },
+    "node_modules/@prisma/instrumentation/node_modules/@opentelemetry/api-logs": {
+      "version": "0.207.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/api-logs/-/api-logs-0.207.0.tgz",
+      "integrity": "sha512-lAb0jQRVyleQQGiuuvCOTDVspc14nx6XJjP4FspJ1sNARo3Regq4ZZbrc3rN4b1TYSuUCvgH+UXUPug4SLOqEQ==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      },
+      "engines": {
+        "node": ">=8.0.0"
+      }
+    },
+    "node_modules/@prisma/instrumentation/node_modules/@opentelemetry/instrumentation": {
+      "version": "0.207.0",
+      "resolved": "https://registry.npmjs.org/@opentelemetry/instrumentation/-/instrumentation-0.207.0.tgz",
+      "integrity": "sha512-y6eeli9+TLKnznrR8AZlQMSJT7wILpXH+6EYq5Vf/4Ao+huI7EedxQHwRgVUOMLFbe7VFDvHJrX9/f4lcwnJsA==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "@opentelemetry/api-logs": "0.207.0",
+        "import-in-the-middle": "^2.0.0",
+        "require-in-the-middle": "^8.0.0"
+      },
+      "engines": {
+        "node": "^18.19.0 || >=20.6.0"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.3.0"
+      }
+    },
     "node_modules/@protobufjs/aspromise": {
       "version": "1.1.2",
       "resolved": "https://registry.npmjs.org/@protobufjs/aspromise/-/aspromise-1.1.2.tgz",
@@ -10682,112 +11024,559 @@
       "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-x64-gnu/-/rollup-linux-x64-gnu-4.57.1.tgz",
       "integrity": "sha512-ABca4ceT4N+Tv/GtotnWAeXZUZuM/9AQyCyKYyKnpk4yoA7QIAuBt6Hkgpw8kActYlew2mvckXkvx0FfoInnLg==",
       "cpu": [
-        "x64"
+        "x64"
+      ],
+      "dev": true,
+      "license": "MIT",
+      "optional": true,
+      "os": [
+        "linux"
+      ]
+    },
+    "node_modules/@rollup/rollup-linux-x64-musl": {
+      "version": "4.57.1",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-x64-musl/-/rollup-linux-x64-musl-4.57.1.tgz",
+      "integrity": "sha512-HFps0JeGtuOR2convgRRkHCekD7j+gdAuXM+/i6kGzQtFhlCtQkpwtNzkNj6QhCDp7DRJ7+qC/1Vg2jt5iSOFw==",
+      "cpu": [
+        "x64"
+      ],
+      "dev": true,
+      "license": "MIT",
+      "optional": true,
+      "os": [
+        "linux"
+      ]
+    },
+    "node_modules/@rollup/rollup-openbsd-x64": {
+      "version": "4.57.1",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-openbsd-x64/-/rollup-openbsd-x64-4.57.1.tgz",
+      "integrity": "sha512-H+hXEv9gdVQuDTgnqD+SQffoWoc0Of59AStSzTEj/feWTBAnSfSD3+Dql1ZruJQxmykT/JVY0dE8Ka7z0DH1hw==",
+      "cpu": [
+        "x64"
+      ],
+      "dev": true,
+      "license": "MIT",
+      "optional": true,
+      "os": [
+        "openbsd"
+      ]
+    },
+    "node_modules/@rollup/rollup-openharmony-arm64": {
+      "version": "4.57.1",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-openharmony-arm64/-/rollup-openharmony-arm64-4.57.1.tgz",
+      "integrity": "sha512-4wYoDpNg6o/oPximyc/NG+mYUejZrCU2q+2w6YZqrAs2UcNUChIZXjtafAiiZSUc7On8v5NyNj34Kzj/Ltk6dQ==",
+      "cpu": [
+        "arm64"
+      ],
+      "dev": true,
+      "license": "MIT",
+      "optional": true,
+      "os": [
+        "openharmony"
+      ]
+    },
+    "node_modules/@rollup/rollup-win32-arm64-msvc": {
+      "version": "4.57.1",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-win32-arm64-msvc/-/rollup-win32-arm64-msvc-4.57.1.tgz",
+      "integrity": "sha512-O54mtsV/6LW3P8qdTcamQmuC990HDfR71lo44oZMZlXU4tzLrbvTii87Ni9opq60ds0YzuAlEr/GNwuNluZyMQ==",
+      "cpu": [
+        "arm64"
+      ],
+      "dev": true,
+      "license": "MIT",
+      "optional": true,
+      "os": [
+        "win32"
+      ]
+    },
+    "node_modules/@rollup/rollup-win32-ia32-msvc": {
+      "version": "4.57.1",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-win32-ia32-msvc/-/rollup-win32-ia32-msvc-4.57.1.tgz",
+      "integrity": "sha512-P3dLS+IerxCT/7D2q2FYcRdWRl22dNbrbBEtxdWhXrfIMPP9lQhb5h4Du04mdl5Woq05jVCDPCMF7Ub0NAjIew==",
+      "cpu": [
+        "ia32"
+      ],
+      "dev": true,
+      "license": "MIT",
+      "optional": true,
+      "os": [
+        "win32"
+      ]
+    },
+    "node_modules/@rollup/rollup-win32-x64-gnu": {
+      "version": "4.57.1",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-win32-x64-gnu/-/rollup-win32-x64-gnu-4.57.1.tgz",
+      "integrity": "sha512-VMBH2eOOaKGtIJYleXsi2B8CPVADrh+TyNxJ4mWPnKfLB/DBUmzW+5m1xUrcwWoMfSLagIRpjUFeW5CO5hyciQ==",
+      "cpu": [
+        "x64"
+      ],
+      "dev": true,
+      "license": "MIT",
+      "optional": true,
+      "os": [
+        "win32"
+      ]
+    },
+    "node_modules/@rollup/rollup-win32-x64-msvc": {
+      "version": "4.57.1",
+      "resolved": "https://registry.npmjs.org/@rollup/rollup-win32-x64-msvc/-/rollup-win32-x64-msvc-4.57.1.tgz",
+      "integrity": "sha512-mxRFDdHIWRxg3UfIIAwCm6NzvxG0jDX/wBN6KsQFTvKFqqg9vTrWUE68qEjHt19A5wwx5X5aUi2zuZT7YR0jrA==",
+      "cpu": [
+        "x64"
+      ],
+      "dev": true,
+      "license": "MIT",
+      "optional": true,
+      "os": [
+        "win32"
+      ]
+    },
+    "node_modules/@sentry-internal/browser-utils": {
+      "version": "10.38.0",
+      "resolved": "https://registry.npmjs.org/@sentry-internal/browser-utils/-/browser-utils-10.38.0.tgz",
+      "integrity": "sha512-UOJtYmdcxHCcV0NPfXFff/a95iXl/E0EhuQ1y0uE0BuZDMupWSF5t2BgC4HaE5Aw3RTjDF3XkSHWoIF6ohy7eA==",
+      "license": "MIT",
+      "dependencies": {
+        "@sentry/core": "10.38.0"
+      },
+      "engines": {
+        "node": ">=18"
+      }
+    },
+    "node_modules/@sentry-internal/feedback": {
+      "version": "10.38.0",
+      "resolved": "https://registry.npmjs.org/@sentry-internal/feedback/-/feedback-10.38.0.tgz",
+      "integrity": "sha512-JXneg9zRftyfy1Fyfc39bBlF/Qd8g4UDublFFkVvdc1S6JQPlK+P6q22DKz3Pc8w3ySby+xlIq/eTu9Pzqi4KA==",
+      "license": "MIT",
+      "dependencies": {
+        "@sentry/core": "10.38.0"
+      },
+      "engines": {
+        "node": ">=18"
+      }
+    },
+    "node_modules/@sentry-internal/replay": {
+      "version": "10.38.0",
+      "resolved": "https://registry.npmjs.org/@sentry-internal/replay/-/replay-10.38.0.tgz",
+      "integrity": "sha512-YWIkL6/dnaiQyFiZXJ/nN+NXGv/15z45ia86bE/TMq01CubX/DUOilgsFz0pk2v/pg3tp/U2MskLO9Hz0cnqeg==",
+      "license": "MIT",
+      "dependencies": {
+        "@sentry-internal/browser-utils": "10.38.0",
+        "@sentry/core": "10.38.0"
+      },
+      "engines": {
+        "node": ">=18"
+      }
+    },
+    "node_modules/@sentry-internal/replay-canvas": {
+      "version": "10.38.0",
+      "resolved": "https://registry.npmjs.org/@sentry-internal/replay-canvas/-/replay-canvas-10.38.0.tgz",
+      "integrity": "sha512-OXWM9jEqNYh4VTvrMu7v+z1anz+QKQ/fZXIZdsO7JTT2lGNZe58UUMeoq386M+Saxen8F9SUH7yTORy/8KI5qw==",
+      "license": "MIT",
+      "dependencies": {
+        "@sentry-internal/replay": "10.38.0",
+        "@sentry/core": "10.38.0"
+      },
+      "engines": {
+        "node": ">=18"
+      }
+    },
+    "node_modules/@sentry/babel-plugin-component-annotate": {
+      "version": "4.9.1",
+      "resolved": "https://registry.npmjs.org/@sentry/babel-plugin-component-annotate/-/babel-plugin-component-annotate-4.9.1.tgz",
+      "integrity": "sha512-0gEoi2Lb54MFYPOmdTfxlNKxI7kCOvNV7gP8lxMXJ7nCazF5OqOOZIVshfWjDLrc0QrSV6XdVvwPV9GDn4wBMg==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 14"
+      }
+    },
+    "node_modules/@sentry/browser": {
+      "version": "10.38.0",
+      "resolved": "https://registry.npmjs.org/@sentry/browser/-/browser-10.38.0.tgz",
+      "integrity": "sha512-3phzp1YX4wcQr9mocGWKbjv0jwtuoDBv7+Y6Yfrys/kwyaL84mDLjjQhRf4gL5SX7JdYkhBp4WaiNlR0UC4kTA==",
+      "license": "MIT",
+      "dependencies": {
+        "@sentry-internal/browser-utils": "10.38.0",
+        "@sentry-internal/feedback": "10.38.0",
+        "@sentry-internal/replay": "10.38.0",
+        "@sentry-internal/replay-canvas": "10.38.0",
+        "@sentry/core": "10.38.0"
+      },
+      "engines": {
+        "node": ">=18"
+      }
+    },
+    "node_modules/@sentry/bundler-plugin-core": {
+      "version": "4.9.1",
+      "resolved": "https://registry.npmjs.org/@sentry/bundler-plugin-core/-/bundler-plugin-core-4.9.1.tgz",
+      "integrity": "sha512-moii+w7N8k8WdvkX7qCDY9iRBlhgHlhTHTUQwF2FNMhBHuqlNpVcSJJqJMjFUQcjYMBDrZgxhfKV18bt5ixwlQ==",
+      "license": "MIT",
+      "dependencies": {
+        "@babel/core": "^7.18.5",
+        "@sentry/babel-plugin-component-annotate": "4.9.1",
+        "@sentry/cli": "^2.57.0",
+        "dotenv": "^16.3.1",
+        "find-up": "^5.0.0",
+        "glob": "^10.5.0",
+        "magic-string": "0.30.8",
+        "unplugin": "1.0.1"
+      },
+      "engines": {
+        "node": ">= 14"
+      }
+    },
+    "node_modules/@sentry/bundler-plugin-core/node_modules/magic-string": {
+      "version": "0.30.8",
+      "resolved": "https://registry.npmjs.org/magic-string/-/magic-string-0.30.8.tgz",
+      "integrity": "sha512-ISQTe55T2ao7XtlAStud6qwYPZjE4GK1S/BeVPus4jrq6JuOnQ00YKQC581RWhR122W7msZV263KzVeLoqidyQ==",
+      "license": "MIT",
+      "dependencies": {
+        "@jridgewell/sourcemap-codec": "^1.4.15"
+      },
+      "engines": {
+        "node": ">=12"
+      }
+    },
+    "node_modules/@sentry/cli": {
+      "version": "2.58.4",
+      "resolved": "https://registry.npmjs.org/@sentry/cli/-/cli-2.58.4.tgz",
+      "integrity": "sha512-ArDrpuS8JtDYEvwGleVE+FgR+qHaOp77IgdGSacz6SZy6Lv90uX0Nu4UrHCQJz8/xwIcNxSqnN22lq0dH4IqTg==",
+      "hasInstallScript": true,
+      "license": "FSL-1.1-MIT",
+      "dependencies": {
+        "https-proxy-agent": "^5.0.0",
+        "node-fetch": "^2.6.7",
+        "progress": "^2.0.3",
+        "proxy-from-env": "^1.1.0",
+        "which": "^2.0.2"
+      },
+      "bin": {
+        "sentry-cli": "bin/sentry-cli"
+      },
+      "engines": {
+        "node": ">= 10"
+      },
+      "optionalDependencies": {
+        "@sentry/cli-darwin": "2.58.4",
+        "@sentry/cli-linux-arm": "2.58.4",
+        "@sentry/cli-linux-arm64": "2.58.4",
+        "@sentry/cli-linux-i686": "2.58.4",
+        "@sentry/cli-linux-x64": "2.58.4",
+        "@sentry/cli-win32-arm64": "2.58.4",
+        "@sentry/cli-win32-i686": "2.58.4",
+        "@sentry/cli-win32-x64": "2.58.4"
+      }
+    },
+    "node_modules/@sentry/cli-darwin": {
+      "version": "2.58.4",
+      "resolved": "https://registry.npmjs.org/@sentry/cli-darwin/-/cli-darwin-2.58.4.tgz",
+      "integrity": "sha512-kbTD+P4X8O+nsNwPxCywtj3q22ecyRHWff98rdcmtRrvwz8CKi/T4Jxn/fnn2i4VEchy08OWBuZAqaA5Kh2hRQ==",
+      "license": "FSL-1.1-MIT",
+      "optional": true,
+      "os": [
+        "darwin"
+      ],
+      "engines": {
+        "node": ">=10"
+      }
+    },
+    "node_modules/@sentry/cli-linux-arm": {
+      "version": "2.58.4",
+      "resolved": "https://registry.npmjs.org/@sentry/cli-linux-arm/-/cli-linux-arm-2.58.4.tgz",
+      "integrity": "sha512-rdQ8beTwnN48hv7iV7e7ZKucPec5NJkRdrrycMJMZlzGBPi56LqnclgsHySJ6Kfq506A2MNuQnKGaf/sBC9REA==",
+      "cpu": [
+        "arm"
       ],
-      "dev": true,
-      "license": "MIT",
+      "license": "FSL-1.1-MIT",
       "optional": true,
       "os": [
-        "linux"
-      ]
+        "linux",
+        "freebsd",
+        "android"
+      ],
+      "engines": {
+        "node": ">=10"
+      }
     },
-    "node_modules/@rollup/rollup-linux-x64-musl": {
-      "version": "4.57.1",
-      "resolved": "https://registry.npmjs.org/@rollup/rollup-linux-x64-musl/-/rollup-linux-x64-musl-4.57.1.tgz",
-      "integrity": "sha512-HFps0JeGtuOR2convgRRkHCekD7j+gdAuXM+/i6kGzQtFhlCtQkpwtNzkNj6QhCDp7DRJ7+qC/1Vg2jt5iSOFw==",
+    "node_modules/@sentry/cli-linux-arm64": {
+      "version": "2.58.4",
+      "resolved": "https://registry.npmjs.org/@sentry/cli-linux-arm64/-/cli-linux-arm64-2.58.4.tgz",
+      "integrity": "sha512-0g0KwsOozkLtzN8/0+oMZoOuQ0o7W6O+hx+ydVU1bktaMGKEJLMAWxOQNjsh1TcBbNIXVOKM/I8l0ROhaAb8Ig==",
       "cpu": [
-        "x64"
+        "arm64"
       ],
-      "dev": true,
-      "license": "MIT",
+      "license": "FSL-1.1-MIT",
       "optional": true,
       "os": [
-        "linux"
-      ]
+        "linux",
+        "freebsd",
+        "android"
+      ],
+      "engines": {
+        "node": ">=10"
+      }
     },
-    "node_modules/@rollup/rollup-openbsd-x64": {
-      "version": "4.57.1",
-      "resolved": "https://registry.npmjs.org/@rollup/rollup-openbsd-x64/-/rollup-openbsd-x64-4.57.1.tgz",
-      "integrity": "sha512-H+hXEv9gdVQuDTgnqD+SQffoWoc0Of59AStSzTEj/feWTBAnSfSD3+Dql1ZruJQxmykT/JVY0dE8Ka7z0DH1hw==",
+    "node_modules/@sentry/cli-linux-i686": {
+      "version": "2.58.4",
+      "resolved": "https://registry.npmjs.org/@sentry/cli-linux-i686/-/cli-linux-i686-2.58.4.tgz",
+      "integrity": "sha512-NseoIQAFtkziHyjZNPTu1Gm1opeQHt7Wm1LbLrGWVIRvUOzlslO9/8i6wETUZ6TjlQxBVRgd3Q0lRBG2A8rFYA==",
       "cpu": [
-        "x64"
+        "x86",
+        "ia32"
       ],
-      "dev": true,
-      "license": "MIT",
+      "license": "FSL-1.1-MIT",
       "optional": true,
       "os": [
-        "openbsd"
-      ]
+        "linux",
+        "freebsd",
+        "android"
+      ],
+      "engines": {
+        "node": ">=10"
+      }
     },
-    "node_modules/@rollup/rollup-openharmony-arm64": {
-      "version": "4.57.1",
-      "resolved": "https://registry.npmjs.org/@rollup/rollup-openharmony-arm64/-/rollup-openharmony-arm64-4.57.1.tgz",
-      "integrity": "sha512-4wYoDpNg6o/oPximyc/NG+mYUejZrCU2q+2w6YZqrAs2UcNUChIZXjtafAiiZSUc7On8v5NyNj34Kzj/Ltk6dQ==",
+    "node_modules/@sentry/cli-linux-x64": {
+      "version": "2.58.4",
+      "resolved": "https://registry.npmjs.org/@sentry/cli-linux-x64/-/cli-linux-x64-2.58.4.tgz",
+      "integrity": "sha512-d3Arz+OO/wJYTqCYlSN3Ktm+W8rynQ/IMtSZLK8nu0ryh5mJOh+9XlXY6oDXw4YlsM8qCRrNquR8iEI1Y/IH+Q==",
       "cpu": [
-        "arm64"
+        "x64"
       ],
-      "dev": true,
-      "license": "MIT",
+      "license": "FSL-1.1-MIT",
       "optional": true,
       "os": [
-        "openharmony"
-      ]
+        "linux",
+        "freebsd",
+        "android"
+      ],
+      "engines": {
+        "node": ">=10"
+      }
     },
-    "node_modules/@rollup/rollup-win32-arm64-msvc": {
-      "version": "4.57.1",
-      "resolved": "https://registry.npmjs.org/@rollup/rollup-win32-arm64-msvc/-/rollup-win32-arm64-msvc-4.57.1.tgz",
-      "integrity": "sha512-O54mtsV/6LW3P8qdTcamQmuC990HDfR71lo44oZMZlXU4tzLrbvTii87Ni9opq60ds0YzuAlEr/GNwuNluZyMQ==",
+    "node_modules/@sentry/cli-win32-arm64": {
+      "version": "2.58.4",
+      "resolved": "https://registry.npmjs.org/@sentry/cli-win32-arm64/-/cli-win32-arm64-2.58.4.tgz",
+      "integrity": "sha512-bqYrF43+jXdDBh0f8HIJU3tbvlOFtGyRjHB8AoRuMQv9TEDUfENZyCelhdjA+KwDKYl48R1Yasb4EHNzsoO83w==",
       "cpu": [
         "arm64"
       ],
-      "dev": true,
-      "license": "MIT",
+      "license": "FSL-1.1-MIT",
       "optional": true,
       "os": [
         "win32"
-      ]
+      ],
+      "engines": {
+        "node": ">=10"
+      }
     },
-    "node_modules/@rollup/rollup-win32-ia32-msvc": {
-      "version": "4.57.1",
-      "resolved": "https://registry.npmjs.org/@rollup/rollup-win32-ia32-msvc/-/rollup-win32-ia32-msvc-4.57.1.tgz",
-      "integrity": "sha512-P3dLS+IerxCT/7D2q2FYcRdWRl22dNbrbBEtxdWhXrfIMPP9lQhb5h4Du04mdl5Woq05jVCDPCMF7Ub0NAjIew==",
+    "node_modules/@sentry/cli-win32-i686": {
+      "version": "2.58.4",
+      "resolved": "https://registry.npmjs.org/@sentry/cli-win32-i686/-/cli-win32-i686-2.58.4.tgz",
+      "integrity": "sha512-3triFD6jyvhVcXOmGyttf+deKZcC1tURdhnmDUIBkiDPJKGT/N5xa4qAtHJlAB/h8L9jgYih9bvJnvvFVM7yug==",
       "cpu": [
+        "x86",
         "ia32"
       ],
-      "dev": true,
-      "license": "MIT",
+      "license": "FSL-1.1-MIT",
       "optional": true,
       "os": [
         "win32"
-      ]
+      ],
+      "engines": {
+        "node": ">=10"
+      }
     },
-    "node_modules/@rollup/rollup-win32-x64-gnu": {
-      "version": "4.57.1",
-      "resolved": "https://registry.npmjs.org/@rollup/rollup-win32-x64-gnu/-/rollup-win32-x64-gnu-4.57.1.tgz",
-      "integrity": "sha512-VMBH2eOOaKGtIJYleXsi2B8CPVADrh+TyNxJ4mWPnKfLB/DBUmzW+5m1xUrcwWoMfSLagIRpjUFeW5CO5hyciQ==",
+    "node_modules/@sentry/cli-win32-x64": {
+      "version": "2.58.4",
+      "resolved": "https://registry.npmjs.org/@sentry/cli-win32-x64/-/cli-win32-x64-2.58.4.tgz",
+      "integrity": "sha512-cSzN4PjM1RsCZ4pxMjI0VI7yNCkxiJ5jmWncyiwHXGiXrV1eXYdQ3n1LhUYLZ91CafyprR0OhDcE+RVZ26Qb5w==",
       "cpu": [
         "x64"
       ],
-      "dev": true,
-      "license": "MIT",
+      "license": "FSL-1.1-MIT",
       "optional": true,
       "os": [
         "win32"
-      ]
-    },
-    "node_modules/@rollup/rollup-win32-x64-msvc": {
-      "version": "4.57.1",
-      "resolved": "https://registry.npmjs.org/@rollup/rollup-win32-x64-msvc/-/rollup-win32-x64-msvc-4.57.1.tgz",
-      "integrity": "sha512-mxRFDdHIWRxg3UfIIAwCm6NzvxG0jDX/wBN6KsQFTvKFqqg9vTrWUE68qEjHt19A5wwx5X5aUi2zuZT7YR0jrA==",
-      "cpu": [
-        "x64"
       ],
-      "dev": true,
+      "engines": {
+        "node": ">=10"
+      }
+    },
+    "node_modules/@sentry/cli/node_modules/agent-base": {
+      "version": "6.0.2",
+      "resolved": "https://registry.npmjs.org/agent-base/-/agent-base-6.0.2.tgz",
+      "integrity": "sha512-RZNwNclF7+MS/8bDg70amg32dyeZGZxiDuQmZxKLAlQjr3jGyLx+4Kkk58UO7D2QdgFIQCovuSuZESne6RG6XQ==",
       "license": "MIT",
-      "optional": true,
-      "os": [
-        "win32"
-      ]
+      "dependencies": {
+        "debug": "4"
+      },
+      "engines": {
+        "node": ">= 6.0.0"
+      }
+    },
+    "node_modules/@sentry/cli/node_modules/https-proxy-agent": {
+      "version": "5.0.1",
+      "resolved": "https://registry.npmjs.org/https-proxy-agent/-/https-proxy-agent-5.0.1.tgz",
+      "integrity": "sha512-dFcAjpTQFgoLMzC2VwU+C/CbS7uRL0lWmxDITmqm7C+7F0Odmj6s9l6alZc6AELXhrnggM2CeWSXHGOdX2YtwA==",
+      "license": "MIT",
+      "dependencies": {
+        "agent-base": "6",
+        "debug": "4"
+      },
+      "engines": {
+        "node": ">= 6"
+      }
+    },
+    "node_modules/@sentry/core": {
+      "version": "10.38.0",
+      "resolved": "https://registry.npmjs.org/@sentry/core/-/core-10.38.0.tgz",
+      "integrity": "sha512-1pubWDZE5y5HZEPMAZERP4fVl2NH3Ihp1A+vMoVkb3Qc66Diqj1WierAnStlZP7tCx0TBa0dK85GTW/ZFYyB9g==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=18"
+      }
+    },
+    "node_modules/@sentry/node": {
+      "version": "10.38.0",
+      "resolved": "https://registry.npmjs.org/@sentry/node/-/node-10.38.0.tgz",
+      "integrity": "sha512-wriyDtWDAoatn8EhOj0U4PJR1WufiijTsCGALqakOHbFiadtBJANLe6aSkXoXT4tegw59cz1wY4NlzHjYksaPw==",
+      "license": "MIT",
+      "dependencies": {
+        "@opentelemetry/api": "^1.9.0",
+        "@opentelemetry/context-async-hooks": "^2.5.0",
+        "@opentelemetry/core": "^2.5.0",
+        "@opentelemetry/instrumentation": "^0.211.0",
+        "@opentelemetry/instrumentation-amqplib": "0.58.0",
+        "@opentelemetry/instrumentation-connect": "0.54.0",
+        "@opentelemetry/instrumentation-dataloader": "0.28.0",
+        "@opentelemetry/instrumentation-express": "0.59.0",
+        "@opentelemetry/instrumentation-fs": "0.30.0",
+        "@opentelemetry/instrumentation-generic-pool": "0.54.0",
+        "@opentelemetry/instrumentation-graphql": "0.58.0",
+        "@opentelemetry/instrumentation-hapi": "0.57.0",
+        "@opentelemetry/instrumentation-http": "0.211.0",
+        "@opentelemetry/instrumentation-ioredis": "0.59.0",
+        "@opentelemetry/instrumentation-kafkajs": "0.20.0",
+        "@opentelemetry/instrumentation-knex": "0.55.0",
+        "@opentelemetry/instrumentation-koa": "0.59.0",
+        "@opentelemetry/instrumentation-lru-memoizer": "0.55.0",
+        "@opentelemetry/instrumentation-mongodb": "0.64.0",
+        "@opentelemetry/instrumentation-mongoose": "0.57.0",
+        "@opentelemetry/instrumentation-mysql": "0.57.0",
+        "@opentelemetry/instrumentation-mysql2": "0.57.0",
+        "@opentelemetry/instrumentation-pg": "0.63.0",
+        "@opentelemetry/instrumentation-redis": "0.59.0",
+        "@opentelemetry/instrumentation-tedious": "0.30.0",
+        "@opentelemetry/instrumentation-undici": "0.21.0",
+        "@opentelemetry/resources": "^2.5.0",
+        "@opentelemetry/sdk-trace-base": "^2.5.0",
+        "@opentelemetry/semantic-conventions": "^1.39.0",
+        "@prisma/instrumentation": "7.2.0",
+        "@sentry/core": "10.38.0",
+        "@sentry/node-core": "10.38.0",
+        "@sentry/opentelemetry": "10.38.0",
+        "import-in-the-middle": "^2.0.6",
+        "minimatch": "^9.0.0"
+      },
+      "engines": {
+        "node": ">=18"
+      }
+    },
+    "node_modules/@sentry/node-core": {
+      "version": "10.38.0",
+      "resolved": "https://registry.npmjs.org/@sentry/node-core/-/node-core-10.38.0.tgz",
+      "integrity": "sha512-ErXtpedrY1HghgwM6AliilZPcUCoNNP1NThdO4YpeMq04wMX9/GMmFCu46TnCcg6b7IFIOSr2S4yD086PxLlHQ==",
+      "license": "MIT",
+      "dependencies": {
+        "@apm-js-collab/tracing-hooks": "^0.3.1",
+        "@sentry/core": "10.38.0",
+        "@sentry/opentelemetry": "10.38.0",
+        "import-in-the-middle": "^2.0.6"
+      },
+      "engines": {
+        "node": ">=18"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.9.0",
+        "@opentelemetry/context-async-hooks": "^1.30.1 || ^2.1.0",
+        "@opentelemetry/core": "^1.30.1 || ^2.1.0",
+        "@opentelemetry/instrumentation": ">=0.57.1 <1",
+        "@opentelemetry/resources": "^1.30.1 || ^2.1.0",
+        "@opentelemetry/sdk-trace-base": "^1.30.1 || ^2.1.0",
+        "@opentelemetry/semantic-conventions": "^1.39.0"
+      }
+    },
+    "node_modules/@sentry/node/node_modules/brace-expansion": {
+      "version": "2.0.2",
+      "resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-2.0.2.tgz",
+      "integrity": "sha512-Jt0vHyM+jmUBqojB7E1NIYadt0vI0Qxjxd2TErW94wDz+E2LAm5vKMXXwg6ZZBTHPuUlDgQHKXvjGBdfcF1ZDQ==",
+      "license": "MIT",
+      "dependencies": {
+        "balanced-match": "^1.0.0"
+      }
+    },
+    "node_modules/@sentry/node/node_modules/minimatch": {
+      "version": "9.0.5",
+      "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-9.0.5.tgz",
+      "integrity": "sha512-G6T0ZX48xgozx7587koeX9Ys2NYy6Gmv//P89sEte9V9whIapMNF4idKxnW2QtCcLiTWlb/wfCabAtAFWhhBow==",
+      "license": "ISC",
+      "dependencies": {
+        "brace-expansion": "^2.0.1"
+      },
+      "engines": {
+        "node": ">=16 || 14 >=14.17"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/isaacs"
+      }
+    },
+    "node_modules/@sentry/opentelemetry": {
+      "version": "10.38.0",
+      "resolved": "https://registry.npmjs.org/@sentry/opentelemetry/-/opentelemetry-10.38.0.tgz",
+      "integrity": "sha512-YPVhWfYmC7nD3EJqEHGtjp4fp5LwtAbE5rt9egQ4hqJlYFvr8YEz9sdoqSZxO0cZzgs2v97HFl/nmWAXe52G2Q==",
+      "license": "MIT",
+      "dependencies": {
+        "@sentry/core": "10.38.0"
+      },
+      "engines": {
+        "node": ">=18"
+      },
+      "peerDependencies": {
+        "@opentelemetry/api": "^1.9.0",
+        "@opentelemetry/context-async-hooks": "^1.30.1 || ^2.1.0",
+        "@opentelemetry/core": "^1.30.1 || ^2.1.0",
+        "@opentelemetry/sdk-trace-base": "^1.30.1 || ^2.1.0",
+        "@opentelemetry/semantic-conventions": "^1.39.0"
+      }
+    },
+    "node_modules/@sentry/react": {
+      "version": "10.38.0",
+      "resolved": "https://registry.npmjs.org/@sentry/react/-/react-10.38.0.tgz",
+      "integrity": "sha512-3UiKo6QsqTyPGUt0XWRY9KLaxc/cs6Kz4vlldBSOXEL6qPDL/EfpwNJT61osRo81VFWu8pKu7ZY2bvLPryrnBQ==",
+      "license": "MIT",
+      "dependencies": {
+        "@sentry/browser": "10.38.0",
+        "@sentry/core": "10.38.0"
+      },
+      "engines": {
+        "node": ">=18"
+      },
+      "peerDependencies": {
+        "react": "^16.14.0 || 17.x || 18.x || 19.x"
+      }
+    },
+    "node_modules/@sentry/vite-plugin": {
+      "version": "4.9.1",
+      "resolved": "https://registry.npmjs.org/@sentry/vite-plugin/-/vite-plugin-4.9.1.tgz",
+      "integrity": "sha512-Tlyg2cyFYp/icX58GWvfpvZr9NLdLs2/xyFVyS8pQ0faZWmoXic3FMzoXYHV1gsdMbL1Yy5WQvGJy8j1rS8LGA==",
+      "license": "MIT",
+      "dependencies": {
+        "@sentry/bundler-plugin-core": "4.9.1",
+        "unplugin": "1.0.1"
+      },
+      "engines": {
+        "node": ">= 14"
+      }
     },
     "node_modules/@smartspec/db": {
       "resolved": "packages/db",
@@ -11882,6 +12671,15 @@
         "@types/express": "*"
       }
     },
+    "node_modules/@types/mysql": {
+      "version": "2.15.27",
+      "resolved": "https://registry.npmjs.org/@types/mysql/-/mysql-2.15.27.tgz",
+      "integrity": "sha512-YfWiV16IY0OeBfBCk8+hXKmdTKrKlwKN1MNKAPBu5JYxLwBEZl7QzeEpGnlZb3VMGJrrGmB84gXiH+ofs/TezA==",
+      "license": "MIT",
+      "dependencies": {
+        "@types/node": "*"
+      }
+    },
     "node_modules/@types/node": {
       "version": "25.2.1",
       "resolved": "https://registry.npmjs.org/@types/node/-/node-25.2.1.tgz",
@@ -11905,7 +12703,6 @@
       "version": "8.16.0",
       "resolved": "https://registry.npmjs.org/@types/pg/-/pg-8.16.0.tgz",
       "integrity": "sha512-RmhMd/wD+CF8Dfo+cVIy3RR5cl8CyfXQ0tGgW6XBL8L4LM/UTEbNXYRbLwU6w+CgrKBNbrQWt4FUtTfaU5jSYQ==",
-      "devOptional": true,
       "license": "MIT",
       "peer": true,
       "dependencies": {
@@ -11914,6 +12711,15 @@
         "pg-types": "^2.2.0"
       }
     },
+    "node_modules/@types/pg-pool": {
+      "version": "2.0.7",
+      "resolved": "https://registry.npmjs.org/@types/pg-pool/-/pg-pool-2.0.7.tgz",
+      "integrity": "sha512-U4CwmGVQcbEuqpyju8/ptOKg6gEC+Tqsvj2xS9o1g71bUh8twxnC6ZL5rZKCsGN0iyH0CwgUyc9VR5owNQF9Ng==",
+      "license": "MIT",
+      "dependencies": {
+        "@types/pg": "*"
+      }
+    },
     "node_modules/@types/prismjs": {
       "version": "1.26.6",
       "resolved": "https://registry.npmjs.org/@types/prismjs/-/prismjs-1.26.6.tgz",
@@ -12025,6 +12831,15 @@
         "@types/superagent": "^8.1.0"
       }
     },
+    "node_modules/@types/tedious": {
+      "version": "4.0.14",
+      "resolved": "https://registry.npmjs.org/@types/tedious/-/tedious-4.0.14.tgz",
+      "integrity": "sha512-KHPsfX/FoVbUGbyYvk1q9MMQHLPeRZhRJZdO45Q4YjvFkv4hMNghCWTvy7rdKessBsmtz4euWCWAB6/tVpI1Iw==",
+      "license": "MIT",
+      "dependencies": {
+        "@types/node": "*"
+      }
+    },
     "node_modules/@types/tough-cookie": {
       "version": "4.0.5",
       "resolved": "https://registry.npmjs.org/@types/tough-cookie/-/tough-cookie-4.0.5.tgz",
@@ -12193,6 +13008,28 @@
         "node": ">=6.5"
       }
     },
+    "node_modules/acorn": {
+      "version": "8.15.0",
+      "resolved": "https://registry.npmjs.org/acorn/-/acorn-8.15.0.tgz",
+      "integrity": "sha512-NZyJarBfL7nWwIq+FDL6Zp/yHEhePMNnnJ0y3qfieCrmNvYct8uvtiV41UvlSe6apAfk0fY1FbWx+NwfmpvtTg==",
+      "license": "MIT",
+      "peer": true,
+      "bin": {
+        "acorn": "bin/acorn"
+      },
+      "engines": {
+        "node": ">=0.4.0"
+      }
+    },
+    "node_modules/acorn-import-attributes": {
+      "version": "1.9.5",
+      "resolved": "https://registry.npmjs.org/acorn-import-attributes/-/acorn-import-attributes-1.9.5.tgz",
+      "integrity": "sha512-n02Vykv5uA3eHGM/Z2dQrcD56kL8TyDb2p1+0P83PClMnC/nc+anbQRhIOWnSq4Ke/KvDPrY3C9hDtC/A3eHnQ==",
+      "license": "MIT",
+      "peerDependencies": {
+        "acorn": "^8"
+      }
+    },
     "node_modules/adler-32": {
       "version": "1.3.1",
       "resolved": "https://registry.npmjs.org/adler-32/-/adler-32-1.3.1.tgz",
@@ -12237,7 +13074,6 @@
       "version": "3.1.3",
       "resolved": "https://registry.npmjs.org/anymatch/-/anymatch-3.1.3.tgz",
       "integrity": "sha512-KMReFUr0B4t+D+OBkjR3KYqvocp2XaSzO55UcB6mgQMd3KbcE+mWTyvVV7D/zsdEbNnV6acZUutkiHQXvTr1Rw==",
-      "dev": true,
       "license": "ISC",
       "dependencies": {
         "normalize-path": "^3.0.0",
@@ -12251,7 +13087,6 @@
       "version": "2.3.1",
       "resolved": "https://registry.npmjs.org/picomatch/-/picomatch-2.3.1.tgz",
       "integrity": "sha512-JU3teHTNjmE2VCGFzuY8EXzCDVwEqB2a8fsIvwaStHhAWJEeVd1o1QD80CU6+ZdEXXSLbSsuLwJjkCBWqRQUVA==",
-      "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=8.6"
@@ -12384,7 +13219,6 @@
       "version": "1.0.2",
       "resolved": "https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz",
       "integrity": "sha512-3oSeUO0TMV67hN1AmbXsK4yaqU7tjiHlbxRDZOpH0KW9+CeX4bRAaX0Anxt0tx2MrpRpWwQaPwIlISEJhYU5Pw==",
-      "dev": true,
       "license": "MIT"
     },
     "node_modules/base64-js": {
@@ -12411,7 +13245,6 @@
       "version": "2.9.19",
       "resolved": "https://registry.npmjs.org/baseline-browser-mapping/-/baseline-browser-mapping-2.9.19.tgz",
       "integrity": "sha512-ipDqC8FrAl/76p2SSWKSI+H9tFwm7vYqXQrItCuiVPt26Km0jS+NzSsBWAaBusvSbQcfJG+JitdMm+wZAgTYqg==",
-      "dev": true,
       "license": "Apache-2.0",
       "bin": {
         "baseline-browser-mapping": "dist/cli.js"
@@ -12454,7 +13287,6 @@
       "version": "2.3.0",
       "resolved": "https://registry.npmjs.org/binary-extensions/-/binary-extensions-2.3.0.tgz",
       "integrity": "sha512-Ceh+7ox5qe7LJuLHoY0feh3pHuUDHAcRUeyL2VYghZwfpkNIy/+8Ocg0a3UuSoYzavmylwuLWQOf3hl0jjMMIw==",
-      "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=8"
@@ -12484,7 +13316,6 @@
       "version": "3.0.3",
       "resolved": "https://registry.npmjs.org/braces/-/braces-3.0.3.tgz",
       "integrity": "sha512-yQbXgO/OSZVD2IsiLlro+7Hf6Q18EJrKSEsdoMzKePKXct3gvD8oLcOQdIzGupr5Fj+EDe8gO/lxc1BzfMpxvA==",
-      "dev": true,
       "license": "MIT",
       "dependencies": {
         "fill-range": "^7.1.1"
@@ -12497,7 +13328,6 @@
       "version": "4.28.1",
       "resolved": "https://registry.npmjs.org/browserslist/-/browserslist-4.28.1.tgz",
       "integrity": "sha512-ZC5Bd0LgJXgwGqUknZY/vkUQ04r8NXnJZ3yYi4vDmSiZmC/pdSN0NbNRPxZpbtO4uAfDUAFffO8IZoM3Gj8IkA==",
-      "dev": true,
       "funding": [
         {
           "type": "opencollective",
@@ -12584,7 +13414,6 @@
       "version": "1.0.30001766",
       "resolved": "https://registry.npmjs.org/caniuse-lite/-/caniuse-lite-1.0.30001766.tgz",
       "integrity": "sha512-4C0lfJ0/YPjJQHagaE9x2Elb69CIqEPZeG0anQt9SIvIoOH4a4uaRl73IavyO+0qZh6MDLH//DrXThEYKHkmYA==",
-      "dev": true,
       "funding": [
         {
           "type": "opencollective",
@@ -12668,7 +13497,6 @@
       "version": "3.6.0",
       "resolved": "https://registry.npmjs.org/chokidar/-/chokidar-3.6.0.tgz",
       "integrity": "sha512-7VT13fmjotKpGipCW9JEQAusEPE+Ei8nl6/g4FBAmIm0GOOLMua9NDDo/DWp0ZAxCr3cPq5ZpBqmPAQgDda2Pw==",
-      "dev": true,
       "license": "MIT",
       "dependencies": {
         "anymatch": "~3.1.2",
@@ -12689,6 +13517,12 @@
         "fsevents": "~2.3.2"
       }
     },
+    "node_modules/cjs-module-lexer": {
+      "version": "2.2.0",
+      "resolved": "https://registry.npmjs.org/cjs-module-lexer/-/cjs-module-lexer-2.2.0.tgz",
+      "integrity": "sha512-4bHTS2YuzUvtoLjdy+98ykbNB5jS0+07EvFNXerqZQJ89F7DI6ET7OQo/HJuW6K0aVsKA9hj9/RVb2kQVOrPDQ==",
+      "license": "MIT"
+    },
     "node_modules/class-variance-authority": {
       "version": "0.7.1",
       "resolved": "https://registry.npmjs.org/class-variance-authority/-/class-variance-authority-0.7.1.tgz",
@@ -12855,7 +13689,6 @@
       "version": "2.0.0",
       "resolved": "https://registry.npmjs.org/convert-source-map/-/convert-source-map-2.0.0.tgz",
       "integrity": "sha512-Kvp459HrV2FEJ1CAsi1Ku+MY3kasH19TFykTz2xWmMeq6bk2NU3XXvfJ+Q61m0xktWwt+1HSYf3JZsTms3aRJg==",
-      "dev": true,
       "license": "MIT"
     },
     "node_modules/cookie-signature": {
@@ -13295,6 +14128,18 @@
         "csstype": "^3.0.2"
       }
     },
+    "node_modules/dotenv": {
+      "version": "16.6.1",
+      "resolved": "https://registry.npmjs.org/dotenv/-/dotenv-16.6.1.tgz",
+      "integrity": "sha512-uBq4egWHTcTt33a72vpSG0z3HnPuIl6NqYcTrKEg2azoEyl2hpW0zqlxysq2pK9HlDIHyHyakeYaYnSAwd8bow==",
+      "license": "BSD-2-Clause",
+      "engines": {
+        "node": ">=12"
+      },
+      "funding": {
+        "url": "https://dotenvx.com"
+      }
+    },
     "node_modules/dunder-proto": {
       "version": "1.0.1",
       "resolved": "https://registry.npmjs.org/dunder-proto/-/dunder-proto-1.0.1.tgz",
@@ -13321,6 +14166,12 @@
         "stream-shift": "^1.0.2"
       }
     },
+    "node_modules/eastasianwidth": {
+      "version": "0.2.0",
+      "resolved": "https://registry.npmjs.org/eastasianwidth/-/eastasianwidth-0.2.0.tgz",
+      "integrity": "sha512-I88TYZWc9XiYHRQ4/3c5rjjfgkjhLyW2luGIheGERbNQ6OY7yTybanSpDXZa8y7VUP9YmDcYa+eyq4ca7iLqWA==",
+      "license": "MIT"
+    },
     "node_modules/ecdsa-sig-formatter": {
       "version": "1.0.11",
       "resolved": "https://registry.npmjs.org/ecdsa-sig-formatter/-/ecdsa-sig-formatter-1.0.11.tgz",
@@ -13334,7 +14185,6 @@
       "version": "1.5.283",
       "resolved": "https://registry.npmjs.org/electron-to-chromium/-/electron-to-chromium-1.5.283.tgz",
       "integrity": "sha512-3vifjt1HgrGW/h76UEeny+adYApveS9dH2h3p57JYzBSXJIKUJAvtmIytDKjcSCt9xHfrNCFJ7gts6vkhuq++w==",
-      "dev": true,
       "license": "ISC"
     },
     "node_modules/embla-carousel": {
@@ -13614,13 +14464,44 @@
       "version": "7.1.1",
       "resolved": "https://registry.npmjs.org/fill-range/-/fill-range-7.1.1.tgz",
       "integrity": "sha512-YsGpe3WHLK8ZYi4tWDg2Jy3ebRz2rXowDxnld4bkQB00cc/1Zw9AWnC0i9ztDJitivtQvaI9KaLyKrc+hBW0yg==",
-      "dev": true,
       "license": "MIT",
       "dependencies": {
-        "to-regex-range": "^5.0.1"
+        "to-regex-range": "^5.0.1"
+      },
+      "engines": {
+        "node": ">=8"
+      }
+    },
+    "node_modules/find-up": {
+      "version": "5.0.0",
+      "resolved": "https://registry.npmjs.org/find-up/-/find-up-5.0.0.tgz",
+      "integrity": "sha512-78/PXT1wlLLDgTzDs7sjq9hzz0vXD+zn+7wypEe4fXQxCmdmqfGsEPQxmiCSQI3ajFV91bVSsvNtrJRiW6nGng==",
+      "license": "MIT",
+      "dependencies": {
+        "locate-path": "^6.0.0",
+        "path-exists": "^4.0.0"
+      },
+      "engines": {
+        "node": ">=10"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/sindresorhus"
+      }
+    },
+    "node_modules/foreground-child": {
+      "version": "3.3.1",
+      "resolved": "https://registry.npmjs.org/foreground-child/-/foreground-child-3.3.1.tgz",
+      "integrity": "sha512-gIXjKqtFuWEgzFRJA9WCQeSJLZDjgJUOMCMzxtvFq/37KojM1BFGufqsCy0r4qSQmYLsZYMeyRqzIWOMup03sw==",
+      "license": "ISC",
+      "dependencies": {
+        "cross-spawn": "^7.0.6",
+        "signal-exit": "^4.0.1"
       },
       "engines": {
-        "node": ">=8"
+        "node": ">=14"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/isaacs"
       }
     },
     "node_modules/form-data": {
@@ -13665,6 +14546,12 @@
         "url": "https://ko-fi.com/tunnckoCore/commissions"
       }
     },
+    "node_modules/forwarded-parse": {
+      "version": "2.1.2",
+      "resolved": "https://registry.npmjs.org/forwarded-parse/-/forwarded-parse-2.1.2.tgz",
+      "integrity": "sha512-alTFZZQDKMporBH77856pXgzhEzaUVmLCDk+egLgIgHst3Tpndzz8MnKe+GzRJRfvVdn69HhpW7cmXzvtLvJAw==",
+      "license": "MIT"
+    },
     "node_modules/frac": {
       "version": "1.1.2",
       "resolved": "https://registry.npmjs.org/frac/-/frac-1.1.2.tgz",
@@ -13719,7 +14606,6 @@
       "version": "2.3.3",
       "resolved": "https://registry.npmjs.org/fsevents/-/fsevents-2.3.3.tgz",
       "integrity": "sha512-5xoDfX+fL7faATnagmWPpbFtwh/R77WmMMqqHGS65C3vvB0YHrgF+B1YmZ3441tMj5n63k0212XNoJwzlhffQw==",
-      "dev": true,
       "hasInstallScript": true,
       "license": "MIT",
       "optional": true,
@@ -13786,7 +14672,6 @@
       "version": "1.0.0-beta.2",
       "resolved": "https://registry.npmjs.org/gensync/-/gensync-1.0.0-beta.2.tgz",
       "integrity": "sha512-3hN7NaskYvMDLQY55gnW3NQ+mesEAepTqlg+VEbj7zzqEMBVNhzcGYYeqFo/TlYz6eQiFcp1HcsCZO+nGgS8zg==",
-      "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=6.9.0"
@@ -13847,11 +14732,31 @@
         "node": ">= 0.4"
       }
     },
+    "node_modules/glob": {
+      "version": "10.5.0",
+      "resolved": "https://registry.npmjs.org/glob/-/glob-10.5.0.tgz",
+      "integrity": "sha512-DfXN8DfhJ7NH3Oe7cFmu3NCu1wKbkReJ8TorzSAFbSKrlNaQSKfIzqYqVY8zlbs2NLBbWpRiU52GX2PbaBVNkg==",
+      "deprecated": "Old versions of glob are not supported, and contain widely publicized security vulnerabilities, which have been fixed in the current version. Please update. Support for old versions may be purchased (at exorbitant rates) by contacting i@izs.me",
+      "license": "ISC",
+      "dependencies": {
+        "foreground-child": "^3.1.0",
+        "jackspeak": "^3.1.2",
+        "minimatch": "^9.0.4",
+        "minipass": "^7.1.2",
+        "package-json-from-dist": "^1.0.0",
+        "path-scurry": "^1.11.1"
+      },
+      "bin": {
+        "glob": "dist/esm/bin.mjs"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/isaacs"
+      }
+    },
     "node_modules/glob-parent": {
       "version": "5.1.2",
       "resolved": "https://registry.npmjs.org/glob-parent/-/glob-parent-5.1.2.tgz",
       "integrity": "sha512-AOIgSQCepiJYwP3ARnGx+5VnTu2HBYdzbGP45eLw1vr3zB3vZLeyed1sC9hnbcOc9/SrMyM5RPQrkGz4aS9Zow==",
-      "dev": true,
       "license": "ISC",
       "dependencies": {
         "is-glob": "^4.0.1"
@@ -13860,6 +14765,30 @@
         "node": ">= 6"
       }
     },
+    "node_modules/glob/node_modules/brace-expansion": {
+      "version": "2.0.2",
+      "resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-2.0.2.tgz",
+      "integrity": "sha512-Jt0vHyM+jmUBqojB7E1NIYadt0vI0Qxjxd2TErW94wDz+E2LAm5vKMXXwg6ZZBTHPuUlDgQHKXvjGBdfcF1ZDQ==",
+      "license": "MIT",
+      "dependencies": {
+        "balanced-match": "^1.0.0"
+      }
+    },
+    "node_modules/glob/node_modules/minimatch": {
+      "version": "9.0.5",
+      "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-9.0.5.tgz",
+      "integrity": "sha512-G6T0ZX48xgozx7587koeX9Ys2NYy6Gmv//P89sEte9V9whIapMNF4idKxnW2QtCcLiTWlb/wfCabAtAFWhhBow==",
+      "license": "ISC",
+      "dependencies": {
+        "brace-expansion": "^2.0.1"
+      },
+      "engines": {
+        "node": ">=16 || 14 >=14.17"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/isaacs"
+      }
+    },
     "node_modules/google-auth-library": {
       "version": "9.15.1",
       "resolved": "https://registry.npmjs.org/google-auth-library/-/google-auth-library-9.15.1.tgz",
@@ -14187,6 +15116,18 @@
       "dev": true,
       "license": "ISC"
     },
+    "node_modules/import-in-the-middle": {
+      "version": "2.0.6",
+      "resolved": "https://registry.npmjs.org/import-in-the-middle/-/import-in-the-middle-2.0.6.tgz",
+      "integrity": "sha512-3vZV3jX0XRFW3EJDTwzWoZa+RH1b8eTTx6YOCjglrLyPuepwoBti1k3L2dKwdCUrnVEfc5CuRuGstaC/uQJJaw==",
+      "license": "Apache-2.0",
+      "dependencies": {
+        "acorn": "^8.15.0",
+        "acorn-import-attributes": "^1.9.5",
+        "cjs-module-lexer": "^2.2.0",
+        "module-details-from-path": "^1.0.4"
+      }
+    },
     "node_modules/indent-string": {
       "version": "4.0.0",
       "resolved": "https://registry.npmjs.org/indent-string/-/indent-string-4.0.0.tgz",
@@ -14280,7 +15221,6 @@
       "version": "2.1.0",
       "resolved": "https://registry.npmjs.org/is-binary-path/-/is-binary-path-2.1.0.tgz",
       "integrity": "sha512-ZMERYes6pDydyuGidse7OsHxtbI7WVeUEozgR/g7rd0xUimYNlvZRE/K2MgZTjWy725IfelLeVcEM97mmtRGXw==",
-      "dev": true,
       "license": "MIT",
       "dependencies": {
         "binary-extensions": "^2.0.0"
@@ -14303,7 +15243,6 @@
       "version": "2.1.1",
       "resolved": "https://registry.npmjs.org/is-extglob/-/is-extglob-2.1.1.tgz",
       "integrity": "sha512-SbKbANkN603Vi4jEZv49LeVJMn4yGwsbzZworEoyEiutsN3nJYdbO36zfhGJ6QEDpOZIFkDtnq5JRxmvl3jsoQ==",
-      "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=0.10.0"
@@ -14322,7 +15261,6 @@
       "version": "4.0.3",
       "resolved": "https://registry.npmjs.org/is-glob/-/is-glob-4.0.3.tgz",
       "integrity": "sha512-xelSayHH36ZgE7ZWhli7pW34hNbNl8Ojv5KVmkJD4hBdD3th8Tfk9vYasLM+mXWOZhFkgZfxhLSnrwRr4elSSg==",
-      "dev": true,
       "license": "MIT",
       "dependencies": {
         "is-extglob": "^2.1.1"
@@ -14345,7 +15283,6 @@
       "version": "7.0.0",
       "resolved": "https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz",
       "integrity": "sha512-41Cifkg6e8TylSpdtTpeLVMqvSBEVzTttHvERD741+pnZ8ANv0004MRL43QKPDlK9cGvNp6NZWZUBlbGXYxxng==",
-      "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=0.12.0"
@@ -14427,6 +15364,21 @@
         "node": ">=8"
       }
     },
+    "node_modules/jackspeak": {
+      "version": "3.4.3",
+      "resolved": "https://registry.npmjs.org/jackspeak/-/jackspeak-3.4.3.tgz",
+      "integrity": "sha512-OGlZQpz2yfahA/Rd1Y8Cd9SIEsqvXkLVoSw/cgwhnhFMDbsQFeZYoJJ7bIZBS9BcamUW96asq/npPWugM+RQBw==",
+      "license": "BlueOak-1.0.0",
+      "dependencies": {
+        "@isaacs/cliui": "^8.0.2"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/isaacs"
+      },
+      "optionalDependencies": {
+        "@pkgjs/parseargs": "^0.11.0"
+      }
+    },
     "node_modules/jiti": {
       "version": "2.6.1",
       "resolved": "https://registry.npmjs.org/jiti/-/jiti-2.6.1.tgz",
@@ -14757,7 +15709,6 @@
       "version": "3.1.0",
       "resolved": "https://registry.npmjs.org/jsesc/-/jsesc-3.1.0.tgz",
       "integrity": "sha512-/sM3dO2FOzXjKQhJuo0Q173wf2KOo8t4I8vHy6lF9poUp7bKT0/NHE8fPX23PwfhnykfqnC2xRxOnVw5XuGIaA==",
-      "dev": true,
       "license": "MIT",
       "bin": {
         "jsesc": "bin/jsesc"
@@ -14779,7 +15730,6 @@
       "version": "2.2.3",
       "resolved": "https://registry.npmjs.org/json5/-/json5-2.2.3.tgz",
       "integrity": "sha512-XmOWe7eyHYH14cLdVPoyg+GOH3rYX++KpzrylJwSW98t3Nk+U8XOl8FWKOgwtzdb8lXGf6zYwDUzeHMWfxasyg==",
-      "dev": true,
       "license": "MIT",
       "bin": {
         "json5": "lib/cli.js"
@@ -15070,6 +16020,21 @@
         "url": "https://opencollective.com/parcel"
       }
     },
+    "node_modules/locate-path": {
+      "version": "6.0.0",
+      "resolved": "https://registry.npmjs.org/locate-path/-/locate-path-6.0.0.tgz",
+      "integrity": "sha512-iPZK6eYjbxRu3uB4/WZ3EsEIMJFMqAoopl3R+zuq0UjcAm/MO6KCweDgPfP3elTztoKP3KtnVHxTn2NHBSDVUw==",
+      "license": "MIT",
+      "dependencies": {
+        "p-locate": "^5.0.0"
+      },
+      "engines": {
+        "node": ">=10"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/sindresorhus"
+      }
+    },
     "node_modules/lodash": {
       "version": "4.17.23",
       "resolved": "https://registry.npmjs.org/lodash/-/lodash-4.17.23.tgz",
@@ -15140,7 +16105,6 @@
       "version": "5.1.1",
       "resolved": "https://registry.npmjs.org/lru-cache/-/lru-cache-5.1.1.tgz",
       "integrity": "sha512-KpNARQA3Iwv+jTA0utUVVbrh+Jlrr1Fv0e56GGzAFOXN7dk/FviaDW8LHmK52DlcH4WP2n6gI8vN1aesBFgo9w==",
-      "dev": true,
       "license": "ISC",
       "dependencies": {
         "yallist": "^3.0.2"
@@ -16140,6 +17104,15 @@
         "url": "https://github.com/sponsors/ljharb"
       }
     },
+    "node_modules/minipass": {
+      "version": "7.1.2",
+      "resolved": "https://registry.npmjs.org/minipass/-/minipass-7.1.2.tgz",
+      "integrity": "sha512-qOOzS1cBTWYF4BH8fVePDBOO9iptMnGUEZwNc/cMWnTV2nVLZ7VoNWEPHkYczZA0pdoA7dl6e7FL659nX9S2aw==",
+      "license": "ISC",
+      "engines": {
+        "node": ">=16 || 14 >=14.17"
+      }
+    },
     "node_modules/mkdirp": {
       "version": "0.5.6",
       "resolved": "https://registry.npmjs.org/mkdirp/-/mkdirp-0.5.6.tgz",
@@ -16152,6 +17125,12 @@
         "mkdirp": "bin/cmd.js"
       }
     },
+    "node_modules/module-details-from-path": {
+      "version": "1.0.4",
+      "resolved": "https://registry.npmjs.org/module-details-from-path/-/module-details-from-path-1.0.4.tgz",
+      "integrity": "sha512-EGWKgxALGMgzvxYF1UyGTy0HXX/2vHLkw6+NvDKW2jypWbHpjQuj4UMcqQWXHERJhVGKikolT06G3bcKe4fi7w==",
+      "license": "MIT"
+    },
     "node_modules/motion-dom": {
       "version": "12.29.2",
       "resolved": "https://registry.npmjs.org/motion-dom/-/motion-dom-12.29.2.tgz",
@@ -16263,7 +17242,6 @@
       "version": "2.0.27",
       "resolved": "https://registry.npmjs.org/node-releases/-/node-releases-2.0.27.tgz",
       "integrity": "sha512-nmh3lCkYZ3grZvqcCH+fjmQ7X+H0OeZgP40OierEaAptX4XofMh5kwNbWh7lBduUzCcV/8kZ+NDLCwm2iorIlA==",
-      "dev": true,
       "license": "MIT"
     },
     "node_modules/nodemon": {
@@ -16335,7 +17313,6 @@
       "version": "3.0.0",
       "resolved": "https://registry.npmjs.org/normalize-path/-/normalize-path-3.0.0.tgz",
       "integrity": "sha512-6eZs5Ls3WtCisHWp9S2GUy8dqkpGi4BVSz3GaqiE6ezub0512ESztXUwUB6C6IKbQkY2Pnb/mD4WYojCRwcwLA==",
-      "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=0.10.0"
@@ -16380,6 +17357,42 @@
         "wrappy": "1"
       }
     },
+    "node_modules/p-limit": {
+      "version": "3.1.0",
+      "resolved": "https://registry.npmjs.org/p-limit/-/p-limit-3.1.0.tgz",
+      "integrity": "sha512-TYOanM3wGwNGsZN2cVTYPArw454xnXj5qmWF1bEoAc4+cU/ol7GVh7odevjp1FNHduHc3KZMcFduxU5Xc6uJRQ==",
+      "license": "MIT",
+      "dependencies": {
+        "yocto-queue": "^0.1.0"
+      },
+      "engines": {
+        "node": ">=10"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/sindresorhus"
+      }
+    },
+    "node_modules/p-locate": {
+      "version": "5.0.0",
+      "resolved": "https://registry.npmjs.org/p-locate/-/p-locate-5.0.0.tgz",
+      "integrity": "sha512-LaNjtRWUBY++zB5nE/NwcaoMylSPk+S+ZHNB1TzdbMJMny6dynpAGt7X/tl/QYq3TIeE6nxHppbo2LGymrG5Pw==",
+      "license": "MIT",
+      "dependencies": {
+        "p-limit": "^3.0.2"
+      },
+      "engines": {
+        "node": ">=10"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/sindresorhus"
+      }
+    },
+    "node_modules/package-json-from-dist": {
+      "version": "1.0.1",
+      "resolved": "https://registry.npmjs.org/package-json-from-dist/-/package-json-from-dist-1.0.1.tgz",
+      "integrity": "sha512-UEZIS3/by4OC8vL3P2dTXRETpebLI2NiI5vIrjaD/5UtrkFX/tNbwjTSRAGC/+7CAo2pIcBaRgWmcBBHcsaCIw==",
+      "license": "BlueOak-1.0.0"
+    },
     "node_modules/papaparse": {
       "version": "5.5.3",
       "resolved": "https://registry.npmjs.org/papaparse/-/papaparse-5.5.3.tgz",
@@ -16423,6 +17436,15 @@
         "url": "https://github.com/inikulin/parse5?sponsor=1"
       }
     },
+    "node_modules/path-exists": {
+      "version": "4.0.0",
+      "resolved": "https://registry.npmjs.org/path-exists/-/path-exists-4.0.0.tgz",
+      "integrity": "sha512-ak9Qy5Q7jYb2Wwcey5Fpvg2KoAc/ZIhLSLOSBmRmygPsGwkVVt0fZa0qrtMz+m6tJTAHfZQ8FnmB4MG4LWy7/w==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=8"
+      }
+    },
     "node_modules/path-key": {
       "version": "3.1.1",
       "resolved": "https://registry.npmjs.org/path-key/-/path-key-3.1.1.tgz",
@@ -16432,6 +17454,28 @@
         "node": ">=8"
       }
     },
+    "node_modules/path-scurry": {
+      "version": "1.11.1",
+      "resolved": "https://registry.npmjs.org/path-scurry/-/path-scurry-1.11.1.tgz",
+      "integrity": "sha512-Xa4Nw17FS9ApQFJ9umLiJS4orGjm7ZzwUrwamcGQuHSzDyth9boKDaycYdDcZDuqYATXw4HFXgaqWTctW/v1HA==",
+      "license": "BlueOak-1.0.0",
+      "dependencies": {
+        "lru-cache": "^10.2.0",
+        "minipass": "^5.0.0 || ^6.0.2 || ^7.0.0"
+      },
+      "engines": {
+        "node": ">=16 || 14 >=14.18"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/isaacs"
+      }
+    },
+    "node_modules/path-scurry/node_modules/lru-cache": {
+      "version": "10.4.3",
+      "resolved": "https://registry.npmjs.org/lru-cache/-/lru-cache-10.4.3.tgz",
+      "integrity": "sha512-JNAzZcXrCt42VGLuYz0zfAzDfAvJWW6AfYlDBQyDV5DClI2m5sAmK+OIO7s59XfsRsWHp02jAJrRadPRGTt6SQ==",
+      "license": "ISC"
+    },
     "node_modules/pathe": {
       "version": "2.0.3",
       "resolved": "https://registry.npmjs.org/pathe/-/pathe-2.0.3.tgz",
@@ -16668,6 +17712,15 @@
         "node": ">=6"
       }
     },
+    "node_modules/progress": {
+      "version": "2.0.3",
+      "resolved": "https://registry.npmjs.org/progress/-/progress-2.0.3.tgz",
+      "integrity": "sha512-7PiHtLll5LdnKIMw100I+8xJXR5gW2QwWYkT6iJva0bXitZKa/XMrSbdmg3r2Xnaidz9Qumd0VPaMrZlF9V9sA==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=0.4.0"
+      }
+    },
     "node_modules/prop-types": {
       "version": "15.8.1",
       "resolved": "https://registry.npmjs.org/prop-types/-/prop-types-15.8.1.tgz",
@@ -16731,6 +17784,12 @@
         "node": ">=12.0.0"
       }
     },
+    "node_modules/proxy-from-env": {
+      "version": "1.1.0",
+      "resolved": "https://registry.npmjs.org/proxy-from-env/-/proxy-from-env-1.1.0.tgz",
+      "integrity": "sha512-D+zkORCbA9f1tdWRK0RaCR3GPv50cMxcrz4X8k5LTSUD1Dkw47mKJEZQNunItRTkWwgtaUSo1RVFRIG9ZXiFYg==",
+      "license": "MIT"
+    },
     "node_modules/pstree.remy": {
       "version": "1.1.8",
       "resolved": "https://registry.npmjs.org/pstree.remy/-/pstree.remy-1.1.8.tgz",
@@ -17000,7 +18059,6 @@
       "version": "3.6.0",
       "resolved": "https://registry.npmjs.org/readdirp/-/readdirp-3.6.0.tgz",
       "integrity": "sha512-hOS089on8RduqdbhvQ5Z37A0ESjsqz6qnRcffsMU3495FuTdqSm+7bhJ29JvIOsBDEEnan5DPu9t3To9VRlMzA==",
-      "dev": true,
       "license": "MIT",
       "dependencies": {
         "picomatch": "^2.2.1"
@@ -17013,7 +18071,6 @@
       "version": "2.3.1",
       "resolved": "https://registry.npmjs.org/picomatch/-/picomatch-2.3.1.tgz",
       "integrity": "sha512-JU3teHTNjmE2VCGFzuY8EXzCDVwEqB2a8fsIvwaStHhAWJEeVd1o1QD80CU6+ZdEXXSLbSsuLwJjkCBWqRQUVA==",
-      "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=8.6"
@@ -17190,6 +18247,19 @@
         "node": ">=0.10.0"
       }
     },
+    "node_modules/require-in-the-middle": {
+      "version": "8.0.1",
+      "resolved": "https://registry.npmjs.org/require-in-the-middle/-/require-in-the-middle-8.0.1.tgz",
+      "integrity": "sha512-QT7FVMXfWOYFbeRBF6nu+I6tr2Tf3u0q8RIEjNob/heKY/nh7drD/k7eeMFmSQgnTtCzLDcCu/XEnpW2wk4xCQ==",
+      "license": "MIT",
+      "dependencies": {
+        "debug": "^4.3.5",
+        "module-details-from-path": "^1.0.3"
+      },
+      "engines": {
+        "node": ">=9.3.0 || >=8.10.0 <9.0.0"
+      }
+    },
     "node_modules/retry-request": {
       "version": "7.0.2",
       "resolved": "https://registry.npmjs.org/retry-request/-/retry-request-7.0.2.tgz",
@@ -17310,7 +18380,6 @@
       "version": "6.3.1",
       "resolved": "https://registry.npmjs.org/semver/-/semver-6.3.1.tgz",
       "integrity": "sha512-BR7VvDCVHO+q2xBEWskxS6DJE1qRnb7DxzUrogb71CWoSficBxYsiAGd+Kl0mmq/MprG9yArRkyrQxTO6XjMzA==",
-      "dev": true,
       "license": "ISC",
       "bin": {
         "semver": "bin/semver.js"
@@ -17416,6 +18485,18 @@
       "dev": true,
       "license": "ISC"
     },
+    "node_modules/signal-exit": {
+      "version": "4.1.0",
+      "resolved": "https://registry.npmjs.org/signal-exit/-/signal-exit-4.1.0.tgz",
+      "integrity": "sha512-bzyZ1e88w9O1iNJbKnOlvYTrWPDl46O1bG0D3XInv+9tkPrxrN8jUUTiFlDkkmKWgn1M6CfIA13SuGqOa9Korw==",
+      "license": "ISC",
+      "engines": {
+        "node": ">=14"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/isaacs"
+      }
+    },
     "node_modules/simple-update-notifier": {
       "version": "2.0.0",
       "resolved": "https://registry.npmjs.org/simple-update-notifier/-/simple-update-notifier-2.0.0.tgz",
@@ -17558,6 +18639,21 @@
         "node": ">=8"
       }
     },
+    "node_modules/string-width-cjs": {
+      "name": "string-width",
+      "version": "4.2.3",
+      "resolved": "https://registry.npmjs.org/string-width/-/string-width-4.2.3.tgz",
+      "integrity": "sha512-wKyQRQpjJ0sIp62ErSZdGsjMJWsap5oRNihHhu6G7JVO/9jIB6UyevL+tXuOqrng8j/cxKTWyWUwvSTriiZz/g==",
+      "license": "MIT",
+      "dependencies": {
+        "emoji-regex": "^8.0.0",
+        "is-fullwidth-code-point": "^3.0.0",
+        "strip-ansi": "^6.0.1"
+      },
+      "engines": {
+        "node": ">=8"
+      }
+    },
     "node_modules/stringify-entities": {
       "version": "4.0.4",
       "resolved": "https://registry.npmjs.org/stringify-entities/-/stringify-entities-4.0.4.tgz",
@@ -17584,6 +18680,19 @@
         "node": ">=8"
       }
     },
+    "node_modules/strip-ansi-cjs": {
+      "name": "strip-ansi",
+      "version": "6.0.1",
+      "resolved": "https://registry.npmjs.org/strip-ansi/-/strip-ansi-6.0.1.tgz",
+      "integrity": "sha512-Y38VPSHcqkFrCpFnQ9vuSXmquuv5oXOKpGeT6aGrr3o3Gc9AlVa6JBfUSOCnbxGGZF+/0ooI7KrPuUSztUdU5A==",
+      "license": "MIT",
+      "dependencies": {
+        "ansi-regex": "^5.0.1"
+      },
+      "engines": {
+        "node": ">=8"
+      }
+    },
     "node_modules/strip-indent": {
       "version": "3.0.0",
       "resolved": "https://registry.npmjs.org/strip-indent/-/strip-indent-3.0.0.tgz",
@@ -17865,7 +18974,6 @@
       "version": "5.0.1",
       "resolved": "https://registry.npmjs.org/to-regex-range/-/to-regex-range-5.0.1.tgz",
       "integrity": "sha512-65P7iz6X5yEr1cwcgvQxbbIw7Uk3gOy5dIdtZ4rDveLqhrdJP+Li/Hx6tyK0NEb+2GCyneCMJiGqrADCSNk8sQ==",
-      "dev": true,
       "license": "MIT",
       "dependencies": {
         "is-number": "^7.0.0"
@@ -18186,11 +19294,22 @@
         "url": "https://opencollective.com/unified"
       }
     },
+    "node_modules/unplugin": {
+      "version": "1.0.1",
+      "resolved": "https://registry.npmjs.org/unplugin/-/unplugin-1.0.1.tgz",
+      "integrity": "sha512-aqrHaVBWW1JVKBHmGo33T5TxeL0qWzfvjWokObHA9bYmN7eNDkwOxmLjhioHl9878qDFMAaT51XNroRyuz7WxA==",
+      "license": "MIT",
+      "dependencies": {
+        "acorn": "^8.8.1",
+        "chokidar": "^3.5.3",
+        "webpack-sources": "^3.2.3",
+        "webpack-virtual-modules": "^0.5.0"
+      }
+    },
     "node_modules/update-browserslist-db": {
       "version": "1.2.3",
       "resolved": "https://registry.npmjs.org/update-browserslist-db/-/update-browserslist-db-1.2.3.tgz",
       "integrity": "sha512-Js0m9cx+qOgDxo0eMiFGEueWztz+d4+M3rGlmKPT+T4IS/jP4ylw3Nwpu6cpTTP8R1MAC1kF4VbdLt3ARf209w==",
-      "dev": true,
       "funding": [
         {
           "type": "opencollective",
@@ -18452,6 +19571,21 @@
       "integrity": "sha512-2JAn3z8AR6rjK8Sm8orRC0h/bcl/DqL7tRPdGZ4I1CjdF+EaMLmYxBHyXuKL849eucPFhvBoxMsflfOb8kxaeQ==",
       "license": "BSD-2-Clause"
     },
+    "node_modules/webpack-sources": {
+      "version": "3.3.3",
+      "resolved": "https://registry.npmjs.org/webpack-sources/-/webpack-sources-3.3.3.tgz",
+      "integrity": "sha512-yd1RBzSGanHkitROoPFd6qsrxt+oFhg/129YzheDGqeustzX0vTZJZsSsQjVQC4yzBQ56K55XU8gaNCtIzOnTg==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=10.13.0"
+      }
+    },
+    "node_modules/webpack-virtual-modules": {
+      "version": "0.5.0",
+      "resolved": "https://registry.npmjs.org/webpack-virtual-modules/-/webpack-virtual-modules-0.5.0.tgz",
+      "integrity": "sha512-kyDivFZ7ZM0BVOUteVbDFhlRt7Ah/CSPwJdi8hBpkK7QLumUqdLtVfm/PX/hkcnrvr0i77fO5+TjZ94Pe+C9iw==",
+      "license": "MIT"
+    },
     "node_modules/whatwg-mimetype": {
       "version": "3.0.0",
       "resolved": "https://registry.npmjs.org/whatwg-mimetype/-/whatwg-mimetype-3.0.0.tgz",
@@ -18539,6 +19673,39 @@
         "url": "https://github.com/chalk/wrap-ansi?sponsor=1"
       }
     },
+    "node_modules/wrap-ansi-cjs": {
+      "name": "wrap-ansi",
+      "version": "7.0.0",
+      "resolved": "https://registry.npmjs.org/wrap-ansi/-/wrap-ansi-7.0.0.tgz",
+      "integrity": "sha512-YVGIj2kamLSTxw6NsZjoBxfSwsn0ycdesmc4p+Q21c5zPuZ1pl+NfxVdxPtdHvmNVOQ6XSYG4AUtyt/Fi7D16Q==",
+      "license": "MIT",
+      "dependencies": {
+        "ansi-styles": "^4.0.0",
+        "string-width": "^4.1.0",
+        "strip-ansi": "^6.0.0"
+      },
+      "engines": {
+        "node": ">=10"
+      },
+      "funding": {
+        "url": "https://github.com/chalk/wrap-ansi?sponsor=1"
+      }
+    },
+    "node_modules/wrap-ansi-cjs/node_modules/ansi-styles": {
+      "version": "4.3.0",
+      "resolved": "https://registry.npmjs.org/ansi-styles/-/ansi-styles-4.3.0.tgz",
+      "integrity": "sha512-zbB9rCJAT1rbjiVDb2hqKFHNYLxgtk8NURxZ3IZwD3F6NtxbXZQCnnSi1Lkx+IDohdPlFp222wVALIheZJQSEg==",
+      "license": "MIT",
+      "dependencies": {
+        "color-convert": "^2.0.1"
+      },
+      "engines": {
+        "node": ">=8"
+      },
+      "funding": {
+        "url": "https://github.com/chalk/ansi-styles?sponsor=1"
+      }
+    },
     "node_modules/wrap-ansi/node_modules/ansi-styles": {
       "version": "4.3.0",
       "resolved": "https://registry.npmjs.org/ansi-styles/-/ansi-styles-4.3.0.tgz",
@@ -18642,7 +19809,6 @@
       "version": "3.1.1",
       "resolved": "https://registry.npmjs.org/yallist/-/yallist-3.1.1.tgz",
       "integrity": "sha512-a4UGQaWPH59mOXUYnAG2ewncQS4i4F43Tv3JoAM+s2VDAmS9NsK8GpDMLrCHPksFT7h3K6TOoUNn2pb7RoXx4g==",
-      "dev": true,
       "license": "ISC"
     },
     "node_modules/yargs": {
@@ -18672,6 +19838,18 @@
         "node": ">=12"
       }
     },
+    "node_modules/yocto-queue": {
+      "version": "0.1.0",
+      "resolved": "https://registry.npmjs.org/yocto-queue/-/yocto-queue-0.1.0.tgz",
+      "integrity": "sha512-rVksvsnNCdJ/ohGc6xgPwyN8eheCxsiLM8mxuE/t/mOVqJewPuO1miLpTHQiRgTKCLexL4MeAFVagts7HmNZ2Q==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=10"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/sindresorhus"
+      }
+    },
     "node_modules/zod": {
       "version": "3.25.76",
       "resolved": "https://registry.npmjs.org/zod/-/zod-3.25.76.tgz",
diff --git a/python-backend/app/core/middleware.py b/python-backend/app/core/middleware.py
index c1131d1..f62b64a 100644
--- a/python-backend/app/core/middleware.py
+++ b/python-backend/app/core/middleware.py
@@ -16,6 +16,7 @@ from starlette.middleware.cors import CORSMiddleware
 import time
 import structlog
 
+import sentry_sdk
 from app.core.security import rate_limiter
 from app.core.errors import SmartSpecError, to_http_exception, RateLimitError
 from app.core.request_validator import RequestValidationMiddleware
@@ -170,14 +171,35 @@ class RequestLoggingMiddleware(BaseHTTPMiddleware):
             raise
 
 
+class SentryTagMiddleware(BaseHTTPMiddleware):
+    """Set Sentry scope tags for request correlation."""
+
+    async def dispatch(self, request: Request, call_next):
+        request_id = getattr(request.state, "request_id", None)
+        if request_id:
+            sentry_sdk.set_tag("request_id", request_id)
+
+        user_id = getattr(request.state, "user_id", None)
+        if user_id:
+            sentry_sdk.set_tag("user_id", str(user_id))
+            sentry_sdk.set_user({"id": str(user_id)})
+
+        # Check for job_id in path params or query
+        job_id = request.path_params.get("job_id") or request.query_params.get("job_id")
+        if job_id:
+            sentry_sdk.set_tag("job_id", str(job_id))
+
+        return await call_next(request)
+
+
 class ErrorHandlingMiddleware(BaseHTTPMiddleware):
     """Global error handling middleware"""
-    
+
     async def dispatch(self, request: Request, call_next):
         try:
             response = await call_next(request)
             return response
-        
+
         except SmartSpecError as e:
             # Convert SmartSpec errors to HTTP exceptions
             http_exc = to_http_exception(e)
@@ -185,7 +207,7 @@ class ErrorHandlingMiddleware(BaseHTTPMiddleware):
                 status_code=http_exc.status_code,
                 content=http_exc.detail
             )
-        
+
         except Exception as e:
             # Log unexpected errors
             logger.error(
@@ -195,7 +217,7 @@ class ErrorHandlingMiddleware(BaseHTTPMiddleware):
                 path=request.url.path,
                 exc_info=e
             )
-            
+
             # Return generic error response
             return JSONResponse(
                 status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
@@ -369,6 +391,9 @@ def setup_middleware(app):
     # 1. Error handling (outermost - catches all errors)
     app.add_middleware(ErrorHandlingMiddleware)
 
+    # 1.5. Sentry tags (set request_id, user_id, job_id as Sentry tags)
+    app.add_middleware(SentryTagMiddleware)
+
     # 2. Request and audit logging
     from app.core.request_logging import setup_request_logging
     setup_request_logging(app)
diff --git a/python-backend/app/core/request_logging.py b/python-backend/app/core/request_logging.py
index 631e5ea..b7bb0f7 100644
--- a/python-backend/app/core/request_logging.py
+++ b/python-backend/app/core/request_logging.py
@@ -10,6 +10,7 @@ from fastapi import Request, Response
 from starlette.middleware.base import BaseHTTPMiddleware
 from starlette.types import ASGIApp
 import structlog
+import structlog.contextvars
 
 logger = structlog.get_logger()
 
@@ -33,9 +34,12 @@ class RequestLoggingMiddleware(BaseHTTPMiddleware):
     async def dispatch(self, request: Request, call_next: Callable) -> Response:
         """Process request and log details"""
         
-        # Generate request ID
-        request_id = str(uuid.uuid4())
+        # Use existing X-Request-ID if provided by upstream service, otherwise generate
+        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
         request.state.request_id = request_id
+
+        # Bind request_id to structlog context for all log entries in this request
+        structlog.contextvars.bind_contextvars(request_id=request_id)
         
         # Extract request details
         method = request.method
diff --git a/python-backend/app/core/sentry_config.py b/python-backend/app/core/sentry_config.py
new file mode 100644
index 0000000..87c5c07
--- /dev/null
+++ b/python-backend/app/core/sentry_config.py
@@ -0,0 +1,61 @@
+"""
+Sentry Error Tracking - Python Backend
+
+Initializes Sentry for the FastAPI backend with:
+- PII scrubbing (headers, body fields)
+- FastAPI integration
+- Configurable sample rate
+"""
+
+import os
+import re
+import sentry_sdk
+from sentry_sdk.integrations.fastapi import FastApiIntegration
+
+SENSITIVE_HEADERS = {"authorization", "cookie", "x-proxy-token"}
+SENSITIVE_BODY_PATTERN = re.compile(r"password|token|secret|apiKey|encr", re.IGNORECASE)
+
+
+def before_send(event: dict, hint: dict) -> dict | None:
+    """Scrub PII from Sentry events before sending."""
+    request = event.get("request", {})
+
+    # Scrub sensitive headers
+    headers = request.get("headers", {})
+    if isinstance(headers, dict):
+        for header in SENSITIVE_HEADERS:
+            if header in headers:
+                headers[header] = "[FILTERED]"
+
+    # Scrub sensitive body fields
+    data = request.get("data")
+    if isinstance(data, dict):
+        for key in list(data.keys()):
+            if SENSITIVE_BODY_PATTERN.search(key):
+                data[key] = "[FILTERED]"
+
+    return event
+
+
+def init_sentry() -> None:
+    """
+    Initialize Sentry for the Python backend.
+    Only initializes if SENTRY_DSN_PYTHON is set.
+    """
+    dsn = os.environ.get("SENTRY_DSN_PYTHON", "")
+    if not dsn:
+        import structlog
+        structlog.get_logger().info("sentry_skip", reason="No SENTRY_DSN_PYTHON set")
+        return
+
+    sentry_sdk.init(
+        dsn=dsn,
+        environment=os.environ.get("ENVIRONMENT", "development"),
+        release=os.environ.get("RELEASE", os.environ.get("GIT_COMMIT_SHA")),
+        traces_sample_rate=0.05,
+        integrations=[FastApiIntegration()],
+        before_send=before_send,
+    )
+
+    import structlog
+    structlog.get_logger().info("sentry_initialized", environment=os.environ.get("ENVIRONMENT", "development"))
diff --git a/python-backend/app/main.py b/python-backend/app/main.py
index efe82a2..f9ff285 100644
--- a/python-backend/app/main.py
+++ b/python-backend/app/main.py
@@ -72,6 +72,10 @@ from app.api.v1 import (
     webhooks,
 )
 
+# Initialize Sentry before anything else (captures startup errors)
+from app.core.sentry_config import init_sentry
+init_sentry()
+
 # Setup logging
 setup_logging()
 logger = structlog.get_logger()
@@ -147,6 +151,14 @@ async def lifespan(app: FastAPI):
     # Cleanup
     logger.info("Shutting down SmartSpec Pro Python Backend")
 
+    # Flush Sentry events
+    try:
+        import sentry_sdk
+        sentry_sdk.flush(timeout=2.0)
+        logger.info("Sentry events flushed")
+    except Exception as e:
+        logger.warning("Sentry flush failed", error=str(e))
+
     # Close checkpointer connection pool
     try:
         from app.core.checkpointer import cleanup_checkpointers
diff --git a/python-backend/requirements.txt b/python-backend/requirements.txt
index 72ab44b..0120da9 100644
--- a/python-backend/requirements.txt
+++ b/python-backend/requirements.txt
@@ -152,3 +152,4 @@ google-auth-httplib2>=0.2.0
 
 # Google Cloud Tasks (Section 04: Celery -> Cloud Tasks migration)
 google-cloud-tasks>=2.14.0
+sentry-sdk[fastapi]
diff --git a/python-backend/tests/unit/test_correlation_id.py b/python-backend/tests/unit/test_correlation_id.py
new file mode 100644
index 0000000..9e51e77
--- /dev/null
+++ b/python-backend/tests/unit/test_correlation_id.py
@@ -0,0 +1,56 @@
+"""Tests for correlation ID middleware in Python backend."""
+
+import re
+import pytest
+import httpx
+
+from fastapi import FastAPI
+
+UUID_PATTERN = re.compile(
+    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
+    re.IGNORECASE,
+)
+
+
+def create_test_app() -> FastAPI:
+    """Create a minimal FastAPI app with the request logging middleware."""
+    app = FastAPI()
+
+    from app.core.request_logging import RequestLoggingMiddleware
+
+    app.add_middleware(RequestLoggingMiddleware)
+
+    @app.get("/test")
+    async def test_endpoint():
+        return {"status": "ok"}
+
+    return app
+
+
+class TestCorrelationId:
+    """Test X-Request-ID generation and forwarding."""
+
+    @pytest.mark.anyio
+    async def test_generates_request_id_when_not_provided(self):
+        app = create_test_app()
+        transport = httpx.ASGITransport(app=app)
+        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
+            response = await client.get("/test")
+
+        assert response.status_code == 200
+        request_id = response.headers.get("x-request-id")
+        assert request_id is not None
+        assert UUID_PATTERN.match(request_id)
+
+    @pytest.mark.anyio
+    async def test_uses_incoming_request_id(self):
+        app = create_test_app()
+        transport = httpx.ASGITransport(app=app)
+        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
+            response = await client.get(
+                "/test",
+                headers={"X-Request-ID": "test-corr-456"},
+            )
+
+        assert response.status_code == 200
+        assert response.headers.get("x-request-id") == "test-corr-456"
diff --git a/python-backend/tests/unit/test_sentry.py b/python-backend/tests/unit/test_sentry.py
new file mode 100644
index 0000000..9cb3a20
--- /dev/null
+++ b/python-backend/tests/unit/test_sentry.py
@@ -0,0 +1,123 @@
+"""Tests for Sentry Python backend integration."""
+
+import pytest
+from unittest.mock import patch, MagicMock
+
+from app.core.sentry_config import before_send, init_sentry
+
+
+class TestBeforeSend:
+    """Test PII scrubbing in before_send callback."""
+
+    def test_scrubs_authorization_header(self):
+        event = {
+            "request": {
+                "headers": {
+                    "authorization": "Bearer secret-token",
+                    "content-type": "application/json",
+                }
+            }
+        }
+
+        result = before_send(event, {})
+
+        assert result is not None
+        assert result["request"]["headers"]["authorization"] == "[FILTERED]"
+        assert result["request"]["headers"]["content-type"] == "application/json"
+
+    def test_scrubs_cookie_header(self):
+        event = {
+            "request": {
+                "headers": {
+                    "cookie": "session=abc123",
+                }
+            }
+        }
+
+        result = before_send(event, {})
+
+        assert result is not None
+        assert result["request"]["headers"]["cookie"] == "[FILTERED]"
+
+    def test_scrubs_x_proxy_token_header(self):
+        event = {
+            "request": {
+                "headers": {
+                    "x-proxy-token": "proxy-secret",
+                }
+            }
+        }
+
+        result = before_send(event, {})
+
+        assert result is not None
+        assert result["request"]["headers"]["x-proxy-token"] == "[FILTERED]"
+
+    def test_scrubs_sensitive_body_fields(self):
+        event = {
+            "request": {
+                "data": {
+                    "username": "john",
+                    "password": "secret123",
+                    "token": "auth-token",
+                    "secret": "shhh",
+                    "apiKey": "key-123",
+                    "normalField": "keep-this",
+                }
+            }
+        }
+
+        result = before_send(event, {})
+
+        assert result is not None
+        data = result["request"]["data"]
+        assert data["username"] == "john"
+        assert data["password"] == "[FILTERED]"
+        assert data["token"] == "[FILTERED]"
+        assert data["secret"] == "[FILTERED]"
+        assert data["apiKey"] == "[FILTERED]"
+        assert data["normalField"] == "keep-this"
+
+    def test_handles_event_without_request(self):
+        event = {"message": "test error"}
+
+        result = before_send(event, {})
+
+        assert result is not None
+        assert result["message"] == "test error"
+
+    def test_handles_event_with_empty_headers(self):
+        event = {"request": {"headers": {}}}
+
+        result = before_send(event, {})
+
+        assert result is not None
+
+
+class TestInitSentry:
+    """Test Sentry initialization."""
+
+    @patch("app.core.sentry_config.sentry_sdk")
+    def test_skips_init_when_no_dsn(self, mock_sdk):
+        with patch.dict("os.environ", {}, clear=True):
+            init_sentry()
+
+        mock_sdk.init.assert_not_called()
+
+    @patch("app.core.sentry_config.sentry_sdk")
+    def test_initializes_with_dsn(self, mock_sdk):
+        env = {
+            "SENTRY_DSN_PYTHON": "https://key@sentry.io/123",
+            "ENVIRONMENT": "production",
+            "RELEASE": "v1.0.0",
+        }
+        with patch.dict("os.environ", env, clear=True):
+            init_sentry()
+
+        mock_sdk.init.assert_called_once()
+        call_kwargs = mock_sdk.init.call_args[1]
+        assert call_kwargs["dsn"] == "https://key@sentry.io/123"
+        assert call_kwargs["environment"] == "production"
+        assert call_kwargs["release"] == "v1.0.0"
+        assert call_kwargs["traces_sample_rate"] == 0.05
+        assert call_kwargs["before_send"] == before_send
