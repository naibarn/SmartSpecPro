/**
 * Static, provider-neutral capability evidence. This module deliberately does
 * not discover geographies, fetch providers, or expose source endpoints.
 * Callers must supply a trusted, bounded geography path and live source facts.
 */
export const GEO_CAPABILITY_MANIFEST_SCHEMA_VERSION = 1 as const;

export const GEOGRAPHIC_CAPABILITY_IDS = [
  "map",
  "weather",
  "alerts",
  "routes",
  "local_emergency",
  "hydrology",
  "local_news",
  "community",
] as const;

export type GeographicCapabilityId = (typeof GEOGRAPHIC_CAPABILITY_IDS)[number];
export type GeographicScopeKind = "country" | "admin1" | "admin2" | "basin" | "sub_basin" | "provider_geometry";
export type GeographicCapabilityStatus =
  | "AVAILABLE"
  | "PARTIAL"
  | "DEGRADED"
  | "NOT_CONFIGURED"
  | "NOT_SUPPORTED"
  | "TEMPORARILY_UNAVAILABLE"
  | "UNKNOWN";

export interface GeographicScopeReference {
  /** Opaque registry key, never a raw coverage polygon. */
  readonly id: string;
  readonly kind: GeographicScopeKind;
}

/** Ordered from the most-specific resolved geography to the broadest parent. */
export interface TrustedGeographicPath {
  readonly crs: "EPSG:4326" | string;
  readonly boundaryRevision: string;
  readonly scopes: readonly GeographicScopeReference[];
}

export interface GeographicCapabilitySourceEvidence {
  readonly id: string;
  readonly rights: "permitted" | "denied" | "unknown";
  readonly coverage: "complete" | "partial" | "unavailable" | "unknown";
  readonly health: "healthy" | "degraded" | "unavailable" | "unknown";
  /** ISO timestamp supplied by the approved source-health registry. */
  readonly observedAt?: string;
  /** Maximum acceptable source age for this capability at this scope. */
  readonly maxAgeMs?: number;
}

/**
 * An immutable regional/global pack entry. Runtime credentials, source URLs,
 * tenant identities, mutable health, and private geometry never belong here.
 */
export interface GeographicCapabilityManifest {
  readonly id: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly schemaVersion: number;
  readonly capability: GeographicCapabilityId;
  readonly scope: GeographicScopeReference;
  readonly boundaryRevision: string;
  readonly source: GeographicCapabilitySourceEvidence;
  readonly activation?: "active" | "inactive";
  readonly supported?: boolean;
}

export interface GeographicCapabilityRequest {
  readonly capability: GeographicCapabilityId;
  readonly geography: TrustedGeographicPath;
  /** The approved active version per pack, if a registry has selected one. */
  readonly expectedPackVersions?: Readonly<Record<string, string>>;
  /** Explicit caller clock keeps replay and tests deterministic. */
  readonly now: string;
}

export type GeographicCapabilityReason =
  | "available"
  | "partial_coverage"
  | "source_health_degraded"
  | "source_health_unknown"
  | "source_unavailable"
  | "freshness_unknown"
  | "source_stale"
  | "source_rights_missing"
  | "source_rights_denied"
  | "coverage_unknown"
  | "coverage_unavailable"
  | "no_matching_manifest"
  | "capability_not_supported"
  | "pack_inactive"
  | "pack_version_mismatch"
  | "schema_version_unsupported"
  | "boundary_revision_mismatch"
  | "unsupported_crs"
  | "geography_unknown"
  | "invalid_clock";

export interface GeographicCapabilityResolution {
  readonly capability: GeographicCapabilityId;
  readonly status: GeographicCapabilityStatus;
  /** Unknown means no authoritative, revision-compatible geographic answer. */
  readonly resolution: "resolved" | "unknown";
  readonly reason: GeographicCapabilityReason;
  readonly manifestId: string | null;
  readonly sourceId: string | null;
  readonly resolvedScope: GeographicScopeReference | null;
  readonly packId: string | null;
  readonly packVersion: string | null;
  /** Status of every compatible source at the selected geographic scope. */
  readonly sourceStatuses: readonly GeographicCapabilitySourceStatus[];
}

