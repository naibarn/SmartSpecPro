diff --git a/apps/web/server/routers/googleDrive.ts b/apps/web/server/routers/googleDrive.ts
index 9be5b22..611d884 100644
--- a/apps/web/server/routers/googleDrive.ts
+++ b/apps/web/server/routers/googleDrive.ts
@@ -11,13 +11,14 @@ import { eq, and, sql, count, sum, desc, gte, lt, ilike } from "drizzle-orm";
 import { TRPCError } from "@trpc/server";
 import { protectedProcedure, router } from "../_core/trpc";
 import { signBearerToken } from "../_core/tokens";
-import { db } from "../db";
+import { db, getDb } from "../db";
 import {
   googleDriveEditSessions,
   googleDriveSyncState,
   libraryItems,
   libraryChunks,
   creditTransactions,
+  systemSettings,
 } from "../../drizzle/schema";
 import { storageGet, storagePut } from "../storage";
 import {
@@ -27,6 +28,65 @@ import {
   gdriveEditLimiter,
 } from "../services/googleDriveRateLimiter";
 import { createGDriveRateLimitMiddleware } from "../services/googleDriveRateLimitMiddleware";
+import { auditLogger } from "../services/auditLogger";
+
+// ── Input validation schemas ──────────────────────────────────────────────
+const driveFileIdSchema = z
+  .string()
+  .min(1)
+  .max(256)
+  .regex(/^[a-zA-Z0-9_-]+$/, "Invalid file ID format");
+
+const searchQuerySchema = z
+  .string()
+  .min(1)
+  .max(500)
+  .transform((s) => s.trim());
+
+// ── Feature flag helper ───────────────────────────────────────────────────
+let _driveReadonlyCached: { value: boolean; expiry: number } | null = null;
+
+async function isDriveReadonlyApproved(): Promise<boolean> {
+  const now = Date.now();
+  if (_driveReadonlyCached && _driveReadonlyCached.expiry > now) {
+    return _driveReadonlyCached.value;
+  }
+  try {
+    const dbInst = await getDb();
+    if (!dbInst) return false;
+    const [row] = await dbInst
+      .select()
+      .from(systemSettings)
+      .where(
+        and(
+          eq(systemSettings.category, "oauth"),
+          eq(systemSettings.key, "driveReadonlyScopeApproved"),
+        ),
+      )
+      .limit(1);
+    const val = row?.value === "true";
+    _driveReadonlyCached = { value: val, expiry: now + 5 * 60 * 1000 }; // 5 min cache
+    return val;
+  } catch {
+    return false;
+  }
+}
+
+function requireDriveReadonly(): never | void {
+  // This is a synchronous check after async resolution - used as a helper
+}
+
+async function assertDriveReadonlyApproved(): Promise<void> {
+  if (!(await isDriveReadonlyApproved())) {
+    throw new TRPCError({
+      code: "PRECONDITION_FAILED",
+      message:
+        "Google Drive read access is pending verification. " +
+        "Edit-in-Google features are available. " +
+        "Contact admin when drive.readonly scope is approved.",
+    });
+  }
+}
 
 const searchRateLimit = createGDriveRateLimitMiddleware(gdriveSearchLimiter);
 const readRateLimit = createGDriveRateLimitMiddleware(gdriveReadLimiter);
@@ -120,11 +180,15 @@ export const googleDriveRouter = router({
         const err = await resp.json().catch(() => ({}));
         throw new Error(err.detail || "OAuth exchange failed");
       }
-      return resp.json() as Promise<{
-        email: string;
-        scopes: string[];
-        status: string;
-      }>;
+      const result = await resp.json() as { email: string; scopes: string[]; status: string };
+
+      auditLogger.log({
+        eventType: "google_drive_connect",
+        userId: ctx.user.id,
+        metadata: { email: result.email, scopes: result.scopes },
+      });
+
+      return result;
     }),
 
   /**
@@ -160,7 +224,15 @@ export const googleDriveRouter = router({
       });
     }
 
-    return resp.json() as Promise<{ status: string; task_id: string }>;
+    const result = await resp.json() as { status: string; task_id: string };
+
+    auditLogger.log({
+      eventType: "google_drive_disconnect",
+      userId: ctx.user.id,
+      metadata: { tenantId: ctx.tenantId, taskId: result.task_id },
+    });
+
+    return result;
   }),
 
   /**
@@ -295,6 +367,12 @@ export const googleDriveRouter = router({
         })
         .returning();
 
+      auditLogger.log({
+        eventType: "google_drive_edit",
+        userId: ctx.user.id,
+        metadata: { libraryItemId: input.libraryItemId, driveFileId: uploadResult.driveFileId, action: "open" },
+      });
+
       return { sessionId: session.id, editUrl: session.editUrl, driveFileId: session.driveFileId };
     }),
 
@@ -463,6 +541,9 @@ export const googleDriveRouter = router({
     if (!ctx.tenantId)
       throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tenant context required" });
 
+    // Gate behind drive.readonly scope approval
+    await assertDriveReadonlyApproved();
+
     // Verify Google connection
     const token = createDriveToken(ctx.user.id);
     const statusResp = await fetch(`${PYTHON_BACKEND_URL}/api/oauth/google/drive/status`, {
diff --git a/apps/web/server/routes/webhooks.ts b/apps/web/server/routes/webhooks.ts
index fc1664b..c5334dd 100644
--- a/apps/web/server/routes/webhooks.ts
+++ b/apps/web/server/routes/webhooks.ts
@@ -10,6 +10,7 @@ import crypto from "crypto";
 import { eq } from "drizzle-orm";
 import { db } from "../db";
 import { googleDriveSyncState } from "../../drizzle/schema";
+import { auditLogger } from "../services/auditLogger";
 
 const PYTHON_BACKEND_URL =
   process.env.PYTHON_BACKEND_URL ||
@@ -38,6 +39,11 @@ export function createWebhookRouter(): Router {
     const resourceState = req.headers["x-goog-resource-state"] as string | undefined;
 
     if (!channelId || !resourceId || !channelToken) {
+      auditLogger.log({
+        eventType: "google_drive_webhook",
+        userId: null,
+        metadata: { rejection: "missing_headers", sourceIp: req.ip },
+      });
       res.status(403).json({ error: "Missing required headers" });
       return;
     }
@@ -50,6 +56,11 @@ export function createWebhookRouter(): Router {
       .limit(1);
 
     if (!syncState) {
+      auditLogger.log({
+        eventType: "google_drive_webhook",
+        userId: null,
+        metadata: { rejection: "unknown_channel", channelId, sourceIp: req.ip },
+      });
       res.status(403).json({ error: "Unknown channel" });
       return;
     }
@@ -68,6 +79,11 @@ export function createWebhookRouter(): Router {
       receivedHash.length !== storedHash.length ||
       !crypto.timingSafeEqual(Buffer.from(receivedHash), Buffer.from(storedHash))
     ) {
+      auditLogger.log({
+        eventType: "google_drive_webhook",
+        userId: syncState.userId,
+        metadata: { rejection: "invalid_token", channelId, sourceIp: req.ip },
+      });
       res.status(403).json({ error: "Invalid token" });
       return;
     }
@@ -75,6 +91,12 @@ export function createWebhookRouter(): Router {
     // Return 200 immediately (Google requires fast response)
     res.status(200).send("OK");
 
+    auditLogger.log({
+      eventType: "google_drive_webhook",
+      userId: syncState.userId,
+      metadata: { channelId, resourceState, action: "accepted" },
+    });
+
     // Skip processing for initial "sync" notification
     if (resourceState === "sync") {
       return;
diff --git a/apps/web/server/services/auditLogger.ts b/apps/web/server/services/auditLogger.ts
index 4092f5d..dba7244 100644
--- a/apps/web/server/services/auditLogger.ts
+++ b/apps/web/server/services/auditLogger.ts
@@ -26,6 +26,13 @@ export type AuditEventType =
   | "skill_detect"
   | "skill_execute"
   | "gdrive_api_call"
+  | "google_drive_connect"
+  | "google_drive_disconnect"
+  | "google_drive_token_refresh"
+  | "google_drive_data_access"
+  | "google_drive_sync"
+  | "google_drive_webhook"
+  | "google_drive_edit"
   | "error";
 
 export interface AuditLogEntry {
diff --git a/python-backend/app/core/smartspecweb_crypto.py b/python-backend/app/core/smartspecweb_crypto.py
index cf3e836..6d5b225 100644
--- a/python-backend/app/core/smartspecweb_crypto.py
+++ b/python-backend/app/core/smartspecweb_crypto.py
@@ -1,7 +1,7 @@
 """
-SmartSpecWeb-compatible AES-256-GCM decryption.
+SmartSpecWeb-compatible AES-256-GCM encryption/decryption.
 
-Decrypts values encrypted by SmartSpecWeb's crypto.ts (AES-256-GCM).
+Encrypts/decrypts values compatible with SmartSpecWeb's crypto.ts (AES-256-GCM).
 Format: iv_hex:authTag_hex:ciphertext_hex
 Key derivation: SHA-256 of LLM_ENCRYPTION_KEY env var.
 """
@@ -47,3 +47,40 @@ def decrypt_smartspecweb(ciphertext: str) -> str:
         return decrypted.decode("utf-8")
     except Exception as e:
         raise ValueError(f"Decryption failed: {e}") from e
+
+
+def encrypt_smartspecweb(plaintext: str) -> str:
+    """
+    Encrypt a value using the same AES-256-GCM format as SmartSpecWeb's encrypt().
+
+    Returns format "iv_hex:authTag_hex:ciphertext_hex" compatible with Node.js decrypt().
+    """
+    if not plaintext:
+        return ""
+
+    key = _get_key()
+    aesgcm = AESGCM(key)
+    iv = os.urandom(12)  # 96-bit IV, same as Node.js crypto
+    ct_with_tag = aesgcm.encrypt(iv, plaintext.encode("utf-8"), None)
+
+    # AESGCM appends 16-byte auth tag to ciphertext
+    ciphertext = ct_with_tag[:-16]
+    auth_tag = ct_with_tag[-16:]
+
+    return f"{iv.hex()}:{auth_tag.hex()}:{ciphertext.hex()}"
+
+
+def is_encrypted(value: str) -> bool:
+    """Check if a value appears to be in encrypted format (iv:tag:ciphertext)."""
+    if not value:
+        return False
+    parts = value.split(":")
+    if len(parts) != 3:
+        return False
+    try:
+        bytes.fromhex(parts[0])
+        bytes.fromhex(parts[1])
+        bytes.fromhex(parts[2])
+        return True
+    except ValueError:
+        return False
diff --git a/python-backend/app/mcp/google_drive_mcp.py b/python-backend/app/mcp/google_drive_mcp.py
index 47e6566..94bef72 100644
--- a/python-backend/app/mcp/google_drive_mcp.py
+++ b/python-backend/app/mcp/google_drive_mcp.py
@@ -8,11 +8,15 @@ interface pattern (name, description, inputSchema, handler).
 
 import logging
 import math
+import re
 import time
 from typing import Any, Optional
 
 logger = logging.getLogger(__name__)
 
+# File ID validation: alphanumeric, hyphens, underscores, max 256 chars
+_FILE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,256}$")
+
 
 # ── Exceptions ──────────────────────────────────────────────────────────────
 
@@ -63,6 +67,25 @@ async def _get_access_token(user_id: int, token_service=None) -> str:
     return await token_service.get_valid_access_token(user_id)
 
 
+def _validate_file_id(file_id: str) -> str:
+    """Validate and return a safe file ID."""
+    if not file_id or not _FILE_ID_RE.match(file_id):
+        raise ToolError("invalid_input", f"Invalid file ID format: {file_id!r}")
+    return file_id
+
+
+def _validate_query(query: str, max_length: int = 500) -> str:
+    """Validate and sanitize a search query."""
+    if not query or not query.strip():
+        raise ToolError("invalid_input", "Search query cannot be empty")
+    query = query.strip()
+    if len(query) > max_length:
+        raise ToolError("invalid_input", f"Search query too long (max {max_length} chars)")
+    # Strip null bytes and control characters
+    query = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", query)
+    return query
+
+
 # ── Tool Handlers ───────────────────────────────────────────────────────────
 
 
@@ -82,6 +105,8 @@ async def search_drive_files(
     """
     from app.services.google_token_service import InvalidGrantError
 
+    query = _validate_query(query)
+
     try:
         access_token = await _get_access_token(user_id, token_service)
 
@@ -90,8 +115,9 @@ async def search_drive_files(
         else:
             drive = _build_drive_service(access_token)
 
-        # Build query string
-        q_parts = [f"fullText contains '{query}' or name contains '{query}'"]
+        # Build query string — escape single quotes in user query
+        escaped_query = query.replace("\\", "\\\\").replace("'", "\\'")
+        q_parts = [f"fullText contains '{escaped_query}' or name contains '{escaped_query}'"]
         q_parts.append("trashed = false")
 
         if file_type and file_type in _MIME_FILTER_MAP:
@@ -140,6 +166,8 @@ async def read_drive_file(
     """
     from app.services.google_token_service import InvalidGrantError
 
+    file_id = _validate_file_id(file_id)
+
     try:
         access_token = await _get_access_token(user_id, token_service)
 
@@ -220,6 +248,10 @@ async def read_sheet_data(
     """
     from app.services.google_token_service import InvalidGrantError
 
+    file_id = _validate_file_id(file_id)
+    if cell_range and not re.match(r"^[A-Za-z0-9:!]+$", cell_range):
+        raise ToolError("invalid_input", f"Invalid cell range format: {cell_range!r}")
+
     try:
         access_token = await _get_access_token(user_id, token_service)
 
@@ -296,6 +328,9 @@ async def list_drive_folder(
     """
     from app.services.google_token_service import InvalidGrantError
 
+    if folder_id:
+        folder_id = _validate_file_id(folder_id)
+
     try:
         access_token = await _get_access_token(user_id, token_service)
 
@@ -340,6 +375,8 @@ async def get_drive_file_info(
     """
     from app.services.google_token_service import InvalidGrantError
 
+    file_id = _validate_file_id(file_id)
+
     try:
         access_token = await _get_access_token(user_id, token_service)
 
diff --git a/python-backend/app/services/google_content_extractor.py b/python-backend/app/services/google_content_extractor.py
index b09527c..01fc208 100644
--- a/python-backend/app/services/google_content_extractor.py
+++ b/python-backend/app/services/google_content_extractor.py
@@ -195,6 +195,10 @@ class GoogleContentExtractor:
             err.http_status = http_status  # type: ignore[attr-defined]
             raise err
 
+        # Sanitize extracted content before returning
+        from app.services.google_drive_content_sanitizer import sanitize_drive_content
+        text = sanitize_drive_content(text)
+
         return ContentExtractionResult(
             text=text,
             mime_type=mime_type,
diff --git a/python-backend/app/services/google_drive_content_sanitizer.py b/python-backend/app/services/google_drive_content_sanitizer.py
new file mode 100644
index 0000000..4ab9c23
--- /dev/null
+++ b/python-backend/app/services/google_drive_content_sanitizer.py
@@ -0,0 +1,76 @@
+"""
+Content sanitizer for text extracted from Google Drive files.
+
+Strips dangerous HTML/script content while preserving legitimate text,
+markdown formatting, and code blocks.
+"""
+
+import re
+
+
+# Patterns to strip (compiled for performance)
+_SCRIPT_RE = re.compile(r"<script[^>]*>.*?</script>", re.DOTALL | re.IGNORECASE)
+_STYLE_RE = re.compile(r"<style[^>]*>.*?</style>", re.DOTALL | re.IGNORECASE)
+_IFRAME_RE = re.compile(r"<iframe[^>]*>.*?</iframe>", re.DOTALL | re.IGNORECASE)
+_OBJECT_RE = re.compile(r"<object[^>]*>.*?</object>", re.DOTALL | re.IGNORECASE)
+_EMBED_RE = re.compile(r"<embed[^>]*/?\\s*>", re.IGNORECASE)
+_EVENT_HANDLER_RE = re.compile(r"\s+on\w+\s*=\s*[\"'][^\"']*[\"']", re.IGNORECASE)
+_JAVASCRIPT_URI_RE = re.compile(r"javascript\s*:", re.IGNORECASE)
+_DATA_URI_EXEC_RE = re.compile(
+    r"data\s*:\s*(text/html|application/javascript|text/javascript)", re.IGNORECASE
+)
+_NULL_BYTES_RE = re.compile(r"[\x00]")
+_CONTROL_CHARS_RE = re.compile(r"[\x01-\x08\x0b\x0c\x0e-\x1f]")
+
+
+def sanitize_drive_content(raw_text: str) -> str:
+    """
+    Sanitize text extracted from Google Drive files before storage.
+
+    Strips:
+    - <script> tags and their content
+    - <style> tags and their content
+    - HTML event handlers (onclick, onerror, onload, etc.)
+    - <iframe>, <object>, <embed> tags
+    - javascript: URIs
+    - Data URIs with executable MIME types
+    - Null bytes and control characters (except newlines/tabs)
+
+    Preserves:
+    - Plain text content
+    - Markdown formatting (headings, lists, bold, italic, code)
+    - Non-harmful HTML entities (&amp;, &lt;, etc.)
+    - Code blocks (content within ``` fences is preserved as-is)
+    """
+    if not raw_text:
+        return ""
+
+    # Protect code blocks from sanitization
+    code_blocks: list[str] = []
+    code_block_re = re.compile(r"```[\s\S]*?```", re.MULTILINE)
+
+    def _save_code_block(match: re.Match) -> str:
+        code_blocks.append(match.group(0))
+        return f"__CODE_BLOCK_{len(code_blocks) - 1}__"
+
+    text = code_block_re.sub(_save_code_block, raw_text)
+
+    # Strip dangerous patterns
+    text = _SCRIPT_RE.sub("", text)
+    text = _STYLE_RE.sub("", text)
+    text = _IFRAME_RE.sub("", text)
+    text = _OBJECT_RE.sub("", text)
+    text = _EMBED_RE.sub("", text)
+    text = _EVENT_HANDLER_RE.sub("", text)
+    text = _JAVASCRIPT_URI_RE.sub("", text)
+    text = _DATA_URI_EXEC_RE.sub("data:blocked", text)
+
+    # Strip null bytes and control chars (keep \n, \r, \t)
+    text = _NULL_BYTES_RE.sub("", text)
+    text = _CONTROL_CHARS_RE.sub("", text)
+
+    # Restore code blocks
+    for i, block in enumerate(code_blocks):
+        text = text.replace(f"__CODE_BLOCK_{i}__", block)
+
+    return text
diff --git a/python-backend/app/services/google_scope_guard.py b/python-backend/app/services/google_scope_guard.py
new file mode 100644
index 0000000..9e9f448
--- /dev/null
+++ b/python-backend/app/services/google_scope_guard.py
@@ -0,0 +1,68 @@
+"""
+Google OAuth scope verification guard.
+
+Checks that a user's granted OAuth scopes include the required scope
+before making Google API calls. Prevents scope-mismatch errors.
+"""
+
+import logging
+from typing import Optional
+
+from sqlalchemy import select
+from sqlalchemy.ext.asyncio import AsyncSession
+
+from app.models.oauth import OAuthConnection
+
+logger = logging.getLogger(__name__)
+
+DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly"
+DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file"
+DOCS_READONLY_SCOPE = "https://www.googleapis.com/auth/documents.readonly"
+SHEETS_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly"
+
+
+class ScopeMissingError(Exception):
+    """Raised when the user's OAuth grant does not include a required scope."""
+
+    def __init__(self, required_scope: str, granted_scopes: list[str]):
+        self.required_scope = required_scope
+        self.granted_scopes = granted_scopes
+        super().__init__(
+            f"Required scope '{required_scope}' not in granted scopes: {granted_scopes}"
+        )
+
+
+async def verify_scopes(
+    user_id: int,
+    required_scopes: list[str],
+    db: AsyncSession,
+) -> None:
+    """
+    Verify that the user's Google OAuth connection has the required scopes.
+
+    Raises ScopeMissingError if any required scope is not granted.
+    Raises ValueError if no Google connection exists.
+    """
+    result = await db.execute(
+        select(OAuthConnection).where(
+            OAuthConnection.user_id == user_id,
+            OAuthConnection.provider == "google",
+        )
+    )
+    conn = result.scalar_one_or_none()
+
+    if not conn:
+        raise ValueError("No Google connection found for this user")
+
+    granted = conn.scopes.split(",") if conn.scopes else []
+
+    for scope in required_scopes:
+        if scope not in granted:
+            raise ScopeMissingError(scope, granted)
+
+
+def has_scope(scopes_str: Optional[str], required: str) -> bool:
+    """Quick check if a scope string contains the required scope."""
+    if not scopes_str:
+        return False
+    return required in scopes_str.split(",")
diff --git a/python-backend/app/services/google_token_service.py b/python-backend/app/services/google_token_service.py
index e08f5ad..4f5ae69 100644
--- a/python-backend/app/services/google_token_service.py
+++ b/python-backend/app/services/google_token_service.py
@@ -15,6 +15,11 @@ from sqlalchemy import select
 from sqlalchemy.ext.asyncio import AsyncSession
 
 from app.core.oauth_config import get_oauth_config
