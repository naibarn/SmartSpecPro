/**
 * Social Inbox service layer.
 *
 * Handles tenant-scoped conversation listing, message retrieval, outbound
 * send orchestration, and unread-counter maintenance for Meta Channels.
 */

import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";

import { socialConversations, socialMessages, socialPages } from "../../drizzle/schema";
import { getDb } from "../db";
import { auditLogger } from "./auditLogger";
import { getCacheClient } from "./redisClients";
import { getAppRuntimeConfig, getPreferredInternalToken } from "./appRuntimeConfig";

const PY_TIMEOUT_MS = 30_000;

export type SocialConversationStatus = "open" | "pending" | "closed" | "spam";

export interface ConversationListFilters {
  pageId?: number;
  status?: SocialConversationStatus;
  cursor?: string | null;
  limit?: number;
}

export interface MessageListFilters {
  cursor?: string | null;
  limit?: number;
}

export interface ConversationWithPage {
  conversation: typeof socialConversations.$inferSelect & {
    pageName: string | null;
    pageStatus: string | null;
    unreadCount: number;
    lastMessagePreview: string | null;
  };
  page: {
    id: number;
    tenantId: string;
    connectionId: number | null;
    providerPageId: string | null;
    pageName: string | null;
    status: string;
    encryptedPageAccessToken: null;
    tokenExpiresAt: Date | null;
    selectedForInbox: boolean;
    selectedForPublishing: boolean;
    selectedForModeration: boolean;
    aiActionMode: string;
    autoSendConfidenceThreshold: number;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
    updatedAt: Date;
  };
}

export interface ConversationWithMessages extends ConversationWithPage {
  recentMessages: Array<typeof socialMessages.$inferSelect>;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface OutboundMessageResult {
  id: number;
  providerMessageId: string | null;
}

async function callPythonBackend(
  path: string,
  options: { method: "GET" | "POST"; body?: unknown; timeoutMs?: number },
): Promise<Response> {
  const { method, body, timeoutMs = PY_TIMEOUT_MS } = options;
  const runtime = await getAppRuntimeConfig();
  const internalToken = await getPreferredInternalToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(`${runtime.pythonBackendUrl}${path}`, {
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

function parseCursorDate(cursor?: string | null): Date | null {
  if (!cursor) return null;
  const parsed = new Date(cursor);
  if (Number.isNaN(parsed.getTime())) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid cursor value",
    });
  }
  return parsed;
}

async function hydrateUnreadCounts(
  tenantId: string,
  rows: Array<{ id: number; unreadCount: number }>,
): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  if (rows.length === 0) return counts;

  try {
    const redis = getCacheClient();
    const keys = rows.map((row) => `social:unread:${tenantId}:${row.id}`);
    const values = await redis.mget(...keys);
    values.forEach((value, index) => {
      const row = rows[index];
      if (!row) return;
      const fallback = row.unreadCount ?? 0;
      if (value === null || value === undefined || value === "") {
        counts.set(row.id, fallback);
        return;
      }
      const parsed = Number.parseInt(value, 10);
      counts.set(row.id, Number.isFinite(parsed) ? parsed : fallback);
    });
    return counts;
  } catch {
    for (const row of rows) {
      counts.set(row.id, row.unreadCount ?? 0);
    }
    return counts;
  }
}

async function hydrateUnreadCount(
  tenantId: string,
  conversationId: number,
  fallback: number,
): Promise<number> {
  const counts = await hydrateUnreadCounts(tenantId, [{ id: conversationId, unreadCount: fallback }]);
  return counts.get(conversationId) ?? fallback;
}

