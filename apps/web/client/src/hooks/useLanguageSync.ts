import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { i18n } from "@/i18n";
import { SUPPORTED_LANGUAGES } from "@shared/i18n";

/**
 * Syncs the user's DB language preference to i18next after auth.
 *
 * Priority order for language source:
 *   1. `displayLocale` — the explicit UI display language (set by WelcomeLanguagePicker / Settings)
 *   2. `translationLanguage` — fallback for accounts created before displayLocale was added
 *
 * The language detector (section-03) handles pre-auth detection from
 * localStorage/browser. This hook handles the post-auth case: once the
 * user's profile is available via `useAuth()`, sync the DB preference to
 * i18next if it differs from the current language.
 *
 * Fire-and-forget — does not block rendering.
 */
export function useLanguageSync(): void {
  const { user, isLoading } = useAuth();

  const { data: prefs } = trpc.users.getPreferences.useQuery(undefined, {
    enabled: !!user && !isLoading,
  });

  useEffect(() => {
    if (isLoading || !user) return;
    if (!prefs) return;

    const p = prefs as { translationLanguage?: string; displayLocale?: string };
    // Prefer displayLocale (explicit UI preference) over translationLanguage (LLM target, used as fallback)
    const dbLang = p.displayLocale || p.translationLanguage;
    if (typeof dbLang !== "string" || !dbLang) return;

    // Validate: only apply known supported languages
    if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(dbLang)) return;

    // Skip if already in sync — use resolvedLanguage to handle region variants
    // (e.g., i18next may set language to "en-US" but DB stores "en")
    const currentLang = i18n.resolvedLanguage ?? i18n.language;
    if (dbLang === currentLang) return;

    void i18n.changeLanguage(dbLang);
    try {
      localStorage.setItem("smartspec_locale", dbLang);
    } catch {
      // Private/full storage — language still applied to i18next
    }
  }, [user, isLoading, prefs]);
}
