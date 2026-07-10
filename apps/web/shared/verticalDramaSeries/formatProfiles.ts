/**
 * Vertical Drama Series — length-aware format profiles (task #23, added
 * 2026-07-08).
 *
 * Owner's product concern: "ซีรีส์สั้นมาก 3 ตอน คิดได้ดีเทียบกันไหม" — a
 * 3-episode series must plan/think as well as a 20-episode one. Before this
 * module, deep-draft generation prompts, the premium judge's floors, and the
 * season dramaturgy critic's deterministic thresholds all silently assumed
 * long-season pacing (e.g. "a key character can wait until roughly a third
 * of the way in" makes sense for a 20-episode season and is actively wrong
 * for a 3-episode one). This module is the SINGLE source of truth for how
 * those consumers should behave differently for a short/ultra-short season.
 *
 * Pure, side-effect-free, server-import-free (mirrors every other module in
 * this barrel's own "no server-only imports — safe to import from the
 * browser bundle" rule — see `./index.ts`'s header) — safe to import from
 * both `server/services/verticalDramaStoryBible.ts` and client components
 * (e.g. `VerticalDramaDeepStoryDraftsPanel.tsx`'s confirm-dialog chip).
 *
 * ROLLOUT (TEMPORARY — remove this paragraph once resolved): every real
 * caller threads a `formatProfilesEnabled` boolean (default `false`) rather
 * than importing a real feature-flag check directly, because
 * `shared/featureFlags.ts` and `client/src/components/admin/
 * tenantFeatureFlagGroups.ts` were being concurrently edited by another
 * agent (adding `verticalDramaSeriesAdBannerOverlay`) at the time this
 * module was written, and touching those two files here would have
 * collided. See `VD_FORMAT_PROFILES_ROLLOUT` below for the exact TODO — the
 * conductor should register flag F131X `verticalDramaSeriesFormatProfiles`
 * and swap every `formatProfilesEnabled` call-site gate from a hardcoded/
 * flag-pending value to the real flag check. Each call site is a 2-line
 * change (resolve the flag, pass it as `formatProfilesEnabled`) — see the
 * call-site list in this task's Result Report.
 */

/**
 * TODO(conductor, F131X): register the `verticalDramaSeriesFormatProfiles`
 * feature flag in `shared/featureFlags.ts` (and its admin group entry in
 * `client/src/components/admin/tenantFeatureFlagGroups.ts`), then swap every
 * `formatProfilesEnabled` call site (see the Result Report for this task)
 * from its current hardcoded/omitted `false` default to a real
 * `isFeatureEnabled("verticalDramaSeriesFormatProfiles", tenantId)`-style
 * check. This marker exists so a repo-wide search for
 * `VD_FORMAT_PROFILES_ROLLOUT` finds every place that still needs the swap.
 */
export const VD_FORMAT_PROFILES_ROLLOUT = "flag_pending" as const;

/** The 3 length tiers a series' planned episode count resolves to. */
export const VERTICAL_DRAMA_FORMAT_PROFILE_TIERS = [
  "ultra_short",
  "short",
  "standard",
] as const;

export type VerticalDramaFormatProfileTier =
  (typeof VERTICAL_DRAMA_FORMAT_PROFILE_TIERS)[number];

/** `plannedEpisodeCount <= this` resolves to `"ultra_short"`. */
export const VD_FORMAT_PROFILE_ULTRA_SHORT_MAX_EPISODES = 5;
/** `plannedEpisodeCount` above the ultra-short ceiling but `<= this` resolves to `"short"`; anything higher (or an unusable input) resolves to `"standard"`. */
export const VD_FORMAT_PROFILE_SHORT_MAX_EPISODES = 12;

/**
 * Per-episode cold-open hook requirement — how quickly an episode must land
 * its hook, and whether that's even a hard requirement at this tier.
 */
export type VerticalDramaFormatProfileHookRule = {
  /** Whether shot 1 of every episode MUST function as a cold-open hook (vs. standard pacing, where a slower establishing opening is acceptable). */
  requireColdOpenHook: boolean;
  /** The hook must land within this many seconds of the episode starting. */
  hookWithinSeconds: number;
};

