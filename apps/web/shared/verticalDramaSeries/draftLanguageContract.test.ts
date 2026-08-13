import { describe, expect, it } from "vitest";
import {
  buildVerticalDramaDraftLanguageContractPrompt,
  resolveVerticalDramaDraftLanguageContract,
} from "./draftLanguageContract";

describe("vertical drama draft language contract", () => {
  it("keeps Thai narrative fields while using English titles for explicit English speech", () => {
    const contract = resolveVerticalDramaDraftLanguageContract({
      narrativeLocale: "th",
      dialogueLanguageProfile: { version: 2, spokenLocale: "en-US" },
    });

    expect(contract).toEqual({
      narrativeLocale: "th",
      titleLocale: "en",
      titleSource: "spoken",
    });

    const prompt = buildVerticalDramaDraftLanguageContractPrompt({
      narrativeLocale: "th",
      dialogueLanguageProfile: { version: 2, spokenLocale: "en-US" },
    });
    expect(prompt).toContain("Narrative/content language: Thai");
    expect(prompt).toContain("Title language: English");
    expect(prompt).toContain("mainPlot");
    expect(prompt).toContain("CHARACTER NAMING & CULTURAL COHERENCE CONTRACT");
    expect(prompt).toContain("Character names follow the CHARACTER NAMING");
    expect(prompt).toContain(
      "must not change the language of the narrative fields"
    );
  });

  it("keeps title and narrative language aligned with the UI when spoken locale is Auto", () => {
    const contract = resolveVerticalDramaDraftLanguageContract({
      narrativeLocale: "th",
      dialogueLanguageProfile: { version: 2, spokenLocale: "auto" },
    });

    expect(contract).toEqual({
      narrativeLocale: "th",
      titleLocale: "th",
      titleSource: "ui",
    });
  });
});
