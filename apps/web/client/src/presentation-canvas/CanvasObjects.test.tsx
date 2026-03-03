import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { CanvasObjects } from "./CanvasObjects";

describe("CanvasObjects SVG rendering", () => {
  const noop = vi.fn();

  function renderCanvas(elements: any[], options?: { autoPlayVideos?: boolean }) {
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
        autoPlayVideos={options?.autoPlayVideos}
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

  it("keeps muted autoplay flow resilient when play() is blocked", async () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => {
      return Promise.reject(new Error("autoplay blocked"));
    });

    const { container } = renderCanvas(
      [
        {
          id: "vid-1",
          type: "video",
          x: 20,
          y: 20,
          width: 320,
          height: 220,
          src: "/uploads/videos/demo.mp4",
          title: "Demo clip",
          muted: true,
        },
      ],
      { autoPlayVideos: true },
    );

    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    fireEvent.canPlay(video as HTMLVideoElement);
    await Promise.resolve();

    expect(playSpy).toHaveBeenCalled();
    playSpy.mockRestore();
  });
});
