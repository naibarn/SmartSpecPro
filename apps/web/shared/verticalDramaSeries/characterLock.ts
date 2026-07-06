/**
 * Vertical Drama Series — two-tier character identity lock + policy-failure
 * auto-soften ladder (spec follow-up, 2026-07-06 prompt-safety upgrade).
 *
 * Two independent, composable pieces:
 *
 *  1. `VD_CHARACTER_LOCK_INSTRUCTION` — the standardized two-tier identity
 *     lock text (PERSISTENT vs VARIABLE traits), appended wherever a
 *     character reference image is attached to an image-generation call:
 *     character portrait/turnaround/sheet prompts, the start-frame
 *     single/3x3-grid/repair prompt paths, and the storyboard/start-frame
 *     PLANNING LLM calls that instruct a downstream image model to honor a
 *     reference. Pure text constants — no I/O.
 *
 *  2. `softenCharacterLockPrompt` — a rule-based (NO extra LLM call, NO model
 *     switching) prompt softening ladder invoked when a generation task fails
 *     with a policy/content/safety-category provider error. `isPolicyFailure`
 *     is the matcher the client/router uses to detect that class of failure
 *     from `media.getTask`'s `errorMessage` (mirrors the existing
 *     `getMediaRetryDelayMsFromError` provider-capacity matcher pattern in
 *     `deferredMediaRetryService.ts` — keyword/regex matching over the raw
 *     error text, no new schema/DB column required).
 *
 * Pure module — importable from both client and server (no db/server
 * imports), same convention as `targetAudienceRegion.ts`.
 */

/* -------------------------------------------------------------------------- */
/* Two-tier character identity lock                                          */
/* -------------------------------------------------------------------------- */

/**
 * Standardized two-tier identity-lock instruction block. PERSISTENT traits
 * must match the attached reference image(s) exactly; VARIABLE traits are
 * free to follow whatever the shot/pose/prompt calls for. Splitting the
 * instruction this way (rather than a single blanket "identical" directive)
 * both (a) reads more naturally to image models and (b) is what the soften
 * ladder progressively relaxes level-by-level when a provider's content
 * policy rejects the stronger wording.
 */
export const VD_CHARACTER_LOCK_INSTRUCTION =
  "CHARACTER IDENTITY LOCK — two-tier (MANDATORY):\n" +
  "PERSISTENT (must match the attached reference image exactly, never altered): " +
  "face and facial features, body proportions, skin tone, hair color and style, eye color, " +
  "clothing and accessories, and overall personality/presence.\n" +
  "VARIABLE (free to change to match this shot): pose, emotion/facial expression, camera angle, " +
  "scene/background, and action.";

/** Negative-prompt terms enforcing the character lock's PERSISTENT tier. */
export const VD_CHARACTER_LOCK_NEGATIVE_TERMS = [
  "identity drift",
  "different face",
  "wrong skin tone",
  "changed hair color",
  "changed eye color",
  "inconsistent wardrobe",
] as const;

/** Comma-joined negative-prompt fragment built from `VD_CHARACTER_LOCK_NEGATIVE_TERMS`. */
export const VD_CHARACTER_LOCK_NEGATIVE_PROMPT_FRAGMENT = VD_CHARACTER_LOCK_NEGATIVE_TERMS.join(", ");

/* -------------------------------------------------------------------------- */
/* Soften ladder (rule-based, no LLM cost, no model switching)                */
/* -------------------------------------------------------------------------- */

/** 0 = full lock (default/first attempt), 1 = softened wording, 2 = minimal lock. */
export const VD_CHARACTER_LOCK_SOFTEN_LEVELS = [0, 1, 2] as const;
export type VerticalDramaCharacterLockSoftenLevel = (typeof VD_CHARACTER_LOCK_SOFTEN_LEVELS)[number];

export const VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL: VerticalDramaCharacterLockSoftenLevel = 2;

/**
 * Level-1 soften: replace hard/absolute lock verbs with softer paraphrases,
 * and drop skin-tone/ethnicity-emphasis wording plus "flawless"-type
 * perfection words some providers' content-policy classifiers flag. Order
 * matters — longer/more specific patterns are matched before their shorter
 * substrings so e.g. "exactly identical" is replaced as a whole, not left
 * with a dangling "exactly".
 */
const LEVEL_1_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bexactly identical\b/gi, "closely resembling the reference"],
  [/\bidentical\b/gi, "closely resembling the reference"],
  [/\bmust match the attached reference image exactly\b/gi, "should closely resemble the attached reference image"],
  [/\bmust appear EXACTLY as-is\b/gi, "should closely resemble the reference"],
  [/\bEXACTLY\b/g, "closely"],
  [/\bexactly\b/gi, "closely"],
  [/\bnever altered\b/gi, "kept consistent where possible"],
  [/\bflawless\b/gi, "clean"],
  [/\bperfect(ly)?\b/gi, "natural"],
  [/\bskin tone,?\s*/gi, ""],
  [/,?\s*skin tone\b/gi, ""],
];

/**
 * Level-2 soften: everything level-1 does, PLUS collapse the whole
 * PERSISTENT/VARIABLE block down to one minimal recognizability instruction
 * and strip every remaining risky descriptor (ethnicity/ethnic, race,
 * skin/complexion words) that a stricter content-policy classifier may still
 * flag even after level-1's softening.
 */
const LEVEL_2_STRIP_PATTERNS: RegExp[] = [
  /\b(ethnicity|ethnic|race|racial)\b/gi,
  /\b(skin|complexion)\b/gi,
];

