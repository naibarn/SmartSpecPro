import { describe, it, expect } from "vitest";
import {
  resolveModelFromPlan,
  buildModelResolutionSnapshot,
  type ModelResolutionSnapshot,
} from "./modelResolver";
import type { TaskExecutionPlan } from "./taskExecutionPlanner";
import type { EnabledModelWithCapabilities } from "./capabilityRegistry";

const makeModel = (
  modelId: string,
  providerName: string,
  overrides: Partial<EnabledModelWithCapabilities["capabilities"]> = {},
  pricing: { pricingInput?: number; pricingOutput?: number; isFree?: boolean } = {},
): EnabledModelWithCapabilities & {
  pricingInput: number;
  pricingOutput: number;
  isFree: boolean;
} => ({
  modelId,
  providerModelId: modelId,
  providerName,
  capabilities: {
    supportsResponses: false,
    supportsStructuredOutputs: false,
    supportsWebSearch: false,
    supportsFunctionTools: false,
    supportsCodeExecution: false,
    supportsComputerUse: false,
    supportsBackground: false,
    ...overrides,
  },
  pricingInput: pricing.pricingInput ?? 1,
  pricingOutput: pricing.pricingOutput ?? 2,
  isFree: pricing.isFree ?? false,
});

const basePlan: TaskExecutionPlan = {
  version: 1,
  taskType: "chat",
  complexity: "simple",
  requirements: {},
  strategy: "cheapest",
  createdAt: new Date().toISOString(),
};

describe("modelResolver", () => {
  describe("resolveModelFromPlan", () => {
    it("returns null when no models available", () => {
      const result = resolveModelFromPlan(basePlan, []);
      expect(result).toBeNull();
    });

    it("returns the only available model when one model exists", () => {
      const models = [makeModel("gpt-4o", "openai")];
      const result = resolveModelFromPlan(basePlan, models);
      expect(result?.modelId).toBe("gpt-4o");
    });

    it("selects cheapest model when strategy is 'cheapest'", () => {
      const models = [
        makeModel("gpt-4o", "openai", {}, { pricingInput: 10, pricingOutput: 20 }),
        makeModel("gpt-4o-mini", "openai", {}, { pricingInput: 1, pricingOutput: 2 }),
        makeModel("claude-3", "anthropic", {}, { pricingInput: 5, pricingOutput: 10 }),
      ];
      const result = resolveModelFromPlan(
        { ...basePlan, strategy: "cheapest" },
        models,
      );
      expect(result?.modelId).toBe("gpt-4o-mini");
    });

    it("prefers free models in cheapest strategy", () => {
      const models = [
        makeModel("gpt-4o", "openai", {}, { pricingInput: 10, pricingOutput: 20 }),
        makeModel("free-model", "local", {}, { isFree: true, pricingInput: 0, pricingOutput: 0 }),
      ];
      const result = resolveModelFromPlan(
        { ...basePlan, strategy: "cheapest" },
        models,
      );
      expect(result?.modelId).toBe("free-model");
    });

    it("filters by capability requirements", () => {
      const models = [
        makeModel("gpt-4o-mini", "openai", { supportsResponses: false }, { pricingInput: 1 }),
        makeModel("gpt-4o", "openai", { supportsResponses: true }, { pricingInput: 10 }),
      ];
      const result = resolveModelFromPlan(
        { ...basePlan, requirements: { supportsResponses: true } },
        models,
      );
      expect(result?.modelId).toBe("gpt-4o");
    });

    it("returns null when no model meets requirements", () => {
      const models = [
        makeModel("gpt-4o-mini", "openai", { supportsComputerUse: false }),
      ];
      const result = resolveModelFromPlan(
        { ...basePlan, requirements: { supportsComputerUse: true } },
        models,
      );
      expect(result).toBeNull();
    });

    it("returns first model when strategy is 'fastest' (preserves input order)", () => {
      const models = [
        makeModel("gpt-4o", "openai", {}, { pricingInput: 10 }),
        makeModel("gpt-4o-mini", "openai", {}, { pricingInput: 1 }),
      ];
      const result = resolveModelFromPlan(
        { ...basePlan, strategy: "fastest" },
        models,
      );
      expect(result?.modelId).toBe("gpt-4o");
    });

    it("applies disallowedModels filter from plan", () => {
      const models = [
        makeModel("gpt-4o", "openai", {}, { pricingInput: 1 }),
        makeModel("gpt-4o-mini", "openai", {}, { pricingInput: 2 }),
      ];
      const result = resolveModelFromPlan(
        { ...basePlan, disallowedModels: ["gpt-4o"] },
        models,
      );
      expect(result?.modelId).toBe("gpt-4o-mini");
    });
  });

  describe("buildModelResolutionSnapshot", () => {
    it("captures all required fields", () => {
      const model = makeModel("gpt-4o", "openai", {}, { pricingInput: 5, pricingOutput: 10 });
      const snapshot = buildModelResolutionSnapshot(model, 0);
      expect(snapshot).toEqual(
        expect.objectContaining({
          modelId: "gpt-4o",
          providerModelId: "gpt-4o",
          providerName: "openai",
          pricingInput: 5,
          pricingOutput: 10,
          isFree: false,
          attemptIndex: 0,
          resolvedAt: expect.any(String),
        }),
      );
    });

    it("increments attemptIndex for fallbacks", () => {
      const model = makeModel("gpt-4o", "openai");
      const snapshot = buildModelResolutionSnapshot(model, 2, "rate_limited");
      expect(snapshot.attemptIndex).toBe(2);
      expect(snapshot.fallbackReason).toBe("rate_limited");
    });

    it("omits fallbackReason on first attempt", () => {
      const model = makeModel("gpt-4o", "openai");
      const snapshot = buildModelResolutionSnapshot(model, 0);
      expect(snapshot.fallbackReason).toBeUndefined();
    });
  });
});
