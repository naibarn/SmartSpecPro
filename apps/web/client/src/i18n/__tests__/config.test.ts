import { describe, expect, it } from "vitest";
import {
  ALL_NAMESPACES,
  DEFAULT_LANGUAGE,
  LANGUAGE_COVERAGE,
  LANGUAGE_LABELS,
  RTL_LANGUAGES,
  STARTUP_NAMESPACES,
  SUPPORTED_LANGUAGES,
} from "../config";

describe("i18n/config", () => {
  it("SUPPORTED_LANGUAGES contains en and th", () => {
    expect(SUPPORTED_LANGUAGES).toContain("en");
    expect(SUPPORTED_LANGUAGES).toContain("th");
  });

  it("SUPPORTED_LANGUAGES has 19 entries", () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(19);
  });

  it("STARTUP_NAMESPACES are a subset of ALL_NAMESPACES", () => {
    for (const ns of STARTUP_NAMESPACES) {
      expect(ALL_NAMESPACES).toContain(ns);
    }
  });

  it("DEFAULT_LANGUAGE is en", () => {
    expect(DEFAULT_LANGUAGE).toBe("en");
  });

  it("RTL_LANGUAGES contains ar", () => {
    expect(RTL_LANGUAGES).toContain("ar");
  });

  it("LANGUAGE_LABELS has entry for every SUPPORTED_LANGUAGES member", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(LANGUAGE_LABELS[lang]).toBeTruthy();
    }
  });

  it("LANGUAGE_COVERAGE has entry for every SUPPORTED_LANGUAGES member", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(typeof LANGUAGE_COVERAGE[lang]).toBe("number");
    }
  });

  it("all language codes use valid BCP-47 format", () => {
    const bcp47 = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$/;
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(lang).toMatch(bcp47);
    }
  });

  it("ALL_NAMESPACES has exactly 19 entries", () => {
    expect(ALL_NAMESPACES).toHaveLength(19);
  });

  it("STARTUP_NAMESPACES has exactly 4 entries", () => {
    expect(STARTUP_NAMESPACES).toHaveLength(4);
  });
});
