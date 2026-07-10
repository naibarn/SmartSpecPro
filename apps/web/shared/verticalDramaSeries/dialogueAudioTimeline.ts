/**
 * Vertical Drama Series — dialogue-line ABSOLUTE render-timeline placement
 * (task #21 / W12.5 "Final Render Suite", phase B).
 *
 * Pure, DB-free, framework-agnostic (no server-only imports — safe for the
 * client bundle too, same posture as `dialogueQuality.ts`/`subtitles.ts`).
 * Lives in `shared/` rather than a server router (see
 * `server/services/verticalDramaEpisodeVideoAssembly.ts`'s
 * `resolveEpisodeDialogueAudioAndSubtitlesRunInputs`, the one caller today)
 * specifically so BOTH `verticalDramaEpisodes.ts` (single-episode
 * `assembleEpisodeVideo`) and `verticalDramaSeries.ts` (season-batch
 * `assembleSeasonVideos`) can reuse the SAME timing math without either
 * router importing the OTHER router (forbidden — see both routers' own
 * "narrow `vi.mock` sibling test" doc comments) or duplicating this logic.
 *
 * WHY this is needed: `VerticalDramaDialogueLine.start`/`.end`
 * (`@shared/verticalDramaSeries/audio`) are seconds on the dialogue line's
 * PARENT SHOT's LOCAL timeline, not the whole rendered episode's absolute
 * timeline — but the render engine's `RunAssemblyJobDialogueAudioSegmentInput.startSec`/
 * `AssSubtitleLine.startSec`/`endSec` (`verticalDramaFinalRenderGraph.ts`)
 * need ABSOLUTE seconds into the FINAL concatenated video. This module
 * bridges that gap using each render's `motionPromptPack.clips[]` (clip
 * order + `sourceShotNumbers` + PLANNED `durationSeconds`) as the timeline
 * source of truth.
 *
 * Known limitation (documented, not fixed here — same category as the
 * `RunAssemblyJobBannerInput.entire` fix, but not applicable the same way):
 * clip offsets are computed from each clip's PLANNED `durationSeconds`
 * (what the shot/video-prompt generation stage requested), not the REAL
 * probed duration of the rendered clip file (which is only known deep inside
 * `runAssemblyJob`, long after this timeline is resolved at
 * mutation-submit-time). In practice a video provider is asked to render
 * each clip at EXACTLY its planned duration, so this is normally accurate;
 * a clip that was trimmed or regenerated at a different length will drift.
 * This is acceptable for a v1 render feature (dialogue audio simply starts a
 * little early/late for that one clip) and is far simpler than teaching the
 * whole submit-time mutation to await a source-clip probe before returning a
 * `jobId` (a bigger architecture change, out of this wave's scope).
 */

import type { VerticalDramaDialogueLine } from "./audio";
import { estimateVerticalDramaSpeechSeconds } from "./dialogueQuality";

/** Minimal per-clip projection needed to place a dialogue line onto the
 *  ABSOLUTE render timeline — a subset of
 *  `VerticalDramaMotionPromptPack["clips"][number]` (`@shared/verticalDramaSeries`). */
export interface VdDialogueTimelineClip {
  clipNumber: number;
  sourceShotNumbers: number[];
  durationSeconds: number;
}

export type VdDialogueLineTimingSource = "clip_timeline" | "sequential_estimate";

export interface VdResolvedDialogueLineTiming {
  lineId: string;
  shotNumber: number;
  /** The clip this line was placed against, when one could be resolved —
   *  present even for a `"sequential_estimate"` placement whose clip window
   *  degenerated (see this module's doc comment on `resolveDialogueLineAbsoluteTimings`). */
  resolvedClipNumber?: number;
  speakerName: string;
  isNarration: boolean;
  text: string;
  absoluteStartSec: number;
  absoluteEndSec: number;
  /**
   * `"clip_timeline"` — placed using the line's own shot/clip-local
   * `start`/`end` mapped onto the absolute render timeline via the INCLUDED
   * clips' planned `durationSeconds` (see module doc comment).
   * `"sequential_estimate"` — the line's clip could not be resolved (no
   * `clipNumber`, and its `shotNumber` is not covered by ANY clip actually
   * included in this render — e.g. the clip was skipped via `allowPartial`
   * — or the resolved window degenerated to zero/negative length), so the
   * line is placed immediately after the previously-placed line using
   * `estimateVerticalDramaSpeechSeconds(line.text)` as its duration. A
   * deterministic, always-placed fallback — a line is NEVER dropped for
   * lack of timing data.
   */
  timingSource: VdDialogueLineTimingSource;
}

