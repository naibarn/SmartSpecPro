/**
 * Vertical Drama Series — retention-hooks deterministic FACTS
 * (`planning/vertical-drama-retention-hooks/plan.md` W4, "supporting pillar
 * C" / เสา C, added 2026-07-11).
 *
 * SKILL-FIRST — READ BEFORE EDITING: this module only *counts* — it has NO
 * threshold, cap, or pass/fail concept anywhere. Every exported function
 * returns a small facts object that is later embedded (as a
 * `retention_metrics`-style block, mirroring the existing `density_metrics`
 * precedent in `server/services/verticalDramaEpisodeQualityReview.ts`'s
 * `computeVerticalDramaDensityMetrics`) into the quality-review LLM's user
 * prompt as GROUND TRUTH the model can cite instead of guessing. The
 * review LLM (pillar B) is the sole judge of whether a fact is "good" or
 * "bad" in context; the authorship rules the facts get judged against live
 * in skill.md (pillar A). This module must never grow a magic-number
 * constant that implies a verdict, never throw on "bad" input, and never
 * gate/retry/reject anything — see the plan's "สิ่งที่จงใจไม่ทำ" section.
 *
 * Pure, deterministic, DB/IO-free — no `Date.now`/`Math.random`/network —
 * and tolerant of every optional field this module reads being absent
 * (older episode/script/storyboard artifacts predate `open_loops`,
 * `retention_loop`, and `change_type` — see R1/R2 in the plan). Absence
 * always degrades to the zero/empty fact, never a thrown error.
 *
 * Narrow, structurally-typed local input interfaces on purpose (same
 * convention as `characterIdentityMap.ts`/`textOverlay.ts`) rather than
 * importing the heavier Zod-inferred `ScriptBuilderOutput`/storyboard shot
 * types — keeps this module trivially unit-testable and decoupled from
 * those schemas' evolution; callers pass the relevant subset.
 */

/* -------------------------------------------------------------------------- */
/* Fact 1 — subtitle line length (measured, never capped)                     */
/* -------------------------------------------------------------------------- */

/** One dialogue line's spoken text — matches
 *  `verticalDramaScriptGeneration.ts`'s `scriptDialogueLineSchema.line`
 *  field name (the spoken text of a `structure.beats[].dialogue_lines[]`
 *  entry). Only `line` is read; everything else on the real object is
 *  ignored. */
export interface VdSubtitleLineFactsInput {
  readonly line?: string | null;
}

export interface VdSubtitleLineFacts {
  /** Longest dialogue line's length, measured in GRAPHEMES (user-perceived
   *  characters) — never `.length`/UTF-16 code units, since Thai combining
   *  vowel/tone marks would otherwise inflate the count for a line a reader
   *  perceives as short. `0` when there are no non-empty lines at all. This
   *  is a MEASUREMENT ONLY — there is intentionally no cap/threshold here;
   *  "is this too long for a single subtitle line" is a skill.md rule the
   *  review LLM judges in context (a long line can still read fluidly; a
   *  short line can still feel choppy). */
  readonly maxLineChars: number;
  /** The full text of the line that produced `maxLineChars` (first one
   *  found, when multiple lines tie), so the review LLM can see the actual
   *  content instead of a bare number. `""` when there are no non-empty
   *  lines. */
  readonly longestLineExcerpt: string;
}

/** Grapheme (user-perceived character) count of `text`, correctly counting
 *  a base character plus its combining marks (e.g. Thai tone/vowel marks)
 *  as a single grapheme. Uses `Intl.Segmenter` (available in this repo's
 *  target runtimes — Node 22, evergreen browsers) when present; falls back
 *  to code-point counting (`Array.from`) when it is not, which correctly
 *  handles astral code points/surrogate pairs but — documented limitation —
 *  will still over-count a base character followed by combining marks as
 *  more than one grapheme. */
function countGraphemes(text: string): number {
  if (!text) return 0;
  const SegmenterCtor = (
    Intl as typeof Intl & {
      Segmenter?: new (
        locale?: string | string[],
        options?: { granularity?: "grapheme" | "word" | "sentence" }
      ) => { segment(input: string): Iterable<unknown> };
    }
  ).Segmenter;
  if (typeof SegmenterCtor === "function") {
    const segmenter = new SegmenterCtor(undefined, { granularity: "grapheme" });
    let count = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const _segment of segmenter.segment(text)) count += 1;
    return count;
  }
  // Fallback: code-point iteration (documented limitation above).
  return Array.from(text).length;
}

/** Measures the longest dialogue line by grapheme count. Facts only —
 *  see module doc comment: no cap, no over-limit count, no verdict. Lines
 *  with a missing/blank `line` are ignored; an all-empty/empty input
 *  returns the zero fact. */
