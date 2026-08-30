import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExecutorInput, RouteDecision } from "../executors/types";

vi.mock("../mediaGenerationService", () => ({
  mediaGenerationService: {
    generateImage: vi.fn(),
  },
  DEFAULT_MODELS: { image: "google-nano-banana-pro" },
}));

vi.mock("../durableMediaAssetService", () => ({
  durabilizeMediaGenerationResponse: vi.fn(async (response: unknown) => response),
}));

vi.mock("../executors/executorRegistry", () => ({
  registerExecutor: vi.fn(),
}));

import { ImageGenerationExecutor } from "../executors/imageExecutor";
import { mediaGenerationService } from "../mediaGenerationService";

const mockGenerateImage = vi.mocked(mediaGenerationService.generateImage);

function makeInput(overrides: Partial<ExecutorInput> = {}): ExecutorInput {
  return {
    messages: [
      { role: "system", content: "You are an image generator" },
      { role: "user", content: "Generate a sunset image" },
    ],
    executionPolicy: {},
    skill: { id: "img-skill", name: "Image Skill" } as any,
    skillSlug: "image-generator",
    userId: 1,
    tenantId: "tenant-1",
    channel: "chat",
    ...overrides,
  };
}

const successResponse = {
  success: true,
  data: [{ id: "img-1", url: "https://cdn.example.com/img1.png" }],
  creditsUsed: 10,
  creditsBalance: 90,
  model: "flux-2.0",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGenerateImage.mockResolvedValue(successResponse as any);
});

describe("ImageGenerationExecutor", () => {
  const executor = new ImageGenerationExecutor();

  it("has correct id", () => {
    expect(executor.id).toBe("image-generation");
  });

  it("capabilities contains exactly media.image", () => {
    expect(executor.capabilities).toEqual(["media.image"]);
  });

  describe("canHandle", () => {
    it("returns true for media.image capability", () => {
      const route: RouteDecision = { capability: "media.image", executorId: "image-generation", reason: "test" };
      expect(executor.canHandle(route)).toBe(true);
    });

    it("returns false for writing.article", () => {
      const route: RouteDecision = { capability: "writing.article", executorId: "test", reason: "test" };
      expect(executor.canHandle(route)).toBe(false);
    });

    it("returns false for media.video", () => {
      const route: RouteDecision = { capability: "media.video", executorId: "test", reason: "test" };
      expect(executor.canHandle(route)).toBe(false);
    });

    it("channel does not affect canHandle", () => {
      const chatRoute: RouteDecision = { capability: "media.image", executorId: "test", reason: "chat" };
      const teamRoute: RouteDecision = { capability: "media.image", executorId: "test", reason: "team_room" };
      expect(executor.canHandle(chatRoute)).toBe(true);
      expect(executor.canHandle(teamRoute)).toBe(true);
    });
  });

  describe("execute", () => {
    it("extracts prompt from last user message", async () => {
      await executor.execute(makeInput());

      expect(mockGenerateImage).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: "Generate a sunset image" }),
        expect.any(String),
      );
    });

    it("extracts image params from dynamicParams", async () => {
      const input = makeInput({
        dynamicParams: { model: "flux-2.0", aspectRatio: "16:9", numImages: 2 },
      });

      await executor.execute(input);

      expect(mockGenerateImage).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "flux-2.0",
          aspectRatio: "16:9",
          numImages: 2,
        }),
        expect.any(String),
      );
    });

    it("resolves model from executionPolicy when not in dynamicParams", async () => {
      const input = makeInput({
        executionPolicy: { defaultModel: "google-banana-2" },
      });

      await executor.execute(input);

      expect(mockGenerateImage).toHaveBeenCalledWith(
        expect.objectContaining({ model: "google-banana-2" }),
        expect.any(String),
      );
    });

    it("passes reference image URLs from dynamicParams", async () => {
      const input = makeInput({
        dynamicParams: { referenceImageUrls: ["https://example.com/ref.jpg"] },
      });

      await executor.execute(input);

      expect(mockGenerateImage).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceImageUrls: ["https://example.com/ref.jpg"],
        }),
        expect.any(String),
      );
    });

    it("returns media_job result with job payload on success", async () => {
      const result = await executor.execute(makeInput());

      expect(result.success).toBe(true);
      expect(result.mediaJob).toBeDefined();
      expect(result.mediaJob!.mediaType).toBe("image");
      expect(result.mediaJob!.jobPayload).toEqual({
        data: successResponse.data,
        model: "flux-2.0",
        creditsUsed: 10,
      });
      expect(result.modelUsed).toBe("flux-2.0");
      expect(result.inputTokens).toBe(0);
      expect(result.outputTokens).toBe(0);
    });

    it("handles dispatch failure gracefully", async () => {
      mockGenerateImage.mockRejectedValue(new Error("Provider unavailable"));

      const result = await executor.execute(makeInput());

      expect(result.success).toBe(false);
      // Error is sanitized — no raw provider details exposed
      expect(result.error).toBe("media_generation_failed");
      expect(result.mediaJob).toBeUndefined();
    });

    it("passes auditContext with traceId when present", async () => {
      const input = makeInput({ traceId: "trace-img-123" });
      await executor.execute(input);

      expect(mockGenerateImage).toHaveBeenCalledWith(
        expect.objectContaining({
          auditContext: expect.objectContaining({ traceId: "trace-img-123" }),
        }),
        expect.any(String),
      );
    });

    it("passes server-generated token from __serverUserToken", async () => {
      const input = makeInput({
        dynamicParams: { __serverUserToken: "server-tok-123" },
      });
      await executor.execute(input);

      expect(mockGenerateImage).toHaveBeenCalledWith(
        expect.any(Object),
        "server-tok-123",
      );
    });
  });
});
