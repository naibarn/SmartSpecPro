import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const { mockExecuteWithFallback, mockDeductCreditsForModel } = vi.hoisted(
  () => ({
    mockExecuteWithFallback: vi.fn(),
    mockDeductCreditsForModel: vi.fn(),
  }),
);

vi.mock("../llmRouter", () => ({
  executeWithFallback: mockExecuteWithFallback,
}));

vi.mock("../creditService", () => ({
  deductCreditsForModel: mockDeductCreditsForModel,
}));

vi.mock("../auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

import {
  callLLMStructured,
  LLMStructuredOutputError,
} from "../callLLMStructured";

// A simple Zod schema for testing
const TestSchema = z.object({
  title: z.string(),
  items: z.array(z.string()),
});

beforeEach(() => {
  vi.clearAllMocks();
  mockDeductCreditsForModel.mockResolvedValue({
    creditsUsed: 5,
    wasFree: false,
  });
});

// --- Helpers ---

function makeSuccessResponse(content: string) {
  return {
    type: "success" as const,
    response: {
      choices: [{ message: { content } }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      },
    },
    providerId: 1,
    providerName: "test-provider",
  };
}

const baseParams = {
  systemPrompt: "You are a helpful assistant.",
  userMessage: "Generate a list",
  zodSchema: TestSchema,
  userId: 42,
  tenantId: "tenant-1",
};

describe("callLLMStructured", () => {
  it("returns parsed data when LLM returns valid JSON matching Zod schema", async () => {
    const validJson = JSON.stringify({
      title: "My List",
      items: ["one", "two"],
    });
    mockExecuteWithFallback.mockResolvedValue(makeSuccessResponse(validJson));

    const result = await callLLMStructured(baseParams);

    expect(result.data).toEqual({ title: "My List", items: ["one", "two"] });
  });

  it("extracts tokensUsed and creditsUsed from response metadata", async () => {
    const validJson = JSON.stringify({ title: "Test", items: ["a"] });
    mockExecuteWithFallback.mockResolvedValue(makeSuccessResponse(validJson));
    mockDeductCreditsForModel.mockResolvedValue({
      creditsUsed: 10,
      wasFree: false,
    });

    const result = await callLLMStructured(baseParams);

    expect(result.tokensUsed).toBe(150); // 100 + 50
    expect(result.creditsUsed).toBe(10);
  });

  it("retries once when first response is invalid JSON, succeeds on retry", async () => {
    const validJson = JSON.stringify({ title: "OK", items: ["x"] });
    mockExecuteWithFallback
      .mockResolvedValueOnce(makeSuccessResponse("not valid json {{{"))
      .mockResolvedValueOnce(makeSuccessResponse(validJson));

    const result = await callLLMStructured(baseParams);

    expect(result.data).toEqual({ title: "OK", items: ["x"] });
    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(2);

    // Verify retry message includes error context
    const retryCall = mockExecuteWithFallback.mock.calls[1][0];
    const userMsg = retryCall.messages.find(
      (m: { role: string }) => m.role === "user",
    );
    expect(userMsg.content).toContain("JSON");
  });

  it("retries once when first response fails Zod validation, succeeds on retry", async () => {
    // Missing 'items' field
    const invalidShape = JSON.stringify({ title: "Missing items" });
    const validJson = JSON.stringify({
      title: "Complete",
      items: ["item1"],
    });
    mockExecuteWithFallback
      .mockResolvedValueOnce(makeSuccessResponse(invalidShape))
      .mockResolvedValueOnce(makeSuccessResponse(validJson));

    const result = await callLLMStructured(baseParams);

    expect(result.data).toEqual({ title: "Complete", items: ["item1"] });
    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(2);
  });

  it("throws after retry when both attempts return invalid JSON", async () => {
    mockExecuteWithFallback
      .mockResolvedValueOnce(makeSuccessResponse("not json"))
      .mockResolvedValueOnce(makeSuccessResponse("still not json"));

    await expect(callLLMStructured(baseParams)).rejects.toThrow(
      LLMStructuredOutputError,
    );
    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(2);
  });

  it("throws after retry when both attempts fail Zod validation", async () => {
    const wrongShape = JSON.stringify({ wrong: "shape" });
    mockExecuteWithFallback
      .mockResolvedValueOnce(makeSuccessResponse(wrongShape))
      .mockResolvedValueOnce(makeSuccessResponse(wrongShape));

    await expect(callLLMStructured(baseParams)).rejects.toThrow(
      LLMStructuredOutputError,
    );
  });

  it("passes systemPrompt with JSON instructions appended to messages", async () => {
    const validJson = JSON.stringify({ title: "Test", items: ["a"] });
    mockExecuteWithFallback.mockResolvedValue(makeSuccessResponse(validJson));

    await callLLMStructured(baseParams);

    const call = mockExecuteWithFallback.mock.calls[0][0];
    const systemMsg = call.messages.find(
      (m: { role: string }) => m.role === "system",
    );
    expect(systemMsg.content).toContain("You are a helpful assistant.");
    expect(systemMsg.content).toContain("JSON");
  });

  it("passes userId to executeWithFallback", async () => {
    const validJson = JSON.stringify({ title: "Test", items: ["a"] });
    mockExecuteWithFallback.mockResolvedValue(makeSuccessResponse(validJson));

    await callLLMStructured(baseParams);

    const call = mockExecuteWithFallback.mock.calls[0][0];
    expect(call.userId).toBe(42);
  });

  it("uses default model when model param is omitted", async () => {
    const validJson = JSON.stringify({ title: "Test", items: ["a"] });
    mockExecuteWithFallback.mockResolvedValue(makeSuccessResponse(validJson));

    await callLLMStructured(baseParams);

    const call = mockExecuteWithFallback.mock.calls[0][0];
    expect(call.model).toBe("claude-sonnet-4-6");
  });

  it("propagates executeWithFallback errors without wrapping", async () => {
    mockExecuteWithFallback.mockResolvedValue({
      type: "error",
      error: "Provider unavailable",
      statusCode: 503,
    });

    const err = await callLLMStructured(baseParams).catch((e) => e);
    expect(err.message).toBe("Provider unavailable");
    expect(err).not.toBeInstanceOf(LLMStructuredOutputError);
  });

  it("strips markdown fences from LLM response before parsing", async () => {
    const fenced = '```json\n{"title": "Fenced", "items": ["a"]}\n```';
    mockExecuteWithFallback.mockResolvedValue(makeSuccessResponse(fenced));

    const result = await callLLMStructured(baseParams);

    expect(result.data).toEqual({ title: "Fenced", items: ["a"] });
  });

  it("attaches tokensUsed and creditsUsed to error on failure", async () => {
    mockExecuteWithFallback
      .mockResolvedValueOnce(makeSuccessResponse("bad json"))
      .mockResolvedValueOnce(makeSuccessResponse("still bad"));

    const err = await callLLMStructured(baseParams).catch((e) => e);
    expect(err).toBeInstanceOf(LLMStructuredOutputError);
    expect(err.tokensUsed).toBe(300); // 150 * 2 attempts
    expect(err.creditsUsed).toBe(10); // 5 * 2 attempts
  });

  it("handles maxRetries=0 to disable retry", async () => {
    mockExecuteWithFallback.mockResolvedValue(
      makeSuccessResponse("not json"),
    );

    await expect(
      callLLMStructured({ ...baseParams, maxRetries: 0 }),
    ).rejects.toThrow(LLMStructuredOutputError);

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(1);
  });
});
