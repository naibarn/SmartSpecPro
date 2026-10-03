import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  runGeoSourceRefreshPipeline,
  type GeoSourceRefreshPipelineDependencies,
  type GeoSourceRefreshPipelineInput,
} from "./refreshPipeline";

const rawBytes = Buffer.from("rid fixture response 2026-10-01T00:00:00.000Z");
const contentHash = createHash("sha256").update(rawBytes).digest("hex");
const contract = {
  providerId: "rid",
  contractVersion: "rid-v1",
  sourceRef: "rid-river-levels",
  sourceRevision: 7,
  acquiredAt: "2026-10-01T00:00:00.000Z",
  observedAt: "2026-10-01T00:00:00.000Z",
  schemaVersion: "2026-10",
  contentHash,
  licenseRef: "https://agency.example.org/terms",
  attribution: "Royal Irrigation Department",
  allowedPurposes: ["emergency-response"],
  retentionClass: "operational-30d",
  freshness: { cadenceSeconds: 300, staleAfterSeconds: 900 },
  records: [{
    itemRef: "station-001",
    observedAt: "2026-10-01T00:00:00.000Z",
    latitude: 13.7563,
    longitude: 100.5018,
    crs: "EPSG:4326",
    value: 1.25,
    unit: "m",
    properties: { quality: "valid" },
  }],
} as const;

const input: GeoSourceRefreshPipelineInput = {
  tenantId: "tenant-1",
  purpose: "emergency-response",
  geography: "TH-10",
  lease: { jobId: "job-1", attemptId: "attempt-1", fencingVersion: 1 },
  job: {
    sourceId: "source-row-1",
    sourceRef: "rid-river-levels",
    configurationRevision: 3,
    adapterId: "rid-levels-v1",
    adapterVersion: "rid-v1",
    windowStart: "2026-10-01T00:00:00.000Z",
  },
};

function createDependencies(overrides: Partial<GeoSourceRefreshPipelineDependencies> = {}): GeoSourceRefreshPipelineDependencies {
  return {
    reporter: { assertActive: vi.fn(async () => undefined) },
    sourceAuthorization: {
      getActiveSource: vi.fn(async () => ({
        id: "source-row-1",
        tenantId: "tenant-1",
        sourceRef: "rid-river-levels",
        status: "active",
        policy: {
          sourceStatus: "active",
          ownerRef: "tenant-1",
          rightsStatus: "granted",
          licenseRef: "https://agency.example.org/terms",
          attribution: "Royal Irrigation Department",
          allowedPurposes: ["emergency-response"],
          retentionClass: "operational-30d",
          configurationRevision: 3,
        },
      })),
    },
    registry: {
      resolve: vi.fn(() => ({ ok: true as const, value: {
        sourceRef: "rid-river-levels",
        adapterId: "rid-levels-v1",
        providerId: "rid",
        contractVersion: "rid-v1",
        configurationRevision: 3,
      } })),
    },
    transport: { fetch: vi.fn(async () => ({ envelope: contract, rawBytes })) },
    bindings: {
      resolve: vi.fn(({ itemRef }: { readonly itemRef: string }) => itemRef === "station-001" ? {
        stationRef: "rid-station-001",
        displayName: "Bangkok River Gauge 001",
        metric: "water_level",
        variableCode: "water_level",
        qualityCode: "valid",
        freshnessCode: "current",
        verticalDatumRef: "datum-msl",
      } : undefined),
    },
    captureStore: {
      putImmutable: vi.fn(async () => ({ captureId: "capture-1", created: true })),
    },
    hydroRepository: {
      resolveOrInsertStation: vi.fn(async () => ({ stationId: "station-row-1", created: true })),
      insertObservationIfAbsent: vi.fn(async () => ({ inserted: true })),
    },
    now: () => "2026-10-01T00:00:01.000Z",
    ...overrides,
  };
}

