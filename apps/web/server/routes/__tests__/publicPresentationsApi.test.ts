import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPresentationPublicRouter } from "../publicPresentationsApi";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../services/aiPresentationService", () => ({
  generateAIDraft: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/presentationPlaybackExport", () => ({
  triggerPresentationExport: vi.fn(),
  getPresentationExportStatus: vi.fn(),
}));

vi.mock("../../services/presentationService", () => ({
  getPresentationDeckDetail: vi.fn(),
  createPresentationDeckForLibraryItem: vi.fn(),
}));

vi.mock("../../services/libraryService", () => ({
  createLibraryItem: vi.fn(),
}));

vi.mock("../../services/autoDraftResolver", () => ({
  resolveAutoDraftParams: vi.fn(),
}));

vi.mock("../../services/creditService", () => ({
  deductCredits: vi.fn(),
  getCreditBalance: vi.fn(),
}));

vi.mock("../../services/redis", () => ({
  getRedisClient: vi.fn(),
}));

vi.mock("../../_core/tokens", () => ({
  createInternalTokenFromAuth: vi.fn().mockReturnValue("mock-internal-token"),
  signBearerToken: vi.fn().mockReturnValue("mock-bearer"),
}));

import { generateAIDraft } from "../../services/aiPresentationService";
import {
  triggerPresentationExport,
  getPresentationExportStatus,
} from "../../services/presentationPlaybackExport";
import {
  getPresentationDeckDetail,
  createPresentationDeckForLibraryItem,
} from "../../services/presentationService";
import { createLibraryItem } from "../../services/libraryService";
import { resolveAutoDraftParams } from "../../services/autoDraftResolver";
import { deductCredits, getCreditBalance } from "../../services/creditService";
import { getRedisClient } from "../../services/redis";

const mockGenerateAIDraft = vi.mocked(generateAIDraft);

// Clear all mock call counts between tests
beforeEach(() => vi.clearAllMocks());
const mockTriggerExport = vi.mocked(triggerPresentationExport);
const mockGetExportStatus = vi.mocked(getPresentationExportStatus);
const mockGetDeckDetail = vi.mocked(getPresentationDeckDetail);
const mockCreateDeckForLibraryItem = vi.mocked(createPresentationDeckForLibraryItem);
const mockCreateLibraryItem = vi.mocked(createLibraryItem);
const mockResolveAutoDraftParams = vi.mocked(resolveAutoDraftParams);
const mockDeductCredits = vi.mocked(deductCredits);
const mockGetCreditBalance = vi.mocked(getCreditBalance);
const mockGetRedisClient = vi.mocked(getRedisClient);

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

function makeApp(scopes: string[] = ["presentations:create"]) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.auth = {
      ok: true,
      mode: "api_key",
      sub: "1",
      userId: 1,
      tenantId: "tenant-1",
      apiKeyId: "key-1",
      scopes,
    };
    next();
  });
  app.use("/v1/presentations", createPresentationPublicRouter());
  return app;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const deckDetail = {
  deck: {
    id: 100,
    title: "Test Deck",
    tenantId: "tenant-1",
    libraryItemId: 50,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  },
  slides: [
    { id: 1, deckId: 100, index: 0, slideContent: {}, notes: "" },
  ],
  assets: [],
};

const libraryItem = { id: 50, itemType: "presentation", title: "Test" };
const exportResult = { exportId: "exp-1", status: "processing" };

// ---------------------------------------------------------------------------
// POST /v1/presentations/generate
// ---------------------------------------------------------------------------