/**
 * Season dramaturgy critic (`analyzeSeasonDramaturgy` in
 * `server/services/verticalDramaStoryBible.ts`) threshold overrides. Each
 * field mirrors one of that function's existing hardcoded constants
 * (`VD_DRAMATURGY_LATE_INTRO_DIVISOR`/`VD_DRAMATURGY_TACTIC_REPEAT_STREAK`/
 * the "any decision, ever" agency bar) but as an ABSOLUTE, tier-fixed value
 * instead of a formula that scales with total episode count — a fixed bar
 * reads correctly across the whole tier's episode-count band, where a
 * formula like `ceil(total/3)` would drift depending on exactly how many
 * episodes a "short" season happens to have.
 *
 * IMPORTANT: `analyzeSeasonDramaturgy` only reads these fields when a
 * non-`"standard"`-tier profile is explicitly passed to it — for an absent
 * profile OR a `"standard"`-tier one, it always falls back to its own
 * original formulas, so these values are simply unused (and therefore
 * inert/safe) for the `"standard"` tier's own profile object.
 */
export type VerticalDramaFormatProfileDramaturgy = {
  /**
   * A roster ("key") character's first meaningful appearance must be at or
   * before this episode number, or `key_character_late_intro` fires.
   */
  keyCharacterLateIntroMaxEpisode: number;
  /**
   * The same antagonist tactic repeated across this many (or more)
   * CONSECUTIVE episodes fires `antagonist_tactic_repetition`.
   */
  antagonistTacticRepetitionWindow: number;
  /**
   * Minimum `character_decisions` a speaking roster character must
   * accumulate across the season for `character_agency_zero_decisions` to
   * NOT fire (generalizes the original "zero, ever" bar — i.e. minimum 1 —
   * into a configurable minimum).
   */
  agencyMinDecisionsBeforeFinale: number;
};

/** Premium judge (`meetsPremiumDraftFloor`) per-dimension floor adjustment. */
export type VerticalDramaFormatProfileJudge = {
  /**
   * Added to `VD_PREMIUM_DRAFT_MIN_DIMENSION` for the `hook_strength`
   * dimension ONLY — every other dimension's floor is unaffected. Positive
   * = stricter (a higher score is required to pass).
   */
  hookStrengthFloorDelta: number;
};

/** Product tie-in cadence, prorated to a short season's actual length. */
export type VerticalDramaFormatProfileTieIn = {
  /**
   * Prorates the admin-configured `maxEpisodesWithTieInPerTenEpisodes` cap
   * (`perTenCap`) down to `plannedCount`'s actual length:
   * `ceil(perTenCap * plannedCount / 10)`, floored at 1 whenever
   * `plannedCount >= 3` (so a short season is never accidentally rounded
   * down to zero tie-in episodes). Same formula regardless of tier —
   * proration is a function of season LENGTH, not of the tier label itself
   * — every tier's profile delegates to the same implementation. Never
   * throws; negative/non-finite inputs clamp to 0.
   */
  maxEpisodesWithTieIn: (plannedCount: number, perTenCap: number) => number;
};

/** A resolved, tier-specific set of generation/critique/judge/tie-in knobs for one series' planned episode count. */
export type VerticalDramaFormatProfile = {
  tier: VerticalDramaFormatProfileTier;
  /** Thai display name for this tier (e.g. the client confirm-dialog chip). English display copy is derived from `tier` directly by callers — see `deepStoryDraftsFormatProfileChipText`. */
  nameTh: string;
  /** Deep-draft generation guidance (Thai) — injected into the LLM prompt as the "FORMAT PROFILE" block for non-`"standard"` tiers. */
  beatDensityGuidanceTh: string;
  /** Deep-draft generation guidance (English) — used for non-Thai-locale series. */
  beatDensityGuidanceEn: string;
  perEpisodeHookRule: VerticalDramaFormatProfileHookRule;
  dramaturgy: VerticalDramaFormatProfileDramaturgy;
  judge: VerticalDramaFormatProfileJudge;
  tieIn: VerticalDramaFormatProfileTieIn;
};