+from app.core.smartspecweb_crypto import (
+    decrypt_smartspecweb,
+    encrypt_smartspecweb,
+    is_encrypted,
+)
 from app.models.oauth import OAuthConnection
 from app.services.oauth_service import OAuthService, state_serializer
 
@@ -56,6 +61,22 @@ class GoogleTokenService:
         )
         return result.scalar_one_or_none()
 
+    @staticmethod
+    def _decrypt_token(token: Optional[str]) -> str:
+        """Decrypt a token value, handling both encrypted and plaintext formats."""
+        if not token:
+            return ""
+        if is_encrypted(token):
+            return decrypt_smartspecweb(token)
+        return token
+
+    @staticmethod
+    def _encrypt_token(token: str) -> str:
+        """Encrypt a token value for storage."""
+        if not token:
+            return ""
+        return encrypt_smartspecweb(token)
+
     async def get_valid_access_token(self, user_id: int) -> str:
         """
         Returns a valid access token, refreshing if near expiry.
@@ -72,14 +93,15 @@ class GoogleTokenService:
 
         # Return cached token if not near expiry
         if expires_at and (expires_at - now) > REFRESH_BUFFER:
-            return conn.access_token
+            return self._decrypt_token(conn.access_token)
 
         # Refresh the token
         return await self._refresh_token(conn)
 
     async def _refresh_token(self, conn: OAuthConnection) -> str:
         """Refresh the access token using the stored refresh_token."""
-        if not conn.refresh_token:
+        refresh_token = self._decrypt_token(conn.refresh_token)
+        if not refresh_token:
             conn.status = "expired"
             await self.db.commit()
             raise InvalidGrantError("No refresh token available")
@@ -94,7 +116,7 @@ class GoogleTokenService:
                 data={
                     "client_id": client_id,
                     "client_secret": client_secret,
-                    "refresh_token": conn.refresh_token,
+                    "refresh_token": refresh_token,
                     "grant_type": "refresh_token",
                 },
             )
@@ -109,10 +131,11 @@ class GoogleTokenService:
                 raise InvalidGrantError(f"Google token refresh failed: {error}")
             raise ValueError(f"Token refresh failed: {error}")
 
-        # Update stored tokens
-        conn.access_token = data["access_token"]
+        # Update stored tokens (encrypted)
+        new_access_token = data["access_token"]
+        conn.access_token = self._encrypt_token(new_access_token)
         if "refresh_token" in data:
-            conn.refresh_token = data["refresh_token"]
+            conn.refresh_token = self._encrypt_token(data["refresh_token"])
         conn.token_expires_at = datetime.now(timezone.utc) + timedelta(
             seconds=data.get("expires_in", 3600)
         )
@@ -120,7 +143,7 @@ class GoogleTokenService:
         await self.db.commit()
 
         logger.info("Refreshed Google access token for user %s", conn.user_id)
-        return conn.access_token
+        return new_access_token
 
     async def build_drive_auth_url(self, user_id: int) -> dict:
         """Build Google OAuth URL with Drive scopes for incremental consent."""
@@ -205,23 +228,25 @@ class GoogleTokenService:
         if userinfo_resp.status_code == 200:
             email = userinfo_resp.json().get("email")
 
-        # Upsert oauth_connections
+        # Upsert oauth_connections (encrypt tokens before storage)
+        encrypted_access = self._encrypt_token(access_token)
+        encrypted_refresh = self._encrypt_token(refresh_token) if refresh_token else None
+
         existing = await self._get_connection(user_id)
         if existing:
-            existing.access_token = access_token
-            if refresh_token:
-                existing.refresh_token = refresh_token
+            existing.access_token = encrypted_access
+            if encrypted_refresh:
+                existing.refresh_token = encrypted_refresh
             existing.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
             existing.status = "active"
             existing.scopes = ",".join(granted_scopes)
         else:
-            # TODO: encrypt access_token and refresh_token before storage (section-15)
             new_conn = OAuthConnection(
                 user_id=user_id,
                 provider="google",
                 provider_user_id=email or str(user_id),
-                access_token=access_token,
-                refresh_token=refresh_token,
+                access_token=encrypted_access,
+                refresh_token=encrypted_refresh,
                 token_expires_at=datetime.now(timezone.utc) + timedelta(seconds=expires_in),
                 status="active",
                 scopes=",".join(granted_scopes),
@@ -278,7 +303,7 @@ class GoogleTokenService:
         if not conn:
             return False
 
-        access_token = conn.access_token
+        access_token = self._decrypt_token(conn.access_token)
         revoked_at_google = False
 
         if access_token:
