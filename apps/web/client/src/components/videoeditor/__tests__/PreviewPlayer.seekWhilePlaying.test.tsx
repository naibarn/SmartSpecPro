/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import PreviewPlayer from "../PreviewPlayer";

describe("PreviewPlayer seek while playing", () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(
      () => Promise.resolve(),
    );
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderPlayer(allowSeekingWhilePlaying: boolean, currentTime = 0) {
    const onTimeChange = vi.fn();
    const onPlayPause = vi.fn();
    const onStop = vi.fn();

    return render(
      <PreviewPlayer
        currentTime={currentTime}
        duration={20}
        isPlaying={true}
        onTimeChange={onTimeChange}
        onPlayPause={onPlayPause}
        onStop={onStop}
        previewVideoUrl="/test-video.mp4"
        allowSeekingWhilePlaying={allowSeekingWhilePlaying}
      />,
    );
  }

  it("seeks while playing when allowSeekingWhilePlaying is true", async () => {
    const { container, rerender } = renderPlayer(true, 0);
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video).toBeTruthy();

    fireEvent.loadedData(video);

    rerender(
      <PreviewPlayer
        currentTime={5}
        duration={20}
        isPlaying={true}
        onTimeChange={vi.fn()}
        onPlayPause={vi.fn()}
        onStop={vi.fn()}
        previewVideoUrl="/test-video.mp4"
        allowSeekingWhilePlaying={true}
      />,
    );

    await waitFor(() => {
      expect(video.currentTime).toBeCloseTo(5, 3);
    });
  });

  it("does not seek while playing when allowSeekingWhilePlaying is false", async () => {
    const { container, rerender } = renderPlayer(false, 0);
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video).toBeTruthy();

    fireEvent.loadedData(video);

    rerender(
      <PreviewPlayer
        currentTime={5}
        duration={20}
        isPlaying={true}
        onTimeChange={vi.fn()}
        onPlayPause={vi.fn()}
        onStop={vi.fn()}
        previewVideoUrl="/test-video.mp4"
        allowSeekingWhilePlaying={false}
      />,
    );

    await waitFor(() => {
      expect(video.currentTime).toBeCloseTo(0, 3);
    });
  });
});

