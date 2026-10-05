import { parseDataRequirement } from "./researchContracts";
import { evaluateSourceHealth, type SourceHealthAssessment } from "./sourceHealth";

/**
 * Provider-neutral Spec 266 DataRequirement/DataOffer resolution.
 *
 * This module is deliberately a pure policy evaluator: callers must supply
 * offers already loaded from an authorized catalog. It never fetches a source,
 * chooses a provider credential, or treats missing authorization as PUBLIC.
 */

export type DataEvidenceClass =
  | "reference" | "official_record" | "observation" | "derived" | "forecast"
  | "model_estimate" | "user_asserted" | "crowdsourced" | "official_warning";

export interface DataRequirement {
  readonly semanticType: string;
  readonly geography?: { readonly kind: string; readonly ref: string };
  readonly temporal?: { readonly from?: string; readonly to?: string };
  readonly minimumFreshness?: string;
  readonly minimumCoverage?: number;
  readonly requiredFields?: readonly string[];
  readonly acceptedSourceClasses?: readonly string[];
  readonly acceptedEvidenceClasses?: readonly DataEvidenceClass[];
  readonly commercialUseRequired?: boolean;
  readonly redistributableRequired?: boolean;
  readonly maximumCostCredits?: number;
  readonly privacyClass?: string;
  readonly required?: boolean;
}

export type OfferCost =
  | { readonly kind: "zero" }
  | { readonly kind: "known"; readonly credits: number }
  | { readonly kind: "estimated"; readonly credits: number }
  | { readonly kind: "unknown" };

export interface DataOffer {
  readonly id: string;
  readonly sourceRef: string;
  readonly datasetRef: string;
  readonly semanticTypes: readonly string[];
  readonly sourceClass?: string;
  readonly evidenceClass?: DataEvidenceClass;
  readonly geographyRefs: readonly string[];
  readonly temporalCoverage: { readonly from?: string; readonly to?: string };
  readonly freshness: { readonly observedAt?: string; readonly staleAfterSeconds: number };
  /** Canonical immutable evidence identity used to verify a hydrated index hit. */
  readonly evidence?: { readonly revision: number; readonly contentHash: string };
  /** Short-lived server snapshot bound to exactly this source/dataset offer. */
  readonly sourceHealth: SourceHealthAssessment;
  readonly rights: {
    readonly status: "granted" | "forbidden" | "unknown";
    readonly commercialUse: boolean;
    readonly redistributable: boolean;
    /** Explicit server-resolved permission to hydrate indexed content. */
    readonly contentHydrationAllowed: boolean;
    /** Server-resolved rights/ACL policy revision used to create this offer. */
    readonly policyVersion: string;
    /** Server-resolved upper bound for retaining a cache entry, if granted. */
    readonly retentionUntil?: string;
    /** Server-resolved upper bound for using this rights grant in cache. */
    readonly validUntil?: string;
  };
  /** Policy revision bound to the short-lived health assessment for this offer. */
  readonly healthPolicyVersion: string;
  readonly acl: {
    readonly allowed: boolean;
    readonly authorizationScope: "PUBLIC" | "TENANT";
    readonly tenantId?: string;
  };
  readonly estimatedCost: OfferCost;
  readonly estimatedLatencyMs: number;
  readonly qualityScore: number;
  readonly coverageScore?: number;
  readonly availableFields?: readonly string[];
  readonly privacyClass?: string;
  readonly placement: string;
  readonly mode: "query" | "materialize" | "cache" | "discovery";
}

