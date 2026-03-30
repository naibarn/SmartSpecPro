import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuditLog = vi.hoisted(() => vi.fn());

vi.mock("../../db", () => ({ getDb: vi.fn() }));
vi.mock("../visualStateService", () => ({
  getOrCreateState: vi.fn(() => Promise.resolve({ recentAssetIds: [] })),
}));
vi.mock("../tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: vi.fn(() => Promise.resolve({ multimodalMemory: false })),
}));
vi.mock("../personaService", () => ({
  listPersonas: vi.fn(() => Promise.resolve([])),
  matchPersonaByNickname: vi.fn(() => null),
  resolvePersona: vi.fn(() => Promise.resolve(null)),
  buildPersonaPromptSegments: vi.fn(() => ({ prefix: "", styleInstructions: "", restrictionsBulletPoints: "" })),
}));
vi.mock("../chatMemoryFlags", () => ({
  getChatMemoryFlag: vi.fn(),
  getAllChatMemoryFlags: vi.fn(),
  CHAT_MEMORY_FLAG_DEFAULTS: {
    chat_archive_enabled: true,
    chat_fact_extraction_enabled: false,
    chat_chunk_index_enabled: false,
    chat_vector_memory_enabled: false,
    chat_smart_summarize_enabled: false,
  },
}));
vi.mock("../scopedMemoryService", () => ({
  getRuleMemories: vi.fn(() => Promise.resolve([])),
  searchMemories: vi.fn(),
}));
vi.mock("../queryEmbeddingService", () => ({
  generateQueryEmbedding: vi.fn(() => Promise.resolve([0.1, 0.2, 0.3])),
}));
vi.mock("../messageChunkSearchService", () => ({
  searchMessageChunks: vi.fn(),
}));
vi.mock("../memoryMerger", () => ({
  mergeAndDedup: vi.fn(() => ({
    items: [],
    tokenEstimate: 0,
    rulesCount: 0,
    l1Count: 0,
    l2Count: 0,
    legacyCount: 0,
  })),
}));
vi.mock("../piiFilter", () => ({
  sanitizeEntityForStorage: vi.fn((e: any) => e),
  filterEntityFacts: vi.fn((f: string[]) => ({ filteredFacts: f, removedCount: 0, redactedCount: 0 })),
}));
vi.mock("../relevanceScorer", () => ({
  rankMemories: vi.fn((_, mems: any[]) => mems.map((m: any) => ({ memory: m, score: 1 }))),
}));
vi.mock("../enabledLlmModels", () => ({
  resolveEnabledLlmModelId: vi.fn(),
}));
vi.mock("../modelLookup", () => ({
  buildModelProviderMapLookupCondition: vi.fn(() => ({})),
}));
vi.mock("../auditLogger", () => ({
  auditLogger: { log: mockAuditLog },
}));

import { getDb } from "../../db";
import { getChatMemoryFlag } from "../chatMemoryFlags";
import { searchMemories } from "../scopedMemoryService";
import { searchMessageChunks } from "../messageChunkSearchService";
import { mergeAndDedup } from "../memoryMerger";

const mockGetDb = vi.mocked(getDb);
const mockGetChatMemoryFlag = vi.mocked(getChatMemoryFlag);
const mockSearchMemories = vi.mocked(searchMemories);
const mockSearchMessageChunks = vi.mocked(searchMessageChunks);
const mockMergeAndDedup = vi.mocked(mergeAndDedup);

function makeDb(results: any[] = []) {
  let limitCall = 0;
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => Promise.resolve(results[limitCall++] ?? [])),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  } as any;

  const db = {
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockReturnValue(selectChain),
    update: vi.fn().mockReturnValue(selectChain),
    delete: vi.fn().mockReturnValue(selectChain),
    transaction: vi.fn(async (cb: any) => cb(selectChain)),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  } as any;

  return db;
}

