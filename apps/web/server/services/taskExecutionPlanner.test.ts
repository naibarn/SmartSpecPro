import { describe, it, expect } from "vitest";
import {
  classifyTaskType,
  classifyComplexity,
  buildExecutionPlan,
  validatePlanVersion,
  CURRENT_PLAN_VERSION,
  type TaskClassificationInput,
  type TaskExecutionPlan,
} from "./taskExecutionPlanner";
import { buildBillingMetadata } from "./taskRunStore";
import type { ModelResolutionSnapshot } from "./modelResolver";

describe("taskExecutionPlanner", () => {
  describe("classifyTaskType", () => {
    it("classifies a chat message as 'chat'", () => {
      const result = classifyTaskType({
        sourceType: "chat",
      });
      expect(result).toBe("chat");
    });

    it("classifies a skill invocation as 'skill'", () => {
      const result = classifyTaskType({
        sourceType: "skill",
        skillSlug: "image_prompt_engineer",
      });
      expect(result).toBe("skill");
    });

    it("classifies media_image source as 'media'", () => {
      const result = classifyTaskType({
        sourceType: "media_image",
      });
      expect(result).toBe("media");
    });

    it("classifies media_video source as 'media'", () => {
      const result = classifyTaskType({
        sourceType: "media_video",
      });
      expect(result).toBe("media");
    });

    it("classifies browser_automation as 'responses'", () => {
      const result = classifyTaskType({
        sourceType: "browser_automation",
      });
      expect(result).toBe("responses");
    });

    it("classifies agency source as 'agency'", () => {
      const result = classifyTaskType({
        sourceType: "agency",
      });
      expect(result).toBe("agency");
    });

    it("classifies unknown source as 'chat' by default", () => {
      const result = classifyTaskType({
        sourceType: "other",
      });
      expect(result).toBe("chat");
    });
  });

  describe("classifyComplexity", () => {
    it("classifies simple chat as 'simple'", () => {
      const result = classifyComplexity({
        taskType: "chat",
        hasTools: false,
        hasMultipleSteps: false,
      });
      expect(result).toBe("simple");
    });

    it("classifies chat with tools as 'moderate'", () => {
      const result = classifyComplexity({
        taskType: "chat",
        hasTools: true,
        hasMultipleSteps: false,
      });
      expect(result).toBe("moderate");
    });

    it("classifies agency tasks as 'complex'", () => {
      const result = classifyComplexity({
        taskType: "agency",
        hasTools: false,
        hasMultipleSteps: true,
      });
      expect(result).toBe("complex");
    });

    it("classifies multi-step tasks as 'moderate' or above", () => {
      const result = classifyComplexity({
        taskType: "skill",
        hasTools: false,
        hasMultipleSteps: true,
      });
      expect(["moderate", "complex"]).toContain(result);
    });

    it("classifies responses tasks with tools as 'moderate'", () => {
      const result = classifyComplexity({
        taskType: "responses",
        hasTools: true,
        hasMultipleSteps: false,
      });
      expect(result).toBe("moderate");
    });
  });

  describe("buildExecutionPlan", () => {
    const baseInput: TaskClassificationInput = {
      sourceType: "chat",
      userId: 1,
      tenantId: "tenant-1",
    };

    it("produces a plan with required fields", () => {
      const plan = buildExecutionPlan(baseInput);
      expect(plan).toHaveProperty("version", 1);
      expect(plan).toHaveProperty("taskType");
      expect(plan).toHaveProperty("complexity");
      expect(plan).toHaveProperty("requirements");
      expect(plan).toHaveProperty("strategy");
      expect(plan).toHaveProperty("createdAt");
    });

    it("plan is serializable to JSON", () => {
      const plan = buildExecutionPlan(baseInput);
      const json = JSON.stringify(plan);
      const parsed = JSON.parse(json);
      expect(parsed.version).toBe(1);
      expect(parsed.taskType).toBe(plan.taskType);
    });

    it("includes skill policy requirements when skill policy provided", () => {
      const plan = buildExecutionPlan({
        ...baseInput,
        sourceType: "skill",
        skillSlug: "test-skill",
        executionPolicy: {
          mode: "requirements",
          requirements: { supportsResponses: true },
          preferredStrategy: "cheapest",
        },
      });
      expect(plan.requirements).toEqual(
        expect.objectContaining({ supportsResponses: true }),
      );
      expect(plan.strategy).toBe("cheapest");
    });

    it("defaults strategy to 'cheapest' when no policy", () => {
      const plan = buildExecutionPlan(baseInput);
      expect(plan.strategy).toBe("cheapest");
    });

    it("preserves budgetClass from execution policy", () => {
      const plan = buildExecutionPlan({
        ...baseInput,
        sourceType: "skill",
        executionPolicy: {
          mode: "requirements",
          budgetClass: "premium",
        },
      });
      expect(plan.budgetClass).toBe("premium");
    });

    it("plan has immutable-safe createdAt timestamp", () => {
      const before = Date.now();
      const plan = buildExecutionPlan(baseInput);
      const after = Date.now();
      const planTime = new Date(plan.createdAt).getTime();
      expect(planTime).toBeGreaterThanOrEqual(before);
      expect(planTime).toBeLessThanOrEqual(after);
    });

    it("includes conversationModel in plan context when provided", () => {
      const plan = buildExecutionPlan({
        ...baseInput,
        conversationModel: "gpt-4o",
      });
      expect(plan.context?.conversationModel).toBe("gpt-4o");
    });

    it("sets responses requirements for browser_automation tasks", () => {
      const plan = buildExecutionPlan({
        ...baseInput,
        sourceType: "browser_automation",
      });
      expect(plan.requirements?.supportsResponses).toBe(true);
    });

    it("returns a frozen (immutable) plan object", () => {
      const plan = buildExecutionPlan(baseInput);
      expect(Object.isFrozen(plan)).toBe(true);
    });

    it("emits runtime intent when runtime hints are provided", () => {
      const plan = buildExecutionPlan({
        ...baseInput,
        sourceType: "responses",
        hasTools: true,
        hasMultipleSteps: true,
        runtimeHints: {
          connectorCount: 2,
          sideEffectClass: "bounded_write",
          preferredPath: "hybrid",
          requiresApproval: false,
        },
      });
      expect(plan.runtimeIntent).toEqual({
        primaryPath: "hybrid",
        fallbackPaths: ["agency", "workflow"],
        stepUpBoundary: "policy",
      });
    });

    it("moves high-risk desktop work to an approval boundary with desktop-first routing", () => {
      const plan = buildExecutionPlan({
        ...baseInput,
        sourceType: "browser_automation",
        hasTools: true,
        runtimeHints: {
          localityHint: "desktop",
          connectorCount: 1,
          sideEffectClass: "financial",
          requiresApproval: true,
        },
      });
      expect(plan.runtimeIntent).toEqual({
        primaryPath: "desktop_local",
        fallbackPaths: ["worker_fabric"],
        stepUpBoundary: "approval",
      });
    });

    it("prevents mutation of frozen plan", () => {
      const plan = buildExecutionPlan(baseInput);
      expect(() => {
        (plan as any).taskType = "agency";
      }).toThrow();
    });
  });

  describe("validatePlanVersion", () => {
    it("accepts a valid plan", () => {
      const plan = buildExecutionPlan({
        sourceType: "chat",
        userId: 1,
      });
      expect(validatePlanVersion(plan)).toBe(true);
    });

    it("rejects null", () => {
      expect(validatePlanVersion(null)).toBe(false);
    });

    it("rejects a plan with wrong version", () => {
      expect(validatePlanVersion({ version: 999, taskType: "chat", complexity: "simple", strategy: "cheapest", createdAt: "x" })).toBe(false);
    });

    it("rejects an object with missing fields", () => {
      expect(validatePlanVersion({ version: CURRENT_PLAN_VERSION })).toBe(false);
    });
  });

  describe("buildBillingMetadata", () => {
    it("produces complete billing metadata", () => {
      const plan = buildExecutionPlan({
        sourceType: "skill",
        userId: 1,
        skillSlug: "test",
      });
      const snapshot: ModelResolutionSnapshot = {
        modelId: "gpt-4o",
        providerModelId: "gpt-4o",
        providerName: "openai",
        pricingInput: 5,
        pricingOutput: 10,
        isFree: false,
        attemptIndex: 0,
        resolvedAt: new Date().toISOString(),
      };
      const meta = buildBillingMetadata(42, plan, snapshot, "skill");
      expect(meta).toEqual({
        taskRunId: 42,
        strategy: plan.strategy,
        effectiveModel: "gpt-4o",
        provider: "openai",
        attemptIndex: 0,
        sourceType: "skill",
        taskType: "skill",
      });
    });
  });
});
