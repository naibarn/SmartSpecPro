import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { CanvasStage } from "./CanvasStage";
import { DEFAULT_PRESENTATION_CANVAS_SIZE } from "./constants";

function StageHarness(props: {
  scale?: number;
}) {
  const [viewport, setViewport] = useState({
    scale: props.scale ?? 1.5,
    offsetX: 0,
    offsetY: 0,
  });

  return (
    <div style={{ width: 1280, height: 860 }}>
      <CanvasStage
        elements={[]}
        canvasSize={DEFAULT_PRESENTATION_CANVAS_SIZE}
        selectedElementIds={[]}
        snapGuides={[]}
        viewport={viewport}
        onViewportChange={setViewport}
        onSelectElement={vi.fn()}
        onMoveSelection={vi.fn()}
        onResizeSelection={vi.fn()}
        onRotateSelection={vi.fn()}
        onArrangeSelection={vi.fn()}
        onMarqueeSelect={vi.fn()}
      />
    </div>
  );
}

describe("CanvasStage interactions", () => {
  it("keeps middle-button pan active across rerenders while zoomed in", () => {
    render(<StageHarness scale={1.5} />);

    const layer = screen.getByTestId("canvas-stage-layer-content");
    fireEvent.pointerDown(layer, {
      button: 1,
      buttons: 4,
      pointerId: 11,
      clientX: 400,
      clientY: 260,
    });
    fireEvent.pointerMove(window, {
      pointerId: 11,
      clientX: 340,
      clientY: 220,
    });

    expect(screen.getByTestId("canvas-stage-viewport").textContent).toContain("(-60, -40)");

    fireEvent.pointerMove(window, {
      pointerId: 11,
      clientX: 280,
      clientY: 180,
    });

    expect(screen.getByTestId("canvas-stage-viewport").textContent).toContain("(-120, -80)");

    fireEvent.pointerUp(window, { pointerId: 11 });
  });
});
