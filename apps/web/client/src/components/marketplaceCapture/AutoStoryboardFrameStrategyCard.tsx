import type {
  HyperframesAutoPlanOverrideInput,
  HyperframesAutoStoryboardReviewPlan,
} from "@shared/hyperframes/autoPlan";
import { HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES } from "@shared/hyperframes/autoPlan";
import {
  getMarketplaceHyperframesUiCopy,
  type MarketplaceHyperframesUiLocale,
} from "./hyperframesUiCopy";

/**
 * Feature 136 (frame-strategy discoverability fix) — promotes the
 * `frameStrategy` choice out of the collapsed `AutoStoryboardAdvancedOverrides`
 * panel into a top-level, always-visible card row (same visual language as
 * MarketplaceCaptureProductDetail's `characterChoicePanel`), so the
 * sequential storyboard option shipped with Feature 136 is actually
 * discoverable instead of buried in a closed-by-default disclosure.
 *
 * Renders ALL THREE strategies (3x3 / start-stop / sequential), not just the
 * flag-gated one, so a plan whose current default is `video_shot_start_stop`
 * is never left with an unselectable card. `enabled={false}` renders
 * nothing — the caller (MarketplaceCaptureProductDetail.tsx) passes
 * `enabled={sequentialStrategyEnabled}` (the tenant flag), so flag-off
 * tenants see a byte-identical page.
 *
 * Single source of truth: this writes into the SAME `autoStoryboardOverrides`
 * state as `AutoStoryboardAdvancedOverrides`. The caller supplies the
 * context-specific default strategy (including Job Workbench's sequential
 * default), so choosing it removes only this field and preserves preferences.
 */

type OverrideKey = keyof HyperframesAutoPlanOverrideInput;
type FrameStrategyValue = NonNullable<
  HyperframesAutoPlanOverrideInput["frameStrategy"]
>;

// Mirrors AutoStoryboardAdvancedOverrides.tsx's `overrideValueString` byte
// for byte.
function overrideValueString(value: unknown): string {
  return typeof value === "number" ? String(value) : String(value ?? "");
}

// Mirrors AutoStoryboardAdvancedOverrides.tsx's `baseAutoDefaultValues`
// byte for byte (including its defensive `characterPresenceMode: "auto"`
// override, currently a no-op since the shared constant already agrees —
// kept for exact parity in case that ever changes).
const baseAutoDefaultValues: Record<OverrideKey, string> = {
  ...HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES,
  characterPresenceMode: "auto",
};

export interface AutoStoryboardFrameStrategyCardProps {
  enabled: boolean;
  defaultFrameStrategy?: FrameStrategyValue;
  /**
   * Used as a fallback when the caller does not provide a context-specific
   * default. Explicit user overrides always take precedence.
   */
  plan?: HyperframesAutoStoryboardReviewPlan | null;
  value: HyperframesAutoPlanOverrideInput;
  onChange: (value: HyperframesAutoPlanOverrideInput) => void;
  locale?: MarketplaceHyperframesUiLocale | string;
}

export function AutoStoryboardFrameStrategyCard({
  enabled,
  defaultFrameStrategy,
  plan,
  value,
  onChange,
  locale,
}: AutoStoryboardFrameStrategyCardProps) {
  const copy = getMarketplaceHyperframesUiCopy(locale);

  if (!enabled) return null;

  const options: ReadonlyArray<{
    value: FrameStrategyValue;
    label: string;
    description: string;
  }> = [
    {
      value: "storyboard_3x3_split",
      label: copy.frameStrategyLabels.storyboard_3x3_split,
      description:
        copy.frameStrategyCardOptionDescriptions.storyboard_3x3_split,
    },
    {
      value: "video_shot_start_stop",
      label: copy.frameStrategyLabels.video_shot_start_stop,
      description:
        copy.frameStrategyCardOptionDescriptions.video_shot_start_stop,
    },
    {
      value: "sequential_shot_storyboard",
      label: copy.sequentialStrategyOptionLabel,
      description: copy.sequentialStrategyOptionDescription,
    },
  ];

  const planDefault =
    defaultFrameStrategy ??
    plan?.defaults.frameStrategy ??
    baseAutoDefaultValues.frameStrategy;
  const selectedValue = overrideValueString(value.frameStrategy ?? planDefault);

  const selectStrategy = (nextValue: FrameStrategyValue) => {
    const next: HyperframesAutoPlanOverrideInput = {
      ...value,
    };
    if (nextValue === planDefault) {
      delete next.frameStrategy;
    } else {
      next.frameStrategy = nextValue;
    }
    onChange(next);
  };

  return (
    <section
      className="mt-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
      aria-label={copy.frameStrategyCardTitle}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {copy.frameStrategyCardTitle}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {copy.frameStrategyCardSubtitle}
          </p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            aria-pressed={selectedValue === option.value}
            onClick={() => selectStrategy(option.value)}
            className={`min-h-[4.75rem] rounded-lg border p-3 text-left transition ${
              selectedValue === option.value
                ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100 dark:border-emerald-500 dark:bg-emerald-950/40 dark:ring-emerald-900"
                : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
            }`}
          >
            <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
              {option.label}
            </span>
            <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">
              {option.description}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
