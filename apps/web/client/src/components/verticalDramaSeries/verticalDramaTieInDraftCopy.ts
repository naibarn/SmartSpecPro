/**
 * Vertical Drama Series — season-level product tie-in DRAFT awareness copy
 * dictionary (task #22, spec §7.7.2/§7.7.3, added 2026-07-09).
 *
 * Deliberately a STANDALONE file, NOT importing from `verticalDramaCopy.ts`
 * (owned by another concurrent task) — same `pickCopy` convention as
 * `verticalDramaAdBannerCopy.ts`, own lang type, zero coupling. Covers:
 *  - `StoryBibleOverviewCard`'s per-episode tie-in badge draft-awareness
 *    states (planned+marked = normal, planned-but-draft-unmarked = warning).
 *  - `VerticalDramaDeepStoryDraftsActions`'s generate/extend success toast —
 *    the tie-in reconciliation summary line, appended only when the job
 *    result carries a `tieInMismatchCount` (i.e. tie-in draft awareness was
 *    active this run).
 */

export type VerticalDramaTieInDraftLang = "th" | "en";

/** Pick a bilingual string for the active language — mirrors `verticalDramaCopy.ts`'s `pickCopy` exactly, kept as a local copy so this file has no import dependency on that (concurrently-owned) file. */
export function pickCopy<T>(
  lang: VerticalDramaTieInDraftLang,
  value: { th: T; en: T },
): T {
  return lang === "th" ? value.th : value.en;
}

export const verticalDramaTieInDraftCopy = {
  /** Badge label — this episode is planned for a tie-in AND (either not yet drafted, or drafted with a shot correctly marked). Same wording #31 already shipped, kept identical so the badge's "normal" state stays visually unchanged. */
  badgePlannedNormal: { th: "มีสินค้าตามแผน", en: "Tie-in planned" },
  /** Badge label — this episode is planned for a tie-in, IS drafted, but no shot was marked as carrying the product moment (a reconciliation mismatch — see `reconcileTieInDraftMarking`). */
  badgePlannedUnmarked: {
    th: "มีสินค้าตามแผน แต่ร่างช็อตยังไม่ระบุ",
    en: "Tie-in planned — draft doesn't mark a shot yet",
  },
} as const;

/** Copy Contract: "ตรวจสอบสินค้าไม่ตรงแผน {n} ตอน — ดูรายละเอียดในตอนที่มีสินค้าตามแผน" / "n tie-in mismatch(es) found — check the flagged planned episodes". Appended to the generate/extend success toast only when `tieInMismatchCount > 0`. */
export function tieInDraftMismatchSummaryText(
  lang: VerticalDramaTieInDraftLang,
  mismatchCount: number,
): string {
  return lang === "th"
    ? `ตรวจสอบสินค้าไม่ตรงแผน ${mismatchCount} ตอน — ดูรายละเอียดในตอนที่มีสินค้าตามแผน`
    : `${mismatchCount} tie-in mismatch${mismatchCount === 1 ? "" : "es"} found — check the flagged planned episodes`;
}

/** Copy Contract: "สินค้าตามแผนตรงกับร่างช็อตครบทุกตอนแล้ว" / "Every planned tie-in matches its draft". Appended instead of the mismatch line when tie-in draft awareness was active AND `tieInMismatchCount === 0`. */
export function tieInDraftFullyReconciledText(
  lang: VerticalDramaTieInDraftLang,
): string {
  return lang === "th"
    ? "สินค้าตามแผนตรงกับร่างช็อตครบทุกตอนแล้ว"
    : "Every planned tie-in matches its draft";
}
