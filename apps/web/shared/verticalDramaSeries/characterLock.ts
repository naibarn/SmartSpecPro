/**
 * Vertical Drama Series — two-tier character identity lock + policy-failure
 * detection (spec follow-up, 2026-07-06 prompt-safety upgrade; soften ladder
 * moved to the `vertical-drama-shot-image-action` skill's `soften_level`
 * input per `planning/vertical-drama-skill-first-architecture/plan.md` Phase
 * 1.3 — see that skill's `skill.md` "Soften levels" section for the
 * LLM-authored replacement of the old regex ladder that used to live here).
 *
 * Two independent pieces remain:
 *
 *  1. `VD_CHARACTER_LOCK_INSTRUCTION` — the standardized two-tier identity
 *     lock text (PERSISTENT vs VARIABLE traits), appended wherever a
 *     character reference image is attached to an image-generation call:
 *     character portrait/turnaround/sheet prompts and the storyboard/
 *     start-frame PLANNING LLM calls that instruct a downstream image model
 *     to honor a reference. Pure text constants — no I/O.
 *
 *  2. `isCharacterLockPolicyFailure`/`isCharacterLockPolicyFailureMessage` —
 *     the policy/content/safety-category provider-error matcher the
 *     client/router uses to detect that class of failure from
 *     `media.getTask`'s `errorMessage` (mirrors the existing
 *     `getMediaRetryDelayMsFromError` provider-capacity matcher pattern in
 *     `deferredMediaRetryService.ts` — keyword/regex matching over the raw
 *     error text, no new schema/DB column required). A match is terminal for
 *     the current submission; it is used for explicit user guidance and
 *     audit classification, never as permission for an automatic resubmit.
 *
 * `CHILD_SAFETY_DIRECTIVE_MARKER` is exported so
 * `server/services/verticalDramaShotImageAction.ts` can run the same
 * deterministic post-generation child-safety assertion this module used to
 * run internally as part of the soften ladder — that ONE hard rule is
 * legitimate deterministic policy, not content authorship, and stays in code
 * (see the plan's Phase 1.3 item).
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

/**
 * Age-safety negative-prompt terms for the `child` character-role tier (see
 * `verticalDramaCharacterImageGeneration.ts`'s `ROLE_TIER_NEGATIVE_TERMS`).
 * Exported here (rather than only living in that module) so the soften
 * ladder below can recognize and PROTECT these specific terms — child-safety
 * negatives must survive every soften level, unlike ordinary identity-lock
 * wording, which is allowed to relax under provider content-policy pressure.
 * Kept as the single source of truth; the image-generation module imports
 * this constant instead of redeclaring the term list.
 */
export const VD_CHILD_SAFETY_NEGATIVE_TERMS = [
  "adult beauty styling",
  "glamorous makeup",
  "seductive pose",
  "revealing outfit",
  "mature expression",
  "romantic tension",
  "fashion model look",
  "plastic skin",
] as const;

/** Comma-joined negative-prompt fragment built from `VD_CHILD_SAFETY_NEGATIVE_TERMS`. */
export const VD_CHILD_SAFETY_NEGATIVE_PROMPT_FRAGMENT = VD_CHILD_SAFETY_NEGATIVE_TERMS.join(", ");

/* -------------------------------------------------------------------------- */
/* Soften levels (authoring now belongs to the skill; see file doc comment)   */
/* -------------------------------------------------------------------------- */

/** 0 = full lock (default/first attempt), 1 = softened wording, 2 = minimal lock. */
export const VD_CHARACTER_LOCK_SOFTEN_LEVELS = [0, 1, 2] as const;
export type VerticalDramaCharacterLockSoftenLevel = (typeof VD_CHARACTER_LOCK_SOFTEN_LEVELS)[number];

/**
 * Upper bound for the `softenLevel` client-retry parameter — still enforced
 * here as the single source of truth for the router's Zod input validation
 * bound (`softenLevel: z.number().int().min(0).max(VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL)`),
 * even though the actual softening is now authored by the
 * `vertical-drama-shot-image-action` skill's `soften_level` input rather
 * than the regex ladder that used to live in this file.
 */
export const VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL: VerticalDramaCharacterLockSoftenLevel = 2;

/**
 * True when `prompt` contains the age-appropriateness safety instruction the
 * `child` role tier injects (see `ROLE_TIER_DIRECTIVES.child` in
 * `verticalDramaCharacterImageGeneration.ts`). Matched by a stable, distinctive
 * substring of that directive rather than the whole string, so the guard
 * still fires even if the directive's surrounding wording is later edited.
 *
 * Exported (rather than module-private) so
 * `server/services/verticalDramaShotImageAction.ts` can reuse this exact
 * regex as a deterministic post-generation safety net over the
 * `vertical-drama-shot-image-action` skill's soften-authored output: if this
 * marker matches the INPUT `shot.currentPrompt` but not the skill's returned
 * `prompt`, the service falls back to the original unsoftened prompt rather
 * than trusting a response that silently dropped the child-safety clause.
 * Never duplicate this regex elsewhere — import it from here.
 */
export const CHILD_SAFETY_DIRECTIVE_MARKER = /depicted\s+strictly\s+age-appropriately/i;

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
 * (capacity, network, validation, etc.). Callers use this to classify the
 * terminal failure and show actionable guidance instead of a generic toast;
 * this matcher must not trigger an automatic resubmission.
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
