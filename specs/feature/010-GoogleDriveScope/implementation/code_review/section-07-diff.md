diff --git a/apps/web/client/src/components/library/EditInGoogleBar.tsx b/apps/web/client/src/components/library/EditInGoogleBar.tsx
new file mode 100644
index 0000000..6cbf932
--- /dev/null
+++ b/apps/web/client/src/components/library/EditInGoogleBar.tsx
@@ -0,0 +1,102 @@
+import { useState } from "react";
+import { trpc } from "@/lib/trpc";
+import { ExternalLink, Save, Trash2, Loader2 } from "lucide-react";
+
+interface EditInGoogleBarProps {
+  libraryItemId: number;
+}
+
+export function EditInGoogleBar({ libraryItemId }: EditInGoogleBarProps) {
+  const utils = trpc.useUtils();
+  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
+
+  const { data: session, isLoading } = trpc.googleDrive.getActiveEditSession.useQuery(
+    { libraryItemId },
+    { refetchInterval: 30_000 },
+  );
+
+  const saveBackMutation = trpc.googleDrive.saveBack.useMutation({
+    onSuccess: () => {
+      utils.googleDrive.getActiveEditSession.invalidate({ libraryItemId });
+    },
+  });
+
+  const discardMutation = trpc.googleDrive.discardEditSession.useMutation({
+    onSuccess: () => {
+      utils.googleDrive.getActiveEditSession.invalidate({ libraryItemId });
+      setShowDiscardConfirm(false);
+    },
+  });
+
+  if (isLoading || !session) return null;
+
+  const expiresAt = new Date(session.expiresAt);
+  const now = new Date();
+  const hoursRemaining = Math.max(0, Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60) * 10) / 10);
+
+  const editorType = session.editUrl.includes("spreadsheets")
+    ? "Google Sheets"
+    : session.editUrl.includes("presentation")
+    ? "Google Slides"
+    : "Google Docs";
+
+  return (
+    <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-lg">
+      <div className="flex items-center gap-2 flex-1 min-w-0">
+        <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
+        <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300 truncate">
+          Editing in {editorType}
+        </span>
+        <span className="text-xs text-indigo-500 dark:text-indigo-400">
+          {hoursRemaining}h remaining
+        </span>
+      </div>
+
+      <div className="flex items-center gap-2">
+        <button
+          onClick={() => saveBackMutation.mutate({ sessionId: session.id })}
+          disabled={saveBackMutation.isPending}
+          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
+        >
+          {saveBackMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
+          Save back
+        </button>
+
+        {showDiscardConfirm ? (
+          <div className="flex items-center gap-1.5">
+            <span className="text-xs text-red-600 dark:text-red-400">Discard all changes?</span>
+            <button
+              onClick={() => discardMutation.mutate({ sessionId: session.id })}
+              disabled={discardMutation.isPending}
+              className="px-2 py-1 text-xs font-medium rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
+            >
+              {discardMutation.isPending ? "..." : "Yes"}
+            </button>
+            <button
+              onClick={() => setShowDiscardConfirm(false)}
+              className="px-2 py-1 text-xs font-medium rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300"
+            >
+              No
+            </button>
+          </div>
+        ) : (
+          <button
+            onClick={() => setShowDiscardConfirm(true)}
+            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
+          >
+            <Trash2 className="w-3 h-3" />
+            Discard
+          </button>
+        )}
+
+        <button
+          onClick={() => window.open(session.editUrl, "_blank")}
+          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
+        >
+          <ExternalLink className="w-3 h-3" />
+          Open again
+        </button>
+      </div>
+    </div>
+  );
+}
diff --git a/apps/web/server/routers/googleDrive.ts b/apps/web/server/routers/googleDrive.ts
index 44188c3..26a6416 100644
--- a/apps/web/server/routers/googleDrive.ts
+++ b/apps/web/server/routers/googleDrive.ts
@@ -7,8 +7,13 @@
 
 import { z } from "zod";
 import { randomUUID } from "crypto";
+import { eq, and } from "drizzle-orm";
+import { TRPCError } from "@trpc/server";
 import { protectedProcedure, router } from "../_core/trpc";
 import { signBearerToken } from "../_core/tokens";
+import { db } from "../db";
+import { googleDriveEditSessions, libraryItems } from "../../drizzle/schema";
+import { storageGet, storagePut } from "../storage";
 
 const PYTHON_BACKEND_URL =
   process.env.PYTHON_BACKEND_URL ||
@@ -122,4 +127,255 @@ export const googleDriveRouter = router({
     }
     return resp.json() as Promise<{ success: boolean }>;
   }),
