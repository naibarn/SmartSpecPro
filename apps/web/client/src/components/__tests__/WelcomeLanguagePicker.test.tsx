/**
 * Tests for section-09: WelcomeLanguagePicker component
 * One-time language selection modal for new users
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WelcomeLanguagePicker } from "../WelcomeLanguagePicker";

// Mock i18next — use vi.hoisted to avoid initialization-before-declaration
const { mockChangeLanguage } = vi.hoisted(() => ({
  mockChangeLanguage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("i18next", () => ({
  default: {
    changeLanguage: mockChangeLanguage,
    language: "en",
  },
}));

// Mock useAuth
let mockIsAuthenticated = true;
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: mockIsAuthenticated, user: mockIsAuthenticated ? { id: "1" } : null }),
}));

// Mocks for trpc
const mockMutate = vi.fn();
const mockGetPreferences = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    users: {
      updatePreferences: {
        useMutation: () => ({ mutate: mockMutate }),
      },
      getPreferences: {
        useQuery: () => mockGetPreferences(),
      },
    },
  },
}));

// Mock @shared/i18n to control LANGUAGE_COVERAGE — expose "th" at 60% for selection tests
vi.mock("@shared/i18n", () => ({
  SUPPORTED_LANGUAGES: ["en", "th", "ja"],
  LANGUAGE_LABELS: { en: "English", th: "ภาษาไทย", ja: "日本語" },
  LANGUAGE_LABELS_EN: { en: "English", th: "Thai", ja: "Japanese" },
  LANGUAGE_COVERAGE: { en: 100, th: 60, ja: 0 },
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
Object.defineProperty(window, "localStorage", { value: localStorageMock, writable: true });

function setup(opts: {
  hasChosenLocale?: boolean;
  translationLanguage?: string;
  prefsLoading?: boolean;
  prefsError?: boolean;
  isAuthenticated?: boolean;
}) {
  const {
    hasChosenLocale = false,
    translationLanguage = "",
    prefsLoading = false,
    prefsError = false,
    isAuthenticated = true,
  } = opts;

  mockIsAuthenticated = isAuthenticated;

  localStorageMock.getItem.mockImplementation((key: string) => {
    if (key === "smartspec_locale_chosen") return hasChosenLocale ? "true" : null;
    return null;
  });

  if (prefsLoading) {
    mockGetPreferences.mockReturnValue({ data: undefined, isSuccess: false, isError: false });
  } else if (prefsError) {
    mockGetPreferences.mockReturnValue({ data: undefined, isSuccess: false, isError: true });
  } else {
    mockGetPreferences.mockReturnValue({
      data: { translationLanguage },
      isSuccess: true,
      isError: false,
    });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAuthenticated = true;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WelcomeLanguagePicker — visibility logic", () => {
  it("renders modal when user has no language preference and localStorage lacks smartspec_locale_chosen", async () => {
    setup({ hasChosenLocale: false, translationLanguage: "" });
    render(<WelcomeLanguagePicker />);
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeTruthy();
    });
  });

  it("does not render when user already has translationLanguage set in preferences", async () => {
    setup({ translationLanguage: "th" });
    render(<WelcomeLanguagePicker />);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("does not render when localStorage has smartspec_locale_chosen='true'", () => {
    setup({ hasChosenLocale: true, translationLanguage: "" });
    render(<WelcomeLanguagePicker />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not render when user is not authenticated (no user context)", () => {
    setup({ isAuthenticated: false });
    render(<WelcomeLanguagePicker />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not render while preferences are still loading", () => {
    setup({ prefsLoading: true });
    render(<WelcomeLanguagePicker />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("WelcomeLanguagePicker — language filtering", () => {
  it("always shows 'Continue with English' option regardless of coverage", async () => {
    setup({ translationLanguage: "" });
    render(<WelcomeLanguagePicker />);
    await waitFor(() => {
      expect(screen.getByText(/continue with english/i)).toBeTruthy();
    });
  });

  it("shows languages with coverage >= 50 (Thai at 60%)", async () => {
    setup({ translationLanguage: "" });
    render(<WelcomeLanguagePicker />);
    await waitFor(() => {
      expect(screen.getByText("ภาษาไทย")).toBeTruthy();
    });
  });

  it("does not show languages with coverage below 50 (Japanese at 0%)", async () => {
    setup({ translationLanguage: "" });
    render(<WelcomeLanguagePicker />);
    await waitFor(() => {
      expect(screen.queryByText("日本語")).toBeNull();
    });
  });
});

describe("WelcomeLanguagePicker — selection behavior", () => {
  it("selecting Thai calls i18next.changeLanguage('th')", async () => {
    setup({ translationLanguage: "" });
    render(<WelcomeLanguagePicker />);
    const thBtn = await screen.findByText("ภาษาไทย");
    fireEvent.click(thBtn.closest("button")!);
    expect(mockChangeLanguage).toHaveBeenCalledWith("th");
  });

  it("selecting Thai writes 'th' to localStorage key smartspec_locale", async () => {
    setup({ translationLanguage: "" });
    render(<WelcomeLanguagePicker />);
    const thBtn = await screen.findByText("ภาษาไทย");
    fireEvent.click(thBtn.closest("button")!);
    expect(localStorageMock.setItem).toHaveBeenCalledWith("smartspec_locale", "th");
  });

  it("selecting Thai fires tRPC users.updatePreferences with { translationLanguage: 'th' }", async () => {
    setup({ translationLanguage: "" });
    render(<WelcomeLanguagePicker />);
    const thBtn = await screen.findByText("ภาษาไทย");
    fireEvent.click(thBtn.closest("button")!);
    expect(mockMutate).toHaveBeenCalledWith({ translationLanguage: "th" });
  });

  it("sets localStorage smartspec_locale_chosen to 'true' after selection", async () => {
    setup({ translationLanguage: "" });
    render(<WelcomeLanguagePicker />);
    const thBtn = await screen.findByText("ภาษาไทย");
    fireEvent.click(thBtn.closest("button")!);
    expect(localStorageMock.setItem).toHaveBeenCalledWith("smartspec_locale_chosen", "true");
  });
});

describe("WelcomeLanguagePicker — dismissal", () => {
  it("dismissing modal sets smartspec_locale_chosen to 'true'", async () => {
    setup({ translationLanguage: "" });
    render(<WelcomeLanguagePicker />);
    const dismissBtn = await screen.findByText(/continue with english/i);
    fireEvent.click(dismissBtn);
    expect(localStorageMock.setItem).toHaveBeenCalledWith("smartspec_locale_chosen", "true");
  });

  it("dismissing modal does NOT call i18next.changeLanguage", async () => {
    setup({ translationLanguage: "" });
    render(<WelcomeLanguagePicker />);
    const dismissBtn = await screen.findByText(/continue with english/i);
    fireEvent.click(dismissBtn);
    expect(mockChangeLanguage).not.toHaveBeenCalled();
  });
});

describe("WelcomeLanguagePicker — display", () => {
  it("each language option shows native name from LANGUAGE_LABELS", async () => {
    setup({ translationLanguage: "" });
    render(<WelcomeLanguagePicker />);
    const thNativeName = await screen.findByText("ภาษาไทย");
    expect(thNativeName).toBeTruthy();
  });

  it("each language option shows coverage percentage", async () => {
    setup({ translationLanguage: "" });
    render(<WelcomeLanguagePicker />);
    await waitFor(() => {
      expect(screen.getByText(/60%/)).toBeTruthy();
    });
  });
});
