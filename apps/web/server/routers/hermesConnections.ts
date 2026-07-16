/**
 * Feature 135 — Hermes Grok media worker connections tRPC router.
 *
 * Thin wrapper only: zod parse, ctx extraction, delegate to
 * `hermesConnectionService.ts`. All behavioral rules (tenant scoping,
 * ownership, admin gating for `server_shared`, consent gate, typed
 * `[HERMES_X] ...` errors) live in the service — this router never
 * translates or reformats an error message.
 *
 * Registered as `hermesConnections` in `routers.ts`, next to `mcpConnections`.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  adminDisableHermesConnection,
  adminListHermesConnections,
  adminSetHermesQuota,
  disconnectHermesConnection,
  getHermesAvailability,
  getHermesConnectStatus,
  getHermesConnection,
  listHermesConnections,
  probeHermesConnection,
  setHermesDefaultConnection,
  startHermesConnect,
} from "../services/hermesConnectionService";

const assetTypeSchema = z.enum(["image", "video"]);
const scopeSchema = z.enum(["server_shared", "server_personal", "private_worker"]);

function tenantIdFromCtx(ctx: { tenantId?: unknown; user: { currentTenantId?: unknown } }) {
  const tenantId = ctx.tenantId ?? ctx.user.currentTenantId ?? null;
  return tenantId == null ? null : String(tenantId);
}

function tenantRequiredFromCtx(ctx: { tenantId?: unknown; user: { currentTenantId?: unknown } }): string {
  const tenantId = tenantIdFromCtx(ctx);
  if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
  return tenantId;
}

function isAdminCtx(ctx: { user: { role?: unknown } }): boolean {
  return ctx.user.role === "admin" || ctx.user.role === "system_agent";
}

export const hermesConnectionsRouter = router({
  listConnections: protectedProcedure
    .input(z.object({ assetType: assetTypeSchema.optional() }).optional())
    .query(({ ctx, input }) => listHermesConnections({
      tenantId: tenantRequiredFromCtx(ctx),
      userId: ctx.user.id,
      assetType: input?.assetType,
    })),

  getConnection: protectedProcedure
    .input(z.object({ connectionId: z.string() }))
    .query(({ ctx, input }) => getHermesConnection({
      tenantId: tenantRequiredFromCtx(ctx),
      userId: ctx.user.id,
      connectionId: input.connectionId,
    })),

  getAvailability: protectedProcedure
    .query(({ ctx }) => getHermesAvailability({
      tenantId: tenantRequiredFromCtx(ctx),
    })),

  startConnect: protectedProcedure
    .input(z.object({
      scope: scopeSchema,
      workerId: z.string().optional(),
      label: z.string().max(120).optional(),
      consentAcknowledged: z.boolean(),
    }))
    .mutation(({ ctx, input }) => startHermesConnect({
      tenantId: tenantRequiredFromCtx(ctx),
      userId: ctx.user.id,
      isAdmin: isAdminCtx(ctx),
      scope: input.scope,
      workerId: input.workerId,
      label: input.label,
      consentAcknowledged: input.consentAcknowledged,
    })),

  getConnectStatus: protectedProcedure
    .input(z.object({ connectionId: z.string() }))
    .query(({ ctx, input }) => getHermesConnectStatus({
      tenantId: tenantRequiredFromCtx(ctx),
      userId: ctx.user.id,
      isAdmin: isAdminCtx(ctx),
      connectionId: input.connectionId,
    })),

  setDefault: protectedProcedure
    .input(z.object({ connectionId: z.string(), assetType: assetTypeSchema }))
    .mutation(({ ctx, input }) => setHermesDefaultConnection({
      tenantId: tenantRequiredFromCtx(ctx),
      userId: ctx.user.id,
      connectionId: input.connectionId,
      assetType: input.assetType,
    })),

  disconnect: protectedProcedure
    .input(z.object({ connectionId: z.string() }))
    .mutation(({ ctx, input }) => disconnectHermesConnection({
      tenantId: tenantRequiredFromCtx(ctx),
      userId: ctx.user.id,
      isAdmin: isAdminCtx(ctx),
      connectionId: input.connectionId,
    })),

  probe: protectedProcedure
    .input(z.object({ connectionId: z.string() }))
    .mutation(({ ctx, input }) => probeHermesConnection({
      tenantId: tenantRequiredFromCtx(ctx),
      userId: ctx.user.id,
      isAdmin: isAdminCtx(ctx),
      connectionId: input.connectionId,
    })),

  adminList: adminProcedure
    .query(({ ctx }) => adminListHermesConnections({
      tenantId: tenantRequiredFromCtx(ctx),
    })),

  adminSetQuota: adminProcedure
    .input(z.object({
      connectionId: z.string(),
      dailyJobQuota: z.number().int().min(0).nullable(),
    }))
    .mutation(({ ctx, input }) => adminSetHermesQuota({
      tenantId: tenantRequiredFromCtx(ctx),
      connectionId: input.connectionId,
      dailyJobQuota: input.dailyJobQuota,
    })),

  adminDisable: adminProcedure
    .input(z.object({ connectionId: z.string() }))
    .mutation(({ ctx, input }) => adminDisableHermesConnection({
      tenantId: tenantRequiredFromCtx(ctx),
      connectionId: input.connectionId,
    })),
});
