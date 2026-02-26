import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the sandbox module before importing skillExecutor
vi.mock("../sandbox", () => ({
  isSandboxEnabled: vi.fn(() => false),
  shouldUseSandboxForFeature: vi.fn(() => false),
  getDispatchMode: vi.fn(() => "optional"),
  dispatchToSandbox: vi.fn(),
}));

// Mock heavy dependencies to isolate skill executor logic
vi.mock("../redis", () => ({ getRedisClient: vi.fn(() => ({ setex: vi.fn() })) }));
vi.mock("../mediaGenerationService", () => ({
  mediaGenerationService: { generateImage: vi.fn(), generateVideoAsync: vi.fn(), generateAudio: vi.fn() },
}));
vi.mock("../creditService", () => ({ hasEnoughCredits: vi.fn(() => true) }));
vi.mock("../modelRegistry", () => ({
  getModelById: vi.fn(),
  getDefaultModel: vi.fn(),
  mapToApiModelId: vi.fn((id: string) => id),
  getModelsByTypeAsync: vi.fn(),
}));
vi.mock("../pricingCalculator", () => ({ calculateCreditCost: vi.fn(() => 1) }));

import { executeSkill } from "../skillExecutor";
import type { SkillExecutionParams } from "../skillExecutor";
import type { SkillDefinition } from "@smartspec/skills";
import {
  isSandboxEnabled,
  shouldUseSandboxForFeature,
  getDispatchMode,
  dispatchToSandbox,
} from "../sandbox";

function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    id: "test-skill",
    name: "Test Skill",
    description: "A test skill",
    icon: "sparkles",
    type: "chat-assistant",
    triggers: [],
    requiresExplicit: false,
    creditMultiplier: 1,
    enabledByDefault: true,
    priority: 50,
    executionMode: "llm-only",
    ...overrides,
  };
}

const defaultParams: SkillExecutionParams = {
  prompt: "test prompt",
};

describe("skillExecutor sandbox dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.OPENSANDBOX_ENABLED;
  });

  it("routes core-text to LLM text path", async () => {
    const skill = makeSkill({ executionMode: "core-text" });
    const result = await executeSkill(skill, defaultParams, 1, "token");
    expect(result.type).toBe("text");
    expect(result.success).toBe(true);
    expect(dispatchToSandbox).not.toHaveBeenCalled();
  });

  it("routes llm-only to LLM text path (backward compat)", async () => {
    const skill = makeSkill({ executionMode: "llm-only" });
    const result = await executeSkill(skill, defaultParams, 1, "token");
    expect(result.type).toBe("text");
    expect(result.success).toBe(true);
    expect(dispatchToSandbox).not.toHaveBeenCalled();
  });

  it("routes enhance-prompt to LLM text path", async () => {
    const skill = makeSkill({ executionMode: "enhance-prompt" as any });
    const result = await executeSkill(skill, defaultParams, 1, "token");
    expect(result.type).toBe("text");
    expect(result.success).toBe(true);
  });

  it("dispatches sandbox-code to sandbox when enabled", async () => {
    vi.mocked(isSandboxEnabled).mockReturnValue(true);
    vi.mocked(shouldUseSandboxForFeature).mockReturnValue(true);
    vi.mocked(dispatchToSandbox).mockResolvedValue({ jobId: "job-123" });

    const skill = makeSkill({ executionMode: "sandbox-code" });
    const result = await executeSkill(skill, defaultParams, 1, "token");

    expect(result.type).toBe("sandbox-job");
    expect(result.jobId).toBe("job-123");
    expect(result.success).toBe(true);
    expect(result.isAsync).toBe(true);
  });

  it("dispatches sandbox-command to sandbox when enabled", async () => {
    vi.mocked(isSandboxEnabled).mockReturnValue(true);
    vi.mocked(shouldUseSandboxForFeature).mockReturnValue(true);
    vi.mocked(dispatchToSandbox).mockResolvedValue({ jobId: "job-456" });

    const skill = makeSkill({ executionMode: "sandbox-command" });
    const result = await executeSkill(skill, defaultParams, 1, "token");

    expect(result.type).toBe("sandbox-job");
    expect(result.jobId).toBe("job-456");
  });

  it("dispatches sandbox-browser to sandbox when enabled", async () => {
    vi.mocked(isSandboxEnabled).mockReturnValue(true);
    vi.mocked(shouldUseSandboxForFeature).mockReturnValue(true);
    vi.mocked(dispatchToSandbox).mockResolvedValue({ jobId: "job-789" });

    const skill = makeSkill({ executionMode: "sandbox-browser" });
    const result = await executeSkill(skill, defaultParams, 1, "token");
    expect(result.type).toBe("sandbox-job");
  });

  it("dispatches sandbox-media to sandbox when enabled", async () => {
    vi.mocked(isSandboxEnabled).mockReturnValue(true);
    vi.mocked(shouldUseSandboxForFeature).mockReturnValue(true);
    vi.mocked(dispatchToSandbox).mockResolvedValue({ jobId: "job-media" });

    const skill = makeSkill({ executionMode: "sandbox-media" });
    const result = await executeSkill(skill, defaultParams, 1, "token");
    expect(result.type).toBe("sandbox-job");
  });

  it("falls back to legacy when sandbox disabled for sandbox-code", async () => {
    vi.mocked(isSandboxEnabled).mockReturnValue(false);
    vi.mocked(shouldUseSandboxForFeature).mockReturnValue(false);

    // sandbox-code falls through to the default case since sandbox is disabled
    const skill = makeSkill({ executionMode: "sandbox-code", type: "chat-assistant" });
    const result = await executeSkill(skill, defaultParams, 1, "token");
    // Should not be a sandbox-job since sandbox is disabled
    expect(result.type).not.toBe("sandbox-job");
  });

  it("returns error when dispatch required but disabled", async () => {
    vi.mocked(isSandboxEnabled).mockReturnValue(false);
    vi.mocked(shouldUseSandboxForFeature).mockImplementation(() => {
      throw new Error("Sandbox required but disabled");
    });
    vi.mocked(getDispatchMode).mockReturnValue("required");

    const skill = makeSkill({ executionMode: "sandbox-code" });
    const result = await executeSkill(skill, defaultParams, 1, "token");
    expect(result.success).toBe(false);
    expect(result.error).toContain("required but unavailable");
  });

  it("result shape matches SkillExecutionResult for sandbox-job", async () => {
    vi.mocked(isSandboxEnabled).mockReturnValue(true);
    vi.mocked(shouldUseSandboxForFeature).mockReturnValue(true);
    vi.mocked(dispatchToSandbox).mockResolvedValue({ jobId: "job-shape-test" });

    const skill = makeSkill({ executionMode: "sandbox-code" });
    const result = await executeSkill(skill, defaultParams, 1, "token");

    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("skillId");
    expect(result).toHaveProperty("type");
    expect(result).toHaveProperty("jobId");
    expect(result).toHaveProperty("isAsync");
    expect(result).toHaveProperty("message");
  });

  it("media-generate dispatches to sandbox when sandbox enabled", async () => {
    vi.mocked(isSandboxEnabled).mockReturnValue(true);
    vi.mocked(shouldUseSandboxForFeature).mockReturnValue(true);
    vi.mocked(dispatchToSandbox).mockResolvedValue({ jobId: "job-media-migrate" });

    const skill = makeSkill({ executionMode: "media-generate", type: "image-generation" });
    const result = await executeSkill(skill, defaultParams, 1, "token");
    expect(result.type).toBe("sandbox-job");
  });
});
