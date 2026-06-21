import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  completeConnectionOAuth,
  disconnectMcpConnection,
  listMcpConnections,
  listMcpProviderTemplates,
  listMcpUsage,
  startConnectionOAuth,
  testMcpConnection,
  updateMcpConnectionDefaults,
} from "../services/mcpConnectionService";
import {
  createSharedVideoApproval,
  decideSharedVideoApproval,
  listSharedVideoApprovals,
  listMcpConnectionShares,
  upsertMcpConnectionShare,
} from "../services/mcpConnectionSharingService";
import {
  getMaskedMcpProviderConfig,
  saveMcpProviderConfig,
} from "../services/mcpProviderConfigService";
import { auditLogger } from "../services/auditLogger";

const providerKeySchema = z.enum(["magnific", "higgsfield"]);

function tenantIdFromCtx(ctx: { tenantId?: unknown; user: { currentTenantId?: unknown } }) {
  const tenantId = ctx.tenantId ?? ctx.user.currentTenantId ?? null;
  return tenantId == null ? null : String(tenantId);
}

export const mcpConnectionsRouter = router({
  listProviderTemplates: protectedProcedure.query(async ({ ctx }) => (
    listMcpProviderTemplates(tenantIdFromCtx(ctx))
  )),

  listConnections: protectedProcedure.query(async ({ ctx }) => (
    listMcpConnections({ tenantId: tenantIdFromCtx(ctx), userId: ctx.user.id })
  )),

  startOAuth: protectedProcedure
    .input(z.object({ providerKey: providerKeySchema, connectionId: z.string().min(1).optional() }))
    .mutation(async ({ ctx, input }) => (
      startConnectionOAuth({
        tenantId: tenantIdFromCtx(ctx),
        userId: ctx.user.id,
        providerKey: input.providerKey,
        reconnectConnectionId: input.connectionId,
        publicUrl: ctx.publicUrl,
      })
    )),

  completeOAuth: protectedProcedure
    .input(z.object({ providerKey: providerKeySchema, code: z.string().min(1), state: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => (
      completeConnectionOAuth({ tenantId: tenantIdFromCtx(ctx), userId: ctx.user.id, ...input })
    )),

  testConnection: protectedProcedure
    .input(z.object({ connectionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => (
      testMcpConnection({ tenantId: tenantIdFromCtx(ctx), userId: ctx.user.id, connectionId: input.connectionId })
    )),

  reconnect: protectedProcedure
    .input(z.object({ providerKey: providerKeySchema, connectionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => (
      startConnectionOAuth({
        tenantId: tenantIdFromCtx(ctx),
        userId: ctx.user.id,
        providerKey: input.providerKey,
        reconnectConnectionId: input.connectionId,
        publicUrl: ctx.publicUrl,
      })
    )),

  disconnect: protectedProcedure
    .input(z.object({ connectionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => (
      disconnectMcpConnection({ tenantId: tenantIdFromCtx(ctx), userId: ctx.user.id, connectionId: input.connectionId })
    )),

  updateDefaults: protectedProcedure
    .input(z.object({
      connectionId: z.string().min(1),
      defaultForImage: z.boolean().optional(),
      defaultForVideo: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => (
      updateMcpConnectionDefaults({ tenantId: tenantIdFromCtx(ctx), userId: ctx.user.id, ...input })
    )),

  listShares: protectedProcedure
    .input(z.object({ connectionId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const tenantId = tenantIdFromCtx(ctx);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return listMcpConnectionShares({ tenantId, ownerUserId: ctx.user.id, connectionId: input?.connectionId });
    }),

  updateShare: protectedProcedure
    .input(z.object({
      connectionId: z.string().min(1),
      groupId: z.number().int(),
      enabled: z.boolean(),
      allowedAssetTypes: z.array(z.enum(["image", "video"])).default(["image"]),
      allowedTools: z.array(z.string()).optional(),
      allowedModels: z.array(z.string()).optional(),
      dailyUseLimit: z.number().int().positive().nullable().optional(),
      concurrencyLimit: z.number().int().positive().nullable().optional(),
      requiresVideoApproval: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = tenantIdFromCtx(ctx);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return upsertMcpConnectionShare({ tenantId, ownerUserId: ctx.user.id, ...input });
    }),

  requestSharedVideoApproval: protectedProcedure
    .input(z.object({
      connectionId: z.string().min(1),
      shareId: z.string().min(1),
      groupId: z.number().int(),
      ownerUserId: z.number().int(),
      promptHash: z.string().min(1).max(128),
      requestHash: z.string().min(1).max(128),
      redactedRequestSummary: z.record(z.unknown()).default({}),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = tenantIdFromCtx(ctx);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return createSharedVideoApproval({
        tenantId,
        actorUserId: ctx.user.id,
        ...input,
      });
    }),

  listSharedVideoApprovals: protectedProcedure
    .input(z.object({
      role: z.enum(["owner", "actor"]).default("owner"),
      status: z.enum(["pending", "approved", "denied", "expired", "used"]).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const tenantId = tenantIdFromCtx(ctx);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return listSharedVideoApprovals({
        tenantId,
        userId: ctx.user.id,
        role: input?.role ?? "owner",
        status: input?.status,
      });
    }),

  decideSharedVideoApproval: protectedProcedure
    .input(z.object({
      approvalId: z.string().min(1),
      status: z.enum(["approved", "denied"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = tenantIdFromCtx(ctx);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return decideSharedVideoApproval({
        tenantId,
        ownerUserId: ctx.user.id,
        approvalId: input.approvalId,
        status: input.status,
      });
    }),

  listUsage: protectedProcedure
    .input(z.object({ connectionId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => (
      listMcpUsage({ tenantId: tenantIdFromCtx(ctx), userId: ctx.user.id, connectionId: input?.connectionId })
    )),

  getProviderConfig: adminProcedure.query(async () => getMaskedMcpProviderConfig()),

  saveProviderConfig: adminProcedure
    .input(z.object({
      callbackBaseUrl: z.string().url().optional(),
      redirectAllowlist: z.array(z.string().url()).optional(),
      timeoutMs: z.number().int().min(1000).max(120000).optional(),
      retryCount: z.number().int().min(0).max(5).optional(),
      schemaCacheTtlSeconds: z.number().int().min(60).max(86400).optional(),
      providers: z.record(providerKeySchema, z.object({
        clientId: z.string().optional(),
        clientSecret: z.string().optional(),
        authorizationUrl: z.string().url().optional(),
        tokenUrl: z.string().url().optional(),
        enabled: z.boolean().optional(),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await saveMcpProviderConfig(input, ctx.user.id);
      auditLogger.log({
        eventType: "mcp_connect_provider_config_updated",
        userId: ctx.user.id,
        tenantId: tenantIdFromCtx(ctx),
        metadata: {
          providerKeys: input.providers ? Object.keys(input.providers) : [],
          callbackBaseUrlUpdated: Boolean(input.callbackBaseUrl),
          redirectAllowlistUpdated: Boolean(input.redirectAllowlist),
          timeoutUpdated: input.timeoutMs !== undefined,
          retryUpdated: input.retryCount !== undefined,
          schemaCacheTtlUpdated: input.schemaCacheTtlSeconds !== undefined,
        },
      });
      return result;
    }),
});