/**
 * Resolve every dialogue line's ABSOLUTE render-timeline position.
 *
 * Lines are processed in their given array order, which is shot-sequential
 * by construction (`buildDialogueAudioPlan` in
 * `server/services/verticalDramaDialogueAudio.ts` emits `dialogueLines` in
 * shot order) — this function does not re-sort them.
 *
 * `includedClipNumbers` is the set of clip numbers ACTUALLY present in this
 * particular render (i.e. `resolveClipsForAssembly(...).ordered`, which may
 * be a STRICT SUBSET of `motionClips` when `allowPartial` skipped clips
 * missing a rendered video) — clip offsets are computed ONLY from included
 * clips, in ascending `clipNumber` order, so the compressed timeline matches
 * what the concat demuxer actually produces. A line whose clip was skipped
 * falls back to the sequential-estimate placement, same as a line with no
 * clip mapping at all.
 */
export function resolveDialogueLineAbsoluteTimings(
  lines: VerticalDramaDialogueLine[],
  motionClips: VdDialogueTimelineClip[],
  includedClipNumbers: number[],
): VdResolvedDialogueLineTiming[] {
  const includedSet = new Set(includedClipNumbers);
  const includedClipsSorted = motionClips
    .filter(clip => includedSet.has(clip.clipNumber))
    .sort((a, b) => a.clipNumber - b.clipNumber);

  const clipDurationByNumber = new Map<number, number>();
  const clipOffsetByNumber = new Map<number, number>();
  let cumulativeSec = 0;
  for (const clip of includedClipsSorted) {
    const durationSec = Math.max(0, clip.durationSeconds);
    clipDurationByNumber.set(clip.clipNumber, durationSec);
    clipOffsetByNumber.set(clip.clipNumber, cumulativeSec);
    cumulativeSec += durationSec;
  }

  // First included clip that reports a given shot number in its
  // `sourceShotNumbers[]` wins (a shot should only ever belong to one clip;
  // "first" is a defensive tie-break, not an expected real case).
  const shotToClipNumber = new Map<number, number>();
  for (const clip of includedClipsSorted) {
    for (const shotNumber of clip.sourceShotNumbers) {
      if (!shotToClipNumber.has(shotNumber)) {
        shotToClipNumber.set(shotNumber, clip.clipNumber);
      }
    }
  }

  const resolved: VdResolvedDialogueLineTiming[] = [];
  let cursorSec = 0;

  for (const line of lines) {
    const candidateClipNumber =
      line.clipNumber != null && clipOffsetByNumber.has(line.clipNumber)
        ? line.clipNumber
        : shotToClipNumber.get(line.shotNumber);

    let absoluteStartSec: number | undefined;
    let absoluteEndSec: number | undefined;
    let timingSource: VdDialogueLineTimingSource = "sequential_estimate";

    if (candidateClipNumber != null) {
      const clipDurationSec = clipDurationByNumber.get(candidateClipNumber) ?? 0;
      const clipOffsetSec = clipOffsetByNumber.get(candidateClipNumber) ?? 0;
      const localStartSec = Math.min(Math.max(line.start, 0), clipDurationSec);
      const localEndSec = Math.min(Math.max(line.end, localStartSec), clipDurationSec);
      if (localEndSec > localStartSec) {
        absoluteStartSec = clipOffsetSec + localStartSec;
        absoluteEndSec = clipOffsetSec + localEndSec;
        timingSource = "clip_timeline";
      }
    }

    if (absoluteStartSec == null || absoluteEndSec == null) {
      const estimatedDurationSec = estimateVerticalDramaSpeechSeconds(line.text);
      absoluteStartSec = cursorSec;
      absoluteEndSec = cursorSec + estimatedDurationSec;
      timingSource = "sequential_estimate";
    }

    cursorSec = Math.max(cursorSec, absoluteEndSec);

    resolved.push({
      lineId: line.lineId,
      shotNumber: line.shotNumber,
      resolvedClipNumber: candidateClipNumber,
      speakerName: line.speakerName,
      isNarration: line.isNarration,
      text: line.text,
      absoluteStartSec,
      absoluteEndSec,
      timingSource,
    });
  }

  return resolved;
}