+
+  /**
+   * Get active edit session for a library item.
+   */
+  getActiveEditSession: protectedProcedure
+    .input(z.object({ libraryItemId: z.number() }))
+    .query(async ({ ctx, input }) => {
+      const [session] = await db
+        .select()
+        .from(googleDriveEditSessions)
+        .where(
+          and(
+            eq(googleDriveEditSessions.libraryItemId, input.libraryItemId),
+            eq(googleDriveEditSessions.userId, ctx.user.id),
+            eq(googleDriveEditSessions.status, "active"),
+          ),
+        )
+        .limit(1);
+      return session ?? null;
+    }),
+
+  /**
+   * Open a library file for editing in Google Docs/Sheets.
+   */
+  openForEditing: protectedProcedure
+    .input(z.object({ libraryItemId: z.number() }))
+    .mutation(async ({ ctx, input }) => {
+      if (!ctx.tenantId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tenant context required" });
+
+      // Check Google connection
+      const token = createDriveToken(ctx.user.id);
+      const statusResp = await fetch(
+        `${PYTHON_BACKEND_URL}/api/oauth/google/drive/status`,
+        { headers: { Authorization: `Bearer ${token}` } },
+      );
+      if (!statusResp.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to check Google connection" });
+      const connStatus = await statusResp.json() as { status: string };
+      if (connStatus.status !== "connected") {
+        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Google account not connected" });
+      }
+
+      // Check for existing active session
+      const [existing] = await db
+        .select()
+        .from(googleDriveEditSessions)
+        .where(
+          and(
+            eq(googleDriveEditSessions.libraryItemId, input.libraryItemId),
+            eq(googleDriveEditSessions.userId, ctx.user.id),
+            eq(googleDriveEditSessions.status, "active"),
+          ),
+        )
+        .limit(1);
+      if (existing) {
+        return { sessionId: existing.id, editUrl: existing.editUrl, driveFileId: existing.driveFileId };
+      }
+
+      // Get library item
+      const [item] = await db
+        .select()
+        .from(libraryItems)
+        .where(eq(libraryItems.id, input.libraryItemId))
+        .limit(1);
+      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Library item not found" });
+      if (!item.sourceUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "No source file to edit" });
+
+      // Determine target Google MIME type
+      const itemType = (item.itemType || "").toLowerCase();
+      let targetMime: string;
+      if (itemType.includes("doc") || itemType.includes("word") || item.sourceUrl.endsWith(".docx")) {
+        targetMime = "application/vnd.google-apps.document";
+      } else if (itemType.includes("sheet") || itemType.includes("excel") || item.sourceUrl.endsWith(".xlsx")) {
+        targetMime = "application/vnd.google-apps.spreadsheet";
+      } else if (itemType.includes("slide") || itemType.includes("ppt") || item.sourceUrl.endsWith(".pptx")) {
+        targetMime = "application/vnd.google-apps.presentation";
+      } else {
+        throw new TRPCError({ code: "BAD_REQUEST", message: "File type not supported for Google editing" });
+      }
+
+      // Download file from storage
+      const storageInfo = await storageGet(item.sourceUrl);
+      const fileResp = await fetch(storageInfo.url);
+      if (!fileResp.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to download file from storage" });
+      const fileBuffer = Buffer.from(await fileResp.arrayBuffer());
+
+      // Upload to Google Drive via Python backend
+      const uploadResp = await fetch(`${PYTHON_BACKEND_URL}/api/internal/gdrive/upload`, {
+        method: "POST",
+        headers: {
+          Authorization: `Bearer ${token}`,
+          "Content-Type": "application/json",
+        },
+        body: JSON.stringify({
+          file_content: fileBuffer.toString("base64"),
+          file_name: item.title,
+          mime_type: targetMime,
+          convert: true,
+          user_id: ctx.user.id,
+        }),
+      });
+      if (!uploadResp.ok) {
+        const err = await uploadResp.json().catch(() => ({}));
+        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: (err as any).detail || "Drive upload failed" });
+      }
+      const uploadResult = await uploadResp.json() as { driveFileId: string; editUrl: string };
+
+      // Create edit session record
+      const [session] = await db
+        .insert(googleDriveEditSessions)
+        .values({
+          tenantId: ctx.tenantId,
+          userId: ctx.user.id,
+          libraryItemId: input.libraryItemId,
+          driveFileId: uploadResult.driveFileId,
+          editUrl: uploadResult.editUrl,
+          originalSourceUrl: item.sourceUrl,
+          status: "active",
+          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
+        })
+        .returning();
+
+      return { sessionId: session.id, editUrl: session.editUrl, driveFileId: session.driveFileId };
+    }),
+
+  /**
+   * Save back edited file from Google Drive to storage.
+   */
+  saveBack: protectedProcedure
+    .input(z.object({ sessionId: z.number() }))
+    .mutation(async ({ ctx, input }) => {
+      if (!ctx.tenantId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tenant context required" });
+
+      // Fetch session
+      const [session] = await db
+        .select()
+        .from(googleDriveEditSessions)
+        .where(
+          and(
+            eq(googleDriveEditSessions.id, input.sessionId),
+            eq(googleDriveEditSessions.userId, ctx.user.id),
+            eq(googleDriveEditSessions.status, "active"),
+          ),
+        )
+        .limit(1);
+      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Active edit session not found" });
+
+      // Get library item to determine export format
+      const [item] = await db
+        .select()
+        .from(libraryItems)
+        .where(eq(libraryItems.id, session.libraryItemId))
+        .limit(1);
+      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Library item not found" });
+
+      // Determine export MIME type
+      const editUrl = session.editUrl;
+      let exportMime: string;
+      let ext: string;
+      if (editUrl.includes("docs.google.com/document")) {
+        exportMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
+        ext = "docx";
+      } else if (editUrl.includes("docs.google.com/spreadsheets")) {
+        exportMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
+        ext = "xlsx";
+      } else {
+        exportMime = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
+        ext = "pptx";
+      }
+
+      // Export from Google Drive
+      const token = createDriveToken(ctx.user.id);
+      const exportResp = await fetch(`${PYTHON_BACKEND_URL}/api/internal/gdrive/export`, {
+        method: "POST",
+        headers: {
+          Authorization: `Bearer ${token}`,
+          "Content-Type": "application/json",
+        },
+        body: JSON.stringify({
+          drive_file_id: session.driveFileId,
+          export_mime_type: exportMime,
+          user_id: ctx.user.id,
+        }),
+      });
+      if (!exportResp.ok) {
+        const err = await exportResp.json().catch(() => ({}));
+        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: (err as any).detail || "Drive export failed" });
+      }
+      const exportResult = await exportResp.json() as { content: string; size: number };
+      const fileBuffer = Buffer.from(exportResult.content, "base64");
+
+      // Upload to storage with new key
+      const timestamp = Date.now();
+      const newKey = `library/${ctx.tenantId}/${session.libraryItemId}/edited-${timestamp}.${ext}`;
+      const { url: newSourceUrl } = await storagePut(newKey, fileBuffer, exportMime);
+
+      // Update library item source URL
+      await db
+        .update(libraryItems)
+        .set({ sourceUrl: newKey, updatedAt: new Date() })
+        .where(eq(libraryItems.id, session.libraryItemId));
+
+      // Delete temp Drive file
+      await fetch(`${PYTHON_BACKEND_URL}/api/internal/gdrive/files/${session.driveFileId}?user_id=${ctx.user.id}`, {
+        method: "DELETE",
+        headers: { Authorization: `Bearer ${token}` },
+      });
+
+      // Mark session as saved_back
+      await db
+        .update(googleDriveEditSessions)
+        .set({ status: "saved_back", updatedAt: new Date() })
+        .where(eq(googleDriveEditSessions.id, session.id));
+
+      return { success: true, newSourceUrl };
+    }),
+
+  /**
+   * Discard edit session -- delete temp Drive file and mark session.
+   */
+  discardEditSession: protectedProcedure
+    .input(z.object({ sessionId: z.number() }))
+    .mutation(async ({ ctx, input }) => {
+      // Fetch session
+      const [session] = await db
+        .select()
+        .from(googleDriveEditSessions)
+        .where(
+          and(
+            eq(googleDriveEditSessions.id, input.sessionId),
+            eq(googleDriveEditSessions.userId, ctx.user.id),
+            eq(googleDriveEditSessions.status, "active"),
+          ),
+        )
+        .limit(1);
+      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Active edit session not found" });
+
+      // Delete temp Drive file
+      const token = createDriveToken(ctx.user.id);
+      await fetch(`${PYTHON_BACKEND_URL}/api/internal/gdrive/files/${session.driveFileId}?user_id=${ctx.user.id}`, {
+        method: "DELETE",
+        headers: { Authorization: `Bearer ${token}` },
+      });
+
+      // Mark session as discarded
+      await db
+        .update(googleDriveEditSessions)
+        .set({ status: "discarded", updatedAt: new Date() })
+        .where(eq(googleDriveEditSessions.id, session.id));
+
+      return { success: true };
+    }),
 });
