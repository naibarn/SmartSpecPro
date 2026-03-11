import { describe, it, expect } from "vitest";
import { extractCitationsFromResponse, getWebSearchToolForProvider } from "./citationExtractor";

describe("extractCitationsFromResponse", () => {
  it("extracts citations from OpenAI web_search response", () => {
    const response = {
      output: [
        {
          type: "web_search_call",
          sources: [
            { title: "Source 1", url: "https://example.com/1", snippet: "Text 1" },
            { title: "Source 2", url: "https://example.com/2", snippet: "Text 2" },
          ],
        },
      ],
    };

    const citations = extractCitationsFromResponse(response, "openai");
    expect(citations).toHaveLength(2);
    expect(citations[0].title).toBe("Source 1");
    expect(citations[0].url_or_id).toBe("https://example.com/1");
    expect(citations[0].snippet).toBe("Text 1");
    expect(citations[0].citation_id).toMatch(/^cite_[a-f0-9]{12}$/);
  });

  it("extracts citations from Gemini grounding response", () => {
    const response = {
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: "https://gemini-source.com/a", title: "Gemini Source" } },
            ],
          },
        },
      ],
    };

    const citations = extractCitationsFromResponse(response, "gemini");
    expect(citations).toHaveLength(1);
    expect(citations[0].url_or_id).toBe("https://gemini-source.com/a");
  });

  it("extracts citations from Claude web_search response", () => {
    const response = {
      content: [
        {
          type: "tool_result",
          tool_use_id: "tu_123",
          content: [
            {
              type: "web_search_results",
              results: [
                { title: "Claude Source", url: "https://claude-source.com/b", snippet: "Snippet" },
              ],
            },
          ],
        },
      ],
    };

    const citations = extractCitationsFromResponse(response, "anthropic");
    expect(citations).toHaveLength(1);
    expect(citations[0].url_or_id).toBe("https://claude-source.com/b");
  });

  it("handles Kimi as OpenAI-compatible", () => {
    const response = {
      output: [
        {
          type: "web_search_call",
          sources: [{ title: "Kimi Source", url: "https://kimi.com/1" }],
        },
      ],
    };

    const citations = extractCitationsFromResponse(response, "kimi");
    expect(citations).toHaveLength(1);
    expect(citations[0].url_or_id).toBe("https://kimi.com/1");
  });

  it("returns empty array for empty tool results", () => {
    expect(extractCitationsFromResponse({}, "openai")).toHaveLength(0);
    expect(extractCitationsFromResponse({ output: [] }, "openai")).toHaveLength(0);
  });

  it("deduplicates same URL from multiple search calls", () => {
    const response = {
      output: [
        {
          type: "web_search_call",
          sources: [{ title: "Source", url: "https://same.com/page" }],
        },
        {
          type: "web_search_call",
          sources: [{ title: "Source Again", url: "https://same.com/page" }],
        },
      ],
    };

    const citations = extractCitationsFromResponse(response, "openai");
    expect(citations).toHaveLength(1);
  });

  it("generates deterministic citation_id from URL", () => {
    const response = {
      output: [
        {
          type: "web_search_call",
          sources: [{ title: "Test", url: "https://example.com/stable" }],
        },
      ],
    };

    const c1 = extractCitationsFromResponse(response, "openai");
    const c2 = extractCitationsFromResponse(response, "openai");
    expect(c1[0].citation_id).toBe(c2[0].citation_id);
  });

  it("returns empty for null/undefined input", () => {
    expect(extractCitationsFromResponse(null, "openai")).toHaveLength(0);
    expect(extractCitationsFromResponse(undefined, "openai")).toHaveLength(0);
  });
});

describe("getWebSearchToolForProvider", () => {
  it("returns correct tool for OpenAI", () => {
    expect(getWebSearchToolForProvider("openai")).toEqual({ type: "web_search" });
  });

  it("returns correct tool for Gemini", () => {
    expect(getWebSearchToolForProvider("gemini")).toEqual({ google_search: {} });
  });

  it("returns correct tool for Anthropic", () => {
    expect(getWebSearchToolForProvider("anthropic")).toEqual({
      type: "web_search_20250305",
      name: "web_search",
    });
  });

  it("returns null for unknown provider", () => {
    expect(getWebSearchToolForProvider("unknown")).toBeNull();
  });
});
