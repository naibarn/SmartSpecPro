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
  it("enables frame-accurate render preview by default", () => {
    const { container, getByRole, getByText } = renderPlayer();

    const zoomSelect = getByRole("combobox") as HTMLSelectElement;
    const stage = container.querySelector(".preview-video-stage");
    expect(zoomSelect.disabled).toBe(true);
    expect(stage?.classList.contains("free-preview")).toBe(false);
    expect(
      getByText(/Preview Lock ON: frame-accurate view \(viewport pan\/zoom disabled\)/),
    ).toBeTruthy();
  });

  it("allows free viewport zoom/pan when render preview is toggled off", () => {
    const { container, getByRole } = renderPlayer();

    const renderToggle = getByRole("button", { name: "Toggle preview lock mode" });
    const zoomSelect = getByRole("combobox") as HTMLSelectElement;
    const stage = container.querySelector(".preview-video-stage");
    expect(zoomSelect.disabled).toBe(true);
    expect(stage?.classList.contains("free-preview")).toBe(false);

    fireEvent.click(renderToggle);
    expect(zoomSelect.disabled).toBe(false);
    expect(stage?.classList.contains("free-preview")).toBe(true);
  });
});
