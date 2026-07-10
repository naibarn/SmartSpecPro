/**
 * Vertical Drama Series — spoken-register connective blocklist (spec §7.1
 * "Spoken register"; plan
 * `sections/section-05-dialogue-rules-and-speech-profiles.md`).
 *
 * Deliberately separate from `dialogueQuality.ts` (which handles the
 * literal-speakability HARD RULE — quotes/parentheses/symbols/em-dash/
 * ellipsis/emoji/nonverbal lines) — register is a STYLE concern (does this
 * line SOUND like natural spoken Thai, or like a written essay?), not a
 * literal-speakability concern. Kept standalone so it can be imported by
 * both this section's own deterministic checks and Section 06's Dialogue
 * Pass `unnatural_dialogue_language` deterministic assist, without either
 * consumer pulling in the other module's unrelated surface.
 *
 * Pure TS, no server/db imports — safe for both client and server use.
 */

import type { VerticalDramaSeriesLocale } from "./contracts";

/**
 * Thai written-register connectives that read as translated/essay Thai when
 * spoken casually — spec §7.1's explicit examples (อย่างไรก็ตาม, ดังนั้น,
 * เนื่องจาก) plus closely related formal connectives from the same register.
 * Order matters only for match-reporting order, not correctness.
 */
export const VD_DIALOGUE_WRITTEN_REGISTER_CONNECTIVES_TH: readonly string[] = [
  "อย่างไรก็ตาม",
  "ดังนั้น",
  "เนื่องจาก",
  "ฉะนั้น",
  "กล่าวคือ",
  "ทั้งนี้",
  "อีกทั้ง",
  "โดยสรุป",
  "กล่าวโดยสรุป",
  "ในขณะเดียวกัน",
];

/**
 * English placeholder list for non-Thai locales — the equivalent class of
 * formal/written connective that reads as an essay, not natural spoken
 * dialogue. Deliberately small; English speakability rules are governed
 * primarily by `dialogueQuality.ts`'s existing analyzer, this list only
 * covers the register-specific connective class.
 */
export const VD_DIALOGUE_WRITTEN_REGISTER_CONNECTIVES_EN: readonly string[] = [
  "however",
  "therefore",
  "furthermore",
  "moreover",
  "consequently",
  "in conclusion",
  "nevertheless",
];

function connectivesForLocale(locale: VerticalDramaSeriesLocale): readonly string[] {
  return locale === "th"
    ? VD_DIALOGUE_WRITTEN_REGISTER_CONNECTIVES_TH
    : VD_DIALOGUE_WRITTEN_REGISTER_CONNECTIVES_EN;
}

/**
 * Returns every written-register connective found in `line` for the given
 * locale — an empty array means the line is clean. Pure substring match
 * (case-insensitive for the English list; Thai has no case) — a proper-noun
 * false positive (e.g. a character name that happens to CONTAIN a blocklist
 * substring) is a documented known limitation of this deterministic
 * heuristic, not a bug this function tries to fully eliminate (see this
 * module's test file for the documented case).
 */
export function detectWrittenRegisterConnectives(
  line: string,
  locale: VerticalDramaSeriesLocale,
): string[] {
  if (!line) return [];
  const connectives = connectivesForLocale(locale);
  const haystack = locale === "th" ? line : line.toLowerCase();
  const found: string[] = [];
  for (const term of connectives) {
    const needle = locale === "th" ? term : term.toLowerCase();
    if (haystack.includes(needle)) found.push(term);
  }
  return found;
}
