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
  onGenerateShotPrompt?: (input: {
    shotId: number;
    stage: "image" | "video";
  }) => void;
  onGenerateShotContent?: (input: {
    shotId: number;
    stage: "summary" | "dialogue";
  }) => void;
  generatingPrompt?: {
    shotId: number;
    stage: "image" | "video" | "summary" | "dialogue";
  } | null;
  languagePlan?: {
    summaryLanguage: "th" | "en";
    dialogueLanguage: "th" | "en";
    promptLanguage: "th" | "en";
  };
  onLanguagePlanChange?: (plan: {
    summaryLanguage: "th" | "en";
    dialogueLanguage: "th" | "en";
    promptLanguage: "th" | "en";
  }) => void;
  /** Marketplace spare-image repair — swap a shot's live frame to an
   *  already-generated, already-paid-for alternate. Never charges credits. */
  onSelectShotAlternate: (input: { shotId: number; attempt: number }) => void;
  onEditShotImage?: (input: { shotId: number; instruction: string }) => void;
  onAcceptEditedShotImage?: (shotId: number) => void;
  onDiscardEditedShotImage?: (shotId: number) => void;
  onPollEditedShotImage?: (shotId: number) => void;
  imageEditSubmittingShotId?: number | null;
  imageEditResultByShot?: Record<number, { beforeUrl: string; afterUrl: string }>;
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
  onGenerateShotPrompt,
  onGenerateShotContent,
  generatingPrompt,
  languagePlan,
  onLanguagePlanChange,
  onSelectShotAlternate,
  onEditShotImage,
  onAcceptEditedShotImage,
  onDiscardEditedShotImage,
  onPollEditedShotImage,
  imageEditSubmittingShotId,
  imageEditResultByShot,
  locale,
}: SequentialShotReviewSectionProps) {
  const copy = getMarketplaceHyperframesUiCopy(locale);
  const thai = copy.locale === "th";

  if (shots.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900 dark:bg-violet-950/30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {copy.sequentialShotsTitle}
            </p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              {thai
                ? "เลือกภาษาแยกกันได้ เรื่องย่อ / บทพูด / Prompt ไม่เปลี่ยนข้อมูลเดิมจนกว่าจะกดสร้างใหม่"
                : "Choose summary, dialogue, and prompt languages independently. Existing content changes only when regenerated."}
            </p>
          </div>
        </div>
        {languagePlan && onLanguagePlanChange ? (
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {([
              ["summaryLanguage", thai ? "ภาษาเรื่องย่อ" : "Summary language"],
              ["dialogueLanguage", thai ? "ภาษาบทพูด" : "Dialogue language"],
              ["promptLanguage", thai ? "ภาษา Prompt ภาพ/วิดีโอ" : "Image/video prompt language"],
            ] as const).map(([key, label]) => (
              <label key={key} className="space-y-1 text-xs font-medium text-slate-700 dark:text-slate-200">
                <span>{label}</span>
                <select
                  value={languagePlan[key]}
                  onChange={event =>
                    onLanguagePlanChange({
                      ...languagePlan,
                      [key]: event.target.value as "th" | "en",
                    })
                  }
                  className="min-h-10 w-full rounded-md border border-violet-200 bg-white px-2 text-sm dark:border-violet-800 dark:bg-slate-900"
                  data-testid={`sequential-language-${key}`}
                >
                  <option value="th">ไทย</option>
                  <option value="en">English</option>
                </select>
              </label>
            ))}
          </div>
        ) : null}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {shots.map(shot => (
          <SequentialShotEditorCard
            // A prompt/story edit is persisted into the run metadata and the
            // parent refetches the run. Remount this one card when its
            // server-side revision changes so the generated prompt or saved
            // summary is visible immediately, without resetting other shots.
            key={`${shot.shotId}-${shot.editedAt ?? "initial"}`}
            shot={shot}
            imageMaxChars={budgets.imageMaxChars}
            videoMaxChars={budgets.videoMaxChars}
            busy={busyShotId === shot.shotId}
            saving={savingShotId === shot.shotId}
            swappingAlternate={swappingShotId === shot.shotId}
            error={
              shotError && shotError.shotId === shot.shotId
                ? shotError
                : undefined
            }
            onRegenerate={onRegenerateShot}
            onSaveEdits={onSaveShotEdits}
            onGeneratePrompt={onGenerateShotPrompt}
            onGenerateContent={onGenerateShotContent}
            generatingPromptStage={
              generatingPrompt?.shotId === shot.shotId
                ? generatingPrompt.stage
                : null
            }
            languagePlan={languagePlan}
            onSelectAlternate={onSelectShotAlternate}
            onEditImage={onEditShotImage}
            onAcceptEditedImage={onAcceptEditedShotImage}
            onDiscardEditedImage={onDiscardEditedShotImage}
            onPollEditedImage={onPollEditedShotImage}
            imageEditSubmitting={imageEditSubmittingShotId === shot.shotId}
            imageEditResult={imageEditResultByShot?.[shot.shotId] ?? null}
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
                  <span className="font-medium">
                    {copy.loopReportRound(round.round)}
                  </span>
                  {" — "}
                  {copy.loopReportCandidates(round.candidateCount)}
                  {typeof round.totalScore === "number"
                    ? ` · ${round.totalScore}`
                    : ""}
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
