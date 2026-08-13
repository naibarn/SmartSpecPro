import { z } from "zod";
import {
  verticalDramaLocaleEnglishName,
  type VerticalDramaSeriesLocale,
} from "./contracts";

/**
 * Series-level spoken-language controls.
 *
 * `locale` remains the narrative/content language for legacy callers. This
 * contract is deliberately additive and applies only to spoken dialogue,
 * subtitle lines, and TTS. Missing legacy values resolve to Auto.
 */

export const VERTICAL_DRAMA_DIALOGUE_MARKET_MODES = [
  "auto",
  "american",
  "british",
  "australian",
  "international",
] as const;

export type VerticalDramaDialogueMarketMode =
  (typeof VERTICAL_DRAMA_DIALOGUE_MARKET_MODES)[number];

export const VERTICAL_DRAMA_SPOKEN_LOCALE_OPTIONS = [
  {
    id: "auto",
    group: "auto",
    labelTh: "อัตโนมัติ — วิเคราะห์จากเรื่องและตลาด",
    labelEn: "Auto — infer from story and market",
    prompt:
      "Natural contemporary speech appropriate to the established story setting, audience, relationships, and character identities.",
  },
  {
    id: "en-US",
    group: "English",
    labelTh: "English (US) — อเมริกัน",
    labelEn: "English (US) — American",
    prompt:
      "Natural contemporary American English, spoken dialogue, not translated English.",
  },
  {
    id: "en-GB",
    group: "English",
    labelTh: "English (UK) — อังกฤษ",
    labelEn: "English (UK) — British",
    prompt:
      "Natural contemporary British English, spoken dialogue, not translated English.",
  },
  {
    id: "en-CA",
    group: "English",
    labelTh: "English (Canada)",
    labelEn: "English (Canada)",
    prompt:
      "Natural contemporary Canadian English, spoken dialogue, not translated English.",
  },
  {
    id: "en-AU",
    group: "English",
    labelTh: "English (Australia)",
    labelEn: "English (Australia)",
    prompt:
      "Natural contemporary Australian English, spoken dialogue, not translated English.",
  },
  {
    id: "en-IE",
    group: "English",
    labelTh: "English (Ireland)",
    labelEn: "English (Ireland)",
    prompt:
      "Natural contemporary Irish English, spoken dialogue, not translated English.",
  },
  {
    id: "en-NZ",
    group: "English",
    labelTh: "English (New Zealand)",
    labelEn: "English (New Zealand)",
    prompt:
      "Natural contemporary New Zealand English, spoken dialogue, not translated English.",
  },
  {
    id: "en-IN",
    group: "English",
    labelTh: "English (India)",
    labelEn: "English (India)",
    prompt:
      "Natural contemporary Indian English, spoken dialogue, not translated English.",
  },
  {
    id: "en-SG",
    group: "English",
    labelTh: "English (Singapore)",
    labelEn: "English (Singapore)",
    prompt:
      "Natural contemporary Singapore English, spoken dialogue, not translated English.",
  },
  {
    id: "en-INTL",
    group: "English",
    labelTh: "International English",
    labelEn: "International English",
    prompt:
      "Natural contemporary international English, spoken dialogue, not translated English; prefer broadly understandable wording without flattening character voice.",
  },
  {
    id: "th-CENTRAL",
    group: "Thai",
    labelTh: "ไทยกลาง / ไทยมาตรฐาน",
    labelEn: "Thai — Central / media standard",
    prompt:
      "Natural contemporary Central Thai, spoken dialogue, not translated Thai; use relationship-appropriate pronouns, particles, and politeness.",
  },
  {
    id: "th-ISAN",
    group: "Thai",
    labelTh: "ไทยอีสาน",
    labelEn: "Thai — Isan",
    prompt:
      "Natural contemporary Isan Thai, spoken dialogue, not translated Thai; use regional wording only when supported by the character and setting.",
  },
  {
    id: "th-NORTH",
    group: "Thai",
    labelTh: "ไทยเหนือ",
    labelEn: "Thai — Northern",
    prompt:
      "Natural contemporary Northern Thai, spoken dialogue, not translated Thai; use regional wording only when supported by the character and setting.",
  },
  {
    id: "th-CHIANG-MAI",
    group: "Thai",
    labelTh: "ไทยเชียงใหม่",
    labelEn: "Thai — Chiang Mai",
    prompt:
      "Natural contemporary Thai dialogue for a Chiang Mai setting, not translated Thai; use Northern identity and wording with restraint.",
  },
  {
    id: "th-SOUTH",
    group: "Thai",
    labelTh: "ไทยใต้",
    labelEn: "Thai — Southern",
    prompt:
      "Natural contemporary Southern Thai, spoken dialogue, not translated Thai; use regional wording only when supported by the character and setting.",
  },
  {
    id: "zh-CN",
    group: "Chinese",
    labelTh: "จีนกลาง — จีนแผ่นดินใหญ่ (ตัวย่อ)",
    labelEn: "Mandarin — Mainland China (Simplified)",
    prompt:
      "Natural contemporary Mainland Mandarin, spoken dialogue, not translated Chinese; use culturally appropriate address terms and conversational rhythm.",
  },
  {
    id: "zh-TW",
    group: "Chinese",
    labelTh: "จีนกลาง — ไต้หวัน (ตัวเต็ม)",
    labelEn: "Mandarin — Taiwan (Traditional)",
    prompt:
      "Natural contemporary Taiwan Mandarin, spoken dialogue, not translated Chinese; use Taiwan-appropriate vocabulary and address terms.",
  },
  {
    id: "zh-HK",
    group: "Chinese",
    labelTh: "กวางตุ้ง — ฮ่องกง",
    labelEn: "Cantonese — Hong Kong",
    prompt:
      "Natural contemporary Hong Kong Cantonese, spoken dialogue, not translated Chinese; use natural Cantonese particles and address terms.",
  },
  {
    id: "zh-GD",
    group: "Chinese",
    labelTh: "กวางตุ้ง — กวางตุ้ง/เซินเจิ้น",
    labelEn: "Cantonese — Guangdong / Shenzhen",
    prompt:
      "Natural contemporary Guangdong Cantonese, spoken dialogue, not translated Chinese; use natural regional particles and address terms.",
  },
  {
    id: "zh-SG",
    group: "Chinese",
    labelTh: "จีนกลาง — สิงคโปร์",
    labelEn: "Mandarin — Singapore",
    prompt:
      "Natural contemporary Singapore Mandarin, spoken dialogue, not translated Chinese; use Singapore-appropriate register and vocabulary.",
  },
  {
    id: "zh-HOKKIEN",
    group: "Chinese",
    labelTh: "ไต้หวันฮกเกี้ยน",
    labelEn: "Taiwanese Hokkien",
    prompt:
      "Natural contemporary Taiwanese Hokkien dialogue, not translated Chinese; preserve the established character and setting context.",
  },
  {
    id: "ja-JP",
    group: "Japanese",
    labelTh: "ญี่ปุ่นมาตรฐาน / โตเกียว",
    labelEn: "Japanese — Standard / Tokyo",
    prompt:
      "Natural contemporary Japanese spoken dialogue, not translated Japanese; choose casual, polite, and honorific speech from relationship and status.",
  },
  {
    id: "ja-KANSAI",
    group: "Japanese",
    labelTh: "ญี่ปุ่นคันไซ",
    labelEn: "Japanese — Kansai",
    prompt:
      "Natural contemporary Kansai Japanese spoken dialogue, not translated Japanese; use dialect selectively and consistently for character identity.",
  },
  {
    id: "ko-KR",
    group: "Korean",
    labelTh: "เกาหลีมาตรฐาน / โซล",
    labelEn: "Korean — Standard / Seoul",
    prompt:
      "Natural contemporary Korean spoken dialogue, not translated Korean; reflect relationship-based speech levels and address terms.",
  },
  {
    id: "es-LATAM",
    group: "Spanish",
    labelTh: "สเปนลาตินอเมริกาแบบเข้าใจง่าย",
    labelEn: "Spanish — broadly understandable Latin America",
    prompt:
      "Natural contemporary Latin American Spanish, spoken dialogue, not translated Spanish; avoid mixing regionalisms arbitrarily.",
  },
  {
    id: "es-MX",
    group: "Spanish",
    labelTh: "สเปนเม็กซิโก",
    labelEn: "Spanish — Mexico",
    prompt:
      "Natural contemporary Mexican Spanish, spoken dialogue, not translated Spanish; use Mexican wording consistently.",
  },
  {
    id: "es-ES",
    group: "Spanish",
    labelTh: "สเปนสเปน",
    labelEn: "Spanish — Spain",
    prompt:
      "Natural contemporary European Spanish, spoken dialogue, not translated Spanish; use Spain-appropriate vocabulary consistently.",
  },
  {
    id: "pt-BR",
    group: "Portuguese",
    labelTh: "โปรตุเกสบราซิล",
    labelEn: "Portuguese — Brazil",
    prompt:
      "Natural contemporary Brazilian Portuguese, spoken dialogue, not translated Portuguese.",
  },
  {
    id: "pt-PT",
    group: "Portuguese",
    labelTh: "โปรตุเกสยุโรป",
    labelEn: "Portuguese — Portugal",
    prompt:
      "Natural contemporary European Portuguese, spoken dialogue, not translated Portuguese.",
  },
  {
    id: "fr-FR",
    group: "French",
    labelTh: "ฝรั่งเศสฝรั่งเศส",
    labelEn: "French — France",
    prompt:
      "Natural contemporary French from France, spoken dialogue, not translated French.",
  },
  {
    id: "fr-CA",
    group: "French",
    labelTh: "ฝรั่งเศสแคนาดา / Québec",
    labelEn: "French — Canada / Québec",
    prompt:
      "Natural contemporary Quebec French, spoken dialogue, not translated French.",
  },
  {
    id: "vi-NORTH",
    group: "Vietnamese",
    labelTh: "เวียดนามเหนือ / ฮานอย",
    labelEn: "Vietnamese — Northern / Hanoi",
    prompt:
      "Natural contemporary Northern Vietnamese, spoken dialogue, not translated Vietnamese.",
  },
  {
    id: "vi-SOUTH",
    group: "Vietnamese",
    labelTh: "เวียดนามใต้ / โฮจิมินห์",
    labelEn: "Vietnamese — Southern / Ho Chi Minh City",
    prompt:
      "Natural contemporary Southern Vietnamese, spoken dialogue, not translated Vietnamese.",
  },
  {
    id: "id-ID",
    group: "Other Asian",
    labelTh: "อินโดนีเซียมาตรฐาน",
    labelEn: "Indonesian — Standard",
    prompt:
      "Natural contemporary Indonesian, spoken dialogue, not translated Indonesian.",
  },
  {
    id: "fil-PH",
    group: "Other Asian",
    labelTh: "ฟิลิปปินส์ / Taglish",
    labelEn: "Filipino / Taglish",
    prompt:
      "Natural contemporary Filipino dialogue with restrained, character-appropriate Taglish where the setting supports it; do not translate literally.",
  },
  {
    id: "hi-IN",
    group: "Other Asian",
    labelTh: "ฮินดีอินเดีย",
    labelEn: "Hindi — India",
    prompt:
      "Natural contemporary Hindi spoken dialogue, not translated Hindi; match relationship, status, and setting.",
  },
  {
    id: "ar-EG",
    group: "Arabic",
    labelTh: "อาหรับอียิปต์",
    labelEn: "Arabic — Egyptian",
    prompt:
      "Natural contemporary Egyptian Arabic spoken dialogue, not translated Arabic.",
  },
  {
    id: "ar-GULF",
    group: "Arabic",
    labelTh: "อาหรับอ่าวอาหรับ",
    labelEn: "Arabic — Gulf",
    prompt:
      "Natural contemporary Gulf Arabic spoken dialogue, not translated Arabic.",
  },
  {
    id: "ar-LEVANT",
    group: "Arabic",
    labelTh: "อาหรับเลแวนต์",
    labelEn: "Arabic — Levantine",
    prompt:
      "Natural contemporary Levantine Arabic spoken dialogue, not translated Arabic.",
  },
  {
    id: "de-DE",
    group: "European",
    labelTh: "เยอรมันเยอรมนี",
    labelEn: "German — Germany",
    prompt:
      "Natural contemporary German from Germany, spoken dialogue, not translated German.",
  },
  {
    id: "it-IT",
    group: "European",
    labelTh: "อิตาลีมาตรฐาน",
    labelEn: "Italian — Standard",
    prompt:
      "Natural contemporary Italian, spoken dialogue, not translated Italian.",
  },
  {
    id: "tr-TR",
    group: "European",
    labelTh: "ตุรกีมาตรฐาน",
    labelEn: "Turkish — Standard",
    prompt:
      "Natural contemporary Turkish, spoken dialogue, not translated Turkish.",
  },
  {
    id: "ru-RU",
    group: "European",
    labelTh: "รัสเซียมาตรฐาน",
    labelEn: "Russian — Standard",
    prompt:
      "Natural contemporary Russian, spoken dialogue, not translated Russian.",
  },
] as const;

