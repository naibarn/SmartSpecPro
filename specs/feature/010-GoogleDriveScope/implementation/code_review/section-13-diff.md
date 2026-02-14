diff --git a/apps/web/server/routers/googleDrive.ts b/apps/web/server/routers/googleDrive.ts
index 90ae87c..b7ff2f1 100644
--- a/apps/web/server/routers/googleDrive.ts
+++ b/apps/web/server/routers/googleDrive.ts
@@ -20,6 +20,18 @@ import {
   creditTransactions,
 } from "../../drizzle/schema";
 import { storageGet, storagePut } from "../storage";
+import {
+  gdriveSearchLimiter,
+  gdriveReadLimiter,
+  gdriveSyncLimiter,
+  gdriveEditLimiter,
+} from "../services/googleDriveRateLimiter";
+import { createGDriveRateLimitMiddleware } from "../services/googleDriveRateLimitMiddleware";
+
+const searchRateLimit = createGDriveRateLimitMiddleware(gdriveSearchLimiter);
+const readRateLimit = createGDriveRateLimitMiddleware(gdriveReadLimiter);
+const syncRateLimit = createGDriveRateLimitMiddleware(gdriveSyncLimiter);
+const editRateLimit = createGDriveRateLimitMiddleware(gdriveEditLimiter);
 
 const PYTHON_BACKEND_URL =
   process.env.PYTHON_BACKEND_URL ||