describe("chat memory flag integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockResolvedValue(makeDb());
    mockGetChatMemoryFlag.mockResolvedValue(false as never);
    mockSearchMemories.mockResolvedValue([]);
    mockSearchMessageChunks.mockResolvedValue([]);
    mockMergeAndDedup.mockReturnValue({
      items: [],
      tokenEstimate: 0,
      rulesCount: 0,
      l1Count: 0,
      l2Count: 0,
      legacyCount: 0,
    } as any);
    mockAuditLog.mockClear();
  });

  it("buildChatContext uses legacy path when chat_vector_memory_enabled is off", async () => {
    mockGetDb.mockResolvedValue(
      makeDb([
        [{ personaId: null, tenantId: "tenant-1" }],
        [{ defaultPersonaId: null }],
        [{ defaultPersonaId: null }],
        [{ id: 10, entityType: "rule", entityName: "policy", facts: ["Always verify"], importance: 10, reinforcementCount: 0, lastAccessedAt: null }],
        [],
        [],
      ]),
    );

    const { buildChatContext } = await import("../memoryService");

    const context = await buildChatContext(1, 1, undefined, {
      currentUserMessage: "Please explain the policy in detail",
      tenantId: "tenant-1",
    });

    expect(mockSearchMemories).not.toHaveBeenCalled();
    expect(mockSearchMessageChunks).not.toHaveBeenCalled();
    expect(context.entityContext).toContain("[MEMORY_START]");
    expect(context.entityContext).toContain("Always verify");
  });

  it("buildChatContext uses mergeAndDedup when vector memory is enabled", async () => {
    mockGetChatMemoryFlag.mockResolvedValue(true as never);
    mockSearchMemories.mockResolvedValueOnce([
      { memory: { id: "m1", title: "Fact", content: "Alpha", memoryKind: "fact", sourceType: "auto" }, score: 0.9, matchType: "hybrid" },
    ] as any);
    mockMergeAndDedup.mockReturnValueOnce({
      items: [
        { id: "rule-1", source: "rule", content: "Always verify", tokenEstimate: 4, score: 1 },
        { id: "fact-1", source: "l1_fact", content: "Fact: Alpha", tokenEstimate: 4, score: 0.8 },
        { id: "legacy-1", source: "legacy_entity", content: "user:profile Likes concise answers", tokenEstimate: 4, score: 0.1 },
      ],
      tokenEstimate: 12,
      rulesCount: 1,
      l1Count: 1,
      l2Count: 0,
      l2Triggered: false,
      legacyCount: 1,
    } as any);

    mockGetDb.mockResolvedValue(
      makeDb([
        [{ personaId: null, tenantId: "tenant-1" }],
        [{ defaultPersonaId: null }],
        [{ defaultPersonaId: null }],
        [{ id: 10, entityType: "rule", entityName: "policy", facts: ["Always verify"], importance: 10, reinforcementCount: 0, lastAccessedAt: null }],
        [],
        [],
      ]),
    );

    const { buildChatContext } = await import("../memoryService");
    const context = await buildChatContext(1, 1, undefined, {
      currentUserMessage: "Please explain the policy in detail\n\nLibrary context:\n- [image] Hero still (id:11, source:media_task)",
      tenantId: "tenant-1",
    });

    expect(mockSearchMemories).toHaveBeenCalled();
    expect(mockSearchMemories).toHaveBeenCalledWith(
      expect.objectContaining({ query: "Please explain the policy in detail" }),
    );
    expect(mockMergeAndDedup).toHaveBeenCalled();
    expect(context.retrievalContext).toContain("[RETRIEVAL_START]");
    expect(context.retrievalContext).toContain("[RULE] Always verify");
    expect(context.entityContext).toContain("[MEMORY_START]");
    expect(context.entityContext).toContain("[LEGACY] user:profile Likes concise answers");
  });

  it("buildChatContext triggers L2 only when L1 returns fewer than 3 results", async () => {
    mockGetChatMemoryFlag.mockResolvedValue(true as never);
    mockSearchMemories.mockResolvedValueOnce([
      { memory: { id: "m1", title: "Fact", content: "Alpha", memoryKind: "fact", sourceType: "auto" }, score: 0.9, matchType: "hybrid" },
    ] as any);
    mockSearchMessageChunks.mockResolvedValueOnce([
      { chunk: { id: "c1", content: "chunk text", tokenCount: 12 }, score: 0.8, matchType: "hybrid" },
    ] as any);

    const { buildChatContext } = await import("../memoryService");
    const context = await buildChatContext(1, 1, undefined, {
      currentUserMessage: "Please explain the policy in detail",
      tenantId: "tenant-1",
    });

    expect(mockSearchMemories).toHaveBeenCalled();
    expect(mockSearchMessageChunks).toHaveBeenCalled();
    expect(context.entityContext).toBeNull();
  });

  it("buildChatContext skips L2 when L1 returns 3 or more results", async () => {
    mockGetChatMemoryFlag.mockResolvedValue(true as never);
    mockSearchMemories.mockResolvedValueOnce([
      { memory: { id: "m1", title: "Fact 1", content: "Alpha", memoryKind: "fact", sourceType: "auto" }, score: 0.9, matchType: "hybrid" },
      { memory: { id: "m2", title: "Fact 2", content: "Beta", memoryKind: "fact", sourceType: "auto" }, score: 0.8, matchType: "hybrid" },
      { memory: { id: "m3", title: "Fact 3", content: "Gamma", memoryKind: "fact", sourceType: "auto" }, score: 0.7, matchType: "keyword" },
    ] as any);

    const { buildChatContext } = await import("../memoryService");
    await buildChatContext(1, 1, undefined, {
      currentUserMessage: "Please explain the policy in detail",
      tenantId: "tenant-1",
    });

    expect(mockSearchMemories).toHaveBeenCalled();
    expect(mockSearchMessageChunks).not.toHaveBeenCalled();
  });

  it("uses minimal retrieval for acknowledgements and skips memory search", async () => {
    mockGetChatMemoryFlag.mockResolvedValue(true as never);
    mockGetDb.mockResolvedValue(
      makeDb([
        [{ personaId: null, tenantId: "tenant-1" }],
        [{ defaultPersonaId: null }],
        [{ defaultPersonaId: null }],
        [],
      ]),
    );

    const { buildChatContext } = await import("../memoryService");
    const context = await buildChatContext(1, 1, undefined, {
      currentUserMessage: "thanks",
      tenantId: "tenant-1",
    });

    expect(mockSearchMemories).not.toHaveBeenCalled();
    expect(mockSearchMessageChunks).not.toHaveBeenCalled();
    expect(context.retrievalContext).toBeNull();
    expect(context.entityContext).toBeNull();
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "chat_context_timing",
        metadata: expect.objectContaining({
          retrievalMode: "minimal",
          retrievalReason: "acknowledgement_or_small_talk",
          retrievalHitCount: 0,
        }),
      }),
    );
  });
});