export type VerticalDramaSpokenLocaleId =
  (typeof VERTICAL_DRAMA_SPOKEN_LOCALE_OPTIONS)[number]["id"];

const SPOKEN_LOCALE_IDS = VERTICAL_DRAMA_SPOKEN_LOCALE_OPTIONS.map(
  option => option.id
) as [VerticalDramaSpokenLocaleId, ...VerticalDramaSpokenLocaleId[]];

export const verticalDramaSpokenLocaleSchema = z.enum(SPOKEN_LOCALE_IDS);

export type VerticalDramaDialogueLanguageProfile = {
  /** Version 1 is accepted for old JSONB rows; normalized reads return 2. */
  version: 1 | 2;
  /** New explicit spoken-language/market selection. */
  spokenLocale?: VerticalDramaSpokenLocaleId;
  /** Legacy English-only selector retained for old clients and rows. */
  marketMode?: VerticalDramaDialogueMarketMode;
  /** Optional resolved value captured by a future story-bible resolver. */
  resolvedSpokenLocale?: Exclude<VerticalDramaSpokenLocaleId, "auto">;
  resolutionReason?: string;
};

export const verticalDramaDialogueLanguageProfileSchema = z
  .object({
    version: z
      .union([z.literal(1), z.literal(2)])
      .optional()
      .default(2),
    spokenLocale: verticalDramaSpokenLocaleSchema.optional(),
    marketMode: z.enum(VERTICAL_DRAMA_DIALOGUE_MARKET_MODES).optional(),
    resolvedSpokenLocale: verticalDramaSpokenLocaleSchema
      .exclude(["auto"])
      .optional(),
    resolutionReason: z.string().trim().max(500).optional(),
  })
  .passthrough();

