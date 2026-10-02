/** Browser commands may change map presentation only. Material actions must use canonical server flows. */
export type EmergencyMapCommandType =
  | "map.focus" | "map.fit_bounds" | "map.select" | "map.clear_selection"
  | "map.layer.show" | "map.layer.hide" | "map.layer.configure"
  | "map.filter.set" | "map.filter.clear" | "map.area.select" | "map.area.clear"
  | "map.route.show" | "map.route.compare" | "map.route.clear"
  | "map.journey.follow" | "map.journey.stop_follow" | "map.timeline.set" | "map.timeline.play"
  | "map.draw.start" | "map.draw.commit" | "map.draw.cancel" | "map.view.save" | "map.view.restore"
  | "map.compare.open" | "map.compare.close" | "map.feed.sync_focus" | "map.feed.lock_focus" | "map.feed.unlock_focus";

export type EmergencyMapCommand = {
  type: EmergencyMapCommandType;
  revision: number;
  [key: string]: unknown;
};

export type MapCommandParseResult =
  | { ok: true; command: EmergencyMapCommand }
  | { ok: false; code: "INVALID_PAYLOAD" | "UNKNOWN_COMMAND" | "STALE_REVISION" };

const MAP_COMMAND_KEYS: Record<EmergencyMapCommandType, readonly string[]> = {
  "map.focus": ["center", "zoom"],
  "map.fit_bounds": ["bounds", "padding"],
  "map.select": ["featureRef"],
  "map.clear_selection": [],
  "map.layer.show": ["layerId"],
  "map.layer.hide": ["layerId"],
  "map.layer.configure": ["layerId", "opacity"],
  "map.filter.set": ["filterId", "value"],
  "map.filter.clear": ["filterId"],
  "map.area.select": ["areaRef"],
  "map.area.clear": [],
  "map.route.show": ["routeRef"],
  "map.route.compare": ["routeRefs"],
  "map.route.clear": [],
  "map.journey.follow": ["journeyRef"],
  "map.journey.stop_follow": [],
  "map.timeline.set": ["mode", "from", "to"],
  "map.timeline.play": ["enabled"],
  "map.draw.start": ["geometryType"],
  "map.draw.commit": ["geometry"],
  "map.draw.cancel": [],
  "map.view.save": ["name"],
  "map.view.restore": ["viewRef"],
  "map.compare.open": ["leftRef", "rightRef"],
  "map.compare.close": [],
  "map.feed.sync_focus": ["featureRef"],
  "map.feed.lock_focus": ["featureRef"],
  "map.feed.unlock_focus": [],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isCoordinate(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 &&
    typeof value[0] === "number" && Number.isFinite(value[0]) && Math.abs(value[0]) <= 180 &&
    typeof value[1] === "number" && Number.isFinite(value[1]) && Math.abs(value[1]) <= 85;
}

function isLineCoordinates(value: unknown): boolean {
  return Array.isArray(value) && value.length >= 2 && value.length <= 500 && value.every(isCoordinate);
}

function isPolygonCoordinates(value: unknown): boolean {
  return Array.isArray(value) && value.length >= 1 && value.length <= 20 && value.every(ring => {
    if (!isLineCoordinates(ring) || (ring as [number, number][]).length < 4) return false;
    const points = ring as [number, number][];
    const first = points[0];
    const last = points[points.length - 1];
    return first[0] === last[0] && first[1] === last[1];
  }) && value.reduce((sum: number, ring: unknown) => sum + (Array.isArray(ring) ? ring.length : 0), 0) <= 500;
}

function isRef(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).every(key => ["kind", "id", "revision"].includes(key)) &&
    typeof value.kind === "string" && /^[a-z][a-z0-9-]{0,39}$/.test(value.kind) &&
    typeof value.id === "string" && value.id.length > 0 && value.id.length <= 160 &&
    Number.isSafeInteger(value.revision) && Number(value.revision) >= 0;
}

