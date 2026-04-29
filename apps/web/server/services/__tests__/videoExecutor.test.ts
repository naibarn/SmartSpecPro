import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExecutorInput, RouteDecision } from "../executors/types";

vi.mock("../mediaGenerationService", () => ({
  mediaGenerationService: {
    generateVideoAsync: vi.fn(),
  },
  DEFAULT_MODELS: { video: "veo-3-1" },
}));

vi.mock("../executors/executorRegistry", () => ({
  registerExecutor: vi.fn(),
}));

import { VideoGenerationExecutor } from "../executors/videoExecutor";
import { mediaGenerationService } from "../mediaGenerationService";

const mockGenerateVideo = vi.mocked(mediaGenerationService.generateVideoAsync);

function makeInput(overrides: Partial<ExecutorInput> = {}): ExecutorInput {
  return {
    messages: [
      { role: "system", content: "You are a video generator" },
      { role: "user", content: "Generate a video of a sunset" },
    ],
    executionPolicy: {},
    skill: { id: "vid-skill", name: "Video Skill" } as any,
    skillSlug: "video-generator",
    userId: 1,
    channel: "chat",
    ...overrides,
  };
}

const stubTask = {
  id: "task-123",
  taskId: "ext-456",
  userId: "1",
  mediaType: "video",
  status: "pending",
  model: "veo-3-1",
  prompt: "sunset video",
  createdAt: "2026-03-21T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGenerateVideo.mockResolvedValue(stubTask as any);
});

describe("VideoGenerationExecutor", () => {
  const executor = new VideoGenerationExecutor();

  it("has correct id", () => {
    expect(executor.id).toBe("video-generation");
  });

  it("capabilities include only media.video", () => {
    expect(executor.capabilities).toEqual(["media.video"]);
  });

  describe("canHandle", () => {
    it("returns true for media.video", () => {
      const route: RouteDecision = { capability: "media.video", executorId: "test", reason: "test" };
      expect(executor.canHandle(route)).toBe(true);
    });

    it("returns false for media.image", () => {
      const route: RouteDecision = { capability: "media.image", executorId: "test", reason: "test" };
      expect(executor.canHandle(route)).toBe(false);
    });

    it("returns false for writing.article", () => {
      const route: RouteDecision = { capability: "writing.article", executorId: "test", reason: "test" };
      expect(executor.canHandle(route)).toBe(false);
    });
  });

  describe("execute", () => {
    it("extracts prompt from user message", async () => {
      await executor.execute(makeInput());

      expect(mockGenerateVideo).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: "Generate a video of a sunset" }),
        expect.any(String),
      );
    });

    it("extracts video params from dynamicParams", async () => {
      const input = makeInput({
        dynamicParams: {
          model: "veo-3-1",
          duration: 10,
          aspectRatio: "16:9",
          fps: 30,
          resolution: "1080p",
          referenceImageUrls: ["https://example.com/ref.jpg"],
          referenceVideoUrl: "https://example.com/vid.mp4",
        },
      });

      await executor.execute(input);

      expect(mockGenerateVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "veo-3-1",
          duration: 10,
          aspectRatio: "16:9",
          fps: 30,
          resolution: "1080p",
          referenceImageUrls: ["https://example.com/ref.jpg"],
          referenceVideoUrl: "https://example.com/vid.mp4",
        }),
        expect.any(String),
      );
    });

    it("returns media_job result with mediaType video on success", async () => {
      const result = await executor.execute(makeInput());

      expect(result.success).toBe(true);
      expect(result.mediaJob).toBeDefined();
      expect(result.mediaJob!.mediaType).toBe("video");
      expect(result.mediaJob!.jobPayload).toEqual(stubTask);
      expect(result.modelUsed).toBe("veo-3-1");
      expect(result.inputTokens).toBe(0);
      expect(result.outputTokens).toBe(0);
    });

    it("handles dispatch failure gracefully", async () => {
      mockGenerateVideo.mockRejectedValue(new Error("Provider unavailable"));

      const result = await executor.execute(makeInput());

      expect(result.success).toBe(false);
      expect(result.error).toBe("media_generation_failed");
      expect(result.mediaJob).toBeUndefined();
    });

    it("classifies missing provider configuration as a non-generic media error", async () => {
      mockGenerateVideo.mockRejectedValue(
        new Error("503: KNPLabs not configured. Please add API key in Admin > Media Providers."),
      );

      const result = await executor.execute(makeInput());

      expect(result.success).toBe(false);
      expect(result.error).toBe("media_provider_not_configured");
      expect(result.mediaJob).toBeUndefined();
    });

    it("passes publicUrl from dynamicParams", async () => {
      const input = makeInput({ dynamicParams: { publicUrl: "https://smartaihub.app" } });
      await executor.execute(input);

      expect(mockGenerateVideo).toHaveBeenCalledWith(
        expect.objectContaining({ publicUrl: "https://smartaihub.app" }),
        expect.any(String),
      );
    });

    it("passes auditContext with traceId", async () => {
      const input = makeInput({ traceId: "trace-abc" });
      await executor.execute(input);

      expect(mockGenerateVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          auditContext: expect.objectContaining({ traceId: "trace-abc" }),
        }),
        expect.any(String),
      );
    });
  });
});
