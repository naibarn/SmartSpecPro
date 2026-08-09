/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createDefaultDocument } from "../createDefaultDocument";
import { useTimelineHistory } from "../useTimelineHistory";
import { moveLayer, setLayerLocked, type LayerRef } from "../timelineEdits";
import type { Scene, VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";
import type { RemotionLayer } from "@shared/remotion/layerTemplateSchemas";

function docWithOneLayer(): VideoProjectDocument {
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
  };
  const scene: Scene = { ...base.scenes[0], layers: [layer] };
  return { ...base, scenes: [scene] };
}

const ref: LayerRef = { sceneId: "scene-1", layerId: "img-1" };

describe("useTimelineHistory", () => {
  it("undo/redo round-trips a discrete edit", () => {
    const { result } = renderHook(() => useTimelineHistory(docWithOneLayer()));

    act(() => {
      result.current.apply((doc) => moveLayer(doc, ref, 2000));
    });
    expect(result.current.document.scenes[0].layers[0].startFrame).toBe(60);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);

    act(() => {
      result.current.undo();
    });
    expect(result.current.document.scenes[0].layers[0].startFrame).toBe(0);
    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.redo();
    });
    expect(result.current.document.scenes[0].layers[0].startFrame).toBe(60);
  });

  it("a whole drag gesture (beginGesture..apply*..endGesture) collapses into ONE undo step", () => {
    const { result } = renderHook(() => useTimelineHistory(docWithOneLayer()));

    act(() => {
      result.current.beginGesture("drag-1");
      result.current.apply((doc) => moveLayer(doc, ref, 500));
      result.current.apply((doc) => moveLayer(doc, ref, 1000));
      result.current.apply((doc) => moveLayer(doc, ref, 1500));
      result.current.endGesture();
    });

    expect(result.current.document.scenes[0].layers[0].startFrame).toBe(45); // 1500ms @30fps

    act(() => {
      result.current.undo();
    });
    // ONE undo step returns all the way to the pre-gesture state, not just
    // the last intermediate move.
    expect(result.current.document.scenes[0].layers[0].startFrame).toBe(0);
    expect(result.current.canUndo).toBe(false);
  });

  it("a discrete apply() after a gesture ends does NOT merge into the closed gesture", () => {
    const { result } = renderHook(() => useTimelineHistory(docWithOneLayer()));

    act(() => {
      result.current.beginGesture("drag-1");
      result.current.apply((doc) => moveLayer(doc, ref, 500));
      result.current.endGesture();
    });
    act(() => {
      result.current.apply((doc) => moveLayer(doc, ref, 900));
    });

    // Two separate undo steps.
    act(() => {
      result.current.undo();
    });
    expect(result.current.document.scenes[0].layers[0].startFrame).toBe(15); // 500ms @30fps
    act(() => {
      result.current.undo();
    });
    expect(result.current.document.scenes[0].layers[0].startFrame).toBe(0);
  });

  it("applyWithoutUndo never creates an undo entry", () => {
    const { result } = renderHook(() => useTimelineHistory(docWithOneLayer()));
    act(() => {
      result.current.applyWithoutUndo((doc) => setLayerLocked(doc, ref, true));
    });
    expect(result.current.document.scenes[0].layers[0].locked).toBe(true);
    expect(result.current.canUndo).toBe(false);
  });

  it("supports at least 50 undo levels", () => {
    const { result } = renderHook(() => useTimelineHistory(docWithOneLayer()));
    act(() => {
      for (let i = 1; i <= 60; i++) {
        result.current.apply((doc) => moveLayer(doc, ref, i * 10));
      }
    });
    // Each `undo()` call is its own `act()` so `result.current` reflects the
    // updated `canUndo` before the next loop check — batching every call
    // into one `act()` would leave the loop condition stale (the underlying
    // `CommandBus` state changes synchronously, but this hook's `canUndo`
    // read is only fresh on the next completed render).
    let undoCount = 0;
    for (let i = 0; i < 70 && result.current.canUndo; i++) {
      act(() => {
        result.current.undo();
      });
      undoCount += 1;
    }
    expect(undoCount).toBe(60);
    expect(result.current.document.scenes[0].layers[0].startFrame).toBe(0);
  });
});
