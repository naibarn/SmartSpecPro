import { randomUUID } from "node:crypto";

import {
  resolveLibraryVectorIndexName,
  getLibraryMarkdownContent,
  searchLibraryItems,
  type LibraryItemStatus,
  type LibraryActor,
  type LibrarySearchFilters,
  type LibrarySearchResultV1,
} from "./libraryService";
import { estimateTokens } from "../utils/tokenEstimator";
import {
  buildLibraryCitationAnchorUri,
  createLibraryCitationAnchor,
  normalizeCanonicalMarkdown,
  sha256,
} from "./libraryCitationAnchor";
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
    revision?: string;
    digest?: string;
    quoteHash?: string;
    anchorUri?: string;
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
  content: string,
  sourceRevision: string,
  sourceDigest: string,
  canonicalSourceUri?: string | null,
  query?: string,
): RetrievalEvidenceV2 {
  const id = String(result.item_id);
  const sourceUri = normalizeCitationSourceUri(canonicalSourceUri);
  const anchor = query
    ? createLibraryCitationAnchor({
        documentId: result.item_id,
        query,
        markdown: content,
        digest: sourceDigest,
      })
    : null;
  return {
    evidenceId: `library:${tenantId}:${id}:${sourceRevision}:${sourceDigest.slice(0, 12)}`,
    sourceType: "library_item",
    sourceId: id,
    itemId: result.item_id,
    sourceRevision,
    sourceDigest,
    canonicalRef: {
      kind: "library_item",
      id,
      revision: sourceRevision,
      digest: sourceDigest,
    },
    title: result.title,
    text: content,
    ...(sourceUri ? { sourceUri } : {}),
    ...(anchor ? {
      citation: {
        lineStart: anchor.lineStart,
        lineEnd: anchor.lineEnd,
        revision: anchor.revision,
        digest: anchor.digest,
        quoteHash: anchor.quoteHash,
        anchorUri: buildLibraryCitationAnchorUri(anchor),
      },
    } : {}),
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
    updatedAt: sourceRevision,
    tombstoned: false,
    domainEligibility: "unknown",
  };
}

/** Only expose stable HTTP(S) source URLs as citation targets. */
function normalizeCitationSourceUri(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const uri = new URL(value);
    if (
      (uri.protocol !== "https:" && uri.protocol !== "http:")
      || uri.username
      || uri.password
      // Query strings often contain signed credentials or transient state and
      // cannot be safely treated as stable citation identity.
      || uri.search
    ) {
      return undefined;
    }
    uri.hash = "";
    return uri.toString();
  } catch {
    return undefined;
  }
}

function truncateTextToTokenBudget(text: string, budget: number): string {
  if (estimateTokens(text) <= budget) return text;
  const characters = Array.from(text);
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const midpoint = Math.ceil((low + high) / 2);
    const prefix = characters.slice(0, midpoint).join("");
    const candidate = midpoint < characters.length ? `${prefix}…` : prefix;
    if (estimateTokens(candidate) <= budget) low = midpoint;
    else high = midpoint - 1;
  }
  if (low === 0) return "";
  const prefix = characters.slice(0, low).join("");
  const candidate = low < characters.length ? `${prefix}…` : prefix;
  return estimateTokens(candidate) <= budget ? candidate : "";
}