export interface GeographicCapabilitySourceStatus {
  readonly manifestId: string;
  readonly sourceId: string;
  readonly status: GeographicCapabilityStatus;
  readonly reason: GeographicCapabilityReason;
}

const EMPTY_RESOLUTION: Omit<GeographicCapabilityResolution, "capability" | "status" | "resolution" | "reason"> = {
  manifestId: null,
  sourceId: null,
  resolvedScope: null,
  packId: null,
  packVersion: null,
  sourceStatuses: [],
};

function result(
  capability: GeographicCapabilityId,
  status: GeographicCapabilityStatus,
  resolution: "resolved" | "unknown",
  reason: GeographicCapabilityReason,
  manifest?: GeographicCapabilityManifest,
): GeographicCapabilityResolution {
  return {
    ...EMPTY_RESOLUTION,
    capability,
    status,
    resolution,
    reason,
    ...(manifest ? {
      manifestId: manifest.id,
      sourceId: manifest.source.id,
      resolvedScope: manifest.scope,
      packId: manifest.packId,
      packVersion: manifest.packVersion,
    } : {}),
  };
}

function validId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/.test(value);
}

function scopeSpecificity(path: readonly GeographicScopeReference[], scope: GeographicScopeReference): number {
  return path.findIndex(candidate => candidate.id === scope.id && candidate.kind === scope.kind);
}

function compareManifest(a: GeographicCapabilityManifest, b: GeographicCapabilityManifest): number {
  return a.source.id.localeCompare(b.source.id) || a.id.localeCompare(b.id);
}

const STATUS_PRIORITY: Readonly<Record<GeographicCapabilityStatus, number>> = {
  AVAILABLE: 0,
  PARTIAL: 1,
  DEGRADED: 2,
  TEMPORARILY_UNAVAILABLE: 3,
  NOT_CONFIGURED: 4,
  NOT_SUPPORTED: 5,
  UNKNOWN: 6,
};

function evaluateManifest(manifest: GeographicCapabilityManifest, now: string): GeographicCapabilitySourceStatus {
  const source = manifest.source;
  let status: GeographicCapabilityStatus;
  let reason: GeographicCapabilityReason;
  if (manifest.supported === false) [status, reason] = ["NOT_SUPPORTED", "capability_not_supported"];
  else if (source.rights === "unknown") [status, reason] = ["NOT_CONFIGURED", "source_rights_missing"];
  else if (source.rights === "denied") [status, reason] = ["NOT_CONFIGURED", "source_rights_denied"];
  else if (source.coverage === "unknown") [status, reason] = ["NOT_CONFIGURED", "coverage_unknown"];
  else if (source.coverage === "unavailable") [status, reason] = ["TEMPORARILY_UNAVAILABLE", "coverage_unavailable"];
  else if (source.health === "unknown") [status, reason] = ["TEMPORARILY_UNAVAILABLE", "source_health_unknown"];
  else if (source.health === "unavailable") [status, reason] = ["TEMPORARILY_UNAVAILABLE", "source_unavailable"];
  else if (!source.observedAt || source.maxAgeMs === undefined || !Number.isFinite(source.maxAgeMs) || source.maxAgeMs < 0 || !Number.isFinite(Date.parse(source.observedAt))) [status, reason] = ["TEMPORARILY_UNAVAILABLE", "freshness_unknown"];
  else if (Date.parse(source.observedAt) > Date.parse(now)) [status, reason] = ["TEMPORARILY_UNAVAILABLE", "freshness_unknown"];
  else if (Date.parse(now) - Date.parse(source.observedAt) > source.maxAgeMs) [status, reason] = ["TEMPORARILY_UNAVAILABLE", "source_stale"];
  else if (source.health === "degraded") [status, reason] = ["DEGRADED", "source_health_degraded"];
  else if (source.coverage === "partial") [status, reason] = ["PARTIAL", "partial_coverage"];
  else [status, reason] = ["AVAILABLE", "available"];
  return { manifestId: manifest.id, sourceId: source.id, status, reason };
}

