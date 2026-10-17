import { randomUUID } from "node:crypto";

import {
  resolveLibraryVectorIndexName,
  searchLibraryItems,
  type LibraryItemStatus,
  type LibraryActor,
  type LibrarySearchFilters,
  type LibrarySearchResultV1,
} from "./libraryService";
import {
  getEffectiveVectorProviderConfig,
  resolveVectorProvider,
} from "./vectorProvider";

export type RetrievalQueryClassV2 =
  | "EXACT_IDENTIFIER"
  | "DOCUMENT_RAG"
  | "SEMANTIC_ENTITY"
  | "SKILL_DISCOVERY"
  | "CAPABILITY_DISCOVERY"
  | "WORKFLOW_TEMPLATE_DISCOVERY"
  | "SIMILAR_CASE"
  | "HISTORICAL_ENGINEERING_EVIDENCE"
  | "POLICY_EVIDENCE"
  | "HYBRID_SEARCH";

export interface RetrievalEvidenceV2 {
  evidenceId: string;
  sourceType: string;
  sourceId: string;
  itemId?: string | number;
  chunkId?: string;
  sourceRevision?: string | number;
  sourceDigest?: string;
  canonicalRef: {
    kind: string;
    id: string;
    revision?: string | number;
    digest?: string;
  };
  title: string;
  headingPath?: string[];
  text?: string;
  sourceUri?: string;
  citation?: {
    page?: number;
    lineStart?: number;
    lineEnd?: number;
    timeStartMs?: number;
    timeEndMs?: number;
  };
  retrievalProvider:
    | "cloudflare_ai_search"
    | "cloudflare_vectorize"
    | "postgres_exact";
  providerProfileId: string;
  providerProfileVersion?: string;
  retrievalMode: "exact" | "keyword" | "semantic" | "hybrid" | "multi_query";
  scores?: {
    vector?: number;
    keyword?: number;
    fused?: number;
    rerank?: number;
    authority?: number;
    freshness?: number;
  };
  aclScope: string;
  aclVerified: boolean;
  provenanceVerified: boolean;
  freshnessState?: "current" | "stale" | "historical";
  projectId?: string | null;
  language?: string;
  updatedAt?: string;
  tombstoned?: boolean;
  domainEligibility?: "unknown" | "eligible" | "ineligible";
}

export interface RetrievalResponseV2 {
  retrievalTraceId: string;
  plan: {
    requestId: string;
    purpose: string;
    queryClass: RetrievalQueryClassV2;
    sourceClasses: string[];
    evidenceBudget: {
      maxCandidates: number;
      maxEvidence: number;
      maxContextTokens: number;
    };
  };
  providerProfile: {
    provider: string;
    profileId: string;
    version?: string;
  };
  evidence: RetrievalEvidenceV2[];
  evidenceQuality: "sufficient" | "weak" | "conflicting" | "no_evidence";
  degraded: boolean;
  partial: boolean;
  degradationReasons?: string[];
}

export interface RetrievalRequestV2 {
  tenantId: string;
  userId: string;
  projectId?: string | null;
  environment: string;
  requestId: string;
  purpose: string;
  queryClass: RetrievalQueryClassV2;
  query: string;
  sourceClasses: string[];
  requiredVisibility?: string[];
  authorizedAclScopes?: string[];
  languageHints?: string[];
  exactIdentifiers?: string[];
  structuredSelector?: Record<string, unknown>;
  messages?: Array<{ role: string; content: string }>;
  mode?: "auto" | "exact" | "keyword" | "semantic" | "hybrid";
  status?: LibraryItemStatus[];
  freshnessRequirement?: "current" | "historical_allowed" | {
    updatedAfter?: string;
    maxAgeSeconds?: number;
  };
  allowRewrite?: boolean;
  allowMultiQuery?: boolean;
  allowAgentic?: boolean;
  requireCitations?: boolean;
  evidenceBudget: {
    maxCandidates?: number;
    maxEvidence?: number;
    maxContextTokens?: number;
  };
  consumerRef?: {
    specId?: number;
    runId?: string;
    workflowId?: string;
    taskId?: string;
    nodeId?: string;
  };
  traceId?: string;
  filters?: LibrarySearchFilters;
}

type NormalizedRetrievalRequestV2 = Omit<RetrievalRequestV2, "evidenceBudget"> & {
  evidenceBudget: Required<RetrievalRequestV2["evidenceBudget"]>;
};

/** Legacy flat budgets remain accepted until existing Library callers migrate. */
export type RetrieveLibraryEvidenceV2Input = Omit<
  RetrievalRequestV2,
  | "tenantId"
  | "userId"
  | "environment"
  | "requestId"
  | "purpose"
  | "queryClass"
  | "sourceClasses"
  | "evidenceBudget"
