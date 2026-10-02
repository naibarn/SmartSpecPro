/** Pure, bounded privacy decisions for Spec 262. Server callers must supply authoritative policy inputs. */

export type Spec262SpatialAudience = "public" | "tenant" | "responder" | "command";
export type Spec262SpatialEntityClass =
  | "ordinary-public-feature"
  | "protected-household"
  | "sensitive-facility"
  | "critical-infrastructure"
  | "responder-journey";

export interface Spec262SpatialPoint {
  readonly type: "Point";
  /** GeoJSON coordinate order: longitude, latitude. */
  readonly coordinates: readonly [number, number];
}

export interface Spec262SpatialProjectionInput {
  readonly policyVersion: string;
  readonly audience: Spec262SpatialAudience;
  readonly entityClass: Spec262SpatialEntityClass;
  readonly geometry: Spec262SpatialPoint;
  readonly crs: string;
  /** Derived by the server from authenticated role, purpose and resource scope. */
  readonly authorizedExactAccess?: boolean;
  readonly purpose?: string;
  /** Deliberately ignored; client-selected modes cannot lower disclosure. */
  readonly requestedMapMode?: string;
}

export interface Spec262SpatialProjection {
  readonly policyVersion: "spec262-spatial-v1";
  readonly audience: Spec262SpatialAudience;
  readonly mode: "EXACT" | "GENERALIZED" | "SUPPRESSED";
  readonly crs: "EPSG:4326";
  readonly geometry: Spec262SpatialPoint | null;
  readonly reason: "authorized-purpose" | "stable-generalization" | "sensitive-class" | "invalid-policy-or-geometry";
}

const classGridDegrees: Readonly<Partial<Record<Spec262SpatialEntityClass, number>>> = {
  "ordinary-public-feature": 0.05,
  "protected-household": 0.25,
  "sensitive-facility": 0.5,
};
const exactAudiences = new Set<Spec262SpatialAudience>(["responder", "command"]);
const validEntityClasses = new Set<Spec262SpatialEntityClass>([
  "ordinary-public-feature", "protected-household", "sensitive-facility", "critical-infrastructure", "responder-journey",
]);
const validAudiences = new Set<Spec262SpatialAudience>(["public", "tenant", "responder", "command"]);

function boundedText(value: unknown, max = 200): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function isValidPoint(point: unknown): point is Spec262SpatialPoint {
  if (!point || typeof point !== "object" || Array.isArray(point)) return false;
  const candidate = point as { type?: unknown; coordinates?: unknown };
  if (candidate.type !== "Point" || !Array.isArray(candidate.coordinates) || candidate.coordinates.length !== 2) return false;
  const [longitude, latitude] = candidate.coordinates;
  return typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 &&
    typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90;
}

function suppressedProjection(reason: Spec262SpatialProjection["reason"], audience: Spec262SpatialAudience = "public"): Spec262SpatialProjection {
  return { policyVersion: "spec262-spatial-v1", audience, mode: "SUPPRESSED", crs: "EPSG:4326", geometry: null, reason };
}

/**
 * Applies audience and sensitivity policy before any client projection. Generalization is deterministic
 * within each class so repeated reads cannot be averaged to recover the source point. It never returns
 * the source reference or caller-selected map mode.
 */
export function projectSpec262SpatialLocation(input: Spec262SpatialProjectionInput): Spec262SpatialProjection {
  if (!input || input.policyVersion !== "spec262-spatial-v1" || input.crs !== "EPSG:4326" ||
      !validAudiences.has(input.audience) || !validEntityClasses.has(input.entityClass) || !isValidPoint(input.geometry)) {
    return suppressedProjection("invalid-policy-or-geometry", validAudiences.has(input?.audience) ? input.audience : "public");
  }

  const exactAuthorized = exactAudiences.has(input.audience) && input.authorizedExactAccess === true &&
    boundedText(input.purpose, 100) && input.purpose === "active-incident-response";
  if (exactAuthorized) {
    return {
      policyVersion: "spec262-spatial-v1", audience: input.audience, mode: "EXACT", crs: "EPSG:4326",
      geometry: { type: "Point", coordinates: [input.geometry.coordinates[0], input.geometry.coordinates[1]] },
      reason: "authorized-purpose",
    };
  }

  const grid = classGridDegrees[input.entityClass];
  if (grid === undefined) return suppressedProjection("sensitive-class", input.audience);

  const [longitude, latitude] = input.geometry.coordinates;
  // Round the grid cell's center for stable, bounded GeoJSON coordinates.
  const generalizedLongitude = Number(Math.min(180 - grid / 2, Math.max(-180 + grid / 2, Math.floor(longitude / grid) * grid + grid / 2)).toFixed(6));
  const generalizedLatitude = Number(Math.min(90 - grid / 2, Math.max(-90 + grid / 2, Math.floor(latitude / grid) * grid + grid / 2)).toFixed(6));
  return {
    policyVersion: "spec262-spatial-v1", audience: input.audience, mode: "GENERALIZED", crs: "EPSG:4326",
    geometry: { type: "Point", coordinates: [generalizedLongitude, generalizedLatitude] },
    reason: "stable-generalization",
  };
}