function validatePath(request: GeographicCapabilityRequest): GeographicCapabilityReason | null {
  if (request.geography.crs !== "EPSG:4326") return "unsupported_crs";
  if (!validId(request.geography.boundaryRevision) || request.geography.scopes.length === 0 ||
    request.geography.scopes.some(scope => !validId(scope.id))) return "geography_unknown";
  return Number.isNaN(Date.parse(request.now)) ? "invalid_clock" : null;
}

/**
 * Resolve one capability at one trusted geography path. A narrower declared
 * scope always wins, even when its source is degraded, so a healthy national
 * average cannot mask a provincial loss of coverage.
 */
export function resolveGeographicCapability(
  request: GeographicCapabilityRequest,
  manifests: readonly GeographicCapabilityManifest[],
): GeographicCapabilityResolution {
  const pathProblem = validatePath(request);
  if (pathProblem) return result(request.capability, "UNKNOWN", "unknown", pathProblem);

  const matching = manifests
    .filter(manifest => manifest.capability === request.capability)
    .map(manifest => ({ manifest, specificity: scopeSpecificity(request.geography.scopes, manifest.scope) }))
    .filter((candidate): candidate is { manifest: GeographicCapabilityManifest; specificity: number } => candidate.specificity >= 0);
  if (matching.length === 0) return result(request.capability, "NOT_CONFIGURED", "resolved", "no_matching_manifest");

  const highestSpecificity = Math.min(...matching.map(candidate => candidate.specificity));
  const candidates = matching
    .filter(candidate => candidate.specificity === highestSpecificity)
    .map(candidate => candidate.manifest)
    .sort(compareManifest);

  const active = candidates.filter(candidate => candidate.activation !== "inactive");
  if (active.length === 0) return result(request.capability, "NOT_CONFIGURED", "resolved", "pack_inactive", candidates[0]);
  const compatibleSchema = active.filter(candidate => candidate.schemaVersion === GEO_CAPABILITY_MANIFEST_SCHEMA_VERSION);
  if (compatibleSchema.length === 0) return result(request.capability, "UNKNOWN", "unknown", "schema_version_unsupported", active[0]);
  const matchingBoundary = compatibleSchema.filter(candidate => candidate.boundaryRevision === request.geography.boundaryRevision);
  if (matchingBoundary.length === 0) return result(request.capability, "UNKNOWN", "unknown", "boundary_revision_mismatch", compatibleSchema[0]);
  const versioned = matchingBoundary.filter(candidate => {
    const expected = request.expectedPackVersions?.[candidate.packId];
    return expected === undefined || expected === candidate.packVersion;
  });
  if (versioned.length === 0) return result(request.capability, "UNKNOWN", "unknown", "pack_version_mismatch", matchingBoundary[0]);

  const evaluated = versioned
    .map(manifest => ({ manifest, sourceStatus: evaluateManifest(manifest, request.now) }))
    .sort((a, b) => STATUS_PRIORITY[a.sourceStatus.status] - STATUS_PRIORITY[b.sourceStatus.status] || compareManifest(a.manifest, b.manifest));
  const selected = evaluated[0];
  return {
    ...result(request.capability, selected.sourceStatus.status, "resolved", selected.sourceStatus.reason, selected.manifest),
    sourceStatuses: evaluated.map(({ sourceStatus }) => sourceStatus).sort((a, b) => a.sourceId.localeCompare(b.sourceId) || a.manifestId.localeCompare(b.manifestId)),
  };
}