async function hydrateLibraryEvidence(params: {
  results: LibrarySearchResultV1[];
  actor: LibraryActor;
  tenantId: string;
  profileId: string | undefined;
  maxEvidence: number;
  maxContextTokens: number;
  query: string;
}): Promise<{
  evidence: RetrievalEvidenceV2[];
  partial: boolean;
  degradationReasons: string[];
}> {
  const evidence: RetrievalEvidenceV2[] = [];
  const degradationReasons = new Set<string>();
  let remainingTokens = params.maxContextTokens;
  let truncated = false;

  for (const result of params.results.slice(0, params.maxEvidence)) {
    // Do not hydrate more canonical documents once the request budget is spent.
    // This avoids database reads that cannot contribute evidence to the response.
    if (remainingTokens <= 0) {
      truncated = true;
      degradationReasons.add("CONTEXT_BUDGET_EXHAUSTED");
      break;
    }
    let content: Awaited<ReturnType<typeof getLibraryMarkdownContent>>;
    try {
      content = await getLibraryMarkdownContent(result.item_id, params.actor);
    } catch {
      // Canonical ACL/source revalidation must fail closed. Keep other evidence
      // only when its own canonical read was independently verified.
      degradationReasons.add("CANONICAL_SOURCE_REVALIDATION_FAILED");
      continue;
    }
    if (!content) {
      degradationReasons.add("ACL_OR_SOURCE_REVOKED_AFTER_SEARCH");
      continue;
    }
    const indexedRevision = Date.parse(result.updated_at);
    const canonicalRevision = Date.parse(content.updated_at);
    if (
      !Number.isFinite(indexedRevision)
      || !Number.isFinite(canonicalRevision)
      || indexedRevision !== canonicalRevision
    ) {
      degradationReasons.add("STALE_EVIDENCE_DROPPED");
      continue;
    }
    if (!content.content.trim()) {
      degradationReasons.add("CANONICAL_TEXT_NOT_AVAILABLE_FOR_SOURCE");
      continue;
    }

    const canonicalMarkdown = normalizeCanonicalMarkdown(content.content);
    const text = truncateTextToTokenBudget(canonicalMarkdown, remainingTokens);
    if (!text) {
      truncated = true;
      degradationReasons.add("CONTEXT_BUDGET_EXHAUSTED");
      break;
    }
    const sourceDigest = content.canonicalDigest || sha256(canonicalMarkdown);
    const itemEvidence = normalizeEvidence(
      result,
      params.tenantId,
      params.profileId,
      canonicalMarkdown,
      content.updated_at,
      sourceDigest,
      content.canonicalSourceUri,
      params.query,
    );
    itemEvidence.text = text;
    evidence.push(itemEvidence);
    remainingTokens = Math.max(0, remainingTokens - estimateTokens(text));
    if (text.length < content.content.length) {
      truncated = true;
      degradationReasons.add("CONTEXT_BUDGET_TRUNCATED");
    }
  }

  const partial = evidence.length < Math.min(params.results.length, params.maxEvidence);
  if (partial) degradationReasons.add("CONTENT_HYDRATION_PARTIAL");
  if (evidence.length > 0) degradationReasons.add("QUALITY_GATE_NOT_CERTIFIED");
  return { evidence, partial: partial || truncated, degradationReasons: [...degradationReasons] };
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
  let providerConfig: Awaited<ReturnType<typeof getEffectiveVectorProviderConfig>>;
  let provider: string;
  try {
    providerConfig = await getEffectiveVectorProviderConfig({ tenantId });
    provider = resolveVectorProvider("search", providerConfig).provider;
  } catch {
    return {
      retrievalTraceId,
      plan: {
        requestId: request.requestId,
        purpose: request.purpose,
        queryClass,
        sourceClasses: request.sourceClasses,
        evidenceBudget: { maxCandidates, maxEvidence, maxContextTokens },
      },
      providerProfile: { provider: "unknown", profileId: "unavailable" },
      evidence: [],
      evidenceQuality: "no_evidence",
      degraded: true,
      partial: false,
      degradationReasons: ["PROVIDER_CONFIGURATION_UNAVAILABLE"],
    };
  }
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

  let results: Awaited<ReturnType<typeof searchLibraryItems>>;
  try {
    results = await searchLibraryItems(
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
  } catch {
    return {
      retrievalTraceId,
      plan,
      providerProfile: { provider, profileId },
      evidence: [],
      evidenceQuality: "no_evidence",
      degraded: true,
      partial: false,
      degradationReasons: ["RETRIEVAL_PROVIDER_UNAVAILABLE"],
    };
  }
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
  const hydrated = await hydrateLibraryEvidence({
    results: results.results,
    actor,
    tenantId,
    profileId: diagnostics.profileId,
    maxEvidence,
    maxContextTokens,
    query,
  });
  const evidence = hydrated.evidence;

  return {
    retrievalTraceId,
    plan,
    providerProfile: { provider, profileId: diagnostics.profileId ?? profileId },
    evidence,
    evidenceQuality: evidence.length === 0 ? "no_evidence" : "weak",
    degraded: evidence.length > 0 || hydrated.partial || results.results.length > 0,
    partial: hydrated.partial,
    ...(hydrated.degradationReasons.length > 0
      ? { degradationReasons: hydrated.degradationReasons }
      : {}),
  };
}
