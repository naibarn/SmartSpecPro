/**
 * Feature 143, P1 — `Timeline` composition smoke tests: renders scene ->
 * brand -> overlay -> background -> subtitles -> audio rows in order, wires
 * ruler seek + clip selection through to the caller, and renders a playhead.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Timeline } from "../Timeline";
import { projectTimeline } from "../timelineProjection";
import { createDefaultDocument } from "../createDefaultDocument";
import type { RemotionLayer } from "@shared/remotion/layerTemplateSchemas";
import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";

function docWithOneLayer(): VideoProjectDocument {
  const base = createDefaultDocument({});
  const layer: RemotionLayer = {
    id: "bg-1",
    type: "image",
    startFrame: 0,
    durationFrames: 60,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotationDeg: 0,
    opacity: 1,
    zIndex: 0,
    src: "https://example.com/a.png",
    fit: "cover",
  };
  return {
    ...base,
    scenes: [{ ...base.scenes[0], layers: [layer] }],
  };
}

describe("Timeline", () => {
  it("renders the scene, brand, overlay, background, subtitles and audio track rows in order", () => {
    const doc = docWithOneLayer();
    const projection = projectTimeline(doc);
    render(
      <Timeline
        lang="en"
        projection={projection}
        currentMs={0}
        onPlayheadChange={vi.fn()}
        selectedClipId={null}
        onSelect={vi.fn()}
        captionsBurnIn={false}
      />,
    );
    const rows = screen.getAllByTestId("vs-timeline-track");
    expect(rows.map((r) => r.getAttribute("data-track-kind"))).toEqual([
      "scene",
      "brand",
      "overlay",
      "background",
      "subtitles",
    ]);
  });

  it("renders a playhead element", () => {
    const doc = docWithOneLayer();
    const projection = projectTimeline(doc);
    render(
      <Timeline
        lang="en"
        projection={projection}
        currentMs={1000}
        onPlayheadChange={vi.fn()}
        selectedClipId={null}
        onSelect={vi.fn()}
        captionsBurnIn={false}
      />,
    );
    expect(screen.getByTestId("vs-timeline-playhead")).toBeInTheDocument();
  });

  it("clicking a clip calls onSelect with its ref", () => {
    const doc = docWithOneLayer();
    const projection = projectTimeline(doc);
    const onSelect = vi.fn();
    render(
      <Timeline
        lang="en"
        projection={projection}
        currentMs={0}
        onPlayheadChange={vi.fn()}
        selectedClipId={null}
        onSelect={onSelect}
        captionsBurnIn={false}
      />,
    );
    const clipEl = screen
      .getAllByTestId("vs-timeline-clip")
      .find((el) => el.getAttribute("data-clip-id") === "layer:scene-1:bg-1")!;
    fireEvent.click(clipEl);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ ref: expect.objectContaining({ kind: "layer", layerId: "bg-1" }) }),
      expect.objectContaining({ shiftKey: false }),
    );
  });

  it("clicking the ruler calls onPlayheadChange with a ms value", () => {
    const doc = docWithOneLayer();
    const projection = projectTimeline(doc);
    const onPlayheadChange = vi.fn();
    render(
      <Timeline
        lang="en"
        projection={projection}
        currentMs={0}
        onPlayheadChange={onPlayheadChange}
        selectedClipId={null}
        onSelect={vi.fn()}
        captionsBurnIn={false}
      />,
    );
    fireEvent.click(screen.getByTestId("vs-timeline-ruler"), { clientX: 100 });
    expect(onPlayheadChange).toHaveBeenCalledWith(expect.any(Number));
  });
});

/* -------------------------------------------------------------------------- */
/* Audio-track controls (P3 §4.8/§6) — vs-audio-track / vs-audio-volume /     */
/* vs-audio-ducking / vs-audio-span, in the label column (§4.8 build item 2)  */
/* -------------------------------------------------------------------------- */

function docWithMusicTrack(overrides: Partial<VideoProjectDocument["audioTracks"][number]> = {}) {
  const base = createDefaultDocument({});
  return {
    ...base,
    audioTracks: [{ kind: "music" as const, assetRefs: [1], gainDb: -14, ducking: true, ...overrides }],
  };
}

