import { z } from "zod";

/**
 * Per-character casting controls for the visual-bible skill.
 *
 * This is deliberately separate from the series-level target-audience region
 * contract. The old contract remains the compatibility path for existing
 * characters; this contract can grow without changing the meaning of a
 * series-wide default.
 */

export const VERTICAL_DRAMA_CHARACTER_CASTING_REGIONS = [
  "thai",
  "chinese",
  "korean",
  "japanese",
  "east_asian",
  "southeast_asian",
  "south_asian",
  "american_canadian",
  "british_irish",
  "european",
  "latin_hispanic",
  "black_african_descent",
  "middle_eastern",
  "mixed_heritage",
  "international",
] as const;

export type VerticalDramaCharacterCastingRegion =
  (typeof VERTICAL_DRAMA_CHARACTER_CASTING_REGIONS)[number];

export const VERTICAL_DRAMA_CHARACTER_CASTING_LOOKS = [
  "natural_relatable",
  "attractive_mainstream",
  "cute_youthful",
  "elegant_sophisticated",
  "strong_confident",
  "cool_charismatic",
  "mysterious_intense",
  "mature_refined",
  "distinctive_character_face",
] as const;

export type VerticalDramaCharacterCastingLook =
  (typeof VERTICAL_DRAMA_CHARACTER_CASTING_LOOKS)[number];

export const verticalDramaCharacterCastingPreferencesSchema = z
  .object({
    version: z.literal(1).default(1),
    regionMode: z.enum(["auto", "preset"]).default("auto"),
    region: z.enum(VERTICAL_DRAMA_CHARACTER_CASTING_REGIONS).optional(),
    lookMode: z.enum(["auto", "preset"]).default("auto"),
    look: z.enum(VERTICAL_DRAMA_CHARACTER_CASTING_LOOKS).optional(),
    additionalDetails: z.string().trim().max(800).optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (value.regionMode === "preset" && !value.region) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["region"],
        message: "A region is required when regionMode is preset.",
      });
    }
    if (value.lookMode === "preset" && !value.look) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["look"],
        message: "A casting look is required when lookMode is preset.",
      });
    }
  });

export type VerticalDramaCharacterCastingPreferences = z.infer<
  typeof verticalDramaCharacterCastingPreferencesSchema
>;

export interface VerticalDramaCharacterCastingFormState {
  region: "auto" | VerticalDramaCharacterCastingRegion;
  look: "auto" | VerticalDramaCharacterCastingLook;
  additionalDetails: string;
}

export const VERTICAL_DRAMA_CHARACTER_CASTING_FORM_DEFAULTS: VerticalDramaCharacterCastingFormState =
  {
    region: "auto",
    look: "auto",
    additionalDetails: "",
  };

export const VERTICAL_DRAMA_CHARACTER_CASTING_REGION_LABELS_TH: Record<
  VerticalDramaCharacterCastingRegion,
  string
> = {
  thai: "ไทย",
  chinese: "จีน",
  korean: "เกาหลี",
  japanese: "ญี่ปุ่น",
  east_asian: "เอเชียตะวันออก",
  southeast_asian: "เอเชียตะวันออกเฉียงใต้",
  south_asian: "เอเชียใต้",
  american_canadian: "อเมริกัน / แคนาดา",
  british_irish: "อังกฤษ / ไอร์แลนด์",
  european: "ยุโรป",
  latin_hispanic: "ลาติน / Hispanic",
  black_african_descent: "Black / เชื้อสายแอฟริกัน",
  middle_eastern: "ตะวันออกกลาง",
  mixed_heritage: "ลูกครึ่ง / Mixed Heritage",
  international: "International / ไม่จำกัดเชื้อสาย",
};

export const VERTICAL_DRAMA_CHARACTER_CASTING_REGION_LABELS_EN: Record<
  VerticalDramaCharacterCastingRegion,
  string
> = {
  thai: "Thai",
  chinese: "Chinese",
  korean: "Korean",
  japanese: "Japanese",
  east_asian: "East Asian",
  southeast_asian: "Southeast Asian",
  south_asian: "South Asian",
  american_canadian: "American / Canadian",
  british_irish: "British / Irish",
  european: "European",
  latin_hispanic: "Latin / Hispanic",
  black_african_descent: "Black / African descent",
  middle_eastern: "Middle Eastern",
  mixed_heritage: "Mixed Heritage",
  international: "International / unrestricted heritage",
};

export const VERTICAL_DRAMA_CHARACTER_CASTING_LOOK_LABELS_TH: Record<
  VerticalDramaCharacterCastingLook,
  string
