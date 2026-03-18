import type { Locale, TranslationDictionary } from "../types";
import en from "./en";
import th from "./th";

const locales: Record<Locale, TranslationDictionary> = { en, th };

/** Return the dictionary for the given locale (falls back to English). */
export function getLocale(locale: Locale): TranslationDictionary {
  return locales[locale] ?? locales.en;
}
