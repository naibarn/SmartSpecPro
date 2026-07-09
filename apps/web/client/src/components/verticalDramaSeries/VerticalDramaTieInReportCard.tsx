/**
 * VerticalDramaTieInReportCard (spec feature 131, §13.1 ·
 * section-08-provider-qc-product-tie-in "Production-Grade Tie-In Naturalness
 * QC" · section-14 Component Map).
 *
 * Renders the `VerticalDramaTieInQualityReport` returned by
 * `getEpisodeDetail.tieInQualityReport` / `runEpisodeQualityReview` /
 * `applyQualityReviewSuggestions` (server:
 * `server/services/verticalDramaProductTieIn.ts`) behind
 * `flags.tieInQc` (`verticalDramaSeriesTieInQc`) — this component only ever
 * renders when its caller already found the flag on (mirrors
 * `VerticalDramaBlendReportPanel`'s own "caller decides, no internal flag
 * check" convention), so it never needs its own flag check.
 *
 * `naturalnessScore` (0-100) vs the policy floor, passed/failed as TEXT (not
 * color-only), every deterministic violation the server computed
 * (spoken-mention cap, visual-shot cap, ad-speak lexicon hits, flagged
 * claims, disclosure separation, fatigue), and two CTAs: "ปรับตามคำแนะนำ"
 * (routes into the section-14 auto-improve loop — the actual mutation is the
 * SAME `applyQualityReviewSuggestions({loop:true})` the scorecard panel's own
 * loop CTA calls, wired by the caller) and "เลื่อนสินค้าไปตอนถัดไป"
 * (`deferEpisodeTieIn`, confirm-gated — explains the strip + deferral-history
 * effect before submitting).
 */

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Wand2,
  XCircle,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  vdCopy,
  vdCopyWithParams,
  type VdLocale,
} from "./verticalDramaWorkspaceCopy";

/**
 * Mirrors `VD_TIE_IN_MAX_SPOKEN_MENTIONS` / `VD_TIE_IN_MAX_VISUAL_SHOTS`
 * (`server/services/verticalDramaProductTieIn.ts`) — duplicated here (not
 * imported) since that module lives under `server/services/`, not `@shared/`,
 * matching this file family's existing small-server-constant duplication
 * convention (see `VD_PRODUCT_REFERENCE_IMAGE_CAP` in
 * `VerticalDramaStoryboardPanel.tsx`). Display-only; the server enforces the
 * actual caps.
 */
const VD_TIE_IN_MAX_SPOKEN_MENTIONS = 2;
const VD_TIE_IN_MAX_VISUAL_SHOTS = 3;

/** Client-facing view of `VerticalDramaTieInQualityReport`
 *  (`server/services/verticalDramaProductTieIn.ts`) — re-declared locally
 *  (not imported) so this presentational component stays decoupled from the
 *  server module, matching every other `*View` type in this component
 *  family. Field-for-field identical. */
export interface VerticalDramaTieInReportView {
  storyIntegration: number;
  characterMotivation: number;
  toneMatch: number;
  tieInAssessment?: string;
  spokenMentionCount: number;
  visualShotCount: number;
  adSpeakViolations: string[];
  claimViolations: string[];
  disclosureSeparated: boolean;
  fatigueOk: boolean;
  naturalnessScore: number;
  passed: boolean;
}

/**
 * Season-plan tie-in placement for this episode (task #31, spec
 * §7.7.2/§7.7.3) — `getEpisodeDetail.seasonTieInPlacement`, field-for-field
 * subset of `VerticalDramaEpisodeTieInPlacement`. Re-declared locally (not
 * imported), matching this component's own established decoupling
 * convention (see `VerticalDramaTieInReportView`'s doc comment above).
 */
export interface VerticalDramaSeasonTieInPlacementView {
  planned: boolean;
  movedFromEpisodeNumber?: number;
}

