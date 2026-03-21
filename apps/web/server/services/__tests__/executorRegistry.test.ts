import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  registerExecutor,
  getExecutor,
  getAllExecutors,
  hasExecutor,
  clearRegistry,
} from "../executors/executorRegistry";
import type {
  CapabilityExecutor,
  CapabilityFamily,
  RouteDecision,
  ExecutorInput,
  ExecutorResult,
} from "../executors/types";

function makeMockExecutor(
  id: string,
  capabilities: CapabilityFamily[],
  canHandleResult = true,
): CapabilityExecutor {
  return {
    id,
    capabilities,
    canHandle: vi.fn().mockReturnValue(canHandleResult),
    execute: vi.fn().mockResolvedValue({
      success: true,
      content: "mock",
      inputTokens: 0,
      outputTokens: 0,
      attempts: [],
      totalDurationMs: 0,
    } satisfies ExecutorResult),
  };
}

function makeRoute(capability: CapabilityFamily): RouteDecision {
  return { capability, executorId: "test", reason: "test" };
}

describe("executorRegistry", () => {
  beforeEach(() => {
    clearRegistry();
  });

  describe("registerExecutor", () => {
    it("adds executor retrievable by capability", () => {
      const exec = makeMockExecutor("t1", ["writing.article"]);
      registerExecutor(exec);
      expect(getExecutor("writing.article")).toBe(exec);
    });

    it("registers executor for multiple capabilities", () => {
      const exec = makeMockExecutor("t2", [
        "writing.article",
        "writing.review",
      ]);
      registerExecutor(exec);
      expect(getExecutor("writing.article")).toBe(exec);
      expect(getExecutor("writing.review")).toBe(exec);
    });
  });

  describe("getExecutor", () => {
    it("returns null for unregistered capability with no fallback", () => {
      expect(getExecutor("orchestration.swarm")).toBeNull();
    });

    it("returns writing.article executor as fallback for unknown capability", () => {
      const fallback = makeMockExecutor("fb", ["writing.article"]);
      registerExecutor(fallback);
      expect(getExecutor("skill_factory.create")).toBe(fallback);
    });

    it("calls canHandle and falls through if false", () => {
      const primary = makeMockExecutor("p", ["writing.review"], false);
      const fallback = makeMockExecutor("fb", ["writing.article"]);
      registerExecutor(primary);
      registerExecutor(fallback);
      const result = getExecutor(
        "writing.review",
        makeRoute("writing.review"),
      );
      expect(primary.canHandle).toHaveBeenCalled();
      expect(result).toBe(fallback);
    });

    it("first registered wins without override", () => {
      const a = makeMockExecutor("a", ["media.image"]);
      const b = makeMockExecutor("b", ["media.image"]);
      registerExecutor(a);
      registerExecutor(b);
      expect(getExecutor("media.image")).toBe(a);
    });

    it("override replaces existing executor", () => {
      const a = makeMockExecutor("a", ["media.image"]);
      const b = makeMockExecutor("b", ["media.image"]);
      registerExecutor(a);
      registerExecutor(b, { override: true });
      expect(getExecutor("media.image")).toBe(b);
    });
  });

  describe("getAllExecutors", () => {
    it("returns deduplicated list", () => {
      const exec = makeMockExecutor("multi", [
        "writing.article",
        "writing.review",
      ]);
      const img = makeMockExecutor("img", ["media.image"]);
      registerExecutor(exec);
      registerExecutor(img);
      expect(getAllExecutors()).toHaveLength(2);
    });
  });

  describe("hasExecutor", () => {
    it("returns true for registered capability", () => {
      registerExecutor(makeMockExecutor("v", ["media.video"]));
      expect(hasExecutor("media.video")).toBe(true);
    });

    it("returns false for unregistered capability", () => {
      expect(hasExecutor("orchestration.swarm")).toBe(false);
    });
  });

  describe("clearRegistry", () => {
    it("removes all executors", () => {
      registerExecutor(makeMockExecutor("x", ["writing.article"]));
      clearRegistry();
      expect(getAllExecutors()).toHaveLength(0);
    });
  });
});
