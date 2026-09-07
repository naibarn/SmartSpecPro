import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { SpeakerAwareWorkflowPanel, defaultSpeakerAwareStages, serializeAdapterPolicy, validateSpeakerAwareAdapterSelection, validateSpeakerAwareStageSelection, type AdapterPolicy } from "../../src/screens/media-workspace/SpeakerAwareWorkflowPanel";

describe("speaker-aware workflow stage editor", () => {
  it("serializes UI adapter ids to the Rust camelCase contract", () => {
    const stage = (id: AdapterPolicy["vad"]["primary"]): AdapterPolicy["vad"] => ({
      enabledAdapters: [id, "ActiveSpeakerFusion"],
      primary: id,
      fallbackPolicy: "allow_listed",
      fallbackAllowList: ["ActiveSpeakerFusion"],
      required: true,
    });
    const policy: AdapterPolicy = {
      contractVersion: "feature-179-v1",
      vad: stage("SileroOnnx"),
      diarization: stage("PyannoteDiarization"),
      face: stage("MediaPipeFace"),
      person: stage("PersonBody"),
      activeSpeaker: stage("ActiveSpeakerFusion"),
      maxScanWindowMs: 60_000,
      maxConcurrentProcesses: 1,
    };
    const serialized = serializeAdapterPolicy(policy);
    expect(serialized.activeSpeaker.primary).toBe("activeSpeakerFusion");
    expect(serialized.vad.enabledAdapters).toEqual(["sileroOnnx", "activeSpeakerFusion"]);
  });

  it("accepts subtitle-first without forcing visual analysis", () => {
    expect(validateSpeakerAwareStageSelection(["subtitle_editorial_cut", "manual_review"], ["subtitle_editorial_cut", "manual_review"])).toEqual([]);
  });

  it("opens Auto Subtitle directly instead of submitting the speaker-aware queue", () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("section");
    const root = createRoot(container);
    const openSubtitle = vi.fn();
    const requestScan = vi.fn();
    try {
      act(() => root.render(React.createElement(SpeakerAwareWorkflowPanel, { sourceLabel: "clip.mp4", onOpenSubtitleEditor: openSubtitle, onRequestScan: requestScan })));
      act(() => (container.querySelector(".speaker-aware-header-submit") as HTMLButtonElement).click());
      expect(openSubtitle).toHaveBeenCalledOnce();
      expect(requestScan).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
    }
  });

  it("keeps pyannote optional until the user enables it", () => {
    expect(defaultSpeakerAwareStages("speaker_first", false)).toEqual([
      "vad_scan",
      "visual_track_scan",
      "active_speaker_fusion",
      "manual_review",
    ]);
    expect(validateSpeakerAwareAdapterSelection(
      ["SileroOnnx", "MediaPipeFace", "PersonBody", "ActiveSpeakerFusion"],
      defaultSpeakerAwareStages("speaker_first", false),
    )).toEqual([]);
  });

  it("reports a missing explicitly requested diarization adapter", () => {
    expect(validateSpeakerAwareAdapterSelection(
      ["SileroOnnx", "MediaPipeFace", "PersonBody", "ActiveSpeakerFusion"],
      ["vad_scan", "diarization_scan", "visual_track_scan", "active_speaker_fusion", "manual_review"],
    )).toContain("ขั้นตอนแยก Speaker ต้องเปิด pyannote ก่อน");
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
