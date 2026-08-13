import { describe, expect, it } from "vitest";
import {
  buildVerticalDramaDraftStoryContextPrompt,
  getVerticalDramaDraftFactValue,
  hasBlockingVerticalDramaDraftDiagnostics,
  readVerticalDramaDraftStoryContext,
  renderVerticalDramaDraftStoryContextBlock,
} from "./draftStoryContext";

const context = {
  contractVersion: 1 as const,
  targetMarket: {
    value: "United States",
    source: "ai_inferred",
    confidence: "medium",
  },
  storySetting: {
    value: "A US university campus",
    source: "user_provided",
    confidence: "high",
  },
  leadBackground: {
    value: "Asian international student",
    source: "user_provided",
    confidence: "high",
  },
  leadOrigin: { value: "Vietnam", source: "user_provided", confidence: "high" },
  spokenDialogue: {
    value: "en-US",
    source: "user_provided",
    confidence: "high",
  },
  namingPolicy: {
    value: "Vietnamese name with consistent US romanization",
    source: "ai_inferred",
    confidence: "medium",
  },
};

describe("draft story context contract", () => {
  it("keeps market, setting, background, origin, and spoken language independent", () => {
    const parsed = readVerticalDramaDraftStoryContext(context);
    expect(parsed?.targetMarket?.value).toBe("United States");
    expect(parsed?.leadOrigin?.value).toBe("Vietnam");
    expect(parsed?.spokenDialogue?.value).toBe("en-US");
    expect(getVerticalDramaDraftFactValue(parsed?.storySetting)).toBe(
      "A US university campus"
    );
  });

  it("renders a clearly labeled fact block and tells the skill not to infer nationality", () => {
    expect(renderVerticalDramaDraftStoryContextBlock(context)).toContain(
      "target market is not character nationality"
    );
    expect(
      buildVerticalDramaDraftStoryContextPrompt({
        locale: "th",
        dialogueLanguageProfile: { version: 2, spokenLocale: "en-US" },
      })
    ).toContain("Never infer character nationality");
  });

  it("treats structural errors as blocking but missing optional context as non-blocking", () => {
    expect(
      hasBlockingVerticalDramaDraftDiagnostics([
        {
          code: "story_context_missing",
          severity: "warning",
          message: "review",
        },
      ])
    ).toBe(false);
    expect(
      hasBlockingVerticalDramaDraftDiagnostics([
        { code: "role_invalid", severity: "blocking", message: "repair" },
      ])
    ).toBe(true);
  });
});
