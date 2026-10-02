import { generalizeEmergencyPublicCoordinate } from "./publicLocation";

export interface HelperAvailabilityInput {
  optIn: boolean;
  latitude?: number;
  longitude?: number;
  jurisdictionRef?: string;
  availableUntil: Date;
  now: Date;
}

export interface PersistableHelperAvailability {
  optIn: boolean;
  latitude: number | null;
  longitude: number | null;
  jurisdictionRef: string | null;
  availableUntil: Date | null;
}

/** Explicitly opted-in helper location is snapped and expires within two hours. */
export function prepareEmergencyHelperAvailability(input: HelperAvailabilityInput): PersistableHelperAvailability | null {
  if (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime()) ||
      !(input.availableUntil instanceof Date) || !Number.isFinite(input.availableUntil.getTime())) return null;
  if (!input.optIn) return { optIn: false, latitude: null, longitude: null, jurisdictionRef: null, availableUntil: null };
  if (!Number.isFinite(input.latitude) || input.latitude! < -90 || input.latitude! > 90 ||
      !Number.isFinite(input.longitude) || input.longitude! < -180 || input.longitude! > 180 ||
      typeof input.jurisdictionRef !== "string" || !input.jurisdictionRef.trim() || input.jurisdictionRef.length > 160) return null;
  const ttl = input.availableUntil.getTime() - input.now.getTime();
  if (ttl <= 0 || ttl > 2 * 60 * 60_000) return null;
  return {
    optIn: true,
    latitude: generalizeEmergencyPublicCoordinate(input.latitude!),
    longitude: generalizeEmergencyPublicCoordinate(input.longitude!),
    jurisdictionRef: input.jurisdictionRef.trim(),
    availableUntil: input.availableUntil,
  };
}
