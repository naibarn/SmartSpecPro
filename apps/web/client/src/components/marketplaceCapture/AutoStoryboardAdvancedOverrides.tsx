import { SlidersHorizontal, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HyperframesAutoStoryboardReviewPlan } from "@shared/hyperframes/autoPlan";
import {
  getMarketplaceHyperframesUiCopy,
  type MarketplaceHyperframesUiLocale,
} from "./hyperframesUiCopy";

interface AutoStoryboardAdvancedOverridesProps {
  plan?: HyperframesAutoStoryboardReviewPlan | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResetToAuto: () => void;
  locale?: MarketplaceHyperframesUiLocale | string;
}

export function AutoStoryboardAdvancedOverrides({
  plan,
  open,
  onOpenChange,
  onResetToAuto,
  locale,
}: AutoStoryboardAdvancedOverridesProps) {
  const copy = getMarketplaceHyperframesUiCopy(locale);
  const fields = plan?.overrideDiff.fields ?? [];

  return (
    <section
      className="rounded-lg border bg-white p-4 text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      aria-label="Advanced Auto overrides"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:text-slate-100"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {copy.advancedOverrides}
        </button>
        {fields.length > 0 ? (
          <Button type="button" variant="outline" size="sm" onClick={onResetToAuto}>
            <RotateCcw className="mr-2 h-4 w-4" />
            {copy.useAutoPlan}
          </Button>
        ) : null}
      </div>
      {open ? (
        <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">
          <p>{copy.autoNoSetup}</p>
          {fields.length > 0 ? (
            <p className="mt-2 font-medium text-amber-700 dark:text-amber-300">
              {copy.overrideDiff(fields)}
            </p>
          ) : (
            <p className="mt-2 font-medium text-emerald-700 dark:text-emerald-300">
              {copy.noOverridesActive}
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
