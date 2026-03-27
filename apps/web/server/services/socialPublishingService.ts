/**
 * Social Publishing service layer.
 *
 * Handles tenant-scoped publishing drafts, immediate publishing, scheduling,
 * cancellation, and history pagination for Meta Pages.
 */

import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, lt } from "drizzle-orm";

import { socialPages, socialPosts, socialProviderConnections } from "../../drizzle/schema";
import { type DrizzleDB, getDb } from "../db";
import { decrypt } from "./crypto";
import { auditLogger } from "./auditLogger";
import { verifyPageAccess } from "./socialAccessService";
import { publishSocialContentViaPythonBackend, readPythonBackendError } from "./socialPublishGateway";

const PY_TIMEOUT_MS = 15_000;

export type SocialPublishingStatus = "draft" | "scheduled" | "published" | "failed";

export type SocialPublishingReadinessCode =
  | "ready"
  | "page_inactive"
  | "publishing_disabled"
  | "missing_page_access"
  | "expired_page_access"
  | "missing_provider_access"
  | "expired_provider_access";

export interface SocialPublishingReadiness {
  ready: boolean;
  code: SocialPublishingReadinessCode;
  message: string | null;
}

export interface SocialPublishingPageSummary {
  id: number;
  label: string;
  status: string;
  provider: string;
  pageName: string | null;
  pageCategory: string | null;
  providerPageId: string;
  publishingReady: boolean;
  publishingIssueCode: SocialPublishingReadinessCode;
  publishingIssue: string | null;
}

export interface SocialPublishingPostSummary {
  id: number;
  pageId: number;
  pageName: string | null;
  provider: string;
  status: SocialPublishingStatus;
  contentText: string | null;
  contentLink: string | null;
  mediaRefs: string[] | null;
  providerPostId: string | null;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SocialPublishingListResponse {
  items: SocialPublishingPostSummary[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface PublishingPostContext {
  post: {
    id: number;
    tenantId: string;
    pageId: number;
    providerPostId: string | null;
    status: SocialPublishingStatus | string;
    contentText: string | null;
    contentLink: string | null;
    mediaRefs: string[] | null;
    scheduledAt: Date | null;
    publishedAt: Date | null;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  page: {
    id: number;
    tenantId: string;
    providerPageId: string;
    provider: string;
    pageName: string | null;
    pageCategory: string | null;
    status: string;
    selectedForPublishing: boolean;
    encryptedAccessToken: string | null;
    encryptedRefreshToken: string | null;
    encryptedPageAccessToken: string | null;
    tokenExpiresAt: Date | null;
    connectionTokenExpiresAt: Date | null;
  };
}

function normalizePublishingStatus(status: string | null | undefined): SocialPublishingStatus {
  switch (status) {
    case "scheduled":
    case "published":
    case "failed":
      return status;
    case "draft":
    default:
      return "draft";
  }
}

function toSummaryRow(row: {
  id: number;
  pageId: number;
  pageName: string | null;
  provider: string | null;
  status: string;
  contentText: string | null;
  contentLink: string | null;
  mediaRefs: string[] | null;
  providerPostId: string | null;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SocialPublishingPostSummary {
  return {
    id: row.id,
    pageId: row.pageId,
    pageName: row.pageName,
    provider: row.provider ?? "meta",
    status: normalizePublishingStatus(row.status),
    contentText: row.contentText,
    contentLink: row.contentLink,
    mediaRefs: row.mediaRefs,
    providerPostId: row.providerPostId,
    scheduledAt: row.scheduledAt,
    publishedAt: row.publishedAt,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
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

function parseScheduledAt(scheduledAt: string): Date {
  const parsed = new Date(scheduledAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid scheduledAt value",
    });
  }

  const now = Date.now();
  const minimum = now + 10 * 60 * 1000;
  const maximum = now + 30 * 24 * 60 * 60 * 1000;
  const timestamp = parsed.getTime();

  if (timestamp < minimum) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "scheduledAt must be at least 10 minutes in the future",
    });
  }
  if (timestamp > maximum) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "scheduledAt cannot be more than 30 days in the future",
    });
  }

  return parsed;
}

function extractProviderPostId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;

  for (const key of ["provider_post_id", "providerPostId", "post_id", "postId", "id"]) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  const result = data.result;
  if (result && typeof result === "object") {
    const nested = extractProviderPostId(result);
    if (nested) return nested;
  }

  return null;
}

