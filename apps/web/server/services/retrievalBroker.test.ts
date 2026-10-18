import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const {
  mockSearchLibraryItems,
  mockGetMarkdownContent,
  mockGetProviderConfig,
  mockResolveProvider,
  mockGetActorScopes,
  mockResolveAiSearchRoute,
  mockResolveProjectionByKey,
  mockAiSearchProviderSearch,
  mockAiSearchProviderSearchMany,
} = vi.hoisted(() => ({
    mockSearchLibraryItems: vi.fn(),
    mockGetMarkdownContent: vi.fn(),
    mockGetProviderConfig: vi.fn(),
    mockResolveProvider: vi.fn(),
    mockGetActorScopes: vi.fn(),
    mockResolveAiSearchRoute: vi.fn(),
    mockResolveProjectionByKey: vi.fn(),
    mockAiSearchProviderSearch: vi.fn(),
    mockAiSearchProviderSearchMany: vi.fn(),
  }));

vi.mock("./libraryService", () => ({
  resolveLibraryVectorIndexName: vi.fn(() => "library-index"),
  getLibraryMarkdownContent: mockGetMarkdownContent,
  getLibraryActorAiSearchScopes: mockGetActorScopes,
  searchLibraryItems: mockSearchLibraryItems,
}));

vi.mock("../db", () => ({ getDb: vi.fn(() => ({ mocked: true })) }));
vi.mock("./retrievalInstanceRoutes", () => ({
  RetrievalInstanceRouteError: class RetrievalInstanceRouteError extends Error {
    constructor(readonly code: string) { super(code); }
  },
  resolveRetrievalInstanceRoute: mockResolveAiSearchRoute,
}));
vi.mock("./ragProjectionRegistry", () => ({
  resolveIndexedRagProjectionByKey: mockResolveProjectionByKey,
}));
vi.mock("./cloudflareAiSearchProvider", () => ({
  CloudflareAiSearchProvider: class {
    search(input: unknown) { return mockAiSearchProviderSearch(input); }
    searchMany(input: unknown) { return mockAiSearchProviderSearchMany(input); }
  },
}));

vi.mock("./vectorProvider", () => ({
  getEffectiveVectorProviderConfig: mockGetProviderConfig,
  resolveVectorProvider: mockResolveProvider,
}));

import {
  RetrievalAuthorizationError,
  retrieveLibraryEvidenceV2,
} from "./retrievalBroker";
import { estimateTokens } from "../utils/tokenEstimator";

const actor = { userId: 7, tenantId: "tenant-a", role: "user" };

