import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SkillExecutionPolicyResult } from "./skillExecutionPolicy";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("./auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

vi.mock("./llmRouter", () => ({
  executeWithFallback: vi.fn(),
  getProviderForModel: vi.fn(),
}));

vi.mock("./enabledLlmModels", () => ({
  loadEnabledLlmModelRows: vi.fn(),
}));

vi.mock("./intelligentModelSelector", () => ({
  selectLlmModelCandidates: vi.fn(),
}));

import { auditLogger } from "./auditLogger";
import { executeWithFallback, getProviderForModel } from "./llmRouter";
import { loadEnabledLlmModelRows } from "./enabledLlmModels";
import { selectLlmModelCandidates } from "./intelligentModelSelector";
import {
  executeSkillLlmWithFallback,
  type SkillLlmRequest,
} from "./skillModelFallback";

const mockExecute = vi.mocked(executeWithFallback);
const mockGetProvider = vi.mocked(getProviderForModel);
const mockLoadRows = vi.mocked(loadEnabledLlmModelRows);
const mockSelectCandidates = vi.mocked(selectLlmModelCandidates);
const mockAuditLog = vi.mocked(auditLogger.log);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePolicy(overrides: Partial<SkillExecutionPolicyResult> = {}): SkillExecutionPolicyResult {
  return {
    modelId: "gpt-4o",
    allowFreeModels: false,
    modelSource: "system_default",
    ...overrides,
  };
}

function makeRequest(overrides: Partial<SkillLlmRequest> = {}): SkillLlmRequest {
  return {
    messages: [{ role: "user", content: "hello" }],
    skillSlug: "test-skill",
    userId: 1,
    executionPolicy: makePolicy(),
    ...overrides,
  };
}

function successResult(providerName = "openai") {
  return {
    type: "success" as const,
    response: {
      choices: [{ message: { content: "LLM says hi" } }],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    },
    providerId: 1,
    providerName,
  };
}

function errorResult(statusCode = 429) {
  return {
    type: "error" as const,
    error: `Rate limited (${statusCode})`,
    statusCode,
  };
}

const fakeRows: any[] = [
  { modelId: "gpt-4o", priority: 10, providerName: "openai", isFree: false },
  { modelId: "gpt-4o-mini", priority: 20, providerName: "openai", isFree: false },
  { modelId: "claude-sonnet", priority: 30, providerName: "anthropic", isFree: false },
  { modelId: "gemini-pro", priority: 40, providerName: "google", isFree: false },
  { modelId: "llama-3", priority: 50, providerName: "groq", isFree: false },
  { modelId: "mistral-large", priority: 60, providerName: "mistral", isFree: false },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("executeSkillLlmWithFallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadRows.mockResolvedValue(fakeRows);
    mockSelectCandidates.mockReturnValue([]);
    mockGetProvider.mockResolvedValue(null);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Primary model succeeds — no fallback
  // ═══════════════════════════════════════════════════════════════════════════

  it("returns success on first attempt without fallback", async () => {
    mockExecute.mockResolvedValueOnce(successResult());

    const result = await executeSkillLlmWithFallback(makeRequest());

    expect(result.success).toBe(true);
    expect(result.content).toBe("LLM says hi");
    expect(result.modelId).toBe("gpt-4o");
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(20);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0].success).toBe(true);
    expect(result.attempts[0].attempt).toBe(1);
    expect(result.attempts[0].modelId).toBe("gpt-4o");
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Primary fails, second model succeeds — fallback used
  // ═══════════════════════════════════════════════════════════════════════════

  it("falls back to second model when primary fails", async () => {
    mockExecute
      .mockResolvedValueOnce(errorResult(429))
      .mockResolvedValueOnce(successResult("anthropic"));

    const result = await executeSkillLlmWithFallback(makeRequest());

    expect(result.success).toBe(true);
    expect(result.modelId).toBe("gpt-4o-mini"); // second candidate
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0].success).toBe(false);
    expect(result.attempts[0].modelId).toBe("gpt-4o");
    expect(result.attempts[0].errorType).toBe("http_429");
    expect(result.attempts[1].success).toBe(true);
    expect(result.attempts[1].modelId).toBe("gpt-4o-mini");
  });

  it("does not fall back to a different model when the skill explicitly configured the model", async () => {
    mockExecute.mockResolvedValueOnce(errorResult(429));

    const result = await executeSkillLlmWithFallback(
      makeRequest({
        executionPolicy: makePolicy({
          modelSource: "skill_llmModelId",
        }),
      }),
    );

    expect(result.success).toBe(false);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0].modelId).toBe("gpt-4o");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. All models exhausted — error with full attempt history
  // ═══════════════════════════════════════════════════════════════════════════

  it("returns error with full attempt history when all models fail", async () => {
    // Only 3 models: primary + 2 fallback (small fakeRows)
    mockLoadRows.mockResolvedValue(fakeRows.slice(0, 3));
    mockExecute
      .mockResolvedValueOnce(errorResult(500))
      .mockResolvedValueOnce(errorResult(503))
      .mockResolvedValueOnce(errorResult(429));

    const result = await executeSkillLlmWithFallback(makeRequest());

    expect(result.success).toBe(false);
    expect(result.error).toContain("All 3 models failed");
    expect(result.attempts).toHaveLength(3);
    expect(result.attempts[0].statusCode).toBe(500);
    expect(result.attempts[1].statusCode).toBe(503);
    expect(result.attempts[2].statusCode).toBe(429);
    // All attempts should have correct attempt numbers
    expect(result.attempts.map((a) => a.attempt)).toEqual([1, 2, 3]);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. MAX_MODEL_ATTEMPTS = 5 capping
  // ═══════════════════════════════════════════════════════════════════════════

  it("caps candidate list at 5 models even with more available", async () => {
    // 6 models in fakeRows but should only try 5
    mockExecute.mockResolvedValue(errorResult(500));

    const result = await executeSkillLlmWithFallback(makeRequest());

    expect(result.success).toBe(false);
    expect(result.attempts).toHaveLength(5);
    expect(mockExecute).toHaveBeenCalledTimes(5);
    // "mistral-large" (priority 60, 6th model) should NOT appear
    const triedModels = result.attempts.map((a) => a.modelId);
    expect(triedModels).not.toContain("mistral-large");
  });

  it("can be constrained to a single model attempt for simpler debug flows", async () => {
    mockExecute.mockResolvedValue(errorResult(500));

    const result = await executeSkillLlmWithFallback(
      makeRequest({
        maxModelAttempts: 1,
      }),
    );

    expect(result.success).toBe(false);
    expect(result.attempts).toHaveLength(1);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(result.attempts[0].modelId).toBe("gpt-4o");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Deduplication — same model never tried twice
  // ═══════════════════════════════════════════════════════════════════════════

  it("deduplicates models: primary model is not retried from fallback list", async () => {
    // selectLlmModelCandidates returns list that includes the primary model
    mockSelectCandidates.mockReturnValue(["gpt-4o", "claude-sonnet", "gpt-4o-mini"]);

    const policy = makePolicy({
      modelId: "gpt-4o",
      modelSource: "requirements_match",
      matchedCapabilities: ["supportsVision"],
    });

    mockExecute.mockResolvedValue(errorResult(500));

    const result = await executeSkillLlmWithFallback(
      makeRequest({ executionPolicy: policy }),
    );

    // gpt-4o should appear exactly once, not twice
    const triedModels = result.attempts.map((a) => a.modelId);
    const gpt4oCount = triedModels.filter((m) => m === "gpt-4o").length;
    expect(gpt4oCount).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Empty candidates — graceful error
  // ═══════════════════════════════════════════════════════════════════════════

  it("returns error when no enabled models available", async () => {
    mockLoadRows.mockResolvedValue([]);

    const result = await executeSkillLlmWithFallback(makeRequest());

    expect(result.success).toBe(false);
    expect(result.error).toContain("No enabled LLM model available");
    expect(result.attempts).toHaveLength(0);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. Provider preference on first attempt only
  // ═══════════════════════════════════════════════════════════════════════════

  it("passes preferredProvider only on first attempt", async () => {
    const policy = makePolicy({ preferredProviderId: 42 });
    mockExecute
      .mockResolvedValueOnce(errorResult(429))
      .mockResolvedValueOnce(successResult());

    await executeSkillLlmWithFallback(makeRequest({ executionPolicy: policy }));

    // First call: preferredProvider = 42
    expect(mockExecute.mock.calls[0][0]).toMatchObject({
      preferredProvider: 42,
    });
    // Second call: preferredProvider = undefined
    expect(mockExecute.mock.calls[1][0].preferredProvider).toBeUndefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. Stream parameter passed through
  // ═══════════════════════════════════════════════════════════════════════════

  it("passes stream parameter to executeWithFallback", async () => {
    mockExecute.mockResolvedValueOnce(successResult());

    await executeSkillLlmWithFallback(makeRequest({ stream: true }));

    expect(mockExecute.mock.calls[0][0]).toMatchObject({ stream: true });
  });

  it("defaults stream to false when not specified", async () => {
    mockExecute.mockResolvedValueOnce(successResult());

    await executeSkillLlmWithFallback(makeRequest());

    expect(mockExecute.mock.calls[0][0]).toMatchObject({ stream: false });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. Audit logging accuracy
  // ═══════════════════════════════════════════════════════════════════════════

  it("logs llm_request at start of each attempt", async () => {
    mockExecute
      .mockResolvedValueOnce(errorResult(429))
      .mockResolvedValueOnce(successResult());

    await executeSkillLlmWithFallback(makeRequest());

    const requestLogs = mockAuditLog.mock.calls.filter(
      (c) => c[0].eventType === "llm_request",
    );
    expect(requestLogs).toHaveLength(2);

    // First attempt: wasFallback=false
    expect(requestLogs[0][0]).toMatchObject({
      eventType: "llm_request",
      wasFallback: false,
      fallbackAttempt: 0,
    });
    // Second attempt: wasFallback=true
    expect(requestLogs[1][0]).toMatchObject({
      eventType: "llm_request",
      wasFallback: true,
      fallbackAttempt: 1,
    });
  });

  it("logs llm_response for each attempt (success and failure)", async () => {
    mockExecute
      .mockResolvedValueOnce(errorResult(500))
      .mockResolvedValueOnce(successResult());

    await executeSkillLlmWithFallback(makeRequest());

    const responseLogs = mockAuditLog.mock.calls.filter(
      (c) => c[0].eventType === "llm_response",
    );
    expect(responseLogs).toHaveLength(2);

    // First: failure
    expect(responseLogs[0][0]).toMatchObject({
      errorType: "http_500",
      wasFallback: false,
    });
    // Second: success
    expect(responseLogs[1][0]).toMatchObject({
      statusCode: 200,
      wasFallback: true,
      inputTokens: 10,
      outputTokens: 20,
    });
  });

  it("logs all_models_exhausted error when every model fails", async () => {
    mockLoadRows.mockResolvedValue(fakeRows.slice(0, 2));
    mockExecute.mockResolvedValue(errorResult(500));

    await executeSkillLlmWithFallback(makeRequest());

    const errorLogs = mockAuditLog.mock.calls.filter(
      (c) => c[0].eventType === "error",
    );
    expect(errorLogs).toHaveLength(1);
    expect(errorLogs[0][0]).toMatchObject({
      errorType: "all_models_exhausted",
      requestType: "skill",
    });
    expect(errorLogs[0][0].metadata.totalAttempts).toBe(2);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. Attempt record accuracy
  // ═══════════════════════════════════════════════════════════════════════════

  it("records accurate attempt details including duration and error info", async () => {
    mockExecute
      .mockResolvedValueOnce(errorResult(429))
      .mockResolvedValueOnce(successResult("anthropic"));

    const result = await executeSkillLlmWithFallback(makeRequest());

    // Failed attempt
    expect(result.attempts[0]).toMatchObject({
      attempt: 1,
      modelId: "gpt-4o",
      providerName: "multi-provider",
      statusCode: 429,
      errorType: "http_429",
      errorMessage: "Rate limited (429)",
      success: false,
    });
    expect(result.attempts[0].durationMs).toBeGreaterThanOrEqual(0);

    // Successful attempt
    expect(result.attempts[1]).toMatchObject({
      attempt: 2,
      providerName: "anthropic",
      statusCode: 200,
      errorType: null,
      errorMessage: null,
      success: true,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. Requirements-based candidate ordering
  // ═══════════════════════════════════════════════════════════════════════════

  it("adds requirements-matched candidates when modelSource is requirements_match", async () => {
    mockSelectCandidates.mockReturnValue(["gemini-pro", "claude-sonnet"]);

    const policy = makePolicy({
      modelId: "gpt-4o",
      modelSource: "requirements_match",
      matchedCapabilities: ["supportsVision", "supportsFunctionTools"],
    });

    mockExecute.mockResolvedValue(errorResult(500));

    const result = await executeSkillLlmWithFallback(
      makeRequest({ executionPolicy: policy }),
    );

    // Order should be: primary → requirements-matched → remaining by priority
    const tried = result.attempts.map((a) => a.modelId);
    expect(tried[0]).toBe("gpt-4o");        // primary
    expect(tried[1]).toBe("gemini-pro");     // from requirements
    expect(tried[2]).toBe("claude-sonnet");  // from requirements
    // remaining: gpt-4o-mini (already deduped gpt-4o)
    expect(tried[3]).toBe("gpt-4o-mini");

    // Should have called selectLlmModelCandidates with correct requirements
    expect(mockSelectCandidates).toHaveBeenCalledWith(
      { supportsVision: true, supportsFunctionTools: true },
      fakeRows,
      5,
    );
  });

  it("skips requirements candidates when modelSource is not requirements_match", async () => {
    const policy = makePolicy({
      modelId: "gpt-4o",
      modelSource: "skill_llmModelId",
    });

    mockExecute.mockResolvedValue(errorResult(500));

    await executeSkillLlmWithFallback(makeRequest({ executionPolicy: policy }));

    expect(mockSelectCandidates).not.toHaveBeenCalled();
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("filters free models out of the fallback chain by default", async () => {
    mockLoadRows.mockResolvedValue([
      { modelId: "paid-primary", priority: 10, providerName: "openai", isFree: false },
      { modelId: "free-fallback", priority: 20, providerName: "openrouter", isFree: true },
      { modelId: "paid-fallback", priority: 30, providerName: "anthropic", isFree: false },
    ] as any);
    mockExecute.mockResolvedValue(errorResult(500));

    const result = await executeSkillLlmWithFallback(
      makeRequest({
        executionPolicy: makePolicy({
          modelId: "paid-primary",
          allowFreeModels: false,
        }),
      }),
    );

    expect(result.attempts.map((attempt) => attempt.modelId)).not.toContain("free-fallback");
  });

  it("includes free models in the fallback chain when explicitly allowed", async () => {
    mockLoadRows.mockResolvedValue([
      { modelId: "paid-primary", priority: 10, providerName: "openai", isFree: false },
      { modelId: "free-fallback", priority: 20, providerName: "openrouter", isFree: true },
      { modelId: "paid-fallback", priority: 30, providerName: "anthropic", isFree: false },
    ] as any);
    mockExecute.mockResolvedValue(errorResult(500));

    const result = await executeSkillLlmWithFallback(
      makeRequest({
        executionPolicy: makePolicy({
          modelId: "paid-primary",
          allowFreeModels: true,
        }),
      }),
    );

    expect(result.attempts.map((attempt) => attempt.modelId)).toContain("free-fallback");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. fallback_required result type handling
  // ═══════════════════════════════════════════════════════════════════════════

  it("handles fallback_required result type as failure", async () => {
    mockExecute.mockResolvedValueOnce({
      type: "fallback_required" as const,
      from: {} as any,
      to: {} as any,
      estimatedCredits: 100,
    });
    mockExecute.mockResolvedValueOnce(successResult());

    const result = await executeSkillLlmWithFallback(makeRequest());

    expect(result.success).toBe(true);
    expect(result.attempts[0].success).toBe(false);
    expect(result.attempts[0].errorType).toBe("fallback_required");
    expect(result.attempts[0].statusCode).toBeNull();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 13. totalDurationMs tracking
  // ═══════════════════════════════════════════════════════════════════════════

  it("tracks totalDurationMs for the full operation", async () => {
    mockExecute.mockResolvedValueOnce(successResult());

    const result = await executeSkillLlmWithFallback(makeRequest());

    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.totalDurationMs).toBe("number");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 14. No primary model in policy
  // ═══════════════════════════════════════════════════════════════════════════

  it("still builds candidate list when policy.modelId is null", async () => {
    const policy = makePolicy({
      modelId: null,
      modelSource: "system_default",
    });

    mockExecute.mockResolvedValueOnce(successResult());

    const result = await executeSkillLlmWithFallback(
      makeRequest({ executionPolicy: policy }),
    );

    expect(result.success).toBe(true);
    // Should use first enabled model by priority
    expect(result.attempts[0].modelId).toBe("gpt-4o");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 15. Response content extraction
  // ═══════════════════════════════════════════════════════════════════════════

  it("extracts string content from response correctly", async () => {
    mockExecute.mockResolvedValueOnce({
      type: "success" as const,
      response: "Plain text response",
      providerId: 1,
      providerName: "openai",
    });

    const result = await executeSkillLlmWithFallback(makeRequest());

    expect(result.content).toBe("Plain text response");
  });

  it("treats empty choices as a failed attempt and falls back to the next model", async () => {
    mockExecute
      .mockResolvedValueOnce({
        type: "success" as const,
        response: { choices: [] },
        providerId: 1,
        providerName: "openai",
      })
      .mockResolvedValueOnce(successResult("anthropic"));

    const result = await executeSkillLlmWithFallback(makeRequest());

    expect(result.success).toBe(true);
    expect(result.modelId).toBe("gpt-4o-mini");
    expect(result.content).toBe("LLM says hi");
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]).toMatchObject({
      success: false,
      errorType: "empty_response",
      errorMessage: "No response generated",
    });
    expect(result.attempts[1]).toMatchObject({
      success: true,
      modelId: "gpt-4o-mini",
    });
  });
});
