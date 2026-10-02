const ADMIN_SOURCE_REGISTRY_ROUTES = new Set([
  "operations.intel.sources",
  "operations.intel.source.create",
  "operations.intel.source.review",
]);

/** Platform admins are the system's highest role; domain admins get only source-registry access here. */
export function isAdminIntelligenceRegistryRoute(
  routeId: string,
  role: unknown,
): boolean {
  return (
    (role === "admin" || role === "domain_admin") &&
    ADMIN_SOURCE_REGISTRY_ROUTES.has(routeId)
  );
}

export function canDomainAdminReviewIntelligenceSource(
  role: unknown,
  dataClassification: unknown,
): boolean {
  return role === "domain_admin" && dataClassification === "general";
}
