import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDb,
  mockGetAllChatMemoryFlags,
  mockArchiveMessages,
  mockChunkConversationMessages,
  mockExtractFacts,
  mockBuildSmartSummary,
  mockResolvePersona,
  mockListPersonas,
  mockMatchPersonaByNickname,
} = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockGetAllChatMemoryFlags: vi.fn(),
  mockArchiveMessages: vi.fn(),
  mockChunkConversationMessages: vi.fn(),
  mockExtractFacts: vi.fn(),
  mockBuildSmartSummary: vi.fn(),
  mockResolvePersona: vi.fn(),
  mockListPersonas: vi.fn(),
  mockMatchPersonaByNickname: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../chatMemoryFlags", () => ({
  CHAT_MEMORY_FLAG_DEFAULTS: {
    chat_archive_enabled: true,
    chat_fact_extraction_enabled: false,
    chat_chunk_index_enabled: false,
    chat_vector_memory_enabled: false,
    chat_smart_summarize_enabled: false,
  },
  getAllChatMemoryFlags: mockGetAllChatMemoryFlags,
  getChatMemoryFlag: vi.fn(),
  clearChatMemoryFlagCache: vi.fn(),
}));

vi.mock("../memoryArchiveService", () => ({
  archiveMessages: mockArchiveMessages,
}));

vi.mock("../messageChunkerService", () => ({
  chunkConversationMessages: mockChunkConversationMessages,
}));

vi.mock("../factExtractor", () => ({
  extractFacts: mockExtractFacts,
}));

vi.mock("../smartSummarizer", () => ({
  buildSmartSummary: mockBuildSmartSummary,
}));

vi.mock("../personaService", () => ({
  resolvePersona: mockResolvePersona,
  listPersonas: mockListPersonas,
  matchPersonaByNickname: mockMatchPersonaByNickname,
  buildPersonaPromptSegments: vi.fn(() => ({
    prefix: "",
    styleInstructions: "",
    restrictionsBulletPoints: "",
  })),
}));

vi.mock("../piiFilter", () => ({
  sanitizeEntityForStorage: vi.fn((entity: any) => entity),
  filterEntityFacts: vi.fn((facts: string[]) => ({ filteredFacts: facts, removedCount: 0, redactedCount: 0 })),
}));

vi.mock("../relevanceScorer", () => ({
  rankMemories: vi.fn((_, memories: any[]) => memories.map((memory: any) => ({ memory, score: 1 }))),
}));

vi.mock("../enabledLlmModels", () => ({
  resolveEnabledLlmModelId: vi.fn(),
}));

vi.mock("../modelLookup", () => ({
  buildModelProviderMapLookupCondition: vi.fn(() => ({})),
}));

function makeQueueDb(results: any[]) {
  const queue = [...results];
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    then(resolve: (value: any) => void, reject?: (reason: any) => void) {
      return Promise.resolve(queue.shift() ?? []).then(resolve, reject);
    },
  };

  const db: any = {
    select: vi.fn().mockReturnValue(chain),
    insert: vi.fn().mockReturnValue(chain),
    update: vi.fn().mockReturnValue(chain),
    delete: vi.fn().mockReturnValue(chain),
    transaction: vi.fn(async (cb: any) => cb(chain)),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  };

  return db;
}

function makeConversationMessage(id: number, role: "user" | "assistant" = "user") {
  return {
    id,
    role,
    content: role === "user" ? "Hello" : "Hi there",
    createdAt: new Date("2026-03-23T00:00:00.000Z"),
  };
}

