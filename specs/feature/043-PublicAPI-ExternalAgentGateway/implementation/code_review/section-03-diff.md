diff --git a/apps/web/server/__tests__/authExtension.test.ts b/apps/web/server/__tests__/authExtension.test.ts
new file mode 100644
index 00000000..ae096a30
--- /dev/null
+++ b/apps/web/server/__tests__/authExtension.test.ts
@@ -0,0 +1,165 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+// Mock tokens.ts to avoid JWT_SECRET module-level check
+vi.mock("../_core/tokens", () => ({
+  verifyBearerToken: vi.fn().mockRejectedValue(new Error("Invalid token")),
+  signBearerToken: vi.fn().mockReturnValue("mock-token"),
+}));
+
+// Mock apiKeyService before importing authz
+vi.mock("../services/apiKeyService", () => ({
+  validateKey: vi.fn(),
+}));
+
+// Mock sdk
+vi.mock("../_core/sdk", () => ({
+  sdk: {
+    authenticateRequest: vi.fn(),
+  },
+}));
+
+// Mock revocation
+vi.mock("../_core/revocation", () => ({
+  isJtiRevoked: vi.fn().mockResolvedValue(false),
+}));
+
+// Mock ENV
+vi.mock("../_core/env", () => ({
+  ENV: {
+    mcpServerToken: "test-mcp-token",
+    webGatewayToken: "test-gateway-token",
+    apiKeyHmacSecret: "test-hmac-key.short",
+  },
+}));
+
+import { authorizeRequest } from "../_core/authz";
+import { validateKey } from "../services/apiKeyService";
+import { sdk } from "../_core/sdk";
+
+function makeReq(headers: Record<string, string> = {}, cookies: Record<string, string> = {}) {
+  return {
+    headers,
+    cookies,
+  } as any;
+}
+
+describe("authExtension — API key auth in authorizeRequest", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it("detects sk-ssp_ prefix and routes to API key validation", async () => {
+    (validateKey as any).mockResolvedValue({
+      userId: 42,
+      tenantId: "tenant-uuid-abc",
+      mode: "api_key",
+      apiKeyId: "key-id-123",
+      scopes: ["skills:execute"],
+    });
+
+    const req = makeReq({ authorization: "Bearer sk-ssp_abc12345_someRandomKeyData123" });
+    const result = await authorizeRequest(req, { allowBearer: true, allowSession: false });
+
+    expect(result.ok).toBe(true);
+    if (result.ok) {
+      expect(result.mode).toBe("api_key");
+    }
+    expect(validateKey).toHaveBeenCalledWith("sk-ssp_abc12345_someRandomKeyData123");
+  });
+
+  it("falls through to JWT for non-sk-ssp_ tokens", async () => {
+    const req = makeReq({ authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.test" });
+    // JWT verify will fail, but validateKey should NOT be called
+    await authorizeRequest(req, { allowBearer: true, allowSession: false });
+
+    expect(validateKey).not.toHaveBeenCalled();
+  });
+
+  it("returns mode='api_key' with correct AuthContext fields", async () => {
+    (validateKey as any).mockResolvedValue({
+      userId: 42,
+      tenantId: "tenant-uuid-abc",
+      mode: "api_key",
+      apiKeyId: "key-id-123",
+      scopes: ["skills:execute", "skills:list"],
+    });
+
+    const req = makeReq({ authorization: "Bearer sk-ssp_abc12345_someRandomKeyData123" });
+    const result = await authorizeRequest(req, { allowBearer: true, allowSession: false });
+
+    expect(result).toEqual(
+      expect.objectContaining({
+        ok: true,
+        mode: "api_key",
+        sub: "42",
+        tenantId: "tenant-uuid-abc",
+        apiKeyId: "key-id-123",
+        scopes: ["skills:execute", "skills:list"],
+        userId: 42,
+      }),
+    );
+  });
+
+  it("returns tenantId as string (varchar(36))", async () => {
+    (validateKey as any).mockResolvedValue({
+      userId: 1,
+      tenantId: "a1b2c3d4-e5f6-7890-abcd-ef0123456789",
+      mode: "api_key",
+      apiKeyId: "kid",
+      scopes: [],
+    });
+
+    const req = makeReq({ authorization: "Bearer sk-ssp_a1b2c3d4_test" });
+    const result = await authorizeRequest(req, { allowBearer: true, allowSession: false });
+
+    expect(result.ok).toBe(true);
+    if (result.ok && result.mode === "api_key") {
+      expect(typeof result.tenantId).toBe("string");
+    }
+  });
+
+  it("existing static token auth still works after API key auth is added", async () => {
+    const req = makeReq({ authorization: "Bearer test-mcp-token" });
+    const result = await authorizeRequest(req, { allowBearer: true, allowSession: false });
+
+    expect(result).toEqual({
+      ok: true,
+      mode: "bearer",
+      sub: "static",
+      scopes: ["mcp:read", "mcp:write"],
+    });
+    expect(validateKey).not.toHaveBeenCalled();
+  });
+
+  it("existing session auth still works after API key auth is added", async () => {
+    (sdk.authenticateRequest as any).mockResolvedValue({ id: 5, openId: "open-5" });
+    const req = makeReq({}, { session: "valid" });
+    const result = await authorizeRequest(req, { allowBearer: false, allowSession: true });
+
+    expect(result.ok).toBe(true);
+    if (result.ok) {
+      expect(result.mode).toBe("session");
+    }
+  });
+
+  it("returns ok: false when API key is invalid", async () => {
+    (validateKey as any).mockResolvedValue(null);
+
+    const req = makeReq({ authorization: "Bearer sk-ssp_abc12345_invalid" });
+    const result = await authorizeRequest(req, { allowBearer: true, allowSession: false });
+
+    expect(result.ok).toBe(false);
+    if (!result.ok) {
+      expect(result.error).toContain("Invalid API key");
+    }
+  });
+
+  it("handles malformed sk-ssp_ key (too short)", async () => {
+    (validateKey as any).mockResolvedValue(null);
+
+    const req = makeReq({ authorization: "Bearer sk-ssp_" });
+    const result = await authorizeRequest(req, { allowBearer: true, allowSession: false });
+
+    expect(result.ok).toBe(false);
+  });
+});
diff --git a/apps/web/server/__tests__/publicApiFeatureGuard.test.ts b/apps/web/server/__tests__/publicApiFeatureGuard.test.ts
new file mode 100644
index 00000000..c751e564
--- /dev/null
+++ b/apps/web/server/__tests__/publicApiFeatureGuard.test.ts
@@ -0,0 +1,101 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+vi.mock("../services/tenantFeatureFlagService", () => ({
+  getTenantFeatureFlags: vi.fn(),
+}));
+
+import { publicApiFeatureGuard } from "../middleware/publicApiFeatureGuard";
+import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
+
+function makeReqRes(authOverrides: Record<string, any> = {}) {
+  const req = {
+    auth: {
+      ok: true,
+      mode: "api_key",
+      sub: "42",
+      scopes: ["skills:list"],
+      tenantId: "tenant-uuid",
+      apiKeyId: "key-id",
+      userId: 42,
+      ...authOverrides,
+    },
+  } as any;
+
+  const res = {
+    status: vi.fn().mockReturnThis(),
+    json: vi.fn().mockReturnThis(),
+  } as any;
+
+  const next = vi.fn();
+  return { req, res, next };
+}
+
+describe("publicApiFeatureGuard middleware", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it("rejects API key auth when tenant publicApi=false", async () => {
+    (getTenantFeatureFlags as any).mockResolvedValue({ publicApi: false });
+    const { req, res, next } = makeReqRes();
+
+    await publicApiFeatureGuard(req, res, next);
+
+    expect(res.status).toHaveBeenCalledWith(403);
+    expect(res.json).toHaveBeenCalledWith(
+      expect.objectContaining({
+        error: expect.objectContaining({ code: "feature_disabled" }),
+      }),
+    );
+    expect(next).not.toHaveBeenCalled();
+  });
+
+  it("passes API key auth when tenant publicApi=true", async () => {
+    (getTenantFeatureFlags as any).mockResolvedValue({ publicApi: true });
+    const { req, res, next } = makeReqRes();
+
+    await publicApiFeatureGuard(req, res, next);
+
+    expect(next).toHaveBeenCalled();
+    expect(res.status).not.toHaveBeenCalled();
+  });
+
+  it("session auth bypasses publicApi guard", async () => {
+    const { req, res, next } = makeReqRes({ mode: "session" });
+
+    await publicApiFeatureGuard(req, res, next);
+
+    expect(next).toHaveBeenCalled();
+    expect(getTenantFeatureFlags).not.toHaveBeenCalled();
+  });
+
+  it("bearer auth bypasses publicApi guard", async () => {
+    const { req, res, next } = makeReqRes({ mode: "bearer" });
+
+    await publicApiFeatureGuard(req, res, next);
+
+    expect(next).toHaveBeenCalled();
+    expect(getTenantFeatureFlags).not.toHaveBeenCalled();
+  });
+
+  it("handles Redis/DB lookup failure gracefully", async () => {
+    (getTenantFeatureFlags as any).mockRejectedValue(new Error("Redis down"));
+    const { req, res, next } = makeReqRes();
+
+    await publicApiFeatureGuard(req, res, next);
+
+    expect(res.status).toHaveBeenCalledWith(500);
+    expect(next).not.toHaveBeenCalled();
+  });
+
+  it("returns 401 when no auth is attached", async () => {
+    const req = {} as any;
+    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
+    const next = vi.fn();
+
+    await publicApiFeatureGuard(req, res, next);
+
+    expect(res.status).toHaveBeenCalledWith(401);
+    expect(next).not.toHaveBeenCalled();
+  });
+});
diff --git a/apps/web/server/__tests__/requireScopes.test.ts b/apps/web/server/__tests__/requireScopes.test.ts
new file mode 100644
index 00000000..bba7ecc6
--- /dev/null
+++ b/apps/web/server/__tests__/requireScopes.test.ts
@@ -0,0 +1,101 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { requireScopes } from "../middleware/requireScopes";
+
+function makeReqRes(authOverrides: Record<string, any> = {}) {
+  const req = {
+    auth: {
+      ok: true,
+      mode: "api_key",
+      sub: "42",
+      scopes: ["skills:list", "skills:execute"],
+      tenantId: "tenant-uuid",
+      apiKeyId: "key-id",
+      userId: 42,
+      ...authOverrides,
+    },
+  } as any;
+
+  const res = {
+    status: vi.fn().mockReturnThis(),
+    json: vi.fn().mockReturnThis(),
+  } as any;
+
+  const next = vi.fn();
+  return { req, res, next };
+}
+
+describe("requireScopes middleware", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it("returns 403 for missing scope", () => {
+    const { req, res, next } = makeReqRes({ scopes: ["skills:list"] });
+    const mw = requireScopes("skills:execute");
+    mw(req, res, next);
+
+    expect(res.status).toHaveBeenCalledWith(403);
+    expect(res.json).toHaveBeenCalledWith(
+      expect.objectContaining({
+        error: expect.objectContaining({ code: "insufficient_scopes" }),
+      }),
+    );
+    expect(next).not.toHaveBeenCalled();
+  });
+
+  it("passes for matching scope", () => {
+    const { req, res, next } = makeReqRes({ scopes: ["skills:execute", "skills:list"] });
+    const mw = requireScopes("skills:execute");
+    mw(req, res, next);
+
+    expect(next).toHaveBeenCalled();
+    expect(res.status).not.toHaveBeenCalled();
+  });
+
+  it("grants all scopes for session auth (web UI)", () => {
+    const { req, res, next } = makeReqRes({ mode: "session", scopes: undefined });
+    const mw = requireScopes("skills:execute");
+    mw(req, res, next);
+
+    expect(next).toHaveBeenCalled();
+  });
+
+  it("checks multiple scopes (AND logic)", () => {
+    const { req, res, next } = makeReqRes({ scopes: ["skills:execute"] });
+    const mw = requireScopes("skills:execute", "agencies:invoke");
+    mw(req, res, next);
+
+    expect(res.status).toHaveBeenCalledWith(403);
+    expect(next).not.toHaveBeenCalled();
+  });
+
+  it("passes when all multiple scopes are present", () => {
+    const { req, res, next } = makeReqRes({
+      scopes: ["skills:execute", "agencies:invoke", "skills:list"],
+    });
+    const mw = requireScopes("skills:execute", "agencies:invoke");
+    mw(req, res, next);
+
+    expect(next).toHaveBeenCalled();
+  });
+
+  it("grants all scopes for bearer auth", () => {
+    const { req, res, next } = makeReqRes({ mode: "bearer" });
+    const mw = requireScopes("skills:execute");
+    mw(req, res, next);
+
+    expect(next).toHaveBeenCalled();
+  });
+
+  it("returns 401 when no auth is attached", () => {
+    const req = {} as any;
+    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
+    const next = vi.fn();
+
+    const mw = requireScopes("skills:execute");
+    mw(req, res, next);
+
+    expect(res.status).toHaveBeenCalledWith(401);
+    expect(next).not.toHaveBeenCalled();
+  });
+});
diff --git a/apps/web/server/_core/authz.ts b/apps/web/server/_core/authz.ts
index beaceb14..731d0303 100644
--- a/apps/web/server/_core/authz.ts
+++ b/apps/web/server/_core/authz.ts
@@ -3,10 +3,12 @@ import { ENV } from "./env";
 import { sdk } from "./sdk";
 import { verifyBearerToken } from "./tokens";
 import { isJtiRevoked } from "./revocation";