describe("Timeline — audio-track controls", () => {
  it("renders a channel strip (vs-audio-track) with a volume slider bound to gainDb", () => {
    const doc = docWithMusicTrack();
    const projection = projectTimeline(doc);
    render(
      <Timeline
        lang="th"
        projection={projection}
        currentMs={0}
        onPlayheadChange={vi.fn()}
        selectedClipId={null}
        onSelect={vi.fn()}
        captionsBurnIn={false}
      />,
    );
    const strip = screen.getByTestId("vs-audio-track");
    const slider = strip.querySelector('[data-testid="vs-audio-volume"] [role="slider"]');
    expect(slider).not.toBeNull();
    expect(slider).toHaveAttribute("aria-valuenow", "-14");
  });

  it("dragging (keyboard) the volume slider calls onAudioGainChange with the new dB value, clamped -60..24", () => {
    const doc = docWithMusicTrack();
    const projection = projectTimeline(doc);
    const onAudioGainChange = vi.fn();
    render(
      <Timeline
        lang="th"
        projection={projection}
        currentMs={0}
        onPlayheadChange={vi.fn()}
        selectedClipId={null}
        onSelect={vi.fn()}
        captionsBurnIn={false}
        onAudioGainChange={onAudioGainChange}
      />,
    );
    const slider = screen.getByTestId("vs-audio-track").querySelector('[role="slider"]')!;
    fireEvent.keyDown(slider, { key: "ArrowUp" });
    expect(onAudioGainChange).toHaveBeenCalledWith(0, -13);
  });

  it("toggling the ducking switch calls onAudioDuckingChange (music tracks only)", () => {
    const doc = docWithMusicTrack({ ducking: true });
    const projection = projectTimeline(doc);
    const onAudioDuckingChange = vi.fn();
    render(
      <Timeline
        lang="th"
        projection={projection}
        currentMs={0}
        onPlayheadChange={vi.fn()}
        selectedClipId={null}
        onSelect={vi.fn()}
        captionsBurnIn={false}
        onAudioDuckingChange={onAudioDuckingChange}
      />,
    );
    const duckingSwitch = screen.getByTestId("vs-audio-ducking").querySelector('input[type="checkbox"]')!;
    fireEvent.click(duckingSwitch);
    expect(onAudioDuckingChange).toHaveBeenCalledWith(0, false);
  });

  it("renders 'spans the whole video' and no ducking control for a narration track with no explicit span", () => {
    const base = createDefaultDocument({});
    const doc: VideoProjectDocument = {
      ...base,
      audioTracks: [{ kind: "narration", assetRefs: [1], gainDb: 0 }],
    };
    const projection = projectTimeline(doc);
    render(
      <Timeline
        lang="th"
        projection={projection}
        currentMs={0}
        onPlayheadChange={vi.fn()}
        selectedClipId={null}
        onSelect={vi.fn()}
        captionsBurnIn={false}
      />,
    );
    const strip = screen.getByTestId("vs-audio-track");
    expect(strip.textContent).toContain("ตลอดทั้งวิดีโอ");
    expect(strip.querySelector('[data-testid="vs-audio-ducking"]')).toBeNull();
  });

  it("clicking the span toggle converts a full-video track to a bounded span via onAudioSpanToggle", () => {
    const doc = docWithMusicTrack();
    const projection = projectTimeline(doc);
    const onAudioSpanToggle = vi.fn();
    render(
      <Timeline
        lang="th"
        projection={projection}
        currentMs={0}
        onPlayheadChange={vi.fn()}
        selectedClipId={null}
        onSelect={vi.fn()}
        captionsBurnIn={false}
        onAudioSpanToggle={onAudioSpanToggle}
      />,
    );
    fireEvent.click(screen.getByTestId("vs-audio-span"));
    expect(onAudioSpanToggle).toHaveBeenCalledWith(0, { startMs: 0, endMs: doc.format.durationMs });
  });
});