export const VERTICAL_DRAMA_DIALOGUE_LANGUAGE_PROFILE_DEFAULTS: VerticalDramaDialogueLanguageProfile =
  {
    version: 2,
    spokenLocale: "auto",
  };

export const VERTICAL_DRAMA_DIALOGUE_MARKET_LABELS_TH: Record<
  VerticalDramaDialogueMarketMode,
  string
> = {
  auto: "อัตโนมัติ — วิเคราะห์จากเรื่องและตลาด",
  american: "English (US) — อเมริกัน",
  british: "English (UK) — อังกฤษ",
  australian: "English (Australia)",
  international: "International English",
};

export const VERTICAL_DRAMA_DIALOGUE_MARKET_LABELS_EN: Record<
  VerticalDramaDialogueMarketMode,
  string
> = {
  auto: "Auto — infer from story and market",
  american: "English (US) — American",
  british: "English (UK) — British",
  australian: "English (Australia)",
  international: "International English",
};

export const VERTICAL_DRAMA_SPOKEN_LOCALE_GROUP_LABELS_TH: Record<
  string,
  string
> = {
  auto: "อัตโนมัติ",
  English: "ภาษาอังกฤษ",
  Thai: "ภาษาไทย",
  Chinese: "ภาษาจีน",
  Japanese: "ภาษาญี่ปุ่น",
  Korean: "ภาษาเกาหลี",
  Spanish: "ภาษาสเปน",
  Portuguese: "ภาษาโปรตุเกส",
  French: "ภาษาฝรั่งเศส",
  Vietnamese: "ภาษาเวียดนาม",
  "Other Asian": "ภาษาเอเชียอื่น ๆ",
  Arabic: "ภาษาอาหรับ",
  European: "ภาษายุโรปอื่น ๆ",
};

