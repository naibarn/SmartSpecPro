/**
 * Tenant Feature Flags tRPC Router
 *
 * Exposes getFeatureFlags and updateFeatureFlags procedures.
 *
 * RBAC:
 * - getFeatureFlags: any authenticated user (reads own tenant)
 * - updateFeatureFlags: domain_admin (own tenant only, verified against DB) or admin (any tenant)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { router, protectedProcedure, domainAdminProcedure } from "../_core/trpc";
import { clearTenantCache } from "../_core/tenant";
import { getDb } from "../db";
import { tenants } from "../../drizzle/schema";
import {
  validateFeatureFlags,
  getTenantFeatureFlags,
  updateTenantFeatureFlags,
} from "../services/tenantFeatureFlagService";

export const tenantFeatureFlagsRouter = router({
  /**
   * Get resolved feature flags for the caller's current tenant.
   */
  getFeatureFlags: protectedProcedure
    .input(
      z
        .object({
          tenantId: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const tenantId = input?.tenantId ?? ctx.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No tenant context" });
      }

      // Non-admin users can only read their own tenant
      if (input?.tenantId && ctx.user?.role !== "admin") {
        if (input.tenantId !== ctx.tenantId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Cannot read flags for another tenant",
          });
        }
      }

      return getTenantFeatureFlags(tenantId);
    }),

  /**
   * Update feature flags for a tenant.
   *
   * domain_admin: can only update their own tenant (verified via DB-backed
   *   registeredDomain check to prevent Host-header spoofing attacks).
   * admin: can update any tenant (tenantId required).
   */
  updateFeatureFlags: domainAdminProcedure
    .input(
      z.object({
        tenantId: z.string().optional(),
        flags: z.record(z.string(), z.boolean()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user;

      // Determine target tenant
      let targetTenantId: string;

      if (user.role === "admin") {
        // Admin can update any tenant; tenantId is required
        if (!input.tenantId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "tenantId is required for admin operations",
          });
        }
        targetTenantId = input.tenantId;
      } else {
        // domain_admin: verify ownership via DB-backed registeredDomain check
        // to prevent Host-header spoofing attacks
        const registeredDomain = user.registeredDomain;
        if (!registeredDomain) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "domain_admin must have a registeredDomain to update feature flags",
          });
        }

        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database unavailable",
          });
        }

        // If tenantId is explicitly provided, verify it matches the admin's domain
        if (input.tenantId) {
          const [targetTenant] = await db
            .select({ id: tenants.id, primaryDomain: tenants.primaryDomain })
            .from(tenants)
            .where(eq(tenants.id, input.tenantId))
            .limit(1);

          if (!targetTenant || targetTenant.primaryDomain !== registeredDomain) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "domain_admin can only update their own tenant's feature flags",
            });
          }
          targetTenantId = input.tenantId;
        } else {
          // No tenantId provided: resolve via registeredDomain
          const [ownTenant] = await db
            .select({ id: tenants.id })
            .from(tenants)
            .where(eq(tenants.primaryDomain, registeredDomain))
            .limit(1);

          if (!ownTenant) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "No tenant found for your registered domain",
            });
          }
          targetTenantId = ownTenant.id;
        }
      }

      // Validate and strip unrecognized keys
      const validatedFlags = validateFeatureFlags(input.flags);

      // Perform update
      const updatedFlags = await updateTenantFeatureFlags(targetTenantId, validatedFlags);

      // Invalidate tenant cache so changes take effect immediately
      clearTenantCache();

      return updatedFlags;
    }),
});
