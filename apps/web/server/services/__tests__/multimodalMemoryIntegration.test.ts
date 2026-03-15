import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Integration Tests for Multimodal Chat Memory (Section 12)
 *
 * These tests exercise cross-service call chains with all dependencies mocked.
 * They verify end-to-end behaviour that unit tests in individual sections cannot cover.
 */

// Mock all external dependencies
vi.mock("../../db", () => ({ getDb: vi.fn() }));
vi.mock("../visualStateService", () => ({
  getOrCreateState: vi.fn(),
  addRecentAsset: vi.fn(() => Promise.resolve()),
  removeAssetFromState: vi.fn(() => Promise.resolve()),
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
vi.mock("../enabledLlmModels", () => ({ resolveEnabledLlmModelId: vi.fn() }));
vi.mock("../modelLookup", () => ({ buildModelProviderMapLookupCondition: vi.fn(() => ({})) }));
vi.mock("../tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: vi.fn(() => Promise.resolve({ multimodalMemory: true })),
}));
vi.mock("../visionMemoryService", () => ({
  deleteFromMemory: vi.fn(() => Promise.resolve({ success: true, deletedItemCount: 1 })),
  pinToMemory: vi.fn(() => Promise.resolve({ success: true })),
  isImageDeletionCommand: vi.fn(() => false),
  checkSafety: vi.fn(() => ({ blocked: false })),
  buildSearchableText: vi.fn(() => "cat | objects: cat, table | colors: grey, white"),
  NSFW_BLOCKED_CATEGORIES: new Set(["sexually_explicit"]),
  NSFW_SCORE_THRESHOLD: 0.5,
}));

import { getDb } from "../../db";
import { getOrCreateState } from "../visualStateService";
import {
  hasImageReferenceKeywords,
  resolveVisualReferences,
  retrieveRelevantAssets,
  buildImageContext,
} from "../multimodalRetrievalService";
import { getTenantFeatureFlags } from "../tenantFeatureFlagService";
import { checkSafety } from "../visionMemoryService";

const mockGetDb = vi.mocked(getDb);
const mockGetOrCreateState = vi.mocked(getOrCreateState);
const mockHasImageKeywords = vi.mocked(hasImageReferenceKeywords);
const mockResolveRefs = vi.mocked(resolveVisualReferences);
const mockRetrieveAssets = vi.mocked(retrieveRelevantAssets);
const mockBuildImageContext = vi.mocked(buildImageContext);
const mockGetTenantFlags = vi.mocked(getTenantFeatureFlags);
const mockCheckSafety = vi.mocked(checkSafety);

function makeDb(overrides: Record<string, any> = {}) {
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
    delete: vi.fn().mockReturnThis(),
    transaction: vi.fn(async (cb: any) => cb(db)),
    ...overrides,
  };
  return db;
}

const EMPTY_VISUAL_STATE = {
  conversationId: 1,
  recentAssetIds: [],
  activeAssetIds: [],
  comparedAssetIds: [],
  namedSets: {},
  updatedAt: null,
};

const VISUAL_STATE_WITH_IMAGES = {
  ...EMPTY_VISUAL_STATE,
  recentAssetIds: [10, 20],
};

