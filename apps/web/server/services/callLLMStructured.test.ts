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

import { callLLMStructured } from "./callLLMStructured";
import { executeWithFallback } from "./llmRouter";
import { deductCreditsForModel } from "./creditService";
import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";
import { z } from "zod";

const mockExecuteWithFallback = vi.mocked(executeWithFallback);
const mockDeductCredits = vi.mocked(deductCreditsForModel);
const mockRunPlanner = vi.mocked(runPlanner);
const mockRecordStepAttempt = vi.mocked(recordStepAttempt);

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
  resolvedModel: "gpt-4o",
  snapshot: null,
  shadowMode: true,
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
  });

  it("runs planner once before the retry loop", async () => {
    mockRunPlanner.mockResolvedValue(fakePlannerResult);
    mockRecordStepAttempt.mockResolvedValue(undefined);
    setupSuccessfulLLMResponse();

    await callLLMStructured(baseParams);

    expect(mockRunPlanner).toHaveBeenCalledTimes(1);
    expect(mockRunPlanner).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "skill",
        userId: 1,
        tenantId: "tenant-1",
      }),
    );
  });

  it("uses legacy model in shadow mode", async () => {
    mockRunPlanner.mockResolvedValue({ ...fakePlannerResult, shadowMode: true });
    mockRecordStepAttempt.mockResolvedValue(undefined);
    setupSuccessfulLLMResponse();

    await callLLMStructured({ ...baseParams, model: "claude-sonnet-4-6" });

    // Should use original model, not planner's resolvedModel
    expect(mockExecuteWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-sonnet-4-6" }),
    );
  });

  it("uses planner model in active mode", async () => {
    mockRunPlanner.mockResolvedValue({ ...fakePlannerResult, shadowMode: false, resolvedModel: "gpt-4o" });
    mockRecordStepAttempt.mockResolvedValue(undefined);
    setupSuccessfulLLMResponse();

    await callLLMStructured({ ...baseParams, model: "claude-sonnet-4-6" });

    // Should use planner's resolvedModel
    expect(mockExecuteWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-4o" }),
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
  });
});
