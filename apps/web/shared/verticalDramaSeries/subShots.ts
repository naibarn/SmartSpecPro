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

/* -------------------------------------------------------------------------- */
/* Speaker-aware sub-shot split gate (speaker-aware sub-shots task)           */
/* -------------------------------------------------------------------------- */

/**
 * Hard cap on speaker-switch sub-shots per parent shot — DISTINCT from
 * `VERTICAL_DRAMA_SUB_SHOT_MAX_PER_SHOT` (5, the manual `VerticalDramaSubShotEditor`
 * editor's cap). Deliberately a separate constant so the two caps never
 * accidentally drift together: this one governs the AUTOMATIC,
 * dialogue-driven shot-reverse-shot split (`computeSpeakerSwitchSubShotPlan`
 * below), capped at 3 because a 4th+ cut within one main shot reads as
 * choppy rather than a clean reverse-shot exchange.
 */
export const VERTICAL_DRAMA_SPEAKER_SUB_SHOT_MAX = 3;

/** One speaker-anchored cut window within a shot being split (see `computeSpeakerSwitchSubShotPlan`). */
export interface SpeakerSwitchSubShotWindow {
  /** 1-based order within the parent shot (1..N, N <= `VERTICAL_DRAMA_SPEAKER_SUB_SHOT_MAX`). */
  subShotNumber: number;
  /** The character this window/clip is anchored on (its start frame/reference should be this character's portrait). */
  characterKey: string;
  /** Indexes into the CALLER's original (unfiltered) `dialogueLines` array covered by this window. */
  lineIndexes: number[];
  durationSeconds: number;
}

