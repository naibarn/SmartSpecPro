import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// Mocks must be set up before importing the module under test
vi.mock("../skillRegistry", () => ({
  getSkillByIdAsync: vi.fn(),
}));
vi.mock("../skillModelFallback", () => ({
  executeSkillLlmWithFallback: vi.fn(),
}));
vi.mock("../promptComposer", () => ({
  composePrompt: vi.fn(),
}));
vi.mock("../skillExecutionPolicy", () => ({
  resolveSkillExecutionPolicy: vi.fn(),
}));
vi.mock("../taskPlannerMiddleware", () => ({
  runPlanner: vi.fn().mockResolvedValue(null),
  recordStepAttempt: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../creditService", () => ({
  calculateCreditsForLLMDynamic: vi.fn().mockResolvedValue(5),
}));

import { executeTeamRunSkillTurn, type TeamRunSkillExecutionInput } from "../teamRunSkillExecutor";
import { getSkillByIdAsync } from "../skillRegistry";
import { executeSkillLlmWithFallback } from "../skillModelFallback";
import { composePrompt } from "../promptComposer";
import { resolveSkillExecutionPolicy } from "../skillExecutionPolicy";
import { calculateCreditsForLLMDynamic } from "../creditService";

// --- Helpers ---

function makeInput(overrides: Partial<TeamRunSkillExecutionInput> = {}): TeamRunSkillExecutionInput {
  return {
    run: { id: "run-1" } as any,
    tenantId: "tenant-1",
    userId: 1,
    assistantId: "agent-A",
    assistantContext: {
      profile: { preferredModelId: "gpt-4o", displayName: "Agent A", roleTitle: "Writer" },
      agentModel: null,
      personaContext: "You are a helpful assistant",
    },
    roomId: "room-1",
    teamId: "team-1",
    objective: "Write an article about AI",
    route: {
      route: "skill",
      reason: "skill detected",
      selectedSkillId: "lifestyle-article-writer",
    },
    ...overrides,
  };
}

function makeSkill(overrides: Record<string, unknown> = {}) {
  return {
    id: "lifestyle-article-writer",
    name: "Lifestyle Article Writer",
    systemPrompt: "You are a Thai lifestyle article writer.",
    executionMode: "llm-only",
    type: "chat-assistant",
    executionPolicy: null,
    ...overrides,
  };
}

function makeFallbackResult(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    content: "Here is the article content.",
    modelId: "gpt-4o",
    provider: { providerName: "openai" },
    inputTokens: 500,
    outputTokens: 300,
    attempts: [{ attempt: 1, modelId: "gpt-4o", providerName: "openai", success: true, statusCode: 200, errorType: null, errorMessage: null, durationMs: 1200 }],
    totalDurationMs: 1200,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(getSkillByIdAsync).mockResolvedValue(makeSkill() as any);
  vi.mocked(composePrompt).mockResolvedValue({
    messages: [
      { role: "system", content: "Persona context: You are Agent A..." },
      { role: "user", content: "[User] Write about AI trends" },
      { role: "assistant", content: "[Agent B] Here is some prior analysis..." },
    ],
  } as any);
  vi.mocked(resolveSkillExecutionPolicy).mockResolvedValue({
    modelId: "gpt-4o",
    maxTokens: 4096,
    temperature: 0.7,
  } as any);
  vi.mocked(executeSkillLlmWithFallback).mockResolvedValue(makeFallbackResult() as any);
  vi.mocked(calculateCreditsForLLMDynamic).mockResolvedValue(5);
});

// --- Tests ---

