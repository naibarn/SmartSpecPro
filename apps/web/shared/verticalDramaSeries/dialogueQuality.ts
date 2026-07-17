/**
 * Deterministic dialogue pacing/quality heuristics for Vertical Drama.
 *
 * This is intentionally provider-free and cheap: it catches obvious "this
 * 8-second clip has 1 second of speech" / stage-direction / duplicate-dialogue
 * failures before the user spends video credits.
 */

export type VerticalDramaDialogueQualityIssueCode =
  | "VD_DIALOGUE_EMPTY"
  | "VD_DIALOGUE_STAGE_DIRECTION"
  | "VD_DIALOGUE_SCRIPT_FALLBACK"
  | "VD_DIALOGUE_UNDERFILLED"
  | "VD_DIALOGUE_EPISODE_UNDERFILLED"
  | "VD_DIALOGUE_DUPLICATE"
  /** Added 2026-07-08, spec §14.1 rule 6b (owner feedback with live episode-11
   *  evidence) — at least one resolved line in this clip fails
   *  `analyzeVerticalDramaLineSpeakability` (wrapping quotes, parenthetical
   *  stage direction, unspeakable symbols/markup, em-dash-as-spoken-beat,
   *  uncapped ellipsis runs, emoji, or a bare nonverbal sound written as a
   *  dialogue line). Always `severity: "error"` — this is a hard rule, not a
   *  pacing heuristic, so it is unconditional on clip duration (unlike
   *  `VD_DIALOGUE_UNDERFILLED`). */
  | "VD_DIALOGUE_UNSPEAKABLE_SYMBOLS";

export type VerticalDramaDialogueQualitySeverity = "info" | "warning" | "error";

export type VerticalDramaDialogueQualityIssue = {
  code: VerticalDramaDialogueQualityIssueCode;
  severity: VerticalDramaDialogueQualitySeverity;
  message: string;
  shotNumber?: number;
  clipNumber?: number;
  estimatedSpeechSeconds?: number;
  targetSpeechSeconds?: number;
  coverageRatio?: number;
};

export type VerticalDramaDialogueQualityLine = {
  lineTh?: string;
  origin?: "script_fallback";
  /** Additive (2026-07-08, spec §14.1 rule 6b) — the speaking character's
   *  label, when the caller has it on hand. Optional/omitted preserves every
   *  pre-existing caller's exact behavior (`analyzeVerticalDramaLineSpeakability`
   *  simply evaluates the line text alone with no speaker to clean); wired
   *  through by callers that resolve dialogue with a known speaker (e.g. the
   *  Production Wizard's per-shot completeness summary). */
  speaker?: string;
};

export type VerticalDramaDialogueClipQualityInput = {
  shotNumber?: number;
  clipNumber?: number;
  durationSeconds: number;
  dialogue?: VerticalDramaDialogueQualityLine[];
};

export type VerticalDramaDialogueClipQuality = {
  shotNumber?: number;
  clipNumber?: number;
  durationSeconds: number;
  estimatedSpeechSeconds: number;
  targetSpeechSeconds: number;
  coverageRatio: number;
  issues: VerticalDramaDialogueQualityIssue[];
};

export type VerticalDramaEpisodeDialogueQuality = {
  totalDurationSeconds: number;
  totalSpeechSeconds: number;
  targetSpeechSeconds: number;
  coverageRatio: number;
  clips: VerticalDramaDialogueClipQuality[];
  issues: VerticalDramaDialogueQualityIssue[];
};

const THAI_CHAR_PATTERN = /[\u0E00-\u0E7F]/g;
const WORD_PATTERN = /[A-Za-z0-9]+|[\u0E00-\u0E7F]/g;
const STAGE_DIRECTION_PATTERN =
  /^(?:เสียง(?=$|[\s:.…])|sfx\b|sound effect\b|\(sfx\)|\[[^\]]+\]|\([^)]+\))[\s:.…]*/i;

