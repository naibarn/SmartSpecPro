/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 11 §6.5. Card list + Loop Report for the Storyboard Review page.
 * Renders `null` when `shots.length === 0` — this is what makes the
 * section self-disable for legacy 3x3 runs with zero page-level strategy
 * branching beyond the caller's `enabled` guard (spec §6.9).
 */
import type {
  SequentialLoopReportModel,
  SequentialShotCardModel,
} from "@/lib/marketplaceSequentialStoryboardUi";
import {
  SequentialShotEditorCard,
  type SequentialShotEditorCardSaveInput,
  type SequentialShotEditorCardShotError,
} from "./SequentialShotEditorCard";
import {
  getMarketplaceHyperframesUiCopy,
  type MarketplaceHyperframesUiLocale,
} from "./hyperframesUiCopy";

export interface SequentialShotReviewSectionProps {
  shots: SequentialShotCardModel[];
  loopReport?: SequentialLoopReportModel | null;
  budgets: { imageMaxChars: number; videoMaxChars: number };
  busyShotId?: number | null;
  savingShotId?: number | null;
  /** Marketplace spare-image repair — the shot whose swap mutation is
   *  currently in flight, following the same nullable-single-id convention
   *  as `busyShotId`/`savingShotId`. */
  swappingShotId?: number | null;
  shotError?: SequentialShotEditorCardShotError | null;
  onRegenerateShot: (shotId: number) => void;
  onSaveShotEdits: (input: SequentialShotEditorCardSaveInput) => void;
  /** Marketplace spare-image repair — swap a shot's live frame to an
   *  already-generated, already-paid-for alternate. Never charges credits. */
  onSelectShotAlternate: (input: { shotId: number; attempt: number }) => void;
  locale?: MarketplaceHyperframesUiLocale | string;
}

export function SequentialShotReviewSection({
  shots,
  loopReport,
  budgets,
  busyShotId,
  savingShotId,
  swappingShotId,
  shotError,
  onRegenerateShot,
  onSaveShotEdits,
  onSelectShotAlternate,
  locale,
}: SequentialShotReviewSectionProps) {
  const copy = getMarketplaceHyperframesUiCopy(locale);
  const thai = copy.locale === "th";

  if (shots.length === 0) return null;

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {copy.sequentialShotsTitle}
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {shots.map(shot => (
          <SequentialShotEditorCard
            key={shot.shotId}
            shot={shot}
            imageMaxChars={budgets.imageMaxChars}
            videoMaxChars={budgets.videoMaxChars}
            busy={busyShotId === shot.shotId}
            saving={savingShotId === shot.shotId}
            swappingAlternate={swappingShotId === shot.shotId}
            error={shotError && shotError.shotId === shot.shotId ? shotError : undefined}
            onRegenerate={onRegenerateShot}
            onSaveEdits={onSaveShotEdits}
            onSelectAlternate={onSelectShotAlternate}
            locale={locale}
          />
        ))}
      </div>

      {loopReport ? (
        <div className="space-y-2 rounded-lg border bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {copy.loopReportTitle}
          </p>
          {loopReport.rounds.length > 0 ? (
            <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
              {loopReport.rounds.map(round => (
                <li key={round.round}>
                  <span className="font-medium">{copy.loopReportRound(round.round)}</span>
                  {" — "}
                  {copy.loopReportCandidates(round.candidateCount)}
                  {typeof round.totalScore === "number" ? ` · ${round.totalScore}` : ""}
                  {round.disqualified ? (
                    <span className="ml-1 font-medium text-red-700 dark:text-red-300">
                      {thai ? "ไม่ผ่านเกณฑ์" : "disqualified"}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {loopReport.selectedVersion ? (
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
              {copy.loopReportSelected(loopReport.selectedVersion)}
            </p>
          ) : null}
          {loopReport.degradedFallback ? (
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
              {copy.loopReportDegraded}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