export type OfferRejectionCode =
  | "AUTHORIZATION_SCOPE_REQUIRED" | "AUTHORIZATION_SCOPE_MISMATCH" | "ACL_DENIED"
  | "RIGHTS_UNVERIFIED" | "RIGHTS_FORBIDDEN" | "COMMERCIAL_USE_FORBIDDEN"
  | "REDISTRIBUTION_FORBIDDEN" | "SEMANTIC_MISMATCH" | "SOURCE_CLASS_MISMATCH"
  | "EVIDENCE_CLASS_MISMATCH" | "GEOGRAPHY_MISMATCH" | "TEMPORAL_COVERAGE_MISMATCH"
  | "OFFER_STALE" | "SOURCE_UNAVAILABLE" | "COVERAGE_INSUFFICIENT"
  | "REQUIRED_FIELDS_MISSING" | "COST_LIMIT_EXCEEDED" | "PRIVACY_CLASS_MISMATCH" | "PLACEMENT_UNAVAILABLE" | "OFFER_INVALID"
  | "SOURCE_HEALTH_UNVERIFIED" | "SOURCE_HEALTH_SCOPE_MISMATCH" | "SOURCE_HEALTH_EXPIRED" | "SOURCE_DEGRADED" | "SOURCE_STALE"
  | "SOURCE_SCHEMA_DRIFT" | "SOURCE_SEMANTIC_DRIFT" | "SOURCE_RIGHTS_HEALTH_FAILED" | "SOURCE_PLACEMENT_UNAVAILABLE" | "SOURCE_INDEX_UNHEALTHY"
  | "POLICY_VERSION_MISMATCH" | "RIGHTS_EXPIRED";

export interface OfferRejection {
  readonly offerId: string;
  readonly code: OfferRejectionCode;
}

export interface ResolveDataRequirementOptions {
  readonly now: Date;
  readonly authorizationScope?: "PUBLIC" | "TENANT";
  readonly tenantId?: string;
  readonly allowedPlacements?: readonly string[];
  /** Resolved by the server from current policy state, never from a vector hit. */
  readonly currentPolicyVersion: string;
  /** Current trusted index generation; required before hydrating index content. */
  readonly currentIndexGeneration?: string;
}

export interface DataRequirementResolution {
  readonly satisfied: boolean;
  readonly selected?: DataOffer;
  readonly eligible: readonly DataOffer[];
  readonly rejections: readonly OfferRejection[];
  readonly unsatisfiedReason?: "NO_ELIGIBLE_OFFER" | "AUTHORIZATION_SCOPE_REQUIRED";
}

export interface RetrievalProjection {
  readonly offerId: string;
  readonly sourceRef: string;
  readonly datasetRef: string;
  readonly authorizationScope: "PUBLIC" | "TENANT";
  readonly tenantId?: string;
  readonly policyVersion: string;
  readonly indexGeneration: string;
  readonly indexedAt: string;
  /** Immutable evidence identity that was indexed. */
  readonly evidenceRevision: number;
  readonly evidenceContentHash: string;
  /** Metadata may be discoverable when content indexing is prohibited. */
  readonly contentMode: "metadata" | "content";
}

export interface RetrievalCacheEntry {
  readonly offerId: string;
  readonly sourceRef: string;
  readonly datasetRef: string;
  readonly authorizationScope: "PUBLIC" | "TENANT";
  readonly tenantId?: string;
  readonly policyVersion: string;
  readonly cachedAt: string;
  readonly expiresAt: string;
}

export type RetrievalAuthorization =
  | { readonly ok: true; readonly mode: "metadata" | "content" }
  | { readonly ok: false; readonly code: OfferRejectionCode | "PROJECTION_INVALID" | "PROJECTION_SCOPE_MISMATCH" | "CACHE_INVALID" | "CACHE_EXPIRED" };

export type RetrievalCacheEvaluation =
  | { readonly ok: true; readonly ageSeconds: number }
  | { readonly ok: false; readonly code: OfferRejectionCode | "CACHE_INVALID" | "CACHE_EXPIRED" };

export type ConnectorUrlValidation =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly code: "CONNECTOR_URL_FORBIDDEN" };

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const SECRET_QUERY_KEY = /(?:api[_-]?key|authorization|cookie|credential|password|secret|token)/i;
const MAX_OFFERS = 100;

function isValidInstant(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function isBoundedStringList(value: unknown, maximum: number, minimum = 0): value is string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index) || typeof value[index] !== "string" || value[index].length === 0) return false;
  }
  return true;
}

