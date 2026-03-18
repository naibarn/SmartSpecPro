/**
 * i18n type definitions.
 *
 * Supported locales are listed in `Locale`.  Every translation file must
 * satisfy `TranslationDictionary` — a flat string→string map whose keys
 * are dot-separated paths (e.g. "help.title").
 *
 * The system is intentionally flat and simple so it can be extended to
 * cover the rest of the UI without pulling in a heavy i18n library.
 */

/** All supported locales.  Add new ones here when needed. */
export type Locale = "en" | "th";

/** A flat key→value translation map. */
export type TranslationDictionary = Record<string, string>;

/** Map from locale code to its dictionary. */
export type LocaleMap = Record<Locale, TranslationDictionary>;

/** Default locale used when none is selected. */
export const DEFAULT_LOCALE: Locale = "en";

/** Human-readable labels for the locale picker. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  th: "ไทย",
};

/** All available locale codes. */
export const AVAILABLE_LOCALES: Locale[] = ["en", "th"];
