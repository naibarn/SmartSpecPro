/**
 * VerticalDramaDialogueAudioPanel (spec feature 131, section-07 · §14 / §6.8).
 *
 * Read-only presentational summary of an episode's dialogue/audio/subtitle plan
 * shown before paid generation. Purely props-driven (no data fetching) so it can
 * be dropped into the episode audio stage or the Storyboard Review metadata
 * surface. Covers the section's State Matrix (loading / empty / error / success)
 * and Accessibility Acceptance:
 *  - dialogue lines carry visible speaker labels,
 *  - warnings are text-visible (icon + text), never color-only,
 *  - copy distinguishes separate TTS from native video audio.
 */

import { AlertTriangle, Mic, Volume2, Film, Subtitles } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  VerticalDramaAudioStrategy,
  VerticalDramaDialogueAudioPlan,
} from "@shared/verticalDramaSeries/audio";
import { computeRegenerationImpact } from "@shared/verticalDramaSeries/audio";

/** Human-facing, localizable label per audio strategy (distinct copy per §Copy Contract). */
const AUDIO_STRATEGY_LABEL: Record<VerticalDramaAudioStrategy, string> = {
  separate_tts_voiceover: "Separate TTS voiceover (audio track generated apart from video)",
  dialogue_tts: "Dialogue TTS (multi-speaker, generated apart from video)",
  native_video_audio: "Native video audio (speech baked into the generated video)",
  silent: "Silent (no audio planned)",
};

interface VerticalDramaDialogueAudioPanelProps {
  plan?: VerticalDramaDialogueAudioPlan | null;
  loading?: boolean;
  error?: string | null;
  /** Called when the empty-state create/regenerate CTA is pressed. */
  onGenerate?: () => void;
  className?: string;
}

export function VerticalDramaDialogueAudioPanel({
  plan,
  loading = false,
  error = null,
  onGenerate,
  className,
}: VerticalDramaDialogueAudioPanelProps) {
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
          {plan.dialogueLines.map((line) => (
            <li key={line.lineId} className="flex flex-wrap items-baseline gap-2">
              <span className="tabular-nums text-muted-foreground">
                shot {line.shotNumber} · {line.start.toFixed(1)}–{line.end.toFixed(1)}s
              </span>
              <span className="font-medium">
                {line.isNarration ? "Narrator" : line.speakerName}:
              </span>
              <span>{line.text}</span>
            </li>
          ))}
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

export default VerticalDramaDialogueAudioPanel;