export type PublicAggregateProjection =
  | { readonly mode: "SUPPRESSED"; readonly countRange: null; readonly reason: "below-minimum-cohort" | "overlapping-query-family" | "invalid-input" }
  | { readonly mode: "RANGE"; readonly countRange: { readonly minimum: number; readonly maximum: number }; readonly reason: "coarsened-count" };

/**
 * Suppresses low cohorts and every repeated/overlapping query in a server-tracked query family.
 * `overlappingQueryCount` must come from a server-side privacy ledger, never from request JSON.
 */
export function projectPublicSpatialAggregate(input: {
  readonly count: number;
  readonly minimumCohort: number;
  readonly overlappingQueryCount: number;
}): PublicAggregateProjection {
  const invalid = !input || !Number.isSafeInteger(input.count) || input.count < 0 ||
    !Number.isSafeInteger(input.minimumCohort) || input.minimumCohort < 2 || input.minimumCohort > 1000 ||
    !Number.isSafeInteger(input.overlappingQueryCount) || input.overlappingQueryCount < 0;
  if (invalid) return { mode: "SUPPRESSED", countRange: null, reason: "invalid-input" };
  if (input.overlappingQueryCount > 0) return { mode: "SUPPRESSED", countRange: null, reason: "overlapping-query-family" };
  if (input.count < input.minimumCohort) return { mode: "SUPPRESSED", countRange: null, reason: "below-minimum-cohort" };

  const minimum = Math.floor(input.count / input.minimumCohort) * input.minimumCohort;
  const maximum = Math.min(Number.MAX_SAFE_INTEGER, minimum + input.minimumCohort - 1);
  return { mode: "RANGE", countRange: { minimum, maximum }, reason: "coarsened-count" };
}

export type GeospatialFederationResource = "impact-summary" | "observation-summary" | "public-alert-summary";
export type GeospatialFederationField = "hazardClass" | "severity" | "status" | "observedAt";

const federationFields: Readonly<Record<GeospatialFederationResource, ReadonlySet<GeospatialFederationField>>> = {
  "impact-summary": new Set(["hazardClass", "severity", "status", "observedAt"]),
  "observation-summary": new Set(["hazardClass", "severity", "status", "observedAt"]),
  "public-alert-summary": new Set(["hazardClass", "severity", "status", "observedAt"]),
};

export interface GeospatialFederationShareInput {
  readonly contractVersion: string;
  readonly partnerActive: boolean;
  readonly partnerVerified: boolean;
  readonly sourceTenantId: string;
  readonly tenantId: string;
  readonly partnerJurisdictions: readonly string[];
  readonly jurisdictionRef: string;
  readonly resourceType: GeospatialFederationResource;
  readonly resourceRef: string;
  readonly fields: readonly string[];
  readonly purpose: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly now: Date;
}

export interface GeospatialFederationDecision {
  readonly allowed: boolean;
  readonly reason: "authorized" | "invalid-contract-or-scope" | "partner-not-trusted" | "tenant-mismatch" | "jurisdiction-mismatch" | "grant-inactive" | "unsupported-field";
}

/** Fail-closed authorization decision; delivery workers must call again immediately before delivery. */
export function authorizeGeospatialFederationShare(input: GeospatialFederationShareInput): GeospatialFederationDecision {
  const deny = (reason: GeospatialFederationDecision["reason"]): GeospatialFederationDecision => ({ allowed: false, reason });
  if (!input || input.contractVersion !== "spec262-geospatial-share-v1" ||
      !boundedText(input.sourceTenantId) || !boundedText(input.tenantId) || !boundedText(input.jurisdictionRef) ||
      !boundedText(input.resourceRef) || !boundedText(input.purpose, 100) || !Array.isArray(input.partnerJurisdictions) ||
      !input.partnerJurisdictions.every(ref => boundedText(ref)) || typeof input.partnerActive !== "boolean" ||
      typeof input.partnerVerified !== "boolean" ||
      !(input.now instanceof Date) || !Number.isFinite(input.now.getTime()) || typeof input.expiresAt !== "string" ||
      !Array.isArray(input.fields) || input.fields.length === 0 || input.fields.length > 8) return deny("invalid-contract-or-scope");
  if (!input.partnerActive || !input.partnerVerified) return deny("partner-not-trusted");
  if (input.sourceTenantId !== input.tenantId) return deny("tenant-mismatch");
  if (!input.partnerJurisdictions.includes(input.jurisdictionRef)) return deny("jurisdiction-mismatch");
  const expiry = Date.parse(input.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= input.now.getTime() || input.revokedAt !== null) return deny("grant-inactive");
  const allowedFields = Object.prototype.hasOwnProperty.call(federationFields, input.resourceType)
    ? federationFields[input.resourceType]
    : undefined;
  if (!allowedFields || input.fields.some(field => !allowedFields.has(field as GeospatialFederationField))) return deny("unsupported-field");
  return { allowed: true, reason: "authorized" };
}

