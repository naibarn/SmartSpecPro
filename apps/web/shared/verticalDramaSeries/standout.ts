/**
 * Vertical Drama Series — Standout Suite shared contracts (task #35,
 * `planning/vertical-drama-standout-suite/plan.md`): next-episode preview
 * spoiler-safe shot selection + Ken Burns motion seeding, the series BGM
 * library + copyright-declaration audit trail, and the series-level
 * `standoutSettings` (BGM + color grade) persisted shape.
 *
 * Pure, deterministic, provider-free, DB-free — no server/db imports, safe
 * for both client and server (same posture as `textOverlay.ts`/
 * `presetVisualIdentity.ts`). Ffmpeg-specific string/filter-graph builders
 * for the preview ladder and BGM ducking live in
 * `server/services/verticalDramaFinalRenderGraph.ts` (the engine module),
 * NOT here — this module only owns the business-logic DECISIONS (which tier,
 * which shots, which pan direction, what counts as a valid BGM library) that
 * both the server engine and the client UI need to agree on.
 *
 * DB-touching resolution (loading the next episode's actual clips/start-frame
 * assets, the series' persisted `standoutSettings`, etc.) lives in
 * `server/services/verticalDramaStandoutResolution.ts` — mirrors the
 * `textOverlay.ts` (pure) / `verticalDramaTextOverlayResolution.ts`
 * (DB-touching) split established by task #34.
 */

import { z } from "zod";
import { verticalDramaPresetColorGradeSchema } from "./presetVisualIdentity";

/* -------------------------------------------------------------------------- */
/* Next-episode preview — spoiler-safe shot selection (plan.md §1)            */
/* -------------------------------------------------------------------------- */

/** Shots 1-3 — the "hook zone": always safe, never resolves anything. */
const VD_PREVIEW_HOOK_ZONE_SHOTS = [1, 2, 3] as const;
/** Shots 4-6 — "mid-tension": exactly one is drawn from here (when available). */
const VD_PREVIEW_TENSION_ZONE_SHOTS = [4, 5, 6] as const;
/**
 * NEVER selected (plan.md §1 "ห้ามแตะช็อต 8-9"): the cliffhanger/resolution
 * zone of the NEXT episode is a direct spoiler of ITS OWN ending. Shot 7 is
 * also never selected — not because it is unsafe, but because the picker
 * only ever draws from the two defined pools above (hook zone + one
 * mid-tension shot); anything outside those two pools (7, 8, 9, 10+) is
 * simply never a candidate. Exported for the one caller
 * (`verticalDramaStandoutResolution.ts`) that reports WHY a given shot was
 * excluded in its skip-reason diagnostics.
 */
export const VD_PREVIEW_FORBIDDEN_SHOTS = [8, 9] as const;

export const VD_NEXT_EPISODE_PREVIEW_MIN_SHOTS = 2;
export const VD_NEXT_EPISODE_PREVIEW_MAX_SHOTS = 3;

export interface VdSpoilerSafeShotSelectionOptions {
  /** Draft scorecard / premium judge `hook_strength` per shot, when available
   *  (plan.md §1 "ถ้ามี draft scorecard/premium metrics → เรียงตาม
   *  hook_strength; ไม่มีก็ตามลำดับช็อต"). Absent (or a shot missing from the
   *  map) falls back to plain ascending shot order for ranking purposes. */
  hookStrengthByShot?: Record<number, number>;
}

/** Rank the shots of ONE zone that are actually available, highest
 *  `hookStrength` first (ties broken by ascending shot number for
 *  determinism), or plain ascending shot order when no scorecard is given. */
function rankShotsForZone(
  zoneShots: readonly number[],
  available: ReadonlySet<number>,
  opts: VdSpoilerSafeShotSelectionOptions
): number[] {
  const candidates = zoneShots.filter(shot => available.has(shot));
  const scored = opts.hookStrengthByShot;
  if (scored) {
    return [...candidates].sort((a, b) => {
      const diff = (scored[b] ?? 0) - (scored[a] ?? 0);
      return diff !== 0 ? diff : a - b;
    });
  }
  return [...candidates].sort((a, b) => a - b);
}

