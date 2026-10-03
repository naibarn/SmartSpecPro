import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createDrizzleGeoSourcePersistence, type GeoSourcePersistenceQuery } from "./drizzlePersistence";

const bytes = Buffer.from("immutable provider payload");
const contentHash = createHash("sha256").update(bytes).digest("hex");

function createQuery(overrides: Partial<GeoSourcePersistenceQuery> = {}): GeoSourcePersistenceQuery {
  return {
    findCaptureByIdentity: vi.fn(async () => undefined),
    insertCaptureIfAbsent: vi.fn(async () => ({ id: "capture-1" })),
    setCaptureObjectRefIfMissing: vi.fn(async () => ({ id: "capture-1" })),
    findCaptureById: vi.fn(async () => ({ id: "capture-1", tenantId: "tenant-1", sourceId: "source-1", contentHash })),
    findStationByIdentity: vi.fn(async () => undefined),
    insertStationIfAbsent: vi.fn(async () => ({ id: "station-1" })),
    findStationById: vi.fn(async () => ({ id: "station-1", tenantId: "tenant-1", sourceId: "source-1" })),
    findObservationByRevision: vi.fn(async () => undefined),
    insertObservationIfAbsent: vi.fn(async () => ({ id: "observation-1" })),
    readHydroSeries: vi.fn(async () => []),
    ...overrides,
  };
}

function createPersistence(query = createQuery()) {
  const objectStorage = { putIfAbsent: vi.fn(async () => ({ key: "geo-captures/tenant-1/source-1/" + contentHash + ".bin", created: true })) };
  return { query, objectStorage, persistence: createDrizzleGeoSourcePersistence({ query, objectStorage }) };
}