export function computeSubtitleLineFacts(
  dialogueLines: readonly VdSubtitleLineFactsInput[]
): VdSubtitleLineFacts {
  let maxLineChars = 0;
  let longestLineExcerpt = "";
  for (const entry of dialogueLines ?? []) {
    const text = entry?.line?.trim();
    if (!text) continue;
    const chars = countGraphemes(text);
    if (chars > maxLineChars) {
      maxLineChars = chars;
      longestLineExcerpt = text;
    }
  }
  return { maxLineChars, longestLineExcerpt };
}

/* -------------------------------------------------------------------------- */
/* Fact 2 — retention structure (open loops / retention loop presence)        */
/* -------------------------------------------------------------------------- */

/** Relevant subset of a script-builder output's `open_loops[]` entry (see
 *  `verticalDramaScriptGeneration.ts`'s `scriptOpenLoopSchema`) — only
 *  presence in the array matters here, not its content. */
export interface VdRetentionStructureFactsOpenLoopInput {
  readonly question?: string | null;
}

/** Relevant subset of a script-builder output's `retention_loop` object
 *  (see `scriptRetentionLoopSchema`) — only `type` is read. */
export interface VdRetentionStructureFactsRetentionLoopInput {
  readonly type?: string | null;
}

/** Relevant subset of a script-builder output — matches the real
 *  `open_loops`/`retention_loop` key names verbatim so a raw (or
 *  Zod-parsed) `ScriptBuilderOutput` can be passed here structurally
 *  without any remapping. Both fields are optional/nullable: episodes
 *  generated before R1 (`planning/vertical-drama-retention-hooks/plan.md`
 *  W2) predate them entirely. */
export interface VdRetentionStructureFactsInput {
  readonly open_loops?:
    | readonly VdRetentionStructureFactsOpenLoopInput[]
    | null;
  readonly retention_loop?: VdRetentionStructureFactsRetentionLoopInput | null;
}

export interface VdRetentionStructureFacts {
  /** Number of entries in `open_loops[]`. `0` when the field is absent —
   *  the "should be >=1" rule lives in skill.md/the review LLM, never here. */
  readonly openLoopCount: number;
  /** `retention_loop.type` verbatim (one of the six canonical types), or
   *  `null` when the episode has no `retention_loop` at all or the field
   *  omits `type`. */
  readonly retentionLoopType: string | null;
  /** Whether a `retention_loop` object is present at all (independent of
   *  whether it carries a recognized `type`). */
  readonly retentionLoopPresent: boolean;
}

/** Reads the (optional) `open_loops[]`/`retention_loop` fields a
 *  retention-hooks-aware script-builder output may carry. Tolerant of
 *  absence — an episode predating R1 (or any partial/legacy artifact)
 *  returns `{ openLoopCount: 0, retentionLoopType: null,
 *  retentionLoopPresent: false }` rather than throwing. */
export function computeRetentionStructureFacts(
  script: VdRetentionStructureFactsInput | null | undefined
): VdRetentionStructureFacts {
  const openLoopCount = Array.isArray(script?.open_loops)
    ? script!.open_loops!.length
    : 0;
  const retentionLoop = script?.retention_loop ?? null;
  const retentionLoopPresent = retentionLoop != null;
  const retentionLoopType =
    retentionLoopPresent &&
    typeof retentionLoop!.type === "string" &&
    retentionLoop!.type
      ? retentionLoop!.type
      : null;
  return { openLoopCount, retentionLoopType, retentionLoopPresent };
}

/* -------------------------------------------------------------------------- */
/* Fact 3 — shot change cadence                                               */
/* -------------------------------------------------------------------------- */

/** Relevant subset of one storyboard shot for change-cadence facts. Every
 *  field is optional/nullable — `change_type` is the R2 (W3) per-shot
 *  addition (`planning/vertical-drama-retention-hooks/plan.md`) and does
 *  not exist on any shot yet in the live codebase at the time this module
 *  was written; `emotion`/`camera`/`location` are the pre-existing raw
 *  shot fields used ONLY for the optional declared-vs-actual cross-check
 *  fact (flatten any structured `camera` object to a comparable string
 *  before calling, if the caller wants that cross-check to be meaningful —
 *  this function only does string equality). */
export interface VdShotChangeCadenceFactsInputShot {
  readonly change_type?: readonly string[] | null;
  readonly emotion?: string | null;
  readonly camera?: string | null;
  readonly location?: string | null;
}