describe("executeTeamRunSkillTurn", () => {
  it("should call executeSkillLlmWithFallback (not Python bridge)", async () => {
    const result = await executeTeamRunSkillTurn(makeInput());

    expect(executeSkillLlmWithFallback).toHaveBeenCalledOnce();
    expect(result.content).toBe("Here is the article content.");
  });

  it("should use detected skill's systemPrompt in messages", async () => {
    vi.mocked(getSkillByIdAsync).mockResolvedValue(
      makeSkill({ systemPrompt: "You are a Thai article writer with expertise in fashion." }) as any,
    );

    await executeTeamRunSkillTurn(makeInput());

    const call = vi.mocked(executeSkillLlmWithFallback).mock.calls[0][0];
    expect(call.messages[0]).toEqual({
      role: "system",
      content: "You are a Thai article writer with expertise in fashion.",
    });
  });

  it("should pass multi-turn messages array (not flattened string)", async () => {
    await executeTeamRunSkillTurn(makeInput());

    const call = vi.mocked(executeSkillLlmWithFallback).mock.calls[0][0];
    expect(Array.isArray(call.messages)).toBe(true);
    // system prompt + 3 composed messages
    expect(call.messages.length).toBeGreaterThanOrEqual(3);
    for (const msg of call.messages) {
      expect(msg).toHaveProperty("role");
      expect(msg).toHaveProperty("content");
      expect(typeof msg.content).toBe("string");
    }
  });

  it("should return inputTokens and outputTokens as flat fields", async () => {
    const result = await executeTeamRunSkillTurn(makeInput());

    expect(result.inputTokens).toBe(500);
    expect(result.outputTokens).toBe(300);
    expect(typeof result.inputTokens).toBe("number");
    expect(typeof result.outputTokens).toBe("number");
  });

  it("should include skillId in result metadata", async () => {
    const result = await executeTeamRunSkillTurn(makeInput());

    expect(result.skillId).toBe("lifestyle-article-writer");
    expect(result.metadata.selectedSkillId).toBe("lifestyle-article-writer");
  });

  it("should calculate costCredits from executeSkillLlmWithFallback result (not hardcoded 0)", async () => {
    vi.mocked(calculateCreditsForLLMDynamic).mockResolvedValue(42);

    const result = await executeTeamRunSkillTurn(makeInput());

    expect(result.costCredits).toBe(42);
    expect(result.costCredits).not.toBe(0);
    expect(calculateCreditsForLLMDynamic).toHaveBeenCalledWith(500, 300, "gpt-4o");
  });

  it("should parse nextSpeakerHint from LLM response content", async () => {
    vi.mocked(executeSkillLlmWithFallback).mockResolvedValue(
      makeFallbackResult({ content: "Great analysis of the topic. [NEXT: Content Director]" }) as any,
    );

    const result = await executeTeamRunSkillTurn(makeInput());

    expect(result.nextSpeakerHint).toBe("Content Director");
    expect(result.content).not.toContain("[NEXT:");
    expect(result.content).toBe("Great analysis of the topic.");
  });

  it("should return undefined nextSpeakerHint when no hint in content", async () => {
    vi.mocked(executeSkillLlmWithFallback).mockResolvedValue(
      makeFallbackResult({ content: "Great analysis of the topic." }) as any,
    );

    const result = await executeTeamRunSkillTurn(makeInput());

    expect(result.nextSpeakerHint).toBeUndefined();
    expect(result.content).toBe("Great analysis of the topic.");
  });
});

describe("executeTeamRunSkillTurn — skill resolution", () => {
  it("should use route.selectedSkillId when available", async () => {
    const customSkill = makeSkill({ id: "custom-skill", systemPrompt: "Custom prompt" });
    vi.mocked(getSkillByIdAsync).mockResolvedValue(customSkill as any);

    const result = await executeTeamRunSkillTurn(
      makeInput({ route: { route: "skill", reason: "detected", selectedSkillId: "custom-skill" } }),
    );

    expect(getSkillByIdAsync).toHaveBeenCalledWith("custom-skill");
    expect(result.skillId).toBe("custom-skill");
  });

  it("should fall back to general skill when selectedSkillId not found", async () => {
    const fallbackSkill = makeSkill({ id: "general-article-writer", systemPrompt: "General fallback" });
    vi.mocked(getSkillByIdAsync)
      .mockResolvedValueOnce(undefined as any)  // nonexistent-skill not found
      .mockResolvedValueOnce(fallbackSkill as any);  // general-article-writer found

    const result = await executeTeamRunSkillTurn(
      makeInput({ route: { route: "skill", reason: "detected", selectedSkillId: "nonexistent-skill" } }),
    );

    expect(result.skillId).toBe("general-article-writer");
  });

  it("should throw when no skill can be resolved", async () => {
    vi.mocked(getSkillByIdAsync).mockResolvedValue(undefined as any);

    await expect(
      executeTeamRunSkillTurn(
        makeInput({ route: { route: "skill", reason: "detected", selectedSkillId: "nonexistent-skill" } }),
      ),
    ).rejects.toThrow(/No skill resolved/);
  });
});

describe("executeTeamRunSkillTurn — no Python dependency", () => {
  it("should not import teamOrchestrationBridge", () => {
    const sourceFile = path.resolve(__dirname, "../teamRunSkillExecutor.ts");
    const source = fs.readFileSync(sourceFile, "utf-8");
    expect(source).not.toContain("teamOrchestrationBridge");
  });

  it("should not reference TEAM_DISCUSSION_SKILL_ID", () => {
    const sourceFile = path.resolve(__dirname, "../teamRunSkillExecutor.ts");
    const source = fs.readFileSync(sourceFile, "utf-8");
    expect(source).not.toContain("TEAM_DISCUSSION_SKILL_ID");
  });

  it("should not contain formatPromptMessagesForAgent", () => {
    const sourceFile = path.resolve(__dirname, "../teamRunSkillExecutor.ts");
    const source = fs.readFileSync(sourceFile, "utf-8");
    expect(source).not.toContain("formatPromptMessagesForAgent");
  });

  it("should not contain isLlmStyleSkill", () => {
    const sourceFile = path.resolve(__dirname, "../teamRunSkillExecutor.ts");
    const source = fs.readFileSync(sourceFile, "utf-8");
    expect(source).not.toContain("isLlmStyleSkill");
  });

  it("should not contain isTeamRunEligibleSkill", () => {
    const sourceFile = path.resolve(__dirname, "../teamRunSkillExecutor.ts");
    const source = fs.readFileSync(sourceFile, "utf-8");
    expect(source).not.toContain("isTeamRunEligibleSkill");
  });
});
