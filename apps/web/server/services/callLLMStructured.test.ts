/**
 * Tests for callLLMStructured.ts planner wiring
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("./llmRouter", () => ({
  executeWithFallback: vi.fn(),
  resolveProviders: vi.fn(),
}));
vi.mock("./creditService", () => ({
  deductCreditsForModel: vi.fn(),
}));
vi.mock("./auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));
vi.mock("./taskPlannerMiddleware", () => ({
  runPlanner: vi.fn(),
  recordStepAttempt: vi.fn(),
}));
vi.mock("./chatModelSelection", () => ({
  resolveStructuredAutoChatModelSelection: vi.fn(),
}));

import { callLLMStructured } from "./callLLMStructured";
import { executeWithFallback } from "./llmRouter";
import { deductCreditsForModel } from "./creditService";
import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";
import { resolveStructuredAutoChatModelSelection } from "./chatModelSelection";
import { z } from "zod";

const mockExecuteWithFallback = vi.mocked(executeWithFallback);
const mockDeductCredits = vi.mocked(deductCreditsForModel);
const mockRunPlanner = vi.mocked(runPlanner);
const mockRecordStepAttempt = vi.mocked(recordStepAttempt);
const mockResolveStructuredAutoChatModelSelection = vi.mocked(
  resolveStructuredAutoChatModelSelection,
);

const testSchema = z.object({ name: z.string() });

const baseParams = {
  systemPrompt: "You are a test.",
  userMessage: "Test",
  zodSchema: testSchema,
  userId: 1,
  tenantId: "tenant-1",
};

const fakePlan = {
  version: 1 as const,
  taskType: "chat" as const,
  complexity: "simple" as const,
  requirements: {},
  strategy: "fastest" as const,
  createdAt: "2026-01-01T00:00:00Z",
};

const fakePlannerResult = {
  taskRunId: 42,
  plan: fakePlan,
  resolvedModel: "qwen-cheap",
  snapshot: null,
  plannerLatencyMs: 5,
};

function setupSuccessfulLLMResponse(content = '{"name": "test"}') {
  mockExecuteWithFallback.mockResolvedValue({
    type: "success" as const,
    response: {
      choices: [{ message: { content }, index: 0, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    },
    providerName: "openai",
    providerId: 1,
  } as any);
  mockDeductCredits.mockResolvedValue({ creditsUsed: 5 });
}

describe("callLLMStructured planner wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveStructuredAutoChatModelSelection.mockResolvedValue({
      selectionMode: "auto-global",
      selection: { mode: "auto-global" },
      requestedModelId: null,
      resolvedModelId: "openai/gpt-4.1-mini",
      resolvedProviderId: 1,
      resolvedProviderName: "openrouter",
      preferredProviderId: 1,
      strictProviderPin: false,
      routeFamily: "chat-completions",
      requirements: { supportsStructuredOutputs: true },
      continuityApplied: false,
      shouldPersistSelectionState: false,
    });
  });

  it("runs planner once before the retry loop", async () => {
    mockRunPlanner.mockResolvedValue(fakePlannerResult);
    mockRecordStepAttempt.mockResolvedValue(undefined);
    setupSuccessfulLLMResponse();

    await callLLMStructured(baseParams);

    expect(mockRunPlanner).toHaveBeenCalledTimes(1);
    expect(mockRunPlanner).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "chat",
        userId: 1,
        tenantId: "tenant-1",
        executionPolicy: expect.objectContaining({
          requirements: expect.objectContaining({
            supportsStructuredOutputs: true,
          }),
        }),
      }),
    );
  });

  it("keeps the caller-selected model even when planner resolves a different model", async () => {
    mockRunPlanner.mockResolvedValue({ ...fakePlannerResult, resolvedModel: "qwen-cheap" });
    mockRecordStepAttempt.mockResolvedValue(undefined);
    setupSuccessfulLLMResponse();

    await callLLMStructured({ ...baseParams, model: "claude-sonnet-4-6" });

    expect(mockExecuteWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-sonnet-4-6" }),
    );
  });

  it("uses original model when planner resolves null", async () => {
    mockRunPlanner.mockResolvedValue({ ...fakePlannerResult, resolvedModel: null });
    mockRecordStepAttempt.mockResolvedValue(undefined);
    setupSuccessfulLLMResponse();

    await callLLMStructured({ ...baseParams, model: "claude-sonnet-4-6" });

    // Should fall back to original model
    expect(mockExecuteWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-sonnet-4-6" }),
    );
  });

  it("bills against the effective structured model instead of planner overrides", async () => {
    mockRunPlanner.mockResolvedValue({ ...fakePlannerResult, resolvedModel: "qwen-cheap" });
    mockRecordStepAttempt.mockResolvedValue(undefined);
    setupSuccessfulLLMResponse();

    await callLLMStructured({ ...baseParams, model: "claude-sonnet-4-6" });

    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-sonnet-4-6" }),
    );
  });

  it("records step attempt after each retry", async () => {
    mockRunPlanner.mockResolvedValue(fakePlannerResult);
    mockRecordStepAttempt.mockResolvedValue(undefined);

    // First attempt returns invalid JSON, second returns valid
    let callCount = 0;
    mockExecuteWithFallback.mockImplementation(async () => {
      callCount++;
      return {
        type: "success" as const,
        response: {
          choices: [{
            message: { content: callCount === 1 ? "not json" : '{"name": "test"}' },
            index: 0,
            finish_reason: "stop",
          }],
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        },
        providerName: "openai",
        providerId: 1,
      } as any;
    });
    mockDeductCredits.mockResolvedValue({ creditsUsed: 5 });

    await callLLMStructured({ ...baseParams, maxRetries: 1 });

    // recordStepAttempt called for each attempt
    expect(mockRecordStepAttempt).toHaveBeenCalledTimes(2);
  });

  it("works when planner is disabled (returns null)", async () => {
    mockRunPlanner.mockResolvedValue(null);
    setupSuccessfulLLMResponse();

    const result = await callLLMStructured(baseParams);

    expect(result.data).toEqual({ name: "test" });
    expect(mockRecordStepAttempt).not.toHaveBeenCalled();
  });

  it("passes skillSlug from billingMetadata", async () => {
    mockRunPlanner.mockResolvedValue(null);
    setupSuccessfulLLMResponse();

    await callLLMStructured({
      ...baseParams,
      billingMetadata: { skillSlug: "my-skill" },
    });

    expect(mockRunPlanner).toHaveBeenCalledWith(
      expect.objectContaining({ skillSlug: "my-skill" }),
    );
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ skillSlug: "my-skill", sourceType: "skill" }),
    );
  });

  it("resolves the structured model from chat auto-selection when the caller omits model", async () => {
    mockRunPlanner.mockResolvedValue(null);
    setupSuccessfulLLMResponse();

    await callLLMStructured(baseParams);

    expect(mockResolveStructuredAutoChatModelSelection).toHaveBeenCalledTimes(1);
    expect(mockExecuteWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "openai/gpt-4.1-mini",
        preferredProvider: 1,
      }),
    );
  });
});
