import { parseGeoSourcePolicy } from "./contracts";
import { validateGeoSourceFetchPolicy, type GeoSourceFetchPolicy } from "./fetchPolicy";

export type GeoSourceRegistryErrorCode =
  | "GEO_SOURCE_NOT_REGISTERED"
  | "GEO_SOURCE_POLICY_INVALID"
  | "GEO_SOURCE_PURPOSE_FORBIDDEN"
  | "GEO_SOURCE_GEOGRAPHY_FORBIDDEN"
  | "GEO_SOURCE_CAPABILITY_FORBIDDEN";

export interface GeoSourceAdapterDefinition {
  readonly sourceRef: string;
  readonly providerId: string;
  readonly adapterId: string;
  readonly contractVersion: string;
  readonly endpointUrl: string;
  readonly fetchPolicy: GeoSourceFetchPolicy;
  readonly ownerRef: string;
  readonly configurationRevision: number;
  readonly approvedLicenseRef: string;
  readonly approvedAttribution: string;
  readonly approvedRetentionClass: string;
  readonly allowedPurposes: readonly string[];
  readonly geographyScopes: readonly string[];
  readonly capabilityIds: readonly string[];
}

function fail(code: GeoSourceRegistryErrorCode) {
  return { ok: false as const, code };
}

/**
 * Creates an allowlisted adapter registry. Runtime source policy is supplied
 * separately so revocation and rights changes take effect without changing
 * the compiled adapter definition.
 */
export function createGeoSourceAdapterRegistry(
  adapters: readonly GeoSourceAdapterDefinition[],
  policies: Readonly<Record<string, unknown>>,
) {
  const bySource = new Map<string, GeoSourceAdapterDefinition>();
  for (const adapter of adapters) {
    const validId = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value);
    const validList = (values: readonly string[], max: number) => Array.isArray(values) && values.length > 0 && values.length <= max && values.every(validId) && new Set(values).size === values.length;
    if (!validId(adapter.sourceRef) || !validId(adapter.providerId) || !validId(adapter.adapterId) || !validId(adapter.contractVersion) ||
      !validId(adapter.ownerRef) || !Number.isSafeInteger(adapter.configurationRevision) || adapter.configurationRevision < 1 ||
      !validList(adapter.allowedPurposes, 16) || !validList(adapter.geographyScopes, 256) || !validList(adapter.capabilityIds, 128) ||
      typeof adapter.approvedLicenseRef !== "string" || adapter.approvedLicenseRef.length > 512 ||
      typeof adapter.approvedAttribution !== "string" || !adapter.approvedAttribution.trim() || adapter.approvedAttribution.length > 512 ||
      !validId(adapter.approvedRetentionClass)) throw new Error("GEO_SOURCE_ADAPTER_INVALID");
    if (bySource.has(adapter.sourceRef)) throw new Error("GEO_SOURCE_ADAPTER_DUPLICATE");
    validateGeoSourceFetchPolicy(adapter.fetchPolicy);
    const url = new URL(adapter.endpointUrl);
    if (url.protocol !== "https:") throw new Error("GEO_SOURCE_HTTPS_REQUIRED");
    if (url.username || url.password) throw new Error("GEO_SOURCE_CREDENTIALS_FORBIDDEN");
    if ([...url.searchParams.keys()].some(key => /(?:api[_-]?key|authorization|auth|cookie|credential|password|secret|token|^key$)/i.test(key))) throw new Error("GEO_SOURCE_CREDENTIALS_FORBIDDEN");
    let licenseUrl: URL;
    try { licenseUrl = new URL(adapter.approvedLicenseRef); }
    catch { throw new Error("GEO_SOURCE_ADAPTER_INVALID"); }
    if (licenseUrl.protocol !== "https:" || licenseUrl.username || licenseUrl.password) throw new Error("GEO_SOURCE_ADAPTER_INVALID");
    if (!adapter.fetchPolicy.allowedHosts.some(host => host.toLowerCase() === url.hostname.toLowerCase())) throw new Error("GEO_SOURCE_HOST_FORBIDDEN");
    if (!adapter.fetchPolicy.allowedPathPrefixes.some(prefix => url.pathname === prefix || (prefix.endsWith("/") ? url.pathname.startsWith(prefix) : url.pathname.startsWith(`${prefix}/`)))) throw new Error("GEO_SOURCE_PATH_FORBIDDEN");
    bySource.set(adapter.sourceRef, adapter);
  }

  return {
    resolve(input: { readonly sourceRef: string; readonly purpose: string; readonly geography: string; readonly capabilityId?: string }) {
      const adapter = bySource.get(input.sourceRef);
      if (!adapter) return fail("GEO_SOURCE_NOT_REGISTERED");
      const policy = parseGeoSourcePolicy(policies[input.sourceRef]);
      if (!policy.ok || policy.value.ownerRef !== adapter.ownerRef ||
        policy.value.configurationRevision !== adapter.configurationRevision ||
        policy.value.licenseRef !== adapter.approvedLicenseRef ||
        policy.value.attribution !== adapter.approvedAttribution ||
        policy.value.retentionClass !== adapter.approvedRetentionClass ||
        policy.value.allowedPurposes.some(purpose => !adapter.allowedPurposes.includes(purpose))) {
        return fail("GEO_SOURCE_POLICY_INVALID");
      }
      if (!adapter.allowedPurposes.includes(input.purpose) || !policy.value.allowedPurposes.includes(input.purpose)) return fail("GEO_SOURCE_PURPOSE_FORBIDDEN");
      if (!adapter.geographyScopes.includes(input.geography)) return fail("GEO_SOURCE_GEOGRAPHY_FORBIDDEN");
      if (input.capabilityId !== undefined && !adapter.capabilityIds.includes(input.capabilityId)) return fail("GEO_SOURCE_CAPABILITY_FORBIDDEN");
      return { ok: true as const, value: { sourceRef: adapter.sourceRef, adapterId: adapter.adapterId, providerId: adapter.providerId, contractVersion: adapter.contractVersion, url: adapter.endpointUrl, geography: input.geography, configurationRevision: adapter.configurationRevision, fetchPolicy: adapter.fetchPolicy } };
    },
  };
}
