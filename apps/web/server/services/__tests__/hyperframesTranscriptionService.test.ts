import { writeFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  buildSubtitleCuesFromTranscriptTokens,
  parseHyperframesTranscriptJson,
  renderTranscriptCuesAsSrt,
  renderTranscriptCuesAsVtt,
  storageKeyFromManagedHyperframesMediaUrl,
  transcribeHyperframesStoryboardShot,
} from "../hyperframesTranscriptionService";

describe("hyperframesTranscriptionService", () => {
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
        "--output-json-full",
        "--language",
        "th",
        expect.stringContaining("source.wav"),
      ])
    );
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
    ).rejects.toThrow(/whisper-cpp is missing/i);
  });
});
