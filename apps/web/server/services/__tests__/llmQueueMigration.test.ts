/**
 * Tests for migrating LLM queues from BullMQ to in-process + Cloud Tasks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Cloud Tasks
vi.mock("../../services/cloudTasks", () => ({
  enqueueTask: vi.fn().mockResolvedValue("projects/p/locations/l/queues/q/tasks/skill-123"),
}));

// Mock credit service
vi.mock("../../services/creditService", () => ({
  deductCreditsForModel: vi.fn().mockResolvedValue(undefined),
}));

// Mock logger
vi.mock("../../_core/logger", () => ({
  debugLog: vi.fn(),
  debugError: vi.fn(),
}));

// Mock redis
vi.mock("../../services/redis", () => ({
  createRedisConnection: vi.fn(),
  isRedisAvailable: vi.fn().mockReturnValue(false),
}));

describe("LLM Queue Migration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.USE_CLOUD_TASKS = "true";
  });

  afterEach(() => {
    delete process.env.USE_CLOUD_TASKS;
  });

  it("should process credit deductions synchronously when BullMQ is removed", async () => {
    const { addCreditJob } = await import("../../services/llmQueue");
    const { deductCreditsForModel } = await import("../../services/creditService");

    const result = await addCreditJob({
      userId: 1,
      model: "gpt-4o-mini",
      provider: "openai",
      inputTokens: 100,
      outputTokens: 50,
    });

    // Should call deductCreditsForModel directly (in-process)
    expect(deductCreditsForModel).toHaveBeenCalledWith({
      userId: 1,
      model: "gpt-4o-mini",
      provider: "openai",
      inputTokens: 100,
      outputTokens: 50,
    });

    expect(result).toBe("sync");
  });

  it("should process usage logging synchronously", async () => {
    const { addUsageJob } = await import("../../services/llmQueue");

    const result = await addUsageJob({
      userId: 1,
      conversationId: 10,
      messageId: 100,
      model: "gpt-4o-mini",
      provider: "openai",
      inputTokens: 200,
      outputTokens: 100,
      creditsUsed: 5,
      timestamp: new Date(),
    });

    // Should process in-process (no BullMQ queue interaction)
    expect(result).toBe("sync");
  });

  it("should enqueue multi-step skill jobs to Cloud Tasks workflow-tasks queue", async () => {
    const { addSkillJob } = await import("../../services/llmQueue");
    const { enqueueTask } = await import("../../services/cloudTasks");

    const result = await addSkillJob({
      userId: 1,
      skillId: "test-skill",
      skillName: "Test Skill",
      conversationId: 10,
      steps: [
        { id: "step1", type: "llm", config: {} },
        { id: "step2", type: "code", config: {} },
      ],
      currentStep: 0,
      context: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(enqueueTask).toHaveBeenCalledWith(
      expect.objectContaining({
        queueName: "workflow-tasks",
        handlerPath: "/_internal/tasks/execute-skill-step",
        payload: expect.objectContaining({
          userId: 1,
          skillId: "test-skill",
          skillName: "Test Skill",
        }),
      })
    );

    expect(result).toBe("projects/p/locations/l/queues/q/tasks/skill-123");
  });

  it("should return in-memory stats from getAllQueueStats", async () => {
    const { getAllQueueStats } = await import("../../services/llmQueue");

    const stats = getAllQueueStats();
    expect(Array.isArray(stats)).toBe(true);
    // Should return stats objects (even if empty)
    for (const stat of stats) {
      expect(stat).toHaveProperty("name");
      expect(stat).toHaveProperty("completed");
      expect(stat).toHaveProperty("failed");
    }
  });
});
