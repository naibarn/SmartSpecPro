import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  buildSubtitleCuesFromTranscriptTokens,
  parseHyperframesTranscriptJson,
  renderTranscriptCuesAsSrt,
  renderTranscriptCuesAsVtt,
  resolveWhisperExecutable,
  resolveWhisperThreadCount,
  storageKeyFromManagedHyperframesMediaUrl,
  transcribeHyperframesStoryboardShot,
} from "../hyperframesTranscriptionService";

describe("hyperframesTranscriptionService", () => {
  it("prefers a working configured whisper bin dir over a stale PATH wrapper", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "smartspec-whisper-test-"));
    try {
      const staleBinDir = path.join(tmpDir, "stale-bin");
      const workingBinDir = path.join(tmpDir, "working-bin");
      await writeFile(path.join(tmpDir, "placeholder"), "", "utf8");
      await mkdir(staleBinDir, { recursive: true });
      await mkdir(workingBinDir, { recursive: true });
      const staleWrapper = path.join(staleBinDir, "whisper-cpp");
      const workingCli = path.join(workingBinDir, "whisper-cli");
      await writeFile(
        staleWrapper,
        "#!/usr/bin/env bash\nexec /tmp/smartspec-deps/whisper.cpp/build/bin/whisper-cli \"$@\"\n",
        "utf8",
      );
      await writeFile(
        workingCli,
        "#!/usr/bin/env bash\nif [ \"$1\" = \"--help\" ]; then echo usage >&2; exit 0; fi\nexit 1\n",
        "utf8",
      );
      await chmod(staleWrapper, 0o755);
      await chmod(workingCli, 0o755);

      expect(resolveWhisperExecutable({
        PATH: staleBinDir,
        HYPERFRAMES_WHISPER_BIN_DIR: workingBinDir,
      })).toBe(workingCli);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("fails fast when HYPERFRAMES_WHISPER_PATH points to a broken wrapper", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "smartspec-whisper-test-"));
    try {
      const staleWrapper = path.join(tmpDir, "whisper-cpp");
      await writeFile(
        staleWrapper,
        "#!/usr/bin/env bash\nexec /tmp/smartspec-deps/whisper.cpp/build/bin/whisper-cli \"$@\"\n",
        "utf8",
      );
      await chmod(staleWrapper, 0o755);

      expect(() => resolveWhisperExecutable({
        HYPERFRAMES_WHISPER_PATH: staleWrapper,
      })).toThrow(/not a working whisper\.cpp executable/i);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("keeps whisper.cpp CPU usage bounded by default and respects thread overrides", () => {
    expect(resolveWhisperThreadCount({ HYPERFRAMES_WHISPER_THREADS: "2" })).toBeLessThanOrEqual(2);
    expect(resolveWhisperThreadCount({
      HYPERFRAMES_WHISPER_THREADS: "8",
      HYPERFRAMES_WHISPER_THREADS_MAX: "2",
    })).toBe(2);
  });

  it("extracts a managed storage key from supported media URLs", () => {
    expect(
      storageKeyFromManagedHyperframesMediaUrl(
        "/api/storage/files/marketplace-auto-review/tenant_1/run_1/shot-1.mp4",
      ),
    ).toBe("marketplace-auto-review/tenant_1/run_1/shot-1.mp4");
    expect(
      storageKeyFromManagedHyperframesMediaUrl(
        "https://smartaihub.app/api/storage/files/marketplace-auto-review/tenant_1/run_1/shot-1.mp4",
      ),
    ).toBe("marketplace-auto-review/tenant_1/run_1/shot-1.mp4");
    expect(storageKeyFromManagedHyperframesMediaUrl("https://cdn.example.com/clip.mp4")).toBeNull();
  });

  it("parses transcript tokens and renders VTT/SRT sidecars", () => {
    const tokens = parseHyperframesTranscriptJson(
      JSON.stringify([
        { id: "w1", text: "คุณเคย", start: 0, end: 0.45 },
        { id: "w2", text: "ชงกาแฟ", start: 0.46, end: 0.9 },
        { id: "w3", text: "ตอนเช้า", start: 0.92, end: 1.35 },
      ]),
    );
    const cues = buildSubtitleCuesFromTranscriptTokens(tokens, {
      maxCharsPerCue: 20,
      maxDurationSec: 2,
      maxGapSec: 0.4,
    });

    expect(tokens).toHaveLength(3);
    expect(cues).toEqual([
      {
        index: 1,
        text: "คุณเคย ชงกาแฟ",
        start: 0,
        end: 0.9,
      },
      {
        index: 2,
        text: "ตอนเช้า",
        start: 0.92,
        end: 1.35,
      },
    ]);
    expect(renderTranscriptCuesAsVtt(cues)).toContain("WEBVTT");
    expect(renderTranscriptCuesAsVtt(cues)).toContain("00:00:00.000 --> 00:00:00.900");
    expect(renderTranscriptCuesAsVtt(cues)).toContain("00:00:00.920 --> 00:00:01.350");
    expect(renderTranscriptCuesAsSrt(cues)).toContain("00:00:00,000 --> 00:00:00,900");
    expect(renderTranscriptCuesAsSrt(cues)).toContain("00:00:00,920 --> 00:00:01,350");
  });

  it("parses whisper.cpp transcription segment JSON without requiring top-level words", () => {
    const tokens = parseHyperframesTranscriptJson(
      JSON.stringify({
        result: { language: "th" },
        transcription: [
          {
            offsets: { from: 0, to: 2100 },
            text: "ส่วนโหมดพรมน้ำก่อนชงก็ช่วยให้จังหวะการเริ่มสกัดนิ่งขึ้น",
            tokens: [
              { text: "[_BEG_]", offsets: { from: 0, to: 0 } },
              { text: "ส่วน", offsets: { from: 0, to: 250 } },
            ],
          },
          {
            offsets: { from: 2200, to: 3900 },
            text: "ปรับเวลาและปริมาณได้",
            tokens: [],
          },
        ],
      }),
    );

    expect(tokens).toEqual([
      {
        id: "w1",
        text: "ส่วนโหมดพรมน้ำก่อนชงก็ช่วยให้จังหวะการเริ่มสกัดนิ่งขึ้น",
        start: 0,
        end: 2.1,
      },
      {
        id: "w2",
        text: "ปรับเวลาและปริมาณได้",
        start: 2.2,
        end: 3.9,
      },
    ]);
  });

  it("transcribes a managed MP4 into text and subtitle sidecars", async () => {
    const runCommand = vi.fn(async (_command, _args, options) => {
      await writeFile(
        `${options.cwd}/transcript.json`,
        JSON.stringify([
          { id: "w1", text: "อีกหนึ่งความสะดวก", start: 0, end: 0.65 },
          { id: "w2", text: "ไม่ต้องวุ่นวาย", start: 0.66, end: 1.2 },
          { id: "w3", text: "มีเครื่องตีฟองนมต่างหาก", start: 1.21, end: 2.1 },
        ]),
        "utf8",
      );
      return { stdout: "", stderr: "" };
    });
    const result = await transcribeHyperframesStoryboardShot({
      sourceVideoUrl: "/api/storage/files/marketplace-auto-review/tenant_1/run_1/shot-1.mp4",
      language: "th",
      model: "large-v3",
      deps: {
        env: {
          HYPERFRAMES_TRANSCRIBE_LOCAL_CONCURRENCY: "2",
          HYPERFRAMES_WHISPER_THREADS: "2",
        },
        copyStorageToPath: async () => ({ key: "marketplace-auto-review/tenant_1/run_1/shot-1.mp4" }),
        extractAudioFromVideo: () => undefined,
        resolveModelPath: model => `/tmp/${model}.bin`,
        runCommand,
      },
    });

    expect(result.text).toContain("อีกหนึ่งความสะดวก");
    expect(result.cues.length).toBeGreaterThan(0);
    expect(result.vtt).toContain("WEBVTT");
    expect(result.srt).toContain("1");
    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(String(runCommand.mock.calls[0]?.[0] ?? "")).not.toBe("npx");
    expect(runCommand.mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining([
        "--model",
        "/tmp/large-v3.bin",
        "--threads",
        "2",
        "--output-json-full",
        "--language",
        "th",
        expect.stringContaining("source.wav"),
      ])
    );
  });

  it("extracts only the requested split-shot segment before transcribing", async () => {
    const extractAudioFromVideo = vi.fn();
    const runCommand = vi.fn(async (_command, _args, options) => {
      await writeFile(
        `${options.cwd}/transcript.json`,
        JSON.stringify([{ id: "w1", text: "เสียงเฉพาะช็อตนี้", start: 0, end: 1.25 }]),
        "utf8",
      );
      return { stdout: "", stderr: "" };
    });

    const result = await transcribeHyperframesStoryboardShot({
      sourceVideoUrl: "/api/storage/files/marketplace-auto-review/tenant_1/run_1/source.mp4",
      mediaStartSec: 60,
      durationSec: 30,
      language: "th",
      model: "large-v3",
      deps: {
        env: {
          HYPERFRAMES_TRANSCRIBE_LOCAL_CONCURRENCY: "2",
          HYPERFRAMES_WHISPER_THREADS: "2",
        },
        copyStorageToPath: async () => ({ key: "marketplace-auto-review/tenant_1/run_1/source.mp4" }),
        extractAudioFromVideo,
        resolveModelPath: model => `/tmp/${model}.bin`,
        runCommand,
      },
    });

    expect(result.text).toContain("เสียงเฉพาะช็อตนี้");
    expect(extractAudioFromVideo).toHaveBeenCalledTimes(1);
    expect(extractAudioFromVideo.mock.calls[0]?.[3]).toEqual({
      mediaStartSec: 60,
      durationSec: 30,
    });
  });

  it("serializes local transcribe work so only one whisper job runs per machine", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "smartspec-whisper-lock-test-"));
    try {
      const workingCli = path.join(tmpDir, "whisper-cli");
      await writeFile(
        workingCli,
        "#!/usr/bin/env bash\nif [ \"$1\" = \"--help\" ]; then echo usage >&2; exit 0; fi\nexit 0\n",
        "utf8",
      );
      await chmod(workingCli, 0o755);

      let activeCommands = 0;
      let maxActiveCommands = 0;
      const runCommand = vi.fn(async (_command, _args, options) => {
        activeCommands += 1;
        maxActiveCommands = Math.max(maxActiveCommands, activeCommands);
        await new Promise(resolve => setTimeout(resolve, 25));
        await writeFile(
          `${options.cwd}/transcript.json`,
          JSON.stringify([{ id: "w1", text: "เสียงทดสอบ", start: 0, end: 0.5 }]),
          "utf8",
        );
        activeCommands -= 1;
        return { stdout: "", stderr: "" };
      });
      const deps = {
        env: {
          HYPERFRAMES_WHISPER_PATH: workingCli,
          HYPERFRAMES_WHISPER_THREADS: "2",
          HYPERFRAMES_TRANSCRIBE_LOCK_PATH: path.join(tmpDir, "transcribe.lock"),
          HYPERFRAMES_TRANSCRIBE_LOCK_POLL_MS: "5",
          HYPERFRAMES_TRANSCRIBE_LOCK_WAIT_MS: "5000",
        },
        copyStorageToPath: async () => ({ key: "marketplace-auto-review/tenant_1/run_1/shot-1.mp4" }),
        extractAudioFromVideo: () => undefined,
        resolveModelPath: model => `/tmp/${model}.bin`,
        runCommand,
      };

      await Promise.all([
        transcribeHyperframesStoryboardShot({
          sourceVideoUrl: "/api/storage/files/marketplace-auto-review/tenant_1/run_1/shot-1.mp4",
          language: "th",
          model: "large-v3",
          deps,
        }),
        transcribeHyperframesStoryboardShot({
          sourceVideoUrl: "/api/storage/files/marketplace-auto-review/tenant_1/run_2/shot-1.mp4",
          language: "th",
          model: "large-v3",
          deps,
        }),
      ]);

      expect(runCommand).toHaveBeenCalledTimes(2);
      expect(maxActiveCommands).toBe(1);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("fails closed for Thai when an English-only model or remote URL is used", async () => {
    await expect(
      transcribeHyperframesStoryboardShot({
        sourceVideoUrl: "/api/storage/files/marketplace-auto-review/tenant_1/run_1/shot-1.mp4",
        language: "th",
        model: "small.en",
      }),
    ).rejects.toThrow(/must use "large-v3"/i);

    await expect(
      transcribeHyperframesStoryboardShot({
        sourceVideoUrl: "https://cdn.example.com/raw.mp4",
        language: "th",
        model: "large-v3",
      }),
    ).rejects.toThrow(/managed .*video URL/i);
  });

  it("defaults Thai transcription to large-v3 when the caller does not force a model", async () => {
    const runCommand = vi.fn(async (_command, _args, options) => {
      await writeFile(
        `${options.cwd}/transcript.json`,
        JSON.stringify([{ id: "w1", text: "ทดสอบ", start: 0, end: 0.5 }]),
        "utf8",
      );
      return { stdout: "", stderr: "" };
    });
    await transcribeHyperframesStoryboardShot({
      sourceVideoUrl: "/api/storage/files/marketplace-auto-review/tenant_1/run_1/shot-1.mp4",
      language: "th",
      deps: {
        env: {
          HYPERFRAMES_TRANSCRIBE_LOCAL_CONCURRENCY: "2",
          HYPERFRAMES_WHISPER_THREADS: "2",
        },
        copyStorageToPath: async () => ({ key: "marketplace-auto-review/tenant_1/run_1/shot-1.mp4" }),
        extractAudioFromVideo: () => undefined,
        resolveModelPath: model => `/tmp/${model}.bin`,
        runCommand,
      },
    });

    expect(runCommand.mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining(["--model", "/tmp/large-v3.bin", "--language", "th"])
    );
  });

  it("surfaces whisper-cpp runtime failures with an explicit actionable error", async () => {
    await expect(
      transcribeHyperframesStoryboardShot({
        sourceVideoUrl: "/api/storage/files/marketplace-auto-review/tenant_1/run_1/shot-1.mp4",
        language: "th",
        deps: {
          env: {
            HYPERFRAMES_TRANSCRIBE_LOCAL_CONCURRENCY: "2",
            HYPERFRAMES_WHISPER_THREADS: "2",
          },
          copyStorageToPath: async () => ({ key: "marketplace-auto-review/tenant_1/run_1/shot-1.mp4" }),
          extractAudioFromVideo: () => undefined,
          resolveModelPath: model => `/tmp/${model}.bin`,
          runCommand: async () => {
            const error = new Error("Command failed");
            (error as Error & { stderr?: string }).stderr = "Transcription failed: whisper-cpp not found.";
            throw error;
          },
        },
      }),
    ).rejects.toThrow(/stale temporary path/i);
  });

  it("does not misclassify non-whisper missing file errors as runtime setup failures", async () => {
    await expect(
      transcribeHyperframesStoryboardShot({
        sourceVideoUrl: "/api/storage/files/marketplace-auto-review/tenant_1/run_1/shot-1.mp4",
        language: "th",
        deps: {
          env: {
            HYPERFRAMES_TRANSCRIBE_LOCAL_CONCURRENCY: "2",
            HYPERFRAMES_WHISPER_THREADS: "2",
          },
          copyStorageToPath: async () => {
            throw new Error("ENOENT: no such file or directory, open '/missing/source.mp4'");
          },
          extractAudioFromVideo: () => undefined,
          resolveModelPath: model => `/tmp/${model}.bin`,
          runCommand: async () => ({ stdout: "", stderr: "" }),
        },
      }),
    ).rejects.toThrow(/HyperFrames transcribe failed: ENOENT/i);
  });
});
