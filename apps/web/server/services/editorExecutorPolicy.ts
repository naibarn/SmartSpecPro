export type EditorExecutorOperation = "media.probe" | "media.proxy" | "media.waveform" | "media.thumbnail" | "media.analysis" | "media.silence_detect" | "media.reframe" | "media.speaker_scan" | "media.transcribe" | "media.align" | "media.audio_mix" | "media.audio_extract" | "media.audio_export" | "media.ai_music" | "media.ai_media_studio" | "media.privacy_track" | "media.recording_normalize" | "video.render_still" | "video.render";
type EditorExecutorExecutable = "ffprobe" | "ffmpeg" | "remotion" | "analysis-worker" | "builtin-editor-media";

const operationExecutable: Record<EditorExecutorOperation, EditorExecutorExecutable> = {
  "media.probe": "ffprobe",
  "media.proxy": "ffmpeg",
  "media.waveform": "builtin-editor-media",
  "media.thumbnail": "ffmpeg",
  "media.analysis": "builtin-editor-media",
  "media.silence_detect": "builtin-editor-media",
  "media.reframe": "analysis-worker",
  "media.speaker_scan": "analysis-worker",
  "media.transcribe": "analysis-worker",
  "media.align": "analysis-worker",
  "media.audio_mix": "analysis-worker",
  "media.audio_extract": "ffmpeg",
  "media.audio_export": "ffmpeg",
  "media.ai_music": "analysis-worker",
  "media.ai_media_studio": "analysis-worker",
  "media.privacy_track": "analysis-worker",
  "media.recording_normalize": "ffmpeg",
  "video.render_still": "ffmpeg",
  "video.render": "remotion",
};
const ANALYSIS_OPERATIONS = new Set<EditorExecutorOperation>([
  "media.reframe",
  "media.speaker_scan",
  "media.transcribe",
  "media.align",
  "media.audio_mix",
  "media.ai_music",
  "media.ai_media_studio",
  "media.privacy_track",
]);

function safeWorkspacePath(value: string): string {
  if (!value || /[\0\u0001-\u001f\u007f]/.test(value) || /(^|[\\/])\.\.(?:[\\/]|$)/.test(value) || /^(?:[A-Za-z]:[\\/]|[\\/])/.test(value) || /^~(?:[\\/]|$)/.test(value) || /^[a-z][a-z0-9+.-]*:\/\//i.test(value)) throw new Error("EXECUTOR_PATH_NOT_ALLOWED");
  return value;
}

/** Produces a typed argv tuple; callers must spawn without a shell. */
export function buildEditorExecutorArgv(input: { operation: EditorExecutorOperation; inputPath: string; outputPath?: string }): { executable: string; argv: string[] } {
  const executable = operationExecutable[input.operation];
  const source = safeWorkspacePath(input.inputPath);
  const output = input.outputPath ? safeWorkspacePath(input.outputPath) : undefined;
  if (input.operation === "media.probe") return { executable, argv: ["-v", "error", "-of", "json", "-show_format", "-show_streams", source] };
  if (!output) throw new Error("EXECUTOR_OUTPUT_REQUIRED");
  if (input.operation === "video.render") return { executable, argv: ["--project", source, "--output", output] };
  if (input.operation === "video.render_still") return { executable, argv: ["-y", "-i", source, "-frames:v", "1", output] };
  if (ANALYSIS_OPERATIONS.has(input.operation)) return { executable, argv: ["--input", source, "--output", output] };
  if (executable === "builtin-editor-media") return { executable, argv: ["--operation", input.operation, "--input", source, "--output", output] };
  return { executable, argv: ["-y", "-i", source, output] };
}
