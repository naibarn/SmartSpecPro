import crypto from "node:crypto";
import { isIP } from "node:net";
import { Router } from "express";
import type { Express, Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { ENV } from "../_core/env";
import { getDb } from "../db";
import {
  agencyAgentTools,
  agencyAgents,
  agencies,
  socialComments,
  socialConversations,
  socialPages,
} from "../../drizzle/schema";
import { decrypt } from "../services/crypto";
import {
  listConversationsByTenant,
  resetConversationUnreadCount,
  sendMessageViaPythonBackend,
} from "../services/socialInboxService";

const INTERNAL_TOOL_ACTIONS = ["read_inbox", "send_reply", "publish_post", "read_comments", "reply_comment"] as const;
type InternalToolAction = (typeof INTERNAL_TOOL_ACTIONS)[number];

const InternalSocialToolSchema = z.object({
  action: z.enum(INTERNAL_TOOL_ACTIONS),
  pageId: z.number().int().positive(),
  conversationId: z.number().int().positive().optional(),
  messageBody: z.string().trim().min(1).optional(),
  contentText: z.string().trim().min(1).optional(),
  contentLink: z.string().trim().min(1).optional(),
  commentId: z.number().int().positive().optional(),
  query: z.string().trim().optional(),
});

interface ToolConfigRow {
  tenantId: string;
  toolConfig: Record<string, unknown>;
}

interface PageRow {
  id: number;
  tenantId: string;
  providerPageId: string;
  pageName: string | null;
  status: string;
  selectedForInbox: boolean;
  selectedForPublishing: boolean;
  selectedForModeration: boolean;
  encryptedPageAccessToken: string | null;
  tokenExpiresAt: Date | null;
}

interface CommentRow {
  id: number;
  tenantId: string;
  pageId: number;
  providerCommentId: string | null;
  providerObjectId: string | null;
  authorDisplayName: string | null;
  body: string | null;
  status: string;
  lastAction: string | null;
  createdAt: Date;
  updatedAt: Date;
}

class ToolExecutionError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ToolExecutionError";
  }
}

function verifyInternalToken(req: Request): boolean {
  const expected = ENV.webGatewayToken;
  if (!expected) return false;
  const token = req.headers["x-internal-token"] as string | undefined;
  if (!token) return false;
  try {
    const tokenHash = crypto.createHash("sha256").update(token).digest();
    const expectedHash = crypto.createHash("sha256").update(expected).digest();
    return crypto.timingSafeEqual(tokenHash, expectedHash);
  } catch {
    return false;
  }
}

function getHeaderValue(req: Request, name: string): string | null {
  const value = req.headers[name.toLowerCase()] ?? req.headers[name];
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim();
}

function normalizeRequestBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") {
    return {};
  }
  const record = { ...(body as Record<string, unknown>) };
  if (typeof record.query === "string") {
    try {
      const parsed = JSON.parse(record.query);
      if (parsed && typeof parsed === "object") {
        return { ...record, ...(parsed as Record<string, unknown>) };
      }
    } catch {
      // Leave as-is if query is not JSON.
    }
  }
  return record;
}

function isSafePrivateAddress(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "::1") {
    return false;
  }
  const ipVersion = isIP(hostname);
  if (ipVersion === 4) {
    const octets = hostname.split(".").map((segment) => Number.parseInt(segment, 10));
    if (octets.length !== 4 || octets.some((segment) => Number.isNaN(segment))) {
      return false;
    }
    const [a, b] = octets;
    if (a === 10) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 127) return false;
    if (a === 169 && b === 254) return false;
  } else if (ipVersion === 6) {
    const lower = hostname.toLowerCase();
    if (lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc00:") || lower.startsWith("fd00:")) {
      return false;
    }
  }
  return true;
}

function validateHttpsLink(rawLink: string): string | null {
  try {
    const parsed = new URL(rawLink);
    if (parsed.protocol !== "https:") {
      return "Only HTTPS content links are allowed";
    }
    const blockedHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "169.254.169.254", "metadata.google.internal"]);
    const hostname = parsed.hostname.toLowerCase();
    if (blockedHosts.has(hostname)) {
      return "Content link host is blocked";
    }
    if (!isSafePrivateAddress(parsed.hostname)) {
      return "Content link points to a private or loopback address";
    }
    return null;
  } catch {
    return "Content link must be a valid HTTPS URL";
  }
}

