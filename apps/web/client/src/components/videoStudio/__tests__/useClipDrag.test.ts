/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createDefaultDocument } from "../createDefaultDocument";
import { useClipDrag } from "../useClipDrag";
import type { LayerBand, LayerRef } from "../timelineEdits";
import type { Scene, VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";
import type { RemotionLayer } from "@shared/remotion/layerTemplateSchemas";

function docWithLayer(overrides: Partial<RemotionLayer> = {}): VideoProjectDocument {
  const base = createDefaultDocument({});
  const layer: RemotionLayer = {
    id: "img-1",
    type: "image",
    startFrame: 0,
    durationFrames: 30,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotationDeg: 0,
    opacity: 1,
    zIndex: 0,
    src: "https://example.com/a.png",
    fit: "cover",
    ...overrides,
  } as RemotionLayer;
  const scene: Scene = {
    ...base.scenes[0],
    sceneId: "scene-1",
    startMs: 0,
    endMs: 5000,
    layers: [layer],
  };
  return { ...base, scenes: [scene], format: { ...base.format, fps: 30 } };
}

const ref: LayerRef = { sceneId: "scene-1", layerId: "img-1" };

function makeContainer(): HTMLDivElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  el.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: 1000,
      bottom: 100,
      width: 1000,
      height: 100,
      x: 0,
      y: 0,
      toJSON() {
        return {};
      },
    }) as DOMRect;
  return el;
}

function pointerEvent(clientX: number, clientY = 10): React.PointerEvent {
  return {
    clientX,
    clientY,
    altKey: false,
    preventDefault: () => {},
  } as unknown as React.PointerEvent;
}

