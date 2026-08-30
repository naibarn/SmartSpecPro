import { eq, isNull, or } from "drizzle-orm";

/**
 * Rows created before tenant binding was introduced can still have a NULL
 * tenantId. This is only for an already user-owned query; it is not a public
 * or group-visibility fallback.
 */
export function marketplaceOwnerTenantScope(column: any, tenantId?: string) {
  const normalizedTenantId = tenantId?.trim();
  return normalizedTenantId
    ? or(eq(column, normalizedTenantId), isNull(column))
    : isNull(column);
}
