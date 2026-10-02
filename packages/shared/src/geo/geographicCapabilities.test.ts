import { describe, expect, it } from "vitest";
import {
  GEO_CAPABILITY_MANIFEST_SCHEMA_VERSION,
  resolveGeographicCapability,
  type GeographicCapabilityManifest,
  type GeographicCapabilityRequest,
} from "./geographicCapabilities";

const request = (overrides: Partial<GeographicCapabilityRequest> = {}): GeographicCapabilityRequest => ({
  capability: "weather",
  geography: {
    crs: "EPSG:4326",
    boundaryRevision: "th-boundaries-2026-01",
    scopes: [
      { id: "TH:10:Khet-A", kind: "admin2" },
      { id: "TH:10", kind: "admin1" },
      { id: "TH", kind: "country" },
    ],
  },
  expectedPackVersions: { "global-core": "1.0.0", thailand: "2.0.0" },
  now: "2026-10-01T00:05:00.000Z",
  ...overrides,
});

const manifest = (overrides: Partial<GeographicCapabilityManifest> = {}): GeographicCapabilityManifest => ({
  id: "global-weather-th",
  packId: "global-core",
  packVersion: "1.0.0",
  schemaVersion: GEO_CAPABILITY_MANIFEST_SCHEMA_VERSION,
  capability: "weather",
  scope: { id: "TH", kind: "country" },
  boundaryRevision: "th-boundaries-2026-01",
  source: {
    id: "global-weather",
    rights: "permitted",
    coverage: "complete",
    health: "healthy",
    observedAt: "2026-10-01T00:00:00.000Z",
    maxAgeMs: 600_000,
  },
  ...overrides,
});

describe("geographic capability resolver", () => {
  it("keeps a country-level map/weather capability usable while not inventing local hydrology", () => {
    expect(resolveGeographicCapability(request(), [manifest()])).toMatchObject({
      status: "AVAILABLE",
      resolvedScope: { id: "TH", kind: "country" },
    });
    expect(resolveGeographicCapability(request({ capability: "hydrology" }), [manifest()])).toMatchObject({
      status: "NOT_CONFIGURED",
      resolution: "resolved",
      reason: "no_matching_manifest",
    });
  });

  it("uses the most-specific declared scope and preserves a provincial degradation over a healthy country average", () => {
    const province = manifest({
      id: "th-10-weather",
      packId: "thailand",
      packVersion: "2.0.0",
      scope: { id: "TH:10", kind: "admin1" },
      source: { ...manifest().source, id: "provincial-weather", coverage: "partial", health: "degraded" },
    });
    expect(resolveGeographicCapability(request(), [manifest(), province])).toMatchObject({
      status: "DEGRADED",
      resolvedScope: { id: "TH:10", kind: "admin1" },
      reason: "source_health_degraded",
    });
  });

  it.each([
    ["rights", { rights: "unknown" }, "NOT_CONFIGURED", "source_rights_missing"],
    ["coverage", { coverage: "unknown" }, "NOT_CONFIGURED", "coverage_unknown"],
    ["health", { health: "unknown" }, "TEMPORARILY_UNAVAILABLE", "source_health_unknown"],
    ["freshness", { observedAt: undefined }, "TEMPORARILY_UNAVAILABLE", "freshness_unknown"],
  ] as const)("fails closed when %s evidence is missing", (_name, source, status, reason) => {
    expect(resolveGeographicCapability(request(), [manifest({ source: { ...manifest().source, ...source } })])).toMatchObject({
      status,
      reason,
    });
  });

  it("rejects stale pack, schema, and boundary versions as explicit unknown results", () => {
    expect(resolveGeographicCapability(request({ expectedPackVersions: { "global-core": "9.9.9" } }), [manifest()]))
      .toMatchObject({ status: "UNKNOWN", resolution: "unknown", reason: "pack_version_mismatch" });
    expect(resolveGeographicCapability(request(), [manifest({ schemaVersion: 999 })]))
      .toMatchObject({ status: "UNKNOWN", resolution: "unknown", reason: "schema_version_unsupported" });
    expect(resolveGeographicCapability(request(), [manifest({ boundaryRevision: "old-boundaries" })]))
      .toMatchObject({ status: "UNKNOWN", resolution: "unknown", reason: "boundary_revision_mismatch" });
  });

  it("uses a stable source-id tie break within the same geographic scope", () => {
    const zebra = manifest({ id: "zebra", source: { ...manifest().source, id: "zebra" } });
    const alpha = manifest({ id: "alpha", source: { ...manifest().source, id: "alpha" } });
    expect(resolveGeographicCapability(request(), [zebra, alpha])).toMatchObject({ manifestId: "alpha", sourceId: "alpha" });
  });

  it("reports every same-scope source status while choosing a deterministic healthy representative", () => {
    const degraded = manifest({ id: "alpha", source: { ...manifest().source, id: "alpha", health: "degraded" } });
    const healthy = manifest({ id: "zeta", source: { ...manifest().source, id: "zeta" } });
    const result = resolveGeographicCapability(request(), [degraded, healthy]);
    expect(result).toMatchObject({ status: "AVAILABLE", manifestId: "zeta", sourceId: "zeta" });
    expect(result.sourceStatuses).toEqual([
      { manifestId: "alpha", sourceId: "alpha", status: "DEGRADED", reason: "source_health_degraded" },
      { manifestId: "zeta", sourceId: "zeta", status: "AVAILABLE", reason: "available" },
    ]);
  });

  it.each([
    [Number.NaN, "2026-10-01T00:00:00.000Z"],
    [600_000, "2026-10-01T00:06:00.000Z"],
  ])("fails closed for invalid or future freshness evidence", (maxAgeMs, observedAt) => {
    expect(resolveGeographicCapability(request(), [manifest({ source: { ...manifest().source, maxAgeMs, observedAt } })]))
      .toMatchObject({ status: "TEMPORARILY_UNAVAILABLE", reason: "freshness_unknown" });
  });

  it("does not infer geography or accept a CRS outside the shared global coordinate contract", () => {
    expect(resolveGeographicCapability(request({ geography: { crs: "EPSG:3857", boundaryRevision: "th-boundaries-2026-01", scopes: [] } }), [manifest()]))
      .toMatchObject({ status: "UNKNOWN", resolution: "unknown", reason: "unsupported_crs" });
    expect(resolveGeographicCapability(request({ geography: { crs: "EPSG:4326", boundaryRevision: "th-boundaries-2026-01", scopes: [] } }), [manifest()]))
      .toMatchObject({ status: "UNKNOWN", resolution: "unknown", reason: "geography_unknown" });
  });
});
