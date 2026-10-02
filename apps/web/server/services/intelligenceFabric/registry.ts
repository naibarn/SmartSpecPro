import type { EvidenceClass } from "./contracts";

export type ProviderStatus = "active" | "degraded" | "suspended" | "retired";
export type SourceStatus = "discovered" | "profiling" | "testing" | "active" | "degraded" | "suspended" | "retired";
export type DatasetStatus = "draft" | "active" | "degraded" | "retired";
export type RightsVerdict = "allowed" | "restricted" | "forbidden" | "unknown";

export interface ProviderDefinition {
  readonly id: string;
  readonly name: string;
  readonly ownerType: "government" | "platform" | "partner" | "commercial" | "tenant" | "user" | "community" | "unknown";
  readonly authorityClass?: string;
  readonly homepageRef?: string;
  readonly contactRef?: string;
  readonly status: ProviderStatus;
}

export interface DataSourceDefinition {
  readonly id: string;
  readonly providerId: string;
  readonly ownerType: "platform" | "tenant" | "user" | "creator" | "partner";
  readonly ownerId?: string;
  readonly name: string;
  readonly sourceType: "API" | "DATABASE" | "FILE" | "GIS" | "STREAM" | "WEB" | "MCP" | "WEBHOOK" | "SENSOR" | "MEDIA";
  readonly adapterRef: string;
  readonly sourceContractRef: string;
  readonly rightsPolicyRef: string;
  readonly credentialRef?: string;
  readonly qualityProfileRef: string;
  readonly geographyCoverageRef?: string;
  readonly temporalCoverageRef?: string;
  readonly refreshPolicyRef?: string;
  readonly pricingPolicyRef?: string;
  readonly executionPlacementPolicyRef?: string;
  readonly visibility: "private" | "project" | "tenant" | "marketplace" | "platform";
  readonly status: SourceStatus;
}

export interface DatasetDefinition {
  readonly id: string;
  readonly sourceId: string;
  readonly name: string;
  readonly description?: string;
  readonly schemaRef: string;
  readonly semanticMappingRef?: string;
  readonly semanticCapabilities: readonly string[];
  readonly geographyCoverageRef?: string;
  readonly temporalCoverageRef?: string;
  readonly updateMode: "STATIC" | "PERIODIC" | "REALTIME" | "EVENT" | "ON_DEMAND";
  readonly evidenceClassDefault?: EvidenceClass;
  readonly vectorIndexPolicy: "METADATA_ONLY" | "CONTENT" | "DERIVED_SUMMARY" | "DO_NOT_INDEX";
  readonly status: DatasetStatus;
}

export interface DataRightsPolicy {
  readonly id: string;
  readonly licenseId?: string;
  readonly commercialUse: RightsVerdict;
  readonly redistribution: RightsVerdict;
  readonly derivedData: RightsVerdict;
  readonly rawExport: RightsVerdict;
  readonly resultExport: RightsVerdict;
  readonly modelTrainingUse: RightsVerdict;
  readonly crossTenantLearningUse: RightsVerdict;
  readonly sublicensing: RightsVerdict;
  readonly cachePolicy: "allowed" | "ttl_limited" | "forbidden" | "unknown";
  readonly cacheTtlSeconds?: number;
  readonly retentionPolicyRef?: string;
  readonly attributionRequired: boolean;
  readonly attributionTextRef?: string;
  readonly geographicRestrictions?: readonly string[];
  readonly purposeRestrictions?: readonly string[];
  readonly audienceRestrictions?: readonly string[];
  readonly residencyRestrictions?: readonly string[];
  readonly contractualExpiryAt?: string;
  readonly termsUrlRef?: string;
  readonly reviewedAt?: string;
  readonly reviewerRef?: string;
  readonly revision: string;
}

export interface RegistrySnapshot {
  readonly providers: readonly ProviderDefinition[];
  readonly sources: readonly DataSourceDefinition[];
  readonly datasets: readonly DatasetDefinition[];
  readonly rights: readonly DataRightsPolicy[];
}

