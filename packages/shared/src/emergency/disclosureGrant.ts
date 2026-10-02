import { generalizeEmergencyPublicCoordinate } from "./publicLocation";

export interface EmergencyDisclosureGrant {
  readonly subjectRef: string;
  readonly recipientRef: string;
  readonly purpose: string;
  readonly resourceType: string;
  readonly resourceRef: string;
  readonly fields: readonly string[];
  readonly jurisdictionRef: string;
  readonly expiresAt: string;
  readonly revokedAt?: string | null;
}

export interface EmergencyDisclosureRequest {
  readonly subjectRef: string;
  readonly recipientRef: string;
  readonly purpose: string;
  readonly resourceType: string;
  readonly resourceRef: string;
  readonly jurisdictionRef: string;
  readonly now: Date;
}

export const EMERGENCY_DISCLOSABLE_FIELDS = [
  "approximateLocation",
  "needSummary",
  "taskInstructions",
  "callbackRelay",
] as const;

function isBoundedScope(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 200;
}

/** Applies a single exact-scope grant; missing or malformed scope always denies. */
export function discloseEmergencyFields<T extends Record<string, unknown>>(
  source: T,
  grant: EmergencyDisclosureGrant | null | undefined,
  request: EmergencyDisclosureRequest,
): Partial<T> | null {
  if (!source || typeof source !== "object" || Array.isArray(source) || !grant || typeof grant !== "object" || grant.revokedAt) return null;
  if (![grant.subjectRef, grant.recipientRef, grant.purpose, grant.resourceType, grant.resourceRef, grant.jurisdictionRef]
    .every(isBoundedScope) ||
    ![request.subjectRef, request.recipientRef, request.purpose, request.resourceType, request.resourceRef, request.jurisdictionRef]
      .every(isBoundedScope) || !(request.now instanceof Date) || !Number.isFinite(request.now.getTime())) return null;
  if (typeof grant.expiresAt !== "string") return null;
  const expiresAt = Date.parse(grant.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= request.now.getTime()) return null;
  if (grant.subjectRef !== request.subjectRef || grant.recipientRef !== request.recipientRef ||
      grant.purpose !== request.purpose || grant.resourceType !== request.resourceType ||
      grant.resourceRef !== request.resourceRef || grant.jurisdictionRef !== request.jurisdictionRef ||
      !Array.isArray(grant.fields) || grant.fields.length === 0 ||
      grant.fields.some(field => !EMERGENCY_DISCLOSABLE_FIELDS.includes(field as typeof EMERGENCY_DISCLOSABLE_FIELDS[number]))) return null;
  const allowed = new Set(grant.fields);
  const projection: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!allowed.has(key) || value === undefined) continue;
    if (key === "approximateLocation") {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const location = value as Record<string, unknown>;
      const latitude = location.latitude;
      const longitude = location.longitude;
      if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
          typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
      projection[key] = { latitude: generalizeEmergencyPublicCoordinate(latitude), longitude: generalizeEmergencyPublicCoordinate(longitude) };
      continue;
    }
    projection[key] = value;
  }
  return projection as Partial<T>;
}