+import { validateKey } from "../services/apiKeyService";
 
 export type AuthResult =
   | { ok: true; mode: "bearer"; sub: string; scopes: string[] }
   | { ok: true; mode: "session"; user: any; sub: string; scopes: string[] }
+  | { ok: true; mode: "api_key"; sub: string; scopes: string[]; tenantId: string; apiKeyId: string; userId: number }
   | { ok: false; error: string };
 
 function parseBearer(req: Request): string | null {
@@ -30,6 +32,23 @@ export async function authorizeRequest(
   if (opts.allowBearer) {
     const token = parseBearer(req);
     if (token) {
+      // API key detection (sk-ssp_ prefix)
+      if (token.startsWith("sk-ssp_")) {
+        const authCtx = await validateKey(token);
+        if (authCtx) {
+          return {
+            ok: true,
+            mode: "api_key",
+            sub: String(authCtx.userId),
+            scopes: authCtx.scopes ?? [],
+            tenantId: authCtx.tenantId,
+            apiKeyId: authCtx.apiKeyId!,
+            userId: authCtx.userId,
+          };
+        }
+        return { ok: false, error: "Invalid API key" };
+      }
+
       // Static token shortcut (if configured)
       const staticScopes = scopesForStaticToken(token);
       if (staticScopes.length) {
diff --git a/apps/web/server/_core/llmRoutes.ts b/apps/web/server/_core/llmRoutes.ts
index 30d43eeb..593db6db 100644
--- a/apps/web/server/_core/llmRoutes.ts
+++ b/apps/web/server/_core/llmRoutes.ts
@@ -698,6 +698,11 @@ function transformRequestBody(
  * Extract user ID from auth result
  */
 async function getUserIdFromAuth(auth: AuthResult & { ok: true }): Promise<number | null> {
+  // For API key auth, userId is directly available
+  if (auth.mode === "api_key") {
+    return auth.userId;
+  }
+
   // For session auth, user object contains id
   if (auth.mode === "session" && auth.user?.id) {
     return auth.user.id;
diff --git a/apps/web/server/_core/tokens.ts b/apps/web/server/_core/tokens.ts
index c4359b1e..692f3dca 100644
--- a/apps/web/server/_core/tokens.ts
+++ b/apps/web/server/_core/tokens.ts
@@ -122,3 +122,24 @@ export function getDefaultScopes(): string[] {
     "profile:read",
   ];
 }
+
+/**
+ * Create a short-lived internal bearer token from an AuthContext.
+ * Used to call service functions that still expect a userToken string
+ * (e.g., Python backend communication via X-User-Token header).
+ */
+export function createInternalTokenFromAuth(
+  auth: { userId: number },
+  scopes?: string[],
+): string {
+  const crypto = require("crypto");
+  return signBearerToken(
+    {
+      sub: String(auth.userId),
+      type: "access",
+      scopes: scopes ?? ["media:generate", "presentation:export"],
+      jti: `api_${Date.now()}_${crypto.randomBytes(12).toString("hex")}`,
+    },
+    "15m",
+  );
+}
diff --git a/apps/web/server/middleware/publicApiFeatureGuard.ts b/apps/web/server/middleware/publicApiFeatureGuard.ts
new file mode 100644
index 00000000..d80f656a
--- /dev/null
+++ b/apps/web/server/middleware/publicApiFeatureGuard.ts
@@ -0,0 +1,58 @@
+import type { Request, Response, NextFunction } from "express";
+import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
+
+/**
+ * Express middleware that checks the tenant `publicApi` feature flag.
+ * Only applies to API key auth — session and bearer auth bypass this check.
+ */
+export async function publicApiFeatureGuard(
+  req: Request,
+  res: Response,
+  next: NextFunction,
+) {
+  const auth = req.auth;
+  if (!auth) {
+    res.status(401).json({
+      error: {
+        code: "invalid_api_key",
+        message: "Authentication required",
+        type: "auth_error",
+      },
+    });
+    return;
+  }
+
+  // Session and bearer auth bypass feature flag check
+  if (auth.mode === "session" || auth.mode === "bearer") {
+    next();
+    return;
+  }
+
+  // API key auth: check tenant publicApi flag
+  if (auth.mode === "api_key") {
+    try {
+      const flags = await getTenantFeatureFlags(auth.tenantId);
+      if (!flags.publicApi) {
+        res.status(403).json({
+          error: {
+            code: "feature_disabled",
+            message: "Public API access is not enabled for this tenant",
+            type: "auth_error",
+          },
+        });
+        return;
+      }
+    } catch {
+      res.status(500).json({
+        error: {
+          code: "internal_error",
+          message: "Failed to verify feature access",
+          type: "server_error",
+        },
+      });
+      return;
+    }
+  }
+
+  next();
+}
diff --git a/apps/web/server/middleware/requireScopes.ts b/apps/web/server/middleware/requireScopes.ts
new file mode 100644
index 00000000..07ae856e
--- /dev/null
+++ b/apps/web/server/middleware/requireScopes.ts
@@ -0,0 +1,54 @@
+import type { Request, Response, NextFunction } from "express";
+import type { AuthResult } from "../_core/authz";
+
+declare global {
+  namespace Express {
+    interface Request {
+      /** Populated by apiKeyAuthMiddleware for /v1/* routes */
+      auth?: AuthResult & { ok: true };
+    }
+  }
+}
+
+/**
+ * Express middleware factory that enforces API scope requirements.
+ * Session and bearer auth bypass scope checks (full access).
+ * API key auth requires all listed scopes (AND logic).
+ */
+export function requireScopes(...requiredScopes: string[]) {
+  return (req: Request, res: Response, next: NextFunction) => {
+    const auth = req.auth;
+    if (!auth) {
+      res.status(401).json({
+        error: {
+          code: "invalid_api_key",
+          message: "Authentication required",
+          type: "auth_error",
+        },
+      });
+      return;
+    }
+
+    // Session and bearer auth have implicit full access
+    if (auth.mode === "session" || auth.mode === "bearer") {
+      next();
+      return;
+    }
+
+    // API key auth: check all required scopes (AND logic)
+    const keyScopes = auth.scopes ?? [];
+    const missing = requiredScopes.filter((s) => !keyScopes.includes(s));
+    if (missing.length > 0) {
+      res.status(403).json({
+        error: {
+          code: "insufficient_scopes",
+          message: `Missing required scopes: ${missing.join(", ")}`,
+          type: "auth_error",
+        },
+      });
+      return;
+    }
+
+    next();
+  };
+}
diff --git a/apps/web/server/services/tenantFeatureFlagService.ts b/apps/web/server/services/tenantFeatureFlagService.ts
index 4ffd7f32..1458ac10 100644
--- a/apps/web/server/services/tenantFeatureFlagService.ts
+++ b/apps/web/server/services/tenantFeatureFlagService.ts
@@ -34,6 +34,10 @@ const REDIS_SYNCED_FLAGS: ReadonlySet<TenantFeatureFlagKey> = new Set([
   "channelRouter",
   "taskPlannerEnabled",
   "taskPlannerAgencyEscalation",
+  "chatBrowserSessionEntry",
+  "agencyBrowserSessionUi",
+  "workflowBrowserSessionNodes",
+  "publicApi",
 ]);
 
 /**
