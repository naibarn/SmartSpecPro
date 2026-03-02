/**
 * OneDrive integration tRPC router.
 *
 * Proxies requests to the Python backend's OneDrive OAuth endpoints.
 * Mirrors googleDrive.ts for Microsoft Graph API integration.
 */

import { z } from "zod";
import { randomUUID } from "crypto";
import { eq, and, sql, count, sum, desc, gte, lt, ilike } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { signBearerToken } from "../_core/tokens";
import { db, getDb } from "../db";
import {
  onedriveEditSessions,
  onedriveSyncState,
  libraryItems,
  libraryChunks,
  creditTransactions,
} from "../../drizzle/schema";
import { storageGet, storagePut } from "../storage";
import {
  onedriveSearchLimiter,
  onedriveReadLimiter,
  onedriveSyncLimiter,
  onedriveEditLimiter,
} from "../services/oneDriveRateLimiter";
import { createGDriveRateLimitMiddleware } from "../services/googleDriveRateLimitMiddleware";
import { auditLogger } from "../services/auditLogger";
import { uploadLibraryFile } from "../services/libraryService";
import { isLibraryEnabledForTenant } from "../services/libraryFeatureFlags";
import { resolveTenantIdVarchar } from "../services/tenantContext";

// ── Input validation schemas ──────────────────────────────────────────────
const driveItemIdSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[a-zA-Z0-9!_-]+$/, "Invalid item ID format");

const driveFolderIdSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[a-zA-Z0-9!_-]+$/, "Invalid folder ID format");

// ── Helpers ─────────────────────────────────────────────────────────────

function resolveLibraryTenantId(
  ctx: { tenantId: unknown; user: { currentTenantId?: unknown } },
): string {
  const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
  if (!tenantId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Tenant context is required for library operations",
    });
  }
  return tenantId;
}

function assertLibraryEnabled(tenantId: string): void {
  if (!isLibraryEnabledForTenant(tenantId)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Library feature is disabled for this tenant",
    });
  }
}

const searchRateLimit = createGDriveRateLimitMiddleware(onedriveSearchLimiter);
const readRateLimit = createGDriveRateLimitMiddleware(onedriveReadLimiter);
const syncRateLimit = createGDriveRateLimitMiddleware(onedriveSyncLimiter);
const editRateLimit = createGDriveRateLimitMiddleware(onedriveEditLimiter);

const PYTHON_BACKEND_URL =
  process.env.PYTHON_BACKEND_URL || "http://localhost:8000";

const PROXY_TOKEN = process.env.SMARTSPEC_PROXY_TOKEN ?? "";
if (!PROXY_TOKEN) {
  console.warn("[oneDrive] SMARTSPEC_PROXY_TOKEN is not set — internal API calls will lack auth");
}

const PY_TIMEOUT_MS = 10_000;
const PY_UPLOAD_TIMEOUT_MS = 30_000;
const MAX_EDIT_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

function pyFetch(
  url: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const { timeoutMs, ...rest } = init ?? {};
  return fetch(url, {
    ...rest,
    signal: rest.signal ?? AbortSignal.timeout(timeoutMs ?? PY_TIMEOUT_MS),
  });
}

async function extractPyErrorMessage(response: Response): Promise<string> {
  const raw = await response.text().catch(() => "");
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as { detail?: unknown; message?: unknown };
    if (typeof parsed.detail === "string" && parsed.detail.trim()) return parsed.detail;
    if (typeof parsed.message === "string" && parsed.message.trim()) return parsed.message;
  } catch {
    // fall through to raw text
  }
  return raw;
}

function createOneDriveToken(userId: number): string {
  return signBearerToken(
    {
      sub: String(userId),
      type: "access",
      scopes: ["drive:manage"],
      jti: randomUUID(),
    },
    "15m",
  );
}

