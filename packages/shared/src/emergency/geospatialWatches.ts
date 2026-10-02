/** Pure, bounded watch contracts. This module does not authorize owners or deliver notifications. */
export type WatchPosition = readonly [longitude: number, latitude: number];
export interface GeospatialWatch {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly ownerId: string;
  readonly tenantId: string;
  readonly revision: number;
  readonly scope: { readonly type: "area"; readonly geometry: { readonly type: "Polygon"; readonly coordinates: readonly (readonly WatchPosition[])[] } }
    | { readonly type: "route"; readonly routeRef: { readonly type: "route"; readonly id: string; readonly revision: number } };
  readonly condition: { readonly kind: "river-level-above" | "rainfall-above" | "hazard-state"; readonly stationRef?: { readonly type: "station"; readonly id: string; readonly revision: number }; readonly threshold?: number; readonly unit?: "m" | "mm"; readonly hazardType?: string };
  readonly status: "active" | "paused" | "revoked";
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly notifyOn: readonly ("enter" | "exit" | "material-update")[];
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const date = (v: unknown): v is string => typeof v === "string" && ISO.test(v) && Number.isFinite(Date.parse(v));
const keysOnly = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).every(k => keys.includes(k));
function position(v: unknown): v is WatchPosition { return Array.isArray(v) && v.length === 2 && typeof v[0] === "number" && Number.isFinite(v[0]) && Math.abs(v[0]) <= 180 && typeof v[1] === "number" && Number.isFinite(v[1]) && Math.abs(v[1]) <= 85; }

/** Parses and copies a versioned watch payload; authorization remains server-owned. */
export function parseGeospatialWatch(value: unknown): GeospatialWatch | undefined {
  if (!record(value) || !keysOnly(value, ["schemaVersion", "id", "ownerId", "tenantId", "revision", "scope", "condition", "status", "createdAt", "expiresAt", "notifyOn"]) ||
    value.schemaVersion !== 1 || typeof value.id !== "string" || !ID.test(value.id) || typeof value.ownerId !== "string" || !ID.test(value.ownerId) ||
    typeof value.tenantId !== "string" || !ID.test(value.tenantId) || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1 ||
    !["active", "paused", "revoked"].includes(String(value.status)) || !date(value.createdAt) || !date(value.expiresAt) || Date.parse(value.expiresAt as string) <= Date.parse(value.createdAt as string) ||
    Date.parse(value.expiresAt as string) - Date.parse(value.createdAt as string) > 366 * 24 * 60 * 60 * 1000 || !Array.isArray(value.notifyOn) || value.notifyOn.length === 0 || value.notifyOn.length > 3 ||
    value.notifyOn.some(x => !["enter", "exit", "material-update"].includes(String(x))) || new Set(value.notifyOn).size !== value.notifyOn.length || !record(value.scope) || !record(value.condition)) return undefined;

  let scope: GeospatialWatch["scope"];
  if (value.scope.type === "area" && keysOnly(value.scope, ["type", "geometry"]) && record(value.scope.geometry) && keysOnly(value.scope.geometry, ["type", "coordinates"]) && value.scope.geometry.type === "Polygon" && Array.isArray(value.scope.geometry.coordinates)) {
    const rings = value.scope.geometry.coordinates;
    if (rings.length < 1 || rings.length > 8) return undefined;
    let count = 0;
    const coordinates: WatchPosition[][] = [];
    for (const ring of rings) {
      if (!Array.isArray(ring) || ring.length < 4 || ring.length > 500 || !ring.every(position)) return undefined;
      count += ring.length;
      if (count > 500) return undefined;
      const first = ring[0] as WatchPosition, last = ring[ring.length - 1] as WatchPosition;
      if (first[0] !== last[0] || first[1] !== last[1]) return undefined;
      // A longitude jump over 180° makes a small local area look like a
      // polygon spanning most of the globe in the unwrapped coordinate space.
      // Reject these rings until the watch contract supports explicit dateline
      // splitting/canonicalization.
      for (let index = 1; index < ring.length; index += 1) {
        const previous = ring[index - 1] as WatchPosition;
        const current = ring[index] as WatchPosition;
        if (Math.abs(current[0] - previous[0]) > 180) return undefined;
      }
      coordinates.push(ring.map(p => [p[0], p[1]]));
    }
    scope = { type: "area", geometry: { type: "Polygon", coordinates } };
  } else if (value.scope.type === "route" && keysOnly(value.scope, ["type", "routeRef"]) && record(value.scope.routeRef) && keysOnly(value.scope.routeRef, ["type", "id", "revision"]) && value.scope.routeRef.type === "route" && typeof value.scope.routeRef.id === "string" && ID.test(value.scope.routeRef.id) && Number.isSafeInteger(value.scope.routeRef.revision) && Number(value.scope.routeRef.revision) > 0) {
    scope = { type: "route", routeRef: { type: "route", id: value.scope.routeRef.id, revision: Number(value.scope.routeRef.revision) } };
  } else return undefined;

  const condition = value.condition;
  let normalizedCondition: GeospatialWatch["condition"];
  if ((condition.kind === "river-level-above" || condition.kind === "rainfall-above") && keysOnly(condition, ["kind", "stationRef", "threshold", "unit"]) && record(condition.stationRef) && keysOnly(condition.stationRef, ["type", "id", "revision"]) && condition.stationRef.type === "station" && typeof condition.stationRef.id === "string" && ID.test(condition.stationRef.id) && Number.isSafeInteger(condition.stationRef.revision) && Number(condition.stationRef.revision) > 0 && typeof condition.threshold === "number" && Number.isFinite(condition.threshold) && condition.threshold >= 0 && condition.threshold <= 100_000 && (condition.unit === (condition.kind === "river-level-above" ? "m" : "mm"))) {
    normalizedCondition = { kind: condition.kind, stationRef: { type: "station", id: condition.stationRef.id, revision: Number(condition.stationRef.revision) }, threshold: condition.threshold, unit: condition.unit };
  } else if (condition.kind === "hazard-state" && keysOnly(condition, ["kind", "hazardType"]) && typeof condition.hazardType === "string" && /^[a-z][a-z0-9-]{0,39}$/.test(condition.hazardType)) {
    normalizedCondition = { kind: "hazard-state", hazardType: condition.hazardType };
  } else return undefined;

  return { schemaVersion: 1, id: value.id, ownerId: value.ownerId, tenantId: value.tenantId, revision: Number(value.revision), scope, condition: normalizedCondition, status: value.status as GeospatialWatch["status"], createdAt: value.createdAt, expiresAt: value.expiresAt, notifyOn: [...value.notifyOn] as GeospatialWatch["notifyOn"] };
}

