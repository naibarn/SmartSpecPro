// @vitest-environment jsdom
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VerticalDramaAudioInspector } from "../VerticalDramaAudioInspector";

describe("VerticalDramaAudioInspector component", () => {
  it("renders 3-stem faders when nativeAudioEnabled is true", () => {
    render(
      <VerticalDramaAudioInspector
        seriesId="series_53"
        episodeId="252"
        shotNumber={1}
        nativeAudioEnabled={true}
        qcScore={9.5}
        qcStatus="PASS"
      />
    );

    expect(screen.getByText(/สตูดิโอมิกซ์เสียง — ช็อตที่ #1/i)).toBeTruthy();
    expect(screen.getByText(/QC ผ่าน \(9.5\/10\)/i)).toBeTruthy();
    expect(screen.getByTestId("vd-audio-fader-dialogue")).toBeTruthy();
    expect(screen.getByTestId("vd-audio-fader-foley")).toBeTruthy();
    expect(screen.getByTestId("vd-audio-fader-ambience")).toBeTruthy();
  });

  it("omits foley and ambience faders when nativeAudioEnabled is false (dialogue only mode)", () => {
    render(
      <VerticalDramaAudioInspector
        seriesId="series_53"
        episodeId="252"
        shotNumber={1}
        nativeAudioEnabled={false}
      />
    );

    expect(screen.getByText(/เสียงพูดอย่างเดียว/i)).toBeTruthy();
    expect(screen.getByTestId("vd-audio-fader-dialogue")).toBeTruthy();
    expect(screen.queryByTestId("vd-audio-fader-foley")).toBeNull();
    expect(screen.queryByTestId("vd-audio-fader-ambience")).toBeNull();
  });

  it("calls onTriggerRepair when repair button is clicked", () => {
    const onTriggerRepair = vi.fn();
    render(
      <VerticalDramaAudioInspector
        seriesId="series_53"
        episodeId="252"
        shotNumber={1}
        nativeAudioEnabled={true}
        onTriggerRepair={onTriggerRepair}
      />
    );

    const repairBtn = screen.getByTestId("vd-audio-trigger-repair-btn");
    fireEvent.click(repairBtn);
    expect(onTriggerRepair).toHaveBeenCalledTimes(1);
  });

  it("toggles stem mute state when mute button is clicked", () => {
    render(
      <VerticalDramaAudioInspector
        seriesId="series_53"
        episodeId="252"
        shotNumber={1}
        nativeAudioEnabled={true}
      />
    );

    const muteDialogueBtn = screen.getByTestId("vd-audio-mute-dialogue");
    expect(muteDialogueBtn.textContent).toBe("Mute");
    fireEvent.click(muteDialogueBtn);
    expect(muteDialogueBtn.textContent).toBe("Muted");
  });

  it("resets faders to default when reset button is clicked", () => {
    const onUpdateMixDeltas = vi.fn();
    render(
      <VerticalDramaAudioInspector
        seriesId="series_53"
        episodeId="252"
        shotNumber={1}
        nativeAudioEnabled={true}
        mixDeltas={{ dialogueDb: 3, foleyDb: 1, ambienceDb: 0 }}
        onUpdateMixDeltas={onUpdateMixDeltas}
      />
    );

    const resetBtn = screen.getByTestId("vd-audio-reset-faders-btn");
    fireEvent.click(resetBtn);
    expect(onUpdateMixDeltas).toHaveBeenCalledWith({
      dialogueDb: 0,
      foleyDb: -2,
      ambienceDb: -6,
    });
  });

  it("calls onRollbackTake when take is selected from dropdown", () => {
    const onRollbackTake = vi.fn();
    render(
      <VerticalDramaAudioInspector
        seriesId="series_53"
        episodeId="252"
        shotNumber={1}
        nativeAudioEnabled={true}
        currentTake={2}
        takesCount={3}
        onRollbackTake={onRollbackTake}
      />
    );

    const select = screen.getByTestId("vd-audio-take-select");
    fireEvent.change(select, { target: { value: "1" } });
    expect(onRollbackTake).toHaveBeenCalledWith(1);
  });

  it("toggles stem solo state when solo button is clicked", () => {
    render(
      <VerticalDramaAudioInspector
        seriesId="series_53"
        episodeId="252"
        shotNumber={1}
        nativeAudioEnabled={true}
      />
    );

    const soloDialogueBtn = screen.getByTestId("vd-audio-solo-dialogue");
    fireEvent.click(soloDialogueBtn);
    expect(soloDialogueBtn.className).toContain("text-amber-500");
  });

  it("toggles preview playback state when preview button is clicked", () => {
    render(
      <VerticalDramaAudioInspector
        seriesId="series_53"
        episodeId="252"
        shotNumber={1}
        nativeAudioEnabled={true}
      />
    );

    const previewBtn = screen.getByTestId("vd-audio-preview-toggle-btn");
    expect(previewBtn.textContent).toContain("ฟังตัวอย่าง");
    fireEvent.click(previewBtn);
    expect(previewBtn.textContent).toContain("กำลังฟัง...");
  });

  it("displays clipping warning when stem volume is boosted excessively", () => {
    render(
      <VerticalDramaAudioInspector
        seriesId="series_53"
        episodeId="252"
        shotNumber={1}
        nativeAudioEnabled={true}
        mixDeltas={{ dialogueDb: 4.5, foleyDb: 0, ambienceDb: 0 }}
      />
    );

    expect(screen.getByTestId("vd-audio-clipping-warning")).toBeTruthy();
    expect(screen.getByText(/ระวังเสียงแตก/i)).toBeTruthy();
  });
});
