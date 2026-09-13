import React, { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { MultiTrackTimeline } from "../../src/screens/media-workspace/MultiTrackTimeline";
import { createDefaultProjectDraft, type NleClip } from "../../src/types/nleProject";

const pointerEvent = (type: string, values: Record<string, number>) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, values);
  return event;
};

let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLElement | null = null;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  container = null;
});

it("moves a clip between video lanes with pointer drag", () => {
  container = document.createElement("section");
  root = createRoot(container);
  const onUpdateProject = vi.fn();
  const clip: NleClip = {
    id: "clip-v2",
    name: "C3784.MP4",
    timelineStartMs: 500,
    durationMs: 4_000,
    sourceType: "local_file",
    sourcePath: "D:/C3784.MP4",
    transform: { x: 0.5, y: 0.5, scale: 1, opacity: 1 },
  };
  const project = createDefaultProjectDraft({ projectId: "pointer-drag", title: "Pointer drag", videoPath: "", videoDurationMs: 10_000 });
  project.tracks = [
    { id: "track_v2", name: "V2", type: "video_broll", muted: false, locked: false, volume: 1, clips: [clip] },
    { id: "track_v1", name: "V1", type: "video_main", muted: false, locked: false, volume: 1, clips: [] },
  ];

  act(() => root?.render(
    <MultiTrackTimeline
      project={project}
      currentTimeMs={0}
      durationMs={10_000}
      isPlaying={false}
      onSeek={() => {}}
      onTogglePlay={() => {}}
      onUpdateProject={onUpdateProject}
      onOpenAutoSubtitles={() => {}}
      onOpenCodeOverlayModal={() => {}}
      onOpenAssetDrawer={() => {}}
      onDetachAudio={() => {}}
      onSaveProjectFile={() => {}}
      onExportCapCutDraft={() => {}}
    />,
  ));

  const timeline = container.querySelector<HTMLElement>(".nle-track-lanes");
  const clipElement = container.querySelector<HTMLElement>(".timeline-clip-block");
  const targetLane = container.querySelector<HTMLElement>('[data-track-id="track_v1"]');
  expect(timeline).not.toBeNull();
  expect(clipElement).not.toBeNull();
  expect(targetLane).not.toBeNull();

  Object.defineProperty(timeline, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 1_000, height: 88, right: 1_000, bottom: 88 }),
  });
  Object.defineProperty(clipElement, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 100, top: 0, width: 200, height: 44, right: 300, bottom: 44 }),
  });
  const originalElementFromPoint = document.elementFromPoint;
  document.elementFromPoint = () => targetLane;

  try {
    act(() => clipElement?.dispatchEvent(pointerEvent("pointerdown", { button: 0, pointerId: 7, clientX: 150, clientY: 20 })));
    act(() => window.dispatchEvent(pointerEvent("pointermove", { pointerId: 7, clientX: 450, clientY: 64 })));
    act(() => window.dispatchEvent(pointerEvent("pointerup", { pointerId: 7, clientX: 450, clientY: 64 })));
  } finally {
    document.elementFromPoint = originalElementFromPoint;
  }

  expect(onUpdateProject).toHaveBeenCalledTimes(1);
  const updated = onUpdateProject.mock.calls[0][0];
  expect(updated.tracks.find((track: any) => track.id === "track_v2").clips).toHaveLength(0);
  expect(updated.tracks.find((track: any) => track.id === "track_v1").clips[0]).toMatchObject({
    id: "clip-v2",
    sourcePath: "D:/C3784.MP4",
  });
});
