import { createHash } from "node:crypto";
import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import {
  emergencyHydroObservations,
  emergencyHydroStations,
  emergencyIntelCaptures,
} from "../../../drizzle/schema";
import { getDb } from "../../db";
import { storagePutIfAbsent } from "../../storage";
import type {
  HydroObservationWrite,
  HydroStationWrite,
  ImmutableCaptureWrite,
} from "./refreshPipeline";
import { createHydrologyTrendReader, type HydroEventTimeQuery, type HydroTrendSample } from "../../../../../packages/shared/src/geospatial/hydrologyTimeSeries";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const HASH = /^[a-f0-9]{64}$/;
const VARIABLE = /^[a-z][a-z0-9._-]{0,63}$/;
const UNIT = /^[A-Za-z][A-Za-z0-9%*/^._-]{0,31}$/;
const LEGACY_UNIT = /^[A-Z][A-Z0-9._/-]{0,31}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

type CaptureRow = { readonly id: string; readonly tenantId: string; readonly sourceId: string; readonly contentHash: string; readonly objectRef: string | null };
type StationRow = { readonly id: string; readonly tenantId: string; readonly sourceId: string; readonly latitude: string | number; readonly longitude: string | number };
type StationScopeRow = Pick<StationRow, "id" | "tenantId" | "sourceId">;
type ObservationRow = { readonly id: string; readonly contentHash: string };

export interface GeoSourcePersistenceQuery {
  findCaptureByIdentity(input: { readonly tenantId: string; readonly sourceId: string; readonly sourceItemRef: string; readonly contentHash: string }): Promise<CaptureRow | undefined>;
  insertCaptureIfAbsent(input: Record<string, unknown>): Promise<{ readonly id: string } | undefined>;
  setCaptureObjectRefIfMissing(input: { readonly tenantId: string; readonly sourceId: string; readonly captureId: string; readonly objectRef: string }): Promise<{ readonly id: string } | undefined>;
  findCaptureById(input: { readonly tenantId: string; readonly sourceId: string; readonly captureId: string }): Promise<Pick<CaptureRow, "id" | "tenantId" | "sourceId" | "contentHash"> | undefined>;
  findStationByIdentity(input: { readonly tenantId: string; readonly sourceId: string; readonly stationRef: string }): Promise<StationRow | undefined>;
  insertStationIfAbsent(input: Record<string, unknown>): Promise<{ readonly id: string } | undefined>;
  findStationById(input: { readonly tenantId: string; readonly sourceId: string; readonly stationId: string }): Promise<StationScopeRow | undefined>;
  findObservationByRevision(input: { readonly tenantId: string; readonly sourceId: string; readonly stationId: string; readonly variableCode: string; readonly sourceObservationRef: string; readonly sourceRevision: string }): Promise<ObservationRow | undefined>;
  insertObservationIfAbsent(input: Record<string, unknown>): Promise<{ readonly id: string } | undefined>;
  readHydroSeries(input: HydroEventTimeQuery): Promise<readonly HydroTrendSample[]>;
}

export interface GeoSourcePersistenceDependencies {
  readonly query?: GeoSourcePersistenceQuery;
  readonly objectStorage?: { putIfAbsent(key: string, bytes: Buffer, contentType: string): Promise<{ readonly key: string; readonly created: boolean }> };
}

function fail(code: string): never {
  throw new Error(code);
}

function instant(value: string): Date {
  if (!ISO_INSTANT.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) return fail("GEO_PERSISTENCE_INSTANT_INVALID");
  return new Date(value);
}

function identifier(value: string, code: string): string {
  if (!ID.test(value)) return fail(code);
  return value;
}

function objectKey(input: Pick<ImmutableCaptureWrite, "tenantId" | "sourceId" | "contentHash">): string {
  return `geo-captures/${identifier(input.tenantId, "GEO_PERSISTENCE_TENANT_INVALID")}/${identifier(input.sourceId, "GEO_PERSISTENCE_SOURCE_INVALID")}/${input.contentHash}.bin`;
}

function json(value: Record<string, unknown>): Record<string, unknown> {
  try {
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > 16_384) return fail("GEO_PERSISTENCE_PROVENANCE_TOO_LARGE");
  } catch {
    return fail("GEO_PERSISTENCE_PROVENANCE_INVALID");
  }
  return value;
}

function legacyUnitCode(unit: string): string {
  const value = unit.toUpperCase();
  if (!LEGACY_UNIT.test(value)) return fail("GEO_PERSISTENCE_UNIT_INVALID");
  return value;
}

function validGeometry(input: HydroStationWrite): void {
  if (input.geometry.type !== "Point" || input.geometry.crs !== "EPSG:4326" || input.geometry.coordinates.length !== 2) fail("GEO_PERSISTENCE_GEOMETRY_INVALID");
  const [longitude, latitude] = input.geometry.coordinates;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) fail("GEO_PERSISTENCE_GEOMETRY_INVALID");
}