async function loadConversationContext(conversationId: number, tenantId: string) {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }

  const rows = await db
    .select({
      id: socialConversations.id,
      tenantId: socialConversations.tenantId,
      pageId: socialConversations.pageId,
      providerConversationId: socialConversations.providerConversationId,
      channelType: socialConversations.channelType,
      customerExternalId: socialConversations.customerExternalId,
      customerDisplayName: socialConversations.customerDisplayName,
      status: socialConversations.status,
      assignedToUserId: socialConversations.assignedToUserId,
      priority: socialConversations.priority,
      lastMessageAt: socialConversations.lastMessageAt,
      lastInboundAt: socialConversations.lastInboundAt,
      lastOutboundAt: socialConversations.lastOutboundAt,
      unreadCount: socialConversations.unreadCount,
      labels: socialConversations.labels,
      createdAt: socialConversations.createdAt,
      updatedAt: socialConversations.updatedAt,
      lastMessagePreview: sql<string | null>`
        (
          select ${socialMessages.body}
          from ${socialMessages}
          where ${socialMessages.conversationId} = ${socialConversations.id}
            and ${socialMessages.tenantId} = ${socialConversations.tenantId}
          order by ${socialMessages.createdAt} desc, ${socialMessages.id} desc
          limit 1
        )
      `.as("lastMessagePreview"),
      pageName: socialPages.pageName,
      pageStatus: socialPages.status,
      pageTokenExpiresAt: socialPages.tokenExpiresAt,
      pageProviderPageId: socialPages.providerPageId,
      pageConnectionId: socialPages.connectionId,
    })
    .from(socialConversations)
    .leftJoin(socialPages, eq(socialConversations.pageId, socialPages.id))
    .where(and(eq(socialConversations.id, conversationId), eq(socialConversations.tenantId, tenantId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Conversation not found",
    });
  }

  const unreadCount = await hydrateUnreadCount(tenantId, conversationId, Number(row.unreadCount ?? 0));

  return {
    conversation: {
      id: row.id,
      tenantId: row.tenantId,
      pageId: row.pageId,
      providerConversationId: row.providerConversationId,
      channelType: row.channelType,
      customerExternalId: row.customerExternalId,
      customerDisplayName: row.customerDisplayName,
      status: row.status,
      assignedToUserId: row.assignedToUserId,
      priority: row.priority,
      lastMessageAt: row.lastMessageAt,
      lastInboundAt: row.lastInboundAt,
      lastOutboundAt: row.lastOutboundAt,
      unreadCount,
      labels: row.labels ?? [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastMessagePreview: row.lastMessagePreview ?? null,
      pageName: row.pageName ?? null,
      pageStatus: row.pageStatus ?? null,
    },
    page: {
      id: row.pageId,
      tenantId: row.tenantId,
      connectionId: row.pageConnectionId,
      providerPageId: row.pageProviderPageId,
      pageName: row.pageName ?? null,
      status: row.pageStatus ?? "active",
      encryptedPageAccessToken: null,
      tokenExpiresAt: row.pageTokenExpiresAt,
      selectedForInbox: true,
      selectedForPublishing: true,
      selectedForModeration: false,
      aiActionMode: "draft_only",
      autoSendConfidenceThreshold: 0.95,
      metadata: null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
  };
}

export async function listConversationsByTenant(
  tenantId: string,
  filters: ConversationListFilters,
): Promise<PaginatedResult<ConversationWithPage["conversation"]>> {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }

  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 50);
  const cursorDate = parseCursorDate(filters.cursor);
  const conditions = [eq(socialConversations.tenantId, tenantId)];
  if (filters.pageId) {
    conditions.push(eq(socialConversations.pageId, filters.pageId));
  }
  if (filters.status) {
    conditions.push(eq(socialConversations.status, filters.status));
  }
  if (cursorDate) {
    conditions.push(lt(socialConversations.lastMessageAt, cursorDate));
  }

  const rows = await db
    .select({
      id: socialConversations.id,
      tenantId: socialConversations.tenantId,
      pageId: socialConversations.pageId,
      providerConversationId: socialConversations.providerConversationId,
      channelType: socialConversations.channelType,
      customerExternalId: socialConversations.customerExternalId,
      customerDisplayName: socialConversations.customerDisplayName,
      status: socialConversations.status,
      assignedToUserId: socialConversations.assignedToUserId,
      priority: socialConversations.priority,
      lastMessageAt: socialConversations.lastMessageAt,
      lastInboundAt: socialConversations.lastInboundAt,
      lastOutboundAt: socialConversations.lastOutboundAt,
      unreadCount: socialConversations.unreadCount,
      labels: socialConversations.labels,
      createdAt: socialConversations.createdAt,
      updatedAt: socialConversations.updatedAt,
      pageName: socialPages.pageName,
      pageStatus: socialPages.status,
      lastMessagePreview: sql<string | null>`
        (
          select ${socialMessages.body}
          from ${socialMessages}
          where ${socialMessages.conversationId} = ${socialConversations.id}
            and ${socialMessages.tenantId} = ${socialConversations.tenantId}
          order by ${socialMessages.createdAt} desc, ${socialMessages.id} desc
          limit 1
        )
      `.as("lastMessagePreview"),
    })
    .from(socialConversations)
    .leftJoin(socialPages, eq(socialConversations.pageId, socialPages.id))
    .where(and(...conditions))
    .orderBy(desc(socialConversations.lastMessageAt), desc(socialConversations.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const unreadCounts = await hydrateUnreadCounts(
    tenantId,
    pageRows.map((row) => ({ id: row.id, unreadCount: Number(row.unreadCount ?? 0) })),
  );

  const items = pageRows.map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    pageId: row.pageId,
    providerConversationId: row.providerConversationId,
    channelType: row.channelType,
    customerExternalId: row.customerExternalId,
    customerDisplayName: row.customerDisplayName,
    status: row.status,
    assignedToUserId: row.assignedToUserId,
    priority: row.priority,
    lastMessageAt: row.lastMessageAt,
    lastInboundAt: row.lastInboundAt,
    lastOutboundAt: row.lastOutboundAt,
    unreadCount: unreadCounts.get(row.id) ?? Number(row.unreadCount ?? 0),
    labels: row.labels ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastMessagePreview: row.lastMessagePreview ?? null,
    pageName: row.pageName ?? null,
    pageStatus: row.pageStatus ?? null,
  }));

  return {
    items,
    nextCursor: hasMore && pageRows.length > 0 ? pageRows[pageRows.length - 1].lastMessageAt?.toISOString() ?? null : null,
    hasMore,
  };
}

