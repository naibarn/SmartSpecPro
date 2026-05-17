/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import PreviewPlayer from "../PreviewPlayer";

function renderPlayer() {
  return render(
    <PreviewPlayer
      currentTime={0}
      duration={20}
      isPlaying={false}
      onTimeChange={vi.fn()}
      onPlayPause={vi.fn()}
      onStop={vi.fn()}
      previewVideoUrl="/test-video.mp4"
    />,
  );
}

describe("PreviewPlayer render preview mode", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts in free preview mode so zoom is adjustable by default", () => {
    const { container, getByRole, getByText } = renderPlayer();

    const zoomSelect = getByRole("combobox") as HTMLSelectElement;
    const stage = container.querySelector(".preview-video-stage");
    expect(zoomSelect.disabled).toBe(false);
    expect(stage?.classList.contains("free-preview")).toBe(true);
    expect(
      getByText(/Space: Play\/Pause \| F: Fullscreen \| Left\/Right: Frame Step/),
    ).toBeTruthy();
  });

  it("can switch to preview lock mode which pins viewport zoom/pan", () => {
    const { container, getByRole } = renderPlayer();

    const renderToggle = getByRole("button", { name: "Toggle preview lock mode" });
    const zoomSelect = getByRole("combobox") as HTMLSelectElement;
    const stage = container.querySelector(".preview-video-stage");
    expect(zoomSelect.disabled).toBe(false);
    expect(stage?.classList.contains("free-preview")).toBe(true);

    fireEvent.click(renderToggle);
    expect(zoomSelect.disabled).toBe(true);
    expect(stage?.classList.contains("free-preview")).toBe(false);
  });

  it("keeps the final render frame guide hidden until toggled", async () => {
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 800,
      height: 600,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    try {
      const { container, getByRole, queryByText, findByText } = renderPlayer();

      expect(queryByText(/กรอบเหลือง = FINAL RENDER/)).toBeNull();
      expect(container.querySelector(".output-frame-guide")).toBeNull();

      fireEvent.click(getByRole("button", { name: "Toggle final render frame guide" }));

      expect(await findByText(/กรอบเหลือง = FINAL RENDER/)).toBeTruthy();
      expect(container.querySelector(".output-frame-guide")).toBeTruthy();
    } finally {
      rectSpy.mockRestore();
    }
  });
});
