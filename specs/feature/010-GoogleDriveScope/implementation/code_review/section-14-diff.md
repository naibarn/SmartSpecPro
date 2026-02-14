diff --git a/apps/web/client/src/components/settings/DisconnectGoogleDialog.tsx b/apps/web/client/src/components/settings/DisconnectGoogleDialog.tsx
new file mode 100644
index 0000000..0245bc2
--- /dev/null
+++ b/apps/web/client/src/components/settings/DisconnectGoogleDialog.tsx
@@ -0,0 +1,69 @@
+/**
+ * Confirmation dialog shown before disconnecting Google Drive.
+ * Warns user that indexed content will be removed but Drive files are unaffected.
+ */
+
+import {
+  AlertDialog,
+  AlertDialogAction,
+  AlertDialogCancel,
+  AlertDialogContent,
+  AlertDialogDescription,
+  AlertDialogFooter,
+  AlertDialogHeader,
+  AlertDialogTitle,
+} from "@/components/ui/alert-dialog";
+import { Loader2 } from "lucide-react";
+
+interface DisconnectGoogleDialogProps {
+  open: boolean;
+  onOpenChange: (open: boolean) => void;
+  onConfirm: () => void;
+  isLoading: boolean;
+}
+
+export function DisconnectGoogleDialog({
+  open,
+  onOpenChange,
+  onConfirm,
+  isLoading,
+}: DisconnectGoogleDialogProps) {
+  return (
+    <AlertDialog open={open} onOpenChange={onOpenChange}>
+      <AlertDialogContent>
+        <AlertDialogHeader>
+          <AlertDialogTitle>Disconnect Google Drive</AlertDialogTitle>
+          <AlertDialogDescription className="space-y-2">
+            <span className="block">
+              Disconnecting will remove all indexed Google Drive content from
+              search.
+            </span>
+            <span className="block font-medium">
+              Your files in Google Drive are not affected.
+            </span>
+            <span className="block text-destructive">
+              This action cannot be undone.
+            </span>
+          </AlertDialogDescription>
+        </AlertDialogHeader>
+        <AlertDialogFooter>
+          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
+          <AlertDialogAction
+            onClick={onConfirm}
+            disabled={isLoading}
+            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
+          >
+            {isLoading ? (
+              <>
+                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
+                Disconnecting...
+              </>
+            ) : (
+              "Disconnect"
+            )}
+          </AlertDialogAction>
+        </AlertDialogFooter>
+      </AlertDialogContent>
+    </AlertDialog>
+  );
+}
diff --git a/apps/web/client/src/components/settings/GoogleDrivePanel.tsx b/apps/web/client/src/components/settings/GoogleDrivePanel.tsx
index b9b635a..5f22bb3 100644
--- a/apps/web/client/src/components/settings/GoogleDrivePanel.tsx
+++ b/apps/web/client/src/components/settings/GoogleDrivePanel.tsx
@@ -32,6 +32,7 @@ import {
   Download,
 } from "lucide-react";
 import { FolderPicker } from "./FolderPicker";
+import { DisconnectGoogleDialog } from "./DisconnectGoogleDialog";
 
 // ── Helpers ──────────────────────────────────────────────
 