export async function getConversationWithRecentMessages(
  conversationId: number,
  tenantId: string,
  recentLimit = 20,
): Promise<ConversationWithMessages> {
  const context = await loadConversationContext(conversationId, tenantId);
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }

  const recentMessages = await db
    .select()
    .from(socialMessages)
    .where(and(eq(socialMessages.conversationId, conversationId), eq(socialMessages.tenantId, tenantId)))
    .orderBy(desc(socialMessages.createdAt), desc(socialMessages.id))
    .limit(recentLimit);

  return {
    ...context,
    recentMessages: [...recentMessages].reverse(),
  };
}

export async function getMessagesByConversation(
  conversationId: number,
  tenantId: string,
  filters: MessageListFilters,
): Promise<PaginatedResult<typeof socialMessages.$inferSelect>> {
  await loadConversationContext(conversationId, tenantId);

  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }

  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);
  const cursorDate = parseCursorDate(filters.cursor);
  const conditions = [eq(socialMessages.conversationId, conversationId), eq(socialMessages.tenantId, tenantId)];
  if (cursorDate) {
    conditions.push(gt(socialMessages.createdAt, cursorDate));
  }

  const rows = await db
    .select()
    .from(socialMessages)
    .where(and(...conditions))
    .orderBy(asc(socialMessages.createdAt), asc(socialMessages.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return {
    items,
    hasMore,
    nextCursor: hasMore && items.length > 0 ? items[items.length - 1].createdAt?.toISOString() ?? null : null,
  };
}

export async function getPageForConversation(
  conversationId: number,
  tenantId: string,
): Promise<ConversationWithPage> {
  const context = await loadConversationContext(conversationId, tenantId);
  const page = context.page;

  if (!page || page.status !== "active") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Conversation page is not active",
    });
  }

  if (page.tokenExpiresAt && page.tokenExpiresAt.getTime() <= Date.now()) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Conversation page token has expired",
    });
  }

  return context;
}

