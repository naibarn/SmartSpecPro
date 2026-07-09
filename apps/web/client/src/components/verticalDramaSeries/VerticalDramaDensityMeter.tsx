/**
 * VerticalDramaDensityMeter (spec feature 131, §7.7 ·
 * section-13-story-dialogue-density-reform — "Component Map").
 *
 * Episode-level dialogue coverage bar + per-shot chips, rendered inside
 * `VerticalDramaStoryboardPanel.tsx` behind `flags.speechBudget`
 * (`verticalDramaSeriesSpeechBudget`). Computes everything client-side from
 * clip duration + dialogue data the panel already has (`motionPromptPack`
 * joined with each storyboard shot's declared `silence_intent`) — no new
 * server round-trip, and no second speech-rate model: every number here goes
 * through the SAME canonical estimator
 * (`@shared/verticalDramaSeries/dialogueQuality`) the server uses for its own
 * gates.
 *
 * Documented interpretive decision — the "target band" (Copy Contract:
 * "บทพูดรวม {n} วิ จากเป้า {min}-{max} วิ"): `dialogueQuality.ts` exports a
 * single episode-level target (`MIN_EPISODE_COVERAGE_RATIO * totalDuration`,
 * the warning floor), not a min/max pair. This meter uses that exact value as
 * the band's `min` (the floor the analyzer itself already gates on) and sums
 * every clip's own `targetVerticalDramaSpeechSeconds(duration)` — the SAME
 * canonical per-clip target `analyzeVerticalDramaClipDialogueQuality` already
 * computes — as the band's `max`. No new constant or formula is introduced;
 * both ends are existing canonical outputs, just aggregated differently.
 *
 * 2026-07-08 W9-B addition (owner directive, spec §14.1 rule 6b
 * speakability) — a per-shot chip additionally shows a dedicated
 * "มีสัญลักษณ์ที่อ่านไม่ได้" badge when the clip's dialogue-quality issues
 * carry `VD_DIALOGUE_UNSPEAKABLE_SYMBOLS`. That code is not yet a member of
 * the shared `VerticalDramaDialogueQualityIssueCode` union (concurrent W9-A
 * wave adds `analyzeVerticalDramaLineSpeakability` to `dialogueQuality.ts`)
 * — `clipHasUnspeakableSymbolsIssue` below feature-detects it via a `string`
 * cast rather than importing/duplicating the rule itself, so this file never
 * re-derives speakability locally (only the canonical analyzer decides it).
 * The chip's single badge now has ONE shared priority order across five
 * possible reasons, extracted into `pickVerticalDramaDensityShotBadgeKind`
 * (exported standalone so the order itself is unit-testable without needing
 * the real analyzer to already emit the future code):
 *
 *   silence_intent > over_length > unspeakable > silence_gap > generic_issue
 *
 * See that function's own doc comment for why each rank is where it is.
 */

import { useMemo } from "react";
import { AlertTriangle, Mic } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  analyzeVerticalDramaClipDialogueQuality,
  analyzeVerticalDramaClipSilence,
  analyzeVerticalDramaEpisodeDialogueQuality,
  targetVerticalDramaSpeechSeconds,
  ERROR_EPISODE_COVERAGE_RATIO,
  MIN_EPISODE_COVERAGE_RATIO,
  type VerticalDramaClipSilenceAnalysis,
  type VerticalDramaDialogueClipQualityInput,
  type VerticalDramaDialogueQualityIssueCode,
  type VerticalDramaDialogueQualityLine,
  type VerticalDramaEpisodeDialogueQuality,
} from "@shared/verticalDramaSeries/dialogueQuality";
import type { VerticalDramaSilenceIntent } from "@shared/verticalDramaSeries/contentBudget";
import {
  vdCopy,
  vdCopyWithParams,
  vdDialogueIssueLabel,
  vdSilenceIntentLabel,
  vdWizardStepLabel,
  type VdLocale,
} from "./verticalDramaWorkspaceCopy";

