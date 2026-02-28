import { describe, it, expect } from "vitest";
import { getMessage, ALL_MESSAGE_KEYS } from "../telegramI18n";

describe("telegramI18n", () => {
  it("returns Thai text for language_code 'th'", () => {
    const result = getMessage("link_success", "th");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(/[\u0E00-\u0E7F]/.test(result)).toBe(true);
  });

  it("returns English text for language_code 'en'", () => {
    const result = getMessage("link_success", "en");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(/[\u0E00-\u0E7F]/.test(result)).toBe(false);
  });

  it("returns English text for unknown language_code", () => {
    const result = getMessage("link_success", "fr");
    const enResult = getMessage("link_success", "en");
    expect(result).toBe(enResult);
  });

  it("returns English text for undefined language_code", () => {
    const result = getMessage("link_success", undefined);
    const enResult = getMessage("link_success", "en");
    expect(result).toBe(enResult);
  });

  it("all message keys have both 'th' and 'en' translations", () => {
    for (const key of ALL_MESSAGE_KEYS) {
      const th = getMessage(key, "th");
      const en = getMessage(key, "en");
      expect(th, `Missing Thai translation for '${key}'`).toBeTruthy();
      expect(en, `Missing English translation for '${key}'`).toBeTruthy();
    }
  });

  it("no message string is empty", () => {
    for (const key of ALL_MESSAGE_KEYS) {
      const th = getMessage(key, "th");
      const en = getMessage(key, "en");
      expect(th.length, `Empty Thai string for '${key}'`).toBeGreaterThan(0);
      expect(en.length, `Empty English string for '${key}'`).toBeGreaterThan(0);
    }
  });
});