function resolvePublishingAccessToken(context: PublishingPostContext): string | null {
  const encrypted = context.page.provider === "meta"
    ? context.page.encryptedPageAccessToken
    : context.page.encryptedAccessToken;
  if (!encrypted) return null;
  return decrypt(encrypted) || null;
}

function resolvePagePublishingReadiness(context: {
  provider: string;
  status: string;
  selectedForPublishing: boolean;
  encryptedAccessToken: string | null;
  encryptedPageAccessToken: string | null;
  tokenExpiresAt: Date | null;
  connectionTokenExpiresAt: Date | null;
}): SocialPublishingReadiness {
  if (context.status !== "active") {
    return {
      ready: false,
      code: "page_inactive",
      message: "Page is not active",
    };
  }

  if (!context.selectedForPublishing) {
    return {
      ready: false,
      code: "publishing_disabled",
      message: "Page is not enabled for publishing",
    };
  }

  const accessTokenMissing = context.provider === "meta"
    ? !context.encryptedPageAccessToken
    : !context.encryptedAccessToken;
  if (accessTokenMissing) {
    return {
      ready: false,
      code: context.provider === "meta" ? "missing_page_access" : "missing_provider_access",
      message: context.provider === "meta"
        ? "Facebook Page access is missing. Reconnect the Page before auto-posting."
        : `${context.provider} access token is missing. Reconnect the account before auto-posting.`,
    };
  }

  const tokenExpiresAt = context.provider === "meta"
    ? context.tokenExpiresAt
    : context.connectionTokenExpiresAt;
  if (tokenExpiresAt && tokenExpiresAt <= new Date()) {
    return {
      ready: false,
      code: context.provider === "meta" ? "expired_page_access" : "expired_provider_access",
      message: context.provider === "meta"
        ? "Facebook Page access has expired. Reconnect the Page before auto-posting."
        : `${context.provider} access token has expired. Reconnect the account before auto-posting.`,
    };
  }

  return {
    ready: true,
    code: "ready",
    message: null,
  };
}

function assertPagePublishingReady(context: PublishingPostContext): void {
  const readiness = resolvePagePublishingReadiness(context.page);
  if (!readiness.ready) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: readiness.message || "Page is not ready for publishing",
    });
  }
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

async function loadPostContext(
  postId: number,
  tenantId: string,
  userId: number,
): Promise<PublishingPostContext> {
  const db = await resolveDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }

  const rows = await db
    .select({
      id: socialPosts.id,
      tenantId: socialPosts.tenantId,
      pageId: socialPosts.pageId,
      providerPostId: socialPosts.providerPostId,
      status: socialPosts.status,
      contentText: socialPosts.contentText,
      contentLink: socialPosts.contentLink,
      mediaRefs: socialPosts.mediaRefs,
      scheduledAt: socialPosts.scheduledAt,
      publishedAt: socialPosts.publishedAt,
      errorMessage: socialPosts.errorMessage,
      createdAt: socialPosts.createdAt,
      updatedAt: socialPosts.updatedAt,
      pageTenantId: socialPages.tenantId,
      providerPageId: socialPages.providerPageId,
      provider: socialProviderConnections.provider,
      pageName: socialPages.pageName,
      pageCategory: socialPages.pageCategory,
      pageStatus: socialPages.status,
      selectedForPublishing: socialPages.selectedForPublishing,
      encryptedAccessToken: socialProviderConnections.encryptedAccessToken,
      encryptedRefreshToken: socialProviderConnections.encryptedRefreshToken,
      encryptedPageAccessToken: socialPages.encryptedPageAccessToken,
      tokenExpiresAt: socialPages.tokenExpiresAt,
      connectionTokenExpiresAt: socialProviderConnections.tokenExpiresAt,
    })
    .from(socialPosts)
    .innerJoin(socialPages, eq(socialPosts.pageId, socialPages.id))
    .innerJoin(socialProviderConnections, eq(socialPages.connectionId, socialProviderConnections.id))
    .where(
      and(
        eq(socialPosts.id, postId),
        eq(socialPosts.tenantId, tenantId),
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
      message: "Post not found",
    });
  }

  return {
    post: {
      id: row.id,
      tenantId: row.tenantId,
      pageId: row.pageId,
      providerPostId: row.providerPostId,
      status: row.status,
      contentText: row.contentText,
      contentLink: row.contentLink,
      mediaRefs: row.mediaRefs ?? null,
      scheduledAt: row.scheduledAt,
      publishedAt: row.publishedAt,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    page: {
      id: row.pageId,
      tenantId: row.pageTenantId,
      providerPageId: row.providerPageId,
      provider: row.provider,
      pageName: row.pageName,
      pageCategory: row.pageCategory,
      status: row.pageStatus,
      selectedForPublishing: row.selectedForPublishing,
      encryptedAccessToken: row.encryptedAccessToken,
      encryptedRefreshToken: row.encryptedRefreshToken,
      encryptedPageAccessToken: row.encryptedPageAccessToken,
      tokenExpiresAt: row.tokenExpiresAt,
      connectionTokenExpiresAt: row.connectionTokenExpiresAt,
    },
  };
}