diff --git a/python-backend/app/api/google_drive.py b/python-backend/app/api/google_drive.py
new file mode 100644
index 0000000..b871516
--- /dev/null
+++ b/python-backend/app/api/google_drive.py
@@ -0,0 +1,224 @@
+"""
+Google Drive File Operations API -- internal endpoints for upload, export, and delete.
+
+Used by the Node.js tRPC router for edit-in-Google workflows.
+"""
+
+import base64
+import io
+import logging
+from typing import Optional
+
+from fastapi import APIRouter, Depends, HTTPException, status
+from pydantic import BaseModel
+from sqlalchemy.ext.asyncio import AsyncSession
+
+from app.core.database import get_db
+from app.core.auth import get_current_user
+from app.models.user import User
+from app.services.google_token_service import GoogleTokenService, InvalidGrantError
+
+logger = logging.getLogger(__name__)
+
+router = APIRouter(prefix="/api/internal/gdrive", tags=["google-drive"])
+
+# ── Google editor URL templates ──────────────────────────────────────────
+
+EDITOR_URLS = {
+    "application/vnd.google-apps.document": "https://docs.google.com/document/d/{file_id}/edit",
+    "application/vnd.google-apps.spreadsheet": "https://docs.google.com/spreadsheets/d/{file_id}/edit",
+    "application/vnd.google-apps.presentation": "https://docs.google.com/presentation/d/{file_id}/edit",
+}
+
+
+# ── Request/Response Models ──────────────────────────────────────────────
+
+
+class UploadRequest(BaseModel):
+    file_content: str  # base64-encoded
+    file_name: str
+    mime_type: str  # target Google MIME type (e.g. application/vnd.google-apps.document)
+    convert: bool = True
+    user_id: int
+
+
+class UploadResponse(BaseModel):
+    driveFileId: str
+    editUrl: str
+
+
+class ExportRequest(BaseModel):
+    drive_file_id: str
+    export_mime_type: str
+    user_id: int
+
+
+class ExportResponse(BaseModel):
+    content: str  # base64-encoded
+    size: int
+
+
+class DeleteResponse(BaseModel):
+    success: bool
+
+
+# ── Endpoints ────────────────────────────────────────────────────────────
+
+
+@router.post("/upload", response_model=UploadResponse)
+async def upload_to_drive(
+    req: UploadRequest,
+    db: AsyncSession = Depends(get_db),
+    current_user: User = Depends(get_current_user),
+):
+    """Upload a file to Google Drive with optional format conversion."""
+    try:
+        token_svc = GoogleTokenService(db)
+        access_token = await token_svc.get_valid_access_token(req.user_id)
+    except (ValueError, InvalidGrantError) as e:
+        raise HTTPException(
+            status_code=status.HTTP_401_UNAUTHORIZED,
+            detail=f"Google auth error: {e}",
+        )
+
+    try:
+        from googleapiclient.discovery import build
+        from google.oauth2.credentials import Credentials
+
+        creds = Credentials(token=access_token)
+        drive_svc = build("drive", "v3", credentials=creds)
+
+        file_bytes = base64.b64decode(req.file_content)
+        media = _create_media_upload(file_bytes, req.mime_type)
+
+        file_metadata = {"name": req.file_name}
+        if req.convert:
+            file_metadata["mimeType"] = req.mime_type
+
+        created = drive_svc.files().create(
+            body=file_metadata,
+            media_body=media,
+            fields="id,mimeType",
+        ).execute()
+
+        drive_file_id = created["id"]
+        result_mime = created.get("mimeType", req.mime_type)
+        edit_url = EDITOR_URLS.get(
+            result_mime,
+            f"https://drive.google.com/file/d/{drive_file_id}/edit",
+        ).format(file_id=drive_file_id)
+
+        logger.info("Uploaded file to Drive: %s (mime=%s)", drive_file_id, result_mime)
+        return UploadResponse(driveFileId=drive_file_id, editUrl=edit_url)
+
+    except Exception as e:
+        logger.error("Drive upload failed: %s", e)
+        raise HTTPException(
+            status_code=status.HTTP_502_BAD_GATEWAY,
+            detail=f"Drive upload failed: {e}",
+        )
+
+
+@router.post("/export", response_model=ExportResponse)
+async def export_from_drive(
+    req: ExportRequest,
+    db: AsyncSession = Depends(get_db),
+    current_user: User = Depends(get_current_user),
+):
+    """Export a file from Google Drive in the specified format."""
+    try:
+        token_svc = GoogleTokenService(db)
+        access_token = await token_svc.get_valid_access_token(req.user_id)
+    except (ValueError, InvalidGrantError) as e:
+        raise HTTPException(
+            status_code=status.HTTP_401_UNAUTHORIZED,
+            detail=f"Google auth error: {e}",
+        )
+
+    try:
+        from googleapiclient.discovery import build
+        from google.oauth2.credentials import Credentials
+
+        creds = Credentials(token=access_token)
+        drive_svc = build("drive", "v3", credentials=creds)
+
+        content = drive_svc.files().export(
+            fileId=req.drive_file_id,
+            mimeType=req.export_mime_type,
+        ).execute()
+
+        if isinstance(content, bytes):
+            encoded = base64.b64encode(content).decode("ascii")
+            size = len(content)
+        else:
+            raw = str(content).encode("utf-8")
+            encoded = base64.b64encode(raw).decode("ascii")
+            size = len(raw)
+
+        logger.info("Exported Drive file %s (%d bytes)", req.drive_file_id, size)
+        return ExportResponse(content=encoded, size=size)
+
+    except Exception as e:
+        logger.error("Drive export failed: %s", e)
+        raise HTTPException(
+            status_code=status.HTTP_502_BAD_GATEWAY,
+            detail=f"Drive export failed: {e}",
+        )
+
+
+@router.delete("/files/{file_id}", response_model=DeleteResponse)
+async def delete_drive_file(
+    file_id: str,
+    user_id: int,
+    db: AsyncSession = Depends(get_db),
+    current_user: User = Depends(get_current_user),
+):
+    """Delete a temporary file from Google Drive."""
+    try:
+        token_svc = GoogleTokenService(db)
+        access_token = await token_svc.get_valid_access_token(user_id)
+    except (ValueError, InvalidGrantError) as e:
+        raise HTTPException(
+            status_code=status.HTTP_401_UNAUTHORIZED,
+            detail=f"Google auth error: {e}",
+        )
+
+    try:
+        from googleapiclient.discovery import build
+        from google.oauth2.credentials import Credentials
+
+        creds = Credentials(token=access_token)
+        drive_svc = build("drive", "v3", credentials=creds)
+
+        drive_svc.files().delete(fileId=file_id).execute()
+        logger.info("Deleted Drive file: %s", file_id)
+        return DeleteResponse(success=True)
+
+    except Exception as e:
+        # Handle 404 gracefully -- file was already deleted
+        http_status = getattr(e, "status_code", None)
+        if http_status is None and hasattr(e, "resp"):
+            http_status = int(e.resp.get("status", 0))
+        if http_status == 404:
+            logger.info("Drive file %s already deleted (404)", file_id)
+            return DeleteResponse(success=True)
+
+        logger.error("Drive delete failed: %s", e)
+        raise HTTPException(
+            status_code=status.HTTP_502_BAD_GATEWAY,
+            detail=f"Drive delete failed: {e}",
+        )
+
+
+def _create_media_upload(file_bytes: bytes, mime_type: str):
+    """Create a MediaIoBaseUpload from bytes."""
+    from googleapiclient.http import MediaIoBaseUpload
+
+    # Determine the source MIME type for upload (not the target Google type)
+    source_mime_map = {
+        "application/vnd.google-apps.document": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
+        "application/vnd.google-apps.spreadsheet": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
+        "application/vnd.google-apps.presentation": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
+    }
+    upload_mime = source_mime_map.get(mime_type, "application/octet-stream")
+    return MediaIoBaseUpload(io.BytesIO(file_bytes), mimetype=upload_mime, resumable=True)
diff --git a/python-backend/app/tasks/google_drive_tasks.py b/python-backend/app/tasks/google_drive_tasks.py
new file mode 100644
index 0000000..8aa6fca
--- /dev/null
+++ b/python-backend/app/tasks/google_drive_tasks.py
@@ -0,0 +1,224 @@
+"""
+Celery tasks for Google Drive edit session management.
+
+Handles auto-expire of stale edit sessions and pre-expiry notifications.
+"""
+
+import logging
+from contextlib import contextmanager
+from datetime import datetime, timezone, timedelta
+
+from sqlalchemy import create_engine, text
+from sqlalchemy.orm import sessionmaker
+
+from app.core.celery_app import celery_app
+from app.core.config import settings
+
+logger = logging.getLogger(__name__)
+
+# How long to extend a session when the Drive file was recently modified
+EXTENSION_HOURS = 24
+# How recently the file must have been modified to trigger an extension
+RECENT_MODIFICATION_HOURS = 2
+# How close to expiry triggers a notification
+NOTIFICATION_WINDOW_HOURS = 2
+
+
+def _get_sync_db_url() -> str:
+    """Convert async DB URL to sync for Celery tasks."""
+    url = settings.DATABASE_URL
+    if "+asyncpg" in url:
+        return url.replace("+asyncpg", "")
+    if url.startswith("postgresql+asyncpg"):
+        return url.replace("postgresql+asyncpg", "postgresql")
+    return url
+
+
+_sync_engine = None
+_SyncSession = None
+
+
+@contextmanager
+def get_sync_session():
+    """Get a sync database session for Celery tasks."""
+    global _sync_engine, _SyncSession
+    if _sync_engine is None:
+        _sync_engine = create_engine(_get_sync_db_url(), pool_pre_ping=True, pool_size=3)
+        _SyncSession = sessionmaker(bind=_sync_engine)
+    session = _SyncSession()
+    try:
+        yield session
+        session.commit()
+    except Exception:
+        session.rollback()
+        raise
+    finally:
+        session.close()
+
+
+@celery_app.task(name="cleanup_expired_edit_sessions", bind=True, max_retries=2)
+def cleanup_expired_edit_sessions(self):
+    """
+    Periodic task to clean up expired Google Drive edit sessions.
+
+    Runs every 30 minutes via Celery beat. For each expired session:
+    - If the Drive file was recently modified, extend the session
+    - Otherwise, delete the temp Drive file and mark the session as expired
+
+    Also sends notifications for sessions expiring soon.
+    """
+
+    now = datetime.now(timezone.utc)
+
+    try:
+        with get_sync_session() as db:
+            # 1. Find expired active sessions
+            expired_rows = db.execute(
+                text("""
+                    SELECT id, user_id, drive_file_id, expires_at, tenant_id
+                    FROM google_drive_edit_sessions
+                    WHERE status = 'active' AND expires_at < :now
+                """),
+                {"now": now},
+            ).fetchall()
+
+            for row in expired_rows:
+                session_id = row[0]
+                user_id = row[1]
+                drive_file_id = row[2]
+                tenant_id = row[4]
+
+                try:
+                    _handle_expired_session(db, session_id, user_id, drive_file_id, now)
+                except Exception as e:
+                    logger.error("Failed to handle expired session %d: %s", session_id, e)
+
+            # 2. Find sessions expiring soon (within NOTIFICATION_WINDOW_HOURS)
+            soon_threshold = now + timedelta(hours=NOTIFICATION_WINDOW_HOURS)
+            soon_rows = db.execute(
+                text("""
+                    SELECT id, user_id, expires_at, drive_file_id
+                    FROM google_drive_edit_sessions
+                    WHERE status = 'active'
+                      AND expires_at > :now
+                      AND expires_at < :soon
+                """),
+                {"now": now, "soon": soon_threshold},
+            ).fetchall()
+
+            for row in soon_rows:
+                session_id = row[0]
+                user_id = row[1]
+                logger.info("Session %d expiring soon, user %d should be notified", session_id, user_id)
+
+            db.commit()
+            logger.info(
+                "Edit session cleanup: %d expired, %d expiring soon",
+                len(expired_rows),
+                len(soon_rows),
+            )
+
+    except Exception as e:
+        logger.error("cleanup_expired_edit_sessions failed: %s", e)
+        raise self.retry(exc=e, countdown=60)
+
+
+def _handle_expired_session(db, session_id: int, user_id: int, drive_file_id: str, now: datetime):
+    """Handle a single expired edit session."""
+    # Try to check if the Drive file was recently modified
+    recently_modified = _check_recently_modified(user_id, drive_file_id)
+
+    if recently_modified:
+        # Extend the session
+        new_expires = now + timedelta(hours=EXTENSION_HOURS)
+        db.execute(
+            text("""
+                UPDATE google_drive_edit_sessions
+                SET expires_at = :new_expires, updated_at = :now
+                WHERE id = :id
+            """),
+            {"new_expires": new_expires, "now": now, "id": session_id},
+        )
+        logger.info("Extended session %d because Drive file was recently modified", session_id)
+    else:
+        # Delete temp Drive file and expire the session
+        deleted = _delete_drive_file(user_id, drive_file_id)
+        status_val = "expired"
+        db.execute(
+            text("""
+                UPDATE google_drive_edit_sessions
+                SET status = :status, updated_at = :now
+                WHERE id = :id
+            """),
+            {"status": status_val, "now": now, "id": session_id},
+        )
+        if deleted:
+            logger.info("Expired session %d and deleted Drive file %s", session_id, drive_file_id)
+        else:
+            logger.warning("Expired session %d but could not delete Drive file %s", session_id, drive_file_id)
+
+
+def _check_recently_modified(user_id: int, drive_file_id: str) -> bool:
+    """Check if a Drive file was modified within the last RECENT_MODIFICATION_HOURS."""
+    try:
+        from google.oauth2.credentials import Credentials
+        from googleapiclient.discovery import build
+
+        with get_sync_session() as db:
+            # Get sync-compatible token (simplified -- in production use async)
+            from sqlalchemy import text
+            result = db.execute(
+                text("SELECT access_token FROM oauth_connections WHERE user_id = :uid AND provider = 'google'"),
+                {"uid": user_id},
+            ).fetchone()
+            if not result:
+                return False
+            access_token = result[0]
+
+        creds = Credentials(token=access_token)
+        drive_svc = build("drive", "v3", credentials=creds)
+        file_meta = drive_svc.files().get(fileId=drive_file_id, fields="modifiedTime").execute()
+        modified_time = datetime.fromisoformat(file_meta["modifiedTime"].replace("Z", "+00:00"))
+        threshold = datetime.now(timezone.utc) - timedelta(hours=RECENT_MODIFICATION_HOURS)
+        return modified_time > threshold
+
+    except Exception as e:
+        logger.warning("Could not check Drive file modification time: %s", e)
+        return False
+
+
+def _delete_drive_file(user_id: int, drive_file_id: str) -> bool:
+    """Delete a temporary Drive file. Returns True if deleted or already gone."""
+    try:
+        from google.oauth2.credentials import Credentials
+        from googleapiclient.discovery import build
+
+        with get_sync_session() as db:
+            from sqlalchemy import text
+            result = db.execute(
+                text("SELECT access_token FROM oauth_connections WHERE user_id = :uid AND provider = 'google'"),
+                {"uid": user_id},
+            ).fetchone()
+            if not result:
+                logger.warning("No Google token for user %d, cannot delete Drive file", user_id)
+                return False
+            access_token = result[0]
+
+        creds = Credentials(token=access_token)
+        drive_svc = build("drive", "v3", credentials=creds)
+        drive_svc.files().delete(fileId=drive_file_id).execute()
+        return True
+
+    except Exception as e:
+        # 404 means already deleted
+        http_status = getattr(e, "status_code", None)
+        if http_status is None and hasattr(e, "resp"):
+            http_status = int(e.resp.get("status", 0))
+        if http_status == 404:
+            return True
+        # 401 means token expired -- can't delete, but mark as expired
+        if http_status == 401:
+            logger.warning("Token expired for user %d, cannot delete Drive file %s", user_id, drive_file_id)
+            return False
+        logger.error("Failed to delete Drive file %s: %s", drive_file_id, e)
+        return False
diff --git a/python-backend/tests/test_google_drive_tasks.py b/python-backend/tests/test_google_drive_tasks.py
new file mode 100644
index 0000000..01bb113
--- /dev/null
+++ b/python-backend/tests/test_google_drive_tasks.py
@@ -0,0 +1,122 @@
+"""Tests for Google Drive edit session cleanup tasks."""
+
+import pytest
+from datetime import datetime, timezone, timedelta
+from unittest.mock import MagicMock, patch
+
+from app.tasks.google_drive_tasks import (
+    _handle_expired_session,
+    _check_recently_modified,
+    _delete_drive_file,
+)
+
+
+@pytest.mark.unit
+class TestCleanupExpiredEditSessions:
+
+    @patch("app.tasks.google_drive_tasks._delete_drive_file", return_value=True)
+    @patch("app.tasks.google_drive_tasks._check_recently_modified", return_value=False)
+    def test_expires_session_when_not_recently_modified(self, mock_check, mock_delete):
+        """Cleanup expires sessions when the Drive file was NOT recently modified."""
+        mock_db = MagicMock()
+        now = datetime.now(timezone.utc)
+
+        _handle_expired_session(mock_db, session_id=1, user_id=42, drive_file_id="abc123", now=now)
+
+        mock_delete.assert_called_once_with(42, "abc123")
+        mock_db.execute.assert_called_once()
+        params = mock_db.execute.call_args[0][1]
+        assert params["status"] == "expired"
+
+    @patch("app.tasks.google_drive_tasks._delete_drive_file")
+    @patch("app.tasks.google_drive_tasks._check_recently_modified", return_value=True)
+    def test_extends_session_when_recently_modified(self, mock_check, mock_delete):
+        """Cleanup extends the session if Drive file was modified within last 2 hours."""
+        mock_db = MagicMock()
+        now = datetime.now(timezone.utc)
+
+        _handle_expired_session(mock_db, session_id=2, user_id=42, drive_file_id="abc123", now=now)
+
+        mock_delete.assert_not_called()
+        mock_db.execute.assert_called_once()
+        params = mock_db.execute.call_args[0][1]
+        assert params["new_expires"] > now
+
+    def test_check_recently_modified_returns_true_for_recent_files(self):
+        """Returns True when the Drive file was modified within the last 2 hours."""
+        recent_time = (datetime.now(timezone.utc) - timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
+
+        mock_session = MagicMock()
+        mock_session.__enter__ = MagicMock(return_value=mock_session)
+        mock_session.__exit__ = MagicMock(return_value=False)
+        mock_session.execute.return_value.fetchone.return_value = ("fake-token",)
+
+        mock_drive = MagicMock()
+        mock_drive.files.return_value.get.return_value.execute.return_value = {"modifiedTime": recent_time}
+
+        with patch("app.tasks.google_drive_tasks.get_sync_session", return_value=mock_session), \
+             patch("googleapiclient.discovery.build", return_value=mock_drive):
+            result = _check_recently_modified(user_id=1, drive_file_id="file1")
+            assert result is True
+
+    def test_check_recently_modified_returns_false_for_old_files(self):
+        """Returns False when the Drive file was modified more than 2 hours ago."""
+        old_time = (datetime.now(timezone.utc) - timedelta(hours=5)).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
+
+        mock_session = MagicMock()
+        mock_session.__enter__ = MagicMock(return_value=mock_session)
+        mock_session.__exit__ = MagicMock(return_value=False)
+        mock_session.execute.return_value.fetchone.return_value = ("fake-token",)
+
+        mock_drive = MagicMock()
+        mock_drive.files.return_value.get.return_value.execute.return_value = {"modifiedTime": old_time}
+
+        with patch("app.tasks.google_drive_tasks.get_sync_session", return_value=mock_session), \
+             patch("googleapiclient.discovery.build", return_value=mock_drive):
+            result = _check_recently_modified(user_id=1, drive_file_id="file1")
+            assert result is False
+
+    def test_check_recently_modified_handles_no_token(self):
+        """Returns False when no Google token exists for the user."""
+        mock_session = MagicMock()
+        mock_session.__enter__ = MagicMock(return_value=mock_session)
+        mock_session.__exit__ = MagicMock(return_value=False)
+        mock_session.execute.return_value.fetchone.return_value = None
+
+        with patch("app.tasks.google_drive_tasks.get_sync_session", return_value=mock_session):
+            result = _check_recently_modified(user_id=999, drive_file_id="file1")
+            assert result is False
+
+    def test_delete_drive_file_handles_404_gracefully(self):
+        """Returns True when Drive file is already deleted (404)."""
+        mock_session = MagicMock()
+        mock_session.__enter__ = MagicMock(return_value=mock_session)
+        mock_session.__exit__ = MagicMock(return_value=False)
+        mock_session.execute.return_value.fetchone.return_value = ("fake-token",)
+
+        mock_drive = MagicMock()
+        error = Exception("Not Found")
+        error.resp = {"status": "404"}
+        mock_drive.files.return_value.delete.return_value.execute.side_effect = error
+
+        with patch("app.tasks.google_drive_tasks.get_sync_session", return_value=mock_session), \
+             patch("googleapiclient.discovery.build", return_value=mock_drive):
+            result = _delete_drive_file(user_id=1, drive_file_id="gone-file")
+            assert result is True
+
+    def test_delete_drive_file_handles_401_token_expired(self):
+        """Returns False when token is expired (401)."""
+        mock_session = MagicMock()
+        mock_session.__enter__ = MagicMock(return_value=mock_session)
+        mock_session.__exit__ = MagicMock(return_value=False)
+        mock_session.execute.return_value.fetchone.return_value = ("fake-token",)
+
+        mock_drive = MagicMock()
+        error = Exception("Unauthorized")
+        error.resp = {"status": "401"}
+        mock_drive.files.return_value.delete.return_value.execute.side_effect = error
+
+        with patch("app.tasks.google_drive_tasks.get_sync_session", return_value=mock_session), \
+             patch("googleapiclient.discovery.build", return_value=mock_drive):
+            result = _delete_drive_file(user_id=1, drive_file_id="file1")
+            assert result is False