/**
 * Deterministic, spoiler-safe hook-shot picker for the next-episode preview
 * (plan.md §1): up to 2 shots from the 1-3 hook zone + up to 1 shot from the
 * 4-6 mid-tension zone (`VD_NEXT_EPISODE_PREVIEW_MAX_SHOTS` total), NEVER
 * shots 8-9 or anything outside those two zones. `availableShotNumbers` is
 * whatever the CALLER already knows is eligible for the current ladder tier
 * (e.g. shots with a completed clip, or shots with an approved start-frame
 * image) — this function does no I/O and trusts that input as-is.
 *
 * The final result is always returned in ASCENDING shot-number (story)
 * order, regardless of the ranking used to CHOOSE which shots make the cut
 * — a teaser should still play in story order, just spoiler-trimmed.
 */
export function selectSpoilerSafeHookShots(
  availableShotNumbers: number[],
  opts: VdSpoilerSafeShotSelectionOptions = {}
): number[] {
  const available = new Set(availableShotNumbers);
  const hookPicks = rankShotsForZone(
    VD_PREVIEW_HOOK_ZONE_SHOTS,
    available,
    opts
  ).slice(0, 2);
  const tensionPicks = rankShotsForZone(
    VD_PREVIEW_TENSION_ZONE_SHOTS,
    available,
    opts
  ).slice(0, 1);
  return [...hookPicks, ...tensionPicks]
    .sort((a, b) => a - b)
    .slice(0, VD_NEXT_EPISODE_PREVIEW_MAX_SHOTS);
}

/**
 * The 3-tier asset ladder (plan.md §1 "บันไดวัสดุ 3 ขั้น"): A. real clips
 * (≥2 spoiler-safe shots already have a completed video) — free, cut
 * straight from what's rendered; B. start-frame images (≥2 spoiler-safe
 * shots have an approved start-frame image but no video yet) — free, Ken
 * Burns montage; C. none — the next episode has neither, no preview segment
 * is appended (the episode simply ends at its end-card, same as before this
 * feature).
 */
export type VdNextEpisodePreviewTier = "real_clips" | "start_frames" | "none";

export interface VdNextEpisodePreviewLadderInput {
  /** Next episode's shot numbers that currently have a completed rendered clip. */
  availableClipShotNumbers: number[];
  /** Next episode's shot numbers that currently have an approved start-frame image. */
  availableStartFrameShotNumbers: number[];
  hookStrengthByShot?: Record<number, number>;
}

export interface VdNextEpisodePreviewLadderResult {
  tier: VdNextEpisodePreviewTier;
  /** Ascending shot-number order; empty when `tier === "none"`. */
  shotNumbers: number[];
}

/**
 * Resolve which ladder tier applies and which shots to use, from ALREADY-
 * LOADED availability data (the caller — `verticalDramaStandoutResolution.ts`
 * — is responsible for querying the next episode's `motionPromptPack`/
 * `startFramePlan`). Tier A is tried first; falls through to B, then C.
 */
export function resolveNextEpisodePreviewLadder(
  input: VdNextEpisodePreviewLadderInput
): VdNextEpisodePreviewLadderResult {
  const opts = { hookStrengthByShot: input.hookStrengthByShot };
  const clipShots = selectSpoilerSafeHookShots(
    input.availableClipShotNumbers,
    opts
  );
  if (clipShots.length >= VD_NEXT_EPISODE_PREVIEW_MIN_SHOTS) {
    return { tier: "real_clips", shotNumbers: clipShots };
  }
  const frameShots = selectSpoilerSafeHookShots(
    input.availableStartFrameShotNumbers,
    opts
  );
  if (frameShots.length >= VD_NEXT_EPISODE_PREVIEW_MIN_SHOTS) {
    return { tier: "start_frames", shotNumbers: frameShots };
  }
  return { tier: "none", shotNumbers: [] };
}

/** Per-segment duration (seconds) for `segmentCount` preview segments, tuned
 *  so the TOTAL always lands within plan.md §1's 5-8s window: 2 segments ->
 *  2.5s each (5.0s, the floor); 3 segments -> 2.4s each (7.2s). Both are
 *  within the "~2-2.5s each" per-segment guidance too. */
export function nextEpisodePreviewSegmentDurationSec(
  segmentCount: number
): number {
  return segmentCount <= 2 ? 2.5 : 2.4;
}

/** Why no preview segment was appended (or, for the season-batch response,
 *  why one episode was silently skipped — plan.md §1 "batch season render:
 *  ...ข้ามเงียบ ๆ + รายงานใน response"). */
export const VD_NEXT_EPISODE_PREVIEW_SKIP_REASONS = [
  "next_episode_not_found",
  "next_episode_no_eligible_shots",
] as const;
export type VdNextEpisodePreviewSkipReason =
  (typeof VD_NEXT_EPISODE_PREVIEW_SKIP_REASONS)[number];

