import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response } from "express";

// Mocks must be defined before imports
vi.mock("../_core/env", () => ({
  ENV: { webGatewayToken: "integration-gateway-token" },
}));

vi.mock("./modelSuggestTool", () => ({
  suggestModel: vi.fn(),
}));

vi.mock("../services/modelRegistry", () => ({
  getModelsByTypeAsync: vi.fn(),
  getDefaultModel: vi.fn(),
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
  contentAutomationGate: vi.fn((_req: Request, _res: Response, next: () => void) => next()),
}));

import { autoDraftToolHandler } from "./autoDraftTool";
import { checkHourlyRate, acquireConcurrentSlot, releaseConcurrentSlot } from "../services/contentAutomationRateLimit";
import { generateAIDraft } from "../services/aiPresentationService";
import { getSkillByIdAsync } from "../services/skillRegistry";
import { getRedisClient } from "../services/redis";
import { getDb } from "../db";
import { signBearerToken } from "../_core/tokens";
import { auditLogger } from "../services/auditLogger";
import { suggestModel } from "./modelSuggestTool";
import { getDefaultModel } from "../services/modelRegistry";
import { createLibraryItem } from "../services/libraryService";
import { createPresentationDeckForLibraryItem } from "../services/presentationService";

const VALID_TOKEN = "integration-gateway-token";
const USER_ID = 100;
const TENANT_ID = "tenant-integration";
const DECK_ID = 42;
const LIBRARY_ITEM_ID = 10;

const mockRedisMethods = {
  set: vi.fn().mockResolvedValue("OK"),
  get: vi.fn().mockResolvedValue(
    JSON.stringify({
      completed: true,
      slidesCompleted: 10,
      slidePreview: [],
      warnings: [],
    }),
  ),
  del: vi.fn().mockResolvedValue(1),
};

const mockDbUserSelect = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([{ id: USER_ID, isDisabled: false, role: "user" }]),
};

const mockDbSlidesSelect = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue(
    Array.from({ length: 10 }, (_, i) => ({ id: i + 1 })),
  ),
};

function buildMockRequest(overrides: Partial<Record<string, unknown>> = {}): Request {
  return {
    headers: { authorization: `Bearer ${VALID_TOKEN}` },
    body: {
      topic: "Integration test topic for AI presentation",
      userId: USER_ID,
      tenantId: TENANT_ID,
      canvas_preset: "16:9",
      num_slides: 10,
      agency_run_id: "run-abc-123",
      ...overrides,
    },
  } as unknown as Request;
}

function buildMockResponse(): { res: Response; statusMock: ReturnType<typeof vi.fn>; jsonMock: ReturnType<typeof vi.fn> } {
  const jsonMock = vi.fn();
  const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
  const res = { status: statusMock, json: jsonMock } as unknown as Response;
  return { res, statusMock, jsonMock };
}

function setupDefaultMocks(): void {
  let dbCallCount = 0;
  vi.mocked(getDb).mockResolvedValue({
    select: vi.fn().mockImplementation(() => {
      dbCallCount++;
      return dbCallCount <= 1 ? mockDbUserSelect : mockDbSlidesSelect;
    }),
  } as never);

  vi.mocked(getRedisClient).mockReturnValue(mockRedisMethods as never);
  vi.mocked(signBearerToken).mockReturnValue("mock-scoped-jwt");
  vi.mocked(generateAIDraft).mockResolvedValue(undefined);
  vi.mocked(checkHourlyRate).mockResolvedValue({ allowed: true, remaining: 9, resetIn: 3600 });
  vi.mocked(acquireConcurrentSlot).mockResolvedValue({ allowed: true });
  vi.mocked(releaseConcurrentSlot).mockResolvedValue(undefined);
  vi.mocked(getSkillByIdAsync).mockResolvedValue(undefined);
  vi.mocked(suggestModel).mockResolvedValue({ recommended: null, alternatives: [], success: true });
  vi.mocked(getDefaultModel).mockReturnValue({ id: "flux-2.0" } as never);
  vi.mocked(createLibraryItem).mockResolvedValue({
    item: { id: LIBRARY_ITEM_ID, tenantId: TENANT_ID, ownerUserId: USER_ID, itemType: "presentation", source: "auto_draft", title: "Integration test", description: null, status: "active", visibility: "private", metadata: {}, sourceUrl: null, thumbnailUrl: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date() },
    idempotent: false,
  });
  vi.mocked(createPresentationDeckForLibraryItem).mockResolvedValue({
    created: true,
    deck: { id: DECK_ID, libraryItemId: LIBRARY_ITEM_ID, tenantId: TENANT_ID, title: "Integration test", version: 0 } as never,
  });
  vi.mocked(auditLogger.log).mockReturnValue(undefined);
}

