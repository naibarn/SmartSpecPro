import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDb,
  mockDb,
  mockGetEffectiveVectorProviderConfig,
  mockResolveVectorProvider,
  mockFetch,
} = vi.hoisted(() => {
  const db = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  };

  return {
    mockGetDb: vi.fn().mockResolvedValue(db),
    mockDb: db,
    mockGetEffectiveVectorProviderConfig: vi.fn(),
    mockResolveVectorProvider: vi.fn(),
    mockFetch: vi.fn(),
  };
});

vi.mock("../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("./groupsService", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./groupsService")>();
  return {
    ...orig,
    getUserGroups: vi.fn().mockResolvedValue([]),
  };
});

vi.mock("./vectorProvider", () => ({
  getEffectiveVectorProviderConfig: mockGetEffectiveVectorProviderConfig,
  resolveVectorProvider: mockResolveVectorProvider,
}));

import { searchLibraryItems } from "./libraryService";

function makeSelectWithOrder(rows: any[]) {
  const orderByMock = vi.fn().mockResolvedValue(rows);
  const whereMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  return { from: fromMock };
}

function makeSelect(rows: any[]) {
  const whereMock = vi.fn().mockResolvedValue(rows);
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  return { from: fromMock };
}

const baseDate = new Date("2026-02-10T00:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDb.mockResolvedValue(mockDb);
  mockDb.select.mockReset();
  mockDb.insert.mockReset();
  mockDb.update.mockReset();
  mockGetEffectiveVectorProviderConfig.mockResolvedValue({
    provider: "chromadb",
    currentReadProvider: "chromadb",
    targetProvider: "chromadb",
  });
  mockResolveVectorProvider.mockReturnValue({
    provider: "chromadb",
    fallbackApplied: false,
  });
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
  delete process.env.SMARTSPEC_PROXY_TOKEN;
});