/* -------------------------------------------------------------------------- */
/* Ken Burns motion — deterministic, shotNumber-seeded (plan.md §1)           */
/* -------------------------------------------------------------------------- */

export const VD_KEN_BURNS_PAN_DIRECTIONS = [
  "left",
  "right",
  "up",
  "down",
] as const;
export type VdKenBurnsPanDirection =
  (typeof VD_KEN_BURNS_PAN_DIRECTIONS)[number];

export interface VdKenBurnsMotion {
  panDirection: VdKenBurnsPanDirection;
  /** `true` = slow zoom IN over the segment's duration; `false` = zoom OUT. */
  zoomIn: boolean;
}

/**
 * Deterministic Ken Burns pan/zoom pick, seeded from `shotNumber` alone —
 * NEVER `Math.random()` (plan.md §1 "Ken Burns = zoompan per image (สุ่มทิศ
 * จาก index — ไม่ใช้ Math.random ใน args builder, ใช้ shotNumber-seeded)"),
 * so the SAME shot always renders the SAME motion across retries/re-renders
 * and every call site (including unit tests) gets byte-identical, assertable
 * output.
 */
export function kenBurnsMotionForShot(shotNumber: number): VdKenBurnsMotion {
  const safe = Math.max(0, Math.trunc(shotNumber));
  const panDirection =
    VD_KEN_BURNS_PAN_DIRECTIONS[safe % VD_KEN_BURNS_PAN_DIRECTIONS.length]!;
  const zoomIn = safe % 2 === 0;
  return { panDirection, zoomIn };
}

/* -------------------------------------------------------------------------- */
/* BGM library — copyright declaration audit trail (plan.md §2)               */
/* -------------------------------------------------------------------------- */

/**
 * The 3 declaration choices (plan.md §2 "บังคับติ๊กประกาศสิทธิ์ก่อนใช้"):
 * `"own"` — the uploader's own work / commissioned work; `"licensed"` — a
 * commercial license was purchased; `"royalty_free"` — a royalty-free track.
 * Deliberately NOT optional/defaulted anywhere this is used (zod enum, no
 * `.default()`) — plan.md is explicit that adding a track REQUIRES an
 * affirmative declaration, never an implicit one.
 */
export const VD_BGM_DECLARED_LICENSES = [
  "own",
  "licensed",
  "royalty_free",
] as const;
export type VdBgmDeclaredLicense = (typeof VD_BGM_DECLARED_LICENSES)[number];

/** Hard cap (plan.md §2 "≤10 แทร็ก"). */
export const VD_BGM_LIBRARY_MAX_TRACKS = 10;

/**
 * One BGM track's audit-trail record (plan.md §2 "{fileHash, declaredLicense,
 * userId, timestamp} ลง jsonb เป็น audit trail"). `url` rides the same
 * "URL input acceptable v1" pattern the series watermark IMAGE already uses
 * (`VdSeriesWatermarkConfig.imageUrl`, `@shared/verticalDramaSeries/textOverlay.ts`)
 * — no dedicated file-upload endpoint exists for either in this codebase
 * today, so a plain URL field matches the established convention exactly.
 * `fileHash` is best-effort: v1 has no real audio file upload (URL-only), so
 * the router computes a SHA-256 of the submitted URL STRING itself (cheap,
 * deterministic, still gives the audit trail a stable per-submission
 * fingerprint) rather than fetching + hashing the remote audio bytes; a real
 * content hash is a natural v2 follow-up once BGM tracks can be uploaded as
 * files like other media assets.
 */
export const vdBgmTrackSchema = z.object({
  id: z.string().min(1).max(64),
  /** `z.string()` (not `.url()`) — same relative-path tolerance as every
   *  other asset URL field in this codebase (local storage returns
   *  `/api/storage/...` paths). */
  url: z.string().min(1).max(2048),
  title: z.string().trim().min(1).max(120),
  fileHash: z.string().max(128).optional(),
  declaredLicense: z.enum(VD_BGM_DECLARED_LICENSES),
  declaredByUserId: z.number().int().positive(),
  /** ISO-8601 timestamp string. */
  declaredAt: z.string().min(1).max(64),
});
export type VdBgmTrack = z.infer<typeof vdBgmTrackSchema>;

