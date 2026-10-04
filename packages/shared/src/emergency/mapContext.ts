/**
 * A browser-provided map snapshot for one explicit Chat turn. It is deliberately
 * authority-neutral: consumers must resolve the caller, tenant, purpose and every
 * reference again before reading data or taking action.
 */
export type MapContextRequestedMode = "PUBLIC" | "TRAVEL" | "RESPONDER" | "COMMAND";
export type MapContextZoomClass = "WORLD" | "COUNTRY" | "REGION" | "CITY" | "STREET" | "BUILDING";
export type MapContextTemporalMode = "NOW" | "HISTORY" | "FORECAST";
export type MapContextBounds = readonly [west: number, south: number, east: number, north: number];
export type MapContextPosition = readonly [longitude: number, latitude: number];

export type MapContextRefType =
  | "incident"
  | "hazard-occurrence"
  | "alert"
  | "resource"
  | "service"
  | "task"
  | "shelter"
  | "route"
  | "journey"
  | "public-area";

export interface MapContextReference {
  readonly type: MapContextRefType;
  readonly id: string;
  readonly revision: number;
}

export interface MapContextTimeWindow {
  readonly start: string;
  readonly end: string;
}

export interface MapContextFilter {
  readonly key: string;
  readonly values: readonly string[];
}

export interface MapContextVisibleSummary {
  readonly incidents: number;
  readonly hazards: number;
  readonly resources: number;
  readonly tasks: number;
  readonly services?: number;
}

export interface MapContextEnvelope {
  readonly surface: "emergency_map";
  readonly viewport: {
    readonly bounds: MapContextBounds;
    readonly center: MapContextPosition;
    readonly zoom: number;
    readonly bearing?: number;
    readonly pitch?: number;
  };
  readonly zoomClass: MapContextZoomClass;
  readonly selectedFeatures: readonly MapContextReference[];
  readonly activeLayers: readonly string[];
  readonly filters: readonly MapContextFilter[];
  readonly temporalContext: {
    readonly mode: MapContextTemporalMode;
    readonly timestamp?: string;
    readonly window?: MapContextTimeWindow;
  };
  /** Public/approved selection identity only; never inline GeoJSON or feature properties. */
  readonly selectedAreaRef?: MapContextReference;
  readonly activeRouteRef?: MapContextReference;
  readonly activeJourneyRef?: MapContextReference;
  /** A UI preference only. It does not grant or claim an effective audience. */
  readonly requestedMapMode: MapContextRequestedMode;
  readonly visibleSummary?: MapContextVisibleSummary;
}

const MAX_MERCATOR_LATITUDE = 85;
const MAX_VIEWPORT_AXIS_SPAN = 20;
const MAX_ZOOM = 22;
const MAX_SELECTED_FEATURES = 12;
const MAX_LAYERS = 16;
const MAX_FILTERS = 12;
const MAX_FILTER_VALUES = 12;
const MAX_TEXT_LENGTH = 128;
const MAX_TIME_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;
const REF_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const LAYER_OR_FILTER_VALUE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const FILTER_KEY = /^[A-Za-z][A-Za-z0-9._:-]{0,47}$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const refTypes = new Set<MapContextRefType>([
  "incident", "hazard-occurrence", "alert", "resource", "service", "task", "shelter", "route", "journey", "public-area",
]);
const zoomClasses = new Set<MapContextZoomClass>(["WORLD", "COUNTRY", "REGION", "CITY", "STREET", "BUILDING"]);
const requestedModes = new Set<MapContextRequestedMode>(["PUBLIC", "TRAVEL", "RESPONDER", "COMMAND"]);
const temporalModes = new Set<MapContextTemporalMode>(["NOW", "HISTORY", "FORECAST"]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key));
}

