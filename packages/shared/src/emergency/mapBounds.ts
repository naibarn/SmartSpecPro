export type EmergencyMapBounds = readonly [west: number, south: number, east: number, north: number];

const MAX_AXIS_SPAN = 20;
const MAX_MERCATOR_LATITUDE = 85;

export function parseEmergencyMapBounds(value: unknown): EmergencyMapBounds | undefined {
  if (typeof value !== "string") return undefined;
  const parts = value.split(",").map(part => Number(part.trim()));
  if (parts.length !== 4 || parts.some(part => !Number.isFinite(part))) return undefined;
  const [west, south, east, north] = parts;
  if (west < -180 || east > 180 || south < -MAX_MERCATOR_LATITUDE || north > MAX_MERCATOR_LATITUDE ||
      east <= west || north <= south || east - west > MAX_AXIS_SPAN || north - south > MAX_AXIS_SPAN) return undefined;
  return [west, south, east, north];
}

export function serializeEmergencyMapViewport(input: {
  west: number;
  south: number;
  east: number;
  north: number;
  centerLongitude: number;
  centerLatitude: number;
}): string | undefined {
  const values = Object.values(input);
  if (values.some(value => !Number.isFinite(value)) || Math.abs(input.centerLongitude) > 180 || Math.abs(input.centerLatitude) > MAX_MERCATOR_LATITUDE) return undefined;
  const halfLongitude = Math.min(MAX_AXIS_SPAN / 2, (input.east - input.west) / 2);
  const halfLatitude = Math.min(MAX_AXIS_SPAN / 2, (input.north - input.south) / 2);
  if (halfLongitude <= 0 || halfLatitude <= 0) return undefined;
  const bounds: EmergencyMapBounds = [
    Math.max(-180, input.centerLongitude - halfLongitude),
    Math.max(-MAX_MERCATOR_LATITUDE, input.centerLatitude - halfLatitude),
    Math.min(180, input.centerLongitude + halfLongitude),
    Math.min(MAX_MERCATOR_LATITUDE, input.centerLatitude + halfLatitude),
  ];
  if (!parseEmergencyMapBounds(bounds.map(value => value.toFixed(6)).join(","))) return undefined;
  return bounds.map(value => value.toFixed(6)).join(",");
}
