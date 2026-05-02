import { describe, expect, it } from "vitest";
import {
  buildVoiceoverSegments,
  inferVoiceoverTextLimitCharacters,
  splitVoiceoverTextByLimit,
} from "./mediaStudioAudioSegments";

describe("media studio audio segments", () => {
  it("uses the safe Qwen3 TTS text limit", () => {
    expect(inferVoiceoverTextLimitCharacters(["alibaba/qwen3-tts-flash"])).toBe(560);
    expect(inferVoiceoverTextLimitCharacters(["wavespeed/gemini-2.5-flash/text-to-speech"])).toBeNull();
  });

  it("splits long voiceover text into provider-safe chunks", () => {
    const chunks = splitVoiceoverTextByLimit(
      [
        "OpenAI released a new Codex CLI update with agentic workflow improvements.",
        "It can now manage longer coding sessions, tool calls, and multi-step development tasks.",
        "Teams should still validate the claims with their own real-world projects before adopting it broadly.",
      ].join(" "),
      110,
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 110)).toBe(true);
    expect(chunks.join(" ")).toContain("Codex CLI update");
  });

  it("assigns sequential start times and proportional targets", () => {
    const segments = buildVoiceoverSegments({
      script: "A".repeat(300) + " " + "B".repeat(300),
      targetDurationSeconds: 64,
      maxCharacters: 560,
    });

    expect(segments).toHaveLength(2);
    expect(segments[0].startTimeSeconds).toBe(0);
    expect(segments[1].startTimeSeconds).toBeCloseTo(segments[0].targetDurationSeconds, 3);
    expect(segments.reduce((sum, segment) => sum + segment.targetDurationSeconds, 0)).toBeCloseTo(64, 3);
  });
});
