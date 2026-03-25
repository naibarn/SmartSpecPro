/**
 * WelcomeLanguagePicker — one-time language selection modal for new users.
 *
 * Shows when:
 *   - User is authenticated
 *   - localStorage `smartspec_locale_chosen` is not 'true'
 *   - User's stored `translationLanguage` preference is empty/unset
 *
 * On selection:
 *   - Calls i18next.changeLanguage()
 *   - Writes to localStorage smartspec_locale
 *   - Persists to DB via tRPC users.updatePreferences
 *   - Sets smartspec_locale_chosen='true' to prevent re-showing
 *
 * Section 09 — i18n feature 062
 */

import { useState, useEffect } from "react";
import i18next from "i18next";
import { STORAGE_KEY as LOCALE_STORAGE_KEY } from "@/i18n/languageDetector";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_LABELS,
  LANGUAGE_LABELS_EN,
  LANGUAGE_COVERAGE,
  type SupportedLanguage,
} from "@shared/i18n";

const LOCALE_CHOSEN_KEY = "smartspec_locale_chosen";
const LOCALE_KEY = LOCALE_STORAGE_KEY; // canonical key from languageDetector.ts
const MIN_COVERAGE = 50;

// Module-level singleton to avoid recreating on every render
const storage = (() => {
  const get = (k: string): string | null => {
    try { return localStorage.getItem(k); } catch { return null; }
  };
  const set = (k: string, v: string): void => {
    try { localStorage.setItem(k, v); } catch { /* quota or private mode */ }
  };
  return { get, set };
})();

export function WelcomeLanguagePicker() {
  const { isAuthenticated } = useAuth();
  const alreadyChosen = storage.get(LOCALE_CHOSEN_KEY) === "true";

  const { data: prefs, isSuccess, isError } = trpc.users.getPreferences.useQuery(undefined, {
    enabled: isAuthenticated && !alreadyChosen,
  });
  const { mutate: updatePreferences } = trpc.users.updatePreferences.useMutation();

  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || alreadyChosen) return;
    if (!isSuccess && !isError) return; // still loading
    const hasPreference =
      (typeof prefs?.displayLocale === "string" && prefs.displayLocale !== "") ||
      (typeof prefs?.translationLanguage === "string" && prefs.translationLanguage !== "");
    if (!hasPreference) setOpen(true);
  }, [isAuthenticated, alreadyChosen, isSuccess, isError, prefs?.translationLanguage]);

  // Don't render anything for unauthenticated users
  if (!isAuthenticated) return null;

  // Languages with sufficient coverage (excluding English — it's the "continue" fallback)
  const availableLanguages = SUPPORTED_LANGUAGES.filter(
    (lang): lang is SupportedLanguage =>
      lang !== "en" && (LANGUAGE_COVERAGE[lang as SupportedLanguage] ?? 0) >= MIN_COVERAGE
  );

  function handleSelect(lang: string) {
    // Defense-in-depth: validate against SUPPORTED_LANGUAGES
    if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(lang)) return;

    void i18next.changeLanguage(lang);
    storage.set(LOCALE_KEY, lang);
    storage.set(LOCALE_CHOSEN_KEY, "true");
    updatePreferences({ translationLanguage: lang as SupportedLanguage, displayLocale: lang as SupportedLanguage });
    setOpen(false);
  }

  function handleDismiss() {
    storage.set(LOCALE_CHOSEN_KEY, "true");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Choose Your Language</DialogTitle>
          <DialogDescription>
            Select your preferred display language. English is always available as a fallback.
          </DialogDescription>
        </DialogHeader>

        {availableLanguages.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 my-4">
            {availableLanguages.map((lang) => (
              <button
                key={lang}
                onClick={() => handleSelect(lang)}
                aria-label={`${LANGUAGE_LABELS[lang]} — ${LANGUAGE_LABELS_EN[lang]}`}
                className="rounded-lg border p-3 text-left hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <div className="font-medium">{LANGUAGE_LABELS[lang]}</div>
                <div className="text-muted-foreground text-xs mt-1">
                  {lang} · {LANGUAGE_COVERAGE[lang]}% translated
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm my-4">
            More languages are coming soon. Continue in English for now.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleDismiss}>
            Continue with English
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
