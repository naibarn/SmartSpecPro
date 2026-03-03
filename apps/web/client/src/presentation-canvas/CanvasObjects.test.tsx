import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { CanvasObjects } from "./CanvasObjects";

describe("CanvasObjects SVG rendering", () => {
  const noop = vi.fn();

  function renderCanvas(elements: any[]) {
    return render(
      <CanvasObjects
        elements={elements}
        selectedElementIds={[]}
        onSelectElement={noop}
        onMoveSelection={noop}
        onResizeSelection={noop}
        onRotateSelection={noop}
        interactionScale={1}
        canvasWidth={1920}
        canvasHeight={1080}
      />,
    );
  }

  it("renders a bounded placeholder when inline svg markup is invalid", () => {
    renderCanvas([
      {
        id: "svg-invalid",
        type: "image",
        x: 20,
        y: 20,
        width: 320,
        height: 220,
        src: "",
        alt: "Broken SVG",
        svgContent: "not-valid-svg",
      },
    ]);

    expect(screen.getByTestId("canvas-svg-placeholder-svg-invalid")).toBeInTheDocument();
  });

  it("keeps .svg file sources renderable as image elements", () => {
    renderCanvas([
      {
        id: "svg-file",
        type: "image",
        x: 20,
        y: 20,
        width: 320,
        height: 220,
        src: "uploads/icons/logo.svg",
        alt: "SVG file",
      },
    ]);

    const image = screen.getByTestId("canvas-image-svg-file");
    expect(image).toHaveAttribute("src", expect.stringContaining("/uploads/icons/logo.svg"));
  });
});
