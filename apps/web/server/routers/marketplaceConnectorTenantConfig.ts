import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { tenants } from "../../drizzle/schema";
import { marketplaceConnectorTenantConfigSchema } from "../../shared/marketplaceConnectorTenantConfig";
import { router, domainAdminProcedure } from "../_core/trpc";
import { clearTenantCache } from "../_core/tenant";
import { getDb } from "../db";
import {
  getMaskedMarketplaceConnectorTenantConfig,
  updateMarketplaceConnectorTenantConfig,
} from "../services/marketplaceConnectorTenantConfigService";

async function resolveWritableTenantId(user: any, tenantId?: string | null): Promise<string> {
  if (user.role === "admin") {
    if (!tenantId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "tenantId is required for admin operations" });
    }
    return tenantId;
  }

  const registeredDomain = user.registeredDomain;
  if (!registeredDomain) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "domain_admin must have a registeredDomain to update tenant connector configuration",
    });
  }

  const db = getDb();
  if (tenantId) {
    const [targetTenant] = await db
      .select({ id: tenants.id, primaryDomain: tenants.primaryDomain })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!targetTenant || targetTenant.primaryDomain !== registeredDomain) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "domain_admin can only update their own tenant connector configuration",
      });
    }
    return targetTenant.id;
  }

  const [ownTenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.primaryDomain, registeredDomain))
    .limit(1);
  if (!ownTenant) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No tenant found for your registered domain" });
  }
  return ownTenant.id;
}

export const marketplaceConnectorTenantConfigRouter = router({
  getConfig: domainAdminProcedure
    .input(z.object({ tenantId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const tenantId = await resolveWritableTenantId(ctx.user, input?.tenantId ?? ctx.tenantId ?? null);
      return getMaskedMarketplaceConnectorTenantConfig(tenantId);
    }),

  updateConfig: domainAdminProcedure
    .input(z.object({
      tenantId: z.string().optional(),
      config: marketplaceConnectorTenantConfigSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = await resolveWritableTenantId(ctx.user, input.tenantId ?? ctx.tenantId ?? null);
      const result = await updateMarketplaceConnectorTenantConfig(tenantId, input.config);
      clearTenantCache();
      return result;
    }),
});