/* -------------------------------------------------------------------------- */
/* Pure computation (exported for direct unit testing)                        */
/* -------------------------------------------------------------------------- */

export type VerticalDramaDensityCoverageState =
  | "in_range"
  | "underfilled_warning"
  | "underfilled_error";

export interface VerticalDramaDensityMeterClipInput extends VerticalDramaDialogueClipQualityInput {
  shotNumber: number;
  /** This shot's declared `silence_intent` (storyboard shot field, spec
   *  §7.7.2 Layer 3) — when present, the shot is EXEMPT from per-clip
   *  coverage/silence-gap warnings (still counted toward the episode floor). */
  silenceIntent?: VerticalDramaSilenceIntent;
}

export interface VerticalDramaDensityShotView {
  shotNumber: number;
  clipNumber?: number;
  durationSeconds: number;
  estimatedSpeechSeconds: number;
  targetSpeechSeconds: number;
  coverageRatio: number;
  silence: VerticalDramaClipSilenceAnalysis;
  silenceIntent?: VerticalDramaSilenceIntent;
  /** `false` whenever `silenceIntent` is set — declared visual-only shots are
   *  excluded from per-clip gates (spec §7.7.2 Layer 3). */
  hasBlockingIssue: boolean;
  hasWarningIssue: boolean;
  /** `true` when this clip's OWN estimated speech time exceeds its actual
   *  clip duration — the dialogue cannot physically fit in the shot's
   *  runtime, a distinct failure mode from "underfilled" (too little
   *  speech). Derived locally by comparing the SAME `estimatedSpeechSeconds`/
   *  `durationSeconds` values `analyzeVerticalDramaClipDialogueQuality`
   *  already computes — `dialogueQuality.ts` has no dedicated issue code for
   *  this yet, and no new speech-rate/ratio constant is introduced here
   *  either (spec §7.7.1: that file stays the one canonical speech-budget
   *  module). `false` whenever exempt via `silenceIntent` (Layer 3),
   *  matching every other per-clip issue flag below. */
  isOverLength: boolean;
  /** Code of the highest-severity non-exempt issue on this clip (error over
   *  warning), if any — lets the chip render a specific reason instead of a
   *  color-only red/amber tone when the issue is NOT a silence gap (e.g.
   *  stage direction, underfilled dialogue). `undefined` when exempt or
   *  issue-free. Localized at render time via `vdDialogueIssueLabel`. */
  issueCode?: VerticalDramaDialogueQualityIssueCode;
  /** `true` when this clip has a `VD_DIALOGUE_UNSPEAKABLE_SYMBOLS` issue
   *  (2026-07-08 W9-B, spec §14.1 rule 6b) — computed via
   *  `clipHasUnspeakableSymbolsIssue` below, independent of `issueCode`
   *  (which only ever holds ONE code) so a shot with BOTH an unspeakable-
   *  symbols issue and some other higher-severity issue still gets its
   *  dedicated badge. `false` whenever exempt via `silenceIntent`, and
   *  always `false` today (module header — the code does not exist in the
   *  shared union yet). */
  hasUnspeakableSymbols: boolean;
}

export interface VerticalDramaDensityMeterView {
  episode: VerticalDramaEpisodeDialogueQuality;
  coverageState: VerticalDramaDensityCoverageState;
  /** Band floor — `episode.targetSpeechSeconds` (`MIN_EPISODE_COVERAGE_RATIO * totalDuration`). */
  minTargetSeconds: number;
  /** Band ceiling — sum of every clip's own `targetVerticalDramaSpeechSeconds`. */
  maxTargetSeconds: number;
  shots: VerticalDramaDensityShotView[];
}

