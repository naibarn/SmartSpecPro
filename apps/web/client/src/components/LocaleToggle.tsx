import { AVAILABLE_LOCALES, LOCALE_LABELS, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface LocaleToggleProps {
  className?: string;
}

export function LocaleToggle({ className }: LocaleToggleProps) {
  const { locale, setLocale } = useI18n();

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border bg-background/80 p-1 text-xs shadow-sm",
        className,
      )}
      role="group"
      aria-label="Language switcher"
    >
      {AVAILABLE_LOCALES.map((loc) => (
        <button
          key={loc}
          type="button"
          onClick={() => setLocale(loc)}
          className={cn(
            "rounded-full px-3 py-1 font-medium transition-colors",
            locale === loc
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          aria-pressed={locale === loc}
          title={LOCALE_LABELS[loc]}
        >
          {LOCALE_LABELS[loc]}
        </button>
      ))}
    </div>
  );
}
