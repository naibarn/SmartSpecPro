/**
 * Vertical Drama Series — name-blind voice-distinctness check (spec §7.1/§7.3
 * "distinct voices", F132D/F132F; plan
 * `sections/section-05-dialogue-rules-and-speech-profiles.md`).
 *
 * Ownership: this section owns the check DEFINITION (sampler, prompt
 * builder, response schema, scoring, finding mapper) as pure/exposed
 * functions; Section 06 wires this into the multi-pass QC runner (decides
 * WHEN it runs — per-episode vs. per-season — and folds the LLM-judge call
 * into its own pass batching, or invokes it standalone). This module never
 * executes the actual LLM call itself — every function here is pure/
 * side-effect-free so Section 06 can choose either invocation style.
 *
 * Approach: sample N speaker-alternating exchanges from a drafted episode/
 * season, strip real speaker labels, ask an LLM judge to attribute each
 * anonymized line to one of the anonymized cast members ("Speaker A/B/...")
 * using ONLY each character's `speechProfile` (never the character's name,
 * backstory, or any other identifying detail) — if a judge with no other
 * information can still tell who's speaking from voice alone, the cast is
 * distinct; if attribution accuracy is low, two (or more) characters'
 * speech profiles read too similarly and need to be pulled apart along a
 * specific axis (speed/vocabulary/sentence length/line function).
 */

import { type VerticalDramaSpeechProfile } from "@shared/verticalDramaSeries/speechProfile";

/* -------------------------------------------------------------------------- */
/* Sampling                                                                   */
/* -------------------------------------------------------------------------- */

/** One speaker-alternating exchange sampled from a drafted episode/season — a single dialogue line plus which character actually spoke it (ground truth, kept server-side only — never sent to the judge). */
export type VdVoiceDistinctnessExchange = {
  exchangeId: string;
  episodeNumber?: number;
  shotNumber?: number;
  actualCharacterKey: string;
  line: string;
};

/**
 * Default sample size (spec §7.2 cost-risk note: "sampling N (small, e.g.
 * 6-10) exchanges rather than every line"). Section 06 owns actual cadence
 * (per-episode vs. per-season); this is only the DEFAULT `sampleExchanges`
 * falls back to when a caller doesn't override it.
 */
export const VOICE_DISTINCTNESS_DEFAULT_SAMPLE_SIZE = 8;

/**
 * Deterministically samples up to `sampleSize` speaker-ALTERNATING exchanges
 * from `exchanges` (in input order) — "alternating" meaning it never picks
 * two consecutive samples from the SAME character back-to-back when a
 * different-speaker line is available nearby, so the judge has genuine
 * back-and-forth to reason about rather than one character's monologue.
 * Pure and deterministic (no RNG) — identical input always yields an
 * identical sample, matching every other Vertical Drama deterministic
 * check's convention. Returns every exchange verbatim (already 8 or fewer)
 * when the input is smaller than `sampleSize`.
 */
export function sampleAlternatingExchanges(
  exchanges: VdVoiceDistinctnessExchange[],
  sampleSize: number = VOICE_DISTINCTNESS_DEFAULT_SAMPLE_SIZE,
): VdVoiceDistinctnessExchange[] {
  if (exchanges.length <= sampleSize) return [...exchanges];

  const sampled: VdVoiceDistinctnessExchange[] = [];
  let lastSpeaker: string | null = null;
  let cursor = 0;

  while (sampled.length < sampleSize && cursor < exchanges.length) {
    // Prefer the next exchange from a DIFFERENT speaker than the last pick;
    // fall back to the same speaker only if nothing else is left to scan.
    let pickedIndex = -1;
    for (let i = cursor; i < exchanges.length; i += 1) {
      if (exchanges[i].actualCharacterKey !== lastSpeaker) {
        pickedIndex = i;
        break;
      }
    }
    if (pickedIndex === -1) pickedIndex = cursor;

    sampled.push(exchanges[pickedIndex]);
    lastSpeaker = exchanges[pickedIndex].actualCharacterKey;
    cursor = pickedIndex + 1;
  }

  return sampled;
}

/* -------------------------------------------------------------------------- */
/* Prompt building (anonymized — never sends real speaker names)              */
/* -------------------------------------------------------------------------- */

