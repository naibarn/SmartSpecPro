import type { HyperframesAutoPlanOverrideInput } from "@shared/hyperframes/autoPlan";
import { HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES } from "@shared/hyperframes/autoPlan";
import {
  getMarketplaceHyperframesUiCopy,
  type MarketplaceHyperframesUiLocale,
} from "./hyperframesUiCopy";

/**
 * Marketplace Auto Review — quality-mode (image-repair-rounds) control,
 * promoted to always-visible placement next to the Estimate tile in
 * `AutoStoryboardReviewPlanSummary` (2026-07-23 user feedback: the existing
 * `qualityMode` dropdown lived only inside the collapsed
 * `AutoStoryboardAdvancedOverrides` panel and the user could not find it —
 * it is a credit-cost control and its entire point is visibility BEFORE
 * clicking generate).
 *
 * Single source of truth: this writes into the SAME `autoStoryboardOverrides`
 * state as `AutoStoryboardAdvancedOverrides` via the same `onChange`, using
 * byte-identical prune-to-default-shape semantics
 * (`overrideValueString` / `pruneBaseAutoDefaultOverrides` /
 * `baseAutoDefaultValues` below are duplicated from that module, not
 * imported — they are not exported from it, and that module must stay
 * completely unchanged). This mirrors the precedent already established by
 * `AutoStoryboardFrameStrategyCard.tsx` for the exact same reason. Keeping
 * this control and the advanced-overrides dropdown in lockstep (same
 * selected value, same write shape) is asserted by this component's tests.
 *
 * The option VALUES ("fast" | "balanced" | "high") mirror
 * `AutoStoryboardAdvancedOverrides.tsx`'s own `qualityModeOptions` byte for
 * byte — this is the Auto Storyboard Review flow's OWN enum, distinct from
 * the Standard Order flow's `"fast_draft" | "balanced" | "premium_strict_qa"`
 * enum (`AutoReviewQualityMode` in MarketplaceCaptureProductDetail.tsx). The
 * server translates one to the other 1:1 via
 * `toMarketplaceAutoReviewQualityMode()` in
 * `server/services/hyperframesRuntimeApiService.ts`
 * (fast -> fast_draft, balanced -> balanced, high -> premium_strict_qa), so
 * the round-count-per-unit numbers below are the exact same numbers
 * `MarketplaceCaptureProductDetail.tsx`'s `AUTO_REVIEW_QUALITY_MODE_ROUNDS`
 * already displays for the Standard flow, just re-keyed to this flow's own
 * enum values. They mirror
 * `server/services/marketplaceAutoReviewService.ts`'s
 * `buildMarketplaceAutoReviewQualityModePolicy()`'s `maxRepairAttemptsPerUnit`
 * (fast -> 1, balanced -> MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS+1 = 3, high ->
 * MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS+2 = 4). Display-only — keep these numbers
 * in sync if that server-side policy ever changes.
 */

type OverrideKey = keyof HyperframesAutoPlanOverrideInput;
export type AutoStoryboardQualityMode = "fast" | "balanced" | "high";

export const AUTO_STORYBOARD_QUALITY_MODE_ROUNDS: Record<
  AutoStoryboardQualityMode,
  number
> = {
  fast: 1,
  balanced: 3,
  high: 4,
};

// Mirrors AutoStoryboardAdvancedOverrides.tsx's `overrideValueString` byte
// for byte.
function overrideValueString(value: unknown): string {
  return typeof value === "number" ? String(value) : String(value ?? "");
}

// Mirrors AutoStoryboardAdvancedOverrides.tsx's `baseAutoDefaultValues` byte
// for byte (including its defensive `characterPresenceMode: "auto"`
// override — irrelevant to this control, kept only for exact parity).
const baseAutoDefaultValues: Record<OverrideKey, string> = {
  ...HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES,
  characterPresenceMode: "auto",
};

// Mirrors AutoStoryboardAdvancedOverrides.tsx's
// `pruneBaseAutoDefaultOverrides` byte for byte.
function pruneBaseAutoDefaultOverrides(
  value: HyperframesAutoPlanOverrideInput
): HyperframesAutoPlanOverrideInput {
  const next = { ...value };
  (Object.keys(next) as OverrideKey[]).forEach(key => {
    if (overrideValueString(next[key]) === baseAutoDefaultValues[key]) {
      delete next[key];
    }
  });
  return next;
}

function isAutoStoryboardQualityMode(
  value: unknown
): value is AutoStoryboardQualityMode {
  return value === "fast" || value === "balanced" || value === "high";
}

/**
 * Resolves the effective (override ?? default) quality mode from the shared
 * overrides object — the SAME resolution `AutoStoryboardAdvancedOverrides`'s
 * internal `selectedValueFor("qualityMode")` performs, so this control and
 * the advanced panel's dropdown always agree on the selected value.
 */
export function resolveAutoStoryboardQualityMode(
  value: HyperframesAutoPlanOverrideInput
): AutoStoryboardQualityMode {
  const resolved =
    pruneBaseAutoDefaultOverrides(value).qualityMode ??
    baseAutoDefaultValues.qualityMode;
  return isAutoStoryboardQualityMode(resolved) ? resolved : "balanced";
}

export interface AutoStoryboardQualityModeControlProps {
  value: HyperframesAutoPlanOverrideInput;
  onChange: (value: HyperframesAutoPlanOverrideInput) => void;
  locale?: MarketplaceHyperframesUiLocale | string;
}

export function AutoStoryboardQualityModeControl({
  value,
  onChange,
  locale,
}: AutoStoryboardQualityModeControlProps) {
  const copy = getMarketplaceHyperframesUiCopy(locale);
  const selected = resolveAutoStoryboardQualityMode(value);

  const qualityModeOptions: ReadonlyArray<{
    value: AutoStoryboardQualityMode;
    label: string;
  }> = [
    { value: "fast", label: copy.qualityModeControlOptions.fast },
    { value: "balanced", label: copy.qualityModeControlOptions.balanced },
    { value: "high", label: copy.qualityModeControlOptions.high },
  ];

  const update = (nextValue: string) => {
    const next = { ...value };
    if (nextValue === baseAutoDefaultValues.qualityMode) {
      delete next.qualityMode;
    } else {
      next.qualityMode =
        nextValue as HyperframesAutoPlanOverrideInput["qualityMode"];
    }
    onChange(pruneBaseAutoDefaultOverrides(next));
  };

  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
        {copy.qualityModeControlLabel}
      </span>
      <select
        aria-label={copy.qualityModeControlLabel}
        className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        value={selected}
        onChange={event => update(event.target.value)}
      >
        {qualityModeOptions.map(option => (
          <option key={option.value} value={option.value}>
            {option.label} (
            {copy.qualityModeControlRounds(
              AUTO_STORYBOARD_QUALITY_MODE_ROUNDS[option.value]
            )}
            )
          </option>
        ))}
      </select>
    </label>
  );
}