export interface SpeakerSwitchSubShotDecision {
  needsSplit: boolean;
  /** Ordered unique `characterKey`s found among attributed dialogue lines. */
  distinctSpeakers: string[];
  /** Count of consecutive-same-speaker "turns" after run-length-encoding the attributed line sequence. */
  turnCount: number;
  /** Empty when `needsSplit` is false. */
  windows: SpeakerSwitchSubShotWindow[];
  reason: "ok" | "no_dialogue" | "single_speaker" | "shot_too_short_for_split";
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * Split `totalSeconds` across `weights.length` windows proportionally to
 * each window's weight (e.g. spoken-character count), enforcing `floorSeconds`
 * as a per-window minimum on every window EXCEPT the last, with any leftover
 * remainder (including proportional rounding drift) absorbed by the last
 * window — generalizes the equal-split `splitDurations` helper in
 * `verticalDramaEpisodePipeline.ts` (same floor-then-remainder-on-last
 * pattern) to weighted, non-equal windows. Pure, no I/O.
 */
export function splitDurationsByWeight(
  totalSeconds: number,
  weights: number[],
  floorSeconds: number
): number[] {
  const n = weights.length;
  if (n === 0) return [];
  if (n === 1) return [round2(totalSeconds)];

  const totalWeight = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  const proportional =
    totalWeight > 0
      ? weights.map(w => (Math.max(0, w) / totalWeight) * totalSeconds)
      : weights.map(() => totalSeconds / n);

  const leading = proportional
    .slice(0, n - 1)
    .map(v => Math.max(floorSeconds, round2(v)));
  const usedByLeading = leading.reduce((sum, v) => sum + v, 0);
  const last = Math.max(floorSeconds, round2(totalSeconds - usedByLeading));

  return [...leading, last];
}

/** One run of consecutive same-speaker dialogue lines. */
interface SpeakerTurn {
  characterKey: string;
  indexes: number[];
}

/**
 * Group `turns` into exactly `feasibleCount` ordered groups: one turn per
 * group when `turns.length <= feasibleCount`; otherwise the first and last
 * turn ALWAYS keep their own dedicated group (they anchor the scene's
 * opening/closing speaker), and every turn in between is distributed as
 * evenly as possible (in order) across the `feasibleCount - 2` middle
 * groups. `feasibleCount` must be >= 2 and <= `turns.length` (guaranteed by
 * `computeSpeakerSwitchSubShotPlan`'s caller-side feasibility check before
 * this is invoked).
 */
function groupTurnsIntoWindows(
  turns: SpeakerTurn[],
  feasibleCount: number
): SpeakerTurn[][] {
  const n = turns.length;
  if (n <= feasibleCount) {
    return turns.map(t => [t]);
  }

  const first = turns[0]!;
  const last = turns[n - 1]!;
  const middleTurns = turns.slice(1, n - 1);
  const middleWindowCount = feasibleCount - 2;

  if (middleWindowCount <= 0) {
    // feasibleCount === 2: everything except the first turn merges into the
    // second (last) window.
    return [[first], turns.slice(1)];
  }

  const groups: SpeakerTurn[][] = [];
  const base = Math.floor(middleTurns.length / middleWindowCount);
  const remainder = middleTurns.length % middleWindowCount;
  let idx = 0;
  for (let g = 0; g < middleWindowCount; g++) {
    const size = base + (g < remainder ? 1 : 0);
    groups.push(middleTurns.slice(idx, idx + size));
    idx += size;
  }

  return [[first], ...groups, [last]];
}

/**
 * Deterministic (no LLM call) decision of whether a shot's dialogue actually
 * requires shot-reverse-shot splitting, and if so, into which speaker-
 * anchored windows. Pure — safe to unit-test without mocking an LLM.
 *
 * Logic: filter to lines carrying a non-empty `characterKey` (unattributed
 * lines can't anchor a cut); fewer than 2 distinct attributed speakers means
 * no split is needed. Otherwise run-length-encode the attributed sequence
 * into "turns" (consecutive same-speaker lines collapse into one turn), and
 * compute the feasible window count as
 * `min(maxSubShots, turnCount, floor(shotDurationSeconds / minSubShotSeconds))`
 * — fewer than 2 feasible windows means the shot is effectively single-
 * speaker or too short to split. Otherwise build `feasibleCount` windows
 * from the turns (see `groupTurnsIntoWindows`), with each window's duration
 * weighted by its total spoken-character count and floored at
 * `minSubShotSeconds` (see `splitDurationsByWeight`).
 */
export function computeSpeakerSwitchSubShotPlan(
  dialogueLines: Array<{ characterKey?: string; lineTh: string }>,
  shotDurationSeconds: number,
  policy: Pick<VerticalDramaSubShotPolicy, "minSubShotSeconds">,
  maxSubShots: number = VERTICAL_DRAMA_SPEAKER_SUB_SHOT_MAX
): SpeakerSwitchSubShotDecision {
  const attributed = dialogueLines
    .map((line, index) => ({ line, index }))
    .filter(
      ({ line }) =>
        typeof line.characterKey === "string" && line.characterKey.trim().length > 0
    );

  if (attributed.length === 0) {
    return {
      needsSplit: false,
      distinctSpeakers: [],
      turnCount: 0,
      windows: [],
      reason: "no_dialogue",
    };
  }

  const distinctSpeakers: string[] = [];
  for (const { line } of attributed) {
    const key = line.characterKey!.trim();
    if (!distinctSpeakers.includes(key)) distinctSpeakers.push(key);
  }

  if (distinctSpeakers.length < 2) {
    return {
      needsSplit: false,
      distinctSpeakers,
      turnCount: 0,
      windows: [],
      reason: "single_speaker",
    };
  }

  const turns: SpeakerTurn[] = [];
  for (const { line, index } of attributed) {
    const key = line.characterKey!.trim();
    const currentTurn = turns[turns.length - 1];
    if (currentTurn && currentTurn.characterKey === key) {
      currentTurn.indexes.push(index);
    } else {
      turns.push({ characterKey: key, indexes: [index] });
    }
  }
  const turnCount = turns.length;

  const feasibleByDuration = Math.floor(
    shotDurationSeconds / policy.minSubShotSeconds
  );
  const feasibleCount = Math.min(maxSubShots, turnCount, feasibleByDuration);

  if (feasibleCount < 2) {
    return {
      needsSplit: false,
      distinctSpeakers,
      turnCount,
      windows: [],
      reason: "shot_too_short_for_split",
    };
  }

  const groups = groupTurnsIntoWindows(turns, feasibleCount);
  const weights = groups.map(group =>
    group.reduce(
      (sum, turn) =>
        sum +
        turn.indexes.reduce(
          (s, i) => s + (dialogueLines[i]?.lineTh.length ?? 0),
          0
        ),
      0
    )
  );
  const durations = splitDurationsByWeight(
    shotDurationSeconds,
    weights,
    policy.minSubShotSeconds
  );

  const windows: SpeakerSwitchSubShotWindow[] = groups.map((group, i) => ({
    subShotNumber: i + 1,
    // Anchor speaker = the speaker of the FIRST turn in this window's group
    // — the character on-screen at the moment this cut begins.
    characterKey: group[0]!.characterKey,
    lineIndexes: group.flatMap(turn => turn.indexes),
    durationSeconds: durations[i]!,
  }));

  return {
    needsSplit: true,
    distinctSpeakers,
    turnCount,
    windows,
    reason: "ok",
  };
}