> & Partial<Pick<
  RetrievalRequestV2,
  "requestId" | "purpose" | "queryClass" | "sourceClasses" | "evidenceBudget"
>> & {
  maxCandidates?: number;
  maxEvidence?: number;
  maxContextTokens?: number;
}

export class RetrievalAuthorizationError extends Error {
  constructor() {
    super("Retrieval authorization context is invalid");
    this.name = "RetrievalAuthorizationError";
  }
}

const clampInteger = (value: number | undefined, fallback: number, max: number) => {
  const candidate = value ?? fallback;
  if (!Number.isFinite(candidate)) return fallback;
  return Math.max(1, Math.min(Math.trunc(candidate), max));
};

function normalizeRequest(
  input: RetrieveLibraryEvidenceV2Input,
  actor: LibraryActor,
  tenantId: string,
): { request: NormalizedRetrievalRequestV2; retrievalTraceId: string } {
  const retrievalTraceId = randomUUID();
  const maxCandidates = clampInteger(input.evidenceBudget?.maxCandidates ?? input.maxCandidates, 20, 50);
  const maxEvidence = Math.min(
    clampInteger(input.evidenceBudget?.maxEvidence ?? input.maxEvidence, 10, 12),
    maxCandidates,
  );
  const maxContextTokens = clampInteger(input.evidenceBudget?.maxContextTokens ?? input.maxContextTokens, 4_000, 32_000);

  return {
    retrievalTraceId,
    request: {
      ...input,
      tenantId,
      userId: String(actor.userId),
      environment: process.env.NODE_ENV || "unknown",
      requestId: input.requestId?.trim().slice(0, 128) || retrievalTraceId,
      purpose: input.purpose?.trim().slice(0, 128) || "library.search",
      queryClass: input.queryClass ?? "HYBRID_SEARCH",
      sourceClasses: input.sourceClasses ?? ["library_document"],
      projectId: input.projectId !== undefined ? input.projectId : input.filters?.projectId,
      evidenceBudget: { maxCandidates, maxEvidence, maxContextTokens },
    },
  };
}

function getUnsupportedRequestReasons(request: NormalizedRetrievalRequestV2): string[] {
  const reasons: string[] = [];
  if (request.sourceClasses.length !== 1 || request.sourceClasses[0] !== "library_document") {
    reasons.push("UNSUPPORTED_SOURCE_CLASS");
  }
  if (request.structuredSelector || request.messages?.length) {
    reasons.push("UNSUPPORTED_QUERY_SHAPE");
  }
  if (request.exactIdentifiers?.length || request.queryClass === "EXACT_IDENTIFIER") {
    reasons.push("EXACT_IDENTIFIER_LANE_NOT_CERTIFIED");
  }
  if (request.requiredVisibility?.length || request.authorizedAclScopes?.length) {
    reasons.push("CALLER_ACL_SCOPE_NOT_AUTHORIZED");
  }
  if (request.languageHints?.length) {
    reasons.push("LANGUAGE_HINTS_NOT_SUPPORTED_BY_PROVIDER_PROFILE");
  }
  if (request.mode && request.mode !== "auto" && request.mode !== "hybrid") {
    reasons.push("RETRIEVAL_MODE_NOT_SUPPORTED_BY_PROVIDER_PROFILE");
  }
  if (request.freshnessRequirement && request.freshnessRequirement !== "current") {
    reasons.push("FRESHNESS_REQUIREMENT_NOT_SUPPORTED");
  }
  if (request.allowRewrite || request.allowMultiQuery || request.allowAgentic || request.requireCitations) {
    reasons.push("REQUESTED_RETRIEVAL_FEATURE_NOT_CERTIFIED");
  }
  return reasons;
}

function normalizeEvidence(
  result: LibrarySearchResultV1,
  tenantId: string,
  profileId: string | undefined,
): RetrievalEvidenceV2 {
  const id = String(result.item_id);
  return {
    evidenceId: `library:${tenantId}:${id}:${result.updated_at}`,
    sourceType: "library_item",
    sourceId: id,
    itemId: result.item_id,
    sourceRevision: result.updated_at,
    canonicalRef: {
      kind: "library_item",
      id,
      revision: result.updated_at,
    },
    title: result.title,
    retrievalProvider: "cloudflare_vectorize",
    providerProfileId: profileId ?? resolveLibraryVectorIndexName(),
    retrievalMode: "hybrid",
    scores: {
      vector: result.vector_score,
      keyword: result.keyword_score,
      fused: result.combined_score,
    },
    aclScope: `library:${result.access_source}`,
    // Library search rechecks current Library ownership, sharing, group
    // membership and tenant scope before vector scores are materialized.
    aclVerified: true,
    provenanceVerified: true,
    freshnessState: "current",
    updatedAt: result.updated_at,
    tombstoned: false,
    domainEligibility: "unknown",
  };
}