export type GeospatialRetentionClass = "personal-profile" | "exact-personal-geometry" | "spatial-interaction-telemetry" | "canonical-provenance" | "operational-evidence";
export type GeospatialRetentionResult = "DELETE" | "DEIDENTIFY" | "RETAIN_MINIMUM_NECESSARY" | "REQUIRES_REVIEW";

const minimumHoldFields: Readonly<Record<GeospatialRetentionClass, ReadonlySet<string>>> = {
  "personal-profile": new Set(["accountRef", "eventTime", "sourceRef"]),
  "exact-personal-geometry": new Set(["eventTime", "jurisdictionRef", "sourceRef"]),
  "spatial-interaction-telemetry": new Set(["eventTime", "policyVersion"]),
  "canonical-provenance": new Set(["eventTime", "jurisdictionRef", "sourceClass"]),
  "operational-evidence": new Set(["eventTime", "jurisdictionRef", "sourceRef", "sourceClass"]),
};

export interface GeospatialRetentionDecisionInput {
  readonly policyVersion: string;
  readonly requestType: "DELETE" | "ACCOUNT_CLOSE" | "RESTRICT_PROCESSING" | "EXPORT";
  readonly dataRef: string;
  readonly dataClass: GeospatialRetentionClass;
  readonly now: Date;
  readonly preserveCanonicalProvenance?: boolean;
  readonly requiredForActiveIncident?: boolean;
  readonly legalHold?: {
    readonly holdRef: string;
    readonly scopeRefs: readonly string[];
    readonly reason: string;
    readonly reviewedBy: string;
    readonly minimumFields: readonly string[];
    readonly expiresAt: string;
  };
}

export interface GeospatialRetentionDecision {
  readonly policyVersion: "spec262-retention-v1";
  readonly result: GeospatialRetentionResult;
  readonly retainedFields: readonly string[];
  readonly reason: "scoped-active-hold" | "hold-needs-review" | "active-incident-minimum" | "deidentify-required-provenance" | "ordinary-deletion" | "policy-review-required";
}

/** Resolves only a local policy decision. Persisting/auditing it and executing deletion are separate integrations. */
export function decideGeospatialRetention(input: GeospatialRetentionDecisionInput): GeospatialRetentionDecision {
  const decision = (
    result: GeospatialRetentionResult,
    retainedFields: readonly string[],
    reason: GeospatialRetentionDecision["reason"],
  ): GeospatialRetentionDecision => ({ policyVersion: "spec262-retention-v1", result, retainedFields, reason });
  if (!input || input.policyVersion !== "spec262-retention-v1" || !boundedText(input.dataRef) ||
      !(input.now instanceof Date) || !Number.isFinite(input.now.getTime()) ||
      !Object.prototype.hasOwnProperty.call(minimumHoldFields, input.dataClass)) {
    return decision("REQUIRES_REVIEW", [], "policy-review-required");
  }
  if (input.requestType !== "DELETE" && input.requestType !== "ACCOUNT_CLOSE") {
    return decision("REQUIRES_REVIEW", [], "policy-review-required");
  }

  const hold = input.legalHold;
  if (hold) {
    const expiry = typeof hold.expiresAt === "string" ? Date.parse(hold.expiresAt) : Number.NaN;
    const requiredFields = minimumHoldFields[input.dataClass];
    const validHold = boundedText(hold.holdRef) && Array.isArray(hold.scopeRefs) && hold.scopeRefs.length > 0 &&
      hold.scopeRefs.every(scopeRef => boundedText(scopeRef)) &&
      ["LEGAL_HOLD", "INCIDENT_AUDIT", "FINANCIAL", "PUBLIC_RECORD", "SAFETY_INVESTIGATION", "OTHER"].includes(hold.reason) &&
      boundedText(hold.reviewedBy) &&
      Number.isFinite(expiry) && expiry > input.now.getTime() && Array.isArray(hold.minimumFields) && hold.minimumFields.length > 0;
    if (!validHold) return decision("REQUIRES_REVIEW", [], "hold-needs-review");
    if (hold.scopeRefs.includes(input.dataRef)) {
      const safeFields = [...new Set(hold.minimumFields.filter(field => requiredFields.has(field)))];
      if (safeFields.length === 0) return decision("REQUIRES_REVIEW", [], "hold-needs-review");
      return decision("RETAIN_MINIMUM_NECESSARY", safeFields, "scoped-active-hold");
    }
  }

  if (input.dataClass === "operational-evidence" && input.requiredForActiveIncident === true) {
    return decision("RETAIN_MINIMUM_NECESSARY", [...minimumHoldFields[input.dataClass]], "active-incident-minimum");
  }
  if (input.dataClass === "canonical-provenance" && input.preserveCanonicalProvenance === true) {
    return decision("DEIDENTIFY", [...minimumHoldFields[input.dataClass]], "deidentify-required-provenance");
  }
  if (input.requestType === "DELETE" || input.requestType === "ACCOUNT_CLOSE") {
    return decision("DELETE", [], "ordinary-deletion");
  }
  return decision("REQUIRES_REVIEW", [], "policy-review-required");
}