function isFiniteNumber(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function parsePosition(value: unknown): MapContextPosition | undefined {
  if (!Array.isArray(value) || value.length !== 2 ||
    !isFiniteNumber(value[0], -180, 180) || !isFiniteNumber(value[1], -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE)) return undefined;
  return [value[0], value[1]];
}

function parseBounds(value: unknown): MapContextBounds | undefined {
  if (!Array.isArray(value) || value.length !== 4 || value.some(item => typeof item !== "number" || !Number.isFinite(item))) return undefined;
  const [west, south, east, north] = value;
  if (west < -180 || east > 180 || south < -MAX_MERCATOR_LATITUDE || north > MAX_MERCATOR_LATITUDE ||
    east <= west || north <= south || east - west > MAX_VIEWPORT_AXIS_SPAN || north - south > MAX_VIEWPORT_AXIS_SPAN) return undefined;
  return [west, south, east, north];
}

function parseReference(value: unknown): MapContextReference | undefined {
  const revision = isPlainRecord(value) ? value.revision : undefined;
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ["type", "id", "revision"]) ||
    typeof value.type !== "string" || !refTypes.has(value.type as MapContextRefType) ||
    typeof value.id !== "string" || !REF_ID.test(value.id) ||
    !isInteger(revision) || revision < 1 || revision > 2_147_483_647) return undefined;
  return { type: value.type as MapContextRefType, id: value.id, revision };
}

function parseStringList(value: unknown, maximum: number): readonly string[] | undefined {
  if (!Array.isArray(value) || value.length > maximum || value.some(item => typeof item !== "string" || item.length > MAX_TEXT_LENGTH || !LAYER_OR_FILTER_VALUE.test(item))) return undefined;
  return value.slice();
}

function parseFilters(value: unknown): readonly MapContextFilter[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_FILTERS) return undefined;
  const filters: MapContextFilter[] = [];
  for (const filter of value) {
    if (!isPlainRecord(filter) || !hasOnlyKeys(filter, ["key", "values"]) ||
      typeof filter.key !== "string" || !FILTER_KEY.test(filter.key)) return undefined;
    const values = parseStringList(filter.values, MAX_FILTER_VALUES);
    if (!values) return undefined;
    filters.push({ key: filter.key, values });
  }
  return filters;
}

function parseDate(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 32 || !ISO_DATE_TIME.test(value) || Number.isNaN(Date.parse(value))) return undefined;
  return value;
}

function parseTemporalContext(value: unknown): MapContextEnvelope["temporalContext"] | undefined {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ["mode", "timestamp", "window"]) ||
    typeof value.mode !== "string" || !temporalModes.has(value.mode as MapContextTemporalMode)) return undefined;
  const timestamp = value.timestamp === undefined ? undefined : parseDate(value.timestamp);
  if (value.timestamp !== undefined && !timestamp) return undefined;
  let window: MapContextTimeWindow | undefined;
  if (value.window !== undefined) {
    if (!isPlainRecord(value.window) || !hasOnlyKeys(value.window, ["start", "end"])) return undefined;
    const start = parseDate(value.window.start);
    const end = parseDate(value.window.end);
    if (!start || !end || Date.parse(end) <= Date.parse(start) || Date.parse(end) - Date.parse(start) > MAX_TIME_WINDOW_MS) return undefined;
    window = { start, end };
  }
  if (value.mode === "NOW") return timestamp === undefined && window === undefined ? { mode: "NOW" } : undefined;
  if ((timestamp === undefined) === (window === undefined)) return undefined;
  return { mode: value.mode as Exclude<MapContextTemporalMode, "NOW">, ...(timestamp ? { timestamp } : {}), ...(window ? { window } : {}) };
}

function parseVisibleSummary(value: unknown): MapContextVisibleSummary | undefined {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ["incidents", "hazards", "resources", "tasks", "services"])) return undefined;
  const { incidents, hazards, resources, tasks, services } = value;
  const isCount = (count: unknown): count is number => typeof count === "number" && Number.isInteger(count) && count >= 0 && count <= 1_000_000;
  if (!isCount(incidents) || !isCount(hazards) || !isCount(resources) || !isCount(tasks) ||
    (services !== undefined && !isCount(services))) return undefined;
  return { incidents, hazards, resources, tasks, ...(services === undefined ? {} : { services }) };
}