export const VERTICAL_DRAMA_SPOKEN_LOCALE_GROUP_LABELS_EN: Record<
  string,
  string
> = {
  auto: "Automatic",
  English: "English",
  Thai: "Thai",
  Chinese: "Chinese",
  Japanese: "Japanese",
  Korean: "Korean",
  Spanish: "Spanish",
  Portuguese: "Portuguese",
  French: "French",
  Vietnamese: "Vietnamese",
  "Other Asian": "Other Asian languages",
  Arabic: "Arabic",
  European: "Other European languages",
};

const LEGACY_MARKET_TO_SPOKEN_LOCALE: Record<
  VerticalDramaDialogueMarketMode,
  Exclude<VerticalDramaSpokenLocaleId, "auto">
> = {
  auto: "en-US",
  american: "en-US",
  british: "en-GB",
  australian: "en-AU",
  international: "en-INTL",
};

const AUTO_SPOKEN_LOCALE_BY_CONTENT_LOCALE: Record<
  VerticalDramaSeriesLocale,
  Exclude<VerticalDramaSpokenLocaleId, "auto">
> = {
  th: "th-CENTRAL",
  en: "en-US",
  zh: "zh-CN",
  ja: "ja-JP",
  ko: "ko-KR",
  es: "es-LATAM",
  pt: "pt-BR",
  id: "id-ID",
  vi: "vi-NORTH",
  hi: "hi-IN",
  ar: "ar-EG",
  fr: "fr-FR",
  de: "de-DE",
  tr: "tr-TR",
  it: "it-IT",
  ru: "ru-RU",
  fil: "fil-PH",
  ms: "id-ID",
};

