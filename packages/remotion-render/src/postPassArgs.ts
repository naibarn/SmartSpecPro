/**
 * Portable ffmpeg argv builders + a generic `.ass` subtitle-file builder for
 * the `remotion_render_video` job's post-render passes (`postPasses` field
 * of `remotionRenderVideoWorkerInputSchema`).
 *
 * `apps/web`'s Lane A dispatch (`hyperframesRenderWorker.ts`) injects its OWN
 * richer `planPostPasses`/`buildAssBurnSubtitleFileContent` implementations
 * (`apps/web/server/services/remotionPostPassArgs.ts`, which reuses VD's
 * 10-preset styled ASS table via `verticalDramaFinalRenderGraph.ts`) as
 * `RemotionRenderVideoJobExecutorDeps` overrides, so Lane A behavior is
 * BYTE-IDENTICAL to before this extraction — see `renderVideoJob.ts`'s doc
 * comment. `apps/web/server/services/verticalDramaFinalRenderGraph.ts` and
 * `verticalDramaEpisodeVideoAssembly.ts` cannot be imported from this
 * package: the former is a 2500+ line VD-specific module (banner overlays,
 * watermarks, dialogue mixing — far beyond what a generic `remotion_render_video`
 * post-pass needs), and the latter imports the Drizzle `db` client at module
 * scope. Both are genuinely `apps/web`-server-only.
 *
 * These functions here are the DEFAULT/fallback used by the
 * `apps/worker-app` Remotion sidecar (which has no other source for post-pass
 * logic at all) and by any test/dev caller that doesn't inject overrides.
 * They implement the same 3 post-pass codes with plain, un-styled output
 * (a single default caption style, no banner/watermark/dialogue-mix support
 * — those are exclusively HyperFrames/VD final-composite concerns, never
 * part of the `remotion_render_video` contract).
 */
import { join } from "node:path";

/** Exact loudnorm filter string reused from `apps/web`'s
 *  `remotionPostPassArgs.ts`/`verticalDramaFinalRenderGraph.ts`'s private
 *  `buildAudioFilterGraph` — kept identical here so BOTH the injected
 *  override and this fallback default apply byte-identical loudness
 *  normalization. */
export const REMOTION_POST_PASS_LOUDNORM_FILTER = "loudnorm=I=-16:TP=-1.5:LRA=11";

/**
 * Escape a filesystem path for safe embedding as an ffmpeg filter OPTION
 * VALUE (e.g. `subtitles=filename=...`), per ffmpeg's own filtergraph
 * escaping rules (distinct from shell escaping — argv is always spawned with
 * `shell: false`). Pure copy of `apps/web`'s
 * `verticalDramaFinalRenderGraph.ts#escapeFfmpegFilterPath` (a tiny, pure
 * string helper with zero drift risk).
 */