/** One cast member's anonymized identity + speech profile, as sent to the judge. Never includes the character's real name/key. */
export type VdVoiceDistinctnessAnonymizedCastMember = {
  /** Stable "Speaker A"/"Speaker B"/... label — the ONLY identity the judge ever sees. */
  speakerLabel: string;
  speechProfile: VerticalDramaSpeechProfile;
};

/** One anonymized line the judge must attribute — `exchangeId` round-trips back to the real exchange without exposing the real speaker. */
export type VdVoiceDistinctnessAnonymizedLine = {
  exchangeId: string;
  line: string;
};

/**
 * Builds a stable `characterKey -> "Speaker A"/"Speaker B"/...` label map, in
 * first-seen order — the SAME anonymization order both the cast-member list
 * and the line list must use, so a caller can always map the judge's
 * `predictedSpeakerLabel` back to a real character via this map (never
 * exposed to the judge itself).
 */
export function buildAnonymizedSpeakerLabels(
  characterKeys: string[],
): Map<string, string> {
  const labels = new Map<string, string>();
  let index = 0;
  for (const key of characterKeys) {
    if (labels.has(key)) continue;
    labels.set(key, `Speaker ${String.fromCharCode(65 + index)}`);
    index += 1;
  }
  return labels;
}

/**
 * Builds the name-blind judge prompt payload: an anonymized cast list (label
 * + speech profile ONLY, no name/backstory/other identifying detail) and an
 * anonymized line list (line text + exchangeId ONLY, no speaker). Pure —
 * does not call any LLM. The caller (Section 06's pass runner) is
 * responsible for actually sending this to a judge model and parsing its
 * response against `voiceDistinctnessJudgeResponseSchema` below.
 */
export function buildVoiceDistinctnessJudgePrompt(
  characters: Array<{ characterKey: string; speechProfile: VerticalDramaSpeechProfile }>,
  exchanges: VdVoiceDistinctnessExchange[],
): {
  speakerLabelsByCharacterKey: Map<string, string>;
  castMembers: VdVoiceDistinctnessAnonymizedCastMember[];
  lines: VdVoiceDistinctnessAnonymizedLine[];
  instructions: string;
} {
  const speakerLabelsByCharacterKey = buildAnonymizedSpeakerLabels(
    characters.map((c) => c.characterKey),
  );

  const castMembers: VdVoiceDistinctnessAnonymizedCastMember[] = characters.map((c) => ({
    speakerLabel: speakerLabelsByCharacterKey.get(c.characterKey)!,
    speechProfile: c.speechProfile,
  }));

  const lines: VdVoiceDistinctnessAnonymizedLine[] = exchanges.map((exchange) => ({
    exchangeId: exchange.exchangeId,
    line: exchange.line,
  }));

  const instructions = [
    "You are a name-blind voice-attribution judge. Below is a cast of anonymized speakers,",
    "each described ONLY by a structured speech profile (speaking speed, vocabulary level,",
    "typical sentence length, metaphor usage, emotional default, common line function,",
    "forbidden style, signature phrases) — you are given NO names, backstory, or any other",
    "identifying detail. For each anonymized line below, predict which speaker label said it,",
    "using ONLY the speech profiles above. Return one prediction per exchangeId.",
  ].join(" ");

  return { speakerLabelsByCharacterKey, castMembers, lines, instructions };
}

/* -------------------------------------------------------------------------- */
/* Response schema + scoring                                                  */
/* -------------------------------------------------------------------------- */

export type VdVoiceDistinctnessAttributionResult = {
  exchangeId: string;
  predictedSpeakerLabel: string;
  actualSpeakerLabel: string;
  correct: boolean;
};

/**
 * Minimum attribution accuracy (spec §7.1 "distinct voices") below which the
 * cast reads as insufficiently distinguishable — a judge with no
 * information beyond speech profiles should still be able to correctly
 * attribute the MAJORITY of sampled lines when voices are genuinely
 * distinct.
 */
export const VOICE_DISTINCTNESS_MIN_ACCURACY = 0.6;

/**
 * Attribution accuracy ratio (0-1) — the fraction of `results` where
 * `correct` is true. Returns `1` (vacuously "fully distinct" — nothing
 * contradicts it) for an empty `results` array, matching this codebase's
 * existing "nothing to fail" convention for empty-input edge cases (e.g.
 * `dialogueQuality.ts`'s `allLinesSpeakable` for a shot with zero lines).
 */
