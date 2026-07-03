/**
 * Vertical Drama Series — Subtitle cue contracts (spec §14, §7.4).
 *
 * Pure field-only TypeScript contracts + small helpers. NO server/db imports so
 * the client can import these directly. Subtitle cues are derived from the
 * dialogue/timing plan and carry 9:16 vertical safe-area metadata. A single cue
 * may span multiple sub-shot cuts within one parent main shot and keeps ONE
 * continuous `start`/`end` across those cuts (spec §7.4).
 */

/** Vertical (9:16) caption anchor band. */
export type VerticalDramaSubtitleSafeAreaPosition = "bottom_safe" | "middle_safe" | "top_safe";

/**
 * 9:16 subtitle safe-area metadata. Margins are fractions (0..1) of the frame
 * height/width the caption must stay inside so it is not clipped by device UI or
 * overlapping a face region on a vertical phone screen.
 */
export type VerticalDramaSubtitleSafeArea = {
  position: VerticalDramaSubtitleSafeAreaPosition;
  maxLines: number;
  avoidFaceArea: boolean;
  /** Top inset as a fraction of frame height (0..1). */
  marginTopPct: number;
  /** Bottom inset as a fraction of frame height (0..1). */
  marginBottomPct: number;
  /** Left/right inset as a fraction of frame width (0..1). */
  marginSidePct: number;
};

/** Per-sub-shot safe-area validation record for a cue that spans sub-shot cuts (§7.4). */
export type VerticalDramaSubtitleSubShotSafeAreaCheck = {
  subShotNumber: number;
  valid: boolean;
  /** Reason code when invalid (localizable), e.g. `caption_outside_vertical_safe_area`. */
  reason?: string;
};

/**
 * A subtitle cue. `start`/`end` are seconds on the PARENT MAIN SHOT's local
 * timeline (0..shotDuration). A cut between sub-shots does NOT split the cue —
 * it keeps a single continuous `start`/`end` even when the visual angle changes
 * mid-cue (spec §7.4).
 */
export type VerticalDramaSubtitleCue = {
  cueId: string;
  shotNumber: number;
  speakerName?: string;
  speakerCharacterId?: string;
  text: string;
  /** Seconds within the parent main shot. */
  start: number;
  end: number;
  /** The dialogue line this cue renders, if any. */
  lineId?: string;
  safeArea: VerticalDramaSubtitleSafeArea;
  /**
   * 1-based sub-shot indices (within the parent main shot) this cue overlaps.
   * Only populated when `verticalDramaSeriesSubShots` is enabled and the parent
   * shot is decomposed; a length > 1 means the cue spans sub-shot cuts.
   */
  spansSubShotNumbers?: number[];
  /** Per-sub-shot safe-area validation for a spanning cue (§7.4). */
  safeAreaPerSubShot?: VerticalDramaSubtitleSubShotSafeAreaCheck[];
};

/** Default 9:16 caption safe area — bottom band, two lines, face-avoiding. */
export const VERTICAL_DRAMA_DEFAULT_SUBTITLE_SAFE_AREA: VerticalDramaSubtitleSafeArea = {
  position: "bottom_safe",
  maxLines: 2,
  avoidFaceArea: true,
  marginTopPct: 0.08,
  marginBottomPct: 0.12,
  marginSidePct: 0.06,
};

/** Minimal ordered sub-shot slice used to place cues on the shot-local timeline. */
export type SubtitleSubShotSlice = {
  subShotNumber: number;
  durationSeconds: number;
};

const EPS = 1e-9;

/**
 * Compute which sub-shots (1-based numbers) a `[start, end)` window overlaps
 * within the parent main shot. Sub-shot durations are laid end-to-end in order
 * and must sum to the parent shot duration (spec §7.4). The cue's `start`/`end`
 * are NOT modified — this only reports the spanned cuts so the caption stays a
 * single continuous cue across the boundaries.
 */
export function computeSubShotSpans(
  start: number,
  end: number,
  subShots: SubtitleSubShotSlice[],
): number[] {
  const spanned: number[] = [];
  let offset = 0;
  for (const s of subShots) {
    const sliceStart = offset;
    const sliceEnd = offset + s.durationSeconds;
    // Overlap test for half-open intervals [start,end) vs [sliceStart,sliceEnd).
    if (start < sliceEnd - EPS && end > sliceStart + EPS) {
      spanned.push(s.subShotNumber);
    }
    offset = sliceEnd;
  }
  return spanned;
}

/**
 * Validate a cue's 9:16 safe area against EACH sub-shot it overlaps (spec §7.4).
 * The same safe-area rule applies per sub-shot so the caption stays inside the
 * vertical safe area through the cuts. `faceRegionBySubShot` optionally reports
 * whether a face occupies the caption band in a given sub-shot; when the cue's
 * safe area is `avoidFaceArea` and a face overlaps, that sub-shot is invalid.
 */
export function validateCueSafeAreaPerSubShot(
  cue: Pick<VerticalDramaSubtitleCue, "start" | "end" | "safeArea">,
  subShots: SubtitleSubShotSlice[],
  faceRegionBySubShot?: Record<number, boolean>,
): VerticalDramaSubtitleSubShotSafeAreaCheck[] {
  const spanned = computeSubShotSpans(cue.start, cue.end, subShots);
  const marginsSane =
    cue.safeArea.marginTopPct >= 0 &&
    cue.safeArea.marginBottomPct >= 0 &&
    cue.safeArea.marginSidePct >= 0 &&
    cue.safeArea.marginTopPct + cue.safeArea.marginBottomPct < 1 &&
    cue.safeArea.maxLines >= 1;
  return spanned.map((subShotNumber) => {
    if (!marginsSane) {
      return { subShotNumber, valid: false, reason: "caption_outside_vertical_safe_area" };
    }
    if (cue.safeArea.avoidFaceArea && faceRegionBySubShot?.[subShotNumber]) {
      return { subShotNumber, valid: false, reason: "caption_overlaps_face_region" };
    }
    return { subShotNumber, valid: true };
  });
}
