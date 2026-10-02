export type FederatedCaseSource = {
  publicRef: string;
  status: string;
  hazardCategory?: string;
  severity?: string;
};

export type FederatedSituationSource = {
  publicRef: string;
  status: string;
  severity: string;
  summary?: string;
};

const caseStatuses = new Set(["open", "triage", "active", "waiting", "resolved", "closed"]);
const situationStatuses = new Set(["monitoring", "active", "contained", "resolved", "cancelled"]);
const severities = new Set(["unknown", "low", "moderate", "high", "critical"]);
const hazards = new Set(["natural", "structural", "infrastructure", "fire", "hazardous_material", "medical", "accident", "security", "civil_crowd", "unknown", "multi_hazard"]);

/** A versioned, minimum-disclosure federation projection. Never pass source rows directly to a partner. */
export function projectFederatedCase(source: FederatedCaseSource, sharedAt: string): Record<string, unknown> {
  return {
    contractVersion: "spec260-federation-v1",
    resourceType: "case",
    publicRef: source.publicRef.slice(0, 24),
    status: caseStatuses.has(source.status) ? source.status : "unknown",
    hazardCategory: source.hazardCategory && hazards.has(source.hazardCategory) ? source.hazardCategory : "unknown",
    severity: source.severity && severities.has(source.severity) ? source.severity : "unknown",
    sharedAt,
  };
}

export function projectFederatedSituation(source: FederatedSituationSource, sharedAt: string): Record<string, unknown> {
  return {
    contractVersion: "spec260-federation-v1",
    resourceType: "situation",
    publicRef: source.publicRef.slice(0, 24),
    status: situationStatuses.has(source.status) ? source.status : "unknown",
    severity: severities.has(source.severity) ? source.severity : "unknown",
    projection: { summary: typeof source.summary === "string" ? source.summary.slice(0, 500) : "" },
    sharedAt,
  };
}

/** Revocation, partner trust, expiry, tenant ownership and jurisdiction all gate delivery/read. */
export function canDeliverEmergencyFederationShare(input: {
  partnerActive: boolean;
  partnerVerified: boolean;
  sourceTenantId: string;
  tenantId: string;
  partnerJurisdictions: readonly string[];
  jurisdictionRef: string;
  expiresAt: Date;
  revokedAt: Date | null;
}, now: Date): boolean {
  return input.partnerActive && input.partnerVerified && input.sourceTenantId === input.tenantId &&
    input.partnerJurisdictions.includes(input.jurisdictionRef) && input.expiresAt.getTime() > now.getTime() && input.revokedAt === null;
}

export function canCreateEmergencyFederationShare(input: {
  resourceType: "case" | "situation";
  sourceTenantId: string;
  tenantId: string;
  sourceJurisdiction: string | null;
  requestedJurisdiction: string;
  partnerJurisdictions: readonly string[];
}): boolean {
  return input.resourceType === "case" && input.sourceTenantId === input.tenantId &&
    input.sourceJurisdiction !== null && input.sourceJurisdiction === input.requestedJurisdiction &&
    input.partnerJurisdictions.includes(input.requestedJurisdiction);
}
