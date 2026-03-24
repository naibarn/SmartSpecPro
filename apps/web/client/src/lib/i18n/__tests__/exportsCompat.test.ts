import { describe, it, expect } from "vitest";

describe("lib/i18n index exports compatibility", () => {
  it("exports I18nProvider as a function", async () => {
    const { I18nProvider } = await import("../index");
    expect(typeof I18nProvider).toBe("function");
  });

  it("exports useI18n as a function", async () => {
    const { useI18n } = await import("../index");
    expect(typeof useI18n).toBe("function");
  });

  it("exports AVAILABLE_LOCALES containing 'en' and 'th'", async () => {
    const { AVAILABLE_LOCALES } = await import("../index");
    expect(AVAILABLE_LOCALES).toContain("en");
    expect(AVAILABLE_LOCALES).toContain("th");
  });

  it("exports LOCALE_LABELS with 'en' and 'th' keys", async () => {
    const { LOCALE_LABELS } = await import("../index");
    expect(LOCALE_LABELS).toHaveProperty("en");
    expect(LOCALE_LABELS).toHaveProperty("th");
    expect(typeof LOCALE_LABELS.en).toBe("string");
    expect(typeof LOCALE_LABELS.th).toBe("string");
  });

  it("exports DEFAULT_LOCALE as 'en'", async () => {
    const { DEFAULT_LOCALE } = await import("../index");
    expect(DEFAULT_LOCALE).toBe("en");
  });
});
