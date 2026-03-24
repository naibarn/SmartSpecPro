import { describe, expect, it } from "vitest";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_COVERAGE,
  LANGUAGE_LABELS,
  LANGUAGE_LABELS_EN,
  RTL_LANGUAGES,
  SUPPORTED_LANGUAGES,
} from "../i18n";

describe("shared/i18n constants", () => {
  it("SUPPORTED_LANGUAGES has exactly 19 entries", () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(19);
  });

  it("first entry is English", () => {
    expect(SUPPORTED_LANGUAGES[0]).toBe("en");
  });

  it("includes Thai", () => {
    expect(SUPPORTED_LANGUAGES).toContain("th");
  });

  it("DEFAULT_LANGUAGE is en", () => {
    expect(DEFAULT_LANGUAGE).toBe("en");
  });

  it("RTL_LANGUAGES includes ar", () => {
    expect(RTL_LANGUAGES).toContain("ar");
  });

  it("RTL_LANGUAGES does not include en", () => {
    expect(RTL_LANGUAGES).not.toContain("en");
  });

  it("LANGUAGE_LABELS has non-empty string for every supported language", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(LANGUAGE_LABELS[lang]).toBeTruthy();
      expect(typeof LANGUAGE_LABELS[lang]).toBe("string");
    }
  });

  it("LANGUAGE_LABELS_EN has non-empty string for every supported language", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(LANGUAGE_LABELS_EN[lang]).toBeTruthy();
      expect(typeof LANGUAGE_LABELS_EN[lang]).toBe("string");
    }
  });

  it("LANGUAGE_COVERAGE has numeric 0-100 entry for every supported language", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const val = LANGUAGE_COVERAGE[lang];
      expect(typeof val).toBe("number");
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(100);
    }
  });

  it("English coverage is 100", () => {
    expect(LANGUAGE_COVERAGE["en"]).toBe(100);
  });

  it("all codes match BCP-47 pattern", () => {
    const bcp47 = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$/;
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(lang).toMatch(bcp47);
    }
  });

  it("no duplicate entries", () => {
    const unique = new Set(SUPPORTED_LANGUAGES);
    expect(unique.size).toBe(SUPPORTED_LANGUAGES.length);
  });

  it("every RTL language is in SUPPORTED_LANGUAGES", () => {
    for (const rtl of RTL_LANGUAGES) {
      expect(SUPPORTED_LANGUAGES).toContain(rtl);
    }
  });

  it("LANGUAGE_LABELS contain no HTML markup (security: plain text only)", () => {
    const htmlPattern = /<[^>]+>/;
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(LANGUAGE_LABELS[lang]).not.toMatch(htmlPattern);
      expect(LANGUAGE_LABELS_EN[lang]).not.toMatch(htmlPattern);
    }
  });
});
