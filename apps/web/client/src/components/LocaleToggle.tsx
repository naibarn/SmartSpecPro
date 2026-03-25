import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS, type SupportedLanguage } from "@shared/i18n";
import { STORAGE_KEY } from "@/i18n/languageDetector";
import { cn } from "@/lib/utils";

const DEFAULT_LANGUAGE = "en";
/** Fallback secondary language when current is English and no prior choice exists */
const FALLBACK_SECONDARY: SupportedLanguage = "th";
/** localStorage key for the most recently used non-English language */
const LAST_NON_EN_KEY = "smartspec_last_locale";

interface LocaleToggleProps {
  className?: string;
}

export function LocaleToggle({ className }: LocaleToggleProps) {
  const { i18n } = useTranslation();
  // Normalize against SUPPORTED_LANGUAGES to guard against browser-resolved codes like "en-US"
  const lang = (SUPPORTED_LANGUAGES as readonly string[]).includes(i18n.language)
    ? (i18n.language as SupportedLanguage)
    : DEFAULT_LANGUAGE;

  // Track the last non-English locale so the toggle always shows two buttons.
  // When switching away from English, read last-used non-EN from storage.
  // When switching TO a non-EN language, persist it so we can restore it.
  function getSecondaryLang(): SupportedLanguage {
    if (lang !== DEFAULT_LANGUAGE) return lang; // currently non-EN: show it
    // Currently English — look up what the user last used
    try {
      const stored = localStorage.getItem(LAST_NON_EN_KEY);
      if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored) && stored !== DEFAULT_LANGUAGE) {
        return stored as SupportedLanguage;
      }
    } catch { /* private/quota — fall through */ }
    return FALLBACK_SECONDARY;
  }

  const secondaryLang = getSecondaryLang();
  // Always show two buttons: English + the secondary language
  const visibleLocales: SupportedLanguage[] = [DEFAULT_LANGUAGE, secondaryLang];

  function handleChange(loc: SupportedLanguage) {
    // Persist the non-English choice so the other button stays visible when on EN
    if (loc !== DEFAULT_LANGUAGE) {
      try { localStorage.setItem(LAST_NON_EN_KEY, loc); } catch { /* ignore */ }
    }
    try { localStorage.setItem(STORAGE_KEY, loc); } catch { /* ignore */ }
    void i18n.changeLanguage(loc);
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border bg-background/80 p-1 text-xs shadow-sm",
        className,
      )}
      role="group"
      aria-label="Language switcher"
    >
      {visibleLocales.map((loc) => (
        <button
          key={loc}
          type="button"
          onClick={() => handleChange(loc)}
          className={cn(
            "rounded-full px-3 py-1 font-medium transition-colors",
            lang === loc
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          aria-pressed={lang === loc}
          title={LANGUAGE_LABELS[loc]}
        >
          {LANGUAGE_LABELS[loc]}
        </button>
      ))}
    </div>
  );
}
