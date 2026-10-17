import { randomUUID } from "node:crypto";

import {
  resolveLibraryVectorIndexName,
  searchLibraryItems,
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

export interface RetrieveLibraryEvidenceV2Input {
  query: string;
  queryClass?: RetrievalQueryClassV2;
  filters?: LibrarySearchFilters;
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

const clampInteger = (value: number | undefined, fallback: number, max: number) =>
  Math.max(1, Math.min(Math.trunc(value ?? fallback), max));

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
  const queryClass = input.queryClass ?? "HYBRID_SEARCH";
  const maxCandidates = clampInteger(input.maxCandidates, 20, 50);
  const maxEvidence = Math.min(
    clampInteger(input.maxEvidence, 10, 12),
    maxCandidates,
  );
  const maxContextTokens = clampInteger(input.maxContextTokens, 4_000, 32_000);
  const traceId = randomUUID();
  const providerConfig = await getEffectiveVectorProviderConfig({ tenantId });
  const provider = resolveVectorProvider("search", providerConfig).provider;
  const profileId = providerConfig.vectorizeKnowledgeIndexName?.trim()
    || providerConfig.vectorizeIndexName?.trim()
    || resolveLibraryVectorIndexName();

  const plan = {
    queryClass,
    sourceClasses: ["library_item"],
    evidenceBudget: { maxCandidates, maxEvidence, maxContextTokens },
  };

  if (provider !== "cloudflare_vectorize") {
    return {
      retrievalTraceId: traceId,
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
      filters: input.filters,
      scope: "all",
      includeRetrievalDiagnostics: true,
    },
    actor,
  );
  const diagnostics = results.retrievalDiagnostics;
  if (!diagnostics || diagnostics.provider !== "cloudflare_vectorize") {
    return {
      retrievalTraceId: traceId,
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
    retrievalTraceId: traceId,
    plan,
    providerProfile: { provider, profileId },
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