export const vdBgmLibrarySchema = z.object({
  tracks: z.array(vdBgmTrackSchema).max(VD_BGM_LIBRARY_MAX_TRACKS),
});
export type VdBgmLibrary = z.infer<typeof vdBgmLibrarySchema>;

export function emptyBgmLibrary(): VdBgmLibrary {
  return { tracks: [] };
}

/** Add one track to `library`. Pure — throws a plain `Error` (mapped to a
 *  tRPC error code by the router, same convention as
 *  `resolveClipsForAssembly`/`buildFinalRenderFfmpegArgs`'s own thrown
 *  errors) when the cap would be exceeded or `track.id` already exists. */
export function addBgmTrackToLibrary(
  library: VdBgmLibrary,
  track: VdBgmTrack
): VdBgmLibrary {
  if (library.tracks.length >= VD_BGM_LIBRARY_MAX_TRACKS) {
    throw new Error(
      `vd_bgm_library_full: at most ${VD_BGM_LIBRARY_MAX_TRACKS} tracks are allowed per series.`
    );
  }
  if (library.tracks.some(t => t.id === track.id)) {
    throw new Error(
      `vd_bgm_library_duplicate_id: a track with id "${track.id}" already exists.`
    );
  }
  return { tracks: [...library.tracks, track] };
}

/** Remove one track by id. Pure — a no-op (returns `library` with the same
 *  contents) when `trackId` is not present, never throws. */
export function removeBgmTrackFromLibrary(
  library: VdBgmLibrary,
  trackId: string
): VdBgmLibrary {
  return { tracks: library.tracks.filter(t => t.id !== trackId) };
}

/* -------------------------------------------------------------------------- */
/* Series-level standoutSettings — BGM + color grade (plan.md "DECISION")     */
/* -------------------------------------------------------------------------- */

/** Default intensity when color grade is first enabled (plan.md §3 slider
 *  0-100%; 70% chosen as a visible-but-not-heavy-handed starting point). */
export const VD_COLOR_GRADE_INTENSITY_DEFAULT_PCT = 70;

export const vdStandoutColorGradeSettingsSchema = z.object({
  enabled: z.boolean(),
  intensityPct: z
    .number()
    .min(0)
    .max(100)
    .default(VD_COLOR_GRADE_INTENSITY_DEFAULT_PCT),
  /** Optional per-series manual override of the resolved preset/category
   *  grade — accepted for forward-compat (v2 "custom grade" surface); the v1
   *  Settings UI only exposes `enabled` + `intensityPct` (plan.md §3
   *  "series-level toggle + intensity slider"), never this field. */
  overrides: verticalDramaPresetColorGradeSchema.partial().optional(),
});
export type VdStandoutColorGradeSettings = z.infer<
  typeof vdStandoutColorGradeSettingsSchema
>;

/**
 * Series-level Standout Suite settings (task #35). Persists as the single
 * NEW `vertical_drama_series.standoutSettings` jsonb column — one column,
 * one provenance file, covering both BGM and color grade (see plan.md's own
 * "DECISION" note on why a single combined column was chosen over two
 * separate ones: colorGrade has no natural home among the existing
 * single-purpose columns like `watermark`/`trailer`, and adding a THIRD
 * narrowly-scoped jsonb column for one small settings object was judged less
 * maintainable than one well-typed combined column for this one feature).
 */
export const vdStandoutSettingsSchema = z.object({
  bgm: vdBgmLibrarySchema.default({ tracks: [] }),
  colorGrade: vdStandoutColorGradeSettingsSchema.default({
    enabled: false,
    intensityPct: VD_COLOR_GRADE_INTENSITY_DEFAULT_PCT,
  }),
});
export type VdStandoutSettings = z.infer<typeof vdStandoutSettingsSchema>;

export function emptyStandoutSettings(): VdStandoutSettings {
  return {
    bgm: emptyBgmLibrary(),
    colorGrade: { enabled: false, intensityPct: VD_COLOR_GRADE_INTENSITY_DEFAULT_PCT },
  };
}

/** Mirrors `parseSeriesWatermarkConfig`/`parseTextOverlayPlan` — never
 *  throws; `null` for an absent/malformed column value (caller applies
 *  `?? emptyStandoutSettings()` at the call site, same convention as the
 *  watermark card's own `parseSeriesWatermarkConfig(watermark) ?? {...}`). */
export function parseStandoutSettings(
  value: unknown
): VdStandoutSettings | null {
  if (value == null) return null;
  const parsed = vdStandoutSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
