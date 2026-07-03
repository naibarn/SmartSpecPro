/**
 * Vertical Drama Series — Sub-shot (intra-shot cut) decomposition contracts (spec §7.4).
 *
 * Sub-shots subdivide a single main shot's screen time into 2-5 ordered cuts
 * whose durations SUM to the parent main-shot duration. They never change the
 * 9-shot/9-frame storyboard or the 60-second episode total. Opt-in via feature
 * flag `verticalDramaSeriesSubShots` (default off) and capability-gated.
 */

/** Feature flag key that gates sub-shot decomposition (default off). */
export const VERTICAL_DRAMA_SUB_SHOTS_FLAG = "verticalDramaSeriesSubShots" as const;

export type VerticalDramaSubShotPolicy = {
  enabled: boolean; // gated by verticalDramaSeriesSubShots; default false
  mode: "auto" | "fixed"; // "auto" tries targetPerShot as feasible; "fixed" forces it
  targetPerShot: number; // default 2-3 (auto aims here)
  maxPerShot: number; // hard cap 5
  minSubShotSeconds: number; // default 1.2 — provider-feasibility + anti-choppy floor
  perSubShotStartFrames: boolean; // default false: reframe parent start frame; true: own frames
  fallbackOnUnsupported: "fewer_sub_shots" | "single_clip"; // graceful degrade
};

export type VerticalDramaSubShot = {
  subShotNumber: number; // 1-based order within the parent shot
  parentShotNumber: number; // one of the 9 storyboard shots
  durationSeconds: number; // sub-shot durations sum to the parent main-shot duration
  cameraSetup: string; // angle / framing / lens feel / movement for this cut
  prompt: string; // motion prompt for this sub-shot
  negativeMotionPrompt?: string;
  transitionIn: "cut" | "match_cut" | "smash_cut" | "continuous";
  startFrameAssetId?: string; // optional own start frame; else derived from parent shot frame
  endFrameAssetId?: string; // optional (bridged sub-shots)
  providerClipRequestId?: string; // set when the sub-shot is its own provider clip
  status: "planned" | "ready" | "rendering" | "failed" | "skipped";
};

/** Default sub-shot policy (feature flag off — behavior unchanged). */
export const VERTICAL_DRAMA_SUB_SHOT_POLICY_DEFAULT: VerticalDramaSubShotPolicy = {
  enabled: false,
  mode: "auto",
  targetPerShot: 3,
  maxPerShot: 5,
  minSubShotSeconds: 1.2,
  perSubShotStartFrames: false,
  fallbackOnUnsupported: "fewer_sub_shots",
};

/** Hard cap on sub-shots per parent main shot (spec §7.4). */
export const VERTICAL_DRAMA_SUB_SHOT_MAX_PER_SHOT = 5;

/**
 * Compute the sub-shot count for a main shot of duration `D` in `auto` mode:
 * `N = min(targetPerShot, floor(D / minSubShotSeconds))` (spec §7.4). Result is
 * clamped to at least 1 and never exceeds `maxPerShot`.
 */
export function computeAutoSubShotCount(
  mainShotDurationSeconds: number,
  policy: Pick<VerticalDramaSubShotPolicy, "targetPerShot" | "maxPerShot" | "minSubShotSeconds">,
): number {
  const feasibleByFloor = Math.floor(mainShotDurationSeconds / policy.minSubShotSeconds);
  const n = Math.min(policy.targetPerShot, feasibleByFloor, policy.maxPerShot);
  return Math.max(1, n);
}

export type SubShotValidationResult = {
  valid: boolean;
  errors: string[];
};

/**
 * Validate that the sub-shots for a single parent main shot satisfy the §7.4
 * rules: durations sum to the parent main-shot duration, every sub-shot meets
 * `minSubShotSeconds`, and the count does not exceed `maxPerShot`.
 */
export function validateSubShotsForParent(
  mainShotDurationSeconds: number,
  subShots: Pick<VerticalDramaSubShot, "durationSeconds" | "parentShotNumber">[],
  policy: Pick<VerticalDramaSubShotPolicy, "maxPerShot" | "minSubShotSeconds">,
): SubShotValidationResult {
  const errors: string[] = [];
  const sum = subShots.reduce((acc, s) => acc + s.durationSeconds, 0);
  if (Math.abs(sum - mainShotDurationSeconds) > 1e-9) {
    errors.push(
      `sub_shot_sum_mismatch: sub-shots sum to ${sum}s but parent main shot is ${mainShotDurationSeconds}s`,
    );
  }
  if (subShots.length > policy.maxPerShot) {
    errors.push(`sub_shot_count_exceeded: ${subShots.length} > maxPerShot ${policy.maxPerShot}`);
  }
  for (const s of subShots) {
    if (s.durationSeconds < policy.minSubShotSeconds) {
      errors.push(
        `sub_shot_below_floor: ${s.durationSeconds}s < minSubShotSeconds ${policy.minSubShotSeconds}`,
      );
    }
  }
  return { valid: errors.length === 0, errors };
}