/**
 * `true` when ANY of a clip's dialogue-quality issues carries the
 * speakability violation code (2026-07-08 W9-B, spec §14.1 rule 6b,
 * `VD_DIALOGUE_UNSPEAKABLE_SYMBOLS`) — exported standalone so this exact
 * check is unit-testable with a hand-built issues array, independent of
 * whether the real `analyzeVerticalDramaClipDialogueQuality` already emits
 * the code (concurrent W9-A wave; `analyzeVerticalDramaLineSpeakability`
 * does not exist yet). The `as string` cast is required because that code
 * is not yet a member of the shared `VerticalDramaDialogueQualityIssueCode`
 * union — a direct `===` comparison against it would fail to compile today.
 * Always `false` for every real analyzer output right now (flags-off /
 * missing-code byte-identical).
 */
export function clipHasUnspeakableSymbolsIssue(
  issues: ReadonlyArray<{ code: VerticalDramaDialogueQualityIssueCode }>
): boolean {
  return issues.some(
    i => (i.code as string) === "VD_DIALOGUE_UNSPEAKABLE_SYMBOLS"
  );
}

/** `null` = nothing to show yet (no clips at all) — the caller must render
 *  nothing rather than a fake all-zero meter (section-13 State Matrix,
 *  "empty"). */
