// Security: All values from localStorage and navigator are validated against
// the strict SUPPORTED_LANGUAGES allowlist before use. No user-supplied strings
// flow into system calls without validation.
import { SUPPORTED_LANGUAGES } from "./config";
import type { SupportedLanguage } from "./types";

/** Storage key — must match the existing system in lib/i18n/context.tsx */
export const STORAGE_KEY = "smartspec_locale" as const;

const supportedSet = new Set<string>(SUPPORTED_LANGUAGES);

/**
 * Special browser language tag -> SUPPORTED_LANGUAGES mapping.
 * Used when the base BCP-47 tag doesn't directly match a supported code.
 */
const BROWSER_LANGUAGE_MAP: Record<string, SupportedLanguage> = {
  zh: "zh-Hans",
};

function normalizeNavigatorLanguage(
  navLang: string,
): SupportedLanguage | undefined {
  // 1. Exact match (e.g., 'pt-BR', 'zh-Hans')
  if (supportedSet.has(navLang)) {
    return navLang as SupportedLanguage;
  }

  // 2. Check special browser mappings (e.g., 'zh' -> 'zh-Hans')
  if (navLang in BROWSER_LANGUAGE_MAP) {
    return BROWSER_LANGUAGE_MAP[navLang];
  }

  // 3. Strip region tag and try base language (e.g., 'th-TH' -> 'th')
  const base = navLang.split("-")[0];
  if (supportedSet.has(base)) {
    return base as SupportedLanguage;
  }

  return undefined;
}

export const languageDetector = {
  type: "languageDetector" as const,

  detect(): string | undefined {
    // Step 1: localStorage preference
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null && supportedSet.has(stored)) {
        return stored;
      }
    } catch {
      // SSR or private browsing — ignore
    }

    // Step 2: Browser navigator.language
    try {
      const navLang = navigator.language;
      if (navLang) {
        const mapped = normalizeNavigatorLanguage(navLang);
        if (mapped) return mapped;
      }
    } catch {
      // Navigator not available — ignore
    }

    // Step 3: Default
    return "en";
  },

  cacheUserLanguage(lng: string): void {
    if (!supportedSet.has(lng)) return;
    try {
      localStorage.setItem(STORAGE_KEY, lng);
    } catch {
      // Private browsing or quota exceeded — ignore
    }
  },
};
