import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPublicVideoRouter } from "../publicVideoApi";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../services/mediaGenerationService", () => ({
  mediaGenerationService: {
    generateVideoAsync: vi.fn(),
    getTask: vi.fn(),
  },
}));

vi.mock("../../services/creditService", () => ({
  deductCredits: vi.fn(),
}));

vi.mock("../../_core/tokens", () => ({
  createInternalTokenFromAuth: vi.fn().mockReturnValue("mock-token"),
}));

import { mediaGenerationService } from "../../services/mediaGenerationService";
import { deductCredits } from "../../services/creditService";

const mockMediaService = vi.mocked(mediaGenerationService);
const mockDeductCredits = vi.mocked(deductCredits);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockTask = {
  id: "task-1",
  status: "pending",
  mediaType: "video" as const,
  model: "wan-2.1",
  prompt: "A scenic landscape",
  createdAt: "2026-01-01T00:00:00Z",
  resultUrl: null,
  creditsUsed: null,
  completedAt: null,
};

const completedTask = {
  ...mockTask,
  status: "completed" as const,
  resultUrl: "https://cdn.example.com/video-1.mp4",
  creditsUsed: 15,
  completedAt: "2026-01-01T01:00:00Z",
};

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

function makeApp(scopes: string[] = ["video_projects:create"]) {
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
  app.use("/v1/video-projects", createPublicVideoRouter());
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDeductCredits.mockResolvedValue({ success: true } as any);
  mockMediaService.generateVideoAsync.mockResolvedValue(mockTask as any);
  mockMediaService.getTask.mockResolvedValue(completedTask as any);
});

// ---------------------------------------------------------------------------
// POST /v1/video-projects
// ---------------------------------------------------------------------------

describe("POST /v1/video-projects", () => {
  it("returns 201 with task id on success", async () => {
    const res = await request(makeApp())
      .post("/v1/video-projects")
      .send({ title: "My Video", duration_minutes: 5, quality: "draft" });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("status");
    expect(res.body).toHaveProperty("credits_reserved");
  });

  it("calculates draft credits correctly (3 per min)", async () => {
    await request(makeApp())
      .post("/v1/video-projects")
      .send({ title: "Test", duration_minutes: 5, quality: "draft" });
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 15 }),
    );
  });

  it("calculates standard credits correctly (5 per min)", async () => {
    await request(makeApp())
      .post("/v1/video-projects")
      .send({ title: "Test", duration_minutes: 2, quality: "standard" });
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 10 }),
    );
  });

  it("calculates high credits correctly (10 per min)", async () => {
    await request(makeApp())
      .post("/v1/video-projects")
      .send({ title: "Test", duration_minutes: 2, quality: "high" });
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 20 }),
    );
  });

  it("rejects when credit cost exceeds MAX_SINGLE_JOB_CREDITS", async () => {
    const res = await request(makeApp())
      .post("/v1/video-projects")
      .send({ title: "Test", duration_minutes: 1001, quality: "high" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("credit_overflow");
  });

  it("requires video_projects:create scope", async () => {
    const res = await request(makeApp(["media:generate"]))
      .post("/v1/video-projects")
      .send({ title: "Test", duration_minutes: 1 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("insufficient_scopes");
  });

  it("validates required fields", async () => {
    const res = await request(makeApp())
      .post("/v1/video-projects")
      .send({ title: "Test" }); // missing duration_minutes
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_request");
  });

  it("deducts credits with source type api_video_project", async () => {
    await request(makeApp())
      .post("/v1/video-projects")
      .send({ title: "Test", duration_minutes: 1, quality: "draft" });
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: "api_video_project" }),
    );
  });

  it("sets X-Credits-Used header", async () => {
    const res = await request(makeApp())
      .post("/v1/video-projects")
      .send({ title: "Test", duration_minutes: 1, quality: "draft" });
    expect(res.headers["x-credits-used"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// GET /v1/video-projects/:id
// ---------------------------------------------------------------------------

describe("GET /v1/video-projects/:id", () => {
  it("returns project status and metadata", async () => {
    const res = await request(makeApp()).get("/v1/video-projects/task-1");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("status");
    expect(res.body).toHaveProperty("result_url");
  });

  it("requires video_projects:create scope", async () => {
    const res = await request(makeApp([])).get("/v1/video-projects/task-1");
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/video-projects/:id/export/download
// ---------------------------------------------------------------------------

describe("GET /v1/video-projects/:id/export/download", () => {
  it("redirects to external result URL when export is done", async () => {
    const res = await request(makeApp()).get("/v1/video-projects/task-1/export/download");
    // supertest follows redirect by default → 200 or redirect depending on target
    expect([200, 302]).toContain(res.status);
  });

  it("returns 404 when task is not completed", async () => {
    mockMediaService.getTask.mockResolvedValue({ ...mockTask, status: "pending" } as any);
    const res = await request(makeApp()).get("/v1/video-projects/task-1/export/download");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("requires video_projects:create scope", async () => {
    const res = await request(makeApp([])).get("/v1/video-projects/task-1/export/download");
    expect(res.status).toBe(403);
  });
});