@@ -673,6 +674,7 @@ export function GoogleDrivePanel() {
   const [isConnecting, setIsConnecting] = useState(false);
   const [activeTab, setActiveTab] = useState("overview");
   const [folderPickerOpen, setFolderPickerOpen] = useState(false);
+  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
   const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
 
   useEffect(() => {
@@ -688,7 +690,8 @@ export function GoogleDrivePanel() {
   });
   const disconnectMutation = trpc.googleDrive.disconnect.useMutation({
     onSuccess: () => {
-      toast.success("Google Drive disconnected");
+      setDisconnectDialogOpen(false);
+      toast.success("Google Drive disconnected. Cleanup is in progress.");
       statusQuery.refetch();
     },
     onError: (err) => toast.error(`Disconnect failed: ${err.message}`),
@@ -804,7 +807,7 @@ export function GoogleDrivePanel() {
           <TabsContent value="overview">
             <OverviewPanel
               connectionStatus={{ email, scopes, connectedAt }}
-              onDisconnect={() => disconnectMutation.mutate()}
+              onDisconnect={() => setDisconnectDialogOpen(true)}
               onSetTab={setActiveTab}
               onManageFolders={() => setFolderPickerOpen(true)}
             />
@@ -836,6 +839,14 @@ export function GoogleDrivePanel() {
         }
         onConfirm={handleFolderConfirm}
       />
+
+      {/* Disconnect Confirmation Dialog */}
+      <DisconnectGoogleDialog
+        open={disconnectDialogOpen}
+        onOpenChange={setDisconnectDialogOpen}
+        onConfirm={() => disconnectMutation.mutate()}
+        isLoading={disconnectMutation.isPending}
+      />
     </div>
   );
 }
diff --git a/apps/web/server/_core/index.ts b/apps/web/server/_core/index.ts
index 03791a5..80e5911 100644
--- a/apps/web/server/_core/index.ts
+++ b/apps/web/server/_core/index.ts
@@ -303,6 +303,60 @@ app.post("/api/internal/credits/charge", async (req, res) => {
   }
 });
 
+// Internal Google Drive cleanup endpoint (Python backend -> Node.js)
+app.post("/api/internal/google-drive/cleanup", async (req, res) => {
+  const authHeader = req.headers.authorization || "";
+  if (!authHeader.startsWith("Bearer ") || !ENV.webGatewayToken) {
+    return res.status(401).json({ success: false, error: "Unauthorized" });
+  }
+  const token = authHeader.slice(7);
+  if (token !== ENV.webGatewayToken) {
+    return res.status(401).json({ success: false, error: "Unauthorized" });
+  }
+
+  try {
+    const { userId, tenantId } = req.body;
+    if (typeof userId !== "number" || !Number.isFinite(userId) || userId <= 0) {
+      return res.status(400).json({ success: false, error: "userId must be a positive number" });
+    }
+    if (typeof tenantId !== "string" || !tenantId) {
+      return res.status(400).json({ success: false, error: "tenantId is required" });
+    }
+
+    const { removeGoogleDriveData } = await import("../services/libraryService");
+    const { googleDriveEditSessions, googleDriveSyncState } = await import("../../drizzle/schema");
+    const { eq, and } = await import("drizzle-orm");
+    const db = await getDb();
+    if (!db) {
+      return res.status(500).json({ success: false, error: "Database not available" });
+    }
+
+    // Delete edit sessions for this user
+    await db.delete(googleDriveEditSessions).where(eq(googleDriveEditSessions.userId, userId));
+
+    // Delete sync state for this user + tenant
+    await db.delete(googleDriveSyncState).where(
+      and(
+        eq(googleDriveSyncState.userId, userId),
+        eq(googleDriveSyncState.tenantId, tenantId),
+      ),
+    );
+
+    // Remove library items + cascaded chunks/links
+    const result = await removeGoogleDriveData(userId, tenantId);
+
+    return res.json({
+      status: "ok",
+      itemsDeleted: result.itemsDeleted,
+      chunksDeleted: result.chunksDeleted,
+      linksDeleted: result.linksDeleted,
+    });
+  } catch (err: any) {
+    debugError("GDriveCleanup", "Internal cleanup failed", err);
+    return res.status(500).json({ success: false, error: err.message });
+  }
+});
+
 // Device auth routes (for desktop app)
 registerDeviceAuthRoutes(app);
 
diff --git a/apps/web/server/routers/googleDrive.ts b/apps/web/server/routers/googleDrive.ts
index 3eff532..9be5b22 100644
--- a/apps/web/server/routers/googleDrive.ts
+++ b/apps/web/server/routers/googleDrive.ts
@@ -129,21 +129,38 @@ export const googleDriveRouter = router({
 
   /**
    * Disconnect Google Drive for the current user.
+   * Enqueues a background Celery task for full cleanup (Drive API + local data).
    */
   disconnect: protectedProcedure.mutation(async ({ ctx }) => {
-    const token = createDriveToken(ctx.user.id);
+    if (!ctx.tenantId) {
+      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tenant context required" });
+    }
+
+    const proxyToken = process.env.SMARTSPEC_PROXY_TOKEN || "";
     const resp = await fetch(
-      `${PYTHON_BACKEND_URL}/api/oauth/google/drive/disconnect`,
+      `${PYTHON_BACKEND_URL}/api/internal/gdrive/disconnect`,
       {
-        method: "DELETE",
-        headers: { Authorization: `Bearer ${token}` },
+        method: "POST",
+        headers: {
+          "Content-Type": "application/json",
+          "x-proxy-token": proxyToken,
+        },
+        body: JSON.stringify({
+          user_id: ctx.user.id,
+          tenant_id: ctx.tenantId,
+        }),
       },
     );
+
     if (!resp.ok) {
       const err = await resp.json().catch(() => ({}));
-      throw new Error(err.detail || "Disconnect failed");
+      throw new TRPCError({
+        code: "INTERNAL_SERVER_ERROR",
+        message: (err as any).detail || "Failed to start disconnect cleanup",
+      });
     }
-    return resp.json() as Promise<{ success: boolean }>;
+
+    return resp.json() as Promise<{ status: string; task_id: string }>;
   }),
 
   /**
diff --git a/apps/web/server/services/libraryService.ts b/apps/web/server/services/libraryService.ts
index c5391e3..bb9d974 100644
--- a/apps/web/server/services/libraryService.ts
+++ b/apps/web/server/services/libraryService.ts
@@ -2534,3 +2534,55 @@ export async function permanentDeleteLibraryItem(
 
   return { daysInTrash };
 }
+
+/**
+ * Remove all Google Drive virtual references and associated data for a user.
+ * Called during disconnect cleanup. Cascading FK deletes handle chunks and links.
+ */
+export async function removeGoogleDriveData(
+  userId: number,
+  tenantId: string,
+): Promise<{ itemsDeleted: number; chunksDeleted: number; linksDeleted: number }> {
+  const db = await getDb();
+  if (!db) throw new Error("Database not available");
+
+  // Find all Google Drive items for this user
+  const driveItems = await db
+    .select({ id: libraryItems.id })
+    .from(libraryItems)
+    .where(
+      and(
+        eq(libraryItems.source, "google_drive"),
+        eq(libraryItems.ownerUserId, userId),
+        eq(libraryItems.tenantId, tenantId),
+      ),
+    );
+
+  const itemIds = driveItems.map((i) => i.id);
+  if (itemIds.length === 0) {
+    return { itemsDeleted: 0, chunksDeleted: 0, linksDeleted: 0 };
+  }
+
+  // Count chunks and links before cascade delete (for audit)
+  const [chunkRow] = await db
+    .select({ cnt: count(libraryChunks.id) })
+    .from(libraryChunks)
+    .where(inArray(libraryChunks.libraryItemId, itemIds));
+
+  const [linkRow] = await db
+    .select({ cnt: count(libraryLinks.id) })
+    .from(libraryLinks)
+    .where(inArray(libraryLinks.libraryItemId, itemIds));
+
+  const chunksDeleted = chunkRow?.cnt ?? 0;
+  const linksDeleted = linkRow?.cnt ?? 0;
+
+  // Delete items in batches (cascades to chunks and links via FK)
+  const BATCH_SIZE = 500;
+  for (let i = 0; i < itemIds.length; i += BATCH_SIZE) {
+    const batch = itemIds.slice(i, i + BATCH_SIZE);
+    await db.delete(libraryItems).where(inArray(libraryItems.id, batch));
+  }
+
+  return { itemsDeleted: itemIds.length, chunksDeleted, linksDeleted };
+}
diff --git a/python-backend/app/api/internal_gdrive.py b/python-backend/app/api/internal_gdrive.py
index 526a044..c0f6d60 100644
--- a/python-backend/app/api/internal_gdrive.py
+++ b/python-backend/app/api/internal_gdrive.py
@@ -4,6 +4,7 @@ Exposes endpoints for the Node.js backend to trigger sync operations:
   POST /api/internal/gdrive/start-sync        -- enqueue initial sync
   POST /api/internal/gdrive/process-changes   -- enqueue change processing
   POST /api/internal/gdrive/estimate-cost     -- count matching files
+  POST /api/internal/gdrive/disconnect        -- enqueue disconnect cleanup
 """
 
 import logging
@@ -52,6 +53,11 @@ class EstimateCostRequest(BaseModel):
     tenant_id: str
 
 
+class DisconnectRequest(BaseModel):
+    user_id: int
+    tenant_id: str
+
+
 # ── Endpoints ───────────────────────────────────────────────────────────────
 
 
@@ -107,3 +113,21 @@ async def estimate_sync_cost(
     except Exception as e:
         logger.error("estimate_cost_failed user_id=%d error=%s", request.user_id, str(e))
         raise HTTPException(status_code=500, detail=str(e))
+
+
+@router.post("/disconnect")
+async def disconnect_drive(
+    request: DisconnectRequest,
+    x_proxy_token: Optional[str] = Header(None),
+):
+    """Enqueue disconnect_google_drive_cleanup Celery task."""
+    await _verify_proxy_token(x_proxy_token)
+
+    from app.tasks.google_drive_tasks import disconnect_google_drive_cleanup
+
+    result = disconnect_google_drive_cleanup.delay(request.user_id, request.tenant_id)
+    logger.info(
+        "disconnect_google_drive_cleanup enqueued user_id=%d tenant_id=%s task_id=%s",
+        request.user_id, request.tenant_id, result.id,
+    )
+    return {"status": "cleanup_started", "task_id": result.id}
diff --git a/python-backend/app/core/celery_app.py b/python-backend/app/core/celery_app.py
index 14ef315..c40ccf0 100644
--- a/python-backend/app/core/celery_app.py
+++ b/python-backend/app/core/celery_app.py
@@ -61,6 +61,7 @@ celery_app.conf.update(
         "app.tasks.google_drive_tasks.initial_drive_sync": {"queue": "media"},
         "app.tasks.google_drive_tasks.process_drive_changes": {"queue": "media"},
         "app.tasks.google_drive_tasks.renew_drive_watch_channels": {"queue": "media"},
+        "disconnect_google_drive_cleanup": {"queue": "media"},
         # Workflow tasks -> celery queue (lightweight, frequent)
         "app.tasks.workflow_tasks.check_scheduled_workflows": {"queue": "celery"},
         "app.tasks.workflow_tasks.process_system_event": {"queue": "celery"},
diff --git a/python-backend/app/services/google_token_service.py b/python-backend/app/services/google_token_service.py
index 7b1081b..e08f5ad 100644
--- a/python-backend/app/services/google_token_service.py
+++ b/python-backend/app/services/google_token_service.py
@@ -267,6 +267,41 @@ class GoogleTokenService:
             return pid
         return None
 
+    async def revoke_token(self, user_id: int) -> bool:
+        """
+        Revoke the user's Google OAuth token and update connection status.
+
+        Best-effort: updates status to 'revoked' regardless of Google's response.
+        Returns True if Google accepted the revocation, False otherwise.
+        """
+        conn = await self._get_connection(user_id)
+        if not conn:
+            return False
+
+        access_token = conn.access_token
+        revoked_at_google = False
+
+        if access_token:
+            try:
+                async with httpx.AsyncClient(timeout=10.0) as client:
+                    resp = await client.post(
+                        "https://oauth2.googleapis.com/revoke",
+                        data={"token": access_token},
+                        headers={"Content-Type": "application/x-www-form-urlencoded"},
+                    )
+                revoked_at_google = resp.status_code == 200
+                if not revoked_at_google:
+                    logger.warning(
+                        "Token revocation returned %d for user %d",
+                        resp.status_code, user_id,
+                    )
+            except Exception as e:
+                logger.warning("Token revocation request failed for user %d: %s", user_id, str(e))
+
+        conn.status = "revoked"
+        await self.db.commit()
+        return revoked_at_google
+
     async def disconnect(self, user_id: int) -> bool:
         """Remove the Google Drive connection (simple version)."""
         conn = await self._get_connection(user_id)
diff --git a/python-backend/app/tasks/google_drive_tasks.py b/python-backend/app/tasks/google_drive_tasks.py
index e7c6aa7..8593de4 100644
--- a/python-backend/app/tasks/google_drive_tasks.py
+++ b/python-backend/app/tasks/google_drive_tasks.py
@@ -1259,3 +1259,213 @@ async def _try_reestablish_webhook(user_id: int, tenant_id: str):
         logger.warning("webhook_reestablish_token_expired user_id=%d", user_id)
     except Exception as e:
         logger.warning("webhook_reestablish_failed user_id=%d error=%s", user_id, str(e))
+
+
+# ── Disconnect & Cleanup ────────────────────────────────────────────────────
+
+
+@celery_app.task(
+    name="disconnect_google_drive_cleanup",
+    bind=True,
+    max_retries=2,
+    default_retry_delay=30,
+)
+def disconnect_google_drive_cleanup(self, user_id: int, tenant_id: str):
+    """Complete cleanup when user disconnects Google Drive.
+
+    Phase 1: Google API operations (require valid token)
+      - Delete temp Drive files from active edit sessions
+      - Stop webhook channel
+      - Revoke access token
+
+    Phase 2: Local data cleanup (via Node.js internal endpoint)
+      - Delete edit sessions, sync state, library items (cascades chunks + links)
+      - Delete oauth_connection record
+    """
+    logger.info("disconnect_cleanup_started user_id=%d tenant_id=%s", user_id, tenant_id)
+    try:
+        result = _run_async(_disconnect_cleanup_async(user_id, tenant_id))
+        logger.info("disconnect_cleanup_completed user_id=%d result=%s", user_id, result)
+        return result
+    except Exception as e:
+        logger.error("disconnect_cleanup_failed user_id=%d error=%s", user_id, str(e))
+        try:
+            self.retry(exc=e)
+        except self.MaxRetriesExceededError:
+            logger.error("disconnect_cleanup_max_retries user_id=%d", user_id)
+            return {"error": str(e), "phase": "unknown"}
+
+
+async def _disconnect_cleanup_async(user_id: int, tenant_id: str) -> dict:
+    """Async implementation of the disconnect cleanup flow."""
+    from app.core.database import AsyncSessionLocal
+    from app.services.google_token_service import GoogleTokenService, InvalidGrantError
+
+    result = {
+        "temp_files_deleted": 0,
+        "webhook_stopped": False,
+        "token_revoked": False,
+        "local_cleanup": False,
+        "oauth_deleted": False,
+    }
+
+    # ── Phase 1: Google API operations (require valid token) ──
+
+    access_token = None
+    try:
+        async with AsyncSessionLocal() as db:
+            token_svc = GoogleTokenService(db)
+            access_token = await token_svc.get_valid_access_token(user_id)
+    except (ValueError, InvalidGrantError) as e:
+        logger.warning(
+            "disconnect_no_valid_token user_id=%d error=%s (skipping Phase 1 Drive API ops)",
+            user_id, str(e),
+        )
+
+    if access_token:
+        # Step 1: Delete temp Drive files from active edit sessions
+        result["temp_files_deleted"] = await _delete_temp_drive_files(user_id, access_token)
+
+        # Step 2: Stop webhook channel
+        result["webhook_stopped"] = await _stop_webhook_channel(user_id, tenant_id, access_token)
+
+    # Step 3: Revoke access token
+    try:
+        async with AsyncSessionLocal() as db:
+            token_svc = GoogleTokenService(db)
+            result["token_revoked"] = await token_svc.revoke_token(user_id)
+    except Exception as e:
+        logger.warning("disconnect_revoke_failed user_id=%d error=%s", user_id, str(e))
+
+    # ── Phase 2: Local data cleanup ──
+
+    # Check if user reconnected during cleanup (new active connection)
+    async with AsyncSessionLocal() as db:
+        check = await db.execute(
+            text("""
+                SELECT status FROM oauth_connections
+                WHERE user_id = :user_id AND provider = 'google' AND status = 'active'
+            """),
+            {"user_id": user_id},
+        )
+        if check.fetchone():
+            logger.warning("disconnect_aborted_reconnected user_id=%d", user_id)
+            return {**result, "aborted": True, "reason": "user_reconnected"}
+
+    # Step 4-9: Call Node.js internal endpoint for DB cleanup
+    result["local_cleanup"] = await _call_node_cleanup(user_id, tenant_id)
+
+    # Step 10: Delete oauth_connection
+    try:
+        async with AsyncSessionLocal() as db:
+            await db.execute(
+                text("""
+                    DELETE FROM oauth_connections
+                    WHERE user_id = :user_id AND provider = 'google'
+                """),
+                {"user_id": user_id},
+            )
+            await db.commit()
+            result["oauth_deleted"] = True
+    except Exception as e:
+        logger.error("disconnect_oauth_delete_failed user_id=%d error=%s", user_id, str(e))
+
+    return result
+
+
+async def _delete_temp_drive_files(user_id: int, access_token: str) -> int:
+    """Delete temporary Drive files created by edit sessions."""
+    deleted = 0
+    with get_sync_session() as session:
+        rows = session.execute(
+            text("""
+                SELECT drive_file_id FROM google_drive_edit_sessions
+                WHERE user_id = :user_id AND status = 'active' AND drive_file_id IS NOT NULL
+            """),
+            {"user_id": user_id},
+        )
+        file_ids = [r[0] for r in rows.fetchall()]
+
+    if not file_ids:
+        return 0
+
+    from google.oauth2.credentials import Credentials
+    from googleapiclient.discovery import build
+
+    creds = Credentials(token=access_token)
+    drive = build("drive", "v3", credentials=creds)
+
+    for fid in file_ids:
+        try:
+            drive.files().delete(fileId=fid).execute()
+            deleted += 1
+        except Exception as e:
+            logger.warning("disconnect_delete_file_failed file_id=%s error=%s", fid, str(e))
+
+    return deleted
+
+
+async def _stop_webhook_channel(user_id: int, tenant_id: str, access_token: str) -> bool:
+    """Stop the webhook channel for this user."""
+    with get_sync_session() as session:
+        row = session.execute(
+            text("""
+                SELECT channel_id, resource_id FROM google_drive_sync_state
+                WHERE user_id = :user_id AND tenant_id = :tenant_id
+                  AND channel_id IS NOT NULL
+            """),
+            {"user_id": user_id, "tenant_id": tenant_id},
+        ).fetchone()
+
+    if not row or not row[0]:
+        return False
+
+    channel_id, resource_id = row[0], row[1]
+
+    from google.oauth2.credentials import Credentials
+    from googleapiclient.discovery import build
+
+    try:
+        creds = Credentials(token=access_token)
+        drive = build("drive", "v3", credentials=creds)
+        drive.channels().stop(body={"id": channel_id, "resourceId": resource_id}).execute()
+        return True
+    except Exception as e:
+        logger.warning("disconnect_stop_channel_failed user_id=%d error=%s", user_id, str(e))
+        return False
+
+
+async def _call_node_cleanup(user_id: int, tenant_id: str) -> bool:
+    """Call Node.js internal endpoint to clean up Drizzle-managed tables."""
+    import httpx
+
+    base_url = (settings.SMARTSPEC_WEB_GATEWAY_URL or "").rstrip("/")
+    token = settings.SMARTSPEC_WEB_GATEWAY_TOKEN or ""
+
+    if not base_url or not token:
+        logger.warning("disconnect_node_cleanup_skipped: gateway URL or token not configured")
+        return False
+
+    try:
+        async with httpx.AsyncClient(timeout=15.0) as client:
+            resp = await client.post(
+                f"{base_url}/api/internal/google-drive/cleanup",
+                json={"userId": user_id, "tenantId": tenant_id},
+                headers={"Authorization": f"Bearer {token}"},
+            )
+        if resp.status_code == 200:
+            data = resp.json()
+            logger.info(
+                "disconnect_node_cleanup_ok user_id=%d items=%d",
+                user_id, data.get("itemsDeleted", 0),
+            )
+            return True
+        else:
+            logger.warning(
+                "disconnect_node_cleanup_failed user_id=%d status=%d body=%s",
+                user_id, resp.status_code, resp.text[:200],
+            )
+            return False
+    except Exception as e:
+        logger.error("disconnect_node_cleanup_error user_id=%d error=%s", user_id, str(e))
+        return False