const MIN_DIALOGUE_SECONDS_PER_LINE = 0.75;
// Vertical-drama delivery is intentionally fast-paced: shots are short (≤10s)
// and characters speak quickly, so the canonical speech-rate models a brisk
// native Thai delivery. THAI_CHAR_PATTERN counts orthographic code points
// (consonants + combining vowels/tone marks), ~2.5–3 per syllable, so
// 17 chars/s ≈ 5.7 syllables/s — a realistic fast conversational rate.
// (Raised from 8.5, which modelled a slow/deliberate ~3 syl/s and estimated
// roughly 2× too long for actual vertical-drama pacing.) This is the ONE
// canonical rate — do not restate it elsewhere.
const THAI_CHARS_PER_SECOND = 17;
const NON_THAI_WORDS_PER_SECOND = 2.7;
// Exported (2026-07-07, spec §7.7.1/§7.7.2): these coverage-ratio constants
// are consumed by shared/verticalDramaSeries/contentBudget.ts for per-shot and
// default-episode budget derivation, plus the script-gen / density-meter gates.
//
// Rescaled 2026-07-15 (×0.5) together with THAI_CHARS_PER_SECOND (8.5→17).
// coverageRatio = estimatedSpeechSeconds / durationSeconds, and every gate
// compares an estimate against `ratio × duration`. Doubling the speech rate
// halves every estimate, so halving each ratio keeps every gate decision and
// every per-shot/episode speech budget MATHEMATICALLY IDENTICAL — only the
// displayed second-counts get realistic. This preserves current script-density
// behavior (the owner's explicit intent: fix the shown number, not the gates).
// spec §7.7 still requires this to be the ONE canonical speech-budget module.
export const MIN_CLIP_COVERAGE_RATIO = 0.225;
const ERROR_CLIP_COVERAGE_RATIO = 0.125;
const TARGET_CLIP_COVERAGE_RATIO = 0.34;
export const MIN_EPISODE_COVERAGE_RATIO = 0.29;
// Consumed directly by `verticalDramaScriptGeneration.ts`'s coverage gate.
// Rescaled ×0.5 for the same rate-change reason as the ratios above.
export const ERROR_EPISODE_COVERAGE_RATIO = 0.165;

