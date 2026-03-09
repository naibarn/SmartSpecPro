import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { CanvasObjects } from "./CanvasObjects";

describe("CanvasObjects SVG rendering", () => {
  const noop = vi.fn();

  function renderCanvas(elements: any[], options?: { autoPlayVideos?: boolean; mediaMotionTiming?: { elapsedMs: number; slideDurationMs: number } }) {
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
        mediaMotionTiming={options?.mediaMotionTiming}
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

  it("applies shared diagonal motion transform to image elements", () => {
    renderCanvas(
      [
        {
          id: "img-motion-1",
          type: "image",
          x: 20,
          y: 20,
          width: 320,
          height: 220,
          src: "/uploads/images/demo.png",
          alt: "Motion image",
          imageZoom: 1,
          mediaMotion: {
            preset: "pan-up-right",
            intensity: 1,
            easing: "linear",
          },
        },
      ],
      { mediaMotionTiming: { elapsedMs: 1500, slideDurationMs: 3000 } },
    );

    const image = screen.getByTestId("canvas-image-img-motion-1");
    expect(image).toHaveStyle({
      transformOrigin: "50% 50%",
    });
    expect((image as HTMLImageElement).style.transform).toContain("translate(6%, -6%)");
    expect((image as HTMLImageElement).style.transform).toContain("scale(");
  });

  it("applies motion transforms to valid inline svg image elements", () => {
    renderCanvas(
      [
        {
          id: "svg-motion-1",
          type: "image",
          x: 20,
          y: 20,
          width: 320,
          height: 220,
          src: "",
          svgColor: "#22c55e",
          svgContent: "<svg viewBox='0 0 10 10'><rect width='10' height='10' fill='currentColor' /></svg>",
          imageZoom: 1,
          mediaMotion: {
            preset: "pan-down-left",
            intensity: 1,
            easing: "linear",
          },
        },
      ],
      { mediaMotionTiming: { elapsedMs: 1500, slideDurationMs: 3000 } },
    );

    const svg = screen.getByTestId("canvas-inline-svg-svg-motion-1");
    expect(svg).toHaveStyle({
      transformOrigin: "50% 50%",
    });
    expect((svg as HTMLDivElement).style.transform).toContain("translate(-6%, 6%)");
    expect((svg as HTMLDivElement).style.transform).toContain("scale(");
  });

  it("uses Thai-safe text metrics in text elements to avoid clipped lower diacritics", () => {
    renderCanvas([
      {
        id: "thai-text-1",
        type: "text",
        x: 20,
        y: 20,
        width: 360,
        height: 200,
        text: "ทดสอบสระอู อู อุ",
        lineHeight: 1.1,
      },
    ]);

    const paragraph = screen.getByTitle("ทดสอบสระอู อู อุ");
    expect(paragraph).toHaveStyle({
      lineHeight: "1.5",
      paddingTop: "0.2em",
      paddingBottom: "0.48em",
    });
    expect(paragraph.parentElement).toHaveClass("overflow-visible");
  });
});
