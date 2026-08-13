import { z } from "zod";

/** The storyboard contract remains nine logical shots per sub-episode. */
export const VERTICAL_DRAMA_LOGICAL_SHOT_COUNT = 9 as const;

/**
 * Provider durations currently exposed by the Vertical Drama video catalog.
 * This list is the UI-safe default; provider-specific capability checks may
 * narrow it before a profile is persisted.
 */
export const VERTICAL_DRAMA_SUPPORTED_SHOT_DURATIONS_SECONDS = [
  8,
  10,
  15,
  20,
  25,
  30,
] as const;

export type VerticalDramaSupportedShotDurationSeconds =
  (typeof VERTICAL_DRAMA_SUPPORTED_SHOT_DURATIONS_SECONDS)[number];

export const verticalDramaDurationPlanStatusSchema = z.enum([
  "active",
  "legacy_compat",
  "duration_pending",
]);

export type VerticalDramaDurationPlanStatus = z.infer<
  typeof verticalDramaDurationPlanStatusSchema
>;

export const verticalDramaDurationPlanSchema = z
  .object({
    contractVersion: z.literal(1),
    profileId: z.string().min(1),
    logicalShotCount: z.literal(VERTICAL_DRAMA_LOGICAL_SHOT_COUNT),
    shotDurationSeconds: z.number().positive().optional(),
    // Legacy compatibility records may not have a logical vector. Active
    // profiles are validated by the constructors below and always contain 9.
    shotDurationsSeconds: z.array(z.number().positive()).max(
      VERTICAL_DRAMA_LOGICAL_SHOT_COUNT
    ),
    status: verticalDramaDurationPlanStatusSchema,
    source: z.enum(["provider_capability", "user_selected", "legacy_assembly"]),
    /** Provider render segments may be 8 or 9 for frame-bridge profiles. */
    renderSegmentDurationsSeconds: z.array(z.number().positive()).optional(),
  })
  .passthrough();

export type VerticalDramaDurationPlan = z.infer<
  typeof verticalDramaDurationPlanSchema
>;

export type VerticalDramaDurationProfileOption = {
  shotDurationSeconds: VerticalDramaSupportedShotDurationSeconds;
  profileId: string;
  labelTh: string;
  labelEn: string;
  runtimeSeconds: number;
};

export const LEGACY_VERTICAL_DRAMA_DURATION_PROFILE_IDS = [
  "vertical_drama_60s_9_frames_8_clips",
  "vertical_drama_60s_9_shots",
] as const;

const UNIFORM_EPISODE_PROFILE_PATTERN =
  /^vertical_drama_(8|10|15|20|25|30)s_x9_shots$/;

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isSupportedVerticalDramaShotDuration(
  value: unknown,
  allowedDurations: readonly number[] =
    VERTICAL_DRAMA_SUPPORTED_SHOT_DURATIONS_SECONDS
): value is number {
  return isPositiveFinite(value) && allowedDurations.includes(value);
}

export function createUniformVerticalDramaDurationPlan(
  shotDurationSeconds: number,
  options?: {
    profileId?: string;
    source?: "provider_capability" | "user_selected";
    allowedDurations?: readonly number[];
  }
): VerticalDramaDurationPlan {
  const allowedDurations =
    options?.allowedDurations ?? VERTICAL_DRAMA_SUPPORTED_SHOT_DURATIONS_SECONDS;
  if (!isSupportedVerticalDramaShotDuration(shotDurationSeconds, allowedDurations)) {
    throw new Error(`Unsupported Vertical Drama shot duration: ${shotDurationSeconds}s`);
  }

  const profileId =
    options?.profileId ?? `vertical_drama_${shotDurationSeconds}s_x9_shots`;
  return {
    contractVersion: 1,
    profileId,
    logicalShotCount: VERTICAL_DRAMA_LOGICAL_SHOT_COUNT,
    shotDurationSeconds,
    shotDurationsSeconds: Array.from(
      { length: VERTICAL_DRAMA_LOGICAL_SHOT_COUNT },
      () => shotDurationSeconds
    ),
    status: "active",
    source: options?.source ?? "user_selected",
  };
}

