import { normalizeEmergencyAlertGeometry } from "@smartspec/shared/src/emergency/alertGeometry";
import type { MapContextReference } from "@smartspec/shared/src/emergency/mapContext";

export interface EmergencyMapItem {
  id?: unknown;
  publicRef?: unknown;
  revision?: unknown;
  title?: unknown;
  kind?: unknown;
  status?: unknown;
  freshness?: unknown;
  location?: unknown;
  publicGeometry?: unknown;
}

export function toMapContextReference(item: EmergencyMapItem): MapContextReference | null {
  const type = item.kind === "situation" ? "incident" : item.kind === "alert" ? "alert" : item.kind === "facility" ? "resource" : null;
  if (!type || typeof item.publicRef !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(item.publicRef) ||
      typeof item.revision !== "number" || !Number.isInteger(item.revision) || item.revision < 1 || item.revision > 2_147_483_647) return null;
  return { type, id: item.publicRef, revision: item.revision };
}

export function getEmergencyMapCoordinates(item: EmergencyMapItem): [number, number] | null {
  if (!item.location || typeof item.location !== "object") return null;
  const location = item.location as Record<string, unknown>;
  const latitude = location.latitude;
  const longitude = location.longitude;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return [longitude, latitude];
}

export function isEmergencyMapItemSelectable(item: EmergencyMapItem): boolean {
  return getEmergencyMapCoordinates(item) !== null ||
    (item.kind === "alert" && normalizeEmergencyAlertGeometry(item.publicGeometry) !== null);
}

export function toEmergencyAlertAreaFeatureCollection(items: EmergencyMapItem[]) {
  return {
    type: "FeatureCollection" as const,
    features: items.flatMap((item, index) => {
      if (item.kind !== "alert" || (item.status !== "published" && item.status !== "updated")) return [];
      const geometry = normalizeEmergencyAlertGeometry(item.publicGeometry);
      if (!geometry) return [];
      return [{
        type: "Feature" as const,
        id: `alert-area-${index}`,
        geometry,
        properties: {
          kind: "alert-area",
          title: typeof item.title === "string" ? item.title.slice(0, 200) : "Emergency alert area",
          publicRef: typeof item.publicRef === "string" ? item.publicRef : "",
          status: typeof item.status === "string" ? item.status : "",
          freshness: typeof item.freshness === "string" ? item.freshness : "",
        },
      }];
    }),
  };
}

export function toPublicMapFeatureCollection(items: EmergencyMapItem[]) {
  return {
    type: "FeatureCollection" as const,
    features: items.flatMap((item, index) => {
      const point = getEmergencyMapCoordinates(item);
      if (!point) return [];
      return [{
        type: "Feature" as const,
        id: index,
        geometry: { type: "Point" as const, coordinates: point },
        properties: {
          kind: typeof item.kind === "string" ? item.kind : "situation",
          title: typeof item.title === "string" ? item.title.slice(0, 200) : "Emergency location",
          publicRef: typeof item.publicRef === "string" ? item.publicRef : "",
          status: typeof item.status === "string" ? item.status : "",
          freshness: typeof item.freshness === "string" ? item.freshness : "",
        },
      }];
    }),
  };
}
