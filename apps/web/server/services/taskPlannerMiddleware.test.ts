/**
 * Tests for taskPlannerMiddleware.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies
vi.mock("./taskExecutionPlanner", () => ({
  buildExecutionPlan: vi.fn(),
}));
vi.mock("./modelResolver", () => ({
  resolveModelFromPlan: vi.fn(),
  buildModelResolutionSnapshot: vi.fn(),
}));
vi.mock("./taskRunStore", () => ({
  createTaskRun: vi.fn(),
  createStepAttempt: vi.fn(),
  completeStepAttempt: vi.fn(),
}));
vi.mock("./capabilityRegistry", () => ({
  loadEnabledModelsWithCapabilities: vi.fn(),
  loadEnabledModelsWithPricing: vi.fn(),
}));
vi.mock("./featureFlags", () => ({
  getTenantFeatureFlag: vi.fn(),
}));
vi.mock("./traceContext", () => ({
  getTraceId: vi.fn(),
}));
vi.mock("./enabledLlmModels", () => ({
  resolveEnabledLlmModelId: vi.fn(),
}));
vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

import { runPlanner, recordStepAttempt, type PlannerInput } from "./taskPlannerMiddleware";
import { buildExecutionPlan } from "./taskExecutionPlanner";
import { resolveModelFromPlan, buildModelResolutionSnapshot } from "./modelResolver";
import { createTaskRun, createStepAttempt, completeStepAttempt } from "./taskRunStore";
import { loadEnabledModelsWithPricing } from "./capabilityRegistry";
import { getTenantFeatureFlag } from "./featureFlags";
import { getTraceId } from "./traceContext";

const mockBuildExecutionPlan = vi.mocked(buildExecutionPlan);
const mockResolveModelFromPlan = vi.mocked(resolveModelFromPlan);
const mockBuildSnapshot = vi.mocked(buildModelResolutionSnapshot);
const mockCreateTaskRun = vi.mocked(createTaskRun);
const mockCreateStepAttempt = vi.mocked(createStepAttempt);
const mockCompleteStepAttempt = vi.mocked(completeStepAttempt);
const mockLoadModelsWithPricing = vi.mocked(loadEnabledModelsWithPricing);
const mockGetTenantFeatureFlag = vi.mocked(getTenantFeatureFlag);
const mockGetTraceId = vi.mocked(getTraceId);

const basePlannerInput: PlannerInput = {
  sourceType: "chat",
  userId: 1,
  tenantId: "tenant-1",
  conversationModel: "gpt-4o",
};

const fakePlan = {
  version: 1 as const,
  taskType: "chat" as const,
  complexity: "simple" as const,
  requirements: {},
  strategy: "fastest" as const,
  createdAt: "2026-01-01T00:00:00Z",
};

const fakeModel = {
  modelId: "gpt-4o",
  providerModelId: "gpt-4o",
  providerName: "openai",
  pricingInput: 2.5,
  pricingOutput: 10,
  isFree: false,
  capabilities: {},
};

const fakeSnapshot = {
  modelId: "gpt-4o",
  providerModelId: "gpt-4o",
  providerName: "openai",
  pricingInput: 2.5,
  pricingOutput: 10,
  isFree: false,
  attemptIndex: 0,
  resolvedAt: "2026-01-01T00:00:00Z",
};

describe("taskPlannerMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadModelsWithPricing.mockResolvedValue([]);
  });

  describe("runPlanner", () => {
    it("returns null when taskPlannerEnabled=false", async () => {
      mockGetTenantFeatureFlag.mockResolvedValue(false);

      const result = await runPlanner(basePlannerInput);

      expect(result).toBeNull();
      expect(mockGetTenantFeatureFlag).toHaveBeenCalledWith(
        "taskPlannerEnabled",
        "tenant-1",
      );
      // Should not call any planner modules
      expect(mockBuildExecutionPlan).not.toHaveBeenCalled();
    });

    it("returns PlannerResult with plannerLatencyMs when enabled", async () => {
      mockGetTenantFeatureFlag.mockResolvedValue(true);
      mockBuildExecutionPlan.mockReturnValue(fakePlan);
      mockCreateTaskRun.mockResolvedValue({ id: 42 });
      mockResolveModelFromPlan.mockReturnValue(fakeModel as any);
      mockBuildSnapshot.mockReturnValue(fakeSnapshot as any);
      mockGetTraceId.mockReturnValue("trace-abc");

      const result = await runPlanner(basePlannerInput);

      expect(result).not.toBeNull();
      expect(typeof result!.plannerLatencyMs).toBe("number");
      expect(isFinite(result!.plannerLatencyMs)).toBe(true);
      expect(result!.plannerLatencyMs).toBeGreaterThanOrEqual(0);
      expect(result!.taskRunId).toBe(42);
      expect(result!.resolvedModel).toBe("gpt-4o");
      expect(result).not.toHaveProperty("shadowMode");
    });

    it("planner-selected model is always returned (no shadow mode check)", async () => {
      mockGetTenantFeatureFlag.mockResolvedValue(true);
      mockBuildExecutionPlan.mockReturnValue(fakePlan);
      mockCreateTaskRun.mockResolvedValue({ id: 43 });
      mockResolveModelFromPlan.mockReturnValue(fakeModel as any);
      mockBuildSnapshot.mockReturnValue(fakeSnapshot as any);
      mockGetTraceId.mockReturnValue(undefined);

      const result = await runPlanner(basePlannerInput);

      expect(result).not.toBeNull();
      expect(result!.resolvedModel).toBe("gpt-4o");
      // Only one feature flag check (taskPlannerEnabled), no SHADOW_MODE
      expect(mockGetTenantFeatureFlag).toHaveBeenCalledTimes(1);
      expect(mockGetTenantFeatureFlag).toHaveBeenCalledWith(
        "taskPlannerEnabled",
        "tenant-1",
      );
    });

    it("returns null on internal error (never throws)", async () => {
      mockGetTenantFeatureFlag.mockResolvedValue(true);
      mockBuildExecutionPlan.mockImplementation(() => {
        throw new Error("plan build failed");
      });

      const result = await runPlanner(basePlannerInput);

      expect(result).toBeNull();
    });

    it("creates task_runs record via createTaskRun", async () => {
      mockGetTenantFeatureFlag.mockResolvedValue(true);
      mockBuildExecutionPlan.mockReturnValue(fakePlan);
      mockCreateTaskRun.mockResolvedValue({ id: 44 });
      mockResolveModelFromPlan.mockReturnValue(fakeModel as any);
      mockBuildSnapshot.mockReturnValue(fakeSnapshot as any);
      mockGetTraceId.mockReturnValue("trace-xyz");

      await runPlanner(basePlannerInput);

      expect(mockCreateTaskRun).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          tenantId: "tenant-1",
          plan: fakePlan,
          sourceType: "chat",
          traceId: "trace-xyz",
        }),
      );
    });

    it("resolves model from plan via resolveModelFromPlan", async () => {
      mockGetTenantFeatureFlag.mockResolvedValue(true);
      mockBuildExecutionPlan.mockReturnValue(fakePlan);
      mockCreateTaskRun.mockResolvedValue({ id: 45 });
      mockResolveModelFromPlan.mockReturnValue(fakeModel as any);
      mockBuildSnapshot.mockReturnValue(fakeSnapshot as any);
      mockGetTraceId.mockReturnValue(undefined);

      await runPlanner(basePlannerInput);

      expect(mockResolveModelFromPlan).toHaveBeenCalledWith(
        fakePlan,
        expect.any(Array),
      );
    });

    it("passes traceId from trace context", async () => {
      mockGetTenantFeatureFlag.mockResolvedValue(true);
      mockBuildExecutionPlan.mockReturnValue(fakePlan);
      mockCreateTaskRun.mockResolvedValue({ id: 46 });
      mockResolveModelFromPlan.mockReturnValue(fakeModel as any);
      mockBuildSnapshot.mockReturnValue(fakeSnapshot as any);
      mockGetTraceId.mockReturnValue("trace-123");

      await runPlanner(basePlannerInput);

      expect(mockCreateTaskRun).toHaveBeenCalledWith(
        expect.objectContaining({ traceId: "trace-123" }),
      );
    });

    it("passes sourceType correctly for each entry point type", async () => {
      mockGetTenantFeatureFlag.mockResolvedValue(true);
      mockBuildExecutionPlan.mockReturnValue(fakePlan);
      mockCreateTaskRun.mockResolvedValue({ id: 47 });
      mockResolveModelFromPlan.mockReturnValue(fakeModel as any);
      mockBuildSnapshot.mockReturnValue(fakeSnapshot as any);
      mockGetTraceId.mockReturnValue(undefined);

      for (const sourceType of ["chat", "stream", "channel", "scheduled", "translation", "memory"]) {
        vi.clearAllMocks();
        mockGetTenantFeatureFlag.mockResolvedValue(true);
        mockBuildExecutionPlan.mockReturnValue(fakePlan);
        mockCreateTaskRun.mockResolvedValue({ id: 47 });
        mockResolveModelFromPlan.mockReturnValue(fakeModel as any);
        mockBuildSnapshot.mockReturnValue(fakeSnapshot as any);

        await runPlanner({ ...basePlannerInput, sourceType });

        expect(mockCreateTaskRun).toHaveBeenCalledWith(
          expect.objectContaining({ sourceType }),
        );
      }
    });

    it("handles null resolved model gracefully", async () => {
      mockGetTenantFeatureFlag.mockResolvedValue(true);
      mockBuildExecutionPlan.mockReturnValue(fakePlan);
      mockCreateTaskRun.mockResolvedValue({ id: 48 });
      mockResolveModelFromPlan.mockReturnValue(null);
      mockGetTraceId.mockReturnValue(undefined);

      const result = await runPlanner(basePlannerInput);

      expect(result).not.toBeNull();
      expect(result!.resolvedModel).toBeNull();
      expect(result!.snapshot).toBeNull();
    });

    it("legacy fallback only triggers when planner returns null", async () => {
      // When planner is disabled, it returns null → caller should use legacy
      mockGetTenantFeatureFlag.mockResolvedValue(false);

      const result = await runPlanner(basePlannerInput);
      expect(result).toBeNull();

      // When planner is enabled and resolves a model, caller uses planner model
      mockGetTenantFeatureFlag.mockResolvedValue(true);
      mockBuildExecutionPlan.mockReturnValue(fakePlan);
      mockCreateTaskRun.mockResolvedValue({ id: 49 });
      mockResolveModelFromPlan.mockReturnValue(fakeModel as any);
      mockBuildSnapshot.mockReturnValue(fakeSnapshot as any);
      mockGetTraceId.mockReturnValue(undefined);

      const result2 = await runPlanner(basePlannerInput);
      expect(result2).not.toBeNull();
      expect(result2!.resolvedModel).toBe("gpt-4o");
    });
  });

  describe("recordStepAttempt", () => {
    it("calls createStepAttempt + completeStepAttempt", async () => {
      mockCreateStepAttempt.mockResolvedValue({ id: 100 });
      mockCompleteStepAttempt.mockResolvedValue(undefined);

      await recordStepAttempt({
        taskRunId: 42,
        plan: fakePlan,
        model: "gpt-4o",
        provider: "openai",
        inputTokens: 100,
        outputTokens: 50,
        costUsd: "0.001",
        durationMs: 500,
        snapshot: fakeSnapshot as any,
      });

      expect(mockCreateStepAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          taskRunId: 42,
          attemptIndex: 0,
          snapshot: fakeSnapshot,
          strategy: "fastest",
        }),
      );
      expect(mockCompleteStepAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          stepAttemptId: 100,
          inputTokens: 100,
          outputTokens: 50,
          costUsd: "0.001",
          durationMs: 500,
          status: "completed",
        }),
      );
    });

    it("silently catches errors (never throws)", async () => {
      mockCreateStepAttempt.mockRejectedValue(new Error("db error"));

      // Should NOT throw
      await expect(
        recordStepAttempt({
          taskRunId: 42,
          plan: fakePlan,
          model: "gpt-4o",
          provider: "openai",
          inputTokens: 100,
          outputTokens: 50,
          costUsd: "0.001",
          durationMs: 500,
          snapshot: fakeSnapshot as any,
        }),
      ).resolves.toBeUndefined();
    });
  });
});
