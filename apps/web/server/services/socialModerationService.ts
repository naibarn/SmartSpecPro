/**
 * Social moderation service layer.
 *
 * Lists Meta comments and proxies reply/hide/delete actions through the
 * Python backend while enforcing tenant and page access rules.
 */

import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, lt } from "drizzle-orm";

import { socialComments, socialCommentActions, socialPages, socialProviderConnections } from "../../drizzle/schema";
import { type DrizzleDB, getDb } from "../db";
import { decrypt } from "./crypto";
import { auditLogger } from "./auditLogger";
import { verifyPageAccess } from "./socialAccessService";

const PY_TIMEOUT_MS = 15_000;

export type SocialModerationCommentStatus = "visible" | "hidden" | "deleted";

export interface SocialModerationPageSummary {
  id: number;
  label: string;
  status: string;
  pageName: string | null;
  pageCategory: string | null;
  providerPageId: string;
}

export interface SocialModerationCommentSummary {
  id: number;
  pageId: number;
  pageName: string | null;
  providerCommentId: string | null;
  providerObjectId: string | null;
  authorDisplayName: string | null;
  body: string | null;
  status: SocialModerationCommentStatus;
  lastAction: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SocialModerationListResponse {
  items: SocialModerationCommentSummary[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface CommentContext {
  comment: {
    id: number;
    tenantId: string;
    pageId: number;
    providerCommentId: string | null;
    providerObjectId: string | null;
    authorDisplayName: string | null;
    body: string | null;
    status: SocialModerationCommentStatus | string;
    lastAction: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  page: {
    id: number;
    tenantId: string;
    providerPageId: string;
    pageName: string | null;
    pageCategory: string | null;
    status: string;
    selectedForModeration: boolean;
    encryptedPageAccessToken: string | null;
    tokenExpiresAt: Date | null;
  };
}

function normalizeCommentStatus(status: string | null | undefined): SocialModerationCommentStatus {
  switch (status) {
    case "hidden":
    case "deleted":
      return status;
    case "visible":
    default:
      return "visible";
  }
}

function toSummaryRow(row: {
  id: number;
  pageId: number;
  pageName: string | null;
  providerCommentId: string | null;
  providerObjectId: string | null;
  authorDisplayName: string | null;
  body: string | null;
  status: string;
  lastAction: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SocialModerationCommentSummary {
  return {
    id: row.id,
    pageId: row.pageId,
    pageName: row.pageName,
    providerCommentId: row.providerCommentId,
    providerObjectId: row.providerObjectId,
    authorDisplayName: row.authorDisplayName,
    body: row.body,
    status: normalizeCommentStatus(row.status),
    lastAction: row.lastAction,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseCursorDate(cursor?: string | null): Date | null {
  if (!cursor) return null;
  const parsed = new Date(cursor);
  if (Number.isNaN(parsed.getTime())) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid cursor value" });
  }
  return parsed;
}

async function resolveDb(db?: DrizzleDB | null): Promise<DrizzleDB> {
  return db ?? getDb();
}

async function callPythonBackend(
  path: string,
  options: { method: "GET" | "POST"; body?: unknown; timeoutMs?: number },
): Promise<Response> {
  const { method, body, timeoutMs = PY_TIMEOUT_MS } = options;
  const pythonBackendUrl = (process.env.PYTHON_BACKEND_URL || "http://localhost:8000").replace(/\/+$/, "");
  const internalToken = process.env.SMARTSPEC_WEB_GATEWAY_TOKEN || process.env.SMARTSPEC_PROXY_TOKEN || "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(`${pythonBackendUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(internalToken ? { "x-internal-token": internalToken } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readPythonError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") return data.detail;
    if (typeof data?.message === "string") return data.message;
    return JSON.stringify(data);
  } catch {
    return res.statusText || "Python backend request failed";
  }
}

function extractProviderCommentId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;

  for (const key of ["provider_comment_id", "providerCommentId", "comment_id", "commentId", "id"]) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  const result = data.result;
  if (result && typeof result === "object") {
    const nested = extractProviderCommentId(result);
    if (nested) return nested;
  }

  return null;
}

async function loadCommentContext(
  commentId: number,
  tenantId: string,
  userId: number,
): Promise<CommentContext> {
  const db = await resolveDb();
  const rows = await db
    .select({
      id: socialComments.id,
      tenantId: socialComments.tenantId,
      pageId: socialComments.pageId,
      providerCommentId: socialComments.providerCommentId,
      providerObjectId: socialComments.providerObjectId,
      authorDisplayName: socialComments.authorDisplayName,
      body: socialComments.body,
      status: socialComments.status,
      lastAction: socialComments.lastAction,
      createdAt: socialComments.createdAt,
      updatedAt: socialComments.updatedAt,
      pageTenantId: socialPages.tenantId,
      providerPageId: socialPages.providerPageId,
      pageName: socialPages.pageName,
      pageCategory: socialPages.pageCategory,
      pageStatus: socialPages.status,
      selectedForModeration: socialPages.selectedForModeration,
      encryptedPageAccessToken: socialPages.encryptedPageAccessToken,
      tokenExpiresAt: socialPages.tokenExpiresAt,
    })
    .from(socialComments)
    .innerJoin(socialPages, eq(socialComments.pageId, socialPages.id))
    .innerJoin(socialProviderConnections, eq(socialPages.connectionId, socialProviderConnections.id))
    .where(
      and(
        eq(socialComments.id, commentId),
        eq(socialComments.tenantId, tenantId),
        eq(socialPages.tenantId, tenantId),
        eq(socialProviderConnections.tenantId, tenantId),
        eq(socialProviderConnections.userId, userId),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Comment not found",
    });
  }

  return {
    comment: {
      id: row.id,
      tenantId: row.tenantId,
      pageId: row.pageId,
      providerCommentId: row.providerCommentId,
      providerObjectId: row.providerObjectId,
      authorDisplayName: row.authorDisplayName,
      body: row.body,
      status: normalizeCommentStatus(row.status),
      lastAction: row.lastAction,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    page: {
      id: row.pageId,
      tenantId: row.pageTenantId,
      providerPageId: row.providerPageId,
      pageName: row.pageName,
      pageCategory: row.pageCategory,
      status: row.pageStatus,
      selectedForModeration: row.selectedForModeration,
      encryptedPageAccessToken: row.encryptedPageAccessToken,
      tokenExpiresAt: row.tokenExpiresAt,
    },
  };
}

export async function listModerationPages(tenantId: string, userId: number): Promise<SocialModerationPageSummary[]> {
  const db = await resolveDb();
  const rows = await db
    .select({
      id: socialPages.id,
      providerPageId: socialPages.providerPageId,
      pageName: socialPages.pageName,
      pageCategory: socialPages.pageCategory,
      status: socialPages.status,
    })
    .from(socialPages)
    .innerJoin(socialProviderConnections, eq(socialPages.connectionId, socialProviderConnections.id))
    .where(
      and(
        eq(socialPages.tenantId, tenantId),
        eq(socialProviderConnections.tenantId, tenantId),
        eq(socialProviderConnections.userId, userId),
        eq(socialPages.selectedForModeration, true),
        eq(socialPages.status, "active"),
      ),
    )
    .orderBy(asc(socialPages.pageName), asc(socialPages.id));

  return rows.map((row) => ({
    id: row.id,
    label: row.pageName || `Page ${row.providerPageId}`,
    status: row.status,
    pageName: row.pageName,
    pageCategory: row.pageCategory,
    providerPageId: row.providerPageId,
  }));
}

export async function listModerationComments(params: {
  tenantId: string;
  userId: number;
  pageId: number;
  cursor?: string | null;
  limit: number;
}): Promise<SocialModerationListResponse> {
  const page = await verifyPageAccess(params.pageId, params.userId, params.tenantId, params.tenantId);
  if (page.status !== "active") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Page is not active",
    });
  }
  if (!page.selectedForModeration) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Page is not enabled for moderation",
    });
  }

  const db = await resolveDb();
  const cursorDate = parseCursorDate(params.cursor);
  const limit = Math.min(Math.max(params.limit, 1), 50);
  const conditions = [
    eq(socialComments.tenantId, params.tenantId),
    eq(socialComments.pageId, params.pageId),
  ];
  if (cursorDate) {
    conditions.push(lt(socialComments.createdAt, cursorDate));
  }

  const rows = await db
    .select({
      id: socialComments.id,
      pageId: socialComments.pageId,
      pageName: socialPages.pageName,
      providerCommentId: socialComments.providerCommentId,
      providerObjectId: socialComments.providerObjectId,
      authorDisplayName: socialComments.authorDisplayName,
      body: socialComments.body,
      status: socialComments.status,
      lastAction: socialComments.lastAction,
      createdAt: socialComments.createdAt,
      updatedAt: socialComments.updatedAt,
    })
    .from(socialComments)
    .innerJoin(socialPages, eq(socialComments.pageId, socialPages.id))
    .where(and(...conditions))
    .orderBy(desc(socialComments.createdAt), desc(socialComments.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(toSummaryRow);
  return {
    items,
    nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.createdAt.toISOString() : null,
    hasMore,
  };
}

async function persistCommentAction(params: {
  commentId: number;
  userId: number;
  actionType: "reply" | "hide" | "delete";
  providerResult?: Record<string, unknown>;
  status?: string;
  errorMessage?: string | null;
}): Promise<void> {
  const db = await resolveDb();
  await db.insert(socialCommentActions).values({
    commentId: params.commentId,
    actionType: params.actionType,
    performedByUserId: params.userId,
    performedBySystem: false,
    providerResult: params.providerResult ?? null,
    status: params.status ?? "completed",
    errorMessage: params.errorMessage ?? null,
  });
}

export async function replyToModerationComment(params: {
  tenantId: string;
  userId: number;
  commentId: number;
  body: string;
}): Promise<{ success: true; commentId: number; providerCommentId: string | null }> {
  const context = await loadCommentContext(params.commentId, params.tenantId, params.userId);
  if (context.page.status !== "active") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Page is not active",
    });
  }
  if (!context.page.selectedForModeration) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Page is not enabled for moderation",
    });
  }
  if (!context.comment.providerCommentId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Comment does not have a provider id",
    });
  }
  if (!context.page.encryptedPageAccessToken) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Page access token is missing",
    });
  }

  let pageAccessToken: string;
  try {
    pageAccessToken = decrypt(context.page.encryptedPageAccessToken);
  } catch (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to decrypt page token: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  const response = await callPythonBackend("/api/internal/meta/comments/reply", {
    method: "POST",
    body: {
      object_id: context.comment.providerCommentId,
      message: params.body,
      page_access_token: pageAccessToken,
      page_id: context.page.providerPageId,
    },
  });

  if (!response.ok) {
    const detail = await readPythonError(response);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: detail || "Failed to reply to comment",
    });
  }

  const result = await response.json().catch(() => null);
  const providerCommentId = extractProviderCommentId(result);
  const db = await resolveDb();
  await db
    .update(socialComments)
    .set({
      lastAction: "reply",
      updatedAt: new Date(),
    })
    .where(eq(socialComments.id, params.commentId));

  await persistCommentAction({
    commentId: params.commentId,
    userId: params.userId,
    actionType: "reply",
    providerResult: result && typeof result === "object" ? (result as Record<string, unknown>) : undefined,
  });

  auditLogger.log({
    eventType: "social_comment_replied",
    userId: params.userId,
    metadata: {
      tenantId: params.tenantId,
      commentId: params.commentId,
      pageId: context.page.id,
      providerCommentId,
    },
  });

  return { success: true, commentId: params.commentId, providerCommentId };
}