function validateCommandFields(type: EmergencyMapCommandType, input: Record<string, unknown>): boolean {
  switch (type) {
    case "map.focus": return isCoordinate(input.center) && typeof input.zoom === "number" && Number.isFinite(input.zoom) && input.zoom >= 0 && input.zoom <= 22;
    case "map.fit_bounds": {
      const bounds = input.bounds;
      return Array.isArray(bounds) && bounds.length === 4 && bounds.every(v => typeof v === "number" && Number.isFinite(v)) &&
        bounds[0] >= -180 && bounds[2] <= 180 && bounds[1] >= -85 && bounds[3] <= 85 &&
        bounds[2] > bounds[0] && bounds[3] > bounds[1] && bounds[2] - bounds[0] <= 20 && bounds[3] - bounds[1] <= 20 &&
        (input.padding === undefined || (Number.isInteger(input.padding) && Number(input.padding) >= 0 && Number(input.padding) <= 128));
    }
    case "map.select": case "map.feed.sync_focus": case "map.feed.lock_focus": return isRef(input.featureRef);
    case "map.area.select": return isRef(input.areaRef);
    case "map.route.show": return isRef(input.routeRef);
    case "map.route.compare": return Array.isArray(input.routeRefs) && input.routeRefs.length === 2 && input.routeRefs.every(isRef);
    case "map.journey.follow": return isRef(input.journeyRef);
    case "map.view.restore": return isRef(input.viewRef);
    case "map.compare.open": return isRef(input.leftRef) && isRef(input.rightRef);
    case "map.layer.show": case "map.layer.hide": case "map.layer.configure":
      return typeof input.layerId === "string" && /^[a-z][a-z0-9._-]{0,63}$/.test(input.layerId) &&
        (type !== "map.layer.configure" || (typeof input.opacity === "number" && Number.isFinite(input.opacity) && input.opacity >= 0 && input.opacity <= 1));
    case "map.filter.set": return typeof input.filterId === "string" && /^[a-z][a-z0-9._-]{0,63}$/.test(input.filterId) &&
      (typeof input.value === "string" ? input.value.length <= 120 : typeof input.value === "boolean" || (typeof input.value === "number" && Number.isFinite(input.value)));
    case "map.filter.clear": return typeof input.filterId === "string" && /^[a-z][a-z0-9._-]{0,63}$/.test(input.filterId);
    case "map.timeline.set": {
      const from = typeof input.from === "string" ? Date.parse(input.from) : NaN;
      const to = typeof input.to === "string" ? Date.parse(input.to) : NaN;
      return ["live", "historic", "forecast"].includes(String(input.mode)) && Number.isFinite(from) && Number.isFinite(to) && to > from && to - from <= 31 * 24 * 60 * 60 * 1000;
    }
    case "map.timeline.play": return typeof input.enabled === "boolean";
    case "map.draw.start": return input.geometryType === "Polygon" || input.geometryType === "LineString";
    case "map.draw.commit": return isRecord(input.geometry) && Object.keys(input.geometry).length === 2 && Object.keys(input.geometry).every(key => ["type", "coordinates"].includes(key)) &&
      (input.geometry.type === "Polygon" ? isPolygonCoordinates(input.geometry.coordinates) : input.geometry.type === "LineString" && isLineCoordinates(input.geometry.coordinates)) && JSON.stringify(input.geometry).length <= 8_000;
    case "map.view.save": return typeof input.name === "string" && input.name.trim().length > 0 && input.name.length <= 80;
    default: return true;
  }
}

/** Strictly validates client intent and freshness; it never authorizes a data/action reference. */
export function parseEmergencyMapCommand(input: unknown, currentRevision?: number): MapCommandParseResult {
  if (!isRecord(input) || typeof input.type !== "string" || !Object.prototype.hasOwnProperty.call(MAP_COMMAND_KEYS, input.type)) {
    return { ok: false, code: "UNKNOWN_COMMAND" };
  }
  const type = input.type as EmergencyMapCommandType;
  if (!Number.isSafeInteger(input.revision) || Number(input.revision) < 0 ||
      !Object.keys(input).every(key => ["type", "revision", ...MAP_COMMAND_KEYS[type]].includes(key)) ||
      !validateCommandFields(type, input)) {
    return { ok: false, code: "INVALID_PAYLOAD" };
  }
  if (currentRevision !== undefined && input.revision !== currentRevision) return { ok: false, code: "STALE_REVISION" };
  return { ok: true, command: input as EmergencyMapCommand };
}