export interface VerticalDramaTieInReportCardProps {
  locale: VdLocale;
  /** `null`/`undefined` = tie-in is enabled but no report has been produced
   *  yet (Gate 0b locks on this same as an explicit failing report). */
  report?: VerticalDramaTieInReportView | null;
  /** `policy.tieInMinNaturalnessScore` (default 70). */
  naturalnessFloor: number;
  /** "ปรับตามคำแนะนำ" — routes into the section-14 loop CTA. */
  onApplyRecommendations?: () => void;
  applyingRecommendations?: boolean;
  /** "เลื่อนสินค้าไปตอนถัดไป" — `deferEpisodeTieIn`. */
  onDefer?: () => void;
  deferring?: boolean;
  /** `deferEpisodeTieIn`'s `scheduleAtRisk` — shown after a defer whenever
   *  the series can no longer meet its tie-in schedule target. */
  scheduleAtRisk?: boolean;
  /**
   * Task #31 (spec §7.7.2/§7.7.3, added 2026-07-09) — season-plan status
   * line ("ตามแผนซีซั่น: ตอนนี้มีสินค้า (ย้ายมาจากตอนที่ X)" /
   * "ตอนนี้ไม่มีสินค้าตามแผน"). `null`/`undefined` renders nothing
   * (grandfather: `verticalDramaSeriesArcReplan` off, or a legacy series
   * whose breakdown has no `tieIn` field for this episode yet).
   */
  seasonTieInPlacement?: VerticalDramaSeasonTieInPlacementView | null;
  className?: string;
}

