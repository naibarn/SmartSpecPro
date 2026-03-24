import { useTranslation } from "react-i18next";
import { LANGUAGE_LABELS } from "@shared/i18n";
import { cn } from "@/lib/utils";

interface LocaleToggleProps {
  className?: string;
}

export function LocaleToggle({ className }: LocaleToggleProps) {
  const { i18n } = useTranslation();
  const currentLang = i18n.language;

  // Show English + current non-English language; only English if already on English
  const visibleLocales = currentLang === "en" ? ["en"] : ["en", currentLang];

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
            currentLang === loc
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          aria-pressed={currentLang === loc}
          title={LANGUAGE_LABELS[loc as keyof typeof LANGUAGE_LABELS] ?? loc}
        >
          {LANGUAGE_LABELS[loc as keyof typeof LANGUAGE_LABELS] ?? loc}
        </button>
      ))}
    </div>
  );
}
