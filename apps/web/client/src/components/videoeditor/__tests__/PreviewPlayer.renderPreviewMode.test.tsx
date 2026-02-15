/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
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
});
