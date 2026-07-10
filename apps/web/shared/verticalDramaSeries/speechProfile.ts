/**
 * Vertical Drama Series — character speech-profile schema + voice-card
 * renderer (spec `specs/feature/132-vertical-drama-story-character-quality-engine/spec.md`
 * §7.3; plan `sections/section-05-dialogue-rules-and-speech-profiles.md`).
 *
 * Feature flag: F132F `verticalDramaCharacterProfiles`.
 *
 * Pure field-only TypeScript + zod, NO server/db imports — same convention as
 * `voiceCasting.ts`'s own doc comment documents for itself — so both the
 * client (wizard preview, character stock panel editor) and the server
 * (script generation prompt building, dialogue-audio delivery-hint mapping,
 * the characters router) can import this directly.
 *
 * Ownership note (post-review-round-1, Finding 1): this module owns ONLY the
 * `speechProfile` shape — it deliberately does NOT define `personality`
 * (that schema belongs to Section 08's `characterProfile.ts`, which also owns
 * the composed typed-data object `personality`/`speechProfile`/`visualBible`/
 * `consistencyLedger` sit inside, and the sole rewrite of
 * `extractCharacterDescription`). `renderVoiceCardBlock` below is the pure
 * rendering function Section 08's rewrite calls directly to produce the
 * "Voice:" block — this module owns the block's CONTENT, Section 08 owns
 * WHERE it is spliced into the full character description string.
 *
 * Persistence: `speechProfile` lives inside the existing
 * `vertical_drama_characters.data` jsonb column (key `speechProfile`) — no
 * migration, no new table/column (Database Safety Protocol "Low risk" tier).
 */

import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Schema (spec §7.3)                                                         */
/* -------------------------------------------------------------------------- */

export const VD_SPEECH_PROFILE_SPEAKING_SPEEDS = [
  "slow",
  "measured",
  "normal",
  "fast",
  "rapid_fire",
] as const;

export const VD_SPEECH_PROFILE_VOCABULARY_LEVELS = [
  "simple",
  "everyday",
  "educated",
  "formal",
  "archaic_or_stylized",
] as const;

export const VD_SPEECH_PROFILE_SENTENCE_LENGTHS = [
  "very_short",
  "short",
  "medium",
  "long",
] as const;

export const VD_SPEECH_PROFILE_METAPHOR_USAGE = [
  "none",
  "occasional",
  "frequent",
  "constant",
] as const;

/**
 * A character's structured speech profile (spec §7.3). Tolerant zod schema
 * (`.passthrough()`) so a stored record with extra/future fields round-trips
 * without a validation failure — same tolerant-parse convention as
 * `voiceCasting.ts`'s `verticalDramaCharacterVoiceConfigSchema`.
 *
 * Only `speakingSpeed`/`vocabularyLevel`/`emotionalDefault`/
 * `typicalSentenceLength`/`metaphorUsage`/`commonLineFunction` are required —
 * `forbiddenStyle`/`signaturePhrases` are optional arrays (a freshly-generated
 * profile may not have either populated yet, and a legacy/minimal profile
 * should still validate).
 */
export const speechProfileSchema = z
  .object({
    /** How fast this character tends to speak (delivery pacing). */
    speakingSpeed: z.enum(VD_SPEECH_PROFILE_SPEAKING_SPEEDS),
    /** The register/complexity of words this character reaches for. */
    vocabularyLevel: z.enum(VD_SPEECH_PROFILE_VOCABULARY_LEVELS),
    /** Free-form default emotional coloring for this character's lines (e.g. "guarded warmth", "brittle sarcasm"). */
    emotionalDefault: z.string().trim().min(1).max(200),
    /** How long this character's sentences typically run. */
    typicalSentenceLength: z.enum(VD_SPEECH_PROFILE_SENTENCE_LENGTHS),
    /** How often this character reaches for metaphor/figurative language. */
    metaphorUsage: z.enum(VD_SPEECH_PROFILE_METAPHOR_USAGE),
    /** Free-form description of what this character's lines are usually FOR (e.g. "deflects with humor", "interrogates directly", "soothes then pivots to the ask"). */
    commonLineFunction: z.string().trim().min(1).max(200),
    /** Word/phrase/register choices this character must NEVER use (e.g. "never uses slang", "never swears", "never uses written-essay connectives"). */
    forbiddenStyle: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
    /** Recurring verbal tics/catchphrases unique to this character. */
    signaturePhrases: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  })
  .passthrough();

export type VerticalDramaSpeechProfile = z.infer<typeof speechProfileSchema>;

/* -------------------------------------------------------------------------- */
/* Voice-card rendering (consumed by Section 08's `extractCharacterDescription`) */
/* -------------------------------------------------------------------------- */

const SPEAKING_SPEED_LABEL: Record<(typeof VD_SPEECH_PROFILE_SPEAKING_SPEEDS)[number], string> = {
  slow: "slow",
  measured: "measured",
  normal: "normal",
  fast: "fast",
  rapid_fire: "rapid-fire",
};

const VOCABULARY_LEVEL_LABEL: Record<
  (typeof VD_SPEECH_PROFILE_VOCABULARY_LEVELS)[number],
  string
> = {
  simple: "simple",
  everyday: "everyday",
  educated: "educated",
  formal: "formal",
  archaic_or_stylized: "archaic/stylized",
};

const SENTENCE_LENGTH_LABEL: Record<(typeof VD_SPEECH_PROFILE_SENTENCE_LENGTHS)[number], string> =
  {
    very_short: "very short",
    short: "short",
    medium: "medium",
    long: "long",
  };

const METAPHOR_USAGE_LABEL: Record<(typeof VD_SPEECH_PROFILE_METAPHOR_USAGE)[number], string> = {
  none: "none",
  occasional: "occasional",
  frequent: "frequent",
  constant: "constant",
};

/**
 * Pure function producing the "Voice:" block text for a character's speech
 * profile — deterministic and stable for a given profile (no randomness, no
 * clock/env dependence). Section 08's `extractCharacterDescription` rewrite
 * calls this directly to render the block; this module owns the block's
 * CONTENT only (line order, wording, which optional fields are omitted when
 * absent), never where it is spliced into the full character description.
 *
 * Omits the "Forbidden style"/"Signature phrases" lines entirely when the
 * corresponding array is absent or empty — never renders an empty
 * "Signature phrases:" line with nothing after it.
 */
export function renderVoiceCardBlock(profile: VerticalDramaSpeechProfile): string {
  const lines: string[] = [
    "Voice:",
    `- Speaking speed: ${SPEAKING_SPEED_LABEL[profile.speakingSpeed] ?? profile.speakingSpeed}`,
    `- Vocabulary level: ${VOCABULARY_LEVEL_LABEL[profile.vocabularyLevel] ?? profile.vocabularyLevel}`,
    `- Typical sentence length: ${SENTENCE_LENGTH_LABEL[profile.typicalSentenceLength] ?? profile.typicalSentenceLength}`,
    `- Metaphor usage: ${METAPHOR_USAGE_LABEL[profile.metaphorUsage] ?? profile.metaphorUsage}`,
    `- Emotional default: ${profile.emotionalDefault}`,
    `- Common line function: ${profile.commonLineFunction}`,
  ];
  if (profile.forbiddenStyle && profile.forbiddenStyle.length > 0) {
    lines.push(`- Forbidden style: ${profile.forbiddenStyle.join("; ")}`);
  }
  if (profile.signaturePhrases && profile.signaturePhrases.length > 0) {
    lines.push(`- Signature phrases: ${profile.signaturePhrases.join("; ")}`);
  }
  return lines.join("\n");
}
