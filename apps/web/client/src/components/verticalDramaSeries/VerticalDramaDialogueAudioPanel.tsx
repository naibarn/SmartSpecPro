/**
 * VerticalDramaDialogueAudioPanel (spec feature 131, section-07 · §14 / §6.8;
 * W12-B voice chain wave adds the whole-episode dialogue TTS batch block).
 *
 * Read-only presentational summary of an episode's dialogue/audio/subtitle plan
 * shown before paid generation. Purely props-driven (no data fetching) so it can
 * be dropped into the episode audio stage or the Storyboard Review metadata
 * surface. Covers the section's State Matrix (loading / empty / error / success)
 * and Accessibility Acceptance:
 *  - dialogue lines carry visible speaker labels,
 *  - warnings are text-visible (icon + text), never color-only,
 *  - copy distinguishes separate TTS from native video audio.
 *
 * W12-B addition: the optional `batch` prop threads in the whole-episode
 * dialogue TTS batch UI (ready/total summary, primary "generate all" action,
 * missing-voice-casting banner, and a per-line status chip + inline
 * `<audio>` player appended to each existing dialogue-line row). `batch` is
 * `undefined` whenever the `verticalDramaSeriesVoiceChain` tenant flag is
 * off (or the plan has no separate-TTS strategy) — every element this wave
 * adds is gated on `batch` being present, so flag-off markup is BYTE-
 * IDENTICAL to before this wave. All mutation/poll state lives in the caller
 * (`VerticalDramaEpisodePage.tsx`), mirroring `clip.videoTask`'s submit ->
 * poll `media.getTask` -> persist-on-completion convention; this component
 * stays purely props-driven throughout.
 */

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Film,
  Loader2,
  Mic,
  RefreshCw,
  Subtitles,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import type {
  VerticalDramaAudioStrategy,
  VerticalDramaDialogueAudioPlan,
} from "@shared/verticalDramaSeries/audio";
import { computeRegenerationImpact } from "@shared/verticalDramaSeries/audio";
import {
  vdCopy,
  vdCopyWithParams,
  type VdLocale,
} from "@/components/verticalDramaSeries/verticalDramaWorkspaceCopy";

/** Human-facing, localizable label per audio strategy (distinct copy per §Copy Contract). */
const AUDIO_STRATEGY_LABEL: Record<VerticalDramaAudioStrategy, string> = {
  separate_tts_voiceover: "Separate TTS voiceover (audio track generated apart from video)",
  dialogue_tts: "Dialogue TTS (multi-speaker, generated apart from video)",
  native_video_audio: "Native video audio (speech baked into the generated video)",
  silent: "Silent (no audio planned)",
};

/* -------------------------------------------------------------------------- */
/* W12-B — whole-episode dialogue TTS batch: pure helpers (exported for       */
/* direct unit testing) + types.                                              */
/* -------------------------------------------------------------------------- */

export type VerticalDramaAudioLineStatus = "blocked" | "queued" | "generating" | "ready" | "failed";

export interface VerticalDramaDialogueAudioLineBatchView {
  status: VerticalDramaAudioLineStatus;
  audioUrl?: string;
  blockReason?: string;
}

export interface VerticalDramaDialogueAudioBatchData {
  /** Resolved per-line status/playback, keyed by `lineId` — built by the
   *  caller from `plan.separateTtsPlan.items` merged with its own
   *  session-local "just failed" tracking (a failed submit clears the
   *  persisted `audioTask`, mirroring `clip.videoTask`'s failure handling —
   *  see `VerticalDramaEpisodePage.tsx`'s `resolveDialogueAudioLineStatus`). */
  lineStatusByLineId: Record<string, VerticalDramaDialogueAudioLineBatchView>;
  /** Lines eligible for a first submit right now (not blocked/ready/generating). */
  pendingCount: number;
  generating: boolean;
  onGenerateBatch: () => void;
  onRetryLine?: (lineId: string) => void;
  /** `${VERTICAL_DRAMA_BASE_PATH}/{seriesId}?tab=characters` — built by the
   *  caller (`verticalDramaRoutes.seriesDetail`), so this component never
   *  needs to know the series id or route-building convention itself. */
  castingTabHref: string;
}

