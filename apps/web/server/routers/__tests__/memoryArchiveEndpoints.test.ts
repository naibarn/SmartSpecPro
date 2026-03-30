import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockReadArchive,
  mockSearchArchive,
  mockSearchMessageChunks,
  mockGenerateQueryEmbedding,
  mockGetConversationById,
  mockSearchMemories,
  mockDeleteSummary,
} = vi.hoisted(() => ({
  mockReadArchive: vi.fn(),
  mockSearchArchive: vi.fn(),
  mockSearchMessageChunks: vi.fn(),
  mockGenerateQueryEmbedding: vi.fn(),
  mockGetConversationById: vi.fn(),
  mockSearchMemories: vi.fn(),
  mockDeleteSummary: vi.fn(),
}));

vi.mock("../../services/memoryArchiveService", () => ({
  readArchive: mockReadArchive,
  searchArchive: mockSearchArchive,
}));

vi.mock("../../services/messageChunkSearchService", () => ({
  searchMessageChunks: mockSearchMessageChunks,
}));

vi.mock("../../services/queryEmbeddingService", () => ({
  generateQueryEmbedding: mockGenerateQueryEmbedding,
}));

vi.mock("../../services/chatService", () => ({
  getConversationById: mockGetConversationById,
}));

vi.mock("../../services/scopedMemoryService", () => ({
  searchMemories: mockSearchMemories,
}));

vi.mock("../../services/memoryService", async () => {
  const actual = await vi.importActual<typeof import("../../services/memoryService")>("../../services/memoryService");
  return {
    ...actual,
    deleteSummary: mockDeleteSummary,
  };
});

vi.mock("../../_core/trpc", () => {
  const createProcedure = (schema?: any): any => ({
    input(nextSchema: any) {
      return createProcedure(nextSchema);
    },
    query(fn: Function) {
      return async (opts: any) => {
        const input = schema ? schema.parse(opts.input) : opts.input;
        return fn({ ...opts, input });
      };
    },
    mutation(fn: Function) {
      return async (opts: any) => {
        const input = schema ? schema.parse(opts.input) : opts.input;
        return fn({ ...opts, input });
      };
    },
  });

  return {
    router: (routes: any) => routes,
    protectedProcedure: createProcedure(),
  };
});

import { memoryRouter } from "../memory";

function makeCtx() {
  return {
    user: { id: 42, tenantId: "tenant-42" },
    tenantId: "tenant-42",
  } as any;
}

