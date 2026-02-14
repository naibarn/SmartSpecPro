diff --git a/apps/web/server/_core/index.ts b/apps/web/server/_core/index.ts
index a1978c1..03791a5 100644
--- a/apps/web/server/_core/index.ts
+++ b/apps/web/server/_core/index.ts
@@ -13,6 +13,7 @@ import { registerLLMRoutes } from "./llmRoutes";
 import { registerMCPRoutes } from "./mcpRoutes";
 import { registerMediaJobRoutes } from "../routers/mediaJobs";
 
+import { createWebhookRouter } from "../routes/webhooks";
 import { registerDeviceAuthRoutes } from "./deviceAuthRoutes";
 import { registerServicesRoutes } from "../routers/services";
 import { registerTenantRoutes } from "../routers/tenant";
@@ -125,7 +126,9 @@ const csrfCheck = (req: any, res: any, next: any) => {
   // These are server-to-server callbacks and are validated by provider-specific logic.
   if (
     req.path === "/v1/media/callback/kie-ai" ||
-    req.originalUrl === "/api/v1/media/callback/kie-ai"
+    req.originalUrl === "/api/v1/media/callback/kie-ai" ||
+    req.path.startsWith("/webhooks/gdrive") ||
+    req.originalUrl.startsWith("/api/webhooks/gdrive")
   ) {
     return next();
   }
@@ -213,6 +216,9 @@ app.get("/api/storage/files/*", async (req, res) => {
   }
 });
 
+// Webhook routes (before CSRF-protected routes, Google Drive sends raw POSTs)
+app.use("/api/webhooks", createWebhookRouter());
+
 // REST/SSE endpoints
 registerLLMRoutes(app);
 registerMCPRoutes(app);
diff --git a/apps/web/server/routers/googleDrive.ts b/apps/web/server/routers/googleDrive.ts
index d0d63b9..cd6da0b 100644
--- a/apps/web/server/routers/googleDrive.ts
+++ b/apps/web/server/routers/googleDrive.ts
@@ -12,7 +12,7 @@ import { TRPCError } from "@trpc/server";
 import { protectedProcedure, router } from "../_core/trpc";
 import { signBearerToken } from "../_core/tokens";
 import { db } from "../db";
-import { googleDriveEditSessions, libraryItems } from "../../drizzle/schema";
+import { googleDriveEditSessions, googleDriveSyncState, libraryItems } from "../../drizzle/schema";
 import { storageGet, storagePut } from "../storage";
 
 const PYTHON_BACKEND_URL =
@@ -389,4 +389,172 @@ export const googleDriveRouter = router({
 
       return { success: true };
     }),
+
+  /**
+   * Get the user's Drive sync status and settings.
+   */
+  getSyncStatus: protectedProcedure.query(async ({ ctx }) => {
+    if (!ctx.tenantId) return null;
+    const [state] = await db
+      .select()
+      .from(googleDriveSyncState)
+      .where(
+        and(
+          eq(googleDriveSyncState.tenantId, ctx.tenantId),
+          eq(googleDriveSyncState.userId, ctx.user.id),
+        ),
+      )
+      .limit(1);
+    if (!state) return null;
+    return {
+      indexingMode: state.indexingMode,
+      folderSelections: state.folderSelections,
+      fileTypeFilter: state.fileTypeFilter,
+      maxFileSizeBytes: state.maxFileSizeBytes,
+      filesTotal: state.filesTotal,
+      filesProcessed: state.filesProcessed,
+      lastSyncAt: state.lastSyncAt?.toISOString() ?? null,
+      lastError: state.lastError,
+      autoSyncEnabled: state.autoSyncEnabled,
+    };
+  }),
+
+  /**
+   * Start an initial sync or manual re-sync.
+   */
+  startSync: protectedProcedure.mutation(async ({ ctx }) => {
+    if (!ctx.tenantId)
+      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tenant context required" });
+
+    // Verify Google connection
+    const token = createDriveToken(ctx.user.id);
+    const statusResp = await fetch(`${PYTHON_BACKEND_URL}/api/oauth/google/drive/status`, {
+      headers: { Authorization: `Bearer ${token}` },
+    });
+    if (!statusResp.ok)
+      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to check Google connection" });
+    const connStatus = (await statusResp.json()) as { status: string };
+    if (connStatus.status !== "connected")
+      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Google account not connected" });
+
+    // Ensure sync state exists
+    const [existing] = await db
+      .select()
+      .from(googleDriveSyncState)
+      .where(
+        and(
+          eq(googleDriveSyncState.tenantId, ctx.tenantId),
+          eq(googleDriveSyncState.userId, ctx.user.id),
+        ),
+      )
+      .limit(1);
+    if (!existing) {
+      await db.insert(googleDriveSyncState).values({
+        tenantId: ctx.tenantId,
+        userId: ctx.user.id,
+        indexingMode: "all",
+      });
+    }
+
+    // Trigger sync via Python backend
+    const proxyToken = process.env.SMARTSPEC_PROXY_TOKEN || "";
+    const pyResp = await fetch(`${PYTHON_BACKEND_URL}/api/internal/gdrive/start-sync`, {
+      method: "POST",
+      headers: {
+        "Content-Type": "application/json",
+        "x-proxy-token": proxyToken,
+      },
+      body: JSON.stringify({ user_id: ctx.user.id, tenant_id: ctx.tenantId }),
+    });
+    if (!pyResp.ok) {
+      const err = await pyResp.json().catch(() => ({}));
+      throw new TRPCError({
+        code: "INTERNAL_SERVER_ERROR",
+        message: (err as any).detail || "Failed to start sync",
+      });
+    }
+    return { started: true };
+  }),
+
+  /**
+   * Update sync settings (indexing mode, folder selections, file type filter).
+   */
+  updateSyncSettings: protectedProcedure
+    .input(
+      z.object({
+        indexingMode: z.enum(["none", "selected_folders", "all_except", "all"]),
+        folderSelections: z
+          .array(z.object({ folderId: z.string(), folderName: z.string() }))
+          .optional(),
+        fileTypeFilter: z.array(z.string()).optional(),
+        maxFileSizeBytes: z.number().positive().optional(),
+        autoSyncEnabled: z.boolean().optional(),
+      }),
+    )
+    .mutation(async ({ ctx, input }) => {
+      if (!ctx.tenantId)
+        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tenant context required" });
+
+      const [existing] = await db
+        .select()
+        .from(googleDriveSyncState)
+        .where(
+          and(
+            eq(googleDriveSyncState.tenantId, ctx.tenantId),
+            eq(googleDriveSyncState.userId, ctx.user.id),
+          ),
+        )
+        .limit(1);
+
+      const values: any = {
+        indexingMode: input.indexingMode as any,
+        updatedAt: new Date(),
+      };
+      if (input.folderSelections !== undefined)
+        values.folderSelections = input.folderSelections.map((f) => f.folderId);
+      if (input.fileTypeFilter !== undefined) values.fileTypeFilter = input.fileTypeFilter;
+      if (input.maxFileSizeBytes !== undefined) values.maxFileSizeBytes = input.maxFileSizeBytes;
+      if (input.autoSyncEnabled !== undefined) values.autoSyncEnabled = input.autoSyncEnabled;
+
+      if (existing) {
+        await db
+          .update(googleDriveSyncState)
+          .set(values)
+          .where(eq(googleDriveSyncState.id, existing.id));
+      } else {
+        await db.insert(googleDriveSyncState).values({
+          tenantId: ctx.tenantId,
+          userId: ctx.user.id,
+          ...values,
+        });
+      }
+
+      return { success: true };
+    }),
+
+  /**
+   * Estimate sync cost (count matching files and credit cost).
+   */
+  estimateSyncCost: protectedProcedure.mutation(async ({ ctx }) => {
+    if (!ctx.tenantId)
+      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tenant context required" });
+
+    const proxyToken = process.env.SMARTSPEC_PROXY_TOKEN || "";
+    const resp = await fetch(`${PYTHON_BACKEND_URL}/api/internal/gdrive/estimate-cost`, {
+      method: "POST",
+      headers: {
+        "Content-Type": "application/json",
+        "x-proxy-token": proxyToken,
+      },
+      body: JSON.stringify({ user_id: ctx.user.id, tenant_id: ctx.tenantId }),
+    });
+    if (!resp.ok) {
+      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to estimate cost" });
+    }
+    return resp.json() as Promise<{
+      file_count: number;
+      estimated_credits: number;
+      estimated_size_mb: number;
+    }>;
+  }),
 });
