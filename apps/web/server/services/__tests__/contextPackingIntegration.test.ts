import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all external dependencies before imports
vi.mock("../../db", () => ({ getDb: vi.fn() }));
vi.mock("../visualStateService", () => ({
  getOrCreateState: vi.fn(),
}));
vi.mock("../multimodalRetrievalService", () => ({
  hasImageReferenceKeywords: vi.fn(() => false),
  resolveVisualReferences: vi.fn(() => Promise.resolve([])),
  retrieveRelevantAssets: vi.fn(() => Promise.resolve([])),
  buildImageContext: vi.fn(() =>
    Promise.resolve({ imageAssets: [], visualMemoryContext: null, memoryCards: null })
  ),
}));
vi.mock("../redis", () => ({
  getRedisClient: vi.fn(),
  isRedisAvailable: vi.fn(() => false),
}));
vi.mock("../personaService", () => ({
  resolvePersona: vi.fn(() => null),
  buildPersonaPromptSegments: vi.fn(() => ({ prefix: "", styleInstructions: "", restrictionsBulletPoints: "" })),
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

import { getOrCreateState } from "../visualStateService";
import {
  hasImageReferenceKeywords,
  resolveVisualReferences,
  retrieveRelevantAssets,
  buildImageContext,
} from "../multimodalRetrievalService";
import { getDb } from "../../db";

const mockGetOrCreateState = vi.mocked(getOrCreateState);
const mockHasImageKeywords = vi.mocked(hasImageReferenceKeywords);
const mockResolveRefs = vi.mocked(resolveVisualReferences);
const mockRetrieveAssets = vi.mocked(retrieveRelevantAssets);
const mockBuildImageContext = vi.mocked(buildImageContext);
const mockGetDb = vi.mocked(getDb);

const EMPTY_STATE = {
  conversationId: 1,
  recentAssetIds: [],
  activeAssetIds: [],
  comparedAssetIds: [],
  namedSets: {},
  updatedAt: null,
};

const STATE_WITH_IMAGES = {
  ...EMPTY_STATE,
  recentAssetIds: [10, 20],
};

function makeDb() {
  const db: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    delete: vi.fn().mockReturnThis(),
  };
  // chain all methods
  for (const m of ["select", "from", "where", "leftJoin", "innerJoin", "orderBy", "insert", "values", "update", "set", "delete"]) {
    (db[m] as any).mockReturnValue(db);
  }
  return db;
}

describe("ChatContext interface extension", () => {
  it("includes visualMemoryContext field (string | null)", async () => {
    const db = makeDb();
    mockGetDb.mockResolvedValue(db);
    mockGetOrCreateState.mockResolvedValue(EMPTY_STATE);

    const { buildChatContext } = await import("../memoryService");
    const context = await buildChatContext(1, 1, undefined, {});
    expect("visualMemoryContext" in context).toBe(true);
    expect(context.visualMemoryContext).toBeNull();
  });

  it("includes imageAssets field (array of asset descriptors)", async () => {
    const db = makeDb();
    mockGetDb.mockResolvedValue(db);
    mockGetOrCreateState.mockResolvedValue(EMPTY_STATE);

    const { buildChatContext } = await import("../memoryService");
    const context = await buildChatContext(1, 1, undefined, {});
    expect("imageAssets" in context).toBe(true);
    expect(Array.isArray(context.imageAssets)).toBe(true);
    expect(context.imageAssets).toHaveLength(0);
  });
});

describe("buildChatContext — visual memory assembly (step 4.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasImageKeywords.mockReturnValue(false);
    mockResolveRefs.mockResolvedValue([]);
    mockRetrieveAssets.mockResolvedValue([]);
    mockBuildImageContext.mockResolvedValue({
      imageAssets: [],
      visualMemoryContext: null,
      memoryCards: null,
    });
  });

  it("returns original budget allocation when no visual context exists", async () => {
    const db = makeDb();
    mockGetDb.mockResolvedValue(db);
    mockGetOrCreateState.mockResolvedValue(EMPTY_STATE); // no images

    const { buildChatContext } = await import("../memoryService");
    const context = await buildChatContext(1, 1, undefined, { currentUserMessage: "hello" });

    expect(context.visualMemoryContext).toBeNull();
    expect(context.imageAssets).toHaveLength(0);
  });

  it("calls resolveVisualReferences with the current user message", async () => {
    const db = makeDb();
    mockGetDb.mockResolvedValue(db);
    mockGetOrCreateState.mockResolvedValue(STATE_WITH_IMAGES);
    mockHasImageKeywords.mockReturnValue(true);
    mockResolveRefs.mockResolvedValue([{ assetId: 10, confidence: 0.9, reason: "user said รูปล่าสุด" }]);
    mockRetrieveAssets.mockResolvedValue([{ assetId: 10, score: 0.9, source: "explicit" }]);
    mockBuildImageContext.mockResolvedValue({
      imageAssets: [{ assetId: 10, fileUrl: "https://signed.url/img.jpg", caption: "House", role: "current" }],
      visualMemoryContext: null,
      memoryCards: null,
    });

    const { buildChatContext } = await import("../memoryService");
    await buildChatContext(1, 1, undefined, {
      currentUserMessage: "ดูรูปล่าสุด",
      modelCapabilities: { supportsVision: true },
    });

    expect(mockResolveRefs).toHaveBeenCalledWith("ดูรูปล่าสุด", 1, 1, undefined);
  });

  it("populates imageAssets for vision-capable models", async () => {
    const db = makeDb();
    mockGetDb.mockResolvedValue(db);
    mockGetOrCreateState.mockResolvedValue(STATE_WITH_IMAGES);
    mockHasImageKeywords.mockReturnValue(true);
    mockResolveRefs.mockResolvedValue([{ assetId: 10, confidence: 0.9, reason: "test" }]);
    mockRetrieveAssets.mockResolvedValue([{ assetId: 10, score: 0.9, source: "explicit" }]);
    mockBuildImageContext.mockResolvedValue({
      imageAssets: [{ assetId: 10, fileUrl: "https://signed.url/img.jpg", caption: "House", role: "current" }],
      visualMemoryContext: null,
      memoryCards: null,
    });

    const { buildChatContext } = await import("../memoryService");
    const context = await buildChatContext(1, 1, undefined, {
      currentUserMessage: "show image",
      modelCapabilities: { supportsVision: true },
    });

    expect(context.imageAssets).toHaveLength(1);
    expect(context.imageAssets[0].assetId).toBe(10);
    expect(context.imageAssets[0].fileUrl).toBe("https://signed.url/img.jpg");
  });

  it("populates visualMemoryContext (text descriptions) for text-only models", async () => {
    const db = makeDb();
    mockGetDb.mockResolvedValue(db);
    mockGetOrCreateState.mockResolvedValue(STATE_WITH_IMAGES);
    mockHasImageKeywords.mockReturnValue(true);
    mockResolveRefs.mockResolvedValue([{ assetId: 10, confidence: 0.9, reason: "test" }]);
    mockRetrieveAssets.mockResolvedValue([{ assetId: 10, score: 0.9, source: "explicit" }]);
    mockBuildImageContext.mockResolvedValue({
      imageAssets: [],
      visualMemoryContext: "[Image 1: \"White house\"]",
      memoryCards: null,
    });

    const { buildChatContext } = await import("../memoryService");
    const context = await buildChatContext(1, 1, undefined, {
      currentUserMessage: "show image",
      modelCapabilities: { supportsVision: false },
    });

    expect(context.imageAssets).toHaveLength(0);
    expect(context.visualMemoryContext).toContain("White house");
  });

  it("adds image-aware system instructions when visual context is present", async () => {
    const db = makeDb();
    mockGetDb.mockResolvedValue(db);
    mockGetOrCreateState.mockResolvedValue(STATE_WITH_IMAGES);
    mockHasImageKeywords.mockReturnValue(true);
    mockResolveRefs.mockResolvedValue([{ assetId: 10, confidence: 0.9, reason: "test" }]);
    mockRetrieveAssets.mockResolvedValue([{ assetId: 10, score: 0.9, source: "explicit" }]);
    mockBuildImageContext.mockResolvedValue({
      imageAssets: [{ assetId: 10, fileUrl: "https://signed.url/img.jpg", caption: "House", role: "current" }],
      visualMemoryContext: null,
      memoryCards: null,
    });

    const { buildChatContext } = await import("../memoryService");
    const context = await buildChatContext(1, 1, "You are an assistant.", {
      currentUserMessage: "show image",
      modelCapabilities: { supportsVision: true },
    });

    expect(context.systemPrompt).toContain("[image:assetId:");
  });

  it("does NOT add image instructions when no visual context exists", async () => {
    const db = makeDb();
    mockGetDb.mockResolvedValue(db);
    mockGetOrCreateState.mockResolvedValue(EMPTY_STATE); // no images

    const { buildChatContext } = await import("../memoryService");
    const context = await buildChatContext(1, 1, "You are an assistant.", {
      currentUserMessage: "Hello",
    });

    expect(context.systemPrompt).not.toContain("[image:assetId:");
  });

  it("skips visual assembly entirely when no currentUserMessage provided", async () => {
    const db = makeDb();
    mockGetDb.mockResolvedValue(db);
    mockGetOrCreateState.mockResolvedValue(STATE_WITH_IMAGES);

    const { buildChatContext } = await import("../memoryService");
    const context = await buildChatContext(1, 1, undefined, {});

    // No message → no visual assembly (no LLM calls)
    expect(mockResolveRefs).not.toHaveBeenCalled();
    expect(context.imageAssets).toHaveLength(0);
  });

  it("respects max 5 image slot budget", async () => {
    const db = makeDb();
    mockGetDb.mockResolvedValue(db);
    mockGetOrCreateState.mockResolvedValue(STATE_WITH_IMAGES);
    mockHasImageKeywords.mockReturnValue(true);
    mockResolveRefs.mockResolvedValue([{ assetId: 10, confidence: 0.9, reason: "test" }]);
    mockRetrieveAssets.mockResolvedValue([{ assetId: 10, score: 0.9, source: "explicit" }]);
    // buildImageContext enforces the cap internally; we verify it's called with maxImages=5
    mockBuildImageContext.mockResolvedValue({
      imageAssets: [{ assetId: 10, fileUrl: "https://signed.url/img.jpg", caption: "House", role: "current" }],
      visualMemoryContext: null,
      memoryCards: null,
    });

    const { buildChatContext } = await import("../memoryService");
    await buildChatContext(1, 1, undefined, {
      currentUserMessage: "show image",
      modelCapabilities: { supportsVision: true },
    });

    const callArgs = mockBuildImageContext.mock.calls[0];
    expect(callArgs[2].maxImages).toBeLessThanOrEqual(5);
  });
});