/**
 * The first SAH-RETRIEVAL-2 runtime adapter. Identity and ACL are derived from
 * the authenticated LibraryActor; caller supplied tenant/user/scope values are
 * intentionally absent. Legacy providers remain available through the v1
 * Library route until their Broker-compatible provider profiles are certified.
 */
export async function retrieveLibraryEvidenceV2(
  input: RetrieveLibraryEvidenceV2Input,
  actor: LibraryActor,
): Promise<RetrievalResponseV2> {
  const tenantId = String(actor.tenantId ?? "").trim();
  if (!tenantId || !Number.isInteger(actor.userId) || actor.userId <= 0) {
    throw new RetrievalAuthorizationError();
  }

  const query = input.query.trim();
  if (!query) {
    throw new TypeError("Retrieval query must not be empty");
  }
  if (query.length > 1_000) {
    throw new TypeError("Retrieval query exceeds the 1000 character limit");
  }
  const { request, retrievalTraceId } = normalizeRequest(input, actor, tenantId);
  const maxCandidates = request.evidenceBudget.maxCandidates;
  const maxEvidence = request.evidenceBudget.maxEvidence;
  const maxContextTokens = request.evidenceBudget.maxContextTokens;
  const unsupportedReasons = getUnsupportedRequestReasons(request);
  if (unsupportedReasons.length > 0) {
    return {
      retrievalTraceId,
      plan: {
        requestId: request.requestId,
        purpose: request.purpose,
        queryClass: request.queryClass,
        sourceClasses: request.sourceClasses,
        evidenceBudget: { maxCandidates, maxEvidence, maxContextTokens },
      },
      providerProfile: { provider: "not_queried", profileId: "request_not_supported" },
      evidence: [],
      evidenceQuality: "no_evidence",
      degraded: true,
      partial: false,
      degradationReasons: unsupportedReasons,
    };
  }
  const queryClass = request.queryClass;
  const providerConfig = await getEffectiveVectorProviderConfig({ tenantId });
  const provider = resolveVectorProvider("search", providerConfig).provider;
  const profileId = providerConfig.vectorizeKnowledgeIndexName?.trim()
    || providerConfig.vectorizeIndexName?.trim()
    || resolveLibraryVectorIndexName();

  const plan = {
    requestId: request.requestId,
    purpose: request.purpose,
    queryClass,
    sourceClasses: request.sourceClasses,
    evidenceBudget: { maxCandidates, maxEvidence, maxContextTokens },
  };

  if (provider !== "cloudflare_vectorize") {
    return {
      retrievalTraceId,
      plan,
      providerProfile: { provider, profileId: `legacy:${provider}` },
      evidence: [],
      evidenceQuality: "no_evidence",
      degraded: true,
      partial: false,
      degradationReasons: ["PROVIDER_PROFILE_NOT_CERTIFIED_FOR_RETRIEVAL_BROKER"],
    };
  }

  const results = await searchLibraryItems(
    {
      query,
      limit: maxCandidates,
      offset: 0,
      filters: {
        ...input.filters,
        ...(request.projectId !== undefined ? { projectId: request.projectId } : {}),
        ...(request.status?.length ? { status: request.status } : {}),
      },
      scope: "all",
      includeRetrievalDiagnostics: true,
    },
    actor,
  );
  const diagnostics = results.retrievalDiagnostics;
  if (!diagnostics || diagnostics.provider !== "cloudflare_vectorize") {
    return {
      retrievalTraceId,
      plan,
      providerProfile: {
        provider: diagnostics?.provider ?? "unknown",
        profileId: diagnostics?.profileId ?? `unverified:${provider}`,
      },
      evidence: [],
      evidenceQuality: "no_evidence",
      degraded: true,
      partial: false,
      degradationReasons: ["RETRIEVAL_PROVIDER_FALLBACK_OR_DIAGNOSTICS_UNAVAILABLE"],
    };
  }
  const evidence = results.results
    .slice(0, maxEvidence)
    .map((result) => normalizeEvidence(result, tenantId, diagnostics.profileId));
  const needsHydration = evidence.length > 0;
  const documentRag = queryClass === "DOCUMENT_RAG";

  return {
    retrievalTraceId,
    plan,
    providerProfile: { provider, profileId: diagnostics.profileId ?? profileId },
    evidence,
    // Search candidates are not treated as grounded RAG context until the
    // content hydration and quality-gate phases are connected.
    evidenceQuality: evidence.length === 0 ? "no_evidence" : "weak",
    degraded: needsHydration || documentRag,
    partial: false,
    ...(needsHydration || documentRag
      ? { degradationReasons: ["CONTENT_HYDRATION_AND_QUALITY_GATE_PENDING"] }
      : {}),
  };
}