export async function listPublishingPages(tenantId: string, userId: number): Promise<SocialPublishingPageSummary[]> {
  const db = await resolveDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }

  const rows = await db
    .select({
      id: socialPages.id,
      providerPageId: socialPages.providerPageId,
      provider: socialProviderConnections.provider,
      pageName: socialPages.pageName,
      pageCategory: socialPages.pageCategory,
      status: socialPages.status,
      selectedForPublishing: socialPages.selectedForPublishing,
      encryptedAccessToken: socialProviderConnections.encryptedAccessToken,
      encryptedPageAccessToken: socialPages.encryptedPageAccessToken,
      tokenExpiresAt: socialPages.tokenExpiresAt,
      connectionTokenExpiresAt: socialProviderConnections.tokenExpiresAt,
    })
    .from(socialPages)
    .innerJoin(socialProviderConnections, eq(socialPages.connectionId, socialProviderConnections.id))
    .where(
      and(
        eq(socialPages.tenantId, tenantId),
        eq(socialProviderConnections.tenantId, tenantId),
        eq(socialProviderConnections.userId, userId),
        eq(socialPages.selectedForPublishing, true),
        eq(socialPages.status, "active"),
      ),
    )
    .orderBy(asc(socialPages.pageName), asc(socialPages.id));

  return rows.map((row) => {
    const readiness = resolvePagePublishingReadiness(row);
    return {
      id: row.id,
      label: row.pageName || `Page ${row.providerPageId}`,
      status: row.status,
      provider: row.provider,
      pageName: row.pageName,
      pageCategory: row.pageCategory,
      providerPageId: row.providerPageId,
      publishingReady: readiness.ready,
      publishingIssueCode: readiness.code,
      publishingIssue: readiness.message,
    };
  });
}

export async function createPublishingDraft(params: {
  tenantId: string;
  userId: number;
  pageId: number;
  contentText?: string | null;
  contentLink?: string | null;
  mediaRefs?: string[] | null;
}): Promise<SocialPublishingPostSummary> {
  const page = await verifyPageAccess(params.pageId, params.userId, params.tenantId, params.tenantId);
  if (page.status !== "active") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Page is not active",
    });
  }
  if (!page.selectedForPublishing) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Page is not enabled for publishing",
    });
  }

  const contentText = (params.contentText ?? "").trim();
  const mediaRefs = (params.mediaRefs ?? [])
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);

  if (page.provider === "meta" && !contentText) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Post content is required for Meta publishing",
    });
  }
  if (page.provider !== "meta" && mediaRefs.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `At least one media URL is required for ${page.provider} publishing`,
    });
  }

  const db = await resolveDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }

  const now = new Date();
  const inserted = await db
    .insert(socialPosts)
    .values({
      tenantId: params.tenantId,
      pageId: params.pageId,
      status: "draft",
      contentText: contentText || null,
      contentLink: params.contentLink ?? null,
      mediaRefs: mediaRefs.length > 0 ? mediaRefs : null,
      createdByUserId: params.userId,
      errorMessage: null,
      scheduledAt: null,
      publishedAt: null,
      updatedAt: now,
    })
    .returning({
      id: socialPosts.id,
      pageId: socialPosts.pageId,
      providerPostId: socialPosts.providerPostId,
      status: socialPosts.status,
      contentText: socialPosts.contentText,
      contentLink: socialPosts.contentLink,
      mediaRefs: socialPosts.mediaRefs,
      scheduledAt: socialPosts.scheduledAt,
      publishedAt: socialPosts.publishedAt,
      errorMessage: socialPosts.errorMessage,
      createdAt: socialPosts.createdAt,
      updatedAt: socialPosts.updatedAt,
    });

  const row = inserted[0];
  if (!row) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create draft",
    });
  }

  auditLogger.log({
    eventType: "social_publishing_draft_created",
    userId: params.userId,
    metadata: {
      tenantId: params.tenantId,
      pageId: params.pageId,
      postId: row.id,
      contentLength: contentText.length,
      mediaRefCount: mediaRefs.length,
    },
  });

  return toSummaryRow({
    ...row,
    pageName: page.pageName,
    provider: page.provider,
  });
}

