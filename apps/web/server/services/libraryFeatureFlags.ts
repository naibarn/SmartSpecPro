function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return fallback;
  return ["1", "true", "yes", "on"].includes(normalized);
}

function normalizeTenantIdValue(value: unknown): string | null {
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

function parseTenantAllowlist(raw: string | undefined): Set<string> | null {
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((value) => normalizeTenantIdValue(value))
    .filter((value): value is string => Boolean(value));
  if (!ids.length) return null;
  return new Set(ids);
}

export function isLibraryEnabledForTenant(tenantId: unknown): boolean {
  const enabled = parseBoolean(process.env.LIBRARY_ENABLED, true);
  if (!enabled) return false;

  const allowlist = parseTenantAllowlist(process.env.LIBRARY_ENABLED_TENANTS);
  if (!allowlist) return true;

  const normalized = normalizeTenantIdValue(tenantId);

  // Admin/global operations may not carry explicit tenant context.
  if (!normalized) return true;
  return allowlist.has(normalized);
}
