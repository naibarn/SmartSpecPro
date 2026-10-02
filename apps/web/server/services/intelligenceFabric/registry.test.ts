import { describe, expect, it } from "vitest";
import { resolveRegisteredSource, type RegistrySnapshot } from "./registry";

const registry: RegistrySnapshot = {
  providers: [{ id: "provider-1", name: "Open Data", ownerType: "government", status: "active" }],
  sources: [{ id: "source-1", providerId: "provider-1", ownerType: "platform", name: "Flood API", sourceType: "API", adapterRef: "adapter-1", sourceContractRef: "contract-1", rightsPolicyRef: "rights-1", qualityProfileRef: "quality-1", geographyCoverageRef: "geo-th", temporalCoverageRef: "time-current", refreshPolicyRef: "refresh-hourly", pricingPolicyRef: "pricing-free", executionPlacementPolicyRef: "placement-th", visibility: "platform", status: "active" }],
  datasets: [{ id: "dataset-1", sourceId: "source-1", name: "Depth", schemaRef: "schema-1", semanticCapabilities: ["flood.depth"], updateMode: "PERIODIC", vectorIndexPolicy: "METADATA_ONLY", status: "active" }],
  rights: [{ id: "rights-1", commercialUse: "allowed", redistribution: "allowed", derivedData: "allowed", rawExport: "forbidden", resultExport: "restricted", modelTrainingUse: "forbidden", crossTenantLearningUse: "forbidden", sublicensing: "forbidden", cachePolicy: "ttl_limited", cacheTtlSeconds: 300, retentionPolicyRef: "retention-short", attributionRequired: true, attributionTextRef: "attribution-1", purposeRestrictions: ["analysis"], audienceRestrictions: ["PUBLIC"], reviewedAt: "2026-09-30T00:00:00.000Z", reviewerRef: "reviewer-1", revision: "r1" }],
};

