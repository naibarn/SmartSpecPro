function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return fallback;
  return ["1", "true", "yes", "on"].includes(normalized);
}

function parseTenantAllowlist(raw: string | undefined): Set<number> | null {
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isInteger(value) && value > 0);
  if (!ids.length) return null;
  return new Set(ids);
}

export function isLibraryEnabledForTenant(tenantId: number | null | undefined): boolean {
  const enabled = parseBoolean(process.env.LIBRARY_ENABLED, true);
  if (!enabled) return false;

  const allowlist = parseTenantAllowlist(process.env.LIBRARY_ENABLED_TENANTS);
  if (!allowlist) return true;

  // Admin/global operations may not carry explicit tenant context.
  if (tenantId === null || tenantId === undefined) return true;
  return allowlist.has(tenantId);
}

