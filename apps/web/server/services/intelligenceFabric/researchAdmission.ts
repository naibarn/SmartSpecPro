import { parseGeometryContract, type GeoJSONGeometry } from "./geometry";

export type ResearchAdmissionState =
  | "DISCOVERED" | "TRACEABLE" | "RIGHTS_CHECKED" | "SECURITY_CHECKED" | "CORROBORATED"
  | "ANALYSIS_ELIGIBLE" | "CATALOGED" | "PRODUCTION_SOURCE" | "REJECTED" | "EXPIRED";

export type SourceCandidate = {
  readonly sourceCandidateId: string;
  readonly proposedProviderName?: string;
  readonly proposedSourceName: string;
  readonly canonicalUrlOrEndpoint?: string;
  readonly providerIdentityRef?: string;
  readonly apiIdentifier?: string;
  readonly datasetIdentifier?: string;
  readonly schemaFingerprint?: string;
  readonly sourceType?: string;
  readonly likelyCapabilities: readonly string[];
  readonly likelyGeography?: readonly string[];
  readonly likelyTemporalCoverage?: string;
  readonly authenticationHints?: readonly string[];
  readonly rightsStatus: "unchecked" | "pending" | "known";
  readonly discoveredByResearchRunIds: readonly string[];
  readonly existingSourceMatchIds?: readonly string[];
  readonly status: "DISCOVERED" | "PROFILED" | "RIGHTS_PENDING" | "REVIEWED" | "CONNECTOR_READY" | "STAGING" | "ACTIVE" | "REJECTED" | "RETIRED";
};

export type EvidenceCandidate = {
  readonly evidenceCandidateId: string;
  readonly researchRunId: string;
  readonly sourceCandidateId?: string;
  readonly originalSourceRef?: string;
  readonly extractedValueRef?: string;
  readonly semanticType?: string;
  readonly geometry?: GeoJSONGeometry;
  readonly observedAt?: string;
  readonly publishedAt?: string;
  readonly fetchedAt: string;
  readonly evidenceClass: "reference" | "official_record" | "observation" | "derived" | "forecast" | "model_estimate" | "user_asserted" | "crowdsourced" | "official_warning";
  readonly extractionConfidence?: number;
  readonly verificationState: "unverified" | "correlated" | "community_supported" | "disputed" | "organization_verified" | "authority_verified" | "superseded" | "expired" | "unknown";
  readonly lineageRefs: readonly string[];
  readonly admissionState: ResearchAdmissionState;
};

export type DerivedKnowledgeClaim = {
  readonly knowledgeClaimId: string;
  readonly researchRunId: string;
  readonly statement: string;
  readonly parentEvidenceRefs: readonly string[];
  readonly parentClaimRefs?: readonly string[];
  readonly methodRef: string;
  readonly modelOrAgentVersion?: string;
  readonly createdAt: string;
  readonly limitations: readonly string[];
  readonly admissionState: ResearchAdmissionState;
};

export type SourceDependencyEdge = {
  readonly fromEvidenceOrSourceId: string;
  readonly toEvidenceOrSourceId: string;
  readonly relation: "CITES" | "REPUBLISHES" | "SUMMARIZES" | "DERIVES_FROM" | "QUOTES" | "MIRRORS" | "UNKNOWN";
  readonly confidence?: number;
  readonly detectedBy?: string;
};

export type ResearchArtifact = {
  readonly artifactId: string;
  readonly researchRunId: string;
  readonly mediaType: string;
  readonly storageRef: string;
  readonly contentHash: string;
  readonly capturedAt: string;
  readonly sourceRefs: readonly string[];
  readonly extractionMethod?: string;
  readonly agentGenerated: boolean;
  readonly rightsPolicyRef?: string;
  readonly retentionPolicyRef?: string;
  readonly securityScanState: "pending" | "passed" | "failed" | "not_applicable";
};

export type ResearchWatchChangeNotice = {
  readonly contractVersion: "spec266-research-watch-v1";
  readonly changeId: string;
  readonly idempotencyKey: string;
  readonly watchRef: string;
  readonly watchRevision: number;
  readonly consumerKind: "DECISION_ANALYSIS" | "EMERGENCY_PROFILE" | "SKILL" | "OTHER";
  readonly consumerRef: string;
  readonly authorizationScope: "PUBLIC" | "TENANT";
  readonly tenantId?: string;
  readonly researchRunRef: string;
  readonly changedRequirementRefs: readonly string[];
  readonly admittedEvidenceRefs: readonly string[];
  readonly candidateRefs: readonly string[];
  readonly changedAt: string;
};