function isValidOffer(offer: DataOffer): boolean {
  if (!offer || typeof offer !== "object" || typeof offer.id !== "string" || !offer.id || typeof offer.sourceRef !== "string" || !offer.sourceRef ||
    typeof offer.datasetRef !== "string" || !offer.datasetRef || !isBoundedStringList(offer.semanticTypes, 256, 1) || !isBoundedStringList(offer.geographyRefs, 256) ||
    (offer.availableFields !== undefined && !isBoundedStringList(offer.availableFields, 512)) || !Number.isFinite(offer.estimatedLatencyMs) || offer.estimatedLatencyMs < 0 ||
    !Number.isFinite(offer.qualityScore) || offer.qualityScore < 0 || offer.qualityScore > 1 ||
    (offer.coverageScore !== undefined && (!Number.isFinite(offer.coverageScore) || offer.coverageScore < 0 || offer.coverageScore > 1)) ||
    !offer.freshness || !Number.isFinite(offer.freshness.staleAfterSeconds) || offer.freshness.staleAfterSeconds < 0 ||
    !offer.temporalCoverage || typeof offer.temporalCoverage !== "object" ||
    !offer.rights || !["granted", "forbidden", "unknown"].includes(offer.rights.status) || typeof offer.rights.commercialUse !== "boolean" || typeof offer.rights.redistributable !== "boolean" || typeof offer.rights.contentHydrationAllowed !== "boolean" || !ID.test(offer.rights.policyVersion) || !ID.test(offer.healthPolicyVersion) ||
    !offer.acl || typeof offer.acl.allowed !== "boolean" || !["PUBLIC", "TENANT"].includes(offer.acl.authorizationScope) ||
    typeof offer.placement !== "string" || !offer.placement ||
    !["query", "materialize", "cache", "discovery"].includes(offer.mode) || !offer.estimatedCost || !["zero", "known", "estimated", "unknown"].includes(offer.estimatedCost.kind)) return false;
  if ((offer.estimatedCost.kind === "known" || offer.estimatedCost.kind === "estimated") &&
    (!Number.isFinite(offer.estimatedCost.credits) || offer.estimatedCost.credits < 0)) return false;
  if (offer.temporalCoverage && [offer.temporalCoverage.from, offer.temporalCoverage.to].some(value => value !== undefined && !isValidInstant(value))) return false;
  if (offer.temporalCoverage?.from && offer.temporalCoverage.to && Date.parse(offer.temporalCoverage.from) > Date.parse(offer.temporalCoverage.to)) return false;
  if ([offer.rights.validUntil, offer.rights.retentionUntil].some(value => value !== undefined && !isValidInstant(value))) return false;
  return true;
}

function isValidResolutionOptions(options: ResolveDataRequirementOptions): boolean {
  return Boolean(options) && options.now instanceof Date && Number.isFinite(options.now.getTime()) && ID.test(options.currentPolicyVersion) &&
    (options.currentIndexGeneration === undefined || ID.test(options.currentIndexGeneration)) &&
    (options.authorizationScope === undefined || options.authorizationScope === "PUBLIC" || options.authorizationScope === "TENANT") &&
    (options.authorizationScope !== "TENANT" || (typeof options.tenantId === "string" && ID.test(options.tenantId)));
}

function offerId(value: unknown): string {
  return value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string" && ID.test((value as { id: string }).id)
    ? (value as { id: string }).id
    : "invalid-offer";
}

function temporalCovers(
  coverage: DataOffer["temporalCoverage"],
  required: DataRequirement["temporal"],
): boolean {
  if (!required) return true;
  if (required.from && (!isValidInstant(coverage.from) || Date.parse(coverage.from) > Date.parse(required.from))) return false;
  if (required.to && (!isValidInstant(coverage.to) || Date.parse(coverage.to) < Date.parse(required.to))) return false;
  return true;
}

function offerAgeSeconds(offer: DataOffer, now: Date): number | undefined {
  if (!isValidInstant(offer.freshness.observedAt)) return undefined;
  const ageMilliseconds = now.getTime() - Date.parse(offer.freshness.observedAt);
  if (ageMilliseconds < -60_000) return undefined;
  return Math.max(0, ageMilliseconds / 1_000);
}

