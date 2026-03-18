import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Locale, TranslationDictionary } from "./types";
import { DEFAULT_LOCALE } from "./types";
import { getLocale as loadLocale } from "./locales";

const STORAGE_KEY = "smartspec_locale";

function readStoredLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "th") return stored;
  } catch {
    // SSR or private browsing
  }
  return DEFAULT_LOCALE;
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  dict: TranslationDictionary;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

  const dict = useMemo(() => loadLocale(locale), [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      let value = dict[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          value = value.replaceAll(`{{${k}}}`, String(v));
        }
      }
      return value;
    },
    [dict],
  );

  const ctx = useMemo(() => ({ locale, setLocale, t, dict }), [locale, setLocale, t, dict]);

  return <I18nContext.Provider value={ctx}>{children}</I18nContext.Provider>;
}

/**
 * Access i18n inside any component wrapped by `<I18nProvider>`.
 *
 * ```tsx
 * const { t, locale, setLocale } = useI18n();
 * return <p>{t("help.title")}</p>;
 * ```
 */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within <I18nProvider>");
  }
  return ctx;
}
