import { describe, it, expect } from "vitest";
import {
  mapThinkingLevel,
  resolveThinkingLevel,
  type ThinkingLevel,
  type ProviderFamily,
} from "./thinkingLevelMapper";

describe("mapThinkingLevel", () => {
  describe("OpenAI", () => {
    it("maps minimal to low effort", () => {
      expect(mapThinkingLevel("minimal", "openai")).toEqual({
        reasoning: { effort: "low" },
      });
    });
    it("maps low to low effort", () => {
      expect(mapThinkingLevel("low", "openai")).toEqual({
        reasoning: { effort: "low" },
      });
    });
    it("maps medium to medium effort", () => {
      expect(mapThinkingLevel("medium", "openai")).toEqual({
        reasoning: { effort: "medium" },
      });
    });
    it("maps high to high effort", () => {
      expect(mapThinkingLevel("high", "openai")).toEqual({
        reasoning: { effort: "high" },
      });
    });
  });

  describe("Gemini", () => {
    it("maps minimal", () => {
      expect(mapThinkingLevel("minimal", "gemini")).toEqual({
        thinking_level: "minimal",
      });
    });
    it("maps high", () => {
      expect(mapThinkingLevel("high", "gemini")).toEqual({
        thinking_level: "high",
      });
    });
  });

  describe("Anthropic", () => {
    it("maps minimal to 512 budget", () => {
      expect(mapThinkingLevel("minimal", "anthropic")).toEqual({
        thinking: { type: "adaptive", budget_tokens: 512 },
      });
    });
    it("maps low to 1024 budget", () => {
      expect(mapThinkingLevel("low", "anthropic")).toEqual({
        thinking: { type: "adaptive", budget_tokens: 1024 },
      });
    });
    it("maps medium to 4096 budget", () => {
      expect(mapThinkingLevel("medium", "anthropic")).toEqual({
        thinking: { type: "adaptive", budget_tokens: 4096 },
      });
    });
    it("maps high to 16384 budget", () => {
      expect(mapThinkingLevel("high", "anthropic")).toEqual({
        thinking: { type: "adaptive", budget_tokens: 16384 },
      });
    });
  });

  describe("Kimi", () => {
    it("returns empty object for all levels", () => {
      for (const level of ["minimal", "low", "medium", "high"] as ThinkingLevel[]) {
        expect(mapThinkingLevel(level, "kimi")).toEqual({});
      }
    });
  });

  describe("Unknown/other provider", () => {
    it("returns empty object for other", () => {
      expect(mapThinkingLevel("high", "other")).toEqual({});
    });
    it("returns empty object for unknown string", () => {
      expect(mapThinkingLevel("high", "unknown" as ProviderFamily)).toEqual({});
    });
  });
});

describe("resolveThinkingLevel", () => {
  it("returns skill hint when provided", () => {
    expect(resolveThinkingLevel("low", "complex")).toBe("low");
  });
  it("returns skill hint even without complexity", () => {
    expect(resolveThinkingLevel("high")).toBe("high");
  });
  it("maps simple complexity to low", () => {
    expect(resolveThinkingLevel(undefined, "simple")).toBe("low");
  });
  it("maps moderate complexity to medium", () => {
    expect(resolveThinkingLevel(undefined, "moderate")).toBe("medium");
  });
  it("maps complex complexity to high", () => {
    expect(resolveThinkingLevel(undefined, "complex")).toBe("high");
  });
  it("defaults to medium with no arguments", () => {
    expect(resolveThinkingLevel()).toBe("medium");
  });
});
