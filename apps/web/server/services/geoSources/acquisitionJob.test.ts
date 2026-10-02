import { beforeEach, describe, expect, it, vi } from "vitest";

const { createCanonicalJobInTransaction } = vi.hoisted(() => ({ createCanonicalJobInTransaction: vi.fn() }));
vi.mock("../jobControlPlane", () => ({ createCanonicalJobInTransaction }));

import { buildGeoSourceRefreshJob, enqueueGeoSourceRefreshJobInTransaction, type GeoSourceRegistryResolver } from "./acquisitionJob";

const source = { id: "source-row-1", tenantId: "tenant-1", sourceRef: "agency:river-levels", status: "active", policy: {
  sourceStatus: "active", ownerRef: "agency:water", rightsStatus: "granted", licenseRef: "https://data.example.org/license",
  attribution: "Agency water data", allowedPurposes: ["public-emergency"], retentionClass: "short", configurationRevision: 3,
} } as const;
const registry: GeoSourceRegistryResolver = {
  resolve: vi.fn(() => ({ ok: true as const, value: {
    sourceRef: source.sourceRef,
    adapterId: "agency-river-json",
    contractVersion: "river-json-v1",
    configurationRevision: 3,
  } })),
};
const windowStart = "2026-10-01T00:00:00.000Z";

describe("geo source refresh admission", () => {
  beforeEach(() => vi.clearAllMocks());
  it("admits only a registered adapter and creates a stable, bounded canonical job envelope", () => {
    const result = buildGeoSourceRefreshJob({ source, registry, windowStart, purpose: "public-emergency", geography: "TH" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.definition).toMatchObject({
      jobType: "geo.source.refresh",
      executionClass: "long",
      tenantId: source.tenantId,
      idempotencyKey: `geo-source-refresh:${source.id}:3:${windowStart}`,
      activeDedupeKey: `geo-source-refresh:${source.id}`,
      input: {
        sourceId: source.id,
        sourceRef: source.sourceRef,
        configurationRevision: 3,
        adapterId: "agency-river-json",
        adapterVersion: "river-json-v1",
        windowStart,
      },
    });
    expect(JSON.stringify(result.definition.input)).not.toMatch(/https?:|token|secret|credential/i);
    expect(buildGeoSourceRefreshJob({ source, registry, windowStart, purpose: "public-emergency", geography: "TH" })).toEqual(result);
  });

  it("does not fetch pending, paused, or revoked source rows", () => {
    vi.clearAllMocks();
    for (const status of ["pending_review", "paused", "revoked", "disabled"]) {
      const result = buildGeoSourceRefreshJob({ source: { ...source, status }, registry, windowStart, purpose: "public-emergency", geography: "TH" });
      expect(result).toEqual({ ok: false, code: "GEO_SOURCE_NOT_ACTIVE" });
    }
    expect(registry.resolve).not.toHaveBeenCalled();
  });

  it("does not admit unknown or invalidated adapter policy", () => {
    const blocked: GeoSourceRegistryResolver = { resolve: () => ({ ok: false, code: "GEO_SOURCE_POLICY_INVALID" }) };
    expect(buildGeoSourceRefreshJob({ source, registry: blocked, windowStart, purpose: "public-emergency", geography: "TH" })).toEqual({
      ok: false, code: "GEO_SOURCE_ADAPTER_NOT_APPROVED",
    });
  });

  it("rejects stale adapter revisions and policy without explicit rights", () => {
    const staleRegistry: GeoSourceRegistryResolver = { resolve: () => ({ ok: true, value: {
      sourceRef: source.sourceRef, adapterId: "agency-river-json", contractVersion: "river-json-v1", configurationRevision: 2,
    } }) };
    expect(buildGeoSourceRefreshJob({ source, registry: staleRegistry, windowStart, purpose: "public-emergency", geography: "TH" })).toEqual({
      ok: false, code: "GEO_SOURCE_ADAPTER_NOT_APPROVED",
    });
    expect(buildGeoSourceRefreshJob({ source: { ...source, policy: { ...source.policy, rightsStatus: "unknown" } }, registry, windowStart, purpose: "public-emergency", geography: "TH" })).toEqual({
      ok: false, code: "GEO_SOURCE_ADAPTER_NOT_APPROVED",
    });
  });

  it("rejects invalid cadence-window identity instead of weakening idempotency", () => {
    expect(buildGeoSourceRefreshJob({ source, registry, windowStart: "2026-10-01T00:00:00Z", purpose: "public-emergency", geography: "TH" })).toEqual({
      ok: false, code: "GEO_SOURCE_WINDOW_INVALID",
    });
  });

  it("creates the canonical job and outbox intent through the caller transaction", async () => {
    const query = { transaction: "caller-owned" };
    createCanonicalJobInTransaction.mockResolvedValue({ jobId: "canonical-job-1", created: true });
    const result = await enqueueGeoSourceRefreshJobInTransaction({ query, source, registry, windowStart, purpose: "public-emergency", geography: "TH" });
    expect(result).toEqual({ ok: true, job: { jobId: "canonical-job-1", created: true } });
    expect(createCanonicalJobInTransaction).toHaveBeenCalledWith(expect.objectContaining({
      query,
      options: { runtimeType: "node_job_worker" },
      definition: expect.objectContaining({ jobType: "geo.source.refresh", tenantId: source.tenantId }),
    }));
  });

  it("does not create a canonical job if approval is absent", async () => {
    const blockedRegistry: GeoSourceRegistryResolver = { resolve: () => ({ ok: false, code: "GEO_SOURCE_POLICY_INVALID" }) };
    const result = await enqueueGeoSourceRefreshJobInTransaction({ query: {}, source, registry: blockedRegistry, windowStart, purpose: "public-emergency", geography: "TH" });
    expect(result).toEqual({ ok: false, code: "GEO_SOURCE_ADAPTER_NOT_APPROVED" });
    expect(createCanonicalJobInTransaction).not.toHaveBeenCalled();
  });
});
