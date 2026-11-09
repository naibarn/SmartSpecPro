import type { HyperframesAutoPlanOverrideInput } from "@shared/hyperframes/autoPlan";
import { HyperframesAutoPlanOverrideInputSchema } from "@shared/hyperframes/autoPlan";

export const AUTO_STORYBOARD_OVERRIDES_STORAGE_KEY =
  "smartSpecPro.marketplaceCapture.autoStoryboardOverrides.v2";

const LEGACY_AUTO_STORYBOARD_OVERRIDES_STORAGE_KEY =
  "smartSpecPro.marketplaceCapture.autoStoryboardOverrides.v1";

export function loadStoredAutoStoryboardOverrides(): HyperframesAutoPlanOverrideInput {
  if (typeof window === "undefined") return {};
  try {
    const currentRaw = window.localStorage.getItem(
      AUTO_STORYBOARD_OVERRIDES_STORAGE_KEY
    );
    const isLegacy = currentRaw === null;
    const raw = isLegacy
      ? window.localStorage.getItem(LEGACY_AUTO_STORYBOARD_OVERRIDES_STORAGE_KEY)
      : currentRaw;
    if (!raw) return {};
    const parsed = HyperframesAutoPlanOverrideInputSchema.safeParse(
      JSON.parse(raw)
    );
    if (!parsed.success) return {};
    const migrated =
      isLegacy && parsed.data.frameStrategy === "storyboard_3x3_split"
        ? {
            ...parsed.data,
            frameStrategy: "sequential_shot_storyboard" as const,
          }
        : parsed.data;
    if (isLegacy) persistStoredAutoStoryboardOverrides(migrated);
    return migrated;
  } catch {
    return {};
  }
}

export function persistStoredAutoStoryboardOverrides(
  overrides: HyperframesAutoPlanOverrideInput
) {
  if (typeof window === "undefined") return;
  try {
    if (Object.keys(overrides).length === 0) {
      window.localStorage.removeItem(AUTO_STORYBOARD_OVERRIDES_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      AUTO_STORYBOARD_OVERRIDES_STORAGE_KEY,
      JSON.stringify(overrides)
    );
  } catch {
    // Ignore storage failures so Auto Review controls remain usable.
  }
}

export function retainAutoStoryboardModelOverrides(
  overrides: HyperframesAutoPlanOverrideInput
): HyperframesAutoPlanOverrideInput {
  const retained: HyperframesAutoPlanOverrideInput = {};
  for (const key of [
    "imageModel",
    "videoModel",
    "visionQaModel",
    "storyPlanningModel",
  ] as const) {
    const value = overrides[key];
    if (typeof value === "string" && value.trim()) {
      retained[key] = value as never;
    }
  }
  return retained;
}

export function persistStoredStoryPlanningModel(model: string) {
  const preferences = loadStoredAutoStoryboardOverrides();
  persistStoredAutoStoryboardOverrides({
    ...preferences,
    storyPlanningModel: model.trim() || "__automatic__",
  });
}

export function persistStoredAutoReviewImageModel(model: string) {
  const preferences = loadStoredAutoStoryboardOverrides();
  persistStoredAutoStoryboardOverrides({
    ...preferences,
    imageModel: model.trim() || undefined,
  });
}

export function persistStoredAutoReviewVideoModel(model: string) {
  const preferences = loadStoredAutoStoryboardOverrides();
  persistStoredAutoStoryboardOverrides({
    ...preferences,
    videoModel: model.trim() || undefined,
  });
}