export function escapeFfmpegFilterPath(rawPath: string): string {
  const backslashAndColonEscaped = rawPath
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:");
  const quoteEscaped = backslashAndColonEscaped.replace(/'/g, "'\\''");
  return `'${quoteEscaped}'`;
}

export function buildLoudnormPassArgs(inPath: string, outPath: string): string[] {
  return ["-y", "-i", inPath, "-af", REMOTION_POST_PASS_LOUDNORM_FILTER, "-c:v", "copy", outPath];
}

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

/** Build the concat-demuxer list-file CONTENT (ffmpeg `-f concat` format). */
export function buildConcatListFileContent(inputPaths: string[]): string {
  return (
    inputPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join("\n") +
    (inputPaths.length ? "\n" : "")
  );
}

export interface ConcatCommandSpec {
  inputPaths: string[];
  concatListPath: string;
  outputPath: string;
  fps?: number;
}

/** Re-encode concat (never stream-copy — sources may differ in codec/fps/resolution). */
export function buildConcatFfmpegArgs(spec: ConcatCommandSpec): string[] {
  const fps = spec.fps ?? 30;
  return [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    spec.concatListPath,
    "-r",
    String(fps),
    "-vf",
    "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "medium",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    spec.outputPath,
  ];
}

export interface PostPassStep {
  code: "loudnorm" | "ass_burn" | "segment_concat";
  argv: string[];
  outputPath: string;
}

export interface PlanPostPassesPaths {
  renderedMp4Path: string;
  workspaceDir: string;
  assFilePath?: string | null;
  segmentInputPaths?: string[];
  concatListPath?: string;
}

export interface PlanPostPassesPayload {
  postPasses: readonly ("loudnorm" | "ass_burn" | "segment_concat")[];
  segmentPlan?: unknown;
}

/**
 * Maps `payload.postPasses[]` to an ORDERED list of `{ code, argv, outputPath }`
 * steps, threading each step's output into the next step's input. Structurally
 * identical contract to `apps/web`'s `planPostPasses` (same function
 * signature shape), so it is a drop-in default when no override is injected.
 */
export function planPostPasses(
  payload: PlanPostPassesPayload,
  paths: PlanPostPassesPaths,
): PostPassStep[] {
  const steps: PostPassStep[] = [];
  let currentInputPath = paths.renderedMp4Path;

  payload.postPasses.forEach((code, index) => {
    const outputPath = join(paths.workspaceDir, `post_pass_${index}_${code}.mp4`);

    if (code === "loudnorm") {
      steps.push({ code, argv: buildLoudnormPassArgs(currentInputPath, outputPath), outputPath });
      currentInputPath = outputPath;
      return;
    }

    if (code === "ass_burn") {
      if (!paths.assFilePath) {
        throw new Error(
          'planPostPasses: postPasses includes "ass_burn" but paths.assFilePath was not provided',
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
        'planPostPasses: postPasses includes "segment_concat" but segmentPlan/segmentInputPaths/concatListPath were not provided',
      );
    }
    steps.push({
      code,
      argv: buildConcatFfmpegArgs({
        inputPaths: paths.segmentInputPaths,
        concatListPath: paths.concatListPath,
        outputPath,
      }),
      outputPath,
    });
    currentInputPath = outputPath;
  });

  return steps;
}

function assTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const centiseconds = Math.floor((safe - Math.floor(safe)) * 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function escapeAssText(value: string): string {
  return value.replace(/[{}]/g, "").replace(/\r?\n/g, "\\N").trim();
}

export interface AssSubtitleLine {
  startSec: number;
  endSec: number;
  text: string;
}

export interface AssSubtitleBuildOpts {
  playResX: number;
  playResY: number;
}

/**
 * Generic (un-styled-preset) `.ass` subtitle file builder — a single
 * default caption style, bottom-center, semi-opaque box. This is the
 * `apps/worker-app` sidecar's fallback when no `buildAssBurnSubtitleFileContent`
 * override is injected (see this module's doc comment for why the real
 * 10-preset VD styling table cannot be imported here). `captionPresetId` is
 * accepted for signature parity with the injected override but only affects
 * whether captions render at all (`"no_subtitle_style"` -> no `Dialogue:`
 * events); it does not select a different visual style in this fallback.
 */
export function buildAssBurnSubtitleFileContent(
  lines: AssSubtitleLine[],
  presetId: string,
  opts: AssSubtitleBuildOpts,
): string {
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${opts.playResX}`,
    `PlayResY: ${opts.playResY}`,
    "WrapStyle: 0",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Default,Noto Sans Thai,60,&H00FFFFFF,&H000000FF,&H7A000000,&HA0000000,0,0,0,0,100,100,0,0,3,2,0,2,96,96,170,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const events =
    presetId === "no_subtitle_style"
      ? []
      : lines
          .filter(line => line.endSec > line.startSec && line.text.trim().length > 0)
          .map(
            line =>
              `Dialogue: 0,${assTime(line.startSec)},${assTime(line.endSec)},Default,,0,0,0,,${escapeAssText(
                line.text,
              )}`,
          );
  return [...header, ...events].join("\n") + "\n";
}