export const oneDriveRouter = router({
  /**
   * Get the user's OneDrive connection status.
   */
  getConnectionStatus: protectedProcedure.query(async ({ ctx }) => {
    const token = createOneDriveToken(ctx.user.id);
    const resp = await pyFetch(
      `${PYTHON_BACKEND_URL}/api/oauth/microsoft/onedrive/status`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error((err as any).detail || "Failed to get connection status");
    }
    return resp.json() as Promise<{
      status: "not_connected" | "connected" | "expired";
      email: string | null;
      scopes: string[];
      connectedAt: string | null;
    }>;
  }),

  /**
   * Get the Microsoft OAuth authorization URL with OneDrive scopes.
   */
  getAuthUrl: protectedProcedure.query(async ({ ctx }) => {
    const token = createOneDriveToken(ctx.user.id);
    const resp = await pyFetch(
      `${PYTHON_BACKEND_URL}/api/oauth/microsoft/onedrive/authorize`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error((err as any).detail || "Failed to get auth URL");
    }
    return resp.json() as Promise<{
      authorization_url: string;
      state: string;
    }>;
  }),

  /**
   * Complete the OAuth flow by exchanging the code for tokens.
   */
  completeOAuth: protectedProcedure
    .input(z.object({ code: z.string(), state: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const token = createOneDriveToken(ctx.user.id);
      const resp = await pyFetch(
        `${PYTHON_BACKEND_URL}/api/oauth/microsoft/onedrive/callback`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code: input.code,
            state: input.state,
          }),
        },
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as any).detail || "OAuth exchange failed");
      }
      const result = await resp.json() as { email: string; scopes: string[]; status: string };

      auditLogger.log({
        eventType: "onedrive_connect",
        userId: ctx.user.id,
        metadata: { email: result.email, scopes: result.scopes },
      });

      return result;
    }),

  /**
   * Disconnect OneDrive for the current user.
   * Enqueues a background Celery task for full cleanup.
   */
  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.tenantId) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tenant context required" });
    }

        const resp = await pyFetch(
      `${PYTHON_BACKEND_URL}/api/internal/onedrive/disconnect`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-proxy-token": PROXY_TOKEN,
        },
        body: JSON.stringify({
          user_id: ctx.user.id,
          tenant_id: ctx.tenantId,
        }),
      },
    );

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      auditLogger.log({
        eventType: "error",
        userId: ctx.user.id,
        metadata: { endpoint: "onedrive/disconnect", detail: (err as any).detail },
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to start disconnect cleanup",
      });
    }

    const result = await resp.json() as { status: string; task_id: string };

    auditLogger.log({
      eventType: "onedrive_disconnect",
      userId: ctx.user.id,
      metadata: { tenantId: ctx.tenantId, taskId: result.task_id },
    });

    return result;
  }),

  /**
   * Get active edit session for a library item.
   */
  getActiveEditSession: protectedProcedure
    .input(z.object({ libraryItemId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.tenantId) return null;
      const [session] = await db
        .select()
        .from(onedriveEditSessions)
        .where(
          and(
            eq(onedriveEditSessions.tenantId, ctx.tenantId),
            eq(onedriveEditSessions.libraryItemId, input.libraryItemId),
            eq(onedriveEditSessions.userId, ctx.user.id),
            eq(onedriveEditSessions.status, "active"),
            sql`${onedriveEditSessions.expiresAt} > NOW()`,
          ),
        )
        .limit(1);
      return session ?? null;
    }),

  /**
   * Open a library file for editing in Office Online.
   */
  openForEditing: protectedProcedure
    .use(editRateLimit)
    .input(z.object({ libraryItemId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.tenantId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tenant context required" });

      // Check OneDrive connection
      const token = createOneDriveToken(ctx.user.id);
      const statusResp = await pyFetch(
        `${PYTHON_BACKEND_URL}/api/oauth/microsoft/onedrive/status`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!statusResp.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to check OneDrive connection" });
      const connStatus = await statusResp.json() as { status: string };
      if (connStatus.status !== "connected") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Microsoft account not connected" });
      }

      // Check for existing active session
      const [existing] = await db
        .select()
        .from(onedriveEditSessions)
        .where(
          and(
            eq(onedriveEditSessions.tenantId, ctx.tenantId),
            eq(onedriveEditSessions.libraryItemId, input.libraryItemId),
            eq(onedriveEditSessions.userId, ctx.user.id),
            eq(onedriveEditSessions.status, "active"),
            sql`${onedriveEditSessions.expiresAt} > NOW()`,
          ),
        )
        .limit(1);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Active edit session already exists",
          cause: { sessionId: existing.id, editUrl: existing.editUrl, driveItemId: existing.driveItemId },
        });
      }

      // Get library item
      const [item] = await db
        .select()
        .from(libraryItems)
        .where(
          and(
            eq(libraryItems.id, input.libraryItemId),
            eq(libraryItems.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Library item not found" });
      if (!item.sourceUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "No source file to edit" });

      // Determine MIME type for upload
      const itemType = (item.itemType || "").toLowerCase();
      let uploadMime: string;
      if (itemType.includes("doc") || itemType.includes("word") || item.sourceUrl.endsWith(".docx")) {
        uploadMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      } else if (itemType.includes("sheet") || itemType.includes("excel") || item.sourceUrl.endsWith(".xlsx")) {
        uploadMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      } else if (itemType.includes("slide") || itemType.includes("ppt") || item.sourceUrl.endsWith(".pptx")) {
        uploadMime = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
      } else {
        throw new TRPCError({ code: "BAD_REQUEST", message: "File type not supported for Office Online editing" });
      }

      // Download file from storage
      const storageInfo = await storageGet(item.sourceUrl);
      const fileResp = await fetch(storageInfo.url);
      if (!fileResp.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to download file from storage" });
      const contentLength = Number(fileResp.headers.get("content-length") ?? "0");
      if (contentLength > MAX_EDIT_FILE_BYTES) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "File too large for editing (max 50 MB)" });
      }
      const fileBuffer = Buffer.from(await fileResp.arrayBuffer());
      if (fileBuffer.length > MAX_EDIT_FILE_BYTES) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "File too large for editing (max 50 MB)" });
      }

      // Upload to OneDrive via Python backend
      const uploadResp = await pyFetch(`${PYTHON_BACKEND_URL}/api/internal/onedrive/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file_content: fileBuffer.toString("base64"),
          file_name: item.title,
          mime_type: uploadMime,
          user_id: ctx.user.id,
        }),
        timeoutMs: PY_UPLOAD_TIMEOUT_MS,
      });
      if (!uploadResp.ok) {
        const err = await uploadResp.json().catch(() => ({}));
        auditLogger.log({
          eventType: "error",
          userId: ctx.user.id,
          metadata: { endpoint: "onedrive/openForEditing/upload", detail: (err as any).detail },
        });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "OneDrive upload failed" });
      }
      const uploadResult = await uploadResp.json() as { driveItemId: string; editUrl: string };

      // Create edit session record
      const [session] = await db
        .insert(onedriveEditSessions)
        .values({
          tenantId: ctx.tenantId,
          userId: ctx.user.id,
          libraryItemId: input.libraryItemId,
          driveItemId: uploadResult.driveItemId,
          editUrl: uploadResult.editUrl,
          originalSourceUrl: item.sourceUrl,
          status: "active",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        })
        .returning();

      auditLogger.log({
        eventType: "onedrive_edit",
        userId: ctx.user.id,
        metadata: { libraryItemId: input.libraryItemId, driveItemId: uploadResult.driveItemId, action: "open" },
      });

      return { sessionId: session.id, editUrl: session.editUrl, driveItemId: session.driveItemId };
    }),

  /**
   * Save back edited file from OneDrive to storage.
   */
  saveBack: protectedProcedure
    .use(editRateLimit)
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.tenantId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tenant context required" });

      // Fetch session
      const [session] = await db
        .select()
        .from(onedriveEditSessions)
        .where(
          and(
            eq(onedriveEditSessions.id, input.sessionId),
            eq(onedriveEditSessions.tenantId, ctx.tenantId),
            eq(onedriveEditSessions.userId, ctx.user.id),
            eq(onedriveEditSessions.status, "active"),
            sql`${onedriveEditSessions.expiresAt} > NOW()`,
          ),
        )
        .limit(1);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Active edit session not found" });

      // Get library item to determine export format (tenant + owner scoped)
      const [item] = await db
        .select()
        .from(libraryItems)
        .where(
          and(
            eq(libraryItems.id, session.libraryItemId),
            eq(libraryItems.tenantId, ctx.tenantId),
            eq(libraryItems.ownerUserId, ctx.user.id),
          ),
        )
        .limit(1);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Library item not found" });

      // Determine file extension from original source
      const sourceUrl = session.originalSourceUrl || item.sourceUrl || "";
      let ext = "docx";
      if (sourceUrl.endsWith(".xlsx")) ext = "xlsx";
      else if (sourceUrl.endsWith(".pptx")) ext = "pptx";

      // Download from OneDrive (Graph API returns the file in its native format)
      const token = createOneDriveToken(ctx.user.id);
      const exportResp = await pyFetch(`${PYTHON_BACKEND_URL}/api/internal/onedrive/export`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          drive_item_id: session.driveItemId,
          user_id: ctx.user.id,
        }),
        timeoutMs: PY_UPLOAD_TIMEOUT_MS,
      });
      if (!exportResp.ok) {
        const err = await exportResp.json().catch(() => ({}));
        auditLogger.log({
          eventType: "error",
          userId: ctx.user.id,
          metadata: { endpoint: "onedrive/saveBack/export", detail: (err as any).detail },
        });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "OneDrive export failed" });
      }
      const exportResult = await exportResp.json() as { content: string; size: number };
      if (exportResult.size > MAX_EDIT_FILE_BYTES) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Exported file exceeds maximum allowed size (50 MB)" });
      }
      const fileBuffer = Buffer.from(exportResult.content, "base64");

      // Determine MIME type
      const mimeMap: Record<string, string> = {
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      };
      const exportMime = mimeMap[ext] || "application/octet-stream";

      // Upload to storage with new key
      const timestamp = Date.now();
      const newKey = `library/${ctx.tenantId}/${session.libraryItemId}/edited-${timestamp}.${ext}`;
      await storagePut(newKey, fileBuffer, exportMime);

      // Update library item source URL (tenant + owner scoped)
      await db
        .update(libraryItems)
        .set({ sourceUrl: newKey, updatedAt: new Date() })
        .where(
          and(
            eq(libraryItems.id, session.libraryItemId),
            eq(libraryItems.tenantId, ctx.tenantId),
            eq(libraryItems.ownerUserId, ctx.user.id),
          ),
        );

      // Delete temp OneDrive file
      await pyFetch(`${PYTHON_BACKEND_URL}/api/internal/onedrive/files/${session.driveItemId}?user_id=${ctx.user.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {}); // best-effort cleanup

      // Mark session as saved_back (scoped to owner)
      await db
        .update(onedriveEditSessions)
        .set({ status: "saved_back", updatedAt: new Date() })
        .where(
          and(
            eq(onedriveEditSessions.id, session.id),
            eq(onedriveEditSessions.userId, ctx.user.id),
            eq(onedriveEditSessions.tenantId, ctx.tenantId),
          ),
        );

      return { success: true, newSourceUrl: newKey };
    }),

  /**
   * Discard edit session -- delete temp OneDrive file and mark session.
   */
  discardEditSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.tenantId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tenant context required" });

      const [session] = await db
        .select()
        .from(onedriveEditSessions)
        .where(
          and(
            eq(onedriveEditSessions.id, input.sessionId),
            eq(onedriveEditSessions.tenantId, ctx.tenantId),
            eq(onedriveEditSessions.userId, ctx.user.id),
            eq(onedriveEditSessions.status, "active"),
            sql`${onedriveEditSessions.expiresAt} > NOW()`,
          ),
        )
        .limit(1);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Active edit session not found" });

      // Delete temp OneDrive file
      const token = createOneDriveToken(ctx.user.id);
      await pyFetch(`${PYTHON_BACKEND_URL}/api/internal/onedrive/files/${session.driveItemId}?user_id=${ctx.user.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});

      // Mark session as discarded (scoped to owner)
      await db
        .update(onedriveEditSessions)
        .set({ status: "discarded", updatedAt: new Date() })
        .where(
          and(
            eq(onedriveEditSessions.id, session.id),
            eq(onedriveEditSessions.userId, ctx.user.id),
            eq(onedriveEditSessions.tenantId, ctx.tenantId),
          ),
        );

      return { success: true };
    }),

  /**
   * Get the user's OneDrive sync status and settings.
   */
  getSyncStatus: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.tenantId) return null;
    const [state] = await db
      .select()
      .from(onedriveSyncState)
      .where(
        and(
          eq(onedriveSyncState.tenantId, ctx.tenantId),
          eq(onedriveSyncState.userId, ctx.user.id),
        ),
      )
      .limit(1);
    if (!state) return null;
    return {
      indexingMode: state.indexingMode,
      folderSelections: state.folderSelections,
      fileTypeFilter: state.fileTypeFilter,
      maxFileSizeBytes: state.maxFileSizeBytes,
      filesTotal: state.filesTotal,
      filesProcessed: state.filesProcessed,
      lastSyncAt: state.lastSyncAt?.toISOString() ?? null,
      lastError: state.lastError,
      autoSyncEnabled: state.autoSyncEnabled,
    };
  }),

  /**
   * Start an initial sync or manual re-sync.
   */
  startSync: protectedProcedure.use(syncRateLimit).mutation(async ({ ctx }) => {
    if (!ctx.tenantId)
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tenant context required" });

    // Verify OneDrive connection
    const token = createOneDriveToken(ctx.user.id);
    const statusResp = await pyFetch(`${PYTHON_BACKEND_URL}/api/oauth/microsoft/onedrive/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!statusResp.ok)
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to check OneDrive connection" });
    const connStatus = (await statusResp.json()) as { status: string };
    if (connStatus.status !== "connected")
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Microsoft account not connected" });

    // Ensure sync state exists
    const [existing] = await db
      .select()
      .from(onedriveSyncState)
      .where(
        and(
          eq(onedriveSyncState.tenantId, ctx.tenantId),
          eq(onedriveSyncState.userId, ctx.user.id),
        ),
      )
      .limit(1);
    if (!existing) {
      await db.insert(onedriveSyncState).values({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        indexingMode: "all",
      });
    }

    // Trigger sync via Python backend
        const pyResp = await pyFetch(`${PYTHON_BACKEND_URL}/api/internal/onedrive/start-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-proxy-token": PROXY_TOKEN,
      },
      body: JSON.stringify({ user_id: ctx.user.id, tenant_id: ctx.tenantId }),
    });
    if (!pyResp.ok) {
      const err = await pyResp.json().catch(() => ({}));
      auditLogger.log({
        eventType: "error",
        userId: ctx.user.id,
        metadata: { endpoint: "onedrive/startSync", detail: (err as any).detail },
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to start sync",
      });
    }
    return { started: true };
  }),

  /**
   * Update sync settings (indexing mode, folder selections, file type filter).
   */
  updateSyncSettings: protectedProcedure
    .input(
      z.object({
        indexingMode: z.enum(["none", "selected_folders", "all_except", "all"]),
        folderSelections: z
          .array(z.object({ folderId: z.string(), folderName: z.string() }))
          .optional(),
        fileTypeFilter: z.array(z.string()).optional(),
        maxFileSizeBytes: z.number().positive().optional(),
        autoSyncEnabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.tenantId)
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tenant context required" });

      const [existing] = await db
        .select()
        .from(onedriveSyncState)
        .where(
          and(
            eq(onedriveSyncState.tenantId, ctx.tenantId),
            eq(onedriveSyncState.userId, ctx.user.id),
          ),
        )
        .limit(1);

      const values: any = {
        indexingMode: input.indexingMode as any,
        updatedAt: new Date(),
      };
      if (input.folderSelections !== undefined)
        values.folderSelections = input.folderSelections.map((f) => f.folderId);
      if (input.fileTypeFilter !== undefined) values.fileTypeFilter = input.fileTypeFilter;
      if (input.maxFileSizeBytes !== undefined) values.maxFileSizeBytes = input.maxFileSizeBytes;
      if (input.autoSyncEnabled !== undefined) values.autoSyncEnabled = input.autoSyncEnabled;

      if (existing) {
        await db
          .update(onedriveSyncState)
          .set(values)
          .where(
            and(
              eq(onedriveSyncState.id, existing.id),
              eq(onedriveSyncState.tenantId, ctx.tenantId),
              eq(onedriveSyncState.userId, ctx.user.id),
            ),
          );
      } else {
        await db.insert(onedriveSyncState).values({
          tenantId: ctx.tenantId,
          userId: ctx.user.id,
          ...values,
        });
      }

      return { success: true };
    }),

  /**
   * Estimate sync cost (count matching files and credit cost).
   */
  estimateSyncCost: protectedProcedure.use(syncRateLimit).mutation(async ({ ctx }) => {
    if (!ctx.tenantId)
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tenant context required" });

        const resp = await pyFetch(`${PYTHON_BACKEND_URL}/api/internal/onedrive/estimate-cost`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-proxy-token": PROXY_TOKEN,
      },
      body: JSON.stringify({ user_id: ctx.user.id, tenant_id: ctx.tenantId }),
    });
    if (!resp.ok) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to estimate cost" });
    }
    return resp.json() as Promise<{
      file_count: number;
      estimated_credits: number;
      estimated_size_mb: number;
    }>;
  }),

  /**
   * Dashboard overview: aggregated stats for at-a-glance display.
   */
  getDashboardOverview: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.tenantId) return null;

    // Sync state
    const [syncState] = await db
      .select()
      .from(onedriveSyncState)
      .where(
        and(
          eq(onedriveSyncState.tenantId, ctx.tenantId),
          eq(onedriveSyncState.userId, ctx.user.id),
        ),
      )
      .limit(1);

    // Count indexed files and chunks
    const [fileStats] = await db
      .select({
        fileCount: count(libraryItems.id),
      })
      .from(libraryItems)
      .where(
        and(
          eq(libraryItems.tenantId, ctx.tenantId),
          eq(libraryItems.ownerUserId, ctx.user.id),
          eq(libraryItems.source, "onedrive"),
          sql`${libraryItems.deletedAt} IS NULL`,
        ),
      );

    const [chunkStats] = await db
      .select({
        chunkCount: count(libraryChunks.id),
      })
      .from(libraryChunks)
      .innerJoin(libraryItems, eq(libraryChunks.libraryItemId, libraryItems.id))
      .where(
        and(
          eq(libraryItems.tenantId, ctx.tenantId),
          eq(libraryItems.ownerUserId, ctx.user.id),
          eq(libraryItems.source, "onedrive"),
          sql`${libraryItems.deletedAt} IS NULL`,
        ),
      );

    return {
      indexedFileCount: fileStats?.fileCount ?? 0,
      totalChunks: chunkStats?.chunkCount ?? 0,
      lastSyncAt: syncState?.lastSyncAt?.toISOString() ?? null,
      syncStatus: syncState?.lastError
        ? "error"
        : syncState?.filesTotal && syncState.filesProcessed !== null && syncState.filesProcessed < syncState.filesTotal
          ? "syncing"
          : "idle",
      indexingMode: syncState?.indexingMode ?? "none",
      autoSyncEnabled: syncState?.autoSyncEnabled ?? false,
      subscriptionExpiry: syncState?.subscriptionExpiry?.toISOString() ?? null,
      folderCount: (syncState?.folderSelections as string[] | null)?.length ?? 0,
      filesTotal: syncState?.filesTotal ?? 0,
      filesProcessed: syncState?.filesProcessed ?? 0,
      lastError: syncState?.lastError ?? null,
    };
  }),

  /**
   * Paginated list of indexed OneDrive files with chunk counts.
   */
  getIndexedFiles: protectedProcedure
    .use(searchRateLimit)
    .input(
      z.object({
        search: z.string().max(200).optional(),
        fileType: z.string().max(100).optional(),
        status: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.tenantId) return { files: [], total: 0, page: input.page, pageSize: input.pageSize };

      const conditions = [
        eq(libraryItems.tenantId, ctx.tenantId),
        eq(libraryItems.ownerUserId, ctx.user.id),
        eq(libraryItems.source, "onedrive"),
        sql`${libraryItems.deletedAt} IS NULL`,
      ];

      if (input.search) {
        const escapedSearch = input.search.replace(/[%_]/g, "\\$&");
        conditions.push(ilike(libraryItems.title, `%${escapedSearch}%`));
      }
      if (input.fileType && input.fileType !== "all") {
        const escapedType = input.fileType.replace(/[%_]/g, "\\$&");
        conditions.push(sql`${libraryItems.metadata}->>'driveMimeType' ILIKE ${"%" + escapedType + "%"}`);
      }
      if (input.status && input.status !== "all") {
        conditions.push(eq(libraryItems.status, input.status as any));
      }

      const offset = (input.page - 1) * input.pageSize;

      const [totalRow] = await db
        .select({ total: count(libraryItems.id) })
        .from(libraryItems)
        .where(and(...conditions));

      const files = await db
        .select({
          id: libraryItems.id,
          title: libraryItems.title,
          itemType: libraryItems.itemType,
          status: libraryItems.status,
          metadata: libraryItems.metadata,
          createdAt: libraryItems.createdAt,
          updatedAt: libraryItems.updatedAt,
          chunkCount: sql<number>`COALESCE((SELECT COUNT(*) FROM library_chunks WHERE library_item_id = ${libraryItems.id}), 0)`,
        })
        .from(libraryItems)
        .where(and(...conditions))
        .orderBy(desc(libraryItems.updatedAt))
        .limit(input.pageSize)
        .offset(offset);

      return {
        files: files.map((f: typeof files[number]) => {
          const meta = (f.metadata || {}) as Record<string, any>;
          return {
            id: f.id,
            name: f.title,
            mimeType: meta.driveMimeType || f.itemType,
            chunkCount: Number(f.chunkCount),
            syncStatus: f.status,
            driveItemId: meta.driveItemId || null,
            lastSyncedAt: f.updatedAt?.toISOString() ?? null,
          };
        }),
        total: totalRow?.total ?? 0,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  /**
   * Monthly credit usage breakdown for OneDrive operations.
   */
  getCreditUsageBreakdown: protectedProcedure
    .input(z.object({ monthKey: z.string().regex(/^\d{4}-\d{2}$/) }))
    .query(async ({ ctx, input }) => {
      const [year, month] = input.monthKey.split("-").map(Number);
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 1);

      const rows = await db
        .select({
          serviceTag: sql<string>`COALESCE(${creditTransactions.metadata}->>'service', 'unknown')`,
          txCount: count(creditTransactions.id),
          totalCredits: sum(sql`ABS(${creditTransactions.amount})`),
        })
        .from(creditTransactions)
        .where(
          and(
            eq(creditTransactions.userId, ctx.user.id),
            gte(creditTransactions.createdAt, startDate),
            lt(creditTransactions.createdAt, endDate),
          ),
        )
        .groupBy(sql`COALESCE(${creditTransactions.metadata}->>'service', 'unknown')`);

      const totalCredits = rows.reduce((s: number, r: typeof rows[number]) => s + Number(r.totalCredits ?? 0), 0);
      const totalOperations = rows.reduce((s: number, r: typeof rows[number]) => s + Number(r.txCount), 0);

      const dailyRows = await db
        .select({
          date: sql<string>`TO_CHAR(${creditTransactions.createdAt}, 'YYYY-MM-DD')`,
          credits: sum(sql`ABS(${creditTransactions.amount})`),
        })
        .from(creditTransactions)
        .where(
          and(
            eq(creditTransactions.userId, ctx.user.id),
            gte(creditTransactions.createdAt, startDate),
            lt(creditTransactions.createdAt, endDate),
          ),
        )
        .groupBy(sql`TO_CHAR(${creditTransactions.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`TO_CHAR(${creditTransactions.createdAt}, 'YYYY-MM-DD')`);

      const tagLabels: Record<string, string> = {
        "onedrive.index": "Initial indexing",
        "library.upload_index": "Upload indexing",
        "onedrive.reindex": "Re-indexing",
        "library.save_reindex": "Save re-index",
        "onedrive.mcp_read": "MCP file reads",
        "onedrive.mcp_sheet": "MCP sheet reads",
        "rag.semantic_search": "RAG semantic search",
        "rag.chat_context": "RAG chat context",
      };

      return {
        breakdown: rows.map((r: typeof rows[number]) => ({
          operation: tagLabels[r.serviceTag] || r.serviceTag,
          serviceTag: r.serviceTag,
          count: Number(r.txCount),
          totalCredits: Number(r.totalCredits ?? 0),
          percentOfTotal: totalCredits > 0 ? Math.round((Number(r.totalCredits ?? 0) / totalCredits) * 100) : 0,
        })),
        dailyUsage: dailyRows.map((d: typeof dailyRows[number]) => ({
          date: d.date,
          credits: Number(d.credits ?? 0),
        })),
        totalCredits,
        totalOperations,
      };
    }),

  /**
   * Recent credit activity for the dashboard.
   */
  getRecentActivity: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select()
        .from(creditTransactions)
        .where(
          and(
            eq(creditTransactions.userId, ctx.user.id),
            sql`(${creditTransactions.metadata}->>'service' LIKE 'library.%' OR ${creditTransactions.metadata}->>'service' LIKE 'rag.%' OR ${creditTransactions.metadata}->>'service' LIKE 'onedrive.%')`,
          ),
        )
        .orderBy(desc(creditTransactions.createdAt))
        .limit(input.limit);

      return rows.map((r: typeof rows[number]) => ({
        timestamp: r.createdAt.toISOString(),
        description: r.description || "Credit transaction",
        credits: r.amount,
        serviceTag: (r.metadata as any)?.service || null,
        metadata: r.metadata,
      }));
    }),

  /**
   * Browse files and folders in OneDrive for Document Management import.
   */
  listDriveItems: protectedProcedure
    .use(searchRateLimit)
    .input(
      z.object({
        parentFolderId: z.union([z.literal("root"), driveFolderIdSchema]).nullable().default(null),
        query: z.string().trim().max(200).optional(),
        pageToken: z.string().max(2048).optional(),
        pageSize: z.number().int().min(1).max(200).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const token = createOneDriveToken(ctx.user.id);
      const params = new URLSearchParams();
      params.set("user_id", String(ctx.user.id));
      params.set("page_size", String(input.pageSize));
      if (input.parentFolderId && input.parentFolderId !== "root") {
        params.set("parent_id", input.parentFolderId);
      }
      if (input.query) {
        params.set("q", input.query);
      }
      if (input.pageToken) {
        params.set("page_token", input.pageToken);
      }

      const resp = await pyFetch(
        `${PYTHON_BACKEND_URL}/api/internal/onedrive/list-items?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "x-proxy-token": PROXY_TOKEN,
          },
        },
      );

      if (!resp.ok) {
        const detail = await extractPyErrorMessage(resp);
        throw new TRPCError({
          code: resp.status === 401 ? "UNAUTHORIZED" : "INTERNAL_SERVER_ERROR",
          message: detail || "Failed to list OneDrive items",
        });
      }

      return resp.json() as Promise<{
        items: Array<{
          id: string;
          name: string;
          mimeType: string;
          kind: "folder" | "file";
          size: number;
          modifiedTime: string | null;
          webUrl: string | null;
          parentId: string | null;
        }>;
        nextPageToken: string | null;
      }>;
    }),

  /**
   * Fetch preview payload for a OneDrive file without importing.
   */
  getDriveFilePreview: protectedProcedure
    .use(readRateLimit)
    .input(z.object({ itemId: driveItemIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const token = createOneDriveToken(ctx.user.id);
            const pyResp = await pyFetch(
        `${PYTHON_BACKEND_URL}/api/internal/onedrive/import-file`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "x-proxy-token": PROXY_TOKEN,
          },
          body: JSON.stringify({
            item_id: input.itemId,
            user_id: ctx.user.id,
            purpose: "preview",
            max_bytes: 8 * 1024 * 1024,
          }),
          timeoutMs: PY_UPLOAD_TIMEOUT_MS,
        },
      );

      if (!pyResp.ok) {
        const detail = await extractPyErrorMessage(pyResp);
        throw new TRPCError({
          code:
            pyResp.status === 400
              ? "BAD_REQUEST"
              : pyResp.status === 401
                ? "UNAUTHORIZED"
                : pyResp.status === 404
                  ? "NOT_FOUND"
                  : "INTERNAL_SERVER_ERROR",
          message: detail || "Failed to preview OneDrive file",
        });
      }

      const payload = await pyResp.json() as {
        fileName: string;
        fileType: string;
        fileBase64: string;
        driveFile: Record<string, unknown>;
      };

      const normalizedType = payload.fileType.toLowerCase();
      const isTextLike = normalizedType.startsWith("text/")
        || normalizedType === "application/json"
        || normalizedType === "application/xml"
        || normalizedType === "application/x-ndjson"
        || normalizedType === "application/csv";

      let textPreview: string | null = null;
      if (isTextLike) {
        try {
          textPreview = Buffer.from(payload.fileBase64, "base64")
            .toString("utf8")
            .slice(0, 80_000);
        } catch {
          textPreview = null;
        }
      }

      return {
        ...payload,
        textPreview,
      };
    }),

  /**
   * Import a single OneDrive file into Document Management.
   */
  importDriveFile: protectedProcedure
    .use(readRateLimit)
    .input(z.object({ itemId: driveItemIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = resolveLibraryTenantId(ctx);
      assertLibraryEnabled(tenantId);

      const token = createOneDriveToken(ctx.user.id);
            const pyResp = await pyFetch(
        `${PYTHON_BACKEND_URL}/api/internal/onedrive/import-file`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "x-proxy-token": PROXY_TOKEN,
          },
          body: JSON.stringify({
            item_id: input.itemId,
            user_id: ctx.user.id,
            purpose: "import",
          }),
          timeoutMs: PY_UPLOAD_TIMEOUT_MS,
        },
      );

      if (!pyResp.ok) {
        const detail = await extractPyErrorMessage(pyResp);
        throw new TRPCError({
          code:
            pyResp.status === 400
              ? "BAD_REQUEST"
              : pyResp.status === 401
                ? "UNAUTHORIZED"
                : pyResp.status === 404
                  ? "NOT_FOUND"
                  : "INTERNAL_SERVER_ERROR",
          message: detail || "Failed to import OneDrive file",
        });
      }

      const payload = await pyResp.json() as {
        fileName: string;
        fileType: string;
        fileBase64: string;
        driveFile: Record<string, unknown>;
      };

      const actor = {
        userId: ctx.user.id,
        tenantId,
        role: ctx.user.role,
      };
      const uploadResult = await uploadLibraryFile(
        {
          fileName: payload.fileName,
          fileType: payload.fileType,
          fileBase64: payload.fileBase64,
          title: payload.fileName,
          visibility: "private",
        },
        actor,
      );

      return {
        ...uploadResult,
        driveFile: payload.driveFile,
      };
    }),

  /**
   * List OneDrive folders for folder picker (proxied via Python backend).
   */
  listDriveFolders: protectedProcedure
    .use(searchRateLimit)
    .input(z.object({ parentFolderId: z.string().nullable().default(null) }))
    .query(async ({ ctx, input }) => {
      const token = createOneDriveToken(ctx.user.id);
      const params = new URLSearchParams();
      if (input.parentFolderId) params.set("parent_id", input.parentFolderId);
      params.set("user_id", String(ctx.user.id));

      const resp = await pyFetch(
        `${PYTHON_BACKEND_URL}/api/internal/onedrive/list-folders?${params}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "x-proxy-token": PROXY_TOKEN,
          },
        },
      );
      if (!resp.ok) {
        return [] as Array<{ id: string; name: string; hasChildren: boolean }>;
      }
      return resp.json() as Promise<Array<{ id: string; name: string; hasChildren: boolean }>>;
    }),

  /**
   * Re-index a specific OneDrive file.
   */
  reindexFile: protectedProcedure
    .use(syncRateLimit)
    .input(z.object({ libraryItemId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.tenantId)
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tenant context required" });

      const [item] = await db
        .select()
        .from(libraryItems)
        .where(
          and(
            eq(libraryItems.id, input.libraryItemId),
            eq(libraryItems.tenantId, ctx.tenantId),
            eq(libraryItems.ownerUserId, ctx.user.id),
            eq(libraryItems.source, "onedrive"),
          ),
        )
        .limit(1);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });

      await db
        .update(libraryItems)
        .set({ status: "pending" as any, updatedAt: new Date() })
        .where(
          and(
            eq(libraryItems.id, input.libraryItemId),
            eq(libraryItems.tenantId, ctx.tenantId),
            eq(libraryItems.ownerUserId, ctx.user.id),
          ),
        );

      // Trigger single-file re-index via Python backend
      await pyFetch(`${PYTHON_BACKEND_URL}/api/internal/onedrive/reindex-item`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-proxy-token": PROXY_TOKEN,
        },
        body: JSON.stringify({ library_item_id: input.libraryItemId, user_id: ctx.user.id, tenant_id: ctx.tenantId }),
        timeoutMs: PY_TIMEOUT_MS,
      }).catch((err) => {
        console.warn("[oneDrive] reindex-item call failed:", err);
      });

      return { success: true };
    }),

  /**
   * Remove an OneDrive file from the index.
   */
  removeFromIndex: protectedProcedure
    .input(z.object({ libraryItemId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.tenantId)
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tenant context required" });

      const [item] = await db
        .select()
        .from(libraryItems)
        .where(
          and(
            eq(libraryItems.id, input.libraryItemId),
            eq(libraryItems.tenantId, ctx.tenantId),
            eq(libraryItems.ownerUserId, ctx.user.id),
            eq(libraryItems.source, "onedrive"),
          ),
        )
        .limit(1);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });

      // Soft delete (scoped to tenant + owner)
      await db
        .update(libraryItems)
        .set({ deletedAt: new Date(), deletedBy: ctx.user.id, updatedAt: new Date() })
        .where(
          and(
            eq(libraryItems.id, input.libraryItemId),
            eq(libraryItems.tenantId, ctx.tenantId),
            eq(libraryItems.ownerUserId, ctx.user.id),
          ),
        );

      // Clean up chunks
      await db
        .delete(libraryChunks)
        .where(eq(libraryChunks.libraryItemId, input.libraryItemId));

      // Clean up vectors via Python backend (best-effort)
      await pyFetch(`${PYTHON_BACKEND_URL}/api/internal/onedrive/cleanup-vectors`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-proxy-token": PROXY_TOKEN,
        },
        body: JSON.stringify({ library_item_id: input.libraryItemId, tenant_id: ctx.tenantId }),
      }).catch(() => {}); // best-effort

      return { success: true };
    }),
});
