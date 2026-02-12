export type TenantIdValue = number | string;

function parseTenantId(value: unknown): TenantIdValue | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (/^\d+$/.test(trimmed)) {
      const parsed = Number.parseInt(trimmed, 10);
      if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return trimmed;
  }

  return null;
}

function normalizeTenantIdVarchar(value: unknown): string | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return String(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed;
  }

  return null;
}

/**
 * Resolve tenant ID for library/runtime operations.
 *
 * Prefer request tenant context first because it reflects current domain routing.
 * Fall back to user profile tenant when request context is unavailable.
 */
export function resolveTenantId(
  ctxTenantId: unknown,
  userCurrentTenantId: unknown,
): TenantIdValue | null {
  const ctxTenantIdParsed = parseTenantId(ctxTenantId);
  const userTenantIdParsed = parseTenantId(userCurrentTenantId);

  // Compatibility fallback:
  // In mixed-schema environments, request context can be a string tenant slug
  // while user profile still stores a numeric tenant ID. Prefer numeric profile ID
  // to avoid breaking integer-typed tenant foreign keys.
  if (
    typeof ctxTenantIdParsed === "string" &&
    typeof userTenantIdParsed === "number"
  ) {
    return userTenantIdParsed;
  }

  if (ctxTenantIdParsed !== null) return ctxTenantIdParsed;
  if (userTenantIdParsed !== null) return userTenantIdParsed;

  return null;
}

/**
 * Resolve tenant ID as a canonical varchar/string value.
 *
 * Use this for boundary flows backed by varchar tenant IDs.
 * Preference order: request tenant context, then user current tenant.
 */
export function resolveTenantIdVarchar(
  ctxTenantId: unknown,
  userCurrentTenantId: unknown,
): string | null {
  const fromContext = normalizeTenantIdVarchar(ctxTenantId);
  if (fromContext !== null) return fromContext;

  const fromUser = normalizeTenantIdVarchar(userCurrentTenantId);
  if (fromUser !== null) return fromUser;

  return null;
}
