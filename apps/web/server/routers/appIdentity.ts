import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  resolveActiveAppByPublicId,
  resolveAppRouteForTenant,
} from "../services/appIdentityRepository";

type AppIdentityService = Pick<typeof import("../services/appIdentityRepository"), "resolveAppRouteForTenant" | "resolveActiveAppByPublicId">;

function authenticatedTenant(ctx: { user: { currentTenantId?: string | number | null } }) {
  const tenantId = String(ctx.user.currentTenantId ?? "").trim();
  if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
  return tenantId;
}

export function createAppIdentityRouter(service: AppIdentityService = {
  resolveAppRouteForTenant,
  resolveActiveAppByPublicId,
}) {
  return router({
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