export function VerticalDramaTieInReportCard({
  locale,
  report,
  naturalnessFloor,
  onApplyRecommendations,
  applyingRecommendations = false,
  onDefer,
  deferring = false,
  scheduleAtRisk = false,
  seasonTieInPlacement,
  className,
}: VerticalDramaTieInReportCardProps) {
  const t = vdCopy(locale);
  const [confirmingDefer, setConfirmingDefer] = useState(false);

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-3",
        className
      )}
      data-testid="vd-tie-in-report-card"
    >
      <h3 className="flex items-center gap-1.5 text-sm font-medium">
        <ShieldCheck aria-hidden="true" className="h-4 w-4" />
        {t.tieInReportTitle}
      </h3>
      {seasonTieInPlacement ? (
        <p className="text-xs text-muted-foreground" data-testid="vd-tie-in-season-plan-status">
          {seasonTieInPlacement.planned
            ? seasonTieInPlacement.movedFromEpisodeNumber != null
              ? vdCopyWithParams(t.tieInSeasonPlanMovedFromTemplate, {
                  fromEpisode: seasonTieInPlacement.movedFromEpisodeNumber,
                })
              : t.tieInSeasonPlanPlannedText
            : t.tieInSeasonPlanNotPlannedText}
        </p>
      ) : null}
      <div className="grid gap-3 text-sm">
        {!report ? (
          <p
            className="text-xs text-muted-foreground"
            data-testid="vd-tie-in-no-report"
          >
            {t.tieInNoReportYet}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "text-sm font-semibold",
                  report.passed
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-destructive"
                )}
              >
                {vdCopyWithParams(t.tieInNaturalnessScoreTemplate, {
                  score: report.naturalnessScore,
                  floor: naturalnessFloor,
                })}
              </span>
              <TieInPassedBadge locale={locale} passed={report.passed} />
            </div>

            {report.tieInAssessment ? (
              <p className="break-words text-xs text-muted-foreground">
                {report.tieInAssessment}
              </p>
            ) : null}

            <ul
              className="grid grid-cols-1 gap-1.5 sm:grid-cols-2"
              data-testid="vd-tie-in-violation-list"
            >
              <ViolationRow
                ok={report.spokenMentionCount <= VD_TIE_IN_MAX_SPOKEN_MENTIONS}
                label={vdCopyWithParams(t.tieInSpokenMentionsTemplate, {
                  n: report.spokenMentionCount,
                  max: VD_TIE_IN_MAX_SPOKEN_MENTIONS,
                })}
              />
              <ViolationRow
                ok={report.visualShotCount <= VD_TIE_IN_MAX_VISUAL_SHOTS}
                label={vdCopyWithParams(t.tieInVisualShotsTemplate, {
                  n: report.visualShotCount,
                  max: VD_TIE_IN_MAX_VISUAL_SHOTS,
                })}
              />
              <ViolationRow
                ok={report.adSpeakViolations.length === 0}
                label={vdCopyWithParams(t.tieInAdSpeakViolationsTemplate, {
                  n: report.adSpeakViolations.length,
                })}
              />
              <ViolationRow
                ok={report.claimViolations.length === 0}
                label={vdCopyWithParams(t.tieInClaimViolationsTemplate, {
                  n: report.claimViolations.length,
                })}
              />
              <ViolationRow
                ok={report.disclosureSeparated}
                label={
                  report.disclosureSeparated
                    ? t.tieInDisclosureOk
                    : t.tieInDisclosureFail
                }
              />
              <ViolationRow
                ok={report.fatigueOk}
                label={report.fatigueOk ? t.tieInFatigueOk : t.tieInFatigueFail}
              />
            </ul>

            {!report.passed ? (
              <p
                className="flex items-start gap-1.5 text-xs font-medium text-destructive"
                data-testid="vd-tie-in-blocked-hint"
              >
                <AlertTriangle
                  aria-hidden="true"
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                />
                {t.tieInBlockedHint}
              </p>
            ) : null}
          </>
        )}

        {scheduleAtRisk ? (
          <p
            className="text-xs text-amber-700 dark:text-amber-400"
            data-testid="vd-tie-in-schedule-at-risk"
          >
            {t.tieInScheduleAtRiskNote}
          </p>
        ) : null}

        {(onApplyRecommendations || onDefer) && report && !report.passed ? (
          <div className="flex flex-col gap-2 border-t border-border pt-2">
            <AlertDialog open={confirmingDefer} onOpenChange={setConfirmingDefer}>
              <AlertDialogContent data-testid="vd-tie-in-defer-confirm">
                <AlertDialogHeader>
                  <AlertDialogTitle>{t.tieInDeferConfirmTitle}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t.tieInDeferConfirmExplain}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deferring}>
                    {t.cancel}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    disabled={deferring}
                    onClick={() => onDefer?.()}
                    className={cn(buttonVariants({ variant: "destructive" }))}
                    data-testid="vd-tie-in-defer-confirm-submit"
                  >
                    {deferring ? (
                      <Loader2
                        aria-hidden="true"
                        className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                      />
                    ) : null}
                    {deferring ? t.tieInDeferring : t.confirm}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <div className="flex flex-wrap gap-2">
              {onApplyRecommendations ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={applyingRecommendations}
                  onClick={onApplyRecommendations}
                  data-testid="vd-tie-in-apply-recommendations"
                >
                  {applyingRecommendations ? (
                    <Loader2
                      aria-hidden="true"
                      className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                    />
                  ) : (
                    <Wand2 aria-hidden="true" className="h-3.5 w-3.5" />
                  )}
                  {t.tieInApplyRecommendationsCta}
                </Button>
              ) : null}
              {onDefer ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={deferring || confirmingDefer}
                  onClick={() => setConfirmingDefer(true)}
                  data-testid="vd-tie-in-defer"
                >
                  {t.tieInDeferCta}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TieInPassedBadge({
  locale,
  passed,
}: {
  locale: VdLocale;
  passed: boolean;
}) {
  const t = vdCopy(locale);
  return (
    <Badge
      variant={passed ? "secondary" : "destructive"}
      className="gap-1 text-[10px]"
      data-testid="vd-tie-in-passed-badge"
    >
      {passed ? (
        <CheckCircle2 aria-hidden="true" className="h-3 w-3" />
      ) : (
        <XCircle aria-hidden="true" className="h-3 w-3" />
      )}
      {passed ? t.tieInPassedBadge : t.tieInFailedBadge}
    </Badge>
  );
}

function ViolationRow({ ok, label }: { ok: boolean; label: string }) {
  const Icon = ok ? CheckCircle2 : AlertTriangle;
  return (
    <li className="flex items-start gap-1.5 text-xs">
      <Icon
        aria-hidden="true"
        className={cn(
          "mt-0.5 h-3.5 w-3.5 shrink-0",
          ok ? "text-emerald-600" : "text-destructive"
        )}
      />
      <span className={ok ? undefined : "font-medium text-destructive"}>
        {label}
      </span>
    </li>
  );
}

export default VerticalDramaTieInReportCard;
