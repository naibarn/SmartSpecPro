/**
 * Backward-compatibility shim for the legacy `lib/i18n` API.
 *
 * All implementations now delegate to react-i18next. Existing consumers of
 * `useI18n()`, `I18nProvider`, and the exported types continue to work without
 * any code changes (Phase 1 backward compat).
 *
 * Removal timeline: delete this file after Wave 3 when all consumers are
 * migrated to `useTranslation()` directly.  Do NOT add new consumers of `useI18n()`.
 */

import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { Locale, TranslationDictionary } from "./types";
import { DEFAULT_LOCALE, AVAILABLE_LOCALES } from "./types";
import { ALL_NAMESPACES } from "../../i18n/config";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  dict: TranslationDictionary;
}

/**
 * Passthrough provider — the real i18n context is provided by
 * `<I18nextProvider>` in App.tsx (section-05). This component is kept for
 * backward compatibility so existing component trees that render
 * `<I18nProvider>` in tests continue to work.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/**
 * Drop-in replacement for the old custom `useI18n()` hook.
 *
 * Delegates to react-i18next `useTranslation`. The three namespaces cover all
 * keys used by existing consumers: `help` for help pages, `common` for shared
 * UI labels, `admin` for admin dashboard strings.
 */
export function useI18n(): I18nContextValue {
  // Load all namespaces. Only the first is used for default lookup, so we pass
  // `ns: ALL_NAMESPACES` explicitly in the `t()` wrapper below to enable
  // multi-namespace search. This shim is temporary — deleted after Wave 3.
  const { t: i18nT, i18n } = useTranslation([...ALL_NAMESPACES]);

  const rawLang = i18n.resolvedLanguage ?? i18n.language;
  const locale: Locale = (AVAILABLE_LOCALES as readonly string[]).includes(rawLang)
    ? (rawLang as Locale)
    : DEFAULT_LOCALE;

  const setLocale = useCallback(
    (next: Locale) => {
      void i18n.changeLanguage(next);
      try {
        localStorage.setItem("smartspec_locale", next);
      } catch {
        // Private/full storage — language still applied to i18next
      }
    },
    [i18n],
  );

  const t = (key: string, params?: Record<string, string | number>): string => {
    // Pass ns array explicitly — i18next v25 does not auto-search array namespaces
    // from useTranslation; explicit ns option enables the fallback chain.
    const opts: Record<string, unknown> = { ns: [...ALL_NAMESPACES] };
    if (params) Object.assign(opts, params);
    return i18nT(key, opts) as string;
  };

  return {
    locale,
    setLocale,
    t,
    dict: {},
  };
}