export function estimateVerticalDramaSpeechSeconds(text: string): number {
  const normalized = text.replace(/[“”"']/g, "").replace(/\s+/g, " ").trim();
  if (!normalized) return 0;

  const thaiChars = normalized.match(THAI_CHAR_PATTERN)?.length ?? 0;
  if (thaiChars > 0) {
    return Math.max(MIN_DIALOGUE_SECONDS_PER_LINE, thaiChars / THAI_CHARS_PER_SECOND);
  }

  const words = normalized.match(WORD_PATTERN)?.length ?? 0;
  return Math.max(MIN_DIALOGUE_SECONDS_PER_LINE, words / NON_THAI_WORDS_PER_SECOND);
}

export function estimateVerticalDramaDialogueSeconds(
  dialogue: VerticalDramaDialogueQualityLine[] | undefined,
): number {
  return (dialogue ?? []).reduce(
    (sum, line) => sum + estimateVerticalDramaSpeechSeconds(line.lineTh ?? ""),
    0,
  );
}

export function targetVerticalDramaSpeechSeconds(durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  // Floor rescaled 2.5→1.25 (×0.5) alongside THAI_CHARS_PER_SECOND (8.5→17) so
  // the target stays in step with the halved estimate — see the coverage-ratio
  // block above. The `duration - 0.75` cap is a real-time bound (always leave
  // ≥0.75s of non-speech) and stays unscaled.
  return Math.min(Math.max(durationSeconds * TARGET_CLIP_COVERAGE_RATIO, 1.25), durationSeconds - 0.75);
}

export function hasVerticalDramaStageDirectionDialogue(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  if (STAGE_DIRECTION_PATTERN.test(normalized)) return true;
  const withoutPunctuation = normalized.replace(/[.…\s"'`]+/g, "");
  return withoutPunctuation.length > 0 && withoutPunctuation.length < 4;
}

export function verticalDramaDialogueSignature(
  dialogue: VerticalDramaDialogueQualityLine[] | undefined,
): string {
  return (dialogue ?? [])
    .map((line) =>
      (line.lineTh ?? "")
        .replace(/[“”"''`]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean)
    .join("\n");
}

export function analyzeVerticalDramaClipDialogueQuality(
  input: VerticalDramaDialogueClipQualityInput,
): VerticalDramaDialogueClipQuality {
  const durationSeconds = Math.max(0, input.durationSeconds);
  const estimatedSpeechSeconds = estimateVerticalDramaDialogueSeconds(input.dialogue);
  const targetSpeechSeconds = targetVerticalDramaSpeechSeconds(durationSeconds);
  const coverageRatio = durationSeconds > 0 ? estimatedSpeechSeconds / durationSeconds : 0;
  const issues: VerticalDramaDialogueQualityIssue[] = [];
  const dialogue = input.dialogue ?? [];
  const base = {
    shotNumber: input.shotNumber,
    clipNumber: input.clipNumber,
    estimatedSpeechSeconds,
    targetSpeechSeconds,
    coverageRatio,
  };

  if (dialogue.length === 0) {
    issues.push({
      ...base,
      code: "VD_DIALOGUE_EMPTY",
      severity: durationSeconds >= 6 ? "warning" : "info",
      message: "No dialogue is attached to this clip.",
    });
  }

  if (dialogue.some((line) => hasVerticalDramaStageDirectionDialogue(line.lineTh ?? ""))) {
    issues.push({
      ...base,
      code: "VD_DIALOGUE_STAGE_DIRECTION",
      severity: "error",
      message: "Dialogue contains a sound cue or stage direction instead of a spoken line.",
    });
  }

  if (dialogue.some((line) => line.origin === "script_fallback")) {
    issues.push({
      ...base,
      code: "VD_DIALOGUE_SCRIPT_FALLBACK",
      severity: "warning",
      message: "Dialogue came from script fallback and has not been planned/reviewed.",
    });
  }

  // Speakability hard rule (2026-07-08, spec §14.1 rule 6b) — unconditional
  // on duration/coverage (unlike VD_DIALOGUE_UNDERFILLED below): a line that
  // cannot literally be spoken is a defect regardless of how long the clip
  // is. Reuses the SAME canonical analyzer the sanitizer/skills reference —
  // no second "is this speakable" heuristic is declared here.
  if (
    dialogue.some(
      (line) =>
        !analyzeVerticalDramaLineSpeakability({ speaker: line.speaker, line: line.lineTh ?? "" })
          .speakable,
    )
  ) {
    issues.push({
      ...base,
      code: "VD_DIALOGUE_UNSPEAKABLE_SYMBOLS",
      severity: "error",
      message:
        "Dialogue contains wrapping quotes, parentheses, symbols, or other text that cannot be spoken as written.",
    });
  }

  if (durationSeconds >= 6 && dialogue.length > 0 && coverageRatio < MIN_CLIP_COVERAGE_RATIO) {
    issues.push({
      ...base,
      code: "VD_DIALOGUE_UNDERFILLED",
      severity: coverageRatio < ERROR_CLIP_COVERAGE_RATIO ? "error" : "warning",
      message: "Dialogue is too short for this clip duration, so the shot may feel stretched.",
    });
  }

  return {
    shotNumber: input.shotNumber,
    clipNumber: input.clipNumber,
    durationSeconds,
    estimatedSpeechSeconds,
    targetSpeechSeconds,
    coverageRatio,
    issues,
  };
}

export function analyzeVerticalDramaEpisodeDialogueQuality(
  clips: VerticalDramaDialogueClipQualityInput[],
): VerticalDramaEpisodeDialogueQuality {
  const clipQualities = clips.map(analyzeVerticalDramaClipDialogueQuality);
  const totalDurationSeconds = clipQualities.reduce((sum, clip) => sum + clip.durationSeconds, 0);
  const totalSpeechSeconds = clipQualities.reduce((sum, clip) => sum + clip.estimatedSpeechSeconds, 0);
  const targetSpeechSeconds = totalDurationSeconds * MIN_EPISODE_COVERAGE_RATIO;
  const coverageRatio = totalDurationSeconds > 0 ? totalSpeechSeconds / totalDurationSeconds : 0;
  const issues = clipQualities.flatMap((clip) => clip.issues);
  const seen = new Map<string, VerticalDramaDialogueClipQualityInput>();

  for (const clip of clips) {
    const signature = verticalDramaDialogueSignature(clip.dialogue);
    if (!signature) continue;
    const previous = seen.get(signature);
    if (previous) {
      issues.push({
        code: "VD_DIALOGUE_DUPLICATE",
        severity: "error",
        message: "Dialogue duplicates another clip and should be regenerated for this shot.",
        shotNumber: clip.shotNumber,
        clipNumber: clip.clipNumber,
      });
    } else {
      seen.set(signature, clip);
    }
  }

  if (totalDurationSeconds >= 30 && coverageRatio < MIN_EPISODE_COVERAGE_RATIO) {
    issues.push({
      code: "VD_DIALOGUE_EPISODE_UNDERFILLED",
      severity: coverageRatio < ERROR_EPISODE_COVERAGE_RATIO ? "error" : "warning",
      message: "The episode has too little spoken content for its target duration.",
      estimatedSpeechSeconds: totalSpeechSeconds,
      targetSpeechSeconds,
      coverageRatio,
    });
  }

  return {
    totalDurationSeconds,
    totalSpeechSeconds,
    targetSpeechSeconds,
    coverageRatio,
    clips: clipQualities,
    issues,
  };
}

/* -------------------------------------------------------------------------- */
/* Silent-gap analysis (spec §7.7.2 Layer 4, added 2026-07-07)                */
/*                                                                            */
/* Purely additive — nothing above this line changed behavior. See §7.7.1:   */
/* "silent-gap rule: within a speaking clip, estimated continuous silence    */
/* may not exceed 2.5 seconds; violations surface as VD_DIALOGUE_UNDERFILLED */
/* with the gap location."                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Within a clip that already carries dialogue, estimated continuous silence
 * may not exceed this many seconds (spec §7.7.2 Layer 4 / section-13). A
 * brand-new, independently-named constant — distinct from the `2.5` floor
 * used inside `targetVerticalDramaSpeechSeconds` above (that one is a
 * MINIMUM target-speech clamp, not a silence limit; the two constants happen
 * to share a numeric value today but govern unrelated rules).
 */
export const MAX_CONTINUOUS_SILENCE_SECONDS = 2.5;

/** Where the largest estimated silent stretch falls within the clip. */
export type VerticalDramaClipSilenceGapPosition = "start" | "middle" | "end" | null;

export type VerticalDramaClipSilenceAnalysis = {
  estimatedSpeechSeconds: number;
  maxContinuousSilenceSeconds: number;
  gapPosition: VerticalDramaClipSilenceGapPosition;
  exceedsLimit: boolean;
};

/**
 * Silent-gap analysis for a single clip (spec §7.7.2 Layer 4): within a clip
 * that already has dialogue, estimated continuous silence must not exceed
 * `MAX_CONTINUOUS_SILENCE_SECONDS`. Reuses the existing canonical per-line
 * estimator (`estimateVerticalDramaSpeechSeconds` /
 * `estimateVerticalDramaDialogueSeconds`) — no second speech-rate model is
 * introduced.
 *
 * A clip with NO dialogue at all is intentionally OUT OF SCOPE here — that
 * is the existing `VD_DIALOGUE_EMPTY` concern
 * (`analyzeVerticalDramaClipDialogueQuality`). This analyzer only reports on
 * clips that already have at least one line, so the two checks never
 * double-flag the same clip for two different reasons. Exempting an
 * explicitly `silenceIntent`-tagged visual-only shot (spec §7.7.2 Layer 3) is
 * the CALLER's responsibility — this function has no knowledge of shot
 * intent, only of lines and duration.
 *
 * Deterministic model: real per-line delivery timestamps do not exist yet at
 * script/storyboard stage (only line TEXT is authored), so lines are assumed
 * to be spoken in order across `lines.length` equal-sized slots
 * (`clipDurationSeconds / lines.length`), each slot's own line consuming the
 * FRONT of that slot with its estimated speech seconds. The unclaimed
 * remainder of a slot is that slot's silent gap, located immediately after
 * its line — the first slot's gap is `"start"`, the last slot's gap is
 * `"end"`, and every slot in between is `"middle"`. The single largest gap is
 * reported (first occurrence wins an exact tie, so identical input always
 * yields identical output). `gapPosition` is `null` whenever there is no
 * dialogue, or when no slot has any unclaimed silence (a fully/over-filled
 * clip).
 */
export function analyzeVerticalDramaClipSilence(
  lines: VerticalDramaDialogueQualityLine[] | undefined,
  clipDurationSeconds: number,
): VerticalDramaClipSilenceAnalysis {
  const durationSeconds = Math.max(0, clipDurationSeconds);
  const dialogue = lines ?? [];
  const estimatedSpeechSeconds = estimateVerticalDramaDialogueSeconds(dialogue);

  if (dialogue.length === 0) {
    return {
      estimatedSpeechSeconds,
      maxContinuousSilenceSeconds: 0,
      gapPosition: null,
      exceedsLimit: false,
    };
  }

  const slotCount = dialogue.length;
  const slotSeconds = durationSeconds / slotCount;

  let maxContinuousSilenceSeconds = 0;
  let gapIndex = -1;

  dialogue.forEach((line, index) => {
    const lineSpeechSeconds = estimateVerticalDramaSpeechSeconds(line.lineTh ?? "");
    const gapSeconds = Math.max(0, slotSeconds - lineSpeechSeconds);
    if (gapSeconds > maxContinuousSilenceSeconds) {
      maxContinuousSilenceSeconds = gapSeconds;
      gapIndex = index;
    }
  });

  const gapPosition: VerticalDramaClipSilenceGapPosition =
    gapIndex === -1
      ? null
      : gapIndex === slotCount - 1
        ? "end"
        : gapIndex === 0
          ? "start"
          : "middle";

  return {
    estimatedSpeechSeconds,
    maxContinuousSilenceSeconds,
    gapPosition,
    exceedsLimit: maxContinuousSilenceSeconds > MAX_CONTINUOUS_SILENCE_SECONDS,
  };
}

/* -------------------------------------------------------------------------- */
/* Speakability analyzer + sanitizer (spec §14.1 rule 6b, added 2026-07-08,   */
/* owner feedback with live episode-11 evidence). Purely additive.           */
/*                                                                            */
/* Every dialogue line must be literally speakable by TTS/a human actor: no  */
/* wrapping quote marks, no parenthetical stage direction in the speaker or  */
/* the line, no tildes/asterisks/brackets/slashes/markup, no em-dash as a    */
/* spoken beat, ellipsis runs collapsed (max one "…" per line), no emoji,    */
/* and a bare nonverbal sound (animal/ambient noise) written as if it were a */
/* dialogue line must be flagged for conversion to a sound cue.             */
/* -------------------------------------------------------------------------- */

export type VerticalDramaLineSpeakabilityViolationKind =
  | "wrapping_quotes"
  | "parenthetical_stage_direction"
  | "unspeakable_symbol"
  | "em_dash"
  | "ellipsis_run"
  | "emoji"
  | "nonverbal_line"
  /**
   * Added (spec §7.1 "read-aloud: one main idea per line", F132D) — strictly
   * OPT-IN via `VerticalDramaLineSpeakabilityInput.checkOneIdeaPerLine`
   * (default `false`/absent), never inferred from line content alone. See
   * `findOneIdeaClauseJoins`'s doc comment for the conservative
   * clause/conjunction-count heuristic that produces this.
   */
  | "multiple_main_ideas";

export type VerticalDramaLineSpeakabilityViolation = {
  kind: VerticalDramaLineSpeakabilityViolationKind;
  /** The exact offending character(s)/span found (e.g. `"“”"`, `"(สะดุ้ง)"`, `"~"`, `"—"`, `"…"`, `"🎉"`, or the bare nonverbal token itself). For `multiple_main_ideas`, the matched clause-joining term/punctuation that triggered the flag. */
  found: string;
  /**
   * Only ever set for `multiple_main_ideas` — the character index into the
   * CLEANED line text (see `VerticalDramaLineSpeakabilityResult.cleaned.line`)
   * suggesting where the line could be split into two, at the first detected
   * clause-join boundary. Absent for every other violation kind.
   */
  suggestedSplitIndex?: number;
};

export type VerticalDramaLineSpeakabilityInput = {
  speaker?: string;
  line: string;
  /**
   * Opt-in only (default `false`/absent) — spec §7.1 read-aloud "one main
   * idea per line" (F132D `verticalDramaMultiPassQc`). Strictly additive:
   * every existing unconditional caller
   * (`verticalDramaScriptGeneration.ts`, `verticalDramaStoryBible.ts`'s deep-
   * draft enforcement, `updateEpisodeDraftDialogue`'s manual-edit report)
   * omits this field and gets byte-identical output to before this flag
   * existed — the new check is NEVER inferred from line content alone, only
   * ever run when this is explicitly `true`. When set, runs a conservative
   * clause/conjunction-count heuristic (see `findOneIdeaClauseJoins`) and, if
   * the line reads as 3+ independent clauses joined together, pushes a
   * `multiple_main_ideas` violation with a suggested split point.
   */
  checkOneIdeaPerLine?: boolean;
};

export type VerticalDramaLineSpeakabilityCleaned = {
  speaker?: string;
  line: string;
  /** Parenthetical content pulled out of the speaker and/or the line, joined with "; " when both contributed. `undefined` when nothing was extracted. */
  delivery?: string;
};

export type VerticalDramaLineSpeakabilityResult = {
  /** `true` only when `violations` is empty. */
  speakable: boolean;
  violations: VerticalDramaLineSpeakabilityViolation[];
  cleaned: VerticalDramaLineSpeakabilityCleaned;
};

/** Curly + straight double/single quote characters treated as "wrapping quote marks" (spec §14.1 rule 6b). Never matched mid-string — only a leading/trailing RUN, so genuine embedded quoted speech inside a line is left untouched. */
const SPEAKABILITY_QUOTE_CHAR_PATTERN = /[“”‘’"']/;

/** ASCII + full-width parenthetical span, matched anywhere in text (speaker or line). */
const SPEAKABILITY_PARENTHETICAL_PATTERN = /[(（]([^)）]*)[)）]/g;

/** Symbols that must never appear in a spoken line: tilde, asterisk, square brackets, forward slash, backtick, angle brackets, underscore ("markup"). Parentheses are handled separately (they carry delivery content, not just noise). */
const SPEAKABILITY_UNSPEAKABLE_SYMBOL_PATTERN = /[~*[\]/`<>_]/g;

/** Literal em-dash — never a spoken beat (spec §14.1 rule 6b: "use a comma or a new line"). */
const SPEAKABILITY_EM_DASH_PATTERN = /—/g;

/** A RUN of 2+ adjacent "." or "…" characters (e.g. "...", "……", ".…") — collapses to one "…". */
const SPEAKABILITY_ELLIPSIS_RUN_PATTERN = /[.…]{2,}/g;

/** Pragmatic emoji coverage (regional-indicator flags, misc pictographs, symbols/dingbats, misc technical, variation selector) — not full Unicode emoji-data parity, but enough for real-world dialogue text. */
const SPEAKABILITY_EMOJI_PATTERN =
  /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}️]/gu;

/**
 * Known bare nonverbal-sound tokens (animal/ambient noise written as if it
 * were spoken dialogue) — a deliberately NARROW, extensible lexicon seeded
 * from the real observed case (spec §14.1 rule 6b: episode 11's cat
 * character "เจ้าเกลือ" speaking `เหมียว~`, i.e. "meow~"). A cleaned line
 * consisting ENTIRELY of one or more of these tokens (optionally repeated,
 * e.g. "เหมียว เหมียว") is flagged `nonverbal_line` — never a line that
 * merely CONTAINS one of these words as part of a longer spoken sentence.
 */
const KNOWN_NONVERBAL_SOUND_WORDS = new Set(["เหมียว", "โฮ่ง", "หง่าว"]);

function isKnownNonverbalSoundLine(cleanedLine: string): boolean {
  const tokens = cleanedLine.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.every((token) => KNOWN_NONVERBAL_SOUND_WORDS.has(token));
}

/** Strips a LEADING+TRAILING run of quote-mark characters (never an internal quote). Returns `null` when nothing was stripped. `found` preserves the exact stripped characters in their original left-to-right order. */
function stripWrappingQuoteMarks(text: string): { text: string; found: string } | null {
  let result = text;
  const leading: string[] = [];
  while (result.length > 0 && SPEAKABILITY_QUOTE_CHAR_PATTERN.test(result[0])) {
    leading.push(result[0]);
    result = result.slice(1);
  }
  const trailing: string[] = [];
  while (result.length > 0 && SPEAKABILITY_QUOTE_CHAR_PATTERN.test(result[result.length - 1])) {
    trailing.unshift(result[result.length - 1]);
    result = result.slice(0, -1);
  }
  if (leading.length === 0 && trailing.length === 0) return null;
  return { text: result, found: leading.join("") + trailing.join("") };
}

/** Removes every parenthetical span, returning the cleaned text (whitespace squeezed), the extracted INNER contents (delivery material), and the exact matched spans (for violation reporting, e.g. `"(สะดุ้ง)"`). */
function extractParentheticals(text: string): { text: string; extracted: string[]; matches: string[] } {
  const extracted: string[] = [];
  const matches: string[] = [];
  const stripped = text.replace(SPEAKABILITY_PARENTHETICAL_PATTERN, (match, inner: string) => {
    matches.push(match);
    const trimmedInner = inner.trim();
    if (trimmedInner) extracted.push(trimmedInner);
    return " ";
  });
  return { text: stripped.replace(/\s+/g, " ").trim(), extracted, matches };
}

function stripUnspeakableSymbols(text: string): { text: string; found: string[] } {
  const found: string[] = [];
  const stripped = text.replace(SPEAKABILITY_UNSPEAKABLE_SYMBOL_PATTERN, (match) => {
    found.push(match);
    return "";
  });
  return { text: stripped, found };
}

function replaceEmDashes(text: string): { text: string; count: number } {
  let count = 0;
  const replaced = text.replace(SPEAKABILITY_EM_DASH_PATTERN, () => {
    count += 1;
    return ", ";
  });
  return { text: replaced, count };
}

/**
 * Collapses ellipsis runs to a single "…" and then caps the WHOLE line to at
 * most one "…" total (keeps the first occurrence, drops any later one — with
 * no inserted space, matching Thai orthography, which does not space words
 * within a sentence). `found` is the first offending span encountered
 * (either a collapsed run like "..." or a dropped extra "…"), or `null` when
 * the line already had zero or one ellipsis mark.
 */
function collapseEllipsisRuns(text: string): { text: string; found: string | null } {
  let found: string | null = null;
  let working = text.replace(SPEAKABILITY_ELLIPSIS_RUN_PATTERN, (match) => {
    if (found === null) found = match;
    return "…";
  });
  let seenFirst = false;
  working = working.replace(/…/g, () => {
    if (!seenFirst) {
      seenFirst = true;
      return "…";
    }
    if (found === null) found = "…";
    return "";
  });
  return { text: working.replace(/\s+/g, " ").trim(), found };
}

function stripEmoji(text: string): { text: string; found: string[] } {
  const found: string[] = [];
  const stripped = text.replace(SPEAKABILITY_EMOJI_PATTERN, (match) => {
    found.push(match);
    return "";
  });
  return { text: stripped, found };
}

/**
 * Clause-joining conjunctions/connectives used by the opt-in
 * `checkOneIdeaPerLine` heuristic (spec §7.1 "read-aloud: one main idea per
 * line") — Thai casual speech has no reliable sentence-final punctuation, so
 * clause boundaries are approximated by these joining words. Deliberately a
 * conservative (non-exhaustive) list, and deliberately does NOT include
 * light/filler particles (นะ/สิ/ล่ะ/เหรอ/ครับ/ค่ะ) — only words that actually
 * join two independent clauses/ideas together.
 */
const ONE_IDEA_CLAUSE_JOIN_PATTERN_TH =
  /(แล้วก็|และ|แต่ว่า|แต่|หรือ|เพราะว่า|เพราะ|เนื่องจาก|ดังนั้น|ก็เลย|จนกระทั่ง|ถ้า|เมื่อ|ตอนที่)/g;
/** English equivalent — word-boundary matched, case-insensitive. */
const ONE_IDEA_CLAUSE_JOIN_PATTERN_EN =
  /\b(and|but|or|because|so|then|when|while|although|however)\b/gi;
/** Comma/full-width-comma joins count toward the clause tally in BOTH locales. */
const ONE_IDEA_COMMA_PATTERN = /[,，]/g;
/** Non-global check for "does this line contain any Thai character" — used only to pick which conjunction pattern to run (never `.test()`'d against a global-flagged constant, which would carry `lastIndex` state across calls). */
const HAS_THAI_CHAR_PATTERN = /[฀-๿]/;
/**
 * A line needs at least this many clause-join matches (2, i.e. 3+ clauses)
 * to be flagged — a conservative/high bar per spec §7.1's calibration note
 * ("ship with a conservative (high) threshold to avoid over-flagging,
 * tunable later"). A single conjunction (one join = two clauses) is common
 * in perfectly natural spoken dialogue and must NOT be flagged.
 */
const ONE_IDEA_MIN_JOIN_COUNT_TO_FLAG = 2;

/**
 * Finds every clause-join boundary in `line` (conjunction/connective or
 * comma), sorted by position. Returns `[]` for a line with fewer than 2
 * boundaries (nothing to flag). Locale is auto-detected from the line's own
 * script (Thai characters present -> Thai conjunction list; otherwise the
 * English placeholder list) since this analyzer has no explicit locale
 * parameter today.
 */
function findOneIdeaClauseJoins(line: string): Array<{ index: number; matched: string }> {
  const conjunctionPattern = HAS_THAI_CHAR_PATTERN.test(line)
    ? ONE_IDEA_CLAUSE_JOIN_PATTERN_TH
    : ONE_IDEA_CLAUSE_JOIN_PATTERN_EN;
  conjunctionPattern.lastIndex = 0;
  const commaPattern = new RegExp(ONE_IDEA_COMMA_PATTERN.source, "g");

  const matches: Array<{ index: number; matched: string }> = [];
  for (const pattern of [conjunctionPattern, commaPattern]) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) !== null) {
      matches.push({ index: match.index, matched: match[0] });
      if (match[0].length === 0) pattern.lastIndex += 1;
    }
  }
  return matches.sort((a, b) => a.index - b.index);
}

/**
 * Deterministic per-line speakability analyzer (spec §14.1 rule 6b). Cleans
 * BOTH `speaker` and `line`:
 *  - wrapping quote marks are stripped from the line;
 *  - a parenthetical anywhere in the speaker OR the line is removed and its
 *    inner text is folded into `cleaned.delivery` (joined with "; " when
 *    both the speaker and the line contributed);
 *  - `~`/`*`/`[`/`]`/`/`/backtick/angle-brackets/underscore ("markup") are
 *    stripped from the line;
 *  - an em-dash is replaced with ", " (a spoken beat becomes a comma, never
 *    a dash);
 *  - ellipsis runs collapse to one "…" for the whole line;
 *  - emoji are stripped;
 *  - a cleaned line that is nothing but a known nonverbal sound token (e.g.
 *    "เหมียว") is flagged so it can be converted to a sound cue instead of a
 *    dialogue line.
 *
 * Pure and deterministic — identical input always yields identical output.
 * `sanitizeSpeakableLineForDelivery` below is a thin wrapper reusing this
 * SAME cleaning core so there is only one implementation of "what makes text
 * speakable" in this module.
 */
export function analyzeVerticalDramaLineSpeakability(
  input: VerticalDramaLineSpeakabilityInput,
): VerticalDramaLineSpeakabilityResult {
  const violations: VerticalDramaLineSpeakabilityViolation[] = [];
  const deliveryParts: string[] = [];

  // ---- Speaker ----
  let cleanedSpeaker = input.speaker?.trim() || undefined;
  if (cleanedSpeaker) {
    const speakerParens = extractParentheticals(cleanedSpeaker);
    if (speakerParens.matches.length > 0) {
      for (const match of speakerParens.matches) {
        violations.push({ kind: "parenthetical_stage_direction", found: match });
      }
      deliveryParts.push(...speakerParens.extracted);
      cleanedSpeaker = speakerParens.text || undefined;
    }
  }

  // ---- Line ----
  let line: string;
  const quoteStrip = stripWrappingQuoteMarks((input.line ?? "").trim());
  if (quoteStrip) {
    violations.push({ kind: "wrapping_quotes", found: quoteStrip.found });
    line = quoteStrip.text;
  } else {
    line = (input.line ?? "").trim();
  }

  const lineParens = extractParentheticals(line);
  if (lineParens.matches.length > 0) {
    for (const match of lineParens.matches) {
      violations.push({ kind: "parenthetical_stage_direction", found: match });
    }
    deliveryParts.push(...lineParens.extracted);
    line = lineParens.text;
  }

  const symbolStrip = stripUnspeakableSymbols(line);
  for (const found of symbolStrip.found) {
    violations.push({ kind: "unspeakable_symbol", found });
  }
  line = symbolStrip.text;

  const emDash = replaceEmDashes(line);
  if (emDash.count > 0) {
    violations.push({ kind: "em_dash", found: "—" });
  }
  line = emDash.text;

  const ellipsis = collapseEllipsisRuns(line);
  if (ellipsis.found) {
    violations.push({ kind: "ellipsis_run", found: ellipsis.found });
  }
  line = ellipsis.text;

  const emoji = stripEmoji(line);
  for (const found of emoji.found) {
    violations.push({ kind: "emoji", found });
  }
  line = emoji.text.replace(/\s+/g, " ").trim();

  if (line && isKnownNonverbalSoundLine(line)) {
    violations.push({ kind: "nonverbal_line", found: line });
  }

  // Opt-in only (spec §7.1 read-aloud "one main idea per line", F132D) —
  // NEVER runs unless the caller explicitly sets `checkOneIdeaPerLine: true`,
  // so every existing unconditional caller's output is byte-identical.
  if (input.checkOneIdeaPerLine && line) {
    const joins = findOneIdeaClauseJoins(line);
    if (joins.length >= ONE_IDEA_MIN_JOIN_COUNT_TO_FLAG) {
      const firstJoin = joins[0];
      violations.push({
        kind: "multiple_main_ideas",
        found: firstJoin.matched,
        suggestedSplitIndex: firstJoin.index,
      });
    }
  }

  return {
    speakable: violations.length === 0,
    violations,
    cleaned: {
      speaker: cleanedSpeaker,
      line,
      delivery: deliveryParts.length > 0 ? deliveryParts.join("; ") : undefined,
    },
  };
}

/**
 * Sanitize a single dialogue LINE for an outbound TTS/native-video-dialogue
 * payload (spec §14.1 rule 6b: "TTS/native-audio consumption paths sanitize
 * wrapper punctuation before rendering"). Idempotent and deterministic — a
 * line with no violations is returned byte-identical. Reuses
 * `analyzeVerticalDramaLineSpeakability`'s cleaning core (no speaker
 * context, since consumption points only ever hold the line text); callers
 * that also have a speaker/delivery context should call the analyzer
 * directly instead. Never mutates the caller's original artifact — this
 * only ever transforms a COPY of the text for the outbound payload.
 */
export function sanitizeSpeakableLineForDelivery(line: string): string {
  return analyzeVerticalDramaLineSpeakability({ line }).cleaned.line;
}