async function mutateCommentStatus<TStatus extends "hidden" | "deleted">(params: {
  tenantId: string;
  userId: number;
  commentId: number;
  actionType: "hide" | "delete";
  status: TStatus;
  endpoint: string;
  auditEvent: "social_comment_hidden" | "social_comment_deleted";
}): Promise<{ success: true; commentId: number; status: TStatus }> {
  const context = await loadCommentContext(params.commentId, params.tenantId, params.userId);
  if (context.page.status !== "active") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Page is not active",
    });
  }
  if (!context.page.selectedForModeration) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Page is not enabled for moderation",
    });
  }
  if (!context.comment.providerCommentId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Comment does not have a provider id",
    });
  }
  if (!context.page.encryptedPageAccessToken) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Page access token is missing",
    });
  }

  let pageAccessToken: string;
  try {
    pageAccessToken = decrypt(context.page.encryptedPageAccessToken);
  } catch (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to decrypt page token: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  const response = await callPythonBackend(params.endpoint, {
    method: "POST",
    body: {
      comment_id: context.comment.providerCommentId,
      page_access_token: pageAccessToken,
      page_id: context.page.providerPageId,
    },
  });

  if (!response.ok) {
    const detail = await readPythonError(response);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: detail || `Failed to ${params.actionType} comment`,
    });
  }

  const result = await response.json().catch(() => null);
  const db = await resolveDb();
  await db
    .update(socialComments)
    .set({
      status: params.status,
      lastAction: params.actionType,
      updatedAt: new Date(),
    })
    .where(eq(socialComments.id, params.commentId));

  await persistCommentAction({
    commentId: params.commentId,
    userId: params.userId,
    actionType: params.actionType,
    providerResult: result && typeof result === "object" ? (result as Record<string, unknown>) : undefined,
  });

  auditLogger.log({
    eventType: params.auditEvent,
    userId: params.userId,
    metadata: {
      tenantId: params.tenantId,
      commentId: params.commentId,
      pageId: context.page.id,
      providerCommentId: context.comment.providerCommentId,
    },
  });

  return { success: true, commentId: params.commentId, status: params.status };
}

export async function hideModerationComment(params: {
  tenantId: string;
  userId: number;
  commentId: number;
}): Promise<{ success: true; commentId: number; status: "hidden" }> {
  return mutateCommentStatus({
    tenantId: params.tenantId,
    userId: params.userId,
    commentId: params.commentId,
    actionType: "hide",
    status: "hidden",
    endpoint: "/api/internal/meta/comments/hide",
    auditEvent: "social_comment_hidden",
  });
}

export async function deleteModerationComment(params: {
  tenantId: string;
  userId: number;
  commentId: number;
}): Promise<{ success: true; commentId: number; status: "deleted" }> {
  return mutateCommentStatus({
    tenantId: params.tenantId,
    userId: params.userId,
    commentId: params.commentId,
    actionType: "delete",
    status: "deleted",
    endpoint: "/api/internal/meta/comments/delete",
    auditEvent: "social_comment_deleted",
  });
}
