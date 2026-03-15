/**
 * Integration test: skill execution → policy resolution → model selection → fallback chain
 *
 * Tests the full Feature 041 chain with mocked DB + LLM layers:
 *   resolveSkillExecutionPolicy() → executeSkillLlmWithFallback()
 *
 * Verifies that:
 * - Requirements-based policy selects the right model
 * - When primary model fails, fallback chain uses correct ordering
 * - Audit trail accurately reflects the full chain
 * - Legacy skills without requirements still work
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Mock DB + external dependencies ─────────────────────────────────────────

vi.mock("./enabledLlmModels", () => ({
  loadEnabledLlmModelRows: vi.fn(),
  resolveEnabledLlmModelIdFromRows: vi.fn(),
}));

vi.mock("./auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

vi.mock("./llmRouter", () => ({
  executeWithFallback: vi.fn(),
  getProviderForModel: vi.fn(),
}));

import {
  loadEnabledLlmModelRows,
  resolveEnabledLlmModelIdFromRows,
} from "./enabledLlmModels";
import { executeWithFallback, getProviderForModel } from "./llmRouter";
import { auditLogger } from "./auditLogger";
import { resolveSkillExecutionPolicy } from "./skillExecutionPolicy";
import { executeSkillLlmWithFallback } from "./skillModelFallback";
import type { EnabledLlmModelRow } from "./enabledLlmModels";

const mockLoadRows = vi.mocked(loadEnabledLlmModelRows);
const mockResolveId = vi.mocked(resolveEnabledLlmModelIdFromRows);
const mockExecute = vi.mocked(executeWithFallback);
const mockGetProvider = vi.mocked(getProviderForModel);
const mockAuditLog = vi.mocked(auditLogger.log);

// ─── Test data ───────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<EnabledLlmModelRow>): EnabledLlmModelRow {
  return {
    modelId: "gpt-4o",
    providerName: "openai",
    providerModelId: "gpt-4o",
    defaultModel: "gpt-4o",
    priority: 50,
    priorityLocked: false,
    contextLength: 128000,
    supportsVision: false,
    supportsFunctionTools: false,
    supportsStructuredOutputs: false,
    supportsWebSearch: false,
    supportsCodeExecution: false,
    supportsComputerUse: false,
    supportsBackground: false,
    supportsResponses: false,
    ...overrides,
  } as EnabledLlmModelRow;
}

const visionRows: EnabledLlmModelRow[] = [
  makeRow({
    modelId: "gpt-4o",
    priority: 10,
    supportsVision: true,
    supportsFunctionTools: true,
  }),
  makeRow({
    modelId: "gpt-4o-mini",
    priority: 20,
    supportsVision: true,
  }),
  makeRow({
    modelId: "claude-sonnet",
    priority: 15,
    supportsVision: true,
    supportsFunctionTools: true,
    supportsStructuredOutputs: true,
  }),
  makeRow({
    modelId: "gemini-flash",
    priority: 30,
    supportsVision: false, // does NOT support vision
    supportsFunctionTools: true,
  }),
  makeRow({
    modelId: "llama-3",
    priority: 40,
    supportsVision: false,
  }),
];

function successResult(providerName = "openai") {
  return {
    type: "success" as const,
    response: {
      choices: [{ message: { content: "Generated content" } }],
      usage: { prompt_tokens: 50, completion_tokens: 100 },
    },
    providerId: 1,
    providerName,
  };
}

function errorResult(statusCode = 429) {
  return {
    type: "error" as const,
    error: `Provider error ${statusCode}`,
    statusCode,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Feature 041 Integration: policy → selection → fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadRows.mockResolvedValue(visionRows);
    mockGetProvider.mockResolvedValue(null);
  });

  it("requirements-based skill selects matching model and succeeds on first try", async () => {
    // Skill requires vision + function tools
    const skill: any = {
      id: "vision-writer",
      name: "Vision Writer",
      executionPolicy: {
        mode: "requirements",
        requirements: { supportsVision: true, supportsFunctionTools: true },
      },
    };

    // resolveEnabledLlmModelIdFromRows: used for fallback cascade, not called for requirements
    mockResolveId.mockReturnValue(null);

    // Step 1: Resolve policy
    const policy = await resolveSkillExecutionPolicy({ skill });

    expect(policy.modelSource).toBe("requirements_match");
    expect(policy.modelId).toBe("gpt-4o"); // priority 10, matches both
    expect(policy.matchedCapabilities).toContain("supportsVision");
    expect(policy.matchedCapabilities).toContain("supportsFunctionTools");
    expect(policy.requirementsFallback).toBe(false);

    // Step 2: Execute with fallback
    mockExecute.mockResolvedValueOnce(successResult());

    const result = await executeSkillLlmWithFallback({
      messages: [{ role: "user", content: "Describe this image" }],
      skillSlug: "vision-writer",
      userId: 1,
      executionPolicy: policy,
    });

    expect(result.success).toBe(true);
    expect(result.modelId).toBe("gpt-4o");
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0].success).toBe(true);
  });

  it("requirements-based skill falls back through matching models when primary fails", async () => {
    const skill: any = {
      id: "vision-writer",
      name: "Vision Writer",
      executionPolicy: {
        mode: "requirements",
        requirements: { supportsVision: true },
      },
    };

    mockResolveId.mockReturnValue(null);

    const policy = await resolveSkillExecutionPolicy({ skill });
    expect(policy.modelId).toBe("gpt-4o"); // best vision model

    // gpt-4o fails (429), claude-sonnet fails (500), gpt-4o-mini succeeds
    mockExecute
      .mockResolvedValueOnce(errorResult(429))  // gpt-4o
      .mockResolvedValueOnce(errorResult(500))  // next candidate
      .mockResolvedValueOnce(successResult("openai")); // third candidate

    const result = await executeSkillLlmWithFallback({
      messages: [{ role: "user", content: "Describe this image" }],
      skillSlug: "vision-writer",
      userId: 1,
      executionPolicy: policy,
    });

    expect(result.success).toBe(true);
    expect(result.attempts).toHaveLength(3);
    expect(result.attempts[0].success).toBe(false);
    expect(result.attempts[0].errorType).toBe("http_429");
    expect(result.attempts[1].success).toBe(false);
    expect(result.attempts[2].success).toBe(true);
  });

  it("legacy skill without requirements uses cascade and still gets fallback", async () => {
    const skill: any = {
      id: "basic-writer",
      name: "Basic Writer",
      llmModelId: "gpt-4o",
      // No executionPolicy → legacy cascade
    };

    mockResolveId.mockImplementation(({ preferredModelIds }) => {
      for (const id of preferredModelIds ?? []) {
        if (visionRows.some((r) => r.modelId === id)) return id;
      }
      return visionRows[0].modelId;
    });

    const policy = await resolveSkillExecutionPolicy({ skill });
    expect(policy.modelSource).toBe("skill_llmModelId");
    expect(policy.modelId).toBe("gpt-4o");

    // Primary fails, falls back to next by priority
    mockExecute
      .mockResolvedValueOnce(errorResult(500))
      .mockResolvedValueOnce(successResult("anthropic"));

    const result = await executeSkillLlmWithFallback({
      messages: [{ role: "user", content: "Write a poem" }],
      skillSlug: "basic-writer",
      userId: 1,
      executionPolicy: policy,
    });

    expect(result.success).toBe(true);
    expect(result.attempts).toHaveLength(2);
    // First: primary model failed
    expect(result.attempts[0].modelId).toBe("gpt-4o");
    expect(result.attempts[0].success).toBe(false);
    // Second: fallback model succeeded
    expect(result.attempts[1].success).toBe(true);
  });

  it("audit trail captures full fallback chain for failed + successful attempts", async () => {
    const skill: any = {
      id: "test-skill",
      name: "Test Skill",
      executionPolicy: {
        mode: "requirements",
        requirements: { supportsVision: true },
      },
    };

    mockResolveId.mockReturnValue(null);
    const policy = await resolveSkillExecutionPolicy({ skill });

    mockExecute
      .mockResolvedValueOnce(errorResult(429))
      .mockResolvedValueOnce(successResult());

    await executeSkillLlmWithFallback({
      messages: [{ role: "user", content: "test" }],
      skillSlug: "test-skill",
      userId: 42,
      executionPolicy: policy,
    });

    // Verify audit log calls
    const allLogs = mockAuditLog.mock.calls.map((c) => c[0]);

    // Should have: request(attempt 1) + response(fail) + request(attempt 2) + response(success)
    const requests = allLogs.filter((l: any) => l.eventType === "llm_request");
    const responses = allLogs.filter((l: any) => l.eventType === "llm_response");

    expect(requests).toHaveLength(2);
    expect(responses).toHaveLength(2);

    // First request: not a fallback
    expect(requests[0]).toMatchObject({
      userId: 42,
      wasFallback: false,
      fallbackAttempt: 0,
    });

    // Second request: is a fallback
    expect(requests[1]).toMatchObject({
      userId: 42,
      wasFallback: true,
      fallbackAttempt: 1,
    });

    // First response: failure with error type
    expect(responses[0]).toMatchObject({
      errorType: "http_429",
      wasFallback: false,
    });

    // Second response: success with tokens
    expect(responses[1]).toMatchObject({
      statusCode: 200,
      wasFallback: true,
      inputTokens: 50,
      outputTokens: 100,
    });
  });

  it("all models exhausted returns structured error with every attempt", async () => {
    // Use only 2 models for faster test
    mockLoadRows.mockResolvedValue(visionRows.slice(0, 2));

    const skill: any = {
      id: "test-skill",
      name: "Test Skill",
      llmModelId: "gpt-4o",
    };

    mockResolveId.mockImplementation(({ preferredModelIds }) => {
      return preferredModelIds?.[0] ?? null;
    });

    const policy = await resolveSkillExecutionPolicy({ skill });

    mockExecute
      .mockResolvedValueOnce(errorResult(500))
      .mockResolvedValueOnce(errorResult(503));

    const result = await executeSkillLlmWithFallback({
      messages: [{ role: "user", content: "test" }],
      skillSlug: "test-skill",
      userId: 1,
      executionPolicy: policy,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("All 2 models failed");
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts.every((a) => !a.success)).toBe(true);

    // Verify all_models_exhausted audit event
    const errorLogs = mockAuditLog.mock.calls
      .map((c) => c[0])
      .filter((l: any) => l.eventType === "error");
    expect(errorLogs).toHaveLength(1);
    expect(errorLogs[0]).toMatchObject({
      errorType: "all_models_exhausted",
    });
  });
});