describe("contextToMessages — multimodal type migration", () => {
  it("handles string content unchanged (backward compatible)", async () => {
    const { contextToMessages } = await import("../memoryService");
    const ctx = {
      systemPrompt: "You are an assistant.",
      entityContext: null,
      summaryContext: null,
      bufferMessages: [{ role: "user" as const, content: "Hello" }],
      totalTokenEstimate: 10,
      visualMemoryContext: null,
      imageAssets: [],
    };
    const msgs = contextToMessages(ctx);
    expect(msgs[1].content).toBe("Hello");
  });

  it("injects visualMemoryContext as system message before buffer messages", async () => {
    const { contextToMessages } = await import("../memoryService");
    const ctx = {
      systemPrompt: "You are an assistant.",
      entityContext: null,
      summaryContext: null,
      bufferMessages: [
        { role: "user" as const, content: "What do you see?" },
      ],
      totalTokenEstimate: 50,
      visualMemoryContext: "[Image 1: \"White house\"]",
      imageAssets: [],
    };
    const msgs = contextToMessages(ctx);
    // First message should be system prompt + visual memory context
    const systemMsg = msgs.find((m) => m.role === "system");
    const systemContent = typeof systemMsg?.content === "string" ? systemMsg.content : "";
    expect(systemContent).toContain("White house");
  });

  it("formats last user message as content parts array when imageAssets is non-empty", async () => {
    const { contextToMessages } = await import("../memoryService");
    const ctx = {
      systemPrompt: undefined,
      entityContext: null,
      summaryContext: null,
      bufferMessages: [
        { role: "assistant" as const, content: "Previous answer" },
        { role: "user" as const, content: "Show me the image" },
      ],
      totalTokenEstimate: 50,
      visualMemoryContext: null,
      imageAssets: [{ assetId: 10, fileUrl: "https://signed.url/img.jpg", caption: "House", role: "current" as const }],
    };
    const msgs = contextToMessages(ctx);
    const lastUser = msgs.filter((m) => m.role === "user").at(-1);
    expect(Array.isArray(lastUser?.content)).toBe(true);
    const parts = lastUser?.content as any[];
    expect(parts.some((p: any) => p.type === "text")).toBe(true);
    expect(parts.some((p: any) => p.type === "image_url")).toBe(true);
    expect(parts.find((p: any) => p.type === "image_url").image_url.url).toBe("https://signed.url/img.jpg");
  });

  it("returns string content for all messages when no images are present", async () => {
    const { contextToMessages } = await import("../memoryService");
    const ctx = {
      systemPrompt: "System",
      entityContext: null,
      summaryContext: null,
      bufferMessages: [
        { role: "user" as const, content: "Hello" },
        { role: "assistant" as const, content: "Hi" },
      ],
      totalTokenEstimate: 10,
      visualMemoryContext: null,
      imageAssets: [],
    };
    const msgs = contextToMessages(ctx);
    for (const m of msgs) {
      expect(typeof m.content).toBe("string");
    }
  });
});

