diff --git a/apps/web/server/middleware/__tests__/apiAuditMiddleware.test.ts b/apps/web/server/middleware/__tests__/apiAuditMiddleware.test.ts
new file mode 100644
index 00000000..caea7d51
--- /dev/null
+++ b/apps/web/server/middleware/__tests__/apiAuditMiddleware.test.ts
@@ -0,0 +1,123 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+vi.mock("../../db", () => {
+  const values = vi.fn().mockResolvedValue(undefined);
+  const insert = vi.fn().mockReturnValue({ values });
+  return { db: { insert, __mockValues: values } };
+});
+
+vi.mock("../../../drizzle/schema", () => ({
+  publicApiAuditLog: { _: "publicApiAuditLog" },
+}));
+
+import { apiAuditMiddleware } from "../apiAuditMiddleware";
+import { db } from "../../db";
+
+const mockInsert = db.insert as any;
+const mockValues = (db as any).__mockValues;
+
+function makeReqRes() {
+  const req: any = {
+    auth: {
+      ok: true,
+      mode: "api_key",
+      tenantId: "tenant-uuid",
+      userId: 42,
+      apiKeyId: "key-uuid",
+      sub: "42",
+      scopes: ["skills:list"],
+    },
+    method: "POST",
+    path: "/v1/skills/abc/execute",
+    query: { stream: "true" },
+    ip: "1.2.3.4",
+    headers: {
+      "content-length": "100",
+      authorization: "Bearer sk-ssp_abc12345_secretKey",
+      "user-agent": "TestAgent/1.0",
+    },
+    requestId: "trace-123",
+  };
+
+  const finishCallbacks: (() => void)[] = [];
+  const res: any = {
+    statusCode: 200,
+    on: (event: string, cb: () => void) => {
+      if (event === "finish") finishCallbacks.push(cb);
+    },
+    getHeader: (name: string) => {
+      if (name === "X-Credits-Used") return "5";
+      return undefined;
+    },
+    _triggerFinish: () => finishCallbacks.forEach((cb) => cb()),
+  };
+
+  const next = vi.fn();
+  return { req, res, next };
+}
+
+describe("apiAuditMiddleware", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it("creates audit record for API key request", () => {
+    const { req, res, next } = makeReqRes();
+    apiAuditMiddleware(req, res, next);
+
+    expect(next).toHaveBeenCalled();
+
+    // Trigger finish
+    res._triggerFinish();
+
+    expect(mockInsert).toHaveBeenCalled();
+    expect(mockValues).toHaveBeenCalledWith(
+      expect.objectContaining({
+        tenantId: "tenant-uuid",
+        userId: 42,
+        apiKeyId: "key-uuid",
+        method: "POST",
+        path: "/v1/skills/abc/execute",
+      }),
+    );
+  });
+
+  it("captures statusCode, creditsUsed, latencyMs", () => {
+    const { req, res, next } = makeReqRes();
+    apiAuditMiddleware(req, res, next);
+    res._triggerFinish();
+
+    const insertArg = mockValues.mock.calls[0][0];
+    expect(insertArg.statusCode).toBe(200);
+    expect(insertArg.creditsUsed).toBe(5);
+    expect(insertArg.latencyMs).toBeGreaterThanOrEqual(0);
+  });
+
+  it("sanitizes Authorization header in requestMeta", () => {
+    const { req, res, next } = makeReqRes();
+    apiAuditMiddleware(req, res, next);
+    res._triggerFinish();
+
+    const insertArg = mockValues.mock.calls[0][0];
+    expect(insertArg.requestMeta.authorization).toBe("Bearer [REDACTED]");
+  });
+
+  it("skips for session auth", () => {
+    const { req, res, next } = makeReqRes();
+    req.auth.mode = "session";
+    apiAuditMiddleware(req, res, next);
+
+    expect(next).toHaveBeenCalled();
+    expect(mockInsert).not.toHaveBeenCalled();
+  });
+
+  it("is non-blocking on insert failure", () => {
+    mockValues.mockRejectedValueOnce(new Error("DB error"));
+    const { req, res, next } = makeReqRes();
+    apiAuditMiddleware(req, res, next);
+    res._triggerFinish();
+
+    // Should not throw
+    expect(next).toHaveBeenCalled();
+  });
+});
diff --git a/apps/web/server/middleware/__tests__/idempotencyMiddleware.test.ts b/apps/web/server/middleware/__tests__/idempotencyMiddleware.test.ts
new file mode 100644
index 00000000..fb12fe69
--- /dev/null
+++ b/apps/web/server/middleware/__tests__/idempotencyMiddleware.test.ts
@@ -0,0 +1,115 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+const mockRedis = {
+  set: vi.fn(),
+  get: vi.fn(),
+  del: vi.fn(),
+};
+
+vi.mock("../../services/redis", () => ({
+  getRedisClient: () => mockRedis,
+}));
+
+import { idempotencyMiddleware } from "../idempotencyMiddleware";
+
+function makeReqRes(overrides: Record<string, any> = {}) {
+  const req: any = {
+    method: "POST",
+    headers: { "idempotency-key": "test-idem-key" },
+    auth: { tenantId: "tenant-uuid" },
+    ...overrides,
+  };
+
+  const _headers: Record<string, string> = {};
+  const res: any = {
+    statusCode: 200,
+    status: vi.fn().mockReturnThis(),
+    json: vi.fn().mockReturnThis(),
+    send: vi.fn().mockReturnThis(),
+    setHeader: (k: string, v: string) => {
+      _headers[k] = v;
+    },
+    getHeader: (k: string) => _headers[k],
+  };
+
+  const next = vi.fn();
+  return { req, res, next };
+}
+
+describe("idempotencyMiddleware", () => {
+  const mw = idempotencyMiddleware();
+
+  beforeEach(() => {
+    vi.clearAllMocks();
+    mockRedis.set.mockResolvedValue("OK");
+    mockRedis.get.mockResolvedValue(null);
+    mockRedis.del.mockResolvedValue(1);
+  });
+
+  it("skips GET requests", async () => {
+    const { req, res, next } = makeReqRes({ method: "GET" });
+    await mw(req, res, next);
+    expect(next).toHaveBeenCalled();
+    expect(mockRedis.set).not.toHaveBeenCalled();
+  });
+
+  it("skips when no Idempotency-Key header", async () => {
+    const { req, res, next } = makeReqRes({ headers: {} });
+    await mw(req, res, next);
+    expect(next).toHaveBeenCalled();
+  });
+
+  it("returns cached response on second call", async () => {
+    mockRedis.get.mockResolvedValue(
+      JSON.stringify({
+        statusCode: 200,
+        body: '{"ok":true}',
+        contentType: "application/json",
+      }),
+    );
+
+    const { req, res, next } = makeReqRes();
+    await mw(req, res, next);
+
+    expect(res.status).toHaveBeenCalledWith(200);
+    expect(res.send).toHaveBeenCalledWith('{"ok":true}');
+    expect(next).not.toHaveBeenCalled();
+  });
+
+  it("returns 409 when lock is already held", async () => {
+    mockRedis.set.mockResolvedValue(null); // NX failed
+
+    const { req, res, next } = makeReqRes();
+    await mw(req, res, next);
+
+    expect(res.status).toHaveBeenCalledWith(409);
+    expect(res.json).toHaveBeenCalledWith(
+      expect.objectContaining({
+        error: expect.objectContaining({ code: "idempotency_conflict" }),
+      }),
+    );
+  });
+
+  it("rejects key longer than 64 chars", async () => {
+    const { req, res, next } = makeReqRes({
+      headers: { "idempotency-key": "a".repeat(65) },
+    });
+    await mw(req, res, next);
+
+    expect(res.status).toHaveBeenCalledWith(400);
+    expect(next).not.toHaveBeenCalled();
+  });
+
+  it("idempotency keys are tenant-scoped", async () => {
+    const { req, res, next } = makeReqRes();
+    await mw(req, res, next);
+
+    expect(mockRedis.set).toHaveBeenCalledWith(
+      expect.stringContaining("idempotency:lock:tenant-uuid:test-idem-key"),
+      expect.any(String),
+      "EX",
+      60,
+      "NX",
+    );
+  });
+});
diff --git a/apps/web/server/middleware/__tests__/publicApiCors.test.ts b/apps/web/server/middleware/__tests__/publicApiCors.test.ts
new file mode 100644
index 00000000..8833c793
--- /dev/null
+++ b/apps/web/server/middleware/__tests__/publicApiCors.test.ts
@@ -0,0 +1,50 @@
+import { describe, it, expect, vi } from "vitest";
+import { publicApiCorsMiddleware } from "../publicApiCors";
+
+function makeReqRes(method = "GET") {
+  const headers: Record<string, string> = {};
+  const req: any = { method };
+  const res: any = {
+    setHeader: (k: string, v: string) => {
+      headers[k] = v;
+    },
+    status: vi.fn().mockReturnThis(),
+    end: vi.fn(),
+    _headers: headers,
+  };
+  const next = vi.fn();
+  return { req, res, next, headers };
+}
+
+describe("publicApiCors", () => {
+  it("sets CORS headers on normal request", () => {
+    const { req, res, next, headers } = makeReqRes("GET");
+    publicApiCorsMiddleware(req, res, next);
+
+    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
+    expect(headers["Access-Control-Allow-Methods"]).toContain("GET");
+    expect(headers["Access-Control-Allow-Methods"]).toContain("POST");
+    expect(headers["Access-Control-Allow-Headers"]).toContain("Authorization");
+    expect(headers["Access-Control-Allow-Headers"]).toContain("Idempotency-Key");
+    expect(next).toHaveBeenCalled();
+  });
+
+  it("returns 204 for OPTIONS preflight", () => {
+    const { req, res, next } = makeReqRes("OPTIONS");
+    publicApiCorsMiddleware(req, res, next);
+
+    expect(res.status).toHaveBeenCalledWith(204);
+    expect(res.end).toHaveBeenCalled();
+    expect(next).not.toHaveBeenCalled();
+  });
+
+  it("exposes custom headers", () => {
+    const { req, res, next, headers } = makeReqRes("GET");
+    publicApiCorsMiddleware(req, res, next);
+
+    const exposed = headers["Access-Control-Expose-Headers"];
+    expect(exposed).toContain("X-Request-Id");
+    expect(exposed).toContain("X-Credits-Used");
+    expect(exposed).toContain("X-RateLimit-Limit");
+  });
+});
diff --git a/apps/web/server/middleware/__tests__/publicApiHeaders.test.ts b/apps/web/server/middleware/__tests__/publicApiHeaders.test.ts
new file mode 100644
index 00000000..18463ede
--- /dev/null
+++ b/apps/web/server/middleware/__tests__/publicApiHeaders.test.ts
@@ -0,0 +1,99 @@
+import { describe, it, expect, vi } from "vitest";
+import {
+  publicApiHeadersMiddleware,
+  formatApiError,
+  sendApiError,
+} from "../publicApiHeaders";
+
+describe("publicApiHeadersMiddleware", () => {
+  it("sets X-Request-Id from req.requestId", () => {
+    const headers: Record<string, string> = {};
+    const req: any = { requestId: "trace-abc-123" };
+    const res: any = {
+      setHeader: (k: string, v: string) => {
+        headers[k] = v;
+      },
+    };
+    const next = vi.fn();
+
+    publicApiHeadersMiddleware(req, res, next);
+
+    expect(headers["X-Request-Id"]).toBe("trace-abc-123");
+    expect(next).toHaveBeenCalled();
+  });
+
+  it("skips X-Request-Id when requestId is absent", () => {
+    const headers: Record<string, string> = {};
+    const req: any = {};
+    const res: any = {
+      setHeader: (k: string, v: string) => {
+        headers[k] = v;
+      },
+    };
+    const next = vi.fn();
+
+    publicApiHeadersMiddleware(req, res, next);
+
+    expect(headers["X-Request-Id"]).toBeUndefined();
+    expect(next).toHaveBeenCalled();
+  });
+});
+
+describe("formatApiError", () => {
+  it("formats auth error correctly", () => {
+    const result = formatApiError("invalid_api_key", "Bad key");
+    expect(result).toEqual({
+      error: {
+        code: "invalid_api_key",
+        message: "Bad key",
+        type: "auth_error",
+      },
+    });
+  });
+
+  it("formats billing error correctly", () => {
+    const result = formatApiError(
+      "insufficient_credits",
+      "Not enough credits",
+    );
+    expect(result.error.type).toBe("billing_error");
+  });
+
+  it("formats rate limit error correctly", () => {
+    const result = formatApiError("rate_limit_exceeded", "Too fast");
+    expect(result.error.type).toBe("rate_limit_error");
+  });
+
+  it("formats feature disabled error correctly", () => {
+    const result = formatApiError("feature_disabled", "API disabled");
+    expect(result.error.type).toBe("auth_error");
+  });
+
+  it("falls back to internal_error for unknown codes", () => {
+    const result = formatApiError("unknown_code", "Something");
+    expect(result.error.type).toBe("internal_error");
+  });
+
+  it("allows explicit type override", () => {
+    const result = formatApiError("invalid_api_key", "Bad key", "custom_type");
+    expect(result.error.type).toBe("custom_type");
+  });
+});
+
+describe("sendApiError", () => {
+  it("sets status and sends formatted error", () => {
+    const res: any = {
+      status: vi.fn().mockReturnThis(),
+      json: vi.fn().mockReturnThis(),
+    };
+
+    sendApiError(res, 401, "invalid_api_key", "Bad key");
+
+    expect(res.status).toHaveBeenCalledWith(401);
+    expect(res.json).toHaveBeenCalledWith(
+      expect.objectContaining({
+        error: expect.objectContaining({ code: "invalid_api_key" }),
+      }),
+    );
+  });
+});
diff --git a/apps/web/server/middleware/apiAuditMiddleware.ts b/apps/web/server/middleware/apiAuditMiddleware.ts
new file mode 100644
index 00000000..07aacdd1
--- /dev/null
+++ b/apps/web/server/middleware/apiAuditMiddleware.ts
@@ -0,0 +1,57 @@
+import type { Request, Response, NextFunction } from "express";
+import { db } from "../db";
+import { publicApiAuditLog } from "../../drizzle/schema";
+
+/**
+ * Audit logging middleware for public API requests.
+ * Logs to public_api_audit_log table (non-blocking).
+ */
+export function apiAuditMiddleware(
+  req: Request,
+  res: Response,
+  next: NextFunction,
+) {
+  const auth = req.auth;
+  if (!auth || auth.mode !== "api_key") {
+    return next();
+  }
+
+  const startTime = Date.now();
+
+  res.on("finish", () => {
+    const creditsHeader = res.getHeader("X-Credits-Used");
+    const creditsUsed = creditsHeader ? parseInt(String(creditsHeader), 10) : 0;
+
+    const requestMeta: Record<string, unknown> = {
+      query: { ...req.query },
+      contentLength: req.headers["content-length"],
+      authorization: req.headers.authorization
+        ? "Bearer [REDACTED]"
+        : undefined,
+    };
+
+    db.insert(publicApiAuditLog)
+      .values({
+        tenantId: auth.tenantId,
+        userId: auth.userId,
+        apiKeyId: auth.apiKeyId,
+        traceId: (req as any).requestId ?? null,
+        method: req.method.slice(0, 10),
+        path: req.path.slice(0, 255),
+        statusCode: res.statusCode,
+        creditsUsed: isNaN(creditsUsed) ? 0 : creditsUsed,
+        latencyMs: Date.now() - startTime,
+        ip:
+          (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
+          req.ip ??
+          null,
+        userAgent: req.headers["user-agent"]?.slice(0, 500) ?? null,
+        requestMeta,
+      })
+      .catch(() => {
+        // Non-blocking — audit failure must never break the response
+      });
+  });
+
+  next();
+}
diff --git a/apps/web/server/middleware/apiKeyAuth.ts b/apps/web/server/middleware/apiKeyAuth.ts
new file mode 100644
index 00000000..448ebab5
--- /dev/null
+++ b/apps/web/server/middleware/apiKeyAuth.ts
@@ -0,0 +1,30 @@
+import type { Request, Response, NextFunction } from "express";
+import { authorizeRequest } from "../_core/authz";
+
+/**
+ * Express middleware that authenticates requests for /v1/* routes.
+ * Calls authorizeRequest() and sets req.auth for downstream middleware.
+ */
+export async function apiKeyAuthMiddleware(
+  req: Request,
+  res: Response,
+  next: NextFunction,
+) {
+  const auth = await authorizeRequest(req, {
+    allowBearer: true,
+    allowSession: true,
+  });
+
+  if (!auth.ok) {
+    return res.status(401).json({
+      error: {
+        code: "invalid_api_key",
+        message: auth.error || "Authentication required",
+        type: "auth_error",
+      },
+    });
+  }
+
+  req.auth = auth;
+  next();
+}
diff --git a/apps/web/server/middleware/idempotencyMiddleware.ts b/apps/web/server/middleware/idempotencyMiddleware.ts
new file mode 100644
index 00000000..335a63ef
--- /dev/null
+++ b/apps/web/server/middleware/idempotencyMiddleware.ts
@@ -0,0 +1,85 @@
+import type { Request, Response, NextFunction } from "express";
+import { getRedisClient } from "../services/redis";
+
+const MAX_KEY_LENGTH = 64;
+const MAX_CACHE_SIZE = 1_048_576; // 1MB
+const LARGE_RESPONSE_SIZE = 102_400; // 100KB
+
+/**
+ * Idempotency middleware for POST requests.
+ * Uses Redis NX lock to prevent concurrent duplicate execution.
+ */
+export function idempotencyMiddleware() {
+  return async (req: Request, res: Response, next: NextFunction) => {
+    if (req.method !== "POST") return next();
+
+    const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
+    if (!idempotencyKey) return next();
+
+    if (idempotencyKey.length > MAX_KEY_LENGTH) {
+      return res.status(400).json({
+        error: {
+          code: "invalid_request",
+          message: `Idempotency-Key must be at most ${MAX_KEY_LENGTH} characters`,
+          type: "invalid_request_error",
+        },
+      });
+    }
+
+    const tenantId = (req.auth as any)?.tenantId ?? "unknown";
+    const cacheKey = `idempotency:${tenantId}:${idempotencyKey}`;
+    const lockKey = `idempotency:lock:${tenantId}:${idempotencyKey}`;
+
+    const redis = getRedisClient();
+
+    // Acquire lock (NX = set-if-not-exists)
+    const acquired = await redis.set(lockKey, "1", "EX", 60, "NX");
+    if (!acquired) {
+      return res.status(409).json({
+        error: {
+          code: "idempotency_conflict",
+          message:
+            "A request with this Idempotency-Key is already being processed",
+          type: "invalid_request_error",
+        },
+      });
+    }
+
+    try {
+      // Check for cached response
+      const cached = await redis.get(cacheKey);
+      if (cached) {
+        const { statusCode, body, contentType } = JSON.parse(cached);
+        if (contentType) res.setHeader("Content-Type", contentType);
+        await redis.del(lockKey).catch(() => {});
+        return res.status(statusCode).send(body);
+      }
+
+      // Intercept res.json to capture response for caching
+      const originalJson = res.json.bind(res);
+      res.json = ((body: any) => {
+        const serialized = JSON.stringify(body);
+        const byteSize = Buffer.byteLength(serialized, "utf-8");
+
+        if (byteSize <= MAX_CACHE_SIZE) {
+          const ttl =
+            byteSize > LARGE_RESPONSE_SIZE ? 3600 : 86400;
+          const cacheValue = JSON.stringify({
+            statusCode: res.statusCode,
+            body: serialized,
+            contentType: res.getHeader("content-type"),
+          });
+          redis.set(cacheKey, cacheValue, "EX", ttl).catch(() => {});
+        }
+
+        redis.del(lockKey).catch(() => {});
+        return originalJson(body);
+      }) as any;
+
+      next();
+    } catch {
+      await redis.del(lockKey).catch(() => {});
+      next();
+    }
+  };
+}
diff --git a/apps/web/server/middleware/publicApiCors.ts b/apps/web/server/middleware/publicApiCors.ts
new file mode 100644
index 00000000..7a1f5f3e
--- /dev/null
+++ b/apps/web/server/middleware/publicApiCors.ts
@@ -0,0 +1,30 @@
+import type { Request, Response, NextFunction } from "express";
+
+const ALLOWED_METHODS = "GET, POST, PUT, DELETE, OPTIONS";
+const ALLOWED_HEADERS =
+  "Authorization, Content-Type, Idempotency-Key, Mcp-Session-Id";
+const EXPOSED_HEADERS =
+  "X-Request-Id, X-Credits-Used, X-Credits-Remaining, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset";
+
+/**
+ * CORS middleware for /v1/ public API endpoints.
+ * Uses Access-Control-Allow-Origin: * because API key auth does not use cookies.
+ */
+export function publicApiCorsMiddleware(
+  req: Request,
+  res: Response,
+  next: NextFunction,
+) {
+  res.setHeader("Access-Control-Allow-Origin", "*");
+  res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
+  res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
+  res.setHeader("Access-Control-Expose-Headers", EXPOSED_HEADERS);
+  res.setHeader("Access-Control-Max-Age", "86400");
+
+  if (req.method === "OPTIONS") {
+    res.status(204).end();
+    return;
+  }
+
+  next();
+}
diff --git a/apps/web/server/middleware/publicApiHeaders.ts b/apps/web/server/middleware/publicApiHeaders.ts
new file mode 100644
index 00000000..5ac2d99e
--- /dev/null
+++ b/apps/web/server/middleware/publicApiHeaders.ts
@@ -0,0 +1,65 @@
+import type { Request, Response, NextFunction } from "express";
+import type { ApiErrorCode } from "../../shared/publicApiTypes";
+
+/**
+ * Sets X-Request-Id header from correlationIdMiddleware's req.requestId.
+ */
+export function publicApiHeadersMiddleware(
+  req: Request,
+  res: Response,
+  next: NextFunction,
+) {
+  const requestId = (req as any).requestId;
+  if (requestId) {
+    res.setHeader("X-Request-Id", requestId);
+  }
+  next();
+}
+
+/**
+ * Error type mapping for consistent API error responses.
+ */
+const ERROR_TYPE_MAP: Record<string, string> = {
+  invalid_api_key: "auth_error",
+  insufficient_scopes: "auth_error",
+  feature_disabled: "auth_error",
+  rate_limit_exceeded: "rate_limit_error",
+  daily_credit_limit: "billing_error",
+  insufficient_credits: "billing_error",
+  invalid_request: "invalid_request_error",
+  not_found: "not_found_error",
+  internal_error: "internal_error",
+  idempotency_conflict: "invalid_request_error",
+  credit_overflow: "invalid_request_error",
+  invalid_job_type: "invalid_request_error",
+};
+
+/**
+ * Format a standard API error response.
+ */
+export function formatApiError(
+  code: ApiErrorCode | string,
+  message: string,
+  type?: string,
+) {
+  return {
+    error: {
+      code,
+      message,
+      type: type ?? ERROR_TYPE_MAP[code] ?? "internal_error",
+    },
+  };
+}
+
+/**
+ * Send a standard API error response.
+ */
+export function sendApiError(
+  res: Response,
+  statusCode: number,
+  code: ApiErrorCode | string,
+  message: string,
+  type?: string,
+) {
+  res.status(statusCode).json(formatApiError(code, message, type));
+}
diff --git a/apps/web/server/services/apiKeyRateLimiter.test.ts b/apps/web/server/services/apiKeyRateLimiter.test.ts
new file mode 100644
index 00000000..e5dc2206
--- /dev/null
+++ b/apps/web/server/services/apiKeyRateLimiter.test.ts
@@ -0,0 +1,104 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+const mockRedis = {
+  incr: vi.fn(),
+  expire: vi.fn(),
+  expireat: vi.fn(),
+  get: vi.fn(),
+  incrby: vi.fn(),
+  set: vi.fn(),
+  del: vi.fn(),
+};
+
+vi.mock("./redis", () => ({
+  getRedisClient: () => mockRedis,
+}));
+
+import {
+  checkRateLimit,
+  checkDailyCreditLimit,
+  incrementDailyCredits,
+} from "./apiKeyRateLimiter";
+
+describe("apiKeyRateLimiter", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    mockRedis.incr.mockResolvedValue(1);
+    mockRedis.expire.mockResolvedValue(1);
+    mockRedis.expireat.mockResolvedValue(1);
+    mockRedis.get.mockResolvedValue(null);
+    mockRedis.incrby.mockResolvedValue(1);
+  });
+
+  describe("checkRateLimit", () => {
+    it("allows requests under per-key limit", async () => {
+      mockRedis.incr.mockResolvedValue(5);
+      const result = await checkRateLimit("key1", "tenant1", 60);
+      expect(result.allowed).toBe(true);
+      expect(result.remaining).toBeLessThanOrEqual(55);
+    });
+
+    it("returns 429 info when per-key limit exceeded", async () => {
+      mockRedis.incr.mockResolvedValueOnce(61).mockResolvedValueOnce(61);
+      const result = await checkRateLimit("key1", "tenant1", 60);
+      expect(result.allowed).toBe(false);
+      expect(result.retryAfterSeconds).toBeGreaterThan(0);
+    });
+
+    it("returns 429 info when per-tenant limit exceeded", async () => {
+      mockRedis.incr.mockResolvedValueOnce(5).mockResolvedValueOnce(601);
+      const result = await checkRateLimit("key1", "tenant1", 60);
+      expect(result.allowed).toBe(false);
+    });
+
+    it("sets correct X-RateLimit-* header values", async () => {
+      mockRedis.incr.mockResolvedValue(10);
+      const result = await checkRateLimit("key1", "tenant1", 60);
+      expect(result.headers["X-RateLimit-Limit"]).toBe("60");
+      expect(result.headers["X-RateLimit-Remaining"]).toBeDefined();
+      expect(result.headers["X-RateLimit-Reset"]).toBeDefined();
+      expect(Number(result.headers["X-RateLimit-Reset"])).toBeGreaterThan(
+        Math.floor(Date.now() / 1000),
+      );
+    });
+
+    it("calls EXPIRE with 120s TTL on first request", async () => {
+      mockRedis.incr.mockResolvedValue(1);
+      await checkRateLimit("key1", "tenant1", 60);
+      expect(mockRedis.expire).toHaveBeenCalledWith(
+        expect.stringContaining("ratelimit:apikey:key1:"),
+        120,
+      );
+    });
+  });
+
+  describe("checkDailyCreditLimit", () => {
+    it("returns allowed=false when exceeded", async () => {
+      mockRedis.get.mockResolvedValue("1000");
+      const result = await checkDailyCreditLimit("key1", 500);
+      expect(result.allowed).toBe(false);
+      expect(result.retryAfterSeconds).toBeGreaterThan(0);
+    });
+
+    it("null creditLimit means unlimited", async () => {
+      const result = await checkDailyCreditLimit("key1", null);
+      expect(result.allowed).toBe(true);
+    });
+
+    it("returns remaining credits when under limit", async () => {
+      mockRedis.get.mockResolvedValue("200");
+      const result = await checkDailyCreditLimit("key1", 500);
+      expect(result.allowed).toBe(true);
+      expect(result.remaining).toBe(300);
+    });
+
+    it("incrementDailyCredits adds to the daily counter", async () => {
+      await incrementDailyCredits("key1", 50);
+      expect(mockRedis.incrby).toHaveBeenCalledWith(
+        expect.stringContaining("creditlimit:apikey:key1:"),
+        50,
+      );
+      expect(mockRedis.expireat).toHaveBeenCalled();
+    });
+  });
+});
diff --git a/apps/web/server/services/apiKeyRateLimiter.ts b/apps/web/server/services/apiKeyRateLimiter.ts
new file mode 100644
index 00000000..4083ffdf
--- /dev/null
+++ b/apps/web/server/services/apiKeyRateLimiter.ts
@@ -0,0 +1,156 @@
+import { getRedisClient } from "./redis";
+
+const TENANT_RPM_LIMIT = 600;
+
+interface RateLimitResult {
+  allowed: boolean;
+  remaining: number;
+  headers: Record<string, string>;
+  retryAfterSeconds?: number;
+}
+
+interface DailyCreditResult {
+  allowed: boolean;
+  remaining?: number;
+  retryAfterSeconds?: number;
+}
+
+function secondsUntilNextMinute(): number {
+  return 60 - (Math.floor(Date.now() / 1000) % 60);
+}
+
+function secondsUntilMidnightUTC(): number {
+  const now = new Date();
+  const midnight = new Date(
+    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
+  );
+  return Math.ceil((midnight.getTime() - now.getTime()) / 1000);
+}
+
+function todayUTC(): string {
+  return new Date().toISOString().slice(0, 10);
+}
+
+/**
+ * Sliding-window rate limiter using Redis INCR with minute-granularity buckets.
+ */
+export async function checkRateLimit(
+  apiKeyId: string,
+  tenantId: string,
+  keyRateLimit: number = 60,
+): Promise<RateLimitResult> {
+  const redis = getRedisClient();
+  const minuteTs = Math.floor(Date.now() / 60000);
+  const resetTimestamp = (minuteTs + 1) * 60;
+
+  const keyBucket = `ratelimit:apikey:${apiKeyId}:${minuteTs}`;
+  const tenantBucket = `ratelimit:tenant:api:${tenantId}:${minuteTs}`;
+
+  // INCR both counters
+  const [keyCount, tenantCount] = await Promise.all([
+    redis.incr(keyBucket),
+    redis.incr(tenantBucket),
+  ]);
+
+  // Set TTL on first request in this window
+  if (keyCount === 1) redis.expire(keyBucket, 120).catch(() => {});
+  if (tenantCount === 1) redis.expire(tenantBucket, 120).catch(() => {});
+
+  const keyRemaining = Math.max(0, keyRateLimit - keyCount);
+  const tenantRemaining = Math.max(0, TENANT_RPM_LIMIT - tenantCount);
+  const remaining = Math.min(keyRemaining, tenantRemaining);
+
+  const headers: Record<string, string> = {
+    "X-RateLimit-Limit": String(keyRateLimit),
+    "X-RateLimit-Remaining": String(remaining),
+    "X-RateLimit-Reset": String(resetTimestamp),
+  };
+
+  if (keyCount > keyRateLimit || tenantCount > TENANT_RPM_LIMIT) {
+    return {
+      allowed: false,
+      remaining: 0,
+      headers,
+      retryAfterSeconds: secondsUntilNextMinute(),
+    };
+  }
+
+  return { allowed: true, remaining, headers };
+}
+
+/**
+ * Check whether a key has exceeded its daily credit limit.
+ */
+export async function checkDailyCreditLimit(
+  apiKeyId: string,
+  creditLimit: number | null,
+): Promise<DailyCreditResult> {
+  if (creditLimit === null || creditLimit === undefined) {
+    return { allowed: true };
+  }
+
+  const redis = getRedisClient();
+  const key = `creditlimit:apikey:${apiKeyId}:${todayUTC()}`;
+  const raw = await redis.get(key);
+  const accumulated = raw ? parseInt(raw, 10) : 0;
+
+  if (accumulated >= creditLimit) {
+    return {
+      allowed: false,
+      retryAfterSeconds: secondsUntilMidnightUTC(),
+    };
+  }
+
+  return { allowed: true, remaining: creditLimit - accumulated };
+}
+
+/**
+ * Increment daily credit counter for a key.
+ */
+export async function incrementDailyCredits(
+  apiKeyId: string,
+  amount: number,
+): Promise<void> {
+  const redis = getRedisClient();
+  const key = `creditlimit:apikey:${apiKeyId}:${todayUTC()}`;
+  await redis.incrby(key, amount);
+
+  // Auto-expire at midnight UTC + 1 day
+  const midnightTomorrow = new Date();
+  midnightTomorrow.setUTCHours(0, 0, 0, 0);
+  midnightTomorrow.setUTCDate(midnightTomorrow.getUTCDate() + 1);
+  redis.expireat(key, Math.floor(midnightTomorrow.getTime() / 1000)).catch(() => {});
+}
+
+/**
+ * Rate limit middleware wrapper for Express.
+ * Reads auth context from req.auth.
+ */
+export function rateLimitMiddleware() {
+  return async (req: any, res: any, next: any) => {
+    if (req.auth?.mode !== "api_key") return next();
+
+    const result = await checkRateLimit(
+      req.auth.apiKeyId,
+      req.auth.tenantId,
+      60, // default RPM, could read from api_keys.rateLimit
+    );
+
+    for (const [key, value] of Object.entries(result.headers)) {
+      res.setHeader(key, value);
+    }
+
+    if (!result.allowed) {
+      res.setHeader("Retry-After", String(result.retryAfterSeconds));
+      return res.status(429).json({
+        error: {
+          code: "rate_limit_exceeded",
+          message: "Rate limit exceeded. Try again later.",
+          type: "rate_limit_error",
+        },
+      });
+    }
+
+    next();
+  };
+}
