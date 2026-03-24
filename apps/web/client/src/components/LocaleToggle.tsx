import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS, type SupportedLanguage } from "@shared/i18n";
import { cn } from "@/lib/utils";

const DEFAULT_LANGUAGE = "en";

interface LocaleToggleProps {
  className?: string;
}

export function LocaleToggle({ className }: LocaleToggleProps) {
  const { i18n } = useTranslation();
  // Normalize against SUPPORTED_LANGUAGES to guard against browser-resolved codes like "en-US"
  const lang = (SUPPORTED_LANGUAGES as readonly string[]).includes(i18n.language)
    ? (i18n.language as SupportedLanguage)
    : DEFAULT_LANGUAGE;

  // Show English + current non-English language; only English if already on English
  const visibleLocales: SupportedLanguage[] = lang === "en" ? ["en"] : ["en", lang];

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
          onClick={() => i18n.changeLanguage(loc)}
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