export type RegistryResolutionError =
  | "REGISTRY_REFERENCE_NOT_FOUND" | "PROVIDER_UNAVAILABLE" | "SOURCE_UNAVAILABLE" | "DATASET_UNAVAILABLE"
  | "DATASET_SOURCE_MISMATCH" | "SOURCE_SCOPE_FORBIDDEN" | "RIGHTS_UNVERIFIED" | "RIGHTS_FORBIDDEN"
  | "PURPOSE_FORBIDDEN" | "AUDIENCE_FORBIDDEN" | "SOURCE_ACCESS_NOT_AUTHORIZED" | "RIGHTS_EXPIRED" | "GEOGRAPHY_FORBIDDEN" | "RESIDENCY_FORBIDDEN" | "SOURCE_ACTIVATION_INCOMPLETE";

export interface ResolveRegisteredSourceInput {
  readonly sourceId: string;
  readonly datasetId: string;
  readonly authorizationScope?: "PUBLIC" | "TENANT";
  readonly tenantId?: string;
  readonly purpose: string;
  readonly audience: string;
  readonly geography?: string;
  readonly residency?: string;
  /** Required when evaluating a time-bounded policy; caller supplies a request-pinned server time. */
  readonly now?: Date;
  readonly commercialUse: boolean;
  readonly redistributionRequired?: boolean;
  /** Server-authorized source grants; never copied from an untrusted request. */
  readonly authorizedSourceIds?: readonly string[];
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const isId = (value: unknown): value is string => typeof value === "string" && ID.test(value);
const reject = (code: RegistryResolutionError) => ({ ok: false as const, code });
const RIGHTS_VERDICTS = new Set<RightsVerdict>(["allowed", "restricted", "forbidden", "unknown"]);
const RIGHTS_BOOLEAN_FIELDS = ["attributionRequired"] as const;
const RIGHTS_VERDICT_FIELDS = ["commercialUse", "redistribution", "derivedData", "rawExport", "resultExport", "modelTrainingUse", "crossTenantLearningUse", "sublicensing"] as const;
const MAX_REGISTRY_ENTRIES = 10_000;
const MAX_RESTRICTIONS = 256;
const PROVIDER_OWNERS = new Set(["government", "platform", "partner", "commercial", "tenant", "user", "community", "unknown"]);
const PROVIDER_STATUSES = new Set(["active", "degraded", "suspended", "retired"]);
const SOURCE_OWNERS = new Set(["platform", "tenant", "user", "creator", "partner"]);
const SOURCE_TYPES = new Set(["API", "DATABASE", "FILE", "GIS", "STREAM", "WEB", "MCP", "WEBHOOK", "SENSOR", "MEDIA"]);
const SOURCE_VISIBILITIES = new Set(["private", "project", "tenant", "marketplace", "platform"]);
const SOURCE_STATUSES = new Set(["discovered", "profiling", "testing", "active", "degraded", "suspended", "retired"]);
const DATASET_STATUSES = new Set(["draft", "active", "degraded", "retired"]);
const DATASET_UPDATE_MODES = new Set(["STATIC", "PERIODIC", "REALTIME", "EVENT", "ON_DEMAND"]);
const DATASET_INDEX_POLICIES = new Set(["METADATA_ONLY", "CONTENT", "DERIVED_SUMMARY", "DO_NOT_INDEX"]);
const EVIDENCE_CLASSES = new Set<EvidenceClass>(["reference", "official_record", "observation", "derived", "forecast", "model_estimate", "user_asserted", "crowdsourced", "official_warning"]);
const PROVIDER_FIELDS = new Set(["id", "name", "ownerType", "authorityClass", "homepageRef", "contactRef", "status"]);
const SOURCE_FIELDS = new Set(["id", "providerId", "ownerType", "ownerId", "name", "description", "sourceType", "adapterRef", "sourceContractRef", "rightsPolicyRef", "credentialRef", "qualityProfileRef", "geographyCoverageRef", "temporalCoverageRef", "refreshPolicyRef", "pricingPolicyRef", "executionPlacementPolicyRef", "visibility", "status"]);
const DATASET_FIELDS = new Set(["id", "sourceId", "name", "description", "schemaRef", "semanticMappingRef", "semanticCapabilities", "geographyCoverageRef", "temporalCoverageRef", "updateMode", "evidenceClassDefault", "vectorIndexPolicy", "status"]);
const RIGHTS_FIELDS = new Set(["id", "licenseId", ...RIGHTS_VERDICT_FIELDS, "cachePolicy", "cacheTtlSeconds", "retentionPolicyRef", "attributionRequired", "attributionTextRef", "geographicRestrictions", "purposeRestrictions", "audienceRestrictions", "residencyRestrictions", "contractualExpiryAt", "termsUrlRef", "reviewedAt", "reviewerRef", "revision"]);
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function hasOnlyFields(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key) && !allowed.has(key)) return false;
  }
  return true;
}