export function computeVerticalDramaDensityMeterView(
  clips: VerticalDramaDensityMeterClipInput[]
): VerticalDramaDensityMeterView | null {
  if (clips.length === 0) return null;

  const episode = analyzeVerticalDramaEpisodeDialogueQuality(clips);
  const coverageState: VerticalDramaDensityCoverageState =
    episode.coverageRatio < ERROR_EPISODE_COVERAGE_RATIO
      ? "underfilled_error"
      : episode.coverageRatio < MIN_EPISODE_COVERAGE_RATIO
        ? "underfilled_warning"
        : "in_range";

  const minTargetSeconds = episode.targetSpeechSeconds;
  const maxTargetSeconds = clips.reduce(
    (sum, c) =>
      sum + targetVerticalDramaSpeechSeconds(Math.max(0, c.durationSeconds)),
    0
  );

  const shots: VerticalDramaDensityShotView[] = clips
    .map(c => {
      const clipQuality = analyzeVerticalDramaClipDialogueQuality(c);
      const silence = analyzeVerticalDramaClipSilence(
        c.dialogue,
        c.durationSeconds
      );
      const exempt = Boolean(c.silenceIntent);
      return {
        shotNumber: c.shotNumber,
        clipNumber: c.clipNumber,
        durationSeconds: clipQuality.durationSeconds,
        estimatedSpeechSeconds: clipQuality.estimatedSpeechSeconds,
        targetSpeechSeconds: clipQuality.targetSpeechSeconds,
        coverageRatio: clipQuality.coverageRatio,
        silence,
        silenceIntent: c.silenceIntent,
        hasBlockingIssue:
          !exempt && clipQuality.issues.some(i => i.severity === "error"),
        hasWarningIssue:
          !exempt && clipQuality.issues.some(i => i.severity === "warning"),
        isOverLength:
          !exempt &&
          clipQuality.estimatedSpeechSeconds > clipQuality.durationSeconds,
        issueCode: !exempt
          ? (
              clipQuality.issues.find(i => i.severity === "error") ??
              clipQuality.issues.find(i => i.severity === "warning")
            )?.code
          : undefined,
        hasUnspeakableSymbols:
          !exempt && clipHasUnspeakableSymbolsIssue(clipQuality.issues),
      };
    })
    .sort((a, b) => a.shotNumber - b.shotNumber);

  return { episode, coverageState, minTargetSeconds, maxTargetSeconds, shots };
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export interface VerticalDramaDensityMeterProps {
  locale: VdLocale;
  clips: VerticalDramaDensityMeterClipInput[];
  /** "ซ่อมบททั้งตอน" — offered whenever coverage is not `in_range`. */
  onRepairWholeEpisode?: () => void;
  /**
   * Whether a REAL `dialogue_audio_plan` has been generated for this
   * episode yet (2026-07-08 wizard cross-link wave, spec owner confusion
   * #1) — `undefined` (the caller has not been updated) behaves exactly as
   * before (flags-off byte-identical): no forecast note is shown either
   * way. Only an explicit `false` shows the "these numbers are a forecast"
   * helper line under any "no dialogue on this shot" chips, since — before
   * the dialogue plan runs — every clip's `dialogue` here is either empty
   * or (at most) auto-recovered script-fallback text, never the real
   * per-shot plan. `true` (a real plan already exists) never shows it, even
   * if some individual shots are still genuinely silent.
   */
  dialoguePlanExists?: boolean;
  className?: string;
}

const COVERAGE_STATE_CLASSES: Record<
  VerticalDramaDensityCoverageState,
  string
> = {
  in_range:
    "border-emerald-400/50 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20",
  underfilled_warning:
    "border-amber-400/60 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20",
  underfilled_error: "border-destructive/60 bg-destructive/5",
};

const COVERAGE_BAR_CLASSES: Record<VerticalDramaDensityCoverageState, string> =
  {
    in_range: "bg-emerald-500",
    underfilled_warning: "bg-amber-500",
    underfilled_error: "bg-destructive",
  };

const COVERAGE_BADGE_VARIANT: Record<
  VerticalDramaDensityCoverageState,
  "secondary" | "outline" | "destructive"
> = {
  in_range: "secondary",
  underfilled_warning: "outline",
  underfilled_error: "destructive",
};

const COVERAGE_TEXT_CLASSES: Record<VerticalDramaDensityCoverageState, string> =
  {
    in_range: "text-emerald-600 dark:text-emerald-400",
    underfilled_warning: "text-amber-700 dark:text-amber-400",
    underfilled_error: "text-destructive",
  };

/**
 * "from" stop for the shot-chip list's bottom fade gradient (owner-reported
 * fix, 2026-07-08) — matches `COVERAGE_STATE_CLASSES`' own background tone
 * per coverage state so the fade blends into the card instead of showing a
 * mismatched plain-background box over a colored (amber/emerald/destructive)
 * card.
 */
const COVERAGE_FADE_CLASSES: Record<VerticalDramaDensityCoverageState, string> =
  {
    in_range: "from-emerald-50 dark:from-emerald-950/20",
    underfilled_warning: "from-amber-50 dark:from-amber-950/20",
    underfilled_error: "from-destructive/5",
  };

/**
 * Shot-chip list height-cap threshold (owner-reported fix, 2026-07-08,
 * screenshot review) — at or under this count every chip fits comfortably
 * without a height cap at all (natural wrap, nothing ever clipped mid-chip);
 * a normal single episode has exactly 9 shots, so this threshold keeps the
 * ordinary case fully uncapped. Above it, a taller cap (`max-h-56`, up from
 * the old fixed `max-h-40` that was clipping shots 7-9 mid-chip even for a
 * single episode) applies instead, with an always-visible scrollbar, a
 * bottom fade, and a one-line hint.
 */
export const DENSITY_SHOT_CHIPS_SCROLL_THRESHOLD = 12;

export function VerticalDramaDensityMeter({
  locale,
  clips,
  onRepairWholeEpisode,
  dialoguePlanExists,
  className,
}: VerticalDramaDensityMeterProps) {
  const t = vdCopy(locale);
  const view = useMemo(
    () => computeVerticalDramaDensityMeterView(clips),
    [clips]
  );

  if (!view) return null;

  const { episode, coverageState, minTargetSeconds, maxTargetSeconds, shots } =
    view;
  // 2026-07-08 wizard cross-link wave (spec owner confusion #1) — shown only
  // when the dialogue/audio step genuinely has not run yet AND at least one
  // chip is currently showing the "no dialogue on this shot" badge; a
  // caller that has not been updated (`dialoguePlanExists === undefined`)
  // never shows this (flags-off byte-identical).
  const showDialogueForecastNote =
    dialoguePlanExists === false && shots.some(s => s.issueCode === "VD_DIALOGUE_EMPTY");
  const stateLabel =
    coverageState === "in_range"
      ? t.densityStateInRange
      : coverageState === "underfilled_warning"
        ? t.densityStateUnderfilledWarning
        : t.densityStateUnderfilledError;
  const coverageLabel = vdCopyWithParams(t.densityEpisodeCoverageTemplate, {
    n: episode.totalSpeechSeconds.toFixed(1),
    min: minTargetSeconds.toFixed(0),
    max: maxTargetSeconds.toFixed(0),
  });
  const barPercent = Math.max(
    0,
    Math.min(100, Math.round(episode.coverageRatio * 100))
  );

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border p-3",
        COVERAGE_STATE_CLASSES[coverageState],
        className
      )}
      data-testid="vd-density-meter"
      data-state={coverageState}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Mic aria-hidden="true" className="h-4 w-4 shrink-0" />
          {t.densityMeterTitle}
        </span>
        <Badge
          variant={COVERAGE_BADGE_VARIANT[coverageState]}
          className="text-[10px]"
        >
          {stateLabel}
        </Badge>
      </div>

      <p
        className={cn(
          "text-sm font-semibold",
          COVERAGE_TEXT_CLASSES[coverageState]
        )}
      >
        {coverageLabel}
      </p>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={barPercent}
        aria-valuetext={`${stateLabel} — ${coverageLabel}`}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full transition-all",
            COVERAGE_BAR_CLASSES[coverageState]
          )}
          style={{ width: `${barPercent}%` }}
        />
      </div>

      {coverageState === "underfilled_error" ? (
        <p
          className="flex items-start gap-1.5 text-xs font-medium text-destructive"
          data-testid="vd-density-blocking-message"
        >
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
          />
          {t.densityUnderfilledBlockingMessage}
        </p>
      ) : null}

      {coverageState !== "in_range" && onRepairWholeEpisode ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-fit gap-1.5"
          onClick={onRepairWholeEpisode}
          data-testid="vd-density-repair-whole-episode"
        >
          {t.repairWholeEpisodeScript}
        </Button>
      ) : null}

      {(() => {
        const shotChips = shots.map(shot => (
          <DensityShotChip
            key={`${shot.shotNumber}-${shot.clipNumber ?? "main"}`}
            shot={shot}
            locale={locale}
            t={t}
          />
        ));

        // Owner-reported fix (2026-07-08) — a normal single episode (9
        // shots) never gets a height cap at all, so nothing is ever clipped
        // mid-chip. Only a genuinely long list gets the (taller, clearly
        // scrollable) cap.
        if (shots.length <= DENSITY_SHOT_CHIPS_SCROLL_THRESHOLD) {
          return (
            <ul
              className="flex flex-wrap gap-1.5"
              aria-label={t.densityMeterTitle}
              data-testid="vd-density-shot-chips"
            >
              {shotChips}
            </ul>
          );
        }

        return (
          <div className="relative">
            <ScrollArea
              type="always"
              className="max-h-56"
              data-testid="vd-density-shot-chips-scroll"
            >
              <ul
                className="flex flex-wrap gap-1.5 pr-2 pb-1"
                aria-label={t.densityMeterTitle}
                data-testid="vd-density-shot-chips"
              >
                {shotChips}
              </ul>
            </ScrollArea>
            <div
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t to-transparent",
                COVERAGE_FADE_CLASSES[coverageState]
              )}
            />
            <p
              className="text-[11px] text-muted-foreground"
              data-testid="vd-density-shot-chips-scroll-hint"
            >
              {t.densityShotChipsScrollHint}
            </p>
          </div>
        );
      })()}

      {showDialogueForecastNote ? (
        <p
          className="text-[11px] italic text-muted-foreground"
          data-testid="vd-density-dialogue-forecast-note"
        >
          {vdCopyWithParams(t.densityDialogueForecastNoteTemplate, {
            step: vdWizardStepLabel("dialogue_audio", locale),
          })}
        </p>
      ) : null}
    </div>
  );
}