export function createMixedVerticalDramaDurationPlan(
  shotDurationsSeconds: readonly number[],
  options?: {
    profileId?: string;
    source?: "provider_capability" | "user_selected";
    allowedDurations?: readonly number[];
  }
): VerticalDramaDurationPlan {
  const allowedDurations =
    options?.allowedDurations ?? VERTICAL_DRAMA_SUPPORTED_SHOT_DURATIONS_SECONDS;
  if (
    shotDurationsSeconds.length !== VERTICAL_DRAMA_LOGICAL_SHOT_COUNT ||
    shotDurationsSeconds.some(
      duration => !isSupportedVerticalDramaShotDuration(duration, allowedDurations)
    )
  ) {
    throw new Error(
      `A Vertical Drama duration plan must contain ${VERTICAL_DRAMA_LOGICAL_SHOT_COUNT} supported shot durations`
    );
  }

  return {
    contractVersion: 1,
    profileId: options?.profileId ?? "vertical_drama_mixed_9_shots",
    logicalShotCount: VERTICAL_DRAMA_LOGICAL_SHOT_COUNT,
    shotDurationsSeconds: [...shotDurationsSeconds],
    status: "active",
    source: options?.source ?? "provider_capability",
  };
}

export function deriveVerticalDramaEpisodeRuntimeSeconds(
  plan: Pick<
    VerticalDramaDurationPlan,
    "shotDurationsSeconds" | "renderSegmentDurationsSeconds"
  >
): number {
  const durations =
    plan.renderSegmentDurationsSeconds?.length
      ? plan.renderSegmentDurationsSeconds
      : plan.shotDurationsSeconds;
  return durations.reduce((sum, duration) => sum + duration, 0);
}

export function createVerticalDramaDurationProfileOptions(
  allowedDurations: readonly number[] =
    VERTICAL_DRAMA_SUPPORTED_SHOT_DURATIONS_SECONDS
): VerticalDramaDurationProfileOption[] {
  return VERTICAL_DRAMA_SUPPORTED_SHOT_DURATIONS_SECONDS.filter(duration =>
    allowedDurations.includes(duration)
  ).map(shotDurationSeconds => ({
    shotDurationSeconds,
    profileId: `vertical_drama_${shotDurationSeconds}s_x9_shots`,
    labelTh: `9 ช็อต × ${shotDurationSeconds} วินาที = ${shotDurationSeconds * 9} วินาที`,
    labelEn: `9 shots × ${shotDurationSeconds}s = ${shotDurationSeconds * 9}s`,
    runtimeSeconds: shotDurationSeconds * VERTICAL_DRAMA_LOGICAL_SHOT_COUNT,
  }));
}

/**
 * Read the additive bible field without touching legacy content. Invalid or
 * absent values intentionally return null so callers can keep their existing
 * legacy path instead of inventing a new duration.
 */
export function readVerticalDramaDurationPlan(raw: unknown): VerticalDramaDurationPlan | null {
  const parsed = verticalDramaDurationPlanSchema.safeParse(raw);
  if (!parsed.success) return null;
  if (
    parsed.data.status === "active" &&
    (parsed.data.shotDurationsSeconds.length !== VERTICAL_DRAMA_LOGICAL_SHOT_COUNT ||
      parsed.data.shotDurationsSeconds.some(duration =>
        !isSupportedVerticalDramaShotDuration(duration)
      ) ||
      (parsed.data.shotDurationSeconds !== undefined &&
        (!isSupportedVerticalDramaShotDuration(parsed.data.shotDurationSeconds) ||
          parsed.data.shotDurationsSeconds.some(
            duration => duration !== parsed.data.shotDurationSeconds
          ))) ||
      (parsed.data.renderSegmentDurationsSeconds !== undefined &&
        (parsed.data.renderSegmentDurationsSeconds.length >
          VERTICAL_DRAMA_LOGICAL_SHOT_COUNT ||
          parsed.data.renderSegmentDurationsSeconds.some(duration =>
            !isSupportedVerticalDramaShotDuration(duration)
          ))))
  ) {
    return null;
  }
  return parsed.data;
}

