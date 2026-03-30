import React from "react";
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";

// Shared i18next instance for all tests in this suite
let testI18n: ReturnType<typeof i18next.createInstance>;

beforeAll(async () => {
  testI18n = i18next.createInstance();
  await testI18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    defaultNS: "common",
    resources: {
      en: {
        help: {
          "help.title": "Help Center",
          "help.search": "Search help articles",
          greeting: "Hello, {{name}}!",
        },
        common: {
          save: "Save",
          cancel: "Cancel",
        },
        admin: {
          "admin.users": "Users",
        },
      },
      th: {
        help: {
          "help.title": "ศูนย์ช่วยเหลือ",
        },
        common: {
          save: "บันทึก",
        },
      },
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
});

function wrapper({ children }: { children: React.ReactNode }) {
  return <I18nextProvider i18n={testI18n}>{children}</I18nextProvider>;
}

describe("useI18n backward compatibility", () => {
  afterEach(async () => {
    // Reset to English after each test to prevent cross-test language pollution
    await testI18n.changeLanguage("en");
  });
  it("useI18n().t('help.title') returns English value from help namespace", async () => {
    await act(async () => { await testI18n.changeLanguage("en"); });
    const { useI18n } = await import("../context");

    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.t("help.title")).toBe("Help Center");
  });

  it("useI18n().t('help.title') returns Thai value when language is 'th'", async () => {
    await act(async () => { await testI18n.changeLanguage("th"); });
    const { useI18n } = await import("../context");

    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.t("help.title")).toBe("ศูนย์ช่วยเหลือ");
    // Reset to en for other tests
    await act(async () => { await testI18n.changeLanguage("en"); });
  });

  it("useI18n().locale returns current i18next language", async () => {
    await act(async () => { await testI18n.changeLanguage("en"); });
    const { useI18n } = await import("../context");

    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.locale).toBe("en");
  });

  it("useI18n().setLocale('th') calls i18next.changeLanguage('th')", async () => {
    const spy = vi.spyOn(testI18n, "changeLanguage");
    const { useI18n } = await import("../context");

    const { result } = renderHook(() => useI18n(), { wrapper });
    await act(async () => { result.current.setLocale("th"); });
    expect(spy).toHaveBeenCalledWith("th");
    spy.mockRestore();
    // Reset
    await act(async () => { await testI18n.changeLanguage("en"); });
  });

  it("useI18n().setLocale('th') writes to localStorage", async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const { useI18n } = await import("../context");

    const { result } = renderHook(() => useI18n(), { wrapper });
    await act(async () => { result.current.setLocale("th"); });
    expect(setItemSpy).toHaveBeenCalledWith("smartspec_locale", "th");
    setItemSpy.mockRestore();
    await act(async () => { await testI18n.changeLanguage("en"); });
  });

  it("useI18n().t('missing.key') returns key string as fallback", async () => {
    const { useI18n } = await import("../context");

    const { result } = renderHook(() => useI18n(), { wrapper });
    const val = result.current.t("missing.nonexistent.key");
    expect(typeof val).toBe("string");
    // i18next returns the key when no translation found
    expect(val.length).toBeGreaterThan(0);
  });

  it("useI18n().t('greeting', { name: 'Alice' }) interpolates correctly", async () => {
    await act(async () => { await testI18n.changeLanguage("en"); });
    const { useI18n } = await import("../context");

    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.t("greeting", { name: "Alice" })).toBe("Hello, Alice!");
  });

  it("useI18n().dict returns empty object", async () => {
    const { useI18n } = await import("../context");

    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.dict).toEqual({});
  });

  it("I18nProvider renders children without error (passthrough)", async () => {
    const { I18nProvider } = await import("../context");
    render(
      <I18nextProvider i18n={testI18n}>
        <I18nProvider>
          <div data-testid="child">hello</div>
        </I18nProvider>
      </I18nextProvider>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("nested I18nProviders work without error", async () => {
    const { I18nProvider } = await import("../context");
    expect(() => {
      render(
        <I18nextProvider i18n={testI18n}>
          <I18nProvider>
            <I18nProvider>
              <div>nested</div>
            </I18nProvider>
          </I18nProvider>
        </I18nextProvider>,
      );
    }).not.toThrow();
  });
});
