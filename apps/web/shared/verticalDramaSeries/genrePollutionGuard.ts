/**
 * Vertical Drama Series — Genre Pollution Guard.
 *
 * Part of `planning/vd-series-memory-and-lineage/plan.md` Stage 1.5. Real
 * dev-DB data proved `vertical_drama_series.genre` is NOT reliably a genre —
 * it has been observed holding a logline, an alternate/working title, or a
 * byte-for-byte copy of `title` itself:
 *
 *   | series | title                          | genre (as stored)                          |
 *   |--------|--------------------------------|---------------------------------------------|
 *   | 17     | รักข้ามเวลา                     | คฤหาสน์ครึ่งเวลา: อ้อมใจในเงา (alt-title, has a "Title: Subtitle" colon shape) |
 *   | 16     | คาเฟ่ป่วนรัก กับดักพี่ชายตัวแสบ  | คาเฟ่ปั่นรัก พี่ชายหวงตัวแสบในตึกเดียวกัน (a paraphrased near-duplicate of the title, not a genre label) |
 *   | 5      | สวมรอยดาราสองชีวิต…             | สวมรอยดาราสองชีวิต… (verbatim copy of `title`) |
 *
 * `title`/`genre` are both injected into EVERY story-generation prompt (see
 * `server/services/verticalDramaStoryBible.ts`'s `Series title:`/`Genre:`
 * emit sites). A polluted `genre` therefore injects a SECOND, CONFLICTING
 * title into every prompt for that series — a live authoring-quality bug
 * independent of any other feature. It also blocks the season-2 requirement
 * "the title is set, content must match it, the genre cannot be changed":
 * locking a `genre` field that holds a logline locks garbage.
 *
 * DESIGN CONSTRAINT (explicit product-owner instruction): this is Thai
 * free-text input. A real, legitimate Thai genre value can legitimately be a
 * fairly long compound descriptor — e.g. "โรแมนติกดราม่าย้อนเวลา" (a real,
 * unremarkable genre tag: "romantic drama, time-travel") — and Thai does not
 * use whitespace to separate words the way English does, so there is no
 * cheap, reliable tokenizer available here. Given that, this guard is
 * DELIBERATELY conservative and structural rather than semantic:
 *
 *   1. `duplicate_of_title` — genre normalizes (trim + whitespace-collapse,
 *      case-fold) to EXACTLY the same string as title. Catches series 5
 *      above. Zero false-positive risk: a real genre is never
 *      character-for-character identical to its own series' title.
 *
 *   2. `sentence_shaped` — genre contains a structural punctuation mark that
 *      essentially never appears inside a genre LABEL but is characteristic
 *      of a title/logline: a colon (the "Title: Subtitle" alternate-title
 *      shape — catches series 17 above), an ellipsis (a cliffhanger/logline
 *      trailing-off convention), or a question/exclamation mark (loglines
 *      are often written as a hook/question; genre tags never are). No Thai
 *      genre label in this product's real usage has ever been observed using
 *      any of these marks.
 *
 *   3. `logline_length` — genre is BOTH longer than
 *      `GENRE_LOGLINE_LENGTH_THRESHOLD` chars AND contains at least one
 *      space (i.e. reads as a multi-segment phrase, not a single compound
 *      genre word). Catches series 16 above (41 chars, 2 space-separated
 *      segments) without catching legitimate longer single-compound-word
 *      genre labels like "โรแมนติกดราม่าย้อนเวลา" (22 chars, no space) or
 *      even a realistic multi-tag genre like "โรแมนติก ดราม่า ครอบครัว
 *      ย้อนยุค" (32 chars, well under the threshold). The threshold was
 *      chosen empirically against this product's real genre values and the
 *      3 known-polluted rows — see this file's test for the exact numbers.
 *      This rule is intentionally a low-confidence, best-effort structural
 *      signal (a paraphrased near-duplicate has no reliable cheap detector
 *      in Thai without a tokenizer/fuzzy-match library, which this guard
 *      deliberately does NOT reach for — see "no clever heuristics" below).
 *
 * DELIBERATELY NOT attempted: fuzzy/edit-distance or n-gram similarity
 * scoring between genre and title. It was measured against this product's
 * real data during this fix and rejected: short Thai strings produce noisy,
 * coincidental similarity scores (e.g. two UNRELATED short strings can score
 * higher than a real polluted pair), which is exactly the false-positive
 * risk this guard must not take on legitimate Thai genre text. Structural
 * signals (1)-(3) above are the conservative, defensible alternative.
 *
 * Consumers:
 *  - `server/routers/verticalDramaSeries.ts`'s `createSeriesInput` schema —
 *    rejects a polluted `genre` at series creation (BAD_REQUEST via zod
 *    `superRefine`). There is currently no separate "update genre" mutation
 *    (`updateSeriesInput` does not carry a `genre` field), so `create` is the
 *    only write path that needs this guard today.
 *  - `server/services/verticalDramaStoryBible.ts` — every `Genre: ${genre}`
 *    prompt-emit site routes through one shared helper
 *    (`buildGenrePromptLine`, colocated there) that calls `isGenrePolluted`
 *    and omits the `Genre:` line entirely when polluted, rather than
 *    emitting a second conflicting title into the prompt.
 */