export async function publishPublishingPostNow(params: {
  tenantId: string;
  userId: number;
  postId: number;
}): Promise<SocialPublishingPostSummary> {
  const context = await loadPostContext(params.postId, params.tenantId, params.userId);
  if (normalizePublishingStatus(context.post.status) === "published") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Post is already published",
    });
  }
  if (!context.page.selectedForPublishing) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Page is not enabled for publishing",
    });
  }
  if (context.page.status !== "active") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Page is not active",
    });
  }
  assertPagePublishingReady(context);

  const accessToken = resolvePublishingAccessToken(context);
  if (!accessToken) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: context.page.provider === "meta"
        ? "Failed to decrypt page access token"
        : "Failed to decrypt provider access token",
    });
  }

  const db = await resolveDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }

  const now = new Date();
  try {
    const response = await publishSocialContentViaPythonBackend({
      provider: context.page.provider,
      pageId: context.page.providerPageId,
      accessToken,
      message: context.post.contentText || undefined,
      link: context.post.contentLink || undefined,
      mediaUrls: context.post.mediaRefs ?? undefined,
      title: context.post.contentText || undefined,
      description: context.post.contentText || undefined,
    });

    if (!response.ok) {
      const detail = await readPythonBackendError(response);
      await db
        .update(socialPosts)
        .set({
          status: "failed",
          errorMessage: detail,
          updatedAt: now,
        })
        .where(and(eq(socialPosts.id, params.postId), eq(socialPosts.tenantId, params.tenantId)));

      auditLogger.log({
        eventType: "social_publishing_publish_failed",
        userId: params.userId,
        metadata: {
          tenantId: params.tenantId,
          pageId: context.page.id,
          postId: params.postId,
          errorMessage: detail,
        },
      });

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: detail || "Failed to publish post",
      });
    }

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const providerPostId = extractProviderPostId(payload);

    await db
      .update(socialPosts)
      .set({
        status: "published",
        providerPostId,
        publishedAt: now,
        errorMessage: null,
        updatedAt: now,
      })
      .where(and(eq(socialPosts.id, params.postId), eq(socialPosts.tenantId, params.tenantId)));

    auditLogger.log({
      eventType: "social_publishing_post_published",
      userId: params.userId,
      metadata: {
        tenantId: params.tenantId,
        pageId: context.page.id,
        postId: params.postId,
        providerPostId,
        provider: context.page.provider,
      },
    });

    return toSummaryRow({
      id: context.post.id,
      pageId: context.post.pageId,
      pageName: context.page.pageName,
      provider: context.page.provider,
      providerPostId,
      status: "published",
      contentText: context.post.contentText,
      contentLink: context.post.contentLink,
      mediaRefs: context.post.mediaRefs,
      scheduledAt: context.post.scheduledAt,
      publishedAt: now,
      errorMessage: null,
      createdAt: context.post.createdAt,
      updatedAt: now,
    });
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(socialPosts)
      .set({
        status: "failed",
        errorMessage: message,
        updatedAt: now,
      })
      .where(and(eq(socialPosts.id, params.postId), eq(socialPosts.tenantId, params.tenantId)));

    auditLogger.log({
      eventType: "social_publishing_publish_failed",
      userId: params.userId,
      metadata: {
        tenantId: params.tenantId,
        pageId: context.page.id,
        postId: params.postId,
        errorMessage: message,
        provider: context.page.provider,
      },
    });

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message,
    });
  }
}

