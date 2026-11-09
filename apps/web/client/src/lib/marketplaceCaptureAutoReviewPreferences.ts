import type { HyperframesAutoPlanOverrideInput } from "@shared/hyperframes/autoPlan";
import { HyperframesAutoPlanOverrideInputSchema } from "@shared/hyperframes/autoPlan";

export const AUTO_STORYBOARD_OVERRIDES_STORAGE_KEY =
  "smartSpecPro.marketplaceCapture.autoStoryboardOverrides.v1";

export function loadStoredAutoStoryboardOverrides(): HyperframesAutoPlanOverrideInput {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(
      AUTO_STORYBOARD_OVERRIDES_STORAGE_KEY
    );
    if (!raw) return {};
    const parsed = HyperframesAutoPlanOverrideInputSchema.safeParse(
      JSON.parse(raw)
    );
    return parsed.success ? parsed.data : {};
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