function sameStoredPoint(row: StationRow, longitude: number, latitude: number): boolean {
  const storedLongitude = Number(row.longitude);
  const storedLatitude = Number(row.latitude);
  return Number.isFinite(storedLongitude) && Number.isFinite(storedLatitude) &&
    storedLongitude.toFixed(6) === longitude.toFixed(6) && storedLatitude.toFixed(6) === latitude.toFixed(6);
}

function defaultQuery(): GeoSourcePersistenceQuery {
  const database: any = getDb();
  return {
    async findCaptureByIdentity(input) {
      const rows = await database.select({ id: emergencyIntelCaptures.id, tenantId: emergencyIntelCaptures.tenantId, sourceId: emergencyIntelCaptures.sourceId, contentHash: emergencyIntelCaptures.contentHash, objectRef: emergencyIntelCaptures.objectRef })
        .from(emergencyIntelCaptures).where(and(eq(emergencyIntelCaptures.tenantId, input.tenantId), eq(emergencyIntelCaptures.sourceId, input.sourceId), eq(emergencyIntelCaptures.sourceItemRef, input.sourceItemRef), eq(emergencyIntelCaptures.contentHash, input.contentHash))).limit(1);
      return rows[0];
    },
    async insertCaptureIfAbsent(input) {
      const rows = await database.insert(emergencyIntelCaptures).values(input).onConflictDoNothing().returning({ id: emergencyIntelCaptures.id });
      return rows[0];
    },
    async setCaptureObjectRefIfMissing(input) {
      const rows = await database.update(emergencyIntelCaptures).set({ objectRef: input.objectRef })
        .where(and(eq(emergencyIntelCaptures.id, input.captureId), eq(emergencyIntelCaptures.tenantId, input.tenantId), eq(emergencyIntelCaptures.sourceId, input.sourceId), isNull(emergencyIntelCaptures.objectRef))).returning({ id: emergencyIntelCaptures.id });
      return rows[0];
    },
    async findCaptureById(input) {
      const rows = await database.select({ id: emergencyIntelCaptures.id, tenantId: emergencyIntelCaptures.tenantId, sourceId: emergencyIntelCaptures.sourceId, contentHash: emergencyIntelCaptures.contentHash })
        .from(emergencyIntelCaptures).where(and(eq(emergencyIntelCaptures.id, input.captureId), eq(emergencyIntelCaptures.tenantId, input.tenantId), eq(emergencyIntelCaptures.sourceId, input.sourceId))).limit(1);
      return rows[0];
    },
    async findStationByIdentity(input) {
      const rows = await database.select({ id: emergencyHydroStations.id, tenantId: emergencyHydroStations.tenantId, sourceId: emergencyHydroStations.sourceId, latitude: emergencyHydroStations.latitude, longitude: emergencyHydroStations.longitude })
        .from(emergencyHydroStations).where(and(eq(emergencyHydroStations.tenantId, input.tenantId), eq(emergencyHydroStations.sourceId, input.sourceId), eq(emergencyHydroStations.stationRef, input.stationRef))).limit(1);
      return rows[0];
    },
    async insertStationIfAbsent(input) {
      const rows = await database.insert(emergencyHydroStations).values(input).onConflictDoNothing().returning({ id: emergencyHydroStations.id });
      return rows[0];
    },
    async findStationById(input) {
      const rows = await database.select({ id: emergencyHydroStations.id, tenantId: emergencyHydroStations.tenantId, sourceId: emergencyHydroStations.sourceId })
        .from(emergencyHydroStations).where(and(eq(emergencyHydroStations.id, input.stationId), eq(emergencyHydroStations.tenantId, input.tenantId), eq(emergencyHydroStations.sourceId, input.sourceId))).limit(1);
      return rows[0];
    },
    async findObservationByRevision(input) {
      const rows = await database.select({ id: emergencyHydroObservations.id, contentHash: emergencyHydroObservations.contentHash })
        .from(emergencyHydroObservations).where(and(eq(emergencyHydroObservations.tenantId, input.tenantId), eq(emergencyHydroObservations.sourceId, input.sourceId), eq(emergencyHydroObservations.stationId, input.stationId), eq(emergencyHydroObservations.variableCode, input.variableCode), eq(emergencyHydroObservations.sourceObservationRef, input.sourceObservationRef), eq(emergencyHydroObservations.sourceRevision, input.sourceRevision))).limit(1);
      return rows[0];
    },
    async insertObservationIfAbsent(input) {
      const rows = await database.insert(emergencyHydroObservations).values(input).onConflictDoNothing().returning({ id: emergencyHydroObservations.id });
      return rows[0];
    },
    async readHydroSeries(input) {
      const rows = await database.select({
        observedAt: emergencyHydroObservations.observedAt,
        value: emergencyHydroObservations.normalizedValue,
        quality: emergencyHydroObservations.qualityCode,
        freshness: emergencyHydroObservations.freshnessCode,
        unit: emergencyHydroObservations.normalizedUnit,
      }).from(emergencyHydroObservations).where(and(
        eq(emergencyHydroObservations.tenantId, input.tenantId),
        eq(emergencyHydroObservations.stationId, input.stationId),
        eq(emergencyHydroObservations.variableCode, input.variableCode),
        gte(emergencyHydroObservations.observedAt, new Date(input.fromObservedAt)),
        lte(emergencyHydroObservations.observedAt, new Date(input.throughObservedAt)),
      )).orderBy(desc(emergencyHydroObservations.observedAt)).limit(input.limit);
      return rows.map(row => ({
        observedAt: row.observedAt.toISOString(),
        value: row.value === null ? null : Number(row.value),
        quality: row.quality as HydroTrendSample["quality"],
        freshness: row.freshness as HydroTrendSample["freshness"],
        unit: row.unit ?? "",
      }));
    },
  };
}

