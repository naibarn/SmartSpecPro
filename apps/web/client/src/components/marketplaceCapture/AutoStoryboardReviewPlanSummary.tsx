import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HyperframesAutoStoryboardReviewPlan } from "@shared/hyperframes/autoPlan";
import {
  getMarketplaceHyperframesUiCopy,
  type MarketplaceHyperframesUiLocale,
} from "./hyperframesUiCopy";

interface AutoStoryboardReviewPlanSummaryProps {
  plan?: HyperframesAutoStoryboardReviewPlan | null;
  loading?: boolean;
  starting?: boolean;
  updating?: boolean;
  onStart: () => void;
  onUseStandard: () => void;
  onResetToAuto?: () => void;
  locale?: MarketplaceHyperframesUiLocale | string;
  /**
   * Quality-mode / image-repair-rounds control (2026-07-23 user feedback),
   * rendered directly under the Estimate tile since it is the control that
   * drives that tile's worst-case number. Rendered as a caller-provided slot
   * so this component stays plan/copy-driven only — the caller
   * (`MarketplaceCaptureProductDetail.tsx`) owns wiring it to the shared
   * `autoStoryboardOverrides` state (see `AutoStoryboardQualityModeControl`).
   * Optional and additive: omitting it renders the tile exactly as before.
   */
  qualityModeControl?: ReactNode;
  /**
   * Repair rounds budget for the currently selected quality mode (from
   * `AUTO_STORYBOARD_QUALITY_MODE_ROUNDS` in
   * `AutoStoryboardQualityModeControl.tsx`). Used only to compute the
   * worst-case estimate line below the Estimate tile's happy-path numbers.
   * Optional and additive: omitting it (or a falsy value) renders the tile
   * exactly as before, with no worst-case line.
   */
  qualityModeRepairRounds?: number;
}

