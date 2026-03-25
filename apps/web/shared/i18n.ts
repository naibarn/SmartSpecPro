// Security: Translation values MUST be plain text only. No HTML markup.
// Language codes are validated against SUPPORTED_LANGUAGES on both client and server.
// See spec 062 Security Requirements S1.

export const SUPPORTED_LANGUAGES = [
  "en", "th", "ja", "ar", "zh-Hans", "zh-Hant", "ko", "vi", "id", "hi",
  "es", "pt-BR", "fr", "de", "ru", "it", "tr", "nl", "pl",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const RTL_LANGUAGES = ["ar"] as const;
export type RtlLanguage = (typeof RTL_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = "en" as const;

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: "English",
  th: "ไทย",
  ja: "日本語",
  ar: "العربية",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
  ko: "한국어",
  vi: "Tiếng Việt",
  id: "Bahasa Indonesia",
  hi: "हिन्दी",
  es: "Español",
  "pt-BR": "Português (Brasil)",
  fr: "Français",
  de: "Deutsch",
  ru: "Русский",
  it: "Italiano",
  tr: "Türkçe",
  nl: "Nederlands",
  pl: "Polski",
};

export const LANGUAGE_LABELS_EN: Record<SupportedLanguage, string> = {
  en: "English",
  th: "Thai",
  ja: "Japanese",
  ar: "Arabic",
  "zh-Hans": "Chinese (Simplified)",
  "zh-Hant": "Chinese (Traditional)",
  ko: "Korean",
  vi: "Vietnamese",
  id: "Indonesian",
  hi: "Hindi",
  es: "Spanish",
  "pt-BR": "Portuguese (Brazil)",
  fr: "French",
  de: "German",
  ru: "Russian",
  it: "Italian",
  tr: "Turkish",
  nl: "Dutch",
  pl: "Polish",
};

// Coverage is the percentage of EN translation keys that have TH/other equivalents.
// Update this whenever a new batch of translations is added.
// th: calculated from locales/en/ vs locales/th/ — 99% as of feature-062 Wave 1.
export const LANGUAGE_COVERAGE: Record<SupportedLanguage, number> = {
  en: 100,
  th: 99,
  ja: 0,
  ar: 0,
  "zh-Hans": 0,
  "zh-Hant": 0,
  ko: 0,
  vi: 0,
  id: 0,
  hi: 0,
  es: 0,
  "pt-BR": 0,
  fr: 0,
  de: 0,
  ru: 0,
  it: 0,
  tr: 0,
  nl: 0,
  pl: 0,
};