describe("processConversationMemory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolvePersona.mockResolvedValue(null);
    mockListPersonas.mockResolvedValue([]);
    mockMatchPersonaByNickname.mockReturnValue(null);
    mockGetAllChatMemoryFlags.mockResolvedValue({
      chat_archive_enabled: true,
      chat_fact_extraction_enabled: false,
      chat_chunk_index_enabled: false,
      chat_vector_memory_enabled: false,
      chat_smart_summarize_enabled: false,
    });
    mockArchiveMessages.mockResolvedValue(undefined);
    mockChunkConversationMessages.mockResolvedValue(undefined);
    mockExtractFacts.mockResolvedValue({ inserted: 0, reinforced: 0, skipped: 0, factIds: [] });
    mockBuildSmartSummary.mockResolvedValue({
      summary: "Smart summary",
      skippedRiskyCount: 0,
      extractedFactIds: [],
      classificationStats: { safe: 1, risky: 0 },
    });
  });

  it("keeps the legacy path when all new chat memory flags are off", async () => {
    const db = makeQueueDb([
      [{ personaId: null, tenantId: "tenant-1" }],
      [{ defaultPersonaId: null }],
      [{ defaultPersonaId: null }],
      [makeConversationMessage(1)],
      [{ model: "gpt-4" }],
      [],
      [{ totalChars: 0 }],
      [],
      [{ count: 1 }],
      [{ model: "gpt-4", projectId: null }],
      [],
      [],
      [{ totalChars: 0 }],
    ]);
    mockGetDb.mockResolvedValue(db);
    mockGetAllChatMemoryFlags.mockResolvedValue({
      chat_archive_enabled: false,
      chat_fact_extraction_enabled: false,
      chat_chunk_index_enabled: false,
      chat_vector_memory_enabled: false,
      chat_smart_summarize_enabled: false,
    });

    const { processConversationMemory } = await import("../memoryService");
    const result = await processConversationMemory(1, 7);

    expect(mockArchiveMessages).not.toHaveBeenCalled();
    expect(mockChunkConversationMessages).not.toHaveBeenCalled();
    expect(mockExtractFacts).not.toHaveBeenCalled();
    expect(mockBuildSmartSummary).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      summarized: false,
      compacted: false,
    });
  });

  it("archives, chunks, and extracts facts when the respective flags are on", async () => {
    const db = makeQueueDb([
      [{ personaId: null, tenantId: "tenant-1" }],
      [{ defaultPersonaId: null }],
      [{ defaultPersonaId: null }],
      [makeConversationMessage(1, "user")],
      [{ model: "gpt-4" }],
      [],
      [{ totalChars: 0 }],
      [],
      [{ count: 1 }],
      [{ model: "gpt-4", projectId: null }],
      [],
      [],
      [{ totalChars: 0 }],
    ]);
    mockGetDb.mockResolvedValue(db);
    mockGetAllChatMemoryFlags.mockResolvedValue({
      chat_archive_enabled: true,
      chat_fact_extraction_enabled: true,
      chat_chunk_index_enabled: true,
      chat_vector_memory_enabled: false,
      chat_smart_summarize_enabled: false,
    });
    mockExtractFacts.mockResolvedValue({
      inserted: 1,
      reinforced: 0,
      skipped: 0,
      factIds: ["fact-1"],
    });

    const { processConversationMemory } = await import("../memoryService");
    const result = await processConversationMemory(1, 7);

    expect(mockArchiveMessages).toHaveBeenCalledTimes(1);
    expect(mockChunkConversationMessages).toHaveBeenCalledTimes(1);
    expect(mockExtractFacts).toHaveBeenCalledTimes(1);
    expect(result.entitiesExtracted).toBeGreaterThanOrEqual(1);
  });

  it("uses smart summarization when enabled", async () => {
    const conversationMessages = Array.from({ length: 21 }, (_, idx) => makeConversationMessage(idx + 1, idx % 2 === 0 ? "user" : "assistant"));
    const db = makeQueueDb([
      [{ personaId: null, tenantId: "tenant-1" }],
      [{ defaultPersonaId: null }],
      [{ defaultPersonaId: null }],
      conversationMessages,
      [{ model: "gpt-4" }],
      [],
      conversationMessages,
      [{ id: 999, summary: "old summary" }],
      [],
      [{ createdAt: new Date("2026-03-23T00:00:00.000Z"), conversationId: 1, userId: 7, tenantId: "tenant-1", messageId: 999, role: "assistant", content: "Smart summary", messageRangeStart: 1, messageRangeEnd: 21, messageCount: 21 }],
      [],
      [{ count: 21 }],
      [{ model: "gpt-4", projectId: null }],
      [],
      [],
      [{ totalChars: 0 }],
    ]);
    mockGetDb.mockResolvedValue(db);
    mockGetAllChatMemoryFlags.mockResolvedValue({
      chat_archive_enabled: true,
      chat_fact_extraction_enabled: true,
      chat_chunk_index_enabled: true,
      chat_vector_memory_enabled: false,
      chat_smart_summarize_enabled: true,
    });
    mockExtractFacts.mockResolvedValue({
      inserted: 1,
      reinforced: 0,
      skipped: 0,
      factIds: ["fact-1"],
    });

    const { processConversationMemory } = await import("../memoryService");
    const result = await processConversationMemory(1, 7);

    expect(mockBuildSmartSummary).toHaveBeenCalledTimes(1);
    expect(result.summarized).toBe(true);
    expect(result.compacted).toBe(true);
    expect(result.compactedMessageCount).toBeGreaterThan(0);
  });
});