function getSpokenLocaleOption(id: VerticalDramaSpokenLocaleId) {
  return VERTICAL_DRAMA_SPOKEN_LOCALE_OPTIONS.find(option => option.id === id)!;
}

function legacyMarketModeForSpokenLocale(
  spokenLocale: VerticalDramaSpokenLocaleId
): VerticalDramaDialogueMarketMode | undefined {
  switch (spokenLocale) {
    case "en-US":
      return "american";
    case "en-GB":
      return "british";
    case "en-AU":
      return "australian";
    case "en-INTL":
      return "international";
    default:
      return undefined;
  }
}

export function readVerticalDramaDialogueLanguageProfile(
  value: unknown
): VerticalDramaDialogueLanguageProfile {
  const parsed = verticalDramaDialogueLanguageProfileSchema.safeParse(value);
  if (!parsed.success) return VERTICAL_DRAMA_DIALOGUE_LANGUAGE_PROFILE_DEFAULTS;

  const requested =
    parsed.data.spokenLocale ??
    (parsed.data.marketMode
      ? parsed.data.marketMode === "auto"
        ? "auto"
        : LEGACY_MARKET_TO_SPOKEN_LOCALE[parsed.data.marketMode]
      : "auto");
  const legacyMarketMode =
    parsed.data.marketMode ?? legacyMarketModeForSpokenLocale(requested);

  return {
    version: 2,
    spokenLocale: requested,
    ...(legacyMarketMode ? { marketMode: legacyMarketMode } : {}),
    ...(parsed.data.resolvedSpokenLocale
      ? { resolvedSpokenLocale: parsed.data.resolvedSpokenLocale }
      : {}),
    ...(parsed.data.resolutionReason
      ? { resolutionReason: parsed.data.resolutionReason }
      : {}),
  };
}

/** Backward-compatible builder for old callers that still submit marketMode. */
export function buildVerticalDramaDialogueLanguageProfile(
  marketMode: VerticalDramaDialogueMarketMode | null | undefined
): VerticalDramaDialogueLanguageProfile {
  const resolvedMarketMode = marketMode ?? "auto";
  return {
    version: 2,
    spokenLocale:
      resolvedMarketMode === "auto"
        ? "auto"
        : LEGACY_MARKET_TO_SPOKEN_LOCALE[resolvedMarketMode],
    marketMode: resolvedMarketMode,
  };
}

export function buildVerticalDramaSpokenLanguageProfile(
  spokenLocale: VerticalDramaSpokenLocaleId | null | undefined
): VerticalDramaDialogueLanguageProfile {
  const requested = spokenLocale ?? "auto";
  return {
    version: 2,
    spokenLocale: requested,
    ...(legacyMarketModeForSpokenLocale(requested)
      ? { marketMode: legacyMarketModeForSpokenLocale(requested) }
      : {}),
  };
}

