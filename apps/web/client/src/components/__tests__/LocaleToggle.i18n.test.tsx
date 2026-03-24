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
    const buttons = screen.getAllByRole("button");
    // English button is the first one (en always shown first)
    const enBtn = buttons.find((b) => (b.textContent || "") !== "ภาษาไทย") || buttons[0];
    fireEvent.click(enBtn);
    expect(mockChangeLanguage).toHaveBeenCalledWith("en");
  });

  it("clicking non-English button calls i18next.changeLanguage with the correct code", () => {
    mockLanguage = "th";
    render(<LocaleToggle />);
    const buttons = screen.getAllByRole("button");
    // Thai button is the second one (non-English)
    const thBtn = buttons[1];
    fireEvent.click(thBtn);
    expect(mockChangeLanguage).toHaveBeenCalledWith("th");
  });

  it("has correct ARIA attributes", () => {
    mockLanguage = "th";
    render(<LocaleToggle />);
    const group = screen.getByRole("group");
    expect(group.getAttribute("aria-label")).toBe("Language switcher");
  });

  it("active language button has aria-pressed=true", () => {
    mockLanguage = "th";
    render(<LocaleToggle />);
    const buttons = screen.getAllByRole("button");
    // The active (th) button should have aria-pressed="true"
    const activeBtn = buttons.find((b) => b.getAttribute("aria-pressed") === "true");
    expect(activeBtn).toBeTruthy();
  });

  it("inactive language button has aria-pressed=false", () => {
    mockLanguage = "th";
    render(<LocaleToggle />);
    const buttons = screen.getAllByRole("button");
    const inactiveBtn = buttons.find((b) => b.getAttribute("aria-pressed") === "false");
    expect(inactiveBtn).toBeTruthy();
  });

  it("passes className prop to container element", () => {
    mockLanguage = "en";
    render(<LocaleToggle className="custom-class" />);
    const group = screen.getByRole("group");
    expect(group.classList.contains("custom-class")).toBe(true);
  });
});