const GENRE_SENTENCE_SHAPE_MARKERS = [":", "…", "...", "?", "!"] as const;

/**
 * Above this length (AND containing at least one space — see file doc
 * comment, rule 3), a genre value is treated as logline-shaped rather than
 * genre-shaped. Chosen empirically: every legitimate genre value surveyed
 * for this fix (single compound Thai genre words, and realistic 3-4 tag
 * space-separated genre combinations) stayed at or below 32 characters; the
 * one known-polluted row this rule targets (series 16) is 41 characters.
 */
const GENRE_LOGLINE_LENGTH_THRESHOLD = 40;

function normalizeGenreOrTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export type GenrePollutionReason =
  | "duplicate_of_title"
  | "sentence_shaped"
  | "logline_length";

/**
 * Returns the specific reason `genre` looks polluted (title/logline-shaped
 * rather than genre-shaped) relative to `title`, or `null` when `genre` is
 * absent/blank or looks like a genuine genre label. Pure, no I/O — safe to
 * call from both the zod schema (server) and the wizard UI (client).
 */
export function detectGenrePollution(
  genre: string | null | undefined,
  title: string | null | undefined
): GenrePollutionReason | null {
  const normalizedGenre = genre ? normalizeGenreOrTitle(genre) : "";
  if (!normalizedGenre) return null;

  const normalizedTitle = title ? normalizeGenreOrTitle(title) : "";
  if (
    normalizedTitle &&
    normalizedGenre.toLowerCase() === normalizedTitle.toLowerCase()
  ) {
    return "duplicate_of_title";
  }

  if (
    GENRE_SENTENCE_SHAPE_MARKERS.some(marker =>
      normalizedGenre.includes(marker)
    )
  ) {
    return "sentence_shaped";
  }

  if (
    normalizedGenre.length > GENRE_LOGLINE_LENGTH_THRESHOLD &&
    normalizedGenre.includes(" ")
  ) {
    return "logline_length";
  }

  return null;
}

/** Convenience boolean wrapper over `detectGenrePollution` for call sites that only need a yes/no (e.g. the prompt-emit guard). */
export function isGenrePolluted(
  genre: string | null | undefined,
  title: string | null | undefined
): boolean {
  return detectGenrePollution(genre, title) !== null;
}

/** User-facing (Thai) validation message per reason, for the `createSeriesInput` zod issue and the wizard's inline field error. */
export function genrePollutionErrorMessage(
  reason: GenrePollutionReason
): string {
  switch (reason) {
    case "duplicate_of_title":
      return "แนวเรื่อง (genre) ต้องไม่ซ้ำกับชื่อเรื่อง — กรุณาระบุแนวเรื่องสั้น ๆ เช่น โรแมนติก, ดราม่า, ระทึกขวัญ";
    case "sentence_shaped":
      return "แนวเรื่องนี้ดูเหมือนพล็อตย่อหรือชื่อเรื่องสำรอง (มีเครื่องหมาย : … ? หรือ !) — กรุณาระบุแนวเรื่องสั้น ๆ แทนเนื้อเรื่อง";
    case "logline_length":
      return "แนวเรื่องยาวเกินไปสำหรับป้ายแนวเรื่อง ดูเหมือนพล็อตย่อมากกว่าแนวเรื่อง — กรุณาระบุแนวเรื่องสั้น ๆ เช่น โรแมนติกดราม่า";
    default:
      return "แนวเรื่องไม่ถูกต้อง";
  }
}
