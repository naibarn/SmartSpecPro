/**
 * Tests for section-11: Display Language dropdown in Settings preferences tab.
 * Focused unit tests for the display language controls without mounting the full Settings page.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Hoisted mocks
const { mockChangeLanguage, mockMutate } = vi.hoisted(() => ({
  mockChangeLanguage: vi.fn().mockResolvedValue(undefined),
  mockMutate: vi.fn(),
}));

vi.mock("i18next", () => ({
  default: { changeLanguage: mockChangeLanguage, language: "en" },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", changeLanguage: mockChangeLanguage },
  }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: { id: "1", name: "Test", email: "test@example.com", role: "user", credits: 100 },
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    users: {
      getPreferences: { useQuery: () => ({ data: { translationLanguage: "", translationModel: "" }, isSuccess: true, isError: false }) },
      updatePreferences: { useMutation: () => ({ mutate: mockMutate, isPending: false }) },
    },
    llm: {
      listEnabledModels: { useQuery: () => ({ data: { models: [] } }) },
    },
  },
}));

vi.mock("@shared/i18n", () => ({
  SUPPORTED_LANGUAGES: ["en", "th", "ja"],
  LANGUAGE_LABELS: { en: "English", th: "ไทย", ja: "日本語" },
  LANGUAGE_LABELS_EN: { en: "English", th: "Thai", ja: "Japanese" },
  LANGUAGE_COVERAGE: { en: 100, th: 60, ja: 0 },
}));

// Mock localStorage
const localStorageMock = { getItem: vi.fn().mockReturnValue(null), setItem: vi.fn() };
Object.defineProperty(window, "localStorage", { value: localStorageMock, writable: true });

// Import after mocks
import { DisplayLanguageDropdown } from "@/pages/Settings";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DisplayLanguageDropdown", () => {
  it("shows Display Language label", () => {
    render(<DisplayLanguageDropdown />);
    expect(screen.getByText(/display language/i)).toBeTruthy();
  });

  it("dropdown lists only languages with >= 50% coverage plus English", () => {
    render(<DisplayLanguageDropdown />);
    const select = screen.getByRole("combobox");
    const options = Array.from(select.querySelectorAll("option")).map((o) => (o as HTMLOptionElement).value);
    expect(options).toContain("en");
    expect(options).toContain("th"); // 60% coverage
    expect(options).not.toContain("ja"); // 0% coverage
  });

  it("dropdown shows native name with English name for non-English options", () => {
    render(<DisplayLanguageDropdown />);
    const thOption = screen.getByRole("option", { name: /ไทย/i });
    expect(thOption).toBeTruthy();
  });

  it("changing language calls i18next.changeLanguage with selected code", () => {
    render(<DisplayLanguageDropdown />);
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "th" } });
    expect(mockChangeLanguage).toHaveBeenCalledWith("th");
  });

  it("changing language updates localStorage smartspec_locale", () => {
    render(<DisplayLanguageDropdown />);
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "th" } });
    expect(localStorageMock.setItem).toHaveBeenCalledWith("smartspec_locale", "th");
  });

  it("changing language fires tRPC updatePreferences mutation with translationLanguage", () => {
    render(<DisplayLanguageDropdown />);
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "th" } });
    expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({ translationLanguage: "th" }));
  });

  it("English always appears as option even with filtered coverage", () => {
    render(<DisplayLanguageDropdown />);
    const select = screen.getByRole("combobox");
    const options = Array.from(select.querySelectorAll("option")).map((o) => (o as HTMLOptionElement).value);
    expect(options).toContain("en");
  });

  it("dropdown reflects current i18next language on initial render", () => {
    render(<DisplayLanguageDropdown defaultValue="en" />);
    expect(screen.getByRole("combobox")).toHaveValue("en");
  });
});
