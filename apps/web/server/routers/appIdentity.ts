import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  createPrivateMiniAppIdentity,
  resolveActiveAppByPublicId,
  resolveMiniAppForViewer,
  resolveAppRouteForTenant,
  setMiniAppVisibility,
} from "../services/appIdentityRepository";
import { resolvePersonalMiniAppPreview } from "../services/personalMiniAppPreview";

type AppIdentityService = Pick<typeof import("../services/appIdentityRepository"), "resolveAppRouteForTenant" | "resolveActiveAppByPublicId" | "createPrivateMiniAppIdentity" | "resolveMiniAppForViewer" | "setMiniAppVisibility"> & {
  resolvePersonalMiniAppPreview?: typeof resolvePersonalMiniAppPreview;
};

function authenticatedTenant(ctx: { user: { currentTenantId?: string | number | null } }) {
  const tenantId = String(ctx.user.currentTenantId ?? "").trim();
  if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
  return tenantId;
}

export function createAppIdentityRouter(service: AppIdentityService = {
  resolveAppRouteForTenant,
  resolveActiveAppByPublicId,
  createPrivateMiniAppIdentity,
  resolveMiniAppForViewer,
  setMiniAppVisibility,
  resolvePersonalMiniAppPreview,
}) {
  return router({
    createMiniApp: protectedProcedure
      .input(z.object({ idempotencyKey: z.string().trim().min(16).max(160).regex(/^[A-Za-z0-9._:-]+$/) }).strict())
      .mutation(async ({ ctx, input }) => {
        const tenantId = authenticatedTenant(ctx);
        const ownerUserId = Number(ctx.user.id);
        if (!Number.isSafeInteger(ownerUserId) || ownerUserId <= 0) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Authenticated owner required" });
        }
        return service.createPrivateMiniAppIdentity({ tenantId, ownerUserId, idempotencyKey: input.idempotencyKey });
      }),
    publishMiniApp: protectedProcedure
      .input(z.object({ appId: z.string().trim().min(1).max(128) }).strict())
      .mutation(async ({ ctx, input }) => {
        const tenantId = authenticatedTenant(ctx);
        const ownerUserId = Number(ctx.user.id);
        if (!Number.isSafeInteger(ownerUserId) || ownerUserId <= 0) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Authenticated owner required" });
        }
        const result = await service.setMiniAppVisibility({ appId: input.appId, tenantId, ownerUserId, visibility: "public" });
        if (!result) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Mini App is not owned or has no verified preview artifact" });
        return result;
      }),
    unpublishMiniApp: protectedProcedure
      .input(z.object({ appId: z.string().trim().min(1).max(128) }).strict())
      .mutation(async ({ ctx, input }) => {
        const tenantId = authenticatedTenant(ctx);
        const ownerUserId = Number(ctx.user.id);
        if (!Number.isSafeInteger(ownerUserId) || ownerUserId <= 0) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Authenticated owner required" });
        }
        const result = await service.setMiniAppVisibility({ appId: input.appId, tenantId, ownerUserId, visibility: "private" });
        if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Mini App unavailable" });
        return result;
      }),
    resolveMiniApp: publicProcedure
      .input(z.object({ appId: z.string().trim().min(1).max(128) }).strict())
      .query(async ({ ctx, input }) => {
        const user = ctx.user;
        const viewer = {
          appId: input.appId,
          tenantId: user?.currentTenantId == null ? null : String(user.currentTenantId),
          userId: user?.id == null ? null : Number(user.id),
        };
        const app = service.resolvePersonalMiniAppPreview
          ? await service.resolvePersonalMiniAppPreview(viewer)
          : await service.resolveMiniAppForViewer(viewer);
        if (!app) throw new TRPCError({ code: "NOT_FOUND", message: "Mini App unavailable" });
        return app;
      }),
    resolveRoute: protectedProcedure
      .input(z.object({
        kind: z.enum(["slug", "custom-domain"]),
        value: z.string().trim().min(1).max(253),
      }).strict())
      .query(async ({ ctx, input }) => {
        const tenantId = authenticatedTenant(ctx);
        return service.resolveAppRouteForTenant({ ...input, tenantId });
      }),
    resolvePublicApp: protectedProcedure
      .input(z.object({ publicAppId: z.string().trim().min(1).max(128) }).strict())
      .query(async ({ ctx, input }) => {
        const tenantId = authenticatedTenant(ctx);
        return service.resolveActiveAppByPublicId({ ...input, tenantId });
      }),
  });
}

export const appIdentityRouter = createAppIdentityRouter();