/** Parses an allowlisted snapshot only. Successful parsing never validates authorization. */
export function parseMapContextEnvelope(value: unknown): MapContextEnvelope | undefined {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, [
    "surface", "viewport", "zoomClass", "selectedFeatures", "activeLayers", "filters", "temporalContext",
    "selectedAreaRef", "activeRouteRef", "activeJourneyRef", "requestedMapMode", "visibleSummary",
  ]) || value.surface !== "emergency_map" || typeof value.zoomClass !== "string" || !zoomClasses.has(value.zoomClass as MapContextZoomClass) ||
    typeof value.requestedMapMode !== "string" || !requestedModes.has(value.requestedMapMode as MapContextRequestedMode)) return undefined;

  if (!isPlainRecord(value.viewport) || !hasOnlyKeys(value.viewport, ["bounds", "center", "zoom", "bearing", "pitch"])) return undefined;
  const bounds = parseBounds(value.viewport.bounds);
  const center = parsePosition(value.viewport.center);
  if (!bounds || !center || !isFiniteNumber(value.viewport.zoom, 0, MAX_ZOOM) ||
    (value.viewport.bearing !== undefined && !isFiniteNumber(value.viewport.bearing, -180, 180)) ||
    (value.viewport.pitch !== undefined && !isFiniteNumber(value.viewport.pitch, 0, 85)) ||
    center[0] < bounds[0] || center[0] > bounds[2] || center[1] < bounds[1] || center[1] > bounds[3]) return undefined;

  if (!Array.isArray(value.selectedFeatures) || value.selectedFeatures.length > MAX_SELECTED_FEATURES) return undefined;
  const selectedFeatures = value.selectedFeatures.map(parseReference);
  if (selectedFeatures.some(reference => !reference)) return undefined;
  const activeLayers = parseStringList(value.activeLayers, MAX_LAYERS);
  const filters = parseFilters(value.filters);
  const temporalContext = parseTemporalContext(value.temporalContext);
  if (!activeLayers || !filters || !temporalContext) return undefined;

  const selectedAreaRef = value.selectedAreaRef === undefined ? undefined : parseReference(value.selectedAreaRef);
  const activeRouteRef = value.activeRouteRef === undefined ? undefined : parseReference(value.activeRouteRef);
  const activeJourneyRef = value.activeJourneyRef === undefined ? undefined : parseReference(value.activeJourneyRef);
  const visibleSummary = value.visibleSummary === undefined ? undefined : parseVisibleSummary(value.visibleSummary);
  if ((value.selectedAreaRef !== undefined && !selectedAreaRef) || (value.activeRouteRef !== undefined && !activeRouteRef) ||
    (value.activeJourneyRef !== undefined && !activeJourneyRef) || (value.visibleSummary !== undefined && !visibleSummary)) return undefined;

  return {
    surface: "emergency_map",
    viewport: { bounds, center, zoom: value.viewport.zoom, ...(value.viewport.bearing === undefined ? {} : { bearing: value.viewport.bearing }), ...(value.viewport.pitch === undefined ? {} : { pitch: value.viewport.pitch }) },
    zoomClass: value.zoomClass as MapContextZoomClass,
    selectedFeatures: selectedFeatures as MapContextReference[],
    activeLayers,
    filters,
    temporalContext,
    ...(selectedAreaRef ? { selectedAreaRef } : {}),
    ...(activeRouteRef ? { activeRouteRef } : {}),
    ...(activeJourneyRef ? { activeJourneyRef } : {}),
    requestedMapMode: value.requestedMapMode as MapContextRequestedMode,
    ...(visibleSummary ? { visibleSummary } : {}),
  };
}