describe("searchLibraryItems", () => {
  it("returns contract-compliant library_search_v1 payload with deterministic hybrid ordering", async () => {
    const items = [
      {
        id: 1,
        tenantId: 50,
        ownerUserId: 7,
        itemType: "image",
        source: "media_history",
        title: "Launch deck preview",
        description: "keyword heavy result",
        status: "ready",
        visibility: "private",
        metadata: { provider: "kie_ai", model: "veo-3-1" },
        sourceUrl: null,
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: new Date(baseDate.getTime() + 1_000),
        updatedAt: new Date(baseDate.getTime() + 1_000),
      },
      {
        id: 2,
        tenantId: 50,
        ownerUserId: 7,
        itemType: "video",
        source: "media_studio",
        title: "Demo clip",
        description: "no keyword in title",
        status: "ready",
        visibility: "private",
        metadata: { provider: "kie_ai", model: "veo-3-1" },
        sourceUrl: "https://cdn.example.com/demo.mp4",
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: new Date(baseDate.getTime() + 2_000),
        updatedAt: new Date(baseDate.getTime() + 2_000),
      },
      {
        id: 3,
        tenantId: 50,
        ownerUserId: 7,
        itemType: "document",
        source: "upload",
        title: "Launch checklist",
        description: "contains both channels",
        status: "ready",
        visibility: "private",
        metadata: { provider_name: "internal", model_name: "text-indexer" },
        sourceUrl: null,
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: new Date(baseDate.getTime() + 3_000),
        updatedAt: new Date(baseDate.getTime() + 3_000),
      },
    ];

    const chunks = [
      { libraryItemId: 1, content: "deck summary", vectorRefId: "vec-1" },
      { libraryItemId: 2, content: "launch launch release plan", vectorRefId: "vec-2" },
      { libraryItemId: 3, content: "launch checklist with rollout gates", vectorRefId: "vec-3" },
    ];

    mockDb.select
      .mockReturnValueOnce(makeSelectWithOrder(items))
      .mockReturnValueOnce(makeSelect([]))
      .mockReturnValueOnce(makeSelect(chunks));

    const response = await searchLibraryItems(
      { query: "launch", limit: 10, offset: 0 },
      { userId: 7, tenantId: 50, role: "user" },
    );

    expect(response.version).toBe("library_search_v1");
    expect(response.total).toBe(3);
    expect(response.results[0]).toEqual(
      expect.objectContaining({
        item_id: 3,
        combined_score: expect.any(Number),
        keyword_score: expect.any(Number),
        vector_score: expect.any(Number),
        attach_payload: expect.objectContaining({ item_id: 3 }),
      }),
    );

    // Deterministic hybrid ranking: both-channel item first, then vector-only, then keyword-only.
    expect(response.results.map((r) => r.item_id)).toEqual([3, 2, 1]);
    expect(response.results[0].combined_score).toBeGreaterThan(response.results[1].combined_score);
    expect(response.results[1].combined_score).toBeGreaterThan(response.results[2].combined_score);
    expect(response.results.find((r) => r.item_id === 2)?.source_url).toBe("https://cdn.example.com/demo.mp4");
  });

  it("enforces tenant/ACL visibility and prevents private leakage", async () => {
    const items = [
      {
        id: 10,
        tenantId: 51,
        ownerUserId: 99,
        itemType: "video",
        source: "media_studio",
        title: "Secret private video",
        description: "should not leak",
        status: "ready",
        visibility: "private",
        metadata: {},
        sourceUrl: null,
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: baseDate,
        updatedAt: baseDate,
      },
      {
        id: 11,
        tenantId: 51,
        ownerUserId: 88,
        itemType: "video",
        source: "media_studio",
        title: "Team handbook",
        description: "visible to tenant",
        status: "ready",
        visibility: "team",
        metadata: {},
        sourceUrl: null,
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: new Date(baseDate.getTime() + 1_000),
        updatedAt: new Date(baseDate.getTime() + 1_000),
      },
      {
        id: 12,
        tenantId: 51,
        ownerUserId: 77,
        itemType: "document",
        source: "upload",
        title: "Granted private doc",
        description: "explicit permission",
        status: "ready",
        visibility: "private",
        metadata: {},
        sourceUrl: null,
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: new Date(baseDate.getTime() + 2_000),
        updatedAt: new Date(baseDate.getTime() + 2_000),
      },
    ];

    const chunks = [
      { libraryItemId: 10, content: "secret leak", vectorRefId: "vec-10" },
      { libraryItemId: 11, content: "team docs", vectorRefId: "vec-11" },
      { libraryItemId: 12, content: "granted docs", vectorRefId: "vec-12" },
    ];

    const permissions = [
      {
        libraryItemId: 12,
        subjectType: "user",
        subjectId: "5",
        permissionLevel: "read",
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      },
    ];

    mockDb.select
      .mockReturnValueOnce(makeSelectWithOrder(items))
      .mockReturnValueOnce(makeSelect(permissions))
      .mockReturnValueOnce(makeSelect(chunks));

    const response = await searchLibraryItems(
      { query: "docs" },
      { userId: 5, tenantId: 51, role: "user" },
    );

    expect(response.results.map((r) => r.item_id).sort((a, b) => a - b)).toEqual([11, 12]);
    expect(response.results.some((r) => r.item_id === 10)).toBe(false);
  });

  it("applies filter combinations (type/model/tags/date/status/owner)", async () => {
    const items = [
      {
        id: 21,
        tenantId: 52,
        ownerUserId: 7,
        itemType: "image",
        source: "media_history",
        title: "Candidate A",
        description: "A",
        status: "ready",
        visibility: "private",
        metadata: { model: "veo-3-1", tags: ["marketing", "launch"] },
        sourceUrl: null,
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: new Date("2026-02-08T00:00:00.000Z"),
        updatedAt: new Date("2026-02-08T00:00:00.000Z"),
      },
      {
        id: 22,
        tenantId: 52,
        ownerUserId: 7,
        itemType: "video",
        source: "media_history",
        title: "Candidate B",
        description: "B",
        status: "ready",
        visibility: "private",
        metadata: { model: "sora-2", tags: ["marketing"] },
        sourceUrl: null,
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: new Date("2026-02-08T00:00:00.000Z"),
        updatedAt: new Date("2026-02-08T00:00:00.000Z"),
      },
      {
        id: 23,
        tenantId: 52,
        ownerUserId: 7,
        itemType: "image",
        source: "media_history",
        title: "Candidate C",
        description: "C",
        status: "failed",
        visibility: "private",
        metadata: { model: "veo-3-1", tags: ["marketing", "launch"] },
        sourceUrl: null,
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: new Date("2026-02-09T00:00:00.000Z"),
        updatedAt: new Date("2026-02-09T00:00:00.000Z"),
      },
    ];

    mockDb.select
      .mockReturnValueOnce(makeSelectWithOrder(items))
      .mockReturnValueOnce(makeSelect([]))
      .mockReturnValueOnce(makeSelect([]));

    const response = await searchLibraryItems(
      {
        query: "",
        filters: {
          itemType: "image",
          model: "veo-3-1",
          ownerUserId: 7,
          tags: ["marketing", "launch"],
          status: "ready",
          fromDate: new Date("2026-02-07T00:00:00.000Z"),
          toDate: new Date("2026-02-08T23:59:59.999Z"),
        },
      },
      { userId: 7, tenantId: 52, role: "user" },
    );

    expect(response.total).toBe(1);
    expect(response.results[0].item_id).toBe(21);
  });

  it("uses native pgvector scores when pgvector is the active read provider", async () => {
    process.env.SMARTSPEC_PROXY_TOKEN = "test-proxy-token";
    mockGetEffectiveVectorProviderConfig.mockResolvedValue({
      provider: "pgvector",
      currentReadProvider: "pgvector",
      targetProvider: "pgvector",
    });
    mockResolveVectorProvider.mockReturnValue({
      provider: "pgvector",
      fallbackApplied: false,
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        results: [{ item_id: 2, vector_score: 0.95 }],
      }),
    });

    const items = [
      {
        id: 1,
        tenantId: 53,
        ownerUserId: 7,
        itemType: "document",
        source: "upload",
        title: "Launch summary",
        description: "keyword-only match",
        status: "ready",
        visibility: "private",
        metadata: {},
        sourceUrl: null,
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: new Date(baseDate.getTime() + 1_000),
        updatedAt: new Date(baseDate.getTime() + 1_000),
      },
      {
        id: 2,
        tenantId: 53,
        ownerUserId: 7,
        itemType: "document",
        source: "upload",
        title: "Roadmap memo",
        description: "semantic match only",
        status: "ready",
        visibility: "private",
        metadata: {},
        sourceUrl: null,
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: new Date(baseDate.getTime() + 2_000),
        updatedAt: new Date(baseDate.getTime() + 2_000),
      },
    ];

    mockDb.select
      .mockReturnValueOnce(makeSelectWithOrder(items))
      .mockReturnValueOnce(makeSelect([]));

    const response = await searchLibraryItems(
      { query: "launch", limit: 10, offset: 0 },
      { userId: 7, tenantId: 53, role: "user" },
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/internal/library/search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-proxy-token": "test-proxy-token",
        }),
      }),
    );
    expect(response.results.map((r) => r.item_id)).toEqual([2, 1]);
    expect(response.results[0].vector_score).toBe(0.95);
    expect(response.results[1].vector_score).toBe(0);
  });

  it("falls back to chunk scoring when native pgvector search errors", async () => {
    process.env.SMARTSPEC_PROXY_TOKEN = "test-proxy-token";
    mockGetEffectiveVectorProviderConfig.mockResolvedValue({
      provider: "pgvector",
      currentReadProvider: "pgvector",
      targetProvider: "pgvector",
    });
    mockResolveVectorProvider.mockReturnValue({
      provider: "pgvector",
      fallbackApplied: false,
    });
    mockFetch.mockRejectedValue(new Error("backend unavailable"));

    const items = [
      {
        id: 1,
        tenantId: 54,
        ownerUserId: 7,
        itemType: "document",
        source: "upload",
        title: "Roadmap notes",
        description: "fallback candidate",
        status: "ready",
        visibility: "private",
        metadata: {},
        sourceUrl: null,
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: new Date(baseDate.getTime() + 1_000),
        updatedAt: new Date(baseDate.getTime() + 1_000),
      },
      {
        id: 2,
        tenantId: 54,
        ownerUserId: 7,
        itemType: "document",
        source: "upload",
        title: "Other notes",
        description: "weaker fallback candidate",
        status: "ready",
        visibility: "private",
        metadata: {},
        sourceUrl: null,
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: new Date(baseDate.getTime() + 2_000),
        updatedAt: new Date(baseDate.getTime() + 2_000),
      },
    ];

    const chunks = [
      { libraryItemId: 1, content: "launch launch release rollout", vectorRefId: "vec-1" },
      { libraryItemId: 2, content: "quarterly staffing review", vectorRefId: "vec-2" },
    ];

    mockDb.select
      .mockReturnValueOnce(makeSelectWithOrder(items))
      .mockReturnValueOnce(makeSelect([]))
      .mockReturnValueOnce(makeSelect(chunks));

    const response = await searchLibraryItems(
      { query: "launch", limit: 10, offset: 0 },
      { userId: 7, tenantId: 54, role: "user" },
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(response.results.map((r) => r.item_id)).toEqual([1]);
    expect(response.results[0].vector_score).toBeGreaterThan(0);
  });

  it("caps native pgvector candidate ids before calling the Python backend", async () => {
    process.env.SMARTSPEC_PROXY_TOKEN = "test-proxy-token";
    mockGetEffectiveVectorProviderConfig.mockResolvedValue({
      provider: "pgvector",
      currentReadProvider: "pgvector",
      targetProvider: "pgvector",
    });
    mockResolveVectorProvider.mockReturnValue({
      provider: "pgvector",
      fallbackApplied: false,
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, results: [] }),
    });

    const items = Array.from({ length: 1005 }, (_, index) => ({
      id: index + 1,
      tenantId: 55,
      ownerUserId: 7,
      itemType: "document",
      source: "upload",
      title: `Doc ${index + 1}`,
      description: "candidate",
      status: "ready",
      visibility: "private",
      metadata: {},
      sourceUrl: null,
      thumbnailUrl: null,
      deletedAt: null,
      createdAt: new Date(baseDate.getTime() + index),
      updatedAt: new Date(baseDate.getTime() + index),
    }));

    mockDb.select
      .mockReturnValueOnce(makeSelectWithOrder(items))
      .mockReturnValueOnce(makeSelect([]));

    await searchLibraryItems(
      { query: "launch", limit: 10, offset: 0 },
      { userId: 7, tenantId: 55, role: "user" },
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(mockFetch.mock.calls[0]?.[1]?.body ?? "{}"));
    expect(payload.candidate_item_ids).toHaveLength(1000);
    expect(payload.candidate_item_ids[0]).toBe(1);
    expect(payload.candidate_item_ids.at(-1)).toBe(1000);
  });
});