function rejectOffer(
  requirement: DataRequirement,
  offer: DataOffer,
  options: ResolveDataRequirementOptions,
): OfferRejectionCode | undefined {
  if (!isValidOffer(offer)) return "OFFER_INVALID";
  if (!options.authorizationScope) return "AUTHORIZATION_SCOPE_REQUIRED";
  if (offer.acl.authorizationScope !== options.authorizationScope) return "AUTHORIZATION_SCOPE_MISMATCH";
  if (options.authorizationScope === "TENANT" && (!options.tenantId || offer.acl.tenantId !== options.tenantId)) return "AUTHORIZATION_SCOPE_MISMATCH";
  if (!offer.acl.allowed) return "ACL_DENIED";
  if (offer.rights.status === "unknown") return "RIGHTS_UNVERIFIED";
  if (offer.rights.status !== "granted") return "RIGHTS_FORBIDDEN";
  if (offer.rights.policyVersion !== options.currentPolicyVersion || offer.healthPolicyVersion !== options.currentPolicyVersion) return "POLICY_VERSION_MISMATCH";
  if (offer.rights.validUntil && Date.parse(offer.rights.validUntil) <= options.now.getTime()) return "RIGHTS_EXPIRED";
  if (requirement.commercialUseRequired && !offer.rights.commercialUse) return "COMMERCIAL_USE_FORBIDDEN";
  if (requirement.redistributableRequired && !offer.rights.redistributable) return "REDISTRIBUTION_FORBIDDEN";
  if (!offer.semanticTypes.includes(requirement.semanticType)) return "SEMANTIC_MISMATCH";
  if (requirement.acceptedSourceClasses?.length && (!offer.sourceClass || !requirement.acceptedSourceClasses.includes(offer.sourceClass))) return "SOURCE_CLASS_MISMATCH";
  if (requirement.acceptedEvidenceClasses?.length && (!offer.evidenceClass || !requirement.acceptedEvidenceClasses.includes(offer.evidenceClass))) return "EVIDENCE_CLASS_MISMATCH";
  if (requirement.geography && !offer.geographyRefs.includes(requirement.geography.ref)) return "GEOGRAPHY_MISMATCH";
  if (!temporalCovers(offer.temporalCoverage, requirement.temporal)) return "TEMPORAL_COVERAGE_MISMATCH";
  const age = offerAgeSeconds(offer, options.now);
  if (age === undefined || age > offer.freshness.staleAfterSeconds) return "OFFER_STALE";
  if (requirement.minimumFreshness) {
    const maximumAgeSeconds = Number(requirement.minimumFreshness);
    if (!Number.isFinite(maximumAgeSeconds) || maximumAgeSeconds < 0 || age > maximumAgeSeconds) return "OFFER_STALE";
  }
  const health = evaluateSourceHealth(offer.sourceHealth, {
    sourceId: offer.sourceRef,
    datasetId: offer.datasetRef,
    offerId: offer.id,
    now: options.now,
    ...(offer.mode === "discovery" ? {} : { requiredDimensions: ["connectivity", "schema", "semantic", "freshness", "rights", "placement"] as const }),
  });
  if (!health.ok) return health.code;
  if (health.state !== "healthy") return health.rejectionCode;
  if (requirement.minimumCoverage !== undefined && (offer.coverageScore ?? 0) < requirement.minimumCoverage) return "COVERAGE_INSUFFICIENT";
  if (requirement.requiredFields?.some(field => !offer.availableFields?.includes(field))) return "REQUIRED_FIELDS_MISSING";
  if (requirement.maximumCostCredits !== undefined &&
    (offer.estimatedCost.kind === "unknown" || offer.estimatedCost.credits > requirement.maximumCostCredits)) return "COST_LIMIT_EXCEEDED";
  if (requirement.privacyClass && offer.privacyClass !== requirement.privacyClass) return "PRIVACY_CLASS_MISMATCH";
  if (options.allowedPlacements && !options.allowedPlacements.includes(offer.placement)) return "PLACEMENT_UNAVAILABLE";
  return undefined;
}

function compareCost(a: OfferCost, b: OfferCost): number {
  const rank = (cost: OfferCost) => {
    if (cost.kind === "zero") return [0, 0] as const;
    if (cost.kind === "known") return [1, cost.credits] as const;
    if (cost.kind === "estimated") return [2, cost.credits] as const;
    return [3, Number.POSITIVE_INFINITY] as const;
  };
  const left = rank(a);
  const right = rank(b);
  return left[0] - right[0] || left[1] - right[1];
}

/**
 * Resolves only offers that pass authorization, rights, semantic, spatial,
 * temporal, freshness, health, quality threshold and cost policy checks.
 * Unknown cost sorts after known/estimated cost and is never converted to zero.
 */
