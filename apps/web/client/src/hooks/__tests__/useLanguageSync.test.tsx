import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// Use vi.hoisted so mock factories can reference these objects (vi.mock is hoisted)
const mockAuth = vi.hoisted(() => ({
  user: { id: "1", email: "test@test.com", name: "Test", plan: "free" as const } as Record<string, unknown> | null,
  isLoading: false,
  isAuthenticated: true,
  login: vi.fn(),
  signup: vi.fn(),
  logout: vi.fn(),
  loginWithGoogle: vi.fn(),
  loginWithGitHub: vi.fn(),
  refreshUser: vi.fn(),
  updateUser: vi.fn(),
}));

const mockPrefs = vi.hoisted(() => ({
  data: { translationLanguage: "th" } as Record<string, unknown> | undefined,
}));

const mockI18n = vi.hoisted(() => ({
  language: "en",
  changeLanguage: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    users: {
      getPreferences: {
        useQuery: (_: unknown, __: unknown) => mockPrefs,
      },
    },
  },
}));

vi.mock("@/i18n", () => ({
  i18n: mockI18n,
}));

vi.mock("@shared/i18n", () => ({
  SUPPORTED_LANGUAGES: [
    "en", "th", "ja", "ar", "zh-Hans", "zh-Hant", "ko", "vi", "id",
    "hi", "es", "pt-BR", "fr", "de", "ru", "it", "tr", "nl", "pl",
  ],
}));

import { useLanguageSync } from "../useLanguageSync";

describe("useLanguageSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Storage.prototype, "setItem");
    // Reset to default authenticated state
    mockAuth.user = { id: "1", email: "test@test.com", name: "Test", plan: "free" };
    mockAuth.isLoading = false;
    mockPrefs.data = { translationLanguage: "th" };
    mockI18n.language = "en";
  });

  it("syncs DB preference to i18next when user has translationLanguage='th' and i18next language is 'en'", () => {
    mockPrefs.data = { translationLanguage: "th" };
    mockI18n.language = "en";

    renderHook(() => useLanguageSync());

    expect(mockI18n.changeLanguage).toHaveBeenCalledWith("th");
  });

  it("does not call changeLanguage when DB preference matches current i18next language", () => {
    mockPrefs.data = { translationLanguage: "en" };
    mockI18n.language = "en";

    renderHook(() => useLanguageSync());

    expect(mockI18n.changeLanguage).not.toHaveBeenCalled();
  });

  it("does not call changeLanguage when user is not authenticated (null user)", () => {
    mockAuth.user = null;
    mockPrefs.data = { translationLanguage: "th" };

    renderHook(() => useLanguageSync());

    expect(mockI18n.changeLanguage).not.toHaveBeenCalled();
  });

  it("does not call changeLanguage while auth is still loading", () => {
    mockAuth.isLoading = true;
    mockAuth.user = null;
    mockPrefs.data = { translationLanguage: "th" };

    renderHook(() => useLanguageSync());

    expect(mockI18n.changeLanguage).not.toHaveBeenCalled();
  });

  it("ignores invalid DB preference value (not in SUPPORTED_LANGUAGES)", () => {
    mockPrefs.data = { translationLanguage: "zz-invalid" };
    mockI18n.language = "en";

    renderHook(() => useLanguageSync());

    expect(mockI18n.changeLanguage).not.toHaveBeenCalled();
  });

  it("updates localStorage when syncing DB preference", () => {
    mockPrefs.data = { translationLanguage: "th" };
    mockI18n.language = "en";

    renderHook(() => useLanguageSync());

    expect(localStorage.setItem).toHaveBeenCalledWith("smartspec_locale", "th");
  });
});
