import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSearchLibraryItems,
  mockGetMarkdownContent,
  mockGetProviderConfig,
  mockResolveProvider,
} = vi.hoisted(() => ({
    mockSearchLibraryItems: vi.fn(),
    mockGetMarkdownContent: vi.fn(),
    mockGetProviderConfig: vi.fn(),
    mockResolveProvider: vi.fn(),
  }));

vi.mock("./libraryService", () => ({
  resolveLibraryVectorIndexName: vi.fn(() => "library-index"),
  getLibraryMarkdownContent: mockGetMarkdownContent,
  searchLibraryItems: mockSearchLibraryItems,
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

describe("retrieveLibraryEvidenceV2", () => {
  it("builds citations from the ACL-checked canonical source rather than provider metadata", async () => {
    const result = await retrieveLibraryEvidenceV2({ query: "guide" }, actor);

    expect(result.evidence[0]).toMatchObject({
      sourceUri: "https://canonical.example.test/build-guide",
      canonicalRef: { kind: "library_item", id: "12" },
    });
    expect(result.evidenceQuality).toBe("weak");
    expect(result.degradationReasons).toContain("QUALITY_GATE_NOT_CERTIFIED");
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