async function loadToolConfig(agentId: string, toolId: string): Promise<ToolConfigRow> {
  const db = await getDb();
  if (!db) {
    throw new ToolExecutionError(503, "Database not available");
  }

  const rows = await db
    .select({
      tenantId: agencies.tenantId,
      toolConfig: agencyAgentTools.toolConfig,
    })
    .from(agencyAgentTools)
    .innerJoin(agencyAgents, eq(agencyAgentTools.agentId, agencyAgents.id))
    .innerJoin(agencies, eq(agencyAgents.agencyId, agencies.id))
    .where(and(eq(agencyAgentTools.agentId, agentId), eq(agencyAgentTools.toolId, toolId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new ToolExecutionError(404, "Tool configuration not found");
  }

  return {
    tenantId: row.tenantId,
    toolConfig: (row.toolConfig as Record<string, unknown>) ?? {},
  };
}

async function loadPage(pageId: number): Promise<PageRow> {
  const db = await getDb();
  if (!db) {
    throw new ToolExecutionError(503, "Database not available");
  }

  const rows = await db
    .select({
      id: socialPages.id,
      tenantId: socialPages.tenantId,
      providerPageId: socialPages.providerPageId,
      pageName: socialPages.pageName,
      status: socialPages.status,
      selectedForInbox: socialPages.selectedForInbox,
      selectedForPublishing: socialPages.selectedForPublishing,
      selectedForModeration: socialPages.selectedForModeration,
      encryptedPageAccessToken: socialPages.encryptedPageAccessToken,
      tokenExpiresAt: socialPages.tokenExpiresAt,
    })
    .from(socialPages)
    .where(eq(socialPages.id, pageId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new ToolExecutionError(404, "Page not found");
  }

  return row as PageRow;
}

async function loadComment(pageId: number, tenantId: string, commentId: number): Promise<CommentRow> {
  const db = await getDb();
  if (!db) {
    throw new ToolExecutionError(503, "Database not available");
  }

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
    })
    .from(socialComments)
    .where(and(eq(socialComments.id, commentId), eq(socialComments.pageId, pageId), eq(socialComments.tenantId, tenantId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new ToolExecutionError(404, "Comment not found");
  }

  return row as CommentRow;
}

function isOutboundAction(action: InternalToolAction): boolean {
  return action === "send_reply" || action === "publish_post" || action === "reply_comment";
}

function actionNeedsInbox(action: InternalToolAction): boolean {
  return action === "read_inbox" || action === "send_reply";
}

function actionNeedsPublishing(action: InternalToolAction): boolean {
  return action === "publish_post";
}

function actionNeedsModeration(action: InternalToolAction): boolean {
  return action === "read_comments" || action === "reply_comment";
}

function sendJsonError(res: Response, status: number, error: string): void {
  res.status(status).json({ success: false, error });
}

async function handleReadInbox(page: PageRow): Promise<Record<string, unknown>> {
  const result = await listConversationsByTenant(page.tenantId, {
    pageId: page.id,
    limit: 10,
  });

  return {
    pageId: page.id,
    conversations: result.items.map((conversation) => ({
      conversationId: conversation.id,
      customerName: conversation.customerDisplayName,
      lastMessage: conversation.lastMessagePreview,
      status: conversation.status,
      unreadCount: conversation.unreadCount,
    })),
    nextCursor: result.nextCursor,
    hasMore: result.hasMore,
  };
}

async function handleSendReply(page: PageRow, conversationId: number | undefined, messageBody: string | undefined): Promise<Record<string, unknown>> {
  if (!conversationId) {
    throw new ToolExecutionError(400, "conversationId is required for send_reply");
  }
  if (!messageBody) {
    throw new ToolExecutionError(400, "messageBody is required for send_reply");
  }

  const db = await getDb();
  if (!db) {
    throw new ToolExecutionError(503, "Database not available");
  }

  const conversationRows = await db
    .select({
      id: socialConversations.id,
      tenantId: socialConversations.tenantId,
      pageId: socialConversations.pageId,
      customerExternalId: socialConversations.customerExternalId,
      status: socialConversations.status,
    })
    .from(socialConversations)
    .where(and(eq(socialConversations.id, conversationId), eq(socialConversations.pageId, page.id), eq(socialConversations.tenantId, page.tenantId)))
    .limit(1);

  const conversation = conversationRows[0];
  if (!conversation) {
    throw new ToolExecutionError(404, "Conversation not found");
  }
  if (!conversation.customerExternalId) {
    throw new ToolExecutionError(409, "Conversation recipient id is missing");
  }

  const sendResult = await sendMessageViaPythonBackend(page.id, conversation.customerExternalId, messageBody);
  await resetConversationUnreadCount(conversationId, page.tenantId);

  return {
    pageId: page.id,
    conversationId,
    providerMessageId: sendResult.providerMessageId,
    deliveryStatus: "sent",
  };
}

async function handlePublishPost(
  page: PageRow,
  contentText: string | undefined,
  contentLink: string | undefined,
): Promise<Record<string, unknown>> {
  if (!contentText) {
    throw new ToolExecutionError(400, "contentText is required for publish_post");
  }
  if (contentLink) {
    const linkError = validateHttpsLink(contentLink);
    if (linkError) {
      throw new ToolExecutionError(400, linkError);
    }
  }

  if (!page.encryptedPageAccessToken) {
    throw new ToolExecutionError(409, "Page access token is missing");
  }
  if (page.tokenExpiresAt && page.tokenExpiresAt.getTime() <= Date.now()) {
    throw new ToolExecutionError(409, "Page access token has expired");
  }

  const pageAccessToken = decrypt(page.encryptedPageAccessToken);
  const response = await fetch(
    `${ENV.pythonBackendUrl || "http://127.0.0.1:8000"}/api/internal/meta/posts/publish`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(ENV.webGatewayToken ? { "x-internal-token": ENV.webGatewayToken } : {}),
      },
      body: JSON.stringify({
        page_id: page.providerPageId,
        page_access_token: pageAccessToken,
        message: contentText,
        ...(contentLink ? { link: contentLink } : {}),
      }),
    },
  );

  if (!response.ok) {
    let detail = "Failed to publish post";
    try {
      const data = await response.json();
      if (typeof data?.detail === "string") {
        detail = data.detail;
      } else if (typeof data?.message === "string") {
        detail = data.message;
      }
    } catch {
      detail = response.statusText || detail;
    }
    throw new Error(detail);
  }

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    pageId: page.id,
    status: payload.status ?? "published",
    providerPostId: payload.provider_post_id ?? payload.providerPostId ?? payload.id ?? null,
    result: payload,
  };
}

