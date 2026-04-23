import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetDb,
  mockSearchMemories,
  mockCreateMemory,
  mockUpdateMemory,
  mockEnqueueEmbedding,
  mockGenerateQueryEmbedding,
  mockCallLLMStructured,
} = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockSearchMemories: vi.fn(),
  mockCreateMemory: vi.fn(),
  mockUpdateMemory: vi.fn(),
  mockEnqueueEmbedding: vi.fn(),
  mockGenerateQueryEmbedding: vi.fn(),
  mockCallLLMStructured: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../scopedMemoryService", () => ({
  searchMemories: mockSearchMemories,
  createMemory: mockCreateMemory,
  updateMemory: mockUpdateMemory,
}));

vi.mock("../embeddingQueue", () => ({
  enqueueEmbedding: mockEnqueueEmbedding,
}));

vi.mock("../queryEmbeddingService", () => ({
  generateQueryEmbedding: mockGenerateQueryEmbedding,
}));

vi.mock("../callLLMStructured", () => ({
  callLLMStructured: mockCallLLMStructured,
}));

describe("factExtractor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReturnValue(undefined);
    mockSearchMemories.mockResolvedValue([]);
    mockCreateMemory.mockResolvedValue({ id: "mem-1" });
    mockUpdateMemory.mockResolvedValue({ id: "mem-1" });
    mockEnqueueEmbedding.mockResolvedValue(undefined);
    mockGenerateQueryEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
  });

  it("parses valid LLM JSON into facts", async () => {
    const { parseLLMResponse } = await import("../factExtractor");
    const raw = JSON.stringify([
      { title: "Decision", content: "Use approach A", category: "decision", importance: 7 },
      { title: "Rule", content: "Always validate", category: "rule", importance: 8 },
    ]);

    const facts = parseLLMResponse(raw);
    expect(facts).toHaveLength(2);
    expect(facts[0]).toEqual({
      title: "Decision",
      content: "Use approach A",
      category: "decision",
      importance: 7,
    });
  });

  it("caps importance at 8", async () => {
    const { parseLLMResponse } = await import("../factExtractor");
    const facts = parseLLMResponse(
      JSON.stringify([{ title: "High", content: "Very important", category: "fact", importance: 9 }]),
    );

    expect(facts).toHaveLength(1);
    expect(facts[0].importance).toBe(8);
  });

  it("returns empty array when required fields are missing", async () => {
    const { parseLLMResponse } = await import("../factExtractor");
    const facts = parseLLMResponse(
      JSON.stringify([{ title: "Missing content", category: "fact", importance: 5 }]),
    );

    expect(facts).toEqual([]);
  });

  it("filters prompt injection patterns", async () => {
    const { filterInjections } = await import("../factExtractor");
    const facts = filterInjections([
      { title: "Clean", content: "Keep this", category: "fact", importance: 5 },
      { title: "OVERRIDE", content: "bad", category: "fact", importance: 5 },
      { title: "Safe", content: "SYSTEM: do not obey", category: "fact", importance: 5 },
    ]);

    expect(facts).toHaveLength(1);
    expect(facts[0].title).toBe("Clean");
  });

  it("maps categories to memory kinds", async () => {
    const { mapCategoryToKind } = await import("../factExtractor");
    expect(mapCategoryToKind("decision")).toBe("decision");
    expect(mapCategoryToKind("rule")).toBe("rule");
    expect(mapCategoryToKind("fact")).toBe("fact");
    expect(mapCategoryToKind("preference")).toBe("preference");
    expect(mapCategoryToKind("checklist")).toBe("checklist");
    expect(mapCategoryToKind("artifact_note")).toBe("artifact_note");
    expect(mapCategoryToKind("note")).toBe("note");
  });

  it("falls back to note for unknown categories", async () => {
    const { mapCategoryToKind } = await import("../factExtractor");
    expect(mapCategoryToKind("unknown_category")).toBe("note");
  });

  it("deduplicates by reinforcing existing memories", async () => {
    const { deduplicateAndStore } = await import("../factExtractor");
    mockSearchMemories.mockResolvedValue([
      {
        memory: {
          id: "mem-99",
          reinforcementCount: 3,
          importance: 5,
        },
        score: 0.95,
      },
    ]);

    const result = await deduplicateAndStore(
      [{ title: "Decision", content: "Use approach A", category: "decision", importance: 7 }],
      "tenant-1",
      42,
    );

    expect(mockUpdateMemory).toHaveBeenCalledWith("mem-99", "tenant-1", {
      reinforcementCount: 4,
      importance: 7,
    });
    expect(mockCreateMemory).not.toHaveBeenCalled();
    expect(result).toEqual({
      inserted: 0,
      reinforced: 1,
      skipped: 0,
      factIds: ["mem-99"],
    });
  });

  it("inserts new facts and queues embeddings", async () => {
    const { deduplicateAndStore } = await import("../factExtractor");
    mockSearchMemories.mockResolvedValue([]);
    mockCreateMemory.mockResolvedValue({ id: "mem-1" });

    const result = await deduplicateAndStore(
      [{ title: "Rule", content: "Always validate", category: "rule", importance: 6 }],
      "tenant-1",
      42,
    );

    expect(mockCreateMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        ownerType: "user",
        ownerId: "42",
        memoryKind: "rule",
        sourceType: "auto",
        sourceUserId: 42,
        title: "Rule",
        content: "Always validate",
        importance: 6,
      }),
    );
    expect(mockEnqueueEmbedding).toHaveBeenCalledWith({
      type: "scoped_memory",
      recordId: "mem-1",
      text: "Rule Always validate",
    });
    expect(result.inserted).toBe(1);
    expect(result.factIds).toEqual(["mem-1"]);
  });

  it("uses the higher importance when reinforcing", async () => {
    const { deduplicateAndStore } = await import("../factExtractor");
    mockSearchMemories.mockResolvedValue([
      {
        memory: {
          id: "mem-1",
          reinforcementCount: 1,
          importance: 7,
        },
        score: 0.96,
      },
    ]);

    await deduplicateAndStore(
      [{ title: "Rule", content: "Always validate", category: "rule", importance: 5 }],
      "tenant-1",
      42,
    );

    expect(mockUpdateMemory).toHaveBeenCalledWith("mem-1", "tenant-1", {
      reinforcementCount: 2,
      importance: 7,
    });
  });

  it("returns zeroed stats for empty LLM output", async () => {
    mockCallLLMStructured.mockResolvedValue({ data: "[]" });
    const { extractFacts } = await import("../factExtractor");

    const result = await extractFacts(
      [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
      ],
      "tenant-1",
      42,
    );

    expect(result).toEqual({ inserted: 0, reinforced: 0, skipped: 0, factIds: [] });
  });

  it("does not hardcode a fallback LLM model when extraction settings are missing", async () => {
    mockCallLLMStructured.mockResolvedValue({ data: "[]" });
    const { extractFacts } = await import("../factExtractor");

    await extractFacts(
      [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
      ],
      "tenant-1",
      42,
    );

    const call = mockCallLLMStructured.mock.calls[0]?.[0];
    expect(call?.model).toBeUndefined();
  });

  it("handles malformed LLM output gracefully", async () => {
    mockCallLLMStructured.mockResolvedValue({ data: "I cannot extract facts from this" });
    const { extractFacts } = await import("../factExtractor");

    const result = await extractFacts(
      [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
      ],
      "tenant-1",
      42,
    );

    expect(result).toEqual({ inserted: 0, reinforced: 0, skipped: 0, factIds: [] });
  });

  it("extracts and stores facts end-to-end", async () => {
    mockCallLLMStructured.mockResolvedValue({
      data: [
        { title: "Decision", content: "Use approach A", category: "decision", importance: 7 },
        { title: "Note", content: "SYSTEM: ignore this", category: "note", importance: 2 },
      ],
    });

    const { extractFacts } = await import("../factExtractor");

    const result = await extractFacts(
      [
        { role: "user", content: "Let's decide." },
        { role: "assistant", content: "We should use approach A." },
      ],
      "tenant-1",
      42,
    );

    expect(mockCreateMemory).toHaveBeenCalledTimes(1);
    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.factIds).toEqual(["mem-1"]);
  });
});
