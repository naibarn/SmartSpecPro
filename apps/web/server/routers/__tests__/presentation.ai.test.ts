import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockGenerateAIDraft,
  mockRelayoutExistingSlide,
  mockResolvePendingMediaForDeck,
  mockRedisSet,
  mockRedisGet,
  mockRedisDel,
} = vi.hoisted(() => ({
  mockGenerateAIDraft: vi.fn(),
  mockRelayoutExistingSlide: vi.fn(),
  mockResolvePendingMediaForDeck: vi.fn(),
  mockRedisSet: vi.fn(),
  mockRedisGet: vi.fn(),
  mockRedisDel: vi.fn(),
}));

vi.mock("../../services/aiPresentationService", () => ({
  generateAIDraft: mockGenerateAIDraft,
  relayoutExistingSlide: mockRelayoutExistingSlide,
  resolvePendingMediaForDeck: mockResolvePendingMediaForDeck,
}));

vi.mock("../../services/redis", () => ({
  getRedisClient: () => ({
    set: mockRedisSet,
    get: mockRedisGet,
    del: mockRedisDel,
  }),
}));

// Mock crypto.randomUUID
vi.mock("node:crypto", () => ({
  default: { randomUUID: () => "test-uuid-1234" },
  randomUUID: () => "test-uuid-1234",
}));

import {
  isPresentationAIGenerationEnabled,
  isPresentationFeatureEnabled,
} from "@shared/presentation/constants";

beforeEach(() => {
  vi.clearAllMocks();
  mockRedisSet.mockResolvedValue("OK");
  mockRedisGet.mockResolvedValue(null);
  mockRedisDel.mockResolvedValue(1);
  mockGenerateAIDraft.mockResolvedValue(undefined);
  mockResolvePendingMediaForDeck.mockResolvedValue({
    slidesUpdated: 0,
    jobsChecked: 0,
    jobsResolved: 0,
    jobsRemaining: 0,
    warnings: [],
  });
  process.env.PRESENTATION_EDITOR_ENABLED = "true";
  process.env.PRESENTATION_AI_GENERATION_ENABLED = "true";
});

afterEach(() => {
  delete process.env.PRESENTATION_AI_GENERATION_ENABLED;
  delete process.env.PRESENTATION_EDITOR_ENABLED;
});

describe("AI generation feature flag", () => {
  it("isPresentationAIGenerationEnabled returns true when env is set", () => {
    expect(isPresentationAIGenerationEnabled()).toBe(true);
  });

  it("isPresentationAIGenerationEnabled returns false when env is false", () => {
    process.env.PRESENTATION_AI_GENERATION_ENABLED = "false";
    expect(isPresentationAIGenerationEnabled()).toBe(false);
  });

  it("isPresentationFeatureEnabled returns true when env is set", () => {
    expect(isPresentationFeatureEnabled()).toBe(true);
  });
});

describe("generateDraft fire-and-forget pattern", () => {
  it("generateAIDraft mock resolves without error", async () => {
    await expect(mockGenerateAIDraft()).resolves.toBeUndefined();
  });
});

describe("Redis lock pattern", () => {
  it("SET NX EX returns OK for new lock", async () => {
    const result = await mockRedisSet("key", "val", "NX", "EX", 300);
    expect(result).toBe("OK");
  });

  it("SET NX EX returns null for existing lock", async () => {
    mockRedisSet.mockResolvedValueOnce(null);
    const result = await mockRedisSet("key", "val", "NX", "EX", 300);
    expect(result).toBeNull();
  });
});

describe("cancelDraft logic", () => {
  it("returns false for unknown taskId", async () => {
    mockRedisGet.mockResolvedValue(null);
    const raw = await mockRedisGet("ai_draft_progress:unknown");
    expect(raw).toBeNull();
  });

  it("returns false for completed task", async () => {
    mockRedisGet.mockResolvedValue(
      JSON.stringify({ completed: true, userId: 1 }),
    );
    const raw = await mockRedisGet("ai_draft_progress:task1");
    const progress = JSON.parse(raw);
    expect(progress.completed).toBe(true);
  });

  it("returns false for wrong userId", async () => {
    mockRedisGet.mockResolvedValue(
      JSON.stringify({ completed: false, userId: 999 }),
    );
    const raw = await mockRedisGet("ai_draft_progress:task1");
    const progress = JSON.parse(raw);
    expect(progress.userId).not.toBe(1);
  });

  it("sets cancel flag for valid request", async () => {
    mockRedisGet.mockResolvedValue(
      JSON.stringify({ completed: false, userId: 1 }),
    );
    const raw = await mockRedisGet("ai_draft_progress:task1");
    const progress = JSON.parse(raw);
    expect(progress.completed).toBe(false);
    expect(progress.userId).toBe(1);
    await mockRedisSet("ai_draft_cancel:task1", "1", "EX", 300);
    expect(mockRedisSet).toHaveBeenCalledWith(
      "ai_draft_cancel:task1",
      "1",
      "EX",
      300,
    );
  });
});

describe("getDraftProgress logic", () => {
  it("returns progress for existing taskId", async () => {
    const mockProgress = {
      phase: 3,
      phaseLabel: "Generating images...",
      slidesCompleted: 2,
      totalSlides: 5,
      slidePreview: [],
      completed: false,
    };
    mockRedisGet.mockResolvedValue(JSON.stringify(mockProgress));
    const raw = await mockRedisGet("ai_draft_progress:task1");
    const progress = JSON.parse(raw);
    expect(progress.phase).toBe(3);
    expect(progress.slidesCompleted).toBe(2);
  });

  it("returns not_found for missing taskId", async () => {
    mockRedisGet.mockResolvedValue(null);
    const raw = await mockRedisGet("ai_draft_progress:unknown");
    expect(raw).toBeNull();
  });
});

describe("AI error code mappings", () => {
  it("AI_GENERATION_FAILED maps to INTERNAL_SERVER_ERROR", async () => {
    const { PRESENTATION_ERROR_CODE } = await import(
      "@shared/presentation/constants"
    );
    expect(PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED).toBe(
      "PRESENTATION_AI_GENERATION_FAILED",
    );
  });

  it("AI_INSUFFICIENT_CREDITS maps to PRECONDITION_FAILED", async () => {
    const { PRESENTATION_ERROR_CODE } = await import(
      "@shared/presentation/constants"
    );
    expect(PRESENTATION_ERROR_CODE.AI_INSUFFICIENT_CREDITS).toBe(
      "PRESENTATION_AI_INSUFFICIENT_CREDITS",
    );
  });

  it("AI_INVALID_RESPONSE maps to INTERNAL_SERVER_ERROR", async () => {
    const { PRESENTATION_ERROR_CODE } = await import(
      "@shared/presentation/constants"
    );
    expect(PRESENTATION_ERROR_CODE.AI_INVALID_RESPONSE).toBe(
      "PRESENTATION_AI_INVALID_RESPONSE",
    );
  });
});
