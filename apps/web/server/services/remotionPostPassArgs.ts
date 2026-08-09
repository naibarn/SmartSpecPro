/**
 * Pure ffmpeg argv builders for the `remotion_render_video` worker job's
 * post-render passes (Feature 133, Phase 1 MVP — section-04, see
 * `specs/feature/133-content-video-intelligence-platform/sections/section-04-queue-lane-a-worker.md`
 * §5.2).
 *
 * No I/O — every function here returns a plain argv array (or an ordered
 * list of them) so it can be unit-tested without ever spawning a real
 * ffmpeg process (research B3/B7; Vitest never executes ffmpeg for real).
 * The caller (the `remotion_render_video` dispatch branch in
 * `server/workers/hyperframesRenderWorker.ts`) is responsible for running
 * these argv arrays through an injected `FfmpegRunner`
 * (`verticalDramaEpisodeVideoAssembly.ts`).
 *
 * `loudnorm=I=-16:TP=-1.5:LRA=11` is the exact filter string
 * `verticalDramaFinalRenderGraph.ts`'s private `buildAudioFilterGraph` uses —
 * reused verbatim here (not imported; that helper is private, research C2)
 * so both render pipelines apply byte-identical loudness normalization.
 */
import { join } from "node:path";

import {
  buildAssSubtitleFile,
  escapeFfmpegFilterPath,
  type AssSubtitleBuildOpts,
  type AssSubtitleLine,
  type CaptionPresetId,
} from "./verticalDramaFinalRenderGraph";
import {
  buildConcatFfmpegArgs,
  type ConcatCommandSpec,
} from "./verticalDramaEpisodeVideoAssembly";
import type { RemotionRenderVideoWorkerInput } from "../../shared/workerRuntime";

/** Exact loudnorm filter string reused from `buildAudioFilterGraph` (private, verticalDramaFinalRenderGraph.ts). */
export const REMOTION_POST_PASS_LOUDNORM_FILTER = "loudnorm=I=-16:TP=-1.5:LRA=11";

/**
 * `ffmpeg -i <inPath> -af loudnorm=I=-16:TP=-1.5:LRA=11 -c:v copy <outPath>`
 * — video stream is stream-copied (untouched), only the audio filter graph
 * is re-encoded.
 */
export function buildLoudnormPassArgs(inPath: string, outPath: string): string[] {
  return [
    "-y",
    "-i",
    inPath,
    "-af",
    REMOTION_POST_PASS_LOUDNORM_FILTER,
    "-c:v",
    "copy",
    outPath,
  ];
}

/**
 * Burns the `.ass` subtitle file built by `buildAssSubtitleFile` into the
 * video via ffmpeg's `subtitles` video filter. Audio is stream-copied
 * (untouched) — only the video is re-encoded with subtitles composited in.
 */
export function buildAssBurnPassArgs(
  inPath: string,
  assFilePath: string,
  outPath: string,
): string[] {
  return [
    "-y",
    "-i",
    inPath,
    "-vf",
    `subtitles=filename=${escapeFfmpegFilterPath(assFilePath)}`,
    "-c:a",
    "copy",
    outPath,
  ];
}

/**
 * Builds the `.ass` subtitle file content for the `ass_burn` post-pass. Pure
 * wrapper around `buildAssSubtitleFile` (verticalDramaFinalRenderGraph.ts) —
 * the caller writes the returned string to `paths.assFilePath` before
 * running the `ass_burn` step's argv (writing the file is I/O and happens in
 * the dispatch branch, not here).
 */
export function buildAssBurnSubtitleFileContent(
  lines: AssSubtitleLine[],
  preset: CaptionPresetId,
  opts: AssSubtitleBuildOpts,
): string {
  return buildAssSubtitleFile(lines, preset, opts);
}

export interface PostPassStep {
  code: "loudnorm" | "ass_burn" | "segment_concat";
  argv: string[];
  /** Absolute path this step's argv writes its output to. */
  outputPath: string;
}

export interface PlanPostPassesPaths {
  /** Absolute path to the raw Remotion-rendered MP4 (input to the first pass). */
  renderedMp4Path: string;
  /** Directory post-pass intermediates/outputs are written into. */
  workspaceDir: string;
  /**
   * Pre-built `.ass` subtitle file path (via `buildAssBurnSubtitleFileContent`
   * + a file write) — required when `postPasses` includes `"ass_burn"`.
   */
  assFilePath?: string | null;
  /** Absolute paths to each segment source clip, in concat order — required when `postPasses` includes `"segment_concat"`. */
  segmentInputPaths?: string[];
  /** Absolute path to the concat-demuxer list file — required when `postPasses` includes `"segment_concat"`. */
  concatListPath?: string;
  fps?: number;
  width?: number;
  height?: number;
}

/**
 * Maps `payload.postPasses[]` (declared enqueue-time, section-03's
 * `remotionRenderVideoWorkerInputSchema`) to an ORDERED list of
 * `{ code, argv, outputPath }` steps, threading each step's output into the
 * next step's input so post-passes compose into a single pipeline. Empty
 * `postPasses` → `[]` (no-op passthrough — the raw render is the final
 * output, no post-pass ffmpeg invocation at all).
 *
 * `segment_concat` reuses `buildConcatFfmpegArgs` directly (byte-identical
 * no-op lock, research/plan §5.2) rather than re-implementing concat argv;
 * it does not chain off the previous step's output — it concatenates the
 * declared `segmentInputPaths` from scratch, per `payload.segmentPlan`.
 */
export function planPostPasses(
  payload: RemotionRenderVideoWorkerInput,
  paths: PlanPostPassesPaths,
): PostPassStep[] {
  const steps: PostPassStep[] = [];
  let currentInputPath = paths.renderedMp4Path;

  payload.postPasses.forEach((code, index) => {
    const outputPath = join(paths.workspaceDir, `post_pass_${index}_${code}.mp4`);

    if (code === "loudnorm") {
      steps.push({
        code,
        argv: buildLoudnormPassArgs(currentInputPath, outputPath),
        outputPath,
      });
      currentInputPath = outputPath;
      return;
    }

    if (code === "ass_burn") {
      if (!paths.assFilePath) {
        throw new Error(
          "planPostPasses: postPasses includes \"ass_burn\" but paths.assFilePath was not provided",
        );
      }
      steps.push({
        code,
        argv: buildAssBurnPassArgs(currentInputPath, paths.assFilePath, outputPath),
        outputPath,
      });
      currentInputPath = outputPath;
      return;
    }

    // code === "segment_concat"
    if (!payload.segmentPlan || !paths.segmentInputPaths || !paths.concatListPath) {
      throw new Error(
        "planPostPasses: postPasses includes \"segment_concat\" but segmentPlan/segmentInputPaths/concatListPath were not provided",
      );
    }
    const spec: ConcatCommandSpec = {
      inputPaths: paths.segmentInputPaths,
      concatListPath: paths.concatListPath,
      outputPath,
      fps: paths.fps,
      width: paths.width,
      height: paths.height,
    };
    steps.push({
      code,
      argv: buildConcatFfmpegArgs(spec),
      outputPath,
    });
    currentInputPath = outputPath;
  });

  return steps;
}
