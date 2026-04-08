import { describe, expect, it } from "vitest";
import {
  buildPromptLengthPlan,
  resolvePromptLanguageHintFromInputs,
  truncateToPromptLength,
} from "../promptLengthGuard";

describe("promptLengthGuard", () => {
  it("derives a tighter token budget for English than Thai at the same character cap", () => {
    const englishPlan = buildPromptLengthPlan(500, "en");
    const thaiPlan = buildPromptLengthPlan(500, "th");

    expect(englishPlan?.maxPromptLength).toBe(500);
    expect(thaiPlan?.maxPromptLength).toBe(500);
    expect(englishPlan?.languageHint).toBe("en");
    expect(thaiPlan?.languageHint).toBe("th");
    expect(englishPlan?.maxTokens).toBeLessThan(thaiPlan?.maxTokens ?? 0);
    expect(englishPlan?.directive).toContain("under 500 characters");
    expect(thaiPlan?.directive).toContain("Thai");
  });

  it("resolves language hints from common input field names", () => {
    expect(resolvePromptLanguageHintFromInputs({ language: "en" })).toBe("en");
    expect(resolvePromptLanguageHintFromInputs({ promptLanguage: "th" })).toBe("th");
    expect(resolvePromptLanguageHintFromInputs({ dialogueLanguage: "mixed" })).toBe("mixed");
    expect(resolvePromptLanguageHintFromInputs({})).toBe("unknown");
  });

  it("truncates prompt text at a readable boundary when possible", () => {
    const result = truncateToPromptLength("One sentence. Two sentence. Three sentence.", 24);

    expect(result.wasTruncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(24);
    expect(result.text.endsWith("...")).toBe(true);
  });
});