type AdmissionError = "RESEARCH_CANDIDATE_INVALID" | "RESEARCH_UNKNOWN_FIELD" | "RESEARCH_DEPENDENCY_CYCLE";
type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly code: AdmissionError };
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SECRET_VALUE = /(?:bearer\s+[A-Za-z0-9._~-]{12,}|(?:api[_-]?key|token|password|secret)\s*[:=]\s*\S+)/i;
const STATES = new Set(["DISCOVERED", "TRACEABLE", "RIGHTS_CHECKED", "SECURITY_CHECKED", "CORROBORATED", "ANALYSIS_ELIGIBLE", "CATALOGED", "PRODUCTION_SOURCE", "REJECTED", "EXPIRED"]);
const SOURCE_STATES = new Set(["DISCOVERED", "PROFILED", "RIGHTS_PENDING", "REVIEWED", "CONNECTOR_READY", "STAGING", "ACTIVE", "REJECTED", "RETIRED"]);
const CLASSES = new Set(["reference", "official_record", "observation", "derived", "forecast", "model_estimate", "user_asserted", "crowdsourced", "official_warning"]);
const VERIFICATION = new Set(["unverified", "correlated", "community_supported", "disputed", "organization_verified", "authority_verified", "superseded", "expired", "unknown"]);
const RELATIONS = new Set(["CITES", "REPUBLISHES", "SUMMARIZES", "DERIVES_FROM", "QUOTES", "MIRRORS", "UNKNOWN"]);

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function id(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function instant(value: unknown): value is string { return typeof value === "string" && INSTANT.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
function dense(value: unknown, max: number): value is unknown[] {
  if (!Array.isArray(value) || value.length > max) return false;
  for (let i = 0; i < value.length; i++) if (!Object.prototype.hasOwnProperty.call(value, i)) return false;
  return true;
}
function strings(value: unknown, max: number, unique = true): value is string[] {
  if (!dense(value, max) || value.some(item => !id(item))) return false;
  return !unique || new Set(value).size === value.length;
}
function fields(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length <= allowed.length && keys.every(key => allowed.includes(key));
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function canonicalEndpoint(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    if (url.username || url.password || [...url.searchParams.keys()].some(key => /^(?:key|api[_-]?key|token|auth|authorization|password|secret|signature|credential)$/i.test(key))) return undefined;
    url.hash = "";
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch { return undefined; }
}
function parseCandidateGeometry(value: unknown): GeoJSONGeometry | undefined {
  const result = parseGeometryContract({
    contractVersion: "spec266-geometry-v1", geometryId: "candidate.geometry", geometryVersion: "candidate-v1",
    sourceGeometryId: "candidate.source", crs: "OGC:CRS84", precisionClass: "unknown", geometry: value,
  });
  return result.ok ? result.value.geometry : undefined;
}

const SOURCE_FIELDS = ["sourceCandidateId", "proposedProviderName", "proposedSourceName", "canonicalUrlOrEndpoint", "providerIdentityRef", "apiIdentifier", "datasetIdentifier", "schemaFingerprint", "sourceType", "likelyCapabilities", "likelyGeography", "likelyTemporalCoverage", "authenticationHints", "rightsStatus", "discoveredByResearchRunIds", "existingSourceMatchIds", "status"];
export function validateSourceCandidate(input: unknown): Parsed<SourceCandidate> {
  if (!record(input)) return { ok: false, code: "RESEARCH_CANDIDATE_INVALID" };
  if (!fields(input, SOURCE_FIELDS)) return { ok: false, code: "RESEARCH_UNKNOWN_FIELD" };
  if (!id(input.sourceCandidateId) || typeof input.proposedSourceName !== "string" || !input.proposedSourceName.trim() || input.proposedSourceName.length > 256 ||
    (input.proposedProviderName !== undefined && (typeof input.proposedProviderName !== "string" || input.proposedProviderName.length > 256)) ||
    (input.canonicalUrlOrEndpoint !== undefined && (typeof input.canonicalUrlOrEndpoint !== "string" || input.canonicalUrlOrEndpoint.length > 2_048 || !canonicalEndpoint(input.canonicalUrlOrEndpoint))) ||
    [input.providerIdentityRef, input.schemaFingerprint].some(value => value !== undefined && !id(value)) ||
    [input.apiIdentifier, input.datasetIdentifier].some(value => value !== undefined && (typeof value !== "string" || !value.trim() || value.length > 256)) ||
    (input.sourceType !== undefined && !id(input.sourceType)) || !strings(input.likelyCapabilities, 128) ||
    (input.likelyGeography !== undefined && !strings(input.likelyGeography, 128)) ||
    (input.likelyTemporalCoverage !== undefined && (typeof input.likelyTemporalCoverage !== "string" || input.likelyTemporalCoverage.length > 512)) ||
    (input.authenticationHints !== undefined && (!dense(input.authenticationHints, 32) || input.authenticationHints.some(v => typeof v !== "string" || v.length > 128 || SECRET_VALUE.test(v)))) ||
    !["unchecked", "pending", "known"].includes(input.rightsStatus as string) || !strings(input.discoveredByResearchRunIds, 128) ||
    (input.existingSourceMatchIds !== undefined && !strings(input.existingSourceMatchIds, 128)) || !SOURCE_STATES.has(input.status as string)) return { ok: false, code: "RESEARCH_CANDIDATE_INVALID" };
  const value = { ...input, likelyCapabilities: [...input.likelyCapabilities as string[]], discoveredByResearchRunIds: [...input.discoveredByResearchRunIds as string[]], ...(input.likelyGeography === undefined ? {} : { likelyGeography: [...input.likelyGeography as string[]] }), ...(input.authenticationHints === undefined ? {} : { authenticationHints: [...input.authenticationHints as string[]] }), ...(input.existingSourceMatchIds === undefined ? {} : { existingSourceMatchIds: [...input.existingSourceMatchIds as string[]] }) } as SourceCandidate;
  return { ok: true, value: freeze(value) };
}

export function recommendSourceCandidateMatch(leftInput: unknown, rightInput: unknown) {
  const left = validateSourceCandidate(leftInput), right = validateSourceCandidate(rightInput);
  if (!left.ok || !right.ok) return { matchRecommended: false as const, reasons: ["CANDIDATE_INVALID"], discoveryRunIds: [] as string[], candidateIds: [] as string[] };
  const a = left.value, b = right.value;
  const reasons: string[] = [];
  const urlA = a.canonicalUrlOrEndpoint ? canonicalEndpoint(a.canonicalUrlOrEndpoint) : undefined;
  const urlB = b.canonicalUrlOrEndpoint ? canonicalEndpoint(b.canonicalUrlOrEndpoint) : undefined;
  if (urlA && urlA === urlB) reasons.push("CANONICAL_ENDPOINT_MATCH");
  if (!reasons.length && a.providerIdentityRef && a.providerIdentityRef === b.providerIdentityRef && a.datasetIdentifier && a.datasetIdentifier === b.datasetIdentifier) reasons.push("PROVIDER_AND_DATASET_IDENTITY_MATCH");
  if (!reasons.length && a.providerIdentityRef && a.providerIdentityRef === b.providerIdentityRef && a.apiIdentifier && a.apiIdentifier === b.apiIdentifier && a.schemaFingerprint && a.schemaFingerprint === b.schemaFingerprint) reasons.push("PROVIDER_API_AND_SCHEMA_MATCH");
  const nameA = a.proposedProviderName?.trim().toLocaleLowerCase();
  const nameB = b.proposedProviderName?.trim().toLocaleLowerCase();
  if (!reasons.length && nameA && nameA === nameB && a.sourceType && a.sourceType === b.sourceType && a.proposedSourceName.trim().toLowerCase() === b.proposedSourceName.trim().toLowerCase()) reasons.push("PROVIDER_AND_SOURCE_PROFILE_MATCH");
  return {
    matchRecommended: reasons.length > 0,
    reasons,
    candidateIds: [...new Set([a.sourceCandidateId, b.sourceCandidateId])].sort(),
    discoveryRunIds: [...new Set([...a.discoveredByResearchRunIds, ...b.discoveredByResearchRunIds])].sort(),
  } as const;
}

const EVIDENCE_FIELDS = ["evidenceCandidateId", "researchRunId", "sourceCandidateId", "originalSourceRef", "extractedValueRef", "semanticType", "geometry", "observedAt", "publishedAt", "fetchedAt", "evidenceClass", "extractionConfidence", "verificationState", "lineageRefs", "admissionState"];
export function validateEvidenceCandidate(input: unknown): Parsed<EvidenceCandidate> {
  if (!record(input)) return { ok: false, code: "RESEARCH_CANDIDATE_INVALID" };
  if (!fields(input, EVIDENCE_FIELDS)) return { ok: false, code: "RESEARCH_UNKNOWN_FIELD" };
  if (!id(input.evidenceCandidateId) || !id(input.researchRunId) || (input.sourceCandidateId !== undefined && !id(input.sourceCandidateId)) ||
    (input.originalSourceRef !== undefined && !id(input.originalSourceRef)) || (input.extractedValueRef !== undefined && !id(input.extractedValueRef)) ||
    (input.semanticType !== undefined && !id(input.semanticType)) || (input.geometry !== undefined && !parseCandidateGeometry(input.geometry)) ||
    (input.observedAt !== undefined && !instant(input.observedAt)) || (input.publishedAt !== undefined && !instant(input.publishedAt)) || !instant(input.fetchedAt) ||
    !CLASSES.has(input.evidenceClass as string) || (input.extractionConfidence !== undefined && (typeof input.extractionConfidence !== "number" || !Number.isFinite(input.extractionConfidence) || input.extractionConfidence < 0 || input.extractionConfidence > 1)) ||
    !VERIFICATION.has(input.verificationState as string) || !strings(input.lineageRefs, 128) || input.lineageRefs.includes(input.evidenceCandidateId) || !STATES.has(input.admissionState as string)) return { ok: false, code: "RESEARCH_CANDIDATE_INVALID" };
  const derivedClass = ["derived", "forecast", "model_estimate"].includes(input.evidenceClass as string);
  if ((input.lineageRefs.length && !derivedClass) || (derivedClass && !input.lineageRefs.length)) return { ok: false, code: "RESEARCH_CANDIDATE_INVALID" };
  return { ok: true, value: freeze({ ...input, lineageRefs: [...input.lineageRefs as string[]], ...(input.geometry === undefined ? {} : { geometry: parseCandidateGeometry(input.geometry)! }) }) as EvidenceCandidate };
}

const CLAIM_FIELDS = ["knowledgeClaimId", "researchRunId", "statement", "parentEvidenceRefs", "parentClaimRefs", "methodRef", "modelOrAgentVersion", "createdAt", "limitations", "admissionState"];
export function validateDerivedKnowledgeClaim(input: unknown): Parsed<DerivedKnowledgeClaim> {
  if (!record(input)) return { ok: false, code: "RESEARCH_CANDIDATE_INVALID" };
  if (!fields(input, CLAIM_FIELDS)) return { ok: false, code: "RESEARCH_UNKNOWN_FIELD" };
  if (!id(input.knowledgeClaimId) || !id(input.researchRunId) || typeof input.statement !== "string" || !input.statement.trim() || input.statement.length > 8_192 ||
    !strings(input.parentEvidenceRefs, 128) || !input.parentEvidenceRefs.length || (input.parentClaimRefs !== undefined && !strings(input.parentClaimRefs, 128)) ||
    !id(input.methodRef) || (input.modelOrAgentVersion !== undefined && !id(input.modelOrAgentVersion)) || !instant(input.createdAt) ||
    !dense(input.limitations, 64) || input.limitations.some(v => typeof v !== "string" || !v.trim() || v.length > 1_024) || !STATES.has(input.admissionState as string)) return { ok: false, code: "RESEARCH_CANDIDATE_INVALID" };
  return { ok: true, value: freeze({ ...input, parentEvidenceRefs: [...input.parentEvidenceRefs as string[]], ...(input.parentClaimRefs === undefined ? {} : { parentClaimRefs: [...input.parentClaimRefs as string[]] }), limitations: [...input.limitations as string[]] }) as DerivedKnowledgeClaim };
}

const ARTIFACT_FIELDS = ["artifactId", "researchRunId", "mediaType", "storageRef", "contentHash", "capturedAt", "sourceRefs", "extractionMethod", "agentGenerated", "rightsPolicyRef", "retentionPolicyRef", "securityScanState"];
export function validateResearchArtifact(input: unknown): Parsed<ResearchArtifact> {
  if (!record(input)) return { ok: false, code: "RESEARCH_CANDIDATE_INVALID" };
  if (!fields(input, ARTIFACT_FIELDS)) return { ok: false, code: "RESEARCH_UNKNOWN_FIELD" };
  if (!id(input.artifactId) || !id(input.researchRunId) || typeof input.mediaType !== "string" || input.mediaType.length > 127 || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(input.mediaType) ||
    !id(input.storageRef) || typeof input.contentHash !== "string" || !/^sha256:[a-f0-9]{64}$/i.test(input.contentHash) || !instant(input.capturedAt) || !strings(input.sourceRefs, 256) ||
    (input.extractionMethod !== undefined && !id(input.extractionMethod)) || typeof input.agentGenerated !== "boolean" ||
    (input.rightsPolicyRef !== undefined && !id(input.rightsPolicyRef)) || (input.retentionPolicyRef !== undefined && !id(input.retentionPolicyRef)) ||
    !["pending", "passed", "failed", "not_applicable"].includes(input.securityScanState as string)) return { ok: false, code: "RESEARCH_CANDIDATE_INVALID" };
  return { ok: true, value: freeze({ ...input, contentHash: input.contentHash.toLowerCase(), sourceRefs: [...input.sourceRefs as string[]] }) as ResearchArtifact };
}

/** Metadata-only status hint; downstream use still requires loading a trusted server-owned scan receipt. */
export function isResearchArtifactScanPassed(artifact: unknown): boolean {
  const parsed = validateResearchArtifact(artifact);
  return parsed.ok && parsed.value.securityScanState === "passed";
}

const WATCH_NOTICE_FIELDS = ["contractVersion", "changeId", "idempotencyKey", "watchRef", "watchRevision", "consumerKind", "consumerRef", "authorizationScope", "tenantId", "researchRunRef", "changedRequirementRefs", "admittedEvidenceRefs", "candidateRefs", "changedAt"];
export function validateResearchWatchChangeNotice(input: unknown): Parsed<ResearchWatchChangeNotice> {
  if (!record(input)) return { ok: false, code: "RESEARCH_CANDIDATE_INVALID" };
  if (!fields(input, WATCH_NOTICE_FIELDS)) return { ok: false, code: "RESEARCH_UNKNOWN_FIELD" };
  const consumers = new Set(["DECISION_ANALYSIS", "EMERGENCY_PROFILE", "SKILL", "OTHER"]);
  if (input.contractVersion !== "spec266-research-watch-v1" || !id(input.changeId) || !id(input.idempotencyKey) || !id(input.watchRef) ||
    !Number.isSafeInteger(input.watchRevision) || (input.watchRevision as number) < 1 || (input.watchRevision as number) > 1_000_000 ||
    !consumers.has(input.consumerKind as string) || !id(input.consumerRef) ||
    (input.authorizationScope !== "PUBLIC" && input.authorizationScope !== "TENANT") ||
    (input.authorizationScope === "TENANT" && !id(input.tenantId)) || (input.authorizationScope === "PUBLIC" && input.tenantId !== undefined) ||
    !id(input.researchRunRef) || !strings(input.changedRequirementRefs, 128) || !strings(input.admittedEvidenceRefs, 256) || !strings(input.candidateRefs, 256) || !instant(input.changedAt)) {
    return { ok: false, code: "RESEARCH_CANDIDATE_INVALID" };
  }
  return { ok: true, value: freeze({ ...input, changedRequirementRefs: [...input.changedRequirementRefs as string[]], admittedEvidenceRefs: [...input.admittedEvidenceRefs as string[]], candidateRefs: [...input.candidateRefs as string[]] }) as ResearchWatchChangeNotice };
}

const EDGE_FIELDS = ["fromEvidenceOrSourceId", "toEvidenceOrSourceId", "relation", "confidence", "detectedBy"];
function parseEdge(input: unknown): Parsed<SourceDependencyEdge> {
  if (!record(input)) return { ok: false, code: "RESEARCH_CANDIDATE_INVALID" };
  if (!fields(input, EDGE_FIELDS)) return { ok: false, code: "RESEARCH_UNKNOWN_FIELD" };
  if (!id(input.fromEvidenceOrSourceId) || !id(input.toEvidenceOrSourceId) || input.fromEvidenceOrSourceId === input.toEvidenceOrSourceId || !RELATIONS.has(input.relation as string) ||
    (input.confidence !== undefined && (typeof input.confidence !== "number" || !Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)) || (input.detectedBy !== undefined && !id(input.detectedBy))) return { ok: false, code: "RESEARCH_CANDIDATE_INVALID" };
  return { ok: true, value: { ...input } as SourceDependencyEdge };
}

export function analyzeCorroboration(input: { readonly evidence: readonly unknown[]; readonly edges: readonly unknown[] }) {
  if (!record(input) || !dense(input.evidence, 512) || !dense(input.edges, 2_048)) return { ok: false as const, code: "RESEARCH_CANDIDATE_INVALID" as const };
  const evidence = input.evidence.map(validateEvidenceCandidate);
  const edges = input.edges.map(parseEdge);
  if (evidence.some(item => !item.ok) || edges.some(item => !item.ok)) return { ok: false as const, code: "RESEARCH_CANDIDATE_INVALID" as const };
  const items = evidence.map(item => (item as { ok: true; value: EvidenceCandidate }).value);
  const links = edges.map(item => (item as { ok: true; value: SourceDependencyEdge }).value);
  const known = new Set(items.flatMap(item => [item.evidenceCandidateId, item.sourceCandidateId, item.originalSourceRef].filter((v): v is string => !!v)));
  if (links.some(edge => !known.has(edge.fromEvidenceOrSourceId) || !known.has(edge.toEvidenceOrSourceId))) return { ok: false as const, code: "RESEARCH_CANDIDATE_INVALID" as const };
  const adjacency = new Map<string, string[]>();
  for (const edge of links) adjacency.set(edge.fromEvidenceOrSourceId, [...(adjacency.get(edge.fromEvidenceOrSourceId) ?? []), edge.toEvidenceOrSourceId]);
  const state = new Map<string, 0 | 1 | 2>();
  for (const start of known) {
    if (state.get(start) === 2) continue;
    const stack: Array<{ id: string; next: number }> = [{ id: start, next: 0 }]; state.set(start, 1);
    while (stack.length) {
      const frame = stack[stack.length - 1]!; const next = adjacency.get(frame.id) ?? [];
      if (frame.next >= next.length) { state.set(frame.id, 2); stack.pop(); continue; }
      const target = next[frame.next++]!;
      if (state.get(target) === 1) return { ok: false as const, code: "RESEARCH_DEPENDENCY_CYCLE" as const };
      if (state.get(target) !== 2) { state.set(target, 1); stack.push({ id: target, next: 0 }); }
    }
  }
  const roots = new Set<string>();
  const reasons = new Set<string>();
  const evidenceById = new Map(items.map(item => [item.evidenceCandidateId, item]));
  for (const item of items) {
    const start = item.sourceCandidateId ?? item.originalSourceRef ?? item.evidenceCandidateId;
    const reached = new Set<string>(); const pending = [item.evidenceCandidateId, ...(adjacency.has(start) ? [start] : [])];
    while (pending.length) {
      const current = pending.pop()!;
      if (reached.has(current)) continue;
      reached.add(current);
      for (const next of adjacency.get(current) ?? []) pending.push(next);
    }
    const terminal = [...reached].filter(node => (adjacency.get(node) ?? []).length === 0);
    const terminalId = terminal.sort()[0] ?? start;
    const terminalEvidence = evidenceById.get(terminalId);
    roots.add(terminalEvidence?.originalSourceRef ?? terminalEvidence?.sourceCandidateId ?? terminalId);
    if (reached.size > 1 && links.some(edge => reached.has(edge.fromEvidenceOrSourceId))) reasons.add("DEPENDENT_REPUBLICATION_OR_DERIVATION_COLLAPSED");
    if (links.some(edge => reached.has(edge.fromEvidenceOrSourceId) && edge.relation === "UNKNOWN")) reasons.add("UNKNOWN_DEPENDENCY_TREATED_AS_NOT_INDEPENDENT");
  }
  if (roots.size === items.length) reasons.add("DISTINCT_SOURCE_ROOTS_REPORTED_WITHOUT_AUTHORITY_INFERENCE");
  return { ok: true as const, independentRootCount: roots.size, roots: [...roots].sort(), reasons: [...reasons].sort() };
}
