import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSearchLibraryItems, mockGetProviderConfig, mockResolveProvider } =
  vi.hoisted(() => ({
    mockSearchLibraryItems: vi.fn(),
    mockGetProviderConfig: vi.fn(),
    mockResolveProvider: vi.fn(),
  }));

vi.mock("./libraryService", () => ({
  resolveLibraryVectorIndexName: vi.fn(() => "library-index"),
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
      plan: { sourceClasses: ["library_document"] },
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

    const result = await retrieveLibraryEvidenceV2(
      {
        query: " guide ",
        requestId: "client-request-1",
        projectId: "project-a",
        evidenceBudget: { maxCandidates: 100, maxEvidence: 40, maxContextTokens: 90_000 },
      },
      actor,
    );

    expect(mockGetProviderConfig).toHaveBeenCalledWith({ tenantId: "tenant-a" });
    expect(mockSearchLibraryItems).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "guide",
        limit: 50,
        offset: 0,
        filters: expect.objectContaining({ projectId: "project-a" }),
      }),
      actor,
    );
    expect(result.plan.evidenceBudget).toEqual({
      maxCandidates: 50,
      maxEvidence: 12,
      maxContextTokens: 32_000,
    });
    expect(result.plan).toMatchObject({ requestId: "client-request-1", purpose: "library.search", sourceClasses: ["library_document"] });
    expect(result.evidence).toHaveLength(12);
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
    });
    expect(result).toMatchObject({
      evidenceQuality: "weak",
      degraded: true,
      degradationReasons: ["CONTENT_HYDRATION_AND_QUALITY_GATE_PENDING"],
    });
    expect(result.evidence[0]).not.toHaveProperty("text");
    expect(result.evidence[0]?.providerProfileId).toBe("library-index");
    expect(result.providerProfile.profileId).toBe("library-index");
  });
});
