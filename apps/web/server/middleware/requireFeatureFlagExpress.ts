/**
 * Express Middleware Factory: requireFeatureFlagExpress
 *
 * Creates an Express middleware that checks a tenant feature flag before
 * allowing the route handler to proceed.
 *
 * Usage:
 *   app.post("/api/webhooks/trigger/:triggerId",
 *     requireFeatureFlagExpress("webhookTriggers"),
 *     webhookHandler
 *   );
 *
 * Reads tenant from req.tenant (TenantRequest) and checks the flag.
 * Returns 403 JSON response if flag is disabled.
 * Returns 503 if the database is unavailable (fail-closed for security).
 */

import type { Response, NextFunction } from "express";
import type { TenantRequest } from "../_core/tenant";
import { getDb } from "../db";
import { tenants } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { isFeatureEnabled } from "../services/tenantFeatureFlagService";
import type { TenantFeatureFlagKey } from "../../shared/featureFlags";

/**
 * Creates an Express middleware that enforces a tenant feature flag.
 *
 * @param flag - The feature flag key to check
 */
export function requireFeatureFlagExpress(flag: TenantFeatureFlagKey) {
  return async (req: TenantRequest, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.tenant?.id;

    if (!tenantId) {
      res.status(403).json({
        error: `Feature '${flag}' is not available (no tenant context)`,
      });
      return;
    }

    try {
      const db = await getDb();

      // Fail closed if DB unavailable — do not reveal feature state
      if (!db) {
        res.status(503).json({ error: "Feature flag check failed (service unavailable)" });
        return;
      }

      const [row] = await db
        .select({ featureFlags: tenants.featureFlags })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      const storedFlags = (row?.featureFlags as Record<string, boolean>) ?? null;

      if (!isFeatureEnabled(storedFlags, flag)) {
        res.status(403).json({
          error: `Feature '${flag}' is not enabled for this tenant`,
        });
        return;
      }

      next();
    } catch {
      res.status(503).json({ error: "Feature flag check failed" });
    }
  };
}