describe("memoryArchive router endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConversationById.mockResolvedValue({ id: 7, tenantId: "tenant-42", projectId: "project-7" });
    mockGenerateQueryEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockSearchMemories.mockResolvedValue([]);
    mockSearchMessageChunks.mockResolvedValue([]);
    mockDeleteSummary.mockResolvedValue(true);
  });

  describe("getArchive", () => {
    it("returns decrypted records for owned conversation", async () => {
      mockReadArchive.mockResolvedValue([
        { messageId: 1, tenantId: "tenant-42", userId: 42, conversationId: 7, role: "user", content: "hello", createdAt: "2026-03-23T00:00:00.000Z" },
      ]);

      const result = await memoryRouter.getArchive({
        ctx: makeCtx(),
        input: {
          conversationId: 7,
          dateFrom: "2026-03-22T00:00:00.000Z",
          dateTo: "2026-03-23T00:00:00.000Z",
        },
      });

      expect(result).toHaveLength(1);
      expect(mockReadArchive).toHaveBeenCalledWith({
        tenantId: "tenant-42",
        userId: 42,
        conversationId: 7,
        dateFrom: "2026-03-22T00:00:00.000Z",
        dateTo: "2026-03-23T00:00:00.000Z",
      });
    });

    it("rejects non-owned conversation", async () => {
      mockGetConversationById.mockResolvedValueOnce(undefined);

      await expect(
        memoryRouter.getArchive({
          ctx: makeCtx(),
          input: {
            conversationId: 9,
            dateFrom: "2026-03-22T00:00:00.000Z",
            dateTo: "2026-03-23T00:00:00.000Z",
          },
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("validates dateFrom is before dateTo", async () => {
      await expect(
        memoryRouter.getArchive({
          ctx: makeCtx(),
          input: {
            conversationId: 7,
            dateFrom: "2026-03-24T00:00:00.000Z",
            dateTo: "2026-03-23T00:00:00.000Z",
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe("searchArchive", () => {
    it("returns matching records for valid query", async () => {
      mockSearchArchive.mockResolvedValue([
        {
          record: { messageId: 1, tenantId: "tenant-42", userId: 42, conversationId: 7, role: "assistant", content: "match", createdAt: "2026-03-23T00:00:00.000Z" },
          score: 1.2,
        },
      ]);

      const result = await memoryRouter.searchArchive({
        ctx: makeCtx(),
        input: {
          conversationId: 7,
          query: "match",
          limit: 5,
        },
      });

      expect(result).toHaveLength(1);
      expect(mockSearchArchive).toHaveBeenCalledWith({
        tenantId: "tenant-42",
        userId: 42,
        conversationId: 7,
        query: "match",
        limit: 5,
      });
    });

    it("validates query length max 500 characters", async () => {
      await expect(
        memoryRouter.searchArchive({
          ctx: makeCtx(),
          input: {
            conversationId: 7,
            query: "x".repeat(501),
            limit: 5,
          },
        }),
      ).rejects.toThrow();
    });

    it("rejects non-owned conversation", async () => {
      mockGetConversationById.mockResolvedValueOnce(undefined);

      await expect(
        memoryRouter.searchArchive({
          ctx: makeCtx(),
          input: {
            conversationId: 7,
            query: "match",
            limit: 5,
          },
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("searchMemoryContext", () => {
    it("returns L1 results from scoped memory search", async () => {
      mockSearchMemories.mockResolvedValue([
        { memory: { id: "m1", title: "Fact 1", content: "Alpha", memoryKind: "fact", sourceType: "auto" }, score: 0.91, matchType: "hybrid" },
        { memory: { id: "m2", title: "Fact 2", content: "Beta", memoryKind: "fact", sourceType: "manual" }, score: 0.83, matchType: "keyword" },
      ]);

      const result = await memoryRouter.searchMemoryContext({
        ctx: makeCtx(),
        input: {
          query: "alpha",
          topK: 10,
        },
      });

      expect(result.l1Results).toHaveLength(2);
      expect(result.l2Results).toHaveLength(0);
      expect(result.l1Count).toBe(2);
      expect(result.l2Triggered).toBe(false);
    });

    it("triggers L2 when L1 returns fewer than 3 results", async () => {
      mockSearchMemories.mockResolvedValue([
        { memory: { id: "m1", title: "Fact 1", content: "Alpha", memoryKind: "fact", sourceType: "auto" }, score: 0.91, matchType: "hybrid" },
      ]);
      mockSearchMessageChunks.mockResolvedValue([
        { chunk: { id: "c1", content: "chunk text", tokenCount: 12 }, score: 0.77, matchType: "hybrid" },
      ]);

      const result = await memoryRouter.searchMemoryContext({
        ctx: makeCtx(),
        input: {
          conversationId: 7,
          query: "alpha",
          topK: 10,
        },
      });

      expect(result.l2Triggered).toBe(true);
      expect(result.l2Results).toHaveLength(1);
      expect(mockSearchMessageChunks).toHaveBeenCalledWith({
        tenantId: "tenant-42",
        userId: 42,
        query: "alpha",
        topK: 5,
        projectId: "project-7",
        embedding: [0.1, 0.2, 0.3],
      });
    });

    it("does not trigger L2 when L1 returns >= 3 results", async () => {
      mockSearchMemories.mockResolvedValue([
        { memory: { id: "m1", title: "Fact 1", content: "Alpha", memoryKind: "fact", sourceType: "auto" }, score: 0.91, matchType: "hybrid" },
        { memory: { id: "m2", title: "Fact 2", content: "Beta", memoryKind: "fact", sourceType: "manual" }, score: 0.83, matchType: "keyword" },
        { memory: { id: "m3", title: "Fact 3", content: "Gamma", memoryKind: "fact", sourceType: "auto" }, score: 0.79, matchType: "keyword" },
      ]);

      const result = await memoryRouter.searchMemoryContext({
        ctx: makeCtx(),
        input: {
          conversationId: 7,
          query: "alpha",
          topK: 10,
        },
      });

      expect(result.l2Triggered).toBe(false);
      expect(mockSearchMessageChunks).not.toHaveBeenCalled();
    });

    it("validates topK between 1 and 20", async () => {
      await expect(
        memoryRouter.searchMemoryContext({
          ctx: makeCtx(),
          input: {
            query: "alpha",
            topK: 0,
          },
        }),
      ).rejects.toThrow();
    });

    it("without conversationId uses user-scoped search only", async () => {
      mockSearchMemories.mockResolvedValue([
        { memory: { id: "m1", title: "Fact 1", content: "Alpha", memoryKind: "fact", sourceType: "auto" }, score: 0.91, matchType: "hybrid" },
      ]);

      const result = await memoryRouter.searchMemoryContext({
        ctx: makeCtx(),
        input: {
          query: "alpha",
          topK: 10,
        },
      });

      expect(result.l2Triggered).toBe(false);
      expect(mockGetConversationById).not.toHaveBeenCalled();
      expect(mockSearchMessageChunks).not.toHaveBeenCalled();
    });
  });

  describe("deleteSummary", () => {
    it("deletes a summary for an owned conversation", async () => {
      const result = await memoryRouter.deleteSummary({
        ctx: makeCtx(),
        input: {
          conversationId: 7,
          summaryId: 33,
        },
      });

      expect(result).toEqual({ success: true });
      expect(mockDeleteSummary).toHaveBeenCalledWith(7, 33);
    });

    it("rejects non-owned conversation", async () => {
      mockGetConversationById.mockResolvedValueOnce(undefined);

      await expect(
        memoryRouter.deleteSummary({
          ctx: makeCtx(),
          input: {
            conversationId: 7,
            summaryId: 33,
          },
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
