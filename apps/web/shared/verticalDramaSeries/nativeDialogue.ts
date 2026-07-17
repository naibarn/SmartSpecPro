/**
 * Vertical Drama Series — canonical native-audio dialogue block (lip-sync
 * discipline fix).
 *
 * Bug this fixes: the final provider prompt for native-lip-sync video models
 * (Veo 3.1) embedded spoken lines with NO speaker attribution and NO
 * lip-sync discipline — e.g. `Native dialogue (verbatim): "a" / "b" / "c"`.
 * With 2+ characters on screen, the video model has no explicit signal for
 * WHICH character's mouth should move on WHICH line, so it commonly
 * animates the wrong (or both) character's lips, or keeps moving a
 * listener's mouth after their line ends. This module builds a
 * deterministic, TS-authored block that (a) states the always-on rules
 * (verbatim/no-invented-lines, lip movement timed to the line, no lip
 * movement during camera transitions, no narration/subtitles/background
 * voices) and (b) — when 2+ distinct speakers are involved — adds the
 * explicit SILENT LISTENER discipline (only the named speaker's lips move;
 * every other established character keeps their mouth closed; never two
 * characters speaking/lip-moving at once; one clearly visible speaking face
 * per line), then attributes every line to its speaker by DISPLAY NAME
 * (falling back to `characterKey` when no display name was resolved by the
 * caller — this module never resolves names itself, see
 * `NativeDialogueVerbatimLine.speakerName`'s own doc comment).
 *
 * Pure module — no server/db imports, importable from both client and
 * server. Used by BOTH render paths that embed dialogue into a native-audio
 * provider prompt:
 *  - `verticalDramaVideoPromptFormatter.ts`'s `formatVideoClipRequest`
 *    (render-time formatter)
 *  - `verticalDramaVideoMotionPromptGeneration.ts`'s
 *    `appendMissingDialogueVerbatim` (LLM-authored prompt's deterministic
 *    compliance fallback)
 * and by the router (`verticalDramaEpisodes.ts`) wherever it needs to
 * compute the exact same block text as a `protectedFragments` entry for
 * `ensurePromptWithinLimit` (the QC/length-cap refiner) — that string MUST
 * stay byte-identical to whatever was actually embedded in the prompt, or
 * the refiner will treat it as "missing" and re-append a second copy.
 */

/** One dialogue line as this module needs it — a subset of the various
 *  `VerticalDramaClipDialogueLine`/`ShotDialogueLine` shapes used across the
 *  codebase (structural typing, so any of them satisfies this). */
export interface NativeDialogueVerbatimLine {
  /** The spoken line, verbatim — never translated/paraphrased here. */
  lineTh: string;
  /** Opaque speaker identifier (e.g. `"character-8"`) — used as the per-line attribution fallback when `speakerName` is absent. */
  characterKey?: string;
  /**
   * The speaker's DISPLAY name (e.g. `"กล้า"`), when the caller has already
   * resolved it from the series' character roster. This module never
   * queries a roster itself (pure, no DB access) — callers resolve
   * `characterKey -> name` from whatever roster/identity map is already in
   * scope (mirroring the established `name || characterKey` fallback
   * pattern used elsewhere in this codebase) and set it here. Falls back to
   * `characterKey`, then to no attribution at all, when absent.
   */
  speakerName?: string;
}

export interface BuildNativeDialogueVerbatimBlockOptions {
  /**
   * English display name of the spoken language, e.g. `"Thai"` (default) or
   * `"English"` — stated in the rules header so the provider never has to
   * infer the spoken language from the transcript alone. Defaults to
   * `"Thai"` when omitted, preserving this module's original Thai-only
   * assumption for callers that don't pass a language plan.
   */
  dialogueLanguageName?: string;
  /**
   * Count of established/on-screen characters in this shot, when the caller
   * has that signal available (e.g. a resolved character-reference-image
   * count). Combined with the DISTINCT-SPEAKER count derived from
   * `dialogueLines` itself to decide whether the silent-listener/
   * never-both-at-once/one-speaking-face clauses belong in the header — a
   * shot with only one speaking line but a second silent established
   * character on screen still needs those clauses; a genuinely solo shot
   * does not. Defaults to `0` (rely on the dialogue-derived speaker count
   * alone) when the caller has no such signal in scope — never worth a new
   * DB query just for this.
   */
  establishedCharacterCount?: number;
}

/**
 * Stable marker substring at the very start of every block this function
 * returns — callers that need to locate/strip a previously-embedded block
 * (e.g. `appendMissingDialogueVerbatim`'s "find and replace" convention)
 * search for this exact string. Keep it a single stable prefix; if the
 * block's opening text ever changes, update this constant in the SAME
 * change so every coupled call site keeps finding it.
 */
export const NATIVE_DIALOGUE_BLOCK_MARKER = "Native dialogue (verbatim)";

/** Build the canonical ordered native-audio dialogue block: a lip-sync
 *  rules header (always present whenever there's dialogue) followed by
 *  each line attributed to its speaker, e.g.:
 *
 *  ```
 *  Native dialogue (verbatim) — LIP-SYNC RULES: every line is spoken
 *  naturally in Thai, verbatim — never transfer, reorder, paraphrase, or
 *  invent lines. Only the named speaker per line may move their lips;
 *  every other established character is a SILENT LISTENER with mouth
 *  fully closed — never two characters speaking or lip-moving at once,
 *  one visible speaking face per line. Lips move only during that
 *  speaker's own line, never during a camera transition. No narration,
 *  subtitles, captions, or background voices.
 *  กล้า: "ถือขนมไปไหน"
 *  หนูนา: "จะเอาไปให้ยาย"
 *  ```
 *
 *  Returns `""` when there are no non-empty lines (callers should omit the
 *  block entirely in that case, exactly as before this fix). */
export function buildNativeDialogueVerbatimBlock(
  dialogueLines: readonly NativeDialogueVerbatimLine[],
  options: BuildNativeDialogueVerbatimBlockOptions = {},
): string {
  const orderedLines = dialogueLines
    .map(line => ({
      lineTh: line.lineTh.trim(),
      speaker: (line.speakerName ?? line.characterKey ?? "").trim(),
    }))
    .filter(line => line.lineTh.length > 0);
  if (orderedLines.length === 0) return "";

  const languageName = options.dialogueLanguageName?.trim() || "Thai";
  const distinctSpeakers = new Set(orderedLines.map(l => l.speaker).filter(Boolean));
  const multiSpeaker =
    distinctSpeakers.size >= 2 || (options.establishedCharacterCount ?? 0) >= 2;

  const rules = [
    `${NATIVE_DIALOGUE_BLOCK_MARKER} — LIP-SYNC RULES: every line is spoken naturally in ${languageName}, verbatim — never transfer, reorder, paraphrase, or invent lines.`,
    multiSpeaker
      ? "Only the named speaker per line may move their lips; every other established character is a SILENT LISTENER with mouth fully closed — never two characters speaking or lip-moving at once, one visible speaking face per line."
      : null,
    "Lips move only during that speaker's own line, never during a camera transition.",
    "No narration, subtitles, captions, or background voices.",
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");

  const lines = orderedLines.map(({ lineTh, speaker }) =>
    speaker ? `${speaker}: "${lineTh}"` : `"${lineTh}"`,
  );

  return [rules, ...lines].join("\n");
}
