import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    clear: () => {
      store = {};
    },
  };
})();

vi.stubGlobal("localStorage", localStorageMock);

import { languageDetector, STORAGE_KEY } from "../languageDetector";

describe("i18n/languageDetector", () => {
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("detects 'th' from localStorage when smartspec_locale is th", () => {
    localStorageMock.getItem.mockReturnValueOnce("th");
    expect(languageDetector.detect()).toBe("th");
  });

  it("detects 'en' from localStorage when smartspec_locale is en", () => {
    localStorageMock.getItem.mockReturnValueOnce("en");
    expect(languageDetector.detect()).toBe("en");
  });

  it("ignores invalid localStorage values and falls back to navigator", () => {
    localStorageMock.getItem.mockReturnValueOnce("invalid-lang");
    // Mock navigator.language to return a known fallback
    vi.stubGlobal("navigator", { language: "en-US" });
    const result = languageDetector.detect();
    // Should NOT return the invalid value
    expect(result).not.toBe("invalid-lang");
  });

  it("ignores path traversal attempts in localStorage", () => {
    localStorageMock.getItem.mockReturnValueOnce("../../etc/passwd");
    vi.stubGlobal("navigator", { language: "en" });
    const result = languageDetector.detect();
    expect(result).not.toBe("../../etc/passwd");
    expect(result).toBe("en");
  });

  it("ignores script injection attempts in localStorage", () => {
    localStorageMock.getItem.mockReturnValueOnce("<script>alert(1)</script>");
    vi.stubGlobal("navigator", { language: "en" });
    const result = languageDetector.detect();
    expect(result).not.toContain("<script>");
    expect(result).toBe("en");
  });

  it("maps navigator.language 'th-TH' to 'th'", () => {
    localStorageMock.getItem.mockReturnValueOnce(null);
    vi.stubGlobal("navigator", { language: "th-TH" });
    expect(languageDetector.detect()).toBe("th");
  });

  it("maps navigator.language 'zh' to 'zh-Hans'", () => {
    localStorageMock.getItem.mockReturnValueOnce(null);
    vi.stubGlobal("navigator", { language: "zh" });
    expect(languageDetector.detect()).toBe("zh-Hans");
  });

  it("maps navigator.language 'pt-BR' to 'pt-BR'", () => {
    localStorageMock.getItem.mockReturnValueOnce(null);
    vi.stubGlobal("navigator", { language: "pt-BR" });
    expect(languageDetector.detect()).toBe("pt-BR");
  });

  it("falls back to 'en' when navigator.language is unsupported", () => {
    localStorageMock.getItem.mockReturnValueOnce(null);
    vi.stubGlobal("navigator", { language: "xx-XX" });
    expect(languageDetector.detect()).toBe("en");
  });

  it("cacheUserLanguage writes to localStorage", () => {
    languageDetector.cacheUserLanguage("th");
    expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEY, "th");
  });

  it("cacheUserLanguage only writes valid language codes", () => {
    languageDetector.cacheUserLanguage("invalid-lang");
    expect(localStorageMock.setItem).not.toHaveBeenCalled();

    languageDetector.cacheUserLanguage("<script>");
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });
});