describe("POST /v1/presentations/generate", () => {
  beforeEach(() => {
    mockResolveAutoDraftParams.mockResolvedValue({} as any);
    mockCreateLibraryItem.mockResolvedValue({ item: libraryItem as any } as any);
    mockCreateDeckForLibraryItem.mockResolvedValue({
      created: true,
      deck: deckDetail.deck as any,
    });
    mockDeductCredits.mockResolvedValue({ success: true } as any);
    mockGetCreditBalance.mockResolvedValue({ credits: 90 } as any);
    mockGenerateAIDraft.mockResolvedValue(undefined);
    mockGetRedisClient.mockReturnValue({
      set: vi.fn().mockResolvedValue("OK"),
    } as any);
  });

  it("validates topic min length (3 chars)", async () => {
    const res = await request(makeApp())
      .post("/v1/presentations/generate")
      .send({ topic: "ab" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_request");
  });

  it("validates topic max length (1000 chars)", async () => {
    const res = await request(makeApp())
      .post("/v1/presentations/generate")
      .send({ topic: "a".repeat(1001) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_request");
  });

  it("requires presentations:create scope", async () => {
    const res = await request(makeApp(["agencies:list"]))
      .post("/v1/presentations/generate")
      .send({ topic: "AI Trends" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("insufficient_scopes");
  });

  it("returns task_id and status pending on success", async () => {
    const res = await request(makeApp())
      .post("/v1/presentations/generate")
      .send({ topic: "AI Trends in 2026" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("task_id");
    expect(res.body).toHaveProperty("deck_id");
    expect(res.body.status).toBe("pending");
  });

  it("deducts credits with source api_presentation", async () => {
    await request(makeApp())
      .post("/v1/presentations/generate")
      .send({ topic: "AI Trends" });
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: "api_presentation" }),
    );
  });
});

// ---------------------------------------------------------------------------
// GET /v1/presentations/tasks/:taskId/progress
// ---------------------------------------------------------------------------

describe("GET /v1/presentations/tasks/:taskId/progress", () => {
  it("returns SSE stream with progress events", async () => {
    const progressData = JSON.stringify({
      phase: 1,
      phaseLabel: "Generating",
      slidesCompleted: 2,
      totalSlides: 5,
      completed: true,
      userId: 1,
    });
    mockGetRedisClient.mockReturnValue({
      get: vi.fn().mockResolvedValue(progressData),
    } as any);

    const res = await request(makeApp()).get(
      "/v1/presentations/tasks/task-123/progress",
    );
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
  });

  it("closes stream when generation completes", async () => {
    const progressData = JSON.stringify({
      phase: 3,
      phaseLabel: "Done",
      slidesCompleted: 5,
      totalSlides: 5,
      completed: true,
      userId: 1,
    });
    mockGetRedisClient.mockReturnValue({
      get: vi.fn().mockResolvedValue(progressData),
    } as any);

    const res = await request(makeApp()).get(
      "/v1/presentations/tasks/task-done/progress",
    );
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
    // Response should end (not hang open)
    expect(res.text).toContain("[DONE]");
  });

  it("returns 404 for unknown taskId", async () => {
    mockGetRedisClient.mockReturnValue({
      get: vi.fn().mockResolvedValue(null),
    } as any);

    const res = await request(makeApp()).get(
      "/v1/presentations/tasks/unknown-task/progress",
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/presentations/decks/:deckId
// ---------------------------------------------------------------------------

describe("GET /v1/presentations/decks/:deckId", () => {
  beforeEach(() => {
    mockGetDeckDetail.mockResolvedValue(deckDetail as any);
  });

  it("returns deck metadata and slides", async () => {
    const res = await request(makeApp()).get("/v1/presentations/decks/100");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("deck_id");
    expect(res.body).toHaveProperty("slides");
  });

  it("rejects IDOR access from different tenant with 404", async () => {
    const err = new Error("Permission denied") as any;
    err.code = "PERMISSION_DENIED";
    mockGetDeckDetail.mockRejectedValue(err);

    const res = await request(makeApp()).get("/v1/presentations/decks/999");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("requires presentations:create scope", async () => {
    const res = await request(makeApp([])).get("/v1/presentations/decks/100");
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/presentations/decks/:deckId/export
// ---------------------------------------------------------------------------

describe("POST /v1/presentations/decks/:deckId/export", () => {
  beforeEach(() => {
    mockGetDeckDetail.mockResolvedValue(deckDetail as any);
    mockTriggerExport.mockResolvedValue(exportResult as any);
  });

  it("triggers export and returns export_id", async () => {
    const res = await request(makeApp())
      .post("/v1/presentations/decks/100/export")
      .send({ format: "pptx" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("export_id");
    expect(res.body.status).toBe("processing");
  });

  it("validates format enum (pptx, pdf)", async () => {
    const res = await request(makeApp())
      .post("/v1/presentations/decks/100/export")
      .send({ format: "exe" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_request");
  });

  it("verifies deck ownership before export", async () => {
    const err = new Error("Not found") as any;
    err.code = "NOT_FOUND";
    mockGetDeckDetail.mockRejectedValue(err);

    const res = await request(makeApp())
      .post("/v1/presentations/decks/999/export")
      .send({ format: "pptx" });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/presentations/decks/:deckId/export/download
// ---------------------------------------------------------------------------

describe("GET /v1/presentations/decks/:deckId/export/download", () => {
  beforeEach(() => {
    mockGetDeckDetail.mockResolvedValue(deckDetail as any);
  });

  it("verifies deck ownership", async () => {
    const err = new Error("Not found") as any;
    err.code = "NOT_FOUND";
    mockGetDeckDetail.mockRejectedValue(err);

    const res = await request(makeApp()).get(
      "/v1/presentations/decks/999/export/download",
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when export not complete", async () => {
    mockGetExportStatus.mockResolvedValue({ status: "processing" } as any);
    const res = await request(makeApp()).get(
      "/v1/presentations/decks/100/export/download",
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});

// ---------------------------------------------------------------------------
// Route ordering
// ---------------------------------------------------------------------------

describe("route ordering", () => {
  it("tasks/:taskId/progress matches before decks/:deckId", async () => {
    mockGetRedisClient.mockReturnValue({
      get: vi.fn().mockResolvedValue(null),
    } as any);

    // If ordering is wrong, /tasks/ would be matched as deckId="tasks" and
    // getPresentationDeckDetail would be called instead of Redis check
    const res = await request(makeApp()).get(
      "/v1/presentations/tasks/abc123/progress",
    );
    // Should hit progress handler (returns 404 for unknown task), NOT deck handler
    expect(mockGetDeckDetail).not.toHaveBeenCalled();
    expect(res.status).toBe(404);
  });
});
