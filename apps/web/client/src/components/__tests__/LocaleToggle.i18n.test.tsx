/**
 * Tests for section-10: LocaleToggle updated to use react-i18next
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

beforeEach(() => {
  vi.clearAllMocks();
  mockLanguage = "th";
});

describe("LocaleToggle (i18n)", () => {
  it("renders current language and English options when language is non-English", () => {
    mockLanguage = "th";
    render(<LocaleToggle />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    // English button should be present
    const labels = buttons.map((b) => b.getAttribute("title") || b.textContent || "");
    expect(labels.some((l) => /english/i.test(l) || l.includes("English"))).toBe(true);
  });

  it("renders only English button when language is 'en'", () => {
    mockLanguage = "en";
    render(<LocaleToggle />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
  });

  it("clicking English button calls i18next.changeLanguage('en')", () => {
    mockLanguage = "th";
    render(<LocaleToggle />);
    // Find English button by title attribute
    const enBtn = screen.getByTitle("English");
    fireEvent.click(enBtn);
    expect(mockChangeLanguage).toHaveBeenCalledWith("en");
  });

  it("clicking non-English button calls i18next.changeLanguage with the correct code", () => {
    mockLanguage = "th";
    render(<LocaleToggle />);
    // Thai button — find by title
    const thBtn = screen.getByTitle("ไทย");
    fireEvent.click(thBtn);
    expect(mockChangeLanguage).toHaveBeenCalledWith("th");
  });

  it("has correct ARIA attributes — role and aria-label", () => {
    mockLanguage = "th";
    render(<LocaleToggle />);
    const group = screen.getByRole("group");
    expect(group.getAttribute("aria-label")).toBe("Language switcher");
  });

  it("active language button has aria-pressed=true, inactive has aria-pressed=false", () => {
    mockLanguage = "th";
    render(<LocaleToggle />);
    const enBtn = screen.getByTitle("English");
    const thBtn = screen.getByTitle("ไทย");
    expect(thBtn.getAttribute("aria-pressed")).toBe("true");
    expect(enBtn.getAttribute("aria-pressed")).toBe("false");
  });

  it("passes className prop to container element", () => {
    mockLanguage = "en";
    render(<LocaleToggle className="custom-class" />);
    const group = screen.getByRole("group");
    expect(group.classList.contains("custom-class")).toBe(true);
  });

  it("normalises BCP-47 subtag language (zh-Hans) — renders correct label", () => {
    mockLanguage = "zh-Hans";
    render(<LocaleToggle />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    expect(screen.getByTitle("简体中文")).toBeTruthy();
  });

  it("normalises unsupported browser language (en-US) to default 'en' — renders single button", () => {
    mockLanguage = "en-US";
    render(<LocaleToggle />);
    const buttons = screen.getAllByRole("button");
    // en-US is not in SUPPORTED_LANGUAGES → should normalise to 'en' → single button
    expect(buttons).toHaveLength(1);
  });

  it("active language button has bg-primary class", () => {
    mockLanguage = "th";
    render(<LocaleToggle />);
    const thBtn = screen.getByTitle("ไทย");
    expect(thBtn.classList.contains("bg-primary")).toBe(true);
  });

  it("inactive language button has text-muted-foreground class", () => {
    mockLanguage = "th";
    render(<LocaleToggle />);
    const enBtn = screen.getByTitle("English");
    expect(enBtn.classList.contains("text-muted-foreground")).toBe(true);
  });
});