export function resolveDataRequirement(
  requirement: DataRequirement,
  offers: readonly DataOffer[],
  options: ResolveDataRequirementOptions,
): DataRequirementResolution {
  if (!isValidResolutionOptions(options)) throw new Error("RESOLUTION_OPTIONS_INVALID");
  if (!parseDataRequirement(requirement).ok) throw new Error("DATA_REQUIREMENT_INVALID");
  if (!Array.isArray(offers) || offers.length > MAX_OFFERS || offers.some((offer, index) => !Object.prototype.hasOwnProperty.call(offers, index))) throw new Error("DATA_OFFERS_INVALID");
  if (!options.authorizationScope) {
    return {
      satisfied: false,
      eligible: [],
      rejections: offers.map(offer => ({ offerId: offerId(offer), code: "AUTHORIZATION_SCOPE_REQUIRED" })),
      unsatisfiedReason: "AUTHORIZATION_SCOPE_REQUIRED",
    };
  }

  const eligible: DataOffer[] = [];
  const rejections: OfferRejection[] = [];
  for (const offer of offers) {
    const code = rejectOffer(requirement, offer, options);
    if (code) rejections.push({ offerId: offerId(offer), code });
    else eligible.push(offer);
  }

  eligible.sort((a, b) => {
    const coverage = (b.coverageScore ?? 0) - (a.coverageScore ?? 0);
    if (coverage) return coverage;
    const quality = b.qualityScore - a.qualityScore;
    if (quality) return quality;
    const cost = compareCost(a.estimatedCost, b.estimatedCost);
    if (cost) return cost;
    return a.estimatedLatencyMs - b.estimatedLatencyMs || a.id.localeCompare(b.id);
  });

  return {
    satisfied: eligible.length > 0,
    ...(eligible[0] ? { selected: eligible[0] } : {}),
    eligible,
    rejections,
    ...(eligible.length ? {} : { unsatisfiedReason: "NO_ELIGIBLE_OFFER" as const }),
  };
}

/**
 * A search index hit is discovery metadata only. This checks the hit against
 * the current catalog offer before metadata or content can be hydrated.
 */
export function authorizeRetrievalProjection(
  requirement: DataRequirement,
  offer: DataOffer,
  options: ResolveDataRequirementOptions,
  projection: RetrievalProjection,
): RetrievalAuthorization {
  const resolved = resolveDataRequirement(requirement, [offer], options);
  if (!resolved.satisfied) return { ok: false, code: resolved.rejections[0]?.code ?? "PROJECTION_INVALID" };
  if (!projection || typeof projection !== "object" || !ID.test(projection.offerId) || !ID.test(projection.sourceRef) || !ID.test(projection.datasetRef) ||
    !ID.test(projection.policyVersion) || !ID.test(projection.indexGeneration) || !isValidInstant(projection.indexedAt) ||
    !Number.isSafeInteger(projection.evidenceRevision) || projection.evidenceRevision < 1 || !/^[a-f0-9]{64}$/i.test(projection.evidenceContentHash) ||
    (projection.authorizationScope !== "PUBLIC" && projection.authorizationScope !== "TENANT") ||
    (projection.authorizationScope === "TENANT" && (!projection.tenantId || !ID.test(projection.tenantId))) ||
    (projection.contentMode !== "metadata" && projection.contentMode !== "content")) return { ok: false, code: "PROJECTION_INVALID" };
  if (!offer.evidence || !Number.isSafeInteger(offer.evidence.revision) || offer.evidence.revision < 1 || !/^[a-f0-9]{64}$/i.test(offer.evidence.contentHash) ||
    !options.currentIndexGeneration || projection.indexGeneration !== options.currentIndexGeneration ||
    projection.offerId !== offer.id || projection.sourceRef !== offer.sourceRef || projection.datasetRef !== offer.datasetRef ||
    projection.evidenceRevision !== offer.evidence.revision || projection.evidenceContentHash !== offer.evidence.contentHash ||
    projection.authorizationScope !== options.authorizationScope || projection.tenantId !== options.tenantId || projection.policyVersion !== options.currentPolicyVersion) {
    return { ok: false, code: "PROJECTION_SCOPE_MISMATCH" };
  }
  if (projection.contentMode === "content" && !offer.rights.contentHydrationAllowed) return { ok: false, code: "RIGHTS_FORBIDDEN" };
  return { ok: true, mode: projection.contentMode };
}