export async function createOutboundMessage(params: {
  tenantId: string;
  conversationId: number;
  pageId: number;
  userId: number;
  body: string;
  providerMessageId?: string | null;
}): Promise<OutboundMessageResult> {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }

  const now = new Date();
  const inserted = await db
    .insert(socialMessages)
    .values({
      tenantId: params.tenantId,
      conversationId: params.conversationId,
      pageId: params.pageId,
      providerMessageId: params.providerMessageId ?? null,
      direction: "outbound",
      senderType: "agent",
      senderUserId: params.userId,
      messageType: "text",
      body: params.body,
      deliveryStatus: "sent",
      sentAt: now,
      createdAt: now,
    })
    .returning({ id: socialMessages.id, providerMessageId: socialMessages.providerMessageId });

  const row = inserted[0];
  if (!row) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to store outbound message",
    });
  }

  await db
    .update(socialConversations)
    .set({
      lastMessageAt: now,
      lastOutboundAt: now,
      updatedAt: now,
    })
    .where(and(eq(socialConversations.id, params.conversationId), eq(socialConversations.tenantId, params.tenantId)));

  return {
    id: row.id,
    providerMessageId: row.providerMessageId ?? params.providerMessageId ?? null,
  };
}

export async function resetConversationUnreadCount(conversationId: number, tenantId: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }

  await db
    .update(socialConversations)
    .set({
      unreadCount: 0,
      updatedAt: new Date(),
    })
    .where(and(eq(socialConversations.id, conversationId), eq(socialConversations.tenantId, tenantId)));

  try {
    const redis = getCacheClient();
    await redis.set(`social:unread:${tenantId}:${conversationId}`, "0");
  } catch {
    // Redis is best-effort for unread counters.
  }
}

export async function updateConversationStatus(
  conversationId: number,
  tenantId: string,
  status: SocialConversationStatus,
): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }

  await db
    .update(socialConversations)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(and(eq(socialConversations.id, conversationId), eq(socialConversations.tenantId, tenantId)));
}

export async function sendMessageViaPythonBackend(
  pageId: number,
  recipientPsid: string,
  text: string,
): Promise<{ providerMessageId: string | null; raw: Record<string, unknown> }> {
  const response = await callPythonBackend("/api/internal/meta/messages/send", {
    method: "POST",
    body: {
      page_id: pageId,
      recipient_id: recipientPsid,
      text,
    },
  });

  if (!response.ok) {
    const detail = await readPythonError(response);
    throw new Error(detail || "Failed to send Meta message");
  }

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const providerMessageId =
    (typeof payload.provider_message_id === "string" && payload.provider_message_id) ||
    (typeof payload.message_id === "string" && payload.message_id) ||
    (typeof payload.id === "string" && payload.id) ||
    null;

  return {
    providerMessageId,
    raw: payload,
  };
}

export async function sendReplyToConversation(params: {
  tenantId: string;
  userId: number;
  conversationId: number;
  body: string;
}): Promise<{ success: true; messageId: number; providerMessageId: string | null }> {
  try {
    const pageContext = await getPageForConversation(params.conversationId, params.tenantId);
    const sendResult = await sendMessageViaPythonBackend(
      pageContext.page.id,
      pageContext.conversation.customerExternalId,
      params.body,
    );

    const outbound = await createOutboundMessage({
      tenantId: params.tenantId,
      conversationId: params.conversationId,
      pageId: pageContext.page.id,
      userId: params.userId,
      body: params.body,
      providerMessageId: sendResult.providerMessageId,
    });

    await resetConversationUnreadCount(params.conversationId, params.tenantId);

    auditLogger.log({
      eventType: "social_inbox_reply_sent",
      userId: params.userId,
      metadata: {
        tenantId: params.tenantId,
        conversationId: params.conversationId,
        pageId: pageContext.page.id,
        providerMessageId: outbound.providerMessageId,
        messageId: outbound.id,
      },
    });

    return {
      success: true,
      messageId: outbound.id,
      providerMessageId: outbound.providerMessageId,
    };
  } catch (error) {
    await logInboundReplyFailure({
      tenantId: params.tenantId,
      conversationId: params.conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function logInboundReplyFailure(metadata: Record<string, unknown>): Promise<void> {
  auditLogger.log({
    eventType: "social_inbox_reply_failed",
    metadata,
  });
}
