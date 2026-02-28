import { describe, it, expect } from "vitest";
import { renderForTelegram } from "../telegramRendering";

describe("renderForTelegram", () => {
  // --- Markdown to HTML conversion ---

  it("converts markdown bold to <b> tags", () => {
    const result = renderForTelegram("This is **bold** text");
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("<b>bold</b>");
  });

  it("converts markdown italic to <i> tags", () => {
    const result = renderForTelegram("This is *italic* text");
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("<i>italic</i>");
  });

  it("converts code blocks to <pre> tags", () => {
    const result = renderForTelegram("```js\nconsole.log('hello');\n```");
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("<pre>");
    expect(result[0]).toContain("console.log");
  });

  it("converts inline code to <code> tags", () => {
    const result = renderForTelegram("Use `npm install` to install");
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("<code>npm install</code>");
  });

  // --- Unsupported markdown ---

  it("strips unsupported markdown (tables)", () => {
    const input = "| Header | Value |\n|--------|-------|\n| foo    | bar   |";
    const result = renderForTelegram(input);
    expect(result).toHaveLength(1);
    expect(result[0]).not.toContain("|--------|");
  });

  it("strips footnote references", () => {
    const input = "Some text[^1]\n\n[^1]: Footnote content";
    const result = renderForTelegram(input);
    expect(result).toHaveLength(1);
    expect(result[0]).not.toContain("[^1]");
  });

  // --- Message splitting ---

  it("returns single chunk for message <= 4096 chars", () => {
    const short = "Hello, world!";
    const result = renderForTelegram(short);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("Hello, world!");
  });

  it("splits message > 4096 chars at paragraph boundaries", () => {
    const paragraph = "A".repeat(2000);
    const input = `${paragraph}\n\n${paragraph}\n\n${paragraph}`;
    const result = renderForTelegram(input);
    expect(result.length).toBeGreaterThan(1);
    result.forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    });
  });

  it("split messages include web URL on last chunk when provided", () => {
    const paragraph = "A".repeat(2000);
    const input = `${paragraph}\n\n${paragraph}\n\n${paragraph}`;
    const result = renderForTelegram(input, "https://smartaihub.app/chat/123");
    expect(result.length).toBeGreaterThan(1);
    const lastChunk = result[result.length - 1];
    expect(lastChunk).toContain("View full message in web app");
    expect(lastChunk).toContain("https://smartaihub.app/chat/123");
  });

  it("adds chunk numbering for multi-chunk messages", () => {
    const paragraph = "A".repeat(2000);
    const input = `${paragraph}\n\n${paragraph}\n\n${paragraph}`;
    const result = renderForTelegram(input);
    expect(result.length).toBeGreaterThan(1);
    // First chunk has no numbering
    expect(result[0]).not.toMatch(/^\[\d+\/\d+\]/);
    // Subsequent chunks have numbering
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).toMatch(/^\[\d+\/\d+\]/);
    }
  });

  // --- Code block capping ---

  it("caps code blocks at 2000 chars with truncation notice", () => {
    const longCode = "x".repeat(3000);
    const input = "```\n" + longCode + "\n```";
    const result = renderForTelegram(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("<pre>");
    expect(result[0]).not.toContain("x".repeat(3000));
    expect(result[0]).toContain("... (truncated)");
  });

  // --- HTML escaping ---

  it("escapes HTML special chars in text content", () => {
    const input = "Use <script> & \"quotes\" in content";
    const result = renderForTelegram(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("&lt;script&gt;");
    expect(result[0]).toContain("&amp;");
  });

  // --- Links ---

  it("converts markdown links to <a> tags", () => {
    const input = "Visit [Google](https://google.com) for search";
    const result = renderForTelegram(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('<a href="https://google.com">Google</a>');
  });

  // --- Headers ---

  it("converts markdown headers to bold text", () => {
    const input = "## Section Title\n\nSome content";
    const result = renderForTelegram(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("<b>Section Title</b>");
  });

  // --- Edge cases ---

  it("handles empty string input", () => {
    const result = renderForTelegram("");
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("");
  });

  it("handles plain text with no markdown", () => {
    const result = renderForTelegram("Just plain text, no formatting.");
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("Just plain text, no formatting.");
  });

  it("converts images to text labels", () => {
    const input = "Here is ![screenshot](https://example.com/img.png) for reference";
    const result = renderForTelegram(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("[Image: screenshot]");
    expect(result[0]).not.toContain("https://example.com/img.png");
  });

  it("handles horizontal rules by stripping them", () => {
    const input = "Above\n\n---\n\nBelow";
    const result = renderForTelegram(input);
    expect(result).toHaveLength(1);
    expect(result[0]).not.toContain("---");
    expect(result[0]).toContain("Above");
    expect(result[0]).toContain("Below");
  });
});
