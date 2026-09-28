import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { PresentationElement } from "@/lib/presentationEditorState";
import { CanvasStage, getCanvasZoomFromWheel, normalizeCanvasWheelDelta } from "./CanvasStage";
import { DEFAULT_PRESENTATION_CANVAS_SIZE } from "./constants";

function StageHarness(props: {
  scale?: number;
  elements?: PresentationElement[];
  panMode?: boolean;
  onPanModeChange?: (active: boolean) => void;
}) {
  const [viewport, setViewport] = useState({
    scale: props.scale ?? 1.5,
    offsetX: 0,
    offsetY: 0,
  });

  return (
    <div style={{ width: 1280, height: 860 }}>
      <CanvasStage
        elements={props.elements ?? []}
        canvasSize={DEFAULT_PRESENTATION_CANVAS_SIZE}
        selectedElementIds={[]}
        snapGuides={[]}
        viewport={viewport}
        onViewportChange={setViewport}
        showZoomStepControls
        panMode={props.panMode}
        onPanModeChange={props.onPanModeChange}
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
  it("zooms from ordinary wheel scrolling and supports modifier wheel events", () => {
    render(<StageHarness scale={1.5} />);

    const canvas = screen.getByLabelText("Canvas workspace");
    fireEvent.wheel(canvas, {
      deltaY: -100,
      clientX: 400,
      clientY: 260,
    });
    expect(screen.getByTestId("canvas-stage-viewport").textContent).toContain("1.66x");

    fireEvent.wheel(canvas, {
      deltaY: -100,
      ctrlKey: true,
      clientX: 400,
      clientY: 260,
    });
    expect(screen.getByTestId("canvas-stage-viewport").textContent).toContain("1.83x");
  });

  it("provides step zoom controls when enabled for tablet-sized layouts", () => {
    render(<StageHarness scale={1} />);

    fireEvent.click(screen.getByRole("button", { name: "Increase canvas zoom" }));
    expect(screen.getByTestId("canvas-stage-viewport").textContent).toContain("1.10x");

    fireEvent.click(screen.getByRole("button", { name: "Decrease canvas zoom" }));
    expect(screen.getByTestId("canvas-stage-viewport").textContent).toContain("1.00x");
  });

  it("normalizes wheel units and clamps zoom to the canvas range", () => {
    expect(normalizeCanvasWheelDelta(3, 1)).toBe(48);
    expect(normalizeCanvasWheelDelta(1, 2, 900)).toBe(240);
    expect(getCanvasZoomFromWheel(1, -100)).toBe(1.105);
    expect(getCanvasZoomFromWheel(3, -100)).toBe(3);
    expect(getCanvasZoomFromWheel(0.25, 100)).toBe(0.25);
  });

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

  it("pans instead of moving a full-canvas image, then fits back to the default view", () => {
    render(
      <StageHarness
        scale={1.5}
        elements={[{
          id: "full-canvas-image",
          type: "image",
          x: 0,
          y: 0,
          width: DEFAULT_PRESENTATION_CANVAS_SIZE.width,
          height: DEFAULT_PRESENTATION_CANVAS_SIZE.height,
          src: "https://cdn.example.com/full-slide.png",
          alt: "Full slide",
        }]}
      />,
    );

    const image = screen.getByRole("button", { name: /select canvas element 1/i });
    fireEvent.pointerDown(image, {
      button: 0,
      pointerId: 21,
      clientX: 400,
      clientY: 260,
    });
    fireEvent.pointerMove(window, {
      pointerId: 21,
      clientX: 340,
      clientY: 220,
    });
    expect(screen.getByTestId("canvas-stage-viewport").textContent).toContain("(-60, -40)");
    expect(image).toHaveStyle({ left: "0%", top: "0%" });

    fireEvent.click(screen.getByRole("button", { name: "Fit Canvas to View" }));
    expect(screen.getByTestId("canvas-stage-viewport").textContent).toContain("1.00x (0, 0)");
  });

  it("uses explicit Pan Mode to pan over any object without moving the object", () => {
    render(
      <StageHarness
        scale={1.5}
        panMode
        onPanModeChange={vi.fn()}
        elements={[{
          id: "editable-image",
          type: "image",
          x: 120,
          y: 180,
          width: 420,
          height: 300,
          src: "https://cdn.example.com/image.png",
          alt: "Editable image",
        }]}
      />,
    );

    const image = screen.getByRole("button", { name: /select canvas element 1/i });
    fireEvent.pointerDown(image, {
      button: 0,
      pointerId: 31,
      clientX: 400,
      clientY: 260,
    });
    fireEvent.pointerMove(window, {
      pointerId: 31,
      clientX: 340,
      clientY: 220,
    });

    expect(screen.getByTestId("canvas-stage-viewport").textContent).toContain("(-60, -40)");
    expect(screen.getByRole("button", { name: "Exit Pan Mode" })).toHaveAttribute("aria-pressed", "true");
    expect(image.style.left).toContain("16.666");
    expect(image).toHaveStyle({ top: "14.0625%" });
  });
});
