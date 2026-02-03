import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockExecuteWithFallback,
  mockDeductCreditsForModel,
  mockIsModelFree,
  mockLogRequest,
} = vi.hoisted(() => ({
  mockExecuteWithFallback: vi.fn(),
  mockDeductCreditsForModel: vi.fn(),
  mockIsModelFree: vi.fn(),
  mockLogRequest: vi.fn(),
}));

vi.mock("./services/llmRouter", () => ({
  executeWithFallback: mockExecuteWithFallback,
}));

vi.mock("./services/creditService", () => ({
  isModelFree: mockIsModelFree,
  deductCreditsForModel: mockDeductCreditsForModel,
  calculateCreditsForLLM: vi.fn().mockReturnValue(1),
  calculateCreditsFromCost: vi.fn().mockReturnValue(1),
  hasEnoughCredits: vi.fn().mockResolvedValue(true),
  getCreditBalance: vi.fn().mockResolvedValue({ credits: 100, plan: "free" }),
}));

vi.mock("./services/costTracker", () => ({
  logRequest: mockLogRequest.mockResolvedValue(undefined),
}));

import {
  handleChatWithRouter,
  handleStreamWithRouter,
} from "./services/llmRoutesHandler";

beforeEach(() => {
  vi.clearAllMocks();
  mockIsModelFree.mockResolvedValue(false);
  mockDeductCreditsForModel.mockResolvedValue({ creditsUsed: 1, wasFree: false });
});

// --- Mock Express helpers ---

function mockRes() {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    type: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    write: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  };
  return res;
}

// --- JSON Endpoint ---

describe("handleChatWithRouter", () => {
  it("returns JSON response on success", async () => {
    const responseData = { choices: [{ message: { content: "Hello" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
    mockExecuteWithFallback.mockResolvedValue({ type: "success", response: responseData, providerId: 1 });

    const res = mockRes();
    await handleChatWithRouter({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      userId: 1,
      res,
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ choices: expect.any(Array) }));
  });

  it("returns fallback_required JSON when tier crossing", async () => {
    mockExecuteWithFallback.mockResolvedValue({
      type: "fallback_required",
      from: { providerId: 1, providerName: "zen" },
      to: { providerId: 2, providerName: "openrouter" },
      estimatedCredits: 42,
    });

    const res = mockRes();
    await handleChatWithRouter({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      userId: 1,
      res,
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ fallbackRequired: true, estimatedCredits: 42 })
    );
  });

  it("preferredProvider is passed through to executeWithFallback", async () => {
    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: { choices: [{ message: { content: "OK" } }] },
      providerId: 5,
    });

    const res = mockRes();
    await handleChatWithRouter({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      userId: 1,
      preferredProvider: 5,
      res,
    });

    expect(mockExecuteWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({ preferredProvider: 5 })
    );
  });

  it("returns error on failure", async () => {
    mockExecuteWithFallback.mockResolvedValue({ type: "error", error: "All down", statusCode: 502 });

    const res = mockRes();
    await handleChatWithRouter({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      userId: 1,
      res,
    });

    expect(res.status).toHaveBeenCalledWith(502);
  });

  it("credit deduction called after success", async () => {
    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: { choices: [{ message: { content: "Hello" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } },
      providerId: 1,
    });

    const res = mockRes();
    await handleChatWithRouter({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      userId: 1,
      res,
    });

    expect(mockDeductCreditsForModel).toHaveBeenCalled();
  });

  it("free model deduction is 0 credits", async () => {
    mockIsModelFree.mockResolvedValue(true);
    mockDeductCreditsForModel.mockResolvedValue({ creditsUsed: 0, wasFree: true });
    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: { choices: [{ message: { content: "Hello" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } },
      providerId: 1,
    });

    const res = mockRes();
    await handleChatWithRouter({
      model: "kimi-k2.5",
      messages: [{ role: "user", content: "Hi" }],
      userId: 1,
      res,
    });

    expect(mockDeductCreditsForModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: "kimi-k2.5" })
    );
  });
});

// --- Streaming Endpoint ---

describe("handleStreamWithRouter", () => {
  it("returns SSE event: fallback_required when tier crossing", async () => {
    mockExecuteWithFallback.mockResolvedValue({
      type: "fallback_required",
      from: { providerId: 1, providerName: "zen" },
      to: { providerId: 2, providerName: "openrouter" },
      estimatedCredits: 42,
    });

    const res = mockRes();
    await handleStreamWithRouter({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      userId: 1,
      res,
    });

    expect(res.write).toHaveBeenCalledWith(expect.stringContaining("event: fallback_required"));
  });

  it("returns error SSE event on failure", async () => {
    mockExecuteWithFallback.mockResolvedValue({ type: "error", error: "All down", statusCode: 502 });

    const res = mockRes();
    await handleStreamWithRouter({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      userId: 1,
      res,
    });

    expect(res.write).toHaveBeenCalledWith(expect.stringContaining("error"));
    expect(res.end).toHaveBeenCalled();
  });
});