> = {
  natural_relatable: "Natural / Relatable",
  attractive_mainstream: "Attractive / Mainstream",
  cute_youthful: "Cute / Youthful",
  elegant_sophisticated: "Elegant / Sophisticated",
  strong_confident: "Strong / Confident",
  cool_charismatic: "Cool / Charismatic",
  mysterious_intense: "Mysterious / Intense",
  mature_refined: "Mature / Refined",
  distinctive_character_face: "Distinctive / Character Face",
};

export const VERTICAL_DRAMA_CHARACTER_CASTING_LOOK_LABELS_EN: Record<
  VerticalDramaCharacterCastingLook,
  string
> = {
  natural_relatable: "Natural / Relatable",
  attractive_mainstream: "Attractive / Mainstream",
  cute_youthful: "Cute / Youthful",
  elegant_sophisticated: "Elegant / Sophisticated",
  strong_confident: "Strong / Confident",
  cool_charismatic: "Cool / Charismatic",
  mysterious_intense: "Mysterious / Intense",
  mature_refined: "Mature / Refined",
  distinctive_character_face: "Distinctive / Character Face",
};

const LEGACY_REGION_TO_CASTING_REGION: Record<
  string,
  VerticalDramaCharacterCastingRegion
> = {
  thai: "thai",
  east_asian: "east_asian",
  southeast_asian: "southeast_asian",
  south_asian: "south_asian",
  western: "european",
  latin: "latin_hispanic",
  middle_eastern: "middle_eastern",
  african: "black_african_descent",
  global_mixed: "international",
};

export function buildVerticalDramaCharacterCastingPreferences(
  form: VerticalDramaCharacterCastingFormState
): VerticalDramaCharacterCastingPreferences {
  const additionalDetails = form.additionalDetails.trim();
  return {
    version: 1,
    regionMode: form.region === "auto" ? "auto" : "preset",
    ...(form.region === "auto" ? {} : { region: form.region }),
    lookMode: form.look === "auto" ? "auto" : "preset",
    ...(form.look === "auto" ? {} : { look: form.look }),
    ...(additionalDetails ? { additionalDetails } : {}),
  };
}

/** Stable comparison key used to prevent an approved prompt from silently
 * bypassing a later casting-preference edit. */
export function buildCharacterCastingPreferencesFingerprint(
  preferences: VerticalDramaCharacterCastingPreferences,
): string {
  return JSON.stringify({
    version: 1,
    regionMode: preferences.regionMode,
    region: preferences.region ?? null,
    lookMode: preferences.lookMode,
    look: preferences.look ?? null,
    additionalDetails: preferences.additionalDetails?.trim() ?? "",
  });
}

/**
 * Reads the new contract and tolerates all legacy character data. A legacy
 * blank character intentionally resolves to explicit Auto so the skill can
 * use the story/market context on the next generation. Existing legacy
 * region/free-text data is carried forward into the new facts instead of
 * silently being discarded.
 */
export function readCharacterCastingPreferencesFromData(
  data: Record<string, unknown> | null | undefined
): VerticalDramaCharacterCastingPreferences {
  const parsed = verticalDramaCharacterCastingPreferencesSchema.safeParse(
    data?.castingPreferences
  );
  if (parsed.success) {
    return parsed.data;
  }

  const legacyRegion =
    typeof data?.region === "string"
      ? LEGACY_REGION_TO_CASTING_REGION[data.region]
      : undefined;
  const legacyEthnicityText =
    typeof data?.ethnicityText === "string" ? data.ethnicityText.trim() : "";
  return {
    version: 1,
    ...(legacyRegion
      ? { regionMode: "preset" as const, region: legacyRegion }
      : { regionMode: "auto" as const }),
    lookMode: "auto",
    ...(legacyEthnicityText ? { additionalDetails: legacyEthnicityText } : {}),
  };
}

export function characterCastingFormFromData(
  data: Record<string, unknown> | null | undefined
): VerticalDramaCharacterCastingFormState {
  const preferences = readCharacterCastingPreferencesFromData(data);
  return {
    region:
      preferences.regionMode === "preset" && preferences.region
        ? preferences.region
        : "auto",
    look:
      preferences.lookMode === "preset" && preferences.look
        ? preferences.look
        : "auto",
    additionalDetails: preferences.additionalDetails ?? "",
  };
}

export function getCharacterCastingRegionDescriptor(
  region: VerticalDramaCharacterCastingRegion
): string {
  return VERTICAL_DRAMA_CHARACTER_CASTING_REGION_LABELS_EN[region];
}