beforeEach(() => {
  process.env.ENABLE_CONTENT_AUTOMATION = "true";
  vi.clearAllMocks();
  setupDefaultMocks();
});

afterEach(() => {
  delete process.env.ENABLE_CONTENT_AUTOMATION;
});

describe("autoDraftTool integration", () => {
  it("end-to-end auto-draft flow with mocked LLM and media APIs", async () => {
    const req = buildMockRequest();
    const { res, jsonMock } = buildMockResponse();

    await autoDraftToolHandler(req, res);

    // generateAIDraft was called exactly once
    expect(vi.mocked(generateAIDraft)).toHaveBeenCalledTimes(1);

    // The PresentationActor passed to generateAIDraft has userId from body
    const [draftInput, actor] = vi.mocked(generateAIDraft).mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(actor).toMatchObject({ userId: USER_ID, tenantId: TENANT_ID });

    // Canvas dimensions match 16:9 preset
    expect(draftInput.canvasWidth).toBe(1280);
    expect(draftInput.canvasHeight).toBe(720);

    // Response includes success=true, deck_id, slide_count
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        deck_id: DECK_ID,
        slide_count: 10,
      }),
    );
  });

  it("credit deduction works with scoped JWT", async () => {
    const req = buildMockRequest();
    const { res } = buildMockResponse();

    await autoDraftToolHandler(req, res);

    // signBearerToken was called with scoped claims including origin
    expect(vi.mocked(signBearerToken)).toHaveBeenCalledTimes(1);
    const [claims, ttl] = vi.mocked(signBearerToken).mock.calls[0] as [Record<string, unknown>, string];
    expect(claims).toMatchObject({
      scopes: ["auto-draft:execute"],
      origin: "auto-draft-agent",
      sub: String(USER_ID),
    });
    // TTL is 15 minutes
    expect(ttl).toBe("15m");

    // generateAIDraft receives the minted jwt
    const jwtArg = vi.mocked(generateAIDraft).mock.calls[0]?.[2];
    expect(jwtArg).toBe("mock-scoped-jwt");
  });

  it("audit trail includes origin 'auto-draft-agent'", async () => {
    const req = buildMockRequest();
    const { res } = buildMockResponse();

    await autoDraftToolHandler(req, res);

    const logCalls = vi.mocked(auditLogger.log).mock.calls as Array<[Record<string, unknown>]>;
    const eventTypes = logCalls.map((c) => c[0].eventType as string);

    // auto_draft.started and auto_draft.completed must be emitted
    expect(eventTypes).toContain("auto_draft.started");
    expect(eventTypes).toContain("auto_draft.completed");

    const startedCall = logCalls.find((c) => c[0].eventType === "auto_draft.started");
    const completedCall = logCalls.find((c) => c[0].eventType === "auto_draft.completed");

    // started event includes userId and topic
    expect(startedCall?.[0]).toMatchObject({
      userId: USER_ID,
      metadata: expect.objectContaining({ topic: "Integration test topic for AI presentation" }),
    });

    // completed event includes source attribution with agency_run_id and deck_id
    expect(completedCall?.[0].metadata).toMatchObject({
      deck_id: DECK_ID,
      source: "agency_auto_draft:run-abc-123",
    });
  });

  it("logs auto_draft.failed with sanitized error when generateAIDraft throws", async () => {
    vi.mocked(generateAIDraft).mockRejectedValueOnce(
      new Error("LLM call failed at https://api.openai.com/v1/chat/completions"),
    );

    const req = buildMockRequest();
    const { res, statusMock } = buildMockResponse();

    await autoDraftToolHandler(req, res);

    expect(statusMock).toHaveBeenCalledWith(500);

    const logCalls = vi.mocked(auditLogger.log).mock.calls as Array<[Record<string, unknown>]>;
    const failedCall = logCalls.find((c) => c[0].eventType === "auto_draft.failed");
    expect(failedCall).toBeDefined();

    // Sanitized: no raw URLs in error message
    const errorMsg = (failedCall?.[0].metadata as Record<string, unknown>)?.error as string;
    expect(errorMsg).not.toContain("https://api.openai.com");
    expect(errorMsg).toContain("[redacted]");
  });
});