export type GeospatialWatchSignal = { readonly state: "triggered" | "clear"; readonly observedAt: string; readonly sourceFresh: boolean; readonly eventRef: string; readonly changeKind?: "enter" | "exit" | "material-update" };
export type GeospatialWatchTransition = { readonly kind: "notify"; readonly reason: string; readonly idempotencyKey: string } | { readonly kind: "unknown" | "expired" | "inactive" | "duplicate-suppressed" | "no-transition" };

/** Stale/malformed signals never become clear. The returned key dedupes retries for a watch revision and event. */
export function evaluateGeospatialWatchTransition(watch: GeospatialWatch, signal: GeospatialWatchSignal, now: string): GeospatialWatchTransition {
  if (!date(now)) return { kind: "unknown" };
  if (Date.parse(watch.expiresAt) <= Date.parse(now)) return { kind: "expired" };
  if (watch.status !== "active") return { kind: "inactive" };
  if (!signal || !date(signal.observedAt) || !signal.sourceFresh || typeof signal.eventRef !== "string" || !ID.test(signal.eventRef) || !["triggered", "clear"].includes(signal.state) || Date.parse(signal.observedAt) > Date.parse(now) + 5 * 60_000 || Date.parse(now) - Date.parse(signal.observedAt) > 15 * 60_000) return { kind: "unknown" };
  if (signal.state === "clear" || !signal.changeKind || !watch.notifyOn.includes(signal.changeKind)) return { kind: "no-transition" };
  return { kind: "notify", reason: signal.changeKind, idempotencyKey: `geo-watch:${watch.id}:${watch.revision}:${signal.eventRef}:${signal.changeKind}` };
}