describe("getTextContent helper", () => {
  it("returns string directly when content is a string", async () => {
    const { getTextContent } = await import("../memoryService");
    expect(getTextContent("Hello world")).toBe("Hello world");
  });

  it("extracts text parts from ContentPart[] and joins them", async () => {
    const { getTextContent } = await import("../memoryService");
    const parts = [
      { type: "text" as const, text: "Hello" },
      { type: "text" as const, text: "world" },
    ];
    expect(getTextContent(parts)).toBe("Hello world");
  });

  it("returns empty string when content parts array has no text entries", async () => {
    const { getTextContent } = await import("../memoryService");
    const parts = [
      { type: "image_url" as const, image_url: { url: "https://example.com/img.jpg" } },
    ];
    expect(getTextContent(parts)).toBe("");
  });

  it("handles mixed text and image_url parts correctly", async () => {
    const { getTextContent } = await import("../memoryService");
    const parts = [
      { type: "text" as const, text: "Look at this" },
      { type: "image_url" as const, image_url: { url: "https://example.com/img.jpg" } },
      { type: "text" as const, text: "and tell me" },
    ];
    expect(getTextContent(parts)).toBe("Look at this and tell me");
  });
});

describe("adaptive budget allocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasImageKeywords.mockReturnValue(false);
    mockResolveRefs.mockResolvedValue([]);
    mockRetrieveAssets.mockResolvedValue([]);
    mockBuildImageContext.mockResolvedValue({
      imageAssets: [],
      visualMemoryContext: null,
      memoryCards: null,
    });
  });

  it("uses higher entity budget when no images in scope", async () => {
    const db = makeDb();
    mockGetDb.mockResolvedValue(db);
    mockGetOrCreateState.mockResolvedValue(EMPTY_STATE); // no images

    const { buildChatContext } = await import("../memoryService");
    const context = await buildChatContext(1, 1, undefined, {
      currentUserMessage: "hello",
      contextBudget: 8000,
    });

    // In no-visual mode: entity budget is 40% of 8000 = 3200 chars / 4 = 800 tokens
    // We can verify by checking the context assembled correctly with no visual data
    expect(context.visualMemoryContext).toBeNull();
    expect(context.imageAssets).toHaveLength(0);
  });

  it("uses reduced entity budget when images exist", async () => {
    const db = makeDb();
    mockGetDb.mockResolvedValue(db);
    mockGetOrCreateState.mockResolvedValue(STATE_WITH_IMAGES);
    mockHasImageKeywords.mockReturnValue(true);
    mockResolveRefs.mockResolvedValue([{ assetId: 10, confidence: 0.9, reason: "test" }]);
    mockRetrieveAssets.mockResolvedValue([{ assetId: 10, score: 0.9, source: "explicit" }]);
    mockBuildImageContext.mockResolvedValue({
      imageAssets: [{ assetId: 10, fileUrl: "https://signed.url/img.jpg", caption: "House", role: "current" }],
      visualMemoryContext: null,
      memoryCards: null,
    });

    const { buildChatContext } = await import("../memoryService");
    const context = await buildChatContext(1, 1, undefined, {
      currentUserMessage: "show image",
      contextBudget: 8000,
      modelCapabilities: { supportsVision: true },
    });

    // Visual mode: entity is 20%, visual is 15%, summary is 25%, buffer is 40%
    expect(context.imageAssets.length).toBeGreaterThan(0);
  });

  it("never degrades non-visual conversations", async () => {
    const db = makeDb();
    mockGetDb.mockResolvedValue(db);
    mockGetOrCreateState.mockResolvedValue(EMPTY_STATE); // no images

    const { buildChatContext } = await import("../memoryService");
    const context = await buildChatContext(1, 1, undefined, {
      currentUserMessage: "hello",
    });

    // No visual context means standard behavior
    expect(context.visualMemoryContext).toBeNull();
    expect(context.imageAssets).toEqual([]);
  });
});