/** Ready/total dialogue-line counts for the summary row — pure, derived
 *  entirely from `plan.separateTtsPlan.items`. `{0, 0}` when there is no
 *  separate-TTS plan yet (native-audio/silent strategies, or no plan). */
export function summarizeDialogueAudioReadiness(
  plan: Pick<VerticalDramaDialogueAudioPlan, "separateTtsPlan"> | null | undefined,
): { readyCount: number; totalCount: number } {
  const items = plan?.separateTtsPlan?.items ?? [];
  return {
    readyCount: items.filter((item) => Boolean(item.audioTask?.audioUrl)).length,
    totalCount: items.length,
  };
}

/** Speaker names with no resolved voice id (`speakerVoiceMap` entries
 *  flagged `missingVoiceId`) — drives the missing-casting banner. Pure,
 *  order-preserving. */
export function getMissingVoiceSpeakerNames(
  plan: Pick<VerticalDramaDialogueAudioPlan, "speakerVoiceMap"> | null | undefined,
): string[] {
  return (plan?.speakerVoiceMap?.entries ?? [])
    .filter((entry) => entry.missingVoiceId)
    .map((entry) => entry.speakerName);
}

const AUDIO_LINE_STATUS_ICON: Record<VerticalDramaAudioLineStatus, LucideIcon> = {
  blocked: AlertTriangle,
  queued: Clock,
  generating: Loader2,
  ready: CheckCircle2,
  failed: AlertTriangle,
};

interface VerticalDramaDialogueAudioPanelProps {
  plan?: VerticalDramaDialogueAudioPlan | null;
  loading?: boolean;
  error?: string | null;
  /** Called when the empty-state create/regenerate CTA is pressed. */
  onGenerate?: () => void;
  className?: string;
  /** W12-B voice chain wave — see the module doc comment above. */
  batch?: VerticalDramaDialogueAudioBatchData;
  locale?: VdLocale;
}

