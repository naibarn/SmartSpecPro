import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPublicMediaRouter } from "../publicMediaApi";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../services/mediaGenerationService", () => ({
  mediaGenerationService: {
    generateImageAsync: vi.fn(),
    generateVideoAsync: vi.fn(),
    generateAudioAsync: vi.fn(),
    getTask: vi.fn(),
  },
}));

vi.mock("../../services/creditService", () => ({
  deductCredits: vi.fn(),
}));

vi.mock("../../_core/tokens", () => ({
  createInternalTokenFromAuth: vi.fn().mockReturnValue("mock-token"),
}));

vi.mock("../../services/ssrfValidation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/ssrfValidation")>();
  return {
    ...actual,
    sanitizeUri: vi.fn((url: string) => {
      if (url.startsWith("http://localhost") || url.startsWith("http://127.")) {
        throw new actual.ApiValidationError("Only HTTPS URLs are allowed");
      }
      return url;
    }),
    assertPublicIp: vi.fn(async (hostname: string) => {
      if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "169.254.169.254") {
        throw new actual.ApiValidationError("URL resolves to a private IP address");
      }
    }),
    validateReferenceUrls: vi.fn(async (urls: string[]) => {
      if (urls.length > 5) {
        throw new actual.ApiValidationError("Maximum 5 reference image URLs allowed");
      }
      for (const url of urls) {
        if (
          url.startsWith("http://localhost") ||
          url.startsWith("http://127.") ||
          url.includes("169.254.169.254")
        ) {
          throw new actual.ApiValidationError("URL resolves to a private IP address");
        }
        if (!url.startsWith("https://")) {
          throw new actual.ApiValidationError("Only HTTPS URLs are allowed");
        }
      }
    }),
  };
});

import { mediaGenerationService } from "../../services/mediaGenerationService";
import { deductCredits } from "../../services/creditService";
import { validateReferenceUrls } from "../../services/ssrfValidation";

const mockMediaService = vi.mocked(mediaGenerationService);
const mockDeductCredits = vi.mocked(deductCredits);
const mockValidateReferenceUrls = vi.mocked(validateReferenceUrls);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const imageTask = {
  id: "img-task-1",
  status: "pending",
  mediaType: "image" as const,
  model: "flux-schnell",
  prompt: "a sunset",
  createdAt: "2026-01-01T00:00:00Z",
};

const videoTask = {
  id: "vid-task-1",
  status: "pending",
  mediaType: "video" as const,
  model: "wan-2.1",
  prompt: "a cat walking",
  createdAt: "2026-01-01T00:00:00Z",
};

const audioTask = {
  id: "aud-task-1",
  status: "pending",
  mediaType: "audio" as const,
  model: "tts-1",
  prompt: "Hello world",
  createdAt: "2026-01-01T00:00:00Z",
};

const completedTask = {
  ...imageTask,
  id: "task-done",
  status: "completed" as const,
  resultUrl: "https://cdn.example.com/image.png",
  creditsUsed: 1,
  completedAt: "2026-01-01T01:00:00Z",
};

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

function makeApp(scopes: string[] = ["media:generate"]) {
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
  app.use("/v1/media", createPublicMediaRouter());
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDeductCredits.mockResolvedValue({ success: true } as any);
  mockMediaService.generateImageAsync.mockResolvedValue(imageTask as any);
  mockMediaService.generateVideoAsync.mockResolvedValue(videoTask as any);
  mockMediaService.generateAudioAsync.mockResolvedValue(audioTask as any);
  mockMediaService.getTask.mockResolvedValue(completedTask as any);
});

// ---------------------------------------------------------------------------
// POST /v1/media/images/generate
// ---------------------------------------------------------------------------

