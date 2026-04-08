import { and, desc, eq } from "drizzle-orm";

import { socialComments, socialConversations, socialPages, socialProviderConnections } from "../../../drizzle/schema";
import { type DrizzleDB, getDb } from "../../db";
import { decrypt } from "../crypto";
import { listConversationsByTenant, resetConversationUnreadCount, sendMessageViaPythonBackend } from "../socialInboxService";
import { publishSocialContentViaPythonBackend, readPythonBackendError } from "../socialPublishGateway";
import { SocialBackgroundError } from "./providerRegistry";
import { getAppRuntimeConfig, getPreferredInternalToken } from "../appRuntimeConfig";

export interface LoadedSocialPage {
  id: number;
  tenantId: string;
  providerPageId: string;
  pageName: string | null;
  status: string;
  selectedForInbox: boolean;
  selectedForPublishing: boolean;
  selectedForModeration: boolean;
  provider: string;
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string | null;
  encryptedPageAccessToken: string | null;
  tokenExpiresAt: Date | null;
  connectionTokenExpiresAt: Date | null;
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
    return null;
  } catch {
    return "Content link must be a valid HTTPS URL";
  }
}

async function getDbOrThrow(): Promise<DrizzleDB> {
  const db = await getDb();
  if (!db) {
    throw new SocialBackgroundError(503, "Database not available");
  }
  return db;
}

export async function loadPage(tenantId: string, pageId: number): Promise<LoadedSocialPage> {
  const db = await getDbOrThrow();
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
      provider: socialProviderConnections.provider,
      encryptedAccessToken: socialProviderConnections.encryptedAccessToken,
      encryptedRefreshToken: socialProviderConnections.encryptedRefreshToken,
      encryptedPageAccessToken: socialPages.encryptedPageAccessToken,
      tokenExpiresAt: socialPages.tokenExpiresAt,
      connectionTokenExpiresAt: socialProviderConnections.tokenExpiresAt,
    })
    .from(socialPages)
    .innerJoin(socialProviderConnections, eq(socialPages.connectionId, socialProviderConnections.id))
    .where(and(eq(socialPages.id, pageId), eq(socialPages.tenantId, tenantId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new SocialBackgroundError(404, "Page not found");
  }
  return row;
}

function resolveAccessToken(page: LoadedSocialPage): string | null {
  if (page.provider === "meta") {
    if (!page.encryptedPageAccessToken) return null;
    return decrypt(page.encryptedPageAccessToken) || null;
  }
  if (!page.encryptedAccessToken) return null;
  return decrypt(page.encryptedAccessToken) || null;
}

function resolveProviderStatus(page: LoadedSocialPage): Date | null {
  if (page.provider === "meta") return page.tokenExpiresAt;
  return page.connectionTokenExpiresAt;
}

export async function readInbox(tenantId: string, page: LoadedSocialPage): Promise<Record<string, unknown>> {
  const conversations = await listConversationsByTenant(tenantId, {
    pageId: page.id,
    limit: 10,
  });

  return {
    pageId: page.id,
    conversations: conversations.items.map((conversation) => ({
      conversationId: conversation.id,
      customerName: conversation.customerDisplayName || conversation.customerExternalId,
      lastMessage: conversation.lastMessagePreview ?? null,
      status: conversation.status,
      unreadCount: conversation.unreadCount,
    })),
    nextCursor: conversations.nextCursor,
    hasMore: conversations.hasMore,
  };
}

export async function sendReply(
  tenantId: string,
  page: LoadedSocialPage,
  conversationId: number | undefined,
  messageBody: string | undefined,
): Promise<Record<string, unknown>> {
  if (!conversationId) {
    throw new SocialBackgroundError(400, "conversationId is required for send_reply");
  }
  if (!messageBody) {
    throw new SocialBackgroundError(400, "messageBody is required for send_reply");
  }
  if (!page.encryptedPageAccessToken) {
    throw new SocialBackgroundError(409, "Page access token is missing");
  }
  if (page.tokenExpiresAt && page.tokenExpiresAt.getTime() <= Date.now()) {
    throw new SocialBackgroundError(409, "Page access token has expired");
  }

  const db = await getDbOrThrow();
  const rows = (await db
    .select({
      id: socialConversations.id,
      tenantId: socialConversations.tenantId,
      pageId: socialConversations.pageId,
      customerExternalId: socialConversations.customerExternalId,
      status: socialConversations.status,
    })
    .from(socialConversations)
    .where(and(eq(socialConversations.id, conversationId), eq(socialConversations.pageId, page.id), eq(socialConversations.tenantId, tenantId)))
    .limit(1)) as Array<{
    id: number;
    tenantId: string;
    pageId: number;
    customerExternalId: string | null;
    status: string;
  }>;

  const conversation = rows[0];
  if (!conversation) {
    throw new SocialBackgroundError(404, "Conversation not found");
  }
  if (!conversation.customerExternalId) {
    throw new SocialBackgroundError(409, "Conversation recipient id is missing");
  }

  const sendResult = await sendMessageViaPythonBackend(page.id, conversation.customerExternalId, messageBody);
  await resetConversationUnreadCount(conversationId, tenantId);
  return {
    pageId: page.id,
    conversationId,
    providerMessageId: sendResult.providerMessageId,
    deliveryStatus: "sent",
    result: sendResult.raw,
  };
}

export async function publishPost(
  page: LoadedSocialPage,
  contentText: string | undefined,
  contentLink: string | undefined,
  mediaRefs: string[] | undefined,
): Promise<Record<string, unknown>> {
  if (!contentText && (!mediaRefs || mediaRefs.length === 0)) {
    throw new SocialBackgroundError(400, "contentText or mediaRefs is required for publish_post");
  }
  if (contentLink) {
    const linkError = validateHttpsLink(contentLink);
    if (linkError) {
      throw new SocialBackgroundError(400, linkError);
    }
  }

  const isMeta = page.provider === "meta";
  if (isMeta) {
    if (!page.encryptedPageAccessToken) {
      throw new SocialBackgroundError(409, "Page access token is missing");
    }
    if (page.tokenExpiresAt && page.tokenExpiresAt.getTime() <= Date.now()) {
      throw new SocialBackgroundError(409, "Page access token has expired");
    }
  } else {
    if (!page.encryptedAccessToken) {
      throw new SocialBackgroundError(409, "Provider access token is missing");
    }
    if (page.connectionTokenExpiresAt && page.connectionTokenExpiresAt.getTime() <= Date.now()) {
      throw new SocialBackgroundError(409, "Provider access token has expired");
    }
  }

  const accessToken = resolveAccessToken(page);
  if (!accessToken) {
    throw new SocialBackgroundError(409, isMeta ? "Page access token is missing" : "Provider access token is missing");
  }

  const response = await publishSocialContentViaPythonBackend({
    provider: page.provider,
    pageId: page.providerPageId,
    accessToken,
    message: contentText || undefined,
    link: contentLink,
    mediaUrls: mediaRefs ?? [],
    title: contentText || undefined,
    description: contentText || undefined,
    videoMetadata: undefined,
  });
  if (!response.ok) {
    throw new SocialBackgroundError(response.status, await readPythonBackendError(response));
  }
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    pageId: page.id,
    status: payload.status ?? "published",
    providerPostId: payload.provider_post_id ?? payload.providerPostId ?? payload.id ?? null,
    result: payload,
  };
}

