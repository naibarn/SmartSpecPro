import { describe, expect, it } from "vitest";
import { normalizeMediaPrompt } from "../mediaGenerationService";

describe("normalizeMediaPrompt", () => {
  it("keeps plain text prompts (trimmed)", () => {
    expect(normalizeMediaPrompt("  cinematic shot of sunrise  ")).toBe("cinematic shot of sunrise");
  });

  it("unwraps fenced json blocks into plain json text", () => {
    const fenced = "```json\n{\n  \"prompt\": \"hello\",\n  \"duration\": 5\n}\n```";
    expect(normalizeMediaPrompt(fenced)).toBe("{\n  \"prompt\": \"hello\",\n  \"duration\": 5\n}");
  });

  it("unwraps generic fenced blocks", () => {
    const fenced = "```\nA vivid watercolor landscape with soft light\n```";
    expect(normalizeMediaPrompt(fenced)).toBe("A vivid watercolor landscape with soft light");
  });

  it("normalizes json label prefix to plain json text", () => {
    const malformed = "json\n{\n  \"prompt\": \"hello image\"\n}";
    expect(normalizeMediaPrompt(malformed)).toBe("{\n  \"prompt\": \"hello image\"\n}");
  });

  it("removes orphaned markdown fence lines from malformed output", () => {
    const malformed = "```json\n{\n  \"prompt\": \"hello image\"\n}\n";
    expect(normalizeMediaPrompt(malformed)).toBe("{\n  \"prompt\": \"hello image\"\n}");
  });

  it("returns empty string for null/undefined", () => {
    expect(normalizeMediaPrompt(null)).toBe("");
    expect(normalizeMediaPrompt(undefined)).toBe("");
  });
});