/**
 * Reconstruct the immutable uniform profile captured on a new episode row.
 * The episode table intentionally stores both `durationProfileId` and the
 * derived target runtime, so an older active-profile episode remains
 * assembleable even after the series settings move to a different profile.
 * Unknown/custom IDs fail closed and continue through the legacy path.
 */
export function resolveVerticalDramaEpisodeDurationPlan(
  durationProfileId: string | null | undefined,
  targetDurationSeconds: number | null | undefined,
): VerticalDramaDurationPlan | null {
  if (typeof durationProfileId !== "string") return null;
  const match = UNIFORM_EPISODE_PROFILE_PATTERN.exec(durationProfileId);
  if (!match || typeof targetDurationSeconds !== "number") return null;

  const shotDurationSeconds = Number(match[1]);
  if (
    !isSupportedVerticalDramaShotDuration(shotDurationSeconds) ||
    targetDurationSeconds !== shotDurationSeconds * VERTICAL_DRAMA_LOGICAL_SHOT_COUNT
  ) {
    return null;
  }

  return createUniformVerticalDramaDurationPlan(shotDurationSeconds, {
    profileId: durationProfileId,
    source: "user_selected",
  });
}

/**
 * Returns the logical shot vector only for a complete active profile. Legacy
 * and pending records deliberately return null so callers keep their safe
 * compatibility path instead of fabricating a new runtime.
 */
export function getActiveVerticalDramaShotDurations(
  plan: VerticalDramaDurationPlan | null | undefined
): number[] | null {
  if (
    !plan ||
    plan.status !== "active" ||
    plan.shotDurationsSeconds.length !== VERTICAL_DRAMA_LOGICAL_SHOT_COUNT
  ) {
    return null;
  }
  return [...plan.shotDurationsSeconds];
}

export function resolveVerticalDramaDurationPlan(
  bible: unknown,
  legacyTargetDurationSeconds?: number | null
): VerticalDramaDurationPlan | null {
  const bibleRecord =
    bible && typeof bible === "object"
      ? (bible as Record<string, unknown>)
      : null;
  const persisted = readVerticalDramaDurationPlan(
    bibleRecord?.durationProfile ?? bibleRecord?.durationPlan
  );
  if (persisted) return persisted;

  // Legacy records are read-only compatibility observations. Do not convert a
  // legacy 60-second column into a new 9-shot profile because that would alter
  // the meaning of old episodes.
  if (
    typeof legacyTargetDurationSeconds === "number" &&
    legacyTargetDurationSeconds > 0
  ) {
    return {
      contractVersion: 1,
      profileId: "legacy_episode_duration_seconds",
      logicalShotCount: VERTICAL_DRAMA_LOGICAL_SHOT_COUNT,
      shotDurationsSeconds: [],
      status: "legacy_compat",
      source: "legacy_assembly",
    };
  }
  return null;
}

export function formatVerticalDramaDurationPlan(
  plan: VerticalDramaDurationPlan | null | undefined,
  lang: "th" | "en"
): string {
  if (!plan) return lang === "th" ? "ยังไม่ได้กำหนด duration" : "Duration pending";
  if (plan.status === "legacy_compat") {
    return lang === "th" ? "รูปแบบเดิม (ไม่แก้ตอนเก่า)" : "Legacy format (old episodes preserved)";
  }
  const duration = plan.shotDurationSeconds;
  if (duration !== undefined && plan.shotDurationsSeconds.every(v => v === duration)) {
    const runtime = duration * VERTICAL_DRAMA_LOGICAL_SHOT_COUNT;
    return lang === "th"
      ? `9 ช็อต × ${duration} วินาที = ${runtime} วินาที`
      : `9 shots × ${duration}s = ${runtime}s`;
  }
  const runtime = deriveVerticalDramaEpisodeRuntimeSeconds(plan);
  return lang === "th"
    ? `9 ช็อตแบบผสม = ${runtime} วินาที`
    : `9-shot mixed profile = ${runtime}s`;
}
