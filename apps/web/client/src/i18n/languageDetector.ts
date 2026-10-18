// Security: All values from localStorage are validated against
// the strict SUPPORTED_LANGUAGES allowlist before use. No user-supplied strings
// flow into system calls without validation.
import { SUPPORTED_LANGUAGES } from "./config";

/** Storage key — must match the existing system in lib/i18n/context.tsx */
export const STORAGE_KEY = "smartspec_locale" as const;

const supportedSet = new Set<string>(SUPPORTED_LANGUAGES);

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

    // First visits use English deterministically; browser language is not an
    // explicit preference. Saved choices and authenticated profile sync win.
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
