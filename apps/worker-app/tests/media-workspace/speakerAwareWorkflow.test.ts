import { describe, expect, it } from "vitest";
import { validateSpeakerAwareStageSelection } from "../../src/screens/media-workspace/SpeakerAwareWorkflowPanel";

describe("speaker-aware workflow stage editor", () => {
  it("accepts subtitle-first without forcing visual analysis", () => {
    expect(validateSpeakerAwareStageSelection(["subtitle_editorial_cut", "manual_review"], ["subtitle_editorial_cut", "manual_review"])).toEqual([]);
  });

  it("reports missing prerequisites instead of silently reordering the user's flow", () => {
    expect(validateSpeakerAwareStageSelection(["active_speaker_fusion", "manual_review"], ["active_speaker_fusion", "manual_review"])).toEqual([
      "active_speaker_fusion ต้องเปิด vad_scan",
      "active_speaker_fusion ต้องเปิด visual_track_scan",
    ]);
  });

  it("reports order conflicts and requires an explicit review gate", () => {
    expect(validateSpeakerAwareStageSelection(["vad_scan", "diarization_scan"], ["diarization_scan", "vad_scan"])).toEqual([
      "diarization_scan ต้องอยู่หลัง vad_scan",
      "ต้องมีขั้นตอนตรวจสอบและอนุมัติ",
    ]);
  });
});
