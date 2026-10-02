export type HydroMetric = "water_level" | "discharge" | "rainfall" | "storage" | "inflow" | "outflow";
export type HydroQuality = "valid" | "suspect" | "estimated" | "missing" | "censored" | "rejected";
export type HydroFreshness = "current" | "stale" | "delayed" | "unknown";

export interface HydroObservation {
  readonly observationId: string;
  readonly stationId: string;
  readonly metric: HydroMetric;
  readonly observedAt: string;
  readonly receivedAt: string;
  readonly normalizedAt: string;
  readonly rawValue: number | null;
  readonly rawUnit: string | null;
  readonly normalizedValue: number | null;
  readonly normalizedUnit: string | null;
  readonly verticalDatumRef?: string;
  readonly sourceRef: string;
  readonly captureRef: string;
  readonly sourceRevision: string;
  readonly quality: HydroQuality;
  readonly freshness: HydroFreshness;
}

export type HydroContractResult = { readonly ok: true; readonly value: HydroObservation } | { readonly ok: false; readonly code: "HYDRO_OBSERVATION_INVALID" };

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const INSTANT = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const UNIT = /^[A-Za-z][A-Za-z0-9%*/^._-]{0,31}$/;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
function normalizeInstant(value: unknown): string | undefined {
  if (typeof value !== "string" || !INSTANT.test(value)) return undefined;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return undefined;
  const canonical = new Date(milliseconds).toISOString();
  const fractionalPart = value.match(/\.(\d{1,3})Z$/)?.[1];
  const expected = fractionalPart ? value.replace(/\.(\d{1,3})Z$/, `.${fractionalPart.padEnd(3, "0")}Z`) : value.replace(/Z$/, ".000Z");
  return canonical === expected ? canonical : undefined;
}

/** Strictly validates one measured observation. Missing is null, never a numeric zero. */
export function parseHydroObservation(value: unknown): HydroContractResult {
  if (!record(value) || Object.keys(value).some(key => !["observationId", "stationId", "metric", "observedAt", "receivedAt", "normalizedAt", "rawValue", "rawUnit", "normalizedValue", "normalizedUnit", "verticalDatumRef", "sourceRef", "captureRef", "sourceRevision", "quality", "freshness"].includes(key))) return { ok: false, code: "HYDRO_OBSERVATION_INVALID" };
  const nullableNumber = (item: unknown) => item === null || (typeof item === "number" && Number.isFinite(item));
  const nullableUnit = (item: unknown) => item === null || (typeof item === "string" && UNIT.test(item));
  if (![value.observationId, value.stationId, value.sourceRef, value.captureRef, value.sourceRevision].every(item => typeof item === "string" && ID.test(item)) ||
    !["water_level", "discharge", "rainfall", "storage", "inflow", "outflow"].includes(String(value.metric)) ||
    !normalizeInstant(value.observedAt) || !normalizeInstant(value.receivedAt) || !normalizeInstant(value.normalizedAt) ||
    !nullableNumber(value.rawValue) || !nullableNumber(value.normalizedValue) || !nullableUnit(value.rawUnit) || !nullableUnit(value.normalizedUnit) ||
    ((value.rawValue === null) !== (value.rawUnit === null)) || ((value.normalizedValue === null) !== (value.normalizedUnit === null)) ||
    (value.quality === "missing" && (value.rawValue !== null || value.normalizedValue !== null)) ||
    (value.quality !== "missing" && (value.rawValue === null || value.normalizedValue === null)) ||
    (value.verticalDatumRef !== undefined && (typeof value.verticalDatumRef !== "string" || !ID.test(value.verticalDatumRef))) ||
    !["valid", "suspect", "estimated", "missing", "censored", "rejected"].includes(String(value.quality)) ||
    !["current", "stale", "delayed", "unknown"].includes(String(value.freshness))) return { ok: false, code: "HYDRO_OBSERVATION_INVALID" };
  return { ok: true, value: {
    ...value,
    observedAt: normalizeInstant(value.observedAt)!,
    receivedAt: normalizeInstant(value.receivedAt)!,
    normalizedAt: normalizeInstant(value.normalizedAt)!,
  } as HydroObservation };
}