/** Rechecks authorization first, then reports cache age without exposing cached payload. */
export function evaluateRetrievalCache(
  requirement: DataRequirement,
  offer: DataOffer,
  options: ResolveDataRequirementOptions,
  entry: RetrievalCacheEntry,
): RetrievalCacheEvaluation {
  const resolved = resolveDataRequirement(requirement, [offer], options);
  if (!resolved.satisfied) return { ok: false, code: resolved.rejections[0]?.code ?? "CACHE_INVALID" };
  if (!entry || typeof entry !== "object" || !ID.test(entry.offerId) || !ID.test(entry.sourceRef) || !ID.test(entry.datasetRef) || !ID.test(entry.policyVersion) ||
    !isValidInstant(entry.cachedAt) || !isValidInstant(entry.expiresAt) || (entry.authorizationScope !== "PUBLIC" && entry.authorizationScope !== "TENANT") ||
    (entry.authorizationScope === "TENANT" && (!entry.tenantId || !ID.test(entry.tenantId)))) return { ok: false, code: "CACHE_INVALID" };
  if (entry.offerId !== offer.id || entry.sourceRef !== offer.sourceRef || entry.datasetRef !== offer.datasetRef || entry.authorizationScope !== options.authorizationScope ||
    entry.tenantId !== options.tenantId || entry.policyVersion !== options.currentPolicyVersion || Date.parse(entry.expiresAt) <= Date.parse(entry.cachedAt) || Date.parse(entry.cachedAt) > options.now.getTime()) return { ok: false, code: "CACHE_INVALID" };
  const observedAt = offer.freshness.observedAt;
  const freshnessExpiresAt = isValidInstant(observedAt)
    ? Date.parse(observedAt) + offer.freshness.staleAfterSeconds * 1_000
    : undefined;
  const cacheBounds = [freshnessExpiresAt, offer.sourceHealth.validUntil, offer.rights.validUntil, offer.rights.retentionUntil]
    .map(value => typeof value === "number" ? value : isValidInstant(value) ? Date.parse(value) : undefined);
  if (cacheBounds.some(value => value === undefined)) return { ok: false, code: "CACHE_INVALID" };
  const cacheValidUntil = Math.min(...cacheBounds as number[]);
  if (Date.parse(entry.expiresAt) > cacheValidUntil) return { ok: false, code: "CACHE_INVALID" };
  if (cacheValidUntil <= options.now.getTime()) return { ok: false, code: "CACHE_EXPIRED" };
  if (Date.parse(entry.expiresAt) <= options.now.getTime()) return { ok: false, code: "CACHE_EXPIRED" };
  return { ok: true, ageSeconds: Math.max(0, (options.now.getTime() - Date.parse(entry.cachedAt)) / 1_000) };
}

/**
 * URL-only connector admission. DNS resolution and network execution remain
 * outside this pure boundary; the execution runtime must resolve DNS and
 * enforce egress against the approved destination policy after resolution.
 */
export function validateConnectorUrl(value: unknown, allowedHosts: readonly string[]): ConnectorUrlValidation {
  if (typeof value !== "string" || value.length > 2_048 || !Array.isArray(allowedHosts) || allowedHosts.length === 0 || allowedHosts.length > 64) {
    return { ok: false, code: "CONNECTOR_URL_FORBIDDEN" };
  }
  const hosts = new Set<string>();
  for (let index = 0; index < allowedHosts.length; index += 1) {
    const host = allowedHosts[index];
    if (!Object.prototype.hasOwnProperty.call(allowedHosts, index) || typeof host !== "string" || !/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i.test(host) || host.includes("..") || isForbiddenConnectorHost(host)) {
      return { ok: false, code: "CONNECTOR_URL_FORBIDDEN" };
    }
    hosts.add(host.toLowerCase());
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || isForbiddenConnectorHost(url.hostname) || !hosts.has(url.hostname.toLowerCase()) ||
      [...url.searchParams.keys()].some(key => SECRET_QUERY_KEY.test(key))) return { ok: false, code: "CONNECTOR_URL_FORBIDDEN" };
    return { ok: true, url: url.toString() };
  } catch {
    return { ok: false, code: "CONNECTOR_URL_FORBIDDEN" };
  }
}

function isForbiddenConnectorHost(value: string): boolean {
  const host = value.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.includes(":")) return true;
  const parts = host.split(".");
  return parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