function isInstant(value: unknown): value is string {
  return typeof value === "string" && INSTANT.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function isDenseBoundedRecordArray(value: unknown): value is Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > MAX_REGISTRY_ENTRIES) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index) || !isPlainRecord(value[index])) return false;
  }
  return true;
}

function hasUniqueIds(values: readonly Record<string, unknown>[]): boolean {
  const ids = new Set<string>();
  for (const value of values) {
    if (!isId(value.id) || ids.has(value.id)) return false;
    ids.add(value.id);
  }
  return true;
}

function isIdList(value: unknown, maximum: number): value is readonly string[] {
  if (!Array.isArray(value) || value.length > maximum) return false;
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const item: unknown = value[index];
    if (!Object.prototype.hasOwnProperty.call(value, index) || !isId(item) || seen.has(item)) return false;
    seen.add(item);
  }
  return true;
}

function isRestrictionList(value: unknown): value is readonly string[] | undefined {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > MAX_RESTRICTIONS) return false;
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const item: unknown = value[index];
    if (!Object.prototype.hasOwnProperty.call(value, index) || !isId(item) || seen.has(item)) return false;
    seen.add(item);
  }
  return true;
}

function isValidRegistry(registry: unknown): registry is RegistrySnapshot {
  if (!isPlainRecord(registry) || !isDenseBoundedRecordArray(registry.providers) || !isDenseBoundedRecordArray(registry.sources) ||
    !isDenseBoundedRecordArray(registry.datasets) || !isDenseBoundedRecordArray(registry.rights) ||
    !hasUniqueIds(registry.providers) || !hasUniqueIds(registry.sources) || !hasUniqueIds(registry.datasets) || !hasUniqueIds(registry.rights)) return false;
  return registry.providers.every(provider => hasOnlyFields(provider, PROVIDER_FIELDS) && isId(provider.id) && typeof provider.name === "string" && provider.name.trim().length > 0 && provider.name.length <= 256 && PROVIDER_OWNERS.has(provider.ownerType) && PROVIDER_STATUSES.has(provider.status) &&
      (provider.authorityClass === undefined || isId(provider.authorityClass)) && (provider.homepageRef === undefined || isId(provider.homepageRef)) && (provider.contactRef === undefined || isId(provider.contactRef))) &&
    registry.sources.every(source => hasOnlyFields(source, SOURCE_FIELDS) && isId(source.id) && isId(source.providerId) && typeof source.name === "string" && source.name.trim().length > 0 && source.name.length <= 256 && SOURCE_OWNERS.has(source.ownerType) && SOURCE_TYPES.has(source.sourceType) && SOURCE_VISIBILITIES.has(source.visibility) && SOURCE_STATUSES.has(source.status) &&
      isId(source.adapterRef) && isId(source.sourceContractRef) && isId(source.rightsPolicyRef) && isId(source.qualityProfileRef) &&
      [source.ownerId, source.credentialRef, source.geographyCoverageRef, source.temporalCoverageRef, source.refreshPolicyRef, source.pricingPolicyRef, source.executionPlacementPolicyRef].every(value => value === undefined || isId(value)) &&
      (source.description === undefined || (typeof source.description === "string" && source.description.length <= 4_096))) &&
    registry.datasets.every(dataset => hasOnlyFields(dataset, DATASET_FIELDS) && isId(dataset.id) && isId(dataset.sourceId) && isId(dataset.schemaRef) && typeof dataset.name === "string" && dataset.name.trim().length > 0 && dataset.name.length <= 256 && DATASET_STATUSES.has(dataset.status) && DATASET_UPDATE_MODES.has(dataset.updateMode) && DATASET_INDEX_POLICIES.has(dataset.vectorIndexPolicy) && isIdList(dataset.semanticCapabilities, 256) &&
      [dataset.semanticMappingRef, dataset.geographyCoverageRef, dataset.temporalCoverageRef].every(value => value === undefined || isId(value)) && (dataset.description === undefined || (typeof dataset.description === "string" && dataset.description.length <= 4_096)) &&
      (dataset.evidenceClassDefault === undefined || EVIDENCE_CLASSES.has(dataset.evidenceClassDefault as EvidenceClass)));
}