export async function readComments(page: LoadedSocialPage): Promise<Record<string, unknown>> {
  const db = await getDbOrThrow();
  const rows = (await db
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
    .limit(20)) as Array<{
    id: number;
    pageId: number;
    providerCommentId: string | null;
    providerObjectId: string | null;
    authorDisplayName: string | null;
    body: string | null;
    status: string;
    lastAction: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;

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

export async function replyComment(
  tenantId: string,
  page: LoadedSocialPage,
  commentId: number | undefined,
  messageBody: string | undefined,
): Promise<Record<string, unknown>> {
  if (!commentId) {
    throw new SocialBackgroundError(400, "commentId is required for reply_comment");
  }
  if (!messageBody) {
    throw new SocialBackgroundError(400, "messageBody is required for reply_comment");
  }
  if (!page.encryptedPageAccessToken) {
    throw new SocialBackgroundError(409, "Page access token is missing");
  }
  if (page.tokenExpiresAt && page.tokenExpiresAt.getTime() <= Date.now()) {
    throw new SocialBackgroundError(409, "Page access token has expired");
  }

  const db = await getDbOrThrow();
  const rows = await db
    .select({
      id: socialComments.id,
      tenantId: socialComments.tenantId,
      pageId: socialComments.pageId,
      providerCommentId: socialComments.providerCommentId,
      providerObjectId: socialComments.providerObjectId,
      status: socialComments.status,
      body: socialComments.body,
    })
    .from(socialComments)
    .where(and(eq(socialComments.id, commentId), eq(socialComments.pageId, page.id), eq(socialComments.tenantId, tenantId)))
    .limit(1);

  const comment = rows[0];
  if (!comment) {
    throw new SocialBackgroundError(404, "Comment not found");
  }
  const providerCommentId = comment.providerCommentId || comment.providerObjectId;
  if (!providerCommentId) {
    throw new SocialBackgroundError(409, "Comment does not have a provider id");
  }

  const pageAccessToken = decrypt(page.encryptedPageAccessToken);
  const runtime = await getAppRuntimeConfig();
  const internalToken = await getPreferredInternalToken();
  const response = await fetch(
    `${runtime.pythonBackendUrl}/api/internal/meta/comments/reply`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(internalToken ? { "x-internal-token": internalToken } : {}),
      },
      body: JSON.stringify({
        object_id: providerCommentId,
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
    throw new SocialBackgroundError(response.status, detail);
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
