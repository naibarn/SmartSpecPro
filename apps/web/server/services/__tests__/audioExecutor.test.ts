import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExecutorInput, RouteDecision } from "../executors/types";

vi.mock("../mediaGenerationService", () => ({
  mediaGenerationService: {
    generateAudioAsync: vi.fn(),
  },
  DEFAULT_MODELS: { audio: "elevenlabs-tts" },
}));

vi.mock("../executors/executorRegistry", () => ({
  registerExecutor: vi.fn(),
}));

import { AudioGenerationExecutor } from "../executors/audioExecutor";
import { mediaGenerationService } from "../mediaGenerationService";

const mockGenerateAudio = vi.mocked(mediaGenerationService.generateAudioAsync);

function makeInput(overrides: Partial<ExecutorInput> = {}): ExecutorInput {
  return {
    messages: [
      { role: "system", content: "You are an audio generator" },
      { role: "user", content: "Read this aloud" },
    ],
    executionPolicy: {},
    skill: { id: "audio-skill", name: "Audio Skill" } as any,
    skillSlug: "audio-generator",
    userId: 1,
    channel: "chat",
    ...overrides,
  };
}

const stubTask = {
  id: "task-789",
  userId: "1",
  mediaType: "audio",
  status: "pending",
  model: "elevenlabs-tts",
  prompt: "Read this aloud",
  createdAt: "2026-03-21T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGenerateAudio.mockResolvedValue(stubTask as any);
});

describe("AudioGenerationExecutor", () => {
  const executor = new AudioGenerationExecutor();

  it("has correct id", () => {
    expect(executor.id).toBe("audio-generation");
  });

  it("capabilities include only media.audio", () => {
    expect(executor.capabilities).toEqual(["media.audio"]);
  });

  describe("canHandle", () => {
    it("returns true for media.audio", () => {
      const route: RouteDecision = { capability: "media.audio", executorId: "test", reason: "test" };
      expect(executor.canHandle(route)).toBe(true);
    });

    it("returns false for media.video", () => {
      const route: RouteDecision = { capability: "media.video", executorId: "test", reason: "test" };
      expect(executor.canHandle(route)).toBe(false);
    });
  });

  describe("execute", () => {
    it("extracts audio params from dynamicParams", async () => {
      const input = makeInput({
        dynamicParams: { model: "openai-tts-1", voice: "alloy", speed: 1.5 },
      });

      await executor.execute(input);

      expect(mockGenerateAudio).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "openai-tts-1",
          voice: "alloy",
          speed: 1.5,
        }),
        expect.any(String),
      );
    });

    it("uses text from user message when dynamicParams.text is absent", async () => {
      await executor.execute(makeInput());

      expect(mockGenerateAudio).toHaveBeenCalledWith(
        expect.objectContaining({ text: "Read this aloud" }),
        expect.any(String),
      );
    });

    it("prefers dynamicParams.text over user message", async () => {
      const input = makeInput({
        dynamicParams: { text: "Custom text to speak" },
      });

      await executor.execute(input);

      expect(mockGenerateAudio).toHaveBeenCalledWith(
        expect.objectContaining({ text: "Custom text to speak" }),
        expect.any(String),
      );
    });

    it("returns media_job result with mediaType audio on success", async () => {
      const result = await executor.execute(makeInput());

      expect(result.success).toBe(true);
      expect(result.mediaJob).toBeDefined();
      expect(result.mediaJob!.mediaType).toBe("audio");
      expect(result.mediaJob!.jobPayload).toEqual(stubTask);
      expect(result.modelUsed).toBe("elevenlabs-tts");
      expect(result.inputTokens).toBe(0);
      expect(result.outputTokens).toBe(0);
    });

    it("handles dispatch failure gracefully", async () => {
      mockGenerateAudio.mockRejectedValue(new Error("TTS service down"));

      const result = await executor.execute(makeInput());

      expect(result.success).toBe(false);
      expect(result.error).toBe("media_generation_failed");
      expect(result.mediaJob).toBeUndefined();
    });

    it("passes auditContext with traceId", async () => {
      const input = makeInput({ traceId: "trace-xyz" });
      await executor.execute(input);

      expect(mockGenerateAudio).toHaveBeenCalledWith(
        expect.objectContaining({
          auditContext: expect.objectContaining({ traceId: "trace-xyz" }),
        }),
        expect.any(String),
      );
    });
  });
});