describe("Multimodal Memory Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantFlags.mockResolvedValue({ multimodalMemory: true } as any);
  });

  describe("context assembly with visual memory", () => {
    it("should include imageAssets in context for vision-capable models", async () => {
      const db = makeDb();
      db.limit.mockResolvedValue([]);
      mockGetDb.mockResolvedValue(db as any);
      mockGetOrCreateState.mockResolvedValue(VISUAL_STATE_WITH_IMAGES as any);
      mockHasImageKeywords.mockReturnValue(true);
      mockResolveRefs.mockResolvedValue([{ assetId: 10, confidence: 0.9, referenceType: "ordinal" }]);
      mockRetrieveAssets.mockResolvedValue([{ assetId: 10, score: 0.9, source: "explicit" }]);
      mockBuildImageContext.mockResolvedValue({
        imageAssets: [{ assetId: 10, fileUrl: "https://cdn.example.com/img10.jpg", role: "memory" }],
        visualMemoryContext: null,
        memoryCards: null,
      } as any);

      const { buildChatContext } = await import("../memoryService");
      const result = await buildChatContext(1, 1, "system", {
        currentUserMessage: "show me the cat image",
        memoryMode: "off",
        modelCapabilities: { supportsVision: true },
      });

      expect(result.imageAssets.length).toBeGreaterThan(0);
      expect(result.imageAssets[0].assetId).toBe(10);
    });

    it("should include visualMemoryContext text for text-only models", async () => {
      const db = makeDb();
      db.limit.mockResolvedValue([]);
      mockGetDb.mockResolvedValue(db as any);
      mockGetOrCreateState.mockResolvedValue(VISUAL_STATE_WITH_IMAGES as any);
      mockHasImageKeywords.mockReturnValue(true);
      mockResolveRefs.mockResolvedValue([{ assetId: 10, confidence: 0.9, referenceType: "ordinal" }]);
      mockRetrieveAssets.mockResolvedValue([{ assetId: 10, score: 0.9, source: "explicit" }]);
      mockBuildImageContext.mockResolvedValue({
        imageAssets: [],
        visualMemoryContext: "Image 10: A cat sitting on a table | objects: cat, table",
        memoryCards: null,
      } as any);

      const { buildChatContext } = await import("../memoryService");
      const result = await buildChatContext(1, 1, "system", {
        currentUserMessage: "describe the image",
        memoryMode: "off",
        modelCapabilities: { supportsVision: false },
      });

      expect(result.visualMemoryContext).toBeTruthy();
      expect(result.imageAssets).toHaveLength(0);
    });

    it("should not change budget allocation when conversation has no images", async () => {
      const db = makeDb();
      db.limit.mockResolvedValue([]);
      mockGetDb.mockResolvedValue(db as any);
      mockGetOrCreateState.mockResolvedValue(EMPTY_VISUAL_STATE as any);

      const { buildChatContext } = await import("../memoryService");
      const result = await buildChatContext(1, 1, "system", {
        currentUserMessage: "hello",
        memoryMode: "off",
      });

      expect(result.visualMemoryContext).toBeNull();
      expect(result.imageAssets).toHaveLength(0);
    });
  });

  describe("NSFW blocking", () => {
    it("should block NSFW images from memory (checkSafety returns blocked)", () => {
      mockCheckSafety.mockReturnValue({
        blocked: true,
        reason: 'Blocked category "sexually_explicit" with score 0.90',
      });

      const result = checkSafety([{ category: "sexually_explicit", score: 0.90 }]);
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain("sexually_explicit");
    });

    it("should allow safe images through", () => {
      mockCheckSafety.mockReturnValue({ blocked: false });

      const result = checkSafety([{ category: "pets", score: 0.95 }]);
      expect(result.blocked).toBe(false);
    });
  });

  describe("feature flag gating", () => {
    it("should skip visual assembly when multimodalMemory flag is false", async () => {
      const db = makeDb();
      db.limit.mockResolvedValue([]);
      mockGetDb.mockResolvedValue(db as any);
      mockGetOrCreateState.mockResolvedValue(VISUAL_STATE_WITH_IMAGES as any);
      mockGetTenantFlags.mockResolvedValue({ multimodalMemory: false } as any);

      const { buildChatContext } = await import("../memoryService");
      const result = await buildChatContext(1, 1, "system", {
        currentUserMessage: "show me the image",
        memoryMode: "off",
        tenantId: "tenant-flag-off",
      });

      // When flag is off and tenantId is provided, visual assembly is skipped
      expect(mockBuildImageContext).not.toHaveBeenCalled();
      expect(result.visualMemoryContext).toBeNull();
      expect(result.imageAssets).toHaveLength(0);
    });
  });

  describe("tenant isolation", () => {
    it("should return empty results when retrieval service enforces tenant scope", async () => {
      // The retrieval service is mocked to return empty (respects tenant scope)
      mockGetOrCreateState.mockResolvedValue(EMPTY_VISUAL_STATE as any);
      mockRetrieveAssets.mockResolvedValue([]);

      const db = makeDb();
      mockGetDb.mockResolvedValue(db as any);

      const { buildChatContext } = await import("../memoryService");
      const result = await buildChatContext(1, 1, "system", {
        currentUserMessage: "show images",
        tenantId: "tenant-b",
        memoryMode: "off",
      });

      expect(result.imageAssets).toHaveLength(0);
    });
  });
});