diff --git a/apps/web/server/routes/webhooks.ts b/apps/web/server/routes/webhooks.ts
new file mode 100644
index 0000000..c776721
--- /dev/null
+++ b/apps/web/server/routes/webhooks.ts
@@ -0,0 +1,104 @@
+/**
+ * Express webhook routes for external service callbacks.
+ *
+ * These are plain Express routes (not tRPC) because webhook senders
+ * (e.g. Google Drive) send raw HTTP POSTs without tRPC framing.
+ */
+
+import { Router } from "express";
+import crypto from "crypto";
+import { eq, and } from "drizzle-orm";
+import { db } from "../db";
+import { googleDriveSyncState } from "../../drizzle/schema";
+
+const PYTHON_BACKEND_URL =
+  process.env.PYTHON_BACKEND_URL ||
+  process.env.VITE_PYTHON_BACKEND_URL ||
+  "http://localhost:8000";
+const PROXY_TOKEN = process.env.SMARTSPEC_PROXY_TOKEN || "";
+
+export function createWebhookRouter(): Router {
+  const router = Router();
+
+  /**
+   * Google Drive Changes API webhook handler.
+   *
+   * Google sends POST requests with these headers:
+   *   X-Goog-Channel-ID: the channel_id we registered
+   *   X-Goog-Resource-ID: the resource_id from the watch response
+   *   X-Goog-Channel-Token: the secret token we generated
+   *   X-Goog-Resource-State: "sync" (initial) or "change" (update)
+   *
+   * Security: triple validation of channel_id + resource_id + channel_token_hash.
+   */
+  router.post("/gdrive", async (req, res) => {
+    const channelId = req.headers["x-goog-channel-id"] as string | undefined;
+    const resourceId = req.headers["x-goog-resource-id"] as string | undefined;
+    const channelToken = req.headers["x-goog-channel-token"] as string | undefined;
+    const resourceState = req.headers["x-goog-resource-state"] as string | undefined;
+
+    if (!channelId || !resourceId || !channelToken) {
+      res.status(403).json({ error: "Missing required headers" });
+      return;
+    }
+
+    // Look up sync state by channel_id
+    const [syncState] = await db
+      .select()
+      .from(googleDriveSyncState)
+      .where(eq(googleDriveSyncState.channelId, channelId))
+      .limit(1);
+
+    if (!syncState) {
+      res.status(403).json({ error: "Unknown channel" });
+      return;
+    }
+
+    // Validate resource_id
+    if (syncState.resourceId !== resourceId) {
+      res.status(403).json({ error: "Resource mismatch" });
+      return;
+    }
+
+    // Validate channel_token via hash comparison (timing-safe)
+    const receivedHash = crypto.createHash("sha256").update(channelToken).digest("hex");
+    const storedHash = syncState.channelTokenHash || "";
+
+    if (
+      receivedHash.length !== storedHash.length ||
+      !crypto.timingSafeEqual(Buffer.from(receivedHash), Buffer.from(storedHash))
+    ) {
+      res.status(403).json({ error: "Invalid token" });
+      return;
+    }
+
+    // Return 200 immediately (Google requires fast response)
+    res.status(200).send("OK");
+
+    // Skip processing for initial "sync" notification
+    if (resourceState === "sync") {
+      return;
+    }
+
+    // Fire-and-forget: enqueue change processing via Python backend
+    try {
+      fetch(`${PYTHON_BACKEND_URL}/api/internal/gdrive/process-changes`, {
+        method: "POST",
+        headers: {
+          "Content-Type": "application/json",
+          "x-proxy-token": PROXY_TOKEN,
+        },
+        body: JSON.stringify({
+          user_id: syncState.userId,
+          tenant_id: syncState.tenantId,
+        }),
+      }).catch((err) => {
+        console.error("[Webhook] Failed to enqueue Drive changes:", err);
+      });
+    } catch {
+      // Non-blocking -- don't let errors affect the 200 response
+    }
+  });
+
+  return router;
+}
diff --git a/python-backend/app/api/internal_gdrive.py b/python-backend/app/api/internal_gdrive.py
new file mode 100644
index 0000000..526a044
--- /dev/null
+++ b/python-backend/app/api/internal_gdrive.py
@@ -0,0 +1,109 @@
+"""Internal Google Drive sync API router.
+
+Exposes endpoints for the Node.js backend to trigger sync operations:
+  POST /api/internal/gdrive/start-sync        -- enqueue initial sync
+  POST /api/internal/gdrive/process-changes   -- enqueue change processing
+  POST /api/internal/gdrive/estimate-cost     -- count matching files
+"""
+
+import logging
+import secrets
+from typing import Optional
+
+from fastapi import APIRouter, Header, HTTPException
+from pydantic import BaseModel
+
+from app.core.config import settings
+
+logger = logging.getLogger(__name__)
+
+router = APIRouter(prefix="/api/internal/gdrive", tags=["Internal GDrive"])
+
+
+# ── Auth ────────────────────────────────────────────────────────────────────
+
+
+async def _verify_proxy_token(x_proxy_token: Optional[str] = Header(None)):
+    """Verify the internal proxy token for Node.js -> Python calls."""
+    if not x_proxy_token:
+        raise HTTPException(status_code=401, detail="Missing proxy token")
+    proxy_token = getattr(settings, "SMARTSPEC_PROXY_TOKEN", None)
+    if not proxy_token:
+        raise HTTPException(status_code=500, detail="SMARTSPEC_PROXY_TOKEN not configured")
+    if not secrets.compare_digest(x_proxy_token, proxy_token):
+        raise HTTPException(status_code=401, detail="Invalid proxy token")
+
+
+# ── Request Models ──────────────────────────────────────────────────────────
+
+
+class StartSyncRequest(BaseModel):
+    user_id: int
+    tenant_id: str
+
+
+class ProcessChangesRequest(BaseModel):
+    user_id: int
+    tenant_id: str
+
+
+class EstimateCostRequest(BaseModel):
+    user_id: int
+    tenant_id: str
+
+
+# ── Endpoints ───────────────────────────────────────────────────────────────
+
+
+@router.post("/start-sync")
+async def start_sync(
+    request: StartSyncRequest,
+    x_proxy_token: Optional[str] = Header(None),
+):
+    """Enqueue initial_drive_sync Celery task."""
+    await _verify_proxy_token(x_proxy_token)
+
+    from app.tasks.google_drive_tasks import initial_drive_sync
+
+    result = initial_drive_sync.delay(request.user_id, request.tenant_id)
+    logger.info(
+        "initial_drive_sync enqueued user_id=%d tenant_id=%s task_id=%s",
+        request.user_id, request.tenant_id, result.id,
+    )
+    return {"started": True, "task_id": result.id}
+
+
+@router.post("/process-changes")
+async def trigger_process_changes(
+    request: ProcessChangesRequest,
+    x_proxy_token: Optional[str] = Header(None),
+):
+    """Enqueue process_drive_changes Celery task."""
+    await _verify_proxy_token(x_proxy_token)
+
+    from app.tasks.google_drive_tasks import process_drive_changes
+
+    result = process_drive_changes.delay(request.user_id, request.tenant_id)
+    logger.info(
+        "process_drive_changes enqueued user_id=%d tenant_id=%s task_id=%s",
+        request.user_id, request.tenant_id, result.id,
+    )
+    return {"started": True, "task_id": result.id}
+
+
+@router.post("/estimate-cost")
+async def estimate_sync_cost(
+    request: EstimateCostRequest,
+    x_proxy_token: Optional[str] = Header(None),
+):
+    """Count matching files and return estimated credit cost without indexing."""
+    await _verify_proxy_token(x_proxy_token)
+
+    from app.tasks.google_drive_tasks import _estimate_sync_cost_impl
+
+    try:
+        result = await _estimate_sync_cost_impl(request.user_id, request.tenant_id)
+        return result
+    except Exception as e:
+        logger.error("estimate_cost_failed user_id=%d error=%s", request.user_id, str(e))
+        raise HTTPException(status_code=500, detail=str(e))
diff --git a/python-backend/app/core/celery_app.py b/python-backend/app/core/celery_app.py
index 5f9918a..49309c9 100644
--- a/python-backend/app/core/celery_app.py
+++ b/python-backend/app/core/celery_app.py
@@ -58,6 +58,9 @@ celery_app.conf.update(
         "app.tasks.media_tasks.recover_stuck_tasks": {"queue": "media"},
         # Google Drive indexing -> media queue (network-bound)
         "app.tasks.google_drive_tasks.process_google_drive_index_job": {"queue": "media"},
+        "app.tasks.google_drive_tasks.initial_drive_sync": {"queue": "media"},
+        "app.tasks.google_drive_tasks.process_drive_changes": {"queue": "media"},
+        "app.tasks.google_drive_tasks.renew_drive_watch_channels": {"queue": "media"},
         # Workflow tasks -> celery queue (lightweight, frequent)
         "app.tasks.workflow_tasks.check_scheduled_workflows": {"queue": "celery"},
         "app.tasks.workflow_tasks.process_system_event": {"queue": "celery"},
@@ -97,6 +100,10 @@ celery_app.conf.beat_schedule = {
         "task": "cleanup_expired_edit_sessions",
         "schedule": crontab(minute="*/30"),  # Every 30 minutes - expire stale Google Drive edit sessions
     },
+    "renew-drive-watch-channels": {
+        "task": "renew_drive_watch_channels",
+        "schedule": crontab(minute=0, hour="*/6"),  # Every 6 hours - renew expiring webhook channels
+    },
 }
 
 # Auto-discover tasks