/**
 * Clamps to a non-negative integer; non-finite (`NaN`/`Infinity`) or
 * negative inputs become `0`. Shared by `proratedMaxEpisodesWithTieIn` and
 * `resolveVerticalDramaFormatProfile` so both stay equally defensive against
 * garbage input — NEVER throws.
 */
function clampNonNegativeInt(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/**
 * Shared `tieIn.maxEpisodesWithTieIn` implementation for every tier — see
 * `VerticalDramaFormatProfileTieIn.maxEpisodesWithTieIn`'s own doc comment
 * for the formula. Exported (not just attached to the profile objects) so
 * `resolveTieInEpisodeBudget` below can delegate to the exact same function.
 */
function proratedMaxEpisodesWithTieIn(
  plannedCount: number,
  perTenCap: number
): number {
  const safePlannedCount = clampNonNegativeInt(plannedCount);
  const safePerTenCap = clampNonNegativeInt(perTenCap);
  const prorated = Math.ceil((safePerTenCap * safePlannedCount) / 10);
  return safePlannedCount >= 3 ? Math.max(1, prorated) : prorated;
}

const SHARED_TIE_IN: VerticalDramaFormatProfileTieIn = {
  maxEpisodesWithTieIn: proratedMaxEpisodesWithTieIn,
};

/**
 * `"ultra_short"` (<= `VD_FORMAT_PROFILE_ULTRA_SHORT_MAX_EPISODES` planned
 * episodes, e.g. a 3-episode season) — the owner's specific concern. With so
 * few episodes, there is no runway for a slow-burn structure: every episode
 * must do the narrative work of several standard episodes, every key
 * character must already be on screen, and the premium judge should demand
 * a stronger cold open than usual.
 */
const VD_FORMAT_PROFILE_ULTRA_SHORT: VerticalDramaFormatProfile = {
  tier: "ultra_short",
  nameTh: "ซีรีส์สั้นมาก",
  // Dramaturgical reason: with only 3-5 total episodes, an episode that
  // exists purely to "set up" a later payoff wastes a fifth (or a third) of
  // the ENTIRE season — there is no slack for filler. Cold-opening mid-event
  // (in medias res) is required because there is no spare runtime for a slow
  // establishing wind-up either.
  beatDensityGuidanceTh:
    "ทุกตอนต้องเดินเรื่องเทียบเท่า 2-3 ตอนปกติ ห้ามมีตอน filler และห้ามมีตอนที่ทำหน้าที่ปูพื้นเฉยๆ โดยไม่ขยับพล็อต เปิดเรื่องกลางเหตุการณ์ (in medias res) ทันทีตั้งแต่ช็อตแรกของทุกตอน",
  beatDensityGuidanceEn:
    "Every episode must carry the narrative weight of 2-3 standard episodes — no filler episodes, and no episode that exists purely to set up a later one without moving the plot itself. Open in medias res, mid-event, from shot 1 of every episode.",
  perEpisodeHookRule: {
    // Dramaturgical reason: a viewer deciding whether to keep watching a
    // 3-5 episode series makes that call almost immediately — there are no
    // "slow episode 2, it gets better later" second chances in a season this
    // short, so the hook window is the tightest of the 3 tiers.
    requireColdOpenHook: true,
    hookWithinSeconds: 3,
  },
  dramaturgy: {
    // Dramaturgical reason: in a 3-episode season, episode 2 is already the
    // MIDDLE of the whole story — a character with real narrative weight
    // introduced there (let alone episode 3) has denied the audience almost
    // all their time to invest before the season is over. Only an episode-1
    // introduction counts as "on time".
    keyCharacterLateIntroMaxEpisode: 1,
    // Dramaturgical reason: with a season this short, the antagonist simply
    // doesn't have many episodes to work with at all — repeating the same
    // tactic across even 2 consecutive episodes already reads as repetitive
    // when there are only 3-5 total, versus needing a 3-episode streak to
    // read that way in a long season.
    antagonistTacticRepetitionWindow: 2,
    // Dramaturgical reason: unchanged from the original "at least one
    // decision, ever" bar — an ultra-short season already has so little
    // screen time budget per character that raising the bar further would
    // punish the format itself rather than genuinely weak writing.
    agencyMinDecisionsBeforeFinale: 1,
  },
  judge: {
    // Dramaturgical reason: since the cold-open hook is the single highest-
    // leverage craft element in a 3-5 episode season (see
    // `perEpisodeHookRule` above), the premium judge should refuse to pass a
    // draft whose hook is merely "adequate" the way it would for a standard
    // season — one dimension point stricter than the shared floor.
    hookStrengthFloorDelta: 1,
  },
  tieIn: SHARED_TIE_IN,
};

/**
 * `"short"` (6-12 planned episodes) — meaningfully more room than
 * `"ultra_short"`, but still far more compressed than a standard season;
 * every episode still needs to earn its place.
 */
const VD_FORMAT_PROFILE_SHORT: VerticalDramaFormatProfile = {
  tier: "short",
  nameTh: "ซีรีส์สั้น",
  // Dramaturgical reason: a 6-12 episode season can afford the occasional
  // slower beat, but not a whole episode that is pure transition — every
  // episode still needs to visibly move the plot or a relationship forward.
  beatDensityGuidanceTh:
    "แต่ละตอนต้องเดินเรื่องเข้มข้นกว่าซีซั่นยาวทั่วไป หลีกเลี่ยงตอนที่เป็นเพียงบทเปลี่ยนผ่านหรือพักจังหวะล้วนๆ ทุกตอนต้องขยับพล็อตหรือความสัมพันธ์อย่างชัดเจนอย่างน้อยหนึ่งจุด",
  beatDensityGuidanceEn:
    "Each episode must carry more narrative density than a standard-length season — avoid pure transition or breather episodes; every episode must visibly move the plot or a relationship forward by at least one concrete beat.",
  perEpisodeHookRule: {
    // Dramaturgical reason: still a hard requirement (unlike standard), but
    // slightly more breathing room than ultra_short's 3s since a 6-12
    // episode season has already earned a little viewer trust by episode 2+.
    requireColdOpenHook: true,
    hookWithinSeconds: 5,
  },
  dramaturgy: {
    // Dramaturgical reason: a 6-12 episode season needs its ensemble
    // established within roughly the first sixth of the season at the
    // latest. A FIXED episode-2 bar (rather than a formula that loosens as
    // the season approaches 12 episodes) keeps this consistently tight
    // across the whole tier instead of drifting toward standard-tier
    // laxness at the top of the band.
    keyCharacterLateIntroMaxEpisode: 2,
    // Dramaturgical reason: same reasoning as ultra_short — a season this
    // length still doesn't have enough total episodes to "hide" a 3-episode
    // repeat streak the way a 20+ episode season can.
    antagonistTacticRepetitionWindow: 2,
    // Dramaturgical reason: unchanged from the standard "at least one,
    // ever" bar — see ultra_short's identical field for why this doesn't
    // scale with tier.
    agencyMinDecisionsBeforeFinale: 1,
  },
  judge: {
    // Dramaturgical reason: a 6-12 episode season has enough runway that the
    // shared judge floor is already adequate — only the most compressed tier
    // (ultra_short) needs an extra-strict hook bar.
    hookStrengthFloorDelta: 0,
  },
  tieIn: SHARED_TIE_IN,
};

/**
 * `"standard"` (>= `VD_FORMAT_PROFILE_SHORT_MAX_EPISODES` + 1 planned
 * episodes, e.g. a typical 20+ episode season) — and also the fallback for
 * any unusable/garbage `plannedEpisodeCount` input (see
 * `resolveVerticalDramaFormatProfile`'s own doc comment). Every consumer in
 * `server/services/verticalDramaStoryBible.ts` treats this tier (or an
 * altogether absent profile) as "run the original, pre-task-#23 behavior,
 * byte-identical" — the numeric fields below are therefore representative
 * defaults, documented for completeness, but are NOT read directly by
 * `analyzeSeasonDramaturgy`/`meetsPremiumDraftFloor` for this tier (those
 * always fall back to their own original formulas/constants instead, which
 * is what guarantees the byte-identical regression protection).
 */
const VD_FORMAT_PROFILE_STANDARD: VerticalDramaFormatProfile = {
  tier: "standard",
  nameTh: "ซีซั่นมาตรฐาน",
  beatDensityGuidanceTh:
    "ใช้จังหวะการเดินเรื่องมาตรฐาน สามารถมีตอนที่เน้นปูพื้นฐาน พักจังหวะ หรือขยายความสัมพันธ์รองได้ตามความเหมาะสมของซีซั่นยาว",
  beatDensityGuidanceEn:
    "Use standard pacing — setup-heavy, breather, or secondary-relationship-building episodes are acceptable where appropriate for a full-length season.",
  perEpisodeHookRule: {
    requireColdOpenHook: false,
    hookWithinSeconds: 8,
  },
  dramaturgy: {
    // Representative only — see doc comment above. The real consumer uses
    // `Math.ceil(totalEpisodes / VD_DRAMATURGY_LATE_INTRO_DIVISOR)` (divisor
    // 3) for this tier, which is why this is left as a plausible mid-season
    // value rather than derived from any specific `plannedEpisodeCount`.
    keyCharacterLateIntroMaxEpisode: 4,
    // Representative only — mirrors `VD_DRAMATURGY_TACTIC_REPEAT_STREAK` (3).
    antagonistTacticRepetitionWindow: 3,
    // Representative only — mirrors the original "at least one, ever" bar.
    agencyMinDecisionsBeforeFinale: 1,
  },
  judge: {
    hookStrengthFloorDelta: 0,
  },
  tieIn: SHARED_TIE_IN,
};

/**
 * Resolves the length-tier profile for a series' planned episode count.
 * NEVER throws — any non-finite, non-positive, or otherwise unusable input
 * (NaN, Infinity, 0, a negative number, etc.) clamps to the `"standard"`
 * profile (the same profile every consumer already treats as "no special
 * behavior"), which is the safe default for a value we can't meaningfully
 * classify as short. A non-integer count (e.g. `3.7`) floors to `3` rather
 * than being treated as unusable, since callers may pass computed values.
 *
 * Boundaries (spec): `<= 5` -> `"ultra_short"`, `6..12` -> `"short"`,
 * `>= 13` -> `"standard"`.
 */
export function resolveVerticalDramaFormatProfile(
  plannedEpisodeCount: number
): VerticalDramaFormatProfile {
  const isUsableCount =
    typeof plannedEpisodeCount === "number" &&
    Number.isFinite(plannedEpisodeCount) &&
    plannedEpisodeCount >= 1;
  if (!isUsableCount) {
    return VD_FORMAT_PROFILE_STANDARD;
  }
  const normalized = Math.floor(plannedEpisodeCount);
  if (normalized <= VD_FORMAT_PROFILE_ULTRA_SHORT_MAX_EPISODES) {
    return VD_FORMAT_PROFILE_ULTRA_SHORT;
  }
  if (normalized <= VD_FORMAT_PROFILE_SHORT_MAX_EPISODES) {
    return VD_FORMAT_PROFILE_SHORT;
  }
  return VD_FORMAT_PROFILE_STANDARD;
}

/**
 * Ergonomic top-level wrapper around `profile.tieIn.maxEpisodesWithTieIn` —
 * lets a caller that already has a resolved `profile` compute a tie-in
 * budget without reaching into its shape. See
 * `VerticalDramaFormatProfileTieIn.maxEpisodesWithTieIn`'s own doc comment
 * for the formula; identical across every tier (proration is a function of
 * `plannedCount`, not of the tier itself).
 *
 * NOTE for the conductor (see this task's Result Report for the full list):
 * `maxEpisodesWithTieInPerTenEpisodes` (the `perTenCap` this function
 * prorates) is currently consumed ONLY in
 * `server/services/verticalDramaProductTieIn.ts` and
 * `server/routers/verticalDramaEpisodes.ts` — both outside this task's
 * writable scope. Neither file calls this helper yet; wiring it in is
 * tracked as follow-up work (#22/#30-A2).
 */
export function resolveTieInEpisodeBudget(
  profile: VerticalDramaFormatProfile,
  plannedCount: number,
  perTenCap: number
): number {
  return profile.tieIn.maxEpisodesWithTieIn(plannedCount, perTenCap);
}