async function handleReadComments(page: PageRow): Promise<Record<string, unknown>> {
  const db = await getDb();
  if (!db) {
    throw new ToolExecutionError(503, "Database not available");
  }

  const rows = await db
    .select({
      id: socialComments.id,
      pageId: socialComments.pageId,
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
    .where(eq(socialComments.pageId, page.id))
    .orderBy(desc(socialComments.createdAt), desc(socialComments.id))
    .limit(20);

  return {
    pageId: page.id,
    comments: rows.map((row) => ({
      commentId: row.id,
      providerCommentId: row.providerCommentId,
      providerObjectId: row.providerObjectId,
      authorDisplayName: row.authorDisplayName,
      body: row.body,
      status: row.status,
      lastAction: row.lastAction,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
  };
}

async function handleReplyComment(
  page: PageRow,
  commentId: number | undefined,
  messageBody: string | undefined,
): Promise<Record<string, unknown>> {
  if (!commentId) {
    throw new ToolExecutionError(400, "commentId is required for reply_comment");
  }
  if (!messageBody) {
    throw new ToolExecutionError(400, "messageBody is required for reply_comment");
  }
  if (!page.encryptedPageAccessToken) {
    throw new ToolExecutionError(409, "Page access token is missing");
  }
  if (page.tokenExpiresAt && page.tokenExpiresAt.getTime() <= Date.now()) {
    throw new ToolExecutionError(409, "Page access token has expired");
  }

  const comment = await loadComment(page.id, page.tenantId, commentId);
  if (!comment.providerCommentId) {
    throw new ToolExecutionError(409, "Comment does not have a provider id");
  }

  const pageAccessToken = decrypt(page.encryptedPageAccessToken);
  const response = await fetch(
    `${ENV.pythonBackendUrl || "http://127.0.0.1:8000"}/api/internal/meta/comments/reply`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(ENV.webGatewayToken ? { "x-internal-token": ENV.webGatewayToken } : {}),
      },
      body: JSON.stringify({
        object_id: comment.providerCommentId,
        message: messageBody,
        page_access_token: pageAccessToken,
        page_id: page.providerPageId,
      }),
    },
  );

  if (!response.ok) {
    let detail = "Failed to reply to comment";
    try {
      const data = await response.json();
      if (typeof data?.detail === "string") {
        detail = data.detail;
      } else if (typeof data?.message === "string") {
        detail = data.message;
      }
    } catch {
      detail = response.statusText || detail;
    }
    throw new Error(detail);
  }

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    pageId: page.id,
    commentId,
    providerCommentId: payload.provider_comment_id ?? payload.providerCommentId ?? payload.id ?? null,
    status: payload.status ?? "replied",
    result: payload,
  };
}

export async function handleInternalSocialTool(req: Request, res: Response): Promise<void> {
  if (!verifyInternalToken(req)) {
    sendJsonError(res, 401, "Unauthorized");
    return;
  }

  const agentId = getHeaderValue(req, "x-agent-id");
  const toolId = getHeaderValue(req, "x-agent-tool-id");
  if (!agentId || !toolId) {
    sendJsonError(res, 400, "Missing X-Agent-Id or X-Agent-Tool-Id header");
    return;
  }

  const normalizedBody = normalizeRequestBody(req.body);
  const parsed = InternalSocialToolSchema.safeParse(normalizedBody);
  if (!parsed.success) {
    sendJsonError(res, 400, "Invalid request body");
    return;
  }

  try {
    const dataInput = { ...parsed.data };
    const queryText = typeof normalizedBody.query === "string" ? normalizedBody.query.trim() : "";
    if (queryText) {
      if ((dataInput.action === "send_reply" || dataInput.action === "reply_comment") && !dataInput.messageBody) {
        dataInput.messageBody = queryText;
      }
      if (dataInput.action === "publish_post" && !dataInput.contentText) {
        dataInput.contentText = queryText;
      }
    }

    const toolContext = await loadToolConfig(agentId, toolId);
    const page = await loadPage(dataInput.pageId);

    if (page.tenantId !== toolContext.tenantId) {
      sendJsonError(res, 403, "Page does not belong to the configured agent tenant");
      return;
    }

    const allowedActions = Array.isArray(toolContext.toolConfig.allowedActions)
      ? toolContext.toolConfig.allowedActions.filter((value): value is string => typeof value === "string")
      : [];
    const action = dataInput.action as InternalToolAction;
    if (allowedActions.length === 0 || !allowedActions.includes(action)) {
      sendJsonError(res, 403, "Action not permitted by tool configuration");
      return;
    }

    const configuredPageId = Number(toolContext.toolConfig.pageId);
    if (!Number.isInteger(configuredPageId) || configuredPageId <= 0) {
      sendJsonError(res, 400, "Tool configuration must include pageId");
      return;
    }
    if (configuredPageId !== dataInput.pageId) {
      sendJsonError(res, 403, "Tool configuration pageId does not match request");
      return;
    }

    const requireApproval = toolContext.toolConfig.requireApproval !== false;
    if (requireApproval && isOutboundAction(action)) {
      res.json({
        success: false,
        status: "approval_needed",
        message: "Outbound actions require human approval",
      });
      return;
    }

    if (actionNeedsInbox(action) && !page.selectedForInbox) {
      sendJsonError(res, 403, "Page is not enabled for inbox actions");
      return;
    }
    if (actionNeedsPublishing(action) && !page.selectedForPublishing) {
      sendJsonError(res, 403, "Page is not enabled for publishing");
      return;
    }
    if (actionNeedsModeration(action) && !page.selectedForModeration) {
      sendJsonError(res, 403, "Page is not enabled for moderation");
      return;
    }
    if (page.status !== "active") {
      sendJsonError(res, 409, "Page is not active");
      return;
    }

    let data: Record<string, unknown>;
    switch (action) {
      case "read_inbox":
        data = await handleReadInbox(page);
        break;
      case "send_reply":
        data = await handleSendReply(page, dataInput.conversationId, dataInput.messageBody);
        break;
      case "publish_post":
        data = await handlePublishPost(page, dataInput.contentText, dataInput.contentLink);
        break;
      case "read_comments":
        data = await handleReadComments(page);
        break;
      case "reply_comment":
        data = await handleReplyComment(page, dataInput.commentId, dataInput.messageBody);
        break;
      default:
        sendJsonError(res, 400, "Unsupported action");
        return;
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    if (error instanceof ToolExecutionError) {
      sendJsonError(res, error.status, error.message);
      return;
    }
    sendJsonError(res, 500, error instanceof Error ? error.message : "Tool execution failed");
  }
}

export const internalSocialToolRouter = Router();

internalSocialToolRouter.post("/api/internal/tools/meta-channels", handleInternalSocialTool);

export function registerInternalSocialToolRoute(app: Express): void {
  app.use(internalSocialToolRouter);
}
