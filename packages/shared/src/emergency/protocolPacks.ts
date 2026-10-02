import type { EmergencyHazardCategory, EmergencySeverity } from "./triage";

export type EmergencySafetyClass = "community_safe" | "verified_only" | "professional_only" | "restricted";

export interface EmergencyProtocolPack {
  readonly version: string;
  readonly hazardCategory: EmergencyHazardCategory;
  readonly minimumSafetyClass: EmergencySafetyClass;
  readonly humanReviewRequired: boolean;
  readonly actions: readonly string[];
}

const PACKS: Readonly<Record<EmergencyHazardCategory, EmergencyProtocolPack>> = {
  natural: { version: "spec260-protocol-v1", hazardCategory: "natural", minimumSafetyClass: "verified_only", humanReviewRequired: false, actions: ["verify-location", "check-updates", "record-needs"] },
  structural: { version: "spec260-protocol-v1", hazardCategory: "structural", minimumSafetyClass: "professional_only", humanReviewRequired: true, actions: ["keep-clear", "request-professional-assessment", "record-access-route"] },
  infrastructure: { version: "spec260-protocol-v1", hazardCategory: "infrastructure", minimumSafetyClass: "verified_only", humanReviewRequired: true, actions: ["verify-service-impact", "avoid-hazard-zone", "record-access-route"] },
  fire: { version: "spec260-protocol-v1", hazardCategory: "fire", minimumSafetyClass: "professional_only", humanReviewRequired: true, actions: ["evacuate-hazard-zone", "do-not-enter", "request-fire-service"] },
  hazardous_material: { version: "spec260-protocol-v1", hazardCategory: "hazardous_material", minimumSafetyClass: "restricted", humanReviewRequired: true, actions: ["isolate-area", "do-not-approach", "request-hazmat-authority"] },
  medical: { version: "spec260-protocol-v1", hazardCategory: "medical", minimumSafetyClass: "professional_only", humanReviewRequired: true, actions: ["confirm-safe-access", "request-qualified-care", "preserve-reporter-contact"] },
  accident: { version: "spec260-protocol-v1", hazardCategory: "accident", minimumSafetyClass: "verified_only", humanReviewRequired: true, actions: ["confirm-scene-safety", "avoid-traffic", "request-qualified-response"] },
  security: { version: "spec260-protocol-v1", hazardCategory: "security", minimumSafetyClass: "restricted", humanReviewRequired: true, actions: ["protect-reporter-identity", "do-not-confront", "request-authority-review"] },
  civil_crowd: { version: "spec260-protocol-v1", hazardCategory: "civil_crowd", minimumSafetyClass: "professional_only", humanReviewRequired: true, actions: ["avoid-crowd-compression", "keep-egress-clear", "request-trained-marshals"] },
  unknown: { version: "spec260-protocol-v1", hazardCategory: "unknown", minimumSafetyClass: "professional_only", humanReviewRequired: true, actions: ["verify-hazard-before-entry", "keep-clear", "human-review"] },
  multi_hazard: { version: "spec260-protocol-v1", hazardCategory: "multi_hazard", minimumSafetyClass: "restricted", humanReviewRequired: true, actions: ["separate-hazards", "human-coordination", "no-unverified-entry"] },
};

const SAFETY_RANK: Readonly<Record<EmergencySafetyClass, number>> = {
  community_safe: 0,
  verified_only: 1,
  professional_only: 2,
  restricted: 3,
};

export function getEmergencyProtocolPack(input: {
  hazardCategory: EmergencyHazardCategory;
  severity: EmergencySeverity;
}): EmergencyProtocolPack {
  const pack = PACKS[input.hazardCategory] ?? PACKS.unknown;
  const version = `spec260-protocol-v1:${input.hazardCategory}:${input.severity}`;
  if (input.severity !== "critical") return { ...pack, version };
  return { ...pack, version, minimumSafetyClass: "restricted", humanReviewRequired: true };
}

export function satisfiesEmergencyProtocolSafetyClass(actual: EmergencySafetyClass, minimum: EmergencySafetyClass): boolean {
  return SAFETY_RANK[actual] >= SAFETY_RANK[minimum];
}
