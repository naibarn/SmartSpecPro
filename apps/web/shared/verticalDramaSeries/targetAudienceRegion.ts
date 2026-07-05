/**
 * Vertical Drama Series — target-audience region (spec feature 131 follow-up,
 * 2026-07-06 character-prompt quality upgrade).
 *
 * Additive series-level setting controlling the default ethnicity/regional
 * styling look for every AI-generated character/person image (portraits,
 * turnarounds, character sheets, start frames, angle-grid variations, image
 * repairs). Stored inside the EXISTING `verticalDramaSeries.bible` jsonb
 * column (`VerticalDramaSeriesBible.targetAudienceRegion`) — no new DB
 * column, no migration.
 *
 * IMPORTANT — precedence rule: this is only a DEFAULT. Whenever an
 * individual character's own `description` states an explicit
 * ethnicity/nationality/region, THAT description always wins over the
 * series-level region default. Every prompt-building call site that injects
 * the region descriptor must phrase it as a default/fallback, never as an
 * override instruction.
 */

export const VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS = [
  "thai",
  "east_asian",
  "southeast_asian",
  "south_asian",
  "western",
  "latin",
  "middle_eastern",
  "african",
  "global_mixed",
] as const;

export type VerticalDramaTargetAudienceRegion =
  (typeof VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS)[number];

export const VERTICAL_DRAMA_DEFAULT_TARGET_AUDIENCE_REGION: VerticalDramaTargetAudienceRegion =
  "thai";

/**
 * English descriptor phrases injected verbatim into LLM prompts (system/user
 * prompts are English-language internally even for Thai-facing UI copy — see
 * every other `*PromptGeneration.ts`/`*Formatter.ts` module in this feature).
 * Kept short and concrete so it fits comfortably inside the shared 3500-char
 * image-prompt budget across every call site.
 */
export const VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_DESCRIPTORS: Record<
  VerticalDramaTargetAudienceRegion,
  string
> = {
  thai: "Thai/Southeast Asian features and styling appropriate for Thai audiences",
  east_asian: "East Asian (Chinese/Korean/Japanese) features and styling",
  southeast_asian: "Southeast Asian (e.g. Thai, Vietnamese, Filipino, Indonesian, Malaysian) features and styling",
  south_asian: "South Asian (e.g. Indian, Pakistani, Bangladeshi, Sri Lankan) features and styling",
  western: "Western/Caucasian features and styling",
  latin: "Latin American/Hispanic features and styling",
  middle_eastern: "Middle Eastern/Arab features and styling",
  african: "African/Black features and styling",
  global_mixed: "a globally mixed/multiracial look with no single dominant ethnicity",
};

/** Thai UI labels for the series-settings region picker. */
export const VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_LABELS_TH: Record<
  VerticalDramaTargetAudienceRegion,
  string
> = {
  thai: "ไทย",
  east_asian: "เอเชียตะวันออก (จีน/เกาหลี/ญี่ปุ่น)",
  southeast_asian: "เอเชียตะวันออกเฉียงใต้",
  south_asian: "เอเชียใต้",
  western: "ตะวันตก",
  latin: "ลาตินอเมริกา",
  middle_eastern: "ตะวันออกกลาง",
  african: "แอฟริกา",
  global_mixed: "หลากหลายเชื้อชาติ (ผสมทั่วโลก)",
};

/** English UI labels for the series-settings region picker. */
export const VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_LABELS_EN: Record<
  VerticalDramaTargetAudienceRegion,
  string
> = {
  thai: "Thai",
  east_asian: "East Asian (Chinese/Korean/Japanese)",
  southeast_asian: "Southeast Asian",
  south_asian: "South Asian",
  western: "Western",
  latin: "Latin American",
  middle_eastern: "Middle Eastern",
  african: "African",
  global_mixed: "Global mixed",
};

/** Type guard / safe parser — falls back to the default for unknown/missing values. */
export function normalizeTargetAudienceRegion(
  value: unknown,
): VerticalDramaTargetAudienceRegion {
  if (
    typeof value === "string" &&
    (VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS as readonly string[]).includes(value)
  ) {
    return value as VerticalDramaTargetAudienceRegion;
  }
  return VERTICAL_DRAMA_DEFAULT_TARGET_AUDIENCE_REGION;
}

/**
 * Build the concise, English, DEFAULT-only instruction sentence to append to
 * a person-generating prompt's user-instruction payload. Always phrased as a
 * fallback default so an explicit character `description` (ethnicity/
 * nationality) remains authoritative — callers must place any character
 * `description` text so the LLM/image model sees it as the more specific,
 * overriding source.
 */
export function buildTargetAudienceRegionInstruction(
  region: VerticalDramaTargetAudienceRegion | null | undefined,
): string {
  const resolved = normalizeTargetAudienceRegion(region);
  const descriptor = VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_DESCRIPTORS[resolved];
  return (
    `Default region/ethnicity (series-level target audience setting): ${descriptor}. ` +
    "Apply this ONLY as a default when the character's own description does not already " +
    "state an ethnicity/nationality/region — an explicit ethnicity/nationality in the " +
    "character's description always takes precedence over this default."
  );
}

/** Read `targetAudienceRegion` off a loosely-typed series `bible` jsonb payload. */
export function readTargetAudienceRegionFromBible(
  bible: Record<string, unknown> | null | undefined,
): VerticalDramaTargetAudienceRegion {
  return normalizeTargetAudienceRegion(bible?.targetAudienceRegion);
}
