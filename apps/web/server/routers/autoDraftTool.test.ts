import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

// Mocks must be defined before imports that use them
vi.mock("../_core/env", () => ({
  ENV: { webGatewayToken: "test-gateway-token" },
}));

vi.mock("../services/contentAutomationRateLimit", () => ({
  checkHourlyRate: vi.fn(),
  acquireConcurrentSlot: vi.fn(),
  releaseConcurrentSlot: vi.fn(),
}));

vi.mock("../services/aiPresentationService", () => ({
  generateAIDraft: vi.fn(),
}));

vi.mock("../services/skillRegistry", () => ({
  getSkillByIdAsync: vi.fn(),
}));

vi.mock("../services/redis", () => ({
  getRedisClient: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../_core/tokens", () => ({
  signBearerToken: vi.fn(),
}));

vi.mock("../services/auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

vi.mock("../services/libraryService", () => ({
  createLibraryItem: vi.fn(),
}));

vi.mock("../services/presentationService", () => ({
  createPresentationDeckForLibraryItem: vi.fn(),
}));

vi.mock("../middleware/contentAutomationGate", () => ({
  contentAutomationGate: vi.fn((_req, _res, next) => next()),
}));

import { autoDraftToolHandler } from "./autoDraftTool";
import { checkHourlyRate, acquireConcurrentSlot, releaseConcurrentSlot } from "../services/contentAutomationRateLimit";
import { generateAIDraft } from "../services/aiPresentationService";
import { getSkillByIdAsync } from "../services/skillRegistry";
import { getRedisClient } from "../services/redis";
import { getDb } from "../db";
import { signBearerToken } from "../_core/tokens";
import { auditLogger } from "../services/auditLogger";
import { createLibraryItem } from "../services/libraryService";
import { createPresentationDeckForLibraryItem } from "../services/presentationService";

// Default mocks
const mockRedisMethods = {
  set: vi.fn().mockResolvedValue("OK"),
  get: vi.fn().mockResolvedValue(
    JSON.stringify({
      completed: true,
      slidesCompleted: 5,
      slidePreview: [],
      warnings: [],
    }),
  ),
  del: vi.fn().mockResolvedValue(1),
};

const mockDbSelect = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([
    {
      id: 42,
      isDisabled: false,
      role: "user",
    },
  ]),
};

const mockDbSelectSlides = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]),
};

function buildMockRequest(overrides?: Partial<Record<string, unknown>>): Request {
  return {
    headers: {
      authorization: "Bearer test-gateway-token",
    },
    body: {
      topic: "How to build a React app",
      userId: 42,
      tenantId: "tenant-1",
      canvas_preset: "16:9",
      num_slides: 5,
      ...overrides,
    },
  } as unknown as Request;
}

function buildMockResponse(): { res: Response; statusMock: ReturnType<typeof vi.fn>; jsonMock: ReturnType<typeof vi.fn> } {
  const jsonMock = vi.fn();
  const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
  const res = {
    status: statusMock,
    json: jsonMock,
  } as unknown as Response;
  return { res, statusMock, jsonMock };
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(getRedisClient).mockReturnValue(mockRedisMethods as never);

  // Default: db returns active user on first select call, slides on second
  let callCount = 0;
  vi.mocked(getDb).mockResolvedValue({
    select: vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 1) {
        return mockDbSelect;
      }
      return mockDbSelectSlides;
    }),
  } as never);

  vi.mocked(signBearerToken).mockReturnValue("mock-jwt-token");
  vi.mocked(generateAIDraft).mockResolvedValue(undefined);
  vi.mocked(checkHourlyRate).mockResolvedValue({ allowed: true, remaining: 9, resetIn: 3600 });
  vi.mocked(acquireConcurrentSlot).mockResolvedValue({ allowed: true });
  vi.mocked(releaseConcurrentSlot).mockResolvedValue(undefined);
  vi.mocked(getSkillByIdAsync).mockResolvedValue(undefined);
  vi.mocked(createLibraryItem).mockResolvedValue({
    item: { id: 11, tenantId: "tenant-1", ownerUserId: 42, itemType: "presentation", source: "auto_draft", title: "How to build a React app", description: null, status: "active", visibility: "private", metadata: {}, sourceUrl: null, thumbnailUrl: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date() },
    idempotent: false,
  });
  vi.mocked(createPresentationDeckForLibraryItem).mockResolvedValue({
    created: true,
    deck: { id: 99, libraryItemId: 11, tenantId: "tenant-1", title: "How to build a React app", version: 0 } as never,
  });
  vi.mocked(auditLogger.log).mockReturnValue(undefined);
});