describe("geo source refresh pipeline", () => {
  it("validates, reauthorizes, fences, and writes immutable capture plus normalized hydro rows", async () => {
    const dependencies = createDependencies();
    const result = await runGeoSourceRefreshPipeline(input, dependencies);

    expect(result).toEqual({ ok: true, captureId: "capture-1", captureCreated: true, observationsInserted: 1, observationsReplayed: 0 });
    expect(dependencies.sourceAuthorization.getActiveSource).toHaveBeenCalledTimes(3);
    expect(dependencies.reporter.assertActive).toHaveBeenCalledTimes(4);
    expect(dependencies.captureStore.putImmutable).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1", sourceId: "source-row-1", sourceItemRef: "rid-river-levels:7", contentHash: contract.contentHash,
      capturedAt: contract.acquiredAt, observedAt: contract.observedAt, byteLength: rawBytes.byteLength, rawBytes,
    }));
    expect(dependencies.hydroRepository.resolveOrInsertStation).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: "source-row-1", stationRef: "rid-station-001", displayName: "Bangkok River Gauge 001",
      geometry: { type: "Point", coordinates: [100.5018, 13.7563], crs: "EPSG:4326" },
    }));
    expect(dependencies.hydroRepository.insertObservationIfAbsent).toHaveBeenCalledWith(expect.objectContaining({
      stationId: "station-row-1", captureId: "capture-1", metric: "water_level", variableCode: "water_level",
      sourceObservationRef: "station-001", sourceRevision: "7", rawValue: 1.25, rawUnit: "m",
      normalizedValue: 1.25, normalizedUnit: "m", receivedAt: "2026-10-01T00:00:01.000Z",
    }));
  });

  it("does not overwrite history when an exact replay finds an immutable capture and observation", async () => {
    const dependencies = createDependencies({
      captureStore: { putImmutable: vi.fn(async () => ({ captureId: "capture-1", created: false })) },
      hydroRepository: {
        resolveOrInsertStation: vi.fn(async () => ({ stationId: "station-row-1", created: false })),
        insertObservationIfAbsent: vi.fn(async () => ({ inserted: false })),
      },
    });
    const result = await runGeoSourceRefreshPipeline(input, dependencies);

    expect(result).toEqual({ ok: true, captureId: "capture-1", captureCreated: false, observationsInserted: 0, observationsReplayed: 1 });
    expect(dependencies.hydroRepository.insertObservationIfAbsent).toHaveBeenCalledTimes(1);
  });

  it("preserves a corrected source revision as a new append-only observation identity", async () => {
    const correctedRawBytes = Buffer.from("corrected fixture");
    const corrected = { ...contract, sourceRevision: 8, contentHash: createHash("sha256").update(correctedRawBytes).digest("hex") };
    const dependencies = createDependencies({
      transport: { fetch: vi.fn(async () => ({ envelope: corrected, rawBytes: correctedRawBytes })) },
      captureStore: { putImmutable: vi.fn(async () => ({ captureId: "capture-2", created: true })) },
    });
    const result = await runGeoSourceRefreshPipeline(input, dependencies);

    expect(result).toMatchObject({ ok: true, captureId: "capture-2", observationsInserted: 1, observationsReplayed: 0 });
    expect(dependencies.captureStore.putImmutable).toHaveBeenCalledWith(expect.objectContaining({
      sourceItemRef: "rid-river-levels:8", contentHash: corrected.contentHash,
    }));
    expect(dependencies.hydroRepository.insertObservationIfAbsent).toHaveBeenCalledWith(expect.objectContaining({
      captureId: "capture-2", sourceRevision: "8",
    }));
  });

  it("fails closed before storage when content is malformed or source authorization changes after fetch", async () => {
    const malformed = createDependencies({ transport: { fetch: vi.fn(async () => ({ envelope: { ...contract, contentHash: "bad" }, rawBytes })) } });
    await expect(runGeoSourceRefreshPipeline(input, malformed)).resolves.toEqual({ ok: false, code: "GEO_SOURCE_CONTRACT_INVALID" });
    expect(malformed.captureStore.putImmutable).not.toHaveBeenCalled();

    const revoked = createDependencies();
    vi.mocked(revoked.sourceAuthorization.getActiveSource)
      .mockResolvedValueOnce(await createDependencies().sourceAuthorization.getActiveSource({ tenantId: "tenant-1", sourceId: "source-row-1" }))
      .mockResolvedValueOnce(undefined);
    await expect(runGeoSourceRefreshPipeline(input, revoked)).resolves.toEqual({ ok: false, code: "GEO_SOURCE_REVOKED_OR_REVISED" });
    expect(revoked.captureStore.putImmutable).not.toHaveBeenCalled();
  });

  it("requires raw bytes to match the declared content hash and persists exact bytes only", async () => {
    const dependencies = createDependencies({ transport: { fetch: vi.fn(async () => ({ envelope: contract, rawBytes: Buffer.from("tampered fixture") })) } });
    await expect(runGeoSourceRefreshPipeline(input, dependencies)).resolves.toEqual({ ok: false, code: "GEO_SOURCE_CONTENT_HASH_MISMATCH" });
    expect(dependencies.captureStore.putImmutable).not.toHaveBeenCalled();
  });

  it("fails closed if authorization is revoked after capture and before hydro persistence", async () => {
    const dependencies = createDependencies();
    const active = await dependencies.sourceAuthorization.getActiveSource({ tenantId: "tenant-1", sourceId: "source-row-1" });
    vi.mocked(dependencies.sourceAuthorization.getActiveSource)
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce(undefined);

    await expect(runGeoSourceRefreshPipeline(input, dependencies)).resolves.toEqual({ ok: false, code: "GEO_SOURCE_REVOKED_OR_REVISED" });
    expect(dependencies.captureStore.putImmutable).toHaveBeenCalledTimes(1);
    expect(dependencies.hydroRepository.insertObservationIfAbsent).not.toHaveBeenCalled();
  });

  it("uses explicit shared unit normalization and rejects water level without a vertical datum", async () => {
    const centimetersRaw = Buffer.from("centimeter fixture");
    const centimeters = {
      ...contract,
      contentHash: createHash("sha256").update(centimetersRaw).digest("hex"),
      records: [{ ...contract.records[0], value: 125, unit: "cm" }],
    };
    const converted = createDependencies({ transport: { fetch: vi.fn(async () => ({ envelope: centimeters, rawBytes: centimetersRaw })) } });
    await expect(runGeoSourceRefreshPipeline(input, converted)).resolves.toMatchObject({ ok: true });
    expect(converted.hydroRepository.insertObservationIfAbsent).toHaveBeenCalledWith(expect.objectContaining({
      rawValue: 125, rawUnit: "cm", normalizedValue: 1.25, normalizedUnit: "m", verticalDatumRef: "datum-msl",
    }));

    const withoutDatum = createDependencies({ bindings: { resolve: vi.fn(() => ({
      stationRef: "rid-station-001", displayName: "Bangkok River Gauge 001", metric: "water_level", variableCode: "water_level",
      qualityCode: "valid", freshnessCode: "current",
    })) } });
    await expect(runGeoSourceRefreshPipeline(input, withoutDatum)).resolves.toEqual({ ok: false, code: "HYDRO_VERTICAL_DATUM_REQUIRED" });
    expect(withoutDatum.captureStore.putImmutable).not.toHaveBeenCalled();
  });

  it("never labels a record current after the source contract stale-after window", async () => {
    const staleContract = {
      ...contract,
      acquiredAt: "2026-10-01T00:10:00.000Z",
      freshness: { cadenceSeconds: 60, staleAfterSeconds: 120 },
      records: [{ ...contract.records[0], observedAt: "2026-10-01T00:00:00.000Z" }],
    };
    const dependencies = createDependencies({
      transport: { fetch: vi.fn(async () => ({ envelope: staleContract, rawBytes })) },
    });

    const result = await runGeoSourceRefreshPipeline(input, dependencies);

    expect(result).toMatchObject({ ok: true });
    expect(dependencies.hydroRepository.insertObservationIfAbsent).toHaveBeenCalledWith(expect.objectContaining({ freshnessCode: "stale" }));
  });

  it("requires an explicit station and metric binding rather than inferring either from an itemRef", async () => {
    const dependencies = createDependencies({ bindings: { resolve: vi.fn(() => undefined) } });
    await expect(runGeoSourceRefreshPipeline(input, dependencies)).resolves.toEqual({ ok: false, code: "GEO_HYDRO_BINDING_MISSING" });
    expect(dependencies.captureStore.putImmutable).not.toHaveBeenCalled();
    expect(dependencies.hydroRepository.insertObservationIfAbsent).not.toHaveBeenCalled();
  });

  it("does not append hydro history when the fence is stale immediately before persistence", async () => {
    const assertActive = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("JOB_LEASE_STALE"));
    const dependencies = createDependencies({ reporter: { assertActive } });
    await expect(runGeoSourceRefreshPipeline(input, dependencies)).rejects.toThrow("JOB_LEASE_STALE");
    expect(dependencies.captureStore.putImmutable).toHaveBeenCalledTimes(1);
    expect(dependencies.hydroRepository.insertObservationIfAbsent).not.toHaveBeenCalled();
  });

  it("rechecks lease fencing before each record so expiry cannot publish the rest of a provider page", async () => {
    const multiRecord = { ...contract, records: [contract.records[0], { ...contract.records[0], itemRef: "station-002", longitude: 100.6 }] };
    const assertActive = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("JOB_LEASE_STALE"));
    const dependencies = createDependencies({
      transport: { fetch: vi.fn(async () => ({ envelope: multiRecord, rawBytes })) },
      reporter: { assertActive },
      bindings: { resolve: vi.fn(({ itemRef }: { readonly itemRef: string }) => ({
        stationRef: itemRef, displayName: itemRef, metric: "water_level", variableCode: "water_level",
        qualityCode: "valid", freshnessCode: "current", verticalDatumRef: "datum-msl",
      })) },
    });

    await expect(runGeoSourceRefreshPipeline(input, dependencies)).rejects.toThrow("JOB_LEASE_STALE");
    expect(assertActive).toHaveBeenCalledTimes(5);
    expect(dependencies.hydroRepository.resolveOrInsertStation).toHaveBeenCalledTimes(1);
    expect(dependencies.hydroRepository.insertObservationIfAbsent).toHaveBeenCalledTimes(1);
  });
});