function isValidRightsPolicy(policy: Record<string, unknown>): policy is Record<string, unknown> & DataRightsPolicy {
  return hasOnlyFields(policy, RIGHTS_FIELDS) && RIGHTS_VERDICT_FIELDS.every(field => RIGHTS_VERDICTS.has(policy[field] as RightsVerdict)) &&
    ["allowed", "ttl_limited", "forbidden", "unknown"].includes(policy.cachePolicy as string) &&
    RIGHTS_BOOLEAN_FIELDS.every(field => typeof policy[field] === "boolean") && isId(policy.id) && isId(policy.revision) &&
    (policy.cacheTtlSeconds === undefined || (Number.isSafeInteger(policy.cacheTtlSeconds) && (policy.cacheTtlSeconds as number) > 0 && (policy.cacheTtlSeconds as number) <= 31_536_000)) &&
    (policy.cachePolicy !== "ttl_limited" || policy.cacheTtlSeconds !== undefined) && (policy.cachePolicy === "ttl_limited" || policy.cacheTtlSeconds === undefined) &&
    [policy.licenseId, policy.retentionPolicyRef, policy.attributionTextRef, policy.termsUrlRef, policy.reviewerRef].every(value => value === undefined || isId(value)) &&
    [policy.geographicRestrictions, policy.purposeRestrictions, policy.audienceRestrictions, policy.residencyRestrictions].every(isRestrictionList) &&
    (policy.contractualExpiryAt === undefined || isInstant(policy.contractualExpiryAt)) && (policy.reviewedAt === undefined || isInstant(policy.reviewedAt));
}

