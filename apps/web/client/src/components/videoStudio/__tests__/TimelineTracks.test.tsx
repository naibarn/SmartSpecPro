/**
 * Feature 143, P1 — `TimelineTracks` selection (controlled from props) +
 * hidden-clip visual marking + horizontal virtualization window.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TimelineTracks } from "../TimelineTracks";
import type { TimelineClip, TimelineTrack } from "../timelineProjection";

function clip(overrides: Partial<TimelineClip>): TimelineClip {
  return {
    id: "layer:scene-1:a",
    ref: { kind: "layer", sceneIndex: 0, sceneId: "scene-1", layerId: "a", layerType: "image", band: "background" },
    label: "A",
    startMs: 0,
    durationMs: 1000,
    hidden: false,
    locked: false,
    ...overrides,
  };
}

function makeTracks(clips: TimelineClip[]): TimelineTrack[] {
  return [{ id: "background", kind: "background", readOnly: false, clips }];
}

describe("TimelineTracks selection", () => {
  it("marks the clip matching selectedClipId as selected (aria-pressed) and no other", () => {
    const tracks = makeTracks([clip({ id: "a" }), clip({ id: "b", startMs: 2000 })]);
    render(
      <TimelineTracks
        lang="en"
        tracks={tracks}
        pxPerSecond={50}
        contentDurationMs={5000}
        selectedClipId="a"
        onSelect={vi.fn()}
        visibleLeftPx={0}
        visibleWidthPx={2000}
      />,
    );
    const clips = screen.getAllByTestId("vs-timeline-clip");
    const a = clips.find((el) => el.getAttribute("data-clip-id") === "a")!;
    const b = clips.find((el) => el.getAttribute("data-clip-id") === "b")!;
    expect(a).toHaveAttribute("aria-pressed", "true");
    expect(b).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onSelect with the clicked clip", () => {
    const onSelect = vi.fn();
    const tracks = makeTracks([clip({ id: "a" })]);
    render(
      <TimelineTracks
        lang="en"
        tracks={tracks}
        pxPerSecond={50}
        contentDurationMs={5000}
        selectedClipId={null}
        onSelect={onSelect}
        visibleLeftPx={0}
        visibleWidthPx={2000}
      />,
    );
    fireEvent.click(screen.getByTestId("vs-timeline-clip"));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a" }),
      expect.objectContaining({ shiftKey: false }),
    );
  });

  it("re-renders selection purely from the selectedClipId prop (controlled, no internal state)", () => {
    const tracks = makeTracks([clip({ id: "a" })]);
    const { rerender } = render(
      <TimelineTracks
        lang="en"
        tracks={tracks}
        pxPerSecond={50}
        contentDurationMs={5000}
        selectedClipId={null}
        onSelect={vi.fn()}
        visibleLeftPx={0}
        visibleWidthPx={2000}
      />,
    );
    expect(screen.getByTestId("vs-timeline-clip")).toHaveAttribute("aria-pressed", "false");
    rerender(
      <TimelineTracks
        lang="en"
        tracks={tracks}
        pxPerSecond={50}
        contentDurationMs={5000}
        selectedClipId="a"
        onSelect={vi.fn()}
        visibleLeftPx={0}
        visibleWidthPx={2000}
      />,
    );
    expect(screen.getByTestId("vs-timeline-clip")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("TimelineTracks hidden clips", () => {
  it("still renders a hidden clip (never dropped) and labels it hidden in the aria-label", () => {
    const tracks = makeTracks([clip({ id: "h", hidden: true })]);
    render(
      <TimelineTracks
        lang="en"
        tracks={tracks}
        pxPerSecond={50}
        contentDurationMs={5000}
        selectedClipId={null}
        onSelect={vi.fn()}
        visibleLeftPx={0}
        visibleWidthPx={2000}
      />,
    );
    const el = screen.getByTestId("vs-timeline-clip");
    expect(el).toBeInTheDocument();
    expect(el.getAttribute("aria-label")).toMatch(/Hidden/);
  });
});

describe("TimelineTracks missing assets (AC16)", () => {
  it("marks a proven-missing media clip red and names the missing state", () => {
    const tracks = makeTracks([clip({ id: "missing", ref: { kind: "layer", sceneIndex: 0, sceneId: "scene-1", layerId: "a", layerType: "video", band: "background" } })]);
    render(
      <TimelineTracks
        lang="en"
        tracks={tracks}
        pxPerSecond={50}
        contentDurationMs={5000}
        selectedClipId={null}
        onSelect={vi.fn()}
        visibleLeftPx={0}
        visibleWidthPx={2000}
        missingLayerIds={new Set(["a"])}
      />,
    );
    const el = screen.getByTestId("vs-timeline-clip");
    expect(el).toHaveClass("border-red-500");
    expect(el).toHaveAttribute("aria-label", expect.stringContaining("Missing file"));
  });
});

describe("TimelineTracks horizontal virtualization", () => {
  it("does not mount a clip whose entire span is far outside the visible window", () => {
    const tracks = makeTracks([
      clip({ id: "near", startMs: 0, durationMs: 500 }),
      clip({ id: "far", startMs: 100000, durationMs: 500 }),
    ]);
    render(
      <TimelineTracks
        lang="en"
        tracks={tracks}
        pxPerSecond={50}
        contentDurationMs={200000}
        selectedClipId={null}
        onSelect={vi.fn()}
        visibleLeftPx={0}
        visibleWidthPx={1000}
      />,
    );
    const ids = screen.getAllByTestId("vs-timeline-clip").map((el) => el.getAttribute("data-clip-id"));
    expect(ids).toContain("near");
    expect(ids).not.toContain("far");
  });
});
