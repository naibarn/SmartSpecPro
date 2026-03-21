/**
 * Tests for team room → unified orchestrator wiring (section-08).
 *
 * Verifies feature flag gates delegation to executeUnified(),
 * correct UnifiedExecutionRequest shape for team_room channel,
 * and fallback to existing code on orchestrator failure.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────

const mockExecuteUnified = vi.fn();
vi.mock("../unifiedOrchestrator", () => ({
  executeUnified: (...args: unknown[]) => mockExecuteUnified(...args),
}));

const mockGetTenantFeatureFlags = vi.fn();
vi.mock("../tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: (...args: unknown[]) =>
    mockGetTenantFeatureFlags(...args),
}));

const mockExecuteSkillLlmWithFallback = vi.fn();
vi.mock("../skillModelFallback", () => ({
  executeSkillLlmWithFallback: (...args: unknown[]) =>
    mockExecuteSkillLlmWithFallback(...args),
}));

vi.mock("../skillRegistry", () => ({
  getSkillByIdAsync: vi.fn().mockResolvedValue({
    id: "general-article-writer",
    name: "General Article Writer",
    slug: "general-article-writer",
    systemPrompt: "You are a writer.",
    executionMode: "llm-only",
    executionPolicy: null,
  }),
}));

vi.mock("../skillExecutionPolicy", () => ({
  resolveSkillExecutionPolicy: vi.fn().mockResolvedValue({
    modelId: "gpt-4o-mini",
    preferredProviderId: null,
    strictProviderPin: false,
  }),
}));

vi.mock("../taskPlannerMiddleware", () => ({
  runPlanner: vi.fn().mockResolvedValue(null),
  recordStepAttempt: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../promptComposer", () => ({
  composePrompt: vi.fn().mockResolvedValue({
    messages: [{ role: "user", content: "test objective" }],
  }),
}));

vi.mock("../creditService", () => ({
  calculateCreditsForLLMDynamic: vi.fn().mockResolvedValue(3),
}));

vi.mock("../webSearchToolInjector", () => ({
  detectProviderFamily: vi.fn(),
  buildWebSearchParams: vi.fn(),
}));

vi.mock("../llmRouter", () => ({
  getProviderForModel: vi.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────

import type { TeamRunSkillExecutionInput } from "../teamRunSkillExecutor";

function makeInput(overrides?: Partial<TeamRunSkillExecutionInput>): TeamRunSkillExecutionInput {
  return {
    run: { id: "run-1" } as any,
    tenantId: "tenant-1",
    userId: 42,
    assistantId: "assistant-1",
    assistantContext: {
      profile: { preferredModelId: "gpt-4o", displayName: "Writer" },
      agentModel: null,
      personaContext: null,
    },
    roomId: "room-1",
    teamId: "team-1",
    objective: "Write a report about AI trends",
    route: {
      route: "skill",
      reason: "team_run_skill",
      selectedSkillId: "general-article-writer",
    },
    ...overrides,
  };
}

function makeUnifiedResult(content = "unified team response", costCredits = 3) {
  return {
    route: {
      capability: "writing.article",
      executorId: "text-skill-executor",
      reason: "team_run_skill",
    },
    result: { type: "text" as const, content },
    tokens: { input: 100, output: 200 },
    costCredits,
    creditsDeducted: 0, // team_room uses calculate_only
    modelUsed: "gpt-4o",
    skillId: "general-article-writer",
    nextSpeakerHint: "reviewer-persona",
    metadata: { traceId: "t1", success: true },
    telemetry: {
      routerVersion: "1.0.0",
      policyVersion: "1.0.0",
      executorId: "text-skill-executor",
      attempts: [],
      totalDurationMs: 500,
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────

describe("Team Room → Unified Orchestrator Wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantFeatureFlags.mockResolvedValue({
      unifiedSkillExecution: false,
    });
    mockExecuteSkillLlmWithFallback.mockResolvedValue({
      success: true,
      content: "fallback content [NEXT: reviewer]",
      modelId: "gpt-4o-mini",
      inputTokens: 50,
      outputTokens: 100,
      attempts: [],
    });
  });

  it("flag=false — uses existing code, orchestrator NOT called", async () => {
    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    const result = await executeTeamRunSkillTurn(makeInput());

    expect(mockExecuteUnified).not.toHaveBeenCalled();
    expect(result.content).toBeDefined();
    expect(result.skillId).toBe("general-article-writer");
  });

  it("flag=true — delegates to orchestrator with correct request shape", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      unifiedSkillExecution: true,
    });
    mockExecuteUnified.mockResolvedValue(makeUnifiedResult());

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    const result = await executeTeamRunSkillTurn(makeInput());

    expect(mockExecuteUnified).toHaveBeenCalledTimes(1);
    const req = mockExecuteUnified.mock.calls[0][0];
    expect(req.channel).toBe("team_room");
    expect(req.creditMode).toBe("calculate_only");
    expect(req.userId).toBe(42);
    expect(req.tenantId).toBe("tenant-1");
    expect(req.userMessage).toBe("Write a report about AI trends");
  });

  it("flag=true — teamContext populated correctly from input", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      unifiedSkillExecution: true,
    });
    mockExecuteUnified.mockResolvedValue(makeUnifiedResult());

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    await executeTeamRunSkillTurn(makeInput());

    const req = mockExecuteUnified.mock.calls[0][0];
    expect(req.teamContext).toEqual({
      assistantId: "assistant-1",
      roomId: "room-1",
      teamId: "team-1",
      runId: "run-1",
      objective: "Write a report about AI trends",
    });
  });

  it("flag=true — nextSpeakerHint forwarded from result", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      unifiedSkillExecution: true,
    });
    mockExecuteUnified.mockResolvedValue(makeUnifiedResult());

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    const result = await executeTeamRunSkillTurn(makeInput());

    expect(result.nextSpeakerHint).toBe("reviewer-persona");
  });

  it("flag=true, orchestrator throws — falls back to existing path", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      unifiedSkillExecution: true,
    });
    mockExecuteUnified.mockRejectedValue(new Error("orchestrator failure"));

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    const result = await executeTeamRunSkillTurn(makeInput());

    // Should fall back to existing path
    expect(mockExecuteSkillLlmWithFallback).toHaveBeenCalled();
    expect(result.content).toBeDefined();
  });

  it("flag=true — result mapped to TeamRunSkillExecutionResult shape", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      unifiedSkillExecution: true,
    });
    mockExecuteUnified.mockResolvedValue(makeUnifiedResult("AI trends report", 5));

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    const result = await executeTeamRunSkillTurn(makeInput());

    expect(result.content).toBe("AI trends report");
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(200);
    expect(result.costCredits).toBe(5);
    expect(result.skillId).toBe("general-article-writer");
    expect(result.metadata).toHaveProperty("unifiedPath", true);
  });

  it("flag=true — orchestrator error result triggers fallback", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      unifiedSkillExecution: true,
    });
    mockExecuteUnified.mockResolvedValue({
      ...makeUnifiedResult(),
      route: {
        capability: "writing.article",
        executorId: "unknown",
        reason: "orchestrator_error",
      },
      result: { type: "text", content: "" },
      metadata: { error: "skill_resolution_failed" },
    });

    const { executeTeamRunSkillTurn } = await import("../teamRunSkillExecutor");
    const result = await executeTeamRunSkillTurn(makeInput());

    // Should fall back since route.reason === "orchestrator_error"
    expect(mockExecuteSkillLlmWithFallback).toHaveBeenCalled();
    expect(result.content).toBeDefined();
  });
});