/** Pure catalog resolver. It grants no network/fetch or credential authority. */
export function resolveRegisteredSource(registry: RegistrySnapshot, input: ResolveRegisteredSourceInput) {
  if (!isValidRegistry(registry) || !isPlainRecord(input) || (input.now !== undefined && (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime())))) return reject("REGISTRY_REFERENCE_NOT_FOUND");
  if (!registry.rights.every(policy => isValidRightsPolicy(policy))) return reject("RIGHTS_UNVERIFIED");
  if ((input.authorizationScope !== "PUBLIC" && input.authorizationScope !== "TENANT") ||
    (input.authorizationScope === "TENANT" && !isId(input.tenantId)) ||
    (input.authorizationScope === "PUBLIC" && input.tenantId !== undefined)) return reject("SOURCE_SCOPE_FORBIDDEN");
  if (typeof input.commercialUse !== "boolean" ||
    (input.redistributionRequired !== undefined && typeof input.redistributionRequired !== "boolean")) return reject("RIGHTS_UNVERIFIED");
  if (![input.sourceId, input.datasetId, input.purpose, input.audience].every(isId)) return reject("REGISTRY_REFERENCE_NOT_FOUND");
  if (input.authorizedSourceIds !== undefined) {
    if (!Array.isArray(input.authorizedSourceIds) || input.authorizedSourceIds.length > MAX_REGISTRY_ENTRIES) return reject("SOURCE_ACCESS_NOT_AUTHORIZED");
    const granted = new Set<string>();
    for (let index = 0; index < input.authorizedSourceIds.length; index += 1) {
      const sourceId: unknown = input.authorizedSourceIds[index];
      if (!Object.prototype.hasOwnProperty.call(input.authorizedSourceIds, index) || !isId(sourceId) || granted.has(sourceId)) return reject("SOURCE_ACCESS_NOT_AUTHORIZED");
      granted.add(sourceId);
    }
  }
  const source = registry.sources.find(item => item.id === input.sourceId);
  if (!source) return reject("REGISTRY_REFERENCE_NOT_FOUND");
  if (!isId(source.id) || !isId(source.providerId) || !isId(source.rightsPolicyRef) || !isId(source.adapterRef) || !isId(source.sourceContractRef) || !isId(source.qualityProfileRef) ||
    typeof source.name !== "string" || !source.name.trim() || source.name.length > 256 || !SOURCE_OWNERS.has(source.ownerType) ||
    !SOURCE_TYPES.has(source.sourceType) || !SOURCE_VISIBILITIES.has(source.visibility) || !SOURCE_STATUSES.has(source.status) ||
    (source.ownerId !== undefined && !isId(source.ownerId)) || (source.credentialRef !== undefined && !isId(source.credentialRef))) return reject("REGISTRY_REFERENCE_NOT_FOUND");
  if (source.status !== "active") return reject("SOURCE_UNAVAILABLE");
  if (!source.geographyCoverageRef || !source.temporalCoverageRef || !source.refreshPolicyRef || !source.executionPlacementPolicyRef) return reject("SOURCE_ACTIVATION_INCOMPLETE");
  if (input.commercialUse && !source.pricingPolicyRef) return reject("SOURCE_ACTIVATION_INCOMPLETE");
  if (source.ownerType === "tenant" && source.ownerId !== input.tenantId) return reject("SOURCE_SCOPE_FORBIDDEN");
  if (input.authorizationScope === "PUBLIC" && source.visibility !== "platform" && source.visibility !== "marketplace") return reject("SOURCE_SCOPE_FORBIDDEN");
  if (input.authorizationScope === "TENANT" && source.visibility !== "platform" && source.visibility !== "marketplace") {
    const ownedPrivateTenantSource = source.visibility === "private" && source.ownerType === "tenant" && source.ownerId === input.tenantId;
    const explicitlyGranted = input.authorizedSourceIds?.includes(source.id) === true;
    if (!ownedPrivateTenantSource && !explicitlyGranted) return reject("SOURCE_ACCESS_NOT_AUTHORIZED");
  }

  const provider = registry.providers.find(item => item.id === source.providerId);
  if (!provider) return reject("REGISTRY_REFERENCE_NOT_FOUND");
  if (!isId(provider.id) || typeof provider.name !== "string" || !provider.name.trim() || provider.name.length > 256 ||
    !PROVIDER_OWNERS.has(provider.ownerType) || !PROVIDER_STATUSES.has(provider.status) ||
    (provider.authorityClass !== undefined && !isId(provider.authorityClass)) || (provider.homepageRef !== undefined && !isId(provider.homepageRef)) ||
    (provider.contactRef !== undefined && !isId(provider.contactRef))) return reject("REGISTRY_REFERENCE_NOT_FOUND");
  if (provider.status !== "active") return reject("PROVIDER_UNAVAILABLE");
  const dataset = registry.datasets.find(item => item.id === input.datasetId);
  if (!dataset) return reject("REGISTRY_REFERENCE_NOT_FOUND");
  if (!isId(dataset.id) || !isId(dataset.schemaRef) || typeof dataset.name !== "string" || !dataset.name.trim() || dataset.name.length > 256 ||
    !DATASET_STATUSES.has(dataset.status) || !DATASET_UPDATE_MODES.has(dataset.updateMode) || !DATASET_INDEX_POLICIES.has(dataset.vectorIndexPolicy) ||
    !isIdList(dataset.semanticCapabilities, 256)) return reject("REGISTRY_REFERENCE_NOT_FOUND");
  if (dataset.sourceId !== source.id) return reject("DATASET_SOURCE_MISMATCH");
  if (dataset.status !== "active") return reject("DATASET_UNAVAILABLE");
  const rights = registry.rights.find(item => item.id === source.rightsPolicyRef);
  if (!rights) return reject("RIGHTS_UNVERIFIED");
  if (!isId(rights.id) || !isValidRightsPolicy(rights)) return reject("RIGHTS_UNVERIFIED");
  if (!rights.retentionPolicyRef || !rights.reviewedAt || !rights.reviewerRef || (rights.attributionRequired && !rights.attributionTextRef) || !rights.purposeRestrictions?.length) return reject("SOURCE_ACTIVATION_INCOMPLETE");
  if (rights.commercialUse === "unknown" || (input.redistributionRequired && rights.redistribution === "unknown")) return reject("RIGHTS_UNVERIFIED");
  if (rights.contractualExpiryAt && !input.now) return reject("RIGHTS_UNVERIFIED");
  if (rights.contractualExpiryAt && Date.parse(rights.contractualExpiryAt) <= input.now!.getTime()) return reject("RIGHTS_EXPIRED");
  if (rights.commercialUse === "forbidden" || (input.commercialUse && rights.commercialUse !== "allowed")) return reject("RIGHTS_FORBIDDEN");
  if (input.redistributionRequired && rights.redistribution !== "allowed") return reject(rights.redistribution === "unknown" ? "RIGHTS_UNVERIFIED" : "RIGHTS_FORBIDDEN");
  if (rights.purposeRestrictions?.length && !rights.purposeRestrictions.includes(input.purpose)) return reject("PURPOSE_FORBIDDEN");
  if (rights.audienceRestrictions?.length && !rights.audienceRestrictions.includes(input.audience)) return reject("AUDIENCE_FORBIDDEN");
  if (rights.geographicRestrictions?.length && (!input.geography || !rights.geographicRestrictions.includes(input.geography))) return reject("GEOGRAPHY_FORBIDDEN");
  if (rights.residencyRestrictions?.length && (!input.residency || !rights.residencyRestrictions.includes(input.residency))) return reject("RESIDENCY_FORBIDDEN");

  return {
    ok: true as const,
    value: {
      providerId: provider.id,
      sourceId: source.id,
      datasetId: dataset.id,
      rightsPolicyRef: rights.id,
      rightsRevision: rights.revision,
      licenseId: rights.licenseId,
      adapterRef: source.adapterRef,
      sourceContractRef: source.sourceContractRef,
      qualityProfileRef: source.qualityProfileRef,
      geographyCoverageRef: source.geographyCoverageRef,
      temporalCoverageRef: source.temporalCoverageRef,
      datasetGeographyCoverageRef: dataset.geographyCoverageRef,
      datasetTemporalCoverageRef: dataset.temporalCoverageRef,
      semanticMappingRef: dataset.semanticMappingRef,
      evidenceClassDefault: dataset.evidenceClassDefault,
      refreshPolicyRef: source.refreshPolicyRef,
      pricingPolicyRef: source.pricingPolicyRef,
      executionPlacementPolicyRef: source.executionPlacementPolicyRef,
      vectorIndexPolicy: dataset.vectorIndexPolicy,
      attributionRequired: rights.attributionRequired,
      attributionTextRef: rights.attributionTextRef,
      termsUrlRef: rights.termsUrlRef,
      reviewedAt: rights.reviewedAt,
      reviewerRef: rights.reviewerRef,
      cachePolicy: rights.cachePolicy,
      cacheTtlSeconds: rights.cacheTtlSeconds,
      retentionPolicyRef: rights.retentionPolicyRef,
      redistribution: rights.redistribution,
      derivedData: rights.derivedData,
      resultExport: rights.resultExport,
      rawExport: rights.rawExport,
      modelTrainingUse: rights.modelTrainingUse,
      crossTenantLearningUse: rights.crossTenantLearningUse,
      sublicensing: rights.sublicensing,
      contractualExpiryAt: rights.contractualExpiryAt,
      geographicRestrictions: rights.geographicRestrictions,
      purposeRestrictions: rights.purposeRestrictions,
      audienceRestrictions: rights.audienceRestrictions,
      residencyRestrictions: rights.residencyRestrictions,
    },
  };
}
