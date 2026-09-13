import { describe, expect, it } from "vitest";
import { buildEditorExecutorArgv } from "../editorExecutorPolicy";

describe("headless editor executor policy", () => {
  it("builds allowlisted argv without shell/filtergraph input", () => {
    expect(buildEditorExecutorArgv({ operation: "media.probe", inputPath: "workspace/clip.mp4" })).toEqual({ executable: "ffprobe", argv: ["-v", "error", "-of", "json", "-show_format", "-show_streams", "workspace/clip.mp4"] });
  });
  it("rejects traversal, absolute paths, and missing output", () => {
    expect(() => buildEditorExecutorArgv({ operation: "media.proxy", inputPath: "../secret", outputPath: "workspace/proxy.mp4" })).toThrow("EXECUTOR_PATH_NOT_ALLOWED");
    expect(() => buildEditorExecutorArgv({ operation: "media.proxy", inputPath: "/workspace/clip.mp4", outputPath: "workspace/proxy.mp4" })).toThrow("EXECUTOR_PATH_NOT_ALLOWED");
    expect(() => buildEditorExecutorArgv({ operation: "media.proxy", inputPath: "https://evil.example/clip.mp4", outputPath: "workspace/proxy.mp4" })).toThrow("EXECUTOR_PATH_NOT_ALLOWED");
    expect(() => buildEditorExecutorArgv({ operation: "media.proxy", inputPath: "workspace/clip.mp4" })).toThrow("EXECUTOR_OUTPUT_REQUIRED");
    expect(() => buildEditorExecutorArgv({ operation: "media.proxy", inputPath: "\\workspace\\clip.mp4", outputPath: "workspace/proxy.mp4" })).toThrow("EXECUTOR_PATH_NOT_ALLOWED");
    expect(buildEditorExecutorArgv({ operation: "media.analysis", inputPath: "workspace/clip.mp4", outputPath: "workspace/analysis.json" })).toEqual({ executable: "builtin-editor-media", argv: ["--operation", "media.analysis", "--input", "workspace/clip.mp4", "--output", "workspace/analysis.json"] });
    expect(buildEditorExecutorArgv({ operation: "media.silence_detect", inputPath: "workspace/clip.mp4", outputPath: "workspace/silence.json" })).toEqual({ executable: "builtin-editor-media", argv: ["--operation", "media.silence_detect", "--input", "workspace/clip.mp4", "--output", "workspace/silence.json"] });
    expect(buildEditorExecutorArgv({ operation: "media.audio_export", inputPath: "workspace/voice.wav", outputPath: "workspace/voice.mp3" })).toEqual({ executable: "ffmpeg", argv: ["-y", "-i", "workspace/voice.wav", "workspace/voice.mp3"] });
    expect(buildEditorExecutorArgv({ operation: "video.render_still", inputPath: "workspace/clip.mp4", outputPath: "workspace/frame.png" })).toEqual({ executable: "ffmpeg", argv: ["-y", "-i", "workspace/clip.mp4", "-frames:v", "1", "workspace/frame.png"] });
  });
});