diff --git a/python-backend/app/main.py b/python-backend/app/main.py
index 2f5d9c0..8604ea3 100644
--- a/python-backend/app/main.py
+++ b/python-backend/app/main.py
@@ -58,6 +58,7 @@ from app.api import (
     oauth,  # OAuth Social Login
     telegram_webhook,  # Telegram bot webhook for account linking
     internal_mcp,  # Internal MCP tools API (Google Drive)
+    internal_gdrive,  # Internal Google Drive sync API
 )
 from app.api.v1 import (
     skills,
@@ -247,6 +248,7 @@ app.include_router(rbac.router, tags=["RBAC"])
 app.include_router(approvals.router, tags=["Approvals"])
 app.include_router(oauth.router, tags=["OAuth"])
 app.include_router(internal_mcp.router, tags=["Internal MCP"])
+app.include_router(internal_gdrive.router, tags=["Internal GDrive"])
 
 @app.get("/")
 async def root():
diff --git a/python-backend/app/services/google_drive_sync_service.py b/python-backend/app/services/google_drive_sync_service.py
new file mode 100644
index 0000000..fa0d6b7
--- /dev/null
+++ b/python-backend/app/services/google_drive_sync_service.py
@@ -0,0 +1,173 @@
+"""Google Drive sync service -- file filtering and webhook channel management."""
+
+import logging
+import secrets
+import uuid
+from datetime import datetime, timedelta
+from typing import Any, Optional
+
+logger = logging.getLogger(__name__)
+
+# MIME type mapping for file_type_filter
+FILE_TYPE_MIMES: dict[str, list[str]] = {
+    "document": [
+        "application/vnd.google-apps.document",
+        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
+        "application/msword",
+    ],
+    "spreadsheet": [
+        "application/vnd.google-apps.spreadsheet",
+        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
+        "application/vnd.ms-excel",
+    ],
+    "presentation": [
+        "application/vnd.google-apps.presentation",
+        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
+    ],
+    "pdf": ["application/pdf"],
+    "text": ["text/plain", "text/csv", "text/markdown"],
+}
+
+GOOGLE_FOLDER_MIME = "application/vnd.google-apps.folder"
+
+
+def should_index_file(
+    file_metadata: dict[str, Any],
+    sync_settings: Any,
+    folder_hierarchy_cache: Optional[dict[str, list[str]]] = None,
+) -> bool:
+    """Determine whether a Drive file should be indexed based on sync settings.
+
+    sync_settings must have: indexing_mode, file_type_filter, max_file_size_bytes,
+    folder_selections.
+    """
+    mime_type = file_metadata.get("mimeType", "")
+
+    # 1. Reject Google Drive folders
+    if mime_type == GOOGLE_FOLDER_MIME:
+        return False
+
+    # 2. Check indexing mode
+    indexing_mode = getattr(sync_settings, "indexing_mode", None)
+    if isinstance(sync_settings, dict):
+        indexing_mode = sync_settings.get("indexing_mode")
+
+    if indexing_mode == "none":
+        return False
+
+    # 3. Check file type filter
+    file_type_filter = getattr(sync_settings, "file_type_filter", None)
+    if isinstance(sync_settings, dict):
+        file_type_filter = sync_settings.get("file_type_filter")
+
+    if file_type_filter:
+        allowed_mimes: set[str] = set()
+        for ft in file_type_filter:
+            allowed_mimes.update(FILE_TYPE_MIMES.get(ft, []))
+        if mime_type not in allowed_mimes:
+            # Check prefix match for image types
+            if "image" in file_type_filter and mime_type.startswith("image/"):
+                pass
+            else:
+                return False
+
+    # 4. Check size guard
+    max_size = getattr(sync_settings, "max_file_size_bytes", None)
+    if isinstance(sync_settings, dict):
+        max_size = sync_settings.get("max_file_size_bytes")
+
+    if max_size:
+        file_size = int(file_metadata.get("size", 0) or 0)
+        if file_size > max_size:
+            return False
+
+    # 5. Folder-based filtering
+    if indexing_mode == "selected_folders":
+        folder_selections = _get_folder_ids(sync_settings)
+        if not folder_selections:
+            return False
+        parents = file_metadata.get("parents", [])
+        if not _parent_in_selected(parents, folder_selections, folder_hierarchy_cache):
+            return False
+
+    elif indexing_mode == "all_except":
+        folder_selections = _get_folder_ids(sync_settings)
+        if folder_selections:
+            parents = file_metadata.get("parents", [])
+            if _parent_in_selected(parents, folder_selections, folder_hierarchy_cache):
+                return False
+
+    return True
+
+
+def _get_folder_ids(sync_settings: Any) -> list[str]:
+    """Extract folder IDs from sync settings."""
+    selections = getattr(sync_settings, "folder_selections", None)
+    if isinstance(sync_settings, dict):
+        selections = sync_settings.get("folder_selections")
+    if not selections:
+        return []
+    if isinstance(selections, list):
+        return [
+            s.get("folderId", s) if isinstance(s, dict) else str(s)
+            for s in selections
+        ]
+    return []
+
+
+def _parent_in_selected(
+    parents: list[str],
+    folder_ids: list[str],
+    cache: Optional[dict[str, list[str]]] = None,
+) -> bool:
+    """Check if any parent is in the selected folder list."""
+    folder_set = set(folder_ids)
+    for parent in parents:
+        if parent in folder_set:
+            return True
+        # Check cache for parent chain
+        if cache and parent in cache:
+            for ancestor in cache[parent]:
+                if ancestor in folder_set:
+                    return True
+    return False
+
+
+async def setup_watch_channel(
+    user_id: int,
+    tenant_id: str,
+    access_token: str,
+) -> dict[str, Any]:
+    """Create a Google Drive Changes API watch channel."""
+    from google.oauth2.credentials import Credentials
+    from googleapiclient.discovery import build
+
+    creds = Credentials(token=access_token)
+    drive = build("drive", "v3", credentials=creds)
+
+    # Get start page token
+    token_response = drive.changes().getStartPageToken().execute()
+    page_token = token_response.get("startPageToken")
+
+    # Generate channel credentials
+    channel_token = secrets.token_hex(32)
+    channel_id = f"ssp-{tenant_id}-{user_id}-{uuid.uuid4().hex[:8]}"
+    expiry_ms = int((datetime.utcnow() + timedelta(days=7)).timestamp() * 1000)
+
+    # Create watch channel
+    body = {
+        "id": channel_id,
+        "type": "web_hook",
+        "address": "https://smartaihub.app/api/webhooks/gdrive",
+        "token": channel_token,
+        "expiration": str(expiry_ms),
+    }
+    watch_response = drive.changes().watch(pageToken=page_token, body=body).execute()
+
+    return {
+        "channel_id": channel_id,
+        "resource_id": watch_response.get("resourceId", ""),
+        "channel_token": channel_token,
+        "channel_expiry": datetime.utcfromtimestamp(expiry_ms / 1000),
+        "page_token": page_token,
+    }
diff --git a/python-backend/app/tasks/google_drive_tasks.py b/python-backend/app/tasks/google_drive_tasks.py
index 2dd5d5c..6b5795d 100644
--- a/python-backend/app/tasks/google_drive_tasks.py
+++ b/python-backend/app/tasks/google_drive_tasks.py
@@ -558,3 +558,575 @@ def process_google_drive_index_job_task(self, job_id: int):
     except Exception as e:
         logger.error("process_gdrive_index_exception", extra={"job_id": job_id, "error": str(e)})
         return {"status": "failed", "error": str(e), "job_id": job_id}
+
+
+# ── Incremental Sync Tasks ────────────────────────────────────────────────
+
+
+@celery_app.task(name="initial_drive_sync", bind=True, max_retries=3, default_retry_delay=60)
+def initial_drive_sync(self, user_id: int, tenant_id: str):
+    """Perform initial sync of a user's Google Drive.
+
+    Lists all files matching sync settings, creates virtual references,
+    and sets up a webhook channel for real-time updates.
+    """
+    logger.info("initial_drive_sync_started user_id=%d tenant_id=%s", user_id, tenant_id)
+    try:
+        return _run_async(_initial_drive_sync_async(user_id, tenant_id))
+    except Exception as e:
+        logger.error("initial_drive_sync_failed user_id=%d error=%s", user_id, str(e))
+        raise self.retry(exc=e, countdown=60)
+
+
+@celery_app.task(name="process_drive_changes", bind=True, max_retries=3, default_retry_delay=30)
+def process_drive_changes(self, user_id: int, tenant_id: str):
+    """Fetch and process changes from Google Drive Changes API.
+
+    Called after a webhook notification or periodic polling.
+    """
+    logger.info("process_drive_changes_started user_id=%d tenant_id=%s", user_id, tenant_id)
+    try:
+        return _run_async(_process_drive_changes_async(user_id, tenant_id))
+    except Exception as e:
+        logger.error("process_drive_changes_failed user_id=%d error=%s", user_id, str(e))
+        raise self.retry(exc=e, countdown=30)
+
+
+@celery_app.task(name="renew_drive_watch_channels")
+def renew_drive_watch_channels():
+    """Periodic task to renew expiring Drive webhook channels.
+
+    Runs every 6 hours via Celery Beat. Renews channels expiring within 24h.
+    """
+    logger.info("renew_drive_watch_channels_started")
+    try:
+        return _run_async(_renew_drive_watch_channels_async())
+    except Exception as e:
+        logger.error("renew_drive_watch_channels_failed error=%s", str(e))
+        return {"error": str(e)}
+
+
+# ── Async Implementations ─────────────────────────────────────────────────
+
+
+async def _initial_drive_sync_async(user_id: int, tenant_id: str) -> dict:
+    """Async implementation of initial Drive sync."""
+    from app.core.database import AsyncSessionLocal
+    from app.services.google_token_service import GoogleTokenService, InvalidGrantError
+    from app.services.google_drive_sync_service import should_index_file, setup_watch_channel
+
+    async with AsyncSessionLocal() as db:
+        # Load sync state
+        sync_state = await db.execute(
+            text("""
+                SELECT id, indexing_mode, folder_selections, file_type_filter,
+                       max_file_size_bytes, auto_sync_enabled
+                FROM google_drive_sync_state
+                WHERE tenant_id = :tenant_id AND user_id = :user_id
+            """),
+            {"tenant_id": tenant_id, "user_id": user_id},
+        )
+        row = sync_state.fetchone()
+        if not row:
+            return {"error": "no_sync_state", "user_id": user_id}
+
+        sync_id = row[0]
+        indexing_mode = row[1]
+        folder_selections = row[2] or []
+        file_type_filter = row[3] or []
+        max_file_size_bytes = row[4] or 52428800
+        auto_sync_enabled = row[5]
+
+        if indexing_mode == "none":
+            return {"status": "skipped", "reason": "indexing_mode_none"}
+
+        # Get access token
+        token_svc = GoogleTokenService(db)
+        try:
+            access_token = await token_svc.get_valid_access_token(user_id)
+        except InvalidGrantError:
+            await db.execute(
+                text("""
+                    UPDATE google_drive_sync_state
+                    SET last_error = 'token_expired', auto_sync_enabled = false, updated_at = NOW()
+                    WHERE id = :id
+                """),
+                {"id": sync_id},
+            )
+            await db.commit()
+            return {"error": "token_expired"}
+
+        # Build Drive service
+        from google.oauth2.credentials import Credentials
+        from googleapiclient.discovery import build
+
+        creds = Credentials(token=access_token)
+        drive = build("drive", "v3", credentials=creds)
+
+        # Build sync settings dict for should_index_file
+        sync_settings = {
+            "indexing_mode": indexing_mode,
+            "file_type_filter": file_type_filter,
+            "folder_selections": folder_selections,
+            "max_file_size_bytes": max_file_size_bytes,
+        }
+
+        # List all files (paginated)
+        all_files = []
+        page_token = None
+
+        while True:
+            params = {
+                "q": "trashed = false",
+                "pageSize": 100,
+                "fields": "files(id,name,mimeType,size,modifiedTime,parents),nextPageToken",
+                "orderBy": "modifiedTime desc",
+            }
+            if page_token:
+                params["pageToken"] = page_token
+
+            result = drive.files().list(**params).execute()
+            files = result.get("files", [])
+            all_files.extend(files)
+            page_token = result.get("nextPageToken")
+            if not page_token:
+                break
+
+        # Filter files
+        matching_files = [f for f in all_files if should_index_file(f, sync_settings)]
+
+        # Update files_total
+        await db.execute(
+            text("""
+                UPDATE google_drive_sync_state
+                SET files_total = :total, files_processed = 0, last_error = NULL, updated_at = NOW()
+                WHERE id = :id
+            """),
+            {"total": len(matching_files), "id": sync_id},
+        )
+        await db.commit()
+
+        # Create virtual references for matching files
+        files_processed = 0
+        failed_files = []
+        proxy_token = getattr(settings, "SMARTSPEC_PROXY_TOKEN", "")
+        node_backend = getattr(settings, "WEB_BACKEND_URL", "http://localhost:3000")
+
+        for file_meta in matching_files:
+            try:
+                # Create virtual reference via internal API or direct DB insert
+                await _create_virtual_reference(db, tenant_id, user_id, file_meta)
+                files_processed += 1
+            except Exception as e:
+                failed_files.append(file_meta.get("id", "unknown"))
+                logger.warning("Failed to create reference for %s: %s", file_meta.get("id"), str(e))
+
+            # Update progress
+            if files_processed % 10 == 0:
+                await db.execute(
+                    text("UPDATE google_drive_sync_state SET files_processed = :n, updated_at = NOW() WHERE id = :id"),
+                    {"n": files_processed, "id": sync_id},
+                )
+                await db.commit()
+
+        # Final progress update
+        last_error = None
+        if failed_files:
+            last_error = f"{len(failed_files)} files failed: {failed_files[:5]}"
+
+        # Set up webhook channel if auto_sync_enabled
+        channel_info = {}
+        if auto_sync_enabled:
+            try:
+                channel_info = await setup_watch_channel(user_id, tenant_id, access_token)
+                token_hash = hashlib.sha256(channel_info["channel_token"].encode()).hexdigest()
+                await db.execute(
+                    text("""
+                        UPDATE google_drive_sync_state
+                        SET channel_id = :channel_id, resource_id = :resource_id,
+                            channel_token_hash = :token_hash, channel_expiry = :expiry,
+                            page_token = :page_token, updated_at = NOW()
+                        WHERE id = :id
+                    """),
+                    {
+                        "channel_id": channel_info["channel_id"],
+                        "resource_id": channel_info["resource_id"],
+                        "token_hash": token_hash,
+                        "expiry": channel_info["channel_expiry"],
+                        "page_token": channel_info["page_token"],
+                        "id": sync_id,
+                    },
+                )
+            except Exception as e:
+                logger.error("Failed to set up watch channel: %s", str(e))
+
+        # Finalize sync state
+        await db.execute(
+            text("""
+                UPDATE google_drive_sync_state
+                SET files_processed = :n, last_sync_at = NOW(), last_error = :error, updated_at = NOW()
+                WHERE id = :id
+            """),
+            {"n": files_processed, "error": last_error, "id": sync_id},
+        )
+        await db.commit()
+
+        logger.info(
+            "initial_drive_sync_completed user_id=%d files=%d/%d",
+            user_id, files_processed, len(matching_files),
+        )
+        return {
+            "status": "completed",
+            "files_total": len(matching_files),
+            "files_processed": files_processed,
+            "failed": len(failed_files),
+        }
+
+
+async def _create_virtual_reference(db, tenant_id: str, user_id: int, file_meta: dict):
+    """Create a library_items record for a Drive file (virtual reference)."""
+    drive_file_id = file_meta.get("id", "")
+    name = file_meta.get("name", "Untitled")
+    mime_type = file_meta.get("mimeType", "")
+    size = int(file_meta.get("size", 0) or 0)
+    modified_time = file_meta.get("modifiedTime")
+
+    # Check if already exists
+    existing = await db.execute(
+        text("""
+            SELECT id FROM library_items
+            WHERE tenant_id = :tenant_id AND metadata_json->>'driveFileId' = :drive_id
+            AND deleted_at IS NULL
+            LIMIT 1
+        """),
+        {"tenant_id": tenant_id, "drive_id": drive_file_id},
+    )
+    if existing.fetchone():
+        return  # Already exists
+
+    import json
+    metadata = json.dumps({
+        "driveFileId": drive_file_id,
+        "driveMimeType": mime_type,
+        "driveModifiedTime": modified_time,
+        "source": "google_drive",
+        "syncStatus": "pending",
+    })
+
+    # Determine item type from MIME
+    item_type = "document"
+    if "spreadsheet" in mime_type or "excel" in mime_type:
+        item_type = "spreadsheet"
+    elif "presentation" in mime_type or "powerpoint" in mime_type:
+        item_type = "presentation"
+    elif mime_type == "application/pdf":
+        item_type = "pdf"
+    elif mime_type.startswith("image/"):
+        item_type = "image"
+    elif mime_type.startswith("text/"):
+        item_type = "text"
+
+    await db.execute(
+        text("""
+            INSERT INTO library_items (tenant_id, owner_user_id, title, item_type, source,
+                                        metadata_json, status, created_at, updated_at)
+            VALUES (:tenant_id, :user_id, :title, :item_type, 'google_drive',
+                    :metadata::jsonb, 'pending', NOW(), NOW())
+        """),
+        {
+            "tenant_id": tenant_id,
+            "user_id": user_id,
+            "title": name,
+            "item_type": item_type,
+            "metadata": metadata,
+        },
+    )
+
+
+async def _process_drive_changes_async(user_id: int, tenant_id: str) -> dict:
+    """Async implementation of Drive change processing."""
+    from app.core.database import AsyncSessionLocal
+    from app.services.google_token_service import GoogleTokenService, InvalidGrantError
+    from app.services.google_drive_sync_service import should_index_file
+
+    async with AsyncSessionLocal() as db:
+        # Load sync state
+        sync_state = await db.execute(
+            text("""
+                SELECT id, page_token, indexing_mode, folder_selections,
+                       file_type_filter, max_file_size_bytes
+                FROM google_drive_sync_state
+                WHERE tenant_id = :tenant_id AND user_id = :user_id
+            """),
+            {"tenant_id": tenant_id, "user_id": user_id},
+        )
+        row = sync_state.fetchone()
+        if not row:
+            return {"error": "no_sync_state"}
+
+        sync_id = row[0]
+        page_token = row[1]
+        if not page_token:
+            return {"error": "no_page_token"}
+
+        sync_settings = {
+            "indexing_mode": row[2],
+            "file_type_filter": row[4] or [],
+            "folder_selections": row[3] or [],
+            "max_file_size_bytes": row[5] or 52428800,
+        }
+
+        # Get access token
+        token_svc = GoogleTokenService(db)
+        try:
+            access_token = await token_svc.get_valid_access_token(user_id)
+        except InvalidGrantError:
+            await db.execute(
+                text("""
+                    UPDATE google_drive_sync_state
+                    SET last_error = 'token_expired', auto_sync_enabled = false, updated_at = NOW()
+                    WHERE id = :id
+                """),
+                {"id": sync_id},
+            )
+            await db.commit()
+            return {"error": "token_expired"}
+
+        from google.oauth2.credentials import Credentials
+        from googleapiclient.discovery import build
+
+        creds = Credentials(token=access_token)
+        drive = build("drive", "v3", credentials=creds)
+
+        changes_processed = 0
+        new_page_token = page_token
+
+        while True:
+            result = drive.changes().list(
+                pageToken=new_page_token,
+                fields="changes(fileId,removed,file(id,name,mimeType,size,modifiedTime,parents)),newStartPageToken,nextPageToken",
+                pageSize=100,
+            ).execute()
+
+            changes = result.get("changes", [])
+
+            for change in changes:
+                file_id = change.get("fileId")
+                removed = change.get("removed", False)
+
+                if removed:
+                    # Mark virtual reference as deleted
+                    await db.execute(
+                        text("""
+                            UPDATE library_items
+                            SET deleted_at = NOW(), status = 'deleted', updated_at = NOW()
+                            WHERE tenant_id = :tenant_id
+                              AND metadata_json->>'driveFileId' = :file_id
+                              AND deleted_at IS NULL
+                        """),
+                        {"tenant_id": tenant_id, "file_id": file_id},
+                    )
+                    changes_processed += 1
+                    continue
+
+                file_meta = change.get("file")
+                if file_meta and should_index_file(file_meta, sync_settings):
+                    await _create_virtual_reference(db, tenant_id, user_id, file_meta)
+                    changes_processed += 1
+
+            # Update page token
+            if result.get("newStartPageToken"):
+                new_page_token = result["newStartPageToken"]
+                break
+            elif result.get("nextPageToken"):
+                new_page_token = result["nextPageToken"]
+            else:
+                break
+
+        # Save new page token and last_sync_at
+        await db.execute(
+            text("""
+                UPDATE google_drive_sync_state
+                SET page_token = :token, last_sync_at = NOW(), updated_at = NOW()
+                WHERE id = :id
+            """),
+            {"token": new_page_token, "id": sync_id},
+        )
+        await db.commit()
+
+        logger.info(
+            "process_drive_changes_completed user_id=%d changes=%d",
+            user_id, changes_processed,
+        )
+        return {"status": "completed", "changes_processed": changes_processed}
+
+
+async def _renew_drive_watch_channels_async() -> dict:
+    """Async implementation of channel renewal."""
+    from app.core.database import AsyncSessionLocal
+    from app.services.google_token_service import GoogleTokenService, InvalidGrantError
+    from app.services.google_drive_sync_service import setup_watch_channel
+
+    renewed = 0
+    failed = 0
+
+    async with AsyncSessionLocal() as db:
+        # Find channels expiring within 24 hours
+        rows = await db.execute(
+            text("""
+                SELECT id, user_id, tenant_id, channel_id, resource_id
+                FROM google_drive_sync_state
+                WHERE auto_sync_enabled = true
+                  AND channel_id IS NOT NULL
+                  AND channel_expiry IS NOT NULL
+                  AND channel_expiry < NOW() + INTERVAL '24 hours'
+            """)
+        )
+        expiring = rows.fetchall()
+
+        for row in expiring:
+            sync_id, uid, tid, old_channel_id, old_resource_id = row
+
+            try:
+                token_svc = GoogleTokenService(db)
+                access_token = await token_svc.get_valid_access_token(uid)
+
+                # Stop old channel
+                from google.oauth2.credentials import Credentials
+                from googleapiclient.discovery import build
+
+                creds = Credentials(token=access_token)
+                drive = build("drive", "v3", credentials=creds)
+
+                try:
+                    drive.channels().stop(body={
+                        "id": old_channel_id,
+                        "resourceId": old_resource_id,
+                    }).execute()
+                except Exception:
+                    pass  # Old channel may already be expired
+
+                # Create new channel
+                channel_info = await setup_watch_channel(uid, tid, access_token)
+                token_hash = hashlib.sha256(channel_info["channel_token"].encode()).hexdigest()
+
+                await db.execute(
+                    text("""
+                        UPDATE google_drive_sync_state
+                        SET channel_id = :channel_id, resource_id = :resource_id,
+                            channel_token_hash = :token_hash, channel_expiry = :expiry,
+                            page_token = :page_token, updated_at = NOW()
+                        WHERE id = :id
+                    """),
+                    {
+                        "channel_id": channel_info["channel_id"],
+                        "resource_id": channel_info["resource_id"],
+                        "token_hash": token_hash,
+                        "expiry": channel_info["channel_expiry"],
+                        "page_token": channel_info["page_token"],
+                        "id": sync_id,
+                    },
+                )
+                await db.commit()
+                renewed += 1
+
+            except InvalidGrantError:
+                # Token expired -- disable auto-sync
+                await db.execute(
+                    text("""
+                        UPDATE google_drive_sync_state
+                        SET auto_sync_enabled = false, last_error = 'token_expired', updated_at = NOW()
+                        WHERE id = :id
+                    """),
+                    {"id": sync_id},
+                )
+                await db.execute(
+                    text("""
+                        UPDATE oauth_connections
+                        SET status = 'expired', updated_at = NOW()
+                        WHERE user_id = :uid AND provider = 'google'
+                    """),
+                    {"uid": uid},
+                )
+                await db.commit()
+                failed += 1
+                logger.warning("Channel renewal failed for user %d: token expired", uid)
+
+            except Exception as e:
+                failed += 1
+                logger.error("Channel renewal failed for user %d: %s", uid, str(e))
+
+    logger.info("renew_drive_watch_channels_completed renewed=%d failed=%d", renewed, failed)
+    return {"renewed": renewed, "failed": failed}
+
+
+async def _estimate_sync_cost_impl(user_id: int, tenant_id: str) -> dict:
+    """Count matching files and return estimated credit cost."""
+    from app.core.database import AsyncSessionLocal
+    from app.services.google_token_service import GoogleTokenService, InvalidGrantError
+    from app.services.google_drive_sync_service import should_index_file
+
+    async with AsyncSessionLocal() as db:
+        sync_state = await db.execute(
+            text("""
+                SELECT indexing_mode, folder_selections, file_type_filter, max_file_size_bytes
+                FROM google_drive_sync_state
+                WHERE tenant_id = :tenant_id AND user_id = :user_id
+            """),
+            {"tenant_id": tenant_id, "user_id": user_id},
+        )
+        row = sync_state.fetchone()
+        if not row:
+            return {"file_count": 0, "estimated_credits": 0, "estimated_size_mb": 0}
+
+        sync_settings = {
+            "indexing_mode": row[0],
+            "file_type_filter": row[2] or [],
+            "folder_selections": row[1] or [],
+            "max_file_size_bytes": row[3] or 52428800,
+        }
+
+        if sync_settings["indexing_mode"] == "none":
+            return {"file_count": 0, "estimated_credits": 0, "estimated_size_mb": 0}
+
+        token_svc = GoogleTokenService(db)
+        access_token = await token_svc.get_valid_access_token(user_id)
+
+        from google.oauth2.credentials import Credentials
+        from googleapiclient.discovery import build
+
+        creds = Credentials(token=access_token)
+        drive = build("drive", "v3", credentials=creds)
+
+        all_files = []
+        page_token = None
+        total_size = 0
+
+        while True:
+            params = {
+                "q": "trashed = false",
+                "pageSize": 100,
+                "fields": "files(id,name,mimeType,size,modifiedTime,parents),nextPageToken",
+            }
+            if page_token:
+                params["pageToken"] = page_token
+            result = drive.files().list(**params).execute()
+            files = result.get("files", [])
+            for f in files:
+                if should_index_file(f, sync_settings):
+                    all_files.append(f)
+                    total_size += int(f.get("size", 0) or 0)
+            page_token = result.get("nextPageToken")
+            if not page_token:
+                break
+
+        # Estimate: ~2 credits per chunk, ~1 chunk per 1000 chars, ~5 chars/byte
+        estimated_chars = total_size * 5
+        estimated_chunks = max(1, estimated_chars // 1000) if all_files else 0
+        estimated_credits = estimated_chunks * 2
+
+        return {
+            "file_count": len(all_files),
+            "estimated_credits": estimated_credits,
+            "estimated_size_mb": round(total_size / (1024 * 1024), 1),
+        }
diff --git a/python-backend/tests/test_google_drive_sync.py b/python-backend/tests/test_google_drive_sync.py
new file mode 100644
index 0000000..353822e
--- /dev/null
+++ b/python-backend/tests/test_google_drive_sync.py
@@ -0,0 +1,199 @@
+"""Tests for Google Drive sync: should_index_file, initial sync, channel renewal."""
+
+import hashlib
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch
+
+from app.services.google_drive_sync_service import (
+    should_index_file,
+    setup_watch_channel,
+    FILE_TYPE_MIMES,
+    GOOGLE_FOLDER_MIME,
+)
+
+
+# ── should_index_file Tests ───────────────────────────────────────────────
+
+
+@pytest.mark.unit
+class TestShouldIndexFile:
+    def test_mode_none_returns_false(self):
+        """indexing_mode='none' rejects all files."""
+        settings = {"indexing_mode": "none", "file_type_filter": [], "max_file_size_bytes": None, "folder_selections": []}
+        file_meta = {"mimeType": "application/pdf", "size": "1000", "parents": ["root"]}
+        assert should_index_file(file_meta, settings) is False
+
+    def test_mode_all_returns_true(self):
+        """indexing_mode='all' accepts files within size guard and matching type."""
+        settings = {"indexing_mode": "all", "file_type_filter": [], "max_file_size_bytes": None, "folder_selections": []}
+        file_meta = {"mimeType": "application/pdf", "size": "1000", "parents": ["root"]}
+        assert should_index_file(file_meta, settings) is True
+
+    def test_mode_selected_folders_includes_correct(self):
+        """selected_folders mode accepts files in selected folder."""
+        settings = {
+            "indexing_mode": "selected_folders",
+            "file_type_filter": [],
+            "max_file_size_bytes": None,
+            "folder_selections": [{"folderId": "folder_a"}],
+        }
+        file_in = {"mimeType": "application/pdf", "size": "1000", "parents": ["folder_a"]}
+        file_out = {"mimeType": "application/pdf", "size": "1000", "parents": ["folder_b"]}
+        assert should_index_file(file_in, settings) is True
+        assert should_index_file(file_out, settings) is False
+
+    def test_mode_all_except_excludes_correct(self):
+        """all_except mode excludes files in excluded folders."""
+        settings = {
+            "indexing_mode": "all_except",
+            "file_type_filter": [],
+            "max_file_size_bytes": None,
+            "folder_selections": [{"folderId": "excluded_folder"}],
+        }
+        file_excluded = {"mimeType": "application/pdf", "size": "1000", "parents": ["excluded_folder"]}
+        file_included = {"mimeType": "application/pdf", "size": "1000", "parents": ["other_folder"]}
+        assert should_index_file(file_excluded, settings) is False
+        assert should_index_file(file_included, settings) is True
+
+    def test_respects_file_type_filter(self):
+        """Only files matching file_type_filter pass."""
+        settings = {
+            "indexing_mode": "all",
+            "file_type_filter": ["document", "spreadsheet"],
+            "max_file_size_bytes": None,
+            "folder_selections": [],
+        }
+        doc = {"mimeType": "application/vnd.google-apps.document", "size": "1000", "parents": []}
+        pdf = {"mimeType": "application/pdf", "size": "1000", "parents": []}
+        assert should_index_file(doc, settings) is True
+        assert should_index_file(pdf, settings) is False  # pdf not in filter
+
+    def test_rejects_over_size_guard(self):
+        """Files exceeding max_file_size_bytes are rejected."""
+        settings = {
+            "indexing_mode": "all",
+            "file_type_filter": [],
+            "max_file_size_bytes": 50_000_000,
+            "folder_selections": [],
+        }
+        small = {"mimeType": "application/pdf", "size": "1000", "parents": []}
+        large = {"mimeType": "application/pdf", "size": "100000000", "parents": []}
+        assert should_index_file(small, settings) is True
+        assert should_index_file(large, settings) is False
+
+    def test_skips_google_native_folders(self):
+        """Google Drive folders are never indexed."""
+        settings = {"indexing_mode": "all", "file_type_filter": [], "max_file_size_bytes": None, "folder_selections": []}
+        folder = {"mimeType": GOOGLE_FOLDER_MIME, "size": "0", "parents": []}
+        assert should_index_file(folder, settings) is False
+
+    def test_image_type_filter_matches_prefix(self):
+        """Image type filter matches mime types starting with 'image/'."""
+        settings = {
+            "indexing_mode": "all",
+            "file_type_filter": ["image"],
+            "max_file_size_bytes": None,
+            "folder_selections": [],
+        }
+        img = {"mimeType": "image/png", "size": "1000", "parents": []}
+        doc = {"mimeType": "application/pdf", "size": "1000", "parents": []}
+        assert should_index_file(img, settings) is True
+        assert should_index_file(doc, settings) is False
+
+
+# ── setup_watch_channel Tests ──────────────────────────────────────────────
+
+
+@pytest.mark.unit
+class TestSetupWatchChannel:
+    @pytest.mark.asyncio
+    async def test_returns_channel_info(self):
+        """setup_watch_channel returns channel_id, resource_id, channel_token, page_token."""
+        mock_drive = MagicMock()
+
+        # Mock getStartPageToken
+        mock_drive.changes.return_value.getStartPageToken.return_value.execute.return_value = {
+            "startPageToken": "token_123",
+        }
+
+        # Mock watch
+        mock_drive.changes.return_value.watch.return_value.execute.return_value = {
+            "resourceId": "resource_abc",
+        }
+
+        with patch("googleapiclient.discovery.build", return_value=mock_drive):
+            result = await setup_watch_channel(1, "tenant_1", "fake_access_token")
+
+        assert "channel_id" in result
+        assert result["channel_id"].startswith("ssp-tenant_1-1-")
+        assert result["resource_id"] == "resource_abc"
+        assert len(result["channel_token"]) == 64  # secrets.token_hex(32)
+        assert result["page_token"] == "token_123"
+
+    @pytest.mark.asyncio
+    async def test_generates_unique_tokens(self):
+        """Each call generates a new unique channel_token."""
+        mock_drive = MagicMock()
+        mock_drive.changes.return_value.getStartPageToken.return_value.execute.return_value = {
+            "startPageToken": "token_123",
+        }
+        mock_drive.changes.return_value.watch.return_value.execute.return_value = {
+            "resourceId": "resource_abc",
+        }
+
+        with patch("googleapiclient.discovery.build", return_value=mock_drive):
+            result1 = await setup_watch_channel(1, "t1", "token_a")
+            result2 = await setup_watch_channel(1, "t1", "token_b")
+
+        assert result1["channel_token"] != result2["channel_token"]
+        assert result1["channel_id"] != result2["channel_id"]
+
+
+# ── Celery Task Registration Tests ────────────────────────────────────────
+
+
+@pytest.mark.unit
+class TestTaskRegistration:
+    def test_initial_drive_sync_is_registered(self):
+        """initial_drive_sync task is registered in Celery."""
+        import app.tasks.google_drive_tasks  # noqa: F401 -- triggers task registration
+        from app.core.celery_app import celery_app
+        assert "initial_drive_sync" in celery_app.tasks
+
+    def test_process_drive_changes_is_registered(self):
+        """process_drive_changes task is registered in Celery."""
+        import app.tasks.google_drive_tasks  # noqa: F401
+        from app.core.celery_app import celery_app
+        assert "process_drive_changes" in celery_app.tasks
+
+    def test_renew_drive_watch_channels_is_registered(self):
+        """renew_drive_watch_channels task is registered in Celery."""
+        import app.tasks.google_drive_tasks  # noqa: F401
+        from app.core.celery_app import celery_app
+        assert "renew_drive_watch_channels" in celery_app.tasks
+
+
+# ── Channel Token Hash Tests ──────────────────────────────────────────────
+
+
+@pytest.mark.unit
+class TestChannelTokenHash:
+    def test_token_hash_matches(self):
+        """Verifying that SHA-256 hash of token matches stored hash."""
+        import secrets
+        token = secrets.token_hex(32)
+        token_hash = hashlib.sha256(token.encode()).hexdigest()
+        assert len(token) == 64
+        assert len(token_hash) == 64
+        # Verify match
+        received_hash = hashlib.sha256(token.encode()).hexdigest()
+        assert received_hash == token_hash
+
+    def test_different_tokens_different_hashes(self):
+        """Different tokens produce different hashes."""
+        import secrets
+        t1 = secrets.token_hex(32)
+        t2 = secrets.token_hex(32)
+        h1 = hashlib.sha256(t1.encode()).hexdigest()
+        h2 = hashlib.sha256(t2.encode()).hexdigest()
+        assert h1 != h2