/** The one badge (at most) a shot chip renders. */
export type VerticalDramaDensityShotBadgeKind =
  | "silence_intent"
  | "over_length"
  | "unspeakable"
  | "silence_gap"
  | "generic_issue"
  | "none";

/**
 * Chooses exactly ONE badge kind for a shot chip, in priority order
 * (2026-07-08 W9-B, owner directive, spec §14.1 rule 6b speakability —
 * extracted from the pre-existing over-length/silence-gap/generic-issue
 * chain so the new speakability rank is documented AND independently unit-
 * testable with hand-built fixtures, no real analyzer output required):
 *
 *   1. `silence_intent` — a declared visual-only shot (spec §7.7.2 Layer 3)
 *      is fully exempt from every other per-clip issue badge — checked
 *      first, unconditionally.
 *   2. `over_length`    — dialogue physically cannot fit the clip's
 *      runtime (2026-07-08 fix) — the most urgent, unambiguous failure.
 *   3. `unspeakable`    — the clip has a `VD_DIALOGUE_UNSPEAKABLE_SYMBOLS`
 *      issue (spec §14.1 rule 6b) — ranked above a silence gap because it
 *      means EVERY line has a real defect, not just a portion of the
 *      clip's runtime being quiet.
 *   4. `silence_gap`    — a continuous silence run exceeding the limit.
 *   5. `generic_issue`  — any other non-exempt blocking/warning issue
 *      (duplicate dialogue, stage direction, no dialogue at all, etc.) —
 *      the existing catch-all.
 *   6. `none`           — no non-exempt issue at all.
 */
