import { resolveMapProvider, type MapProviderId, type MapProviderResolutionInput } from "./providerResolver";

export const GEO_CAPABILITY_IDS = [
  "geo.map.render",
  "geo.map.roadmap",
  "geo.map.satellite",
  "geo.map.terrain",
  "geo.map.photorealistic_3d",
  "geo.map.offline",
  "geo.places.search",
  "geo.geocode",
  "geo.reverse_geocode",
  "geo.route",
  "geo.streetview",
  "geo.elevation",
] as const;

export type GeoCapabilityId = (typeof GEO_CAPABILITY_IDS)[number];

const CAPABILITY_FIELD: Partial<Record<GeoCapabilityId, "roadmap" | "satellite" | "terrain" | "places" | "geocoding" | "routes" | "streetView" | "elevation" | "threeDTiles" | "offline">> = {
  "geo.map.render": "roadmap",
  "geo.map.roadmap": "roadmap",
  "geo.map.satellite": "satellite",
  "geo.map.terrain": "terrain",
  "geo.map.photorealistic_3d": "threeDTiles",
  "geo.map.offline": "offline",
  "geo.places.search": "places",
  "geo.geocode": "geocoding",
  "geo.reverse_geocode": "geocoding",
  "geo.route": "routes",
  "geo.streetview": "streetView",
  "geo.elevation": "elevation",
};

export const GEO_SKILL_CAPABILITIES = {
  "geo.search_place": "geo.places.search",
  "geo.resolve_address": "geo.geocode",
  "geo.reverse_geocode": "geo.reverse_geocode",
  "geo.find_route": "geo.route",
  "geo.get_map_context": "geo.map.render",
  "geo.get_nearby": "geo.places.search",
} as const satisfies Readonly<Record<string, GeoCapabilityId>>;

export interface ResolvedGeoCapability {
  capability: GeoCapabilityId;
  status: "available" | "unavailable";
  providerId: MapProviderId | null;
}

/** Provider-neutral capability admission. Unsupported APIs never create a Google request. */
export function resolveGeoCapability(capability: GeoCapabilityId, providers: MapProviderResolutionInput): ResolvedGeoCapability {
  const field = CAPABILITY_FIELD[capability];
  const resolution = resolveMapProvider(providers);
  const candidates = [resolution.primary, resolution.emergencyOffline]
    .filter(candidate => candidate.status === "available" && candidate.providerId !== null);
  const selected = candidates.find(candidate => {
    const registration = candidate.providerId ? providers.providers[candidate.providerId] : undefined;
    return !!field && registration?.capabilities[field];
  });
  return { capability, status: selected ? "available" : "unavailable", providerId: selected?.providerId ?? null };
}