describe("POST /v1/media/images/generate", () => {
  it("accepts prompt and returns task_id", async () => {
    const res = await request(makeApp())
      .post("/v1/media/images/generate")
      .send({ prompt: "a sunset" });
    expect(res.status).toBe(202);
    expect(res.body).toHaveProperty("task_id");
    expect(res.body.status).toBe("pending");
  });

  it("validates reference_image_urls — rejects more than 5", async () => {
    const res = await request(makeApp())
      .post("/v1/media/images/generate")
      .send({
        prompt: "a sunset",
        reference_image_urls: Array(6).fill("https://example.com/img.png"),
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_request");
  });

  it("rejects SSRF URLs — localhost", async () => {
    const res = await request(makeApp())
      .post("/v1/media/images/generate")
      .send({
        prompt: "a sunset",
        reference_image_urls: ["http://localhost/img.png"],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_request");
  });

  it("rejects SSRF URLs — 127.0.0.1", async () => {
    const res = await request(makeApp())
      .post("/v1/media/images/generate")
      .send({
        prompt: "a sunset",
        reference_image_urls: ["http://127.0.0.1/img.png"],
      });
    expect(res.status).toBe(400);
  });

  it("rejects SSRF URLs — AWS metadata endpoint", async () => {
    const res = await request(makeApp())
      .post("/v1/media/images/generate")
      .send({
        prompt: "a sunset",
        reference_image_urls: ["http://169.254.169.254/latest/meta-data/"],
      });
    expect(res.status).toBe(400);
  });

  it("accepts up to 5 valid HTTPS reference URLs", async () => {
    const res = await request(makeApp())
      .post("/v1/media/images/generate")
      .send({
        prompt: "a sunset",
        reference_image_urls: Array(5).fill("https://example.com/img.png"),
      });
    expect(res.status).toBe(202);
  });

  it("deducts credits with source type api_media", async () => {
    await request(makeApp())
      .post("/v1/media/images/generate")
      .send({ prompt: "a sunset" });
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: "api_media" }),
    );
  });

  it("requires media:generate scope", async () => {
    const res = await request(makeApp([]))
      .post("/v1/media/images/generate")
      .send({ prompt: "a sunset" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("insufficient_scopes");
  });
});

// ---------------------------------------------------------------------------
// POST /v1/media/videos/generate
// ---------------------------------------------------------------------------

describe("POST /v1/media/videos/generate", () => {
  it("accepts prompt and returns task_id", async () => {
    const res = await request(makeApp())
      .post("/v1/media/videos/generate")
      .send({ prompt: "a cat walking", duration_seconds: 5 });
    expect(res.status).toBe(202);
    expect(res.body).toHaveProperty("task_id");
  });

  it("requires media:generate scope", async () => {
    const res = await request(makeApp([]))
      .post("/v1/media/videos/generate")
      .send({ prompt: "a cat walking" });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/media/audio/generate
// ---------------------------------------------------------------------------

describe("POST /v1/media/audio/generate", () => {
  it("accepts text and returns task_id", async () => {
    const res = await request(makeApp())
      .post("/v1/media/audio/generate")
      .send({ text: "Hello world", voice: "alloy" });
    expect(res.status).toBe(202);
    expect(res.body).toHaveProperty("task_id");
  });

  it("requires media:generate scope", async () => {
    const res = await request(makeApp([]))
      .post("/v1/media/audio/generate")
      .send({ text: "Hello world" });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/media/:taskId/status
// ---------------------------------------------------------------------------

describe("GET /v1/media/:taskId/status", () => {
  it("returns task status and progress", async () => {
    const res = await request(makeApp()).get("/v1/media/task-done/status");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("task_id");
    expect(res.body).toHaveProperty("status");
    expect(res.body).toHaveProperty("progress_pct");
  });

  it("returns result_url when completed", async () => {
    const res = await request(makeApp()).get("/v1/media/task-done/status");
    expect(res.body.result_url).toBe("https://cdn.example.com/image.png");
    expect(res.body.progress_pct).toBe(100);
  });

  it("requires media:generate scope", async () => {
    const res = await request(makeApp([])).get("/v1/media/task-done/status");
    expect(res.status).toBe(403);
  });
});