export function computeVoiceDistinctnessScore(
  results: VdVoiceDistinctnessAttributionResult[],
): number {
  if (results.length === 0) return 1;
  const correctCount = results.filter((r) => r.correct).length;
  return correctCount / results.length;
}

/* -------------------------------------------------------------------------- */
/* Finding mapper                                                             */
/* -------------------------------------------------------------------------- */

/** `VdDramaturgyFinding`-shaped (see `verticalDramaDialogueChecks.ts`'s file-level doc comment for why this module also uses a local shape rather than importing the not-yet-registered kind). */
export type VdVoiceDistinctnessFinding = {
  kind: "voices_too_similar";
  evidenceEpisodes: number[];
  detail: string;
};

/** Human-readable label for each `speechProfile` axis this diff compares, used in the finding's `detail` text. */
const SPEECH_PROFILE_AXIS_LABELS: Record<string, string> = {
  speakingSpeed: "speaking speed",
  vocabularyLevel: "vocabulary level",
  typicalSentenceLength: "typical sentence length",
  commonLineFunction: "common line function",
};

/** Axes compared, in priority order (checked in this order; the FIRST identical axis found is reported — matches "flagging the most-identical axis" per the section's test convention when multiple axes tie). */
const SPEECH_PROFILE_COMPARISON_AXES: Array<keyof VerticalDramaSpeechProfile> = [
  "speakingSpeed",
  "vocabularyLevel",
  "typicalSentenceLength",
  "commonLineFunction",
];

/**
 * Diffs two characters' `speechProfile` field-by-field (in
 * `SPEECH_PROFILE_COMPARISON_AXES` priority order) and returns the label of
 * the FIRST axis found identical between them — the axis most likely
 * responsible for the two characters reading as confusable. Returns `null`
 * if no compared axis is identical (the confusion must stem from something
 * this diff doesn't model, e.g. `emotionalDefault`'s free text).
 */
export function findMostIdenticalSpeechProfileAxis(
  a: VerticalDramaSpeechProfile,
  b: VerticalDramaSpeechProfile,
): string | null {
  for (const axis of SPEECH_PROFILE_COMPARISON_AXES) {
    if (a[axis] !== undefined && a[axis] === b[axis]) {
      return SPEECH_PROFILE_AXIS_LABELS[axis as string] ?? String(axis);
    }
  }
  return null;
}

/**
 * Maps a low-accuracy voice-distinctness result into a `voices_too_similar`
 * finding naming the confused character pair(s) and the most-identical
 * profile axis. Only ever called by the caller once it has already decided
 * `computeVoiceDistinctnessScore(results) < VOICE_DISTINCTNESS_MIN_ACCURACY`
 * — this function itself does not gate on the threshold (kept separate so a
 * caller can unit-test threshold logic and finding-shape logic
 * independently).
 *
 * `confusedPairs` — the character-key pairs the judge actually mixed up
 * (derived by the caller from `results`: any `(actualCharacterKey,
 * predictedCharacterKey)` pair where `correct` is `false`). `characters` is
 * the same `characterKey -> speechProfile` map the prompt builder was given,
 * used to diff each confused pair's profile.
 */
export function toVoicesTooSimilarFinding(params: {
  episodeNumber: number;
  confusedPairs: Array<[string, string]>;
  characters: Map<string, VerticalDramaSpeechProfile>;
}): VdVoiceDistinctnessFinding {
  const { episodeNumber, confusedPairs, characters } = params;

  const pairDetails = confusedPairs.map(([keyA, keyB]) => {
    const profileA = characters.get(keyA);
    const profileB = characters.get(keyB);
    const axis =
      profileA && profileB ? findMostIdenticalSpeechProfileAxis(profileA, profileB) : null;
    return axis ? `${keyA} & ${keyB} (${axis} needs separating)` : `${keyA} & ${keyB}`;
  });

  return {
    kind: "voices_too_similar",
    evidenceEpisodes: [episodeNumber],
    detail: `ตัวละครมีน้ำเสียงคล้ายกันเกินไป (การทดสอบแบบไม่ระบุชื่อแยกแยะไม่ออก): ${pairDetails.join(", ")}`,
  };
}
