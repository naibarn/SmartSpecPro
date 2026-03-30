/**
 * Tests for LocaleToggle — always shows two buttons (EN + secondary)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LocaleToggle } from "../LocaleToggle";

const mockChangeLanguage = vi.fn();
let mockLanguage = "th";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: {
      get language() { return mockLanguage; },
      changeLanguage: mockChangeLanguage,
    },
    t: (key: string) => key,
  }),
}));

// Mock localStorage for LAST_NON_EN_KEY
const localStorageMock: Record<string, string> = {};
vi.spyOn(Storage.prototype, "getItem").mockImplementation((k) => localStorageMock[k] ?? null);
vi.spyOn(Storage.prototype, "setItem").mockImplementation((k, v) => { localStorageMock[k] = v; });

beforeEach(() => {
  vi.clearAllMocks();
  mockLanguage = "th";
  // Reset stored locale
  delete localStorageMock["smartspec_last_locale"];
});

describe("LocaleToggle — always two buttons", () => {
  it("always shows 2 buttons when language is non-English (EN + current lang)", () => {
    mockLanguage = "th";
    render(<LocaleToggle />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByTitle("English")).toBeTruthy();
    expect(screen.getByTitle("ไทย")).toBeTruthy();
  });

  it("always shows 2 buttons even when language is English (EN + last-used secondary)", () => {
    // User previously used Thai, now switched back to English
    localStorageMock["smartspec_last_locale"] = "th";
    mockLanguage = "en";
    render(<LocaleToggle />);
    // Should still show both EN and TH
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByTitle("English")).toBeTruthy();
    expect(screen.getByTitle("ไทย")).toBeTruthy();
  });

  it("falls back to TH when on English with no stored secondary", () => {
    mockLanguage = "en";
    render(<LocaleToggle />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByTitle("ไทย")).toBeTruthy();
  });

  it("persists non-English choice to localStorage on click", () => {
    mockLanguage = "th";
    render(<LocaleToggle />);
    fireEvent.click(screen.getByTitle("ไทย"));
    expect(localStorageMock["smartspec_last_locale"]).toBe("th");
  });

  it("clicking English button calls i18next.changeLanguage('en')", () => {
    mockLanguage = "th";
    render(<LocaleToggle />);
    fireEvent.click(screen.getByTitle("English"));
    expect(mockChangeLanguage).toHaveBeenCalledWith("en");
  });

  it("clicking Thai button calls i18next.changeLanguage('th')", () => {
    mockLanguage = "en";
    localStorageMock["smartspec_last_locale"] = "th";
    render(<LocaleToggle />);
    fireEvent.click(screen.getByTitle("ไทย"));
    expect(mockChangeLanguage).toHaveBeenCalledWith("th");
  });

  it("has correct ARIA attributes", () => {
    mockLanguage = "th";
    render(<LocaleToggle />);
    expect(screen.getByRole("group").getAttribute("aria-label")).toBe("Language switcher");
  });

  it("active language button has aria-pressed=true, inactive has aria-pressed=false", () => {
    mockLanguage = "th";
    render(<LocaleToggle />);
    expect(screen.getByTitle("ไทย").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTitle("English").getAttribute("aria-pressed")).toBe("false");
  });

  it("active language button has aria-pressed=true when English is active", () => {
    mockLanguage = "en";
    localStorageMock["smartspec_last_locale"] = "th";
    render(<LocaleToggle />);
    expect(screen.getByTitle("English").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTitle("ไทย").getAttribute("aria-pressed")).toBe("false");
  });

  it("passes className prop to container", () => {
    mockLanguage = "th";
    render(<LocaleToggle className="custom-class" />);
    expect(screen.getByRole("group").classList.contains("custom-class")).toBe(true);
  });

  it("normalises BCP-47 subtag (zh-Hans) — shows 2 buttons with correct label", () => {
    mockLanguage = "zh-Hans";
    render(<LocaleToggle />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByTitle("简体中文")).toBeTruthy();
  });

  it("normalises unsupported browser language (en-US) to 'en' — shows 2 buttons", () => {
    mockLanguage = "en-US";
    render(<LocaleToggle />);
    // en-US → normalised to "en" → shows EN + fallback TH
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("active button has bg-primary class", () => {
    mockLanguage = "th";
    render(<LocaleToggle />);
    expect(screen.getByTitle("ไทย").classList.contains("bg-primary")).toBe(true);
  });

  it("inactive button has text-muted-foreground class", () => {
    mockLanguage = "th";
    render(<LocaleToggle />);
    expect(screen.getByTitle("English").classList.contains("text-muted-foreground")).toBe(true);
  });
});
