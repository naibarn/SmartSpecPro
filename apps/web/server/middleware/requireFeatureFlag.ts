/**
 * tRPC Middleware Factory: requireFeatureFlag
 *
 * Creates a tRPC middleware that checks a tenant feature flag before
 * allowing the procedure to proceed.
 *
 * Usage:
 *   protectedProcedure
 *     .use(requireFeatureFlag("canvas"))
 *     .query(async ({ ctx }) => { ... })
 *
 * When the flag is false (or missing with a false default),
 * throws TRPCError { code: "FORBIDDEN" }
 *
 * When the database is unavailable, fails closed (throws FORBIDDEN)
 * to prevent accidental feature exposure during outages.
 */

import { TRPCError } from "@trpc/server";
import { middleware } from "../_core/trpc";
import { isTenantFeatureEnabled } from "../services/tenantFeatureFlagService";
import type { TenantFeatureFlagKey } from "../../shared/featureFlags";

/**
 * Creates a tRPC middleware that enforces a tenant feature flag.
 *
 * @param flag - The feature flag key to check
 */
export function requireFeatureFlag(flag: TenantFeatureFlagKey) {
  return middleware(async ({ ctx, next }) => {
    const tenantId = ctx.tenantId;

    if (!tenantId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Feature '${flag}' is not available (no tenant context)`,
      });
    }

    if (!(await isTenantFeatureEnabled(tenantId, flag))) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Feature '${flag}' is not enabled for this tenant`,
      });
    }

    return next();
  });
}