describe("resolveRegisteredSource", () => {
  it("resolves an active source only when owner, purpose and rights align", () => {
    expect(resolveRegisteredSource(registry, { sourceId: "source-1", datasetId: "dataset-1", authorizationScope: "PUBLIC", purpose: "analysis", audience: "PUBLIC", commercialUse: true })).toMatchObject({ ok: true, value: { sourceId: "source-1", datasetId: "dataset-1", rightsRevision: "r1" } });
  });

  it("fails closed for unknown resale rights and mismatched source relationships", () => {
    expect(resolveRegisteredSource({ ...registry, rights: [{ ...registry.rights[0]!, redistribution: "unknown" }] }, { sourceId: "source-1", datasetId: "dataset-1", authorizationScope: "PUBLIC", purpose: "analysis", audience: "PUBLIC", commercialUse: true, redistributionRequired: true })).toMatchObject({ ok: false, code: "RIGHTS_UNVERIFIED" });
    expect(resolveRegisteredSource({ ...registry, datasets: [{ ...registry.datasets[0]!, id: "dataset-2", sourceId: "source-other" }] }, { sourceId: "source-1", datasetId: "dataset-2", authorizationScope: "PUBLIC", purpose: "analysis", audience: "PUBLIC", commercialUse: true })).toMatchObject({ ok: false, code: "DATASET_SOURCE_MISMATCH" });
  });

  it("blocks suspended providers, revoked sources, and unauthorized tenant scope", () => {
    expect(resolveRegisteredSource({ ...registry, providers: [{ ...registry.providers[0]!, status: "suspended" }] }, { sourceId: "source-1", datasetId: "dataset-1", authorizationScope: "PUBLIC", purpose: "analysis", audience: "PUBLIC", commercialUse: true })).toMatchObject({ ok: false, code: "PROVIDER_UNAVAILABLE" });
    expect(resolveRegisteredSource({ ...registry, sources: [{ ...registry.sources[0]!, status: "suspended" }] }, { sourceId: "source-1", datasetId: "dataset-1", authorizationScope: "PUBLIC", purpose: "analysis", audience: "PUBLIC", commercialUse: true })).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
    expect(resolveRegisteredSource({ ...registry, sources: [{ ...registry.sources[0]!, ownerType: "tenant", ownerId: "tenant-y", visibility: "private" }] }, { sourceId: "source-1", datasetId: "dataset-1", authorizationScope: "TENANT", tenantId: "tenant-x", purpose: "analysis", audience: "PUBLIC", commercialUse: true })).toMatchObject({ ok: false, code: "SOURCE_SCOPE_FORBIDDEN" });
  });

  it("requires an explicit server-side grant for tenant and project scoped sources", () => {
    const scoped: RegistrySnapshot = { ...registry, sources: [{ ...registry.sources[0]!, visibility: "tenant", ownerType: "partner" }] };
    const request = { sourceId: "source-1", datasetId: "dataset-1", authorizationScope: "TENANT" as const, tenantId: "tenant-1", purpose: "analysis", audience: "PUBLIC", commercialUse: true };
    expect(resolveRegisteredSource(scoped, request)).toMatchObject({ ok: false, code: "SOURCE_ACCESS_NOT_AUTHORIZED" });
    expect(resolveRegisteredSource(scoped, { ...request, authorizedSourceIds: ["source-1"] })).toMatchObject({ ok: true });
  });

  it("fails closed when duplicate catalog identifiers make source authority ambiguous", () => {
    expect(resolveRegisteredSource({
      ...registry,
      sources: [...registry.sources, { ...registry.sources[0]!, providerId: "provider-other" }],
    }, { sourceId: "source-1", datasetId: "dataset-1", authorizationScope: "PUBLIC", purpose: "analysis", audience: "PUBLIC", commercialUse: true }))
      .toMatchObject({ ok: false, code: "REGISTRY_REFERENCE_NOT_FOUND" });
  });

  it("fails closed for malformed rights values and oversized catalogs", () => {
    expect(resolveRegisteredSource({
      ...registry,
      rights: [{ ...registry.rights[0]!, cachePolicy: "unrestricted" as never }],
    }, { sourceId: "source-1", datasetId: "dataset-1", authorizationScope: "PUBLIC", purpose: "analysis", audience: "PUBLIC", commercialUse: true }))
      .toMatchObject({ ok: false, code: "RIGHTS_UNVERIFIED" });
    expect(resolveRegisteredSource({ ...registry, sources: Array(10_001).fill(registry.sources[0]!) }, {
      sourceId: "source-1", datasetId: "dataset-1", authorizationScope: "PUBLIC", purpose: "analysis", audience: "PUBLIC", commercialUse: true,
    })).toMatchObject({ ok: false, code: "REGISTRY_REFERENCE_NOT_FOUND" });
  });

  it("rejects secret-bearing unrelated records before resolving a valid source", () => {
    expect(resolveRegisteredSource({
      ...registry,
      sources: [...registry.sources, { ...registry.sources[0]!, id: "source-other", apiKey: "secret" } as never],
    }, { sourceId: "source-1", datasetId: "dataset-1", authorizationScope: "PUBLIC", purpose: "analysis", audience: "PUBLIC", commercialUse: true }))
      .toMatchObject({ ok: false, code: "REGISTRY_REFERENCE_NOT_FOUND" });
    expect(resolveRegisteredSource({
      ...registry,
      rights: [...registry.rights, { ...registry.rights[0]!, id: "rights-other", secretToken: "credential" } as never],
    }, { sourceId: "source-1", datasetId: "dataset-1", authorizationScope: "PUBLIC", purpose: "analysis", audience: "PUBLIC", commercialUse: true }))
      .toMatchObject({ ok: false, code: "RIGHTS_UNVERIFIED" });
  });

  it("expires rights at the supplied request time and enforces geography and residency restrictions", () => {
    const expired = { ...registry, rights: [{ ...registry.rights[0]!, contractualExpiryAt: "2026-10-01T00:00:00.000Z" }] };
    expect(resolveRegisteredSource(expired, {
      sourceId: "source-1", datasetId: "dataset-1", authorizationScope: "PUBLIC", purpose: "analysis", audience: "PUBLIC", commercialUse: true,
      now: new Date("2026-10-02T00:00:00.000Z"),
    })).toMatchObject({ ok: false, code: "RIGHTS_EXPIRED" });
    const restricted = { ...registry, rights: [{ ...registry.rights[0]!, geographicRestrictions: ["TH-10"], residencyRestrictions: ["TH"] }] };
    expect(resolveRegisteredSource(restricted, {
      sourceId: "source-1", datasetId: "dataset-1", authorizationScope: "PUBLIC", purpose: "analysis", audience: "PUBLIC", commercialUse: true,
      geography: "TH-50", residency: "TH",
    })).toMatchObject({ ok: false, code: "GEOGRAPHY_FORBIDDEN" });
    expect(resolveRegisteredSource(restricted, {
      sourceId: "source-1", datasetId: "dataset-1", authorizationScope: "PUBLIC", purpose: "analysis", audience: "PUBLIC", commercialUse: true,
      geography: "TH-10", residency: "US",
    })).toMatchObject({ ok: false, code: "RESIDENCY_FORBIDDEN" });
  });

  it("requires explicit activation policy references and returns cache and attribution controls", () => {
    expect(resolveRegisteredSource({ ...registry, sources: [{ ...registry.sources[0]!, executionPlacementPolicyRef: undefined }] }, {
      sourceId: "source-1", datasetId: "dataset-1", authorizationScope: "PUBLIC", purpose: "analysis", audience: "PUBLIC", commercialUse: true,
    })).toMatchObject({ ok: false, code: "SOURCE_ACTIVATION_INCOMPLETE" });
    expect(resolveRegisteredSource(registry, {
      sourceId: "source-1", datasetId: "dataset-1", authorizationScope: "PUBLIC", purpose: "analysis", audience: "PUBLIC", commercialUse: true,
    })).toMatchObject({ ok: true, value: { cachePolicy: "ttl_limited", cacheTtlSeconds: 300, retentionPolicyRef: "retention-short", geographyCoverageRef: "geo-th" } });
    expect(resolveRegisteredSource({ ...registry, rights: [{ ...registry.rights[0]!, retentionPolicyRef: undefined }] }, {
      sourceId: "source-1", datasetId: "dataset-1", authorizationScope: "PUBLIC", purpose: "analysis", audience: "PUBLIC", commercialUse: true,
    })).toMatchObject({ ok: false, code: "SOURCE_ACTIVATION_INCOMPLETE" });
  });

  it("rejects unrecognized source and dataset policies before granting access", () => {
    expect(resolveRegisteredSource({
      ...registry,
      sources: [{ ...registry.sources[0]!, visibility: "world" as never }],
    }, { sourceId: "source-1", datasetId: "dataset-1", authorizationScope: "TENANT", tenantId: "tenant-1", purpose: "analysis", audience: "PUBLIC", commercialUse: true, authorizedSourceIds: ["source-1"] }))
      .toMatchObject({ ok: false, code: "REGISTRY_REFERENCE_NOT_FOUND" });
    expect(resolveRegisteredSource({
      ...registry,
      datasets: [{ ...registry.datasets[0]!, vectorIndexPolicy: "INDEX_EVERYTHING" as never }],
    }, { sourceId: "source-1", datasetId: "dataset-1", authorizationScope: "PUBLIC", purpose: "analysis", audience: "PUBLIC", commercialUse: true }))
      .toMatchObject({ ok: false, code: "REGISTRY_REFERENCE_NOT_FOUND" });
    const sparseCapabilities = new Array(2) as string[];
    sparseCapabilities[1] = "flood.depth";
    expect(resolveRegisteredSource({
      ...registry,
      datasets: [{ ...registry.datasets[0]!, semanticCapabilities: sparseCapabilities }],
    }, { sourceId: "source-1", datasetId: "dataset-1", authorizationScope: "PUBLIC", purpose: "analysis", audience: "PUBLIC", commercialUse: true }))
      .toMatchObject({ ok: false, code: "REGISTRY_REFERENCE_NOT_FOUND" });
  });

  it("rejects unknown or malformed authorization scopes instead of falling through to broader visibility", () => {
    const scoped: RegistrySnapshot = { ...registry, sources: [{ ...registry.sources[0]!, visibility: "private", ownerType: "partner" }] };
    expect(resolveRegisteredSource(scoped, {
      sourceId: "source-1", datasetId: "dataset-1", authorizationScope: "INTERNAL" as never,
      purpose: "analysis", audience: "PUBLIC", commercialUse: true,
    })).toMatchObject({ ok: false, code: "SOURCE_SCOPE_FORBIDDEN" });
    expect(resolveRegisteredSource(registry, {
      sourceId: 1 as never, datasetId: "dataset-1", authorizationScope: "PUBLIC",
      purpose: "analysis", audience: "PUBLIC", commercialUse: true,
    })).toMatchObject({ ok: false, code: "REGISTRY_REFERENCE_NOT_FOUND" });
    expect(resolveRegisteredSource(registry, {
      sourceId: "source-1", datasetId: "dataset-1", authorizationScope: "PUBLIC",
      purpose: "analysis", audience: "PUBLIC", commercialUse: "false" as never,
    })).toMatchObject({ ok: false, code: "RIGHTS_UNVERIFIED" });
  });
});
