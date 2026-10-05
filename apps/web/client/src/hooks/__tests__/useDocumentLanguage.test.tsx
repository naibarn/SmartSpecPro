// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockI18n = vi.hoisted(() => {
  const handlers = new Map<string, (language?: string) => void>();
  return {
    language: "en",
    resolvedLanguage: "en",
    on: vi.fn((event: string, handler: (language?: string) => void) => {
      handlers.set(event, handler);
    }),
    off: vi.fn((event: string) => handlers.delete(event)),
    emit: (event: string, language: string) => handlers.get(event)?.(language),
  };
});

vi.mock("@/i18n", () => ({ i18n: mockI18n }));

import { useDocumentLanguage } from "../useDocumentLanguage";

describe("useDocumentLanguage", () => {
  beforeEach(() => {
    mockI18n.language = "en";
    mockI18n.resolvedLanguage = "en";
    document.documentElement.lang = "en";
    mockI18n.on.mockClear();
    mockI18n.off.mockClear();
  });

  it("sets the document language on mount and after a locale switch", () => {
    const { unmount } = renderHook(() => useDocumentLanguage());

    expect(document.documentElement.lang).toBe("en");
    expect(mockI18n.on).toHaveBeenCalledWith("languageChanged", expect.any(Function));

    act(() => mockI18n.emit("languageChanged", "th"));
    expect(document.documentElement.lang).toBe("th");

    unmount();
    expect(mockI18n.off).toHaveBeenCalledWith("languageChanged", expect.any(Function));
  });

  it("preserves supported script locales and falls back safely for unknown locales", () => {
    mockI18n.language = "zh-Hans-CN";
    mockI18n.resolvedLanguage = "zh-Hans-CN";
    const { rerender } = renderHook(() => useDocumentLanguage());

    expect(document.documentElement.lang).toBe("zh-Hans");
    act(() => mockI18n.emit("languageChanged", "not-a-supported-locale"));
    rerender();
    expect(document.documentElement.lang).toBe("en");
  });
});
