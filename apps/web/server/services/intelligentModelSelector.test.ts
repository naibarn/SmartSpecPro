import { describe, it, expect } from "vitest";
import {
  computeModelPriority,
  type ModelPriorityInput,
} from "./intelligentModelSelector";

const DAY = 86400; // seconds

describe("computeModelPriority", () => {
  it("returns lower number for newer model (recency wins)", () => {
    const now = Date.now() / 1000;
    const modelA: ModelPriorityInput = { createdAt: now - 7 * DAY }; // 7 days old
    const modelB: ModelPriorityInput = { createdAt: now - 800 * DAY }; // 2+ years old
    expect(computeModelPriority(modelA)).toBeLessThan(
      computeModelPriority(modelB),
    );
  });

  it("returns lower number for free model over paid", () => {
    const modelA: ModelPriorityInput = { isFree: true };
    const modelB: ModelPriorityInput = {
      isFree: false,
      pricingInput: "5",
      pricingOutput: "5",
    };
    expect(computeModelPriority(modelA)).toBeLessThan(
      computeModelPriority(modelB),
    );
  });

  it("returns lower number for model with more capabilities", () => {
    const modelA: ModelPriorityInput = {
      supportsFunctionTools: true,
      supportsStructuredOutputs: true,
      supportsWebSearch: true,
      supportsCodeExecution: true,
      supportsComputerUse: true,
      supportsBackground: true,
      supportsResponses: true,
      supportsVision: true,
    };
    const modelB: ModelPriorityInput = {};
    expect(computeModelPriority(modelA)).toBeLessThan(
      computeModelPriority(modelB),
    );
  });

  it("never returns 0 or negative", () => {
    // Worst case: old model, expensive, no capabilities
    const model: ModelPriorityInput = {
      createdAt: Date.now() / 1000 - 1000 * DAY,
      pricingInput: "50",
      pricingOutput: "50",
    };
    const priority = computeModelPriority(model);
    expect(priority).toBeGreaterThanOrEqual(1);
  });

  it("never returns more than 100", () => {
    // Best case: brand new, free, all capabilities
    const model: ModelPriorityInput = {
      createdAt: Date.now() / 1000,
      isFree: true,
      supportsFunctionTools: true,
      supportsStructuredOutputs: true,
      supportsWebSearch: true,
      supportsCodeExecution: true,
      supportsComputerUse: true,
      supportsBackground: true,
      supportsResponses: true,
      supportsVision: true,
    };
    const priority = computeModelPriority(model);
    expect(priority).toBeLessThanOrEqual(100);
    // Should actually be 1 (the minimum)
    expect(priority).toBe(1);
  });

  it("returns mid-range value for unknown createdAt", () => {
    const now = Date.now() / 1000;
    const unknown: ModelPriorityInput = { createdAt: undefined };
    const recent: ModelPriorityInput = { createdAt: now - 15 * DAY }; // 40 pts
    const old: ModelPriorityInput = { createdAt: now - 500 * DAY }; // 10 pts
    // Unknown gets 15 pts recency, so priority should be between recent and old
    const unknownPriority = computeModelPriority(unknown);
    const recentPriority = computeModelPriority(recent);
    const oldPriority = computeModelPriority(old);
    expect(unknownPriority).toBeGreaterThan(recentPriority);
    expect(unknownPriority).toBeLessThan(oldPriority);
  });

  it("returns mid-range value for unknown pricing", () => {
    const cheap: ModelPriorityInput = { pricingInput: "0.1", pricingOutput: "0.1" };
    const expensive: ModelPriorityInput = { pricingInput: "20", pricingOutput: "20" };
    const unknown: ModelPriorityInput = { pricingInput: null, pricingOutput: null };
    const cheapPriority = computeModelPriority(cheap);
    const expensivePriority = computeModelPriority(expensive);
    const unknownPriority = computeModelPriority(unknown);
    expect(unknownPriority).toBeGreaterThan(cheapPriority);
    expect(unknownPriority).toBeLessThan(expensivePriority);
  });

  it("uses the valid field when only one pricing field is present", () => {
    const partialPrice: ModelPriorityInput = {
      pricingInput: null,
      pricingOutput: "0.30",
    };
    const priority = computeModelPriority(partialPrice);
    // 0.30 avg → cost tier < $0.50 → 25 pts
    const fullCheap: ModelPriorityInput = {
      pricingInput: "0.30",
      pricingOutput: "0.30",
    };
    expect(priority).toBe(computeModelPriority(fullCheap));
  });

  it("treats isFree=null the same as isFree=false", () => {
    const nullFree: ModelPriorityInput = {
      isFree: null,
      pricingInput: "3",
      pricingOutput: "3",
    };
    const explicitFalse: ModelPriorityInput = {
      isFree: false,
      pricingInput: "3",
      pricingOutput: "3",
    };
    expect(computeModelPriority(nullFree)).toBe(
      computeModelPriority(explicitFalse),
    );
  });

  it("handles epoch createdAt (0) as very old model", () => {
    const model: ModelPriorityInput = { createdAt: 0 };
    const oldModel: ModelPriorityInput = {
      createdAt: Date.now() / 1000 - 500 * DAY,
    };
    // Both should get 10 recency points (> 365 days old)
    expect(computeModelPriority(model)).toBe(computeModelPriority(oldModel));
  });

  it("is deterministic — same input always returns same output", () => {
    const model: ModelPriorityInput = {
      createdAt: Date.now() / 1000 - 60 * DAY,
      pricingInput: "3",
      pricingOutput: "6",
      supportsFunctionTools: true,
      supportsVision: true,
    };
    const a = computeModelPriority(model);
    const b = computeModelPriority(model);
    expect(a).toBe(b);
  });
});
