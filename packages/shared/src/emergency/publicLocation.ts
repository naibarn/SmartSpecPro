export const PUBLIC_LOCATION_GRID_DEGREES = 0.05;

export function generalizeEmergencyPublicCoordinate(value: number): number {
  return Math.round(value / PUBLIC_LOCATION_GRID_DEGREES) * PUBLIC_LOCATION_GRID_DEGREES;
}