export interface VdShotChangeCadenceFacts {
  /** Longest run of consecutive shots (in the order given) with no
   *  declared real change — i.e. `change_type` absent/empty, or exactly
   *  `["none"]`. `0` when no shot in the input declares `change_type` at
   *  all (no signal to measure — see module doc comment on absence). */
  readonly maxStaticStreak: number;
  /** Count of rolling 3-shot windows that contain zero shots with a
   *  declared real change. `0` when fewer than 3 shots are given, or when
   *  no shot declares `change_type` at all. */
  readonly windowsWithoutChange: number;
  /** Cross-check fact (advisory, never a rejection — see module doc
   *  comment): count of shots that declare a real change in `change_type`
   *  but whose `emotion`/`camera`/`location` are all textually identical
   *  to the previous shot's (comparing only the fields present on BOTH
   *  shots — a shot with no comparable field present is skipped, never
   *  counted as a mismatch). `0` when there is nothing to cross-check
   *  (fewer than 2 shots, or no declared changes). */
  readonly declaredChangeMismatchCount: number;
}

const STATIC_CHANGE_TYPE_MARKER = "none";

function hasDeclaredRealChange(
  shot: VdShotChangeCadenceFactsInputShot | null | undefined
): boolean {
  const changeType = shot?.change_type;
  if (!changeType || changeType.length === 0) return false;
  if (
    changeType.length === 1 &&
    changeType[0]?.trim().toLowerCase() === STATIC_CHANGE_TYPE_MARKER
  ) {
    return false;
  }
  return true;
}

/** Computes shot-change-cadence facts from each shot's (optional)
 *  `change_type` declaration. Tolerant of `change_type` being absent on
 *  every shot (pre-R2 artifacts) — returns the zero fact rather than
 *  treating "no signal" as "all static". Facts only — no cadence
 *  cap/violation-count here (the plan's "no run of 3+ static shots" rule
 *  lives in skill.md; the review LLM decides whether a given
 *  `maxStaticStreak`/`windowsWithoutChange` is a problem in context). */
export function computeShotChangeCadenceFacts(
  shots: readonly VdShotChangeCadenceFactsInputShot[]
): VdShotChangeCadenceFacts {
  const list = shots ?? [];
  const anyDeclared = list.some(
    shot => shot?.change_type != null && shot.change_type.length > 0
  );
  if (!anyDeclared) {
    return {
      maxStaticStreak: 0,
      windowsWithoutChange: 0,
      declaredChangeMismatchCount: 0,
    };
  }

  let maxStaticStreak = 0;
  let currentStreak = 0;
  for (const shot of list) {
    if (hasDeclaredRealChange(shot)) {
      currentStreak = 0;
    } else {
      currentStreak += 1;
      if (currentStreak > maxStaticStreak) maxStaticStreak = currentStreak;
    }
  }

  let windowsWithoutChange = 0;
  for (let i = 0; i + 3 <= list.length; i += 1) {
    const window = list.slice(i, i + 3);
    if (!window.some(hasDeclaredRealChange)) windowsWithoutChange += 1;
  }

  let declaredChangeMismatchCount = 0;
  for (let i = 1; i < list.length; i += 1) {
    const shot = list[i];
    const previous = list[i - 1];
    if (!hasDeclaredRealChange(shot)) continue;

    let comparableFieldCount = 0;
    let identicalFieldCount = 0;
    const fieldNames = ["emotion", "camera", "location"] as const;
    for (const field of fieldNames) {
      const current = shot[field];
      const prev = previous[field];
      if (current == null || current === "" || prev == null || prev === "")
        continue;
      comparableFieldCount += 1;
      if (current === prev) identicalFieldCount += 1;
    }

    if (comparableFieldCount === 0) continue; // nothing to judge by — not a mismatch
    if (identicalFieldCount === comparableFieldCount)
      declaredChangeMismatchCount += 1;
  }

  return { maxStaticStreak, windowsWithoutChange, declaredChangeMismatchCount };
}

/* -------------------------------------------------------------------------- */
/* Fact 4 — retention-loop type rotation across episodes                      */
/* -------------------------------------------------------------------------- */

export interface VdRetentionLoopRotationFacts {
  /** How many of the MOST RECENT consecutive prior episodes
   *  (`recentTypes[0]` = nearest previous episode, `recentTypes[1]` = the
   *  one before that, and so on) share `currentType`. Stops counting at
   *  the first prior episode whose type differs (or at an entry with no
   *  recorded type). `0` when `currentType` is absent, or when
   *  `recentTypes` is empty, or when the nearest prior episode's type
   *  already differs. Advisory only — see module doc comment; whether
   *  reusing the same retention-loop type is a problem depends on genre/
   *  execution, which is the review LLM's call. */
  readonly repeatedStreak: number;
}

/** Counts the leading run of `recentTypes` (nearest-first) equal to
 *  `currentType`. */
export function computeRetentionLoopRotation(
  currentType: string | null | undefined,
  recentTypes: readonly (string | null | undefined)[]
): VdRetentionLoopRotationFacts {
  if (!currentType) return { repeatedStreak: 0 };
  let repeatedStreak = 0;
  for (const type of recentTypes ?? []) {
    if (type === currentType) {
      repeatedStreak += 1;
    } else {
      break;
    }
  }
  return { repeatedStreak };
}