describe("autoDraftTool handler", () => {
  describe("authentication", () => {
    it("returns 401 when Authorization header is missing", async () => {
      const req = buildMockRequest() as Request;
      (req.headers as Record<string, string>).authorization = "";
      const { res, statusMock, jsonMock } = buildMockResponse();

      await autoDraftToolHandler(req, res);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ success: false, error: "Unauthorized" });
    });

    it("returns 401 when Bearer token does not match webGatewayToken", async () => {
      const req = buildMockRequest() as Request;
      (req.headers as Record<string, string>).authorization = "Bearer wrong-token";
      const { res, statusMock, jsonMock } = buildMockResponse();

      await autoDraftToolHandler(req, res);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ success: false, error: "Unauthorized" });
    });
  });

  describe("request validation", () => {
    it("returns 400 when request body is missing topic", async () => {
      const req = buildMockRequest({ topic: undefined });
      const { res, statusMock } = buildMockResponse();

      await autoDraftToolHandler(req, res);

      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("returns 400 when topic is shorter than 3 characters", async () => {
      const req = buildMockRequest({ topic: "ab" });
      const { res, statusMock } = buildMockResponse();

      await autoDraftToolHandler(req, res);

      expect(statusMock).toHaveBeenCalledWith(400);
    });
  });

  describe("user verification", () => {
    it("returns 403 when user is deactivated", async () => {
      vi.mocked(getDb).mockResolvedValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([{ id: 42, isDisabled: true, role: "user" }]),
        }),
      } as never);
      const { res, statusMock, jsonMock } = buildMockResponse();

      await autoDraftToolHandler(buildMockRequest(), res);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it("returns 403 when user not found in database", async () => {
      vi.mocked(getDb).mockResolvedValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([]),
        }),
      } as never);
      const { res, statusMock } = buildMockResponse();

      await autoDraftToolHandler(buildMockRequest(), res);

      expect(statusMock).toHaveBeenCalledWith(403);
    });
  });

  describe("rate limiting", () => {
    it("returns 429 when rate limit exceeded", async () => {
      vi.mocked(checkHourlyRate).mockResolvedValue({ allowed: false, remaining: 0, resetIn: 3600 });
      const { res, statusMock, jsonMock } = buildMockResponse();

      await autoDraftToolHandler(buildMockRequest(), res);

      expect(statusMock).toHaveBeenCalledWith(429);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });
  });

  describe("skill slug resolution", () => {
    it("resolves article_skill_slug to database skill ID", async () => {
      vi.mocked(getSkillByIdAsync).mockResolvedValueOnce({
        id: "my-article-skill",
        name: "My Article Skill",
      } as never);
      const req = buildMockRequest({ article_skill_slug: "my-article-skill" });
      const { res, jsonMock } = buildMockResponse();

      await autoDraftToolHandler(req, res);

      expect(generateAIDraft).toHaveBeenCalledWith(
        expect.objectContaining({ articleSkillId: "my-article-skill" }),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it("falls back to general-article-writer when slug not found, adds warning", async () => {
      vi.mocked(getSkillByIdAsync).mockResolvedValue(undefined);
      const req = buildMockRequest({ article_skill_slug: "unknown-skill" });
      const { res, jsonMock } = buildMockResponse();

      await autoDraftToolHandler(req, res);

      const call = jsonMock.mock.calls[0][0];
      expect(call.success).toBe(true);
      expect(call.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining("general-article-writer")]),
      );
    });

    it("resolves media_skill_slug to database skill ID", async () => {
      // article_skill_slug not provided (no call), media_skill_slug resolves
      vi.mocked(getSkillByIdAsync).mockResolvedValueOnce({ id: "my-media-skill", name: "Media Skill" } as never);
      const req = buildMockRequest({ media_skill_slug: "my-media-skill" });
      const { res, jsonMock } = buildMockResponse();

      await autoDraftToolHandler(req, res);

      expect(generateAIDraft).toHaveBeenCalledWith(
        expect.objectContaining({ imageSkillId: "my-media-skill" }),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe("canvas preset mapping", () => {
    it("maps canvas_preset '16:9' to canvasWidth=1280, canvasHeight=720", async () => {
      const req = buildMockRequest({ canvas_preset: "16:9" });
      const { res } = buildMockResponse();

      await autoDraftToolHandler(req, res);

      expect(generateAIDraft).toHaveBeenCalledWith(
        expect.objectContaining({ canvasWidth: 1280, canvasHeight: 720 }),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it("maps canvas_preset '9:16' to canvasWidth=720, canvasHeight=1280", async () => {
      const req = buildMockRequest({ canvas_preset: "9:16" });
      const { res } = buildMockResponse();

      await autoDraftToolHandler(req, res);

      expect(generateAIDraft).toHaveBeenCalledWith(
        expect.objectContaining({ canvasWidth: 720, canvasHeight: 1280 }),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe("JWT minting", () => {
    it("mints scoped JWT with origin claim 'auto-draft-agent'", async () => {
      const { res } = buildMockResponse();

      await autoDraftToolHandler(buildMockRequest(), res);

      expect(signBearerToken).toHaveBeenCalledWith(
        expect.objectContaining({ origin: "auto-draft-agent" }),
        "15m",
      );
    });

    it("minted JWT has scope ['auto-draft:execute']", async () => {
      const { res } = buildMockResponse();

      await autoDraftToolHandler(buildMockRequest(), res);

      expect(signBearerToken).toHaveBeenCalledWith(
        expect.objectContaining({ scopes: ["auto-draft:execute"] }),
        "15m",
      );
    });

    it("minted JWT expires in 15 minutes", async () => {
      const { res } = buildMockResponse();

      await autoDraftToolHandler(buildMockRequest(), res);

      expect(signBearerToken).toHaveBeenCalledWith(expect.anything(), "15m");
    });
  });

  describe("post-completion data gathering", () => {
    it("reads Redis progress key ai_draft_progress:{taskId} for result data", async () => {
      const { res } = buildMockResponse();

      await autoDraftToolHandler(buildMockRequest(), res);

      expect(mockRedisMethods.get).toHaveBeenCalledWith(
        expect.stringMatching(/^ai_draft_progress:/),
      );
    });

    it("returns AutoDraftResponse with correct deck_id and success=true", async () => {
      const { res, jsonMock } = buildMockResponse();

      await autoDraftToolHandler(buildMockRequest(), res);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          deck_id: expect.any(Number),
        }),
      );
    });
  });

  describe("audit logging", () => {
    it("emits auto_draft.started audit log at beginning of request", async () => {
      const { res } = buildMockResponse();

      await autoDraftToolHandler(buildMockRequest(), res);

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "auto_draft.started" }),
      );
    });

    it("emits auto_draft.completed audit log on success", async () => {
      const { res } = buildMockResponse();

      await autoDraftToolHandler(buildMockRequest(), res);

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "auto_draft.completed" }),
      );
    });

    it("emits auto_draft.failed audit log on generateAIDraft error", async () => {
      vi.mocked(generateAIDraft).mockRejectedValue(new Error("Generation failed"));
      const { res } = buildMockResponse();

      await autoDraftToolHandler(buildMockRequest(), res);

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "auto_draft.failed" }),
      );
    });
  });

  describe("successful response", () => {
    it("returns 200 with success=true on happy path", async () => {
      const { res, statusMock, jsonMock } = buildMockResponse();

      await autoDraftToolHandler(buildMockRequest(), res);

      // Either status(200).json(...) or just res.json(...) (defaults to 200)
      const hasStatus200 = statusMock.mock.calls.some((c) => c[0] === 200);
      const hasDirectJson = jsonMock.mock.calls.some((c) => c[0]?.success === true);
      expect(hasStatus200 || hasDirectJson).toBe(true);
    });

    it("returns error response (not 5xx) when generateAIDraft fails", async () => {
      vi.mocked(generateAIDraft).mockRejectedValue(new Error("Something went wrong https://api.example.com/secret"));
      const { res, jsonMock } = buildMockResponse();

      await autoDraftToolHandler(buildMockRequest(), res);

      const call = jsonMock.mock.calls[0][0];
      expect(call.success).toBe(false);
      // Error message should be sanitized (no URLs)
      expect(call.error).not.toContain("https://");
    });
  });
});
