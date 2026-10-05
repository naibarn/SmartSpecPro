type TenantDomain = { primaryDomain: string } | null | undefined;

/** Fail closed: only render SmartAIHub-owned public copy on its verified host. */
export function isSmartAIHubPublicSite(tenant: TenantDomain): boolean {
  const hostname = typeof window === "undefined" ? "" : window.location.hostname;
  const domain = (tenant?.primaryDomain || hostname).trim().toLowerCase().replace(/^www\./, "");
  return domain === "smartaihub.app" || domain === "localhost" || domain === "127.0.0.1";
}