export async function schedulePublishingPost(params: {
  tenantId: string;
  userId: number;
  postId: number;
  scheduledAt: string;
}): Promise<SocialPublishingPostSummary> {
  const context = await loadPostContext(params.postId, params.tenantId, params.userId);
  if (!["draft", "failed"].includes(normalizePublishingStatus(context.post.status))) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Only draft posts can be scheduled",
    });
  }
  if (!context.page.selectedForPublishing || context.page.status !== "active") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Page is not ready for publishing",
    });
  }
  if (context.page.provider === "tiktok") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "TikTok does not support scheduled publishing yet",
    });
  }
  assertPagePublishingReady(context);

  const scheduledAtDate = parseScheduledAt(params.scheduledAt);
  const db = await resolveDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }

  const now = new Date();
  await db
    .update(socialPosts)
    .set({
      status: "scheduled",
      scheduledAt: scheduledAtDate,
      errorMessage: null,
      updatedAt: now,
    })
    .where(and(eq(socialPosts.id, params.postId), eq(socialPosts.tenantId, params.tenantId)));

  auditLogger.log({
    eventType: "social_publishing_post_scheduled",
    userId: params.userId,
    metadata: {
      tenantId: params.tenantId,
      pageId: context.page.id,
      postId: params.postId,
      scheduledAt: scheduledAtDate.toISOString(),
    },
  });

  return toSummaryRow({
    id: context.post.id,
    pageId: context.post.pageId,
    pageName: context.page.pageName,
    provider: context.page.provider,
    providerPostId: context.post.providerPostId,
    status: "scheduled",
    contentText: context.post.contentText,
    contentLink: context.post.contentLink,
    mediaRefs: context.post.mediaRefs,
    scheduledAt: scheduledAtDate,
    publishedAt: context.post.publishedAt,
    errorMessage: null,
    createdAt: context.post.createdAt,
    updatedAt: now,
  });
}

export async function cancelScheduledPublishingPost(params: {
  tenantId: string;
  userId: number;
  postId: number;
}): Promise<SocialPublishingPostSummary> {
  const context = await loadPostContext(params.postId, params.tenantId, params.userId);
  if (normalizePublishingStatus(context.post.status) !== "scheduled") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Only scheduled posts can be cancelled",
    });
  }

  const db = await resolveDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }

  const now = new Date();
  await db
    .update(socialPosts)
    .set({
      status: "draft",
      scheduledAt: null,
      errorMessage: null,
      updatedAt: now,
    })
    .where(and(eq(socialPosts.id, params.postId), eq(socialPosts.tenantId, params.tenantId)));

  auditLogger.log({
    eventType: "social_publishing_post_canceled",
    userId: params.userId,
    metadata: {
      tenantId: params.tenantId,
      pageId: context.page.id,
      postId: params.postId,
    },
  });

  return toSummaryRow({
    id: context.post.id,
    pageId: context.post.pageId,
    pageName: context.page.pageName,
    provider: context.page.provider,
    providerPostId: context.post.providerPostId,
    status: "draft",
    contentText: context.post.contentText,
    contentLink: context.post.contentLink,
    mediaRefs: context.post.mediaRefs,
    scheduledAt: null,
    publishedAt: context.post.publishedAt,
    errorMessage: null,
    createdAt: context.post.createdAt,
    updatedAt: now,
  });
}

export async function listPublishingPosts(params: {
  tenantId: string;
  pageId?: number;
  status?: SocialPublishingStatus;
  cursor?: string | null;
  limit?: number;
}): Promise<SocialPublishingListResponse> {
  const db = await resolveDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }

  const cursorDate = parseCursorDate(params.cursor);
  const limit = params.limit ?? 20;
  const conditions = [eq(socialPosts.tenantId, params.tenantId)];
  if (params.pageId !== undefined) {
    conditions.push(eq(socialPosts.pageId, params.pageId));
  }
  if (params.status) {
    conditions.push(eq(socialPosts.status, params.status));
  }
  if (cursorDate) {
    conditions.push(lt(socialPosts.createdAt, cursorDate));
  }

  const rows = await db
    .select({
      id: socialPosts.id,
      pageId: socialPosts.pageId,
      pageName: socialPages.pageName,
      provider: socialProviderConnections.provider,
      status: socialPosts.status,
      contentText: socialPosts.contentText,
      contentLink: socialPosts.contentLink,
      mediaRefs: socialPosts.mediaRefs,
      providerPostId: socialPosts.providerPostId,
      scheduledAt: socialPosts.scheduledAt,
      publishedAt: socialPosts.publishedAt,
      errorMessage: socialPosts.errorMessage,
      createdAt: socialPosts.createdAt,
      updatedAt: socialPosts.updatedAt,
    })
    .from(socialPosts)
    .leftJoin(socialPages, eq(socialPosts.pageId, socialPages.id))
    .leftJoin(socialProviderConnections, eq(socialPages.connectionId, socialProviderConnections.id))
    .where(and(...conditions))
    .orderBy(desc(socialPosts.createdAt), desc(socialPosts.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && pageRows.length > 0 ? pageRows[pageRows.length - 1]?.createdAt.toISOString() ?? null : null;

  return {
    items: pageRows.map(toSummaryRow),
    nextCursor,
    hasMore,
  };
}
