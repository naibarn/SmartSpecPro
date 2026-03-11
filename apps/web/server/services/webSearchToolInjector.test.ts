import { describe, it, expect } from "vitest";
import {
  detectProviderFamily,
  buildWebSearchParams,
  supportsNativeWebSearch,
} from "./webSearchToolInjector";

describe("webSearchToolInjector", () => {
  describe("detectProviderFamily", () => {
    it("detects OpenAI variants", () => {
      expect(detectProviderFamily("openai")).toBe("openai");
      expect(detectProviderFamily("OpenAI")).toBe("openai");
      expect(detectProviderFamily("my-gpt-provider")).toBe("openai");
    });

    it("detects Gemini/Google variants", () => {
      expect(detectProviderFamily("gemini")).toBe("gemini");
      expect(detectProviderFamily("Google AI")).toBe("gemini");
    });

    it("detects Anthropic/Claude variants", () => {
      expect(detectProviderFamily("anthropic")).toBe("anthropic");
      expect(detectProviderFamily("Claude API")).toBe("anthropic");
    });

    it("detects Kimi/Moonshot variants", () => {
      expect(detectProviderFamily("kimi")).toBe("kimi");
      expect(detectProviderFamily("moonshot-api")).toBe("kimi");
    });

    it("returns other for unknown providers", () => {
      expect(detectProviderFamily("local-llm")).toBe("other");
      expect(detectProviderFamily("ollama")).toBe("other");
    });
  });

  describe("buildWebSearchParams", () => {
    it("returns web_search_preview tool for OpenAI", () => {
      const result = buildWebSearchParams("openai");
      expect(result.bodyParams).toEqual({
        tools: [{ type: "web_search_preview" }],
      });
      expect(result.systemPromptSuffix).toBeUndefined();
    });

    it("returns google_search tool for Gemini", () => {
      const result = buildWebSearchParams("gemini");
      expect(result.bodyParams).toEqual({
        tools: [{ google_search: {} }],
      });
    });

    it("returns web_search tool for Anthropic", () => {
      const result = buildWebSearchParams("anthropic");
      expect(result.bodyParams).toEqual({
        tools: [{ type: "web_search", name: "web_search" }],
      });
    });

    it("returns use_search for Kimi", () => {
      const result = buildWebSearchParams("kimi");
      expect(result.bodyParams).toEqual({ use_search: true });
    });

    it("returns system prompt suffix for unknown providers", () => {
      const result = buildWebSearchParams("other");
      expect(result.bodyParams).toEqual({});
      expect(result.systemPromptSuffix).toContain("citations");
    });
  });

  describe("supportsNativeWebSearch", () => {
    it("returns true for supported providers", () => {
      expect(supportsNativeWebSearch("openai")).toBe(true);
      expect(supportsNativeWebSearch("gemini")).toBe(true);
      expect(supportsNativeWebSearch("anthropic")).toBe(true);
      expect(supportsNativeWebSearch("kimi")).toBe(true);
    });

    it("returns false for unsupported providers", () => {
      expect(supportsNativeWebSearch("other")).toBe(false);
    });
  });
});
