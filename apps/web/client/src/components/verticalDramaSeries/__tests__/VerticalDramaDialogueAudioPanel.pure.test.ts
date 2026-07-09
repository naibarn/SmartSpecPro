import { describe, expect, it } from "vitest";

import {
  getMissingVoiceSpeakerNames,
  summarizeDialogueAudioReadiness,
} from "@/components/verticalDramaSeries/VerticalDramaDialogueAudioPanel";
import type {
  VerticalDramaDialogueAudioPlan,
  VerticalDramaSeparateTtsPlanItem,
} from "@shared/verticalDramaSeries/audio";

function item(overrides: Partial<VerticalDramaSeparateTtsPlanItem>): VerticalDramaSeparateTtsPlanItem {
  return {
    lineId: "line-1",
    speakerName: "นางเอก",
    text: "สวัสดีค่ะ",
    targetDurationSeconds: 2,
    blocked: false,
    ...overrides,
  };
}

describe("summarizeDialogueAudioReadiness", () => {
  it("counts ready lines (audioTask.audioUrl present) against the total", () => {
    const plan = {
      separateTtsPlan: {
        strategy: "separate_tts_voiceover",
        items: [
          item({ lineId: "l1", audioTask: { audioUrl: "https://x/1.mp3" } }),
          item({ lineId: "l2", audioTask: { pendingTaskId: "t2" } }),
          item({ lineId: "l3" }),
        ],
        injectsIntoVideoPrompts: false,
        blockedLineIds: [],
      },
    } as Pick<VerticalDramaDialogueAudioPlan, "separateTtsPlan">;
    expect(summarizeDialogueAudioReadiness(plan)).toEqual({ readyCount: 1, totalCount: 3 });
  });

  it("returns zero/zero when there is no separateTtsPlan (native audio / silent / no plan)", () => {
    expect(summarizeDialogueAudioReadiness({ separateTtsPlan: undefined })).toEqual({
      readyCount: 0,
      totalCount: 0,
    });
    expect(summarizeDialogueAudioReadiness(null)).toEqual({ readyCount: 0, totalCount: 0 });
    expect(summarizeDialogueAudioReadiness(undefined)).toEqual({ readyCount: 0, totalCount: 0 });
  });
});

describe("getMissingVoiceSpeakerNames", () => {
  it("lists only speakers flagged missingVoiceId, preserving order", () => {
    const plan = {
      speakerVoiceMap: {
        entries: [
          { speakerName: "นางเอก", voiceId: "th-porche", locked: true, missingVoiceId: false },
          { speakerName: "พระเอก", locked: false, missingVoiceId: true },
          { speakerName: "แม่บ้าน", locked: false, missingVoiceId: true },
        ],
      },
    } as Pick<VerticalDramaDialogueAudioPlan, "speakerVoiceMap">;
    expect(getMissingVoiceSpeakerNames(plan)).toEqual(["พระเอก", "แม่บ้าน"]);
  });

  it("returns an empty array when every speaker has a voice", () => {
    const plan = {
      speakerVoiceMap: {
        entries: [{ speakerName: "นางเอก", voiceId: "th-porche", locked: true, missingVoiceId: false }],
      },
    } as Pick<VerticalDramaDialogueAudioPlan, "speakerVoiceMap">;
    expect(getMissingVoiceSpeakerNames(plan)).toEqual([]);
  });

  it("returns an empty array for a null/undefined plan, never throws", () => {
    expect(getMissingVoiceSpeakerNames(null)).toEqual([]);
    expect(getMissingVoiceSpeakerNames(undefined)).toEqual([]);
  });
});