describe("Spec262 Drizzle geo-source persistence", () => {
  it("hash-verifies raw capture bytes, conditionally creates a tenant/source/hash scoped object, then inserts an immutable capture", async () => {
    const { query, objectStorage, persistence } = createPersistence();
    const result = await persistence.captureStore.putImmutable({
      tenantId: "tenant-1", sourceId: "source-1", sourceItemRef: "rid:7", contentHash,
      capturedAt: "2026-10-01T00:00:00.000Z", observedAt: "2026-09-30T23:59:00.000Z", byteLength: bytes.byteLength, rawBytes: bytes,
      provenance: { sourceRef: "rid", sourceRevision: 7 },
    });

    expect(result).toEqual({ captureId: "capture-1", created: true });
    expect(objectStorage.putIfAbsent).toHaveBeenCalledWith(`geo-captures/tenant-1/source-1/${contentHash}.bin`, bytes, "application/octet-stream");
    expect(query.insertCaptureIfAbsent).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1", sourceId: "source-1", contentHash, objectRef: null,
      byteLength: bytes.byteLength, mediaType: "application/octet-stream", observedAt: new Date("2026-09-30T23:59:00.000Z"),
    }));
    expect(query.setCaptureObjectRefIfMissing).toHaveBeenCalledWith({ tenantId: "tenant-1", sourceId: "source-1", captureId: "capture-1", objectRef: `geo-captures/tenant-1/source-1/${contentHash}.bin` });

    await expect(persistence.captureStore.putImmutable({ tenantId: "tenant-1", sourceId: "source-1", sourceItemRef: "rid:bad", contentHash, capturedAt: "2026-10-01T00:00:00.000Z", byteLength: bytes.byteLength, rawBytes: Buffer.alloc(bytes.byteLength, "x"), provenance: {} }))
      .rejects.toThrow("GEO_CAPTURE_HASH_MISMATCH");
  });

  it("returns a valid existing capture without writing and heals a missing object reference only through conditional exact-byte storage", async () => {
    const existing = createQuery({ findCaptureByIdentity: vi.fn(async () => ({ id: "capture-existing", tenantId: "tenant-1", sourceId: "source-1", contentHash, objectRef: `geo-captures/tenant-1/source-1/${contentHash}.bin` })) });
    const existingPersistence = createPersistence(existing);
    await expect(existingPersistence.persistence.captureStore.putImmutable({ tenantId: "tenant-1", sourceId: "source-1", sourceItemRef: "rid:7", contentHash, capturedAt: "2026-10-01T00:00:00.000Z", byteLength: bytes.byteLength, rawBytes: bytes, provenance: {} }))
      .resolves.toEqual({ captureId: "capture-existing", created: false });
    expect(existingPersistence.objectStorage.putIfAbsent).not.toHaveBeenCalled();

    const missingQuery = createQuery({ findCaptureByIdentity: vi.fn(async () => ({ id: "legacy", tenantId: "tenant-1", sourceId: "source-1", contentHash, objectRef: null })), setCaptureObjectRefIfMissing: vi.fn(async () => ({ id: "legacy" })) });
    const missing = createPersistence(missingQuery);
    await expect(missing.persistence.captureStore.putImmutable({ tenantId: "tenant-1", sourceId: "source-1", sourceItemRef: "rid:7", contentHash, capturedAt: "2026-10-01T00:00:00.000Z", byteLength: bytes.byteLength, rawBytes: bytes, provenance: {} }))
      .resolves.toEqual({ captureId: "legacy", created: false });
    expect(missing.objectStorage.putIfAbsent).toHaveBeenCalledWith(`geo-captures/tenant-1/source-1/${contentHash}.bin`, bytes, "application/octet-stream");
    expect(missingQuery.setCaptureObjectRefIfMissing).toHaveBeenCalledWith({ tenantId: "tenant-1", sourceId: "source-1", captureId: "legacy", objectRef: `geo-captures/tenant-1/source-1/${contentHash}.bin` });
  });

  it("reads a source-scoped station without overwriting coordinates and inserts a new WGS84 station only once", async () => {
    const existing = createPersistence(createQuery({ findStationByIdentity: vi.fn(async () => ({ id: "station-existing", tenantId: "tenant-1", sourceId: "source-1", latitude: "13.700000", longitude: "100.500000" })) }));
    await expect(existing.persistence.hydroRepository.resolveOrInsertStation({ tenantId: "tenant-1", sourceId: "source-1", stationRef: "station-001", displayName: "Gauge", geometry: { type: "Point", coordinates: [100.5, 13.7], crs: "EPSG:4326" } }))
      .resolves.toEqual({ stationId: "station-existing", created: false });
    expect(existing.query.insertStationIfAbsent).not.toHaveBeenCalled();

    const inserted = createPersistence();
    await inserted.persistence.hydroRepository.resolveOrInsertStation({ tenantId: "tenant-1", sourceId: "source-1", stationRef: "station-001", displayName: "Gauge", geometry: { type: "Point", coordinates: [100.5, 13.7], crs: "EPSG:4326" } });
    expect(inserted.query.insertStationIfAbsent).toHaveBeenCalledWith(expect.objectContaining({ latitude: "13.7", longitude: "100.5", crsCode: "EPSG:4326" }));

    const conflict = createPersistence(createQuery({ findStationByIdentity: vi.fn(async () => ({ id: "foreign-station", tenantId: "tenant-1", sourceId: "source-other", latitude: "13.700000", longitude: "100.500000" })) }));
    await expect(conflict.persistence.hydroRepository.resolveOrInsertStation({ tenantId: "tenant-1", sourceId: "source-1", stationRef: "station-001", displayName: "Gauge", geometry: { type: "Point", coordinates: [100.5, 13.7], crs: "EPSG:4326" } }))
      .rejects.toThrow("GEO_PERSISTENCE_STATION_SCOPE_CONFLICT");

    const moved = createPersistence(createQuery({ findStationByIdentity: vi.fn(async () => ({ id: "station-existing", tenantId: "tenant-1", sourceId: "source-1", latitude: "13.800000", longitude: "100.500000" })) }));
    await expect(moved.persistence.hydroRepository.resolveOrInsertStation({ tenantId: "tenant-1", sourceId: "source-1", stationRef: "station-001", displayName: "Gauge", geometry: { type: "Point", coordinates: [100.5, 13.7], crs: "EPSG:4326" } }))
      .rejects.toThrow("GEO_PERSISTENCE_STATION_GEOMETRY_CONFLICT");
  });

  it("inserts an append-only observation with capture hash, compatible unit code, clocks and explicit metric provenance", async () => {
    const { query, persistence } = createPersistence();
    const write = {
      tenantId: "tenant-1", sourceId: "source-1", stationId: "station-1", captureId: "capture-1", metric: "water_level" as const,
      variableCode: "water_level", sourceObservationRef: "station-001", sourceRevision: "7", observedAt: "2026-10-01T00:00:00.000Z",
      receivedAt: "2026-10-01T00:00:01.000Z", normalizedAt: "2026-10-01T00:00:01.000Z", rawValue: 125, rawUnit: "cm",
      normalizedValue: 1.25, normalizedUnit: "m", qualityCode: "valid" as const, freshnessCode: "current" as const,
      verticalDatumRef: "datum-msl", provenance: { sourceRef: "rid", sourceRevision: 7 },
    };
    await expect(persistence.hydroRepository.insertObservationIfAbsent(write)).resolves.toEqual({ inserted: true });
    expect(query.insertObservationIfAbsent).toHaveBeenCalledWith(expect.objectContaining({
      contentHash, value: "1.25", unitCode: "M", rawValue: "125", rawUnit: "cm", normalizedValue: "1.25", normalizedUnit: "m",
      provenanceJson: expect.objectContaining({ metric: "water_level", sourceRef: "rid" }),
    }));

    const replay = createPersistence(createQuery({ findObservationByRevision: vi.fn(async () => ({ id: "observation-1", contentHash })) }));
    await expect(replay.persistence.hydroRepository.insertObservationIfAbsent(write)).resolves.toEqual({ inserted: false });
    expect(replay.query.insertObservationIfAbsent).not.toHaveBeenCalled();

    const conflict = createPersistence(createQuery({ findObservationByRevision: vi.fn(async () => ({ id: "observation-1", contentHash: "f".repeat(64) })) }));
    await expect(conflict.persistence.hydroRepository.insertObservationIfAbsent(write)).rejects.toThrow("GEO_HYDRO_OBSERVATION_CONFLICT");

    await expect(persistence.hydroRepository.insertObservationIfAbsent({ ...write, rawUnit: "bad unit" }))
      .rejects.toThrow("GEO_HYDRO_OBSERVATION_INVALID");
  });

  it("binds hydrology trend reads to a bounded event-time query and tenant/station identity", async () => {
    const query = createQuery({ readHydroSeries: vi.fn(async () => [
      { observedAt: "2026-10-03T03:10:00.000Z", value: 1, quality: "valid", freshness: "current", unit: "m" },
      { observedAt: "2026-10-03T03:50:00.000Z", value: 1.8, quality: "valid", freshness: "current", unit: "m" },
    ]) });
    const { persistence } = createPersistence(query);
    const result = await persistence.hydrologyTrendReader({
      tenantId: "tenant-1", stationId: "station-1", variableCode: "water_level",
      policy: { revision: "trend-v1", minSamples: 2, windowSeconds: 3600, staleAfterSeconds: 900, stableDelta: 0.1, slightDelta: 0.4, rapidDelta: 1 },
      now: "2026-10-03T04:00:00.000Z",
    });
    expect(result.trend).toMatchObject({ label: "RISING", delta: 0.8 });
    expect(query.readHydroSeries).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1", stationId: "station-1", variableCode: "water_level",
      fromObservedAt: "2026-10-03T03:00:00.000Z", throughObservedAt: "2026-10-03T04:00:00.000Z",
      order: "observedAt-desc", limit: 500,
    }));
  });
});
