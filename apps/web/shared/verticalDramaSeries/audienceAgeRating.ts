/**
 * Vertical Drama Series — Audience Age Rating.
 *
 * Single source of truth (client wizard + server zod + every LLM generation
 * stage) for the series-level target-audience age tier that shapes GENERATED
 * CONTENT (story, script, dialogue, storyboard). Persisted free-form at
 * `bible.audienceAgeRating` (no DB migration — `bible` is jsonb).
 *
 * This is distinct from `enforceMediaAgeSafety` (a per-generation safety gate
 * on the raw media prompt): that blocks disallowed output at render time;
 * THIS steers the creative planning so the whole series is authored at the
 * right maturity from the start.
 *
 * Skill-first split (see memory `feedback_skill_first_authoring`): this module
 * owns only the compact per-run FACT block injected into each prompt (the tier
 * + its hard content constraints). The fuller authoring craft lives in each
 * stage's skill.md. `renderAudienceAgeRatingBlock` is pure/deterministic —
 * same input, same output; no clock/env/randomness — mirroring
 * `speechProfile.ts`'s `renderVoiceCardBlock`.
 */

export const AUDIENCE_AGE_RATINGS = ["18plus", "13plus", "under13"] as const;

export type AudienceAgeRating = (typeof AUDIENCE_AGE_RATINGS)[number];

/** Least-restrictive tier. Default for every new series unless the creator picks otherwise. */
export const DEFAULT_AUDIENCE_AGE_RATING: AudienceAgeRating = "18plus";

/** Type guard — narrows an untyped `bible.audienceAgeRating` read to the enum. */
export function isAudienceAgeRating(value: unknown): value is AudienceAgeRating {
  return (
    typeof value === "string"
    && (AUDIENCE_AGE_RATINGS as readonly string[]).includes(value)
  );
}

/**
 * Coerce an untyped/absent value (e.g. `bible.audienceAgeRating` on an older
 * series, or a malformed input) to a valid tier, defaulting to the
 * least-restrictive `18plus` — the same "absent → pre-existing default"
 * convention `bible.userPremise`/`locale` reads use.
 */
export function resolveAudienceAgeRating(value: unknown): AudienceAgeRating {
  return isAudienceAgeRating(value) ? value : DEFAULT_AUDIENCE_AGE_RATING;
}

/** Bilingual labels for the wizard `<Select>` (th default UI, en fallback). */
export const AUDIENCE_AGE_RATING_LABELS: Record<
  AudienceAgeRating,
  { th: string; en: string }
> = {
  "18plus": { th: "อายุ 18 ปีขึ้นไป", en: "18 and over" },
  "13plus": { th: "อายุ 13 ปีขึ้นไป", en: "13 and over" },
  under13: { th: "อายุต่ำกว่า 13 ปี", en: "Under 13" },
};

/**
 * Short badge labels for the FINAL RENDER's "age rating badge" overlay
 * (Phase A render-options quick win — burned into a corner of the video via
 * `verticalDramaFinalRenderGraph.ts`'s `age_badge` overlay kind when a render
 * requests `showAgeBadge`). Deliberately terse (unlike the full bilingual
 * `AUDIENCE_AGE_RATING_LABELS` used by the wizard `<Select>`) so the label
 * stays legible at the badge's small burned-in font size.
 */
export const AUDIENCE_AGE_RATING_BADGE_LABEL: Record<AudienceAgeRating, string> = {
  "18plus": "18+",
  "13plus": "13+",
  under13: "ทั่วไป",
};

/**
 * The compact, firm content-constraint block injected into every generation
 * stage's prompt (mirrors `storyBible.ts`'s `userPremiseBlock`). English —
 * consistent with the surrounding English prompt scaffolds; the constraint
 * applies to content generated in ANY output language. Intentionally short:
 * the deeper craft guidance lives in each stage's skill.md.
 */
export function renderAudienceAgeRatingBlock(rating: AudienceAgeRating): string {
  const header =
    "AUDIENCE AGE RATING (HARD CONSTRAINT):\n" +
    "Every story beat, line of dialogue, visual, and situation you generate MUST be appropriate for this target audience. When in doubt, stay safely inside the tier.";
  switch (rating) {
    case "under13":
      return (
        `${header}\n` +
        "Target audience: CHILDREN UNDER 13.\n" +
        "- Wholesome, warm, prosocial. Simple, clear moral lessons and gentle emotional stakes.\n" +
        "- NO romantic or sexual content beyond innocent friendship/family affection. No dating, seduction, jealousy-as-romance, marriage-for-money, or love-triangle plots.\n" +
        "- NO violence, weapons used to threaten, blood/injury, death focus, horror, or genuinely scary/menacing imagery.\n" +
        "- NO profanity, alcohol/drugs/gambling, or crude humor. Conflicts resolve kindly and constructively."
      );
    case "13plus":
      return (
        `${header}\n` +
        "Target audience: TEENS 13 AND OVER.\n" +
        "- Teen-appropriate drama is welcome: emotional romance, rivalry, family conflict, suspense, real stakes.\n" +
        "- Romance stays emotional, NOT sexually explicit (hand-holding/kissing is fine; no sex scenes, no sexualized bodies/wardrobe).\n" +
        "- Peril and conflict are allowed but NOT graphic: no gore, torture, on-screen brutal death, self-harm depiction, or drug/substance glamorization.\n" +
        "- Only mild language. Keep it broadcast-safe for a teen audience."
      );
    case "18plus":
    default:
      return (
        `${header}\n` +
        "Target audience: ADULTS 18 AND OVER.\n" +
        "- Mature, intense drama is allowed: passionate romance, betrayal, morally complex characters, danger, and high-stakes conflict.\n" +
        "- Still respect platform policy: NO sexually explicit/pornographic depiction and NO gratuitous, lingering gore. Intensity serves the story, not shock for its own sake."
      );
  }
}