/**
 * Concrete private-storage/Drizzle ports for refreshPipeline. Calls are
 * deliberately source+tenant scoped; no update path is exposed for captures,
 * stations, or observations.
 */
export function createDrizzleGeoSourcePersistence(dependencies: GeoSourcePersistenceDependencies = {}) {
  const query = dependencies.query ?? defaultQuery();
  const objectStorage = dependencies.objectStorage ?? { putIfAbsent: storagePutIfAbsent };
  return {
    captureStore: {
      async putImmutable(input: ImmutableCaptureWrite) {
        identifier(input.tenantId, "GEO_PERSISTENCE_TENANT_INVALID");
        identifier(input.sourceId, "GEO_PERSISTENCE_SOURCE_INVALID");
        if (!ID.test(input.sourceItemRef) || !HASH.test(input.contentHash) || !Number.isSafeInteger(input.byteLength) || input.byteLength < 1 || input.byteLength > 10_485_760 || input.rawBytes.byteLength !== input.byteLength) fail("GEO_CAPTURE_INVALID");
        if (createHash("sha256").update(input.rawBytes).digest("hex") !== input.contentHash) fail("GEO_CAPTURE_HASH_MISMATCH");
        const key = objectKey(input);
        let existing = await query.findCaptureByIdentity(input);
        let captureCreated = false;
        if (!existing) {
          // Start a durable retryable saga before touching object storage. A
          // later retry can safely heal the nullable objectRef with an exact
          // conditional object create, avoiding a permanent orphaned blob.
          const inserted = await query.insertCaptureIfAbsent({ tenantId: input.tenantId, sourceId: input.sourceId, sourceItemRef: input.sourceItemRef, contentHash: input.contentHash, objectRef: null, mediaType: "application/octet-stream", byteLength: input.byteLength, observedAt: input.observedAt ? instant(input.observedAt) : null, capturedAt: instant(input.capturedAt), provenanceJson: json({ ...input.provenance, objectKey: key }) });
          captureCreated = Boolean(inserted);
          existing = inserted
            ? { id: inserted.id, tenantId: input.tenantId, sourceId: input.sourceId, contentHash: input.contentHash, objectRef: null }
            : await query.findCaptureByIdentity(input);
        }
        if (existing) {
          if (existing.tenantId !== input.tenantId || existing.sourceId !== input.sourceId || existing.contentHash !== input.contentHash) fail("GEO_CAPTURE_SCOPE_CONFLICT");
          if (existing.objectRef) {
            if (existing.objectRef !== key) fail("GEO_CAPTURE_OBJECT_REF_CONFLICT");
            return { captureId: existing.id, created: false };
          }
          const stored = await objectStorage.putIfAbsent(key, input.rawBytes, "application/octet-stream");
          if (stored.key !== key) fail("GEO_CAPTURE_OBJECT_KEY_CONFLICT");
          const linked = await query.setCaptureObjectRefIfMissing({ tenantId: input.tenantId, sourceId: input.sourceId, captureId: existing.id, objectRef: key });
          if (!linked) {
            const reread = await query.findCaptureByIdentity(input);
            if (!reread || reread.tenantId !== input.tenantId || reread.sourceId !== input.sourceId || reread.contentHash !== input.contentHash || reread.objectRef !== key) fail("GEO_CAPTURE_CONFLICT");
          }
          return { captureId: existing.id, created: captureCreated };
        }
        fail("GEO_CAPTURE_CONFLICT");
      },
    },
    hydroRepository: {
      async resolveOrInsertStation(input: HydroStationWrite) {
        identifier(input.tenantId, "GEO_PERSISTENCE_TENANT_INVALID");
        identifier(input.sourceId, "GEO_PERSISTENCE_SOURCE_INVALID");
        identifier(input.stationRef, "GEO_PERSISTENCE_STATION_INVALID");
        if (!input.displayName.trim() || input.displayName.length > 200) fail("GEO_PERSISTENCE_STATION_INVALID");
        validGeometry(input);
        const existing = await query.findStationByIdentity(input);
        if (existing) {
          if (existing.tenantId !== input.tenantId || existing.sourceId !== input.sourceId) fail("GEO_PERSISTENCE_STATION_SCOPE_CONFLICT");
          const [longitude, latitude] = input.geometry.coordinates;
          if (!sameStoredPoint(existing, longitude, latitude)) fail("GEO_PERSISTENCE_STATION_GEOMETRY_CONFLICT");
          return { stationId: existing.id, created: false };
        }
        const [longitude, latitude] = input.geometry.coordinates;
        const inserted = await query.insertStationIfAbsent({ tenantId: input.tenantId, sourceId: input.sourceId, stationRef: input.stationRef, displayName: input.displayName, latitude: String(latitude), longitude: String(longitude), crsCode: "EPSG:4326", metadataJson: input.verticalDatumRef ? { verticalDatumRef: input.verticalDatumRef } : {} });
        if (inserted) return { stationId: inserted.id, created: true };
        const raced = await query.findStationByIdentity(input);
        if (!raced || raced.tenantId !== input.tenantId || raced.sourceId !== input.sourceId) fail("GEO_PERSISTENCE_STATION_CONFLICT");
        if (!sameStoredPoint(raced, longitude, latitude)) fail("GEO_PERSISTENCE_STATION_GEOMETRY_CONFLICT");
        return { stationId: raced.id, created: false };
      },
      async insertObservationIfAbsent(input: HydroObservationWrite) {
        identifier(input.tenantId, "GEO_PERSISTENCE_TENANT_INVALID");
        identifier(input.sourceId, "GEO_PERSISTENCE_SOURCE_INVALID");
        identifier(input.stationId, "GEO_PERSISTENCE_STATION_INVALID");
        identifier(input.captureId, "GEO_PERSISTENCE_CAPTURE_INVALID");
        if (!VARIABLE.test(input.variableCode) || !ID.test(input.sourceObservationRef) || !ID.test(input.sourceRevision) || !UNIT.test(input.rawUnit) || !UNIT.test(input.normalizedUnit) || !Number.isFinite(input.rawValue) || !Number.isFinite(input.normalizedValue)) fail("GEO_HYDRO_OBSERVATION_INVALID");
        const [station, capture] = await Promise.all([query.findStationById({ tenantId: input.tenantId, sourceId: input.sourceId, stationId: input.stationId }), query.findCaptureById({ tenantId: input.tenantId, sourceId: input.sourceId, captureId: input.captureId })]);
        if (!station || station.tenantId !== input.tenantId || station.sourceId !== input.sourceId || !capture || capture.tenantId !== input.tenantId || capture.sourceId !== input.sourceId || !HASH.test(capture.contentHash)) fail("GEO_HYDRO_SCOPE_INVALID");
        const existing = await query.findObservationByRevision(input);
        if (existing) {
          if (existing.contentHash !== capture.contentHash) fail("GEO_HYDRO_OBSERVATION_CONFLICT");
          return { inserted: false };
        }
        const inserted = await query.insertObservationIfAbsent({ tenantId: input.tenantId, sourceId: input.sourceId, stationId: input.stationId, captureId: input.captureId, variableCode: input.variableCode, sourceObservationRef: input.sourceObservationRef, value: String(input.normalizedValue), unitCode: legacyUnitCode(input.normalizedUnit), rawValue: String(input.rawValue), rawUnit: input.rawUnit, normalizedValue: String(input.normalizedValue), normalizedUnit: input.normalizedUnit, qualityCode: input.qualityCode, freshnessCode: input.freshnessCode, observedAt: instant(input.observedAt), receivedAt: instant(input.receivedAt), normalizedAt: instant(input.normalizedAt), sourceRevision: input.sourceRevision, contentHash: capture.contentHash, provenanceJson: json({ ...input.provenance, metric: input.metric, verticalDatumRef: input.verticalDatumRef ?? null }) });
        if (inserted) return { inserted: true };
        const raced = await query.findObservationByRevision(input);
        if (!raced || raced.contentHash !== capture.contentHash) fail("GEO_HYDRO_OBSERVATION_CONFLICT");
        return { inserted: false };
      },
    },
    hydrologyTrendReader: createHydrologyTrendReader({ readByEventTime: query.readHydroSeries.bind(query) }),
  };
}