/** Level-2 replacement text for the full two-tier lock block specifically. */
const VD_CHARACTER_LOCK_MINIMAL_INSTRUCTION =
  "CHARACTER IDENTITY (minimal lock): maintain the same person's recognizable appearance from " +
  "the reference images — pose, expression, camera angle, and scene are free to change.";

function applyLevel1(prompt: string): string {
  let result = prompt;
  for (const [pattern, replacement] of LEVEL_1_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result.replace(/\s{2,}/g, " ").trim();
}

function applyLevel2(prompt: string): string {
  // Collapse the full two-tier lock block (if present verbatim) down to the
  // minimal instruction first, then run level-1 replacements (in case the
  // caller's prompt embeds the lock text inline rather than as a a separate
  // block), then strip any remaining risky descriptors.
  let result = prompt.includes(VD_CHARACTER_LOCK_INSTRUCTION)
    ? prompt.replace(VD_CHARACTER_LOCK_INSTRUCTION, VD_CHARACTER_LOCK_MINIMAL_INSTRUCTION)
    : prompt;
  result = applyLevel1(result);
  for (const pattern of LEVEL_2_STRIP_PATTERNS) {
    result = result.replace(pattern, "");
  }
  return result.replace(/\s{2,}/g, " ").replace(/\s+([,.])/g, "$1").trim();
}

/**
 * Apply the rule-based soften ladder to an outgoing prompt string. Pure,
 * deterministic, no I/O — safe to call on both the main prompt and the
 * negative prompt. `level` is clamped to `[0, VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL]`;
 * `0` is a no-op (returns the input unchanged).
 */
export function softenCharacterLockPrompt(
  prompt: string,
  level: number,
): string {
  const clamped = Math.max(0, Math.min(VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL, Math.trunc(level)));
  if (clamped <= 0) return prompt;
  if (clamped === 1) return applyLevel1(prompt);
  return applyLevel2(prompt);
}

/** Same ladder, for the negative-prompt string (level 2 drops the character-lock negative terms entirely — a shorter negative prompt is less likely to itself trip a policy classifier). */
export function softenCharacterLockNegativePrompt(
  negativePrompt: string | undefined,
  level: number,
): string | undefined {
  if (!negativePrompt) return negativePrompt;
  const clamped = Math.max(0, Math.min(VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL, Math.trunc(level)));
  if (clamped <= 0) return negativePrompt;
  if (clamped === 2) {
    // Strip the character-lock negative terms specifically; keep any other
    // negative-prompt content (e.g. product-lock terms) intact.
    const terms = VD_CHARACTER_LOCK_NEGATIVE_TERMS.map((t) => t.toLowerCase());
    return negativePrompt
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && !terms.includes(part.toLowerCase()))
      .join(", ");
  }
  return applyLevel1(negativePrompt);
}

/* -------------------------------------------------------------------------- */
/* Policy-failure matcher                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Keyword/phrase matcher for policy/content/safety-category provider
 * failures — same "extract every string from the error, join, match against
 * a keyword regex" approach as `getMediaRetryDelayMsFromError` in
 * `deferredMediaRetryService.ts` (that module handles provider-CAPACITY
 * errors; this one handles provider-POLICY errors — deliberately separate
 * concerns, never conflated). Matches on: policy, content, safety, blocked,
 * rejected, sensitive, guideline, moderation, flagged — the terms observed in
 * real provider rejection strings across the codebase's audit logs and
 * adapters. Case-insensitive; word-boundary where useful to avoid false
 * positives (e.g. "guideline" but not matching inside an unrelated word).
 */
const POLICY_FAILURE_PATTERN =
  /\b(content[ _-]?polic(y|ies)|safety[ _-]?(filter|violation|category)|moderat(ed|ion)|flagged|blocked[ _-]?(reason|content)?|rejected[ _-]?(by|content)?|sensitive[ _-]?content|guideline[s]?|policy[ _-]?violation|violat(es|ion)[ _-]?(our|the)?[ _-]?(content[ _-])?polic(y|ies)|unsafe[ _-]?content|not[ _-]?allowed|prohibited[ _-]?content)\b/i;

function extractErrorStrings(error: unknown, out: string[], depth = 0): void {
  if (depth > 6 || error == null) return;
  if (typeof error === "string") {
    out.push(error);
    return;
  }
  if (error instanceof Error) {
    out.push(error.message);
    return;
  }
  if (Array.isArray(error)) {
    error.forEach((item) => extractErrorStrings(item, out, depth + 1));
    return;
  }
  if (typeof error === "object") {
    Object.values(error as Record<string, unknown>).forEach((item) =>
      extractErrorStrings(item, out, depth + 1),
    );
  }
}

/**
 * True when `error` (a `Error`, raw string, or a `media.getTask`-shaped
 * object with an `errorMessage`/`resultData`/similar field) looks like a
 * provider content-policy/safety rejection rather than some other failure
 * (capacity, network, validation, etc.). Callers (client poll handlers and
 * router mutations) use this to decide whether to automatically resubmit
 * with a higher `softenLevel` instead of surfacing a generic failure toast.
 */
export function isCharacterLockPolicyFailure(error: unknown): boolean {
  const messages: string[] = [];
  extractErrorStrings(error, messages);
  const text = messages.join(" \n ").trim();
  if (!text) return false;
  return POLICY_FAILURE_PATTERN.test(text);
}

/** Convenience overload for the common `{ errorMessage?: string }` task shape returned by `media.getTask`. */
export function isCharacterLockPolicyFailureMessage(errorMessage: string | null | undefined): boolean {
  if (!errorMessage) return false;
  return POLICY_FAILURE_PATTERN.test(errorMessage);
}
