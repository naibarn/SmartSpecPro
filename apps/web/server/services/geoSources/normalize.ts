import type { GeoSourceRecordContract } from "./contracts";

export interface GeoSourceNormalizationContext {
  readonly providerId: string;
  readonly contractVersion: string;
  readonly sourceRef: string;
  readonly sourceRevision: number;
  readonly captureRef: string;
}

export interface NormalizedGeoSourceRecord {
  readonly itemRef: string;
  readonly observedAt: string;
  readonly geometry: { readonly type: "Point"; readonly coordinates: readonly [number, number]; readonly crs: "EPSG:4326" };
  readonly measurement: { readonly value: number; readonly unit: string; readonly originalValue?: string };
  readonly properties: Readonly<Record<string, string | number | boolean>>;
  readonly provenance: GeoSourceNormalizationContext;
}

export type GeoSourceNormalizationResult =
  | { readonly ok: true; readonly value: NormalizedGeoSourceRecord }
  | { readonly ok: false; readonly code: "GEO_SOURCE_RECORD_INVALID" | "GEO_SOURCE_CRS_UNSUPPORTED" | "GEO_SOURCE_UNIT_UNSUPPORTED" | "GEO_SOURCE_PROPERTIES_TOO_LARGE" };

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const ITEM_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const VERSION_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const SAFE_PROPERTY = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const SECRET_PROPERTY = /(?:api[_-]?key|authorization|cookie|credential|password|secret|token)/i;
const SUPPORTED_UNITS = new Set(["m", "cm", "mm", "m/s", "km/h", "m3/s", "l/s", "C", "K", "%", "Pa", "hPa"]);
const MAX_PROPERTIES = 32;
const MAX_PROPERTY_TEXT = 1_024;
const MAX_PROPERTY_BYTES = 4_096;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function validContext(value: GeoSourceNormalizationContext): boolean {
  return Boolean(value) && ITEM_REF.test(value.providerId) && VERSION_REF.test(value.contractVersion) &&
    ITEM_REF.test(value.sourceRef) && Number.isSafeInteger(value.sourceRevision) && value.sourceRevision >= 1 && value.sourceRevision <= 2_147_483_647 &&
    ITEM_REF.test(value.captureRef);
}

function normalizeProperties(value: unknown): { readonly ok: true; readonly value: Readonly<Record<string, string | number | boolean>> } | { readonly ok: false } {
  if (value === undefined) return { ok: true, value: {} };
  if (!isPlainRecord(value) || Object.keys(value).length > MAX_PROPERTIES) return { ok: false };
  const result: Record<string, string | number | boolean> = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_PROPERTY.test(key)) continue;
    if (!SAFE_PROPERTY.test(key) ||
      !["string", "number", "boolean"].includes(typeof item) || (typeof item === "string" && item.length > MAX_PROPERTY_TEXT) ||
      (typeof item === "number" && !Number.isFinite(item))) return { ok: false };
    result[key] = item as string | number | boolean;
  }
  return Buffer.byteLength(JSON.stringify(result), "utf8") <= MAX_PROPERTY_BYTES ? { ok: true, value: result } : { ok: false };
}

/**
 * Maps a strict WGS84 source record to a normalized envelope. It never parses
 * strings into numbers, converts units, transforms CRS, or substitutes a
 * timestamp; callers must quarantine failures.
 */
export function normalizeGeoSourceRecord(context: GeoSourceNormalizationContext, value: unknown): GeoSourceNormalizationResult {
  if (!validContext(context) || !isPlainRecord(value) || Object.keys(value).some(key => !["itemRef", "observedAt", "latitude", "longitude", "crs", "value", "unit", "originalValue", "properties"].includes(key)) || !ITEM_REF.test(String(value.itemRef ?? "")) ||
    typeof value.observedAt !== "string" || !ISO_INSTANT.test(value.observedAt) || Number.isNaN(Date.parse(value.observedAt)) || new Date(value.observedAt).toISOString() !== value.observedAt ||
    typeof value.latitude !== "number" || !Number.isFinite(value.latitude) || value.latitude < -90 || value.latitude > 90 ||
    typeof value.longitude !== "number" || !Number.isFinite(value.longitude) || value.longitude < -180 || value.longitude > 180 ||
    typeof value.value !== "number" || !Number.isFinite(value.value) ||
    (value.originalValue !== undefined && (typeof value.originalValue !== "string" || value.originalValue.length > MAX_PROPERTY_TEXT))) return { ok: false, code: "GEO_SOURCE_RECORD_INVALID" };
  if (value.crs !== "EPSG:4326") return { ok: false, code: "GEO_SOURCE_CRS_UNSUPPORTED" };
  if (typeof value.unit !== "string" || !SUPPORTED_UNITS.has(value.unit)) return { ok: false, code: "GEO_SOURCE_UNIT_UNSUPPORTED" };
  const properties = normalizeProperties(value.properties);
  if (!properties.ok) return { ok: false, code: "GEO_SOURCE_PROPERTIES_TOO_LARGE" };
  return {
    ok: true,
    value: {
      itemRef: value.itemRef as GeoSourceRecordContract["itemRef"], observedAt: value.observedAt,
      geometry: { type: "Point", coordinates: [value.longitude, value.latitude], crs: "EPSG:4326" },
      measurement: { value: value.value, unit: value.unit, ...(value.originalValue === undefined ? {} : { originalValue: value.originalValue }) },
      properties: properties.value,
      provenance: { ...context },
    },
  };
}