export function VerticalDramaDialogueAudioPanel({
  plan,
  loading = false,
  error = null,
  onGenerate,
  className,
  batch,
  locale = "en",
}: VerticalDramaDialogueAudioPanelProps) {
  // Hooks must run unconditionally on every render (before the early
  // loading/error/empty returns below) — this is the only local UI state
  // this otherwise-stateless panel owns.
  const [confirmingBatch, setConfirmingBatch] = useState(false);
  const t = vdCopy(locale);

  if (loading) {
    return (
      <section
        aria-label="Dialogue and audio plan"
        aria-busy="true"
        className={cn("rounded-lg border border-border p-4 text-sm text-muted-foreground", className)}
      >
        <p>Generating dialogue and audio plan…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section
        aria-label="Dialogue and audio plan"
        className={cn("rounded-lg border border-destructive/50 p-4 text-sm", className)}
      >
        <p className="flex items-center gap-2 font-medium text-destructive">
          <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>Audio plan error: {error}</span>
        </p>
      </section>
    );
  }

  if (!plan) {
    return (
      <section
        aria-label="Dialogue and audio plan"
        className={cn("rounded-lg border border-dashed border-border p-4 text-sm", className)}
      >
        <p className="text-muted-foreground">No dialogue/audio plan yet.</p>
        {onGenerate && (
          <button
            type="button"
            onClick={onGenerate}
            className="mt-3 rounded-md border border-border px-3 py-1.5 font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Create audio plan
          </button>
        )}
      </section>
    );
  }

  const impact = computeRegenerationImpact(plan.audioStrategy);
  const isNative = plan.audioStrategy === "native_video_audio";
  const { readyCount, totalCount } = summarizeDialogueAudioReadiness(plan);
  const missingCastSpeakers = getMissingVoiceSpeakerNames(plan);

  return (
    <section
      aria-label="Dialogue and audio plan"
      className={cn("flex flex-col gap-4 rounded-lg border border-border p-4 text-sm", className)}
    >
      {/* Strategy + mode */}
      <header className="flex flex-col gap-1">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          {isNative ? (
            <Film aria-hidden="true" className="h-4 w-4 shrink-0" />
          ) : (
            <Volume2 aria-hidden="true" className="h-4 w-4 shrink-0" />
          )}
          <span>Audio plan</span>
        </h3>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Mode:</span>{" "}
          {plan.mode === "narrator" ? "Narrator / voiceover" : "Named-speaker dialogue"}
        </p>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Strategy:</span>{" "}
          {AUDIO_STRATEGY_LABEL[plan.audioStrategy]}
        </p>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">On script change:</span> {impact.message}
        </p>
      </header>

      {/* W12-B whole-episode dialogue TTS batch — gated on `batch` AND a
          separate-TTS plan existing (native-audio/silent plans have neither
          per-line audio tasks nor anything to batch-generate). */}
      {batch && plan.separateTtsPlan && (
        <div
          className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3"
          data-testid="vd-dialogue-audio-batch"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium" data-testid="vd-dialogue-audio-summary">
              {vdCopyWithParams(t.dialogueAudioSummaryTemplate, { ready: readyCount, total: totalCount })}
            </span>
            {!confirmingBatch ? (
              <button
                type="button"
                onClick={() => setConfirmingBatch(true)}
                disabled={batch.generating || batch.pendingCount === 0}
                className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                data-testid="vd-dialogue-audio-generate-batch"
              >
                {batch.generating ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                    {t.dialogueAudioStatusGenerating}
                  </span>
                ) : (
                  t.dialogueAudioGenerateBatchCta
                )}
              </button>
            ) : null}
          </div>

          {batch.pendingCount === 0 && (
            <p className="text-xs text-muted-foreground" data-testid="vd-dialogue-audio-no-pending">
              {t.dialogueAudioNoPendingLines}
            </p>
          )}

          {confirmingBatch && (
            <div
              className="rounded-md border border-amber-400/50 bg-amber-50 p-3 text-sm dark:bg-amber-950/30"
              data-testid="vd-dialogue-audio-batch-confirm"
            >
              <p className="font-medium">{t.dialogueAudioGenerateBatchConfirmTitle}</p>
              <p className="text-muted-foreground">{t.dialogueAudioGenerateBatchConfirmBody}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingBatch(false)}
                  className="rounded-md border border-border px-3 py-1 text-xs font-medium hover:bg-muted"
                >
                  {locale === "th" ? "ยกเลิก" : "Cancel"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingBatch(false);
                    batch.onGenerateBatch();
                  }}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
                  data-testid="vd-dialogue-audio-batch-confirm-submit"
                >
                  {locale === "th" ? "ยืนยัน" : "Confirm"}
                </button>
              </div>
            </div>
          )}

          {missingCastSpeakers.length > 0 && (
            <div
              className="flex flex-col gap-1 rounded-md border border-amber-400/50 bg-amber-50 p-2.5 text-xs dark:bg-amber-950/30"
              data-testid="vd-dialogue-audio-missing-cast"
            >
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                {t.dialogueAudioMissingCastTitle}
              </p>
              <p className="text-muted-foreground">{missingCastSpeakers.join(", ")}</p>
              <Link
                href={batch.castingTabHref}
                className="w-fit font-medium text-primary underline-offset-2 hover:underline"
                data-testid="vd-dialogue-audio-missing-cast-link"
              >
                {t.dialogueAudioMissingCastLink}
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Voice continuity map */}
      <div>
        <h4 className="mb-1 flex items-center gap-2 font-medium">
          <Mic aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>Voice continuity</span>
        </h4>
        <ul className="flex flex-col gap-1">
          {plan.speakerVoiceMap.entries.map((entry) => (
            <li key={entry.speakerName} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{entry.speakerName}</span>
              {entry.voiceId ? (
                <span className="text-muted-foreground">→ {entry.voiceId}</span>
              ) : (
                <span className="flex items-center gap-1 font-medium text-destructive">
                  <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  Missing voice ID — separate TTS blocked
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Dialogue lines (speaker-labelled) */}
      <div>
        <h4 className="mb-1 font-medium">Dialogue lines</h4>
        <ol className="flex flex-col gap-1">
          {plan.dialogueLines.map((line, index) => {
            const lineBatch = batch?.lineStatusByLineId[line.lineId];
            const speakerLabel = line.isNarration ? "Narrator" : line.speakerName;
            return (
              <li key={line.lineId} className="flex flex-wrap items-baseline gap-2">
                <span className="tabular-nums text-muted-foreground">
                  shot {line.shotNumber} · {line.start.toFixed(1)}–{line.end.toFixed(1)}s
                </span>
                <span className="font-medium">{speakerLabel}:</span>
                <span>{line.text}</span>
                {lineBatch && (
                  <DialogueAudioLineStatus
                    status={lineBatch.status}
                    audioUrl={lineBatch.audioUrl}
                    speakerLabel={speakerLabel}
                    lineNumber={index + 1}
                    locale={locale}
                    onRetry={batch?.onRetryLine ? () => batch.onRetryLine!(line.lineId) : undefined}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Subtitle summary */}
      <div>
        <h4 className="mb-1 flex items-center gap-2 font-medium">
          <Subtitles aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>Subtitles ({plan.subtitleCues.length} cues · 9:16 {plan.subtitleSafeArea.position})</span>
        </h4>
        <p className="text-muted-foreground">
          Total dialogue {plan.timing.totalDialogueSeconds.toFixed(1)}s of{" "}
          {plan.timing.episodeTargetSeconds}s target
          {plan.timing.timingMismatch && " — timing needs repair"}.
        </p>
      </div>

      {/* Warnings (text-visible, not color-only) */}
      {plan.warnings.length > 0 && (
        <div>
          <h4 className="mb-1 font-medium">Warnings</h4>
          <ul className="flex flex-col gap-1">
            {plan.warnings.map((w, i) => (
              <li key={`${w.code}-${i}`} className="flex items-start gap-2">
                <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <span className="font-medium">[{w.severity}]</span> {w.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** One dialogue line's status chip (icon + text, never color-only) + retry
 *  button (failed lines only) + inline `<audio>` player (ready lines only).
 *  Appended to the existing per-line row — see the module doc comment. */
function DialogueAudioLineStatus({
  status,
  audioUrl,
  speakerLabel,
  lineNumber,
  locale,
  onRetry,
}: {
  status: VerticalDramaAudioLineStatus;
  audioUrl?: string;
  speakerLabel: string;
  lineNumber: number;
  locale: VdLocale;
  onRetry?: () => void;
}) {
  const t = vdCopy(locale);
  const Icon = AUDIO_LINE_STATUS_ICON[status];
  const statusLabel = {
    blocked: t.dialogueAudioStatusBlocked,
    queued: t.dialogueAudioStatusQueued,
    generating: t.dialogueAudioStatusGenerating,
    ready: t.dialogueAudioStatusReady,
    failed: t.dialogueAudioStatusFailed,
  }[status];

  return (
    <span className="flex flex-wrap items-center gap-1.5" data-testid={`vd-dialogue-audio-line-status-${status}`}>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium",
          status === "ready" && "border-emerald-400/50 text-emerald-700 dark:text-emerald-400",
          status === "failed" && "border-destructive/50 text-destructive",
          status === "blocked" && "border-amber-400/50 text-amber-700 dark:text-amber-400",
          (status === "queued" || status === "generating") && "border-border text-muted-foreground",
        )}
      >
        <Icon aria-hidden="true" className={cn("h-3 w-3 shrink-0", status === "generating" && "animate-spin")} />
        {statusLabel}
      </span>
      {status === "ready" && audioUrl && (
        <audio
          controls
          src={audioUrl}
          aria-label={vdCopyWithParams(t.dialogueAudioPlayerLabelTemplate, {
            speaker: speakerLabel,
            n: lineNumber,
          })}
          data-testid="vd-dialogue-audio-line-player"
          className="h-7 max-w-[220px]"
        />
      )}
      {status === "failed" && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          data-testid="vd-dialogue-audio-line-retry"
        >
          <RefreshCw aria-hidden="true" className="h-3 w-3" />
          {t.dialogueAudioRetryLine}
        </button>
      )}
    </span>
  );
}

export default VerticalDramaDialogueAudioPanel;
