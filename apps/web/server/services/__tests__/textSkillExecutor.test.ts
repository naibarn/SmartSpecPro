import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../skillModelFallback", () => ({
  executeSkillLlmWithFallback: vi.fn(),
}));

// Must mock the registry to prevent self-registration side effects
vi.mock("../executors/executorRegistry", () => ({
  registerExecutor: vi.fn(),
}));

import {
  TextSkillExecutor,
  parseNextSpeakerHint,
} from "../executors/textSkillExecutor";
import { executeSkillLlmWithFallback } from "../skillModelFallback";
import type { ExecutorInput, RouteDecision } from "../executors/types";

const mockExecuteLlm = vi.mocked(executeSkillLlmWithFallback);

function makeInput(overrides: Partial<ExecutorInput> = {}): ExecutorInput {
  return {
    messages: [
      { role: "system", content: "You are helpful" },
      { role: "user", content: "Hello" },
    ],
    executionPolicy: { modelId: "gpt-4o", allowFreeModels: false },
    skill: { id: "skill-1", name: "Test Skill" } as any,
    skillSlug: "test-skill",
    userId: 1,
    channel: "chat",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TextSkillExecutor", () => {
  const executor = new TextSkillExecutor();

  describe("canHandle", () => {
    it("returns true for writing.article capability", () => {
      const route: RouteDecision = {
        capability: "writing.article",
        executorId: "text-skill-executor",
        reason: "test",
      };
      expect(executor.canHandle(route)).toBe(true);
    });

    it("returns true for writing.review capability", () => {
      const route: RouteDecision = {
        capability: "writing.review",
        executorId: "text-skill-executor",
        reason: "test",
      };
      expect(executor.canHandle(route)).toBe(true);
    });

    it("returns false for media.image capability", () => {
      const route: RouteDecision = {
        capability: "media.image",
        executorId: "text-skill-executor",
        reason: "test",
      };
      expect(executor.canHandle(route)).toBe(false);
    });
  });

  describe("execute", () => {
    it("calls executeSkillLlmWithFallback with provided messages and policy", async () => {
      mockExecuteLlm.mockResolvedValue({
        success: true,
        content: "Generated text",
        modelId: "gpt-4o",
        inputTokens: 100,
        outputTokens: 50,
        attempts: [{ attempt: 1, modelId: "gpt-4o", success: true, durationMs: 500 }],
        totalDurationMs: 500,
      });

      const input = makeInput();
      await executor.execute(input);

      expect(mockExecuteLlm).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: input.messages,
          skillSlug: "test-skill",
          userId: 1,
        }),
      );
    });

    it("dynamicModelOverride overrides policy modelId", async () => {
      mockExecuteLlm.mockResolvedValue({
        success: true,
        content: "text",
        modelId: "gemini-pro",
        inputTokens: 10,
        outputTokens: 5,
        attempts: [],
        totalDurationMs: 200,
      });

      const input = makeInput({
        dynamicModelOverride: "gemini-pro",
        executionPolicy: { modelId: "gpt-4o", allowFreeModels: false },
      });
      await executor.execute(input);

      expect(mockExecuteLlm).toHaveBeenCalledWith(
        expect.objectContaining({
          executionPolicy: expect.objectContaining({ modelId: "gemini-pro" }),
        }),
      );
    });

    it("uses policy modelId when no override", async () => {
      mockExecuteLlm.mockResolvedValue({
        success: true,
        content: "text",
        modelId: "gpt-4o",
        inputTokens: 10,
        outputTokens: 5,
        attempts: [],
        totalDurationMs: 200,
      });

      const input = makeInput({
        executionPolicy: { modelId: "gpt-4o", allowFreeModels: false },
      });
      await executor.execute(input);

      expect(mockExecuteLlm).toHaveBeenCalledWith(
        expect.objectContaining({
          executionPolicy: expect.objectContaining({ modelId: "gpt-4o" }),
        }),
      );
    });

    it("enables thinking mode when input.enableThinking is true", async () => {
      mockExecuteLlm.mockResolvedValue({
        success: true,
        content: "text",
        modelId: "gpt-4o",
        inputTokens: 10,
        outputTokens: 5,
        attempts: [],
        totalDurationMs: 200,
      });

      const input = makeInput({ enableThinking: true });
      await executor.execute(input);

      expect(mockExecuteLlm).toHaveBeenCalledWith(
        expect.objectContaining({ enableThinking: true }),
      );
    });

    it("passes extraBodyParams (web search tools) to LLM call", async () => {
      mockExecuteLlm.mockResolvedValue({
        success: true,
        content: "text",
        modelId: "gpt-4o",
        inputTokens: 10,
        outputTokens: 5,
        attempts: [],
        totalDurationMs: 200,
      });

      const input = makeInput({
        extraBodyParams: { tools: [{ type: "web_search_preview" }] },
      });
      await executor.execute(input);

      expect(mockExecuteLlm).toHaveBeenCalledWith(
        expect.objectContaining({
          extraBodyParams: { tools: [{ type: "web_search_preview" }] },
        }),
      );
    });

    it("parses next-speaker hint from output when present", async () => {
      mockExecuteLlm.mockResolvedValue({
        success: true,
        content: "Here is my response [NEXT: designer-agent]",
        modelId: "gpt-4o",
        inputTokens: 10,
        outputTokens: 5,
        attempts: [],
        totalDurationMs: 200,
      });

      const input = makeInput();
      const result = await executor.execute(input);

      expect(result.nextSpeakerHint).toBe("designer-agent");
      expect(result.content).toBe("Here is my response");
    });

    it("returns content unchanged when no next-speaker hint", async () => {
      mockExecuteLlm.mockResolvedValue({
        success: true,
        content: "Plain response without hints",
        modelId: "gpt-4o",
        inputTokens: 10,
        outputTokens: 5,
        attempts: [],
        totalDurationMs: 200,
      });

      const input = makeInput();
      const result = await executor.execute(input);

      expect(result.content).toBe("Plain response without hints");
      expect(result.nextSpeakerHint).toBeUndefined();
    });

    it("returns raw content, token counts, model used, fallback attempts", async () => {
      const attempts = [
        { attempt: 1, modelId: "gpt-4o-mini", success: false, durationMs: 100, error: "rate limited" },
        { attempt: 2, modelId: "gpt-4o", success: true, durationMs: 500 },
      ];
      mockExecuteLlm.mockResolvedValue({
        success: true,
        content: "Result",
        modelId: "gpt-4o",
        inputTokens: 150,
        outputTokens: 75,
        attempts,
        totalDurationMs: 600,
      });

      const input = makeInput();
      const result = await executor.execute(input);

      expect(result.success).toBe(true);
      expect(result.content).toBe("Result");
      expect(result.inputTokens).toBe(150);
      expect(result.outputTokens).toBe(75);
      expect(result.modelUsed).toBe("gpt-4o");
      expect(result.attempts).toEqual(attempts);
      expect(result.totalDurationMs).toBe(600);
    });

    it("handles LLM failure gracefully (returns error result, not throw)", async () => {
      mockExecuteLlm.mockResolvedValue({
        success: false,
        error: "All models exhausted",
        attempts: [{ attempt: 1, modelId: "gpt-4o", success: false, durationMs: 100, error: "timeout" }],
        totalDurationMs: 100,
      });

      const input = makeInput();
      const result = await executor.execute(input);

      expect(result.success).toBe(false);
      expect(result.error).toBe("All models exhausted");
      expect(result.content).toBeUndefined();
    });

    it("multimodal messages passed through correctly", async () => {
      mockExecuteLlm.mockResolvedValue({
        success: true,
        content: "Analyzed the image",
        modelId: "gpt-4o",
        inputTokens: 200,
        outputTokens: 30,
        attempts: [],
        totalDurationMs: 300,
      });

      const input = makeInput({
        messages: [
          { role: "system", content: "Analyze images" },
          {
            role: "user",
            content: [
              { type: "text", text: "What is this?" },
              { type: "image_url", image_url: { url: "https://example.com/img.png" } },
            ],
          },
        ],
      });
      const result = await executor.execute(input);

      expect(mockExecuteLlm).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: input.messages,
        }),
      );
      expect(result.success).toBe(true);
    });
  });

  describe("parseNextSpeakerHint", () => {
    it("extracts hint from [NEXT: agent-name] tag", () => {
      const result = parseNextSpeakerHint("Done [NEXT: writer-agent]");
      expect(result.hint).toBe("writer-agent");
    });

    it("case-insensitive match", () => {
      const result = parseNextSpeakerHint("Done [next: Writer]");
      expect(result.hint).toBe("Writer");
    });

    it("trims whitespace from hint", () => {
      const result = parseNextSpeakerHint("Done [NEXT:  agent-name  ]");
      expect(result.hint).toBe("agent-name");
    });

    it("removes tag from content", () => {
      const result = parseNextSpeakerHint("Response text [NEXT: agent]");
      expect(result.cleaned).toBe("Response text");
    });

    it("returns original content when no tag present", () => {
      const result = parseNextSpeakerHint("No special tags here");
      expect(result.cleaned).toBe("No special tags here");
      expect(result.hint).toBeUndefined();
    });
  });
});
