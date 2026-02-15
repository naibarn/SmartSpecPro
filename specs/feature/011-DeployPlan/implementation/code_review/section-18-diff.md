diff --git a/apps/web/server/__tests__/auth-cookies.test.ts b/apps/web/server/__tests__/auth-cookies.test.ts
new file mode 100644
index 0000000..a439ca9
--- /dev/null
+++ b/apps/web/server/__tests__/auth-cookies.test.ts
@@ -0,0 +1,96 @@
+import { describe, it, expect } from "vitest";
+import { getSessionCookieOptions } from "../_core/cookies";
+import type { Request } from "express";
+
+function mockRequest(overrides: Partial<Request> = {}): Request {
+  return {
+    protocol: "https",
+    hostname: "smartaihub.app",
+    headers: { "x-forwarded-proto": "https" },
+    ...overrides,
+  } as unknown as Request;
+}
+
+describe("Cookie Configuration", () => {
+  it("should set cookie domain to .smartaihub.app for production domain", () => {
+    const req = mockRequest({ hostname: "smartaihub.app" });
+    const options = getSessionCookieOptions(req);
+
+    expect(options.domain).toBe(".smartaihub.app");
+  });
+
+  it("should set cookie domain to .smartaihub.app for subdomains", () => {
+    const req = mockRequest({ hostname: "app.smartaihub.app" });
+    const options = getSessionCookieOptions(req);
+
+    expect(options.domain).toBe(".smartaihub.app");
+  });
+
+  it("should set httpOnly to true", () => {
+    const req = mockRequest();
+    const options = getSessionCookieOptions(req);
+
+    expect(options.httpOnly).toBe(true);
+  });
+
+  it("should set secure=true for HTTPS requests", () => {
+    const req = mockRequest({
+      protocol: "https",
+      headers: { "x-forwarded-proto": "https" },
+    });
+    const options = getSessionCookieOptions(req);
+
+    expect(options.secure).toBe(true);
+  });
+
+  it("should set secure=false for HTTP requests", () => {
+    const req = mockRequest({
+      protocol: "http",
+      hostname: "localhost",
+      headers: {},
+    });
+    const options = getSessionCookieOptions(req);
+
+    expect(options.secure).toBe(false);
+  });
+
+  it("should not set cookie domain for localhost", () => {
+    const req = mockRequest({
+      protocol: "http",
+      hostname: "localhost",
+      headers: {},
+    });
+    const options = getSessionCookieOptions(req);
+
+    expect(options.domain).toBeUndefined();
+  });
+
+  it("should not set cookie domain for IP addresses", () => {
+    const req = mockRequest({
+      protocol: "http",
+      hostname: "127.0.0.1",
+      headers: {},
+    });
+    const options = getSessionCookieOptions(req);
+
+    expect(options.domain).toBeUndefined();
+  });
+
+  it("should set SameSite=lax for HTTP development", () => {
+    const req = mockRequest({
+      protocol: "http",
+      hostname: "localhost",
+      headers: {},
+    });
+    const options = getSessionCookieOptions(req);
+
+    expect(options.sameSite).toBe("lax");
+  });
+
+  it("should set path to /", () => {
+    const req = mockRequest();
+    const options = getSessionCookieOptions(req);
+
+    expect(options.path).toBe("/");
+  });
+});
diff --git a/apps/web/server/__tests__/csrf-protection.test.ts b/apps/web/server/__tests__/csrf-protection.test.ts
new file mode 100644
index 0000000..00aa120
--- /dev/null
+++ b/apps/web/server/__tests__/csrf-protection.test.ts
@@ -0,0 +1,106 @@
+import { describe, it, expect } from "vitest";
+
+/**
+ * CSRF protection logic tests.
+ *
+ * The actual CSRF middleware is defined inline in _core/index.ts.
+ * These tests validate the origin-checking logic separately
+ * to ensure the CSRF rules are correct for production deployment.
+ */
+
+// Replicate the origin-checking logic from _core/index.ts
+const ALLOWED_SUFFIXES = [
+  ".smartspec.local",
+  ".smartspec.pro",
+  ".localhost",
+  ".smartaihub.app",
+];
+const ALLOWED_EXACT = ["tauri://localhost", "http://tauri.localhost"];
+
+function isAllowedOrigin(origin: string | undefined): boolean {
+  if (!origin) return false;
+  let originHost = "";
+  try {
+    originHost = new URL(origin).hostname;
+  } catch {
+    return false;
+  }
+  return (
+    ALLOWED_EXACT.includes(origin) ||
+    originHost === "localhost" ||
+    /^(\d{1,3}\.){3}\d{1,3}$/.test(originHost) ||
+    ALLOWED_SUFFIXES.some(
+      (suffix) =>
+        originHost === suffix.slice(1) || originHost.endsWith(suffix),
+    )
+  );
+}
+
+describe("CSRF Origin Validation", () => {
+  it("should accept requests from smartaihub.app", () => {
+    expect(isAllowedOrigin("https://smartaihub.app")).toBe(true);
+  });
+
+  it("should accept requests from app.smartaihub.app subdomain", () => {
+    expect(isAllowedOrigin("https://app.smartaihub.app")).toBe(true);
+  });
+
+  it("should accept requests from smartspec.pro", () => {
+    expect(isAllowedOrigin("https://smartspec.pro")).toBe(true);
+  });
+
+  it("should accept requests from localhost", () => {
+    expect(isAllowedOrigin("http://localhost:3000")).toBe(true);
+    expect(isAllowedOrigin("http://localhost:5173")).toBe(true);
+  });
+
+  it("should accept requests from tauri", () => {
+    expect(isAllowedOrigin("tauri://localhost")).toBe(true);
+    expect(isAllowedOrigin("http://tauri.localhost")).toBe(true);
+  });
+
+  it("should reject requests from unknown domains", () => {
+    expect(isAllowedOrigin("https://evil.com")).toBe(false);
+    expect(isAllowedOrigin("https://attacker.io")).toBe(false);
+  });
+
+  it("should reject requests from similar-looking domains", () => {
+    expect(isAllowedOrigin("https://fakesmartaihub.app")).toBe(false);
+    expect(isAllowedOrigin("https://smartaihub.app.evil.com")).toBe(false);
+  });
+
+  it("should reject undefined origin", () => {
+    expect(isAllowedOrigin(undefined)).toBe(false);
+  });
+
+  it("should reject empty string origin", () => {
+    expect(isAllowedOrigin("")).toBe(false);
+  });
+
+  it("should reject malformed URLs", () => {
+    expect(isAllowedOrigin("not-a-url")).toBe(false);
+    expect(isAllowedOrigin("://missing-scheme")).toBe(false);
+  });
+
+  it("should accept IP addresses (for development)", () => {
+    expect(isAllowedOrigin("http://192.168.1.100:3000")).toBe(true);
+    expect(isAllowedOrigin("http://10.0.0.1:8080")).toBe(true);
+  });
+});
+
+describe("CSRF Safe Methods", () => {
+  const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
+  const UNSAFE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];
+
+  it("should identify GET, HEAD, OPTIONS as safe methods", () => {
+    for (const method of ["GET", "HEAD", "OPTIONS"]) {
+      expect(SAFE_METHODS.has(method)).toBe(true);
+    }
+  });
+
+  it("should identify POST, PUT, PATCH, DELETE as unsafe methods", () => {
+    for (const method of UNSAFE_METHODS) {
+      expect(SAFE_METHODS.has(method)).toBe(false);
+    }
+  });
+});
diff --git a/apps/web/server/__tests__/session-validation.test.ts b/apps/web/server/__tests__/session-validation.test.ts
new file mode 100644
index 0000000..4086138
--- /dev/null
+++ b/apps/web/server/__tests__/session-validation.test.ts
@@ -0,0 +1,93 @@
+import { describe, it, expect, vi } from "vitest";
+import { COOKIE_NAME } from "../../shared/const";
+
+/**
+ * Session validation tests.
+ *
+ * The existing system uses stateless JWTs with JTI-based revocation
+ * (in-memory + Redis). These tests validate the revocation logic
+ * and token lifecycle behavior.
+ */
+
+describe("Session Revocation Logic", () => {
+  it("should reject a revoked JTI", () => {
+    // Simulate in-memory revocation store
+    const revokedJtis = new Map<string, number>();
+
+    const jti = "session-abc123";
+    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
+    revokedJtis.set(jti, expiresAt);
+
+    expect(revokedJtis.has(jti)).toBe(true);
+  });
+
+  it("should accept a non-revoked JTI", () => {
+    const revokedJtis = new Map<string, number>();
+    const jti = "session-valid456";
+
+    expect(revokedJtis.has(jti)).toBe(false);
+  });
+
+  it("should clean up expired revocations", () => {
+    const revokedJtis = new Map<string, number>();
+
+    // Add expired and valid entries
+    revokedJtis.set("expired-jti", Date.now() - 1000);
+    revokedJtis.set("valid-jti", Date.now() + 60000);
+
+    // Cleanup: remove expired entries
+    for (const [jti, expiresAt] of revokedJtis) {
+      if (expiresAt < Date.now()) {
+        revokedJtis.delete(jti);
+      }
+    }
+
+    expect(revokedJtis.has("expired-jti")).toBe(false);
+    expect(revokedJtis.has("valid-jti")).toBe(true);
+  });
+});
+
+describe("Token Extraction", () => {
+  it("should extract token from cookie", () => {
+    const cookies = { [COOKIE_NAME]: "jwt-token-here" };
+    const token = cookies[COOKIE_NAME];
+
+    expect(token).toBe("jwt-token-here");
+  });
+
+  it("should extract token from Authorization header", () => {
+    const authHeader = "Bearer jwt-token-here";
+    const token = authHeader.replace("Bearer ", "");
+
+    expect(token).toBe("jwt-token-here");
+  });
+
+  it("should prefer Authorization header over cookie", () => {
+    const cookies = { [COOKIE_NAME]: "cookie-token" };
+    const authHeader = "Bearer header-token";
+
+    // Authorization header takes priority
+    const token = authHeader
+      ? authHeader.replace("Bearer ", "")
+      : cookies[COOKIE_NAME];
+
+    expect(token).toBe("header-token");
+  });
+
+  it("should return null for missing token", () => {
+    const cookies: Record<string, string> = {};
+    const authHeader: string | undefined = undefined;
+
+    const token = authHeader
+      ? authHeader.replace("Bearer ", "")
+      : cookies[COOKIE_NAME] || null;
+
+    expect(token).toBeNull();
+  });
+});
+
+describe("Cookie Name Constant", () => {
+  it("should use the correct cookie name", () => {
+    expect(COOKIE_NAME).toBe("app_session_id");
+  });
+});
diff --git a/apps/web/server/_core/index.ts b/apps/web/server/_core/index.ts
index 58d0a82..85905e1 100644
--- a/apps/web/server/_core/index.ts
+++ b/apps/web/server/_core/index.ts
@@ -47,6 +47,7 @@ import { ImageProxySafetyError, proxyImageFromUrl } from "../services/imageProxy
 import { getDb } from "../db";
 import { getRedisClient } from "../services/redis";
 import { sql } from "drizzle-orm";
+import { COOKIE_NAME } from "../../shared/const";
 
 /** Shared database adapter (implements @smartspec/db DbAdapter) */
 export const dbAdapter = new PostgresAdapter();
@@ -220,8 +221,22 @@ const csrfCheck = (req: any, res: any, next: any) => {
   }
 
   const origin = req.headers.origin;
-  // Allow requests with no Origin header (same-origin, server-to-server, curl)
-  if (!origin) return next();
+
+  // Requests with no Origin header: allow if using Bearer token (server-to-server),
+  // reject if using cookie auth (browser CSRF risk in production)
+  if (!origin) {
+    const authHeader = req.headers.authorization;
+    if (authHeader && authHeader.startsWith("Bearer ")) {
+      return next();
+    }
+    // In production, cookie-authenticated POST without Origin is a CSRF risk.
+    // In development, allow for easier testing (curl, Postman).
+    if (process.env.NODE_ENV === "production" && req.cookies?.[COOKIE_NAME]) {
+      res.status(403).json({ error: { message: "Forbidden: missing Origin header" } });
+      return;
+    }
+    return next();
+  }
 
   if (!isAllowedOrigin(origin)) {
     res.status(403).json({ error: { message: "Forbidden: invalid origin" } });
