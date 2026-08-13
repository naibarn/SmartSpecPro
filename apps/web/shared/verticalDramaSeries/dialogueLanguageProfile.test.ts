import { describe, expect, it } from "vitest";
import {
  buildVerticalDramaDialogueLanguageProfile,
  buildVerticalDramaDialogueLanguageProfileFromBible,
  buildVerticalDramaDialogueLanguageProfilePrompt,
  buildVerticalDramaSpokenLanguageProfile,
  resolveVerticalDramaSpokenLocale,
  readVerticalDramaDialogueLanguageProfile,
} from "./dialogueLanguageProfile";

describe("vertical drama dialogue language profile", () => {
  it("keeps legacy/missing profile values on Auto", () => {
    expect(readVerticalDramaDialogueLanguageProfile(undefined)).toEqual({
      version: 2,
      spokenLocale: "auto",
    });
    expect(buildVerticalDramaDialogueLanguageProfileFromBible({})).toEqual({
      version: 2,
      spokenLocale: "auto",
    });
  });

  it("renders the exact American spoken-English contract for Auto", () => {
    const prompt = buildVerticalDramaDialogueLanguageProfilePrompt({
      locale: "en",
      profile: buildVerticalDramaDialogueLanguageProfile("auto"),
    });
    expect(prompt).toContain(
      "Natural contemporary American English, spoken dialogue, not translated English.",
    );
    expect(prompt).toContain("default to United States / General American English");
    expect(prompt).toContain("natural contractions");
    expect(prompt).toContain("Do not translate Thai, Chinese");
    expect(prompt).toContain("Scope: apply this profile only to spoken dialogue");
    expect(prompt).toContain("must not be changed by this profile");
  });

  it("preserves an explicit British override", () => {
    const prompt = buildVerticalDramaDialogueLanguageProfilePrompt({
      locale: "en",
      profile: buildVerticalDramaDialogueLanguageProfile("british"),
    });
    expect(prompt).toContain("Natural contemporary British English");
    expect(prompt).toContain("explicit creator override");
    expect(prompt).not.toContain("default to United States / General American English");
  });

  it("uses the same natural-spoken contract for non-English locales", () => {
    const prompt = buildVerticalDramaDialogueLanguageProfilePrompt({ locale: "th" });
    expect(prompt).toContain("Natural contemporary spoken Thai, not translated Thai");
    expect(prompt).toContain("culturally appropriate forms of address");
  });

  it("gives Auto locale-aware market guidance for Chinese and Japanese", () => {
    const chinese = buildVerticalDramaDialogueLanguageProfilePrompt({
      locale: "zh",
      profile: undefined,
    });
    const japanese = buildVerticalDramaDialogueLanguageProfilePrompt({
      locale: "ja",
      profile: undefined,
    });

    expect(chinese).toContain("Mainland China");
    expect(chinese).toContain("Simplified Chinese");
    expect(japanese).toContain("contemporary Japanese spoken drama for Japan");
    expect(japanese).toContain("casual, polite, or honorific speech");
  });

  it("accepts explicit regional spoken locales without changing the narrative locale", () => {
    const profile = buildVerticalDramaSpokenLanguageProfile("en-GB");
    expect(resolveVerticalDramaSpokenLocale({ locale: "th", profile })).toBe("en-GB");
    const prompt = buildVerticalDramaDialogueLanguageProfilePrompt({
      locale: "th",
      profile,
    });
    expect(prompt).toContain("Natural contemporary British English");
    expect(prompt).toContain("Narrative/content language: Thai");
    expect(prompt).toContain("must not be changed by this profile");
  });

  it("maps the legacy market selector to the additive spoken-locale contract", () => {
    expect(readVerticalDramaDialogueLanguageProfile({ version: 1, marketMode: "british" })).toEqual({
      version: 2,
      spokenLocale: "en-GB",
      marketMode: "british",
    });
  });
});
