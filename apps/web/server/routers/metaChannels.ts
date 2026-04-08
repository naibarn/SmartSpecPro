/**
 * Meta Channels tRPC router.
 *
 * Proxies OAuth and page-management requests to the Python backend while
 * enforcing tenant isolation, feature gating, and per-IP OAuth throttling.
 */

import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../_core/trpc";
import { createRateLimitMiddleware } from "../_core/rateLimitedProcedure";
import { getDb } from "../db";
import { socialPages } from "../../drizzle/schema";
import { getTenantFeatureFlag } from "../services/featureFlags";
import { getAppRuntimeConfig, getPreferredInternalToken } from "../services/appRuntimeConfig";
import { verifyPageAccess } from "../services/socialAccessService";
import { resolveTenantIdVarchar } from "../services/tenantContext";
const PY_TIMEOUT_MS = 15_000;

function resolveMetaTenantId(ctx: { tenantId: unknown; user: { currentTenantId?: unknown } }): string {
  const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
  if (!tenantId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Tenant context is required",
    });
  }
  return tenantId;
}

async function assertMetaChannelsEnabled(ctx: { tenantId: unknown; user: { currentTenantId?: unknown } }): Promise<string> {
  const tenantId = resolveMetaTenantId(ctx);
  const enabled = await getTenantFeatureFlag("META_CHANNELS_ENABLED", tenantId);
  if (!enabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Meta Channels are disabled for this tenant",
    });
  }
  return tenantId;
}

async function callPythonBackend(
  path: string,
  options: { method: "GET" | "POST"; body?: unknown; timeoutMs?: number },
): Promise<Response> {
  const { method, body, timeoutMs = PY_TIMEOUT_MS } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const runtime = await getAppRuntimeConfig();
    const internalToken = await getPreferredInternalToken();
    if (!internalToken) {
      console.warn("[metaChannels] internal gateway token is not configured — internal Meta API calls will be unauthenticated");
    }
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
    if (typeof data?.detail === "string") {
      return data.detail;
    }
    if (typeof data?.message === "string") {
      return data.message;
    }
    return JSON.stringify(data);
  } catch {
    return res.statusText || "Python backend request failed";
  }
}

const metaChannelsProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const tenantId = await assertMetaChannelsEnabled(ctx);
  return next({
    ctx: {
      ...ctx,
      tenantId,
    },
  });
});

const rateLimitedMetaOAuthProcedure = metaChannelsProcedure.use(
  createRateLimitMiddleware({
    namespace: "meta-oauth-complete",
    limit: 10,
    windowMs: 60_000,
  }),
);

const pageSettingsSchema = z.object({
  pageId: z.number().int().positive(),
  aiActionMode: z.enum(["off", "draft_only", "approval_required", "auto_send"]).optional(),
  autoSendConfidenceThreshold: z.number().min(0).max(1).optional(),
  selectedForInbox: z.boolean().optional(),
  selectedForPublishing: z.boolean().optional(),
  selectedForModeration: z.boolean().optional(),
});

export const metaChannelsRouter = router({
  getConnectionStatus: metaChannelsProcedure.query(async ({ ctx }) => {
    const tenantId = resolveMetaTenantId(ctx);
    const response = await callPythonBackend(
      `/api/oauth/meta/status?tenant_id=${encodeURIComponent(tenantId)}&user_id=${encodeURIComponent(String(ctx.user.id))}`,
      { method: "GET" },
    );

    if (!response.ok) {
      const detail = await readPythonError(response);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: detail || "Failed to fetch Meta connection status",
      });
    }

    return response.json() as Promise<Record<string, unknown>>;
  }),

  getAuthUrl: metaChannelsProcedure.query(async ({ ctx }) => {
    const tenantId = resolveMetaTenantId(ctx);
    const response = await callPythonBackend(
      `/api/oauth/meta/authorize?tenant_id=${encodeURIComponent(tenantId)}&user_id=${encodeURIComponent(String(ctx.user.id))}`,
      { method: "GET" },
    );

    if (!response.ok) {
      const detail = await readPythonError(response);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: detail || "Failed to get Meta authorization URL",
      });
    }

    return response.json() as Promise<{
      authorization_url: string;
      state: string;
      expires_in: number;
    }>;
  }),

  completeOAuth: rateLimitedMetaOAuthProcedure
    .input(z.object({
      code: z.string().min(1),
      state: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = resolveMetaTenantId(ctx);
      const response = await callPythonBackend("/api/oauth/meta/callback", {
        method: "POST",
        body: {
          code: input.code,
          state: input.state,
          tenant_id: tenantId,
          user_id: ctx.user.id,
        },
      });

      if (!response.ok) {
        const detail = await readPythonError(response);
        throw new TRPCError({
          code: response.status === 403 ? "FORBIDDEN" : "INTERNAL_SERVER_ERROR",
          message: detail || "Meta OAuth completion failed",
        });
      }

      return response.json() as Promise<{
        status: string;
        connection: { provider: string; providerUserId: string };
        pages: Array<Record<string, unknown>>;
      }>;
    }),

  connectPage: metaChannelsProcedure
    .input(z.object({
      pageId: z.number().int().positive(),
      subscribedFields: z.array(z.string().min(1).max(64)).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const page = await verifyPageAccess(
        input.pageId,
        ctx.user.id,
        ctx.tenantId,
        ctx.user.currentTenantId,
      );

      if (page.status !== "active") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Page is not active",
        });
      }

      const response = await callPythonBackend("/api/internal/meta/pages/connect", {
        method: "POST",
        body: {
          page_id: input.pageId,
          subscribed_fields: input.subscribedFields,
        },
      });

      if (!response.ok) {
        const detail = await readPythonError(response);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: detail || "Failed to connect Meta page",
        });
      }

      return response.json() as Promise<Record<string, unknown>>;
    }),

  disconnectPage: metaChannelsProcedure
    .input(z.object({ pageId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await verifyPageAccess(
        input.pageId,
        ctx.user.id,
        ctx.tenantId,
        ctx.user.currentTenantId,
      );

      const response = await callPythonBackend("/api/internal/meta/pages/disconnect", {
        method: "POST",
        body: { page_id: input.pageId },
      });

      if (!response.ok) {
        const detail = await readPythonError(response);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: detail || "Failed to disconnect Meta page",
        });
      }

      return response.json() as Promise<Record<string, unknown>>;
    }),

  updatePageSettings: metaChannelsProcedure
    .input(pageSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      const page = await verifyPageAccess(
        input.pageId,
        ctx.user.id,
        ctx.tenantId,
        ctx.user.currentTenantId,
      );

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (input.aiActionMode !== undefined) {
        updates.aiActionMode = input.aiActionMode;
      }
      if (input.autoSendConfidenceThreshold !== undefined) {
        updates.autoSendConfidenceThreshold = input.autoSendConfidenceThreshold;
      }
      if (input.selectedForInbox !== undefined) {
        updates.selectedForInbox = input.selectedForInbox;
      }
      if (input.selectedForPublishing !== undefined) {
        updates.selectedForPublishing = input.selectedForPublishing;
      }
      if (input.selectedForModeration !== undefined) {
        updates.selectedForModeration = input.selectedForModeration;
      }

      await db
        .update(socialPages)
        .set(updates)
        .where(
          and(
            eq(socialPages.id, page.id),
            eq(socialPages.tenantId, page.tenantId),
          ),
        );

      return {
        pageId: page.id,
        ...updates,
      };
    }),
});