describe("useClipDrag", () => {
  it("starts a move gesture, emits onChange during pointermove, and closes on pointerup", () => {
    const containerRef = { current: makeContainer() };
    const onChange = vi.fn();
    const onGestureStart = vi.fn();
    const onGestureEnd = vi.fn();
    const doc = docWithLayer();

    const { result } = renderHook(() =>
      useClipDrag({
        document: doc,
        pxPerSecond: 100,
        playheadMs: 0,
        containerRef,
        getBandAtClientY: () => "background" as LayerBand,
        onChange,
        onGestureStart,
        onGestureEnd,
      }),
    );

    act(() => {
      result.current.startMove(pointerEvent(0), ref, "background", 0);
    });
    expect(onGestureStart).toHaveBeenCalledTimes(1);
    expect(result.current.isDragging).toBe(true);

    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 100, clientY: 10 }));
    });
    expect(onChange).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup"));
    });
    expect(onGestureEnd).toHaveBeenCalledTimes(1);
    expect(result.current.isDragging).toBe(false);
  });

  it("refuses to start a move gesture on a locked layer", () => {
    const containerRef = { current: makeContainer() };
    const onGestureStart = vi.fn();
    const doc = docWithLayer({ locked: true });

    const { result } = renderHook(() =>
      useClipDrag({
        document: doc,
        pxPerSecond: 100,
        playheadMs: 0,
        containerRef,
        getBandAtClientY: () => "background" as LayerBand,
        onChange: vi.fn(),
        onGestureStart,
      }),
    );

    act(() => {
      result.current.startMove(pointerEvent(0), ref, "background", 0);
    });
    expect(onGestureStart).not.toHaveBeenCalled();
    expect(result.current.isDragging).toBe(false);
  });

  it("refuses to start a resize gesture on a locked layer", () => {
    const containerRef = { current: makeContainer() };
    const onGestureStart = vi.fn();
    const doc = docWithLayer({ locked: true });

    const { result } = renderHook(() =>
      useClipDrag({
        document: doc,
        pxPerSecond: 100,
        playheadMs: 0,
        containerRef,
        getBandAtClientY: () => "background" as LayerBand,
        onChange: vi.fn(),
        onGestureStart,
      }),
    );

    act(() => {
      result.current.startResize(pointerEvent(0), ref, "end", 1000);
    });
    expect(onGestureStart).not.toHaveBeenCalled();
    expect(result.current.isDragging).toBe(false);
  });

  it("moves along time with the emitted op producing the expected startFrame (no snap in range)", () => {
    const containerRef = { current: makeContainer() };
    let latestOp: ((d: VideoProjectDocument) => VideoProjectDocument) | null = null;
    const doc = docWithLayer();

    const { result } = renderHook(() =>
      useClipDrag({
        document: doc,
        pxPerSecond: 100, // 100px == 1000ms
        playheadMs: 99999, // far away — never wins the snap
        containerRef,
        getBandAtClientY: () => "background" as LayerBand,
        onChange: (op) => {
          latestOp = op;
        },
      }),
    );

    act(() => {
      result.current.startMove(pointerEvent(0), ref, "background", 0);
    });
    act(() => {
      // 300px @ 100px/s = 3000ms — far from every snap target (scene span
      // [0,5000], playhead 99999) so the raw dragged value survives.
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 10 }));
    });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup"));
    });

    expect(latestOp).not.toBeNull();
    const nextDoc = latestOp!(doc);
    expect(nextDoc.scenes[0].layers[0].startFrame).toBe(90); // 3000ms @30fps
  });

  it("snaps to a scene boundary within tolerance", () => {
    const containerRef = { current: makeContainer() };
    let latestOp: ((d: VideoProjectDocument) => VideoProjectDocument) | null = null;
    const doc = docWithLayer();

    const { result } = renderHook(() =>
      useClipDrag({
        document: doc,
        pxPerSecond: 100,
        playheadMs: 99999,
        containerRef,
        getBandAtClientY: () => "background" as LayerBand,
        onChange: (op) => {
          latestOp = op;
        },
      }),
    );

    act(() => {
      result.current.startMove(pointerEvent(0), ref, "background", 0);
    });
    act(() => {
      // 497px -> 4970ms, within 8px (80ms) tolerance of the scene's 5000ms
      // end boundary.
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 497, clientY: 10 }));
    });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup"));
    });

    expect(result.current.snapIndicatorMs).toBeNull(); // cleared on gesture end
    const nextDoc = latestOp!(doc);
    // 5000ms is outside this document's single scene [0,5000) — moveLayer's
    // fallback clamps to the nearest scene, still landing at frame 150
    // (5000ms @30fps) relative to that scene's own startMs (0).
    expect(nextDoc.scenes[0].layers[0].startFrame).toBe(150);
  });

  /* ------------------------------------------------------------------ */
  /* Group drag — P3 §4.5 multi-select                                   */
  /* ------------------------------------------------------------------ */

  it("group drag: moves every OTHER selected clip by the SAME delta, in ONE onChange call per tick, and skips a locked member", () => {
    const containerRef = { current: makeContainer() };
    let latestOp: ((d: VideoProjectDocument) => VideoProjectDocument) | null = null;
    const onChange = vi.fn((op: (d: VideoProjectDocument) => VideoProjectDocument) => {
      latestOp = op;
    });
    const base = createDefaultDocument({});
    const layer1: RemotionLayer = {
      id: "img-1",
      type: "image",
      startFrame: 0,
      durationFrames: 30,
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 0,
      src: "https://example.com/a.png",
      fit: "cover",
    } as RemotionLayer;
    // Starts at 1000ms (frame 30 @30fps) — a group member alongside img-1.
    const layer2: RemotionLayer = { ...layer1, id: "img-2", startFrame: 30 };
    // Also selected, but locked — must be "skipped, not blocked": the rest
    // of the group still moves, this one never does.
    const layer3Locked: RemotionLayer = { ...layer1, id: "img-3", startFrame: 60, locked: true };
    const scene: Scene = {
      ...base.scenes[0],
      sceneId: "scene-1",
      startMs: 0,
      endMs: 5000,
      layers: [layer1, layer2, layer3Locked],
    };
    const doc = { ...base, scenes: [scene], format: { ...base.format, fps: 30 } };

    const selectedClipIds = new Set(["layer:scene-1:img-1", "layer:scene-1:img-2", "layer:scene-1:img-3"]);

    const { result } = renderHook(() =>
      useClipDrag({
        document: doc,
        pxPerSecond: 100,
        playheadMs: 99999,
        containerRef,
        getBandAtClientY: () => "background" as LayerBand,
        selectedClipIds,
        onChange,
      }),
    );

    act(() => {
      result.current.startMove(pointerEvent(0), { sceneId: "scene-1", layerId: "img-1" }, "background", 0);
    });
    act(() => {
      // 300px @ 100px/s = 3000ms delta for the primary clip (dragged from 0).
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 10 }));
    });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup"));
    });

    // ONE op per tick moves the whole group — never a separate onChange per
    // clip (that would defeat the single-undo-entry guarantee upstream).
    expect(onChange).toHaveBeenCalledTimes(1);

    const nextDoc = latestOp!(doc);
    const next1 = nextDoc.scenes[0].layers.find((l) => l.id === "img-1")!;
    const next2 = nextDoc.scenes[0].layers.find((l) => l.id === "img-2")!;
    const next3 = nextDoc.scenes[0].layers.find((l) => l.id === "img-3")!;
    expect(next1.startFrame).toBe(90); // 3000ms @30fps
    // img-2 started at frame 30 (1000ms); +3000ms delta -> 4000ms = frame 120.
    expect(next2.startFrame).toBe(120);
    // The locked member never moved.
    expect(next3.startFrame).toBe(60);
  });

  it("a single-clip drag (selection has only the dragged clip) never pulls in other clips", () => {
    const containerRef = { current: makeContainer() };
    let latestOp: ((d: VideoProjectDocument) => VideoProjectDocument) | null = null;
    const base = createDefaultDocument({});
    const layer1: RemotionLayer = {
      id: "img-1",
      type: "image",
      startFrame: 0,
      durationFrames: 30,
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 0,
      src: "https://example.com/a.png",
      fit: "cover",
    } as RemotionLayer;
    const layer2: RemotionLayer = { ...layer1, id: "img-2", startFrame: 30 };
    const scene: Scene = {
      ...base.scenes[0],
      sceneId: "scene-1",
      startMs: 0,
      endMs: 5000,
      layers: [layer1, layer2],
    };
    const doc = { ...base, scenes: [scene], format: { ...base.format, fps: 30 } };

    // Only ONE clip selected — not a group drag even though other clips exist.
    const selectedClipIds = new Set(["layer:scene-1:img-1"]);

    const { result } = renderHook(() =>
      useClipDrag({
        document: doc,
        pxPerSecond: 100,
        playheadMs: 99999,
        containerRef,
        getBandAtClientY: () => "background" as LayerBand,
        selectedClipIds,
        onChange: (op) => {
          latestOp = op;
        },
      }),
    );

    act(() => {
      result.current.startMove(pointerEvent(0), { sceneId: "scene-1", layerId: "img-1" }, "background", 0);
    });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 10 }));
    });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup"));
    });

    const nextDoc = latestOp!(doc);
    expect(nextDoc.scenes[0].layers.find((l) => l.id === "img-1")!.startFrame).toBe(90);
    // img-2 untouched — it was never part of a group.
    expect(nextDoc.scenes[0].layers.find((l) => l.id === "img-2")!.startFrame).toBe(30);
  });
});