export function AutoStoryboardReviewPlanSummary({
  plan,
  loading,
  starting,
  updating,
  onStart,
  onUseStandard,
  onResetToAuto,
  locale,
  qualityModeControl,
  qualityModeRepairRounds,
}: AutoStoryboardReviewPlanSummaryProps) {
  const copy = getMarketplaceHyperframesUiCopy(locale);
  const blockers = plan?.blockers ?? [];
  const ready = Boolean(plan?.canStart && blockers.length === 0);
  const primaryActionId = plan?.primaryAction.actionId;
  const primaryUsesStart = primaryActionId === "start_auto_storyboard_review";
  const primaryUsesResume = primaryActionId === "resume_auto_storyboard_review";
  const primaryUsesStandard = primaryActionId === "use_standard_order";
  const primaryReady = ready || primaryUsesResume || primaryUsesStandard;
  const primaryDisabled =
    Boolean(loading || starting || updating || plan?.primaryAction.disabled) ||
    (primaryUsesStart
      ? !ready
      : primaryUsesResume
        ? !plan?.activeRunId
      : primaryUsesStandard
        ? !plan?.standardOrderAvailable
        : true);
  const primaryLabel =
    primaryActionId === "start_auto_storyboard_review"
      ? copy.createAutoReview
      : primaryActionId === "resume_auto_storyboard_review"
        ? copy.resumeAutoReview
        : primaryActionId === "use_standard_order"
          ? copy.useStandardOrder
          : primaryActionId === "review_blockers"
            ? copy.reviewBlockers
            : plan?.primaryAction.label ?? copy.createAutoReview;
  const summary =
    loading
      ? copy.autoReviewLoading
      : copy.locale === "th"
        ? copy.autoReviewFallbackSummary
        : plan?.display.summary ?? copy.autoReviewFallbackSummary;
  const handlePrimaryAction = primaryUsesStandard ? onUseStandard : onStart;
  const isActiveRun = Boolean(plan?.activeRunId);
  // Feature 136 (section 11, §6.7) — always-visible active-strategy label.
  // `frameStrategy` can be `"auto"` before the backend resolves a concrete
  // strategy; `frameStrategyLabels` only covers the three concrete values.
  const frameStrategy = plan?.defaults.frameStrategy;
  const frameStrategyLabel =
    frameStrategy && frameStrategy !== "auto"
      ? copy.frameStrategyLabels[frameStrategy]
      : copy.autoSelected;

  return (
    <section
      className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-slate-950 dark:border-sky-800 dark:bg-slate-900 dark:text-slate-100"
      aria-label={copy.autoReviewPlanLabel}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-sky-900 dark:text-sky-100">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {copy.autoReviewTitle}
          </div>
          <p className="mt-1 text-sm leading-6 text-sky-800 dark:text-sky-100/85">
            {summary}
          </p>
          {starting ? (
            <p className="mt-2 flex items-center gap-2 text-xs text-sky-900 dark:text-sky-100/90">
              <Loader2 className="h-3 w-3 animate-spin text-sky-700 dark:text-sky-200" />
              {copy.locale === "th"
                ? "กำลังเริ่มงาน Auto Storyboard Review และรอสร้าง run ใหม่"
                : "Starting Auto Storyboard Review and waiting for a new run"}
            </p>
          ) : null}
          {updating ? (
            <p className="mt-2 flex items-center gap-2 text-xs text-sky-900 dark:text-sky-100/90">
              <Loader2 className="h-3 w-3 animate-spin text-sky-700 dark:text-sky-200" />
              {copy.overridePending}
            </p>
          ) : null}
          {isActiveRun ? (
            <p className="mt-2 flex items-center gap-2 text-xs text-sky-900 dark:text-sky-100/90">
              <Loader2 className="h-3 w-3 animate-spin text-sky-700 dark:text-sky-200" />
              {copy.locale === "th"
                ? "งาน Auto Review กำลังทำงานและถูกเช็กสถานะอัตโนมัติอยู่"
                : "Auto Review run is active and being polled"}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {updating ? (
            <p className="sr-only" role="status" aria-live="polite">
              {copy.overridePending}
            </p>
          ) : null}
          {plan?.resetToAutoAvailable && onResetToAuto ? (
            <Button type="button" variant="outline" size="sm" onClick={onResetToAuto}>
              <RotateCcw className="mr-2 h-4 w-4" />
              {copy.useAutoPlan}
            </Button>
          ) : null}
          {primaryUsesStandard ? null : (
            <Button type="button" variant="outline" size="sm" onClick={onUseStandard}>
              {copy.standardOrder}
            </Button>
          )}
          <Button
            type="button"
            onClick={handlePrimaryAction}
            disabled={primaryDisabled}
            className="bg-sky-600 text-white hover:bg-sky-700"
          >
            {starting || updating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : primaryReady ? (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            ) : (
              <AlertTriangle className="mr-2 h-4 w-4" />
            )}
            {updating ? copy.autoPlanUpdating : primaryLabel}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {copy.template}
          </p>
          <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">
            {copy.autoSelected}
          </p>
        </div>
        <div className="rounded-md border bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {copy.platform}
          </p>
          <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">
            {plan?.defaults.platformPreset.label ?? copy.autoSelected}
          </p>
        </div>
        <div className="rounded-md border bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {copy.locale === "th" ? "เฟรม" : "Frames"}
          </p>
          <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">
            {frameStrategyLabel}
          </p>
        </div>
        <div className="rounded-md border bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {copy.estimate}
          </p>
          <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">
            {plan?.creditEstimate
              ? copy.creditsEstimated(plan.creditEstimate.estimatedCredits)
              : copy.previewPolicy}
          </p>
          {plan?.creditEstimate?.imageJobCount &&
          plan.creditEstimate.imageJobCount > 1 ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {copy.imageJobsEstimated(plan.creditEstimate.imageJobCount)}
            </p>
          ) : null}
          {plan?.creditEstimate && qualityModeRepairRounds ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {copy.imageJobsEstimatedWorstCase(
                plan.creditEstimate.imageJobCount ?? 1,
                (plan.creditEstimate.imageJobCount ?? 1) *
                  qualityModeRepairRounds
              )}
            </p>
          ) : null}
          {qualityModeControl ? (
            <div className="mt-2">{qualityModeControl}</div>
          ) : null}
        </div>
      </div>

      {blockers.length > 0 ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/50 dark:text-amber-100">
          <p className="font-semibold">{copy.autoBlockedStandardAvailable}</p>
          <ul className="mt-2 space-y-1">
            {blockers.map(blocker => (
              <li key={`${blocker.code}-${blocker.copyId}`}>
                {blocker.safeMessage}
                {blocker.nextAction ? ` ${blocker.nextAction}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
