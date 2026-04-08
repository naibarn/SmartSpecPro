import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getLocalVoiceReadbackAvailability,
  shouldSpeakLocalVoiceReadback,
  speakLocalVoiceReadback,
  stopLocalVoiceReadback,
} from "./localVoiceReadback";

class MockSpeechSynthesisUtterance {
  text: string;
  lang = "";
  rate = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

describe("localVoiceReadback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports unavailable when speech synthesis is missing", () => {
    vi.stubGlobal("window", {} as Window);
    expect(getLocalVoiceReadbackAvailability()).toEqual({
      supported: false,
      reason: "speech_synthesis_unavailable",
    });
  });

  it("speaks when mode allows it", async () => {
    const cancel = vi.fn();
    const speak = vi.fn((utterance: MockSpeechSynthesisUtterance) => {
      utterance.onend?.();
    });

    vi.stubGlobal(
      "window",
      {
        speechSynthesis: {
          cancel,
          speak,
        },
        SpeechSynthesisUtterance: MockSpeechSynthesisUtterance,
      } as unknown as Window,
    );

    await expect(
      speakLocalVoiceReadback({
        text: "อ่านข้อความนี้ให้ที",
        mode: "all_responses",
      }),
    ).resolves.toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it("skips normal response readback when mode is important_only", () => {
    expect(
      shouldSpeakLocalVoiceReadback({
        mode: "important_only",
        priority: "response",
      }),
    ).toBe(false);
    expect(
      shouldSpeakLocalVoiceReadback({
        mode: "important_only",
        priority: "important",
      }),
    ).toBe(true);
  });

  it("stops active readback when requested", () => {
    const cancel = vi.fn();
    vi.stubGlobal(
      "window",
      {
        speechSynthesis: {
          cancel,
          speak: vi.fn(),
        },
        SpeechSynthesisUtterance: MockSpeechSynthesisUtterance,
      } as unknown as Window,
    );

    stopLocalVoiceReadback();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