@@ -42,7 +54,7 @@ export const googleDriveRouter = router({
   /**
    * Get the user's Google Drive connection status.
    */
-  getConnectionStatus: protectedProcedure.query(async ({ ctx }) => {
+  getConnectionStatus: protectedProcedure.use(readRateLimit).query(async ({ ctx }) => {
     const token = createDriveToken(ctx.user.id);
     const resp = await fetch(
       `${PYTHON_BACKEND_URL}/api/oauth/google/drive/status`,
@@ -65,7 +77,7 @@ export const googleDriveRouter = router({
   /**
    * Get the Google OAuth authorization URL with Drive scopes.
    */
-  getAuthUrl: protectedProcedure.query(async ({ ctx }) => {
+  getAuthUrl: protectedProcedure.use(readRateLimit).query(async ({ ctx }) => {
     const token = createDriveToken(ctx.user.id);
     const resp = await fetch(
       `${PYTHON_BACKEND_URL}/api/oauth/google/drive/authorize`,
@@ -160,6 +172,7 @@ export const googleDriveRouter = router({
    * Open a library file for editing in Google Docs/Sheets.
    */
   openForEditing: protectedProcedure
+    .use(editRateLimit)
     .input(z.object({ libraryItemId: z.number() }))
     .mutation(async ({ ctx, input }) => {
       if (!ctx.tenantId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tenant context required" });
@@ -272,6 +285,7 @@ export const googleDriveRouter = router({
    * Save back edited file from Google Drive to storage.
    */
   saveBack: protectedProcedure
+    .use(editRateLimit)
     .input(z.object({ sessionId: z.number() }))
     .mutation(async ({ ctx, input }) => {
       if (!ctx.tenantId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tenant context required" });
@@ -428,7 +442,7 @@ export const googleDriveRouter = router({
   /**
    * Start an initial sync or manual re-sync.
    */
-  startSync: protectedProcedure.mutation(async ({ ctx }) => {
+  startSync: protectedProcedure.use(syncRateLimit).mutation(async ({ ctx }) => {
     if (!ctx.tenantId)
       throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tenant context required" });
 
@@ -541,7 +555,7 @@ export const googleDriveRouter = router({
   /**
    * Estimate sync cost (count matching files and credit cost).
    */
-  estimateSyncCost: protectedProcedure.mutation(async ({ ctx }) => {
+  estimateSyncCost: protectedProcedure.use(syncRateLimit).mutation(async ({ ctx }) => {
     if (!ctx.tenantId)
       throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tenant context required" });
 
@@ -635,6 +649,7 @@ export const googleDriveRouter = router({
    * Paginated list of indexed Google Drive files with chunk counts.
    */
   getIndexedFiles: protectedProcedure
+    .use(searchRateLimit)
     .input(
       z.object({
         search: z.string().optional(),
@@ -815,6 +830,7 @@ export const googleDriveRouter = router({
    * List Google Drive folders for folder picker (proxied via Python backend).
    */
   listDriveFolders: protectedProcedure
+    .use(searchRateLimit)
     .input(z.object({ parentFolderId: z.string().nullable().default(null) }))
     .query(async ({ ctx, input }) => {
       const token = createDriveToken(ctx.user.id);
@@ -841,6 +857,7 @@ export const googleDriveRouter = router({
    * Re-index a specific Google Drive file.
    */
   reindexFile: protectedProcedure
+    .use(syncRateLimit)
     .input(z.object({ libraryItemId: z.number() }))
     .mutation(async ({ ctx, input }) => {
       if (!ctx.tenantId)
diff --git a/apps/web/server/services/auditLogger.ts b/apps/web/server/services/auditLogger.ts
index 109f577..4092f5d 100644
--- a/apps/web/server/services/auditLogger.ts
+++ b/apps/web/server/services/auditLogger.ts
@@ -25,6 +25,7 @@ export type AuditEventType =
   | "rollout_gate"
   | "skill_detect"
   | "skill_execute"
+  | "gdrive_api_call"
   | "error";
 
 export interface AuditLogEntry {
diff --git a/apps/web/server/services/googleDriveAuditLogger.ts b/apps/web/server/services/googleDriveAuditLogger.ts
new file mode 100644
index 0000000..8cb0528
--- /dev/null
+++ b/apps/web/server/services/googleDriveAuditLogger.ts
@@ -0,0 +1,30 @@
+/**
+ * Thin wrapper around auditLogger for Google Drive API operations.
+ */
+
+import { auditLogger } from "./auditLogger";
+import { getTraceId } from "./traceContext";
+
+export function logGDriveApiCall(params: {
+  userId: number;
+  operation: string;
+  latencyMs: number;
+  success: boolean;
+  driveFileId?: string;
+  errorMessage?: string;
+  metadata?: Record<string, unknown>;
+}): void {
+  auditLogger.log({
+    traceId: getTraceId() || "",
+    eventType: "gdrive_api_call",
+    userId: params.userId,
+    timing: { totalMs: params.latencyMs },
+    metadata: {
+      operation: params.operation,
+      driveFileId: params.driveFileId,
+      success: params.success,
+      ...(params.metadata || {}),
+    },
+    ...(params.errorMessage ? { errorMessage: params.errorMessage } : {}),
+  } as any);
+}
diff --git a/apps/web/server/services/googleDriveRateLimitMiddleware.ts b/apps/web/server/services/googleDriveRateLimitMiddleware.ts
new file mode 100644
index 0000000..c4b318b
--- /dev/null
+++ b/apps/web/server/services/googleDriveRateLimitMiddleware.ts
@@ -0,0 +1,40 @@
+/**
+ * tRPC middleware for per-user Google Drive rate limiting.
+ *
+ * Similar to rateLimitedProcedure.ts but uses user ID instead of IP.
+ */
+
+import { TRPCError } from "@trpc/server";
+import type { TrpcContext } from "../_core/context";
+
+type RateLimiterInstance = {
+  isAllowed(key: string): boolean;
+  getResetTime(key: string): number;
+};
+
+/**
+ * Creates a tRPC middleware that enforces per-user rate limiting for
+ * Google Drive operations. Throws TRPCError with code TOO_MANY_REQUESTS
+ * when the limit is exceeded, including retryAfter in the error data.
+ */
+export function createGDriveRateLimitMiddleware(limiter: RateLimiterInstance) {
+  return async ({ ctx, next }: { ctx: TrpcContext; next: () => Promise<any> }) => {
+    const userId = (ctx as any).user?.id;
+    if (!userId) {
+      // No user context -- skip rate limiting (auth middleware will catch)
+      return next();
+    }
+
+    const key = `user:${userId}`;
+    if (!limiter.isAllowed(key)) {
+      const retryAfter = Math.ceil(limiter.getResetTime(key) / 1000);
+      throw new TRPCError({
+        code: "TOO_MANY_REQUESTS",
+        message: "Rate limit exceeded. Please try again later.",
+        cause: { retryAfter },
+      });
+    }
+
+    return next();
+  };
+}
diff --git a/apps/web/server/services/googleDriveRateLimiter.ts b/apps/web/server/services/googleDriveRateLimiter.ts
new file mode 100644
index 0000000..f42dbfa
--- /dev/null
+++ b/apps/web/server/services/googleDriveRateLimiter.ts
@@ -0,0 +1,32 @@
+/**
+ * Per-user rate limiters for Google Drive operations.
+ *
+ * Uses the same createRateLimiter factory from rateLimiter.ts.
+ * Keys are user IDs (not IPs) since all Drive operations require auth.
+ */
+
+import { createRateLimiter } from "./rateLimiter";
+
+export const gdriveSearchLimiter = createRateLimiter("gdrive-search", {
+  windowMs: 60000,
+  maxRequests: 30,
+  blockDurationMs: 10000,
+});
+
+export const gdriveReadLimiter = createRateLimiter("gdrive-read", {
+  windowMs: 60000,
+  maxRequests: 60,
+  blockDurationMs: 10000,
+});
+
+export const gdriveSyncLimiter = createRateLimiter("gdrive-sync", {
+  windowMs: 60000,
+  maxRequests: 5,
+  blockDurationMs: 30000,
+});
+
+export const gdriveEditLimiter = createRateLimiter("gdrive-edit", {
+  windowMs: 60000,
+  maxRequests: 10,
+  blockDurationMs: 30000,
+});
diff --git a/python-backend/app/core/celery_app.py b/python-backend/app/core/celery_app.py
index 49309c9..14ef315 100644
--- a/python-backend/app/core/celery_app.py
+++ b/python-backend/app/core/celery_app.py
@@ -104,6 +104,10 @@ celery_app.conf.beat_schedule = {
         "task": "renew_drive_watch_channels",
         "schedule": crontab(minute=0, hour="*/6"),  # Every 6 hours - renew expiring webhook channels
     },
+    "poll-drive-changes": {
+        "task": "poll_drive_changes",
+        "schedule": crontab(minute="*/15"),  # Every 15 min - fallback polling when webhook is down
+    },
 }
 
 # Auto-discover tasks
diff --git a/python-backend/app/services/google_api_retry.py b/python-backend/app/services/google_api_retry.py
new file mode 100644
index 0000000..80c2c6e
--- /dev/null
+++ b/python-backend/app/services/google_api_retry.py
@@ -0,0 +1,226 @@
+"""
+Google API retry utilities with exponential backoff and jitter.
+
+Provides a decorator for retrying Google API calls on 429/503 responses,
+and custom error classes for Google-specific error handling.
+"""
+
+import asyncio
+import functools
+import random
+import time
+from typing import Callable, Any
+
+import structlog
+
+from app.core.error_handling import ExternalAPIError, NonRetryableError
+
+logger = structlog.get_logger()
+
+
+class GoogleAPIError(ExternalAPIError):
+    """Google API call failed with a specific HTTP status code."""
+
+    def __init__(self, message: str, status_code: int, reason: str | None = None):
+        super().__init__(message)
+        self.status_code = status_code
+        self.reason = reason
+
+
+class InvalidGrantError(NonRetryableError):
+    """OAuth token was revoked or expired (invalid_grant).
+
+    This error should never be retried. Callers should update the
+    connection status to 'expired' and disable auto-sync.
+    """
+
+    pass
+
+
+# HTTP status codes that should be retried
+RETRYABLE_STATUS_CODES = {429, 503}
+
+# HTTP status codes that should NOT be retried
+NON_RETRYABLE_STATUS_CODES = {400, 401, 403, 404}
+
+
+def google_api_retry(
+    max_retries: int = 5,
+    initial_delay: float = 1.0,
+    max_delay: float = 32.0,
+    exponential_base: float = 2.0,
+):
+    """
+    Decorator for retrying Google API calls with exponential backoff and jitter.
+
+    Retries on 429 and 503 responses. Adds random jitter (up to 50% of delay)
+    to prevent thundering herd. Non-retryable errors (400, 404) raise immediately.
+
+    Args:
+        max_retries: Maximum number of retry attempts (default 5).
+        initial_delay: Initial delay in seconds (default 1.0).
+        max_delay: Maximum delay cap in seconds (default 32.0).
+        exponential_base: Base for exponential backoff (default 2.0).
+    """
+
+    def decorator(func: Callable) -> Callable:
+        @functools.wraps(func)
+        async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
+            delay = initial_delay
+
+            for attempt in range(max_retries + 1):
+                try:
+                    return await func(*args, **kwargs)
+
+                except InvalidGrantError:
+                    raise  # Never retry
+
+                except NonRetryableError:
+                    raise  # Never retry
+
+                except GoogleAPIError as e:
+                    if e.status_code not in RETRYABLE_STATUS_CODES:
+                        raise
+
+                    if attempt == max_retries:
+                        logger.error(
+                            "google_api_retry_exhausted",
+                            function=func.__name__,
+                            attempts=attempt + 1,
+                            status_code=e.status_code,
+                            error=str(e),
+                        )
+                        raise
+
+                    jitter = random.uniform(0, delay * 0.5)
+                    wait = min(delay + jitter, max_delay)
+
+                    logger.warning(
+                        "google_api_retry_attempt",
+                        function=func.__name__,
+                        attempt=attempt + 1,
+                        max_retries=max_retries,
+                        delay=round(wait, 2),
+                        status_code=e.status_code,
+                    )
+
+                    await asyncio.sleep(wait)
+                    delay = min(delay * exponential_base, max_delay)
+
+                except Exception as e:
+                    # Check if it's a Google API HTTP error with retryable status
+                    status = _extract_http_status(e)
+                    if status and status in RETRYABLE_STATUS_CODES:
+                        if attempt == max_retries:
+                            logger.error(
+                                "google_api_retry_exhausted",
+                                function=func.__name__,
+                                attempts=attempt + 1,
+                                status_code=status,
+                                error=str(e),
+                            )
+                            raise
+
+                        jitter = random.uniform(0, delay * 0.5)
+                        wait = min(delay + jitter, max_delay)
+
+                        logger.warning(
+                            "google_api_retry_attempt",
+                            function=func.__name__,
+                            attempt=attempt + 1,
+                            max_retries=max_retries,
+                            delay=round(wait, 2),
+                            status_code=status,
+                        )
+
+                        await asyncio.sleep(wait)
+                        delay = min(delay * exponential_base, max_delay)
+                    else:
+                        raise
+
+        @functools.wraps(func)
+        def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
+            delay = initial_delay
+
+            for attempt in range(max_retries + 1):
+                try:
+                    return func(*args, **kwargs)
+
+                except InvalidGrantError:
+                    raise
+
+                except NonRetryableError:
+                    raise
+
+                except GoogleAPIError as e:
+                    if e.status_code not in RETRYABLE_STATUS_CODES:
+                        raise
+
+                    if attempt == max_retries:
+                        logger.error(
+                            "google_api_retry_exhausted",
+                            function=func.__name__,
+                            attempts=attempt + 1,
+                            status_code=e.status_code,
+                            error=str(e),
+                        )
+                        raise
+
+                    jitter = random.uniform(0, delay * 0.5)
+                    wait = min(delay + jitter, max_delay)
+
+                    logger.warning(
+                        "google_api_retry_attempt",
+                        function=func.__name__,
+                        attempt=attempt + 1,
+                        max_retries=max_retries,
+                        delay=round(wait, 2),
+                        status_code=e.status_code,
+                    )
+
+                    time.sleep(wait)
+                    delay = min(delay * exponential_base, max_delay)
+
+                except Exception as e:
+                    status = _extract_http_status(e)
+                    if status and status in RETRYABLE_STATUS_CODES:
+                        if attempt == max_retries:
+                            raise
+
+                        jitter = random.uniform(0, delay * 0.5)
+                        wait = min(delay + jitter, max_delay)
+
+                        logger.warning(
+                            "google_api_retry_attempt",
+                            function=func.__name__,
+                            attempt=attempt + 1,
+                            max_retries=max_retries,
+                            delay=round(wait, 2),
+                            status_code=status,
+                        )
+
+                        time.sleep(wait)
+                        delay = min(delay * exponential_base, max_delay)
+                    else:
+                        raise
+
+        if asyncio.iscoroutinefunction(func):
+            return async_wrapper
+        else:
+            return sync_wrapper
+
+    return decorator
+
+
+def _extract_http_status(exc: Exception) -> int | None:
+    """Extract HTTP status code from various Google API exception types."""
+    # googleapiclient.errors.HttpError
+    if hasattr(exc, "status_code"):
+        return int(exc.status_code)
+    if hasattr(exc, "resp") and hasattr(exc.resp, "status"):
+        return int(exc.resp.status)
+    if hasattr(exc, "resp") and isinstance(exc.resp, dict):
+        s = exc.resp.get("status")
+        if s:
+            return int(s)
+    return None
diff --git a/python-backend/app/tasks/google_drive_tasks.py b/python-backend/app/tasks/google_drive_tasks.py
index 13faeb5..e7c6aa7 100644
--- a/python-backend/app/tasks/google_drive_tasks.py
+++ b/python-backend/app/tasks/google_drive_tasks.py
@@ -1161,3 +1161,101 @@ async def _estimate_sync_cost_impl(user_id: int, tenant_id: str) -> dict:
             "estimated_credits": estimated_credits,
             "estimated_size_mb": round(total_size / (1024 * 1024), 1),
         }
+
+
+# ── Webhook Fallback: Periodic Polling ─────────────────────────────────────
+
+
+@celery_app.task(name="poll_drive_changes")
+def poll_drive_changes():
+    """Periodic fallback task for users whose webhook channel is down.
+
+    Runs every 15 minutes via Celery Beat. Finds users with auto_sync_enabled
+    but no active webhook channel, and polls the Changes API for them.
+    Attempts to re-establish the webhook channel on each run.
+    """
+    logger.info("poll_drive_changes_started")
+    try:
+        return _run_async(_poll_drive_changes_async())
+    except Exception as e:
+        logger.error("poll_drive_changes_failed error=%s", str(e))
+        return {"error": str(e)}
+
+
+async def _poll_drive_changes_async() -> dict:
+    """Async implementation of polling fallback."""
+    from app.core.database import AsyncSessionLocal
+
+    polled = 0
+    failed = 0
+
+    async with AsyncSessionLocal() as db:
+        rows = await db.execute(
+            text("""
+                SELECT user_id, tenant_id
+                FROM google_drive_sync_state
+                WHERE auto_sync_enabled = true
+                  AND channel_id IS NULL
+                  AND page_token IS NOT NULL
+            """)
+        )
+        candidates = rows.fetchall()
+
+        for row in candidates:
+            uid, tid = row[0], row[1]
+            try:
+                result = await _process_drive_changes_async(uid, tid)
+                if result.get("error"):
+                    failed += 1
+                else:
+                    polled += 1
+
+                # Attempt to re-establish webhook
+                await _try_reestablish_webhook(uid, tid)
+
+            except Exception as e:
+                failed += 1
+                logger.warning("poll_drive_changes user_id=%d error=%s", uid, str(e))
+
+    logger.info("poll_drive_changes_completed polled=%d failed=%d", polled, failed)
+    return {"polled": polled, "failed": failed}
+
+
+async def _try_reestablish_webhook(user_id: int, tenant_id: str):
+    """Attempt to re-establish a webhook channel for a user."""
+    from app.core.database import AsyncSessionLocal
+    from app.services.google_token_service import GoogleTokenService, InvalidGrantError
+    from app.services.google_drive_sync_service import setup_watch_channel
+
+    try:
+        async with AsyncSessionLocal() as db:
+            token_svc = GoogleTokenService(db)
+            access_token = await token_svc.get_valid_access_token(user_id)
+
+            channel_info = await setup_watch_channel(user_id, tenant_id, access_token)
+            token_hash = hashlib.sha256(channel_info["channel_token"].encode()).hexdigest()
+
+            await db.execute(
+                text("""
+                    UPDATE google_drive_sync_state
+                    SET channel_id = :channel_id, resource_id = :resource_id,
+                        channel_token_hash = :token_hash, channel_expiry = :expiry,
+                        page_token = :page_token, updated_at = NOW()
+                    WHERE tenant_id = :tenant_id AND user_id = :user_id
+                """),
+                {
+                    "channel_id": channel_info["channel_id"],
+                    "resource_id": channel_info["resource_id"],
+                    "token_hash": token_hash,
+                    "expiry": channel_info["channel_expiry"],
+                    "page_token": channel_info["page_token"],
+                    "tenant_id": tenant_id,
+                    "user_id": user_id,
+                },
+            )
+            await db.commit()
+            logger.info("webhook_reestablished user_id=%d", user_id)
+    except InvalidGrantError:
+        logger.warning("webhook_reestablish_token_expired user_id=%d", user_id)
+    except Exception as e:
+        logger.warning("webhook_reestablish_failed user_id=%d error=%s", user_id, str(e))
