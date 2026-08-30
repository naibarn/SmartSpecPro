export function normalizeGalleryTenantId(
  value: string | number | null | undefined
): string | null {
  const tenantId = String(value ?? "").trim();
  if (
    !tenantId ||
    tenantId.length > 36 ||
    tenantId.toLowerCase() === "nan"
  ) {
    return null;
  }
  return tenantId;
}
