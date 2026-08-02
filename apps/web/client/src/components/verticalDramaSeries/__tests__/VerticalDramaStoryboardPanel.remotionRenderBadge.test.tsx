/**
 * `planning/vd-remotion-render-option/plan.md` wave 2 coverage for
 * `VerticalDramaStoryboardPanel.tsx`'s whole-episode compiled-video card:
 * a small "Remotion" outline badge shows next to the compiled video result
 * whenever `compiledVideo.renderEngine === "remotion_queue"`, and no badge
 * shows for the ffmpeg default (absent/`"ffmpeg"`). Mirrors
 * `VerticalDramaStoryboardPanel.modelFamilyBadge.test.tsx`'s minimal
 * render/screen convention.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VerticalDramaStoryboardPanel } from "@/components/verticalDramaSeries/VerticalDramaStoryboardPanel";

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    locale: "th" as const,
    storyboard: {
      shots: [{ shot_number: 1, visual_description: "test", characters: [] }],
    },
    startFramePlan: { frames: [{ shotNumber: 1, imagePrompt: "a prompt" }] },
    loading: false,
    onAssembleCompiledVideo: vi.fn(),
    ...overrides,
  };
}

describe("VerticalDramaStoryboardPanel — Remotion render badge (planning/vd-remotion-render-option/plan.md wave 2)", () => {
  it("shows the Remotion badge when compiledVideo.renderEngine is 'remotion_queue'", async () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          compiledVideo: {
            status: "completed",
            videoUrl: "https://cdn.example.com/ep.mp4",
            renderEngine: "remotion_queue",
          },
        }) as any)}
      />
    );
    const badge = await screen.findByTestId(
      "vd-compiled-video-remotion-badge"
    );
    expect(badge).toHaveTextContent("Remotion");
  });

  it("shows no Remotion badge when renderEngine is 'ffmpeg'", async () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          compiledVideo: {
            status: "completed",
            videoUrl: "https://cdn.example.com/ep.mp4",
            renderEngine: "ffmpeg",
          },
        }) as any)}
      />
    );
    await screen.findByTestId("vd-compiled-video-download");
    expect(
      screen.queryByTestId("vd-compiled-video-remotion-badge")
    ).not.toBeInTheDocument();
  });

  it("shows no Remotion badge when renderEngine is absent (legacy compiled video)", async () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          compiledVideo: {
            status: "completed",
            videoUrl: "https://cdn.example.com/ep.mp4",
          },
        }) as any)}
      />
    );
    await screen.findByTestId("vd-compiled-video-download");
    expect(
      screen.queryByTestId("vd-compiled-video-remotion-badge")
    ).not.toBeInTheDocument();
  });
});