const row = {
  item_id: 12,
  item_type: "document",
  title: "Build guide",
  description: "Guide summary",
  source_url: "https://example.test/guide",
  thumbnail_url: null,
  status: "ready",
  source: "upload",
  provider_name: null,
  model_name: null,
  owner_user_id: 7,
  parent_id: null,
  metadata: {},
  access_source: "owner" as const,
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-16T00:00:00.000Z",
  combined_score: 0.8,
  keyword_score: 0.4,
  vector_score: 0.9,
  attach_payload: {
    item_id: 12,
    item_type: "document",
    title: "Build guide",
    source: "upload",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
  vi.stubEnv("CF_ACCOUNT_ID", "");
  vi.stubEnv("CLOUDFLARE_AI_API_KEY", "");
  vi.stubEnv("SPEC229_NONPRODUCTION_EVALUATION_TENANT_ID", "");
  vi.stubEnv("SPEC229_NONPRODUCTION_EVALUATION_LIBRARY_ITEM_IDS", "");
  mockGetActorScopes.mockResolvedValue(["tenant_shared:1234567890abcdef"]);
  mockResolveAiSearchRoute.mockResolvedValue({
    namespace: "smartaihub-dev",
    instanceIds: ["tenant-a-rag"],
    profileVersion: "p229-dev-v1",
  });
  mockAiSearchProviderSearch.mockResolvedValue([]);
  mockAiSearchProviderSearchMany.mockResolvedValue([]);
  mockResolveProjectionByKey.mockResolvedValue(null);
  mockGetMarkdownContent.mockResolvedValue({
    item_id: 12,
    content: "# Build guide\nCurrent canonical text.",
    updated_at: row.updated_at,
    canonicalSourceUri: "https://canonical.example.test/build-guide",
  });
  mockGetProviderConfig.mockResolvedValue({
    provider: "cloudflare_vectorize",
    currentReadProvider: "cloudflare_vectorize",
    vectorizeKnowledgeIndexName: "knowledge-index",
  });
  mockResolveProvider.mockImplementation((_operation, config) => ({
    provider: config.currentReadProvider,
    fallbackApplied: false,
  }));
  mockSearchLibraryItems.mockResolvedValue({
    version: "library_search_v1",
    query: "guide",
    total: 1,
    limit: 20,
    offset: 0,
    has_more: false,
    results: [row],
    retrievalDiagnostics: { provider: "cloudflare_vectorize", profileId: "library-index", degraded: false },
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("retrieveLibraryEvidenceV2", () => {
  it("fails closed before provider access when the evaluation tenant and item allowlist are absent", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const result = await retrieveLibraryEvidenceV2({
      query: "guide",
      comparisonProfile: "ai_search_vector",
    }, actor);
    expect(result).toMatchObject({
      providerProfile: { provider: "not_queried", profileId: "ai_search_vector" },
      evidence: [],
      degradationReasons: ["NON_PRODUCTION_EVALUATION_PROFILE_NOT_AUTHORIZED"],
    });
    expect(mockResolveAiSearchRoute).not.toHaveBeenCalled();
    expect(mockAiSearchProviderSearch).not.toHaveBeenCalled();
  });

  it("executes AI Search comparison profiles through the existing adapter and restricts hydrated evidence to allowlisted items", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "a".repeat(32));
    vi.stubEnv("CLOUDFLARE_AI_API_KEY", "test-ai-search-token");
    vi.stubEnv("SPEC229_NONPRODUCTION_EVALUATION_TENANT_ID", "tenant-a");
    vi.stubEnv("SPEC229_NONPRODUCTION_EVALUATION_LIBRARY_ITEM_IDS", "12");
    const markdown = "# Build guide\nCanonical item text.";
    const digest = createHash("sha256").update(markdown, "utf8").digest("hex");
    const revision = `sha256:${digest}`;
    const projectionKey = `rag/${"a".repeat(20)}/library_document/${"b".repeat(32)}/${"c".repeat(24)}/${"d".repeat(24)}/whole.md`;
    mockGetMarkdownContent.mockResolvedValue({
      item_id: 12, title: "Build guide", content: markdown, updated_at: row.updated_at,
      canonicalRevision: revision, canonicalDigest: digest,
    });
    mockAiSearchProviderSearch.mockResolvedValue([{
      chunkId: "provider-chunk-1", score: 0.8, text: "provider text", key: projectionKey,
      instanceId: "tenant-a-rag",
      metadata: { acl_scope: "tenant_shared:1234567890abcdef", source_type: "library_document" },
    }]);
    mockResolveProjectionByKey.mockResolvedValue({
      tenantId: "tenant-a", sourceType: "library_document", sourceId: "12",
      sourceVersion: revision, projectionPart: "whole", projectionHash: digest,
      projectionKey, aclScope: "tenant_shared:1234567890abcdef",
    });

    const result = await retrieveLibraryEvidenceV2({
      query: "guide",
      comparisonProfile: "ai_search_bm25",
    }, actor);
    expect(mockAiSearchProviderSearch).toHaveBeenCalledWith(expect.objectContaining({
      retrievalType: "keyword", reranking: false, queryRewrite: false,
    }));
    expect(result).toMatchObject({
      providerProfile: { profileId: "ai-search:p229-dev-v1:ai_search_bm25" },
      evidence: [{ sourceId: "12", retrievalMode: "keyword", text: markdown }],
    });

    vi.stubEnv("SPEC229_NONPRODUCTION_EVALUATION_LIBRARY_ITEM_IDS", "99");
    mockGetMarkdownContent.mockClear();
    const excluded = await retrieveLibraryEvidenceV2({
      query: "guide",
      comparisonProfile: "ai_search_bm25",
    }, actor);
    expect(excluded.evidence).toEqual([]);
    expect(excluded.degradationReasons).toContain("NON_ALLOWLISTED_EVALUATION_SOURCE_DROPPED");
    expect(mockGetMarkdownContent).not.toHaveBeenCalled();
  });

  it("runs profile H through existing bounded multi-query search with conditional rewrite history", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "a".repeat(32));
    vi.stubEnv("CLOUDFLARE_AI_API_KEY", "test-ai-search-token");
    vi.stubEnv("SPEC229_NONPRODUCTION_EVALUATION_TENANT_ID", "tenant-a");
    vi.stubEnv("SPEC229_NONPRODUCTION_EVALUATION_LIBRARY_ITEM_IDS", "12");
    const markdown = "# Build guide\nCanonical item text.";
    const digest = createHash("sha256").update(markdown, "utf8").digest("hex");
    const revision = `sha256:${digest}`;
    const projectionKey = `rag/${"a".repeat(20)}/library_document/${"b".repeat(32)}/${"c".repeat(24)}/${"d".repeat(24)}/whole.md`;
    mockGetMarkdownContent.mockResolvedValue({
      item_id: 12, title: "Build guide", content: markdown, updated_at: row.updated_at,
      canonicalRevision: revision, canonicalDigest: digest,
    });
    mockAiSearchProviderSearchMany.mockResolvedValue([{
      chunkId: "provider-chunk-1", score: 0.8, text: "provider text", key: projectionKey,
      instanceId: "tenant-a-rag",
      metadata: { acl_scope: "tenant_shared:1234567890abcdef", source_type: "library_document" },
    }]);
    mockResolveProjectionByKey.mockResolvedValue({
      tenantId: "tenant-a", sourceType: "library_document", sourceId: "12",
      sourceVersion: revision, projectionPart: "whole", projectionHash: digest,
      projectionKey, aclScope: "tenant_shared:1234567890abcdef",
    });

    await retrieveLibraryEvidenceV2({
      query: "and the deployment step?",
      messages: [
        { role: "user", content: "How do I build the guide?" },
        { role: "assistant", content: "Use the documented build process." },
        { role: "user", content: "and the deployment step?" },
      ],
      comparisonProfile: "multi_query",
      multiQueryVariants: ["document build workflow"],
    }, actor);

    expect(mockAiSearchProviderSearchMany).toHaveBeenCalledWith(expect.objectContaining({
      queries: ["and the deployment step?", "document build workflow"],
      queryRewrite: true,
      reranking: true,
      retrievalType: "hybrid",
      fusionMethod: "rrf",
      messages: [
        { role: "user", content: "How do I build the guide?" },
        { role: "assistant", content: "Use the documented build process." },
        { role: "user", content: "and the deployment step?" },
      ],
    }));
    expect(mockAiSearchProviderSearch).not.toHaveBeenCalled();
  });

  it("builds citations from the ACL-checked canonical source rather than provider metadata", async () => {
    const result = await retrieveLibraryEvidenceV2({ query: "guide" }, actor);

    expect(result.evidence[0]).toMatchObject({
      sourceUri: "https://canonical.example.test/build-guide",
      canonicalRef: {
        kind: "library_item",
        id: "12",
        revision: row.updated_at,
        digest: result.evidence[0].sourceDigest,
      },
      citation: {
        lineStart: 1,
        lineEnd: 1,
        revision: `sha256:${result.evidence[0].sourceDigest}`,
        digest: result.evidence[0].sourceDigest,
        anchorUri: expect.stringMatching(/^\/document-management\?/),
      },
    });
    expect(result.evidenceQuality).toBe("weak");
    expect(result.degradationReasons).toContain("QUALITY_GATE_NOT_CERTIFIED");
  });

  it("uses a routed non-production AI Search profile and canonical ledger hydration", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "a".repeat(32));
    vi.stubEnv("CLOUDFLARE_AI_API_KEY", "test-ai-search-token");
    const markdown = "# Build guide\nThe policy guide covers integrity controls.";
    const digest = createHash("sha256").update(markdown, "utf8").digest("hex");
    const revision = `sha256:${digest}`;
    const projectionKey = `rag/${"a".repeat(20)}/library_document/${"b".repeat(32)}/${"c".repeat(24)}/${"d".repeat(24)}/whole.md`;
    mockGetMarkdownContent.mockResolvedValue({
      item_id: 12, title: "Build guide", content: markdown, updated_at: row.updated_at,
      canonicalRevision: revision, canonicalDigest: digest,
      canonicalSourceUri: "https://canonical.example.test/build-guide",
    });
    mockAiSearchProviderSearch.mockResolvedValue([{
      chunkId: "provider-chunk-1", score: 0.88, fusionScore: 0.031,
      text: "untrusted provider text must not be hydrated", key: projectionKey,
      instanceId: "tenant-a-rag",
      metadata: { acl_scope: "tenant_shared:1234567890abcdef", source_type: "library_document" },
    }]);
    mockResolveProjectionByKey.mockResolvedValue({
      tenantId: "tenant-a", sourceType: "library_document", sourceId: "12",
      sourceVersion: revision, projectionPart: "whole", projectionHash: digest,
      projectionKey, aclScope: "tenant_shared:1234567890abcdef",
    });

    const result = await retrieveLibraryEvidenceV2({ query: "policy guide" }, actor);

    expect(mockResolveAiSearchRoute).toHaveBeenCalledWith(expect.anything(), {
      tenantId: "tenant-a", environment: "dev", sourceClasses: ["library_document"],
    });
    expect(mockAiSearchProviderSearch).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-a", authorizedAclScopes: ["tenant_shared:1234567890abcdef"],
      instanceIds: ["tenant-a-rag"], retrievalType: "hybrid", fusionMethod: "rrf",
      reranking: true, queryRewrite: false,
    }));
    expect(mockResolveProjectionByKey).toHaveBeenCalledWith(expect.anything(), {
      tenantId: "tenant-a", instanceId: "tenant-a-rag", projectionKey,
      authorizedAclScopes: ["tenant_shared:1234567890abcdef"],
    });
    expect(result).toMatchObject({
      providerProfile: { provider: "cloudflare_ai_search", profileId: "ai-search:p229-dev-v1" },
      evidenceQuality: "weak", degraded: true,
      evidence: [{ retrievalProvider: "cloudflare_ai_search", retrievalMode: "hybrid",
        text: markdown, sourceRevision: revision, sourceDigest: digest,
        aclVerified: true, provenanceVerified: true, citation: { lineStart: 1, lineEnd: 2 } }],
    });
    expect(result.evidence[0]?.text).not.toContain("untrusted provider text");
    expect(mockSearchLibraryItems).not.toHaveBeenCalled();
  });

  it("drops a cross-tenant provider candidate before canonical source hydration", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "a".repeat(32));
    vi.stubEnv("CLOUDFLARE_AI_API_KEY", "test-ai-search-token");
    mockAiSearchProviderSearch.mockResolvedValue([{
      chunkId: "provider-chunk-1", score: 0.88, text: "cross tenant content",
      key: "rag/candidate/key.md", instanceId: "tenant-a-rag",
      metadata: { acl_scope: "tenant_shared:1234567890abcdef", source_type: "library_document" },
    }]);
    mockResolveProjectionByKey.mockResolvedValue({
      tenantId: "tenant-b", sourceType: "library_document", sourceId: "12",
      sourceVersion: "revision-1", projectionPart: "whole", projectionHash: "d".repeat(64),
      aclScope: "tenant_shared:1234567890abcdef",
    });
    const result = await retrieveLibraryEvidenceV2({ query: "guide" }, actor);
    expect(result.evidence).toEqual([]);
    expect(result.degraded).toBe(true);
    expect(result.degradationReasons).toContain("UNREGISTERED_OR_UNAUTHORIZED_PROJECTION_DROPPED");
    expect(mockGetMarkdownContent).not.toHaveBeenCalled();
  });

  it("drops a candidate whose ACL metadata disagrees with the tenant-scoped registry", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "a".repeat(32));
    vi.stubEnv("CLOUDFLARE_AI_API_KEY", "test-ai-search-token");
    const projectionKey = `rag/${"a".repeat(20)}/library_document/${"b".repeat(32)}/${"c".repeat(24)}/${"d".repeat(24)}/whole.md`;
    mockAiSearchProviderSearch.mockResolvedValue([{
      chunkId: "provider-chunk-1", score: 0.88, key: projectionKey,
      instanceId: "tenant-a-rag",
      metadata: { acl_scope: "tenant_shared:attacker-scope", source_type: "library_document" },
    }]);
    mockResolveProjectionByKey.mockResolvedValue({
      tenantId: "tenant-a", sourceType: "library_document", sourceId: "12",
      sourceVersion: "revision-1", projectionPart: "whole", projectionHash: "d".repeat(64),
      aclScope: "tenant_shared:1234567890abcdef",
    });

    const result = await retrieveLibraryEvidenceV2({ query: "guide" }, actor);

    expect(result.evidence).toEqual([]);
    expect(result.degradationReasons).toContain("UNREGISTERED_OR_UNAUTHORIZED_PROJECTION_DROPPED");
    expect(mockGetMarkdownContent).not.toHaveBeenCalled();
  });

  it("does not activate the development provider route without an explicit non-production environment", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "a".repeat(32));
    vi.stubEnv("CLOUDFLARE_AI_API_KEY", "test-ai-search-token");

    await retrieveLibraryEvidenceV2({ query: "guide" }, actor);

    expect(mockResolveAiSearchRoute).not.toHaveBeenCalled();
    expect(mockSearchLibraryItems).toHaveBeenCalled();
  });

  it("drops AI Search candidates whose canonical revision or digest is stale", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "a".repeat(32));
    vi.stubEnv("CLOUDFLARE_AI_API_KEY", "test-ai-search-token");
    const projectionKey = `rag/${"a".repeat(20)}/library_document/${"b".repeat(32)}/${"c".repeat(24)}/${"d".repeat(24)}/whole.md`;
    mockAiSearchProviderSearch.mockResolvedValue([{
      chunkId: "provider-chunk-1", score: 0.88, text: "stale provider text",
      key: projectionKey, instanceId: "tenant-a-rag",
      metadata: { acl_scope: "tenant_shared:1234567890abcdef", source_type: "library_document" },
    }]);
    mockResolveProjectionByKey.mockResolvedValue({
      tenantId: "tenant-a", sourceType: "library_document", sourceId: "12",
      sourceVersion: "sha256:old", projectionPart: "whole", projectionHash: "d".repeat(64),
      projectionKey, aclScope: "tenant_shared:1234567890abcdef",
    });
    mockGetMarkdownContent.mockResolvedValue({
      item_id: 12, title: "Build guide", content: "# Build guide\nCurrent canonical text.",
      updated_at: row.updated_at, canonicalRevision: "sha256:new", canonicalDigest: "e".repeat(64),
    });

    const result = await retrieveLibraryEvidenceV2({ query: "guide" }, actor);

    expect(result.evidence).toEqual([]);
    expect(result.degradationReasons).toContain("STALE_EVIDENCE_DROPPED");
    expect(mockGetMarkdownContent).toHaveBeenCalledWith(12, actor);
  });

  it("anchors against full canonical Markdown before enforcing the context token budget", async () => {
    const content = `${Array.from({ length: 100 }, (_, index) => `General note ${index + 1}`).join("\n")}\nThe unique integrity token is XYZ123.`;
    mockGetMarkdownContent.mockResolvedValue({
      item_id: 12,
      content,
      updated_at: row.updated_at,
      canonicalSourceUri: "https://canonical.example.test/long-guide",
    });
    const result = await retrieveLibraryEvidenceV2({
      query: "integrity token XYZ123",
      evidenceBudget: { maxCandidates: 20, maxEvidence: 1, maxContextTokens: 30 },
    }, actor);

    expect(result.evidence[0]?.citation).toMatchObject({ lineStart: 101, lineEnd: 101 });
    expect(result.evidence[0]?.text).not.toContain("XYZ123");
    expect(result.evidenceQuality).toBe("weak");
  });

  it("does not invent a source-location anchor for an unsupported semantic match", async () => {
    mockGetMarkdownContent.mockResolvedValue({
      item_id: 12,
      content: "# Guide\nCurrent canonical text.",
      updated_at: row.updated_at,
      canonicalSourceUri: "https://canonical.example.test/build-guide",
    });
    const result = await retrieveLibraryEvidenceV2({ query: "cryptographic unrelated" }, actor);

    expect(result.evidence[0]).not.toHaveProperty("citation");
    expect(result.evidenceQuality).toBe("weak");
  });

  it.each([
    "javascript:alert(1)",
    "https://user:password@example.test/doc",
    "https://example.test/doc?token=secret",
    "not a url",
  ])("omits unsafe or unstable canonical citation URI: %s", async (canonicalSourceUri) => {
    mockGetMarkdownContent.mockResolvedValue({
      item_id: 12,
      content: "# Build guide\nCurrent canonical text.",
      updated_at: row.updated_at,
      canonicalSourceUri,
    });

    const result = await retrieveLibraryEvidenceV2({ query: "guide" }, actor);

    expect(result.evidence[0]).not.toHaveProperty("sourceUri");
    expect(result.evidence[0]).toMatchObject({
      canonicalRef: { kind: "library_item", id: "12" },
      provenanceVerified: true,
    });
  });

  it("rejects missing authenticated identity before provider access", async () => {
    await expect(
      retrieveLibraryEvidenceV2({ query: "guide" }, { userId: 0, tenantId: "" }),
    ).rejects.toBeInstanceOf(RetrievalAuthorizationError);
    expect(mockGetProviderConfig).not.toHaveBeenCalled();
  });

  it("rejects empty normalized queries before provider access", async () => {
    await expect(
      retrieveLibraryEvidenceV2({ query: "   " }, actor),
    ).rejects.toThrow("Retrieval query must not be empty");
    expect(mockGetProviderConfig).not.toHaveBeenCalled();
  });

  it("fails closed for source classes outside the Library adapter", async () => {
    const result = await retrieveLibraryEvidenceV2(
      { query: "guide", sourceClasses: ["agent_memory"] },
      actor,
    );
    expect(result).toMatchObject({
      evidence: [],
      degraded: true,
      degradationReasons: ["UNSUPPORTED_SOURCE_CLASS"],
      providerProfile: { provider: "not_queried" },
      plan: { sourceClasses: ["agent_memory"] },
    });
    expect(mockGetProviderConfig).not.toHaveBeenCalled();
  });

  it("fails closed for query modes and freshness features not certified by this profile", async () => {
    const result = await retrieveLibraryEvidenceV2(
      {
        query: "guide",
        mode: "exact",
        exactIdentifiers: ["SPEC-229"],
        freshnessRequirement: "historical_allowed",
      },
      actor,
    );
    expect(result).toMatchObject({
      evidence: [],
      degraded: true,
      degradationReasons: [
        "EXACT_IDENTIFIER_LANE_NOT_CERTIFIED",
        "RETRIEVAL_MODE_NOT_SUPPORTED_BY_PROVIDER_PROFILE",
        "FRESHNESS_REQUIREMENT_NOT_SUPPORTED",
      ],
      providerProfile: { provider: "not_queried" },
    });
    expect(mockGetProviderConfig).not.toHaveBeenCalled();
  });

  it("does not mislabel legacy providers as a certified V2 evidence source", async () => {
    mockGetProviderConfig.mockResolvedValue({
      provider: "pgvector",
      currentReadProvider: "pgvector",
    });
    mockResolveProvider.mockReturnValue({
      provider: "pgvector",
      fallbackApplied: false,
    });

    const result = await retrieveLibraryEvidenceV2({ query: "guide" }, actor);

    expect(result).toMatchObject({
      evidence: [],
      evidenceQuality: "no_evidence",
      degraded: true,
      partial: false,
      degradationReasons: ["PROVIDER_PROFILE_NOT_CERTIFIED_FOR_RETRIEVAL_BROKER"],
    });
    expect(mockSearchLibraryItems).not.toHaveBeenCalled();
  });

  it("returns explicit degraded evidence when provider configuration is unavailable", async () => {
    mockGetProviderConfig.mockRejectedValue(new Error("secret connection details"));

    const result = await retrieveLibraryEvidenceV2({ query: "guide" }, actor);

    expect(result).toMatchObject({
      evidence: [],
      evidenceQuality: "no_evidence",
      degraded: true,
      partial: false,
      degradationReasons: ["PROVIDER_CONFIGURATION_UNAVAILABLE"],
    });
    expect(JSON.stringify(result)).not.toContain("secret connection details");
  });

  it("returns explicit degraded evidence when provider search is unavailable", async () => {
    mockSearchLibraryItems.mockRejectedValue(new Error("secret provider response"));

    const result = await retrieveLibraryEvidenceV2({ query: "guide" }, actor);

    expect(result).toMatchObject({
      evidence: [],
      evidenceQuality: "no_evidence",
      degraded: true,
      partial: false,
      degradationReasons: ["RETRIEVAL_PROVIDER_UNAVAILABLE"],
    });
    expect(JSON.stringify(result)).not.toContain("secret provider response");
  });

  it("fails closed when the provider search silently falls back to keyword matching", async () => {
    mockSearchLibraryItems.mockResolvedValue({
      version: "library_search_v1", query: "guide", total: 1, limit: 20, offset: 0,
      has_more: false, results: [row],
      retrievalDiagnostics: { provider: "keyword_fallback", degraded: true },
    });
    const result = await retrieveLibraryEvidenceV2({ query: "guide" }, actor);
    expect(result.evidence).toEqual([]);
    expect(result.degraded).toBe(true);
    expect(result.degradationReasons).toContain("RETRIEVAL_PROVIDER_FALLBACK_OR_DIAGNOSTICS_UNAVAILABLE");
  });

  it("drops evidence whose canonical revision changed after vector search", async () => {
    mockGetMarkdownContent.mockResolvedValue({
      item_id: 12,
      content: "Changed canonical source.",
      updated_at: "2026-10-17T00:00:00.000Z",
    });

    const result = await retrieveLibraryEvidenceV2({ query: "guide" }, actor);

    expect(result.evidence).toEqual([]);
    expect(result).toMatchObject({
      evidenceQuality: "no_evidence",
      degraded: true,
      partial: true,
    });
    expect(result.degradationReasons).toContain("STALE_EVIDENCE_DROPPED");
  });

  it("drops evidence if canonical ACL recheck fails during hydration", async () => {
    mockGetMarkdownContent.mockResolvedValue(null);

    const result = await retrieveLibraryEvidenceV2({ query: "guide" }, actor);

    expect(result.evidence).toEqual([]);
    expect(result.degradationReasons).toContain("ACL_OR_SOURCE_REVOKED_AFTER_SEARCH");
    expect(result.partial).toBe(true);
  });

  it("fails closed when canonical ACL/source revalidation throws", async () => {
    mockGetMarkdownContent.mockRejectedValue(new Error("private document details"));

    const result = await retrieveLibraryEvidenceV2({ query: "guide" }, actor);

    expect(result.evidence).toEqual([]);
    expect(result.evidenceQuality).toBe("no_evidence");
    expect(result.degraded).toBe(true);
    expect(result.partial).toBe(true);
    expect(result.degradationReasons).toContain("CANONICAL_SOURCE_REVALIDATION_FAILED");
    expect(JSON.stringify(result)).not.toContain("private document details");
  });

  it("bounds evidence and derives tenant scope from the authenticated actor", async () => {
    mockSearchLibraryItems.mockResolvedValue({
      version: "library_search_v1",
      query: "guide",
      total: 15,
      limit: 50,
      offset: 0,
      has_more: false,
      retrievalDiagnostics: { provider: "cloudflare_vectorize", profileId: "library-index", degraded: false },
      results: Array.from({ length: 15 }, (_, i) => ({
        ...row,
        item_id: i + 1,
        updated_at: `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
      })),
    });
    mockGetMarkdownContent.mockImplementation(async (itemId: number) => ({
      item_id: itemId,
      content: `# Guide ${itemId}\nCanonical content for evidence ${itemId}.`,
      updated_at: `2026-10-${String(itemId).padStart(2, "0")}T00:00:00.000Z`,
    }));

    const result = await retrieveLibraryEvidenceV2(
      {
        query: " guide ",
        requestId: "client-request-1",
        projectId: "project-a",
        status: ["ready"],
        evidenceBudget: { maxCandidates: 100, maxEvidence: 40, maxContextTokens: 90 },
      },
      actor,
    );

    expect(mockGetProviderConfig).toHaveBeenCalledWith({ tenantId: "tenant-a" });
    expect(mockSearchLibraryItems).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "guide",
        limit: 50,
        offset: 0,
        filters: expect.objectContaining({ projectId: "project-a", status: ["ready"] }),
      }),
      actor,
    );
    expect(result.plan.evidenceBudget).toEqual({
      maxCandidates: 50,
      maxEvidence: 12,
      maxContextTokens: 90,
    });
    expect(result.plan).toMatchObject({ requestId: "client-request-1", purpose: "library.search", sourceClasses: ["library_document"] });
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.evidence.length).toBeLessThanOrEqual(12);
    expect(result.evidence[0]).toMatchObject({
      canonicalRef: {
        kind: "library_item",
        id: "1",
        revision: "2026-10-01T00:00:00.000Z",
      },
      retrievalProvider: "cloudflare_vectorize",
      aclVerified: true,
      provenanceVerified: true,
      freshnessState: "current",
      text: expect.any(String),
      sourceDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(result).toMatchObject({ evidenceQuality: "weak", degraded: true, partial: true });
    expect(result.degradationReasons).toContain("QUALITY_GATE_NOT_CERTIFIED");
    expect(result.degradationReasons).toContain("CONTEXT_BUDGET_EXHAUSTED");
    expect(result.evidence[0]?.providerProfileId).toBe("library-index");
    expect(result.providerProfile.profileId).toBe("library-index");
    expect(
      result.evidence.reduce((sum, item) => sum + (item.text ? estimateTokens(item.text) : 0), 0),
    ).toBeLessThanOrEqual(90);
    expect(mockGetMarkdownContent.mock.calls.length).toBeLessThanOrEqual(
      result.evidence.length + 1,
    );
  });
});