export function resolveVerticalDramaSpokenLocale(params: {
  locale: VerticalDramaSeriesLocale;
  profile?: VerticalDramaDialogueLanguageProfile | null;
}): Exclude<VerticalDramaSpokenLocaleId, "auto"> {
  const profile = readVerticalDramaDialogueLanguageProfile(params.profile);
  if (profile.resolvedSpokenLocale) return profile.resolvedSpokenLocale;
  if (profile.spokenLocale && profile.spokenLocale !== "auto") {
    return profile.spokenLocale;
  }
  return AUTO_SPOKEN_LOCALE_BY_CONTENT_LOCALE[params.locale] ?? "en-US";
}

/**
 * One prompt contract shared by story, script, storyboard, and audio stages.
 * The spoken profile is hard-scoped so it cannot rewrite narrative fields.
 */
export function buildVerticalDramaDialogueLanguageProfilePrompt(params: {
  locale: VerticalDramaSeriesLocale;
  profile?: VerticalDramaDialogueLanguageProfile | null;
}): string {
  const profile = readVerticalDramaDialogueLanguageProfile(params.profile);
  const narrativeLanguage = verticalDramaLocaleEnglishName(params.locale);
  const resolvedSpokenLocale = resolveVerticalDramaSpokenLocale({
    locale: params.locale,
    profile,
  });
  const option = getSpokenLocaleOption(resolvedSpokenLocale);
  const requested = profile.spokenLocale ?? "auto";
  const autoGuidance =
    requested === "auto"
      ? params.locale === "en"
        ? "If no conflicting setting is established, default to United States / General American English."
        : params.locale === "zh"
          ? "Auto defaults to contemporary Mandarin drama for Mainland China in Simplified Chinese unless the story establishes Taiwan, Hong Kong, or another Chinese-speaking market."
          : params.locale === "ja"
            ? "Auto defaults to contemporary Japanese spoken drama for Japan; choose casual, polite, or honorific speech from relationship and status."
            : params.locale === "th"
              ? "Auto defaults to contemporary Thai spoken drama for Thailand; choose pronouns, honorifics, particles, and politeness from relationship and status."
              : "Auto uses the most commercially natural contemporary spoken register for the established locale and audience."
      : "This is an explicit creator override; follow it even when it differs from the narrative locale's default market.";
  const compatibilityGuidance =
    params.locale === "th"
      ? "Natural contemporary spoken Thai, not translated Thai; use culturally appropriate forms of address."
      : params.locale === "zh"
        ? "Use culturally appropriate forms of address and natural Chinese speech; Simplified Chinese is the default Mainland written support when the setting requires it."
        : params.locale === "ja"
          ? "Use culturally appropriate forms of address and natural Japanese speech with casual, polite, or honorific levels."
          : params.locale === "en"
            ? "Use natural contractions, idiomatic phrasing, and culturally appropriate forms of address."
            : "Use culturally appropriate forms of address and natural contemporary speech.";

  return [
    "DIALOGUE LANGUAGE PROFILE (HARD CONTRACT)",
    `Narrative/content language: ${narrativeLanguage} (this remains controlled by the current UI language and must not be changed by this profile).`,
    `Requested spoken locale: ${requested}`,
    `Resolved spoken locale: ${resolvedSpokenLocale}`,
    `Effective dialogue profile: ${option.prompt}`,
    autoGuidance,
    compatibilityGuidance,
    "Scope: apply this profile only to spoken dialogue, subtitle text that mirrors dialogue, and TTS/audio pronunciation.",
    "Auto resolution must use the established story setting, target market, audience, character identity, relationship, age, and status; do not choose a dialect randomly and do not re-resolve inconsistently at each stage.",
    `Write dialogue for actors to say aloud in ${option.labelEn}: use natural rhythm, culturally appropriate address terms, interruptions, subtext, and character-specific voice.`,
    "Do not translate Thai, Chinese, or another language's sentence structure literally. Do not write dialogue like an essay, report, textbook, legal memo, or plot summary.",
    "Do not use this spoken-language profile to change the logline, main plot, season arc, character metadata, setting, visual identity, continuity, thread IDs, or romance phase.",
  ].join(" ");
}

export function buildVerticalDramaDialogueLanguageProfileFromBible(
  bible: Record<string, unknown> | null | undefined
): VerticalDramaDialogueLanguageProfile {
  return readVerticalDramaDialogueLanguageProfile(
    bible?.dialogueLanguageProfile
  );
}
