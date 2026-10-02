import { describe, expect, it } from "vitest";
import { createGeoSourceAdapterRegistry } from "./registry";
import type { GeoSourceFetchPolicy } from "./fetchPolicy";

const fetchPolicy: GeoSourceFetchPolicy = {
  allowedHosts: ["data.example.org"], allowedPathPrefixes: ["/api/v1/"], maxRedirects: 1,
  allowedContentTypes: ["application/json"], maxCompressedBytes: 1024, maxDecompressedBytes: 4096,
  connectTimeoutMs: 1000, readTimeoutMs: 2000, totalTimeoutMs: 3000,
};

const adapter = {
  sourceRef: "rid-levels",
  providerId: "rid",
  adapterId: "rid-levels-v1",
  contractVersion: "1.0.0",
  endpointUrl: "https://data.example.org/api/v1/levels",
  fetchPolicy,
  ownerRef: "tenant-1",
  configurationRevision: 3,
  approvedLicenseRef: "https://agency.example.org/terms",
  approvedAttribution: "Royal Irrigation Department",
  approvedRetentionClass: "operational-30d",
  allowedPurposes: ["emergency-response", "public-safety"],
  geographyScopes: ["TH-10", "TH-13"],
  capabilityIds: ["river-level"],
};

const sourcePolicy = {
  sourceStatus: "active",
  ownerRef: "tenant-1",
  rightsStatus: "granted",
  licenseRef: "https://agency.example.org/terms",
  attribution: "Royal Irrigation Department",
  allowedPurposes: ["emergency-response"],
  retentionClass: "operational-30d",
  configurationRevision: 3,
};

describe("approved geospatial adapter registry", () => {
  it("resolves only a trusted adapter with matching active source policy and scoped purpose/geography", () => {
    const registry = createGeoSourceAdapterRegistry([adapter], { "rid-levels": sourcePolicy });
    expect(registry.resolve({ sourceRef: "rid-levels", purpose: "emergency-response", geography: "TH-10" })).toMatchObject({
      ok: true,
      value: { sourceRef: "rid-levels", adapterId: "rid-levels-v1", providerId: "rid", url: adapter.endpointUrl, geography: "TH-10" },
    });
  });

  it("blocks unknown sources and never treats an operator-provided URL as fetch authority", () => {
    const registry = createGeoSourceAdapterRegistry([adapter], { "rid-levels": sourcePolicy });
    expect(registry.resolve({ sourceRef: "operator-added", purpose: "emergency-response", geography: "TH-10" })).toMatchObject({ ok: false, code: "GEO_SOURCE_NOT_REGISTERED" });
    expect(createGeoSourceAdapterRegistry([adapter], { "rid-levels": { ...sourcePolicy, endpointUrl: "https://attacker.invalid/" } })
      .resolve({ sourceRef: "rid-levels", purpose: "emergency-response", geography: "TH-10" })).toMatchObject({ ok: false, code: "GEO_SOURCE_POLICY_INVALID" });
  });

  it("fails closed for inactive/revoked rights, missing provenance fields, or stale configuration revisions", () => {
    for (const policy of [
      { ...sourcePolicy, sourceStatus: "paused" },
      { ...sourcePolicy, rightsStatus: "revoked" },
      { ...sourcePolicy, licenseRef: "" },
      { ...sourcePolicy, attribution: "" },
      { ...sourcePolicy, retentionClass: "" },
      { ...sourcePolicy, allowedPurposes: [] },
      { ...sourcePolicy, configurationRevision: 2 },
    ]) {
      const registry = createGeoSourceAdapterRegistry([adapter], { "rid-levels": policy });
      expect(registry.resolve({ sourceRef: "rid-levels", purpose: "emergency-response", geography: "TH-10" }).ok).toBe(false);
    }
  });

  it("requires purposes, source identity and geography to match the trusted adapter definition", () => {
    const registry = createGeoSourceAdapterRegistry([adapter], { "rid-levels": sourcePolicy });
    expect(registry.resolve({ sourceRef: "rid-levels", purpose: "model-training", geography: "TH-10" })).toMatchObject({ ok: false, code: "GEO_SOURCE_PURPOSE_FORBIDDEN" });
    expect(registry.resolve({ sourceRef: "rid-levels", purpose: "emergency-response", geography: "TH-50" })).toMatchObject({ ok: false, code: "GEO_SOURCE_GEOGRAPHY_FORBIDDEN" });
    expect(registry.resolve({ sourceRef: "rid-levels", purpose: "emergency-response", geography: "TH-13", capabilityId: "unknown" })).toMatchObject({ ok: false, code: "GEO_SOURCE_CAPABILITY_FORBIDDEN" });
  });

  it("rejects untrusted adapter URLs and contradictory host/path policies at registry creation", () => {
    expect(() => createGeoSourceAdapterRegistry([{ ...adapter, endpointUrl: "http://data.example.org/api/v1/levels" }], {})).toThrow("GEO_SOURCE_HTTPS_REQUIRED");
    expect(() => createGeoSourceAdapterRegistry([{ ...adapter, endpointUrl: "https://evil.example.org/api/v1/levels" }], {})).toThrow("GEO_SOURCE_HOST_FORBIDDEN");
    expect(() => createGeoSourceAdapterRegistry([{ ...adapter, endpointUrl: "https://data.example.org/private" }], {})).toThrow("GEO_SOURCE_PATH_FORBIDDEN");
    expect(() => createGeoSourceAdapterRegistry([adapter, adapter], {})).toThrow("GEO_SOURCE_ADAPTER_DUPLICATE");
    expect(() => createGeoSourceAdapterRegistry([{ ...adapter, endpointUrl: "https://data.example.org/api/v1/levels?api_key=secret" }], {})).toThrow("GEO_SOURCE_CREDENTIALS_FORBIDDEN");
    expect(() => createGeoSourceAdapterRegistry([{ ...adapter, geographyScopes: [] }], {})).toThrow("GEO_SOURCE_ADAPTER_INVALID");
    expect(() => createGeoSourceAdapterRegistry([{ ...adapter, approvedLicenseRef: "http://agency.example.org/terms" }], {})).toThrow("GEO_SOURCE_ADAPTER_INVALID");
  });
});
