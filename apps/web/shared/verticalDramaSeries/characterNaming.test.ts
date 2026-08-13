import { describe, expect, it } from "vitest";

import {
  buildVerticalDramaCharacterNamingContractPrompt,
  getVerticalDramaCharacterNamingPreview,
  resolveVerticalDramaCharacterNamingContract,
} from "./characterNaming";

describe("vertical drama character naming contract", () => {
  it("defaults an explicit English US market to contemporary American names", () => {
    const contract = resolveVerticalDramaCharacterNamingContract({
      narrativeLocale: "th",
      dialogueLanguageProfile: { version: 2, spokenLocale: "en-US" },
    });

    expect(contract).toMatchObject({
      spokenLocale: "en-US",
      source: "explicit_spoken_market",
      defaultMarket: "United States / contemporary American market",
    });
    expect(contract.guidance).toContain("plausible contemporary American names");

    const prompt = buildVerticalDramaCharacterNamingContractPrompt({
      narrativeLocale: "th",
      dialogueLanguageProfile: { version: 2, spokenLocale: "en-US" },
    });
    expect(prompt).toContain("CHARACTER NAMING & CULTURAL COHERENCE CONTRACT");
    expect(prompt).toContain("creator-supplied character name");
    expect(prompt).toContain("does not by itself require every character to have an English name");
  });

  it("uses the content-locale default for auto and exposes a creator-readable preview", () => {
    const preview = getVerticalDramaCharacterNamingPreview({
      narrativeLocale: "th",
      dialogueLanguageProfile: { version: 2, spokenLocale: "auto" },
    });
    expect(preview).toContain("Thailand / contemporary Thai market");
    expect(preview).toContain("th-CENTRAL");
    expect(preview).toContain("content-locale default");
  });
});