export function pickVerticalDramaDensityShotBadgeKind(
  shot: Pick<
    VerticalDramaDensityShotView,
    | "silenceIntent"
    | "isOverLength"
    | "hasUnspeakableSymbols"
    | "silence"
    | "hasBlockingIssue"
    | "hasWarningIssue"
    | "issueCode"
  >
): VerticalDramaDensityShotBadgeKind {
  if (shot.silenceIntent) return "silence_intent";
  if (shot.isOverLength) return "over_length";
  if (shot.hasUnspeakableSymbols) return "unspeakable";
  if (shot.silence.exceedsLimit) return "silence_gap";
  if ((shot.hasBlockingIssue || shot.hasWarningIssue) && shot.issueCode) {
    return "generic_issue";
  }
  return "none";
}

function DensityShotChip({
  shot,
  locale,
  t,
}: {
  shot: VerticalDramaDensityShotView;
  locale: VdLocale;
  t: ReturnType<typeof vdCopy>;
}) {
  const chipLabel = vdCopyWithParams(t.densityShotLabelTemplate, {
    n: shot.shotNumber,
  });
  const estimateLabel = vdCopyWithParams(t.densityShotEstimateTemplate, {
    est: shot.estimatedSpeechSeconds.toFixed(1),
    target: shot.targetSpeechSeconds.toFixed(1),
  });
  const badgeKind = pickVerticalDramaDensityShotBadgeKind(shot);
  const gapBadgeText = vdCopyWithParams(t.densitySilenceGapBadgeTemplate, {
    n: shot.silence.maxContinuousSilenceSeconds.toFixed(1),
  });
  const overLengthText = vdCopyWithParams(t.densityShotOverLengthTemplate, {
    est: shot.estimatedSpeechSeconds.toFixed(1),
    duration: shot.durationSeconds.toFixed(1),
  });
  // 2026-07-08 wizard cross-link wave — actionable next step for an
  // over-length chip, always shown alongside the badge (unconditional on
  // dialogue-plan state — an over-length problem is real and actionable
  // whether or not the dialogue plan has run yet).
  const overLengthHintText = vdCopyWithParams(t.densityOverLengthHintTemplate, {
    step: vdWizardStepLabel("dialogue_audio", locale),
    repair: t.repairWholeEpisodeScript,
  });
  // Generic issue badge text — covers non-silence blocking/warning issues
  // (stage direction, underfilled dialogue, etc.) that would otherwise
  // leave the chip's red/amber tone with no accompanying text (color-only).
  const genericIssueText = shot.issueCode
    ? vdDialogueIssueLabel(shot.issueCode, locale)
    : undefined;

  const toneClass = shot.silenceIntent
    ? "border-border bg-muted/40"
    : shot.hasBlockingIssue || shot.isOverLength
      ? "border-destructive/50 bg-destructive/5"
      : shot.hasWarningIssue
        ? "border-amber-400/60 bg-amber-50 dark:bg-amber-950/20"
        : "border-border bg-background";

  return (
    <li
      className={cn(
        "min-w-[92px] rounded-md border px-2 py-1.5 text-[11px]",
        toneClass
      )}
      data-testid={`vd-density-shot-chip-${shot.shotNumber}`}
    >
      <p className="font-medium">{chipLabel}</p>
      <p className="text-muted-foreground">{estimateLabel}</p>
      {badgeKind === "silence_intent" && shot.silenceIntent ? (
        <p
          className="mt-0.5 italic text-muted-foreground"
          data-testid={`vd-density-silence-intent-${shot.shotNumber}`}
        >
          {vdSilenceIntentLabel(shot.silenceIntent, locale)}
        </p>
      ) : badgeKind === "over_length" ? (
        <>
          <span
            aria-label={overLengthText}
            className="mt-0.5 inline-flex items-center gap-1 rounded border border-destructive/50 bg-destructive/10 px-1 py-0.5 text-destructive"
            data-testid={`vd-density-overlength-${shot.shotNumber}`}
          >
            <AlertTriangle aria-hidden="true" className="h-3 w-3 shrink-0" />
            {overLengthText}
          </span>
          <p
            className="mt-0.5 text-muted-foreground"
            data-testid={`vd-density-overlength-hint-${shot.shotNumber}`}
          >
            {overLengthHintText}
          </p>
        </>
      ) : badgeKind === "unspeakable" ? (
        <span
          aria-label={t.densityUnspeakableSymbolsBadge}
          className="mt-0.5 inline-flex items-center gap-1 rounded border border-amber-400 bg-amber-100/70 px-1 py-0.5 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
          data-testid={`vd-density-unspeakable-${shot.shotNumber}`}
        >
          <AlertTriangle aria-hidden="true" className="h-3 w-3 shrink-0" />
          {t.densityUnspeakableSymbolsBadge}
        </span>
      ) : badgeKind === "silence_gap" ? (
        <span
          aria-label={gapBadgeText}
          className="mt-0.5 inline-flex items-center gap-1 rounded border border-amber-400 bg-amber-100/70 px-1 py-0.5 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
          data-testid={`vd-density-silence-gap-${shot.shotNumber}`}
        >
          <AlertTriangle aria-hidden="true" className="h-3 w-3 shrink-0" />
          {gapBadgeText}
        </span>
      ) : badgeKind === "generic_issue" && genericIssueText ? (
        <span
          className={cn(
            "mt-0.5 inline-flex items-center gap-1 rounded border px-1 py-0.5",
            shot.hasBlockingIssue
              ? "border-destructive/50 bg-destructive/10 text-destructive"
              : "border-amber-400 bg-amber-100/70 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
          )}
          data-testid={`vd-density-issue-badge-${shot.shotNumber}`}
        >
          <AlertTriangle aria-hidden="true" className="h-3 w-3 shrink-0" />
          {genericIssueText}
        </span>
      ) : null}
    </li>
  );
}

export default VerticalDramaDensityMeter;
